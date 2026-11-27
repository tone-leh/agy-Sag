import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const saaMod = require('../packages/core/safe-auto-accept.js');
const pqMod = require('../packages/core/prompt-queue.js');
const cgMod = require('../packages/core/compact-guard.js');
const hostI18nMod = require('../packages/core/host-i18n.js');
const packsMod = require('../packages/core/host-i18n-packs.js');
const promptLibMod = require('../packages/core/prompt-library.js');
const readingNavMod = require('../packages/core/reading-nav.js');
const themeStudioMod = require('../packages/core/theme-studio.js');
const prismBridgeMod = require('../packages/core/prism-bridge.js');
const core = require('../packages/core/index.js');
const coexist = require('../packages/core/coexist.js');

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

function createRichDom() {
  const matchesSingle = (el, raw) => {
    const s = raw.trim();
    if (!s || s === '*') return Boolean(s);
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
    for (const m of rest.matchAll(/\[([^\]=*^$]+)(?:(\*|\^|\$)?="([^"]*)")?(?:\s+i)?\]/g)) {
      const attrName = m[1];
      const op = m[2] || '';
      const expected = m[3];
      if (!el.hasAttribute(attrName)) return false;
      if (expected !== undefined) {
        const actual = String(el.getAttribute(attrName) || '');
        if (op === '*') {
          if (!actual.toLowerCase().includes(expected.toLowerCase())) return false;
        } else if (op === '^') {
          if (!actual.startsWith(expected)) return false;
        } else if (op === '$') {
          if (!actual.endsWith(expected)) return false;
        } else if (actual !== expected) {
          return false;
        }
      }
    }
    return true;
  };

  const matches = (el, selList) =>
    selList.split(',').some((raw) => {
      const parts = raw.trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) return false;
      if (!matchesSingle(el, parts[parts.length - 1])) return false;
      let cur = el.parentElement;
      for (let i = parts.length - 2; i >= 0; i -= 1) {
        let ok = false;
        while (cur) {
          if (matchesSingle(cur, parts[i])) {
            ok = true;
            cur = cur.parentElement;
            break;
          }
          cur = cur.parentElement;
        }
        if (!ok) return false;
      }
      return true;
    });

  const makeText = (val) => {
    const tn = {
      nodeType: 3,
      _val: String(val ?? ''),
      parentNode: null,
      parentElement: null,
      get nodeValue() { return tn._val; },
      set nodeValue(v) { tn._val = String(v ?? ''); },
      get textContent() { return tn._val; },
      set textContent(v) { tn._val = String(v ?? ''); },
      remove() { tn.parentNode?.removeChild?.(tn); },
    };
    return tn;
  };

  const makeShadowRoot = (host) => {
    const sr = {
      nodeType: 11,
      host,
      childNodes: [],
      get children() { return sr.childNodes.filter((n) => n.nodeType === 1); },
      appendChild(c) {
        if (c.parentNode) c.remove?.();
        c.parentNode = sr;
        c.parentElement = null;
        sr.childNodes.push(c);
        return c;
      },
      removeChild(c) {
        sr.childNodes = sr.childNodes.filter((x) => x !== c);
        c.parentNode = null;
        c.parentElement = null;
        return c;
      },
    };
    return sr;
  };

  const makeEl = (tag, initialText) => {
    const attrs = new Map();
    const cls = new Set();
    const ls = new Map();
    const el = {
      tagName: String(tag).toUpperCase(),
      nodeType: 1,
      id: '',
      type: '',
      value: '',
      hidden: false,
      disabled: false,
      open: false,
      scrollTop: 0,
      scrollHeight: 0,
      clientHeight: 0,
      style: {},
      shadowRoot: null,
      childNodes: [],
      parentElement: null,
      parentNode: null,
      get isConnected() {
        let p = el;
        while (p) {
          if (p === doc.documentElement) return true;
          p = p.parentElement || (p.parentNode?.host ? p.parentNode.host : null);
        }
        return false;
      },
      get children() { return el.childNodes.filter((n) => n.nodeType === 1); },
      get firstChild() { return el.childNodes[0] || null; },
      get attributes() { return Array.from(attrs.entries()).map(([name, value]) => ({ name, value })); },
      get className() { return [...cls].join(' '); },
      set className(v) {
        cls.clear();
        String(v || '').split(/\s+/).filter(Boolean).forEach((c) => cls.add(c));
      },
      classList: {
        add: (...a) => a.forEach((c) => c && cls.add(c)),
        remove: (...a) => a.forEach((c) => cls.delete(c)),
        contains: (c) => cls.has(c),
      },
      get textContent() {
        return el.childNodes.map((n) => (n.nodeType === 3 ? n.nodeValue : n.textContent)).join('');
      },
      set textContent(v) {
        for (const c of el.childNodes) {
          c.parentElement = null;
          c.parentNode = null;
        }
        el.childNodes = [];
        if (v !== '' && v !== null && v !== undefined) {
          el.appendChild(makeText(v));
        }
      },
      setAttribute(k, v) {
        attrs.set(k, String(v));
        if (k === 'id') el.id = String(v);
        if (k === 'class') el.className = String(v);
        if (k === 'type') el.type = String(v);
      },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      hasAttribute(k) { return attrs.has(k); },
      removeAttribute(k) {
        attrs.delete(k);
        if (k === 'id') el.id = '';
      },
      appendChild(c) {
        if (c.parentNode) c.remove?.();
        c.parentNode = el;
        c.parentElement = el;
        el.childNodes.push(c);
        return c;
      },
      insertBefore(c, ref) {
        if (!ref) return el.appendChild(c);
        if (c.parentNode) c.remove?.();
        c.parentNode = el;
        c.parentElement = el;
        const i = el.childNodes.indexOf(ref);
        if (i < 0) el.childNodes.push(c);
        else el.childNodes.splice(i, 0, c);
        return c;
      },
      removeChild(c) {
        el.childNodes = el.childNodes.filter((x) => x !== c);
        c.parentNode = null;
        c.parentElement = null;
        return c;
      },
      remove() { el.parentNode?.removeChild?.(el); },
      attachShadow() {
        el.shadowRoot = makeShadowRoot(el);
        return el.shadowRoot;
      },
      contains(other) {
        if (!other) return false;
        let cur = other;
        while (cur) {
          if (cur === el) return true;
          cur = cur.parentElement || cur.parentNode;
        }
        return false;
      },
      closest(sel) {
        let cur = el;
        while (cur && cur.nodeType === 1) {
          if (matches(cur, sel)) return cur;
          cur = cur.parentElement;
        }
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
        const e = typeof ev === 'string' ? { type: ev } : ev;
        try { if (!e.target) e.target = el; } catch {}
        if (typeof e.preventDefault !== 'function') {
          e.defaultPrevented = Boolean(e.defaultPrevented);
          e.preventDefault = () => { e.defaultPrevented = true; };
        }
        if (typeof e.stopPropagation !== 'function') {
          try { e.stopPropagation = () => {}; } catch {}
        }
        for (const fn of [...(ls.get(e.type) || [])]) fn(e);
        if (e.bubbles) doc.dispatchEvent(e);
        return !e.defaultPrevented;
      },
      focus() { doc.activeElement = el; },
      blur() { if (doc.activeElement === el) doc.activeElement = doc.body; },
      click() {
        if (el.disabled) return;
        el.dispatchEvent({ type: 'click', target: el, bubbles: false });
      },
    };
    if (initialText !== undefined) el.appendChild(makeText(initialText));
    return el;
  };

  const docLs = new Map();
  const doc = {
    nodeType: 9,
    hidden: false,
    activeElement: null,
    documentElement: null,
    head: null,
    body: null,
    createElement: makeEl,
    createTextNode: makeText,
    getElementById: (id) => doc.documentElement.querySelector(`#${id}`),
    querySelector: (s) => doc.documentElement.querySelector(s),
    querySelectorAll: (s) => doc.documentElement.querySelectorAll(s),
    addEventListener(ev, fn) {
      if (!docLs.has(ev)) docLs.set(ev, new Set());
      docLs.get(ev).add(fn);
    },
    removeEventListener(ev, fn) { docLs.get(ev)?.delete(fn); },
    dispatchEvent(ev) {
      for (const fn of [...(docLs.get(ev.type) || [])]) fn(ev);
      return !ev.defaultPrevented;
    },
  };
  doc.documentElement = makeEl('html');
  doc.head = makeEl('head');
  doc.body = makeEl('body');
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);

  return { doc, makeEl, makeText };
}

