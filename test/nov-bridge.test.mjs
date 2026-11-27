import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import {
  ALLOWED_NOV_LOCALES,
  MAX_BRIDGE_PAYLOAD_BYTES,
  NOV_MODULES_CATALOG,
  NOV_MODULE_CATEGORIES,
  NOV_MODULE_CATEGORY_IDS,
  NOV_MODULE_IDS,
  NOV_PRESETS,
  applyNovCommand,
  countNovEnabledTools,
  detectNovPreset,
  handleBridgePayload,
  readNovState,
  resolveNovPaths,
} from '../cli/nov-bridge.mjs';
import {
  HOST_BRIDGE_BINDING_NAME,
  HostBridgeSession,
  PROBE_EXPRESSION,
  SagWatchDaemon,
  isPrismDaemonActive,
  serializeInlineJson,
} from '../cli/watch-daemon.mjs';
import { runSagCli } from '../cli/sag-cli.mjs';
import { formatDoctorHuman, inspectNovInstall, runDoctor } from '../cli/doctor.mjs';

function withTempDir(prefix, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function withTempDirAsync(prefix, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Lightweight mock WebSocket for testing HostBridgeSession & SagWatchDaemon
 * without opening any real TCP/HTTP ports.
 */
function createMockWebSocketClass() {
  const instances = [];

  class MockWebSocket {
    static OPEN = 1;
    static CLOSED = 3;

    constructor(url) {
      this.url = url;
      this.OPEN = 1;
      this.CLOSED = 3;
      this.readyState = 0; // CONNECTING
      this.sent = [];
      this.closed = false;
      this._listeners = new Map();
      instances.push(this);
    }

    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, new Set());
      this._listeners.get(type).add(fn);
    }

    _emit(type, ev = {}) {
      for (const fn of this._listeners.get(type) || []) {
        fn(ev);
      }
    }

    simulateOpen() {
      this.readyState = 1;
      this._emit('open', {});
    }

    simulateMessage(obj) {
      const data = typeof obj === 'string' ? obj : JSON.stringify(obj);
      this._emit('message', { data });
    }

    findLastSent(method) {
      for (let i = this.sent.length - 1; i >= 0; i--) {
        if (this.sent[i].method === method) return this.sent[i];
      }
      return null;
    }

    replyFrameTree(topFrameId, childFrameIds = []) {
      const req = this.findLastSent('Page.getFrameTree');
      assert.ok(req, 'Expected HostBridgeSession to send Page.getFrameTree');
      this.simulateMessage({
        id: req.id,
        result: {
          frameTree: {
            frame: { id: topFrameId },
            childFrames: childFrameIds.map((id) => ({ frame: { id }, childFrames: [] })),
          },
        },
      });
    }

    send(raw) {
      this.sent.push(JSON.parse(String(raw)));
    }

    close() {
      if (this.closed) return;
      this.closed = true;
      this.readyState = 3;
      this._emit('close', {});
    }
  }

  return { MockWebSocket, instances };
}

