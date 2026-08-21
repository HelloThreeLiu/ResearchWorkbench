// 项目详情（V3 §5.3）：概览（Hero 进度）/ 任务 / 进展日志 / 时间节点 四个 Tab
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
import {
  Badge,
  Button,
  CheckBox,
  ConfirmDialog,
  EmptyState,
  Input,
  PageHeader,
  Textarea
} from '@/components/ui'
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
      <div className="page">
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
    <div className="page">
      {/* 页头：返回 + 项目色点 + 名称 + 操作 */}
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={goBack}
              className="-ml-1 rounded-lg p-1.5 text-text-3 hover:bg-surface-2 hover:text-text cursor-pointer [&_svg]:h-4 [&_svg]:w-4"
              title="返回"
            >
              <ArrowLeft />
            </button>
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: project.color }} />
            <span className="truncate">{project.name}</span>
            <Badge color={project.status === 'active' ? 'blue' : 'gray'}>
              {PROJECT_STATUS_LABELS[project.status]}
            </Badge>
          </span>
        }
        sub={
          <>
            {project.description ? `${project.description} · ` : ''}
            {formatDate(project.start_date)} 开始
            {project.end_date ? ` · 预计 ${formatDate(project.end_date)} 结束` : ''}
          </>
        }
        actions={
          <>
            <Button onClick={() => setEditOpen(true)}>
              <Pencil /> 编辑
            </Button>
            <Button
              variant="ghost"
              className="text-danger hover:bg-danger-soft hover:text-danger"
              onClick={() => setDeleteConfirm(true)}
              title="删除项目"
            >
              <Trash2 />
            </Button>
          </>
        }
      />

      {/* Tab 切换（窄窗口可横向滚动） */}
      <div className="mt-4 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              '-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2 text-[13px] transition-colors cursor-pointer [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:stroke-[1.9]',
              tab === key
                ? 'border-accent font-semibold text-accent'
                : 'border-transparent text-text-2 hover:text-text'
            )}
          >
            <Icon />
            {label}
            {key === 'tasks' && projectTasks.length > 0 && (
              <span className="text-[11px] text-text-3">
                {doneCount}/{projectTasks.length}
              </span>
            )}
            {key === 'logs' && projectLogs.length > 0 && (
              <span className="text-[11px] text-text-3">{projectLogs.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'overview' && (
          <OverviewTab
            taskStats={{ done: doneCount, total: projectTasks.length }}
            overdueCount={projectTasks.filter(
              (t) => t.status !== 'done' && t.due_date !== null && daysUntil(t.due_date) < 0
            ).length}
            color={project.color}
            pendingMilestones={projectMilestones.filter((m) => m.status === 'pending')}
            logs={projectLogs.slice(0, 3)}
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

// ---------- 概览：Hero 进度 + 最近日志 / 临近节点 ----------
function OverviewTab({
  taskStats,
  overdueCount,
  color,
  pendingMilestones,
  logs,
  logCount,
  onOpenTab
}: {
  taskStats: { done: number; total: number }
  overdueCount: number
  color: string
  pendingMilestones: ReturnType<typeof useStore.getState>['milestones']
  logs: ReturnType<typeof useStore.getState>['logs']
  logCount: number
  onOpenTab: (tab: ProjectTab) => void
}) {
  const progress = taskStats.total === 0 ? 0 : Math.round((taskStats.done / taskStats.total) * 100)
  const nearest = pendingMilestones
    .map((m) => ({ m, days: daysUntil(m.date) }))
    .filter(({ days }) => days >= 0)
    .sort((a, b) => a.days - b.days)[0]

  return (
    <div className="flex flex-col gap-4">
      {/* Hero：环形进度 + 关键数字 */}
      <div className="flex flex-wrap items-center gap-7 rounded-xl border border-border bg-surface px-5 py-5">
        <div className="flex items-center gap-4">
          <DonutProgress value={progress} color={color} />
          <div>
            <div className="text-[26px] leading-none font-bold tabular-nums">
              {progress}
              <span className="text-[15px]">%</span>
            </div>
            <div className="mt-1.5 text-[11.5px] text-text-3">任务完成度</div>
          </div>
        </div>
        <div className="hidden h-11 w-px bg-border sm:block" />
        <div className="flex flex-wrap gap-x-8 gap-y-4">
          <HeroNum value={`${taskStats.done}/${taskStats.total}`} label="已完成 / 总任务" onClick={() => onOpenTab('tasks')} />
          <HeroNum value={overdueCount} label="逾期任务" danger={overdueCount > 0} onClick={() => onOpenTab('tasks')} />
          <HeroNum value={pendingMilestones.length} label="待办节点" onClick={() => onOpenTab('milestones')} />
          <HeroNum value={logCount} label="进展记录" onClick={() => onOpenTab('logs')} />
          <HeroNum
            value={nearest ? countdownText(nearest.days) : '—'}
            label={nearest ? `距 ${nearest.m.title}` : '暂无临近节点'}
            danger={nearest ? nearest.days <= 7 : false}
            onClick={() => onOpenTab('milestones')}
          />
        </div>
      </div>

      {/* 双栏：最近日志 + 临近节点 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-[14px] font-semibold">
              <Pencil size={14} className="text-accent" /> 最近进展
            </h3>
            <button
              className="text-[12.5px] text-text-3 hover:text-accent cursor-pointer"
              onClick={() => onOpenTab('logs')}
            >
              全部日志 →
            </button>
          </div>
          {logs.length === 0 ? (
            <div className="py-5 text-center text-[12.5px] text-text-3">还没有进展记录</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-2.5">
                  <span className="w-14 shrink-0 pt-px text-[11px] font-semibold text-accent">
                    {friendlyDate(log.date)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-text-2">
                    {log.content.replace(/[#*`>\-]/g, '').slice(0, 60)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-[14px] font-semibold">
              <Flag size={14} className="text-accent" /> 临近节点
            </h3>
            <button
              className="text-[12.5px] text-text-3 hover:text-accent cursor-pointer"
              onClick={() => onOpenTab('milestones')}
            >
              全部节点 →
            </button>
          </div>
          {pendingMilestones.length === 0 ? (
            <div className="py-5 text-center text-[12.5px] text-text-3">暂无待办节点</div>
          ) : (
            <div className="flex flex-col gap-2">
              {pendingMilestones
                .map((m) => ({ m, days: daysUntil(m.date) }))
                .filter(({ days }) => days >= 0)
                .sort((a, b) => a.days - b.days)
                .slice(0, 4)
                .map(({ m, days }) => (
                  <div key={m.id} className="flex items-center justify-between gap-2.5">
                    <span className="min-w-0 flex-1 truncate text-[12.5px]">{m.title}</span>
                    <Badge color={days <= 7 ? 'red' : days <= 30 ? 'yellow' : 'gray'}>
                      {countdownText(days)}
                    </Badge>
                  </div>
                ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/** 环形进度（SVG，直径 84px） */
function DonutProgress({ value, color }: { value: number; color: string }) {
  const r = 34
  const c = 2 * Math.PI * r
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" className="shrink-0 -rotate-90">
      <circle cx="42" cy="42" r={r} fill="none" stroke="var(--color-surface-2)" strokeWidth="7" />
      <circle
        cx="42"
        cy="42"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value / 100)}
        style={{ transition: 'stroke-dashoffset .4s ease' }}
      />
    </svg>
  )
}

function HeroNum({
  value,
  label,
  danger,
  onClick
}: {
  value: string | number
  label: string
  danger?: boolean
  onClick?: () => void
}) {
  return (
    <button onClick={onClick} className="text-left cursor-pointer">
      <div
        className={cn(
          'text-[19px] font-bold tabular-nums',
          danger && 'text-danger'
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 max-w-30 truncate text-[11.5px] text-text-3" title={label}>
        {label}
      </div>
    </button>
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
          <Plus />
        </Button>
      </div>

      <div className="mt-3 flex items-center gap-1">
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
              'h-7 rounded-full px-3 text-[12.5px] transition-colors cursor-pointer',
              filter === key
                ? 'bg-accent-soft font-semibold text-accent'
                : 'text-text-2 hover:bg-surface-2 hover:text-text'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={<ListTodo />} title="暂无任务" hint="把大目标拆成具体任务，设上截止日。" />
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
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[12.5px] font-semibold text-text-2">记一笔</span>
          <input
            type="date"
            value={logDate}
            onChange={(e) => setLogDate(e.target.value)}
            className="h-6.5 rounded border border-border bg-surface px-1.5 text-[11.5px] text-text-2"
          />
          <span className="text-[11.5px] text-text-3">支持 Markdown（列表 / 代码块 / 加粗）</span>
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
        <EmptyState icon={<FileText />} title="还没有进展记录" hint="随手记录实验与讨论，写周报时不用回忆。" />
      ) : (
        <div className="relative mt-5 ml-1.5 flex flex-col gap-3.5 border-l-2 border-border pl-6">
          {logs.map((log) => (
            <div key={log.id} className="group relative">
              <span className="absolute top-1.5 -left-[31px] h-2.5 w-2.5 rounded-full border-[2.5px] border-bg bg-accent" />
              <div className="rounded-xl border border-border bg-surface p-4">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[12.5px] font-semibold text-accent">{friendlyDate(log.date)}</span>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(log.id, log.content)}>
                      <Pencil size={12} />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => deleteLog(log.id)}>
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

// ---------- 时间节点（V3 §5.4 日期块行结构） ----------
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

  const weekday = (date: string): string => {
    const map = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    return map[new Date(date + 'T00:00:00').getDay()] ?? ''
  }

  return (
    <div>
      <div className="flex justify-end">
        <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
          <CalendarPlus /> 新建节点
        </Button>
      </div>
      {milestones.length === 0 ? (
        <EmptyState icon={<Flag />} title="暂无时间节点" hint="登记投稿截止、Rebuttal 截止等重要日期。" />
      ) : (
        <div className="mt-3 flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
          {[...pending, ...done].map((m) => {
            const days = daysUntil(m.date)
            const overdue = m.status === 'pending' && days < 0
            return (
              <div key={m.id} className="group flex items-center gap-4 px-4.5 py-3.5 transition-colors hover:bg-surface-2/40">
                {/* 日期块 */}
                <div className="w-13 shrink-0 border-r border-border pr-3.5 text-center">
                  <div className="text-[11px] text-text-3">{weekday(m.date)}</div>
                  <div className="text-[19px] leading-[1.3] font-bold tabular-nums">
                    {m.date.slice(5).replace('-', '/')}
                  </div>
                </div>
                <CheckBox
                  checked={m.status === 'done'}
                  onChange={(v) => updateMilestone(m.id, { status: v ? 'done' : 'pending' })}
                  title={m.status === 'done' ? '恢复为未完成' : '标记完成'}
                />
                <div className="min-w-0 flex-1">
                  <div className={cn('truncate text-sm font-medium', m.status === 'done' && 'text-text-3 line-through')}>
                    {m.title}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-text-3">
                    <span>{typeLabel(m.type)}</span>
                    {m.note && <span>· {m.note}</span>}
                    {m.remind_days.length > 0 && <span>· 提前 {m.remind_days.join('/')} 天提醒</span>}
                  </div>
                </div>
                {m.status === 'pending' && (
                  <Badge
                    color={days <= 7 ? 'red' : days <= 30 ? 'yellow' : 'gray'}
                    className="h-6 shrink-0 text-xs"
                  >
                    {overdue ? `已过期 ${-days} 天` : countdownText(days)}
                  </Badge>
                )}
                {m.status === 'done' && (
                  <span className="flex shrink-0 items-center gap-1 text-[11.5px] text-success">
                    <Check size={12} /> 已完成
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
