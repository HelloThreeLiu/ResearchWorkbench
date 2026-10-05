// 全局错误边界：任何渲染异常不再卸载整棵 UI（白屏），而是给出可操作的恢复界面
import React from 'react'
import { Button } from '@/components/ui'

interface Props {
  children: React.ReactNode
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error): void {
    console.error('[ErrorBoundary] 界面渲染出错', error)
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-bg p-8 text-center">
        <div className="text-[15px] font-semibold text-text">界面渲染出错，数据未受影响</div>
        <pre className="max-w-2xl overflow-auto rounded-lg border border-border bg-surface-2 p-3 text-left text-[12px] text-text-2">
          {String(this.state.error?.message ?? this.state.error)}
        </pre>
        <div className="text-[12px] leading-relaxed text-text-3">
          所有数据保存在数据目录的 JSON 文件中，不受界面错误影响；
          <br />
          若反复出现，可打开数据目录检查对应文件，或从 backups/ 恢复。
        </div>
        <div className="mt-1 flex gap-2">
          <Button variant="primary" onClick={() => location.reload()}>
            重新加载
          </Button>
          <Button onClick={() => void window.api.openDataDir()}>打开数据目录</Button>
        </div>
      </div>
    )
  }
}
