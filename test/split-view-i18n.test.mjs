import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../packages/core/index.js');
const i18n = require('../packages/core/i18n.js');

function createSplitViewDom() {
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
      style: {},
      shadowRoot: null,
      _text: '',
      children: [],
      parentElement: null,
      parentNode: null,
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
      appendChild(c) { if (c.parentElement) c.remove(); c.parentElement = el; c.parentNode = el; el.children.push(c); return c; },
      insertBefore(c, ref) { if (c.parentElement) c.remove(); c.parentElement = el; c.parentNode = el; const i = el.children.indexOf(ref); if (i >= 0) el.children.splice(i, 0, c); else el.children.push(c); return c; },
      removeChild(c) { el.children = el.children.filter((x) => x !== c); c.parentElement = null; c.parentNode = null; return c; },
      remove() { if (el.parentElement) el.parentElement.removeChild(el); },
      closest(sel) { let cur = el; while (cur) { if (matches(cur, sel)) return cur; cur = cur.parentElement; } return null; },
      querySelectorAll(sel) { const out = []; const w = (n) => { for (const c of n.children) { if (matches(c, sel)) out.push(c); w(c); } }; w(el); return out; },
      querySelector(sel) { return el.querySelectorAll(sel)[0] || null; },
      addEventListener(ev, fn) { if (!ls.has(ev)) ls.set(ev, new Set()); ls.get(ev).add(fn); },
      removeEventListener(ev, fn) { ls.get(ev)?.delete(fn); },
      dispatchEvent(ev) { for (const fn of ls.get(ev.type) || []) fn(ev); },
      focus() { doc.activeElement = el; },
      click() { if (el.disabled) return; for (const fn of ls.get('click') || []) fn({ preventDefault() {}, stopPropagation() {} }); },
    };
    return el;
  };

  const docListeners = new Map();
  const doc = {
    hidden: false,
    activeElement: null,
    documentElement: null,
    head: null,
    body: null,
    createElement: makeEl,
    getElementById: (id) => doc.documentElement.querySelector('#' + id),
    querySelectorAll: (s) => doc.documentElement.querySelectorAll(s),
    querySelector: (s) => doc.documentElement.querySelector(s),
    addEventListener(ev, fn) { if (!docListeners.has(ev)) docListeners.set(ev, new Set()); docListeners.get(ev).add(fn); },
    removeEventListener(ev, fn) { docListeners.get(ev)?.delete(fn); },
    dispatchEvent(ev) { for (const fn of docListeners.get(ev.type) || []) fn(ev); },
  };
  doc.documentElement = makeEl('html');
  doc.documentElement.setAttribute('data-ag-cs-lang', 'ko');
  doc.head = makeEl('head');
  doc.body = makeEl('body');
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);

  function buildPane(cid, promptText, pctText, draftText) {
    const pane = makeEl('div');
    pane.className = 'split-pane';
    const cv = makeEl('div');
    cv.setAttribute('data-testid', 'conversation-view');
    cv.setAttribute('data-cascade-id', cid);
    const u1 = makeEl('div');
    u1.setAttribute('data-testid', 'user-message-bubble');
    u1.textContent = promptText;
    cv.appendChild(u1);

    const compWrap = makeEl('div');
    const ib = makeEl('div');
    ib.setAttribute('data-testid', 'agent-input-box');
    const ta = makeEl('textarea');
    ta.value = draftText;
    const pulse = makeEl('div');
    pulse.setAttribute('data-ag-prism-pulse-bar', 'true');
    const sr = {
      getElementById: (id) =>
        id === 'context-percent'
          ? { textContent: pctText }
          : id === 'context-tokens'
            ? { textContent: '440K / 512K' }
            : null,
    };
    pulse.shadowRoot = sr;
    ib.appendChild(ta);
    ib.appendChild(pulse);
    compWrap.appendChild(ib);

    pane.appendChild(cv);
    pane.appendChild(compWrap);
    doc.body.appendChild(pane);
    return { pane, cv, u1, compWrap, ib, ta, pulse };
  }

  const pane1 = buildPane('11111111-1111-4111-8111-111111111111', 'Pane 1 question', '45%', 'pane1 unsent draft');
  const pane2 = buildPane('22222222-2222-4222-8222-222222222222', 'Pane 2 architecture review', '86%', '');

  const store = new Map();
  const storage = {
    get length() { return store.size; },
    key: (i) => Array.from(store.keys())[i] ?? null,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };

  const win = {
    document: doc,
    localStorage: storage,
    navigator: { language: 'ko-KR' },
    Event: class MockEvent { constructor(type) { this.type = type; } },
    addEventListener() {},
    removeEventListener() {},
  };

  return { doc, win, storage, pane1, pane2, docListeners };
}

