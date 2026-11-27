import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../packages/core/index.js');
const coexist = require('../packages/core/coexist.js');

function createMockDom({ lang = 'zh-CN', draft = '', streaming = false } = {}) {
  const listenersByNode = new WeakMap();

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
      classList: {
        add: (...a) => a.forEach((c) => c && cls.add(c)),
        remove: (...a) => a.forEach((c) => cls.delete(c)),
        contains: (c) => cls.has(c),
      },
      get textContent() {
        return el.children.length ? el._text + el.children.map((c) => c.textContent).join('') : el._text;
      },
      set textContent(v) { el._text = String(v ?? ''); el.children.length = 0; },
      get firstChild() { return el.children[0] || null; },
      setAttribute(k, v) { attrs.set(k, String(v)); if (k === 'id') el.id = String(v); },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      hasAttribute(k) { return attrs.has(k); },
      removeAttribute(k) { attrs.delete(k); },
      appendChild(c) {
        if (c.parentElement) c.remove();
        c.parentElement = el; c.parentNode = el;
        el.children.push(c);
        return c;
      },
      insertBefore(c, ref) {
        if (c.parentElement) c.remove();
        c.parentElement = el; c.parentNode = el;
        const idx = el.children.indexOf(ref);
        if (idx >= 0) el.children.splice(idx, 0, c);
        else el.children.push(c);
        return c;
      },
      removeChild(c) {
        el.children = el.children.filter((x) => x !== c);
        c.parentElement = null; c.parentNode = null;
        return c;
      },
      remove() { if (el.parentElement) el.parentElement.removeChild(el); },
      closest(sel) {
        let cur = el;
        while (cur) { if (matches(cur, sel)) return cur; cur = cur.parentElement; }
        return null;
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => {
          for (const c of n.children) {
            if (matches(c, sel)) out.push(c);
            walk(c);
          }
        };
        walk(el);
        return out;
      },
      querySelector(sel) { return el.querySelectorAll(sel)[0] || null; },
      addEventListener(ev, fn) {
        if (!ls.has(ev)) ls.set(ev, new Set());
        ls.get(ev).add(fn);
      },
      removeEventListener(ev, fn) { ls.get(ev)?.delete(fn); },
      dispatchEvent(ev) {
        for (const fn of ls.get(ev.type) || []) fn(ev);
      },
      focus() {},
      click() {
        if (el.disabled) return;
        for (const fn of ls.get('click') || []) fn({ preventDefault() {}, stopPropagation() {} });
      },
    };
    listenersByNode.set(el, ls);
    return el;
  };

  const docListeners = new Map();
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
    addEventListener(ev, fn) { if (!docListeners.has(ev)) docListeners.set(ev, new Set()); docListeners.get(ev).add(fn); },
    removeEventListener(ev, fn) { docListeners.get(ev)?.delete(fn); },
    dispatchEvent(ev) { for (const fn of docListeners.get(ev.type) || []) fn(ev); },
  };
  doc.documentElement = makeEl('html');
  doc.documentElement.setAttribute('data-ag-cs-lang', lang);
  doc.head = makeEl('head');
  doc.body = makeEl('body');
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);

  const conv = makeEl('div');
  conv.setAttribute('data-testid', 'conversation-view');
  conv.setAttribute('data-cascade-id', '11111111-2222-4333-8444-555555555555');
  const u1 = makeEl('div');
  u1.setAttribute('data-testid', 'user-message-bubble');
  u1.textContent = 'Check why context hits 102% with token sk-superSecret1234567890';
  const a1 = makeEl('div');
  a1.setAttribute('data-testid', 'agent-response');
  a1.textContent = 'Recommend compacting early at 80%.';
  conv.appendChild(u1);
  conv.appendChild(a1);

  const composerWrap = makeEl('div');
  const inputBox = makeEl('div');
  inputBox.setAttribute('data-testid', 'agent-input-box');
  const textarea = makeEl('textarea');
  textarea.value = draft;
  const sendBtn = makeEl('button');
  sendBtn.setAttribute('data-testid', 'send-button');
  inputBox.appendChild(textarea);
  inputBox.appendChild(sendBtn);
  if (streaming) {
    const stopBtn = makeEl('button');
    stopBtn.setAttribute('data-testid', 'stop-button');
    inputBox.appendChild(stopBtn);
  }
  composerWrap.appendChild(inputBox);
  doc.body.appendChild(conv);
  doc.body.appendChild(composerWrap);

  const storeMap = new Map();
  const storage = {
    getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
    setItem: (k, v) => storeMap.set(k, String(v)),
    removeItem: (k) => storeMap.delete(k),
  };

  let copiedText = '';
  const win = {
    document: doc,
    localStorage: storage,
    location: { pathname: '/c/11111111-2222-4333-8444-555555555555' },
    Blob: class MockBlob { constructor(parts, opts) { this.parts = parts; this.opts = opts; } },
    URL: {
      createObjectURL: () => 'blob:mock-cg-md',
      revokeObjectURL: () => {},
    },
    navigator: {
      language: lang,
      clipboard: { writeText: async (t) => { copiedText = t; } },
    },
    Event: class MockEvent { constructor(type) { this.type = type; } },
    addEventListener(ev, fn) { if (!winListeners.has(ev)) winListeners.set(ev, new Set()); winListeners.get(ev).add(fn); },
    removeEventListener(ev, fn) { winListeners.get(ev)?.delete(fn); },
    dispatchEvent(ev) { for (const fn of winListeners.get(ev.type) || []) fn(ev); },
  };

  return { doc, win, storage, textarea, sendBtn, inputBox, getCopied: () => copiedText, docListeners, winListeners };
}

