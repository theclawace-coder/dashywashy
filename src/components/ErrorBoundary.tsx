import { Component, type ReactNode } from 'react'

const SHOW_ERROR_DETAILS = import.meta.env?.DEV ?? false

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  details: string | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, details: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, details: null }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
    const details = [error?.stack, info.componentStack].filter(Boolean).join('\n')
    this.setState({ details })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="w-full max-w-md p-8 rounded-2xl bg-[var(--color-surface)] border border-[var(--glass-border)] text-center">
            <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 bg-red-500/15">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-white mb-2">Something went wrong</h1>
            <p className="text-sm text-[var(--color-text-secondary)] mb-6">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            {SHOW_ERROR_DETAILS && this.state.details && (
              <pre className="mt-3 text-left text-[11px] leading-relaxed text-[var(--color-text-muted)] max-h-48 overflow-auto bg-black/30 p-3 rounded-lg border border-white/10">
                {this.state.details}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--color-accent)] text-[var(--color-void)] hover:opacity-90 transition-opacity"
            >
              Reload page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
