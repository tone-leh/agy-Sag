# agy-Sag Project Handoff Baseline (v1.0.0)

> This handoff document summarizes the verified architecture, module boundaries, dual-star synergy contract, and next priorities for dedicated `agy-Sag` agents.

## 1. Repository Identity & Scope Guardrails

- **Repository**: `tone-leh/agy-Sag` (renamed from `tone-leh/agy-session-guard`, MIT, Node.js >= 22, zero runtime dependencies)
- **Unified Naming & Storage Migration**: User-facing strings, CLI headers, and primary exports (`mountSag`, `SagWatchDaemon`, `__agSag`, `__agSagOwner`, `agSag.*`) are unified under **`agy-Sag`**. Legacy `agSessionGuard.*` localStorage/sessionStorage keys are automatically migrated to `agSag.*` on non-yielded startup (`migrateLegacyStorage`), while compatibility aliases (`mountSessionGuard`, `SessionGuardWatchDaemon`, `__agSessionGuard`, `__agSessionGuardOwner`) and internal `ag-sg-*` CSS/DOM hooks remain intact for zero-breakage Prism coexistence.
- **Strict Workspace Scope**: Operate **only** inside the `agy-Sag` repository. Do **not** modify `agy-NOV` source files from `agy-Sag` sessions; coordinate across the two repositories strictly through the documented `config.json` schema and README links.
- **Core Positioning**:
  - **`agy-Sag` (This Repo)**: Modular, pick-what-you-need Zero-ASAR CDP deep-enhancement suite for Google Antigravity 2.0 (native Settings embedded control center, 10-language UI translation, composer & main-chat automation, optical themes, read-only quota pulse, offline storage doctor).
  - **`agy-NOV` (Companion Repo)**: 100% official native protocols (MCP Apps SEP-1865 + Lifecycle Hooks), zero ASAR, zero CDP, 9 native modules (`review`, `guard`, `xray`, `turbo`, `radar`, `canvas`, `mem`, `ops`, `remote`) and 5 presets (`minimal`, `core`, `power`, `local-all`, `full`).

## 2. Implemented Capabilities (Verified v1.0.0)

### 11 Independently Toggleable Renderer Modules (`packages/core/`) + 4 Presets
- **Default ON (`essential` preset)**:
  - `hostI18n` (`host-i18n-packs.js`, `host-i18n.js`): Zero-ASAR 10-language DOM translator (`en`, `zh-CN`, `zh-TW`, `ja`, `ko`, `es`, `fr`, `de`, `ru`, `pt-BR`), 465 exact UI strings + 25 parameterized templates per target locale, physical skip isolation (code, inputs, `contenteditable`, chat bubbles, slash command names), `WeakMap` lossless restore, Shadow DOM traversal, Obsidian Prism conflict arbitration (`yield`/`takeover`), custom JSON pack merge, opt-in missing phrase collector.
  - `compactGuard` (`compact-guard.js`, `clean-slate.js`, `recovery-handoff.js`): Custom `/compact` threshold, silent auto-compact with viewport scroll shield, `/clear` clean restart, post-compact recovery strip.
  - `precompactExport` (`precompact-export.js`): Secret-redacted Markdown copy & `.md` download.
  - `draftGuard` (`draft-guard.js`): Per-session unsent composer draft auto-save (7-day TTL).
  - `promptQueue` (`prompt-queue.js`): Streaming follow-up prompt queue (1–20 items) with triple circuit-breakers (streaming, occupied composer, blocking approval/`permission`/`alertdialog`).
  - `sessionWatchdog` (`session-watchdog.js`): Context burn-rate estimator & streaming stall detector (+5m snooze).
- **Default OFF (Strict Opt-In)**:
  - `outlineBookmarks` (`outline-bookmarks.js`, `bookmark-vault.js`): Inline turn stars, floating jump drawer & `Ctrl/Cmd+Shift+B` cross-session archive.
  - `sessionRadar` (`session-radar.js`): Sidebar `All / Running / Awaiting` filter & blurred OS alerts.
  - `safeAutoAccept` (`safe-auto-accept.js`): Policy-gated approval automation (`readonly-safe`, `dev-flow`, `custom`) with non-bypassable linear `HARD_DENY_PATTERNS` blacklist, dry-run, pause & 50-entry audit log.
  - `themeStudio` (`theme-studio.js`): 5 zero-`:has()` presets (`native`, `midnight-ink`, `nord-frost`, `warm-paper`, `oled-pure`), CJK font stack, density, fixed-point sanitized custom CSS & Prism yield.
  - `quotaPulse` (`quota-pulse.js`): Strictly read-only, zero-credential 5h/7d local activity ledger + visible UI rate-limit/countdown parser.
