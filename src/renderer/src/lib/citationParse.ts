// 引文快速解析（论文快速导入用）：把整段粘贴的引文列表（每行一条）宽松解析为论文草稿
// 设计取舍：启发式解析 + 可编辑预览兜底——识别不出的行整行降级为标题（调用方把原始引文存进备注），不丢数据
import type { PaperType } from '@shared/types'

export interface PaperParseDraft {
  title: string
  venue: string
  year: number | null
  type: PaperType
  /** structured = 识别出「标题 + 出处/年份」结构；fallback = 整行降级为标题，需人工核对 */
  confidence: 'structured' | 'fallback'
}

export interface PaperParseResult {
  /** 原始引文行（导入时存入论文备注，保留作者/卷期/页码等信息） */
  raw: string
  draft: PaperParseDraft
}

/** 标题归一化：去空白、统一小写（与文献导入的去重规则一致） */
export function normalizePaperTitle(t: string): string {
  return t.replace(/\s+/g, '').toLowerCase()
}

function isCJK(s: string): boolean {
  return /[\u4e00-\u9fff]/.test(s)
}

/** 独立 4 位年份（前后不紧邻数字，避免吞掉 ISBN / 页码片段） */
function extractYear(s: string): number | null {
  const m = s.match(/(?<!\d)(?:19|20)\d{2}(?!\d)/)
  return m ? parseInt(m[0], 10) : null
}

/** 从头部「作者. 标题」中切出标题：优先显式作者列表终结符（et al. / 等.），中文取第一个句点，英文取最后一个句点 */
function splitTitleFromHead(head: string): string {
  const cleaned = head.replace(/[.，,]\s*$/, '').trim()
  if (!cleaned) return ''
  const explicit = cleaned.match(/等\.|et\s+al[.,]/i)
  if (explicit && explicit.index !== undefined) {
    let rest = cleaned.slice(explicit.index + explicit[0].length).trim()
    // 「et al, Liao E. 标题」——et al 后可能还挂着最后一位作者，去掉再取标题
    rest = rest.replace(/^[A-Z][A-Za-z'’-]*\s+[A-Z](?:\s+[A-Z])*\.\s+/, '')
    if (rest) return rest
  }
  const dot = isCJK(cleaned) ? cleaned.indexOf('.') : cleaned.lastIndexOf('.')
  if (dot <= 0) return cleaned
  let title = cleaned.slice(dot + 1).trim()
  // 切出小写开头说明句点落在标题内部（如物种缩写 S. cerevisiae），回退一个句点
  if (/^[a-z]/.test(title)) {
    const prev = cleaned.lastIndexOf('.', dot - 1)
    if (prev > 0) title = cleaned.slice(prev + 1).trim()
  }
  return title || cleaned
}

/** 单条引文解析 */
export function parseCitationLine(rawLine: string): PaperParseDraft {
  // 去掉行首编号/项目符号：[1]、1.、1、1)、-、*
  const line = rawLine.replace(/^\s*(?:\[\d+\]|\d+[.、)]|-|\*)\s*/, '').trim()
  if (!line) return { title: '', venue: '', year: null, type: 'journal', confidence: 'fallback' }

  // 专利：「发明名称，CN120815159A.」（不属于论文，降级提示核对；专利号保留在原始引文里）
  const patent = line.match(/^(.+?)[，,]\s*CN\d{5,}[A-Z]\d*\.?\s*$/)
  if (patent) {
    return { title: patent[1].trim(), venue: '', year: extractYear(line), type: 'journal', confidence: 'fallback' }
  }

  // 参编著作/专著：《书名》…出版社…
  const bookTitle = line.match(/《([^》]+)》/)
  if (bookTitle) {
    const publisher = line.match(/[\u4e00-\u9fff]{2,10}(?:出版社|出版公司)/)
    return {
      title: bookTitle[1].trim(),
      venue: publisher ? publisher[0] : '',
      year: extractYear(line),
      type: 'journal',
      confidence: 'fallback'
    }
  }

  const year = extractYear(line)

  // GB/T 7714 及带类型标识的格式：「作者. 标题[J]. 出处, 年, 卷(期): 页码.」
  const marker = line.match(/\[(J|C|M|D|R)\]\s*\.?\s*/i)
  if (marker && marker.index !== undefined) {
    const head = line.slice(0, marker.index)
    const tail = line.slice(marker.index + marker[0].length)
    const title = splitTitleFromHead(head)
    if (title) {
      const commaIdx = tail.indexOf(',')
      const venue = (commaIdx > 0 ? tail.slice(0, commaIdx) : tail)
        .replace(/\s*(?:19|20)\d{2}.*$/, '')
        .replace(/[.。，,]\s*$/, '')
        .trim()
      return {
        title,
        venue,
        year: extractYear(tail) ?? year,
        type: marker[1].toUpperCase() === 'C' ? 'conference' : 'journal',
        confidence: 'structured'
      }
    }
  }

  // 无类型标识（PubMed 等英文格式）：「作者. 标题. 期刊. 年 月 日;卷(期):页码.」
  const yearMatch = line.match(/(?<!\d)(?:19|20)\d{2}(?!\d)/)
  if (yearMatch && yearMatch.index !== undefined) {
    const before = line.slice(0, yearMatch.index).replace(/[.。,，\s]+$/, '')
    const lastDot = before.lastIndexOf('.')
    if (lastDot > 0) {
      const venue = before.slice(lastDot + 1).trim()
      const headPart = before.slice(0, lastDot)
      const title = splitTitleFromHead(headPart)
      // 作者段含句点/「等」才认定「作者. 标题. 期刊」三段结构，否则视为「作者. 标题. 年」
      const splittable = headPart.includes('.') || headPart.includes('等')
      if (title && splittable) {
        // 切出的「出处」过长说明其实是标题的一部分，不当作期刊名
        return {
          title,
          venue: venue.length <= 60 ? venue : '',
          year,
          type: 'journal',
          confidence: 'structured'
        }
      }
      if (venue || headPart.trim()) {
        return { title: (venue || headPart).trim(), venue: '', year, type: 'journal', confidence: 'structured' }
      }
    }
  }

  // 兜底：整行作为标题（年份尽量保留）
  return {
    title: line.replace(/\s*[.。]$/, '').trim() || line,
    venue: '',
    year,
    type: 'journal',
    confidence: 'fallback'
  }
}

/** 整段文本解析：每行一条，过滤空行与解析不出标题的行 */
export function parseCitationText(text: string): PaperParseResult[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((raw) => ({ raw, draft: parseCitationLine(raw) }))
    .filter((r) => r.draft.title.length > 0)
}
