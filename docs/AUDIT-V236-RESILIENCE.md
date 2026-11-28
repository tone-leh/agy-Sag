# agy-Sag 抗白屏/抗卡死架构审计与 Antigravity Desktop v2.36.0 兼容性报告

> **审计基准**：`agy-Sag v1.4.0`（commit `1714f6b`）  
> **审计日期**：2026-11-28  
> **审计范围**：`packages/core/`（全部 32 个 UMD 模块）、`cli/`（Daemon / CDP / Launcher / Translator / Storage Doctor / Platform Utils）、`sidecars/daemon/main.mjs`  
> **核查边界**：本报告中 `agy-Sag` 代码路径与行号均来自本机源码静态实测；Antigravity Desktop `v2.36.0` 运行时 DOM 细节属基于官方更新说明与现有选择器的工程分析，升级实机后需按文末清单冒烟复核。

---

## 一、核心结论摘要

1. **CSS 零 `:has()` 基线达标**：全仓真实 CSS 规则中 `:has()` 为 **0 条**、宽范围 `:is()` 为 **0 条**、`content-visibility: auto` 为 **0 条**、`-webkit-app-region` 为 **0 条**、WebGL / Canvas 为 **0 处**；需优化虚拟列表内粘性 `.ag-sag-code-bar` 的 `backdrop-filter` 与 `.ag-sag-smooth-caret` 常驻 `will-change`。
2. **React DOM 零破坏与防白屏存在 P0 风险**：9 个渲染模块直接向宿主 React 托管容器执行 `insertBefore`/`appendChild` 且缺少 `try/catch` 与父子一致性校验；`index.js:373,391` 在降级路径直接覆写 Lexical `ed.textContent`；`status-pill.js:618` 存在未定义函数 `formatElapsed` 的确定性 `ReferenceError`。
3. **3,000+ 步超大对话与 `MutationObserver` 存在 P0/P1 卡死热点**：全仓 13 个 `MutationObserver` 中 9 个以 `subtree: true` 挂在 `doc.body`，多处漏检 `addedNodes` 与休眠状态；`outline-bookmarks.js` 在有书签时借 16ms `rAF` 全对话 `cloneNode(true)` + 写 `localStorage`；`thought-translator.js` 自动模式会无上限并发翻译全部历史思考块；`prompt-queue.js` / `safe-auto-accept.js` 监听全局 `style`/`class` 并回退扫描全树 `[data-testid]`；`context-source.js` 存在 `O(N²)` 嵌套判重与 `querySelectorAll('*')`。
4. **Antigravity Desktop `v2.36.0` 存在 1 项 P0 硬冲突与 6 项 P1 兼容缺口**：`prism-bridge.js:1168` 的 `Ctrl/Cmd+Alt+/`（macOS 即 `Option+Cmd+/`）直接截胡 v2.36.0 新原生快捷键列表；最大化侧栏底部浮动输入框会导致多模块首位命中误挂/错写草稿与 `clean-slate.js` Enter 抢占；`host-i18n.js` 缺少 KaTeX/MathJax 跳过规则；`safe-auto-accept.js` 跨仓只读回退与 `Always allow` 按钮需收紧为严格 fail-closed。
5. **CLI / Daemon / Storage Doctor 写盘节制良好，但大文件与断连存在 P0 稳态缺口**：常驻轮询 `reconcileOnce()` 零磁盘写入（无 Prism 式写爆 GB 磁盘风险）；但 `copyFileSafeAtomic` 整文件 `readFileSync` 拷贝 100MB+ 库易 OOM、`auditAntigravityStorage` 无文件数/耗时熔断且同步阻塞 `watch-daemon`、`evalViaCdp` 缺 `close` 监听与发送异常处理、`target-skipped` 误置 `changed = true` 导致退避失效。

---

## 二、按风险分级问题清单（精确文件与行号）

### P0 — 白屏崩溃 / 卡死 / 硬功能冲突 / OOM（必须立即修复）

