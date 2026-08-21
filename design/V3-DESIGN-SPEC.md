# 格致 · 科研工作台 — V3 设计规范

> **状态**：现行版本（2026-08-22 起生效）
> **参考原型**：`design/prototypes/redesign-v3.html`（可交互：12 页面 × 3 主题 × 明暗 × 3 宽度）
> **适用范围**：`src/renderer/` 下全部页面与组件。**新增/修改任何 UI 必须遵循本规范**；规范未覆盖的场景按「就近类比 + 令牌优先」原则处理，并在 PR/提交说明中注明。

---

## 0. 设计原则

1. **令牌优先**：颜色、圆角、字体一律走 CSS 变量 token，**禁止硬编码色值与字号**（项目色 `project.color` 等数据色除外）。
2. **字号收敛**：全应用只用 §2.3 的 7 档字号，最小 11.5px，不得再出现 10 / 10.5 / 11px。
3. **8pt 栅格**：间距取 4 的倍数，节奏只用 8 / 12 / 16 / 20 / 24 / 26 / 30 几档。
4. **信息分层**：页面标题 → 区块标题 → 列表主文本 → 次级文本 → 辅助说明，字号逐级下降、颜色逐级变淡。
5. **语义色克制**：accent 只用于主操作/选中/链接；danger / warn / success 只用于状态语义，不做装饰。
6. **主题正交**：3 风格 × 明暗 = 6 套 token 全部适配；任何页面改动需在三套主题下目检。

---

## 1. 设计 Token

### 1.1 色彩（与 `styles.css` 完全一致，禁止新增）

| Token | 用途 |
|---|---|
| `--color-bg` | 应用画布 |
| `--color-surface` | 卡片/侧边栏/弹窗表面 |
| `--color-surface-2` | 次级表面：hover 底、输入底、图标 tile 底 |
| `--color-border` | 边框/分隔线（1px） |
| `--color-text` / `-2` / `-3` | 主文本 / 次级 / 辅助 |
| `--color-accent` / `-soft` | 主题强调色 / 强调软底（选中态、图标 tile、主按钮） |
| `--color-danger(-soft)` `--color-warn(-soft)` `--color-success` | 语义色（逾期/到期/完成等） |

例外：Badge `purple`（审稿中、成果级别）沿用既有定义，是唯一允许的固定色徽章。

### 1.2 圆角（关键：token 真正接入组件层）

| Token | linear | claude | notion | 用在哪 |
|---|---|---|---|---|
| `--radius-lg` | 8px | 10px | 6px | 按钮、输入框、导航项、图标 tile |
| `--radius-xl` | 12px | 14px | 10px | **所有卡片**、列表卡、日历网格、看板列 |
| `--radius-2xl` | 16px | 16px | 12px | 弹窗 |

Tailwind 的 `rounded-lg / rounded-xl / rounded-2xl` 已经 `@theme inline` 映射到上述运行时变量——**直接使用这三个类即为主题感知圆角**；`rounded-md`（徽章 6px）、`rounded-full`（圆点/胶囊）为静态值可用。

### 1.3 字体

- 正文：`"Segoe UI", "Microsoft YaHei", "PingFang SC", system-ui`（全局已设，勿重复声明）。
- 标题：`var(--font-display)`，`h1/h2/h3` 已全局生效——claude 主题自动衬线，其余与正文一致。**不要在标题上手写字体类**。
- 数字统计：加 `tabular-nums`（等宽数字对齐）。

### 1.4 图标（lucide-react）

| 场景 | 尺寸 | 描边 |
|---|---|---|
| 侧边栏导航 | 16 | 1.8（选中 2.1） |
| 页头按钮 / 行内操作 | 14 | 2 |
| 区块标题前置图标 | 15 | 2，色 accent |
| 统计卡 tile 内 | 18 | 2 |
| 空状态 | 22 | 1.6 |

### 1.5 阴影与动效

- 阴影只用于「悬停提升」（卡片 `-translate-y-0.5` + `shadow-md`）与弹窗（`shadow-xl`）；静止卡片**只有边框无阴影**。
- 过渡统一 `transition-colors`（0.13s 量级）；悬停位移只用 `-translate-y-0.5`。

---

## 2. 字号阶（7 档，铁律）

