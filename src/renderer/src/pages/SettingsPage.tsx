// 设置：数据目录 / 主题 / 全局快捷键 / 关闭行为 / 备份 / 词汇库入口 / 报告模板
import { useState } from 'react'
import {
  Database,
  FileText,
  FolderOpen,
  Keyboard,
  Moon,
  Palette,
  RotateCcw,
  Save,
  SlidersHorizontal
} from 'lucide-react'
import { DEFAULT_REPORT_TEMPLATE, type StyleTheme, type ThemeMode } from '@shared/types'
import { useStore } from '@/store'
import { Badge, Button, Select, Textarea } from '@/components/ui'
import VocabManagerModal from '@/components/VocabManagerModal'
import { cn } from '@/lib/utils'

/** 界面风格主题选项（色板取自 styles.css 中各主题的核心 token） */
const STYLE_THEMES: Array<{
  id: StyleTheme
  name: string
  desc: string
  swatches: string[]
}> = [
  {
    id: 'linear',
    name: '精密高效',
    desc: '靛紫点缀、白卡细边，任务看板等效率组件表现最佳',
    swatches: ['#f7f8f8', '#ffffff', '#e6e8ef', '#5e6ad2']
  },
  {
    id: 'claude',
    name: '学术编辑',
    desc: '陶土暖纸、衬线标题，「格物致知」的书卷气质',
    swatches: ['#f5f4ed', '#faf9f5', '#d1cfc5', '#c96442']
  },
  {
    id: 'notion',
    name: '暖中性极简',
    desc: '白画布配暖灰面板，内容优先、久看不累',
    swatches: ['#ffffff', '#f7f6f3', '#e4e3e0', '#2383e2']
  }
]

/** 报告模板编辑器：本地编辑 + 保存到设置（支持恢复默认） */
function ReportTemplateEditor() {
  const reportTemplate = useStore((s) => s.settings.reportTemplate)
  const updateSettings = useStore((s) => s.updateSettings)
  const [text, setText] = useState(reportTemplate)
  const [savedFlash, setSavedFlash] = useState(false)
  const dirty = text !== reportTemplate

  return (
    <div className="mt-2.5 flex flex-col gap-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        className="font-mono text-[12px]"
        spellCheck={false}
      />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={!dirty}
          onClick={async () => {
            await updateSettings({ reportTemplate: text })
            setSavedFlash(true)
            setTimeout(() => setSavedFlash(false), 2000)
          }}
        >
          <Save size={12.5} /> 保存模板
        </Button>
        <Button
          size="sm"
          onClick={() => setText(DEFAULT_REPORT_TEMPLATE)}
          title="恢复默认模板（未保存前仅重置编辑区）"
        >
          <RotateCcw size={12.5} /> 恢复默认
        </Button>
        {savedFlash && <span className="text-[11.5px] text-success">已保存，下次生成报告生效</span>}
      </div>
    </div>
  )
}

/** 把键盘事件转为 Electron accelerator 文案（支持字母/数字/F1-F12 + 修饰键） */
function eventToAccelerator(e: React.KeyboardEvent): string | null {
  const key = e.key
  const mods: string[] = []
  if (e.altKey) mods.push('Alt')
  if (e.ctrlKey) mods.push('Control')
  if (e.shiftKey) mods.push('Shift')
  if (e.metaKey) mods.push('Super')
  let main: string | null = null
  if (/^[a-zA-Z]$/.test(key)) main = key.toUpperCase()
  else if (/^[0-9]$/.test(key)) main = key
  else if (/^F([1-9]|1[0-2])$/.test(key)) main = key
  else return null // 不支持的键（组合键中间状态）
  return [...mods, main].join('+')
}

