import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packsMod = require('../packages/core/host-i18n-packs.js');
const coexist = require('../packages/core/coexist.js');
const core = require('../packages/core/index.js');

function createCustomPackMockDom(initialLang = 'zh-CN') {
  const matches = (el, selList) =>
    selList.split(',').some((raw) => {
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
    let _innerHtmlWrites = 0;
    const el = {
      tagName: String(tag).toUpperCase(),
      nodeType: 1,
      id: '',
      value: '',
      hidden: false,
      disabled: false,
      selected: false,
      style: {},
      shadowRoot: null,
      _text: '',
      children: [],
      parentElement: null,
      parentNode: null,
      get childNodes() {
        return el.children;
      },
      get isConnected() {
        let p = el;
        while (p) {
          if (p === doc.documentElement) return true;
          p = p.parentElement;
        }
        return false;
      },
      get firstChild() {
        return el.children[0] || null;
      },
      get innerHTML() {
        return '';
      },
      set innerHTML(_v) {
        _innerHtmlWrites += 1;
        throw new Error('innerHTML must never be used');
      },
      get _innerHtmlWrites() {
        return _innerHtmlWrites;
      },
      get className() {
        return [...cls].join(' ');
      },
      set className(v) {
        cls.clear();
        String(v || '')
          .split(/\s+/)
          .filter(Boolean)
          .forEach((c) => cls.add(c));
      },
      classList: {
        add: (...a) => a.forEach((c) => c && cls.add(c)),
        remove: (...a) => a.forEach((c) => cls.delete(c)),
        contains: (c) => cls.has(c),
      },
      get textContent() {
        return el.children.length
          ? el._text + el.children.map((c) => c.textContent).join('')
          : el._text;
      },
      set textContent(v) {
        el._text = String(v ?? '');
        el.children.length = 0;
      },
      setAttribute(k, v) {
        attrs.set(k, String(v));
        if (k === 'id') el.id = String(v);
      },
      getAttribute(k) {
        return attrs.has(k) ? attrs.get(k) : null;
      },
      hasAttribute(k) {
        return attrs.has(k);
      },
      removeAttribute(k) {
        attrs.delete(k);
      },
      appendChild(c) {
        if (c.parentElement) c.remove();
        c.parentElement = el;
        c.parentNode = el;
        el.children.push(c);
        if (el.tagName === 'SELECT' && c.tagName === 'OPTION' && c.selected) {
          el.value = c.value;
        }
        return c;
      },
      insertBefore(c, ref) {
        if (c.parentElement) c.remove();
        c.parentElement = el;
        c.parentNode = el;
        const i = el.children.indexOf(ref);
        if (i >= 0) el.children.splice(i, 0, c);
        else el.children.push(c);
        return c;
      },
      removeChild(c) {
        el.children = el.children.filter((x) => x !== c);
        c.parentElement = null;
        c.parentNode = null;
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
            if (c.nodeType !== 1) continue;
            if (matches(c, sel)) out.push(c);
            walk(c);
          }
        };
        walk(el);
        return out;
      },
      querySelector(sel) {
        return el.querySelectorAll(sel)[0] || null;
      },
      addEventListener(ev, fn) {
        if (!ls.has(ev)) ls.set(ev, new Set());
        ls.get(ev).add(fn);
      },
      removeEventListener(ev, fn) {
        ls.get(ev)?.delete(fn);
      },
      click() {
        if (el.disabled) return;
        for (const fn of ls.get('click') || []) {
          fn({ preventDefault() {}, stopPropagation() {}, target: el });
        }
      },
      focus() {
        doc.activeElement = el;
      },
    };
    return el;
  };

  const doc = {
    hidden: false,
    activeElement: null,
    documentElement: null,
    head: null,
    body: null,
    createElement: makeEl,
    createTextNode(txt) {
      const node = {
        nodeType: 3,
        _value: String(txt ?? ''),
        parentElement: null,
        parentNode: null,
        get nodeValue() {
          return node._value;
        },
        set nodeValue(v) {
          node._value = String(v ?? '');
        },
        get textContent() {
          return node._value;
        },
        set textContent(v) {
          node._value = String(v ?? '');
        },
        remove() {
          if (node.parentElement) node.parentElement.removeChild(node);
        },
      };
      return node;
    },
    getElementById: (id) => doc.documentElement.querySelector('#' + id),
    querySelectorAll: (s) => doc.documentElement.querySelectorAll(s),
    querySelector: (s) => doc.documentElement.querySelector(s),
    addEventListener() {},
    removeEventListener() {},
  };

  doc.documentElement = makeEl('html');
  doc.documentElement.setAttribute('data-ag-cs-lang', initialLang);
  doc.head = makeEl('head');
  doc.body = makeEl('body');
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);

  // Native host phrase outside owned settings
  const hostBtn = makeEl('button');
  hostBtn.id = 'host-settings-btn';
  hostBtn.appendChild(doc.createTextNode('Settings'));
  doc.body.appendChild(hostBtn);

  // Native Settings -> Appearance dialog
  const dialog = makeEl('section');
  dialog.setAttribute('role', 'dialog');
  const p6 = makeEl('div');
  p6.className = 'p-6';
  const space = makeEl('div');
  space.className = 'space-y-2';
  const h2 = makeEl('h2');
  h2.textContent = 'Appearance';
  space.appendChild(h2);
  p6.appendChild(space);
  dialog.appendChild(p6);
  doc.body.appendChild(dialog);

  const store = new Map();
  const storage = {
    get length() {
      return store.size;
    },
    key: (i) => Array.from(store.keys())[i] ?? null,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };

  const copied = [];
  const win = {
    document: doc,
    localStorage: storage,
    navigator: {
      language: initialLang,
      clipboard: {
        writeText: async (txt) => {
          copied.push(txt);
        },
      },
    },
    addEventListener() {},
    removeEventListener() {},
  };

  return { win, doc, storage, hostBtn, copied };
}