test('CompactGuard: surfaces confirmation banner at threshold & overflow severity at 102%, confirms /compact cleanly', async () => {
  const env = createMockDom({ lang: 'zh-CN' });
  let pct = 72;
  const submitted = [];

  const guard = core.mountSag({
    win: env.win,
    doc: env.doc,
    storage: env.storage,
    autoPoll: false,
    config: { compactThreshold: 80, compactTriggerMode: 'confirm' },
    getContextSnapshot: () => ({ usedFraction: pct / 100, usedTokens: Math.round((pct / 100) * 512000), maxTokens: 512000 }),
    onSubmitCompact: (ev) => submitted.push(ev),
  });

  await guard.evaluateNow();
  assert.equal(guard.getDebugState().compactGuard.visible, false, 'Must stay hidden below 80% threshold');

  pct = 82;
  await guard.evaluateNow();
  const banner = env.doc.querySelector('[data-testid="ag-sg-compact-banner"]');
  assert.ok(banner && !banner.hidden, 'Banner must show at 82%');
  assert.equal(banner.getAttribute('data-severity'), 'warn');
  assert.equal(banner.getAttribute('data-ag-no-i18n'), '1', 'Owned banner must opt out of host i18n');

  pct = 102;
  await guard.evaluateNow();
  assert.equal(banner.getAttribute('data-severity'), 'overflow', '102% must switch to overflow severity');

  // Click primary confirm button
  const compactBtn = banner.querySelector('[data-ag-sg-act="compact-now"]');
  compactBtn.click();
  assert.equal(env.textarea.value, '/compact');
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].command, '/compact');

  guard.destroy();
  assert.equal(env.doc.querySelectorAll('[data-ag-sg-owned="1"]').length, 0, 'destroy() must remove all owned DOM nodes');
  assert.equal(env.doc.getElementById('ag-sg-core-css'), null, 'destroy() must remove injected stylesheet');
});

