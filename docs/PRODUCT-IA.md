# agy-Sag 产品信息架构与视觉规范（Product IA）

> 本文档是 `agy-Sag` 功能分层、设置面板组织、命名一致化与 `agy-NOV` 视觉统一的唯一权威参考，每次功能迭代须对照本文档执行简化检查，防止开关重复与入口膨胀。

---

## 一、五层产品功能层级（Target IA）

```text
L0 基础设施（常驻内核，不计入可选模块开关）
 ├── 统一设置中心（原生 Settings 页 / 右侧抽屉 Ctrl/Cmd+Alt+, / 状态卡直达）
 ├── 统一状态胶囊 HUD（分段式实时指标 + 快捷动作浮卡）
 └── 共存仲裁（coexist.js：配置迁移清洗、Prism 礼让切换、失焦低功耗休眠）

L1 界面层「看得懂」（Tab: 界面 | ui）
 ├── hostI18n        — 10 语种弱引用 DOM 原生界面翻译（默认 ON）
 ├── themeStudio     — 零 :has() 光学皮肤、CJK 字体排版与安全自定义 CSS（默认 OFF）
 └── readingNav      — 长代码自动折叠、吸顶复制与 Alt+↑/↓ 迷你导航（默认 OFF，power/full-auto 开启）

L2 对话层「用得顺」（Tab: 对话 | conversation）
 ├── compactGuard    — 自动静默 /compact、视口滚动盾与 /clear 轻重开（默认 ON，含 precompactExport 子开关）
 ├── draftGuard      — 按会话未发送草稿保险箱（默认 ON）
 ├── promptQueue     — 流式运行中提示词排队与三重安全熔断（默认 ON）
 ├── promptLibrary   — 斜杠速填、变量片段库与只读 NOV 模板面板（默认 OFF，power/full-auto 开启）
 └── outlineBookmarks— 单轮星标书签与跨会话档案库 Ctrl/Cmd+Shift+B（默认 OFF）

L3 守护层「守得住」（Tab: 守护 | guard）
 ├── sessionWatchdog — 燃尽率剩余轮数预测与流式卡死监测（默认 ON）
 ├── sessionRadar    — 侧栏运行/待确认聚光、失焦桌面与音频/本地语音提醒（默认 OFF）
 ├── safeAutoAccept  — 受铁壁黑名单保护的前端规则化自动审批（默认 OFF，Strict Opt-in）
 └── quotaPulse      — 纯只读、零凭据 5h/7d 活动台账与限流倒计时识别（默认 OFF）

L4 双星联动「1+1>2」（Tab: 双星 NOV | nov）
 └── agy-NOV 零端口桥 — 13 模块 / 5 预设即时热控 + 只读数据流呈现（guard/radar/mem/spec）
```

> **向后兼容与反膨胀约束**：`config.modules` 稳定维持 13 个模块键名（v1.2 阶段 8–12 坚持 **0 新增顶级模块开关**，全部新能力自然内聚于既有模块与 `高级` 页，避免开关泛滥）。

---

## 二、设置中心结构与单一真源原则

### 1. 三处统一入口（共用同一视图渲染内核）
1. **原生 Settings → Appearance 页末尾**（当检测到 Obsidian Prism 设置卡片时嵌入其 `modules` 容器内，否则追加于外观设置页末尾）。
2. **全局设置抽屉**：按 `Ctrl/Cmd+Alt+,` 打开右侧 `420px` 抽屉（`Esc` 关闭，`destroy()` 零残留）。
3. **状态胶囊快捷卡**：底部「完整设置 →」直达按钮。

