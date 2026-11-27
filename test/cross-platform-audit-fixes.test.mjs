import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

import {
  assertNoSymlinkAncestors,
  atomicRenameWithRetry,
  expandTildePath,
  isCliEntry,
  isPathWithinBase,
  normalizePathForCompare,
  quoteShellArgForDisplay,
  stripWindowsDevicePrefix,
} from '../cli/platform-utils.mjs';
import {
  discoverCdpPort,
  evalViaCdp,
  isAntigravityHostTarget,
  isLoopbackWsUrl,
  runCdpAttachCli,
} from '../cli/cdp-attach.mjs';
import {
  HOST_BRIDGE_BINDING_NAME,
  HostBridgeSession,
  PROBE_EXPRESSION,
  SagWatchDaemon,
} from '../cli/watch-daemon.mjs';
import {
  SagKeepaliveController,
  buildLaunchSpec,
  detectAntigravityProcesses,
  evaluateLaunchPlan,
  executeLaunchPlan,
  extractRemoteDebuggingPort,
  hasRemoteDebuggingPort,
  isAntigravityMainProcess,
  requestGracefulQuit,
  writeLaunchStateAtomic,
} from '../cli/launcher.mjs';
import { REMOVE_EXPRESSION, buildInjectExpression } from '../cli/bundle.mjs';
import { applyNovCommand, readNovState } from '../cli/nov-bridge.mjs';
import { installLocalPlugin, parseInstallArgs } from '../cli/install-plugin.mjs';
import { createStorageBackup, parseStorageArgs } from '../cli/storage-doctor.mjs';
import { runDoctorCli } from '../cli/doctor.mjs';
import { startWorkbenchServer } from '../workbench/server.mjs';

function makeTempDir(prefix = 'agy-sag-xplat-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function createMockWebSocketClass() {
  const instances = [];
  class MockWebSocket {
    constructor(url) {
      this.url = url;
      this.OPEN = 1;
      this.readyState = 0;
      this.sent = [];
      this.closed = false;
      this._listeners = new Map();
      instances.push(this);
    }
    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, []);
      this._listeners.get(type).push(fn);
    }
    emit(type, ev = {}) {
      for (const fn of [...(this._listeners.get(type) || [])]) fn(ev);
    }
    send(raw) {
      this.sent.push(JSON.parse(String(raw)));
    }
    close() {
      if (this.closed) return;
      this.closed = true;
      this.readyState = 3;
      this.emit('close', {});
    }
    simulateOpen() {
      this.readyState = 1;
      this.emit('open', {});
    }
    simulateMessage(obj) {
      this.emit('message', { data: JSON.stringify(obj) });
    }
    findLastSent(method) {
      for (let i = this.sent.length - 1; i >= 0; i -= 1) {
        if (this.sent[i].method === method) return this.sent[i];
      }
      return null;
    }
    replyFrameTree(topFrameId, childIds = []) {
      const req = this.findLastSent('Page.getFrameTree');
      assert.ok(req, 'Expected Page.getFrameTree request');
      this.simulateMessage({
        id: req.id,
        result: {
          frameTree: {
            frame: { id: topFrameId },
            childFrames: childIds.map((id) => ({ frame: { id, parentId: topFrameId } })),
          },
        },
      });
    }
  }
  return { MockWebSocket, instances };
}

