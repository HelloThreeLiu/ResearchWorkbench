// 剪贴板工具：clipboard API 优先，file:// 环境降级 execCommand（此前在成果台账/汇报中心各有一份实现）
// 返回是否成功：窗口失焦等场景两条路径都可能失败，调用方据此提示而不是无条件报「已复制」
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  }
}
