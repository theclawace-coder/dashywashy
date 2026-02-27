import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getOrgIntegration } from "../_shared/org-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const envStripeSecret = Deno.env.get("STRIPE_SECRET_KEY") || "";
const envDefaultSuccess = Deno.env.get("STRIPE_SUCCESS_URL") || "https://example.com/payment-success";
const envDefaultCancel = Deno.env.get("STRIPE_CANCEL_URL") || "https://example.com/payment-cancel";

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
    return jsonResponse({ error: "Method not allowed" }, 405);
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
    .select("id, org_id, quote_number, total_inc_gst, customer_name, customer_email")
    .eq("share_token", shareToken)
    .single();

  if (quoteError || !quote) {
    return jsonResponse({ error: quoteError?.message || "Quote not found" }, 404);
  }

  const amount = Math.round(Number(quote.total_inc_gst || 0) * 100);
  if (!Number.isFinite(amount) || amount < 1) {
    return jsonResponse({ error: "Quote amount is invalid" }, 400);
  }

  const stripeConfig = quote.org_id
    ? await getOrgIntegration(supabase, quote.org_id, "stripe")
    : {};
  const stripeSecret = (stripeConfig.secret_key || envStripeSecret || "").trim();
  const defaultSuccess = stripeConfig.success_url || envDefaultSuccess;
  const defaultCancel = stripeConfig.cancel_url || envDefaultCancel;

  if (!stripeSecret) {
    return jsonResponse({ error: "Stripe not configured for this organization" }, 500);
  }

  if (!stripeSecret.startsWith("sk_")) {
    return jsonResponse({ error: "Stripe secret key is invalid for this organization" }, 500);
  }

  const stripe = new Stripe(stripeSecret, { apiVersion: "2024-06-20" });

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
        quote_id: quote.id,
        org_id: quote.org_id || "",
        shareToken,
        customerName: quote.customer_name || "",
        customerEmail: quote.customer_email || "",
      },
      after_completion: { type: "redirect", redirect: { url: payload.success_url || defaultSuccess } },
    });

    return jsonResponse({ url: link.url, id: link.id, cancel_url: payload.cancel_url || defaultCancel });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error";
    return jsonResponse({ error: message }, 500);
  }
});
