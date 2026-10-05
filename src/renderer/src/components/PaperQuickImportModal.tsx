// 论文快速导入弹窗：粘贴引文列表（每行一条）→ 宽松解析 → 可编辑预览 → 批量创建「已录用」论文
// 面向只做「已发表记录」的用户：不填初稿/投稿日期，导入后自动生成成果台账草稿（原始引文存入备注）
import { useMemo, useState } from 'react'
import { ClipboardPaste, RotateCcw } from 'lucide-react'
import type { PaperType } from '@shared/types'
import { PAPER_TYPE_LABELS } from '@shared/types'
import { useStore } from '@/store'
import { Badge, Button, CheckBox, Input, Modal, Select, Textarea } from '@/components/ui'
import { cn } from '@/lib/utils'
import { normalizePaperTitle, parseCitationText } from '@/lib/citationParse'

interface PreviewRow {
  raw: string
  title: string
  venue: string
  year: string
  type: PaperType
  confidence: 'structured' | 'fallback'
  include: boolean
}

export default function PaperQuickImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const papers = useStore((s) => s.papers)
  const addPaper = useStore((s) => s.addPaper)

  const [phase, setPhase] = useState<'input' | 'preview' | 'done'>('input')
  const [text, setText] = useState('')
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [addedCount, setAddedCount] = useState(0)

  const reset = (): void => {
    setPhase('input')
    setText('')
    setRows([])
    setAddedCount(0)
  }

  const close = (): void => {
    reset()
    onClose()
  }

  const pasteFromClipboard = async (): Promise<void> => {
    try {
      const t = await navigator.clipboard.readText()
      if (t) setText((prev) => (prev ? `${prev}\n${t}` : t))
    } catch {
      // 剪贴板权限不可用时静默跳过，用户仍可手动 Ctrl+V
    }
  }

  const parse = (): void => {
    setRows(
      parseCitationText(text).map(({ raw, draft }) => ({
        raw,
        title: draft.title,
        venue: draft.venue,
        year: draft.year !== null ? String(draft.year) : '',
        type: draft.type,
        confidence: draft.confidence,
        include: true
      }))
    )
    setPhase('preview')
  }

  const setRow = (idx: number, patch: Partial<PreviewRow>): void => {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  // 去重标记：与已有论文或本批次中先出现的同标题条目重复
  const markedRows = useMemo(() => {
    const existing = new Set(papers.map((p) => normalizePaperTitle(p.title)))
    const seen = new Set<string>()
    return rows.map((r) => {
      const key = normalizePaperTitle(r.title)
      const duplicate = key === '' || existing.has(key) || seen.has(key)
      if (!duplicate) seen.add(key)
      return { ...r, duplicate }
    })
  }, [rows, papers])

  const importable = markedRows.filter((r) => r.include && !r.duplicate && r.title.trim().length > 0)
  const dupCount = markedRows.filter((r) => r.duplicate).length
  const checkCount = markedRows.filter((r) => !r.duplicate && r.confidence === 'fallback').length

  const doImport = (): void => {
    let added = 0
    for (const r of importable) {
      // 年份列真正落库：非法值（非 1900–2100 的四位数字）按空处理，不再静默丢弃
      const y = Number.parseInt(r.year, 10)
      const year = Number.isInteger(y) && y >= 1900 && y <= 2100 ? y : null
      addPaper({
        title: r.title.trim(),
        venue: r.venue.trim(),
        type: r.type,
        status: 'accepted',
        year,
        note: r.raw
      })
      added++
    }
    setAddedCount(added)
    setPhase('done')
  }

  return (
    <Modal open={open} onClose={close} title="快速记录已发表论文" width="max-w-2xl">
      {phase === 'done' ? (
        <div className="flex flex-col gap-4 py-2 text-center">
          <div className="text-[15px] font-semibold">导入完成</div>
          <div className="text-[13px] text-text-2">
            创建 <span className="font-semibold tabular-nums text-success">{addedCount}</span> 篇「已录用」论文
            {addedCount > 0 && <>，已同步生成成果台账草稿</>}
          </div>
          <div className="flex justify-center gap-2">
            <Button onClick={reset}>
              <RotateCcw /> 继续导入
            </Button>
            <Button variant="primary" onClick={close}>
              完成
            </Button>
          </div>
        </div>
      ) : phase === 'input' ? (
        <div className="flex flex-col gap-3.5">
          <Textarea
            autoFocus
            rows={9}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              '每行一条引文，支持 GB/T 7714、PubMed 等常见格式：\n' +
              '张三,李四,王五,等.论文标题[J].期刊名称,2025,12(3):45-52.\n' +
              'Smith J, et al. Paper title[J]. Journal name, 2025, 90(8): e12345.\n' +
              '也可每行一个标题批量登记，其余信息稍后编辑补充'
            }
          />
          <div className="flex items-center justify-between gap-2 pt-1">
            <Button onClick={pasteFromClipboard}>
              <ClipboardPaste /> 从剪贴板粘贴
            </Button>
            <div className="flex gap-2">
              <Button onClick={close}>取消</Button>
              <Button
                variant="primary"
                disabled={!text.trim()}
                onClick={parse}
              >
                解析预览
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge color="green">可导入 {importable.length}</Badge>
            {dupCount > 0 && <Badge color="gray">重复 {dupCount}（默认跳过）</Badge>}
            {checkCount > 0 && <Badge color="yellow">待核对 {checkCount}</Badge>}
          </div>

          <div className="flex max-h-105 flex-col gap-1 overflow-y-auto">
            {markedRows.map((r, i) => (
              <div
                key={i}
                className={cn(
                  'flex flex-wrap items-center gap-1.5 rounded-lg px-1.5 py-1',
                  r.duplicate && 'opacity-55',
                  !r.duplicate && r.confidence === 'fallback' && 'bg-warn-soft/40'
                )}
              >
                <CheckBox
                  checked={r.include && !r.duplicate}
                  onChange={r.duplicate ? () => {} : (v) => setRow(i, { include: v })}
                  title={r.duplicate ? '与已有论文或本批次条目重复，默认跳过' : '是否导入此条'}
                />
                <Input
                  value={r.title}
                  onChange={(e) => setRow(i, { title: e.target.value })}
                  className="h-7 min-w-0 flex-1"
                  placeholder="论文标题（必填）"
                />
                <Input
                  value={r.venue}
                  onChange={(e) => setRow(i, { venue: e.target.value })}
                  className="h-7 w-36 shrink-0"
                  placeholder="期刊/会议"
                />
                <Input
                  value={r.year}
                  onChange={(e) => setRow(i, { year: e.target.value.replace(/[^\d]/g, '').slice(0, 4) })}
                  className="h-7 w-15 shrink-0 text-center"
                  placeholder="年份"
                />
                <Select
                  value={r.type}
                  onChange={(e) => setRow(i, { type: e.target.value as PaperType })}
                  className="h-7 w-21 shrink-0 text-[12px]"
                >
                  {Object.entries(PAPER_TYPE_LABELS).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </Select>
                {r.duplicate ? (
                  <Badge color="gray" className="shrink-0">
                    重复
                  </Badge>
                ) : r.confidence === 'fallback' ? (
                  <Badge color="yellow" className="shrink-0">
                    待核对
                  </Badge>
                ) : null}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-[11px] leading-relaxed text-text-3">
              黄底行未识别出期刊/年份结构（如专利、著作），请核对后导入。
              <br />
              导入后状态为「已录用」，日期/项目等可稍后编辑；原始引文保留在备注中。
            </span>
            <div className="flex shrink-0 gap-2">
              <Button onClick={() => setPhase('input')}>返回修改</Button>
              <Button variant="primary" disabled={importable.length === 0} onClick={doImport}>
                导入 {importable.length} 篇
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
