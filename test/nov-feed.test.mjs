import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { computeNovFeedSignature, readNovFeed } from '../cli/nov-bridge.mjs';
import { SagWatchDaemon } from '../cli/watch-daemon.mjs';

const require = createRequire(import.meta.url);
const statusPill = require('../packages/core/status-pill.js');
const promptQueue = require('../packages/core/prompt-queue.js');
const novSynergyMod = require('../packages/core/nov-synergy.js');
const core = require('../packages/core/index.js');
const i18n = require('../packages/core/i18n.js');

test('readNovFeed & WatchDaemon sag:nov_feed aggregate guard/radar/mem/spec read-only and reject symlinks or >256KB files', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-sag-nov-feed-'));
  try {
    const dataDir = path.join(tmpHome, '.agy-nov-data');

    // 1) Missing files degrade cleanly with zero disk writes
    const emptyRes = readNovFeed({ homeDir: tmpHome, explicitDataDir: dataDir });
    assert.equal(emptyRes.ok, true);
    assert.equal(emptyRes.available, false);
    assert.equal(emptyRes.feed.guard.blockedCount, 0);
    assert.equal(emptyRes.feed.mem.driftedCount, 0);
    assert.equal(emptyRes.feed.spec.writeLockActive, false);
    assert.equal(fs.existsSync(dataDir), false, 'Must remain strictly read-only');

    // 2) Populate valid read-only snapshots
    fs.mkdirSync(path.join(dataDir, 'guard'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'radar'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'mem'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'spec'), { recursive: true });

    fs.writeFileSync(
      path.join(dataDir, 'guard', 'audit.json'),
      JSON.stringify([
        { ts: '2026-11-27T08:00:00Z', tool: 'run_command', decision: 'allow' },
        { ts: '2026-11-27T08:01:00Z', tool: 'read_file', decision: 'blocked', reason: 'Secret .env blocked' },
      ]),
      'utf8'
    );
    fs.writeFileSync(
      path.join(dataDir, 'guard', 'snapshots.json'),
      JSON.stringify([{ id: 'snap-1', relPath: 'src/a.js' }, { id: 'snap-2', relPath: 'src/b.js' }]),
      'utf8'
    );
    fs.writeFileSync(
      path.join(dataDir, 'radar', 'status-capsule.json'),
      JSON.stringify({ awaitingCount: 2, runningCount: 1, headline: '2 awaiting' }),
      'utf8'
    );
    fs.writeFileSync(
      path.join(dataDir, 'mem', 'memories.json'),
      JSON.stringify({
        memories: [
          { id: 'm1', drifted: false },
          { id: 'm2', drifted: true },
          { id: 'm3', anchors: [{ driftStatus: 'drifted' }] },
        ],
      }),
      'utf8'
    );
    fs.writeFileSync(
      path.join(dataDir, 'spec', 'state.json'),
      JSON.stringify({ writeLockActive: true, activeSpecId: 'sp-1', specs: [{ id: 'sp-1', title: 'Auth Plan', status: 'draft' }] }),
      'utf8'
    );

    const daemon = new SagWatchDaemon({
      novBridgeOpts: { homeDir: tmpHome, explicitDataDir: dataDir },
      enableHostBridge: false,
    });
    const res = daemon._handleHostBridgePayload(
      JSON.stringify({ reqId: 'req-feed-1', type: 'sag:nov_feed', payload: {} })
    );
    assert.equal(res.ok, true);
    assert.equal(res.data.available, true);
    assert.equal(res.data.feed.guard.blockedCount, 1);
    assert.equal(res.data.feed.guard.snapshotCount, 2);
    assert.equal(res.data.feed.guard.latestSnapshotId, 'snap-2');
    assert.equal(res.data.feed.radar.awaitingCount, 2);
    assert.equal(res.data.feed.mem.totalCount, 3);
    assert.equal(res.data.feed.mem.driftedCount, 2);
    assert.equal(res.data.feed.spec.writeLockActive, true);
    assert.equal(res.data.feed.spec.activeSpecTitle, 'Auth Plan');

    // 3) > 256 KB file rejected
    fs.writeFileSync(path.join(dataDir, 'mem', 'memories.json'), 'x'.repeat(262200), 'utf8');
    const bigRes = readNovFeed({ homeDir: tmpHome, explicitDataDir: dataDir });
    assert.equal(bigRes.ok, false);

    // 4) Symlink guard rejects symlinked state.json
    fs.writeFileSync(path.join(dataDir, 'mem', 'memories.json'), '[]', 'utf8');
    const outside = path.join(tmpHome, 'outside-spec.json');
    fs.writeFileSync(outside, '{"writeLockActive":false}', 'utf8');
    fs.unlinkSync(path.join(dataDir, 'spec', 'state.json'));
    fs.symlinkSync(outside, path.join(dataDir, 'spec', 'state.json'));
    const symRes = readNovFeed({ homeDir: tmpHome, explicitDataDir: dataDir });
    assert.equal(symRes.ok, false);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('Phase 6 frontend synergy: HUD shows Spec Lock / Mem drift and PromptQueue pauses under agy-NOV spec write-lock', () => {
  const en = i18n.getStrings('en');
  const segLocked = statusPill.computeHudSegments({
    cfg: { modules: {} },
    nov: { connected: true, enabledCount: 4, total: 13, specWriteLocked: true, memDrifted: 2, guardBlocked: 1 },
    strings: en,
  });
  assert.equal(segLocked[0].id, 'nov');
  assert.equal(segLocked[0].text, 'NOV 🔒');
  assert.equal(segLocked[0].tone, 'warn');
  assert.ok(segLocked[0].title.includes('Spec Lock'));
  assert.ok(segLocked[0].title.includes('Guard blocked 1'));

  const segDrifted = statusPill.computeHudSegments({
    cfg: { modules: {} },
    nov: { connected: true, enabledCount: 4, total: 13, specWriteLocked: false, memDrifted: 3 },
    strings: en,
  });
  assert.equal(segDrifted[0].text, 'NOV · Δ3');
  assert.equal(segDrifted[0].tone, 'warn');

  // Spec write-lock pauses PromptQueue dispatch cleanly
  let locked = true;
  let dispatched = 0;
  const pq = promptQueue.createPromptQueueController({
    enabled: true,
    autoObserve: false,
    isStreaming: () => false,
    isSpecWriteLocked: () => locked,
    onDispatch: () => { dispatched += 1; return { ok: true }; },
    doc: null,
    win: {},
  });
  try {
    pq.enqueue('Run migration');
    const rLocked = pq.flushIfReady();
    assert.equal(rLocked.dispatched, false);
    assert.equal(rLocked.reason, 'spec-write-lock');
    assert.equal(dispatched, 0);
    locked = false;
    const rUnlocked = pq.flushIfReady();
    assert.equal(rUnlocked.dispatched, true);
    assert.equal(dispatched, 1);
  } finally {
    pq.destroy();
  }
});

test('Phase 6 per-turn agy-NOV rollback button appears only when NOV guard is connected and appends prompt without overwriting draft', () => {
  const makeEl = (tag) => {
    const attrs = new Map();
    const cls = new Set();
    const ls = new Map();
    const el = {
      tagName: String(tag).toUpperCase(),
      nodeType: 1,
      id: '',
      value: '',
      type: '',
      hidden: false,
      style: {},
      children: [],
      parentElement: null,
      parentNode: null,
      get isConnected() { return true; },
      get firstChild() { return el.children[0] || null; },
      get className() { return [...cls].join(' '); },
      set className(v) { cls.clear(); String(v || '').split(/\s+/).filter(Boolean).forEach((c) => cls.add(c)); },
      classList: { add: (...a) => a.forEach((c) => c && cls.add(c)), remove: (...a) => a.forEach((c) => cls.delete(c)), contains: (c) => cls.has(c) },
      _text: '',
      get textContent() { return el.children.length ? el._text + el.children.map((c) => c.textContent).join('') : el._text; },
      set textContent(v) { el._text = String(v ?? ''); el.children.length = 0; },
      setAttribute(k, v) { attrs.set(k, String(v)); if (k === 'id') el.id = String(v); if (k === 'class') el.className = String(v); },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      hasAttribute(k) { return attrs.has(k); },
      removeAttribute(k) { attrs.delete(k); },
      appendChild(c) { if (c.parentElement) c.remove(); c.parentElement = el; c.parentNode = el; el.children.push(c); return c; },
      insertBefore(c, ref) { if (!ref) return el.appendChild(c); const i = el.children.indexOf(ref); c.parentElement = el; c.parentNode = el; el.children.splice(i < 0 ? el.children.length : i, 0, c); return c; },
      removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); c.parentElement = null; c.parentNode = null; return c; },
      remove() { el.parentElement?.removeChild(el); },
      addEventListener(ev, fn) { if (!ls.has(ev)) ls.set(ev, []); ls.get(ev).push(fn); },
      removeEventListener(ev, fn) { const a = ls.get(ev); if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
      dispatchEvent(ev) { const e = typeof ev === 'string' ? { type: ev } : ev; for (const fn of [...(ls.get(e.type) || [])]) fn(e); return true; },
      click() { el.dispatchEvent({ type: 'click', target: el, preventDefault() {}, stopPropagation() {} }); },
      closest() { return null; },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => {
          for (const c of n.children) {
            if (sel.startsWith('.') && c.classList.contains(sel.slice(1))) out.push(c);
            else if (sel.includes('data-testid="conversation-view"') && c.getAttribute('data-testid') === 'conversation-view') out.push(c);
            else if (sel.includes('data-testid="user-message-bubble"') && c.getAttribute('data-testid') === 'user-message-bubble') out.push(c);
            else if (sel.includes('data-ag-sag-rollback-turn') && c.hasAttribute('data-ag-sag-rollback-turn')) out.push(c);
            else if (sel.includes('textarea') && c.tagName === 'TEXTAREA') out.push(c);
            else if (sel.includes('data-testid="agent-input-box"') && c.getAttribute('data-testid') === 'agent-input-box') out.push(c);
            walk(c);
          }
        };
        walk(el);
        return out;
      },
      querySelector(sel) { return el.querySelectorAll(sel)[0] || null; },
    };
    return el;
  };

  const doc = {
    documentElement: makeEl('html'),
    head: makeEl('head'),
    body: makeEl('body'),
    createElement: makeEl,
    getElementById: () => null,
    querySelector: (s) => doc.documentElement.querySelector(s),
    querySelectorAll: (s) => doc.documentElement.querySelectorAll(s),
    addEventListener() {},
    removeEventListener() {},
  };
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);

  const conv = makeEl('div');
  conv.setAttribute('data-testid', 'conversation-view');
  const u1 = makeEl('div');
  u1.setAttribute('data-testid', 'user-message-bubble');
  u1.textContent = 'Refactor auth handler';
  conv.appendChild(u1);
  doc.body.appendChild(conv);

  const box = makeEl('div');
  box.setAttribute('data-testid', 'agent-input-box');
  const ta = makeEl('textarea');
  ta.value = 'Draft note';
  box.appendChild(ta);
  doc.body.appendChild(box);

  const win = {
    document: doc,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {}, length: 0, key: () => null },
    navigator: { language: 'en' },
    Event: class E { constructor(t) { this.type = t; } },
    addEventListener() {},
    removeEventListener() {},
  };

  const api = core.mountSag({
    win,
    doc,
    autoPoll: false,
    autoObserve: false,
    bindVaultShortcut: false,
    bindDrawerShortcut: false,
    config: { modules: { outlineBookmarks: true } },
  });

  try {
    // Disconnected NOV -> rollback icon hidden
    assert.equal(conv.querySelector('[data-ag-sag-rollback-turn]'), null);

    // Connect NOV with guard enabled -> rollback icon appears
    win.__agSagBridgeReceiver?.onPush?.({
      event: 'nov:state',
      state: { installed: true, bridgeConnected: true, version: '0.5.0', config: { modules: { guard: true } } },
    });
    const rbBtn = conv.querySelector('[data-ag-sag-rollback-turn]');
    assert.ok(rbBtn, 'Per-turn rollback icon must appear when agy-NOV guard is connected');
    rbBtn.click();
    assert.ok(ta.value.startsWith('Draft note\n\nPlease use agy-NOV guard'), 'Must append rollback prompt without overwriting draft');
  } finally {
    api.destroy();
  }
});

