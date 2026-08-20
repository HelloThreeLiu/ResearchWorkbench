// 全局任务列表：按项目分组（含杂项），支持按项目/状态/标签/截止区间筛选
import { useMemo, useState } from 'react'
import { ListTodo, Plus } from 'lucide-react'
import type { Priority, Task } from '@shared/types'
import { TASK_STATUS_LABELS } from '@shared/types'
import { useStore } from '@/store'
import { useNav } from '@/nav'
import { Button, EmptyState, Input, Select } from '@/components/ui'
import TaskRow from '@/components/TaskRow'
import TaskEditModal from '@/components/TaskEditModal'
import { daysUntil } from '@/lib/date'

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

export default function TasksPage() {
  const tasks = useStore((s) => s.tasks)
  const projects = useStore((s) => s.projects)
  const navigate = useNav((s) => s.navigate)

  const [createOpen, setCreateOpen] = useState(false)
  const [filterProject, setFilterProject] = useState('all')
  const [filterStatus, setFilterStatus] = useState<'all' | Task['status'] | 'undone'>('undone')
  const [filterTag, setFilterTag] = useState('all')
  const [filterDueFrom, setFilterDueFrom] = useState('')
  const [filterDueTo, setFilterDueTo] = useState('')

  const allTags = useMemo(() => {
    const set = new Set<string>()
    tasks.forEach((t) => t.tags.forEach((tag) => set.add(tag)))
    return [...set].sort()
  }, [tasks])

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

  // 分组：项目（进行中排序）在前，杂项最后；组内 截止升序 + 优先级降序
  const groups = useMemo(() => {
    const activeProjects = projects.filter((p) => p.status === 'active')
    const result: Array<{ key: string; name: string; color: string | null; tasks: Task[] }> = []
    for (const p of activeProjects) {
      const list = filtered.filter((t) => t.project_id === p.id)
      if (list.length > 0) result.push({ key: p.id, name: p.name, color: p.color, tasks: list })
    }
    const misc = filtered.filter((t) => !t.project_id || !projects.find((p) => p.id === t.project_id))
    if (misc.length > 0) result.push({ key: '__misc__', name: '杂项（无项目）', color: null, tasks: misc })
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
    <div className="mx-auto max-w-4xl px-7 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">任务</h1>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          <Plus size={14} /> 新建任务
        </Button>
      </div>

      {/* 筛选栏 */}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2.5">
        <Select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="w-40"
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
          className="w-32"
        >
          <option value="undone">未完成</option>
          <option value="all">全部状态</option>
          {Object.entries(TASK_STATUS_LABELS).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </Select>
        <Select value={filterTag} onChange={(e) => setFilterTag(e.target.value)} className="w-32">
          <option value="all">全部标签</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              #{t}
            </option>
          ))}
        </Select>
        <div className="flex items-center gap-1.5 text-[12px] text-text-3">
          截止
          <Input
            type="date"
            value={filterDueFrom}
            onChange={(e) => setFilterDueFrom(e.target.value)}
            className="w-35"
          />
          ～
          <Input
            type="date"
            value={filterDueTo}
            onChange={(e) => setFilterDueTo(e.target.value)}
            className="w-35"
          />
        </div>
        {(filterProject !== 'all' ||
          filterStatus !== 'undone' ||
          filterTag !== 'all' ||
          filterDueFrom ||
          filterDueTo) && (
          <button
            className="text-[12px] text-accent hover:underline cursor-pointer"
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

      {groups.length === 0 ? (
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
      )}

      <TaskEditModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}
