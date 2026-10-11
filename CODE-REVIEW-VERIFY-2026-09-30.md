# 修复核实报告 — 对 `CODE-REVIEW-FIX-2026-09-30.md` 的独立验证

- **核实日期**：2026-09-30
- **核实对象**：`CODE-REVIEW-FIX-2026-09-30.md` 声称的 39 项修复
- **核实方式**：不采信报告结论。① `git diff --stat` 比对改动规模；② **通读实现**（不只读 diff）；③ 把纯函数/判定逻辑**抽出来单独跑探针**；④ 读依赖源码确认行为断言；⑤ 复跑全部验证命令
- **核实结论**：**规模与命令结果全部与报告一致；C-1 / C-2 是真实落地而非表面改动**。但发现 **9 条新问题**，其中 **2 条 Major**（V-1 导航白名单仍过宽、V-2 更新安装路径绕过落盘握手），**建议先修这两条再合并**

---

## 一、验证结果对照（我亲自复跑）

| 报告声称 | 我实测 | 判定 |
|---|---|---|
| `npm run typecheck` 通过（node+web） | 退出码 0，两个 project 均无输出错误 | ✅ 一致 |
| `npm run build` 通过，main 48.2 kB / preload 2.6 kB / renderer 937.7 kB | main 48.31 kB / preload 2.61 kB / renderer 937.67 kB | ✅ 一致 |
| `npm test` 4/4 通过 | `# tests 4 / pass 4 / fail 0`；并逐条核对了 4 个断言 | ✅ 一致 |
| `npm audit --omit=dev` 0 漏洞 | `found 0 vulnerabilities` | ✅ 一致 |
| 剩余 17 个漏洞全在 devDependencies | `17 vulnerabilities (2 moderate, 14 high, 1 critical)`，逐条追溯均在 electron-builder@25 / electron / electron-vite 链上 | ✅ 一致 |
| 31 文件修改 + 3 新文件，+883 / −389 | `git diff --stat` 输出完全一致；未跟踪文件为 `ErrorBoundary.tsx` / `DataHealthBanner.tsx` / `tests/` 三个 | ✅ 一致 |
| preload 沙箱化无副作用（产物为 CJS，已核实） | 直接读产物 `out/preload/index.js`：`"use strict"; const electron = require("electron")`；`require("node:*")` 出现次数 **0** | ✅ 一致（我独立核到，非采信） |
| M-6 规范方案（代码签名 + `publisherName`）未实施 | `git diff --stat -- electron-builder.yml` **输出为空** → 该文件确实未改 | ✅ 与报告自述一致 |

> 复跑命令（可原样重放）：
> ```bash
> npm.cmd run typecheck && npm.cmd run build && npm.cmd test
> npm.cmd audit --omit=dev --registry=https://registry.npmjs.org/
> git diff --stat
> ```

---

## 二、逐条修复核实

### Critical

| 编号 | 报告声称 | 我核到的事实 | 判定 |
|---|---|---|---|
| **C-1** | 三层防线全部落地，导航锁死 + sender 校验 + 沙箱化 | **三层都真实存在**：① `index.ts:33-40` `sandbox:true/contextIsolation:true/nodeIntegration:false`，`56-73` 注册 `setWindowOpenHandler`（一律 deny，http(s) 转系统浏览器）、`will-navigate`、`will-frame-navigate`、`will-attach-webview`（禁 webview）；② `ipc.ts:41-65` `isTrustedSender` + `handle()` 包装，file:// 精确 pin 到 `../renderer/` 目录（带尾分隔符，`renderer-evil` 不会误匹配），dev 精确 pin 到 vite URL，不可信调用打日志后抛 `unauthorized`；③ 沙箱化成立（见上表产物核实） | ✅ 已修复 |
| **C-2** | `saveCollection` 写入前乐观锁 + 双方副本 + 串行队列 | `store.ts:233-283` 实现完整：写前比对 `storeMeta[name].mtimeMs` 与磁盘 mtime，不一致则 `conflict-*.json`（磁盘份）+ `local-*.json`（本机份）双留底后抛 `DATA_CONFLICT`；`writeQueues` 集合级串行队列确实保证了「查锁→写→记 mtime」不被交错；渲染层 `store.ts:164-171` 捕获后进 `syncConflicts` 并触发 `refreshExternal()`，重载磁盘版本同时刷新主进程 mtime → 冲突链路自愈 | ✅ 已修复（最小方案） |

