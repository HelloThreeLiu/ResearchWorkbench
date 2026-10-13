# 代码审查修复报告 — 对应 CODE-REVIEW-2026-09-29.md

- **修复日期**：2026-09-30（第一轮）；**2026-09-30 第二轮**：按核实报告 `CODE-REVIEW-VERIFY-2026-09-30.md` 修复 V-1~V-9（见文末）；**2026-10-04 第三轮**：按 `CODE-REVIEW-VERIFY-2026-10-04.md` 修复 N-1~N-9（见文末）；**2026-10-05 第四轮**：按 `CODE-REVIEW-VERIFY-2026-10-05.md` 处置 P-1~P-5（见文末）；**2026-10-05 第五轮（升级专项）**：Electron 34→44 / electron-builder 26 / electron-vite 5，依赖漏洞清零（见文末）
- **验证结果**：`npm run typecheck`（node+web）通过；`npm run build` 通过；`npm test`（7/7 通过，含新增 netGuard 回归）；`npm audit --omit=dev` 0 漏洞
- **变更规模**：31 个文件修改 + 3 个新文件（ErrorBoundary / DataHealthBanner / tests/exporter.test.ts），+883 / −389 行

## 逐条处理结果

### Critical

| 编号 | 结论 | 处理说明 |
|---|---|---|
| C-1 | ✅ 已修复 | 三层防线全部落地：① `index.ts` 窗口锁死 `sandbox: true / contextIsolation: true / nodeIntegration: false`，注册 `setWindowOpenHandler`（一律 deny + http(s) 交给系统浏览器）、`will-navigate` / `will-frame-navigate`（仅允许本应用 file:// 或 dev URL）、`will-attach-webview`（禁止）；② `ipc.ts` 所有 handler 经 `handle()` 包装做 `senderFrame.url` 来源校验（file:// 前缀精确到 renderer 目录、dev 精确到 vite URL）；③ preload 本就只用 contextBridge/ipcRenderer，沙箱化无副作用（产物为 CJS，已核实）。 |
| C-2 | ✅ 已修复（最小方案） | `store.ts` `saveCollection` 写入前乐观锁：磁盘 mtime ≠ 本应用上次写完记录值 → ① 磁盘版本复制为 `backups/conflict-<集合>-<时间戳>.json`（绝不覆盖）；② 本机本次修改另存 `backups/local-<集合>-<时间戳>.json`（任何一端都不丢）；③ 抛 `DATA_CONFLICT` 拒绝写入。渲染层捕获后经 `DataHealthBanner` 醒目提示并自动重载磁盘版本（同时刷新主进程 mtime 记录，冲突链路自愈）。附带：集合级写入串行队列防并发交错。**按实体（id+updated_at）合并属完整方案，留作后续迭代。** |

### Major

| 编号 | 结论 | 处理说明 |
|---|---|---|
| M-1 | ✅ 已修复 | 双保险：`shortcuts.ts` 注册失败时自动把旧键注册回来（恢复 `currentAccelerator`）；`ipc.ts` 改为「先注册新键、成功后再写配置」，失败时配置保持旧键并返回 `__CONFLICT__:` 前缀，不再出现「配置说 A、实际什么都没注册」。 |
| M-2 | ✅ 已修复 | 渲染层：`eventToAccelerator` 强制字母/数字必须带修饰键，F1–F12 允许单独使用（与 UI 提示一致）；主进程：`shortcuts.ts` 新增 `isValidAccelerator` 白名单校验（末段合法键 + 修饰键集合 + 单键仅限 F 键），`settings:update` 与应用启动注册前都校验，非法直接拒绝。 |
| M-3 | ✅ 已修复 | `exporter.ts` 拆出纯函数 `parseInlineBold`：先按 split 捕获组奇偶性判定加粗、再过滤空串（保留占位符语义）。新增 `tests/exporter.test.ts`（Node 内置 test runner，覆盖审查报告全部 4 个用例）与 `npm test` 脚本——项目第一组单测。 |
| M-4 | ✅ 已修复 | 退出握手：`app:quit` → 若窗口存活则发 `app:quit-requested`（渲染层 `onQuitRequested` → `flushPendingSaves()` → `confirmQuit()`），2s 超时兜底强制退出；退出前备份仍由 `before-quit` 统一执行（此时数据已落盘）。另注册 `beforeunload`/`pagehide` 尽力 flush；`flushPendingSaves` 挂到 store 公开接口。顺带消除了原实现「app:quit 备份 + before-quit 再备份」的双备份。 |
| M-5 | ✅ 已修复 | `url:fetch-meta` 重写：`assertSafeUrl`（仅 http/https + `dns.lookup` 解析后判定私网/回环/链路本地/CGNAT/保留段，IPv4+IPv6）+ `redirect: 'manual'` 手动跟跳（≤5 跳，每跳重新校验）+ 每跳 5s 超时 + 非 2xx 返回空。 |
| M-6 | ✅ 短期方案已修复 / 规范方案需进一步确认 | 已关 `autoInstallOnAppQuit = false`（安装仅经用户显式点击「立即重启安装」），更新弹窗文案同步修改。**购买代码签名证书并在 `electron-builder.yml` 配置 `publisherName`（触发 electron-updater 的 Authenticode 校验）需成本决策，未实施。** |
| M-7 | ✅ 已修复 | `loadAllWithIssues`：逐条结构校验（9 个数组集合的必填字段/数组字段），坏记录跳过并上报 `shape`；解析失败上报 `parse` 并加入 `brokenCollections`——该集合的 `saveCollection` 一律拒绝（坏文件不被新数据覆盖），文件在外部修复后自动解除。`BootstrapResult.issues` 透传渲染层，`DataHealthBanner` 醒目展示；新增 `ErrorBoundary`（页面级兜底 + Onboarding 兜底）。附带两处同类隐患一并堵住：`checkExternalChanges` 不把损坏集合纳入变更、渲染层 `refreshExternal` 只按 `changed` 增量替换（坏文件不再把内存数据清空）。 |
| M-8 | ✅ 已修复 | IPC 边界白名单校验：`store:save`（集合名白名单 + 数组/对象结构）、`shell:open-external`（协议 + 类型）、`shell:open-path`（类型/长度 + resolve）、`fs:exists`（类型/长度）、`import:parse-references`（类型 + `.bib/.json` 扩展名 + 32MB 上限 + statSync 探测存在性）、`dialog:pick-path`（kind 白名单）、`export:report`（参数类型 + 格式白名单）、`settings:update`（对象类型 + hotkey/dataDir 校验）。 |
| M-9 | ✅ 已修复（方案 B） | `Paper` 增加 `year: number \| null`；`addPaper` 落库；快速导入 `doImport` 写入年份（非 1900–2100 视为空，不静默丢弃可感知）；`PaperEditModal` 增加「发表年份」输入框（可后补编辑）。**「同步到成果台账草稿日期」未采纳：草稿日期语义是『何时记录』，用年份伪造日期反而失真。** |

