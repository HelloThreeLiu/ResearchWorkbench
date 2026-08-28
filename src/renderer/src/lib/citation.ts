// 文献引用格式化：GB/T 7714—2015（顺序编码制）/ BibTeX / APA 7（简化）三种纯函数
// 零依赖自研（PRD 决策 D11/D14）；CJK 判定按标题是否含中文字符（[\u4e00-\u9fff]）
import type { Reference, ReferenceEntryType } from '@shared/types'

/** GB/T 7714 文献类型标识：期刊 [J]、会议论文集 [C]、图书 [M]、学位论文 [D]、报告 [R]、电子资源 [EB/OL] */
const GB_TYPE_MARKERS: Record<ReferenceEntryType, string> = {
  article: '[J]',
  inproceedings: '[C]',
  book: '[M]',
  phdthesis: '[D]',
  mastersthesis: '[D]',
  techreport: '[R]',
  misc: '[EB/OL]'
}

/** BibTeX 序列化时 venue 对应的字段名（与导入映射互逆） */
const BIBTEX_VENUE_FIELDS: Record<ReferenceEntryType, string> = {
  article: 'journal',
  inproceedings: 'booktitle',
  book: 'publisher',
  phdthesis: 'school',
  mastersthesis: 'school',
  techreport: 'institution',
  misc: 'howpublished'
}

/** 标题含 CJK 字符 → 按中文文献规则（等 / 原样姓名） */
function isCJK(s: string): boolean {
  return /[\u4e00-\u9fff]/.test(s)
}

interface ParsedAuthor {
  family: string
  given: string
  cjk: boolean
}

/** 解析单个作者：兼容「姓, 名」（BibTeX 导入）与「名 姓」（CSL 导入）；CJK 姓名整体视作姓 */
function parseAuthor(raw: string): ParsedAuthor {
  const trimmed = raw.trim()
  const cjk = isCJK(trimmed)
  if (trimmed.includes(',')) {
    const idx = trimmed.indexOf(',')
    return { family: trimmed.slice(0, idx).trim(), given: trimmed.slice(idx + 1).trim(), cjk }
  }
  if (cjk) return { family: trimmed, given: '', cjk }
  const words = trimmed.split(/\s+/)
  if (words.length === 1) return { family: words[0], given: '', cjk }
  // 末尾连续小写词并入姓（van der Berg、de la Cruz 等）
  let cut = words.length - 1
  while (cut > 0 && /^[a-z]/.test(words[cut - 1])) cut--
  return { family: words.slice(cut).join(' '), given: words.slice(0, cut).join(' '), cjk }
}

/** 名缩写：Albert Matthew → A M */
function initialsOf(given: string): string[] {
  return given
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
}

/** GB/T 作者：姓全大写 + 名缩写（EINSTEIN A）；≤3 位全列，>3 位前 3 位加「等 / et al.」 */
function authorsGB(authors: string[], cjk: boolean): string {
  const mapped = authors.map((a) => {
    const p = parseAuthor(a)
    if (p.cjk) return a.trim()
    const initials = initialsOf(p.given).join(' ')
    return p.family.toUpperCase() + (initials ? ` ${initials}` : '')
  })
  const listed = mapped.length > 3 ? mapped.slice(0, 3).concat([cjk ? '等' : 'et al']) : mapped
  return listed.join(', ')
}

/** APA 作者：Family, I. A.；≤3 位全列（末位前 &），>3 位前 3 位加「，等 / , et al」（结尾不加句点，由调用方补） */
function authorsAPA(authors: string[], cjk: boolean): string {
  const mapped = authors.map((a) => {
    const p = parseAuthor(a)
    if (p.cjk) return a.trim()
    const initials = initialsOf(p.given).map((i) => `${i}.`).join(' ')
    return p.family + (initials ? `, ${initials}` : '')
  })
  if (mapped.length > 3) {
    return mapped.slice(0, 3).join(cjk ? '，' : ', ') + (cjk ? '，等' : ', et al')
  }
  if (mapped.length <= 1) return mapped.join('')
  if (cjk) return mapped.join('，')
  return mapped.slice(0, -1).join(', ') + ', & ' + mapped[mapped.length - 1]
}

/** 卷(期)：只有一项时单独输出 */
function volumeIssue(volume: string, issue: string): string {
  if (volume && issue) return `${volume}(${issue})`
  return volume || issue
}

