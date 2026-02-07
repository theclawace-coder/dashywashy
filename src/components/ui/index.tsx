/**
 * Design System UI Primitives
 * Apple VisionOS + iOS 18 Glassmorphism CRM
 * 
 * These components embody:
 * - Frosted glass panels with subtle blur
 * - Physical, tactile button interactions
 * - Contextual, calm feedback
 * - Everything responds
 */

import { createContext, useContext, useState, useEffect, useCallback, forwardRef, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

// =============================================================================
// GLASS CARD
// =============================================================================

interface GlassCardProps {
  children: ReactNode
  className?: string
  hover?: boolean
  onClick?: () => void
  variant?: 'default' | 'elevated' | 'interactive'
  style?: CSSProperties
}

export function GlassCard({
  children,
  className = '',
  hover = true,
  onClick,
  variant = 'default',
  style,
}: GlassCardProps) {
  const variants = {
    default: 'glass-card',
    elevated: 'glass-elevated',
    interactive: 'glass-interactive cursor-pointer'
  }

  return (
    <div 
      className={`${variants[variant]} ${hover ? '' : '!transform-none'} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={style}
    >
      {children}
    </div>
  )
}

// =============================================================================
// BUTTON
// =============================================================================

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: ReactNode
  iconPosition?: 'left' | 'right'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ 
    children, 
    variant = 'secondary', 
    size = 'md', 
    loading = false, 
    icon, 
    iconPosition = 'left',
    className = '',
    disabled,
    onClick,
    ...props 
  }, ref) => {
    const [ripples, setRipples] = useState<{ x: number; y: number; id: number }[]>([])

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      // Create ripple effect
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const id = Date.now()
      
      setRipples(prev => [...prev, { x, y, id }])
      setTimeout(() => {
        setRipples(prev => prev.filter(r => r.id !== id))
      }, 600)

      onClick?.(e)
    }

    const variantClasses = {
      primary: 'btn-primary',
      secondary: 'btn-secondary',
      ghost: 'btn-ghost',
      danger: 'btn-primary bg-gradient-to-br from-red-500 to-red-600 shadow-red-500/25'
    }

    const sizeClasses = {
      sm: 'btn-sm',
      md: '',
      lg: 'btn-lg'
    }

    return (
      <button
        ref={ref}
        className={`btn ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        disabled={disabled || loading}
        onClick={handleClick}
        {...props}
      >
        {ripples.map(ripple => (
          <span
            key={ripple.id}
            className="btn-ripple"
            style={{
              left: ripple.x,
              top: ripple.y,
              width: 20,
              height: 20,
              marginLeft: -10,
              marginTop: -10,
            }}
          />
        ))}
        
        {loading ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : icon && iconPosition === 'left' ? (
          icon
        ) : null}
        
        {children && <span>{children}</span>}
        
        {!loading && icon && iconPosition === 'right' ? icon : null}
      </button>
    )
  }
)

Button.displayName = 'Button'

// =============================================================================
// ICON BUTTON
// =============================================================================

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode
  label: string
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
}

export function IconButton({ icon, label, variant = 'ghost', size = 'md', className = '', ...props }: IconButtonProps) {
  return (
    <Button 
      variant={variant} 
      size={size} 
      className={`btn-icon ${className}`}
      aria-label={label}
      title={label}
      {...props}
    >
      {icon}
    </Button>
  )
}

// =============================================================================
// INPUT
// =============================================================================

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className = '', ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="text-micro">{label}</label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={`input ${icon ? 'pl-10' : ''} ${error ? 'border-red-500 focus:border-red-500 focus:shadow-red-500/20' : ''} ${className}`}
            {...props}
          />
        </div>
        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

// =============================================================================
// SWITCH
// =============================================================================

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
}

export function Switch({ checked, onChange, disabled = false, label }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onChange(!checked)
      }}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? 'bg-emerald-500' : 'bg-white/10'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

// =============================================================================
// BADGE
// =============================================================================

interface BadgeProps {
  children: ReactNode
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'unanswered' | 'marketing' | 'followup' | 'quote' | 'won' | 'completed' | 'notinterested'
  dot?: boolean
  pulse?: boolean
  className?: string
}

