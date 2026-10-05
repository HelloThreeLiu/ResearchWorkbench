// 网络访问守卫（主进程）：SSRF 防护的地址判定与安全抓取
// 判定对象是「最终连接的 IP」：DNS 全量解析后逐地址判定，重定向每一跳重新校验
import dns from 'node:dns/promises'

/** 私有/回环/链路本地/保留网段（IPv4） */
function isPrivateIpv4(a: number, b: number): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) || // 链路本地 / 云元数据
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    a >= 224
  )
  // 有意不封 198.18.0.0/15（基准测试段）：Clash TUN fake-ip 等本地代理用它作 DNS 应答，封禁会
  // 让代理用户的网页元信息抓取全部失效——权衡决策，非遗漏
}

/**
 * 把 IPv6 地址展开为 8 个 16 位组；支持 `::` 压缩与内嵌 IPv4 尾段（`::ffff:1.2.3.4`）；
 * 非法返回 null。字节级展开不再依赖字符串形状（压缩/未压缩写法等价处理）。
 */
function expandIpv6(ip: string): number[] | null {
  // 提取内嵌 IPv4 尾段（若有），占位成两个 0 组，最后再回填
  let body = ip
  let v4: number[] | null = null
  const li = ip.lastIndexOf(':')
  if (li !== -1 && ip.slice(li + 1).includes('.')) {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.slice(li + 1))
    if (!m) return null
    v4 = m.slice(1).map(Number)
    if (v4.some((x) => x > 255)) return null
    body = `${ip.slice(0, li + 1)}0:0`
  }
  const dbl = body.indexOf('::')
  if (dbl !== -1 && body.indexOf('::', dbl + 1) !== -1) return null // `::` 至多一个
  const parse = (s: string): number[] | null => {
    if (s === '') return []
    const out: number[] = []
    for (const seg of s.split(':')) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(seg)) return null
      out.push(parseInt(seg, 16))
    }
    return out
  }
  const left = parse(dbl === -1 ? body : body.slice(0, dbl))
  const right = parse(dbl === -1 ? '' : body.slice(dbl + 2))
  if (left === null || right === null) return null
  const total = left.length + right.length
  if (dbl === -1) {
    if (total !== 8) return null
  } else if (total > 7) {
    return null // `::` 至少代表一个被压缩的 0 组
  }
  const groups = [...left, ...new Array(8 - total).fill(0), ...right]
  if (v4) {
    groups[6] = (v4[0] << 8) | v4[1]
    groups[7] = (v4[2] << 8) | v4[3]
  }
  return groups
}

/** 地址是否属私网/回环/链路本地/保留段（IPv4 + IPv6，IPv4-mapped/NAT64/IPv4-compatible 归一化后判定） */
export function isPrivateIp(rawIp: string): boolean {
  // 入口剥掉 URL.hostname 的方括号形式（http://[::1]/ → '[::1]'），避免调用者踩坑
  const ip = rawIp.startsWith('[') && rawIp.endsWith(']') ? rawIp.slice(1, -1) : rawIp
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip)
  if (m) return isPrivateIpv4(Number(m[1]), Number(m[2]))
  const g = expandIpv6(ip)
  if (!g) return false
  // ::/96（IPv4-compatible，已废弃）与 ::ffff:0:0/96（v4-mapped）：末 32 位按 IPv4 判定
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0 || g[5] === 0xffff)) {
    return isPrivateIpv4(g[6] >>> 8, g[6] & 0xff)
  }
  // NAT64 64:ff9b::/96：末 32 位按 IPv4 判定
  if (g[0] === 0x0064 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return isPrivateIpv4(g[6] >>> 8, g[6] & 0xff)
  }
  if (g.every((x) => x === 0)) return true // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true // ::1
  if ((g[0] & 0xfe00) === 0xfc00) return true // fc00::/7 ULA（fc/fd 开头）
  if ((g[0] & 0xffc0) === 0xfe80) return true // fe80::/10 链路本地
  return false
}

/**
 * SSRF 防护：协议白名单 + DNS 全量解析（all: true），任一地址命中私网即拒绝
 * （只查首条会被多 A/AAAA 记录绕过）。DNS rebinding 时间窗属已知残留，彻底解法
 * 是解析后按 IP 直连并保留 Host 头，见修复报告延后项。
 */
export async function assertSafeUrl(raw: string): Promise<URL> {
  const u = new URL(raw)
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('仅支持 http/https')
  const addrs = await dns.lookup(u.hostname, { all: true })
  if (addrs.some(({ address }) => isPrivateIp(address))) throw new Error('禁止访问内网地址')
  return u
}

/** SSRF 安全的 GET：手动跟重定向（≤5 跳），每一跳重新过 assertSafeUrl；返回最终响应 */
export async function safeFetch(rawUrl: string, timeoutMs = 5000): Promise<Response | null> {
  let current = await assertSafeUrl(rawUrl)
  let resp: Response | null = null
  for (let hop = 0; hop < 5; hop++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      resp = await fetch(current, {
        signal: controller.signal,
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GezhiWorkbench/1.0' }
      })
    } finally {
      clearTimeout(timer)
    }
    const loc = resp.headers.get('location')
    if (!loc || resp.status < 300 || resp.status >= 400) break
    current = await assertSafeUrl(new URL(loc, current).toString())
  }
  return resp
}
