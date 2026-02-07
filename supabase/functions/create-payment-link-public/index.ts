import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY") || "";
const defaultSuccess = Deno.env.get("STRIPE_SUCCESS_URL") || "https://example.com/payment-success";
const defaultCancel = Deno.env.get("STRIPE_CANCEL_URL") || "https://example.com/payment-cancel";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const stripe = new Stripe(stripeSecret, { apiVersion: "2024-06-20" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!stripeSecret) {
    return jsonResponse({ error: "Server missing STRIPE_SECRET_KEY" }, 500);
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  let payload: { share_token?: string; success_url?: string; cancel_url?: string } = {};
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const shareToken = payload.share_token?.trim();
  if (!shareToken) {
    return jsonResponse({ error: "share_token is required" }, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id, quote_number, total_inc_gst, customer_name, customer_email")
    .eq("share_token", shareToken)
    .single();

  if (quoteError || !quote) {
    return jsonResponse({ error: quoteError?.message || "Quote not found" }, 404);
  }

  const amount = Math.round(Number(quote.total_inc_gst || 0) * 100);
  if (!Number.isFinite(amount) || amount < 1) {
    return jsonResponse({ error: "Quote amount is invalid" }, 400);
  }

  try {
    const link = await stripe.paymentLinks.create({
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "aud",
            unit_amount: amount,
            product_data: { name: `Cleaning Quote ${quote.quote_number || quote.id}` },
          },
        },
      ],
      metadata: {
        quoteId: quote.id,
        shareToken,
        customerName: quote.customer_name || "",
        customerEmail: quote.customer_email || "",
      },
      after_completion: { type: "redirect", redirect: { url: payload.success_url || defaultSuccess } },
    });

    return jsonResponse({ url: link.url, id: link.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error";
    return jsonResponse({ error: message }, 500);
  }
});
