import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const promptQueueMod = require('../packages/core/prompt-queue.js');
const draftGuardMod = require('../packages/core/draft-guard.js');
const promptLibraryMod = require('../packages/core/prompt-library.js');
const coexistMod = require('../packages/core/coexist.js');

function makeMemStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

function makeEl(tag) {
  const attrs = new Map();
  const cls = new Set();
  const ls = new Map();
  const el = {
    tagName: String(tag).toUpperCase(),
    nodeType: 1,
    value: '',
    hidden: false,
    disabled: false,
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
    setAttribute(k, v) { attrs.set(k, String(v)); if (k === 'class') el.className = String(v); },
    getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
    hasAttribute(k) { return attrs.has(k); },
    removeAttribute(k) { attrs.delete(k); },
    appendChild(c) { if (c.parentElement) c.remove(); c.parentElement = el; c.parentNode = el; el.children.push(c); return c; },
    insertBefore(c, ref) { if (!ref) return el.appendChild(c); const i = el.children.indexOf(ref); c.parentElement = el; c.parentNode = el; el.children.splice(i < 0 ? el.children.length : i, 0, c); return c; },
    removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); c.parentElement = null; c.parentNode = null; return c; },
    remove() { el.parentElement?.removeChild(el); },
    contains(other) {
      if (other === el) return true;
      for (const c of el.children) { if (c.contains?.(other)) return true; }
      return false;
    },
    closest(sel) {
      let cur = el;
      while (cur) {
        if (sel.includes('conversation-view') && cur.getAttribute('data-testid') === 'conversation-view') return cur;
        if (sel.includes('data-file-path') && cur.hasAttribute('data-file-path')) return cur;
        if (sel.includes('data-ag-sg-owned') && (cur.getAttribute('data-ag-sg-owned') === '1' || cur.getAttribute('data-ag-sag-owned') === '1')) return cur;
        cur = cur.parentElement;
      }
      return null;
    },
    focus() {},
    addEventListener(ev, fn) { if (!ls.has(ev)) ls.set(ev, []); ls.get(ev).push(fn); },
    removeEventListener(ev, fn) { const a = ls.get(ev); if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
    dispatchEvent(ev) { const e = typeof ev === 'string' ? { type: ev } : ev; for (const fn of [...(ls.get(e.type) || [])]) fn(e); return true; },
    click() { el.dispatchEvent({ type: 'click', target: el, preventDefault() {}, stopPropagation() {} }); },
    querySelectorAll(sel) {
      const out = [];
      const parts = sel.split(',').map((s) => s.trim());
      const match = (n) => parts.some((p) => {
        if ((p === 'textarea' || p.endsWith(' textarea')) && n.tagName === 'TEXTAREA') return true;
        if (p.startsWith('.') && n.classList.contains(p.slice(1))) return true;
        const mEq = p.match(/^\[([a-zA-Z0-9-]+)="([^"]+)"\]$/);
        if (mEq && n.getAttribute(mEq[1]) === mEq[2]) return true;
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
}

test('Phase 11: promptQueue supports inline editItem & moveToTop priority jump', () => {
  const storage = makeMemStorage();
  const pq = promptQueueMod.createPromptQueueController({
    storage,
    enabled: true,
    paused: true,
    autoObserve: false,
    doc: null,
    win: {},
  });
  try {
    const a = pq.enqueue('First step');
    const b = pq.enqueue('Second step');
    const c = pq.enqueue('Third step');
    assert.equal(pq.editItem(b.id, 'Second step updated'), true);
    assert.equal(pq.getItems()[1].text, 'Second step updated');
    assert.equal(pq.moveToTop(c.id), true);
    assert.deepEqual(
      pq.getItems().map((x) => x.text),
      ['Third step', 'First step', 'Second step updated']
    );
    assert.equal(pq.moveToTop(c.id), false, 'Already at top');
    assert.equal(pq.editItem(a.id, '   '), false, 'Blank edit rejected');
  } finally {
    pq.destroy();
  }
});

test('Phase 11: draftGuard records 30-item redacted sent history and cycles via Ctrl+ArrowUp/Down', () => {
  const storage = makeMemStorage();
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
  const box = makeEl('div');
  box.setAttribute('data-testid', 'agent-input-box');
  const ta = makeEl('textarea');
  box.appendChild(ta);
  doc.body.appendChild(box);

  const dg = draftGuardMod.createDraftGuardController({
    win: { document: doc, Event: class E { constructor(t) { this.type = t; } }, addEventListener() {}, removeEventListener() {} },
    doc,
    storage,
    enabled: true,
    debounceMs: 0,
  });
  try {
    dg.markCurrentSent(null, 'Deploy with sk-proj-SECRET1234567890');
    dg.markCurrentSent(null, 'Run unit tests');
    const hist = dg.getSentHistory();
    assert.equal(hist.length, 2);
    assert.equal(hist[0], 'Run unit tests');
    assert.ok(!hist[1].includes('sk-proj-SECRET1234567890'), 'Secrets must be redacted in sent history');

    // Empty composer -> Ctrl+Up recalls newest, then older, Ctrl+Down returns to empty
    ta.value = '';
    const r1 = dg.cycleSentHistory(-1);
    assert.equal(r1.ok, true);
    assert.equal(ta.value, 'Run unit tests');
    const r2 = dg.cycleSentHistory(-1);
    assert.equal(r2.ok, true);
    assert.ok(ta.value.includes('[REDACTED_KEY]'));
    const r3 = dg.cycleSentHistory(1);
    assert.equal(r3.ok, true);
    assert.equal(ta.value, 'Run unit tests');
    const r4 = dg.cycleSentHistory(1);
    assert.equal(r4.ok, true);
    assert.equal(ta.value, '');
  } finally {
    dg.destroy();
  }

  // Verify contenteditable (Lexical) overwrites cleanly via scoped selection instead of concatenating
  const docCe = {
    documentElement: makeEl('html'),
    head: makeEl('head'),
    body: makeEl('body'),
    createElement: makeEl,
    createRange: () => ({ selectNodeContents() {} }),
    execCommand(cmd, _ui, val) {
      if (cmd === 'insertText') {
        ce.textContent = rangeSelected ? String(val || '') : ce.textContent + String(val || '');
        rangeSelected = false;
        return true;
      }
      if (cmd === 'delete') {
        if (rangeSelected) ce.textContent = '';
        rangeSelected = false;
        return true;
      }
      return false;
    },
    getElementById: () => null,
    querySelector: (s) => docCe.documentElement.querySelector(s),
    querySelectorAll: (s) => docCe.documentElement.querySelectorAll(s),
    addEventListener() {},
    removeEventListener() {},
  };
  let rangeSelected = false;
  docCe.documentElement.appendChild(docCe.head);
  docCe.documentElement.appendChild(docCe.body);
  const boxCe = makeEl('div');
  boxCe.setAttribute('data-testid', 'agent-input-box');
  const ce = makeEl('div');
  ce.setAttribute('contenteditable', 'true');
  boxCe.appendChild(ce);
  docCe.body.appendChild(boxCe);

  const dgCe = draftGuardMod.createDraftGuardController({
    win: {
      document: docCe,
      Event: class E { constructor(t) { this.type = t; } },
      getSelection: () => ({ removeAllRanges() {}, addRange() { rangeSelected = true; } }),
      addEventListener() {},
      removeEventListener() {},
    },
    doc: docCe,
    storage: makeMemStorage(),
    enabled: true,
    debounceMs: 0,
  });
  try {
    dgCe.markCurrentSent(null, 'First lexical prompt');
    dgCe.markCurrentSent(null, 'Second lexical prompt');
    dgCe.cycleSentHistory(-1);
    assert.equal(ce.textContent, 'Second lexical prompt');
    dgCe.cycleSentHistory(-1);
    assert.equal(ce.textContent, 'First lexical prompt', 'Must replace contenteditable instead of concatenating');
    dgCe.cycleSentHistory(1);
    assert.equal(ce.textContent, 'Second lexical prompt');
    dgCe.cycleSentHistory(1);
    assert.equal(ce.textContent, '', 'Must clear contenteditable back to empty');
  } finally {
    dgCe.destroy();
  }
});

test('Phase 11: promptLibrary supports // quick open, selection quote pill, and standalone context menu with Prism yield', () => {
  const doc = {
    documentElement: makeEl('html'),
    head: makeEl('head'),
    body: makeEl('body'),
    createElement: makeEl,
    getElementById: () => null,
    querySelector: (s) => doc.documentElement.querySelector(s),
    querySelectorAll: (s) => doc.documentElement.querySelectorAll(s),
    addEventListener(ev, fn) { doc.body.addEventListener(ev, fn); },
    removeEventListener(ev, fn) { doc.body.removeEventListener(ev, fn); },
  };
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);

  const conv = makeEl('div');
  conv.setAttribute('data-testid', 'conversation-view');
  const fileChip = makeEl('code');
  fileChip.setAttribute('data-file-path', 'packages/core/index.js');
  fileChip.textContent = 'packages/core/index.js';
  conv.appendChild(fileChip);
  doc.body.appendChild(conv);

  const box = makeEl('div');
  box.setAttribute('data-testid', 'agent-input-box');
  const ta = makeEl('textarea');
  box.appendChild(ta);
  doc.body.appendChild(box);

  let copied = '';
  const win = {
    document: doc,
    Event: class E { constructor(t) { this.type = t; } },
    getSelection: () => ({ toString: () => 'TypeError: cannot read properties of undefined', anchorNode: fileChip }),
  };

  const pl = promptLibraryMod.createPromptLibraryController({
    win,
    doc,
    coexist: coexistMod,
    enabled: true,
    autoObserve: false,
    onCopyText: (txt) => { copied = txt; },
  });
  try {
    // 1) Typing "//" opens command palette and clears "//"
    ta.value = '//';
    doc.body.dispatchEvent({ type: 'input', target: ta });
    assert.equal(pl.getDebugState().modalOpen, true, 'Typing // must open prompt library');
    assert.equal(ta.value, '', '// trigger must clear before opening');
    pl.close();

    // 2) Standalone context menu opens for file path & selection
    const opened = pl.openContextMenu({ selection: 'TypeError: fail', filePath: 'packages/core/index.js', x: 50, y: 80 });
    assert.equal(opened, true);
    const insertAtBtn = doc.querySelector('[data-ag-sag-ctx-act="insert-at"]');
    assert.ok(insertAtBtn);
    insertAtBtn.click();
    assert.ok(ta.value.includes('@packages/core/index.js'));

    // Copy path via context menu
    pl.openContextMenu({ filePath: 'packages/core/index.js', x: 50, y: 80 });
    doc.querySelector('[data-ag-sag-ctx-act="copy-path"]').click();
    assert.equal(copied, 'packages/core/index.js');

    // 3) Prism context menu or generic Prism data-ag-cs-style present -> yields automatically
    win.__agPrismBtwMenu = true;
    assert.equal(pl.openContextMenu({ selection: 'hello world', x: 10, y: 10 }), false, 'Must yield to Prism context menu');
    win.__agPrismBtwMenu = false;
    doc.documentElement.setAttribute('data-ag-cs-style', 'obsidian');
    assert.equal(pl.openContextMenu({ selection: 'hello world', x: 10, y: 10 }), false, 'Must yield when Prism style host detected');
  } finally {
    pl.destroy();
  }
  assert.equal(doc.querySelector('[data-testid="ag-sag-ctx-menu"]'), null);
  assert.equal(doc.querySelector('[data-testid="ag-sag-sel-pill"]'), null);
});
