import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const core = require('../packages/core/index.js');
const i18n = require('../packages/core/i18n.js');
const styles = require('../packages/core/styles.js');
const prismBridge = require('../packages/core/prism-bridge.js');

function createPrismCoexistDom() {
  const matches = (el, selList) =>
    selList.split(',').some((raw) => {
      const s = raw.trim();
      if (!s) return false;
      if (s.startsWith('#')) return el.id === s.slice(1);
      let rest = s;
      const tm = rest.match(/^[a-zA-Z0-9-]+/);
      if (tm) { if (el.tagName !== tm[0].toUpperCase()) return false; rest = rest.slice(tm[0].length); }
      for (const m of rest.matchAll(/\.([a-zA-Z0-9_-]+)/g)) { if (!el.classList.contains(m[1])) return false; }
      for (const m of rest.matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g)) {
        if (!el.hasAttribute(m[1])) return false;
        if (m[2] !== undefined && el.getAttribute(m[1]) !== m[2]) return false;
      }
      return true;
    });

  const makeEl = (tag) => {
    const attrs = new Map();
    const cls = new Set();
    const ls = new Map();
    const el = {
      tagName: String(tag).toUpperCase(),
      nodeType: 1,
      id: '',
      value: '',
      hidden: false,
      disabled: false,
      _text: '',
      children: [],
      parentElement: null,
      get isConnected() { let p = el; while (p) { if (p === doc.documentElement) return true; p = p.parentElement; } return false; },
      get firstChild() { return el.children[0] || null; },
      get className() { return [...cls].join(' '); },
      set className(v) { cls.clear(); String(v || '').split(/\s+/).filter(Boolean).forEach((c) => cls.add(c)); },
      classList: { add: (...a) => a.forEach((c) => c && cls.add(c)), remove: (...a) => a.forEach((c) => cls.delete(c)), contains: (c) => cls.has(c) },
      get textContent() { return el.children.length ? el._text + el.children.map((c) => c.textContent).join('') : el._text; },
      set textContent(v) { el._text = String(v ?? ''); el.children.length = 0; },
      setAttribute(k, v) { attrs.set(k, String(v)); if (k === 'id') el.id = String(v); },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      hasAttribute(k) { return attrs.has(k); },
      removeAttribute(k) { attrs.delete(k); },
      appendChild(c) { if (c.parentElement) c.remove(); c.parentElement = el; el.children.push(c); return c; },
      insertBefore(c, ref) { if (c.parentElement) c.remove(); c.parentElement = el; const i = el.children.indexOf(ref); if (i >= 0) el.children.splice(i, 0, c); else el.children.push(c); return c; },
      removeChild(c) { el.children = el.children.filter((x) => x !== c); c.parentElement = null; return c; },
      remove() { if (el.parentElement) el.parentElement.removeChild(el); },
      closest(sel) { let cur = el; while (cur) { if (matches(cur, sel)) return cur; cur = cur.parentElement; } return null; },
      querySelectorAll(sel) { const out = []; const w = (n) => { for (const c of n.children) { if (matches(c, sel)) out.push(c); w(c); } }; w(el); return out; },
      querySelector(sel) { return el.querySelectorAll(sel)[0] || null; },
      addEventListener(ev, fn) { if (!ls.has(ev)) ls.set(ev, new Set()); ls.get(ev).add(fn); },
      removeEventListener(ev, fn) { ls.get(ev)?.delete(fn); },
      dispatchEvent(ev) { for (const fn of ls.get(ev.type) || []) fn(ev); },
      focus() {},
      click() { if (el.disabled) return; for (const fn of ls.get('click') || []) fn({ target: el, preventDefault() {}, stopPropagation() {} }); },
    };
    return el;
  };

  const doc = {
    hidden: false,
    documentElement: null,
    head: null,
    body: null,
    createElement: makeEl,
    getElementById: (id) => doc.documentElement.querySelector('#' + id),
    querySelectorAll: (s) => doc.documentElement.querySelectorAll(s),
    querySelector: (s) => doc.documentElement.querySelector(s),
    addEventListener() {},
    removeEventListener() {},
  };
  doc.documentElement = makeEl('html');
  doc.documentElement.setAttribute('data-ag-cs-style', '1');
  doc.documentElement.setAttribute('data-ag-cs-theme', 'light');
  doc.documentElement.setAttribute('data-ag-cs-lang', 'zh-CN');
  doc.head = makeEl('head');
  doc.body = makeEl('body');
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);

  // Simulated Obsidian Prism v1.0.8-beta.3 #ag-cs-settings-sec DOM
  const settingsSec = makeEl('div');
  settingsSec.setAttribute('id', 'ag-cs-settings-sec');
  settingsSec.setAttribute('data-ag-cs-lang', 'zh-CN');
  const groupsWrap = makeEl('div');
  groupsWrap.className = 'ag-cs-settings-groups';
  const modulesGrp = makeEl('div');
  modulesGrp.className = 'ag-cs-settings-group';
  modulesGrp.setAttribute('data-ag-cs-group', 'modules');
  const nativeCard = makeEl('div');
  nativeCard.className = 'ag-cs-settings-card divide-y';
  modulesGrp.appendChild(nativeCard);
  const aboutGrp = makeEl('div');
  aboutGrp.className = 'ag-cs-settings-group';
  aboutGrp.setAttribute('data-ag-cs-group', 'about');
  const aboutBox = makeEl('div');
  aboutBox.setAttribute('data-ag-cs-about', '1');
  aboutBox.textContent = 'Obsidian Prism v1.0.8-beta.3';
  aboutGrp.appendChild(aboutBox);
  groupsWrap.appendChild(modulesGrp);
  groupsWrap.appendChild(aboutGrp);
  settingsSec.appendChild(groupsWrap);
  doc.body.appendChild(settingsSec);

  // Conversation view + composer
  const conv = makeEl('div');
  conv.setAttribute('data-testid', 'conversation-view');
  conv.setAttribute('data-cascade-id', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
  const u1 = makeEl('div');
  u1.setAttribute('data-testid', 'user-message-bubble');
  u1.textContent = 'Verify unified settings with Obsidian Prism';
  conv.appendChild(u1);

  const compWrap = makeEl('div');
  const ib = makeEl('div');
  ib.setAttribute('data-testid', 'agent-input-box');
  ib.appendChild(makeEl('textarea'));
  compWrap.appendChild(ib);
  doc.body.appendChild(conv);
  doc.body.appendChild(compWrap);

  return { doc, settingsSec, modulesGrp };
}

