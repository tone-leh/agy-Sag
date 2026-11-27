import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PROBE_EXPRESSION,
  SagWatchDaemon,
  isPrismDaemonActive,
  parsePrismPidFileContent,
  parseWatchArgs,
} from '../cli/watch-daemon.mjs';

test('parseWatchArgs validates flags and rejects invalid ranges', () => {
  const parsed = parseWatchArgs([
    '--port=9222',
    '--threshold=75',
    '--mode=confirm',
    '--interval=2000',
    '--max-backoff=15000',
    '--once',
    '--json',
  ]);
  assert.deepEqual(parsed, {
    port: 9222,
    threshold: 75,
    mode: 'confirm',
    intervalMs: 2000,
    maxBackoffMs: 15000,
    once: true,
    json: true,
  });

  // maxBackoffMs automatically clamps up to intervalMs
  const clamped = parseWatchArgs(['--interval=5000', '--max-backoff=1000']);
  assert.equal(clamped.maxBackoffMs, 5000);

  assert.throws(() => parseWatchArgs(['--interval=100']));
  assert.throws(() => parseWatchArgs(['--max-backoff=999999']));
  assert.throws(() => parseWatchArgs(['--port=0']));
  assert.throws(() => parseWatchArgs(['--threshold=25']));
  assert.throws(() => parseWatchArgs(['--mode=invalid']));
});

test('SagWatchDaemon: adaptive backoff on missing/unreachable port, auto-attach, reload recovery, host yield & clean stop', async () => {
  let port = null;
  let targets = [];
  let listThrows = false;
  const evalLog = [];
  const events = [];
  let mountedHashes = new Map();
  let yieldedTargets = new Set();

  const daemon = new SagWatchDaemon({
    intervalMs: 1000,
    maxBackoffMs: 4000,
    discoverPort: () => port,
    listTargets: async () => {
      if (listThrows) throw new Error('ECONNREFUSED');
      return targets;
    },
    buildInject: () => ({ codeHash: 'hash-v030', expression: 'INJECT_BUNDLE' }),
    evalTarget: async (wsUrl, expr) => {
      evalLog.push({ wsUrl, kind: expr === PROBE_EXPRESSION ? 'probe' : 'inject' });
      if (expr === PROBE_EXPRESSION) {
        if (yieldedTargets.has(wsUrl)) return { state: 'yielded', owner: 'obsidian-prism' };
        const h = mountedHashes.get(wsUrl);
        return h ? { state: 'mounted', codeHash: h } : { state: 'missing' };
      }
      if (yieldedTargets.has(wsUrl)) return { ok: true, yielded: true, codeHash: 'hash-v030' };
      mountedHashes.set(wsUrl, 'hash-v030');
      return { ok: true, yielded: false, codeHash: 'hash-v030' };
    },
    onEvent: (ev) => events.push(ev),
  });

  // 1) No CDP port open -> waits & backs off up to maxBackoffMs
  const c1 = await daemon.reconcileOnce();
  assert.equal(c1.status, 'no-port');
  assert.equal(c1.nextDelayMs, 1000);
  const c2 = await daemon.reconcileOnce();
  assert.equal(c2.nextDelayMs, 2000);
  const c3 = await daemon.reconcileOnce();
  assert.equal(c3.nextDelayMs, 4000);
  const c4 = await daemon.reconcileOnce();
  assert.equal(c4.nextDelayMs, 4000, 'Backoff must cap at maxBackoffMs');

  // 2) Stale port throws -> unreachable
  port = 9229;
  listThrows = true;
  const c5 = await daemon.reconcileOnce();
  assert.equal(c5.status, 'unreachable');
  assert.equal(c5.errors, 1);

  // 3) Host window appears (plus non-host DevTools page which must be skipped)
  listThrows = false;
  targets = [
    { id: 't-host-1', type: 'page', title: 'Antigravity', url: 'app://antigravity/index.html', webSocketDebuggerUrl: 'ws://127.0.0.1/t1' },
    { id: 't-devtools', type: 'page', title: 'DevTools', url: 'devtools://devtools/bundled/inspector.html', webSocketDebuggerUrl: 'ws://127.0.0.1/dt' },
    { id: 't-ext', type: 'page', title: 'Web', url: 'https://example.com', webSocketDebuggerUrl: 'ws://127.0.0.1/ext' },
  ];
  const c6 = await daemon.reconcileOnce();
  assert.equal(c6.status, 'ok');
  assert.equal(c6.hostPages, 1);
  assert.equal(c6.attached, 1);
  assert.equal(c6.nextDelayMs, 1000, 'Activity resets backoff to base interval');
  assert.deepEqual(evalLog.slice(-1), [{ wsUrl: 'ws://127.0.0.1/t1', kind: 'inject' }]);

  // 4) Steady-state cycle -> lightweight probe only (zero redundant full inject!), smoothly backs off
  const c7 = await daemon.reconcileOnce();
  assert.equal(c7.attached, 0);
  assert.equal(c7.reused, 1);
  assert.equal(c7.nextDelayMs, 1500);
  assert.deepEqual(evalLog.slice(-1), [{ wsUrl: 'ws://127.0.0.1/t1', kind: 'probe' }]);

  // 5) Simulated Cmd+R reload wipes window.__agSessionGuard -> probe detects missing -> auto re-injects!
  mountedHashes.delete('ws://127.0.0.1/t1');
  const c8 = await daemon.reconcileOnce();
  assert.equal(c8.attached, 1);
  assert.equal(c8.nextDelayMs, 1000, 'Reload recovery resets backoff to base interval');
  assert.deepEqual(
    evalLog.slice(-2),
    [
      { wsUrl: 'ws://127.0.0.1/t1', kind: 'probe' },
      { wsUrl: 'ws://127.0.0.1/t1', kind: 'inject' },
    ]
  );

  // 6) Second window owned by Obsidian Prism -> yields and stays yielded on probe without re-injecting
  yieldedTargets.add('ws://127.0.0.1/t2');
  targets = [
    ...targets,
    { id: 't-host-2', type: 'page', title: 'Antigravity #2', url: 'vscode-file://vscode-app/index.html', webSocketDebuggerUrl: 'ws://127.0.0.1/t2' },
  ];
  const c9 = await daemon.reconcileOnce();
  assert.equal(c9.yielded, 1);
  assert.equal(c9.reused, 1);
  const injectCountBefore = evalLog.filter((e) => e.wsUrl === 'ws://127.0.0.1/t2' && e.kind === 'inject').length;
  const c10 = await daemon.reconcileOnce();
  assert.equal(c10.yielded, 1);
  const injectCountAfter = evalLog.filter((e) => e.wsUrl === 'ws://127.0.0.1/t2' && e.kind === 'inject').length;
  assert.equal(injectCountAfter, injectCountBefore, 'Yielded window must not be repeatedly re-injected');

  // 7) Close window t-host-2 -> pruned cleanly
  targets = [targets[0]];
  const c11 = await daemon.reconcileOnce();
  assert.equal(c11.hostPages, 1);
  assert.equal(daemon.getState().trackedTargets.length, 1);
  assert.ok(events.some((e) => e.event === 'target-closed' && e.targetId === 't-host-2'));

  daemon.stop();
  assert.equal(daemon.getState().running, false);
});

