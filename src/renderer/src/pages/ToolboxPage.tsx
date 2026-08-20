// 工具箱：网址/文件/文件夹/程序收藏，分组管理，拖拽调整分组，失效检测
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  File,
  Folder,
  FolderPlus,
  Globe,
  Link2,
  Monitor,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Wrench
} from 'lucide-react'
import type { ToolBookmark, ToolType } from '@shared/types'
import { TOOL_TYPE_LABELS } from '@shared/types'
import { useStore } from '@/store'
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  Select,
  Textarea
} from '@/components/ui'
import { cn } from '@/lib/utils'

const TYPE_ICONS: Record<ToolType, typeof Globe> = {
  url: Globe,
  file: File,
  folder: Folder,
  app: Monitor
}

/** 网址收藏图标：直连站点 favicon，失败回退默认图标 */
function ToolIcon({ item }: { item: ToolBookmark }) {
  const [failed, setFailed] = useState(false)
  const Icon = TYPE_ICONS[item.type]
  if (item.type === 'url' && !failed) {
    let fav: string | null = null
    try {
      fav = new URL('/favicon.ico', item.target).toString()
    } catch {
      fav = null
    }
    if (fav) {
      return (
        <img
          src={fav}
          alt=""
          width={18}
          height={18}
          className="shrink-0 rounded-sm"
          onError={() => setFailed(true)}
        />
      )
    }
  }
  return <Icon size={18} className="shrink-0 text-text-2" />
}

