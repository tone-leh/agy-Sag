import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readNovOpsTemplates } from '../cli/nov-bridge.mjs';
import { SagWatchDaemon } from '../cli/watch-daemon.mjs';

const require = createRequire(import.meta.url);
const promptLib = require('../packages/core/prompt-library.js');
const core = require('../packages/core/index.js');

function createPromptDom({ lexical = false, initialDraft = '' } = {}) {
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
      disabled: false,
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
      focus() { doc.activeElement = el; },
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
    activeElement: null,
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

  const box = makeEl('div');
  box.setAttribute('data-testid', 'agent-input-box');
  let editor;
  const execCalls = [];
  if (lexical) {
    editor = makeEl('div');
    editor.setAttribute('data-lexical-editor', 'true');
    editor.setAttribute('contenteditable', 'true');
    editor.textContent = initialDraft;
    doc.execCommand = (cmd, _ui, val) => {
      execCalls.push({ cmd, val });
      if (cmd === 'selectAll') {
        editor.textContent = '';
        return true;
      }
      if (cmd === 'insertText') {
        editor.textContent = `${editor.textContent}${val}`;
        return true;
      }
      return false;
    };
  } else {
    editor = makeEl('textarea');
    editor.value = initialDraft;
  }
  const foot = makeEl('div');
  foot.className = 'composer-foot';
  const sendBtn = makeEl('button');
  sendBtn.textContent = 'Send';
  let sendClicked = 0;
  sendBtn.addEventListener('click', () => { sendClicked += 1; });
  foot.appendChild(sendBtn);
  box.appendChild(editor);
  box.appendChild(foot);
  doc.body.appendChild(box);

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
    Event: class FakeEvent { constructor(t) { this.type = t; } },
    addEventListener() {},
    removeEventListener() {},
  };

  return { win, doc, storage, editor, execCalls, getSendClicks: () => sendClicked };
}

test('extractVariables & renderTemplate parse defaults safely and ignore $& replacement side effects', () => {
  const tpl = 'Audit {{target=src/core}} for {{issue}} and verify {{target}} again.';
  const vars = promptLib.extractVariables(tpl);
  assert.deepEqual(vars, [
    { name: 'target', defaultValue: 'src/core' },
    { name: 'issue', defaultValue: '' },
  ]);

  const rendered = promptLib.renderTemplate(tpl, { issue: 'price $& $$ $` injection' });
  assert.equal(rendered, 'Audit src/core for price $& $$ $` injection and verify src/core again.');
});

test('sanitizeImportedSnippets enforces 128 KB cap, 100-item limit, field bounds, and prototype-pollution guard', () => {
  const huge = 'x'.repeat(promptLib.MAX_IMPORT_BYTES + 100);
  assert.equal(promptLib.sanitizeImportedSnippets(huge).ok, false);

  const protoPayload = '{"__proto__":{"polluted":true},"snippets":[{"title":"A","body":"B"}]}';
  assert.equal(promptLib.sanitizeImportedSnippets(protoPayload).ok, false);

  const many = Array.from({ length: 120 }, (_, i) => ({
    title: `T${i} ` + 'x'.repeat(200),
    body: '<img src=x onerror=alert(1)> ' + 'y'.repeat(5000),
    tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  }));
  const res = promptLib.sanitizeImportedSnippets(many);
  assert.equal(res.ok, true);
  assert.equal(res.snippets.length, promptLib.MAX_SNIPPETS);
  assert.equal(res.snippets[0].title.length, 80);
  assert.equal(res.snippets[0].body.length, 4000);
  assert.equal(res.snippets[0].tags.length, 6);
});

