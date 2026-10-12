#!/usr/bin/env node
// 发版产物同步 CNB 镜像仓库（国内下载加速）：
//   建/更新 release（显式 make_latest —— 缺失会导致 releases/latest/download 一律 404）
//   → 幂等清理同名资产 → latest.yml 的 files[].url / path 重写为镜像绝对地址
//     （electron-updater 差分 blockmap 按文件 URL 同路径拼接，绝对地址使旧版本解析落在旧 tag 路径）
//   → 三步上传（asset-upload-url 预签名 → PUT 字节流 → verify 确认）
//   → 匿名自检 latest 固定路径（fail-loud，红灯当天修）
// 由 .github/workflows/attach-release-assets.yml 在产物构建上传后调用，也可本地手动执行。
// 用法：node scripts/sync-cnb-release.mjs <tag，形如 vX.Y.Z> <产物目录，如 release> [--notes-file <Release 正文文件>]
// 环境变量：CNB_TOKEN（必填，CNB 访问令牌）；CNB_REPO（默认 HelloThreeLiu/researchworkbench-release）
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const API = 'https://api.cnb.cool'
const DOWNLOAD_HOST = 'https://cnb.cool'
const DEFAULT_REPO = 'HelloThreeLiu/researchworkbench-release'

function die(msg) {
  console.error(`[sync-cnb] 失败：${msg}`)
  process.exit(1)
}

function log(msg) {
  console.log(`[sync-cnb] ${msg}`)
}

