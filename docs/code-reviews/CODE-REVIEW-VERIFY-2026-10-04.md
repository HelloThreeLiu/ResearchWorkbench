# 第三轮复审报告 — 对 `CODE-REVIEW-FIX-2026-09-30.md`（第二轮）的独立验证

- **复审日期**：2026-10-04
- **复审对象**：第二轮修复（V-1 ~ V-9 + 自查 1 项），涉及 8 个文件的增量改动（累计 `git diff --stat`：32 文件 / +1064 / −421）
- **复审方式**：不采信报告结论。① `git diff --stat` 比对规模；② 通读实现（不只读 diff）；③ **把判定逻辑抽出来跑探针**并沿真实管线验证（`dns.lookup` 实际返回什么、`new URL` 实际怎么规范化）；④ 复跑 typecheck / build / test；⑤ 逐项做第一轮 39 项的回归检查
- **复审结论**：**✅ 有条件通过 — V-1 ~ V-9 全部真实落地，两条 Major 已封闭；建议顺手修掉 N-1、N-3 后合并**
  本轮 9 项无一虚报；第一轮 39 项无回归；新发现 9 条均为 Minor/Nit（无新的 Critical/Major）。报告对未做项（代码签名、Electron EOL、按实体合并、DNS rebinding）的交代依旧诚实。

---

## 一、验证记录（我亲自复跑）

| 项目 | 结果 |
|---|---|
| `npm run typecheck`（node + web） | 退出码 0 ✅ |
| `npm run build` | 退出码 0；main / preload **2.75 kB** / renderer **939.26 kB** ✅ |
| `npm test` | `tests 4 / pass 4 / fail 0` ✅ |
| preload 产物格式 | 仍为 CJS（`"use strict"; require("electron")`），`require("node:*")` 计数 **0** → `sandbox: true` 依然成立 ✅ |
| `git diff --stat` | 32 文件 / +1064 / −421（第一轮为 31 / +883 / −389，增量约 181 行，与报告自述的 8 个文件范围吻合）✅ |

---

## 二、逐条复核（V-1 ~ V-9）

### V-1 Major — 导航白名单收敛到 renderer 目录 ✅ 已修复（探针已验证）

`index.ts:47-52` 已改为 `raw.startsWith(rendererDir)`，其中 `rendererDir = pathToFileURL(path.join(__dirname, '../renderer') + path.sep).href`——与 `ipc.ts:46` 用**同一判据**，两处口径终于一致。

我把该函数逐字复制出来跑（打包模式 `devUrl = undefined`）：

```
rendererDir = file:///F:/VibeCodingProject/ResearchWorkbench/out/renderer/
ALLOW  本应用首页            file:///.../out/renderer/index.html
ALLOW  本应用资源            file:///.../out/renderer/assets/index-abc.js
DENY   本地任意 html         file:///C:/evil.html                    ← 第二轮前是 ALLOW
DENY   UNC（协议相对解析结果） file://evil.com/share/x.html            ← 第二轮前是 ALLOW，C-1 主攻击路径
DENY   UNC 反斜杠形式        file://evil.com/C$/x.html
DENY   兄弟目录 renderer-evil file:///.../out/renderer-evil/index.html  ← 尾分隔符生效
DENY   路径前缀欺骗          file:///.../out/rendererX/index.html      ← 尾分隔符生效
DENY   http 外站            https://evil.com/x
```
dev 模式同样正确：`http://localhost:5173/` 放行，`http://localhost:51730/x` 拒绝（`${devUrl}/` 的斜杠挡住了端口前缀欺骗）。

**结论**：第二轮指出的 SMB 外联 + 窗口替换路径已堵死。

### V-2 Major — 安装前落盘 ✅ 已修复

`updateStore.ts:130-138` 在 `installUpdate()` 之前 `await useStore.getState().flushPendingSaves()`。与 `app:quit` 的握手互补，覆盖了「立即重启安装」这条出口。
未采纳「把安装改走 `app:quit-requested` 握手」的彻底方案——**我认同这个取舍**：`quitAndInstall` 自带安装语义，硬套握手会引入一份新的状态机；「渲染层先 flush + `beforeunload` 再兜一层」在工程上等效且更简单。

