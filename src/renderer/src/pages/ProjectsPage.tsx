// 项目列表：进行中项目卡片（进度 + 最近节点倒计时）；已完成/归档折叠
import { useState } from 'react'
import { ChevronDown, ChevronRight, FolderKanban, Plus } from 'lucide-react'
import { useStore } from '@/store'
import { useNav } from '@/nav'
import { Badge, Button, EmptyState, ProgressBar } from '@/components/ui'
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 sm:px-7 sm:py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">项目</h1>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          <Plus size={14} /> 新建项目
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {active.map((p) => {
          const stats = statsOf(p.id)
          const nearest = nearestMilestone(p.id)
          const progress = stats.total === 0 ? 0 : Math.round((stats.done / stats.total) * 100)
          return (
            <button
              key={p.id}
              onClick={() => navigate({ name: 'project-detail', projectId: p.id, tab: 'overview' })}
              className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-4 text-left transition-all hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-md cursor-pointer"
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px] font-medium">{p.name}</div>
                  {p.description && (
                    <div className="mt-0.5 line-clamp-1 text-[12px] text-text-3">{p.description}</div>
                  )}
                </div>
                {stats.overdue > 0 && <Badge color="red">{stats.overdue} 逾期</Badge>}
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-[11.5px] text-text-3">
                  <span>
                    任务 {stats.done}/{stats.total}
                  </span>
                  <span>{progress}%</span>
                </div>
                <ProgressBar value={progress} color={p.color} />
              </div>
              <div className="flex items-center justify-between text-[11.5px]">
                {nearest ? (
                  <span className={nearest.days <= 7 ? 'font-medium text-danger' : 'text-warn'}>
                    最近节点：{nearest.m.title}（{countdownText(nearest.days)}）
                  </span>
                ) : (
                  <span className="text-text-3">暂无临近节点</span>
                )}
                <span className="text-text-3">{formatDate(p.start_date)}</span>
              </div>
            </button>
          )
        })}
      </div>

      {active.length === 0 && (
        <EmptyState
          icon={<FolderKanban size={34} />}
          title="还没有进行中的项目"
          hint="导师布置了新方向？建一个项目，把大目标拆成任务并设截止日。"
          action={
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus size={14} /> 新建第一个项目
            </Button>
          }
        />
      )}

      {folded.length > 0 && (
        <div className="mt-6">
          <button
            className="flex items-center gap-1 text-[13px] font-medium text-text-2 hover:text-text cursor-pointer"
            onClick={() => setFoldedOpen(!foldedOpen)}
          >
            {foldedOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            已完成 / 已归档项目（{folded.length}）
          </button>
          {foldedOpen && (
            <div className="mt-2 flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
              {folded.map((p) => {
                const stats = statsOf(p.id)
                return (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
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
