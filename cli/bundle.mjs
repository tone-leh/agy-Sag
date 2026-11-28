// agy-Sag — Zero-Dependency Bundle Builder (ESM)
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

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
  'thought-translator.js',
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
  'settings/tab-overview.js',
  'settings/tab-ui.js',
  'settings/tab-conversation.js',
  'settings/tab-guard.js',
  'settings/tab-nov.js',
  'settings/tab-advanced.js',
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
  '__agSagThoughtTranslator',
  '__agSagPromptQueue',
  '__agSagPromptLibrary',
  '__agSagReadingNav',
  '__agSagSafeAutoAccept',
  '__agSagThemeStudio',
  '__agSagQuotaPulse',
  '__agSagNovSynergy',
  '__agSagBridgeReceiver',
  '__agSagHostBridge',
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
  '__agSagSettingsTabOverview',
  '__agSagSettingsTabUi',
  '__agSagSettingsTabConversation',
  '__agSagSettingsTabGuard',
  '__agSagSettingsTabNov',
  '__agSagSettingsTabAdvanced',
  '__agSgPrismBridge',
  '__agSgOutlineBookmarks',
  '__agSgStyles',
  '__agSgCompactGuard',
  '__agSgSessionRadar',
];

export const REMOVE_EXPRESSION = `(() => {
  const curOwner = window.__agSagOwner || window.__agSessionGuardOwner;
  if (curOwner && curOwner !== 'standalone') {
    return { ok: true, status: 'yielded', owner: curOwner };
  }
  try { window.__agSag?.destroy?.(); } catch {}
  try { window.__agSessionGuard?.destroy?.(); } catch {}
  try { delete window.__agSagBridgeReceiver; } catch {}
  try { delete window.__agSagHostBridge; } catch {}
  try { delete window.__agSagNovSynergy; } catch {}
  try { document.getElementById('ag-sg-core-css')?.remove(); } catch {}
  try { document.getElementById('ag-sag-theme-css')?.remove(); } catch {}
  try { document.getElementById('ag-sag-queue-css')?.remove(); } catch {}
  try { document.querySelectorAll('[data-ag-sg-owned="1"], [data-ag-sag-owned="1"], .ag-sag-smooth-caret, .ag-sag-ambient-glow, .ag-sag-ctx-toast').forEach((n) => n.remove()); } catch {}
  try { document.querySelectorAll('[data-ag-sag-code-folded], [data-ag-sag-code-enhanced], [data-ag-sag-code-wrap], [data-ag-sag-smooth-caret], [data-ag-sag-caret-host], [data-ag-sag-thought-hidden]').forEach((n) => { n.removeAttribute('data-ag-sag-code-folded'); n.removeAttribute('data-ag-sag-code-enhanced'); n.removeAttribute('data-ag-sag-code-wrap'); n.removeAttribute('data-ag-sag-smooth-caret'); n.removeAttribute('data-ag-sag-caret-host'); if (n.hasAttribute('data-ag-sag-thought-hidden')) { n.removeAttribute('data-ag-sag-thought-hidden'); if (n.style) n.style.display = ''; } }); } catch {}
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
  try { window.__agSagManuallyRemoved = true; } catch {}
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

  const NO_ASI_AFTER = new Set([';', '{', ',', '(', '[', '=', '?', ':']);
  const emitCodeChar = (ch) => {
    if (ch === '\n') {
      flushIdent();
      pendingSpace = false;
      if (lineHasCode) {
        if (!NO_ASI_AFTER.has(lastOutChar)) {
          pushRaw('\n');
        }
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

function minifyStaticCss(css) {
  const s = String(css ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]+|[ \t]+$/gm, '')
    .replace(/\n+/g, '');
  let out = '';
  let quote = '';
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (quote) {
      out += ch;
      if (ch === '\\' && i + 1 < s.length) {
        out += s[i + 1];
        i += 1;
      } else if (ch === quote) {
        quote = '';
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === ' ' || ch === '\t') {
      const prev = out.length > 0 ? out[out.length - 1] : '';
      let j = i + 1;
      while (j < s.length && (s[j] === ' ' || s[j] === '\t')) j += 1;
      const next = j < s.length ? s[j] : '';
      i = j - 1;
      if ('{};,>~:'.includes(prev) || '{};,>~'.includes(next)) {
        continue;
      }
      out += ' ';
      continue;
    }
    out += ch;
  }
  return out;
}

function minifyThemeCssTemplates(code) {
  // Compact leading indentation and newlines strictly inside multiline CSS template literal segments in theme-studio.js,
  // skipping ${...} JS expressions intact so calc(...) spacing and JS tokens are preserved verbatim.
  let out = '';
  let i = 0;
  const len = code.length;
  while (i < len) {
    const ch = code[i];
    if (ch === "'" || ch === '"') {
      const q = ch;
      out += ch;
      i += 1;
      while (i < len) {
        const c = code[i];
        out += c;
        i += 1;
        if (c === '\\' && i < len) {
          out += code[i];
          i += 1;
        } else if (c === q) {
          break;
        }
      }
      continue;
    }
    if (ch !== '`') {
      out += ch;
      i += 1;
      continue;
    }
    // Scan template literal from opening ` to matching `
    let tplRaw = '`';
    i += 1;
    let seg = '';
    const flushSeg = () => {
      if (!seg) return;
      if (seg.includes('\n')) {
        tplRaw += minifyStaticCss(seg);
      } else {
        tplRaw += seg;
      }
      seg = '';
    };
    while (i < len) {
      const c = code[i];
      if (c === '\\' && i + 1 < len) {
        seg += c + code[i + 1];
        i += 2;
        continue;
      }
      if (c === '$' && code[i + 1] === '{') {
        flushSeg();
        tplRaw += '${';
        i += 2;
        let depth = 1;
        while (i < len && depth > 0) {
          const ec = code[i];
          if (ec === "'" || ec === '"' || ec === '`') {
            const q = ec;
            tplRaw += ec;
            i += 1;
            while (i < len) {
              const sc = code[i];
              tplRaw += sc;
              i += 1;
              if (sc === '\\' && i < len) {
                tplRaw += code[i];
                i += 1;
              } else if (sc === q) {
                break;
              }
            }
            continue;
          }
          if (ec === '{') depth += 1;
          else if (ec === '}') depth -= 1;
          tplRaw += ec;
          i += 1;
        }
        continue;
      }
      if (c === '`') {
        flushSeg();
        tplRaw += '`';
        i += 1;
        break;
      }
      seg += c;
      i += 1;
    }
    out += tplRaw;
  }
  return out;
}