test('Phase 6 audit regressions: secret redaction, live nov:feed push, non-finite counts, deep clone, and rollback migration', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-sag-nov-feed-reg-'));
  try {
    const dataDir = path.join(tmpHome, '.agy-nov-data');
    fs.mkdirSync(path.join(dataDir, 'guard'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'radar'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'spec'), { recursive: true });

    // 1) High #1 + Low #4: Secrets redacted across guard/radar/spec and non-finite counts clamped to 0
    fs.writeFileSync(
      path.join(dataDir, 'guard', 'audit.json'),
      JSON.stringify([
        {
          ts: '2026-11-27T08:05:00Z',
          tool: 'bash',
          decision: 'blocked',
          reason: 'Blocked sk-proj-SECRET1234567890 and Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig12345678',
        },
      ]),
      'utf8'
    );
    fs.writeFileSync(
      path.join(dataDir, 'radar', 'status-capsule.json'),
      JSON.stringify({ awaitingCount: 'Infinity', runningCount: -9, headline: 'Leak ghp_1234567890abcdef1234' }),
      'utf8'
    );
    fs.writeFileSync(
      path.join(dataDir, 'spec', 'state.json'),
      JSON.stringify({
        writeLockActive: true,
        activeSpecId: 'sp-9',
        specs: [{ id: 'sp-9', title: 'Rotate token=supersecretvalue99', status: 'draft' }],
      }),
      'utf8'
    );

    const redRes = readNovFeed({ homeDir: tmpHome, explicitDataDir: dataDir });
    assert.equal(redRes.ok, true);
    assert.ok(!redRes.feed.guard.latestBlocked.reason.includes('sk-proj-SECRET1234567890'));
    assert.ok(!redRes.feed.guard.latestBlocked.reason.includes('eyJhbGciOiJIUzI1NiJ9'));
    assert.ok(redRes.feed.guard.latestBlocked.reason.includes('[REDACTED]'));
    assert.equal(redRes.feed.radar.awaitingCount, 0);
    assert.equal(redRes.feed.radar.runningCount, 0);
    assert.ok(!redRes.feed.radar.headline.includes('ghp_1234567890abcdef1234'));
    assert.ok(!redRes.feed.spec.activeSpecTitle.includes('supersecretvalue99'));

    // 2) High #2: WatchDaemon syncNovFeedToBridges detects live spec write-lock changes and pushes nov:feed
    const pushedEvents = [];
    const fakeSession = {
      isMainContextReady: () => true,
      isOpen: () => true,
      push(event, data) {
        pushedEvents.push({ event, data });
        return true;
      },
    };
    const daemon = new SagWatchDaemon({
      novBridgeOpts: { homeDir: tmpHome, explicitDataDir: dataDir },
      enableHostBridge: true,
    });
    daemon.bridgeSessions.set('win-1', fakeSession);
    daemon._pushInitialNovState(fakeSession, 'win-1');
    assert.ok(
      pushedEvents.some((e) => e.event === 'nov:state'),
      'Initial push must deliver nov:state and seed feed signature'
    );
    const sig1 = computeNovFeedSignature({ homeDir: tmpHome, explicitDataDir: dataDir });
    // Unchanged -> no redundant push
    const noopRes = daemon.syncNovFeedToBridges();
    assert.equal(noopRes.pushed, 0);

    // Mutate spec/state.json (change content length so size changes deterministically even within same ms)
    fs.writeFileSync(
      path.join(dataDir, 'spec', 'state.json'),
      JSON.stringify({
        writeLockActive: false,
        activeSpecId: 'sp-9',
        specs: [{ id: 'sp-9', title: 'Approved Plan Ready For Execution', status: 'approved' }],
      }),
      'utf8'
    );
    const sig2 = computeNovFeedSignature({ homeDir: tmpHome, explicitDataDir: dataDir });
    assert.notEqual(sig1, sig2);
    const liveRes = daemon.syncNovFeedToBridges();
    assert.equal(liveRes.pushed, 1);
    const latestFeedPush = pushedEvents.filter((e) => e.event === 'nov:feed').pop();
    assert.equal(latestFeedPush.data.feed.spec.writeLockActive, false);

    // 3) Low #5: English promptQueue statusSpecLock & autoPaused under spec-write-lock
    const enStr = promptQueue.getUiStrings('en');
    assert.ok(enStr.statusSpecLock && enStr.statusSpecLock.length > 0);
    const pq = promptQueue.createPromptQueueController({
      enabled: true,
      autoObserve: false,
      isStreaming: () => false,
      isSpecWriteLocked: () => true,
      doc: null,
      win: {},
    });
    try {
      pq.enqueue('Check lock');
      pq.flushIfReady();
      assert.equal(pq.getDebugState().autoPaused, true);
    } finally {
      pq.destroy();
    }

    // 4) Low #6: getFeed() deep-clones latestBlocked & statusPill fallback reads novSynergy.getFeed()
    const ns = novSynergyMod.createNovSynergyController({
      win: {},
      doc: null,
      autoRefresh: false,
      initialState: { installed: true, bridgeConnected: true, enabledCount: 4, config: { modules: { guard: true } } },
      initialFeed: {
        guard: { blockedCount: 1, latestBlocked: { ts: '2026', tool: 'bash', reason: 'blocked' } },
        spec: { writeLockActive: true },
        mem: { driftedCount: 2 },
      },
    });
    try {
      const f1 = ns.getFeed();
      f1.guard.latestBlocked.reason = 'mutated';
      assert.equal(ns.getFeed().guard.latestBlocked.reason, 'blocked');
      const sp = statusPill.createStatusPillController({
        win: {},
        doc: null,
        novSynergy: ns,
        getConfig: () => ({ modules: {} }),
        getLang: () => 'en',
      });
      try {
        sp.sync({ synergyConnected: true });
        const dbg = sp.getDebugState();
        assert.equal(dbg.segments[0], 'nov');
        assert.equal(dbg.novText, 'NOV 🔒');
      } finally {
        sp.destroy();
      }
    } finally {
      ns.destroy();
    }

    // 5) Medium #3: Rollback button migrates cleanly into late-appearing actionSlot without duplicating or clobbering star
    const makeNode = (tag) => {
      const attrs = new Map();
      const cls = new Set();
      const ls = new Map();
      const el = {
        tagName: String(tag).toUpperCase(),
        nodeType: 1,
        type: '',
        hidden: false,
        style: {},
        children: [],
        parentElement: null,
        parentNode: null,
        get isConnected() { return true; },
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
        insertBefore(c, ref) { if (!ref) return el.appendChild(c); const i = el.children.indexOf(ref); c.parentElement = el; c.parentNode = el; el.children.splice(i < 0 ? el.children.length : i, 0, c); return c; },
        removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); c.parentElement = null; c.parentNode = null; return c; },
        remove() { el.parentElement?.removeChild(el); },
        addEventListener(ev, fn) { if (!ls.has(ev)) ls.set(ev, []); ls.get(ev).push(fn); },
        dispatchEvent(ev) { const e = typeof ev === 'string' ? { type: ev } : ev; for (const fn of [...(ls.get(e.type) || [])]) fn(e); return true; },
        click() { el.dispatchEvent({ type: 'click', target: el, preventDefault() {}, stopPropagation() {} }); },
        closest(sel) {
          let cur = el;
          while (cur) {
            if (sel.includes('user-input-step') && cur.getAttribute('data-testid') === 'user-input-step') return cur;
            cur = cur.parentElement;
          }
          return null;
        },
        querySelectorAll(sel) {
          const out = [];
          const parts = sel.split(',').map((s) => s.trim());
          const match = (n) => parts.some((p) => {
            if (p.startsWith('.') && n.classList.contains(p.slice(1))) return true;
            if (p.includes('data-testid="conversation-view"') && n.getAttribute('data-testid') === 'conversation-view') return true;
            if (p.includes('data-testid="user-message-bubble"') && n.getAttribute('data-testid') === 'user-message-bubble') return true;
            if (p.includes('data-testid="user-message-actions"') && n.getAttribute('data-testid') === 'user-message-actions') return true;
            if (p.includes('data-testid="revert-button"') && n.getAttribute('data-testid') === 'revert-button') return true;
            if (p.includes('button:not(.ag-sg-bm-star)') && n.tagName === 'BUTTON' && !n.classList.contains('ag-sg-bm-star')) return true;
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
    };
    const outlineMod = require('../packages/core/outline-bookmarks.js');
    const doc = {
      documentElement: makeNode('html'),
      body: makeNode('body'),
      createElement: makeNode,
      querySelector: (s) => doc.body.querySelector(s),
      querySelectorAll: (s) => doc.body.querySelectorAll(s),
    };
    doc.documentElement.appendChild(doc.body);
    const conv = makeNode('div');
    conv.setAttribute('data-testid', 'conversation-view');
    const wrap1 = makeNode('div');
    wrap1.setAttribute('data-testid', 'user-input-step');
    const b1 = makeNode('div');
    b1.setAttribute('data-testid', 'user-message-bubble');
    b1.textContent = 'Original prompt';
    wrap1.appendChild(b1);
    conv.appendChild(wrap1);
    doc.body.appendChild(conv);

    const rollbackCalls = [];
    const bm = outlineMod.createOutlineBookmarksController({
      win: { document: doc },
      doc,
      enabled: true,
      autoObserve: false,
      isRollbackAvailable: () => true,
      onRollbackTurn: (info) => rollbackCalls.push(info),
    });
    try {
      bm.sync();
      assert.equal(b1.querySelectorAll('.ag-sag-turn-rollback').length, 1);
      // Late-appearing native action row inside user-input-step
      const actionRow = makeNode('div');
      actionRow.setAttribute('data-testid', 'user-message-actions');
      const copyBtn = makeNode('button');
      copyBtn.setAttribute('aria-label', 'Copy');
      actionRow.appendChild(copyBtn);
      wrap1.appendChild(actionRow);
      bm.sync();
      assert.equal(b1.querySelectorAll('.ag-sag-turn-rollback').length, 0, 'Legacy in-bubble rollback button must be removed');
      assert.equal(actionRow.querySelectorAll('.ag-sag-turn-rollback').length, 1, 'Exactly one rollback button inside actionRow');
      assert.equal(wrap1.querySelectorAll('.ag-sag-turn-rollback').length, 1, 'No duplicate rollback button after migration');
      const stars = actionRow.querySelectorAll('.ag-sg-bm-star').filter((n) => !n.classList.contains('ag-sag-turn-rollback'));
      assert.equal(stars.length, 1, 'Star button preserved inside actionRow after migration');

      // Prepend a new user turn so original turn shifts from 1 -> 2
      const b0 = makeNode('div');
      b0.setAttribute('data-testid', 'user-message-bubble');
      b0.textContent = 'Earlier prompt';
      conv.insertBefore(b0, wrap1);
      bm.sync();
      actionRow.querySelector('.ag-sag-turn-rollback').click();
      assert.equal(rollbackCalls.length, 1);
      assert.equal(rollbackCalls[0].turnNum, 2, 'Rollback click must read updated turn index dynamically');
    } finally {
      bm.destroy();
    }
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});
