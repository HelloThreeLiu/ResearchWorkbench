// 论文新建/编辑弹窗：投稿信息 + 重要日期 + 写作章节清单（章节任务与任务系统双向联动）
import { useEffect, useRef, useState } from 'react'
import { Link2, Pencil, Plus, Trash2, Unlink } from 'lucide-react'
import type { Paper, PaperStatus, PaperType } from '@shared/types'
import { PAPER_DATE_LABELS, PAPER_STATUS_LABELS, PAPER_TYPE_LABELS } from '@shared/types'
import { useStore } from '@/store'
import { Button, CheckBox, Field, Input, Modal, Select, Textarea } from '@/components/ui'
import { cn } from '@/lib/utils'
import { countdownText, daysUntil } from '@/lib/date'

interface PaperEditModalProps {
  open: boolean
  onClose: () => void
  paper?: Paper
}

export default function PaperEditModal({ open, onClose, paper }: PaperEditModalProps) {
  const projects = useStore((s) => s.projects)
  const tasks = useStore((s) => s.tasks)
  const addPaper = useStore((s) => s.addPaper)
  const updatePaper = useStore((s) => s.updatePaper)
  const addPaperSection = useStore((s) => s.addPaperSection)
  const renamePaperSection = useStore((s) => s.renamePaperSection)
  const togglePaperSection = useStore((s) => s.togglePaperSection)
  const deletePaperSection = useStore((s) => s.deletePaperSection)
  const linkPaperSectionTask = useStore((s) => s.linkPaperSectionTask)

  const [title, setTitle] = useState('')
  const [venue, setVenue] = useState('')
  const [type, setType] = useState<PaperType>('conference')
  const [status, setStatus] = useState<PaperStatus>('idea')
  const [round, setRound] = useState(0)
  const [dates, setDates] = useState<Paper['dates']>({
    draft: null,
    submission: null,
    result: null,
    camera_ready: null
  })
  const [repoUrl, setRepoUrl] = useState('')
  const [projectId, setProjectId] = useState('')
  const [collaborators, setCollaborators] = useState('')
  const [note, setNote] = useState('')

  const [newSection, setNewSection] = useState('')
  const [createTaskWith, setCreateTaskWith] = useState(true)
  const [renamingSection, setRenamingSection] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const [linkingSection, setLinkingSection] = useState<string | null>(null)

  const defaultsRef = useRef(paper)
  defaultsRef.current = paper

  useEffect(() => {
    if (!open) return
    const p = defaultsRef.current
    setTitle(p?.title ?? '')
    setVenue(p?.venue ?? '')
    setType(p?.type ?? 'conference')
    setStatus(p?.status ?? 'idea')
    setRound(p?.round ?? 0)
    setDates(p?.dates ?? { draft: null, submission: null, result: null, camera_ready: null })
    setRepoUrl(p?.repo_url ?? '')
    setProjectId(p?.project_id ?? '')
    setCollaborators(p?.collaborators ?? '')
    setNote(p?.note ?? '')
    setNewSection('')
    setCreateTaskWith(true)
    setRenamingSection(null)
    setLinkingSection(null)
  }, [open])

  const setDate = (kind: keyof Paper['dates'], value: string): void => {
    setDates((d) => ({ ...d, [kind]: value || null }))
  }

  const submit = (): void => {
    const trimmed = title.trim()
    if (!trimmed) return
    const payload = {
      title: trimmed,
      venue: venue.trim(),
      type,
      status,
      round,
      dates,
      repo_url: repoUrl.trim(),
      project_id: projectId || null,
      collaborators: collaborators.trim(),
      note
    }
    if (paper) {
      updatePaper(paper.id, payload)
    } else {
      addPaper(payload)
    }
    onClose()
  }

  const currentPaper = paper // 章节清单仅编辑已有论文时可用（新建保存后再管理）
  const linkableTasks = tasks.filter((t) => t.status !== 'done' || t.project_id === (currentPaper?.project_id ?? null))

  return (
    <Modal open={open} onClose={onClose} title={paper ? '编辑论文' : '新建论文'} width="max-w-xl">
      <div className="flex flex-col gap-3.5">
        <Field label="标题（必填）">
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="论文标题"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="类型">
            <Select value={type} onChange={(e) => setType(e.target.value as PaperType)}>
              {Object.entries(PAPER_TYPE_LABELS).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="目标期刊/会议">
            <Input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="如 CVPR 2027" />
          </Field>
          <Field label="状态">
            <Select value={status} onChange={(e) => setStatus(e.target.value as PaperStatus)}>
              {Object.entries(PAPER_STATUS_LABELS).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="当前轮次">
            <Input
              type="number"
              min={0}
              value={round}
              onChange={(e) => setRound(Math.max(0, parseInt(e.target.value || '0', 10)))}
            />
          </Field>
        </div>
        <Field label="重要日期（保存后自动生成对应时间节点）">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {(Object.keys(PAPER_DATE_LABELS) as Array<keyof Paper['dates']>).map((kind) => (
              <label key={kind} className="flex flex-col gap-1">
                <span className="text-[11px] text-text-3">{PAPER_DATE_LABELS[kind]}</span>
                <Input
                  type="date"
                  value={dates[kind] ?? ''}
                  onChange={(e) => setDate(kind, e.target.value)}
                />
              </label>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="关联项目">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">无</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="代码仓库链接">
            <Input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/…" />
          </Field>
        </div>
        <Field label="协作人备注">
          <Input value={collaborators} onChange={(e) => setCollaborators(e.target.value)} placeholder="如：与师兄合著，负责实验部分" />
        </Field>
        <Field label="备注">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        {/* 写作章节清单（仅编辑模式） */}
        {currentPaper && (
          <div className="rounded-xl border border-border p-3.5">
            <div className="mb-2 text-[12.5px] font-medium text-text-2">
              写作章节清单
              <span className="ml-1.5 text-[11px] font-normal text-text-3">
                勾选与任务列表双向同步
              </span>
            </div>
            <div className="flex flex-col gap-1">
              {currentPaper.sections.length === 0 && (
                <div className="py-2 text-center text-[11.5px] text-text-3">
                  暂无章节，如：引言、相关工作、方法、实验、结论
                </div>
              )}
              {currentPaper.sections.map((sec) => {
                const linkedTask = sec.task_id ? tasks.find((t) => t.id === sec.task_id) : undefined
                return (
                  <div
                    key={sec.id}
                    className="group flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2/60"
                  >
                    <CheckBox
                      checked={sec.done}
                      onChange={(v) => togglePaperSection(currentPaper.id, sec.id, v)}
                      title={sec.done ? '标记未完成' : '标记完成（同步任务）'}
                    />
                    {renamingSection === sec.id ? (
                      <Input
                        autoFocus
                        value={renameText}
                        onChange={(e) => setRenameText(e.target.value)}
                        className="h-7 w-40"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && renameText.trim()) {
                            renamePaperSection(currentPaper.id, sec.id, renameText.trim())
                            setRenamingSection(null)
                          }
                        }}
                        onBlur={() => setRenamingSection(null)}
                      />
                    ) : (
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate text-[13px]',
                          sec.done && 'text-text-3 line-through'
                        )}
                        onDoubleClick={() => {
                          setRenamingSection(sec.id)
                          setRenameText(sec.title)
                        }}
                        title="双击重命名"
                      >
                        {sec.title}
                      </span>
                    )}
                    {linkedTask ? (
                      <span className="flex items-center gap-1 text-[10.5px] text-text-3">
                        <Link2 size={10} />
                        {linkedTask.status === 'done' ? '任务已完成' : '已同步任务'}
                      </span>
                    ) : linkingSection === sec.id ? (
                      <Select
                        autoFocus
                        className="h-7 w-44"
                        value=""
                        onChange={(e) => {
                          linkPaperSectionTask(currentPaper.id, sec.id, e.target.value || null)
                          setLinkingSection(null)
                        }}
                        onBlur={() => setLinkingSection(null)}
                      >
                        <option value="">选择要关联的任务…</option>
                        {linkableTasks.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title.slice(0, 30)}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <button
                        className="text-[10.5px] text-accent hover:underline cursor-pointer opacity-0 group-hover:opacity-100"
                        onClick={() => setLinkingSection(sec.id)}
                      >
                        关联任务
                      </button>
                    )}
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                      <button
                        title="重命名章节"
                        className="rounded p-1 text-text-3 hover:text-text cursor-pointer"
                        onClick={() => {
                          setRenamingSection(sec.id)
                          setRenameText(sec.title)
                        }}
                      >
                        <Pencil size={11.5} />
                      </button>
                      {sec.task_id && (
                        <button
                          title="取消任务关联（不删除任务）"
                          className="rounded p-1 text-text-3 hover:text-text cursor-pointer"
                          onClick={() => linkPaperSectionTask(currentPaper.id, sec.id, null)}
                        >
                          <Unlink size={11.5} />
                        </button>
                      )}
                      <button
                        title="删除章节（不删除关联任务）"
                        className="rounded p-1 text-text-3 hover:text-danger cursor-pointer"
                        onClick={() => deletePaperSection(currentPaper.id, sec.id)}
                      >
                        <Trash2 size={11.5} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Input
                value={newSection}
                onChange={(e) => setNewSection(e.target.value)}
                placeholder="新章节名称，如：实验部分"
                className="w-44"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newSection.trim()) {
                    addPaperSection(currentPaper.id, newSection.trim(), createTaskWith)
                    setNewSection('')
                  }
                }}
              />
              <label className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-text-3">
                <CheckBox
                  checked={createTaskWith}
                  onChange={setCreateTaskWith}
                  title="同步创建章节任务"
                />
                同步创建任务
              </label>
              <Button
                size="sm"
                variant="primary"
                disabled={!newSection.trim()}
                onClick={() => {
                  addPaperSection(currentPaper.id, newSection.trim(), createTaskWith)
                  setNewSection('')
                }}
              >
                <Plus size={12} /> 添加章节
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-[11px] text-text-3">
            {dates.submission && `距投稿 ${countdownText(daysUntil(dates.submission))} · `}
            日期变更将自动同步时间节点
          </span>
          <div className="flex gap-2">
            <Button onClick={onClose}>取消</Button>
            <Button variant="primary" onClick={submit} disabled={!title.trim()}>
              {paper ? '保存' : '创建'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
