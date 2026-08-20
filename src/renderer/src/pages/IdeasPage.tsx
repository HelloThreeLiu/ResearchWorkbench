// 灵感页：全部灵感按时间倒序；标签/全文搜索/项目筛选；一键转任务
import { useMemo, useState } from 'react'
import { Check, Lightbulb, ListPlus, Search, Trash2 } from 'lucide-react'
import type { Idea, IdeaStatus } from '@shared/types'
import { IDEA_STATUS_LABELS } from '@shared/types'
import { useStore } from '@/store'
import { useNav } from '@/nav'
import { useAllTags } from '@/hooks/useVocab'
import { Badge, Button, EmptyState, Input, Select } from '@/components/ui'

import { friendlyDateTime } from '@/lib/date'

const STATUS_COLORS: Record<IdeaStatus, 'yellow' | 'blue' | 'green'> = {
  new: 'yellow',
  organized: 'blue',
  converted: 'green'
}

export default function IdeasPage() {
  const ideas = useStore((s) => s.ideas)
  const projects = useStore((s) => s.projects)
  const addTask = useStore((s) => s.addTask)
  const updateIdea = useStore((s) => s.updateIdea)
  const deleteIdea = useStore((s) => s.deleteIdea)
  const navigate = useNav((s) => s.navigate)
  const allTags = useAllTags()

  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | IdeaStatus>('all')
  const [filterProject, setFilterProject] = useState('all')
  const [filterTag, setFilterTag] = useState('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return ideas.filter((i) => {
      if (q && !i.content.toLowerCase().includes(q)) return false
      if (filterStatus !== 'all' && i.status !== filterStatus) return false
      if (filterProject === '__none__' ? i.project_id !== null : filterProject !== 'all' && i.project_id !== filterProject)
        return false
      if (filterTag !== 'all' && !i.tags.includes(filterTag)) return false
      return true
    })
  }, [ideas, search, filterStatus, filterProject, filterTag])

  const convert = (idea: Idea): void => {
    const firstLine = idea.content.split('\n')[0].slice(0, 80)
    const task = addTask({ title: firstLine, project_id: idea.project_id })
    updateIdea(idea.id, { status: 'converted', converted_task_id: task.id })
  }

  const startEdit = (idea: Idea): void => {
    setEditingId(idea.id)
    setEditContent(idea.content)
  }

  const saveEdit = (): void => {
    if (editingId !== null && editContent.trim()) {
      updateIdea(editingId, { content: editContent.trim() })
    }
    setEditingId(null)
  }

  return (
    <div className="px-4 py-5 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">灵感</h1>
        <span className="text-[12px] text-text-3">
          按 <kbd className="rounded border border-border bg-surface-2 px-1 font-mono">{useStore.getState().settings.hotkey}</kbd> 随手记录
        </span>
      </div>

      {/* 搜索与筛选 */}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2.5">
        <div className="relative min-w-52 flex-1">
          <Search size={13.5} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-3" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="全文搜索灵感内容…"
            className="pl-7.5"
          />
        </div>
        <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)} className="w-30">
          <option value="all">全部状态</option>
          {Object.entries(IDEA_STATUS_LABELS).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </Select>
        <Select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className="w-40">
          <option value="all">全部项目</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="__none__">仅未关联</option>
        </Select>
        <Select value={filterTag} onChange={(e) => setFilterTag(e.target.value)} className="w-30">
          <option value="all">全部标签</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              #{t}
            </option>
          ))}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Lightbulb size={30} />}
          title={ideas.length === 0 ? '还没有灵感记录' : '没有符合条件的灵感'}
          hint={ideas.length === 0 ? '读论文、开会、走路时冒出的想法，按快捷键随手记下来。' : '换个筛选条件试试。'}
        />
      ) : (
        <div className="mt-4 flex flex-col gap-2.5">
          {filtered.map((idea) => {
            const project = idea.project_id ? projectMap.get(idea.project_id) : undefined
            return (
              <div
                key={idea.id}
                className="group rounded-xl border border-border bg-surface p-3.5 transition-colors hover:border-accent/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {editingId === idea.id ? (
                      <div>
                        <Input value={editContent} onChange={(e) => setEditContent(e.target.value)} autoFocus />
                        <div className="mt-2 flex justify-end gap-2">
                          <Button size="sm" onClick={() => setEditingId(null)}>
                            取消
                          </Button>
                          <Button size="sm" variant="primary" onClick={saveEdit}>
                            保存
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="cursor-pointer whitespace-pre-wrap text-[13.5px] leading-relaxed"
                        onDoubleClick={() => startEdit(idea)}
                        title="双击编辑"
                      >
                        {idea.content}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {idea.status !== 'converted' && (
                      <Button size="sm" variant="soft" onClick={() => convert(idea)}>
                        <ListPlus size={12} /> 转为任务
                      </Button>
                    )}
                    {idea.status === 'new' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        title="标记为已整理"
                        onClick={() => updateIdea(idea.id, { status: 'organized' })}
                      >
                        <Check size={13} />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => deleteIdea(idea.id)}>
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-text-3">
                  <Badge color={STATUS_COLORS[idea.status]}>{IDEA_STATUS_LABELS[idea.status]}</Badge>
                  <span>{friendlyDateTime(idea.created_at)}</span>
                  {project && (
                    <button
                      className="flex items-center gap-1 hover:text-accent cursor-pointer"
                      onClick={() =>
                        project.status === 'active' &&
                        navigate({ name: 'project-detail', projectId: project.id, tab: 'overview' })
                      }
                    >
                      ·
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: project.color }} />
                      {project.name}
                    </button>
                  )}
                  {idea.tags.map((t) => (
                    <span key={t} className="rounded border border-border px-1 py-px">
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
