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
  try { document.querySelectorAll('[data-ag-sg-owned="1"], [data-ag-sag-owned="1"], .ag-sag-smooth-caret, .ag-sag-ambient-glow, .ag-sag-ctx-toast').forEach((n) => n.remove()); } catch {}
  try { document.querySelectorAll('[data-ag-sag-code-folded], [data-ag-sag-code-enhanced], [data-ag-sag-code-wrap], [data-ag-sag-smooth-caret], [data-ag-sag-caret-host]').forEach((n) => { n.removeAttribute('data-ag-sag-code-folded'); n.removeAttribute('data-ag-sag-code-enhanced'); n.removeAttribute('data-ag-sag-code-wrap'); n.removeAttribute('data-ag-sag-smooth-caret'); n.removeAttribute('data-ag-sag-caret-host'); }); } catch {}
  try { if (typeof CSS !== 'undefined' && CSS.highlights && CSS.highlights.delete) { for (const h of ['ag-sag-sf0','ag-sag-sf1','ag-sag-sf2','ag-sag-sf3','ag-sag-sf4']) CSS.highlights.delete(h); } } catch {}
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
        'data-ag-sag-theme-resolved',
        'data-ag-sag-theme-scheme',
        'data-ag-sag-theme-density',
        'data-ag-sag-theme-accent',
        'data-ag-sag-theme-corners',
        'data-ag-sag-theme-surface',
        'data-ag-sag-theme-code-font',
        'data-ag-sag-theme-ligatures',
        'data-ag-sag-theme-glow',
        'data-ag-sag-theme-policy',
        'data-ag-sag-theme-colors',
        'data-ag-sag-theme-cjk',
        'data-ag-sag-theme-sidebar',
        'data-ag-sag-theme-wide',
        'data-ag-sag-conv-state',
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

const REGEX_PRECEDING_KEYWORDS = new Set([
  'return',
  'case',
  'throw',
  'typeof',
  'in',
  'of',
  'void',
  'delete',
  'new',
  'else',
  'do',
  'yield',
  'await',
]);
const REGEX_PRECEDING_PUNCT = new Set([
  '',
  '(',
  ',',
  '=',
  ':',
  '[',
  '!',
  '&',
  '|',
  '?',
  '{',
  '}',
  ';',
  '~',
  '^',
  '+',
  '-',
  '*',
  '/',
  '%',
  '<',
  '>',
]);

const isIdentChar = (ch) => Boolean(ch) && /[\p{ID_Continue}$_\u200C\u200D]/u.test(ch);

function needsCodeSpace(prevCh, nextCh) {
  if (!prevCh || !nextCh || prevCh === '\n' || prevCh === ' ') return false;
  if (isIdentChar(prevCh) && isIdentChar(nextCh)) return true;
  if ((/[0-9]/.test(prevCh) && nextCh === '.') || (prevCh === '.' && /[0-9]/.test(nextCh))) return true;
  if (prevCh === nextCh && '+-*/&|?<>=.'.includes(prevCh)) return true;
  if (prevCh === '/' && (nextCh === '*' || nextCh === '/')) return true;
  if (prevCh === '?' && nextCh === '.') return true;
  if (prevCh === '<' && nextCh === '!') return true;
  if (prevCh === '-' && nextCh === '>') return true;
  if (prevCh === '=' && nextCh === '>') return true;
  if (nextCh === '=' && '+-*/%&|^!<>?='.includes(prevCh)) return true;
  return false;
}

