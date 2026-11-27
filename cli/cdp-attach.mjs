#!/usr/bin/env node
/**
 * agy-Sag — Zero-ASAR Pure CDP Attacher (Zero runtime npm deps)
 *
 * Safety rules:
 *   1. Never modifies app.asar or any application binary/bundle.
 *   2. Never restarts or kills Antigravity.
 *   3. Only attaches to an already-open localhost CDP port (e.g. from Obsidian Prism or user --remote-debugging-port).
 *   4. Targets only Antigravity host windows; skips devtools://, extension, and unrelated localhost pages.
 */
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildInjectExpression, REMOVE_EXPRESSION } from './bundle.mjs';

const require = createRequire(import.meta.url);
const coexist = require('../packages/core/coexist.js');

const ALLOWED_PRESETS = Object.keys(coexist.PRESETS || {});
const ALLOWED_HOST_LOCALES = Array.isArray(coexist.ALLOWED_HOST_LOCALES) ? coexist.ALLOWED_HOST_LOCALES : [];

export function validatePresetName(raw, flagText = `--preset=${raw}`) {
  const val = String(raw ?? '').trim().toLowerCase();
  if (!val || !Object.prototype.hasOwnProperty.call(coexist.PRESETS || {}, val)) {
    throw new Error(`Invalid --preset (expected ${ALLOWED_PRESETS.join('|')}): ${flagText}`);
  }
  return val;
}

export function validateHostLang(raw, flagText = `--lang=${raw}`) {
  const val = String(raw ?? '').trim();
  if (!val || !ALLOWED_HOST_LOCALES.includes(val)) {
    throw new Error(`Invalid --lang (expected ${ALLOWED_HOST_LOCALES.join('|')}): ${flagText}`);
  }
  return val;
}

export function buildConfigPatchFromOpts(opts = {}) {
  const cfgPatch = {};
  if (opts.preset) {
    const presetPatch = coexist.resolvePresetPatch?.(opts.preset);
    if (presetPatch) {
      Object.assign(cfgPatch, presetPatch);
      if (presetPatch.modules) cfgPatch.modules = { ...presetPatch.modules };
    }
  }
  if (opts.threshold !== null && opts.threshold !== undefined) {
    cfgPatch.compactThreshold = opts.threshold;
  }
  if (opts.mode !== null && opts.mode !== undefined) {
    cfgPatch.compactTriggerMode = opts.mode;
  }
  if (opts.lang) {
    cfgPatch.hostI18nLocale = opts.lang;
    cfgPatch.modules = {
      ...(cfgPatch.modules || {}),
      hostI18n: opts.lang !== 'en',
    };
  }
  return cfgPatch;
}

export function parseCliArgs(argv) {
  const opts = {
    action: 'status',
    port: null,
    threshold: null,
    mode: null,
    dryRun: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--attach') opts.action = 'attach';
    else if (a === '--remove') opts.action = 'remove';
    else if (a === '--status') opts.action = 'status';
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--json') opts.json = true;
    else if (a.startsWith('--port=')) {
      const p = Number(a.slice('--port='.length));
      if (!Number.isInteger(p) || p <= 0 || p > 65535) throw new Error(`Invalid --port value: ${a}`);
      opts.port = p;
    } else if (a.startsWith('--threshold=')) {
      const raw = a.slice('--threshold='.length).trim();
      if (raw === 'off') opts.threshold = 'off';
      else {
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 50 || n > 98) throw new Error(`Invalid --threshold (expected off or 50..98): ${a}`);
        opts.threshold = Math.round(n);
      }
    } else if (a.startsWith('--mode=')) {
      const raw = a.slice('--mode='.length).trim();
      if (!['auto-silent', 'confirm', 'fill-only', 'auto-countdown'].includes(raw)) {
        throw new Error(`Invalid --mode (expected auto-silent|confirm|fill-only|auto-countdown): ${a}`);
      }
      opts.mode = raw;
    } else if (a.startsWith('--preset=')) {
      opts.preset = validatePresetName(a.slice('--preset='.length), a);
    } else if (a.startsWith('--lang=')) {
      opts.lang = validateHostLang(a.slice('--lang='.length), a);
    }
  }
  return opts;
}

