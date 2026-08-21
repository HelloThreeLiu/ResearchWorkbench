// 全局任务（V3 §5.5）：按项目分组，列表/看板双视图；FilterBar 双区筛选（Chips 流动 + 维度筛选锚定右侧）
import { useMemo, useState } from 'react'
import { Columns3, ListTodo, Plus } from 'lucide-react'
import dayjs from 'dayjs'
import type { Priority, Task } from '@shared/types'
import { TASK_STATUS_LABELS } from '@shared/types'
import { useStore } from '@/store'
import { useNav } from '@/nav'
import { useAllTags } from '@/hooks/useVocab'
import {
  Badge,
  Button,
  Chip,
  ChipCount,
  DueChip,
  EmptyState,
  FilterBar,
  Input,
  PageHeader,
  Segmented,
  Select
} from '@/components/ui'
import TaskRow from '@/components/TaskRow'
import TaskEditModal from '@/components/TaskEditModal'
import { cn } from '@/lib/utils'
import { countdownText, daysUntil, formatDate } from '@/lib/date'

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

const KANBAN_COLUMNS: Array<Task['status']> = ['todo', 'in_progress', 'done']

type StatusFilter = 'all' | 'undone' | Task['status']

const STATUS_CHIPS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'undone', label: '未完成' },
  { value: 'todo', label: TASK_STATUS_LABELS.todo },
  { value: 'in_progress', label: TASK_STATUS_LABELS.in_progress },
  { value: 'done', label: TASK_STATUS_LABELS.done }
]

/** 截止筛选预设：收敛为单下拉，自定义时才展开区间输入框 */
type DuePreset = 'all' | 'overdue' | 'today' | 'd7' | 'd30' | 'custom'

const DUE_PRESET_LABELS: Record<DuePreset, string> = {
  all: '全部',
  overdue: '已逾期',
  today: '今天',
  d7: '未来 7 天',
  d30: '未来 30 天',
  custom: '自定义…'
}

const duePresetOf = (from: string, to: string): DuePreset => {
  const today = dayjs().format('YYYY-MM-DD')
  if (!from && !to) return 'all'
  if (!from && to === dayjs().subtract(1, 'day').format('YYYY-MM-DD')) return 'overdue'
  if (from === today && to === today) return 'today'
  if (from === today && to === dayjs().add(6, 'day').format('YYYY-MM-DD')) return 'd7'
  if (from === today && to === dayjs().add(29, 'day').format('YYYY-MM-DD')) return 'd30'
  return 'custom'
}

const dueDatesOf = (preset: DuePreset): { from: string; to: string } => {
  const today = dayjs().format('YYYY-MM-DD')
  switch (preset) {
    case 'overdue':
      return { from: '', to: dayjs().subtract(1, 'day').format('YYYY-MM-DD') }
    case 'today':
      return { from: today, to: today }
    case 'd7':
      return { from: today, to: dayjs().add(6, 'day').format('YYYY-MM-DD') }
    case 'd30':
      return { from: today, to: dayjs().add(29, 'day').format('YYYY-MM-DD') }
    default:
      // 自定义展开为「今天起两周」——刻意避开预设值，避免下拉又跳回预设项
      return { from: today, to: dayjs().add(13, 'day').format('YYYY-MM-DD') }
  }
}