test('CompactGuard: triple safety guard protects unsent drafts, blocks during streaming, and resets on compaction', async () => {
  const env = createMockDom({ lang: 'en', draft: 'half-written prompt', streaming: false });
  let pct = 86;
  let compactedCount = 0;
  let streaming = false;
  const submitted = [];

  const guard = core.mountSag({
    win: env.win,
    doc: env.doc,
    storage: env.storage,
    autoPoll: false,
    config: { compactThreshold: 80, compactTriggerMode: 'confirm' },
    getContextSnapshot: () => ({
      usedFraction: pct / 100,
      maxTokens: 512000,
      streaming,
      compactedCount,
    }),
    onSubmitCompact: (ev) => submitted.push(ev),
  });

  // 1) Draft protection: never overwrite user draft
  await guard.evaluateNow();
  const resDraft = guard.compactGuard.insertCompact({ submit: true });
  assert.equal(resDraft.ok, false);
  assert.equal(resDraft.reason, 'draft-present');
  assert.equal(env.textarea.value, 'half-written prompt', 'Existing draft must remain untouched');
  assert.equal(submitted.length, 0);

  // 2) Streaming protection: banner stays completely invisible while streaming, and insertCompact is blocked
  env.textarea.value = '';
  streaming = true;
  await guard.evaluateNow();
  const bannerDuringStream = env.doc.querySelector('[data-testid="ag-sg-compact-banner"]');
  assert.equal(bannerDuringStream.hidden, true, 'Compact banner must stay invisible while AI is still streaming');
  const resStream = guard.compactGuard.insertCompact({ submit: true });
  assert.equal(resStream.ok, false);
  assert.equal(resStream.reason, 'streaming');

  // 3) Dismiss suppresses until +10% climb, then resets cleanly when compactedCount increments
  streaming = false;
  await guard.evaluateNow();
  const banner = env.doc.querySelector('[data-testid="ag-sg-compact-banner"]');
  banner.querySelector('[data-ag-sg-act="dismiss"]').click();
  assert.equal(banner.hidden, true, 'Dismiss must hide banner');

  pct = 91; // +5% (< +10% rearmDeltaPct) -> stays dismissed
  await guard.evaluateNow();
  assert.equal(banner.hidden, true);

  pct = 97; // +11% (>= +10%) -> re-arms!
  await guard.evaluateNow();
  assert.equal(banner.hidden, false, 'Must re-arm after +10% climb');

  // Simulate compaction completed (compactedCount increments & usage drops)
  banner.querySelector('[data-ag-sg-act="dismiss"]').click();
  compactedCount = 1;
  pct = 24;
  await guard.evaluateNow();
  assert.equal(banner.hidden, true);

  // Next time it reaches 81% after compaction, alert works fresh!
  pct = 81;
  await guard.evaluateNow();
  assert.equal(banner.hidden, false, 'Compaction must reset dismiss state for future turns');

  guard.destroy();
});

test('CompactGuard: auto-countdown mode aborts immediately if user types draft or clicks cancel, and submits cleanly when idle', async () => {
  const env = createMockDom({ lang: 'en', draft: '' });
  const submitted = [];

  const guard = core.mountSag({
    win: env.win,
    doc: env.doc,
    storage: env.storage,
    autoPoll: false,
    config: { compactThreshold: 75, compactTriggerMode: 'auto-countdown', countdownSeconds: 3 },
    getContextSnapshot: () => ({ usedFraction: 0.82, maxTokens: 512000, streaming: false }),
    onSubmitCompact: (ev) => submitted.push(ev),
  });

  await guard.evaluateNow();
  assert.equal(guard.getDebugState().compactGuard.countdownActive, true, 'Countdown must start when idle & draft empty');

  // Simulate user typing a draft -> countdown MUST abort immediately
  env.textarea.value = 'wait, do not compact yet';
  env.textarea.dispatchEvent({ type: 'input' });
  assert.equal(guard.getDebugState().compactGuard.countdownActive, false, 'Typing draft must cancel countdown immediately');
  assert.equal(submitted.length, 0);

  guard.destroy();
});

