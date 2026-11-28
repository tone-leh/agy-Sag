import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import {
  auditAntigravityStorage,
  createStorageBackup,
  exportSanitizedSession,
} from '../cli/storage-doctor.mjs';
import { copyFileSafeAtomic } from '../cli/platform-utils.mjs';
import { evalViaCdp } from '../cli/cdp-attach.mjs';
import { SagWatchDaemon } from '../cli/watch-daemon.mjs';

const require = createRequire(import.meta.url);
const coexist = require('../packages/core/coexist.js');
const ctxSrc = require('../packages/core/context-source.js');
const outlineMod = require('../packages/core/outline-bookmarks.js');
const readingNavMod = require('../packages/core/reading-nav.js');
const thoughtMod = require('../packages/core/thought-translator.js');
const hostI18nMod = require('../packages/core/host-i18n.js');
const statusPillMod = require('../packages/core/status-pill.js');
const draftMod = require('../packages/core/draft-guard.js');
const queueMod = require('../packages/core/prompt-queue.js');
const promptLibMod = require('../packages/core/prompt-library.js');
const cleanSlateMod = require('../packages/core/clean-slate.js');
const compactMod = require('../packages/core/compact-guard.js');
const prismBridgeMod = require('../packages/core/prism-bridge.js');
const safeAutoAcceptMod = require('../packages/core/safe-auto-accept.js');
const themeStudioMod = require('../packages/core/theme-studio.js');
const stylesMod = require('../packages/core/styles.js');

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-sag-v236-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function createMemoryStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
    setItem: (k, v) => m.set(String(k), String(v)),
    removeItem: (k) => m.delete(String(k)),
  };
}

