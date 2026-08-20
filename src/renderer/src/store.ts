// 渲染进程数据中心：
// - 内存中保存全部集合，任何修改先更新内存，再按集合防抖 800ms 落盘（减少网盘同步压力）
// - 窗口聚焦 + 定时轮询检测另一设备经网盘写入的外部变更，发现后自动重载
import { create } from 'zustand'
import {
  type AllCollections,
  type AppSettings,
  type CollectionName,
  type Idea,
  type Milestone,
  type MilestoneTypeDef,
  type Paper,
  type PaperSection,
  type ProgressLog,
  type Project,
  type Report,
  type TagDef,
  type Task,
  type ToolBookmark,
  type ToolFileData,
  type ToolGroup,
  type VocabFileData,
  type Achievement,
  BUILTIN_MILESTONE_TYPES,
  DEFAULT_REPORT_TEMPLATE,
  PAPER_DATE_LABELS,
  nowISO,
  todayStr,
  uid
} from '@shared/types'

const SAVE_DEBOUNCE_MS = 800

interface AppState {
  ready: boolean
  needsOnboarding: boolean
  dataDir: string | null
  settings: AppSettings
  lastWriteAt: string | null
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

  bootstrap: () => Promise<void>
  chooseDataDir: () => Promise<boolean>
  refreshExternal: () => Promise<void>
  updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
  backupNow: () => Promise<{ ok: boolean; dir?: string; error?: string }>

  addProject: (input: Partial<Project> & { name: string }) => Project
  updateProject: (id: string, patch: Partial<Project>) => void
  deleteProject: (id: string) => void

  addTask: (input: Partial<Task> & { title: string }) => Task
  updateTask: (id: string, patch: Partial<Task>) => void
  deleteTask: (id: string) => void

  addMilestone: (input: Partial<Milestone> & { title: string; date: string }) => Milestone
  updateMilestone: (id: string, patch: Partial<Milestone>) => void
  deleteMilestone: (id: string) => void

  addIdea: (input: Partial<Idea> & { content: string }) => Idea
  updateIdea: (id: string, patch: Partial<Idea>) => void
  deleteIdea: (id: string) => void

  addLog: (input: Partial<ProgressLog> & { project_id: string; date: string; content: string }) => ProgressLog
  updateLog: (id: string, patch: Partial<ProgressLog>) => void
  deleteLog: (id: string) => void

  addToolItem: (input: Partial<ToolBookmark> & { name: string; type: ToolBookmark['type']; target: string }) => ToolBookmark
  updateToolItem: (id: string, patch: Partial<ToolBookmark>) => void
  deleteToolItem: (id: string) => void
  moveToolItem: (id: string, groupId: string | null) => void
  addToolGroup: (name: string) => ToolGroup
  renameToolGroup: (id: string, name: string) => void
  deleteToolGroup: (id: string) => void
  reorderToolGroups: (orderedIds: string[]) => void

  // ---------- 词汇库（标签 / 节点类型） ----------
  addTag: (name: string) => TagDef
  renameTag: (id: string, name: string) => void
  deleteTag: (id: string) => void
  addMilestoneType: (name: string) => MilestoneTypeDef
  renameMilestoneType: (id: string, name: string) => void
  deleteMilestoneType: (id: string) => void

  // ---------- 论文（V2） ----------
  addPaper: (input: Partial<Paper> & { title: string }) => Paper
  updatePaper: (id: string, patch: Partial<Paper>) => void
  deletePaper: (id: string) => void
  addPaperSection: (paperId: string, title: string, createTask: boolean) => void
  renamePaperSection: (paperId: string, sectionId: string, title: string) => void
  togglePaperSection: (paperId: string, sectionId: string, done: boolean) => void
  deletePaperSection: (paperId: string, sectionId: string) => void
  linkPaperSectionTask: (paperId: string, sectionId: string, taskId: string | null) => void

  // ---------- 成果台账（V2） ----------
  addAchievement: (input: Partial<Achievement> & { title: string }) => Achievement
  updateAchievement: (id: string, patch: Partial<Achievement>) => void
  deleteAchievement: (id: string) => void