export default function ToolboxPage() {
  const tools = useStore((s) => s.tools)
  const addToolItem = useStore((s) => s.addToolItem)
  const updateToolItem = useStore((s) => s.updateToolItem)
  const deleteToolItem = useStore((s) => s.deleteToolItem)
  const moveToolItem = useStore((s) => s.moveToolItem)
  const addToolGroup = useStore((s) => s.addToolGroup)
  const renameToolGroup = useStore((s) => s.renameToolGroup)
  const deleteToolGroup = useStore((s) => s.deleteToolGroup)
  const reorderToolGroups = useStore((s) => s.reorderToolGroups)

  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ToolBookmark | null>(null)
  const [groupModal, setGroupModal] = useState<'add' | null>(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<string | null>(null)
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  /** 本地收藏项有效性（路径是否存在） */
  const [validity, setValidity] = useState<Record<string, boolean>>({})
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null)
  const validityTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const checkValidity = useCallback(async (): Promise<void> => {
    const localItems = tools.items.filter((i) => i.type !== 'url')
    const entries = await Promise.all(
      localItems.map(async (i) => [i.id, await window.api.pathExists(i.target)] as const)
    )
    setValidity(Object.fromEntries(entries))
  }, [tools.items])

  useEffect(() => {
    checkValidity()
    validityTimer.current = setInterval(checkValidity, 60_000)
    return () => {
      if (validityTimer.current) clearInterval(validityTimer.current)
    }
  }, [checkValidity])

  const groups = useMemo(() => [...tools.groups].sort((a, b) => a.sort - b.sort), [tools.groups])
  const itemsByGroup = useMemo(() => {
    const map = new Map<string | null, ToolBookmark[]>()
    for (const item of tools.items) {
      const key = item.group_id
      const list = map.get(key) ?? []
      list.push(item)
      map.set(key, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.sort - b.sort)
    return map
  }, [tools.items])

  const openTool = async (item: ToolBookmark): Promise<void> => {
    if (item.type === 'url') {
      await window.api.openExternal(item.target)
    } else {
      const err = await window.api.openPath(item.target)
      if (err) {
        // 打开失败时刷新有效性展示
        checkValidity()
        alert(`无法打开「${item.name}」：${err}`)
      }
    }
  }

  const moveGroup = (groupId: string, direction: -1 | 1): void => {
    const idx = groups.findIndex((g) => g.id === groupId)
    const target = idx + direction
    if (target < 0 || target >= groups.length) return
    const ordered = [...groups.map((g) => g.id)]
    ;[ordered[idx], ordered[target]] = [ordered[target], ordered[idx]]
    reorderToolGroups(ordered)
  }

  const dropOnGroup = (groupId: string | null): void => {
    if (draggingId) {
      moveToolItem(draggingId, groupId)
    }
    setDraggingId(null)
    setDragOverGroup(null)
  }

  const renderItems = (items: ToolBookmark[]): React.ReactNode => (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => {
        const invalid = item.type !== 'url' && validity[item.id] === false
        return (
          <div
            key={item.id}
            draggable
            onDragStart={() => setDraggingId(item.id)}
            onDragEnd={() => {
              setDraggingId(null)
              setDragOverGroup(null)
            }}
            className={cn(
              'group flex cursor-pointer flex-col gap-2 rounded-xl border bg-surface p-3 transition-all',
              invalid
                ? 'border-border opacity-55 grayscale'
                : 'border-border hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-sm',
              draggingId === item.id && 'opacity-40'
            )}
            onClick={() => openTool(item)}
            title={invalid ? '路径不存在，点击「重新指定」' : item.target}
          >
            <div className="flex items-start gap-2">
              <ToolIcon item={item} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{item.name}</div>
                <div className="truncate text-[10.5px] text-text-3" title={item.target}>
                  {invalid ? (
                    <span className="text-danger">路径不存在</span>
                  ) : (
                    item.target.replace(/^https?:\/\//, '').replace(/^file:\/\//, '')
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-text-3">
                {TOOL_TYPE_LABELS[item.type]}
              </span>
              <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
                {invalid && (
                  <IconButton
                    title="重新指定路径"
                    className="h-6 w-6"
                    onClick={() => setEditTarget(item)}
                  >
                    <Link2 size={12.5} />
                  </IconButton>
                )}
                <IconButton title="编辑" className="h-6 w-6" onClick={() => setEditTarget(item)}>
                  <Pencil size={12.5} />
                </IconButton>
                <IconButton
                  title="删除"
                  className="h-6 w-6 hover:text-danger"
                  onClick={() => deleteToolItem(item.id)}
                >
                  <Trash2 size={12.5} />
                </IconButton>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )

  const groupSection = (groupId: string | null, label: string, extra?: React.ReactNode): React.ReactNode => {
    const items = itemsByGroup.get(groupId) ?? []
    return (
      <section
        onDragOver={(e) => {
          e.preventDefault()
          setDragOverGroup(groupId)
        }}
        onDragLeave={() => setDragOverGroup(null)}
        onDrop={() => dropOnGroup(groupId)}
        className={cn(
          'rounded-xl p-1 transition-colors',
          dragOverGroup === groupId && draggingId && 'bg-accent-soft ring-1 ring-accent/40'
        )}
      >
        <div className="mb-2 flex items-center gap-1.5 px-1">
          <h2 className="text-[13px] font-semibold text-text-2">{label}</h2>
          <span className="text-[11px] text-text-3">{items.length}</span>
          {extra}
        </div>
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[11.5px] text-text-3">
            拖拽收藏项到这里，或点击右上角「新增收藏」
          </div>
        ) : (
          renderItems(items)
        )}
      </section>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-7 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">工具箱</h1>
          <p className="mt-0.5 text-[12px] text-text-3">
            文献数据库、计算平台、VPN、数据集目录……常用入口集中放这里（点击即打开）
          </p>
        </div>
        <div className="flex gap-2">
          <IconButton title="刷新有效性检测" onClick={() => checkValidity()} className="h-8 w-8 border border-border">
            <RefreshCw size={14} />
          </IconButton>
          <Button onClick={() => setGroupModal('add')}>
            <FolderPlus size={14} /> 新建分组
          </Button>
          <Button variant="primary" onClick={() => setAddOpen(true)}>
            <Plus size={14} /> 新增收藏
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-5">
        {groups.map((g) =>
          groupSection(
            g.id,
            g.name,
            <div className="ml-1.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <IconButton
                title="上移分组"
                className="h-5 w-5"
                onClick={() => moveGroup(g.id, -1)}
              >
                <ArrowUp size={11} />
              </IconButton>
              <IconButton
                title="下移分组"
                className="h-5 w-5"
                onClick={() => moveGroup(g.id, 1)}
              >
                <ArrowDown size={11} />
              </IconButton>
              <IconButton
                title="重命名分组"
                className="h-5 w-5"
                onClick={() => {
                  setRenamingGroup(g.id)
                  setRenameText(g.name)
                }}
              >
                <Pencil size={11} />
              </IconButton>
              <IconButton
                title="删除分组（收藏项移入未分组）"
                className="h-5 w-5 hover:text-danger"
                onClick={() => setDeleteGroupTarget(g.id)}
              >
                <Trash2 size={11} />
              </IconButton>
            </div>
          )
        )}
        {groupSection(null, '未分组')}
      </div>

      {tools.items.length === 0 && (
        <EmptyState
          icon={<Wrench size={30} />}
          title="工具箱是空的"
          hint="收藏常用的网址、数据集目录、学校 VPN 客户端……"
        />
      )}

      {/* 新增收藏 */}
      <ToolItemModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        groups={groups}
        onSave={(payload) => {
          addToolItem(payload)
          setAddOpen(false)
        }}
      />

      {/* 编辑收藏 */}
      <ToolItemModal
        open={editTarget !== null}
        item={editTarget}
        onClose={() => setEditTarget(null)}
        groups={groups}
        onSave={(payload) => {
          if (editTarget) updateToolItem(editTarget.id, payload)
          setEditTarget(null)
          checkValidity()
        }}
      />

      {/* 新建分组 */}
      <Modal open={groupModal === 'add'} onClose={() => setGroupModal(null)} title="新建分组" width="max-w-xs">
        <div className="flex flex-col gap-3">
          <Input
            autoFocus
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="分组名称，如：文献 / 计算 / 学校服务 / 数据"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newGroupName.trim()) {
                addToolGroup(newGroupName.trim())
                setNewGroupName('')
                setGroupModal(null)
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setGroupModal(null)}>取消</Button>
            <Button
              variant="primary"
              disabled={!newGroupName.trim()}
              onClick={() => {
                addToolGroup(newGroupName.trim())
                setNewGroupName('')
                setGroupModal(null)
              }}
            >
              创建
            </Button>
          </div>
        </div>
      </Modal>

      {/* 重命名分组 */}
      <Modal open={renamingGroup !== null} onClose={() => setRenamingGroup(null)} title="重命名分组" width="max-w-xs">
        <div className="flex flex-col gap-3">
          <Input
            autoFocus
            value={renameText}
            onChange={(e) => setRenameText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && renameText.trim() && renamingGroup) {
                renameToolGroup(renamingGroup, renameText.trim())
                setRenamingGroup(null)
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setRenamingGroup(null)}>取消</Button>
            <Button
              variant="primary"
              disabled={!renameText.trim()}
              onClick={() => {
                if (renamingGroup) renameToolGroup(renamingGroup, renameText.trim())
                setRenamingGroup(null)
              }}
            >
              保存
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteGroupTarget !== null}
        title="删除分组"
        message="删除分组后，其中的收藏项会移入「未分组」，不会被删除。"
        confirmText="删除分组"
        danger
        onConfirm={() => {
          if (deleteGroupTarget) deleteToolGroup(deleteGroupTarget)
          setDeleteGroupTarget(null)
        }}
        onCancel={() => setDeleteGroupTarget(null)}
      />
    </div>
  )
}

/** 收藏项新建/编辑弹窗：网址粘贴 URL 自动抓取标题 */
function ToolItemModal({
  open,
  item,
  onClose,
  groups,
  onSave
}: {
  open: boolean
  item?: ToolBookmark | null
  onClose: () => void
  groups: Array<{ id: string; name: string }>
  onSave: (payload: Partial<ToolBookmark> & { name: string; type: ToolType; target: string }) => void
}) {
  const [type, setType] = useState<ToolType>('url')
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [groupId, setGroupId] = useState('')
  const [note, setNote] = useState('')
  const [fetching, setFetching] = useState(false)

  useEffect(() => {
    if (!open) return
    setType(item?.type ?? 'url')
    setName(item?.name ?? '')
    setTarget(item?.target ?? '')
    setGroupId(item?.group_id ?? '')
    setNote(item?.note ?? '')
  }, [open, item])

  const pickLocal = async (): Promise<void> => {
    const kind = type === 'folder' ? 'directory' : 'file'
    const picked = await window.api.pickPath(kind)
    if (picked) {
      setTarget(picked)
      if (!name.trim()) {
        setName(picked.split(/[\\/]/).pop() ?? picked)
      }
    }
  }

  const onTargetBlur = async (): Promise<void> => {
    if (type !== 'url' || !target.trim() || name.trim()) return
    // 粘贴 URL 后自动抓取标题（失败用域名）
    const url = target.trim()
    setFetching(true)
    const meta = await window.api.fetchUrlMeta(url)
    setFetching(false)
    if (meta.title) setName(meta.title)
    else {
      try {
        setName(new URL(url).hostname)
      } catch {
        /* 保持空，用户手填 */
      }
    }
  }

  const submit = (): void => {
    const trimmedTarget = target.trim()
    if (!name.trim() || !trimmedTarget) return
    onSave({
      name: name.trim(),
      type,
      target: type === 'url' && !/^https?:\/\//i.test(trimmedTarget) ? `https://${trimmedTarget}` : trimmedTarget,
      group_id: groupId || null,
      note
    })
  }

  const localKind: ToolType[] = ['file', 'folder', 'app']

  return (
    <Modal open={open} onClose={onClose} title={item ? '编辑收藏' : '新增收藏'} width="max-w-md">
      <div className="flex flex-col gap-3.5">
        <Field label="类型">
          <div className="flex flex-wrap gap-1.5">
            {(['url', ...localKind] as ToolType[]).map((t) => {
              const Icon = TYPE_ICONS[t]
              return (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] transition-colors cursor-pointer',
                    type === t
                      ? 'border-accent bg-accent-soft font-medium text-accent'
                      : 'border-border text-text-2 hover:border-accent'
                  )}
                >
                  <Icon size={13} />
                  {TOOL_TYPE_LABELS[t]}
                </button>
              )
            })}
          </div>
        </Field>
        <Field
          label={type === 'url' ? '网址 URL' : '路径'}
          hint={type === 'url' ? '粘贴后自动获取网页标题作为名称' : '点击「浏览」选择本地路径'}
        >
          <div className="flex gap-2">
            <Input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              onBlur={onTargetBlur}
              placeholder={type === 'url' ? 'https://…' : 'C:\\…'}
            />
            {type !== 'url' && (
              <Button onClick={pickLocal} className="shrink-0">
                浏览…
              </Button>
            )}
          </div>
        </Field>
        <Field label={`名称${fetching ? '（正在获取网页标题…）' : ''}`}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={type === 'url' ? '自动获取，可修改' : '收藏名称'} />
        </Field>
        <Field label="所属分组">
          <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">未分组</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="备注">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="比如：校园网环境下使用 / 记得连 VPN" />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim() || !target.trim()}>
            {item ? '保存' : '添加'}
          </Button>
        </div>
        {type === 'url' && item === null && (
          <p className="flex items-center gap-1 text-[11px] text-text-3">
            <ExternalLink size={10.5} />
            点击收藏项将用系统默认浏览器打开；本地项用系统默认关联程序打开
          </p>
        )}
      </div>
    </Modal>
  )
}
