// 主进程 IPC：数据存取、系统交互（打开网址/文件/程序）、设置、全局快捷键、应用更新
// 安全边界：所有 handler 均校验调用来源（只信任本应用窗口），并把入参当作不可信输入做白名单校验
import { app, ipcMain, shell, dialog } from 'electron'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  COLLECTION_FILES,
  DEFAULT_VOCAB,
  type AppSettings,
  type CollectionName,
  type BootstrapResult,
  type ExternalChangesResult,
  type ParseReferencesResult,
  type UpdateCheckResult
} from '@shared/types'
import {
  backupNow,
  checkExternalChanges,
  chooseDataDir,
  getSettings,
  getLastWriteAt,
  loadAllWithIssues,
  saveCollection,
  updateSettings
} from './store'
import { exportToFile, markdownToDocx } from './exporter'
import { parseReferencesFile } from './importer'
import { isValidAccelerator, setQuickCaptureShortcut } from './shortcuts'
import { safeFetch } from './netGuard'
import { checkForUpdates, quitAndInstallNow, startDownloadUpdate } from './updater'

const COLLECTION_WHITELIST = new Set<string>(Object.keys(COLLECTION_FILES))
/** 对象结构集合（其余均为数组） */
const OBJECT_COLLECTIONS = new Set<string>(['tools', 'vocab'])
/** 导入文件大小上限 */
const IMPORT_MAX_BYTES = 32 * 1024 * 1024

/** 只接受来自本应用窗口、且页面 URL 属于应用自身的 IPC 调用（兜底：即使 preload 泄漏到外部页面也不认账） */
function isTrustedSender(e: Electron.IpcMainInvokeEvent): boolean {
  const frame = e.senderFrame
  if (!frame) return false
  const url = frame.url
  if (url.startsWith('file://')) {
    const rendererDir = pathToFileURL(path.join(__dirname, '../renderer') + path.sep).href
    return url.startsWith(rendererDir)
  }
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  return Boolean(devUrl) && (url === devUrl || url.startsWith(`${devUrl}/`))
}

/** 带来源校验的 ipcMain.handle 包装 */
function handle<K extends unknown[]>(
  channel: string,
  fn: (e: Electron.IpcMainInvokeEvent, ...args: K) => unknown
): void {
  ipcMain.handle(channel, (e, ...args: K) => {
    if (!isTrustedSender(e)) {
      console.warn(`[ipc] 拒绝不可信来源调用 ${channel}: ${e.senderFrame?.url ?? '(no frame)'}`)
      throw new Error('unauthorized')
    }
    return fn(e, ...args)
  })
}

/** 通用入参校验器 */
function assertString(v: unknown, name: string, maxLen = 4096): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > maxLen) {
    throw new Error(`非法 ${name}`)
  }
  return v
}

