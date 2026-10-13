# 代码审查报告 — 格致 · 科研工作台（ResearchWorkbench）

## 审查概览

- **审查目标**：`F:/VibeCodingProject/ResearchWorkbench`（Electron 34 + React 18 + TypeScript + Zustand，主进程/预加载/渲染三层）
- **审查范围**：全量（`src/` 56 个文件 / 13,629 行）+ 构建与发布配置（`package.json`、`electron-builder.yml`、`electron.vite.config.ts`、`.github/workflows`），依赖漏洞审计未完成（见 [M-12]）
- **审查重点**（按用户要求）：输入校验、权限控制、数据处理、异常处理
- **总体评分**：**5.5 / 10**
- **合并建议**：⚠️ **修改后可合并**（必须先修 C-1、C-2）

### 风险摘要

这是一个**纯本地单机应用**，因此"没有服务端鉴权"不是问题；但它的安全边界恰好落在两个容易被忽视的地方：**渲染进程一旦导航到外部页面，预加载脚本会在该页面重跑，`window.api` 的全部 18 个 IPC 能力就整体交给了那个页面**（C-1）；而它的数据层是**整文件覆盖 + 仅靠 mtime 判断外部变更**，在任何一次本地编辑时都会把另一台设备经网盘同步过来的改动静默抹掉，并且此后再也不会提示冲突（C-2）。这两条叠加，使"装个应用记科研、靠网盘多机同步"的核心使用方式同时具备**被劫持**和**丢数据**两种失效模式。其余 Major 问题集中在快捷键（注册失败后旧键不恢复、可把单字母注册为全局热键）、导出（docx 加粗错位，已复现）、退出时丢失未落盘编辑、SSRF、自动更新无发布者签名校验，以及**运行时停更**（Electron 34 已于 2025-06-24 EOL）。

---

## 关键问题（Critical / Major）

### [C-1] 渲染进程无导航拦截 → 外部页面取得 `window.api` 全部权限 — 🔴 Critical

- **位置**：`src/main/index.ts:33-37`（`webPreferences: { sandbox: false }`）、`src/main/index.ts:23-60`（缺 `will-navigate` / `setWindowOpenHandler`）、`src/main/ipc.ts:28-262`（全部 handler 无 sender 校验）、触发点 `src/renderer/src/pages/ProjectDetail.tsx:472-473,596` 与 `src/renderer/src/components/UpdateModal.tsx:17-19,81`
- **问题**：
  1. 进展日志的 Markdown 与"更新日志"都用 `marked` + `DOMPurify` 渲染后 `dangerouslySetInnerHTML`。DOMPurify 是**正确**的（XSS 挡住了），但它**保留 `<a href="https://…">`**。用户在日志里贴一条 `[参考文献](https://…)`，点击后整个 `BrowserWindow` 会**导航**到该站点——因为没有注册 `will-navigate` 拦截，也没有 `setWindowOpenHandler` 拒绝 `window.open`。
  2. 关键点：**preload 脚本对窗口内每一次文档加载都会重新执行**。导航到 `https://evil.com` 之后，`contextBridge.exposeInMainWorld('api', api)` 同样会在那个远程页面里跑，于是该页面的 JS 拿到完整的 `window.api`。
  3. 同时 `sandbox: false` 让 preload 具备完整 Node 能力，且全部 IPC handler 都不校验消息来源（`_e.senderFrame` 为空判断）。
- **潜在后果**（远程页面能做什么，均基于现有 handler）：
  - `import:parse-references`：传入任意路径，主进程 `fs.readFileSync` 后解析——**任意文件读取原语**（返回 title/authors/venue 等字段）；
  - `store:save` / `settings:update`：**改写数据目录里的集合 JSON**，甚至先把 `dataDir` 改成任意目录再写固定文件名（`projects.json` 等）；
  - `shell:open-path`：传入任意路径，等价于**以当前用户权限启动任意 `.exe`/`.bat`**；
  - `shell:open-external`：只校验 `^https?://`，可把上面读到的内容拼进 URL 查询串**外带**到攻击者域名；
  - `fs:exists`：任意路径存在性探测；`app:quit`：远程页面可关掉应用。
- **根因**（推断）：这是 Electron 项目的典型遗漏——把注意力放在 CSP 和 DOMPurify（都做对了），但忽略了"**窗口会导航**"这条独立于 XSS 的路径。`sandbox: false` 多半是为了让 preload 能用 `node:path` 之类而顺手关的，实测 preload 只用了 `electron` 的 `contextBridge`/`ipcRenderer`，关沙箱并无必要。
- **正确方案**（三处，缺一不可）：

  ```ts
  // ① src/main/index.ts —— 锁死导航与开窗（最关键的 12 行）
  function createMainWindow(): void {
    mainWindow = new BrowserWindow({
      /* …其余不变… */
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: true,            // ← preload 只用 contextBridge/ipcRenderer，无需关沙箱
        contextIsolation: true,   // 显式写出（当前是默认值，写出来防止后人误改）
        nodeIntegration: false
      }
    })

    // 允许的同源来源：打包后是 file://，dev 下是 vite 的 http://localhost:5173
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    const isAllowedUrl = (raw: string): boolean => {
      try {
        const u = new URL(raw)
        if (devUrl && raw.startsWith(devUrl)) return true
        return u.protocol === 'file:'
      } catch {
        return false
      }
    }

    // 外部链接一律交给系统浏览器，绝不在应用窗口内打开
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })

    // 阻止渲染层导航离开应用（这是 C-1 的根因所在）
    mainWindow.webContents.on('will-navigate', (e, url) => {
      if (!isAllowedUrl(url)) {
        e.preventDefault()
        if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
      }
    })
    // 允许导航到新文档前再兜一层（History API 场景）
    mainWindow.webContents.on('will-frame-navigate', (e) => {
      if (!isAllowedUrl(e.url)) e.preventDefault()
    })
  }
  ```

  ```ts
  // ② src/main/ipc.ts —— 统一校验调用来源（放在 registerIpcHandlers 开头）
  import { app, ipcMain } from 'electron'
  import path from 'node:path'
  import { pathToFileURL } from 'node:url'

  /** 只接受来自本应用窗口、且 URL 属于应用自身的 IPC 调用 */
  function isTrustedSender(e: Electron.IpcMainInvokeEvent): boolean {
    const frame = e.senderFrame
    if (!frame) return false
    const url = frame.url
    if (url.startsWith('file://')) {
      const rendererDir = pathToFileURL(path.join(__dirname, '../renderer')).href
      return url.startsWith(rendererDir)
    }
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    return Boolean(devUrl && url.startsWith(devUrl))
  }

  function handle<K extends unknown[]>(
    channel: string,
    fn: (e: Electron.IpcMainInvokeEvent, ...args: K) => unknown
  ): void {
    ipcMain.handle(channel, (e, ...args) => {
      if (!isTrustedSender(e)) {
        console.warn(`[ipc] 拒绝不可信来源调用 ${channel}: ${e.senderFrame?.url ?? '(no frame)'}`)
        throw new Error('unauthorized')
      }
      return fn(e, ...(args as K))
    })
  }
  // 之后把所有 ipcMain.handle('x', …) 换成 handle('x', …)，即可一次性给全部通道加上来源校验
  ```

  为什么这样是对的：CSP/DOMPurify 防的是"注入脚本"，而 `will-navigate` 防的是"把整个窗口交给别人"——两者是正交的防线。来源校验则是最后一道"即使 preload 泄漏也不认账"的兜底，代价只有几行。

- **另外**：日志里的 Markdown 外链建议在 `renderMarkdown` 后统一改写成走系统浏览器，例如给 DOMPurify 加 `hook` 把 `<a>` 换成 `<a rel="noreferrer" target="_blank">` 并在渲染层拦截点击调用 `window.api.openExternal`（配合 ① 的双保险）。

### [C-2] 多设备并发写入整文件覆盖 + 无冲突检测 → 静默丢数据 — 🔴 Critical