function SectionCard({
  icon,
  title,
  children
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-3 flex items-center gap-2 text-[14px] font-semibold">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  )
}

export default function SettingsPage() {
  const settings = useStore((s) => s.settings)
  const dataDir = useStore((s) => s.dataDir)
  const vocab = useStore((s) => s.vocab)
  const chooseDataDir = useStore((s) => s.chooseDataDir)
  const updateSettings = useStore((s) => s.updateSettings)
  const backupNow = useStore((s) => s.backupNow)

  const [capturing, setCapturing] = useState(false)
  const [pendingHotkey, setPendingHotkey] = useState('')
  const [hotkeyMsg, setHotkeyMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [backupMsg, setBackupMsg] = useState<string | null>(null)
  const [vocabOpen, setVocabOpen] = useState(false)

  const saveHotkey = async (): Promise<void> => {
    if (!pendingHotkey) return
    const result = await updateSettings({ hotkey: pendingHotkey })
    if (result.hotkey.startsWith('__CONFLICT__:')) {
      setHotkeyMsg({ ok: false, text: `快捷键「${pendingHotkey}」注册失败：可能被其他软件占用，请换一组组合键` })
    } else {
      setHotkeyMsg({ ok: true, text: `已更新为 ${result.hotkey}，即刻生效` })
    }
    setPendingHotkey('')
    setCapturing(false)
    setTimeout(() => setHotkeyMsg(null), 4000)
  }

  const doBackup = async (): Promise<void> => {
    const result = await backupNow()
    setBackupMsg(
      result.ok ? `已备份到 ${result.dir}` : `备份失败：${result.error ?? '未知错误'}`
    )
    setTimeout(() => setBackupMsg(null), 5000)
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-5 sm:px-6 sm:py-6">
      <h1 className="text-lg font-semibold">设置</h1>

      <SectionCard icon={<FolderOpen size={15} className="text-accent" />} title="数据目录">
        <div className="break-all text-[12.5px] text-text-2">{dataDir ?? '未配置'}</div>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-text-3">
          数据以明文 JSON 存储在该目录，网盘（如坚果云）会自动同步。可直接复制整个目录完成迁移或冷备份；
          更换目录后将加载新目录中的数据。
        </p>
        <div className="mt-3 flex gap-2">
          <Button onClick={() => chooseDataDir()}>更改数据目录…</Button>
          <Button variant="ghost" onClick={() => window.api.openDataDir()}>
            打开数据目录
          </Button>
        </div>
      </SectionCard>

      <SectionCard icon={<SlidersHorizontal size={15} className="text-accent" />} title="标签与节点类型">
        <p className="text-[11.5px] leading-relaxed text-text-3">
          管理任务/灵感的标签库与时间节点的类型（内置类型可改名不可删除，支持自定义类型）。
          录入任务、灵感与节点时也可就地打开管理。
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={() => setVocabOpen(true)}>
            打开管理弹窗
          </Button>
          <span className="text-[11.5px] text-text-3">
            当前：{vocab.tags.length} 个标签 · {vocab.milestoneTypes.length} 种节点类型
          </span>
        </div>
      </SectionCard>

      <SectionCard icon={<Palette size={15} className="text-accent" />} title="外观">
        <div className="text-[12.5px] font-medium">界面风格</div>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-text-3">
          三套设计语言（源自开源设计系统提炼），与明暗模式自由组合，即刻切换全应用换肤。
        </p>
        <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {STYLE_THEMES.map((st) => {
            const active = settings.styleTheme === st.id
            return (
              <button
                key={st.id}
                onClick={() => updateSettings({ styleTheme: st.id })}
                className={cn(
                  'group flex flex-col gap-2 rounded-xl border p-3 text-left transition-colors cursor-pointer',
                  active
                    ? 'border-accent bg-accent-soft/50'
                    : 'border-border bg-surface hover:border-accent/50'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn('text-[13px] font-semibold', active && 'text-accent')}>
                    {st.name}
                  </span>
                  {active && <Badge color="blue">当前</Badge>}
                </div>
                <div className="flex gap-1">
                  {st.swatches.map((c) => (
                    <span
                      key={c}
                      className="h-4 flex-1 rounded-sm border border-black/5"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <span className="text-[11px] leading-relaxed text-text-3">{st.desc}</span>
              </button>
            )
          })}
        </div>
        <div className="mt-3.5 flex items-center gap-3">
          <Moon size={14} className="text-text-3" />
          <Select
            value={settings.theme}
            onChange={(e) => updateSettings({ theme: e.target.value as ThemeMode })}
            className="w-44"
          >
            <option value="system">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </Select>
        </div>
      </SectionCard>

      <SectionCard icon={<Keyboard size={15} className="text-accent" />} title="全局速记快捷键">
        <p className="text-[11.5px] leading-relaxed text-text-3">
          应用运行中（含最小化到托盘）按此快捷键，随时弹出灵感速记框。
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {capturing ? (
            <input
              autoFocus
              readOnly
              value={pendingHotkey || '请按下组合键（需包含 Alt / Ctrl / Shift 之一 + 字母或数字）…'}
              onKeyDown={(e) => {
                e.preventDefault()
                const acc = eventToAccelerator(e)
                if (acc) setPendingHotkey(acc)
              }}
              onBlur={() => {
                if (pendingHotkey) saveHotkey()
                else setCapturing(false)
              }}
              className={cn(
                'h-8.5 w-full max-w-md rounded-lg border px-2.5 text-[13px] focus:outline-none',
                pendingHotkey ? 'border-accent text-text' : 'border-border text-text-3'
              )}
            />
          ) : (
            <kbd className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 font-mono text-[13px]">
              {settings.hotkey}
            </kbd>
          )}
          {!capturing && (
            <Button
              onClick={() => {
                setPendingHotkey('')
                setCapturing(true)
              }}
            >
              修改快捷键
            </Button>
          )}
          {capturing && pendingHotkey && (
            <Button variant="primary" onClick={saveHotkey}>
              <Save size={13} /> 保存
            </Button>
          )}
          {capturing && !pendingHotkey && (
            <Button variant="ghost" onClick={() => setCapturing(false)}>
              取消
            </Button>
          )}
        </div>
        {hotkeyMsg && (
          <div className={cn('mt-2 text-[12px]', hotkeyMsg.ok ? 'text-success' : 'text-danger')}>
            {hotkeyMsg.text}
          </div>
        )}
      </SectionCard>

      <SectionCard icon={<Database size={15} className="text-accent" />} title="数据安全">
        <div className="flex flex-col gap-2.5 text-[12.5px] text-text-2">
          <div className="flex items-center justify-between gap-3">
            <span>关闭窗口时最小化到托盘（保证快捷键速记随时可用）</span>
            <button
              onClick={() => updateSettings({ closeToTray: !settings.closeToTray })}
              className={cn(
                'relative h-5.5 w-10 shrink-0 rounded-full transition-colors cursor-pointer',
                settings.closeToTray ? 'bg-accent' : 'bg-border'
              )}
              title={settings.closeToTray ? '已开启' : '已关闭'}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white transition-all',
                  settings.closeToTray ? 'left-5' : 'left-0.5'
                )}
              />
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              自动备份
              <Badge color="green" className="ml-1.5">已启用</Badge>
            </span>
            <span className="text-[11.5px] text-text-3">
              上次备份：{settings.lastBackupDate ?? '从未'}
            </span>
          </div>
          <p className="text-[11.5px] leading-relaxed text-text-3">
            每日首次运行与应用退出时自动快照到数据目录的{' '}
            <code className="rounded bg-surface-2 px-1">backups/</code>
            （保留最近 30 份）；删除项目等批量操作前也会先备份。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={doBackup}>
              立即备份
            </Button>
            {backupMsg && <span className="text-[11.5px] text-success">{backupMsg}</span>}
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={<FileText size={15} className="text-accent" />} title="周报/月报模板">
        <p className="text-[11.5px] leading-relaxed text-text-3">
          生成报告时按此 Markdown 模板渲染。可用占位符：
          <code className="mx-1 rounded bg-surface-2 px-1">{'{{TITLE}}'}</code>
          <code className="mx-1 rounded bg-surface-2 px-1">{'{{PERIOD}}'}</code>
          <code className="mx-1 rounded bg-surface-2 px-1">{'{{WORK}}'}</code>
          <code className="mx-1 rounded bg-surface-2 px-1">{'{{PLAN}}'}</code>
          <code className="mx-1 rounded bg-surface-2 px-1">{'{{THOUGHTS}}'}</code>
        </p>
        <ReportTemplateEditor />
      </SectionCard>

      <SectionCard icon={<span className="text-[13px]">ℹ️</span>} title="关于">
        <div className="flex flex-col gap-1 text-[12.5px] text-text-2">
          <span>
            格致 · 科研工作台 <Badge className="ml-1">V2.0.0</Badge>
          </span>
          <span className="text-[11.5px] text-text-3">
            「格物致知」—— 一台电脑上的一个应用，装下你全部的科研管理工作。
          </span>
          <Button
            variant="ghost"
            className="mt-1 w-fit px-0 text-danger hover:text-danger"
            onClick={() => window.api.quitApp()}
          >
            退出应用（退出前自动备份）
          </Button>
        </div>
      </SectionCard>

      <VocabManagerModal open={vocabOpen} onClose={() => setVocabOpen(false)} />
    </div>
  )
}
