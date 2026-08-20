// 全局快捷键管理：速记快捷键注册/更新/注销
import { globalShortcut } from 'electron'

let currentAccelerator: string | null = null

/**
 * 注册速记快捷键。返回是否成功（失败通常为组合键被其他软件占用）。
 */
export function setQuickCaptureShortcut(accelerator: string, onPress: () => void): boolean {
  try {
    if (currentAccelerator) {
      globalShortcut.unregister(currentAccelerator)
      currentAccelerator = null
    }
    const ok = globalShortcut.register(accelerator, onPress)
    if (ok) {
      currentAccelerator = accelerator
    }
    return ok
  } catch {
    return false
  }
}

export function unregisterAllShortcuts(): void {
  try {
    globalShortcut.unregisterAll()
    currentAccelerator = null
  } catch {
    /* 忽略 */
  }
}