// ============================================================================
// 1. SafeAutoAccept: tightened custom policy + adjacent quantifier ReDoS guard
// ============================================================================
test('1. SafeAutoAccept: custom policy rejects button-only cards, enforces shell syntax checks, blocks adjacent ReDoS & bounds match text <= 4096', () => {
  // Button-only / empty / header-only cards must NEVER be approved under custom policy
  for (const sample of [
    { cardText: '', buttonText: 'Proceed' },
    { cardText: 'Proceed', buttonText: 'Proceed' },
    { cardText: 'Run command:', buttonText: 'Allow' },
  ]) {
    const v = saaMod.classifyApprovalCard({
      ...sample,
      policy: 'custom',
      customAllowPatterns: ['.*', '^Proceed$', '^Allow$'],
    });
    assert.equal(v.allowed, false, `Must reject button/header-only card: ${JSON.stringify(sample)}`);
    assert.equal(v.decision, 'skipped-policy');
  }

  // Custom pattern matches action content ONLY, never buttonText
  const btnOnlyMatch = saaMod.classifyApprovalCard({
    cardText: 'Run command: npm publish',
    buttonText: 'Proceed',
    policy: 'custom',
    customAllowPatterns: ['^Proceed$'],
  });
  assert.equal(btnOnlyMatch.allowed, false, 'Custom regex must not match buttonText');

  // Shell injection & unsafe built-in flags are rejected even under custom policy with ".*"
  for (const unsafeCmd of [
    'echo ok > /tmp/pwn',
    'echo $(whoami)',
    'echo a & echo b',
    'echo line1\necho line2',
    'git -c diff.external=evil.sh diff',
    'find . -exec id \\;',
  ]) {
    const v = saaMod.classifyApprovalCard({
      cardText: `Run command: ${unsafeCmd}`,
      buttonText: 'Allow',
      policy: 'custom',
      customAllowPatterns: ['.*'],
    });
    assert.equal(v.allowed, false, `Custom policy must reject unsafe shell syntax: ${unsafeCmd}`);
    assert.equal(v.reason, 'unsafe-shell-operator');
  }

  // DOM container containing ONLY buttons (no action text) must NOT approve under custom policy
  const { doc, makeEl } = createRichDom();
  const card = makeEl('div');
  card.className = 'approval-card';
  const btn = makeEl('button', 'Proceed');
  let clicks = 0;
  btn.addEventListener('click', () => { clicks += 1; });
  card.appendChild(btn);
  doc.body.appendChild(card);

  const ctl = saaMod.createSafeAutoAcceptController({
    win: { document: doc },
    doc,
    enabled: true,
    policy: 'custom',
    customAllowPatterns: ['.*'],
    autoObserve: false,
  });
  const stats = ctl.scanNow();
  assert.equal(stats.accepted, 0);
  assert.equal(clicks, 0);
  ctl.destroy();

  // Adjacent variable quantifier / overlapping char-class / >=3 unbounded wildcard ReDoS rejection
  const redosPatterns = [
    '.+.*',
    '.*.+',
    '.*.*',
    '(\\w+\\s*)+',
    '[a-z]+[a-z]+',
    '\\w+\\w+',
    '\\s+\\s+',
    '[a-z0-9]+\\w+',
    '.*foo.*bar.*',
  ];
  for (const pat of redosPatterns) {
    assert.equal(saaMod.hasUnsafeCustomRegex(pat), true, `Expected ReDoS pattern to be rejected: ${pat}`);
    assert.equal(saaMod.validateCustomPattern(pat), false, `validateCustomPattern must reject: ${pat}`);
  }
  // Safe linear patterns still compile and match
  assert.equal(saaMod.validateCustomPattern('^git\\s+(status|diff)$'), true);
  assert.equal(saaMod.validateCustomPattern('a+b+'), true);

  // Match text is bounded to <= 4096 chars (marker past 4096 is ignored; execution stays linear)
  const tailHidden = 'echo ' + 'a'.repeat(4200) + ' TAIL_MARKER';
  const boundedVerdict = saaMod.classifyApprovalCard({
    cardText: tailHidden,
    buttonText: 'Allow',
    policy: 'custom',
    customAllowPatterns: ['TAIL_MARKER'],
  });
  assert.equal(boundedVerdict.allowed, false, 'Custom match must slice candidate text to <= 4096 chars');
});