export function discoverCdpPort(explicitPort = null, platform = process.platform, homeDir = os.homedir()) {
  if (Number.isInteger(explicitPort) && explicitPort > 0) return explicitPort;
  const candidates = [];
  if (platform === 'darwin') {
    candidates.push(path.join(homeDir, 'Library', 'Application Support', 'Antigravity', 'DevToolsActivePort'));
  } else if (platform === 'win32') {
    const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
    candidates.push(path.join(appData, 'Antigravity', 'DevToolsActivePort'));
  } else {
    candidates.push(path.join(homeDir, '.config', 'Antigravity', 'DevToolsActivePort'));
  }
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const firstLine = fs.readFileSync(file, 'utf8').split(/\r?\n/)[0]?.trim();
      const port = Number(firstLine);
      if (Number.isInteger(port) && port > 0 && port <= 65535) return port;
    } catch {}
  }
  return null;
}

export function httpGetJson(url, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (err) { reject(err); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('HTTP timeout')); });
  });
}

export function isAntigravityHostTarget(target) {
  if (!target || target.type !== 'page' || !target.webSocketDebuggerUrl) return false;
  const url = String(target.url || '').toLowerCase();
  const title = String(target.title || '');
  if (/^(?:devtools|chrome|chrome-extension|data|blob|plugin):/.test(url)) return false;
  if (/\/launchpad(?:\.html)?(?:[?#]|$)/i.test(url)) return false;
  if (/^(?:vscode-file|app):/.test(url)) return true;
  if (/^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?\//.test(url) && /antigravity/i.test(title)) {
    return true;
  }
  return false;
}

export function evalViaCdp(wsUrl, expression, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    if (typeof WebSocket !== 'function') {
      return reject(new Error('Node.js >= 22 global WebSocket is required'));
    }
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error('CDP evaluation timeout'));
    }, timeoutMs);
    timer?.unref?.();

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true, awaitPromise: true },
      }));
    });
    ws.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(String(ev.data || '{}'));
        if (msg.id === 1) {
          clearTimeout(timer);
          try { ws.close(); } catch {}
          if (msg.error) return reject(new Error(msg.error.message || 'CDP error'));
          resolve(msg.result?.result?.value ?? null);
        }
      } catch (err) {
        clearTimeout(timer);
        try { ws.close(); } catch {}
        reject(err);
      }
    });
    ws.addEventListener('error', (err) => {
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error('WebSocket error'));
    });
  });
}

export async function runCdpAttachCli(argv = process.argv.slice(2)) {
  const opts = parseCliArgs(argv);
  const port = discoverCdpPort(opts.port);
  if (!port) {
    console.error('[agy-Sag] No active Antigravity CDP port found. Start Antigravity with --remote-debugging-port=0 or pass --port=<PORT>.');
    process.exitCode = 1;
    return { ok: false, reason: 'no-port' };
  }

  const targets = await httpGetJson(`http://127.0.0.1:${port}/json/list`);
  const hostPages = (Array.isArray(targets) ? targets : []).filter(isAntigravityHostTarget);

  const cfgPatch = buildConfigPatchFromOpts(opts);

  if (opts.dryRun) {
    const out = {
      ok: true,
      dryRun: true,
      action: opts.action,
      port,
      ...(Object.keys(cfgPatch).length ? { configPatch: cfgPatch } : {}),
      hostPages: hostPages.map((p) => ({ title: p.title, url: p.url })),
    };
    console.log(JSON.stringify(out, null, 2));
    return out;
  }

  const expr =
    opts.action === 'remove'
      ? REMOVE_EXPRESSION
      : opts.action === 'status'
        ? '(() => (window.__agSag || window.__agSessionGuard)?.getDebugState?.() || { mounted: false })()'
        : buildInjectExpression(Object.keys(cfgPatch).length ? cfgPatch : null, {
            source: 'standalone',
            extLocale: opts.lang || null,
          });

  const results = [];
  for (const page of hostPages) {
    const res = await evalViaCdp(page.webSocketDebuggerUrl, expr);
    results.push({ title: page.title, result: res });
  }
  const summary = { ok: true, action: opts.action, port, targets: results };
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

const isEntry = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isEntry) {
  runCdpAttachCli(process.argv.slice(2)).catch((err) => {
    console.error('[agy-Sag]', err?.message || err);
    process.exitCode = 1;
  });
}