### 2. 面板总体结构
```text
设置容器 (.ag-sag-suite-panel)
├─ 摘要头（Brand 渐变六边形 S 图标 + "{enabled}/{total} 已启用" + 当前语言徽章 + NOV 状态胶囊 + 搜索输入框）
├─ 场景预设行（核心推荐 essential / 仅多语言 i18n-only / 极客全能 power / 全开自动 full-auto / 自定义提示）
└─ 6 个一级 Tab（带 6px 状态绿点指示）
   ├─ overview      「概览」     — 唯一放置全部模块总开关的地方（按 L1/L2/L3 分组，含"设置 →"直达跳转）
   ├─ ui            「界面」     — 翻译语种、冲突策略、主题皮肤/字体/密度 + <details> 高级（自定义词典工具、侧栏/宽屏/自定义CSS）
   ├─ conversation  「对话」     — 压缩阈值/触发模式/Focus 预设、排队说明、提示词库导入导出与书签/草稿管理
   ├─ guard         「守护」     — 卡死静默秒数、侧栏与提醒模式（含音频/本地TTS）、安全审批策略与演练、配额软预算阈值
   ├─ nov           「双星 NOV」 — 连接状态横幅、5 预设、按分类组织 13 张模块开关卡、双星协同效果实时状态
   └─ advanced      「高级」     — 完整配置 JSON 导出 / 校验导入 / 内联二次确认恢复默认 / 诊断摘要
```

### 3. 单一真源强制规则（每个迭代后必检）
1. **开关零重复**：每个模块的总开关**只存在于 `概览 (overview)`** 中；专属层级 Tab 内只渲染参数调节控件，不再重复渲染模块总开关。
2. **参数零重复**：`compactThreshold`（自动压缩阈值）等核心参数只在专属 Tab 出现，状态胶囊快捷卡只保留只读指标展示与高频动作（立即压缩、轻量重开、书签库、完整设置）。
3. **高阶必折叠**：`themeCompactSidebar`、`themeWideReadable`、`themeCustomCss`、自定义语言包 JSON 编辑器、`collectMissing`、`autoAcceptCustomPatterns`、`quotaSoftTurns5h/7d` 等高级项统一收纳在所属 Tab 的 `<details>` 折叠区内，保持日常视图清爽。
4. **即时全局搜索**：摘要头搜索输入框带有内容时，忽略当前 Tab 限制，统一平铺展示全部分组中匹配 `data-ag-sag-search` 的设置行，并在输入框右侧提供一键清空按钮。
5. **交互安全性**：恢复默认与高危配置重置全部采用内联互斥二次确认按钮，绝不调用 `window.confirm` / `window.alert`。

### 4. 状态胶囊 HUD 分段规则
- 状态胶囊与快捷卡只负责只读状态指标展示与快捷直达动作，`compactThreshold` 自动压缩阈值统一在设置中心「对话 (`conversation`)」Tab 调整，不在胶囊快捷卡或内嵌卡片中重复提供阈值切换按钮。
- 胶囊分段严格按模块开关动态增删（零额外配置键）：

| 分段 ID | 显示条件 | 展示文本 | 状态色（`tone`） |
| :--- | :--- | :--- | :--- |
| `ctx` | `modules.compactGuard` 开启且上下文 `%` 有效 | 12px 圆环 + `{pct}%` | 由 `computeTone(snap, cfg, watchdog)` 决定 |
| `eta` | `modules.sessionWatchdog` 开启；卡死且未忽略时显示停滞 `m:ss`，否则剩余轮数 `> 0` 时显示 `≈{n} 轮` | `停滞 {time}` / `≈{n} 轮` | 卡死 `warn`；单轮突增 `warm`；其余 `idle` |
| `quota` | `modules.quotaPulse` 开启且存在台账摘要 | `5h {pct}%`（优先实时观测，其次本地 5h 估算比例） | `ok`→`ok`、`warm`→`warm`、`warn`→`warn`、`limited`→`danger` |
| `queue` | `modules.promptQueue` 开启且 `itemCount > 0` | `队列 {n}`（暂停时追加 ` ⏸`） | 暂停 `warn`；其余 `idle` |
| `bookmarks` | `modules.outlineBookmarks` 开启且书签数 `> 0` | `★{n}` | `idle` |
| `autoAccept` | `modules.safeAutoAccept` 开启且运行未暂停 | `审批演练`（dryRun）或 `自动审批` | 演练 `idle`；运行中 `warm` |
| `nov` | `agy-NOV` 双星连接激活 | `NOV` | `accent` |
| `brand` | 以上分段全为空时兜底 | `agy-Sag` | `idle` |

---

## 三、统一术语命名表（UI 与文档一致化）

