import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packsMod = require('../packages/core/host-i18n-packs.js');
const hostI18n = require('../packages/core/host-i18n.js');
const coexist = require('../packages/core/coexist.js');

// Lightweight zero-dependency DOM + ShadowRoot + MutationObserver mock (Node 22 compatible)
function createMockDomEnv() {
  const observerInstances = [];
  const docListeners = new Map();
  const winListeners = new Map();

  class MockMutationObserver {
    constructor(cb) {
      this._cb = cb;
      this._targets = [];
      this.disconnected = false;
      observerInstances.push(this);
    }
    observe(target, opts) {
      this._targets.push({ target, opts: opts || {} });
    }
    disconnect() {
      this.disconnected = true;
      this._targets.length = 0;
    }
    trigger(records) {
      if (this.disconnected) return;
      this._cb(records, this);
    }
  }

  function makeText(value) {
    const node = {
      nodeType: 3,
      _value: String(value ?? ''),
      parentNode: null,
      parentElement: null,
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
        if (node.parentNode) node.parentNode.removeChild(node);
      },
    };
    return node;
  }

  function makeShadowRoot(host) {
    const sr = {
      nodeType: 11,
      host,
      childNodes: [],
      get children() {
        return sr.childNodes.filter((n) => n.nodeType === 1);
      },
      appendChild(child) {
        if (child.parentNode) child.parentNode.removeChild(child);
        child.parentNode = sr;
        child.parentElement = null;
        sr.childNodes.push(child);
        return child;
      },
      removeChild(child) {
        sr.childNodes = sr.childNodes.filter((x) => x !== child);
        child.parentNode = null;
        child.parentElement = null;
        return child;
      },
    };
    return sr;
  }

  function makeEl(tag, initialText) {
    const attrs = new Map();
    const cls = new Set();
    const el = {
      nodeType: 1,
      tagName: String(tag).toUpperCase(),
      id: '',
      value: '',
      shadowRoot: null,
      childNodes: [],
      parentNode: null,
      parentElement: null,
      get children() {
        return el.childNodes.filter((n) => n.nodeType === 1);
      },
      get firstChild() {
        return el.childNodes[0] || null;
      },
      get className() {
        return [...cls].join(' ');
      },
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
          c.parentNode = null;
          c.parentElement = null;
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
      },
      getAttribute(k) {
        return attrs.has(k) ? attrs.get(k) : null;
      },
      hasAttribute(k) {
        return attrs.has(k);
      },
      removeAttribute(k) {
        attrs.delete(k);
        if (k === 'id') el.id = '';
      },
      appendChild(child) {
        if (child.parentNode) child.parentNode.removeChild(child);
        child.parentNode = el;
        child.parentElement = el;
        el.childNodes.push(child);
        return child;
      },
      removeChild(child) {
        el.childNodes = el.childNodes.filter((x) => x !== child);
        child.parentNode = null;
        child.parentElement = null;
        return child;
      },
      attachShadow() {
        el.shadowRoot = makeShadowRoot(el);
        return el.shadowRoot;
      },
      remove() {
        if (el.parentNode) el.parentNode.removeChild(el);
      },
    };
    if (initialText !== undefined) {
      el.appendChild(makeText(initialText));
    }
    return el;
  }

  const doc = {
    nodeType: 9,
    hidden: false,
    documentElement: null,
    head: null,
    body: null,
    createElement: makeEl,
    createTextNode: makeText,
    addEventListener(ev, fn) {
      if (!docListeners.has(ev)) docListeners.set(ev, new Set());
      docListeners.get(ev).add(fn);
    },
    removeEventListener(ev, fn) {
      docListeners.get(ev)?.delete(fn);
    },
    dispatchEvent(ev) {
      for (const fn of docListeners.get(ev.type) || []) fn(ev);
    },
  };

  doc.documentElement = makeEl('html');
  doc.head = makeEl('head');
  doc.body = makeEl('body');
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);

  const win = {
    document: doc,
    MutationObserver: MockMutationObserver,
    addEventListener(ev, fn) {
      if (!winListeners.has(ev)) winListeners.set(ev, new Set());
      winListeners.get(ev).add(fn);
    },
    removeEventListener(ev, fn) {
      winListeners.get(ev)?.delete(fn);
    },
    dispatchEvent(ev) {
      for (const fn of winListeners.get(ev.type) || []) fn(ev);
    },
  };

  function emitMutationsForTarget(target, records) {
    for (const obs of observerInstances) {
      if (obs.disconnected) continue;
      if (obs._targets.some((t) => t.target === target)) {
        obs.trigger(records);
      }
    }
  }

  return {
    doc,
    win,
    makeEl,
    makeText,
    observerInstances,
    docListeners,
    winListeners,
    emitMutationsForTarget,
  };
}

test('validatePacks(): verifies all 10 locales, entry counts, patterns, metadata, and KEEP_UNTRANSLATED_EXACT hygiene', () => {
  const res = packsMod.validatePacks();
  assert.equal(res.ok, true, `validatePacks errors: ${res.errors.join('; ')}`);
  assert.equal(res.errors.length, 0);
  assert.equal(res.stats.localeCount, 10);

  const expectedLocales = ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'es', 'fr', 'de', 'ru', 'pt-BR'];
  assert.deepEqual([...packsMod.LOCALES], expectedLocales);
  assert.equal(packsMod.listLocales().length, 10);

  assert.ok(res.stats.locales['zh-CN'].exactCount >= 280, 'zh-CN exact count must be >= 280');
  for (const loc of expectedLocales.filter((l) => l !== 'en')) {
    assert.ok(res.stats.locales[loc].exactCount >= 180, `${loc} exact count must be >= 180`);
    assert.ok(res.stats.locales[loc].patternCount >= 18, `${loc} pattern count must be >= 18`);
    const pack = packsMod.getPack(loc);
    assert.equal(pack.meta.locale, loc);
    assert.equal(pack.meta.schemaVersion, 2);
    assert.ok(pack.meta.nativeName.length > 0);
    assert.ok(pack.meta.englishName.length > 0);
  }

  // normalizeHostLocale edge cases
  assert.equal(packsMod.normalizeHostLocale('zh_CN'), 'zh-CN');
  assert.equal(packsMod.normalizeHostLocale('zh-Hans'), 'zh-CN');
  assert.equal(packsMod.normalizeHostLocale('zh-Hant-TW'), 'zh-TW');
  assert.equal(packsMod.normalizeHostLocale('zh-HK'), 'zh-TW');
  assert.equal(packsMod.normalizeHostLocale('ja-JP'), 'ja');
  assert.equal(packsMod.normalizeHostLocale('ko-KR'), 'ko');
  assert.equal(packsMod.normalizeHostLocale('es-MX'), 'es');
  assert.equal(packsMod.normalizeHostLocale('fr-CA'), 'fr');
  assert.equal(packsMod.normalizeHostLocale('de-AT'), 'de');
  assert.equal(packsMod.normalizeHostLocale('ru-RU'), 'ru');
  assert.equal(packsMod.normalizeHostLocale('pt'), 'pt-BR');
  assert.equal(packsMod.normalizeHostLocale('pt_BR'), 'pt-BR');
  assert.equal(packsMod.normalizeHostLocale('en-US'), 'en');
  assert.equal(packsMod.normalizeHostLocale(''), 'en');
  assert.equal(packsMod.normalizeHostLocale('xx-UNKNOWN'), 'en');

  // Corrupt pack detection
  const broken = {
    en: packsMod.getPack('en'),
    'zh-CN': {
      meta: { locale: 'zh-CN', nativeName: '简体中文', englishName: 'Simplified Chinese', schemaVersion: 2 },
      exact: { MCP: '不应该被翻译', Settings: '' },
      patterns: [
        { source: '[invalid-regex', flags: '', replace: '{1}' },
        { source: '^(\\d+) items$', flags: '', replace: '{2} 项' },
      ],
    },
  };
  const brokenRes = packsMod.validatePacks(broken);
  assert.equal(brokenRes.ok, false);
  assert.ok(brokenRes.errors.some((e) => e.includes('KEEP_UNTRANSLATED_EXACT')));
  assert.ok(brokenRes.errors.some((e) => e.includes('invalid RegExp')));
  assert.ok(brokenRes.errors.some((e) => e.includes('placeholder {2} out of range')));
});

