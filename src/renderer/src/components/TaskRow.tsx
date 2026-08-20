// 任务行：勾选完成、行内改截止日期/优先级、逾期标红（今日概览与任务列表共用）
import { useState } from 'react'
import { Calendar, Flag, Trash2 } from 'lucide-react'
import type { Project, Task } from '@shared/types'
import { PRIORITY_LABELS } from '@shared/types'
import { useStore } from '@/store'
import { Badge, CheckBox, IconButton, Tag } from '@/components/ui'
import { cn } from '@/lib/utils'
import { countdownText, daysUntil, friendlyDate } from '@/lib/date'

const priorityColor: Record<Task['priority'], 'red' | 'yellow' | 'gray'> = {
  high: 'red',
  medium: 'yellow',
  low: 'gray'
}

const nextPriority: Record<Task['priority'], Task['priority']> = {
  high: 'medium',
  medium: 'low',
  low: 'high'
}

interface TaskRowProps {
  task: Task
  project?: Project
  onNavigateToProject?: (projectId: string) => void
  onDelete?: () => void
  compact?: boolean
}

export default function TaskRow({ task, project, onNavigateToProject, onDelete, compact }: TaskRowProps) {
  const updateTask = useStore((s) => s.updateTask)
  const [editingDue, setEditingDue] = useState(false)

  const done = task.status === 'done'
  const overdue = !done && task.due_date !== null && daysUntil(task.due_date) < 0
  const dueToday = !done && task.due_date !== null && daysUntil(task.due_date) === 0

  return (
    <div
      className={cn(
        'group flex items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 transition-colors',
        'hover:border-border hover:bg-surface-2/60',
        compact ? 'text-[13px]' : 'text-[13.5px]'
      )}
    >
      <CheckBox
        checked={done}
        onChange={(v) => updateTask(task.id, { status: v ? 'done' : 'todo' })}
        title={done ? '标记为未完成' : '标记为完成'}
      />

      <div className="min-w-0 flex-1">
        <div className={cn('truncate', done && 'text-text-3 line-through')}>{task.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-text-3">
          {project && onNavigateToProject && (
            <button
              className="flex items-center gap-1 hover:text-accent cursor-pointer"
              onClick={() => onNavigateToProject(project.id)}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: project.color }} />
              {project.name}
            </button>
          )}
          {task.status === 'in_progress' && <Badge color="blue">进行中</Badge>}
          {task.tags.map((t) => (
            <Tag key={t} label={t} />
          ))}
        </div>
      </div>

      {/* 优先级：点击循环切换 高→中→低→高 */}
      <button
        title={`优先级：${PRIORITY_LABELS[task.priority]}（点击切换）`}
        onClick={() => updateTask(task.id, { priority: nextPriority[task.priority] })}
        className="cursor-pointer"
      >
        <Badge color={priorityColor[task.priority]}>
          <Flag size={10} className="mr-0.5" />
          {PRIORITY_LABELS[task.priority]}
        </Badge>
      </button>

      {/* 截止日期：行内编辑 */}
      {editingDue ? (
        <input
          type="date"
          autoFocus
          value={task.due_date ?? ''}
          onChange={(e) => updateTask(task.id, { due_date: e.target.value || null })}
          onBlur={() => setEditingDue(false)}
          onKeyDown={(e) => e.key === 'Enter' && setEditingDue(false)}
          className="h-6.5 rounded border border-accent bg-surface px-1 text-[11.5px] text-text"
        />
      ) : (
        <button
          title="点击修改截止日期"
          onClick={() => setEditingDue(true)}
          className={cn(
            'flex max-w-44 shrink-0 items-center gap-1 rounded px-1.5 py-1 text-[11.5px] cursor-pointer hover:bg-surface-2',
            overdue
              ? 'font-medium text-danger'
              : dueToday
                ? 'font-medium text-warn'
                : 'text-text-3'
          )}
        >
          <Calendar size={11.5} className="shrink-0" />
          {task.due_date ? (
            <>
              <span className="hidden truncate lg:inline">{friendlyDate(task.due_date)} </span>
              {countdownText(daysUntil(task.due_date))}
            </>
          ) : (
            '无截止'
          )}
        </button>
      )}

      {onDelete && (
        <IconButton
          title="删除任务"
          className="opacity-0 group-hover:opacity-100"
          onClick={onDelete}
        >
          <Trash2 size={13.5} />
        </IconButton>
      )}
    </div>
  )
}
