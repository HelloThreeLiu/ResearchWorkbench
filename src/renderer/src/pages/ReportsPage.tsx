// 汇报中心：周报/月报/工作总结 草稿自动生成 → 人工润色 → 归档/导出（md + docx）
import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  Check,
  Copy,
  FileDown,
  FileText,
  Pencil,
  Plus,
  RefreshCw,
  Trash2
} from 'lucide-react'
import type { Report, ReportKind } from '@shared/types'
import { useStore } from '@/store'
import { Badge, Button, ConfirmDialog, EmptyState, Input, Textarea } from '@/components/ui'
import {
  exportFileName,
  generateReport,
  periodOf,
  type Period
} from '@/lib/report'
import { dayjs, friendlyDateTime } from '@/lib/date'

type DraftState =
  | { mode: 'idle' }
  | { mode: 'new'; kind: ReportKind; period: Period; content: string; title: string }
  | { mode: 'edit'; report: Report; content: string; title: string }

export default function ReportsPage() {
  const reports = useStore((s) => s.reports)
  const settings = useStore((s) => s.settings)
  const saveReport = useStore((s) => s.saveReport)
  const deleteReport = useStore((s) => s.deleteReport)
  // 聚合数据源：分集合选择，保持引用稳定
  const projects = useStore((s) => s.projects)
  const tasks = useStore((s) => s.tasks)
  const logs = useStore((s) => s.logs)
  const ideas = useStore((s) => s.ideas)
  const milestones = useStore((s) => s.milestones)
  const achievements = useStore((s) => s.achievements)
  const papers = useStore((s) => s.papers)

  const [draft, setDraft] = useState<DraftState>({ mode: 'idle' })
  const [deleteTarget, setDeleteTarget] = useState<Report | null>(null)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  // 自定义时间段（工作总结）
  const [customStart, setCustomStart] = useState(dayjs().subtract(30, 'day').format('YYYY-MM-DD'))
  const [customEnd, setCustomEnd] = useState(dayjs().format('YYYY-MM-DD'))

  const doGenerate = (kind: ReportKind, period: Period): void => {
    const result = generateReport(kind, period, { projects, tasks, logs, ideas, milestones, achievements, papers }, settings.reportTemplate)
    setDraft({ mode: 'new', kind, period, content: result.content, title: result.title })
  }

  const doSave = (): void => {
    if (draft.mode === 'idle') return
    if (draft.mode === 'new') {
      const now = new Date().toISOString()
      saveReport({
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        kind: draft.kind,
        title: draft.title.trim() || '未命名报告',
        period_start: draft.period.start,
        period_end: draft.period.end,
        content: draft.content,
        generated_at: now,
        updated_at: now
      })
    } else {
      saveReport({
        ...draft.report,
        title: draft.title.trim() || draft.report.title,
        content: draft.content
      })
    }
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1500)
  }

  const doExport = async (report: Report, format: 'md' | 'docx'): Promise<void> => {
    const result = await window.api.exportReport({
      defaultFileName: exportFileName(report),
      markdown: report.content,
      format,
      title: report.title
    })
    setExportMsg(result.ok ? `已导出到 ${result.path}` : '已取消导出')
    setTimeout(() => setExportMsg(null), 5000)
  }

  const draftReportForExport: Report | null = useMemo(() => {
    if (draft.mode === 'new') {
      const now = new Date().toISOString()
      return {
        id: '__draft__',
        kind: draft.kind,
        title: draft.title || '未命名报告',
        period_start: draft.period.start,
        period_end: draft.period.end,
        content: draft.content,
        generated_at: now,
        updated_at: now
      }
    }
    if (draft.mode === 'edit') {
      return { ...draft.report, title: draft.title, content: draft.content }
    }
    return null
  }, [draft])

  // ---------- 编辑/生成视图 ----------
  if (draft.mode !== 'idle') {
    const isNew = draft.mode === 'new'
    const period = isNew ? draft.period : { start: draft.report.period_start, end: draft.report.period_end }
    return (
      <div className="px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => setDraft({ mode: 'idle' })}
              className="rounded-lg p-1.5 text-text-3 hover:bg-surface-2 hover:text-text cursor-pointer"
              title="返回列表"
            >
              <ArrowLeft size={17} />
            </button>
            <h1 className="text-lg font-semibold">
              {isNew ? '生成草稿' : '编辑报告'}
              <span className="ml-2 text-[12px] font-normal text-text-3">
                {period.start} ~ {period.end}
              </span>
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {savedFlash && (
              <span className="flex items-center gap-1 text-[12px] text-success">
                <Check size={12} /> 已保存
              </span>
            )}
            {isNew && (
              <Button
                onClick={() => doGenerate(draft.kind, draft.period)}
                title="放弃当前编辑，重新按最新数据聚合"
              >
                <RefreshCw size={13} /> 重新聚合
              </Button>
            )}
            <Button variant="primary" onClick={doSave}>
              保存为正式版本
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <Input
            value={draft.title}
            onChange={(e) =>
              setDraft(
                draft.mode === 'new'
                  ? { ...draft, title: e.target.value }
                  : { ...draft, title: e.target.value }
              )
            }
            placeholder="报告标题"
            className="max-w-md font-medium"
          />
          <Textarea
            value={draft.content}
            onChange={(e) =>
              setDraft(
                draft.mode === 'new'
                  ? { ...draft, content: e.target.value }
                  : { ...draft, content: e.target.value }
              )
            }
            className="min-h-[52vh] font-mono text-[12.5px] leading-relaxed"
            spellCheck={false}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11.5px] text-text-3">导出当前内容：</span>
            {draftReportForExport && (
              <>
                <Button size="sm" onClick={() => doExport(draftReportForExport!, 'md')}>
                  <FileDown size={12.5} /> Markdown (.md)
                </Button>
                <Button size="sm" onClick={() => doExport(draftReportForExport!, 'docx')}>
                  <FileDown size={12.5} /> Word (.docx)
                </Button>
              </>
            )}
            {exportMsg && <span className="text-[11.5px] text-success">{exportMsg}</span>}
          </div>
        </div>
      </div>
    )
  }

  // ---------- 列表视图 ----------
  const thisWeek = periodOf('thisWeek')
  const lastWeek = periodOf('lastWeek')
  const thisMonth = periodOf('thisMonth')

  return (
    <div className="px-4 py-5 sm:px-6">
      <h1 className="text-lg font-semibold">汇报中心</h1>
      <p className="mt-0.5 text-[12px] text-text-3">
        自动聚合周期内完成的任务、进展日志、灵感与节点事件，生成草稿后人工润色，导出发给导师。
      </p>

      {/* 生成入口 */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {(
          [
            ['本周周报', 'weekly', thisWeek, `本周（${thisWeek.start.slice(5)} ~ ${thisWeek.end.slice(5)}）`],
            ['上周周报', 'weekly', lastWeek, `上周（${lastWeek.start.slice(5)} ~ ${lastWeek.end.slice(5)}）`],
            ['本月月报', 'monthly', thisMonth, `${thisMonth.start.slice(0, 7)} 月`]
          ] as Array<[string, ReportKind, Period, string]>
        ).map(([label, kind, period, desc]) => (
          <button
            key={label}
            onClick={() => doGenerate(kind, period)}
            className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface p-4 text-left transition-all hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-md cursor-pointer"
          >
            <span className="flex items-center gap-1.5 text-[13.5px] font-medium">
              <Plus size={14} className="text-accent" />
              生成{label}
            </span>
            <span className="text-[11.5px] text-text-3">{desc}</span>
          </button>
        ))}
      </div>

      {/* 工作总结（自定义时间段） */}
      <div className="mt-3 flex flex-wrap items-end gap-2.5 rounded-xl border border-border bg-surface p-3.5">
        <div className="flex flex-col gap-1">
          <span className="text-[11.5px] text-text-3">工作总结（自定义时间段）</span>
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="w-36"
            />
            <span className="text-text-3">～</span>
            <Input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="w-36"
            />
          </div>
        </div>
        <Button
          disabled={!customStart || !customEnd || customStart > customEnd}
          onClick={() => doGenerate('summary', { start: customStart, end: customEnd })}
        >
          生成工作总结
        </Button>
        <span className="text-[11px] text-text-3">任务统计 + 成果列表 + 进展摘要</span>
      </div>

      {/* 历史归档 */}
      <h2 className="mt-6 flex items-center gap-2 text-[14px] font-semibold">
        <FileText size={15} className="text-accent" />
        历史报告（{reports.length}）
      </h2>
      {reports.length === 0 ? (
        <EmptyState
          icon={<FileText size={30} />}
          title="还没有归档的报告"
          hint="生成草稿并「保存为正式版本」后出现在这里。"
        />
      ) : (
        <div className="mt-3 flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
          {reports.map((r) => (
            <div key={r.id} className="group flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 hover:bg-surface-2/40">
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() =>
                  setDraft({ mode: 'edit', report: r, content: r.content, title: r.title })
                }
              >
                <div className="truncate text-[13.5px] font-medium">{r.title}</div>
                <div className="mt-0.5 text-[11px] text-text-3">
                  {r.period_start} ~ {r.period_end} · 生成于 {friendlyDateTime(r.generated_at)}
                  {r.updated_at !== r.generated_at && ' · 已修改'}
                </div>
              </button>
              <Badge color={r.kind === 'weekly' ? 'blue' : r.kind === 'monthly' ? 'purple' : 'gray'}>
                {r.kind === 'weekly' ? '周报' : r.kind === 'monthly' ? '月报' : '总结'}
              </Badge>
              <div className="flex shrink-0 gap-0.5">
                <Button size="sm" variant="ghost" title="编辑" onClick={() => setDraft({ mode: 'edit', report: r, content: r.content, title: r.title })}>
                  <Pencil size={12.5} />
                </Button>
                <Button size="sm" variant="ghost" title="导出 Markdown" onClick={() => doExport(r, 'md')}>
                  <FileDown size={12.5} />
                </Button>
                <Button size="sm" variant="ghost" title="导出 Word" onClick={() => doExport(r, 'docx')}>
                  <FileDown size={12.5} className="text-blue-500" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  title="复制全文"
                  className="text-text-3 hover:text-text"
                  onClick={async () => {
                    await copyText(r.content)
                    setExportMsg('已复制到剪贴板')
                    setTimeout(() => setExportMsg(null), 2500)
                  }}
                >
                  <Copy size={12.5} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger hover:text-danger"
                  title="删除"
                  onClick={() => setDeleteTarget(r)}
                >
                  <Trash2 size={12.5} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {exportMsg && <div className="mt-2 text-[12px] text-success">{exportMsg}</div>}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除报告"
        message={`确定删除「${deleteTarget?.title}」吗？已导出的文件不受影响。`}
        confirmText="删除"
        danger
        onConfirm={() => {
          if (deleteTarget) deleteReport(deleteTarget.id)
          setDeleteTarget(null)
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // file:// 下剪贴板 API 不可用时的兜底
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
}