test('10-locale hot switching, whitespace preservation, lowercase tier2, and lossless restore to English', () => {
  const env = createMockDomEnv();
  const navBtn = env.makeEl('button', 'New Conversation');
  const paddedEl = env.makeEl('span', '  Settings  ');
  const lowerEl = env.makeEl('span', 'waiting for approval');
  const shortAmbigEl = env.makeEl('span', 'on');
  const slashCmdEl = env.makeEl('span', '/compact');
  const slashDescEl = env.makeEl('span', 'Compact conversation history to free up context');
  const keepEl = env.makeEl('span', 'Antigravity');
  const keepMcpEl = env.makeEl('span', 'MCP');

  env.doc.body.appendChild(navBtn);
  env.doc.body.appendChild(paddedEl);
  env.doc.body.appendChild(lowerEl);
  env.doc.body.appendChild(shortAmbigEl);
  env.doc.body.appendChild(slashCmdEl);
  env.doc.body.appendChild(slashDescEl);
  env.doc.body.appendChild(keepEl);
  env.doc.body.appendChild(keepMcpEl);

  const ctl = hostI18n.createHostI18nController({
    win: env.win,
    doc: env.doc,
    coexist,
    locale: 'zh-CN',
    autoObserve: false,
  });

  assert.equal(navBtn.textContent, '新建对话');
  assert.equal(paddedEl.textContent, '  设置  ', 'Leading and trailing whitespace must be preserved');
  assert.equal(lowerEl.textContent, '等待批准', 'Lowercase Tier 2 fallback should match non-short terms');
  assert.equal(shortAmbigEl.textContent, 'on', 'Short lowercase ambiguous words must NOT be translated via Tier 2');
  assert.equal(slashCmdEl.textContent, '/compact', 'Slash command names must NEVER be translated');
  assert.equal(slashDescEl.textContent, '压缩对话历史以释放上下文空间');
  assert.equal(keepEl.textContent, 'Antigravity');
  assert.equal(keepMcpEl.textContent, 'MCP');
  assert.equal(env.doc.documentElement.getAttribute('data-ag-sag-host-i18n'), 'active');
  assert.equal(env.doc.documentElement.getAttribute('data-ag-sag-lang'), 'zh-CN');

  // Hot-switch across all remaining 8 target locales
  const expectedByLocale = {
    'zh-TW': ['新增對話', '  設定  '],
    ja: ['新しい会話', '  設定  '],
    ko: ['새 대화', '  설정  '],
    es: ['Nueva conversación', '  Configuración  '],
    fr: ['Nouvelle conversation', '  Paramètres  '],
    de: ['Neue Unterhaltung', '  Einstellungen  '],
    ru: ['Новый диалог', '  Настройки  '],
    'pt-BR': ['Nova conversa', '  Configurações  '],
  };

  for (const [loc, [expNav, expPad]] of Object.entries(expectedByLocale)) {
    ctl.setLocale(loc);
    assert.equal(navBtn.textContent, expNav, `Hot-switch to ${loc} failed for navBtn`);
    assert.equal(paddedEl.textContent, expPad, `Hot-switch to ${loc} failed for paddedEl`);
    assert.equal(slashCmdEl.textContent, '/compact', `Slash command must stay untouched in ${loc}`);
    assert.equal(keepEl.textContent, 'Antigravity', `KEEP_UNTRANSLATED_EXACT must stay untouched in ${loc}`);
    assert.equal(env.doc.documentElement.getAttribute('data-ag-sag-lang'), loc);
  }

  // Hot-switch back to 'en' -> 100% lossless restore + clear host markers
  ctl.setLocale('en');
  assert.equal(navBtn.textContent, 'New Conversation');
  assert.equal(paddedEl.textContent, '  Settings  ');
  assert.equal(lowerEl.textContent, 'waiting for approval');
  assert.equal(slashDescEl.textContent, 'Compact conversation history to free up context');
  assert.equal(env.doc.documentElement.getAttribute('data-ag-sag-host-i18n'), null);
  assert.equal(env.doc.documentElement.getAttribute('data-ag-sag-lang'), null);

  // Re-enable zh-CN, then setEnabled(false) -> restores cleanly
  ctl.setLocale('zh-CN');
  assert.equal(navBtn.textContent, '新建对话');
  ctl.setEnabled(false);
  assert.equal(navBtn.textContent, 'New Conversation');
  assert.equal(env.doc.documentElement.getAttribute('data-ag-sag-host-i18n'), null);

  ctl.destroy();
});

test('Pattern templates and $& / $$ / $1 replacement safety', () => {
  const env = createMockDomEnv();
  const p1 = env.makeEl('span', '3 files changed');
  const p2 = env.makeEl('span', 'Thought for $& $$ $1 $\' 4s');
  const p3 = env.makeEl('span', 'Resets in 2h 15m');
  const p4 = env.makeEl('span', '12 secs ago');
  const p5 = env.makeEl('span', 'Showing 10 of 42');
  const p6 = env.makeEl('span', 'Step 2 of 5');
  const p7 = env.makeEl('span', 'Version 2.35.1-$&-$$-$1');
  const p8 = env.makeEl('span', '  5 warnings  ');

  for (const el of [p1, p2, p3, p4, p5, p6, p7, p8]) env.doc.body.appendChild(el);

  const ctl = hostI18n.createHostI18nController({
    win: env.win,
    doc: env.doc,
    coexist,
    locale: 'zh-CN',
    autoObserve: false,
  });

  assert.equal(p1.textContent, '3 个文件已更改');
  assert.equal(p2.textContent, '思考了 $& $$ $1 $\' 4s', 'Dollar sequences in captured groups must NEVER expand');
  assert.equal(p3.textContent, '2h 15m 后重置');
  assert.equal(p4.textContent, '12 秒前');
  assert.equal(p5.textContent, '显示 10 / 42');
  assert.equal(p6.textContent, '第 2 / 5 步');
  assert.equal(p7.textContent, '版本 2.35.1-$&-$$-$1', 'Dollar sequences in version must stay literal');
  assert.equal(p8.textContent, '  5 条警告  ');

  // Custom template containing literal $$ and $& in replacement text
  ctl.mergeCustomPack({
    patterns: [{ source: '^Cost:\\s+(.+)$', flags: '', replace: '费用 $$ {1} ($&)' }],
  });
  const costEl = env.makeEl('span', 'Cost: $&100');
  env.doc.body.appendChild(costEl);
  ctl.scanNow();
  assert.equal(costEl.textContent, '费用 $$ $&100 ($&)');

  // Japanese multi-group reorder ({2} before {1})
  ctl.setLocale('ja');
  assert.equal(p5.textContent, '42 件中 10 件を表示');

  ctl.restoreAll();
  assert.equal(p2.textContent, 'Thought for $& $$ $1 $\' 4s');
  assert.equal(p5.textContent, 'Showing 10 of 42');
  assert.equal(p8.textContent, '  5 warnings  ');
  ctl.destroy();
});