test('CompactGuard: minimal banner has max 2 actions (no export clutter), quick settings popover persists, and Export / Download .md APIs emit redacted recap', async () => {
  const env = createMockDom({ lang: 'zh-CN' });
  let exported = null;
  let downloaded = null;

  const guard = core.mountSag({
    win: env.win,
    doc: env.doc,
    storage: env.storage,
    autoPoll: false,
    config: { compactThreshold: 80, compactTriggerMode: 'confirm' },
    getContextSnapshot: () => ({ usedFraction: 0.85, usedTokens: 435000, maxTokens: 512000 }),
    onExportMarkdown: (res) => { exported = res; },
    onDownloadMarkdown: (res) => { downloaded = res; },
  });

  await guard.evaluateNow();
  const banner = env.doc.querySelector('[data-testid="ag-sg-compact-banner"]');
  // Minimal banner invariant: zero export/handoff/gear clutter on compact banner; at most 2 visible buttons
  assert.equal(banner.querySelector('[data-ag-sg-act="export-md"]'), null);
  assert.equal(banner.querySelector('[data-ag-sg-act="download-md"]'), null);
  assert.equal(banner.querySelector('[data-ag-sg-act="copy-handoff"]'), null);
  const visibleBtns = banner.querySelectorAll('.ag-sg-actions button').filter((b) => !b.hidden);
  assert.ok(visibleBtns.length <= 2, `Banner must stay ultra-minimal (<= 2 visible buttons), got ${visibleBtns.length}`);

  // Export & Download .md remain cleanly available via API / Status Card / Bookmark Drawer
  await guard.compactGuard.exportMarkdown();
  assert.ok(exported && exported.ok && exported.count === 1);
  assert.equal(exported.markdown.includes('sk-superSecret'), false, 'Exported MD must redact API keys');
  assert.ok(env.getCopied().includes('[REDACTED_KEY]'));

  await guard.compactGuard.downloadMarkdown();
  assert.ok(downloaded && downloaded.ok && downloaded.downloaded);
  assert.ok(downloaded.filename.endsWith('.md'));
  assert.equal(downloaded.markdown.includes('sk-superSecret'), false);

  // Open unified settings drawer programmatically, switch threshold to 70% & mode to fill-only
  guard.openSettingsPopover('conversation');
  const drawer = env.doc.querySelector('[data-testid="ag-sag-settings-drawer"]');
  assert.ok(drawer);
  const drawerBackdrop = env.doc.querySelector('[data-testid="ag-sag-drawer-backdrop"]');
  assert.equal(drawerBackdrop.hidden, false);
  drawer.querySelector('[data-ag-sag-subtab="conversation"]')?.click?.();
  drawer.querySelector('[data-ag-sg-th="75"]')?.click?.();
  drawer.querySelector('[data-ag-sg-mode="fill-only"]').click();

  assert.equal(guard.getConfig().compactThreshold, 75);
  assert.equal(guard.getConfig().compactTriggerMode, 'fill-only');
  const persisted = coexist.readStoredConfig(env.storage);
  assert.equal(persisted.compactThreshold, 75);
  assert.equal(persisted.compactTriggerMode, 'fill-only');

  guard.destroy();
});

