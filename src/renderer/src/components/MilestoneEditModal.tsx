// 时间节点新建/编辑弹窗（今日概览、节点页、日历、项目详情共用）
import { useEffect, useRef, useState } from 'react'
import type { Milestone } from '@shared/types'
import { MILESTONE_TYPE_LABELS } from '@shared/types'
import { useStore } from '@/store'
import { Button, Field, Input, Modal, Select, Textarea } from '@/components/ui'
import { cn } from '@/lib/utils'
import { todayStr } from '@/lib/date'

interface MilestoneEditModalProps {
  open: boolean
  onClose: () => void
  milestone?: Milestone
  defaults?: Partial<Milestone>
}

const PRESET_REMIND = [7, 3, 1]

function formatRemind(days: number[]): string {
  return days.join(',')
}

function parseRemind(s: string): number[] {
  return s
    .split(/[,，\s]+/)
    .map((v) => parseInt(v, 10))
    .filter((v) => Number.isFinite(v) && v >= 0 && v <= 365)
}

export default function MilestoneEditModal({ open, onClose, milestone, defaults }: MilestoneEditModalProps) {
  const projects = useStore((s) => s.projects)
  const addMilestone = useStore((s) => s.addMilestone)
  const updateMilestone = useStore((s) => s.updateMilestone)

  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayStr())
  const [type, setType] = useState<Milestone['type']>('other')
  const [projectId, setProjectId] = useState('')
  const [remindText, setRemindText] = useState(formatRemind(PRESET_REMIND))
  const [note, setNote] = useState('')

  // defaults 仅在打开时生效，避免父组件重渲染重置表单
  const defaultsRef = useRef(defaults)
  defaultsRef.current = defaults
  useEffect(() => {
    if (!open) return
    const d = defaultsRef.current
    setTitle(milestone?.title ?? '')
    setDate(milestone?.date ?? d?.date ?? todayStr())
    setType(milestone?.type ?? d?.type ?? 'other')
    setProjectId(milestone?.project_id ?? d?.project_id ?? '')
    setRemindText(formatRemind(milestone?.remind_days ?? PRESET_REMIND))
    setNote(milestone?.note ?? '')
  }, [open, milestone])

  const togglePreset = (day: number): void => {
    const current = parseRemind(remindText)
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort((a, b) => b - a)
    setRemindText(formatRemind(next))
  }

  const submit = (): void => {
    const trimmed = title.trim()
    if (!trimmed || !date) return
    const remind = parseRemind(remindText)
    const payload = {
      title: trimmed,
      date,
      type,
      project_id: projectId || null,
      remind_days: remind.length > 0 ? remind : PRESET_REMIND,
      note
    }
    if (milestone) {
      updateMilestone(milestone.id, payload)
    } else {
      addMilestone(payload)
    }
    onClose()
  }

  const currentRemind = parseRemind(remindText)

  return (
    <Modal open={open} onClose={onClose} title={milestone ? '编辑时间节点' : '新建时间节点'} width="max-w-md">
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
            placeholder="如：AAAI 投稿截止 / 学位论文开题"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="日期（必填）">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="类型">
            <Select value={type} onChange={(e) => setType(e.target.value as Milestone['type'])}>
              {Object.entries(MILESTONE_TYPE_LABELS).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="所属项目（全局节点可不选）">
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">无（全局节点）</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="提前提醒天数" hint="达到提醒窗口的节点会出现在「今日概览」倒计时列表">
          <div className="flex items-center gap-2">
            {[7, 3, 1].map((d) => (
              <button
                key={d}
                onClick={() => togglePreset(d)}
                className={cn(
                  'rounded-lg border px-2.5 py-1 text-[12px] transition-colors cursor-pointer',
                  currentRemind.includes(d)
                    ? 'border-accent bg-accent-soft font-medium text-accent'
                    : 'border-border text-text-2 hover:border-accent'
                )}
              >
                提前 {d} 天
              </button>
            ))}
            <Input
              value={remindText}
              onChange={(e) => setRemindText(e.target.value)}
              className="w-32"
              placeholder="自定义，如 14,7,3"
            />
          </div>
        </Field>
        <Field label="备注">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={submit} disabled={!title.trim() || !date}>
            {milestone ? '保存' : '创建'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
