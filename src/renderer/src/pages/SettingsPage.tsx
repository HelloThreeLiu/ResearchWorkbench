// 设置：数据目录 / 主题 / 全局快捷键 / 关闭行为 / 备份 / 词汇库（标签与节点类型）
import { useMemo, useState } from 'react'
import {
  Database,
  Flag,
  FolderOpen,
  Keyboard,
  Moon,
  Palette,
  Pencil,
  Plus,
  Save,
  Tag,
  Trash2
} from 'lucide-react'
import type { ThemeMode } from '@shared/types'
import { useStore } from '@/store'
import { milestoneTypeIcon } from '@/hooks/useVocab'
import { Badge, Button, IconButton, Input, Select } from '@/components/ui'
import { cn } from '@/lib/utils'

/** 词汇库管理：标签 + 节点类型（内置类型可改名不可删；重命名会级联更新引用处） */
function VocabSection() {
  const vocab = useStore((s) => s.vocab)
  const tasks = useStore((s) => s.tasks)
  const ideas = useStore((s) => s.ideas)
  const milestones = useStore((s) => s.milestones)
  const addTag = useStore((s) => s.addTag)
  const renameTag = useStore((s) => s.renameTag)
  const deleteTag = useStore((s) => s.deleteTag)
  const addMilestoneType = useStore((s) => s.addMilestoneType)
  const renameMilestoneType = useStore((s) => s.renameMilestoneType)
  const deleteMilestoneType = useStore((s) => s.deleteMilestoneType)

  const [newTagName, setNewTagName] = useState('')
  const [newTypeName, setNewTypeName] = useState('')
  const [editingTag, setEditingTag] = useState<string | null>(null)
  const [editTagText, setEditTagText] = useState('')
  const [editingType, setEditingType] = useState<string | null>(null)
  const [editTypeText, setEditTypeText] = useState('')

  const tagUsage = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of tasks) for (const tag of t.tags) map.set(tag, (map.get(tag) ?? 0) + 1)
    for (const i of ideas) for (const tag of i.tags) map.set(tag, (map.get(tag) ?? 0) + 1)
    return map
  }, [tasks, ideas])

  const typeUsage = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of milestones) map.set(m.type, (map.get(m.type) ?? 0) + 1)
    return map
  }, [milestones])

  return (
    <SectionCard icon={<Tag size={15} className="text-accent" />} title="标签与节点类型">
      {/* 标签 */}
      <div className="text-[12.5px] font-medium text-text-2">标签库</div>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-text-3">
        任务与灵感录入时会提示这里的标签；重命名会同步更新所有已引用处。
      </p>
      <div className="mt-2 flex gap-2">
        <Input
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          placeholder="新标签名称，如：实验 / 写作 / 调研"
          className="max-w-xs"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newTagName.trim()) {
              addTag(newTagName)
              setNewTagName('')
            }
          }}
        />
        <Button
          variant="primary"
          disabled={!newTagName.trim()}
          className="shrink-0"
          onClick={() => {
            addTag(newTagName)
            setNewTagName('')
          }}
        >
          <Plus size={13} /> 添加
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {vocab.tags.length === 0 && (
          <span className="text-[11.5px] text-text-3">暂未建立标签库标签（录入时输入的标签仍可直接使用）</span>
        )}
        {vocab.tags.map((tag) =>
          editingTag === tag.id ? (
            <span key={tag.id} className="flex items-center gap-1.5">
              <Input
                autoFocus
                value={editTagText}
                onChange={(e) => setEditTagText(e.target.value)}
                className="h-7 w-32"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    renameTag(tag.id, editTagText)
                    setEditingTag(null)
                  }
                }}
              />
              <IconButton
                title="保存"
                onClick={() => {
                  renameTag(tag.id, editTagText)
                  setEditingTag(null)
                }}
              >
                <Save size={12} />
              </IconButton>
            </span>
          ) : (
            <span
              key={tag.id}
              className="group inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1 text-[12px]"
            >
              #{tag.name}
              {(tagUsage.get(tag.name) ?? 0) > 0 && (
                <span className="text-[10px] text-text-3">{tagUsage.get(tag.name)} 引用</span>
              )}
              <button
                className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-accent cursor-pointer"
                title="重命名（级联更新引用）"
                onClick={() => {
                  setEditingTag(tag.id)
                  setEditTagText(tag.name)
                }}
              >
                <Pencil size={10.5} />
              </button>
              <button
                className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger cursor-pointer"
                title="从标签库移除（不影响已有数据）"
                onClick={() => deleteTag(tag.id)}
              >
                <Trash2 size={10.5} />
              </button>
            </span>
          )
        )}
      </div>

      {/* 节点类型 */}
      <div className="mt-5 text-[12.5px] font-medium text-text-2">节点类型</div>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-text-3">
        内置类型可改名、不可删除；自定义类型被引用时无法删除（显示引用数），删除后其节点回退为「其他」。
      </p>
      <div className="mt-2 flex gap-2">
        <Input
          value={newTypeName}
          onChange={(e) => setNewTypeName(e.target.value)}
          placeholder="新类型名称，如：Rebuttal / 基金申报 / 预答辩"
          className="max-w-xs"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newTypeName.trim()) {
              addMilestoneType(newTypeName)
              setNewTypeName('')
            }
          }}
        />
        <Button
          variant="primary"
          disabled={!newTypeName.trim()}
          className="shrink-0"
          onClick={() => {
            addMilestoneType(newTypeName)
            setNewTypeName('')
          }}
        >
          <Plus size={13} /> 添加
        </Button>
      </div>
      <div className="mt-3 flex flex-col divide-y divide-border rounded-xl border border-border">
        {vocab.milestoneTypes.map((t) => {
          const Icon = milestoneTypeIcon(t.id)
          const usage = typeUsage.get(t.id) ?? 0
          const deletable = !t.builtin && usage === 0
          return (
            <div key={t.id} className="flex items-center gap-2.5 px-3 py-2">
              <Icon size={14} className="shrink-0 text-accent" />
              {editingType === t.id ? (
                <>
                  <Input
                    autoFocus
                    value={editTypeText}
                    onChange={(e) => setEditTypeText(e.target.value)}
                    className="h-7 w-40"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        renameMilestoneType(t.id, editTypeText)
                        setEditingType(null)
                      }
                    }}
                  />
                  <IconButton
                    title="保存"
                    onClick={() => {
                      renameMilestoneType(t.id, editTypeText)
                      setEditingType(null)
                    }}
                  >
                    <Save size={12} />
                  </IconButton>
                </>
              ) : (
                <>
                  <span className="flex-1 text-[12.5px]">{t.name}</span>
                  {t.builtin ? (
                    <Badge color="gray">内置</Badge>
                  ) : (
                    <Badge color={usage > 0 ? 'blue' : 'gray'}>{usage} 节点引用</Badge>
                  )}
                  <IconButton
                    title="重命名"
                    onClick={() => {
                      setEditingType(t.id)
                      setEditTypeText(t.name)
                    }}
                  >
                    <Pencil size={12.5} />
                  </IconButton>
                  <IconButton
                    title={t.builtin ? '内置类型不可删除' : deletable ? '删除（节点回退为「其他」）' : '有节点引用，不可删除'}
                    disabled={!deletable}
                    className={cn(!deletable && 'opacity-30', deletable && 'hover:text-danger')}
                    onClick={() => deletable && deleteMilestoneType(t.id)}
                  >
                    <Trash2 size={12.5} />
                  </IconButton>
                </>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-2 flex items-center gap-1 text-[11px] text-text-3">
        <Flag size={10.5} />
        新建/编辑节点时也可在类型下拉中直接「＋ 新建类型…」
      </p>
    </SectionCard>
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
  const chooseDataDir = useStore((s) => s.chooseDataDir)
  const updateSettings = useStore((s) => s.updateSettings)
  const backupNow = useStore((s) => s.backupNow)

  const [capturing, setCapturing] = useState(false)
  const [pendingHotkey, setPendingHotkey] = useState('')
  const [hotkeyMsg, setHotkeyMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [backupMsg, setBackupMsg] = useState<string | null>(null)

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
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-5 sm:px-7 sm:py-6">
      <h1 className="text-lg font-semibold">设置</h1>

      <SectionCard icon={<FolderOpen size={15} className="text-accent" />} title="数据目录">
        <div className="text-[12.5px] text-text-2">{dataDir ?? '未配置'}</div>
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

      <SectionCard icon={<Palette size={15} className="text-accent" />} title="外观">
        <div className="flex items-center gap-3">
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
        <div className="mt-3 flex items-center gap-3">
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
                'h-8.5 w-72 rounded-lg border px-2.5 text-[13px] focus:outline-none',
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
          <div className="flex items-center justify-between">
            <span>关闭窗口时最小化到托盘（保证快捷键速记随时可用）</span>
            <button
              onClick={() => updateSettings({ closeToTray: !settings.closeToTray })}
              className={cn(
                'relative h-5.5 w-10 rounded-full transition-colors cursor-pointer',
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
          <div className="flex items-center justify-between">
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
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={doBackup}>
              立即备份
            </Button>
            {backupMsg && <span className="text-[11.5px] text-success">{backupMsg}</span>}
          </div>
        </div>
      </SectionCard>

      <VocabSection />

      <SectionCard icon={<span className="text-[13px]">ℹ️</span>} title="关于">
        <div className="flex flex-col gap-1 text-[12.5px] text-text-2">
          <span>
            格致 · 科研工作台 <Badge className="ml-1">V1.0.0</Badge>
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
    </div>
  )
}
