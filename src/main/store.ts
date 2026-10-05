// 数据层：按实体集合存储为独立 JSON 文件（网盘同步友好）
// - 原子写入：先写 .tmp 再 rename（异步 + 退避重试，不阻塞主进程事件循环）
// - 外部修改保护：写入前比对磁盘 mtime 与本应用记录值，被其他设备改过时保留双方副本并拒绝覆盖
// - 自动备份：每日首次运行 + 应用退出时快照到 backups/，保留最近 30 份
// - 外部变更检测：记录每次写入后的 mtime，周期性比对文件 mtime 以发现其他设备写入
import { app, dialog } from 'electron'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import {
  COLLECTION_FILES,
  DEFAULT_REMIND_DAYS,
  DEFAULT_REPORT_TEMPLATE,
  DEFAULT_VOCAB,
  type AllCollections,
  type AppSettings,
  type CollectionName,
  type LoadIssue,
  type ToolFileData,
  type VocabFileData
} from '@shared/types'
import { seedToolData } from './seed'
import { vocabShapeValid } from './vocabShape'

const COLLECTION_NAMES = Object.keys(COLLECTION_FILES) as CollectionName[]
const BACKUP_KEEP = 30
/** 每个集合保留的冲突副本份数（conflict- 与 local- 各自计）；backups/ 在网盘目录里，不能无界增长 */
const CONFLICT_KEEP_PER_COLLECTION = 5
/** 数据文件大小上限（防异常超大文件拖垮解析） */
const MAX_COLLECTION_BYTES = 64 * 1024 * 1024
/**
 * 数据格式版本（schema.json）：当前所有集合均为「无迁移步骤的版本 1」。
 * 先落字段的目的：此后任何破坏性字段变更都必须在此递增版本号并补 migrate(vFrom, data)，
 * 避免「读取时容错 + 写回时补齐」式的人工兜底（终审跟进项 #7 的最小落点）。
 */
const SCHEMA_VERSION = 1

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json')
const metaPath = () => path.join(app.getPath('userData'), 'store-meta.json')

interface StoreMeta {
  [collection: string]: { mtimeMs: number; savedAt: string; sha256?: string }
}

let settings: AppSettings = {
  dataDir: null,
  theme: 'system',
  styleTheme: 'linear',
  hotkey: 'Alt+N',
  closeToTray: true,
  lastBackupDate: null,
  reportTemplate: DEFAULT_REPORT_TEMPLATE
}
let storeMeta: StoreMeta = {}
/** 数据文件最近一次【本应用】写入成功后的 mtimeMs，用于区分外部修改 */
let lastWriteAt: string | null = null
/** 本次运行中解析失败（损坏）的集合：禁止覆盖写入，防止把可恢复的损坏变成永久丢失 */
const brokenCollections = new Set<CollectionName>()
/** 集合级写入串行队列：避免同一集合并发写入交错破坏乐观锁判断 */
const writeQueues = new Map<CollectionName, Promise<unknown>>()

export function getSettings(): AppSettings {
  return settings
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  settings = { ...settings, ...patch }
  await safeWriteJson(settingsPath(), settings)
  return settings
}

export function loadSettings(): void {
  try {
    if (fs.existsSync(settingsPath())) {
      const parsed = JSON.parse(fs.readFileSync(settingsPath(), 'utf-8')) as Partial<AppSettings>
      settings = { ...settings, ...parsed }
      if (typeof settings.dataDir === 'string' && settings.dataDir.trim() === '') {
        settings.dataDir = null
      }
    }
  } catch (err) {
    console.error('[store] 读取设置失败，使用默认设置', err)
  }
  try {
    if (fs.existsSync(metaPath())) {
      storeMeta = JSON.parse(fs.readFileSync(metaPath(), 'utf-8'))
    }
  } catch {
    storeMeta = {}
  }
}

function dataFile(name: CollectionName): string {
  return path.join(settings.dataDir!, COLLECTION_FILES[name])
}

