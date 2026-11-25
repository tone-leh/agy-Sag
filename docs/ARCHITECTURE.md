# Architecture & Coexistence / Integration Contract

## 1. Design Principles

1. **Zero runtime dependencies**: Pure UMD/ESM JavaScript running on Node.js `>= 22` and Chromium renderer contexts.
2. **Zero-ASAR**: Never patches `app.asar` or application binaries; attaches strictly to an existing localhost CDP port.
3. **Zero `:has()`, 0fps idle hibernation**: Styles rely purely on host CSS custom properties (`--background`, `--card`, `--foreground`, `--muted-foreground`, `--primary`, `--border`, `--warning`, `--error`), and all timers pause immediately on `document.hidden`, `window.blur`, or `html[data-ag-cs-win-blur="1"]`.
4. **Triple anti-mis-trigger guard for `/compact`**:
   - **Never interrupts streaming**: When `[data-testid="stop-button"]` / `[data-testid="input-cancel-button"]` is present or telemetry reports `streaming: true`, confirmation actions disable and countdown pauses.
   - **Zero draft overwrite**: Before filling or auto-sending `/compact`, non-empty composer text aborts insertion and cancels any active countdown.
   - **Per-`cascadeId` dismiss & auto-reset**: Dismissing suppresses alerts until either usage climbs another `+10%` (`rearmDeltaPct`) or compaction occurs (`compactedAtStepIndices` increases or usage drops below `threshold - 10%`).

## 2. Module Layout

```text
packages/core/
├── i18n.js               # 5-locale table (zh-CN, zh-TW, yue, en, ja)
├── coexist.js            # Config validation, owner auto-yield, hibernation helpers
├── context-source.js     # Telemetry adapter (__agPrismMetricsBridge -> agPulseHost -> Pulse DOM -> DOM fallback)
├── precompact-export.js  # Structured Markdown exporter + secret redaction + per-session bookmarks
├── styles.js             # Theme-adaptive zero-:has() CSS
├── compact-guard.js      # Module G: threshold banner, countdown, quick settings popover
├── session-radar.js      # Module B (v0.2 skeleton): attention transition detector (default off)
└── index.js              # mountSessionGuard(opts) unified registry & lossless destroy()
```

## 3. Coexistence & Downstream Absorption Contract (e.g. Obsidian Prism)

`agy-session-guard` is licensed under **MIT** (upward-compatible with `GPL-3.0-only`) and ships an explicit coexistence contract so theme suites such as **Obsidian Prism** can either coexist side-by-side or absorb `packages/core/` directly into `vendor/` as an on-demand channel:

- **Owner Auto-Yield**: If a host suite absorbs `packages/core/` and sets `window.__agSessionGuardOwner = 'obsidian-prism'` (or calls `mountSessionGuard({ source: 'obsidian-prism', ... })`), any standalone CDP injection automatically detects the owner and yields with zero DOM or timer side effects.
- **Zero-Overhead Telemetry Reuse**: `context-source.js` automatically reads `window.__agPrismMetricsBridge` / `window.agPulseHost` before falling back to DOM estimation, avoiding duplicate Language Server RPC polling.
- **Channel 4 Host i18n Isolation**: All owned DOM nodes carry `data-ag-sg-owned="1"`, `data-ag-no-i18n="1"`, and `translate="no"` so external DOM localizers never mutate Guard UI text.
- **Settings Sheet Placement Guidance for Host Suites**:
  - Recommended host sheet: **Modules (`modules`)**, directly below `telemetryModule` (automatically dimmed when `telemetryModule === 'off'`).
  - Controlled externally via `api.updateConfig({ compactThreshold, compactTriggerMode })` with `persistConfig: false` when the host suite manages persistence.
- **100% Lossless Teardown**: Calling `window.__agSessionGuard.destroy()` removes the `<style id="ag-sg-core-css">`, removes every `[data-ag-sg-owned="1"]` node, clears all timers/listeners, and deletes all `window.__agSg*` globals.