test('1. NOV constants align 100% with agy-NOV 13 native modules, 5 categories, tool counts & 5 presets', () => {
  assert.deepEqual(
    [...NOV_MODULE_IDS],
    [
      'review',
      'guard',
      'xray',
      'turbo',
      'radar',
      'verify',
      'worktree',
      'spec',
      'studio',
      'canvas',
      'mem',
      'ops',
      'remote',
    ]
  );
  assert.deepEqual([...NOV_MODULE_CATEGORY_IDS], ['core-dev', 'safety', 'observability', 'workspace', 'connectivity']);
  for (const catId of NOV_MODULE_CATEGORY_IDS) {
    assert.equal(NOV_MODULE_CATEGORIES[catId].id, catId);
    assert.ok(NOV_MODULE_CATEGORIES[catId].label);
  }
  assert.deepEqual([...ALLOWED_NOV_LOCALES], ['auto', 'en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'es', 'fr', 'de']);

  const expectedTools = {
    review: { category: 'core-dev', tier: 'offline', toolsCount: 2, defaultEnabled: true },
    guard: { category: 'safety', tier: 'offline', toolsCount: 4, defaultEnabled: true },
    xray: { category: 'observability', tier: 'offline', toolsCount: 4, defaultEnabled: true },
    turbo: { category: 'core-dev', tier: 'offline', toolsCount: 3, defaultEnabled: false },
    radar: { category: 'observability', tier: 'offline', toolsCount: 2, defaultEnabled: false },
    verify: { category: 'safety', tier: 'offline', toolsCount: 4, defaultEnabled: false },
    worktree: { category: 'core-dev', tier: 'offline', toolsCount: 4, defaultEnabled: false },
    spec: { category: 'workspace', tier: 'offline', toolsCount: 4, defaultEnabled: false },
    studio: { category: 'workspace', tier: 'offline', toolsCount: 4, defaultEnabled: false },
    canvas: { category: 'workspace', tier: 'offline', toolsCount: 4, defaultEnabled: false },
    mem: { category: 'workspace', tier: 'offline', toolsCount: 3, defaultEnabled: false },
    ops: { category: 'workspace', tier: 'offline', toolsCount: 3, defaultEnabled: false },
    remote: { category: 'connectivity', tier: 'network', toolsCount: 4, defaultEnabled: false },
  };
  for (const [id, spec] of Object.entries(expectedTools)) {
    assert.equal(NOV_MODULES_CATALOG[id].id, id);
    assert.equal(NOV_MODULES_CATALOG[id].category, spec.category);
    assert.equal(NOV_MODULES_CATALOG[id].tier, spec.tier);
    assert.equal(NOV_MODULES_CATALOG[id].toolsCount, spec.toolsCount);
    assert.equal(NOV_MODULES_CATALOG[id].defaultEnabled, spec.defaultEnabled);
  }

  assert.equal(NOV_PRESETS.minimal.toolsCount, 6);
  assert.deepEqual([...NOV_PRESETS.minimal.enabledModules], ['guard']);
  assert.equal(NOV_PRESETS.core.toolsCount, 12);
  assert.deepEqual([...NOV_PRESETS.core.enabledModules], ['review', 'guard', 'xray']);
  assert.equal(NOV_PRESETS.power.toolsCount, 32);
  assert.deepEqual(
    [...NOV_PRESETS.power.enabledModules],
    ['review', 'guard', 'xray', 'turbo', 'radar', 'verify', 'worktree', 'spec', 'ops']
  );
  assert.equal(NOV_PRESETS['local-all'].toolsCount, 43);
  assert.deepEqual(
    [...NOV_PRESETS['local-all'].enabledModules],
    ['review', 'guard', 'xray', 'turbo', 'radar', 'verify', 'worktree', 'spec', 'studio', 'canvas', 'mem', 'ops']
  );
  assert.equal(NOV_PRESETS.full.toolsCount, 47);
  assert.deepEqual([...NOV_PRESETS.full.enabledModules], [...NOV_MODULE_IDS]);

  assert.equal(countNovEnabledTools(NOV_PRESETS.power.modules), 32);
  assert.equal(detectNovPreset(NOV_PRESETS.power.modules), 'power');
  assert.equal(detectNovPreset({ ...NOV_PRESETS.core.modules, turbo: true }), 'custom');
});

test('2. resolveNovPaths: priority, placeholder filtering, newest mtime across candidates & plugin symlink guard', () => {
  withTempDir('agy-nov-paths-', (tmp) => {
    const homeDir = path.join(tmp, 'home');
    fs.mkdirSync(homeDir, { recursive: true });

    // (a) Empty home -> fallback to ~/.agy-nov-data without creating any directory
    const pFallback = resolveNovPaths({ homeDir, env: {} });
    assert.equal(pFallback.installed, false);
    assert.equal(pFallback.pluginDir, null);
    assert.equal(pFallback.dataDir, path.join(homeDir, '.agy-nov-data'));
    assert.equal(fs.existsSync(pFallback.dataDir), false);

    // (b) Explicit dataDir takes highest priority; env placeholder ${PLUGIN_DATA} is filtered out
    const explicitDir = path.join(tmp, 'explicit-nov-data');
    const pExplicit = resolveNovPaths({
      homeDir,
      env: { AGY_NOV_DATA_DIR: path.join(tmp, 'env-nov-data') },
      explicitDataDir: explicitDir,
    });
    assert.equal(pExplicit.dataDir, explicitDir);

    const pEnv = resolveNovPaths({
      homeDir,
      env: { AGY_NOV_DATA_DIR: path.join(tmp, 'env-nov-data') },
    });
    assert.equal(pEnv.dataDir, path.join(tmp, 'env-nov-data'));

    const pPlaceholder = resolveNovPaths({
      homeDir,
      env: { AGY_NOV_DATA_DIR: '${PLUGIN_DATA}' },
    });
    assert.equal(pPlaceholder.dataDir, path.join(homeDir, '.agy-nov-data'));

    // (c) Installed plugin without existing config -> prefers ~/.gemini/antigravity/plugin_data/agy-nov
    const pluginDir = path.join(homeDir, '.gemini', 'config', 'plugins', 'agy-nov');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({ name: 'agy-nov', version: '2.1.0' }));

    const pPluginDefault = resolveNovPaths({ homeDir, env: {} });
    assert.equal(pPluginDefault.installed, true);
    assert.equal(pPluginDefault.version, '2.1.0');
    assert.equal(pPluginDefault.pluginDir, pluginDir);
    assert.equal(pPluginDefault.dataDir, path.join(homeDir, '.gemini', 'antigravity', 'plugin_data', 'agy-nov'));
    assert.equal(fs.existsSync(pPluginDefault.dataDir), false);

    // (d) Multiple candidates with config.json -> picks newest mtimeMs
    const candA = path.join(homeDir, '.gemini', 'antigravity', 'plugin_data', 'agy-nov');
    const candB = path.join(homeDir, '.agy-nov-data');
    fs.mkdirSync(candA, { recursive: true });
    fs.mkdirSync(candB, { recursive: true });
    const cfgA = path.join(candA, 'config.json');
    const cfgB = path.join(candB, 'config.json');
    fs.writeFileSync(cfgA, JSON.stringify({ schemaVersion: 1, modules: NOV_PRESETS.core.modules }));
    fs.writeFileSync(cfgB, JSON.stringify({ schemaVersion: 1, modules: NOV_PRESETS.power.modules }));
    fs.utimesSync(cfgA, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'));
    fs.utimesSync(cfgB, new Date('2026-06-01T00:00:00Z'), new Date('2026-06-01T00:00:00Z'));

    const pNewestB = resolveNovPaths({ homeDir, env: {} });
    assert.equal(pNewestB.dataDir, candB);

    // Bump candA newer -> switches to candA
    fs.utimesSync(cfgA, new Date('2026-09-01T00:00:00Z'), new Date('2026-09-01T00:00:00Z'));
    const pNewestA = resolveNovPaths({ homeDir, env: {} });
    assert.equal(pNewestA.dataDir, candA);

    // (e) Symlinked plugin directory escape is blocked
    const symHome = path.join(tmp, 'sym-home');
    const outsidePlugin = path.join(tmp, 'outside-plugin');
    fs.mkdirSync(outsidePlugin, { recursive: true });
    fs.writeFileSync(path.join(outsidePlugin, 'plugin.json'), JSON.stringify({ version: '9.9.9' }));
    fs.mkdirSync(path.join(symHome, '.gemini', 'config', 'plugins'), { recursive: true });
    fs.symlinkSync(outsidePlugin, path.join(symHome, '.gemini', 'config', 'plugins', 'agy-nov'));

    const pBlockedSym = resolveNovPaths({ homeDir: symHome, env: {} });
    assert.equal(pBlockedSym.installed, false);
    assert.equal(pBlockedSym.pluginDir, null);
  });
});

test('3. readNovState is strictly read-only when uninstalled or unconfigured, and infers custom/known presets', () => {
  withTempDir('agy-nov-ro-', (tmp) => {
    const homeDir = path.join(tmp, 'clean-home');
    fs.mkdirSync(homeDir, { recursive: true });

    const st = readNovState({ homeDir, env: {} });
    assert.equal(st.installed, false);
    assert.equal(st.configExists, false);
    assert.equal(st.signature, null);
    assert.equal(st.config.schemaVersion, 1);
    assert.equal(st.config.preset, 'core');
    assert.equal(st.config.locale, 'auto');
    assert.equal(st.config.modules.review, true);
    assert.equal(st.config.modules.guard, true);
    assert.equal(st.config.modules.xray, true);
    assert.equal(st.config.modules.remote, false);
    assert.equal(st.enabledToolsCount, 12);
    assert.equal(fs.existsSync(st.dataDir), false, 'readNovState must NEVER create dataDir');
    assert.equal(fs.existsSync(st.configPath), false, 'readNovState must NEVER create config.json');

    // Write a custom config directly and verify auto-detected preset='custom' & signature
    const customDir = path.join(tmp, 'custom-data');
    fs.mkdirSync(customDir, { recursive: true });
    fs.writeFileSync(
      path.join(customDir, 'config.json'),
      JSON.stringify({
        schemaVersion: 1,
        preset: 'core', // intentionally stale; should be re-derived as 'custom'
        modules: { ...NOV_PRESETS.core.modules, canvas: true },
        defaultTab: 'canvas',
        locale: 'zh-CN',
        updatedAt: '2026-10-01T00:00:00.000Z',
      })
    );
    const stCustom = readNovState({ homeDir, env: {}, explicitDataDir: customDir });
    assert.equal(stCustom.configExists, true);
    assert.ok(stCustom.signature && stCustom.signature.split(':').length === 3);
    assert.equal(stCustom.config.preset, 'custom');
    assert.equal(stCustom.config.defaultTab, 'canvas');
    assert.equal(stCustom.config.locale, 'zh-CN');
    assert.equal(stCustom.enabledToolsCount, 16);

    // Backward compatibility: legacy 9-module config.json missing verify/worktree/spec/studio defaults them to false
    const legacyDir = path.join(tmp, 'legacy-9mod-data');
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(
      path.join(legacyDir, 'config.json'),
      JSON.stringify({
        schemaVersion: 1,
        preset: 'core',
        modules: {
          review: true,
          guard: true,
          xray: true,
          turbo: false,
          radar: false,
          canvas: false,
          mem: false,
          ops: false,
          remote: false,
        },
        defaultTab: 'review',
        locale: 'auto',
      })
    );
    const stLegacy = readNovState({ homeDir, env: {}, explicitDataDir: legacyDir });
    assert.equal(stLegacy.config.modules.verify, false);
    assert.equal(stLegacy.config.modules.worktree, false);
    assert.equal(stLegacy.config.modules.spec, false);
    assert.equal(stLegacy.config.modules.studio, false);
    assert.equal(stLegacy.config.preset, 'core');
    assert.equal(stLegacy.enabledToolsCount, 12);
  });
});

test('4. applyNovCommand executes all 4 actions with 0600 atomic write and rejects invalid args & symlinks', () => {
  withTempDir('agy-nov-cmd-', (tmp) => {
    const homeDir = path.join(tmp, 'home');
    fs.mkdirSync(homeDir, { recursive: true });
    const dataDir = path.join(tmp, 'nov-data');
    const opts = { homeDir, env: {}, explicitDataDir: dataDir };

    // get_state remains strictly read-only
    const r0 = applyNovCommand({ action: 'get_state' }, opts);
    assert.equal(r0.ok, true);
    assert.equal(r0.state.configExists, false);
    assert.equal(fs.existsSync(dataDir), false);

    // set_module -> creates 0700 dir, 0600 config.json atomically, no leftover .tmp files
    const r1 = applyNovCommand({ action: 'set_module', moduleId: 'turbo', enabled: true }, opts);
    assert.equal(r1.ok, true);
    assert.equal(r1.state.configExists, true);
    assert.equal(r1.state.config.modules.turbo, true);
    assert.equal(r1.state.config.preset, 'custom');
    assert.equal(r1.state.config.defaultTab, 'turbo');

    const files = fs.readdirSync(dataDir);
    assert.deepEqual(files, ['config.json']);
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(dataDir).mode & 0o777, 0o700);
      assert.equal(fs.statSync(path.join(dataDir, 'config.json')).mode & 0o777, 0o600);
    }

    // apply_preset across presets
    for (const presetId of ['minimal', 'core', 'power', 'local-all', 'full']) {
      const rp = applyNovCommand({ action: 'apply_preset', preset: presetId }, opts);
      assert.equal(rp.ok, true);
      assert.equal(rp.state.config.preset, presetId);
      assert.deepEqual(rp.state.config.modules, NOV_PRESETS[presetId].modules);
      assert.equal(rp.state.enabledToolsCount, NOV_PRESETS[presetId].toolsCount);
    }

    // set_locale
    const rl = applyNovCommand({ action: 'set_locale', locale: 'zh-CN' }, opts);
    assert.equal(rl.ok, true);
    assert.equal(rl.state.config.locale, 'zh-CN');

    // Invalid inputs rejected cleanly
    assert.equal(applyNovCommand(null, opts).ok, false);
    assert.equal(applyNovCommand({ action: 'exec_shell' }, opts).ok, false);
    assert.equal(applyNovCommand({ action: 'set_module', moduleId: 'unknown', enabled: true }, opts).ok, false);
    assert.equal(applyNovCommand({ action: 'set_module', moduleId: 'guard', enabled: 'yes' }, opts).ok, false);
    assert.equal(applyNovCommand({ action: 'set_module', moduleId: 'guard', enabled: true, extra: 1 }, opts).ok, false);
    assert.equal(applyNovCommand({ action: 'apply_preset', preset: 'ultra' }, opts).ok, false);
    assert.equal(applyNovCommand({ action: 'set_locale', locale: 'xx-FAKE' }, opts).ok, false);
    assert.equal(
      applyNovCommand({ action: 'set_locale', locale: 'en' }, { homeDir, env: {}, explicitDataDir: '${PLUGIN_DATA}' }).ok,
      false
    );

    // Symlink dataDir rejected
    const realTargetDir = path.join(tmp, 'real-target');
    fs.mkdirSync(realTargetDir, { recursive: true });
    const symDataDir = path.join(tmp, 'sym-data');
    fs.symlinkSync(realTargetDir, symDataDir);
    const rSymDir = applyNovCommand(
      { action: 'apply_preset', preset: 'minimal' },
      { homeDir, env: {}, explicitDataDir: symDataDir }
    );
    assert.equal(rSymDir.ok, false);
    assert.equal(fs.existsSync(path.join(realTargetDir, 'config.json')), false);

    // Symlink ancestor under explicitDataDir rejected
    const rSymSub = applyNovCommand(
      { action: 'apply_preset', preset: 'minimal' },
      { homeDir, env: {}, explicitDataDir: path.join(symDataDir, 'nested') }
    );
    assert.equal(rSymSub.ok, false);

    // Symlink config.json rejected and victim file untouched
    const victimFile = path.join(tmp, 'victim.json');
    fs.writeFileSync(victimFile, '{"untouched":true}\n');
    const dirWithSymCfg = path.join(tmp, 'dir-with-sym-cfg');
    fs.mkdirSync(dirWithSymCfg, { recursive: true });
    fs.symlinkSync(victimFile, path.join(dirWithSymCfg, 'config.json'));
    const rSymCfg = applyNovCommand(
      { action: 'set_locale', locale: 'en' },
      { homeDir, env: {}, explicitDataDir: dirWithSymCfg }
    );
    assert.equal(rSymCfg.ok, false);
    assert.equal(fs.readFileSync(victimFile, 'utf8'), '{"untouched":true}\n');
  });
});

