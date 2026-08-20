// 轻量 UI 组件集：保持风格统一，样式基于 CSS 变量令牌
import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useEffect
} from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------- Button ----------
type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'soft'
type ButtonSize = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:opacity-90 disabled:opacity-50',
  outline: 'border border-border bg-surface text-text hover:bg-surface-2 disabled:opacity-50',
  ghost: 'text-text-2 hover:bg-surface-2 hover:text-text disabled:opacity-50',
  danger: 'bg-danger text-white hover:opacity-90 disabled:opacity-50',
  soft: 'bg-accent-soft text-accent hover:opacity-80 disabled:opacity-50'
}

export function Button({ variant = 'outline', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors cursor-pointer',
        'focus-visible:outline-2 focus-visible:outline-accent',
        size === 'sm' ? 'h-7 px-2.5 text-[12.5px]' : 'h-8.5 px-3 text-[13px]',
        'disabled:cursor-not-allowed',
        buttonVariants[variant],
        className
      )}
      {...props}
    />
  )
}

// ---------- IconButton ----------
interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  title: string
}

export function IconButton({ title, className, ...props }: IconButtonProps) {
  return (
    <button
      title={title}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-3',
        'hover:bg-surface-2 hover:text-text transition-colors cursor-pointer',
        'focus-visible:outline-2 focus-visible:outline-accent',
        className
      )}
      {...props}
    />
  )
}

// ---------- Input / Textarea / Select ----------
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-8.5 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text',
        'placeholder:text-text-3 focus:border-accent focus:outline-none',
        className
      )}
      {...props}
    />
  )
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-[13px] text-text',
        'placeholder:text-text-3 focus:border-accent focus:outline-none resize-y',
        className
      )}
      {...props}
    />
  )
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-8.5 w-full rounded-lg border border-border bg-surface px-2 text-[13px] text-text',
        'focus:border-accent focus:outline-none cursor-pointer',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-medium text-text-2">{label}</span>
      {children}
      {hint && <span className="text-[11.5px] text-text-3">{hint}</span>}
    </label>
  )
}

// ---------- Modal ----------
interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  width?: string
  /** Esc/点击遮罩是否关闭 */
  dismissable?: boolean
}

export function Modal({ open, onClose, title, children, width = 'max-w-lg', dismissable = true }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && dismissable) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose, dismissable])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && dismissable) onClose()
      }}
    >
      <div
        className={cn(
          'flex max-h-[85vh] w-full flex-col rounded-2xl border border-border bg-surface shadow-xl',
          width
        )}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <div className="text-[15px] font-semibold">{title}</div>
            {dismissable && (
              <IconButton title="关闭" onClick={onClose}>
                <X size={15} />
              </IconButton>
            )}
          </div>
        )}
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

// ---------- ConfirmDialog ----------
interface ConfirmDialogProps {
  open: boolean
  title: string
  message: ReactNode
  confirmText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = '确认',
  danger = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title} width="max-w-sm">
      <div className="text-[13px] text-text-2">{message}</div>
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onCancel}>取消</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
          {confirmText}
        </Button>
      </div>
    </Modal>
  )
}

// ---------- Badge ----------
interface BadgeProps {
  children: ReactNode
  color?: 'default' | 'red' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray'
  className?: string
}

const badgeColors: Record<NonNullable<BadgeProps['color']>, string> = {
  default: 'bg-surface-2 text-text-2',
  red: 'bg-danger-soft text-danger',
  yellow: 'bg-warn-soft text-warn',
  green: 'bg-accent-soft text-success',
  blue: 'bg-accent-soft text-accent',
  purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  gray: 'bg-surface-2 text-text-3'
}

export function Badge({ children, color = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap',
        badgeColors[color],
        className
      )}
    >
      {children}
    </span>
  )
}

// ---------- Checkbox ----------
interface CheckBoxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  className?: string
  title?: string
}

export function CheckBox({ checked, onChange, className, title }: CheckBoxProps) {
  return (
    <button
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!checked)
      }}
      className={cn(
        'flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-colors cursor-pointer',
        checked
          ? 'border-accent bg-accent text-white'
          : 'border-text-3/60 bg-transparent hover:border-accent',
        className
      )}
    >
      {checked && (
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M2 6.5 4.5 9 10 3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}

// ---------- EmptyState ----------
export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      {icon && <div className="text-text-3/60">{icon}</div>}
      <div className="text-[14px] font-medium text-text-2">{title}</div>
      {hint && <div className="max-w-sm text-[12.5px] text-text-3">{hint}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

// ---------- Tag ----------
export function Tag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded border border-border px-1.5 py-px text-[11px] text-text-2">
      #{label}
    </span>
  )
}

// ---------- ProgressBar ----------
export function ProgressBar({ value, color }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color ?? 'var(--color-accent)' }}
      />
    </div>
  )
}
