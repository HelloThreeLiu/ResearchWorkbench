// 回顾页聚合引擎回归（V2.4 5.1 + 审计 T-3 口径）：
// 归档项目任务不参与任务级统计（已完成项目保留）、热力图档位、投稿周期（完成/在投/venue 均值/排除）
// 运行：npm test（insights.ts → ./report → ../../../shared/types 相对导入，node:test 可直接加载）
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  activityByDay,
  heatLevel,
  overviewStats,
  projectInvestment,
  submissionStats,
  yearlyStats,
  type InsightsSource
} from '../src/renderer/src/lib/insights.ts'
import { dayjs } from '../src/renderer/src/lib/date.ts'
import type {
  Achievement,
  Idea,
  Milestone,
  Paper,
  ProgressLog,
  Project,
  Task,
  WritingSession
} from '../src/shared/types.ts'

const NOW = '2026-10-13T08:00:00.000Z'

function project(id: string, status: Project['status']): Project {
  return { id, name: `项目${id}`, description: '', color: '#5e6ad2', status, start_date: null, end_date: null, created_at: NOW, updated_at: NOW }
}

function task(id: string, projectId: string | null, completedAt: string | null): Task {
  return { id, title: `任务${id}`, project_id: projectId, status: completedAt ? 'done' : 'todo', priority: 'medium', due_date: null, tags: [], note: '', completed_at: completedAt, created_at: NOW, updated_at: NOW }
}

/** p1 进行中 / p2 已归档 / p3 已完成；任务 t2（归档项目）应被任务级统计排除，t3/t4 保留 */
function baseSource(): InsightsSource {
  return {
    projects: [project('p1', 'active'), project('p2', 'archived'), project('p3', 'completed')],
    tasks: [
      task('t1', 'p1', '2026-05-01T10:00:00.000Z'),
      task('t2', 'p2', '2026-05-02T10:00:00.000Z'), // 归档项目 → 不计入
      task('t3', null, '2026-05-03T10:00:00.000Z'), // 杂项 → 计入
      task('t4', 'p3', '2026-05-04T10:00:00.000Z') // 已完成项目 → 计入
    ],
    milestones: [],
    ideas: [],
    logs: [],
    papers: [],
    achievements: [],
    sessions: []
  }
}

test('任务级统计排除已归档项目任务（已完成项目与杂项保留，审计 T-3）', () => {
  const source = baseSource()
  assert.equal(overviewStats(source, 2026).tasksDoneThisYear, 3)
  assert.equal(yearlyStats(source, 2026).doneTasks, 3)
  // 热力图口径同步排除
  const map = activityByDay(source)
  assert.equal(map.get('2026-05-01')?.tasks, 1)
  assert.equal(map.get('2026-05-02')?.tasks, undefined)
  assert.equal(map.get('2026-05-03')?.tasks, 1)
  assert.equal(map.get('2026-05-04')?.tasks, 1)
})

test('项目投入分布：归档项目不出现分段，任务数不入当月总量', () => {
  const source = baseSource()
  // 把 t1/t4 的完成时间挪到当前月，保证落入近 6 个月窗口
  const month = dayjs().format('YYYY-MM')
  source.tasks = [
    task('t1', 'p1', `${month}-01T10:00:00.000Z`),
    task('t2', 'p2', `${month}-02T10:00:00.000Z`),
    task('t3', null, `${month}-03T10:00:00.000Z`),
    task('t4', 'p3', `${month}-04T10:00:00.000Z`)
  ]
  const invest = projectInvestment(source, 1)
  assert.equal(invest.length, 1)
  const seg = invest[0]!.segments
  assert.equal(invest[0]!.total, 3) // t1 + t3 + t4
  assert.ok(seg.some((s) => s.name === '项目p1'))
  assert.ok(!seg.some((s) => s.name === '项目p2'))
  assert.ok(seg.some((s) => s.name === '项目p3'))
  assert.ok(seg.some((s) => s.projectId === null && s.name === '杂项任务'))
})

test('活动热力图：写作 session 按 started_at 本地日期计数', () => {
  const source = baseSource()
  const session: WritingSession = {
    id: 's1',
    started_at: '2026-05-01T12:00:00.000Z', // 任意时区本地日期均为 2026-05-01
    ended_at: '2026-05-01T13:00:00.000Z',
    project_id: null,
    paper_id: null,
    section: '',
    words: 500,
    note: '',
    created_at: NOW,
    updated_at: NOW
  }
  const map = activityByDay({ ...source, sessions: [session] })
  const day = map.get('2026-05-01')!
  assert.equal(day.tasks, 1)
  assert.equal(day.sessions, 1)
})

