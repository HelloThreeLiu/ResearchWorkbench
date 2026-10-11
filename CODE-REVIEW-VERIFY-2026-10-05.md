# 第四轮复审报告 — 对第三轮修复（N-1 ~ N-9）的独立验证

- **复审日期**：2026-10-05
- **复审对象**：第三轮修复，新增 `src/main/netGuard.ts`、`tests/netGuard.test.ts`，改动 8 个文件（累计 32 文件 / +1038 / −426）
- **复审方式**：不采信报告结论。① `git diff --stat` 比对规模；② 通读实现；③ **导入真实模块跑属性测试**（不复制函数，直接 `import` 后压）；④ 沿真实管线验证（`dns.lookup` 实际返回、`fileURLToPath` 实际行为）；⑤ 复跑全部命令
- **复审结论**：**✅ 通过，可以合并。** 第三轮 9 项全部真实落地且经独立验证，探针约 200 条断言 0 失败，未发现回归。本轮新发现 2 条 Minor + 4 条 Nit，均不阻塞合并。

---

## 一、验证记录（我亲自复跑）

| 项目 | 报告声称 | 我实测 | 判定 |
|---|---|---|---|
| `npm run typecheck`（node + web） | 通过 | 退出码 0 | ✅ |
| `npm run build` | 通过 | 退出码 0；`out/main/index.js` 55.5 kB（上轮 50.0 kB，增量即 netGuard + 新 handler） | ✅ |
| `npm test` | **7/7**（exporter 4 + netGuard 3） | `# tests 7 / pass 7 / fail 0`，7 条用例名逐条对上 | ✅ |
| 新增文件 | `src/main/netGuard.ts`、`tests/netGuard.test.ts` | 两者均存在，且 `netGuard` 常量（`0xff9b`/`0xffc0`）已进入打包产物 → 确实被主进程引用而非死代码 | ✅ |
| 旧定义清理 | 逻辑抽到 netGuard | `ipc.ts` 内已无 `isPrivateIp`/`normalizeIp`/`hexToIPv4`/`assertSafeUrl`/`safeFetch` 的残留本地定义，改为 `import { assertSafeUrl, safeFetch } from './netGuard'` | ✅ |

---

## 二、逐条复核 N-1 ~ N-9

### N-1 哨兵判断加类型守卫 ✅

`renderer/store.ts:327` 与 `SettingsPage.tsx:152` 均为 `typeof next.hotkey === 'string' && next.hotkey.startsWith('__CONFLICT__:')`。手改坏的 `settings.json`（`hotkey` 为 `null`/数字）不再让所有设置更新抛 `TypeError`，与主进程 `isValidAccelerator` 的防御对齐。

### N-2 `isAllowedUrl` 改为「规范化后路径包含」✅（17 + 14 条边界断言全过）

实现是 `new URL` → 校验 `file:` → `fileURLToPath` → `path.relative(rendererDirFs, fsPath)`，要求 `rel` 非空、不以 `..` 开头、非绝对路径。

**B1 探针（17 例，逐字复现函数）**：

```
ok  本应用首页 / 本应用资源                        → true
ok  目录穿越 ../..  → false      ok  ../../ 到 preload  → false      ok  单级 ..  → false
ok  %2e%2e 编码穿越 → false      ok  ..%2f 编码分隔符   → false      ok  %2e%2e%2f 组合 → false
ok  file:///C:/evil.html → false  ok  UNC → false  ok  UNC 另一形式 → false
ok  renderer-evil → false        ok  rendererX → false
ok  http 外站 → false   ok  about:blank → false   ok  data: → false   ok  空串 → false
```

**C 探针（真实安装路径形态，14 例全过）**——这类边界最容易被忽略，我专门压了一遍：