### Minor

| 编号 | 结论 | 处理说明 |
|---|---|---|
| m-1 | ✅ 已修复 | `exportToFile`：已有扩展名整体替换为目标扩展名，不再叠成 `周报.md.docx`。 |
| m-2 | ✅ 已修复 | `formatBibTeX`：字段值转义 `{`/`}` 为 `\{`/`\}`；citekey 做字符白名单（`[A-Za-z0-9_:.-]`），空时回退 `ref`。 |
| m-3 | ✅ 已修复 | `ReferenceEditModal`：年份 `Number.isInteger` + 1500 ≤ y ≤ 今年+1，否则置 null；输入框加 `min={1500}`。 |
| m-4 | ✅ 已修复 | `ReferenceImportModal` 预览比对增加 `batchSeen`（DOI → citekey → 标题+年份 同序键），批内重复计入 skips。 |
| m-5 | ✅ 已修复 | `report.ts` 新增 `fillTemplate`：函数式替换（绕开 `$&` 等替换模式）+ 单次正则覆盖全部占位符出现位置。 |
| m-6 | ✅ 已修复 | `insights.ts`：`days < 0`（结果早于投稿）计入 `excluded`，不再产生负周期。「UI 提示日期顺序异常」未单独加（excluded 计数已涵盖）。 |
| m-7 | ✅ 已修复 | `Dashboard.tsx` / `IdeasPage.tsx` 改为 `useStore((s) => s.settings.hotkey)` 响应式订阅。 |
| m-8 | ✅ 已修复 | `safeWriteJson` 异步化（`fs.promises` + 100/200/…ms 退避重试，让出事件循环）；`updateSettings`/`saveCollection`/`persistStoreMeta` 随之异步化，IPC 层 await；`backupNow` 保持同步拷贝（退出路径可用），仅 lastBackupDate 落盘异步化。 |
| m-9 | ✅ 部分修复（① 已做，②③ 属产品/架构决策） | ① 全部写盘已 `fs.promises`（见 m-8）。② **保留 `null, 2` 缩进**：「数据是明文可读 JSON」是 Onboarding/设置页明示的产品卖点，审查报告本身允许在该诉求下保留。③ 大集合分片存储属架构演进，未实施。 |
| m-10 | ✅ 已修复 | 新增 `fs:exists-many` 批量 IPC（主进程 `fsp.access` 并发，上限 500）；ToolboxPage 轮询 60s → 5min，并增加窗口聚焦触发；编辑保存/手动刷新入口不变。 |
| m-11 | ✅ 已修复 | CSP `img-src` 收紧为 `'self' data:`。工具箱 favicon 远程图被拦截后走既有 `onError` 回退默认图标（优雅降级）。响应头版 CSP 与「点击加载」占位属可选加固，未做。 |
| m-12 | ✅ 审计已跑通并清零生产依赖 / dev 侧与 CI 集成需进一步确认 | `npm audit --registry=https://registry.npmjs.org/` 跑通：**生产依赖 1 个 high（js-yaml，electron-updater 间接依赖）已 `npm audit fix` 清零（--omit=dev 复验 0 漏洞）**；剩余 17 个全在 devDependencies（electron-builder@25 工具链 + node-gyp），修复需升级 electron-builder@26（破坏性），建议与 CI 门禁一起排期。 |
| m-13 | ✅ 已修复 | 并入 M-7：`ErrorBoundary` 包住 `<App/>` 与页面区（侧栏保持可用，崩溃时可打开数据目录/重载）。 |
| m-14 | ✅ 已修复 | `triggerQuickCapture`：窗口刚重建时 `webContents.isLoading()` → 等 `did-finish-load` 再发事件。 |
| m-15 | ✅ 已修复 | `ensurePaperAchievementDraft` 去重条件去掉 `is_draft`——同标题论文类成果（含正式条目）存在即跳过。 |
| m-16 | ✅ 已修复 | Onboarding 与设置页各增加一段告知：明文保存、backups/ 历史快照（含删除内容）随网盘同步、避免双端同时编辑（冲突会保留双方副本需手动合并）。 |