// ============================================================================
// 2. PromptQueue: same-pane send button binding & confirm-before-dequeue
// ============================================================================
test('2. PromptQueue: binds send button strictly to active pane/composer and never dequeues on unconfirmed fill-only', () => {
  const { doc, makeEl } = createRichDom();
  const storage = createMockStorage();

  // Pane A (active): has composer with ONLY a hidden send button (no visible send button)
  const paneA = makeEl('div');
  paneA.setAttribute('data-testid', 'split-pane');
  const convA = makeEl('div');
  convA.setAttribute('data-testid', 'conversation-view');
  convA.setAttribute('data-cascade-id', 'aaaaaaaa-1111-4111-8111-111111111111');
  convA.setAttribute('data-focused', 'true');
  const boxA = makeEl('div');
  boxA.setAttribute('data-testid', 'agent-input-box');
  const edA = makeEl('textarea');
  const hiddenBtnA = makeEl('button');
  hiddenBtnA.setAttribute('data-testid', 'input-send-button');
  hiddenBtnA.hidden = true;
  let hiddenClicks = 0;
  hiddenBtnA.addEventListener('click', () => { hiddenClicks += 1; });
  boxA.appendChild(edA);
  boxA.appendChild(hiddenBtnA);
  paneA.appendChild(convA);
  paneA.appendChild(boxA);

  // Pane B (foreign) + unrelated global form submit button
  const paneB = makeEl('div');
  paneB.setAttribute('data-testid', 'split-pane');
  const convB = makeEl('div');
  convB.setAttribute('data-testid', 'conversation-view');
  convB.setAttribute('data-cascade-id', 'bbbbbbbb-2222-4222-8222-222222222222');
  const boxB = makeEl('div');
  boxB.setAttribute('data-testid', 'agent-input-box');
  const edB = makeEl('textarea');
  const sendBtnB = makeEl('button');
  sendBtnB.setAttribute('data-testid', 'send-button');
  let foreignSendClicks = 0;
  sendBtnB.addEventListener('click', () => { foreignSendClicks += 1; });
  boxB.appendChild(edB);
  boxB.appendChild(sendBtnB);
  paneB.appendChild(convB);
  paneB.appendChild(boxB);

  const unrelatedSubmit = makeEl('button');
  unrelatedSubmit.setAttribute('type', 'submit');
  let globalSubmitClicks = 0;
  unrelatedSubmit.addEventListener('click', () => { globalSubmitClicks += 1; });

  doc.body.appendChild(paneB);
  doc.body.appendChild(paneA);
  doc.body.appendChild(unrelatedSubmit);
  edA.focus();

  class FakeKeyboardEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.key = init.key || '';
      this.code = init.code || '';
      this.keyCode = init.keyCode || 0;
      this.which = init.which || 0;
      this.bubbles = Boolean(init.bubbles);
      this.cancelable = Boolean(init.cancelable);
      this.defaultPrevented = false;
    }
    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() {}
  }
  const win = { document: doc, localStorage: storage, Event, KeyboardEvent: FakeKeyboardEvent };
  const pq = pqMod.createPromptQueueController({
    win,
    doc,
    storage,
    autoObserve: false,
    dispatchDelayMs: 5000,
  });

  try {
    pq.enqueue('Keep me safe until truly sent');

    // Flush when pane A has NO visible send button and Enter has no submission handler:
    // Must NOT click hiddenBtnA, sendBtnB, or unrelatedSubmit, and must NOT dequeue item!
    const res1 = pq.flushIfReady();
    assert.equal(res1.dispatched, false);
    assert.equal(res1.reason, 'submit-unconfirmed');
    assert.equal(hiddenClicks, 0);
    assert.equal(foreignSendClicks, 0);
    assert.equal(globalSubmitClicks, 0);
    assert.equal(pq.getItems().length, 1, 'Item must stay in queue when submit is unconfirmed');
    assert.equal(pq.getDebugState().paused, true, 'Queue must auto-pause on unconfirmed submit');
    assert.equal(edA.value, 'Keep me safe until truly sent');

    // Once Enter actually triggers submission (clears editor & prevents default), unpause and flush succeeds
    edA.value = '';
    edA.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        edA.value = '';
      }
    });
    pq.setPaused(false);
    const res2 = pq.flushIfReady();
    assert.equal(res2.dispatched, true);
    assert.equal(res2.method, 'enter-key');
    assert.equal(pq.getItems().length, 0);
    assert.equal(foreignSendClicks, 0);
    assert.equal(globalSubmitClicks, 0);
  } finally {
    pq.destroy();
  }
});