export default function TasksPage() {
  const tasks = useStore((s) => s.tasks)
  const projects = useStore((s) => s.projects)
  const navigate = useNav((s) => s.navigate)
  const allTags = useAllTags()

  const [createOpen, setCreateOpen] = useState(false)
  const [filterProject, setFilterProject] = useState('all')
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('undone')
  const [filterTag, setFilterTag] = useState('all')
  const [filterDueFrom, setFilterDueFrom] = useState('')
  const [filterDueTo, setFilterDueTo] = useState('')
  const [view, setView] = useState<'list' | 'kanban'>('list')
  const [dragTaskId, setDragTaskId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<Task['status'] | null>(null)

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filterProject === '__none__') {
        if (t.project_id !== null) return false
      } else if (filterProject !== 'all' && t.project_id !== filterProject) {
        return false
      }
      if (filterStatus === 'undone') {
        if (t.status === 'done') return false
      } else if (filterStatus !== 'all' && t.status !== filterStatus) {
        return false
      }
      if (filterTag !== 'all' && !t.tags.includes(filterTag)) return false
      if (filterDueFrom && (!t.due_date || t.due_date < filterDueFrom)) return false
      if (filterDueTo && (!t.due_date || t.due_date > filterDueTo)) return false
      return true
    })
  }, [tasks, filterProject, filterStatus, filterTag, filterDueFrom, filterDueTo])

  const hasFilter =
    filterProject !== 'all' ||
    filterStatus !== 'undone' ||
    filterTag !== 'all' ||
    filterDueFrom !== '' ||
    filterDueTo !== ''

  const countOf = (f: StatusFilter): number =>
    tasks.filter((t) =>
      f === 'all' ? true : f === 'undone' ? t.status !== 'done' : t.status === f
    ).length

  // 分组：进行中项目在前；已完成/归档项目与无项目任务归入「其他」
  const groups = useMemo(() => {
    const activeProjects = projects.filter((p) => p.status === 'active')
    const result: Array<{ key: string; name: string; color: string | null; tasks: Task[] }> = []
    for (const p of activeProjects) {
      const list = filtered.filter((t) => t.project_id === p.id)
      if (list.length > 0) result.push({ key: p.id, name: p.name, color: p.color, tasks: list })
    }
    const misc = filtered.filter((t) => {
      if (!t.project_id) return true
      const project = projects.find((p) => p.id === t.project_id)
      return !project || project.status !== 'active'
    })
    if (misc.length > 0) result.push({ key: '__misc__', name: '其他（杂项与归档项目）', color: null, tasks: misc })
    for (const g of result) {
      g.tasks.sort((a, b) => {
        if (a.due_date !== b.due_date) {
          if (!a.due_date) return 1
          if (!b.due_date) return -1
          return a.due_date < b.due_date ? -1 : 1
        }
        return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      })
      // 逾期置顶
      g.tasks.sort((a, b) => {
        const ao = a.status !== 'done' && a.due_date && daysUntil(a.due_date) < 0 ? 0 : 1
        const bo = b.status !== 'done' && b.due_date && daysUntil(b.due_date) < 0 ? 0 : 1
        return ao - bo
      })
    }
    return result
  }, [filtered, projects])

  return (
    <div className="page">
      <PageHeader
        title="任务"
        sub="按项目分组，逾期自动置顶；列表看细节，看板看全局"
        actions={
          <>
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'list', label: <><Columns3 className="rotate-90" />列表</> },
                { value: 'kanban', label: <><Columns3 />看板</> }
              ]}
            />
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus /> 新建任务
            </Button>
          </>
        }
      />

      {/* 筛选工具条（V3 FilterBar）：状态 Chips 流动 ‖ 项目/标签/截止锚定右侧 */}
      <FilterBar
        filters={
          <>
            <Select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className="h-7 w-auto min-w-28 max-w-44 shrink-0 text-[12.5px]"
            >
              <option value="all">全部项目</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="__none__">仅杂项任务</option>
            </Select>
            <Select
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              className="h-7 w-auto min-w-24 max-w-36 shrink-0 text-[12.5px]"
            >
              <option value="all">全部标签</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  #{t}
                </option>
              ))}
            </Select>
            <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-text-3">
              截止
              <Select
                value={duePresetOf(filterDueFrom, filterDueTo)}
                onChange={(e) => {
                  const { from, to } = dueDatesOf(e.target.value as DuePreset)
                  setFilterDueFrom(from)
                  setFilterDueTo(to)
                }}
                className="h-7 w-24 text-[12.5px]"
                title="按截止日期筛选"
              >
                {(Object.keys(DUE_PRESET_LABELS) as Array<DuePreset>).map((p) => (
                  <option key={p} value={p}>
                    {DUE_PRESET_LABELS[p]}
                  </option>
                ))}
              </Select>
              {duePresetOf(filterDueFrom, filterDueTo) === 'custom' && (
                <>
                  <Input
                    type="date"
                    value={filterDueFrom}
                    onChange={(e) => setFilterDueFrom(e.target.value)}
                    className="h-7 w-26 text-[12.5px]"
                  />
                  –
                  <Input
                    type="date"
                    value={filterDueTo}
                    onChange={(e) => setFilterDueTo(e.target.value)}
                    className="h-7 w-26 text-[12.5px]"
                  />
                </>
              )}
            </span>
            {hasFilter && (
              <button
                className="shrink-0 text-[12.5px] text-accent hover:underline cursor-pointer"
                onClick={() => {
                  setFilterProject('all')
                  setFilterStatus('undone')
                  setFilterTag('all')
                  setFilterDueFrom('')
                  setFilterDueTo('')
                }}
              >
                清除筛选
              </button>
            )}
          </>
        }
      >
        {STATUS_CHIPS.map((chip) => (
          <Chip
            key={chip.value}
            active={filterStatus === chip.value}
            onClick={() => setFilterStatus(chip.value)}
          >
            {chip.label} <ChipCount>{countOf(chip.value)}</ChipCount>
          </Chip>
        ))}
      </FilterBar>

      {view === 'list' ? (
        groups.length === 0 ? (
          <EmptyState icon={<ListTodo />} title="没有符合条件的任务" hint="调整筛选条件，或新建一个任务。" />
        ) : (
          <div className="mt-5 flex flex-col gap-5">
            {groups.map((g) => {
              const overdueCount = g.tasks.filter(
                (t) => t.status !== 'done' && t.due_date !== null && daysUntil(t.due_date) < 0
              ).length
              return (
                <section key={g.key}>
                  <div className="mb-1.5 flex items-center gap-2 px-1">
                    {g.color ? (
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: g.color }} />
                    ) : (
                      <span className="h-2 w-2 rounded-full border border-dashed border-text-3" />
                    )}
                    <button
                      className="text-[13px] font-semibold text-text-2 hover:text-accent cursor-pointer"
                      onClick={() =>
                        g.key !== '__misc__' &&
                        navigate({ name: 'project-detail', projectId: g.key, tab: 'tasks' })
                      }
                    >
                      {g.name}
                    </button>
                    <span className="text-[11.5px] text-text-3">{g.tasks.length}</span>
                    {overdueCount > 0 && <Badge color="red">{overdueCount} 逾期</Badge>}
                  </div>
                  <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-surface p-1.5">
                    {g.tasks.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        onDelete={() => useStore.getState().deleteTask(t.id)}
                      />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )
      ) : (
        // 看板：即使筛选结果为空也渲染三列（便于拖入与总览状态分布）
        <KanbanBoard
          tasks={filtered}
          projects={projects}
          dragTaskId={dragTaskId}
          setDragTaskId={setDragTaskId}
          dragOverCol={dragOverCol}
          setDragOverCol={setDragOverCol}
        />
      )}

      <TaskEditModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}

/** 看板：三列（待办/进行中/已完成），卡片拖拽换状态；数据与列表视图完全同源 */
function KanbanBoard({
  tasks,
  projects,
  dragTaskId,
  setDragTaskId,
  dragOverCol,
  setDragOverCol
}: {
  tasks: Task[]
  projects: Array<{ id: string; name: string; color: string }>
  dragTaskId: string | null
  setDragTaskId: (id: string | null) => void
  dragOverCol: Task['status'] | null
  setDragOverCol: (col: Task['status'] | null) => void
}) {
  const updateTask = useStore((s) => s.updateTask)
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])

  const dropOn = (status: Task['status']): void => {
    if (dragTaskId) {
      const task = tasks.find((t) => t.id === dragTaskId)
      if (task && task.status !== status) {
        updateTask(dragTaskId, { status })
      }
    }
    setDragTaskId(null)
    setDragOverCol(null)
  }

  return (
    <div className="mt-5 grid grid-cols-1 items-start gap-4 md:grid-cols-3">
      {KANBAN_COLUMNS.map((col) => {
        const list = tasks
          .filter((t) => t.status === col)
          .sort((a, b) => {
            const rank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
            if (rank !== 0) return rank
            if (a.due_date !== b.due_date) {
              if (!a.due_date) return 1
              if (!b.due_date) return -1
              return a.due_date < b.due_date ? -1 : 1
            }
            return 0
          })
        return (
          <section
            key={col}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOverCol(col)
            }}
            onDragLeave={() => setDragOverCol(null)}
            onDrop={() => dropOn(col)}
            className={cn(
              'flex min-h-60 flex-col gap-2 rounded-xl border border-border bg-surface/60 p-3 transition-colors',
              dragOverCol === col && dragTaskId && 'border-accent/60 bg-accent-soft/40'
            )}
          >
            <div className="flex items-center gap-2 px-0.5 pb-1">
              <span className="text-[13px] font-semibold text-text-2">
                {TASK_STATUS_LABELS[col]}
              </span>
              <Badge color={col === 'done' ? 'green' : col === 'in_progress' ? 'blue' : 'gray'}>
                {list.length}
              </Badge>
            </div>
            {list.length === 0 && (
              <div className="rounded-lg border border-dashed border-border py-6 text-center text-[11.5px] text-text-3">
                拖拽任务卡片到这里
              </div>
            )}
            {list.map((t) => {
              const project = t.project_id ? projectMap.get(t.project_id) : undefined
              const overdue = t.status !== 'done' && t.due_date !== null && daysUntil(t.due_date) < 0
              return (
                <div
                  key={t.id}
                  draggable
                  onDragStart={() => setDragTaskId(t.id)}
                  onDragEnd={() => {
                    setDragTaskId(null)
                    setDragOverCol(null)
                  }}
                  className={cn(
                    'cursor-grab rounded-lg border border-border bg-surface p-3 shadow-sm transition-all',
                    'hover:border-accent/50 hover:shadow',
                    dragTaskId === t.id && 'opacity-40',
                    t.status === 'done' && 'opacity-80'
                  )}
                >
                  <div className={cn('text-[13px] leading-snug', t.status === 'done' && 'text-text-3 line-through')}>
                    {t.title}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-text-3">
                    {project && (
                      <span className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: project.color }} />
                        {project.name}
                      </span>
                    )}
                    {t.priority === 'high' && <Badge color="red">高优先</Badge>}
                    {t.tags.slice(0, 2).map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </div>
                  {t.due_date && (
                    <div className="mt-1.5">
                      <DueChip
                        tone={overdue ? 'overdue' : daysUntil(t.due_date) === 0 ? 'today' : 'default'}
                        text={`${formatDate(t.due_date)} · ${countdownText(daysUntil(t.due_date))}`}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
