// 回顾：本地数据只读聚合页 —— 概览统计卡 / 活动热力图 / 投稿周期 / 项目投入分布 / 年度回顾
// 本页不产生任何新数据，全部统计来自现有集合的实时聚合（PRD V2.4 5.1）
import { useMemo, useState } from 'react'
import {
  CheckCircle2,
  Copy,
  FileText,
  Flame,
  FolderKanban,
  History,
  Hourglass,
  Lightbulb,
  TrendingUp,
  Trophy
} from 'lucide-react'
import { PAPER_STATUS_LABELS } from '@shared/types'
import { useStore } from '@/store'
import { useNav } from '@/nav'
import { useAchievementTypes } from '@/hooks/useVocab'
import AchievementTimeline from '@/components/AchievementTimeline'
import { Badge, Button, EmptyState, PageHeader, Select, StatCard } from '@/components/ui'
import { cn } from '@/lib/utils'
import { copyText } from '@/lib/clipboard'
import { dayjs, todayStr, weekStart } from '@/lib/date'
import {
  activityByDay,
  availableYears,
  heatLevel,
  type InsightsSource,
  overviewStats,
  projectInvestment,
  submissionStats,
  yearSummaryPlainText,
  yearlyStats
} from '@/lib/insights'

/** 热力图固定近 26 周（半年，PRD 决策 D22） */
const HEAT_WEEKS = 26

/** 色阶 4 档：无活动 / 少 / 中 / 多（accent 透明度阶梯，随主题 token 自适应） */
const LEVEL_CLASSES = ['bg-surface-2', 'bg-accent/30', 'bg-accent/55', 'bg-accent'] as const

/** 左侧星期标签（周一起始，仅标一 / 三 / 五 / 日） */
const WEEKDAY_LABELS = ['一', '', '三', '', '五', '', '日']