test('Physical skip containers (code/pre/editors/chat bubbles/inputs/no-i18n/rtl) and whitelisted attributes', () => {
  const env = createMockDomEnv();

  // Skipped containers (text & attributes must remain untouched)
  const codeEl = env.makeEl('code', 'Settings');
  const preWrap = env.makeEl('pre');
  preWrap.appendChild(env.makeEl('span', 'Cancel'));
  const kbdEl = env.makeEl('kbd', 'Enter');
  const monaco = env.makeEl('div');
  monaco.className = 'monaco-editor';
  monaco.appendChild(env.makeEl('span', 'Settings'));
  const xterm = env.makeEl('div');
  xterm.className = 'xterm';
  xterm.appendChild(env.makeEl('span', 'Run command'));
  const userBubble = env.makeEl('div', 'Settings');
  userBubble.setAttribute('data-testid', 'user-message-bubble');
  userBubble.setAttribute('title', 'Copy');
  const plannerResp = env.makeEl('div', 'New Conversation');
  plannerResp.setAttribute('data-testid', 'planner-response-text');
  const branchPill = env.makeEl('span', 'General');
  branchPill.setAttribute('data-testid', 'branch-pill-trigger');
  const wsName = env.makeEl('span', 'Workspace');
  wsName.setAttribute('data-testid', 'workspace-name');
  const noI18n = env.makeEl('div', 'Settings');
  noI18n.setAttribute('data-ag-no-i18n', '1');
  noI18n.setAttribute('title', 'Settings');
  const owned = env.makeEl('div', 'Settings');
  owned.setAttribute('data-ag-sg-owned', '1');
  const sagOwned = env.makeEl('div', 'Settings');
  sagOwned.setAttribute('data-ag-sag-owned', '1');
  const translateNo = env.makeEl('div', 'Settings');
  translateNo.setAttribute('translate', 'no');
  const rtl = env.makeEl('div', 'Settings');
  rtl.setAttribute('dir', 'rtl');

  // Editable controls: value & internal text skipped, whitelisted placeholder/title/aria-label translated & reversible
  const textarea = env.makeEl('textarea', 'Settings');
  textarea.value = 'Settings';
  textarea.setAttribute('placeholder', 'Ask anything...');
  textarea.setAttribute('aria-label', 'Type a message...');
  textarea.setAttribute('data-label', 'Settings'); // non-whitelisted attr must never change

  const searchInput = env.makeEl('input');
  searchInput.value = 'Delete';
  searchInput.setAttribute('placeholder', 'Search conversations...');
  searchInput.setAttribute('title', 'Filter');

  const lexical = env.makeEl('div');
  lexical.setAttribute('data-lexical-editor', 'true');
  lexical.setAttribute('aria-label', 'Ask anything...');
  const lexicalChild = env.makeEl('span', 'Settings');
  lexical.appendChild(lexicalChild);

  // Normal UI button with attributes
  const actionBtn = env.makeEl('button', 'Accept all');
  actionBtn.setAttribute('title', 'Apply changes');
  actionBtn.setAttribute('aria-label', 'Accept all');

  for (const el of [
    codeEl, preWrap, kbdEl, monaco, xterm, userBubble, plannerResp,
    branchPill, wsName, noI18n, owned, sagOwned, translateNo, rtl,
    textarea, searchInput, lexical, actionBtn,
  ]) {
    env.doc.body.appendChild(el);
  }

  const ctl = hostI18n.createHostI18nController({
    win: env.win,
    doc: env.doc,
    coexist,
    locale: 'zh-CN',
    autoObserve: false,
  });

  // Verify hard-skip containers untouched
  assert.equal(codeEl.textContent, 'Settings');
  assert.equal(preWrap.textContent, 'Cancel');
  assert.equal(kbdEl.textContent, 'Enter');
  assert.equal(monaco.textContent, 'Settings');
  assert.equal(xterm.textContent, 'Run command');
  assert.equal(userBubble.textContent, 'Settings');
  assert.equal(userBubble.getAttribute('title'), 'Copy');
  assert.equal(plannerResp.textContent, 'New Conversation');
  assert.equal(branchPill.textContent, 'General');
  assert.equal(wsName.textContent, 'Workspace');
  assert.equal(noI18n.textContent, 'Settings');
  assert.equal(noI18n.getAttribute('title'), 'Settings');
  assert.equal(owned.textContent, 'Settings');
  assert.equal(sagOwned.textContent, 'Settings');
  assert.equal(translateNo.textContent, 'Settings');
  assert.equal(rtl.textContent, 'Settings');

  // Verify editable controls protect content/value while translating whitelisted UI attributes
  assert.equal(textarea.textContent, 'Settings', 'Textarea text child must NEVER be translated');
  assert.equal(textarea.value, 'Settings', 'Textarea value must NEVER be mutated');
  assert.equal(textarea.getAttribute('placeholder'), '随便问点什么...');
  assert.equal(textarea.getAttribute('aria-label'), '输入消息...');
  assert.equal(textarea.getAttribute('data-label'), 'Settings', 'Non-whitelisted attribute must stay untouched');

  assert.equal(searchInput.value, 'Delete');
  assert.equal(searchInput.getAttribute('placeholder'), '搜索对话...');
  assert.equal(searchInput.getAttribute('title'), '筛选');

  assert.equal(lexicalChild.textContent, 'Settings', 'Lexical editor content must NEVER be translated');
  assert.equal(lexical.getAttribute('aria-label'), '随便问点什么...');

  assert.equal(actionBtn.textContent, '全部接受');
  assert.equal(actionBtn.getAttribute('title'), '应用更改');
  assert.equal(actionBtn.getAttribute('aria-label'), '全部接受');

  // Lossless attribute + text restore
  ctl.restoreAll();
  assert.equal(textarea.getAttribute('placeholder'), 'Ask anything...');
  assert.equal(textarea.getAttribute('aria-label'), 'Type a message...');
  assert.equal(searchInput.getAttribute('placeholder'), 'Search conversations...');
  assert.equal(searchInput.getAttribute('title'), 'Filter');
  assert.equal(lexical.getAttribute('aria-label'), 'Ask anything...');
  assert.equal(actionBtn.textContent, 'Accept all');
  assert.equal(actionBtn.getAttribute('title'), 'Apply changes');
  assert.equal(actionBtn.getAttribute('aria-label'), 'Accept all');

  ctl.destroy();
});