test('CompactGuard anti-flicker, scoped bridge telemetry & Lexical v2.35 two-step slash-command guard', async () => {
  const env = createMockDom({ lang: 'zh-CN' });
  // Convert editor to Lexical contenteditable & add send button to ensure raw send is NOT clicked without slash menu
  env.textarea.setAttribute('data-lexical-editor', 'true');
  env.textarea.setAttribute('contenteditable', 'true');
  const sendBtn = env.doc.createElement('button');
  sendBtn.setAttribute('data-testid', 'input-send-button');
  let rawSendClicks = 0;
  sendBtn.addEventListener('click', () => { rawSendClicks += 1; });
  env.doc.querySelector('[data-testid="send-button"]')?.addEventListener('click', () => { rawSendClicks += 1; });
  env.doc.querySelector('[data-testid="agent-input-box"]').appendChild(sendBtn);

  let pct = 92;
  let now = 1_000_000;
  const guard = core.mountSag({
    win: env.win,
    doc: env.doc,
    storage: env.storage,
    autoPoll: false,
    now: () => now,
    slashPollMs: 5,
    slashSubmitDelayMs: 0,
    config: { compactThreshold: 90, compactTriggerMode: 'auto-countdown', countdownSeconds: 3 },
    getContextSnapshot: () => ({ usedFraction: pct / 100, usedTokens: Math.round((pct / 100) * 512000), maxTokens: 512000 }),
  });

  await guard.evaluateNow();
  // (a) Trigger compact without a slash-command typeahead -> must NEVER click raw Send button
  const r1 = guard.compactGuard.insertCompact({ submit: true });
  assert.equal(r1.ok, true);
  assert.equal(r1.submitted, false);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(rawSendClicks, 0, 'Must never send literal "/compact" text into Lexical chat without a slash-command option');

  // (b) Single-tick cross-session flicker (92% -> 6% -> 92%) must NOT reset state or restart countdown!
  env.textarea.value = '';
  pct = 6;
  await guard.evaluateNow();
  pct = 92;
  now += 15_000;
  await guard.evaluateNow();
  assert.equal(guard.getDebugState().compactGuard.countdownActive, false, 'Single-tick low flicker must NOT re-trigger auto-compact');

  // (c) Antigravity v2.35 typeahead menu: skips category row, clicks inner [data-testid="menu-option-label"] ("compact"), THEN clicks Send once
  const portal = env.doc.createElement('div');
  const catOpt = env.doc.createElement('div');
  catOpt.setAttribute('id', 'typeahead-item-0');
  catOpt.setAttribute('role', 'option');
  const catRow = env.doc.createElement('div');
  catRow.setAttribute('data-testid', 'menu-category-row');
  catRow.setAttribute('aria-disabled', 'true');
  catRow.textContent = 'Commands';
  catOpt.appendChild(catRow);
  portal.appendChild(catOpt);

  const opt = env.doc.createElement('div');
  opt.setAttribute('id', 'typeahead-item-1');
  opt.setAttribute('role', 'option');
  const label = env.doc.createElement('span');
  label.setAttribute('data-testid', 'menu-option-label');
  label.textContent = 'compact';
  let labelClicks = 0;
  label.addEventListener('click', () => { labelClicks += 1; });
  opt.appendChild(label);
  portal.appendChild(opt);
  env.doc.body.appendChild(portal);

  const r2 = guard.compactGuard.insertCompact({ submit: true });
  assert.equal(r2.ok, true);
  assert.equal(r2.viaSlashOption, true);
  assert.equal(labelClicks, 1, 'Must click inner [data-testid="menu-option-label"] to trigger React onClickCapture chip conversion');
  assert.equal(rawSendClicks, 1, 'Must click Send exactly once AFTER picking the real slash-command option');

  // (d) Context source strictly isolates global bridge.getLatestSnapshot() from foreign or untagged sessions
  const ctxSrc = require('../packages/core/context-source.js');
  const activeUuid = '11111111-2222-4333-8444-555555555555';
  const foreignUuid = '22222222-3333-4444-8555-666666666666';
  env.win.__agPrismMetricsBridge = {
    getLatestSnapshot: () => ({ conversationId: foreignUuid, context: { usedFraction: 0.06, usedTokens: 30000, maxTokens: 512000 } }),
    getMetrics: async () => ({ conversationId: activeUuid, context: { usedFraction: 0.92, usedTokens: 471000, maxTokens: 512000 } }),
  };
  const scopedSnap = await ctxSrc.sampleContextState({ win: env.win, doc: env.doc });
  assert.equal(scopedSnap.usedPct, 92, 'Must prefer matching cascadeId live metrics and ignore foreign 6% snapshot');

  env.win.__agPrismMetricsBridge = {
    getLatestSnapshot: () => ({ context: { usedFraction: 0.06, usedTokens: 30000, maxTokens: 512000 } }),
    getMetrics: async () => null,
  };
  const untaggedFallback = await ctxSrc.sampleContextState({ win: env.win, doc: env.doc });
  assert.notEqual(untaggedFallback?.source, 'host-bridge', 'Must NOT adopt untagged global latest snapshot for a real UUID session');
  delete env.win.__agPrismMetricsBridge;

  guard.destroy();
});

