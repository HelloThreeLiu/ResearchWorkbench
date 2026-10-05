// vocab.json 结构判定（纯函数，供 store 加载与回归测试共用）
// 旧版本文件缺 achievementTypes / logTemplates 等后加字段属预期形态，
// 由加载层按 DEFAULT_VOCAB 兜底补齐，不算结构不合法；
// 只有「字段存在但不是数组」或「整体不是对象」才判为不合法。
export function vocabShapeValid(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false
  const v = raw as Record<string, unknown>
  const presentButNotArray = (x: unknown): boolean => x !== undefined && !Array.isArray(x)
  return (
    !presentButNotArray(v.tags) &&
    !presentButNotArray(v.milestoneTypes) &&
    !presentButNotArray(v.achievementTypes) &&
    !presentButNotArray(v.logTemplates)
  )
}