test('custom-pack-import: sanitizeImportedPack validates valid JSON & object, drops non-string exact values & protects KEEP_UNTRANSLATED_EXACT', () => {
  const res = packsMod.sanitizeImportedPack(
    JSON.stringify({
      locale: 'zh-CN',
      exact: {
        Settings: '自定义设置',
        Antigravity: 'ShouldBeSkipped',
        InvalidNum: 123,
        InvalidNull: null,
      },
      patterns: [
        { source: '^(\\d+)\\s+files\\s+changed$', flags: 'i', replace: '改了 {1} 个文件' },
      ],
    })
  );

  assert.equal(res.ok, true);
  assert.equal(res.pack.locale, 'zh-CN');
  assert.equal(res.pack.exact.Settings, '自定义设置');
  assert.equal(res.pack.exact.Antigravity, undefined);
  assert.equal(res.pack.exact.InvalidNum, undefined);
  assert.equal(res.stats.exactCount, 1);
  assert.equal(res.stats.patternCount, 1);
  assert.equal(res.stats.droppedNonString, 2);
});

test('custom-pack-import: rejects oversize JSON (>256KB), too many exact (>2000), long exact (>500), too many patterns (>50), long pattern (>200), and invalid/en locale', () => {
  const bigJson = JSON.stringify({ locale: 'zh-CN', exact: { A: 'x'.repeat(263 * 1024) } });
  assert.equal(packsMod.sanitizeImportedPack(bigJson).ok, false);

  const manyExact = {};
  for (let i = 0; i < 2001; i++) manyExact[`Key_${i}`] = `Val_${i}`;
  assert.equal(packsMod.sanitizeImportedPack({ locale: 'zh-CN', exact: manyExact }).ok, false);

  assert.equal(packsMod.sanitizeImportedPack({ locale: 'zh-CN', exact: { ['k'.repeat(501)]: 'ok' } }).ok, false);
  assert.equal(packsMod.sanitizeImportedPack({ locale: 'zh-CN', exact: { ok: 'v'.repeat(501) } }).ok, false);

  const manyPatterns = Array.from({ length: 51 }, (_, i) => ({ source: `^Item ${i}$`, replace: `条目 ${i}` }));
  assert.equal(packsMod.sanitizeImportedPack({ locale: 'zh-CN', patterns: manyPatterns }).ok, false);

  assert.equal(
    packsMod.sanitizeImportedPack({
      locale: 'zh-CN',
      patterns: [{ source: `^${'a'.repeat(200)}$`, replace: 'ok' }],
    }).ok,
    false
  );

  assert.equal(packsMod.sanitizeImportedPack({ locale: 'en', exact: { A: 'B' } }).ok, false);
  assert.equal(packsMod.sanitizeImportedPack({ locale: 'xx-UNKNOWN', exact: { A: 'B' } }).ok, false);
  assert.equal(packsMod.sanitizeImportedPack({ exact: { A: 'B' } }).ok, false);
});