- **位置**：`src/renderer/src/store.ts:143-161`（`schedulePersist` 全量写）、`src/renderer/src/store.ts:252-260`（`refreshExternal` 先 flush 再检测）、`src/main/store.ts:167-176`（`saveCollection` 无并发保护）、`src/main/store.ts:182-202`（`checkExternalChanges` 仅比 mtime）
- **问题与触发链**（按代码逐句推演）：
  1. 设备 B 把改好的 `tasks.json` 经坚果云同步到本机磁盘；
  2. 本机用户在 **30s 轮询/聚焦检测之前**做了任意一次编辑（写一条任务、勾一个框都算）；
  3. `schedulePersist` 800ms 后调用 `saveCollection('tasks', 本机内存里的旧数组)` → **整文件覆盖**，B 的改动当场消失；
  4. 紧接着 `refreshExternal` 执行 `flushPendingSaves()`（把上面这次覆盖**先落盘**）然后才 `checkExternalChanges()`；此时 `storeMeta['tasks'].mtimeMs` 正是刚写入的 mtime，与磁盘一致 → 返回 `null` → **不提示、不重载**；
  5. 每日/退出备份复制的是本机文件，因此备份里也是被覆盖后的版本 → 无法找回。
- **潜在后果**：双机（或与同学共用同步目录）场景下，另一端的改动**永久静默丢失**，且用户完全无感，直到某天发现数据不见。对"数据就是全部价值"的科研记录工具，这是最严重的一类失效。
- **根因**（推断）：数据层把"网盘同步"当成了文件复制，于是"最后一次写入获胜"被默认接受；而 `checkExternalChanges` 的设计假设是"本机不写时才可能有外部写"，一旦本机先写，检测能力就被自身破坏。`mtimeMs` 还有精度隐患：只放 1ms 容差（`src/main/store.ts:192`），FAT/exFAT 的 2s 时间戳粒度或某些同步客户端保留 mtime 的写法都会让"外部已改"被漏判。
- **正确方案**（两步走，第一步只需 ~20 行即可消除"静默"，第二步才是完整解法）：

  ```ts
  // ✅ 最小可用修法：写入前做乐观锁，发现磁盘被我方之外改过就拒绝覆盖并留冲突副本
  // src/main/store.ts
  interface StoreMeta {
    [collection: string]: { mtimeMs: number; savedAt: string; size?: number }
  }

  export function saveCollection(
    name: CollectionName,
    data: unknown
  ): { savedAt: string; conflictFile?: string } {
    if (!settings.dataDir) throw new Error('数据目录未配置')
    const file = dataFile(name)
    if (fs.existsSync(file)) {
      const disk = fs.statSync(file)
      const recorded = storeMeta[name]?.mtimeMs
      // 磁盘 mtime 与我们记录的"上次自己写完之后"的 mtime 不一致 → 期间有别人写过
      if (recorded !== undefined && Math.abs(recorded - disk.mtimeMs) > 1) {
        // ① 保留磁盘上那份（可能是另一台设备的成果），绝不覆盖
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        const conflict = path.join(settings.dataDir, 'backups', `conflict-${name}-${stamp}.json`)
        fs.mkdirSync(path.dirname(conflict), { recursive: true })
        fs.copyFileSync(file, conflict)
        // ② 把冲突抛给上层，由渲染层弹「冲突处理」对话框（选取/合并），而不是静默写入
        const err = new Error('DATA_CONFLICT') as Error & { conflictFile: string }
        err.conflictFile = conflict
        throw err
      }
    }
    safeWriteJson(file, data)
    /* …其余不变… */
  }
  ```

  ```ts
  // ✅ 完整方案：把"整文件 LWW"换成"按实体合并（id + updated_at）"
  // src/renderer/src/store.ts —— refreshExternal 不再无条件整体替换
  refreshExternal: async () => {
    if (get().needsOnboarding) return
    await flushPendingSaves() // 保留：先落本机改动，但主进程已能识别冲突
    const result = await window.api.checkExternalChanges()
    if (!result) return
    // 按集合、按 id 合并：同 id 取 updated_at 新者；对方新增的保留；本机未动的直接采纳
    const merged = mergeCollections(get() as unknown as AllCollections, result.data, result.changed)
    set({ ...merged })
    if (merged.__conflicts.length > 0) {
      // 交给人判断，而不是机器猜：弹出「以下 N 项两端都改过」让用户选择
      set({ pendingConflicts: merged.__conflicts })
    }
  }
  ```

  合并函数的核心只有一条规则——**新增按 id 并集，同 id 冲突按 `updated_at` 取新，真正"两端都改过"的才升级为人工确认**：

  ```ts
  function mergeById<T extends { id: string; updated_at: string }>(local: T[], remote: T[]) {
    const byId = new Map(local.map((x) => [x.id, x]))
    const conflicts: T[] = []
    for (const r of remote) {
      const l = byId.get(r.id)
      if (!l) byId.set(r.id, r)                       // 对方新增 → 采纳
      else if (r.updated_at > l.updated_at) byId.set(r.id, r) // 对方更新 → 采纳（同时记一条 conflicts 供 UI 展示）
      else if (l.updated_at > r.updated_at) conflicts.push(l)  // 本机更新 → 保留，但登记冲突
    }
    return { list: [...byId.values()], conflicts }
  }
  ```

  为什么这样是对的：网盘同步没有事务，任何"先到后到"的整文件替换都必然丢数据；唯一可靠的是**把同步单位的粒度降到实体（id）+ 让 `updated_at` 充当版本号**——而这两个字段项目里已经有（`src/shared/types.ts:27` 等），改造是"用起来"而不是"加字段"。同时 `saveCollection` 的乐观锁让"静默"变成"显式冲突"，即便暂不做合并，也不会再无声吞掉另一端的成果。

- **附带建议**：`dataDir` 选在网盘目录时（Onboarding 明确引导这么做），建议在设置页加一句"请勿在两端同时编辑、同步未完成时不要打开应用"；`storeMeta` 的 1ms 容差建议改为"记录写入后的文件大小 + mtime 双校验"，成本极低但能挡住 mtime 被保留的同步客户端。

### [M-1] 全局快捷键注册失败后，旧快捷键被注销且不再恢复 — 🟠 Major

- **位置**：`src/main/shortcuts.ts:9-23`、`src/main/ipc.ts:120-138`
- **问题**：`setQuickCaptureShortcut()` 先 `unregister(currentAccelerator)` 再 `register(新键)`；一旦新键被占用（`ok === false`），`currentAccelerator` 已被置为 `null`，旧键**没有重新注册**。`ipc.ts` 的失败分支只调用了 `updateSettings({ hotkey: prevHotkey })` 回滚**配置**，没有回滚**注册状态**。
- **潜在后果**：用户在设置里改快捷键 → 弹出"可能被其他软件占用" → 此后全局速记键（含默认 Alt+N）**完全失效**，必须重启应用才恢复；而设置页显示的仍是旧键，用户会以为"配置没变应该还能用"。
- **正确方案**：

  ```ts
  // src/main/ipc.ts —— 失败时把旧键注册回来，并与配置一起回滚
  if (patch.hotkey !== undefined) {
    const prevHotkey = getSettings().hotkey
    const prevOnPress = () => getMainWindow()?.webContents.send('quick-capture:show')

    // 先试注册新键，成功后再写配置（顺序反过来就不会出现"配置已改、注册已丢"的中间态）
    const ok = setQuickCaptureShortcut(patch.hotkey, prevOnPress)
    if (!ok) {
      setQuickCaptureShortcut(prevHotkey, prevOnPress) // ← 关键：把旧键找回来
      return { ...getSettings(), hotkey: `__CONFLICT__:${patch.hotkey}` }
    }
    return updateSettings({ hotkey: patch.hotkey })
  }
  ```

  为什么这样是对的：快捷键的"真相"是 `globalShortcut` 的注册表，而设置项只是它的投影；任何一次失败的变更都必须让两者同时回到旧值，否则就出现"配置说 A、实际啥都没有"的不一致态。把 `register` 提到 `updateSettings` 之前，还能顺带消掉"配置已写入但注册失败"的中间态。

### [M-2] 快捷键录制未强制要求修饰键 → 可把单个字母注册为全局热键 — 🟠 Major