test('React dynamic text & attribute updates trigger re-translation and preserve latest orig on restore', () => {
  const env = createMockDomEnv();
  const statusSpan = env.makeEl('span', 'Settings');
  const textNode = statusSpan.firstChild;
  const labelBtn = env.makeEl('button', 'Run');
  labelBtn.setAttribute('title', 'Run command');
  env.doc.body.appendChild(statusSpan);
  env.doc.body.appendChild(labelBtn);

  const ctl = hostI18n.createHostI18nController({
    win: env.win,
    doc: env.doc,
    coexist,
    locale: 'zh-CN',
    autoObserve: false,
  });

  assert.equal(textNode.nodeValue, '设置');
  assert.equal(labelBtn.getAttribute('title'), '运行命令');

  // React mutates the existing TextNode and attribute in place with fresh English text
  textNode.nodeValue = 'Account';
  labelBtn.setAttribute('title', 'Stop generating');
  ctl.scanNow();
  assert.equal(textNode.nodeValue, '账号');
  assert.equal(labelBtn.getAttribute('title'), '停止生成');

  // Restore must restore the LATEST English source ('Account', 'Stop generating'), not stale 'Settings'
  ctl.restoreAll();
  assert.equal(textNode.nodeValue, 'Account');
  assert.equal(labelBtn.getAttribute('title'), 'Stop generating');

  // Re-translate, then React replaces text with untranslatable user identifier -> stale tracking cleared
  ctl.scanNow();
  assert.equal(textNode.nodeValue, '账号');
  textNode.nodeValue = 'custom_untranslatable_token_42';
  ctl.scanNow();
  assert.equal(textNode.nodeValue, 'custom_untranslatable_token_42');
  ctl.restoreAll();
  assert.equal(textNode.nodeValue, 'custom_untranslatable_token_42', 'restoreAll must never revert to stale orig');

  ctl.destroy();
});

test('Shadow DOM recursion translates open shadow trees and skips owned / no-i18n / #ag-prism-pulse-bar hosts', () => {
  const env = createMockDomEnv();

  // Normal open custom element with nested shadow DOM
  const normalHost = env.makeEl('ag-panel');
  const normalSr = normalHost.attachShadow();
  const normalTitle = env.makeEl('h2', 'Appearance');
  normalTitle.setAttribute('title', 'Settings');
  normalSr.appendChild(normalTitle);

  const nestedHost = env.makeEl('ag-subpanel');
  const nestedSr = nestedHost.attachShadow();
  const nestedBtn = env.makeEl('button', 'Check for updates');
  nestedSr.appendChild(nestedBtn);
  normalSr.appendChild(nestedHost);

  // Skipped shadow hosts
  const ownedHost = env.makeEl('div');
  ownedHost.setAttribute('data-ag-sg-owned', '1');
  const ownedSr = ownedHost.attachShadow();
  const ownedSpan = env.makeEl('span', 'Settings');
  ownedSr.appendChild(ownedSpan);

  const noI18nHost = env.makeEl('div');
  noI18nHost.setAttribute('data-ag-no-i18n', '1');
  const noI18nSr = noI18nHost.attachShadow();
  const noI18nSpan = env.makeEl('span', 'History');
  noI18nSr.appendChild(noI18nSpan);

  const pulseHost = env.makeEl('div');
  pulseHost.setAttribute('id', 'ag-prism-pulse-bar');
  const pulseSr = pulseHost.attachShadow();
  const pulseSpan = env.makeEl('span', 'Compact');
  pulseSr.appendChild(pulseSpan);

  for (const h of [normalHost, ownedHost, noI18nHost, pulseHost]) env.doc.body.appendChild(h);

  const ctl = hostI18n.createHostI18nController({
    win: env.win,
    doc: env.doc,
    coexist,
    locale: 'zh-CN',
    autoObserve: false,
  });

  assert.equal(normalTitle.textContent, '外观');
  assert.equal(normalTitle.getAttribute('title'), '设置');
  assert.equal(nestedBtn.textContent, '检查更新');

  assert.equal(ownedSpan.textContent, 'Settings', 'data-ag-sg-owned shadowRoot must be skipped');
  assert.equal(noI18nSpan.textContent, 'History', 'data-ag-no-i18n shadowRoot must be skipped');
  assert.equal(pulseSpan.textContent, 'Compact', '#ag-prism-pulse-bar shadowRoot must be skipped');

  // Even direct scanNow(pulseSr) must respect shadow host exclusion
  ctl.scanNow(pulseSr);
  assert.equal(pulseSpan.textContent, 'Compact');

  ctl.restoreAll();
  assert.equal(normalTitle.textContent, 'Appearance');
  assert.equal(normalTitle.getAttribute('title'), 'Settings');
  assert.equal(nestedBtn.textContent, 'Check for updates');

  ctl.destroy();
});

test('Obsidian Prism conflict arbitration: yield (default) vs takeover and dynamic activation/recovery', () => {
  const env = createMockDomEnv();
  const label = env.makeEl('span', 'Settings');
  env.doc.body.appendChild(label);

  // Case 1: Prism active via html attribute before init -> yield cleanly
  env.doc.documentElement.setAttribute('data-ag-prism-host-i18n', 'active');
  const ctl = hostI18n.createHostI18nController({
    win: env.win,
    doc: env.doc,
    coexist,
    locale: 'zh-CN',
    autoObserve: false,
  });

  assert.equal(label.textContent, 'Settings');
  assert.equal(ctl.getConflictState().detected, true);
  assert.equal(ctl.getConflictState().yieldedTo, 'obsidian-prism');
  assert.equal(env.doc.documentElement.getAttribute('data-ag-sag-host-i18n'), null);

  // Switch policy to takeover -> translates immediately
  ctl.setConflictPolicy('takeover');
  assert.equal(label.textContent, '设置');
  assert.equal(ctl.getConflictState().yieldedTo, null);
  assert.equal(env.doc.documentElement.getAttribute('data-ag-sag-host-i18n'), 'active');

  // Switch back to yield while Prism is still active -> restores immediately
  ctl.setConflictPolicy('yield');
  assert.equal(label.textContent, 'Settings');
  assert.equal(ctl.getConflictState().yieldedTo, 'obsidian-prism');
  assert.equal(env.doc.documentElement.getAttribute('data-ag-sag-host-i18n'), null);

  // Prism deactivates -> resumes translating on scanNow()
  env.doc.documentElement.removeAttribute('data-ag-prism-host-i18n');
  ctl.scanNow();
  assert.equal(label.textContent, '设置');
  assert.equal(ctl.getConflictState().yieldedTo, null);

  // Case 2: Prism activates dynamically via win.__agPrismHostI18n -> restores and yields
  env.win.__agPrismHostI18n = { version: '1.0.9' };
  ctl.scanNow();
  assert.equal(label.textContent, 'Settings');
  assert.equal(ctl.getConflictState().yieldedTo, 'obsidian-prism');
  assert.equal(env.doc.documentElement.getAttribute('data-ag-sag-host-i18n'), null);

  delete env.win.__agPrismHostI18n;
  ctl.destroy();
});

test('Custom pack hot merge, KEEP_UNTRANSLATED_EXACT protection, and clean rollback', () => {
  const env = createMockDomEnv();
  const settingsEl = env.makeEl('span', 'Settings');
  const customOnlyEl = env.makeEl('span', 'Quantum Relay Panel');
  const keepEl = env.makeEl('span', 'MCP');
  env.doc.body.appendChild(settingsEl);
  env.doc.body.appendChild(customOnlyEl);
  env.doc.body.appendChild(keepEl);

  const ctl = hostI18n.createHostI18nController({
    win: env.win,
    doc: env.doc,
    coexist,
    locale: 'zh-CN',
    autoObserve: false,
  });

  assert.equal(settingsEl.textContent, '设置');
  assert.equal(customOnlyEl.textContent, 'Quantum Relay Panel');

  // Hot merge custom override + new term + attempted override of protected term
  ctl.mergeCustomPack({
    exact: {
      Settings: '系统设置（自定义）',
      'Quantum Relay Panel': '量子中继面板',
      MCP: '非法覆盖',
    },
  });

  assert.equal(settingsEl.textContent, '系统设置（自定义）');
  assert.equal(customOnlyEl.textContent, '量子中继面板');
  assert.equal(keepEl.textContent, 'MCP', 'Custom pack must NEVER override KEEP_UNTRANSLATED_EXACT');

  // Built-in pack must remain completely unmutated
  assert.equal(packsMod.getPack('zh-CN').exact.Settings, '设置');

  // Clear custom pack -> override reverts to built-in, custom-only restores to original English
  ctl.clearCustomPacks();
  assert.equal(settingsEl.textContent, '设置');
  assert.equal(customOnlyEl.textContent, 'Quantum Relay Panel');

  ctl.destroy();
});

