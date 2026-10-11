// 会议编辑弹窗（V2.6 5.4）：新建必填仅标题+日期；行动项可增删改/勾选/一键转任务
// 转任务仅在会议已保存（编辑态）时可用——任务真实创建，取消弹窗不能回滚，故新建态先保存
import { useEffect, useState } from 'react'
import { ArrowRight, Link2, Plus, Trash2 } from 'lucide-react'
import type { Meeting, MeetingActionItem } from '@shared/types'
import { todayStr } from '@/lib/date'
import { useNav } from '@/nav'
import { useStore } from '@/store'
import { Button, CheckBox, Field, IconButton, Input, Modal, Select, Textarea } from '@/components/ui'

interface Props {
  open: boolean
  onClose: () => void
  /** 编辑目标；不传 = 新建 */
  meeting?: Meeting | null
}

interface ActionItemDraft extends MeetingActionItem {
  /** 本地草稿行标识（与已入库的 task_id 无关） */
  key: string
}

export default function MeetingEditModal({ open, onClose, meeting }: Props) {
  const projects = useStore((s) => s.projects)
  const tasks = useStore((s) => s.tasks)
  const addMeeting = useStore((s) => s.addMeeting)
  const updateMeeting = useStore((s) => s.updateMeeting)
  const addTask = useStore((s) => s.addTask)
  const navigate = useNav((s) => s.navigate)

  const [date, setDate] = useState(todayStr())
  const [title, setTitle] = useState('')
  const [attendees, setAttendees] = useState('')
  const [projectId, setProjectId] = useState('')
  const [content, setContent] = useState('')
  const [items, setItems] = useState<ActionItemDraft[]>([])

  // 打开时初始化（meeting 变化强制重挂由调用方 key 保证，这里按 open 重置即可）
  useEffect(() => {
    if (!open) return
    setDate(meeting?.date ?? todayStr())
    setTitle(meeting?.title ?? '')
    setAttendees(meeting?.attendees ?? '')
    setProjectId(meeting?.project_id ?? '')
    setContent(meeting?.content ?? '')
    setItems(meeting?.action_items.map((a, i) => ({ ...a, key: `m${i}` })) ?? [])
  }, [open, meeting])

  const canSave = title.trim() !== '' && date !== ''

  const updateItem = (key: string, patch: Partial<ActionItemDraft>): void => {
    setItems((arr) => arr.map((it) => (it.key === key ? { ...it, ...patch } : it)))
  }
  const removeItem = (key: string): void => {
    setItems((arr) => arr.filter((it) => it.key !== key))
  }
  const addItem = (): void => {
    setItems((arr) => [...arr, { key: `d${Date.now()}`, text: '', done: false, task_id: null }])
  }

  /** 行动项一键转任务（PRD 5.4.3）：预填标题=行动项文本、项目=会议关联项目，成功后回填 task_id */
  const convertToTask = async (key: string): Promise<void> => {
    const item = items.find((it) => it.key === key)
    if (!item || item.task_id || item.text.trim() === '') return
    const task = addTask({ title: item.text.trim(), project_id: projectId || null })
    const next = items.map((it) => (it.key === key ? { ...it, task_id: task.id } : it))
    setItems(next)
    if (meeting) {
      // 编辑态立即落库：任务已真实创建，回链不能只留在弹窗本地
      updateMeeting(meeting.id, { action_items: next.map(({ key: _k, ...a }) => a) })
    }
  }

  const openTask = (taskId: string): void => {
    if (!tasks.some((t) => t.id === taskId)) return // 任务已删除：悬空引用不出跳转
    navigate({ name: 'tasks' })
  }

  const save = (): void => {
    if (!canSave) return
    const actionItems: MeetingActionItem[] = items
      .filter((it) => it.text.trim() !== '' || it.task_id)
      .map(({ key: _k, ...a }) => ({ ...a, text: a.text.trim() }))
    if (meeting) {
      updateMeeting(meeting.id, {
        date,
        title: title.trim(),
        attendees: attendees.trim(),
        project_id: projectId || null,
        content,
        action_items: actionItems
      })
    } else {
      addMeeting({
        date,
        title: title.trim(),
        attendees: attendees.trim(),
        project_id: projectId || null,
        content,
        action_items: actionItems
      })
    }
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={meeting ? '编辑会议' : '新建会议'} width="max-w-xl">
      <div className="flex flex-col gap-3.5">
        <div className="flex gap-3">
          <Field label="日期 *">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="标题 *">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="如：与 X 老师周会"
              autoFocus={!meeting}
            />
          </Field>
        </div>
        <div className="flex gap-3">
          <Field label="参与人">
            <Input value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="自由填写，如：我、王老师" />
          </Field>
          <Field label="关联项目">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">跨项目（不关联）</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="讨论纪要" hint="支持 Markdown">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            placeholder="记录讨论要点与结论…"
          />
        </Field>

        {/* 行动项编辑器 */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-medium text-text-2">行动项</span>
            <Button size="sm" variant="ghost" onClick={addItem}>
              <Plus /> 添加
            </Button>
          </div>
          {items.length === 0 && (
            <div className="rounded-lg bg-surface-2/60 px-2.5 py-2 text-[11.5px] text-text-3">
              会上说好的事拆成一条条行动项，可一键转为任务跟踪落实。
            </div>
          )}
          {items.map((it) => {
            const linked = it.task_id !== null && tasks.some((t) => t.id === it.task_id)
            return (
              <div key={it.key} className="flex items-center gap-2">
                <CheckBox
                  checked={it.done}
                  onChange={(checked) => updateItem(it.key, { done: checked })}
                  title={it.done ? '已完成' : '标记完成'}
                />
                <Input
                  value={it.text}
                  onChange={(e) => updateItem(it.key, { text: e.target.value })}
                  placeholder="行动项内容"
                  className="flex-1"
                />
                {linked ? (
                  <IconButton title="查看关联任务" onClick={() => openTask(it.task_id!)}>
                    <Link2 className="text-accent" />
                  </IconButton>
                ) : meeting ? (
                  <IconButton
                    title="转为任务"
                    disabled={it.text.trim() === ''}
                    onClick={() => void convertToTask(it.key)}
                  >
                    <ArrowRight />
                  </IconButton>
                ) : (
                  <span
                    title="保存会议后可转为任务"
                    className="inline-flex h-7 w-7 items-center justify-center text-text-3/40"
                  >
                    <ArrowRight />
                  </span>
                )}
                <IconButton title="删除行动项" onClick={() => removeItem(it.key)}>
                  <Trash2 />
                </IconButton>
              </div>
            )
          })}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={!canSave} onClick={save}>
            {meeting ? '保存' : '创建'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
