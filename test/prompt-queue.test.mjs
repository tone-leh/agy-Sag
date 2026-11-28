import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pqMod = require('../packages/core/prompt-queue.js');

function createMockStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (i) => Array.from(map.keys())[i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

function createQueueDom({ cid = '11111111-2222-4333-8444-555555555555', lexical = false } = {}) {
  const matchesSingle = (el, raw) => {
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
    for (const m of rest.matchAll(/\[([^\]=*^$]+)(?:(\*|\^|\$)?="([^"]*)")?\]/g)) {
      const attrName = m[1];
      const op = m[2] || '';
      const expected = m[3];
      if (!el.hasAttribute(attrName)) return false;
      if (expected !== undefined) {
        const actual = String(el.getAttribute(attrName) || '');
        if (op === '*') {
          if (!actual.includes(expected)) return false;
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
      for (let i = parts.length - 2; i >= 0; i--) {
        let matchedAncestor = false;
        while (cur) {
          if (matchesSingle(cur, parts[i])) {
            matchedAncestor = true;
            cur = cur.parentElement;
            break;
          }
          cur = cur.parentElement;
        }
        if (!matchedAncestor) return false;
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
      get isConnected() {
        let p = el;
        while (p) {
          if (p === doc.documentElement) return true;
          p = p.parentElement;
        }
        return false;
      },
      get firstChild() { return el.children[0] || null; },
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
        return el.children.length ? el._text + el.children.map((c) => c.textContent).join('') : el._text;
      },
      set textContent(v) {
        el._text = String(v ?? '');
        el.children.length = 0;
      },
      setAttribute(k, v) {
        attrs.set(k, String(v));
        if (k === 'id') el.id = String(v);
      },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      hasAttribute(k) { return attrs.has(k); },
      removeAttribute(k) { attrs.delete(k); },
      appendChild(c) {
        if (c.parentElement) c.remove();
        c.parentElement = el;
        el.children.push(c);
        return c;
      },
      insertBefore(c, ref) {
        if (c.parentElement) c.remove();
        c.parentElement = el;
        const i = el.children.indexOf(ref);
        if (i >= 0) el.children.splice(i, 0, c);
        else el.children.push(c);
        return c;
      },
      removeChild(c) {
        el.children = el.children.filter((x) => x !== c);
        c.parentElement = null;
        return c;
      },
      remove() {
        if (el.parentElement) el.parentElement.removeChild(el);
      },
      closest(sel) {
        let cur = el;
        while (cur) {
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
        const eventObj = { ...ev, target: ev?.target || el };
        for (const fn of ls.get(ev.type) || []) fn(eventObj);
        if (ev?.bubbles) doc.dispatchEvent(eventObj);
      },
      focus() { doc.activeElement = el; },
      click() {
        if (el.disabled) return;
        for (const fn of ls.get('click') || []) {
          fn({ target: el, preventDefault() {}, stopPropagation() {} });
        }
      },
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
    addEventListener(ev, fn) {
      if (!docListeners.has(ev)) docListeners.set(ev, new Set());
      docListeners.get(ev).add(fn);
    },
    removeEventListener(ev, fn) { docListeners.get(ev)?.delete(fn); },
    dispatchEvent(ev) {
      for (const fn of docListeners.get(ev.type) || []) fn(ev);
    },
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
  const inputBox = makeEl('div');
  inputBox.setAttribute('data-testid', 'agent-input-box');

  let editor;
  if (lexical) {
    editor = makeEl('div');
    editor.setAttribute('data-lexical-editor', 'true');
    editor.setAttribute('contenteditable', 'true');
  } else {
    editor = makeEl('textarea');
  }

  const sendBtn = makeEl('button');
  sendBtn.setAttribute('data-testid', 'input-send-button');
  const sentPayloads = [];
  sendBtn.addEventListener('click', () => {
    const val = lexical ? editor.textContent : editor.value;
    sentPayloads.push(val);
    if (lexical) editor.textContent = '';
    else editor.value = '';
  });

  inputBox.appendChild(editor);
  inputBox.appendChild(sendBtn);
  compWrap.appendChild(inputBox);

  doc.body.appendChild(conv);
  doc.body.appendChild(compWrap);

  return { doc, makeEl, conv, compWrap, inputBox, editor, sendBtn, sentPayloads, docListeners };
}

test('PromptQueue constants, trimming, truncation, and MAX_QUEUE_ITEMS enforcement', () => {
  assert.equal(pqMod.STORAGE_PREFIX, 'agSag.promptQueue.v1:');
  assert.equal(pqMod.MAX_QUEUE_ITEMS, 20);
  assert.equal(pqMod.MAX_ITEM_CHARS, 4000);

  const storage = createMockStorage();
  const dom = createQueueDom();
  const win = { document: dom.doc, localStorage: storage, Event, navigator: { language: 'en-US' } };
  const ctrl = pqMod.createPromptQueueController({
    win,
    doc: dom.doc,
    storage,
    autoObserve: false,
    dispatchDelayMs: 1200,
    isStreaming: () => true,
  });

  // Blank or zero-width strings are rejected
  assert.equal(ctrl.enqueue(''), null);
  assert.equal(ctrl.enqueue('   \n\t\u200B  '), null);

  // Oversized text is clipped to MAX_ITEM_CHARS
  const longText = 'A'.repeat(4500);
  const clipped = ctrl.enqueue(longText);
  assert.ok(clipped);
  assert.equal(clipped.text.length, pqMod.MAX_ITEM_CHARS);

  // Fill up to 20 items; 21st is rejected
  for (let i = 2; i <= pqMod.MAX_QUEUE_ITEMS; i++) {
    assert.ok(ctrl.enqueue(`Task #${i}`));
  }
  assert.equal(ctrl.getItems().length, pqMod.MAX_QUEUE_ITEMS);
  assert.equal(ctrl.enqueue('Task #21 overflow'), null);
  assert.equal(ctrl.getItems().length, pqMod.MAX_QUEUE_ITEMS);

  ctrl.destroy();
});

test('PromptQueue CRUD, reorder, UI bar mounting/interactions, secret redaction, and collapse behavior', () => {
  const storage = createMockStorage();
  const dom = createQueueDom();
  const win = { document: dom.doc, localStorage: storage, Event, navigator: { language: 'zh-CN' } };
  const changes = [];
  const ctrl = pqMod.createPromptQueueController({
    win,
    doc: dom.doc,
    storage,
    autoObserve: false,
    dispatchDelayMs: 500,
    isStreaming: () => true,
    onQueueChange: (ev) => changes.push(ev),
  });

  // Bar mounted directly above agent-input-box and marked owned + no-translate
  const bar = dom.doc.querySelector('[data-testid="ag-sag-queue-bar"]');
  assert.ok(bar, 'Queue bar must be mounted');
  assert.equal(bar.parentElement, dom.compWrap);
  assert.equal(dom.compWrap.children[0], bar);
  assert.equal(dom.compWrap.children[1], dom.inputBox);
  assert.equal(bar.getAttribute('data-ag-sg-owned'), '1');
  assert.equal(bar.getAttribute('data-ag-sag-owned'), '1');
  assert.equal(bar.getAttribute('translate'), 'no');
  assert.equal(bar.getAttribute('data-state'), 'collapsed', 'Empty queue starts collapsed/unobtrusive');

  // Open panel via trigger button and enqueue via Enter in quick input
  bar.querySelector('[data-ag-sag-act="queue-open"]').click();
  assert.equal(bar.getAttribute('data-state'), 'expanded');
  const qInput = bar.querySelector('[data-testid="ag-sag-queue-input"]');
  qInput.value = 'First task with sk-proj-secret1234567890abcdef';
  qInput.dispatchEvent({ type: 'keydown', key: 'Enter', shiftKey: false, isComposing: false });
  assert.equal(qInput.value, '');
  assert.equal(ctrl.getItems().length, 1);
  assert.ok(!bar.textContent.includes('sk-proj-secret1234567890abcdef'), 'Preview must redact secrets');

  const second = ctrl.enqueue('Second task');
  const third = ctrl.enqueue('Third task');
  assert.deepEqual(ctrl.getItems().map((x) => x.text), [
    'First task with sk-proj-secret1234567890abcdef',
    'Second task',
    'Third task',
  ]);

  // Move third up by 1, then move via UI move-up button
  assert.equal(ctrl.move(third.id, -1), true);
  assert.deepEqual(ctrl.getItems().map((x) => x.text), [
    'First task with sk-proj-secret1234567890abcdef',
    'Third task',
    'Second task',
  ]);
  assert.equal(ctrl.move(second.id, 1), false, 'Moving last item down is a no-op');

  // Remove via API
  assert.equal(ctrl.remove(third.id), true);
  assert.equal(ctrl.remove('non-existent'), false);
  assert.deepEqual(ctrl.getItems().map((x) => x.text), [
    'First task with sk-proj-secret1234567890abcdef',
    'Second task',
  ]);

  // Pause & clear via UI buttons
  bar.querySelector('[data-ag-sag-act="queue-toggle-pause"]').click();
  assert.equal(ctrl.getDebugState().paused, true);
  bar.querySelector('[data-ag-sag-act="queue-clear"]').click();
  assert.equal(ctrl.getItems().length, 0);
  assert.ok(changes.length >= 4);

  // Close panel -> returns to collapsed state
  assert.equal(ctrl.togglePanel(false), false);
  assert.equal(bar.getAttribute('data-state'), 'collapsed');

  ctrl.destroy();
});

test('PromptQueue persists and isolates queues per cascadeId across switches and reloads', () => {
  const storage = createMockStorage();
  const cidA = 'aaaaaaaa-1111-4111-8111-111111111111';
  const cidB = 'bbbbbbbb-2222-4222-8222-222222222222';
  let activeCid = cidA;

  const dom1 = createQueueDom({ cid: cidA });
  const win1 = { document: dom1.doc, localStorage: storage, Event };
  const ctrl1 = pqMod.createPromptQueueController({
    win: win1,
    doc: dom1.doc,
    storage,
    autoObserve: false,
    getCascadeId: () => activeCid,
    isStreaming: () => true,
  });

  ctrl1.enqueue('Session A task 1');
  ctrl1.enqueue('Session A task 2');
  assert.ok(storage.getItem(pqMod.STORAGE_PREFIX + cidA));
  assert.equal(storage.getItem(pqMod.STORAGE_PREFIX + cidB), null);

  // Switch to session B
  activeCid = cidB;
  ctrl1.sync();
  assert.equal(ctrl1.getItems().length, 0);
  ctrl1.enqueue('Session B task 1');
  assert.deepEqual(ctrl1.getItems().map((x) => x.text), ['Session B task 1']);

  // Switch back to session A
  activeCid = cidA;
  ctrl1.sync();
  assert.deepEqual(ctrl1.getItems().map((x) => x.text), ['Session A task 1', 'Session A task 2']);
  ctrl1.destroy();

  // Fresh controller simulates reload -> recovers session B queue cleanly
  const dom2 = createQueueDom({ cid: cidB });
  const win2 = { document: dom2.doc, localStorage: storage, Event };
  const ctrl2 = pqMod.createPromptQueueController({
    win: win2,
    doc: dom2.doc,
    storage,
    autoObserve: false,
    isStreaming: () => true,
  });
  assert.deepEqual(ctrl2.getItems().map((x) => x.text), ['Session B task 1']);
  ctrl2.clear();
  assert.equal(storage.getItem(pqMod.STORAGE_PREFIX + cidB), null);
  ctrl2.destroy();
});

test('PromptQueue triple safety interlocks: streaming, composer draft (textarea + Lexical), approval card, and paused', () => {
  // Part A: textarea DOM with stop-button, draft, approval card, and pause
  const storage = createMockStorage();
  const dom = createQueueDom({ lexical: false });
  const win = { document: dom.doc, localStorage: storage, Event };
  let streamingFlag = false;
  let approvalFlag = false;

  const ctrl = pqMod.createPromptQueueController({
    win,
    doc: dom.doc,
    storage,
    autoObserve: false,
    dispatchDelayMs: 5000,
    isStreaming: () => streamingFlag,
    hasBlockingApproval: () => approvalFlag,
  });

  ctrl.enqueue('Run full regression tests');

  // 1a. Streaming via callback
  streamingFlag = true;
  let res = ctrl.flushIfReady();
  assert.equal(res.dispatched, false);
  assert.equal(res.reason, 'streaming');
  assert.equal(ctrl.getDebugState().lastSkipReason, 'streaming');
  streamingFlag = false;

  // 1b. Streaming via visible stop-button in DOM
  const stopBtn = dom.makeEl('button');
  stopBtn.setAttribute('data-testid', 'stop-button');
  dom.inputBox.appendChild(stopBtn);
  res = ctrl.flushIfReady();
  assert.equal(res.dispatched, false);
  assert.equal(res.reason, 'streaming');
  stopBtn.hidden = true;

  // 2. Composer occupied with user draft
  dom.editor.value = 'User is still typing...';
  res = ctrl.flushIfReady();
  assert.equal(res.dispatched, false);
  assert.equal(res.reason, 'composer-occupied');
  assert.equal(ctrl.getDebugState().lastSkipReason, 'composer-occupied');
  assert.equal(ctrl.getDebugState().autoPaused, true);
  dom.editor.value = '';

  // 3a. Blocking approval via callback
  approvalFlag = true;
  res = ctrl.flushIfReady();
  assert.equal(res.dispatched, false);
  assert.equal(res.reason, 'blocking-approval');
  assert.equal(ctrl.getDebugState().lastSkipReason, 'blocking-approval');
  approvalFlag = false;

  // 3b. Blocking approval via DOM .approval-card
  const card = dom.makeEl('div');
  card.className = 'approval-card';
  dom.doc.body.appendChild(card);
  res = ctrl.flushIfReady();
  assert.equal(res.dispatched, false);
  assert.equal(res.reason, 'blocking-approval');
  card.remove();

  // 3c. Manual pause
  ctrl.setPaused(true);
  res = ctrl.flushIfReady();
  assert.equal(res.dispatched, false);
  assert.equal(res.reason, 'paused');
  assert.equal(ctrl.getDebugState().lastSkipReason, 'paused');

  // All blockers cleared -> flushes cleanly into textarea and clicks send button
  ctrl.setPaused(false);
  res = ctrl.flushIfReady();
  assert.equal(res.dispatched, true);
  assert.equal(res.method, 'click-send-button');
  assert.deepEqual(dom.sentPayloads, ['Run full regression tests']);
  assert.equal(ctrl.getItems().length, 0);
  assert.equal(ctrl.getDebugState().lastSkipReason, null);
  ctrl.destroy();

  // Part B: Lexical editor draft protection + execCommand safe fill (never tears down Lexical via textContent)
  const lexDom = createQueueDom({ lexical: true });
  lexDom.doc.execCommand = (cmd, _ui, val) => {
    if (cmd === 'insertText') {
      lexDom.editor.textContent = String(val || '');
      return true;
    }
    if (cmd === 'selectAll' || cmd === 'delete') return true;
    return false;
  };
  const lexWin = { document: lexDom.doc, localStorage: createMockStorage(), Event };
  const lexCtrl = pqMod.createPromptQueueController({
    win: lexWin,
    doc: lexDom.doc,
    storage: lexWin.localStorage,
    autoObserve: false,
    dispatchDelayMs: 5000,
  });

  lexCtrl.enqueue('Summarize git diff');
  lexDom.editor.textContent = 'Draft in lexical editor';
  const lexBlocked = lexCtrl.flushIfReady();
  assert.equal(lexBlocked.dispatched, false);
  assert.equal(lexBlocked.reason, 'composer-occupied');

  lexDom.editor.textContent = '';
  const lexSent = lexCtrl.flushIfReady();
  assert.equal(lexSent.dispatched, true);
  assert.deepEqual(lexDom.sentPayloads, ['Summarize git diff']);
  lexCtrl.destroy();
});

test('PromptQueue debounced auto-dispatch, custom onDispatch rollback, setEnabled, and lossless destroy()', async () => {
  const storage = createMockStorage();
  const dom = createQueueDom();
  let observerDisconnected = false;
  class FakeMutationObserver {
    constructor(cb) { this.cb = cb; }
    observe() {}
    disconnect() { observerDisconnected = true; }
  }
  const win = {
    document: dom.doc,
    localStorage: storage,
    Event,
    MutationObserver: FakeMutationObserver,
  };

  let streaming = true;
  let rejectNext = true;
  const dispatched = [];
  const ctrl = pqMod.createPromptQueueController({
    win,
    doc: dom.doc,
    storage,
    autoObserve: true,
    dispatchDelayMs: 25,
    isStreaming: () => streaming,
    onDispatch: (item) => {
      if (rejectNext) return false;
      dispatched.push(item.text);
      return true;
    },
  });

  ctrl.enqueue('Step 1');
  ctrl.enqueue('Step 2');

  // If onDispatch rejects, item is safely rolled back to head
  streaming = false;
  const rejected = ctrl.flushIfReady();
  assert.equal(rejected.dispatched, false);
  assert.deepEqual(ctrl.getItems().map((x) => x.text), ['Step 1', 'Step 2']);

  // Enable acceptance and trigger debounced sync()
  rejectNext = false;
  ctrl.sync();
  assert.equal(dispatched.length, 0, 'Must wait for dispatchDelayMs debounce');
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(dispatched, ['Step 1'], 'Must dispatch exactly one head item after debounce');
  assert.deepEqual(ctrl.getItems().map((x) => x.text), ['Step 2']);

  // Disable module -> disconnects observer, removes owned DOM & prevents dispatch without losing stored items
  ctrl.setEnabled(false);
  assert.equal(observerDisconnected, true);
  assert.equal(ctrl.getDebugState().observing, false);
  assert.equal(dom.doc.querySelector('[data-testid="ag-sag-queue-bar"]'), null);
  assert.equal(dom.doc.querySelectorAll('[data-ag-sag-owned="1"]').length, 0);
  assert.equal(ctrl.flushIfReady().dispatched, false);
  observerDisconnected = false;
  ctrl.setEnabled(true);
  assert.equal(ctrl.getDebugState().observing, true);
  assert.equal(dom.doc.querySelector('[data-testid="ag-sag-queue-bar"]').hidden, false);
  assert.deepEqual(ctrl.getItems().map((x) => x.text), ['Step 2']);

  // Destroy cleans up all timers, observer, and owned DOM nodes losslessly
  ctrl.destroy();
  assert.equal(observerDisconnected, true);
  assert.equal(ctrl.getDebugState().destroyed, true);
  assert.equal(dom.doc.querySelectorAll('[data-ag-sg-owned="1"]').length, 0);
  assert.equal(dom.doc.querySelectorAll('[data-ag-sag-owned="1"]').length, 0);
  assert.equal(dom.doc.querySelector('[data-testid="ag-sag-queue-bar"]'), null);
});

test('PromptQueue UMD global mount, input-cancel-button / data-testid approval interlocks, Lexical execCommand, send-button, and MutationObserver dispatch', async () => {
  // 1. Verify UMD browser global mount root.__agSagPromptQueue
  const code = fs.readFileSync(new URL('../packages/core/prompt-queue.js', import.meta.url), 'utf8');
  const sandbox = { globalThis: null, setTimeout, clearTimeout };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox);
  assert.ok(sandbox.__agSagPromptQueue, 'UMD must attach root.__agSagPromptQueue in browser mode');
  assert.equal(sandbox.__agSagPromptQueue.STORAGE_PREFIX, 'agSag.promptQueue.v1:');
  assert.equal(typeof sandbox.__agSagPromptQueue.createPromptQueueController, 'function');

  // 2. Lexical execCommand + [data-testid="send-button"] + input-cancel-button + [data-testid*="approval"] + MutationObserver
  const lexDom = createQueueDom({ lexical: true });
  lexDom.sendBtn.setAttribute('data-testid', 'send-button');
  let execCalls = 0;
  lexDom.doc.execCommand = (cmd, _ui, val) => {
    if (cmd === 'insertText') {
      execCalls += 1;
      lexDom.editor.textContent = val;
      return true;
    }
    return false;
  };

  let moCallback = null;
  class TriggerableMO {
    constructor(cb) { moCallback = cb; }
    observe() {}
    disconnect() {}
  }

  const cancelBtn = lexDom.makeEl('button');
  cancelBtn.setAttribute('data-testid', 'input-cancel-button');
  lexDom.inputBox.appendChild(cancelBtn);

  const approvalBanner = lexDom.makeEl('div');
  approvalBanner.setAttribute('data-testid', 'tool-approval-banner');
  lexDom.doc.body.appendChild(approvalBanner);

  const storage = createMockStorage();
  const ctrl = pqMod.createPromptQueueController({
    win: { document: lexDom.doc, localStorage: storage, Event, MutationObserver: TriggerableMO },
    doc: lexDom.doc,
    storage,
    autoObserve: true,
    dispatchDelayMs: 0,
  });

  ctrl.enqueue('Deploy docs preview');
  // Blocked by input-cancel-button
  assert.equal(ctrl.flushIfReady().reason, 'streaming');
  cancelBtn.remove();

  // Still blocked by [data-testid*="approval"]
  assert.equal(ctrl.flushIfReady().reason, 'blocking-approval');
  approvalBanner.remove();

  // Trigger MutationObserver callback to simulate DOM transition to idle
  moCallback([{ target: lexDom.doc.body }]);
  await new Promise((r) => setTimeout(r, 90));

  assert.equal(execCalls, 1, 'Lexical composer must prefer doc.execCommand("insertText")');
  assert.deepEqual(lexDom.sentPayloads, ['Deploy docs preview']);
  assert.equal(ctrl.getItems().length, 0);
  ctrl.destroy();
});

test('PromptQueue high-churn sync() does not starve dispatch timer, while blockers/switch/pause cancel timer immediately', async () => {
  const storage = createMockStorage();
  const dom = createQueueDom();
  const win = { document: dom.doc, localStorage: storage, Event };
  const dispatched = [];
  let activeCid = '11111111-2222-4333-8444-555555555555';

  const ctrl = pqMod.createPromptQueueController({
    win,
    doc: dom.doc,
    storage,
    autoObserve: false,
    dispatchDelayMs: 60,
    getCascadeId: () => activeCid,
    onDispatch: (item) => {
      dispatched.push(item.text);
      return true;
    },
  });

  ctrl.enqueue('Must not starve under frequent sync()');
  assert.equal(ctrl.getDebugState().pendingTimer, true);

  // Hammer sync() every 15ms (faster than 60ms dispatchDelayMs) for ~120ms
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 15));
    ctrl.sync();
  }
  assert.deepEqual(dispatched, ['Must not starve under frequent sync()'], 'Frequent ready sync() calls must preserve the active timer');
  assert.equal(ctrl.getItems().length, 0);

  // Verify that when readiness becomes false mid-countdown, timer IS cancelled and nothing dispatches
  ctrl.enqueue('Blocked mid-countdown');
  assert.equal(ctrl.getDebugState().pendingTimer, true);
  await new Promise((r) => setTimeout(r, 20));
  const permDialog = dom.makeEl('div');
  permDialog.setAttribute('data-testid', 'workspace-permission-modal');
  dom.doc.body.appendChild(permDialog);
  ctrl.sync();
  assert.equal(ctrl.getDebugState().pendingTimer, false);
  assert.equal(ctrl.getDebugState().lastSkipReason, 'blocking-approval');

  await new Promise((r) => setTimeout(r, 90));
  assert.equal(dispatched.length, 1, 'Cancelled timer must not dispatch while permission dialog is visible');
  permDialog.remove();

  // Verify session switch cancels pending timer
  ctrl.sync();
  assert.equal(ctrl.getDebugState().pendingTimer, true);
  activeCid = '22222222-3333-4444-8555-666666666666';
  ctrl.sync();
  assert.equal(ctrl.getDebugState().pendingTimer, false);
  await new Promise((r) => setTimeout(r, 90));
  assert.equal(dispatched.length, 1);

  ctrl.destroy();
});

test('PromptQueue permission/alertdialog approval interlocks (including ancestor visibility) and data-ag-sag-lang priority', () => {
  const storage = createMockStorage();
  const dom = createQueueDom();
  // Set data-ag-cs-lang to en, and data-ag-sag-lang to zh-CN -> must prefer data-ag-sag-lang
  dom.doc.documentElement.setAttribute('data-ag-cs-lang', 'en-US');
  dom.doc.documentElement.setAttribute('data-ag-sag-lang', 'zh-CN');

  const win = { document: dom.doc, localStorage: storage, Event, navigator: { language: 'en-US' } };
  const ctrl = pqMod.createPromptQueueController({
    win,
    doc: dom.doc,
    storage,
    autoObserve: false,
    dispatchDelayMs: 5000,
  });

  const bar = dom.doc.querySelector('[data-testid="ag-sag-queue-bar"]');
  assert.ok(bar.textContent.includes('+ 排队'), 'detectLang() must prioritize data-ag-sag-lang over data-ag-cs-lang');

  // Switch data-ag-sag-lang to English -> UI updates on sync
  dom.doc.documentElement.setAttribute('data-ag-sag-lang', 'en-US');
  ctrl.sync();
  assert.ok(bar.textContent.includes('+ Queue'), 'Switching data-ag-sag-lang must update UI strings');

  ctrl.enqueue('Check permission and alertdialog gating');

  // 1. Visible [data-testid*="permission"] blocks dispatch
  const permWrap = dom.makeEl('div');
  const permCard = dom.makeEl('div');
  permCard.setAttribute('data-testid', 'fs-permission-dialog');
  permWrap.appendChild(permCard);
  dom.doc.body.appendChild(permWrap);

  assert.equal(ctrl.flushIfReady().reason, 'blocking-approval');

  // Ancestor display:none hides permission modal -> unblocks check
  permWrap.style.display = 'none';
  // Add visible [role="alertdialog"] -> still blocks
  const alertWrap = dom.makeEl('div');
  const alertDialog = dom.makeEl('div');
  alertDialog.setAttribute('role', 'alertdialog');
  alertWrap.appendChild(alertDialog);
  dom.doc.body.appendChild(alertWrap);

  assert.equal(ctrl.flushIfReady().reason, 'blocking-approval');

  // Self hidden / ancestor display:none on alertdialog -> unblocks and dispatches
  alertWrap.style.display = 'none';
  const sent = ctrl.flushIfReady();
  assert.equal(sent.dispatched, true);
  assert.deepEqual(dom.sentPayloads, ['Check permission and alertdialog gating']);

  ctrl.destroy();
});

test('PromptQueue disabled initial state attaches zero MutationObservers and toggles observer/DOM cleanly on setEnabled', () => {
  const storage = createMockStorage();
  const dom = createQueueDom();
  let createdCount = 0;
  let observeCount = 0;
  let disconnectCount = 0;
  class CountingMO {
    constructor() { createdCount += 1; }
    observe() { observeCount += 1; }
    disconnect() { disconnectCount += 1; }
  }
  const win = {
    document: dom.doc,
    localStorage: storage,
    Event,
    MutationObserver: CountingMO,
  };

  // 1. Initial enabled: false -> zero observers, zero owned DOM nodes
  const ctrl = pqMod.createPromptQueueController({
    win,
    doc: dom.doc,
    storage,
    enabled: false,
    autoObserve: true,
    dispatchDelayMs: 500,
  });

  assert.equal(createdCount, 0, 'Must not construct MutationObserver when initially disabled');
  assert.equal(observeCount, 0, 'Must not observe DOM when initially disabled');
  assert.equal(ctrl.getDebugState().observing, false);
  assert.equal(dom.doc.querySelector('[data-testid="ag-sag-queue-bar"]'), null);
  assert.equal(dom.doc.querySelectorAll('[data-ag-sag-owned="1"]').length, 0);

  // 2. Enabling subscribes to shared DomMutationBus + HtmlAttrBus (2 underlying observers) and mounts owned DOM
  ctrl.setEnabled(true);
  assert.equal(observeCount, 2);
  assert.equal(ctrl.getDebugState().observing, true);
  assert.ok(dom.doc.querySelector('[data-testid="ag-sag-queue-bar"]'));

  // Enqueue item to create a pending timer, then disable -> disconnects shared observers, clears timer & removes owned DOM
  ctrl.enqueue('Pending task');
  assert.equal(ctrl.getDebugState().pendingTimer, true);
  ctrl.setEnabled(false);
  assert.equal(disconnectCount, 2);
  assert.equal(ctrl.getDebugState().observing, false);
  assert.equal(ctrl.getDebugState().pendingTimer, false);
  assert.equal(dom.doc.querySelector('[data-testid="ag-sag-queue-bar"]'), null);
  assert.equal(dom.doc.querySelector('#ag-sag-queue-css'), null);
  assert.equal(dom.doc.querySelectorAll('[data-ag-sag-owned="1"]').length, 0);

  // Re-enabling starts shared observers again and preserves queued item
  ctrl.setEnabled(true);
  assert.equal(observeCount, 4);
  assert.equal(ctrl.getDebugState().observing, true);
  assert.deepEqual(ctrl.getItems().map((x) => x.text), ['Pending task']);
  ctrl.destroy();
  assert.equal(disconnectCount, 4);

  // 3. autoObserve: false never starts MutationObserver even after setEnabled(true)
  const beforeObs = observeCount;
  const noObsCtrl = pqMod.createPromptQueueController({
    win,
    doc: dom.doc,
    storage,
    enabled: false,
    autoObserve: false,
  });
  noObsCtrl.setEnabled(true);
  assert.equal(observeCount, beforeObs);
  assert.equal(noObsCtrl.getDebugState().observing, false);
  noObsCtrl.destroy();
});