| 编号 | 类别 | 文件与行号 | 根因与影响 | 修复措施 |
| :---: | :--- | :--- | :--- | :--- |
| **P0-1** | v2.36 热键硬冲突 | `packages/core/prism-bridge.js:1168-1174` | 捕获阶段拦截 `Option+Cmd+/`（`Ctrl/Cmd+Alt+/`），截胡 v2.36.0 原生快捷键列表 | 改为 `Ctrl/Cmd+Shift+Alt+/`（要求 `ev.shiftKey`），同步文案与文档 |
| **P0-2** | 确定性崩溃 | `packages/core/status-pill.js:618` | 调用未定义 `formatElapsed(lastElapsed)`（实际为 `formatDurationMMSS`），展开卡片时抛 `ReferenceError` | 改为 `formatDurationMMSS(lastElapsed)` |
| **P0-3** | React DOM 崩溃风险 | `reading-nav.js:431,637`、`thought-translator.js:171,274,276`、`outline-bookmarks.js:312,523,559,594`、`status-pill.js:889`、`prompt-library.js:782`、`compact-guard.js:952,1007,1035,1106`、`draft-guard.js:302,351`、`prompt-queue.js:671,791`、`session-radar.js:237`、`theme-studio.js:1352`、`prism-bridge.js:1014,1084` | 直接对 React 托管父节点执行 `insertBefore`/`appendChild` 且无 `try/catch` 与父子一致性校验，大对话卸载重排易抛 `NotFoundError` 白屏 | 引入 `coexist.safeInsertBefore` / `safeAppendChild` / `safeRemoveNode` 统一保护、校验 `ref.parentNode === parent`、卸载前校验 `parentNode` 并全量 `try/catch` |
| **P0-4** | Lexical 树破坏 | `packages/core/index.js:373,391`、`clean-slate.js:209` | 降级路径直接赋值 `ed.textContent = ...` 绕过 Lexical EditorState 且无 `try/catch` | 统一先用 `Selection` + `execCommand('insertText'/'delete')` 并包裹 `try/catch` |
| **P0-5** | 3,000 步帧级卡死 | `packages/core/outline-bookmarks.js:675-679,719-736` | Observer 用 16ms `rAF` 且未过滤 `addedNodes`/`data-ag-sag-owned`；有书签时每帧全对话 `cloneNode(true)` + 写 `localStorage` | 移出 `sync()` 中的全对话提取（仅在书签变更/切会话/空闲 2.5s 防抖同步），Observer 改 220ms 防抖 + owned 全量过滤 + 休眠守卫 + `WeakSet` 跳过已装饰气泡 |
| **P0-6** | 3,000 步并发翻译风暴 | `packages/core/thought-translator.js:435-452,474-485` | `auto` 模式同步遍历全部历史思考块并发起无上限并发翻译；Observer 未过滤 `addedNodes` 与休眠态 | 限制 `auto` 模式单次最多自动翻译最近 5 个非流式块且最大并发 `<= 2`，历史块仅按需点击；补全 owned 过滤与休眠守卫 |
| **P0-7** | 大文件备份 OOM | `cli/platform-utils.mjs:320-324`（调用方 `cli/storage-doctor.mjs:1259`） | `copyFileSafeAtomic` 用 `fs.readFileSync` 将整文件读入内存，备份 100MB+ 冷 SQLite 库易 OOM | 改用 256 KiB 固定缓冲分块流式 `openSync`/`readSync`/`writeSync` + `finally { closeSync }` |
| **P0-8** | 存储体检冻结 Daemon | `cli/storage-doctor.mjs:268-296,454-599`、`cli/watch-daemon.mjs:796-802` | `auditAntigravityStorage` 无文件数/耗时上限且重复遍历 2~3 遍，在 `watch-daemon` 中同步执行冻结事件循环 | 合并为单次遍历 + 定长 Top-N 维护 + 文件数/元数据扫描/耗时硬熔断 + 损坏 `.db` 魔数只读识别；`watch-daemon` 加 15s 缓存 TTL |
| **P0-9** | CDP 瞬断悬挂 | `cli/cdp-attach.mjs:244-289` | `evalViaCdp` 缺少 `close` 事件监听与 `ws.send` `try/catch`，目标瞬断死等 4s 超时 | 统一 `settled` 收口，监听 `close` 立即 reject，包裹 `ws.send` 与 `ws.close()` |

---

### P1 — 性能卡顿 / v2.36.0 交互兼容 / 守护进程稳态 / 内存泄漏

