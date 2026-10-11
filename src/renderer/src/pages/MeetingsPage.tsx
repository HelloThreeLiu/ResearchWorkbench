// 会议纪要页（V2.6 5.4）：按日期倒序时间线；卡片=日期/标题/参与人/项目色条/行动项进度
// 定位（PRD）：带行动项的结构化会谈记录——与进展日志的分工：日志=项目流水，会议=会谈产出（核心价值在行动项落实）
import { useMemo, useState } from 'react'
import { NotebookPen, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import type { Meeting } from '@shared/types'
import { friendlyDate } from '@/lib/date'
import { useStore } from '@/store'
import MeetingEditModal from '@/components/MeetingEditModal'
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  FilterBar,
  IconButton,
  Input,
  PageHeader,
  ProgressBar,
  Select
} from '@/components/ui'

type ProjectFilter = 'all' | 'unlinked' | string

export default function MeetingsPage() {
  const meetings = useStore((s) => s.meetings)
  const projects = useStore((s) => s.projects)
  const tasks = useStore((s) => s.tasks)
  const deleteMeeting = useStore((s) => s.deleteMeeting)
  const backupNow = useStore((s) => s.backupNow)

  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Meeting | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Meeting | null>(null)

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return meetings
      .filter((m) => {
        if (projectFilter === 'unlinked' && m.project_id !== null) return false
        if (projectFilter !== 'all' && projectFilter !== 'unlinked' && m.project_id !== projectFilter) return false
        if (q === '') return true
        const haystack = [m.title, m.content, m.attendees, ...m.action_items.map((a) => a.text)]
          .join('\n')
          .toLowerCase()
        return haystack.includes(q)
      })
      .sort((a, b) => (a.date === b.date ? b.created_at.localeCompare(a.created_at) : b.date.localeCompare(a.date)))
  }, [meetings, search, projectFilter])

  const doDelete = async (): Promise<void> => {
    if (!deleteTarget) return
    // 删除前快照备份（与文献页同规）；行动项关联的任务不级联删除，仅随会议删除解除回链
    await backupNow()
    deleteMeeting(deleteTarget.id)
    setDeleteTarget(null)
  }

  const pendingCount = (m: Meeting): number => m.action_items.filter((a) => !a.done).length

  return (
    <div className="page page-mid">
      <PageHeader
        title="会议纪要"
        sub="带行动项的结构化会谈记录——行动项可一键转任务，任务完成后自动打勾"
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus /> 新建会议
          </Button>
        }
      />

      <FilterBar
        filters={
          <Select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="h-7 w-auto min-w-28 max-w-44 shrink-0 text-[12.5px]"
          >
            <option value="all">全部项目</option>
            <option value="unlinked">仅未关联</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        }
      >
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索标题、纪要、行动项…"
          className="h-7 min-w-52 max-w-xs text-[12.5px]"
        />
      </FilterBar>

      {meetings.length === 0 ? (
        <EmptyState
          icon={<NotebookPen />}
          title="还没有会议纪要"
          hint="与导师开完会花 10 秒建一条记录，把说好的事拆成行动项，会后逐项落实。"
          action={
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus /> 新建会议
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="没有符合条件的会议" hint="调整搜索关键词或筛选条件试试。" />
      ) : (
        <div className="mt-4 flex flex-col gap-2.5">
          {filtered.map((m) => {
            const project = m.project_id ? projectById.get(m.project_id) : undefined
            const total = m.action_items.length
            const done = total - pendingCount(m)
            const pending = pendingCount(m)
            const linkedTaskCount = m.action_items.filter((a) => a.task_id && tasks.some((t) => t.id === a.task_id)).length
            return (
              <div
                key={m.id}
                className="group flex gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 transition-colors hover:border-accent/40"
              >
                {/* 项目色条 */}
                <span
                  className="mt-0.5 w-1 shrink-0 self-stretch rounded-full"
                  style={{ backgroundColor: project?.color ?? 'var(--color-border)' }}
                  title={project?.name ?? '跨项目'}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <button
                      onClick={() => setEditTarget(m)}
                      className="cursor-pointer text-sm font-medium text-text hover:text-accent"
                    >
                      {m.title}
                    </button>
                    <span className="text-[11.5px] text-text-3">{friendlyDate(m.date)}</span>
                    {project && (
                      <span className="text-[11.5px]" style={{ color: project.color }}>
                        {project.name}
                      </span>
                    )}
                    {pending > 0 && (
                      <Badge color="red">
                        行动项 {pending} 未完成
                      </Badge>
                    )}
                  </div>
                  {m.attendees.trim() !== '' && (
                    <div className="mt-1 text-[11.5px] text-text-3">参与人：{m.attendees}</div>
                  )}
                  {m.content.trim() !== '' && (
                    <div className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-text-2">{m.content}</div>
                  )}
                  {total > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="shrink-0 text-[11.5px] tabular-nums text-text-3">
                        行动项 {done}/{total}
                        {linkedTaskCount > 0 && ` · ${linkedTaskCount} 项已转任务`}
                      </span>
                      <ProgressBar value={(done / total) * 100} color={pending === 0 ? 'var(--color-success)' : undefined} />
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-start gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <IconButton title="编辑" onClick={() => setEditTarget(m)}>
                    <Pencil />
                  </IconButton>
                  <IconButton title="删除" onClick={() => setDeleteTarget(m)}>
                    <Trash2 />
                  </IconButton>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <MeetingEditModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <MeetingEditModal
        key={editTarget?.id ?? 'none'}
        open={editTarget !== null}
        meeting={editTarget}
        onClose={() => setEditTarget(null)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除会议"
        message={`删除「${deleteTarget?.title ?? ''}」？其行动项关联的任务不会被删除，仅解除关联。`}
        confirmText="删除"
        danger
        onConfirm={() => void doDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
