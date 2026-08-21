// 更新提示卡：启动静默检查发现新版本时在右上角滑出，含“查看更新”入口；忽略仅本次会话生效
import { ArrowUpCircle, X } from 'lucide-react'
import { useUpdateStore } from '@/updateStore'
import { Button } from '@/components/ui'

export default function UpdateNotice() {
  const available = useUpdateStore((s) => s.available)
  const noticeVisible = useUpdateStore((s) => s.noticeVisible)
  const dismissNotice = useUpdateStore((s) => s.dismissNotice)
  const openModalWithCheck = useUpdateStore((s) => s.openModalWithCheck)

  if (!noticeVisible || !available) return null

  return (
    <div className="update-notice fixed right-4 top-4 z-40 w-72 rounded-xl border border-border bg-surface p-3.5 shadow-lg">
      <div className="flex items-start gap-2.5">
        <ArrowUpCircle size={17} className="mt-0.5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium">发现新版本 V{available.version}</div>
          <div className="mt-0.5 text-[11.5px] leading-relaxed text-text-3">
            建议更新以获得最新功能与修复，更新不会影响你的数据。
          </div>
        </div>
        <button
          title="忽略（本次运行内不再提醒，仍可在 设置 → 关于 检查）"
          onClick={dismissNotice}
          className="shrink-0 cursor-pointer rounded-md p-0.5 text-text-3 transition-colors hover:bg-surface-2 hover:text-text"
        >
          <X size={14} />
        </button>
      </div>
      <div className="mt-3 flex justify-end">
        <Button size="sm" variant="primary" onClick={() => void openModalWithCheck()}>
          查看更新
        </Button>
      </div>
    </div>
  )
}
