// 更新弹窗：检查结果 / 更新日志（GitHub Release 正文）/ 下载进度 / 重启安装
// 主题适配复用全局语义色类；日志渲染与 ProjectDetail 相同的 marked + DOMPurify 管线
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  Sparkles
} from 'lucide-react'
import { useUpdateStore } from '@/updateStore'
import { Badge, Button, Modal, ProgressBar } from '@/components/ui'

function renderMarkdown(content: string): string {
  return DOMPurify.sanitize(marked.parse(content, { async: false }) as string)
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 MB'
  const mb = n / (1024 * 1024)
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`
}

export default function UpdateModal() {
  const { modalOpen, stage, available, currentVersion, progress, errorMessage } = useUpdateStore()
  const closeModal = useUpdateStore((s) => s.closeModal)
  const beginDownload = useUpdateStore((s) => s.beginDownload)
  const installNow = useUpdateStore((s) => s.installNow)
  const openModalWithCheck = useUpdateStore((s) => s.openModalWithCheck)

  const openReleasePage = (): void => {
    if (available?.releaseUrl) void window.api.openExternal(available.releaseUrl)
  }

  return (
    <Modal open={modalOpen} onClose={closeModal} title="软件更新" width="max-w-lg">
      {stage === 'checking' && (
        <div className="flex flex-col items-center gap-3 py-8 text-text-3">
          <RefreshCw size={26} className="animate-spin" />
          <span className="text-[13px]">正在检查更新…</span>
        </div>
      )}

      {stage === 'unavailable' && (
        <div className="flex flex-col items-center gap-3 py-8 text-text-3">
          <CheckCircle2 size={26} className="text-success" />
          <span className="text-[13px] text-text-2">
            已是最新版本 <Badge color="green">V{currentVersion ?? '—'}</Badge>
          </span>
        </div>
      )}

      {stage === 'dev' && (
        <div className="flex flex-col items-center gap-3 py-8 text-text-3">
          <AlertCircle size={26} />
          <span className="text-[13px] text-text-2">开发模式下不支持检查更新</span>
          <span className="text-[11.5px]">请使用安装版应用检查 GitHub 上的新版本。</span>
        </div>
      )}

      {stage === 'available' && available && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <Sparkles size={17} className="text-accent" />
            <span className="text-[13.5px]">
              发现新版本{' '}
              <Badge color="blue">V{currentVersion ?? '—'}</Badge>
              <span className="mx-1 text-text-3">→</span>
              <Badge color="green">V{available.version}</Badge>
            </span>
          </div>
          <div>
            <div className="mb-1.5 text-[12.5px] font-medium text-text-2">更新日志</div>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-bg px-3.5 py-2.5">
              {available.notes ? (
                <div
                  className="md-body text-text-2"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(available.notes) }}
                />
              ) : (
                <span className="text-[12.5px] text-text-3">
                  暂无详细日志，可前往 Release 页面查看。
                </span>
              )}
            </div>
          </div>
          <p className="text-[11.5px] leading-relaxed text-text-3">
            确认更新后将下载安装包，完成后重启即自动安装到原有目录（数据不受影响，退出前会自动备份）。
          </p>
          <div className="flex justify-end gap-2">
            {available.releaseUrl && (
              <Button size="sm" onClick={openReleasePage}>
                <ExternalLink size={12.5} /> 前往 Release 页
              </Button>
            )}
            <Button size="sm" onClick={closeModal}>
              稍后再说
            </Button>
            <Button size="sm" variant="primary" onClick={() => void beginDownload()}>
              <Download size={12.5} /> 确认更新
            </Button>
          </div>
        </div>
      )}

      {stage === 'downloading' && (
        <div className="flex flex-col gap-3.5 py-2">
          <div className="flex items-center justify-between text-[12.5px] text-text-2">
            <span>正在下载 V{available?.version ?? ''} 安装包…</span>
            <span className="font-medium text-accent">{Math.floor(progress?.percent ?? 0)}%</span>
          </div>
          <ProgressBar value={progress?.percent ?? 0} />
          <div className="flex justify-between text-[11.5px] text-text-3">
            <span>
              {formatBytes(progress?.transferred ?? 0)} / {formatBytes(progress?.total ?? 0)}
            </span>
            <span>{formatBytes(progress?.bytesPerSecond ?? 0)}/s</span>
          </div>
          <p className="text-[11.5px] text-text-3">
            下载期间可以继续使用应用；关闭此窗口不会取消下载，完成后下次退出时会自动安装。
          </p>
        </div>
      )}

      {stage === 'downloaded' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={17} className="text-success" />
            <span className="text-[13.5px]">
              V{available?.version ?? ''} 已下载完成，重启后自动安装。
            </span>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={closeModal}>
              稍后安装（下次退出时自动装）
            </Button>
            <Button size="sm" variant="primary" onClick={() => void installNow()}>
              <RotateCcw size={12.5} /> 立即重启安装
            </Button>
          </div>
        </div>
      )}

      {stage === 'error' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2.5">
            <AlertCircle size={17} className="mt-0.5 text-danger" />
            <div className="flex flex-col gap-1">
              <span className="text-[13.5px]">检查或下载更新失败</span>
              <span className="break-all text-[11.5px] text-text-3">
                {errorMessage || '网络异常或无法访问 GitHub，请稍后重试。'}
              </span>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {available?.releaseUrl && (
              <Button size="sm" onClick={openReleasePage}>
                <ExternalLink size={12.5} /> 前往 Release 页手动下载
              </Button>
            )}
            <Button size="sm" variant="primary" onClick={() => void openModalWithCheck()}>
              <RefreshCw size={12.5} /> 重试
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
