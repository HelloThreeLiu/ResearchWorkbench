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
/** 界面风格主题（与明暗 ThemeMode 正交）：linear 精密高效 / claude 学术编辑 / notion 暖中性 */
export type StyleTheme = 'linear' | 'claude' | 'notion'

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
  // 论文日期自动生成的节点回链（手工节点为 null）
  source_paper_id: string | null
  source_kind: 'draft' | 'submission' | 'result' | 'camera_ready' | null
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

// ---------- V2 实体 ----------

export type PaperType = 'journal' | 'conference'
/** 状态流转：构思 → 写作中 → 已投稿 → 审稿中 → 大修/小修 → 录用/拒稿（可回退；拒稿后改投重置） */
export type PaperStatus =
  | 'idea'
  | 'writing'
  | 'submitted'
  | 'reviewing'
  | 'major_revision'
  | 'minor_revision'
  | 'accepted'
  | 'rejected'

/** 论文章节（章节级任务，与任务系统双向联动） */
export interface PaperSection {
  id: string
  title: string
  task_id: string | null // 关联的任务 id（同步出现在任务列表）
  done: boolean
}

export interface Paper {
  id: string
  title: string
  venue: string // 目标期刊/会议
  type: PaperType
  status: PaperStatus
  year: number | null // 发表年份（快速导入已发表论文时录入；投稿中的论文可空）
  round: number // 当前轮次（投稿后每轮 +1）
  dates: {
    draft: string | null // 初稿
    submission: string | null // 投稿
    result: string | null // 结果通知
    camera_ready: string | null
  }
  repo_url: string
  project_id: string | null
  collaborators: string
  note: string
  cited_reference_ids: string[] // 已引用的文献 id 列表（投稿前核对相关工作引用，决策 D19）
  sections: PaperSection[]
  created_at: string
  updated_at: string
}

/** 成果类型：内置类型（paper/patent/award/project/other）为固定 id，自定义类型以 uid 为 id，展示名经词汇库解析 */
export type AchievementType = string

export interface Achievement {
  id: string
  type: AchievementType
  title: string
  date: string // YYYY-MM-DD
  level: string // 如 CCF-A / SCI 一区 / 校级
  project_id: string | null
  detail: string
  evidence_path: string // 证明材料路径
  is_draft: boolean // 录用论文自动生成的草稿项
  created_at: string
  updated_at: string
}

export type ReportKind = 'weekly' | 'monthly' | 'summary'

export interface Report {
  id: string
  kind: ReportKind
  title: string
  period_start: string // YYYY-MM-DD（含）
  period_end: string // YYYY-MM-DD（含）
  content: string // Markdown
  generated_at: string
  updated_at: string
}

// ---------- V2.5 实体（文献线索层） ----------

/** 阅读状态固定四态，不进词汇库不可自定义（决策 D17：状态语义全局统一才有筛选价值） */
export type ReadingStatus = 'unread' | 'reading' | 'read' | 'skipped'

/** 条目类型与 BibTeX/CSL 类型一一对应（misc 含 @online/@electronic 等别名） */
export type ReferenceEntryType =
  | 'article'
  | 'inproceedings'
  | 'book'
  | 'phdthesis'
  | 'mastersthesis'
  | 'techreport'
  | 'misc'

/** 文献条目：管理「文献与科研进度的关系」，不管理文献原文（PDF 交给 Zotero/系统阅读器） */
export interface Reference {
  id: string
  citekey: string // BibTeX 引用键（去重与 BibTeX 复制的依据，可空）
  entry_type: ReferenceEntryType
  title: string
  authors: string[] // 原样保存（「姓, 名」或「名 姓」），引用格式化时再解析
  year: number | null
  venue: string // 期刊/会议名（图书为出版社、学位论文为学校的兜底映射）
  volume: string
  issue: string
  pages: string
  doi: string
  url: string
  tags: string[]
  status: ReadingStatus
  project_id: string | null
  note: string // Markdown
  pdf_path: string | null
  created_at: string // ISO
  updated_at: string
}