function scanAndCompactJs(src) {
  const s = String(src ?? '').replace(/\r\n/g, '\n');
  if (!s) return { code: '', mode: 'code', tplDepth: 0 };

  let mode = 'code'; // 'code' | 'sq' | 'dq' | 'lineComment' | 'blockComment' | 'regex' | 'tpl'
  let inRegexClass = false;
  let blockCommentHasNewline = false;
  const tplStack = []; // stack of open '{' counts inside each nested ${...}
  let lastSigChar = '';
  let lastIdent = '';
  let curIdent = '';
  let lineHasCode = false;
  let pendingSpace = false;
  let lastOutChar = '';
  const chunks = [];

  const pushRaw = (ch) => {
    chunks.push(ch);
    lastOutChar = ch;
  };

  const flushPendingSpace = (nextCh, force = false) => {
    if (!pendingSpace) return;
    if (force || needsCodeSpace(lastOutChar, nextCh)) {
      pushRaw(' ');
    }
    pendingSpace = false;
  };

  const flushIdent = () => {
    if (curIdent) {
      lastIdent = curIdent;
      lastSigChar = '';
      curIdent = '';
    }
  };

  const canStartRegex = () => {
    if (lastIdent) return REGEX_PRECEDING_KEYWORDS.has(lastIdent);
    return REGEX_PRECEDING_PUNCT.has(lastSigChar);
  };

  const emitCodeChar = (ch) => {
    if (ch === '\n') {
      flushIdent();
      pendingSpace = false;
      if (lineHasCode) {
        pushRaw('\n');
        lineHasCode = false;
      }
      return;
    }
    if (ch === ' ' || ch === '\t') {
      flushIdent();
      if (lineHasCode) pendingSpace = true;
      return;
    }
    flushPendingSpace(ch);
    pushRaw(ch);
    lineHasCode = true;
  };

  const len = s.length;
  for (let i = 0; i < len; i += 1) {
    const ch = s[i];
    const next = i + 1 < len ? s[i + 1] : '';

    if (mode === 'lineComment') {
      if (ch === '\n') {
        mode = 'code';
        emitCodeChar('\n');
      }
      continue;
    }

    if (mode === 'blockComment') {
      if (ch === '\n') {
        blockCommentHasNewline = true;
      } else if (ch === '*' && next === '/') {
        mode = 'code';
        i += 1;
        if (blockCommentHasNewline) {
          emitCodeChar('\n');
        } else if (lineHasCode) {
          pendingSpace = true;
        }
        blockCommentHasNewline = false;
      }
      continue;
    }

    if (mode === 'sq' || mode === 'dq') {
      pushRaw(ch);
      if (ch === '\\' && i + 1 < len) {
        pushRaw(s[i + 1]);
        i += 1;
        continue;
      }
      if ((mode === 'sq' && ch === "'") || (mode === 'dq' && ch === '"')) {
        mode = 'code';
        lastSigChar = ch;
        lastIdent = '';
      }
      continue;
    }

    if (mode === 'regex') {
      pushRaw(ch);
      if (ch === '\\' && i + 1 < len) {
        pushRaw(s[i + 1]);
        i += 1;
        continue;
      }
      if (ch === '[' && !inRegexClass) {
        inRegexClass = true;
      } else if (ch === ']' && inRegexClass) {
        inRegexClass = false;
      } else if (ch === '/' && !inRegexClass) {
        mode = 'code';
        lastSigChar = ')';
        lastIdent = '';
      }
      continue;
    }

    if (mode === 'tpl') {
      pushRaw(ch);
      if (ch === '\\' && i + 1 < len) {
        pushRaw(s[i + 1]);
        i += 1;
        continue;
      }
      if (ch === '$' && next === '{') {
        pushRaw('{');
        i += 1;
        tplStack.push(1);
        mode = 'code';
        lineHasCode = true;
        lastSigChar = '{';
        lastIdent = '';
        curIdent = '';
        continue;
      }
      if (ch === '`') {
        mode = 'code';
        lineHasCode = true;
        lastSigChar = ')';
        lastIdent = '';
      }
      continue;
    }

    // mode === 'code'
    if (ch === '/' && next === '/') {
      flushIdent();
      mode = 'lineComment';
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      flushIdent();
      mode = 'blockComment';
      blockCommentHasNewline = false;
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      flushIdent();
      flushPendingSpace(ch);
      pushRaw(ch);
      lineHasCode = true;
      mode = ch === "'" ? 'sq' : 'dq';
      continue;
    }
    if (ch === '`') {
      flushIdent();
      flushPendingSpace(ch);
      pushRaw(ch);
      lineHasCode = true;
      mode = 'tpl';
      continue;
    }
    if (ch === '/') {
      flushIdent();
      if (canStartRegex()) {
        flushPendingSpace('/', isIdentChar(lastOutChar) || lastOutChar === '/');
        pushRaw(ch);
        lineHasCode = true;
        mode = 'regex';
        inRegexClass = false;
        continue;
      }
      emitCodeChar(ch);
      lastSigChar = '/';
      lastIdent = '';
      continue;
    }

    if (ch === '{' && tplStack.length > 0) {
      tplStack[tplStack.length - 1] += 1;
    } else if (ch === '}' && tplStack.length > 0) {
      tplStack[tplStack.length - 1] -= 1;
      if (tplStack[tplStack.length - 1] === 0) {
        tplStack.pop();
        flushIdent();
        flushPendingSpace('}');
        pushRaw('}');
        lineHasCode = true;
        mode = 'tpl';
        continue;
      }
    }

    if (isIdentChar(ch)) {
      emitCodeChar(ch);
      curIdent += ch;
      continue;
    }

    if (ch === ' ' || ch === '\t' || ch === '\n') {
      emitCodeChar(ch);
      continue;
    }

    flushIdent();
    emitCodeChar(ch);
    lastSigChar = ch;
    lastIdent = '';
  }

  return {
    code: chunks.join('').replace(/\n+$/, ''),
    mode: mode === 'lineComment' ? 'code' : mode,
    tplDepth: tplStack.length,
  };
}

