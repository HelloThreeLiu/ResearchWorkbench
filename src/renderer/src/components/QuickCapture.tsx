// 灵感速记浮层：全局快捷键（默认 Alt+N）唤起；Ctrl+Enter 保存（不关闭，可连续录入），Esc 关闭
import { useEffect, useRef, useState } from 'react'
import { Check, Lightbulb } from 'lucide-react'
import { useStore } from '@/store'
import { cn } from '@/lib/utils'
import { todayStr } from '@/lib/date'

export default function QuickCapture({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [content, setContent] = useState('')
  const [projectId, setProjectId] = useState<string>('')
  const [tags, setTags] = useState('')
  const [flash, setFlash] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const projects = useStore((s) => s.projects)
  const addIdea = useStore((s) => s.addIdea)

  useEffect(() => {
    if (open) {
      setContent('')
      setTags('')
      // 延迟聚焦保证窗口前置后立即可输入
      setTimeout(() => textareaRef.current?.focus(), 30)
    }
  }, [open])

  if (!open) return null

  const save = (): void => {
    const trimmed = content.trim()
    if (!trimmed) return
    addIdea({
      content: trimmed,
      tags: tags
        .split(/[,，\s]+/)
        .map((t) => t.replace(/^#/, '').trim())
        .filter(Boolean),
      project_id: projectId || null
    })
    setContent('')
    setFlash(true)
    setTimeout(() => setFlash(false), 1200)
    setTimeout(() => textareaRef.current?.focus(), 10)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      save()
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/30 pt-[18vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="w-[560px] max-w-[90vw] rounded-2xl border border-border bg-surface p-4 shadow-2xl"
        onKeyDown={onKeyDown}
      >
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-text-2">
            <Lightbulb size={14} className="text-warn" />
            记一条灵感
          </div>
          <div className="flex items-center gap-2 text-[11px] text-text-3">
            {flash && (
              <span className="flex items-center gap-0.5 text-success">
                <Check size={11} /> 已保存 {todayStr()}
              </span>
            )}
            <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono">Ctrl+Enter</kbd>
            保存
            <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono">Esc</kbd>
            关闭
          </div>
        </div>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="想到什么写什么，支持多行；周末去灵感页统一整理…"
          rows={4}
          className="w-full resize-none rounded-xl border border-border bg-bg px-3 py-2.5 text-[13.5px] leading-relaxed text-text placeholder:text-text-3 focus:border-accent focus:outline-none"
        />
        <div className="mt-2.5 flex items-center gap-2">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="h-7.5 rounded-lg border border-border bg-surface px-1.5 text-[12px] text-text-2 cursor-pointer focus:border-accent focus:outline-none"
          >
            <option value="">不关联项目</option>
            {projects
              .filter((p) => p.status === 'active')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="标签（空格分隔，可留空）"
            className="h-7.5 flex-1 rounded-lg border border-border bg-surface px-2 text-[12px] text-text placeholder:text-text-3 focus:border-accent focus:outline-none"
          />
          <button
            onClick={save}
            disabled={!content.trim()}
            className={cn(
              'h-7.5 rounded-lg px-3 text-[12.5px] font-medium transition-colors cursor-pointer',
              content.trim()
                ? 'bg-accent text-white hover:opacity-90'
                : 'cursor-not-allowed bg-surface-2 text-text-3'
            )}
          >
            保存灵感
          </button>
        </div>
      </div>
    </div>
  )
}