// ============================================================================
// 3. CompactGuard: cancel pending delayed slash submits on disable/mode/draft/switch
// ============================================================================
test('3. CompactGuard: cancels pending delayed slash submits on setEnabled(false), mode change, draft rewrite, and session switch', async () => {
  const { doc, makeEl } = createRichDom();
  const storage = createMockStorage();

  const conv = makeEl('div');
  conv.setAttribute('data-testid', 'conversation-view');
  conv.setAttribute('data-cascade-id', '11111111-1111-4111-8111-111111111111');
  const box = makeEl('div');
  box.setAttribute('data-testid', 'agent-input-box');
  const editor = makeEl('div');
  editor.setAttribute('data-lexical-editor', 'true');
  editor.setAttribute('contenteditable', 'true');
  const sendBtn = makeEl('button');
  sendBtn.setAttribute('data-testid', 'input-send-button');
  let sendClicks = 0;
  sendBtn.addEventListener('click', () => { sendClicks += 1; });
  box.appendChild(editor);
  box.appendChild(sendBtn);
  doc.body.appendChild(conv);
  doc.body.appendChild(box);

  const mountSlashMenu = () => {
    const portal = makeEl('div');
    const opt = makeEl('div');
    opt.setAttribute('id', 'typeahead-item-1');
    opt.setAttribute('role', 'option');
    const lbl = makeEl('span', 'compact');
    lbl.setAttribute('data-testid', 'menu-option-label');
    let clicks = 0;
    lbl.addEventListener('click', () => { clicks += 1; });
    opt.appendChild(lbl);
    portal.appendChild(opt);
    doc.body.appendChild(portal);
    return { portal, getClicks: () => clicks };
  };

  const win = { document: doc, localStorage: storage, Event, addEventListener() {}, removeEventListener() {} };
  const cg = cgMod.createCompactGuardController({
    win,
    doc,
    storage,
    autoPoll: false,
    slashPollMs: 25,
    slashSubmitDelayMs: 30,
    config: { compactThreshold: 80, compactTriggerMode: 'auto-silent' },
    getContextSnapshot: () => ({ usedFraction: 0.88, maxTokens: 512000, streaming: false }),
  });

  try {
    // Case A: setEnabled(false) cancels pending slash poll immediately
    const r1 = cg.insertCompact({ submit: true, triggerMode: 'auto-silent' });
    assert.equal(r1.pendingSlashOption, true);
    assert.ok(cg.getDebugState().pendingSlashTimers > 0);
    cg.setEnabled(false);
    assert.equal(cg.getDebugState().pendingSlashTimers, 0);
    const m1 = mountSlashMenu();
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(m1.getClicks(), 0);
    assert.equal(sendClicks, 0);
    m1.portal.remove();

    // Case B: updateConfig switching to fill-only cancels pending finalizeSubmit timer
    cg.setEnabled(true);
    editor.textContent = '';
    const m2 = mountSlashMenu();
    const r2 = cg.insertCompact({ submit: true, triggerMode: 'auto-silent' });
    assert.equal(r2.viaSlashOption, true);
    assert.equal(cg.getDebugState().pendingSlashTimers, 1);
    cg.updateConfig({ compactTriggerMode: 'fill-only' });
    assert.equal(cg.getDebugState().pendingSlashTimers, 0);
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(sendClicks, 0, 'Switching to fill-only must cancel delayed Send');
    m2.portal.remove();

    // Case C: user rewrites composer into normal draft before finalizeSubmit fires -> aborted!
    cg.updateConfig({ compactTriggerMode: 'auto-silent' });
    editor.textContent = '';
    const m3 = mountSlashMenu();
    cg.insertCompact({ submit: true, triggerMode: 'auto-silent' });
    editor.textContent = 'Wait, actually help me refactor this function instead';
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(sendClicks, 0, 'Must abort delayed submit when user rewrites composer to normal draft');
    m3.portal.remove();

    // Case D: session switch before finalizeSubmit fires -> aborted!
    editor.textContent = '';
    const m4 = mountSlashMenu();
    cg.insertCompact({ submit: true, triggerMode: 'auto-silent' });
    conv.setAttribute('data-cascade-id', '22222222-2222-4222-8222-222222222222');
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(sendClicks, 0, 'Must abort delayed submit when session switches');
    m4.portal.remove();
  } finally {
    cg.destroy();
  }
});

// ============================================================================
// 4. HostI18n: prune disconnected Shadow DOM observers cleanly
// ============================================================================
test('4. HostI18n: disconnects and prunes Shadow DOM MutationObservers when shadow host detaches', async () => {
  const { doc, makeEl } = createRichDom();
  const createdObservers = [];
  class TrackingMO {
    constructor(cb) {
      this._cb = cb;
      this.target = null;
      this.disconnected = false;
      createdObservers.push(this);
    }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
    trigger(records) { if (!this.disconnected) this._cb(records, this); }
  }

  const host = makeEl('div');
  const sr = host.attachShadow();
  const shadowBtn = makeEl('span', 'Settings');
  sr.appendChild(shadowBtn);
  doc.body.appendChild(host);

  const win = { document: doc, MutationObserver: TrackingMO, addEventListener() {}, removeEventListener() {} };
  const ctl = hostI18nMod.createHostI18nController({
    win,
    doc,
    coexist,
    locale: 'zh-CN',
    autoObserve: true,
    shadowPruneIntervalMs: 120,
  });

  try {
    assert.equal(ctl.getDebugState().shadowObserverCount, 1);
    const shadowMo = createdObservers.find((o) => o.target === sr);
    assert.ok(shadowMo && !shadowMo.disconnected);

    // Detach shadow host and verify childList removal prunes immediately
    host.remove();
    assert.equal(host.isConnected, false);
    const bodyMo = createdObservers.find((o) => o.target === doc.body);
    bodyMo.trigger([{ type: 'childList', target: doc.body, addedNodes: [], removedNodes: [host] }]);

    assert.equal(shadowMo.disconnected, true, 'Detached ShadowRoot observer must be disconnected');
    assert.equal(ctl.getDebugState().shadowObserverCount, 0);

    // Attach a second shadow host, detach it without mutation event -> periodic prune cleans it up
    const host2 = makeEl('div');
    const sr2 = host2.attachShadow();
    sr2.appendChild(makeEl('span', 'Settings'));
    doc.body.appendChild(host2);
    ctl.scanNow();
    assert.equal(ctl.getDebugState().shadowObserverCount, 1);
    const shadowMo2 = createdObservers.find((o) => o.target === sr2);
    assert.ok(shadowMo2 && !shadowMo2.disconnected);

    host2.remove();
    await new Promise((r) => setTimeout(r, 170));
    assert.equal(shadowMo2.disconnected, true, 'Periodic prune must disconnect detached shadow observer');
    assert.equal(ctl.getDebugState().shadowObserverCount, 0);
  } finally {
    ctl.destroy();
  }
});

