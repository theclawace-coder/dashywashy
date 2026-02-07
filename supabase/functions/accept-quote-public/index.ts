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

  let payload: {
    share_token?: string;
    accepted_name?: string;
    accepted_signature?: string;
    accepted_checkbox?: boolean;
    accepted_date?: string;
    accepted_payment_method?: string;
  } = {};

  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }

  const shareToken = payload.share_token?.trim();
  if (!shareToken) {
    return jsonResponse({ success: false, error: "share_token is required" }, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const acceptedAt = new Date().toISOString();
    const updatePayload = {
      accepted_at: acceptedAt,
      accepted_name: payload.accepted_name?.trim() || null,
      accepted_signature: payload.accepted_signature?.trim() || payload.accepted_name?.trim() || null,
      accepted_checkbox: payload.accepted_checkbox ?? true,
      accepted_date: payload.accepted_date || acceptedAt.slice(0, 10),
      accepted_payment_method: payload.accepted_payment_method || null,
    };

    const { data, error } = await supabase
      .from("quotes")
      .update(updatePayload)
      .eq("share_token", shareToken)
      .select("*")
      .single();

    if (error) {
      return jsonResponse({ success: false, error: error.message }, 500);
    }

    return jsonResponse({ success: true, quote: data });
  } catch (error) {
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});
