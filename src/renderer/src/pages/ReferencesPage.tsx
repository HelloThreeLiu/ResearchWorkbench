// 文献页（V2.5 文献线索层）：导入 Zotero 条目、管理阅读状态、复制引用格式、与主链串联
// 定位：管理「文献与科研进度的关系」，不管理文献原文（PDF 阅读交给 Zotero/系统阅读器）
import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  FilePlus2,
  Pencil,
  Search,
  Trash2
} from 'lucide-react'
import type { ReadingStatus, Reference } from '@shared/types'
import { READING_STATUS_LABELS } from '@shared/types'
import { useStore } from '@/store'
import { useAllTags } from '@/hooks/useVocab'
import {
  Button,
  CheckBox,
  Chip,
  ChipCount,
  ConfirmDialog,
  EmptyState,
  FilterBar,
  IconButton,
  Input,
  PageHeader,
  Select,
  Tag
} from '@/components/ui'
import ReferenceEditModal from '@/components/ReferenceEditModal'
import ReferenceImportModal from '@/components/ReferenceImportModal'
import { copyText } from '@/lib/clipboard'
import {
  formatAPA,
  formatAPABlock,
  formatBibTeX,
  formatBibTeXBlock,
  formatGB7714,
  formatGB7714Block
} from '@/lib/citation'

/** 分页每页 100 条（PRD 决策 D23：普通渲染 + 分页，5000 条量级已达标） */
const PAGE_SIZE = 100

type SortKey = 'created' | 'year' | 'title'