test('Split View Multi-Pane: follows active focused pane telemetry, banner anchor, composer isolation, and tears down cleanly', async () => {
  const env = createSplitViewDom();
  const submitted = [];

  const guard = core.mountSag({
    win: env.win,
    doc: env.doc,
    storage: env.storage,
    autoPoll: false,
    autoObserve: false,
    bindVaultShortcut: false,
    config: { compactThreshold: 80, compactTriggerMode: 'confirm' },
    onSubmitCompact: (ev) => submitted.push(ev),
  });

  // Initially Pane 1 is first (45% < 80%) -> banner stays hidden
  await guard.evaluateNow();
  assert.equal(guard.getDebugState().compactGuard.lastSnapshot.cascadeId, '11111111-1111-4111-8111-111111111111');
  assert.equal(guard.getDebugState().compactGuard.visible, false);

  // User focuses/clicks into Split Pane 2 (86% >= 80%) -> banner re-anchors above Pane 2's composer!
  env.pane2.ta.focus();
  env.doc.dispatchEvent({ type: 'focusin', target: env.pane2.ta });
  await new Promise((r) => setTimeout(r, 15));

  const dbg = guard.getDebugState();
  assert.equal(dbg.compactGuard.lastSnapshot.cascadeId, '22222222-2222-4222-8222-222222222222');
  assert.equal(dbg.compactGuard.lastSnapshot.usedPct, 86);
  assert.equal(dbg.compactGuard.visible, true);

  const banner = env.pane2.compWrap.querySelector('[data-testid="ag-sg-compact-banner"]');
  assert.ok(banner && !banner.hidden, 'Banner must mount inside active Split Pane 2 composer wrapper');
  assert.equal(env.pane1.compWrap.querySelector('[data-testid="ag-sg-compact-banner"]'), null);

  // Confirming /compact writes ONLY into Pane 2's composer and leaves Pane 1's draft untouched!
  banner.querySelector('[data-ag-sg-act="compact-now"]').click();
  assert.equal(env.pane2.ta.value, '/compact');
  assert.equal(env.pane1.ta.value, 'pane1 unsent draft', 'Pane 1 unsent draft must remain completely untouched');
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].cascadeId, '22222222-2222-4222-8222-222222222222');

  guard.destroy();
  assert.equal(env.doc.querySelectorAll('[data-ag-sg-owned="1"]').length, 0);
  assert.equal(env.docListeners.get('pointerdown')?.size || 0, 0, 'destroy() must detach Split View pointerdown listeners');
  assert.equal(env.docListeners.get('focusin')?.size || 0, 0, 'destroy() must detach Split View focusin listeners');
});

test('8+1 Locale Parity (Obsidian Prism v1.0.8 aligned): zh-CN, zh-TW, yue, en, ja, ko, es, fr, de share 100% identical keys', () => {
  const expectedLocales = ['zh-CN', 'zh-TW', 'yue', 'en', 'ja', 'ko', 'es', 'fr', 'de'];
  assert.deepEqual(Object.keys(i18n.PACKS).sort(), expectedLocales.slice().sort());

  const baseKeys = Object.keys(i18n.PACKS['zh-CN']).sort();
  for (const loc of expectedLocales) {
    assert.deepEqual(Object.keys(i18n.PACKS[loc]).sort(), baseKeys, `Locale ${loc} keys must match zh-CN 1:1`);
    for (const k of baseKeys) {
      assert.equal(typeof i18n.PACKS[loc][k], 'string', `${loc}.${k} must be a string`);
      assert.ok(i18n.PACKS[loc][k].length > 0, `${loc}.${k} must be non-empty`);
    }
  }

  assert.equal(i18n.normalizeLang('ko-KR'), 'ko');
  assert.equal(i18n.normalizeLang('es-MX'), 'es');
  assert.equal(i18n.normalizeLang('fr-CA'), 'fr');
  assert.equal(i18n.normalizeLang('de-AT'), 'de');
  assert.equal(i18n.normalizeLang('ja-JP'), 'ja');
  assert.equal(i18n.normalizeLang('zh-TW'), 'zh-TW');
  assert.equal(i18n.normalizeLang('zh-HK'), 'yue');
  assert.equal(i18n.normalizeLang('en-US'), 'en');
});