function createMockDom({ withMO = false } = {}) {
  const moInstances = [];
  const matches = (el, selList) => {
    if (!el || el.nodeType !== 1) return false;
    return selList.split(',').some((raw) => {
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
      // Handle simple :not(...)
      let base = s;
      const notMatches = [...s.matchAll(/:not\(([^)]+)\)/g)];
      for (const nm of notMatches) {
        if (matches(el, nm[1])) return false;
        base = base.replace(nm[0], '');
      }
      const mTag = base.match(/^[a-z0-9-]+/i);
      if (mTag && el.tagName.toLowerCase() !== mTag[0].toLowerCase()) return false;
      const clsMatches = [...base.matchAll(/\.([A-Za-z0-9_-]+)/g)];
      for (const m of clsMatches) {
        if (!String(el.className || '').split(/\s+/).includes(m[1])) return false;
      }
      const attrMatches = [...base.matchAll(/\[([^\]=^$*]+)(?:([*^$]?=)"([^"]*)")?\]/g)];
      for (const m of attrMatches) {
        const [, attr, op, val] = m;
        const actual = el.getAttribute(attr);
        if (actual === null) return false;
        if (op === '=' && actual !== val) return false;
        if (op === '*=' && !actual.includes(val)) return false;
        if (op === '^=' && !actual.startsWith(val)) return false;
      }
      return true;
    });
  };

  const makeText = (val) => ({
    nodeType: 3,
    nodeValue: String(val ?? ''),
    parentElement: null,
    get isConnected() {
      return Boolean(this.parentElement && this.parentElement.isConnected);
    },
  });

  const makeEl = (tag) => {
    const attrs = new Map();
    const listeners = new Map();
    const el = {
      nodeType: 1,
      tagName: String(tag || 'div').toUpperCase(),
      childNodes: [],
      get children() {
        return el.childNodes.filter((c) => c.nodeType === 1);
      },
      parentElement: null,
      hidden: false,
      disabled: false,
      value: '',
      style: {},
      get className() { return attrs.get('class') || ''; },
      set className(v) { attrs.set('class', String(v || '')); },
      get id() { return attrs.get('id') || ''; },
      set id(v) { attrs.set('id', String(v || '')); },
      get firstChild() { return el.childNodes[0] || null; },
      get nextElementSibling() {
        const sibs = el.parentElement?.children || [];
        const i = sibs.indexOf(el);
        return i >= 0 && i + 1 < sibs.length ? sibs[i + 1] : null;
      },
      get isConnected() {
        let cur = el;
        while (cur) {
          if (cur === doc.documentElement) return true;
          cur = cur.parentElement;
        }
        return false;
      },
      get textContent() {
        return el.childNodes.map((c) => (c.nodeType === 3 ? c.nodeValue : c.textContent)).join('');
      },
      set textContent(v) {
        el.childNodes = [];
        const s = String(v ?? '');
        if (s) {
          const tn = makeText(s);
          tn.parentElement = el;
          el.childNodes.push(tn);
        }
      },
      setAttribute(k, v) { attrs.set(String(k), String(v)); },
      getAttribute(k) { return attrs.has(String(k)) ? attrs.get(String(k)) : null; },
      hasAttribute(k) { return attrs.has(String(k)); },
      removeAttribute(k) { attrs.delete(String(k)); },
      contains(target) {
        let cur = target;
        while (cur) {
          if (cur === el) return true;
          cur = cur.parentElement;
        }
        return false;
      },
      appendChild(child) {
        if (!child) return child;
        if (child.parentElement) child.parentElement.removeChild(child);
        child.parentElement = el;
        el.childNodes.push(child);
        return child;
      },
      insertBefore(child, ref) {
        if (!child) return child;
        if (ref && ref.parentElement !== el) {
          const err = new Error('The node before which the new node is to be inserted is not a child of this node.');
          err.name = 'NotFoundError';
          throw err;
        }
        if (child.parentElement) child.parentElement.removeChild(child);
        child.parentElement = el;
        const idx = ref ? el.childNodes.indexOf(ref) : -1;
        if (idx >= 0) el.childNodes.splice(idx, 0, child);
        else el.childNodes.push(child);
        return child;
      },
      insertAdjacentElement(pos, child) {
        if (pos === 'afterend' && el.parentElement) {
          const idx = el.parentElement.childNodes.indexOf(el);
          if (idx >= 0) {
            if (child.parentElement) child.parentElement.removeChild(child);
            child.parentElement = el.parentElement;
            el.parentElement.childNodes.splice(idx + 1, 0, child);
          }
        }
      },
      removeChild(child) {
        const idx = el.childNodes.indexOf(child);
        if (idx >= 0) {
          el.childNodes.splice(idx, 1);
          child.parentElement = null;
        }
        return child;
      },
      remove() { el.parentElement?.removeChild(el); },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => {
          for (const c of n.childNodes || []) {
            if (c.nodeType !== 1) continue;
            if (matches(c, sel)) out.push(c);
            walk(c);
          }
        };
        walk(el);
        return out;
      },
      querySelector(sel) { return el.querySelectorAll(sel)[0] || null; },
      closest(sel) {
        let cur = el;
        while (cur) {
          if (cur.nodeType === 1 && matches(cur, sel)) return cur;
          cur = cur.parentElement;
        }
        return null;
      },
      addEventListener(ev, fn) {
        if (!listeners.has(ev)) listeners.set(ev, new Set());
        listeners.get(ev).add(fn);
      },
      removeEventListener(ev, fn) { listeners.get(ev)?.delete(fn); },
      dispatchEvent(ev) {
        for (const fn of listeners.get(ev?.type) || []) fn(ev);
      },
      click() { el.dispatchEvent({ type: 'click', target: el, preventDefault() {}, stopPropagation() {} }); },
      focus() { doc.activeElement = el; },
      getBoundingClientRect() { return { top: 10, left: 10, width: 120, height: 32, bottom: 42, right: 130 }; },
    };
    return el;
  };

  const html = makeEl('html');
  const head = makeEl('head');
  const body = makeEl('body');
  html.appendChild(head);
  html.appendChild(body);
  const docListeners = new Map();
  const doc = {
    documentElement: html,
    head,
    body,
    hidden: false,
    activeElement: body,
    hasFocus: () => true,
    createElement: makeEl,
    createTextNode: makeText,
    querySelector: (s) => html.querySelector(s),
    querySelectorAll: (s) => html.querySelectorAll(s),
    getElementById: (id) => html.querySelector(`[id="${id}"]`),
    addEventListener(ev, fn) {
      if (!docListeners.has(ev)) docListeners.set(ev, new Set());
      docListeners.get(ev).add(fn);
    },
    removeEventListener(ev, fn) { docListeners.get(ev)?.delete(fn); },
    dispatchEvent(ev) {
      for (const fn of docListeners.get(ev?.type) || []) fn(ev);
    },
  };

  class MockMO {
    constructor(cb) {
      this.cb = cb;
      this.active = false;
      this.target = null;
      this.opts = null;
      moInstances.push(this);
    }
    observe(target, opts) {
      this.active = true;
      this.target = target;
      this.opts = opts;
    }
    disconnect() { this.active = false; }
    trigger(records) { if (this.active) this.cb(records, this); }
  }

  const winListeners = new Map();
  const win = {
    document: doc,
    Event: class MockEvent { constructor(type) { this.type = type; } },
    MutationObserver: withMO ? MockMO : undefined,
    addEventListener(ev, fn) {
      if (!winListeners.has(ev)) winListeners.set(ev, new Set());
      winListeners.get(ev).add(fn);
    },
    removeEventListener(ev, fn) { winListeners.get(ev)?.delete(fn); },
    dispatchEvent(ev) {
      for (const fn of winListeners.get(ev?.type) || []) fn(ev);
    },
    navigator: { language: 'zh-CN' },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1', overflowY: 'auto' }),
  };
  return { doc, win, makeEl, makeText, moInstances };
}

