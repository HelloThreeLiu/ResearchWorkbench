// 写作计时全局状态（PRD 8.3）：Zustand 独立小 store，仅内存不落盘——
// 计时 UI 的进行中状态放这里，每秒刷新由按钮组件本地 tick 驱动，本 store 不逐秒更新；
// session 记录本身开始即落盘（ended_at=null），崩溃/换机后靠残留检测触发补记
import { create } from 'zustand'

/** 收尾弹窗目标：mode=end 正常结束（录字数等）/ backfill=异常残留补记（PRD 5.5.3） */
export interface FinishTarget {
  sessionId: string
  mode: 'end' | 'backfill'
}

interface TimerState {
  activeSessionId: string | null
  activeStartedAt: string | null
  finishTarget: FinishTarget | null
  start: (sessionId: string, startedAt: string) => void
  stop: () => void
  openFinish: (sessionId: string, mode: FinishTarget['mode']) => void
  closeFinish: () => void
}

export const useTimerStore = create<TimerState>((set) => ({
  activeSessionId: null,
  activeStartedAt: null,
  finishTarget: null,
  start: (sessionId, startedAt) => set({ activeSessionId: sessionId, activeStartedAt: startedAt }),
  stop: () => set({ activeSessionId: null, activeStartedAt: null }),
  openFinish: (sessionId, mode) => set({ finishTarget: { sessionId, mode } }),
  closeFinish: () => set({ finishTarget: null })
}))
