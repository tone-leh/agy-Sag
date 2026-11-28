import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const outlineMod = require('../packages/core/outline-bookmarks.js');
const prismBridgeMod = require('../packages/core/prism-bridge.js');
const coexistMod = require('../packages/core/coexist.js');

function makeEl(tag) {
  const attrs = new Map();
  const cls = new Set();
  const ls = new Map();
  const el = {
    tagName: String(tag).toUpperCase(),
    nodeType: 1,
    value: '',
    hidden: false,
    disabled: false,
    style: {},
    children: [],
    parentElement: null,
    parentNode: null,
    scrolled: false,
    get isConnected() { return true; },
    get firstChild() { return el.children[0] || null; },
    get className() { return [...cls].join(' '); },
    set className(v) { cls.clear(); String(v || '').split(/\s+/).filter(Boolean).forEach((c) => cls.add(c)); },
    classList: { add: (...a) => a.forEach((c) => c && cls.add(c)), remove: (...a) => a.forEach((c) => cls.delete(c)), contains: (c) => cls.has(c) },
    _text: '',
    get textContent() { return el.children.length ? el._text + el.children.map((c) => c.textContent).join('') : el._text; },
    set textContent(v) { el._text = String(v ?? ''); el.children.length = 0; },
    setAttribute(k, v) { attrs.set(k, String(v)); if (k === 'class') el.className = String(v); },
    getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
    hasAttribute(k) { return attrs.has(k); },
    removeAttribute(k) { attrs.delete(k); },
    appendChild(c) { if (c.parentElement) c.remove(); c.parentElement = el; c.parentNode = el; el.children.push(c); return c; },
    removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); c.parentElement = null; c.parentNode = null; return c; },
    remove() { el.parentElement?.removeChild(el); },
    scrollIntoView() { el.scrolled = true; },
    getBoundingClientRect() { return { left: 20, top: 30, bottom: 50 }; },
    closest(sel) {
      let cur = el;
      while (cur) {
        if (sel === '[role="dialog"]' && cur.getAttribute('role') === 'dialog') return cur;
        if (sel === 'div.p-6' && cur.tagName === 'DIV' && cur.classList.contains('p-6')) return cur;
        if (sel === 'div.space-y-2' && cur.tagName === 'DIV' && cur.classList.contains('space-y-2')) return cur;
        cur = cur.parentElement;
      }
      return null;
    },
    addEventListener(ev, fn) { if (!ls.has(ev)) ls.set(ev, []); ls.get(ev).push(fn); },
    removeEventListener(ev, fn) { const a = ls.get(ev); if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
    dispatchEvent(ev) { const e = typeof ev === 'string' ? { type: ev } : ev; for (const fn of [...(ls.get(e.type) || [])]) fn(e); return true; },
    click() { el.dispatchEvent({ type: 'click', target: el, preventDefault() {}, stopPropagation() {} }); },
    querySelectorAll(sel) {
      const out = [];
      const parts = sel.split(',').map((s) => s.trim());
      const match = (n) => parts.some((p) => {
        if (p === 'nav' && n.tagName === 'NAV') return true;
        if (p === 'aside' && n.tagName === 'ASIDE') return true;
        if (p === 'div.space-y-2' && n.tagName === 'DIV' && n.classList.contains('space-y-2')) return true;
        if (p.startsWith('.') && n.classList.contains(p.slice(1))) return true;
        const mEq = p.match(/^\[([a-zA-Z0-9-]+)="([^"]+)"\]$/);
        if (mEq && n.getAttribute(mEq[1]) === mEq[2]) return true;
        if (p === '[role="dialog"] h2' && n.tagName === 'H2' && n.closest('[role="dialog"]')) return true;
        if (['h1', 'h2', 'h3'].includes(p)) return n.tagName === p.toUpperCase();
        return false;
      });
      const walk = (n) => {
        for (const c of n.children) {
          if (match(c)) out.push(c);
          walk(c);
        }
      };
      walk(el);
      return out;
    },
    querySelector(sel) { return el.querySelectorAll(sel)[0] || null; },
  };
  return el;
}

