// 文献导入解析（主进程）：BibTeX（Zotero + Better BibTeX 导出）与 CSL JSON（Zotero 原生导出）
// 自研解析器，零 npm 依赖（PRD 决策 D14）；解析失败单条跳过并记录原因，绝不静默丢弃
// 覆盖边界（PRD 8.1）：7 类条目及别名、@string 宏、# 拼接、{}/"" 包裹、month 宏；crossref 不展开（按可解析字段导入并提示）
import fs from 'node:fs'
import type {
  ImportFailure,
  ParseReferencesResult,
  ReferenceDraft,
  ReferenceEntryType
} from '@shared/types'

/** BibTeX 条目类型 → 内部条目类型（仅 PRD 8.1 明确的子集，其余按失败报告） */
const BIBTEX_TYPE_MAP: Record<string, ReferenceEntryType> = {
  article: 'article',
  inproceedings: 'inproceedings',
  conference: 'inproceedings',
  book: 'book',
  phdthesis: 'phdthesis',
  mastersthesis: 'mastersthesis',
  techreport: 'techreport',
  misc: 'misc',
  online: 'misc',
  electronic: 'misc'
}

/** CSL item-type → 内部条目类型（CSL 类型集闭合，未列出的归入 misc 不丢数据） */
const CSL_TYPE_MAP: Record<string, ReferenceEntryType> = {
  'article-journal': 'article',
  'article-magazine': 'article',
  'article-newspaper': 'article',
  'paper-conference': 'inproceedings',
  book: 'book',
  thesis: 'phdthesis',
  report: 'techreport'
}

/** month 宏（展开失败比丢字段好，仅用于占位） */
const MONTH_MACROS: Record<string, string> = {
  jan: 'January', feb: 'February', mar: 'March', apr: 'April', may: 'May', jun: 'June',
  jul: 'July', aug: 'August', sep: 'September', oct: 'October', nov: 'November', dec: 'December'
}

interface RawFields {
  key: string
  fields: Record<string, string>
}

/** 读取文件并按扩展名分派解析（.json → CSL JSON，其余按 BibTeX） */
export function parseReferencesFile(filePath: string): ParseReferencesResult {
  let text: string
  try {
    text = fs.readFileSync(filePath, 'utf-8')
  } catch (err) {
    return { entries: [], failures: [], notes: [`文件读取失败：${String(err)}`] }
  }
  text = text.replace(/^\uFEFF/, '')
  if (filePath.toLowerCase().endsWith('.json')) {
    return parseCslJsonText(text)
  }
  return parseBibTeXText(text)
}

// ---------- BibTeX ----------

function parseBibTeXText(text: string): ParseReferencesResult {
  const strings: Record<string, string> = {}
  const entries: ReferenceDraft[] = []
  const failures: ImportFailure[] = []
  const notes: string[] = []
  let crossrefCount = 0

  let i = 0
  const n = text.length
  while (i < n) {
    const at = text.indexOf('@', i)
    if (at < 0) break
    i = at + 1
    const nameMatch = /^[a-zA-Z]+/.exec(text.slice(i))
    if (!nameMatch) continue // 游离的 @，跳过
    const typeName = nameMatch[0].toLowerCase()
    i += nameMatch[0].length
    while (i < n && /\s/.test(text[i])) i++
    if (typeName === 'comment') {
      // 注释内容整体忽略（平衡块跳过；不配对时退化为继续找下一个 @，注释不算解析失败）
      const openCh = text[i]
      if (openCh === '{' || openCh === '(') {
        const skipped = readBalanced(text, i, openCh)
        if (skipped) i = skipped.end
      }
      continue
    }

    const open = text[i]
    if (open !== '{' && open !== '(') continue
    const scanned = readBalanced(text, i, open)
    if (!scanned) {
      failures.push({ key: `@${typeName}`, reason: '花括号不配对，条目未闭合' })
      break
    }
    i = scanned.end

    if (typeName === 'string') {
      Object.assign(strings, parseStringDefs(scanned.body, strings))
      continue
    }
    if (typeName === 'preamble') continue

    const raw = parseEntryBody(scanned.body, strings)
    if (!raw) {
      failures.push({ key: `@${typeName}`, reason: '字段语法错误（无法定位 字段=值 结构）' })
      continue
    }
    const mapped = draftFromBibtex(raw, typeName)
    if (mapped.failure) {
      failures.push(mapped.failure)
      continue
    }
    if (raw.fields['crossref'] !== undefined) crossrefCount++
    entries.push(mapped.draft!)
  }

  if (crossrefCount > 0) {
    notes.push(`${crossrefCount} 条条目含 crossref，已按自身可解析字段导入（未展开继承字段）`)
  }
  return { entries, failures, notes }
}

