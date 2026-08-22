// 词汇库解析：节点类型展示名/图标、标签全集（词库 + 数据中实际出现的标签）
import { useMemo } from 'react'
import {
  FileText,
  FolderKanban,
  GraduationCap,
  MapPin,
  Medal,
  Presentation,
  SearchCheck,
  Send,
  Sparkles,
  Trophy,
  Award,
  type LucideIcon
} from 'lucide-react'
import { ACHIEVEMENT_TYPE_LABELS, MILESTONE_TYPE_LABELS } from '@shared/types'
import { useStore } from '@/store'

/** 内置类型专属图标；自定义类型统一用 Sparkles */
const BUILTIN_ICONS: Record<string, LucideIcon> = {
  proposal: FileText,
  submission: Send,
  conference: Presentation,
  midterm: SearchCheck,
  defense: GraduationCap,
  other: MapPin
}

const BUILTIN_ACHIEVEMENT_ICONS: Record<string, LucideIcon> = {
  paper: FileText,
  patent: Medal,
  award: Award,
  project: FolderKanban,
  other: Trophy
}

export function milestoneTypeIcon(type: string): LucideIcon {
  return BUILTIN_ICONS[type] ?? Sparkles
}

export function achievementTypeIcon(type: string): LucideIcon {
  return BUILTIN_ACHIEVEMENT_ICONS[type] ?? Sparkles
}

export function useMilestoneTypes(): Array<{ id: string; name: string; builtin: boolean }> {
  const vocab = useStore((s) => s.vocab)
  return vocab.milestoneTypes
}

export function useAchievementTypes(): Array<{ id: string; name: string; builtin: boolean }> {
  const vocab = useStore((s) => s.vocab)
  return vocab.achievementTypes
}

/** 日志模板（旧数据缺 logTemplates 字段时兜底为空数组，主进程加载时已补内置模板） */
export function useLogTemplates(): Array<{ id: string; name: string; builtin: boolean; content: string }> {
  return useStore((s) => s.vocab.logTemplates ?? [])
}

export function useMilestoneTypeLabel(): (type: string) => string {
  const types = useMilestoneTypes()
  return (type: string): string =>
    types.find((t) => t.id === type)?.name ?? MILESTONE_TYPE_LABELS[type] ?? type
}

export function useAchievementTypeLabel(): (type: string) => string {
  const types = useAchievementTypes()
  return (type: string): string =>
    types.find((t) => t.id === type)?.name ?? ACHIEVEMENT_TYPE_LABELS[type] ?? type
}

/** 标签全集：词库标签在前，数据中未入库的标签补充在后 */
export function useAllTags(): string[] {
  const vocab = useStore((s) => s.vocab)
  const tasks = useStore((s) => s.tasks)
  const ideas = useStore((s) => s.ideas)
  return useMemo(() => {
    const seen = new Set<string>()
    const result: string[] = []
    const push = (name: string): void => {
      if (name && !seen.has(name)) {
        seen.add(name)
        result.push(name)
      }
    }
    vocab.tags.forEach((t) => push(t.name))
    tasks.forEach((t) => t.tags.forEach(push))
    ideas.forEach((i) => i.tags.forEach(push))
    return result
  }, [vocab, tasks, ideas])
}