test('isPrismDaemonActive: supports plain numeric and JSON .daemon.pid formats, rejects symlinks & stale PIDs', () => {
  assert.equal(parsePrismPidFileContent('37018\n'), 37018);
  assert.equal(parsePrismPidFileContent('{"pid":37018,"token":"37018-abc","startedAt":1795707376929}'), 37018);
  assert.equal(parsePrismPidFileContent('{"pid":-1}'), null);
  assert.equal(parsePrismPidFileContent('not-json'), null);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-sag-pid-'));
  try {
    const prismDir = path.join(tmp, '.gemini', 'config', 'plugins', 'obsidian-prism');
    fs.mkdirSync(prismDir, { recursive: true });
    const pidFile = path.join(prismDir, '.daemon.pid');

    // 1) JSON format with alive PID
    fs.writeFileSync(pidFile, JSON.stringify({ pid: process.pid, token: 'tok', startedAt: Date.now() }));
    assert.equal(isPrismDaemonActive(tmp), true);

    // 2) JSON format with EPERM -> still treated as active
    assert.equal(
      isPrismDaemonActive(tmp, () => {
        const err = new Error('EPERM');
        err.code = 'EPERM';
        throw err;
      }),
      true
    );

    // 3) Dead PID (ESRCH) -> false
    assert.equal(
      isPrismDaemonActive(tmp, () => {
        const err = new Error('ESRCH');
        err.code = 'ESRCH';
        throw err;
      }),
      false
    );

    // 4) Plain numeric format
    fs.writeFileSync(pidFile, `${process.pid}\n`);
    assert.equal(isPrismDaemonActive(tmp), true);

    // 5) Symlink guard -> false
    const realTarget = path.join(tmp, 'real.pid');
    fs.writeFileSync(realTarget, `${process.pid}`);
    fs.rmSync(pidFile);
    fs.symlinkSync(realTarget, pidFile);
    assert.equal(isPrismDaemonActive(tmp), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
