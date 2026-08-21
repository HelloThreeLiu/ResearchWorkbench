// 今日概览（V3 §5.1）：4 张核心统计大卡 + 左任务 / 右（本周速览·节点·灵感）
import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  CalendarPlus,
  Flag,
  Lightbulb,
  ListPlus,
  Plus
} from 'lucide-react'
import type { Milestone } from '@shared/types'
import { useStore } from '@/store'
import { useNav } from '@/nav'
import { useMilestoneTypeLabel } from '@/hooks/useVocab'
import { Badge, Button, CheckBox, EmptyState, PageHeader, StatCard } from '@/components/ui'
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
  const logs = useStore((s) => s.logs)
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

  // 核心统计（次级指标并入右栏「本周速览」）
  const stats = useMemo(() => {
    const open = tasks.filter((t) => t.status !== 'done')
    const overdue = open.filter((t) => t.due_date !== null && daysUntil(t.due_date) < 0)
    const dueToday = open.filter((t) => t.due_date !== null && daysUntil(t.due_date) === 0)
    const weekStart = dayjs().startOf('week')
    const weekLogs = logs.filter(
      (l) => l.date >= weekStart.format('YYYY-MM-DD') && l.date <= dayjs().format('YYYY-MM-DD')
    ).length
    return {
      openCount: open.length,
      dueToday: dueToday.length,
      overdue: overdue.length,
      milestoneCount: upcomingMilestones.length,
      weekLogs,
      activeProjects: projects.filter((p) => p.status === 'active').length
    }
  }, [tasks, logs, projects, upcomingMilestones])

  // 近 7 天每日完成任务数
  const weeklyTrend = useMemo(() => {
    const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六']
    return Array.from({ length: 7 }, (_, idx) => {
      const i = 6 - idx
      const d = dayjs().subtract(i, 'day')
      const date = d.format('YYYY-MM-DD')
      return {
        date,
        label: weekdayLabels[d.day()],
        count: tasks.filter((t) => t.completed_at?.slice(0, 10) === date).length,
        isToday: i === 0
      }
    })
  }, [tasks])

  const weekDone = weeklyTrend.reduce((sum, d) => sum + d.count, 0)
  const trendMax = Math.max(...weeklyTrend.map((x) => x.count), 1)

  const convertIdea = (ideaId: string, content: string): void => {
    const firstLine = content.split('\n')[0].slice(0, 80)
    const task = addTask({ title: firstLine })
    updateIdea(ideaId, { status: 'converted', converted_task_id: task.id })
  }

  const hour = dayjs().hour()
  const greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'

  return (
    <div className="page">
      <PageHeader
        title={`${greeting}，今天是 ${dayjs().format('YYYY年M月D日 dddd')}`}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: lastWriteAt ? 'var(--color-success)' : 'var(--color-text-3)' }}
            />
            {lastWriteAt
              ? `数据最近写入：${friendlyDateTime(lastWriteAt)}（网盘将自动同步）`
              : '今天还没有数据写入'}
            {dataDir && (
              <button
                className="hover:text-accent cursor-pointer"
                onClick={() => navigate({ name: 'settings' })}
              >
                · 查看数据目录
              </button>
            )}
          </span>
        }
        actions={
          <>
            <Button onClick={() => setMilestoneModalOpen(true)}>
              <CalendarPlus /> 新建节点
            </Button>
            <Button variant="primary" onClick={() => setTaskModalOpen(true)}>
              <Plus /> 新建任务
            </Button>
          </>
        }
      />

      {/* 核心指标：4 张大卡 */}
      <div className="mt-5 grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        <StatCard
          label="待办任务"
          value={stats.openCount}
          hint={`${tasks.filter((t) => t.status === 'in_progress').length} 个进行中`}
          icon={<ListPlus />}
          onClick={() => navigate({ name: 'tasks' })}
        />
        <StatCard
          label="今日到期"
          value={stats.dueToday}
          tone={stats.dueToday > 0 ? 'warn' : 'default'}
          icon={<CalendarClock />}
          onClick={() => navigate({ name: 'tasks' })}
        />
        <StatCard
          label="逾期任务"
          value={stats.overdue}
          tone={stats.overdue > 0 ? 'danger' : 'default'}
          hint={stats.overdue > 0 ? '尽快处理，避免堆积' : '保持住'}
          icon={<AlertTriangle />}
          onClick={() => navigate({ name: 'tasks' })}
        />
        <StatCard
          label="30 天内节点"
          value={stats.milestoneCount}
          hint={upcomingMilestones[0] ? `最近：${upcomingMilestones[0].m.title} · ${countdownText(upcomingMilestones[0].days)}` : '暂无临近节点'}
          icon={<Flag />}
          onClick={() => navigate({ name: 'milestones' })}
        />
      </div>

      {/* 主体：左 8 任务 / 右 4 速览+节点+灵感 */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* 左：任务 */}
        <section className="min-w-0 rounded-xl border border-border bg-surface px-4.5 py-4 lg:col-span-8">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="flex min-w-0 items-center gap-2 text-[15px] font-semibold">
              <ListPlus size={15} className="shrink-0 text-accent" />
              <span className="truncate">今日到期与逾期任务</span>
              {stats.overdue > 0 && <Badge color="red">{stats.overdue} 逾期</Badge>}
            </h2>
            <button
              className="shrink-0 text-[12.5px] text-text-3 hover:text-accent cursor-pointer"
              onClick={() => navigate({ name: 'tasks' })}
            >
              全部任务 →
            </button>
          </div>
          {todayTasks.length === 0 ? (
            <EmptyState
              icon={<ListPlus />}
              title="今天没有到期任务"
              hint="暂无逾期与今日到期任务。有新安排就记进来，别放在脑子里。"
            />
          ) : (
            <div className="flex flex-col gap-0.5">
              {todayTasks.map((t) => {
                const overdue = t.due_date !== null && daysUntil(t.due_date) < 0
                return (
                  <div key={t.id} className={cn('rounded-lg', overdue && 'bg-danger-soft/45')}>
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

        {/* 右列 */}
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-4">
          {/* 本周速览：趋势图 + 3 个次级指标 */}
          <section className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-[14px] font-semibold">
                <ListPlus size={14} className="text-accent" />
                本周速览
              </h2>
              <span className="text-[11.5px] text-text-3">
                {dayjs().startOf('week').format('M月D日')} – 今天
              </span>
            </div>
            <div className="flex h-16 items-end justify-between gap-1.5">
              {weeklyTrend.map((d) => {
                const height = d.count === 0 ? 3 : Math.max(8, Math.round((d.count / trendMax) * 100))
                return (
                  <div
                    key={d.date}
                    className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
                    title={`${d.date}：完成 ${d.count} 项`}
                  >
                    <span className={cn('text-[11px]', d.count > 0 ? 'text-text-2' : 'text-text-3')}>
                      {d.count > 0 ? d.count : ''}
                    </span>
                    <div
                      className={cn(
                        'w-full max-w-6.5 rounded-t-md transition-all',
                        d.isToday ? 'bg-accent' : d.count > 0 ? 'bg-accent/45' : 'bg-border'
                      )}
                      style={{ height: `${height}%` }}
                    />
                    <span
                      className={cn(
                        'text-[11px]',
                        d.isToday ? 'font-semibold text-accent' : 'text-text-3'
                      )}
                    >
                      {d.isToday ? '今天' : `周${d.label}`}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 flex border-t border-border pt-2.5">
              <Metric value={weekDone} label="本周完成" />
              <div className="w-px bg-border" />
              <Metric value={stats.weekLogs} label="进展日志" />
              <div className="w-px bg-border" />
              <Metric value={stats.activeProjects} label="进行中项目" />
            </div>
          </section>

          {/* 节点倒计时 */}
          <section className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h2 className="flex min-w-0 items-center gap-2 text-[14px] font-semibold">
                <Flag size={14} className="shrink-0 text-accent" />
                <span className="truncate">未来 30 天节点</span>
              </h2>
              <button
                className="shrink-0 text-[12.5px] text-text-3 hover:text-accent cursor-pointer"
                onClick={() => navigate({ name: 'milestones' })}
              >
                全部 →
              </button>
            </div>
            {upcomingMilestones.length === 0 ? (
              <div className="py-6 text-center text-[12.5px] text-text-3">30 天内没有关键节点</div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {upcomingMilestones.map(({ m, days }) => (
                  <MilestoneCountdownItem key={m.id} milestone={m} days={days} />
                ))}
              </div>
            )}
          </section>

          {/* 待整理灵感 */}
          <section className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h2 className="flex min-w-0 items-center gap-2 text-[14px] font-semibold">
                <Lightbulb size={14} className="shrink-0 text-warn" />
                <span className="truncate">待整理灵感</span>
              </h2>
              <button
                className="shrink-0 text-[12.5px] text-text-3 hover:text-accent cursor-pointer"
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
              <div className="flex flex-col gap-2">
                {recentIdeas.map((idea) => (
                  <div
                    key={idea.id}
                    className="rounded-lg border border-border px-2.5 py-2 transition-colors hover:border-accent/50"
                  >
                    <div className="line-clamp-2 text-[12.5px] leading-relaxed text-text-2">
                      {idea.content}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-[11.5px] text-text-3">
                        {friendlyDateTime(idea.created_at)}
                      </span>
                      <button
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] text-accent hover:bg-accent-soft cursor-pointer"
                        onClick={() => convertIdea(idea.id, idea.content)}
                      >
                        <ListPlus size={12} /> 转为任务
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

/** 本周速览底部三列指标 */
function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex-1 text-center">
      <div className="text-[17px] font-bold tabular-nums">{value}</div>
      <div className="text-[11.5px] text-text-3">{label}</div>
    </div>
  )
}

function MilestoneCountdownItem({ milestone, days }: { milestone: Milestone; days: number }) {
  const updateMilestone = useStore((s) => s.updateMilestone)
  const typeLabel = useMilestoneTypeLabel()
  const urgent = days <= 7 // ≤7 天红色，≤30 天黄色
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2/60">
      <CheckBox
        checked={milestone.status === 'done'}
        onChange={(v) => updateMilestone(milestone.id, { status: v ? 'done' : 'pending' })}
        title={milestone.status === 'done' ? '标记为未完成' : '标记完成（如已投稿）'}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px]">{milestone.title}</div>
        <div className="text-[11.5px] text-text-3">
          {milestone.date} · {typeLabel(milestone.type)}
        </div>
      </div>
      <Badge color={urgent ? 'red' : 'yellow'} className="shrink-0">
        {countdownText(days)}
      </Badge>
    </div>
  )
}