export function Badge({ children, variant = 'default', dot = false, pulse = false, className = '' }: BadgeProps) {
  const variantClasses: Record<string, string> = {
    default: '',
    success: 'badge-success',
    warning: 'badge-warning',
    error: 'badge-error',
    info: 'badge-info',
    unanswered: 'badge-unanswered',
    marketing: 'badge-marketing',
    followup: 'badge-followup',
    quote: 'badge-quote',
    won: 'badge-won',
    completed: 'badge-completed',
    notinterested: 'badge-notinterested'
  }

  return (
    <span className={`badge ${variantClasses[variant]} ${pulse ? 'animate-pulse' : ''} ${className}`}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  )
}

// =============================================================================
// TOAST SYSTEM
// =============================================================================

type ToastType = 'success' | 'warning' | 'error' | 'info'

interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
}

interface ToastContextType {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const newToast = { ...toast, id }
    
    setToasts(prev => [...prev, newToast])

    // Auto-remove after duration
    const duration = toast.duration ?? 4000
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id)
      }, duration)
    }
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

function ToastContainer() {
  const { toasts, removeToast } = useToast()

  if (toasts.length === 0) return null

  return createPortal(
    <div className="toast-container">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>,
    document.body
  )
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [exiting, setExiting] = useState(false)

  const handleClose = () => {
    setExiting(true)
    setTimeout(onClose, 300)
  }

  const icons: Record<ToastType, ReactNode> = {
    success: (
      <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    warning: (
      <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    error: (
      <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    info: (
      <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  }

  return (
    <div className={`toast toast-${toast.type} ${exiting ? 'toast-exit' : ''}`}>
      {icons[toast.type]}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">{toast.title}</p>
        {toast.message && (
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{toast.message}</p>
        )}
      </div>
      {toast.action && (
        <button 
          onClick={toast.action.onClick}
          className="text-xs font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors"
        >
          {toast.action.label}
        </button>
      )}
      <button onClick={handleClose} className="text-[var(--color-text-muted)] hover:text-white transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

// =============================================================================
// PROGRESS RING
// =============================================================================

interface ProgressRingProps {
  progress: number // 0-100
  size?: number
  strokeWidth?: number
  className?: string
  children?: ReactNode
}

export function ProgressRing({ progress, size = 48, strokeWidth = 4, className = '', children }: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (progress / 100) * circumference

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg className="progress-ring" width={size} height={size}>
        <circle
          className="progress-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
        />
        <circle
          className="progress-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// STREAK BADGE
// =============================================================================

interface StreakBadgeProps {
  count: number
  label?: string
}

export function StreakBadge({ count, label = 'day streak' }: StreakBadgeProps) {
  if (count <= 0) return null

  return (
    <div className="streak-badge">
      <span className="flame">🔥</span>
      <span>{count} {label}</span>
    </div>
  )
}

// =============================================================================
// LIVE INDICATOR
// =============================================================================

interface LiveIndicatorProps {
  label?: string
  className?: string
}

export function LiveIndicator({ label = 'Live', className = '' }: LiveIndicatorProps) {
  return (
    <div className={`live-indicator ${className}`}>
      <div className="live-dot" />
      <span className="text-xs font-medium text-emerald-400">{label}</span>
    </div>
  )
}

// =============================================================================
// SKELETON LOADER
// =============================================================================

interface SkeletonProps {
  width?: string | number
  height?: string | number
  className?: string
  rounded?: 'sm' | 'md' | 'lg' | 'full'
}

export function Skeleton({ width, height, className = '', rounded = 'md' }: SkeletonProps) {
  const roundedClasses = {
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    full: 'rounded-full'
  }

  return (
    <div 
      className={`shimmer ${roundedClasses[rounded]} ${className}`}
      style={{ width, height }}
    />
  )
}

// =============================================================================
// MODAL
// =============================================================================

interface ModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: string
  description?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
}

export function Modal({ open, onClose, children, title, description, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) {
      window.addEventListener('keydown', handleEscape)
      return () => window.removeEventListener('keydown', handleEscape)
    }
  }, [open, onClose])

  if (!open) return null

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-[90vw]'
  }

  return createPortal(
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className={`modal w-full ${sizeClasses[size]}`}>
        {(title || description) && (
          <div className="p-6 border-b border-[var(--glass-border)]">
            {title && <h2 className="text-heading text-white">{title}</h2>}
            {description && <p className="text-caption mt-1">{description}</p>}
          </div>
        )}
        <div className="p-6 max-h-[calc(90vh-200px)] overflow-y-auto">
          {children}
        </div>
      </div>
    </>,
    document.body
  )
}

// =============================================================================
// ENCOURAGEMENT MESSAGE (Duolingo-style)
// =============================================================================

interface EncouragementProps {
  message: string
  show: boolean
  onHide: () => void
  duration?: number
}

export function Encouragement({ message, show, onHide, duration = 3000 }: EncouragementProps) {
  useEffect(() => {
    if (show && duration > 0) {
      const timer = setTimeout(onHide, duration)
      return () => clearTimeout(timer)
    }
  }, [show, duration, onHide])

  if (!show) return null

  return createPortal(
    <div className="encouragement">
      <span className="mr-2">✨</span>
      {message}
    </div>,
    document.body
  )
}

// =============================================================================
// CONTEXTUAL NOTIFICATION
// =============================================================================

interface ContextualNotificationProps {
  message: string
  type?: 'success' | 'info'
  position?: { x: number; y: number }
  show: boolean
}

export function ContextualNotification({ message, type = 'success', position, show }: ContextualNotificationProps) {
  if (!show || !position) return null

  return createPortal(
    <div 
      className={`notification-contextual ${type === 'success' ? 'text-emerald-400' : 'text-blue-400'}`}
      style={{ left: position.x, top: position.y - 40 }}
    >
      {type === 'success' && <span className="mr-1">✓</span>}
      {message}
    </div>,
    document.body
  )
}

// =============================================================================
// CURSOR GLOW (follows mouse)
// =============================================================================

export function CursorGlow() {
  const [position, setPosition] = useState({ x: -1000, y: -1000 })

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY })
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  return (
    <div 
      className="cursor-glow" 
      style={{ left: position.x, top: position.y }}
    />
  )
}

// =============================================================================
// KEYBOARD SHORTCUT HINT
// =============================================================================

interface KbdProps {
  children: ReactNode
  className?: string
}

export function Kbd({ children, className = '' }: KbdProps) {
  return (
    <kbd className={`px-2 py-1 text-[10px] font-medium bg-[var(--color-surface)] border border-[var(--glass-border)] rounded text-[var(--color-text-muted)] ${className}`}>
      {children}
    </kbd>
  )
}

// =============================================================================
// EMPTY STATE
// =============================================================================

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      {icon && (
        <div className="w-16 h-16 rounded-2xl bg-[var(--color-surface-elevated)] flex items-center justify-center text-[var(--color-text-muted)] mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-white mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-[var(--color-text-secondary)] max-w-sm mb-4">{description}</p>
      )}
      {action}
    </div>
  )
}

