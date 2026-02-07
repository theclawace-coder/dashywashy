import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { resolveOrgFromRequest, getOrgIntegration, corsHeaders, jsonResponse, jsonError } from '../_shared/org-resolver.ts'

async function getAccessToken(tenantId: string, clientId: string, clientSecret: string) {
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

  const data = await tokenResponse.json();
  if (!tokenResponse.ok) {
    throw new Error(data?.error_description || "Failed to get access token");
  }
  return data.access_token as string;
}

async function fetchMessages(token: string, userEmail: string, folder: "inbox" | "sentitems") {
  const selectFields = [
    "id",
    "subject",
    "from",
    "toRecipients",
    "receivedDateTime",
    "sentDateTime",
    "internetMessageId",
    "body",
  ];
  const url =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
      userEmail
    )}/mailFolders/${folder}/messages` +
    `?$top=50&$select=${selectFields.join(",")}&$orderby=receivedDateTime desc`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "Failed to fetch messages");
  }
  return data?.value || [];
}

function mapMessage(message: any, direction: "inbound" | "outbound", orgId: string) {
  const toEmail = message?.toRecipients?.[0]?.emailAddress?.address || null;
  const fromEmail = message?.from?.emailAddress?.address || null;
  return {
    message_id: message?.internetMessageId || message?.id,
    direction,
    subject: message?.subject || null,
    from_email: fromEmail,
    to_email: toEmail,
    created_at: message?.receivedDateTime || message?.sentDateTime || new Date().toISOString(),
    body: message?.body?.content || null,
    org_id: orgId,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  try {
    const { orgId, supabaseAdmin } = await resolveOrgFromRequest(req)
    const outlookConfig = await getOrgIntegration(supabaseAdmin, orgId, 'outlook')

    const tenantId = outlookConfig.tenant_id || ''
    const clientId = outlookConfig.client_id || ''
    const clientSecret = outlookConfig.client_secret || ''
    const userEmail = outlookConfig.user_email || ''

    if (!tenantId || !clientId || !clientSecret || !userEmail) {
      return jsonError("Missing Microsoft Graph credentials in organization integration", 400);
    }

    const token = await getAccessToken(tenantId, clientId, clientSecret);
    const [inboxMessages, sentMessages] = await Promise.all([
      fetchMessages(token, userEmail, "inbox"),
      fetchMessages(token, userEmail, "sentitems"),
    ]);

    const inbound = inboxMessages.map((msg: any) => mapMessage(msg, "inbound", orgId));
    const outbound = sentMessages.map((msg: any) => mapMessage(msg, "outbound", orgId));
    const allMessages = [...inbound, ...outbound].filter((msg) => msg.message_id);

    const { error } = await supabaseAdmin
      .from("dialpad_emails")
      .upsert(allMessages, { onConflict: "message_id" });

    if (error) {
      throw new Error(error.message);
    }

    return jsonResponse({
      success: true,
      total: allMessages.length,
      inbox: inbound.length,
      sent: outbound.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === 'Unauthorized' ? 401 : 500;
    return jsonError(message, status);
  }
});
