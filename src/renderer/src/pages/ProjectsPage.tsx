// 项目列表（V3 §5.2）：项目色顶条卡片（xl 三列）；已完成/归档折叠
import { useState } from 'react'
import { ChevronDown, ChevronRight, FolderKanban, Plus } from 'lucide-react'
import { useStore } from '@/store'
import { useNav } from '@/nav'
import { Badge, Button, EmptyState, PageHeader, ProgressBar } from '@/components/ui'
import ProjectEditModal from '@/components/ProjectEditModal'
import { countdownText, daysUntil, formatDate } from '@/lib/date'

export default function ProjectsPage() {
  const projects = useStore((s) => s.projects)
  const tasks = useStore((s) => s.tasks)
  const milestones = useStore((s) => s.milestones)
  const navigate = useNav((s) => s.navigate)

  const [createOpen, setCreateOpen] = useState(false)
  const [foldedOpen, setFoldedOpen] = useState(false)

  const active = projects.filter((p) => p.status === 'active')
  const folded = projects.filter((p) => p.status !== 'active')

  const statsOf = (projectId: string) => {
    const list = tasks.filter((t) => t.project_id === projectId)
    const done = list.filter((t) => t.status === 'done').length
    const overdue = list.filter(
      (t) => t.status !== 'done' && t.due_date !== null && daysUntil(t.due_date) < 0
    ).length
    return { total: list.length, done, overdue }
  }

  const nearestMilestone = (projectId: string) => {
    const pending = milestones
      .filter((m) => m.project_id === projectId && m.status === 'pending')
      .map((m) => ({ m, days: daysUntil(m.date) }))
      .filter(({ days }) => days >= 0)
      .sort((a, b) => a.days - b.days)
    return pending[0]
  }

  const avgProgress =
    active.length === 0
      ? 0
      : Math.round(
          active.reduce((sum, p) => {
            const s = statsOf(p.id)
            return sum + (s.total === 0 ? 0 : (s.done / s.total) * 100)
          }, 0) / active.length
        )

  return (
    <div className="page">
      <PageHeader
        title="项目"
        sub={`${active.length} 个进行中 · 整体任务完成率 ${avgProgress}%；点卡片进入项目工作台`}
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus /> 新建项目
          </Button>
        }
      />

      {/* 项目卡片：色顶条 + 描述 + 进度 + 临近节点 */}
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {active.map((p) => {
          const stats = statsOf(p.id)
          const nearest = nearestMilestone(p.id)
          const progress = stats.total === 0 ? 0 : Math.round((stats.done / stats.total) * 100)
          return (
            <button
              key={p.id}
              onClick={() => navigate({ name: 'project-detail', projectId: p.id, tab: 'overview' })}
              className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface text-left transition-all cursor-pointer hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-md"
            >
              {/* 项目色顶条 */}
              <span className="block h-[3px]" style={{ backgroundColor: p.color }} />
              <div className="flex flex-1 flex-col gap-3 px-4.5 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="truncate text-[15px] font-semibold">{p.name}</span>
                    {stats.overdue > 0 && <Badge color="red">{stats.overdue} 逾期</Badge>}
                  </div>
                  {p.description && (
                    <div className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-text-3">
                      {p.description}
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between text-[11.5px] text-text-3">
                    <span>任务 {stats.done}/{stats.total}</span>
                    <span className="font-semibold text-text-2">{progress}%</span>
                  </div>
                  <div className="mt-1.5">
                    <ProgressBar value={progress} color={p.color} />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 text-[11.5px]">
                  {nearest ? (
                    <Badge color={nearest.days <= 7 ? 'red' : 'yellow'}>
                      {nearest.m.title} · {countdownText(nearest.days)}
                    </Badge>
                  ) : (
                    <span className="text-text-3">暂无临近节点</span>
                  )}
                  <span className="shrink-0 text-text-3">{formatDate(p.start_date)}</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {active.length === 0 && (
        <EmptyState
          icon={<FolderKanban />}
          title="还没有进行中的项目"
          hint="导师布置了新方向？建一个项目，把大目标拆成任务并设截止日。"
          action={
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus /> 新建第一个项目
            </Button>
          }
        />
      )}

      {folded.length > 0 && (
        <div className="mt-6">
          <button
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-text-2 hover:text-text cursor-pointer [&_svg]:h-3.5 [&_svg]:w-3.5"
            onClick={() => setFoldedOpen(!foldedOpen)}
          >
            {foldedOpen ? <ChevronDown /> : <ChevronRight />}
            已完成 / 已归档项目（{folded.length}）
          </button>
          {foldedOpen && (
            <div className="mt-2 overflow-hidden rounded-xl border border-border bg-surface">
              {folded.map((p) => {
                const stats = statsOf(p.id)
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-surface-2/50"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                    <button
                      className="min-w-0 flex-1 truncate text-left text-[13px] hover:text-accent cursor-pointer"
                      onClick={() => navigate({ name: 'project-detail', projectId: p.id, tab: 'overview' })}
                    >
                      {p.name}
                    </button>
                    <Badge color="gray">{p.status === 'completed' ? '已完成' : '已归档'}</Badge>
                    <span className="text-[11.5px] text-text-3">
                      任务 {stats.done}/{stats.total}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <ProjectEditModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}