| 档 | 字号/字重 | Tailwind 写法 | 用途 |
|---|---|---|---|
| 页面标题 | 20 / 700 | `text-xl font-bold` | 每页唯一 H1 |
| 大数字 | 23 / 700 | `text-[23px] font-bold tabular-nums` | 统计卡数字 |
| 年份/Hero 数字 | 17–19 / 700 | `text-[17px] font-bold` | 成果年份、项目 Hero 指标 |
| 区块标题 | 15 / 600 | `text-[15px] font-semibold` | 卡片标题（紧凑卡用 14） |
| 列表主文本 | 14 / 500 | `text-sm font-medium` | 节点/论文/报告行标题 |
| **正文基准** | 13.5 | `text-[13.5px]` | 任务行、卡片正文（吸收原 13/14） |
| 次级文本 | 12.5 | `text-[12.5px]` | 副标题、说明、按钮文字 |
| 辅助说明 | 11.5 | `text-[11.5px]` | meta 行、时间戳（**最小字号**） |

`<body>` 基准 13.5px。日期/时间戳/计数一律 11.5px `text-text-3`。

---

## 3. 布局骨架

### 3.1 窗口结构

```
┌──────────┬──────────────────────────┐
│ Sidebar  │  main（.main 滚动容器）   │
│ 224px    │  └ .page（内容壳）        │
└──────────┴──────────────────────────┘
```

### 3.2 页面壳（styles.css 已内置类，直接用）

| 类 | 定义 | 适用 |
|---|---|---|
| `.page` | `padding: 26px 30px 48px` | **每个页面根元素** |
| `.page-mid` | `max-width:1080px; margin:auto` | 时间节点、灵感、论文、成果、汇报 |
| `.page-narrow` | `max-width:860px; margin:auto` | 设置 |

Dashboard / 项目 / 任务 / 日历 / 工具箱 / 项目详情用全宽 `.page`。

### 3.3 页头范式（必须用 `ui.tsx` 的 `<PageHeader>`）

```
左：H1（text-xl font-bold） + 可选副标题（12.5px text-3，1–2 行）
右：动作区（主按钮 primary + 次按钮 outline；只留 1 个 primary）
```

页头距下方内容 16px（`mt-4`）；副标题写「这一页做什么 + 怎么用」，不是字段说明。

### 3.4 栅格与断点

- Dashboard 主体：12 列网格，左 8（任务）/ 右 4（速览+节点+灵感）；`lg` 以下单列。
- 项目卡：`md:grid-cols-2 xl:grid-cols-3`（不超过 3 列）。
- 工具箱收藏卡：`grid-cols-[repeat(auto-fill,minmax(230px,1fr))]`。
- 报告生成入口：3 列；`md` 以下 1 列。
- 统计卡：恒 4 列（`grid-cols-2 xl:grid-cols-4`，窄屏 2×2）。

---

## 4. 通用组件规范（`ui.tsx`）

所有组件已按本规范实现，**页面里不得绕开组件手写等价物**。

### Button
`h-8 px-3.5 text-[13px] rounded-lg`（sm：`h-7 px-2.5 text-[12.5px]`）。变体：`primary`（accent 实底白字）/ `outline`（边框卡底）/ `ghost` / `soft`（accent-soft 底 accent 字）/ `danger`。图标 14px。

### IconButton
`h-7 w-7 rounded-lg text-text-3`；danger 场景加 `hover:bg-danger-soft hover:text-danger`。悬浮操作组：`opacity-0 group-hover:opacity-100`。

### Input / Select / Textarea
高 32px（`h-8`），`rounded-lg border-border bg-surface text-[13px]`，聚焦 `border-accent`。Select 用原生 + 全局箭头样式。

### Badge
`h-5 px-2 text-[11.5px] rounded-md`；色：gray / red / yellow / green / blue / purple。倒计时 badge 加高版：`h-6 text-xs`。

### TagChip（标签）
`border border-border rounded-[5px] px-1.5 h-[19px] text-[11px] text-text-2`，文案 `#标签名`。

### CheckBox
16px 方形 `rounded-[4.5px]`；选中 accent 实底白勾。

### DueChip（截止徽章）
`h-[22px] px-2 rounded-md text-[11.5px]` + 日历图标 11.5px；普通 `text-text-3`，今日到期 `bg-warn-soft text-warn font-semibold`，逾期 `bg-danger-soft text-danger font-semibold`。

