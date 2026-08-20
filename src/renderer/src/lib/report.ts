// 周报/月报/工作总结 聚合引擎：
// 聚合周期内的已完成任务（按项目分组）、进展日志、新增灵感摘要、节点事件；
// 下期计划默认带入后续 7 天内到期未完成任务；模板占位符渲染
import type {
  Achievement,
  Idea,
  Milestone,
  Paper,
  ProgressLog,
  Project,
  Report,
  ReportKind,
  Task
} from '@shared/types'
import { ACHIEVEMENT_TYPE_LABELS } from '@shared/types'
import { dayjs } from './date'

export interface ReportSource {
  projects: Project[]
  tasks: Task[]
  logs: ProgressLog[]
  ideas: Idea[]
  milestones: Milestone[]
  achievements: Achievement[]
  papers: Paper[]
}

export interface Period {
  start: string // YYYY-MM-DD（含）
  end: string // YYYY-MM-DD（含）
}

/** 本周（周一至今）/上周/本月 */
export function periodOf(kind: 'thisWeek' | 'lastWeek' | 'thisMonth'): Period {
  const today = dayjs()
  if (kind === 'thisMonth') {
    return {
      start: today.startOf('month').format('YYYY-MM-DD'),
      end: today.endOf('month').format('YYYY-MM-DD')
    }
  }
  const weekStartD = today.startOf('week')
  if (kind === 'thisWeek') {
    return {
      start: weekStartD.format('YYYY-MM-DD'),
      end: weekStartD.add(6, 'day').format('YYYY-MM-DD')
    }
  }
  const lastStart = weekStartD.subtract(7, 'day')
  return {
    start: lastStart.format('YYYY-MM-DD'),
    end: lastStart.add(6, 'day').format('YYYY-MM-DD')
  }
}

function inPeriod(dateStr: string, p: Period): boolean {
  return dateStr >= p.start && dateStr <= p.end
}

function fmtMD(dateStr: string): string {
  return dayjs(dateStr).format('M月D日')
}

/** ISO 周数（用于导出文件命名：周报_2026_第34周_YYYYMMDD） */
export function isoWeekNumber(dateStr: string): number {
  return dayjs(dateStr).isoWeek()
}

function groupTitle(projectId: string | null, projects: Project[]): string {
  if (!projectId) return '其他工作'
  return projects.find((p) => p.id === projectId)?.name ?? '其他工作'
}

