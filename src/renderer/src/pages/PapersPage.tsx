// 论文投稿跟踪：按状态分组的列表，两步内完成状态变更；章节进度与日期倒计时
import { useMemo, useState } from 'react'
import { FilePlus2, Pencil, Send, Trash2 } from 'lucide-react'
import type { Paper, PaperStatus } from '@shared/types'
import {
  PAPER_DATE_LABELS,
  PAPER_STATUS_LABELS,
  PAPER_STATUS_ORDER,
  PAPER_TYPE_LABELS
} from '@shared/types'
import { useStore } from '@/store'
import { useNav } from '@/nav'
import { Badge, Button, ConfirmDialog, EmptyState, Select } from '@/components/ui'
import PaperEditModal from '@/components/PaperEditModal'
import { countdownText, daysUntil } from '@/lib/date'

const STATUS_COLORS: Partial<Record<PaperStatus, 'yellow' | 'blue' | 'green' | 'red' | 'gray' | 'purple'>> = {
  idea: 'gray',
  writing: 'yellow',
  submitted: 'blue',
  reviewing: 'purple',
  major_revision: 'yellow',
  minor_revision: 'yellow',
  accepted: 'green',
  rejected: 'red'
}

export default function PapersPage() {
  const papers = useStore((s) => s.papers)
  const projects = useStore((s) => s.projects)
  const milestones = useStore((s) => s.milestones)
  const updatePaper = useStore((s) => s.updatePaper)
  const deletePaper = useStore((s) => s.deletePaper)
  const navigate = useNav((s) => s.navigate)

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Paper | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Paper | null>(null)

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])

  /** 论文下一个临近日期（用于列表倒计时） */
  const nextDateOf = (paper: Paper): { kind: keyof Paper['dates']; date: string } | null => {
    const entries = (Object.keys(PAPER_DATE_LABELS) as Array<keyof Paper['dates']>)
      .map((kind) => ({ kind, date: paper.dates[kind] }))
      .filter((d): d is { kind: keyof Paper['dates']; date: string } => d.date !== null)
      .filter((d) => daysUntil(d.date) >= 0)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
    return entries[0] ?? null
  }

  const doDelete = async (): Promise<void> => {
    if (!deleteTarget) return
    await useStore.getState().backupNow() // 删除保护
    deletePaper(deleteTarget.id)
    setDeleteTarget(null)
  }

  return (
    <div className="px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">论文投稿</h1>
          <p className="mt-0.5 text-[12px] text-text-3">
            状态流转：构思 → 写作中 → 已投稿 → 审稿中 → 大修/小修 → 录用/拒稿（可回退；拒稿后改投自动累加轮次）
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          <FilePlus2 size={14} /> 新建论文
        </Button>
      </div>

      {papers.length === 0 ? (
        <EmptyState
          icon={<Send size={30} />}
          title="还没有登记论文"
          hint="把在写/在投的论文登记进来，重要日期自动进时间节点，录用自动进成果台账。"
        />
      ) : (
        <div className="mt-4 flex flex-col gap-5">
          {PAPER_STATUS_ORDER.map((status) => {
            const list = papers.filter((p) => p.status === status)
            if (list.length === 0) return null
            return (
              <section key={status}>
                <div className="mb-1.5 flex items-center gap-2 px-1">
                  <Badge color={STATUS_COLORS[status] ?? 'gray'}>
                    {PAPER_STATUS_LABELS[status]}
                  </Badge>
                  <span className="text-[11px] text-text-3">{list.length} 篇</span>
                </div>
                <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
                  {list.map((paper) => {
                    const project = paper.project_id ? projectMap.get(paper.project_id) : undefined
                    const next = nextDateOf(paper)
                    const nextDays = next ? daysUntil(next.date) : null
                    const doneSections = paper.sections.filter((s) => s.done).length
                    const autoMilestones = milestones.filter((m) => m.source_paper_id === paper.id).length
                    return (
                      <div
                        key={paper.id}
                        className="group flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 transition-colors hover:bg-surface-2/40"
                      >
                        <button
                          className="min-w-0 flex-1 text-left"
                          onClick={() => setEditTarget(paper)}
                          title="点击编辑论文与章节清单"
                        >
                          <div className="truncate text-[13.5px] font-medium">{paper.title}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-text-3">
                            {paper.venue && <span>{paper.venue}</span>}
                            <span>· {PAPER_TYPE_LABELS[paper.type]}</span>
                            {paper.round > 0 && <span>· 第 {paper.round} 轮</span>}
                            {project && (
                              <button
                                className="flex items-center gap-1 hover:text-accent cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  navigate({ name: 'project-detail', projectId: project.id, tab: 'overview' })
                                }}
                              >
                                ·
                                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: project.color }} />
                                {project.name}
                              </button>
                            )}
                            {paper.sections.length > 0 && (
                              <span>
                                · 章节 {doneSections}/{paper.sections.length}
                              </span>
                            )}
                            {autoMilestones > 0 && <span>· {autoMilestones} 个自动节点</span>}
                          </div>
                        </button>

                        {next && nextDays !== null && (
                          <Badge color={nextDays <= 7 ? 'red' : nextDays <= 30 ? 'yellow' : 'gray'}>
                            {PAPER_DATE_LABELS[next.kind]} {countdownText(nextDays)}
                          </Badge>
                        )}

                        {/* 两步改状态：点开下拉 → 选择 */}
                        <Select
                          value={paper.status}
                          onChange={(e) => updatePaper(paper.id, { status: e.target.value as PaperStatus })}
                          className="w-28 shrink-0"
                          title="变更状态"
                        >
                          {Object.entries(PAPER_STATUS_LABELS).map(([v, label]) => (
                            <option key={v} value={v}>
                              {label}
                            </option>
                          ))}
                        </Select>

                        <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button size="sm" variant="ghost" onClick={() => setEditTarget(paper)} title="编辑">
                            <Pencil size={12.5} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-danger hover:text-danger"
                            onClick={() => setDeleteTarget(paper)}
                            title="删除"
                          >
                            <Trash2 size={12.5} />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}

      <PaperEditModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <PaperEditModal
        key={editTarget?.id}
        open={editTarget !== null}
        paper={editTarget ?? undefined}
        onClose={() => setEditTarget(null)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除论文"
        message={
          <>
            确定删除「{deleteTarget?.title}」吗？
            <br />
            其自动生成的时间节点将一并删除；章节关联的任务与成果台账记录保留。
          </>
        }
        confirmText="删除"
        danger
        onConfirm={doDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
