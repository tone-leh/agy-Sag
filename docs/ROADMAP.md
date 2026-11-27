# agy-Sag 下一阶段演进路线图（Roadmap）

> 本路线图基于对 **Obsidian Prism（`v1.0.8-beta.3`）**、兄弟项目 **`agy-NOV（v0.5.0）`**、一线 Agent 生态（Claude Code 插件生态、Cline / Roo Code / Kilo Code、DeepSeek Harness 等）及本项目当前设置信息架构的全面对标调研制定。

---

## 一、产品定位与双星分工规则

- **`agy-Sag` = Antigravity 的「界面与对话驾驶舱」**：凡是需要操作宿主 DOM、面向用户的可视化界面、输入框与对话流交互的能力，归属 `agy-Sag`。
- **`agy-NOV` = Antigravity 的「原生 MCP 与 Hook 工作台」**：凡是需要模型工具（MCP Apps SEP-1865）、生命周期 Hooks（`PreToolUse` / `PostToolUse` / `Stop`）、读写工作区文件或联网远程网关的能力，归属 `agy-NOV`。
- **双星联动铁律**：
  1. `agy-Sag` 仅以只读方式消费 `agy-NOV` 产出的数据快照，或将前端用户意图转换为「填入输入框的提示词」或原子更新 `agy-NOV` 的 `config.json`。
  2. 严禁复制 `agy-NOV` 已有的后端模块逻辑，也严禁修改 `agy-NOV` 仓库源码；双方保持零功能重叠，共同实现 `1 + 1 > 2` 的协同体验。

---

## 二、竞品与生态对标矩阵

| 功能领域 | 对标代表项目 | agy-Sag 现状 | 优先级 | 建议承接方 |
| :--- | :--- | :--- | :---: | :--- |
| **设置信息架构与统一入口** | Obsidian Prism / VS Code Settings | 开关分散在基础卡与多 Tab、部分参数缺入口 | **P0** | **`agy-Sag`**（6 Tab 控制中心 + 右侧抽屉 + 搜索） |
| **双星协议同步（13 模块 / 5 预设）** | `agy-NOV` v0.5.0 | `nov-bridge.mjs` 仍停留在旧版 9 模块 | **P0** | **`agy-Sag`**（同步桥接层与 NOV Tab） |
| **输入区紧凑统一状态胶囊 HUD** | `ccstatusline` / `claude-powerline` / Prism 试管 | 各模块提示条分散 | **P0** | **`agy-Sag`**（统一分段胶囊）+ `agy-NOV` `xray` |
| **Prompt 模板库与快捷命令面板** | SuperClaude / Prism `/btw` 右键菜单 | 暂无 | **P0** | **`agy-Sag`**（命令面板 + Lexical 宏填充 + NOV `ops` 只读模板） |
| **聊天流 Checkpoint 一键回滚入口** | Cline / `opcode`（原 `claudia`） | 暂无 | **P0** | **`agy-Sag`**（消息栏触发词填入）调用 `agy-NOV` `guard` |
| **长代码块折叠与键盘轮次导航** | Obsidian Prism / Cursor | 仅有点击式书签与抽屉 | **P1** | **`agy-Sag`**（`readingNav`：自动折叠 + `Alt+↑/↓` + 迷你导轨） |
| **非视觉提醒中心（提示音 / 本地 TTS）** | `claude-code-hooks`（`echook`） | 仅有基础桌面模糊通知 | **P1** | **`agy-Sag`**（WebAudio 合成音 + 本地 `speechSynthesis`） |
| **NOV 数据流与写锁前向展示** | `agy-NOV`（`guard`/`radar`/`mem`/`spec`） | 仅开关控制与 4 张静态协同卡 | **P1** | **`agy-Sag`**（`sag:nov_feed` 只读数据消费） |
| **跨会话全文检索与可视化导出** | `opcode` | 仅 `storage-doctor` CLI 与书签档案库 | **P2** | **`agy-Sag`**（`Ctrl/Cmd+Shift+F` UI 抽屉 + Sidecar 索引） |
| **思考过程与会话标题实时翻译** | Obsidian Prism | 暂缺 | **待决策** | 需引入外发请求与 LLM 凭据，违反当前红线，待用户拍板 |
| **后端安全快照 / 多会话 worktree / 远程 PWA** | Cline / `claude-squad` / DeepSeek Harness（DSH） | 已有对应生态 | 跳过 | 已由 **`agy-NOV`** 承接，保持零重叠 |
| **WebGL 波纹 / 宠物 / 壁纸 / 多号中转** | Prism / `Antigravity-Manager` | 无 | 跳过 | 炫技偏离主线或触及封号红线，明确不做 |

