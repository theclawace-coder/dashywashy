import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { resolveOrgFromRequest, getOrgIntegration, corsHeaders, jsonResponse, jsonError } from '../_shared/org-resolver.ts'

type GraphSubscription = {
  id?: string;
  notificationUrl?: string;
  resource?: string;
  expirationDateTime?: string;
  clientState?: string;
};

async function listSubscriptions(token: string) {
  const listResponse = await fetch("https://graph.microsoft.com/v1.0/subscriptions", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!listResponse.ok) {
    const errorText = await listResponse.text();
    return { ok: false, errorText };
  }

  const data = await listResponse.json();
  return { ok: true, data };
}

async function deleteSubscription(token: string, subscriptionId: string) {
  const response = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${subscriptionId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.ok;
}

async function renewSubscription(token: string, subscriptionId: string, expirationDateTime: string) {
  const response = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${subscriptionId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      expirationDateTime,
    }),
  });

  const responseText = await response.text();
  let responseData;
  try {
    responseData = JSON.parse(responseText);
  } catch {
    responseData = { raw: responseText };
  }

  return { ok: response.ok, data: responseData };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const { orgId, supabaseAdmin } = await resolveOrgFromRequest(req)
    const outlookConfig = await getOrgIntegration(supabaseAdmin, orgId, 'outlook')

    const tenantId = outlookConfig.tenant_id || ''
    const clientId = outlookConfig.client_id || ''
    const clientSecret = outlookConfig.client_secret || ''
    const userEmail = outlookConfig.user_email || ''
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    if (!tenantId || !clientId || !clientSecret || !userEmail) {
      return jsonError("Missing Microsoft Graph credentials in organization integration", 400);
    }

    // Get access token
    console.log(`[Setup Webhook] Getting access token for tenant: ${tenantId}`);
    const tokenResponse = await fetch(
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

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error(`[Setup Webhook] Token error: ${errorText}`);
      return jsonError("Failed to get access token", 500);
    }

    const tokenData = await tokenResponse.json();
    const token = tokenData.access_token;
    console.log(`[Setup Webhook] Got access token successfully`);

    const body = req.method === "POST" ? await req.json() : {};
    const action = body.action || "list";

    // Handle different actions
    if (req.method === "DELETE" || action === "delete") {
      const subscriptionId = body.subscription_id;
      if (!subscriptionId) {
        return jsonError("subscription_id required for delete action", 400);
      }

      const deleteResponse = await fetch(
        `https://graph.microsoft.com/v1.0/subscriptions/${subscriptionId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      return jsonResponse({
        success: deleteResponse.ok,
        status: deleteResponse.status,
      }, deleteResponse.ok ? 200 : deleteResponse.status);
    }

    if (action === "list" || req.method === "GET") {
      console.log(`[Setup Webhook] Listing subscriptions`);
      const listResult = await listSubscriptions(token);

      if (!listResult.ok) {
        console.error(`[Setup Webhook] List error: ${listResult.errorText}`);
        return jsonError("Failed to list subscriptions", 500);
      }

      const subscriptions = listResult.data;
      console.log(`[Setup Webhook] Found ${subscriptions.value?.length || 0} subscriptions`);
      return jsonResponse(subscriptions);
    }

    if (action === "create") {
      const webhookUrl = `${supabaseUrl}/functions/v1/outlook-webhook`;
      const resource = `users/${userEmail}/messages`;

      const expirationDateTime = new Date();
      expirationDateTime.setMinutes(expirationDateTime.getMinutes() + 4230);
      const expirationIso = expirationDateTime.toISOString();

      const listResult = await listSubscriptions(token);
      if (!listResult.ok) {
        console.error(`[Setup Webhook] List error before create: ${listResult.errorText}`);
        return jsonError("Failed to list subscriptions", 500);
      }

      const allSubscriptions = (listResult.data?.value || []) as GraphSubscription[];
      const matching = allSubscriptions.filter((sub) =>
        sub.notificationUrl === webhookUrl &&
        sub.resource === resource &&
        sub.clientState === "outlook-email-subscription"
      );

      if (matching.length > 0) {
        const primary = matching.reduce((acc, current) => {
          if (!acc.expirationDateTime) return current;
          if (!current.expirationDateTime) return acc;
          return new Date(current.expirationDateTime) > new Date(acc.expirationDateTime) ? current : acc;
        }, matching[0]);

        const deletedIds: string[] = [];
        for (const sub of matching) {
          if (sub.id && sub.id !== primary.id) {
            const deleted = await deleteSubscription(token, sub.id);
            if (deleted) deletedIds.push(sub.id);
          }
        }

        if (primary.id) {
          const renewResult = await renewSubscription(token, primary.id, expirationIso);
          if (!renewResult.ok) {
            console.error(`[Setup Webhook] Failed to renew subscription:`, renewResult.data);
          }

          return jsonResponse({
            success: renewResult.ok,
            action: "renewed",
            subscription: renewResult.data,
            expiresAt: expirationIso,
            webhookUrl,
            removedDuplicates: deletedIds.length,
            removedIds: deletedIds,
          }, renewResult.ok ? 200 : 500);
        }
      }

      const subscriptionPayload = {
        changeType: "created",
        notificationUrl: webhookUrl,
        resource,
        expirationDateTime: expirationIso,
        clientState: "outlook-email-subscription",
      };

      console.log(`[Setup Webhook] Creating subscription:`, JSON.stringify(subscriptionPayload, null, 2));

      const createResponse = await fetch(
        "https://graph.microsoft.com/v1.0/subscriptions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(subscriptionPayload),
        }
      );

      const responseText = await createResponse.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { raw: responseText };
      }

      if (!createResponse.ok) {
        console.error(`[Setup Webhook] Failed to create subscription:`, responseText);
        return jsonResponse({
          error: "Failed to create subscription",
          status: createResponse.status,
          details: responseData,
          webhookUrl,
          subscriptionPayload,
          troubleshooting: {
            note: "Make sure the webhook endpoint is publicly accessible and returns the validationToken correctly.",
            checkPermissions: "Verify Azure AD app has Mail.Read and Mail.ReadBasic.All application permissions with admin consent.",
            checkWebhook: `Test webhook validation: GET ${webhookUrl}?validationToken=test123`,
          },
        }, 500);
      }

      console.log(`[Setup Webhook] Subscription created successfully:`, responseText);
      return jsonResponse({
        success: true,
        action: "created",
        subscription: responseData,
        expiresAt: expirationIso,
        webhookUrl,
      });
    }

    if (action === "renew") {
      const subscriptionId = body.subscription_id;
      if (!subscriptionId) {
        return jsonError("subscription_id required for renew action", 400);
      }

      const expirationDateTime = new Date();
      expirationDateTime.setMinutes(expirationDateTime.getMinutes() + 4230);

      console.log(`[Setup Webhook] Renewing subscription: ${subscriptionId}`);
      const renewResponse = await renewSubscription(token, subscriptionId, expirationDateTime.toISOString());

      if (!renewResponse.ok) {
        console.error(`[Setup Webhook] Failed to renew subscription:`, renewResponse.data);
      }

      return jsonResponse({
        success: renewResponse.ok,
        subscription: renewResponse.data,
        newExpiration: expirationDateTime.toISOString(),
      }, renewResponse.ok ? 200 : 500);
    }

    return jsonError("Invalid action. Valid actions: list, create, delete, renew", 400);

  } catch (error) {
    console.error(`[Setup Webhook] Error:`, error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message === 'Unauthorized' ? 401 : 500;
    return jsonError(message, status);
  }
});
