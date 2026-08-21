import { twMerge } from 'tailwind-merge'

/** 类名拼接 + Tailwind 冲突去重（后者覆盖前者，如 h-7 覆盖组件基类 h-8） */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return twMerge(classes.filter(Boolean).join(' '))
}