- **位置**：`src/renderer/src/pages/SettingsPage.tsx:94-107`（`eventToAccelerator` 只按 `altKey/ctrlKey/shiftKey/metaKey` 拼接，**不校验 `mods.length > 0`**）、UI 提示在 `SettingsPage.tsx:265` 写的是"需包含 Alt / Ctrl / Shift 之一"
- **问题**：代码与提示不一致。用户点"修改快捷键"后随手按下 `S`，`eventToAccelerator` 返回 `"S"`，主进程 `globalShortcut.register('S')` 会**成功**（Electron 允许无修饰键的字母加速键），于是 `S` 变成全局速记键。
- **潜在后果**：应用（含最小化到托盘）运行期间，用户在**任何软件**里都打不出 `S`；且由于 [M-1]，一旦这次注册把旧键注销掉，用户连"换回 Alt+N"都可能失败，最终需要重启。这是一个"配置一次就毁掉输入法"的高影响可用性事故。
- **正确方案**：

  ```ts
  // src/renderer/src/pages/SettingsPage.tsx
  function eventToAccelerator(e: React.KeyboardEvent): string | null {
    const key = e.key
    const mods: string[] = []
    if (e.altKey) mods.push('Alt')
    if (e.ctrlKey) mods.push('Control')
    if (e.shiftKey) mods.push('Shift')
    if (e.metaKey) mods.push('Super')

    let main: string | null = null
    if (/^F([1-9]|1[0-2])$/.test(key)) main = key          // F1–F12 允许单独作为热键
    else if (mods.length === 0) return null                // ← 字母/数字必须有修饰键，与 UI 提示一致
    else if (/^[a-zA-Z]$/.test(key)) main = key.toUpperCase()
    else if (/^[0-9]$/.test(key)) main = key
    else return null
    return [...mods, main].join('+')
  }
  ```

  并在主进程侧做**不信任渲染层的兜底校验**（渲染层校验只是体验，不能当安全边界）：

  ```ts
  // src/main/ipc.ts —— 白名单式校验 accelerator，非法直接拒绝
  const MODIFIED_LETTER = /^(?=.*(Alt|Control|Shift|Super)\+)[A-Za-z0-9](?:\+[A-Za-z0-9])?$/  // 简化示意
  function isValidAccelerator(acc: string): boolean {
    if (typeof acc !== 'string' || acc.length > 40) return false
    const parts = acc.split('+').filter(Boolean)
    const hasModifier = parts.some((p) => ['Alt', 'Control', 'Shift', 'Super', 'Command', 'CmdOrCtrl'].includes(p))
    const keyPart = parts[parts.length - 1] ?? ''
    const isFnKey = /^F([1-9]|1[0-2])$/.test(keyPart)
    return (hasModifier || isFnKey) && /^([A-Za-z0-9]|F([1-9]|1[0-2]))$/.test(keyPart)
  }
  // settings:update 内：if (patch.hotkey !== undefined && !isValidAccelerator(patch.hotkey)) throw new Error('invalid accelerator')
  ```

  为什么这样是对的：无修饰键的全局热键会**跨越应用边界抢占输入**，这是唯一一类"用户一个手滑就影响整个系统"的配置项，值得在两层都设卡。F1–F12 单独使用是行业惯例（如 F2 重命名），所以对它们放行是对的。

### [M-3] Word 导出的加粗会错位到相邻文字上（已复现） — 🟠 Major

- **位置**：`src/main/exporter.ts:14-19`（`inlineRuns`），调用方 `src/main/exporter.ts:21-44`；被 `src/main/ipc.ts:183` 的 `export:report` 使用
- **问题**：`text.split(/\*\*(.+?)\*\*/g)` 会产出前后空串，而代码先 `.filter((p) => p !== '')` **再按 `i % 2 === 1` 判断加粗**——过滤掉空串后奇偶性整体错位。
- **实测证据**（Node 22 直接跑该实现）：

  ```
  inlineRuns("**重点**普通文字") => [{"text":"重点","bold":false},{"text":"普通文字","bold":true}]
  inlineRuns("**A****B**")      => [{"text":"A","bold":false},{"text":"B","bold":true}]
  inlineRuns("普通 **重点** 文字") => [{"text":"普通 ","bold":false},{"text":"重点","bold":true},{"text":" 文字","bold":false}]  ← 只有这一种是对的
  ```
- **潜在后果**：凡是以 `**` 开头的行，加粗**完全反了**——本该加粗的变正文、紧跟的正文变加粗。而 `src/renderer/src/lib/report.ts:148` 正好生成 `**${项目名}**` 这样的行（下期计划的按项目分组标题），导出的 docx 里项目名不会加粗；同时该模式下"正文被加粗"会让导师一眼看出排版异常。用户交给导师的周报 Word 里出现这种错位，属于直接可见的交付质量问题。
- **正确方案**（保留空串、用位置判断，或用 `matchAll` 重建）：

  ```ts
  /** 行内 **加粗** 解析为 TextRun 数组（不破坏奇偶性：保留 split 的空串占位） */
  function inlineRuns(text: string, base: { size?: number } = {}): TextRun[] {
    return text
      .split(/\*\*(.+?)\*\*/g)
      .map((part, i) => ({ part, bold: i % 2 === 1 })) // 不再 filter，索引即语义
      .filter(({ part }) => part !== '')
      .map(({ part, bold }) => new TextRun({ text: part, bold, size: base.size }))
  }
  ```

  为什么这样是对的：`String.prototype.split` 带捕获组时，"偶数下标=普通段、奇数下标=捕获段"是**该 API 的契约**，空串正是维持这个契约的占位符；先过滤再判断等于把语义线索丢掉。真要做健壮版，可以换成显式解析：

  ```ts
  function inlineRunsExplicit(text: string): TextRun[] {
    const runs: TextRun[] = []
    let cursor = 0
    for (const m of text.matchAll(/\*\*(.+?)\*\*/g)) {
      if (m.index > cursor) runs.push(new TextRun({ text: text.slice(cursor, m.index) }))
      runs.push(new TextRun({ text: m[1], bold: true }))
      cursor = m.index + m[0].length
    }
    if (cursor < text.length) runs.push(new TextRun({ text: text.slice(cursor) }))
    return runs
  }
  ```

  **建议顺便加一个最小回归用例**——这是本次唯一"有确定输入输出、能一行断言"的 bug，属于当前零单测项目里性价比最高的一个测试。

### [M-4] 退出/关闭应用时不会 flush 防抖中的写入 → 最后 800ms 的编辑丢失 — 🟠 Major

- **位置**：`src/renderer/src/store.ts:36`（`SAVE_DEBOUNCE_MS = 800`）、`src/renderer/src/store.ts:143-161`（`schedulePersist` 只在定时器触发时写）、`src/renderer/src/store.ts:181-195`（`flushPendingSaves` 仅在 `refreshExternal` 里被调用）、`src/renderer/src/App.tsx:68-136`（**没有任何 `beforeunload` / `pagehide` 处理**）、`src/main/ipc.ts:253-261`（`app:quit` 直接 `app.quit()`，不通知渲染层）
- **问题**：所有编辑都是"先改内存、800ms 后落盘"。用户刚敲完一条进展日志就点"设置 → 退出应用（退出前自动备份）"，渲染进程随窗口销毁，`pendingTimers` 里的任务**永远不会执行**；主进程的 `before-quit` 备份的是磁盘上的旧文件。
- **潜在后果**：用户明确看到"已保存/已勾选"的操作丢失，且因为退出前刚做过备份，用户会误以为"有备份所以安全"。丢失量 = 最后一次落盘到退出之间的所有编辑（通常 1 条，密集编辑时可能是多条）。
- **正确方案**：把"退出"改造成一个需要渲染层确认的握手流程（同时解决"备份时机"问题）：

  ```ts
  // src/renderer/src/App.tsx —— 关闭/退出前强制落盘
  useEffect(() => {
    const flush = (): void => {
      // flushPendingSaves 是 async，但页面卸载事件里只能"同步发起"；
      // 真正的保证来自下面的主进程握手，这里作为尽力而为的最后一道
      void useStore.getState().flushPendingSaves()
    }
    window.addEventListener('beforeunload', flush)
    window.addEventListener('pagehide', flush)
    // 主进程主动请求退出时，渲染层先落盘再放行
    return window.api.onQuitRequested(async () => {
      await useStore.getState().flushPendingSaves()
      await window.api.confirmQuit()
    })
  }, [])
  ```

  ```ts
  // src/main/ipc.ts —— app:quit 改为"请求渲染层先落盘"
  let quitConfirmed = false
  ipcMain.handle('app:quit', (): void => {
    const win = getMainWindow()
    if (!win || quitConfirmed) return doQuit()
    win.webContents.send('app:quit-requested')          // 渲染层 flush 完再回调 confirm
    setTimeout(() => { if (!quitConfirmed) doQuit() }, 2000) // 兜底：2s 内没回应也退出
  })
  ipcMain.handle('app:confirm-quit', (): void => {
    quitConfirmed = true
    doQuit()
  })
  function doQuit(): void {
    try { backupNow() } catch { /* 备份失败不阻塞退出 */ }
    app.quit()
  }
  ```

  另外把 `flushPendingSaves` 暴露到 store 的公开接口上（当前它是模块内的私有函数，`App.tsx` 拿不到）：

  ```ts
  // src/renderer/src/store.ts
  interface AppState {
    // …
    flushPendingSaves: () => Promise<void>
  }
  export const useStore = create<AppState>((set, get) => ({
    // …
    flushPendingSaves,   // 直接引用模块内已实现的函数
  }))
  ```

  为什么这样是对的：`beforeunload` 在 Electron 里可以取消卸载，但异步 IO 无法在其中完成；真正可靠的做法是**把"谁来负责收尾"明确交给渲染层，主进程只做超时兜底**——这样既不牺牲正常退出的完整性，也不会因为渲染层卡死而退不掉。