- **Presets**: `essential` (default), `i18n-only`, `power`, `full-auto`.

### Native Embedded Control Center & Zero-Port `agy-NOV` Synergy
- **Settings Hub (`prism-bridge.js`, `styles.js`, `status-pill.js`, `i18n.js`)**: Native `Settings -> Appearance` embedded panel (collapsible summary header, TopDeck presets, 5 horizontal SubTabs: `all`, `ui`, `flow`, `auto`, `nov`) with zero `:has()`, zero `.ag-cs-` rule collisions, and Obsidian Prism coexistence.
- **Zero-Port CDP Bridge (`cli/nov-bridge.mjs`, `cli/watch-daemon.mjs`, `packages/core/nov-synergy.js`)**:
  - Uses CDP `Runtime.addBinding({ name: '__agSagHostBridge', executionContextId })` scoped strictly to the top-level main frame (`Page.getFrameTree` + fail-closed `mainContextId` verification, zero extra HTTP ports).
  - Reads/writes `agy-NOV` `config.json` atomically (`0700`/`0600`, `fs.renameSync`, symlink guard, 9 modules, 5 presets, 9 locales: `auto`, `en`, `zh-CN`, `zh-TW`, `ja`, `ko`, `es`, `fr`, `de`).
  - Pushes initial `nov:state` on ready/reload and watches `ino:mtimeMs:size` for real-time reverse push.
  - Computes 4 live synergy effects: `dual-shield` (`safeAutoAccept × NOV guard`), `context-memory` (`compactGuard × NOV mem/xray`), `radar-dedup` (`sessionRadar × NOV radar`), `dual-star-hub`.

### Unified CLI & Offline Workbench (`cli/`, `workbench/`)
- `cli/sag-cli.mjs`: `attach`, `watch`, `status`, `remove`, `doctor`, `presets`, `i18n list|validate`, `storage audit|backup|export`, `nov status|enable|disable|preset|locale`, `install`, `workbench`.
- `cli/storage-doctor.mjs`: Read-only storage audit, multi-DB SQLite WAL/SHM guard, symlink-safe redacted session export & safe backup.
- `workbench/server.mjs`: Zero-touch offline simulator (`http://127.0.0.1:4179`) covering all modules, 10-language live translation, and interactive `agy-NOV` bidirectional synergy.

## 3. Verification Baseline

Run inside repository root:
```bash
npm test                  # 130/130 tests passing (node --test)
npm run i18n:validate     # 10 locales, 465 exact + 25 patterns per target locale, 0 errors
npm run workbench:smoke   # HTTP 200, 12 markers verified
```

## 4. Recommended Next Priorities for the Dedicated `agy-Sag` Agent

1. **Review & Commit `v1.0.0`**: Inspect `git status` / `git diff`, organize clean commit(s), and push to `origin main` (`tone-leh/agy-Sag`) + optionally tag `v1.0.0` once approved by the user.
2. **Real-Client Opt-In Verification** (only when user authorizes touching live Antigravity): Run `npm run doctor`, test `npm run workbench`, and optionally collect real Antigravity 2.35+ untranslated UI strings with `hostI18nCollectMissing: true` to further expand the 465-entry dictionary.
3. **Visual Polish & Native Packaging**: Polish `assets/hero-dark.svg` / `assets/hero-light.svg` showcasing the v1.0 native Settings hub & dual-star panel, and consider macOS/Windows zero-ASAR CDP launcher helpers that respect Obsidian Prism's `.daemon.pid` / `.relaunch-prompt-state.json` without double relaunch prompts.
4. **Community Ecosystem Expansion**: Add import/export UI for user JSON translation packs in Settings, expand real Antigravity UI coverage for Slash Commands / Marketplace panels, and maintain strict safety invariants (0 `:has()`, 0 runtime deps, fail-closed CDP bridge, non-bypassable `HARD_DENY_PATTERNS`).
