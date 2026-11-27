# agy-Sag Project Handoff Baseline (v1.0.0)

> This handoff document summarizes the verified architecture, module boundaries, dual-star synergy contract, and next priorities for dedicated `agy-Sag` agents.

## 1. Repository Identity & Scope Guardrails

- **Repository**: `tone-leh/agy-Sag` (renamed from `tone-leh/agy-session-guard`, MIT, Node.js >= 22, zero runtime dependencies)
- **Unified Naming & Storage Migration**: User-facing strings, CLI headers, and primary exports (`mountSag`, `SagWatchDaemon`, `__agSag`, `__agSagOwner`, `agSag.*`) are unified under **`agy-Sag`**. Legacy `agSessionGuard.*` localStorage/sessionStorage keys are automatically migrated to `agSag.*` on non-yielded startup (`migrateLegacyStorage`), while compatibility aliases (`mountSessionGuard`, `SessionGuardWatchDaemon`, `__agSessionGuard`, `__agSessionGuardOwner`) and internal `ag-sg-*` CSS/DOM hooks remain intact for zero-breakage Prism coexistence.
- **Strict Workspace Scope**: Operate **only** inside the `agy-Sag` repository. Do **not** modify `agy-NOV` source files from `agy-Sag` sessions; coordinate across the two repositories strictly through the documented `config.json` schema and README links.
- **Core Positioning**:
  - **`agy-Sag` (This Repo)**: Modular, pick-what-you-need Zero-ASAR CDP deep-enhancement suite for Google Antigravity 2.0 (native Settings embedded control center, 10-language UI translation, composer & main-chat automation, optical themes, read-only quota pulse, offline storage doctor).
  - **`agy-NOV` (Companion Repo)**: 100% official native protocols (MCP Apps SEP-1865 + Lifecycle Hooks), zero ASAR, zero CDP, 13 native modules across 5 categories (`review`, `guard`, `xray`, `turbo`, `radar`, `verify`, `worktree`, `spec`, `studio`, `canvas`, `mem`, `ops`, `remote`) and 5 presets (`minimal` 6 / `core` 12 / `power` 32 / `local-all` 43 / `full` 47 tools).

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
- `cli/sag-cli.mjs`: `launch`, `keepalive`, `attach`, `watch`, `status`, `remove`, `doctor`, `presets`, `i18n list|validate`, `storage audit|backup|export`, `nov status|enable|disable|preset|locale`, `install`, `workbench`.
- `cli/launcher.mjs`: Cross-platform zero-ASAR CDP launcher & `SagKeepaliveController` (macOS/Windows/Linux process probing, Prism `.daemon.pid` JSON + `.relaunch-prompt-state.json` yield, guide-only default with opt-in `<= 5,000 ms` graceful cold-start relaunch, two-layer circuit breakers, `0600` atomic `launch-state.json`).
- `cli/storage-doctor.mjs`: Read-only storage audit, multi-DB SQLite WAL/SHM guard, symlink-safe redacted session export & safe backup.
- `workbench/server.mjs`: Zero-touch offline simulator (`http://127.0.0.1:4179`) covering all modules, 10-language live translation (including `/ext/<locale>.json` extended packs), and interactive `agy-NOV` bidirectional synergy.

