// 新手引导回归：tourVersion 加载期迁移（新装/老用户升级/半途退出）、触发判定、步骤定义完整性
// 运行：npm test（shared/tour.ts 与 lib/tour.ts 均零运行时依赖，可被 Node 直接加载）
import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveInitialTourVersion, shouldShowTour, TOUR_VERSION } from '../src/shared/tour.ts'
import { TOUR_STEPS } from '../src/renderer/src/lib/tour.ts'

test('新装（settings.json 不存在）：tourVersion=0，进主界面会弹引导', () => {
  assert.equal(resolveInitialTourVersion(false, {}), 0)
})

test('老用户升级（文件存在但缺字段）：视为已读，不弹', () => {
  assert.equal(resolveInitialTourVersion(true, {}), TOUR_VERSION)
})

test('引导半途退出的新用户（已落盘 0）：保留 0，下次启动仍弹', () => {
  assert.equal(resolveInitialTourVersion(true, { tourVersion: 0 }), 0)
})

test('已完成引导（已落盘 TOUR_VERSION）：原样保留', () => {
  assert.equal(resolveInitialTourVersion(true, { tourVersion: TOUR_VERSION }), TOUR_VERSION)
})

test('手改坏的非法值（字符串/负数/NaN）：按老用户已读处理，不弹也不崩', () => {
  assert.equal(resolveInitialTourVersion(true, { tourVersion: '1' }), TOUR_VERSION)
  assert.equal(resolveInitialTourVersion(true, { tourVersion: -1 }), TOUR_VERSION)
  assert.equal(resolveInitialTourVersion(true, { tourVersion: Number.NaN }), TOUR_VERSION)
})

test('shouldShowTour：未读（0 或缺省）弹，已读不弹', () => {
  assert.equal(shouldShowTour({ tourVersion: 0 }), true)
  assert.equal(shouldShowTour({}), true)
  assert.equal(shouldShowTour({ tourVersion: TOUR_VERSION }), false)
  assert.equal(shouldShowTour({ tourVersion: TOUR_VERSION + 1 }), false)
})

test('TOUR_STEPS：id 唯一、selector 非空且唯一、首尾为居中步骤、标题正文非空', () => {
  const ids = TOUR_STEPS.map((s) => s.id)
  assert.equal(new Set(ids).size, ids.length, '步骤 id 不得重复')
  const selectors = TOUR_STEPS.map((s) => s.selector).filter((v): v is string => v !== undefined)
  assert.equal(new Set(selectors).size, selectors.length, 'selector 不得重复')
  for (const step of TOUR_STEPS) {
    assert.ok(step.id.trim() !== '', 'id 不得为空')
    assert.ok(step.title.trim() !== '', '标题不得为空')
    assert.ok(step.body.trim() !== '', '正文不得为空')
    assert.ok(!/\s/.test(step.selector ?? ''), 'selector 不得含空白（querySelector 拼接安全）')
  }
  assert.equal(TOUR_STEPS[0].selector, undefined, '首步为居中欢迎卡片')
  assert.equal(TOUR_STEPS[TOUR_STEPS.length - 1].selector, undefined, '末步为居中收尾卡片')
})
