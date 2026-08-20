// 日历：月视图（默认）/周视图；任务截止日按项目颜色标记，节点用类型图标区分
// 同一天多条内容折叠为「+N 更多」；点击某天查看明细并可添加任务/节点
import { useMemo, useState } from 'react'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileText,
  Flag,
  GraduationCap,
  MapPin,
  Plus,
  Presentation,
  SearchCheck,
  Send
} from 'lucide-react'
import type { Milestone, Task } from '@shared/types'
import { MILESTONE_TYPE_LABELS } from '@shared/types'
import { useStore } from '@/store'
import { useNav } from '@/nav'
import { Badge, Button, CheckBox, Modal } from '@/components/ui'
import TaskEditModal from '@/components/TaskEditModal'
import MilestoneEditModal from '@/components/MilestoneEditModal'
import { cn } from '@/lib/utils'
import { daysUntil, dayjs } from '@/lib/date'

const MILESTONE_ICONS: Record<Milestone['type'], typeof Flag> = {
  proposal: FileText,
  submission: Send,
  conference: Presentation,
  midterm: SearchCheck,
  defense: GraduationCap,
  other: MapPin
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

type CalendarItem =
  | { kind: 'task'; task: Task; color: string | undefined }
  | { kind: 'milestone'; milestone: Milestone; color: string | undefined }

export default function CalendarPage({ focusDate }: { focusDate?: string }) {
  const tasks = useStore((s) => s.tasks)
  const milestones = useStore((s) => s.milestones)
  const projects = useStore((s) => s.projects)
  const navigate = useNav((s) => s.navigate)

  const [view, setView] = useState<'month' | 'week'>('month')
  const [cursor, setCursor] = useState(dayjs(focusDate ?? undefined))
  const [detailDate, setDetailDate] = useState<string | null>(null)
  const [addTaskFor, setAddTaskFor] = useState<string | null>(null)
  const [addMilestoneFor, setAddMilestoneFor] = useState<string | null>(null)

  const projectColor = useMemo(() => new Map(projects.map((p) => [p.id, p.color])), [projects])

  /** 日期 → 当日内容（任务截止 + 节点） */
  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>()
    const push = (date: string, item: CalendarItem): void => {
      const list = map.get(date) ?? []
      list.push(item)
      map.set(date, list)
    }
    for (const t of tasks) {
      if (!t.due_date) continue
      push(t.due_date, { kind: 'task', task: t, color: t.project_id ? projectColor.get(t.project_id) : undefined })
    }
    for (const m of milestones) {
      push(m.date, { kind: 'milestone', milestone: m, color: m.project_id ? projectColor.get(m.project_id) : undefined })
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.kind === 'milestone' ? -1 : 1) - (b.kind === 'milestone' ? -1 : 1))
    }
    return map
  }, [tasks, milestones, projectColor])

  // 月视图：从本月第一周的周一开始，共 6 周 42 格
  const monthCells = useMemo(() => {
    const first = cursor.startOf('month').startOf('week')
    return Array.from({ length: 42 }, (_, i) => first.add(i, 'day'))
  }, [cursor])

  // 周视图：光标所在周（周一起）
  const weekCells = useMemo(() => {
    const start = cursor.startOf('week')
    return Array.from({ length: 7 }, (_, i) => start.add(i, 'day'))
  }, [cursor])

  const today = dayjs().format('YYYY-MM-DD')
  const shift = (amount: number): void =>
    setCursor((c) => c.add(amount, view === 'month' ? 'month' : 'week'))

  const title =
    view === 'month'
      ? cursor.format('YYYY年M月')
      : `${weekCells[0].format('M月D日')} – ${weekCells[6].format('M月D日')}`

  const openTask = (task: Task): void => {
    if (task.project_id) {
      navigate({ name: 'project-detail', projectId: task.project_id, tab: 'tasks' })
    } else {
      setDetailDate(null)
      setAddTaskFor(null)
      navigate({ name: 'tasks' })
    }
  }

  const cellClass = (date: dayjs.Dayjs): string =>
    cn(
      'min-w-0',
      date.format('YYYY-MM') !== cursor.format('YYYY-MM') && 'opacity-40',
      date.format('YYYY-MM-DD') === today && 'bg-accent-soft/50'
    )

  return (
    <div className="mx-auto max-w-6xl px-7 py-6">
      {/* 工具栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">日历</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => shift(-1)}
              className="rounded-lg p-1.5 text-text-2 hover:bg-surface-2 cursor-pointer"
              title={view === 'month' ? '上个月' : '上一周'}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setCursor(dayjs())}
              className="rounded-lg px-2.5 py-1 text-[12.5px] text-text-2 hover:bg-surface-2 cursor-pointer"
            >
              今天
            </button>
            <button
              onClick={() => shift(1)}
              className="rounded-lg p-1.5 text-text-2 hover:bg-surface-2 cursor-pointer"
              title={view === 'month' ? '下个月' : '下一周'}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <span className="text-[14px] font-medium">{title}</span>
        </div>
        <div className="flex rounded-lg border border-border p-0.5">
          {(['month', 'week'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'rounded-md px-3 py-1 text-[12.5px] transition-colors cursor-pointer',
                view === v ? 'bg-accent-soft font-medium text-accent' : 'text-text-2 hover:text-text'
              )}
            >
              {v === 'month' ? '月视图' : '周视图'}
            </button>
          ))}
        </div>
      </div>

      {/* 星期表头 */}
      <div className="mt-4 grid grid-cols-7 border-b border-border pb-1.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-[11.5px] font-medium text-text-3">
            周{w}
          </div>
        ))}
      </div>

      {/* 月视图网格 */}
      {view === 'month' ? (
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border">
          {monthCells.map((date) => {
            const key = date.format('YYYY-MM-DD')
            const items = itemsByDate.get(key) ?? []
            const visible = items.slice(0, 3)
            const more = items.length - visible.length
            return (
              <div
                key={key}
                className={cn('min-h-[86px] cursor-pointer bg-surface p-1.5 transition-colors hover:bg-surface-2/50', cellClass(date))}
                onClick={() => setDetailDate(key)}
              >
                <div
                  className={cn(
                    'mb-1 inline-flex h-5.5 min-w-5.5 items-center justify-center rounded-full px-1 text-[11.5px]',
                    key === today ? 'bg-accent font-semibold text-white' : 'text-text-2'
                  )}
                >
                  {date.date()}
                </div>
                <div className="flex flex-col gap-0.5">
                  {visible.map((item) => (
                    <CellItem key={itemKey(item)} item={item} onOpen={() => openItem(item)} />
                  ))}
                  {more > 0 && (
                    <button
                      className="pl-0.5 text-left text-[10.5px] text-text-3 hover:text-accent"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDetailDate(key)
                      }}
                    >
                      +{more} 更多
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* 周视图 */
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border">
          {weekCells.map((date) => {
            const key = date.format('YYYY-MM-DD')
            const items = itemsByDate.get(key) ?? []
            return (
              <div
                key={key}
                className={cn('min-h-[320px] cursor-pointer bg-surface p-2 transition-colors hover:bg-surface-2/50', cellClass(date))}
                onClick={() => setDetailDate(key)}
              >
                <div
                  className={cn(
                    'mb-1.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[12px]',
                    key === today ? 'bg-accent font-semibold text-white' : 'text-text-2'
                  )}
                >
                  {date.date()} 日
                </div>
                <div className="flex flex-col gap-1">
                  {items.map((item) => (
                    <CellItem key={itemKey(item)} item={item} onOpen={() => openItem(item)} expanded />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 当日明细 */}
      <DayDetailModal
        date={detailDate}
        items={detailDate ? itemsByDate.get(detailDate) ?? [] : []}
        onClose={() => setDetailDate(null)}
        onAddTask={(date) => {
          setDetailDate(null)
          setAddTaskFor(date)
        }}
        onAddMilestone={(date) => {
          setDetailDate(null)
          setAddMilestoneFor(date)
        }}
        onOpenTask={openTask}
      />

      <TaskEditModal
        open={addTaskFor !== null}
        defaults={addTaskFor ? { due_date: addTaskFor } : undefined}
        onClose={() => setAddTaskFor(null)}
      />
      <MilestoneEditModal
        open={addMilestoneFor !== null}
        defaults={addMilestoneFor ? { date: addMilestoneFor } : undefined}
        onClose={() => setAddMilestoneFor(null)}
      />
    </div>
  )

  function openItem(item: CalendarItem): void {
    if (item.kind === 'task') openTask(item.task)
    else {
      setDetailDate(null)
      navigate({ name: 'milestones' })
    }
  }
}

function itemKey(item: CalendarItem): string {
  return item.kind === 'task' ? `t-${item.task.id}` : `m-${item.milestone.id}`
}

/** 格子内条目：任务用项目颜色圆点，节点用类型图标 */
function CellItem({
  item,
  onOpen,
  expanded
}: {
  item: CalendarItem
  onOpen: () => void
  expanded?: boolean
}) {
  if (item.kind === 'task') {
    const done = item.task.status === 'done'
    const overdue = !done && item.task.due_date !== null && daysUntil(item.task.due_date) < 0
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          onOpen()
        }}
        className={cn(
          'flex w-full items-center gap-1 overflow-hidden rounded px-1 py-0.5 text-left text-[10.5px] leading-tight transition-colors hover:bg-surface-2',
          done ? 'text-text-3 line-through' : overdue ? 'text-danger' : 'text-text-2'
        )}
        title={item.task.title}
      >
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: item.color ?? 'var(--color-text-3)' }}
        />
        <span className="truncate">{item.task.title}</span>
      </button>
    )
  }
  const Icon = MILESTONE_ICONS[item.milestone.type]
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onOpen()
      }}
      className={cn(
        'flex w-full items-center gap-1 overflow-hidden rounded bg-accent-soft/70 px-1 py-0.5 text-left text-[10.5px] leading-tight text-accent transition-colors hover:bg-accent-soft',
        item.milestone.status === 'done' && 'opacity-50 line-through',
        expanded && 'py-1 text-[11.5px]'
      )}
      title={`${MILESTONE_TYPE_LABELS[item.milestone.type]} · ${item.milestone.title}`}
    >
      <Icon size={10} className="shrink-0" />
      <span className="truncate">{item.milestone.title}</span>
    </button>
  )
}

/** 当日明细浮层：条目列表 + 添加任务/节点 */
function DayDetailModal({
  date,
  items,
  onClose,
  onAddTask,
  onAddMilestone,
  onOpenTask
}: {
  date: string | null
  items: CalendarItem[]
  onClose: () => void
  onAddTask: (date: string) => void
  onAddMilestone: (date: string) => void
  onOpenTask: (task: Task) => void
}) {
  const updateTask = useStore((s) => s.updateTask)
  const updateMilestone = useStore((s) => s.updateMilestone)
  if (!date) return null
  return (
    <Modal open={date !== null} onClose={onClose} title={dayjs(date).format('M月D日 dddd')} width="max-w-md">
      {items.length === 0 && (
        <div className="py-4 text-center text-[12.5px] text-text-3">这天没有安排</div>
      )}
      <div className="flex flex-col gap-1">
        {items.map((item) => {
          if (item.kind === 'task') {
            return (
              <div key={itemKey(item)} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2/60">
                <CheckBox
                  checked={item.task.status === 'done'}
                  onChange={(v) => updateTask(item.task.id, { status: v ? 'done' : 'todo' })}
                />
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color ?? 'var(--color-text-3)' }}
                />
                <button
                  className={cn(
                    'min-w-0 flex-1 truncate text-left text-[13px] hover:text-accent cursor-pointer',
                    item.task.status === 'done' && 'text-text-3 line-through'
                  )}
                  onClick={() => onOpenTask(item.task)}
                >
                  {item.task.title}
                </button>
                <Badge color="gray">任务</Badge>
              </div>
            )
          }
          const Icon = MILESTONE_ICONS[item.milestone.type]
          return (
            <div key={itemKey(item)} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2/60">
              <CheckBox
                checked={item.milestone.status === 'done'}
                onChange={(v) => updateMilestone(item.milestone.id, { status: v ? 'done' : 'pending' })}
              />
              <Icon size={13} className="shrink-0 text-accent" />
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-[13px]',
                  item.milestone.status === 'done' && 'text-text-3 line-through'
                )}
              >
                {item.milestone.title}
              </span>
              <Badge color="blue">{MILESTONE_TYPE_LABELS[item.milestone.type]}</Badge>
            </div>
          )
        })}
      </div>
      <div className="mt-4 flex gap-2 border-t border-border pt-3.5">
        <Button size="sm" onClick={() => onAddTask(date)}>
          <Plus size={12.5} /> 添加任务
        </Button>
        <Button size="sm" onClick={() => onAddMilestone(date)}>
          <CalendarDays size={12.5} /> 添加节点
        </Button>
      </div>
    </Modal>
  )
}