### [M-5] `url:fetch-meta` 是完整的盲 SSRF 通道 — 🟠 Major

- **位置**：`src/main/ipc.ts:193-238`（`fetch(url, { redirect: 'follow' })`，**无协议白名单、无内网/回环/链路本地地址拦截、无重定向次数限制**）；调用入口 `src/renderer/src/pages/ToolboxPage.tsx:473-488`
- **问题**：主进程代替渲染层发起任意 HTTP 请求，并把响应正文截取 200KB 后提取 `<title>` 与 favicon 返回。缺少任何目标地址限制。
- **潜在后果**：
  - 可探测本机与内网服务（`http://127.0.0.1:port/`、`http://192.168.x.x/`、云环境 `http://169.254.169.254/…`），并通过返回的 `<title>` 判断服务类型/页面内容；
  - `redirect: 'follow'` 让"公网 URL → 重定向到内网"的绕过成立，仅靠入参校验挡不住；
  - 对只用 GET 就能产生副作用的内网设备（路由器/打印机的重启、开放接口）等价于**盲 CSRF**；
  - 与 [C-1] 组合后，这是攻击者最顺手的"从外部页面探测受害者内网"的工具。
- **正确方案**：加一个 `assertSafeUrl`，每跳重定向都校验。

  ```ts
  // src/main/ipc.ts
  import { isIP } from 'node:net'
  import dns from 'node:dns/promises'

  /** 私有/回环/链路本地/保留网段（IPv4 + IPv6 简化集） */
  function isPrivateIp(ip: string): boolean {
    if (ip === '::1' || ip === '::' || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) return true
    const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip)
    if (!m) return false
    const [a, b] = [Number(m[1]), Number(m[2])]
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||                       // 链路本地 / 云元数据
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||             // CGNAT
      a >= 224
    )
  }

  async function assertSafeUrl(raw: string): Promise<URL> {
    const u = new URL(raw)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('仅支持 http/https')
    // 逐跳校验：先解析域名再判定，防止 DNS 指向内网
    const { address } = await dns.lookup(u.hostname)
    if (isPrivateIp(address)) throw new Error('禁止访问内网地址')
    return u
  }

  ipcMain.handle('url:fetch-meta', async (_e, url: string) => {
    try {
      let current = await assertSafeUrl(url)
      let resp: Response | null = null
      for (let hop = 0; hop < 3; hop++) {                 // 手动跟重定向，逐跳校验
        resp = await fetch(current, {
          signal: AbortSignal.timeout(5000),
          redirect: 'manual',
          headers: { 'User-Agent': 'Mozilla/5.0 … GezhiWorkbench/1.0' }
        })
        const loc = resp.headers.get('location')
        if (!loc || resp.status < 300 || resp.status >= 400) break
        current = await assertSafeUrl(new URL(loc, current).toString())
      }
      if (!resp || !resp.ok) return { title: null, favicon: null }
      /* …原有 title/favicon 提取逻辑不变… */
    } catch {
      return { title: null, favicon: null }
    }
  })
  ```

  为什么这样是对的：SSRF 的判定对象是**"最终连出去的 IP"而不是"用户输入的字面量"**，所以必须在 DNS 解析之后、每一次重定向之后再判；`redirect: 'manual'` + 手动跳转是唯一能保证每跳都过检查的写法。

### [M-6] 自动更新没有发布者签名校验 — 🟠 Major

- **位置**：`electron-builder.yml:16-22`（`win:` 段只有 `target`/`artifactName`，**无 `certificateFile` / `publisherName`**）、`src/main/updater.ts:23-51`
- **问题**：`electron-updater` 的 NSIS 校验逻辑是"读 `app-update.yml` 里的 `publisherName`，若为 `null` 就**直接跳过** Authenticode 校验"。读依赖源码可确认：

  ```js
  // node_modules/electron-updater/out/NsisUpdater.js:85-96
  async verifySignature(tempUpdateFile) {
      publisherName = (await this.configOnDisk.value).publisherName;
      if (publisherName == null) { return null; }   // ← 没有 publisherName 就完全不校验
      …
  }
  ```

  本项目未配置签名与 `publisherName`，因此下载到的安装包**只**通过 `latest.yml` 里的 sha512 校验，而该清单与安装包来自同一个 GitHub Release、同源获取。
- **潜在后果**：一旦 GitHub 账号/发布流程被攻破（或 token 泄漏、恶意 PR 触发发布），攻击者可以同时替换安装包与 sha512，**自动更新会把恶意程序以原有权限静默安装到所有用户机器上**——这是本应用唯一的远程代码落地入口。另外未签名的安装包还会触发 SmartScreen 拦截，影响分发转化。
- **正确方案**（分两步，先做"能挡住"的，再做"规范"的）：
  1. **短期（无需买证书，立刻可做）**：明确关闭自动安装兜底，改为"只提示 + 跳转 Release 页手动下载"，并在文案里说明。修改 `src/main/updater.ts:26-27`：

  ```ts
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false   // ← 不再"退出时静默安装"
  ```
  2. **规范做法**：购买代码签名证书（或使用 Azure Trusted Signing / SignPath 的 OSS 免费签名），在 `electron-builder.yml` 声明，并让 electron-updater 真正执行校验：

  ```yaml
  # electron-builder.yml
  win:
    target: [nsis, zip]
    artifactName: Gezhi-Workbench-${version}-${arch}.${ext}
    certificateFile: build/cert.pfx           # CI 里用环境变量注入，勿入库
    certificatePassword: ${env.CSC_KEY_PASSWORD}
    publisherName: "你的组织名称"              # ← 有它才会触发 verifySignature
    signingHashAlgorithms: [sha256]
    # 可选加固：electron-updater 的签名校验失败即拒绝安装
  ```

  为什么这样是对的：`publisherName` 不是"元数据"，而是 electron-updater 判断"要不要校验签名"的开关（见上方源码），因此"只签名不填 publisherName"等于白签；而在这之前先关掉 `autoInstallOnAppQuit`，是把"静默安装"这个最高风险能力先摘掉——风险与成本的正确排序。

### [M-7] 数据加载零 schema 校验 + 无错误边界 → 单条脏数据白屏，损坏文件被静默当空 — 🟠 Major