test('Missing phrase collector: opt-in, secret/path/URL/email filtering, dedupe, 500 cap, and export template', () => {
  const env = createMockDomEnv();
  const samples = [
    'Unseen Toolbar Action',
    'Unseen Toolbar Action', // duplicate
    'Another Custom Dialog',
    'a', // too short (<2)
    'X'.repeat(121), // too long (>120)
    '123456', // pure digits
    '已经翻译的中文', // non-ASCII
    '/Users/demo/project/app.js', // unix path
    'C:\\Users\\demo\\app.ts', // windows path
    'src/core/host-i18n.js', // relative file path
    'https://example.com/docs', // URL
    'dev@example.com', // email
    '11111111-1111-4111-8111-111111111111', // UUID
    'sk-proj-abc1234567890SECRET', // OpenAI key
    'AIzaSyD-1234567890abcdefg', // Google API key
    'Bearer eyJhbGciOiJIUzI1NiJ9', // Bearer token
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV', // JWT
    'ghp_1234567890abcdef123456', // GitHub PAT
    'AKIAIOSFODNN7EXAMPLE', // AWS key
    '/slashcmd', // slash command
    'Antigravity', // KEEP_UNTRANSLATED_EXACT
  ];

  for (const s of samples) env.doc.body.appendChild(env.makeEl('span', s));

  // Default collectMissing is false
  const ctl = hostI18n.createHostI18nController({
    win: env.win,
    doc: env.doc,
    coexist,
    locale: 'zh-CN',
    autoObserve: false,
  });
  assert.deepEqual(ctl.getMissingPhrases(), []);

  // Enable collector and rescan
  ctl.setCollectMissing(true);
  ctl.scanNow();
  assert.deepEqual(ctl.getMissingPhrases(), ['Unseen Toolbar Action', 'Another Custom Dialog']);

  const tpl = ctl.exportMissingTemplate('ja');
  assert.equal(tpl.meta.locale, 'ja');
  assert.equal(tpl.meta.schemaVersion, 2);
  assert.equal(tpl.meta.count, 2);
  assert.deepEqual(tpl.exact, {
    'Unseen Toolbar Action': '',
    'Another Custom Dialog': '',
  });

  // Verify 500-item cap
  ctl.clearMissingPhrases();
  assert.equal(ctl.getMissingPhrases().length, 0);
  for (let i = 0; i < 550; i++) {
    ctl.translateText(`Unseen UI Phrase ${i}`);
  }
  assert.equal(ctl.getMissingPhrases().length, 500);

  ctl.destroy();
});

test('Bounded FIFO cache enforces maxCacheSize without degrading lookup accuracy', () => {
  const ctl = hostI18n.createHostI18nController({
    doc: null,
    coexist,
    locale: 'zh-CN',
    maxCacheSize: 5,
    autoObserve: false,
  });

  const phrases = [
    ['Settings', '设置'],
    ['History', '历史记录'],
    ['Workspace', '工作区'],
    ['Terminal', '终端'],
    ['Browser', '浏览器'],
    ['Artifacts', '产物'],
    ['Workflows', '工作流'],
    ['Unmatched Phrase Alpha', 'Unmatched Phrase Alpha'],
    ['3 files changed', '3 个文件已更改'],
  ];

  for (const [src, expected] of phrases) {
    assert.equal(ctl.translateText(src), expected);
    assert.ok(ctl.getStats().cacheSize <= 5, `cacheSize ${ctl.getStats().cacheSize} exceeded maxCacheSize 5`);
  }
  assert.equal(ctl.getStats().cacheSize, 5);

  // Re-query evicted earliest entry -> still translates accurately
  assert.equal(ctl.translateText('Settings'), '设置');
  assert.equal(ctl.getStats().cacheSize, 5);

  ctl.destroy();
});

test('MutationObserver microtask batching, hibernation awareness, and zero-residue destroy()', async () => {
  const env = createMockDomEnv();
  const initialEl = env.makeEl('span', 'Settings');
  env.doc.body.appendChild(initialEl);

  const ctl = hostI18n.createHostI18nController({
    win: env.win,
    doc: env.doc,
    coexist,
    locale: 'zh-CN',
    autoObserve: true,
  });

  assert.equal(initialEl.textContent, '设置');
  assert.ok(ctl.getDebugState().observerCount >= 2, 'Body + html observers must be registered');

  // Dynamic insertion via MutationObserver microtask batch
  const dynamicBtn = env.makeEl('button', 'Accept all');
  env.doc.body.appendChild(dynamicBtn);
  env.emitMutationsForTarget(env.doc.body, [{ type: 'childList', addedNodes: [dynamicBtn] }]);

  // Synchronous before microtask flush -> not yet translated
  assert.equal(dynamicBtn.textContent, 'Accept all');
  await Promise.resolve();
  assert.equal(dynamicBtn.textContent, '全部接受');

  // Window hibernates -> mutations defer scanning until wakeup
  env.doc.hidden = true;
  const deferredEl = env.makeEl('span', 'Retry');
  env.doc.body.appendChild(deferredEl);
  env.emitMutationsForTarget(env.doc.body, [{ type: 'childList', addedNodes: [deferredEl] }]);
  await Promise.resolve();
  assert.equal(deferredEl.textContent, 'Retry', 'Hibernated window must defer translation');
  assert.equal(ctl.getDebugState().hibernatedDirty, true);

  // Wake up via visibilitychange -> flushes deferred batch
  env.doc.hidden = false;
  env.doc.dispatchEvent({ type: 'visibilitychange' });
  await Promise.resolve();
  assert.equal(deferredEl.textContent, '重试');
  assert.equal(ctl.getDebugState().hibernatedDirty, false);

  // Destroy -> zero DOM residue, all observers disconnected, all listeners removed
  ctl.destroy();
  assert.equal(initialEl.textContent, 'Settings');
  assert.equal(dynamicBtn.textContent, 'Accept all');
  assert.equal(deferredEl.textContent, 'Retry');
  assert.equal(env.doc.documentElement.getAttribute('data-ag-sag-host-i18n'), null);
  assert.equal(env.doc.documentElement.getAttribute('data-ag-sag-lang'), null);
  assert.equal(ctl.getDebugState().destroyed, true);
  assert.equal(ctl.getDebugState().observerCount, 0);
  assert.ok(env.observerInstances.every((o) => o.disconnected), 'All MutationObservers must disconnect on destroy()');
  assert.equal(env.docListeners.get('visibilitychange')?.size || 0, 0);
  assert.equal(env.winListeners.get('focus')?.size || 0, 0);

  // Subsequent operations after destroy() are safe no-ops
  ctl.setLocale('ja');
  ctl.scanNow();
  assert.equal(initialEl.textContent, 'Settings');
});

