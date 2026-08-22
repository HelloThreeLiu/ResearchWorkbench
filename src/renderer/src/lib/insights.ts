// 回顾页聚合引擎：概览统计卡 / 活动热力图 / 投稿周期 / 项目投入 / 年度回顾
// 全部为现有集合的只读聚合，本页不产生任何新数据（PRD V2.4 5.1）
import type {
  Achievement,
  Idea,
  Milestone,
  Paper,
  ProgressLog,
  Project,
  Task,
  VocabTypeDef
} from '@shared/types'
import { achievementsToPlainText } from './report'
import { dayjs } from './date'

export interface InsightsSource {
  projects: Project[]
  tasks: Task[]
  milestones: Milestone[]
  ideas: Idea[]
  logs: ProgressLog[]
  papers: Paper[]
  achievements: Achievement[]
}

// ---------- 概览统计卡 ----------

export interface OverviewStats {
  tasksDoneThisYear: number // 本年（1 月 1 日至今）完成任务数
  activeProjects: number // 当前进行中项目数
  totalAchievements: number // 累计成果数（含草稿）
  draftAchievements: number
  ideaTotal: number // 累计灵感数
  ideaConverted: number // 累计已转换灵感数
}

export function overviewStats(source: InsightsSource, year: number): OverviewStats {
  const y = String(year)
  return {
    tasksDoneThisYear: source.tasks.filter(
      (t) => t.completed_at && t.completed_at.slice(0, 4) === y
    ).length,
    activeProjects: source.projects.filter((p) => p.status === 'active').length,
    totalAchievements: source.achievements.length,
    draftAchievements: source.achievements.filter((a) => a.is_draft).length,
    ideaTotal: source.ideas.length,
    ideaConverted: source.ideas.filter((i) => i.status === 'converted').length
  }
}

// ---------- 活动热力图 ----------

export interface DayActivity {
  date: string // YYYY-MM-DD
  tasks: number // 当日完成任务数
  logs: number // 当日进展日志条数
  // V2.6 起增加写作口径：sessions（当日写作 session 数），届时热力图增加「全部 / 仅写作」切换
}

/** 按日聚合活动计数（键为 YYYY-MM-DD） */
export function activityByDay(source: InsightsSource): Map<string, DayActivity> {
  const map = new Map<string, DayActivity>()
  const get = (date: string): DayActivity => {
    let d = map.get(date)
    if (!d) {
      d = { date, tasks: 0, logs: 0 }
      map.set(date, d)
    }
    return d
  }
  for (const t of source.tasks) {
    if (t.completed_at) get(t.completed_at.slice(0, 10)).tasks += 1
  }
  for (const l of source.logs) get(l.date).logs += 1
  return map
}

/** 热力图色阶档位：0 无活动 / 1 少（1-2）/ 2 中（3-5）/ 3 多（6+） */
export function heatLevel(total: number): 0 | 1 | 2 | 3 {
  if (total <= 0) return 0
  if (total <= 2) return 1
  if (total <= 5) return 2
  return 3
}

// ---------- 投稿周期统计 ----------

/** 在投状态（用于「在投论文」小节） */
const PENDING_STATUSES = ['submitted', 'reviewing', 'major_revision', 'minor_revision']

export interface CompletedCycle {
  paper: Paper
  days: number // 出结果耗时（自然日）
}

export interface PendingCycle {
  paper: Paper
  waitedDays: number // 投稿日至今
  slowerThanVenueAvg: boolean // 已等待超过该 venue 历史均值（均值需 ≥2 条完整周期）
}

export interface VenueAverage {
  venue: string
  avgDays: number
  count: number
}

export interface SubmissionStats {
  completed: CompletedCycle[] // 投稿 + 结果日期齐全的论文，最新投稿在前
  pending: PendingCycle[] // 在投论文，等待最久在前
  venueAverages: VenueAverage[] // 仅 ≥2 篇的 venue
  overallAvgDays: number | null
  excluded: number // 无完整日期、不参与统计的论文数
}

export function submissionStats(source: InsightsSource, today: string): SubmissionStats {
  const completed: CompletedCycle[] = []
  const pending: PendingCycle[] = []
  let excluded = 0

  for (const p of source.papers) {
    const sub = p.dates.submission
    const res = p.dates.result
    if (sub && res) {
      completed.push({ paper: p, days: dayjs(res).diff(dayjs(sub), 'day') })
    } else if (sub && !res && PENDING_STATUSES.includes(p.status)) {
      pending.push({ paper: p, waitedDays: dayjs(today).diff(dayjs(sub), 'day'), slowerThanVenueAvg: false })
    } else {
      excluded += 1
    }
  }

  completed.sort((a, b) => (a.paper.dates.submission! < b.paper.dates.submission! ? 1 : -1))

  // 按 venue 分组计算平均审稿周期（≥2 篇才显示均值）
  const byVenue = new Map<string, number[]>()
  for (const c of completed) {
    const venue = c.paper.venue.trim()
    if (!venue) continue
    const list = byVenue.get(venue) ?? []
    list.push(c.days)
    byVenue.set(venue, list)
  }
  const venueAverages: VenueAverage[] = [...byVenue.entries()]
    .filter(([, days]) => days.length >= 2)
    .map(([venue, days]) => ({
      venue,
      avgDays: Math.round(days.reduce((s, d) => s + d, 0) / days.length),
      count: days.length
    }))
    .sort((a, b) => b.count - a.count || b.avgDays - a.avgDays)

  const avgMap = new Map(venueAverages.map((v) => [v.venue, v.avgDays]))
  for (const item of pending) {
    const avg = avgMap.get(item.paper.venue.trim())
    item.slowerThanVenueAvg = avg !== undefined && item.waitedDays > avg
  }
  pending.sort((a, b) => b.waitedDays - a.waitedDays)

  return {
    completed,
    pending,
    venueAverages,
    overallAvgDays:
      completed.length > 0
        ? Math.round(completed.reduce((s, c) => s + c.days, 0) / completed.length)
        : null,
    excluded
  }
}

