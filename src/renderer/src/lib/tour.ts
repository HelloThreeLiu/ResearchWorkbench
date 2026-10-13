// 新手引导步骤定义（纯数据，零运行时依赖，Node 测试直接加载）
// 锚点约定：selector 对应目标元素上的 data-tour 属性值（Sidebar / WritingTimerButton 上标注）；
// 无 selector 的步骤渲染为居中卡片。全程停留「今日概览」页，不切换页面。
export interface TourStep {
  /** 步骤唯一 id */
  id: string
  /** 目标元素锚点（data-tour 属性值）；缺省 = 居中卡片步骤 */
  selector?: string
  title: string
  body: string
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: '几分钟认识格致',
    body: '接下来用几步带你看懂工作台的布局。随时可以点「跳过」，之后在设置里也能重新查看。'
  },
  {
    id: 'nav-workspace',
    selector: 'nav-workspace',
    title: '工作台 · 今日概览',
    body: '每天打开应用的落脚点：今天要做什么、写作了多久、临近的时间节点，一屏看完。'
  },
  {
    id: 'nav-research',
    selector: 'nav-research',
    title: '科研推进：日常主战场',
    body: '项目看板与任务、日历、时间节点倒计时、文献库、灵感、会议纪要与工具箱都在这一组，点击侧边栏任意入口即可进入。'
  },
  {
    id: 'nav-output',
    selector: 'nav-output',
    title: '成果与汇报',
    body: '论文投稿进度、成果台账、汇报中心（周报 / 月报一键生成）和阶段性回顾，把产出管起来。'
  },
  {
    id: 'writing-timer',
    selector: 'writing-timer',
    title: '写作计时',
    body: '开始写作时点这里计时，结束自动记入日志；忘了按也可以事后补记。'
  },
  {
    id: 'settings',
    selector: 'settings',
    title: '设置与灵感速记',
    body: '主题、数据目录、备份与更新都在设置里。另外，任何时候按全局快捷键（默认 Alt+N）都能唤出速记，随手记下灵感。'
  },
  {
    id: 'finish',
    title: '从这里开始',
    body: '建议先到「项目」建立第一个科研课题，把任务与时间节点挂上去。祝科研顺利！'
  }
]
