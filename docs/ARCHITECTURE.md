# agy-Sag Architecture

## Design Principles

1. **Zero-ASAR & Zero Runtime Dependencies**: Built strictly on Node.js >= 22 built-ins and plain UMD browser modules (`packages/core/`). Never touches `app.asar`, Apple Developer ID notarization, or `language_server` binaries.
2. **Modular & Pick-What-You-Need**: 11 independently toggleable renderer modules (`hostI18n`, `compactGuard`, `precompactExport`, `draftGuard`, `promptQueue`, `sessionWatchdog`, `outlineBookmarks`, `sessionRadar`, `safeAutoAccept`, `themeStudio`, `quotaPulse`) + 4 one-click scene presets (`essential`, `i18n-only`, `power`, `full-auto`) + offline `storage-doctor` CLI. Disabled modules stop all DOM observers and timers.
3. **Strict Opt-In for Aggressive Capabilities**: `safeAutoAccept`, `themeStudio`, `quotaPulse`, `outlineBookmarks`, and `sessionRadar` default to OFF. `safeAutoAccept` enforces a non-bypassable `HARD_DENY_PATTERNS` blacklist across every policy mode. `quotaPulse` is strictly read-only with zero credential access.
4. **Zero-Overlap Companion Pairing with `agy-NOV`**: `agy-NOV` owns native MCP Apps (SEP-1865) + Lifecycle Hooks (`review`, `guard`, `xray`, `canvas`, `mem`, `remote`), while `agy-Sag` owns deep renderer DOM, 10-language UI translation, composer automation, visual themes, and offline storage diagnostics.
5. **100% Lossless Teardown**: Calling `destroy()` or running `REMOVE_EXPRESSION` restores every translated DOM node/attribute via `WeakMap` snapshots, removes injected `<style>` tags and `data-ag-sag-*` / `data-ag-sg-owned` nodes, and deletes module globals.

## Module Topology

```text
cli/
 ├── sag-cli.mjs         — Unified CLI router (attach, watch, doctor, i18n, storage, presets, install, workbench)
 ├── bundle.mjs          — Deterministic UMD concatenator, SHA-256 hash idempotency & lossless REMOVE_EXPRESSION
 ├── cdp-attach.mjs      — Loopback DevToolsActivePort discovery & target allowlist filter
 ├── watch-daemon.mjs    — Adaptive-backoff (3s -> 30s) CDP watcher with lightweight reload probe
 ├── doctor.mjs          — Read-only Node/CDP/Obsidian Prism/agy-NOV coexistence diagnostics
 ├── storage-doctor.mjs  — Read-only ~/.gemini/antigravity audit, WAL lock detection, backup & redacted export
 └── install-plugin.mjs  — Local plugin installer (~/.gemini/config/plugins/agy-sag)

packages/core/ (UMD, zero runtime deps, 0 :has() CSS)
 ├── coexist.js          — Config sanitization, 4 presets, 11-module catalog, owner yield & idle hibernation
 ├── i18n.js             — Plugin UI strings (8+1 Prism-aligned locales + agy-Sag suite strings)
 ├── host-i18n-packs.js  — 10-language offline UI dictionary (465 exact entries + 25 templates per target locale)
 ├── host-i18n.js        — WeakMap DOM translator with physical skip selectors, Shadow DOM & conflict arbitration
 ├── compact-guard.js    — Configurable /compact guard, auto-silent scroll shield, Lexical slash picker & recovery
 ├── precompact-export.js— Redacted Markdown export & download
 ├── recovery-handoff.js — Post-compact anchor recovery & new-session handoff prompt
 ├── clean-slate.js      — Same-project /clear fresh restart with optional redacted brief
 ├── draft-guard.js      — Per-session debounced unsent draft vault
 ├── prompt-queue.js     — Streaming follow-up queue with triple safety circuit-breakers
 ├── safe-auto-accept.js — Policy-gated approval clicker + non-bypassable hard deny blacklist + audit log
 ├── theme-studio.js     — 5 optical presets, CJK typography, density & fixed-point sanitized custom CSS
 ├── quota-pulse.js      — Read-only 5h/7d turn ledger & visible UI rate-limit signal parser
 ├── outline-bookmarks.js— Opt-in turn stars & floating jump drawer
 ├── bookmark-vault.js   — Searchable cross-session bookmark archive (Ctrl/Cmd+Shift+B)
 ├── session-watchdog.js — Context burn-rate estimator & streaming stall detector (+5m snooze)
 ├── session-radar.js    — Opt-in sidebar attention filter & blurred OS notifications
 ├── status-pill.js      — Adaptive control surface (Prism Context Card Shadow DOM or calm standalone pill)
 ├── prism-bridge.js     — Unified Settings bridge (native Settings -> Appearance or Obsidian Prism Modules tab)
 ├── styles.js           — Zero-:has() host-variable-adaptive stylesheet
 └── index.js            — mountSag / mountSessionGuard lifecycle orchestrator
```

## Naming & Legacy Aliases

The project is unified under **`agy-Sag`** (storage prefix `agSag.*`, globals `window.__agSag`, `window.__agSagCore`, `window.__agSagOwner`). To guarantee zero-breakage upgrades and seamless coexistence with existing host integrations (such as Obsidian Prism), the following internal identifiers and legacy aliases are intentionally preserved:

- **Internal DOM/CSS prefixes (`ag-sg-*`, `data-ag-sg-*`)**: Retained to preserve style isolation and Obsidian Prism's `.ag-sg-*` / `.ag-cs-*` non-collision contract.
- **UMD module globals (`__agSgCore`, `__agSgCoexist`, `__agSg*`)**: Retained alongside `__agSag*` aliases for backwards compatibility with existing loaders.
- **Legacy compatibility aliases (`mountSessionGuard`, `SessionGuardWatchDaemon`, `__agSessionGuard`, `__agSessionGuardOwner`)**: Kept as aliases / fallback checks; `mountSag` automatically migrates `agSessionGuard.*` storage keys to `agSag.*` on startup when not yielded.
