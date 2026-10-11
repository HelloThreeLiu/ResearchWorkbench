// 写作度量纯函数回归（V2.6 5.5）：时长派生 / 格式化 / 残留判定与补记默认值 / 周月聚合 / 按论文分组
// 运行：npm test（writing.ts 仅 import type，Node 类型剥离后零运行时依赖，可直接引入）
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FORGET_GUARD_MS,
  ensureAfterStart,
  formatDuration,
  formatTimerDisplay,
  isResidualSession,
  localDateOf,
  overForgetGuard,
  residualDefaultEnd,
  sessionDurationMs,
  sessionsInPeriod,
  writingByPaper,
  writingPeriodStats
} from '../src/renderer/src/lib/writing.ts'
import type { WritingSession } from '../src/shared/types.ts'

/** 组装完整 WritingSession（只关心被测字段，其余给合法缺省） */
function session(partial: Partial<WritingSession>): WritingSession {
  return {
    id: 's1',
    started_at: '2026-10-05T08:00:00.000Z',
    ended_at: '2026-10-05T09:00:00.000Z',
    project_id: null,
    paper_id: null,
    section: '',
    words: null,
    note: '',
    created_at: '2026-10-05T08:00:00.000Z',
    updated_at: '2026-10-05T09:00:00.000Z',
    ...partial
  }
}

test('sessionDurationMs：起止差值与边界（非法/倒挂按 0）', () => {
  assert.equal(sessionDurationMs('2026-10-05T08:00:00Z', '2026-10-05T09:30:00Z'), 90 * 60 * 1000)
  assert.equal(sessionDurationMs('bad', '2026-10-05T09:30:00Z'), 0)
  assert.equal(sessionDurationMs('2026-10-05T09:00:00Z', '2026-10-05T08:00:00Z'), 0)
})

test('formatDuration：秒 / 分 / 小时三档文案', () => {
  assert.equal(formatDuration(0), '0 秒')
  assert.equal(formatDuration(59_000), '59 秒')
  assert.equal(formatDuration(60_000), '1 分')
  assert.equal(formatDuration(3_600_000), '1 小时')
  assert.equal(formatDuration(3_600_000 + 25 * 60_000), '1 小时 25 分')
})

test('formatTimerDisplay：mm:ss，满 1 小时转 h:mm:ss', () => {
  assert.equal(formatTimerDisplay(0), '00:00')
  assert.equal(formatTimerDisplay(65_000), '01:05')
  assert.equal(formatTimerDisplay(3_723_000), '1:02:03')
})

test('残留判定与补记默认结束时间（开始 +4h，PRD 5.5.3）', () => {
  assert.equal(isResidualSession({ ended_at: null }), true)
  assert.equal(isResidualSession({ ended_at: '2026-10-05T09:00:00Z' }), false)
  assert.equal(residualDefaultEnd('2026-10-05T08:00:00Z'), '2026-10-05T12:00:00.000Z')
})

test('>4h 忘记停止防护（PRD 5.5.4）：恰好 4h 不提醒，超过即提醒', () => {
  assert.equal(overForgetGuard(FORGET_GUARD_MS), false)
  assert.equal(overForgetGuard(FORGET_GUARD_MS + 1), true)
})

test('结束默认值兜底：至少开始+1 秒（秒级输入框可保存），正常值原样保留', () => {
  const start = '2026-10-11T15:57:05.000Z'
  // 同一秒内结束：抬到 +1s，截断到秒后起止仍可分辨
  const sameSec = '2026-10-11T15:57:05.800Z'
  assert.equal(ensureAfterStart(sameSec, start), '2026-10-11T15:57:06.000Z')
  const later = '2026-10-11T16:30:00.000Z'
  assert.equal(ensureAfterStart(later, start), later)
})

test('localDateOf：ISO → 本地日期（直接 slice 取的是 UTC 日期，本地 0-8 点的记录会落错天）', () => {
  // 本地正午/零点后 30 秒在任何时区都不会跨天，用例时区无关
  for (const d of ['2026-01-01', '2026-07-15', '2026-12-31']) {
    assert.equal(localDateOf(new Date(`${d}T12:00:00`).toISOString()), d)
    assert.equal(localDateOf(new Date(`${d}T00:00:30`).toISOString()), d)
  }
})

test('sessionsInPeriod：按开始时间的本地日期过滤，两端含界', () => {
  // 用本地正午构造时间戳（任何时区下正午不跨天），保证用例时区无关
  const at = (date: string): string => new Date(`${date}T12:00:00`).toISOString()
  const list = [
    session({ id: 'a', started_at: at('2026-10-04') }),
    session({ id: 'b', started_at: at('2026-10-05') }),
    session({ id: 'c', started_at: at('2026-10-11') }),
    session({ id: 'd', started_at: at('2026-10-12') })
  ]
  const picked = sessionsInPeriod(list, { start: '2026-10-05', end: '2026-10-11' })
  assert.deepEqual(picked.map((s) => s.id), ['b', 'c'])
})

test('周/月聚合：时长与字数逐条求和，字数空缺不计入', () => {
  const list = [
    session({ id: 'a', started_at: '2026-10-05T08:00:00Z', ended_at: '2026-10-05T09:00:00Z', words: 800 }),
    session({ id: 'b', started_at: '2026-10-06T08:00:00Z', ended_at: '2026-10-06T09:30:00Z', words: null }),
    session({ id: 'c', started_at: '2026-10-06T10:00:00Z', ended_at: '2026-10-06T10:20:00Z', words: 400 })
  ]
  const stats = writingPeriodStats(list)
  assert.equal(stats.count, 3)
  assert.equal(stats.durationMs, (60 + 90 + 20) * 60_000)
  assert.equal(stats.words, 1200)
})

test('按论文分组明细：无论文归 null 组（PRD 5.6 {{WRITING}}）', () => {
  const list = [
    session({ id: 'a', paper_id: 'p1', started_at: '2026-10-05T08:00:00Z', ended_at: '2026-10-05T09:00:00Z', words: 500 }),
    session({ id: 'b', paper_id: 'p1', started_at: '2026-10-05T10:00:00Z', ended_at: '2026-10-05T11:00:00Z', words: 300 }),
    session({ id: 'c', paper_id: null, started_at: '2026-10-05T12:00:00Z', ended_at: '2026-10-05T12:30:00Z', words: 100 })
  ]
  const grouped = writingByPaper(list)
  assert.equal(grouped.length, 2)
  const p1 = grouped.find((g) => g.paperId === 'p1')
  assert.ok(p1)
  assert.equal(p1.count, 2)
  assert.equal(p1.words, 800)
  assert.equal(p1.durationMs, 2 * 3_600_000)
  const misc = grouped.find((g) => g.paperId === null)
  assert.ok(misc)
  assert.equal(misc.words, 100)
})
