import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getOrgIntegration } from '../_shared/org-resolver.ts'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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

async function fetchMessage(token: string, messageId: string, userEmail: string) {
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
    )}/messages/${messageId}` + `?$select=${selectFields.join(",")}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "Failed to fetch message");
  }
  return data;
}

function mapMessage(message: any, userEmail: string, orgId: string | null) {
  const toEmail = message?.toRecipients?.[0]?.emailAddress?.address || null;
  const fromEmail = message?.from?.emailAddress?.address || null;
  const isOutbound = fromEmail?.toLowerCase() === userEmail.toLowerCase();
  return {
    message_id: message?.internetMessageId || message?.id,
    direction: isOutbound ? "outbound" : "inbound",
    subject: message?.subject || null,
    from_email: fromEmail,
    to_email: toEmail,
    created_at: message?.receivedDateTime || message?.sentDateTime || new Date().toISOString(),
    body: message?.body?.content || null,
    ...(orgId ? { org_id: orgId } : {}),
  };
}

function extractMessageId(resource?: string, resourceData?: any) {
  if (resourceData?.id) return resourceData.id as string;
  if (resource) {
    const parts = resource.split("/");
    return parts[parts.length - 1];
  }
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const validationToken = new URL(req.url).searchParams.get("validationToken");
  if (validationToken) {
    return new Response(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain", ...corsHeaders },
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonResponse({ success: false, error: "Server configuration error" }, 500);
  }

  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  try {
    await supabase.from("webhook_logs").insert({
      payload: { ...payload, _event_type: "outlook-webhook", _source: "outlook" },
    });
  } catch (error) {
    console.error("Failed to log webhook payload", error);
  }

  try {
    const notifications = payload?.value || [];
    if (!Array.isArray(notifications) || notifications.length === 0) {
      return jsonResponse({ success: true, message: "No notifications" });
    }

    // Resolve org from the subscription's resource (e.g. "users/email@example.com/messages")
    // Look up which org has this user_email in their outlook integration
    const firstResource = notifications[0]?.resource || '';
    const resourceEmail = firstResource.match(/^users\/([^/]+)\//)?.[1] || '';
    let orgId: string | null = null;
    let tenantId = '';
    let clientId = '';
    let clientSecret = '';
    let userEmail = resourceEmail;

    if (resourceEmail) {
      const { data: integration } = await supabase
        .from('organization_integrations')
        .select('org_id, config')
        .eq('provider', 'outlook')
        .eq('enabled', true)
        .filter('config->>user_email', 'eq', resourceEmail)
        .maybeSingle();
      if (integration) {
        orgId = integration.org_id;
        const cfg = integration.config as Record<string, string>;
        tenantId = cfg.tenant_id || '';
        clientId = cfg.client_id || '';
        clientSecret = cfg.client_secret || '';
        userEmail = cfg.user_email || resourceEmail;
      }
    }

    // Fall back to first enabled outlook integration if no match
    if (!orgId || !tenantId || !clientId || !clientSecret) {
      const { data: fallback } = await supabase
        .from('organization_integrations')
        .select('org_id, config')
        .eq('provider', 'outlook')
        .eq('enabled', true)
        .limit(1)
        .maybeSingle();
      if (fallback) {
        orgId = fallback.org_id;
        const cfg = fallback.config as Record<string, string>;
        tenantId = cfg.tenant_id || '';
        clientId = cfg.client_id || '';
        clientSecret = cfg.client_secret || '';
        userEmail = cfg.user_email || '';
      }
    }

    if (!tenantId || !clientId || !clientSecret || !userEmail) {
      return jsonResponse({ success: false, error: "No Outlook integration configured" }, 400);
    }

    const token = await getAccessToken(tenantId, clientId, clientSecret);
    const rows: any[] = [];
    for (const note of notifications) {
      const messageId = extractMessageId(note?.resource, note?.resourceData);
      if (!messageId) continue;
      const message = await fetchMessage(token, messageId, userEmail);
      rows.push(mapMessage(message, userEmail, orgId));
    }

    if (rows.length > 0) {
      const { error } = await supabase
        .from("dialpad_emails")
        .upsert(rows, { onConflict: "message_id" });
      if (error) {
        throw new Error(error.message);
      }

      // Auto-extract lead info for emails matching lead patterns
      const leadPatterns = [
        /^New message from\s+["'][^"']+["']$/i,
        /^New Meta Lead$/i,
        /^New Entry - Lead Form$/i,
      ];
      const normalizeSubject = (s: string) =>
        s.replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").trim();

      for (const row of rows) {
        if (!row.subject) continue;
        const normalized = normalizeSubject(row.subject);
        const isLead = leadPatterns.some((p) => p.test(normalized));
        if (!isLead) continue;

        // Look up the inserted email row to get its UUID
        const { data: emailRow } = await supabase
          .from("dialpad_emails")
          .select("id")
          .eq("message_id", row.message_id)
          .maybeSingle();

        if (!emailRow?.id) continue;

        // Check if lead already extracted for this email
        const { data: existingLead } = await supabase
          .from("extracted_leads")
          .select("id")
          .eq("email_id", emailRow.id)
          .maybeSingle();

        if (existingLead) continue;

        // Call extract-lead-info edge function (service-to-service with X-Org-Id)
        try {
          await fetch(`${supabaseUrl}/functions/v1/extract-lead-info`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseServiceKey}`,
              "X-Org-Id": orgId,
            },
            body: JSON.stringify({ email_id: emailRow.id }),
          });
          console.log(`[Outlook Webhook] Auto-extracted lead for email ${emailRow.id}`);
        } catch (extractErr) {
          console.error(`[Outlook Webhook] Auto-extract failed for email ${emailRow.id}`, extractErr);
        }
      }
    }

    return jsonResponse({ success: true, inserted: rows.length });
  } catch (error) {
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});