// ============================================================================
// 5. PromptLibrary: selection prefill priority, tightened slash guard, Win/POSIX paths, IME & clipboard error toast
// ============================================================================
test('5. PromptLibrary: selection prefill overrides default, protects parameterized slash draft, recognizes Win/POSIX paths, guards IME & handles clipboard rejection', async () => {
  const { doc, makeEl } = createRichDom();
  const storage = createMockStorage();

  const conv = makeEl('div');
  conv.setAttribute('data-testid', 'conversation-view');
  doc.body.appendChild(conv);

  const box = makeEl('div');
  box.setAttribute('data-testid', 'agent-input-box');
  const ta = makeEl('textarea');
  box.appendChild(ta);
  doc.body.appendChild(box);

  let rejectClipboard = false;
  const win = {
    document: doc,
    localStorage: storage,
    Event,
    navigator: {
      language: 'en-US',
      clipboard: {
        writeText: () => (rejectClipboard ? Promise.reject(new Error('Clipboard denied')) : Promise.resolve()),
      },
    },
    getSelection: () => ({ toString: () => '' }),
  };

  const pl = promptLibMod.createPromptLibraryController({
    win,
    doc,
    storage,
    coexist,
    enabled: true,
    autoObserve: false,
  });

  try {
    // 5a. Selection prefill takes priority over {{target=default}}
    pl.open({ selection: 'packages/core/safe-auto-accept.js' });
    const modal = doc.querySelector(`[data-testid="${promptLibMod.MODAL_TESTID}"]`);
    modal.querySelector('[data-ag-sag-pl-item="tpl-diff-review"] .ag-sag-pl-item-main').click();
    const targetInput = modal.querySelector('[data-ag-sag-pl-var="target"]');
    assert.equal(
      targetInput.value,
      'packages/core/safe-auto-accept.js',
      'selection prefill must take precedence over {{target=default}}'
    );

    // 5b. IME Enter guard in variable form must NOT submit while composing
    targetInput.dispatchEvent({ type: 'keydown', key: 'Enter', isComposing: true });
    assert.equal(pl.getDebugState().modalOpen, true, 'IME composing Enter in variable form must not submit');
    targetInput.dispatchEvent({ type: 'keydown', key: 'Enter', keyCode: 229 });
    assert.equal(pl.getDebugState().modalOpen, true, 'keyCode 229 Enter in variable form must not submit');
    pl.close();

    // 5c. IME Enter guard in command palette search box
    pl.open();
    const searchInp = doc.querySelector('[data-testid="ag-sag-pl-search"]');
    doc.dispatchEvent({
      type: 'keydown',
      key: 'Enter',
      isComposing: true,
      target: searchInp,
      preventDefault() {},
      stopPropagation() {},
    });
    assert.equal(pl.getDebugState().modalOpen, true, 'IME composing Enter in palette search must not apply item');
    pl.close();

    // 5d. Tightened insertSlashSafely(): rejects parameterized command with toast, allows bare slash
    ta.value = '/plan 重构数据库迁移';
    assert.equal(pl.openContextMenu({ allowQuickSlash: true, x: 10, y: 10 }), true);
    doc.querySelector('[data-ag-sag-ctx-act="btw-quick"]').click();
    assert.equal(ta.value, '/plan 重构数据库迁移', 'Parameterized slash command must be protected');
    const toast = doc.querySelector('[data-testid="ag-sag-ctx-toast"]');
    assert.ok(toast, 'Must show .ag-sag-ctx-toast when refusing to overwrite parameterized slash draft');

    for (const bare of ['/', '/btw', '/plan', '/compact']) {
      ta.value = bare;
      pl.openContextMenu({ allowQuickSlash: true, x: 10, y: 10 });
      doc.querySelector('[data-ag-sag-ctx-act="plan-quick"]').click();
      assert.equal(ta.value, '/plan ', `Bare slash "${bare}" should be replaceable`);
    }

    // 5e. Cross-platform path extraction (POSIX + Windows drive + UNC + Win relative) & @path quoting
    const recognizedPaths = [
      'src/app/index.ts:12',
      './foo/bar.js',
      '~/a/b.md',
      '/etc/hosts',
      'C:\\Users\\dev\\app.ts:42',
      'D:/proj/src/main.mjs',
      '\\\\server\\share\\dir\\file.txt',
      'src\\components\\App.tsx:10',
      '.\\cli\\launcher.mjs',
      'C:\\My Project\\src\\app.ts',
    ];
    for (const p of recognizedPaths) {
      ta.value = '';
      const codeEl = makeEl('code', p);
      conv.appendChild(codeEl);
      doc.dispatchEvent({
        type: 'contextmenu',
        target: codeEl,
        clientX: 20,
        clientY: 20,
        preventDefault() {},
        stopPropagation() {},
      });
      const insBtn = doc.querySelector('[data-ag-sag-ctx-act="insert-at"]');
      assert.ok(insBtn, `Path must be recognized by contextmenu: ${p}`);
      insBtn.click();
      if (/\s/.test(p)) {
        assert.equal(ta.value, `@"${p}" `, `Path with spaces must be quoted: ${p}`);
      } else {
        assert.equal(ta.value, `@${p} `, `Path without spaces must be inserted directly: ${p}`);
      }
      codeEl.remove();
    }

    // Non-paths (/compact, URLs) must NOT get insert-at action
    for (const nonPath of ['/compact', 'https://example.com/a/b.js']) {
      const codeEl = makeEl('code', nonPath);
      conv.appendChild(codeEl);
      doc.dispatchEvent({
        type: 'contextmenu',
        target: codeEl,
        clientX: 20,
        clientY: 20,
        preventDefault() {},
        stopPropagation() {},
      });
      assert.equal(doc.querySelector('[data-ag-sag-ctx-act="insert-at"]'), null, `Must not treat "${nonPath}" as file path`);
      doc.dispatchEvent({ type: 'click', target: doc.body });
      codeEl.remove();
    }

    // 5f. Clipboard rejection produces visible toast and zero unhandled rejection
    rejectClipboard = true;
    pl.openContextMenu({ selection: 'copy me fail', x: 10, y: 10 });
    doc.querySelector('[data-ag-sag-ctx-act="copy-sel"]').click();
    await new Promise((r) => setTimeout(r, 15));
    const failToast = doc.querySelector('[data-testid="ag-sag-ctx-toast"]');
    assert.ok(failToast && /fail|失败/i.test(failToast.textContent), 'Rejected clipboard write must show failure toast');
  } finally {
    pl.destroy();
  }
});