test('Obsidian Prism Side-by-Side Coexistence: embeds unified settings in Prism Modules tab, syncs bidirectionally & live language, and destroys cleanly', async () => {
  const { doc, settingsSec, modulesGrp } = createPrismCoexistDom();
  const store = new Map();
  const storage = {
    get length() { return store.size; },
    key: (i) => Array.from(store.keys())[i] ?? null,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };

  let bridgeCalls = 0;
  const win = {
    document: doc,
    localStorage: storage,
    navigator: { language: 'zh-CN' },
    __agPrismMetricsBridge: {
      getLatestSnapshot: () => ({ speed: { context: { usedFraction: 0.84, usedTokens: 430080, maxTokens: 512000 } } }),
      getMetrics: async () => {
        bridgeCalls += 1;
        return { speed: { context: { usedFraction: 0.84, usedTokens: 430080, maxTokens: 512000 } } };
      },
    },
    addEventListener() {},
    removeEventListener() {},
  };

  const guard = core.mountSessionGuard({
    win,
    doc,
    storage,
    autoPoll: false,
    autoObserve: false,
    bindVaultShortcut: false,
  });

  await guard.evaluateNow();
  assert.equal(guard.yielded, false, 'Must run alongside Obsidian Prism when Prism does not claim __agSessionGuardOwner');
  assert.ok(bridgeCalls >= 1, 'Must reuse Obsidian Prism metrics bridge without duplicate backend polling');

  // Unified Settings Section mounted inside Prism's Modules tab
  const embedded = modulesGrp.querySelector(`[data-testid="${prismBridge.EMBED_SECTION_TESTID}"]`);
  assert.ok(embedded, 'Session Guard settings section must mount inside Prism Modules group');
  assert.equal(embedded.getAttribute('data-ag-sg-owned'), '1');
  assert.equal(embedded.getAttribute('data-ag-no-i18n'), '1');
  assert.equal(embedded.getAttribute('data-ag-localization-skip'), 'true');
  assert.equal(embedded.getAttribute('data-antigravity-zh-skip'), '1');
  // Consumer-grade UI rule: ZERO version strings or defensive Prism badges shown to end-users
  assert.equal(embedded.textContent.includes('1.0.8-beta.3'), false, 'End-user settings UI must not show internal version badges');
  assert.equal(embedded.querySelector('[data-testid="ag-sg-prism-badge"]'), null, 'No defensive Prism badge in consumer UI');
  assert.ok(embedded.textContent.includes('领航哨'));

  // Prism -> Session Guard bidirectional config sync (click 75% threshold inside Prism settings panel)
  const th75 = embedded.querySelector('[data-ag-sg-prism-th="75"]');
  assert.ok(th75);
  th75.click();
  assert.equal(guard.getConfig().compactThreshold, 75);
  assert.equal(embedded.querySelector('[data-ag-sg-prism-th="75"]').getAttribute('aria-pressed'), 'true');

  // Session Guard inline popover -> Prism bidirectional sync
  guard.openSettingsPopover();
  const pop = doc.querySelector('[data-testid="ag-sg-settings-popover"]');
  assert.equal(pop.querySelector('[data-testid="ag-sg-pop-prism-badge"]'), null, 'Inline popover must stay clean without Prism badges');
  pop.querySelector('[data-ag-sg-th="90"]').click();
  assert.equal(guard.getConfig().compactThreshold, 90);
  assert.equal(embedded.querySelector('[data-ag-sg-prism-th="90"]').getAttribute('aria-pressed'), 'true');

  // Live language switch driven by Obsidian Prism (zh-CN -> en)
  doc.documentElement.setAttribute('data-ag-cs-lang', 'en');
  guard.prismBridge.sync();
  assert.ok(embedded.textContent.includes('Session Guard'), 'Embedded Prism section must follow Prism live language switch');

  // Destroy cleanly leaves Prism's own settings DOM intact with 0 Session Guard nodes
  guard.destroy();
  assert.equal(doc.querySelectorAll('[data-ag-sg-owned="1"]').length, 0);
  assert.ok(doc.getElementById('ag-cs-settings-sec') === settingsSec, 'Obsidian Prism settings container must remain untouched');
});

