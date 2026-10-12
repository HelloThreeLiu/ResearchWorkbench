// 周报新块回归（V2.6 5.6）：{{MEETINGS}}/{{WRITING}} 构建、占位符可选向后兼容、模板升级解析
// 运行：npm test（writing.ts / types.ts 均零运行时依赖或仅 import type，可被 Node 直接加载）
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMeetingsSection, buildWritingSection, fillTemplate } from '../src/renderer/src/lib/writing.ts'
import {
  DEFAULT_REPORT_TEMPLATE,
  LEGACY_DEFAULT_REPORT_TEMPLATE,
  resolveReportTemplate
} from '../src/shared/types.ts'
import type { Meeting, Paper, WritingSession } from '../src/shared/types.ts'

function meeting(partial: Partial<Meeting>): Meeting {
  return {
    id: 'm1',
    date: '2026-10-05',
    title: '与导师周会',
    attendees: '',
    project_id: null,
    content: '',
    action_items: [],
    created_at: '2026-10-05T08:00:00Z',
    updated_at: '2026-10-05T08:00:00Z',
    ...partial
  }
}

function ws(partial: Partial<WritingSession>): WritingSession {
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

const paper = (p: Partial<Paper>): Paper =>
  ({ id: 'p1', title: '论文甲', ...p }) as unknown as Paper

test('{{MEETINGS}}：周期过滤 + 日期倒序 + 行动项完成状态', () => {
  const meetings = [
    meeting({
      id: 'a',
      date: '2026-10-05',
      title: '周会A',
      action_items: [
        { text: '跑实验', done: true, task_id: null },
        { text: '读论文', done: false, task_id: null }
      ]
    }),
    meeting({ id: 'b', date: '2026-10-12', title: '周会B' }),
    meeting({ id: 'c', date: '2026-09-20', title: '周期外会议' })
  ]
  const out = buildMeetingsSection(meetings, { start: '2026-10-01', end: '2026-10-15' })
  assert.equal(out.split('\n')[0], '### 会议纪要')
  // 日期倒序：周会B 在前
  assert.ok(out.indexOf('周会B') < out.indexOf('周会A'))
  assert.ok(out.includes('**10月5日 周会A**（行动项 1/2 已完成）'))
  assert.ok(out.includes('- 跑实验（已完成）'))
  assert.ok(out.includes('- 读论文（未完成）'))
  assert.ok(!out.includes('周期外会议'))
})

test('{{MEETINGS}}：周期内无会议返回空串（块整体消失）', () => {
  assert.equal(buildMeetingsSection([meeting({ date: '2026-09-01' })], { start: '2026-10-01', end: '2026-10-15' }), '')
  assert.equal(buildMeetingsSection([], { start: '2026-10-01', end: '2026-10-15' }), '')
})

test('{{WRITING}}：总数行 + 按论文分组明细（无论文归「未关联论文」）', () => {
  const sessions = [
    ws({ id: 'a', started_at: '2026-10-05T08:00:00Z', ended_at: '2026-10-05T09:00:00Z', paper_id: 'p1', words: 800 }),
    ws({ id: 'b', started_at: '2026-10-06T08:00:00Z', ended_at: '2026-10-06T10:00:00Z', paper_id: 'p1', words: 400 }),
    ws({ id: 'c', started_at: '2026-10-07T08:00:00Z', ended_at: '2026-10-07T08:30:00Z', paper_id: null })
  ]
  const out = buildWritingSection(sessions, [paper({})], { start: '2026-10-01', end: '2026-10-15' })
  assert.equal(out.split('\n')[0], '### 写作投入')
  assert.ok(out.includes('本期写作 **3 次 · 3 小时 30 分 · 1200 字**'))
  assert.ok(out.includes('- 论文甲：3 小时 / 1200 字'))
  assert.ok(out.includes('- 未关联论文：30 分 / 0 字'))
})

test('{{WRITING}}：周期内无记录返回空串', () => {
  assert.equal(
    buildWritingSection([ws({ started_at: '2026-09-01T08:00:00Z' })], [], { start: '2026-10-01', end: '2026-10-15' }),
    ''
  )
})

test('新默认模板含 {{MEETINGS}}/{{WRITING}} 且位于本期工作内（决策 D21）', () => {
  assert.ok(DEFAULT_REPORT_TEMPLATE.includes('{{MEETINGS}}'))
  assert.ok(DEFAULT_REPORT_TEMPLATE.includes('{{WRITING}}'))
  const out = fillTemplate(DEFAULT_REPORT_TEMPLATE, {
    TITLE: '周报',
    PERIOD: '2026-10-05 ~ 2026-10-11',
    WORK: '工作内容',
    PLAN: '计划',
    THOUGHTS: '',
    MEETINGS: '### 会议纪要',
    WRITING: '### 写作投入'
  })
  assert.ok(!out.includes('{{'))
  // 新块位于 WORK 之后、「二、下期计划」之前
  assert.ok(out.indexOf('### 会议纪要') > out.indexOf('工作内容'))
  assert.ok(out.indexOf('### 写作投入') < out.indexOf('## 二、下期计划'))
})

test('旧自定义模板不含新占位符：渲染与升级前完全一致（向后兼容）', () => {
  const oldCustom = '# {{TITLE}}\n\n{{WORK}}\n\n{{PLAN}}'
  const out = fillTemplate(oldCustom, {
    TITLE: '周报',
    WORK: 'W',
    PLAN: 'P',
    MEETINGS: '不应出现的会议块',
    WRITING: '不应出现的写作块'
  })
  assert.equal(out, '# 周报\n\nW\n\nP')
})

test('resolveReportTemplate：旧默认换新默认，自定义与新默认原样保留', () => {
  assert.notEqual(DEFAULT_REPORT_TEMPLATE, LEGACY_DEFAULT_REPORT_TEMPLATE)
  assert.equal(resolveReportTemplate(LEGACY_DEFAULT_REPORT_TEMPLATE), DEFAULT_REPORT_TEMPLATE)
  const custom = '# 我的模板 {{WORK}}'
  assert.equal(resolveReportTemplate(custom), custom)
  assert.equal(resolveReportTemplate(DEFAULT_REPORT_TEMPLATE), DEFAULT_REPORT_TEMPLATE)
})
