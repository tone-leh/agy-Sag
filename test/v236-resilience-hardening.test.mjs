import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

import {
  auditAntigravityStorage,
  createStorageBackup,
  exportSanitizedSession,
} from '../cli/storage-doctor.mjs';
import { copyFileSafeAtomic } from '../cli/platform-utils.mjs';
import { evalViaCdp } from '../cli/cdp-attach.mjs';
import { SagWatchDaemon } from '../cli/watch-daemon.mjs';
import { buildInjectExpression, readCoreSources } from '../cli/bundle.mjs';
import { TranslatorService, validateEndpointUrl } from '../cli/translator-service.mjs';
import { executeLaunchPlan } from '../cli/launcher.mjs';

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

  // 3d. prompt-queue trips native-queue-active fuse across all 10 language variants of Send Now
  mainEd.value = '';
  const sendNowBtn = makeEl('button');
  sendNowBtn.textContent = 'Send Now';
  mainBox.appendChild(sendNowBtn);
  const pq = queueMod.createPromptQueueController({ win, doc, storage, enabled: true, autoObserve: false });
  pq.enqueue('follow up task');
  for (const label of ['Send Now', '立即发送', '立即傳送', '今すぐ送信', '지금 보내기', 'Enviar ahora', 'Envoyer maintenant', 'Jetzt senden', 'Отправить сейчас', 'Enviar agora']) {
    sendNowBtn.textContent = label;
    pq.sync();
    assert.equal(pq.getDebugState().lastSkipReason, 'native-queue-active', `Send Now fuse must trip for locale label: ${label}`);
  }
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

