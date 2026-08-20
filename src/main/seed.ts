// 首次初始化数据目录时的预置数据：工具箱示例收藏（可编辑/删除，解决空状态）
import { uid, nowISO, type ToolFileData } from '@shared/types'

export function seedToolData(): ToolFileData {
  const now = nowISO()
  const literatureGroupId = 'group-literature'
  const schoolGroupId = 'group-school'
  const groups = [
    { id: literatureGroupId, name: '文献', sort: 0 },
    { id: schoolGroupId, name: '学校服务', sort: 1 }
  ]
  const items = [
    {
      id: uid(),
      name: 'Zotero 官网',
      type: 'url' as const,
      target: 'https://www.zotero.org/',
      group_id: literatureGroupId,
      note: '文献管理工具（本应用不内置文献管理，以此作为入口）',
      sort: 0,
      created_at: now,
      updated_at: now
    },
    {
      id: uid(),
      name: 'Google Scholar',
      type: 'url' as const,
      target: 'https://scholar.google.com/',
      group_id: literatureGroupId,
      note: '',
      sort: 1,
      created_at: now,
      updated_at: now
    },
    {
      id: uid(),
      name: 'arXiv',
      type: 'url' as const,
      target: 'https://arxiv.org/',
      group_id: literatureGroupId,
      note: '',
      sort: 2,
      created_at: now,
      updated_at: now
    },
    {
      id: uid(),
      name: '中国知网',
      type: 'url' as const,
      target: 'https://www.cnki.net/',
      group_id: literatureGroupId,
      note: '',
      sort: 3,
      created_at: now,
      updated_at: now
    },
    {
      id: uid(),
      name: '学校网络服务',
      type: 'url' as const,
      target: 'https://www.edu.cn/',
      group_id: schoolGroupId,
      note: '示例收藏：请编辑为你的学校 VPN / 信息门户入口',
      sort: 0,
      created_at: now,
      updated_at: now
    }
  ]
  return { groups, items }
}