export function registerIpcHandlers(getMainWindow: () => Electron.BrowserWindow | null): void {
  handle('store:bootstrap', (): BootstrapResult => {
    const settings = getSettings()
    const { data, issues } = loadAllWithIssues()
    return {
      needsOnboarding: !settings.dataDir,
      dataDir: settings.dataDir,
      collections: settings.dataDir
        ? data
        : {
            projects: [],
            tasks: [],
            milestones: [],
            ideas: [],
            logs: [],
            tools: { groups: [], items: [] },
            vocab: DEFAULT_VOCAB,
            papers: [],
            achievements: [],
            reports: [],
            references: []
          },
      settings,
      meta: { lastWriteAt: getLastWriteAt() },
      issues
    }
  })

  handle('store:choose-dir', async (): Promise<BootstrapResult | null> => {
    const dir = await chooseDataDir()
    if (!dir) return null
    const { data, issues } = loadAllWithIssues()
    return {
      needsOnboarding: false,
      dataDir: dir,
      collections: data,
      settings: getSettings(),
      meta: { lastWriteAt: getLastWriteAt() },
      issues
    }
  })

  handle('store:save', async (_e, name: unknown, data: unknown): Promise<{ savedAt: string }> => {
    if (typeof name !== 'string' || !COLLECTION_WHITELIST.has(name)) {
      throw new Error(`非法集合名: ${String(name)}`)
    }
    if (OBJECT_COLLECTIONS.has(name)) {
      if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        throw new Error(`${name} 必须是对象`)
      }
    } else if (!Array.isArray(data)) {
      throw new Error(`${name} 必须是数组`)
    }
    return saveCollection(name as CollectionName, data)
  })

  handle('store:check-external', (): ExternalChangesResult | null => checkExternalChanges())

  handle('store:backup', (): { ok: boolean; dir?: string; error?: string } => {
    try {
      const dir = backupNow()
      return { ok: true, dir }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  handle('store:open-data-dir', async (): Promise<boolean> => {
    const dir = getSettings().dataDir
    if (!dir) return false
    await shell.openPath(dir)
    return true
  })

  // 冲突/备份留底目录：路径拼接留在主进程，渲染层不感知分隔符
  handle('store:open-backup-dir', async (): Promise<boolean> => {
    const dir = getSettings().dataDir
    if (!dir) return false
    await shell.openPath(path.join(dir, 'backups'))
    return true
  })

  handle('shell:open-external', async (_e, url: unknown): Promise<void> => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      await shell.openExternal(url)
    }
  })

  handle('shell:open-path', async (_e, target: unknown): Promise<string> => {
    // 返回空字符串表示成功，否则为错误信息
    if (typeof target !== 'string' || target.length === 0 || target.length > 4096) {
      return '非法路径'
    }
    try {
      return await shell.openPath(path.resolve(target))
    } catch (err) {
      return String(err)
    }
  })

  handle('fs:exists', (_e, target: unknown): boolean => {
    if (typeof target !== 'string' || target.length === 0 || target.length > 4096) return false
    try {
      fs.accessSync(target)
      return true
    } catch {
      return false
    }
  })

  // 批量存在性检测：一次 IPC + 异步并发，替代每分钟 N 次 accessSync 的轮询
  handle('fs:exists-many', async (_e, targets: unknown): Promise<boolean[]> => {
    if (!Array.isArray(targets) || targets.length > 500) {
      throw new Error('非法路径列表')
    }
    const paths = targets.map((t) => (typeof t === 'string' && t.length > 0 && t.length <= 4096 ? t : ''))
    return Promise.all(
      paths.map((p) =>
        p ? fsp.access(p).then(
          () => true,
          () => false
        ) : Promise.resolve(false)
      )
    )
  })

  handle('settings:update', async (_e, patch: unknown): Promise<AppSettings> => {
    if (typeof patch !== 'object' || patch === null) throw new Error('非法设置项')
    const p = patch as Partial<AppSettings>
    if (p.hotkey !== undefined) {
      // 双层校验：不允许无修饰键的字母/数字成为全局热键（会跨应用抢占输入）
      if (!isValidAccelerator(p.hotkey)) throw new Error(`非法快捷键: ${String(p.hotkey)}`)
      const onPress = (): void => {
        getMainWindow()?.webContents.send('quick-capture:show')
      }
      // 先试注册新键，成功后再写配置：避免出现「配置已改、注册已丢」或反之的中间态
      const ok = setQuickCaptureShortcut(p.hotkey, onPress)
      if (!ok) {
        // setQuickCaptureShortcut 内部已尝试恢复旧键；配置保持旧键并通过标记前缀告知渲染层
        return { ...getSettings(), hotkey: `__CONFLICT__:${p.hotkey}` }
      }
      return updateSettings(p)
    }
    if (p.dataDir !== undefined && p.dataDir !== null && (typeof p.dataDir !== 'string' || p.dataDir.length > 4096)) {
      throw new Error('非法数据目录')
    }
    return updateSettings(p)
  })

  handle(
    'dialog:pick-path',
    async (
      _e,
      kind: unknown,
      filters?: unknown
    ): Promise<string | null> => {
      if (kind !== 'file' && kind !== 'directory') throw new Error('非法类型')
      const result = await dialog.showOpenDialog({
        properties: kind === 'directory' ? ['openDirectory'] : ['openFile'],
        filters: Array.isArray(filters) ? (filters as Electron.FileFilter[]) : undefined
      })
      if (result.canceled || result.filePaths.length === 0) return null
      return result.filePaths[0]
    }
  )

  // 文献导入：主进程读取并解析 .bib（BibTeX）/ .json（CSL JSON），大文件不阻塞渲染层
  handle('import:parse-references', (_e, filePath: unknown): ParseReferencesResult => {
    const file = assertString(filePath, '路径')
    const ext = path.extname(file).toLowerCase()
    if (ext !== '.bib' && ext !== '.json') throw new Error('仅支持 .bib / .json 文件')
    const st = fs.statSync(file) // 不存在/不可读时抛错，不落入任意路径探测
    if (st.size > IMPORT_MAX_BYTES) throw new Error('文件过大（>32MB）')
    return parseReferencesFile(file)
  })

  // 汇报导出：md 直写 / docx 由 Markdown 转换；返回保存路径（取消返回 null）
  handle(
    'export:report',
    async (
      _e,
      args: {
        defaultFileName: string
        markdown: string
        format: 'md' | 'docx'
        title: string
      }
    ): Promise<{ ok: boolean; path?: string; error?: string }> => {
      try {
        if (typeof args !== 'object' || args === null) throw new Error('非法参数')
        const { defaultFileName, markdown, format, title } = args
        if (typeof defaultFileName !== 'string' || typeof markdown !== 'string' || typeof title !== 'string') {
          throw new Error('非法参数')
        }
        if (format !== 'md' && format !== 'docx') throw new Error('非法导出格式')
        const showDialog = async (): Promise<string | null> => {
          const result = await dialog.showSaveDialog({
            title: format === 'md' ? '导出 Markdown' : '导出 Word 文档',
            defaultPath: defaultFileName,
            filters:
              format === 'md'
                ? [{ name: 'Markdown', extensions: ['md'] }]
                : [{ name: 'Word 文档', extensions: ['docx'] }]
          })
          return result.canceled || !result.filePath ? null : result.filePath
        }
        const data =
          format === 'md' ? markdown : await markdownToDocx(markdown, title)
        const saved = await exportToFile(data, format, showDialog)
        return saved ? { ok: true, path: saved } : { ok: false, error: 'canceled' }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    }
  )

  // ---------- 网页元信息抓取（地址校验与安全抓取见 netGuard.ts） ----------

  // 仅返回网页标题（站点图标有专用通道 url:fetch-favicon，此前的 favicon 字段已随之下线）
  handle('url:fetch-meta', async (_e, url: unknown): Promise<{ title: string | null }> => {
    if (typeof url !== 'string') return { title: null }
    try {
      const resp = await safeFetch(url)
      if (!resp || !resp.ok) return { title: null }
      const html = (await resp.text()).slice(0, 200_000)
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
      if (!titleMatch) return { title: null }
      try {
        return { title: decodeEntities(titleMatch[1].trim()) }
      } catch {
        return { title: titleMatch[1].trim() }
      }
    } catch {
      return { title: null }
    }
  })

  // 站点图标代理：主进程取回 favicon 以 data: URL 交给渲染层（CSP 收紧后渲染层不能直连外站图片）
  handle('url:fetch-favicon', async (_e, url: unknown): Promise<string | null> => {
    if (typeof url !== 'string') return null
    try {
      // safeFetch 自带 assertSafeUrl（协议白名单 + DNS 全量私网判定 + 逐跳校验），不必先行校验一次
      const resp = await safeFetch(new URL('/favicon.ico', url).toString())
      if (!resp || !resp.ok) return null
      const type = (resp.headers.get('content-type') ?? '').split(';')[0].trim()
      if (!type.startsWith('image/')) return null
      const buf = Buffer.from(await resp.arrayBuffer())
      if (buf.length === 0 || buf.length > 256 * 1024) return null
      return `data:${type};base64,${buf.toString('base64')}`
    } catch {
      return null
    }
  })

  // ---------- 应用更新（GitHub Releases） ----------
  handle('update:check', async (): Promise<UpdateCheckResult> => checkForUpdates())

  handle('update:download', async (): Promise<void> => {
    await startDownloadUpdate()
  })

  handle('update:install', (): void => {
    quitAndInstallNow()
  })

  handle('update:get-version', (): string => app.getVersion())

  // ---------- 退出握手：先让渲染层落盘防抖中的编辑，再真正退出 ----------
  let quitConfirmed = false
  function doQuit(): void {
    // 退出前备份由 index.ts 的 before-quit 统一执行（此时渲染层数据已落盘）
    app.quit()
  }

  handle('app:quit', (): void => {
    const win = getMainWindow()
    if (!win || win.isDestroyed() || quitConfirmed) return doQuit()
    win.webContents.send('app:quit-requested') // 渲染层 flush 完成后回调 app:confirm-quit
    setTimeout(() => {
      if (!quitConfirmed) doQuit() // 兜底：渲染层 2s 内无回应也退出
    }, 2000)
  })

  handle('app:confirm-quit', (): void => {
    quitConfirmed = true
    doQuit()
  })
}

function decodeEntities(s: string): string {
  const map: Record<string, string> = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' '
  }
  return s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => map[m] ?? m)
}
