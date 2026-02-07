import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { resolveOrgFromRequest, getOrgIntegration, corsHeaders, jsonResponse, jsonError } from '../_shared/org-resolver.ts'

async function fetchDialpad(url: string, dialpadToken: string) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${dialpadToken}`,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Dialpad error ${response.status}`);
  }
  return data;
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

    if (!dialpadToken) {
      return jsonError("Dialpad API key not configured for this organization", 500);
    }

    let payload: { limit?: number } = {};
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }

    const limit = Number(payload.limit || 50);
    const cappedLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 50;

    const callsUrl = `https://dialpad.com/api/v2/calls?user_id=${dialpadUserId}&limit=${cappedLimit}`;
    const smsUrl = `https://dialpad.com/api/v2/sms?user_id=${dialpadUserId}&limit=${cappedLimit}`;

    const [callsData, smsData] = await Promise.all([fetchDialpad(callsUrl, dialpadToken), fetchDialpad(smsUrl, dialpadToken)]);

    const calls = (callsData?.calls || callsData?.items || []).map((call: any) => ({
      call_id: call.call_id || call.id,
      direction: call.direction || "outbound",
      duration: Number(call.duration || call.total_duration || 0),
      created_at: call.created_at || call.started_at || new Date().toISOString(),
      external_number: call.external_number || call.contact_number || null,
      internal_number: call.internal_number || call.user_id || null,
      org_id: orgId,
    }));

    const sms = (smsData?.sms || smsData?.items || []).map((item: any) => ({
      message_id: item.message_id || item.id,
      direction: item.direction || "outbound",
      created_at: item.created_at || new Date().toISOString(),
      content: item.text || item.content || null,
      external_number: item.external_number || item.from_number || item.to_number || null,
      internal_number: item.internal_number || item.user_id || null,
      org_id: orgId,
    }));

    if (calls.length > 0) {
      await supabaseAdmin.from("dialpad_calls").upsert(calls, { onConflict: "call_id" });
    }
    if (sms.length > 0) {
      await supabaseAdmin.from("dialpad_sms").upsert(sms, { onConflict: "message_id" });
    }

    return jsonResponse({ success: true, calls: calls.length, sms: sms.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === 'Unauthorized' ? 401 : 500;
    return jsonError(message, status);
  }
});
