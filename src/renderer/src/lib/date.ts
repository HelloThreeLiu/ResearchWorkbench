import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'

dayjs.locale('zh-cn')

export { dayjs }

/** YYYY-MM-DD */
export function todayStr(): string {
  return dayjs().format('YYYY-MM-DD')
}

/** 距今天数：今天返回 0，明天 1，昨天 -1（按自然日） */
export function daysUntil(dateStr: string): number {
  return dayjs(dateStr).startOf('day').diff(dayjs().startOf('day'), 'day')
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  return dayjs(dateStr).format('YYYY-MM-DD')
}

/** 人类友好日期：今年的日期省略年份；显示周几 */
export function friendlyDate(dateStr: string): string {
  const d = dayjs(dateStr)
  const now = dayjs()
  const sameYear = d.year() === now.year()
  const base = sameYear ? d.format('M月D日 dddd') : d.format('YYYY年M月D日')
  return base.replace('星期', '周')
}

export function friendlyDateTime(iso: string): string {
  const d = dayjs(iso)
  const now = dayjs()
  if (d.isSame(now, 'day')) return `今天 ${d.format('HH:mm')}`
  if (d.isSame(now.subtract(1, 'day'), 'day')) return `昨天 ${d.format('HH:mm')}`
  if (d.isSame(now.add(1, 'day'), 'day')) return `明天 ${d.format('HH:mm')}`
  const sameYear = d.year() === now.year()
  return sameYear ? d.format('M月D日 HH:mm') : d.format('YYYY年M月D日 HH:mm')
}

/** 倒计时文案：今天/明天/后天/N 天前(后) */
export function countdownText(days: number): string {
  if (days === 0) return '今天'
  if (days === 1) return '明天'
  if (days === 2) return '后天'
  if (days > 0) return `${days} 天后`
  if (days === -1) return '昨天'
  return `${-days} 天前`
}

export function isValidDateStr(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && dayjs(s, 'YYYY-MM-DD').isValid()
}

/** 本周一作为一周起点（zh-cn locale 下 startOf('week') 即周一） */
export function weekStart(date: string): string {
  return dayjs(date).startOf('week').format('YYYY-MM-DD')
}