### Nit（可选建议）

| 项目 | 结论 |
|---|---|
| `ipc.ts` 用 `require('electron').app.quit()` + eslint 注释 | ✅ 已修复（`doQuit()` 直接用顶部导入的 `app`） |
| 原生 `alert()` 与全局风格不一致（ToolboxPage/ReferencesPage） | ⏸ 未处理：项目无统一 toast 基础设施，新建属可选优化，错误路径现状可用 |
| `ReportsPage` 自拼 uid | ✅ 已修复（改用 `@shared/types` 的 `uid()`） |
| `AchievementsPage` 渲染期 setState 初始化表单 | ✅ 已修复（`useEffect` + `defaultsRef`，与其他弹窗统一） |
| `CalendarPage` `CellItem` 条件调用 Hook | ✅ 已修复（`useMilestoneTypeLabel` 提到组件顶部） |
| `ui.tsx` `Modal` 依赖 `onClose` 反复挂摘监听 | ✅ 已修复（`onCloseRef`，依赖数组只留 `[open, dismissable]`） |
| `storeMeta.savedAt` 用加载时刻 | ✅ 已修复（取文件自身 mtime） |
| 托盘图标非正方形变形 | ✅ 已修复（按短边等比缩放到 16px） |
| `SettingsPage` 提示与实现不符 | ✅ 已修复（随 M-2，实现改为强制修饰键） |
| `deleteMilestoneType` store 层不查引用 | ✅ 已修复（仍被引用则不删除，与 UI 禁用一致；`deleteAchievementType` 同步加守卫，原先的“回退其他”死代码移除） |

### 未实施（需进一步确认 / 排期）

1. **Electron 34 EOL 升级**（审查报告 M-12 补充）：升级到 42+ 涉及 electron/electron-builder/electron-vite 联动与回归测试，属独立排期事项。
2. **代码签名 + publisherName**（M-6 规范方案）：需要证书购买决策。
3. **C-2 完整方案**：按实体（id + updated_at）自动合并 + 冲突处理对话框（当前最小方案已保证双方数据都不丢 + 显式提示）。
4. **架构建议**（store.ts 拆分 / 渲染层 store 按领域切分 / schema 版本迁移机制 / CI 测试门禁）：中长期重构方向，未在本次最小修复中实施。
5. **m-5 建议的其余单测**（fill 模板、cleanTex/formatGB7714、parseBibTeXText）：测试基建已就位（`npm test`），可按需补齐。

## 验证记录

```
npm run typecheck   → 通过（node + web）
npm run build       → 通过（main 48.2 kB / preload 2.6 kB / renderer 937.7 kB）
npm test            → 4/4 通过（parseInlineBold 回归）
npm audit --omit=dev（公网 registry）→ 0 vulnerabilities
```

---

# 第二轮修复 — 对应 CODE-REVIEW-VERIFY-2026-09-30.md（2026-09-30）

复审确认第一轮 39 项全部真实落地，另发现 9 条新问题。本轮逐条处置如下，验证：`typecheck / build / npm test` 复跑通过，判定逻辑用探针按复审用例实测。