---

## 三、「做 / 不做 / 待决策」边界清单

### 坚持要做（聚焦效率、安全与双星协同）
- 单一真源 6-Tab 设置中心、全局抽屉快捷键（`Ctrl/Cmd+Alt+,`）与即时搜索过滤；
- 与 `agy-NOV` v0.5.0（13 模块 / 5 预设）及 `--nov-*` 视觉系统完全对齐；
- 输入区统一分段状态 HUD；
- Prompt 命令面板（斜杠速填、带 `{{变量}}` 的本地片段库、只读消费 NOV 模板）；
- 长代码块折叠、吸顶复制与 `Alt+↑/↓` 键盘轮次导航；
- 失焦态 WebAudio 提示音与本地浏览器 TTS 语音提醒；
- 双星只读数据回显（`guard` 拦截提示、`radar` 状态聚光、`spec` 写锁保护队列、`mem` 漂移计数、单步回滚提示词填充）。

### 明确不做（控制复杂度与红线）
- **纯装饰性重特效**：WebGL 背景矩阵、桌面宠物、动静态壁纸、粒子高光（维护复杂度高且偏离简洁驾驶舱原则）；
- **多账号池与 API 中转**：严守零凭据、零封号风险底线；
- **多模型路由 / Worktree 并行 / 远程网关**：已有 `agy-NOV` 与 Antigravity 原生能力承接，绝不重复造轮子；
- **注入体积失控**：保持单语种 CDP 注入表达体积 `<= 1,677,721 B`（1.6 MiB 硬上限）。

### 待用户决策后再启动
- **思考过程与侧栏标题实时翻译**：该能力依赖外部 LLM/翻译接口及用户 API 凭据，与当前“零外发、零凭据”原则存在冲突，因此在本路线图中保留为独立议题，待确认授权后再决定是否以严格 opt-in 方式开启。

---

## 四、分阶段执行计划与验收标准

> **通用阶段验收**：每完成一个阶段，必须满足：① `npm test && npm run i18n:validate && npm run workbench:smoke` 全绿；② `packages/core/i18n.js` 全语种键值 100% 对齐；③ 离线 Workbench 补齐交互演示并在 Ego Lite 实机截图验证；④ 执行一次对照 [PRODUCT-IA.md](./PRODUCT-IA.md) 的简化自检并写入 [HANDOFF.md](./HANDOFF.md)；⑤ 每次推送/发布到 GitHub 前同步更新并全文核查 `README.md` 与 `README.zh-CN.md`（避免含文字的静态图片/徽章图片以保证页面多语言可翻译）、更新 `CHANGELOG.md` 推送 `origin main` 且 GitHub Actions 三平台全绿；⑥ 阶段 1、3、6 须经独立 `auditor` 对抗审查通过。

### 阶段 0：路线图与信息架构规范确立
- **目标**：沉淀 `docs/ROADMAP.md`、`docs/PRODUCT-IA.md`，同步 `AGENTS.md` 双星边界。
- **验收**：三份文档齐全、表述一致、无重复冗余或遗漏规则。