test('热力图色阶档位边界：0/1→1，2→1，3-5→2，6+→3', () => {
  assert.equal(heatLevel(0), 0)
  assert.equal(heatLevel(1), 1)
  assert.equal(heatLevel(2), 1)
  assert.equal(heatLevel(3), 2)
  assert.equal(heatLevel(5), 2)
  assert.equal(heatLevel(6), 3)
})

function paper(id: string, patch: Partial<Paper>): Paper {
  return {
    id,
    title: `论文${id}`,
    venue: 'CVPR',
    type: 'conference',
    status: 'accepted',
    year: 2026,
    round: 1,
    dates: { draft: null, submission: null, result: null, camera_ready: null },
    repo_url: '',
    project_id: null,
    collaborators: '',
    note: '',
    cited_reference_ids: [],
    sections: [],
    created_at: NOW,
    updated_at: NOW,
    ...patch,
    dates: { draft: null, submission: null, result: null, camera_ready: null, ...(patch.dates ?? {}) }
  }
}

test('投稿周期：完成周期天数、venue 均值（≥2 篇）、在投等待与标黄、排除计数', () => {
  const source = baseSource()
  source.papers = [
    // 两条完整周期 → CVPR 均值 23
    paper('a', { dates: { submission: '2026-01-01', result: '2026-02-01' } }), // 31 天
    paper('b', { dates: { submission: '2026-03-01', result: '2026-03-15' } }), // 14 天
    // 在投：等待 12 天 < 均值 → 不标黄
    paper('c', { status: 'reviewing', dates: { submission: '2026-10-01' } }),
    // 在投：等待 407 天 > 均值 → 标黄
    paper('d', { status: 'submitted', dates: { submission: '2025-09-01' } }),
    // 无任何日期 → 排除
    paper('e', {}),
    // 结果早于投稿（录错）→ 排除
    paper('f', { dates: { submission: '2026-05-01', result: '2026-04-01' } })
  ]
  const stats = submissionStats(source, '2026-10-13')
  assert.equal(stats.completed.length, 2)
  assert.equal(stats.completed.find((c) => c.paper.id === 'a')!.days, 31)
  assert.equal(stats.completed.find((c) => c.paper.id === 'b')!.days, 14)
  assert.equal(stats.venueAverages.length, 1)
  assert.equal(stats.venueAverages[0]!.venue, 'CVPR')
  assert.equal(stats.venueAverages[0]!.avgDays, 23)
  assert.equal(stats.overallAvgDays, 23)
  const cPending = stats.pending.find((p) => p.paper.id === 'c')!
  assert.equal(cPending.waitedDays, 12)
  assert.equal(cPending.slowerThanVenueAvg, false)
  const dPending = stats.pending.find((p) => p.paper.id === 'd')!
  assert.equal(dPending.waitedDays, 407)
  assert.equal(dPending.slowerThanVenueAvg, true)
  assert.equal(stats.excluded, 2)
})

test('年度回顾：节点/灵感/成果与灵感转化口径', () => {
  const source = baseSource()
  const milestone: Milestone = {
    id: 'm1', title: '开题', date: '2026-03-01', type: 'proposal', project_id: null,
    remind_days: [7, 3, 1], note: '', status: 'done', source_paper_id: null, source_kind: null,
    created_at: NOW, updated_at: NOW
  }
  const ideas: Idea[] = [
    { id: 'i1', content: 'a', tags: [], project_id: null, status: 'new', converted_task_id: null, created_at: '2026-02-01T00:00:00.000Z', updated_at: NOW },
    { id: 'i2', content: 'b', tags: [], project_id: null, status: 'converted', converted_task_id: 't1', created_at: '2026-02-02T00:00:00.000Z', updated_at: NOW },
    { id: 'i3', content: 'c', tags: [], project_id: null, status: 'converted', converted_task_id: 't2', created_at: '2025-12-31T00:00:00.000Z', updated_at: NOW } // 往年新建：不计入本年新增
  ]
  const achievements: Achievement[] = [
    { id: 'ach1', type: 'paper', title: '论文A', date: '2026-06-01', level: 'CCF-A', project_id: null, detail: '', evidence_path: '', is_draft: false, created_at: NOW, updated_at: NOW }
  ]
  const logs: ProgressLog[] = [
    { id: 'l1', project_id: 'p1', date: '2026-04-01', content: 'x', created_at: NOW, updated_at: NOW }
  ]
  const yd = yearlyStats({ ...source, milestones: [milestone], ideas, achievements, logs }, 2026)
  assert.equal(yd.doneMilestones, 1)
  assert.equal(yd.newIdeas, 2) // i1 i2 为本年新建；i3 往年
  assert.equal(yd.convertedIdeas, 1) // 口径：本年新建且已转换（i3 跨年转换不计）
  assert.equal(yd.logs, 1)
  assert.equal(yd.achievements.length, 1)
})
