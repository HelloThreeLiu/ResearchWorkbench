// 应用更新状态：主进程 update:event 推送 + 手动检查结果，
// 供侧边栏红点、右上角提示卡、更新弹窗三处共享（仅会话级状态，不落盘）
import { create } from 'zustand'
import type { UpdateEvent } from '@shared/types'

/** 更新弹窗所处阶段（状态机） */
export type UpdateStage =
  | 'checking' // 检查中
  | 'available' // 发现新版本，等待确认
  | 'unavailable' // 已是最新
  | 'dev' // 开发模式
  | 'downloading' // 下载中（含进度）
  | 'downloaded' // 下载完成，待安装
  | 'error' // 检查或下载失败

interface UpdateInfo {
  version: string
  notes: string
  releaseUrl: string | null
}

interface UpdateState {
  currentVersion: string | null
  /** 非空 = 有新版本（侧边栏红点依据） */
  available: UpdateInfo | null
  noticeVisible: boolean
  modalOpen: boolean
  stage: UpdateStage
  progress: { percent: number; bytesPerSecond: number; transferred: number; total: number } | null
  errorMessage: string | null

  hydrateVersion: () => Promise<void>
  handleEvent: (event: UpdateEvent) => void
  /** 打开弹窗并检查更新（设置页“检查更新”/提示卡“查看更新”共用入口） */
  openModalWithCheck: () => Promise<void>
  beginDownload: () => Promise<void>
  installNow: () => Promise<void>
  dismissNotice: () => void
  closeModal: () => void
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  currentVersion: null,
  available: null,
  noticeVisible: false,
  modalOpen: false,
  stage: 'checking',
  progress: null,
  errorMessage: null,

  hydrateVersion: async () => {
    try {
      const version = await window.api.getAppVersion()
      set({ currentVersion: version })
    } catch {
      /* 版本号获取失败不阻塞界面 */
    }
  },

  handleEvent: (event) => {
    switch (event.kind) {
      case 'available':
        // 启动静默检查首次发现新版本：亮红点并弹提示卡；本会话已知晓则不重复打扰
        if (!get().available) {
          set({
            available: { version: event.version, notes: event.notes, releaseUrl: event.releaseUrl },
            noticeVisible: true
          })
        }
        break
      case 'progress':
        set({
          stage: 'downloading',
          progress: {
            percent: event.percent,
            bytesPerSecond: event.bytesPerSecond,
            transferred: event.transferred,
            total: event.total
          }
        })
        break
      case 'downloaded':
        set({ stage: 'downloaded', progress: null })
        break
      case 'error':
        set({ stage: 'error', errorMessage: event.message, progress: null })
        break
    }
  },

  openModalWithCheck: async () => {
    set({ modalOpen: true, errorMessage: null })
    // 下载中/已下载直接展示当前进度，避免重复检查打断状态
    if (get().stage === 'downloading' || get().stage === 'downloaded') return
    set({ stage: 'checking' })
    try {
      const result = await window.api.checkUpdate()
      if (result.status === 'available' && result.newVersion) {
        set({
          stage: 'available',
          available: {
            version: result.newVersion,
            notes: result.notes,
            releaseUrl: result.releaseUrl
          },
          noticeVisible: false
        })
      } else if (result.status === 'dev') {
        set({ stage: 'dev' })
      } else if (result.status === 'error') {
        set({ stage: 'error', errorMessage: result.error })
      } else {
        set({ stage: 'unavailable' })
      }
    } catch (err) {
      set({ stage: 'error', errorMessage: err instanceof Error ? err.message : String(err) })
    }
  },

  beginDownload: async () => {
    set({ stage: 'downloading', progress: null, errorMessage: null })
    try {
      await window.api.downloadUpdate()
    } catch (err) {
      set({ stage: 'error', errorMessage: err instanceof Error ? err.message : String(err) })
    }
  },

  installNow: async () => {
    try {
      await window.api.installUpdate()
    } catch (err) {
      set({ stage: 'error', errorMessage: err instanceof Error ? err.message : String(err) })
    }
  },

  dismissNotice: () => set({ noticeVisible: false }),
  closeModal: () => set({ modalOpen: false })
}))