| 编号 | 结论 | 处理说明 |
|---|---|---|
| **V-1** Major | ✅ 已修复 | `index.ts` `isAllowedUrl` 与 `ipc.ts` `isTrustedSender` 收敛为同一判据：打包环境精确 pin 到 `pathToFileURL(../renderer/)`（带尾分隔符），dev 精确到 vite URL。探针实测：本应用 index.html/assets 放行；`file:///C:/evil.html`、`file://evil.com/share/x.html`（即协议相对 `//evil.com` 以 file:// 为基址的解析结果）、`renderer-evil` 同名兄弟目录全部拒绝。SMB 外联与窗口替换路径被堵死。 |
| **V-2** Major | ✅ 已修复 | `updateStore.installNow` 在调用 `installUpdate()` 前先 `await useStore.getState().flushPendingSaves()`——「立即重启安装」不再丢最后 ≤800ms 的防抖编辑。（未采纳「把安装改走 app:quit-requested 握手」的彻底方案：electron-updater 的 quitAndInstall 自带安装语义，强行套握手会引入新的状态机复杂度；渲染层 flush 后 `beforeunload` 再兜一层已等效堵住该出口。） |
| **V-3** Minor | ✅ 已修复 | 渲染层 `updateSettings` 识别 `__CONFLICT__:` 哨兵时**不采纳**该结果（保留当前 `settings`），仅把哨兵返回给 SettingsPage 展示错误；哨兵不再进 UI 状态，kbd/概览页提示保持旧键。 |
| **V-4** Minor | ✅ 已修复 | 损坏集合会话内自动恢复，无需重启：`loadAllWithIssues` 解析失败时记录「损坏时刻」的 mtime；`checkExternalChanges` 对损坏集合在 mtime 变化后（用户在外部修复保存）重试解析，成功即纳入变更并清除损坏标记、载入数据，保存自动恢复。提示条文案同步改为「修复保存后应用会自动检测并恢复」。 |
| **V-5** Minor | ✅ 已修复 | `refreshExternal` 的 issues 追加改为按 `collection+kind+detail` 去重合并，轮询不再堆重复行、数组不再无界增长。 |
| **V-6** Minor | ✅ 已修复 | ① **假阳性**：`storeMeta` 增加内容基线 `sha256`（加载与每次写入后记录）；保存时 mtime 命中后**读磁盘内容比哈希**，一致（网盘客户端只触碰时间戳）则正常写入，不再误报冲突。② **冲突默认改为「本机继续生效 + 双方留底」**：冲突时 conflict-\*/local-\* 双备份后，主进程把基线更新为磁盘当前状态并抛 `DATA_CONFLICT`，渲染层提示条告知后**重试一次落盘**（只重试一次，外部连续写入不循环）——刚写的改动不再从界面消失，对方版本完整保留在 backups/，提示条提供「打开备份目录」入口。③ 「启动后新出现、无基线的外部文件」同样按冲突保护（不再静默覆盖未知内容）。④ 假阴性（FAT 2s 粒度内的外部改动漏判）属 mtime 固有精度，以内容哈希为最终判据后影响进一步收窄；按实体合并 + 三选一冲突对话框仍留作完整方案。 |
| **V-7** Minor | ✅ 已修复 | `loadAllWithIssues` 对 tools/vocab 增加 `isPlainObject` + `Array.isArray` 逐字段校验：非数组字段回退空数据/默认词汇库并上报 `shape`（原 `?? []` 兜不住字符串等非数组值，渲染层 `.map` 会抛错）。 |
| **V-8** Minor | ✅ 已修复（采纳推荐方案 2：主进程代理） | 新增 `url:fetch-favicon` IPC：主进程经 `assertSafeUrl` + `safeFetch`（复用 SSRF 防护）取回 `/favicon.ico`，校验 content-type 为图片、≤256KB，转 **data: URL** 返回；渲染层 `ToolIcon` 改用模块级 origin 缓存 + 该代理（data: 在收紧后的 CSP `img-src 'self' data:` 内），favicon 功能恢复且不再从渲染侧直连外站。 |
| **V-9** Minor | ✅ 已修复 | ① `dns.lookup(host, { all: true })` 全量解析，**任一**地址命中私网即拒绝（多 A/AAAA 记录不再只校验首条）。② 新增 `normalizeIp`：IPv4-mapped（`::ffff:a.b.c.d` 与 `::ffff:7f00:1` 十六进制形式）和 NAT64（`64:ff9b::…` 两种形式）归一化为 IPv4 再判定。探针按复审用例实测：`::ffff:127.0.0.1`、`::ffff:169.254.169.254`、`::ffff:7f00:1`、`64:ff9b::7f00:1` 等全部 BLOCK，公网地址（含公网 IPv6）仍 ALLOW。③ **有意不封 `198.18.0.0/15`**：该段被 Clash TUN fake-ip 等本地代理广泛用作 DNS 应答，封禁会让代理用户的 `url:fetch-meta`/favicon 全部失效；此为权衡决策而非遗漏。DNS rebinding 时间窗（TOCTOU）的彻底解法（解析后按 IP 直连 + Host 头）留作后续加固。 |

## 第二轮额外发现并修复（自查）

- **缺失集合文件被误判为损坏**（第一轮引入）：`readCollectionFile` 曾以 `statSync` 抛错统一处理「文件不存在」，导致旧数据目录缺少新版本集合文件（如 references.json）时被标记损坏、保存被 `DATA_CORRUPT` 阻断。已恢复「文件缺失 = 空集合」语义（`existsSync` → 返回 null → 跳过，不进损坏集合），并在 `loadAllWithIssues` 中清除该集合的历史损坏标记。

## 第二轮变更文件

`src/main/index.ts`、`src/main/ipc.ts`、`src/main/store.ts`、`src/preload/index.ts`、`src/renderer/src/store.ts`、`src/renderer/src/updateStore.ts`、`src/renderer/src/pages/ToolboxPage.tsx`、`src/renderer/src/components/DataHealthBanner.tsx`

## 第二轮验证记录

```
npm run typecheck → 通过（node + web）
npm run build     → 通过
npm test          → 4/4 通过
探针实测：isAllowedUrl 7 用例、isPrivateIp/normalizeIp 18 用例全部符合预期
```

---

# 第三轮修复 — 对应 CODE-REVIEW-VERIFY-2026-10-04.md（2026-10-04）

