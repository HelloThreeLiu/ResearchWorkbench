const fs = require('fs')
const html = fs.readFileSync('design/prototypes/redesign-v3.html', 'utf8')

// 1. 标签配对
const stack = []
const re = /<(\/?)(section|div|button|span|main|aside|nav|h1|h2|h3|i|b|ul|p|select|input|textarea|kbd)\b[^>]*?(\/?)>/g
let m, errors = 0
const voidOk = new Set(['input'])
while ((m = re.exec(html))) {
  const [, close, tag, selfClose] = m
  if (selfClose === '/' || voidOk.has(tag)) continue
  if (close === '/') {
    const top = stack.pop()
    if (top !== tag) { console.log(`MISMATCH: </${tag}> but open stack top = ${top}`); errors++ }
  } else stack.push(tag)
}
if (stack.length) { console.log('UNCLOSED:', stack.join(',')); errors++ }
console.log(errors === 0 ? 'TAG BALANCE OK' : `TAG ERRORS: ${errors}`)

// 2. data-page 引用
const ids = new Set([...html.matchAll(/id="(page-[a-z-]+)"/g)].map(x => x[1]))
const refs = [...new Set([...html.matchAll(/data-page="([a-z-]+)"/g)].map(x => 'page-' + x[1]))]
const missing = refs.filter(r => !ids.has(r))
console.log('pages:', [...ids].length, '| missing refs:', missing.length ? missing.join(',') : 'none')

// 3. 引号完整性粗查（每行 " 数量为偶数，忽略含转义的行）
let badQuotes = 0
html.split('\n').forEach((line, i) => {
  const count = (line.match(/"/g) || []).length
  if (count % 2 !== 0) { console.log(`odd quotes @line ${i + 1}: ${line.slice(0, 90)}`); badQuotes++ }
})
console.log(badQuotes === 0 ? 'QUOTES OK' : `ODD QUOTE LINES: ${badQuotes}`)
