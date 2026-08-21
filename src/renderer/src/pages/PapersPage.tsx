// 论文投稿（V3 §5.10）：状态流转链 + 按状态分组列表，两步内完成状态变更
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
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  IconButton,
  PageHeader,
  Select
} from '@/components/ui'
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

/** 状态流转链（图形化，替代纯文字说明） */
const FLOW_CHAIN: PaperStatus[] = ['idea', 'writing', 'submitted', 'reviewing', 'major_revision', 'accepted']

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
    <div className="page page-mid">
      <PageHeader
        title="论文投稿"
        sub={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {FLOW_CHAIN.map((s, i) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                {i > 0 && <span className="text-[11px] text-text-3">→</span>}
                <span
                  className={
                    'inline-flex h-[19px] items-center rounded-[5px] border border-border px-1.5 text-[11px] ' +
                    (s === 'accepted'
                      ? 'border-success/40 text-success'
                      : s === 'major_revision'
                        ? 'text-text-2'
                        : 'text-text-2')
                  }
                >
                  {PAPER_STATUS_LABELS[s]}
                </span>
              </span>
            ))}
            <span className="text-[11px] text-text-3">→</span>
            <span className="inline-flex h-[19px] items-center rounded-[5px] border border-danger/40 px-1.5 text-[11px] text-danger">
              拒稿→改投
            </span>
            <span className="mt-1 block text-[11.5px] text-text-3">
              状态可回退；拒稿后改投自动累加轮次
            </span>
          </span>
        }
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <FilePlus2 /> 新建论文
          </Button>
        }
      />

      {papers.length === 0 ? (
        <EmptyState
          icon={<Send />}
          title="还没有登记论文"
          hint="把在写/在投的论文登记进来，重要日期自动进时间节点，录用自动进成果台账。"
        />
      ) : (
        <div className="mt-5 flex flex-col gap-5">
          {PAPER_STATUS_ORDER.map((status) => {
            const list = papers.filter((p) => p.status === status)
            if (list.length === 0) return null
            return (
              <section key={status}>
                <div className="mb-2 flex items-center gap-2 px-1">
                  <Badge color={STATUS_COLORS[status] ?? 'gray'}>
                    {PAPER_STATUS_LABELS[status]}
                  </Badge>
                  <span className="text-[11.5px] text-text-3">{list.length} 篇</span>
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
                        className="group flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4.5 py-3.5 transition-colors hover:bg-surface-2/40"
                      >
                        <button
                          className="min-w-0 flex-1 text-left"
                          onClick={() => setEditTarget(paper)}
                          title="点击编辑论文与章节清单"
                        >
                          <div className="truncate text-sm font-medium">{paper.title}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-text-3">
                            {paper.venue && <span>{paper.venue}</span>}
                            <span>· {PAPER_TYPE_LABELS[paper.type]}</span>
                            {paper.round > 0 && <span>· 第 {paper.round} 轮</span>}
                            {project && (
                              <button
                                className="flex items-center gap-1.5 hover:text-accent cursor-pointer"
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
                              <span>· 章节 {doneSections}/{paper.sections.length}</span>
                            )}
                            {autoMilestones > 0 && <span>· {autoMilestones} 个自动节点</span>}
                          </div>
                        </button>

                        {next && nextDays !== null && (
                          <Badge
                            color={nextDays <= 7 ? 'red' : nextDays <= 30 ? 'yellow' : 'gray'}
                            className="h-6 text-xs"
                          >
                            {PAPER_DATE_LABELS[next.kind]} {countdownText(nextDays)}
                          </Badge>
                        )}

                        {/* 两步改状态：点开下拉 → 选择 */}
                        <Select
                          value={paper.status}
                          onChange={(e) => updatePaper(paper.id, { status: e.target.value as PaperStatus })}
                          className="h-7 w-26 shrink-0 text-[12.5px]"
                          title="变更状态"
                        >
                          {Object.entries(PAPER_STATUS_LABELS).map(([v, label]) => (
                            <option key={v} value={v}>
                              {label}
                            </option>
                          ))}
                        </Select>

                        <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <IconButton title="编辑" onClick={() => setEditTarget(paper)}>
                            <Pencil />
                          </IconButton>
                          <IconButton
                            title="删除"
                            className="hover:bg-danger-soft hover:text-danger"
                            onClick={() => setDeleteTarget(paper)}
                          >
                            <Trash2 />
                          </IconButton>
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
