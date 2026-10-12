// 写作 session 收尾弹窗（V2.6 5.5）：mode=end 正常结束（录字数/关联/备注）/ backfill=异常残留补记
// 时长由起止时间派生不落盘；>4 小时黄字提醒「时长较长，请确认是否忘记停止」，起止时间均可微调
import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import type { Paper } from '@shared/types'
import { dayjs } from '@/lib/date'
import {
  ensureAfterStart,
  formatDuration,
  overForgetGuard,
  residualDefaultEnd,
  sessionDurationMs
} from '@/lib/writing'
import { useStore } from '@/store'
import { useTimerStore } from '@/timerStore'
import { Button, ConfirmDialog, Field, Input, Modal, Select, Textarea } from '@/components/ui'

/** ISO → datetime-local 输入值（本地时区，秒级精度：极短 session 起止才可分辨） */
const toInput = (iso: string): string => dayjs(iso).format('YYYY-MM-DDTHH:mm:ss')
/** datetime-local 输入值 → ISO（dayjs 按本地时区解析） */
const fromInput = (v: string): string => dayjs(v).toISOString()

export default function WritingSessionModal() {
  const sessions = useStore((s) => s.sessions)
  const projects = useStore((s) => s.projects)
  const papers = useStore((s) => s.papers)
  const updateWritingSession = useStore((s) => s.updateWritingSession)
  const deleteWritingSession = useStore((s) => s.deleteWritingSession)
  const target = useTimerStore((s) => s.finishTarget)
  const stop = useTimerStore((s) => s.stop)
  const closeFinish = useTimerStore((s) => s.closeFinish)

  const [startInput, setStartInput] = useState('')
  const [endInput, setEndInput] = useState('')
  const [words, setWords] = useState('')
  const [projectId, setProjectId] = useState('')
  const [paperId, setPaperId] = useState('')
  const [section, setSection] = useState('')
  const [note, setNote] = useState('')
  const [discardAsk, setDiscardAsk] = useState(false)

  const record = target ? sessions.find((s) => s.id === target.sessionId) : undefined

  // 打开时初始化：backfill 默认结束=开始+4h（PRD 5.5.3），end 默认结束=当前时刻
  useEffect(() => {
    if (!target) return
    const s = useStore.getState().sessions.find((x) => x.id === target.sessionId)
    if (!s) return
    const started = s.started_at
    setStartInput(toInput(started))
    const endDefault =
      target.mode === 'backfill' ? residualDefaultEnd(started) : new Date().toISOString()
    setEndInput(toInput(ensureAfterStart(endDefault, started)))
    setWords(s.words === null ? '' : String(s.words))
    setProjectId(s.project_id ?? '')
    setPaperId(s.paper_id ?? '')
    setSection(s.section)
    setNote(s.note)
    setDiscardAsk(false)
  }, [target])

  if (!target || !record) return null
  const isBackfill = target.mode === 'backfill'

  const startIso = startInput !== '' ? fromInput(startInput) : ''
  const endIso = endInput !== '' ? fromInput(endInput) : ''
  const timeValid =
    startInput !== '' && endInput !== '' && !Number.isNaN(Date.parse(startIso)) && Date.parse(endIso) > Date.parse(startIso)
  const durationMs = timeValid ? sessionDurationMs(startIso, endIso) : 0

  const paperOptions: Paper[] = papers.filter((p) => projectId === '' || p.project_id === projectId)

  const save = (): void => {
    if (!timeValid) return
    // Number('1e999') = Infinity：非有限值按未录入处理，避免界面显示「Infinity 字」而落盘变 null 的不一致
    const wordsNum = Number(words)
    updateWritingSession(target.sessionId, {
      started_at: startIso,
      ended_at: endIso,
      words:
        words.trim() === '' || !Number.isFinite(wordsNum) ? null : Math.max(0, Math.round(wordsNum)),
      project_id: projectId || null,
      paper_id: paperId || null,
      section: section.trim(),
      note: note.trim()
    })
    if (!isBackfill) stop()
    closeFinish()
  }

  const discard = (): void => {
    deleteWritingSession(target.sessionId)
    setDiscardAsk(false)
    closeFinish()
  }

  return (
    <>
      <Modal
        open
        onClose={closeFinish}
        title={isBackfill ? '补记写作记录' : '结束写作计时'}
        width="max-w-md"
      >
        <div className="flex flex-col gap-3.5">
          {isBackfill && (
            <div className="rounded-lg bg-warn-soft/60 px-2.5 py-2 text-[11.5px] leading-relaxed text-warn">
              检测到上次未正常结束的计时（应用异常退出或跨设备同步残留），请补记或放弃。
            </div>
          )}
          <div className="flex items-center justify-between rounded-lg bg-surface-2/60 px-3 py-2.5">
            <span className="text-[12.5px] text-text-2">本次时长</span>
            <span className="text-[15px] font-bold tabular-nums">{formatDuration(durationMs)}</span>
          </div>
          {overForgetGuard(durationMs) && (
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-warn">
              <TriangleAlert size={14} /> 时长较长，请确认是否忘记停止
            </div>
          )}
          <div className="flex gap-3">
            <Field label="开始时间">
              <Input type="datetime-local" step={1} value={startInput} onChange={(e) => setStartInput(e.target.value)} />
            </Field>
            <Field label="结束时间">
              <Input type="datetime-local" step={1} value={endInput} onChange={(e) => setEndInput(e.target.value)} />
            </Field>
          </div>
          {!timeValid && startInput !== '' && endInput !== '' && (
            <div className="text-[11.5px] text-danger">结束时间需晚于开始时间</div>
          )}
          <div className="flex gap-3">
            <Field label="本次字数" hint="手录整数，可空">
              <Input
                type="number"
                min={0}
                value={words}
                onChange={(e) => setWords(e.target.value)}
                placeholder="如 1200"
              />
            </Field>
            <Field label="关联项目">
              <Select
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value)
                  if (e.target.value === '') return
                  const stillValid = papers.some((p) => p.id === paperId && p.project_id === e.target.value)
                  if (!stillValid) setPaperId('')
                }}
              >
                <option value="">不关联</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex gap-3">
            <Field label="关联论文">
              <Select value={paperId} onChange={(e) => setPaperId(e.target.value)}>
                <option value="">不关联</option>
                {paperOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="章节" hint="如「3.2 实验设计」，可空">
              <Input value={section} onChange={(e) => setSection(e.target.value)} />
            </Field>
          </div>
          <Field label="备注">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </Field>
          <div className="flex items-center justify-between gap-2 pt-1">
            {isBackfill ? (
              <Button variant="ghost" onClick={() => setDiscardAsk(true)}>
                放弃这条记录
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button onClick={closeFinish}>取消</Button>
              <Button variant="primary" disabled={!timeValid} onClick={save}>
                {isBackfill ? '保存补记' : '保存记录'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={discardAsk}
        title="放弃写作记录"
        message="删除这条未完成的写作记录？删除后不可恢复。"
        confirmText="删除"
        danger
        onConfirm={discard}
        onCancel={() => setDiscardAsk(false)}
      />
    </>
  )
}