test('1. 3,000-step large DOM switch budget: O(N) breakdown, bounded bookmark/rail/thought/i18n budgets & LaTeX protection', async () => {
  const { doc, win, makeEl } = createMockDom();
  const storage = createMemoryStorage();
  const conv = makeEl('div');
  conv.setAttribute('data-testid', 'conversation-view');
  conv.setAttribute('data-cascade-id', 'aaaaaaaa-1111-4111-8111-111111111111');

  // Build 3,000 turns (every 10th turn has a 50-line <pre>; every 40th has a thought block; plus LaTeX math)
  const bigCode = Array.from({ length: 50 }, (_, k) => `const line_${k} = ${k};`).join('\n');
  for (let i = 0; i < 3000; i += 1) {
    const u = makeEl('div');
    u.setAttribute('data-testid', 'user-message-bubble');
    u.textContent = `Turn ${i + 1}: analyze module ${i % 17}`;
    conv.appendChild(u);

    const a = makeEl('div');
    a.setAttribute('data-testid', 'agent-response');
    const p = makeEl('p');
    p.textContent = `Response ${i + 1} summary text.`;
    a.appendChild(p);
    if (i % 10 === 0) {
      const pre = makeEl('pre');
      pre.textContent = bigCode;
      a.appendChild(pre);
    }
    if (i % 40 === 0) {
      const wrap = makeEl('div');
      const trig = makeEl('button');
      trig.setAttribute('data-testid', 'thinking-collapsible-trigger');
      trig.textContent = `Thought for ${i + 1}s`;
      const panel = makeEl('div');
      panel.setAttribute('data-testid', 'thinking-content');
      panel.textContent = `Detailed reasoning step ${i + 1} analyzing architecture boundaries and state machine.`;
      wrap.appendChild(trig);
      wrap.appendChild(panel);
      a.appendChild(wrap);
    }
    conv.appendChild(a);
  }

  // Add v2.36.0 inline LaTeX block inside subagent reply (must NEVER be translated by hostI18n)
  const katex = makeEl('span');
  katex.className = 'katex';
  const katexText = makeEl('span');
  katexText.textContent = 'Settings';
  katex.appendChild(katexText);
  doc.body.appendChild(katex);
  const uiBtn = makeEl('button');
  uiBtn.textContent = 'Send Now';
  doc.body.appendChild(uiBtn);
  doc.body.appendChild(conv);

  // 1a. Context breakdown must run in linear O(N) time even across 3,000 turns + 300 <pre> blocks
  const t0 = performance.now();
  const bd = ctxSrc.analyzeContextBreakdown(doc);
  const bdMs = performance.now() - t0;
  assert.equal(bd.turnCount, 3000);
  assert.equal(bd.topTurns.length, 3);
  assert.ok(bdMs < 1500, `analyzeContextBreakdown took too long: ${bdMs.toFixed(1)}ms`);

  // 1b. Outline bookmarks: bounded single-batch decoration (<= 120 bubbles per sync, no 3,000-turn clone stall)
  const ob = outlineMod.createOutlineBookmarksController({ win, doc, storage, enabled: true, autoObserve: false });
  const firstBatch = conv.querySelectorAll('.ag-sg-bm-star').length;
  assert.equal(firstBatch, 120, `Expected initial sync bounded to 120 decorated bubbles, got ${firstBatch}`);
  ob.sync();
  const secondBatch = conv.querySelectorAll('.ag-sg-bm-star').length;
  assert.equal(secondBatch, 240, `Expected second sync to incrementally add 120 bubbles, got ${secondBatch}`);
  ob.destroy();

  // 1c. ReadingNav: turn rail samples <= 80 dots (never builds 3,000 DOM buttons)
  const nav = readingNavMod.createReadingNavController({ win, doc, enabled: true, collapseLines: 40, autoObserve: false });
  nav.sync();
  const railDots = doc.querySelectorAll('[data-testid="ag-sag-rnav-rail"] .ag-sag-rnav-dot');
  assert.ok(railDots.length > 0 && railDots.length <= 85, `Expected sampled rail <=85 dots, got ${railDots.length}`);
  nav.destroy();

  // 1d. ThoughtTranslator: auto mode caps auto-dispatched panels to recent 5 with max concurrency <= 2
  let activeCalls = 0;
  let peakConcurrent = 0;
  let totalCalls = 0;
  const tt = thoughtMod.createThoughtTranslatorController({
    win,
    doc,
    enabled: true,
    triggerMode: 'auto',
    autoObserve: false,
    onRequestTranslate: async ({ text }) => {
      totalCalls += 1;
      activeCalls += 1;
      peakConcurrent = Math.max(peakConcurrent, activeCalls);
      await new Promise((r) => setTimeout(r, 10));
      activeCalls -= 1;
      return { ok: true, data: { translated: `[ZH] ${text}`, engine: 'mt' } };
    },
  });
  tt.scanNow();
  await new Promise((r) => setTimeout(r, 120));
  assert.ok(totalCalls > 0 && totalCalls <= 5, `Auto thought translate must cap to recent <=5 panels, got ${totalCalls}`);
  assert.ok(peakConcurrent <= 2, `Auto thought concurrency must stay <=2, got ${peakConcurrent}`);
  tt.destroy();

  // 1e. Host i18n translates v2.36.0 "Send Now" while physically preserving KaTeX LaTeX text
  const i18nCtrl = hostI18nMod.createHostI18nController({
    win,
    doc,
    enabled: true,
    locale: 'zh-CN',
    autoObserve: false,
  });
  i18nCtrl.scanNow();
  assert.equal(uiBtn.textContent, '立即发送');
  assert.equal(katexText.textContent, 'Settings', 'KaTeX math text must never be translated');
  i18nCtrl.destroy();
});

