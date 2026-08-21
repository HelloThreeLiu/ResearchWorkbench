// 轻量 UI 组件集（V3 设计规范实现，规范见 design/V3-DESIGN-SPEC.md）
// 字号 7 档 / 圆角 token / 卡片 18-20 内边距 —— 页面内不得绕开组件手写等价物
import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useEffect,
  useRef
} from 'react'
import { CalendarDays, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------- PageHeader（V3 §3.3 页头范式） ----------
export function PageHeader({
  title,
  sub,
  actions
}: {
  title: ReactNode
  sub?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        {sub && (
          <div className="mt-1.5 max-w-160 text-[12.5px] leading-relaxed text-text-3">{sub}</div>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2 pt-0.5">{actions}</div>}
    </div>
  )
}

// ---------- Button ----------
type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'soft'
type ButtonSize = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:brightness-110 disabled:opacity-50',
  outline: 'border border-border bg-surface text-text hover:bg-surface-2 disabled:opacity-50',
  ghost: 'text-text-2 hover:bg-surface-2 hover:text-text disabled:opacity-50',
  danger: 'bg-danger text-white hover:brightness-110 disabled:opacity-50',
  soft: 'bg-accent-soft text-accent hover:brightness-97 disabled:opacity-50'
}

export function Button({ variant = 'outline', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all cursor-pointer',
        'focus-visible:outline-2 focus-visible:outline-accent',
        size === 'sm' ? 'h-7 px-2.5 text-[12.5px]' : 'h-8 px-3.5 text-[13px]',
        '[&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:stroke-[2]',
        size === 'sm' && '[&_svg]:h-3 [&_svg]:w-3',
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
        '[&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:stroke-[1.9]',
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
        'h-8 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text',
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
        'h-8 w-full cursor-pointer appearance-none overflow-hidden rounded-lg border border-border bg-surface px-2.5 pr-6 text-[13px] text-text text-ellipsis',
        'focus:border-accent focus:outline-none',
        className
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%238a8f98' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 8px center',
        ...(props.style ?? {})
      }}
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
/** 模态栈：Esc 只关闭最上层的弹窗（支持嵌套，如节点弹窗内打开词汇库管理） */
const modalStack: symbol[] = []

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
  const instanceIdRef = useRef<symbol>(Symbol('modal'))

  useEffect(() => {
    if (!open) return
    const id = instanceIdRef.current
    modalStack.push(id)
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && dismissable && modalStack[modalStack.length - 1] === id) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => {
      const idx = modalStack.indexOf(id)
      if (idx >= 0) modalStack.splice(idx, 1)
      window.removeEventListener('keydown', handler)
    }
  }, [open, onClose, dismissable])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 sm:p-6"
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
  green: 'bg-accent-soft/60 text-success',
  blue: 'bg-accent-soft text-accent',
  purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  gray: 'bg-surface-2 text-text-3'
}

export function Badge({ children, color = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-md px-2 text-[11.5px] font-medium whitespace-nowrap [&_svg]:h-[11px] [&_svg]:w-[11px]',
        badgeColors[color],
        className
      )}
    >
      {children}
    </span>
  )
}

// ---------- Chip（筛选胶囊，V3 §4 FilterToolbar） ----------
export function Chip({
  active,
  onClick,
  children,
  title
}: {
  active?: boolean
  onClick?: () => void
  children: ReactNode
  title?: string
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] whitespace-nowrap transition-colors cursor-pointer',
        '[&_svg]:h-3 [&_svg]:w-3',
        active
          ? 'bg-accent-soft font-semibold text-accent'
          : 'text-text-2 hover:bg-surface-2 hover:text-text'
      )}
    >
      {children}
    </button>
  )
}

/** Chip 内的计数 */
export function ChipCount({ children }: { children: ReactNode }) {
  return <span className="text-[11px] opacity-75">{children}</span>
}

// ---------- FilterBar（V3 §4：筛选工具条双区结构） ----------
/** 左区 Chips/搜索自然流动可换行；右区筛选控件锚定右侧、永不孤行换行 */
export function FilterBar({ children, filters }: { children: ReactNode; filters?: ReactNode }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border border-border bg-surface px-2.5 py-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>
      {filters && (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{filters}</div>
      )}
    </div>
  )
}

// ---------- Segmented（二态视图切换，V3 §4） ----------
export function Segmented<T extends string>({
  value,
  onChange,
  options
}: {
  value: T
  onChange: (v: T) => void
  options: Array<{ value: T; label: ReactNode }>
}) {
  return (
    <div className="inline-flex gap-0.5 rounded-lg bg-surface-2 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'inline-flex h-6.5 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] transition-colors cursor-pointer [&_svg]:h-3 [&_svg]:w-3 [&_svg]:stroke-2',
            value === opt.value
              ? 'bg-surface font-semibold text-text shadow-sm'
              : 'text-text-2 hover:text-text'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ---------- DueChip（截止徽章，V3 §4） ----------
export function DueChip({
  text,
  tone = 'default',
  className
}: {
  text: ReactNode
  tone?: 'default' | 'today' | 'overdue'
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5.5 items-center gap-1 rounded-md px-2 text-[11.5px] whitespace-nowrap [&_svg]:h-3 [&_svg]:w-3',
        tone === 'overdue' && 'bg-danger-soft font-semibold text-danger',
        tone === 'today' && 'bg-warn-soft font-semibold text-warn',
        tone === 'default' && 'text-text-3',
        className
      )}
    >
      <CalendarDays />
      {text}
    </span>
  )
}

// ---------- CheckBox ----------
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
        'flex h-4 w-4 shrink-0 items-center justify-center rounded-[4.5px] border transition-colors cursor-pointer',
        checked
          ? 'border-accent bg-accent text-white'
          : 'border-text-3/60 bg-transparent hover:border-accent',
        className
      )}
    >
      {checked && (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M2 6.5 4.5 9 10 3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}

// ---------- EmptyState ----------
export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-11 text-center">
      {icon && (
        <div className="mb-1 flex h-13 w-13 items-center justify-center rounded-full bg-surface-2 text-text-3 [&_svg]:h-5.5 [&_svg]:w-5.5 [&_svg]:stroke-[1.6]">
          {icon}
        </div>
      )}
      <div className="text-sm font-semibold text-text-2">{title}</div>
      {hint && <div className="max-w-80 text-[12.5px] leading-relaxed text-text-3">{hint}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

// ---------- Tag（标签 chip） ----------
export function Tag({ label }: { label: string }) {
  return (
    <span className="inline-flex h-[19px] items-center rounded-[5px] border border-border px-1.5 text-[11px] text-text-2">
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

// ---------- StatCard（统计大卡，V3 §4） ----------
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  onClick
}: {
  label: string
  value: ReactNode
  hint?: string
  icon: ReactNode
  tone?: 'default' | 'warn' | 'danger'
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3.5 rounded-xl border border-border bg-surface px-4.5 py-4 text-left transition-all cursor-pointer hover:-translate-y-px hover:border-accent/50"
    >
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg [&_svg]:h-4.5 [&_svg]:w-4.5 [&_svg]:stroke-2',
          tone === 'danger' ? 'bg-danger-soft text-danger' : tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-accent-soft text-accent'
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            'block text-[23px] leading-tight font-bold tabular-nums',
            tone === 'danger' && 'text-danger',
            tone === 'warn' && 'text-warn'
          )}
        >
          {value}
        </span>
        <span className="block text-[12.5px] text-text-2">{label}</span>
        {hint && <span className="block truncate text-[11.5px] text-text-3">{hint}</span>}
      </span>
    </button>
  )
}