### 阶段 1：设置中心 IA 重构 + `agy-NOV` v0.5.0 同步 + 视觉 Token 统一（P0）
- **目标**：
  - `cli/nov-bridge.mjs` 与前端 `nov-synergy.js` / `prism-bridge.js` / Workbench 同步至 `agy-NOV` 13 模块、5 预设、47 工具元数据；
  - 将设置中心重构为单层 6-Tab 结构（`概览 | 界面 | 对话 | 守护 | 双星 NOV | 高级`），取消旧基础卡，消除重复开关，补全隐藏高级项至 `<details>` 折叠区，接入即时搜索、导入/导出/内联重置与 `Ctrl/Cmd+Alt+,` 右侧抽屉（复用统一渲染函数）；
  - `styles.js` 引入对齐 `agy-NOV` 的 `--sag-*` 设计 Token、40×22 开关、Tab 状态点与渐变六边形 SVG 标识。
- **验收**：每个模块总开关在设置树中只出现一次，旧 Tab 键值平滑迁移，新增 `test/settings-hub.test.mjs` 全绿，通过 `auditor` 审查。

### 阶段 2：统一状态胶囊 HUD（P0）
- **目标**：将 `status-pill.js` 升级为分段式统一 HUD（上下文 % 环、≈剩余轮数、5h 配额进度、排队条数、NOV 联动状态点），关闭模块对应分段自动隐藏；Prism 模式下继续无缝内嵌；消除 `compactGuard` Banner 与胶囊的重复信息。
- **验收**：各模块独立开关可实时增删对应胶囊分段，快捷键/按钮可直达完整设置抽屉。

### 阶段 3：提示词库与命令面板 `promptLibrary`（P0）
- **目标**：新增模块 `promptLibrary`（默认关闭，`power`/`full-auto` 开启），提供输入区入口按钮与 `Ctrl/Cmd+Alt+P` 命令面板：支持模糊搜索「原生斜杠指令 / 用户变量片段（`{{var}}`、JSON 导入导出）/ 内置高频模板 / 只读 `sag:nov_templates` 模板」，选中仅插入 Lexical 输入框（若 Prism 右键菜单已激活则保持礼让不抢右键）。
- **验收**：XSS 防护、存储上限、Lexical 斜杠填充与 `destroy()` 零残留测试通过，通过 `auditor` 审查。

### 阶段 4：阅读导航与代码块折叠 `readingNav`（P1）
- **目标**：新增模块 `readingNav`（默认关闭，`power`/`full-auto` 开启），实现 `>= 40` 行长代码块自动折叠与吸顶操作条、`Alt+↑/↓` 轮次跳转及侧边悬浮迷你提问导轨（联动 `outlineBookmarks` 星标，并在检测到 Prism 同类增强时自动礼让）。
- **验收**：代码块展开收起、键盘跳转、礼让切换及无损卸载单测与实机截图通过。

### 阶段 5：非视觉提醒中心（P1）
- **目标**：增强 `sessionRadar` 与 `sessionWatchdog`，支持零外发 WebAudio 合成提示音与浏览器本地 `speechSynthesis` 语音播报（待审批、任务完成、流式卡死、压缩临界），默认关闭，仅在窗口失焦时生效并支持静音时段。
- **验收**：音频/语音降级与静音窗单测通过，真实窗口失焦逻辑在 Workbench 验证。

### 阶段 6：双星只读数据流深度联动（P1）
- **目标**：`cli/watch-daemon.mjs` 新增受 256 KB 与 symlink 防护限制的 `sag:nov_feed` 只读通道，读取 `agy-NOV` 的 `guard/audit.json`、`radar/status-capsule.json`、`mem/memories.json` 与 `spec/state.json`；前端实现 Guard 拦截 Toast、Radar 待批侧栏高亮、Spec 写锁暂停队列保护、Mem 漂移 HUD 计数及每轮消息栏「回滚到此轮前」快捷提示词填充。
- **验收**：NOV 未安装/关闭时优雅隐藏，不修改任何 NOV 文件，通过 `auditor` 安全审查。

