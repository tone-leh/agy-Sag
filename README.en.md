<div align="center">

<img src="assets/logo.svg" width="96" height="96" alt="Antigravity Session Guard Logo" />

# Antigravity Session Guard

**Catch context overflow before it hits 102%. Never leave a background subagent waiting unnoticed.**

Configurable Compaction Guard · Turn Bookmarks & Redacted Pre-Compact Markdown Export · Sidebar Attention Radar

[**English**](./README.en.md) · [**简体中文**](./README.md) · [**Changelog**](./CHANGELOG.md) · [**Architecture & Coexistence**](./docs/ARCHITECTURE.md) · [**Issues**](https://github.com/tone-leh/agy-session-guard/issues)

<p>
  <a href="https://github.com/tone-leh/agy-session-guard/releases"><img src="https://img.shields.io/github/v/release/tone-leh/agy-session-guard?style=flat-square&color=D4B475&labelColor=0B0D11&label=Release" alt="Latest Release" /></a>
  <a href="https://github.com/tone-leh/agy-session-guard/actions"><img src="https://img.shields.io/github/actions/workflow/status/tone-leh/agy-session-guard/ci.yml?branch=main&style=flat-square&label=CI&labelColor=0B0D11" alt="CI" /></a>
  <img src="https://img.shields.io/badge/Antigravity-2.34%20%7C%202.35+-0f172a?style=flat-square" alt="Antigravity 2.34 | 2.35+" />
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-1e293b?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/badge/Zero--ASAR-0_Runtime_Deps-059669?style=flat-square" alt="Zero-ASAR & Zero Runtime Deps" />
  <img src="https://img.shields.io/badge/i18n-8%2B1_Languages-d97706?style=flat-square" alt="8+1 Languages" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-6366f1?style=flat-square" alt="License: MIT" /></a>
</p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/hero-dark.svg" />
  <source media="(prefers-color-scheme: light)" srcset="assets/hero-light.svg" />
  <img src="assets/hero-dark.svg" width="100%" alt="Antigravity Session Guard v0.2 Dark and Light Preview" />
</picture>

<sub>Adapts automatically to GitHub Dark &amp; Light themes · Run <code>npm run workbench</code> locally to drag context from 10% to 115% offline without touching your running Antigravity instance.</sub>

</div>

> **Non-Affiliation Disclaimer**  
> **Antigravity Session Guard is an independent MIT open-source project and is not affiliated with or endorsed by Google LLC.**  
> Zero `app.asar` patches, zero host restarts; “Antigravity” and “Google” are referenced solely for compatibility.

> **Ecosystem Positioning**  
> Session Guard is a **Zero-ASAR Electron CDP** session copilot & sidebar attention radar (fully compatible with Obsidian Prism). If you prefer **zero-CDP, 100% native MCP App** side-pane instruments for Antigravity 2.0, explore the companion suite: [agy-xray](https://github.com/tone-leh/agy-xray), [agy-guard](https://github.com/tone-leh/agy-guard), [agy-mem](https://github.com/tone-leh/agy-mem), [agy-canvas](https://github.com/tone-leh/agy-canvas), and [agy-remote](https://github.com/tone-leh/agy-remote).

---

## Three Real Pain Points in Long Sessions

1. **Context silently climbs past `102%` without compacting**: The host telemetry exposes `estimatedTokensUsed / maxContextTokens`, with no user-configurable compaction threshold. A single long tool call pushes the window past 100% before you notice.
2. **Fear of losing key decisions before `/compact`**: Manually copying architecture conclusions from a 40-turn session is tedious, yet compacting without a clean snapshot feels risky.
3. **Background sessions waiting on approval while you work elsewhere**: With parallel conversations and subagents, an approval prompt can sit idle for 15 minutes until you switch back.

| Stay Under Budget · Compact Guard | Keep What Matters · Bookmarks & Export | Never Stall · Session Radar |
| :--- | :--- | :--- |
| Surfaces an unobtrusive confirmation bar at your chosen threshold (`70%–90%`), with optional 5-second idle cancelable countdown. | Star key turns (`☆ → ★`) per conversation; export redacted Markdown recaps in one click right before `/compact`. | Adds an opt-in `All / Running / Awaiting` filter pill in the sidebar plus out-of-focus OS notifications that jump straight back. |

---

## Core Modules

<p align="center">
  <img src="assets/guard-states.svg" width="100%" alt="Compact Guard State Machine: Early Confirm, Idle 5s Countdown with Draft Guard, 102% Overflow Alert and Auto-Reset" />
</p>

| Module | Default | What It Does | Standalone UMD Core |
| :--- | :---: | :--- | :--- |
| **Compact Guard** | On (`80%` confirm) | Threshold alert bar (`off/70–90%`), Smart `/compact <focus>` presets (`Default / Code & Errors / ★ Bookmarks / Custom`), Post-Compact Recovery strip, 5s idle countdown, `↓ .md` download | [`packages/core/compact-guard.js`](./packages/core/compact-guard.js) |
| **Draft Guard** | On | Per-`cascadeId` debounced unsent draft auto-save (survives switches & `Cmd+R` reloads), 1-line empty-composer recovery strip, clears automatically on send | [`packages/core/draft-guard.js`](./packages/core/draft-guard.js) |
| **Outline Bookmarks & Vault** | On | Per-`cascadeId` `☆/★` stars, native floating `★ N` jump drawer, Cross-Session Searchable Bookmark Vault (`Ctrl+Shift+B`), plus Prism outline filter | [`packages/core/outline-bookmarks.js`](./packages/core/outline-bookmarks.js) · [`bookmark-vault.js`](./packages/core/bookmark-vault.js) |
| **Pre-Compact Export & Handoff** | On | One-click clipboard copy (`Export MD` / `Export ★ (N)`), `.md` download with secret redaction, and **one-click New-Session Handoff Prompt export** | [`packages/core/precompact-export.js`](./packages/core/precompact-export.js) · [`recovery-handoff.js`](./packages/core/recovery-handoff.js) |
| **Session Watchdog** | On (`3m` stall) | Rolling context burn-rate (`~N turns left`), `>= 18%` single-turn spike flag, silent streaming stall detector with **`+5m Snooze`** & elapsed duration | [`packages/core/session-watchdog.js`](./packages/core/session-watchdog.js) |
| **Prism Unified Bridge** | Auto-detect | Embeds Session Guard settings natively inside Obsidian Prism's Settings -> Modules tab with bidirectional config & live language/theme sync | [`packages/core/prism-bridge.js`](./packages/core/prism-bridge.js) |
| **Session Radar** | Off (opt-in) | Sidebar `All / Running / Awaiting` attention filter pill + blurred-only desktop alerts (including stall alerts) | [`packages/core/session-radar.js`](./packages/core/session-radar.js) |
| **Watch Daemon & Doctor** | CLI on-demand | Zero-ASAR adaptive-backoff watcher (`npm run watch`) + one-command read-only environment & Prism coexistence doctor (`npm run doctor`) | [`cli/watch-daemon.mjs`](./cli/watch-daemon.mjs) · [`cli/doctor.mjs`](./cli/doctor.mjs) |

### Engineering Guardrails (Tested on Every Commit)

- **Triple Anti-Mis-Trigger Guard**: Never interrupts active streaming turns, never overwrites composer drafts (typing cancels countdown instantly), and suppresses dismissed alerts until `+10%` growth or automatic reset after compaction (`compactedAtStepIndices` or `-10%` drop).
- **Zero-ASAR & Zero Dependencies**: Pure Node.js `>= 22` + UMD scripts; never patches `app.asar` or restarts Antigravity.
- **0 `:has()`, 0fps Hibernation, 100% Lossless `destroy()`**: Inherits native and Obsidian Prism CSS variables, sleeps on `blur` / `document.hidden`, and cleans every DOM node, stylesheet, timer, and global on teardown.

---

## Quick Start (Node.js >= 22, Zero `npm install`)

### 1. Try the Offline Interactive Workbench First (Zero Impact on Live Antigravity)

```bash
git clone https://github.com/tone-leh/agy-session-guard.git
cd agy-session-guard

npm test         # 22 unit & hygiene tests (~160ms)
npm run workbench
# Open http://127.0.0.1:4179
```

### 2. Attach or Watch via Zero-ASAR CDP

```bash
# Inspect Node >= 22, CDP port, host windows & Obsidian Prism coexistence (100% read-only)
npm run doctor

# Preview matching host windows without injecting
node cli/cdp-attach.mjs --attach --dry-run

# One-shot attach to an existing CDP-enabled Antigravity session
npm run attach

# Or keep Watch Daemon running (adaptive backoff, auto-attaches new/reloaded windows, never restarts host)
npm run watch

# Inspect live state or tear down 100% losslessly
npm run status
npm run remove
```

---

## Lightweight Standalone vs. Full Visual Suite (Coexistence & MIT Absorption)

Love **[Obsidian Prism](https://github.com/RMvdesi/obsidian-prism)**'s visual themes, 3D picker, and WebGL2 effects? Run Session Guard cleanly alongside it with zero duplicate polling. Prefer a **purely lightweight, zero-theme utility** for custom compaction thresholds, post-compact recovery, turn bookmarks, and stall alerts without installing a full UI suite? Run Session Guard completely standalone:

- **Split View & 8+1 Languages Ready**: Automatically follows the active focused split pane (`resolveActivePaneScope`) and ships full `zh-CN / zh-TW / en / ja / ko / es / fr / de` (+ `yue`) parity aligned 1:1 with Obsidian Prism `v1.0.8`.
- **Obsidian Prism & AG Pulse Ready**: Reuses `window.__agPrismMetricsBridge` and `window.agPulseHost` with zero duplicate polling; embeds unified Session Guard controls right inside Obsidian Prism's Settings -> Modules tab with bidirectional sync & live language updates; marks owned nodes with full i18n-skip attributes to stay isolated from Channel 4 DOM localization; yields automatically when a host suite sets `window.__agSessionGuardOwner`.
- See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) and [`docs/PRISM_CHANNEL_INTEGRATION.md`](./docs/PRISM_CHANNEL_INTEGRATION.md) for the coexistence & on-demand Channel absorption blueprint.

## License

[MIT](./LICENSE) — free to use, adapt, or vendor into downstream MIT or GPL-3.0 projects with attribution preserved.
