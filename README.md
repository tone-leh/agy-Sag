# agy-Sag

[简体中文](./README.zh-CN.md)

**Modular Zero-ASAR CDP deep-enhancement suite for Google Antigravity 2.0** *(formerly `agy-session-guard`)*

Live **10-language native UI translation** (~5,400 entries per locale), unified **6-Tab Control Hub & Global Drawer (`Ctrl/Cmd+Alt+,`)**, **segmented status capsule HUD**, **Prompt Library & Command Palette (`Ctrl/Cmd+Alt+P`)**, configurable auto `/compact` guard with viewport scroll shield, streaming **Prompt Queue**, crash-proof **Draft Vault**, turn bookmarks & cross-session archive, **policy-gated Auto-Accept** with a non-bypassable hard deny blacklist, zero-`:has()` **Optical Theme Studio**, read-only **Quota Pulse**, and offline **Storage Doctor** — **pick only the modules you want**.

> **License:** [MIT](./LICENSE) · **Runtime:** Node.js >= 22 · **Dependencies:** Zero runtime npm deps · **Architecture:** Zero-ASAR CDP (Lossless) · **Companion:** [`agy-NOV`](https://github.com/tone-leh/agy-NOV)

---

## Best Together: `agy-NOV` + `agy-Sag` (Dual-Star Synergy)

We maintain **two complementary, zero-overlap plugins** built specifically for Google Antigravity 2.0 so you can install both without duplication or conflict:

| Dimension | [`agy-NOV`](https://github.com/tone-leh/agy-NOV) — Native Protocol Workbench | **`agy-Sag`** (This Repo) — UI & Conversation Cockpit |
| :--- | :--- | :--- |
| **Architecture** | 100% official MCP Apps (SEP-1865) + Lifecycle Hooks; **zero ASAR, zero CDP** | Zero-ASAR Electron CDP renderer layer + Watch Sidecar + offline Storage CLI |
| **Upgrade Resilience** | Survives every Antigravity update natively via official plugin protocols | Leaves `app.asar` & Apple notarization untouched; auto re-attaches via Watch Daemon |
| **Core Scope** | Side-pane / global engineering workbench, pre-tool hooks, verify gates, worktrees, spec lock, artifacts & remote IM | Native 6-Tab Settings Hub & global drawer, segmented HUD, 10-language UI translation, main chat DOM, composer palette/queue & local storage hygiene |
| **Included Modules** | **13 native zero-CDP modules** across 5 categories (5 presets, 6–47 tools): `review`, `guard`, `xray`, `turbo`, `radar`, `verify`, `worktree`, `spec`, `studio`, `canvas`, `mem`, `ops`, `remote` | **13 renderer modules + Storage CLI** (4 presets): `hostI18n`, `themeStudio`, `readingNav`, `compactGuard`, `precompactExport`, `draftGuard`, `promptQueue`, `promptLibrary`, `outlineBookmarks`, `sessionWatchdog`, `sessionRadar`, `safeAutoAccept`, `quotaPulse`, `storage-doctor` |

### Built-In Dual-Star Synergy (Zero Extra Ports)

When both **`agy-Sag`** and **`agy-NOV`** are installed together, **`agy-Sag`**'s unified Settings Hub (inside **Settings → Appearance** or the `Ctrl/Cmd+Alt+,` drawer) automatically unlocks the **`agy-NOV`** tab and shared visual language (`--sag-*` aligned with `--nov-*`):

- **Control `agy-NOV` v0.5 directly inside Antigravity Settings**: Toggle all **13 `agy-NOV` modules** organized by 5 categories and switch its **5 presets** (`minimal` 6 / `core` 12 / `power` 32 / `local-all` 43 / `full` 47 tools) in real time. Communication runs over CDP `Runtime.addBinding` (zero extra HTTP ports) to `agy-Sag`'s Watch Sidecar, which atomically updates `agy-NOV`'s `config.json` (`0600`) while `agy-NOV`'s native hot-sync updates `tools/list` live without adding any CDP code to `agy-NOV`.
- **Read-Only `agy-NOV` Template Sharing (`promptLibrary` × `agy-NOV ops`)**: Reads `agy-NOV`'s `ops/prompts.json` over the zero-port `sag:nov_templates` channel (strictly read-only, symlink-guarded, `<= 256 KB`) so your engineering templates appear right inside the `Ctrl/Cmd+Alt+P` palette.
- **Read-Only Live Feed & Per-Turn Rollback (`sag:nov_feed` × `guard` / `spec` / `mem` / `radar`)**: Aggregates read-only snapshots from `agy-NOV` (`<= 256 KB`, symlink-guarded, zero writes) to pause `promptQueue` automatically while `spec` write-lock is active, surface `NOV 🔒` / `NOV · ΔN` memory-drift badges in the HUD and Settings `nov` tab, and add an optional per-turn `↺` rollback prompt filler (only when `agy-NOV guard` is active; appends safely without overwriting drafts).
- **Safety Shield Synergy (`safeAutoAccept` × `agy-NOV guard` / `verify`)**: Pairs frontend hard-deny auto-accept with `agy-NOV`'s PreToolUse secret shield, pre-edit file snapshots, and Stop verify gate.
- **Compaction × Memory & X-Ray (`compactGuard` × `agy-NOV mem` / `xray`)**: Coordinates auto-compaction with code-anchored architectural memory and token breakdown.
- **Zero-Duplicate Alert Arbitration (`sessionRadar` × `agy-NOV radar`)**: Detects when both alert engines are active and offers a 1-click deduplication toggle.

> **Recommended Setup — Install Both:**
> ```bash
> # 1) 13-module native MCP Apps engineering workbench (100% zero CDP, zero ASAR)
> agy plugin install https://github.com/tone-leh/agy-NOV
>
> # 2) Unified Settings Hub, HUD, 10-language UI & deep conversation suite (Zero-ASAR CDP)
> agy plugin install https://github.com/tone-leh/agy-Sag
> ```

---

## Unified Control Hub & Segmented Status HUD

- **Single-Source 6-Tab Settings Hub (`overview | ui | conversation | guard | nov | advanced`)**: Accessible via native **Settings → Appearance** (with an injected `agy-Sag` sidebar jump anchor), the **`Ctrl/Cmd+Alt+,`** slide-out drawer (`Esc` to close), or the status card footer (`Full Settings →`). All 13 module master switches live exclusively in `Overview` (zero duplicate switches), advanced parameters fold inside `<details>`, instant cross-tab search filters all rows, `Advanced` includes JSON export, sanitized import, inline 2-step reset (zero `window.confirm`), runtime diagnostics, and read-only **Local Storage Audit** (`sag:storage_audit`), and **`Ctrl/Cmd+Alt+/`** opens a dynamic active-shortcuts sheet.
- **Unified Segmented Status Capsule HUD & Context Lens**: Compact composer-footer pill displaying live read-only segments driven directly by active module switches (`ctx` 12px conic ring, `eta` turns-left / `m:ss` stall indicator, `quota`, `queue`, `bookmarks`, `autoAccept`, and `NOV`). Clicking the capsule opens a cockpit card with a local **3-segment Context Breakdown Bar** (User / AI / Code & Tools), **Top-3 heaviest turn jump chips**, last-turn elapsed timing, 5h quota progress bar, and 1-click **Export MD**. When Obsidian Prism's context card is detected, `agy-Sag` embeds cleanly inside its Shadow DOM without adding an extra footer pill.

---

## 13 Modular Capabilities + Storage Doctor CLI (Pick Only What You Need)

Every module in **`agy-Sag`** is independently toggleable from the `Overview` tab or CLI. Disabled modules run zero DOM observers, zero listeners, and zero timers.

| Layer | Module | Default | Risk / Isolation | What It Does |
| :---: | :--- | :---: | :--- | :--- |
| **L1** | **Native UI Translation** (`hostI18n`) | **ON** | 100% Offline · Lossless | Real-time multi-language localization for Antigravity 2.x UI across **10 languages** (`zh-CN`, `zh-TW`, `ja`, `ko`, `es`, `fr`, `de`, `ru`, `pt-BR`, `en`). ~5,400 entries per target locale (465 core + layered extended packs + 424 regex patterns), physical skip isolation for code / inputs / chat bubbles / slash command names, Shadow DOM recursion, instant hot-switch, and custom JSON pack import. |
| **L1** | **Theme & Aesthetics** (`themeStudio`) | OFF | 100% Offline | Zero-`:has()` full-surface optical theme & motion engine: **15 dark/light/stylized skins** (7 classic dark incl. Obsidian Dark / Warm Basalt / Midnight / Nord / OLED / Tokyo Night / Catppuccin Mocha, 3 classic light incl. Crystal Day / Warm Paper / Rosé Dawn, 5 stylized incl. Matcha Journal / Phantom Crimson / Doodle Sketch / Pixel Terminal / Aurora Glass), **8 one-click visual looks**, automatic dark/light host pairing, 7 accent overrides, 4 surface materials (Clean / Smoked Facets / Paper & Ink / Aurora Glass), 4 corner styles, 6 monospace stacks (incl. Sarasa SC) + ligatures, CJK tuning, `CSS.highlights` 5-step velvet stream fade, FastDOM smooth typing caret, 0fps semantic horizon glow (Browser-Hole safe), sanitized custom CSS, and `plugin://` extension iframe sync. |
| **L1** | **Reading Navigation** (`readingNav`) | OFF | 100% Offline | Streaming-safe auto-folding for long code blocks (`>= 40` lines default, configurable `20/40/60/80`, covering both chat & `artifact-view`) with `scrollTop` fold compensation, sticky line-count/expand/wrap/copy bar, `Alt+↑/↓` turn navigation, uncapped rail with smooth scroll-to-bottom (`⤓`), `Alt+F` searchable outline & 1-click fold-all code/steps, and zero-`innerHTML` Mermaid zoom + SVG export modal (auto-yields to Prism outline nav). |
| **L2** | **Auto-Compact Guard** (`compactGuard`) | **ON** | 100% Offline | Configurable compaction threshold (`off` or `50%–98%`, default `80%`), silent auto-compact with viewport scroll shield, Lexical two-step slash menu support, `/clear` clean-slate restart, and post-compact anchor recovery. |
| **L2** | **Pre-Compact Export** (`precompactExport`) | **ON** | 100% Offline | Nested under `compactGuard`: secret-redacted Markdown copy and `.md` file download before compaction (masks PEM private keys, API keys, Bearer tokens & JWTs) plus condensed denoised summary mode. |
| **L2** | **Draft Guard** (`draftGuard`) | **ON** | 100% Offline | Debounced per-session auto-save for unsent composer prompts (7-day TTL, 16 KB cap) with one-line restore plus a 30-item redacted sent prompt history recalled via `Ctrl+↑/↓` in empty composers. |
| **L2** | **Prompt Queue** (`promptQueue`) | **ON** | 100% Offline | Queue 1–20 follow-up prompts while the Agent is streaming with inline editing, 1-click jump-to-top priority (`⏫`), and **4 safety circuit-breakers** (streaming active, composer draft occupied, blocking approval card, or `agy-NOV spec` write-lock active). |
| **L2** | **Prompt Library** (`promptLibrary`) | OFF | 100% Offline · Read-Only NOV | Composer button, `Ctrl/Cmd+Alt+P` palette & empty-composer `//` trigger featuring slash shortcuts, 6 bilingual `{{var=default}}` templates, local snippets (CRUD + 128 KB import/export), read-only `agy-NOV` `ops` templates, selection quote/template pill, and a Prism-yielding standalone conversation/path context menu (with `/btw` side question, `/plan`, `/compact`, template fill & `@path` insertion). Never overwrites drafts or auto-submits. |
| **L2** | **Turn Bookmarks & Vault** (`outlineBookmarks`) | OFF | 100% Offline | Inline star button, per-turn `⤺` 3-way recovery menu (NOV rollback / `/compact` focus / up-to-turn handoff copy), floating `★ N` quick-jump drawer, and `Ctrl/Cmd+Shift+B` searchable cross-session archive with redacted Markdown export. |
| **L3** | **Stall & Burn Watchdog** (`sessionWatchdog`) | **ON** | 100% Offline | Rolling burn-rate estimator (`≈N turns` in HUD), single-turn spike indicator, and streaming stall detector (default 3 min) with `+5m` snooze. |
| **L3** | **Sidebar Radar & Alerts** (`sessionRadar`) | OFF | 100% Offline | Sidebar `All / Running / Awaiting` filter bar with blurred-window OS notifications, opt-in zero-network WebAudio synthesized chimes, local browser `speechSynthesis` voice alerts, and `HH:MM-HH:MM` quiet hours. |
| **L3** | **Safe Auto-Accept** (`safeAutoAccept`) | OFF | **Strict Opt-in** · Local | Policy-gated automatic clicking for low-risk inline approval cards (`readonly-safe`, `dev-flow`, `custom`) protected by a **non-bypassable hard deny blacklist** (`rm -rf`, `git push --force`, `git reset --hard`, `DROP TABLE`, `curl\|sh`, `sudo`, `.env`, `~/.ssh`, etc.), dry-run mode, pause toggle, and 50-entry audit log. |
| **L3** | **Quota Pulse** (`quotaPulse`) | OFF | 100% Offline · Read-Only | Zero-credential, zero-network 5h/7d local turn ledger combined with visible UI rate-limit / `Resets in ...` countdown parsing, keeping observed signals separate from local estimates. |
| **CLI** | **Storage Doctor** (`storage-doctor`) | CLI | Read-Only Audit | Offline CLI (`agy-sag storage audit\|backup\|export`) that inspects `~/.gemini/antigravity/` disk usage, orphan folders, SQLite `.db-wal` lock safety, and exports secret-redacted Markdown/JSON session archives. |

### One-Click Scene Presets

Switch presets anytime in Settings or via CLI (`--preset=<name>`):

- **`essential` (default)**: `hostI18n` + `compactGuard` + `precompactExport` + `draftGuard` + `promptQueue` + `sessionWatchdog`
- **`i18n-only`**: Only `hostI18n` enabled for pure native multi-language UI translation
- **`power`**: `essential` + `readingNav` + `promptLibrary` + `outlineBookmarks` + `themeStudio` + `quotaPulse`
- **`full-auto`**: All 13 modules enabled (`safeAutoAccept` locked to `readonly-safe` by default)

---

## Native Multi-Language UI Translation (`hostI18n`)

Antigravity 2.x bundles its web UI inside the notarized Go `language_server` binary without a built-in locale switcher. **`agy-Sag`** delivers lossless multi-language localization at runtime via Zero-ASAR CDP:

- **10 Built-in Languages**: `en` (Original restore), `zh-CN` (简体中文), `zh-TW` (繁體中文), `ja` (日本語), `ko` (한국어), `es` (Español), `fr` (Français), `de` (Deutsch), `ru` (Русский), `pt-BR` (Português)
- **Strict Content Isolation**: Physically skips `<code>`, `<pre>`, Monaco editors, `.xterm` terminals, Lexical inputs, user/assistant message bubbles, git branch pills, workspace names, and `/slash` command names (translating only the description beside commands).
- **Zero Memory Leaks & Lossless Hot-Switch**: Stores original node text and whitelisted attributes (`placeholder`, `title`, `aria-label`) in `WeakMap` snapshots with a bounded 8,000-entry FIFO cache. Switching back to `en` or calling `destroy()` restores 100% of the DOM immediately.
- **Coexistence Arbitration**: Detects Obsidian Prism's host translator (`html[data-ag-prism-host-i18n="active"]`) and yields cleanly by default, or lets you switch to `takeover` in Settings.
- **Layered Extended Dictionaries (~5,400 entries/locale)**: Uses a 3-tier merge hierarchy (`Custom Imported Pack > Built-in 465 Core > Extended Pack`). Built-in extended packs (`packages/core/locales/ext/*.json`, derived from MIT [`yiheng8023/antigravity-chinese`](https://github.com/yiheng8023/antigravity-chinese) plus multi-language translations) load via three paths: single-locale CDP preload (`<= 1.6 MB` cap), on-demand zero-port `sag:ext_pack` Watch Bridge requests, and read-only Workbench `/ext/<locale>.json` routes. Validate anytime with `npm run i18n:validate`. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

---

## Quick Start

### 1. Install as an Antigravity Plugin (Recommended)

```bash
agy plugin install https://github.com/tone-leh/agy-Sag
```

Or install locally from a cloned checkout:

```bash
git clone https://github.com/tone-leh/agy-Sag.git
cd agy-Sag
npm run install:plugin
```

> **CDP Prerequisite**: Zero-ASAR CDP attachment connects only to an already-open localhost debugging port (`DevToolsActivePort`). Start Antigravity with `node cli/sag-cli.mjs launch --port=9222` (macOS/Windows/Linux, yields automatically to Obsidian Prism and never force-kills existing processes), or launch directly via `open -a Antigravity --args --remote-debugging-port=9222`. `agy-Sag` never modifies `app.asar`.

### 2. Preview All Modules Safely Offline (Zero-Touch Workbench)

```bash
git clone https://github.com/tone-leh/agy-Sag.git
cd agy-Sag
npm run workbench
```

Opens `http://127.0.0.1:4179` with an interactive offline sandbox covering the 6-Tab Settings Hub, `Ctrl/Cmd+Alt+,` drawer, segmented HUD capsule, `Ctrl/Cmd+Alt+P` Prompt Library, 10-language live UI translation, prompt queue, safe auto-accept (`npm test` allow vs `rm -rf` hard-deny demo), 15 optical themes & 8 one-click visual looks, quota pulse, `agy-NOV` bidirectional synergy, and zero-residue teardown verification.

### 3. Unified CLI Reference

```bash
# Preview safe cross-platform CDP launch plan (read-only; yields to Obsidian Prism)
node cli/sag-cli.mjs launch --dry-run --json

# Launch Antigravity with CDP port or keepalive watch loop (supports --auto-relaunch-cold-start within 5s)
node cli/sag-cli.mjs launch --port=9222
node cli/sag-cli.mjs keepalive --preset=power --lang=zh-CN

# Attach once with optional preset & display language
node cli/sag-cli.mjs attach --preset=power --lang=zh-CN

# Run adaptive-backoff Watch Daemon (auto-reattaches across reloads/new windows)
node cli/sag-cli.mjs watch --preset=essential --lang=ja

# Environment, CDP, Obsidian Prism & agy-NOV coexistence diagnostics (read-only)
node cli/sag-cli.mjs doctor

# Validate & list all 10 built-in UI translation packs + 9 extended packs
node cli/sag-cli.mjs i18n validate
node cli/sag-cli.mjs i18n list

# Audit local Antigravity storage, WAL lock status, backup or export redacted sessions
node cli/sag-cli.mjs storage audit
node cli/sag-cli.mjs storage backup --out=/tmp/agy-backup --dry-run
node cli/sag-cli.mjs storage export --session=<SESSION_ID> --format=md

# Control companion agy-NOV v0.5 modules & presets directly from agy-Sag CLI (zero CDP added to NOV)
node cli/sag-cli.mjs nov status
node cli/sag-cli.mjs nov preset power
node cli/sag-cli.mjs nov enable verify

# Cleanly remove every DOM node, style & global from active windows
node cli/sag-cli.mjs remove
```

---

## Architecture & Safety Guarantees

```text
Antigravity 2.0 Host (Electron 44 + language_server localhost UI)
 ├── Sidecar / CLI Layer (Node.js >= 22, 0 npm dependencies)
 │    ├── cli/sag-cli.mjs        — Unified CLI (launch, keepalive, attach, watch, doctor, i18n, storage, nov, workbench)
 │    ├── cli/launcher.mjs       — Cross-platform CDP launcher/keepalive with Prism yield & 0600 atomic circuit-breaker state
 │    ├── cli/watch-daemon.mjs   — Adaptive-backoff (3s -> 30s) CDP watcher, live nov:feed push & zero-port bridge (sag:ext_pack / sag:nov_templates / sag:nov_feed)
 │    ├── cli/nov-bridge.mjs     — Atomic 0600 agy-NOV v0.5 config bridge (13 modules / 5 presets) + read-only redacted templates & live feed loader
 │    ├── cli/bundle.mjs         — Deterministic UMD bundler with SHA-256 hash idempotency, <=1.6MB ext preload & clean remove
 │    └── cli/storage-doctor.mjs — Read-only storage audit, WAL lock guard & secret-redacted export
 └── Renderer UMD Modules (packages/core/, 100% lossless destroy())
      ├── coexist.js             — Config schema, 4 presets, 13-module catalog, owner yield & hibernation
      ├── host-i18n*.js          — 10-language WeakMap DOM translator + 465 core + layered ~5k/locale ext packs (locales/ext/)
      ├── compact-guard.js       — Auto-silent /compact, scroll shield, clean-slate /clear & recovery
      ├── draft-guard.js         — Per-session unsent draft vault
      ├── prompt-queue.js        — Streaming follow-up queue with 4 safety circuit-breakers (incl. NOV spec lock)
      ├── prompt-library.js      — Ctrl/Cmd+Alt+P command palette, {{var}} snippets & read-only agy-NOV templates
      ├── reading-nav.js         — Long code block auto-folding, sticky copy bar & Alt+↑/↓ mini turn rail
      ├── safe-auto-accept.js    — Policy-gated auto-accept + non-bypassable hard deny blacklist
      ├── theme-studio.js        — Zero-:has() 15 optical skins, 8 looks, surfaces, stream fade & smooth caret
      ├── quota-pulse.js         — Read-only 5h/7d quota tracker & rate-limit signal parser
      ├── status-pill.js         — Unified segmented composer HUD capsule & Prism context card embed
      └── prism-bridge.js        — Single-source 6-Tab Settings Hub, swatch gallery, cross-tab search & Ctrl/Cmd+Alt+, drawer
```

**Hard Safety Boundaries**:
1. **Zero `app.asar` modification**: Preserves Google Developer ID signatures, macOS notarization, and automatic updates.
2. **Zero external network requests & zero credential access**: `quotaPulse` is strictly read-only and never touches OAuth tokens or account rotation.
3. **Non-bypassable `safeAutoAccept` blacklist**: Destructive shell/Git/SQL/secret patterns are rejected even when `policy: "custom"` allows `.*`.
4. **Zero `:has()`, zero `innerHTML`, zero residue**: Full CSS stays free of `:has()` and `.ag-cs-` collisions; every module renders safely via `textContent` and tears down cleanly via `destroy()` / `remove`.
5. **Peaceful coexistence**: Detects and honors `agy-NOV` (zero functional overlap) and Obsidian Prism (shared settings panel, context-card embed, right-click menu yield & translator/theme yield policy).

---

## Development & Verification

```bash
npm test                 # Run full native node:test suite (211/211 passing, zero external deps)
npm run i18n:validate    # Validate all 10 built-in + 9 extended UI translation packs (0 errors)
npm run workbench:smoke  # Run automated HTTP smoke check against the offline workbench (22 markers)
npm run doctor           # Read-only local environment diagnostics
```

See [docs/ROADMAP.md](./docs/ROADMAP.md) and [docs/PRODUCT-IA.md](./docs/PRODUCT-IA.md) for the multi-phase architecture and upcoming modules.

## License

MIT © [tone-leh](https://github.com/tone-leh)
