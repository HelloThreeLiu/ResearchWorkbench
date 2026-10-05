// vocab 结构判定回归测试：旧版本 vocab.json 缺 achievementTypes / logTemplates 等后加字段
// 属预期形态（用户实测 E:\工作台 旧数据触发过误报「结构不合法」），不应告警；
// 字段存在但非数组、整体非对象才判不合法。
import test from 'node:test'
import assert from 'node:assert/strict'
import { vocabShapeValid } from '../src/main/vocabShape.ts'

test('完整四字段结构合法', () => {
  assert.equal(
    vocabShapeValid({ tags: ['a'], milestoneTypes: [], achievementTypes: [], logTemplates: [] }),
    true
  )
})

test('旧版缺新字段（含空对象）不误报', () => {
  // 用户实测的旧版形态：只有 tags + milestoneTypes
  assert.equal(
    vocabShapeValid({
      tags: [],
      milestoneTypes: [{ id: 'proposal', name: '开题', builtin: true }]
    }),
    true
  )
  assert.equal(vocabShapeValid({}), true)
})

test('字段存在但非数组 → 不合法（含 null 与字符串）', () => {
  assert.equal(
    vocabShapeValid({ tags: 'a,b', milestoneTypes: [], achievementTypes: [], logTemplates: [] }),
    false
  )
  assert.equal(
    vocabShapeValid({ tags: [], milestoneTypes: null, achievementTypes: [], logTemplates: [] }),
    false
  )
})

test('整体不是对象 → 不合法（数组 / 字符串 / null）', () => {
  assert.equal(vocabShapeValid([]), false)
  assert.equal(vocabShapeValid('{"tags":[]}'), false)
  assert.equal(vocabShapeValid(null), false)
})