### V-3 Minor — 哨兵不进 UI 状态 ✅ 已修复（但引入一处新脆弱点，见 N-1）

`renderer/store.ts:318-326` 命中 `__CONFLICT__:` 时**不再** `set({ settings: next })`，只把结果回传给调用方；`SettingsPage.tsx:151-156` 用它展示错误。UI 不再显示内部标记。

### V-4 Minor — 损坏集合会话内自动恢复 ✅ 已修复

两处配合：① `loadAllWithIssues` 的 catch 分支记录「损坏时刻」的 mtime（`store.ts:230-234`）；② `checkExternalChanges:366-377` 对损坏集合在 mtime 变化后**试解析一次**，成功即推入 `changed`，随后 `loadAllWithIssues` 会清除损坏标记并载入数据。提示条文案已同步改为「修复保存后应用会自动检测并恢复」（`store.ts:226,276`）。
**不再需要重启**，报告描述与实现一致。

### V-5 Minor — issues 去重 ✅ 已修复

`renderer/store.ts:303-310` 按 `${collection}|${kind}|${detail}` 建 `Set` 去重合并。因为同一问题的 detail 是稳定字符串，去重有效，轮询不再堆重复行。

### V-6 Minor — mtime 假阳性 + 冲突处置改为「本机继续生效」✅ 已修复（判定矩阵已逐格复现）

`store.ts:296-307` 的判定逻辑我抽出来跑了完整矩阵（6 格全中）：

```
CONFLICT  无基线（启动后新出现的外部文件）            ← 保护性冲突，不静默覆盖未知内容
WRITE     mtime 未变（自上次写入以来无人动过）
WRITE     mtime 变了但内容一致（网盘只触碰时间戳）    ← 这正是第二轮点名的假阳性，已消除
CONFLICT  mtime 变了且内容变了（真外部修改）
WRITE     mtime 差 1ms 以内
CONFLICT  有基线但无哈希（老版本 store-meta.json）    ← 向后兼容，按冲突处理，偏保守但正确
```

冲突处置改为：`conflict-*.json`（对方版本）+ `local-*.json`（本机修改）双留底 → **把基线更新为磁盘当前状态** → 抛 `DATA_CONFLICT` → 渲染层 `persistCollection(..., true)` **重试一次**落盘（`renderer/store.ts:164-173`，`isConflictRetry` 保证只重试一次、不循环）。

**这是一个语义变化，需要你确认**：第一轮是「对方版本胜出（重载磁盘版本）」，第二轮是「**本机版本胜出 + 对方版本进 backups + 醒目提示**」。两者都不丢数据（两份都在 `backups/`），但「谁是活数据」反过来了。报告的理由（「刚写的改动不再从界面消失」）站得住；代价是**在双机同时编辑时，最后保存的那台总是赢**，另一台必须去 `backups/` 手工比对。对目标用户（研究生）而言，JSON 手工合并的门槛仍然偏高——按实体 `id + updated_at` 自动合并仍是该做的那一步。

### V-7 Minor — tools / vocab 结构校验 ✅ 已修复

`store.ts:160-195`：`isPlainObject` + 逐字段 `Array.isArray`，非法项回退空数据 / 默认词汇库并上报 `shape`。原 `?? []` 兜不住非数组值的问题已消除。

### V-8 Minor — favicon 改走主进程代理 ✅ 已修复（采纳推荐方案）