| 边界 | 结果 |
|---|---|
| 带查询串 / 片段的**自身**页面 `…/renderer/index.html?v=1`、`#a` | ✅ 放行（不会误伤应用自身） |
| 含**空格**的安装路径 `C:\Program Files\Gezhi Workbench\…\app.asar\out\main` | ✅ 自身页面放行、`../../` 被拒（`pathToFileURL` 的 `%20` 与 `fileURLToPath` 正确互逆） |
| 含**中文**的路径 `C:\Users\张三\AppData\…` | ✅ 同上（`%E5%BC%A0%E4%B8%89` 正确互逆） |
| 盘符/路径段**大小写**不同 `file:///f:/app/OUT/renderer/…` | ✅ 放行（`path.win32.relative` 大小写不敏感，不会把应用自己的页面误判为越界） |

**畸形 `file:` URL 一律失败即封闭（fail-closed）**：

```
file:///…/renderer/%2e%2e/evil.html  → new URL 折叠为 /F:/r/evil.html → DENY
file:///…/renderer/..%2fevil.html    → fileURLToPath 抛 ERR_INVALID_FILE_URL_PATH → DENY
file:///…/renderer/%2fetc%2fpasswd   → 同上抛错 → DENY
file://evil.com/x                    → fsPath=\\evil.com\x → path.isAbsolute → DENY
file:///…/renderer/%zz.html          → URI malformed → DENY
file:index.html                      → ERR_INVALID_FILE_URL_PATH → DENY
```

**N-2 关闭**，且不再依赖「调用方传入的一定是 Chromium 已规范化的 URL」这条隐含前提。

### N-3 冲突副本加保留上限 ✅（6 条断言全过）

`pruneConflictArchives()`（`store.ts:476-503`）在 `saveCollection` 产生冲突副本后调用（第 324 行）。我逐字复制该函数、作用于临时目录压了一遍：

```
分组键 conflict-tasks-2026-10-01T01-00-00-000Z.json → "tasks"          ← 正则剥时间戳正确
分组键 local-references-2026-12-31T23-59-59-999Z.json → "references"
ok  tasks conflict 保留 5 份（删的是最旧的 10-01~10-03，留下 10-04~10-08）
ok  tasks local 保留 3 份（不足 5 份时不删）
ok  projects conflict 保留 5 份（分组独立，互不干扰）
ok  backup-* 目录不受影响       ok  README.txt 不受影响
ok  无时间戳的 conflict-vocab-notes.json 保留（自成一组）
```

**关键点**：`sort((a,b) => b.localeCompare(a))` 后 `slice(5)` 丢弃的是**最新 5 份**、`rmSync` 删的是剩下的**最旧**若干——方向是对的（这一点如果写反会变成「每次冲突删掉刚生成的证据」，属于隐蔽的严重 bug，所以专门验证）。

### N-4 冲突重试纳入 flush 等待 ✅

`renderer/store.ts:150` 新增 `retryChain`，冲突时把重试挂上（`175-177`），`flushPendingSaves` 末尾 `await flushing; await retryChain`（`232-233`）。

我额外确认了**不会把退出流程挂死**：`persistCollection` 的 `.then(onFulfilled, onRejected)` 两个回调都返回 `void`，所以返回的 Promise **永不 reject** → `retryChain` 不会变成 rejected 链；重试本身以 `isConflictRetry = true` 调用，不会再次挂链 → 无循环、无未处理拒绝。主进程侧还有 2 s 兜底超时。

### N-5 复用序列化串做哈希 ✅

`safeWriteJson` 返回写出的文本（`store.ts:341 const written = await safeWriteJson(file, data)`），基线直接 `sha256(written)`（`345`），每次保存少一次全量 `JSON.stringify`。`updateSettings` / `persistStoreMeta` 忽略返回值，兼容。

### N-6 `store:open-backup-dir` ✅

`ipc.ts:150-154` 在主进程内 `path.join(dir, 'backups')` 后 `shell.openPath`；preload 暴露 `openBackupDir`；`DataHealthBanner` 改为 `window.api.openBackupDir()`，**不再 import `dataDir`、不再拼路径分隔符**。硬编码 `\\backups` 的隐患消除。

### N-7 favicon 请求在途合并 ✅（但缺拒绝处理 → 见 P-1）