| 编号 | 类别 | 文件与行号 | 根因与影响 | 修复措施 |
| :---: | :--- | :--- | :--- | :--- |
| **P1-1** | v2.36 侧栏浮动框冲突 | `context-source.js:29-66,142-169`、`status-pill.js:387`、`compact-guard.js:407,625,1254`、`draft-guard.js:284`、`prompt-queue.js:457`、`prompt-library.js:739`、`clean-slate.js:298`、`theme-studio.js:793,1283` | 侧栏浮动输入框位于 DOM 前部，多模块首位命中误挂/错写草稿，`clean-slate.js` Enter 未验 `ev.target` | 在 `context-source.js` 统一实现 `isSidebarOrAuxiliaryNode(el)` 过滤侧栏节点；`clean-slate.js` 校验 `ev.target` 属于主编辑器；`compact-guard` 补传 `scope`；`theme-studio` 隔离侧栏胶囊样式与光滑光标 |
| **P1-2** | v2.36 LaTeX 误翻 | `packages/core/host-i18n.js:14-70`、`theme-studio.js:1100,1112` | 未跳过 `MATH`/`SVG`/`MJX-CONTAINER`/`.katex`/`.MathJax`，子代理内联公式易被误翻或加 highlight | 增补公式标签/类名至 `HARD_SKIP` 与 `theme-studio` 跳过规则 |
| **P1-3** | v2.36 跨仓审批边界 | `packages/core/safe-auto-accept.js:584,586-603,886-915,1112-1127,1198-1204` | 只读回退未拦 `outside workspace`/`cross-repo`/`../`；内置白名单未拦 `git -C`；按钮匹配含 `Always allow` 持久提权 | 新增跨仓/工作区外拦截正则、阻断 `git -C`、确认按钮排除持久授权文案，确保严格 fail-closed |
| **P1-4** | v2.36 Send Now 熔断 | `packages/core/prompt-queue.js:492-559,628-636` | 未感知原生队列/`Send Now` 按钮，且提交未排除 `Send Now` | 增加 `native-queue-active` 第 5 重熔断并在提交选择器中排除 `Send Now` |
| **P1-5** | 全局 `style`/`class` Observer 回流风暴 | `prompt-queue.js:528,1297-1319`、`safe-auto-accept.js:1254,1331-1350` | 监听全树 `style`/`class` 且每 50–60ms 回退扫描 `[data-testid]` 触发大面积 `getComputedStyle` 回流，无休眠检查 | 移除 `style`/`class` 监听与无界 `[data-testid]` 全树回退，接入休眠守卫与 150ms 防抖，空队列短路 |
| **P1-6** | `host-i18n` 大对话全树阻塞 | `packages/core/host-i18n.js:851,1042-1068,746-817` | >200 节点同步全树 `walkSubtree`、下行重复爬祖先链、未前置过滤 `HARD_SKIP` 的 `characterData`、单节点写入无 `try/catch` | 下行透传 `ancestorChecked`、单帧时间/节点切片（`<= 450` 节点或 `8ms`）、前置过滤 `HARD_SKIP` 变更、单节点写入加 `try/catch` |
| **P1-7** | `reading-nav` 80ms 全量重读 + 复制丢空行 | `packages/core/reading-nav.js:346-356,421,841,878-891,933` | 每 80ms 重读所有 `<pre>` 文本 `split`、重建无上限导轨按钮、`querySelectorAll('*')` 兜底、`pre.textContent` 丢空行 | `WeakMap` 缓存行数、导轨签名防重绘与 `>80` 轮抽样窗口、有界深度查滚动容器、优先 `code` 节点 `innerText` 保空行复制 |
| **P1-8** | `prism-bridge` 流式每帧重建 + `theme-studio` 失焦与 Prism 让位 | `prism-bridge.js:1048-1111,1202-1228`、`theme-studio.js:1120-1174,1278-1408,1643-1666` | 流式变动每 16ms 重建 Settings Hub；`streamFade`/`smoothCaret`/`convObserver` 失焦未休眠且 `surfaceYielded` 未让出动效 | `prism-bridge` 已挂载短路 + 250ms 防抖 + `htmlObserver` 微任务合并；`theme-studio` 失焦真休眠、让出动效、统一 owned 标记、去掉 `convObserver` 的 `style` 监听 |
| **P1-9** | `context-source` `O(N²)` 与 `*` 扫描 | `packages/core/context-source.js:103-106,275,292-319` | `blocks.includes(p)` 为 `O(N²*depth)`，双轮重复测文本，`querySelectorAll('*')` 触发全树回流 | `Set` `O(1)` 判重、单轮合并测长、有界 BFS（最多 60 节点/深 5 层）、`status-pill` 3s 缓存 breakdown |
| **P1-10** | `draft-guard` 切 Tab 竞态 | `packages/core/draft-guard.js:374-416,562-599` | 防抖回调在切 Tab 后误写到新会话 `cid` | `scheduleFlush` 捕获 `cid` 传给 `flushNow(capturedCid)` |
| **P1-11** | WatchDaemon 退避失效、崩溃与泄漏 | `cli/watch-daemon.mjs:146,650,1177-1214,1281`、`cli/cdp-attach.mjs:156-169`、`cli/launcher.mjs:955,1310,1512,1547`、`cli/storage-doctor.mjs:807` | `target-skipped` 重置退避每 3s 重编 32 文件；`tick()` 缺 `try/catch`；`spawn` 缺 `'error'` 监听；`_knownChildFrameIds` 只增不减；`httpGetJson` 无上限；`exportSanitizedSession` 无大文件上限；`graceful-relaunch` 失败漏计 `sessionAttempts` | 逐项修补退避判定、bundle 缓存、`tick()` 兜底、`spawn` error 捕获、移除死 Set 并限制上下文数、补 HTTP/导出上限与 `sessionAttempts` 计数 |
| **P1-12** | 孤儿 DOM 引用内存泄漏 | `outline-bookmarks.js:42`、`thought-translator.js:119`、`reading-nav.js:108` | Set 长期持有已卸载 DOM 节点引用 | 每次同步周期裁剪 `isConnected === false` 条目 |

