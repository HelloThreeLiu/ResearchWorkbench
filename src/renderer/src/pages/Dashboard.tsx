// 今日概览：今天做什么、最近有什么大事（默认启动页）
import { useMemo, useState } from 'react'
import { CalendarPlus, Flag, Lightbulb, ListPlus, Plus } from 'lucide-react'
import type { Milestone } from '@shared/types'
import { useStore } from '@/store'
import { useNav } from '@/nav'
import { useMilestoneTypeLabel } from '@/hooks/useVocab'
import { Badge, Button, CheckBox, EmptyState } from '@/components/ui'
import TaskRow from '@/components/TaskRow'
import TaskEditModal from '@/components/TaskEditModal'
import MilestoneEditModal from '@/components/MilestoneEditModal'
import { cn } from '@/lib/utils'
import { countdownText, daysUntil, dayjs, friendlyDateTime } from '@/lib/date'

export default function Dashboard() {
  const tasks = useStore((s) => s.tasks)
  const milestones = useStore((s) => s.milestones)
  const ideas = useStore((s) => s.ideas)
  const projects = useStore((s) => s.projects)
  const updateIdea = useStore((s) => s.updateIdea)
  const addTask = useStore((s) => s.addTask)
  const lastWriteAt = useStore((s) => s.lastWriteAt)
  const dataDir = useStore((s) => s.dataDir)
  const navigate = useNav((s) => s.navigate)

  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [milestoneModalOpen, setMilestoneModalOpen] = useState(false)

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])

  // 今日到期 + 逾期（未完成），逾期置顶
  const todayTasks = useMemo(() => {
    return tasks
      .filter((t) => t.status !== 'done' && t.due_date !== null && daysUntil(t.due_date) <= 0)
      .sort((a, b) => {
        const overdueA = daysUntil(a.due_date!)
        const overdueB = daysUntil(b.due_date!)
        if (overdueA !== overdueB) return overdueA - overdueB
        return a.due_date! < b.due_date! ? -1 : 1
      })
  }, [tasks])

  // 未来 30 天内未完成节点，按临近排序
  const upcomingMilestones = useMemo(() => {
    return milestones
      .filter((m) => m.status === 'pending')
      .map((m) => ({ m, days: daysUntil(m.date) }))
      .filter(({ days }) => days >= 0 && days <= 30)
      .sort((a, b) => a.days - b.days)
  }, [milestones])

  // 最近 3 条未整理灵感
  const recentIdeas = useMemo(
    () => ideas.filter((i) => i.status === 'new').slice(0, 3),
    [ideas]
  )

  const convertIdea = (ideaId: string, content: string): void => {
    const firstLine = content.split('\n')[0].slice(0, 80)
    const task = addTask({ title: firstLine })
    updateIdea(ideaId, { status: 'converted', converted_task_id: task.id })
  }

  const hour = dayjs().hour()
  const greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 sm:px-7 sm:py-6">
      {/* 头部问候 + 快速操作 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">
            {greeting}，今天是 {dayjs().format('YYYY年M月D日 dddd')}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-text-3">
            <span className="flex shrink-0 items-center gap-1.5">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: lastWriteAt ? 'var(--color-success)' : 'var(--color-text-3)' }}
              />
              {lastWriteAt
                ? `数据最近写入：${friendlyDateTime(lastWriteAt)}（网盘将自动同步）`
                : '今天还没有数据写入'}
            </span>
            {dataDir && (
              <button className="hover:text-accent cursor-pointer" onClick={() => navigate({ name: 'settings' })}>
                · 查看数据目录
              </button>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="primary" onClick={() => setTaskModalOpen(true)}>
            <Plus size={14} /> 新建任务
          </Button>
          <Button onClick={() => setMilestoneModalOpen(true)}>
            <CalendarPlus size={14} /> 新建节点
          </Button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* 左列：任务 */}
        <section className="min-w-0 rounded-xl border border-border bg-surface p-3.5 sm:p-4 lg:col-span-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <h2 className="flex min-w-0 items-center gap-1.5 text-[14px] font-semibold">
              <ListPlus size={15} className="shrink-0 text-accent" />
              <span className="truncate">今日到期与逾期任务</span>
              {todayTasks.length > 0 && <Badge>{todayTasks.length}</Badge>}
            </h2>
            <button
              className="shrink-0 text-[12px] text-text-3 hover:text-accent cursor-pointer"
              onClick={() => navigate({ name: 'tasks' })}
            >
              全部任务 →
            </button>
          </div>
          {todayTasks.length === 0 ? (
            <EmptyState
              icon={<ListPlus size={30} />}
              title="今天没有到期任务"
              hint="暂无逾期与今日到期任务。有新安排就记进来，别放在脑子里。"
            />
          ) : (
            <div className="flex flex-col gap-0.5">
              {todayTasks.map((t) => {
                const overdue = t.due_date !== null && daysUntil(t.due_date) < 0
                return (
                  <div key={t.id} className={cn(overdue && 'rounded-lg bg-danger-soft/40')}>
                    <TaskRow
                      task={t}
                      project={t.project_id ? projectMap.get(t.project_id) : undefined}
                      onNavigateToProject={(id) => navigate({ name: 'project-detail', projectId: id, tab: 'overview' })}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* 右列：节点倒计时 + 灵感 */}
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <section className="rounded-xl border border-border bg-surface p-3.5 sm:p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="flex min-w-0 items-center gap-1.5 text-[14px] font-semibold">
                <Flag size={15} className="shrink-0 text-accent" />
                <span className="truncate">未来 30 天节点</span>
              </h2>
              <button
                className="shrink-0 text-[12px] text-text-3 hover:text-accent cursor-pointer"
                onClick={() => navigate({ name: 'milestones' })}
              >
                全部 →
              </button>
            </div>
            {upcomingMilestones.length === 0 ? (
              <div className="py-6 text-center text-[12.5px] text-text-3">
                30 天内没有关键节点
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {upcomingMilestones.map(({ m, days }) => (
                  <MilestoneCountdownItem key={m.id} milestone={m} days={days} />
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-surface p-3.5 sm:p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="flex min-w-0 items-center gap-1.5 text-[14px] font-semibold">
                <Lightbulb size={15} className="shrink-0 text-warn" />
                <span className="truncate">待整理灵感</span>
              </h2>
              <button
                className="shrink-0 text-[12px] text-text-3 hover:text-accent cursor-pointer"
                onClick={() => navigate({ name: 'ideas' })}
              >
                灵感页 →
              </button>
            </div>
            {recentIdeas.length === 0 ? (
              <div className="py-4 text-center text-[12.5px] text-text-3">
                暂无未整理灵感 · 按 {useStore.getState().settings.hotkey} 随手记
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {recentIdeas.map((idea) => (
                  <div
                    key={idea.id}
                    className="group rounded-lg border border-border px-2.5 py-2 transition-colors hover:border-accent"
                  >
                    <div className="line-clamp-2 text-[12.5px] leading-relaxed text-text-2">
                      {idea.content}
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-[10.5px] text-text-3">
                        {friendlyDateTime(idea.created_at)}
                      </span>
                      <button
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-accent hover:bg-accent-soft cursor-pointer"
                        onClick={() => convertIdea(idea.id, idea.content)}
                      >
                        <ListPlus size={11} /> 转为任务
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <TaskEditModal open={taskModalOpen} onClose={() => setTaskModalOpen(false)} />
      <MilestoneEditModal open={milestoneModalOpen} onClose={() => setMilestoneModalOpen(false)} />
    </div>
  )
}

function MilestoneCountdownItem({ milestone, days }: { milestone: Milestone; days: number }) {
  const updateMilestone = useStore((s) => s.updateMilestone)
  const typeLabel = useMilestoneTypeLabel()
  const urgent = days <= 7 // ≤7 天红色，≤30 天黄色
  const color = urgent ? 'red' : 'yellow'
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2/60">
      <CheckBox
        checked={milestone.status === 'done'}
        onChange={(v) => updateMilestone(milestone.id, { status: v ? 'done' : 'pending' })}
        title={milestone.status === 'done' ? '标记为未完成' : '标记完成（如已投稿）'}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px]">{milestone.title}</div>
        <div className="text-[11px] text-text-3">
          {milestone.date} · {typeLabel(milestone.type)}
        </div>
      </div>
      <Badge color={color} className="shrink-0">
        {countdownText(days)}
      </Badge>
    </div>
  )
}
