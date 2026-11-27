import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import vm from 'node:vm';
import { createRequire } from 'node:module';

import {
  EXT_PACK_LOCALES,
  buildInjectExpression,
  REMOVE_EXPRESSION,
  readExtendedPackFile,
} from '../cli/bundle.mjs';
import { SagWatchDaemon } from '../cli/watch-daemon.mjs';
import { startWorkbenchServer } from '../workbench/server.mjs';

const require = createRequire(import.meta.url);
const packsMod = require('../packages/core/host-i18n-packs.js');
const hostI18nMod = require('../packages/core/host-i18n.js');
const coexist = require('../packages/core/coexist.js');

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

test('packs merge precedence: custom > core 465 > extended pack', () => {
  packsMod.clearExtendedPacks();
  try {
    const corePack = packsMod.getPack('zh-CN');
    const coreSettings = corePack.exact.Settings;
    assert.ok(coreSettings, 'core pack should contain Settings');

    const reg = packsMod.registerExtendedPack('zh-CN', {
      locale: 'zh-CN',
      exact: {
        Settings: 'EXT_OVERRIDE_SHOULD_LOSE',
        __ExtOnlyPhrase__: '仅扩展词条',
      },
      patterns: [
        { source: '^Ext item (\\d+)$', flags: '', replace: '扩展条目 {1}' },
        { source: '^Invalid (unclosed', flags: '', replace: 'x' },
      ],
    });
    assert.equal(reg.ok, true);
    assert.equal(packsMod.hasExtendedPack('zh-CN'), true);

    const merged = packsMod.getPack('zh-CN');
    assert.equal(merged.exact.Settings, coreSettings, 'core exact must override extended');
    assert.equal(merged.exact.__ExtOnlyPhrase__, '仅扩展词条', 'extended-only exact should be present');
    assert.ok(
      merged.patterns.some((p) => p.source === '^Ext item (\\d+)$' && p.replace === '扩展条目 {1}'),
      'valid extended pattern should be merged'
    );
    assert.ok(
      !merged.patterns.some((p) => p.source === '^Invalid (unclosed'),
      'invalid extended pattern must be rejected'
    );

    const withCustom = packsMod.mergeCustomPack('zh-CN', {
      exact: {
        Settings: 'CUSTOM_SETTINGS_WINS',
        __ExtOnlyPhrase__: 'CUSTOM_EXT_WINS',
      },
    });
    assert.equal(withCustom.exact.Settings, 'CUSTOM_SETTINGS_WINS');
    assert.equal(withCustom.exact.__ExtOnlyPhrase__, 'CUSTOM_EXT_WINS');
  } finally {
    packsMod.clearExtendedPacks();
  }
});

test('hostI18n asynchronously requests extended pack on setLocale and fails silently on error', async () => {
  packsMod.clearExtendedPacks();
  const env = createMockDomEnv();
  const el = env.makeEl('span', '__AsyncExtKey__');
  env.doc.body.appendChild(el);
  let calls = 0;
  let shouldReject = false;

  const ctl = hostI18nMod.createHostI18nController({
    win: env.win,
    doc: env.doc,
    coexist,
    locale: 'en',
    autoObserve: false,
    requestExtendedPack: async (loc) => {
      calls += 1;
      if (shouldReject) throw new Error('network failed');
      return {
        locale: loc,
        exact: { __AsyncExtKey__: '异步扩展已生效' },
        patterns: [],
      };
    },
  });

  try {
    // 1. Rejection should fail silently and keep core functionality intact
    shouldReject = true;
    ctl.setLocale('ja');
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(calls, 1);
    assert.equal(packsMod.hasExtendedPack('ja'), false);
    assert.equal(el.textContent, '__AsyncExtKey__');
    assert.equal(ctl.getDebugState().extendedPackLoaded, false);

    // 2. Successful fetch registers extended pack and re-scans current DOM
    shouldReject = false;
    ctl.setLocale('zh-CN');
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(calls, 2);
    assert.equal(packsMod.hasExtendedPack('zh-CN'), true);
    assert.equal(el.textContent, '异步扩展已生效');
    assert.equal(ctl.getDebugState().extendedPackLoaded, true);
  } finally {
    ctl.destroy();
    assert.equal(packsMod.hasExtendedPack('zh-CN'), false, 'destroy() must clear extended packs');
    packsMod.clearExtendedPacks();
  }
});

test('buildInjectExpression preloads __agSagExtPacks within 1.6 MB and REMOVE_EXPRESSION cleans it up', () => {
  const MAX_BYTES = Math.floor(1.6 * 1024 * 1024); // 1,677,721 bytes
  const zhExt = readExtendedPackFile('zh-CN');
  assert.ok(zhExt && zhExt.exact && Object.keys(zhExt.exact).length > 1000, 'zh-CN ext pack should exist on disk');

  const expr = buildInjectExpression({ hostI18nLocale: 'zh-CN' }, { extLocale: 'zh-CN' });
  const byteLen = Buffer.byteLength(expr, 'utf8');
  assert.ok(byteLen <= MAX_BYTES, `Injected bundle (${byteLen} B) must stay <= ${MAX_BYTES} B`);
  assert.ok(expr.includes('window.__agSagExtPacks["zh-CN"]'), 'should preload zh-CN ext pack');

  // English build should not preload ext packs
  const enExpr = buildInjectExpression({ hostI18nLocale: 'en' });
  assert.ok(!enExpr.includes('window.__agSagExtPacks["en"]'));

  // Verify REMOVE_EXPRESSION removes __agSagExtPacks from both window and globalThis
  const removedAttrs = [];
  const fakeWindow = {
    __agSagExtPacks: { 'zh-CN': { exact: {} } },
    __agSagBridgeReceiver: () => {},
    __agSagNovSynergy: {},
  };
  const fakeDoc = {
    documentElement: {
      attributes: [{ name: 'data-ag-sag-host-i18n' }],
      removeAttribute: (name) => removedAttrs.push(name),
    },
    getElementById: () => null,
    querySelectorAll: () => [],
  };
  const sandbox = { window: fakeWindow, document: fakeDoc, globalThis: null };
  sandbox.globalThis = sandbox;
  sandbox.__agSagExtPacks = fakeWindow.__agSagExtPacks;

  const res = vm.runInNewContext(REMOVE_EXPRESSION, sandbox);
  assert.equal(res.ok, true);
  assert.equal('__agSagExtPacks' in fakeWindow, false);
  assert.equal('__agSagExtPacks' in sandbox, false);
  assert.ok(removedAttrs.includes('data-ag-sag-host-i18n'));
});

