// 剪贴板工具：clipboard API 优先，file:// 环境降级 execCommand（此前在成果台账/汇报中心各有一份实现）
export async function copyText(text: string): Promise<void> {
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