复审结论「有条件通过」，新发现 N-1~N-9（均 Minor/Nit，建议 N-1/N-3 先修）。本轮**全部 9 条已修**，验证：typecheck / build / `npm test`（7/7，新增 netGuard 套件）复跑通过，N-2 穿越用例按复审探针自测 11/11。

| 编号 | 结论 | 处理说明 |
|---|---|---|
| **N-1** | ✅ 已修复 | `renderer/store.ts` 与 `SettingsPage.tsx` 的哨兵判断均加 `typeof hotkey === 'string'` 守卫——手改坏的 `settings.json`（hotkey 为 null/数字）不再让所有设置更新在渲染层抛 TypeError，与主进程 `isValidAccelerator` 的防御对齐。 |
| **N-2** | ✅ 已修复 | `isAllowedUrl` 改为「规范化后路径包含」判定：`new URL` → `fileURLToPath` → `path.relative(rendererDirFs, fsPath)`，`rel` 为空/以 `..` 开头/绝对路径一律拒绝。探针自测 11 例：`renderer/../../evil.html`、`renderer/../preload/index.js`、`..%2f`、`%2e%2e%2f`、`renderer/..` 等穿越写法全部 DENY，正常页面/资源仍 ALLOW。不再依赖「调用方传入的是 Chromium 已规范化的 URL」这条隐含前提。 |
| **N-3** | ✅ 已修复 | 新增 `pruneConflictArchives()`：`conflict-`/`local-` 两前缀按集合名分组，各保留最近 `CONFLICT_KEEP_PER_COLLECTION = 5` 份（文件名含时间戳，字典序即时间序），在 `saveCollection` 每次产生冲突副本后调用。网盘目录里的冲突副本不再无界增长。 |
| **N-4** | ✅ 已修复 | 冲突重试从 fire-and-forget 改为挂到 `retryChain`（串行、可等待），`flushPendingSaves` 末尾 `await retryChain`——退出前最后一次 flush 若遇冲突，重试落盘也会被等待，收掉「只落 backups 不落数据文件」的窗口。 |
| **N-5** | ✅ 已修复 | `safeWriteJson` 返回写出的序列化文本，`saveCollection` 直接对它做 `sha256`——大集合每次保存少一次全量 `JSON.stringify`。`updateSettings`/`persistStoreMeta` 忽略返回值，兼容。 |
| **N-6** | ✅ 已修复 | 新增 `store:open-backup-dir` IPC（主进程 `path.join(dataDir, 'backups')` 后 `shell.openPath`），preload 暴露 `openBackupDir`，`DataHealthBanner` 改用之——渲染层不再拼路径分隔符，也顺带不依赖 `dataDir` 状态。 |
| **N-7** | ✅ 已修复 | favicon 请求加 in-flight 合并（`Map<origin, Promise>`）：同 origin 的 N 个收藏项在缓存未填充时只发一次请求，其余复用同一 Promise。 |
| **N-8** | ✅ 已修复 | `url:fetch-meta` 删除 `favicon` 字段的解析与返回（图标已走专用通道 `url:fetch-favicon`），返回类型收窄为 `{ title: string \| null }`，preload 与渲染层消费方同步；死代码与误导性字段清除。 |
| **N-9** | ✅ 已修复（按建议「一次到位」） | 判定逻辑抽出为 `src/main/netGuard.ts`（ipc.ts 引用）：新增 `expandIpv6` 把地址展开为 8 个 16 位组（支持 `::` 压缩与内嵌 IPv4 尾段），私网判定改为**字节前缀**语义——`::/96`（v4-compatible）与 `::ffff:0:0/96`（v4-mapped）取末 32 位按 IPv4 判，NAT64 `64:ff9b::/96` 同理，`::`/`::1`/`fc00::/7`/`fe80::/10` 按位掩码判。不再依赖字符串形状，未压缩写法（`0:0:0:0:0:ffff:7f00:1`、`64:ff9b:0:0:0:0:7f00:1`）与 IPv4-compatible（`::7f00:1`）均覆盖。**补回归用例** `tests/netGuard.test.ts`：复审 18 例 + 未压缩/NAT64/v4-compatible 变体共 23 拦截 + 7 放行 + 3 非法输入，全部通过。 |

## 第三轮变更文件

`src/main/netGuard.ts`（新增）、`src/main/index.ts`、`src/main/ipc.ts`、`src/main/store.ts`、`src/preload/index.ts`、`src/renderer/src/store.ts`、`src/renderer/src/pages/SettingsPage.tsx`、`src/renderer/src/pages/ToolboxPage.tsx`、`src/renderer/src/components/DataHealthBanner.tsx`、`tests/netGuard.test.ts`（新增）

## 第三轮验证记录

```
npm run typecheck → 通过（node + web）
npm run build     → 通过
npm test          → 7/7 通过（exporter 4 + netGuard 3）
探针实测：isAllowedUrl 穿越/编码用例 11 例、isPrivateIp 33 例全部符合预期
```

## 仍然开放（沿复审第五节，待决策/排期）

代码签名与 publisherName（证书成本）；Electron 34 EOL 升级（与 electron-builder@26 / dev 漏洞清理合并为一次）；按实体（id + updated_at）自动合并与冲突对话框（C-2 完整方案）；DNS rebinding 的 IP 直连加固；CI 门禁（typecheck + build + test + audit）；其余单测（fillTemplate、citation、parseBibTeXText）。