新增 `url:fetch-favicon`（`ipc.ts:415-429`）：复用 `assertSafeUrl` + 新抽出的 `safeFetch`（`ipc.ts:136-156`，与 `url:fetch-meta` 共用），校验 `content-type` 以 `image/` 开头、≤256 KB，转 `data:` URL 返回。渲染层 `ToolIcon`（`ToolboxPage.tsx:43-84`）改为模块级 origin 缓存 + 该代理。
**CSP 没有放宽**（`index.html` 仍为 `img-src 'self' data:`），favicon 功能靠主进程取回 + `data:` 恢复——方向正确。
安全性上我确认了一点：即使服务端返回 `image/svg+xml`，`<img src="data:image/svg+xml,...">` 中的脚本**不会执行**，且 CSP `default-src 'self'` 禁止 `<object>` 等旁路，所以没有引入 XSS。

### V-9 Minor — SSRF 加固 ✅ 已修复（沿真实管线验证，比我第二轮估计的更彻底）

- `assertSafeUrl:127-133` 改为 `dns.lookup(u.hostname, { all: true })`，**任一**地址命中私网即拒 ✅（多 A/AAAA 记录不再只校验首条）。
- 新增 `normalizeIp:84-94`（v4-mapped 点分 / 十六进制、NAT64 点分 / 十六进制 → 还原成 IPv4）。

探针实测（18 例）：

```
BLOCK  169.254.169.254   127.0.0.1   10.0.0.5   192.168.1.1   172.20.0.1
BLOCK  100.100.100.200（阿里云元数据）   ::1   fd00::1   fe80::1
BLOCK  ::ffff:127.0.0.1   ::ffff:7f00:1   ::ffff:169.254.169.254    ← 第二轮点名的绕过，已封
BLOCK  64:ff9b::127.0.0.1   64:ff9b::7f00:1                          ← NAT64，已封
ALLOW  8.8.8.8   1.1.1.1   2001:4860:4860::8888
```

**顺带纠正我第二轮的一处悲观估计**：我当时说 IPv4-mapped / NAT64 形式「未覆盖，但是否可利用取决于 DNS/OS 是否原样返回」。现在我把真实管线跑通了，结论更确切：

```
new URL('http://[::ffff:169.254.169.254]/x').hostname → [::ffff:a9fe:a9fe]   （WHATWG 序列化成压缩十六进制形式）
dns.lookup('[::ffff:7f00:1]', { all: true })          → [{ address: '::ffff:127.0.0.1', family: 6 }]
```
即：**OS/DNS 层会把 v4-mapped 归一化成点分形式**，正好落在 `normalizeIp` 已覆盖的分支上。所以**常见且可达的写法全部被封**，剩余未覆盖的只有 `0:0:0:0:0:ffff:7f00:1`（未压缩）、`::7f00:1`（IPv4-compatible，已废弃）、`64:ff9b:0:0:0:0:7f00:1` 这类**到不了 `isPrivateIp` 的写法**——字符串形式的判定链条把它们在前面就归一化了。**因此 V-9 在本轮算实质关闭**；`normalizeIp` 只认压缩形式属健壮性欠账（见 N-9），不是可利用漏洞。
- 延后项（报告已声明，我认同）：DNS rebinding / TOCTOU 时间窗——彻底解法是「解析后按 IP 直连 + 保留 Host 头」，属独立加固。
- 报告的**有意不封 `198.18.0.0/15`** 我核查了理由：该段被 Clash TUN fake-ip 等本地代理广泛用作 DNS 应答，封掉会让代理用户的 `url:fetch-meta` / favicon 全部失效。这是**权衡决策**而非遗漏，报告标注清楚，符合「把决定权交给用户」的要求。

### 自查项（缺失集合文件被误判为损坏）✅ 已修复，且修得对

`store.ts:106-113 readCollectionFile` 改为「文件不存在 → 返回 null → 按空集合处理、不进损坏集合」，并在 `loadAllWithIssues:154-158` 清除该集合的历史损坏标记；`checkExternalChanges:362` 对不存在的文件 `continue`。
这条很重要：修复前，**老数据目录缺新版本集合文件（如 references.json）会被标记损坏、保存被 `DATA_CORRUPT` 永久阻断**——正是升级路径上的数据可用性问题。已恢复「文件缺失 = 空集合」语义。

---

## 三、第一轮 39 项的回归检查

逐点重读实现确认未被第二轮破坏：**未发现回归**。