function emptyCollections(): AllCollections {
  return {
    projects: [],
    tasks: [],
    milestones: [],
    ideas: [],
    logs: [],
    tools: { groups: [], items: [] },
    vocab: DEFAULT_VOCAB,
    papers: [],
    achievements: [],
    reports: [],
    references: []
  }
}

/** 读取集合文件：返回原始文本（作哈希基线）与解析结果；文件不存在返回 null（= 空集合，不是损坏） */
function readCollectionFile(name: CollectionName): { text: string; raw: unknown } | null {
  const file = dataFile(name)
  if (!fs.existsSync(file)) return null
  const st = fs.statSync(file)
  if (st.size > MAX_COLLECTION_BYTES) throw new Error(`文件过大（${st.size} 字节）`)
  const text = fs.readFileSync(file, 'utf-8')
  return { text, raw: JSON.parse(text) }
}

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf-8').digest('hex')

/** ---------- 逐条结构校验（坏数据不静默：不合法的记录跳过并上报，原文件不动） ---------- */
function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}
const isStr = (v: unknown): boolean => typeof v === 'string'
/** 必填字符串字段 + 必填数组字段都存在才认为记录结构合法（宽松校验，只挡会让渲染层抛错的缺字段） */
function validRecord(x: unknown, strFields: string[], arrFields: string[] = []): boolean {
  if (!isPlainObject(x)) return false
  return strFields.every((k) => isStr(x[k])) && arrFields.every((k) => Array.isArray(x[k]))
}

const VALIDATORS: Partial<Record<CollectionName, (x: unknown) => boolean>> = {
  projects: (x) => validRecord(x, ['id', 'name', 'created_at', 'updated_at']),
  tasks: (x) => validRecord(x, ['id', 'title', 'created_at', 'updated_at'], ['tags']),
  milestones: (x) => validRecord(x, ['id', 'title', 'date', 'created_at', 'updated_at'], ['remind_days']),
  ideas: (x) => validRecord(x, ['id', 'content', 'created_at', 'updated_at'], ['tags']),
  logs: (x) => validRecord(x, ['id', 'project_id', 'date', 'content', 'created_at', 'updated_at']),
  papers: (x) =>
    validRecord(x, ['id', 'title', 'created_at', 'updated_at'], ['sections', 'cited_reference_ids']),
  achievements: (x) => validRecord(x, ['id', 'title', 'date', 'created_at', 'updated_at']),
  reports: (x) => validRecord(x, ['id', 'title', 'created_at', 'updated_at']),
  references: (x) => validRecord(x, ['id', 'title', 'created_at', 'updated_at'], ['tags', 'authors'])
}

/**
 * 加载全部集合并收集数据问题：
 * - parse：JSON 解析失败 → 该集合按空集合返回、标记为损坏（禁止后续覆盖写入）、显式上报；
 * - shape：非数组内容 / 结构不合法的记录 → 跳过坏记录并上报，原文件不动。
 */
