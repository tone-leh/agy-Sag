import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const handoff = require('../packages/core/recovery-handoff.js');
const wdMod = require('../packages/core/session-watchdog.js');
const core = require('../packages/core/index.js');

function createMockDom() {
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
  doc.documentElement.setAttribute('data-ag-cs-lang', 'zh-CN');
  doc.head = makeEl('head');
  doc.body = makeEl('body');
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);
  return { doc, makeEl };
}

test('New-Session Handoff builder: creates redacted structured prompt with goal, starred anchors, and latest progress', () => {
  const res = handoff.buildNewSessionHandoff({
    cascadeId: 'abcdef12-3456-4789-8abc-def123456789',
    title: 'Migrate Auth Service',
    usedPct: 86,
    bookmarks: [2],
    turns: [
      { turnNum: 1, user: 'Migrate legacy auth from cookie to OAuth PKCE', assistant: 'Mapped 4 endpoints.' },
      { turnNum: 2, user: 'Lock token key sk-live-secret1234567890abcd and keep zero-downtime rollout', assistant: 'Agreed on dual-verify middleware.' },
      { turnNum: 3, user: 'Finish unit tests for refresh endpoint', assistant: 'Refresh tests passing; pending staging smoke test.' },
    ],
  });

  assert.equal(res.ok, true);
  assert.equal(res.anchorCount, 1);
  assert.equal(res.starredCount, 1);
  assert.ok(res.prompt.includes('Migrate Auth Service'));
  assert.ok(res.prompt.includes('#abcdef12'));
  assert.ok(res.prompt.includes('86%'));
  assert.ok(res.prompt.includes('OAuth PKCE'));
  assert.ok(res.prompt.includes('★ [第 2 轮]'));
  assert.ok(res.prompt.includes('[REDACTED_KEY]'), 'Secrets must be redacted in handoff prompt');
  assert.ok(!res.prompt.includes('sk-live-secret1234567890abcd'));
  assert.ok(res.prompt.includes('pending staging smoke test'), 'Latest unstarred turn must appear in Latest Progress');
});

test('Watchdog +5m Snooze: postpones stall alert for 5 minutes and re-alerts if still stalled without progress', async () => {
  let now = 5_000_000;
  let streaming = true;
  const { doc, makeEl } = createMockDom();
  const conv = makeEl('div');
  conv.setAttribute('data-testid', 'conversation-view');
  conv.setAttribute('data-cascade-id', '77777777-7777-4777-8777-777777777777');
  const u1 = makeEl('div');
  u1.setAttribute('data-testid', 'user-message-bubble');
  u1.textContent = 'Run full integration build';
  const a1 = makeEl('div');
  a1.setAttribute('data-testid', 'agent-response');
  a1.textContent = 'Compiling modules...';
  conv.appendChild(u1);
  conv.appendChild(a1);

  const compWrap = makeEl('div');
  const ib = makeEl('div');
  ib.setAttribute('data-testid', 'agent-input-box');
  ib.appendChild(makeEl('textarea'));
  compWrap.appendChild(ib);
  doc.body.appendChild(conv);
  doc.body.appendChild(compWrap);

  const store = new Map();
  const storage = {
    get length() { return store.size; },
    key: (i) => Array.from(store.keys())[i] ?? null,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  let clipboardText = '';
  const win = {
    document: doc,
    localStorage: storage,
    navigator: { language: 'zh-CN', clipboard: { writeText: async (t) => { clipboardText = t; } } },
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
    now: () => now,
    config: { compactThreshold: 80, stallThresholdSeconds: 120 },
    getContextSnapshot: () => ({ usedFraction: 0.45, usedTokens: 230000, maxTokens: 512000, streaming }),
  });

  // t=0 streaming begins; t=30s progress happens (so elapsed > stalled later)
  await guard.evaluateNow();
  now += 30_000;
  a1.textContent = 'Compiling modules... 40%';
  await guard.evaluateNow();

  // t=+125s no output -> stall banner appears with +5m Snooze button and elapsed info
  now += 125_000;
  await guard.evaluateNow();
  const banner = doc.querySelector('[data-testid="ag-sg-compact-banner"]');
  assert.ok(banner && !banner.hidden);
  assert.equal(banner.getAttribute('data-severity'), 'stall');
  const snoozeBtn = banner.querySelector('[data-ag-sg-act="snooze-stall"]');
  assert.ok(snoozeBtn && !snoozeBtn.hidden, '+5m Snooze button must be visible on stall banner');
  assert.ok(banner.textContent.includes('已运行'), 'Elapsed duration should show when total run exceeds idle duration');

  // Click +5m Snooze -> banner hides immediately
  snoozeBtn.click();
  assert.equal(banner.hidden, true);
  assert.equal(guard.getDebugState().compactGuard.watchdog.snoozed, true);

  // t=+180s (still within 5m snooze window) -> stays hidden
  now += 180_000;
  await guard.evaluateNow();
  assert.equal(banner.hidden, true);
  assert.equal(guard.getDebugState().compactGuard.watchdog.stalled, false);

  // t=+130s more (total 310s > 300s snooze) with still 0 progress -> re-alerts!
  now += 130_000;
  await guard.evaluateNow();
  assert.equal(banner.hidden, false, 'Must re-alert after 5m snooze expires if still making zero progress');
  assert.equal(guard.getDebugState().compactGuard.watchdog.stalled, true);

  // Copy new-session handoff via API -> writes structured prompt to clipboard
  const ho = await guard.copyNewSessionHandoff();
  assert.equal(ho.ok, true);
  assert.ok(clipboardText.includes('Run full integration build'));

  // Progress resumes -> resets snoozeCount cleanly
  now += 5_000;
  a1.textContent = 'Build succeeded!';
  await guard.evaluateNow();
  assert.equal(guard.getDebugState().compactGuard.watchdog.stalled, false);
  assert.equal(guard.getDebugState().compactGuard.watchdog.snoozeCount, 0);

  guard.destroy();
  assert.equal(doc.querySelectorAll('[data-ag-sg-owned="1"]').length, 0);
});

test('SessionWatchdog unit: snoozeStall bounds and reset on streaming end', () => {
  let now = 100_000;
  const wd = wdMod.createSessionWatchdog({ enabled: true, stallThresholdSeconds: 60, now: () => now });
  const snap = { cascadeId: 'c1', usedPct: 30, usedTokens: 1000, streaming: true, compactedCount: 0 };
  wd.observe({ snap });
  now += 65_000;
  assert.equal(wd.observe({ snap }).stalled, true);

  const sn = wd.snoozeStall('c1', 300);
  assert.equal(sn.snoozeSec, 300);
  assert.equal(sn.snoozeCount, 1);

  now += 100_000;
  const mid = wd.observe({ snap });
  assert.equal(mid.snoozed, true);
  assert.equal(mid.stalled, false);
  assert.equal(mid.snoozeRemainingSec, 200);

  // Streaming stops -> resets snooze state
  const done = wd.observe({ snap: { ...snap, streaming: false } });
  assert.equal(done.snoozed, false);
  assert.equal(done.elapsedSec, 0);
});
