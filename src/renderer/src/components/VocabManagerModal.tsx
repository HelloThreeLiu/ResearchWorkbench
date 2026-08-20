// 词汇库管理弹窗：标签库 / 节点类型 / 成果类型（独立弹窗，多处入口复用）
// 内置类型可改名不可删除；重命名标签会级联更新任务/灵感中的引用
import { useMemo, useState } from 'react'
import { Flag, Pencil, Plus, Save, Tag, Trash2, Trophy } from 'lucide-react'
import { useStore } from '@/store'
import { achievementTypeIcon, milestoneTypeIcon } from '@/hooks/useVocab'
import { Badge, Button, IconButton, Input, Modal } from '@/components/ui'
import { cn } from '@/lib/utils'

interface VocabManagerModalProps {
  open: boolean
  onClose: () => void
  /** 打开后默认聚焦的区域 */
  initialTab?: 'tags' | 'types' | 'achievementTypes'
}

type TabKey = 'tags' | 'types' | 'achievementTypes'

export default function VocabManagerModal({ open, onClose, initialTab = 'tags' }: VocabManagerModalProps) {
  const [tab, setTab] = useState<TabKey>(initialTab)

  const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
    { key: 'tags', label: '标签库', icon: <Tag size={13} /> },
    { key: 'types', label: '节点类型', icon: <Flag size={13} /> },
    { key: 'achievementTypes', label: '成果类型', icon: <Trophy size={13} /> }
  ]

  return (
    <Modal open={open} onClose={onClose} title="词汇库管理" width="max-w-2xl">
      {/* Tab 切换 */}
      <div className="mb-4 flex gap-1 rounded-lg bg-surface-2 p-1">
        {TABS.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[13px] transition-colors cursor-pointer',
              tab === key ? 'bg-surface font-medium text-accent shadow-sm' : 'text-text-2 hover:text-text'
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
      {tab === 'tags' && <TagsPanel />}
      {tab === 'types' && <TypesPanel kind="milestone" />}
      {tab === 'achievementTypes' && <TypesPanel kind="achievement" />}
    </Modal>
  )
}

// ---------- 标签库 ----------
function TagsPanel() {
  const vocab = useStore((s) => s.vocab)
  const tasks = useStore((s) => s.tasks)
  const ideas = useStore((s) => s.ideas)
  const addTag = useStore((s) => s.addTag)
  const renameTag = useStore((s) => s.renameTag)
  const deleteTag = useStore((s) => s.deleteTag)

  const [newTagName, setNewTagName] = useState('')
  const [editingTag, setEditingTag] = useState<string | null>(null)
  const [editTagText, setEditTagText] = useState('')

  const tagUsage = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of tasks) for (const tag of t.tags) map.set(tag, (map.get(tag) ?? 0) + 1)
    for (const i of ideas) for (const tag of i.tags) map.set(tag, (map.get(tag) ?? 0) + 1)
    return map
  }, [tasks, ideas])

  return (
    <div>
      <p className="text-[11.5px] leading-relaxed text-text-3">
        任务与灵感录入时会提示这里的标签；重命名会同步更新所有已引用处，移除不影响已有数据。
      </p>
      <div className="mt-3 flex gap-2">
        <Input
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          placeholder="新标签名称，如：实验 / 写作 / 调研"
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
      <div className="mt-3 flex max-h-72 flex-wrap gap-1.5 overflow-y-auto">
        {vocab.tags.length === 0 && (
          <span className="py-4 text-center text-[12px] text-text-3">
            暂未建立标签库标签（录入时输入的标签仍可直接使用）
          </span>
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
    </div>
  )
}

// ---------- 类型面板（节点类型 / 成果类型） ----------
function TypesPanel({ kind }: { kind: 'milestone' | 'achievement' }) {
  const vocab = useStore((s) => s.vocab)
  const milestones = useStore((s) => s.milestones)
  const achievements = useStore((s) => s.achievements)
  const addMilestoneType = useStore((s) => s.addMilestoneType)
  const renameMilestoneType = useStore((s) => s.renameMilestoneType)
  const deleteMilestoneType = useStore((s) => s.deleteMilestoneType)
  const addAchievementType = useStore((s) => s.addAchievementType)
  const renameAchievementType = useStore((s) => s.renameAchievementType)
  const deleteAchievementType = useStore((s) => s.deleteAchievementType)

  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const isMilestone = kind === 'milestone'
  const types = isMilestone ? vocab.milestoneTypes : vocab.achievementTypes
  const entityLabel = isMilestone ? '节点' : '成果'
  const add = isMilestone ? addMilestoneType : addAchievementType
  const rename = isMilestone ? renameMilestoneType : renameAchievementType
  const remove = isMilestone ? deleteMilestoneType : deleteAchievementType

  const usage = useMemo(() => {
    const map = new Map<string, number>()
    if (isMilestone) {
      for (const m of milestones) map.set(m.type, (map.get(m.type) ?? 0) + 1)
    } else {
      for (const a of achievements) map.set(a.type, (map.get(a.type) ?? 0) + 1)
    }
    return map
  }, [isMilestone, milestones, achievements])

  return (
    <div>
      <p className="text-[11.5px] leading-relaxed text-text-3">
        内置类型可改名、不可删除；自定义类型被{entityLabel}引用时无法删除（显示引用数），删除后对应
        {entityLabel}回退为「其他」。
      </p>
      <div className="mt-3 flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={isMilestone ? '新类型名称，如：Rebuttal / 基金申报 / 预答辩' : '新类型名称，如：软件著作权 / 竞赛 / 奖学金'}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newName.trim()) {
              add(newName)
              setNewName('')
            }
          }}
        />
        <Button
          variant="primary"
          disabled={!newName.trim()}
          className="shrink-0"
          onClick={() => {
            add(newName)
            setNewName('')
          }}
        >
          <Plus size={13} /> 添加
        </Button>
      </div>
      <div className="mt-3 flex max-h-72 flex-col divide-y divide-border overflow-y-auto rounded-xl border border-border">
        {types.map((t) => {
          const Icon = isMilestone ? milestoneTypeIcon(t.id) : achievementTypeIcon(t.id)
          const count = usage.get(t.id) ?? 0
          const deletable = !t.builtin && count === 0
          return (
            <div key={t.id} className="flex items-center gap-2.5 px-3 py-2">
              <Icon size={14} className="shrink-0 text-accent" />
              {editingId === t.id ? (
                <>
                  <Input
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="h-7 w-40"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        rename(t.id, editText)
                        setEditingId(null)
                      }
                    }}
                  />
                  <IconButton
                    title="保存"
                    onClick={() => {
                      rename(t.id, editText)
                      setEditingId(null)
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
                    <Badge color={count > 0 ? 'blue' : 'gray'}>
                      {count} {entityLabel}引用
                    </Badge>
                  )}
                  <IconButton
                    title="重命名"
                    onClick={() => {
                      setEditingId(t.id)
                      setEditText(t.name)
                    }}
                  >
                    <Pencil size={12.5} />
                  </IconButton>
                  <IconButton
                    title={
                      t.builtin
                        ? '内置类型不可删除'
                        : deletable
                          ? `删除（${entityLabel}回退为「其他」）`
                          : `有${entityLabel}引用，不可删除`
                    }
                    disabled={!deletable}
                    className={cn(!deletable && 'opacity-30', deletable && 'hover:text-danger')}
                    onClick={() => deletable && remove(t.id)}
                  >
                    <Trash2 size={12.5} />
                  </IconButton>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
