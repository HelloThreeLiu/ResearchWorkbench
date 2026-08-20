// 汇报导出：Markdown 直写 / 转换为 .docx（docx 库）
// md 支持的子集：# ## ### 标题、-/* 无序列表、**加粗**、普通段落（覆盖周报模板所需）
import fs from 'node:fs'
import path from 'node:path'
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun
} from 'docx'

/** 行内 **加粗** 解析为 TextRun 数组 */
function inlineRuns(text: string, base: { size?: number } = {}): TextRun[] {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return parts
    .filter((p) => p !== '')
    .map((p, i) => new TextRun({ text: p, bold: i % 2 === 1, size: base.size }))
}

function mdToParagraphs(md: string): Paragraph[] {
  const paragraphs: Paragraph[] = []
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd()
    if (line.trim() === '') continue
    const heading = line.match(/^(#{1,3})\s+(.*)$/)
    if (heading) {
      const level = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][
        heading[1].length - 1
      ]
      paragraphs.push(new Paragraph({ text: heading[2], heading: level }))
      continue
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/)
    if (bullet) {
      paragraphs.push(
        new Paragraph({ children: inlineRuns(bullet[1]), bullet: { level: 0 } })
      )
      continue
    }
    paragraphs.push(new Paragraph({ children: inlineRuns(line) }))
  }
  return paragraphs
}

export async function markdownToDocx(md: string, title: string): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: mdToParagraphs(md)
      }
    ]
  })
  // title 仅作文档元数据参考，正文以 md 渲染为准
  void title
  return Packer.toBuffer(doc)
}

/** 保存文件：返回保存路径；用户取消返回 null；失败抛错 */
export async function exportToFile(
  data: string | Buffer,
  format: 'md' | 'docx',
  showDialog: () => Promise<string | null>
): Promise<string | null> {
  const target = await showDialog()
  if (!target) return null
  let file = target
  const ext = `.${format}`
  if (path.extname(file).toLowerCase() !== ext) {
    file = file + ext
  }
  if (Buffer.isBuffer(data)) {
    fs.writeFileSync(file, data)
  } else {
    fs.writeFileSync(file, data, 'utf-8')
  }
  return file
}