test('custom-pack-import: rejects ReDoS nested quantifiers, alternation backtracking & backreferences in < 50ms even on 10,000-char inputs', () => {
  const unsafeSources = [
    '(a+)+$',
    '(\\w*)*',
    '(.+){2,}',
    '((a+))+',
    '^(a|aa)+$',
    '^(a|a?)+$',
    '(foo)\\1',
    '^(?<g>\\w+)\\k<g>$',
  ];
  for (const src of unsafeSources) {
    const res = packsMod.sanitizeImportedPack({
      locale: 'ja',
      patterns: [{ source: src, replace: 'unsafe' }],
    });
    assert.equal(res.ok, false, `Expected unsafe pattern "${src}" to be rejected`);
  }

  // Prototype pollution keys are stripped safely without clobbering Object.prototype methods
  const protoRes = packsMod.sanitizeImportedPack(
    '{"locale":"zh-CN","exact":{"__proto__":"evil","constructor":"evil","hasOwnProperty":"evil","Settings":"设置2"}}'
  );
  assert.equal(protoRes.ok, true);
  assert.equal(typeof protoRes.pack.exact.hasOwnProperty, 'function');
  assert.equal(protoRes.pack.exact.Settings, '设置2');

  const tenKSource = 'a'.repeat(10_000);
  const t0 = performance.now();
  const longPatRes = packsMod.sanitizeImportedPack({
    locale: 'zh-CN',
    patterns: [{ source: tenKSource, replace: 'x' }],
  });
  const longExactPayload = JSON.stringify({
    locale: 'zh-CN',
    exact: Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`Phrase_${i}_${'a'.repeat(30)}`, `词_${i}`])),
  });
  const bigValidRes = packsMod.sanitizeImportedPack(longExactPayload);
  const elapsedMs = performance.now() - t0;

  assert.equal(longPatRes.ok, false);
  assert.equal(bigValidRes.ok, true);
  assert.ok(elapsedMs < 50, `Expected 10k validation < 50ms, got ${elapsedMs.toFixed(2)}ms`);
});

