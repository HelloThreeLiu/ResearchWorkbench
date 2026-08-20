// 格致 · 科研工作台 —— 主进程入口
// 窗口/托盘/全局快捷键生命周期管理；关闭默认最小化到托盘（可在设置修改）
import { app, BrowserWindow, Menu, Tray, nativeImage, dialog } from 'electron'
import path from 'node:path'
import { registerIpcHandlers } from './ipc'
import { setQuickCaptureShortcut, unregisterAllShortcuts } from './shortcuts'
import { dailyBackupIfNeeded, getSettings, loadSettings } from './store'

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
      sandbox: false
    }
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
  mainWindow?.webContents.send('quick-capture:show')
}

function createTray(): void {
  const icon = nativeImage.createFromPath(resolveIconPath()).resize({ width: 16, height: 16 })
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

    const { hotkey } = getSettings()
    const ok = setQuickCaptureShortcut(hotkey, triggerQuickCapture)
    if (!ok) {
      dialog.showErrorBox(
        '快捷键注册失败',
        `全局速记快捷键「${hotkey}」可能被其他软件占用，请前往 设置 → 快捷键 修改。`
      )
    }

    dailyBackupIfNeeded()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('before-quit', () => {
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