- **位置**：`src/main/store.ts:95-136`（`readCollectionRaw` + `loadAll`，`raw as unknown[]` 直接返回，JSON 解析失败只 `console.error` 后 `continue`）、`src/renderer/src/store.ts:228-238`（bootstrap 直接铺开）、消费侧如 `src/renderer/src/components/TaskRow.tsx:68`（`task.tags.map`）、`src/renderer/src/App.tsx:98-135`（**无 ErrorBoundary**）
- **问题**（两个方向的问题同源——"不校验"）：
  1. **向下**：任何一条结构不完整的记录都会在渲染时抛错。例如 `tasks.json` 里一条缺 `tags` 的条目 → `task.tags.map` 抛 `TypeError` → React 卸载整棵树 → 用户看到**纯白窗口**，设置页也进不去，只能手改 JSON 才能自救。手改数据、旧版本数据、编辑器意外截断都会产生这种记录。
  2. **向上**：`loadAll` 对"JSON 解析失败"和"不是数组"都只是跳过，`result.tasks` 保持 `[]`。用户看到"任务全没了"，随手新建一条 → `saveCollection('tasks', [那条新任务])` → **损坏文件被合法数据覆盖**，只有在 `backups/` 里才可能找回。
- **潜在后果**：前者让应用"打不开又修不了"（对非技术用户等于数据报废）；后者把"可恢复的损坏"变成"确认性的丢失"。对一款把"数据是你自己的明文 JSON"当卖点的工具，这两条恰好打在最关键的承诺上。
- **正确方案**：`loadAll` 做**逐条校验 + 显式上报**，渲染层加错误边界。

  ```ts
  // src/main/store.ts —— 逐条校验，坏数据不静默
  export interface LoadIssue { collection: CollectionName; kind: 'parse' | 'shape'; detail: string }

  function isTask(x: unknown): x is Task {
    const t = x as Task
    return !!t && typeof t.id === 'string' && typeof t.title === 'string' &&
      Array.isArray(t.tags) && typeof t.status === 'string' &&
      typeof t.created_at === 'string' && typeof t.updated_at === 'string'
  }
  const VALIDATORS: Partial<Record<CollectionName, (x: unknown) => boolean>> = {
    tasks: isTask, projects: isProject, milestones: isMilestone, /* …其余同理… */
  }

  export function loadAll(): { data: AllCollections; issues: LoadIssue[] } {
    const result = emptyCollections()
    const issues: LoadIssue[] = []
    if (!settings.dataDir) return { data: result, issues }
    for (const name of COLLECTION_NAMES) {
      const file = dataFile(name)
      let raw: unknown
      try {
        raw = readCollectionRaw(name)
      } catch (err) {
        // ★ 关键：解析失败不再当作"空集合"，而是上报并跳过写入该集合
        issues.push({ collection: name, kind: 'parse', detail: String(err) })
        continue
      }
      if (raw == null) continue
      const v = VALIDATORS[name]
      if (v && Array.isArray(raw)) {
        const good = raw.filter(v)
        if (good.length !== raw.length) {
          issues.push({ collection: name, kind: 'shape', detail: `${raw.length - good.length} 条记录结构不合法，已跳过` })
        }
        ;(result as unknown as Record<string, unknown>)[name] = good
      } else {
        ;(result as unknown as Record<string, unknown>)[name] = raw
      }
    }
    return { data: result, issues }
  }
  ```

  ```tsx
  // src/renderer/src/components/ErrorBoundary.tsx —— 新增，包住 <App />
  export class ErrorBoundary extends React.Component<{children: React.ReactNode}, {error: Error | null}> {
    state = { error: null as Error | null }
    static getDerivedStateFromError(error: Error) { return { error } }
    render() {
      if (!this.state.error) return this.props.children
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="text-[15px] font-semibold">界面渲染出错，数据未受影响</div>
          <pre className="max-w-2xl overflow-auto rounded-lg bg-surface-2 p-3 text-left text-[12px]">
            {String(this.state.error?.message ?? this.state.error)}
          </pre>
          <div className="flex gap-2">
            <button onClick={() => location.reload()}>重新加载</button>
            <button onClick={() => window.api.openDataDir()}>打开数据目录</button>
          </div>
        </div>
      )
    }
  }
  ```

  并在 bootstrap 后把 `issues` 用一条醒目的提示条展示（"tasks.json 解析失败，已暂停写入该集合，请从 backups/ 恢复"），**同时在该集合被标记为 `parse` 失败时禁止 `saveCollection` 覆盖它**。为什么这样是对的：坏数据的第一原则是"**不要用新数据把它盖掉**"——保留原件、显式告知、给出一条恢复路径，用户就永远有救。

### [M-8] IPC 通道缺少入参校验（集合名 / 文件路径 / 打开目标） — 🟠 Major

- **位置**：`src/main/ipc.ts:66-71`（`store:save` 的 `name: CollectionName` 只是 TS 类型）、`src/main/store.ts:75-77`（`COLLECTION_FILES[name]` 直接索引）、`src/main/ipc.ts:99-118`（`shell:open-path` / `fs:exists` 接受任意路径）、`src/main/ipc.ts:157-160`（`import:parse-references` 接受任意路径并按扩展名分派解析）
- **问题**：TypeScript 类型在运行时不存在。渲染层（或被 [C-1] 影响的任意页面）可以传任意字符串。
- **实测证据**（Node 22 验证 `COLLECTION_FILES[非法名]` 的实际行为）：

  ```
  COLLECTION_FILES["constructor"] => function Object() { [native code] }
  COLLECTION_FILES["__proto__"]   => [object Object]
  COLLECTION_FILES["../../evil"]  => undefined
  path.join('C:/data', undefined)      => THROW TypeError
  path.join('C:/data', Object.prototype) => THROW TypeError
  ```
  → **结论：当前不可利用路径穿越**（`path.join` 会抛 TypeError，IPC 直接 reject），这一点是好消息；但错误是"抛异常"而不是"明确拒绝"，也没有任何日志，一旦将来有人改成 `String(name)` 拼接就会立刻变成目录穿越。
- **潜在后果**：独立看属纵深防御不足；一旦与 [C-1] 组合，`shell:open-path`（以用户权限启动任意 `.exe`）和 `import:parse-references`（任意文件读）就是完整的提权链。此外 `fs:exists` 是任意路径存在性探测。
- **正确方案**：在 IPC 边界做一次**白名单校验**，把"类型"落实成"运行时断言"。

  ```ts
  // src/main/ipc.ts
  const COLLECTION_WHITELIST = new Set<string>(Object.keys(COLLECTION_FILES))

  handle('store:save', (_e, name: unknown, data: unknown) => {
    if (typeof name !== 'string' || !COLLECTION_WHITELIST.has(name)) {
      throw new Error(`非法集合名: ${String(name)}`)
    }
    // 数组集合必须传数组，避免把结构写坏
    const ARRAY_COLLECTIONS = ['projects','tasks','milestones','ideas','logs','papers','achievements','reports','references']
    if (ARRAY_COLLECTIONS.includes(name) && !Array.isArray(data)) {
      throw new Error(`${name} 必须是数组`)
    }
    return saveCollection(name as CollectionName, data)
  })

  /** 只允许打开：数据目录内、或用户本机已选过的路径（由渲染层维护一份白名单回传） */
  handle('shell:open-path', async (_e, target: unknown) => {
    if (typeof target !== 'string' || target.length === 0 || target.length > 4096) return '非法路径'
    const resolved = path.resolve(target)
    if (/^(\\\\|\/\/)/.test(target)) return '不支持网络路径'   // 如需可放开
    const err = await shell.openPath(resolved)
    return err
  })

  handle('import:parse-references', (_e, filePath: unknown) => {
    if (typeof filePath !== 'string') throw new Error('非法路径')
    const ext = path.extname(filePath).toLowerCase()
    if (!['.bib', '.json'].includes(ext)) throw new Error('仅支持 .bib / .json')
    const st = fs.statSync(filePath)
    if (st.size > 32 * 1024 * 1024) throw new Error('文件过大（>32MB）')   // 同时挡住超大文件撑爆内存
    return parseReferencesFile(filePath)
  })
  ```

  为什么这样是对的：进程间边界的参数必须被当作**不可信输入**处理，这与"调用方是自己写的"无关——因为 C-1 已经证明了"渲染层可能不再是你的代码"。`import` 加大小上限还顺带解决了 `fs.readFileSync(filePath, 'utf-8')` 对超大文件的内存风险。

### [M-9] 论文快速导入的「年份」列被静默丢弃 — 🟠 Major

