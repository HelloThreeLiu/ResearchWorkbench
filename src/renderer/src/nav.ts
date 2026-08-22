// 简单页面导航（桌面应用无需路由库）：页面名 + 参数 + 返回栈
import { create } from 'zustand'

export type Page =
  | { name: 'dashboard' }
  | { name: 'projects' }
  | { name: 'project-detail'; projectId: string; tab: ProjectTab }
  | { name: 'tasks' }
  | { name: 'calendar'; focusDate?: string }
  | { name: 'milestones' }
  | { name: 'ideas' }
  | { name: 'tools' }
  | { name: 'papers' }
  | { name: 'achievements' }
  | { name: 'reports' }
  | { name: 'insights' }
  | { name: 'settings' }

export type ProjectTab = 'overview' | 'tasks' | 'logs' | 'milestones'

interface NavState {
  page: Page
  history: Page[]
  navigate: (page: Page) => void
  goBack: () => void
}

export const useNav = create<NavState>((set, get) => ({
  page: { name: 'dashboard' },
  history: [],
  navigate: (page) => {
    const { page: current, history } = get()
    const same = JSON.stringify(current) === JSON.stringify(page)
    set({ page, history: same ? history : [...history, current].slice(-30) })
  },
  goBack: () => {
    const { history } = get()
    if (history.length === 0) {
      set({ page: { name: 'dashboard' } })
      return
    }
    const previous = history[history.length - 1]
    set({ page: previous, history: history.slice(0, -1) })
  }
}))