---

### P2 — 体验打磨、合成层减负与离线词典补齐

| 编号 | 类别 | 文件与行号 | 优化措施 |
| :---: | :--- | :--- | :--- |
| **P2-1** | 合成层减负 | `packages/core/styles.js:1960`、`theme-studio.js:887` | `.ag-sag-code-bar` 去除粘性 `backdrop-filter:blur(6px)` 改用实色 `color-mix`；`.ag-sag-smooth-caret` 仅在 `[data-visible="1"]` 启用 `will-change` |
| **P2-2** | 离线词典补齐 v2.36 | `packages/core/host-i18n-packs.js` | 增补 `Send Now`、`Skipped`、`Customizations`、`Installed by You`、`Installed Plugins`、`Installed Skills`、`Installed MCP Servers`、`Default Customizations`、`Other Customizations`（9 语种全对齐） |
| **P2-3** | macOS `Option+F` & 侧栏行兼容 | `reading-nav.js:985`、`session-radar.js:141,365`、`styles.js` | `Alt+F` 兼容 `ev.code === 'KeyF'`；侧栏标题提取排除按钮子树；侧栏隐藏行增加 `[data-ag-sg-radar-hidden="1"]{display:none!important;}` |
| **P2-4** | CLI 边界健壮性 | `cli/translator-service.mjs:233,390,622`、`cli/storage-doctor.mjs:860,981`、`cli/watch-daemon.mjs:262`、`cli/launcher.mjs:448,1516` | 临时文件加随机后缀、翻译排队上限 32 与 1 MiB 响应上限、导出改原子写、搜索按 transcript `mtimeMs` 排序、WS 8s 握手超时、`defaultExecFile` 设 `killSignal:'SIGKILL'` 与 `ps` 16 MiB buffer |

---

## 三、升级到真实 Antigravity Desktop v2.36.0 后的 5 项手工冒烟核验动作

1. **快捷键不冲突核验**：在 macOS v2.36.0 窗口按 `Option+Cmd+/` 确认打开的是 Antigravity 原生键盘快捷键列表，按 `Shift+Option+Cmd+/` 正常呼出 `agy-Sag` 动态快捷键速查表。
2. **最大化侧栏浮动输入框双 composer 隔离核验**：最大化左侧边栏并展开底部浮动输入框，确认 `agy-Sag` 状态胶囊、草稿恢复条、提示词队列条与 `⌘ Prompts` 按钮仅挂在主对话输入框，在侧栏浮动框输入 `/clear` 按 Enter 不误触主对话清理。
3. **3,000+ 步超长对话切换与滚动流畅度核验**：切入 2,800+ 步历史大对话并连续上下快速滚动、切换 2–3 个后台 `RUNNING` 会话，确认无米白屏、无 Console `NotFoundError`、CPU 迅速回落、思考翻译仅处理最近块且折叠代码块无跳屏。
4. **LaTeX 公式、纯文本复制与悬停 Archive 核验**：开启 `hostI18n`（`zh-CN`）查看含内联 LaTeX 的子代理回复确认公式零误翻；对含空行的长代码块点复制确认粘贴保留空行；悬停侧栏会话行确认 Archive 按钮完整可点。
5. **Auto 模式跨仓审批 fail-closed 核验**：开启 `safeAutoAccept`（`readonly-safe` / `dev-flow`）面对跨项目/工作区外读写审批卡片或 `Always allow` 按钮，确认自动跳过并在审计日志中记录拦截原因，不越权自动点击。
