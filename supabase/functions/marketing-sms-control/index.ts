import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { resolveOrgFromRequest, getOrgIntegration, corsHeaders, jsonResponse, jsonError } from '../_shared/org-resolver.ts'

function calculateNextSendTime(step: number, startedAt: Date): Date {
  const smsDelays = [0, 3, 7, 14, 14, 30, 30];
  let totalDays = 0;
  for (let i = 0; i < step; i++) {
    totalDays += smsDelays[i] || 0;
  }
  return new Date(startedAt.getTime() + totalDays * 24 * 60 * 60 * 1000);
}

function personalize(text: string, name?: string | null): string {
  if (!text) return "";
  return text.replace(/{{\s*name\s*}}/gi, name?.trim() || "there");
}

async function sendSMS(phoneNumber: string, message: string, dialpadToken: string, dialpadUserId: string) {
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
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  try {
  const { orgId, supabaseAdmin } = await resolveOrgFromRequest(req)
  const dialpadConfig = await getOrgIntegration(supabaseAdmin, orgId, 'dialpad')
  const dialpadToken = dialpadConfig.api_key || ''
  const dialpadUserId = dialpadConfig.user_id || '6452247499866112'

  const supabase = supabaseAdmin;

  let payload: { action?: string; leadId?: string; step?: number } = {};
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { action, leadId, step } = payload;
  if (!action || !leadId) {
    return jsonResponse({ error: "action and leadId are required" }, 400);
  }

  const now = new Date();
  const nowIso = now.toISOString();

  if (action === "start") {
    const { data: existing } = await supabase
      .from("marketing_sms_journeys")
      .select("id")
      .eq("lead_id", leadId)
      .maybeSingle();

    const nextSend = calculateNextSendTime(step || 1, now);
    const updatePayload = {
      status: "active",
      current_step: step || 1,
      next_send_at: nextSend.toISOString(),
      started_at: nowIso,
      completed_at: null,
      cancelled_at: null,
      last_error: null,
      updated_at: nowIso,
    };

    const { error } = existing
      ? await supabase.from("marketing_sms_journeys").update(updatePayload).eq("id", existing.id)
      : await supabase.from("marketing_sms_journeys").insert({ ...updatePayload, lead_id: leadId });

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({ success: true });
  }

  if (action === "pause") {
    const { error } = await supabase
      .from("marketing_sms_journeys")
      .update({ status: "paused", updated_at: nowIso })
      .eq("lead_id", leadId)
      .eq("status", "active");

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({ success: true });
  }

  if (action === "resume") {
    const { error } = await supabase
      .from("marketing_sms_journeys")
      .update({ status: "active", updated_at: nowIso })
      .eq("lead_id", leadId)
      .eq("status", "paused");

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({ success: true });
  }

  if (action === "cancel") {
    const { error } = await supabase
      .from("marketing_sms_journeys")
      .update({ status: "cancelled", cancelled_at: nowIso, updated_at: nowIso })
      .eq("lead_id", leadId);

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({ success: true });
  }

  if (action === "send_now") {
    const { data: journey } = await supabase
      .from("marketing_sms_journeys")
      .select("id, current_step, started_at, status")
      .eq("lead_id", leadId)
      .maybeSingle();

    if (!journey || journey.status !== "active") {
      return jsonResponse({ error: "SMS journey is not active" }, 400);
    }

    const { data: lead } = await supabase
      .from("extracted_leads")
      .select("id, name, phone_number")
      .eq("id", leadId)
      .maybeSingle();

    if (!lead?.phone_number) {
      return jsonResponse({ error: "Lead has no phone number" }, 400);
    }

    const { data: template } = await supabase
      .from("marketing_sms_templates")
      .select("id, body")
      .eq("step", journey.current_step)
      .eq("is_default", true)
      .maybeSingle();

    if (!template) {
      return jsonResponse({ error: "No SMS template for this step" }, 404);
    }

    const body = personalize(template.body, lead.name);
    const sendResult = await sendSMS(lead.phone_number, body, dialpadToken, dialpadUserId);

    await supabase.from("marketing_sms_logs").insert({
      journey_id: journey.id,
      lead_id: leadId,
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
        .update({ last_error: sendResult.error || "Failed to send", updated_at: nowIso })
        .eq("id", journey.id);
      return jsonResponse({ success: false, error: sendResult.error }, 500);
    }

    const nextStep = journey.current_step + 1;
    const completed = nextStep > 7;
    const nextSend = completed ? null : calculateNextSendTime(nextStep, new Date(journey.started_at));

    await supabase
      .from("marketing_sms_journeys")
      .update({
        current_step: Math.min(nextStep, 7),
        next_send_at: nextSend ? nextSend.toISOString() : null,
        completed_at: completed ? nowIso : null,
        status: completed ? "completed" : "active",
        updated_at: nowIso,
        last_error: null,
      })
      .eq("id", journey.id);

    return jsonResponse({ success: true, message_id: sendResult.messageId });
  }

  return jsonError("Invalid action", 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    const status = message === 'Unauthorized' ? 401 : 500;
    return jsonError(message, status);
  }
});