- **位置**：`src/renderer/src/components/PaperQuickImportModal.tsx:12-20`（`PreviewRow.year`）、`:53-65`（解析时填充）、`:67-69`（用户可编辑）、`:180-191`（渲染成可编辑输入框）、**`:87-101`（`doImport` 只传 title/venue/type/status/note——没有 year）**
- **问题**：预览表格里"年份"是一个明确的输入框，用户改它、清空它都有效果（受控 state 正常更新），但导入时这个值**从未被写入任何地方**（`Paper` 类型本身没有 `year` 字段，`addPaper` 的入参也没有）。
- **潜在后果**：用户粘贴一批引文、逐条核对并修正年份，点"导入"后年份**全部消失且无任何提示**；而年份恰是该功能展示"待核对"的核心信息（`checkCount` 的判定依据就是 `confidence === 'fallback'`，提示语写的是"黄底行未识别出期刊/年份结构，请核对后导入"）。用户会认为工具"记不住我填的东西"。
- **正确方案**：让这一列真正落库。最小改动是把年份并入备注（零数据结构变更），更正确是给 `Paper` 加字段。

  ```ts
  // ✅ 方案 A（最小改动，不改数据结构）：年份写进 note，保留原始引文
  // src/renderer/src/components/PaperQuickImportModal.tsx
  const doImport = (): void => {
    for (const r of importable) {
      const head = r.year.trim() ? `[${r.year.trim()}] ` : ''
      addPaper({
        title: r.title.trim(),
        venue: r.venue.trim(),
        type: r.type,
        status: 'accepted',
        note: `${head}${r.raw}`        // ← 年份保留在备注首部，不再丢弃
      })
    }
    setPhase('done')
  }
  ```

  ```ts
  // ✅ 方案 B（更正确）：Paper 增加 year 字段，并同步到成果台账草稿日期
  // src/shared/types.ts
  export interface Paper {
    // …
    year: number | null   // 发表年份（快速导入与已录用论文常用；投稿中的论文可空）
  }
  // src/renderer/src/store.ts addPaper：year: input.year ?? null
  // src/renderer/src/components/PaperEditModal.tsx：加一个「发表年份」输入框，保持可编辑
  ```

  无论哪个方案，都建议**在 `doImport` 里做一次"用户可见的确认"**：`if (r.year.trim() && !/^(19|20)\d{2}$/.test(r.year.trim())) 提示年份格式异常`——否则下一次还会出现"填了但看起来没生效"的困惑。

---

## 一般问题（Minor）

### [m-1] 导出文件扩展名可能被拼错 — 🟡 Minor
- 位置：`src/main/exporter.ts:69-72`。`if (path.extname(file).toLowerCase() !== ext) file += ext`：用户在为 docx 保存时把文件名写成 `周报.md`，会得到 `周报.md.docx`。
- 正确方案：只在不含扩展名时才补，或直接替换扩展名：
  ```ts
  const currentExt = path.extname(file)
  if (currentExt.toLowerCase() !== ext) {
    file = currentExt ? `${file.slice(0, -currentExt.length)}${ext}` : `${file}${ext}`
  }
  ```

### [m-2] BibTeX 导出未转义 `{` `}` — 🟡 Minor
- 位置：`src/renderer/src/lib/citation.ts:132-148`。`push('title', ref.title)` 直接花括号包裹；标题/字段中含 `}`（如 `{GPU}加速` 之类的手工编辑数据）会产出语法错误的 `.bib`，用户粘进 LaTeX 编译失败。
- 正确方案：对值做转义，citekey 也做字符白名单：
  ```ts
  const escapeBib = (v: string): string => v.replace(/[{}]/g, (c) => `\\${c}`)
  const key = (ref.citekey || fallbackCitekey(ref)).replace(/[^A-Za-z0-9_:.-]/g, '')
  lines.push(`  ${k} = {${escapeBib(v)}}`)
  ```

### [m-3] 文献年份无校验，可落库 `NaN` / 超范围值 — 🟡 Minor
- 位置：`src/renderer/src/components/ReferenceEditModal.tsx:97`（`year.trim() ? parseInt(year, 10) : null`）。输入 `20a` → `20`；清空再输入乱码可能得到 `NaN` 落盘，随后 `ReferencesPage` 的年份筛选/展示出现 `NaN`，`availableYears` 的 `Number.isFinite` 判断又把它排除，表现自相矛盾。
- 正确方案：
  ```ts
  const parsed = Number.parseInt(year.trim(), 10)
  year: Number.isInteger(parsed) && parsed >= 1500 && parsed <= new Date().getFullYear() + 1 ? parsed : null
  ```
  并在 UI 上给出 `min={1500}` 限制。

### [m-4] 文献导入的批内不去重 — 🟡 Minor
- 位置：`src/renderer/src/components/ReferenceImportModal.tsx:77-106`。`preview` 只把草稿与**已有数据**比对，同一份 `.bib` 里两条相同 DOI/标题+年份的条目会被同时新增（`usedCitekeys` 只解决 citekey 生成，不解决重复判定）。
- 正确方案：比对集合里加"本批已见过的键"，命中即计入 `skips`：
  ```ts
  const batchSeen = new Set<string>()
  for (const d of result.entries) {
    const key = d.doi ? `doi:${d.doi}` : `ty:${normalizeTitle(d.title)}|${d.year}`
    if (batchSeen.has(key)) { skips++; continue }
    batchSeen.add(key)
    /* …原有比对… */
  }
  ```

### [m-5] 报告模板替换有两个字符串陷阱 — 🟡 Minor
- 位置：`src/renderer/src/lib/report.ts:215-233`。
- **实测证据**（Node 22）：
  ```
  'X{{WORK}}Y'.replace('{{WORK}}', '完成任务：费用 100$ 与 $& 符号') => "X完成任务：费用 100$ 与 {{WORK}} 符号Y"
  '{{WORK}} 中间 {{WORK}}'.replace('{{WORK}}','内容')              => "内容 中间 {{WORK}}"
  ```
  ① 任务标题里的 `$&`／`` $` ``／`$'`／`$$` 会被当成替换模式，把匹配文本插回去（上例中 `$&` 变成了 `{{WORK}}`）；② 字符串形式的 `replace` 只替换**首次**出现，模板里写两次同一个占位符，第二个会留在成品报告里。
- 正确方案（用函数式替换 + `replaceAll`）：
  ```ts
  const fill = (tpl: string, vars: Record<string, string>): string =>
    tpl.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '')
  content = fill(template, { TITLE: title, PERIOD: periodText, WORK: work, PLAN: plan, THOUGHTS: '' })
  ```
  为什么这样是对的：替换字符串里的 `$` 语义是 `String.replace` 的历史包袱，传**函数**可以彻底绕开；同时一次正则替换即可覆盖多次出现，顺带支持未来的新占位符。

### [m-6] 投稿周期可能算出负天数 — 🟡 Minor
- 位置：`src/renderer/src/lib/insights.ts:124-127`。若"结果通知日期"早于"投稿日期"（手滑或年份录错），`diff` 为负，会拉低 venue 均值并显示"-3 天"。
- 正确方案：`if (days >= 0) completed.push(...) else excluded += 1`，并在 UI 提示"日期顺序异常，请核对"。

### [m-7] 非响应式读取 `settings.hotkey` — 🟡 Minor
- 位置：`src/renderer/src/pages/Dashboard.tsx:321`、`src/renderer/src/pages/IdeasPage.tsx:95`（`useStore.getState().settings.hotkey`）。改完快捷键后这两处提示不会刷新，用户会看到"按 Alt+N 随手记"但实际已经改成别的。
- 正确方案：`const hotkey = useStore((s) => s.settings.hotkey)`（`Sidebar.tsx:79` 就是正确写法，照抄即可）。

### [m-8] `safeWriteJson` 用自旋等待，阻塞主进程事件循环 — 🟡 Minor
- 位置：`src/main/store.ts:150-153`：`while (Date.now() < until) { /* 空转 */ }`，最多 5 次 × 100ms = **500ms 主进程完全卡死**（所有 IPC、窗口事件、更新进度都停）。rename 失败重试的意图是对的，手法是错的。
- 正确方案：改成异步退避重试，或至少在重试前 `setTimeout` 让出事件循环：
  ```ts
  export async function safeWriteJson(file: string, data: unknown): Promise<void> {
    const tmp = file + '.tmp'
    await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8')
    for (let i = 0; i < 5; i++) {
      try { await fs.promises.rename(tmp, file); return }
      catch (err) {
        if (i === 4) throw err
        await new Promise((r) => setTimeout(r, 100 * (i + 1)))  // 让出事件循环 + 指数退避
      }
    }
  }
  ```
  （需把调用处 `updateSettings` / `saveCollection` / `persistStoreMeta` 改为 `await`。）