function packExtExactLossless(exactObj) {
  const rawJson = JSON.stringify(exactObj || {});
  // Frequency-driven lossless dictionary substitution using Private Use Area codepoints (U+E000..U+E0BF).
  // Verified round-trip identical at bundle time; falls back to plain JSON if any collision occurs.
  const freq = new Map();
  const wordRe = /[A-Za-zА-Яа-яЁё0-9_-]{6,28}/g;
  let m;
  while ((m = wordRe.exec(rawJson)) !== null) {
    const tok = m[0];
    freq.set(tok, (freq.get(tok) || 0) + 1);
  }
  const candidates = Array.from(freq.entries())
    .map(([tok, cnt]) => ({ tok, cnt, gain: (cnt - 1) * (Buffer.byteLength(tok, 'utf8') - 3) - 6 }))
    .filter((x) => x.gain > 36)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 192);

  let packed = rawJson;
  const dict = [];
  for (const { tok } of candidates) {
    const ch = String.fromCharCode(0xe000 + dict.length);
    if (rawJson.includes(ch)) continue;
    const parts = packed.split(tok);
    if (parts.length > 3 && (parts.length - 1) * (Buffer.byteLength(tok, 'utf8') - 3) > Buffer.byteLength(tok, 'utf8') + 12) {
      packed = parts.join(ch);
      dict.push(tok);
    }
  }
  if (!dict.length) return null;
  let check = packed;
  for (let i = dict.length - 1; i >= 0; i -= 1) {
    check = check.split(String.fromCharCode(0xe000 + i)).join(dict[i]);
  }
  if (check !== rawJson) return null;
  return { d: dict, s: packed };
}

