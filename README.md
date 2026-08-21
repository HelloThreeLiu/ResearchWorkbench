<div align="center">

<img src="build/icon.png" width="96" alt="格致科研工作台图标" />

# 格致 · 科研工作台

**Gezhi Research Workbench**

一台电脑上的一个应用，装下全部科研管理工作

[![平台](https://img.shields.io/badge/platform-Windows10%2F11-blue)](https://github.com/HelloThreeLiu/ResearchWorkbench/releases)
[![版本](https://img.shields.io/badge/version-2.2.0-green)](https://github.com/HelloThreeLiu/ResearchWorkbench/releases)
[![许可证](https://img.shields.io/badge/license-MIT-orange)](LICENSE)

</div>

---

**格致**是一款为科研人（尤其硕士研究生）打造的**单机桌面应用**：项目、任务、日历、关键时间节点、今日概览、灵感速记、论文投稿跟踪、周报自动生成、成果台账——原本散落在 Excel、备忘录、微信收藏和脑子里的科研管理信息，全部收进一个本地应用。

> 「格致」取自「格物致知」，也是近代汉语对科学（Science）的旧译。

## ✨ 功能特性

### 核心闭环（V1）

- **今日概览** —— 启动即回答「今天做什么」：今日到期与逾期任务、未来 30 天关键节点倒计时（≤7 天红色 / ≤30 天黄色分级）、最近灵感、统计卡片与近 7 天完成趋势；
- **项目管理** —— 项目作为顶层组织单元（研究方向 / 论文 / 课题），详情页含概览、任务、进展日志、时间节点四个 Tab，卡片显示进度与最近节点；
- **任务管理** —— 列表 + **看板**双视图（看板支持拖拽换状态），支持项目、状态、标签、日期筛选，逾期自动标记；
- **日历视图** —— 月 / 周视图，任务截止日、时间节点、纯日程三类内容同屏展示；
- **关键时间节点** —— 开题、投稿截止、会议、中期检查、答辩等（类型可自定义），进入提醒窗口即在今日概览分级预警；
- **灵感速记** —— 全局快捷键 `Alt+N` 任意界面秒级唤起，`Ctrl+Enter` 保存不关框可连续录入，灵感可一键转为任务；
- **工具箱** —— 收藏网址 / 文件 / 文件夹 / 程序，分组管理，点击直达，路径失效自动置灰；
- **进展日志** —— 项目级时间线，支持 Markdown 与补记历史日期，是周报自动生成的数据来源。

### 产出增强（V2）

- **论文投稿跟踪** —— 构思 → 写作中 → 已投稿 → 审稿中 → 大修 / 小修 → 录用 / 拒稿全状态流转；章节任务与任务系统双向联动；关键日期自动生成时间节点；录用自动进入成果台账；
- **周报 / 月报自动生成** —— 一键聚合周期内完成任务、进展日志、灵感摘要、节点事件，生成 Markdown 草稿，模板可自定义；
- **成果台账** —— 论文、专利、获奖、项目（类型可自定义）时间线视图，一键复制纯文本用于填简历 / 年终总结；
- **汇报导出** —— Markdown 与 Word docx 双格式导出，命名规范如 `周报_2026_第34周_20260821.docx`。

### 其他

- **应用内自动更新** —— 启动自动检查 GitHub 新版本（侧边栏红点 + 右上角提示卡提醒），更新弹窗查看版本日志，确认后下载（实时进度）并静默安装到原目录，数据不受影响；
- **词汇库管理** —— 标签库（联想选择 + 级联重命名）、自定义节点类型与成果类型，独立 `vocab.json` 存储；
- **三套界面主题 × 明暗模式** —— linear（精密高效，默认）/ claude（学术编辑）/ notion（暖中性极简），3 × 2 共 6 套配色，全应用换肤。

## 📦 下载安装

前往 [Releases](https://github.com/HelloThreeLiu/ResearchWorkbench/releases) 下载最新版本（Windows 10/11 x64）：

| 文件 | 说明 |
| --- | --- |
| `Gezhi-Workbench-x.y.z-x64.exe` | NSIS 安装包（推荐），支持自定义安装目录、创建桌面快捷方式、**应用内自动更新** |
| `Gezhi-Workbench-x.y.z-x64.zip` | 便携版，解压即用，**不支持自动更新**（新版本需手动下载覆盖） |

**首次启动**会引导选择数据目录（建议选择网盘同步目录，如坚果云 `…\Nutstore\1\格致科研工作台`），目录为空时自动初始化。

## 💾 数据存储与多设备同步

- 数据为**本地明文 JSON**，按实体集合分文件存储于你自选的数据目录：`projects.json`、`tasks.json`、`milestones.json`、`ideas.json`、`progress_logs.json`、`tools.json`、`vocab.json` 等，可直接检查、备份与迁移；
- **零服务器**：多台电脑间同步交给网盘（推荐坚果云免费版，按文件粒度同步、流量消耗极小）；应用启动 / 聚焦时检测文件变更自动重载；
- **数据安全**：原子写入（先写临时文件再替换）、防抖落盘、退出与每日首次运行自动备份至 `backups/`（保留 30 份）、删除项目前先自动备份；
- 使用约定：**一次只用一台设备**编辑（单人顺序使用）。

## 🛠 技术栈

- **Electron + React + TypeScript**（electron-vite 构建）
- **Tailwind CSS v4** + 手写轻量组件，CSS 变量主题系统
- **Zustand** 状态管理，**dayjs** 日期处理
- **marked + DOMPurify** Markdown 渲染，**docx** Word 导出
- **electron-updater** 应用内自动更新（GitHub Releases 通道）

## 🚀 从源码构建

```bash
git clone https://github.com/HelloThreeLiu/ResearchWorkbench.git
cd ResearchWorkbench

npm install        # 如下载 Electron 慢可设 ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm run dev        # 开发模式
npm run typecheck  # 类型检查
npm run build      # 构建（out/）
npm run dist       # 打包 Windows 安装包（release/，NSIS + 便携 zip）
```

图标生成：`node scripts/gen-icon.mjs`（纯 Node 生成 `build/icon.png`，修改设计后重跑）。

端到端验证：`node scripts/e2e-verify.mjs`（需先以 `npx electron out/main/index.js --remote-debugging-port=9222` 启动并完成数据目录配置；通过 CDP 驱动真实 UI 点击，验证渲染与 JSON 落盘）。

## 🎮 使用要点

- **全局速记**：默认 `Alt+N` 弹出灵感速记框（可在设置中修改），`Ctrl+Enter` 保存、`Esc` 关闭，保存后不关框可连续录入；
- **关闭窗口 = 最小化到托盘**（保证快捷键随时可用），从托盘菜单真正退出。

## 📄 文档

- [PRD.md](PRD.md) —— 完整产品需求文档（功能需求、验收标准、数据模型、决策记录）
- [design/prototypes/](design/prototypes/) —— 界面主题设计原型

## 🗓 版本历史

- **V1.0**：核心闭环——今日概览、项目、任务、日历、时间节点、灵感速记、工具箱、进展日志、数据目录配置与备份；
- **V1.2**：词汇库管理（标签库 + 自定义节点类型）、全局布局自适应（880px–全屏）；
- **V1.3**：成果类型纳入词汇库管理、筛选栏与看板体验优化、仪表盘统计卡片；
- **V2.0**：产出增强——任务看板（拖拽换状态）、论文投稿跟踪、周报月报与工作总结自动生成、成果台账、汇报导出（Markdown + Word docx）；
- **V2.1**：三套可切换界面主题（linear / claude / notion），首次启动引导页重设计。
- **V2.2**：应用内检测更新——启动自动检查 GitHub 新版本（红点 + 提示卡提醒），更新弹窗含版本日志，一键下载并静默安装到原目录；设置-关于新增检查更新入口、版本号动态显示。

## 📜 许可证

[MIT](LICENSE)
