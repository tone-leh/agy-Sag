# Antigravity Session Guard · 领航哨

> **为 Google Antigravity 打造的长会话护航套件（MIT 开源 · 零依赖 · Zero-ASAR）**  
> 自定义上下文压缩预警与提前确认 · 压缩前一键脱敏 Markdown 复盘导出 · 零冲突兼容原生界面与 Obsidian Prism 四套主题

> **非官方免责声明**：本项目为独立开源项目，与 Google LLC 无任何隶属或背书关系。

---

## 为什么做「领航哨」？

在 Antigravity 中进行长会话协作时，宿主协议仅暴露 `estimatedTokensUsed / maxContextTokens`，**并没有提供可自定义的自动压缩阈值**，单轮长工具输出经常导致上下文冲到 **102%+ 仍未触发压缩**。

**Antigravity Session Guard（领航哨）** 采用极简模块化设计，补齐长会话与多线程协作最核心的防爆窗体验：

1. **上下文压缩守卫（Compact Guard · 已就绪）**
   - **自定义触发阈值**：支持 `关闭 / 70% / 75% / 80% / 85% / 90%`（或通过配置接口自定义 `50%–98%`）。
   - **三种触发策略**：
     - `浮条确认`（默认）：达到阈值时在输入框正上方浮现玻璃态提示条，一键「确认压缩 `/compact`」或「仅填入」。
     - `仅填入`：保守模式，仅填入 `/compact` 由你手动回车发送。
     - `空闲 5s 倒计时`（可选进阶）：仅当「非生成中 + 输入框为空 + 窗口可见激活」三条件同时满足时启动 5 秒可取消倒计时；期间任意输入或点击取消立即中止。
   - **三重防误触保护**：生成中绝不打断、输入框有草稿绝不覆盖、点击「本轮忽略」后直到压缩完成（监听 `compactedAtStepIndices` / 占比回落 10%）或再涨 +10% 前不再重复打扰。
2. **轮次书签 & 压缩前脱敏 Markdown 复盘导出（Outline Bookmarks & Pre-Compact Export · 已就绪）**
   - 在每轮用户提问与 Obsidian Prism 左侧大纲面板内直接提供 `☆ / ★` 星标书签（按 `cascadeId` 持久化）及「仅看书签」筛选；
   - 压缩确认浮条旁一键「先导出 MD / 仅导出 ★ (N)」，自动脱敏 `sk-` / `AIza` / `ghp_` / `Bearer` / JWT / 私钥块并复制到剪贴板，压缩前先留档更安心。
3. **多会话聚光雷达与失焦桌面提醒（Session Radar · 已就绪，默认关闭按需开启）**
   - 在侧边栏顶部挂载极简状态聚光条（`全部 / 运行中 / 待确认`），实时计数并一键筛出需要你处理的会话；
   - 可选失焦桌面提醒（`关闭 / 仅待确认 / 待确认与完成`），仅在窗口切出时触发系统通知，点击通知直接切回对应会话。

---

## 原生可用 · 与 Obsidian Prism 无缝共存 & 随时可吸收

- **MIT 协议**：天然向上兼容 `GPL-3.0-only`，欢迎主题套件或社区项目直接以独立通道方式引入 `packages/core/`。
- **零重复轮询**：优先复用 `window.__agPrismMetricsBridge` / `window.agPulseHost` 上下文快照，原生环境则平滑回退到轻量 DOM 估算。
- **四主题自适应**：纯宿主 CSS 变量渲染（0 `:has()`），原生深浅色与 Obsidian Prism 四套配色自动融为一体；所有节点标记 `data-ag-no-i18n="1"` 避免被宿主汉化误改。
- **Owner 自动礼让**：支持 `window.__agSessionGuardOwner` 协议，宿主整合版启用时独立注入自动礼让退出。
- **0fps 后台休眠 & 100% 无损卸载**：切出窗口自动停止轮询与倒计时，调用 `destroy()` 或 `--remove` 零残留还原。

详见 [架构与共存/集成契约 (docs/ARCHITECTURE.md)](./docs/ARCHITECTURE.md)。

---

## 快速体验（离线预览台 · 不碰本机 Antigravity）

环境要求：**Node.js >= 22**（零第三方 npm 依赖）。

```bash
# 运行全套单元测试
npm test

# 启动离线交互式预览工作台（拖动滑块模拟 10% -> 115%，切换四套主题与 5 种语言）
npm run workbench
# 浏览器打开 http://127.0.0.1:4179
```

### 纯 CDP 独立挂载（Zero-ASAR，只读附着已有端口，绝不重启宿主）

```bash
# 预演查看将附着的宿主窗口（不执行注入）
node cli/cdp-attach.mjs --attach --dry-run

# 挂载到已开启 CDP 的 Antigravity（支持可选 --threshold=75 --mode=confirm）
npm run attach

# 查询运行状态
npm run status

# 100% 无损卸载
npm run remove
```

---

## 开源许可

本项目采用 [MIT License](./LICENSE)。