export default function InsightsPage() {
  const navigate = useNav((s) => s.navigate)
  const projects = useStore((s) => s.projects)
  const tasks = useStore((s) => s.tasks)
  const milestones = useStore((s) => s.milestones)
  const ideas = useStore((s) => s.ideas)
  const logs = useStore((s) => s.logs)
  const papers = useStore((s) => s.papers)
  const achievements = useStore((s) => s.achievements)
  const achievementTypes = useAchievementTypes()

  const today = todayStr()
  const [year, setYear] = useState<string>(String(dayjs().year()))
  const [copyMsg, setCopyMsg] = useState(false)

  const source: InsightsSource = useMemo(
    () => ({ projects, tasks, milestones, ideas, logs, papers, achievements }),
    [projects, tasks, milestones, ideas, logs, papers, achievements]
  )

  // ---------- 概览统计卡 ----------
  const ov = useMemo(() => overviewStats(source, dayjs().year()), [source])

  // ---------- 活动热力图 ----------
  const activity = useMemo(() => activityByDay(source), [source])
  const heatWeeks = useMemo(() => {
    const now = dayjs()
    // weekStart 返回 YYYY-MM-DD 字符串（周一为一周起点）
    const startMonday = dayjs(weekStart(now.subtract(HEAT_WEEKS - 1, 'week').format('YYYY-MM-DD')))
    const weeks: Array<Array<{ date: string; inFuture: boolean; isToday: boolean }>> = []
    for (let w = 0; w < HEAT_WEEKS; w++) {
      const days = Array.from({ length: 7 }, (_, d) => {
        const date = startMonday.add(w * 7 + d, 'day')
        return {
          date: date.format('YYYY-MM-DD'),
          inFuture: date.isAfter(now, 'day'),
          isToday: date.isSame(now, 'day')
        }
      })
      weeks.push(days)
    }
    return weeks
    // 以日期串为依赖：跨天使用时重算
  }, [today])

  // ---------- 投稿周期 ----------
  const subs = useMemo(() => submissionStats(source, today), [source, today])

  // ---------- 项目投入 ----------
  const invest = useMemo(() => projectInvestment(source, 6), [source])
  const investMax = Math.max(...invest.map((m) => m.total), 1)
  const investProjects = useMemo(() => {
    // 图例：近 6 个月出现过的项目（保持项目顺序）+ 杂项
    const ids = new Set<string | null>()
    for (const m of invest) for (const seg of m.segments) ids.add(seg.projectId)
    return [
      ...projects.filter((p) => ids.has(p.id)).map((p) => ({ id: p.id as string | null, name: p.name, color: p.color })),
      ...(ids.has(null) ? [{ id: null as string | null, name: '杂项任务', color: 'var(--color-text-3)' }] : [])
    ]
  }, [invest, projects])

  // ---------- 年度回顾 ----------
  const years = useMemo(() => availableYears(source), [source])
  const selectedYear = years.includes(Number(year)) ? Number(year) : dayjs().year()
  const yd = useMemo(() => yearlyStats(source, selectedYear), [source, selectedYear])

  const doCopy = async (): Promise<void> => {
    await copyText(yearSummaryPlainText(selectedYear, yd, source, achievementTypes))
    setCopyMsg(true)
    setTimeout(() => setCopyMsg(false), 2500)
  }

  return (
    <div className="page">
      <PageHeader
        title="回顾"
        sub="投稿周期、活动热力与年度回顾 · 全部由本地数据实时聚合，零手工统计"
      />

      {/* 概览统计卡（口径以卡片角标小字注明） */}
      <div className="mt-5 grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        <StatCard
          label="本年完成任务"
          value={ov.tasksDoneThisYear}
          hint="口径：1 月 1 日至今"
          icon={<CheckCircle2 />}
          onClick={() => navigate({ name: 'tasks' })}
        />
        <StatCard
          label="进行中项目"
          value={ov.activeProjects}
          hint="口径：当前状态"
          icon={<FolderKanban />}
          onClick={() => navigate({ name: 'projects' })}
        />
        <StatCard
          label="累计成果"
          value={ov.totalAchievements}
          hint={ov.draftAchievements > 0 ? `口径：累计 · 含 ${ov.draftAchievements} 项草稿` : '口径：累计'}
          icon={<Trophy />}
          onClick={() => navigate({ name: 'achievements' })}
        />
        <StatCard
          label="灵感转化率"
          value={ov.ideaTotal > 0 ? `${Math.round((ov.ideaConverted / ov.ideaTotal) * 100)}%` : '—'}
          hint={`口径：累计 · ${ov.ideaConverted}/${ov.ideaTotal} 已转换`}
          icon={<Lightbulb />}
          onClick={() => navigate({ name: 'ideas' })}
        />
      </div>

      {/* 活动热力图 */}
      <section className="mt-4 rounded-xl border border-border bg-surface px-4.5 py-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <Flame size={15} className="shrink-0 text-accent" />
            活动热力图
          </h2>
          <span className="text-[11.5px] text-text-3">近 26 周 · 计数 = 当日完成任务 + 进展日志</span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {/* 星期标签列 */}
          <div className="flex shrink-0 flex-col gap-[3px] pt-[18px]">
            {WEEKDAY_LABELS.map((label, i) => (
              <span key={i} className="flex h-3 w-3.5 items-center justify-end text-[11.5px] leading-none text-text-3">
                {label}
              </span>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            {/* 月份标签行 */}
            <div className="mb-1.5 flex h-3 gap-[3px]">
              {heatWeeks.map((week, wi) => {
                const m = dayjs(week[0].date).month()
                const prev = wi > 0 ? dayjs(heatWeeks[wi - 1][0].date).month() : -1
                return (
                  <span key={wi} className="relative w-3 shrink-0">
                    {m !== prev && (
                      <span className="absolute left-0 top-0 whitespace-nowrap text-[11.5px] leading-3 text-text-3">
                        {m + 1}月
                      </span>
                    )}
                  </span>
                )
              })}
            </div>
            {/* 色块网格：列 = 周，行 = 周一至周日 */}
            <div className="flex gap-[3px]">
              {heatWeeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map((d) => {
                    if (d.inFuture) return <span key={d.date} className="h-3 w-3 rounded-[3px]" />
                    const act = activity.get(d.date)
                    const total = (act?.tasks ?? 0) + (act?.logs ?? 0)
                    return (
                      <span
                        key={d.date}
                        title={`${dayjs(d.date).format('YYYY年M月D日')}：任务 ${act?.tasks ?? 0} · 日志 ${act?.logs ?? 0}`}
                        className={cn(
                          'h-3 w-3 rounded-[3px]',
                          LEVEL_CLASSES[heatLevel(total)],
                          d.isToday && 'ring-1 ring-accent'
                        )}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* 图例 */}
        <div className="mt-2.5 flex items-center justify-end gap-1.5 text-[11.5px] text-text-3">
          <span>少</span>
          {LEVEL_CLASSES.map((c) => (
            <span key={c} className={cn('h-3 w-3 rounded-[3px]', c)} />
          ))}
          <span>多</span>
        </div>
      </section>

      {/* 投稿周期统计 */}
      <section className="mt-4 rounded-xl border border-border bg-surface px-4.5 py-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <Hourglass size={15} className="shrink-0 text-accent" />
            投稿周期
          </h2>
          {subs.overallAvgDays !== null && (
            <span className="text-[11.5px] text-text-3">
              全部论文平均 <span className="font-semibold tabular-nums text-text-2">{subs.overallAvgDays} 天</span>（{subs.completed.length} 篇）
            </span>
          )}
        </div>

        {subs.completed.length === 0 && subs.pending.length === 0 ? (
          <EmptyState
            icon={<Hourglass />}
            title="暂无投稿周期数据"
            hint="在论文投稿页补全「投稿日期 + 结果通知日期」后，这里自动统计审稿周期。"
            action={<Button size="sm" onClick={() => navigate({ name: 'papers' })}>去论文投稿页</Button>}
          />
        ) : (
          <>
            {/* 已出结果 */}
            {subs.completed.length > 0 && (
              <div>
                <h3 className="mb-1 text-[13px] font-semibold text-text-2">已出结果（{subs.completed.length} 篇）</h3>
                <div className="flex items-center gap-x-3 pb-1 text-[11.5px] text-text-3">
                  <span className="min-w-0 flex-1">论文</span>
                  <span className="hidden w-36 shrink-0 truncate md:block">目标 Venue</span>
                  <span className="w-24 shrink-0">投稿日期</span>
                  <span className="w-20 shrink-0 text-right">出结果耗时</span>
                </div>
                <div className="flex flex-col divide-y divide-border">
                  {subs.completed.map((c) => (
                    <div key={c.paper.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{c.paper.title}</span>
                      <span className="hidden w-36 shrink-0 truncate text-[12.5px] text-text-3 md:block">
                        {c.paper.venue || '—'}
                      </span>
                      <span className="w-24 shrink-0 text-[11.5px] text-text-3 tabular-nums">
                        {c.paper.dates.submission}
                      </span>
                      <span className="w-20 shrink-0 text-right text-[13px] font-semibold tabular-nums">
                        {c.days} 天
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 在投中 */}
            {subs.pending.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-1 text-[13px] font-semibold text-text-2">在投中（{subs.pending.length} 篇）</h3>
                <div className="flex flex-col divide-y divide-border">
                  {subs.pending.map((p) => (
                    <div key={p.paper.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{p.paper.title}</span>
                      <Badge color={p.paper.status === 'major_revision' || p.paper.status === 'minor_revision' ? 'yellow' : 'blue'}>
                        {PAPER_STATUS_LABELS[p.paper.status]}
                      </Badge>
                      <span className="hidden w-36 shrink-0 truncate text-[12.5px] text-text-3 md:block">
                        {p.paper.venue || '—'}
                      </span>
                      <span
                        title={p.slowerThanVenueAvg ? '已超过该 venue 的历史平均审稿周期' : undefined}
                        className={cn(
                          'w-24 shrink-0 text-right text-[13px] font-semibold tabular-nums',
                          p.slowerThanVenueAvg && 'text-warn'
                        )}
                      >
                        已等待 {p.waitedDays} 天
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* venue 平均审稿周期（≥2 篇） */}
            {subs.venueAverages.length > 0 && (
              <div className="mt-3.5 flex flex-wrap items-center gap-2">
                {subs.venueAverages.map((v) => (
                  <span key={v.venue} className="rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-[12.5px]">
                    {v.venue} 平均 <span className="font-semibold tabular-nums">{v.avgDays} 天</span>
                    <span className="text-text-3">（{v.count} 篇）</span>
                  </span>
                ))}
              </div>
            )}

            {subs.excluded > 0 && (
              <p className="mt-2.5 text-[11.5px] text-text-3">
                另有 {subs.excluded} 篇论文缺少投稿 / 结果日期，未参与统计。
              </p>
            )}
          </>
        )}
      </section>

      {/* 项目投入分布（近 6 个月完成任务按项目堆叠） */}
      <section className="mt-4 rounded-xl border border-border bg-surface px-4.5 py-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <TrendingUp size={15} className="shrink-0 text-accent" />
            项目投入分布
          </h2>
          <span className="text-[11.5px] text-text-3">近 6 个月 · 按完成任务数</span>
        </div>
        {investMax === 1 && invest.every((m) => m.total === 0) ? (
          <p className="py-3 text-[12.5px] text-text-3">近 6 个月没有完成任务记录。</p>
        ) : (
          <>
            {investProjects.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-x-3.5 gap-y-1.5">
                {investProjects.map((p) => (
                  <span key={String(p.id)} className="flex items-center gap-1.5 text-[11.5px] text-text-3">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                    {p.name}
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-2.5">
              {invest.map((m) => (
                <div key={m.key} className="flex items-center gap-3">
                  <span className="w-14 shrink-0 text-right text-[11.5px] text-text-3 tabular-nums">{m.label}</span>
                  <div
                    className="h-4 min-w-0 flex-1 overflow-hidden rounded-md bg-surface-2"
                    title={m.total > 0 ? `完成任务 ${m.total} 项` : '无完成记录'}
                  >
                    <div className="flex h-full">
                      {m.segments.map((seg) => (
                        <div
                          key={String(seg.projectId)}
                          className="h-full"
                          style={{ width: `${(seg.count / investMax) * 100}%`, backgroundColor: seg.color }}
                          title={`${seg.name} ${seg.count} 项`}
                        />
                      ))}
                    </div>
                  </div>
                  <span className="w-7 shrink-0 text-right text-[12.5px] tabular-nums text-text-2">{m.total}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* 年度回顾 */}
      <section className="mt-4 rounded-xl border border-border bg-surface px-4.5 py-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <History size={15} className="shrink-0 text-accent" />
            年度回顾
          </h2>
          <div className="flex items-center gap-2">
            {copyMsg && <span className="text-[12px] text-success">已复制年度总结</span>}
            <Select
              value={String(selectedYear)}
              onChange={(e) => setYear(e.target.value)}
              className="h-7 w-auto min-w-16 text-[12.5px]"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y} 年
                </option>
              ))}
            </Select>
            <Button size="sm" onClick={doCopy}>
              <Copy /> 复制年度总结
            </Button>
          </div>
        </div>

        <div className="flex divide-x divide-border">
          <Metric label="完成任务" value={yd.doneTasks} />
          <Metric label="进展日志" value={yd.logs} />
          <Metric label="节点完成" value={yd.doneMilestones} />
          <Metric label={`新增灵感（转化 ${yd.convertedIdeas}）`} value={yd.newIdeas} />
        </div>

        {yd.achievements.length > 0 ? (
          <div className="mt-4">
            <AchievementTimeline achievements={yd.achievements} groupByYear={false} />
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-2 text-[12.5px] text-text-3">
            <FileText size={14} className="shrink-0" />
            {selectedYear} 年暂无成果记录，去成果台账登记后这里自动归档。
          </div>
        )}
      </section>
    </div>
  )
}

/** 年度回顾指标（Dashboard 底部 Metric 同款） */
function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex-1 px-4 first:pl-0 last:pr-0">
      <div className="text-[17px] font-bold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[11.5px] text-text-3">{label}</div>
    </div>
  )
}