  // ---------- 汇报（V2） ----------
  saveReport: (report: Report) => void
  deleteReport: (id: string) => void
}

/** 防抖落盘队列（集合级） */
const pendingTimers = new Map<CollectionName, ReturnType<typeof setTimeout>>()
let flushing: Promise<void> = Promise.resolve()

function collectionOf(state: AppState, name: CollectionName): unknown {
  return (state as unknown as Record<string, unknown>)[name]
}

function schedulePersist(
  get: () => AppState,
  name: CollectionName
): void {
  const existing = pendingTimers.get(name)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => {
    pendingTimers.delete(name)
    const data = collectionOf(get(), name)
    flushing = flushing.then(() =>
      window.api.saveCollection(name, data).then((r) => {
        useStore.setState({ lastWriteAt: r.savedAt })
      }).catch((err) => {
        console.error('[store] 落盘失败', name, err)
      })
    )
  }, SAVE_DEBOUNCE_MS)
  pendingTimers.set(name, timer)
}

/** 数组集合的通用变更：updater 返回新数组后写回 state 并调度落盘 */
function mutateArray<
  K extends 'projects' | 'tasks' | 'milestones' | 'ideas' | 'logs' | 'papers' | 'achievements' | 'reports'
>(get: () => AppState, set: (partial: Partial<AppState>) => void, name: K, updater: (arr: AppState[K]) => AppState[K]): void {
  const next = updater(get()[name])
  set({ [name]: next } as unknown as Partial<AppState>)
  schedulePersist(get, name)
}

async function flushPendingSaves(): Promise<void> {
  // 立即执行所有待落盘任务（先到先写，保持顺序）
  for (const [name, timer] of pendingTimers) {
    clearTimeout(timer)
    pendingTimers.delete(name)
    const data = collectionOf(useStore.getState(), name)
    try {
      const r = await window.api.saveCollection(name, data)
      useStore.setState({ lastWriteAt: r.savedAt })
    } catch (err) {
      console.error('[store] 落盘失败', name, err)
    }
  }
  await flushing
}

