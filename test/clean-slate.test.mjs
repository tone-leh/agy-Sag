import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cleanSlate = require('../packages/core/clean-slate.js');
const core = require('../packages/core/index.js');

function createStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (i) => Array.from(m.keys())[i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

function createCleanSlateDom({ cid, projectId }) {
  const matches = (el, selList) =>
    selList.split(',').some((raw) => {
      const s = raw.trim();
      if (!s) return false;
      if (s.startsWith('#')) return el.id === s.slice(1);
      let rest = s;
      const tm = rest.match(/^[a-zA-Z0-9-]+/);
      if (tm) { if (el.tagName !== tm[0].toUpperCase()) return false; rest = rest.slice(tm[0].length); }
      for (const m of rest.matchAll(/\.([a-zA-Z0-9_-]+)/g)) { if (!el.classList.contains(m[1])) return false; }
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
      _text: '',
      children: [],
      parentElement: null,
      get isConnected() { let p = el; while (p) { if (p === doc.documentElement) return true; p = p.parentElement; } return false; },
      get firstChild() { return el.children[0] || null; },
      get className() { return [...cls].join(' '); },
      set className(v) { cls.clear(); String(v || '').split(/\s+/).filter(Boolean).forEach((c) => cls.add(c)); },
      classList: { add: (...a) => a.forEach((c) => c && cls.add(c)), remove: (...a) => a.forEach((c) => cls.delete(c)), contains: (c) => cls.has(c) },
      get textContent() { return el.children.length ? el._text + el.children.map((c) => c.textContent).join('') : el._text; },
      set textContent(v) { el._text = String(v ?? ''); el.children.length = 0; },
      setAttribute(k, v) { attrs.set(k, String(v)); if (k === 'id') el.id = String(v); },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      hasAttribute(k) { return attrs.has(k); },
      removeAttribute(k) { attrs.delete(k); },
      appendChild(c) { if (c.parentElement) c.remove(); c.parentElement = el; el.children.push(c); return c; },
      insertBefore(c, ref) { if (c.parentElement) c.remove(); c.parentElement = el; const i = el.children.indexOf(ref); if (i >= 0) el.children.splice(i, 0, c); else el.children.push(c); return c; },
      removeChild(c) { el.children = el.children.filter((x) => x !== c); c.parentElement = null; return c; },
      remove() { if (el.parentElement) el.parentElement.removeChild(el); },
      closest(sel) { let cur = el; while (cur) { if (matches(cur, sel)) return cur; cur = cur.parentElement; } return null; },
      querySelectorAll(sel) { const out = []; const w = (n) => { for (const c of n.children) { if (matches(c, sel)) out.push(c); w(c); } }; w(el); return out; },
      querySelector(sel) { return el.querySelectorAll(sel)[0] || null; },
      addEventListener(ev, fn) { if (!ls.has(ev)) ls.set(ev, new Set()); ls.get(ev).add(fn); },
      removeEventListener(ev, fn) { ls.get(ev)?.delete(fn); },
      dispatchEvent(ev) { for (const fn of ls.get(ev.type) || []) fn(ev); },
      focus() {},
      click() { if (el.disabled) return; for (const fn of ls.get('click') || []) fn({ target: el, preventDefault() {}, stopPropagation() {} }); },
    };
    return el;
  };

  const docListeners = new Map();
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
  doc.documentElement.setAttribute('lang', 'zh-CN');
  doc.head = makeEl('head');
  doc.body = makeEl('body');
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);

  // Two project "New Conversation in Project" links + global new button
  const otherProjLink = makeEl('a');
  otherProjLink.setAttribute('href', '/?project=other-proj-999');
  otherProjLink.setAttribute('aria-label', 'New Conversation in Project');
  const sameProjLink = makeEl('a');
  sameProjLink.setAttribute('href', `/?project=${projectId}`);
  sameProjLink.setAttribute('aria-label', 'New Conversation in Project');
  const globalNew = makeEl('a');
  globalNew.setAttribute('data-testid', 'new-conversation-button');
  globalNew.setAttribute('href', '/');
  doc.body.appendChild(otherProjLink);
  doc.body.appendChild(sameProjLink);
  doc.body.appendChild(globalNew);

  const conv = makeEl('div');
  conv.setAttribute('data-testid', 'conversation-view');
  if (cid) conv.setAttribute('data-cascade-id', cid);
  const u1 = makeEl('div');
  u1.setAttribute('data-testid', 'user-message-bubble');
  u1.textContent = 'Build login service with token sk-secretKey1234567890abcd';
  const a1 = makeEl('div');
  a1.setAttribute('data-testid', 'agent-response');
  a1.textContent = 'Finished JWT middleware.\n```js\nconst hugeCodeDump = 123456;\n```\nReady for refresh tests.';
  conv.appendChild(u1);
  conv.appendChild(a1);

  const compWrap = makeEl('div');
  const ib = makeEl('div');
  ib.setAttribute('data-testid', 'agent-input-box');
  const ta = makeEl('textarea');
  ib.appendChild(ta);
  const footer = makeEl('div');
  footer.className = 'agy-composer-footer';
  footer.appendChild(makeEl('div'));
  footer.appendChild(makeEl('div'));
  ib.appendChild(footer);
  compWrap.appendChild(ib);

  doc.body.appendChild(conv);
  doc.body.appendChild(compWrap);

  return { doc, conv, ta, sameProjLink, otherProjLink, globalNew };
}