test('5. handleBridgePayload dispatches protocol commands and safely tolerates malformed input', () => {
  withTempDir('agy-nov-proto-', (tmp) => {
    const opts = { homeDir: path.join(tmp, 'home'), env: {}, explicitDataDir: path.join(tmp, 'data') };

    const ping = handleBridgePayload(JSON.stringify({ reqId: 'r-ping', type: 'sag:ping' }), opts);
    assert.equal(ping.ok, true);
    assert.equal(ping.reqId, 'r-ping');
    assert.equal(ping.data.pong, true);

    const getRes = handleBridgePayload(JSON.stringify({ reqId: 'r-1', type: 'nov:get_state' }), opts);
    assert.equal(getRes.ok, true);
    assert.equal(getRes.reqId, 'r-1');
    assert.equal(getRes.data.config.preset, 'core');
    assert.equal(fs.existsSync(opts.explicitDataDir), false);

    const setRes = handleBridgePayload(
      JSON.stringify({ reqId: 'r-2', type: 'nov:set_module', payload: { moduleId: 'ops', enabled: true } }),
      opts
    );
    assert.equal(setRes.ok, true);
    assert.equal(setRes.data.config.modules.ops, true);

    const presetRes = handleBridgePayload(
      JSON.stringify({ reqId: 'r-3', type: 'nov:apply_preset', payload: { preset: 'power' } }),
      opts
    );
    assert.equal(presetRes.ok, true);
    assert.equal(presetRes.data.config.preset, 'power');

    const locRes = handleBridgePayload(
      JSON.stringify({ reqId: 'r-4', type: 'nov:set_locale', payload: { locale: 'en' } }),
      opts
    );
    assert.equal(locRes.ok, true);
    assert.equal(locRes.data.config.locale, 'en');

    // Malformed & invalid payloads never throw
    const badJson = handleBridgePayload('{not-valid-json', opts);
    assert.equal(badJson.ok, false);
    assert.equal(badJson.reqId, null);

    const badArr = handleBridgePayload('[1,2,3]', opts);
    assert.equal(badArr.ok, false);

    const badType = handleBridgePayload(JSON.stringify({ reqId: 'r-5', type: 'nov:delete_all' }), opts);
    assert.equal(badType.ok, false);
    assert.equal(badType.reqId, 'r-5');

    const badArg = handleBridgePayload(
      JSON.stringify({ reqId: 'r-6', type: 'nov:set_module', payload: { moduleId: 'evil', enabled: true } }),
      opts
    );
    assert.equal(badArg.ok, false);
    assert.equal(badArg.reqId, 'r-6');

    // Payload attempting to override action must be rejected
    const actionOverride = handleBridgePayload(
      JSON.stringify({
        reqId: 'r-7',
        type: 'nov:get_state',
        payload: { action: 'apply_preset', preset: 'full' },
      }),
      opts
    );
    assert.equal(actionOverride.ok, false);
    assert.equal(actionOverride.reqId, 'r-7');
  });
});

