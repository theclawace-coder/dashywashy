/**
 * Command Palette - Conversational UI Surface
 * 
 * The CRM is commandable. Users can type or speak natural commands
 * and see the UI materialize their intent.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Kbd } from './index'

interface CommandItem {
  id: string
  label: string
  description?: string
  icon?: React.ReactNode
  shortcut?: string[]
  action: () => void
  category?: string
}

interface CommandPaletteProps {
  commands: CommandItem[]
  placeholder?: string
}

const defaultCommands: CommandItem[] = [
  {
    id: 'nav-dashboard',
    label: 'Go to Dashboard',
    description: 'View today\'s metrics and activity',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    shortcut: ['G', 'D'],
    action: () => { window.location.href = '/app' },
    category: 'Navigation'
  },
  {
    id: 'nav-calendar',
    label: 'Go to Calendar',
    description: 'View and manage scheduled jobs',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    shortcut: ['G', 'C'],
    action: () => { window.location.href = '/app/calendar' },
    category: 'Navigation'
  },
  {
    id: 'nav-funnel',
    label: 'Go to Sales Funnel',
    description: 'View leads pipeline and status',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
      </svg>
    ),
    shortcut: ['G', 'S'],
    action: () => { window.location.href = '/app/salesfunnel' },
    category: 'Navigation'
  },
  {
    id: 'nav-dispatch',
    label: 'Go to Dispatch',
    description: 'Assign cleaners to jobs',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    shortcut: ['G', 'P'],
    action: () => { window.location.href = '/app/dispatch' },
    category: 'Navigation'
  },
  {
    id: 'nav-cleaners',
    label: 'Go to Cleaners',
    description: 'Manage cleaner profiles',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    action: () => { window.location.href = '/app/cleaners' },
    category: 'Navigation'
  },
  {
    id: 'nav-analytics',
    label: 'Go to Analytics',
    description: 'Business insights and reports',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    shortcut: ['G', 'A'],
    action: () => { window.location.href = '/app/analytics' },
    category: 'Navigation'
  },
  {
    id: 'nav-todo',
    label: 'Go to Todo',
    description: 'View pending tasks',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    shortcut: ['G', 'T'],
    action: () => { window.location.href = '/app/todo' },
    category: 'Navigation'
  },
  {
    id: 'action-sync-emails',
    label: 'Sync Emails',
    description: 'Pull latest emails from Outlook',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
    action: () => { window.dispatchEvent(new Event('sync-emails')) },
    category: 'Actions'
  },
  {
    id: 'action-refresh',
    label: 'Refresh Data',
    description: 'Reload all metrics and data',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
    shortcut: ['R'],
    action: () => { window.location.reload() },
    category: 'Actions'
  },
]

export function CommandPalette({ commands = defaultCommands, placeholder = "Type a command or search..." }: CommandPaletteProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const allCommands = useMemo(() => [...defaultCommands, ...commands], [commands])

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return allCommands
    const q = query.toLowerCase()
    return allCommands.filter(cmd => 
      cmd.label.toLowerCase().includes(q) || 
      cmd.description?.toLowerCase().includes(q) ||
      cmd.category?.toLowerCase().includes(q)
    )
  }, [query, allCommands])

  const groupedCommands = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {}
    filteredCommands.forEach(cmd => {
      const category = cmd.category || 'Other'
      if (!groups[category]) groups[category] = []
      groups[category].push(cmd)
    })
    return groups
  }, [filteredCommands])

  const toggle = useCallback(() => setOpen(prev => !prev), [])
  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setSelectedIndex(0)
  }, [])

  // Keyboard shortcut: Cmd/Ctrl + K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        toggle()
      }
      if (e.key === 'Escape' && open) {
        close()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggle, close, open])

  // Also listen for custom event
  useEffect(() => {
    const handleOpen = () => setOpen(true)
    window.addEventListener('open-global-search', handleOpen)
    window.addEventListener('open-command-palette', handleOpen)
    return () => {
      window.removeEventListener('open-global-search', handleOpen)
      window.removeEventListener('open-command-palette', handleOpen)
    }
  }, [])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action()
        close()
      }
    }
  }

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current
    if (list) {
      const selected = list.querySelector('[data-selected="true"]')
      selected?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  if (!open) return null

  let flatIndex = 0

  return createPortal(
    <>
      <div className="modal-backdrop" onClick={close} />
      <div className="command-palette">
        {/* Search icon */}
        <div className="absolute left-5 top-[1.35rem] text-[var(--color-text-muted)]">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <input
          ref={inputRef}
          type="text"
          className="command-input"
          placeholder={placeholder}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        {/* Keyboard hint */}
        <div className="absolute right-4 top-4 flex items-center gap-1 text-[var(--color-text-muted)]">
          <Kbd>Esc</Kbd>
          <span className="text-xs">to close</span>
        </div>

        <div ref={listRef} className="command-results">
          {filteredCommands.length === 0 ? (
            <div className="p-6 text-center text-[var(--color-text-muted)]">
              <p className="text-sm">No commands found</p>
              <p className="text-xs mt-1">Try a different search term</p>
            </div>
          ) : (
            Object.entries(groupedCommands).map(([category, items]) => (
              <div key={category} className="mb-2">
                <p className="text-micro px-3 py-2">{category}</p>
                {items.map(cmd => {
                  const isSelected = flatIndex === selectedIndex
                  const currentIndex = flatIndex
                  flatIndex++
                  
                  return (
                    <div
                      key={cmd.id}
                      data-selected={isSelected}
                      className="command-item"
                      onClick={() => {
                        cmd.action()
                        close()
                      }}
                      onMouseEnter={() => setSelectedIndex(currentIndex)}
                    >
                      <div className="command-item-icon">
                        {cmd.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white">{cmd.label}</p>
                        {cmd.description && (
                          <p className="text-xs text-[var(--color-text-muted)] truncate">{cmd.description}</p>
                        )}
                      </div>
                      {cmd.shortcut && (
                        <div className="flex items-center gap-1">
                          {cmd.shortcut.map((key, i) => (
                            <Kbd key={i}>{key}</Kbd>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[var(--glass-border)] flex items-center justify-between text-xs text-[var(--color-text-muted)]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd>
              select
            </span>
          </div>
          <span>Type to search across the CRM</span>
        </div>
      </div>
    </>,
    document.body
  )
}

export default CommandPalette
