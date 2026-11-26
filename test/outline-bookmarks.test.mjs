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
    style: {},
    _text: '',
    children: [],
    parentElement: null,
    scrolled: 0,
    get firstChild() { return el.children[0] || null; },
    get className() { return [...cls].join(' '); },
    set className(v) { cls.clear(); String(v || '').split(/\s+/).filter(Boolean).forEach((c) => cls.add(c)); },
    classList: { contains: (c) => cls.has(c), add: (c) => cls.add(c), remove: (c) => cls.delete(c) },
    get textContent() { return el.children.length ? el._text + el.children.map((c) => c.textContent).join('') : el._text; },
    set textContent(v) { el._text = String(v ?? ''); el.children.length = 0; },
    setAttribute(k, v) { attrs.set(k, String(v)); },
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
      const idx = el.children.indexOf(ref);
      if (idx >= 0) el.children.splice(idx, 0, c);
      else el.children.push(c);
      return c;
    },
    removeChild(c) {
      el.children = el.children.filter((x) => x !== c);
      c.parentElement = null;
      return c;
    },
    remove() {
      if (!el.parentElement) return;
      el.parentElement.children = el.parentElement.children.filter((x) => x !== el);
      el.parentElement = null;
    },
    scrollIntoView() { el.scrolled += 1; },
    addEventListener(ev, fn) { if (!ls.has(ev)) ls.set(ev, []); ls.get(ev).push(fn); },
    click() { for (const fn of ls.get('click') || []) fn({ preventDefault() {}, stopPropagation() {} }); },
    querySelectorAll(sel) {
      const out = [];
      const parts = String(sel).split(',').map((s) => s.trim()).filter(Boolean);
      const matchOne = (n, part) => {
        if (part.startsWith('.')) return n.classList.contains(part.slice(1).split('[')[0]);
        if (/^[a-zA-Z]+$/.test(part)) return n.tagName === part.toUpperCase();
        const m = /^\[([^\]=]+)(?:="([^"]*)")?\]$/.exec(part);
        if (m) return m[2] === undefined ? n.hasAttribute(m[1]) : n.getAttribute(m[1]) === m[2];
        return false;
      };
      const match = (n) => parts.some((p) => matchOne(n, p));
      const walk = (n) => {
        for (const c of n.children) {
          if (match(c)) out.push(c);
          walk(c);
        }
      };
      walk(el);
      return out;
    },
    closest(sel) {
      const m = /^\[([^\]=]+)(?:="([^"]*)")?\]$/.exec(String(sel || '').trim());
      let cur = el;
      while (cur) {
        if (m && (m[2] === undefined ? cur.hasAttribute(m[1]) : cur.getAttribute(m[1]) === m[2])) return cur;
        cur = cur.parentElement;
      }
      return null;
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

test('OutlineBookmarks native jump drawer: works without Obsidian Prism, redacts snippets, jumps with pulse, downloads ★ .md, and cleans up', async () => {
  const doc = {
    documentElement: null,
    body: null,
    createElement: (t) => makeNode(t, doc),
    querySelectorAll: (s) => doc.body.querySelectorAll(s),
    querySelector: (s) => doc.body.querySelector(s),
  };
  doc.documentElement = makeNode('html', doc);
  doc.documentElement.setAttribute('data-ag-cs-lang', 'en');
  doc.body = makeNode('body', doc);

  const conv = makeNode('div', doc);
  conv.setAttribute('data-testid', 'conversation-view');
  conv.setAttribute('data-cascade-id', 'bbbbbbbb-2222-4333-8444-cccccccccccc');
  const b1 = makeNode('div', doc);
  b1.setAttribute('data-testid', 'user-message-bubble');
  b1.textContent = 'Initial prompt with secret sk-liveSecretToken123456';
  const a1 = makeNode('div', doc);
  a1.setAttribute('data-testid', 'agent-response');
  a1.textContent = 'Initial architecture answer';
  const b2 = makeNode('div', doc);
  b2.setAttribute('data-testid', 'user-message-bubble');
  b2.textContent = 'Key rollout decision';
  conv.appendChild(b1);
  conv.appendChild(a1);
  conv.appendChild(b2);
  doc.body.appendChild(conv);

  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };

  let createdUrl = '';
  let downloadedPayload = null;
  const win = {
    document: doc,
    localStorage: storage,
    Blob: class MockBlob { constructor(parts, opts) { this.parts = parts; this.opts = opts; } },
    URL: {
      createObjectURL: () => { createdUrl = 'blob:mock-bm-1'; return createdUrl; },
      revokeObjectURL: () => {},
    },
    navigator: { clipboard: { writeText: async () => {} } },
  };

  const ctl = bmMod.createOutlineBookmarksController({
    win,
    doc,
    storage,
    enabled: true,
    autoObserve: false,
    onDownloadMarkdown: (p) => { downloadedPayload = p; },
  });

  // No bookmarks yet -> dock must not show
  assert.equal(doc.querySelector('[data-testid="ag-sg-bm-dock"]'), null);

  // Star turn 1 & turn 2
  b1.querySelector('.ag-sg-bm-star').click();
  b2.querySelector('.ag-sg-bm-star').click();

  const dock = doc.querySelector('[data-testid="ag-sg-bm-dock"]');
  assert.ok(dock && !dock.hidden, 'Native ★ N dock must surface when turns are bookmarked');
  const chip = dock.querySelector('[data-ag-sg-act="bm-drawer-toggle"]');
  assert.equal(chip.textContent, '★ 2');

  // Open drawer and verify secret redaction in snippet
  chip.click();
  const drawer = dock.querySelector('[data-testid="ag-sg-bm-drawer"]');
  assert.equal(drawer.hidden, false);
  const items = drawer.querySelectorAll('.ag-sg-bm-item');
  assert.equal(items.length, 2);
  assert.equal(items[0].textContent.includes('sk-liveSecretToken'), false, 'Drawer snippet must redact secrets');
  assert.ok(items[0].textContent.includes('[REDACTED_KEY]'));

  // Trigger ★ .md download from drawer footer
  drawer.querySelector('[data-ag-sg-act="bm-download-md"]').click();
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(downloadedPayload && downloadedPayload.ok && downloadedPayload.downloaded);
  assert.ok(downloadedPayload.filename.endsWith('.md'));
  assert.equal(createdUrl, 'blob:mock-bm-1');

  // Jump to Turn 2 -> scrolls bubble, adds pulse attribute, and closes drawer
  items[1].click();
  assert.equal(b2.scrolled, 1, 'Clicking bookmark item must scroll target turn into view');
  assert.equal(b2.getAttribute('data-ag-sg-pulse'), '1', 'Target turn must receive pulse highlight');
  assert.equal(drawer.hidden, true, 'Drawer must collapse after jump');

  // Teardown must clear pulse attribute, timers, and all owned DOM nodes
  ctl.destroy();
  assert.equal(b2.hasAttribute('data-ag-sg-pulse'), false, 'destroy() must remove active pulse attribute');
  assert.equal(doc.querySelectorAll('[data-ag-sg-owned="1"]').length, 0);
});

