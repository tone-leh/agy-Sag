import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseDoctorArgs,
  checkNodeRuntime,
  inspectPrismInstall,
  buildRemediationHints,
  runDoctor,
  formatDoctorHuman,
} from '../cli/doctor.mjs';

test('Doctor CLI: parses arguments and validates Node >= 22 runtime check', () => {
  assert.deepEqual(parseDoctorArgs(['--json', '--port=61743']), { port: 61743, prismDir: null, json: true });
  assert.throws(() => parseDoctorArgs(['--port=99999']));

  assert.equal(checkNodeRuntime('v22.14.0', true).ok, true);
  assert.equal(checkNodeRuntime('v20.11.0', true).ok, false);
  assert.equal(checkNodeRuntime('v22.0.0', false).ok, false);
});

test('Doctor CLI: inspects installed Obsidian Prism beta & unified settings hook from mock filesystem', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-sg-doc-'));
  try {
    const installedDir = path.join(tmp, '.gemini', 'config', 'plugins', 'obsidian-prism');
    fs.mkdirSync(installedDir, { recursive: true });
    fs.writeFileSync(
      path.join(installedDir, 'package.json'),
      JSON.stringify({ name: 'obsidian-prism', version: '1.0.8-beta.3' })
    );
    fs.writeFileSync(
      path.join(installedDir, 'settings-panel.js'),
      "const SETTINGS_SEC_ID = 'ag-cs-settings-sec'; sa(el, 'data-ag-cs-group', 'modules');"
    );

    const res = inspectPrismInstall({ homeDir: tmp, repoRoot: path.join(tmp, 'agy-session-guard'), env: {} });
    assert.equal(res.installed.found, true);
    assert.equal(res.installed.version, '1.0.8-beta.3');
    assert.equal(res.installed.channel, 'beta');
    assert.equal(res.installed.unifiedSettingsHookReady, true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('Doctor CLI: reports healthy Obsidian Prism + Session Guard coexistence and formats readable summary', async () => {
  const report = await runDoctor({
    platform: 'darwin',
    nodeInfo: { ok: true, version: 'v22.15.0', major: 22, hasWebSocket: true },
    prismInstall: {
      installed: { found: true, version: '1.0.8-beta.3', channel: 'beta', unifiedSettingsHookReady: true },
      devCheckout: { found: false, version: null, channel: null, unifiedSettingsHookReady: false },
    },
    discoverPort: () => 61743,
    listTargets: async () => [
      { type: 'page', title: 'Antigravity — Workspace', url: 'https://127.0.0.1:61747/c/1111', webSocketDebuggerUrl: 'ws://127.0.0.1:61743/devtools/page/1' },
      { type: 'page', title: 'DevTools', url: 'devtools://devtools/bundled/inspector.html', webSocketDebuggerUrl: 'ws://127.0.0.1:61743/devtools/page/2' },
    ],
    evalTarget: async () => ({
      lang: 'zh-CN',
      theme: 'light',
      sessionGuard: {
        state: 'mounted',
        owner: 'standalone',
        version: '0.3.0',
        codeHash: 'abcd1234',
        threshold: 80,
        mode: 'confirm',
        prismSettingsEmbedded: true,
        bookmarkCount: 3,
        draftCount: 1,
      },
      obsidianPrism: {
        active: true,
        versionHint: '1.0.8-beta.3',
        settingsPanelMounted: true,
        modulesGroupFound: true,
        metricsBridgePresent: true,
        pulseBarPresent: true,
      },
      context: { usedPct: 62, source: 'host-bridge' },
    }),
  });

  assert.equal(report.ok, true);
  assert.equal(report.cdp.hostWindowCount, 1);
  assert.equal(report.windows[0].probe.sessionGuard.prismSettingsEmbedded, true);

  const text = formatDoctorHuman(report);
  assert.ok(text.includes('Obsidian Prism (installed): v1.0.8-beta.3 [beta]'));
  assert.ok(text.includes('settings unified'));
  assert.ok(text.includes('drafts: 1'));
  assert.ok(text.includes('Modules tab'));
});

test('Doctor CLI: emits platform-specific remediation hints when CDP port is missing', () => {
  const hintsMac = buildRemediationHints({ node: { ok: true }, cdp: { port: null, reachable: false }, windows: [] }, 'darwin');
  assert.ok(hintsMac.some((h) => h.includes('open -a Antigravity --args --remote-debugging-port=0')));

  const hintsWin = buildRemediationHints({ node: { ok: true }, cdp: { port: null, reachable: false }, windows: [] }, 'win32');
  assert.ok(hintsWin.some((h) => h.includes('--remote-debugging-port=0')));
});