export const useStore = create<AppState>((set, get) => ({
  ready: false,
  needsOnboarding: true,
  dataDir: null,
  settings: {
    dataDir: null,
    theme: 'system',
    hotkey: 'Alt+N',
    closeToTray: true,
    lastBackupDate: null,
    reportTemplate: DEFAULT_REPORT_TEMPLATE
  },
  lastWriteAt: null,
  projects: [],
  tasks: [],
  milestones: [],
  ideas: [],
  logs: [],
  tools: { groups: [], items: [] },
  vocab: { tags: [], milestoneTypes: BUILTIN_MILESTONE_TYPES },
  papers: [],
  achievements: [],
  reports: [],

  bootstrap: async () => {
    const result = await window.api.bootstrap()
    set({
      ready: true,
      needsOnboarding: result.needsOnboarding,
      dataDir: result.dataDir,
      settings: result.settings,
      lastWriteAt: result.meta.lastWriteAt,
      ...result.collections
    })
  },

  chooseDataDir: async () => {
    const result = await window.api.chooseDataDir()
    if (!result) return false
    set({
      needsOnboarding: false,
      dataDir: result.dataDir,
      settings: result.settings,
      ...result.collections
    })
    return true
  },

  refreshExternal: async () => {
    if (get().needsOnboarding) return
    await flushPendingSaves()
    const result = await window.api.checkExternalChanges()
    if (result && result.changed.length > 0) {
      set({ ...result.data })
      console.info('[store] 已重载外部变更集合:', result.changed.join(', '))
    }
  },

  updateSettings: async (patch) => {
    const next = await window.api.updateSettings(patch)
    set({ settings: next })
    return next
  },

  backupNow: async () => {
    const result = await window.api.backupNow()
    if (result.ok) {
      // 触发一次备份后同步刷新设置的 lastBackupDate 展示
      const boot = await window.api.bootstrap()
      set({ settings: boot.settings })
    }
    return result
  },

  // ---------- 项目 ----------
  addProject: (input) => {
    const now = nowISO()
    const project: Project = {
      id: uid(),
      name: input.name,
      description: input.description ?? '',
      color: input.color ?? '#3b82f6',
      status: input.status ?? 'active',
      start_date: input.start_date ?? new Date().toISOString().slice(0, 10),
      end_date: input.end_date ?? null,
      created_at: now,
      updated_at: now
    }
    mutateArray(get, set, 'projects', (arr) => [...arr, project])
    return project
  },
  updateProject: (id, patch) => {
    mutateArray(get, set, 'projects', (arr) =>
      arr.map((p) => (p.id === id ? { ...p, ...patch, updated_at: nowISO() } : p))
    )
  },
  deleteProject: (id) => {
    mutateArray(get, set, 'projects', (arr) => arr.filter((p) => p.id !== id))
    // 级联：清理下属任务/节点/日志的关联，灵感与论文改为未关联
    mutateArray(get, set, 'tasks', (arr) => arr.filter((t) => t.project_id !== id))
    mutateArray(get, set, 'milestones', (arr) => arr.filter((m) => m.project_id !== id))
    mutateArray(get, set, 'logs', (arr) => arr.filter((l) => l.project_id !== id))
    mutateArray(get, set, 'ideas', (arr) =>
      arr.map((i) => (i.project_id === id ? { ...i, project_id: null } : i))
    )
    mutateArray(get, set, 'papers', (arr) =>
      arr.map((p) => (p.project_id === id ? { ...p, project_id: null } : p))
    )
  },

  // ---------- 任务 ----------
  addTask: (input) => {
    const now = nowISO()
    const task: Task = {
      id: uid(),
      title: input.title,
      project_id: input.project_id ?? null,
      status: input.status ?? 'todo',
      priority: input.priority ?? 'medium',
      due_date: input.due_date ?? null,
      tags: input.tags ?? [],
      note: input.note ?? '',
      completed_at: null,
      created_at: now,
      updated_at: now
    }
    mutateArray(get, set, 'tasks', (arr) => [...arr, task])
    return task
  },
  updateTask: (id, patch) => {
    mutateArray(get, set, 'tasks', (arr) =>
      arr.map((t) => {
        if (t.id !== id) return t
        const next: Task = { ...t, ...patch, updated_at: nowISO() }
        if (patch.status === 'done' && t.status !== 'done') {
          next.completed_at = nowISO() // 记录完成时间，供周报聚合
        } else if (patch.status && patch.status !== 'done') {
          next.completed_at = null
        }
        return next
      })
    )
    // 论文章节任务双向同步：任务勾选 ↔ 章节完成
    const updated = get().tasks.find((t) => t.id === id)
    if (updated) {
      mutateArray(get, set, 'papers', (papers) =>
        papers.map((p) => {
          if (!p.sections.some((s) => s.task_id === id)) return p
          return {
            ...p,
            updated_at: nowISO(),
            sections: p.sections.map((s) =>
              s.task_id === id ? { ...s, done: updated.status === 'done' } : s
            )
          }
        })
      )
    }
  },
  deleteTask: (id) => {
    mutateArray(get, set, 'tasks', (arr) => arr.filter((t) => t.id !== id))
  },

  // ---------- 节点 ----------
  addMilestone: (input) => {
    const now = nowISO()
    const milestone: Milestone = {
      id: uid(),
      title: input.title,
      date: input.date,
      type: input.type ?? 'other',
      project_id: input.project_id ?? null,
      remind_days: input.remind_days ?? [7, 3, 1],
      note: input.note ?? '',
      status: input.status ?? 'pending',
      source_paper_id: null,
      source_kind: null,
      created_at: now,
      updated_at: now
    }
    mutateArray(get, set, 'milestones', (arr) => [...arr, milestone])
    return milestone
  },
  updateMilestone: (id, patch) => {
    mutateArray(get, set, 'milestones', (arr) =>
      arr.map((m) => (m.id === id ? { ...m, ...patch, updated_at: nowISO() } : m))
    )
  },
  deleteMilestone: (id) => {
    mutateArray(get, set, 'milestones', (arr) => arr.filter((m) => m.id !== id))
  },

  // ---------- 灵感 ----------
  addIdea: (input) => {
    const now = nowISO()
    const idea: Idea = {
      id: uid(),
      content: input.content,
      tags: input.tags ?? [],
      project_id: input.project_id ?? null,
      status: input.status ?? 'new',
      converted_task_id: null,
      created_at: now,
      updated_at: now
    }
    mutateArray(get, set, 'ideas', (arr) => [idea, ...arr])
    return idea
  },
  updateIdea: (id, patch) => {
    mutateArray(get, set, 'ideas', (arr) =>
      arr.map((i) => (i.id === id ? { ...i, ...patch, updated_at: nowISO() } : i))
    )
  },
  deleteIdea: (id) => {
    mutateArray(get, set, 'ideas', (arr) => arr.filter((i) => i.id !== id))
  },

  // ---------- 进展日志 ----------
  addLog: (input) => {
    const now = nowISO()
    const log: ProgressLog = {
      id: uid(),
      project_id: input.project_id,
      date: input.date,
      content: input.content,
      created_at: now,
      updated_at: now
    }
    mutateArray(get, set, 'logs', (arr) => [...arr, log])
    return log
  },
  updateLog: (id, patch) => {
    mutateArray(get, set, 'logs', (arr) =>
      arr.map((l) => (l.id === id ? { ...l, ...patch, updated_at: nowISO() } : l))
    )
  },
  deleteLog: (id) => {
    mutateArray(get, set, 'logs', (arr) => arr.filter((l) => l.id !== id))
  },

  // ---------- 工具收藏 ----------
  addToolItem: (input) => {
    const now = nowISO()
    const items = get().tools.items
    const item: ToolBookmark = {
      id: uid(),
      name: input.name,
      type: input.type,
      target: input.target,
      group_id: input.group_id ?? null,
      note: input.note ?? '',
      sort: input.sort ?? (items.length ? Math.max(...items.map((i) => i.sort)) + 1 : 0),
      created_at: now,
      updated_at: now
    }
    set({ tools: { groups: get().tools.groups, items: [...items, item] } })
    schedulePersist(get, 'tools')
    return item
  },
  updateToolItem: (id, patch) => {
    const tools = get().tools
    set({
      tools: {
        groups: tools.groups,
        items: tools.items.map((i) => (i.id === id ? { ...i, ...patch, updated_at: nowISO() } : i))
      }
    })
    schedulePersist(get, 'tools')
  },
  deleteToolItem: (id) => {
    const tools = get().tools
    set({ tools: { groups: tools.groups, items: tools.items.filter((i) => i.id !== id) } })
    schedulePersist(get, 'tools')
  },
  moveToolItem: (id, groupId) => {
    const tools = get().tools
    set({
      tools: {
        groups: tools.groups,
        items: tools.items.map((i) =>
          i.id === id ? { ...i, group_id: groupId, updated_at: nowISO() } : i
        )
      }
    })
    schedulePersist(get, 'tools')
  },
  addToolGroup: (name) => {
    const tools = get().tools
    const group: ToolGroup = {
      id: uid(),
      name,
      sort: tools.groups.length ? Math.max(...tools.groups.map((g) => g.sort)) + 1 : 0
    }
    set({ tools: { groups: [...tools.groups, group], items: tools.items } })
    schedulePersist(get, 'tools')
    return group
  },
  renameToolGroup: (id, name) => {
    const tools = get().tools
    set({
      tools: {
        groups: tools.groups.map((g) => (g.id === id ? { ...g, name } : g)),
        items: tools.items
      }
    })
    schedulePersist(get, 'tools')
  },
  deleteToolGroup: (id) => {
    const tools = get().tools
    set({
      tools: {
        groups: tools.groups.filter((g) => g.id !== id),
        items: tools.items.map((i) => (i.group_id === id ? { ...i, group_id: null } : i))
      }
    })
    schedulePersist(get, 'tools')
  },
  reorderToolGroups: (orderedIds) => {
    const tools = get().tools
    const orderMap = new Map(orderedIds.map((id, idx) => [id, idx]))
    set({
      tools: {
        groups: tools.groups.map((g) => ({ ...g, sort: orderMap.get(g.id) ?? g.sort })),
        items: tools.items
      }
    })
    schedulePersist(get, 'tools')
  },

  // ---------- 词汇库（标签 / 节点类型） ----------
  addTag: (name) => {
    const vocab = get().vocab
    const trimmed = name.trim()
    if (vocab.tags.some((t) => t.name === trimmed)) return vocab.tags.find((t) => t.name === trimmed)!
    const tag: TagDef = { id: uid(), name: trimmed }
    set({ vocab: { ...vocab, tags: [...vocab.tags, tag] } })
    schedulePersist(get, 'vocab')
    return tag
  },
  renameTag: (id, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const vocab = get().vocab
    const old = vocab.tags.find((t) => t.id === id)
    if (!old || old.name === trimmed) return
    set({ vocab: { ...vocab, tags: vocab.tags.map((t) => (t.id === id ? { ...t, name: trimmed } : t)) } })
    schedulePersist(get, 'vocab')
    // 级联：同步更新任务与灵感中引用的该标签
    const replace = (tags: string[]): string[] => tags.map((n) => (n === old.name ? trimmed : n))
    mutateArray(get, set, 'tasks', (arr) =>
      arr.map((t) => (t.tags.includes(old.name) ? { ...t, tags: replace(t.tags), updated_at: nowISO() } : t))
    )
    mutateArray(get, set, 'ideas', (arr) =>
      arr.map((i) => (i.tags.includes(old.name) ? { ...i, tags: replace(i.tags), updated_at: nowISO() } : i))
    )
  },
  deleteTag: (id) => {
    const vocab = get().vocab
    set({ vocab: { ...vocab, tags: vocab.tags.filter((t) => t.id !== id) } })
    schedulePersist(get, 'vocab')
    // 不级联清理数据中的既有标签（自由文本标签仍然有效），仅从词库移除
  },
  addMilestoneType: (name) => {
    const vocab = get().vocab
    const trimmed = name.trim()
    const existing = vocab.milestoneTypes.find((t) => t.name === trimmed)
    if (existing) return existing
    const def: MilestoneTypeDef = { id: uid(), name: trimmed, builtin: false }
    set({ vocab: { ...vocab, milestoneTypes: [...vocab.milestoneTypes, def] } })
    schedulePersist(get, 'vocab')
    return def
  },
  renameMilestoneType: (id, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const vocab = get().vocab
    const old = vocab.milestoneTypes.find((t) => t.id === id)
    if (!old || old.name === trimmed) return
    set({
      vocab: {
        ...vocab,
        milestoneTypes: vocab.milestoneTypes.map((t) => (t.id === id ? { ...t, name: trimmed } : t))
      }
    })
    schedulePersist(get, 'vocab')
    // id 不变，展示名随词汇库解析，无需级联
  },
  deleteMilestoneType: (id) => {
    const def = get().vocab.milestoneTypes.find((t) => t.id === id)
    if (!def || def.builtin) return
    const vocab = get().vocab
    set({ vocab: { ...vocab, milestoneTypes: vocab.milestoneTypes.filter((t) => t.id !== id) } })
    schedulePersist(get, 'vocab')
    // 引用该类型的节点回退为「其他」
    mutateArray(get, set, 'milestones', (arr) =>
      arr.map((m) => (m.type === id ? { ...m, type: 'other', updated_at: nowISO() } : m))
    )
  },

  // ---------- 论文（V2） ----------
  addPaper: (input) => {
    const now = nowISO()
    const paper: Paper = {
      id: uid(),
      title: input.title,
      venue: input.venue ?? '',
      type: input.type ?? 'conference',
      status: input.status ?? 'idea',
      round: input.round ?? 0,
      dates: input.dates ?? { draft: null, submission: null, result: null, camera_ready: null },
      repo_url: input.repo_url ?? '',
      project_id: input.project_id ?? null,
      collaborators: input.collaborators ?? '',
      note: input.note ?? '',
      sections: input.sections ?? [],
      created_at: now,
      updated_at: now
    }
    mutateArray(get, set, 'papers', (arr) => [...arr, paper])
    syncPaperMilestones(get, set, paper)
    return paper
  },
  updatePaper: (id, patch) => {
    const prev = get().papers.find((p) => p.id === id)
    if (!prev) return
    const next: Paper = { ...prev, ...patch, updated_at: nowISO() }
    // 投稿轮次：大修/小修/拒稿后再次投稿 → 轮次 +1；首次投稿 → 1
    if (patch.status === 'submitted' && prev.status !== 'submitted') {
      next.round = ['major_revision', 'minor_revision', 'rejected'].includes(prev.status)
        ? prev.round + 1
        : Math.max(1, prev.round)
    }
    mutateArray(get, set, 'papers', (arr) => arr.map((p) => (p.id === id ? next : p)))
    syncPaperMilestones(get, set, next)
    // 录用 → 自动进入成果台账草稿项
    if (patch.status === 'accepted' && prev.status !== 'accepted') {
      const exists = get().achievements.find(
        (a) => a.type === 'paper' && a.title === next.title && a.is_draft
      )
      if (!exists) {
        const now = nowISO()
        const achievement: Achievement = {
          id: uid(),
          type: 'paper',
          title: next.title,
          date: todayStr(),
          level: '',
          project_id: next.project_id,
          detail: next.venue ? `发表于 ${next.venue}` : '',
          evidence_path: '',
          is_draft: true,
          created_at: now,
          updated_at: now
        }
        mutateArray(get, set, 'achievements', (arr) => [...arr, achievement])
      }
    }
  },
  deletePaper: (id) => {
    const paper = get().papers.find((p) => p.id === id)
    mutateArray(get, set, 'papers', (arr) => arr.filter((p) => p.id !== id))
    if (paper) {
      // 清理论文自动生成的节点（章节关联任务保留，由用户自行处理）
      mutateArray(get, set, 'milestones', (arr) => arr.filter((m) => m.source_paper_id !== id))
    }
  },
  addPaperSection: (paperId, title, createTask) => {
    const paper = get().papers.find((p) => p.id === paperId)
    if (!paper) return
    let taskId: string | null = null
    if (createTask) {
      const task = get().addTask({
        title: `${paper.title}：${title}`,
        project_id: paper.project_id
      })
      taskId = task.id
    }
    const section: PaperSection = { id: uid(), title, task_id: taskId, done: false }
    mutateArray(get, set, 'papers', (arr) =>
      arr.map((p) =>
        p.id === paperId ? { ...p, sections: [...p.sections, section], updated_at: nowISO() } : p
      )
    )
  },
  renamePaperSection: (paperId, sectionId, title) => {
    mutateArray(get, set, 'papers', (arr) =>
      arr.map((p) =>
        p.id === paperId
          ? {
              ...p,
              updated_at: nowISO(),
              sections: p.sections.map((s) => (s.id === sectionId ? { ...s, title } : s))
            }
          : p
      )
    )
  },
  togglePaperSection: (paperId, sectionId, done) => {
    const paper = get().papers.find((p) => p.id === paperId)
    const section = paper?.sections.find((s) => s.id === sectionId)
    if (!paper || !section) return
    mutateArray(get, set, 'papers', (arr) =>
      arr.map((p) =>
        p.id === paperId
          ? {
              ...p,
              updated_at: nowISO(),
              sections: p.sections.map((s) => (s.id === sectionId ? { ...s, done } : s))
            }
          : p
      )
    )
    // 双向同步：章节勾选 → 关联任务状态
    if (section.task_id) {
      get().updateTask(section.task_id, { status: done ? 'done' : 'todo' })
    }
  },
  deletePaperSection: (paperId, sectionId) => {
    mutateArray(get, set, 'papers', (arr) =>
      arr.map((p) =>
        p.id === paperId
          ? { ...p, updated_at: nowISO(), sections: p.sections.filter((s) => s.id !== sectionId) }
          : p
      )
    )
  },
  linkPaperSectionTask: (paperId, sectionId, taskId) => {
    mutateArray(get, set, 'papers', (arr) =>
      arr.map((p) =>
        p.id === paperId
          ? {
              ...p,
              updated_at: nowISO(),
              sections: p.sections.map((s) =>
                s.id === sectionId
                  ? { ...s, task_id: taskId, done: taskId ? s.done : false }
                  : s
              )
            }
          : p
      )
    )
  },

  // ---------- 成果台账（V2） ----------
  addAchievement: (input) => {
    const now = nowISO()
    const achievement: Achievement = {
      id: uid(),
      type: input.type ?? 'other',
      title: input.title,
      date: input.date ?? todayStr(),
      level: input.level ?? '',
      project_id: input.project_id ?? null,
      detail: input.detail ?? '',
      evidence_path: input.evidence_path ?? '',
      is_draft: input.is_draft ?? false,
      created_at: now,
      updated_at: now
    }
    mutateArray(get, set, 'achievements', (arr) => [...arr, achievement])
    return achievement
  },
  updateAchievement: (id, patch) => {
    mutateArray(get, set, 'achievements', (arr) =>
      arr.map((a) => (a.id === id ? { ...a, ...patch, updated_at: nowISO() } : a))
    )
  },
  deleteAchievement: (id) => {
    mutateArray(get, set, 'achievements', (arr) => arr.filter((a) => a.id !== id))
  },

  // ---------- 汇报（V2） ----------
  saveReport: (report) => {
    const existing = get().reports.find((r) => r.id === report.id)
    if (existing) {
      mutateArray(get, set, 'reports', (arr) =>
        arr.map((r) =>
          r.id === report.id ? { ...report, updated_at: nowISO(), generated_at: r.generated_at } : r
        )
      )
    } else {
      mutateArray(get, set, 'reports', (arr) => [report, ...arr])
    }
  },
  deleteReport: (id) => {
    mutateArray(get, set, 'reports', (arr) => arr.filter((r) => r.id !== id))
  }
}))