test('6. SagWatchDaemon + HostBridgeSession: Runtime.addBinding, bidirectional response/push, context guard & clean teardown', async () => {
  await withTempDirAsync('agy-nov-daemon-', async (tmp) => {
    const homeDir = path.join(tmp, 'home');
    const novDataDir = path.join(tmp, 'nov-data');
    fs.mkdirSync(homeDir, { recursive: true });

    const { MockWebSocket, instances } = createMockWebSocketClass();
    const events = [];
    let targets = [
      {
        id: 'win-1',
        type: 'page',
        title: 'Antigravity',
        url: 'app://antigravity/index.html',
        webSocketDebuggerUrl: 'ws://127.0.0.1:9222/page/1',
      },
    ];

    const daemon = new SagWatchDaemon({
      intervalMs: 1000,
      maxBackoffMs: 4000,
      enableHostBridge: true,
      WebSocketImpl: MockWebSocket,
      novBridgeOpts: { homeDir, env: {}, explicitDataDir: novDataDir },
      discoverPort: () => 9222,
      listTargets: async () => targets,
      buildInject: () => ({ codeHash: 'hash-bridge', expression: 'INJECT' }),
      evalTarget: async (_wsUrl, expr) => {
        if (expr === PROBE_EXPRESSION) return { state: 'mounted', codeHash: 'hash-bridge' };
        return { ok: true, yielded: false, codeHash: 'hash-bridge' };
      },
      onEvent: (ev) => events.push(ev),
    });

    // Cycle 1: attaches window and opens persistent HostBridgeSession
    const c1 = await daemon.reconcileOnce();
    assert.equal(c1.attached, 1);
    assert.equal(daemon.getState().bridgeSessions, 1);
    assert.equal(instances.length, 1);

    const ws1 = instances[0];
    ws1.simulateOpen();
    assert.equal(ws1.sent[0].method, 'Page.enable');
    assert.equal(ws1.sent[1].method, 'Page.getFrameTree');
    assert.equal(ws1.sent[2].method, 'Runtime.enable');
    assert.equal(
      ws1.sent.some((m) => m.method === 'Runtime.addBinding'),
      false,
      'Must NOT broadcast unscoped Runtime.addBinding before main context is locked'
    );

    // Reply Page.getFrameTree and register main execution context (id=10)
    ws1.replyFrameTree('main-frame', ['child-frame-1']);
    ws1.simulateMessage({
      method: 'Runtime.executionContextCreated',
      params: { context: { id: 10, auxData: { isDefault: true, type: 'default', frameId: 'main-frame' } } },
    });

    const addBindingMsg = ws1.findLastSent('Runtime.addBinding');
    assert.ok(addBindingMsg, 'Expected context-scoped Runtime.addBinding after main context lock');
    assert.deepEqual(addBindingMsg.params, {
      name: HOST_BRIDGE_BINDING_NAME,
      executionContextId: 10,
    });

    const receivedResponses = [];
    const receivedPushes = [];
    const receiverSandbox = {
      window: {
        __agSagBridgeReceiver: {
          onResponse: (obj) => receivedResponses.push(obj),
          onPush: (obj) => receivedPushes.push(obj),
        },
      },
    };

    // Initial cold-start nov:state push is delivered immediately upon main context ready
    const initialPushMsg = ws1.sent.at(-1);
    assert.equal(initialPushMsg.method, 'Runtime.evaluate');
    assert.equal(initialPushMsg.params.contextId, 10);
    vm.runInNewContext(initialPushMsg.params.expression, receiverSandbox);
    assert.equal(receivedPushes.length, 1);
    assert.equal(receivedPushes[0].event, 'nov:state');
    assert.equal(receivedPushes[0].state.config.preset, 'core');
    assert.equal(fs.existsSync(novDataDir), false, 'Initial read-only push must not create dataDir');

    // Non-main context call (id=99) and foreign binding name must be ignored
    const sentBeforeIgnored = ws1.sent.length;
    ws1.simulateMessage({
      method: 'Runtime.bindingCalled',
      params: {
        name: HOST_BRIDGE_BINDING_NAME,
        executionContextId: 99,
        payload: JSON.stringify({ reqId: 'bad-ctx', type: 'nov:apply_preset', payload: { preset: 'full' } }),
      },
    });
    ws1.simulateMessage({
      method: 'Runtime.bindingCalled',
      params: {
        name: '__otherBinding',
        executionContextId: 10,
        payload: JSON.stringify({ reqId: 'bad-name', type: 'nov:get_state' }),
      },
    });
    await new Promise((r) => setImmediate(r));
    assert.equal(ws1.sent.length, sentBeforeIgnored);
    assert.equal(fs.existsSync(path.join(novDataDir, 'config.json')), false);

    // Valid main-context binding call -> writes config & delivers onResponse via Runtime.evaluate
    ws1.simulateMessage({
      method: 'Runtime.bindingCalled',
      params: {
        name: HOST_BRIDGE_BINDING_NAME,
        executionContextId: 10,
        payload: JSON.stringify({
          reqId: 'req-enable-radar',
          type: 'nov:set_module',
          payload: { moduleId: 'radar', enabled: true },
        }),
      },
    });
    await new Promise((r) => setImmediate(r));

    const respMsg = ws1.sent.at(-1);
    assert.equal(respMsg.method, 'Runtime.evaluate');
    assert.equal(respMsg.params.contextId, 10);
    vm.runInNewContext(respMsg.params.expression, receiverSandbox);
    assert.equal(receivedResponses.length, 1);
    assert.equal(receivedResponses[0].reqId, 'req-enable-radar');
    assert.equal(receivedResponses[0].ok, true);
    assert.equal(receivedResponses[0].data.config.modules.radar, true);

    // External modification to config.json (e.g. from agy-NOV sidebar or CLI)
    const extRes = applyNovCommand(
      { action: 'apply_preset', preset: 'local-all' },
      { homeDir, env: {}, explicitDataDir: novDataDir }
    );
    assert.equal(extRes.ok, true);

    // Next daemon cycle detects config signature change and pushes nov:state to renderer
    const c2 = await daemon.reconcileOnce();
    assert.equal(c2.reused, 1);
    const pushMsg = ws1.sent.at(-1);
    assert.equal(pushMsg.method, 'Runtime.evaluate');
    assert.equal(pushMsg.params.contextId, 10);
    vm.runInNewContext(pushMsg.params.expression, receiverSandbox);
    assert.equal(receivedPushes.length, 2);
    assert.equal(receivedPushes[1].event, 'nov:state');
    assert.equal(receivedPushes[1].state.config.preset, 'local-all');
    assert.ok(events.some((e) => e.event === 'nov-state-pushed' && e.preset === 'local-all'));

    // Multi-window peer sync: attach a second window, mutate from win-1, verify win-2 receives immediate onPush
    targets = [
      {
        id: 'win-1',
        type: 'page',
        title: 'Antigravity',
        url: 'app://antigravity/index.html',
        webSocketDebuggerUrl: 'ws://127.0.0.1:9222/page/1',
      },
      {
        id: 'win-2',
        type: 'page',
        title: 'Antigravity #2',
        url: 'app://antigravity/index.html',
        webSocketDebuggerUrl: 'ws://127.0.0.1:9222/page/2',
      },
    ];
    await daemon.reconcileOnce();
    assert.equal(instances.length, 2);
    const ws2 = instances[1];
    ws2.simulateOpen();
    ws2.replyFrameTree('main-frame-2');
    ws2.simulateMessage({
      method: 'Runtime.executionContextCreated',
      params: { context: { id: 20, auxData: { isDefault: true, type: 'default', frameId: 'main-frame-2' } } },
    });

    ws1.simulateMessage({
      method: 'Runtime.bindingCalled',
      params: {
        name: HOST_BRIDGE_BINDING_NAME,
        executionContextId: 10,
        payload: JSON.stringify({
          reqId: 'req-peer-sync',
          type: 'nov:set_locale',
          payload: { locale: 'zh-CN' },
        }),
      },
    });
    await new Promise((r) => setImmediate(r));
    const peerPushes = [];
    const peerSandbox = {
      window: {
        __agSagBridgeReceiver: {
          onPush: (obj) => peerPushes.push(obj),
        },
      },
    };
    const peerPushMsg = ws2.sent.at(-1);
    assert.equal(peerPushMsg.method, 'Runtime.evaluate');
    assert.equal(peerPushMsg.params.contextId, 20);
    vm.runInNewContext(peerPushMsg.params.expression, peerSandbox);
    assert.equal(peerPushes.length, 1);
    assert.equal(peerPushes[0].event, 'nov:state');
    assert.equal(peerPushes[0].state.config.locale, 'zh-CN');

    // Close win-1 -> ws1 closed, ws2 remains open
    targets = [targets[1]];
    await daemon.reconcileOnce();
    assert.equal(ws1.closed, true);
    assert.equal(ws2.closed, false);
    assert.equal(daemon.getState().bridgeSessions, 1);

    // daemon.stop() -> all remaining bridge sockets closed cleanly
    daemon.stop();
    assert.equal(ws2.closed, true);
    assert.equal(daemon.getState().bridgeSessions, 0);

    // Direct HostBridgeSession export smoke check
    assert.equal(typeof HostBridgeSession, 'function');
  });
});

test('7. isPrismDaemonActive checks .daemon.pid read-only and guards symlinks', () => {
  withTempDir('agy-prism-pid-', (tmp) => {
    const homeDir = path.join(tmp, 'home');
    const prismDir = path.join(homeDir, '.gemini', 'config', 'plugins', 'obsidian-prism');
    const pidFile = path.join(prismDir, '.daemon.pid');

    assert.equal(isPrismDaemonActive(homeDir), false);

    fs.mkdirSync(prismDir, { recursive: true });
    fs.writeFileSync(pidFile, `${process.pid}\n`);
    assert.equal(isPrismDaemonActive(homeDir), true);

    fs.writeFileSync(pidFile, 'not-a-pid\n');
    assert.equal(isPrismDaemonActive(homeDir), false);

    fs.writeFileSync(pidFile, '99999999\n');
    assert.equal(isPrismDaemonActive(homeDir), false);

    // Symlinked .daemon.pid must return false
    const realPid = path.join(tmp, 'real.pid');
    fs.writeFileSync(realPid, `${process.pid}\n`);
    fs.unlinkSync(pidFile);
    fs.symlinkSync(realPid, pidFile);
    assert.equal(isPrismDaemonActive(homeDir), false);
  });
});