test('CompactGuard auto-silent (default): zero popup banner, aborts silently on draft input, and silently triggers two-step /compact when idle', async () => {
  const env = createMockDom({ lang: 'zh-CN' });
  env.textarea.setAttribute('data-lexical-editor', 'true');
  env.textarea.setAttribute('contenteditable', 'true');
  const sendBtn = env.doc.createElement('button');
  sendBtn.setAttribute('data-testid', 'input-send-button');
  let sendClicks = 0;
  sendBtn.addEventListener('click', () => { sendClicks += 1; });
  env.doc.querySelector('[data-testid="agent-input-box"]').appendChild(sendBtn);

  // Mount Lexical v2.35 slash-command typeahead option
  const portal = env.doc.createElement('div');
  const opt = env.doc.createElement('div');
  opt.setAttribute('id', 'typeahead-item-0');
  opt.setAttribute('role', 'option');
  const label = env.doc.createElement('span');
  label.setAttribute('data-testid', 'menu-option-label');
  label.textContent = 'compact';
  let labelClicks = 0;
  label.addEventListener('click', () => { labelClicks += 1; });
  opt.appendChild(label);
  portal.appendChild(opt);
  env.doc.body.appendChild(portal);

  let streaming = true;
  const guard = core.mountSag({
    win: env.win,
    doc: env.doc,
    storage: env.storage,
    autoPoll: false,
    silentIdleDelayMs: 25,
    slashPollMs: 5,
    slashSubmitDelayMs: 0,
    config: { compactThreshold: 80 }, // default mode MUST be auto-silent
    getContextSnapshot: () => ({ usedFraction: 0.85, usedTokens: 435000, maxTokens: 512000, streaming }),
  });

  assert.equal(guard.getConfig().compactTriggerMode, 'auto-silent');

  // While streaming: zero banner, zero trigger
  await guard.evaluateNow();
  assert.equal(env.doc.querySelector('[data-testid="ag-sg-compact-banner"]'), null, 'auto-silent must NEVER mount a popup banner');
  assert.equal(guard.getDebugState().compactGuard.silentPending, false);
  assert.equal(sendClicks, 0);

  // Turn finishes streaming -> schedules silent auto-compact with ZERO popup banner!
  streaming = false;
  await guard.evaluateNow();
  assert.equal(env.doc.querySelector('[data-testid="ag-sg-compact-banner"]'), null, 'auto-silent must keep zero popup banner even when firing');
  assert.equal(guard.getDebugState().compactGuard.silentPending, true);

  // If user starts typing during the brief silent settle window, it aborts cleanly without touching draft
  env.textarea.value = 'wait';
  env.textarea.dispatchEvent(new Event('input', { bubbles: true }));
  assert.equal(guard.getDebugState().compactGuard.silentPending, false);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(sendClicks, 0);
  assert.equal(env.textarea.value, 'wait');

  // New session: when truly idle and empty, auto-silent fires cleanly with ZERO popup banner!
  guard.destroy();
  env.textarea.value = '';
  const guard2 = core.mountSag({
    win: env.win,
    doc: env.doc,
    storage: env.storage,
    autoPoll: false,
    silentIdleDelayMs: 15,
    slashPollMs: 5,
    slashSubmitDelayMs: 0,
    config: { compactThreshold: 80 },
    getContextSnapshot: () => ({ usedFraction: 0.86, usedTokens: 440000, maxTokens: 512000, streaming: false }),
  });
  await guard2.evaluateNow();
  assert.equal(env.doc.querySelector('[data-testid="ag-sg-compact-banner"]'), null);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(env.doc.querySelector('[data-testid="ag-sg-compact-banner"]'), null, 'Still zero popup banner after silent auto-compact');
  assert.equal(labelClicks, 1);
  assert.equal(sendClicks, 1);
  guard2.destroy();
});

