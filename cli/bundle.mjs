// agy-Sag — Zero-Dependency Bundle Builder (ESM)
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
  'recovery-handoff.js',
  'bookmark-vault.js',
  'session-watchdog.js',
  'styles.js',
  'host-i18n-packs.js',
  'host-i18n.js',
  'draft-guard.js',
  'prompt-queue.js',
  'prompt-library.js',
  'reading-nav.js',
  'safe-auto-accept.js',
  'theme-studio.js',
  'quota-pulse.js',
  'nov-synergy.js',
  'clean-slate.js',
  'status-pill.js',
  'prism-bridge.js',
  'outline-bookmarks.js',
  'compact-guard.js',
  'session-radar.js',
  'index.js',
];

const GLOBAL_KEYS = [
  '__agSag',
  '__agSagExtPacks',
  '__agSagCore',
  '__agSagCoexist',
  '__agSagHostI18nPacks',
  '__agSagHostI18n',
  '__agSagPromptQueue',
  '__agSagPromptLibrary',
  '__agSagReadingNav',
  '__agSagSafeAutoAccept',
  '__agSagThemeStudio',
  '__agSagQuotaPulse',
  '__agSagNovSynergy',
  '__agSagBridgeReceiver',
  '__agSessionGuard',
  '__agSgCore',
  '__agSgI18n',
  '__agSgCoexist',
  '__agSgContextSource',
  '__agSgPrecompactExport',
  '__agSgRecoveryHandoff',
  '__agSgBookmarkVault',
  '__agSgSessionWatchdog',
  '__agSgDraftGuard',
  '__agSgCleanSlate',
  '__agSgStatusPill',
  '__agSgPrismBridge',
  '__agSgOutlineBookmarks',
  '__agSgStyles',
  '__agSgCompactGuard',
  '__agSgSessionRadar',
];

