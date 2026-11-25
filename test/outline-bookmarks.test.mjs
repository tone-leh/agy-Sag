import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const bmMod = require('../packages/core/outline-bookmarks.js');

function makeNode(tag, doc) {
  const attrs = new Map();
  const cls = new Set();
  const ls = new Map();
  const el = {
    tagName: String(tag).toUpperCase(),
    nodeType: 1,
    hidden: false,
    title: '',
    _text: '',
    children: [],
    parentElement: null,
    get className() { return [...cls].join(' '); },
    set className(v) { cls.clear(); String(v || '').split(/\s+/).filter(Boolean).forEach((c) => cls.add(c)); },
    classList: { contains: (c) => cls.has(c), add: (c) => cls.add(c), remove: (c) => cls.delete(c) },
    get textContent() { return el.children.length ? el._text + el.children.map((c) => c.textContent).join('') : el._text; },
    set textContent(v) { el._text = String(v ?? ''); el.children.length = 0; },
    setAttribute(k, v) { attrs.set(k, String(v)); },
    getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
    hasAttribute(k) { return attrs.has(k); },
    removeAttribute(k) { attrs.delete(k); },
    appendChild(c) { c.parentElement = el; el.children.push(c); return c; },
    remove() {
      if (!el.parentElement) return;
      el.parentElement.children = el.parentElement.children.filter((x) => x !== el);
      el.parentElement = null;
    },
    addEventListener(ev, fn) { if (!ls.has(ev)) ls.set(ev, []); ls.get(ev).push(fn); },
    click() { for (const fn of ls.get('click') || []) fn({ preventDefault() {}, stopPropagation() {} }); },
    querySelectorAll(sel) {
      const out = [];
      const match = (n) => {
        if (sel.startsWith('.')) return n.classList.contains(sel.slice(1).split('[')[0]);
        const m = /^\[([^\]=]+)(?:="([^"]*)")?\]$/.exec(sel);
        if (m) return m[2] === undefined ? n.hasAttribute(m[1]) : n.getAttribute(m[1]) === m[2];
        return false;
      };
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

test('OutlineBookmarks: decorates user turns & Prism outline popover, persists per cascadeId, filters bookmarked rows, and tears down cleanly', () => {
  const doc = {
    documentElement: null,
    body: null,
    createElement: (t) => makeNode(t, doc),
    querySelectorAll: (s) => doc.body.querySelectorAll(s),
    querySelector: (s) => doc.body.querySelector(s),
  };
  doc.documentElement = makeNode('html', doc);
  doc.documentElement.setAttribute('data-ag-cs-lang', 'zh-CN');
  doc.body = makeNode('body', doc);

  const conv = makeNode('div', doc);
  conv.setAttribute('data-testid', 'conversation-view');
  conv.setAttribute('data-cascade-id', 'aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb');
  const b1 = makeNode('div', doc);
  b1.setAttribute('data-testid', 'user-message-bubble');
  b1.textContent = 'Turn 1';
  const b2 = makeNode('div', doc);
  b2.setAttribute('data-testid', 'user-message-bubble');
  b2.textContent = 'Turn 2';
  conv.appendChild(b1);
  conv.appendChild(b2);

  // Simulate Obsidian Prism outline popover
  const pop = makeNode('div', doc);
  pop.className = 'ag-cs-nav-outline-popover';
  const head = makeNode('div', doc);
  head.className = 'ag-cs-nav-outline-head';
  const row1 = makeNode('button', doc);
  row1.className = 'ag-cs-nav-outline-item';
  row1.setAttribute('data-turn-num', '1');
  const row2 = makeNode('button', doc);
  row2.className = 'ag-cs-nav-outline-item';
  row2.setAttribute('data-turn-num', '2');
  pop.appendChild(head);
  pop.appendChild(row1);
  pop.appendChild(row2);

  doc.body.appendChild(conv);
  doc.body.appendChild(pop);

  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };

  const ctl = bmMod.createOutlineBookmarksController({
    win: { document: doc, localStorage: storage },
    doc,
    storage,
    enabled: true,
    autoObserve: false,
  });

  // Star Turn 2 via bubble star button
  const star2 = b2.querySelector('.ag-sg-bm-star');
  assert.ok(star2, 'Turn 2 must have bookmark star button');
  star2.click();
  assert.deepEqual(ctl.getBookmarks(), [2]);
  assert.equal(star2.getAttribute('data-starred'), '1');

  // Toggle outline bookmarked-only filter
  const filterBtn = head.querySelector('.ag-sg-outline-bm-filter');
  assert.ok(filterBtn);
  filterBtn.click();
  assert.equal(row1.hidden, true, 'Unstarred Turn 1 outline item must hide under bookmark filter');
  assert.equal(row2.hidden, false, 'Starred Turn 2 outline item must remain visible');

  // Teardown must remove all owned stars/buttons and unhide filtered rows
  ctl.destroy();
  assert.equal(row1.hidden, false, 'destroy() must restore hidden outline rows');
  assert.equal(doc.querySelectorAll('[data-ag-sg-owned="1"]').length, 0);
});