### 阶段 7：跨会话搜索抽屉与对话内 Todo 探索（P2，评估结论）
- **评估结论（已完成评审，保持前端克制不盲目膨胀）**：
  - 跨会话书签与重点检索已由内置 `BookmarkVault`（`Ctrl/Cmd+Shift+B`）覆盖，全量离线会话检索与脱敏归档已由零侵入 CLI `storage-doctor`（`agy-sag storage audit|backup|export`）覆盖；
  - 经过阶段 1–6 全套升级，单语种 `ru` CDP 注入包体为 `1,604,340 B`（距离 `1,677,721 B` 硬预算余量约 `73 KB`）。为守住 1.6 MiB 注入上限与极简驾驶舱定位，不在主 CDP 注入包内叠加额外重型索引/Todo UI，保留为后续独立按需加载扩展议题。

---

## 五、进度总览

- [x] **阶段 0**：路线图、产品信息架构文档与 `AGENTS.md` 边界更新
- [x] **阶段 1**：设置中心 6-Tab 单一真源重构 + `agy-NOV` v0.5.0 同步 + 视觉 Token 统一
- [x] **阶段 2**：统一分段状态胶囊 HUD 升级
- [x] **阶段 3**：`promptLibrary` 提示词库与命令面板
- [x] **阶段 4**：`readingNav` 长代码折叠与轮次快速导航
- [x] **阶段 5**：WebAudio 提示音与本地 TTS 提醒中心
- [x] **阶段 6**：`sag:nov_feed` 双星只读数据流深度联动与快照回滚入口
- [x] **阶段 7**：跨会话全文检索与 Todo 视图评估（已完成预算与架构评估，维持轻量化边界归档）

---

## 六、v1.2 演进路线图（阶段 8–12：全面超越 Prism & 对标一线 Agent 生态）

> 经过对 **Obsidian Prism `v1.0.8-beta.3`** 全量挂载点与 **Claude Code / DeepSeek Harness (DSH) / Cline / Roo Code / Cursor / Windsurf / opcode** 的第二轮实证复盘，v1.2 坚持 **「0 新增顶级模块开关」** 反膨胀原则——维持 13 模块、6-Tab 单一真源，全部高价值能力归入既有模块的自然增强。

| 阶段 | 对标标杆与痛点 | 核心交付与归属（0 新增顶级开关） |
| :---: | :--- | :--- |
| **阶段 8** | Obsidian Prism 按需分包与设置内存储面板；解除 `ru` 仅剩 `73 KB` 的包体紧箍咒 | **CDP 包体瘦身与按需异步首载 + 高级页只读存储体检**：`cli/bundle.mjs` 无损空白/纯注释行裁剪（全量语法与单测校验）+ `WatchDaemon` 支持 `deferExtPack`（借助已有零端口 `sag:ext_pack` 首帧异步送达 600KB+ 扩展词典）；`watch-daemon.mjs` 新增零端口只读 `sag:storage_audit` 并在 `高级` Tab 展示目录空间、WAL 锁状态与脱敏备份 CLI 一键复制 |
| **阶段 9** | Claude Code `/context`、DSH `dsh-context`、Prism 试管信息密度 | **上下文构成透镜 & 单轮耗时脉搏**（增强 `contextSource` + `sessionWatchdog` + `statusPill`）：纯 DOM 三段上下文构成估算（用户 / 助手 / 代码与工具输出）、Top-3 最重轮次一键跳定位、上一轮流式耗时记录、HUD 浮卡升级为带 6px 三色构成条 + 5h/7d 进度条 + 导出 MD 的双栏驾驶舱卡片 |
| **阶段 10** | 超越 Obsidian Prism 代码折叠/大纲 + Claude Code 工具折叠 + Cursor 会话内查找 | **阅读导航 2.0 & 跨源主题桥 & 去噪导出**（增强 `readingNav` + `themeStudio` + `precompactExport`）：① 代码折叠增加流式完成防打断、收起 `scrollTop` 锚点补偿、覆盖 `artifact-view`、自动换行切换；② 解除导轨 30 轮截断，升级为可搜索大纲浮窗（`Alt+F` 实时过滤、回车跳轮、只看星标、一键全折/全展长代码块与工具卡片）；③ 纯前端 Mermaid 悬停放大与 SVG 导出模态；④ `themeStudio` 向 `plugin://*` 扩展面板（含 `agy-NOV`）同步核心明暗主题变量；⑤ `precompactExport` 新增去噪结论版导出 |
| **阶段 11** | Windsurf Cascade 流式插队 + Claude Code 历史召回/`/btw` + Prism 右键工作流 | **输入区与对话流微交互闭环**（增强 `promptQueue` + `draftGuard` + `promptLibrary`）：① 队列条目行内编辑与一键置顶插队（`⏫`）；② `draftGuard` 维护按会话最近 30 条脱敏已发提示词历史，空框 `Ctrl+↑/↓` 快速召回；③ `promptLibrary` 支持空框 `//` 唤起与对话选区浮动「引用到模板」胶囊（预填 `{{selection}}`）；④ 独立用户（无 Prism 时）轻量对话/选区/路径右键菜单（复制、引用模板、`/compact`、收藏、复制路径或插 `@引用`，遇 Prism 自动礼让） |
| **阶段 12** | Claude Code `/rewind` 多选菜单 + `/status` 键盘流 + Prism 原生 Settings 导航直达 | **轮次恢复 3 选 1 微菜单、原生 Settings 侧栏锚点 & 动态快捷键速查**（增强 `outlineBookmarks` + `prismBridge` + `statusPill`）：① 轮次 `↺` 升级为 3 选 1 微菜单（NOV Guard 回滚 / 从此轮聚焦 `/compact` / 复制截至本轮的新会话交接稿）；② 原生 Settings 弹窗左侧栏自动注入 `agy-Sag` 快捷锚点；③ `Ctrl/Cmd+Alt+/` 动态快捷键速查浮层（仅列出当前已启用模块的有效快捷键） |