### [m-9] 全量 JSON 序列化 + 同步写盘，随数据量增长而卡 UI — 🟡 Minor
- 位置：`src/main/store.ts:138-176`。每次集合变更都 `JSON.stringify(整个集合, null, 2)` 且 `writeFileSync` 同步执行在主进程。`references.json` 到 5000 条（PRD 明确的目标量级）时，单次保存是"MB 级序列化 + 磁盘写"，主进程冻结、输入卡顿；`null, 2` 的缩进格式化会再放大 30% 左右体积。配合 [m-8] 的 500ms 自旋，最坏情况一次保存卡 1s 以上。
- 正确方案：① 全部改 `fs.promises`；② 去掉缩进（`JSON.stringify(data)`），或仅在"用户可读"诉求下保留；③ 引用/任务这类大集合考虑按需分片（如 `references/<id>.json`）——但至少先做 ①②，收益/成本比最高。

### [m-10] 工具箱有效性检测每分钟 N 次 IPC + N 次同步 `accessSync` — 🟡 Minor
- 位置：`src/renderer/src/pages/ToolboxPage.tsx:100-114`（每 60s 对每个本地项 `pathExists`）、`src/main/ipc.ts:111-118`（每次 `fs.accessSync` 阻塞主进程）。
- 影响：100 个收藏 = 每分钟 100 次 IPC 往返 + 100 次阻塞式 `accessSync`；在网盘目录（占位文件）上 `accessSync` 可能触发按需下载，代价更高。
- 正确方案：批量接口 `fs:exists-many(paths: string[])`（主进程内一次遍历，用 `fs.promises.access` 并发限流），并把轮询间隔拉到 5 分钟或改为窗口聚焦时触发。

### [m-11] CSP 允许远程图片 —— 笔记/日志里的外链图片会真实加载 — 🟡 Minor
- 位置：`src/renderer/index.html:6-9`（`img-src 'self' data: https: http:`）。Markdown 渲染后 `<img src="https://tracker/x.png">` 会被 Electron 加载，向第三方泄露"用户打开了这个应用、IP 与 UA"。对研究场景，笔记里粘贴外链图片也不罕见。
- 正确方案（保持功能同时收窄）：
  ```
  img-src 'self' data:;                 # 默认拒绝远程图片
  ```
  或保留但显式声明隐私取舍：给 `marked` 加渲染器，把远程 `<img>` 换成"点击加载"的占位（用户显式点击才请求）。另外当前 CSP 通过 `<meta>` 下发，建议同时用 `session.defaultSession.webRequest.onHeadersReceived` 补一个响应头版本，避免 file:// 场景下 meta CSP 的边界差异。

### [m-12] 未完成依赖漏洞审计（工具受限） — 🟡 Minor
- 本机 npm 走的是私有镜像（`registry.npmmirror.com`），`npm audit` 返回 `[NOT_IMPLEMENTED] /-/npm/v1/security/audits/quick`，因此**未能取得 CVE 清单**。这不是"没查到问题"，是"没查成"，请勿据此认为依赖干净。
- 建议：`npm audit --registry=https://registry.npmjs.org/` 或 `npx osv-scanner --lockfile=package-lock.json`（OSV 覆盖 npm 生态且不依赖 registry 的 audit 端点）纳入 CI。

### [m-13] 应用整体无错误边界（已并入 [M-7]）
- 见 [M-7]。单独列出仅为提醒：`src/renderer/src/App.tsx` 的整棵树没有任何 `componentDidCatch`，任何一处渲染异常都会卸载全部 UI。

### [m-14] `triggerQuickCapture` 在窗口刚重建时会丢事件 — 🟡 Minor
- 位置：`src/main/index.ts:62-75`。`showMainWindow()` 里若 `mainWindow` 为空会 `createMainWindow()` 并 `return`，紧接着 `mainWindow?.webContents.send('quick-capture:show')` 在**渲染层还没注册监听**时发出，事件丢失（表现为"按了快捷键但速记框没弹"）。
- 正确方案：窗口重建时等 `did-finish-load` 再发：
  ```ts
  function triggerQuickCapture(): void {
    if (!mainWindow) createMainWindow()
    const win = mainWindow!
    const send = (): void => win.webContents.send('quick-capture:show')
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send)
    else send()
    showMainWindow()
  }
  ```

### [m-15] 成果草稿去重不严，可能与正式条目重复 — 🟡 Minor
- 位置：`src/renderer/src/store.ts:920-944`（`ensurePaperAchievementDraft` 仅按 `type === 'paper' && title === paper.title && is_draft` 去重）。若用户已手动登记过同标题的正式成果，论文再次转为录用时仍会新增一条草稿 → 台账里一正一副两条。
- 正确方案：去重条件放宽为"同标题即可"（不限 `is_draft`），或在新增前提示"已存在同名称成果，是否合并"。

### [m-16] 明文 JSON + 网盘同步：非技术用户对风险的知情不足 — 🟡 Minor（设计取舍，需显式告知）
- 位置：`Onboarding.tsx:52-58`、`SettingsPage.tsx:174-186`。当前文案强调"完全属于你"，但未说明：数据是**明文**、会随网盘同步到第三方服务器、`backups/` 里的历史快照（含已删除内容）也会一并同步上去。对未发表的实验数据/合作方信息，这是需要用户明确知情的取舍。
- 正确方案：在 Onboarding 与设置页各加一行明确说明，例如"数据为明文 JSON，离线保存于你选择的目录；若选择网盘目录，历史版本（含删除内容）也会同步到该网盘，请按需调整网盘保留策略"。

---

## 优化建议（Nit，可选）

- `src/main/ipc.ts:259-260`：函数内已有 `app` 的 import，却用 `require('electron').app.quit()` 并加 eslint 注释绕过；直接用顶部导入的 `app.quit()` 即可。
- `src/renderer/src/pages/ToolboxPage.tsx:137,144` 与 `ReferencesPage.tsx:144`：用原生 `alert()` 报错，与全局自研对话框风格不一致（且会阻塞渲染进程）。建议统一走一个 `toast(msg, { type: 'error' })`。
- `src/renderer/src/pages/ReportsPage.tsx:76`：自己拼了一遍 `Date.now().toString(36)+Math.random()`——`@shared/types` 里已有 `uid()`，重复实现容易日后不同步。
- `src/renderer/src/pages/AchievementsPage.tsx:152-163`：用"渲染期 setState"（`if (open && !lastOpen) { setLastOpen(true); … }`）初始化表单，其它弹窗统一用的是 `useEffect + useRef`。前者在"弹窗未关闭就切换编辑对象"时会保留旧数据，建议统一为 `useEffect`。
- `src/renderer/src/pages/CalendarPage.tsx:288-312`：`CellItem` 在 `item.kind === 'task'` 分支提前 `return` 后才调用 `useMilestoneTypeLabel()`，属于条件调用 Hook。当前因 key 带 `t-`/`m-` 前缀不会触发 hook 数量变化，但这是隐患，建议提到组件顶部。
- `src/renderer/src/components/ui.tsx:170-183`：`Modal` 的 `useEffect` 依赖包含 `onClose`，而调用方普遍传内联箭头函数，导致每次渲染都重新挂/摘一遍全局 `keydown` 监听。建议把 `onClose` 放进 `useRef`，依赖数组只留 `[open, dismissable]`。
- `src/main/store.ts:129`：`storeMeta[name].savedAt = new Date().toISOString()` 用的是"加载时刻"而非文件时间，作为展示字段语义不准（不影响逻辑）。
- `src/main/index.ts:78`：托盘图标统一 `resize({width:16,height:16})`，若 `icon.png` 非正方形会变形；建议按短边等比缩放。
- 代码里存在少量"注释与实现不符"：`SettingsPage.tsx:265` 提示"需包含 Alt / Ctrl / Shift 之一"但实现未校验（见 [M-2]）；`VocabManagerModal` 面板文案说"被引用时无法删除"，UI 确实禁用了按钮，但 store 层 `deleteMilestoneType`（`store.ts:597-607`）**不检查引用**，直接调用仍会删并把节点回退为"其他"——建议 store 与 UI 的约束保持一致，避免日后新增入口时绕过。

