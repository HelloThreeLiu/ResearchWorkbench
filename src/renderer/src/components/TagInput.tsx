// 标签输入：chips + 输入联想（来自标签库与既有数据）；Enter/逗号提交，IME 组词中不拦截
import { useRef, useState } from 'react'
import { Settings2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  suggestions?: string[]
  placeholder?: string
  className?: string
  id?: string
  /** 提供时显示「管理标签库」入口 */
  onManage?: () => void
}

const DATALIST_ID = 'gezhi-tag-suggestions'

export default function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = '回车添加标签，可选可输',
  className,
  id,
  onManage
}: TagInputProps) {
  const [text, setText] = useState('')
  const composingRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = (raw: string): void => {
    const parts = raw
      .split(/[,，]/)
      .map((s) => s.replace(/^#/, '').trim())
      .filter(Boolean)
    if (parts.length === 0) return
    const next = [...value]
    for (const p of parts) {
      if (!next.includes(p)) next.push(p)
    }
    onChange(next)
    setText('')
  }

  const remove = (tag: string): void => {
    onChange(value.filter((t) => t !== tag))
  }

  return (
    <div
      className={cn(
        'flex min-h-8.5 flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1',
        'focus-within:border-accent',
        className
      )}
      onClick={() => inputRef.current?.focus()}
    >
      <datalist id={id ?? DATALIST_ID}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-1.5 py-0.5 text-[11.5px] font-medium text-accent"
        >
          #{tag}
          <button
            className="opacity-70 hover:opacity-100 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation()
              remove(tag)
            }}
            title={`移除标签 ${tag}`}
          >
            <X size={10.5} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={text}
        list={id ?? DATALIST_ID}
        onChange={(e) => setText(e.target.value)}
        onCompositionStart={() => (composingRef.current = true)}
        onCompositionEnd={(e) => {
          composingRef.current = false
          // 组词结束保留文本继续编辑，不强制提交
          void e
        }}
        onKeyDown={(e) => {
          if (composingRef.current) return
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            commit(text)
          } else if (e.key === 'Backspace' && text === '' && value.length > 0) {
            onChange(value.slice(0, -1))
          }
        }}
        onBlur={() => text.trim() && commit(text)}
        placeholder={value.length === 0 ? placeholder : ''}
        className="h-6 min-w-24 flex-1 bg-transparent text-[13px] text-text placeholder:text-text-3 focus:outline-none"
      />
      {onManage && (
        <button
          type="button"
          title="管理标签库"
          onClick={(e) => {
            e.stopPropagation()
            onManage()
          }}
          className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-md text-text-3 hover:bg-surface-2 hover:text-text cursor-pointer"
        >
          <Settings2 size={12} />
        </button>
      )}
    </div>
  )
}