### v1.2 进度总览

- [x] **阶段 8**：CDP 包体瘦身与 `sag:ext_pack` 异步首载 + `高级` 页只读存储体检（`sag:storage_audit`）
- [x] **阶段 9**：上下文构成透镜、Top-3 重轮跳转、单轮耗时脉搏与双栏 HUD 驾驶舱浮卡
- [x] **阶段 10**：阅读导航 2.0（防跳屏/流式保护/可搜索大纲/一键折叠步骤/Mermaid 缩放）+ 跨源主题桥 + 去噪导出
- [x] **阶段 11**：队列行内编辑插队 + 30 条脱敏已发历史 `Ctrl+↑/↓` + `//` 与选区快引 + 独立轻量右键菜单
- [x] **阶段 12**：轮次 3 选 1 恢复微菜单 + 原生 Settings 侧栏锚点 + `Ctrl/Cmd+Alt+/` 动态快捷键速查浮层
- [x] **阶段 13（v1.3 美学皮肤与 Prism 全面替代）**：15 套深浅与风格皮肤（含自动明暗配对、Browser Hole 透明避让与宿主全表面变量）、8 套一键视觉外观方案、7 档强调色 / 4 档材质 / 4 档圆角 / 6 档代码字体 + 连字、`CSS.highlights` 五级水墨流式淡入、FastDOM 丝滑输入光标、0fps 底缘语义微光（支持关闭 `compactGuard` 时的独立节流兜底状态检测、祖先隐藏态过滤、Prism `data-ag-cs-style` 动态热切换与零残留清理）、`/btw` & `/plan` 独立右键菜单、`readingNav` 一键顺滑滚底、`ui` Tab 三色色板画廊重构与 `cli/bundle.mjs` 词法级空白压缩（严格维持 0 新增顶级模块开关、13 模块 / 6-Tab 单一真源）
- [x] **阶段 14（v1.3.0 安全审计、Windows/Linux 跨平台加固与 `agy-NOV` v0.9/v1.0 协议对齐）**：完成两轮 Codex CLI（`gpt-6.2-sol`）独立安全/缺陷复核与全量修复；新增 `cli/platform-utils.mjs` 打通 Windows/Linux CLI 软链入口、Linux 不可变系统软链白名单（`/home`、`/var/run` 等）、Windows 8.3 短路径 `canonicalRealpathSync`、PowerShell UTF-8/`pwsh` 与 Linux `/proc`/XDG/Flatpak/Snap 支持、原子替换重试与目的软链防护；补齐 `remove` 与常驻 `watch` 的手动卸载暂停礼让标记；对齐 `agy-NOV v0.8–v1.0`（`force_ask`、`permissionMode`、`verify` 信号、`alerts` 与 `/nov-spec` 等 4 条原生斜杠 Playbook 透出）；修复 9 扩展词典零瑕疵、`themeStudio` 计算样式隐藏判断，并通过无损 ASI 安全换行与静态 CSS 压缩保持充足包体余量（`238/238` 单测全绿，正式发布 `v1.3.0`）

