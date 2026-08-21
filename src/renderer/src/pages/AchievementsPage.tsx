// 成果台账：论文/专利/获奖/项目/其他（可自定义）成果的时间线视图；按类型筛选；一键复制纯文本
import { useMemo, useState } from 'react'
import { Copy, Pencil, Plus, Trash2, Trophy } from 'lucide-react'
import type { Achievement } from '@shared/types'
import { useStore } from '@/store'
import { useNav } from '@/nav'
import { achievementTypeIcon, useAchievementTypes, useAchievementTypeLabel } from '@/hooks/useVocab'
import {
  Badge,
  Button,
  Chip,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea
} from '@/components/ui'
import VocabManagerModal from '@/components/VocabManagerModal'
import { cn } from '@/lib/utils'
import { achievementsToPlainText } from '@/lib/report'
import { dayjs } from '@/lib/date'

export default function AchievementsPage() {
  const achievements = useStore((s) => s.achievements)
  const projects = useStore((s) => s.projects)
  const navigate = useNav((s) => s.navigate)
  const achievementTypes = useAchievementTypes()
  const typeLabel = useAchievementTypeLabel()

  const [filterType, setFilterType] = useState<string>('all')
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

  const typeCount = (typeId: string): number => achievements.filter((a) => a.type === typeId).length

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
    await copyText(achievementsToPlainText(achievements, projects, useStore.getState().vocab.achievementTypes))
    setCopyMsg(true)
    setTimeout(() => setCopyMsg(false), 2500)
  }

  return (
    <div className="page page-mid">
      <PageHeader
        title="成果台账"
        sub="论文录用后自动生成草稿项；专利、获奖、项目可手动登记 · 按年份归档，一键复制进简历"
        actions={
          <>
            <Button onClick={doCopy}>
              <Copy /> 复制为纯文本
            </Button>
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus /> 登记成果
            </Button>
          </>
        }
      />

      {/* 草稿提示条 */}
      {achievements.some((a) => a.is_draft) && (
        <div className="mt-4 rounded-lg border border-dashed border-accent/55 bg-accent-soft/50 px-3.5 py-2 text-[12.5px] text-accent">
          有 {achievements.filter((a) => a.is_draft).length} 项论文录用自动生成的草稿，点击编辑补全级别与证明材料后转正。
        </div>
      )}
      {copyMsg && (
        <div className="mt-2 text-[12px] text-success">
          已复制 {achievements.length} 项到剪贴板（可直接粘贴进简历/年终总结）
        </div>
      )}

      {/* 类型筛选 Chips */}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-2.5 py-2">
        <Chip active={filterType === 'all'} onClick={() => setFilterType('all')}>
          全部类型 <span className="text-[11px] opacity-75">{achievements.length}</span>
        </Chip>
        {achievementTypes.map((t) => (
          <Chip key={t.id} active={filterType === t.id} onClick={() => setFilterType(t.id)}>
            {t.name} <span className="text-[11px] opacity-75">{typeCount(t.id)}</span>
          </Chip>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Trophy />}
          title={achievements.length === 0 ? '还没有登记成果' : '没有该类型的成果'}
          hint={achievements.length === 0 ? '论文录用会自动生成草稿项；也可以手动登记获奖、专利等。' : '换个类型看看。'}
        />
      ) : (
        <div className="mt-5 ml-1.5 flex flex-col gap-6">
          {byYear.map(([year, list]) => (
            <section key={year} className="relative border-l-2 border-border pl-6">
              <div className="absolute top-0.5 -left-[6.5px] h-3 w-3 rounded-full border-[2.5px] border-bg bg-accent" />
              <h2 className="mb-2.5 text-[17px] font-bold">{year} 年</h2>
              <div className="flex flex-col gap-2.5">
                {list.map((a) => {
                  const Icon = achievementTypeIcon(a.type)
                  const project = a.project_id ? projectMap.get(a.project_id) : undefined
                  return (
                    <div
                      key={a.id}
                      className={cn(
                        'group flex flex-wrap items-start gap-3.5 rounded-xl border border-border bg-surface p-4',
                        a.is_draft && 'border-dashed opacity-90'
                      )}
                    >
                      {/* 类型图标 tile */}
                      <span className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent [&_svg]:h-4 [&_svg]:w-4 [&_svg]:stroke-2">
                        <Icon />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13.5px] font-semibold">{a.title}</span>
                          {a.is_draft && <Badge color="yellow">草稿</Badge>}
                          {a.level && <Badge color="purple">{a.level}</Badge>}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-text-3">
                          <span>{dayjs(a.date).format('M月D日')}</span>
                          <span>· {typeLabel(a.type)}</span>
                          {project && (
                            <button
                              className="flex items-center gap-1.5 hover:text-accent cursor-pointer"
                              onClick={() => navigate({ name: 'project-detail', projectId: project.id, tab: 'overview' })}
                            >
                              ·
                              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: project.color }} />
                              {project.name}
                            </button>
                          )}
                        </div>
                        {a.detail && <div className="mt-1.5 text-[12.5px] text-text-2">{a.detail}</div>}
                        {a.evidence_path && (
                          <button
                            className="mt-1 text-[11.5px] text-text-3 hover:text-accent cursor-pointer"
                            onClick={() => window.api.openPath(a.evidence_path)}
                            title="打开证明材料"
                          >
                            📎 {a.evidence_path}
                          </button>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <IconButton title="编辑" onClick={() => setEditTarget(a)}>
                          <Pencil />
                        </IconButton>
                        <IconButton
                          title="删除"
                          className="hover:bg-danger-soft hover:text-danger"
                          onClick={() => setDeleteTarget(a)}
                        >
                          <Trash2 />
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
  const achievementTypes = useAchievementTypes()
  const addAchievement = useStore((s) => s.addAchievement)
  const updateAchievement = useStore((s) => s.updateAchievement)

  const [type, setType] = useState<string>('paper')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [level, setLevel] = useState('')
  const [projectId, setProjectId] = useState('')
  const [detail, setDetail] = useState('')
  const [evidencePath, setEvidencePath] = useState('')
  const [vocabManageOpen, setVocabManageOpen] = useState(false)

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
            <Select
              value={type}
              onChange={(e) => {
                const v = e.target.value
                if (v === '__manage__') {
                  setVocabManageOpen(true)
                  return
                }
                setType(v)
              }}
            >
              {achievementTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              <option value="__manage__">⚙ 管理类型…</option>
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
      <VocabManagerModal
        open={vocabManageOpen}
        initialTab="achievementTypes"
        onClose={() => setVocabManageOpen(false)}
      />
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
