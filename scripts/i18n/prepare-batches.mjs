#!/usr/bin/env node
/**
 * Prepares translation batches (300 entries per batch) and per-locale glossaries
 * from scratch/i18n/source-entries.json and built-in 465 core packs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const packsMod = require('../../packages/core/host-i18n-packs.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET_LOCALES = ['zh-TW', 'ja', 'ko', 'es', 'fr', 'de', 'ru', 'pt-BR'];
const MAX_EXACT_LEN = 400;
const BATCH_SIZE = 300;

function parseArgs(argv) {
  let source = '';
  let out = '';
  let batchSize = BATCH_SIZE;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--source' && argv[i + 1]) {
      source = path.resolve(argv[++i]);
    } else if (a.startsWith('--source=')) {
      source = path.resolve(a.slice('--source='.length));
    } else if (a === '--out' && argv[i + 1]) {
      out = path.resolve(argv[++i]);
    } else if (a.startsWith('--out=')) {
      out = path.resolve(a.slice('--out='.length));
    } else if (a === '--batch-size' && argv[i + 1]) {
      batchSize = Number(argv[++i]) || BATCH_SIZE;
    } else if (a.startsWith('--batch-size=')) {
      batchSize = Number(a.slice('--batch-size='.length)) || BATCH_SIZE;
    }
  }
  if (!source) {
    console.error('Usage: prepare-batches.mjs --source <source-entries.json> [--out <out-dir>] [--batch-size=300]');
    process.exit(1);
  }
  if (!out) {
    out = path.dirname(source);
  }
  return { source, out, batchSize };
}

function main() {
  const { source, out, batchSize } = parseArgs(process.argv.slice(2));
  const raw = fs.readFileSync(source, 'utf8');
  const entries = JSON.parse(raw);

  const filtered = [];
  let skippedLong = 0;
  for (const item of entries) {
    if (item.kind === 'exact') {
      if (typeof item.en !== 'string' || !item.en.trim()) continue;
      if (item.en.length > MAX_EXACT_LEN) {
        skippedLong += 1;
        continue;
      }
      filtered.push({
        id: item.id,
        kind: 'exact',
        en: item.en,
        zh: typeof item.zh === 'string' ? item.zh : '',
      });
    } else if (item.kind === 'pattern') {
      if (typeof item.regex !== 'string' || !item.regex) continue;
      filtered.push({
        id: item.id,
        kind: 'pattern',
        regex: item.regex,
        flags: typeof item.flags === 'string' ? item.flags : '',
        zhTemplate: typeof item.zh === 'string' ? item.zh : '',
      });
    }
  }

  const batchesDir = path.join(out, 'batches');
  const glossaryDir = path.join(out, 'glossary');
  fs.mkdirSync(batchesDir, { recursive: true });
  fs.mkdirSync(glossaryDir, { recursive: true });

  // Clean old batch json files so count matches exact split
  for (const f of fs.readdirSync(batchesDir)) {
    if (/^b\d+\.json$/.test(f)) fs.unlinkSync(path.join(batchesDir, f));
  }

  const batchNames = [];
  for (let i = 0; i < filtered.length; i += batchSize) {
    const idx = Math.floor(i / batchSize) + 1;
    const name = `b${String(idx).padStart(2, '0')}`;
    const slice = filtered.slice(i, i + batchSize);
    fs.writeFileSync(path.join(batchesDir, `${name}.json`), JSON.stringify(slice, null, 2));
    batchNames.push(name);
  }

  // Ensure extended packs aren't loaded so glossary strictly uses built-in 465 core packs
  packsMod.clearExtendedPacks?.();
  const keepList = Array.from(packsMod.KEEP_UNTRANSLATED_EXACT || []);

  for (const loc of TARGET_LOCALES) {
    const core = packsMod.getPack(loc);
    const terms = {};
    for (const [en, trans] of Object.entries(core.exact || {})) {
      if (en.length <= 40 && typeof trans === 'string' && trans.trim()) {
        terms[en] = trans;
      }
    }
    fs.writeFileSync(
      path.join(glossaryDir, `${loc}.json`),
      JSON.stringify({ locale: loc, keepUntranslated: keepList, terms }, null, 2)
    );
  }

  const summary = {
    source,
    out,
    totalInput: entries.length,
    skippedLong,
    keptForTranslation: filtered.length,
    exactKept: filtered.filter((e) => e.kind === 'exact').length,
    patternKept: filtered.filter((e) => e.kind === 'pattern').length,
    batchCount: batchNames.length,
    batchNames,
    locales: TARGET_LOCALES,
  };
  fs.writeFileSync(path.join(out, 'batches-manifest.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main();
