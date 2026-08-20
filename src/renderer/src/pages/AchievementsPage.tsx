// 成果台账：论文/专利/获奖/项目/其他成果的时间线视图；按类型筛选；一键复制纯文本
import { useMemo, useState } from 'react'
import { Award, Copy, FileText, FolderKanban, Medal, Pencil, Plus, Trash2, Trophy } from 'lucide-react'
import type { Achievement, AchievementType } from '@shared/types'
import { ACHIEVEMENT_TYPE_LABELS } from '@shared/types'
import { useStore } from '@/store'
import { useNav } from '@/nav'
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  Select,
  Textarea
} from '@/components/ui'
import { cn } from '@/lib/utils'
import { achievementsToPlainText } from '@/lib/report'
import { dayjs } from '@/lib/date'

const TYPE_ICONS: Record<AchievementType, typeof Trophy> = {
  paper: FileText,
  patent: Medal,
  award: Award,
  project: FolderKanban,
  other: Trophy
}

export default function AchievementsPage() {
  const achievements = useStore((s) => s.achievements)
  const projects = useStore((s) => s.projects)
  const navigate = useNav((s) => s.navigate)

  const [filterType, setFilterType] = useState<'all' | AchievementType>('all')
  const [editTarget, setEditTarget] = useState<Achievement | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Achievement | null>(null)
  const [copyMsg, setCopyMsg] = useState(false)

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])

  const filtered = useMemo(
    () =>
      achievements
        .filter((a) => filterType === 'all' || a.type === filterType)
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [achievements, filterType]
  )

  // 按年份分组的时间线
  const byYear = useMemo(() => {
    const map = new Map<string, Achievement[]>()
    for (const a of filtered) {
      const y = dayjs(a.date).format('YYYY')
      const list = map.get(y) ?? []
      list.push(a)
      map.set(y, list)
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [filtered])

  const doCopy = async (): Promise<void> => {
    await copyText(achievementsToPlainText(achievements, projects))
    setCopyMsg(true)
    setTimeout(() => setCopyMsg(false), 2500)
  }

  return (
    <div className="px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">成果台账</h1>
          <p className="mt-0.5 text-[12px] text-text-3">
            论文录用后自动生成草稿项；也可手动登记专利、获奖、项目等成果。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={doCopy}>
            <Copy size={13.5} /> 复制为纯文本
          </Button>
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus size={14} /> 登记成果
          </Button>
        </div>
      </div>
      {copyMsg && <div className="mt-1.5 text-[12px] text-success">已复制 {achievements.length} 项到剪贴板（可直接粘贴进简历/年终总结）</div>}

      {/* 筛选 */}
      <div className="mt-4 flex items-center gap-2">
        <Select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as typeof filterType)}
          className="w-36"
        >
          <option value="all">全部类型（{achievements.length}）</option>
          {Object.entries(ACHIEVEMENT_TYPE_LABELS).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      {achievements.length > 0 && achievements.some((a) => a.is_draft) && (
        <div className="mt-3 rounded-lg border border-dashed border-accent/50 bg-accent-soft/40 px-3.5 py-2 text-[11.5px] text-accent">
          有 {achievements.filter((a) => a.is_draft).length} 项论文录用自动生成的草稿，点击编辑补全级别与证明材料后转正。
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Trophy size={30} />}
          title={achievements.length === 0 ? '还没有登记成果' : '没有该类型的成果'}
          hint={achievements.length === 0 ? '论文录用会自动生成草稿项；也可以手动登记获奖、专利等。' : '换个类型看看。'}
        />
      ) : (
        <div className="mt-4 flex flex-col gap-6">
          {byYear.map(([year, list]) => (
            <section key={year} className="relative ml-1 border-l-2 border-border pl-6">
              <div className="absolute -left-[9px] top-0 flex h-4 w-4 items-center justify-center rounded-full border-2 border-surface bg-accent-soft">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              </div>
              <h2 className="mb-2 text-[15px] font-semibold">{year} 年</h2>
              <div className="flex flex-col gap-2">
                {list.map((a) => {
                  const Icon = TYPE_ICONS[a.type]
                  const project = a.project_id ? projectMap.get(a.project_id) : undefined
                  return (
                    <div
                      key={a.id}
                      className={cn(
                        'group flex flex-wrap items-start gap-3 rounded-xl border border-border bg-surface p-3.5',
                        a.is_draft && 'border-dashed opacity-85'
                      )}
                    >
                      <Icon size={17} className="mt-0.5 shrink-0 text-accent" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13.5px] font-medium">{a.title}</span>
                          {a.is_draft && <Badge color="yellow">草稿</Badge>}
                          {a.level && <Badge color="purple">{a.level}</Badge>}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-text-3">
                          <span>{dayjs(a.date).format('M月D日')}</span>
                          <span>· {ACHIEVEMENT_TYPE_LABELS[a.type]}</span>
                          {project && (
                            <button
                              className="flex items-center gap-1 hover:text-accent cursor-pointer"
                              onClick={() => navigate({ name: 'project-detail', projectId: project.id, tab: 'overview' })}
                            >
                              ·
                              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: project.color }} />
                              {project.name}
                            </button>
                          )}
                        </div>
                        {a.detail && <div className="mt-1 text-[12px] text-text-2">{a.detail}</div>}
                        {a.evidence_path && (
                          <button
                            className="mt-0.5 text-[11px] text-text-3 hover:text-accent cursor-pointer"
                            onClick={() => window.api.openPath(a.evidence_path)}
                            title="打开证明材料"
                          >
                            📎 {a.evidence_path}
                          </button>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <IconButton title="编辑" onClick={() => setEditTarget(a)}>
                          <Pencil size={13} />
                        </IconButton>
                        <IconButton
                          title="删除"
                          className="hover:text-danger"
                          onClick={() => setDeleteTarget(a)}
                        >
                          <Trash2 size={13} />
                        </IconButton>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <AchievementEditModal
        open={createOpen || editTarget !== null}
        achievement={editTarget ?? undefined}
        onClose={() => {
          setCreateOpen(false)
          setEditTarget(null)
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除成果"
        message={`确定删除「${deleteTarget?.title}」吗？`}
        confirmText="删除"
        danger
        onConfirm={() => {
          if (deleteTarget) useStore.getState().deleteAchievement(deleteTarget.id)
          setDeleteTarget(null)
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

function AchievementEditModal({
  open,
  achievement,
  onClose
}: {
  open: boolean
  achievement?: Achievement
  onClose: () => void
}) {
  const projects = useStore((s) => s.projects)
  const addAchievement = useStore((s) => s.addAchievement)
  const updateAchievement = useStore((s) => s.updateAchievement)

  const [type, setType] = useState<AchievementType>('paper')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [level, setLevel] = useState('')
  const [projectId, setProjectId] = useState('')
  const [detail, setDetail] = useState('')
  const [evidencePath, setEvidencePath] = useState('')

  // 每次打开时按目标初始化
  const [lastOpen, setLastOpen] = useState(false)
  if (open && !lastOpen) {
    setLastOpen(true)
    setType(achievement?.type ?? 'paper')
    setTitle(achievement?.title ?? '')
    setDate(achievement?.date ?? dayjs().format('YYYY-MM-DD'))
    setLevel(achievement?.level ?? '')
    setProjectId(achievement?.project_id ?? '')
    setDetail(achievement?.detail ?? '')
    setEvidencePath(achievement?.evidence_path ?? '')
  }
  if (!open && lastOpen) setLastOpen(false)

  const submit = (): void => {
    const trimmed = title.trim()
    if (!trimmed) return
    const payload = {
      type,
      title: trimmed,
      date,
      level: level.trim(),
      project_id: projectId || null,
      detail,
      evidence_path: evidencePath,
      is_draft: false // 编辑保存即转正
    }
    if (achievement) {
      updateAchievement(achievement.id, payload)
    } else {
      addAchievement(payload)
    }
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={achievement ? '编辑成果' : '登记成果'} width="max-w-md">
      <div className="flex flex-col gap-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="类型">
            <Select value={type} onChange={(e) => setType(e.target.value as AchievementType)}>
              {Object.entries(ACHIEVEMENT_TYPE_LABELS).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="日期">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="名称（必填）">
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="成果名称" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="级别" hint="如 CCF-A / SCI 一区 / 校级">
            <Input value={level} onChange={(e) => setLevel(e.target.value)} />
          </Field>
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
        </div>
        <Field label="详情">
          <Textarea rows={2} value={detail} onChange={(e) => setDetail(e.target.value)} />
        </Field>
        <Field label="证明材料路径">
          <div className="flex gap-2">
            <Input
              value={evidencePath}
              onChange={(e) => setEvidencePath(e.target.value)}
              placeholder="证书/录用通知的文件路径"
            />
            <Button
              className="shrink-0"
              onClick={async () => {
                const picked = await window.api.pickPath('file')
                if (picked) setEvidencePath(picked)
              }}
            >
              浏览…
            </Button>
          </div>
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={submit} disabled={!title.trim()}>
            {achievement ? '保存（转为正式条目）' : '登记'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
}