/** CNB OpenAPI JSON 请求（Accept 头必需：缺省时部分端点返回错误结构甚至 406，实测坑） */
async function apiJson(pathname, { method = 'GET', token, body } = {}) {
  const headers = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const resp = await fetch(`${API}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const text = await resp.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  return { status: resp.status, ok: resp.ok, data }
}

/**
 * latest.yml 绝对地址重写（导出供单测）：仅替换 files[].url 与顶层 path 的裸文件名，
 * 值已含协议（重复执行）或其他字段（sha512/size/releaseDate 等）不动。
 */
export function rewriteLatestYml(text, tag, repo, host = DOWNLOAD_HOST) {
  const absoluteFor = (name) => `${host}/${repo}/-/releases/download/${tag}/${name}`
  return text
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(/^(\s*(?:- )?url:\s|path:\s)(\S+)\s*$/)
      if (!m || m[2].includes('://')) return line
      return `${m[1]}${absoluteFor(m[2])}`
    })
    .join('\n')
}

async function main() {
  // ---------- 参数与环境 ----------
  const argv = process.argv.slice(2)
  const tag = argv[0]
  const releaseDir = argv[1]
  const notesIdx = argv.indexOf('--notes-file')
  const notesFile = notesIdx >= 0 ? argv[notesIdx + 1] : null
  if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) die(`tag 必须形如 vX.Y.Z，收到：${tag ?? '(空)'}`)
  if (!releaseDir) die('缺少产物目录参数（如 release）')
  const token = process.env.CNB_TOKEN
  if (!token) die('缺少环境变量 CNB_TOKEN（CNB 访问令牌）')
  const repo = process.env.CNB_REPO || DEFAULT_REPO
  const version = tag.slice(1)

  const assetNames = [
    `Gezhi-Workbench-${version}-x64.exe`,
    `Gezhi-Workbench-${version}-x64.exe.blockmap`,
    'latest.yml'
  ]
  for (const name of assetNames) {
    if (!fs.existsSync(path.join(releaseDir, name))) die(`产物缺失：${path.join(releaseDir, name)}`)
  }

  // ---------- 1. 建/更新 release（make_latest 必须显式标记） ----------
  let notes = ''
  if (notesFile && fs.existsSync(notesFile)) notes = fs.readFileSync(notesFile, 'utf8')

  const existing = await apiJson(`/${repo}/-/releases/tags/${tag}`, { token })
  let releaseId
  if (existing.status === 404) {
    const created = await apiJson(`/${repo}/-/releases`, {
      method: 'POST',
      token,
      body: {
        tag_name: tag,
        target_commitish: 'main',
        name: tag,
        body: notes,
        draft: false,
        prerelease: false,
        make_latest: 'true'
      }
    })
    if (!created.ok || !created.data?.id) {
      die(`创建 release 失败 HTTP ${created.status}：${JSON.stringify(created.data)}`)
    }
    releaseId = created.data.id
    log(`已创建 release ${tag}（id=${releaseId}）`)
  } else if (existing.ok) {
    releaseId = existing.data.id
    const patched = await apiJson(`/${repo}/-/releases/${releaseId}`, {
      method: 'PATCH',
      token,
      body: { make_latest: 'true', body: notes }
    })
    if (!patched.ok) die(`标记 make_latest 失败 HTTP ${patched.status}：${JSON.stringify(patched.data)}`)
    log(`复用已有 release ${tag}（id=${releaseId}）`)
  } else {
    die(`查询 release 失败 HTTP ${existing.status}：${JSON.stringify(existing.data)}`)
  }

  // ---------- 2. 幂等清理同名资产（重传前先删旧，避免重复挂附件） ----------
  const fresh = await apiJson(`/${repo}/-/releases/tags/${tag}`, { token })
  if (!fresh.ok) die(`回查 release 失败 HTTP ${fresh.status}`)
  const assets = fresh.data?.assets || []
  let removed = 0
  for (const asset of assets) {
    const name = String(asset.path ?? '').split('/').pop()
    if (assetNames.includes(name)) {
      const del = await apiJson(`/${repo}/-/releases/${releaseId}/assets/${asset.id}`, {
        method: 'DELETE',
        token
      })
      if (!del.ok) die(`删除旧资产 ${name} 失败 HTTP ${del.status}`)
      removed++
    }
  }
  if (removed) log(`已清理 ${removed} 个同名旧资产（幂等重传）`)

  // ---------- 3. 三步上传（latest.yml 先重写为绝对地址） ----------
  async function uploadAsset(name, data, size) {
    const presign = await apiJson(`/${repo}/-/releases/${releaseId}/asset-upload-url`, {
      method: 'POST',
      token,
      body: { asset_name: name, size }
    })
    if (!presign.ok || !presign.data?.upload_url || !presign.data?.verify_url) {
      die(`获取 ${name} 上传地址失败：${JSON.stringify(presign.data)}`)
    }
    const put = await fetch(presign.data.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: data
    })
    if (!put.ok) die(`上传 ${name} 失败 HTTP ${put.status}`)
    const verify = await fetch(presign.data.verify_url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    })
    if (!verify.ok) die(`确认 ${name} 上传失败 HTTP ${verify.status}`)
    log(`已上传 ${name}（${(size / 1048576).toFixed(1)} MB）`)
  }

  const ymlOriginal = fs.readFileSync(path.join(releaseDir, 'latest.yml'), 'utf8')
  const ymlRewritten = rewriteLatestYml(ymlOriginal, tag, repo)
  await uploadAsset('latest.yml', Buffer.from(ymlRewritten, 'utf8'), Buffer.byteLength(ymlRewritten))
  for (const name of assetNames.slice(0, 2)) {
    const buf = fs.readFileSync(path.join(releaseDir, name))
    await uploadAsset(name, buf, buf.length)
  }

  // ---------- 4. 匿名自检（latest 固定路径 + 版本指向，fail-loud） ----------
  const checkUrl = `${DOWNLOAD_HOST}/${repo}/-/releases/latest/download/latest.yml`
  const check = await fetch(checkUrl, { redirect: 'follow' })
  if (!check.ok) die(`自检失败：latest 路径 HTTP ${check.status}`)
  const checkText = await check.text()
  if (!checkText.includes(`version: ${version}`)) {
    die(`自检失败：latest.yml 未指向 ${version}（make_latest 未生效？）`)
  }
  log(`自检通过：${checkUrl} → ${version}`)
  log('CNB 镜像同步完成')
}

// 仅直接执行时跑主流程（被单测 import 时只暴露纯函数）
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  main().catch((err) => die(err instanceof Error ? err.message : String(err)))
}
