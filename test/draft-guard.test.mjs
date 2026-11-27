import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const draftMod = require('../packages/core/draft-guard.js');
const core = require('../packages/core/index.js');

function createMockStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (i) => Array.from(map.keys())[i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function createDraftDom(cid = '11111111-2222-4333-8444-555555555555') {
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
      focus() { doc.activeElement = el; },
      click() { if (el.disabled) return; for (const fn of ls.get('click') || []) fn({ target: el, preventDefault() {}, stopPropagation() {} }); },
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
  doc.documentElement.setAttribute('data-ag-cs-lang', 'zh-CN');
  doc.head = makeEl('head');
  doc.body = makeEl('body');
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);

  const conv = makeEl('div');
  conv.setAttribute('data-testid', 'conversation-view');
  conv.setAttribute('data-cascade-id', cid);

  const compWrap = makeEl('div');
  const ib = makeEl('div');
  ib.setAttribute('data-testid', 'agent-input-box');
  const ta = makeEl('textarea');
  const sendBtn = makeEl('button');
  sendBtn.setAttribute('data-testid', 'input-send-button');
  ib.appendChild(ta);
  ib.appendChild(sendBtn);
  compWrap.appendChild(ib);

  doc.body.appendChild(conv);
  doc.body.appendChild(compWrap);

  return { doc, conv, ta, sendBtn };
}

test('DraftGuard helpers: ignores /compact, enforces 7-day TTL, and lists drafts', () => {
  const storage = createMockStorage();
  const t0 = 1_700_000_000_000;

  assert.equal(draftMod.isSaveableDraft('/compact preserve code'), false);
  assert.equal(draftMod.isSaveableDraft('a'), false);
  assert.equal(draftMod.saveDraft(storage, 'cid-1', '/compact'), null);

  const saved = draftMod.saveDraft(storage, 'cid-1', 'Investigate memory leak in worker pool', t0);
  assert.ok(saved);
  assert.equal(draftMod.loadDraft(storage, 'cid-1', t0 + 1000).text, 'Investigate memory leak in worker pool');

  // After 8 days -> expired & auto-removed
  assert.equal(draftMod.loadDraft(storage, 'cid-1', t0 + 8 * 24 * 3600 * 1000), null);
  assert.equal(draftMod.listSavedDrafts(storage, t0 + 8 * 24 * 3600 * 1000).length, 0);
});

test('DraftGuard controller: auto-saves unsent draft, recovers after reload with secret redaction in preview, clears on send, and destroys losslessly', async () => {
  const cid = '11111111-2222-4333-8444-555555555555';
  const storage = createMockStorage();
  let now = 1_700_000_000_000;

  // Session 1: user types a long draft with a secret token and window reloads/crashes before send
  const dom1 = createDraftDom(cid);
  const win1 = { document: dom1.doc, localStorage: storage, Event, navigator: { language: 'zh-CN' }, addEventListener() {}, removeEventListener() {} };
  const guard1 = core.mountSag({
    win: win1,
    doc: dom1.doc,
    storage,
    autoPoll: false,
    autoObserve: false,
    bindVaultShortcut: false,
    draftDebounceMs: 0,
    now: () => now,
  });

  const draftText = 'Please debug webhook auth failure using token sk-proj-secret1234567890abcdef and check retry backoff.';
  dom1.ta.value = draftText;
  dom1.ta.dispatchEvent({ type: 'input' });
  assert.equal(draftMod.loadDraft(storage, cid, now)?.text, draftText);
  guard1.destroy();

  // Session 2: fresh DOM (simulating Cmd+R reload or switch back with empty composer)
  const dom2 = createDraftDom(cid);
  const restoredEvents = [];
  const win2 = { document: dom2.doc, localStorage: storage, Event, navigator: { language: 'zh-CN' }, addEventListener() {}, removeEventListener() {} };
  const guard2 = core.mountSag({
    win: win2,
    doc: dom2.doc,
    storage,
    autoPoll: false,
    autoObserve: false,
    bindVaultShortcut: false,
    draftDebounceMs: 0,
    now: () => now + 5000,
    onDraftRestored: (d) => restoredEvents.push(d),
  });

  const bar = dom2.doc.querySelector('[data-testid="ag-sg-draft-bar"]');
  assert.ok(bar && !bar.hidden, 'Draft recovery bar must surface when composer is empty and saved draft exists');
  assert.ok(bar.textContent.includes('[REDACTED_KEY]') || !bar.textContent.includes('sk-proj-secret1234567890abcdef'), 'Preview text must redact secrets');

  // Click Restore Draft -> fills full original draft into composer & hides bar
  bar.querySelector('[data-ag-sg-act="draft-restore"]').click();
  assert.equal(dom2.ta.value, draftText);
  assert.equal(bar.hidden, true);
  assert.equal(restoredEvents.length, 1);

  // Simulate pressing Enter to submit -> clears saved draft so it won't falsely prompt again
  dom2.ta.dispatchEvent({ type: 'keydown', key: 'Enter', shiftKey: false, isComposing: false });
  assert.equal(draftMod.loadDraft(storage, cid, now + 6000), null, 'Submitting prompt must clear stored draft');

  // Toggle module off via updateConfig
  guard2.updateConfig({ modules: { ...guard2.getConfig().modules, draftGuard: false } });
  assert.equal(guard2.getDebugState().draftGuard.enabled, false);

  guard2.destroy();
  assert.equal(dom2.doc.querySelectorAll('[data-ag-sg-owned="1"]').length, 0);
});