**C-1 补充说明**：第②层的设计是这件事的关键——它让「preload 泄漏」不再等于「能力泄漏」。我实测确认 `isTrustedSender` 对 `file://evil.com/...` 会返回 false（见 V-1），所以即使导航成功，泄漏出去的 `window.api` 也是**全哑的**（每次调用都抛 unauthorized）。这是本次修复最有价值的一处。

### Major

| 编号 | 我核到的事实 | 判定 |
|---|---|---|
| **M-1** | `shortcuts.ts:37-55` 失败时确实 `register(prev, onPress)` 找回旧键；`ipc.ts:196-209` 改为「先注册成功再 `updateSettings`」，失败返回 `__CONFLICT__:` 前缀且不写配置 | ✅ 已修复（残留见 V-3、§四） |
| **M-2** | 双层：`shortcuts.ts:21-31 isValidAccelerator` 白名单（末段须单字母/数字或 F1–F12，非 F 键必须带修饰键），`index.ts:167-180` 启动时也校验并弹窗；`SettingsPage.tsx:94-108` `eventToAccelerator` 单键直接 `return null`，UI 提示文案与实现一致 | ✅ 已修复 |
| **M-3** | `exporter.ts:18-23 parseInlineBold`：先 `map` 按原始下标判 `i % 2 === 1`，**再** `filter` 空串 —— 契约正确。`tests/exporter.test.ts` 4 个用例我逐条手算 + 实跑均通过（`**重点**普通文字` → `[{重点,true},{普通文字,false}]`） | ✅ 已修复（已复现验证） |
| **M-4** | `ipc.ts:396-415` 握手式退出（发 `app:quit-requested`，2s 兜底）；`App.tsx:101-121` `onQuitRequested` → `flushPendingSaves()` → `confirmQuit()`，并注册 `beforeunload`/`pagehide` 尽力 flush；`flushPendingSaves` 已挂到 store 公开接口；原「双备份」确实消除（只剩 `before-quit` 一处） | ⚠️ 主体已修复，**漏了一个出口**（见 V-2） |
| **M-5** | `ipc.ts:284-381` 重写完整：`assertSafeUrl` 协议白名单 + `dns.lookup` 判私网；`redirect:'manual'` 手动跟跳 ≤5 跳且**每跳重新校验**；每跳 5s `AbortController` 超时；非 2xx 返回空 | ✅ 已修复（残留见 V-9） |
| **M-6** | `updater.ts:30` `autoInstallOnAppQuit = false` 已落地，顶层注释也同步改对；`electron-builder.yml` 未改（无 `publisherName`） | ⚠️ 短期方案已做，规范方案确实未做（报告交代诚实） |
| **M-7** | `store.ts:111-200 loadAllWithIssues`：9 个数组集合逐条 `VALIDATORS` 校验，坏记录跳过并上报 `shape`；解析失败上报 `parse` 且加入 `brokenCollections` 阻止覆盖写入；`checkExternalChanges` 不把损坏集合纳入变更；渲染层 `refreshExternal` 只按 `changed` 增量替换（坏文件不再清空内存）；`ErrorBoundary` + `DataHealthBanner` 均已接入（`main.tsx:9`、`App.tsx:133/143-144`） | ✅ 已修复（残留见 V-4、V-5、V-7） |
| **M-8** | `ipc.ts` 逐通道白名单：`store:save`（集合名 `COLLECTION_WHITELIST` + 数组/对象结构）、`shell:open-external`（协议）、`shell:open-path`/`fs:exists`（类型+长度）、`import:parse-references`（类型 + `.bib/.json` + 32MB + `statSync` 探存在）、`dialog:pick-path`（kind 白名单）、`export:report`（类型 + 格式白名单）、`settings:update`（对象 + hotkey/dataDir 校验） | ✅ 已修复 |
| **M-9** | `Paper` 新增 `year`（`types.ts:131`），`addPaper` 落库（`store.ts:738`），快速导入 `doImport` 写入年份且非法值按空（`PaperQuickImportModal.tsx:90-92`），`PaperEditModal` 增年份输入框 | ✅ 已修复 |

### Minor / Nit（抽验）

