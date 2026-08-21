// 首次启动引导：选择数据存储目录（唯一一步）；全部使用语义 token，随界面风格主题换肤
import { ClipboardList, Flag, FolderKanban, FolderOpen, Lightbulb, RefreshCw } from 'lucide-react'
import { useStore } from '@/store'
import { Button } from '@/components/ui'

const FEATURES = [
  { icon: FolderKanban, title: '项目与任务', desc: '拖拽看板流转状态，进展日志按日沉淀' },
  { icon: Flag, title: '关键时间节点', desc: '开题、投稿截止、答辩，全程倒计时' },
  { icon: Lightbulb, title: '灵感速记', desc: '全局快捷键随手记，一键转为任务' },
  { icon: ClipboardList, title: '产出与汇报', desc: '投稿跟踪、成果台账、周报月报生成' }
]

export default function Onboarding() {
  const chooseDataDir = useStore((s) => s.chooseDataDir)

  return (
    <div className="flex h-full flex-col items-center justify-center overflow-y-auto bg-bg px-8 py-10">
      <div className="flex w-full max-w-[520px] flex-col items-center text-center">
        {/* 品牌 */}
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-3xl font-bold text-white shadow-md">
          格
        </div>
        <h1 className="mt-5 text-[22px] font-semibold leading-snug">欢迎使用格致 · 科研工作台</h1>
        <p className="mt-2 max-w-md text-[13px] leading-relaxed text-text-2">
          项目、任务、时间节点、灵感、进展日志——一台电脑上的一个应用，装下你全部的科研管理工作。
        </p>

        {/* 能力一览 */}
        <div className="mt-6 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="flex items-start gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-3 text-left"
            >
              <f.icon size={16} className="mt-0.5 shrink-0 text-accent" strokeWidth={1.9} />
              <div className="min-w-0">
                <div className="text-[13px] font-medium">{f.title}</div>
                <div className="mt-0.5 text-[11.5px] leading-relaxed text-text-3">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* 唯一一步：选择数据目录 */}
        <div className="mt-4 w-full rounded-xl border border-border bg-surface p-5 text-left shadow-sm">
          <div className="flex items-center gap-2 text-[13.5px] font-semibold">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-accent-soft text-[11px] font-bold text-accent">
              1
            </span>
            选择数据存储目录
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-text-2">
            数据以<strong className="font-semibold text-text">明文 JSON</strong>{' '}
            保存在你选择的目录，完全属于你。建议选择
            <strong className="font-semibold text-text">坚果云等网盘同步目录</strong>
            （如 <code className="rounded bg-surface-2 px-1 py-px font-mono text-[11.5px]">…\Nutstore\1\格致科研工作台</code>
            ），数据将自动同步到你的其他电脑；也可以选择任意本地目录，之后可在设置中更改。
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="primary" className="h-9.5 px-5 text-[13.5px]" onClick={() => chooseDataDir()}>
              <FolderOpen size={15} />
              选择数据目录
            </Button>
            <span className="flex items-center gap-1.5 text-[11.5px] text-text-3">
              <RefreshCw size={11.5} />
              目录为空时会自动初始化
            </span>
          </div>
        </div>

        <div className="mt-5 text-[11px] text-text-3">
          单机桌面应用 · 数据本地明文 JSON 存储 · 无账号 · 无云端
        </div>
      </div>
    </div>
  )
}
