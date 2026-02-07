import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { resolveOrgFromRequest, corsHeaders, jsonResponse, jsonError } from '../_shared/org-resolver.ts'

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!["GET", "POST"].includes(req.method)) {
    return jsonError("Method not allowed", 405);
  }

  try {
    const { orgId, supabaseAdmin } = await resolveOrgFromRequest(req)

    let cleanerId = new URL(req.url).searchParams.get("cleaner_id")?.trim() || "";
    if (!cleanerId && req.method === "POST") {
      try {
        const payload = await req.json();
        cleanerId = String(payload?.cleaner_id || "").trim();
      } catch {
        return jsonError("Invalid JSON body", 400);
      }
    }

    if (!cleanerId) {
      return jsonError("cleaner_id is required", 400);
    }

    const { data, error } = await supabaseAdmin
      .from("cleaners")
      .select("id, bank_account_name, bank_bsb, bank_account_number")
      .eq("id", cleanerId)
      .eq("org_id", orgId)
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