test('PromptLibrary disabled by default mounts zero nodes/listeners; enabling opens via Ctrl+Alt+P, fills vars, appends without overwriting draft, and cleans up on destroy()', () => {
  const { win, doc, storage, editor, execCalls, getSendClicks } = createPromptDom({
    lexical: true,
    initialDraft: 'Existing user draft',
  });

  const pl = promptLib.createPromptLibraryController({
    win,
    doc,
    storage,
    enabled: false,
    autoObserve: false,
    initialNovTemplates: [{ id: 'nov-1', title: 'NOV Security Audit', description: 'From NOV ops', body: 'Check {{path=cli/}}' }],
  });

  // Disabled: zero trigger button, zero keydown listener
  assert.equal(doc.querySelector(`[data-testid="${promptLib.TRIGGER_TESTID}"]`), null);
  assert.equal(doc.listenerCount('keydown'), 0);

  // Enable and open via Ctrl+Alt+P
  pl.setEnabled(true);
  assert.ok(doc.querySelector(`[data-testid="${promptLib.TRIGGER_TESTID}"]`));
  assert.equal(doc.listenerCount('keydown'), 1);

  doc.dispatchEvent({
    type: 'keydown',
    key: 'p',
    code: 'KeyP',
    ctrlKey: true,
    altKey: true,
    metaKey: false,
    shiftKey: false,
    preventDefault() {},
    stopPropagation() {},
  });
  assert.equal(pl.getDebugState().modalOpen, true);

  // Filter to agy-NOV read-only tab and click template with {{path=cli/}}
  const modal = doc.querySelector(`[data-testid="${promptLib.MODAL_TESTID}"]`);
  modal.querySelector('[data-ag-sag-pl-tab="nov"]').click();
  const novItem = modal.querySelector('[data-ag-sag-pl-item="nov-1"] .ag-sag-pl-item-main');
  assert.ok(novItem);
  novItem.click();

  // Variable form appears; update variable and insert
  const varInp = modal.querySelector('[data-ag-sag-pl-var="path"]');
  assert.ok(varInp);
  varInp.value = 'packages/core/';
  varInp.dispatchEvent({ type: 'input' });
  modal.querySelector('[data-testid="ag-sag-pl-var-insert"]').click();

  // Appended safely without overwriting existing draft, never auto-submitted
  assert.equal(pl.getDebugState().modalOpen, false);
  assert.equal(editor.textContent, 'Existing user draft\n\nCheck packages/core/');
  assert.ok(execCalls.some((c) => c.cmd === 'insertText'));
  assert.equal(getSendClicks(), 0, 'Prompt Library must never auto-submit composer');

  // CRUD custom snippet & export/import
  const saved = pl.saveSnippet({ title: 'My XSS <script>alert(1)</script>', body: 'Run {{cmd=npm test}}', tags: ['qa'] });
  assert.equal(saved.ok, true);
  assert.equal(pl.getSnippets().length, 1);
  const exported = pl.exportSnippetsJson();
  assert.equal(pl.deleteSnippet(saved.snippet.id), true);
  assert.equal(pl.getSnippets().length, 0);
  const imported = pl.importSnippetsJson(exported);
  assert.equal(imported.ok, true);
  assert.equal(pl.getSnippets().length, 1);

  // destroy() removes all nodes & detaches keydown listener
  pl.destroy();
  assert.equal(doc.querySelectorAll('[data-ag-sg-owned="1"], [data-ag-sag-owned="1"]').length, 0);
  assert.equal(doc.listenerCount('keydown'), 0);
  doc.dispatchEvent({
    type: 'keydown',
    key: 'p',
    code: 'KeyP',
    ctrlKey: true,
    altKey: true,
    preventDefault() {},
    stopPropagation() {},
  });
  assert.equal(doc.querySelector(`[data-testid="${promptLib.MODAL_TESTID}"]`), null);
});

