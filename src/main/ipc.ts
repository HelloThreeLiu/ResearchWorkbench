// 主进程 IPC：数据存取、系统交互（打开网址/文件/程序）、设置、全局快捷键
import { ipcMain, shell, dialog } from 'electron'
import fs from 'node:fs'
import {
  type AllCollections,
  type AppSettings,
  type CollectionName,
  type BootstrapResult
} from '@shared/types'
import {
  backupNow,
  checkExternalChanges,
  chooseDataDir,
  getSettings,
  getLastWriteAt,
  loadAll,
  saveCollection,
  updateSettings
} from './store'
import { setQuickCaptureShortcut } from './shortcuts'

export function registerIpcHandlers(getMainWindow: () => Electron.BrowserWindow | null): void {
  ipcMain.handle('store:bootstrap', (): BootstrapResult => {
    const settings = getSettings()
    return {
      needsOnboarding: !settings.dataDir,
      dataDir: settings.dataDir,
      collections: settings.dataDir ? loadAll() : {
        projects: [], tasks: [], milestones: [], ideas: [], logs: [], tools: { groups: [], items: [] }
      },
      settings,
      meta: { lastWriteAt: getLastWriteAt() }
    }
  })

  ipcMain.handle('store:choose-dir', async (): Promise<BootstrapResult | null> => {
    const dir = await chooseDataDir()
    if (!dir) return null
    return {
      needsOnboarding: false,
      dataDir: dir,
      collections: loadAll(),
      settings: getSettings(),
      meta: { lastWriteAt: getLastWriteAt() }
    }
  })

  ipcMain.handle(
    'store:save',
    (_e, name: CollectionName, data: unknown): { savedAt: string } => {
      return saveCollection(name, data)
    }
  )

  ipcMain.handle('store:check-external', (): { changed: CollectionName[]; data: AllCollections } | null => {
    return checkExternalChanges()
  })

  ipcMain.handle('store:backup', (): { ok: boolean; dir?: string; error?: string } => {
    try {
      const dir = backupNow()
      return { ok: true, dir }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('store:open-data-dir', async (): Promise<boolean> => {
    const dir = getSettings().dataDir
    if (!dir) return false
    await shell.openPath(dir)
    return true
  })

  ipcMain.handle('shell:open-external', async (_e, url: string): Promise<void> => {
    if (/^https?:\/\//i.test(url)) {
      await shell.openExternal(url)
    }
  })

  ipcMain.handle('shell:open-path', async (_e, target: string): Promise<string> => {
    // 返回空字符串表示成功，否则为错误信息
    let errMsg = ''
    try {
      const result = await shell.openPath(target)
      errMsg = result
    } catch (err) {
      errMsg = String(err)
    }
    return errMsg
  })

  ipcMain.handle('fs:exists', (_e, target: string): boolean => {
    try {
      fs.accessSync(target)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle(
    'settings:update',
    (_e, patch: Partial<AppSettings>): AppSettings => {
      if (patch.hotkey !== undefined) {
        const prevHotkey = getSettings().hotkey
        const next = updateSettings(patch)
        const ok = setQuickCaptureShortcut(patch.hotkey, () => {
          getMainWindow()?.webContents.send('quick-capture:show')
        })
        if (!ok) {
          // 注册失败（被其他软件占用）：回滚为原快捷键，并通过标记前缀告知渲染层
          updateSettings({ hotkey: prevHotkey })
          return { ...next, hotkey: `__CONFLICT__:${patch.hotkey}` }
        }
        return next
      }
      return updateSettings(patch)
    }
  )

  ipcMain.handle('dialog:pick-path', async (_e, kind: 'file' | 'directory'): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: kind === 'directory' ? ['openDirectory'] : ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // 抓取网页标题与 favicon（离线或失败时渲染层降级为域名/默认图标）
  ipcMain.handle('url:fetch-meta', async (_e, url: string): Promise<{ title: string | null; favicon: string | null }> => {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5000)
      const resp = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GezhiWorkbench/1.0' }
      })
      clearTimeout(timer)
      const html = (await resp.text()).slice(0, 200_000)
      let title: string | null = null
      let favicon: string | null = null
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
      if (titleMatch) {
        try {
          title = decodeEntities(titleMatch[1].trim())
        } catch {
          title = titleMatch[1].trim()
        }
      }
      const linkMatch = html.match(
        /<link[^>]+rel=["'][^"']*(?:icon|shortcut icon)[^"']*["'][^>]*>/i
      )
      if (linkMatch) {
        const hrefMatch = linkMatch[0].match(/href=["']([^"']+)["']/i)
        if (hrefMatch) {
          try {
            favicon = new URL(hrefMatch[1], url).toString()
          } catch {
            favicon = null
          }
        }
      }
      if (!favicon) {
        try {
          favicon = new URL('/favicon.ico', url).toString()
        } catch {
          favicon = null
        }
      }
      return { title, favicon }
    } catch {
      return { title: null, favicon: null }
    }
  })

  ipcMain.handle('app:quit', (): void => {
    try {
      backupNow()
    } catch {
      /* 退出前备份失败不阻塞退出 */
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('electron').app.quit()
  })
}

function decodeEntities(s: string): string {
  const map: Record<string, string> = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' '
  }
  return s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => map[m] ?? m)
}
