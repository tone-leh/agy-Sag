#!/usr/bin/env node
/**
 * Antigravity Session Guard — Zero-ASAR Standalone Watch Daemon (Zero runtime npm deps)
 *
 * Continuously watches an existing localhost Antigravity CDP port and automatically
 * attaches Session Guard to newly opened or reloaded Antigravity host windows.
 *
 * Safety rules:
 *   1. Never modifies app.asar or any application binary/bundle.
 *   2. Never restarts, spawns, or kills Antigravity.
 *   3. Adaptive backoff (default 3s active -> up to 30s steady-state / waiting-port) for near-zero idle overhead.
 *   4. Uses a lightweight probe on already-attached targets to detect Cmd+R reloads without re-evaluating the bundle.
 *   5. Honors host integrator ownership (window.__agSessionGuardOwner) and never overrides yielded windows.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildInjectExpression, computeCoreHash } from './bundle.mjs';
import { discoverCdpPort, evalViaCdp, httpGetJson, isAntigravityHostTarget } from './cdp-attach.mjs';

export const PROBE_EXPRESSION = `(() => {
  const owner = window.__agSessionGuardOwner;
  if (owner && owner !== 'standalone') return { state: 'yielded', owner };
  const api = window.__agSessionGuard;
  if (api && !api.getDebugState?.()?.destroyed) {
    return { state: 'mounted', codeHash: api.__agSgHash || '' };
  }
  return { state: 'missing' };
})()`;

export function parseWatchArgs(argv) {
  const opts = {
    port: null,
    threshold: null,
    mode: null,
    intervalMs: 3000,
    maxBackoffMs: 30000,
    once: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--once') opts.once = true;
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
        if (!Number.isFinite(n) || n < 50 || n > 98) {
          throw new Error(`Invalid --threshold (expected off or 50..98): ${a}`);
        }
        opts.threshold = Math.round(n);
      }
    } else if (a.startsWith('--mode=')) {
      const raw = a.slice('--mode='.length).trim();
      if (!['confirm', 'fill-only', 'auto-countdown'].includes(raw)) {
        throw new Error(`Invalid --mode (expected confirm|fill-only|auto-countdown): ${a}`);
      }
      opts.mode = raw;
    } else if (a.startsWith('--interval=')) {
      const n = Number(a.slice('--interval='.length));
      if (!Number.isFinite(n) || n < 500 || n > 60000) {
        throw new Error(`Invalid --interval (expected 500..60000 ms): ${a}`);
      }
      opts.intervalMs = Math.round(n);
    } else if (a.startsWith('--max-backoff=')) {
      const n = Number(a.slice('--max-backoff='.length));
      if (!Number.isFinite(n) || n < 500 || n > 300000) {
        throw new Error(`Invalid --max-backoff (expected 500..300000 ms): ${a}`);
      }
      opts.maxBackoffMs = Math.round(n);
    }
  }
  if (opts.maxBackoffMs < opts.intervalMs) {
    opts.maxBackoffMs = opts.intervalMs;
  }
  return opts;
}

export class SessionGuardWatchDaemon {
  constructor(options = {}) {
    this.explicitPort = options.port ?? null;
    this.config = options.config && Object.keys(options.config).length ? options.config : null;
    this.intervalMs = Math.max(500, Number(options.intervalMs) || 3000);
    this.maxBackoffMs = Math.max(this.intervalMs, Number(options.maxBackoffMs) || 30000);
    this.discoverPort = options.discoverPort || ((p) => discoverCdpPort(p));
    this.listTargets = options.listTargets || ((port) => httpGetJson(`http://127.0.0.1:${port}/json/list`));
    this.evalTarget = options.evalTarget || ((wsUrl, expr) => evalViaCdp(wsUrl, expr));
    this.buildInject =
      options.buildInject ||
      (() => ({
        codeHash: computeCoreHash(),
        expression: buildInjectExpression(this.config, { source: 'standalone' }),
      }));
    this.onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
    this.now = options.now || (() => Date.now());
    this.setTimer = options.setTimer || ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = options.clearTimer || ((t) => clearTimeout(t));

    this.running = false;
    this.timer = null;
    this.currentDelayMs = this.intervalMs;
    this.lastPort = null;
    this.cycleCount = 0;
    this.attachedTargets = new Map(); // targetKey -> { codeHash, url, wsUrl, status, updatedAt }
  }

  emit(type, data = {}) {
    try {
      this.onEvent({ ts: new Date(this.now()).toISOString(), event: type, ...data });
    } catch {}
  }

  _bumpBackoff(factor = 1.5) {
    this.currentDelayMs = Math.min(this.maxBackoffMs, Math.round(this.currentDelayMs * factor));
    return this.currentDelayMs;
  }

  _resetBackoff() {
    this.currentDelayMs = this.intervalMs;
    return this.currentDelayMs;
  }

  async reconcileOnce() {
    this.cycleCount += 1;
    const port = this.discoverPort(this.explicitPort);
    if (!port) {
      this.attachedTargets.clear();
      this.lastPort = null;
      const nextDelayMs = this.cycleCount === 1 ? this.currentDelayMs : this._bumpBackoff(2);
      const out = { status: 'no-port', port: null, attached: 0, reused: 0, yielded: 0, errors: 0, nextDelayMs };
      this.emit('waiting-port', out);
      return out;
    }

    let targets;
    try {
      targets = await this.listTargets(port);
    } catch (err) {
      this.attachedTargets.clear();
      this.lastPort = null;
      const nextDelayMs = this._bumpBackoff(2);
      const out = {
        status: 'unreachable',
        port,
        error: err?.message || String(err),
        attached: 0,
        reused: 0,
        yielded: 0,
        errors: 1,
        nextDelayMs,
      };
      this.emit('port-unreachable', out);
      return out;
    }

    const portChanged = this.lastPort !== null && this.lastPort !== port;
    if (portChanged) this.attachedTargets.clear();
    this.lastPort = port;

    const hostPages = (Array.isArray(targets) ? targets : []).filter(isAntigravityHostTarget);
    const activeKeys = new Set();
    let changed = portChanged;
    let attached = 0;
    let reused = 0;
    let yielded = 0;
    let errors = 0;

    // Lazy-build inject bundle only if at least one target needs full injection
    let bundleCache = null;
    const getBundle = () => {
      if (!bundleCache) bundleCache = this.buildInject();
      return bundleCache;
    };

    for (const page of hostPages) {
      const key = String(page.id || page.webSocketDebuggerUrl);
      activeKeys.add(key);
      const prev = this.attachedTargets.get(key);

      try {
        if (prev && prev.wsUrl === page.webSocketDebuggerUrl && prev.url === page.url) {
          const probe = await this.evalTarget(page.webSocketDebuggerUrl, PROBE_EXPRESSION);
          if (probe?.state === 'yielded') {
            yielded += 1;
            prev.status = 'yielded';
            prev.updatedAt = this.now();
            continue;
          }
          if (probe?.state === 'mounted' && probe.codeHash && probe.codeHash === prev.codeHash) {
            reused += 1;
            prev.updatedAt = this.now();
            continue;
          }
          // Window reloaded or Session Guard was cleared -> re-inject cleanly below
        }

        const bundle = getBundle();
        const res = await this.evalTarget(page.webSocketDebuggerUrl, bundle.expression);
        changed = true;
        if (res?.yielded) {
          yielded += 1;
          this.attachedTargets.set(key, {
            codeHash: bundle.codeHash,
            url: page.url,
            wsUrl: page.webSocketDebuggerUrl,
            status: 'yielded',
            updatedAt: this.now(),
          });
          this.emit('target-yielded', { port, targetId: key, title: page.title || '', url: page.url });
        } else if (res?.ok) {
          attached += 1;
          this.attachedTargets.set(key, {
            codeHash: res.codeHash || bundle.codeHash,
            url: page.url,
            wsUrl: page.webSocketDebuggerUrl,
            status: 'attached',
            updatedAt: this.now(),
          });
          this.emit('target-attached', {
            port,
            targetId: key,
            title: page.title || '',
            reused: Boolean(res.reused),
            codeHash: res.codeHash || bundle.codeHash,
          });
        } else {
          errors += 1;
          this.attachedTargets.delete(key);
          this.emit('target-skipped', { port, targetId: key, title: page.title || '', result: res });
        }
      } catch (err) {
        errors += 1;
        this.attachedTargets.delete(key);
        this.emit('target-error', { port, targetId: key, title: page.title || '', error: err?.message || String(err) });
      }
    }

    // Prune closed windows
    for (const key of [...this.attachedTargets.keys()]) {
      if (!activeKeys.has(key)) {
        this.attachedTargets.delete(key);
        changed = true;
        this.emit('target-closed', { port, targetId: key });
      }
    }

    const nextDelayMs = changed ? this._resetBackoff() : this._bumpBackoff(1.5);
    const summary = {
      status: 'ok',
      port,
      hostPages: hostPages.length,
      attached,
      reused,
      yielded,
      errors,
      nextDelayMs,
    };
    this.emit('cycle', summary);
    return summary;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const tick = async () => {
      if (!this.running) return;
      const res = await this.reconcileOnce();
      if (!this.running) return;
      this.timer = this.setTimer(tick, res.nextDelayMs);
      this.timer?.unref?.();
    };
    void tick();
  }

  stop() {
    this.running = false;
    if (this.timer) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
    this.emit('stopped', { trackedTargets: this.attachedTargets.size });
  }

  getState() {
    return {
      running: this.running,
      lastPort: this.lastPort,
      currentDelayMs: this.currentDelayMs,
      cycleCount: this.cycleCount,
      trackedTargets: [...this.attachedTargets.entries()].map(([id, info]) => ({ id, ...info })),
    };
  }
}

export async function startWatchDaemonCli(argv = process.argv.slice(2)) {
  const opts = parseWatchArgs(argv);
  const cfgPatch = {};
  if (opts.threshold !== null) cfgPatch.compactThreshold = opts.threshold;
  if (opts.mode !== null) cfgPatch.compactTriggerMode = opts.mode;

  const formatLog = (ev) => {
    if (opts.json) {
      console.log(JSON.stringify(ev));
      return;
    }
    if (ev.event === 'waiting-port') {
      console.log(`[agy-session-guard:watch] Waiting for Antigravity CDP port... (retry in ${Math.round(ev.nextDelayMs / 1000)}s)`);
    } else if (ev.event === 'port-unreachable') {
      console.log(`[agy-session-guard:watch] Port ${ev.port} unreachable (${ev.error}); retrying in ${Math.round(ev.nextDelayMs / 1000)}s`);
    } else if (ev.event === 'target-attached') {
      console.log(`[agy-session-guard:watch] Attached -> "${ev.title || ev.targetId}" (port ${ev.port}, hash ${ev.codeHash})`);
    } else if (ev.event === 'target-yielded') {
      console.log(`[agy-session-guard:watch] Yielded to host integrator on "${ev.title || ev.targetId}"`);
    } else if (ev.event === 'target-closed') {
      console.log(`[agy-session-guard:watch] Target closed -> ${ev.targetId}`);
    } else if (ev.event === 'target-error') {
      console.error(`[agy-session-guard:watch] Target error (${ev.targetId}): ${ev.error}`);
    } else if (ev.event === 'stopped') {
      console.log('[agy-session-guard:watch] Watch daemon stopped cleanly.');
    }
  };

  const daemon = new SessionGuardWatchDaemon({
    port: opts.port,
    config: cfgPatch,
    intervalMs: opts.intervalMs,
    maxBackoffMs: opts.maxBackoffMs,
    onEvent: formatLog,
  });

  if (opts.once) {
    const res = await daemon.reconcileOnce();
    if (opts.json) console.log(JSON.stringify(res));
    if (res.status !== 'ok') process.exitCode = 1;
    return;
  }

  const shutdown = () => {
    daemon.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  if (!opts.json) {
    console.log(
      `[agy-session-guard:watch] Starting Zero-ASAR watch daemon (interval=${opts.intervalMs}ms, maxBackoff=${opts.maxBackoffMs}ms). Press Ctrl+C to stop.`
    );
  }
  daemon.start();
  // Keep event loop alive until SIGINT/SIGTERM
  setInterval(() => {}, 60_000);
}

const isEntry = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isEntry) {
  startWatchDaemonCli(process.argv.slice(2)).catch((err) => {
    console.error('[agy-session-guard:watch]', err?.message || err);
    process.exitCode = 1;
  });
}
