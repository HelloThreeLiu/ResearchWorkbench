
import { FolderOpen, RefreshCw } from 'lucide-react'
import { useStore } from '@/store'
import { Button } from '@/components/ui'

export default function Onboarding() {
  const chooseDataDir = useStore((s) => s.chooseDataDir)

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-bg px-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-3xl font-bold text-white">
        格
      </div>
      <div>
        <h1 className="text-xl font-semibold">欢迎使用格致 · 科研工作台</h1>
        <p className="mt-2 max-w-md text-[13px] leading-relaxed text-text-2">
          项目、任务、时间节点、灵感、进展日志——一台电脑上的一个应用，装下你全部的科研管理工作。
        </p>
      </div>
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-5 text-left">
        <div className="text-[13.5px] font-medium">第一步：选择数据存储目录</div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-text-2">
          数据以明文 JSON 保存在你选择的目录。建议选择<strong>坚果云等网盘同步目录</strong>
          （如 <code className="rounded bg-surface-2 px-1">…\Nutstore\1\格致科研工作台</code>
          ），数据将自动同步到你的其他电脑；也可以选择任意本地目录，之后可在设置中更改。
        </p>
        <div className="mt-4 flex items-center gap-3">
          <Button variant="primary" onClick={() => chooseDataDir()}>
            <FolderOpen size={14} />
            选择数据目录
          </Button>
          <span className="flex items-center gap-1 text-[11.5px] text-text-3">
            <RefreshCw size={11} />
            目录为空时会自动初始化
          </span>
        </div>
      </div>
    </div>
  )
}