---

# 第四轮修复 — 对应 CODE-REVIEW-VERIFY-2026-10-05.md（2026-10-05）

复审结论「通过，可以合并」，新发现 P-1~P-6。本轮处置：P-1~P-5 已修复，P-6 未实施（见下）。验证：typecheck / build / `npm test`（7/7，netGuard 断言扩至 26 拦截）复跑通过。

| 编号 | 结论 | 处理说明 |
|---|---|---|
| **P-1** | ✅ 已修复 | favicon 在途 Promise 补拒绝分支：失败同样 `faviconInflight.delete` + `faviconCache.set(origin, null)` 并返回 null——不再留下永久复用的被拒 Promise（图标会话内永不出）与反复出现的未处理拒绝。 |
| **P-2** | ✅ 已修复 | `checkExternalChanges` 损坏集合重试分支改调 `readCollectionFile(name)`（内含 existsSync + 64MB 上限 + 解析），不再裸 `fs.readFileSync + JSON.parse`——超大损坏文件不会被每 30 秒整份读入主进程，顺带消除重复逻辑。 |
| **P-3** | ✅ 已修复 | `isPrivateIp` 入口剥掉 URL.hostname 的方括号形式（`'[::1]'` → `'::1'`）。当前虽不可达（dns.lookup 不返回方括号），但堵住「未来调用者直接传 `u.hostname`」的坑。`tests/netGuard.test.ts` 补 3 条方括号断言（26 拦截 + 7 放行 + 3 非法输入）。 |
| **P-4** | ✅ 已修复 | `url:fetch-favicon` 删去先行 `assertSafeUrl(url)`，路径拼接后直接交给自带校验的 `safeFetch`——每次取图标少一次 `dns.lookup(all: true)` 与 URL 解析；ipc.ts 的 import 同步收窄为仅 `safeFetch`。 |
| **P-5** | ✅ 已修复 | `pruneConflictArchives` 排序由 `localeCompare` 改为 `a < b ? 1 : -1`（文件名前缀一致、时间戳定宽，普通字典序即时间序），省掉 ICU 开销、语义更直白。 |
| **P-6** | ⏸ 未实施（可选优化） | React.lazy 分包。renderer 已确认用相对路径构建（`./assets/`）且静态 module 脚本在 file:// 下工作正常，但动态 `import()` 还需过 CSP `script-src 'self'` 在 file://（null origin）下的匹配——本环境无法运行打包应用做运行时验证，而失败模式是**页面白屏**，远大于 939.6 kB 单包在本地 file:// 下的解析成本（复审原文亦标注「首屏影响可控」「可选」）。建议在可运行打包版的环境验证一次动态加载后再实施。 |

## 第四轮变更文件

`src/main/store.ts`、`src/main/ipc.ts`、`src/main/netGuard.ts`、`src/renderer/src/pages/ToolboxPage.tsx`、`tests/netGuard.test.ts`

## 第四轮验证记录

```
npm run typecheck → 通过（node + web）
npm run build     → 通过
npm test          → 7/7 通过（netGuard 拦截断言扩至 26 条，含方括号形式）
```

---

# 终审收尾 — 对应 CODE-REVIEW-FINAL-2026-10-05.md（2026-10-05）

终审结论「无重大缺陷，可发布」。本轮完成其跟进项中无需决策的三件基建，其余经用户确认排期。

## 已实施（3 批提交）

| 提交 | 内容 |
|---|---|
| `75f7824` | **跟进项 #2**：`isAllowedUrl` 抽出为 `navGuard.ts`（`createIsAllowedUrl` 工厂），迁移四轮复审探针为 `tests/navGuard.test.ts` 7 组回归（穿越/编码变体、UNC、兄弟目录、畸形输入 fail-closed、空格与中文路径、dev 端口前缀欺骗）。测试总数 7 → 14。 |
| `3ddc39e` | **跟进项 #7 最小落点**：数据目录写 `schema.json`（`{ version: 1 }`），`loadAllWithIssues` 前确保存在；此后破坏性字段变更须递增版本并补 migrate，高版本数据仅告警不降级。 |
| `8e9d52a` | **跟进项 #1**：`.github/workflows/ci.yml`——push/PR 自动跑 `typecheck → test → build → audit --omit=dev`；ubuntu + Node 24（内置 test runner 直跑 .ts），`npm ci --ignore-scripts` 跳过 Electron 二进制下载。推送后生效。 |

验证：typecheck / build 通过，`npm test` **14/14**。

## 用户决策（2026-10-05）

1. **六份审查文档**：留在本地不提交（含攻击面细节，仓库公开发布）。
2. **Electron 34 EOL 升级 + devDeps 17 项漏洞**：排期专项（需运行时回归验证）。
3. **C-2 完整方案（按实体合并 + 冲突 UI）**：排期专项实现。
4. **本轮基建改动**：分批提交（如上）。

## 仍开放（排期池）