test('readNovOpsTemplates & WatchDaemon sag:nov_templates enforce read-only parsing, missing fallback, symlink guard & 256 KB cap', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-sag-nov-tpl-'));
  try {
    const dataDir = path.join(tmpHome, '.agy-nov-data');
    const opsDir = path.join(dataDir, 'ops');

    // 1) Missing ops/prompts.json degrades cleanly without creating files
    const missingRes = readNovOpsTemplates({ homeDir: tmpHome, explicitDataDir: dataDir });
    assert.equal(missingRes.ok, true);
    assert.equal(missingRes.available, false);
    assert.deepEqual(missingRes.templates, []);
    assert.equal(fs.existsSync(dataDir), false, 'Must remain strictly read-only');

    // 2) Valid prompts.json returned cleanly via WatchDaemon sag:nov_templates
    fs.mkdirSync(opsDir, { recursive: true });
    const promptsPath = path.join(opsDir, 'prompts.json');
    fs.writeFileSync(
      promptsPath,
      JSON.stringify({
        prompts: [
          { id: 'ops-sec', title: 'Security Audit', description: 'Check boundaries', tags: ['sec'], body: 'Audit {{target}}' },
          { id: 'bad-empty', title: '', body: '' },
        ],
      }),
      'utf8'
    );

    const daemon = new SagWatchDaemon({
      novBridgeOpts: { homeDir: tmpHome, explicitDataDir: dataDir },
      enableHostBridge: false,
    });
    const bridgeRes = daemon._handleHostBridgePayload(
      JSON.stringify({ reqId: 'req-tpl-1', type: 'sag:nov_templates', payload: {} })
    );
    assert.equal(bridgeRes.ok, true);
    assert.equal(bridgeRes.reqId, 'req-tpl-1');
    assert.equal(bridgeRes.data.available, true);
    assert.equal(bridgeRes.data.templates.length, 1);
    assert.equal(bridgeRes.data.templates[0].id, 'ops-sec');

    // 3) Oversized file (> 256 KB) rejected
    fs.writeFileSync(promptsPath, 'x'.repeat(262200), 'utf8');
    const bigRes = readNovOpsTemplates({ homeDir: tmpHome, explicitDataDir: dataDir });
    assert.equal(bigRes.ok, false);

    // 4) Symlink prompts.json rejected
    const outsideFile = path.join(tmpHome, 'outside.json');
    fs.writeFileSync(outsideFile, '{"prompts":[]}', 'utf8');
    fs.unlinkSync(promptsPath);
    fs.symlinkSync(outsideFile, promptsPath);
    const symRes = readNovOpsTemplates({ homeDir: tmpHome, explicitDataDir: dataDir });
    assert.equal(symRes.ok, false);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('mountSag integrates promptLibrary toggle (default OFF, power preset ON), novTransport sag:nov_templates loading, and zero-residue teardown', async () => {
  const { win, doc, storage } = createPromptDom({ lexical: false });
  const api = core.mountSag({
    win,
    doc,
    storage,
    autoPoll: false,
    autoObserve: false,
    bindVaultShortcut: false,
    bindDrawerShortcut: false,
    novTransport: (req) => {
      if (req?.type === 'sag:nov_templates') {
        return {
          ok: true,
          reqId: req.reqId,
          data: {
            available: true,
            templates: [{ id: 'nov-bridge-1', title: 'Bridge NOV Template', body: 'Check {{mod}}' }],
          },
        };
      }
      return { ok: true, reqId: req?.reqId, state: { installed: true, bridgeConnected: true } };
    },
  });

  try {
    assert.equal(api.getConfig().modules.promptLibrary, false);
    assert.equal(api.getDebugState().promptLibrary.enabled, false);
    assert.equal(doc.querySelector(`[data-testid="${promptLib.TRIGGER_TESTID}"]`), null);

    api.applyPreset('power');
    assert.equal(api.getConfig().modules.promptLibrary, true);
    assert.equal(api.getDebugState().promptLibrary.enabled, true);
    assert.ok(doc.querySelector(`[data-testid="${promptLib.TRIGGER_TESTID}"]`));

    const loaded = await api.promptLibrary.refreshNovTemplates();
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].id, 'nov-bridge-1');
  } finally {
    api.destroy();
  }
  assert.equal(doc.querySelectorAll('[data-ag-sg-owned="1"], [data-ag-sag-owned="1"]').length, 0);
});