---

## 七、v1.4 演进路线图（结构化架构重构 + 多引擎思考/标题实时翻译）

> 确立 **「结构化、模块化、社区友好」** 开发原则：先打牢代码分治边界与开源贡献体验，再在清晰扩展点上稳健交付新能力，保持零运行时依赖与无损卸载基线。

| 阶段 | 定位与目标 | 核心交付与安全边界 |
| :---: | :--- | :--- |
| **阶段 15（架构化拆分与社区协作基建）** | 降低单文件认知负担，便于 GitHub 社区开发者并行提交 PR | ① 将 `packages/core/prism-bridge.js`（当前约 1,800 行）按 Tab 与职责拆分为 `settings-hub.js`（外壳、搜索与抽屉）+ 独立子页渲染器（`settings-tab-overview.js` / `ui` / `conversation` / `guard` / `nov` / `advanced`），并按需梳理 `styles.js` / `theme-studio.js` 内部模块化结构，保持零构建 UMD 与 `cli/bundle.mjs` 确定性打包不变；② 新增 `CONTRIBUTING.md`（模块注册规范、i18n 键校验、CDP 零残留准则、本地单测与 Workbench 验收流程）；③ 持续优化 Watch 模式 `deferExtPack` 按需异步首载默认链路 |
| **阶段 16（多引擎思考过程与侧栏标题实时翻译）** | 补齐从 Obsidian Prism 平滑迁移后的最后一项高价值实用能力，同时严守默认隐私与凭据安全红线 | ① **严格 Opt-in 默认关闭**：关闭时零网络请求、零 DOM 额外观察器；作为独立可选子能力归入 Settings `ui` / `conversation` 或专用翻译卡片（按开启范围清晰隔离）；② **双轨多引擎架构**：支持 **用户自填 API Key 自选模型**（OpenAI 兼容接口 / Anthropic / Gemini / 本地 Ollama 等自定义 Base URL 与 Model ID）+ **免 Key 轻量机器翻译**（如公开翻译端点或本机端点，带节流与明确外发提示）；③ **安全通信与凭据隔离**：浏览器渲染层绝不直连外网或明文存 Key，复用既有零端口 CDP Bridge（`Runtime.addBinding`）将待译纯文本交给 Node Sidecar 发起受控 HTTPS 请求（规避页面 CORS 与渲染层凭据泄露）；API Key 存于独立 `0600` 本地文件，自动被 `storage-doctor` 备份/导出与配置 JSON 导出严格剔除，并支持按块缓存、原文/译文对照或悬浮切换与流式防抖 |
| **阶段 17（`agy-NOV` v1.0+ 联动与体验精修）** | 紧跟双星演进与真实跨平台反馈 | 结合 `agy-NOV v1.0+` 后续只读信号扩展双星卡片，按真实 Windows / Linux / Antigravity 2.35+ 实机反馈持续微调 launcher、词典与交互细节（如按需评估轻量推理档位记忆） |

### v1.4 进度总览

- [ ] **阶段 15**：`prism-bridge.js` 按 Tab 结构化拆分、`CONTRIBUTING.md` 社区贡献文档与模块边界梳理
- [ ] **阶段 16**：多引擎思考过程与侧栏标题实时翻译（严格 Opt-in，自填 API Key 自选模型 + 本地 Ollama + 机器翻译，零端口 Node 侧受控代理与 `0600` 凭据隔离）
- [ ] **阶段 17**：真实跨平台实机反馈收口与 `agy-NOV v1.0+` 持续对齐
