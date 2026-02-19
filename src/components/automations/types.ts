export type TriggerType = 'lead_status_change' | 'time_based' | 'event_based' | 'manual' | 'scheduled'
export type ActionType = 'send_sms' | 'send_email' | 'wait' | 'update_status' | 'make_call'

export type WorkflowStep = {
  id?: string
  step_order: number
  action_type: ActionType
  action_config: Record<string, unknown>
}

export type WorkflowRecord = {
  id: string
  name: string
  description?: string | null
  enabled: boolean
  trigger_type: TriggerType
  trigger_config: Record<string, unknown>
  system_key?: string | null
  created_at?: string
  updated_at?: string
  steps: WorkflowStep[]
}