/** GB/T 7714（顺序编码制，单条）：作者. 题名[标识]. 出处, 年, 卷(期): 页码. */
export function formatGB7714(ref: Reference): string {
  const cjk = isCJK(ref.title)
  const authors = authorsGB(ref.authors, cjk)
  const marker = GB_TYPE_MARKERS[ref.entry_type]
  let s = authors ? `${authors}. ` : ''
  s += `${ref.title}${marker}`
  if (ref.entry_type === 'inproceedings') {
    // 会议论文：[C]//论文集名. 年: 页码.
    const tail = [ref.year ? String(ref.year) : '', ref.pages].filter(Boolean).join(': ')
    s += ref.venue ? `//${ref.venue}.` : '.'
    if (tail) s += ` ${tail}.`
  } else if (ref.entry_type === 'misc') {
    // 电子资源：年. 访问路径.
    const access = ref.url || (ref.doi ? `https://doi.org/${ref.doi}` : '')
    const tail = [ref.year ? String(ref.year) : '', access].filter(Boolean).join('. ')
    s += '.'
    if (tail) s += ` ${tail}.`
  } else {
    // 期刊/图书/学位论文/报告：出处, 年, 卷(期): 页码.
    const head = [
      ref.venue,
      ref.year ? String(ref.year) : '',
      volumeIssue(ref.volume, ref.issue)
    ]
      .filter(Boolean)
      .join(', ')
    const tail = [head, ref.pages].filter(Boolean).join(': ')
    s += '.'
    if (tail) s += ` ${tail}.`
  }
  return s
}

/** BibTeX（单条）：由存储字段重新序列化，citekey 原样保留（无 citekey 时按「姓+年」生成） */
export function formatBibTeX(ref: Reference): string {
  const lines: string[] = []
  const push = (key: string, value: string): void => {
    if (value) lines.push(`  ${key} = {${value}}`)
  }
  push('title', ref.title)
  if (ref.authors.length > 0) push('author', ref.authors.join(' and '))
  if (ref.year) push('year', String(ref.year))
  push(BIBTEX_VENUE_FIELDS[ref.entry_type], ref.venue)
  push('volume', ref.volume)
  push('number', ref.issue)
  push('pages', ref.pages)
  push('doi', ref.doi)
  push('url', ref.url)
  const key = ref.citekey || fallbackCitekey(ref)
  return `@${ref.entry_type}{${key},\n${lines.join(',\n')}\n}`
}

/** citekey 缺省时按「首作者姓 + 年份」生成（小写、去非字母数字） */
function fallbackCitekey(ref: Reference): string {
  const family = parseAuthor(ref.authors[0] ?? '').family.toLowerCase().replace(/[^a-z0-9]/g, '')
  return `${family || 'ref'}${ref.year ?? ''}`
}

/** APA 第 7 版（简化，单条）：作者. (年). 题名. Venue, 卷(期), 页码. doi/URL */
export function formatAPA(ref: Reference): string {
  const cjk = isCJK(ref.title)
  const authors = authorsAPA(ref.authors, cjk)
  // 英文作者以缩写点结尾时不再重复补句点（van der Berg, L.）
  let s = authors ? (authors.endsWith('.') ? `${authors} ` : `${authors}. `) : ''
  if (ref.year) s += `(${ref.year}). `
  s += `${ref.title}.`
  const seg = [ref.venue, volumeIssue(ref.volume, ref.issue), ref.pages].filter(Boolean).join(', ')
  if (seg) s += ` ${seg}.`
  const link = ref.doi ? `https://doi.org/${ref.doi}` : ref.url
  if (link) s += ` ${link}`
  return s
}

// ---------- 批量（列表勾选多条后复制） ----------

/** GB/T 批量：按顺序编码制生成带 [1][2] 编号的引用块 */
export function formatGB7714Block(refs: Reference[]): string {
  return refs.map((r, i) => `[${i + 1}] ${formatGB7714(r)}`).join('\n')
}

/** BibTeX / APA 批量：条目间以空行分隔 */
export function formatBibTeXBlock(refs: Reference[]): string {
  return refs.map(formatBibTeX).join('\n\n')
}

export function formatAPABlock(refs: Reference[]): string {
  return refs.map(formatAPA).join('\n\n')
}
