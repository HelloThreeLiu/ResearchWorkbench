// 写作度量纯函数（PRD 5.5）：时长派生、格式化、残留判定
// 零运行时依赖（类型全部 import type，由 Node 类型剥离擦除）——供 node:test 直接回归（tests/writing.test.ts）
import type { WritingSession } from '@shared/types'

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

/** 周期（YYYY-MM-DD，含两端）内的 session（按开始日期的日期部分过滤，与 report.inPeriod 同口径） */
export function sessionsInPeriod(
  sessions: WritingSession[],
  period: { start: string; end: string }
): WritingSession[] {
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
