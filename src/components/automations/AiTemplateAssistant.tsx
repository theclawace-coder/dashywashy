import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Button, Input } from '../ui'

type AiTemplateAssistantProps = {
  channel: 'email' | 'sms'
  placeholders: string[]
  onApply: (result: { subject?: string; body: string }) => void
}

const TEMPLATE_TYPES = [
  { value: 'receipt', label: 'Receipt' },
  { value: 'quote', label: 'Quote' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'followup', label: 'Follow-up' },
  { value: 'custom', label: 'Custom' },
]

const TONE_OPTIONS = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'short', label: 'Short & direct' },
]

const LENGTH_OPTIONS = [
  { value: 'short', label: 'Short' },
  { value: 'medium', label: 'Medium' },
  { value: 'long', label: 'Long' },
]

export default function AiTemplateAssistant({ channel, placeholders, onApply }: AiTemplateAssistantProps) {
  const [templateType, setTemplateType] = useState('custom')
  const [tone, setTone] = useState('professional')
  const [length, setLength] = useState<'short' | 'medium' | 'long'>('medium')
  const [instructions, setInstructions] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ subject?: string; body: string } | null>(null)

  const generate = async () => {
    setError(null)
    setLoading(true)
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('ai-template', {
        body: {
          channel,
          templateType,
          tone,
          length,
          placeholders,
          instructions,
        },
      })
      if (invokeError) throw invokeError
      if (!data?.body) throw new Error('No template returned.')
      const result = { subject: data.subject || '', body: data.body }
      setPreview(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate template'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-white">AI Draft</p>
        <Button size="sm" variant="secondary" onClick={generate} loading={loading}>
          Generate
        </Button>
      </div>

      <div className="grid md:grid-cols-3 gap-2">
        <div>
          <label className="text-micro block mb-1">TYPE</label>
          <select className="input w-full" value={templateType} onChange={(e) => setTemplateType(e.target.value)}>
            {TEMPLATE_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-micro block mb-1">TONE</label>
          <select className="input w-full" value={tone} onChange={(e) => setTone(e.target.value)}>
            {TONE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-micro block mb-1">LENGTH</label>
          <select className="input w-full" value={length} onChange={(e) => setLength(e.target.value as any)}>
            {LENGTH_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Input
        label="EXTRA INSTRUCTIONS"
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Add specifics for the AI, e.g. include payment link"
      />

      {error && (
        <div className="text-xs text-red-300">
          {error}
          {error.toLowerCase().includes('openai') && (
            <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">
              Add the OpenAI integration in Settings &gt; Integrations.
            </div>
          )}
        </div>
      )}

      {preview && (
        <div className="space-y-2">
          {channel === 'email' && preview.subject && (
            <div className="text-xs text-[var(--color-text-muted)]">Subject: {preview.subject}</div>
          )}
          <div className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-white/80 whitespace-pre-line">
            {preview.body}
          </div>
          <Button
            size="sm"
            variant="primary"
            onClick={() => onApply(preview)}
          >
            Use This Draft
          </Button>
        </div>
      )}
    </div>
  )
}

