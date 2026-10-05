// 文献导入弹窗：选择 .bib（BibTeX）/ .json（CSL JSON）→ 主进程解析 → 去重比对预览 → 确认导入
// 去重判定顺序（决策 D11）：DOI → citekey → 标题归一化 + 年份；默认跳过重复（决策 D16）
import { useMemo, useState } from 'react'
import { FileUp, RotateCcw } from 'lucide-react'
import type { ParseReferencesResult, Reference, ReferenceDraft } from '@shared/types'
import { useStore } from '@/store'
import { Badge, Button, CheckBox, Modal } from '@/components/ui'

/** 标题归一化：去空白、统一小写后比对 */
function normalizeTitle(t: string): string {
  return t.replace(/\s+/g, '').toLowerCase()
}

/** 用导入数据填充本地空缺字段（仅空值，不覆盖已有内容） */
function fillPatch(local: Reference, draft: ReferenceDraft): Partial<Reference> | null {
  const patch: Partial<Reference> = {}
  if (!local.citekey && draft.citekey) patch.citekey = draft.citekey
  if (local.authors.length === 0 && draft.authors.length > 0) patch.authors = draft.authors
  if (local.year === null && draft.year !== null) patch.year = draft.year
  if (!local.venue && draft.venue) patch.venue = draft.venue
  if (!local.volume && draft.volume) patch.volume = draft.volume
  if (!local.issue && draft.issue) patch.issue = draft.issue
  if (!local.pages && draft.pages) patch.pages = draft.pages
  if (!local.doi && draft.doi) patch.doi = draft.doi
  if (!local.url && draft.url) patch.url = draft.url
  return Object.keys(patch).length > 0 ? patch : null
}

interface ImportPreview {
  adds: ReferenceDraft[]
  updates: Array<{ id: string; patch: Partial<Reference> }>
  skips: number
}