`ToolboxPage.tsx:46,64-72` 新增 `faviconInflight: Map<origin, Promise>`，命中则复用同一 Promise。合并逻辑正确（同一 origin 的 N 个收藏项只发一次请求）。**但缺少拒绝分支**，见 P-1。

### N-8 `url:fetch-meta` 收窄为仅返回标题 ✅

`ipc.ts:293-309` 返回类型 `{ title: string | null }`，favicon 解析与返回已删除；preload 同步收窄；`ToolboxPage.onTargetBlur` 只消费 `meta.title`（否则回退域名）。死字段清除干净，没有遗留消费方（typecheck 通过佐证）。

### N-9 `netGuard.ts` + 字节级判定 + 回归用例 ✅（本项验证最重，约 130 条断言全过）

我把 `isPrivateIp` **直接 import 进来压**（不是复制函数），核心是「**表示无关性**」属性——同一地址的任何写法必须给出同一结论：

```
A1) 13 个 IPv4 × 8 种 IPv6 写法 = 104 条断言全部一致
    ::ffff:d（点分）/ ::ffff:hi:lo（压缩十六进制）/ 0:0:0:0:0:ffff:hi:lo（未压缩）
    ::d（IPv4-compatible 点分）/ ::hi:lo
    64:ff9b::d / 64:ff9b::hi:lo / 64:ff9b:0:0:0:0:hi:lo
    覆盖 127.0.0.1、10.0.0.5、192.168.1.1、172.16.0.1、169.254.169.254、100.100.100.200、
    0.0.0.0、224.0.0.1、8.8.8.8、1.1.1.1、172.32.0.1（172.16-31 之外）、100.63.0.1（CGNAT 之外）、126.0.0.1

A2) IPv6 私网/保留：::1 ✓  :: ✓  fc00::/fd00::/fdff:ffff:: ✓  fe80::/febf:: ✓
    公网放行：2001:4860:4860::8888 ✓  2606:4700:4700::1111 ✓  2400:3200::1 ✓  64:ff9b::8.8.8.8 ✓

A3) 13 条畸形输入（''、':'、':::'、'1::2::3'、'::ffff:999.1.1.1'、'::ffff:1.2.3.4.5'、
    'gggg::1'、'12345::1'、'1:2:3:4:5:6:7:8:9'…）→ 均不抛错，按「非私网」兜底

A4) 方括号形式经真实调用链全部 BLOCK：
    dns.lookup('[::1]')                  → ::1              → BLOCK
    dns.lookup('[::ffff:7f00:1]')        → ::ffff:127.0.0.1 → BLOCK
    dns.lookup('[0:0:0:0:0:ffff:7f00:1]')→ ::ffff:127.0.0.1 → BLOCK
    dns.lookup('[64:ff9b::7f00:1]')      → 64:ff9b::7f00:1 → BLOCK
```

**第三轮报告说「未压缩写法、IPv4-compatible 均覆盖」——实测属实**，`expandIpv6` 的「`::` 压缩 + 内嵌 IPv4 尾段占位」实现在这 104 条等价写法上零偏差。第三轮我提的欠账（`normalizeIp` 只认字符串形状）已按建议一次到位。

`tests/netGuard.test.ts` 23 拦截 + 7 放行 + 3 非法输入，正是我上一轮建议「把这 18 条断言搬进 tests/」的落地，且**扩了未压缩/NAT64/v4-compatible 变体**。

### 自查项（缺文件误判损坏）✅

`readCollectionFile` 对不存在的文件返回 `null` → 按空集合处理、不进损坏集合；`checkExternalChanges` 对不存在文件 `continue`。老数据目录缺新集合文件的升级路径不再被 `DATA_CORRUPT` 卡死。

---

## 三、回归检查

**第三轮改动未破坏前两轮任何一条**，逐项确认：

