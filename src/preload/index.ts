// Preload：通过 contextBridge 暴露类型安全的 window.api
import { contextBridge, ipcRenderer } from 'electron'
import type {
  AllCollections,
  AppSettings,
  BootstrapResult,
  CollectionName
} from '@shared/types'

const api = {
  bootstrap: (): Promise<BootstrapResult> => ipcRenderer.invoke('store:bootstrap'),
  chooseDataDir: (): Promise<BootstrapResult | null> => ipcRenderer.invoke('store:choose-dir'),
  saveCollection: (name: CollectionName, data: unknown): Promise<{ savedAt: string }> =>
    ipcRenderer.invoke('store:save', name, data),
  checkExternalChanges: (): Promise<{ changed: CollectionName[]; data: AllCollections } | null> =>
    ipcRenderer.invoke('store:check-external'),
  backupNow: (): Promise<{ ok: boolean; dir?: string; error?: string }> =>
    ipcRenderer.invoke('store:backup'),
  openDataDir: (): Promise<boolean> => ipcRenderer.invoke('store:open-data-dir'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:open-external', url),
  openPath: (target: string): Promise<string> => ipcRenderer.invoke('shell:open-path', target),
  pathExists: (target: string): Promise<boolean> => ipcRenderer.invoke('fs:exists', target),
  updateSettings: (patch: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:update', patch),
  pickPath: (kind: 'file' | 'directory'): Promise<string | null> =>
    ipcRenderer.invoke('dialog:pick-path', kind),
  exportReport: (args: {
    defaultFileName: string
    markdown: string
    format: 'md' | 'docx'
    title: string
  }): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('export:report', args),
  fetchUrlMeta: (url: string): Promise<{ title: string | null; favicon: string | null }> =>
    ipcRenderer.invoke('url:fetch-meta', url),
  quitApp: (): Promise<void> => ipcRenderer.invoke('app:quit'),
  // 主进程 → 渲染进程
  onQuickCapture: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('quick-capture:show', listener)
    return () => ipcRenderer.removeListener('quick-capture:show', listener)
  }
}

export type GezhiApi = typeof api

contextBridge.exposeInMainWorld('api', api)