export default function ReferenceImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const references = useStore((s) => s.references)
  const importReferences = useStore((s) => s.importReferences)

  const [filePath, setFilePath] = useState('')
  const [parsing, setParsing] = useState(false)
  const [result, setResult] = useState<ParseReferencesResult | null>(null)
  const [fillEmpty, setFillEmpty] = useState(false)
  const [importing, setImporting] = useState(false)
  const [doneCounts, setDoneCounts] = useState<{ added: number; updated: number } | null>(null)

  // 打开时重置状态
  const reset = (): void => {
    setFilePath('')
    setResult(null)
    setFillEmpty(false)
    setImporting(false)
    setDoneCounts(null)
  }

  const close = (): void => {
    reset()
    onClose()
  }

  const pickFile = async (): Promise<void> => {
    const p = await window.api.pickPath('file', [{ name: '文献导出文件', extensions: ['bib', 'json'] }])
    if (!p) return
    setFilePath(p)
    setDoneCounts(null)
    setParsing(true)
    try {
      // 解析在主进程执行，大文件不阻塞渲染层
      const parsed = await window.api.parseReferencesFile(p)
      setResult(parsed)
    } catch (err) {
      setResult({ entries: [], failures: [], notes: [`解析请求失败：${String(err)}`] })
    }
    setParsing(false)
  }

  // 去重比对：DOI → citekey → 标题+年份（索引化，2000 条量级瞬时完成）；同一批次内的重复同样计入跳过
  const preview: ImportPreview = useMemo(() => {
    if (!result) return { adds: [], updates: [], skips: 0 }
    const byDoi = new Map<string, Reference>()
    const byCitekey = new Map<string, Reference>()
    const byTitleYear = new Map<string, Reference>()
    for (const r of references) {
      if (r.doi) byDoi.set(r.doi, r)
      if (r.citekey) byCitekey.set(r.citekey, r)
      byTitleYear.set(`${normalizeTitle(r.title)}|${r.year}`, r)
    }
    const adds: ReferenceDraft[] = []
    const updates: ImportPreview['updates'] = []
    const batchSeen = new Set<string>() // 本批次内已见过的条目（同一键先出现的生效）
    let skips = 0
    for (const d of result.entries) {
      const batchKey = d.doi
        ? `doi:${d.doi}`
        : d.citekey
          ? `ck:${d.citekey}`
          : `ty:${normalizeTitle(d.title)}|${d.year}`
      if (batchSeen.has(batchKey)) {
        skips++
        continue
      }
      batchSeen.add(batchKey)
      const local =
        (d.doi ? byDoi.get(d.doi) : undefined) ??
        (d.citekey ? byCitekey.get(d.citekey) : undefined) ??
        byTitleYear.get(`${normalizeTitle(d.title)}|${d.year}`)
      if (!local) {
        adds.push(d)
      } else if (fillEmpty) {
        const patch = fillPatch(local, d)
        if (patch) updates.push({ id: local.id, patch })
        else skips++
      } else {
        skips++
      }
    }
    return { adds, updates, skips }
  }, [result, references, fillEmpty])

  const doImport = (): void => {
    setImporting(true)
    importReferences(preview.adds, fillEmpty ? preview.updates : [])
    setDoneCounts({ added: preview.adds.length, updated: fillEmpty ? preview.updates.length : 0 })
    setImporting(false)
  }

  const fileName = filePath.split(/[\\/]/).pop() ?? ''

  return (
    <Modal open={open} onClose={close} title="导入文献" width="max-w-lg">
      {doneCounts ? (
        <div className="flex flex-col gap-4 py-2 text-center">
          <div className="text-[15px] font-semibold">导入完成</div>
          <div className="text-[13px] text-text-2">
            新增 <span className="font-semibold tabular-nums text-success">{doneCounts.added}</span> 条
            {doneCounts.updated > 0 && (
              <>
                {' '}· 更新 <span className="font-semibold tabular-nums text-accent">{doneCounts.updated}</span> 条
              </>
            )}
            {result && result.failures.length > 0 && (
              <>
                {' '}· 解析失败 <span className="font-semibold tabular-nums text-danger">{result.failures.length}</span> 条
              </>
            )}
          </div>
          <div className="flex justify-center gap-2">
            <Button
              onClick={() => {
                reset()
              }}
            >
              <RotateCcw /> 继续导入
            </Button>
            <Button variant="primary" onClick={close}>
              完成
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {/* 文件选择 */}
          <button
            onClick={pickFile}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface-2/40 px-4 py-7 text-center transition-colors hover:border-accent/60"
          >
            <FileUp size={20} className="text-text-3" />
            {filePath ? (
              <>
                <span className="text-[13px] font-medium text-text">{fileName}</span>
                <span className="text-[11.5px] text-text-3">点击重新选择文件</span>
              </>
            ) : (
              <>
                <span className="text-[13px] font-medium text-text-2">选择导出文件</span>
                <span className="text-[11.5px] text-text-3">支持 .bib（Better BibTeX）与 .json（CSL JSON）</span>
              </>
            )}
          </button>

          {parsing && <div className="text-center text-[12.5px] text-text-3">正在解析（主进程执行，不卡界面）…</div>}

          {/* 预览 */}
          {result && !parsing && (
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                <Badge color="green">新增 {preview.adds.length}</Badge>
                <Badge color="blue">更新 {fillEmpty ? preview.updates.length : 0}</Badge>
                <Badge color="gray">跳过 {preview.skips}（重复）</Badge>
                <Badge color="red">失败 {result.failures.length}</Badge>
              </div>
              <label className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-text-3">
                <CheckBox checked={fillEmpty} onChange={setFillEmpty} title="重复条目用导入数据填充本地空缺字段" />
                重复条目用导入数据填充本地空缺字段（不勾选则默认跳过）
              </label>
              {result.notes.map((n) => (
                <div key={n} className="rounded-lg bg-warn-soft/60 px-2.5 py-1.5 text-[11.5px] text-warn">
                  {n}
                </div>
              ))}
              {result.failures.length > 0 && (
                <div className="max-h-36 overflow-y-auto rounded-lg border border-border px-2.5 py-1.5">
                  {result.failures.map((f, i) => (
                    <div key={`${f.key}-${i}`} className="py-0.5 text-[11.5px] text-text-3">
                      <span className="font-mono text-[11px]">{f.key}</span>
                      <span className="mx-1.5">—</span>
                      {f.reason}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-[11px] leading-relaxed text-text-3">
              Zotero 导出：Better BibTeX 插件导出 .bib；或「文件 → 导出库」格式选 CSL JSON。
              <br />
              导入为单向快照，重复导入自动按 DOI / citekey / 标题+年份 去重。
            </span>
            <div className="flex shrink-0 gap-2">
              <Button onClick={close}>取消</Button>
              <Button
                variant="primary"
                disabled={!result || parsing || (preview.adds.length === 0 && (!fillEmpty || preview.updates.length === 0))}
                onClick={doImport}
              >
                {importing ? '导入中…' : `导入 ${preview.adds.length + (fillEmpty ? preview.updates.length : 0)} 条`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
