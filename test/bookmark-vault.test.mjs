import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../packages/core/index.js');
const vault = require('../packages/core/bookmark-vault.js');
const exporter = require('../packages/core/precompact-export.js');

function createVaultDom(lang = 'zh-CN') {
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
      click() { for (const fn of ls.get('click') || []) fn({ target: el, preventDefault() {}, stopPropagation() {} }); },
    };
    return el;
  };

  const winListeners = new Map();
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
  conv.setAttribute('data-cascade-id', '11111111-1111-4111-8111-111111111111');
  const u1 = makeEl('div');
  u1.setAttribute('data-testid', 'user-message-bubble');
  u1.textContent = 'Refactor CDP watchdog with token ghp_secretToken1234567890';
  const a1 = makeEl('div');
  a1.setAttribute('data-testid', 'agent-response');
  a1.textContent = 'Adaptive backoff 3s to 30s implemented cleanly.';
  conv.appendChild(u1);
  conv.appendChild(a1);
  doc.body.appendChild(conv);

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
    Blob: class MockBlob { constructor(parts, opts) { this.parts = parts; this.opts = opts; } },
    URL: { createObjectURL: () => 'blob:vault-mock', revokeObjectURL: () => {} },
    navigator: { language: lang, clipboard: { writeText: async (t) => { copied = t; } } },
    addEventListener(ev, fn) { if (!winListeners.has(ev)) winListeners.set(ev, new Set()); winListeners.get(ev).add(fn); },
    removeEventListener(ev, fn) { winListeners.get(ev)?.delete(fn); },
    dispatchEvent(ev) { for (const fn of winListeners.get(ev.type) || []) fn(ev); },
  };

  return { doc, win, storage, u1, winListeners, getCopied: () => copied };
}

test('Cross-Session Bookmark Vault: aggregates & redacts multi-session stars, searches live, exports combined .md, supports Ctrl+Shift+B & Esc, and cleans up', async () => {
  const env = createVaultDom('zh-CN');

  // Pre-seed a second historical conversation in storage (plus a legacy bookmark-only session)
  const cidOld = '22222222-2222-4222-8222-222222222222';
  exporter.saveBookmarks(env.storage, cidOld, [3]);
  vault.syncSessionMeta({
    storage: env.storage,
    cascadeId: cidOld,
    bookmarks: [3],
    title: 'PostgreSQL 索引优化排查',
    turns: [{ turnNum: 3, user: '为什么联合索引失效', assistant: '最左前缀列类型隐式转换导致全表扫描' }],
    now: new Date('2026-11-24T09:00:00Z'),
  });

  const cidLegacy = '33333333-3333-4333-8333-333333333333';
  exporter.saveBookmarks(env.storage, cidLegacy, [5]);

  let downloaded = null;
  const guard = core.mountSessionGuard({
    win: env.win,
    doc: env.doc,
    storage: env.storage,
    autoPoll: false,
    autoObserve: false,
    config: { modules: { outlineBookmarks: true } },
    onDownloadMarkdown: (p) => { downloaded = p; },
  });

  // Star Turn 1 in current conversation -> automatically syncs redacted metadata to vault
  env.u1.querySelector('.ag-sg-bm-star').click();
  const sessions = guard.bookmarkVault.listAllSessions();
  assert.equal(sessions.length, 3, 'Vault must aggregate active, seeded, and legacy sessions');

  // Open Vault via Ctrl+Shift+B keyboard shortcut
  env.win.dispatchEvent({ type: 'keydown', key: 'B', ctrlKey: true, shiftKey: true, preventDefault() {} });
  const overlay = env.doc.querySelector('[data-testid="ag-sg-vault-overlay"]');
  assert.ok(overlay && !overlay.hidden, 'Ctrl+Shift+B must open Cross-Session Bookmark Vault');

  // Verify secret redaction in rendered Vault cards
  assert.equal(overlay.textContent.includes('ghp_secretToken'), false, 'Vault UI must redact secrets');
  assert.ok(overlay.textContent.includes('[REDACTED_KEY]'));
  assert.equal(overlay.querySelectorAll('.ag-sg-vault-card').length, 3);

  // Live search filter by keyword in historical conversation
  const search = overlay.querySelector('[data-testid="ag-sg-vault-search"]');
  search.value = '最左前缀';
  search.dispatchEvent({ type: 'input' });
  const filteredCards = overlay.querySelectorAll('.ag-sg-vault-card');
  assert.equal(filteredCards.length, 1);
  assert.equal(filteredCards[0].getAttribute('data-ag-sg-vault-cid'), cidOld);

  // Copy & Download combined filtered vault Markdown
  overlay.querySelector('[data-ag-sg-act="vault-copy-all"]').click();
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(env.getCopied().includes('PostgreSQL 索引优化排查'));
  assert.ok(env.getCopied().includes('最左前缀列类型隐式转换'));

  overlay.querySelector('[data-ag-sg-act="vault-download-all"]').click();
  assert.ok(downloaded && downloaded.ok && downloaded.downloaded);
  assert.ok(downloaded.filename.includes('vault') && downloaded.filename.endsWith('.md'));

  // Remove current conversation's Turn 1 from Vault -> syncs back to active bubble star!
  search.value = '';
  search.dispatchEvent({ type: 'input' });
  overlay.querySelector('[data-ag-sg-vault-rm="11111111-1111-4111-8111-111111111111:1"]').click();
  assert.deepEqual(guard.outlineBookmarks.getBookmarks(), []);
  assert.equal(env.u1.querySelector('.ag-sg-bm-star').getAttribute('data-starred'), '0');

  // Escape closes Vault cleanly
  env.win.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() {} });
  assert.equal(overlay.hidden, true);

  // destroy() removes overlay and detaches global keydown listener
  guard.destroy();
  assert.equal(env.doc.querySelectorAll('[data-ag-sg-owned="1"]').length, 0);
  assert.equal(env.winListeners.get('keydown')?.size || 0, 0, 'destroy() must remove vault keyboard shortcut listener');
});