export function loadAllWithIssues(): { data: AllCollections; issues: LoadIssue[] } {
  const result = emptyCollections()
  const issues: LoadIssue[] = []
  if (!settings.dataDir) return { data: result, issues }
  ensureSchemaVersion()
  for (const name of COLLECTION_NAMES) {
    const file = dataFile(name)
    try {
      const read = readCollectionFile(name)
      if (read === null) {
        // 文件缺失 = 空集合（老数据目录缺新版本集合文件的正常形态），不是损坏
        brokenCollections.delete(name)
        continue
      }
      const { text, raw } = read
      if (name === 'tools') {
        const o = isPlainObject(raw) ? raw : {}
        const groupsOk = Array.isArray(o.groups)
        const itemsOk = Array.isArray(o.items)
        if (!isPlainObject(raw) || !groupsOk || !itemsOk) {
          issues.push({
            collection: name,
            kind: 'shape',
            detail: 'tools 结构不合法（groups/items 需为数组），已按可读部分兜底（原文件未改动）'
          })
        }
        result.tools = {
          groups: groupsOk ? (o.groups as ToolFileData['groups']) : [],
          items: itemsOk ? (o.items as ToolFileData['items']) : []
        }
      } else if (name === 'vocab') {
        const v = isPlainObject(raw) ? raw : {}
        if (!vocabShapeValid(raw)) {
          issues.push({
            collection: name,
            kind: 'shape',
            detail: 'vocab 结构不合法（tags/milestoneTypes/achievementTypes/logTemplates 需为数组），非法项已按默认词汇库兜底（原文件未改动）'
          })
        }
        // 旧目录无 vocab.json / 旧版本缺 achievementTypes、logTemplates 时兜底为默认词汇库
        // （缺字段属旧版文件的预期形态，不算结构不合法，不告警——判定见 vocabShape.ts）
        result.vocab = {
          tags: Array.isArray(v.tags) ? (v.tags as VocabFileData['tags']) : [],
          milestoneTypes: Array.isArray(v.milestoneTypes) ? v.milestoneTypes : DEFAULT_VOCAB.milestoneTypes,
          achievementTypes: Array.isArray(v.achievementTypes) ? v.achievementTypes : DEFAULT_VOCAB.achievementTypes,
          logTemplates: Array.isArray(v.logTemplates) ? v.logTemplates : DEFAULT_VOCAB.logTemplates
        }
      } else {
        const validator = VALIDATORS[name]
        if (!Array.isArray(raw)) {
          issues.push({ collection: name, kind: 'shape', detail: '文件内容不是数组，已按空集合处理（原文件未改动）' })
        } else if (validator) {
          const arr = raw as unknown[]
          const good = arr.filter(validator)
          if (good.length !== arr.length) {
            issues.push({
              collection: name,
              kind: 'shape',
              detail: `${arr.length - good.length} 条记录结构不合法，已跳过（原文件未改动）`
            })
          }
          ;(result as unknown as Record<string, unknown>)[name] = good
        } else {
          ;(result as unknown as Record<string, unknown>)[name] = raw
        }
      }
      const st = fs.statSync(file)
      // savedAt 取文件自身修改时间（而非加载时刻），语义为「该文件上次被写入的时间」；
      // sha256 作内容基线：mtime 判据命中后用它复核，挡住网盘客户端「只触碰时间戳不改内容」的误报
      storeMeta[name] = { mtimeMs: st.mtimeMs, savedAt: new Date(st.mtimeMs).toISOString(), sha256: sha256(text) }
      brokenCollections.delete(name)
    } catch (err) {
      // 解析失败不当作空集合静默吞掉：上报 + 禁止覆盖，保留从 backups/ 恢复的机会
      brokenCollections.add(name)
      issues.push({
        collection: name,
        kind: 'parse',
        detail: `文件解析失败（${err instanceof Error ? err.message : String(err)}），已暂停该集合写入。请从 backups/ 恢复或修复文件；修复保存后应用会自动检测并恢复`
      })
      console.error(`[store] 读取 ${name} 失败`, err)
      // 记录「损坏时刻」的 mtime：外部修复文件后 mtime 变化，轮询据此重试解析（无需重启）
      try {
        storeMeta[name] = { ...storeMeta[name], mtimeMs: fs.statSync(file).mtimeMs }
      } catch {
        /* 文件不可 stat 则保持原状 */
      }
    }
  }
  void persistStoreMeta()
  return { data: result, issues }
}

/** 兼容入口：只要数据不要问题清单 */
export function loadAll(): AllCollections {
  return loadAllWithIssues().data
}

/**
 * 确保数据目录里存在 schema.json 并记录当前数据格式版本。
 * - 缺失/损坏/非数字 → 重写为当前版本（无数据可迁移，属正常首次落字段）；
 * - 版本号大于当前 → 说明数据来自更新版本的应用，仅告警不降级（当前无迁移步骤可回退）。
 */