test('CleanSlate helpers: parseClearCommand & buildCleanRestartBrief strip code blocks, redact secrets, and stay ultra-compact', () => {
  assert.deepEqual(cleanSlate.parseClearCommand('/clear'), { mode: 'keep', focus: '' });
  assert.deepEqual(cleanSlate.parseClearCommand('/clear blank'), { mode: 'blank', focus: '' });
  assert.deepEqual(cleanSlate.parseClearCommand('/clear keep'), { mode: 'keep', focus: '' });
  assert.deepEqual(cleanSlate.parseClearCommand('/clear 续接'), { mode: 'keep', focus: '' });
  assert.deepEqual(cleanSlate.parseClearCommand('/clear finish OAuth'), { mode: 'keep', focus: 'finish OAuth' });
  assert.equal(cleanSlate.parseClearCommand('normal message /clear'), null);

  const brief = cleanSlate.buildCleanRestartBrief({
    turns: [
      { turnNum: 1, user: 'Auth with sk-liveSecret999999999999', assistant: 'Done.\n```ts\nconst huge = true;\n```' },
    ],
    focus: 'continue writing unit tests',
  });
  assert.ok(brief.length <= cleanSlate.MAX_BRIEF_CHARS);
  assert.ok(brief.includes('[REDACTED_KEY]'));
  assert.equal(brief.includes('sk-liveSecret999999999999'), false);
  assert.equal(brief.includes('huge = true'), false, 'Code blocks must be stripped to keep token cache tiny');
  assert.ok(brief.includes('continue writing unit tests'));
});

test('CleanSlate controller: intercepts /clear on Enter, clicks exact same-project new conversation link, and carries clean brief on /clear keep', async () => {
  const projectId = 'ec81b68d-9806-4341-8f47-3fa1467ca3a4';
  const oldCid = '11111111-2222-4333-8444-555555555555';
  const storage = createStorage();
  let now = 2_000_000;

  const dom1 = createCleanSlateDom({ cid: oldCid, projectId });
  let sameProjClicked = 0;
  let otherProjClicked = 0;
  dom1.sameProjLink.addEventListener('click', () => { sameProjClicked += 1; });
  dom1.otherProjLink.addEventListener('click', () => { otherProjClicked += 1; });

  const win1 = {
    document: dom1.doc,
    localStorage: storage,
    Event,
    location: { pathname: `/c/${oldCid}`, search: `?project=${projectId}` },
    navigator: { language: 'zh-CN' },
    addEventListener() {},
    removeEventListener() {},
  };

  const guard1 = core.mountSag({
    win: win1,
    doc: dom1.doc,
    storage,
    autoPoll: false,
    autoObserve: false,
    bindVaultShortcut: false,
    now: () => now,
  });

  // 1) /clear blank via Enter -> intercepts event, clicks same-project link, saves no pending brief
  dom1.ta.value = '/clear blank';
  let prevented = false;
  dom1.doc.dispatchEvent({
    type: 'keydown',
    key: 'Enter',
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    preventDefault() { prevented = true; },
    stopPropagation() {},
    stopImmediatePropagation() {},
  });
  assert.equal(prevented, true, 'Must intercept /clear before sending to LLM');
  assert.equal(sameProjClicked, 1, 'Must click exact same-project New Conversation link');
  assert.equal(otherProjClicked, 0);
  assert.equal(dom1.ta.value, '');
  assert.equal(storage.getItem(cleanSlate.PENDING_CLEAR_KEY), null);

  // 2) Default /clear -> saves ultra-compact pure-text brief & navigates to same-project fresh conversation
  dom1.ta.value = '/clear';
  dom1.doc.dispatchEvent({
    type: 'keydown',
    key: 'Enter',
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    preventDefault() {},
    stopPropagation() {},
    stopImmediatePropagation() {},
  });
  assert.equal(sameProjClicked, 2);
  assert.ok(storage.getItem(cleanSlate.PENDING_CLEAR_KEY), 'Must stage compact brief for fresh conversation');
  guard1.destroy();

  // 3) Fresh conversation mounts (new empty route in same project) -> auto-fills compact pure-text brief once!
  const dom2 = createCleanSlateDom({ cid: '', projectId });
  const win2 = {
    document: dom2.doc,
    localStorage: storage,
    Event,
    location: { pathname: '/', search: `?project=${projectId}` },
    navigator: { language: 'zh-CN' },
    addEventListener() {},
    removeEventListener() {},
  };
  const guard2 = core.mountSag({
    win: win2,
    doc: dom2.doc,
    storage,
    autoPoll: false,
    autoObserve: false,
    bindVaultShortcut: false,
    now: () => now + 500,
  });

  assert.ok(dom2.ta.value.includes('全新会话轻续接'), 'Fresh composer must receive the ultra-compact text brief');
  assert.equal(dom2.ta.value.includes('hugeCodeDump'), false, 'Code dumps must be excluded');
  assert.equal(dom2.ta.value.includes('sk-secretKey1234567890abcd'), false, 'Secrets must be redacted');
  assert.equal(storage.getItem(cleanSlate.PENDING_CLEAR_KEY), null, 'Pending brief must be consumed strictly once');

  guard2.destroy();
  assert.equal(dom2.doc.querySelectorAll('[data-ag-sg-owned="1"]').length, 0);
});