/** 导入解析出的条目草稿（主进程返回，渲染层补 id/时间戳/状态后入库） */
export interface ReferenceDraft {
  citekey: string
  entry_type: ReferenceEntryType
  title: string
  authors: string[]
  year: number | null
  venue: string
  volume: string
  issue: string
  pages: string
  doi: string
  url: string
  tags: string[]
}

/** 单条解析失败（含原因，绝不静默丢弃） */
export interface ImportFailure {
  key: string // 条目 citekey 或在文件中的序号
  reason: string
}

/** import:parse-references IPC 返回值 */
export interface ParseReferencesResult {
  entries: ReferenceDraft[]
  failures: ImportFailure[]
  notes: string[] // 整体提示（如含 crossref 的条目按可解析字段导入）
}

/** ---------- 会议纪要与写作度量（V2.6） ---------- */

/** 会议行动项：可一键转任务并单向回写完成态（任务 → 行动项，决策 D12） */
export interface MeetingActionItem {
  text: string
  done: boolean
  task_id: string | null // 转任务成功后回填；任务删除后保留悬空 id（跳转入口按任务存在性渲染）
}

/** 导师会议纪要：带行动项的结构化会谈记录（与进展日志分工：日志=项目过程流水，会议=人与人的会谈产出） */
export interface Meeting {
  id: string
  date: string // YYYY-MM-DD
  title: string
  attendees: string // 自由文本
  project_id: string | null // 可空表示跨项目
  content: string // 讨论纪要 Markdown
  action_items: MeetingActionItem[]
  created_at: string
  updated_at: string
}

/** 写作 Session：一次手动起止的写作记录（时长由起止时间派生，不落盘） */
export interface WritingSession {
  id: string
  started_at: string // ISO
  ended_at: string | null // null = 进行中（异常残留检测的判定依据，见 PRD 5.5.3）
  project_id: string | null
  paper_id: string | null
  section: string // 章节自由文本（如「3.2 实验设计」），可空
  words: number | null // 手录字数，可空
  note: string
  created_at: string
  updated_at: string
}

/** 词汇库：用户可管理的标签集合与枚举类型集合（内置类型 builtin=true 不可删除） */
export interface TagDef {
  id: string
  name: string
}

/** 通用类型定义（节点类型 / 成果类型共用结构） */
export interface VocabTypeDef {
  id: string // 内置类型用固定 id（proposal 等），自定义类型用 uid
  name: string
  builtin: boolean
}

/** @deprecated 兼容别名，等价于 VocabTypeDef */
export type MilestoneTypeDef = VocabTypeDef

/** 进展日志模板：录入时一次性预填的 Markdown 骨架（无外键，日志内容独立存储） */
export interface LogTemplate {
  id: string // 内置模板用固定 id，自定义模板用 uid
  name: string
  builtin: boolean
  content: string // Markdown 骨架
}

export interface VocabFileData {
  tags: TagDef[]
  milestoneTypes: VocabTypeDef[]
  achievementTypes: VocabTypeDef[]
  logTemplates: LogTemplate[]
}

export interface AppSettings {
  dataDir: string | null
  theme: ThemeMode
  styleTheme: StyleTheme // 界面风格主题，默认 linear
  hotkey: string // 全局速记快捷键，默认 Alt+N
  closeToTray: boolean
  lastBackupDate: string | null // YYYY-MM-DD，用于「每日首次运行备份」
  reportTemplate: string // 周报/月报 Markdown 模板（占位符方式）
}

/**
 * 默认报告模板：占位符 {{TITLE}} {{PERIOD}} {{WORK}} {{PLAN}} {{THOUGHTS}} {{MEETINGS}} {{WRITING}}。
 * 按 D21 在「一、本期工作」内追加会议子块与写作块；占位符可选——自定义模板不含则该块不出现（PRD 5.6.2）。
 */