### Post-1.0 Polish & Expansion (Unreleased)
- **Phase 0 — Roadmap & Single-Source Product IA (`docs/ROADMAP.md`, `docs/PRODUCT-IA.md`, `AGENTS.md`)**: Defined the 5-layer feature hierarchy (`L0–L4`), 6-tab single-source Settings Hub architecture, `--sag-*` visual tokens aligned with `agy-NOV`, phased 0–7 execution roadmap, and zero-overlap dual-star boundaries (including `agy-NOV` v0.5.0 13-module alignment). *IA Simplification Check*: Documentation baseline established; duplicate switch/tab cleanup completed in Phase 1.
- **Phase 1 — Unified 6-Tab Settings Hub, `agy-NOV` v0.5.0 Sync & Visual Tokens (`packages/core/prism-bridge.js`, `packages/core/styles.js`, `packages/core/coexist.js`, `packages/core/i18n.js`, `packages/core/compact-guard.js`, `packages/core/status-pill.js`, `packages/core/nov-synergy.js`, `cli/nov-bridge.mjs`, `workbench/server.mjs`, `test/settings-hub.test.mjs`)**:
  - Consolidated all 11 module master switches exclusively into the `overview` tab (`precompactExport` nested inside `compactGuard`), removed duplicate top cards and legacy `compact-guard.js` popovers, and migrated legacy `all`/`flow`/`auto` tab keys.
  - Added instant cross-tab search across hidden `<details>` sections (matching nested child modules), inline 2-step config reset, JSON export/sanitized import, `420px` global drawer (`Ctrl/Cmd+Alt+,`, `Esc`), `agy-NOV` v0.5.0 13-module/5-category sync, `--sag-*` visual tokens, `40×22` switches, and gradient hexagon SVG badges.
  - *IA Simplification Check (PASS)*: Verified 0 duplicate `[data-ag-sag-mod]` toggles outside `overview`, 0 `"Prism"` occurrences across `SAG_UI_PACKS`, 0 `:has()` CSS rules, single-locale `ru` bundle size `1,467,179 B` (`<= 1,677,721 B`), independent `auditor` review passed after fixing nested `precompactExport` search and cross-tab NOV auto-refresh scoping.
- **Phase 2 — Unified Segmented Status Capsule HUD (`packages/core/status-pill.js`, `packages/core/styles.js`, `packages/core/index.js`, `packages/core/compact-guard.js`, `packages/core/i18n.js`, `test/status-hud.test.mjs`, `test/standalone-ux.test.mjs`)**:
  - Upgraded the standalone footer pill into a multi-segment HUD (`ctx` progress ring, `eta`/stall, `quota`, `queue`, `bookmarks`, `autoAccept`, `nov`, `brand` fallback) with zero new config keys; toggling any module immediately adds/removes its HUD segment.
  - Removed duplicate `compactThreshold` buttons from both the standalone quick card and Prism context card (leaving read-only percentage readouts and direct links to Settings `overview` / `conversation`), expanded the standalone quick card grid to reflect enabled module readouts (`auto-compact`, `eta`, `quota`, `queue`, `agy-NOV`), surfaced read-only HUD chips in the Prism card, and removed redundant ETA/spike tails from the Compact Guard banner.
  - *IA Simplification Check (PASS)*: Confirmed zero duplicate threshold switches outside Settings `conversation`, zero `:has()` / `.ag-cs-` CSS rules, 100% 9-locale `PACKS` key parity, zero `"Prism"` leaks in consumer UI strings, `170/170` tests passing, and `ru` bundle size `1,481,504 B` (`<= 1,677,721 B`).
- **Phase 3 — Prompt Library & Command Palette (`packages/core/prompt-library.js`, `cli/nov-bridge.mjs`, `cli/watch-daemon.mjs`, `packages/core/coexist.js`, `packages/core/index.js`, `packages/core/prism-bridge.js`, `packages/core/styles.js`, `packages/core/i18n.js`, `workbench/server.mjs`, `test/prompt-library.test.mjs`)**:
  - Added the 12th renderer module `promptLibrary` (default OFF, enabled in `power` and `full-auto`), providing a composer footer button + `Ctrl/Cmd+Alt+P` modal palette with slash shortcuts, 6 bilingual `{{var=default}}` templates, local custom snippets (`agSag.promptLibrary.v1`, `<= 100` snippets, `<= 128 KB` import cap, zero `innerHTML`), and read-only `agy-NOV` `ops/prompts.json` loading via zero-port `sag:nov_templates` (symlink-guarded, `<= 256 KB` cap).
  - Updated `README.md` & `README.zh-CN.md` end-to-end without static text/badge images (replaced `img.shields.io` images with plain translatable text metadata) and recorded the mandatory per-push README verification policy in `AGENTS.md`.
  - *IA Simplification Check (PASS)*: Verified all 12 master switches appear exclusively in `Overview`, Prompt Library import/export sits inside `<details>` in `conversation`, zero `:has()` / `.ag-cs-` CSS rules, zero `"Prism"` leaks in `SAG_UI_PACKS`, `176/176` tests passing, independent `auditor` review passed (fixing MutationObserver self-trigger guard, `insertMode` reset, live Settings import status/textarea sync & `realpath` containment), and `ru` bundle size `1,553,192 B` (`<= 1,677,721 B`).
