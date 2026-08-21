// 时间节点（V3 §5.4）：左侧日期块 + 倒计时徽章；类型 Chips + 项目筛选；已完成折叠
import { useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronRight, Flag, Plus } from 'lucide-react'
import type { Milestone } from '@shared/types'
import { useStore } from '@/store'
import { useNav } from '@/nav'
import { useMilestoneTypes, useMilestoneTypeLabel } from '@/hooks/useVocab'
import { Badge, Button, CheckBox, Chip, ChipCount, EmptyState, FilterBar, PageHeader, Select } from '@/components/ui'
import MilestoneEditModal from '@/components/MilestoneEditModal'

import { countdownText, daysUntil, friendlyDate } from '@/lib/date'

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const weekdayOf = (date: string): string =>
  WEEKDAY_LABELS[new Date(date + 'T00:00:00').getDay()] ?? ''

export default function MilestonesPage() {
  const milestones = useStore((s) => s.milestones)
  const projects = useStore((s) => s.projects)
  const navigate = useNav((s) => s.navigate)
  const milestoneTypes = useMilestoneTypes()
  const typeLabel = useMilestoneTypeLabel()

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Milestone | null>(null)
  const [filterType, setFilterType] = useState<string>('all')
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
    <div className="page page-mid">
      <PageHeader
        title="时间节点"
        sub="开题、投稿截止、会议、中期检查、答辩等重要日期；进入提醒窗口的节点会出现在今日概览"
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus /> 新建节点
          </Button>
        }
      />

      {/* 筛选（V3 FilterBar）：类型 Chips 流动 ‖ 项目 Select 锚定右侧 */}
      <FilterBar
        filters={
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
            <option value="__none__">仅全局节点</option>
          </Select>
        }
      >
        <Chip active={filterType === 'all'} onClick={() => setFilterType('all')}>
          全部类型{' '}
          <ChipCount>{milestones.filter((m) => m.status === 'pending').length}</ChipCount>
        </Chip>
        {milestoneTypes.map((t) => (
          <Chip key={t.id} active={filterType === t.id} onClick={() => setFilterType(t.id)}>
            {t.name}{' '}
            <ChipCount>
              {milestones.filter((m) => m.status === 'pending' && m.type === t.id).length}
            </ChipCount>
          </Chip>
        ))}
      </FilterBar>

      {pending.length === 0 ? (
        <EmptyState icon={<Flag />} title="没有符合条件的未完成节点" hint="把关键日期登记进来，别靠记忆。" />
      ) : (
        <div className="mt-4 flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
          {pending.map((m) => {
            const days = daysUntil(m.date)
            const overdue = days < 0
            const project = m.project_id ? projectMap.get(m.project_id) : undefined
            return (
              <div
                key={m.id}
                className="group flex items-center gap-4 px-4.5 py-3.5 transition-colors hover:bg-surface-2/40"
              >
                {/* 日期块：星期 + 大日期 */}
                <div className="w-13 shrink-0 border-r border-border pr-3.5 text-center">
                  <div className="text-[11px] text-text-3">{weekdayOf(m.date)}</div>
                  <div className="text-[19px] leading-[1.3] font-bold tabular-nums">
                    {m.date.slice(5).replace('-', '/')}
                  </div>
                </div>
                <CheckBox
                  checked={false}
                  onChange={() => useStore.getState().updateMilestone(m.id, { status: 'done' })}
                  title="标记完成（如已投稿）"
                />
                <div className="min-w-0 flex-1">
                  <button
                    className="block max-w-full truncate text-left text-sm font-medium hover:text-accent cursor-pointer"
                    onClick={() => setEditTarget(m)}
                    title="点击编辑"
                  >
                    {m.title}
                  </button>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-text-3">
                    <span>{typeLabel(m.type)}</span>
                    {project ? (
                      <button
                        className="flex items-center gap-1.5 hover:text-accent cursor-pointer"
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
                  className="h-6 shrink-0 text-xs"
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
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-text-2 hover:text-text cursor-pointer [&_svg]:h-3.5 [&_svg]:w-3.5"
            onClick={() => setHistoryOpen(!historyOpen)}
          >
            {historyOpen ? <ChevronDown /> : <ChevronRight />}
            已完成节点（{doneHistory.length}）
          </button>
          {historyOpen && (
            <div className="mt-2 flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
              {doneHistory.map((m) => (
                <div key={m.id} className="flex items-center gap-4 px-4.5 py-3">
                  <CheckBox
                    checked
                    onChange={() => useStore.getState().updateMilestone(m.id, { status: 'pending' })}
                    title="恢复为未完成"
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-text-3 line-through">
                    {m.title}
                  </span>
                  <span className="shrink-0 text-[11.5px] text-text-3">
                    {friendlyDate(m.date)} · {typeLabel(m.type)}
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
