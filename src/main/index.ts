// 格致 · 科研工作台 —— 主进程入口
// 窗口/托盘/全局快捷键生命周期管理；关闭默认最小化到托盘（可在设置修改）
import { app, BrowserWindow, Menu, Tray, nativeImage, dialog, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerIpcHandlers } from './ipc'
import { isValidAccelerator, setQuickCaptureShortcut, unregisterAllShortcuts } from './shortcuts'
import { dailyBackupIfNeeded, getSettings, loadSettings } from './store'
import { initUpdater, scheduleStartupSilentCheck } from './updater'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

// 显式统一应用名：保证 userData 目录（设置存储位置）在 dev / preview / 打包各启动方式下一致
app.setName('gezhi-workbench')

function resolveIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(app.getAppPath(), 'build', 'icon.png')
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 880,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    icon: nativeImage.createFromPath(resolveIconPath()),
    title: '格致 · 科研工作台',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      // preload 只使用 contextBridge/ipcRenderer，无需放开沙箱；
      // 锁死三件套，防止窗口被导航到外部页面后 preload 带着 Node 能力重跑
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // 只允许应用自身来源的导航：dev 下为 vite 服务；打包后精确到本应用 renderer 目录
  // （不能放开整个 file: 协议——Markdown 里的 `//evil.com/x.html` 会以 file:// 为基址解析成
  //   file://evil.com/...，在 Windows 上触发 SMB 外联并替换窗口内容）
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  const rendererDirFs = path.join(__dirname, '../renderer') + path.sep
  const isAllowedUrl = (raw: string): boolean => {
    if (devUrl && (raw === devUrl || raw.startsWith(`${devUrl}/`))) return true
    // 先规范化再做路径包含判定：不依赖「调用方传入的一定是 Chromium 已规范化的 URL」这条隐含前提，
    // `renderer/../../evil.html` 这类穿越写法在路径语义下会被拒绝
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

  // 外部链接一律交给系统浏览器，绝不在应用窗口内开新窗/新页
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // 阻止渲染层导航离开应用（Markdown 日志里的外链点击是主要入口）
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (isAllowedUrl(url)) return
    e.preventDefault()
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })
  // 子帧导航（History API / iframe 等）再兜一层；并禁止 <webview> 标签
  mainWindow.webContents.on('will-frame-navigate', (e) => {
    if (!isAllowedUrl(e.url)) e.preventDefault()
  })
  mainWindow.webContents.on('will-attach-webview', (e) => {
    e.preventDefault()
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // 关闭 → 最小化到托盘（保证全局快捷键随时可用）
  mainWindow.on('close', (e) => {
    if (!isQuitting && getSettings().closeToTray) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function showMainWindow(): void {
  if (!mainWindow) {
    createMainWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function triggerQuickCapture(): void {
  showMainWindow()
  const win = mainWindow
  if (!win) return
  // 窗口刚重建时渲染层尚未注册监听：等加载完成再发，避免事件丢失
  const send = (): void => win.webContents.send('quick-capture:show')
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send)
  else send()
}

/** 托盘图标按短边等比缩放到 16px，避免非正方形原图被拉伸变形 */
function buildTrayIcon(): Electron.NativeImage {
  const img = nativeImage.createFromPath(resolveIconPath())
  const { width, height } = img.getSize()
  if (!width || !height) return img.resize({ width: 16, height: 16 })
  const scale = Math.min(16 / width, 16 / height)
  return img.resize({
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  })
}

function createTray(): void {
  const icon = buildTrayIcon()
  tray = new Tray(icon)
  tray.setToolTip('格致 · 科研工作台')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开主界面', click: showMainWindow },
      { label: '速记灵感', click: triggerQuickCapture },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('double-click', showMainWindow)
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => showMainWindow())

  app.whenReady().then(() => {
    loadSettings()
    createMainWindow()
    createTray()
    registerIpcHandlers(() => mainWindow)
    initUpdater(() => mainWindow)
    scheduleStartupSilentCheck()

    const { hotkey } = getSettings()
    // 不信任落盘配置：格式非法（如旧版本存入的单字母键）直接拒绝注册
    if (!isValidAccelerator(hotkey)) {
      dialog.showErrorBox(
        '快捷键配置无效',
        `已保存的速记快捷键「${hotkey}」格式无效，已跳过注册。请前往 设置 → 快捷键 重新设置。`
      )
    } else {
      const ok = setQuickCaptureShortcut(hotkey, triggerQuickCapture)
      if (!ok) {
        dialog.showErrorBox(
          '快捷键注册失败',
          `全局速记快捷键「${hotkey}」可能被其他软件占用，请前往 设置 → 快捷键 修改。`
        )
      }
    }

    dailyBackupIfNeeded()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('before-quit', () => {
    // 标记真正退出：绕过「关闭最小化到托盘」，保证更新安装（quitAndInstall）等退出路径生效
    isQuitting = true
    try {
      // 退出前自动备份（删除保护与每日备份之外的最后一道快照）
      const { backupNow } = require('./store') as typeof import('./store')
      if (getSettings().dataDir) backupNow()
    } catch {
      /* 备份失败不阻塞退出 */
    }
  })

  app.on('will-quit', () => {
    unregisterAllShortcuts()
  })

  app.on('window-all-closed', () => {
    // 关闭窗口已隐藏到托盘，此事件仅在真正退出（托盘退出）时触发
  })
}
