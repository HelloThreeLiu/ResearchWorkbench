// 任务新建/编辑弹窗（今日概览、任务页、日历、项目详情共用）
import { useEffect, useState } from 'react'
import type { Task } from '@shared/types'
import { PRIORITY_LABELS, TASK_STATUS_LABELS } from '@shared/types'
import { useStore } from '@/store'
import { Button, Field, Input, Modal, Select, Textarea } from '@/components/ui'

interface TaskEditModalProps {
  open: boolean
  onClose: () => void
  /** 编辑已有任务；不传为新建 */
  task?: Task
  /** 新建时的默认值 */
  defaults?: Partial<Task>
}

export default function TaskEditModal({ open, onClose, task, defaults }: TaskEditModalProps) {
  const projects = useStore((s) => s.projects)
  const addTask = useStore((s) => s.addTask)
  const updateTask = useStore((s) => s.updateTask)

  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState('')
  const [status, setStatus] = useState<Task['status']>('todo')
  const [priority, setPriority] = useState<Task['priority']>('medium')
  const [dueDate, setDueDate] = useState('')
  const [tags, setTags] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open) return
    setTitle(task?.title ?? '')
    setProjectId(task?.project_id ?? defaults?.project_id ?? '')
    setStatus(task?.status ?? 'todo')
    setPriority(task?.priority ?? 'medium')
    setDueDate(task?.due_date ?? defaults?.due_date ?? '')
    setTags((task?.tags ?? []).join(' '))
    setNote(task?.note ?? '')
  }, [open, task, defaults])

  const submit = (): void => {
    const trimmed = title.trim()
    if (!trimmed) return
    const payload = {
      title: trimmed,
      project_id: projectId || null,
      status,
      priority,
      due_date: dueDate || null,
      tags: tags
        .split(/[,，\s]+/)
        .map((t) => t.replace(/^#/, '').trim())
        .filter(Boolean),
      note
    }
    if (task) {
      updateTask(task.id, payload)
    } else {
      addTask(payload)
    }
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={task ? '编辑任务' : '新建任务'} width="max-w-md">
      <div
        className="flex flex-col gap-3.5"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit()
        }}
      >
        <Field label="标题（必填）">
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="要做什么？"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="所属项目">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">无（杂项任务）</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="状态">
            <Select value={status} onChange={(e) => setStatus(e.target.value as Task['status'])}>
              {Object.entries(TASK_STATUS_LABELS).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="优先级">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as Task['priority'])}>
              {Object.entries(PRIORITY_LABELS).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="截止日期">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        <Field label="标签（空格分隔）">
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="实验 写作" />
        </Field>
        <Field label="备注">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={submit} disabled={!title.trim()}>
            {task ? '保存' : '创建'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
