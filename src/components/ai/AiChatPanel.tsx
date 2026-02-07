/**
 * AiChatPanel - Floating AI assistant chat interface
 *
 * Features:
 * - Collapsible floating panel (bottom-right)
 * - Natural language queries and actions
 * - Confirmation flow for destructive actions
 * - Keyboard shortcut: Ctrl/Cmd + J to toggle
 */

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react'
import { GlassCard, Button, IconButton } from '../ui'
import { useAiChat, type ChatMessage } from '../../hooks/useAiChat'

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function SparklesIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  )
}

function MinusIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
    </svg>
  )
}

function TrashIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  )
}

function PaperAirplaneIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
    </svg>
  )
}

function CheckIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Suggested Questions
// ---------------------------------------------------------------------------

const SUGGESTED_QUESTIONS = [
  "What jobs do I have tomorrow?",
  "Show me unpaid bookings",
  "Who are my available cleaners?",
  "Find leads that need follow-up"
]

// ---------------------------------------------------------------------------
// Message Component
// ---------------------------------------------------------------------------

interface MessageProps {
  message: ChatMessage
  onConfirm?: () => void
  onCancel?: () => void
  isConfirming?: boolean
}

function Message({ message, onConfirm, onCancel, isConfirming }: MessageProps) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
          isUser
            ? 'bg-[var(--color-accent)] text-white'
            : 'bg-[var(--color-surface)] border border-[var(--glass-border)]'
        }`}
      >
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>

        {/* Confirmation Card */}
        {message.pendingConfirmation && (
          <div className="mt-3 p-3 bg-[var(--color-bg)]/50 rounded-xl border border-[var(--glass-border)]">
            <div className="space-y-2 text-xs">
              {Object.entries(message.pendingConfirmation.preview)
                .filter(([key]) => !key.startsWith('_'))
                .map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-2">
                    <span className="text-[var(--color-text-muted)] capitalize">
                      {key.replace(/([A-Z])/g, ' $1').trim()}:
                    </span>
                    <span className="text-right font-medium">{String(value)}</span>
                  </div>
                ))}
            </div>

            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                variant="primary"
                onClick={onConfirm}
                disabled={isConfirming}
                loading={isConfirming}
                icon={<CheckIcon className="w-3.5 h-3.5" />}
              >
                Confirm
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onCancel}
                disabled={isConfirming}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        <p className="text-[10px] mt-1.5 opacity-60">
          {message.timestamp.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function AiChatPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const {
    messages,
    isLoading,
    sendMessage,
    confirmAction,
    clearMessages,
    pendingConfirmation
  } = useAiChat()

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // Keyboard shortcut: Ctrl/Cmd + J to toggle
  useEffect(() => {
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault()
        setIsOpen(prev => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return

    const message = inputValue
    setInputValue('')
    await sendMessage(message)
  }, [inputValue, isLoading, sendMessage])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSuggestedQuestion = (question: string) => {
    setInputValue(question)
    inputRef.current?.focus()
  }

  // Collapsed button
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-[var(--color-accent)] to-purple-600 shadow-lg shadow-[var(--color-accent)]/30 flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-transform"
        title="Open AI Assistant (Ctrl+J)"
      >
        <SparklesIcon className="w-6 h-6" />
      </button>
    )
  }

  // Expanded panel
  return (
    <div className="fixed bottom-20 right-4 z-50 w-[400px] h-[600px] max-h-[calc(100vh-120px)]">
      <GlassCard className="h-full flex flex-col overflow-hidden" hover={false}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--glass-border)]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--color-accent)] to-purple-600 flex items-center justify-center">
              <SparklesIcon className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">AI Assistant</h3>
              <p className="text-[10px] text-[var(--color-text-muted)]">Ask me anything about your CRM</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <IconButton
                icon={<TrashIcon />}
                label="Clear chat"
                size="sm"
                onClick={clearMessages}
              />
            )}
            <IconButton
              icon={<MinusIcon />}
              label="Minimize"
              size="sm"
              onClick={() => setIsOpen(false)}
            />
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-[var(--color-surface)] border border-[var(--glass-border)] flex items-center justify-center mb-4">
                <SparklesIcon className="w-8 h-8 text-[var(--color-accent)]" />
              </div>
              <h4 className="text-sm font-medium text-white mb-1">How can I help you?</h4>
              <p className="text-xs text-[var(--color-text-muted)] mb-4 max-w-[280px]">
                Ask questions about your bookings, leads, cleaners, or ask me to perform actions.
              </p>

              {/* Suggested questions */}
              <div className="space-y-2 w-full">
                {SUGGESTED_QUESTIONS.map((question, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSuggestedQuestion(question)}
                    className="w-full text-left px-3 py-2 text-xs rounded-lg bg-[var(--color-surface)] border border-[var(--glass-border)] text-[var(--color-text-secondary)] hover:text-white hover:border-[var(--color-accent)]/50 transition-colors"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <Message
                  key={msg.id}
                  message={msg}
                  onConfirm={() => confirmAction(true)}
                  onCancel={() => confirmAction(false)}
                  isConfirming={isLoading && !!pendingConfirmation}
                />
              ))}
              {isLoading && !pendingConfirmation && (
                <div className="flex justify-start">
                  <div className="bg-[var(--color-surface)] border border-[var(--glass-border)] rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-[var(--color-accent)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-[var(--color-accent)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-[var(--color-accent)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-xs text-[var(--color-text-muted)]">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div className="p-3 border-t border-[var(--glass-border)]">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything..."
              className="flex-1 px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--glass-border)] rounded-xl resize-none focus:outline-none focus:border-[var(--color-accent)]/50 text-white placeholder:text-[var(--color-text-muted)]"
              rows={1}
              disabled={isLoading}
              style={{ minHeight: '40px', maxHeight: '100px' }}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
              loading={isLoading && !pendingConfirmation}
              icon={<PaperAirplaneIcon className="w-4 h-4" />}
              className="self-end"
            />
          </div>
          <p className="text-[10px] text-[var(--color-text-muted)] mt-2 text-center">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </GlassCard>
    </div>
  )
}
