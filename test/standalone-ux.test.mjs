import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../packages/core/index.js');
const statusPill = require('../packages/core/status-pill.js');
const prismBridge = require('../packages/core/prism-bridge.js');

function createHostDom({ withPrismPulse = false, withNativeSettingsDialog = true } = {}) {
  const matches = (el, selList) =>
    selList.split(',').some((raw) => {
      const s = raw.trim();
      if (!s) return false;
      const parts = s.split(/\s+/);
      if (parts.length > 1) {
        if (!matches(el, parts[parts.length - 1])) return false;
        let p = el.parentElement;
        let idx = parts.length - 2;
        while (p && idx >= 0) {
          if (matches(p, parts[idx])) idx -= 1;
          p = p.parentElement;
        }
        return idx < 0;
      }
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
  doc.documentElement.setAttribute('lang', 'zh-CN');
  doc.head = makeEl('head');
  doc.body = makeEl('body');
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);

  // Conversation view + composer with real .agy-composer-footer layout
  const conv = makeEl('div');
  conv.setAttribute('data-testid', 'conversation-view');
  conv.setAttribute('data-cascade-id', '99999999-1111-4222-8333-444444444444');
  const u1 = makeEl('div');
  u1.setAttribute('data-testid', 'user-message-bubble');
  u1.textContent = 'Check standalone consumer experience';
  conv.appendChild(u1);

  const compWrap = makeEl('div');
  const ib = makeEl('div');
  ib.setAttribute('data-testid', 'agent-input-box');
  ib.appendChild(makeEl('textarea'));

  const footer = makeEl('div');
  footer.className = 'agy-composer-footer flex w-full items-center justify-between';
  const left = makeEl('div');
  left.textContent = 'Gemini';
  footer.appendChild(left);
  if (withPrismPulse) {
    const pulse = makeEl('div');
    pulse.setAttribute('id', 'ag-prism-pulse-bar');
    const srRoot = makeEl('div');
    const ctxCard = makeEl('section');
    ctxCard.setAttribute('id', 'context-card');
    ctxCard.setAttribute('data-ag-pulse-vial-mode', 'vial');
    const note = makeEl('p');
    note.setAttribute('id', 'context-note');
    ctxCard.appendChild(note);
    srRoot.appendChild(ctxCard);
    pulse.shadowRoot = {
      appendChild: (c) => srRoot.appendChild(c),
      getElementById: (id) => srRoot.querySelector('#' + id),
      querySelector: (s) => srRoot.querySelector(s),
      querySelectorAll: (s) => srRoot.querySelectorAll(s),
    };
    footer.appendChild(pulse);
  }
  const right = makeEl('div');
  right.textContent = 'Turbo';
  footer.appendChild(right);
  ib.appendChild(footer);
  compWrap.appendChild(ib);
  doc.body.appendChild(conv);
  doc.body.appendChild(compWrap);

  // Optional native Antigravity Settings Dialog (WITHOUT Obsidian Prism installed!)
  if (withNativeSettingsDialog) {
    const dlg = makeEl('div');
    dlg.setAttribute('role', 'dialog');
    const panel = makeEl('div');
    panel.className = 'p-6';
    const sec1 = makeEl('div');
    sec1.className = 'space-y-2';
    const h2 = makeEl('h2');
    h2.textContent = 'Appearance';
    sec1.appendChild(h2);
    panel.appendChild(sec1);
    dlg.appendChild(panel);
    doc.body.appendChild(dlg);
  }

  return { doc, footer };
}

test('Standalone user (NO Obsidian Prism): sees calm composer % pill, floating quick card at low context, and native Settings dialog section', async () => {
  const { doc } = createHostDom({ withPrismPulse: false, withNativeSettingsDialog: true });
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
    navigator: { language: 'zh-CN' },
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
    getContextSnapshot: () => ({ usedFraction: 0.34, usedTokens: 174080, maxTokens: 512000, streaming: false }),
  });

  await guard.evaluateNow();

  // Even at 34% (well below 80% threshold), standalone user has a calm composer pill showing live %
  const pill = doc.querySelector(`[data-testid="${statusPill.PILL_TESTID}"]`);
  assert.ok(pill, 'Standalone user must always have a calm composer status pill');
  assert.equal(pill.getAttribute('data-compact'), '0', 'Standalone pill displays percentage readout');
  assert.equal(pill.getAttribute('data-tone'), 'ok');
  assert.ok(pill.textContent.includes('34%'));

  // Clicking the pill opens the minimal floating card (Less is More: <= 8 buttons total, no redundant clear-blank)
  pill.click();
  const card = doc.querySelector(`[data-testid="${statusPill.CARD_TESTID}"]`);
  assert.ok(card && !card.hidden, 'Clicking status pill must open the quick status & settings card');
  assert.ok(card.textContent.includes('174K / 512K'));
  assert.equal(card.textContent.includes('Prism'), false, 'Standalone consumer card must never mention Prism');
  assert.equal(card.querySelector('[data-ag-sg-card-act="clear-blank"]'), null, 'Must not include redundant blank-clear button');
  assert.ok(card.querySelector('[data-ag-sg-card-act="clean-restart"]'), 'Must include Clean Restart action');
  assert.ok(card.querySelectorAll('button').length <= 8, `Status card must stay serene (<= 8 buttons), got ${card.querySelectorAll('button').length}`);

  // Changing threshold from floating card updates live config and syncs to native Settings card
  card.querySelector('[data-ag-sg-card-th="75"]').click();
  assert.equal(guard.getConfig().compactThreshold, 75);

  // Native Antigravity Settings Dialog gets a clean standalone card (WITHOUT Obsidian Prism!, <= 4 rows)
  const nativeSec = doc.querySelector(`[data-testid="${prismBridge.NATIVE_SECTION_TESTID}"]`);
  assert.ok(nativeSec, 'Standalone user must see a clean native Settings section inside Antigravity Settings');
  assert.equal(guard.getDebugState().prismBridge.mountedMode, 'native');
  assert.ok(nativeSec.querySelectorAll('[data-ag-sg-prism-row]').length <= 4, 'Settings card must stay minimal (<= 4 rows)');
  assert.equal(nativeSec.querySelector('[data-ag-sg-prism-th="75"]').getAttribute('aria-pressed'), 'true');
  assert.equal(nativeSec.textContent.includes('Prism'), false, 'Native standalone settings must never show Prism jargon');

  guard.destroy();
  assert.equal(doc.querySelectorAll('[data-ag-sg-owned="1"]').length, 0);
});

