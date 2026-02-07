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

  let payload: { share_token?: string; quote_id?: string } = {};
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }

  const shareToken = payload.share_token?.trim();
  const quoteId = payload.quote_id?.trim();

  if (!shareToken && !quoteId) {
    return jsonResponse({ success: false, error: "share_token or quote_id is required" }, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const query = supabase.from("quotes").select("id, lead_id, accepted_at").limit(1);
    const { data: quote, error: quoteError } = shareToken
      ? await query.eq("share_token", shareToken).single()
      : await query.eq("id", quoteId).single();

    if (quoteError || !quote) {
      return jsonResponse({ success: false, error: quoteError?.message || "Quote not found" }, 404);
    }

    const acceptedAt = quote.accepted_at || new Date().toISOString();
    const { error: updateError } = await supabase
      .from("quotes")
      .update({
        accepted_payment_method: "card_paid",
        accepted_at: acceptedAt,
      })
      .eq("id", quote.id);

    if (updateError) {
      return jsonResponse({ success: false, error: updateError.message }, 500);
    }

    if (quote.lead_id) {
      await supabase
        .from("extracted_leads")
        .update({ status: "paid" })
        .eq("id", quote.lead_id);
    }

    return jsonResponse({ success: true, quote_id: quote.id });
  } catch (error) {
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});