function ensureSchemaVersion(): void {
  if (!settings.dataDir) return
  const file = path.join(settings.dataDir, 'schema.json')
  try {
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as { version?: unknown }
      if (typeof parsed.version === 'number') {
        if (parsed.version > SCHEMA_VERSION) {
          console.warn(
            `[store] 数据目录的 schema 版本 ${parsed.version} 高于应用支持的 ${SCHEMA_VERSION}，可能来自更新版本的应用`
          )
        }
        return
      }
    }
  } catch {
    /* 解析失败则重写 */
  }
  try {
    fs.writeFileSync(file, JSON.stringify({ version: SCHEMA_VERSION }, null, 2), 'utf-8')
  } catch (err) {
    console.error('[store] 写入 schema.json 失败', err)
  }
}

/** 写入成功后返回写出的序列化文本（调用方可复用作内容哈希，避免大集合重复序列化） */
async function safeWriteJson(file: string, data: unknown): Promise<string> {
  const text = JSON.stringify(data, null, 2)
  const tmp = file + '.tmp'
  await fsp.writeFile(tmp, text, 'utf-8')
  // Windows 下网盘/杀软可能短暂占用文件：rename 失败时退避重试（让出事件循环，不阻塞主进程）
  let lastErr: unknown = null
  for (let i = 0; i < 5; i++) {
    try {
      await fsp.rename(tmp, file)
      return text
    } catch (err) {
      lastErr = err
    }
    if (i < 4) await new Promise((r) => setTimeout(r, 100 * (i + 1)))
  }
  throw lastErr
}

async function persistStoreMeta(): Promise<void> {
  try {
    await safeWriteJson(metaPath(), storeMeta)
  } catch (err) {
    console.error('[store] 写入 meta 失败', err)
  }
}

/** 保存单个集合：写入前检测外部修改（mtime + 内容哈希双判据），写入后记录基线 */
export async function saveCollection(name: CollectionName, data: unknown): Promise<{ savedAt: string }> {
  if (!settings.dataDir) throw new Error('数据目录未配置')
  if (brokenCollections.has(name)) {
    throw new Error(
      `DATA_CORRUPT:${name}.json 解析失败，已阻止本次覆盖写入。请先从 backups/ 恢复或修复该文件；修复保存后应用会自动检测并恢复`
    )
  }
  // 同一集合串行写入，保证「锁检查 → 写入 → 记录基线」不被并发交错
  const prev = writeQueues.get(name) ?? Promise.resolve()
  const op = prev.then(writeCollectionUnchecked, writeCollectionUnchecked)
  writeQueues.set(
    name,
    op.then(
      () => undefined,
      () => undefined
    )
  )
  return op

  async function writeCollectionUnchecked(): Promise<{ savedAt: string }> {
    const file = dataFile(name)
    if (fs.existsSync(file)) {
      const recorded = storeMeta[name]
      const diskStat = fs.statSync(file)
      // 无基线 = 启动后新出现的外部文件（未知内容，保护性冲突）；有基线则 mtime 命中后用哈希复核
      // （网盘客户端可能只触碰 mtime 不改内容，哈希一致时不误报，正常写入）
      let externalChange = recorded === undefined
      let diskText: string | null = null
      if (recorded !== undefined && Math.abs(recorded.mtimeMs - diskStat.mtimeMs) > 1) {
        try {
          diskText = fs.readFileSync(file, 'utf-8')
          externalChange = recorded.sha256 !== undefined ? sha256(diskText) !== recorded.sha256 : true
        } catch {
          externalChange = true // 读不了内容时按已变更处理，走冲突保护
        }
      }
      if (externalChange) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        const backupDir = path.join(settings.dataDir!, 'backups')
        await fsp.mkdir(backupDir, { recursive: true })
        // 保留磁盘上那份（可能是另一台设备的成果），绝不静默覆盖
        await fsp.copyFile(file, path.join(backupDir, `conflict-${name}-${stamp}.json`))
        // 本机本次修改也留底，任何一端都不丢
        await fsp.writeFile(
          path.join(backupDir, `local-${name}-${stamp}.json`),
          JSON.stringify(data, null, 2),
          'utf-8'
        )
        pruneConflictArchives()
        // 冲突处置：基线更新为磁盘当前状态 → 渲染层重试的保存可以正常落盘，
        // 本机修改继续生效（对方的版本已完整保留在 conflict-*.json，由提示条引导用户手动合并）
        diskText ??= fs.readFileSync(file, 'utf-8')
        storeMeta[name] = {
          ...recorded,
          mtimeMs: diskStat.mtimeMs,
          savedAt: recorded?.savedAt ?? new Date(diskStat.mtimeMs).toISOString(),
          sha256: sha256(diskText)
        }
        lastWriteAt = new Date().toISOString()
        await persistStoreMeta()
        throw new Error(
          `DATA_CONFLICT:保存 ${name}.json 时检测到其他设备的修改。对方版本已完整备份至 backups/conflict-${name}-${stamp}.json，本机修改已备份至 backups/local-${name}-${stamp}.json 并将继续保存生效；如需采纳对方的改动，请打开数据目录的 backups/ 手动合并两份文件`
        )
      }
    }
    const written = await safeWriteJson(file, data)
    const savedAt = new Date().toISOString()
    const st = fs.statSync(file)
    // 基线 = 刚写入内容自己的哈希（复用 safeWriteJson 写出的序列化串，不再序列化第二遍）
    storeMeta[name] = { mtimeMs: st.mtimeMs, savedAt, sha256: sha256(written) }
    lastWriteAt = savedAt
    await persistStoreMeta()
    return { savedAt }
  }
}

