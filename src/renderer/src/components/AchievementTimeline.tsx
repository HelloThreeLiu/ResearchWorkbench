// 成果时间线（自成果台账抽出，回顾页年度回顾复用）：按年份分组的时间线 + 成果卡
// 传入 onEdit/onDelete 时展示悬浮操作（台账页）；不传即为只读展示（回顾页）
import { useMemo } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import type { Achievement } from '@shared/types'
import { useStore } from '@/store'
import { useNav } from '@/nav'
import { achievementTypeIcon, useAchievementTypeLabel } from '@/hooks/useVocab'
import { Badge, IconButton } from '@/components/ui'
import { cn } from '@/lib/utils'
import { dayjs } from '@/lib/date'

interface AchievementTimelineProps {
  /** 已过滤的成果列表（组件内按日期倒序排列） */
  achievements: Achievement[]
  /** true 按年份分组并显示年份标题（成果台账）；false 单段时间线无年份标题（年度回顾） */
  groupByYear?: boolean
  onEdit?: (a: Achievement) => void
  onDelete?: (a: Achievement) => void
}

export default function AchievementTimeline({
  achievements,
  groupByYear = true,
  onEdit,
  onDelete
}: AchievementTimelineProps) {
  const projects = useStore((s) => s.projects)
  const navigate = useNav((s) => s.navigate)
  const typeLabel = useAchievementTypeLabel()

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])

  const sorted = useMemo(
    () => achievements.slice().sort((a, b) => (a.date < b.date ? 1 : -1)),
    [achievements]
  )

  const groups = useMemo(() => {
    if (!groupByYear) return [{ year: '', list: sorted }]
    const map = new Map<string, Achievement[]>()
    for (const a of sorted) {
      const y = dayjs(a.date).format('YYYY')
      const list = map.get(y) ?? []
      list.push(a)
      map.set(y, list)
    }
    return [...map.entries()].map(([year, list]) => ({ year, list })).sort((a, b) => (a.year < b.year ? 1 : -1))
  }, [groupByYear, sorted])

  return (
    <div className={cn('flex flex-col', groupByYear && 'mt-5 ml-1.5 gap-6')}>
      {groups.map(({ year, list }) => (
        <section key={year || 'all'} className="relative border-l-2 border-border pl-6">
          <div className="absolute top-0.5 -left-[6.5px] h-3 w-3 rounded-full border-[2.5px] border-bg bg-accent" />
          {year && <h3 className="mb-2.5 text-[17px] font-bold">{year} 年</h3>}
          <div className="flex flex-col gap-2.5">
            {list.map((a) => {
              const Icon = achievementTypeIcon(a.type)
              const project = a.project_id ? projectMap.get(a.project_id) : undefined
              return (
                <div
                  key={a.id}
                  className={cn(
                    'group flex flex-wrap items-start gap-3.5 rounded-xl border border-border bg-surface p-4',
                    a.is_draft && 'border-dashed opacity-90'
                  )}
                >
                  {/* 类型图标 tile */}
                  <span className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent [&_svg]:h-4 [&_svg]:w-4 [&_svg]:stroke-2">
                    <Icon />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-semibold">{a.title}</span>
                      {a.is_draft && <Badge color="yellow">草稿</Badge>}
                      {a.level && <Badge color="purple">{a.level}</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-text-3">
                      <span>{dayjs(a.date).format('M月D日')}</span>
                      <span>· {typeLabel(a.type)}</span>
                      {project && (
                        <button
                          className="flex items-center gap-1.5 hover:text-accent cursor-pointer"
                          onClick={() => navigate({ name: 'project-detail', projectId: project.id, tab: 'overview' })}
                        >
                          ·
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: project.color }} />
                          {project.name}
                        </button>
                      )}
                    </div>
                    {a.detail && <div className="mt-1.5 text-[12.5px] text-text-2">{a.detail}</div>}
                    {a.evidence_path && (
                      <button
                        className="mt-1 text-[11.5px] text-text-3 hover:text-accent cursor-pointer"
                        onClick={() => window.api.openPath(a.evidence_path)}
                        title="打开证明材料"
                      >
                        📎 {a.evidence_path}
                      </button>
                    )}
                  </div>
                  {(onEdit || onDelete) && (
                    <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      {onEdit && (
                        <IconButton title="编辑" onClick={() => onEdit(a)}>
                          <Pencil />
                        </IconButton>
                      )}
                      {onDelete && (
                        <IconButton
                          title="删除"
                          className="hover:bg-danger-soft hover:text-danger"
                          onClick={() => onDelete(a)}
                        >
                          <Trash2 />
                        </IconButton>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