| 不变量 | 现状 |
|---|---|
| `sandbox/contextIsolation/nodeIntegration` 三件套 | `index.ts:38-40` 原样 ✅ |
| preload 产物格式 | 仍为 CJS 且 `require("node:*")` 计数 0 → 沙箱兼容 ✅ |
| CSP | 仍为 `img-src 'self' data:`（**未因 N-6/N-8 放宽**）✅ |
| `autoInstallOnAppQuit = false` | 保持 ✅ |
| `BACKUP_KEEP = 30` / `pruneBackups` | 未被 `pruneConflictArchives` 影响（互不干涉，实测 backup 目录不被删）✅ |
| `__CONFLICT__` 哨兵协议 | 主进程仍在用，渲染层两处均有守卫 ✅ |
| M-3 加粗解析、M-2 快捷键校验、M-7 增量重载、m-10 批量探测 | 未触及 ✅ |

---

## 四、本轮新发现

### [P-1] Minor — favicon 在途合并没有拒绝分支，会留下未处理拒绝且该 origin 永久不显示图标

- **位置**：`src/renderer/src/pages/ToolboxPage.tsx:64-72`
- **问题**：清理与缓存都写在 `onFulfilled` 里：

  ```ts
  p = window.api.fetchFavicon(item.target).then((data) => {
    faviconCache.set(origin, data)
    faviconInflight.delete(origin)   // ← 只有成功才清理
    return data
  })
  ```
  `ipcRenderer.invoke` 在**渲染帧被销毁**（窗口关闭、dev HMR 重载、退出流程）时会 reject。一旦 reject：
  1. `faviconInflight` 里那条 **rejected Promise 被永久保留**（模块级 Map，直至整页重载）；
  2. `faviconCache` 未写入 → `faviconCache.has(origin)` 恒为 false → 之后每次挂载都命中那条被拒 Promise；
  3. 第 74 行 `void p.then(...)` **没有 rejection handler** → 每次复用产生一条未处理拒绝（DevTools/打包环境均会记录）。
- **影响**：控制台噪声；该 origin 的图标在本会话内永久不显示（需重载页面）。不影响数据与安全。
- **正确方案**（3 行）：

  ```ts
  p = window.api.fetchFavicon(item.target).then(
    (data) => {
      faviconCache.set(origin, data)
      faviconInflight.delete(origin)
      return data
    },
    () => {
      // 失败也清理在途表并写入缓存（null），避免每次挂载都复用被拒 Promise、反复产生未处理拒绝
      faviconInflight.delete(origin)
      faviconCache.set(origin, null)
      return null
    }
  )
  ```

### [P-2] Minor — 损坏集合的轮询重试绕过了 64 MB 上限

- **位置**：`src/main/store.ts:375`
- **问题**：`loadAllWithIssues` 走 `readCollectionFile`（有 `st.size > MAX_COLLECTION_BYTES` 保护），但 `checkExternalChanges` 里损坏集合的重试分支是裸的：

  ```ts
  JSON.parse(fs.readFileSync(file, 'utf-8'))   // 无大小判断
  ```
  而**超大文件正是会被标记为「损坏」的典型形态之一**（`readCollectionFile` 因超限抛错 → 进 catch → 标记损坏）。于是：一个 >64 MB 的损坏文件，每次 mtime 变化都会被整份读入主进程内存并 `JSON.parse`；若网盘客户端持续触碰该文件，就是每 30 秒一次的整份读 + 解析。
- **影响**：主进程内存尖峰与事件循环阻塞（`readFileSync`/`JSON.parse` 均同步），在最坏情况下（网盘持续同步）反复发生。
- **正确方案**（1 行，顺手也消掉重复逻辑）：

  ```ts
  if (mtimeChanged) {
    try {
      readCollectionFile(name) // 复用：内含 existsSync + 64MB 上限 + JSON.parse；超限/损坏即抛，落到下面 catch
      changed.push(name)
    } catch {
      /* 仍损坏：等待下次轮询 */
    }
  }
  ```

### [P-3] Nit（加固）— `isPrivateIp` 不识别方括号形式，是给未来调用者埋的坑