test('8. sag-cli.mjs nov subcommands (status|enable|disable|preset|locale) & doctor.mjs dual-star output', async () => {
  await withTempDirAsync('agy-nov-cli-', async (tmp) => {
    const homeDir = path.join(tmp, 'home');
    const dataDir = path.join(tmp, 'nov-cli-data');
    fs.mkdirSync(homeDir, { recursive: true });

    const runCli = async (argv) => {
      const stdout = [];
      const stderr = [];
      const res = await runSagCli(argv, {
        stdout: (s) => stdout.push(String(s)),
        rawStdout: (s) => stdout.push(String(s)),
        stderr: (s) => stderr.push(String(s)),
        novBridgeOpts: { homeDir, env: {} },
      });
      return { res, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
    };

    // Help mentions nov command
    const helpRun = await runCli(['help']);
    assert.equal(helpRun.res.exitCode, 0);
    assert.ok(helpRun.stdout.includes('nov <cmd>'));

    // nov status --json --data-dir=... is strictly read-only
    const stRun = await runCli(['nov', 'status', '--json', `--data-dir=${dataDir}`]);
    assert.equal(stRun.res.exitCode, 0);
    const stJson = JSON.parse(stRun.stdout);
    assert.equal(stJson.ok, true);
    assert.equal(stJson.state.config.preset, 'core');
    assert.equal(fs.existsSync(dataDir), false);

    // nov enable turbo
    const enRun = await runCli(['nov', 'enable', 'turbo', '--json', `--data-dir=${dataDir}`]);
    assert.equal(enRun.res.exitCode, 0);
    const enJson = JSON.parse(enRun.stdout);
    assert.equal(enJson.ok, true);
    assert.equal(enJson.state.config.modules.turbo, true);

    // nov disable review
    const disRun = await runCli(['nov', 'disable', 'review', '--json', `--data-dir=${dataDir}`]);
    assert.equal(disRun.res.exitCode, 0);
    const disJson = JSON.parse(disRun.stdout);
    assert.equal(disJson.state.config.modules.review, false);

    // nov preset power
    const prRun = await runCli(['nov', 'preset', 'power', '--json', `--data-dir=${dataDir}`]);
    assert.equal(prRun.res.exitCode, 0);
    const prJson = JSON.parse(prRun.stdout);
    assert.equal(prJson.state.config.preset, 'power');
    assert.equal(prJson.state.enabledToolsCount, 32);

    // nov locale zh-CN
    const locRun = await runCli(['nov', 'locale', 'zh-CN', '--json', `--data-dir=${dataDir}`]);
    assert.equal(locRun.res.exitCode, 0);
    const locJson = JSON.parse(locRun.stdout);
    assert.equal(locJson.state.config.locale, 'zh-CN');

    // Invalid subcommand & invalid moduleId return exitCode 1
    const badMod = await runCli(['nov', 'enable', 'nonexistent', `--data-dir=${dataDir}`]);
    assert.equal(badMod.res.exitCode, 1);
    const badSub = await runCli(['nov', 'unknown-op']);
    assert.equal(badSub.res.exitCode, 1);

    // Doctor enriched dual-star inspection (read-only)
    const novPluginDir = path.join(homeDir, '.gemini', 'config', 'plugins', 'agy-nov');
    fs.mkdirSync(novPluginDir, { recursive: true });
    fs.writeFileSync(path.join(novPluginDir, 'plugin.json'), JSON.stringify({ name: 'agy-nov', version: '2.0.0' }));

    const envWithData = { AGY_NOV_DATA_DIR: dataDir };
    const inspected = inspectNovInstall({ homeDir, env: envWithData });
    assert.equal(inspected.found, true);
    assert.equal(inspected.version, '2.0.0');
    assert.equal(inspected.preset, 'power');
    assert.equal(inspected.enabledCount, 9);
    assert.equal(inspected.totalModules, 13);
    assert.equal(inspected.configPath, path.join(dataDir, 'config.json'));
    assert.equal(inspected.bridgeReady, true);

    const docReport = await runDoctor({
      homeDir,
      env: envWithData,
      nodeInfo: { ok: true, version: 'v22.15.0', major: 22, hasWebSocket: true },
      prismInstall: {
        installed: { found: false, version: null, channel: null, unifiedSettingsHookReady: false },
        devCheckout: { found: false, version: null, channel: null, unifiedSettingsHookReady: false },
      },
      discoverPort: () => null,
    });
    const human = formatDoctorHuman(docReport);
    assert.ok(human.includes('双星协同：agy-NOV v2.0.0 + agy-Sag'));
    assert.ok(human.includes('preset=power'));
    assert.ok(human.includes('9/13 modules'));
    assert.ok(human.includes(path.join(dataDir, 'config.json')));
    assert.ok(human.includes('双星协同桥就绪'));

    // Real CLI subprocess execution against isolated --data-dir
    const cliPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'cli', 'sag-cli.mjs');
    const subOut = execFileSync(process.execPath, [cliPath, 'nov', 'status', '--json', `--data-dir=${dataDir}`], {
      encoding: 'utf8',
    });
    const subParsed = JSON.parse(subOut);
    assert.equal(subParsed.ok, true);
    assert.equal(subParsed.state.config.preset, 'power');
    assert.equal(subParsed.state.config.locale, 'zh-CN');
  });
});