test('5. Round-2 Core hardening: side-panel-focus-scope main composer, sibling Theme CSS, thought recovery/epoch, draft hydration grace, host-i18n flushGen & shared MutationBus', async () => {
  const { doc, win, makeEl, moInstances } = createMockDom({ withMO: true });
  const storage = createMemoryStorage();

  // 5a. [P0-1] data-side-panel-focus-scope="true" wrapping main composer (Agent side panel / workbench) must NOT be misclassified as sidebar
  const agentPane = makeEl('div');
  agentPane.setAttribute('data-testid', 'split-pane');
  const conv = makeEl('div');
  conv.setAttribute('data-testid', 'conversation-view');
  conv.setAttribute('data-cascade-id', 'cid-r2-a');
  const focusScope = makeEl('div');
  focusScope.setAttribute('data-side-panel-focus-scope', 'true');
  const mainBox = makeEl('div');
  mainBox.setAttribute('data-testid', 'agent-input-box');
  const mainEd = makeEl('div');
  mainEd.setAttribute('data-lexical-editor', 'true');
  mainEd.setAttribute('contenteditable', 'true');
  mainEd.textContent = 'existing lexical text';
  mainBox.appendChild(mainEd);
  focusScope.appendChild(mainBox);
  agentPane.appendChild(conv);
  agentPane.appendChild(focusScope);
  doc.body.appendChild(agentPane);

  assert.equal(ctxSrc.isSidebarOrAuxiliaryNode(mainBox), false, 'Main composer inside data-side-panel-focus-scope must not be treated as sidebar');
  assert.equal(ctxSrc.findMainComposerBox(doc), mainBox);
  assert.equal(ctxSrc.findComposerEditor(doc), mainEd);

  // Lexical protection: without execCommand/InputEvent support, writeComposerTextSafely must NOT clobber Lexical DOM via textContent
  const lexRes = coexist.writeComposerTextSafely(doc, win, mainEd, 'overwrite attempt', { replace: true });
  assert.equal(lexRes, false, 'Lexical editor without execCommand must refuse raw textContent overwrite');
  assert.equal(mainEd.textContent, 'existing lexical text');

  // 5b. [P0-2] ThemeStudio CSS targets sibling [data-testid="agent-input-box"] without requiring <main> ancestor, and explicitly resets sidebar boxes (zero :has())
  const ts = themeStudioMod.createThemeStudioController({
    win,
    doc,
    enabled: true,
    preset: 'obsidian-prism',
    surface: 'smoked',
    corners: 'soft',
  });
  const themeStyleEl = doc.getElementById('ag-sag-theme-css');
  assert.ok(themeStyleEl && themeStyleEl.textContent.length > 0);
  assert.equal(themeStyleEl.textContent.includes(':has('), false, 'ThemeStudio CSS must keep zero :has()');
  assert.ok(
    themeStyleEl.textContent.includes('[data-testid="agent-input-box"]:not([data-testid*="floating"]):not([data-testid*="sidebar"])'),
    'ThemeStudio CSS must hit sibling agent-input-box directly without <main> requirement'
  );
  assert.ok(
    themeStyleEl.textContent.includes('[data-testid="conversation-list-sidebar"] [data-testid="agent-input-box"]'),
    'ThemeStudio CSS must explicitly reset sidebar floating composer boxes'
  );
  ts.destroy();

  // 5c. [P0-3] ThoughtTranslator: cleanupDom resets panelState so Prism yield recovery works, and stale runEpoch blocks late async writeback
  const thoughtWrap = makeEl('div');
  const thoughtBtn = makeEl('button');
  thoughtBtn.setAttribute('data-testid', 'thinking-collapsible-trigger');
  thoughtBtn.setAttribute('aria-expanded', 'true');
  thoughtBtn.textContent = 'Thought for 3s';
  const thoughtPanel = makeEl('div');
  thoughtPanel.setAttribute('data-testid', 'thinking-content');
  const thoughtP = makeEl('p');
  thoughtP.textContent = 'Inspecting concurrent queue handoff and validating state transitions.';
  thoughtPanel.appendChild(thoughtP);
  thoughtWrap.appendChild(thoughtBtn);
  thoughtWrap.appendChild(thoughtPanel);
  conv.appendChild(thoughtWrap);

  let releaseFirst = null;
  let reqCount = 0;
  const tt = thoughtMod.createThoughtTranslatorController({
    win,
    doc,
    enabled: true,
    triggerMode: 'auto',
    viewMode: 'translated',
    autoObserve: false,
    onRequestTranslate: ({ text }) => {
      reqCount += 1;
      if (reqCount === 1) {
        return new Promise((resolve) => {
          releaseFirst = () => resolve({ ok: true, data: { translated: 'STALE WRITEBACK', engine: 'mt' } });
        });
      }
      return Promise.resolve({ ok: true, data: { translated: `译文:${text}`, engine: 'mt' } });
    },
  });
  tt.scanNow();
  assert.equal(reqCount, 1);
  // Prism takes over while request #1 is in flight -> increments runEpoch and cleans DOM
  doc.documentElement.setAttribute('data-ag-prism-thought-owner', 'obsidian-prism-thought');
  tt.scanNow();
  assert.equal(tt.getDebugState().yieldedToPrism, true);
  // Late response #1 arrives while yielded -> must NOT inject or hide source
  releaseFirst();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(thoughtPanel.querySelector('[data-testid="ag-sag-thought-box"]'), null, 'Stale in-flight response must not write back during Prism yield');
  assert.equal(thoughtPanel.getAttribute('data-ag-sag-thought-hide-src'), null);

  // Prism yields back -> panelState was reset so thought translates cleanly on recovery
  doc.documentElement.removeAttribute('data-ag-prism-thought-owner');
  tt.scanNow();
  await new Promise((r) => setTimeout(r, 20));
  const recoveredBox = thoughtPanel.querySelector('[data-testid="ag-sag-thought-box"]');
  assert.ok(recoveredBox && recoveredBox.textContent.includes('译文:Inspecting concurrent queue handoff'), 'Must recover cleanly after Prism yield');
  assert.equal(thoughtPanel.getAttribute('data-ag-sag-thought-hide-src'), '1');
  assert.ok(!thoughtP.style.display, 'Must keep host thought paragraph inline style untouched');
  tt.destroy();

  // 5d. [P1-1] DraftGuard 350ms hydration grace prevents flicker & accidental clear on tab switch + isolates sidebar send click
  const taDom = createMockDom();
  const taWrap = taDom.makeEl('div');
  const taBox = taDom.makeEl('div');
  taBox.setAttribute('data-testid', 'agent-input-box');
  const ta = taDom.makeEl('textarea');
  ta.value = 'Unsent draft for session B';
  taBox.appendChild(ta);
  taWrap.appendChild(taBox);
  const CID_A = 'aaaaaaaa-1111-4111-8111-111111111111';
  const CID_B = 'bbbbbbbb-2222-4222-8222-222222222222';
  const taConv = taDom.makeEl('div');
  taConv.setAttribute('data-testid', 'conversation-view');
  taConv.setAttribute('data-cascade-id', CID_B);
  taDom.doc.body.appendChild(taConv);
  taDom.doc.body.appendChild(taWrap);

  const sidebarAside = taDom.makeEl('aside');
  const sidebarSendBtn = taDom.makeEl('button');
  sidebarSendBtn.setAttribute('data-testid', 'send-button');
  sidebarAside.appendChild(sidebarSendBtn);
  taDom.doc.body.appendChild(sidebarAside);

  const dg = draftMod.createDraftGuardController({
    win: taDom.win,
    doc: taDom.doc,
    storage,
    enabled: true,
    debounceMs: 0,
    hydrationGraceMs: 80,
  });
  dg.flushNow();
  assert.ok(draftMod.loadDraft(storage, CID_B)?.text === 'Unsent draft for session B');

  // Clicking send inside sidebar must NOT wipe main session draft
  taDom.doc.dispatchEvent({ type: 'click', target: sidebarSendBtn });
  assert.equal(draftMod.loadDraft(storage, CID_B)?.text, 'Unsent draft for session B', 'Sidebar send click must not clear main draft');

  // Switch CID_B -> CID_A -> back to CID_B with empty composer (simulating v2.36 async native hydration)
  taConv.setAttribute('data-cascade-id', CID_A);
  ta.value = '';
  dg.sync();
  taConv.setAttribute('data-cascade-id', CID_B);
  dg.sync();
  // Immediately after switching back (inside hydration grace): restore bar stays hidden and flushNow must NOT delete stored draft
  dg.flushNow();
  assert.equal(draftMod.loadDraft(storage, CID_B)?.text, 'Unsent draft for session B', 'Hydration grace must prevent accidental clearDraft');
  const barDuringGrace = taDom.doc.querySelector('[data-testid="ag-sg-draft-bar"]');
  assert.equal(Boolean(barDuringGrace && !barDuringGrace.hidden), false, 'Restore bar must stay hidden during hydration grace');
  await new Promise((r) => setTimeout(r, 110));
  const barAfterGrace = taDom.doc.querySelector('[data-testid="ag-sg-draft-bar"]');
  assert.ok(barAfterGrace && !barAfterGrace.hidden, 'Restore bar should appear smoothly after hydration grace if still empty');
  dg.destroy();

  // 5e. [P1-2] HostI18n flushGen prevents ghost writeback after restoreAll()
  const i18nDom = createMockDom({ withMO: true });
  const btns = [];
  for (let i = 0; i < 700; i += 1) {
    const b = i18nDom.makeEl('button');
    b.textContent = 'Settings';
    i18nDom.doc.body.appendChild(b);
    btns.push(b);
  }
  const i18nCtrl = hostI18nMod.createHostI18nController({
    win: i18nDom.win,
    doc: i18nDom.doc,
    coexist,
    enabled: true,
    locale: 'zh-CN',
    autoObserve: false,
  });
  i18nCtrl.scheduleScan();
  // Restore immediately while remaining slice (>600 nodes) is pending
  i18nCtrl.restoreAll();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(btns[0].textContent, 'Settings');
  assert.equal(btns[699].textContent, 'Settings', 'Pending slice after restoreAll() must not ghost-translate');
  i18nCtrl.destroy();

  // 5f. Shared DomMutationBus & HtmlAttrBus: multiple subscribers share 1 underlying MO and wake on resume
  const busDom = createMockDom({ withMO: true });
  const domBus = coexist.getDomMutationBus(busDom.doc, busDom.win);
  const attrBus = coexist.getHtmlAttrBus(busDom.doc, busDom.win);
  let wokeCount = 0;
  let attrHits = 0;
  const unsub1 = domBus.subscribe('m1', (_recs, meta) => { if (meta?.woken) wokeCount += 1; }, { wakeOnResume: true });
  const unsub2 = domBus.subscribe('m2', (_recs, meta) => { if (meta?.woken) wokeCount += 1; }, { wakeOnResume: true });
  const unsubA1 = attrBus.subscribe('a1', (set) => { if (set.has('data-ag-sag-lang')) attrHits += 1; }, { attributeFilter: ['data-ag-sag-lang'] });
  const unsubA2 = attrBus.subscribe('a2', (set) => { if (set.has('lang')) attrHits += 1; }, { attributeFilter: ['lang'] });
  assert.equal(busDom.moInstances.length, 2, '4 subscribers across 2 buses must allocate only 2 underlying MutationObservers');

  // Hibernated mutation queues wake-up replay on focus
  busDom.doc.hidden = true;
  const hostMutEl = busDom.makeEl('div');
  busDom.moInstances[0].trigger([{ type: 'childList', target: busDom.doc.body, addedNodes: [hostMutEl], removedNodes: [] }]);
  assert.equal(wokeCount, 0);
  busDom.doc.hidden = false;
  busDom.doc.dispatchEvent({ type: 'visibilitychange' });
  assert.equal(wokeCount, 2, 'Wake-up must replay to both subscribers');

  // HtmlAttrBus routes matching attributeFilter subsets
  busDom.moInstances[1].trigger([{ type: 'attributes', target: busDom.doc.documentElement, attributeName: 'data-ag-sag-lang' }]);
  assert.equal(attrHits, 1);

  unsub1();
  unsub2();
  unsubA1();
  unsubA2();
  assert.equal(domBus.getDebugState().observing, false, 'DomMutationBus must disconnect when last subscriber leaves');
  assert.equal(domBus.getDebugState().subscriberCount, 0);
  assert.equal(attrBus.getDebugState().observing, false, 'HtmlAttrBus must disconnect when last subscriber leaves');
  assert.equal(attrBus.getDebugState().subscriberCount, 0);
  void moInstances;
});

