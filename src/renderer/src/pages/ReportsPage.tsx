// 汇报中心：周报/月报/工作总结 草稿自动生成 → 人工润色 → 归档/导出（md + docx）
import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Copy,
  FileDown,
  FileText,
  History,
  Pencil,
  RefreshCw,
  Trash2
} from 'lucide-react'
import type { Report, ReportKind } from '@shared/types'
import { useStore } from '@/store'
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Input,
  PageHeader,
  Textarea
} from '@/components/ui'
import {
  exportFileName,
  generateReport,
  periodOf,
  type Period
} from '@/lib/report'
import { copyText } from '@/lib/clipboard'
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
  const achievementTypes = useStore((s) => s.vocab.achievementTypes)

  const [draft, setDraft] = useState<DraftState>({ mode: 'idle' })
  const [deleteTarget, setDeleteTarget] = useState<Report | null>(null)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  // 自定义时间段（工作总结）
  const [customStart, setCustomStart] = useState(dayjs().subtract(30, 'day').format('YYYY-MM-DD'))
  const [customEnd, setCustomEnd] = useState(dayjs().format('YYYY-MM-DD'))

  const doGenerate = (kind: ReportKind, period: Period): void => {
    const result = generateReport(kind, period, { projects, tasks, logs, ideas, milestones, achievements, papers, achievementTypes }, settings.reportTemplate)
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
      <div className="page page-mid">
        <PageHeader
          title={
            <span className="flex items-center gap-2.5">
              <button
                onClick={() => setDraft({ mode: 'idle' })}
                className="-ml-1 rounded-lg p-1.5 text-text-3 hover:bg-surface-2 hover:text-text cursor-pointer [&_svg]:h-4 [&_svg]:w-4"
                title="返回列表"
              >
                <ArrowLeft />
              </button>
              {isNew ? '生成草稿' : '编辑报告'}
              <span className="text-[12.5px] font-normal text-text-3">
                {period.start} ~ {period.end}
              </span>
            </span>
          }
          actions={
            <>
              {savedFlash && (
                <span className="flex items-center gap-1 text-[12.5px] text-success">
                  <Check size={12} /> 已保存
                </span>
              )}
              {isNew && (
                <Button
                  onClick={() => doGenerate(draft.kind, draft.period)}
                  title="放弃当前编辑，重新按最新数据聚合"
                >
                  <RefreshCw /> 重新聚合
                </Button>
              )}
              <Button variant="primary" onClick={doSave}>
                保存为正式版本
              </Button>
            </>
          }
        />

        <div className="mt-5 flex flex-col gap-3">
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
                  <FileDown /> Markdown (.md)
                </Button>
                <Button size="sm" onClick={() => doExport(draftReportForExport!, 'docx')}>
                  <FileDown /> Word (.docx)
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

  const GENERATORS: Array<{
    label: string
    icon: React.ReactNode
    kind: ReportKind
    period: Period
    desc: string
  }> = [
    { label: '生成本周周报', icon: <FileText />, kind: 'weekly', period: thisWeek, desc: `本周（${thisWeek.start.slice(5)} ~ ${thisWeek.end.slice(5)}）` },
    { label: '生成上周周报', icon: <History />, kind: 'weekly', period: lastWeek, desc: `上周（${lastWeek.start.slice(5)} ~ ${lastWeek.end.slice(5)}）` },
    { label: '生成本月月报', icon: <CalendarDays />, kind: 'monthly', period: thisMonth, desc: `${thisMonth.start.slice(0, 7)} 月` }
  ]

  return (
    <div className="page page-mid">
      <PageHeader
        title="汇报中心"
        sub="自动聚合周期内的任务、日志、灵感与节点事件 → 草稿 → 人工润色 → 导出发导师"
      />

      {/* 快速生成：3 张入口卡 */}
      <div className="mt-5 grid grid-cols-1 gap-3.5 md:grid-cols-3">
        {GENERATORS.map((g) => (
          <button
            key={g.label}
            onClick={() => doGenerate(g.kind, g.period)}
            className="flex items-center gap-3.5 rounded-xl border border-border bg-surface p-4 text-left transition-all cursor-pointer hover:-translate-y-0.5 hover:border-accent/50"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent [&_svg]:h-4.5 [&_svg]:w-4.5 [&_svg]:stroke-2">
              {g.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{g.label}</span>
              <span className="mt-0.5 block text-[11.5px] text-text-3">{g.desc}</span>
            </span>
            <ChevronRight size={15} className="ml-auto shrink-0 text-text-3" />
          </button>
        ))}
      </div>

      {/* 工作总结（自定义时间段） */}
      <div className="mt-3.5 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3.5">
        <span className="text-[12.5px] font-semibold text-text-2">工作总结</span>
        <Input
          type="date"
          value={customStart}
          onChange={(e) => setCustomStart(e.target.value)}
          className="w-35"
        />
        <span className="text-text-3">～</span>
        <Input
          type="date"
          value={customEnd}
          onChange={(e) => setCustomEnd(e.target.value)}
          className="w-35"
        />
        <Button
          disabled={!customStart || !customEnd || customStart > customEnd}
          onClick={() => doGenerate('summary', { start: customStart, end: customEnd })}
        >
          生成总结
        </Button>
        <span className="text-[11.5px] text-text-3">任务统计 + 成果列表 + 进展摘要，适合年终总结</span>
      </div>

      {/* 历史归档 */}
      <div className="mt-6 mb-2 flex items-center gap-2 px-1">
        <FileText size={15} className="text-accent" />
        <h2 className="text-[15px] font-semibold">历史报告</h2>
        <span className="text-[11.5px] text-text-3">{reports.length}</span>
      </div>
      {reports.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="还没有归档的报告"
          hint="生成草稿并「保存为正式版本」后出现在这里。"
        />
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
          {reports.map((r) => (
            <div key={r.id} className="group flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4.5 py-3.5 hover:bg-surface-2/40">
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() =>
                  setDraft({ mode: 'edit', report: r, content: r.content, title: r.title })
                }
              >
                <div className="truncate text-[13.5px] font-medium">{r.title}</div>
                <div className="mt-1 text-[11.5px] text-text-3">
                  {r.period_start} ~ {r.period_end} · 生成于 {friendlyDateTime(r.generated_at)}
                  {r.updated_at !== r.generated_at && ' · 已修改'}
                </div>
              </button>
              <Badge color={r.kind === 'weekly' ? 'blue' : r.kind === 'monthly' ? 'purple' : 'gray'}>
                {r.kind === 'weekly' ? '周报' : r.kind === 'monthly' ? '月报' : '总结'}
              </Badge>
              <div className="flex shrink-0 gap-0.5">
                <IconButton title="编辑" onClick={() => setDraft({ mode: 'edit', report: r, content: r.content, title: r.title })}>
                  <Pencil />
                </IconButton>
                <IconButton title="导出 Markdown" onClick={() => doExport(r, 'md')}>
                  <FileDown />
                </IconButton>
                <IconButton title="导出 Word" onClick={() => doExport(r, 'docx')}>
                  <FileDown className="text-accent" />
                </IconButton>
                <IconButton
                  title="复制全文"
                  onClick={async () => {
                    await copyText(r.content)
                    setExportMsg('已复制到剪贴板')
                    setTimeout(() => setExportMsg(null), 2500)
                  }}
                >
                  <Copy />
                </IconButton>
                <IconButton
                  title="删除"
                  className="hover:bg-danger-soft hover:text-danger"
                  onClick={() => setDeleteTarget(r)}
                >
                  <Trash2 />
                </IconButton>
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
