import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { resolveOrgFromRequest, getOrgIntegration, corsHeaders, jsonResponse, jsonError } from '../_shared/org-resolver.ts'

async function fetchDialpadTranscript(callId: string, dialpadToken: string) {
  const headers = {
    accept: "application/json",
    authorization: `Bearer ${dialpadToken}`,
  };

  const endpoints = [
    `https://dialpad.com/api/v2/calls/${callId}`,
    `https://dialpad.com/api/v2/calls/${callId}/transcript`,
  ];

  for (const url of endpoints) {
    try {
      const response = await fetch(url, { headers });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) continue;

      const transcript =
        data?.transcript ||
        data?.transcription ||
        data?.call?.transcript ||
        data?.call?.transcription ||
        data?.data?.transcript ||
        data?.data?.transcription;

      if (typeof transcript === "string" && transcript.trim()) {
        return transcript.trim();
      }
    } catch {
      // continue to next endpoint
    }
  }

  return null;
}

async function summarize(text: string, openaiKey: string, openaiModel: string) {
  if (!openaiKey) {
    const sentences = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).filter(Boolean);
    return sentences.slice(0, 3).join(" ");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: openaiModel,
      messages: [
        { role: "system", content: "Summarize the call in 3-5 concise sentences." },
        { role: "user", content: text },
      ],
      temperature: 0.4,
      max_tokens: 220,
    }),
  });

  const data = await response.json();
  const summary = data?.choices?.[0]?.message?.content?.trim();
  if (!response.ok || !summary) {
    throw new Error(data?.error?.message || "Failed to summarize transcript");
  }

  return summary;
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

    const dialpadConfig = await getOrgIntegration(supabaseAdmin, orgId, 'dialpad')
    const dialpadToken = dialpadConfig.api_key || ''
    const openaiConfig = await getOrgIntegration(supabaseAdmin, orgId, 'openai')
    const openaiKey = openaiConfig.api_key || ''
    const openaiModel = openaiConfig.model || 'gpt-4o-mini'

    if (!dialpadToken) {
      return jsonError("Dialpad API key not configured for this organization", 500);
    }

    let payload: { call_id?: string } = {};
    try {
      payload = await req.json();
    } catch {
      return jsonError("Invalid JSON body", 400);
    }

    const callId = payload.call_id?.trim();
    if (!callId) {
      return jsonError("call_id is required", 400);
    }

    const transcript = await fetchDialpadTranscript(callId, dialpadToken);

    if (!transcript) {
      return jsonResponse({ success: false, message: "Transcript not available" });
    }

    const summary = await summarize(transcript, openaiKey, openaiModel);
    const nowIso = new Date().toISOString();

    await supabaseAdmin
      .from("dialpad_calls")
      .update({ transcript, summary, transcript_fetched_at: nowIso })
      .eq("call_id", callId)
      .eq("org_id", orgId);

    return jsonResponse({ success: true, transcript, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === 'Unauthorized' ? 401 : 500;
    return jsonError(message, status);
  }
});