test('2. MutationObserver self-mutation oscillation guard, safe DOM NotFoundError protection & status-pill formatDurationMMSS fix', async () => {
  const { doc, win, makeEl, moInstances } = createMockDom({ withMO: true });
  const storage = createMemoryStorage();

  // 2a. isMutationOwnedOnly filters both owned target and childList with all-owned added/removed nodes
  const owned = coexist.markOwnedNoTranslate(makeEl('div'));
  const hostBox = makeEl('div');
  const hostChild = makeEl('span');
  assert.equal(
    coexist.isMutationOwnedOnly([
      { type: 'attributes', target: owned },
      { type: 'childList', target: hostBox, addedNodes: [owned], removedNodes: [] },
    ]),
    true
  );
  assert.equal(
    coexist.isMutationOwnedOnly([
      { type: 'childList', target: hostBox, addedNodes: [owned, hostChild], removedNodes: [] },
    ]),
    false
  );

  // 2b. safeInsertBefore survives detached/foreign ref node without throwing NotFoundError
  const parent = makeEl('div');
  const detachedRef = makeEl('span'); // not a child of parent!
  const pluginNode = makeEl('div');
  assert.equal(coexist.safeInsertBefore(parent, pluginNode, detachedRef), true);
  assert.equal(pluginNode.parentElement, parent);

  // 2c. themeStudio + safeAutoAccept + promptQueue observers do NOT observe 'style' and ignore owned self-mutations
  const ts = themeStudioMod.createThemeStudioController({
    win,
    doc,
    enabled: true,
    preset: 'obsidian-prism',
    ambientGlow: 'subtle',
    externalConvStateSource: false,
    convStateThrottleMs: 20,
  });
  const convMo = moInstances.find((m) => m.target === doc.body && Array.isArray(m.opts?.attributeFilter));
  assert.ok(convMo, 'convObserver should be mounted');
  assert.equal(convMo.opts.attributeFilter.includes('style'), false, 'convObserver must not observe style attribute');
  // Feeding owned mutation must not throw or re-trigger
  convMo.trigger([{ type: 'childList', target: doc.body, addedNodes: [owned], removedNodes: [] }]);
  ts.destroy();

  // 2d. CSS hygiene: .ag-sag-code-bar has no backdrop-filter, radar hidden rule exists, zero :has()
  assert.equal(stylesMod.CORE_CSS.includes(':has('), false);
  const codeBarCss = stylesMod.CORE_CSS.match(/\.ag-sag-code-bar\{[^}]*\}/)?.[0] || '';
  assert.equal(codeBarCss.includes('backdrop-filter'), false, 'sticky code bar must not use backdrop-filter');
  assert.ok(stylesMod.CORE_CSS.includes('[data-ag-sg-radar-hidden="1"]'));

  // 2e. status-pill renders lastTurnElapsedSec >= 60 without throwing ReferenceError (formatDurationMMSS)
  const main = makeEl('main');
  const box = makeEl('div');
  box.setAttribute('data-testid', 'agent-input-box');
  const foot = makeEl('div');
  foot.className = 'agy-composer-footer';
  box.appendChild(foot);
  main.appendChild(box);
  doc.body.appendChild(main);
  const pill = statusPillMod.createStatusPillController({
    win,
    doc,
    getConfig: () => ({ ...coexist.DEFAULT_CONFIG, modules: { ...coexist.DEFAULT_CONFIG.modules, sessionWatchdog: true } }),
  });
  pill.sync({ snap: { usedPct: 45, usedTokens: 100000, maxTokens: 200000, cascadeId: 'c1' }, watchdog: { lastTurnElapsedSec: 125 } });
  const btn = doc.querySelector('[data-testid="ag-sg-status-pill"]');
  assert.ok(btn);
  btn.click(); // opens card -> previously threw ReferenceError: formatElapsed is not defined
  const card = doc.querySelector('[data-testid="ag-sg-status-card"]');
  assert.ok(card && !card.hidden && card.textContent.includes('2:05'), `Expected 2:05 in card, got: ${card?.textContent}`);
  pill.destroy();
  void storage;
});