function parsePureString2DArray(arrSrc) {
  const rows = [];
  let i = 0;
  const n = arrSrc.length;
  const skipWs = () => { while (i < n && (arrSrc[i] === ' ' || arrSrc[i] === '\n' || arrSrc[i] === '\t' || arrSrc[i] === '\r')) i += 1; };
  skipWs();
  if (arrSrc[i] !== '[') return null;
  i += 1;
  while (i < n) {
    skipWs();
    if (arrSrc[i] === ']') { i += 1; return rows; }
    if (arrSrc[i] !== '[') return null;
    i += 1;
    const row = [];
    while (i < n) {
      skipWs();
      if (arrSrc[i] === ']') { i += 1; break; }
      const q = arrSrc[i];
      if (q !== "'" && q !== '"') return null;
      i += 1;
      let val = '';
      while (i < n && arrSrc[i] !== q) {
        if (arrSrc[i] === '\\' && i + 1 < n) {
          const esc = arrSrc[i + 1];
          val += esc === 'n' ? '\n' : esc === 'r' ? '\r' : esc === 't' ? '\t' : esc;
          i += 2;
        } else {
          val += arrSrc[i];
          i += 1;
        }
      }
      if (arrSrc[i] !== q) return null;
      i += 1;
      row.push(val);
      skipWs();
      if (arrSrc[i] === ',') i += 1;
    }
    rows.push(row);
    skipWs();
    if (arrSrc[i] === ',') i += 1;
  }
  return null;
}

function packHostI18nExactRows(code) {
  const marker = 'const EXACT_ROWS=';
  const start = code.indexOf(marker);
  if (start < 0) return code;
  const arrStart = start + marker.length;
  if (code[arrStart] !== '[') return code;
  let depth = 0;
  let quote = '';
  let arrEnd = -1;
  for (let i = arrStart; i < code.length; i += 1) {
    const c = code[i];
    if (quote) {
      if (c === '\\') { i += 1; continue; }
      if (c === quote) quote = '';
      continue;
    }
    if (c === "'" || c === '"') { quote = c; continue; }
    if (c === '[') depth += 1;
    else if (c === ']') {
      depth -= 1;
      if (depth === 0) { arrEnd = i + 1; break; }
    }
  }
  if (arrEnd < 0) return code;
  const parsed = parsePureString2DArray(code.slice(arrStart, arrEnd));
  if (!parsed || !parsed.length) return code;
  // Pick two 1-byte unescaped ASCII separators guaranteed absent from parsed cells (fallback to 2-byte ¦/§)
  const sepCandidates = ['~', '^', '`', '|', '¦', '§'];
  const allText = parsed.map((r) => r.join('')).join('');
  const freeSeps = sepCandidates.filter((ch) => !allText.includes(ch));
  if (freeSeps.length < 2) return code;
  const colSep = freeSeps[0];
  const rowSep = freeSeps[1];
  const flat = parsed.map((row) => row.join(colSep)).join(rowSep);
  const freq = new Map();
  const wordRe = /[\u4e00-\u9fff]{2,5}|[A-Za-zА-Яа-яЁёÀ-ÿ0-9_-]{5,24}/g;
  let m;
  while ((m = wordRe.exec(flat)) !== null) {
    freq.set(m[0], (freq.get(m[0]) || 0) + 1);
  }
  const candidates = Array.from(freq.entries())
    .map(([tok, cnt]) => ({ tok, cnt, gain: (cnt - 1) * (Buffer.byteLength(tok, 'utf8') - 3) - 6 }))
    .filter((x) => x.gain > 16)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 224);
  let packed = flat;
  const dict = [];
  for (const { tok } of candidates) {
    const ch = String.fromCharCode(0xe000 + dict.length);
    if (flat.includes(ch)) continue;
    const parts = packed.split(tok);
    if (parts.length > 3 && (parts.length - 1) * (Buffer.byteLength(tok, 'utf8') - 3) > Buffer.byteLength(tok, 'utf8') + 10) {
      packed = parts.join(ch);
      dict.push(tok);
    }
  }
  let check = packed;
  for (let i = dict.length - 1; i >= 0; i -= 1) {
    check = check.split(String.fromCharCode(0xe000 + i)).join(dict[i]);
  }
  if (check !== flat) return code;
  const replacement = `(()=>{const _d=${JSON.stringify(dict)};let _s=${JSON.stringify(packed)};for(let i=_d.length-1;i>=0;i--)_s=_s.split(String.fromCharCode(0xe000+i)).join(_d[i]);return _s.split(${JSON.stringify(rowSep)}).map(r=>r.split(${JSON.stringify(colSep)}));})()`;
  if (Buffer.byteLength(replacement, 'utf8') >= Buffer.byteLength(code.slice(arrStart, arrEnd), 'utf8')) return code;
  return code.slice(0, arrStart) + replacement + code.slice(arrEnd);
}

