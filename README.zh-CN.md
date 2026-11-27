# agy-Sag

[English](./README.md)

**面向 Google Antigravity 2.0 的大而全模块化深度增强套件** *(原名 `agy-session-guard` / 领航哨)*  
内置 **10 国语言原生界面实时翻译**、自定义阈值静默 `/compact` 防爆与视口滚动盾、流式运行中 **提示词队列**、防丢 **草稿保险箱**、长对话书签与跨会话档案库、带不可绕过高危黑名单的 **规则化自动审批**、零 `:has()` **光学主题与中文字体工坊**、零封号风险的 **只读配额脉冲**，以及离线 **本地存储体检与脱敏备份 CLI**——**全部模块独立开关，各取所需**。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js >= 22](https://img.shields.io/badge/Node-%3E%3D22-339933.svg)](https://nodejs.org)
[![零运行时依赖](https://img.shields.io/badge/%E8%BF%90%E8%A1%8C%E4%BE%9D%E8%B5%96-%E9%9B%B6%E4%BE%9D%E8%B5%96-0ea5e9.svg)](#架构与安全边界)
[![Zero ASAR 无损 CDP](https://img.shields.io/badge/%E6%9E%B6%E6%9E%84-Zero%20ASAR%20CDP-f59e0b.svg)](#架构与安全边界)
[![双星搭档 agy-NOV](https://img.shields.io/badge/%E6%8E%A8%E8%8D%90%E7%BB%84%E5%90%88-agy--NOV-6366f1.svg)](https://github.com/tone-leh/agy-NOV)

---

## 双星组合：推荐同时安装 `agy-NOV` + `agy-Sag`（内置联动化学反应）

我们为 Google Antigravity 2.0 长期并行维护两款**定位清晰、功能零重叠、天然互补**的开源插件，把「纯原生安全合规」与「深入激进增强」分成两条干净的轨道，建议同时安装：

| 对比维度 | [`agy-NOV`](https://github.com/tone-leh/agy-NOV) · 纯原生工程工作台 | **`agy-Sag`**（本项目）· 激进深度增强套件 |
| :--- | :--- | :--- |
| **技术路线** | 100% 官方原生 MCP Apps (SEP-1865) + Lifecycle Hooks，**零 ASAR、零 CDP** | Zero-ASAR Electron CDP 渲染层引擎 + Watch Sidecar + 离线存储体检 CLI |
| **升级与安全特性** | 严格走官方插件协议，客户端任意升级天然稳健生效 | 零改动 `app.asar` 与 Apple 公证签名，Watch 守护进程自动重挂，卸载 0 残留 |
| **主攻场景** | 右侧栏/全局工程工作台、工具调用前安全拦截、产物审阅、长期记忆与手机遥控 | 原生 Settings 内嵌控制中心、10 国界面多语言、主聊天流与输入框控制、外观字体与本地数据治理 |
| **核心模块矩阵** | **9 大零 CDP 纯原生模块**（5 档预设，6–31 工具）：`review`、`guard`、`xray`、`turbo`、`radar`、`canvas`、`mem`、`ops`、`remote` | **11 大渲染模块 + 离线存储 CLI**（4 档预设）：`hostI18n`、`compactGuard`、`precompactExport`、`draftGuard`、`promptQueue`、`outlineBookmarks`、`sessionWatchdog`、`safeAutoAccept`、`themeStudio`、`quotaPulse`、`sessionRadar`、`storage-doctor` |

### 双星联动化学反应（零额外网络端口）

同时安装 **`agy-Sag`** 与 **`agy-NOV`** 后，内嵌于 Antigravity 原生 **Settings → Appearance** 里的 `agy-Sag` 控制中心（带可折叠摘要头、TopDeck 预设条与 5 大分组胶囊标签）会自动激活 **`✦ agy-NOV 联动`** 控制面板：

- **在 Antigravity 原生设置里直接热控 `agy-NOV`**：一键切换 `agy-NOV` 的 **5 档场景预设**（`minimal` / `core` / `power` / `local-all` / `full`）与 **9 大纯原生模块开关**。链路复用 CDP `Runtime.addBinding`（零额外 HTTP 端口）通知 Sidecar 原子更新 `agy-NOV` 的 `config.json`（`0600`），`agy-NOV` 服务端通过纯原生文件签名热同步自动刷新 `tools/list`，全程保持 `agy-NOV` 100% 零 CDP 纯净。
- **双层安全护盾（`safeAutoAccept` × `agy-NOV guard`）**：前端规则自动审批与后端 PreToolUse 密钥防火墙/改前快照协同，若检测到 `guard` 未开提供一键开启按钮。
- **压缩护航 × 记忆与透视（`compactGuard` × `agy-NOV mem` / `xray`）**：上下文自动压缩与代码锚定长期记忆、Token 透视形成闭环。
- **通知防重礼让（`sessionRadar` × `agy-NOV radar`）**：自动识别双侧提醒同时开启并提供一键去重。

> **一步装齐双星组合：**
> ```bash
> # 1) 9 合 1 纯原生协议工程工作台（100% 零 ASAR、零 CDP、升级不失效）
> agy plugin install https://github.com/tone-leh/agy-NOV
>
> # 2) 原生内嵌控制中心、10 国界面多语言与深度增强套件（Zero-ASAR CDP）
> agy plugin install https://github.com/tone-leh/agy-Sag
> ```

---

## 11 大独立开关渲染模块 + 离线存储体检（用什么开什么）

所有模块均可在 Antigravity 原生 **Settings → Appearance** 设置面板、Obsidian Prism 的 **Modules** 标签页或命令行中单独开关。关闭的模块不挂载 DOM 观察器与定时器，零后台开销。

| 模块 | 默认状态 | 隔离与风险分级 | 核心能力 |
| :--- | :---: | :--- | :--- |
| **原生界面多语言翻译**（`hostI18n`） | **开启** | 100% 离线 · 无损热切 | 实时翻译 Antigravity 2.x 原生桌面界面，内置 **10 国语言**（简中、繁中、日、韩、西、法、德、俄、葡、英文还原）。每语种含 465+ 核心 UI 词条与 25 条带参数正则模板，物理豁免代码块/输入框/对话正文/斜杠命令名，穿透 Shadow DOM，支持社区自定义 JSON 词典热导入。 |
| **自动 `/compact` 防爆**（`compactGuard`） | **开启** | 100% 离线 | 自定义预警与触发阈值（`关闭` 或 `50%–98%`，默认 `80%`），默认静默自动压缩并启用视口滚动盾（阅读历史消息时不跳屏）；兼容 Lexical 两步斜杠选择、`/clear` 轻量重开与压缩后锚点续接条。 |
| **压缩前脱敏导出**（`precompactExport`） | **开启** | 100% 离线 | 压缩前一键复制或下载 `.md` 复盘档案，自动脱敏 PEM 私钥、API Key、Bearer Token 与 JWT。 |
| **草稿保险箱**（`draftGuard`） | **开启** | 100% 离线 | 按会话自动防抖暂存输入框内未发送的长提示词（7 天有效期、16 KB 上限），切会话或意外重载后空框单行一键恢复。 |
| **运行中提示词队列**（`promptQueue`） | **开启** | 100% 离线 | Agent 正在流式执行长任务时，在输入框上方预先排队写好 1–20 条后续指令；回合结束且空闲时自动依次发送，内置**三重安全熔断**（流式中、输入框有草稿、存在待审批卡片时绝不盲发）。 |
| **卡死与燃尽监测**（`sessionWatchdog`） | **开启** | 100% 离线 | 估算到达阈值的剩余对话轮数、标记单轮大幅突增，并在流式输出长时间静默（默认 3 分钟）时轻提醒并支持一键 `+5m` 延后。 |
| **轮次书签与档案库**（`outlineBookmarks`） | 关闭 | 100% 离线 | 在消息操作栏加入收藏星标、悬浮 `★ N` 快速回跳抽屉，以及 `Ctrl/Cmd+Shift+B` 跨会话可搜索档案库与脱敏合集导出。 |
| **规则化安全自动审批**（`safeAutoAccept`） | 关闭 | **高敏默认关** · 本地 | 针对低风险内联审批卡片按策略自动放行（`readonly-safe` 只读安全 / `dev-flow` 测试构建闭环 / `custom` 自定义），内置**任何模式下均不可绕过的铁壁黑名单**（拦截 `rm -rf`、`git push --force`、`reset --hard`、`DROP TABLE`、`curl\|sh`、`sudo`、`.env`、`~/.ssh` 等），支持演练 Dry-Run、一键急停与 50 条审计日志。 |
| **光学主题与排版工坊**（`themeStudio`） | 关闭 | 100% 离线 | 零 `:has()` 轻量主题变量覆写层，内置 5 套精选皮肤（原生 / 午夜墨 / 北欧灰 / 暖纸浅 / 纯黑 OLED）、CJK 中文字体与等宽代码字体调优、密度调节、紧凑侧栏、宽屏列宽优化及净化后的自定义 CSS 注入。 |
| **只读配额脉冲**（`quotaPulse`） | 关闭 | 100% 离线 · 纯只读 | 零凭据接触、零网络请求的只读额度观测器：记录本地 5 小时与 7 天活动估算，并自动捕获页面中出现的 429 / 限流 / `Resets in ...` 倒计时提示，严格区分页面实测与本地估算，杜绝号池封号风险。 |
| **侧栏聚光**（`sessionRadar`） | 关闭 | 100% 离线 | 左侧会话列表顶部增加 `全部 / 运行中 / 待确认` 快捷筛选，支持窗口切后台时的桌面提醒。 |
| **本地存储体检与备份**（`storage-doctor` CLI） | CLI | 只读审计 | 独立命令行工具（`agy-sag storage audit\|backup\|export`），扫描 `~/.gemini/antigravity/` 空间占用大户、孤儿目录、SQLite `.db-wal` 活跃写锁状态，并支持密钥脱敏后的 Markdown/JSON 会话导出与安全备份。 |

### 4 档一键场景预设

在设置面板或 CLI（`--preset=<档位>`）随时一键切换：

- **`essential`（默认推荐）**：`hostI18n` + `compactGuard` + `precompactExport` + `draftGuard` + `promptQueue` + `sessionWatchdog`
- **`i18n-only`（纯粹汉化/多语言）**：仅开启 `hostI18n`，其余增强全部关闭，零打扰体验原生界面多语言
- **`power`（极客全能）**：`essential` + `outlineBookmarks` + `themeStudio` + `quotaPulse`
- **`full-auto`（全开无人值守）**：开启全部模块（`safeAutoAccept` 默认锁定最保守的 `readonly-safe` 档位）

---

## 原生界面多语言翻译引擎（`hostI18n`）详解

Google Antigravity 2.x 将 12.8 MB 前端界面内嵌在已签名的 Go 二进制 `language_server` 中，且未提供内置多语言切换。**`agy-Sag`** 通过 Zero-ASAR CDP 在渲染进程实现无损、实时、全覆盖的多语言界面翻译：

- **开箱支持 10 种语言**：`zh-CN`（简体中文）、`zh-TW`（繁體中文）、`ja`（日本語）、`ko`（한국어）、`es`（Español）、`fr`（Français）、`de`（Deutsch）、`ru`（Русский）、`pt-BR`（Português）及 `en`（原版英文一键还原）。
- **物理级内容隔离红线**：严格跳过 `<code>`、`<pre>`、Monaco 编辑器、`.xterm` 终端、Lexical 输入框、用户/助手对话消息气泡、Git 分支与工作区名称，以及 `/compact`、`/clear` 等斜杠命令名本身（仅翻译命令右侧的说明文字）。
- **毫秒级热切与 100% 无损还原**：通过 `WeakMap` 保存每个 TextNode 与白名单属性（`placeholder`、`title`、`aria-label`）的英文原文，配合 8,000 条有界 FIFO 缓存防内存增长；切换为 `English (原版)` 或卸载插件时瞬间还原全部节点。
- **第三方翻译器防撞机制**：自动检测 Obsidian Prism 宿主翻译器（`html[data-ag-prism-host-i18n="active"]`），默认自动礼让避免双翻译器打架闪烁，也可在设置里一键切为「主动接管」。
- **可扩展词典与未命中采集器**：支持热导入自定义 JSON 词典；开启未命中采集器可离线收集新增版本的英文 UI 词条（自动过滤路径/URL/密钥），并用 `npm run i18n:validate` 一键校验词库完整性。

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

> **CDP 前置说明**：Zero-ASAR 附着仅连接本机已开启的 `DevToolsActivePort`（例如 macOS 使用 `open -a Antigravity --args --remote-debugging-port=0` 启动，或与 Obsidian Prism 启动器配合使用）。`agy-Sag` 绝不修改 `app.asar`，也绝不强制重启客户端。

### 2. 离线沙盒零侵入预览（完全不碰日常客户端）

```bash
git clone https://github.com/tone-leh/agy-Sag.git
cd agy-Sag
npm run workbench
```

浏览器打开 `http://127.0.0.1:4179`，即可在内置模拟器中现场体验：10 国语言原生界面实时热切（直观验证代码块与正文物理豁免）、4 档场景预设、上下文压缩与滚动保护、提示词队列出队、安全自动审批（`npm test` 自动放行对比 `rm -rf` 铁壁拦截）、5 套光学主题与只读配额限流模拟。

### 3. 统一命令行（CLI）速查

```bash
# 一次性附着，并指定场景预设与目标语言
node cli/sag-cli.mjs attach --preset=power --lang=zh-CN

# 启动自适应退避 Watch 守护进程（窗口新建或 Cmd+R 重载后自动补挂）
node cli/sag-cli.mjs watch --preset=essential --lang=ja

# 100% 只读环境体检（检查 Node、CDP、Obsidian Prism 与 agy-NOV 双星协同）
node cli/sag-cli.mjs doctor

# 校验与查看全部 10 国界面翻译词典统计
node cli/sag-cli.mjs i18n validate
node cli/sag-cli.mjs i18n list

# 本地存储体检、WAL 写锁检测、安全备份与脱敏会话导出
node cli/sag-cli.mjs storage audit
node cli/sag-cli.mjs storage backup --out=/tmp/agy-backup --dry-run
node cli/sag-cli.mjs storage export --session=<SESSION_ID> --format=md

# 直接通过 agy-Sag 命令行查看或切换双星搭档 agy-NOV 的模块与预设
node cli/sag-cli.mjs nov status
node cli/sag-cli.mjs nov preset power
node cli/sag-cli.mjs nov enable canvas

# 从活跃窗口 100% 无损卸载所有 DOM、样式与全局对象
node cli/sag-cli.mjs remove
```

---

## 架构与安全边界

```text
Antigravity 2.0 宿主（Electron 44 + language_server 本地渲染界面）
 ├── Sidecar / CLI 层（Node.js >= 22，零 npm 运行依赖）
 │    ├── cli/sag-cli.mjs        — 统一命令入口（attach / watch / doctor / i18n / storage / workbench）
 │    ├── cli/watch-daemon.mjs   — 自适应退避（3s -> 30s）CDP 守护进程 + 轻量探针
 │    ├── cli/bundle.mjs         — 零构建 UMD 拼接器（SHA-256 幂等附着 + 一键全清）
 │    └── cli/storage-doctor.mjs — 只读存储诊断、WAL 活跃锁防护与密钥脱敏导出
 └── 渲染层模块化 UMD 核心（packages/core/，全部支持 100% 无损 destroy()）
      ├── coexist.js             — 配置校验、4 档预设、模块目录、宿主礼让与失焦休眠
      ├── host-i18n*.js          — 10 国语言 WeakMap DOM 翻译引擎 + 465 词条离线库
      ├── compact-guard.js       — 静默 /compact、视口滚动盾、/clear 轻重开与锚点续接
      ├── draft-guard.js         — 按会话未发送草稿自动保护
      ├── prompt-queue.js        — 流式排队预写与三重安全熔断出队
      ├── safe-auto-accept.js    — 策略门控自动审批 + 不可绕过铁壁高危黑名单
      ├── theme-studio.js        — 零 :has() 光学主题、CJK 字体与净化自定义 CSS
      ├── quota-pulse.js         — 100% 只读 5h/7d 配额估算与限流信号解析
      └── prism-bridge.js        — 统一设置中心（适配原生设置弹窗与 Obsidian Prism）
```

**四条安全红线**：
1. **零 `app.asar` 破坏**：完整保留 Google Developer ID 签名、Apple 公证与客户端自动更新。
2. **零外部联网、零凭据接触**：`quotaPulse` 坚持纯只读，绝不读取 OAuth Token 或进行号池轮换。
3. **自动审批铁壁黑名单不可绕过**：哪怕在 `custom` 白名单放行 `.*`，破坏性命令与敏感路径依然强制拦截。
4. **双星与社区生态和平共存**：与 [`agy-NOV`](https://github.com/tone-leh/agy-NOV) 保持功能零重叠，同时内置对 Obsidian Prism 的设置页融合与翻译/主题礼让机制。

---

## 本地开发与验证

```bash
npm test                 # 运行全量原生 node:test 单测套件（零外部依赖）
npm run i18n:validate    # 校验全部 10 国界面翻译词典与正则模板
npm run workbench:smoke  # 对离线沙盒执行自动化 HTTP 烟雾校验
npm run doctor           # 只读本机环境与双星共存诊断
```

## 开源协议

MIT © [tone-leh](https://github.com/tone-leh)
