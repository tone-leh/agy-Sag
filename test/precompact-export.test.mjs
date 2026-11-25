import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const exp = require('../packages/core/precompact-export.js');
const i18n = require('../packages/core/i18n.js');

test('redactSecrets strips API keys, Bearer tokens, JWTs, and PEM private keys', () => {
  const raw = [
    'key=sk-projAbCdEfGhIjKlMnOpQr',
    'google=AIzaSyD1234567890abcdefg',
    'gh=ghp_1234567890abcdefghij',
    'auth=Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123def456',
    '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----',
  ].join('\n');

  const safe = exp.redactSecrets(raw);
  assert.equal(safe.includes('sk-proj'), false);
  assert.equal(safe.includes('AIzaSyD'), false);
  assert.equal(safe.includes('ghp_1234'), false);
  assert.equal(safe.includes('eyJhbGci'), false);
  assert.equal(safe.includes('MIIEpAIBAAKCAQEA'), false);
  assert.ok(safe.includes('[REDACTED_KEY]'));
  assert.ok(safe.includes('[REDACTED_PRIVATE_KEY]'));
});

test('buildRecapMarkdown supports bookmark filtering and 5-language localization', () => {
  const turns = [
    { turnNum: 1, user: 'First question', assistant: 'First answer' },
    { turnNum: 2, user: 'Critical decision', assistant: 'Final architecture spec' },
    { turnNum: 3, user: 'Minor typo check', assistant: 'Fixed' },
  ];
  const map = new Map();
  const storage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };

  exp.saveBookmarks(storage, 'cid-1', [2]);
  const loaded = exp.loadBookmarks(storage, 'cid-1');
  assert.deepEqual([...loaded], [2]);

  const baseKeys = Object.keys(i18n.PACKS['zh-CN']).sort();
  for (const lang of ['zh-CN', 'zh-TW', 'yue', 'en', 'ja']) {
    assert.deepEqual(Object.keys(i18n.PACKS[lang]).sort(), baseKeys, `Locale ${lang} must have complete i18n keys`);
    const res = exp.buildRecapMarkdown({
      turns,
      bookmarks: loaded,
      onlyBookmarked: true,
      cascadeId: 'cid-1',
      usedPct: 84,
      usedLabel: '430K',
      maxLabel: '512K',
      strings: i18n.getStrings(lang),
      now: new Date('2026-11-25T10:00:00Z'),
    });
    assert.equal(res.ok, true);
    assert.equal(res.count, 1);
    assert.ok(res.markdown.includes('Critical decision'));
    assert.equal(res.markdown.includes('Minor typo check'), false);
    assert.ok(res.markdown.includes('84% (430K / 512K)'));
    assert.ok(res.markdown.includes(i18n.getStrings(lang).mdBookmarkedTag));
  }
});

test('buildRecapFilename & downloadRecapMarkdown create cross-platform filename, trigger Blob download, and clean up anchor', () => {
  const fnFull = exp.buildRecapFilename('11111111-2222-4333-8444-555555555555', new Date('2026-11-25T11:45:00Z'));
  assert.equal(fnFull, 'antigravity-recap-11111111-20261125-1145.md');
  assert.equal(fnFull.includes(':'), false, 'Filename must be Windows/macOS/Linux safe');

  const fnStars = exp.buildRecapFilename('11111111-2222', new Date('2026-11-25T11:45:00Z'), { onlyBookmarked: true });
  assert.equal(fnStars, 'antigravity-recap-stars-11111111-20261125-1145.md');

  let clickedAnchor = null;
  let appended = [];
  const doc = {
    body: {
      appendChild: (el) => { appended.push(el); return el; },
    },
    createElement: (tag) => {
      const el = {
        tagName: tag.toUpperCase(),
        style: {},
        attrs: {},
        setAttribute(k, v) { el.attrs[k] = v; },
        click() { clickedAnchor = { href: el.href, download: el.download }; },
        remove() { appended = appended.filter((x) => x !== el); },
      };
      return el;
    },
  };
  let blobText = '';
  const win = {
    document: doc,
    Blob: class MockBlob {
      constructor(parts, opts) { blobText = parts.join(''); this.type = opts?.type; }
    },
    URL: {
      createObjectURL: () => 'blob:mock-recap',
      revokeObjectURL: () => {},
    },
  };

  const res = exp.downloadRecapMarkdown('# Recap\n', fnStars, win, doc);
  assert.equal(res.ok, true);
  assert.equal(res.filename, fnStars);
  assert.equal(blobText, '# Recap\n');
  assert.deepEqual(clickedAnchor, { href: 'blob:mock-recap', download: fnStars });
  assert.equal(appended.length, 0, 'Temporary download anchor must be removed immediately');
});
