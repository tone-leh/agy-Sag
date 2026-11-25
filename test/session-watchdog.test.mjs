import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const wdMod = require('../packages/core/session-watchdog.js');
const core = require('../packages/core/index.js');

test('SessionWatchdog: estimates burn-rate turns remaining, detects >=18% token spike, and resets on compaction', () => {
  let now = 1_000_000;
  const wd = wdMod.createSessionWatchdog({ enabled: true, stallThresholdSeconds: 180, now: () => now });
  const cid = 'cid-burn-1';

  // Turn 1: baseline 40%
  const r1 = wd.observe({ snap: { cascadeId: cid, usedPct: 40, usedTokens: 204800, streaming: false, compactedCount: 0 }, threshold: 80 });
  assert.equal(r1.avgDeltaPct, 0);
  assert.equal(r1.estimatedTurnsLeft, null);

  // Turn 2: +10% -> 50% (remaining 30% / 10% = 3 turns)
  const r2 = wd.observe({ snap: { cascadeId: cid, usedPct: 50, usedTokens: 256000, streaming: false, compactedCount: 0 }, threshold: 80 });
  assert.equal(r2.avgDeltaPct, 10);
  assert.equal(r2.estimatedTurnsLeft, 3);
  assert.equal(r2.spikeDetected, false);

  // Turn 3: huge tool output +22% -> 72% (spikeDetected = true, avg=(10+22)/2=16, rem 8% -> 1 turn)
  const r3 = wd.observe({ snap: { cascadeId: cid, usedPct: 72, usedTokens: 368640, streaming: false, compactedCount: 0 }, threshold: 80 });
  assert.equal(r3.spikeDetected, true, 'Single-turn >=18% jump must flag spikeDetected');
  assert.equal(r3.avgDeltaPct, 16);
  assert.equal(r3.estimatedTurnsLeft, 1);

  // Compaction drops usage to 18% -> resets burn history & spike flag
  const r4 = wd.observe({ snap: { cascadeId: cid, usedPct: 18, usedTokens: 92160, streaming: false, compactedCount: 1 }, threshold: 80 });
  assert.equal(r4.avgDeltaPct, 0);
  assert.equal(r4.spikeDetected, false);
  assert.equal(r4.estimatedTurnsLeft, null);
});

test('SessionWatchdog + CompactGuard + SessionRadar: detects silent streaming stall, alerts banner even below threshold, sends blurred-only OS alert, and clears on progress/completion', async () => {
  let now = 2_000_000;
  let streaming = true;
  let pct = 52; // intentionally below 80% compact threshold
  let assistantText = 'Working on step 1...';
  const stallCallbacks = [];
  const radarNotifs = [];

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
  doc.documentElement.setAttribute('data-ag-cs-lang', 'zh-CN');
  doc.head = makeEl('head');
  doc.body = makeEl('body');
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);

  const conv = makeEl('div');
  conv.setAttribute('data-testid', 'conversation-view');
  conv.setAttribute('data-cascade-id', '44444444-4444-4444-8444-444444444444');
  const a1 = makeEl('div');
  a1.setAttribute('data-testid', 'agent-response');
  a1.textContent = assistantText;
  conv.appendChild(a1);

  const wrap = makeEl('div');
  const box = makeEl('div');
  box.setAttribute('data-testid', 'agent-input-box');
  box.appendChild(makeEl('textarea'));
  wrap.appendChild(box);
  doc.body.appendChild(conv);
  doc.body.appendChild(wrap);

  const store = new Map();
  const storage = {
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
    now: () => now,
    config: {
      compactThreshold: 80,
      stallThresholdSeconds: 120,
      radarNotifyMode: 'all',
      modules: { compactGuard: true, sessionWatchdog: true, sessionRadar: true },
    },
    getContextSnapshot: () => ({
      usedFraction: pct / 100,
      usedTokens: Math.round((pct / 100) * 512000),
      maxTokens: 512000,
      streaming,
    }),
    onStallDetected: (ev) => stallCallbacks.push(ev),
    onRadarNotify: (ev) => radarNotifs.push(ev),
  });

  // t=0: streaming starts, no stall yet
  await guard.evaluateNow();
  assert.equal(guard.getDebugState().compactGuard.visible, false);

  // t=+60s: output grows -> stall timer resets
  now += 60_000;
  a1.textContent = 'Working on step 2 with fresh output...';
  await guard.evaluateNow();
  assert.equal(guard.getDebugState().compactGuard.watchdog.stalled, false);

  // t=+125s with ZERO new output -> stall detected even at 52% context!
  now += 125_000;
  await guard.evaluateNow();
  const banner = doc.querySelector('[data-testid="ag-sg-compact-banner"]');
  assert.ok(banner && !banner.hidden, 'Stall alert banner must surface even when context % is below threshold');
  assert.equal(banner.getAttribute('data-severity'), 'stall');
  assert.equal(stallCallbacks.length, 1);
  assert.equal(radarNotifs.length, 0, 'Must NOT fire OS notification while window is focused');

  // Calling evaluateNow again during same stall episode must NOT duplicate stall callback
  now += 10_000;
  await guard.evaluateNow();
  assert.equal(stallCallbacks.length, 1, 'Stall callback fires once per episode');

  // Simulate blurred window -> notifyStall triggers blurred-only OS alert
  doc.documentElement.setAttribute('data-ag-cs-win-blur', '1');
  assert.equal(guard.sessionRadar.notifyStall({ cascadeId: '44444444-4444-4444-8444-444444444444', stalledForSec: 135 }), true);
  assert.equal(radarNotifs.length, 1);
  assert.equal(radarNotifs[0].type, 'stalled');
  doc.documentElement.removeAttribute('data-ag-cs-win-blur');

  // Dismiss stall alert hides banner cleanly
  banner.querySelector('[data-ag-sg-act="dismiss"]').click();
  assert.equal(banner.hidden, true);

  // Streaming ends -> stall state resets cleanly
  streaming = false;
  await guard.evaluateNow();
  assert.equal(guard.getDebugState().compactGuard.watchdog.stalled, false);

  guard.destroy();
  assert.equal(doc.querySelectorAll('[data-ag-sg-owned="1"]').length, 0);
});
