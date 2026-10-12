// CNB 同步脚本纯函数回归：latest.yml 绝对地址重写（仅动 url/path 值、幂等、CRLF 兼容）
import test from 'node:test'
import assert from 'node:assert/strict'
import { rewriteLatestYml } from '../scripts/sync-cnb-release.mjs'

const REPO = 'HelloThreeLiu/researchworkbench-release'

// electron-builder 生成的 latest.yml 真实形态（v2.7.0 样本）
const SAMPLE = `version: 2.7.0
files:
  - url: Gezhi-Workbench-2.7.0-x64.exe
    sha512: YbSZzATLjl0MI/Sfal4HpUjwCjlvM0b2I8pGM46WIobpFgPMV2nnLqCDEF4yjb0dqjVoHDusORJvEibo7FNTmQ==
    size: 108689659
path: Gezhi-Workbench-2.7.0-x64.exe
sha512: YbSZzATLjl0MI/Sfal4HpUjwCjlvM0b2I8pGM46WIobpFgPMV2nnLqCDEF4yjb0dqjVoHDusORJvEibo7FNTmQ==
releaseDate: '2026-10-12T01:46:33.480Z'
`

test('files[].url 与顶层 path 重写为镜像绝对地址，其余字段原样保留', () => {
  const out = rewriteLatestYml(SAMPLE, 'v2.7.0', REPO)
  const expected = `version: 2.7.0
files:
  - url: https://cnb.cool/${REPO}/-/releases/download/v2.7.0/Gezhi-Workbench-2.7.0-x64.exe
    sha512: YbSZzATLjl0MI/Sfal4HpUjwCjlvM0b2I8pGM46WIobpFgPMV2nnLqCDEF4yjb0dqjVoHDusORJvEibo7FNTmQ==
    size: 108689659
path: https://cnb.cool/${REPO}/-/releases/download/v2.7.0/Gezhi-Workbench-2.7.0-x64.exe
sha512: YbSZzATLjl0MI/Sfal4HpUjwCjlvM0b2I8pGM46WIobpFgPMV2nnLqCDEF4yjb0dqjVoHDusORJvEibo7FNTmQ==
releaseDate: '2026-10-12T01:46:33.480Z'
`
  assert.equal(out, expected)
})

test('重复执行幂等（已是绝对地址不再改写）', () => {
  const once = rewriteLatestYml(SAMPLE, 'v2.7.0', REPO)
  const twice = rewriteLatestYml(once, 'v2.7.0', REPO)
  assert.equal(twice, once)
})

test('CRLF 行尾同样处理', () => {
  const crlf = SAMPLE.replace(/\n/g, '\r\n')
  const out = rewriteLatestYml(crlf, 'v2.7.0', REPO)
  assert.ok(out.includes(`url: https://cnb.cool/${REPO}/-/releases/download/v2.7.0/`))
  assert.ok(out.includes(`path: https://cnb.cool/${REPO}/-/releases/download/v2.7.0/`))
})

test('值为空或异常行不误伤', () => {
  const weird = `version: 1.0.0
files:
  - url:
notes: 一句话说明 path: 不是字段
`
  const out = rewriteLatestYml(weird, 'v1.0.0', REPO)
  // url: 值为空（无 \S+ 捕获）不匹配；正文里的 "path:" 前有文字不属于行首，均保持原样
  assert.equal(out, weird)
})
