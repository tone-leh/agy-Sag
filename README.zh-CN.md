# agy-Sag

[English](./README.md)

**面向 Google Antigravity 2.0 的模块化深度增强套件** *(原名 `agy-session-guard`)*

内置 **10 国语言原生界面实时翻译**（每语种约 5,400 词条）、**统一 6-Tab 控制中心与 `Ctrl/Cmd+Alt+,` 全局设置抽屉**、**分段式状态胶囊 HUD**、**`Ctrl/Cmd+Alt+P` 提示词库与命令面板**、自定义阈值静默 `/compact` 防爆与视口滚动盾、流式运行中 **提示词排队**、防丢 **草稿保护**、轮次书签与跨会话档案库、带不可绕过高危黑名单的 **安全自动审批**、零 `:has()` **光学主题与中文字体排版**、零封号风险的 **只读配额脉冲**，以及离线 **本地存储体检与脱敏备份 CLI**——**全部模块独立开关，按需启用**。

> **开源协议：** [MIT](./LICENSE) · **运行环境：** Node.js >= 22 · **外部依赖：** 零 npm 运行依赖 · **架构路线：** Zero-ASAR 无损 CDP · **双星搭档：** [`agy-NOV`](https://github.com/tone-leh/agy-NOV)

---

## 双星组合：推荐同时安装 `agy-NOV` + `agy-Sag`（零重叠深度协同）

我们为 Google Antigravity 2.0 并行维护两款**定位清晰、功能零重叠、天然互补**的开源插件，把「纯原生安全合规」与「深入界面及对话流增强」分成两条清晰轨道，推荐同时安装：

| 对比维度 | [`agy-NOV`](https://github.com/tone-leh/agy-NOV) · 纯原生工程工作台 | **`agy-Sag`**（本项目）· 界面与对话驾驶舱 |
| :--- | :--- | :--- |
| **技术路线** | 100% 官方原生 MCP Apps (SEP-1865) + Lifecycle Hooks，**零 ASAR、零 CDP** | Zero-ASAR Electron CDP 渲染层引擎 + Watch Sidecar + 离线存储体检 CLI |
| **升级与安全特性** | 严格走官方插件协议，客户端任意升级稳定生效 | 零改动 `app.asar` 与 Apple 公证签名，Watch 守护进程自动重挂，卸载 0 残留 |
| **主攻场景** | 侧边栏/全局工程工作台、改前安全拦截与快照、Stop 校验门、工作树与 Spec 写锁、长期记忆与远程遥控 | 统一 6-Tab 控制中心与全局抽屉、底栏分段 HUD、10 国界面多语言、提示词命令面板与排队、外观排版与本地数据治理 |
| **核心模块矩阵** | **13 大零 CDP 纯原生模块**，分 5 大分类（5 档预设，6–47 工具）：`review`、`guard`、`xray`、`turbo`、`radar`、`verify`、`worktree`、`spec`、`studio`、`canvas`、`mem`、`ops`、`remote` | **13 大渲染模块 + 离线存储 CLI**（4 档预设）：`hostI18n`、`themeStudio`、`readingNav`、`compactGuard`、`precompactExport`、`draftGuard`、`promptQueue`、`promptLibrary`、`outlineBookmarks`、`sessionWatchdog`、`sessionRadar`、`safeAutoAccept`、`quotaPulse`、`storage-doctor` |

### 双星联动化学反应（零额外网络端口）

同时安装 **`agy-Sag`** 与 **`agy-NOV`** 后，`agy-Sag` 统一控制中心（内嵌于 **Settings → Appearance** 或通过 `Ctrl/Cmd+Alt+,` 打开右侧抽屉）自动解锁 **`双星 NOV`** 面板，并与 `agy-NOV` 保持统一视觉设计 Token（`--sag-*` 对齐 `--nov-*`）：

- **在 Antigravity 原生设置里直接热控 `agy-NOV` v0.5**：按 5 大分类一键开关全部 **13 个 `agy-NOV` 纯原生模块** 并切换 **5 档场景预设**（`minimal` 6 / `core` 12 / `power` 32 / `local-all` 43 / `full` 47 工具）。通信复用 CDP `Runtime.addBinding`（零额外 HTTP 端口）通知 Sidecar 原子更新 `agy-NOV` 的 `config.json`（`0600`），`agy-NOV` 服务端通过原生文件签名热同步刷新 `tools/list`，全程保持 `agy-NOV` 零 CDP 纯净。
- **提示词库只读消费 `agy-NOV` 工程模板（`promptLibrary` × `agy-NOV ops`）**：通过零端口 `sag:nov_templates` 只读通道读取 `agy-NOV` 的 `ops/prompts.json`（严格 symlink 拒止、`<= 256 KB` 上限、零磁盘写入），在 `Ctrl/Cmd+Alt+P` 命令面板中一键填表填入输入框。
- **多层安全护盾协同（`safeAutoAccept` × `agy-NOV guard` / `verify`）**：前端铁壁黑名单自动审批与后端 PreToolUse 密钥防火墙、改前文件快照及 Stop 实测校验门形成多层防护。
- **压缩护航 × 记忆与透视（`compactGuard` × `agy-NOV mem` / `xray`）**：上下文自动压缩与代码锚定长期记忆、Token 透视形成闭环。
- **通知防重礼让（`sessionRadar` × `agy-NOV radar`）**：自动识别双侧提醒同时开启并提供一键去重。

> **一步装齐双星组合：**
> ```bash
> # 1) 13 模块纯原生协议工程工作台（100% 零 ASAR、零 CDP、升级不失效）
> agy plugin install https://github.com/tone-leh/agy-NOV
>
> # 2) 统一控制中心、状态 HUD、10 国界面多语言与深度对话套件（Zero-ASAR CDP）
> agy plugin install https://github.com/tone-leh/agy-Sag
> ```

---

## 统一控制中心与分段状态胶囊 HUD

- **单一真源 6-Tab 控制中心（`概览 | 界面 | 对话 | 守护 | 双星 NOV | 高级`）**：支持从 Antigravity 原生 **Settings → Appearance**、全局快捷键 **`Ctrl/Cmd+Alt+,`**（`420px` 右侧滑出抽屉，`Esc` 关闭）或状态卡底部「完整设置 →」直达。全部 13 个模块总开关集中在 `概览` 页（杜绝重复开关），低频高级项收纳在 `<details>` 折叠区，顶部搜索框支持跨全 Tab 即时过滤，`高级` 页提供完整配置 JSON 导出、校验导入、内联二次确认重置（零 `window.confirm`）与运行态诊断快照。
- **统一分段式状态胶囊 HUD**：输入框底栏以单枚紧凑胶囊汇总实时指标，各分段严格跟随对应模块开关增删（`ctx` 12px 环形进度与百分比、`eta` 剩余轮数或 `m:ss` 停滞计时、`quota` 5h 配额、`queue` 排队数/暂停标志、`bookmarks` 书签数、`autoAccept` 自动审批/演练、`NOV` 双星连接标识）。检测到 Obsidian Prism 上下文卡片时自动无痕内嵌其 Shadow DOM，底栏零多余胶囊。

---

## 13 大独立开关渲染模块 + 离线存储体检（按需开关）

所有模块均可在 `概览` 页或命令行单独开关。关闭的模块零 DOM 观察器、零事件监听、零定时器开销。

| 层级 | 模块 | 默认状态 | 隔离与风险分级 | 核心能力 |
| :---: | :--- | :---: | :--- | :--- |
| **L1** | **原生界面翻译**（`hostI18n`） | **开启** | 100% 离线 · 无损热切 | 实时翻译 Antigravity 2.x 原生桌面界面，内置 **10 国语言**（简中、繁中、日、韩、西、法、德、俄、葡、英文还原）。每语种覆盖约 5,400 词条（465 核心 + 分层扩展词库 + 424 正则模板），物理豁免代码块/输入框/对话正文/斜杠命令名，穿透 Shadow DOM，支持自定义 JSON 词典热导入。 |
| **L1** | **光学主题与排版**（`themeStudio`） | 关闭 | 100% 离线 | 零 `:has()` 轻量主题变量覆写层，内置 5 套精选皮肤（原生 / 午夜墨 / 北欧灰 / 暖纸浅 / 纯黑 OLED）、CJK 中文字体与等宽代码字体调优、排版密度、紧凑侧栏、宽屏阅读宽度及净化后的自定义 CSS 注入。 |
| **L1** | **阅读导航**（`readingNav`） | 关闭 | 100% 离线 | 自动折叠超长代码块（默认 `>= 40` 行，可在设置中调为 `20/40/60/80` 行）并附加吸顶行数/展开/复制条，支持 `Alt+↑/↓` 键盘轮次跳转及联动星标的右侧迷你导轨（检测到 Prism 导航条时自动礼让）。 |
| **L2** | **自动压缩保护**（`compactGuard`） | **开启** | 100% 离线 | 自定义预警与触发阈值（`关闭` 或 `50%–98%`，默认 `80%`），默认静默自动压缩并启用视口滚动盾（阅读历史消息时不跳屏）；兼容 Lexical 两步斜杠选择、`/clear` 轻量重开与压缩后锚点续接条。 |
| **L2** | **压缩前导出**（`precompactExport`） | **开启** | 100% 离线 | 内嵌于 `compactGuard` 卡片下的子开关：压缩前一键复制或下载 `.md` 复盘档案，自动脱敏 PEM 私钥、API Key、Bearer Token 与 JWT。 |
| **L2** | **草稿防丢**（`draftGuard`） | **开启** | 100% 离线 | 按会话自动防抖暂存输入框内未发送的长提示词（7 天有效期、16 KB 上限），切会话或意外重载后空框单行一键恢复。 |
| **L2** | **提示词排队**（`promptQueue`） | **开启** | 100% 离线 | Agent 流式执行长任务时，预先排队 1–20 条后续指令；回合空闲后自动依次发送，内置**三重安全熔断**（流式中、输入框有草稿、存在待审批卡片时绝不盲发）。 |
| **L2** | **提示词库**（`promptLibrary`） | 关闭 | 100% 离线 · 只读 NOV | 输入区入口按钮 + `Ctrl/Cmd+Alt+P` 命令面板：支持斜杠指令速填、6 个中英双语高频工程模板（内置 `{{变量=默认值}}` 表单与实时预览）、自定义片段增删改与 128 KB 校验导入导出、以及只读 `agy-NOV` `ops` 模板；默认安全追加不覆盖已有草稿，绝不自动发送。 |
| **L2** | **轮次书签与档案库**（`outlineBookmarks`） | 关闭 | 100% 离线 | 在消息操作栏加入收藏星标、悬浮 `★ N` 快速回跳抽屉，以及 `Ctrl/Cmd+Shift+B` 跨会话可搜索档案库与脱敏合集导出。 |
| **L3** | **卡死与燃尽监测**（`sessionWatchdog`） | **开启** | 100% 离线 | 估算到达阈值的剩余轮数（展示于状态胶囊 HUD）、标记单轮突增，并在流式输出长时间静默（默认 3 分钟）时轻提醒并支持一键 `+5m` 延后。 |
| **L3** | **侧栏聚光与提醒**（`sessionRadar`） | 关闭 | 100% 离线 | 左侧会话列表顶部增加 `全部 / 运行中 / 待确认` 快捷筛选，支持窗口切后台时的桌面通知、零外发 WebAudio 合成提示音、浏览器本地语音播报（TTS）与 `HH:MM-HH:MM` 静音时段。 |
| **L3** | **安全自动审批**（`safeAutoAccept`） | 关闭 | **高敏默认关** · 本地 | 针对低风险内联审批卡片按策略自动放行（`readonly-safe` 只读安全 / `dev-flow` 研发闭环 / `custom` 自定义），内置**任何模式下均不可绕过的铁壁黑名单**（拦截 `rm -rf`、`git push --force`、`reset --hard`、`DROP TABLE`、`curl\|sh`、`sudo`、`.env`、`~/.ssh` 等），支持演练 Dry-Run、一键急停与 50 条审计日志。 |
| **L3** | **配额脉冲**（`quotaPulse`） | 关闭 | 100% 离线 · 纯只读 | 零凭据接触、零网络请求的只读额度观测器：记录本地 5 小时与 7 天活动估算，并捕获页面中出现的 429 / 限流 / `Resets in ...` 倒计时提示，严格区分页面实测与本地估算，杜绝号池封号风险。 |
| **CLI** | **本地存储体检**（`storage-doctor`） | CLI | 只读审计 | 独立命令行工具（`agy-sag storage audit\|backup\|export`），扫描 `~/.gemini/antigravity/` 空间占用、孤儿目录、SQLite `.db-wal` 活跃写锁状态，并支持密钥脱敏后的 Markdown/JSON 会话导出与安全备份。 |

### 4 档一键场景预设

在设置面板或 CLI（`--preset=<档位>`）随时一键切换：

- **`essential`（默认推荐）**：`hostI18n` + `compactGuard` + `precompactExport` + `draftGuard` + `promptQueue` + `sessionWatchdog`
- **`i18n-only`（仅多语言）**：仅开启 `hostI18n`，其余增强全部关闭，零打扰体验原生界面多语言
- **`power`（极客全能）**：`essential` + `readingNav` + `promptLibrary` + `outlineBookmarks` + `themeStudio` + `quotaPulse`
- **`full-auto`（全开自动）**：开启全部 13 个模块（`safeAutoAccept` 默认锁定最保守的 `readonly-safe` 档位）

---

## 原生界面多语言翻译引擎（`hostI18n`）详解

Google Antigravity 2.x 将前端界面内嵌在已签名的 Go 二进制 `language_server` 中，未提供内置多语言切换。**`agy-Sag`** 通过 Zero-ASAR CDP 在渲染进程实现无损、实时、全覆盖的多语言界面翻译：

- **开箱支持 10 种语言**：`zh-CN`（简体中文）、`zh-TW`（繁體中文）、`ja`（日本語）、`ko`（한국어）、`es`（Español）、`fr`（Français）、`de`（Deutsch）、`ru`（Русский）、`pt-BR`（Português）及 `en`（原版英文一键还原）。
- **物理级内容隔离红线**：严格跳过 `<code>`、`<pre>`、Monaco 编辑器、`.xterm` 终端、Lexical 输入框、用户/助手对话消息气泡、Git 分支与工作区名称，以及 `/compact`、`/clear` 等斜杠命令名本身（仅翻译命令右侧的说明文字）。
- **毫秒级热切与 100% 无损还原**：通过 `WeakMap` 保存每个 TextNode 与白名单属性（`placeholder`、`title`、`aria-label`）的英文原文，配合 8,000 条有界 FIFO 缓存防内存增长；切换为 `English (原版)` 或卸载插件时瞬间还原全部节点。
- **第三方翻译器防撞机制**：自动检测 Obsidian Prism 宿主翻译器（`html[data-ag-prism-host-i18n="active"]`），默认自动礼让避免双翻译器冲突，也可在设置里一键切为「主动接管」。
- **三层扩展词典（每语种约 5,400 词条）**：按 `用户自定义词典 > 内置 465 核心词条 > 扩展词库` 优先级合并。`packages/core/locales/ext/*.json` 基于 MIT 上游 [`yiheng8023/antigravity-chinese`](https://github.com/yiheng8023/antigravity-chinese) 与多语种重译构建，支持单语种 CDP 预注入（总包 `<= 1.6 MB`）、`sag:ext_pack` 零端口 Watch 桥按需拉取，以及离线 Workbench `/ext/<loc>.json` 只读路由；另可用 `collectMissing` 采集新增英文界面词条并通过 `npm run i18n:validate` 校验。详见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

---

## 快速上手

### 1. 作为 Antigravity 插件安装（推荐）

```bash
agy plugin install https://github.com/tone-leh/agy-Sag
```

或从本地源码安装到插件目录：

```bash
git clone https://github.com/tone-leh/agy-Sag.git
cd agy-Sag
npm run install:plugin
```

> **CDP 前置说明**：Zero-ASAR 附着仅连接本机已开启的 `DevToolsActivePort`。可使用跨平台启动器 `node cli/sag-cli.mjs launch --port=9222`（自动礼让 Obsidian Prism、绝不强杀已有进程，支持 `--dry-run --json`），或手动使用 `open -a Antigravity --args --remote-debugging-port=9222`。`agy-Sag` 绝不修改 `app.asar`。

### 2. 离线沙盒零侵入预览（完全不碰日常客户端）

```bash
git clone https://github.com/tone-leh/agy-Sag.git
cd agy-Sag
npm run workbench
```

浏览器打开 `http://127.0.0.1:4179`，即可在内置模拟器中现场体验：6-Tab 控制中心、`Ctrl/Cmd+Alt+,` 全局抽屉、底栏分段 HUD、`Ctrl/Cmd+Alt+P` 提示词库与变量填表、10 国语言原生界面实时热切、4 档场景预设、提示词队列出队、安全自动审批、5 套光学主题、只读配额限流与 `agy-NOV` v0.5 双向联动。

### 3. 统一命令行（CLI）速查

```bash
# 只读预览跨平台 CDP 启动计划（默认礼让 Obsidian Prism，不启停任何进程）
node cli/sag-cli.mjs launch --dry-run --json

# 跨平台带调试端口启动与保活循环（可选 --auto-relaunch-cold-start 仅限冷启动 <=5s 且优雅退出）
node cli/sag-cli.mjs launch --port=9222
node cli/sag-cli.mjs keepalive --preset=power --lang=zh-CN

# 一次性附着，并指定场景预设与目标语言
node cli/sag-cli.mjs attach --preset=power --lang=zh-CN

# 启动自适应退避 Watch 守护进程（窗口新建或 Cmd+R 重载后自动补挂）
node cli/sag-cli.mjs watch --preset=essential --lang=ja

# 100% 只读环境体检（检查 Node、CDP、Obsidian Prism 与 agy-NOV 双星协同）
node cli/sag-cli.mjs doctor

# 校验与查看全部 10 国内置 + 9 扩展界面翻译词典统计
node cli/sag-cli.mjs i18n validate
node cli/sag-cli.mjs i18n list

# 本地存储体检、WAL 写锁检测、安全备份与脱敏会话导出
node cli/sag-cli.mjs storage audit
node cli/sag-cli.mjs storage backup --out=/tmp/agy-backup --dry-run
node cli/sag-cli.mjs storage export --session=<SESSION_ID> --format=md

# 直接通过 agy-Sag 命令行查看或切换双星搭档 agy-NOV v0.5 的 13 个模块与预设
node cli/sag-cli.mjs nov status
node cli/sag-cli.mjs nov preset power
node cli/sag-cli.mjs nov enable verify

# 从活跃窗口 100% 无损卸载所有 DOM、样式与全局对象
node cli/sag-cli.mjs remove
```

---

## 架构与安全边界

```text
Antigravity 2.0 宿主（Electron 44 + language_server 本地渲染界面）
 ├── Sidecar / CLI 层（Node.js >= 22，零 npm 运行依赖）
 │    ├── cli/sag-cli.mjs        — 统一命令入口（launch / keepalive / attach / watch / doctor / i18n / storage / nov / workbench）
 │    ├── cli/launcher.mjs       — 跨平台 CDP 启动与保活控制器（Prism 礼让、冷启动保护、0600 原子熔断状态）
 │    ├── cli/watch-daemon.mjs   — 自适应退避（3s -> 30s）CDP 守护进程、sag:ext_pack 与 sag:nov_templates 零端口桥
 │    ├── cli/nov-bridge.mjs     — 0600 原子化 agy-NOV v0.5 配置桥（13 模块 / 5 预设）+ 只读 ops 模板读取器
 │    ├── cli/bundle.mjs         — 零构建 UMD 拼接器（SHA-256 幂等附着、<=1.6MB 扩展包预注入与一键全清）
 │    └── cli/storage-doctor.mjs — 只读存储诊断、WAL 活跃锁防护与密钥脱敏导出
 └── 渲染层模块化 UMD 核心（packages/core/，全部支持 100% 无损 destroy()）
      ├── coexist.js             — 配置校验、4 档预设、13 模块目录、宿主礼让与失焦休眠
      ├── host-i18n*.js          — 10 国语言 WeakMap DOM 翻译引擎 + 465 核心 + ~5k 分层扩展词库（locales/ext/）
      ├── compact-guard.js       — 静默 /compact、视口滚动盾、/clear 轻重开与锚点续接
      ├── draft-guard.js         — 按会话未发送草稿自动保护
      ├── prompt-queue.js        — 流式排队预写与三重安全熔断出队
      ├── prompt-library.js      — Ctrl/Cmd+Alt+P 提示词命令面板、{{变量}} 片段库与只读 NOV 模板
      ├── reading-nav.js         — 长代码块自动折叠、吸顶复制条与 Alt+↑/↓ 迷你轮次导轨
      ├── safe-auto-accept.js    — 策略门控自动审批 + 不可绕过铁壁高危黑名单
      ├── theme-studio.js        — 零 :has() 光学主题、CJK 字体与净化自定义 CSS
      ├── quota-pulse.js         — 100% 只读 5h/7d 配额估算与限流信号解析
      ├── status-pill.js         — 底栏统一分段状态胶囊 HUD 与 Prism 上下文卡片内嵌
      └── prism-bridge.js        — 单一真源 6-Tab 设置中心、跨 Tab 搜索与 Ctrl/Cmd+Alt+, 全局抽屉
```

**五条安全红线**：
1. **零 `app.asar` 破坏**：完整保留 Google Developer ID 签名、Apple 公证与客户端自动更新。
2. **零外部联网、零凭据接触**：`quotaPulse` 坚持纯只读，绝不读取 OAuth Token 或进行号池轮换。
3. **自动审批铁壁黑名单不可绕过**：哪怕在 `custom` 白名单放行 `.*`，破坏性命令与敏感路径依然强制拦截。
4. **零 `:has()`、零 `innerHTML`、卸载零残留**：全仓 CSS 保持零 `:has()` 与零 `.ag-cs-` 冲突，全部 UI 经 `textContent` 安全渲染，支持 `destroy()` 与 `remove` 无损清除。
5. **双星与社区生态和平共存**：与 [`agy-NOV`](https://github.com/tone-leh/agy-NOV) 保持功能零重叠，同时内置对 Obsidian Prism 的设置页融合、上下文卡内嵌、右键礼让与翻译/主题礼让机制。

---

## 本地开发与验证

```bash
npm test                 # 运行全量原生 node:test 单测套件（182/182 通过，零外部依赖）
npm run i18n:validate    # 校验全部 10 国内置 + 9 扩展界面翻译词典与正则模板（0 错误）
npm run workbench:smoke  # 对离线沙盒执行自动化 HTTP 烟雾校验（17 markers）
npm run doctor           # 只读本机环境与双星共存诊断
```

完整演进路线与产品信息架构见 [docs/ROADMAP.md](./docs/ROADMAP.md) 与 [docs/PRODUCT-IA.md](./docs/PRODUCT-IA.md)。

## 开源协议

MIT © [tone-leh](https://github.com/tone-leh)