// ============================================================================
// 6. ReadingNav: lossless <details> restore, same-pane scrollToBottom, real clipboard status
// ============================================================================
test('6. ReadingNav: restores host <details> open states, scrolls only active pane, and reflects real clipboard outcome', async () => {
  const { doc, makeEl } = createRichDom();

  // Split pane 1 (left, inactive) with its own autoscroll-viewport
  const paneLeft = makeEl('div');
  const convLeft = makeEl('div');
  convLeft.setAttribute('data-testid', 'conversation-view');
  const vpLeft = makeEl('div');
  vpLeft.setAttribute('data-testid', 'autoscroll-viewport');
  vpLeft.scrollTop = 100;
  vpLeft.scrollHeight = 3000;
  vpLeft.clientHeight = 600;
  convLeft.appendChild(vpLeft);
  const boxLeft = makeEl('div');
  boxLeft.setAttribute('data-testid', 'agent-input-box');
  paneLeft.appendChild(convLeft);
  paneLeft.appendChild(boxLeft);

  // Split pane 2 (right, active) WITHOUT autoscroll-viewport (scrollable conversation-view directly)
  const paneRight = makeEl('div');
  const convRight = makeEl('div');
  convRight.setAttribute('data-testid', 'conversation-view');
  convRight.setAttribute('data-focused', 'true');
  convRight.scrollTop = 50;
  convRight.scrollHeight = 2000;
  convRight.clientHeight = 500;

  const detOpen = makeEl('details');
  detOpen.open = true;
  const detClosed = makeEl('details');
  detClosed.open = false;
  convRight.appendChild(detOpen);
  convRight.appendChild(detClosed);

  const longPre = makeEl('pre', Array.from({ length: 45 }, (_, i) => `line ${i + 1}`).join('\n'));
  convRight.appendChild(longPre);

  const boxRight = makeEl('div');
  boxRight.setAttribute('data-testid', 'agent-input-box');
  paneRight.appendChild(convRight);
  paneRight.appendChild(boxRight);

  doc.body.appendChild(paneLeft);
  doc.body.appendChild(paneRight);

  let clipMode = 'pending-reject';
  let resolvePending = null;
  let rejectPending = null;
  const win = {
    document: doc,
    navigator: {
      language: 'en-US',
      clipboard: {
        writeText: () =>
          new Promise((res, rej) => {
            resolvePending = res;
            rejectPending = rej;
          }),
      },
    },
  };

  const rn = readingNavMod.createReadingNavController({
    win,
    doc,
    enabled: true,
    autoObserve: false,
  });

  try {
    // 6a. Same-pane scrollToBottom must scroll convRight and leave vpLeft untouched
    assert.equal(rn.scrollToBottom(), true);
    assert.equal(convRight.scrollTop, 2000);
    assert.equal(vpLeft.scrollTop, 100, 'Must NOT fall back to scrolling another split pane viewport');

    // 6b. Batch fold/unfold mutates <details>, then setEnabled(false) restores original open states losslessly
    rn.toggleFoldAllStepsAndCode(true);
    assert.equal(detOpen.open, false);
    assert.equal(detClosed.open, false);
    rn.toggleFoldAllStepsAndCode(false);
    assert.equal(detOpen.open, true);
    assert.equal(detClosed.open, true);

    rn.setEnabled(false);
    assert.equal(detOpen.open, true, 'Originally open <details> must be restored to true');
    assert.equal(detClosed.open, false, 'Originally closed <details> must be restored to false');

    // Re-enable and verify real async clipboard status feedback
    rn.setEnabled(true);
    const copyBtn = convRight.querySelector('[data-ag-sag-code-copy="1"]');
    assert.ok(copyBtn);
    assert.equal(copyBtn.textContent, 'Copy');

    // Before promise settles, button must NOT falsely report "Copied ✓"
    copyBtn.click();
    assert.equal(copyBtn.textContent, 'Copy', 'Must wait for clipboard Promise to settle');

    // Rejection -> shows Copy failed
    rejectPending(new Error('denied'));
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(copyBtn.textContent, 'Copy failed');

    // Resolution -> shows Copied ✓
    copyBtn.click();
    resolvePending();
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(copyBtn.textContent, 'Copied ✓');

    // Also verify destroy() restores <details>
    rn.toggleFoldAllStepsAndCode(false);
    assert.equal(detClosed.open, true);
  } finally {
    rn.destroy();
  }
  assert.equal(detOpen.open, true);
  assert.equal(detClosed.open, false, 'destroy() must restore modified <details> to original open state');
});

