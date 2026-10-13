// 新手引导回归：tourVersion 加载期迁移（新装/老用户升级/半途退出）
// 运行：npm test（shared/tour.ts 零运行时依赖，可被 Node 直接加载）
import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveInitialTourVersion, TOUR_VERSION } from '../src/shared/tour.ts'

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
