// ---------------------------------------------------------------------------
// useAiChat – AI assistant chat state management
// ---------------------------------------------------------------------------

import { useState, useCallback, useEffect, useRef } from 'react'
import { useAuth } from '../lib/auth'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  toolResult?: unknown
  pendingConfirmation?: {
    toolCallId: string
    toolName: string
    arguments: Record<string, unknown>
    preview: Record<string, unknown>
  }
}

export interface UseAiChatResult {
  messages: ChatMessage[]
  isLoading: boolean
  error: string | null
  sendMessage: (content: string) => Promise<void>
  confirmAction: (confirmed: boolean) => Promise<void>
  clearMessages: () => void
  pendingConfirmation: ChatMessage['pendingConfirmation'] | null
}

const STORAGE_KEY = 'ai-chat-messages'

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function useAiChat(): UseAiChatResult {
  const { currentOrg, session } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingConfirmation, setPendingConfirmation] = useState<ChatMessage['pendingConfirmation'] | null>(null)

  const pendingConfirmationRef = useRef(pendingConfirmation)
  pendingConfirmationRef.current = pendingConfirmation

  // Load messages from localStorage on mount
  useEffect(() => {
    if (!currentOrg) return

    const stored = localStorage.getItem(`${STORAGE_KEY}-${currentOrg.id}`)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        // Convert timestamps back to Date objects
        const restored = parsed.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        }))
        setMessages(restored)
      } catch {
        // Ignore parse errors
      }
    }
  }, [currentOrg])

  // Save messages to localStorage when they change
  useEffect(() => {
    if (!currentOrg || messages.length === 0) return

    // Don't persist pending confirmations
    const toStore = messages.map(m => ({
      ...m,
      pendingConfirmation: undefined
    }))
    localStorage.setItem(`${STORAGE_KEY}-${currentOrg.id}`, JSON.stringify(toStore))
  }, [messages, currentOrg])

  const sendMessage = useCallback(async (content: string) => {
    if (!currentOrg || !session?.access_token || !content.trim()) return

    setError(null)
    setIsLoading(true)

    // Add user message
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date()
    }
    setMessages(prev => [...prev, userMessage])

    try {
      // Build conversation history for API
      const apiMessages = messages
        .filter(m => !m.pendingConfirmation) // Exclude pending confirmations
        .slice(-10) // Keep last 10 messages for context
        .map(m => ({
          role: m.role,
          content: m.content
        }))

      // Add the new user message
      apiMessages.push({ role: 'user', content: content.trim() })

      const token = session.access_token

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-Org-Id': currentOrg.id
          },
          body: JSON.stringify({ messages: apiMessages })
        }
      )

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null)
        const message =
          errorPayload?.message ||
          errorPayload?.error ||
          `Failed to get response (${response.status})`
        throw new Error(message)
      }

      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      // Handle confirmation required
      if (data.type === 'confirmation_required') {
        const assistantMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: data.message || 'I need your confirmation to proceed with this action:',
          timestamp: new Date(),
          pendingConfirmation: {
            toolCallId: data.toolCall.id,
            toolName: data.toolCall.name,
            arguments: data.toolCall.arguments,
            preview: data.preview
          }
        }
        setMessages(prev => [...prev, assistantMessage])
        setPendingConfirmation(assistantMessage.pendingConfirmation)
      } else {
        // Regular message response
        const assistantMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: data.content || 'I\'m not sure how to help with that.',
          timestamp: new Date(),
          toolResult: data.toolResult
        }
        setMessages(prev => [...prev, assistantMessage])
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred'
      setError(errorMessage)

      // Add error message
      const errorChatMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: `Sorry, I encountered an error: ${errorMessage}`,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorChatMessage])
    } finally {
      setIsLoading(false)
    }
  }, [currentOrg, session, messages])

  const confirmAction = useCallback(async (confirmed: boolean) => {
    if (!currentOrg || !session?.access_token || !pendingConfirmationRef.current) return

    const confirmation = pendingConfirmationRef.current
    setPendingConfirmation(null)
    setIsLoading(true)
    setError(null)

    try {
      const token = session.access_token

      if (!confirmed) {
        // User cancelled
        const cancelMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: 'Action cancelled.',
          timestamp: new Date()
        }
        setMessages(prev => [...prev, cancelMessage])
        return
      }

      // Execute the confirmed action
      // We need to call the edge function with the confirmation
      const apiMessages = messages
        .filter(m => !m.pendingConfirmation)
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }))

      // Add a message indicating confirmation
      apiMessages.push({
        role: 'user',
        content: `Please execute the ${confirmation.toolName} action with the following details: ${JSON.stringify(confirmation.preview)}`
      })

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-Org-Id': currentOrg.id
          },
          body: JSON.stringify({
            messages: apiMessages,
            confirmAction: {
              toolCallId: confirmation.toolCallId,
              confirmed: true,
              toolName: confirmation.toolName,
              arguments: confirmation.arguments,
              preview: confirmation.preview
            }
          })
        }
      )

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null)
        const message =
          errorPayload?.message ||
          errorPayload?.error ||
          `Failed to execute action (${response.status})`
        throw new Error(message)
      }

      const data = await response.json()

      const resultMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: data.content || 'Action completed.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, resultMessage])
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to execute action'
      setError(errorMessage)

      const errorChatMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: `Sorry, I couldn't complete that action: ${errorMessage}`,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorChatMessage])
    } finally {
      setIsLoading(false)
    }
  }, [currentOrg, session, messages])

  const clearMessages = useCallback(() => {
    setMessages([])
    setPendingConfirmation(null)
    setError(null)
    if (currentOrg) {
      localStorage.removeItem(`${STORAGE_KEY}-${currentOrg.id}`)
    }
  }, [currentOrg])

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    confirmAction,
    clearMessages,
    pendingConfirmation
  }
}