- C-1 三层防线（`sandbox/contextIsolation/nodeIntegration` + 导航三钩子 + `isTrustedSender`）保持，且第①②层判据现已统一；
- C-2 的 `writeQueues` 串行队列、双份备份、`persistStoreMeta` 时机均未变；
- M-1/M-2 快捷键双保险、M-3 `parseInlineBold`（4 个用例仍全绿）、M-4 退出握手、M-5 SSRF、M-6 `autoInstallOnAppQuit=false`、M-7 `ErrorBoundary`/`DataHealthBanner`/增量重载、M-8 各通道白名单均在；
- Minor/Nit（m-1 ~ m-16 与 10 条 Nit）抽查未见失效；`electron-builder.yml` 仍未改（`publisherName` 依旧缺失），与报告自述一致；
- CSP 仍为收紧后的 `img-src 'self' data:`，favicon 靠主进程代理恢复而**不是**靠放宽 CSP——这条方向性判断我认可。

---

## 四、本轮新发现的问题

### [N-1] Minor（回归风险）— 哨兵前缀判断缺类型守卫，坏 `settings.json` 会让所有设置更新在渲染层抛错

- **位置**：`src/renderer/src/store.ts:320`、`src/renderer/src/pages/SettingsPage.tsx:152`
- **问题**：两处都是 `next.hotkey.startsWith('__CONFLICT__:')`。`loadSettings()`（`main/store.ts:64-83`）对 `settings.json` **不做类型校验**，`settings = { ...settings, ...parsed }` 直接把文件内容合进来——这就是现实存在的坏输入（你甚至愿意让用户把数据存成明文 JSON，用户手改 `userData/settings.json` 完全可能）。一旦 `hotkey` 是 `null` 或数字：

  ```ts
  next.hotkey.startsWith(...)   // TypeError: Cannot read properties of null (reading 'startsWith')
  ```
  连改主题、改备份开关都会跟着失败（`updateSettings` 是公共入口）。
- **讽刺点**：主进程 `index.ts:167-180` **专门对同一个输入做了防御**（`isValidAccelerator(hotkey)` 收 `unknown`，非法就弹窗跳过注册，注释还写着「不信任落盘配置」）——结果第二轮在渲染层新写的前缀判断把这条防线又漏回去了。
- **正确方案**（两处各一行）：

  ```ts
  // renderer/store.ts
  if (typeof next.hotkey === 'string' && next.hotkey.startsWith('__CONFLICT__:')) return next

  // SettingsPage.tsx
  if (!result.hotkey.startsWith('__CONFLICT__:')) { setHotkeyMsg({ ok: true, ... }) }
  else { ... }
  // 更稳：把「冲突」做成独立字段，而不是往 hotkey 里塞哨兵
  ```
  根治的做法是让 `settings:update` 返回 `{ settings, hotkeyConflict: string | null }`，哨兵字符串从协议里消失。

### [N-2] Minor（纵深防御）— `isAllowedUrl` 是「字符串前缀」判定，未规范化；函数本身会放行路径穿越写法

- **位置**：`src/main/index.ts:49-52`
- **实测**：

  ```
  现行=ALLOW  硬化=DENY   file:///F:/.../out/renderer/../../evil.html
  现行=ALLOW  硬化=DENY   file:///F:/.../out/renderer/../preload/index.js
  现行=ALLOW  硬化=ALLOW  file:///F:/.../out/renderer/..%2fevil.html
  ```
