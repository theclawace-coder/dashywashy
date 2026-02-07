import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { resolveOrgFromRequest, getOrgIntegration, corsHeaders, jsonResponse, jsonError } from '../_shared/org-resolver.ts'

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const { orgId, supabaseAdmin } = await resolveOrgFromRequest(req)

    const dialpadConfig = await getOrgIntegration(supabaseAdmin, orgId, 'dialpad')
    const dialpadToken = dialpadConfig.api_key
    const defaultUserId = dialpadConfig.user_id || ''
    if (!dialpadToken) return jsonError('Dialpad not configured for this organization', 400)

    let payload: { phone_number?: string; user_id?: string } = {};
    try {
      payload = await req.json();
    } catch {
      return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
    }

    const phoneNumber = payload.phone_number?.trim();
    const userId = payload.user_id?.trim() || defaultUserId;

    if (!phoneNumber) {
      return jsonResponse({ success: false, error: "phone_number is required" }, 400);
    }

    const response = await fetch(`https://dialpad.com/api/v2/users/${userId}/initiate_call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${dialpadToken}`,
      },
      body: JSON.stringify({ phone_number: phoneNumber }),
    });

    const textBody = await response.text();
    let parsed: any = null;
    try {
      parsed = textBody ? JSON.parse(textBody) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok || parsed?.error) {
      return jsonResponse(
        { success: false, error: parsed?.error || textBody || `HTTP ${response.status}` },
        response.status
      );
    }

    return jsonResponse({ success: true, result: parsed || {} });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('not a member'))) {
      return jsonError(error.message, 401)
    }
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});
