// 应用更新：GitHub Releases + electron-updater
// 流程：启动后静默检查 → 推送渲染层（红点+提示卡）→ 弹窗确认 → 下载（进度推送）→ 重启静默安装
// （NSIS 静默安装沿用注册表中记录的原安装目录覆盖，用户数据在 userData 不受影响）
import { app, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateCheckResult, UpdateEvent } from '@shared/types'

const GITHUB_OWNER = 'HelloThreeLiu'
const GITHUB_REPO = 'ResearchWorkbench'
const RELEASES_PAGE = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
const STARTUP_CHECK_DELAY_MS = 5000
const GITHUB_API_TIMEOUT_MS = 8000

let getMainWindow: () => BrowserWindow | null = () => null
/** 下载是否进行中：仅此阶段向渲染层推送 error 事件（检查失败走 IPC 返回值/静默） */
let downloading = false

function sendEvent(event: UpdateEvent): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) win.webContents.send('update:event', event)
}

export function initUpdater(windowGetter: () => BrowserWindow | null): void {
  getMainWindow = windowGetter
  // 不自动下载：由用户在更新弹窗中确认后显式触发；已下载完成的更新在应用退出时自动安装（“稍后”路径）
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null

  autoUpdater.on('download-progress', (progress) => {
    sendEvent({
      kind: 'progress',
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    downloading = false
    sendEvent({ kind: 'downloaded', version: info.version })
  })

  autoUpdater.on('error', (err) => {
    // 检查阶段失败走 IPC 返回值（启动静默检查失败不打扰），仅下载阶段失败推送渲染层提示重试
    if (!downloading) return
    downloading = false
    sendEvent({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
  })
}

/** 拉取 GitHub Release 说明（Markdown 正文 + 页面链接）；失败返回 null（UI 降级为通用文案） */
async function fetchReleaseNotes(): Promise<{ notes: string; url: string } | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GITHUB_API_TIMEOUT_MS)
  try {
    const resp = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'GezhiWorkbench-Updater'
      }
    })
    if (!resp.ok) return null
    const data = (await resp.json()) as { body?: string; html_url?: string }
    return { notes: (data.body ?? '').trim(), url: data.html_url ?? RELEASES_PAGE }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 检查更新（仅打包环境可用；dev 模式返回 dev 状态） */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion()
  if (!app.isPackaged) {
    return { status: 'dev', currentVersion, newVersion: null, notes: '', releaseUrl: null, error: null }
  }
  try {
    const result = await autoUpdater.checkForUpdates()
    const newVersion = result?.updateInfo?.version ?? null
    if (!newVersion || newVersion === currentVersion) {
      return { status: 'unavailable', currentVersion, newVersion: null, notes: '', releaseUrl: null, error: null }
    }
    const release = await fetchReleaseNotes()
    return {
      status: 'available',
      currentVersion,
      newVersion,
      notes: release?.notes ?? '',
      releaseUrl: release?.url ?? RELEASES_PAGE,
      error: null
    }
  } catch (err) {
    return {
      status: 'error',
      currentVersion,
      newVersion: null,
      notes: '',
      releaseUrl: RELEASES_PAGE,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

/** 启动后延迟静默检查：发现新版本才推送渲染层（含更新日志），任何失败静默吞掉 */
export function scheduleStartupSilentCheck(): void {
  if (!app.isPackaged) return
  setTimeout(() => {
    checkForUpdates()
      .then((result) => {
        if (result.status === 'available' && result.newVersion) {
          sendEvent({
            kind: 'available',
            version: result.newVersion!,
            notes: result.notes,
            releaseUrl: result.releaseUrl
          })
        }
      })
      .catch(() => {
        /* 静默检查失败不打扰用户 */
      })
  }, STARTUP_CHECK_DELAY_MS)
}

/** 下载更新（进度与完成经 update:event 推送；错误经 error 事件推送后由渲染层提示重试） */
export async function startDownloadUpdate(): Promise<void> {
  if (!app.isPackaged) return
  downloading = true
  try {
    await autoUpdater.downloadUpdate()
  } catch (err) {
    // error 事件先到则已推送过（downloading 已清除）；仅 Promise 单独拒绝时在此兜底推送
    if (!downloading) return
    downloading = false
    sendEvent({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}

/** 退出并静默安装到原目录，安装完成后自动重启新版（before-quit 中的退出前备份照常执行） */
export function quitAndInstallNow(): void {
  autoUpdater.quitAndInstall(true, true)
}
