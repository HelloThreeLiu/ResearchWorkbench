// 写作度量与周报新块 纯函数（PRD 5.5 / 5.6）：时长派生、格式化、残留判定、周月聚合、
// {{MEETINGS}}/{{WRITING}} 块构建、模板占位符渲染
// 零运行时依赖（类型全部 import type，由 Node 类型剥离擦除）——供 node:test 直接回归
// （tests/writing.test.ts / tests/report.test.ts）
import type { Meeting, Paper, WritingSession } from '@shared/types'

/** 忘记停止防护阈值：时长超过 4 小时黄字提醒（PRD 5.5.4），残留补记默认结束=开始+4h（PRD 5.5.3） */
export const FORGET_GUARD_MS = 4 * 60 * 60 * 1000

/** session 时长毫秒（ended_at 为空按当前时间，供计时中显示）；时间戳非法按 0 处理 */
export function sessionDurationMs(startedAt: string, endedAt?: string | null): number {
  const start = Date.parse(startedAt)
  if (Number.isNaN(start)) return 0
  const endRaw = endedAt ?? null
  const end = endRaw !== null && !Number.isNaN(Date.parse(endRaw)) ? Date.parse(endRaw) : Date.now()
  return Math.max(0, end - start)
}

/** 时长人类可读文案：<1 分「N 秒」；<1 小时「N 分」；否则「X 小时 Y 分」 */
export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000))
  if (totalSec < 60) return `${totalSec} 秒`
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  if (h === 0) return `${m} 分`
  return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`
}

/** 计时按钮显示：mm:ss（满 1 小时起 h:mm:ss） */
export function formatTimerDisplay(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/** 异常残留判定（PRD 5.5.3/8.3）：存在 started_at 无 ended_at 的记录即触发补记流程 */
export function isResidualSession(s: Pick<WritingSession, 'ended_at'>): boolean {
  return s.ended_at == null
}

/** 残留补记的默认结束时间：开始时间 +4 小时（可修改） */
export function residualDefaultEnd(startedAt: string): string {
  const start = Date.parse(startedAt)
  if (Number.isNaN(start)) return new Date().toISOString()
  return new Date(start + FORGET_GUARD_MS).toISOString()
}

/** 忘记停止防护：时长是否超过 4 小时 */
export function overForgetGuard(ms: number): boolean {
  return ms > FORGET_GUARD_MS
}

/** 报告聚合周期（与 report.ts 的 Period 结构兼容，此处本地声明避免引入其运行时依赖链） */
interface PeriodLike {
  start: string // YYYY-MM-DD（含）
  end: string // YYYY-MM-DD（含）
}

/** 周期（YYYY-MM-DD，含两端）内的 session（按开始日期的日期部分过滤，与 report.inPeriod 同口径） */
export function sessionsInPeriod(sessions: WritingSession[], period: PeriodLike): WritingSession[] {
  return sessions.filter((s) => {
    const day = s.started_at.slice(0, 10)
    return day >= period.start && day <= period.end
  })
}

/** 周期聚合：总时长毫秒、总字数、session 数（时长/字数逐条求和，字数空缺不计入但计数） */
export function writingPeriodStats(sessions: WritingSession[]): {
  count: number
  durationMs: number
  words: number
} {
  let durationMs = 0
  let words = 0
  for (const s of sessions) {
    durationMs += sessionDurationMs(s.started_at, s.ended_at)
    if (typeof s.words === 'number') words += s.words
  }
  return { count: sessions.length, durationMs, words }
}

/** 按论文分组明细（PRD 5.6 {{WRITING}}）：paper_id → 时长/字数聚合；无论文归 null 键 */
export function writingByPaper(
  sessions: WritingSession[]
): Array<{ paperId: string | null; durationMs: number; words: number; count: number }> {
  const map = new Map<string | null, { durationMs: number; words: number; count: number }>()
  for (const s of sessions) {
    const key = s.paper_id ?? null
    const agg = map.get(key) ?? { durationMs: 0, words: 0, count: 0 }
    agg.durationMs += sessionDurationMs(s.started_at, s.ended_at)
    if (typeof s.words === 'number') agg.words += s.words
    agg.count += 1
    map.set(key, agg)
  }
  return [...map.entries()].map(([paperId, agg]) => ({ paperId, ...agg }))
}

// ---------- 周报新块（V2.6 5.6） ----------

/** M月D日（YYYY-MM-DD → 纯字符串解析，保持本模块零依赖可被 node:test 加载） */
function md(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  if (!m || !d) return dateStr
  return `${Number(m)}月${Number(d)}日`
}

/**
 * 模板占位符渲染：函数式替换 + 一次正则覆盖所有出现位置。
 * 不能用字符串形式的 replace('{{X}}', v)：v 里的 $&/$`/$'/$$ 会被当作替换模式插回匹配文本，
 * 且只替换首个占位符（模板里写两次 {{WORK}} 时第二个会留在成品里）。
 */
export function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '')
}

/** {{MEETINGS}}：周期内会议（日期倒序）+ 各会议行动项及完成状态；周期内无会议返回空串（块整体消失） */
export function buildMeetingsSection(meetings: Meeting[], period: PeriodLike): string {
  const inRange = meetings
    .filter((m) => m.date >= period.start && m.date <= period.end)
    .sort((a, b) => b.date.localeCompare(a.date))
  if (inRange.length === 0) return ''
  const lines: string[] = ['### 会议纪要']
  for (const m of inRange) {
    const total = m.action_items.length
    const done = m.action_items.filter((a) => a.done).length
    const head =
      total > 0 ? `**${md(m.date)} ${m.title}**（行动项 ${done}/${total} 已完成）` : `**${md(m.date)} ${m.title}**`
    lines.push(head)
    for (const a of m.action_items) {
      lines.push(`- ${a.text}${a.done ? '（已完成）' : '（未完成）'}`)
    }
  }
  return lines.join('\n')
}

/** {{WRITING}}：周期内总次数/总时长/总字数 + 按论文分组明细（无论文归「未关联论文」）；无记录返回空串 */
export function buildWritingSection(sessions: WritingSession[], papers: Paper[], period: PeriodLike): string {
  const list = sessionsInPeriod(sessions, period)
  if (list.length === 0) return ''
  const totals = writingPeriodStats(list)
  const lines: string[] = [
    '### 写作投入',
    `本期写作 **${totals.count} 次 · ${formatDuration(totals.durationMs)} · ${totals.words} 字**`
  ]
  const paperName = new Map(papers.map((p) => [p.id, p.title]))
  for (const g of writingByPaper(list)) {
    const name = g.paperId !== null ? (paperName.get(g.paperId) ?? '未关联论文') : '未关联论文'
    lines.push(`- ${name}：${formatDuration(g.durationMs)} / ${g.words} 字`)
  }
  return lines.join('\n')
}