- **可达性（必须说清楚，不夸大）**：**我没能构造出可达的绕过。** 因为 `will-navigate` / `will-frame-navigate` 拿到的是 Chromium 已规范化的 GURL——我验证了 `new URL('file:///F:/r/renderer/%2e%2e/evil.html').href` 会折叠成 `file:///F:/r/evil.html`（`..` 与 `%2e%2e` 都会被解析掉），规范化后再过前缀判定就是 DENY。所以当前**能用**，但它的正确性完全依赖「调用方交给它的一定是规范化 URL」这条隐含前提——这种"靠调用方守规矩"的判定很脆。
- **正确方案**（先规范化再做路径包含判定，一次改稳）：

  ```ts
  import { fileURLToPath, pathToFileURL } from 'node:url'
  const rendererDirFs = path.join(__dirname, '../renderer') + path.sep
  const isAllowedUrl = (raw: string): boolean => {
    if (devUrl && (raw === devUrl || raw.startsWith(`${devUrl}/`))) return true
    let u: URL
    try { u = new URL(raw) } catch { return false }   // 规范化；解析不了就拒绝
    if (u.protocol !== 'file:') return false
    let fsPath: string
    try { fsPath = fileURLToPath(u) } catch { return false }
    const rel = path.relative(rendererDirFs, fsPath)
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
  }
  ```
  上面探针的「硬化」列就是这个实现，两条穿越用例均 DENY，正常页面/资源仍 ALLOW。

### [N-3] Minor — `backups/` 根目录的 `conflict-*` / `local-*` 无任何清理策略

- **位置**：`src/main/store.ts:312-319`（产生）、`pruneBackups:447-467`（只清理 `backup-*` **目录**）
- **问题**：`backups/` 下会不断新增 `conflict-<集合>-<时间戳>.json` 与 `local-<集合>-<时间戳>.json`，**没有任何保留上限或清理**。而这些文件又位于网盘同步目录里 → 每个设备都同步一份 → 文件数与体积随冲突次数线性增长，且**会被多设备重复放大**。对一个「记录几年科研数据」的目录来说，这是可观测的膨胀来源。
- **正确方案**：给冲突副本加保留策略（例如每集合最多保留最近 N 份，或按总大小上限 LRU 清理），并把它和 `pruneBackups` 放在同一次维护里：

  ```ts
  // 与 BACKUP_KEEP 同级的常量
  const CONFLICT_KEEP_PER_COLLECTION = 5

  function pruneConflictArchives(): void {
    const root = path.join(settings.dataDir!, 'backups')
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(root, { withFileTypes: true }) } catch { return }
    for (const prefix of ['conflict-', 'local-']) {
      const byCollection = new Map<string, fs.Dirent[]>()
      for (const e of entries) {
        if (!e.isFile() || !e.name.startsWith(prefix)) continue
        const key = e.name.slice(prefix.length).replace(/-\d{4}-.*\.json$/, '') // 去掉时间戳段
        byCollection.set(key, [...(byCollection.get(key) ?? []), e])
      }
      for (const list of byCollection.values()) {
        // 时间戳在文件名里可字典序排序，保留最新 N 份
        const sorted = list.sort((a, b) => b.name.localeCompare(a.name)).slice(CONFLICT_KEEP_PER_COLLECTION)
        for (const e of sorted) {
          try { fs.rmSync(path.join(root, e.name), { force: true }) } catch { /* 忽略 */ }
        }
      }
    }
  }
  ```
  在 `saveCollection` 产生冲突副本之后（或 `backupNow` 里）调用一次。

### [N-4] Minor — 冲突重试是 fire-and-forget，退出路径上不会被等待

- **位置**：`src/renderer/src/store.ts:171-173`（`void persistCollection(..., true)`）
- **问题**：重试不返回、不 await，所以 `flushPendingSaves()` 不会等它完成。若冲突恰好发生在「退出前最后一次 flush」，主进程可能先退出，本机这次改动只剩 `backups/local-*.json` 一份（**不丢，但没落到数据文件里**，用户得手动找）。
- **正确方案**：给重试一个可等待的句柄，让 flush 把它纳入：

  ```ts
  let retryChain: Promise<void> = Promise.resolve()
  // …
  if (!isConflictRetry) {
    retryChain = retryChain.then(() =>
      persistCollection(name, collectionOf(useStore.getState(), name), true)
    )
  }
  // flushPendingSaves 末尾
  await flushing
  await retryChain
  ```

### [N-5] Nit — 每次保存都把集合序列化两遍

