import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { playSaveSound } from '../lib/sounds'

interface Todo {
  id: string
  title: string
  description: string | null
  is_completed: boolean
  created_at: string
  completed_at: string | null
}

export default function ManualTodoPopup() {
  const [isOpen, setIsOpen] = useState(false)
  const [manualTodos, setManualTodos] = useState<Todo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [todosTableUnavailable, setTodosTableUnavailable] = useState(false)
  const [newTodoTitle, setNewTodoTitle] = useState('')
  const [newTodoDescription, setNewTodoDescription] = useState('')
  const [isAddingTodo, setIsAddingTodo] = useState(false)
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('pending')

  const fetchManualTodos = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const { data, error: todosErr } = await supabase
        .from('todos')
        .select('*')
        .eq('type', 'manual')
        .order('created_at', { ascending: false })

      if (todosErr) {
        if (todosErr.code === 'PGRST205') {
          console.warn('Todos table schema cache not yet refreshed. Manual todos temporarily unavailable.')
          setTodosTableUnavailable(true)
          setManualTodos([])
        } else {
          throw todosErr
        }
      } else {
        setTodosTableUnavailable(false)
        setManualTodos((data || []) as Todo[])
      }
    } catch (err: any) {
      console.error('Failed to load manual todos:', err)
      setError(err?.message || 'Failed to load manual todos')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchManualTodos()
  }, [fetchManualTodos])

  useEffect(() => {
    if (isOpen) {
      fetchManualTodos()
    }
  }, [isOpen, fetchManualTodos])

  const handleAddManualTodo = async () => {
    if (!newTodoTitle.trim()) {
      setError('Please enter a title for your todo')
      return
    }

    setIsAddingTodo(true)
    setError(null)

    try {
      const { data, error: insertErr } = await supabase
        .from('todos')
        .insert({
          type: 'manual',
          title: newTodoTitle.trim(),
          description: newTodoDescription.trim() || null,
          is_completed: false,
          auto_generated: false,
          roll_over: true,
          due_date: format(new Date(), 'yyyy-MM-dd')
        })
        .select()
        .single()

      if (insertErr) {
        if (insertErr.code === 'PGRST205') {
          setError('Manual todos are temporarily unavailable while the database updates. Please try again in a minute.')
          return
        }
        throw insertErr
      }

      setManualTodos(prev => [data as Todo, ...prev])
      setNewTodoTitle('')
      setNewTodoDescription('')
      setSuccessMessage('Todo added!')
      playSaveSound()
      setTimeout(() => setSuccessMessage(null), 2000)
    } catch (err: any) {
      console.error('Failed to add todo:', err)
      setError(err?.message || 'Failed to add todo')
    } finally {
      setIsAddingTodo(false)
    }
  }

  const handleToggleManualTodo = async (todo: Todo) => {
    try {
      const newCompleted = !todo.is_completed
      const { error: updateErr } = await supabase
        .from('todos')
        .update({
          is_completed: newCompleted,
          completed_at: newCompleted ? new Date().toISOString() : null
        })
        .eq('id', todo.id)

      if (updateErr) throw updateErr

      setManualTodos(prev => prev.map(t =>
        t.id === todo.id
          ? { ...t, is_completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null }
          : t
      ))
      playSaveSound()
    } catch (err: any) {
      console.error('Failed to update todo:', err)
      setError(err?.message || 'Failed to update todo')
    }
  }

  const handleDeleteManualTodo = async (todoId: string) => {
    if (!confirm('Are you sure you want to delete this todo?')) return

    try {
      const { error: deleteErr } = await supabase
        .from('todos')
        .delete()
        .eq('id', todoId)

      if (deleteErr) throw deleteErr

      setManualTodos(prev => prev.filter(t => t.id !== todoId))
      playSaveSound()
    } catch (err: any) {
      console.error('Failed to delete todo:', err)
      setError(err?.message || 'Failed to delete todo')
    }
  }

  const filteredManualTodos = useMemo(() => {
    if (filter === 'all') return manualTodos
    if (filter === 'completed') return manualTodos.filter(t => t.is_completed)
    return manualTodos.filter(t => !t.is_completed)
  }, [manualTodos, filter])

  const pendingCount = useMemo(() => manualTodos.filter(t => !t.is_completed).length, [manualTodos])

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
          role="button"
          tabIndex={-1}
          aria-label="Close manual todos"
        >
          <div
            className="fixed bottom-24 right-6 w-[min(92vw,380px)] max-h-[70vh] rounded-2xl border border-cyan-500/30 bg-[var(--color-surface)] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-white/10 bg-black/20">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">✏️</span>
                  <h3 className="font-semibold text-cyan-300">Manual Todos</h3>
                  {todosTableUnavailable && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs animate-pulse">
                      Updating…
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white"
                  title="Close"
                >
                  ✕
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-[var(--color-text-muted)]">Your personal list • {pendingCount} pending</p>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setFilter('all')}
                    className={`px-2 py-0.5 text-[11px] rounded-lg ${filter === 'all' ? 'bg-cyan-600 text-white' : 'bg-white/5 text-white/60 hover:text-white'}`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setFilter('pending')}
                    className={`px-2 py-0.5 text-[11px] rounded-lg ${filter === 'pending' ? 'bg-cyan-600 text-white' : 'bg-white/5 text-white/60 hover:text-white'}`}
                  >
                    Pending
                  </button>
                  <button
                    onClick={() => setFilter('completed')}
                    className={`px-2 py-0.5 text-[11px] rounded-lg ${filter === 'completed' ? 'bg-cyan-600 text-white' : 'bg-white/5 text-white/60 hover:text-white'}`}
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <div className="px-4 py-2 border-b border-white/10 bg-red-500/10 text-red-300 text-xs">
                {error}
              </div>
            )}

            {successMessage && (
              <div className="px-4 py-2 border-b border-white/10 bg-emerald-500/10 text-emerald-200 text-xs">
                {successMessage}
              </div>
            )}

            <div className="p-4 border-b border-white/10 bg-black/20">
              <div className="space-y-2">
                <input
                  type="text"
                  value={newTodoTitle}
                  onChange={(e) => setNewTodoTitle(e.target.value)}
                  placeholder="What needs to be done?"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleAddManualTodo()
                    }
                  }}
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTodoDescription}
                    onChange={(e) => setNewTodoDescription(e.target.value)}
                    placeholder="Description (optional)"
                    className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  />
                  <button
                    onClick={handleAddManualTodo}
                    disabled={isAddingTodo || !newTodoTitle.trim()}
                    className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isAddingTodo ? 'Adding...' : 'Add'}
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 space-y-2 max-h-[40vh] overflow-y-auto">
              {isLoading ? (
                <div className="text-sm text-[var(--color-text-muted)]">Loading...</div>
              ) : todosTableUnavailable ? (
                <div className="text-sm text-amber-300 text-center py-4 space-y-2">
                  <p>⏳ Manual todos are syncing with the database…</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    This usually takes 1-2 minutes after new tables are created. Click Refresh if it persists.
                  </p>
                </div>
              ) : filteredManualTodos.length === 0 ? (
                <div className="text-sm text-[var(--color-text-muted)] text-center py-4">
                  {filter === 'pending' ? 'No pending todos!' : filter === 'completed' ? 'No completed todos yet' : 'No todos yet - add one above!'}
                </div>
              ) : (
                filteredManualTodos.map(todo => (
                  <div
                    key={todo.id}
                    className={`p-3 rounded-xl border flex items-start gap-3 transition-all ${
                      todo.is_completed
                        ? 'bg-white/5 border-white/5 opacity-60'
                        : 'bg-black/20 border-white/10'
                    }`}
                  >
                    <button
                      onClick={() => handleToggleManualTodo(todo)}
                      className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        todo.is_completed
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-white/30 hover:border-cyan-400'
                      }`}
                    >
                      {todo.is_completed && (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${todo.is_completed ? 'text-white/50 line-through' : 'text-white'}`}>
                        {todo.title}
                      </p>
                      {todo.description && (
                        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{todo.description}</p>
                      )}
                      <p className="text-xs text-[var(--color-text-muted)] mt-1">
                        Added {format(new Date(todo.created_at), 'MMM d, h:mm a')}
                        {todo.completed_at && ` • Completed ${format(new Date(todo.completed_at), 'MMM d')}`}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteManualTodo(todo.id)}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/50 hover:text-red-300 text-xs flex-shrink-0"
                      title="Delete"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 border-t border-white/10 bg-black/20 flex items-center justify-between">
              <button
                onClick={fetchManualTodos}
                className="text-xs text-cyan-300 hover:text-cyan-200"
                type="button"
              >
                Refresh
              </button>
              <a href="/app/todo" className="text-xs text-white/60 hover:text-white">
                Open full todo page →
              </a>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-30 px-4 py-3 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-500/30 border border-cyan-400/40 flex items-center gap-2"
        title="Open manual todos"
      >
        <span className="text-lg">📝</span>
        <span className="text-sm font-medium">Todo</span>
        {pendingCount > 0 && (
          <span className="min-w-[20px] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold">
            {pendingCount > 99 ? '99+' : pendingCount}
          </span>
        )}
      </button>
    </>
  )
}
