import { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { useNav } from '@/nav'
import { useUpdateStore } from '@/updateStore'
import Sidebar from '@/components/Sidebar'
import QuickCapture from '@/components/QuickCapture'
import UpdateModal from '@/components/UpdateModal'
import UpdateNotice from '@/components/UpdateNotice'
import Onboarding from '@/pages/Onboarding'
import Dashboard from '@/pages/Dashboard'
import ProjectsPage from '@/pages/ProjectsPage'
import ProjectDetail from '@/pages/ProjectDetail'
import TasksPage from '@/pages/TasksPage'
import CalendarPage from '@/pages/CalendarPage'
import MilestonesPage from '@/pages/MilestonesPage'
import IdeasPage from '@/pages/IdeasPage'
import ToolboxPage from '@/pages/ToolboxPage'
import PapersPage from '@/pages/PapersPage'
import AchievementsPage from '@/pages/AchievementsPage'
import ReportsPage from '@/pages/ReportsPage'
import InsightsPage from '@/pages/InsightsPage'
import SettingsPage from '@/pages/SettingsPage'

/** 主题：跟随系统或手动指定 */
function useThemeEffect(): void {
  const theme = useStore((s) => s.settings.theme)
  const styleTheme = useStore((s) => s.settings.styleTheme)
  useEffect(() => {
    // 界面风格主题（linear/claude/notion），与明暗正交，落在 <html data-style>
    document.documentElement.dataset.style = styleTheme ?? 'linear'
  }, [styleTheme])
  useEffect(() => {
    const apply = (): void => {
      const dark =
        theme === 'dark' ||
        (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', apply)
      return () => mq.removeEventListener('change', apply)
    }
  }, [theme])
}

/** 外部变更（另一设备经网盘写入）检测：窗口聚焦时 + 每 30 秒 */
function useExternalChangePolling(): void {
  const refreshExternal = useStore((s) => s.refreshExternal)
  const ready = useStore((s) => s.ready)
  useEffect(() => {
    if (!ready) return
    const onFocus = (): void => {
      refreshExternal()
    }
    window.addEventListener('focus', onFocus)
    const timer = setInterval(refreshExternal, 30_000)
    return () => {
      window.removeEventListener('focus', onFocus)
      clearInterval(timer)
    }
  }, [ready, refreshExternal])
}

export default function App() {
  const ready = useStore((s) => s.ready)
  const needsOnboarding = useStore((s) => s.needsOnboarding)
  const bootstrap = useStore((s) => s.bootstrap)
  const page = useNav((s) => s.page)
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false)

  useThemeEffect()
  useExternalChangePolling()

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  useEffect(() => {
    return window.api.onQuickCapture(() => setQuickCaptureOpen(true))
  }, [])

  // 应用更新：订阅主进程推送（启动静默检查/下载进度），并取一次当前版本号
  useEffect(() => {
    const unsubscribe = window.api.onUpdateEvent((event) =>
      useUpdateStore.getState().handleEvent(event)
    )
    void useUpdateStore.getState().hydrateVersion()
    return unsubscribe
  }, [])

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-bg text-text-3">
        正在启动格致…
      </div>
    )
  }

  if (needsOnboarding) {
    return <Onboarding />
  }

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">
        {page.name === 'dashboard' && <Dashboard />}
        {page.name === 'projects' && <ProjectsPage />}
        {page.name === 'project-detail' && (
          <ProjectDetail projectId={page.projectId} initialTab={page.tab} />
        )}
        {page.name === 'tasks' && <TasksPage />}
        {page.name === 'calendar' && <CalendarPage focusDate={page.focusDate} />}
        {page.name === 'milestones' && <MilestonesPage />}
        {page.name === 'ideas' && <IdeasPage />}
        {page.name === 'tools' && <ToolboxPage />}
        {page.name === 'papers' && <PapersPage />}
        {page.name === 'achievements' && <AchievementsPage />}
        {page.name === 'reports' && <ReportsPage />}
        {page.name === 'insights' && <InsightsPage />}
        {page.name === 'settings' && <SettingsPage />}
      </main>
      <QuickCapture open={quickCaptureOpen} onClose={() => setQuickCaptureOpen(false)} />
      <UpdateNotice />
      <UpdateModal />
    </div>
  )
}
