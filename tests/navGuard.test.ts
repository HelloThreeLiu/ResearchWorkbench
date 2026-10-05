// 导航白名单回归测试：迁移自四轮复审的探针用例（穿越/编码变体/UNC/兄弟目录/特殊路径形态/dev 端口前缀欺骗）
// 平台无关：目录无需真实存在（纯字符串与 URL 语义判定）；UNC 用例在 POSIX 上由
// fileURLToPath 抛错、在 Windows 上得到绝对 UNC 路径，两条路径都收敛为「拒绝」。
import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createIsAllowedUrl } from '../src/main/navGuard.ts'

const rendererDir = path.join(process.cwd(), 'out', 'renderer') + path.sep
const isAllowedUrl = createIsAllowedUrl(rendererDir)
const isAllowedUrlDev = createIsAllowedUrl(rendererDir, 'http://localhost:5173')

const R = pathToFileURL(rendererDir).href

test('应用自身页面与资源放行', () => {
  assert.equal(isAllowedUrl(`${R}index.html`), true)
  assert.equal(isAllowedUrl(`${R}assets/index-abc.js`), true)
  assert.equal(isAllowedUrl(`${R}sub/deep/x.css`), true)
  // 带查询串/片段的自身页面不误伤
  assert.equal(isAllowedUrl(`${R}index.html?v=1`), true)
  assert.equal(isAllowedUrl(`${R}index.html#a`), true)
})

test('目录穿越与编码变体拒绝', () => {
  assert.equal(isAllowedUrl(`${R}..`), false)
  assert.equal(isAllowedUrl(`${R}`), false) // 目录本身不是页面
  assert.equal(isAllowedUrl(`${R}../preload/index.js`), false)
  assert.equal(isAllowedUrl(`${R}../../evil.html`), false)
  assert.equal(isAllowedUrl(`${R}..%2fevil.html`), false)
  assert.equal(isAllowedUrl(`${R}%2e%2e%2fevil.html`), false)
  assert.equal(isAllowedUrl(`${R}%2fetc%2fpasswd`), false)
  assert.equal(isAllowedUrl(`${R}%zz.html`), false) // 非法百分号编码
})

test('file: 协议内的越界目标拒绝', () => {
  assert.equal(isAllowedUrl('file:///C:/evil.html'), false)
  assert.equal(isAllowedUrl('file://evil.com/share/x.html'), false) // UNC → SMB 外联面
  assert.equal(isAllowedUrl('file://evil.com/C$/x.html'), false)
  assert.equal(isAllowedUrl('file:index.html'), false) // 相对 file URL
})

test('兄弟目录与前缀欺骗拒绝（尾分隔符 + 路径语义）', () => {
  // rendererDir 带尾分隔符，先剥掉再拼才是兄弟目录
  assert.equal(isAllowedUrl(pathToFileURL(rendererDir.slice(0, -1) + '-evil/index.html').href), false)
  assert.equal(
    isAllowedUrl(pathToFileURL(path.join(path.dirname(rendererDir), 'rendererX', 'index.html')).href),
    false
  )
})

test('非 file: 协议与畸形输入拒绝（fail-closed）', () => {
  assert.equal(isAllowedUrl('https://evil.com/x'), false)
  assert.equal(isAllowedUrl('http://evil.com'), false)
  assert.equal(isAllowedUrl('about:blank'), false)
  assert.equal(isAllowedUrl('data:text/html,x'), false)
  assert.equal(isAllowedUrl(''), false)
  assert.equal(isAllowedUrl('//evil.com/payload.html'), false) // 协议相对形式（new URL 无基址即抛错）
})

test('含空格与非 ASCII 的安装路径不误伤自身页面', () => {
  const oddDir = path.join(process.cwd(), '空间 目录', 'out', 'renderer') + path.sep
  const odd = createIsAllowedUrl(oddDir)
  const base = pathToFileURL(oddDir).href
  assert.equal(odd(`${base}index.html`), true) // %20/%E4… 编码后与 fileURLToPath 正确互逆
  assert.equal(odd(`${base}../../evil.html`), false)
})

test('dev 模式：vite 服务放行，端口前缀欺骗拒绝', () => {
  assert.equal(isAllowedUrlDev('http://localhost:5173'), true)
  assert.equal(isAllowedUrlDev('http://localhost:5173/assets/x.js'), true)
  assert.equal(isAllowedUrlDev('http://localhost:51730/x'), false) // 端口前缀
  assert.equal(isAllowedUrlDev('http://localhost:5173.evil.com/'), false)
  assert.equal(isAllowedUrlDev('http://localhost:5174/'), false)
  // dev 模式下 renderer 目录的 file: 页面仍属应用自身产物，保持放行；越界 file: 依旧拒绝
  assert.equal(isAllowedUrlDev(`${R}index.html`), true)
  assert.equal(isAllowedUrlDev('file:///C:/evil.html'), false)
})
