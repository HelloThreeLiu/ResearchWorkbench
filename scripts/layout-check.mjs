// 布局自适应检测：在 900x680 窄窗与 1600x900 宽窗下逐页检查是否存在横向溢出
// 前置：应用已带 --remote-debugging-port=9222 启动
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
  const version = await getJson('/json/version')
  const bws = new WebSocket(version.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  const send = (method, params) =>
    new Promise((resolve, reject) => {
      const msgId = ++id
      pending.set(msgId, { resolve, reject })
      bws.send(JSON.stringify({ id: msgId, method, params }))
    })
  bws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id).resolve(msg.result ?? msg.error)
      pending.delete(msg.id)
    }
  }
  await new Promise((r) => (bws.onopen = r))

  const targets = await getJson('/json')
  const page = targets.find((t) => t.type === 'page')

  const PAGES = [
    ['今日概览', '今日概览'],
    ['项目', '项目'],
    ['任务', '任务'],
    ['日历', '日历'],
    ['时间节点', '时间节点'],
    ['灵感', '灵感'],
    ['工具箱', '工具箱'],
    ['设置', '设置']
  ]

  const evalPage = async (expr) => {
    const ws = new WebSocket(page.webSocketDebuggerUrl)
    let pid = 0
    const ppending = new Map()
    const psend = (method, params) =>
      new Promise((resolve) => {
        const msgId = ++pid
        ppending.set(msgId, resolve)
        ws.send(JSON.stringify({ id: msgId, method, params }))
      })
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && ppending.has(msg.id)) {
        ppending.get(msg.id)(msg.result)
        ppending.delete(msg.id)
      }
    }
    await new Promise((r) => (ws.onopen = r))
    const r = await psend('Runtime.evaluate', { expression: expr, returnByValue: true })
    ws.close()
    return r.result.value
  }

  const results = []
  for (const [width, height] of [
    [900, 680],
    [1280, 800],
    [1920, 1040]
  ]) {
    const { windowId } = await send('Target.getWindowForTarget', { targetId: page.id })
    await send('Browser.setWindowBounds', { windowId, bounds: { width, height } })
    await new Promise((r) => setTimeout(r, 600))
    for (const [label, navText] of PAGES) {
      await evalPage(`(() => {
        const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('${navText}'))
        if (btn) btn.click()
      })()`)
      await new Promise((r) => setTimeout(r, 350))
      const overflow = await evalPage(`(() => {
        const main = document.querySelector('main') ?? document.documentElement
        const bodyOver = document.documentElement.scrollWidth - document.documentElement.clientWidth
        const mainOver = main.scrollWidth - main.clientWidth
        const container = main.querySelector(':scope > div')
        const fill = container && main.clientWidth > 0
          ? Math.round((container.getBoundingClientRect().width / main.clientWidth) * 100)
          : 0
        return { bodyOver, mainOver, fill }
      })()`)
      const ok = overflow.bodyOver <= 1 && overflow.mainOver <= 1
      // 设置页保留可读宽度，其余页面要求内容铺满可用宽度（≥92%）
      const fillOk = label === '设置' || overflow.fill >= 92
      results.push([
        ok && fillOk ? 'PASS' : 'FAIL',
        `${width}px 宽 × ${label}`,
        JSON.stringify(overflow)
      ])
    }
  }

  console.log('===== 布局自适应检测结果 =====')
  for (const [status, name, detail] of results) {
    console.log(`${status}  ${name}${status === 'FAIL' ? '  ' + detail : ''}`)
  }
  bws.close()
  process.exit(results.some((r) => r[0] === 'FAIL') ? 1 : 0)
}

main().catch((err) => {
  console.error('脚本异常:', err)
  process.exit(1)
})