- **位置**：`store.ts:336` 与 `340`
- **问题**：`safeWriteJson(file, data)` 内部 `JSON.stringify(data, null, 2)` 一次；紧接着基线又 `sha256(JSON.stringify(data, null, 2))` 一次。内容小的时候无所谓，但集合上限是 64 MB，大集合上这是**每次保存多一次可观测的主进程序列化开销**（并且同步阻塞事件循环）。
- **正确方案**：让 `safeWriteJson` 返回它写出的字符串，哈希复用：

  ```ts
  async function safeWriteJson(file: string, data: unknown): Promise<string> {
    const text = JSON.stringify(data, null, 2)
    const tmp = file + '.tmp'
    await fsp.writeFile(tmp, text, 'utf-8')
    // …rename 重试不变…
    return text
  }
  // 调用处
  const text = await safeWriteJson(file, data)
  storeMeta[name] = { mtimeMs: fs.statSync(file).mtimeMs, savedAt, sha256: sha256(text) }
  ```
  注意 `safeWriteJson` 现在被 `updateSettings` / `persistStoreMeta` 共用，返回值为 `Promise<string>` 对它们是兼容的（忽略返回值即可）。

### [N-6] Nit — `DataHealthBanner` 硬编码 Windows 反斜杠拼备份路径

- **位置**：`src/renderer/src/components/DataHealthBanner.tsx:35`
  ```ts
  void window.api.openPath(`${dataDir.replace(/[\\/]+$/, '')}\\backups`)
  ```
- **问题**：当前 Windows-only，能用；但 `dataDir` 若是正斜杠形式或 UNC 路径就会拼错，且一旦将来要出 macOS/Linux 版必然踩坑。
- **正确方案**：把「打开备份目录」做成一个主进程 IPC（`store:open-backup-dir`），路径拼接回到 `path.join` 那一边——渲染层本来也不该知道路径分隔符。

### [N-7] Nit — 同 origin 的多个收藏项会重复发起 favicon 请求

- **位置**：`ToolboxPage.tsx:58-70`
- **问题**：`faviconCache.has(origin)` 只有在首个请求 **resolve 之后**才为真，所以同一 origin 下不同路径的 N 个收藏项在首次渲染时会并发发出 N 个请求（`faviconCache` 记为 origin 键，但 `fetchFavicon` 拿的是 `item.target` 全 URL）。
- **正确方案**：加 in-flight 合并（用 Promise 做值）：`const faviconInflight = new Map<string, Promise<string | null>>()`，命中则复用同一个 Promise。

### [N-8] Nit — `url:fetch-meta` 的 `favicon` 字段已成死字段

- **位置**：`ipc.ts:370-411` 仍返回 `favicon`；渲染层只剩 `ToolBoxPage` 的 `onTargetBlur` 用 `meta.title`，`favicon` 已无消费方（图标改走 `url:fetch-favicon`）。
- **建议**：删掉 `favicon` 的解析与返回，或明确保留并在注释里说明用途；否则下次读代码的人会以为图标仍走这条路。

### [N-9] Nit（健壮性欠账）— `normalizeIp` 是「字符串形状」判定而非「16 字节前缀」判定

- **位置**：`ipc.ts:84-94`
- **问题**：只认压缩形式（`::ffff:` / `64:ff9b::` 开头的四类写法）。等价的未压缩写法 `0:0:0:0:0:ffff:7f00:1`、`64:ff9b:0:0:0:0:7f00:1`，以及 IPv4-compatible 的 `::7f00:1` 都不在覆盖内。**如第二节所述这些写法当前到不了这里**（`new URL` 序列化 + OS 归一化会把它们变成已覆盖的形式），所以这是欠账不是漏洞。
- **正确方案**（一次到位，不再依赖字符串形状）：把地址展开成 16 字节再判前缀——IPv4-mapped 判 `[0..9]=0 && [10]=0xff && [11]=0xff`，NAT64 判 `[0..11] = 00 64 ff 9b 00 00 00 00 00 00 00 00`，命中则取末 4 字节当 IPv4；其余 IPv6 判 `::1`、`fc00::/7`、`fe80::/10` 也走同样的字节前缀。`node:net` 的 `isIPv6` 只做校验不提供展开，展开需自己写约 20 行，或引入成熟库（如 `ipaddr.js`，零依赖）。

