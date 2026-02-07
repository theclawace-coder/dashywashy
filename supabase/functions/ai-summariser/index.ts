import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { resolveOrgFromRequest, getOrgIntegration, corsHeaders, jsonResponse, jsonError } from '../_shared/org-resolver.ts'

function fallbackSummary(text: string, maxSentences = 2) {
  const sentences = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.slice(0, maxSentences).join(" ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const { orgId, supabaseAdmin } = await resolveOrgFromRequest(req)

    const openaiConfig = await getOrgIntegration(supabaseAdmin, orgId, 'openai')
    const openaiKey = openaiConfig.api_key || ''
    const openaiModel = openaiConfig.model || 'gpt-4o-mini'

    let payload: { text?: string; instruction?: string; max_sentences?: number } = {};
    try {
      payload = await req.json();
    } catch {
      return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
    }

    const text = payload.text?.trim();
    if (!text) {
      return jsonResponse({ success: false, error: "text is required" }, 400);
    }

    if (!openaiKey) {
      return jsonResponse({
        success: true,
        summary: fallbackSummary(text, payload.max_sentences || 2),
        provider: "fallback",
      });
    }

    const systemPrompt =
      payload.instruction ||
      "Summarize the text in 2-4 concise sentences. Use plain language and focus on the key facts.";

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: openaiModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        temperature: 0.4,
        max_tokens: 220,
      }),
    });

    const data = await response.json();
    const summary = data?.choices?.[0]?.message?.content?.trim();
    if (!response.ok || !summary) {
      return jsonResponse(
        {
          success: false,
          error: data?.error?.message || "Failed to generate summary",
        },
        500
      );
    }

    return jsonResponse({ success: true, summary, provider: "openai" });
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