- **位置**：`src/main/netGuard.ts:66-84`
- **实测**：`isPrivateIp('[::1]') === false`。
- **可达性（不夸大）**：**当前不可达**。`assertSafeUrl` 只把 `dns.lookup` 的返回值喂给 `isPrivateIp`，而 OS 会把方括号剥掉并归一化——A4 探针对 4 种方括号写法实测全部 BLOCK。所以这不是漏洞，是**约定脆弱性**：`new URL('http://[::1]/').hostname` 返回的是带括号的 `'[::1]'`，哪天有人图省事写成 `isPrivateIp(u.hostname)`（或新加一处用 hostname 的校验），`http://[::1]/` 就会被判为公网。
- **正确方案**（入口收敛，1 行）：

  ```ts
  export function isPrivateIp(rawIp: string): boolean {
    // 兼容 URL.hostname 的方括号形式（http://[::1]/ → '[::1]'），避免调用者踩坑
    const ip = rawIp.startsWith('[') && rawIp.endsWith(']') ? rawIp.slice(1, -1) : rawIp
    // …原有逻辑
  }
  ```

### [P-4] Nit — 取一次 favicon 会做两次 DNS 解析

- **位置**：`src/main/ipc.ts:316-317`
- **问题**：显式 `await assertSafeUrl(url)` 之后又 `await safeFetch(new URL('/favicon.ico', base).toString())`，而 `safeFetch` 内部第一步就是 `assertSafeUrl` → 每次取图标 **2 次 `dns.lookup(all: true)` + 2 次 URL 解析**。
- **正确方案**：`new URL('/favicon.ico', url).toString()` 直接交给 `safeFetch` 即可（它自带校验）；或让 `safeFetch` 接受一个已校验 URL 的可选参数，把「路径拼接」这份便利保留同时只校验一次。

### [P-5] Nit — `pruneConflictArchives` 用 `localeCompare` 排序

- **位置**：`src/main/store.ts:493`
- **说明**：`localeCompare` 走 ICU 排序规则（`-` 等标点属可变字符）。当前文件名前缀一致、时间戳定宽，实测排序与时间序完全一致（B2 探针验证），**功能正确**；但用 `a < b ? 1 : -1` 更直观、且省掉 ICU 开销。属可选清理。

### [P-6] Nit（性能，可选）— 渲染层单包 939.6 kB，无代码分割

- 非本轮引入，仅作为你问「性能」时的现状记录：`out/renderer/assets/index-*.js` 939.61 kB 单 chunk，14 个页面组件全部静态 import。本地 `file://` 加载所以首屏影响可控，但若想再压启动解析开销，可对 `projects/tools/insights/achievements` 这些非首屏页做 `React.lazy` + `Suspense`（`App.tsx` 里已经按 `page.name` 分支渲染，改造面很小）。

---

## 五、已核查、判定「不需要处理」的部分

逐条给出理由，避免被误读为漏审：

| 项 | 判定 | 理由 |
|---|---|---|
| 6to4 `2002::/16`（如 `2002:7f00:1::1` 内嵌 127.0.0.1）放行 | 无需处理 | 6to4 的流量会发往 6to4 中继，不会落到本机 `127.0.0.1`；且 6to4 已在 RFC 7526 中被弃用 |
| IPv6 组播 `ff00::/8`（`ff02::1` 等）放行 | 无需处理 | 组播地址不提供 `http(s)` 服务，无法作为 SSRF 目标 |
| 已废弃 site-local `fec0::/10` 放行 | 无需处理 | RFC 3879 已废除该段，无实际部署（探针确认 `fe80::/10` 边界 `febf::` 拦截、`fec0::` 放行，语义正确） |
| IPv4 `198.18.0.0/15` 放行 | **有意的权衡** | Clash TUN fake-ip 等本地代理用它作 DNS 应答，封禁会让代理用户的元信息抓取全失效；报告已显式标注，我认可该取舍 |
| `192.0.2.0/24`、`198.51.100.0/24`、`203.0.113.0/24` 放行 | 无需处理 | IETF 文档示例段，非内网地址 |
| `192.0.0.0/24`（IETF 协议分配，含 NAT64 发现 192.0.0.170/171）放行 | 无需处理 | 非内网服务段；且这些地址在真实网络里不可路由 |
| `127.1`、`0x7f.0.0.1`、`2130706433` 这类简写 IPv4 | 无需处理 | WHATWG URL 解析器会先归一化成 `127.0.0.1`，再由 `dns.lookup` / 正则判定拦住（第三轮已实测） |
| `pruneConflictArchives` 会不会误删用户文件 | 已实测不误删 | B2 探针：`backup-*` 目录、`README.txt`、无时间戳的 `conflict-vocab-notes.json` 均保留；只删同一前缀 + 同一集合名 + 带时间戳且超出 5 份的文件 |
| `await retryChain` 会不会挂死退出 | 不会 | `persistCollection` 的两个回调都返回 `void` → 永不 reject；重试不再挂链 → 无循环；主进程另有 2 s 兜底 |