test('Obsidian Prism Latest Beta Checkout Compatibility Contract (auto-runs when sibling obsidian-prism-dev repo is present)', (t) => {
  const candidates = [
    process.env.AGY_PRISM_REPO ? path.resolve(process.env.AGY_PRISM_REPO) : null,
    path.resolve(__dirname, '..', '..', 'obsidian-prism-dev'),
    path.resolve(__dirname, '..', '..', 'obsidian-prism'),
  ].filter(Boolean);

  const prismDir = candidates.find((d) => fs.existsSync(path.join(d, 'package.json')) && fs.existsSync(path.join(d, 'settings-panel.js')));
  if (!prismDir) {
    t.skip('No local Obsidian Prism checkout found alongside repo');
    return;
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(prismDir, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'obsidian-prism');

  const settingsSrc = fs.readFileSync(path.join(prismDir, 'settings-panel.js'), 'utf8');
  const uiRuntimeSrc = fs.readFileSync(path.join(prismDir, 'ui-runtime.js'), 'utf8');
  const pulseSrc = fs.readFileSync(path.join(prismDir, 'pulse-vial-bridge.js'), 'utf8');

  // 1) Unified settings anchor hooks still exist in latest Prism beta
  assert.ok(settingsSrc.includes("const SETTINGS_SEC_ID = 'ag-cs-settings-sec'"), 'Prism settings section ID contract must match');
  assert.ok(settingsSrc.includes("'data-ag-cs-group'"), 'Prism settings group attribute contract must match');
  assert.ok(settingsSrc.includes("id: 'modules'"), 'Prism Modules subtab contract must match');
  assert.ok(settingsSrc.includes('data-ag-localization-skip'), 'Prism localization skip contract must match');

  // 2) Outline popover & metrics bridge contracts still exist in latest Prism beta
  assert.ok(uiRuntimeSrc.includes('ag-cs-nav-outline-popover'), 'Prism outline popover hook must exist');
  assert.ok(pulseSrc.includes('agPulseHost') || pulseSrc.includes('Metrics'), 'Prism pulse/metrics bridge hook must exist');

  // 3) All 8 official Obsidian Prism locales have 100% key parity in agy-session-guard
  const prismLocales = ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de'];
  const baseKeys = Object.keys(i18n.PACKS['zh-CN']).sort();
  for (const loc of prismLocales) {
    assert.ok(i18n.PACKS[loc], `Locale ${loc} must exist in agy-session-guard`);
    assert.deepEqual(Object.keys(i18n.PACKS[loc]).sort(), baseKeys, `100% i18n key parity required for Prism locale ${loc}`);
  }

  // 4) Zero CSS namespace collision (Session Guard never defines .ag-cs-* rules, and Prism never defines .ag-sg-*)
  assert.equal(/\.ag-cs-/.test(styles.CORE_CSS), false, 'Session Guard CSS must never redefine .ag-cs-* rules');
  assert.equal(/\.ag-sg-/.test(settingsSrc), false, 'Obsidian Prism must not collide with .ag-sg-* namespace');
  assert.equal(/:has\(/.test(styles.CORE_CSS), false, 'Session Guard CSS must maintain 0 :has() invariant');
});
