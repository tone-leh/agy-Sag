#!/usr/bin/env node
/**
 * Antigravity Session Guard — Zero-Dependency Environment & Prism Coexistence Doctor CLI
 *
 * 100% Read-Only Diagnostics:
 *   1. Validates Node.js >= 22 + native WebSocket support.
 *   2. Checks Obsidian Prism installation / local beta checkout & unified-settings hooks.
 *   3. Discovers Antigravity CDP port across macOS / Windows / Linux and probes host windows.
 *   4. Reports Session Guard mount/yield status, Prism coexistence, context %, bookmarks & drafts.
 *   5. Prints platform-specific remediation steps when anything needs setup.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverCdpPort, evalViaCdp, httpGetJson, isAntigravityHostTarget } from './cdp-attach.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

export const DOCTOR_PROBE_EXPRESSION = `(() => {
  const html = document.documentElement;
  const settingsSec = document.getElementById('ag-cs-settings-sec');
  const modulesGroup = settingsSec?.querySelector?.('[data-ag-cs-group="modules"]') || null;
  const sgApi = window.__agSessionGuard || null;
  const sgState = sgApi?.getDebugState?.() || null;
  const owner = window.__agSessionGuardOwner || null;

  let versionHint = '';
  try {
    const aboutTxt = settingsSec?.querySelector?.('[data-ag-cs-about="1"]')?.textContent || '';
    const m = aboutTxt.match(/Obsidian\\s+Prism\\s+v([0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z.-]+)?)/i);
    if (m && m[1]) versionHint = m[1];
  } catch {}

  let bookmarkCount = 0;
  let draftCount = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || '';
      if (k.startsWith('agSessionGuard.bookmarks.v1:')) {
        const arr = JSON.parse(localStorage.getItem(k) || '[]');
        if (Array.isArray(arr)) bookmarkCount += arr.length;
      } else if (k.startsWith('agSessionGuard.draft.v1:')) {
        draftCount += 1;
      }
    }
  } catch {}

  let ctxPct = sgState?.compactGuard?.lastSnapshot?.usedPct ?? null;
  let ctxSource = sgState?.compactGuard?.lastSnapshot?.source || '';
  if (ctxPct === null) {
    try {
      const snap = window.__agPrismMetricsBridge?.getLatestSnapshot?.();
      const frac = snap?.speed?.context?.usedFraction ?? snap?.context?.usedFraction;
      if (typeof frac === 'number' && Number.isFinite(frac)) {
        ctxPct = Math.round(Math.max(0, frac) * 100);
        ctxSource = 'prism-bridge';
      }
    } catch {}
  }

  const state =
    owner && owner !== 'standalone'
      ? 'yielded'
      : sgState && !sgState.destroyed
        ? 'mounted'
        : 'missing';

  return {
    lang: html?.getAttribute?.('data-ag-cs-lang') || html?.getAttribute?.('lang') || navigator.language || '',
    theme: html?.getAttribute?.('data-ag-cs-theme') || '',
    sessionGuard: {
      state,
      owner: owner || (state === 'mounted' ? 'standalone' : null),
      version: sgApi?.version || null,
      codeHash: sgApi?.__agSgHash || null,
      threshold: sgState?.compactGuard?.config?.compactThreshold ?? null,
      mode: sgState?.compactGuard?.config?.compactTriggerMode ?? null,
      prismSettingsEmbedded: Boolean(sgState?.prismBridge?.embedded),
      bookmarkCount,
      draftCount,
    },
    obsidianPrism: {
      active: Boolean(
        html?.hasAttribute?.('data-ag-cs-style') ||
          settingsSec ||
          window.__agPrismMetricsBridge ||
          document.querySelector('#ag-prism-pulse-bar, [data-ag-prism-pulse-bar="true"]')
      ),
      versionHint: versionHint || null,
      settingsPanelMounted: Boolean(settingsSec),
      modulesGroupFound: Boolean(modulesGroup),
      metricsBridgePresent: Boolean(window.__agPrismMetricsBridge),
      pulseBarPresent: Boolean(document.querySelector('#ag-prism-pulse-bar, [data-ag-prism-pulse-bar="true"]')),
    },
    context: {
      usedPct: ctxPct,
      source: ctxSource || null,
    },
  };
})()`;

export function parseDoctorArgs(argv) {
  const opts = {
    port: null,
    prismDir: null,
    json: false,
  };
  for (const a of argv || []) {
    if (a === '--json') opts.json = true;
    else if (a.startsWith('--port=')) {
      const p = Number(a.slice('--port='.length));
      if (!Number.isInteger(p) || p <= 0 || p > 65535) throw new Error(`Invalid --port value: ${a}`);
      opts.port = p;
    } else if (a.startsWith('--prism-dir=')) {
      const p = a.slice('--prism-dir='.length).trim();
      if (!p) throw new Error(`Invalid --prism-dir value: ${a}`);
      opts.prismDir = p;
    }
  }
  return opts;
}

export function checkNodeRuntime(version = process.version, hasWebSocket = typeof WebSocket === 'function') {
  const m = String(version || '').match(/^v?(\d+)\.(\d+)\.(\d+)/);
  const major = m ? Number(m[1]) : 0;
  const ok = major >= 22 && Boolean(hasWebSocket);
  return {
    ok,
    version: String(version || ''),
    major,
    hasWebSocket: Boolean(hasWebSocket),
  };
}

function readPrismPackageAt(dir) {
  if (!dir) return null;
  try {
    const pkgPath = path.join(dir, 'package.json');
    if (!fs.existsSync(pkgPath)) return null;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (!pkg || pkg.name !== 'obsidian-prism') return null;
    const settingsPath = path.join(dir, 'settings-panel.js');
    let unifiedSettingsHookReady = false;
    if (fs.existsSync(settingsPath)) {
      const src = fs.readFileSync(settingsPath, 'utf8');
      unifiedSettingsHookReady =
        src.includes('ag-cs-settings-sec') &&
        src.includes('data-ag-cs-group') &&
        src.includes("'modules'");
    }
    const ver = String(pkg.version || '');
    return {
      found: true,
      dir,
      version: ver,
      channel: /-beta\./i.test(ver) ? 'beta' : 'stable',
      unifiedSettingsHookReady,
    };
  } catch {
    return null;
  }
}

export function inspectPrismInstall({
  homeDir = os.homedir(),
  repoRoot = REPO_ROOT,
  explicitPrismDir = null,
  env = process.env,
} = {}) {
  const installedCandidates = [];
  if (explicitPrismDir) installedCandidates.push(path.resolve(explicitPrismDir));
  if (env?.AGY_PRISM_DIR) installedCandidates.push(path.resolve(env.AGY_PRISM_DIR));
  installedCandidates.push(path.join(homeDir, '.gemini', 'config', 'plugins', 'obsidian-prism'));

  let installed = null;
  for (const dir of installedCandidates) {
    const res = readPrismPackageAt(dir);
    if (res) {
      installed = res;
      break;
    }
  }

  const devCandidates = [
    env?.AGY_PRISM_REPO ? path.resolve(env.AGY_PRISM_REPO) : null,
    path.resolve(repoRoot, '..', 'obsidian-prism-dev'),
    path.resolve(repoRoot, '..', 'obsidian-prism'),
  ].filter(Boolean);

  let devCheckout = null;
  for (const dir of devCandidates) {
    if (installed && path.resolve(dir) === path.resolve(installed.dir)) continue;
    const res = readPrismPackageAt(dir);
    if (res) {
      devCheckout = res;
      break;
    }
  }

  return {
    installed: installed || { found: false, version: null, channel: null, unifiedSettingsHookReady: false },
    devCheckout: devCheckout || { found: false, version: null, channel: null, unifiedSettingsHookReady: false },
  };
}

export function buildRemediationHints(report, platform = process.platform) {
  const hints = [];
  if (!report.node?.ok) {
    hints.push('Upgrade to Node.js >= 22.0.0 so built-in global WebSocket is available without npm dependencies.');
  }
  if (!report.cdp?.port || !report.cdp?.reachable) {
    if (platform === 'darwin') {
      hints.push('Start Antigravity with CDP enabled: open -a Antigravity --args --remote-debugging-port=0');
    } else if (platform === 'win32') {
      hints.push('Launch Antigravity with --remote-debugging-port=0 (or enable Obsidian Prism daemon which exposes CDP automatically).');
    } else {
      hints.push('Launch Antigravity with --remote-debugging-port=0 and re-run: npm run doctor');
    }
    hints.push('If Antigravity uses a custom port, run: npm run doctor -- --port=<PORT>');
    return hints;
  }

  const pages = Array.isArray(report.windows) ? report.windows : [];
  if (pages.length === 0) {
    hints.push('CDP is reachable, but no Antigravity conversation host window was found. Open an Antigravity window and re-run.');
    return hints;
  }

  const missingCount = pages.filter((w) => w.probe?.sessionGuard?.state === 'missing').length;
  if (missingCount > 0) {
    hints.push(`Attach Session Guard to ${missingCount} unmounted window(s): npm run attach (or keep auto-attached with: npm run watch)`);
  }

  const prismActive = pages.some((w) => w.probe?.obsidianPrism?.active);
  const yieldedCount = pages.filter((w) => w.probe?.sessionGuard?.state === 'yielded').length;
  if (yieldedCount > 0) {
    hints.push('Obsidian Prism natively owns Session Guard on yielded window(s); standalone auto-yielded cleanly with zero duplicates.');
  } else if (prismActive && missingCount === 0) {
    hints.push('Obsidian Prism + Session Guard are coexisting smoothly: open Prism Settings -> Modules tab to configure both in one place.');
  }

  if (
    report.prismInstall?.installed?.found &&
    report.prismInstall?.devCheckout?.found &&
    report.prismInstall.installed.version !== report.prismInstall.devCheckout.version
  ) {
    hints.push(
      `Local Prism dev repo is v${report.prismInstall.devCheckout.version} while installed plugin is v${report.prismInstall.installed.version}; run npm test to validate latest beta compatibility.`
    );
  }
  return hints;
}

export async function runDoctor(options = {}) {
  const platform = options.platform || process.platform;
  const homeDir = options.homeDir || os.homedir();
  const nodeInfo = options.nodeInfo || checkNodeRuntime();
  const prismInstall =
    options.prismInstall ||
    inspectPrismInstall({
      homeDir,
      repoRoot: options.repoRoot || REPO_ROOT,
      explicitPrismDir: options.prismDir || null,
      env: options.env || process.env,
    });

  const discoverFn = options.discoverPort || ((p) => discoverCdpPort(p, platform, homeDir));
  const listFn = options.listTargets || ((port) => httpGetJson(`http://127.0.0.1:${port}/json/list`));
  const evalFn = options.evalTarget || ((wsUrl, expr) => evalViaCdp(wsUrl, expr));

  const port = discoverFn(options.port ?? null);
  const cdp = { port, reachable: false, error: null, totalTargets: 0, hostWindowCount: 0 };
  const windows = [];

  if (port) {
    try {
      const targets = await listFn(port);
      const list = Array.isArray(targets) ? targets : [];
      cdp.reachable = true;
      cdp.totalTargets = list.length;
      const hostPages = list.filter(isAntigravityHostTarget);
      cdp.hostWindowCount = hostPages.length;

      for (const page of hostPages) {
        try {
          const probe = await evalFn(page.webSocketDebuggerUrl, DOCTOR_PROBE_EXPRESSION);
          windows.push({
            title: page.title || '',
            url: page.url || '',
            ok: true,
            probe: probe || null,
          });
        } catch (err) {
          windows.push({
            title: page.title || '',
            url: page.url || '',
            ok: false,
            error: err?.message || String(err),
            probe: null,
          });
        }
      }
    } catch (err) {
      cdp.error = err?.message || String(err);
    }
  }

  const mountedCount = windows.filter((w) => w.probe?.sessionGuard?.state === 'mounted').length;
  const yieldedCount = windows.filter((w) => w.probe?.sessionGuard?.state === 'yielded').length;
  const ok = Boolean(nodeInfo.ok && cdp.reachable && cdp.hostWindowCount > 0 && mountedCount + yieldedCount > 0);

  const report = {
    ok,
    checkedAt: new Date().toISOString(),
    platform,
    node: nodeInfo,
    prismInstall,
    cdp,
    windows,
    hints: [],
  };
  report.hints = buildRemediationHints(report, platform);
  return report;
}

export function formatDoctorHuman(report) {
  const lines = [];
  lines.push('Antigravity Session Guard · Environment Doctor');
  lines.push('==============================================');

  const n = report.node;
  lines.push(`${n.ok ? '✔' : '✖'} Node.js: ${n.version} (WebSocket: ${n.hasWebSocket ? 'available' : 'missing'})`);

  const pi = report.prismInstall?.installed;
  const pd = report.prismInstall?.devCheckout;
  if (pi?.found) {
    const hook = pi.unifiedSettingsHookReady ? 'unified settings hook OK' : 'settings hook unknown';
    lines.push(`✔ Obsidian Prism (installed): v${pi.version} [${pi.channel}] · ${hook}`);
  } else {
    lines.push('ℹ Obsidian Prism (installed): not detected (standalone mode works out of the box)');
  }
  if (pd?.found) {
    const hook = pd.unifiedSettingsHookReady ? 'unified settings hook OK' : 'settings hook unknown';
    lines.push(`ℹ Obsidian Prism (dev checkout): v${pd.version} [${pd.channel}] · ${hook}`);
  }

  if (report.cdp.port && report.cdp.reachable) {
    lines.push(
      `✔ Antigravity CDP: port ${report.cdp.port} reachable (${report.cdp.hostWindowCount} host window(s) / ${report.cdp.totalTargets} total targets)`
    );
  } else if (report.cdp.port) {
    lines.push(`✖ Antigravity CDP: port ${report.cdp.port} unreachable (${report.cdp.error || 'connection failed'})`);
  } else {
    lines.push('⚠ Antigravity CDP: no DevToolsActivePort found');
  }

  if (report.windows.length > 0) {
    lines.push('');
    lines.push('Host Windows:');
    for (const w of report.windows) {
      if (!w.ok || !w.probe) {
        lines.push(`  ✖ ${w.title || w.url}: probe failed (${w.error || 'unknown'})`);
        continue;
      }
      const sg = w.probe.sessionGuard;
      const pr = w.probe.obsidianPrism;
      const icon = sg.state === 'mounted' || sg.state === 'yielded' ? '✔' : '⚠';
      const ctxTxt = w.probe.context?.usedPct !== null ? `${w.probe.context.usedPct}%` : 'n/a';
      const prismTxt = pr.active
        ? `Prism ${pr.versionHint ? `v${pr.versionHint}` : 'active'}${sg.prismSettingsEmbedded ? ' (settings unified)' : ''}`
        : 'no Prism';
      lines.push(
        `  ${icon} ${w.title || '(untitled)'} — SG: ${sg.state}${sg.threshold ? ` (${sg.threshold}%/${sg.mode})` : ''} | ${prismTxt} | ctx: ${ctxTxt} | ★ ${sg.bookmarkCount} | drafts: ${sg.draftCount}`
      );
    }
  }

  if (report.hints.length > 0) {
    lines.push('');
    lines.push('Next Steps / Notes:');
    for (const h of report.hints) {
      lines.push(`  • ${h}`);
    }
  }

  return lines.join('\n');
}

async function runCli() {
  const opts = parseDoctorArgs(process.argv.slice(2));
  const report = await runDoctor(opts);
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatDoctorHuman(report));
  }
  if (!report.node.ok || (report.cdp.port && !report.cdp.reachable)) {
    process.exitCode = 1;
  }
}

const isEntry = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isEntry) {
  runCli().catch((err) => {
    console.error('[agy-session-guard:doctor]', err?.message || err);
    process.exitCode = 1;
  });
}
