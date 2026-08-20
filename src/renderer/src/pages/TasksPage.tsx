// 全局任务列表：按项目分组（含杂项），支持按项目/状态/标签/截止区间筛选；列表/看板双视图
import { useMemo, useState } from 'react'
import { Columns3, ListTodo, Plus } from 'lucide-react'
import type { Priority, Task } from '@shared/types'
import { TASK_STATUS_LABELS } from '@shared/types'
import { useStore } from '@/store'
import { useNav } from '@/nav'
import { useAllTags } from '@/hooks/useVocab'
import { Badge, Button, EmptyState, Input, Select } from '@/components/ui'
import TaskRow from '@/components/TaskRow'
import TaskEditModal from '@/components/TaskEditModal'
import { cn } from '@/lib/utils'
import { countdownText, daysUntil, formatDate } from '@/lib/date'

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

const KANBAN_COLUMNS: Array<Task['status']> = ['todo', 'in_progress', 'done']

export default function TasksPage() {
  const tasks = useStore((s) => s.tasks)
  const projects = useStore((s) => s.projects)
  const navigate = useNav((s) => s.navigate)
  const allTags = useAllTags()

  const [createOpen, setCreateOpen] = useState(false)
  const [filterProject, setFilterProject] = useState('all')
  const [filterStatus, setFilterStatus] = useState<'all' | Task['status'] | 'undone'>('undone')
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
    <div className="px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">任务</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border p-0.5">
            {(
              [
                ['list', '列表', <ListTodo key="l" size={13} />],
                ['kanban', '看板', <Columns3 key="k" size={13} />]
              ] as const
            ).map(([v, label, icon]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'flex items-center gap-1 rounded-md px-2.5 py-1 text-[12.5px] transition-colors cursor-pointer',
                  view === v ? 'bg-accent-soft font-medium text-accent' : 'text-text-2 hover:text-text'
                )}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus size={14} /> 新建任务
          </Button>
        </div>
      </div>

      {/* 筛选栏（单行，窄窗口可横向滑动） */}
      <div className="mt-4 flex items-center gap-2 overflow-x-auto rounded-xl border border-border bg-surface p-2">
        <Select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="min-w-30 flex-[1.3]"
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
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
          className="min-w-24 flex-1"
        >
          <option value="undone">未完成</option>
          <option value="all">全部状态</option>
          {Object.entries(TASK_STATUS_LABELS).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </Select>
        <Select value={filterTag} onChange={(e) => setFilterTag(e.target.value)} className="min-w-24 flex-1">
          <option value="all">全部标签</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              #{t}
            </option>
          ))}
        </Select>
        <div className="flex shrink-0 items-center gap-1" title="截止日期区间">
          <Input
            type="date"
            value={filterDueFrom}
            onChange={(e) => setFilterDueFrom(e.target.value)}
            className="w-29"
          />
          <span className="text-text-3">–</span>
          <Input
            type="date"
            value={filterDueTo}
            onChange={(e) => setFilterDueTo(e.target.value)}
            className="w-29"
          />
        </div>
        {(filterProject !== 'all' ||
          filterStatus !== 'undone' ||
          filterTag !== 'all' ||
          filterDueFrom ||
          filterDueTo) && (
          <button
            className="shrink-0 whitespace-nowrap px-1 text-[12px] text-accent hover:underline cursor-pointer"
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
      </div>

      {view === 'list' ? (
        groups.length === 0 ? (
          <EmptyState icon={<ListTodo size={30} />} title="没有符合条件的任务" hint="调整筛选条件，或新建一个任务。" />
        ) : (
          <div className="mt-4 flex flex-col gap-5">
            {groups.map((g) => (
              <section key={g.key}>
                <div className="mb-1 flex items-center gap-2 px-1">
                  {g.color ? (
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: g.color }} />
                  ) : (
                    <span className="h-2.5 w-2.5 rounded-full border border-dashed border-text-3" />
                  )}
                  <button
                    className="text-[13px] font-medium text-text-2 hover:text-accent cursor-pointer"
                    onClick={() =>
                      g.key !== '__misc__' &&
                      navigate({ name: 'project-detail', projectId: g.key, tab: 'tasks' })
                    }
                  >
                    {g.name}
                  </button>
                  <span className="text-[11px] text-text-3">{g.tasks.length}</span>
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
            ))}
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
    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
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
              'flex min-h-60 flex-col gap-2 rounded-xl border border-border bg-surface/60 p-2.5 transition-colors',
              dragOverCol === col && dragTaskId && 'border-accent/60 bg-accent-soft/40'
            )}
          >
            <div className="flex items-center justify-between px-0.5">
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
                    'cursor-grab rounded-lg border border-border bg-surface p-2.5 shadow-sm transition-all',
                    'hover:border-accent/50 hover:shadow',
                    dragTaskId === t.id && 'opacity-40',
                    t.status === 'done' && 'opacity-80'
                  )}
                >
                  <div className={cn('text-[13px] leading-snug', t.status === 'done' && 'text-text-3 line-through')}>
                    {t.title}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-text-3">
                    {project && (
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: project.color }} />
                        {project.name}
                      </span>
                    )}
                    {t.due_date && (
                      <span className={overdue ? 'font-medium text-danger' : ''}>
                        {formatDate(t.due_date)}（{countdownText(daysUntil(t.due_date))}）
                      </span>
                    )}
                    {t.priority === 'high' && <Badge color="red">高优先</Badge>}
                    {t.tags.slice(0, 2).map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </div>
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