---

## 架构评估

- **模块边界**：主进程 `store.ts`（294 行）一个文件同时承担 **5 个职责**——设置读写、集合读写、原子写、备份与轮转、外部变更检测（外加目录选择初始化）。这 5 件事的生命周期、失败语义、并发假设都不同（例如"变更检测"需要 mtime 历史，"原子写"需要临时文件），混在一起正是 [C-2] 难以处理冲突的结构性原因。
  - 建议拆分：`settings.ts`（配置）/ `collections.ts`（集合读写 + schema 校验）/ `backup.ts`（快照与轮转）/ `sync-watch.ts`（mtime 记录与变更检测），`store.ts` 退化为门面。
- **依赖方向**：主/渲染的依赖是清晰的单向（renderer → preload → main），没有循环依赖，这一点是好的。但**真相源在渲染层内存、主进程只是文件代理**——这直接导致 [C-2]："谁的数据更新"这个判断必须回到主进程（它有磁盘），因此冲突检测属于**主进程**职责，不应藏在渲染层的 `refreshExternal` 里。
- **渲染层 store**：`src/renderer/src/store.ts` 1020 行，承载 11 个集合的 CRUD + 跨集合级联（任务↔论文章节、引用↔论文、词库重命名级联…）+ 持久化调度。已是"上帝对象"雏形；级联逻辑（如 `renameTag` 里三处 `mutateArray`）散落在各个 action 中，新增一类引用就要改多处，容易漏。建议按领域切分为 `tasksStore / papersStore / refsStore / vocabStore`，级联通过订阅或显式的 `applyCascade(event)` 汇聚到一处。
- **可扩展性缺口**：`AllCollections` 直接以 JSON 落盘，**没有 schema 版本号与迁移机制**。当前用 `?? DEFAULT` 兜底的只有 `vocab`（`store.ts:115-120`），其余集合一旦要改字段（如 [M-9] 给 `Paper` 加 `year`），就只能靠"读取时容错 + 写回时补齐"，没有统一的升级路径。建议在数据目录写一个 `schema.json`（`{ version: 3 }`），`loadAll` 前先跑 `migrate(data, fromVersion)`——这是所有"本地文件即数据库"应用的必经一步，越早做越便宜。
- **质量基础设施**：`package.json` 无 `test` 脚本，仓库内**零单元测试**；`.github/workflows` 只有 `attach-release-assets.yml`（打包上传），没有 `typecheck` / `build` 门禁。本次 [M-3]（加粗错位）与 [m-5]（`$&` 破坏报告）都属于"输入确定、断言一行"的问题，本可被最小测试集拦住。建议至少补：`inlineRuns`、`fill` 模板替换、`cleanTex`/`formatGB7714`（纯函数易测）、`parseBibTeXText`（喂一段固定 `.bib` 断言条数与失败数）。

---

## 已核查但未发现问题的项（避免误判为"漏审"）

- **注入类**：全仓库无 SQL、无 `child_process`/`exec`/`spawn`、无 `eval`/`new Function`、无字符串拼接命令；`shell.openExternal` 有 `^https?:\/\//i` 协议白名单（`ipc.ts:93-97`），未见 `javascript:`/`file:` 进入系统打开器的路径。
- **硬编码密钥**：`src/` 与 `scripts/` 全量扫描未发现硬编码口令/token/私钥；`settings.json` 只存路径与偏好（`store.ts:31-39`），不含凭据。CI 使用 `secrets.GITHUB_TOKEN` 且 `run` 步骤通过 `env` 传参（不是 `${{ }}` 内联），无脚本注入。
- **XSS**：两处 `dangerouslySetInnerHTML`（进展日志、更新日志）**都**经过 `DOMPurify.sanitize(marked.parse(...))`，配置为默认白名单，未发现绕过；React 渲染的其它用户内容默认转义。真正的风险不在 XSS 本身，而在"点了 Markdown 里的链接会把窗口交出去"（见 [C-1]）。
- **路径穿越**：`store:save` 的集合名虽然缺校验，但 `path.join(dir, undefined/function/object)` 会抛 `TypeError`（已实测），**当前不可穿越**；`exportToFile` 的路径来自系统保存对话框（`dialog.showSaveDialog`），不可由渲染层指定。
- **数据落盘原子性**：`safeWriteJson` 的"先写 `.tmp` 再 rename"是对的，配合 `backups/`（每日 + 退出 + 删除前）设计合理；问题在于**备份的内容可能是被覆盖后的版本**（[C-2]），以及**冲突时缺少"保留对方版本"的动作**（[M-7] 方案中已给出）。
- **删除保护**：删除项目/论文/文献前都会 `await backupNow()`（`ProjectDetail.tsx:98-102`、`PapersPage.tsx:65-70`、`ReferencesPage.tsx:186-196`），这个习惯很好；唯一缺口是"备份失败也继续删"（`backupNow` 返回 `{ok:false}` 时未阻断），建议改为备份失败即中止删除并提示。

---

## 最该先修什么（优先级建议）

| 优先级 | 事项 | 理由 | 预计改动量 |
|---|---|---|---|
| 1 | **[C-1]** 导航拦截 + 来源校验 + `sandbox: true` | 唯一的"外部可控代码拿到全权限"入口，且只需 ~20 行；修完 [M-5]/[M-8] 的风险等级同时下降一档 | 小 |
| 2 | **[C-2]** 写入前乐观锁 + 冲突副本（先"不静默"，再谈合并） | 唯一会造成**永久数据丢失**的问题，且是产品核心用法（网盘多机）的必经路径 | 小→中 |
| 3 | **[M-4]** 退出前落盘握手 | 与 2 同属数据安全，用户刚输入就丢失的体感最差 | 小 |
| 4 | **[M-1] + [M-2]** 快捷键回滚 + 修饰键校验 | 一次误操作即可污染全系统输入，修复成本极低（~15 行） | 小 |
| 5 | **[M-3]** 加粗错位 + 补第一组单测 | 已复现、影响对外交付物（给导师的 Word），且顺带建立最小测试基线 | 小 |
| 6 | **[M-7]** 逐条 schema 校验 + ErrorBoundary + 坏文件不覆盖 | 把"打不开又修不了"和"可恢复的损坏变永久丢失"两条堵死 | 中 |
| 7 | **[M-6]** 先关 `autoInstallOnAppQuit`，再排签名 | 远程代码落地是最高价值目标，先用零成本手段降级 | 小→中 |
| 8 | **[M-9] / [m-5] / [m-13]** 静默丢弃用户输入类问题 | 用户"填了但没生效"的信任损伤，修复都很简单 | 小 |
| 9 | **[M-12]** 依赖审计 + Electron 34 EOL 升级 | 见下 | 中→大 |

> **关于 [M-12] 的一点必读补充**：当前运行时是 `electron@34.5.8`，按官方发布计划（releases.electronjs.org / endoflife.date），**Electron 34 已于 2025-06-24 结束支持**，内置 Chromium M132 不再接收安全补丁；当前受支持的是 42/43/44。也就是说，即便本次报告的代码问题全部修完，**运行时的浏览器内核仍带着 15 个月未修补的已知漏洞**——它的风险面随"应用会加载哪些内容"而变化，因此与 [C-1]、[m-11] 是同一个攻击链上的相邻环节。建议排期升级到 42+（`electron` 与 `electron-builder` 需同步升级，主要影响面是 `electron-vite` 与 NSIS 配置，`src/` 代码基本无需改动）。

---

**复审建议**：以上 C-1 / C-2 / M-1 / M-2 / M-3 / M-4 都是小体量、局部化的改动。改完把 `src/main/index.ts`、`src/main/ipc.ts`、`src/main/store.ts`、`src/main/exporter.ts`、`src/renderer/src/store.ts` 发我，我逐条确认"问题是否真解决、有没有引入新问题"（重点会看导航拦截是否把所有落点都覆盖、乐观锁是否会在正常单机场景下误报冲突）。
