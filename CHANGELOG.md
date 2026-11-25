# Changelog

All notable changes to **Antigravity Session Guard (领航哨)** are documented in this file.

## [Unreleased]

### Added
- **Smart `/compact <focus>` Presets (`packages/core/compact-guard.js`, `packages/core/coexist.js`)**: Switchable compaction focus presets in the `⚙` quick settings popover (`Default`, `Code & Errors`, `★ Bookmarks`, and `Custom` focus instructions) with automatic secret redaction and banner focus badge.
- **Post-Compact Lossless Recovery Card (`packages/core/recovery-handoff.js`)**: Silently captures redacted starred-turn anchors before `/compact` triggers, then surfaces an emerald 1-line post-compaction strip (`Insert Recovery Prompt` with strict zero-draft-overwrite guard, `Copy Anchors`, `Dismiss`).
- **Cross-Session Bookmark & Recap Vault (`packages/core/bookmark-vault.js`)**: Searchable cross-conversation bookmark vault (`Ctrl/Cmd + Shift + B`, jump drawer button, or `⚙` popover) with redacted turn + reply snippets, per-item/per-session cleanup, and combined Markdown copy / `.md` download.
- **Turn Stall Watchdog & Context Burn-Rate Estimator (`packages/core/session-watchdog.js`)**: Tracks rolling per-turn burn rate (`estimatedTurnsLeft`), flags `>= 18%` single-turn spikes, and detects silent streaming stalls (`off / 2m / 3m / 5m`) with banner alerts and blurred-only OS desktop notifications via Session Radar.

## [0.3.0] - 2026-11-25

### Added
- **Standalone Zero-ASAR Watch Daemon (`cli/watch-daemon.mjs`, `npm run watch`)**: Continuously discovers the local Antigravity CDP port with adaptive backoff (`3s` active → up to `30s` steady-state), automatically attaches to newly opened or `Cmd+R`-reloaded host windows using a lightweight hash probe, honors `window.__agSessionGuardOwner` yield, supports `--once` and `--json` NDJSON mode, and never restarts Antigravity.
- **Standalone Native Bookmark Jump Drawer (`packages/core/outline-bookmarks.js`)**: Works natively with or without Obsidian Prism installed — surfaces a zero-clutter sticky `★ N` chip once turns are bookmarked, opens a jump popover listing redacted turn snippets, scrolls smoothly to the selected bubble with a temporary pulse highlight (`data-ag-sg-pulse`), and includes one-click `Copy ★ MD` & `Download ★ .md` footer actions.
- **One-Click Local `.md` File Download (`packages/core/precompact-export.js`, `packages/core/compact-guard.js`)**: Added `buildRecapFilename()`, `downloadRecapMarkdown()`, and a compact `↓ .md` download button on the Compact Guard banner with localized toasts across all 5 locales (`zh-CN`, `zh-TW`, `yue`, `en`, `ja`).
- **Offline Workbench v0.3 & Expanded Test Suite**: Added multi-turn conversation preview, `.md` download log feedback, `--smoke` CI flag, and `test/watch-daemon.test.mjs` + native jump drawer + `.md` download + 5-locale key parity tests.

## [0.2.0] - 2026-11-25

### Added
- **Turn & Outline Bookmarks (`packages/core/outline-bookmarks.js`)**: Per-`cascadeId` persisted `☆ / ★` bookmark toggles on user turns and inside Obsidian Prism's left outline popover, with bookmarked-only outline filtering.
- **Pre-Compact Starred Export Integration**: When turns are starred, the Compact Guard bar automatically switches its export button to `Export ★ (N)` for instant redacted Markdown snapshots prior to `/compact`.
- **Session Radar (`packages/core/session-radar.js`)**: Opt-in sidebar `All / Running / Awaiting` attention filter pill with live counts and blurred-only Web Notification alerts (`Off / Awaiting Only / Awaiting & Done`).
- **Quick Settings Popover Upgrade**: Added inline module toggles (`Turn Bookmarks`, `Session Radar`) and blurred alert selector across all 5 locales (`zh-CN`, `zh-TW`, `yue`, `en`, `ja`).
- **Offline Interactive Workbench v0.2 (`workbench/server.mjs`)**: Added simulated sidebar sessions, live `running -> awaiting_decision` transition trigger, and star bookmark testing across 4 themes.
- **Brand & Showcase Assets (`assets/`)**: Custom vector logo (`logo.svg`), adaptive dark/light hero previews (`hero-dark.svg`, `hero-light.svg`), and 3-state guard visual (`guard-states.svg`).

## [0.1.0] - 2026-11-25

### Added
- **Compact Guard (`packages/core/compact-guard.js`)**: Configurable compaction threshold (`off / 70 / 75 / 80 / 85 / 90%`), 3 trigger modes (`confirm`, `fill-only`, `auto-countdown`), overflow highlighting (`>= 100%`), and triple anti-mis-trigger protection (streaming block, zero draft overwrite, smart dismiss & auto-reset on compaction).
- **Pre-Compact Markdown Export (`packages/core/precompact-export.js`)**: Structured conversation recap builder with secret redaction (`sk-`, `AIza`, `ghp_`, `Bearer`, JWT, PEM private keys).
- **Zero-ASAR CDP Attacher & Bundler (`cli/cdp-attach.mjs`, `cli/bundle.mjs`)**: Read-only localhost CDP discovery, target allowlist, idempotent hash-guarded injection, and 100% lossless teardown.
- **Coexistence Contract (`packages/core/coexist.js`, `docs/ARCHITECTURE.md`)**: Zero-overhead `__agPrismMetricsBridge` / `agPulseHost` reuse, `window.__agSessionGuardOwner` auto-yield, `data-ag-no-i18n="1"` isolation, 0 `:has()`, and 0fps idle hibernation.
