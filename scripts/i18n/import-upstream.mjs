#!/usr/bin/env node
/**
 * agy-Sag — Upstream Dictionary Importer (Zero runtime deps, dev-time script)
 *
 * Imports yiheng8023/antigravity-chinese (MIT) dict/zh-CN.json + scoped plugin descriptions
 * and optional English-only keys from an external dictionary source, excluding built-in core
 * 465 entries and KEEP_UNTRANSLATED_EXACT, then emits:
 *   1. packages/core/locales/ext/zh-CN.json
 *   2. source-entries.json (for multi-locale translation workflow)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const require = createRequire(import.meta.url);
const packsMod = require(path.join(REPO_ROOT, 'packages', 'core', 'host-i18n-packs.js'));

const BACKREFERENCE_RE = /(?:^|[^\\])(?:\\\\)*\\(?:[1-9]|k<[^>]+>)/;
const NESTED_QUANTIFIER_RE = /\((?:[^()\\]|\\.)*[+*}|?](?:[^()\\]|\\.)*\)\s*[+*{]/;

function hasUnsafeRegex(source) {
  if (typeof source !== 'string' || !source.trim() || source.length > 260) return true;
  if (BACKREFERENCE_RE.test(source) || NESTED_QUANTIFIER_RE.test(source)) return true;
  const stack = [];
  let inClass = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (inClass) {
      if (ch === ']') inClass = false;
      continue;
    }
    if (ch === '[') {
      inClass = true;
      continue;
    }
    if (ch === '(') {
      stack.push(false);
      continue;
    }
    if (ch === ')') {
      const had = stack.length > 0 ? stack.pop() : false;
      if (had) {
        let j = i + 1;
        while (j < source.length && /\s/.test(source[j])) j += 1;
        if (source[j] === '+' || source[j] === '*' || source[j] === '{') return true;
        if (stack.length > 0) stack[stack.length - 1] = true;
      }
      continue;
    }
    if (stack.length > 0 && (ch === '+' || ch === '*' || ch === '?' || ch === '|' || ch === '{')) {
      stack[stack.length - 1] = true;
    }
  }
  return false;
}

function countCapturingGroups(source) {
  try {
    const m = new RegExp(String(source) + '|').exec('');
    return m ? Math.max(0, m.length - 1) : 0;
  } catch {
    return -1;
  }
}

export function convertUpstreamReplacement(raw) {
  const s = String(raw ?? '');
  if (!s.trim()) return { ok: false, reason: 'empty' };
  if (/\$&|\$<|\$`|\$'|\$\+/.test(s)) {
    return { ok: false, reason: 'unsupported-dollar-syntax' };
  }
  const converted = s.replace(/\$\$/g, '__AGY_LITERAL_DOLLAR__').replace(/\$(\d+)/g, '{$1}').replace(/__AGY_LITERAL_DOLLAR__/g, '$');
  return { ok: true, replace: converted };
}

export function importUpstreamDictionaries({
  upstreamPath,
  pluginsPath = null,
  prismPath = null,
  sourceRef = 'v3.3.65',
  outExtZhPath = path.join(REPO_ROOT, 'packages', 'core', 'locales', 'ext', 'zh-CN.json'),
  outSourceEntriesPath = null,
} = {}) {
  if (!upstreamPath || !fs.existsSync(upstreamPath)) {
    throw new Error(`Upstream zh-CN.json not found: ${upstreamPath}`);
  }
  const upstream = JSON.parse(fs.readFileSync(upstreamPath, 'utf8'));
  const coreZh = packsMod.getPack('zh-CN');
  const coreExactKeys = new Set(Object.keys(coreZh.exact || {}));
  const corePatternSources = new Set((coreZh.patterns || []).map((p) => p.source));
  const keepSet = new Set();
  for (const k of packsMod.KEEP_UNTRANSLATED_EXACT || []) {
    keepSet.add(k);
    keepSet.add(String(k).trim());
  }

  const extExact = {};
  const stats = {
    upstreamExact: 0,
    pluginExactAdded: 0,
    prismEnOnlyAdded: 0,
    skippedCoreExact: 0,
    skippedKeepExact: 0,
    skippedInvalidExact: 0,
    upstreamPatterns: 0,
    extPatternsKept: 0,
    droppedPatterns: 0,
    droppedPatternReasons: {},
  };

  const addExact = (en, zh, origin) => {
    if (typeof en !== 'string' || typeof zh !== 'string') {
      stats.skippedInvalidExact += 1;
      return;
    }
    const trimEn = en.trim();
    const trimZh = zh.trim();
    if (!trimEn || !trimZh) {
      stats.skippedInvalidExact += 1;
      return;
    }
    if (keepSet.has(en) || keepSet.has(trimEn)) {
      stats.skippedKeepExact += 1;
      return;
    }
    if (coreExactKeys.has(en)) {
      stats.skippedCoreExact += 1;
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(extExact, en)) {
      extExact[en] = zh;
      if (origin === 'plugin') stats.pluginExactAdded += 1;
    }
  };

  const rawExact = upstream?.exact && typeof upstream.exact === 'object' ? upstream.exact : {};
  stats.upstreamExact = Object.keys(rawExact).length;
  for (const [en, zh] of Object.entries(rawExact)) {
    addExact(en, zh, 'upstream');
  }

  if (pluginsPath && fs.existsSync(pluginsPath)) {
    const pluginsJson = JSON.parse(fs.readFileSync(pluginsPath, 'utf8'));
    for (const [en, entry] of Object.entries(pluginsJson || {})) {
      const zh = entry && typeof entry === 'object' ? entry.translation : null;
      if (typeof zh === 'string' && zh.trim()) {
        addExact(en, zh, 'plugin');
      }
    }
  }

  // Extract English-only extra keys from Prism dictionary (NEVER copy Prism translations)
  const extraEnglishOnly = [];
  if (prismPath && fs.existsSync(prismPath)) {
    const prismJson = JSON.parse(fs.readFileSync(prismPath, 'utf8'));
    const prismExact = prismJson?.exact && typeof prismJson.exact === 'object' ? prismJson.exact : {};
    for (const en of Object.keys(prismExact)) {
      if (
        typeof en === 'string' &&
        en.trim() &&
        !keepSet.has(en) &&
        !keepSet.has(en.trim()) &&
        !coreExactKeys.has(en) &&
        !Object.prototype.hasOwnProperty.call(extExact, en)
      ) {
        extraEnglishOnly.push(en);
        stats.prismEnOnlyAdded += 1;
      }
    }
  }

  const extPatterns = [];
  const seenPatternSources = new Set(corePatternSources);
  const rawPatterns = Array.isArray(upstream?.patterns) ? upstream.patterns : [];
  stats.upstreamPatterns = rawPatterns.length;

  const dropPat = (reason) => {
    stats.droppedPatterns += 1;
    stats.droppedPatternReasons[reason] = (stats.droppedPatternReasons[reason] || 0) + 1;
  };

  for (const item of rawPatterns) {
    const source = String(item?.regex ?? item?.source ?? '');
    const flags = String(item?.flags ?? '').replace(/[gy]/g, '');
    if (!source.trim()) {
      dropPat('empty-source');
      continue;
    }
    if (seenPatternSources.has(source)) {
      dropPat('duplicate-or-core');
      continue;
    }
    if (hasUnsafeRegex(source)) {
      dropPat('unsafe-regex');
      continue;
    }
    const groups = countCapturingGroups(source);
    if (groups < 0) {
      dropPat('invalid-regex');
      continue;
    }
    const conv = convertUpstreamReplacement(item?.replacement ?? item?.replace);
    if (!conv.ok) {
      dropPat(conv.reason);
      continue;
    }
    let outOfRange = false;
    for (const m of conv.replace.matchAll(/\{(\d+)\}/g)) {
      const idx = Number(m[1]);
      if (idx < 1 || idx > groups) {
        outOfRange = true;
        break;
      }
    }
    if (outOfRange) {
      dropPat('placeholder-out-of-range');
      continue;
    }
    seenPatternSources.add(source);
    extPatterns.push({ source, flags, replace: conv.replace });
  }
  stats.extPatternsKept = extPatterns.length;

  const extPack = {
    meta: {
      locale: 'zh-CN',
      schemaVersion: 2,
      source: 'yiheng8023/antigravity-chinese',
      sourceRef,
      generatedAt: new Date().toISOString(),
      count: Object.keys(extExact).length + extPatterns.length,
    },
    exact: extExact,
    patterns: extPatterns,
  };

  fs.mkdirSync(path.dirname(outExtZhPath), { recursive: true });
  fs.writeFileSync(outExtZhPath, JSON.stringify(extPack, null, 2) + '\n', 'utf8');

  const sourceEntries = [];
  let seq = 1;
  for (const [en, zh] of Object.entries(extExact)) {
    sourceEntries.push({ id: `e${seq++}`, kind: 'exact', en, zh });
  }
  for (const en of extraEnglishOnly) {
    sourceEntries.push({ id: `e${seq++}`, kind: 'exact', en, zh: '' });
  }
  for (const pat of extPatterns) {
    sourceEntries.push({
      id: `p${seq++}`,
      kind: 'pattern',
      regex: pat.source,
      flags: pat.flags,
      en: pat.replace,
      zh: pat.replace,
    });
  }

  if (outSourceEntriesPath) {
    fs.mkdirSync(path.dirname(outSourceEntriesPath), { recursive: true });
    fs.writeFileSync(outSourceEntriesPath, JSON.stringify(sourceEntries, null, 2) + '\n', 'utf8');
  }

  return {
    outExtZhPath,
    outSourceEntriesPath,
    stats: {
      ...stats,
      extExactKept: Object.keys(extExact).length,
      totalSourceEntries: sourceEntries.length,
    },
  };
}

function parseArgs(argv) {
  const args = {};
  for (const a of argv) {
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq > 2) {
      args[a.slice(2, eq)] = a.slice(eq + 1);
    }
  }
  return args;
}

const isEntry = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isEntry) {
  const args = parseArgs(process.argv.slice(2));
  const upstreamPath = args.upstream || process.env.AGY_I18N_UPSTREAM;
  if (!upstreamPath) {
    console.error('Usage: node scripts/i18n/import-upstream.mjs --upstream=<path/to/zh-CN.json> [--plugins=<path>] [--prism=<path>] [--ref=<tag>] [--source-entries=<path>]');
    process.exit(1);
  }
  const res = importUpstreamDictionaries({
    upstreamPath,
    pluginsPath: args.plugins || null,
    prismPath: args.prism || null,
    sourceRef: args.ref || 'v3.3.65 (98301f853d3af3d49ae0da17fa8d89425473d037)',
    outExtZhPath: args.out || undefined,
    outSourceEntriesPath: args['source-entries'] || null,
  });
  console.log(JSON.stringify(res, null, 2));
}
