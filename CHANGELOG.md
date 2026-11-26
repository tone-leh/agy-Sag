# Changelog

All notable changes to **Antigravity Session Guard (领航哨)** are documented in this file.

## [0.4.0] - 2026-11-26

### Added
- **Zero-Popup `auto-silent` Idle Compaction & Viewport Scroll Shield (`packages/core/compact-guard.js`, `packages/core/context-source.js`)**: Switched the default compaction mode to `auto-silent` with a 3-second idle countdown that triggers `/compact` without popping up a banner, aborts silently on draft input, defers while the user is scrolling, and activates a non-intrusive viewport scroll shield + scroll-settle guard so auto-compaction preserves your reading position.
- **Clean Slate Same-Project Fresh Restart (`packages/core/clean-slate.js`)**: Added `/clear` and `/clear keep` slash commands that start a fresh conversation inside the exact same project with zero lingering images or bloated tool logs (`/clear keep` carries a compact secret-redacted continuity brief).
- **Native Antigravity Plugin Manifest, Watch Sidecar & Installer (`plugin.json`, `sidecars/daemon/`, `cli/install-plugin.mjs`, `npm run install:plugin`)**: Packaged Session Guard as a native Antigravity plugin with an auto-managed Zero-ASAR watch sidecar.
- **Draft Vault, New-Session Handoff, Watchdog `+5m` Snooze & Doctor CLI (`packages/core/draft-guard.js`, `packages/core/recovery-handoff.js`, `packages/core/session-watchdog.js`, `cli/doctor.mjs`, `npm run doctor`)**: Added per-`cascadeId` debounced unsent draft recovery (7-day TTL), one-click redacted New-Session Handoff prompt generation, `+5m` stall snooze, and a read-only environment & Obsidian Prism coexistence diagnostic CLI.
- **Obsidian Prism Native Card Integration & Standalone Calm UX (`packages/core/status-pill.js`, `packages/core/prism-bridge.js`)**: Automatically embeds auto-compact and clean-restart controls inside Obsidian Prism's context card Shadow DOM with zero extra footer pill, and bridges plain-language per-module Settings into Prism's Modules tab; standalone users receive a calm composer `%` pill, a minimal quick card (`<= 7` controls), and a slim 3-row native Settings section.
- **Split View Multi-Pane Tracking, 8+1 Locale Parity & Prism Channel 13 Blueprint (`packages/core/context-source.js`, `packages/core/i18n.js`, `docs/PRISM_CHANNEL_INTEGRATION.md`)**: Tracks the active focused split pane (`resolveActivePaneScope`) and delivers 100% key-aligned localization across `zh-CN`, `zh-TW`, `yue`, `en`, `ja`, `ko`, `es`, `fr`, and `de`.
- **Cross-Platform CI & Internationalized Primary README (`.github/workflows/ci.yml`, `README.md`, `README.zh-CN.md`)**: Enabled Node 22 GitHub Actions CI (`ubuntu-latest`, `macos-latest`, `windows-latest`) running `npm test` (46 tests) and `node workbench/server.mjs --smoke`, promoted English `README.md` to primary with `README.zh-CN.md` companion docs, and refreshed preview assets to `v0.4`.

### Changed
- **Inline Opt-In Turn Bookmarks (`packages/core/outline-bookmarks.js`, `packages/core/coexist.js`, `packages/core/styles.js`)**: Moved the turn bookmark control into the native Copy/Undo message action bar as a crisp 16px SVG icon with hover tooltip, and made `outlineBookmarks` opt-in by default alongside plain-language per-module Settings guides and card tooltips.
- **Streamlined Banner & Controls (`packages/core/compact-guard.js`, `packages/core/status-pill.js`)**: Hid the confirmation banner while streaming, trimmed manual banner actions to `<= 2` with frosted-glass styling, defaulted `/clear` to clean restart, and enforced `<= 7` controls on the quick status card.

### Fixed
- **Antigravity v2.35.1 Live DOM & Lexical Compatibility (`packages/core/compact-guard.js`, `packages/core/context-source.js`, `packages/core/session-radar.js`, `packages/core/outline-bookmarks.js`, `packages/core/styles.js`)**: Updated sidebar running/awaiting selectors, autoscroll dock detection, `display:contents` banner width handling, send button selectors, Lexical v2.35 two-step slash-command picking, and `cascadeId`-scoped bridge telemetry snapshots.

## [0.3.0] - 2026-11-25

### Added
- **Smart `/compact <focus>` Presets (`packages/core/compact-guard.js`, `packages/core/coexist.js`)**: Switchable compaction focus presets in the `⚙` quick settings popover (`Default`, `Code & Errors`, `★ Bookmarks`, and `Custom` focus instructions) with automatic secret redaction and banner focus badge.
- **Post-Compact Lossless Recovery Card (`packages/core/recovery-handoff.js`)**: Silently captures redacted starred-turn anchors before `/compact` triggers, then surfaces an emerald 1-line post-compaction strip (`Insert Recovery Prompt` with strict zero-draft-overwrite guard, `Copy Anchors`, `Dismiss`).
- **Cross-Session Bookmark & Recap Vault (`packages/core/bookmark-vault.js`)**: Searchable cross-conversation bookmark vault (`Ctrl/Cmd + Shift + B`, jump drawer button, or `⚙` popover) with redacted turn + reply snippets, per-item/per-session cleanup, and combined Markdown copy / `.md` download.
- **Turn Stall Watchdog & Context Burn-Rate Estimator (`packages/core/session-watchdog.js`)**: Tracks rolling per-turn burn rate (`estimatedTurnsLeft`), flags `>= 18%` single-turn spikes, and detects silent streaming stalls (`off / 2m / 3m / 5m`) with banner alerts and blurred-only OS desktop notifications via Session Radar.
- **Standalone Zero-ASAR Watch Daemon (`cli/watch-daemon.mjs`, `npm run watch`)**: Continuously discovers the local Antigravity CDP port with adaptive backoff (`3s` active → up to `30s` steady-state), automatically attaches to newly opened or `Cmd+R`-reloaded host windows using a lightweight hash probe, honors `window.__agSessionGuardOwner` yield, supports `--once` and `--json` NDJSON mode, and never restarts Antigravity.
- **Standalone Native Bookmark Jump Drawer (`packages/core/outline-bookmarks.js`)**: Works natively with or without Obsidian Prism installed — surfaces a zero-clutter sticky `★ N` chip once turns are bookmarked, opens a jump popover listing redacted turn snippets, scrolls smoothly to the selected bubble with a temporary pulse highlight (`data-ag-sg-pulse`), and includes one-click `Copy ★ MD` & `Download ★ .md` footer actions.
- **One-Click Local `.md` File Download (`packages/core/precompact-export.js`, `packages/core/compact-guard.js`)**: Added `buildRecapFilename()`, `downloadRecapMarkdown()`, and a compact `↓ .md` download button on the Compact Guard banner with localized toasts across all 5 locales (`zh-CN`, `zh-TW`, `yue`, `en`, `ja`).
- **Interactive Multi-Session Workbench & Expanded Test Suite**: Upgraded offline workbench (`workbench/server.mjs`, `--smoke` flag) with clickable multi-session switching and approval simulation; expanded Node.js 22 native tests to 22 passing suites.

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
