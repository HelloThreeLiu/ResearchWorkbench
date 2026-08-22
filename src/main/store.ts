// 数据层：按实体集合存储为独立 JSON 文件（网盘同步友好）
// - 原子写入：先写 .tmp 再 rename，避免同步过程产生半截文件
// - 自动备份：每日首次运行 + 应用退出时快照到 backups/，保留最近 30 份
// - 外部变更检测：记录每次写入后的 mtime，周期性比对文件 mtime 以发现其他设备写入
import { app, dialog } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import {
  COLLECTION_FILES,
  DEFAULT_REMIND_DAYS,
  DEFAULT_REPORT_TEMPLATE,
  DEFAULT_VOCAB,
  type AllCollections,
  type AppSettings,
  type CollectionName,
  type ToolFileData,
  type VocabFileData
} from '@shared/types'
import { seedToolData } from './seed'

const COLLECTION_NAMES = Object.keys(COLLECTION_FILES) as CollectionName[]
const BACKUP_KEEP = 30

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json')
const metaPath = () => path.join(app.getPath('userData'), 'store-meta.json')

interface StoreMeta {
  [collection: string]: { mtimeMs: number; savedAt: string }
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

export function getSettings(): AppSettings {
  return settings
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  settings = { ...settings, ...patch }
  safeWriteJson(settingsPath(), settings)
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
    reports: []
  }
}

function readCollectionRaw(name: CollectionName): unknown {
  const file = dataFile(name)
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf-8'))
}

/** 加载全部集合；文件缺失时返回空集合 */
export function loadAll(): AllCollections {
  const result = emptyCollections()
  if (!settings.dataDir) return result
  for (const name of COLLECTION_NAMES) {
    try {
      const raw = readCollectionRaw(name)
      if (raw == null) continue
      if (name === 'tools') {
        const t = raw as ToolFileData
        result.tools = { groups: t.groups ?? [], items: t.items ?? [] }
      } else if (name === 'vocab') {
        const v = raw as VocabFileData
        // 旧目录无 vocab.json / 旧版本缺 achievementTypes、logTemplates 时兜底为默认词汇库
        result.vocab = {
          tags: v.tags ?? [],
          milestoneTypes: v.milestoneTypes ?? DEFAULT_VOCAB.milestoneTypes,
          achievementTypes: v.achievementTypes ?? DEFAULT_VOCAB.achievementTypes,
          logTemplates: v.logTemplates ?? DEFAULT_VOCAB.logTemplates
        }
      } else {
        // 其余集合均为数组
        const arr = raw as unknown[]
        if (Array.isArray(arr)) {
          ;(result as unknown as Record<string, unknown>)[name] = arr
        }
      }
      const st = fs.statSync(dataFile(name))
      storeMeta[name] = { mtimeMs: st.mtimeMs, savedAt: new Date().toISOString() }
    } catch (err) {
      console.error(`[store] 读取 ${name} 失败`, err)
    }
  }
  persistStoreMeta()
  return result
}

function safeWriteJson(file: string, data: unknown): void {
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
  // Windows 下网盘/杀软可能短暂占用文件，rename 失败时重试
  let lastErr: unknown = null
  for (let i = 0; i < 5; i++) {
    try {
      fs.renameSync(tmp, file)
      return
    } catch (err) {
      lastErr = err
    }
    const until = Date.now() + 100
    while (Date.now() < until) {
      /* 简单自旋等待 100ms */
    }
  }
  throw lastErr
}

function persistStoreMeta(): void {
  try {
    safeWriteJson(metaPath(), storeMeta)
  } catch (err) {
    console.error('[store] 写入 meta 失败', err)
  }
}

/** 保存单个集合并记录 mtime */
export function saveCollection(name: CollectionName, data: unknown): { savedAt: string } {
  if (!settings.dataDir) throw new Error('数据目录未配置')
  safeWriteJson(dataFile(name), data)
  const savedAt = new Date().toISOString()
  const st = fs.statSync(dataFile(name))
  storeMeta[name] = { mtimeMs: st.mtimeMs, savedAt }
  lastWriteAt = savedAt
  persistStoreMeta()
  return { savedAt }
}

/**
 * 检测外部修改（另一台设备经网盘写入）：比对磁盘 mtime 与本应用记录的写入后 mtime。
 * 返回发生变化的集合及最新数据；无变化返回 null。
 */
export function checkExternalChanges(): { changed: CollectionName[]; data: AllCollections } | null {
  if (!settings.dataDir) return null
  const changed: CollectionName[] = []
  for (const name of COLLECTION_NAMES) {
    try {
      const file = dataFile(name)
      if (!fs.existsSync(file)) continue
      const mtimeMs = fs.statSync(file).mtimeMs
      const recorded = storeMeta[name]?.mtimeMs
      // mtimeMs 精度问题用 1ms 容差
      if (recorded === undefined || Math.abs(recorded - mtimeMs) > 1) {
        changed.push(name)
      }
    } catch {
      /* 单个文件检测失败跳过 */
    }
  }
  if (changed.length === 0) return null
  const data = loadAll() // loadAll 会刷新 storeMeta
  return { changed, data }
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
  updateSettings({ dataDir: dir })
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
  updateSettings({ lastBackupDate: t })
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
