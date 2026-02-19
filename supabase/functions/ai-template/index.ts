import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { resolveOrgFromRequest, getOrgIntegration, corsHeaders, jsonResponse, jsonError } from '../_shared/org-resolver.ts'

type TemplateRequest = {
  channel: 'email' | 'sms'
  templateType?: 'receipt' | 'quote' | 'reminder' | 'followup' | 'custom'
  tone?: string
  length?: 'short' | 'medium' | 'long'
  placeholders?: string[]
  instructions?: string
}

async function callOpenAI(
  openaiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI API error: ${errorText}`)
  }

  const data = await response.json()
  const choice = data.choices?.[0]
  if (!choice) {
    throw new Error('No response from OpenAI')
  }
  return choice.message?.content || ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405)
  }

  try {
    const ctx = await resolveOrgFromRequest(req)
    const { orgId, org, supabaseAdmin } = ctx

    const openaiConfig = await getOrgIntegration(supabaseAdmin, orgId, 'openai')
    const openaiKey = openaiConfig.api_key || ''
    const openaiModel = openaiConfig.model || 'gpt-4o'

    if (!openaiKey) {
      return jsonError('OpenAI integration not configured. Add your API key in Settings > Integrations.', 400)
    }

    let payload: TemplateRequest
    try {
      payload = await req.json()
    } catch {
      return jsonError('Invalid JSON body', 400)
    }

    const channel = payload.channel
    if (channel !== 'email' && channel !== 'sms') {
      return jsonError('channel must be email or sms', 400)
    }

    const templateType = payload.templateType || 'custom'
    const tone = payload.tone || 'professional'
    const length = payload.length || 'medium'
    const placeholders = payload.placeholders || []
    const instructions = payload.instructions || ''

    const businessName = (org.business_name as string) || (org.name as string) || 'Your Business'

    const systemPrompt = [
      `You write ${channel.toUpperCase()} templates for ${businessName}.`,
      `Use the provided placeholders exactly as given.`,
      `Return JSON with keys: ${channel === 'email' ? 'subject, body' : 'body'}.`,
      `Keep tone ${tone}. Length: ${length}.`,
      `Template type: ${templateType}.`,
    ].join('\n')

    const userPrompt = [
      `Placeholders: ${placeholders.length ? placeholders.join(', ') : 'none'}.`,
      instructions ? `Extra instructions: ${instructions}` : '',
      channel === 'email'
        ? 'Write a clear subject and body. Avoid markdown.'
        : 'Write a concise SMS body. Avoid emojis unless explicitly requested.',
    ].filter(Boolean).join('\n')

    const content = await callOpenAI(openaiKey, openaiModel, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ])

    let parsed: Record<string, string> = {}
    try {
      parsed = JSON.parse(content)
    } catch {
      parsed = { body: content }
    }

    const subject = typeof parsed.subject === 'string' ? parsed.subject.trim() : ''
    const body = typeof parsed.body === 'string' ? parsed.body.trim() : ''

    return jsonResponse({
      subject,
      body,
      raw: parsed,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    const status = message === 'Unauthorized' ? 401 : 500
    return jsonError(message, status)
  }
})