export default function ReferencesPage() {
  const references = useStore((s) => s.references)
  const projects = useStore((s) => s.projects)
  const updateReference = useStore((s) => s.updateReference)
  const deleteReference = useStore((s) => s.deleteReference)
  const allTags = useAllTags()

  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | ReadingStatus>('all')
  const [filterProject, setFilterProject] = useState('all')
  const [filterTag, setFilterTag] = useState('all')
  const [filterYear, setFilterYear] = useState('all')
  const [sortBy, setSortBy] = useState<SortKey>('created')

  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  /** 当前页 PDF 路径有效性（路径不存在时置灰，同工具箱失效交互） */
  const [pdfValidity, setPdfValidity] = useState<Record<string, boolean>>({})

  const [importOpen, setImportOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Reference | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Reference | null>(null)

  // ---------- 筛选与排序 ----------
  const years = useMemo(() => {
    const set = new Set<number>()
    for (const r of references) if (r.year !== null) set.add(r.year)
    return [...set].sort((a, b) => b - a)
  }, [references])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = references.filter((r) => {
      if (q) {
        const haystack = (r.title + ' ' + r.authors.join(' ') + ' ' + r.note).toLowerCase()
        if (!haystack.includes(q)) return false
      }
      if (filterStatus !== 'all' && r.status !== filterStatus) return false
      if (
        filterProject === '__none__'
          ? r.project_id !== null
          : filterProject !== 'all' && r.project_id !== filterProject
      )
        return false
      if (filterTag !== 'all' && !r.tags.includes(filterTag)) return false
      if (filterYear === '__none__' ? r.year !== null : filterYear !== 'all' && String(r.year) !== filterYear)
        return false
      return true
    })
    // 默认按创建时间倒序（最新导入在前），可切换按年份、标题
    if (sortBy === 'year') {
      list.sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity))
    } else if (sortBy === 'title') {
      list.sort((a, b) => a.title.localeCompare(b.title, 'zh'))
    } else {
      list.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    }
    return list
  }, [references, search, filterStatus, filterProject, filterTag, filterYear, sortBy])

  // 筛选/排序变化时回到第 1 页
  useEffect(() => {
    setPage(1)
  }, [search, filterStatus, filterProject, filterTag, filterYear, sortBy])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageRows = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage]
  )

  const statusCount = (status: ReadingStatus): number =>
    references.filter((r) => r.status === status).length

  // ---------- PDF 路径有效性（仅检测当前页，进入/翻页时刷新） ----------
  useEffect(() => {
    let cancelled = false
    const withPdf = pageRows.filter((r) => r.pdf_path)
    Promise.all(
      withPdf.map(async (r) => [r.id, await window.api.pathExists(r.pdf_path!)] as const)
    ).then((entries) => {
      if (!cancelled) setPdfValidity(Object.fromEntries(entries))
    })
    return () => {
      cancelled = true
    }
  }, [pageRows])

  const openPdf = async (ref: Reference): Promise<void> => {
    if (!ref.pdf_path) return
    const err = await window.api.openPath(ref.pdf_path)
    if (err) {
      setPdfValidity((prev) => ({ ...prev, [ref.id]: false }))
      alert(`无法打开「${ref.title}」的 PDF：${err}`)
    }
  }

  // ---------- 复制引用（单条 / 批量） ----------
  const [copyMsg, setCopyMsg] = useState('')
  const flashCopied = (kind: 'gb' | 'bibtex' | 'apa'): void => {
    setCopyMsg(
      kind === 'gb' ? '已复制 GB/T 7714 引用' : kind === 'bibtex' ? '已复制 BibTeX' : '已复制 APA 引用'
    )
    setTimeout(() => setCopyMsg(''), 2500)
  }

  const copyOne = async (ref: Reference, kind: 'gb' | 'bibtex' | 'apa'): Promise<void> => {
    // 单条复制为裸引用（[1][2] 编号仅批量复制时生成）
    const text =
      kind === 'gb' ? formatGB7714(ref) : kind === 'bibtex' ? formatBibTeX(ref) : formatAPA(ref)
    await copyText(text)
    flashCopied(kind)
  }

  /** 批量复制：选中项按当前列表顺序生成（GB/T 带 [1][2] 编号，其余空行分隔） */
  const copyBatch = async (kind: 'gb' | 'bibtex' | 'apa'): Promise<void> => {
    const refs = filtered.filter((r) => selected.has(r.id))
    if (refs.length === 0) return
    const text =
      kind === 'gb' ? formatGB7714Block(refs) : kind === 'bibtex' ? formatBibTeXBlock(refs) : formatAPABlock(refs)
    await copyText(text)
    flashCopied(kind)
  }

  const toggleSelected = (id: string, checked: boolean): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const pageAllSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id))

  const doDelete = async (): Promise<void> => {
    if (!deleteTarget) return
    await useStore.getState().backupNow() // 删除保护
    deleteReference(deleteTarget.id)
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(deleteTarget.id)
      return next
    })
    setDeleteTarget(null)
  }

  /** 作者摘要：>3 位显示前 3 位 + 等 */
  const authorsText = (r: Reference): string =>
    r.authors.length > 3 ? `${r.authors.slice(0, 3).join(', ')} 等` : r.authors.join(', ')

  return (
    <div className="page page-mid">
      <PageHeader
        title="文献"
        sub="读文献 → 记灵感 → 引用核对 · 从 Zotero 导入条目（BibTeX / CSL JSON），管理阅读状态与引用清单"
        actions={
          <>
            <Button onClick={() => setCreateOpen(true)}>
              <FilePlus2 /> 新建
            </Button>
            <Button variant="primary" onClick={() => setImportOpen(true)}>
              <Download /> 导入
            </Button>
          </>
        }
      />

      {/* 搜索 + 状态 Chips（流动区） ‖ 项目/标签/年份/排序（锚定区） */}
      <FilterBar
        filters={
          <>
            <Select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className="h-7 w-auto min-w-28 max-w-44 shrink-0 text-[12.5px]"
            >
              <option value="all">全部项目</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="__none__">仅未关联</option>
            </Select>
            <Select
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              className="h-7 w-auto min-w-24 max-w-36 shrink-0 text-[12.5px]"
            >
              <option value="all">全部标签</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  #{t}
                </option>
              ))}
            </Select>
            <Select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="h-7 w-auto min-w-20 max-w-30 shrink-0 text-[12.5px]"
            >
              <option value="all">全部年份</option>
              {years.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
              <option value="__none__">无年份</option>
            </Select>
            <Select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="h-7 w-auto min-w-24 shrink-0 text-[12.5px]"
              title="排序方式"
            >
              <option value="created">最新导入</option>
              <option value="year">按年份</option>
              <option value="title">按标题</option>
            </Select>
          </>
        }
      >
        <div className="relative min-w-44 max-w-60 flex-1">
          <Search size={13} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-text-3" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索标题 / 作者 / 笔记…"
            className="h-7 pl-7.5 text-[12.5px]"
          />
        </div>
        <span className="mx-0.5 h-4.5 w-px bg-border" />
        <Chip active={filterStatus === 'all'} onClick={() => setFilterStatus('all')}>
          全部 <ChipCount>{references.length}</ChipCount>
        </Chip>
        {(Object.keys(READING_STATUS_LABELS) as Array<ReadingStatus>).map((s) => (
          <Chip key={s} active={filterStatus === s} onClick={() => setFilterStatus(s)}>
            {READING_STATUS_LABELS[s]} <ChipCount>{statusCount(s)}</ChipCount>
          </Chip>
        ))}
      </FilterBar>

      {/* 批量操作条（勾选后出现） */}
      {selected.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border border-accent/40 bg-accent-soft/40 px-3 py-2 text-[12.5px]">
          <span className="font-medium text-text-2">
            已选 {selected.size} 条
            <span className="ml-1.5 font-normal text-text-3">按当前顺序编码</span>
          </span>
          <Button size="sm" variant="soft" onClick={() => copyBatch('gb')}>
            GB/T 7714
          </Button>
          <Button size="sm" variant="soft" onClick={() => copyBatch('bibtex')}>
            BibTeX
          </Button>
          <Button size="sm" variant="soft" onClick={() => copyBatch('apa')}>
            APA
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <button
              className="text-[11.5px] text-accent hover:underline cursor-pointer"
              onClick={() =>
                setSelected((prev) => {
                  const next = new Set(prev)
                  for (const r of pageRows) {
                    if (pageAllSelected) next.delete(r.id)
                    else next.add(r.id)
                  }
                  return next
                })
              }
            >
              {pageAllSelected ? '取消本页全选' : '全选本页'}
            </button>
            <button
              className="text-[11.5px] text-text-3 hover:text-text cursor-pointer"
              onClick={() => setSelected(new Set())}
            >
              清除选择
            </button>
          </div>
        </div>
      )}

      {/* 复制反馈（行内 toast，提示格式名） */}
      {copyMsg && <div className="mt-2 text-[12px] text-success">{copyMsg}</div>}

      {references.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title="还没有文献条目"
          hint="从 Zotero 导出 .bib（Better BibTeX）或 CSL JSON 后导入，管理阅读状态、笔记与引用清单；也可以手动新建零散条目。"
          action={
            <Button variant="primary" onClick={() => setImportOpen(true)}>
              <Download /> 导入文献
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<BookOpen />} title="没有符合条件的文献" hint="换个筛选条件试试。" />
      ) : (
        <div className="mt-4 flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
          {pageRows.map((r) => {
            const invalid = r.pdf_path !== null && pdfValidity[r.id] === false
            return (
              <div
                key={r.id}
                className="group flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4.5 py-3 transition-colors hover:bg-surface-2/40"
              >
                <CheckBox
                  checked={selected.has(r.id)}
                  onChange={(v) => toggleSelected(r.id, v)}
                  title="勾选后可批量复制引用"
                />
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setEditTarget(r)}
                  title="点击查看详情与编辑"
                >
                  <div className="truncate text-sm font-medium">{r.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-text-3">
                    {authorsText(r) && <span className="truncate">{authorsText(r)}</span>}
                    {r.year !== null && <span>· {r.year}</span>}
                    {r.venue && (
                      <span className="max-w-60 truncate" title={r.venue}>
                        · {r.venue}
                      </span>
                    )}
                    {r.citekey && (
                      <span className="font-mono text-[11px] opacity-80">{r.citekey}</span>
                    )}
                    {r.tags.slice(0, 3).map((t) => (
                      <Tag key={t} label={t} />
                    ))}
                    {r.tags.length > 3 && <span>+{r.tags.length - 3}</span>}
                  </div>
                </button>

                {/* 行内直接切换阅读状态（两步：点开下拉 → 选择） */}
                <Select
                  value={r.status}
                  onChange={(e) => updateReference(r.id, { status: e.target.value as ReadingStatus })}
                  className="h-7 w-20 shrink-0 text-[12.5px]"
                  title="切换阅读状态"
                >
                  {Object.entries(READING_STATUS_LABELS).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </Select>

                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  {r.pdf_path && (
                    <IconButton
                      title={invalid ? '路径不存在，点击重新指定' : '打开 PDF'}
                      className={invalid ? 'text-danger hover:bg-danger-soft hover:text-danger' : ''}
                      onClick={() => (invalid ? setEditTarget(r) : openPdf(r))}
                    >
                      <span className="font-mono text-[11.5px] font-semibold">PDF</span>
                    </IconButton>
                  )}
                  <button
                    className="rounded px-1.5 py-1 text-[11.5px] text-text-3 transition-colors hover:text-accent cursor-pointer"
                    title="复制 GB/T 7714 引用"
                    onClick={() => copyOne(r, 'gb')}
                  >
                    GB/T
                  </button>
                  <button
                    className="rounded px-1.5 py-1 text-[11.5px] text-text-3 transition-colors hover:text-accent cursor-pointer"
                    title="复制 BibTeX"
                    onClick={() => copyOne(r, 'bibtex')}
                  >
                    Bib
                  </button>
                  <button
                    className="rounded px-1.5 py-1 text-[11.5px] text-text-3 transition-colors hover:text-accent cursor-pointer"
                    title="复制 APA 引用"
                    onClick={() => copyOne(r, 'apa')}
                  >
                    APA
                  </button>
                  <IconButton title="编辑" onClick={() => setEditTarget(r)}>
                    <Pencil />
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
            )
          })}
        </div>
      )}

      {/* 分页（每页 100 条） */}
      {filtered.length > PAGE_SIZE && (
        <div className="mt-3 flex items-center justify-between text-[12.5px] text-text-3">
          <span className="tabular-nums">
            共 {filtered.length} 条 · 第 {currentPage}/{totalPages} 页
          </span>
          <div className="flex items-center gap-1">
            <IconButton
              title="上一页"
              disabled={currentPage <= 1}
              className="disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft />
            </IconButton>
            <IconButton
              title="下一页"
              disabled={currentPage >= totalPages}
              className="disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight />
            </IconButton>
          </div>
        </div>
      )}

      <ReferenceImportModal open={importOpen} onClose={() => setImportOpen(false)} />
      <ReferenceEditModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <ReferenceEditModal
        key={editTarget?.id}
        open={editTarget !== null}
        reference={editTarget ?? undefined}
        onClose={() => setEditTarget(null)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除文献"
        message={
          <>
            确定删除「{deleteTarget?.title}」吗？
            <br />
            论文「引用文献」标记中的该条目将一并解除；灵感与笔记中的内容不受影响。
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
