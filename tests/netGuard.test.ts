// N-9 回归测试：SSRF 私网判定（isPrivateIp）
// 用例来自三轮复审的探针（18 例）+ 未压缩 IPv6 / NAT64 / IPv4-compatible 变体
import test from 'node:test'
import assert from 'node:assert/strict'
import { isPrivateIp } from '../src/main/netGuard.ts'

const BLOCK = [
  // IPv4 私网/保留段
  '169.254.169.254', // 链路本地 / 云元数据
  '127.0.0.1',
  '10.0.0.5',
  '192.168.1.1',
  '172.16.0.1',
  '172.31.255.255',
  '100.100.100.200', // 阿里云元数据（CGNAT 段）
  '0.0.0.0',
  '224.0.0.1',
  // IPv6 本机/ULA/链路本地
  '::1',
  '::',
  'fd00::1',
  'fc00::1',
  'fe80::1',
  // URL.hostname 的方括号形式（入口剥括号后判定）
  '[::1]',
  '[::ffff:127.0.0.1]',
  '[64:ff9b::7f00:1]',
  // IPv4-mapped（点分 / 压缩十六进制 / 未压缩十六进制）
  '::ffff:127.0.0.1',
  '::ffff:169.254.169.254',
  '::ffff:7f00:1',
  '0:0:0:0:0:ffff:7f00:1',
  // NAT64（点分 / 压缩十六进制 / 未压缩）
  '64:ff9b::127.0.0.1',
  '64:ff9b::7f00:1',
  '64:ff9b:0:0:0:0:7f00:1',
  // IPv4-compatible（已废弃，按末 32 位判）
  '::7f00:1'
]

const ALLOW = [
  '8.8.8.8',
  '1.1.1.1',
  '172.32.0.1', // 172.16-31 之外
  '100.63.0.1', // CGNAT 段之外
  '2001:4860:4860::8888',
  '2400:3200::1', // 公网 IPv6（阿里）
  '2606:4700:4700::1111'
]

test('私网/保留地址全部拦截', () => {
  for (const ip of BLOCK) assert.equal(isPrivateIp(ip), true, `应拦截: ${ip}`)
})

test('公网地址全部放行', () => {
  for (const ip of ALLOW) assert.equal(isPrivateIp(ip), false, `应放行: ${ip}`)
})

test('非法输入不误拦', () => {
  // 判定不了的形式按非私网处理（调用方 dns.lookup 不会给出这类值，仅作健壮性兜底）
  assert.equal(isPrivateIp('not-an-ip'), false)
  assert.equal(isPrivateIp('::ffff:999.1.1.1'), false) // 非法 IPv4 段
})