/** 论文重要日期 ↔ 时间节点自动同步（幂等）：有日期则建/改，无日期则删 */
function syncPaperMilestones(
  get: () => AppState,
  set: (partial: Partial<AppState>) => void,
  paper: Paper
): void {
  const kinds = Object.keys(PAPER_DATE_LABELS) as Array<keyof Paper['dates']>
  const typeOf: Record<keyof Paper['dates'], Milestone['type']> = {
    draft: 'other',
    submission: 'submission',
    result: 'other',
    camera_ready: 'other'
  }
  let milestones = [...get().milestones]
  let changed = false
  for (const kind of kinds) {
    const date = paper.dates[kind]
    const existing = milestones.find((m) => m.source_paper_id === paper.id && m.source_kind === kind)
    if (date) {
      const title = `${paper.title}（${PAPER_DATE_LABELS[kind]}）`
      if (existing) {
        if (existing.date !== date || existing.title !== title) {
          milestones = milestones.map((m) =>
            m.id === existing.id ? { ...m, date, title, updated_at: nowISO() } : m
          )
          changed = true
        }
      } else {
        const now = nowISO()
        milestones.push({
          id: uid(),
          title,
          date,
          type: typeOf[kind],
          project_id: paper.project_id,
          remind_days: [7, 3, 1],
          note: '由论文投稿跟踪自动生成',
          status: 'pending',
          source_paper_id: paper.id,
          source_kind: kind,
          created_at: now,
          updated_at: now
        })
        changed = true
      }
    } else if (existing) {
      milestones = milestones.filter((m) => m.id !== existing.id)
      changed = true
    }
  }
  if (changed) {
    set({ milestones })
    schedulePersist(get, 'milestones')
  }
}

/** 空集合（用于外部数据替换） */
export const EMPTY_COLLECTIONS: AllCollections = {
  projects: [],
  tasks: [],
  milestones: [],
  ideas: [],
  logs: [],
  tools: { groups: [], items: [] },
  vocab: { tags: [], milestoneTypes: BUILTIN_MILESTONE_TYPES },
  papers: [],
  achievements: [],
  reports: []
}
