// 导航白名单判定（主进程）：只允许应用自身 renderer 目录（打包）或 vite dev 服务（开发）
// 抽出为独立模块以便单测覆盖（全项目风险最高的判定函数之一，见 tests/navGuard.test.ts）
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 构造导航白名单判定函数。
 * @param rendererDirFs 打包产物 renderer 目录（带尾分隔符的文件系统路径）
 * @param devUrl 开发模式 vite 服务地址（打包环境传 undefined）
 */
export function createIsAllowedUrl(
  rendererDirFs: string,
  devUrl?: string
): (raw: string) => boolean {
  return (raw: string): boolean => {
    if (devUrl && (raw === devUrl || raw.startsWith(`${devUrl}/`))) return true
    // 先规范化再做路径包含判定：不依赖「调用方传入的一定是 Chromium 已规范化的 URL」这条
    // 隐含前提，`renderer/../../evil.html` 这类穿越写法在路径语义下会被拒绝；畸形 URL 一律拒绝（fail-closed）
    let u: URL
    try {
      u = new URL(raw)
    } catch {
      return false
    }
    if (u.protocol !== 'file:') return false
    let fsPath: string
    try {
      fsPath = fileURLToPath(u)
    } catch {
      return false
    }
    const rel = path.relative(rendererDirFs, fsPath)
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
  }
}
