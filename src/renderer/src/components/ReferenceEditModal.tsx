// 文献条目详情浮层：完整字段 + 笔记（Markdown）+ 关联项目 + PDF 路径
// 主链串联：「记一条灵感」（速记预填前缀）、「已引用于」论文多选标记、三种引用格式复制
import { useEffect, useRef, useState } from 'react'
import { FolderOpen, Lightbulb } from 'lucide-react'
import type { ReadingStatus, Reference, ReferenceEntryType } from '@shared/types'
import {
  PAPER_STATUS_LABELS,
  READING_STATUS_LABELS,
  REFERENCE_ENTRY_TYPE_LABELS
} from '@shared/types'
import { useStore } from '@/store'
import { useAllTags } from '@/hooks/useVocab'
import { Badge, Button, CheckBox, Field, Input, Modal, Select, Textarea } from '@/components/ui'
import TagInput from '@/components/TagInput'
import { useCaptureStore } from '@/captureStore'
import { copyText } from '@/lib/clipboard'
import { formatAPA, formatBibTeX, formatGB7714 } from '@/lib/citation'

interface ReferenceEditModalProps {
  open: boolean
  onClose: () => void
  reference?: Reference
}

/** venue 输入框标签随条目类型变化（与导入映射一致） */
const VENUE_LABELS: Record<ReferenceEntryType, string> = {
  article: '期刊名',
  inproceedings: '会议/论文集名',
  book: '出版社',
  phdthesis: '学位授予单位',
  mastersthesis: '学位授予单位',
  techreport: '发布机构',
  misc: '来源'
}

