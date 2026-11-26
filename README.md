<div align="center">

<img src="assets/logo.svg" width="96" height="96" alt="Antigravity Session Guard Logo" />

# Antigravity Session Guard · 领航哨

**别等上下文飙到 102% 才想起压缩，别让子代理在后台干等二十分钟。**

自定义压缩阈值与提前确认 · 轮次星标与压缩前脱敏导出 · 侧栏待审批聚光与失焦提醒

[**简体中文**](./README.md) · [**English**](./README.en.md) · [**更新日志**](./CHANGELOG.md) · [**架构与共存契约**](./docs/ARCHITECTURE.md) · [**问题反馈**](https://github.com/tone-leh/agy-session-guard/issues)

<p>
  <a href="https://github.com/tone-leh/agy-session-guard/releases"><img src="https://img.shields.io/github/v/release/tone-leh/agy-session-guard?style=flat-square&color=3186ff&label=Release" alt="Latest Release" /></a>
  <img src="https://img.shields.io/badge/Antigravity-2.34%20%7C%202.35+-0f172a?style=flat-square" alt="Antigravity 2.34 | 2.35+" />
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-1e293b?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/badge/Zero--ASAR-0_Runtime_Deps-059669?style=flat-square" alt="Zero-ASAR & Zero Runtime Deps" />
  <img src="https://img.shields.io/badge/i18n-8%2B1_Languages-d97706?style=flat-square" alt="8+1 Languages" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-6366f1?style=flat-square" alt="License: MIT" /></a>
</p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/hero-dark.svg" />
  <source media="(prefers-color-scheme: light)" srcset="assets/hero-light.svg" />
  <img src="assets/hero-dark.svg" width="100%" alt="Antigravity Session Guard v0.2 深浅双主题界面预览" />
</picture>

<sub>自动跟随 GitHub 深浅模式渲染 · 本地执行 <code>npm run workbench</code> 即可打开离线交互舞台，拖动上下文滑块从 10% 实测到 115%（不触碰正在运行的 Antigravity）。</sub>

</div>

> **非官方开源声明 (Non-Affiliation Disclaimer)**  
> **Antigravity Session Guard is an independent MIT open-source project and is not affiliated with or endorsed by Google LLC.**  
> 本项目为独立社区开源工程，不修改任何官方安装包或 `app.asar`；文中出现的 “Antigravity” 与 “Google” 仅用于说明兼容对象。

---

## 写代码正上头时，最怕这三件事

长会话和多子代理协作里，有三个高频痛点宿主本身暂时没补齐：

1. **经常冲到 `102%` 还没压缩**：宿主协议只上报 `estimatedTokensUsed / maxContextTokens`，并没有可配置的压缩阈值字段；单轮大段工具输出一冲过去就爆窗，等想起来手敲 `/compact` 往往已经晚了。
2. **要压缩了，又怕关键结论被压丢**：前面几轮好不容易敲定的架构方案和排查根因，手动一条条复制太慢，不备份直接 `/compact` 又不踏实。
3. **后台会话卡在「等待确认」，人却切去看了别处**：开着三四个并行会话或子代理，其中一个早就在等审批，切回来才发现白白干等了十几分钟。

**领航哨（Session Guard）** 把这三件事串成一条顺手的闭环，装一次、全模块化按需开关：

| 不爆窗 · Compact Guard | 不丢档 · Bookmarks & Export | 不空等 · Session Radar |
| :--- | :--- | :--- |
| 到自定义阈值（如 `75%` / `80%`）就在输入框上方弹出确认条，一键 `/compact` 或开启空闲 5 秒可取消倒计时。 | 随手点亮每轮提问的 `☆ → ★` 书签；压缩前一键导出脱敏 Markdown 复盘，自动剔除密钥、Bearer 与 JWT。 | 侧栏顶部增加 `全部 / 运行中 / 待确认` 聚光条；切出窗口后，仅在需要审批或任务完成时发系统桌面通知。 |

---

## 功能图景与交互细节

### 1. 上下文压缩守卫（Compact Guard）

<p align="center">
  <img src="assets/guard-states.svg" width="100%" alt="Compact Guard 三态状态机：提前确认、空闲 5s 倒计时与草稿保护、102% 超限急报与自动复位" />
</p>

- **阈值你说了算**：通过浮条右上角的 `⚙` 快捷浮窗随时切换 `关闭 / 70% / 75% / 80% / 85% / 90%`（API 支持任意 `50%–98%` 整数），无需翻找宿主设置页。
- **智能压缩焦点预设（`/compact <focus>`）**：不再只能发裸 `/compact`；可在 `⚙` 浮窗里切换 **默认 / 代码与报错 / ★ 书签决策 / 自定义提示**，自动拼接脱敏后的精准保留指令并在浮条上高亮展示当前焦点标签。
- **三种触发姿势**：
  - **浮条确认（默认）**：超过阈值时弹出克制的玻璃态浮条，点「确认压缩 `/compact`」或「仅填入」由你拍板；飙到 `>= 100%` 时切换猩红超限高亮。
  - **仅填入（最保守）**：只把 `/compact` 指令放进输入框，绝不替你按回车。
  - **空闲 5s 倒计时（可选进阶）**：只有当 **超过阈值 + 本轮非生成中 + 输入框完全为空 + 窗口处于激活态** 四个条件同时成立时才开始 5 秒倒计时；期间敲任意一个字或点「取消自动」，倒计时**瞬间熔断中止**。
- **压缩后无损续接卡 + 自动复位**：执行 `/compact` 前自动静默留存一份本会话「★ 书签关键结论」脱敏锚点；监听宿主 `compactedAtStepIndices` 增长或占比回落 `>= 10%` 后不仅自动清零忽略记录，还会浮现 1 行翠绿 **「填入续接提示 / 复制锚点」** 小条（严格遵循草稿零覆盖原则），防止压缩后 AI 遗忘硬约束。
- **回合卡死检测 & 上下文燃尽预测（Session Watchdog）**：追踪每轮 Token 增量估算「约剩 N 轮达阈值」并标记单轮 `>= 18%` 突增；若生成中连续 `2 / 3 / 5 分钟` 毫无新输出，即使未达上下文阈值也主动弹出停滞告警，并可联动失焦桌面通知。

### 2. 轮次书签 & 原生快捷跳转抽屉 & 压缩前脱敏导出（Outline Bookmarks + Pre-Compact Export）

- **单轮随手标星 + 原生 `★ N` 跳转抽屉（无需依赖皮肤也能用）**：在每轮用户消息气泡上挂载轻量 `☆ / ★` 按钮，按 `cascadeId` 本地持久化；一旦本会话有标星轮次，会话顶部右上角自动浮现紧凑的 **`★ N` 跳转胶囊**（0 书签时完全隐藏不占位），展开即可看到脱敏后的轮次摘要，点击平滑滚动定位并高亮闪烁目标气泡；若安装了 Obsidian Prism，还会自动联动其左侧提问大纲浮窗的 `★ N` 仅看书签筛选。
- **跨会话书签档案库（`Ctrl/Cmd + Shift + B`）**：点抽屉或 `⚙` 浮窗里的「全部档案库」即可跨全部历史会话实时检索标星提问与回复片段、单条/按会话清理，或一键复制/下载跨会话脱敏 Markdown 合集（100% 本地存储，零后端）。
- **复制与 `↓ .md` 一键双出口**：一旦当前会话有标星轮次，压缩浮条上的导出按钮会自动切换为 **`仅导出 ★ (N)`**（一键复制到剪贴板），旁边紧邻 **`↓ .md`** 按钮（以及书签抽屉底部「下载 ★ .md」），直接把跨平台安全命名的 `.md` 复盘文件保存到本地，再点 `/compact` 一气呵成。
- **默认全量脱敏**：导出与抽屉摘要均自动清洗 `sk-` / `rk-` / `pk-` / `ak-` / `AIza` / `ghp_` / `Bearer Token` / `JWT` 及 `PEM PRIVATE KEY` 块，避免复盘笔记误带敏感凭据。

### 3. 多会话聚光雷达（Session Radar · 默认关闭，按需开启）

- 在侧边栏顶部插入紧凑的 `全部 / 运行中 / 待确认` 三段聚光胶囊，带实时数量徽章，有待审批会话时琥珀描边提醒，一键只看卡住的会话。
- **失焦桌面提醒**提供三档：`关闭（默认）` / `仅待确认` / `待确认与完成`。仅在窗口切出或隐藏时才发系统通知，你在当前窗口看着屏幕时绝不弹窗打扰；点击通知直接聚焦窗口并跳回对应会话。

---

## 模块总览与工程守则

| 模块 | 默认态 | 核心职责 | 独立源码（可单独引入） |
| :--- | :---: | :--- | :--- |
| **Compact Guard** | 开启（80% 浮条确认） | 上下文阈值预警、智能 `/compact <focus>` 预设、压缩后无损续接卡、5s 倒计时、`↓ .md` 下载 | [`packages/core/compact-guard.js`](./packages/core/compact-guard.js) |
| **Draft Guard** | 开启 | 按 `cascadeId` 防抖暂存未发送草稿（防切会话/`Cmd+R` 重载丢字），空输入框时 1 行轻提示恢复，发送即清 | [`packages/core/draft-guard.js`](./packages/core/draft-guard.js) |
| **Outline Bookmarks & Vault** | 开启 | 单轮 `☆/★` 书签、原生 `★ N` 浮动跳转抽屉、跨会话书签档案库（`Ctrl+Shift+B`）、Prism 大纲筛选 | [`packages/core/outline-bookmarks.js`](./packages/core/outline-bookmarks.js) · [`bookmark-vault.js`](./packages/core/bookmark-vault.js) |
| **Pre-Compact Export & Handoff** | 开启 | 压缩前一键复制/下载 `.md` 脱敏复盘、压缩后锚点回填、**「开新会话续接」一键 Handoff 提示词导出** | [`packages/core/precompact-export.js`](./packages/core/precompact-export.js) · [`recovery-handoff.js`](./packages/core/recovery-handoff.js) |
| **Session Watchdog** | 开启（3m 卡死阈值） | 上下文燃尽速率估算（约剩 N 轮）、单轮 `>=18%` 突增标记、流式静默卡死监测与 **`+5m 延后（Snooze）`** | [`packages/core/session-watchdog.js`](./packages/core/session-watchdog.js) |
| **Prism Unified Bridge** | 自动检测 | 与 Obsidian Prism 同装时自动把设置面板接入 Prism 设置页「模块」标签，双向实时同步配置与 8 语种切换 | [`packages/core/prism-bridge.js`](./packages/core/prism-bridge.js) |
| **Session Radar** | 关闭（按需开启） | 侧栏 `全部/运行中/待确认` 聚光过滤条、失焦系统桌面通知（含卡死提醒） | [`packages/core/session-radar.js`](./packages/core/session-radar.js) |
| **Watch Daemon & Doctor** | CLI 按需运行 | `npm run watch` 自适应退避守护 + **`npm run doctor`** 一键环境与 Prism 共存体检 | [`cli/watch-daemon.mjs`](./cli/watch-daemon.mjs) · [`cli/doctor.mjs`](./cli/doctor.mjs) |

**五条硬红线（写进单测，每次提交必检）：**
1. **Zero-ASAR & 不重启宿主**：纯 CDP 动态附着已有本地调试端口，绝不改 `app.asar`、不强杀或重启客户端。
2. **三重防误触**：流式生成中禁止触发；输入框有任何草稿拒绝填入并秒停倒计时；忽略后静默至再涨 `+10%` 或完成压缩。
3. **零运行时依赖 & 8+1 语种内置**：纯原生 Node.js `>= 22` + UMD 前端脚本，内置简中 / 繁中 / 粤语 / English / 日本語 / 한국어 / Español / Français / Deutsch，自动跟随界面语言。
4. **0 `:has()` & 0fps 后台休眠**：全套样式只读宿主 CSS 变量，窗口失焦或隐藏立刻暂停全部定时器。
5. **100% 无损退场**：`npm run remove` 或 `window.__agSessionGuard.destroy()` 彻底移除样式、Owned DOM、监听器和全局对象，恢复如初。

---

## 快速上手

环境要求：**Node.js >= 22**（零第三方 npm 依赖，无需 `npm install`）。

### 方式一：30 秒离线预览工作台（推荐先玩一遍，零碰本机 Antigravity）

```bash
git clone https://github.com/tone-leh/agy-session-guard.git
cd agy-session-guard

# 运行全套单元测试（22 项测试约 0.16s 完成）
npm test

# 启动离线交互工作台
npm run workbench
# 浏览器打开 http://127.0.0.1:4179
```

在离线工作台里你可以直接：
- 拖动上下文滑块从 `10%` 拉到 `102%`，看琥珀预警如何切为猩红超限；
- 在输入框里随便敲几个字，验证草稿保护如何拦住自动填入并秒停 5s 倒计时；
- 点亮右侧气泡的 `☆ → ★` 书签，展开顶部原生 `★ N` 跳转抽屉定位轮次，并一键复制或下载 `.md` 脱敏复盘；
- 切换 4 套皮肤配色（Obsidian Dark / Daylight Crystal / Warm Alabaster / Warm Dark）与 5 种界面语言。

### 方式二：Zero-ASAR 附着或后台守护运行中的 Antigravity

> 前提：Antigravity 已携带 `--remote-debugging-port=0` 启动（如果你已安装 Obsidian Prism，调试端口已经就绪；原生 macOS 用户也可通过 `open -a "/Applications/Antigravity.app" --args --remote-debugging-port=0` 启动）。

```bash
# 0. 一键只读环境体检（检查 Node >= 22、CDP 端口、窗口挂载与 Obsidian Prism 共存状态）
npm run doctor

# 1. 先预演检查将命中的宿主窗口（只读，不注入）
node cli/cdp-attach.mjs --attach --dry-run

# 2. 单次附着挂载（可带初始参数 --threshold=75 --mode=confirm）
npm run attach

# 3. 或者启动轻量 Watch Daemon：自动发现端口、新开/重载窗口自动补挂（绝不重启宿主）
npm run watch
# 支持参数：node cli/watch-daemon.mjs --threshold=75 --mode=confirm --interval=3000 --max-backoff=30000

# 4. 查看实时运行状态与模块 debug 信息 / 100% 无损卸载还原
npm run status
npm run remove
```

---

## 与社区皮肤 / 遥测插件和平共存（轻量独立 vs 全套视觉套件）

如果你喜欢 **[Obsidian Prism](https://github.com/RMvdesi/obsidian-prism)** 的全套视觉主题、桌宠、3D 元素周期表与 WebGL2 动效，两者可无缝叠用；如果你觉得整套皮肤插件太重，**只想要「自定义压缩阈值 / 压缩后无损续接 / 轮次书签与跨会话档案库 / 卡死提醒」这几个纯粹的效率功能**，**领航哨（Session Guard）** 可以完全独立运行，零视觉入侵、按模块随开随关：

| 对比维度 | **Antigravity Session Guard（领航哨）** | **Obsidian Prism（全套视觉增强套件）** |
| :--- | :--- | :--- |
| **核心定位** | 纯效率向轻量化会话守卫（不改宿主主题、无桌宠/WebGL2） | 全套光学 UI 主题、弹簧动效、3D 模型选择器、桌宠、记忆与存储治理 |
| **安装负担** | 零 npm 依赖、Zero-ASAR、`npm run attach` / `watch` 秒级无损进退 | 独立安装器 + 12 通道按需扩展 + 守护进程 |
| **多分屏 & 语种** | 原生适配 Antigravity 多分屏焦点窗格 + **8+1 语种**（与 Prism v1.0.8 1:1 对齐） | 原生多分屏隔离（`v1.0.8-beta.2`）+ 8 语种完整国际化 |
| **叠加共存** | 自动复用 `window.__agPrismMetricsBridge`（0 重复轮询）、`data-ag-no-i18n="1"` 免疫、支持 `window.__agSessionGuardOwner` 自动礼让（详见 [`docs/PRISM_CHANNEL_INTEGRATION.md`](./docs/PRISM_CHANNEL_INTEGRATION.md)） | 可随时按 MIT 协议将任意核心模块吸收为独立按需 Channel（0 Channel 1 体积增量） |

| 搭配对象 | 协作机制 |
| :--- | :--- |
| **[Obsidian Prism](https://github.com/RMvdesi/obsidian-prism)** | 零重复轮询直接复用 `window.__agPrismMetricsBridge`；**自动在 Prism 设置页「模块」标签内嵌统一设置区并双向实时同步**，跟随 `data-ag-cs-lang` / `data-ag-cs-theme` 即时刷新；所有 Owned DOM 标注全套 i18n 跳过属性免被 Channel 4 误译；左侧大纲自动挂载书签筛选；若未来被 Prism 吸收，设置 `window.__agSessionGuardOwner = 'obsidian-prism'` 即自动礼让退出。 |
| **[AG Pulse (`antigrative-dashboard`)](https://github.com/ATtacK030130/antigrative-dashboard)** | 自动读取 `window.agPulseHost` 或状态条 Shadow DOM 上下文百分比，不抢占不冲突。 |
| **原生无插件 Antigravity** | 自动回退轻量 DOM 估算与宿主原生 CSS 变量，开箱即用。 |

<details>
<summary><strong>CLI 参数速查、目录结构与下游集成示例（点击展开）</strong></summary>

#### CLI 选项
```bash
node cli/cdp-attach.mjs --attach --threshold=75 --mode=confirm         # 自定义 75% 浮条确认
node cli/cdp-attach.mjs --attach --threshold=80 --mode=auto-countdown  # 80% 空闲 5s 倒计时
node cli/cdp-attach.mjs --attach --port=9222                           # 手动指定 CDP 端口
node cli/watch-daemon.mjs --threshold=75 --interval=3000               # 常驻守护：新开/重载窗口自动附着
node cli/watch-daemon.mjs --once --json                                # 单次核对并输出 JSON（便于脚本/计划任务）
node cli/cdp-attach.mjs --remove                                       # 100% 无损卸载
```

#### 仓库结构
```text
agy-session-guard/
├── assets/                   # 品牌 Logo 与深浅双主题矢量演示图
├── packages/core/            # 零依赖 UMD 核心模块（可直接被下游 vendor/ 引入）
│   ├── compact-guard.js      #   G: 上下文压缩阈值、确认浮条、5s 倒计时、快捷浮窗
│   ├── outline-bookmarks.js  #   D: 轮次星标书签与左侧大纲书签过滤
│   ├── precompact-export.js  #   D: 压缩前结构化 Markdown 导出与凭据脱敏
│   ├── session-radar.js      #   B: 侧栏状态聚光条与失焦系统通知
│   ├── context-source.js     #   上下文数据源桥接（Prism/Pulse 优先，DOM 回退）
│   ├── coexist.js            #   Owner 礼让协议、配置校验与 0fps 休眠
│   ├── styles.js             #   纯宿主 CSS 变量自适应样式（0 :has()）
│   ├── i18n.js               #   5 语种内置词表
│   └── index.js              #   统一挂载入口 mountSessionGuard()
├── cli/                      # Zero-ASAR 纯 CDP 挂载器与零-eval 打包器
├── workbench/                # 离线交互预览工作台（localhost:4179）
├── docs/                     # 架构与共存契约文档 + GitHub Actions CI 模板
└── test/                     # Node 22 原生测试套件（node --test）
```

#### 下游主题套件按需集成示例（MIT 向上兼容 GPL-3.0）
```js
// 标记由宿主套件接管（独立 CDP 注入将自动礼让）
window.__agSessionGuardOwner = 'obsidian-prism';

const guard = window.__agSgCore.mountSessionGuard({
  win: window,
  doc: document,
  source: 'obsidian-prism',
  persistConfig: false, // 交给宿主设置中心持久化
  config: {
    compactThreshold: 80,
    compactTriggerMode: 'confirm',
    modules: { compactGuard: true, precompactExport: true, outlineBookmarks: true, sessionRadar: false },
  },
});
```

</details>

---

## 当前验证范围

| 项目 | 验证方式 | 当前状态 |
| :--- | :--- | :--- |
| 核心状态机、智能压缩焦点、无损续接、跨会话档案库、卡死与燃尽监测、Watch Daemon | Node.js 22 `node --test`（22 项单测） | 全部通过 |
| 四套主题变量适配、5 语种切换、无损 `destroy()` | 离线交互工作台（`workbench/server.mjs`）+ 单元冒烟 | 已验证 |
| Zero-ASAR CDP 附着与目标白名单 | 参数校验与目标过滤单测 + `--dry-run` 路径 | 已验证（跨平台真机实测持续补充中） |

---

## 开源许可

本项目基于 **[MIT License](./LICENSE)** 开源，可自由使用、修改或整合进其他开源项目（包括 `GPL-3.0` 项目，保留版权声明即可）。欢迎提交 Issue 与 Pull Request 一起把 Antigravity 的长会话体验打磨得更顺手。
