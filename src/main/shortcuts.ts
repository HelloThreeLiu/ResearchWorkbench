// 全局快捷键管理：速记快捷键注册/更新/注销
import { globalShortcut } from 'electron'

let currentAccelerator: string | null = null

const MODIFIERS = [
  'Alt',
  'Control',
  'Shift',
  'Super',
  'Command',
  'CommandOrControl',
  'CmdOrCtrl',
  'Meta'
]

/**
 * 校验 accelerator 格式（不信任渲染层传入的配置）：
 * 末段必须是单个字母/数字或 F1–F12；除 F1–F12 可单独使用外，其余必须带修饰键。
 */
export function isValidAccelerator(acc: unknown): acc is string {
  if (typeof acc !== 'string' || acc.length === 0 || acc.length > 40) return false
  const parts = acc.split('+').filter(Boolean)
  if (parts.length === 0) return false
  const keyPart = parts[parts.length - 1]
  const isFnKey = /^F([1-9]|1[0-2])$/.test(keyPart)
  const isPlainKey = /^[0-9A-Za-z]$/.test(keyPart)
  if (!isFnKey && !isPlainKey) return false
  if (parts.length === 1) return isFnKey
  return parts.slice(0, -1).every((p) => MODIFIERS.includes(p))
}

/**
 * 注册速记快捷键。返回是否成功（失败通常为组合键被其他软件占用）。
 * 注册失败时尝试把旧键注册回来，避免出现「配置未变但快捷键已失效」的中间态。
 */
export function setQuickCaptureShortcut(accelerator: string, onPress: () => void): boolean {
  const prev = currentAccelerator
  try {
    if (prev) {
      globalShortcut.unregister(prev)
      currentAccelerator = null
    }
    const ok = globalShortcut.register(accelerator, onPress)
    if (ok) {
      currentAccelerator = accelerator
    } else if (prev && prev !== accelerator) {
      // 新键被占用：把旧键找回来，旧键此前注册成功过，这里失败概率极低
      if (globalShortcut.register(prev, onPress)) currentAccelerator = prev
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