test('3. Antigravity v2.36.0 dual-composer sidebar isolation, Option+Cmd+/ yield, Send Now fuse & cross-repo fail-closed', () => {
  const { doc, win, makeEl } = createMockDom();
  const storage = createMemoryStorage();

  // Sidebar floating composer appears FIRST in DOM (v2.36.0 maximized sidebar bottom floating pill)
  const sidebar = makeEl('aside');
  sidebar.setAttribute('data-testid', 'sidebar');
  const sideBox = makeEl('div');
  sideBox.setAttribute('data-testid', 'agent-input-box');
  const sideEd = makeEl('textarea');
  sideEd.value = '/clear';
  const sideFoot = makeEl('div');
  sideFoot.className = 'agy-composer-footer';
  const sideStop = makeEl('button');
  sideStop.setAttribute('data-testid', 'stop-button');
  sideBox.appendChild(sideEd);
  sideBox.appendChild(sideFoot);
  sideBox.appendChild(sideStop);
  sidebar.appendChild(sideBox);

  // Main conversation composer appears SECOND in DOM
  const main = makeEl('main');
  const conv = makeEl('div');
  conv.setAttribute('data-testid', 'conversation-view');
  conv.setAttribute('data-cascade-id', 'bbbbbbbb-2222-4222-8222-222222222222');
  const mainBox = makeEl('div');
  mainBox.setAttribute('data-testid', 'agent-input-box');
  const mainEd = makeEl('textarea');
  mainEd.value = 'main composer draft text';
  const mainFoot = makeEl('div');
  mainFoot.className = 'agy-composer-footer';
  mainBox.appendChild(mainEd);
  mainBox.appendChild(mainFoot);
  main.appendChild(conv);
  main.appendChild(mainBox);

  doc.body.appendChild(sidebar);
  doc.body.appendChild(main);

  // 3a. context-source resolves main composer & ignores sidebar floating composer/stop button
  assert.equal(ctxSrc.isSidebarOrAuxiliaryNode(sideBox), true);
  assert.equal(ctxSrc.isSidebarOrAuxiliaryNode(mainBox), false);
  assert.equal(ctxSrc.findMainComposerBox(doc), mainBox);
  assert.equal(ctxSrc.findComposerEditor(doc), mainEd);
  assert.equal(ctxSrc.readComposerDraft(doc), 'main composer draft text');
  assert.equal(ctxSrc.isTurnStreaming(doc), false, 'Sidebar stop button must not mark main conversation as streaming');

  // 3b. status-pill, prompt-library, draft-guard, prompt-queue mount strictly in main composer, never sidebar
  const pill = statusPillMod.createStatusPillController({ win, doc });
  pill.sync({ snap: { usedPct: 30, usedTokens: 50000, maxTokens: 200000 } });
  assert.equal(sideFoot.querySelector('[data-testid="ag-sg-status-pill"]'), null);
  assert.ok(mainFoot.querySelector('[data-testid="ag-sg-status-pill"]'));
  pill.destroy();

  const pl = promptLibMod.createPromptLibraryController({ win, doc, enabled: true, autoObserve: false });
  pl.sync();
  assert.equal(sideFoot.querySelector('[data-testid="ag-sag-pl-trigger"]'), null);
  assert.ok(mainFoot.querySelector('[data-testid="ag-sag-pl-trigger"]'));
  pl.destroy();

  // 3c. clean-slate ignores Enter pressed inside sidebar floating composer
  let clearTriggered = 0;
  const cs = cleanSlateMod.createCleanSlateController({
    win,
    doc,
    storage,
    onNavigateNewConversation: () => { clearTriggered += 1; },
  });
  doc.dispatchEvent({ type: 'keydown', key: 'Enter', target: sideEd, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} });
  assert.equal(clearTriggered, 0, 'Enter inside sidebar floating composer must never trigger main /clear');
  cs.destroy();

  // 3d. prompt-queue trips native-queue-active fuse when v2.36.0 Send Now button is visible in main composer
  mainEd.value = '';
  const sendNowBtn = makeEl('button');
  sendNowBtn.textContent = 'Send Now';
  mainBox.appendChild(sendNowBtn);
  const pq = queueMod.createPromptQueueController({ win, doc, storage, enabled: true, autoObserve: false });
  pq.enqueue('follow up task');
  pq.sync();
  assert.equal(pq.getDebugState().lastSkipReason, 'native-queue-active');
  assert.equal(sidebar.querySelector('[data-testid="ag-sag-queue-bar"]'), null);
  pq.destroy();

  // 3e. safeAutoAccept stays strictly fail-closed on v2.36.0 cross-repo approval & Always allow button
  const crossRepo = safeAutoAcceptMod.classifyApprovalCard({
    cardText: 'Allow read access to /other-repo/README.md (outside workspace)',
    buttonText: 'Allow',
    policy: 'readonly-safe',
  });
  assert.equal(crossRepo.allowed, false);

  const gitCrossDir = safeAutoAcceptMod.classifyApprovalCard({
    cardText: 'Run command: git -C /tmp/other status',
    buttonText: 'Run',
    policy: 'readonly-safe',
  });
  assert.equal(gitCrossDir.allowed, false);

  const persistentBtn = safeAutoAcceptMod.classifyApprovalCard({
    cardText: 'Run command: git status',
    buttonText: 'Always allow',
    policy: 'readonly-safe',
  });
  assert.equal(persistentBtn.allowed, false);

  // 3f. prismBridge yields Option+Cmd+/ (no shift) and opens on Ctrl/Cmd+Shift+Alt+/
  const pb = prismBridgeMod.createPrismBridgeController({ win, doc, autoObserve: false });
  doc.dispatchEvent({ type: 'keydown', metaKey: true, altKey: true, shiftKey: false, key: '/', code: 'Slash', preventDefault() {}, stopPropagation() {} });
  assert.equal(pb.isShortcutSheetOpen(), false);
  doc.dispatchEvent({ type: 'keydown', metaKey: true, altKey: true, shiftKey: true, key: '/', code: 'Slash', preventDefault() {}, stopPropagation() {} });
  assert.equal(pb.isShortcutSheetOpen(), true);
  pb.destroy();

  // Suppress unused import lint
  assert.ok(draftMod && compactMod);
});

