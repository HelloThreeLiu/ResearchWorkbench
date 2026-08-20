// 端到端验证脚本：通过 CDP 驱动真实 UI 交互，验证渲染与数据落盘
// 前置：应用已带 --remote-debugging-port=9222 启动，且已完成数据目录配置
import http from 'node:http'

function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: 9222, path }, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve(JSON.parse(body)))
    }).on('error', reject)
  })
}

async function main() {
  const targets = (await getJson('/json')).filter((t) => t.type === 'page')
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  const send = (method, params) =>
    new Promise((resolve) => {
      const msgId = ++id
      pending.set(msgId, resolve)
      ws.send(JSON.stringify({ id: msgId, method, params }))
    })
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result)
      pending.delete(msg.id)
    }
  }
  await new Promise((r) => (ws.onopen = r))

  const evalExpr = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval error')
    return r.result.value
  }
  const clickByText = async (text) =>
    evalExpr(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('${text}'))
      if (!btn) return false
      btn.click()
      return true
    })()`)
  const setInput = (selector, value) =>
    evalExpr(`(() => {
      const el = document.querySelector('${selector}')
      if (!el) return false
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, '${value}')
      el.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    })()`)

  const results = []
  const check = (name, cond, detail = '') => {
    results.push([cond ? 'PASS' : 'FAIL', name, detail])
  }

  // 1. 主界面渲染（今日概览）
  const pageText = await evalExpr('document.body.innerText')
  check('今日概览页渲染', pageText.includes('今日到期与逾期任务'), '')
  check('节点倒计时区渲染', pageText.includes('未来 30 天节点'), '')

  // 2. 新建任务：点击按钮 → 填标题 + 当日截止 → 创建
  check('打开新建任务弹窗', await clickByText('新建任务'))
  check('填写任务标题', await setInput('input[placeholder="要做什么？"]', '端到端验证任务'))
  const setDate = await evalExpr(`(() => {
    const el = document.querySelector('input[type="date"]')
    if (!el) return false
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, new Date().toISOString().slice(0, 10))
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)
  check('设置当日截止日期', setDate)
  check('点击创建', await clickByText('创 建') || (await clickByText('创建')))
  await new Promise((r) => setTimeout(r, 1500)) // 等待弹窗关闭 + 防抖落盘
  const afterCreate = await evalExpr('document.body.innerText')
  check('任务出现在今日列表', afterCreate.includes('端到端验证任务'), '')

  // 3. 新建节点
  check('打开新建节点弹窗', await clickByText('新建节点'))
  check('填写节点标题', await setInput('input[placeholder="如：AAAI 投稿截止 / 学位论文开题"]', '端到端验证节点'))
  check('点击创建(节点)', await clickByText('创 建') || (await clickByText('创建')))
  await new Promise((r) => setTimeout(r, 1500))
  const afterMs = await evalExpr('document.body.innerText')
  check('节点进入倒计时区', afterMs.includes('端到端验证节点'), '')

  // 4. 词汇库：新建节点时就地创建自定义类型
  check('打开新建节点弹窗(2)', await clickByText('新建节点'))
  const pickedNewType = await evalExpr(`(() => {
    const sel = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === '__new__'))
    if (!sel) return false
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
    setter.call(sel, '__new__')
    sel.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)
  check('类型下拉选择「新建类型」', pickedNewType)
  check('输入新类型名称', await setInput('input[placeholder^="新类型名称"]', 'Rebuttal截止'))
  check('点击添加类型', (await clickByText('添 加')) || (await clickByText('添加')))
  check('填写节点标题(2)', await setInput('input[placeholder="如：AAAI 投稿截止 / 学位论文开题"]', '自定义类型节点'))
  check('点击创建(节点2)', await clickByText('创 建') || (await clickByText('创建')))
  await new Promise((r) => setTimeout(r, 1800))
  const afterCustom = await evalExpr('document.body.innerText')
  check(
    '自定义类型节点 + 类型名出现',
    afterCustom.includes('自定义类型节点') && afterCustom.includes('Rebuttal截止'),
    ''
  )

  ws.close()

  console.log('===== UI 驱动结果 =====')
  for (const [status, name, detail] of results) {
    console.log(`${status}  ${name}${detail ? '  (' + detail + ')' : ''}`)
  }
  process.exit(results.some((r) => r[0] === 'FAIL') ? 1 : 0)
}

main().catch((err) => {
  console.error('脚本异常:', err)
  process.exit(1)
})