| 配置键 / 模块 ID | 中文唯一标准命名 | 英文唯一标准命名 | 废弃旧称（禁止新增使用） |
| :--- | :--- | :--- | :--- |
| `agy-Sag` | **agy-Sag** | **agy-Sag** | 领航哨 / Session Guard（仅保留内部代码别名） |
| `hostI18n` | 原生界面翻译 | Native UI Translation | 宿主汉化 |
| `compactGuard` | 自动压缩保护 | Auto-Compact Guard | 防爆盾 / 预警触发器 |
| `compactThreshold` | 自动压缩阈值 | Auto-Compact Threshold | 触发预警阈值 |
| `precompactExport` | 压缩前导出 | Pre-Compact Export | 导出兜底 |
| `draftGuard` | 草稿防丢 | Draft Guard | 草稿保险箱 |
| `promptQueue` | 提示词排队 | Prompt Queue | 指令队列 |
| `promptLibrary` | 提示词库 | Prompt Library | 快捷宏面板 |
| `outlineBookmarks` | 轮次书签与档案库 | Turn Bookmarks & Vault | 提问大纲 |
| `readingNav` | 阅读导航 | Reading Navigation | 代码折叠插件 |
| `sessionWatchdog` | 卡死与燃尽监测 | Stall & Burn Watchdog | 监控狗 |
| `sessionRadar` | 侧栏聚光与提醒 | Sidebar Radar & Alerts | 侧栏过滤 |
| `safeAutoAccept` | 安全自动审批 | Safe Auto-Accept | 自动审批策略 / 全自动 |
| `themeStudio` | 光学主题与排版 | Theme & Typography | 主题工坊 |
| `quotaPulse` | 配额脉冲 | Quota Pulse | 只读用量监测 |

---

## 四、与 `agy-NOV` 对齐的视觉设计 Token

新增 UI 样式统一在 `packages/core/styles.js` 中定义 `--sag-*` 变量，优先继承 Antigravity 宿主上下文变量并保持与 `agy-NOV`（`ui/src/styles/shell.css`）同一视觉体系，严禁使用 `:has()` 选择器，新增类名统一采用 `.ag-sag-*` 前缀。

| 设计维度 | Token 变量名 | 深色默认值 (`dark`) | 浅色默认值 (`light`) | 对齐 `agy-NOV` 规范 |
| :--- | :--- | :--- | :--- | :--- |
| **强调色** | `--sag-accent` | `#38bdf8` | `#0284c7` | 100% 对齐 `--nov-accent` |
| **成功态** | `--sag-success` | `#34d399` | `#059669` | 100% 对齐 `--nov-success` |
| **警告态** | `--sag-warning` | `#fbbf24` | `#d97706` | 100% 对齐 `--nov-warn` |
| **危险态** | `--sag-danger` | `#f87171` | `#dc2626` | 100% 对齐 `--nov-danger` |
| **卡片/条目圆角** | `--sag-radius-card` / `item` | `12px` / `9px` | `12px` / `9px` | 对齐 NOV `.nov-card` / 条目 |
| **按钮/Tab/徽章圆角** | `--sag-radius-btn` / `tab` / `badge` | `8px` / `7px` / `6px` | `8px` / `7px` / `6px` | 对齐 NOV `.nov-p-btn` / `.nov-tab` |
| **胶囊/Switch 圆角** | `--sag-radius-pill` | `999px` | `999px` | 对齐 NOV `.nov-switch` (40×22px) |
| **品牌渐变色带** | SVG Linear Gradient | `#38bdf8 → #818cf8 → #34d399` | 同左 | Sag 六边形 `S` 徽章 & NOV 迷你 `N` 徽章 |
| **无衬线字体栈** | `--sag-font-sans` | `Inter, -apple-system, ..., "PingFang SC", "Microsoft YaHei UI", sans-serif` | 同左 | 继承宿主 `--font-sans` 并强化 CJK 回退 |
| **等宽字体栈** | `--sag-font-mono` | `ui-monospace, SFMono-Regular, Menlo, monospace` | 同左 | 100% 对齐 `--nov-font-mono` |
