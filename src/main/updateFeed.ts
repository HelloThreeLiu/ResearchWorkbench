// 更新源定义与镜像直链构造（纯函数，不依赖 electron，供 updater.ts 与单元测试共用）
// 镜像仓库：cnb.cool 上的产物镜像，发布时由 CI 同步（scripts/sync-cnb-release.mjs）
export const GITHUB_OWNER = 'HelloThreeLiu'
export const GITHUB_REPO = 'ResearchWorkbench'
export const RELEASES_PAGE = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
export const CNB_REPO_PATH = 'HelloThreeLiu/researchworkbench-release'

// generic feed 固定地址：releases/latest/download 免先知 tag（依赖发布时 make_latest 标记，
// 镜像缺失/未标记时 404 → updater 降级回 GitHub 源）；latest.yml 内 files[].url 由 CI 重写为绝对地址，
// 故 feed 地址与安装包地址可不同源（electron-updater 按 new URL(绝对, base) 语义解析，已按 6.8.9 源码验证）
export const CNB_FEED_URL = `https://cnb.cool/${CNB_REPO_PATH}/-/releases/latest/download/latest.yml`

// 安装包产物名规则来自 electron-builder.yml 的 artifactName（ASCII 固定模式，仅 x64）
const ARTIFACT_TEMPLATE = (version: string): string => `Gezhi-Workbench-${version}-x64.exe`

/**
 * 构造 CNB 镜像安装包直链（更新弹窗「国内高速下载」入口）。
 * 版本号来自 latest.yml（网络输入）：先做严格 semver 形态校验再拼 URL，防路径注入；不合法返回 null。
 */
export function buildMirrorDownloadUrl(version: string): string | null {
  if (!/^\d+\.\d+\.\d+$/.test(version)) return null
  return `https://cnb.cool/${CNB_REPO_PATH}/-/releases/download/v${version}/${ARTIFACT_TEMPLATE(version)}`
}