test('9. [H-1] HostBridgeSession fails closed when unready, blocks child iframe preemption, switches on authoritative Page.getFrameTree & re-binds on navigation', async () => {
  await withTempDirAsync('agy-nov-h1-', async (tmp) => {
    const novDataDir = path.join(tmp, 'nov-data');
    const opts = { homeDir: path.join(tmp, 'home'), env: {}, explicitDataDir: novDataDir };
    const { MockWebSocket, instances } = createMockWebSocketClass();
    const events = [];
    const payloadCalls = [];

    const session = new HostBridgeSession({
      targetId: 'page-target-1',
      wsUrl: 'ws://127.0.0.1:9222/page/h1',
      WebSocketImpl: MockWebSocket,
      onPayload: (raw) => {
        payloadCalls.push(raw);
        return handleBridgePayload(raw, opts);
      },
      onEvent: (name, data) => events.push({ name, ...data }),
    });
    session.open();
    const ws = instances[0];
    ws.simulateOpen();

    // (a) Fail-closed before mainContextId is known: bindingCalled must be rejected with main-context-unready
    ws.simulateMessage({
      method: 'Runtime.bindingCalled',
      params: {
        name: HOST_BRIDGE_BINDING_NAME,
        executionContextId: 1,
        payload: JSON.stringify({ reqId: 'early-1', type: 'nov:apply_preset', payload: { preset: 'full' } }),
      },
    });
    ws.simulateMessage({
      method: 'Runtime.bindingCalled',
      params: {
        name: HOST_BRIDGE_BINDING_NAME,
        payload: JSON.stringify({ reqId: 'early-no-ctx', type: 'nov:apply_preset', payload: { preset: 'full' } }),
      },
    });
    await new Promise((r) => setImmediate(r));
    assert.equal(payloadCalls.length, 0);
    assert.equal(fs.existsSync(novDataDir), false);
    assert.equal(
      events.filter((e) => e.name === 'bridge-ignored' && e.reason === 'main-context-unready').length,
      2
    );

    // (b) Malicious child iframe fires executionContextCreated BEFORE Page.getFrameTree replies
    ws.simulateMessage({
      method: 'Runtime.executionContextCreated',
      params: { context: { id: 5, auxData: { isDefault: true, type: 'default', frameId: 'child-iframe-evil' } } },
    });
    // Real top-level frame also fires executionContextCreated before Page.getFrameTree replies
    ws.simulateMessage({
      method: 'Runtime.executionContextCreated',
      params: { context: { id: 10, auxData: { isDefault: true, type: 'default', frameId: 'top-frame-real' } } },
    });
    assert.equal(session.mainContextId, null, 'Neither unverified frame should preempt before Page.getFrameTree');
    assert.equal(
      ws.sent.some((m) => m.method === 'Runtime.addBinding'),
      false,
      'Must NOT bind to child iframe before Page.getFrameTree resolves'
    );

    // Child iframe tries to call binding while Page.getFrameTree is still in-flight -> fail-closed
    ws.simulateMessage({
      method: 'Runtime.bindingCalled',
      params: {
        name: HOST_BRIDGE_BINDING_NAME,
        executionContextId: 5,
        payload: JSON.stringify({ reqId: 'evil-early', type: 'nov:apply_preset', payload: { preset: 'full' } }),
      },
    });
    await new Promise((r) => setImmediate(r));
    assert.equal(payloadCalls.length, 0);

    // (c) Page.getFrameTree resolves -> selects cached ctxId=10 strictly matching top-frame-real
    ws.replyFrameTree('top-frame-real', ['child-iframe-evil']);
    assert.equal(session.mainFrameId, 'top-frame-real');
    assert.equal(session.mainContextId, 10);
    const binding10 = ws.findLastSent('Runtime.addBinding');
    assert.deepEqual(binding10?.params, { name: HOST_BRIDGE_BINDING_NAME, executionContextId: 10 });

    // Child iframe call after lock -> rejected with non-main-context, never touches disk
    ws.simulateMessage({
      method: 'Runtime.bindingCalled',
      params: {
        name: HOST_BRIDGE_BINDING_NAME,
        executionContextId: 5,
        payload: JSON.stringify({ reqId: 'evil-after', type: 'nov:apply_preset', payload: { preset: 'full' } }),
      },
    });
    // Missing executionContextId after lock -> rejected with non-main-context
    ws.simulateMessage({
      method: 'Runtime.bindingCalled',
      params: {
        name: HOST_BRIDGE_BINDING_NAME,
        payload: JSON.stringify({ reqId: 'missing-ctx', type: 'nov:apply_preset', payload: { preset: 'full' } }),
      },
    });
    await new Promise((r) => setImmediate(r));
    assert.equal(payloadCalls.length, 0);
    assert.equal(fs.existsSync(novDataDir), false);
    assert.equal(
      events.filter((e) => e.name === 'bridge-ignored' && e.reason === 'non-main-context').length,
      2
    );

    // Later child iframe context creation must NOT steal mainContextId
    ws.simulateMessage({
      method: 'Runtime.executionContextCreated',
      params: { context: { id: 12, auxData: { isDefault: true, type: 'default', frameId: 'child-iframe-2' } } },
    });
    assert.equal(session.mainContextId, 10);

    // (d) Main frame navigation clears contexts -> fail-closed until new main context id=22 arrives and re-binds
    ws.simulateMessage({ method: 'Runtime.executionContextsCleared', params: {} });
    assert.equal(session.mainContextId, null);
    ws.simulateMessage({
      method: 'Runtime.bindingCalled',
      params: {
        name: HOST_BRIDGE_BINDING_NAME,
        executionContextId: 10,
        payload: JSON.stringify({ reqId: 'stale-ctx', type: 'nov:get_state' }),
      },
    });
    await new Promise((r) => setImmediate(r));
    assert.equal(payloadCalls.length, 0);

    ws.replyFrameTree('top-frame-real', ['child-iframe-evil']);
    ws.simulateMessage({
      method: 'Runtime.executionContextCreated',
      params: { context: { id: 22, auxData: { isDefault: true, type: 'default', frameId: 'top-frame-real' } } },
    });
    assert.equal(session.mainContextId, 22);
    assert.deepEqual(ws.findLastSent('Runtime.addBinding')?.params, {
      name: HOST_BRIDGE_BINDING_NAME,
      executionContextId: 22,
    });

    // Authoritative override test: even if a provisional context matched targetId, Page.getFrameTree overrides it!
    const { MockWebSocket: MockWs2, instances: inst2 } = createMockWebSocketClass();
    const overrideCalls = [];
    const sess2 = new HostBridgeSession({
      targetId: 'provisional-frame',
      wsUrl: 'ws://127.0.0.1:9222/page/h1-override',
      WebSocketImpl: MockWs2,
      onPayload: (raw) => {
        overrideCalls.push(raw);
        return { reqId: 'ok', ok: true };
      },
    });
    sess2.open();
    const wsOverride = inst2[0];
    wsOverride.simulateOpen();
    wsOverride.simulateMessage({
      method: 'Runtime.executionContextCreated',
      params: { context: { id: 3, auxData: { isDefault: true, type: 'default', frameId: 'provisional-frame' } } },
    });
    wsOverride.simulateMessage({
      method: 'Runtime.executionContextCreated',
      params: { context: { id: 44, auxData: { isDefault: true, type: 'default', frameId: 'authoritative-top' } } },
    });
    // Now Page.getFrameTree declares authoritative-top as the real top frame and provisional-frame as a child
    wsOverride.replyFrameTree('authoritative-top', ['provisional-frame']);
    assert.equal(sess2.mainFrameId, 'authoritative-top');
    assert.equal(sess2.mainContextId, 44);
    assert.deepEqual(wsOverride.findLastSent('Runtime.addBinding')?.params, {
      name: HOST_BRIDGE_BINDING_NAME,
      executionContextId: 44,
    });
    // Old provisional context id=3 must now be rejected
    wsOverride.simulateMessage({
      method: 'Runtime.bindingCalled',
      params: {
        name: HOST_BRIDGE_BINDING_NAME,
        executionContextId: 3,
        payload: JSON.stringify({ reqId: 'old-prov', type: 'sag:ping' }),
      },
    });
    await new Promise((r) => setImmediate(r));
    assert.equal(overrideCalls.length, 0);

    // Valid call on authoritative id=44 succeeds
    wsOverride.simulateMessage({
      method: 'Runtime.bindingCalled',
      params: {
        name: HOST_BRIDGE_BINDING_NAME,
        executionContextId: 44,
        payload: JSON.stringify({ reqId: 'auth-ok', type: 'sag:ping' }),
      },
    });
    await new Promise((r) => setImmediate(r));
    assert.equal(overrideCalls.length, 1);

    // Fail-closed test: when Page.getFrameTree returns an error, NEVER fall back to unverified default contexts;
    // keep unbound until a subsequent Page.getFrameTree re-probe succeeds authoritatively.
    const { MockWebSocket: MockWs3, instances: inst3 } = createMockWebSocketClass();
    const fbEvents = [];
    const sess3 = new HostBridgeSession({
      targetId: 'fallback-page',
      wsUrl: 'ws://127.0.0.1:9222/page/h1-fallback',
      WebSocketImpl: MockWs3,
      onEvent: (name, data) => fbEvents.push({ name, ...data }),
    });
    sess3.open();
    const wsFb = inst3[0];
    wsFb.simulateOpen();
    wsFb.simulateMessage({
      method: 'Page.frameAttached',
      params: { frameId: 'fb-child', parentFrameId: 'fb-top' },
    });
    wsFb.simulateMessage({
      method: 'Runtime.executionContextCreated',
      params: { context: { id: 60, auxData: { isDefault: true, type: 'default', frameId: 'fb-child' } } },
    });
    wsFb.simulateMessage({
      method: 'Runtime.executionContextCreated',
      params: { context: { id: 61, auxData: { isDefault: true, type: 'default', frameId: 'fb-top' } } },
    });
    const fbReq = wsFb.findLastSent('Page.getFrameTree');
    wsFb.simulateMessage({ id: fbReq.id, error: { code: -32601, message: 'Method not found' } });
    assert.equal(sess3._frameTreeResolved, false);
    assert.equal(sess3.mainFrameId, null);
    assert.equal(sess3.mainContextId, null);
    assert.equal(wsFb.findLastSent('Runtime.addBinding'), null);
    assert.ok(fbEvents.some((e) => e.name === 'bridge-frame-tree-failed'));

    // Re-probing via ensureBinding() succeeds once Page.getFrameTree returns authoritative top frame
    assert.equal(sess3.ensureBinding(), false);
    wsFb.replyFrameTree('fb-top', ['fb-child']);
    assert.equal(sess3._frameTreeResolved, true);
    assert.equal(sess3.mainFrameId, 'fb-top');
    assert.equal(sess3.mainContextId, 61);
    assert.deepEqual(wsFb.findLastSent('Runtime.addBinding')?.params, {
      name: HOST_BRIDGE_BINDING_NAME,
      executionContextId: 61,
    });

    session.close();
    sess2.close();
    sess3.close();
  });
});

