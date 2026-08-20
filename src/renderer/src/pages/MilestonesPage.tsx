// 节点总览：全部未完成节点按日期排序 + 倒计时；可按类型/项目筛选；已完成进入历史
import { useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronRight, Flag, Plus } from 'lucide-react'
import type { Milestone, MilestoneType } from '@shared/types'
import { MILESTONE_TYPE_LABELS } from '@shared/types'
import { useStore } from '@/store'
import { useNav } from '@/nav'
import { Badge, Button, CheckBox, EmptyState, Select } from '@/components/ui'
import MilestoneEditModal from '@/components/MilestoneEditModal'

import { countdownText, daysUntil, friendlyDate } from '@/lib/date'

export default function MilestonesPage() {
  const milestones = useStore((s) => s.milestones)
  const projects = useStore((s) => s.projects)
  const navigate = useNav((s) => s.navigate)

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Milestone | null>(null)
  const [filterType, setFilterType] = useState<'all' | MilestoneType>('all')
  const [filterProject, setFilterProject] = useState('all')
  const [historyOpen, setHistoryOpen] = useState(false)

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])

  const pass = (m: Milestone): boolean =>
    (filterType === 'all' || m.type === filterType) &&
    (filterProject === 'all' ||
      (filterProject === '__none__' ? m.project_id === null : m.project_id === filterProject))

  const pending = milestones
    .filter((m) => m.status === 'pending' && pass(m))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
  const doneHistory = milestones
    .filter((m) => m.status === 'done')
    .sort((a, b) => (a.date < b.date ? 1 : -1))

  // 提醒窗口内（进入任一 remind_days 窗口）
  const inWindow = (m: Milestone): boolean => {
    const d = daysUntil(m.date)
    return d >= 0 && m.remind_days.some((r) => d <= r)
  }

  return (
    <div className="mx-auto max-w-4xl px-7 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">时间节点</h1>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          <Plus size={14} /> 新建节点
        </Button>
      </div>
      <p className="mt-1 text-[12px] text-text-3">
        开题、投稿截止、会议、中期检查、答辩等重要日期；进入提醒窗口的节点会出现在今日概览。
      </p>

      {/* 筛选 */}
      <div className="mt-4 flex gap-2">
        <Select value={filterType} onChange={(e) => setFilterType(e.target.value as typeof filterType)} className="w-36">
          <option value="all">全部类型</option>
          {Object.entries(MILESTONE_TYPE_LABELS).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </Select>
        <Select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className="w-44">
          <option value="all">全部项目</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="__none__">仅全局节点</option>
        </Select>
      </div>

      {pending.length === 0 ? (
        <EmptyState icon={<Flag size={30} />} title="没有符合条件的未完成节点" hint="把关键日期登记进来，别靠记忆。" />
      ) : (
        <div className="mt-4 flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
          {pending.map((m) => {
            const days = daysUntil(m.date)
            const overdue = days < 0
            const project = m.project_id ? projectMap.get(m.project_id) : undefined
            return (
              <div
                key={m.id}
                className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/40"
              >
                <CheckBox
                  checked={false}
                  onChange={() => useStore.getState().updateMilestone(m.id, { status: 'done' })}
                  title="标记完成（如已投稿）"
                />
                <div className="min-w-0 flex-1">
                  <button
                    className="block max-w-full truncate text-left text-[13.5px] font-medium hover:text-accent cursor-pointer"
                    onClick={() => setEditTarget(m)}
                    title="点击编辑"
                  >
                    {m.title}
                  </button>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-text-3">
                    <span>{friendlyDate(m.date)}</span>
                    <span>· {MILESTONE_TYPE_LABELS[m.type]}</span>
                    {project ? (
                      <button
                        className="flex items-center gap-1 hover:text-accent cursor-pointer"
                        onClick={() =>
                          navigate({ name: 'project-detail', projectId: project.id, tab: 'milestones' })
                        }
                      >
                        ·
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: project.color }} />
                        {project.name}
                      </button>
                    ) : (
                      <span>· 全局</span>
                    )}
                    {m.remind_days.length > 0 && <span>· 提前 {m.remind_days.join('/')} 天提醒</span>}
                  </div>
                </div>
                <Badge
                  color={overdue ? 'red' : inWindow(m) ? (days <= 7 ? 'red' : 'yellow') : 'gray'}
                  className="shrink-0"
                >
                  {overdue ? `已过期 ${-days} 天` : countdownText(days)}
                </Badge>
                <button
                  className="rounded-lg p-1 text-success opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface-2 cursor-pointer"
                  title="标记完成"
                  onClick={() => useStore.getState().updateMilestone(m.id, { status: 'done' })}
                >
                  <Check size={15} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* 历史记录 */}
      {doneHistory.length > 0 && (
        <div className="mt-6">
          <button
            className="flex items-center gap-1 text-[13px] font-medium text-text-2 hover:text-text cursor-pointer"
            onClick={() => setHistoryOpen(!historyOpen)}
          >
            {historyOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            已完成节点（{doneHistory.length}）
          </button>
          {historyOpen && (
            <div className="mt-2 flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
              {doneHistory.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                  <CheckBox
                    checked
                    onChange={() => useStore.getState().updateMilestone(m.id, { status: 'pending' })}
                    title="恢复为未完成"
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-text-3 line-through">
                    {m.title}
                  </span>
                  <span className="shrink-0 text-[11.5px] text-text-3">
                    {friendlyDate(m.date)} · {MILESTONE_TYPE_LABELS[m.type]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <MilestoneEditModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <MilestoneEditModal open={editTarget !== null} milestone={editTarget ?? undefined} onClose={() => setEditTarget(null)} />
    </div>
  )
}
