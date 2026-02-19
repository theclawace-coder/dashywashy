import { useMemo } from 'react'
import type { WorkflowRecord } from './types'
import { Button, Badge } from '../ui'

type AutomationSidebarProps = {
  workflows: WorkflowRecord[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
}

export default function AutomationSidebar({
  workflows,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
}: AutomationSidebarProps) {
  const { core, custom } = useMemo(() => {
    const coreItems = workflows.filter((w) => Boolean(w.system_key))
    const customItems = workflows.filter((w) => !w.system_key)
    return { core: coreItems, custom: customItems }
  }, [workflows])

  const renderItem = (workflow: WorkflowRecord) => {
    const isSelected = selectedId === workflow.id
    return (
      <div
        key={workflow.id}
        className={`group rounded-xl border px-3 py-2 transition-colors ${
          isSelected
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)]'
            : 'border-white/10 bg-white/5 hover:bg-white/10'
        }`}
      >
        <button
          type="button"
          className="w-full text-left"
          onClick={() => onSelect(workflow.id)}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{workflow.name}</p>
              <p className="text-[11px] text-[var(--color-text-muted)] capitalize">{workflow.trigger_type.replace(/_/g, ' ')}</p>
            </div>
            <Badge variant={workflow.enabled ? 'success' : 'default'}>{workflow.enabled ? 'On' : 'Off'}</Badge>
          </div>
        </button>
        {!workflow.system_key && (
          <div className="mt-2 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => onDelete(workflow.id)}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-white">Automations</h2>
        <Button variant="secondary" size="sm" onClick={onCreate}>
          + New
        </Button>
      </div>

      <div className="space-y-4 overflow-y-auto pr-2">
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Core</p>
          {core.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">No core automations yet.</p>
          ) : (
            <div className="space-y-2">{core.map(renderItem)}</div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Custom</p>
          {custom.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">No custom automations yet.</p>
          ) : (
            <div className="space-y-2">{custom.map(renderItem)}</div>
          )}
        </div>
      </div>
    </div>
  )
}