- **m-1** `exporter.ts:79-85` 扩展名整体替换 ✅（`周报.md` + docx → `周报.docx`，不再 `周报.md.docx`）
- **m-2** `citation.ts:132 escapeBibValue` + `151` citekey 白名单 + 空键回退 `ref` ✅
- **m-3** `ReferenceEditModal.tsx:90-101` `Number.isInteger` + 1500..今年+1 ✅
- **m-4** `ReferenceImportModal.tsx:89-100` `batchSeen` 批内去重（DOI→citekey→标题+年份 同序键）✅
- **m-5** `report.ts:200-202 fillTemplate` 函数式替换 + 全局正则 ✅（`$&` 不再被当替换模式，重复占位符全部替换）
- **m-6** `insights.ts:125-128` `days < 0` 计入 `excluded` ✅
- **m-7** `Dashboard.tsx:25` / `IdeasPage.tsx:40` 改为订阅式取 hotkey ✅
- **m-8** `store.ts:207-222 safeWriteJson` 异步化 + 100/200/300/400ms 退避，`updateSettings`/`saveCollection`/`persistStoreMeta` 随之异步化并在 IPC 层 await ✅
- **m-10** `fs:exists-many` 批量 IPC（主进程 `fsp.access` 并发、上限 500），`ToolboxPage` 轮询 60s → 300s + 窗口聚焦触发 ✅
- **m-11** CSP `img-src` 收紧为 `'self' data:` ✅ —— **但有副作用，见 V-8**
- **m-14** `index.ts:108-116` `isLoading()` → `once('did-finish-load')` ✅
- **m-15** `store.ts:975` 去重条件已按 `type === 'paper' && title`（含正式条目）✅
- **m-16** Onboarding + SettingsPage 各增明文/备份/双端编辑告知 ✅
- Nit：`doQuit()` 用顶部导入的 `app` ✅；`ReportsPage` 改用 `uid()` ✅；`AchievementsPage` 改 `useEffect + defaultsRef` ✅；`CalendarPage:288` Hook 提到组件顶部 ✅；`ui.tsx` `Modal` 用 `onCloseRef`、依赖数组 `[open, dismissable]` ✅；`storeMeta.savedAt` 取文件自身 mtime ✅；托盘图标按短边等比缩放 ✅

---

## 三、新发现的问题

### [V-1] Major — 导航白名单仍允许任意 `file:` URL，C-1 第①层存在缺口

- **位置**：`src/main/index.ts:45-53`（`isAllowedUrl`）、`68-70`（`will-frame-navigate`）
- **成因**：`isAllowedUrl` 只判 `new URL(raw).protocol === 'file:'`，而**同仓库的 `isTrustedSender`（`ipc.ts:45-48`）已经把判据收敛到 `../renderer/` 目录**——两处判据不一致，第①层留在「整个 file: 协议」的宽口径上。
- **实测证据**（把正则原文从依赖里抠出来单独跑，不靠读代码猜）：

  ```
  DOMPurify 默认 ALLOWED_URI_REGEXP（node_modules/dompurify/dist/purify.cjs.js:325）
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i

  KEEP   https://example.com/ok
  STRIP  file:///C:/evil.html            ← file: 被剥除，这一路是安全的
  STRIP  file://evil.com/share/x.html    ← 同上
  KEEP   //evil.com/payload.html         ← 协议相对形式，被保留
  KEEP   \\evil.com\share\x.html         ← 反斜杠形式，被保留
  STRIP  data:text/html,...              ← 被剥除，data: XSS 不成
  STRIP  javascript:alert(1)             ← 被剥除

  同仓 isAllowedUrl 实测：
  true   file:///C:/evil.html
  true   file://evil.com/share/x.html    ← 放行
  false  https://evil.com
  ```

- **攻击路径**：日志 / 灵感里贴一条 `[详情](//evil.com/payload.html)` → `marked` 产出 `<a href="//evil.com/payload.html">` → DOMPurify 保留（见上）→ 用户点击 → Chromium 以 `file://` 为基址解析成 `file://evil.com/payload.html` → `will-navigate` 判为**允许** → 窗口导航到 UNC 路径。
- **影响**：
  1. Windows 会向攻击者主机发起 **SMB 连接**（NTLM 哈希外泄 / 中继面）——这一步不需要内容加载成功；
  2. 窗口被替换为攻击者页面（应用内钓鱼 / 需用户重启恢复）；
  3. 该页面确实会拿到 `window.api`，但**第②层 `isTrustedSender` 会拒绝**（frame.url 不以 renderer 目录开头）→ 全部调用抛 `unauthorized`。