### Card
`rounded-xl border border-border bg-surface`；内边距 **18/20**（`p-4.5 px-5`，紧凑卡 14/16）。卡片标题用 `.card-title` 结构：15px semibold + 15px accent 图标；卡头右侧放 `card-link`（12.5px text-3，hover accent）。

### ListCard（行式列表卡）
`rounded-xl border bg-surface overflow-hidden`，行 `px-4 py-3 border-b last:border-0 hover:bg-surface-2/50`。项目/论文/报告/节点列表统一用它。

### PageHeader / StatCard
- `StatCard`：40px 图标 tile（`rounded-lg bg-{soft} text-{色}`，色阶 default/warn/danger）+ 23px 数字 + 12.5 标签 + 11.5 提示；整卡可点击跳转。
- 图标 tile 通用：`flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent`。

### FilterBar + Chip（筛选工具条，V3.1 双区结构）
统一用 `<FilterBar>` 组件（`components/ui.tsx`），外壳 `rounded-xl border bg-surface px-2.5 py-2 flex flex-wrap items-center gap-x-2 gap-y-1.5`，内部分**两区**：
- **左区（流动区）**`flex min-w-0 flex-1 flex-wrap gap-1.5`：状态 **Chip 胶囊**（`h-7 px-2.5 rounded-full text-[12.5px]`，选中 `bg-accent-soft text-accent font-semibold`，计数 `text-[11px] opacity-75`）与搜索框。宽度不足时**只在 Chips 之间自然换行**——胶囊换行是可接受的视觉形态；
- **右区（锚定区）**`flex shrink-0 flex-wrap justify-end gap-2`：维度筛选（项目/标签/类型）紧凑 Select + 「清除筛选」文字按钮。**锚定工具条右端，永远不与 Chips 混排、永不孤行换行**；仅当窗口 < 最小宽（880）时筛选组作为整体换到下一行。
- **Select 必须同时给 `min-w-*`（下限）与 `max-w-*`（上限 ≤ `max-w-44`）**：原生 select 宽度跟随最长选项，无上限会被长项目名撑爆工具条；基类已带 `text-ellipsis` 超限省略；
- **日期/区间筛选优先做成预设下拉**（如任务的「截止：全部/已逾期/今天/未来 7 天/未来 30 天/自定义…」），仅选「自定义」时展开区间输入框，避免常驻两个 120px 日期框；
- ⚠️ 类名覆盖依赖 `cn()` 的 tailwind-merge 冲突去重（如 `h-7 w-auto` 覆盖基类 `h-8 w-full`）——**禁止绕过 `cn()` 手拼类名字符串**。

### Segmented（视图切换）
`inline-flex rounded-lg bg-surface-2 p-0.5`，项 `h-6.5 px-2.5 text-[12.5px]`，选中 `bg-surface font-semibold shadow-sm`。用于 列表/看板、月/周 等二态切换。

### Tabs（项目详情）
下划线式：`border-b border-border`，项 `px-3.5 py-2 text-[13px]` + 14px 图标，选中 `border-b-2 border-accent text-accent font-semibold`。

### Timeline（时间线）
`border-l-2 border-border ml-1.5 pl-6`，节点圆点 `h-2.5 w-2.5 rounded-full bg-accent border-[2.5px] border-bg`（用画布色描边制造断口）。成果按年份、日志按日期使用。

### EmptyState
52px 圆形图标位（`bg-surface-2 text-text-3`）+ 14px 600 标题 + 12.5 提示（≤2 行）+ 可选 CTA 按钮。文案口吻：「还没有 X / 换个条件试试 + 一句怎么做」。

### Modal / Kbd / Toggle
- Modal：`rounded-2xl`（主题感知）+ 标题 15px semibold + 内容 `px-5 py-4`；
- `.kbd`：全局类，展示快捷键（如 `Alt+S`）；
- 开关：`w-[38px] h-[21px] rounded-full`，开启 accent。

---

## 5. 页面级规范

### 5.1 今日概览（Dashboard）
- 页头：问候 + 日期（H1）；下行同步状态（圆点 success/灰 + 时间）。
- **4 张核心 StatCard**：待办任务 / 今日到期(warn) / 逾期(danger) / 30 天节点；**不放**第 5 张以上。
- 次级指标（本周完成、进展日志、进行中项目）并入右栏「本周速览」卡：上半 7 日柱状趋势（今日 accent 实心、有值 45% 透明、零值 border 色矮条），下半三列等宽数字。
- 左栏任务卡：逾期行整行 `bg-danger-soft/45`；行内见 TaskRow。