test('auto-silent viewport scroll shield blocks host jump-to-bottom, honors user wheel & restores cleanly', async () => {
  const env = createMockDom({ lang: 'zh-CN', streaming: false });
  const conv = env.doc.querySelector('[data-testid="conversation-view"]');
  const vp = env.doc.createElement('div');
  vp.setAttribute('data-testid', 'autoscroll-viewport');
  vp.scrollHeight = 3600;
  vp.clientHeight = 720;

  // Give vp a prototype-backed scrollTop + scrollTo just like real Chromium Element.prototype
  let nativeScrollTop = 1200;
  const vpProto = Object.create(Object.prototype, {
    scrollTop: {
      configurable: true,
      enumerable: true,
      get() { return nativeScrollTop; },
      set(v) { nativeScrollTop = Math.max(0, Math.min(2880, Number(v) || 0)); },
    },
    scrollTo: {
      configurable: true,
      writable: true,
      value(arg) {
        const top = typeof arg === 'object' && arg ? arg.top : arg;
        nativeScrollTop = Math.max(0, Math.min(2880, Number(top) || 0));
      },
    },
    scroll: {
      configurable: true,
      writable: true,
      value(arg) { this.scrollTo(arg); },
    },
    scrollBy: {
      configurable: true,
      writable: true,
      value(arg) {
        const top = typeof arg === 'object' && arg ? arg.top : arg;
        nativeScrollTop = Math.max(0, Math.min(2880, nativeScrollTop + (Number(top) || 0)));
      },
    },
  });
  Object.setPrototypeOf(vp, vpProto);
  conv.appendChild(vp);

  // Track focus({ preventScroll: true }) and blur() restoration
  let lastFocusArg = null;
  let blurCount = 0;
  env.textarea.focus = (arg) => { lastFocusArg = arg; };
  env.textarea.blur = () => { blurCount += 1; };

  // Simulate host auto-scrolling to the bottom on send via all 3 mechanisms: scrollTop, scrollTo, and scrollIntoView
  let sendClicks = 0;
  const sendBtn = env.doc.querySelector('[data-testid="send-button"]');
  sendBtn.addEventListener('click', () => {
    sendClicks += 1;
    vp.scrollTop = vp.scrollHeight;
    vp.scrollTo({ top: vp.scrollHeight });
    // Simulate child.scrollIntoView() bypassing vp.scrollTop setter
    nativeScrollTop = 2880;
    vp.dispatchEvent({ type: 'scroll' });
  });

  // Mount native "滚动到底部" button
  const toBottomBtn = env.doc.createElement('button');
  toBottomBtn.setAttribute('aria-label', '滚动到底部');
  conv.appendChild(toBottomBtn);

  let fakeNow = 10_000;
  const guard = core.mountSag({
    win: env.win,
    doc: env.doc,
    storage: env.storage,
    autoPoll: false,
    now: () => fakeNow,
    silentIdleDelayMs: 0,
    scrollSettleMs: 0,
    scrollShieldMs: 500,
    config: { compactThreshold: 80 },
    getContextSnapshot: () => ({ usedFraction: 0.86, usedTokens: 440000, maxTokens: 512000, streaming: false }),
  });

  await guard.evaluateNow();
  assert.equal(sendClicks, 1, 'auto-silent should submit /compact');
  assert.equal(lastFocusArg?.preventScroll, true, 'must focus editor with preventScroll: true');
  assert.equal(blurCount, 1, 'must blur composer after silent submit when user was not focused in composer');
  assert.equal(guard.getDebugState().compactGuard.scrollShieldActive, true);
  assert.equal(vp.scrollTop, 1200, 'host jump-to-bottom (scrollTop, scrollTo, scrollIntoView) must be blocked with 0px jump');

  // Genuine user trackpad/wheel scroll UP MUST work immediately and update the pinned anchor
  vp.dispatchEvent({ type: 'wheel', deltaY: -180 });
  nativeScrollTop = 1020;
  vp.dispatchEvent({ type: 'scroll' });
  assert.equal(vp.scrollTop, 1020, 'user manual scroll up must be allowed immediately');

  // After user wheel window expires, another host snap-to-bottom must be pinned back to user new position (1020)
  fakeNow += 500;
  vp.scrollTop = 2880;
  assert.equal(vp.scrollTop, 1020, 'subsequent programmatic scrollTop snap must stay at user new reading position');
  nativeScrollTop = 2880;
  vp.dispatchEvent({ type: 'scroll' });
  assert.equal(vp.scrollTop, 1020, 'subsequent scrollIntoView snap must snap back to 1020');

  // Clicking native "滚动到底部" releases the shield immediately and leaves zero own-property residue
  env.doc.dispatchEvent({ type: 'pointerdown', target: toBottomBtn });
  assert.equal(guard.getDebugState().compactGuard.scrollShieldActive, false);
  assert.equal(Object.prototype.hasOwnProperty.call(vp, 'scrollTop'), false, 'zero own scrollTop residue after release');
  assert.equal(Object.prototype.hasOwnProperty.call(vp, 'scrollTo'), false, 'zero own scrollTo residue after release');
  vp.scrollTop = 2880;
  assert.equal(vp.scrollTop, 2880, 'native scrolling works normally after release');

  guard.destroy();
});