- **定性**：**第①层被绕过，第②层兜住能力**。所以是 Major 而不是 Critical——但第①层存在的意义就是「不让窗口跑出应用」，现在没做到。
- **正确方案**（与 `ipc.ts` 用同一判据，一次收敛两处）：

  ```ts
  // src/main/index.ts
  import { pathToFileURL } from 'node:url'
  // …
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  // 只认本应用 renderer 目录，而不是整个 file: 协议
  const rendererDir = pathToFileURL(path.join(__dirname, '../renderer') + path.sep).href
  const isAllowedUrl = (raw: string): boolean => {
    if (devUrl && (raw === devUrl || raw.startsWith(`${devUrl}/`))) return true
    return raw.startsWith(rendererDir)
  }
  ```
  并让 `will-frame-navigate` 复用同一函数（现状已是复用，改函数即可）。

### [V-2] Major — 更新的「立即重启安装」绕过了落盘握手，M-4 未覆盖该出口

- **位置**：`src/renderer/src/updateStore.ts:129-135` → `preload/index.ts:50` → `src/main/ipc.ts:390-392` → `updater.ts:147-149`
- **成因**：`app:quit` 走的是「发 `app:quit-requested` → 渲染层 flush → `confirmQuit`」的握手；而 `update:install` 直接 `autoUpdater.quitAndInstall()`，**不经过这条通道**。此时只有 `App.tsx:105-106` 的 `beforeunload`/`pagehide` 兜底，而它们在 unload 阶段发起的是 async IPC，无法保证在进程退出前送达。
- **影响**：用户点「立即重启安装」时，可能丢失最后 ≤800ms 的防抖编辑——**与 M-4 修掉的正是同一个洞，只是换了个出口**。
- **正确方案**：在发起安装前先 flush（两行改动）：

  ```ts
  // src/renderer/src/updateStore.ts
  installNow: async () => {
    try {
      await useStore.getState().flushPendingSaves()   // ← 加这一行
      await window.api.installUpdate()
    } catch (err) { /* … */ }
  },
  ```
  更彻底的做法是把 `update:install` 也改成走 `app:quit-requested` 握手（安装动作放到 `app:confirm-quit` 之后），保证只有一条退出路径。

### [V-3] Minor — 热键冲突哨兵 `__CONFLICT__:` 泄漏进 UI 状态

- **位置**：`ipc.ts:206` 返回 `{ ...getSettings(), hotkey: '__CONFLICT__:' + p.hotkey }`；`renderer/store.ts:310-314` 无条件 `set({ settings: next })`
- **现象**：保存热键失败后，`SettingsPage.tsx:285` 的 `<kbd>{settings.hotkey}</kbd>`、以及 Dashboard / Ideas 页的快捷键提示会显示 `__CONFLICT__:Ctrl+K` 这串内部标记，直到重启应用。
- **范围**：**仅显示错误，不会写盘**（`settings.json` 仍是旧值，后续 `updateSettings({theme})` 这类局部 patch 也不会把它带进去）。报告里没提这一点。
- **正确方案**：主进程改为返回结构化结果而不是往字段里塞哨兵，例如 `{ settings, hotkeyConflict: string | null }`；或渲染层在识别到前缀时**不采纳**该 patch（保留 `get().settings`）。

### [V-4] Minor — 损坏集合的「自动恢复」实际要重启才生效

- **位置**：`store.ts:297`（`if (brokenCollections.has(name)) continue`）
- **事实**：轮询入口 `checkExternalChanges` 对损坏集合**直接跳过**，所以会话内即使外部把文件修好了，应用也不会发现；`brokenCollections.delete(name)` 只在 `loadAllWithIssues` 成功时执行，而它只被 `store:bootstrap` / `store:choose-dir` 触发（即**重启或换目录**）。
- **影响**：报告中「应用会在检测到文件恢复后自动继续保存」应改为「**重启后**自动继续」。当前表现是：文件已修好，但本次会话内该集合的保存一直抛 `DATA_CORRUPT`。
- **正确方案**：让损坏集合也参与轮询检测（例如按文件大小/mtime 变化试解析一次），或在 `DataHealthBanner` 上提供「重新检测」按钮触发一次 `bootstrap`。

### [V-5] Minor — `loadIssues` 追加不去重，提示条会堆重复行

- **位置**：`renderer/store.ts:300-302`（`loadIssues: [...s.loadIssues, ...result.issues]`）
- **成因**：`loadAllWithIssues` 每次都会为同一批问题记录重新产出**同一条** `issue`（同 collection/kind/detail），而这条追加路径没有去重；`checkExternalChanges` 每 30 秒一轮、任何集合有变更就会带上全量 issues。对比之下 `persistCollection`（`store.ts:174-176`）反而做了去重。
- **影响**：`DataHealthBanner` 里出现大量重复行；`loadIssues` 数组无界增长。
- **正确方案**：按 `collection + kind + detail` 去重后合并。

