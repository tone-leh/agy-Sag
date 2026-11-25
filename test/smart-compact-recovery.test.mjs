import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../packages/core/index.js');
const handoff = require('../packages/core/recovery-handoff.js');

function createDom({ lang = 'zh-CN', draft = '' } = {}) {
  const matches = (el, selList) =>
    selList.split(',').some((raw) => {
      const s = raw.trim();
      if (!s) return false;
      if (s.startsWith('#')) return el.id === s.slice(1);
      let rest = s;
      const tm = rest.match(/^[a-zA-Z0-9-]+/);
      if (tm) {
        if (el.tagName !== tm[0].toUpperCase()) return false;
        rest = rest.slice(tm[0].length);
      }
      for (const m of rest.matchAll(/\.([a-zA-Z0-9_-]+)/g)) {
        if (!el.classList.contains(m[1])) return false;
      }
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
      title: '',
      style: {},
      _text: '',
      children: [],
      parentElement: null,
      parentNode: null,
      get isConnected() {
        let p = el;
        while (p) { if (p === doc.documentElement) return true; p = p.parentElement; }
        return false;
      },
      get className() { return [...cls].join(' '); },
      set className(v) { cls.clear(); String(v || '').split(/\s+/).filter(Boolean).forEach((c) => cls.add(c)); },
      classList: { add: (...a) => a.forEach((c) => c && cls.add(c)), remove: (...a) => a.forEach((c) => cls.delete(c)), contains: (c) => cls.has(c) },
      get textContent() { return el.children.length ? el._text + el.children.map((c) => c.textContent).join('') : el._text; },
      set textContent(v) { el._text = String(v ?? ''); el.children.length = 0; },
      get firstChild() { return el.children[0] || null; },
      setAttribute(k, v) { attrs.set(k, String(v)); if (k === 'id') el.id = String(v); },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      hasAttribute(k) { return attrs.has(k); },
      removeAttribute(k) { attrs.delete(k); },
      appendChild(c) { if (c.parentElement) c.remove(); c.parentElement = el; c.parentNode = el; el.children.push(c); return c; },
      insertBefore(c, ref) {
        if (c.parentElement) c.remove();
        c.parentElement = el; c.parentNode = el;
        const idx = el.children.indexOf(ref);
        if (idx >= 0) el.children.splice(idx, 0, c);
        else el.children.push(c);
        return c;
      },
      removeChild(c) { el.children = el.children.filter((x) => x !== c); c.parentElement = null; c.parentNode = null; return c; },
      remove() { if (el.parentElement) el.parentElement.removeChild(el); },
      closest(sel) { let cur = el; while (cur) { if (matches(cur, sel)) return cur; cur = cur.parentElement; } return null; },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => { for (const c of n.children) { if (matches(c, sel)) out.push(c); walk(c); } };
        walk(el);
        return out;
      },
      querySelector(sel) { return el.querySelectorAll(sel)[0] || null; },
      addEventListener(ev, fn) { if (!ls.has(ev)) ls.set(ev, new Set()); ls.get(ev).add(fn); },
      removeEventListener(ev, fn) { ls.get(ev)?.delete(fn); },
      dispatchEvent(ev) { for (const fn of ls.get(ev.type) || []) fn(ev); },
      focus() {},
      click() { if (el.disabled) return; for (const fn of ls.get('click') || []) fn({ preventDefault() {}, stopPropagation() {} }); },
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
  doc.documentElement.setAttribute('data-ag-cs-lang', lang);
  doc.head = makeEl('head');
  doc.body = makeEl('body');
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);

  const conv = makeEl('div');
  conv.setAttribute('data-testid', 'conversation-view');
  conv.setAttribute('data-cascade-id', '11111111-aaaa-4bbb-8ccc-222222222222');

  const u1 = makeEl('div');
  u1.setAttribute('data-testid', 'user-message-bubble');
  u1.textContent = 'Fix database migration lock and never leak sk-prodSecret1234567890';
  const a1 = makeEl('div');
  a1.setAttribute('data-testid', 'agent-response');
  a1.textContent = 'Decision: use advisory lock timeout 5s in migrate.ts.';
  const u2 = makeEl('div');
  u2.setAttribute('data-testid', 'user-message-bubble');
  u2.textContent = 'Also keep zero-ASAR compatibility across Windows and macOS.';
  const a2 = makeEl('div');
  a2.setAttribute('data-testid', 'agent-response');
  a2.textContent = 'Verified zero-ASAR contract with 17 unit tests.';
  conv.appendChild(u1);
  conv.appendChild(a1);
  conv.appendChild(u2);
  conv.appendChild(a2);

  const wrap = makeEl('div');
  const inputBox = makeEl('div');
  inputBox.setAttribute('data-testid', 'agent-input-box');
  const textarea = makeEl('textarea');
  textarea.value = draft;
  inputBox.appendChild(textarea);
  wrap.appendChild(inputBox);
  doc.body.appendChild(conv);
  doc.body.appendChild(wrap);

  const store = new Map();
  const storage = {
    get length() { return store.size; },
    key: (i) => Array.from(store.keys())[i] ?? null,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };

  let copied = '';
  const win = {
    document: doc,
    localStorage: storage,
    location: { pathname: '/c/11111111-aaaa-4bbb-8ccc-222222222222' },
    navigator: { language: lang, clipboard: { writeText: async (t) => { copied = t; } } },
    Event: class MockEvent { constructor(type) { this.type = type; } },
    addEventListener() {},
    removeEventListener() {},
  };

  return { doc, win, storage, textarea, u1, u2, getCopied: () => copied };
}

