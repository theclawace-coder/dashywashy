import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, supabaseAnonKey, supabaseUrl } from '../../../lib/supabase'

type AssignCleanerInput = {
  occurrenceId: string
  cleanerId: string | null
  previousCleanerId: string | null
  cleanerName: string
  cleanerPhone: string | null
  jobLabel: string
  jobAddress: string | null
  jobStartAt: string
  sendSms: boolean
}

type PendingUndo = {
  occurrenceId: string
  previousCleanerId: string | null
  expiresAt: number
}

type UseAssignCleanerOptions = {
  orgId: string | null | undefined
  onAssigned?: () => Promise<void> | void
}

type AssignResult = {
  ok: boolean
  smsWarning?: string | null
}

function formatDispatchTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-AU', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function useAssignCleaner({ orgId, onAssigned }: UseAssignCleanerOptions) {
  const [assigningOccurrenceId, setAssigningOccurrenceId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null)

  useEffect(() => {
    if (!pendingUndo) return
    const timeoutMs = pendingUndo.expiresAt - Date.now()
    if (timeoutMs <= 0) {
      setPendingUndo(null)
      return
    }
    const timer = setTimeout(() => {
      setPendingUndo(null)
    }, timeoutMs)
    return () => clearTimeout(timer)
  }, [pendingUndo])

  const sendAssignmentSms = useCallback(
    async (input: AssignCleanerInput) => {
      if (!input.cleanerPhone || !input.cleanerPhone.trim()) {
        throw new Error('Cleaner has no phone number.')
      }

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Not authenticated')
      if (!orgId) throw new Error('No organization selected')

      const message = [
        `Hi ${input.cleanerName}, you have a new job assignment.`,
        `Job: ${input.jobLabel}.`,
        `When: ${formatDispatchTime(input.jobStartAt)}.`,
        `Address: ${input.jobAddress || 'Address unavailable'}.`,
      ].join(' ')

      const response = await fetch(`${supabaseUrl}/functions/v1/internal-send-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`,
          'X-Org-Id': orgId,
        },
        body: JSON.stringify({
          phone_number: input.cleanerPhone,
          message,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `Failed to send SMS (${response.status})`)
      }
    },
    [orgId]
  )

  const assignCleaner = useCallback(
    async (input: AssignCleanerInput): Promise<AssignResult> => {
      if (!orgId) {
        setActionError('No organization selected')
        return { ok: false }
      }
      setAssigningOccurrenceId(input.occurrenceId)
      setActionError(null)

      try {
        const { error } = await supabase
          .from('booking_occurrences')
          .update({
            cleaner_id: input.cleanerId,
            assigned_at: input.cleanerId ? new Date().toISOString() : null,
          })
          .eq('id', input.occurrenceId)
          .eq('org_id', orgId)

        if (error) throw error

        let smsWarning: string | null = null
        if (input.cleanerId && input.sendSms) {
          try {
            await sendAssignmentSms(input)
          } catch (smsErr: any) {
            smsWarning = smsErr?.message || 'SMS send failed'
          }
        }

        setPendingUndo({
          occurrenceId: input.occurrenceId,
          previousCleanerId: input.previousCleanerId,
          expiresAt: Date.now() + 10000,
        })

        window.dispatchEvent(
          new CustomEvent('job-updated', { detail: { occurrenceId: input.occurrenceId } })
        )
        await onAssigned?.()
        return { ok: true, smsWarning }
      } catch (err: any) {
        setActionError(err?.message || 'Failed to assign cleaner')
        return { ok: false }
      } finally {
        setAssigningOccurrenceId(null)
      }
    },
    [onAssigned, orgId, sendAssignmentSms]
  )

  const undoLastAssignment = useCallback(async () => {
    if (!pendingUndo || !orgId) return false
    setAssigningOccurrenceId(pendingUndo.occurrenceId)
    setActionError(null)

    try {
      const { error } = await supabase
        .from('booking_occurrences')
        .update({
          cleaner_id: pendingUndo.previousCleanerId,
          assigned_at: pendingUndo.previousCleanerId ? new Date().toISOString() : null,
        })
        .eq('id', pendingUndo.occurrenceId)
        .eq('org_id', orgId)

      if (error) throw error

      window.dispatchEvent(
        new CustomEvent('job-updated', { detail: { occurrenceId: pendingUndo.occurrenceId } })
      )
      setPendingUndo(null)
      await onAssigned?.()
      return true
    } catch (err: any) {
      setActionError(err?.message || 'Failed to undo assignment')
      return false
    } finally {
      setAssigningOccurrenceId(null)
    }
  }, [onAssigned, orgId, pendingUndo])

  const undoSecondsRemaining = useMemo(() => {
    if (!pendingUndo) return 0
    return Math.max(0, Math.ceil((pendingUndo.expiresAt - Date.now()) / 1000))
  }, [pendingUndo])

  return {
    assigningOccurrenceId,
    actionError,
    pendingUndo,
    undoSecondsRemaining,
    assignCleaner,
    undoLastAssignment,
    clearActionError: () => setActionError(null),
  }
}

