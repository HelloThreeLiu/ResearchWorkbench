// 项目详情：概览 / 任务 / 进展日志 / 时间节点 四个 Tab
import { useMemo, useState } from 'react'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import {
  ArrowLeft,
  CalendarPlus,
  Check,
  FileText,
  Flag,
  ListTodo,
  Pencil,
  Plus,
  Trash2
} from 'lucide-react'
import type { ProjectTab } from '@/nav'
import { useNav } from '@/nav'
import { useStore } from '@/store'
import { Badge, Button, CheckBox, ConfirmDialog, EmptyState, Input, ProgressBar, Textarea } from '@/components/ui'
import TaskRow from '@/components/TaskRow'
import TaskEditModal from '@/components/TaskEditModal'
import MilestoneEditModal from '@/components/MilestoneEditModal'
import ProjectEditModal from '@/components/ProjectEditModal'
import { PROJECT_STATUS_LABELS } from '@shared/types'
import { useMilestoneTypeLabel } from '@/hooks/useVocab'
import { cn } from '@/lib/utils'
import { countdownText, daysUntil, formatDate, friendlyDate, todayStr } from '@/lib/date'

const TABS: Array<{ key: ProjectTab; label: string; icon: typeof ListTodo }> = [
  { key: 'overview', label: '概览', icon: FileText },
  { key: 'tasks', label: '任务', icon: ListTodo },
  { key: 'logs', label: '进展日志', icon: Pencil },
  { key: 'milestones', label: '时间节点', icon: Flag }
]

export default function ProjectDetail({
  projectId,
  initialTab
}: {
  projectId: string
  initialTab: ProjectTab
}) {
  const project = useStore((s) => s.projects.find((p) => p.id === projectId))
  const tasks = useStore((s) => s.tasks)
  const logs = useStore((s) => s.logs)
  const milestones = useStore((s) => s.milestones)
  const navigate = useNav((s) => s.navigate)
  const goBack = useNav((s) => s.goBack)

  const [tab, setTab] = useState<ProjectTab>(initialTab)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const projectTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.project_id === projectId)
        .sort((a, b) => {
          // 截止日期升序 + 优先级降序，无截止排最后
          const rank = { high: 0, medium: 1, low: 2 } as const
          if (a.due_date !== b.due_date) {
            if (!a.due_date) return 1
            if (!b.due_date) return -1
            return a.due_date < b.due_date ? -1 : 1
          }
          return rank[a.priority] - rank[b.priority]
        }),
    [tasks, projectId]
  )
  const doneCount = projectTasks.filter((t) => t.status === 'done').length
  const projectLogs = useMemo(
    () => logs.filter((l) => l.project_id === projectId).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [logs, projectId]
  )
  const projectMilestones = useMemo(
    () => milestones.filter((m) => m.project_id === projectId).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [milestones, projectId]
  )

  if (!project) {
    return (
      <div className="p-8">
        <EmptyState title="项目不存在或已删除" />
      </div>
    )
  }

  const doDelete = async (): Promise<void> => {
    await useStore.getState().backupNow() // 删除保护：先备份
    useStore.getState().deleteProject(project.id)
    navigate({ name: 'projects' })
  }

  return (
    <div className="px-4 py-5 sm:px-6">
      {/* 头部 */}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <button
          onClick={goBack}
          className="mt-0.5 shrink-0 rounded-lg p-1.5 text-text-3 hover:bg-surface-2 hover:text-text cursor-pointer"
          title="返回"
        >
          <ArrowLeft size={17} />
        </button>
        <span className="mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 truncate text-lg font-semibold">{project.name}</h1>
            <Badge color={project.status === 'active' ? 'blue' : 'gray'}>
              {PROJECT_STATUS_LABELS[project.status]}
            </Badge>
          </div>
          {project.description && (
            <div className="mt-0.5 text-[12.5px] text-text-2">{project.description}</div>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" onClick={() => setEditOpen(true)}>
            <Pencil size={12.5} /> 编辑
          </Button>
          <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => setDeleteConfirm(true)}>
            <Trash2 size={12.5} />
          </Button>
        </div>
      </div>

      {/* Tab 切换（窄窗口可横向滚动） */}
      <div className="mt-4 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              '-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2 text-[13px] transition-colors cursor-pointer',
              tab === key
                ? 'border-accent font-medium text-accent'
                : 'border-transparent text-text-2 hover:text-text'
            )}
          >
            <Icon size={14} />
            {label}
            {key === 'tasks' && projectTasks.length > 0 && (
              <span className="text-[11px] text-text-3">
                {doneCount}/{projectTasks.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === 'overview' && (
          <OverviewTab
            projectDates={{ start: project.start_date, end: project.end_date }}
            taskStats={{ done: doneCount, total: projectTasks.length }}
            overdueCount={projectTasks.filter(
              (t) => t.status !== 'done' && t.due_date !== null && daysUntil(t.due_date) < 0
            ).length}
            color={project.color}
            milestoneCount={projectMilestones.filter((m) => m.status === 'pending').length}
            logCount={projectLogs.length}
            onOpenTab={setTab}
          />
        )}
        {tab === 'tasks' && <TasksTab projectId={projectId} tasks={projectTasks} />}
        {tab === 'logs' && <LogsTab projectId={projectId} logs={projectLogs} />}
        {tab === 'milestones' && <MilestonesTab projectId={projectId} milestones={projectMilestones} />}
      </div>

      <ProjectEditModal open={editOpen} onClose={() => setEditOpen(false)} project={project} />
      <ConfirmDialog
        open={deleteConfirm}
        title="删除项目"
        message={
          <>
            确定删除项目「{project.name}」吗？
            <br />
            其下任务、节点、进展日志将一并删除。系统会先自动备份，可在数据目录的{' '}
            <code className="rounded bg-surface-2 px-1">backups/</code> 中找回。
          </>
        }
        confirmText="删除"
        danger
        onConfirm={doDelete}
        onCancel={() => setDeleteConfirm(false)}
      />
    </div>
  )
}

