// M-3 回归测试：docx 导出的行内 **加粗** 解析（不引入测试框架，直接用 Node 内置 test runner）
// 运行：npm test
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseInlineBold } from '../src/main/exporter.ts'

test('以加粗开头的行：加粗段与随后的正文各自正确', () => {
  assert.deepEqual(parseInlineBold('**重点**普通文字'), [
    { text: '重点', bold: true },
    { text: '普通文字', bold: false }
  ])
})

test('连续两个加粗段', () => {
  assert.deepEqual(parseInlineBold('**A****B**'), [
    { text: 'A', bold: true },
    { text: 'B', bold: true }
  ])
})

test('普通文字夹加粗段', () => {
  assert.deepEqual(parseInlineBold('普通 **重点** 文字'), [
    { text: '普通 ', bold: false },
    { text: '重点', bold: true },
    { text: ' 文字', bold: false }
  ])
})

test('整行加粗（report.ts 生成的 **项目名** 标题）', () => {
  assert.deepEqual(parseInlineBold('**项目名**'), [{ text: '项目名', bold: true }])
})
