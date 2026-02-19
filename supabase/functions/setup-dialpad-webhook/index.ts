import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  resolveOrgFromRequest,
  corsHeaders,
  jsonResponse,
  jsonError,
} from "../_shared/org-resolver.ts";

type DialpadWebhook = {
  id?: string;
  hook_url?: string;
  url?: string;
  events?: string[];
};

const DEFAULT_EVENTS = [
  "call.ended",
  "call.completed",
  "sms.created",
  "sms.sent",
  "sms.received",
];

async function dialpadRequest(
  url: string,
  token: string,
  init: RequestInit = {}
) {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

function extractWebhookUrl(hook: DialpadWebhook): string {
  return (
    hook.hook_url ||
    hook.url ||
    (hook as any).hookUrl ||
    (hook as any).webhook_url ||
    ""
  );
}

function normalizeWebhookList(data: any): DialpadWebhook[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.webhooks)) return data.webhooks;
  return [];
}

function serializeEvents(value: unknown): string {
  if (Array.isArray(value)) return value.join(",");
  if (typeof value === "string") return value;
  return "";
}

async function updateIntegrationConfig(
  supabaseAdmin: any,
  orgId: string,
  updates: Record<string, unknown>
) {
  const { data, error } = await supabaseAdmin
    .from("organization_integrations")
    .select("config")
    .eq("org_id", orgId)
    .eq("provider", "dialpad")
    .maybeSingle();

  if (error || !data) return;

  const nextConfig = {
    ...(data.config || {}),
    ...updates,
  };

  await supabaseAdmin
    .from("organization_integrations")
    .update({ config: nextConfig })
    .eq("org_id", orgId)
    .eq("provider", "dialpad");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return jsonError("Method not allowed", 405);
  }

  try {
    const { orgId, supabaseAdmin } = await resolveOrgFromRequest(req);
    const { data: integration } = await supabaseAdmin
      .from("organization_integrations")
      .select("config, enabled")
      .eq("org_id", orgId)
      .eq("provider", "dialpad")
      .maybeSingle();

    if (!integration?.enabled) {
      return jsonError("Dialpad integration is disabled", 400);
    }

    const config = (integration.config || {}) as Record<string, string>;
    const apiKey = config.api_key || "";

    if (!apiKey) {
      return jsonError("Dialpad API key not configured", 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const webhookUrl = `${supabaseUrl}/functions/v1/dialpad-webhook`;

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body.action || (req.method === "GET" ? "list" : "ensure");
    const events = Array.isArray(body.events) && body.events.length > 0
      ? body.events
      : DEFAULT_EVENTS;

    const listResult = await dialpadRequest("https://dialpad.com/api/v2/webhooks", apiKey);
    if (!listResult.ok) {
      return jsonResponse(
        { error: "Failed to list webhooks", status: listResult.status, details: listResult.data },
        500
      );
    }

    const hooks = normalizeWebhookList(listResult.data);
    const matching = hooks.filter((hook) => extractWebhookUrl(hook) === webhookUrl);

    if (action === "list") {
      await updateIntegrationConfig(supabaseAdmin, orgId, {
        dialpad_webhook_last_checked_at: new Date().toISOString(),
      });

      return jsonResponse({
        success: true,
        webhooks: hooks,
        matching: matching,
        webhook_url: webhookUrl,
      });
    }

    if (action === "ensure") {
      if (matching.length > 0) {
        const primary = matching[0];

        await updateIntegrationConfig(supabaseAdmin, orgId, {
          dialpad_webhook_id: primary.id ? String(primary.id) : null,
          dialpad_webhook_url: webhookUrl,
          dialpad_webhook_events: serializeEvents(primary.events || events),
          dialpad_webhook_last_checked_at: new Date().toISOString(),
          dialpad_webhook_last_action: "exists",
        });

        return jsonResponse({
          success: true,
          action: "exists",
          webhook: primary,
          webhook_url: webhookUrl,
          matched_count: matching.length,
        });
      }

      const createPayload = {
        url: webhookUrl,
        events,
      };

      const createResult = await dialpadRequest("https://dialpad.com/api/v2/webhooks", apiKey, {
        method: "POST",
        body: JSON.stringify(createPayload),
      });

      if (!createResult.ok) {
        return jsonResponse(
          {
            error: "Failed to create webhook",
            status: createResult.status,
            details: createResult.data,
            payload: createPayload,
          },
          500
        );
      }

      const created = createResult.data as DialpadWebhook;

      await updateIntegrationConfig(supabaseAdmin, orgId, {
        dialpad_webhook_id: created?.id ? String(created.id) : null,
        dialpad_webhook_url: webhookUrl,
        dialpad_webhook_events: serializeEvents(created?.events || events),
        dialpad_webhook_last_checked_at: new Date().toISOString(),
        dialpad_webhook_last_action: "created",
      });

      return jsonResponse({
        success: true,
        action: "created",
        webhook: created,
        webhook_url: webhookUrl,
      });
    }

    return jsonError("Invalid action. Use list or ensure.", 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message === "Unauthorized" ? 401 : 500;
    return jsonError(message, status);
  }
});
