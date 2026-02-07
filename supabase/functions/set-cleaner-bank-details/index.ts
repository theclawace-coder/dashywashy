import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { resolveOrgFromRequest, corsHeaders, jsonResponse, jsonError } from '../_shared/org-resolver.ts'

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  try {
    const { orgId, supabaseAdmin } = await resolveOrgFromRequest(req)

    let payload: {
      cleaner_id?: string;
      bank_account_name?: string | null;
      bank_bsb?: string | null;
      bank_account_number?: string | null;
    } = {};

    try {
      payload = await req.json();
    } catch {
      return jsonError("Invalid JSON body", 400);
    }

    const cleanerId = payload.cleaner_id?.trim();
    if (!cleanerId) {
      return jsonError("cleaner_id is required", 400);
    }

    const { data, error } = await supabaseAdmin
      .from("cleaners")
      .update({
        bank_account_name: payload.bank_account_name?.trim() || null,
        bank_bsb: payload.bank_bsb?.trim() || null,
        bank_account_number: payload.bank_account_number?.trim() || null,
      })
      .eq("id", cleanerId)
      .eq("org_id", orgId)
      .select("id, bank_account_name, bank_bsb, bank_account_number")
      .single();

    if (error) {
      return jsonError(error.message, 500);
    }

    return jsonResponse({ success: true, cleaner: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    const status = message === 'Unauthorized' ? 401 : 500;
    return jsonError(message, status);
  }
});
