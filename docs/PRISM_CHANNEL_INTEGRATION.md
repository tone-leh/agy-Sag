# Obsidian Prism Channel 13 Integration Blueprint (Post-`v1.0.8-beta.4` Ready)

This document defines the exact, zero-rework contract for absorbing one or more modules from **Antigravity Session Guard (`tone-leh/agy-session-guard`, MIT)** into **Obsidian Prism (`RMvdesi/obsidian-prism`, GPL-3.0)** as an on-demand channel **after** Prism completes its `v1.0.8-beta.4` `src/` repository restructure (see upstream [Issue #69](https://github.com/RMvdesi/obsidian-prism/issues/69) & [Issue #87](https://github.com/RMvdesi/obsidian-prism/issues/87)).

## 1. Zero Channel 1 Byte Overhead

- **Channel 1 Delta**: **`0 B` (or `< 150 B` config key plumbing only)**.
- All Session Guard runtime code (`packages/core/*.js`) loads strictly as an **on-demand Channel** (e.g., `Channel 13: Session Guard`) only when the user enables it in Settings → **Modules**, matching the lazy-loading discipline of Channels 8–12.
- All stylesheets contain **0 `:has()`** selectors and consume only host/Prism CSS custom properties (`--card`, `--foreground`, `--muted-foreground`, `--primary`, `--border`, `--warning`, `--error`, `--success`).

## 2. Host Ownership & Automatic Standalone Yield

When Obsidian Prism mounts any absorbed Session Guard module, set the host ownership flag before or via `mountSessionGuard`:

```js
window.__agSessionGuardOwner = 'obsidian-prism';

const guard = window.__agSgCore.mountSessionGuard({
  win: window,
  doc: document,
  source: 'obsidian-prism',
  persistConfig: false, // Prism settings store remains single source of truth
  config: {
    compactThreshold: cfg.compactThreshold ?? 'off', // opt-in or 80% per Prism default policy
    compactTriggerMode: cfg.compactTriggerMode ?? 'confirm',
    compactFocusPreset: cfg.compactFocusPreset ?? 'default',
    stallThresholdSeconds: cfg.stallThresholdSeconds ?? 180,
    modules: {
      compactGuard: Boolean(cfg.compactGuard),
      precompactExport: Boolean(cfg.compactGuard),
      outlineBookmarks: Boolean(cfg.outlineBookmarks),
      sessionRadar: false, // kept disabled unless explicitly opted in
      sessionWatchdog: Boolean(cfg.compactGuard),
    },
  },
});
```

- Any standalone `agy-session-guard` CLI attachment or `watch-daemon.mjs` detects `window.__agSessionGuardOwner !== 'standalone'` and immediately yields with zero DOM nodes, zero timers, and zero duplicate listeners.

## 3. Alignment with `Obsidian Prism v1.0.8-beta.2+` Invariants

| Upstream Invariant | Session Guard Compliance |
| :--- | :--- |
| **8-Locale Parity** (`zh-CN`, `zh-TW`, `en`, `ja`, `ko`, `es`, `fr`, `de`) | Built directly into `packages/core/i18n.js` with 100% key parity verified in `test/split-view-i18n.test.mjs`. |
| **Multi-Pane Split View (`#62`)** | `context-source.js` resolves the active focused split pane (`resolveActivePaneScope`) and scopes telemetry (`__agPrismMetricsBridge` by `cascadeId`, per-pane `#ag-prism-pulse-bar`), composer editor, banner anchor, bookmarks, and watchdog per pane. |
| **Channel 4 Host i18n Isolation** | Every owned DOM element carries `data-ag-sg-owned="1"`, `data-ag-no-i18n="1"`, `translate="no"`, `data-no-translate="true"`, and `data-agy-no-translate="true"`. |
| **0fps Idle Hibernation** | Stops polling and countdown immediately on `document.hidden`, `window.blur`, and `html[data-ag-cs-win-blur="1"]`. |
| **100% Lossless Teardown** | `guard.destroy()` removes `<style id="ag-sg-core-css">`, every `[data-ag-sg-owned="1"]` node, pulse attributes, timers, and all global `keydown`/`pointerdown`/`focusin` listeners. |

## 4. Recommended Settings Sheet Placement (`Modules`)

- Sheet: **Modules (`modules`)**, directly below `telemetryModule`.
- Controls:
  1. **Context Compaction Guard**: `Off / 70% / 75% / 80% / 85% / 90%`
  2. **Trigger Mode**: `Confirm Bar / Insert Only / Idle 5s Countdown`
  3. **Compaction Focus**: `Default / Code & Errors / ★ Bookmarks / Custom`
  4. **Turn Bookmarks & Vault**: `Off / On` (auto-enhances Prism's left outline popover when enabled)

## 5. Rollout Timing Gate

1. Wait for `@RMvdesi` feedback on [Issue #87](https://github.com/RMvdesi/obsidian-prism/issues/87) to confirm desired module scope.
2. Wait for `v1.0.8-beta.4` Phase 2 `src/` restructure to land on `RMvdesi/obsidian-prism:main` (per [Issue #69](https://github.com/RMvdesi/obsidian-prism/issues/69)) before opening the absorption PR so zero rebase conflicts occur.
