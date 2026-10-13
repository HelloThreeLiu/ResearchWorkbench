// BibTeX / CSL JSON 解析回归（V2.5 5.3.2，PRD 8.1 边界）：
// @string 宏 + # 拼接、{} 与 "" 包裹、month 宏、类型别名（@conference/@online）、
// crossref 不展开但提示、花括号不配对失败不静默、缺 title 失败、DOI/页码清洗、citekey 去重
// 运行：npm test（importer.ts 仅 fs + import type，可被 node:test 直接加载）
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseReferencesFile } from '../src/main/importer.ts'

const dir = mkdtempSync(join(tmpdir(), 'gezhi-import-test-'))
test.after(() => rmSync(dir, { recursive: true, force: true }))

function parse(name: string, content: string) {
  const file = join(dir, name)
  writeFileSync(file, content, 'utf8')
  return parseReferencesFile(file)
}

test('BibTeX：@string 宏展开 + # 拼接、{} 与 "" 包裹、DOI/页码清洗', () => {
  const r = parse('a.bib', `
@string{jt = "Journal of Testing"}

@article{einstein1905,
  author = {Albert Einstein},
  title = "On the Electrodynamics of Moving Body",
  journal = jt # " Letters",
  year = {1905},
  volume = {17},
  number = {10},
  pages = {891--921},
  doi = {https://doi.org/10.1000/phys.1905}
}
`)
  assert.equal(r.entries.length, 1)
  assert.equal(r.failures.length, 0)
  const e = r.entries[0]!
  assert.equal(e.citekey, 'einstein1905')
  assert.equal(e.title, 'On the Electrodynamics of Moving Body')
  assert.equal(e.venue, 'Journal of Testing Letters')
  assert.equal(e.pages, '891-921')
  assert.equal(e.doi, '10.1000/phys.1905')
  assert.equal(e.year, 1905)
})

test('BibTeX：month 宏占位展开；类型别名 @conference→inproceedings、@online→misc', () => {
  const r = parse('b.bib', `
@inproceedings{conf2026,
  author = {Zhang, San and Li, Si},
  title = {Alias Entry},
  booktitle = {Proc of X},
  month = jan,
  year = {2026}
}
@online{web2025,
  author = {Jane Doe},
  title = {An Online Note},
  year = {2025}
}
`)
  assert.equal(r.entries.length, 2)
  const conf = r.entries.find((e) => e.citekey === 'conf2026')!
  assert.equal(conf.entry_type, 'inproceedings')
  assert.deepEqual(conf.authors, ['Zhang, San', 'Li, Si'])
  const online = r.entries.find((e) => e.citekey === 'web2025')!
  assert.equal(online.entry_type, 'misc')
})

test('BibTeX：crossref 不展开但按可解析字段导入并提示', () => {
  const r = parse('c.bib', `
@inproceedings{cross1,
  author = {A B},
  title = {Crossref Entry},
  crossref = {confbase}
}
`)
  assert.equal(r.entries.length, 1)
  assert.ok(r.notes.some((n) => n.includes('crossref') && n.includes('1')))
})

test('BibTeX：花括号不配对 → 单条失败有原因，绝不静默丢弃', () => {
  const r = parse('d.bib', `
@article{broken,
  author = {Never Closed,
  title = {X}
}
`)
  assert.equal(r.entries.length, 0)
  assert.equal(r.failures.length, 1)
  assert.match(r.failures[0]!.reason, /闭合|配对/)
})

test('BibTeX：缺 title 与不支持的条目类型分别报告', () => {
  const r = parse('e.bib', `
@article{notitle,
  author = {A B},
  year = {2020}
}
@poster{poster1,
  title = {A Poster},
  year = {2021}
}
`)
  assert.equal(r.entries.length, 0)
  assert.equal(r.failures.length, 2)
  assert.ok(r.failures.some((f) => f.reason.includes('title')))
  assert.ok(r.failures.some((f) => f.reason.includes('不支持的条目类型')))
})

test('BibTeX：UTF-8 BOM 头不破坏解析', () => {
  const r = parse('f.bib', '\uFEFF@misc{bom1,\n  title = {BOM Entry},\n  year = {2024}\n}\n')
  assert.equal(r.entries.length, 1)
  assert.equal(r.entries[0]!.citekey, 'bom1')
})

test('CSL JSON：类型映射、作者拼接、年份提取、citekey 自动生成与去重', () => {
  const r = parse('g.json', JSON.stringify([
    {
      id: 'csl-1',
      type: 'article-journal',
      title: 'CSL Article',
      author: [{ family: 'Doe', given: 'Jane' }],
      issued: { 'date-parts': [[2024]] },
      'container-title': 'Journal of CSL',
      volume: 3,
      issue: 2,
      page: '10-20',
      DOI: '10.9999/csl.1',
      tags: [{ tag: 'probe' }],
      keyword: 'csl;json'
    },
    {
      id: 'csl-2',
      type: 'thesis',
      title: 'CSL Thesis',
      author: [{ family: 'Doe', given: 'John' }],
      issued: { 'date-parts': [[2024]] }
    },
    {
      id: 'csl-3',
      type: 'unknown-kind',
      title: 'CSL Unknown Type'
    }
  ]))
  assert.equal(r.entries.length, 3)
  assert.equal(r.failures.length, 0)
  const a = r.entries[0]!
  assert.equal(a.entry_type, 'article')
  assert.deepEqual(a.authors, ['Jane Doe'])
  assert.equal(a.year, 2024)
  assert.equal(a.venue, 'Journal of CSL')
  assert.equal(a.volume, '3')
  assert.equal(a.issue, '2')
  assert.equal(a.doi, '10.9999/csl.1')
  assert.deepEqual(a.tags, ['probe', 'csl', 'json'])
  assert.match(a.citekey, /^doe2024/)
  const b = r.entries[1]!
  assert.equal(b.entry_type, 'phdthesis')
  // 同姓同年 citekey 追加序号去重；未知 CSL 类型归 misc 不丢数据
  const c = r.entries[2]!
  assert.equal(c.entry_type, 'misc')
  assert.match(c.citekey, /^doe2024-2$|^ref/)
})

test('CSL JSON：非数组 / 解析失败给出明确提示', () => {
  const empty = parse('h.json', JSON.stringify({ items: [] }))
  assert.ok(empty.notes.some((n) => n.includes('未找到条目')))
  const bad = parse('i.json', '{ broken json')
  assert.ok(bad.notes.some((n) => n.includes('JSON 解析失败')))
})
