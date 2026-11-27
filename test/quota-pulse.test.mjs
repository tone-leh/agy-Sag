import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const quotaPulse = require('../packages/core/quota-pulse.js');

function createMockStorage() {
  const map = new Map();
  return {
    get length() {
      return map.size;
    },
    getItem: (k) => (map.has(String(k)) ? map.get(String(k)) : null),
    setItem: (k, v) => map.set(String(k), String(v)),
    removeItem: (k) => map.delete(String(k)),
    clear: () => map.clear(),
    _raw: map,
  };
}

function createMockNode({
  role = null,
  testid = null,
  text = '',
  owned = false,
  hidden = false,
  ariaHidden = null,
  style = null,
  parent = null,
} = {}) {
  const attrs = new Map();
  if (role) attrs.set('role', role);
  if (testid) attrs.set('data-testid', testid);
  if (owned) attrs.set('data-ag-sag-owned', '1');
  if (ariaHidden !== null) attrs.set('aria-hidden', String(ariaHidden));
  return {
    textContent: text,
    hidden,
    style: style || {},
    parentElement: parent,
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    hasAttribute: (k) => attrs.has(k),
  };
}

test('QuotaPulse: exposes expected exports, mounts root.__agSagQuotaPulse, and contains zero network/credential calls', () => {
  assert.equal(quotaPulse.STORAGE_KEY, 'agSag.quotaPulse.v1');
  assert.equal(typeof quotaPulse.parseQuotaSignalsFromText, 'function');
  assert.equal(typeof quotaPulse.createQuotaPulseController, 'function');

  const src = fs.readFileSync(new URL('../packages/core/quota-pulse.js', import.meta.url), 'utf8');
  assert.equal(/\bfetch\s*\(/.test(src), false, 'quota-pulse must never call fetch()');
  assert.equal(/\bXMLHttpRequest\b/.test(src), false, 'quota-pulse must never use XMLHttpRequest');
  assert.equal(/\bWebSocket\b/.test(src), false, 'quota-pulse must never open WebSockets');
  assert.equal(/\bsendBeacon\b/.test(src), false, 'quota-pulse must never call sendBeacon');
  assert.equal(/\bdocument\.cookie\b/.test(src), false, 'quota-pulse must never read cookies');

  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(src, sandbox);
  assert.equal(sandbox.__agSagQuotaPulse?.STORAGE_KEY, 'agSag.quotaPulse.v1');
});

test('QuotaPulse: parseQuotaSignalsFromText accurately parses reset countdowns, 429/limit errors, and quota percentages', () => {
  const r1 = quotaPulse.parseQuotaSignalsFromText('Resets in 2h 15m');
  assert.equal(r1.matched, true);
  assert.equal(r1.resetSeconds, 2 * 3600 + 15 * 60);
  assert.equal(r1.rateLimited, false);

  const r2 = quotaPulse.parseQuotaSignalsFromText('Please wait. Resets in 45m');
  assert.equal(r2.matched, true);
  assert.equal(r2.resetSeconds, 45 * 60);

  const r3 = quotaPulse.parseQuotaSignalsFromText('Weekly limit reached. Resets in 3d 4h');
  assert.equal(r3.matched, true);
  assert.equal(r3.rateLimited, true);
  assert.equal(r3.bucket, 'weekly');
  assert.equal(r3.resetSeconds, 3 * 86400 + 4 * 3600);

  const r4 = quotaPulse.parseQuotaSignalsFromText('Error 429: Rate limit exceeded (5h window). Resets in 1h 10m');
  assert.equal(r4.matched, true);
  assert.equal(r4.rateLimited, true);
  assert.equal(r4.bucket, '5h');
  assert.equal(r4.resetSeconds, 70 * 60);

  const r5 = quotaPulse.parseQuotaSignalsFromText('Quota exceeded — please try again later.');
  assert.equal(r5.matched, true);
  assert.equal(r5.rateLimited, true);
  assert.equal(r5.bucket, 'unknown');

  const r6 = quotaPulse.parseQuotaSignalsFromText('Usage limit reached for your plan');
  assert.equal(r6.matched, true);
  assert.equal(r6.rateLimited, true);

  const p1 = quotaPulse.parseQuotaSignalsFromText('Weekly quota: 78%');
  assert.equal(p1.matched, true);
  assert.equal(p1.rateLimited, false);
  assert.equal(p1.bucket, 'weekly');
  assert.equal(p1.observedPct, 78);

  const p2 = quotaPulse.parseQuotaSignalsFromText('5h quota 62%');
  assert.equal(p2.matched, true);
  assert.equal(p2.rateLimited, false);
  assert.equal(p2.bucket, '5h');
  assert.equal(p2.observedPct, 62);

  // Non-quota percentages must not trigger false positives
  const noise1 = quotaPulse.parseQuotaSignalsFromText('Context usage: 82% (164k / 200k)');
  assert.equal(noise1.matched, false);
  assert.equal(noise1.observedPct, null);

  const noise2 = quotaPulse.parseQuotaSignalsFromText('Build completed 95% faster');
  assert.equal(noise2.matched, false);
  assert.equal(noise2.rateLimited, false);
});

test('QuotaPulse: enforces default-off gating, 5h/7d sliding window pruning, persistence and health transitions', () => {
  const storage = createMockStorage();
  let fakeNow = Date.UTC(2026, 4, 10, 12, 0, 0);

  const ctl = quotaPulse.createQuotaPulseController({
    storage,
    softTurns5h: 10,
    softTurns7d: 20,
    now: () => fakeNow,
    win: {
      fetch() {
        throw new Error('fetch must never be invoked');
      },
    },
  });

  // Disabled by default: recordTurn and scanDomForSignals do nothing & never touch storage
  assert.equal(ctl.getDebugState().enabled, false);
  assert.equal(ctl.recordTurn({ deltaTokens: 1200, cascadeId: 'c1', modelHint: 'sonnet' }), null);
  assert.equal(storage.getItem(quotaPulse.STORAGE_KEY), null);

  // Enable and record 6 turns (6/10 = 0.6 -> warm / enable-compact)
  ctl.setEnabled(true);
  for (let i = 0; i < 6; i++) {
    ctl.recordTurn({ deltaTokens: 1000, cascadeId: 'c1', modelHint: 'sonnet' });
  }

  let summary = ctl.getSummary();
  assert.equal(summary.observed.source, 'none');
  assert.equal(summary.localEstimate.source, 'local-estimate');
  assert.equal(summary.localEstimate.turns5h, 6);
  assert.equal(summary.localEstimate.tokens5h, 6000);
  assert.equal(summary.localEstimate.turns7d, 6);
  assert.equal(summary.localEstimate.warn5hRatio, 0.6);
  assert.equal(summary.health, 'warm');
  assert.equal(summary.adviceKey, 'enable-compact');

  // Record 3 more turns -> 9/10 = 0.9 -> warn / switch-light-model
  for (let i = 0; i < 3; i++) {
    ctl.recordTurn({ deltaTokens: 500 });
  }
  summary = ctl.getSummary();
  assert.equal(summary.localEstimate.turns5h, 9);
  assert.equal(summary.localEstimate.tokens5h, 7500);
  assert.equal(summary.health, 'warn');
  assert.equal(summary.adviceKey, 'switch-light-model');

  // Advance 5h + 1 minute: old 9 turns fall out of 5h window, remain in 7d window
  fakeNow += 5 * 60 * 60 * 1000 + 60 * 1000;
  ctl.recordTurn({ deltaTokens: 2000 });
  summary = ctl.getSummary();
  assert.equal(summary.localEstimate.turns5h, 1);
  assert.equal(summary.localEstimate.tokens5h, 2000);
  assert.equal(summary.localEstimate.turns7d, 10);
  assert.equal(summary.localEstimate.tokens7d, 9500);
  assert.equal(summary.localEstimate.warn7dRatio, 0.5);
  assert.equal(summary.health, 'ok');
  assert.equal(summary.adviceKey, 'none');

  // Persistence check: new controller reloads ledger from localStorage
  const ctl2 = quotaPulse.createQuotaPulseController({
    enabled: true,
    storage,
    softTurns5h: 10,
    softTurns7d: 20,
    now: () => fakeNow,
  });
  const reloaded = ctl2.getSummary();
  assert.equal(reloaded.localEstimate.turns5h, 1);
  assert.equal(reloaded.localEstimate.turns7d, 10);

  // Advance past 7d from first batch (still < 7d from the latest 1 turn)
  fakeNow += 7 * 24 * 60 * 60 * 1000 - 3 * 60 * 60 * 1000;
  const afterPrune = ctl2.getSummary();
  assert.equal(afterPrune.localEstimate.turns5h, 0);
  assert.equal(afterPrune.localEstimate.turns7d, 1);
  assert.equal(afterPrune.localEstimate.tokens7d, 2000);

  // updateLimits & resetLedger
  const lim = ctl2.updateLimits({ softTurns5h: 100, softTurns7d: 500 });
  assert.deepEqual(lim, { softTurns5h: 100, softTurns7d: 500 });

  ctl2.resetLedger();
  assert.equal(storage.getItem(quotaPulse.STORAGE_KEY), null);
  assert.equal(ctl2.getSummary().localEstimate.turns7d, 0);

  ctl.destroy();
  ctl2.destroy();
});

test('QuotaPulse: scanDomForSignals ignores owned nodes, observes host alerts, expires after resetAt, and destroys cleanly', () => {
  const storage = createMockStorage();
  let fakeNow = Date.UTC(2026, 4, 11, 8, 0, 0);

  const ownedNode = createMockNode({
    role: 'alert',
    text: '429 Rate limit exceeded. Resets in 3d 4h',
    owned: true,
  });
  const hostPctNode = createMockNode({
    role: 'status',
    text: 'Weekly quota: 78%',
  });
  let domNodes = [ownedNode, hostPctNode];

  const doc = {
    querySelectorAll: () => domNodes,
  };

  const ctl = quotaPulse.createQuotaPulseController({
    enabled: true,
    storage,
    doc,
    now: () => fakeNow,
  });

  // First scan picks hostPctNode (ignores ownedNode)
  const scan1 = ctl.scanDomForSignals();
  assert.equal(scan1.scanned, true);
  assert.equal(scan1.matched, true);
  assert.equal(scan1.signal.observedPct, 78);
  assert.equal(scan1.signal.rateLimited, false);

  let summary = ctl.getSummary();
  assert.equal(summary.observed.source, 'observed-ui');
  assert.equal(summary.observed.bucket, 'weekly');
  assert.equal(summary.observed.observedPct, 78);
  assert.equal(summary.observed.rateLimited, false);
  assert.equal(summary.health, 'warm');
  assert.equal(summary.adviceKey, 'enable-compact');

  // Now host displays a 429 rate-limit toast with reset countdown
  const hostLimitToast = createMockNode({
    testid: 'quota-toast',
    text: '429 Rate limit exceeded (5h). Resets in 45m',
  });
  domNodes = [ownedNode, hostPctNode, hostLimitToast];

  const scan2 = ctl.scanDomForSignals();
  assert.equal(scan2.matched, true);
  assert.equal(scan2.signal.rateLimited, true);
  assert.equal(scan2.signal.resetSeconds, 2700);

  summary = ctl.getSummary();
  assert.equal(summary.observed.source, 'observed-ui');
  assert.equal(summary.observed.rateLimited, true);
  assert.equal(summary.observed.bucket, '5h');
  assert.equal(summary.observed.remainingSec, 2700);
  assert.equal(summary.observed.resetAt, fakeNow + 2700 * 1000);
  assert.equal(summary.health, 'limited');
  assert.equal(summary.adviceKey, 'wait-reset');

  // After countdown elapses, rateLimited automatically clears
  fakeNow += 2701 * 1000;
  summary = ctl.getSummary();
  assert.equal(summary.observed.rateLimited, false);
  assert.equal(summary.observed.source, 'none');
  assert.equal(summary.health, 'ok');
  assert.equal(summary.adviceKey, 'none');

  ctl.destroy();
  assert.equal(ctl.getDebugState().destroyed, true);
  assert.equal(ctl.getDebugState().enabled, false);
  assert.equal(ctl.setEnabled(true), false);
  assert.equal(ctl.recordTurn({ deltaTokens: 100 }), null);
  assert.equal(ctl.scanDomForSignals().scanned, false);
});

test('QuotaPulse: gracefully recovers from corrupt localStorage JSON and invalid deltaTokens', () => {
  const storage = createMockStorage();
  storage.setItem(quotaPulse.STORAGE_KEY, '{corrupt-json');

  const ctl = quotaPulse.createQuotaPulseController({
    enabled: true,
    storage,
    now: () => Date.UTC(2026, 4, 12, 9, 0, 0),
  });

  const s0 = ctl.getSummary();
  assert.equal(s0.localEstimate.turns5h, 0);
  assert.equal(s0.observed.source, 'none');

  ctl.recordTurn({ deltaTokens: -500 });
  ctl.recordTurn({ deltaTokens: Number.NaN });
  const s1 = ctl.getSummary();
  assert.equal(s1.localEstimate.turns5h, 2);
  assert.equal(s1.localEstimate.tokens5h, 0);
  ctl.destroy();
});

test('QuotaPulse: preserves null resetAt across reload (no Number(null) === 0 rate-limit loss)', () => {
  const storage = createMockStorage();
  let fakeNow = Date.UTC(2026, 4, 15, 10, 0, 0);

  const alertNode = createMockNode({
    role: 'alert',
    text: 'Quota exceeded — please try again later.',
  });
  const doc = { querySelectorAll: () => [alertNode] };

  const ctl1 = quotaPulse.createQuotaPulseController({
    enabled: true,
    storage,
    doc,
    now: () => fakeNow,
  });

  const scan = ctl1.scanDomForSignals();
  assert.equal(scan.matched, true);
  assert.equal(scan.signal.rateLimited, true);
  assert.equal(scan.signal.resetSeconds, null);
  assert.equal(ctl1.getDebugState().observed.resetAt, null);
  assert.equal(ctl1.getSummary().health, 'limited');

  // Advance 2 minutes (still well within 15m no-reset TTL) and reload into a fresh controller
  fakeNow += 2 * 60 * 1000;
  const ctl2 = quotaPulse.createQuotaPulseController({
    enabled: true,
    storage,
    now: () => fakeNow,
  });

  assert.equal(ctl2.getDebugState().observed.resetAt, null);
  assert.equal(ctl2.getDebugState().observed.observedAt, Date.UTC(2026, 4, 15, 10, 0, 0));
  const summary2 = ctl2.getSummary();
  assert.equal(summary2.observed.rateLimited, true);
  assert.equal(summary2.observed.resetAt, null);
  assert.equal(summary2.health, 'limited');
  assert.equal(summary2.adviceKey, 'wait-reset');

  // Empty string resetAt/observedAt in storage also stays null instead of becoming 0
  storage.setItem(
    quotaPulse.STORAGE_KEY,
    JSON.stringify({
      v: 1,
      entries: [],
      observed: {
        rateLimited: true,
        bucket: '5h',
        resetAt: '',
        observedPct: '',
        observedAt: fakeNow,
        snippet: 'Quota exceeded',
      },
    })
  );
  const ctl3 = quotaPulse.createQuotaPulseController({
    enabled: true,
    storage,
    now: () => fakeNow,
  });
  assert.equal(ctl3.getDebugState().observed.resetAt, null);
  assert.equal(ctl3.getDebugState().observed.observedPct, null);
  assert.equal(ctl3.getSummary().observed.rateLimited, true);

  ctl1.destroy();
  ctl2.destroy();
  ctl3.destroy();
});

test('QuotaPulse: tightens 429 detection to error/rate-limit contexts and eliminates false positives', () => {
  const fp1 = quotaPulse.parseQuotaSignalsFromText('Synced 429 files');
  assert.equal(fp1.rateLimited, false);
  assert.equal(fp1.matched, false);

  const fp2 = quotaPulse.parseQuotaSignalsFromText('Indexed 429 documents in workspace');
  assert.equal(fp2.rateLimited, false);
  assert.equal(fp2.matched, false);

  const tp1 = quotaPulse.parseQuotaSignalsFromText('HTTP 429');
  assert.equal(tp1.rateLimited, true);
  assert.equal(tp1.matched, true);

  const tp2 = quotaPulse.parseQuotaSignalsFromText('Request failed with status code 429');
  assert.equal(tp2.rateLimited, true);

  const tp3 = quotaPulse.parseQuotaSignalsFromText('429 Too Many Requests');
  assert.equal(tp3.rateLimited, true);

  const tp4 = quotaPulse.parseQuotaSignalsFromText('429 rate limit exceeded');
  assert.equal(tp4.rateLimited, true);
});

test('QuotaPulse: scanDomForSignals skips nodes hidden via self or any ancestor (hidden/aria-hidden/display/visibility)', () => {
  const storage = createMockStorage();
  const fakeNow = Date.UTC(2026, 4, 15, 11, 0, 0);

  const hiddenAncestor = createMockNode({ hidden: true });
  const childUnderHidden = createMockNode({
    role: 'alert',
    text: 'HTTP 429 rate limit exceeded',
    parent: hiddenAncestor,
  });

  const ariaHiddenGrandParent = createMockNode({ ariaHidden: 'true' });
  const middleWrapper = createMockNode({ parent: ariaHiddenGrandParent });
  const childUnderAriaHidden = createMockNode({
    role: 'alert',
    text: 'Quota exceeded — please try again later.',
    parent: middleWrapper,
  });

  const displayNoneAncestor = createMockNode({ style: { display: 'none' } });
  const childUnderDisplayNone = createMockNode({
    role: 'status',
    text: 'Weekly quota: 95%',
    parent: displayNoneAncestor,
  });

  const visibilityHiddenAncestor = createMockNode({ style: { visibility: 'hidden' } });
  const childUnderVisHidden = createMockNode({
    role: 'alert',
    text: 'Error 429: Too Many Requests',
    parent: visibilityHiddenAncestor,
  });

  const selfStyleHidden = createMockNode({
    role: 'alert',
    text: 'Error 429: Rate limit exceeded',
    style: { display: 'none' },
  });

  let domNodes = [
    childUnderHidden,
    childUnderAriaHidden,
    childUnderDisplayNone,
    childUnderVisHidden,
    selfStyleHidden,
  ];
  const doc = { querySelectorAll: () => domNodes };

  const ctl = quotaPulse.createQuotaPulseController({
    enabled: true,
    storage,
    doc,
    now: () => fakeNow,
  });

  const hiddenScan = ctl.scanDomForSignals();
  assert.equal(hiddenScan.scanned, true);
  assert.equal(hiddenScan.matched, false);
  assert.equal(ctl.getSummary().observed.source, 'none');

  // Once a genuinely visible alert exists, scan picks it up
  const visibleParent = createMockNode({ style: { display: 'block', visibility: 'visible' } });
  const visibleAlert = createMockNode({
    role: 'alert',
    text: 'HTTP 429: Rate limit exceeded',
    parent: visibleParent,
  });
  domNodes = [...domNodes, visibleAlert];

  const visibleScan = ctl.scanDomForSignals();
  assert.equal(visibleScan.matched, true);
  assert.equal(visibleScan.signal.rateLimited, true);
  assert.equal(ctl.getSummary().health, 'limited');

  ctl.destroy();
});

test('QuotaPulse: caps 5h raw entries via 60s minute-bucket compaction while preserving exact counts and tokens', () => {
  const storage = createMockStorage();
  const baseNow = Date.UTC(2026, 4, 15, 16, 0, 30); // :30s to test boundary safety
  let fakeNow = baseNow;

  const ctl = quotaPulse.createQuotaPulseController({
    enabled: true,
    storage,
    softTurns5h: 1000,
    softTurns7d: 5000,
    now: () => fakeNow,
  });

  // Record 650 turns spread across the last 5h (starting 4h59m50s ago, right near the 5h cutoff)
  const totalTurns = 650;
  let expectedTokens = 0;
  const startTs = baseNow - quotaPulse.WINDOW_5H_MS + 10_000;
  const spanMs = quotaPulse.WINDOW_5H_MS - 10_000;

  for (let i = 0; i < totalTurns; i += 1) {
    const ts = startTs + Math.floor((spanMs * i) / totalTurns);
    const deltaTokens = 100 + (i % 7) * 25;
    expectedTokens += deltaTokens;
    ctl.recordTurn({ ts, deltaTokens });
  }

  const debugState = ctl.getDebugState();
  assert.ok(
    debugState.entryCount <= quotaPulse.MAX_RAW_ENTRIES,
    `Expected entryCount (${debugState.entryCount}) <= MAX_RAW_ENTRIES (${quotaPulse.MAX_RAW_ENTRIES})`
  );

  const summary = ctl.getSummary();
  assert.equal(summary.localEstimate.turns5h, totalTurns);
  assert.equal(summary.localEstimate.tokens5h, expectedTokens);
  assert.equal(summary.localEstimate.turns7d, totalTurns);
  assert.equal(summary.localEstimate.tokens7d, expectedTokens);

  ctl.destroy();
});
