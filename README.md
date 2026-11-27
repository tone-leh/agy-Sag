# agy-Sag

[简体中文](./README.zh-CN.md)

**Modular Zero-ASAR CDP deep-enhancement suite for Google Antigravity 2.0** *(formerly `agy-session-guard`)*  
Live **10-language native UI translation**, configurable auto `/compact` guard with viewport scroll shield, streaming **Prompt Queue**, crash-proof **Draft Vault**, turn bookmarks & cross-session archive, **policy-gated Auto-Accept** with a non-bypassable hard deny blacklist, zero-`:has()` **Optical Theme Studio**, read-only **Quota Pulse**, and offline **Storage Doctor** — **pick only the modules you want**.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js >= 22](https://img.shields.io/badge/Node-%3E%3D22-339933.svg)](https://nodejs.org)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero-0ea5e9.svg)](#architecture)
[![Zero ASAR / Lossless CDP](https://img.shields.io/badge/Runtime-Zero%20ASAR%20CDP-f59e0b.svg)](#architecture)
[![Companion: agy-NOV](https://img.shields.io/badge/Best%20Together-agy--NOV-6366f1.svg)](https://github.com/tone-leh/agy-NOV)

---

## Best Together: `agy-NOV` + `agy-Sag` (Dual-Star Synergy)

We maintain **two complementary, zero-overlap plugins** built specifically for Google Antigravity 2.0 so you can install both without duplication or conflict:

| Dimension | [`agy-NOV`](https://github.com/tone-leh/agy-NOV) — Native Protocol Workbench | **`agy-Sag`** (This Repo) — Deep Enhancement Suite |
| :--- | :--- | :--- |
| **Architecture** | 100% official MCP Apps (SEP-1865) + Lifecycle Hooks; **zero ASAR, zero CDP** | Zero-ASAR Electron CDP renderer layer + Watch Sidecar + offline Storage CLI |
| **Upgrade Resilience** | Survives every Antigravity update natively via official plugin protocols | Leaves `app.asar` & Apple notarization untouched; auto re-attaches via Watch Daemon |
| **Core Scope** | Side-pane / global engineering workbench, pre-tool hooks, isolated artifacts & remote IM | Native Settings embedded control center, 10-language UI translation, main chat DOM, composer & local storage hygiene |
| **Included Modules** | **9 native zero-CDP modules** (5 presets, 6–31 tools): `review`, `guard`, `xray`, `turbo`, `radar`, `canvas`, `mem`, `ops`, `remote` | **11 renderer modules + Storage CLI** (4 presets): `hostI18n`, `compactGuard`, `precompactExport`, `draftGuard`, `promptQueue`, `outlineBookmarks`, `sessionWatchdog`, `safeAutoAccept`, `themeStudio`, `quotaPulse`, `sessionRadar`, `storage-doctor` |

### Built-In Dual-Star Synergy (Zero Extra Ports)

When both **`agy-Sag`** and **`agy-NOV`** are installed together, **`agy-Sag`**'s native embedded Settings control center (collapsible summary header + TopDeck presets + 5 segmented SubTabs inside **Settings → Appearance**) automatically unlocks the **`✦ agy-NOV`** control tab:

- **Control `agy-NOV` directly inside Antigravity Settings**: Toggle all **9 `agy-NOV` modules** and switch its **5 presets** (`minimal` / `core` / `power` / `local-all` / `full`) in real time. Communication runs over CDP `Runtime.addBinding` (zero extra HTTP ports) to `agy-Sag`'s Watch Sidecar, which atomically updates `agy-NOV`'s `config.json` (`0600`) while `agy-NOV`'s native hot-sync updates `tools/list` live without adding any CDP code to `agy-NOV`.
- **Dual-Layer Safety Shield (`safeAutoAccept` × `agy-NOV guard`)**: Combines frontend hard-deny auto-accept with `agy-NOV`'s PreToolUse secret shield and pre-edit file snapshots, with a 1-click toggle if `guard` is off.
- **Compaction × Memory & X-Ray (`compactGuard` × `agy-NOV mem` / `xray`)**: Coordinates auto-compaction with code-anchored architectural memory and token breakdown.
- **Zero-Duplicate Alert Arbitration (`sessionRadar` × `agy-NOV radar`)**: Detects when both alert engines are active and offers a 1-click deduplication toggle.

> **Recommended Setup — Install Both:**
> ```bash
> # 1) 9-module native MCP Apps engineering workbench (100% zero CDP, zero ASAR)
> agy plugin install https://github.com/tone-leh/agy-NOV
>
> # 2) Native embedded control center, 10-language UI & deep power suite (Zero-ASAR CDP)
> agy plugin install https://github.com/tone-leh/agy-Sag
> ```

---

## Modular Capabilities — Pick Only What You Need

Every module in **`agy-Sag`** is independently toggleable from Antigravity's native **Settings → Appearance** panel, Obsidian Prism's **Modules** tab, or the CLI. Disabled modules run zero DOM observers and zero timers.

| Module | Default | Risk / Isolation | What It Does |
| :--- | :---: | :--- | :--- |
| **Native UI Translator** (`hostI18n`) | **ON** | 100% Offline · Lossless | Real-time multi-language translation for Antigravity 2.x UI across **10 languages** (`zh-CN`, `zh-TW`, `ja`, `ko`, `es`, `fr`, `de`, `ru`, `pt-BR`, `en`). 465+ exact UI strings + 25 dynamic templates per language, physical isolation for code blocks / inputs / chat content / slash command names, Shadow DOM support, instant hot-switch, and custom JSON pack import. |
| **Auto `/compact` Guard** (`compactGuard`) | **ON** | 100% Offline | Configurable compaction threshold (`off` or `50%–98%`, default `80%`), silent auto-compact with viewport scroll shield (prevents page jump while reading), Lexical two-step slash menu support, `/clear` clean-slate restart, and post-compact anchor recovery. |
| **Pre-Compact Export** (`precompactExport`) | **ON** | 100% Offline | Secret-redacted Markdown copy and `.md` file download before compaction (masks PEM private keys, API keys, Bearer tokens & JWTs). |
| **Draft Vault** (`draftGuard`) | **ON** | 100% Offline | Debounced per-session auto-save for unsent composer prompts (7-day TTL, 16 KB cap) with one-line restore after tab switches or reloads. |
| **Prompt Queue** (`promptQueue`) | **ON** | 100% Offline | Queue 1–20 follow-up prompts while the Agent is actively streaming. Automatically dispatches when idle with **triple safety circuit-breakers** (blocks dispatch while streaming, when the composer has a draft, or when an approval card is pending). |
| **Stall & Burn Watchdog** (`sessionWatchdog`) | **ON** | 100% Offline | Rolling burn-rate estimator (estimated turns to threshold), single-turn spike indicator, and streaming stall detector (default 3 min) with `+5m` snooze. |
| **Turn Bookmarks & Vault** (`outlineBookmarks`) | OFF | 100% Offline | Opt-in star button beside message Copy/Undo actions, floating `★ N` quick-jump drawer, and `Ctrl/Cmd+Shift+B` searchable cross-session archive with redacted Markdown export. |
| **Safe Auto-Accept** (`safeAutoAccept`) | OFF | **Strict Opt-in** · Local | Policy-gated automatic clicking for low-risk inline approval cards (`readonly-safe`, `dev-flow`, `custom`) plus a **non-bypassable hard deny blacklist** (`rm -rf`, `git push --force`, `git reset --hard`, `DROP TABLE`, `curl\|sh`, `sudo`, `.env`, `~/.ssh`, etc.), dry-run mode, pause toggle, and 50-entry audit log. |
| **Optical Theme Studio** (`themeStudio`) | OFF | 100% Offline | Zero-`:has()` CSS variable layer with 5 curated presets (`native`, `midnight-ink`, `nord-frost`, `warm-paper`, `oled-pure`), CJK + monospace font stack polish, density controls, compact sidebar, wide reading column, and sanitized custom CSS injection. |
| **Read-Only Quota Pulse** (`quotaPulse`) | OFF | 100% Offline · Read-Only | Zero-credential, zero-network quota health tracker. Tracks local 5-hour and 7-day turn/token estimates and parses visible UI rate-limit / `Resets in ...` countdown notices while keeping observed signals strictly separate from local estimates. |
| **Sidebar Radar** (`sessionRadar`) | OFF | 100% Offline | Opt-in `All / Running / Awaiting` sidebar filter bar with blurred-window OS notifications. |
| **Storage Doctor** (`storage-doctor` CLI) | CLI | Read-Only Audit | Offline CLI (`agy-sag storage audit\|backup\|export`) that inspects `~/.gemini/antigravity/` disk bloat, orphan folders, SQLite `.db-wal` lock safety, and exports secret-redacted Markdown/JSON session archives. |

### One-Click Scene Presets

Switch presets anytime in Settings or via CLI (`--preset=<name>`):

- **`essential` (default)**: `hostI18n` + `compactGuard` + `precompactExport` + `draftGuard` + `promptQueue` + `sessionWatchdog`
- **`i18n-only`**: Only `hostI18n` enabled — ideal if you strictly want native multi-language UI translation
- **`power`**: `essential` + `outlineBookmarks` + `themeStudio` + `quotaPulse`
- **`full-auto`**: All modules enabled (`safeAutoAccept` locked to `readonly-safe` by default)

---

## Native Multi-Language UI Translation (`hostI18n`)

Antigravity 2.x bundles its 12.8 MB web UI inside the notarized Go `language_server` binary without a built-in locale switcher. **`agy-Sag`** delivers lossless multi-language localization at runtime via Zero-ASAR CDP:

- **10 Built-in Languages**: `en` (Original restore), `zh-CN` (简体中文), `zh-TW` (繁體中文), `ja` (日本語), `ko` (한국어), `es` (Español), `fr` (Français), `de` (Deutsch), `ru` (Русский), `pt-BR` (Português)
- **Strict Content Isolation**: Physically skips `<code>`, `<pre>`, Monaco editors, `.xterm` terminals, Lexical inputs, user/assistant message bubbles, git branch pills, workspace names, and `/slash` command names (translating only the description beside commands).
- **Zero Memory Leaks & Lossless Hot-Switch**: Stores original node text and whitelisted attributes (`placeholder`, `title`, `aria-label`) in `WeakMap` snapshots with a bounded 8,000-entry FIFO cache. Switching back to `en` or calling `destroy()` restores 100% of the DOM immediately.
- **Coexistence Arbitration**: Detects Obsidian Prism's host translator (`html[data-ag-prism-host-i18n="active"]`) and yields cleanly by default, or lets you switch to `takeover` in Settings.
- **Layered Extended Dictionaries (~5,000 entries/locale)**: Uses a 3-tier merge hierarchy (`Custom Imported Pack > Built-in 465 Core > Extended Pack`). Built-in extended packs (`packages/core/locales/ext/*.json`, derived from MIT [`yiheng8023/antigravity-chinese`](https://github.com/yiheng8023/antigravity-chinese) plus multi-language translations) load via three paths: single-locale CDP preload (`<= 1.6 MB`), on-demand zero-port `sag:ext_pack` Watch Bridge requests, and read-only Workbench `/ext/<locale>.json` routes. Toggle `collectMissing` to capture new UI strings and validate dictionaries with `npm run i18n:validate`. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

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

Opens `http://127.0.0.1:4179` with an interactive offline sandbox covering 10-language live UI translation, scene presets, context compaction, prompt queue, safe auto-accept (`npm test` allow vs `rm -rf` hard-deny demo), optical themes, quota pulse, and zero-residue teardown verification.

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

# Validate & list all 10 built-in UI translation packs
node cli/sag-cli.mjs i18n validate
node cli/sag-cli.mjs i18n list

# Audit local Antigravity storage, WAL lock status, backup or export redacted sessions
node cli/sag-cli.mjs storage audit
node cli/sag-cli.mjs storage backup --out=/tmp/agy-backup --dry-run
node cli/sag-cli.mjs storage export --session=<SESSION_ID> --format=md

# Control companion agy-NOV modules & presets directly from agy-Sag CLI (zero CDP added to NOV)
node cli/sag-cli.mjs nov status
node cli/sag-cli.mjs nov preset power
node cli/sag-cli.mjs nov enable canvas

# Cleanly remove every DOM node, style & global from active windows
node cli/sag-cli.mjs remove
```

---

## Architecture & Safety Guarantees

```text
Antigravity 2.0 Host (Electron 44 + language_server localhost UI)
 ├── Sidecar / CLI Layer (Node.js >= 22, 0 npm dependencies)
 │    ├── cli/sag-cli.mjs        — Unified CLI (launch, keepalive, attach, watch, doctor, i18n, storage, workbench)
 │    ├── cli/launcher.mjs       — Cross-platform CDP launcher/keepalive with Prism yield & 0600 atomic circuit-breaker state
 │    ├── cli/watch-daemon.mjs   — Adaptive-backoff (3s -> 30s) CDP watcher + lightweight probe & sag:ext_pack bridge
 │    ├── cli/bundle.mjs         — Deterministic UMD bundler with SHA-256 hash idempotency, <=1.6MB ext preload & clean remove
 │    └── cli/storage-doctor.mjs — Read-only storage audit, WAL lock guard & secret-redacted export
 └── Renderer UMD Modules (packages/core/, 100% lossless destroy())
      ├── coexist.js             — Config schema, presets, module catalog, owner yield & hibernation
      ├── host-i18n*.js          — 10-language WeakMap DOM translator + 465 core + layered ~5k/locale ext packs (locales/ext/)
      ├── compact-guard.js       — Auto-silent /compact, scroll shield, clean-slate /clear & recovery
      ├── draft-guard.js         — Per-session unsent draft vault
      ├── prompt-queue.js        — Streaming follow-up queue with triple safety circuit-breakers
      ├── safe-auto-accept.js    — Policy-gated auto-accept + non-bypassable hard deny blacklist
      ├── theme-studio.js        — Zero-:has() optical themes, CJK typography & sanitized custom CSS
      ├── quota-pulse.js         — Read-only 5h/7d quota tracker & rate-limit signal parser
      └── prism-bridge.js        — Unified Settings panel (native Antigravity Settings & Obsidian Prism)
```

**Hard Safety Boundaries**:
1. **Zero `app.asar` modification**: Preserves Google Developer ID signatures, macOS notarization, and automatic updates.
2. **Zero external network requests & zero credential access**: `quotaPulse` is strictly read-only and never touches OAuth tokens or account rotation.
3. **Non-bypassable `safeAutoAccept` blacklist**: Destructive shell/Git/SQL/secret patterns are rejected even when `policy: "custom"` allows `.*`.
4. **Peaceful coexistence**: Detects and honors `agy-NOV` (zero functional overlap) and Obsidian Prism (shared settings panel + translator/theme yield policy).

---

## Development & Verification

```bash
npm test                 # Run full native node:test suite (zero external deps)
npm run i18n:validate    # Validate all 10 UI translation dictionaries & regex templates
npm run workbench:smoke  # Run automated HTTP smoke check against the offline workbench
npm run doctor           # Read-only local environment diagnostics
```

## License

MIT © [tone-leh](https://github.com/tone-leh)
