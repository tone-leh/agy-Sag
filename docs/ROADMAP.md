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

### 阶段 7：跨会话搜索抽屉与对话内 Todo 探索（P2，阶段 6 后再细化）
- **目标**：评估通过 `Ctrl/Cmd+Shift+F` 提供跨会话书签与本地只读索引的检索/导出抽屉，并调研对话流内任务进度卡的可行性。

---

## 五、进度总览

- [x] **阶段 0**：路线图、产品信息架构文档与 `AGENTS.md` 边界更新
- [x] **阶段 1**：设置中心 6-Tab 单一真源重构 + `agy-NOV` v0.5.0 同步 + 视觉 Token 统一
- [x] **阶段 2**：统一分段状态胶囊 HUD 升级
- [x] **阶段 3**：`promptLibrary` 提示词库与命令面板
- [ ] **阶段 4**：`readingNav` 长代码折叠与轮次快速导航
- [ ] **阶段 5**：WebAudio 提示音与本地 TTS 提醒中心
- [ ] **阶段 6**：`sag:nov_feed` 双星只读数据流深度联动与快照回滚入口
- [ ] **阶段 7**：跨会话全文检索与 Todo 视图评估（待阶段 6 后细化）