---

## 六、仍然开放（需你决策 / 排期，非本轮新增）

1. **代码签名 + `publisherName`**（证书成本）——现状「仅用户显式点击安装」已把风险压到可接受。
2. **Electron 34 EOL（2025-06-24）升级** ——建议与 **devDependencies 17 项漏洞**（1 critical `tar`、`app-builder-lib`/AppImage 那条 high）合并成一次：升 `electron@44` + `electron-builder@26` 可一并清掉 `extract-zip` 与 `tar`。运行时依赖仍为 0 漏洞。
3. **C-2 完整方案**：按实体（`id + updated_at`）自动合并 + 冲突对话框。当前「双留底 + 本机胜出 + 提示 + 保留 5 份」不丢数据，但双机用户仍需手工比对 JSON。
4. **DNS rebinding / TOCTOU**：`assertSafeUrl` 与 `fetch` 各解析一次；彻底解法是解析后按 IP 直连 + 保留 `Host` 头。
5. **CI 门禁**：`typecheck + build + test + audit` 串起来。现在已有 7 条测试，价值门槛已过。
6. **其余单测**：`fillTemplate`、`citation`（`formatGB7714`/`formatBibTeX`）、`parseBibTeXText`、`parseInlineBold` 之外的 `mdToParagraphs`。测试基建已就位。
7. **架构项**：`store.ts` 拆分、渲染层 1000+ 行 store 按领域切分、schema 版本与迁移机制。

---

## 七、结论与优先级

**结论：第三轮修复质量高，可以进合并流程。** 9 项全部落地，其中 N-2/N-3/N-9 这三项我做了**对抗性验证**（路径穿越与编码变体、清理逻辑方向、104 条地址等价写法），结果全部符合预期；`netGuard.ts` 的字节级判定比第三轮的字符串形状判定更本质，且带上了 33 条回归断言。未发现回归。

**仍需改进（均不阻塞合并）**：

| 优先级 | 项 | 改动量 | 理由 |
|---|---|---|---|
| 1 | **P-1** favicon 在途合并补拒绝分支 | 3 行 | 唯一一条「新引入且会产生未处理拒绝 + 功能静默失效」的问题 |
| 2 | **P-2** 损坏集合重试复用 `readCollectionFile` | 1 行 | 消除与 64 MB 上限的不一致，最坏情况是每 30 s 整份读 |
| 3 | **P-3** `isPrivateIp` 剥方括号 | 1 行 | 防未来调用者踩坑（当前不可达，属加固） |
| 4 | P-4 / P-5 / P-6 | 各几行 | 顺手清理（去重复校验、排序写法、按需分包） |

**下一轮若继续，只需发我**：`src/renderer/src/pages/ToolboxPage.tsx`、`src/main/store.ts:371-382`、`src/main/netGuard.ts:66`。我会复用本轮探针脚本回归：A1 的 104 条表示无关性断言、A3 的畸形输入、B2 的清理逻辑、C 组的路径边界。
