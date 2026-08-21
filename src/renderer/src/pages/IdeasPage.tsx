// 灵感页（V3 §5.8）：左缘状态色条卡片；搜索 + 状态 Chips + 项目/标签筛选；一键转任务
import { useMemo, useState } from 'react'
import { Check, Lightbulb, ListPlus, Search, Trash2 } from 'lucide-react'
import type { Idea, IdeaStatus } from '@shared/types'
import { IDEA_STATUS_LABELS } from '@shared/types'
import { useStore } from '@/store'
import { useNav } from '@/nav'
import { useAllTags } from '@/hooks/useVocab'
import {
  Badge,
  Button,
  Chip,
  ChipCount,
  EmptyState,
  FilterBar,
  IconButton,
  Input,
  PageHeader,
  Select,
  Tag
} from '@/components/ui'

import { friendlyDateTime } from '@/lib/date'

/** 状态 → 左缘色条颜色（待整理黄 / 已整理蓝 / 已转任务绿） */
const STATUS_BAR: Record<IdeaStatus, string> = {
  new: 'var(--color-warn)',
  organized: 'var(--color-accent)',
  converted: 'var(--color-success)'
}

const STATUS_BADGE: Record<IdeaStatus, 'yellow' | 'blue' | 'green'> = {
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

  const statusCount = (status: IdeaStatus): number =>
    ideas.filter((i) => i.status === status).length

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
    <div className="page page-mid">
      <PageHeader
        title="灵感"
        sub={
          <>
            读论文、开会、走路时冒出的想法，按 <kbd className="kbd">{useStore.getState().settings.hotkey}</kbd> 随手记，定期整理
          </>
        }
      />

      {/* 搜索 + 状态 Chips（流动区） ‖ 项目/标签（锚定区） */}
      <FilterBar
        filters={
          <>
            <Select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className="h-7 w-auto min-w-28 max-w-44 shrink-0 text-[12.5px]"
            >
              <option value="all">全部项目</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="__none__">仅未关联</option>
            </Select>
            <Select
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              className="h-7 w-auto min-w-24 max-w-36 shrink-0 text-[12.5px]"
            >
              <option value="all">全部标签</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  #{t}
                </option>
              ))}
            </Select>
          </>
        }
      >
        <div className="relative min-w-44 max-w-60 flex-1">
          <Search size={13} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-text-3" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="全文搜索灵感内容…"
            className="h-7 pl-7.5 text-[12.5px]"
          />
        </div>
        <span className="mx-0.5 h-4.5 w-px bg-border" />
        <Chip active={filterStatus === 'all'} onClick={() => setFilterStatus('all')}>
          全部 <ChipCount>{ideas.length}</ChipCount>
        </Chip>
        {(Object.keys(IDEA_STATUS_LABELS) as Array<IdeaStatus>).map((s) => (
          <Chip key={s} active={filterStatus === s} onClick={() => setFilterStatus(s)}>
            {IDEA_STATUS_LABELS[s]} <ChipCount>{statusCount(s)}</ChipCount>
          </Chip>
        ))}
      </FilterBar>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Lightbulb />}
          title={ideas.length === 0 ? '还没有灵感记录' : '没有符合条件的灵感'}
          hint={ideas.length === 0 ? '读论文、开会、走路时冒出的想法，按快捷键随手记下来。' : '换个筛选条件试试。'}
        />
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {filtered.map((idea) => {
            const project = idea.project_id ? projectMap.get(idea.project_id) : undefined
            return (
              <div
                key={idea.id}
                className="group rounded-xl border border-border border-l-[3px] bg-surface py-3.5 pr-4.5 pl-4 transition-colors hover:border-accent/50"
                style={{ borderLeftColor: STATUS_BAR[idea.status] }}
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
                        className="cursor-pointer whitespace-pre-wrap text-[13.5px] leading-[1.75]"
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
                        <ListPlus /> 转为任务
                      </Button>
                    )}
                    {idea.status === 'new' && (
                      <IconButton
                        title="标记为已整理"
                        onClick={() => updateIdea(idea.id, { status: 'organized' })}
                      >
                        <Check />
                      </IconButton>
                    )}
                    <IconButton
                      title="删除"
                      className="hover:bg-danger-soft hover:text-danger"
                      onClick={() => deleteIdea(idea.id)}
                    >
                      <Trash2 />
                    </IconButton>
                  </div>
                </div>
                {/* meta 行：状态 · 时间 · 项目 · 标签 */}
                <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-dashed border-border pt-2 text-[11.5px] text-text-3">
                  <Badge color={STATUS_BADGE[idea.status]}>{IDEA_STATUS_LABELS[idea.status]}</Badge>
                  <span>{friendlyDateTime(idea.created_at)}</span>
                  {project && (
                    <button
                      className="flex items-center gap-1.5 hover:text-accent cursor-pointer"
                      onClick={() =>
                        project.status === 'active' &&
                        navigate({ name: 'project-detail', projectId: project.id, tab: 'overview' })
                      }
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: project.color }} />
                      {project.name}
                    </button>
                  )}
                  {idea.tags.map((t) => (
                    <Tag key={t} label={t} />
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
