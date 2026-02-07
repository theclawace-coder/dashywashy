import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { resolveOrgFromRequest, getOrgIntegration, corsHeaders, jsonResponse, jsonError } from '../_shared/org-resolver.ts'

function buildFallbackSummary(payload: {
  customerName?: string;
  service?: string;
  bedrooms?: number;
  bathrooms?: number;
  addons?: string[];
  customAddons?: Array<{ name?: string; price?: number }>;
  notes?: string;
}, businessName: string) {
  const parts: string[] = [];
  if (payload.service) parts.push(`${payload.service} cleaning`);
  const rooms: string[] = [];
  if (payload.bedrooms != null) rooms.push(`${payload.bedrooms} bed`);
  if (payload.bathrooms != null) rooms.push(`${payload.bathrooms} bath`);
  if (rooms.length) parts.push(rooms.join(" / "));
  if (payload.addons?.length) parts.push(`Add-ons: ${payload.addons.join(", ")}`);
  if (payload.customAddons?.length) {
    const list = payload.customAddons
      .map((c) => `${c.name || "Custom"}${c.price ? ` ($${c.price})` : ""}`)
      .join(", ");
    parts.push(`Custom add-ons: ${list}`);
  }
  if (payload.notes) parts.push(`Notes: ${payload.notes}`);
  const name = payload.customerName || "there";
  return `Hi ${name}, we'll take care of ${parts.join(". ")}.`.replace(/\s+/g, " ").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const { orgId, supabaseAdmin, org } = await resolveOrgFromRequest(req)

    const openaiConfig = await getOrgIntegration(supabaseAdmin, orgId, 'openai')
    const openaiKey = openaiConfig.api_key || ''
    const openaiModel = openaiConfig.model || 'gpt-4o-mini'
    const businessName = (org.business_name as string) || 'Our Company'

    let payload: {
      customerName?: string;
      service?: string;
      bedrooms?: number;
      bathrooms?: number;
      addons?: string[];
      customAddons?: Array<{ name?: string; price?: number }>;
      notes?: string;
    } = {};

    try {
      payload = await req.json();
    } catch {
      return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
    }

    if (!openaiKey) {
      return jsonResponse({
        success: true,
        description: buildFallbackSummary(payload, businessName),
        provider: "fallback",
      });
    }

    const userPrompt = `Create a 30-60 word summary of what ${businessName} will do. Facts only, no hallucinations.
Name: ${payload.customerName || "customer"}.
Service: ${payload.service || "cleaning"}.
Bedrooms: ${payload.bedrooms ?? "N/A"}.
Bathrooms: ${payload.bathrooms ?? "N/A"}.
Add-ons: ${payload.addons?.join(", ") || "none"}.
Custom add-ons: ${payload.customAddons?.map((c) => `${c.name} $${c.price}`).join(", ") || "none"}.
Notes: ${payload.notes || "none"}.
Refer to the customer as "you" or by name, and the cleaner as ${businessName}.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: openaiModel,
        messages: [
          {
            role: "system",
            content:
              "You write a concise (30-60 words) customer-facing summary of cleaning work. Use only the provided facts (service, rooms, add-ons, custom add-ons, notes). No assumptions or extra services. Be clear, friendly, and factual.",
          },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.6,
        max_tokens: 180,
      }),
    });

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!response.ok || !text) {
      return jsonResponse(
        {
          success: false,
          error: data?.error?.message || "Failed to generate description",
        },
        500
      );
    }

    return jsonResponse({ success: true, description: text, provider: "openai" });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('not a member'))) {
      return jsonError(error.message, 401)
    }
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});