test('10. [H-2] Cold-start inject-before-bridge & reload re-inject actively push initial nov:state with contextId and sync lastNovSignature', async () => {
  await withTempDirAsync('agy-nov-h2-', async (tmp) => {
    const homeDir = path.join(tmp, 'home');
    const novDataDir = path.join(tmp, 'nov-data');
    fs.mkdirSync(homeDir, { recursive: true });

    // Pre-populate an existing agy-NOV config (no external mutation will happen after daemon starts)
    const initWrite = applyNovCommand(
      { action: 'apply_preset', preset: 'power' },
      { homeDir, env: {}, explicitDataDir: novDataDir }
    );
    assert.equal(initWrite.ok, true);

    const { MockWebSocket, instances } = createMockWebSocketClass();
    let mounted = false;
    const order = [];
    const daemon = new SagWatchDaemon({
      intervalMs: 1000,
      maxBackoffMs: 4000,
      enableHostBridge: true,
      WebSocketImpl: MockWebSocket,
      novBridgeOpts: { homeDir, env: {}, explicitDataDir: novDataDir },
      discoverPort: () => 9222,
      listTargets: async () => [
        {
          id: 'cold-win-1',
          type: 'page',
          title: 'Antigravity',
          url: 'app://antigravity/index.html',
          webSocketDebuggerUrl: 'ws://127.0.0.1:9222/page/cold',
        },
      ],
      buildInject: () => ({ codeHash: 'hash-cold', expression: 'INJECT_COLD' }),
      evalTarget: async (_wsUrl, expr) => {
        if (expr === PROBE_EXPRESSION) {
          return mounted ? { state: 'mounted', codeHash: 'hash-cold' } : { state: 'missing' };
        }
        order.push('injected');
        mounted = true;
        return { ok: true, yielded: false, codeHash: 'hash-cold' };
      },
    });

    // Step 1: inject happens BEFORE bridge WebSocket opens
    const c1 = await daemon.reconcileOnce();
    assert.equal(c1.attached, 1);
    assert.deepEqual(order, ['injected']);
    assert.equal(instances.length, 1);

    const ws = instances[0];
    const pushes = [];
    const sandbox = {
      window: {
        __agSagBridgeReceiver: {
          onPush: (obj) => pushes.push(obj),
        },
      },
    };

    // Step 2: Bridge opens and main context locks -> automatically pushes initial nov:state without any config.json edit
    ws.simulateOpen();
    ws.replyFrameTree('cold-top-frame');
    ws.simulateMessage({
      method: 'Runtime.executionContextCreated',
      params: { context: { id: 33, auxData: { isDefault: true, type: 'default', frameId: 'cold-top-frame' } } },
    });

    const evalMsgs = ws.sent.filter((m) => m.method === 'Runtime.evaluate');
    assert.equal(evalMsgs.length, 1, 'Should actively push initial nov:state once on main context ready');
    assert.equal(evalMsgs[0].params.contextId, 33, 'Initial push must target mainContextId');
    vm.runInNewContext(evalMsgs[0].params.expression, sandbox);
    assert.equal(pushes.length, 1);
    assert.equal(pushes[0].event, 'nov:state');
    assert.equal(pushes[0].state.config.preset, 'power');

    // Verify lastNovSignature is synchronized so steady-state cycle does NOT redundantly push again
    const expectedSig = daemon._computeNovSignature(readNovState({ homeDir, env: {}, explicitDataDir: novDataDir }));
    assert.equal(daemon.lastNovSignature, expectedSig);
    const evalCountBeforeSteady = ws.sent.filter((m) => m.method === 'Runtime.evaluate').length;
    await daemon.reconcileOnce();
    assert.equal(
      ws.sent.filter((m) => m.method === 'Runtime.evaluate').length,
      evalCountBeforeSteady,
      'Steady-state cycle with unchanged config must not re-push'
    );

    // Step 3: Simulate reload where script was wiped (probe returns missing) and existing ready session is reused (reInjected=true)
    mounted = false;
    const cReload = await daemon.reconcileOnce();
    assert.equal(cReload.attached, 1);
    const evalMsgsAfterReload = ws.sent.filter((m) => m.method === 'Runtime.evaluate');
    assert.equal(evalMsgsAfterReload.length, evalCountBeforeSteady + 1, 'Re-injection must actively re-push nov:state');
    assert.equal(evalMsgsAfterReload.at(-1).params.contextId, 33);
    vm.runInNewContext(evalMsgsAfterReload.at(-1).params.expression, sandbox);
    assert.equal(pushes.length, 2);
    assert.equal(pushes[1].state.config.preset, 'power');

    // Step 4: Verify session.evaluate() directly includes contextId: mainContextId
    const sess = daemon.bridgeSessions.get('cold-win-1');
    assert.equal(sess.evaluate('1 + 1'), true);
    assert.equal(ws.sent.at(-1).params.contextId, 33);

    daemon.stop();
  });
});