test('Combined user (WITH Obsidian Prism Pulse bar): embeds directly inside Prism context-card Shadow DOM with ZERO extra top-level footer pill', async () => {
  const { doc } = createHostDom({ withPrismPulse: true, withNativeSettingsDialog: false });
  let cleanRestarted = 0;
  const win = {
    document: doc,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {}, length: 0, key: () => null },
    navigator: { language: 'zh-CN' },
    addEventListener() {},
    removeEventListener() {},
  };

  const guard = core.mountSessionGuard({
    win,
    doc,
    autoPoll: false,
    autoObserve: false,
    bindVaultShortcut: false,
    getContextSnapshot: () => ({ usedFraction: 0.83, usedTokens: 425000, maxTokens: 512000, streaming: false }),
    onNavigateNewConversation: () => { cleanRestarted += 1; },
  });

  await guard.evaluateNow();
  // Zero extra top-level pill on composer footer!
  assert.equal(doc.querySelector(`[data-testid="${statusPill.PILL_TESTID}"]`), null, 'Must NOT add a separate top-level pill next to Prism [◔ 83%]');
  assert.equal(guard.getDebugState().statusPill.mode, 'prism-context-card');

  // Embedded cleanly inside #ag-prism-pulse-bar.shadowRoot #context-card
  const pulseSr = doc.getElementById('ag-prism-pulse-bar').shadowRoot;
  const sec = pulseSr.querySelector(`[data-testid="${statusPill.PRISM_SEC_TESTID}"]`);
  assert.ok(sec, 'Must embed Auto-Compact + Clean Restart section inside Prism context-card');
  assert.ok(pulseSr.getElementById(statusPill.PRISM_STYLE_ID), 'Must inject scoped Shadow DOM styles');
  assert.equal(sec.querySelectorAll('button').length, 6, 'Only 5 threshold pills + 1 Clean Restart button inside Prism card');

  // Clicking 85% inside Prism card updates live config
  sec.querySelector('[data-ag-sg-pv-th="85"]').click();
  assert.equal(guard.getConfig().compactThreshold, 85);
  assert.equal(sec.querySelector('[data-ag-sg-pv-th="85"]').getAttribute('aria-pressed'), 'true');

  // Clicking Clean Restart inside Prism card triggers clean restart
  sec.querySelector('[data-ag-sg-pv-act="clean-restart"]').click();
  assert.equal(cleanRestarted, 1);

  guard.destroy();
  assert.equal(doc.querySelectorAll('[data-ag-sg-owned="1"]').length, 0);
  assert.equal(pulseSr.querySelector(`[data-testid="${statusPill.PRISM_SEC_TESTID}"]`), null, 'destroy() must clean Shadow DOM section');
  assert.equal(pulseSr.getElementById(statusPill.PRISM_STYLE_ID), null, 'destroy() must clean Shadow DOM style');
});
