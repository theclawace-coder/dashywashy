import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const webhookUrl = `${supabaseUrl}/functions/v1/outlook-webhook`;

  try {
    // Get all enabled Outlook integrations
    const { data: integrations, error } = await supabase
      .from("organization_integrations")
      .select("org_id, config")
      .eq("provider", "outlook")
      .eq("enabled", true);

    if (error || !integrations?.length) {
      return new Response(
        JSON.stringify({ error: "No outlook integrations found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: any[] = [];

    for (const integration of integrations) {
      const cfg = integration.config as Record<string, string>;
      const tenantId = cfg.tenant_id || "";
      const clientId = cfg.client_id || "";
      const clientSecret = cfg.client_secret || "";
      const userEmail = cfg.user_email || "";

      if (!tenantId || !clientId || !clientSecret || !userEmail) {
        results.push({ org_id: integration.org_id, error: "Missing credentials" });
        continue;
      }

      // Get OAuth token
      const tokenRes = await fetch(
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            scope: "https://graph.microsoft.com/.default",
            grant_type: "client_credentials",
          }),
        }
      );

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        results.push({ org_id: integration.org_id, error: "Token failed", details: tokenData?.error });
        continue;
      }

      const token = tokenData.access_token;

      // List subscriptions
      const listRes = await fetch("https://graph.microsoft.com/v1.0/subscriptions", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const listData = await listRes.json();

      const expiration = new Date();
      expiration.setMinutes(expiration.getMinutes() + 4230);
      const expirationIso = expiration.toISOString();

      // Find and renew matching subscriptions
      const matching = (listData.value || []).filter(
        (s: any) => s.notificationUrl === webhookUrl
      );

      if (matching.length > 0) {
        for (const sub of matching) {
          const renewRes = await fetch(
            `https://graph.microsoft.com/v1.0/subscriptions/${sub.id}`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ expirationDateTime: expirationIso }),
            }
          );
          results.push({
            org_id: integration.org_id,
            action: "renewed",
            subscription_id: sub.id,
            status: renewRes.status,
            expires: expirationIso,
          });
        }
      } else {
        // Create new subscription
        const createRes = await fetch("https://graph.microsoft.com/v1.0/subscriptions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            changeType: "created",
            notificationUrl: webhookUrl,
            resource: `users/${userEmail}/messages`,
            expirationDateTime: expirationIso,
            clientState: "outlook-email-subscription",
          }),
        });
        const createData = await createRes.json();
        results.push({
          org_id: integration.org_id,
          action: "created",
          status: createRes.status,
          subscription_id: createData?.id,
          expires: expirationIso,
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