/** 聚合「本期工作」Markdown（按项目分组：完成任务 + 进展日志） */
function buildWorkSection(source: ReportSource, p: Period): string {
  const doneTasks = source.tasks.filter(
    (t) => t.status === 'done' && t.completed_at && inPeriod(t.completed_at.slice(0, 10), p)
  )
  const periodLogs = source.logs.filter((l) => inPeriod(l.date, p))
  const projectIds = new Set<string | null>()
  doneTasks.forEach((t) => projectIds.add(t.project_id))
  periodLogs.forEach((l) => projectIds.add(l.project_id))

  if (projectIds.size === 0) return '（本期暂无记录）'

  const lines: string[] = []
  const orderedIds: Array<string | null> = [
    ...source.projects.filter((pr) => projectIds.has(pr.id)).map((pr) => pr.id as string | null),
    ...(projectIds.has(null) ? [null] : [])
  ]
  for (const pid of orderedIds) {
    const name = groupTitle(pid, source.projects)
    const tasks = doneTasks.filter((t) => t.project_id === pid)
    const logs = periodLogs.filter((l) => l.project_id === pid)
    if (tasks.length === 0 && logs.length === 0) continue
    lines.push(`### ${name}`)
    tasks.forEach((t) => {
      lines.push(`- 完成任务：${t.title}`)
    })
    logs
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .forEach((l) => {
        const first = l.content.split('\n')[0].replace(/^#+\s*/, '').trim()
        lines.push(`- ${fmtMD(l.date)} 进展：${first.slice(0, 100)}`)
      })
  }
  // 发生的节点事件（本周内日期命中）
  const events = source.milestones.filter((m) => inPeriod(m.date, p))
  if (events.length > 0) {
    lines.push('### 关键节点')
    events.forEach((m) => {
      lines.push(`- ${fmtMD(m.date)} ${m.title}（${m.status === 'done' ? '已完成' : '临近/待确认'}）`)
    })
  }
  return lines.join('\n')
}

/** 下期计划：周期结束后 7 天内到期且未完成的任务（工作总结类不带） */
function buildPlanSection(source: ReportSource, p: Period): string {
  const nextStart = dayjs(p.end).add(1, 'day')
  const nextEnd = dayjs(p.end).add(7, 'day')
  const range = { start: nextStart.format('YYYY-MM-DD'), end: nextEnd.format('YYYY-MM-DD') }
  const upcoming = source.tasks
    .filter(
      (t) =>
        t.status !== 'done' &&
        t.due_date !== null &&
        t.due_date >= range.start &&
        t.due_date <= range.end
    )
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
  if (upcoming.length === 0) return '（待补充）'
  const lines: string[] = []
  const byProject = new Map<string | null, Task[]>()
  upcoming.forEach((t) => {
    const list = byProject.get(t.project_id) ?? []
    list.push(t)
    byProject.set(t.project_id, list)
  })
  for (const [pid, list] of byProject) {
    lines.push(`**${groupTitle(pid, source.projects)}**`)
    list.forEach((t) => {
      lines.push(`- ${t.title}（${fmtMD(t.due_date!)} 到期）`)
    })
  }
  return lines.join('\n')
}

/** 灵感摘要（本期新增，取首行） */
function buildIdeasSummary(source: ReportSource, p: Period): string {
  const newIdeas = source.ideas.filter((i) => inPeriod(i.created_at.slice(0, 10), p))
  if (newIdeas.length === 0) return ''
  const lines = newIdeas.slice(0, 10).map((i) => {
    const first = i.content.split('\n')[0].trim()
    return `- ${first.slice(0, 80)}`
  })
  if (newIdeas.length > 10) lines.push(`- …另有 ${newIdeas.length - 10} 条，见灵感页`)
  return lines.join('\n')
}

/** 工作总结附加：任务统计 + 成果列表 */
function buildSummaryExtras(source: ReportSource, p: Period): { stats: string; achievements: string } {
  const doneTasks = source.tasks.filter(
    (t) => t.status === 'done' && t.completed_at && inPeriod(t.completed_at.slice(0, 10), p)
  )
  const openTasks = source.tasks.filter((t) => t.status !== 'done')
  const periodAchievements = source.achievements.filter((a) => inPeriod(a.date, p))
  const stats = [
    `- 本期完成任务 **${doneTasks.length}** 项`,
    `- 当前待办任务 ${openTasks.length} 项`,
    `- 本期新增成果 ${periodAchievements.length} 项`
  ].join('\n')
  const achievementLines = periodAchievements
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((a) => `- ${fmtMD(a.date)}【${ACHIEVEMENT_TYPE_LABELS[a.type]}${a.level ? `·${a.level}` : ''}】${a.title}`)
  return {
    stats,
    achievements: achievementLines.length > 0 ? achievementLines.join('\n') : '（本期无新增成果）'
  }
}

export interface GeneratedReport {
  title: string
  content: string
  period: Period
}

/** 生成报告草稿（模板占位符渲染） */
export function generateReport(
  kind: ReportKind,
  period: Period,
  source: ReportSource,
  template: string
): GeneratedReport {
  const periodText =
    kind === 'weekly'
      ? `${period.start} ~ ${period.end}（第 ${isoWeekNumber(period.end)} 周）`
      : `${period.start} ~ ${period.end}`

  let work = buildWorkSection(source, period)
  const ideas = buildIdeasSummary(source, period)
  if (ideas) {
    work += `\n\n### 灵感摘录\n${ideas}`
  }

  let plan = kind === 'summary' ? '（工作总结不含下期计划）' : buildPlanSection(source, period)

  let content = template
  if (kind === 'summary') {
    // 工作总结：附加统计与成果
    const extras = buildSummaryExtras(source, period)
    content = template
      .replace('{{TITLE}}', '工作总结')
      .replace('{{PERIOD}}', periodText)
      .replace('{{WORK}}', `${extras.stats}\n\n${work}\n\n### 成果\n${extras.achievements}`)
      .replace('{{PLAN}}', plan)
      .replace('{{THOUGHTS}}', '')
  } else {
    const title = kind === 'weekly' ? '周报' : '月报'
    content = template
      .replace('{{TITLE}}', title)
      .replace('{{PERIOD}}', periodText)
      .replace('{{WORK}}', work)
      .replace('{{PLAN}}', plan)
      .replace('{{THOUGHTS}}', '')
  }

  const title =
    kind === 'weekly'
      ? `周报 ${period.end}（第 ${isoWeekNumber(period.end)} 周）`
      : kind === 'monthly'
        ? `月报 ${period.end}`
        : `工作总结 ${period.start}~${period.end}`

  return { title, content, period }
}

/** 导出文件名：周报_2026_第34周_20260821.docx（PRD 6.10.3 命名规范） */
export function exportFileName(report: Report): string {
  const y = dayjs(report.period_end).year()
  const compact = dayjs(report.period_end).format('YYYYMMDD')
  if (report.kind === 'weekly') {
    return `周报_${y}_第${isoWeekNumber(report.period_end)}周_${compact}`
  }
  if (report.kind === 'monthly') {
    return `月报_${y}${dayjs(report.period_end).format('MM')}_${compact}`
  }
  return `工作总结_${dayjs(report.period_start).format('YYYYMMDD')}_${compact}`
}

/** 成果台账复制为纯文本（用于填简历/年终总结） */
export function achievementsToPlainText(
  achievements: Achievement[],
  projects: Project[]
): string {
  return achievements
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((a) => {
      const projectName = a.project_id ? projects.find((p) => p.id === a.project_id)?.name : undefined
      const parts = [
        a.date,
        `【${ACHIEVEMENT_TYPE_LABELS[a.type]}${a.level ? `·${a.level}` : ''}】`,
        a.title,
        projectName ? `（${projectName}）` : '',
        a.is_draft ? ' [草稿]' : ''
      ]
      return parts.join(' ').trim()
    })
    .join('\n')
}
