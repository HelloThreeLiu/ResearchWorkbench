// 数据健康提示条：加载问题（解析失败/坏记录）与多设备写入冲突的醒目但不阻塞的展示
import { AlertTriangle, DatabaseZap, FolderOpen, X } from 'lucide-react'
import { useStore } from '@/store'

export default function DataHealthBanner(): React.ReactNode {
  const loadIssues = useStore((s) => s.loadIssues)
  const syncConflicts = useStore((s) => s.syncConflicts)
  const clearLoadIssues = useStore((s) => s.clearLoadIssues)
  const clearSyncConflicts = useStore((s) => s.clearSyncConflicts)

  if (loadIssues.length === 0 && syncConflicts.length === 0) return null

  return (
    <div className="sticky top-0 z-40 flex flex-col gap-1.5 border-b border-border bg-warn-soft/70 px-5 py-2.5 backdrop-blur">
      {loadIssues.map((issue, i) => (
        <div key={`issue-${i}`} className="flex items-start gap-2 text-[12px] leading-relaxed text-text">
          <DatabaseZap size={14} className="mt-0.5 shrink-0 text-warn" />
          <span>
            <strong className="font-semibold">{issue.collection}.json</strong>：{issue.detail}
          </span>
        </div>
      ))}
      {syncConflicts.map((msg, i) => (
        <div key={`conflict-${i}`} className="flex items-start gap-2 text-[12px] leading-relaxed text-text">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
          <span>{msg}</span>
        </div>
      ))}
      <div className="flex items-center justify-end gap-1.5">
        {syncConflicts.length > 0 && (
          <button
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] text-text-2 hover:bg-surface-2 hover:text-text cursor-pointer"
            onClick={() => {
              void window.api.openBackupDir()
            }}
          >
            <FolderOpen size={11.5} /> 打开备份目录
          </button>
        )}
        <button
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] text-text-3 hover:bg-surface-2 hover:text-text cursor-pointer"
          title="知道了（双方版本均已在数据目录的 backups/ 中留底）"
          onClick={() => {
            clearLoadIssues()
            clearSyncConflicts()
          }}
        >
          <X size={11.5} /> 知道了
        </button>
      </div>
    </div>
  )
}