test('OutlineBookmarks inline action bar: places crisp 16x16 SVG bookmark beside native Copy & Undo buttons, never inside user bubble', () => {
  const doc = {
    documentElement: null,
    body: null,
    createElement: (t) => makeNode(t, doc),
    createElementNS: (_ns, t) => makeNode(t, doc),
    querySelectorAll: (s) => doc.body.querySelectorAll(s),
    querySelector: (s) => doc.body.querySelector(s),
  };
  doc.documentElement = makeNode('html', doc);
  doc.documentElement.setAttribute('data-ag-cs-lang', 'zh-CN');
  doc.body = makeNode('body', doc);

  const conv = makeNode('div', doc);
  conv.setAttribute('data-testid', 'conversation-view');
  conv.setAttribute('data-cascade-id', 'cccccccc-3333-4444-8555-dddddddddddd');

  const step = makeNode('div', doc);
  step.setAttribute('data-testid', 'user-input-step');
  const bubble = makeNode('div', doc);
  bubble.setAttribute('data-testid', 'user-message-bubble');
  bubble.textContent = 'Keep bubble 100% clean';

  const actions = makeNode('div', doc);
  actions.setAttribute('data-testid', 'user-message-actions');
  const timeSpan = makeNode('span', doc);
  timeSpan.textContent = '10m ago';
  const btnGroup = makeNode('div', doc);
  const copyBtn = makeNode('button', doc);
  copyBtn.setAttribute('aria-label', 'Copy');
  const undoBtn = makeNode('button', doc);
  undoBtn.setAttribute('data-testid', 'revert-button');
  btnGroup.appendChild(copyBtn);
  btnGroup.appendChild(undoBtn);
  actions.appendChild(timeSpan);
  actions.appendChild(btnGroup);

  step.appendChild(bubble);
  step.appendChild(actions);
  conv.appendChild(step);
  doc.body.appendChild(conv);

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

  // Must NEVER inject floating star inside the user message bubble
  assert.equal(bubble.querySelector('.ag-sg-bm-star'), null, 'Bookmark button must NOT sit inside user-message-bubble');
  const inlineBtn = btnGroup.querySelector('.ag-sg-bm-star');
  assert.ok(inlineBtn, 'Bookmark button must mount inline next to Copy & Undo buttons');
  assert.equal(inlineBtn.getAttribute('data-inline-action'), '1');
  assert.ok(inlineBtn.getAttribute('data-tip').includes('收藏本轮'));
  const svg = inlineBtn.querySelector('svg');
  assert.ok(svg && svg.getAttribute('width') === '16', 'Must render 16x16 SVG matching native Material icons');
  const outlinePath = svg.firstChild.getAttribute('d');

  // Toggling bookmark switches to filled SVG and updates tooltip
  inlineBtn.click();
  assert.equal(inlineBtn.getAttribute('data-starred'), '1');
  assert.notEqual(svg.firstChild.getAttribute('d'), outlinePath, 'Filled bookmark SVG path must differ from outline');
  assert.ok(inlineBtn.getAttribute('data-tip').includes('取消收藏'));

  ctl.destroy();
  assert.equal(btnGroup.querySelector('.ag-sg-bm-star'), null);
});