export const DEFAULT_REPORT_TEMPLATE = `# {{TITLE}}（{{PERIOD}}）

## 一、本期工作

{{WORK}}

{{MEETINGS}}

{{WRITING}}

## 二、下期计划

{{PLAN}}

## 三、问题与思考

{{THOUGHTS}}
`

/** V2.6 之前的默认模板：用于识别「从未自定义过模板」的旧用户，升级时自动换用新默认 */
export const LEGACY_DEFAULT_REPORT_TEMPLATE = `# {{TITLE}}（{{PERIOD}}）

## 一、本期工作

{{WORK}}

## 二、下期计划

{{PLAN}}

## 三、问题与思考

{{THOUGHTS}}
`

/** 模板兼容解析（PRD 5.6.3 旧用户自定义模板不变）：与旧默认逐字符相等视为未自定义 → 换用新默认；自定义过则原样保留 */
export function resolveReportTemplate(tpl: string): string {
  return tpl === LEGACY_DEFAULT_REPORT_TEMPLATE ? DEFAULT_REPORT_TEMPLATE : tpl
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
  | 'papers'
  | 'achievements'
  | 'reports'
  | 'references'
  | 'meetings'
  | 'sessions'

export interface AllCollections {
  projects: Project[]
  tasks: Task[]
  milestones: Milestone[]
  ideas: Idea[]
  logs: ProgressLog[]
  tools: ToolFileData
  vocab: VocabFileData
  papers: Paper[]
  achievements: Achievement[]
  reports: Report[]
  references: Reference[]
  meetings: Meeting[]
  sessions: WritingSession[]
}

/** 数据加载问题（文件解析失败 / 记录结构不合法），由渲染层以醒目提示条展示 */
export interface LoadIssue {
  collection: CollectionName
  kind: 'parse' | 'shape'
  detail: string
}

/** store:check-external IPC 返回值 */
export interface ExternalChangesResult {
  changed: CollectionName[]
  data: AllCollections
  issues: LoadIssue[]
}

export interface BootstrapResult {
  needsOnboarding: boolean
  dataDir: string | null
  collections: AllCollections
  settings: AppSettings
  meta: { lastWriteAt: string | null } // 上次数据写入时间（概览页同步状态展示）
  /** 加载数据时发现的问题（解析失败/结构不合法），正常为空数组 */
  issues: LoadIssue[]
}

// ---------- 应用更新（CNB 国内镜像 + GitHub Releases 双源，electron-updater） ----------

/** 手动检查更新的结果（update:check IPC 返回值） */
export interface UpdateCheckResult {
  /** available=有新版本；unavailable=已是最新；dev=开发模式；error=检查失败 */
  status: 'available' | 'unavailable' | 'dev' | 'error'
  currentVersion: string
  newVersion: string | null
  /** 更新日志 Markdown（来自 GitHub Release 说明，拉取失败为空串，UI 兜底提示） */
  notes: string
  /** GitHub Release 页面链接（手动下载兜底入口） */
  releaseUrl: string | null
  /** CNB 国内镜像安装包直链（仅镜像源检查命中时有值；弹窗「国内高速下载」入口） */
  mirrorUrl: string | null
  error: string | null
}

/** 主进程 → 渲染进程的更新事件（update:event 推送） */
export type UpdateEvent =
  | {
      kind: 'available'
      version: string
      notes: string
      releaseUrl: string | null
      mirrorUrl: string | null
    }
  | {
      kind: 'progress'
      percent: number
      bytesPerSecond: number
      transferred: number
      total: number
    }
  | { kind: 'downloaded'; version: string }
  | { kind: 'error'; message: string }

export const COLLECTION_FILES: Record<CollectionName, string> = {
  projects: 'projects.json',
  tasks: 'tasks.json',
  milestones: 'milestones.json',
  ideas: 'ideas.json',
  logs: 'progress_logs.json',
  tools: 'tools.json',
  vocab: 'vocab.json',
  papers: 'papers.json',
  achievements: 'achievements.json',
  reports: 'reports.json',
  references: 'references.json',
  meetings: 'meetings.json',
  sessions: 'sessions.json'
}

export const DEFAULT_REMIND_DAYS = [7, 3, 1]

/** 内置节点类型（固定 id，可改名不可删除） */
export const BUILTIN_MILESTONE_TYPES: VocabTypeDef[] = [
  { id: 'proposal', name: '开题', builtin: true },
  { id: 'submission', name: '投稿截止', builtin: true },
  { id: 'conference', name: '会议', builtin: true },
  { id: 'midterm', name: '中期检查', builtin: true },
  { id: 'defense', name: '答辩', builtin: true },
  { id: 'other', name: '其他', builtin: true }
]

/** 内置成果类型（固定 id，可改名不可删除） */
export const BUILTIN_ACHIEVEMENT_TYPES: VocabTypeDef[] = [
  { id: 'paper', name: '论文', builtin: true },
  { id: 'patent', name: '专利', builtin: true },
  { id: 'award', name: '获奖', builtin: true },
  { id: 'project', name: '项目', builtin: true },
  { id: 'other', name: '其他', builtin: true }
]

/** 内置日志模板（固定 id，可改名改内容、不可删除） */
export const BUILTIN_LOG_TEMPLATES: LogTemplate[] = [
  {
    id: 'experiment',
    name: '实验记录',
    builtin: true,
    content: `## 目的

（本次实验要验证什么）

## 方法与参数

（环境 / 数据 / 参数配置）

## 结果

（现象与数据）

## 下一步`
  },
  {
    id: 'literature',
    name: '文献阅读',
    builtin: true,
    content: `## 文献信息

（标题 / 作者 / 年份 / 来源）

## 核心要点

## 对我的启发

## 待办`
  },
  {
    id: 'debugging',
    name: '调试排错',
    builtin: true,
    content: `## 现象

（报错信息 / 异常表现）

## 假设

## 验证过程

## 结论`
  }
]

/** 词汇库缺省内容（旧数据目录无 vocab.json 时兜底） */
export const DEFAULT_VOCAB: VocabFileData = {
  tags: [],
  milestoneTypes: BUILTIN_MILESTONE_TYPES,
  achievementTypes: BUILTIN_ACHIEVEMENT_TYPES,
  logTemplates: BUILTIN_LOG_TEMPLATES
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

// ---------- V2 标签与顺序 ----------

export const PAPER_TYPE_LABELS: Record<PaperType, string> = {
  journal: '期刊',
  conference: '会议'
}

export const PAPER_STATUS_LABELS: Record<PaperStatus, string> = {
  idea: '构思',
  writing: '写作中',
  submitted: '已投稿',
  reviewing: '审稿中',
  major_revision: '大修',
  minor_revision: '小修',
  accepted: '录用',
  rejected: '拒稿'
}

/** 看板/分组展示顺序（按流转阶段） */
export const PAPER_STATUS_ORDER: PaperStatus[] = [
  'idea',
  'writing',
  'submitted',
  'reviewing',
  'major_revision',
  'minor_revision',
  'accepted',
  'rejected'
]

export const PAPER_DATE_LABELS: Record<keyof Paper['dates'], string> = {
  draft: '初稿',
  submission: '投稿',
  result: '结果通知',
  camera_ready: 'Camera-ready'
}

// ---------- V2.5 文献标签 ----------

export const READING_STATUS_LABELS: Record<ReadingStatus, string> = {
  unread: '待读',
  reading: '在读',
  read: '已读',
  skipped: '略读'
}

export const REFERENCE_ENTRY_TYPE_LABELS: Record<ReferenceEntryType, string> = {
  article: '期刊论文',
  inproceedings: '会议论文',
  book: '图书',
  phdthesis: '博士论文',
  mastersthesis: '硕士论文',
  techreport: '技术报告',
  misc: '其他'
}

/** 内置成果类型展示名兜底（未经词汇库解析时使用） */
export const ACHIEVEMENT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  BUILTIN_ACHIEVEMENT_TYPES.map((t) => [t.id, t.name])
)

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
