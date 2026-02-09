import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (!["GET", "POST"].includes(req.method)) {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonResponse({ success: false, error: "Server configuration error" }, 500);
  }

  let shareToken = new URL(req.url).searchParams.get("share_token")?.trim() || "";

  if (!shareToken && req.method === "POST") {
    try {
      const payload = await req.json();
      shareToken = String(payload?.share_token || "").trim();
    } catch {
      return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
    }
  }

  if (!shareToken) {
    return jsonResponse({ success: false, error: "share_token is required" }, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { data, error } = await supabase
      .from("quotes")
      .select(
        "*, organization:organizations (business_name, business_operating_name, business_abn, bank_account_name, bank_bsb, bank_account_number)"
      )
      .eq("share_token", shareToken)
      .single();

    if (error) {
      return jsonResponse({ success: false, error: error.message }, 404);
    }

    // Fallback: if relationship data is missing, fetch org directly by org_id.
    const hasOrgDetails =
      data?.organization &&
      (data.organization.bank_account_name ||
        data.organization.bank_bsb ||
        data.organization.bank_account_number ||
        data.organization.business_name ||
        data.organization.business_operating_name);

    if (!hasOrgDetails && data?.org_id) {
      const { data: org } = await supabase
        .from("organizations")
        .select(
          "business_name, business_operating_name, business_abn, bank_account_name, bank_bsb, bank_account_number"
        )
        .eq("id", data.org_id)
        .maybeSingle();

      if (org) {
        (data as any).organization = org;
      }
    }

    return jsonResponse({ success: true, quote: data });
  } catch (error) {
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});