test('auto-silent defers while user is actively scrolling and releases viewport shield on destroy', async () => {
  const env = createMockDom({ lang: 'zh-CN', streaming: false });
  const conv = env.doc.querySelector('[data-testid="conversation-view"]');
  const vp = env.doc.createElement('div');
  vp.setAttribute('data-testid', 'autoscroll-viewport');
  vp.scrollHeight = 3000;
  vp.clientHeight = 700;
  vp.scrollTop = 900;
  conv.appendChild(vp);

  let sendClicks = 0;
  env.doc.querySelector('[data-testid="send-button"]').addEventListener('click', () => {
    sendClicks += 1;
    vp.scrollTop = 2300;
  });

  const guard = core.mountSag({
    win: env.win,
    doc: env.doc,
    storage: env.storage,
    autoPoll: false,
    silentIdleDelayMs: 20,
    scrollSettleMs: 90,
    scrollShieldMs: 500,
    config: { compactThreshold: 80 },
    getContextSnapshot: () => ({ usedFraction: 0.87, usedTokens: 445000, maxTokens: 512000, streaming: false }),
  });

  // User starts scrolling right as they enter the conversation
  env.doc.dispatchEvent({ type: 'wheel', deltaY: -120 });
  await guard.evaluateNow();
  await new Promise((r) => setTimeout(r, 45));
  assert.equal(sendClicks, 0, 'must NOT trigger mid-scroll while user wheel is still active');

  // Wait for scrollSettleMs + buffer -> fires quietly without moving scrollTop
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(sendClicks, 1, 'fires quietly once user stops scrolling');
  assert.equal(vp.scrollTop, 900, 'scrollTop stays pinned at 900 during silent submit');
  assert.equal(guard.getDebugState().compactGuard.scrollShieldActive, true);

  // destroy() immediately releases shield and restores normal scrolling
  guard.destroy();
  vp.scrollTop = 1800;
  assert.equal(vp.scrollTop, 1800, 'vp.scrollTop restored cleanly after destroy()');
});