/** 扫描平衡的 {...} 或 (...) 块，返回内部内容与结束位置 */
function readBalanced(
  text: string,
  start: number,
  open: string
): { body: string; end: number } | null {
  const close = open === '{' ? '}' : ')'
  let depth = 0
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{') depth++
    else if (ch === '}') depth--
    else if (ch === close && open === '(' && depth === 0) {
      return { body: text.slice(start + 1, i), end: i + 1 }
    }
    if (open === '{' && depth === 0 && i > start) {
      return { body: text.slice(start + 1, i), end: i + 1 }
    }
  }
  return null
}

/** 解析 @string 定义体（name = value，支持逗号分隔的多条） */
function parseStringDefs(body: string, outer: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  let pos = 0
  const skipWs = (): void => {
    while (pos < body.length && /\s/.test(body[pos])) pos++
  }
  skipWs()
  while (pos < body.length) {
    const nameMatch = /^[a-zA-Z][a-zA-Z0-9_\-]*/.exec(body.slice(pos))
    if (!nameMatch) break
    const name = nameMatch[0].toLowerCase()
    pos += nameMatch[0].length
    skipWs()
    if (body[pos] !== '=') break
    pos++
    const value = readFieldValue(body, pos, { ...outer, ...result })
    if (!value) break
    result[name] = value.value
    pos = value.end
    skipWs()
    if (body[pos] === ',') {
      pos++
      skipWs()
    } else break
  }
  return result
}

/** 解析条目体：`key, field = value, ...`；语法错误返回 null */
function parseEntryBody(
  body: string,
  strings: Record<string, string>
): { key: string; fields: Record<string, string> } | null {
  const comma = body.indexOf(',')
  const key = (comma < 0 ? body : body.slice(0, comma)).trim()
  const fields: Record<string, string> = {}
  if (comma < 0) return key ? { key, fields } : null

  let pos = comma + 1
  const skipWs = (): void => {
    while (pos < body.length && /\s/.test(body[pos])) pos++
  }
  skipWs()
  while (pos < body.length) {
    const nameMatch = /^[a-zA-Z][a-zA-Z0-9_\-]*/.exec(body.slice(pos))
    if (!nameMatch) return null
    const name = nameMatch[0].toLowerCase()
    pos += nameMatch[0].length
    skipWs()
    if (body[pos] !== '=') return null
    pos++
    const value = readFieldValue(body, pos, strings)
    if (!value) return null
    if (!(name in fields)) fields[name] = value.value // 重复字段以首个为准（BibTeX 惯例）
    pos = value.end
    skipWs()
    if (body[pos] === ',') {
      pos++
      skipWs()
    } else if (pos < body.length) {
      return null
    }
  }
  return { key, fields }
}

/** 读取一个字段值：`{...}` / `"..."` / 数字 / 宏名，支持 # 拼接与宏展开 */
function readFieldValue(
  body: string,
  start: number,
  strings: Record<string, string>
): { value: string; end: number } | null {
  let pos = start
  let result = ''
  for (;;) {
    while (pos < body.length && /\s/.test(body[pos])) pos++
    const ch = body[pos]
    if (ch === '{') {
      const scanned = readBalanced(body, pos, '{')
      if (!scanned) return null
      result += scanned.body
      pos = scanned.end
    } else if (ch === '"') {
      const end = body.indexOf('"', pos + 1)
      if (end < 0) return null
      result += body.slice(pos + 1, end)
      pos = end + 1
    } else if (ch >= '0' && ch <= '9') {
      const numMatch = /^[0-9]+/.exec(body.slice(pos))!
      result += numMatch[0]
      pos += numMatch[0].length
    } else if (/[a-zA-Z]/.test(ch)) {
      const macroMatch = /^[a-zA-Z][a-zA-Z0-9_\-]*/.exec(body.slice(pos))!
      const macro = macroMatch[0].toLowerCase()
      result += strings[macro] ?? MONTH_MACROS[macro] ?? ''
      pos += macroMatch[0].length
    } else {
      return null
    }
    while (pos < body.length && /\s/.test(body[pos])) pos++
    if (body[pos] === '#') {
      pos++
      continue
    }
    return { value: result, end: pos }
  }
}

