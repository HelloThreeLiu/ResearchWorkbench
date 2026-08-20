// 格致 · 科研工作台 —— 共享类型定义（主进程与渲染进程共用）

export type ProjectStatus = 'active' | 'completed' | 'archived'
export type TaskStatus = 'todo' | 'in_progress' | 'done'
export type Priority = 'high' | 'medium' | 'low'
/**
 * 节点类型：内置类型（proposal/submission/conference/midterm/defense/other）为固定 id，
 * 用户自定义类型以 uid 为 id；type 字段统一按 string 处理，展示名经词汇库解析。
 */
export type MilestoneType = string
export type MilestoneStatus = 'pending' | 'done'
export type IdeaStatus = 'new' | 'organized' | 'converted'
export type ToolType = 'url' | 'file' | 'folder' | 'app'
export type ThemeMode = 'system' | 'light' | 'dark'

export interface Project {
  id: string
  name: string
  description: string
  color: string
  status: ProjectStatus
  start_date: string | null // YYYY-MM-DD
  end_date: string | null
  created_at: string // ISO
  updated_at: string
}

export interface Task {
  id: string
  title: string
  project_id: string | null // 空 = 杂项任务
  status: TaskStatus
  priority: Priority
  due_date: string | null
  tags: string[]
  note: string
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface Milestone {
  id: string
  title: string
  date: string // YYYY-MM-DD
  type: MilestoneType
  project_id: string | null
  remind_days: number[] // 提前提醒天数，默认 [7,3,1]
  note: string
  status: MilestoneStatus
  created_at: string
  updated_at: string
}

export interface Idea {
  id: string
  content: string
  tags: string[]
  project_id: string | null
  status: IdeaStatus
  converted_task_id: string | null
  created_at: string
  updated_at: string
}

export interface ProgressLog {
  id: string
  project_id: string
  date: string // YYYY-MM-DD
  content: string // Markdown
  created_at: string
  updated_at: string
}

export interface ToolBookmark {
  id: string
  name: string
  type: ToolType
  target: string // URL 或本地路径
  group_id: string | null
  note: string
  sort: number
  created_at: string
  updated_at: string
}

export interface ToolGroup {
  id: string
  name: string
  sort: number
}

export interface ToolFileData {
  groups: ToolGroup[]
  items: ToolBookmark[]
}

/** 词汇库：用户可管理的标签集合与节点类型集合（内置类型 builtin=true 不可删除） */
export interface TagDef {
  id: string
  name: string
}

export interface MilestoneTypeDef {
  id: string // 内置类型用固定 id（proposal 等），自定义类型用 uid
  name: string
  builtin: boolean
}

export interface VocabFileData {
  tags: TagDef[]
  milestoneTypes: MilestoneTypeDef[]
}

export interface AppSettings {
  dataDir: string | null
  theme: ThemeMode
  hotkey: string // 全局速记快捷键，默认 Alt+N
  closeToTray: boolean
  lastBackupDate: string | null // YYYY-MM-DD，用于「每日首次运行备份」
}

// 数据集合名 → 文件名（projects.json / tasks.json / ...）
export type CollectionName =
  | 'projects'
  | 'tasks'
  | 'milestones'
  | 'ideas'
  | 'logs'
  | 'tools'
  | 'vocab'

export interface AllCollections {
  projects: Project[]
  tasks: Task[]
  milestones: Milestone[]
  ideas: Idea[]
  logs: ProgressLog[]
  tools: ToolFileData
  vocab: VocabFileData
}

export interface BootstrapResult {
  needsOnboarding: boolean
  dataDir: string | null
  collections: AllCollections
  settings: AppSettings
  meta: { lastWriteAt: string | null } // 上次数据写入时间（概览页同步状态展示）
}

export const COLLECTION_FILES: Record<CollectionName, string> = {
  projects: 'projects.json',
  tasks: 'tasks.json',
  milestones: 'milestones.json',
  ideas: 'ideas.json',
  logs: 'progress_logs.json',
  tools: 'tools.json',
  vocab: 'vocab.json'
}

export const DEFAULT_REMIND_DAYS = [7, 3, 1]

/** 内置节点类型（固定 id，可改名不可删除） */
export const BUILTIN_MILESTONE_TYPES: MilestoneTypeDef[] = [
  { id: 'proposal', name: '开题', builtin: true },
  { id: 'submission', name: '投稿截止', builtin: true },
  { id: 'conference', name: '会议', builtin: true },
  { id: 'midterm', name: '中期检查', builtin: true },
  { id: 'defense', name: '答辩', builtin: true },
  { id: 'other', name: '其他', builtin: true }
]

/** 词汇库缺省内容（旧数据目录无 vocab.json 时兜底） */
export const DEFAULT_VOCAB: VocabFileData = {
  tags: [],
  milestoneTypes: BUILTIN_MILESTONE_TYPES
}

/** 内置类型展示名兜底（未经词汇库解析时使用） */
export const MILESTONE_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  BUILTIN_MILESTONE_TYPES.map((t) => [t.id, t.name])
)

export const PRIORITY_LABELS: Record<Priority, string> = {
  high: '高',
  medium: '中',
  low: '低'
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: '待办',
  in_progress: '进行中',
  done: '已完成'
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: '进行中',
  completed: '已完成',
  archived: '已归档'
}

export const IDEA_STATUS_LABELS: Record<IdeaStatus, string> = {
  new: '新想法',
  organized: '已整理',
  converted: '已转换'
}

export const TOOL_TYPE_LABELS: Record<ToolType, string> = {
  url: '网址',
  file: '文件',
  folder: '文件夹',
  app: '程序'
}

// 项目可选颜色（用于卡片标识、日历任务标记）
export const PROJECT_COLORS = [
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#06b6d4'
] as const

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

export function nowISO(): string {
  return new Date().toISOString()
}

export function todayStr(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
