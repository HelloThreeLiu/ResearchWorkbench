// 聚光分步新手引导（z-[70]，高于 QuickCapture 的 z-[60]；阶梯见 ui.tsx Modal z-50）
// 完成引导 / 跳过 / Esc 三条退出路径统一写 tourVersion 落盘（幂等，重看后再写回无副作用）。
// 激活时整屏接管点击：遮罩本身不做任何事，操作只走气泡按钮，避免误触底下界面。
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { TOUR_STEPS } from '@/lib/tour'
import { TOUR_VERSION } from '@shared/tour'
import { useTourStore } from '@/tourStore'
import { useStore } from '@/store'
import { Button } from '@/components/ui'

interface Box {
  left: number
  top: number
  width: number
  height: number
  right: number
  bottom: number
}

const BUBBLE_WIDTH = 320
/** 高亮框相对目标元素四周的留白 */
const SPOT_PADDING = 6
/** 气泡与高亮框的间距 / 距视口边缘的最小留白 */
const BUBBLE_GAP = 10
const VIEWPORT_MARGIN = 12

/** 目标元素查询：selector 缺省（居中步骤）、元素不存在或不可见时返回 null，退化为居中卡片 */
function targetBox(selector: string | undefined): Box | null {
  if (!selector) return null
  const el = document.querySelector(`[data-tour="${selector}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return null
  return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom }
}

/** 计算气泡坐标：目标窄且右侧放得下（如侧边栏条目）优先放右侧，否则下方 / 上方，均夹紧视口 */
function bubblePosition(box: Box | null, bubbleHeight: number): { x: number; y: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const maxX = vw - BUBBLE_WIDTH - VIEWPORT_MARGIN
  let x: number
  let y: number
  if (box) {
    const fitsRight = box.right + SPOT_PADDING + BUBBLE_GAP + BUBBLE_WIDTH <= maxX
    const fitsBelow = box.bottom + SPOT_PADDING + BUBBLE_GAP + bubbleHeight <= vh - VIEWPORT_MARGIN
    const fitsAbove = box.top - SPOT_PADDING - BUBBLE_GAP - bubbleHeight >= VIEWPORT_MARGIN
    if (fitsRight && box.width < 300) {
      x = box.right + SPOT_PADDING + BUBBLE_GAP
      y = box.top
    } else if (fitsBelow || !fitsAbove) {
      x = box.left - SPOT_PADDING
      y = box.bottom + SPOT_PADDING + BUBBLE_GAP
    } else {
      x = box.left - SPOT_PADDING
      y = box.top - SPOT_PADDING - BUBBLE_GAP - bubbleHeight
    }
  } else {
    x = (vw - BUBBLE_WIDTH) / 2
    y = (vh - bubbleHeight) / 2
  }
  return {
    x: Math.max(VIEWPORT_MARGIN, Math.min(x, maxX)),
    y: Math.max(VIEWPORT_MARGIN, Math.min(y, vh - bubbleHeight - VIEWPORT_MARGIN))
  }
}

export default function Tour() {
  const active = useTourStore((s) => s.active)
  if (!active) return null
  // 每次激活重新挂载内容组件，步骤进度等内部状态自然归零
  return <TourOverlay />
}

function TourOverlay() {
  const close = useTourStore((s) => s.close)
  const updateSettings = useStore((s) => s.updateSettings)
  const [index, setIndex] = useState(0)
  const [box, setBox] = useState<Box | null>(() => targetBox(TOUR_STEPS[0].selector))
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)

  const step = TOUR_STEPS[index]
  const last = index === TOUR_STEPS.length - 1

  // 结束引导（完成/跳过/Esc 共用）：关浮层并落盘 tourVersion
  const finish = (): void => {
    close()
    void updateSettings({ tourVersion: TOUR_VERSION })
  }
  // 内联函数经 ref 透传给 keydown 监听，避免监听随渲染重挂（同 ui.tsx Modal 模式）
  const finishRef = useRef(finish)
  finishRef.current = finish

  // 步骤切换时重算高亮目标
  useEffect(() => {
    setBox(targetBox(TOUR_STEPS[index].selector))
  }, [index])

  // Esc = 跳过：capture 阶段拦截并阻断冒泡监听（如 QuickCapture），先关引导本身
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        e.preventDefault()
        finishRef.current()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [])

  // 窗口尺寸变化：高亮框跟随目标元素
  useEffect(() => {
    const onResize = (): void => setBox(targetBox(TOUR_STEPS[index].selector))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [index])

  // 气泡先隐藏渲染量出实际高度，再计算坐标落位（避免按估算高度翻转判断出错）
  useLayoutEffect(() => {
    const el = bubbleRef.current
    if (!el) return
    setPos(bubblePosition(box, el.offsetHeight))
  }, [box])

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="新手引导">
      {box ? (
        <div
          className="pointer-events-none absolute rounded-lg border-2 border-accent transition-all duration-200"
          style={{
            left: box.left - SPOT_PADDING,
            top: box.top - SPOT_PADDING,
            width: box.width + SPOT_PADDING * 2,
            height: box.height + SPOT_PADDING * 2,
            boxShadow: '0 0 0 100vmax rgba(0, 0, 0, 0.5)'
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/50" />
      )}
      <div
        ref={bubbleRef}
        className="absolute rounded-xl border border-border bg-surface p-4 shadow-xl"
        style={{
          width: BUBBLE_WIDTH,
          left: pos?.x ?? 0,
          top: pos?.y ?? 0,
          visibility: pos ? 'visible' : 'hidden'
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 truncate text-[14px] font-semibold">{step.title}</div>
          <div className="shrink-0 text-[11px] tabular-nums text-text-3">
            {index + 1} / {TOUR_STEPS.length}
          </div>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-text-2">{step.body}</p>
        <div className="mt-4 flex items-center justify-between">
          {!last && (
            <Button size="sm" variant="ghost" onClick={finish}>
              跳过引导
            </Button>
          )}
          {last && <span />}
          <div className="flex items-center gap-2">
            {index > 0 && (
              <Button size="sm" onClick={() => setIndex(index - 1)}>
                上一步
              </Button>
            )}
            <Button
              size="sm"
              variant="primary"
              onClick={() => (last ? finish() : setIndex(index + 1))}
            >
              {last ? '完成，开始使用' : index === 0 ? '开始引导' : '下一步'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
