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

function extractCall(payload: any) {
  const call =
    payload?.call ||
    payload?.data?.call ||
    payload?.data?.object?.call ||
    payload?.data ||
    {};

  return {
    call_id: call?.call_id || call?.id || payload?.call_id || payload?.id || null,
    direction: call?.direction || payload?.direction || null,
    duration: call?.duration || call?.total_duration || payload?.duration || null,
    external_number: call?.external_number || call?.external_number || null,
    internal_number: call?.internal_number || call?.internal_number || null,
  };
}

function extractSms(payload: any) {
  const sms = payload?.sms || payload?.data?.sms || payload?.data || {};
  return {
    message_id: sms?.message_id || sms?.id || payload?.message_id || payload?.id || null,
    direction: sms?.direction || payload?.direction || null,
    content: sms?.text || sms?.content || payload?.content || null,
    external_number: sms?.external_number || sms?.from_number || sms?.to_number || null,
    internal_number: sms?.internal_number || sms?.user_id || null,
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

  const eventType =
    payload?.event_type || payload?.type || payload?.event || payload?.eventType || "unknown";

  const orgId = await resolveOrgFromDialpadWebhook(supabase, payload);

  try {
    await supabase.from("webhook_logs").insert({ payload, event_type: eventType, ...(orgId ? { org_id: orgId } : {}) });
  } catch (error) {
    console.error("Failed to store webhook log", error);
  }

  try {
    if (String(eventType).startsWith("call")) {
      const call = extractCall(payload);
      if (call.call_id) {
        await supabase.from("dialpad_calls").upsert(
          {
            call_id: call.call_id,
            direction: call.direction || "outbound",
            duration: Number(call.duration || 0),
            external_number: call.external_number,
            internal_number: call.internal_number,
            ...(orgId ? { org_id: orgId } : {}),
          },
          { onConflict: "call_id" }
        );
      }
    }

    if (String(eventType).startsWith("sms")) {
      const sms = extractSms(payload);
      if (sms.message_id) {
        await supabase.from("dialpad_sms").upsert(
          {
            message_id: sms.message_id,
            direction: sms.direction || "outbound",
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
