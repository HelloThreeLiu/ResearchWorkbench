// 项目新建/编辑弹窗
import { useEffect, useState } from 'react'
import type { Project } from '@shared/types'
import { PROJECT_STATUS_LABELS } from '@shared/types'
import { useStore } from '@/store'
import { Button, Field, Input, Modal, Select, Textarea } from '@/components/ui'
import { cn } from '@/lib/utils'
import { todayStr } from '@/lib/date'

interface ProjectEditModalProps {
  open: boolean
  onClose: () => void
  project?: Project
  onCreated?: (id: string) => void
}

export default function ProjectEditModal({ open, onClose, project, onCreated }: ProjectEditModalProps) {
  const addProject = useStore((s) => s.addProject)
  const updateProject = useStore((s) => s.updateProject)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState<string>('#3b82f6')
  const [status, setStatus] = useState<Project['status']>('active')
  const [startDate, setStartDate] = useState(todayStr())
  const [endDate, setEndDate] = useState('')

  useEffect(() => {
    if (!open) return
    setName(project?.name ?? '')
    setDescription(project?.description ?? '')
    setColor(project?.color ?? '#3b82f6')
    setStatus(project?.status ?? 'active')
    setStartDate(project?.start_date ?? todayStr())
    setEndDate(project?.end_date ?? '')
  }, [open, project])

  const submit = (): void => {
    const trimmed = name.trim()
    if (!trimmed) return
    const payload = {
      name: trimmed,
      description,
      color,
      status,
      start_date: startDate || null,
      end_date: endDate || null
    }
    if (project) {
      updateProject(project.id, payload)
      onClose()
    } else {
      const created = addProject(payload)
      onClose()
      onCreated?.(created.id)
    }
  }

  const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4']

  return (
    <Modal open={open} onClose={onClose} title={project ? '编辑项目' : '新建项目'} width="max-w-md">
      <div
        className="flex flex-col gap-3.5"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit()
        }}
      >
        <Field label="项目名称（必填）">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：XX 方向预研 / 导师布置的课题"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </Field>
        <Field label="描述">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="一句话说明研究目标（可选）" />
        </Field>
        <Field label="颜色标识">
          <div className="flex gap-2">
            {colors.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn(
                  'h-6.5 w-6.5 rounded-full transition-transform cursor-pointer',
                  color === c && 'ring-2 ring-offset-2 ring-offset-surface scale-110'
                )}
                style={{ backgroundColor: c, boxShadow: color === c ? `0 0 0 2px ${c}` : undefined }}
                title={c}
              />
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="状态">
            <Select value={status} onChange={(e) => setStatus(e.target.value as Project['status'])}>
              {Object.entries(PROJECT_STATUS_LABELS).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="开始日期">
            <Input type="date" value={startDate ?? ''} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="预计结束">
            <Input type="date" value={endDate ?? ''} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim()}>
            {project ? '保存' : '创建'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