/**
 * 检测外部修改（另一台设备经网盘写入）：比对磁盘 mtime 与本应用记录的基线（mtime 命中后由
 * saveCollection 用哈希复核）。损坏集合在文件被外部修改（如手动修复）时重试解析，恢复成功即纳入变更
 * —— 会话内自动恢复，无需重启。返回发生变化的集合及最新数据；无变化返回 null。
 */
export function checkExternalChanges(): {
  changed: CollectionName[]
  data: AllCollections
  issues: LoadIssue[]
} | null {
  if (!settings.dataDir) return null
  const changed: CollectionName[] = []
  for (const name of COLLECTION_NAMES) {
    try {
      const file = dataFile(name)
      if (!fs.existsSync(file)) continue
      const mtimeMs = fs.statSync(file).mtimeMs
      const recorded = storeMeta[name]?.mtimeMs
      const mtimeChanged = recorded === undefined || Math.abs(recorded - mtimeMs) > 1
      if (brokenCollections.has(name)) {
        // 文件在损坏之后又被修改过 → 重试解析；成功则 loadAllWithIssues 会清除损坏标记并载入。
        // 复用 readCollectionFile：内含 64MB 上限（超大文件正是「损坏」的典型形态，不能绕开整份读）
        if (mtimeChanged) {
          try {
            if (readCollectionFile(name) !== null) changed.push(name)
          } catch {
            /* 仍损坏：等待下次轮询 */
          }
        }
        continue
      }
      // mtimeMs 精度问题用 1ms 容差
      if (mtimeChanged) {
        changed.push(name)
      }
    } catch {
      /* 单个文件检测失败跳过 */
    }
  }
  if (changed.length === 0) return null
  const { data, issues } = loadAllWithIssues() // 同时刷新 storeMeta，并向渲染层透传本次加载问题
  return { changed, data, issues }
}

export function getLastWriteAt(): string | null {
  return lastWriteAt
}

/** 弹窗选择数据目录；确认后初始化目录结构并写入设置。取消返回 null。 */
export async function chooseDataDir(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: '选择数据存储目录（建议选择坚果云等网盘同步目录）',
    defaultPath: app.getPath('documents'),
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const dir = result.filePaths[0]
  initDataDir(dir)
  await updateSettings({ dataDir: dir })
  return dir
}