test('SagWatchDaemon._handleHostBridgePayload serves sag:ext_pack strictly by allowlist and rejects traversal', () => {
  const daemon = new SagWatchDaemon({ port: 9222, intervalMs: 5000 });

  // Valid zh-CN request
  const okRes = daemon._handleHostBridgePayload(
    JSON.stringify({ reqId: 'req-1', type: 'sag:ext_pack', payload: { locale: 'zh-CN' } })
  );
  assert.equal(okRes.ok, true);
  assert.equal(okRes.reqId, 'req-1');
  assert.equal(okRes.data.locale, 'zh-CN');
  assert.ok(okRes.data.pack && typeof okRes.data.pack.exact === 'object');

  // Path traversal & invalid locales
  for (const badLoc of ['../en', '../../package', 'en', 'xx-YY', 'zh-CN\0', '', 123]) {
    const badRes = daemon._handleHostBridgePayload(
      JSON.stringify({ reqId: 'req-bad', type: 'sag:ext_pack', payload: { locale: badLoc } })
    );
    assert.equal(badRes.ok, false, `locale ${JSON.stringify(badLoc)} must be rejected`);
  }

  // Oversized payload (> 64KB)
  const hugeRes = daemon._handleHostBridgePayload(
    JSON.stringify({
      reqId: 'req-huge',
      type: 'sag:ext_pack',
      payload: { locale: 'zh-CN', pad: 'a'.repeat(70000) },
    })
  );
  assert.equal(hugeRes.ok, false);

  // Stopped daemon rejects requests
  daemon._stopped = true;
  const stoppedRes = daemon._handleHostBridgePayload(
    JSON.stringify({ reqId: 'req-stop', type: 'sag:ext_pack', payload: { locale: 'zh-CN' } })
  );
  assert.equal(stoppedRes.ok, false);
});

test('workbench /ext/<loc>.json serves valid locale packs and rejects traversal or unsupported locales', async () => {
  const server = await startWorkbenchServer(0);
  const { port } = server.address();

  async function httpGetRaw(urlPath) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          path: urlPath,
          method: 'GET',
          headers: { Connection: 'close' },
        },
        (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (c) => { body += c; });
          res.on('end', () => resolve({ status: res.statusCode, body }));
        }
      );
      req.on('error', reject);
      req.end();
    });
  }

  try {
    const okRes = await httpGetRaw('/ext/zh-CN.json');
    assert.equal(okRes.status, 200);
    const parsed = JSON.parse(okRes.body);
    assert.equal(parsed.meta?.locale, 'zh-CN');
    assert.ok(Object.keys(parsed.exact).length > 1000);

    const unsupportedRes = await httpGetRaw('/ext/en.json');
    assert.equal(unsupportedRes.status, 400);

    const traversalRes = await httpGetRaw('/ext/../package.json');
    assert.equal(traversalRes.status, 404);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('all 9 extended packs load cleanly, satisfy placeholder/regex invariants, and fit <= 1.6 MB bundle cap', () => {
  const MAX_BYTES = Math.floor(1.6 * 1024 * 1024); // 1,677,721 bytes
  packsMod.clearExtendedPacks();
  try {
    assert.equal(EXT_PACK_LOCALES.length, 9);
    for (const loc of EXT_PACK_LOCALES) {
      const pack = readExtendedPackFile(loc);
      assert.ok(pack && typeof pack === 'object', `${loc} extended pack must exist on disk`);

      const reg = packsMod.registerExtendedPack(loc, pack);
      assert.equal(reg.ok, true, `${loc} registerExtendedPack failed`);
      assert.ok(reg.exactCount > 3000, `${loc} exactCount (${reg.exactCount}) should be > 3000`);

      for (const p of pack.patterns || []) {
        const src = String(p.source || '');
        const flags = String(p.flags || '');
        assert.doesNotThrow(() => new RegExp(src, flags), `${loc} invalid pattern regex: ${src}`);
        const groups = packsMod.countCapturingGroups(src);
        const re = /\{([1-9][0-9]*)\}/g;
        let m;
        while ((m = re.exec(String(p.replace || ''))) !== null) {
          const idx = Number(m[1]);
          assert.ok(idx <= groups, `${loc} pattern placeholder {${idx}} exceeds groups (${groups}) in ${src}`);
        }
      }

      const expr = buildInjectExpression({ hostI18nLocale: loc }, { extLocale: loc });
      const byteLen = Buffer.byteLength(expr, 'utf8');
      assert.ok(byteLen <= MAX_BYTES, `${loc} bundle (${byteLen} B) exceeds ${MAX_BYTES} B limit`);
    }
  } finally {
    packsMod.clearExtendedPacks();
  }
});
