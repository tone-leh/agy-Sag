<div align="center">

<img src="assets/logo.svg" width="96" height="96" alt="Antigravity Session Guard Logo" />

# Antigravity Session Guard

**Catch context overflow before it hits 102%. Keep long Antigravity sessions smooth, silent, and lossless.**

Zero-Popup Auto-Silent Compaction (3s Idle) · Same-Project `/clear` Restart · Draft Vault & Handoff · Native Watch Sidecar

[**English**](./README.md) · [**简体中文**](./README.zh-CN.md) · [**Changelog**](./CHANGELOG.md) · [**Architecture & Coexistence**](./docs/ARCHITECTURE.md) · [**Issues**](https://github.com/tone-leh/agy-session-guard/issues)

<p>
  <a href="https://github.com/tone-leh/agy-session-guard/releases"><img src="https://img.shields.io/github/v/release/tone-leh/agy-session-guard?style=flat-square&color=3186ff&label=Release" alt="Latest Release" /></a>
  <a href="https://github.com/tone-leh/agy-session-guard/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/tone-leh/agy-session-guard/ci.yml?branch=main&style=flat-square&label=CI" alt="CI Status" /></a>
  <img src="https://img.shields.io/badge/Antigravity-2.34%20%7C%202.35+-0f172a?style=flat-square" alt="Antigravity 2.34 | 2.35+" />
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-1e293b?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/badge/Zero--ASAR-0_Runtime_Deps-059669?style=flat-square" alt="Zero-ASAR & Zero Runtime Deps" />
  <img src="https://img.shields.io/badge/i18n-8%2B1_Languages-d97706?style=flat-square" alt="8+1 Languages" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-6366f1?style=flat-square" alt="License: MIT" /></a>
</p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/hero-dark.svg" />
  <source media="(prefers-color-scheme: light)" srcset="assets/hero-light.svg" />
  <img src="assets/hero-dark.svg" width="100%" alt="Antigravity Session Guard v0.4 Dark and Light Preview" />
</picture>

<sub>Adapts automatically to GitHub Dark &amp; Light themes · Run <code>npm run workbench</code> locally to drag context from 10% to 115% offline without touching your running Antigravity instance.</sub>

</div>

> **Non-Affiliation Disclaimer**  
> **Antigravity Session Guard is an independent MIT open-source project and is not affiliated with or endorsed by Google LLC.**  
> Zero `app.asar` patches, zero host restarts; “Antigravity” and “Google” are referenced solely for compatibility.

> **Ecosystem Positioning**  
> Session Guard is a **Zero-ASAR Electron CDP** session copilot & sidebar attention radar (fully compatible with Obsidian Prism). If you prefer **zero-CDP, 100% native MCP App** side-pane instruments for Antigravity 2.0, explore the companion suite: [agy-xray](https://github.com/tone-leh/agy-xray), [agy-guard](https://github.com/tone-leh/agy-guard), [agy-mem](https://github.com/tone-leh/agy-mem), [agy-canvas](https://github.com/tone-leh/agy-canvas), [agy-remote](https://github.com/tone-leh/agy-remote), and [agy-review](https://github.com/tone-leh/agy-review).

---

## Three Real Pain Points in Long Sessions

1. **Context silently climbs past `102%` without compacting**: Host telemetry reports `estimatedTokensUsed / maxContextTokens`, with no user-configurable compaction threshold. A single long tool call pushes the window past 100% before you notice.
2. **Restarting or compacting risks losing key decisions and unsent drafts**: Manually copying architecture conclusions from a 40-turn session is tedious, and switching threads or reloading can wipe an unsent prompt.
3. **Background sessions stall or wait on approval while you work elsewhere**: With parallel conversations and subagents, a silent streaming stall or approval prompt can sit idle until you switch back.

| Stay Under Budget · Compact Guard | Fresh Restart & Lossless Recovery | Quiet Awareness · Watchdog & Radar |
| :--- | :--- | :--- |
| Defaults to zero-popup **`auto-silent` (80%, 3s idle)** compaction with a viewport scroll shield so reading position stays put; switchable to `confirm`, `fill-only`, or `auto-countdown`. | Type `/clear` or `/clear keep` for a same-project fresh start with zero bloated images/logs; Draft Guard auto-saves unsent prompts and Pre-Compact Export redacts secrets before copying or downloading `.md`. | Tracks rolling context burn-rate, flags `>= 18%` spikes, catches silent streaming stalls (`+5m` snooze), and offers opt-in sidebar `All / Running / Awaiting` filtering plus blurred-only desktop alerts. |

---

## Core Modules (`v0.4.0`)

<p align="center">
  <img src="assets/guard-states.svg" width="100%" alt="Compact Guard State Machine: Early Confirm, Idle Countdown with Draft Guard, 102% Overflow Alert and Auto-Reset" />
</p>

| Module | Default | What It Does | Standalone UMD Core |
| :--- | :---: | :--- | :--- |
| **Compact Guard** | On (`80%` `auto-silent`, 3s) | Zero-popup silent idle compaction with viewport scroll shield & scroll-settle guard; optional `confirm` (`<= 2` actions), `fill-only`, or `auto-countdown` modes; Smart `/compact <focus>` presets; Lexical v2.35 two-step slash pick & `cascadeId`-scoped telemetry | [`packages/core/compact-guard.js`](./packages/core/compact-guard.js) |
| **Clean Slate (`/clear`)** | On | Same-project fresh conversation restart with zero lingering images or logs (`/clear`), plus `/clear keep` carrying a compact redacted continuity brief | [`packages/core/clean-slate.js`](./packages/core/clean-slate.js) |
| **Draft Guard** | On | Per-`cascadeId` debounced unsent draft vault (7-day TTL) surviving session switches and `Cmd+R` reloads, with 1-line empty-composer recovery and auto-clear on send | [`packages/core/draft-guard.js`](./packages/core/draft-guard.js) |
| **Pre-Compact Export & Handoff** | On | Redacted Markdown clipboard copy / `.md` download, post-compact anchor recovery strip, and one-click New-Session Handoff prompt export | [`packages/core/precompact-export.js`](./packages/core/precompact-export.js) · [`recovery-handoff.js`](./packages/core/recovery-handoff.js) |
| **Session Watchdog** | On (`3m` stall) | Rolling context burn-rate (`~N turns left`), `>= 18%` single-turn spike flag, and silent streaming stall detector with `+5m` Snooze | [`packages/core/session-watchdog.js`](./packages/core/session-watchdog.js) |
| **Prism Unified Bridge & Status Card** | Auto-detect | Embeds auto-compact and `/clear` controls inside Obsidian Prism's context card with zero extra footer pill, plus plain-language per-module Settings in Prism's Modules tab; standalone mode renders a calm composer `%` pill, minimal quick card (`<= 7` controls), and slim 3-row native Settings | [`packages/core/prism-bridge.js`](./packages/core/prism-bridge.js) · [`status-pill.js`](./packages/core/status-pill.js) |
| **Outline Bookmarks & Vault** | Off (opt-in) | Places a crisp 16px SVG bookmark icon beside native Copy & Undo buttons with hover tooltip, floating `★ N` jump drawer, and cross-session vault (`Ctrl/Cmd + Shift + B`) | [`packages/core/outline-bookmarks.js`](./packages/core/outline-bookmarks.js) · [`bookmark-vault.js`](./packages/core/bookmark-vault.js) |
| **Session Radar** | Off (opt-in) | Sidebar `All / Running / Awaiting` attention filter pill + blurred-only OS alerts (compatible with Antigravity v2.35.1 DOM) | [`packages/core/session-radar.js`](./packages/core/session-radar.js) |
| **Native Plugin, Watch Sidecar & Doctor** | CLI / Plugin | Native `plugin.json` + watch sidecar (`npm run install:plugin`), standalone adaptive-backoff `npm run watch`, and read-only `npm run doctor` | [`plugin.json`](./plugin.json) · [`cli/install-plugin.mjs`](./cli/install-plugin.mjs) · [`cli/doctor.mjs`](./cli/doctor.mjs) |

### Engineering Guardrails (Verified in CI on Every Commit)

- **Triple Anti-Mis-Trigger & Scroll Shield**: Never interrupts active streaming turns, never overwrites composer drafts (typing aborts compaction immediately), defers while you are scrolling, shields viewport scroll position during auto-compaction, and resets automatically after compaction (`compactedAtStepIndices` or `-10%` drop).
- **Zero-ASAR & Zero Runtime Dependencies**: Pure Node.js `>= 22` + UMD scripts; leaves `app.asar` untouched and never restarts Antigravity.
- **Split View & 8+1 Languages**: Tracks the active focused split pane (`resolveActivePaneScope`) and ships full key-aligned localization for `zh-CN`, `zh-TW`, `yue`, `en`, `ja`, `ko`, `es`, `fr`, and `de`.
- **0 `:has()`, 0fps Hibernation, 100% Lossless `destroy()`**: Inherits native and Obsidian Prism CSS variables, sleeps on `blur` / `document.hidden`, and removes every owned DOM node, stylesheet, timer, and global cleanly on teardown.

---

## Quick Start (Node.js >= 22, Zero `npm install`)

### 1. Try the Offline Interactive Workbench First (Zero Impact on Live Antigravity)

```bash
git clone https://github.com/tone-leh/agy-session-guard.git
cd agy-session-guard

# Run the native Node 22 test suite (46 tests: 45 pass, 1 conditional Prism-checkout skip, 0 fail)
npm test

# Launch the offline interactive workbench
npm run workbench
# Open http://127.0.0.1:4179
```

### 2. Install as a Native Plugin Sidecar or Attach via Zero-ASAR CLI

> Prerequisite: Antigravity is launched with `--remote-debugging-port=0` (already enabled if Obsidian Prism is installed; on macOS you can also run `open -a "/Applications/Antigravity.app" --args --remote-debugging-port=0`).

```bash
# Option A: Install native plugin manifest + Zero-ASAR watch sidecar into ~/.gemini/config/plugins/agy-session-guard
npm run install:plugin

# Option B: Run read-only diagnostics or manage attach/watch directly from the repo
npm run doctor
node cli/cdp-attach.mjs --attach --dry-run
npm run attach
npm run watch

# Inspect live state or tear down 100% losslessly
npm run status
npm run remove
```

---

## Coexistence with Obsidian Prism & Community Plugins

Session Guard runs cleanly both standalone and alongside visual or telemetry suites:

- **[Obsidian Prism](https://github.com/RMvdesi/obsidian-prism)**: Reuses `window.__agPrismMetricsBridge` with zero duplicate polling; integrates auto-compact and `/clear` controls directly inside Prism's context card Shadow DOM (zero extra footer pill); mounts plain-language per-module Settings inside Prism's Settings → Modules tab with live bidirectional config and 8+1 language sync; marks owned DOM nodes with i18n-skip attributes; and yields automatically if a host suite sets `window.__agSessionGuardOwner`. See [`docs/PRISM_CHANNEL_INTEGRATION.md`](./docs/PRISM_CHANNEL_INTEGRATION.md).
- **[AG Pulse (`antigrative-dashboard`)](https://github.com/ATtacK030130/antigrative-dashboard)**: Reads `window.agPulseHost` or status-bar telemetry cleanly without contention.
- **Vanilla Antigravity**: Falls back automatically to lightweight DOM telemetry and native host CSS variables, surfacing a calm composer `%` pill, minimal quick card, and native Settings section.

---

## Verification Scope

| Area | Verification Method | Status |
| :--- | :--- | :--- |
| Core state machines (`auto-silent`, scroll shield, `/clear`, Draft Vault, Handoff, Bookmarks, Watchdog, Split View, 8+1 i18n, Watch Daemon, Doctor & Plugin Installer) | `npm test` (Node.js 22+ `node --test`: 46 tests — 45 pass, 1 conditional sibling-repo skip, 0 fail) | Passing (CI: Ubuntu / macOS / Windows) |
| Theme variable adaptation, interactive state transitions & lossless `destroy()` | `node workbench/server.mjs --smoke` + offline workbench | Passing in CI |
| Zero-ASAR CDP attach & target allowlist | Unit tests + `--dry-run` inspection | Verified |

---

## Companion Plugins

Built as part of an open-source toolkit for Google Antigravity power users by [@tone-leh](https://github.com/tone-leh):

| Plugin | Role | Architecture |
| :--- | :--- | :--- |
| **[Agy X-Ray](https://github.com/tone-leh/agy-xray)** | Context Composition X-Ray, Live Workspace File Tree (`toggle-aux-pane`), and Bilingual Cross-Session Time Machine | 100% native MCP App (`SEP-1865`) + Lifecycle Hooks (zero patches) |
| **Antigravity Session Guard** *(this repo)* | Proactive `auto-silent` compaction, `/clear` fresh restarts, Draft Vault, Handoff, and Stall Watchdog | Zero-ASAR native plugin + watch sidecar (zero runtime deps) |

Together, **Agy X-Ray** gives you deep visibility into *why* tokens grew and *which* files or past decisions matter, while **Session Guard** automates runtime protection before context overflows. More focused Antigravity native plugins in this series are in active development — follow [@tone-leh](https://github.com/tone-leh) for upcoming releases.

---

## License

[MIT](./LICENSE) — free to use, adapt, or vendor into downstream MIT or GPL-3.0 projects with attribution preserved.