export default function ReferenceEditModal({ open, onClose, reference }: ReferenceEditModalProps) {
  const projects = useStore((s) => s.projects)
  const papers = useStore((s) => s.papers)
  const addReference = useStore((s) => s.addReference)
  const updateReference = useStore((s) => s.updateReference)
  const updatePaper = useStore((s) => s.updatePaper)
  const tagSuggestions = useAllTags()

  const [title, setTitle] = useState('')
  const [entryType, setEntryType] = useState<ReferenceEntryType>('article')
  const [year, setYear] = useState('')
  const [venue, setVenue] = useState('')
  const [authors, setAuthors] = useState('')
  const [volume, setVolume] = useState('')
  const [issue, setIssue] = useState('')
  const [pages, setPages] = useState('')
  const [citekey, setCitekey] = useState('')
  const [doi, setDoi] = useState('')
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<ReadingStatus>('unread')
  const [projectId, setProjectId] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [pdfPath, setPdfPath] = useState('')
  const [note, setNote] = useState('')
  const [copyMsg, setCopyMsg] = useState(false)

  const defaultsRef = useRef(reference)
  defaultsRef.current = reference

  useEffect(() => {
    if (!open) return
    const r = defaultsRef.current
    setTitle(r?.title ?? '')
    setEntryType(r?.entry_type ?? 'article')
    setYear(r?.year !== null && r?.year !== undefined ? String(r.year) : '')
    setVenue(r?.venue ?? '')
    setAuthors(r?.authors.join('\n') ?? '')
    setVolume(r?.volume ?? '')
    setIssue(r?.issue ?? '')
    setPages(r?.pages ?? '')
    setCitekey(r?.citekey ?? '')
    setDoi(r?.doi ?? '')
    setUrl(r?.url ?? '')
    setStatus(r?.status ?? 'unread')
    setProjectId(r?.project_id ?? '')
    setTags(r?.tags ?? [])
    setPdfPath(r?.pdf_path ?? '')
    setNote(r?.note ?? '')
    setCopyMsg(false)
  }, [open])

  const submit = (): void => {
    const trimmed = title.trim()
    if (!trimmed) return
    const payload = {
      title: trimmed,
      entry_type: entryType,
      authors: authors
        .split('\n')
        .map((a) => a.trim())
        .filter((a) => a !== ''),
      year: year.trim() ? parseInt(year, 10) : null,
      venue: venue.trim(),
      volume: volume.trim(),
      issue: issue.trim(),
      pages: pages.trim(),
      citekey: citekey.trim(),
      doi: doi.trim(),
      url: url.trim(),
      status,
      project_id: projectId || null,
      tags,
      pdf_path: pdfPath.trim() || null,
      note
    }
    if (reference) {
      updateReference(reference.id, payload)
    } else {
      addReference(payload)
    }
    onClose()
  }

  /** 文献 → 灵感：唤起全局速记框并预填 [文献] 标题前缀（无外键，溯源靠前缀文本） */
  const noteIdea = (): void => {
    const finalTitle = title.trim() || reference?.title || ''
    useCaptureStore.getState().show(`[文献] ${finalTitle}：`)
  }

  /** 文献 → 论文：勾选写入 Paper.cited_reference_ids（投稿前核对相关工作引用） */
  const toggleCited = (paperId: string, checked: boolean): void => {
    if (!reference) return
    const paper = papers.find((p) => p.id === paperId)
    if (!paper) return
    const current = new Set(paper.cited_reference_ids)
    if (checked) current.add(reference.id)
    else current.delete(reference.id)
    updatePaper(paperId, { cited_reference_ids: [...current] })
  }

  const pickPdf = async (): Promise<void> => {
    const p = await window.api.pickPath('file', [{ name: 'PDF 文档', extensions: ['pdf'] }])
    if (p) setPdfPath(p)
  }

  const doCopy = async (kind: 'gb' | 'bibtex' | 'apa'): Promise<void> => {
    if (!reference) return
    await copyText(kind === 'gb' ? formatGB7714(reference) : kind === 'bibtex' ? formatBibTeX(reference) : formatAPA(reference))
    setCopyMsg(true)
    setTimeout(() => setCopyMsg(false), 2500)
  }

  const currentReference = reference // 「已引用于」与复制仅编辑已有条目时可用（新建保存后再用）
  const citedCount = currentReference
    ? papers.filter((p) => p.cited_reference_ids.includes(currentReference.id)).length
    : 0

  return (
    <Modal open={open} onClose={onClose} title={reference ? '文献详情' : '新建文献'} width="max-w-xl">
      <div className="flex flex-col gap-3.5">
        <Field label="标题（必填）">
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="文献标题" />
        </Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="类型">
            <Select value={entryType} onChange={(e) => setEntryType(e.target.value as ReferenceEntryType)}>
              {Object.entries(REFERENCE_ENTRY_TYPE_LABELS).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="年份">
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="如 2024"
            />
          </Field>
          <Field label={VENUE_LABELS[entryType]}>
            <Input value={venue} onChange={(e) => setVenue(e.target.value)} />
          </Field>
          <Field label="阅读状态">
            <Select value={status} onChange={(e) => setStatus(e.target.value as ReadingStatus)}>
              {Object.entries(READING_STATUS_LABELS).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="作者（每行一位，支持「姓, 名」或「名 姓」）">
          <Textarea
            rows={2}
            value={authors}
            onChange={(e) => setAuthors(e.target.value)}
            placeholder={'Einstein, Albert\nBohr, Niels'}
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="卷">
            <Input value={volume} onChange={(e) => setVolume(e.target.value)} />
          </Field>
          <Field label="期">
            <Input value={issue} onChange={(e) => setIssue(e.target.value)} />
          </Field>
          <Field label="页码">
            <Input value={pages} onChange={(e) => setPages(e.target.value)} placeholder="100-110" />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="citekey（BibTeX 引用键）">
            <Input value={citekey} onChange={(e) => setCitekey(e.target.value)} placeholder="如 einstein1905" />
          </Field>
          <Field label="DOI">
            <Input value={doi} onChange={(e) => setDoi(e.target.value)} placeholder="10.xxxx/xxxxx" />
          </Field>
        </div>
        <Field label="链接 URL">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="关联项目">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">无</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="标签">
            <div>
              <TagInput
                value={tags}
                onChange={setTags}
                suggestions={tagSuggestions}
                placeholder="标签（回车确认）"
                id="reference-tags"
              />
            </div>
          </Field>
        </div>
        <Field label="本地 PDF 路径（用系统默认阅读器打开）">
          <div className="flex gap-2">
            <Input
              value={pdfPath}
              onChange={(e) => setPdfPath(e.target.value)}
              placeholder="选择或粘贴本地 PDF 文件路径"
            />
            <Button className="shrink-0" onClick={pickPdf}>
              <FolderOpen /> 浏览
            </Button>
            {pdfPath && (
              <Button variant="ghost" onClick={() => setPdfPath('')}>
                清除
              </Button>
            )}
          </div>
        </Field>
        <Field label="笔记（Markdown）">
          <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="核心要点、对自己的启发…" />
        </Field>

        {/* 主链串联：读 → 记 → 引 */}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="soft" onClick={noteIdea} disabled={!title.trim() && !reference}>
            <Lightbulb /> 记一条灵感
          </Button>
          {currentReference && (
            <div className="ml-auto flex items-center gap-2">
              {copyMsg && <span className="text-[11.5px] text-success">已复制引用</span>}
              <Button size="sm" onClick={() => doCopy('gb')}>
                GB/T
              </Button>
              <Button size="sm" onClick={() => doCopy('bibtex')}>
                BibTeX
              </Button>
              <Button size="sm" onClick={() => doCopy('apa')}>
                APA
              </Button>
            </div>
          )}
        </div>

        {/* 已引用于论文（多选标记，写入 Paper.cited_reference_ids） */}
        {currentReference && (
          <div className="rounded-xl border border-border p-3.5">
            <div className="mb-2 text-[12.5px] font-medium text-text-2">
              已引用于论文
              <span className="ml-1.5 font-normal text-text-3">
                {citedCount > 0 ? `${citedCount} 篇` : '投稿前核对相关工作引用时在此标记'}
              </span>
            </div>
            {papers.length === 0 ? (
              <div className="py-2 text-center text-[11.5px] text-text-3">
                还没有登记论文，去论文投稿页新建后可在此标记引用
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {papers.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2/60"
                  >
                    <CheckBox
                      checked={p.cited_reference_ids.includes(currentReference.id)}
                      onChange={(v) => toggleCited(p.id, v)}
                      title={p.cited_reference_ids.includes(currentReference.id) ? '取消引用标记' : '标记为已引用'}
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{p.title}</span>
                    <Badge color="gray">{PAPER_STATUS_LABELS[p.status]}</Badge>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-[11px] text-text-3">
            阅读状态固定四态（待读 / 在读 / 已读 / 略读），全局统一便于筛选
          </span>
          <div className="flex gap-2">
            <Button onClick={onClose}>取消</Button>
            <Button variant="primary" onClick={submit} disabled={!title.trim()}>
              {reference ? '保存' : '创建'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
