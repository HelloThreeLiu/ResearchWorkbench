import { useNav, type Page } from '@/nav'
import { useStore } from '@/store'
import { useUpdateStore } from '@/updateStore'
import { cn } from '@/lib/utils'
import {
  CalendarDays,
  ClipboardList,
  FileText,
  Flag,
  FolderKanban,
  ListTodo,
  Lightbulb,
  Settings,
  Trophy,
  Wrench,
  Zap
} from 'lucide-react'

const NAV_ITEMS: Array<{ page: Page; label: string; icon: typeof Zap }> = [
  { page: { name: 'dashboard' }, label: '今日概览', icon: Zap },
  { page: { name: 'projects' }, label: '项目', icon: FolderKanban },
  { page: { name: 'tasks' }, label: '任务', icon: ListTodo },
  { page: { name: 'calendar' }, label: '日历', icon: CalendarDays },
  { page: { name: 'milestones' }, label: '时间节点', icon: Flag },
  { page: { name: 'ideas' }, label: '灵感', icon: Lightbulb },
  { page: { name: 'tools' }, label: '工具箱', icon: Wrench }
]

const V2_NAV_ITEMS: Array<{ page: Page; label: string; icon: typeof Zap }> = [
  { page: { name: 'papers' }, label: '论文投稿', icon: FileText },
  { page: { name: 'achievements' }, label: '成果台账', icon: Trophy },
  { page: { name: 'reports' }, label: '汇报中心', icon: ClipboardList }
]

export default function Sidebar() {
  const page = useNav((s) => s.page)
  const navigate = useNav((s) => s.navigate)
  const hotkey = useStore((s) => s.settings.hotkey)
  const hasUpdate = useUpdateStore((s) => s.available !== null)

  return (
    <aside className="flex h-full w-48 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-[15px] font-bold text-white">
          格
        </div>
        <div>
          <div className="text-[13.5px] font-semibold leading-tight">格致</div>
          <div className="text-[10.5px] leading-tight text-text-3">科研工作台</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5">
        {NAV_ITEMS.map((item) => {
          const active = page.name === item.page.name
          const Icon = item.icon
          return (
            <button
              key={item.page.name}
              onClick={() => navigate(item.page)}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors cursor-pointer',
                active
                  ? 'bg-accent-soft font-medium text-accent'
                  : 'text-text-2 hover:bg-surface-2 hover:text-text'
              )}
            >
              <Icon size={15.5} strokeWidth={active ? 2.2 : 1.8} />
              {item.label}
            </button>
          )
        })}
        <div className="my-1.5 border-t border-border" />
        {V2_NAV_ITEMS.map((item) => {
          const active = page.name === item.page.name
          const Icon = item.icon
          return (
            <button
              key={item.page.name}
              onClick={() => navigate(item.page)}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors cursor-pointer',
                active
                  ? 'bg-accent-soft font-medium text-accent'
                  : 'text-text-2 hover:bg-surface-2 hover:text-text'
              )}
            >
              <Icon size={15.5} strokeWidth={active ? 2.2 : 1.8} />
              {item.label}
            </button>
          )
        })}
      </nav>

      <div className="border-t border-border px-4 py-3">
        <button
          onClick={() => navigate({ name: 'settings' })}
          title={hasUpdate ? '设置（有新版本可用）' : '设置'}
          className={cn(
            'relative flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-[13px] transition-colors cursor-pointer',
            page.name === 'settings'
              ? 'font-medium text-accent'
              : 'text-text-2 hover:text-text'
          )}
        >
          <Settings size={15.5} strokeWidth={1.8} />
          设置
          {hasUpdate && (
            <span className="absolute right-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-danger" />
          )}
        </button>
        <div className="mt-2.5 rounded-lg bg-surface-2 px-2.5 py-2 text-[10.5px] leading-relaxed text-text-3">
          按 <kbd className="rounded border border-border bg-surface px-1 font-mono">{hotkey}</kbd>{' '}
          随手记灵感
        </div>
      </div>
    </aside>
  )
}