test('custom-pack-import: persists to agSag.hostI18n.customPacks.v1, reloads on remount, honors options priority, and clears cleanly', () => {
  const env1 = createCustomPackMockDom('zh-CN');
  const guard1 = core.mountSag({
    win: env1.win,
    doc: env1.doc,
    storage: env1.storage,
    autoPoll: false,
    autoObserve: false,
    bindVaultShortcut: false,
    config: { hostI18nLocale: 'zh-CN' },
  });

  const importRes = guard1.importCustomHostPack({
    locale: 'zh-CN',
    exact: { Settings: '旧定制设置', Appearance: '定制外观' },
    patterns: [],
  });
  assert.equal(importRes.ok, true);
  assert.equal(env1.hostBtn.textContent, '旧定制设置');

  // Re-importing same locale replaces prior custom pack in-memory as well as in storage
  const replaceRes = guard1.importCustomHostPack({
    locale: 'zh-CN',
    exact: { Settings: '定制系统设置' },
    patterns: [],
  });
  assert.equal(replaceRes.ok, true);
  assert.equal(env1.hostBtn.textContent, '定制系统设置');
  assert.equal(guard1.hostI18n.translateText('Appearance'), '外观');

  const rawStored = env1.storage.getItem(coexist.CUSTOM_PACKS_STORAGE_KEY);
  assert.ok(rawStored);
  assert.equal(JSON.parse(rawStored)['zh-CN'].exact.Settings, '定制系统设置');
  guard1.destroy();

  // Remount with same storage -> persisted custom pack takes effect automatically
  const env2 = createCustomPackMockDom('zh-CN');
  // Copy storage entries into env2
  for (let i = 0; i < env1.storage.length; i++) {
    const k = env1.storage.key(i);
    env2.storage.setItem(k, env1.storage.getItem(k));
  }
  const guard2 = core.mountSag({
    win: env2.win,
    doc: env2.doc,
    storage: env2.storage,
    autoPoll: false,
    autoObserve: false,
    bindVaultShortcut: false,
    config: { hostI18nLocale: 'zh-CN' },
  });
  assert.equal(env2.hostBtn.textContent, '定制系统设置');

  // Clear custom packs removes storage key
  guard2.clearCustomHostPacks();
  assert.equal(env2.storage.getItem(coexist.CUSTOM_PACKS_STORAGE_KEY), null);
  assert.equal(env2.hostBtn.textContent, '设置');
  guard2.destroy();

  // options.customHostI18nPacks takes precedence over stored custom pack for same locale
  const env3 = createCustomPackMockDom('zh-CN');
  env3.storage.setItem(
    coexist.CUSTOM_PACKS_STORAGE_KEY,
    JSON.stringify({ 'zh-CN': { locale: 'zh-CN', exact: { Settings: '本地存储优先低' }, patterns: [] } })
  );
  const guard3 = core.mountSag({
    win: env3.win,
    doc: env3.doc,
    storage: env3.storage,
    autoPoll: false,
    autoObserve: false,
    bindVaultShortcut: false,
    config: { hostI18nLocale: 'zh-CN' },
    customHostI18nPacks: { 'zh-CN': { exact: { Settings: '参数传入优先高' } } },
  });
  assert.equal(env3.hostBtn.textContent, '参数传入优先高');
  guard3.destroy();
});

test('custom-pack-import: Settings UI handles apply/export/missing/clear safely without XSS and leaves zero owned DOM on destroy', () => {
  const env = createCustomPackMockDom('zh-CN');
  const guard = core.mountSag({
    win: env.win,
    doc: env.doc,
    storage: env.storage,
    autoPoll: false,
    autoObserve: false,
    bindVaultShortcut: false,
    config: { hostI18nLocale: 'zh-CN', hostI18nCollectMissing: false },
  });

  const missingBtn = env.doc.querySelector('[data-testid="ag-sag-pack-missing-btn"]');
  assert.ok(missingBtn);
  assert.equal(missingBtn.disabled, true, 'Missing template export must be disabled until collectMissing is enabled');

  // Toggle editor open & apply XSS-like payload in textContent safely
  const toggleBtn = env.doc.querySelector('[data-testid="ag-sag-pack-toggle-btn"]');
  toggleBtn.click();
  const textarea = env.doc.querySelector('[data-testid="ag-sag-pack-textarea"]');
  const applyBtn = env.doc.querySelector('[data-testid="ag-sag-pack-apply-btn"]');
  const xssAttempt = JSON.stringify({
    locale: 'zh-CN',
    exact: { Settings: '<img src=x onerror=alert(1)>' },
  });
  textarea.value = xssAttempt;
  applyBtn.click();

  const statusEl = env.doc.querySelector('[data-testid="ag-sag-pack-status"]');
  assert.equal(statusEl.getAttribute('data-tone'), 'ok');
  assert.ok(statusEl.textContent.includes('1'));
  // Ensure translated node renders literal text with zero HTML children
  assert.equal(env.hostBtn.children.filter((c) => c.nodeType === 1).length, 0);
  assert.equal(env.hostBtn.textContent, '<img src=x onerror=alert(1)>');

  // Export copies JSON to clipboard
  env.doc.querySelector('[data-testid="ag-sag-pack-export-btn"]').click();
  assert.ok(env.copied.some((c) => c.includes('<img src=x onerror=alert(1)>')));

  // Clear removes storage key
  env.doc.querySelector('[data-testid="ag-sag-pack-clear-btn"]').click();
  assert.equal(env.storage.getItem(coexist.CUSTOM_PACKS_STORAGE_KEY), null);

  guard.destroy();
  assert.equal(env.doc.querySelectorAll('[data-ag-sg-owned="1"], [data-ag-sag-owned="1"]').length, 0);
});
