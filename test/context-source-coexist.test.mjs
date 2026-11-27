import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';

import { buildInjectExpression, REMOVE_EXPRESSION } from '../cli/bundle.mjs';
import { parseCliArgs, isAntigravityHostTarget } from '../cli/cdp-attach.mjs';

const require = createRequire(import.meta.url);
const core = require('../packages/core/index.js');
const ctxSrc = require('../packages/core/context-source.js');
const styles = require('../packages/core/styles.js');

test('context-source: reuses __agPrismMetricsBridge without duplicate polling and exposes compactedAtStepIndices count', async () => {
  const win = {
    location: { pathname: '/c/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' },
    __agPrismMetricsBridge: {
      getMetrics: async () => ({
        connection: 'live',
        compactedAtStepIndices: [14, 38],
        speed: {
          model: 'Gemini 4 Neon',
          context: { usedTokens: 430080, maxTokens: 512000, usedFraction: 0.84 },
        },
      }),
    },
  };
  const snap = await ctxSrc.sampleContextState({ win, doc: null });
  assert.ok(snap);
  assert.equal(snap.source, 'host-bridge');
  assert.equal(snap.usedPct, 84);
  assert.equal(snap.compactedCount, 2);
  assert.equal(snap.cascadeId, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');

  // detectCascadeId must prioritize pathname /c/<UUID> over arbitrary sidebar row data-cascade-id
  const mockDoc = {
    querySelector: (sel) => {
      if (sel === '[data-testid="conversation-view"]') return { getAttribute: () => null, closest: () => null };
      if (sel.includes(':not(')) return null;
      return { getAttribute: () => '99999999-9999-4999-8999-999999999999' };
    },
  };
  assert.equal(ctxSrc.detectCascadeId(mockDoc, win), 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
});

test('coexistence: standalone auto-yields when __agSagOwner or legacy __agSessionGuardOwner is owned by a host integrator (e.g. Obsidian Prism)', () => {
  const win = { __agSessionGuardOwner: 'obsidian-prism' };
  const api = core.mountSag({ win, doc: null, source: 'standalone' });
  assert.equal(api.yielded, true);
  assert.equal(api.owner, 'obsidian-prism');
  assert.equal(win.__agSessionGuard, undefined, 'Yielded standalone must not overwrite host global');
  assert.equal(win.__agSag, undefined, 'Yielded standalone must not overwrite host __agSag global');

  const win2 = { __agSagOwner: 'obsidian-prism' };
  const api2 = core.mountSag({ win: win2, doc: null, source: 'standalone' });
  assert.equal(api2.yielded, true);
  assert.equal(api2.owner, 'obsidian-prism');
});

test('CSS hygiene & bundle builder: zero :has(), zero eval(), idempotent injection, and lossless REMOVE_EXPRESSION', () => {
  assert.equal(styles.CORE_CSS.includes(':has('), false, 'CORE_CSS must contain zero :has() selectors');
  const expr = buildInjectExpression({ compactThreshold: 75 });
  assert.equal(expr.includes('eval('), false, 'Bundle must contain zero eval()');

  const sandbox = {
    window: null,
    globalThis: null,
    document: {
      hidden: false,
      documentElement: { getAttribute: () => 'en' },
      head: { appendChild() {} },
      body: { appendChild() {} },
      createElement: () => ({ setAttribute() {}, addEventListener() {}, appendChild() {}, remove() {} }),
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {},
      removeEventListener() {},
    },
    navigator: { language: 'en' },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };
  sandbox.window = sandbox;
  sandbox.window.self = sandbox.window;
  sandbox.window.top = sandbox.window;
  sandbox.window.addEventListener = () => {};
  sandbox.window.removeEventListener = () => {};
  sandbox.globalThis = sandbox;

  const r1 = vm.runInNewContext(expr, sandbox);
  assert.equal(r1.ok, true);
  assert.equal(r1.reused, undefined);

  const r2 = vm.runInNewContext(expr, sandbox);
  assert.equal(r2.ok, true);
  assert.equal(r2.reused, true, 'Repeated injection with identical codeHash must reuse existing instance');

  const r3 = vm.runInNewContext(REMOVE_EXPRESSION, sandbox);
  assert.equal(r3.ok, true);
  assert.equal(sandbox.__agSag, undefined, 'REMOVE_EXPRESSION must clean __agSag global');
  assert.equal(sandbox.__agSessionGuard, undefined, 'REMOVE_EXPRESSION must clean all globals');
});

test('CLI arg parsing & CDP target allowlist reject unsafe flags and non-host pages', () => {
  const p = parseCliArgs(['--attach', '--port=9222', '--threshold=75', '--mode=auto-countdown', '--dry-run']);
  assert.deepEqual(p, { action: 'attach', port: 9222, threshold: 75, mode: 'auto-countdown', dryRun: true, json: false });
  assert.throws(() => parseCliArgs(['--threshold=10']));
  assert.throws(() => parseCliArgs(['--mode=yolo']));
  assert.throws(() => parseCliArgs(['--port=99999']));

  assert.equal(isAntigravityHostTarget({ type: 'page', url: 'app://antigravity/index.html', title: 'Antigravity', webSocketDebuggerUrl: 'ws://127.0.0.1/1' }), true);
  assert.equal(isAntigravityHostTarget({ type: 'page', url: 'devtools://devtools/bundled/inspector.html', title: 'DevTools', webSocketDebuggerUrl: 'ws://127.0.0.1/2' }), false);
  assert.equal(isAntigravityHostTarget({ type: 'page', url: 'https://example.com', title: 'External', webSocketDebuggerUrl: 'ws://127.0.0.1/3' }), false);
  assert.equal(isAntigravityHostTarget({ type: 'page', url: 'app://antigravity/launchpad.html', title: 'Launchpad', webSocketDebuggerUrl: 'ws://127.0.0.1/4' }), false);
});
