# Contributing to `agy-Sag`

Thank you for contributing to **`agy-Sag`**! This guide explains the repository layout, module architecture, safety guardrails, and verification workflow so you can add features or fix bugs smoothly.

---

## 1. Core Architectural Rules

1. **Zero Runtime Dependencies**: All CLI, Sidecar, and Renderer code uses Node.js >= 22 built-ins and vanilla browser UMD modules. Do not add runtime entries to `package.json`.
2. **Zero-ASAR & Lossless Teardown**: Never modify `Antigravity.app` or `app.asar`. Every DOM element, style tag, attribute, observer, timer, and global created by a renderer module must be cleanly removed in `destroy()` and reflected in `cli/bundle.mjs` `REMOVE_EXPRESSION`.
3. **Strict Opt-In for High-Impact or Networked Features**: Aggressive or external-network capabilities (such as `safeAutoAccept` or external translation engines) must stay OFF by default, isolate secrets (`0600`, excluded from exports/backups), and perform zero background work when disabled.
4. **CSS & DOM Hygiene**:
   - Strictly **zero `:has()` selectors** and **zero `.ag-cs-*` class collisions**.
   - Never assign untrusted text to `innerHTML`; build DOM nodes with `document.createElement` and `textContent`.
   - Mark owned DOM roots with `coexist.markOwnedNoTranslate(el)` so `hostI18n` never translates `agy-Sag`'s own UI.
5. **Single-Source Settings IA**:
   - All module master switches live exclusively in `packages/core/settings/tab-overview.js`.
   - Per-module parameters live in their layer tab (`tab-ui.js`, `tab-conversation.js`, `tab-guard.js`, `tab-nov.js`, `tab-advanced.js`), with low-frequency options folded inside `<details>`.
6. **Zero Overlap with `agy-NOV`**: Keep backend MCP tools, PreToolUse/Stop hooks, worktrees, and remote gateways in [`agy-NOV`](https://github.com/tone-leh/agy-NOV). `agy-Sag` consumes `agy-NOV` data strictly read-only or atomically updates `config.json`.

---

## 2. Repository Map

```text
agy-Sag/
├── cli/
│   ├── sag-cli.mjs            # Unified CLI entrypoint
│   ├── platform-utils.mjs     # Cross-platform path/symlink/atomic-rename helpers (macOS/Win/Linux)
│   ├── launcher.mjs           # Zero-ASAR CDP launcher & keepalive controller
│   ├── watch-daemon.mjs       # Adaptive-backoff CDP watcher & zero-port HostBridge
│   ├── bundle.mjs             # Deterministic UMD bundler + lexer-safe compactor + REMOVE_EXPRESSION
│   ├── nov-bridge.mjs         # Atomic 0600 agy-NOV config bridge + read-only feed/templates
│   ├── storage-doctor.mjs     # Read-only storage audit, WAL guard & redacted backup/export
│   └── install-plugin.mjs     # Native ~/.gemini/config/plugins/agy-sag installer
├── packages/core/
│   ├── index.js               # Main mountSag() orchestrator
│   ├── coexist.js             # Config schema, presets, module registry & owner yield
│   ├── i18n.js                # 9-locale Settings/HUD UI strings (100% key parity)
│   ├── styles.js              # Theme-adaptive zero-:has() stylesheet
│   ├── prism-bridge.js        # Settings Hub shell, global drawer, search & shortcut sheet
│   ├── settings/              # Modular 6-Tab Settings renderers
│   │   ├── tab-overview.js
│   │   ├── tab-ui.js
│   │   ├── tab-conversation.js
│   │   ├── tab-guard.js
│   │   ├── tab-nov.js
│   │   └── tab-advanced.js
│   ├── locales/ext/           # 9-locale extended UI dictionaries (~5,400 entries each)
│   └── *.js                   # Independent feature modules (UMD)
├── workbench/server.mjs       # Zero-touch offline UI simulator (http://127.0.0.1:4179)
└── test/*.test.mjs            # Native node:test suite (zero external test frameworks)
```

---

## 3. Adding or Modifying a Renderer Module

1. **Create a UMD module** under `packages/core/<module-name>.js` following the standard dual CommonJS / browser-global pattern (`root.__agSag<Name>`).
2. **Register in the bundler**: Add the relative path to `CORE_FILES` and its browser global key to `GLOBAL_KEYS` in `cli/bundle.mjs`.
3. **Wire config & defaults**: Add sanitized config keys in `packages/core/coexist.js` (`DEFAULT_CONFIG` & `sanitizeConfig`) and wire lifecycle hooks in `packages/core/index.js`.
4. **Add Settings controls cleanly**: Place master switches only in `tab-overview.js` (when adding a new top-level module) and parameters in the appropriate `packages/core/settings/tab-*.js`.
5. **Keep i18n 100% aligned**: Any new UI string key added to `packages/core/i18n.js` (`SAG_UI_PACKS` or `PACKS`) must be added across all supported locales.
6. **Check bundle budget**: Single-locale sync CDP injection (`ru`) must stay `<= 1,550,000 B` (hard cap `1,677,721 B`).

---

## 4. Local Development & Verification

Run the full verification suite before opening a Pull Request:

```bash
# 1. Full unit, hygiene & cross-platform test suite (Node.js >= 22)
npm test

# 2. Validate all 10 built-in + 9 extended UI translation packs
npm run i18n:validate

# 3. Smoke-test the offline workbench simulator
npm run workbench:smoke

# 4. Read-only environment check
npm run doctor
```

You can also launch the interactive offline simulator at `http://127.0.0.1:4179` with `npm run workbench` to test UI changes without touching a live Antigravity installation.

---

## 5. Documentation & Attribution

- Update `CHANGELOG.md` and keep `README.md` / `README.zh-CN.md` synchronized without embedding text-bearing static images or badge images (preserving browser auto-translation).
- Credit upstream open-source projects and licenses accurately in `THIRD_PARTY_NOTICES.md` and the README acknowledgments section.