test('UMD browser global export attaches __agSagHostI18nPacks and __agSagHostI18n cleanly without CommonJS', () => {
  const packsCode = fs.readFileSync(new URL('../packages/core/host-i18n-packs.js', import.meta.url), 'utf8');
  const engineCode = fs.readFileSync(new URL('../packages/core/host-i18n.js', import.meta.url), 'utf8');

  const sandbox = {};
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  vm.runInContext(packsCode, sandbox);
  vm.runInContext(engineCode, sandbox);

  assert.ok(sandbox.__agSagHostI18nPacks, 'Must expose root.__agSagHostI18nPacks in non-CommonJS environment');
  assert.ok(sandbox.__agSagHostI18n, 'Must expose root.__agSagHostI18n in non-CommonJS environment');
  assert.equal(sandbox.__agSagHostI18nPacks.validatePacks().ok, true);

  const ctl = sandbox.__agSagHostI18n.createHostI18nController({
    doc: null,
    locale: 'ko',
    autoObserve: false,
  });
  assert.equal(ctl.translateText('New Conversation'), '새 대화');
  assert.equal(ctl.translateText('3 files changed'), '3개 파일 변경됨');
  ctl.destroy();
});

test('Regression [High #3]: locale="auto" resolves data-ag-cs-lang > html[lang] > navigator.language without self-lock, and setLocale("en") restores English', () => {
  // 1) Out-of-the-box auto resolution via navigator.language = 'zh-CN'
  const envNav = createMockDomEnv();
  envNav.win.navigator = { language: 'zh-CN' };
  const navSpan = envNav.makeEl('span', 'Settings');
  const navBtn = envNav.makeEl('button', 'New Conversation');
  envNav.doc.body.appendChild(navSpan);
  envNav.doc.body.appendChild(navBtn);

  const ctlNav = hostI18n.createHostI18nController({
    win: envNav.win,
    doc: envNav.doc,
    coexist,
    locale: 'auto',
    autoObserve: false,
  });

  assert.equal(navSpan.textContent, '设置', 'locale="auto" with navigator.language="zh-CN" must activate Chinese out of the box');
  assert.equal(navBtn.textContent, '新建对话');
  assert.equal(ctlNav.getLocale(), 'zh-CN');
  assert.equal(ctlNav.getDebugState().configuredLocale, 'auto');
  assert.equal(ctlNav.getDebugState().locale, 'zh-CN');
  assert.equal(ctlNav.getDebugState().active, true);
  assert.equal(envNav.doc.documentElement.getAttribute('data-ag-sag-lang'), 'zh-CN');

  // Switch to 'fr' (writes data-ag-sag-lang="fr"), then back to 'auto' -> must NOT self-lock on data-ag-sag-lang
  ctlNav.setLocale('fr');
  assert.equal(navSpan.textContent, 'Paramètres');
  assert.equal(envNav.doc.documentElement.getAttribute('data-ag-sag-lang'), 'fr');
  assert.equal(ctlNav.getDebugState().configuredLocale, 'fr');

  ctlNav.setLocale('auto');
  assert.equal(ctlNav.getLocale(), 'zh-CN', 'setLocale("auto") must ignore own data-ag-sag-lang to prevent self-lock');
  assert.equal(ctlNav.getDebugState().configuredLocale, 'auto');
  assert.equal(ctlNav.getDebugState().locale, 'zh-CN');
  assert.equal(ctlNav.getDebugState().active, true);
  assert.equal(navSpan.textContent, '设置');

  // Explicit setLocale('en') must still restore original English even when navigator.language is zh-CN
  ctlNav.setLocale('en');
  assert.equal(ctlNav.getLocale(), 'en');
  assert.equal(ctlNav.getDebugState().configuredLocale, 'en');
  assert.equal(ctlNav.getDebugState().active, false);
  assert.equal(navSpan.textContent, 'Settings');
  assert.equal(navBtn.textContent, 'New Conversation');
  assert.equal(envNav.doc.documentElement.getAttribute('data-ag-sag-lang'), null);
  assert.equal(envNav.doc.documentElement.getAttribute('data-ag-sag-host-i18n'), null);

  // Empty locale string also delegates to 'auto'
  ctlNav.setLocale('');
  assert.equal(ctlNav.getDebugState().configuredLocale, 'auto');
  assert.equal(ctlNav.getLocale(), 'zh-CN');
  assert.equal(navSpan.textContent, '设置');

  // No environment hint after switching from 'fr' -> 'auto' resolves to 'en' cleanly without self-lock
  envNav.win.navigator = { language: '' };
  ctlNav.setLocale('fr');
  assert.equal(envNav.doc.documentElement.getAttribute('data-ag-sag-lang'), 'fr');
  ctlNav.setLocale('auto');
  assert.equal(ctlNav.getLocale(), 'en');
  assert.equal(ctlNav.getDebugState().configuredLocale, 'auto');
  assert.equal(ctlNav.getDebugState().active, false);
  assert.equal(navSpan.textContent, 'Settings');
  ctlNav.destroy();

  // 2) html[lang="ja"] takes precedence over navigator.language = 'zh-CN'
  const envHtml = createMockDomEnv();
  envHtml.doc.documentElement.setAttribute('lang', 'ja');
  envHtml.win.navigator = { language: 'zh-CN' };
  const jaBtn = envHtml.makeEl('button', 'New Conversation');
  envHtml.doc.body.appendChild(jaBtn);

  const ctlHtml = hostI18n.createHostI18nController({
    win: envHtml.win,
    doc: envHtml.doc,
    coexist,
    // omitted locale defaults to 'auto'
    autoObserve: false,
  });
  assert.equal(ctlHtml.getDebugState().configuredLocale, 'auto');
  assert.equal(ctlHtml.getDebugState().locale, 'ja');
  assert.equal(ctlHtml.getDebugState().active, true);
  assert.equal(jaBtn.textContent, '新しい会話');

  // 3) html[data-ag-cs-lang="ko-KR"] takes highest precedence over html[lang] and navigator.language
  envHtml.doc.documentElement.setAttribute('data-ag-cs-lang', 'ko-KR');
  ctlHtml.setLocale('auto');
  assert.equal(ctlHtml.getDebugState().configuredLocale, 'auto');
  assert.equal(ctlHtml.getDebugState().locale, 'ko');
  assert.equal(ctlHtml.getDebugState().active, true);
  assert.equal(jaBtn.textContent, '새 대화');

  ctlHtml.setLocale('en');
  assert.equal(jaBtn.textContent, 'New Conversation');
  ctlHtml.destroy();
});