// ============================================================================
// 7. ThemeStudio: drop entire :has() rule block, iframe load sync + targetOrigin, Win/Linux fonts
// ============================================================================
test('7. ThemeStudio: drops entire :has() rules, syncs iframes on load with exact targetOrigin, and includes Win/Linux font fallbacks', () => {
  // 7a. Entire :has() rule removed without leaving broadened base selector
  const cleaned = themeStudioMod.sanitizeCustomCss(
    'div:has(> .secret) { display: none; }\n@media (min-width: 600px) { .keep { color: blue; } section:has(img) { background: red; } }\n.after { opacity: 0.9; }'
  );
  assert.equal(cleaned.includes(':has('), false);
  assert.equal(cleaned.includes('display: none'), false, 'Declaration inside :has() rule must be dropped');
  assert.equal(cleaned.includes('background: red'), false, 'Nested :has() rule inside @media must be dropped');
  assert.ok(cleaned.includes('.keep { color: blue; }'), 'Safe sibling inside @media must stay');
  assert.ok(cleaned.includes('.after { opacity: 0.9; }'), 'Subsequent safe rule must stay');

  // 7b. Windows & Linux CJK/Mono font fallbacks
  const css = themeStudioMod.buildThemeCss({ preset: 'obsidian-prism', cjkFontTuning: true });
  for (const font of ['"Microsoft YaHei"', '"WenQuanYi Micro Hei"', '"Cascadia Mono"', '"DejaVu Sans Mono"', '"Liberation Mono"']) {
    assert.ok(css.includes(font), `Theme CSS must include fallback font ${font}`);
  }

  // 7c. iframe load listener + exact targetOrigin for loopback http vs '*' for opaque plugin://
  const { doc, makeEl } = createRichDom();
  const httpMsgs = [];
  const pluginMsgs = [];

  const httpFrame = makeEl('iframe');
  httpFrame.setAttribute('src', 'http://127.0.0.1:4123/panel.html');
  httpFrame.contentWindow = { postMessage: (msg, origin) => httpMsgs.push({ msg, origin }) };

  const pluginFrame = makeEl('iframe');
  pluginFrame.setAttribute('src', 'plugin://agy-nov/panel.html');
  pluginFrame.contentWindow = { postMessage: (msg, origin) => pluginMsgs.push({ msg, origin }) };

  doc.body.appendChild(httpFrame);
  doc.body.appendChild(pluginFrame);

  const ctl = themeStudioMod.createThemeStudioController({
    win: { document: doc },
    doc,
    enabled: true,
    preset: 'obsidian-prism',
  });

  try {
    assert.equal(httpMsgs.length, 1);
    assert.equal(httpMsgs[0].origin, 'http://127.0.0.1:4123', 'HTTP loopback iframe must receive exact targetOrigin');
    assert.equal(pluginMsgs.length, 1);
    assert.equal(pluginMsgs[0].origin, '*', 'Opaque plugin:// iframe keeps controlled wildcard fallback');

    // Reloading/late-loading iframe triggers automatic theme re-sync
    httpFrame.dispatchEvent({ type: 'load' });
    pluginFrame.dispatchEvent({ type: 'load' });
    assert.equal(httpMsgs.length, 2);
    assert.equal(httpMsgs[1].origin, 'http://127.0.0.1:4123');
    assert.equal(pluginMsgs.length, 2);
  } finally {
    ctl.destroy();
  }

  // After destroy(), load listeners are detached
  const countAfterDestroy = httpMsgs.length;
  httpFrame.dispatchEvent({ type: 'load' });
  assert.equal(httpMsgs.length, countAfterDestroy, 'destroy() must remove iframe load listeners');
});

