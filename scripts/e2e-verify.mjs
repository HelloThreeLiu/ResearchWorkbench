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

  // 5. 看板视图
  const navTo = async (label) =>
    evalExpr(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('${label}'))
      if (!btn) return false
      btn.click(); return true
    })()`)
  check('导航到任务页', await navTo('任务'))
  await new Promise((r) => setTimeout(r, 400))
  check('切换看板视图', await clickByText('看板'))
  await new Promise((r) => setTimeout(r, 400))
  const kanbanText = await evalExpr('document.body.innerText')
  check('看板三列渲染', kanbanText.includes('待办') && kanbanText.includes('进行中') && kanbanText.includes('已完成'), '')
  check('看板卡片出现', kanbanText.includes('端到端验证任务'), '')

  // 6. 论文投稿：新建 → 改状态 → 设投稿日期 → 自动节点
  check('导航到论文投稿', await navTo('论文投稿'))
  await new Promise((r) => setTimeout(r, 400))
  check('打开新建论文', await clickByText('新建论文'))
  check('填写论文标题', await setInput('input[placeholder="论文标题"]', '端到端验证论文'))
  check('创建论文', await clickByText('创 建') || (await clickByText('创建')))
  await new Promise((r) => setTimeout(r, 1200))
  const paperList = await evalExpr('document.body.innerText')
  check('论文出现在构思分组', paperList.includes('端到端验证论文') && paperList.includes('构思'), '')
  // 两步改状态：下拉选择 写作中
  const changeStatus = await evalExpr(`(() => {
    const sel = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'writing'))
    if (!sel) return false
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(sel, 'writing')
    sel.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)
  check('两步改状态为「写作中」', changeStatus)
  await new Promise((r) => setTimeout(r, 800))
  // 打开编辑设置投稿日期
  check('打开论文编辑', await evalExpr(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('端到端验证论文') && b.querySelector === undefined && b.closest('div.group'))
    const row = [...document.querySelectorAll('div')].find(d => d.className.includes('group') && d.textContent.includes('端到端验证论文') && d.querySelector('button.min-w-0'))
    if (!row) return false
    row.querySelector('button.min-w-0').click()
    return true
  })()`))
  await new Promise((r) => setTimeout(r, 400))
  const setSubmissionDate = await evalExpr(`(() => {
    const modal = [...document.querySelectorAll('.fixed.inset-0')].pop()
    if (!modal) return false
    const dates = [...modal.querySelectorAll('input[type="date"]')]
    if (dates.length < 2) return false
    const target = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10)
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(dates[1], target)
    dates[1].dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  check('设置投稿日期（10天后）', setSubmissionDate)
  check('保存论文', await clickByText('保 存') || (await clickByText('保存')))
  await new Promise((r) => setTimeout(r, 1200))
  check('导航到时间节点', await navTo('时间节点'))
  await new Promise((r) => setTimeout(r, 400))
  const msPage = await evalExpr('document.body.innerText')
  check('论文投稿截止自动生成节点', msPage.includes('端到端验证论文（投稿）'), '')

  // 7. 周报聚合：完成今日任务 → 生成本周周报
  check('导航到今日概览', await navTo('今日概览'))
  await new Promise((r) => setTimeout(r, 400))
  const completeTask = await evalExpr(`(() => {
    const btn = [...document.querySelectorAll('button[title="标记为完成"]')]
      .find(b => b.parentElement.textContent.includes('端到端验证任务'))
    if (!btn) return false
    btn.click(); return true
  })()`)
  check('勾选完成今日任务', completeTask)
  await new Promise((r) => setTimeout(r, 1000))
  check('导航到汇报中心', await navTo('汇报中心'))
  await new Promise((r) => setTimeout(r, 400))
  check('生成本周周报', await clickByText('生成本周周报'))
  await new Promise((r) => setTimeout(r, 600))
  const reportText = await evalExpr(`document.querySelector('textarea') ? document.querySelector('textarea').value : ''`)
  check(
    '周报草稿包含本周完成任务',
    reportText.includes('端到端验证任务') && reportText.includes('### 其他工作'),
    reportText.slice(0, 80)
  )
  check('保存为正式版本', await clickByText('保存为正式版本'))
  await new Promise((r) => setTimeout(r, 1000))
  check('返回报告列表', await evalExpr(`(() => {
    const btn = document.querySelector('button[title="返回列表"]')
    if (!btn) return false
    btn.click(); return true
  })()`))
  await new Promise((r) => setTimeout(r, 500))
  const reportList = await evalExpr('document.body.innerText')
  check('报告进入历史归档', reportList.includes('历史报告') && reportList.includes('周报'), '')

  // 8. 成果台账渲染
  check('导航到成果台账', await navTo('成果台账'))
  await new Promise((r) => setTimeout(r, 400))
  const achPage = await evalExpr('document.body.innerText')
  check('成果台账页渲染', achPage.includes('登记成果') && achPage.includes('复制为纯文本'), '')

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
