# 格致 · 科研工作台（Gezhi Research Workbench）

为硕士研究生个人打造的**单机桌面应用**：项目、任务、日历、关键时间节点、今日概览、灵感速记、工具收藏、项目进展日志——一台电脑上的一个应用，装下全部科研管理工作。

「格致」取自「格物致知」，也是近代汉语对科学（Science）的旧译。

## 技术栈

- Electron + React + TypeScript（electron-vite 构建）
- Tailwind CSS v4 + 手写轻量组件
- 数据：本地明文 JSON（按实体集合分文件，原子写入 + 防抖落盘 + 自动备份），存于自选目录（推荐坚果云同步目录），多机同步交给网盘

## 开发

```bash
npm install        # 安装依赖（如下载 Electron 慢可设 ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/）
npm run dev        # 启动开发模式
npm run typecheck  # 类型检查
npm run build      # 构建（out/）
npm run dist       # 打包 Windows 安装包（release/，NSIS + 便携 zip）
```

图标生成：`node scripts/gen-icon.mjs`（纯 Node 生成 `build/icon.png`，修改设计后重跑）。

## 使用要点

- **首次启动**选择数据目录（建议坚果云同步目录，如 `…\Nutstore\1\格致科研工作台`），目录为空时自动初始化并预置工具箱示例收藏；
- **全局速记**：默认 `Alt+N` 弹出灵感速记框（可在设置中修改），`Ctrl+Enter` 保存、`Esc` 关闭，保存后不关框可连续录入；
- **关闭窗口 = 最小化到托盘**（保证快捷键随时可用），从托盘菜单真正退出；退出与每日首次运行自动备份数据到数据目录 `backups/`（保留 30 份）；
- **多设备**：数据经网盘同步，本应用启动/聚焦时检测文件变更自动重载；使用约定为「一次只用一台设备」。

## 数据文件

数据目录下按集合分文件：`projects.json`、`tasks.json`、`milestones.json`、`ideas.json`、`progress_logs.json`、`tools.json`，均为明文 JSON，可直接检查、备份与迁移。

## 版本

- **V1.0**：核心闭环——今日概览、项目、任务、日历、时间节点、灵感速记、工具箱、进展日志、数据目录配置与备份。
- V2（规划）：看板视图、论文投稿跟踪、周报自动生成、成果台账、汇报导出（见 `PRD.md`）。