test('Regression [High #4]: dynamic text/attr untrack sync across sweepDeadRefs() restores 100% on setLocale("en") and destroy(), plus periodic flush sweep', async () => {
  const env = createMockDomEnv();
  const labelSpan = env.makeEl('span', 'Settings');
  const textNode = labelSpan.firstChild;
  const actionBtn = env.makeEl('button', 'Cancel');
  actionBtn.setAttribute('title', 'Settings');
  actionBtn.setAttribute('aria-label', 'Cancel');
  env.doc.body.appendChild(labelSpan);
  env.doc.body.appendChild(actionBtn);

  const ctl = hostI18n.createHostI18nController({
    win: env.win,
    doc: env.doc,
    coexist,
    locale: 'zh-CN',
    autoObserve: false,
  });

  // Step 1: Initial translation
  assert.equal(textNode.nodeValue, '设置');
  assert.equal(actionBtn.getAttribute('title'), '设置');
  assert.equal(actionBtn.getAttribute('aria-label'), '取消');

  // Step 2: React mutates existing TextNode and attributes to untranslatable dynamic values
  textNode.nodeValue = 'UserDynamic123';
  actionBtn.setAttribute('title', 'DynTitle123');
  actionBtn.setAttribute('aria-label', 'DynAria123');
  ctl.scanNow(); // triggers untrack + sweepDeadRefs()
  assert.equal(textNode.nodeValue, 'UserDynamic123');
  assert.equal(actionBtn.getAttribute('title'), 'DynTitle123');
  assert.equal(actionBtn.getAttribute('aria-label'), 'DynAria123');
  assert.equal(ctl.getDebugState().trackedAttrCount, 0);
  assert.equal(ctl.getDebugState().trackedAttrRefCount, 0);

  // Step 3: React mutates the SAME TextNode and attributes back to translatable English phrases
  textNode.nodeValue = 'Settings';
  actionBtn.setAttribute('title', 'Settings');
  actionBtn.setAttribute('aria-label', 'Cancel');
  ctl.scanNow();
  assert.equal(textNode.nodeValue, '设置');
  assert.equal(actionBtn.getAttribute('title'), '设置');
  assert.equal(actionBtn.getAttribute('aria-label'), '取消');
  assert.equal(ctl.getDebugState().trackedAttrCount, 1);
  assert.equal(ctl.getDebugState().trackedAttrRefCount, 1);

  // Step 4: setLocale('en') MUST 100% restore both TextNode and attributes
  ctl.setLocale('en');
  assert.equal(textNode.nodeValue, 'Settings', 'Re-tracked TextNode must restore to "Settings" on setLocale("en")');
  assert.equal(actionBtn.getAttribute('title'), 'Settings', 'Re-tracked title attr must restore on setLocale("en")');
  assert.equal(actionBtn.getAttribute('aria-label'), 'Cancel', 'Re-tracked aria-label attr must restore on setLocale("en")');

  // Step 5: Repeat the exact same dynamic cycle, then verify destroy() restores 100%
  ctl.setLocale('zh-CN');
  assert.equal(textNode.nodeValue, '设置');
  assert.equal(actionBtn.getAttribute('title'), '设置');

  textNode.nodeValue = 'UserDynamic456';
  actionBtn.removeAttribute('title');
  actionBtn.setAttribute('aria-label', 'DynAria456');
  ctl.scanNow();
  assert.equal(ctl.getDebugState().trackedAttrCount, 0);

  textNode.nodeValue = 'Settings';
  actionBtn.setAttribute('title', 'Settings');
  actionBtn.setAttribute('aria-label', 'Cancel');
  ctl.scanNow();
  assert.equal(textNode.nodeValue, '设置');
  assert.equal(actionBtn.getAttribute('title'), '设置');
  assert.equal(actionBtn.getAttribute('aria-label'), '取消');

  ctl.destroy();
  assert.equal(textNode.nodeValue, 'Settings', 'Re-tracked TextNode must restore to "Settings" on destroy()');
  assert.equal(actionBtn.getAttribute('title'), 'Settings', 'Re-tracked title attr must restore on destroy()');
  assert.equal(actionBtn.getAttribute('aria-label'), 'Cancel', 'Re-tracked aria-label attr must restore on destroy()');

  // Step 6: Verify flushPending() periodically triggers sweepDeadRefs() (both 100-batch cadence and >500 ref threshold)
  const envFlush = createMockDomEnv();
  const liveSpan = envFlush.makeEl('span', 'Settings');
  envFlush.doc.body.appendChild(liveSpan);
  const ctlFlush = hostI18n.createHostI18nController({
    win: envFlush.win,
    doc: envFlush.doc,
    coexist,
    locale: 'zh-CN',
    autoObserve: true,
  });

  const sweepsBeforeBatches = ctlFlush.getDebugState().sweepCount;
  for (let i = 0; i < 100; i++) {
    const tmp = envFlush.makeEl('span', `UnmatchedBatch_${i}`);
    envFlush.doc.body.appendChild(tmp);
    envFlush.emitMutationsForTarget(envFlush.doc.body, [{ type: 'childList', addedNodes: [tmp] }]);
    await Promise.resolve();
  }
  assert.ok(
    ctlFlush.getDebugState().sweepCount > sweepsBeforeBatches,
    'flushPending() must periodically invoke sweepDeadRefs() after 100 batches',
  );

  // > 500 tracked refs threshold triggers immediate sweep in flushPending()
  for (let i = 0; i < 505; i++) {
    envFlush.doc.body.appendChild(envFlush.makeEl('span', 'Settings'));
  }
  ctlFlush.scanNow();
  assert.ok(ctlFlush.getDebugState().trackedTextRefCount > 500);

  const sweepsBeforeThreshold = ctlFlush.getDebugState().sweepCount;
  const oneMore = envFlush.makeEl('span', 'History');
  envFlush.doc.body.appendChild(oneMore);
  envFlush.emitMutationsForTarget(envFlush.doc.body, [{ type: 'childList', addedNodes: [oneMore] }]);
  await Promise.resolve();
  assert.equal(oneMore.textContent, '历史记录');
  assert.equal(
    ctlFlush.getDebugState().sweepCount,
    sweepsBeforeThreshold + 1,
    'flushPending() must invoke sweepDeadRefs() when tracked refs exceed 500',
  );
  ctlFlush.destroy();
});