test('Phase 12: per-turn 3-way rewind menu offers NOV rollback, compact focus, and handoff brief & destroys cleanly', () => {
  const doc = {
    documentElement: makeEl('html'),
    head: makeEl('head'),
    body: makeEl('body'),
    createElement: makeEl,
    getElementById: () => null,
    querySelector: (s) => doc.documentElement.querySelector(s),
    querySelectorAll: (s) => doc.documentElement.querySelectorAll(s),
  };
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);

  const conv = makeEl('div');
  conv.setAttribute('data-testid', 'conversation-view');
  const u1 = makeEl('div');
  u1.setAttribute('data-testid', 'user-message-bubble');
  u1.textContent = 'Build auth middleware';
  const a1 = makeEl('div');
  a1.setAttribute('data-testid', 'planner-response-text');
  a1.textContent = 'Auth middleware implemented with JWT verification.';
  conv.appendChild(u1);
  conv.appendChild(a1);
  doc.body.appendChild(conv);

  let compactPayload = null;
  let handoffText = '';
  let novRollbackCalled = false;

  const bm = outlineMod.createOutlineBookmarksController({
    win: { document: doc },
    doc,
    coexist: coexistMod,
    enabled: true,
    autoObserve: false,
    isRollbackAvailable: () => true,
    onRollbackTurn: () => { novRollbackCalled = true; },
    onCompactFromTurn: (p) => { compactPayload = p; },
    onCopyHandoff: (txt) => { handoffText = txt; },
  });
  try {
    bm.sync();
    const rwBtn = u1.querySelector('.ag-sag-turn-rewind');
    assert.ok(rwBtn, 'Per-turn rewind menu button must render');
    rwBtn.click();

    const menu = doc.querySelector('[data-testid="ag-sag-rewind-menu"]');
    assert.ok(menu, '3-way rewind menu must open');
    assert.ok(menu.querySelector('[data-ag-sag-rewind-act="nov-rollback"]'));
    assert.ok(menu.querySelector('[data-ag-sag-rewind-act="compact-focus"]'));
    assert.ok(menu.querySelector('[data-ag-sag-rewind-act="copy-handoff"]'));

    menu.querySelector('[data-ag-sag-rewind-act="compact-focus"]').click();
    assert.equal(compactPayload.turnNum, 1);
    assert.equal(doc.querySelector('[data-testid="ag-sag-rewind-menu"]'), null, 'Menu closes after action');

    rwBtn.click();
    doc.querySelector('[data-ag-sag-rewind-act="copy-handoff"]').click();
    assert.ok(handoffText.length > 10, 'Handoff brief must be generated and passed to callback');

    rwBtn.click();
    doc.querySelector('[data-ag-sag-rewind-act="nov-rollback"]').click();
    assert.equal(novRollbackCalled, true);

    // Opening rewind menu then disabling module via setEnabled(false) must clear rewindMenuEl
    rwBtn.click();
    assert.ok(doc.querySelector('[data-testid="ag-sag-rewind-menu"]'));
    bm.setEnabled(false);
    assert.equal(doc.querySelector('[data-testid="ag-sag-rewind-menu"]'), null, 'setEnabled(false) must clean open rewind menu');
  } finally {
    bm.destroy();
  }
  assert.equal(doc.querySelector('[data-testid="ag-sag-rewind-menu"]'), null);
  assert.equal(u1.querySelector('.ag-sag-turn-rewind'), null);
});

test('Phase 12: prismBridge mounts native Settings nav anchor & dynamic Ctrl/Cmd+Shift+Alt+/ shortcut sheet based on active modules', () => {
  const doc = {
    documentElement: makeEl('html'),
    head: makeEl('head'),
    body: makeEl('body'),
    createElement: makeEl,
    getElementById: () => null,
    querySelector: (s) => doc.documentElement.querySelector(s),
    querySelectorAll: (s) => doc.documentElement.querySelectorAll(s),
    addEventListener(ev, fn) { doc.body.addEventListener(ev, fn); },
    removeEventListener(ev, fn) { doc.body.removeEventListener(ev, fn); },
  };
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);

  const dialog = makeEl('div');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-label', 'Settings');
  const nav = makeEl('nav');
  dialog.appendChild(nav);
  const content = makeEl('div');
  content.className = 'p-6';
  const h2 = makeEl('h2');
  h2.textContent = 'Appearance';
  const sec = makeEl('div');
  sec.className = 'space-y-2';
  content.appendChild(h2);
  content.appendChild(sec);
  dialog.appendChild(content);
  doc.body.appendChild(dialog);

  let cfg = {
    ...coexistMod.DEFAULT_CONFIG,
    modules: { ...coexistMod.DEFAULT_CONFIG.modules, promptLibrary: true, readingNav: true, outlineBookmarks: false },
  };
  const pb = prismBridgeMod.createPrismBridgeController({
    win: { document: doc, addEventListener() {}, removeEventListener() {} },
    doc,
    coexist: coexistMod,
    autoObserve: false,
    getLang: () => 'en',
    getConfig: () => cfg,
  });
  try {
    const navAnchor = nav.querySelector('[data-testid="ag-sag-settings-nav-item"]');
    assert.ok(navAnchor, 'Native Settings sidebar anchor must be injected');
    navAnchor.click();

    // Option+Cmd+/ (without Shift) must yield to Antigravity v2.36.0 native keyboard shortcuts list
    doc.body.dispatchEvent({ type: 'keydown', metaKey: true, altKey: true, shiftKey: false, key: '/', code: 'Slash', preventDefault() {}, stopPropagation() {} });
    assert.equal(pb.isShortcutSheetOpen(), false, 'Option+Cmd+/ without Shift must not hijack v2.36.0 native shortcuts');

    // Ctrl+Shift+Alt+/ opens dynamic shortcut sheet
    doc.body.dispatchEvent({ type: 'keydown', ctrlKey: true, shiftKey: true, altKey: true, key: '/', code: 'Slash', preventDefault() {}, stopPropagation() {} });
    assert.equal(pb.isShortcutSheetOpen(), true);
    const modal = doc.querySelector('[data-testid="ag-sag-shortcuts-modal"]');
    assert.ok(modal);
    assert.ok(modal.textContent.includes('Ctrl/Cmd + Alt + P'), 'Active promptLibrary shortcut must appear');
    assert.ok(modal.textContent.includes('Alt + F'), 'Active readingNav shortcut must appear');
    assert.ok(!modal.textContent.includes('Ctrl/Cmd + Shift + B'), 'Disabled outlineBookmarks shortcut must be omitted');

    // Escape closes shortcut sheet
    doc.body.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() {}, stopPropagation() {} });
    assert.equal(pb.isShortcutSheetOpen(), false);
  } finally {
    pb.destroy();
  }
  assert.equal(nav.querySelector('[data-testid="ag-sag-settings-nav-item"]'), null);
  assert.equal(doc.querySelector('[data-testid="ag-sag-shortcuts-modal"]'), null);
});