/** 初始化数据目录：创建缺失的集合文件（tools 带预置示例收藏，vocab 带内置节点类型） */
export function initDataDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
  fs.mkdirSync(path.join(dir, 'backups'), { recursive: true })
  for (const name of COLLECTION_NAMES) {
    const file = path.join(dir, COLLECTION_FILES[name])
    if (!fs.existsSync(file)) {
      const initial =
        name === 'tools' ? seedToolData() : name === 'vocab' ? DEFAULT_VOCAB : []
      fs.writeFileSync(file, JSON.stringify(initial, null, 2), 'utf-8')
    }
  }
}

/** 备份全部数据文件到 backups/<时间戳>/，保留最近 BACKUP_KEEP 份。返回备份目录路径。 */
export function backupNow(): string {
  if (!settings.dataDir) throw new Error('数据目录未配置')
  const stamp = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const dirName = `backup-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}`
  const backupDir = path.join(settings.dataDir, 'backups', dirName)
  fs.mkdirSync(backupDir, { recursive: true })
  for (const name of COLLECTION_NAMES) {
    const src = dataFile(name)
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(backupDir, COLLECTION_FILES[name]))
    }
  }
  pruneBackups()
  const today = new Date()
  const t = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  // 异步落盘 lastBackupDate：失败只影响「今日已备份」标记，不影响备份本身
  void updateSettings({ lastBackupDate: t }).catch((err) => {
    console.error('[store] 更新备份日期失败', err)
  })
  return backupDir
}

function pruneBackups(): void {
  const root = path.join(settings.dataDir!, 'backups')
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return
  }
  const dirs = entries
    .filter((e) => e.isDirectory() && e.name.startsWith('backup-'))
    .map((e) => e.name)
    .sort() // 时间戳命名，字典序即时间序
  const excess = dirs.length - BACKUP_KEEP
  for (let i = 0; i < excess; i++) {
    try {
      fs.rmSync(path.join(root, dirs[i]), { recursive: true, force: true })
    } catch {
      /* 清理失败不影响主流程 */
    }
  }
}

/** 冲突副本（conflict- 与 local- 前缀）按「前缀 + 集合」限保留最近 CONFLICT_KEEP_PER_COLLECTION 份；
 *  backups/ 位于网盘同步目录，无界增长会被多设备放大。文件名含时间戳，字典序即时间序。 */
function pruneConflictArchives(): void {
  const root = path.join(settings.dataDir!, 'backups')
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return
  }
  for (const prefix of ['conflict-', 'local-']) {
    const byCollection = new Map<string, string[]>()
    for (const e of entries) {
      if (!e.isFile() || !e.name.startsWith(prefix)) continue
      // 去掉时间戳段（-2026-10-04T…），剩下集合名作分组键
      const key = e.name.slice(prefix.length).replace(/-\d{4}-.*\.json$/, '')
      byCollection.set(key, [...(byCollection.get(key) ?? []), e.name])
    }
    for (const names of byCollection.values()) {
      // 文件名前缀一致、时间戳定宽：普通字典序即时间序，降序后丢弃第 N 份之后的（即最旧的）若干
      const excess = names.sort((a, b) => (a < b ? 1 : -1)).slice(CONFLICT_KEEP_PER_COLLECTION)
      for (const name of excess) {
        try {
          fs.rmSync(path.join(root, name), { force: true })
        } catch {
          /* 清理失败不影响主流程 */
        }
      }
    }
  }
}

/** 每日首次运行时自动备份 */
export function dailyBackupIfNeeded(): void {
  if (!settings.dataDir) return
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (settings.lastBackupDate !== today) {
    try {
      backupNow()
    } catch (err) {
      console.error('[store] 每日自动备份失败', err)
    }
  }
}

export { DEFAULT_REMIND_DAYS }