function packStaticJsonConst(code, constName, obj) {
  if (!obj || typeof obj !== 'object') return code;
  const marker = `const ${constName}=`;
  const start = code.indexOf(marker);
  if (start < 0) return code;
  const objStart = start + marker.length;
  if (code[objStart] !== '{') return code;
  let depth = 0;
  let quote = '';
  let objEnd = -1;
  for (let i = objStart; i < code.length; i += 1) {
    const c = code[i];
    if (quote) {
      if (c === '\\') { i += 1; continue; }
      if (c === quote) quote = '';
      continue;
    }
    if (c === "'" || c === '"') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) { objEnd = i + 1; break; }
    }
  }
  if (objEnd < 0) return code;
  const rawJson = JSON.stringify(obj);
  const freq = new Map();
  const wordRe = /"[A-Za-z0-9_]{4,30}":|[\u4e00-\u9fff]{2,6}|[A-Za-zÀ-ÿ0-9_-]{4,28}/g;
  let m;
  while ((m = wordRe.exec(rawJson)) !== null) {
    freq.set(m[0], (freq.get(m[0]) || 0) + 1);
  }
  const candidates = Array.from(freq.entries())
    .map(([tok, cnt]) => ({ tok, cnt, gain: (cnt - 1) * (Buffer.byteLength(tok, 'utf8') - 3) - 6 }))
    .filter((x) => x.gain > 10)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 384);
  let packed = rawJson;
  const dict = [];
  for (const { tok } of candidates) {
    const ch = String.fromCharCode(0xe000 + dict.length);
    if (rawJson.includes(ch)) continue;
    const parts = packed.split(tok);
    if (parts.length > 3 && (parts.length - 1) * (Buffer.byteLength(tok, 'utf8') - 3) > Buffer.byteLength(tok, 'utf8') + 8) {
      packed = parts.join(ch);
      dict.push(tok);
    }
  }
  if (!dict.length) return code;
  let check = packed;
  for (let i = dict.length - 1; i >= 0; i -= 1) {
    check = check.split(String.fromCharCode(0xe000 + i)).join(dict[i]);
  }
  if (check !== rawJson) return code;
  // Single-quoted JS string literal avoids double-escaping all JSON double quotes (saves ~8 KB per pack)
  const sqEsc = (s) =>
    "'" +
    s
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029') +
    "'";
  const dictSrc = `[${dict.map(sqEsc).join(',')}]`;
  const replacement = `(()=>{const _d=${dictSrc};let _s=${sqEsc(packed)};for(let i=_d.length-1;i>=0;i--)_s=_s.split(String.fromCharCode(0xe000+i)).join(_d[i]);return JSON.parse(_s);})()`;
  if (Buffer.byteLength(replacement, 'utf8') >= Buffer.byteLength(code.slice(objStart, objEnd), 'utf8')) return code;
  return code.slice(0, objStart) + replacement + code.slice(objEnd);
}