test('6. Round-2 CLI & Bundle hardening: fail-closed truncation orphans, backup live WAL/maxBytes, sandbox bundle lossless VM parity, translator slot handoff & launcher check', async () => {
  // 6a. [P0] storage-doctor: maxFiles/maxDurationMs truncation skips orphan classification fail-closed; copyFileSafeAtomic enforces maxBytes
  withTempDir((tmp) => {
    const dataDir = path.join(tmp, 'ag-data');
    const outDir = path.join(tmp, 'backup');
    fs.mkdirSync(path.join(dataDir, 'conversations'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'brain', 'sess-active', 'sub'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'conversations', 'sess-active.pb'), Buffer.alloc(64, 1));
    fs.writeFileSync(path.join(dataDir, 'brain', 'sess-active', 'sub', 'transcript.jsonl'), '{"step":1}\n');
    // Active SQLite DB with non-empty WAL companion
    fs.writeFileSync(path.join(dataDir, 'live.sqlite'), Buffer.from('SQLite format 3\0' + 'x'.repeat(200)));
    fs.writeFileSync(path.join(dataDir, 'live.sqlite-wal'), Buffer.alloc(64, 7));

    // Truncated audit (maxFiles: 1) must fail-closed: orphans === [] and warning recorded
    const truncAudit = auditAntigravityStorage({ dataDir, maxFiles: 1 });
    assert.equal(truncAudit.truncated, true);
    assert.deepEqual(truncAudit.orphans, [], 'Truncated audit must not misclassify unscanned sessions as orphans');
    assert.ok(truncAudit.warnings.some((w) => /orphan/i.test(w)));

    // Full audit confirms sess-active is NOT orphan
    const fullAudit = auditAntigravityStorage({ dataDir });
    assert.equal(fullAudit.truncated, false);
    assert.deepEqual(fullAudit.orphans, []);

    // Backup skips active WAL-locked sqlite via direct live check
    const bak = createStorageBackup({ dataDir, outDir });
    assert.equal(bak.ok, true);
    assert.ok(bak.skipped.some((s) => s.relPath === 'live.sqlite' && /sqlite-wal-active/i.test(s.reason)));

    // copyFileSafeAtomic enforces maxBytes hard ceiling and leaves no temp file behind
    const bigSrc = path.join(tmp, 'over.bin');
    const bigDst = path.join(tmp, 'over-copy.bin');
    fs.writeFileSync(bigSrc, Buffer.alloc(1024, 0x41));
    assert.throws(
      () => copyFileSafeAtomic(bigSrc, bigDst, fs.realpathSync.native(tmp), { maxBytes: 256 }),
      /maxBytes|exceeds|limit/i
    );
    assert.equal(fs.existsSync(bigDst), false, 'Aborted copyFileSafeAtomic must not leave destination file');
  });

  // 6b. [P0/P1] bundle.mjs: VM lossless parity + safe handling of \uE000 / unicode escapes / CSS backslashes + budget bounds
  const ruSyncExpr = buildInjectExpression({ hostI18nLocale: 'ru' }, { deferExtPack: false });
  const ruDeferExpr = buildInjectExpression({ hostI18nLocale: 'ru' }, { deferExtPack: true });
  const ruSyncBytes = Buffer.byteLength(ruSyncExpr, 'utf8');
  const ruDeferBytes = Buffer.byteLength(ruDeferExpr, 'utf8');
  assert.ok(ruSyncBytes <= 1_540_000, `ruSync bundle exceeds 1.54MB budget: ${ruSyncBytes}`);
  assert.ok(ruDeferBytes < 960_000, `ruDefer bundle exceeds 960KB budget: ${ruDeferBytes}`);

  // Custom parts containing \uE000 PUA char, \u2026 escape, and CSS backslash \2022 must survive round-trip losslessly
  const customParts = readCoreSources().map((p) => {
    if (p.file === 'styles.js') {
      return {
        ...p,
        code: p.code.replace(
          'const CORE_CSS = `',
          'const CORE_CSS = `/* keep-in-str */ .x::before{content:"\\\\2022 \\uE000";--empty-v: ;}\n'
        ),
      };
    }
    return p;
  });
  const packedCustom = buildInjectExpression(null, { parts: customParts, deferExtPack: true });
  const { doc: sbDoc } = createMockDom();
  const sandboxWin = {
    document: sbDoc,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Event,
    navigator: { language: 'en-US' },
    addEventListener() {},
    removeEventListener() {},
  };
  sandboxWin.window = sandboxWin;
  sandboxWin.globalThis = sandboxWin;
  vm.runInNewContext(packedCustom, sandboxWin, { timeout: 2000 });
  const cssRuntime = sandboxWin.__agSgStyles?.CORE_CSS || '';
  sandboxWin.__agSag?.destroy?.();
  assert.ok(cssRuntime.includes('content:"\\2022 \uE000"'), 'Packer must preserve CSS backslash escapes and existing PUA chars losslessly');
  assert.ok(cssRuntime.includes('--empty-v: ;'), 'CSS minifier must preserve empty custom property value');

  // 6c. [P1] TranslatorService strict concurrency cap (<= 3, no microtask race) & full fe80::/10 IPv6 SSRF block
  assert.equal(validateEndpointUrl('http://[febf::1]/v1/chat').ok, false, 'fe80::/10 range (febf::1) must be blocked');
  assert.equal(validateEndpointUrl('http://[fe90::1]/v1/chat').ok, false, 'fe80::/10 range (fe90::1) must be blocked');

  let live = 0;
  let peak = 0;
  const svc = new TranslatorService({
    fetchFn: async () => {
      live += 1;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 12));
      live -= 1;
      return {
        ok: true,
        status: 200,
        headers: new Map(),
        body: null,
        text: async () => JSON.stringify([[['ok', 'src']]]),
      };
    },
  });
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, idx) =>
      svc.translate({ engine: 'mt', text: `sample text ${idx}`, targetLang: 'zh-CN' })
    )
  );
  assert.equal(results.every((r) => r.ok), true);
  assert.ok(peak <= 3, `TranslatorService peak concurrency must never exceed 3, got ${peak}`);

  // 6d. [P2] Launcher rejects explicit missing executable path fail-closed
  const missingPlan = {
    ok: true,
    platform: 'linux',
    executableFound: false,
    executablePath: '/nonexistent/path/to/antigravity-bin',
    launchSpec: { command: '/nonexistent/path/to/antigravity-bin', args: ['--remote-debugging-port=9222'] },
  };
  const launchRes = await executeLaunchPlan(missingPlan, { execute: true });
  assert.equal(launchRes.ok, false);
  assert.equal(launchRes.code, 'EXECUTABLE_NOT_FOUND');
});
