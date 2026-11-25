// Antigravity Session Guard — Zero-Dependency Bundle Builder (ESM)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_DIR = path.resolve(__dirname, '..', 'packages', 'core');

export const CORE_FILES = [
  'i18n.js',
  'coexist.js',
  'context-source.js',
  'precompact-export.js',
  'styles.js',
  'compact-guard.js',
  'session-radar.js',
  'index.js',
];

export const REMOVE_EXPRESSION = `(() => {
  try { window.__agSessionGuard?.destroy?.(); } catch {}
  try { document.getElementById('ag-sg-core-css')?.remove(); } catch {}
  try { document.querySelectorAll('[data-ag-sg-owned="1"]').forEach((n) => n.remove()); } catch {}
  for (const k of ['__agSessionGuard', '__agSgCore', '__agSgI18n', '__agSgCoexist', '__agSgContextSource', '__agSgPrecompactExport', '__agSgStyles', '__agSgCompactGuard', '__agSgSessionRadar']) {
    try { delete window[k]; } catch {}
    try { delete globalThis[k]; } catch {}
  }
  return { ok: true, status: 'removed' };
})()`;

export function readCoreSources() {
  return CORE_FILES.map((file) => ({
    file,
    code: fs.readFileSync(path.join(CORE_DIR, file), 'utf8'),
  }));
}

export function buildInjectExpression(config = null, opts = {}) {
  const parts = readCoreSources();
  const combined = parts.map((p) => `/* ${p.file} */\n${p.code}`).join('\n;\n');
  const codeHash = crypto.createHash('sha256').update(combined).digest('hex').slice(0, 16);
  const cfgJson = JSON.stringify(config && typeof config === 'object' ? config : null);
  const sourceJson = JSON.stringify(typeof opts.source === 'string' && opts.source ? opts.source : 'standalone');

  return `(() => {
  try {
    if (window.self !== window.top) return { ok: false, status: 'skipped-subframe' };
  } catch {
    return { ok: false, status: 'skipped-subframe' };
  }
  const targetHash = ${JSON.stringify(codeHash)};
  const bootCfg = ${cfgJson};
  const source = ${sourceJson};
  const prev = window.__agSessionGuard;
  if (prev && !prev.getDebugState?.()?.destroyed && prev.__agSgHash === targetHash) {
    if (bootCfg && typeof prev.updateConfig === 'function') prev.updateConfig(bootCfg);
    if (typeof prev.evaluateNow === 'function') void prev.evaluateNow();
    return { ok: true, reused: true, codeHash: targetHash };
  }
  ${combined}
  const api = window.__agSgCore?.mountSessionGuard?.({
    win: window,
    doc: document,
    source,
    ...(bootCfg ? { config: bootCfg } : {}),
  });
  if (api) api.__agSgHash = targetHash;
  return { ok: Boolean(api), yielded: Boolean(api?.yielded), codeHash: targetHash, version: api?.version || '0.1.0' };
})()`;
}