function packStaticCssConst(css) {
  const min = minifyStaticCss(css);
  const freq = new Map();
  const tokRe = /color-mix\(in srgb,var\(--[a-z-]+|var\(--[a-z0-9-]{4,32}|rgba\(\d+,\d+,\d+,|[a-z-]{6,28}:/g;
  let m;
  while ((m = tokRe.exec(min)) !== null) {
    freq.set(m[0], (freq.get(m[0]) || 0) + 1);
  }
  const candidates = Array.from(freq.entries())
    .map(([tok, cnt]) => ({ tok, cnt, gain: (cnt - 1) * (Buffer.byteLength(tok, 'utf8') - 3) - 6 }))
    .filter((x) => x.gain > 12)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 256);
  let packed = min;
  const dict = [];
  for (const { tok } of candidates) {
    const ch = String.fromCharCode(0xe000 + dict.length);
    if (min.includes(ch)) continue;
    const parts = packed.split(tok);
    if (parts.length > 3 && (parts.length - 1) * (Buffer.byteLength(tok, 'utf8') - 3) > Buffer.byteLength(tok, 'utf8') + 10) {
      packed = parts.join(ch);
      dict.push(tok);
    }
  }
  if (!dict.length) return `\`${min}\`.trim()`;
  let check = packed;
  for (let i = dict.length - 1; i >= 0; i -= 1) {
    check = check.split(String.fromCharCode(0xe000 + i)).join(dict[i]);
  }
  if (check !== min) return `\`${min}\`.trim()`;
  const expr = `(()=>{const _d=${JSON.stringify(dict)};let _s=${JSON.stringify(packed)};for(let i=_d.length-1;i>=0;i--)_s=_s.split(String.fromCharCode(0xe000+i)).join(_d[i]);return _s;})()`;
  return Buffer.byteLength(expr, 'utf8') < Buffer.byteLength(min, 'utf8') ? expr : `\`${min}\`.trim()`;
}

function compactCorePart(part) {
  let code = compactCoreSource(part.code);
  if (part.file === 'styles.js') {
    code = code.replace(/const CORE_CSS\s*=\s*`([\s\S]*?)`\.trim\(\)/, (_m, css) => {
      return `const CORE_CSS=${packStaticCssConst(css)}`;
    });
  } else if (part.file === 'prompt-queue.js') {
    code = code.replace(/const QUEUE_CSS\s*=\s*`([\s\S]*?)`\.trim\(\)/, (_m, css) => {
      return `const QUEUE_CSS=\`${minifyStaticCss(css)}\`.trim()`;
    });
  } else if (part.file === 'status-pill.js') {
    code = code.replace(/const PRISM_SHADOW_CSS\s*=\s*`([\s\S]*?)`\.trim\(\)/, (_m, css) => {
      return `const PRISM_SHADOW_CSS=\`${minifyStaticCss(css)}\`.trim()`;
    });
  } else if (part.file === 'theme-studio.js') {
    code = minifyThemeCssTemplates(code);
  } else if (part.file === 'host-i18n-packs.js') {
    code = packHostI18nExactRows(code);
  } else if (part.file === 'i18n.js') {
    try {
      const i18nMod = require('../packages/core/i18n.js');
      code = packStaticJsonConst(code, 'PACKS', i18nMod?.PACKS);
      code = packStaticJsonConst(code, 'SAG_UI_PACKS', i18nMod?.SAG_UI_PACKS);
    } catch {}
  }
  return code;
}

function combineCoreParts(parts, useCompact) {
  return parts
    .map((p) => (useCompact ? compactCorePart(p) : `/* ${p.file} */\n${p.code}`))
    .join('\n;\n');
}

export function computeCoreHash(parts = readCoreSources(), opts = {}) {
  const useCompact = opts.compact !== false;
  const combined = combineCoreParts(parts, useCompact);
  return crypto.createHash('sha256').update(combined).digest('hex').slice(0, 16);
}

export function buildInjectExpression(config = null, opts = {}) {
  const parts = readCoreSources();
  const useCompact = opts.compact !== false;
  const combined = combineCoreParts(parts, useCompact);
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
  let extPrelude = '';
  if (extPack) {
    const compactPatterns = Array.isArray(extPack.patterns)
      ? extPack.patterns.map((p) => (p?.flags && p.flags !== 'i' ? [p.source, p.replace, p.flags] : [p?.source || '', p?.replace || '']))
      : [];
    const packedExact = packExtExactLossless(extPack.exact || {});
    if (packedExact) {
      const wirePack = {
        meta: { locale: extPack.meta?.locale || resolvedExtLoc },
        d: packedExact.d,
        s: packedExact.s,
        p: compactPatterns,
      };
      extPrelude = `(()=>{const _w=${JSON.stringify(wirePack)};let _s=_w.s;for(let i=_w.d.length-1;i>=0;i--)_s=_s.split(String.fromCharCode(0xe000+i)).join(_w.d[i]);window.__agSagExtPacks=window.__agSagExtPacks||{};window.__agSagExtPacks[${JSON.stringify(resolvedExtLoc)}]={meta:_w.meta,exact:JSON.parse(_s),patterns:_w.p.map(x=>({source:x[0],flags:x[2]||'i',replace:x[1]}))};})();`;
    } else {
      const wirePack = {
        meta: { locale: extPack.meta?.locale || resolvedExtLoc },
        exact: extPack.exact || {},
        p: compactPatterns,
      };
      extPrelude = `(()=>{const _w=${JSON.stringify(wirePack)};window.__agSagExtPacks=window.__agSagExtPacks||{};window.__agSagExtPacks[${JSON.stringify(resolvedExtLoc)}]={meta:_w.meta,exact:_w.exact,patterns:_w.p.map(x=>({source:x[0],flags:x[2]||'i',replace:x[1]}))};})();`;
    }
  }

  return `(() => {
  try {
    if (window.self !== window.top) return { ok: false, status: 'skipped-subframe' };
  } catch {
    return { ok: false, status: 'skipped-subframe' };
  }
  const targetHash = ${JSON.stringify(codeHash)};
  const bootCfg = ${cfgJson};
  const source = ${sourceJson};
  const respectManualRemove = ${JSON.stringify(Boolean(opts.respectManualRemove))};
  const curOwner = window.__agSagOwner || window.__agSessionGuardOwner;
  if (curOwner && curOwner !== source) {
    return { ok: true, yielded: true, owner: curOwner, codeHash: targetHash, brand: 'agy-Sag' };
  }
  if (respectManualRemove && window.__agSagManuallyRemoved) {
    return { ok: true, yielded: true, removedByUser: true, codeHash: targetHash, brand: 'agy-Sag' };
  }
  try { delete window.__agSagManuallyRemoved; } catch {}
  ${extPrelude}
  const prev = window.__agSag || window.__agSessionGuard;
  if (prev && !prev.getDebugState?.()?.destroyed && prev.__agSgHash === targetHash) {
    if (typeof prev.syncExtPacks === 'function') prev.syncExtPacks();
    if (bootCfg && typeof prev.updateConfig === 'function') prev.updateConfig(bootCfg);
    if (typeof prev.evaluateNow === 'function') void prev.evaluateNow();
    return { ok: true, reused: true, codeHash: targetHash, brand: 'agy-Sag' };
  }
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
  return { ok: Boolean(api), yielded: Boolean(api?.yielded), codeHash: targetHash, brand: 'agy-Sag', version: api?.version || '1.4.0' };
})()`;
}
