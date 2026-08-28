// 速记浮层全局状态：open 状态从 App 局部 state 迁入，支持文献详情等深层入口预填前缀唤起
import { create } from 'zustand'

interface CaptureState {
  open: boolean
  /** 预填文本（如「[文献] 标题：」前缀），随 show 一次性生效 */
  prefill: string
  show: (prefill?: string) => void
  hide: () => void
}

export const useCaptureStore = create<CaptureState>((set) => ({
  open: false,
  prefill: '',
  show: (prefill = '') => set({ open: true, prefill }),
  hide: () => set({ open: false, prefill: '' })
}))