test('Smart /compact Focus Presets build redacted commands across default, code-errors, bookmarks & custom modes', async () => {
  const env = createDom({ lang: 'en' });
  const submitted = [];

  const guard = core.mountSessionGuard({
    win: env.win,
    doc: env.doc,
    storage: env.storage,
    autoPoll: false,
    autoObserve: false,
    bindVaultShortcut: false,
    config: { compactThreshold: 80, compactTriggerMode: 'confirm', compactFocusPreset: 'default' },
    getContextSnapshot: () => ({ usedFraction: 0.86, usedTokens: 440000, maxTokens: 512000 }),
    onSubmitCompact: (ev) => submitted.push(ev),
  });

  await guard.evaluateNow();
  assert.equal(guard.compactGuard.buildCompactCommand(), '/compact');

  // Switch to code-errors via settings popover
  const banner = env.doc.querySelector('[data-testid="ag-sg-compact-banner"]');
  banner.querySelector('[data-ag-sg-act="settings"]').click();
  const pop = env.doc.querySelector('[data-testid="ag-sg-settings-popover"]');
  pop.querySelector('[data-ag-sg-focus="code-errors"]').click();

  const codeCmd = guard.compactGuard.buildCompactCommand();
  assert.ok(codeCmd.startsWith('/compact preserve modified files'));
  const focusTag = banner.querySelector('[data-testid="ag-sg-focus-tag"]');
  assert.equal(focusTag.hidden, false, 'Focus badge must show on banner for non-default preset');

  // Star Turn 1 (which contains a secret) and switch to bookmarks focus preset
  env.u1.querySelector('.ag-sg-bm-star').click();
  pop.querySelector('[data-ag-sg-focus="bookmarks"]').click();
  const bmCmd = guard.compactGuard.buildCompactCommand();
  assert.ok(bmCmd.startsWith('/compact preserve these bookmarked'));
  assert.ok(bmCmd.includes('#1 Fix database migration lock'));
  assert.equal(bmCmd.includes('sk-prodSecret'), false, 'Bookmarks focus command must redact secrets');
  assert.ok(bmCmd.includes('[REDACTED_KEY]'));

  // Custom focus preset with secret redaction
  guard.updateConfig({ compactFocusPreset: 'custom', customCompactFocus: 'keep token sk-customSecret999999 safe' });
  const customCmd = guard.compactGuard.buildCompactCommand();
  assert.equal(customCmd, '/compact keep token [REDACTED_KEY] safe');

  // Submitting uses the built focus command
  banner.querySelector('[data-ag-sg-act="compact-now"]').click();
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].command, '/compact keep token [REDACTED_KEY] safe');
  assert.equal(submitted[0].preset, 'custom');

  guard.destroy();
  assert.equal(env.doc.querySelectorAll('[data-ag-sg-owned="1"]').length, 0);
});

