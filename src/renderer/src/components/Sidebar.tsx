// 侧边栏（V3 §3.1：224px，三组分区 + 选中指示条 + 底部速记提示）
import { useNav, type Page } from '@/nav'
import { useStore } from '@/store'
import { useUpdateStore } from '@/updateStore'
import { cn } from '@/lib/utils'
import {
  CalendarDays,
  ChartColumn,
  ClipboardList,
  FileText,
  Flag,
  FolderKanban,
  Lightbulb,
  ListTodo,
  Settings,
  Trophy,
  Wrench,
  Zap
} from 'lucide-react'

type NavItem = { page: Page; label: string; icon: typeof Zap }

/** 三组导航：工作台 / 科研推进 / 成果与汇报 */
const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: '工作台',
    items: [{ page: { name: 'dashboard' }, label: '今日概览', icon: Zap }]
  },
  {
    label: '科研推进',
    items: [
      { page: { name: 'projects' }, label: '项目', icon: FolderKanban },
      { page: { name: 'tasks' }, label: '任务', icon: ListTodo },
      { page: { name: 'calendar' }, label: '日历', icon: CalendarDays },
      { page: { name: 'milestones' }, label: '时间节点', icon: Flag },
      { page: { name: 'ideas' }, label: '灵感', icon: Lightbulb },
      { page: { name: 'tools' }, label: '工具箱', icon: Wrench }
    ]
  },
  {
    label: '成果与汇报',
    items: [
      { page: { name: 'papers' }, label: '论文投稿', icon: FileText },
      { page: { name: 'achievements' }, label: '成果台账', icon: Trophy },
      { page: { name: 'reports' }, label: '汇报中心', icon: ClipboardList },
      { page: { name: 'insights' }, label: '回顾', icon: ChartColumn }
    ]
  }
]

function NavButton({ item, active }: { item: NavItem; active: boolean }) {
  const navigate = useNav((s) => s.navigate)
  const Icon = item.icon
  return (
    <button
      onClick={() => navigate(item.page)}
      className={cn(
        'relative flex h-8.5 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors cursor-pointer',
        '[&_svg]:h-4 [&_svg]:w-4 [&_svg]:stroke-[1.8]',
        active
          ? 'bg-accent-soft font-semibold text-accent [&_svg]:stroke-[2.1]'
          : 'text-text-2 hover:bg-surface-2 hover:text-text',
        // 选中指示条（贴住侧边栏左缘）
        active &&
          "before:absolute before:-left-3 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r-full before:bg-accent before:content-['']"
      )}
    >
      <Icon />
      {item.label}
    </button>
  )
}

export default function Sidebar() {
  const page = useNav((s) => s.page)
  const navigate = useNav((s) => s.navigate)
  const hotkey = useStore((s) => s.settings.hotkey)
  const hasUpdate = useUpdateStore((s) => s.available !== null)

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border bg-surface">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4.5 pt-4.5 pb-3.5">
        <div className="flex h-9.5 w-9.5 items-center justify-center rounded-lg bg-accent text-[17px] font-bold text-white">
          格
        </div>
        <div>
          <div className="font-display text-[14.5px] leading-tight font-bold">格致</div>
          <div className="text-[11px] leading-[1.5] text-text-3">科研工作台</div>
        </div>
      </div>

      {/* 分组导航 */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="contents">
            <div className="px-2.5 pt-3.5 pb-1 text-[11px] font-semibold tracking-widest text-text-3">
              {group.label}
            </div>
            {group.items.map((item) => (
              <NavButton key={item.page.name} item={item} active={page.name === item.page.name} />
            ))}
          </div>
        ))}
      </nav>

      {/* 底部：设置 + 速记提示 */}
      <div className="border-t border-border px-3 pt-2.5 pb-3">
        <button
          onClick={() => navigate({ name: 'settings' })}
          title={hasUpdate ? '设置（有新版本可用）' : '设置'}
          className={cn(
            'relative flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors cursor-pointer',
            '[&_svg]:h-4 [&_svg]:w-4 [&_svg]:stroke-[1.8]',
            page.name === 'settings'
              ? 'bg-accent-soft font-semibold text-accent [&_svg]:stroke-[2.1]'
              : 'text-text-2 hover:bg-surface-2 hover:text-text',
            page.name === 'settings' &&
              "before:absolute before:-left-3 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r-full before:bg-accent before:content-['']"
          )}
        >
          <Settings />
          设置
          {hasUpdate && (
            <span
              className="ml-auto h-1.5 w-1.5 rounded-full bg-danger"
              title="有新版本可用"
            />
          )}
        </button>
        <div className="mt-2 rounded-lg bg-surface-2 px-2.5 py-2 text-[11px] leading-[1.7] text-text-3">
          按 <kbd className="kbd">{hotkey}</kbd> 随手记灵感
          <br />
          数据自动同步网盘 · 单机存储
        </div>
      </div>
    </aside>
  )
}
