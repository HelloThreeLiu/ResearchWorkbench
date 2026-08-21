// 界面风格主题验证：通过 CDP 驱动真实 UI，切换 linear/claude/notion 并校验 token 生效
// 前置：应用已带 --remote-debugging-port=9222 启动，且已完成数据目录配置
// 只读业务数据；唯一写入是 settings.styleTheme（结束时恢复为 linear）
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
  if (!targets.length) throw new Error('未找到页面目标（应用未启动或未开调试端口）')
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
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  const results = []
  const check = (name, cond, detail = '') => {
    results.push([cond ? 'PASS' : 'FAIL', name, detail])
  }

  // 等待应用就绪（侧边栏出现）
  let booted = false
  for (let i = 0; i < 30; i++) {
    booted = await evalExpr('!!document.querySelector("aside")')
    if (booted) break
    await sleep(500)
  }
  check('应用启动进入主界面', booted)

  // 进入设置页
  const opened = await evalExpr(`(() => {
    const btn = [...document.querySelectorAll('aside button')].find(b => b.textContent.includes('设置'))
    if (!btn) return false
    btn.click()
    return true
  })()`)
  check('打开设置页', opened)
  await sleep(400)

  // 外观区应有三张风格卡
  const cardTexts = await evalExpr(
    `[...document.querySelectorAll('button')].filter(b => /精密高效|学术编辑|暖中性极简/.test(b.textContent)).map(b => b.textContent.slice(0, 20))`
  )
  check('设置-外观出现三张风格卡', cardTexts.length === 3, cardTexts.join(' | '))

  const probe = `(() => {
    const cs = getComputedStyle(document.documentElement)
    const card = document.querySelector('.rounded-xl')
    return {
      style: document.documentElement.dataset.style,
      accent: cs.getPropertyValue('--color-accent').trim(),
      bg: cs.getPropertyValue('--color-bg').trim(),
      h1Font: getComputedStyle(document.querySelector('h1')).fontFamily,
      radius: card ? getComputedStyle(card).borderRadius : ''
    }
  })()`

  const expect = {
    linear: { accent: '#5e6ad2', radius: '12px', serif: false },
    claude: { accent: '#c96442', radius: '14px', serif: true },
    notion: { accent: '#2383e2', radius: '10px', serif: false }
  }
  const clickCard = (label) =>
    evalExpr(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('${label}'))
      if (!btn) return false
      btn.click()
      return true
    })()`)

  for (const key of ['linear', 'claude', 'notion']) {
    const label = { linear: '精密高效', claude: '学术编辑', notion: '暖中性极简' }[key]
    const ok = await clickCard(label)
    await sleep(250)
    const p = await evalExpr(probe)
    const e = expect[key]
    check(`${key}：data-style 生效`, p.style === key, `实际 ${p.style}`)
    check(`${key}：主色 token`, p.accent === e.accent, `实际 ${p.accent}`)
    check(`${key}：圆角级联`, p.radius === e.radius, `实际 ${p.radius}`)
    check(`${key}：标题字体`, e.serif ? p.h1Font.toLowerCase().includes('georgia') : !p.h1Font.toLowerCase().includes('georgia'), `实际 ${p.h1Font.slice(0, 40)}`)

    // 深色叠加：仅校验 CSS 计算，不落设置
    if (key === 'claude') {
      const dark = await evalExpr(`(() => {
        const el = document.documentElement
        el.classList.add('dark')
        const accent = getComputedStyle(el).getPropertyValue('--color-accent').trim()
        el.classList.remove('dark')
        return accent
      })()`)
      check('claude × 深色：暖珊瑚主色', dark === '#d97757', `实际 ${dark}`)
    }
  }

  // 恢复默认 linear，确认已持久化（reload 后仍是 linear）
  await clickCard('精密高效')
  await sleep(300)
  const persisted = await evalExpr(
    `(() => { localStorage; return document.documentElement.dataset.style })()`
  )
  const afterReload = await send('Page.reload', {}).then(() => sleep(1500)).then(() =>
    evalExpr('document.documentElement.dataset.style')
  )
  check('切换持久化（重载后仍为 linear）', persisted === 'linear' && afterReload === 'linear', `重载后 ${afterReload}`)

  ws.close()
  console.log('\n===== 界面风格主题验证 =====')
  for (const [st, name, detail] of results) {
    console.log(`${st === 'PASS' ? '✓' : '✗'} ${name}${detail && st === 'FAIL' ? `（${detail}）` : ''}`)
  }
  const fails = results.filter((r) => r[0] === 'FAIL').length
  console.log(`\n${results.length - fails}/${results.length} 项通过`)
  process.exit(fails ? 1 : 0)
}

main().catch((err) => {
  console.error('验证脚本失败：', err.message)
  process.exit(1)
})
