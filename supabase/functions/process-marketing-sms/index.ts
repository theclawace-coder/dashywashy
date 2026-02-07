import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const dialpadToken = Deno.env.get("DIALPAD_API_KEY") || "";
const dialpadUserId = Deno.env.get("DIALPAD_USER_ID") || "6452247499866112";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

function personalize(text: string, name?: string | null): string {
  if (!text) return "";
  return text.replace(/{{\s*name\s*}}/gi, name?.trim() || "there");
}

function calculateNextSendTime(step: number, startedAt: Date): Date | null {
  if (step >= 7) return null;
  const smsDelays = [0, 3, 7, 14, 14, 30, 30];
  let totalDays = 0;
  for (let i = 0; i <= step; i++) {
    totalDays += smsDelays[i] || 0;
  }
  return new Date(startedAt.getTime() + totalDays * 24 * 60 * 60 * 1000);
}

async function sendSMS(phoneNumber: string, message: string) {
  if (!dialpadToken) {
    return { success: false, error: "DIALPAD_API_KEY not configured" };
  }

  try {
    const response = await fetch("https://dialpad.com/api/v2/sms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${dialpadToken}`,
      },
      body: JSON.stringify({
        infer_country_code: false,
        to_numbers: [phoneNumber],
        user_id: dialpadUserId,
        text: message.trim(),
      }),
    });

    const textBody = await response.text();
    let parsed: any = null;
    try {
      parsed = textBody ? JSON.parse(textBody) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok || parsed?.error) {
      return { success: false, error: parsed?.error || textBody || `HTTP ${response.status}` };
    }

    return { success: true, messageId: parsed?.message_id || parsed?.id || "unknown" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const now = new Date();
  const nowIso = now.toISOString();
  const lockId = `sms-${Date.now()}`;

  try {
    const { data: journeys, error } = await supabase
      .from("marketing_sms_journeys")
      .select("id, lead_id, org_id, current_step, started_at, next_send_at")
      .eq("status", "active")
      .lte("next_send_at", nowIso)
      .is("locked_at", null)
      .limit(50);

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    if (!journeys || journeys.length === 0) {
      return jsonResponse({ success: true, processed: 0 });
    }

    const journeyIds = journeys.map((j) => j.id);
    const orgIds = Array.from(new Set(journeys.map((j) => j.org_id).filter(Boolean)));
    const enabledByOrg = new Map<string, boolean>();

    if (orgIds.length > 0) {
      const { data: automationRows } = await supabase
        .from("organization_automation_settings")
        .select("org_id, enabled")
        .in("org_id", orgIds)
        .eq("automation_type", "marketing_sms");

      (automationRows || []).forEach((row: any) => {
        enabledByOrg.set(row.org_id, row.enabled ?? true);
      });
    }
    await supabase
      .from("marketing_sms_journeys")
      .update({ locked_at: nowIso, locked_by: lockId })
      .in("id", journeyIds);

    let processed = 0;
    for (const journey of journeys) {
      const enabled = journey.org_id ? (enabledByOrg.get(journey.org_id) ?? true) : true;
      if (!enabled) {
        await supabase
          .from("marketing_sms_journeys")
          .update({
            status: "paused",
            last_error: "automation_disabled",
            locked_at: null,
            locked_by: null,
            updated_at: nowIso,
          })
          .eq("id", journey.id);
        continue;
      }
      try {
        const { data: lead } = await supabase
          .from("extracted_leads")
          .select("id, name, phone_number")
          .eq("id", journey.lead_id)
          .maybeSingle();

        if (!lead || !lead.phone_number) {
          await supabase
            .from("marketing_sms_journeys")
            .update({
              status: "cancelled",
              cancelled_at: nowIso,
              last_error: "Lead has no phone number",
              locked_at: null,
              locked_by: null,
              updated_at: nowIso,
            })
            .eq("id", journey.id);
          continue;
        }

        const { data: template } = await supabase
          .from("marketing_sms_templates")
          .select("id, body")
          .eq("step", journey.current_step)
          .eq("is_default", true)
          .maybeSingle();

        if (!template) {
          await supabase
            .from("marketing_sms_journeys")
            .update({
              last_error: `No template found for step ${journey.current_step}`,
              locked_at: null,
              locked_by: null,
              updated_at: nowIso,
            })
            .eq("id", journey.id);
          continue;
        }

        const personalizedBody = personalize(template.body, lead.name);
        const sendResult = await sendSMS(lead.phone_number, personalizedBody);

        await supabase.from("marketing_sms_logs").insert({
          journey_id: journey.id,
          lead_id: journey.lead_id,
          template_id: template.id,
          step: journey.current_step,
          sent_at: nowIso,
          status: sendResult.success ? "sent" : "failed",
          error: sendResult.success ? null : sendResult.error,
          message_id: sendResult.success ? sendResult.messageId : null,
        });

        if (!sendResult.success) {
          await supabase
            .from("marketing_sms_journeys")
            .update({
              last_error: sendResult.error || "SMS failed",
              locked_at: null,
              locked_by: null,
              updated_at: nowIso,
            })
            .eq("id", journey.id);
          continue;
        }

        const nextStep = journey.current_step + 1;
        const completed = nextStep > 7;
        const nextSend = completed ? null : calculateNextSendTime(nextStep, new Date(journey.started_at));

        await supabase
          .from("marketing_sms_journeys")
          .update({
            current_step: Math.min(nextStep, 7),
            next_send_at: nextSend ? nextSend.toISOString() : null,
            status: completed ? "completed" : "active",
            completed_at: completed ? nowIso : null,
            last_error: null,
            locked_at: null,
            locked_by: null,
            updated_at: nowIso,
          })
          .eq("id", journey.id);

        processed += 1;
      } catch (err) {
        await supabase
          .from("marketing_sms_journeys")
          .update({
            last_error: err instanceof Error ? err.message : "Unknown error",
            locked_at: null,
            locked_by: null,
            updated_at: nowIso,
          })
          .eq("id", journey.id);
      }
    }

    return jsonResponse({ success: true, processed });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
