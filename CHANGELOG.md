# Changelog

All notable changes to **Antigravity Session Guard (领航哨)** are documented in this file.

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