### [V-6] Minor — mtime 判据两端的固有误差（C-2 的适用边界）

- **假阳性**：网盘客户端（OneDrive / Dropbox 等会重写文件或触碰 mtime）在单机场景下也可能让 `storeMeta` 与磁盘 mtime 不一致 → 本地这次修改被**拒绝写盘**并转入 `backups/local-*.json`，同时界面数据被重载成磁盘版本，即「刚写的改动从界面上消失」。这正是报告请我重点确认的那一项：**在单机 + 活跃网盘客户端的组合下，误报是可能的**。
- **假阴性**：容差是 `> 1`（毫秒级），而 FAT / exFAT / 部分网络盘的 mtime 粒度是 2 秒 → 2 秒内的外部改动可能漏判。
- **正确方案**：冲突判定补一层内容判据（`size` + 哈希，或直接比对文件内容），命中后再决定是否报冲突；冲突时提供「保留磁盘版本 / 保留本机版本 / 两者都留」的选择，而不是默认重载磁盘版本（对目标用户而言，手动合并 JSON 的门槛偏高）。

### [V-7] Minor — `tools` / `vocab` 未做结构校验

- **位置**：`store.ts:152-163`
- **事实**：只做 `t.groups ?? []` / `v.tags ?? []` 这类**空值**兜底；若这两个字段是非数组（如字符串 `"abc"`），`??` 不会兜住 → 渲染层 `.map` 会抛错。报告的「逐条结构校验（9 个数组集合）」表述准确，但未说明 tools/vocab 属例外。
- **缓解**：已有 `ErrorBoundary` 兜底，不会白屏。
- **正确方案**：同样加 `Array.isArray` 判断，非法时回退默认值并上报 `shape`。

### [V-8] Minor（潜在功能回退）— CSP 收紧后「网址收藏站点图标」整体失效，需你决策

- **位置**：`src/renderer/index.html:8`（`img-src 'self' data:`）+ `ToolboxPage.tsx:43-74`
- **事实**：`ToolIcon` 是 `new URL('/favicon.ico', item.target)` 后直接 `<img src={fav} onError={…}>` 直连站点取图标。CSP 收紧后，**所有 http(s) 收藏的 favicon 都会被拦掉**，一律走 `onError` 回退默认图标。也就是说这不是「部分降级」，而是**该功能在所有网址收藏上都不再工作**。
- **正面效果**：顺带封掉了「渲染侧直连外站抓 favicon」这条出口（SSRF/探测面收敛）。
- **需要你显式决策**（三选一）：
  1. **接受现状**：安全优先，网址收藏统一显示默认图标；
  2. **主进程代理**：复用 `url:fetch-meta` 那套 `assertSafeUrl` 取回 favicon，以 `data:` 交给渲染层（既恢复功能又不开口子）——推荐；
  3. 放宽 `img-src` 到 `https:`：恢复功能，但重新引入外联面。

### [V-9] Minor — SSRF 防护的结构性残留

- **位置**：`ipc.ts:312-318`（`assertSafeUrl`）、`286-309`（`isPrivateIp`）
- **问题 1（检查与连接不是同一地址）**：`dns.lookup(u.hostname)` 默认 `all: false`，**只取一条**地址做判定，而 `fetch` 会自行**再解析一次**并可能选中另一条 → 多 A 记录场景只校验了第一条；理论上还存在 DNS rebinding 的时间窗。
- **问题 2（IPv6 判定按前缀，覆盖不全）**：我把 `isPrivateIp` 抽出来单独跑，实测：

  ```
  BLOCK  169.254.169.254   127.0.0.1   10.0.0.5   192.168.1.1   172.16.0.1
  BLOCK  100.100.100.200（阿里云元数据，被 CGNAT 段覆盖）   0.0.0.0
  BLOCK  ::1   fd00::1   fe80::1
  ALLOW  ::ffff:127.0.0.1            ← IPv4-mapped 形式未覆盖
  ALLOW  ::ffff:169.254.169.254      ← 同上（元数据地址）
  ALLOW  ::ffff:7f00:1  64:ff9b::7f00:1  ← NAT64 形式未覆盖
  ALLOW  198.18.0.1  192.0.0.1  203.0.113.5（非内网，影响低）
  ```