代码签名 + publisherName（预算决策）；~~Electron@44 + electron-builder@26 升级（含 dev 漏洞清理）~~（→ 第五轮升级专项已完成）；按实体合并与冲突对话框；DNS rebinding IP 直连加固；React.lazy 分包（需打包环境运行时验证）；渲染层 store 按领域拆分等架构项；其余单测（fillTemplate / citation / parseBibTeXText / mdToParagraphs）。

---

# 第五轮（升级专项）— Electron 34 EOL 升级 + 依赖漏洞清零（2026-10-05）

执行终审跟进项 #3（用户决策 #2 的排期项）：**Electron 34 → 44 + electron-builder 25 → 26 + electron-vite 2 → 5，dev/prod 依赖漏洞全部清零**。验证：typecheck / build / `npm test`（14/14）/ Electron 44 运行时冒烟 / `npm audit` 全量与生产侧均 0 漏洞。

## 逐项处置

| 项 | 结论 | 处理说明 |
|---|---|---|
| **Electron 34.5.8 → 44.5.1** | ✅ | 清除 extract-zip（high）依赖链与 Electron 自身 7 条安全通告（contextBridge 拷贝原型链、DevTools Dock State 注入、OpenURLFromTab 沙箱继承、沙箱文档弹窗继承、协议跨源读取、webview Worker 提权、Squirrel.Mac 竞态）。Node 运行时 20.x → 24.18。 |
| **electron-builder 25.1.8 → 26.15.3** | ✅ | 清除 tar critical 链（@electron/rebuild → node-gyp → make-fetch-happen → cacache → tar）。配置（appId / files / extraResources / nsis / electronLanguages / publish github）全部为 26 稳定键，实测配置加载 + @electron/rebuild + electron dist 处理全链路无报错。 |
| **electron-vite 2.3.0 → 5.0.0** | ✅ | 连带 vite 5.4.21 → **7.3.6**（显式写入 devDependencies，peer 上限 ^7；plugin-react@4.7.0 与 @tailwindcss/vite@4.3.3 均兼容）与 esbuild 0.24 → 0.25.12（消除 dev-server moderate 通告）。**沙箱 preload 兼容性保住**：package.json 无 `"type": "module"`，electron-vite 5 默认仍输出 CJS（实测产物 `"use strict"` + `require`）。 |
| **http-cache-semantics（high）** | ✅ | 随依赖树更新消除。 |
| **dompurify 3.4.13–3.4.15（low，生产依赖，DOM XSS，GHSA-p98j-92pf-mc4p）** | ✅ | 升级后复跑 audit 新浮出的通告（原四轮验证时未发布），`npm audit fix` 升至 **3.4.16**，生产依赖维持 0 漏洞。 |

## 破坏性变更核对（Electron 34 → 44）

- 主进程 API 面（app / BrowserWindow / Menu / Tray / nativeImage / dialog / shell / ipcMain / globalShortcut + 导航事件）逐项与 Electron 44 发布通告比对：**无交集移除项**。44 的破坏性变更中：clipboard 模块从渲染进程移除不影响（应用用 Web 标准 `navigator.clipboard` + execCommand 降级，未用 Electron clipboard）；`net.request` 帧目标限制、`select-client-certificate` webContents 可空、ANGLE 静态链接、macOS 12 / Win32 / Linux ARM32 移除、登录项属性移除均未涉及。
- main / preload 产物格式实测均为 CJS（`"use strict"` + `require`），沙箱三件套（sandbox / contextIsolation / nodeIntegration:false）行为不变。

## 回归验证

```
npm run typecheck → 通过（node + web）
npm run build     → 通过（main 56.42 kB / preload 3.18 kB / renderer 949.62 kB）
npm test          → 14/14 通过
Electron 44 运行时冒烟 → 通过：隐藏 BrowserWindow（与主窗口同安全配置 sandbox+contextIsolation+preload）
  加载生产 renderer 产物：electron=44.5.1 / node=24.21.0 / window.api 经 contextBridge 暴露成功 /
  #root 挂载成功，退出码 0（未注册 IPC handler 时渲染层按既有协议优雅降级，未崩溃）
npm audit（公网 registry）→ 0 vulnerabilities（全量）；npm audit --omit=dev → 0 vulnerabilities
```

## 环境限制（非缺陷，需在干净环境补一次最终确认）

- **`electron-builder --dir` 完整打包在本机被「奇安信天擎」（企业 EDR）阻断**：其内核过滤驱动对新建的 asar 文件持续持句柄（unlink 报 EBUSY，构建进程退出后不释放；9/29 的旧产物 `release/win-unpacked/resources/app.asar` 至今被锁）。失败点在打包写 asar 一步，配置加载 → rebuild → electron 44 二进制下载解压均正常，**与本次升级无关**——推测也是前几轮「本环境无法运行打包应用」的根因。Electron 二进制经 npmmirror 镜像下载（github releases 本环境不可达），CI（ubuntu）不受影响。**建议：在无 EDR 干预的环境（或临时对项目目录加白）跑一次 `npm run dist` 做发布前最终确认**；NSIS 安装器与自动更新链路本就随代码签名专项一并回归。
- CI 门禁无需改动：`npm ci --ignore-scripts` 跳过二进制下载，typecheck/test/build 跨平台成立，`npm audit --omit=dev` 保持绿灯（本地实测 0）。仅同步了审计步骤注释（dev 漏洞已清零）。

