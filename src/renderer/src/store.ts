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
  type ProgressLog,
  type Project,
  type Task,
  type ToolBookmark,
  type ToolFileData,
  type ToolGroup,
  nowISO,
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
function mutateArray<K extends 'projects' | 'tasks' | 'milestones' | 'ideas' | 'logs'>(
  get: () => AppState,
  set: (partial: Partial<AppState>) => void,
  name: K,
  updater: (arr: AppState[K]) => AppState[K]
): void {
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
    lastBackupDate: null
  },
  lastWriteAt: null,
  projects: [],
  tasks: [],
  milestones: [],
  ideas: [],
  logs: [],
  tools: { groups: [], items: [] },

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
    // 级联：清理下属任务/节点/日志/灵感的关联
    mutateArray(get, set, 'tasks', (arr) => arr.filter((t) => t.project_id !== id))
    mutateArray(get, set, 'milestones', (arr) => arr.filter((m) => m.project_id !== id))
    mutateArray(get, set, 'logs', (arr) => arr.filter((l) => l.project_id !== id))
    mutateArray(get, set, 'ideas', (arr) =>
      arr.map((i) => (i.project_id === id ? { ...i, project_id: null } : i))
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
  }
}))

/** 空集合（用于外部数据替换） */
export const EMPTY_COLLECTIONS: AllCollections = {
  projects: [],
  tasks: [],
  milestones: [],
  ideas: [],
  logs: [],
  tools: { groups: [], items: [] }
}
