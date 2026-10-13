// 侧边栏底部「写作计时」常驻按钮（决策 D18）：随手开始写作
// 空闲=点击开始（立即落盘 ended_at=null 的 session）；计时中=显示 mm:ss，每秒刷新仅作用于本组件
import { useEffect, useState } from 'react'
import { Square, Timer } from 'lucide-react'
import { nowISO } from '@shared/types'
import { formatTimerDisplay, sessionDurationMs } from '@/lib/writing'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'
import { useTimerStore } from '@/timerStore'

export default function WritingTimerButton() {
  const addWritingSession = useStore((s) => s.addWritingSession)
  const activeSessionId = useTimerStore((s) => s.activeSessionId)
  const activeStartedAt = useTimerStore((s) => s.activeStartedAt)
  const openFinish = useTimerStore((s) => s.openFinish)

  // 每秒 tick 只触发本组件重渲染（store 不逐秒更新，其余组件不受影响）
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!activeStartedAt) return
    const t = setInterval(() => setTick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [activeStartedAt])

  const display = activeStartedAt ? formatTimerDisplay(sessionDurationMs(activeStartedAt)) : '00:00'

  const onClick = (): void => {
    if (activeSessionId) {
      openFinish(activeSessionId, 'end')
      return
    }
    // 开始前残留检查（PRD 5.5.3）：上次异常残留未结束的 session 先提示补记
    const residual = useStore.getState().sessions.find((s) => s.ended_at === null)
    if (residual) {
      openFinish(residual.id, 'backfill')
      return
    }
    const session = addWritingSession({ started_at: nowISO() })
    useTimerStore.getState().start(session.id, session.started_at)
  }

  const timing = activeSessionId !== null
  return (
    <button
      data-tour="writing-timer"
      onClick={onClick}
      title={timing ? '点击结束并记录本次写作' : '开始写作计时'}
      className={cn(
        'relative flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors cursor-pointer',
        '[&_svg]:h-4 [&_svg]:w-4 [&_svg]:stroke-[1.8]',
        timing
          ? 'bg-accent-soft font-semibold text-accent [&_svg]:stroke-[2.1]'
          : 'text-text-2 hover:bg-surface-2 hover:text-text'
      )}
    >
      {timing ? <Square /> : <Timer />}
      {timing ? <span className="tabular-nums">{display}</span> : '写作计时'}
      {timing && <span className="ml-auto text-[11px] font-normal text-accent">计时中</span>}
    </button>
  )
}