/** BibTeX 原始条目 → 导入草稿（venue 按类型取 journal/booktitle/publisher/school/institution） */
function draftFromBibtex(
  raw: RawFields,
  typeName: string
): { draft?: ReferenceDraft; failure?: ImportFailure } {
  const entryType = BIBTEX_TYPE_MAP[typeName]
  if (!entryType) {
    return { failure: { key: raw.key || `@${typeName}`, reason: `不支持的条目类型 @${typeName}` } }
  }
  const title = cleanTex(raw.fields['title'] ?? '')
  if (!title) {
    return { failure: { key: raw.key || `@${typeName}`, reason: '缺少 title 字段' } }
  }
  const venueByType: Record<ReferenceEntryType, string[]> = {
    article: ['journal'],
    inproceedings: ['booktitle'],
    book: ['publisher'],
    phdthesis: ['school'],
    mastersthesis: ['school'],
    techreport: ['institution'],
    misc: ['howpublished']
  }
  const venueSource = venueByType[entryType].map((f) => raw.fields[f] ?? '').find((v) => v !== '')
  // misc 的 howpublished 常是 \url{...}，与 url 字段重复时留空
  const venue =
    entryType === 'misc' && /^\\?url\s*\{|^https?:\/\//i.test(venueSource ?? '') ? '' : cleanTex(venueSource ?? '')
  return {
    draft: {
      citekey: raw.key.trim(),
      entry_type: entryType,
      title,
      authors: splitAuthors(raw.fields['author'] ?? raw.fields['editor'] ?? ''),
      year: extractYear(raw.fields['year'] ?? raw.fields['date'] ?? ''),
      venue,
      volume: cleanTex(raw.fields['volume'] ?? ''),
      issue: cleanTex(raw.fields['number'] ?? ''),
      pages: cleanPages(raw.fields['pages'] ?? ''),
      doi: cleanDoi(raw.fields['doi'] ?? ''),
      url: cleanTex(raw.fields['url'] ?? ''),
      tags: splitKeywords(raw.fields['keywords'] ?? '')
    }
  }
}

/** 作者列表：按 ` and ` 拆分（Zotero 导出惯例），清洗 TeX 标记 */
function splitAuthors(raw: string): string[] {
  return raw
    .split(/\s+and\s+/i)
    .map((a) => cleanTex(a))
    .filter((a) => a !== '')
}

/** 年份：优先 year 字段，兼容 Better BibTeX 的 date 字段（取前 4 位数字） */
function extractYear(raw: string): number | null {
  const match = /(\d{4})/.exec(cleanTex(raw))
  return match ? parseInt(match[1], 10) : null
}

/** 页码：`100--110` / `100 – 110` 归一为 `100-110` */
function cleanPages(raw: string): string {
  return cleanTex(raw).replace(/\s*[-–—]{1,2}\s*/g, '-')
}

/** DOI：剥掉 doi: 前缀与 https://doi.org/ 域名，统一小写 */
function cleanDoi(raw: string): string {
  const cleaned = cleanTex(raw)
    .replace(/^doi:\s*/i, '')
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .trim()
  return cleaned.toLowerCase()
}

/** 关键词：逗号/分号分隔（Better BibTeX 两种都导出过） */
function splitKeywords(raw: string): string[] {
  return cleanTex(raw)
    .split(/[,;]/)
    .map((k) => k.trim())
    .filter((k) => k !== '')
}

/** 清洗 TeX 标记：去大小写保护花括号、展开 \url/\href、折叠重音命令、还原转义字符、折叠空白 */
function cleanTex(s: string): string {
  return s
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\\url\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\href\s*\{[^{}]*\}\s*\{([^{}]*)\}/g, '$1')
    // 重音命令折叠为裸字母：\'e / \"{o} / \`i 等（ASCII 折叠，避免残留反斜杠）
    .replace(/\\['"`^~=]\\?\{([a-zA-Z])\}|\\['"`^~=]([a-zA-Z])/g, (_m, braced?: string, bare?: string) => braced ?? bare ?? '')
    .replace(/\\\\/g, ' ')
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\[\]]*\])?(?:\{([^{}]*)\})?/g, (_m, inner?: string) => inner ?? '')
    .replace(/\\([&#%$#_{}~^\\])/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/``|''/g, '"')
    .replace(/~/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// ---------- CSL JSON ----------

interface CslItem {
  id?: string
  type?: string
  title?: string
  author?: Array<{ family?: string; given?: string; literal?: string }>
  issued?: { 'date-parts'?: number[][] }
  'container-title'?: string | string[]
  publisher?: string
  volume?: string | number
  issue?: string | number
  page?: string | number
  DOI?: string
  URL?: string
  tags?: Array<{ tag?: string }>
  keyword?: string
}

function parseCslJsonText(text: string): ParseReferencesResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return {
      entries: [],
      failures: [],
      notes: ['JSON 解析失败：请确认文件是 Zotero「文件 → 导出 → CSL JSON」导出的 JSON']
    }
  }
  const items: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { items?: unknown[] })?.items)
      ? (data as { items: unknown[] }).items
      : []
  if (items.length === 0) {
    return { entries: [], failures: [], notes: ['文件中未找到条目（CSL JSON 应为条目数组）'] }
  }

  const entries: ReferenceDraft[] = []
  const failures: ImportFailure[] = []
  const usedCitekeys = new Set<string>()
  items.forEach((item, index) => {
    const csl = item as CslItem
    const title = String(csl.title ?? '').trim()
    if (!title) {
      failures.push({ key: csl.id ?? `第 ${index + 1} 条`, reason: '缺少 title 字段' })
      return
    }
    const entryType = CSL_TYPE_MAP[csl.type ?? ''] ?? 'misc'
    const containerTitle = Array.isArray(csl['container-title'])
      ? String(csl['container-title'][0] ?? '')
      : String(csl['container-title'] ?? '')
    // 图书/学位论文/报告的 venue 取 publisher，其余取 container-title
    const venue =
      entryType === 'book' || entryType === 'phdthesis' || entryType === 'techreport'
        ? String(csl.publisher ?? '')
        : containerTitle
    const keywords = [
      ...(csl.tags ?? []).map((t) => String(t.tag ?? '').trim()),
      ...String(csl.keyword ?? '').split(/[,;]/)
    ].filter((k) => k !== '')
    entries.push({
      citekey: generateCitekey(csl, usedCitekeys),
      entry_type: entryType,
      title,
      authors: (csl.author ?? [])
        .map((a) =>
          a.literal
            ? a.literal.trim()
            : [a.given?.trim(), a.family?.trim()].filter(Boolean).join(' ')
        )
        .filter((a) => a !== ''),
      year: csl.issued?.['date-parts']?.[0]?.[0] ?? null,
      venue: venue.trim(),
      volume: String(csl.volume ?? ''),
      issue: String(csl.issue ?? ''),
      pages: cleanPages(String(csl.page ?? '')),
      doi: cleanDoi(String(csl.DOI ?? '')),
      url: String(csl.URL ?? '').trim(),
      tags: Array.from(new Set(keywords))
    })
  })
  return { entries, failures, notes: [] }
}

/** CSL 无 citekey：按「首作者姓 + 年份」生成（去重追加序号） */
function generateCitekey(csl: CslItem, used: Set<string>): string {
  const first = csl.author?.[0]
  const family = (first?.family ?? first?.literal ?? 'ref').toLowerCase().replace(/[^a-z0-9]/g, '')
  const year = csl.issued?.['date-parts']?.[0]?.[0] ?? ''
  const base = `${family || 'ref'}${year}`
  let key = base
  let n = 2
  while (used.has(key)) {
    key = `${base}-${n}`
    n++
  }
  used.add(key)
  return key
}