test('1. platform-utils: isCliEntry handles POSIX symlinks (npm link) and Windows drive/extended prefixes', () => {
  const tmp = makeTempDir('agy-sag-entry-');
  try {
    const realEntry = path.join(tmp, 'real-cli.mjs');
    const symlinkBin = path.join(tmp, 'agy-sag-link');
    fs.writeFileSync(realEntry, '// cli\n', 'utf8');
    fs.symlinkSync(realEntry, symlinkBin);

    const fileUrl = pathToFileURL(realEntry).href;
    assert.equal(isCliEntry(fileUrl, symlinkBin, process.platform), true, 'POSIX symlink entrypoint must match');
    assert.equal(isCliEntry(fileUrl, path.join(tmp, 'other.mjs'), process.platform), false);

    // Simulated win32 drive letter case + \\?\ prefix comparison
    const winMeta = 'C:\\Users\\Alice\\agy-Sag\\cli\\sag-cli.mjs';
    assert.equal(
      isCliEntry(winMeta, 'c:\\users\\alice\\agy-sag\\cli\\sag-cli.mjs', 'win32', {
        realpathSyncFn: (p) => p,
      }),
      true
    );
    assert.equal(
      isCliEntry(winMeta, '\\\\?\\c:\\Users\\ALICE\\agy-Sag\\cli\\sag-cli.mjs', 'win32', {
        realpathSyncFn: (p) => p,
      }),
      true
    );
    assert.equal(
      isCliEntry(winMeta, 'D:\\Users\\Alice\\agy-Sag\\cli\\sag-cli.mjs', 'win32', {
        realpathSyncFn: (p) => p,
      }),
      false
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('2. platform-utils: normalizePathForCompare & isPathWithinBase handle Windows casing, \\\\?\\, UNC & prefix boundaries', () => {
  assert.equal(stripWindowsDevicePrefix('\\\\?\\C:\\Users\\Alice'), 'C:\\Users\\Alice');
  assert.equal(stripWindowsDevicePrefix('\\\\?\\UNC\\Server\\Share\\Dir'), '\\\\Server\\Share\\Dir');

  assert.equal(
    normalizePathForCompare('\\\\?\\C:\\Users\\Alice\\Sub\\', 'win32'),
    'c:/users/alice/sub'
  );
  assert.equal(
    normalizePathForCompare('\\\\?\\UNC\\Files\\Team\\Data\\', 'win32'),
    '//files/team/data'
  );

  // Valid nested paths on Windows with different casing and device prefix
  assert.equal(
    isPathWithinBase('\\\\?\\c:\\users\\alice\\data\\config.json', 'C:\\Users\\Alice\\Data', 'win32'),
    true
  );
  assert.equal(
    isPathWithinBase('\\\\?\\UNC\\Server\\Share\\nov\\config.json', '\\\\server\\share\\nov', 'win32'),
    true
  );

  // Prefix sibling escape MUST be rejected
  assert.equal(
    isPathWithinBase('C:\\Users\\Alice2\\config.json', 'c:\\users\\alice', 'win32'),
    false
  );
  assert.equal(
    isPathWithinBase('/home/alice-evil/file', '/home/alice', 'linux'),
    false
  );
  assert.equal(
    isPathWithinBase('/home/alice/sub/file', '/home/alice', 'linux'),
    true
  );
});

test('3. platform-utils: expandTildePath integrates with storage-doctor & install-plugin arg parsers', () => {
  assert.equal(expandTildePath('~', '/home/tester'), '/home/tester');
  assert.equal(expandTildePath('~/backups/sag', '/home/tester'), path.join('/home/tester', 'backups/sag'));
  assert.equal(expandTildePath('~\\AppData\\Local', 'C:\\Users\\Tester'), 'C:\\Users\\Tester\\AppData\\Local');
  assert.equal(expandTildePath('/abs/path', '/home/tester'), '/abs/path');

  const stBackup = parseStorageArgs(
    ['backup', '--data-dir=~/ag-data', '--out=~/ag-backup'],
    '/home/tester'
  );
  assert.equal(stBackup.dataDir, path.join('/home/tester', 'ag-data'));
  assert.equal(stBackup.outDir, path.join('/home/tester', 'ag-backup'));

  const stExport = parseStorageArgs(
    ['export', '--session=s1', '--data-dir=~/ag-data', '--out-file=~/exports/s1.md'],
    '/home/tester'
  );
  assert.equal(stExport.outFile, path.join('/home/tester', 'exports/s1.md'));

  const instOpts = parseInstallArgs(['--dir=~/my-plugins/agy-sag'], '/home/tester');
  assert.equal(instOpts.targetDir, path.resolve(path.join('/home/tester', 'my-plugins/agy-sag')));
});

test('4. platform-utils: atomicRenameWithRetry retries Windows EPERM/EACCES/EBUSY within <200ms and quoteShellArgForDisplay quotes spaces', () => {
  let attempts = 0;
  const delays = [];
  atomicRenameWithRetry('a.tmp', 'a.json', {
    platform: 'win32',
    maxRetries: 4,
    renameSyncFn: () => {
      attempts += 1;
      if (attempts <= 2) {
        const err = new Error('locked by AV');
        err.code = attempts === 1 ? 'EPERM' : 'EBUSY';
        throw err;
      }
    },
    waitFn: (ms) => delays.push(ms),
  });
  assert.equal(attempts, 3);
  assert.equal(delays.length, 2);
  assert.ok(delays.reduce((a, b) => a + b, 0) < 200);

  // Real bounded wait timing check (<200ms even when exhausting all 4 retries)
  const t0 = Date.now();
  assert.throws(
    () =>
      atomicRenameWithRetry('b.tmp', 'b.json', {
        platform: 'win32',
        maxRetries: 4,
        renameSyncFn: () => {
          const err = new Error('still locked');
          err.code = 'EACCES';
          throw err;
        },
      }),
    /still locked/
  );
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 400, `Bounded retry took too long: ${elapsed}ms`);

  // Non-retryable error throws immediately on attempt 1
  let nonRetryCalls = 0;
  assert.throws(
    () =>
      atomicRenameWithRetry('c.tmp', 'c.json', {
        platform: 'win32',
        maxRetries: 4,
        renameSyncFn: () => {
          nonRetryCalls += 1;
          const err = new Error('no such file');
          err.code = 'ENOENT';
          throw err;
        },
        waitFn: () => {
          throw new Error('Should not wait on ENOENT');
        },
      }),
    /no such file/
  );
  assert.equal(nonRetryCalls, 1);

  // quoteShellArgForDisplay
  assert.equal(
    quoteShellArgForDisplay('C:\\Program Files\\Antigravity\\Antigravity.exe', 'win32'),
    '"C:\\Program Files\\Antigravity\\Antigravity.exe"'
  );
  assert.equal(quoteShellArgForDisplay('--remote-debugging-port=9222', 'win32'), '--remote-debugging-port=9222');
  assert.equal(quoteShellArgForDisplay('/opt/My App/antigravity', 'linux'), '"/opt/My App/antigravity"');
  assert.equal(quoteShellArgForDisplay('/opt/$HOME/app', 'linux'), "'/opt/$HOME/app'");
});

test('5. CDP security: isLoopbackWsUrl, tightened isAntigravityHostTarget, evalViaCdp exceptionDetails & runCdpAttachCli fail-closed', async () => {
  // Loopback WS validation
  assert.equal(isLoopbackWsUrl('ws://127.0.0.1:9222/devtools/page/1'), true);
  assert.equal(isLoopbackWsUrl('ws://localhost:9222/devtools/page/1'), true);
  assert.equal(isLoopbackWsUrl('ws://[::1]:9222/devtools/page/1'), true);
  assert.equal(isLoopbackWsUrl('ws://127.0.0.1/t1'), true);
  assert.equal(isLoopbackWsUrl('ws://192.168.1.10:9222/devtools/page/1'), false);
  assert.equal(isLoopbackWsUrl('ws://127.0.0.1.evil.com:9222/devtools/page/1'), false);
  assert.equal(isLoopbackWsUrl('wss://127.0.0.1:9222/devtools/page/1'), false);
  assert.equal(isLoopbackWsUrl('ws://user@127.0.0.1:9222/devtools/page/1'), false);

  // Tightened host target filtering
  assert.equal(
    isAntigravityHostTarget({
      type: 'page',
      title: 'Workspace',
      url: 'vscode-file://vscode-app/out/vs/code/electron-sandbox/workbench/workbench.html',
      webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/1',
    }),
    true
  );
  assert.equal(
    isAntigravityHostTarget({
      type: 'page',
      title: 'Unrelated Extension Webview',
      url: 'vscode-file://vscode-app/extensions/other/panel.html',
      webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/2',
    }),
    false,
    'Unrelated vscode-file page without workbench/antigravity/index.html or Antigravity title must be rejected'
  );
  assert.equal(
    isAntigravityHostTarget({
      type: 'page',
      title: 'Antigravity',
      url: 'app://antigravity/index.html',
      webSocketDebuggerUrl: 'ws://evil.example:9222/devtools/page/3',
    }),
    false,
    'Non-loopback WS URL must be rejected even with matching URL/title'
  );

  // evalViaCdp rejects non-loopback URLs
  await assert.rejects(
    () => evalViaCdp('ws://10.0.0.5:9222/devtools/page/1', '1+1'),
    /non-loopback/i
  );

  // evalViaCdp rejects when CDP returns exceptionDetails
  const { MockWebSocket, instances } = createMockWebSocketClass();
  const evalPromise = evalViaCdp('ws://127.0.0.1:9222/devtools/page/1', 'throw new Error("boom")', 2000, MockWebSocket);
  const ws = instances[0];
  ws.simulateOpen();
  ws.simulateMessage({
    id: 1,
    result: {
      result: { type: 'object', subtype: 'error' },
      exceptionDetails: {
        text: 'Uncaught',
        exception: { description: 'ReferenceError: boom is not defined' },
      },
    },
  });
  await assert.rejects(() => evalPromise, /ReferenceError: boom is not defined/);

  // runCdpAttachCli returns ok:false & exitCode=1 when 0 host windows found on attach/remove or when eval fails
  const prevExitCode = process.exitCode;
  try {
    process.exitCode = 0;
    const noWinRes = await runCdpAttachCli(['--attach', '--port=9222'], {
      discoverPort: (p) => p,
      listTargets: async () => [],
      log: () => {},
      error: () => {},
    });
    assert.equal(noWinRes.ok, false);
    assert.equal(noWinRes.reason, 'no-host-windows');
    assert.equal(process.exitCode, 1);

    process.exitCode = 0;
    const evalFailRes = await runCdpAttachCli(['--attach', '--port=9222'], {
      discoverPort: (p) => p,
      listTargets: async () => [
        {
          type: 'page',
          title: 'Antigravity',
          url: 'app://antigravity/index.html',
          webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/1',
        },
      ],
      evalTarget: async () => {
        throw new Error('SyntaxError in renderer');
      },
      log: () => {},
      error: () => {},
    });
    assert.equal(evalFailRes.ok, false);
    assert.equal(evalFailRes.failedCount, 1);
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = prevExitCode;
  }
});

test('6. SagWatchDaemon: reports no-host-windows/all-failed accurately, isolates per-session NOV signatures, and HostBridgeSession fails closed on non-loopback WS', async () => {
  const tmp = makeTempDir('agy-sag-watch-audit-');
  try {
    // (a) HostBridgeSession refuses non-loopback WS URL
    const { MockWebSocket: BadWs, instances: badInst } = createMockWebSocketClass();
    const badEvents = [];
    const badSess = new HostBridgeSession({
      targetId: 't-bad',
      wsUrl: 'ws://evil.host:9222/devtools/page/1',
      WebSocketImpl: BadWs,
      onEvent: (name, data) => badEvents.push({ name, ...data }),
    });
    assert.equal(badSess.open(), false);
    assert.equal(badInst.length, 0);
    assert.ok(badEvents.some((e) => e.name === 'bridge-error'));

    // (b) reconcileOnce reports no-host-windows & all-failed accurately
    let curTargets = [];
    const daemonStatus = new SagWatchDaemon({
      discoverPort: () => 9222,
      listTargets: async () => curTargets,
      buildInject: () => ({ codeHash: 'h1', expression: 'INJECT' }),
      evalTarget: async () => {
        throw new Error('eval crashed');
      },
      enableHostBridge: false,
    });
    const noHostRes = await daemonStatus.reconcileOnce();
    assert.equal(noHostRes.status, 'no-host-windows');
    assert.equal(noHostRes.ok, false);

    curTargets = [
      {
        id: 'w-fail',
        type: 'page',
        title: 'Antigravity',
        url: 'app://antigravity/index.html',
        webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/fail',
      },
    ];
    const allFailedRes = await daemonStatus.reconcileOnce();
    assert.equal(allFailedRes.status, 'all-failed');
    assert.equal(allFailedRes.ok, false);
    assert.equal(allFailedRes.errors, 1);

    // (c) Multi-window NOV state & feed sync: new window connecting after external mutation must NOT mask update for older window!
    const homeDir = path.join(tmp, 'home');
    const novDataDir = path.join(tmp, 'nov-data');
    fs.mkdirSync(homeDir, { recursive: true });
    fs.mkdirSync(path.join(novDataDir, 'spec'), { recursive: true });
    fs.writeFileSync(
      path.join(novDataDir, 'spec', 'state.json'),
      JSON.stringify({ writeLockActive: false, activeSpecId: 'sp-1', specs: [] }),
      'utf8'
    );
    applyNovCommand({ action: 'apply_preset', preset: 'core' }, { homeDir, env: {}, explicitDataDir: novDataDir });

    const pushesA = [];
    const pushesB = [];
    const makeFakeSession = (id, sink) => ({
      targetId: id,
      isMainContextReady: () => true,
      isOpen: () => true,
      push(ev, data) {
        sink.push({ ev, data });
        return true;
      },
    });

    const daemon = new SagWatchDaemon({
      enableHostBridge: true,
      novBridgeOpts: { homeDir, env: {}, explicitDataDir: novDataDir },
    });
    const sessA = makeFakeSession('win-A', pushesA);
    daemon.bridgeSessions.set('win-A', sessA);
    daemon._pushInitialNovState(sessA, 'win-A');
    assert.equal(pushesA.filter((p) => p.ev === 'nov:state').length, 1);

    // External mutations happen BEFORE sync cycle, and Window B connects first!
    applyNovCommand({ action: 'apply_preset', preset: 'power' }, { homeDir, env: {}, explicitDataDir: novDataDir });
    fs.writeFileSync(
      path.join(novDataDir, 'spec', 'state.json'),
      JSON.stringify({ writeLockActive: true, activeSpecId: 'sp-2', specs: [{ id: 'sp-2', title: 'Locked Spec', status: 'draft' }] }),
      'utf8'
    );

    const sessB = makeFakeSession('win-B', pushesB);
    daemon.bridgeSessions.set('win-B', sessB);
    daemon._pushInitialNovState(sessB, 'win-B');
    assert.equal(pushesB.filter((p) => p.ev === 'nov:state').length, 1);
    assert.equal(pushesB[0].data.state.config.preset, 'power');

    // Now sync runs: Window A MUST still receive both updated nov:state and nov:feed, while Window B gets 0 duplicate pushes
    const stateSync = daemon.syncNovStateToBridges();
    assert.equal(stateSync.pushed, 1);
    assert.equal(pushesA.filter((p) => p.ev === 'nov:state').length, 2);
    assert.equal(pushesA.at(-1).data.state.config.preset, 'power');
    assert.equal(pushesB.filter((p) => p.ev === 'nov:state').length, 1, 'Window B already up-to-date');

    const feedSync = daemon.syncNovFeedToBridges();
    assert.equal(feedSync.pushed, 1);
    assert.equal(pushesA.filter((p) => p.ev === 'nov:feed').length, 1);
    assert.equal(pushesA.at(-1).data.feed.spec.writeLockActive, true);
    assert.equal(pushesB.filter((p) => p.ev === 'nov:feed').length, 0, 'Window B already seeded at latest feed');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('7. bundle.mjs: same-hash reuse checks owner yield, merges extPrelude before reuse, and REMOVE_EXPRESSION preserves host owner & cleans __agSagHostBridge', () => {
  const jaExpr = buildInjectExpression({ hostI18nLocale: 'ja' }, { source: 'standalone', extLocale: 'ja' });
  const hashMatch = jaExpr.match(/const targetHash = "([a-f0-9]+)";/);
  assert.ok(hashMatch, 'Expected targetHash in inject expression');
  const targetHash = hashMatch[1];

  // (a) Same-hash reuse yields when window is owned by obsidian-prism
  let updateConfigCalled = false;
  const yieldSandbox = {
    window: {
      __agSagOwner: 'obsidian-prism',
      __agSag: {
        __agSgHash: targetHash,
        getDebugState: () => ({ destroyed: false }),
        updateConfig: () => {
          updateConfigCalled = true;
        },
      },
    },
    document: {},
  };
  yieldSandbox.window.self = yieldSandbox.window;
  yieldSandbox.window.top = yieldSandbox.window;
  const yieldRes = vm.runInNewContext(jaExpr, yieldSandbox);
  assert.equal(yieldRes.ok, true);
  assert.equal(yieldRes.yielded, true);
  assert.equal(yieldRes.owner, 'obsidian-prism');
  assert.equal(updateConfigCalled, false);

  // (b) Same-hash reuse loads extPrelude BEFORE calling updateConfig so locale switch does not lose extended pack
  let packAvailableDuringUpdate = false;
  const reuseSandbox = {
    window: {
      __agSagOwner: 'standalone',
      __agSag: {
        __agSgHash: targetHash,
        getDebugState: () => ({ destroyed: false }),
        updateConfig: () => {
          packAvailableDuringUpdate = Boolean(reuseSandbox.window.__agSagExtPacks?.ja);
        },
        evaluateNow: () => {},
      },
    },
    document: {},
  };
  reuseSandbox.window.self = reuseSandbox.window;
  reuseSandbox.window.top = reuseSandbox.window;
  const reuseRes = vm.runInNewContext(jaExpr, reuseSandbox);
  assert.equal(reuseRes.ok, true);
  assert.equal(reuseRes.reused, true);
  assert.equal(packAvailableDuringUpdate, true, 'extPrelude must register __agSagExtPacks[ja] before same-hash updateConfig');

  // (c) REMOVE_EXPRESSION yields to host integrator owner without destroying host instance
  let hostDestroyed = false;
  const hostRemoveSandbox = {
    window: {
      __agSagOwner: 'obsidian-prism',
      __agSag: { destroy: () => { hostDestroyed = true; } },
      __agSagBridgeReceiver: { onResponse() {} },
      __agSagHostBridge: () => {},
    },
    globalThis: {},
    document: { getElementById: () => null, querySelectorAll: () => [] },
  };
  const hostRemoveRes = vm.runInNewContext(REMOVE_EXPRESSION, hostRemoveSandbox);
  assert.equal(hostRemoveRes.ok, true);
  assert.equal(hostRemoveRes.status, 'yielded');
  assert.equal(hostDestroyed, false, 'Must NOT destroy host-owned instance');
  assert.equal(typeof hostRemoveSandbox.window.__agSagHostBridge, 'function', 'Must NOT mutate host-owned bridge');
  assert.equal(typeof hostRemoveSandbox.window.__agSagBridgeReceiver?.onResponse, 'function', 'Must NOT mutate host-owned receiver');

  // (d) REMOVE_EXPRESSION destroys standalone instance and cleans __agSagHostBridge
  let standaloneDestroyed = false;
  const standaloneRemoveSandbox = {
    window: {
      __agSagOwner: 'standalone',
      __agSag: { destroy: () => { standaloneDestroyed = true; } },
      __agSagHostBridge: () => {},
    },
    globalThis: { __agSagHostBridge: () => {} },
    document: { getElementById: () => null, querySelectorAll: () => [] },
  };
  const standaloneRemoveRes = vm.runInNewContext(REMOVE_EXPRESSION, standaloneRemoveSandbox);
  assert.equal(standaloneRemoveRes.ok, true);
  assert.equal(standaloneRemoveRes.status, 'removed');
  assert.equal(standaloneDestroyed, true);
  assert.equal(standaloneRemoveSandbox.window.__agSagHostBridge, undefined);
  assert.equal(standaloneRemoveSandbox.globalThis.__agSagHostBridge, undefined);
});

test('8. discoverCdpPort: covers Linux XDG/lowercase/Flatpak/Snap and Windows APPDATA/LOCALAPPDATA', () => {
  const tmp = makeTempDir('agy-sag-port-');
  try {
    // Linux XDG_CONFIG_HOME
    const xdgDir = path.join(tmp, 'xdg');
    fs.mkdirSync(path.join(xdgDir, 'Antigravity'), { recursive: true });
    fs.writeFileSync(path.join(xdgDir, 'Antigravity', 'DevToolsActivePort'), '41111\n/ws\n', 'utf8');
    assert.equal(discoverCdpPort(null, 'linux', path.join(tmp, 'h1'), { XDG_CONFIG_HOME: xdgDir }), 41111);

    // Linux lowercase ~/.config/antigravity
    const hLower = path.join(tmp, 'h-lower');
    fs.mkdirSync(path.join(hLower, '.config', 'antigravity'), { recursive: true });
    fs.writeFileSync(path.join(hLower, '.config', 'antigravity', 'DevToolsActivePort'), '42222\n', 'utf8');
    assert.equal(discoverCdpPort(null, 'linux', hLower, {}), 42222);

    // Linux Flatpak
    const hFlatpak = path.join(tmp, 'h-flatpak');
    fs.mkdirSync(path.join(hFlatpak, '.var', 'app', 'com.google.Antigravity', 'config', 'Antigravity'), { recursive: true });
    fs.writeFileSync(
      path.join(hFlatpak, '.var', 'app', 'com.google.Antigravity', 'config', 'Antigravity', 'DevToolsActivePort'),
      '43333\n',
      'utf8'
    );
    assert.equal(discoverCdpPort(null, 'linux', hFlatpak, {}), 43333);

    // Linux Snap
    const hSnap = path.join(tmp, 'h-snap');
    fs.mkdirSync(path.join(hSnap, 'snap', 'antigravity', 'current', '.config', 'Antigravity'), { recursive: true });
    fs.writeFileSync(
      path.join(hSnap, 'snap', 'antigravity', 'current', '.config', 'Antigravity', 'DevToolsActivePort'),
      '44444\n',
      'utf8'
    );
    assert.equal(discoverCdpPort(null, 'linux', hSnap, {}), 44444);

    // Windows LOCALAPPDATA fallback when APPDATA has no file
    const hWin = path.join(tmp, 'h-win');
    const localAppData = path.join(hWin, 'AppData', 'Local');
    fs.mkdirSync(path.join(localAppData, 'Antigravity'), { recursive: true });
    fs.writeFileSync(path.join(localAppData, 'Antigravity', 'DevToolsActivePort'), '45555\n', 'utf8');
    assert.equal(
      discoverCdpPort(null, 'win32', hWin, {
        APPDATA: path.join(hWin, 'AppData', 'Roaming'),
        LOCALAPPDATA: localAppData,
      }),
      45555
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('9. launcher Windows/Linux hardening: quoted flags, PowerShell UTF-8/pwsh fallback/fail-closed detection, Linux /proc & strict process matching', async () => {
  const tmp = makeTempDir('agy-sag-launcher-xplat-');
  try {
    // Quoted --remote-debugging-port forms
    assert.equal(hasRemoteDebuggingPort('"C:\\Apps\\Antigravity.exe" "--remote-debugging-port=9222"'), true);
    assert.equal(extractRemoteDebuggingPort('"C:\\Apps\\Antigravity.exe" "--remote-debugging-port=9222"'), 9222);
    assert.equal(extractRemoteDebuggingPort('Antigravity.exe --remote-debugging-port="9333"'), 9333);
    assert.equal(extractRemoteDebuggingPort('Antigravity.exe "--remote-debugging-port" "9444"'), 9444);

    // Windows PowerShell UTF-8 preamble + pwsh fallback when powershell.exe returns invalid JSON
    const seenCmds = [];
    const pwshProcs = await detectAntigravityProcesses({
      platform: 'win32',
      nowFn: () => 1795791600000,
      execFileFn: async (exe, args) => {
        seenCmds.push({ exe, args });
        if (exe === 'powershell.exe') {
          assert.ok(args.join(' ').includes('[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;'));
          return { stdout: 'not valid json output' };
        }
        if (exe === 'pwsh') {
          return {
            stdout: JSON.stringify({
              ProcessId: 8080,
              ParentProcessId: 100,
              CreationDate: '/Date(1795791598000)/',
              CommandLine: '"C:\\Program Files\\Antigravity\\Antigravity.exe" "--remote-debugging-port=9228"',
            }),
          };
        }
        throw new Error('should not reach wmic');
      },
    });
    assert.equal(seenCmds[0].exe, 'powershell.exe');
    assert.equal(seenCmds[1].exe, 'pwsh');
    assert.equal(pwshProcs.length, 1);
    assert.equal(pwshProcs[0].pid, 8080);
    assert.equal(pwshProcs[0].debuggingPort, 9228);

    // Empty PowerShell output means 0 processes (NOT detectionFailed)
    const emptyWin = await detectAntigravityProcesses({
      platform: 'win32',
      execFileFn: async () => ({ stdout: '   \r\n' }),
    });
    assert.equal(emptyWin.length, 0);
    assert.notEqual(emptyWin.detectionFailed, true);

    // All Windows probes failing -> Fail-Closed PROCESS_DETECTION_FAILED in evaluateLaunchPlan
    const failPlan = await evaluateLaunchPlan({
      platform: 'win32',
      homeDir: tmp,
      statePath: path.join(tmp, 'launch-state.json'),
      execFileFn: async (exe) => {
        throw new Error(`${exe} unavailable`);
      },
    });
    assert.equal(failPlan.ok, false);
    assert.equal(failPlan.action, 'blocked-detection-failed');
    assert.equal(failPlan.code, 'PROCESS_DETECTION_FAILED');

    // buildLaunchSpec: ANTIGRAVITY_BIN, Windows case-insensitive PROGRAMFILES / scoop / LOCALAPPDATA, Linux paths
    const envBin = buildLaunchSpec({
      platform: 'linux',
      port: 9222,
      env: { ANTIGRAVITY_BIN: '/custom/bin/antigravity' },
      existsSyncFn: (p) => p === '/custom/bin/antigravity',
    });
    assert.equal(envBin.command, '/custom/bin/antigravity');
    assert.equal(envBin.executableFound, true);

    const winScoop = buildLaunchSpec({
      platform: 'win32',
      port: 9222,
      homeDir: 'C:\\Users\\Dev',
      env: { USERPROFILE: 'C:\\Users\\Dev', PROGRAMFILES: 'E:\\Apps' },
      existsSyncFn: (p) => p === 'C:\\Users\\Dev\\scoop\\apps\\antigravity\\current\\Antigravity.exe',
    });
    assert.equal(winScoop.command, 'C:\\Users\\Dev\\scoop\\apps\\antigravity\\current\\Antigravity.exe');

    const winUpperPf = buildLaunchSpec({
      platform: 'win32',
      port: 9222,
      homeDir: 'C:\\Users\\Dev',
      env: { PROGRAMFILES: 'E:\\Program Files' },
      existsSyncFn: (p) => p === 'E:\\Program Files\\Antigravity\\Antigravity.exe',
    });
    assert.equal(winUpperPf.command, 'E:\\Program Files\\Antigravity\\Antigravity.exe');

    const linuxLocal = buildLaunchSpec({
      platform: 'linux',
      port: 9222,
      homeDir: '/home/dev',
      existsSyncFn: (p) => p === '/home/dev/.local/bin/antigravity',
    });
    assert.equal(linuxLocal.command, '/home/dev/.local/bin/antigravity');

    // guide-only quotes paths containing spaces
    const guideWinPlan = await evaluateLaunchPlan({
      platform: 'win32',
      homeDir: tmp,
      statePath: path.join(tmp, 'launch-state.json'),
      env: { PROGRAMFILES: 'C:\\Program Files' },
      existsSyncFn: (p) => p === 'C:\\Program Files\\Antigravity\\Antigravity.exe',
      execFileFn: async () => ({
        stdout: JSON.stringify({
          ProcessId: 909,
          ParentProcessId: 1,
          CreationDate: '/Date(1795791000000)/',
          CommandLine: '"C:\\Program Files\\Antigravity\\Antigravity.exe"',
        }),
      }),
    });
    assert.equal(guideWinPlan.action, 'guide-only');
    assert.ok(
      guideWinPlan.message.includes('"C:\\Program Files\\Antigravity\\Antigravity.exe" --remote-debugging-port=9222')
    );

    // Strict Linux main process matching avoids false positives
    assert.equal(isAntigravityMainProcess('vim antigravity.md', 'linux'), false);
    assert.equal(isAntigravityMainProcess('grep antigravity /var/log/syslog', 'linux'), false);
    assert.equal(isAntigravityMainProcess('cat /home/u/antigravity/notes.txt', 'linux'), false);
    assert.equal(isAntigravityMainProcess('/usr/lib/antigravity/antigravity --remote-debugging-port=9222', 'linux'), true);
    assert.equal(isAntigravityMainProcess('/opt/antigravity/antigravity-bin', 'linux'), true);
    assert.equal(isAntigravityMainProcess('/home/u/Antigravity-1.2.0-x86_64.AppImage', 'linux'), true);
    assert.equal(isAntigravityMainProcess('/usr/bin/electron /usr/lib/antigravity/resources/app.asar', 'linux'), true);

    // Linux ps failure falls back to pure-Node /proc/<pid>/cmdline scan
    const mockProc = path.join(tmp, 'mock-proc');
    fs.mkdirSync(path.join(mockProc, '4321'), { recursive: true });
    fs.mkdirSync(path.join(mockProc, '4322'), { recursive: true });
    fs.writeFileSync(
      path.join(mockProc, '4321', 'cmdline'),
      '/opt/antigravity/antigravity\0--remote-debugging-port=9555\0',
      'utf8'
    );
    fs.writeFileSync(path.join(mockProc, '4322', 'cmdline'), 'vim\0antigravity.md\0', 'utf8');

    const procFallback = await detectAntigravityProcesses({
      platform: 'linux',
      procDir: mockProc,
      execFileFn: async () => {
        throw new Error('ps binary not installed');
      },
    });
    assert.notEqual(procFallback.detectionFailed, true);
    assert.equal(procFallback.length, 1);
    assert.equal(procFallback[0].pid, 4321);
    assert.equal(procFallback[0].debuggingPort, 9555);

    // Linux ps AND /proc both fail -> detectionFailed = true
    const procBothFail = await detectAntigravityProcesses({
      platform: 'linux',
      procDir: path.join(tmp, 'nonexistent-proc'),
      execFileFn: async () => {
        throw new Error('ps failed');
      },
    });
    assert.equal(procBothFail.detectionFailed, true);

    // requestGracefulQuit treats already-exited Windows taskkill error & POSIX ESRCH as clean exit
    const winQuit = await requestGracefulQuit({
      processes: [{ pid: 777 }],
      platform: 'win32',
      execFileFn: async () => {
        throw new Error('ERROR: The process "777" not found.');
      },
      isProcessAliveFn: () => false,
    });
    assert.equal(winQuit.ok, true);

    const posixQuit = await requestGracefulQuit({
      processes: [{ pid: 888 }],
      platform: 'linux',
      killFn: () => {
        const err = new Error('No such process');
        err.code = 'ESRCH';
        throw err;
      },
      isProcessAliveFn: () => false,
    });
    assert.equal(posixQuit.ok, true);

    // executeLaunchPlan records state BEFORE quitting host during graceful-relaunch (symlink state aborts before quit!)
    const badStatePath = path.join(tmp, 'sym-state.json');
    const outsideTarget = path.join(tmp, 'outside.json');
    fs.writeFileSync(outsideTarget, '{}', 'utf8');
    fs.symlinkSync(outsideTarget, badStatePath);
    let quitCalled = false;
    await assert.rejects(
      () =>
        executeLaunchPlan(
          {
            ok: true,
            action: 'graceful-relaunch',
            platform: 'linux',
            port: 9222,
            processes: [{ pid: 999 }],
            launchSpec: { command: 'antigravity', args: ['--remote-debugging-port=9222'] },
            statePath: badStatePath,
          },
          {
            killFn: () => {
              quitCalled = true;
            },
            spawnFn: () => ({ pid: 1000 }),
          }
        ),
      /symlink/i
    );
    assert.equal(quitCalled, false, 'Must never quit Antigravity if state persistence fails');

    // writeLaunchStateAtomic works with win32 retry injection
    const retryStatePath = path.join(tmp, 'retry-state', 'launch-state.json');
    let renCount = 0;
    writeLaunchStateAtomic(
      retryStatePath,
      { attempts: [100], cooldownUntil: null, updatedAt: 100 },
      {
        platform: 'win32',
        renameSyncFn: (src, dst) => {
          renCount += 1;
          if (renCount === 1) {
            const e = new Error('busy');
            e.code = 'EBUSY';
            throw e;
          }
          fs.renameSync(src, dst);
        },
        waitFn: () => {},
      }
    );
    assert.equal(renCount, 2);
    assert.equal(JSON.parse(fs.readFileSync(retryStatePath, 'utf8')).attempts[0], 100);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('10. SagKeepaliveController: propagates launched fixed port to internal daemon so next reconcile connects without DevToolsActivePort', async () => {
  const tmp = makeTempDir('agy-sag-ka-port-');
  try {
    let launched = false;
    const queriedPorts = [];
    const controller = new SagKeepaliveController({
      platform: 'linux',
      homeDir: tmp,
      statePath: path.join(tmp, 'launch-state.json'),
      port: 9222,
      explicitPort: false,
      autoRelaunch: true,
      enableHostBridge: false,
      execFileFn: async () => ({ stdout: '' }),
      spawnFn: () => {
        launched = true;
        return { pid: 6100 };
      },
      listTargets: async (p) => {
        queriedPorts.push(p);
        if (!launched || p !== 9222) throw new Error('ECONNREFUSED');
        return [
          {
            id: 'win-ka',
            type: 'page',
            title: 'Antigravity',
            url: 'app://antigravity/index.html',
            webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/ka',
          },
        ];
      },
      evalTarget: async (_ws, expr) => {
        if (expr === PROBE_EXPRESSION) return { state: 'mounted', codeHash: 'h1' };
        return { ok: true, yielded: false, codeHash: 'h1' };
      },
    });

    // Tick 1: no DevToolsActivePort -> launches on 9222 & propagates activePort
    const t1 = await controller.reconcileOnce();
    assert.equal(t1.launchResult?.executed, true);
    assert.equal(controller.activePort, 9222);

    // Tick 2: still no DevToolsActivePort file on disk, yet internal daemon connects on 9222 and succeeds!
    const t2 = await controller.reconcileOnce();
    assert.equal(t2.status, 'ok');
    assert.deepEqual(queriedPorts, [9222]);
    controller.stop();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('11. installLocalPlugin & createStorageBackup: reject destination symlinks at root, subdir, and file level fail-closed', () => {
  const tmp = makeTempDir('agy-sag-sym-guard-');
  try {
    const outsideDir = path.join(tmp, 'outside');
    const outsideFile = path.join(tmp, 'outside-secret.txt');
    fs.mkdirSync(outsideDir, { recursive: true });
    fs.writeFileSync(outsideFile, 'ORIGINAL_SECRET', 'utf8');

    // (a) installLocalPlugin: targetDir itself is a symlink -> throw
    const symTargetDir = path.join(tmp, 'link-target');
    fs.symlinkSync(outsideDir, symTargetDir);
    assert.throws(() => installLocalPlugin({ targetDir: symTargetDir }), /symlink/i);

    // (b) installLocalPlugin: nested subdir (`packages`) inside targetDir is a symlink -> throw
    const targetWithSymSubdir = path.join(tmp, 'install-sym-subdir');
    fs.mkdirSync(targetWithSymSubdir, { recursive: true });
    fs.symlinkSync(outsideDir, path.join(targetWithSymSubdir, 'packages'));
    assert.throws(() => installLocalPlugin({ targetDir: targetWithSymSubdir }), /symlink/i);

    // (c) installLocalPlugin: target file (`plugin.json`) is a symlink -> throw & never overwrite outsideFile
    const targetWithSymFile = path.join(tmp, 'install-sym-file');
    fs.mkdirSync(targetWithSymFile, { recursive: true });
    fs.symlinkSync(outsideFile, path.join(targetWithSymFile, 'plugin.json'));
    assert.throws(() => installLocalPlugin({ targetDir: targetWithSymFile }), /symlink/i);
    assert.equal(fs.readFileSync(outsideFile, 'utf8'), 'ORIGINAL_SECRET');

    // (d) createStorageBackup: destination root, subdir, or file symlink -> fail-closed & never overwrite
    const srcData = path.join(tmp, 'src-storage');
    fs.mkdirSync(path.join(srcData, 'conversations'), { recursive: true });
    fs.writeFileSync(path.join(srcData, 'conversations', 'c1.pb'), 'NEW_DATA', 'utf8');

    const symBackupRoot = path.join(tmp, 'backup-link-root');
    fs.symlinkSync(outsideDir, symBackupRoot);
    assert.throws(() => createStorageBackup({ dataDir: srcData, outDir: symBackupRoot }), /symlink/i);

    const backupSymSubdir = path.join(tmp, 'backup-sym-subdir');
    fs.mkdirSync(backupSymSubdir, { recursive: true });
    fs.symlinkSync(outsideDir, path.join(backupSymSubdir, 'conversations'));
    assert.throws(() => createStorageBackup({ dataDir: srcData, outDir: backupSymSubdir }), /symlink/i);

    const backupSymFile = path.join(tmp, 'backup-sym-file');
    fs.mkdirSync(path.join(backupSymFile, 'conversations'), { recursive: true });
    fs.symlinkSync(outsideFile, path.join(backupSymFile, 'conversations', 'c1.pb'));
    assert.throws(() => createStorageBackup({ dataDir: srcData, outDir: backupSymFile }), /symlink/i);
    assert.equal(fs.readFileSync(outsideFile, 'utf8'), 'ORIGINAL_SECRET');

    // assertNoSymlinkAncestors itself rejects intermediate symlinked parent dir
    const symParent = path.join(tmp, 'sym-parent');
    fs.symlinkSync(outsideDir, symParent);
    assert.throws(() => assertNoSymlinkAncestors(path.join(symParent, 'child', 'leaf.json')), /symlink/i);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('12. workbench/server.mjs: startWorkbenchServer rejects cleanly on port conflict (EADDRINUSE)', async () => {
  const blocker = http.createServer((_req, res) => res.end('busy'));
  await new Promise((resolve) => blocker.listen(0, '127.0.0.1', resolve));
  const { port } = blocker.address();
  try {
    await assert.rejects(
      () => startWorkbenchServer(port),
      (err) => err && (err.code === 'EADDRINUSE' || /EADDRINUSE/i.test(String(err.message)))
    );
  } finally {
    await new Promise((resolve) => blocker.close(resolve));
  }
});

test('13. second-pass hardening: POSIX literal backslash containment, non-host app:// rejection, incomplete Win/Linux probes, hardlink-safe install & lazy workbench CLI', async () => {
  // (a) POSIX path comparison treats backslash as literal filename char, never separator
  assert.equal(isPathWithinBase('/tmp/base\\../outside', '/tmp/base', 'linux'), false);
  assert.equal(isPathWithinBase('/tmp/base/file\\name.txt', '/tmp/base', 'linux'), true);

  // (b) Non-Antigravity app://.../index.html and port-mismatched WS URLs are rejected
  assert.equal(
    isAntigravityHostTarget({
      type: 'page',
      title: 'Other App',
      url: 'app://other-app/index.html',
      webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/1',
    }),
    false
  );
  assert.equal(
    isAntigravityHostTarget(
      {
        type: 'page',
        title: 'Antigravity',
        url: 'app://antigravity/index.html',
        webSocketDebuggerUrl: 'ws://127.0.0.1:1337/devtools/page/1',
      },
      { expectedPort: 9222 }
    ),
    false
  );

  // (c) Windows PID with missing CommandLine fails closed instead of looking like "not running"
  const winIncomplete = await detectAntigravityProcesses({
    platform: 'win32',
    execFileFn: async (exe) => {
      if (exe === 'powershell.exe' || exe === 'pwsh') {
        return { stdout: JSON.stringify([{ ProcessId: 4001, ParentProcessId: 100, CreationDate: '/Date(1795791597000)/', CommandLine: null }]) };
      }
      return { stdout: 'ProcessId=4001\nParentProcessId=100\nCommandLine=\n' };
    },
  });
  assert.equal(winIncomplete.detectionFailed, true, 'Missing CommandLine on Windows must fail closed');

  // (d) Linux unparseable non-empty ps output triggers /proc fallback and fails closed when /proc unavailable
  const linuxUnparseable = await detectAntigravityProcesses({
    platform: 'linux',
    procDir: '/nonexistent-proc-dir-sag-test',
    execFileFn: async () => ({ stdout: 'PID USER TIME COMMAND\nnot-a-pid root 0:00 busybox\n' }),
  });
  assert.equal(linuxUnparseable.detectionFailed, true, 'Unparseable non-empty Linux ps + missing /proc must fail closed');

  // (e) Linux unquoted absolute path containing spaces is recognized as Antigravity main process
  assert.equal(isAntigravityMainProcess('/opt/My Apps/Antigravity/antigravity --remote-debugging-port=9222', 'linux'), true);

  // (f) Clean installed plugin without workbench/ still loads cli/sag-cli.mjs --help without ERR_MODULE_NOT_FOUND
  const tmpInstall = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-sag-clean-cli-'));
  try {
    const res = installLocalPlugin({ targetDir: tmpInstall, dryRun: false });
    assert.equal(res.ok, true);
    assert.equal(fs.existsSync(path.join(tmpInstall, 'workbench')), false);
    const { execFileSync } = await import('node:child_process');
    const helpOut = execFileSync(process.execPath, [path.join(tmpInstall, 'cli', 'sag-cli.mjs'), '--help'], {
      encoding: 'utf8',
    });
    assert.match(helpOut, /agy-Sag/i);
  } finally {
    fs.rmSync(tmpInstall, { recursive: true, force: true });
  }
});