- **定性**：`::ffff:` 形式能否被实际利用，取决于 DNS 服务器是否原样返回 IPv4-mapped 的 AAAA 记录（我未在本机复现到「某域名解析出 `::ffff:127.0.0.1`」这一现象），因此按**加固缺口**记录，不按「已证实绕过」记。问题 1 是结构性事实。
- **正确方案**：`dns.lookup(host, { all: true })`，**任一**地址属私网即拒绝；判定前先把 IPv4-mapped/NAT64 归一化成 IPv4 再判；如要彻底消除 TOCTOU，可解析后以 IP 直连并保留 `Host` 头。

---

## 四、已核实「未发现问题」的部分（避免被误读为漏审）

- **M-6 的规范方案确实未做**：`electron-builder.yml` 的 `git diff` 为空，`publisherName` 仍不存在 → electron-updater 仍只做同源 sha512、不做 Authenticode 校验。`autoInstallOnAppQuit = false` 已落地，因此实际风险被压到「用户显式点击才安装」。报告对此的交代是**诚实**的。
- **依赖漏洞的实际暴露面**：17 项全在 devDependencies；其中 high 的 `app-builder-lib` 条目对应 **AppImage** 场景（本项目只出 NSIS/zip，不适用），critical 的 `tar` 位于 `node-gyp` / `@electron/rebuild` 构建链（仅构建期解包时可达）；**运行时依赖 0 项**。这与报告结论一致。
- **旧数据兼容**：`Paper.year` 是新增字段，`store.ts` 的校验器**没有**把它列为必填 → 历史 `papers.json` 不会被判为坏记录；读取处（`PaperEditModal.tsx:65`）也做了 `undefined` 检查。`Reference.year` 沿用原类型，未受本次改动影响。
- **导出管线未受影响**：`ProjectDetail.tsx` 与 `UpdateModal.tsx` 的 `marked + DOMPurify + dangerouslySetInnerHTML` 管线保持原样，DOMPurify 默认配置照旧（未放宽 `ALLOWED_URI_REGEXP`）。
- **构建配置未被动过**：`electron.vite.config.ts` 未修改，preload 仍走 `externalizeDepsPlugin` + CJS 输出，与 `sandbox: true` 兼容。

---

## 五、结论与建议顺序

**修复质量**：C-1 / C-2 是**真实落地的结构性修复**（不是配置点缀或注释式修补），且第②层 sender 校验把 C-1 的爆炸半径压到了「无能力」。验证链完整（类型检查 / 构建 / 单测 / 审计四项我全部复跑一致），对未做项（代码签名、Electron EOL、按实体合并方案）的交代也如实标注。**这一点值得肯定——多数「修复报告」在未做项上会含糊过去。**

**但不要直接合并**，先处理两条 Major：

| 顺序 | 项 | 改动量 | 理由 |
|---|---|---|---|
| 1 | **V-1** 导航白名单 pin 到 renderer 目录 | 约 6 行 | 补齐 C-1 第①层，消除 SMB 外联与窗口被替换 |
| 2 | **V-2** 安装前 flush | 约 2 行 | 与 M-4 同源，堵住最后一个丢数据的出口 |
| 3 | V-3 热键哨兵不进 UI 状态 | 约 5 行 | 小改，避免内部标记外显 |
| 4 | V-5 `loadIssues` 去重 | 约 3 行 | 提示条可读性 |
| 5 | V-6 冲突判据加内容哈希 | 中等 | 决定 C-2 在单机+网盘下是否误报 |
| 6 | V-4 / V-7 损坏集合恢复与 tools/vocab 校验 | 小～中等 | 数据健壮性 |
| 7 | V-9 SSRF 加固（`all: true` + IPv6 归一化） | 小 | 纵深防御 |
| 8 | **V-8 favicon 方案决策** | 取决于选项 | 需要你先拍板是接受降级还是走主进程代理 |

**复审建议**：改完把 `src/main/index.ts`、`src/renderer/src/updateStore.ts`、`src/main/ipc.ts`（`settings:update` 与 `isPrivateIp`／`assertSafeUrl`）发我，我按同一套方法复核——重点会验：① 改后的 `isAllowedUrl` 是否真的挡住 `file://evil.com/...` 与 `//evil.com/...`（我会用同一探针重跑）；② `update:install` 是否只剩一条退出路径；③ IPv6 归一化是否覆盖 `::ffff:0:0/96` 与 NAT64 前缀。