// ---------- 项目投入分布（近 6 个月） ----------

export interface InvestSegment {
  projectId: string | null // null = 杂项任务
  name: string
  color: string // 项目标识色；杂项用主题中性灰（token 变量）
  count: number
}

export interface MonthInvestment {
  key: string // YYYY-MM
  label: string // 当年显示「3月」，跨年显示「2025年12月」
  total: number
  segments: InvestSegment[] // 按项目顺序稳定排列，杂项在末尾
}

/** 杂项任务的中性灰（主题感知 token，随明暗切换） */
export const MISC_COLOR = 'var(--color-text-3)'

export function projectInvestment(source: InsightsSource, months = 6): MonthInvestment[] {
  const today = dayjs()
  const result: MonthInvestment[] = []
  for (let i = months - 1; i >= 0; i--) {
    const m = today.subtract(i, 'month')
    const key = m.format('YYYY-MM')
    const counts = new Map<string | null, number>()
    for (const t of source.tasks) {
      if (t.completed_at && t.completed_at.slice(0, 7) === key) {
        counts.set(t.project_id, (counts.get(t.project_id) ?? 0) + 1)
      }
    }
    // 分段顺序跟随项目列表顺序，杂项固定在末尾
    const segments: InvestSegment[] = []
    for (const p of source.projects) {
      const count = counts.get(p.id) ?? 0
      if (count > 0) segments.push({ projectId: p.id, name: p.name, color: p.color, count })
    }
    const misc = counts.get(null) ?? 0
    if (misc > 0) segments.push({ projectId: null, name: '杂项任务', color: MISC_COLOR, count: misc })
    result.push({
      key,
      label: m.year() === today.year() ? `${m.month() + 1}月` : `${m.year()}年${m.month() + 1}月`,
      total: segments.reduce((s, seg) => s + seg.count, 0),
      segments
    })
  }
  return result
}

// ---------- 年度回顾 ----------

export interface YearlyStats {
  doneTasks: number
  logs: number
  doneMilestones: number
  newIdeas: number
  convertedIdeas: number
  achievements: Achievement[] // 该年成果，日期倒序
}

export function yearlyStats(source: InsightsSource, year: number): YearlyStats {
  const y = String(year)
  return {
    doneTasks: source.tasks.filter((t) => t.completed_at && t.completed_at.slice(0, 4) === y).length,
    logs: source.logs.filter((l) => l.date.slice(0, 4) === y).length,
    doneMilestones: source.milestones.filter(
      (m) => m.status === 'done' && m.date.slice(0, 4) === y
    ).length,
    newIdeas: source.ideas.filter((i) => i.created_at.slice(0, 4) === y).length,
    convertedIdeas: source.ideas.filter(
      (i) => i.status === 'converted' && i.created_at.slice(0, 4) === y
    ).length,
    achievements: source.achievements
      .filter((a) => a.date.slice(0, 4) === y)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
  }
}

/** 年份选择器候选：数据中最早年份 → 今年，倒序 */
export function availableYears(source: InsightsSource): number[] {
  const thisYear = dayjs().year()
  let min = thisYear
  const consider = (dateStr: string | null | undefined): void => {
    if (!dateStr) return
    const y = Number(dateStr.slice(0, 4))
    if (Number.isFinite(y) && y > 1900 && y < min) min = y
  }
  for (const t of source.tasks) consider(t.completed_at)
  for (const l of source.logs) consider(l.date)
  for (const m of source.milestones) consider(m.date)
  for (const i of source.ideas) consider(i.created_at)
  for (const a of source.achievements) consider(a.date)
  for (const p of source.papers) {
    consider(p.dates.submission)
    consider(p.dates.result)
  }
  const years: number[] = []
  for (let y = thisYear; y >= min; y--) years.push(y)
  return years
}

/** 复制年度总结：关键数字 + 成果清单（纯文本，用于年终总结 / 简历） */
export function yearSummaryPlainText(
  year: number,
  stats: YearlyStats,
  source: InsightsSource,
  achievementTypes: VocabTypeDef[]
): string {
  const numbers = [
    `完成任务 ${stats.doneTasks} 项`,
    `进展日志 ${stats.logs} 条`,
    `节点完成 ${stats.doneMilestones} 个`,
    `新增灵感 ${stats.newIdeas} 条（已转换 ${stats.convertedIdeas} 条）`
  ].join(' · ')
  const list = achievementsToPlainText(stats.achievements, source.projects, achievementTypes)
  return [
    `${year} 年度回顾（格致 · 科研工作台）`,
    numbers,
    stats.achievements.length > 0 ? `成果（${stats.achievements.length} 项）：\n${list}` : '成果：暂无'
  ].join('\n')
}
