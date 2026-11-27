# agy-Sag 开发与维护约定

本仓库（`agy-Sag`，原名 `agy-session-guard`）是面向 **Google Antigravity 2.0（Desktop / IDE）** 的**模块化、大而全、可自由按需开关的深度增强套件**（Zero-ASAR CDP 渲染层引擎 + Watch Sidecar + 离线存储体检 CLI）。

## 与 agy-NOV 的双星定位与零重叠边界

两个项目共同构成完整的 Antigravity 2.0 生态组合，目标为互相引荐、共同安装、功能零重叠：

- **`agy-NOV`（合规原生工作台）**：坚持零 ASAR 魔改、零 CDP 注入、100% 官方 MCP Apps (SEP-1865) 与 Lifecycle Hooks，升级不失效。负责 `review`（PR 级 Diff 审阅）、`guard`（PreToolUse 后端安全护盾与改前文件快照）、`xray`（跨会话只读 Token 透视）、`canvas`（视觉产物画布）、`mem`（代码锚定记忆图谱）、`remote`（手机 PWA / IM 远程审批与通知）。
- **`agy-Sag`（激进深度增强套件）**：深入 Antigravity 渲染层 DOM、主对话流、输入区、外观与本地数据目录，承接纯原生 MCP 协议无法触及的深度能力。负责 `hostI18n`（10 国语言原生界面实时翻译）、`compactGuard`（自定义 `/compact` 自动防爆与滚动盾）、`draftGuard`（未发送草稿保险箱）、`promptQueue`（运行中提示词排队发送）、`outlineBookmarks`（单轮书签与跨会话档案库）、`sessionWatchdog`（燃尽率与流式卡死监测）、`safeAutoAccept`（铁壁黑名单保护的前端规则自动审批）、`themeStudio`（零 `:has()` 光学主题与中文字体排版）、`quotaPulse`（只读双桶配额与限流监测）、`sessionRadar`（侧栏聚光）与 `storage-doctor`（本地存储体检与脱敏备份）。

## 架构基线与安全红线

1. **零运行时依赖（Zero Runtime Dependencies）**：全仓严格使用 Node.js >= 22 原生 API 与浏览器原生 UMD 模块，零 npm 依赖、零构建摩擦。
2. **默认 Zero-ASAR 与 100% 无损卸载**：不修改 `/Applications/Antigravity.app` 或 `app.asar`，保全 Apple 公证签名与官方自动更新；任意模块关闭或调用 `destroy()` 后 DOM 与宿主属性必须零残留。
3. **激进能力默认关闭（Strict Opt-in）**：`safeAutoAccept`、`themeStudio`、`quotaPulse`、`outlineBookmarks`、`sessionRadar` 默认关闭；`safeAutoAccept` 的 `HARD_DENY_PATTERNS` 铁壁黑名单在任何策略下不可绕过；`quotaPulse` 坚持 100% 只读、零凭据接触、零封号风险。
4. **物理级翻译与样式隔离**：`hostI18n` 必须跳过代码块、输入框、对话正文与斜杠命令名；全部 CSS 严格保持零 `:has()` 与零 `.ag-cs-*` 命名冲突；支持与 Obsidian Prism 冲突礼让/接管切换。
5. **Manifest 与隔离开发红线**：`plugin.json` 严格只保留官方支持字段；开发验收统一运行 `npm test`、`npm run workbench:smoke`、`npm run i18n:validate` 与 `npm run doctor`，严禁未经授权写入 `~/.gemini/config/plugins/` 或改动真实 `~/.gemini/antigravity/`。
