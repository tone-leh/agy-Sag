# Antigravity Session Guard

> **Modular long-session copilot for Google Antigravity (MIT · Zero runtime deps · Zero-ASAR)**  
> Configurable context compaction threshold & early confirmation · Pre-compact redacted Markdown export · Seamless coexistence & integration contract for Obsidian Prism

> **Disclaimer**: Independent open-source project; not affiliated with or endorsed by Google LLC.

## Highlights

- **Context Compaction Guard (`compactGuard`)**:
  - Configurable threshold (`off / 70% / 75% / 80% / 85% / 90%`, or custom `50–98%`) to catch context pressure long before reaching `102%+`.
  - Three trigger modes: **Confirm Bar** (default), **Insert Only**, and opt-in **Idle 5s Cancelable Countdown**.
  - Triple safety guard: never interrupts streaming turns, never overwrites composer draft text, and automatically resets after compaction or a `10%` usage drop.
- **Turn Bookmarks & Pre-Compact Redacted Markdown Export (`outlineBookmarks` + `precompactExport`)**:
  - Per-`cascadeId` persisted `☆ / ★` turn bookmarks on user turns & Obsidian Prism's left outline popover with bookmarked-only filtering.
  - One-click **Export MD / Export ★ (N)** right beside the compaction confirmation action with automatic secret redaction (`sk-`, `AIza`, `ghp_`, `Bearer`, JWT, PEM private keys).
- **Session Radar (`sessionRadar`, opt-in, default off)**:
  - Compact sidebar attention filter pill (`All / Running / Awaiting`) with live counts and opt-in out-of-focus OS desktop notifications (`Off / Awaiting Only / Awaiting & Done`).
- **Zero-ASAR & Coexistence-First**:
  - Reuses existing `window.__agPrismMetricsBridge` / `window.agPulseHost` telemetry without duplicate RPC polling, inherits host theme CSS variables (0 `:has()`), hibernates at 0fps on blur/hidden, yields automatically when `window.__agSessionGuardOwner` is present, and tears down 100% losslessly.

## Quick Start (Node.js >= 22, Zero Dependencies)

```bash
# Run unit & hygiene test suite
npm test

# Launch offline interactive simulator (never touches your running Antigravity)
npm run workbench
# Open http://127.0.0.1:4179

# Attach via Zero-ASAR CDP (read-only discovery, never restarts host)
node cli/cdp-attach.mjs --attach --dry-run
npm run attach
npm run remove
```

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the coexistence and downstream absorption contract.

## License

[MIT](./LICENSE)
