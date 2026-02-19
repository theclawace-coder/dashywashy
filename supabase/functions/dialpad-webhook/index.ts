import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function resolveOrgFromDialpadWebhook(supabase: ReturnType<typeof createClient>, payload: any): Promise<string | null> {
  // Try to find org by matching dialpad user_id in organization_integrations
  const userId = payload?.data?.user_id || payload?.user_id || payload?.call?.user_id || payload?.sms?.user_id || null
  if (userId) {
    const { data } = await supabase
      .from('organization_integrations')
      .select('org_id')
      .eq('provider', 'dialpad')
      .eq('enabled', true)
      .filter('config->>user_id', 'eq', String(userId))
      .maybeSingle()
    if (data?.org_id) return data.org_id
  }

  // Fall back to first enabled dialpad integration
  const { data: fallback } = await supabase
    .from('organization_integrations')
    .select('org_id')
    .eq('provider', 'dialpad')
    .eq('enabled', true)
    .limit(1)
    .maybeSingle()
  return fallback?.org_id || null
}

function detectEventType(payload: any): string {
  // Dialpad uses 'state' for call events (e.g. "hangup", "ringing", "connected")
  if (payload?.state && payload?.call_id) {
    return `call.${payload.state}`;
  }
  // SMS payloads have 'text' and 'from_number' but no 'state'
  if (payload?.text !== undefined || payload?.from_number || payload?.to_number) {
    return "sms.received";
  }
  // Fallback to any explicit event fields
  return payload?.event_type || payload?.type || payload?.event || "unknown";
}

function extractCall(payload: any) {
  // Dialpad call webhooks put fields at the top level
  return {
    call_id: String(payload?.call_id || payload?.id || ""),
    direction: payload?.direction || null,
    // Dialpad sends duration in milliseconds - convert to seconds
    duration: payload?.total_duration
      ? Math.round(payload.total_duration / 1000)
      : payload?.duration
        ? Math.round(payload.duration / 1000)
        : null,
    external_number: payload?.external_number || payload?.contact?.phone || null,
    internal_number: payload?.internal_number || payload?.target?.phone || null,
    caller_name: payload?.contact?.name || null,
    date_started: payload?.date_started ? new Date(payload.date_started).toISOString() : null,
    date_ended: payload?.date_ended ? new Date(payload.date_ended).toISOString() : null,
  };
}

function extractSms(payload: any) {
  // Dialpad SMS webhooks put fields at the top level
  const toNumbers = payload?.to_number || [];
  return {
    message_id: String(payload?.id || payload?.message_id || ""),
    direction: payload?.direction || null,
    content: payload?.text || payload?.text_content || null,
    external_number: payload?.direction === "outbound"
      ? (Array.isArray(toNumbers) ? toNumbers[0] : toNumbers) || payload?.contact?.phone || null
      : payload?.from_number || payload?.contact?.phone || null,
    internal_number: payload?.direction === "outbound"
      ? payload?.from_number || payload?.admins?.[0]?.phone || null
      : (Array.isArray(toNumbers) ? toNumbers[0] : toNumbers) || payload?.admins?.[0]?.phone || null,
    sender_name: payload?.contact?.name || null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonResponse({ success: false, error: "Server configuration error" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }

  const eventType = detectEventType(payload);

  const orgId = await resolveOrgFromDialpadWebhook(supabase, payload);

  try {
    // webhook_logs schema: id, payload, created_at, org_id (no event_type/source columns)
    await supabase.from("webhook_logs").insert({
      payload: { ...payload, _event_type: eventType, _source: "dialpad" },
      ...(orgId ? { org_id: orgId } : {}),
    });
  } catch (error) {
    console.error("Failed to store webhook log", error);
  }

  try {
    if (eventType.startsWith("call")) {
      const call = extractCall(payload);
      if (call.call_id) {
        // dialpad_calls schema: id, call_id, direction, duration, created_at, transcript, summary,
        // transcript_fetched_at, external_number, internal_number, payload, org_id
        await supabase.from("dialpad_calls").upsert(
          {
            call_id: call.call_id,
            direction: call.direction || "inbound",
            duration: call.duration || 0,
            external_number: call.external_number,
            internal_number: call.internal_number,
            payload,
            ...(orgId ? { org_id: orgId } : {}),
          },
          { onConflict: "call_id" }
        );
      }
    }

    if (eventType.startsWith("sms")) {
      const sms = extractSms(payload);
      if (sms.message_id) {
        await supabase.from("dialpad_sms").upsert(
          {
            message_id: sms.message_id,
            direction: sms.direction || "inbound",
            content: sms.content,
            external_number: sms.external_number,
            internal_number: sms.internal_number,
            ...(orgId ? { org_id: orgId } : {}),
          },
          { onConflict: "message_id" }
        );
      }
    }

    return jsonResponse({ success: true, event: eventType });
  } catch (error) {
    console.error("Dialpad webhook processing error", error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});