### 环境问题闭环记录（同日晚间，本机 `npm run dist` 已完整跑通）

1. **asar 锁**：经资源监视器「关联的句柄」定位，持锁者为企业 agent **WorkBuddy** 与开发宿主 **ZCode**（工作区文件索引），非系统组件；句柄释放后打包写 asar 正常。长期方案：向 IT 申请对 `F:\VibeCodingProject` 的防护目录排除；本机跑打包前退出 ZCode。
2. **TLS 证书错误**（`unable to verify the first certificate`）：企业网关对 HTTPS 重签证书，Node 自带 CA 验不过。`NODE_USE_SYSTEM_CA=1`（Node 24 支持读取 Windows 证书库）解决。
3. **镜像变量名纠正**：electron-builder 26 工具链下载读取的是 `ELECTRON_BUILDER_BINARIES_MIRROR`（Electron 归档才是 `ELECTRON_MIRROR`；此前误用的 `ELECTRON_BUILDER_MIRROR` 不被 26 读取）。
4. **icons-bundle 离线预置**：electron-builder 26 的图标转换工具链 `icons@1.1.0/icons-bundle.tar.gz` 下载中途被掐断，已从 npmmirror 下载并按内置 sha256（`2241c950…81eaec`）校验后预置进 `%LOCALAPPDATA%\electron-builder\Cache\icons@1.1.0\`。
5. **最终结果**：`npm run dist` 全链路跑通——electron 44 zip、7zip-win-x64、nsis-3.0.4.1、nsis-resources-3.4.1 均经镜像下载并持久化进本地缓存（此后离线可构建）；产物 `release/Gezhi-Workbench-2.5.1-x64.exe`（108.7 MB）、`.zip`（148.7 MB）、`.blockmap` 生成。包体较 2.5.0（80.8 MB）增大约 28 MB，为 Electron 44（Chromium 152）运行时正常增量。残留 `release-verify/` 目录仍待句柄释放后手动删除。

---

# 后续实测修复 — 旧版 vocab 误报「结构不合法」（2026-10-05，提交 `ffe1a5b`）

**现象**（用户实测报出）：数据健康提示条显示 `vocab.json：vocab 结构不合法（tags/milestoneTypes/achievementTypes/logTemplates 需为数组）…（原文件未改动）`。

**根因**：`E:\工作台\vocab.json` 是旧版本应用写下的合法文件，只含 `tags` 与 `milestoneTypes`（`achievementTypes`、`logTemplates` 为 2.5.x 新增字段）。V-7 修复加的校验把「四字段必须同时存在且为数组」写成硬条件，与同函数下方注释自述的「旧版本缺 achievementTypes、logTemplates 时兜底为默认词汇库」相矛盾——缺字段属预期旧形态，却被当成结构不合法告警。**兜底行为本身正确（缺的字段自动按 DEFAULT_VOCAB 补齐、原文件未动），错的只是误报。**

**修复**：判定抽为纯函数 `src/main/vocabShape.ts` 的 `vocabShapeValid`——仅「字段存在但非数组」（含 null）或「整体非对象」才判不合法；缺字段静默兜底不告警。旧文件在下次词汇库编辑保存时自愈为完整结构。

**验证**：typecheck / build 通过；`npm test` **18/18**（新增 `tests/vocabShape.test.ts` 4 组回归：完整结构、旧版缺新字段、字段存在但非数组、整体非对象）。

---

# 发布记录 — v2.6.0（2026-10-05）

- **版本**：2.5.1 → 2.6.0（提交 `8e8a57c`，tag `v2.6.0`，main 与 tag 已推送 origin）
- **产物**：`Gezhi-Workbench-2.6.0-x64.exe`（108,683,235 B）+ `.blockmap` + `.zip`（148,703,504 B）+ `latest.yml`（sha512 基线），字节级核对后随 Release 上传
- **正式发布**：https://github.com/HelloThreeLiu/ResearchWorkbench/releases/tag/v2.6.0（2026-10-05T15:25:35Z）。此前 v2.5.1 在 GitHub 上是未发布草稿，其两项功能（论文快速记录、任务编辑入口）已随 v2.6.0 一并正式发布；**旧 v2.5.1 草稿仍留在 GitHub，是否删除待定**。
- 发布说明覆盖 v2.5.0..v2.6.0 全部变更（内核升级、依赖漏洞清零、五轮安全与数据加固、vocab 兼容修复、2.5.1 功能），明确「无需迁移数据」兼容承诺（papers 校验器不要求 year 字段、渲染层对缺失 year 全部安全使用，发布前已核实）。

## 第五轮变更文件

`package.json`、`package-lock.json`、`.github/workflows/ci.yml`（注释同步）

## 仍开放（排期池，本轮后更新）

代码签名 + publisherName（预算决策）；按实体合并与冲突对话框（C-2 完整方案）；DNS rebinding IP 直连加固；React.lazy 分包（需打包环境运行时验证，建议与上面的 dist 最终确认同一环境做）；渲染层 store 按领域拆分等架构项；其余单测（fillTemplate / citation / parseBibTeXText / mdToParagraphs）。
