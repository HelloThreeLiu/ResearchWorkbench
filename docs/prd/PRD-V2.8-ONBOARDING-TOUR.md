# 格致 · 科研工作台 V2.8 产品需求文档（新手引导 Onboarding Tour）

> 状态：已实现（随分支 feat/guided-tour 交付，随下一个 minor 版本发布）。
> 本文档为 V2.4–V2.6 交付后的新功能小节，决策编号承接 PRD-V2.4-V2.6.md 的 D1–D23。

## 1. 需求单

- **类型**：feat ｜ **级别**：L（settings.json 新增字段 + 触碰 `src/main/`）
- **背景**：新用户完成首次启动（选数据目录，见 PRD.md 5.9 / D8）后直接进入含 16 个页面的主界面，缺少认识各功能分区的路径。
- **现状与期望**：现状仅有"选数据目录"一步欢迎页，进入主界面后无任何引导；期望新用户首次进入主界面时出现**可跳过的聚光分步引导**，完成或跳过后永不再自动弹出，设置页可手动重看。
- **验收标准**：
  1. 全新 userData（无 settings.json）→ 选完目录进主界面后引导自动开始，停于「今日概览」页共 7 步；
  2. 每步高亮目标元素（遮罩挖洞 + 圆角描边），气泡含进度（n/7）、上一步/下一步/跳过；
  3. 点「跳过」、Esc、或走完全部步骤 → settings.json 写入 `tourVersion: 1`，重启不再自动弹出；
  4. 老用户（settings.json 已存在但无 tourVersion 字段）升级后启动**不弹**；
  5. 引导未完成就退出的新用户（tourVersion=0 已落盘）下次启动仍会弹；
  6. 设置页「关于」区有「重新查看新手引导」入口，可随时重看；
  7. 窗口 resize 时高亮框位置跟随目标；引导期间遮罩下方 UI 不可点；
  8. 三套风格主题 × 明暗六态下遮罩与气泡显示正常，符合 V3 设计规范。
- **影响范围**：`src/shared/types.ts`、`src/shared/tour.ts`（新）、`src/main/store.ts`、`src/renderer/src/store.ts`、`src/renderer/src/lib/tour.ts`（新）、`src/renderer/src/tourStore.ts`（新）、`src/renderer/src/components/Tour.tsx`（新）、`App.tsx`、`Sidebar.tsx`、`WritingTimerButton.tsx`、`SettingsPage.tsx`、`tests/tour.test.ts`（新）。
- **优先级**：排期。

## 2. 方案要点

### 2.1 数据模型

`AppSettings` 新增 `tourVersion: number`（0=未读）。加载期由 `shared/tour.ts` 的
`resolveInitialTourVersion(fileExists, parsed)` 推导初值：新装得 0；老配置缺字段/非法值得
`TOUR_VERSION`（视为已读，升级不打扰）；已有合法值原样保留。数值版本而非布尔：将来引导内容
大改需要全员重看时，只需递增 `TOUR_VERSION`。

### 2.2 引导流程（7 步，全程停留「今日概览」页）

| # | 锚点（data-tour） | 内容 |
|---|---|---|
| 1 | 居中卡片 | 欢迎 + 引导怎么用（开始/跳过） |
| 2 | `nav-workspace` | 工作台 · 今日概览 |
| 3 | `nav-research` | 科研推进八入口 |
| 4 | `nav-output` | 成果与汇报四入口 |
| 5 | `writing-timer` | 写作计时 |
| 6 | `settings` | 设置 + 全局快捷键速记 |
| 7 | 居中卡片 | 收尾：建议先建第一个项目 |

高亮实现：目标 rect 上盖透明 div，`box-shadow: 0 0 0 100vmax` 半透明遮罩挖洞 + accent 描边；
气泡自动选位（窄目标优先右侧，否则下方/上方）并夹紧视口；`resize` 跟随；目标缺失退化为居中卡片。
浮层级 `z-[70]`（阶梯：banner z-40 → Modal z-50 → QuickCapture z-[60] → Tour z-[70]），
激活期间遮罩接管全部点击。三条退出路径（完成 / 跳过 / Esc-capture 拦截）统一写 tourVersion 落盘。

## 3. 决策记录（编号承接 PRD-V2.4-V2.6.md D23）

| 编号 | 决策 | 理由 |
|---|---|---|
| D24 | 引导形式为聚光分步（spotlight tour），自研实现零新增依赖 | react-joyride / driver.js 体积大且样式难贴合 3 主题 token 体系（延续 D14 零依赖约束）；与首次启动欢迎页分工——欢迎页负责"装好"，tour 负责"会用" |
| D25 | 仅新用户自动触发：老用户升级经 loadSettings 迁移视为已读 | 对老用户弹"新手引导"是打扰；迁移逻辑收敛在主进程数据层（仓库纪律：数据边界统一走 store.ts） |
| D26 | 全程停留「今日概览」不切页；锚点用 `data-tour` 属性 | 切页引导受异步挂载/滚动时机影响，脆弱且维护成本高；侧边栏常驻，聚光它已能讲清全局布局。侧边栏分组容器由 `display: contents` 改为普通 flex 容器以获得盒模型（间距布局不变） |
| D27 | 完成/跳过/Esc 三路统一写 tourVersion；设置页「重新查看」为会话级重开，不动已读标记 | 单一落盘出口避免状态分叉；重看结束后幂等写回无副作用 |
| D28 | 引导期间遮罩接管全部点击，目标元素本身也不可交互 | 首版不做"点击目标继续"式交互，避免误触进入其他页面导致锚点消失；操作只走气泡按钮 |

## 4. 验证记录（2026-10-13）

- 单元：`tests/tour.test.ts` 7 用例（迁移四分支 + shouldShowTour + 步骤定义完整性）；
- 门禁四件套全绿（typecheck / 51 测试 / build / audit=0）；
- 专项：layout-check 42/42、style-theme-check 17/17、e2e-verify 45/45（全新数据目录）；
- CDP 实机驱动（`--user-data-dir` 隔离）：新用户自动弹 / 7 步逐步断言 / 完成落盘 tourVersion=1 /
  重启不弹 / 老用户（缺字段）不弹 / 设置页重看与跳过；明暗两态截图核验聚光框与气泡无视觉缺陷。

## 附录：修订记录

| 版本 | 日期 | 变更 |
|---|---|---|
| V1.0 | 2026-10-13 | 初稿并随实现交付：需求单、方案、决策 D24–D28、验证记录 |
