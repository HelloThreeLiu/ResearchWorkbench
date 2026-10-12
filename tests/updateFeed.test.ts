// CNB 镜像直链构造回归测试：版本号严格校验（latest.yml 属网络输入，防路径注入）与 URL 模板
import test from 'node:test'
import assert from 'node:assert/strict'
import { CNB_FEED_URL, CNB_REPO_PATH, buildMirrorDownloadUrl } from '../src/main/updateFeed.ts'

test('合法 semver 版本号拼出镜像直链', () => {
  assert.equal(
    buildMirrorDownloadUrl('2.7.0'),
    `https://cnb.cool/${CNB_REPO_PATH}/-/releases/download/v2.7.0/Gezhi-Workbench-2.7.0-x64.exe`
  )
  assert.equal(
    buildMirrorDownloadUrl('10.20.30'),
    `https://cnb.cool/${CNB_REPO_PATH}/-/releases/download/v10.20.30/Gezhi-Workbench-10.20.30-x64.exe`
  )
})

test('非严格 semver 一律拒绝（防网络输入注入 URL 路径）', () => {
  const INVALID = [
    '', // 空串
    'v2.7.0', // 带前缀
    '2.7', // 两段
    '2.7.0.1', // 四段
    '2.7.0-beta.1', // 预发布后缀
    '2.7.0 x64', // 空格
    '../../etc/passwd', // 路径穿越
    '2.7.0/../../x', // 版本号后拼接路径
    '2.7.0?x=1', // 查询串
    '2.7.0#frag', // 片段
    '２.７.０' // 全角数字
  ]
  for (const v of INVALID) {
    assert.equal(buildMirrorDownloadUrl(v), null, `应拒绝: ${JSON.stringify(v)}`)
  }
})

test('feed 固定地址形态防误改（latest 跳转依赖 make_latest 标记）', () => {
  assert.ok(CNB_FEED_URL.startsWith('https://cnb.cool/'))
  assert.ok(CNB_FEED_URL.endsWith('/-/releases/latest/download/latest.yml'))
})