test('11. [M-1] All 9 agy-NOV locales are accepted and preserved across module toggles without reverting to auto', () => {
  withTempDir('agy-nov-m1-', (tmp) => {
    const homeDir = path.join(tmp, 'home');
    const dataDir = path.join(tmp, 'nov-data');
    fs.mkdirSync(homeDir, { recursive: true });
    const opts = { homeDir, env: {}, explicitDataDir: dataDir };

    // Verify all 9 locales can be set cleanly
    for (const loc of ['auto', 'en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'es', 'fr', 'de']) {
      const r = applyNovCommand({ action: 'set_locale', locale: loc }, opts);
      assert.equal(r.ok, true, `Expected locale "${loc}" to be accepted`);
      assert.equal(r.state.config.locale, loc);
    }

    // Invalid locale rejected
    assert.equal(applyNovCommand({ action: 'set_locale', locale: 'xx-FAKE' }, opts).ok, false);

    // Regression: setting locale='ja' then toggling canvas must preserve 'ja'
    assert.equal(applyNovCommand({ action: 'set_locale', locale: 'ja' }, opts).ok, true);
    const afterJaCanvas = applyNovCommand({ action: 'set_module', moduleId: 'canvas', enabled: true }, opts);
    assert.equal(afterJaCanvas.ok, true);
    assert.equal(afterJaCanvas.state.config.modules.canvas, true);
    assert.equal(afterJaCanvas.state.config.locale, 'ja', 'Locale "ja" must be preserved when toggling canvas');

    // Regression: setting locale='zh-TW' then toggling canvas off must preserve 'zh-TW'
    assert.equal(applyNovCommand({ action: 'set_locale', locale: 'zh-TW' }, opts).ok, true);
    const afterTwCanvas = applyNovCommand({ action: 'set_module', moduleId: 'canvas', enabled: false }, opts);
    assert.equal(afterTwCanvas.ok, true);
    assert.equal(afterTwCanvas.state.config.modules.canvas, false);
    assert.equal(afterTwCanvas.state.config.locale, 'zh-TW', 'Locale "zh-TW" must be preserved when toggling canvas');
  });
});

test('12. [M-2] Oversized >64KB payload is blocked BEFORE JSON.parse, and stop() during in-flight reconcileOnce prevents orphan WebSockets', async () => {
  await withTempDirAsync('agy-nov-m2-', async (tmp) => {
    const homeDir = path.join(tmp, 'home');
    const novDataDir = path.join(tmp, 'nov-data');
    fs.mkdirSync(homeDir, { recursive: true });

    // (a) Oversized >64KB payload must be rejected before ANY JSON.parse call
    const daemonParseCheck = new SagWatchDaemon({
      enableHostBridge: true,
      novBridgeOpts: { homeDir, env: {}, explicitDataDir: novDataDir },
    });
    const oversizedPayload = JSON.stringify({
      reqId: 'dos-1',
      type: 'nov:set_module',
      payload: { moduleId: 'canvas', enabled: true, pad: 'A'.repeat(MAX_BRIDGE_PAYLOAD_BYTES + 1024) },
    });
    assert.ok(Buffer.byteLength(oversizedPayload, 'utf8') > MAX_BRIDGE_PAYLOAD_BYTES);

    const origJsonParse = JSON.parse;
    let jsonParseCalls = 0;
    JSON.parse = (...args) => {
      jsonParseCalls += 1;
      return origJsonParse(...args);
    };
    let oversizedRes;
    try {
      oversizedRes = daemonParseCheck._handleHostBridgePayload(oversizedPayload, { targetId: 'win-1' });
    } finally {
      JSON.parse = origJsonParse;
    }
    assert.equal(oversizedRes.ok, false);
    assert.match(oversizedRes.error, /exceeds maximum size limit/i);
    assert.equal(jsonParseCalls, 0, 'JSON.parse must NEVER be invoked on oversized (>64KB) payloads');
    assert.equal(fs.existsSync(novDataDir), false);

    // Multi-byte UTF-8 payload with string length < 64KB but byteLength > 64KB must also block before JSON.parse
    const multibyteOversized = JSON.stringify({
      reqId: 'dos-utf8',
      type: 'nov:set_module',
      payload: { moduleId: 'canvas', enabled: true, pad: '中'.repeat(25000) },
    });
    assert.ok(multibyteOversized.length < MAX_BRIDGE_PAYLOAD_BYTES);
    assert.ok(Buffer.byteLength(multibyteOversized, 'utf8') > MAX_BRIDGE_PAYLOAD_BYTES);
    jsonParseCalls = 0;
    JSON.parse = (...args) => {
      jsonParseCalls += 1;
      return origJsonParse(...args);
    };
    let mbRes;
    try {
      mbRes = daemonParseCheck._handleHostBridgePayload(multibyteOversized, { targetId: 'win-1' });
    } finally {
      JSON.parse = origJsonParse;
    }
    assert.equal(mbRes.ok, false);
    assert.match(mbRes.error, /exceeds maximum size limit/i);
    assert.equal(jsonParseCalls, 0, 'JSON.parse must NEVER be invoked on multi-byte >64KB UTF-8 payloads');

    // (b) stop() called while reconcileOnce() is suspended at await evalTarget -> zero orphan WebSockets
    const { MockWebSocket, instances } = createMockWebSocketClass();
    let resolveEval;
    const evalGate = new Promise((r) => {
      resolveEval = r;
    });

    const daemonRace = new SagWatchDaemon({
      intervalMs: 1000,
      maxBackoffMs: 4000,
      enableHostBridge: true,
      WebSocketImpl: MockWebSocket,
      novBridgeOpts: { homeDir, env: {}, explicitDataDir: novDataDir },
      discoverPort: () => 9222,
      listTargets: async () => [
        {
          id: 'race-win-1',
          type: 'page',
          title: 'Antigravity',
          url: 'app://antigravity/index.html',
          webSocketDebuggerUrl: 'ws://127.0.0.1:9222/page/race',
        },
      ],
      buildInject: () => ({ codeHash: 'hash-race', expression: 'INJECT_RACE' }),
      evalTarget: async () => {
        await evalGate;
        return { ok: true, yielded: false, codeHash: 'hash-race' };
      },
    });

    const inFlight = daemonRace.reconcileOnce();
    // Wait a microtask so reconcileOnce enters await evalTarget
    await new Promise((r) => setImmediate(r));
    daemonRace.stop();
    resolveEval();

    const raceSummary = await inFlight;
    assert.equal(raceSummary.status, 'stopped');
    assert.equal(instances.length, 0, 'stop() during in-flight reconcileOnce must prevent creating orphan WebSockets');
    assert.equal(daemonRace.getState().bridgeSessions, 0);

    // Calling _ensureBridgeSession directly after stop() is also blocked
    assert.equal(daemonRace._ensureBridgeSession('race-win-1', 'ws://127.0.0.1:9222/page/race', true), null);
    assert.equal(instances.length, 0);

    // Calling stop() while listTargets is pending also prevents orphan WebSockets
    let resolveList;
    const listGate = new Promise((r) => {
      resolveList = r;
    });
    const { MockWebSocket: MockWsList, instances: listInstances } = createMockWebSocketClass();
    const daemonListRace = new SagWatchDaemon({
      enableHostBridge: true,
      WebSocketImpl: MockWsList,
      discoverPort: () => 9222,
      listTargets: async () => {
        await listGate;
        return [
          {
            id: 'race-win-2',
            type: 'page',
            title: 'Antigravity',
            url: 'app://antigravity/index.html',
            webSocketDebuggerUrl: 'ws://127.0.0.1:9222/page/race2',
          },
        ];
      },
      evalTarget: async () => ({ ok: true, yielded: false, codeHash: 'h' }),
    });
    const listInFlight = daemonListRace.reconcileOnce();
    await new Promise((r) => setImmediate(r));
    daemonListRace.stop();
    resolveList();
    const listSummary = await listInFlight;
    assert.equal(listSummary.status, 'stopped');
    assert.equal(listInstances.length, 0);
  });
});

test('13. [L-1] Config signature includes inode (detects same-mtime/same-size atomic replace) & typeToAction blocks prototype keys', () => {
  withTempDir('agy-nov-l1-', (tmp) => {
    const homeDir = path.join(tmp, 'home');
    const dataDir = path.join(tmp, 'nov-data');
    fs.mkdirSync(homeDir, { recursive: true });
    fs.mkdirSync(dataDir, { recursive: true });
    const opts = { homeDir, env: {}, explicitDataDir: dataDir };

    // Write two equal-length configs with identical pinned mtimeMs via atomic rename -> inode MUST change signature
    const cfgPath = path.join(dataDir, 'config.json');
    const fixedTime = new Date('2026-08-01T00:00:00.000Z');

    const payloadA = JSON.stringify({
      schemaVersion: 1,
      preset: 'custom',
      modules: { ...NOV_PRESETS.core.modules, ops: true, mem: false },
      defaultTab: 'review',
      locale: 'en',
      updatedAt: '2026-08-01T00:00:00.000Z',
    });
    const payloadB = JSON.stringify({
      schemaVersion: 1,
      preset: 'custom',
      modules: { ...NOV_PRESETS.core.modules, ops: false, mem: true },
      defaultTab: 'review',
      locale: 'en',
      updatedAt: '2026-08-01T00:00:00.000Z',
    });
    assert.equal(Buffer.byteLength(payloadA), Buffer.byteLength(payloadB));

    const tmpA = `${cfgPath}.tmp.a`;
    fs.writeFileSync(tmpA, payloadA);
    fs.utimesSync(tmpA, fixedTime, fixedTime);
    fs.renameSync(tmpA, cfgPath);

    const stA = readNovState(opts);
    const statA = fs.statSync(cfgPath);
    assert.equal(stA.signature, `${statA.ino}:${statA.mtimeMs}:${statA.size}`);

    // Atomic replacement via new temp file with identical byte size & mtimeMs
    const tmpB = `${cfgPath}.tmp.b`;
    fs.writeFileSync(tmpB, payloadB);
    fs.utimesSync(tmpB, fixedTime, fixedTime);
    fs.renameSync(tmpB, cfgPath);

    const stB = readNovState(opts);
    const statB = fs.statSync(cfgPath);
    assert.equal(stB.signature, `${statB.ino}:${statB.mtimeMs}:${statB.size}`);
    if (statA.ino !== statB.ino) {
      assert.notEqual(stA.signature, stB.signature, 'Inode change must invalidate config signature even at same mtime/size');
    }

    // Prototype chain keys in typeToAction must all return "Unsupported bridge message type"
    for (const protoKey of ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf']) {
      const res = handleBridgePayload(JSON.stringify({ reqId: `proto-${protoKey}`, type: protoKey }), opts);
      assert.equal(res.ok, false);
      assert.equal(res.reqId, `proto-${protoKey}`);
      assert.match(res.error, /Unsupported bridge message type/);
    }
  });
});

test('14. [L-3] serializeInlineJson handles undefined safely and escapes U+2028/U+2029 without throwing', () => {
  assert.equal(serializeInlineJson(undefined), 'null');
  assert.equal(serializeInlineJson(() => {}), 'null');
  assert.equal(serializeInlineJson({ text: 'a\u2028b\u2029c' }), '{"text":"a\\u2028b\\u2029c"}');

  // HostBridgeSession.sendResponse(undefined) must never throw
  const { MockWebSocket, instances } = createMockWebSocketClass();
  const sess = new HostBridgeSession({
    targetId: 'l3-win',
    wsUrl: 'ws://127.0.0.1:9222/page/l3',
    WebSocketImpl: MockWebSocket,
  });
  sess.open();
  const ws = instances[0];
  ws.simulateOpen();
  ws.replyFrameTree('l3-top');
  ws.simulateMessage({
    method: 'Runtime.executionContextCreated',
    params: { context: { id: 7, auxData: { isDefault: true, type: 'default', frameId: 'l3-top' } } },
  });

  assert.equal(sess.sendResponse(undefined), true);
  const evalMsg = ws.sent.at(-1);
  assert.equal(evalMsg.method, 'Runtime.evaluate');
  assert.equal(evalMsg.params.contextId, 7);
  let captured = 'unset';
  vm.runInNewContext(evalMsg.params.expression, {
    window: { __agSagBridgeReceiver: { onResponse: (v) => { captured = v; } } },
  });
  assert.equal(captured, null);
  sess.close();
});