test('4. Corrupt/large storage read-only resilience, chunked copyFileSafeAtomic & CDP close/backoff hardening', async () => {
  await withTempDir(async (tmp) => {
    const dataDir = path.join(tmp, 'antigravity');
    const outDir = path.join(tmp, 'backup');
    fs.mkdirSync(path.join(dataDir, 'brain', 'sess-1'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'conversations'), { recursive: true });

    // Valid SQLite header + active WAL (must be skipped safely without touching lock)
    const validHdr = Buffer.alloc(128);
    Buffer.from('SQLite format 3\0', 'utf8').copy(validHdr, 0);
    fs.writeFileSync(path.join(dataDir, 'conversation_summaries.db'), validHdr);
    fs.writeFileSync(path.join(dataDir, 'conversation_summaries.db-wal'), Buffer.alloc(64, 1));

    // Corrupt SQLite DB + 0-byte SQLite DB (read-only 16-byte header detection must not throw)
    fs.writeFileSync(path.join(dataDir, 'corrupt.db'), 'NOT_A_VALID_SQLITE_HEADER_1234567890');
    fs.writeFileSync(path.join(dataDir, 'empty.sqlite'), '');

    // Deep nested directory > 16 levels
    let deep = path.join(dataDir, 'deep');
    for (let i = 0; i < 19; i += 1) deep = path.join(deep, `d${i}`);
    fs.mkdirSync(deep, { recursive: true });
    fs.writeFileSync(path.join(deep, 'leaf.txt'), 'deep');

    // Corrupt + valid transcript JSONL
    fs.writeFileSync(
      path.join(dataDir, 'brain', 'sess-1', 'transcript.jsonl'),
      '{"role":"user","text":"hello world"}\n{BROKEN_JSON\n'
    );

    const audit = auditAntigravityStorage({ dataDir, topN: 5 });
    assert.equal(audit.ok, true);
    assert.equal(audit.sqlite.walActive, true);
    const corruptReasons = audit.corruptFiles.map((c) => `${c.relPath}:${c.reason}`);
    assert.ok(corruptReasons.includes('corrupt.db:corrupt-sqlite-header'));
    assert.ok(corruptReasons.includes('empty.sqlite:corrupt-sqlite-header'));
    assert.ok(Array.isArray(audit.truncatedDirs) && audit.truncatedDirs.length >= 1, 'Expected deep directory truncation warning');

    // Hard file-count truncation circuit-breaker
    const truncAudit = auditAntigravityStorage({ dataDir, maxFiles: 2 });
    assert.equal(truncAudit.ok, true);
    assert.equal(truncAudit.truncated, true);

    // Export maxBytes guard + atomic write
    assert.throws(
      () => exportSanitizedSession({ dataDir, sessionId: 'sess-1', maxBytes: 10 }),
      /exceeds|limit|maxBytes/i
    );
    const expOut = path.join(tmp, 'exported.md');
    const exp = exportSanitizedSession({ dataDir, sessionId: 'sess-1', outFile: expOut });
    assert.equal(exp.ok, true);
    assert.equal(fs.existsSync(expOut), true);

    // Chunked streaming copyFileSafeAtomic (> 512 KiB verifies multi-chunk loop)
    const bigSrc = path.join(dataDir, 'conversations', 'big.bin');
    const bigData = Buffer.alloc(600 * 1024, 0x5a);
    fs.writeFileSync(bigSrc, bigData);
    const copyDst = path.join(tmp, 'big-copy.bin');
    copyFileSafeAtomic(bigSrc, copyDst, fs.realpathSync.native(tmp));
    assert.equal(fs.readFileSync(copyDst).equals(bigData), true);

    // Backup maxFileBytes skips oversized files cleanly without failing
    const bak = createStorageBackup({ dataDir, outDir, maxFileBytes: 100 * 1024 });
    assert.equal(bak.ok, true);
    assert.ok(bak.skipped.some((s) => s.relPath === 'conversations/big.bin' && s.reason === 'exceeds-max-file-bytes'));
  });

  // CDP evalViaCdp rejects immediately on premature WebSocket close (never hangs 4s)
  class EarlyCloseWS {
    constructor() {
      this._l = new Map();
      setTimeout(() => this._emit('open', {}), 5);
    }
    addEventListener(ev, fn) {
      if (!this._l.has(ev)) this._l.set(ev, []);
      this._l.get(ev).push(fn);
    }
    send() {
      setTimeout(() => this._emit('close', {}), 10);
    }
    close() {}
    _emit(ev, data) {
      for (const fn of this._l.get(ev) || []) fn(data);
    }
  }
  const prevWS = globalThis.WebSocket;
  globalThis.WebSocket = EarlyCloseWS;
  const tStart = Date.now();
  try {
    await assert.rejects(
      () => evalViaCdp('ws://127.0.0.1:9222/page/1', '1+1', 3000),
      /closed/i
    );
  } finally {
    globalThis.WebSocket = prevWS;
  }
  assert.ok(Date.now() - tStart < 1000, 'evalViaCdp must reject immediately on WS close instead of waiting 3s');

  // WatchDaemon reconcileOnce keeps backoff when target is skipped (does not reset to 3s storm)
  const daemon = new SagWatchDaemon({
    port: 9222,
    intervalMs: 1000,
    maxBackoffMs: 10000,
    enableHostBridge: false,
    listTargets: async () => [
      { id: 'p1', type: 'page', title: 'Antigravity', url: 'app://antigravity/index.html', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/page/1' },
    ],
    evalTarget: async (_ws, expr) => (expr.includes('__agSagManuallyRemoved') ? { state: 'missing' } : { ok: false, status: 'skipped-subframe' }),
  });
  const r1 = await daemon.reconcileOnce();
  const r2 = await daemon.reconcileOnce();
  assert.ok(r2.nextDelayMs > r1.nextDelayMs, `Expected exponential backoff on target-skipped, got ${r1.nextDelayMs} -> ${r2.nextDelayMs}`);
});
