// 新手引导会话状态（仅会话级，不落盘；完成/跳过时由 Tour 组件经 settings:update 写 tourVersion）
import { create } from 'zustand'

interface TourState {
  active: boolean
  /** 启动自动触发与设置页「重新查看引导」共用入口 */
  start: () => void
  close: () => void
}

export const useTourStore = create<TourState>((set) => ({
  active: false,
  start: () => set({ active: true }),
  close: () => set({ active: false })
}))