test('Post-Compact Recovery Card: silently snapshots starred turns before /compact, surfaces after compaction, protects drafts, fills & cleans up', async () => {
  const env = createDom({ lang: 'zh-CN' });
  let pct = 85;
  let compactedCount = 0;

  const guard = core.mountSessionGuard({
    win: env.win,
    doc: env.doc,
    storage: env.storage,
    autoPoll: false,
    autoObserve: false,
    bindVaultShortcut: false,
    config: { compactThreshold: 80, compactTriggerMode: 'confirm' },
    getContextSnapshot: () => ({
      usedFraction: pct / 100,
      usedTokens: Math.round((pct / 100) * 512000),
      maxTokens: 512000,
      compactedCount,
    }),
    onSubmitCompact: () => { env.textarea.value = ''; },
  });

  await guard.evaluateNow();
  // Star Turn 1 so it becomes the pinned pre-compact anchor
  env.u1.querySelector('.ag-sg-bm-star').click();

  const banner = env.doc.querySelector('[data-testid="ag-sg-compact-banner"]');
  banner.querySelector('[data-ag-sg-act="compact-now"]').click();

  // Verify pre-compact snapshot was saved and redacted
  const saved = handoff.loadSnapshot(env.storage, '11111111-aaaa-4bbb-8ccc-222222222222');
  assert.ok(saved && saved.pendingRecovery && saved.anchorCount === 1);
  assert.equal(saved.prompt.includes('sk-prodSecret'), false, 'Recovery prompt must redact secrets');
  assert.ok(saved.prompt.includes('advisory lock timeout 5s'));

  // Simulate compaction completed (compactedCount 0 -> 1, usage drops 85% -> 18%)
  compactedCount = 1;
  pct = 18;
  await guard.evaluateNow();

  const recBar = env.doc.querySelector('[data-testid="ag-sg-recovery-bar"]');
  assert.ok(recBar && !recBar.hidden, 'Recovery strip must surface right after compaction completes');
  assert.equal(banner.hidden, true, 'Compact alert banner stays hidden after usage drops to 18%');

  // Copy anchors button copies redacted prompt
  recBar.querySelector('[data-ag-sg-act="recovery-copy"]').click();
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(env.getCopied().includes('advisory lock timeout 5s'));
  assert.equal(env.getCopied().includes('sk-prodSecret'), false);

  // Draft protection: if user already typed something in composer, Fill Recovery refuses to overwrite
  env.textarea.value = 'my new question';
  recBar.querySelector('[data-ag-sg-act="recovery-fill"]').click();
  assert.equal(env.textarea.value, 'my new question', 'Recovery fill must never overwrite an existing draft');
  assert.equal(recBar.hidden, false, 'Recovery strip remains available when draft blocked fill');

  // Clear draft -> Fill Recovery inserts prompt cleanly & clears snapshot
  env.textarea.value = '';
  recBar.querySelector('[data-ag-sg-act="recovery-fill"]').click();
  assert.ok(env.textarea.value.includes('advisory lock timeout 5s'));
  assert.equal(recBar.hidden, true, 'Recovery strip hides once anchors are inserted');
  assert.equal(handoff.loadSnapshot(env.storage, '11111111-aaaa-4bbb-8ccc-222222222222'), null);

  guard.destroy();
  assert.equal(env.doc.querySelectorAll('[data-ag-sg-owned="1"]').length, 0);
});