test('Regression [Medium #6]: bare contenteditable="", contenteditable="plaintext-only", and isContentEditable skip inner text while allowing own whitelisted UI attrs', async () => {
  assert.ok(hostI18n.HARD_SKIP_SELECTORS.includes('[contenteditable=""]'));
  assert.ok(hostI18n.HARD_SKIP_SELECTORS.includes('[contenteditable="true"]'));
  assert.ok(hostI18n.HARD_SKIP_SELECTORS.includes('[contenteditable="plaintext-only"]'));

  const env = createMockDomEnv();

  const bareCe = env.makeEl('div', 'Settings');
  bareCe.setAttribute('contenteditable', '');
  bareCe.setAttribute('aria-label', 'Ask anything...');
  const bareChild = env.makeEl('span', 'Cancel');
  bareCe.appendChild(bareChild);

  const plainCe = env.makeEl('div', 'Settings');
  plainCe.setAttribute('contenteditable', 'plaintext-only');
  plainCe.setAttribute('placeholder', 'Type a message...');
  plainCe.setAttribute('title', 'Settings');
  const plainChild = env.makeEl('span', 'Delete');
  plainCe.appendChild(plainChild);

  const upperCe = env.makeEl('div', 'Settings');
  upperCe.setAttribute('contenteditable', 'PLAINTEXT-ONLY');

  const propCe = env.makeEl('div', 'Settings');
  propCe.isContentEditable = true;
  propCe.setAttribute('title', 'Settings');

  const falseCe = env.makeEl('div', 'Settings');
  falseCe.setAttribute('contenteditable', 'false');

  for (const el of [bareCe, plainCe, upperCe, propCe, falseCe]) {
    env.doc.body.appendChild(el);
  }

  const ctl = hostI18n.createHostI18nController({
    win: env.win,
    doc: env.doc,
    coexist,
    locale: 'zh-CN',
    autoObserve: true,
  });

  // Inner text nodes inside all editable variants MUST NOT be translated
  assert.equal(bareCe.firstChild.nodeValue, 'Settings', 'Bare contenteditable="" text must NOT be translated');
  assert.equal(bareChild.textContent, 'Cancel', 'Descendant inside contenteditable="" must NOT be translated');
  assert.equal(plainCe.firstChild.nodeValue, 'Settings', 'contenteditable="plaintext-only" text must NOT be translated');
  assert.equal(plainChild.textContent, 'Delete', 'Descendant inside contenteditable="plaintext-only" must NOT be translated');
  assert.equal(upperCe.textContent, 'Settings', 'Case-insensitive contenteditable="PLAINTEXT-ONLY" must NOT be translated');
  assert.equal(propCe.textContent, 'Settings', 'Element with isContentEditable=true must NOT be translated');

  // Own whitelisted UI attributes on editable containers ARE still translated
  assert.equal(bareCe.getAttribute('aria-label'), '随便问点什么...');
  assert.equal(plainCe.getAttribute('placeholder'), '输入消息...');
  assert.equal(plainCe.getAttribute('title'), '设置');
  assert.equal(propCe.getAttribute('title'), '设置');

  // contenteditable="false" is NOT editable -> translates normally
  assert.equal(falseCe.textContent, '设置');

  // MutationObserver characterData inside contenteditable="" / plaintext-only must also stay untouched
  bareCe.firstChild.nodeValue = 'History';
  plainCe.firstChild.nodeValue = 'Workspace';
  env.emitMutationsForTarget(env.doc.body, [
    { type: 'characterData', target: bareCe.firstChild },
    { type: 'characterData', target: plainCe.firstChild },
  ]);
  await Promise.resolve();
  assert.equal(bareCe.firstChild.nodeValue, 'History');
  assert.equal(plainCe.firstChild.nodeValue, 'Workspace');

  // Restore cleanly restores translated attributes on editable containers and contenteditable="false"
  ctl.destroy();
  assert.equal(bareCe.getAttribute('aria-label'), 'Ask anything...');
  assert.equal(plainCe.getAttribute('placeholder'), 'Type a message...');
  assert.equal(plainCe.getAttribute('title'), 'Settings');
  assert.equal(propCe.getAttribute('title'), 'Settings');
  assert.equal(falseCe.textContent, 'Settings');
});

test('Regression [Low #11]: disabled init and setEnabled(false) maintain zero active MutationObservers and listeners, re-attaching cleanly on setEnabled(true)', async () => {
  const env = createMockDomEnv();
  const label = env.makeEl('span', 'Settings');
  const shadowHost = env.makeEl('ag-panel');
  const sr = shadowHost.attachShadow();
  const srTitle = env.makeEl('h2', 'Appearance');
  sr.appendChild(srTitle);
  env.doc.body.appendChild(label);
  env.doc.body.appendChild(shadowHost);

  // 1) Initialize with enabled: false and autoObserve: true -> ZERO observers and ZERO event listeners
  const ctl = hostI18n.createHostI18nController({
    win: env.win,
    doc: env.doc,
    coexist,
    locale: 'zh-CN',
    enabled: false,
    autoObserve: true,
  });

  assert.equal(ctl.getDebugState().enabled, false);
  assert.equal(ctl.getDebugState().active, false);
  assert.equal(ctl.getDebugState().observerCount, 0, 'Disabled init must have 0 active observers');
  assert.equal(env.observerInstances.length, 0, 'Disabled init must never instantiate MutationObserver');
  assert.equal(env.docListeners.get('visibilitychange')?.size || 0, 0, 'Disabled init must not bind visibilitychange');
  assert.equal(env.winListeners.get('focus')?.size || 0, 0, 'Disabled init must not bind focus');
  assert.equal(label.textContent, 'Settings');
  assert.equal(srTitle.textContent, 'Appearance');

  // 2) Enable -> starts observers (body + shared html bus + shadowRoot) and translates
  ctl.setEnabled(true);
  assert.equal(ctl.getDebugState().enabled, true);
  assert.equal(ctl.getDebugState().active, true);
  assert.equal(ctl.getDebugState().observerCount, 3, 'Enabled state should observe body, html, and open shadowRoot');
  assert.equal(env.observerInstances.filter((o) => !o.disconnected).length, 3);
  const visAfterEnable = env.docListeners.get('visibilitychange')?.size || 0;
  const focusAfterEnable = env.winListeners.get('focus')?.size || 0;
  assert.ok(visAfterEnable >= 1 && visAfterEnable <= 2);
  assert.ok(focusAfterEnable >= 1 && focusAfterEnable <= 2);
  assert.equal(label.textContent, '设置');
  assert.equal(srTitle.textContent, '外观');

  // Idempotent setEnabled(true) must not duplicate observers or listeners
  ctl.setEnabled(true);
  assert.equal(ctl.getDebugState().observerCount, 3);
  assert.equal(env.docListeners.get('visibilitychange')?.size || 0, visAfterEnable);
  assert.equal(env.winListeners.get('focus')?.size || 0, focusAfterEnable);

  // 3) Disable -> disconnects ALL observers (including shadowRoot), removes listeners, and restores DOM
  ctl.setEnabled(false);
  assert.equal(ctl.getDebugState().enabled, false);
  assert.equal(ctl.getDebugState().observerCount, 0, 'setEnabled(false) must leave 0 active observers');
  assert.equal(
    env.observerInstances.filter((o) => !o.disconnected).length,
    0,
    'All MutationObservers including shadowRoot observer must disconnect on setEnabled(false)',
  );
  assert.equal(env.docListeners.get('visibilitychange')?.size || 0, 0);
  assert.equal(env.winListeners.get('focus')?.size || 0, 0);
  assert.equal(label.textContent, 'Settings');
  assert.equal(srTitle.textContent, 'Appearance');
  assert.equal(env.doc.documentElement.getAttribute('data-ag-sag-host-i18n'), null);

  // 4) Re-enable -> re-attaches body, html, and shadowRoot observers (observedRoots must have been cleared)
  ctl.setEnabled(true);
  assert.equal(ctl.getDebugState().observerCount, 3);
  assert.equal(env.observerInstances.filter((o) => !o.disconnected).length, 3);
  assert.equal(label.textContent, '设置');
  assert.equal(srTitle.textContent, '外观');

  // Confirm re-attached shadowRoot observer actively translates newly added shadow DOM nodes
  const dynamicSrBtn = env.makeEl('button', 'Check for updates');
  sr.appendChild(dynamicSrBtn);
  env.emitMutationsForTarget(sr, [{ type: 'childList', addedNodes: [dynamicSrBtn] }]);
  await Promise.resolve();
  assert.equal(dynamicSrBtn.textContent, '检查更新');

  ctl.destroy();
  assert.equal(ctl.getDebugState().observerCount, 0);
  assert.equal(env.observerInstances.filter((o) => !o.disconnected).length, 0);
  assert.equal(dynamicSrBtn.textContent, 'Check for updates');

  // 5) autoObserve: false stays at 0 observers even when setEnabled(true) is called
  const envNoObs = createMockDomEnv();
  envNoObs.doc.body.appendChild(envNoObs.makeEl('span', 'Settings'));
  const ctlNoObs = hostI18n.createHostI18nController({
    win: envNoObs.win,
    doc: envNoObs.doc,
    coexist,
    locale: 'zh-CN',
    enabled: false,
    autoObserve: false,
  });
  ctlNoObs.setEnabled(true);
  assert.equal(ctlNoObs.getDebugState().observerCount, 0);
  assert.equal(envNoObs.observerInstances.length, 0);
  ctlNoObs.destroy();
});