// ---------- 概览 ----------
function OverviewTab({
  projectDates,
  taskStats,
  overdueCount,
  milestoneCount,
  logCount,
  color,
  onOpenTab
}: {
  projectDates: { start: string | null; end: string | null }
  taskStats: { done: number; total: number }
  overdueCount: number
  milestoneCount: number
  logCount: number
  color: string
  onOpenTab: (tab: ProjectTab) => void
}) {
  const progress = taskStats.total === 0 ? 0 : Math.round((taskStats.done / taskStats.total) * 100)
  const cards: Array<{ label: string; value: string; hint?: string; tab?: ProjectTab }> = [
    { label: '任务完成', value: `${taskStats.done}/${taskStats.total}`, tab: 'tasks' },
    { label: '逾期任务', value: String(overdueCount), hint: overdueCount > 0 ? '注意跟进' : '一切正常', tab: 'tasks' },
    { label: '待办节点', value: String(milestoneCount), tab: 'milestones' },
    { label: '进展记录', value: String(logCount), tab: 'logs' }
  ]
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between text-[12.5px] text-text-2">
          <span>
            {formatDate(projectDates.start)} 开始
            {projectDates.end ? ` · 预计 ${formatDate(projectDates.end)} 结束` : ''}
          </span>
          <span>{progress}%</span>
        </div>
        <div className="mt-2">
          <ProgressBar value={progress} color={color} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <button
            key={c.label}
            onClick={() => c.tab && onOpenTab(c.tab)}
            className="rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-accent/60 cursor-pointer"
          >
            <div className="text-[11.5px] text-text-3">{c.label}</div>
            <div
              className={cn(
                'mt-1 text-xl font-semibold',
                c.label === '逾期任务' && overdueCount > 0 && 'text-danger'
              )}
            >
              {c.value}
            </div>
            {c.hint && <div className="text-[11px] text-text-3">{c.hint}</div>}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------- 任务 ----------
function TasksTab({ projectId, tasks }: { projectId: string; tasks: ReturnType<typeof useStore.getState>['tasks'] }) {
  const addTask = useStore((s) => s.addTask)
  const [quickTitle, setQuickTitle] = useState('')
  const [editTaskId, setEditTaskId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'todo' | 'done'>('all')

  const editTask = tasks.find((t) => t.id === editTaskId)
  const shown = tasks.filter((t) =>
    filter === 'all' ? true : filter === 'done' ? t.status === 'done' : t.status !== 'done'
  )
  const openTasks = tasks.filter((t) => t.status !== 'done')
  const doneTasks = tasks.filter((t) => t.status === 'done')

  const quickAdd = (): void => {
    const trimmed = quickTitle.trim()
    if (!trimmed) return
    addTask({ title: trimmed, project_id: projectId })
    setQuickTitle('')
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <Input
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && quickAdd()}
          placeholder="添加任务，回车保存；其余字段可点击行内控件或双击补充"
        />
        <Button variant="primary" onClick={quickAdd} disabled={!quickTitle.trim()}>
          <Plus size={14} />
        </Button>
      </div>

      <div className="mt-3 flex items-center gap-1 text-[12px]">
        {(
          [
            ['all', `全部 ${tasks.length}`],
            ['todo', `未完成 ${openTasks.length}`],
            ['done', `已完成 ${doneTasks.length}`]
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              'rounded-lg px-2.5 py-1 transition-colors cursor-pointer',
              filter === key ? 'bg-accent-soft font-medium text-accent' : 'text-text-2 hover:bg-surface-2'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={<ListTodo size={30} />} title="暂无任务" hint="把大目标拆成具体任务，设上截止日。" />
      ) : (
        <div className="mt-2 flex flex-col gap-0.5">
          {shown.map((t) => (
            <div key={t.id} onDoubleClick={() => setEditTaskId(t.id)}>
              <TaskRow
                task={t}
                onDelete={() => useStore.getState().deleteTask(t.id)}
              />
            </div>
          ))}
        </div>
      )}

      <TaskEditModal
        open={editTask !== undefined}
        task={editTask}
        onClose={() => setEditTaskId(null)}
      />
    </div>
  )
}

// ---------- 进展日志 ----------
function renderMarkdown(content: string): string {
  return DOMPurify.sanitize(marked.parse(content, { async: false }) as string)
}

function LogsTab({ projectId, logs }: { projectId: string; logs: ReturnType<typeof useStore.getState>['logs'] }) {
  const addLog = useStore((s) => s.addLog)
  const updateLog = useStore((s) => s.updateLog)
  const deleteLog = useStore((s) => s.deleteLog)

  const [content, setContent] = useState('')
  const [logDate, setLogDate] = useState(todayStr())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')

  const submit = (): void => {
    const trimmed = content.trim()
    if (!trimmed) return
    addLog({ project_id: projectId, date: logDate || todayStr(), content: trimmed })
    setContent('')
  }

  const startEdit = (id: string, current: string): void => {
    setEditingId(id)
    setEditContent(current)
  }

  const saveEdit = (): void => {
    if (editingId && editContent.trim()) {
      updateLog(editingId, { content: editContent.trim() })
    }
    setEditingId(null)
  }

  return (
    <div>
      {/* 记一笔：默认今天，可补记历史日期 */}
      <div className="rounded-xl border border-border bg-surface p-3.5">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[12.5px] font-medium text-text-2">记一笔</span>
          <input
            type="date"
            value={logDate}
            onChange={(e) => setLogDate(e.target.value)}
            className="h-6.5 rounded border border-border bg-surface px-1.5 text-[11.5px] text-text-2"
          />
          <span className="text-[11px] text-text-3">支持 Markdown（列表 / 代码块 / 加粗）</span>
        </div>
        <Textarea
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit()
          }}
          placeholder="今天做了什么？实验结果、与导师讨论的结论、阶段想法…（Ctrl+Enter 保存）"
        />
        <div className="mt-2 flex justify-end">
          <Button variant="primary" size="sm" onClick={submit} disabled={!content.trim()}>
            保存记录
          </Button>
        </div>
      </div>

      {logs.length === 0 ? (
        <EmptyState icon={<FileText size={30} />} title="还没有进展记录" hint="随手记录实验与讨论，写周报时不用回忆。" />
      ) : (
        <div className="relative mt-5 ml-2 flex flex-col gap-4 border-l border-border pl-6">
          {logs.map((log) => (
            <div key={log.id} className="group relative">
              <span className="absolute -left-[30.5px] top-1.5 h-2 w-2 rounded-full border-2 border-surface bg-accent" />
              <div className="rounded-xl border border-border bg-surface p-3.5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[12.5px] font-semibold text-accent">{friendlyDate(log.date)}</span>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(log.id, log.content)}>
                      <Pencil size={12} />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => deleteLog(log.id)}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>
                {editingId === log.id ? (
                  <div>
                    <Textarea rows={4} value={editContent} onChange={(e) => setEditContent(e.target.value)} autoFocus />
                    <div className="mt-2 flex justify-end gap-2">
                      <Button size="sm" onClick={() => setEditingId(null)}>
                        取消
                      </Button>
                      <Button size="sm" variant="primary" onClick={saveEdit}>
                        保存
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="md-body text-text-2" dangerouslySetInnerHTML={{ __html: renderMarkdown(log.content) }} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- 时间节点 ----------
function MilestonesTab({
  projectId,
  milestones
}: {
  projectId: string
  milestones: ReturnType<typeof useStore.getState>['milestones']
}) {
  const updateMilestone = useStore((s) => s.updateMilestone)
  const typeLabel = useMilestoneTypeLabel()
  const [createOpen, setCreateOpen] = useState(false)

  const pending = milestones.filter((m) => m.status === 'pending')
  const done = milestones.filter((m) => m.status === 'done')

  return (
    <div>
      <div className="flex justify-end">
        <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
          <CalendarPlus size={13} /> 新建节点
        </Button>
      </div>
      {milestones.length === 0 ? (
        <EmptyState icon={<Flag size={30} />} title="暂无时间节点" hint="登记投稿截止、Rebuttal 截止等重要日期。" />
      ) : (
        <div className="mt-3 flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
          {[...pending, ...done].map((m) => {
            const days = daysUntil(m.date)
            const overdue = m.status === 'pending' && days < 0
            return (
              <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                <CheckBox
                  checked={m.status === 'done'}
                  onChange={(v) => updateMilestone(m.id, { status: v ? 'done' : 'pending' })}
                  title={m.status === 'done' ? '恢复为未完成' : '标记完成'}
                />
                <div className="min-w-0 flex-1">
                  <div className={cn('truncate text-[13.5px]', m.status === 'done' && 'text-text-3 line-through')}>
                    {m.title}
                  </div>
                  <div className="text-[11px] text-text-3">
                    {friendlyDate(m.date)} · {typeLabel(m.type)}
                    {m.note ? ` · ${m.note}` : ''}
                  </div>
                </div>
                {m.status === 'pending' && (
                  <Badge color={days <= 7 ? 'red' : days <= 30 ? 'yellow' : 'gray'}>
                    {overdue ? `已过期 ${-days} 天` : countdownText(days)}
                  </Badge>
                )}
                {m.status === 'done' && (
                  <span className="flex items-center gap-0.5 text-[11px] text-success">
                    <Check size={11} /> 已完成
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
      <MilestoneEditModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        defaults={{ project_id: projectId }}
      />
    </div>
  )
}