export const REMOVE_EXPRESSION = `(() => {
  try { window.__agSag?.destroy?.(); } catch {}
  try { window.__agSessionGuard?.destroy?.(); } catch {}
  try { delete window.__agSagBridgeReceiver; } catch {}
  try { delete window.__agSagNovSynergy; } catch {}
  try { document.getElementById('ag-sg-core-css')?.remove(); } catch {}
  try { document.getElementById('ag-sag-theme-css')?.remove(); } catch {}
  try { document.getElementById('ag-sag-queue-css')?.remove(); } catch {}
  try { document.querySelectorAll('[data-ag-sg-owned="1"], [data-ag-sag-owned="1"]').forEach((n) => n.remove()); } catch {}
  try { document.querySelectorAll('[data-ag-sag-code-folded], [data-ag-sag-code-enhanced]').forEach((n) => { n.removeAttribute('data-ag-sag-code-folded'); n.removeAttribute('data-ag-sag-code-enhanced'); }); } catch {}
  try { document.querySelectorAll('#ag-prism-pulse-bar, [data-ag-prism-pulse-bar="true"], #ag-pulse-status-bar, [data-ag-pulse-bar="true"]').forEach((h) => { h?.shadowRoot?.querySelectorAll?.('[data-ag-sg-owned="1"], [data-ag-sag-owned="1"]')?.forEach?.((n) => n.remove()); }); } catch {}
  try {
    const html = document.documentElement;
    if (html) {
      const toRemove = [];
      if (html.attributes && typeof html.attributes.length === 'number') {
        for (let i = 0; i < html.attributes.length; i++) {
          const name = html.attributes[i]?.name;
          if (name && name.startsWith('data-ag-sag-')) toRemove.push(name);
        }
      }
      for (const fallbackAttr of [
        'data-ag-sag-host-i18n',
        'data-ag-sag-lang',
        'data-ag-sag-theme',
        'data-ag-sag-theme-preset',
        'data-ag-sag-theme-density',
        'data-ag-sag-theme-policy',
        'data-ag-sag-theme-colors',
        'data-ag-sag-theme-cjk',
        'data-ag-sag-theme-sidebar',
        'data-ag-sag-theme-wide',
      ]) {
        if (!toRemove.includes(fallbackAttr)) toRemove.push(fallbackAttr);
      }
      for (const attr of toRemove) {
        try { html.removeAttribute(attr); } catch {}
      }
    }
  } catch {}
  for (const k of ${JSON.stringify(GLOBAL_KEYS)}) {
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

export const EXT_PACK_LOCALES = Object.freeze([
  'zh-CN',
  'zh-TW',
  'ja',
  'ko',
  'es',
  'fr',
  'de',
  'ru',
  'pt-BR',
]);

export function resolveInjectExtLocale(rawLocale, navigatorLang = '') {
  const candidate = String(rawLocale || '').trim();
  const effective = !candidate || candidate.toLowerCase() === 'auto' ? String(navigatorLang || '').trim() : candidate;
  if (!effective) return null;
  const s = effective.toLowerCase().replace(/_/g, '-');
  if (s === 'en' || s.startsWith('en-')) return null;
  if (/^zh-(?:tw|hk|mo|hant)/.test(s) || /^yue\b/.test(s)) return 'zh-TW';
  if (s === 'zh' || s.startsWith('zh-')) return 'zh-CN';
  if (s === 'ja' || s.startsWith('ja-') || s === 'jp') return 'ja';
  if (s === 'ko' || s.startsWith('ko-') || s === 'kr') return 'ko';
  if (s === 'es' || s.startsWith('es-')) return 'es';
  if (s === 'fr' || s.startsWith('fr-')) return 'fr';
  if (s === 'de' || s.startsWith('de-')) return 'de';
  if (s === 'ru' || s.startsWith('ru-')) return 'ru';
  if (s === 'pt' || s.startsWith('pt-')) return 'pt-BR';
  return null;
}

export function readExtendedPackFile(locale, repoRoot = path.resolve(__dirname, '..')) {
  if (!EXT_PACK_LOCALES.includes(locale)) return null;
  const filePath = path.join(repoRoot, 'packages', 'core', 'locales', 'ext', `${locale}.json`);
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function computeCoreHash(parts = readCoreSources()) {
  const combined = parts.map((p) => `/* ${p.file} */\n${p.code}`).join('\n;\n');
  return crypto.createHash('sha256').update(combined).digest('hex').slice(0, 16);
}

export function buildInjectExpression(config = null, opts = {}) {
  const parts = readCoreSources();
  const combined = parts.map((p) => `/* ${p.file} */\n${p.code}`).join('\n;\n');
  const codeHash = crypto.createHash('sha256').update(combined).digest('hex').slice(0, 16);
  const cfgJson = JSON.stringify(config && typeof config === 'object' ? config : null);
  const sourceJson = JSON.stringify(typeof opts.source === 'string' && opts.source ? opts.source : 'standalone');

  const resolvedExtLoc = resolveInjectExtLocale(
    opts.extLocale ?? (config && typeof config === 'object' ? config.hostI18nLocale : null),
    opts.navigatorLang || ''
  );
  const extPack = resolvedExtLoc ? readExtendedPackFile(resolvedExtLoc) : null;
  const extPrelude = extPack
    ? `window.__agSagExtPacks = window.__agSagExtPacks || {}; window.__agSagExtPacks[${JSON.stringify(resolvedExtLoc)}] = ${JSON.stringify(extPack)};`
    : '';

  return `(() => {
  try {
    if (window.self !== window.top) return { ok: false, status: 'skipped-subframe' };
  } catch {
    return { ok: false, status: 'skipped-subframe' };
  }
  const targetHash = ${JSON.stringify(codeHash)};
  const bootCfg = ${cfgJson};
  const source = ${sourceJson};
  const prev = window.__agSag || window.__agSessionGuard;
  if (prev && !prev.getDebugState?.()?.destroyed && prev.__agSgHash === targetHash) {
    if (bootCfg && typeof prev.updateConfig === 'function') prev.updateConfig(bootCfg);
    if (typeof prev.evaluateNow === 'function') void prev.evaluateNow();
    return { ok: true, reused: true, codeHash: targetHash, brand: 'agy-Sag' };
  }
  ${extPrelude}
  ${combined}
  const api = (window.__agSagCore || window.__agSgCore)?.mountSag?.({
    win: window,
    doc: document,
    source,
    ...(bootCfg ? { config: bootCfg } : {}),
  }) || (window.__agSagCore || window.__agSgCore)?.mountSessionGuard?.({
    win: window,
    doc: document,
    source,
    ...(bootCfg ? { config: bootCfg } : {}),
  });
  if (api) api.__agSgHash = targetHash;
  return { ok: Boolean(api), yielded: Boolean(api?.yielded), codeHash: targetHash, brand: 'agy-Sag', version: api?.version || '1.0.0' };
})()`;
}