// =============================================================================
// STAT CARD (for metrics)
// =============================================================================

interface StatCardProps {
  label: string
  value: number | string
  icon?: ReactNode
  trend?: { value: number; label?: string }
  loading?: boolean
  accentColor?: string
  onClick?: () => void
}

export function StatCard({ label, value, icon, trend, loading, accentColor, onClick }: StatCardProps) {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    if (typeof value === 'number' && !loading) {
      const duration = 500
      const steps = 20
      const increment = value / steps
      let current = 0
      const interval = duration / steps

      const timer = setInterval(() => {
        current += increment
        if (current >= value) {
          setDisplayValue(value)
          clearInterval(timer)
        } else {
          setDisplayValue(Math.floor(current))
        }
      }, interval)

      return () => clearInterval(timer)
    }
  }, [value, loading])

  return (
    <GlassCard 
      className={`card-metric ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
      hover={!!onClick}
    >
      <div className="relative p-4">
        {/* Accent glow at bottom */}
        {accentColor && (
          <div 
            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-[2px] rounded-full opacity-50"
            style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }}
          />
        )}
        
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-micro mb-2">{label}</p>
            {loading ? (
              <Skeleton width={80} height={36} />
            ) : (
              <p className="text-3xl font-bold text-white font-mono counter-animate">
                {typeof value === 'number' ? displayValue.toLocaleString() : value}
              </p>
            )}
            {trend && (
              <p className={`text-xs mt-1 ${trend.value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
              </p>
            )}
          </div>
          {icon && (
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ 
                background: accentColor ? `linear-gradient(135deg, ${accentColor}30, ${accentColor}10)` : 'var(--color-surface-elevated)',
                color: accentColor || 'var(--color-text-secondary)'
              }}
            >
              {icon}
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  )
}