// ============================================================================
// 8. PrismBridge focus/IME preservation + cross-platform backup CLI + index.js extPacks preservation
// ============================================================================
test('8. PrismBridge preserves input focus during external DOM mutations, uses cross-platform backup CLI, and mountSag preserves __agSagExtPacks on hot-replace', async () => {
  const { doc, makeEl } = createRichDom();
  const storage = createMockStorage();

  // Mount a native Settings dialog with Appearance heading
  const dlg = makeEl('div');
  dlg.setAttribute('role', 'dialog');
  const p6 = makeEl('div');
  p6.className = 'p-6';
  const h2 = makeEl('h2', 'Appearance');
  const sec = makeEl('div');
  sec.className = 'space-y-2';
  p6.appendChild(h2);
  p6.appendChild(sec);
  dlg.appendChild(p6);
  doc.body.appendChild(dlg);

  let domMoCb = null;
  class ManualMO {
    constructor(cb) { this._cb = cb; }
    observe(target) { if (target === doc.body) domMoCb = this._cb; }
    disconnect() {}
  }

  let copiedCli = '';
  const win = {
    document: doc,
    localStorage: storage,
    MutationObserver: ManualMO,
    navigator: { language: 'en-US' },
    requestAnimationFrame: (fn) => fn(),
  };

  const pb = prismBridgeMod.createPrismBridgeController({
    win,
    doc,
    storage,
    coexist,
    autoObserve: true,
    bindDrawerShortcut: false,
    onCopyText: (txt) => { copiedCli = txt; },
  });

  try {
    // Focus search input inside mounted settings panel
    const searchInp = doc.querySelector('[data-testid="ag-sag-search-input"]');
    assert.ok(searchInp);
    searchInp.focus();
    searchInp.value = 'auto';
    assert.equal(doc.activeElement, searchInp);

    // External DOM mutation (e.g., streaming message outside settings) must NOT destroy/replace focused input
    const externalDiv = makeEl('div', 'stream chunk');
    doc.body.appendChild(externalDiv);
    domMoCb?.([{ type: 'childList', target: doc.body, addedNodes: [externalDiv], removedNodes: [] }]);

    const searchInpAfter = doc.querySelector('[data-testid="ag-sag-search-input"]');
    assert.equal(searchInpAfter, searchInp, 'External DOM mutation must not wipe settings panel while user edits input');
    assert.equal(doc.activeElement, searchInp);
    assert.equal(searchInpAfter.value, 'auto');

    // Cross-platform backup CLI command (no ~/ expansion issue on Windows)
    pb.setActiveSubTab('advanced');
    const copyCmdBtn = doc.querySelector('[data-testid="ag-sag-storage-copy-cmd"]');
    assert.ok(copyCmdBtn);
    copyCmdBtn.click();
    assert.ok(copiedCli.includes('--out=./agy-backup'), `Expected cross-platform --out=./agy-backup, got: ${copiedCli}`);
    assert.equal(copiedCli.includes('~/'), false, 'Backup CLI should not rely on POSIX-only ~/');
  } finally {
    pb.destroy();
  }

  // index.js: hot-replacing mountSag() must preserve preloaded __agSagExtPacks for the new instance
  packsMod.clearExtendedPacks();
  const env2 = createRichDom();
  const storage2 = createMockStorage();
  const win2 = {
    document: env2.doc,
    localStorage: storage2,
    Event,
    navigator: { language: 'ja-JP' },
    __agSagExtPacks: {
      ja: {
        locale: 'ja',
        exact: { __HotReplaceExtKey__: 'ホットリロード維持' },
        patterns: [],
      },
    },
  };
  const api1 = core.mountSag({
    win: win2,
    doc: env2.doc,
    storage: storage2,
    autoPoll: false,
    autoObserve: false,
    bindVaultShortcut: false,
    bindDrawerShortcut: false,
    config: { hostI18nLocale: 'ja' },
  });
  assert.equal(api1.getDebugState().hostI18n.extendedPackLoaded, true);

  // Remount replaces api1 -> api2 MUST still receive preloaded __agSagExtPacks!
  const api2 = core.mountSag({
    win: win2,
    doc: env2.doc,
    storage: storage2,
    autoPoll: false,
    autoObserve: false,
    bindVaultShortcut: false,
    bindDrawerShortcut: false,
    config: { hostI18nLocale: 'ja' },
  });
  try {
    assert.equal(api1.getDebugState().destroyed, true);
    assert.equal(api2.getDebugState().hostI18n.extendedPackLoaded, true, 'New mounted instance must preserve preloaded ext packs');
    assert.equal(api2.hostI18n.translateText('__HotReplaceExtKey__'), 'ホットリロード維持');
    assert.ok('__agSagExtPacks' in win2, 'Hot-replace must not delete win.__agSagExtPacks');
  } finally {
    api2.destroy();
  }
  assert.equal('__agSagExtPacks' in win2, false, 'Final uninstall destroy() still cleans up win.__agSagExtPacks');
  packsMod.clearExtendedPacks();
});

test('9. second-pass renderer hardening: adjacent ? ReDoS, oversize custom card fail-closed, no-op send button retention & same-hash extPack registration', () => {
  // (a) Adjacent optional quantifiers (`a?a?a?...`) must be rejected by validateCustomPattern
  assert.equal(saaMod.validateCustomPattern('a?a?a?a?a?a?a?a?a?a?aaaaaaaaaa'), false);
  assert.equal(saaMod.validateCustomPattern('(?:a|ab)?(?:a|ab)?'), false);

  // (b) Oversize custom card fails closed rather than approving on a truncated prefix
  const hugeSafeCard = `npm test ${'x'.repeat(5000)}`;
  const hugeDec = saaMod.classifyApprovalCard({
    policy: 'custom',
    customAllowPatterns: ['^npm test'],
    cardText: hugeSafeCard,
    buttonText: 'Allow',
  });
  assert.equal(hugeDec.allowed, false);
  assert.equal(hugeDec.reason, 'card-too-long:custom');

  // (c) PromptQueue retains head item if send button click has zero effect on editor or streaming
  const { doc, makeEl } = createRichDom();
  const box = makeEl('div');
  box.setAttribute('data-testid', 'agent-input-box');
  const ta = makeEl('textarea');
  const noopBtn = makeEl('button', 'Send');
  noopBtn.setAttribute('data-testid', 'input-send-button');
  noopBtn.addEventListener('click', () => {
    // intentionally does nothing (unconfirmed submit)
  });
  box.appendChild(ta);
  box.appendChild(noopBtn);
  doc.body.appendChild(box);
  const pq = pqMod.createPromptQueueController({
    win: { document: doc, localStorage: createMockStorage(), Event },
    doc,
    storage: createMockStorage(),
    autoObserve: false,
    dispatchDelayMs: 5000,
  });
  try {
    pq.enqueue('Keep me if click does nothing');
    const flushRes = pq.flushIfReady();
    assert.equal(flushRes.dispatched, false);
    assert.equal(flushRes.reason, 'submit-unconfirmed');
    assert.equal(pq.getItems().length, 1, 'Queue must retain item when click has no observable effect');
  } finally {
    pq.destroy();
  }

  // (d) Same-hash updateConfig registers newly preloaded win.__agSagExtPacks[loc] into hostI18n
  packsMod.clearExtendedPacks();
  const env3 = createRichDom();
  const win3 = {
    document: env3.doc,
    localStorage: createMockStorage(),
    Event,
    navigator: { language: 'en-US' },
  };
  const api = core.mountSag({
    win: win3,
    doc: env3.doc,
    storage: win3.localStorage,
    autoPoll: false,
    autoObserve: false,
    bindVaultShortcut: false,
    bindDrawerShortcut: false,
    config: { hostI18nLocale: 'en' },
  });
  try {
    win3.__agSagExtPacks = {
      fr: { locale: 'fr', exact: { __SameHashReusedKey__: 'Traduit en direct' }, patterns: [] },
    };
    api.updateConfig({ hostI18nLocale: 'fr', modules: { hostI18n: true } });
    assert.equal(api.getDebugState().hostI18n.extendedPackLoaded, true);
    assert.equal(api.hostI18n.translateText('__SameHashReusedKey__'), 'Traduit en direct');
  } finally {
    api.destroy();
    packsMod.clearExtendedPacks();
  }
});