- **Layered 9-Locale Extended UI Dictionaries (`packages/core/locales/ext/*.json`, `scripts/i18n/`, `THIRD_PARTY_NOTICES.md`)**: Expanded target-locale coverage to ~5,375–5,491 entries per locale (`zh-CN`: 465 core + 4,602 ext + 424 patterns = 5,491; `zh-TW`: 5,430; `ja`: 5,421; `ko`: 5,422; `es`: 5,407; `fr`: 5,375; `de`: 5,381; `ru`: 5,424; `pt-BR`: 5,399) using strict precedence (`Custom > 465 Core > Extended`), loaded via single-locale CDP preload (`<= 1.6 MB`), zero-port `sag:ext_pack` bridge requests, or Workbench `/ext/<locale>.json`. `zh-CN` adapts MIT-licensed `yiheng8023/antigravity-chinese` (`v3.3.65`); the other 8 locales were independently translated from the deduplicated English source table.
- **Cross-Platform CDP Launcher & Prism JSON PID Fix (`cli/launcher.mjs`, `cli/watch-daemon.mjs`)**: Fixed `isPrismDaemonActive()` to parse JSON `.daemon.pid` files and added safe cross-platform `launch` / `keepalive` automation.
- **Visual & Accessibility Fixes (7 items, see `CHANGELOG.md`)**: Keyboard `Enter`/`Space` header toggle with focus retention across re-renders, removal of redundant `✦` prefix adjacent to status dots, `168px` minimum column width on `.ag-sag-nov-grid` eliminating English label truncation, pure-CSS dropdown indicator on `.ag-sag-select`, high-contrast light-theme active chips, unified `:focus-visible` focus rings, and workbench multi-locale sync.
- **Settings Panel Locale Sync Fix**: Added `Внешний вид` (`ru`) and `Aparência` (`pt-BR`) headings plus mounted-section & dialog `aria-label` anchor fallbacks in `prism-bridge.js` so language badges/selectors stay synced across all 10 locales and custom title overrides.
- **Custom Language Pack Import/Export & Hardening**: Added `sanitizeImportedPack()` in `host-i18n-packs.js` (256 KB JSON cap, 2000 exact entries, 500-char key/value/replace caps, 50 patterns, 200-char source cap, prototype-key guard, backreference `\1`..`\9` / `\k<name>` rejection, linear-time nested quantifier / alternation-backtracking rejection), local persistence (`agSag.hostI18n.customPacks.v1` with `options.customHostI18nPacks` precedence), and Settings UI controls (`Import JSON`, collapsible editor + `Apply`, `Export Custom Pack`, opt-in `Collect Missing` + `Export Missing Template`, `Clear Custom Packs`).
  - *Known Conservative Trade-off*: The linear-time regex validator treats any group containing `|`, `?`, `+`, `*`, or `{m,n}` followed by an outer `+`/`*`/`{` (including some benign `(?:...)+` alternations) as unsafe backtracking risk and rejects it intentionally rather than risking main-thread ReDoS.

## 3. Verification Baseline

Run inside repository root:
```bash
npm test                                  # 176/176 tests passing (node --test)
npm run i18n:validate                     # 10 built-in + 9 extended packs, 0 errors
npm run workbench:smoke                   # HTTP 200, 994474 B, 16 markers verified
node cli/sag-cli.mjs launch --dry-run --json  # Read-only launch plan + Prism yield check
```

## 4. Recommended Next Priorities for the Dedicated `agy-Sag` Agent

1. **Real Windows/Linux Host Verification for Launcher & Keepalive** *(requires user environment)*: Verify `launch` and `keepalive` on native Windows (`powershell.exe` / `wmic` / `taskkill`) and Linux desktops alongside live Antigravity restarts (verified only via mocked tests and macOS `--dry-run` so far).
2. **Human Spot-Check & Terminology Polish of Extended Packs**: Audit and refine the generated 8-locale extended dictionaries (`packages/core/locales/ext/*.json`) against live Antigravity 2.35+ UI contexts.
3. **Collect Real Antigravity 2.35+ UI Strings** *(requires user authorization to attach to live Antigravity)*: Run `npm run doctor`, attach with `hostI18nCollectMissing: true` or export missing templates via the Settings UI to capture any new phrases beyond v3.3.65.
