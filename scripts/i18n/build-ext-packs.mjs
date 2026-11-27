#!/usr/bin/env node
/**
 * Merges translated batch outputs into packages/core/locales/ext/<locale>.json,
 * validates placeholders, regex safety, core deduplication & bundle size <= 1.6 MB.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildInjectExpression } from '../../cli/bundle.mjs';

const require = createRequire(import.meta.url);
const packsMod = require('../../packages/core/host-i18n-packs.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_LOCALES = ['zh-TW', 'ja', 'ko', 'es', 'fr', 'de', 'ru', 'pt-BR'];
const UPSTREAM_SOURCE = 'yiheng8023/antigravity-chinese (MIT, English source table) + agy-Sag assisted translation';
const UPSTREAM_REF = 'v3.3.65 (98301f853d3af3d49ae0da17fa8d89425473d037)';
const MAX_BUNDLE_BYTES = Math.floor(1.6 * 1024 * 1024); // 1,677,721 bytes
const MAX_EXACT_LEN = 400;

function parseArgs(argv) {
  let source = '';
  let batchesOut = '';
  let locales = [...DEFAULT_LOCALES];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--source' && argv[i + 1]) source = path.resolve(argv[++i]);
    else if (a.startsWith('--source=')) source = path.resolve(a.slice('--source='.length));
    else if (a === '--batches-out' && argv[i + 1]) batchesOut = path.resolve(argv[++i]);
    else if (a.startsWith('--batches-out=')) batchesOut = path.resolve(a.slice('--batches-out='.length));
    else if (a === '--locales' && argv[i + 1]) locales = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith('--locales=')) locales = a.slice('--locales='.length).split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (!source || !batchesOut) {
    throw new Error('Usage: build-ext-packs.mjs --source <source-entries.json> --batches-out <out-dir> [--locales ja,de,...]');
  }
  return { source, batchesOut, locales };
}

function extractPlaceholders(str) {
  const set = new Set();
  const re = /\{([1-9][0-9]*)\}/g;
  let m;
  while ((m = re.exec(String(str || ''))) !== null) {
    set.add(Number(m[1]));
  }
  return Array.from(set).sort((a, b) => a - b);
}

function sameNumberArray(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function extractInlineCodeAndUrls(str) {
  const backticks = [];
  const btRe = /`([^`\n]+)`/g;
  let m;
  while ((m = btRe.exec(String(str || ''))) !== null) {
    backticks.push(m[1]);
  }
  const urls = [];
  const urlRe = /https?:\/\/[^\s`"'<>()]+/g;
  while ((m = urlRe.exec(String(str || ''))) !== null) {
    urls.push(m[0]);
  }
  return { backticks, urls };
}

function hasUnsafeNestedQuantifiers(source) {
  // Reject obvious nested quantifiers such as (.+)+ or (.*)* that could cause ReDoS
  return /\((?:[^()\\]|\\.)*[+*][^()]*\)[+*{]/.test(String(source || ''));
}

function loadLocaleTranslations(locDir) {
  const merged = {};
  if (!fs.existsSync(locDir)) return merged;
  for (const file of fs.readdirSync(locDir).sort()) {
    if (!/^b\d+\.json$/.test(file)) continue;
    const raw = fs.readFileSync(path.join(locDir, file), 'utf8');
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string') merged[k] = v;
      }
    }
  }
  return merged;
}

function main() {
  const { source, batchesOut, locales } = parseArgs(process.argv.slice(2));
  const entries = JSON.parse(fs.readFileSync(source, 'utf8'));

  packsMod.clearExtendedPacks?.();
  const keepSet = new Set();
  for (const k of packsMod.KEEP_UNTRANSLATED_EXACT || []) {
    keepSet.add(k);
    keepSet.add(String(k).trim());
  }

  const extDir = path.join(REPO_ROOT, 'packages', 'core', 'locales', 'ext');
  fs.mkdirSync(extDir, { recursive: true });

  const reports = [];
  for (const loc of locales) {
    const corePack = packsMod.getPack(loc);
    const coreExactKeys = new Set(Object.keys(corePack.exact || {}));
    const corePatternSources = new Set((corePack.patterns || []).map((p) => String(p.source || '')));

    const transMap = loadLocaleTranslations(path.join(batchesOut, loc));
    const exact = Object.create(null);
    const patterns = [];

    const stats = {
      locale: loc,
      exactAdded: 0,
      patternAdded: 0,
      skippedLong: 0,
      skippedCoreDup: 0,
      skippedKeep: 0,
      droppedMissing: 0,
      droppedEmpty: 0,
      droppedUnchanged: 0,
      droppedPlaceholderMismatch: 0,
      droppedCodeOrUrl: 0,
      droppedBadRegex: 0,
    };

    for (const item of entries) {
      if (item.kind === 'exact') {
        const en = item.en;
        if (typeof en !== 'string' || !en.trim()) continue;
        if (en.length > MAX_EXACT_LEN) {
          stats.skippedLong += 1;
          continue;
        }
        if (keepSet.has(en) || keepSet.has(en.trim())) {
          stats.skippedKeep += 1;
          continue;
        }
        if (coreExactKeys.has(en)) {
          stats.skippedCoreDup += 1;
          continue;
        }

        const tr = transMap[item.id];
        if (tr === undefined) {
          stats.droppedMissing += 1;
          continue;
        }
        if (typeof tr !== 'string' || !tr.trim()) {
          stats.droppedEmpty += 1;
          continue;
        }
        if (tr.trim() === en.trim()) {
          stats.droppedUnchanged += 1;
          continue;
        }

        const srcPh = extractPlaceholders(en);
        const dstPh = extractPlaceholders(tr);
        if (!sameNumberArray(srcPh, dstPh)) {
          stats.droppedPlaceholderMismatch += 1;
          continue;
        }

        const { backticks, urls } = extractInlineCodeAndUrls(en);
        let codeOrUrlMissing = false;
        for (const bt of backticks) {
          if (!tr.includes(`\`${bt}\``) && !tr.includes(bt)) {
            codeOrUrlMissing = true;
            break;
          }
        }
        if (!codeOrUrlMissing) {
          for (const u of urls) {
            if (!tr.includes(u)) {
              codeOrUrlMissing = true;
              break;
            }
          }
        }
        if (codeOrUrlMissing) {
          stats.droppedCodeOrUrl += 1;
          continue;
        }

        exact[en] = tr;
        stats.exactAdded += 1;
      } else if (item.kind === 'pattern') {
        const regexSrc = item.regex;
        const flags = typeof item.flags === 'string' ? item.flags.replace(/[gy]/g, '') : '';
        if (!regexSrc) continue;
        if (corePatternSources.has(regexSrc)) {
          stats.skippedCoreDup += 1;
          continue;
        }
        if (hasUnsafeNestedQuantifiers(regexSrc)) {
          stats.droppedBadRegex += 1;
          continue;
        }
        const groups = packsMod.countCapturingGroups(regexSrc);
        try {
          new RegExp(regexSrc, flags);
        } catch {
          stats.droppedBadRegex += 1;
          continue;
        }

        const tr = transMap[item.id];
        if (tr === undefined) {
          stats.droppedMissing += 1;
          continue;
        }
        if (typeof tr !== 'string' || !tr.trim()) {
          stats.droppedEmpty += 1;
          continue;
        }

        const zhPh = extractPlaceholders(item.zh || '');
        const dstPh = extractPlaceholders(tr);
        if (!sameNumberArray(zhPh, dstPh) || dstPh.some((idx) => idx > groups)) {
          stats.droppedPlaceholderMismatch += 1;
          continue;
        }

        const clean = packsMod.sanitizePatternEntry({ source: regexSrc, flags, replace: tr });
        if (!clean) {
          stats.droppedBadRegex += 1;
          continue;
        }
        patterns.push(clean);
        stats.patternAdded += 1;
      }
    }

    const total = stats.exactAdded + stats.patternAdded;
    const outObj = {
      meta: {
        locale: loc,
        schemaVersion: 2,
        source: UPSTREAM_SOURCE,
        sourceRef: UPSTREAM_REF,
        generatedAt: new Date().toISOString(),
        count: total,
      },
      exact,
      patterns,
    };

    const outPath = path.join(extDir, `${loc}.json`);
    fs.writeFileSync(outPath, JSON.stringify(outObj, null, 2) + '\n');

    const bundleExpr = buildInjectExpression({ hostI18nLocale: loc }, { extLocale: loc });
    const bundleBytes = Buffer.byteLength(bundleExpr, 'utf8');
    stats.fileBytes = fs.statSync(outPath).size;
    stats.bundleBytes = bundleBytes;
    if (bundleBytes > MAX_BUNDLE_BYTES) {
      throw new Error(`Injected bundle for ${loc} is ${bundleBytes} B (> ${MAX_BUNDLE_BYTES} B limit)`);
    }
    reports.push(stats);
  }

  console.log(JSON.stringify({ ok: true, reports }, null, 2));
}

main();