/**
 * Zero-dependency, lexer-aware JS compactor for CDP inject bundles.
 * Safely strips comments, blank lines, and redundant code whitespace while
 * preserving strings, regex literals (including character classes), and
 * arbitrarily nested multiline template literals verbatim.
 */
export function compactCoreSource(src) {
  return scanAndCompactJs(src).code;
}

export function inspectCoreLexState(src) {
  const { mode, tplDepth } = scanAndCompactJs(src);
  return { mode, tplDepth };
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

function compactCorePart(part) {
  let code = compactCoreSource(part.code);
  if (part.file === 'styles.js') {
    code = code.replace(/const CORE_CSS\s*=\s*`([\s\S]*?)`\.trim\(\)/, (_m, css) => {
      const minCss = css
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^[ \t]+|[ \t]+$/gm, '')
        .replace(/\n+/g, '');
      return `const CORE_CSS=\`${minCss}\`.trim()`;
    });
  }
  return code;
}

export function computeCoreHash(parts = readCoreSources(), opts = {}) {
  const useCompact = opts.compact !== false;
  const combined = parts
    .map((p) => `/* ${p.file} */\n${useCompact ? compactCorePart(p) : p.code}`)
    .join('\n;\n');
  return crypto.createHash('sha256').update(combined).digest('hex').slice(0, 16);
}

export function buildInjectExpression(config = null, opts = {}) {
  const parts = readCoreSources();
  const useCompact = opts.compact !== false;
  const combined = parts
    .map((p) => `/* ${p.file} */\n${useCompact ? compactCorePart(p) : p.code}`)
    .join('\n;\n');
  const codeHash = crypto.createHash('sha256').update(combined).digest('hex').slice(0, 16);
  const cfgJson = JSON.stringify(config && typeof config === 'object' ? config : null);
  const sourceJson = JSON.stringify(typeof opts.source === 'string' && opts.source ? opts.source : 'standalone');

  const resolvedExtLoc = opts.deferExtPack
    ? null
    : resolveInjectExtLocale(
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