test('Regression [Critical #1 / Medium #2 / Medium #3 / Low #4]: zero MutationObserver feedback loop, insertMode resets on open, Settings import keeps details open & accurate capDropped', async () => {
  const { win, doc, storage, editor } = createPromptDom({ lexical: false, initialDraft: 'Keep me' });

  // 1) Simulate spec-compliant MutationObserver firing childList on textContent setter
  let observerCallback = null;
  let observerTriggers = 0;
  win.MutationObserver = class FakeMutationObserver {
    constructor(cb) { observerCallback = cb; }
    observe() {}
    disconnect() { observerCallback = null; }
  };

  const pl = promptLib.createPromptLibraryController({
    win,
    doc,
    storage,
    enabled: true,
    autoObserve: true,
  });

  try {
    const btn = doc.querySelector(`[data-testid="${promptLib.TRIGGER_TESTID}"]`);
    assert.ok(btn);
    // Feeding owned-node mutations must not schedule or loop
    for (let i = 0; i < 5; i += 1) {
      observerCallback?.([{ target: btn, addedNodes: [btn], removedNodes: [] }]);
    }
    await new Promise((r) => setTimeout(r, 90));
    // Re-running ensureTrigger via sync() with unchanged label must not mutate textContent unnecessarily
    const origDesc = Object.getOwnPropertyDescriptor(btn, 'textContent');
    let textSets = 0;
    Object.defineProperty(btn, 'textContent', {
      configurable: true,
      get: () => origDesc.get.call(btn),
      set: (v) => { textSets += 1; origDesc.set.call(btn, v); },
    });
    pl.sync();
    assert.equal(textSets, 0, 'Unchanged trigger label must not trigger redundant textContent writes');

    // 2) insertMode resets to append on every open() so draft is never silently overwritten
    pl.open();
    const modal = doc.querySelector(`[data-testid="${promptLib.MODAL_TESTID}"]`);
    modal.querySelector('[data-ag-sag-pl-item="tpl-diff-review"] .ag-sag-pl-item-main').click();
    modal.querySelector('[data-testid="ag-sag-pl-insert-mode"]').click();
    assert.equal(pl.getDebugState().insertMode, 'replace');
    pl.close();

    pl.open();
    assert.equal(pl.getDebugState().insertMode, 'append', 'Reopening palette must reset insertMode to safe append');
    const modal2 = doc.querySelector(`[data-testid="${promptLib.MODAL_TESTID}"]`);
    modal2.querySelector('[data-ag-sag-pl-item="slash-compact"] .ag-sag-pl-item-main').click();
    assert.equal(editor.value, 'Keep me\n\n/compact');

    // 3) Accurate count & dropped reporting when hitting MAX_SNIPPETS (100)
    const seed = Array.from({ length: 98 }, (_, i) => ({ id: `seed-${i}`, title: `S${i}`, body: `Body ${i}` }));
    const seedRes = pl.importSnippetsJson(seed);
    assert.equal(seedRes.ok, true);
    assert.equal(seedRes.total, 98);
    const extra = Array.from({ length: 10 }, (_, i) => ({ id: `ext-${i}`, title: `E${i}`, body: `Extra ${i}` }));
    const capRes = pl.importSnippetsJson(extra);
    assert.equal(capRes.ok, true);
    assert.equal(capRes.count, 2);
    assert.equal(capRes.dropped, 8);
    assert.equal(capRes.total, 100);
  } finally {
    pl.destroy();
  }

  // 4) Settings drawer Conversation tab keeps <details> open & displays live ok status after import
  const dom2 = createPromptDom({ lexical: false });
  const api = core.mountSag({
    win: dom2.win,
    doc: dom2.doc,
    storage: dom2.storage,
    autoPoll: false,
    autoObserve: false,
    bindVaultShortcut: false,
    bindDrawerShortcut: false,
  });
  try {
    api.openSettingsDrawer('conversation');
    const drawer = dom2.doc.querySelector('[data-testid="ag-sag-settings-drawer"]');
    const ta = drawer.querySelector('[data-testid="ag-sag-pl-import-textarea"]');
    ta.value = JSON.stringify({ snippets: [{ title: 'Imported In Drawer', body: 'Hello {{x}}' }] });
    drawer.querySelector('[data-testid="ag-sag-pl-import-btn"]').click();

    const liveStatus = drawer.querySelector('[data-testid="ag-sag-pl-cfg-status"]');
    assert.ok(liveStatus && !liveStatus.hidden, 'Import feedback must remain visible after prismBridge re-render');
    assert.equal(liveStatus.getAttribute('data-tone'), 'ok');
    assert.equal(drawer.querySelector('[data-testid="ag-sag-pl-import-textarea"]').value, '', 'Live textarea must clear after import');
    const plDetails = liveStatus.closest('details');
    assert.equal(plDetails?.open, true, 'Prompt Library <details> must remain open after import');
  } finally {
    api.destroy();
  }
});