### 5.2 项目
- 卡片结构（`p-0 overflow-hidden`）：**3px 项目色顶条** → 16/18 内边距列（色点+名称 15px → 描述 2 行 12.5px → 任务比+进度条 → 底行：临近节点 chip（≤7 天 red / ≤30 天 yellow / 无则灰字）+ 开始日期）。
- 折叠区：fold-toggle（chevron + 13px 600 文字）。

### 5.3 项目详情
- 页头：返回钮 + 10px 色点 + H1 + 状态 Badge；副标题 = 描述 + 起止时间。
- 概览 Tab：**Hero 卡**（环形进度 SVG + 大号百分比 + 分隔线 + 5 项关键数字：完成比/逾期/待办节点/记录数/距最近节点）→ 双栏「最近进展 3 条 / 临近节点」。
- 任务 Tab：快速输入行 + `全部/未完成/已完成` chips + TaskRow 列表。
- 日志 Tab：「记一笔」卡（日期 + Textarea + Ctrl+Enter 提示）+ Timeline。
- 节点 Tab：同 5.4 行结构（日期块 + 标题 + 倒计时）。

### 5.4 时间节点
- 行结构：**52px 日期块**（上：星期 11px text-3；下：`M/D` 19px bold tabular；右缘分隔线）+ CheckBox + 标题（14px medium）+ meta（类型 · 项目色点 · 提醒规则）+ 倒计时 Badge（≤7 天 red、≤30 天 yellow、其余 gray，`h-6 text-xs`）+ 悬浮编辑。
- 筛选（FilterBar）：左区类型 Chips（带计数）‖ 右区项目 Select。

### 5.5 任务
- 页头动作区：Segmented（列表/看板）+ 新建任务 primary。
- 筛选（FilterBar）：左区状态 Chips（全部/未完成/待办/进行中/已完成，带计数）‖ 右区项目 Select + 标签 Select + 截止预设下拉（自定义时展开区间输入）+ 清除筛选。
- 分组头：色点 + 项目名（可点入）+ 计数 + （有逾期时）`N 逾期` red Badge；组容器 ListCard。
- 看板：三列 `bg-surface/60 rounded-xl border p-3`，列头 = 名称 + 计数 Badge；卡片 = 标题 13px + meta（项目色点 · 优先级）+ DueChip；拖入目标列 `border-accent/60 bg-accent-soft/40`；空列虚线占位。

### 5.6 TaskRow（任务行，全局复用）
`flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-surface-2`：
CheckBox → 标题 13.5px（完成态 text-3 + 删除线）→ meta 行 11.5px（项目色点 · 状态 Badge · 标签）→ 右侧：优先级 Badge（旗标图标）+ DueChip + 悬浮删除。

### 5.7 日历
- 页头左侧：`2026年8月`（H1 同级）+ 今天 Chip + 前后箭头；右侧 Segmented 月/周。
- 网格：外框 `rounded-xl border`；星期表头行（bg-surface，`border-b`）；格间 1px border 分隔，格子 `bg-surface min-h-24`；非本月 `opacity-40`；今天格 `bg-accent-soft/40` + 日期数字 accent 实底圆形白字。
- 条目：任务 = 7px 项目色点 + 11px 文字（逾期红字/完成删除线）；**节点 = accent-soft 底 + 11px accent 图标 + 文字胶囊**；超 3 条（月视图）折成 `+N 更多`。
- 网格上方放图例行：各项目色点 + 节点胶囊样式示意。

### 5.8 灵感
- 卡片：**左缘 3px 状态色条**（待整理 warn / 已整理 accent / 已转任务 success）+ 正文 13.5px 1.75 行高 + 虚线分隔 meta 行（状态 Badge · 时间 · 项目 · 标签）+ 悬浮操作（转任务 soft / 已整理 check / 删除）。
- 筛选（FilterBar）：左区搜索框（带图标）+ 状态 Chips（带计数）‖ 右区项目/标签 Select。

### 5.9 工具箱
- 分组节：标题 14px semibold + 计数 + 悬浮分组操作（上移/下移/重命名/删除，24px 小图标钮）。
- 收藏卡：36px 图标 tile（`bg-surface-2 rounded-lg`：favicon 或类型图标）+ 名称 13px semibold + 路径 11px truncate + 类型 TagChip；`auto-fill minmax(230px,1fr)` 网格；悬停上浮。
- 失效项：`opacity-55 grayscale` + 路径位置红字「路径不存在」；空分组 = 虚线拖放目标。

