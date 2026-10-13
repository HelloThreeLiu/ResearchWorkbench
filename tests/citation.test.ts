// 引用三格式回归（V2.5 5.3.3）：GB/T 7714 / BibTeX / APA 的关键口径
// —— 类型标识、作者缩写与截断（等/et al）、卷期页、citekey 保留与清洗、批量编号
// 运行：npm test（citation.ts 仅 import type，Node 类型剥离后零运行时依赖）
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatAPA,
  formatAPABlock,
  formatBibTeX,
  formatBibTeXBlock,
  formatGB7714,
  formatGB7714Block
} from '../src/renderer/src/lib/citation.ts'
import type { Reference } from '../src/shared/types.ts'

function ref(patch: Partial<Reference>): Reference {
  return {
    id: 'r',
    citekey: '',
    entry_type: 'article',
    title: '',
    authors: [],
    year: null,
    venue: '',
    volume: '',
    issue: '',
    pages: '',
    doi: '',
    url: '',
    tags: [],
    status: 'read',
    project_id: null,
    note: '',
    pdf_path: null,
    created_at: '',
    updated_at: '',
    ...patch
  }
}

test('GB/T 7714 期刊：姓全大写+名缩写、[J] 标识、出处, 年, 卷(期): 页码.', () => {
  const out = formatGB7714(
    ref({
      citekey: 'einstein1905',
      title: 'On the Electrodynamics of Moving Body',
      authors: ['Albert Einstein'],
      year: 1905,
      venue: 'Annalen der Physik',
      volume: '17',
      issue: '10',
      pages: '891-921',
      doi: '10.1000/phys.1905'
    })
  )
  assert.equal(
    out,
    'EINSTEIN A. On the Electrodynamics of Moving Body[J]. Annalen der Physik, 1905, 17(10): 891-921.'
  )
})

test('GB/T 7714 中文会议论文：>3 位作者前 3 位 + 等、[C]//论文集名. 年: 页码.', () => {
  const out = formatGB7714(
    ref({
      entry_type: 'inproceedings',
      title: '中文消融实验研究',
      authors: ['张三', '李四', '王五', '赵六', '钱七'],
      year: 2026,
      venue: 'Proceedings of the 30th Conference',
      pages: '1-10'
    })
  )
  assert.equal(out, '张三, 李四, 王五, 等. 中文消融实验研究[C]//Proceedings of the 30th Conference. 2026: 1-10.')
})

test('GB/T 7714 英文 >3 位作者 → et al；学位论文 [D]', () => {
  const out = formatGB7714(
    ref({
      entry_type: 'phdthesis',
      title: 'A Thesis Title',
      authors: ['Zhang San', 'Li Si', 'Wang Wu', 'Zhao Liu'],
      year: 2024,
      venue: 'Some University'
    })
  )
  assert.equal(out, 'SAN Z, SI L, WU W, et al. A Thesis Title[D]. Some University, 2024.')
})

test('GB/T 7714 电子资源 [EB/OL]：doi 缺省时用 URL', () => {
  const out = formatGB7714(
    ref({
      entry_type: 'misc',
      title: 'An Online Resource',
      authors: ['Jane Doe'],
      year: 2025,
      url: 'https://example.com/doc'
    })
  )
  assert.equal(out, 'DOE J. An Online Resource[EB/OL]. 2025. https://example.com/doc.')
})

test('BibTeX：citekey 原样保留、字段按类型映射（journal/booktitle）、花括号转义', () => {
  const out = formatBibTeX(
    ref({
      citekey: 'einstein1905',
      title: 'A {GPU} Survey',
      authors: ['Albert Einstein'],
      year: 1905,
      venue: 'Annalen der Physik',
      volume: '17',
      issue: '10',
      pages: '891-921',
      doi: '10.1000/phys.1905'
    })
  )
  assert.ok(out.startsWith('@article{einstein1905,'))
  assert.ok(out.includes('title = {A \\{GPU\\} Survey}'))
  assert.ok(out.includes('journal = {Annalen der Physik}'))
  assert.ok(out.includes('number = {10}'))
  // 会议论文 venue 映射 booktitle
  const out2 = formatBibTeX(
    ref({ citekey: 'z2026', entry_type: 'inproceedings', title: 'T', venue: 'CVPR' })
  )
  assert.ok(out2.startsWith('@inproceedings{z2026,'))
  assert.ok(out2.includes('booktitle = {CVPR}'))
})

test('BibTeX：citekey 特殊字符白名单清洗；缺省按 姓+年 生成', () => {
  const out = formatBibTeX(ref({ citekey: 'ein 1905!', title: 'T', authors: ['Albert Einstein'], year: 1905 }))
  assert.ok(out.startsWith('@article{ein1905,'))
  const out2 = formatBibTeX(ref({ title: 'T', authors: ['Albert Einstein'], year: 1905 }))
  assert.ok(out2.startsWith('@article{einstein1905,'))
})

test('APA：作者. (年). 题名. Venue, 卷(期), 页码. doi 链接', () => {
  const out = formatAPA(
    ref({
      title: 'On the Electrodynamics of Moving Body',
      authors: ['Albert Einstein'],
      year: 1905,
      venue: 'Annalen der Physik',
      volume: '17',
      issue: '10',
      pages: '891-921',
      doi: '10.1000/phys.1905'
    })
  )
  assert.equal(
    out,
    'Einstein, A. (1905). On the Electrodynamics of Moving Body. Annalen der Physik, 17(10), 891-921. https://doi.org/10.1000/phys.1905'
  )
})

test('APA：两位作者末位前 &；>3 位前 3 位 + et al', () => {
  const two = formatAPA(
    ref({ title: 'T', authors: ['Jane Doe', 'John Roe'], year: 2024, venue: 'V' })
  )
  assert.equal(two, 'Doe, J., & Roe, J. (2024). T. V.')
  const many = formatAPA(
    ref({ title: 'T', authors: ['A B', 'C D', 'E F', 'G H'], year: 2024, venue: 'V' })
  )
  assert.equal(many, 'B, A., D, C., F, E., et al. (2024). T. V.')
})

test('批量复制：GB/T 带 [1][2] 编号，BibTeX/APA 空行分隔', () => {
  const refs = [
    ref({ title: 'First', authors: ['Albert Einstein'], year: 1905, venue: 'V' }),
    ref({ title: 'Second', authors: ['Jane Doe'], year: 2024, venue: 'V' })
  ]
  const gb = formatGB7714Block(refs)
  assert.ok(gb.startsWith('[1] EINSTEIN A. First[J]'))
  assert.ok(gb.includes('\n[2] DOE J. Second[J]'))
  assert.equal(formatBibTeXBlock(refs).split('\n\n').length, 2)
  assert.equal(formatAPABlock(refs).split('\n\n').length, 2)
})
