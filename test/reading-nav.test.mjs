import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const readingNav = require('../packages/core/reading-nav.js');
const core = require('../packages/core/index.js');

function createReadingDom({ longLines = 50, shortLines = 10, turnCount = 3, withPrismNav = false } = {}) {
  const matches = (el, selList) =>
    selList.split(',').some((raw) => {
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

  const scrolled = [];
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
      _text: '',
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
        if (k === 'class') el.className = String(v);
      },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      hasAttribute(k) { return attrs.has(k); },
      removeAttribute(k) { attrs.delete(k); },
      appendChild(c) {
        if (c.parentElement) c.remove();
        c.parentElement = el;
        c.parentNode = el;
        el.children.push(c);
        return c;
      },
      insertBefore(c, ref) {
        if (!ref) return el.appendChild(c);
        if (c.parentElement) c.remove();
        const i = el.children.indexOf(ref);
        c.parentElement = el;
        c.parentNode = el;
        if (i < 0) el.children.push(c);
        else el.children.splice(i, 0, c);
        return c;
      },
      removeChild(c) {
        const i = el.children.indexOf(c);
        if (i >= 0) el.children.splice(i, 1);
        c.parentElement = null;
        c.parentNode = null;
        return c;
      },
      remove() { el.parentElement?.removeChild(el); },
      addEventListener(ev, fn) {
        if (!ls.has(ev)) ls.set(ev, []);
        ls.get(ev).push(fn);
      },
      removeEventListener(ev, fn) {
        const arr = ls.get(ev);
        if (!arr) return;
        const i = arr.indexOf(fn);
        if (i >= 0) arr.splice(i, 1);
      },
      dispatchEvent(ev) {
        const e = typeof ev === 'string' ? { type: ev } : ev;
        if (!e.target) e.target = el;
        for (const fn of [...(ls.get(e.type) || [])]) fn(e);
        return true;
      },
      click() { el.dispatchEvent({ type: 'click', target: el, preventDefault() {}, stopPropagation() {} }); },
      scrollIntoView(opts) { scrolled.push({ el, opts }); },
      closest(sel) {
        let p = el;
        while (p) {
          if (matches(p, sel)) return p;
          p = p.parentElement;
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
    };
    return el;
  };

  const docLs = new Map();
  const doc = {
    documentElement: makeEl('html'),
    head: makeEl('head'),
    body: makeEl('body'),
    createElement: makeEl,
    getElementById(id) { return doc.documentElement.querySelector(`#${id}`); },
    querySelector(sel) { return doc.documentElement.querySelector(sel); },
    querySelectorAll(sel) { return doc.documentElement.querySelectorAll(sel); },
    addEventListener(ev, fn) {
      if (!docLs.has(ev)) docLs.set(ev, []);
      docLs.get(ev).push(fn);
    },
    removeEventListener(ev, fn) {
      const arr = docLs.get(ev);
      if (!arr) return;
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
    dispatchEvent(ev) {
      for (const fn of [...(docLs.get(ev.type) || [])]) fn(ev);
      return true;
    },
    listenerCount(ev) { return (docLs.get(ev) || []).length; },
  };
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);

  const conv = makeEl('div');
  conv.setAttribute('data-testid', 'conversation-view');
  for (let i = 1; i <= turnCount; i += 1) {
    const u = makeEl('div');
    u.setAttribute('data-testid', 'user-message-bubble');
    u.textContent = `User turn #${i}`;
    conv.appendChild(u);

    const a = makeEl('div');
    a.setAttribute('data-testid', 'agent-response');
    if (i === 1) {
      const longPre = makeEl('pre');
      longPre.textContent = Array.from({ length: longLines }, (_, idx) => `const line${idx + 1} = ${idx + 1};`).join('\n');
      a.appendChild(longPre);
      const shortPre = makeEl('pre');
      shortPre.textContent = Array.from({ length: shortLines }, (_, idx) => `short ${idx + 1}`).join('\n');
      a.appendChild(shortPre);
    } else {
      a.textContent = `Assistant reply #${i}`;
    }
    conv.appendChild(a);
  }
  doc.body.appendChild(conv);

  const textarea = makeEl('textarea');
  doc.body.appendChild(textarea);

  if (withPrismNav) {
    const pNav = makeEl('div');
    pNav.className = 'ag-cs-nav-outline-trigger';
    doc.body.appendChild(pNav);
  }

  const store = new Map();
  const storage = {
    get length() { return store.size; },
    key: (i) => Array.from(store.keys())[i] ?? null,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };

  const win = {
    document: doc,
    localStorage: storage,
    navigator: { language: 'en-US' },
    addEventListener() {},
    removeEventListener() {},
  };

  return { win, doc, storage, conv, textarea, scrolled };
}

test('countCodeLines & clampCollapseLines handle edge cases cleanly', () => {
  assert.equal(readingNav.countCodeLines(''), 0);
  assert.equal(readingNav.countCodeLines('a\nb\nc\n\n'), 3);
  assert.equal(readingNav.clampCollapseLines(5), 20);
  assert.equal(readingNav.clampCollapseLines(500), 200);
  assert.equal(readingNav.clampCollapseLines(60), 60);
});

test('ReadingNav folds >= 40 line code blocks, preserves user expand state, copies code, navigates turns via Alt+Arrows without hijacking inputs, and destroys cleanly', () => {
  const { win, doc, conv, textarea, scrolled } = createReadingDom({ longLines: 50, shortLines: 10, turnCount: 3 });
  const copied = [];
  const rn = readingNav.createReadingNavController({
    win,
    doc,
    enabled: false,
    autoObserve: false,
    onCopyCode: (txt) => copied.push(txt),
    getStarredTurns: () => [2],
  });

  // Disabled: zero code bars, zero rail, zero listeners
  assert.equal(doc.querySelector(`[${readingNav.CODE_BAR_ATTR}="1"]`), null);
  assert.equal(doc.querySelector(`[data-testid="${readingNav.RAIL_TESTID}"]`), null);
  assert.equal(doc.listenerCount('keydown'), 0);

  // Enable
  rn.setEnabled(true);
  const pres = conv.querySelectorAll('pre');
  assert.equal(pres[0].getAttribute(readingNav.CODE_FOLDED_ATTR), '1', '50-line pre must auto-fold');
  assert.equal(pres[1].getAttribute(readingNav.CODE_FOLDED_ATTR), null, '10-line pre must stay unfolded');
  assert.equal(rn.getDebugState().foldedCodeBlocks, 1);

  // Expand code block via sticky bar button and confirm rescan preserves user expansion
  const bar = conv.querySelector(`[${readingNav.CODE_BAR_ATTR}="1"]`);
  assert.ok(bar);
  bar.querySelector('[data-ag-sag-code-toggle="1"]').click();
  assert.equal(pres[0].getAttribute(readingNav.CODE_FOLDED_ATTR), null);
  rn.sync();
  assert.equal(pres[0].getAttribute(readingNav.CODE_FOLDED_ATTR), null, 'User expansion must survive sync()');

  // Copy button copies full pre text
  bar.querySelector('[data-ag-sag-code-copy="1"]').click();
  assert.equal(copied.length, 1);
  assert.ok(copied[0].includes('const line50 = 50;'));

  // Floating mini rail shows 3 dots with turn #2 starred
  const rail = doc.querySelector(`[data-testid="${readingNav.RAIL_TESTID}"]`);
  assert.ok(rail);
  assert.equal(rail.querySelectorAll('[data-ag-sag-rnav-turn]').length, 3);
  assert.equal(rail.querySelector('[data-ag-sag-rnav-turn="2"]').getAttribute('data-starred'), '1');

  // Alt+ArrowDown navigates turn 0 -> turn 1, but ignores events targeting textarea
  doc.dispatchEvent({ type: 'keydown', key: 'ArrowDown', altKey: true, target: textarea, preventDefault() {}, stopPropagation() {} });
  assert.equal(scrolled.length, 0, 'Must not hijack Alt+Arrow inside editable inputs');

  doc.dispatchEvent({ type: 'keydown', key: 'ArrowDown', altKey: true, target: doc.body, preventDefault() {}, stopPropagation() {} });
  assert.equal(rn.getDebugState().currentTurnIndex, 0);
  doc.dispatchEvent({ type: 'keydown', key: 'ArrowDown', altKey: true, target: doc.body, preventDefault() {}, stopPropagation() {} });
  assert.equal(rn.getDebugState().currentTurnIndex, 1);
  doc.dispatchEvent({ type: 'keydown', key: 'ArrowUp', altKey: true, target: doc.body, preventDefault() {}, stopPropagation() {} });
  assert.equal(rn.getDebugState().currentTurnIndex, 0);

  // Threshold update above 50 restores pre cleanly
  rn.setCollapseLines(60);
  assert.equal(conv.querySelector(`[${readingNav.CODE_BAR_ATTR}="1"]`), null);

  // Clean destroy removes all nodes, attributes & keydown listeners
  rn.setCollapseLines(40);
  rn.destroy();
  assert.equal(doc.querySelectorAll('[data-ag-sg-owned="1"], [data-ag-sag-owned="1"]').length, 0);
  assert.equal(pres[0].hasAttribute(readingNav.CODE_FOLDED_ATTR), false);
  assert.equal(pres[0].hasAttribute(readingNav.CODE_ENHANCED_ATTR), false);
  assert.equal(doc.listenerCount('keydown'), 0);
});

test('ReadingNav yields floating rail cleanly when Obsidian Prism outline nav is present, while keeping code folding active', () => {
  const { win, doc } = createReadingDom({ longLines: 45, turnCount: 3, withPrismNav: true });
  const rn = readingNav.createReadingNavController({
    win,
    doc,
    enabled: true,
    autoObserve: false,
  });

  try {
    assert.equal(rn.getDebugState().railYielded, true);
    assert.equal(doc.querySelector(`[data-testid="${readingNav.RAIL_TESTID}"]`), null);
    assert.equal(rn.getDebugState().foldedCodeBlocks, 1);
  } finally {
    rn.destroy();
  }
});

test('mountSag integrates readingNav (default OFF, power preset ON) and zero-residue teardown', () => {
  const { win, doc, storage } = createReadingDom({ longLines: 48, turnCount: 2 });
  const api = core.mountSag({
    win,
    doc,
    storage,
    autoPoll: false,
    autoObserve: false,
    bindVaultShortcut: false,
    bindDrawerShortcut: false,
  });

  try {
    assert.equal(api.getConfig().modules.readingNav, false);
    assert.equal(api.getDebugState().readingNav.enabled, false);

    api.applyPreset('power');
    assert.equal(api.getConfig().modules.readingNav, true);
    assert.equal(api.getDebugState().readingNav.foldedCodeBlocks, 1);
    assert.ok(doc.querySelector(`[data-testid="${readingNav.RAIL_TESTID}"]`));
  } finally {
    api.destroy();
  }
  assert.equal(doc.querySelectorAll('[data-ag-sg-owned="1"], [data-ag-sag-owned="1"]').length, 0);
});