### 5.10 论文投稿
- 页头副标题区放**状态流转链**：各状态 TagChip 用 `→` 文字连接，录用绿/拒稿红描边。
- 状态分组节：色 Badge + `N 篇`；行 = 标题 14px medium + meta（venue · 类型 · 轮次 · 项目 · 章节/自动节点）+ 下一日期倒计时 Badge + 状态 Select（`h-7 w-26 text-[12.5px]`）+ 悬浮编辑/删除。

### 5.11 成果台账
- 草稿提示条：`border-dashed border-accent/55 bg-accent-soft/50 rounded-lg px-3.5 py-2 text-accent text-[12.5px]`。
- 类型筛选 Chips；**年份 Timeline**（17px 年份标题 + 圆点）；成果卡 = 34px 类型图标 tile + 名称 13.5px + （草稿/级别）Badge + meta + 详情 + 📎 证明材料链接（11px）+ 悬浮操作；草稿卡 `border-dashed`。

### 5.12 汇报中心
- 生成入口卡 ×3：图标 tile + 「生成XX」14px + 期间 11.5 + 右缘 chevron；悬停上浮。
- 工作总结：单卡行内表单（标签 + 两个日期输入 + 按钮 + 说明）。
- 历史报告：ListCard 行（标题 13.5 medium + 期间/生成时间 meta + 类型 Badge + 编辑/导出md/导出docx/复制/删除 图标钮）。
- 编辑视图：页头（返回 + 标题 + 期间）→ 标题输入（max-w-md）→ 正文 Textarea（`min-h-[52vh]` mono 12.5）→ 导出行。

### 5.13 设置（`.page-narrow`）
Section 卡纵排：数据目录 / 标签与类型 / 外观 / 快捷键 / 数据安全 / 报告模板 / 关于。
- 主题选择卡：名称 13 semibold + 「当前」Badge + 三段色板条 + 描述 11px；选中卡 `border-accent border-[1.5px]`。
- 说明文字统一 11.5px text-3 leading-relaxed；操作按钮右置或行内。

---

## 6. 主题适配规则

1. 六套组合（linear/claude/notion × 浅/深）全部可用是**验收标准**；改完必检。
2. 需要软色底时用 `*-soft` token，**禁止 `black/40`、`white/10` 之类的透明度叠色**（深色下各主题有自己的 soft 色）。
3. claude 主题标题自动衬线、圆角更大；notion 卡片比画布深一档——都是 token 行为，不要在组件层补偿。
4. 深色下日期选择器图标反色已全局处理（`styles.css`）。

## 7. 新页面 / 新组件 Checklist

- [ ] 用 `.page`（或 mid/narrow）做壳，`<PageHeader>` 做头
- [ ] 字号全部落在 7 档内，最小 11.5px
- [ ] 圆角只用 `rounded-lg/xl/2xl` + `rounded-md/full`
- [ ] 颜色只用语义 token 类（`bg-surface`、`text-text-2`、`bg-accent-soft`…）
- [ ] 卡片内边距 18/20（紧凑 14/16），区块间距 16/20/24
- [ ] 空状态用 `<EmptyState>`；筛选用 `<FilterBar>`（Chips 流动区 + 筛选锚定区，见 §4）；行式列表用 ListCard 模式
- [ ] 图标尺寸符合 §1.4；数字统计 `tabular-nums`
- [ ] 三主题 × 明暗目检通过

## 8. 历史

| 版本 | 日期 | 说明 |
|---|---|---|
| V3.1 | 2026-08-22 | 筛选工具条重构为 FilterBar 双区结构（Chips 流动 / 筛选锚定右侧永不孤行）；Select 基类支持省略号 + 工具条内 Select 强制 min/max 宽；截止筛选预设下拉化；`cn()` 接入 tailwind-merge 修复覆盖类被基类 `w-full`/`h-8` 压制的布局 bug |
| V3 | 2026-08-22 | 全页布局重设计：字号 18→7 档、侧边栏分组、圆角 token 接入、组件体系化；原型 `redesign-v3.html` |
| V2 | 2026-08 | 三主题 token 体系（linear/claude/notion × 明暗） |