---

## 五、仍然开放、需要你决策或排期的事项

这些是**已知且被报告如实标注**的，不是新问题，列出以便收口：

| 事项 | 性质 | 建议 |
|---|---|---|
| 代码签名 + `publisherName`（M-6 规范方案） | 需成本决策（证书购买） | 现状「仅用户显式点击安装 + 关掉退出静默安装」已把风险压到可接受；有预算时再做 |
| Electron 34 已于 2025-06-24 EOL | 独立排期 | 涉及 electron / electron-builder / electron-vite 联动 + 回归；建议与下面的 dev 漏洞升级合并成一次 |
| devDependencies 17 项漏洞（含 1 critical `tar`、`app-builder-lib`/AppImage 那条 high） | 构建期依赖，**运行时 0 项** | 升 `electron-builder@26` 可一并清掉 `tar`；`extract-zip` 需升 `electron@44`——正好和 EOL 一起做 |
| 按实体（`id + updated_at`）自动合并 + 冲突处理对话框 | C-2 完整方案 | 当前「双留底 + 本机胜出 + 提示」不丢数据，但双机用户要手工合并 JSON；对目标用户门槛偏高，建议尽早做 |
| DNS rebinding / TOCTOU（`assertSafeUrl` 与 `fetch` 各解析一次） | 纵深防御 | 彻底解法是解析后按 IP 直连 + 保留 Host 头 |
| `store.ts` 拆分 / 渲染层 1000+ 行 store 按领域切分 / schema 版本与迁移 / CI 测试门禁 | 架构 | 中长期；`npm test` 已就位，把 `typecheck + build + test + audit` 串成 CI gate 是性价比最高的一步 |
| 其余单测（`fillTemplate`、`cleanTex`/`formatGB7714`、`parseBibTeXText`、`normalizeIp`/`isPrivateIp`） | 测试补齐 | 本轮 V-9 的教训正是「判定逻辑必须有回归用例」——`normalizeIp/isPrivateIp` 尤其值得补，它已经有 18 个可照抄的断言 |

---

## 六、最该先做什么

| 优先级 | 项 | 改动量 | 理由 |
|---|---|---|---|
| 1 | **N-1** 哨兵判断加类型守卫 | 2 行 | 唯一一条「本轮新引入、且会在真实坏输入下抛错」的问题；主进程已防、渲染层不该漏 |
| 2 | **N-3** 冲突副本加保留上限 | 约 25 行 | 网盘同步目录里的无界增长，越早加越省事 |
| 3 | **N-2** `isAllowedUrl` 改为规范化后判定 | 约 10 行 | 拆掉「靠调用方守规矩」的隐性前提 |
| 4 | **N-4** 重试纳入 flush 等待 | 约 6 行 | 收掉退出路径上最后一个「只落 backups」的窗口 |
| 5 | N-5 / N-6 / N-7 / N-8 / N-9 | 各几行 | 顺手清理 |

**复审结论：本轮可以进合并流程**——两条 Major（V-1、V-2）经探针与实跑验证已封闭，第一轮 39 项无回归，剩余问题均为 Minor/Nit 且都已给出可照抄的方案。建议把 N-1 与 N-3 并进本次提交，其余按上表排期。

**下一轮复审请把这几处发我**：`src/renderer/src/store.ts`（哨兵守卫）、`src/renderer/src/pages/SettingsPage.tsx:151-156`、`src/main/store.ts`（冲突副本清理 + 序列化复用）、`src/main/index.ts:47-52`。我会用同一套探针重跑：`isAllowedUrl` 的穿越/`%2e%2e` 用例、`normalizeIp` 的 18 用例，以及冲突判定矩阵的 6 格。
