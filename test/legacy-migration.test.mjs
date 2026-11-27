import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const coexist = require('../packages/core/coexist.js');
const core = require('../packages/core/index.js');

function createMockStorage(initial = {}, opts = {}) {
  const map = new Map(Object.entries(initial));
  return {
    _map: map,
    get length() {
      return map.size;
    },
    key(i) {
      return Array.from(map.keys())[i] ?? null;
    },
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      if (opts.throwOnSet && opts.throwOnSet(k, v)) {
        throw new Error('QuotaExceededError');
      }
      map.set(k, String(v));
    },
    removeItem(k) {
      map.delete(k);
    },
  };
}

test('legacy-migration: migrates agSessionGuard.* keys to agSag.* and removes legacy keys', () => {
  const storage = createMockStorage({
    'agSessionGuard.config.v1': JSON.stringify({ compactThreshold: 75 }),
    'agSessionGuard.draft.v1:cid-1': JSON.stringify({ text: 'unsent draft', updatedAt: 1000 }),
    'agSessionGuard.bookmarks.v1:cid-1': JSON.stringify([1, 2]),
    'unrelated.key': 'preserve-me',
  });

  const res = coexist.migrateLegacyStorage(storage);
  assert.equal(res.migrated, 3);
  assert.equal(res.skipped, 0);
  assert.equal(res.failed, 0);

  assert.equal(storage.getItem('agSag.config.v1'), JSON.stringify({ compactThreshold: 75 }));
  assert.equal(storage.getItem('agSag.draft.v1:cid-1'), JSON.stringify({ text: 'unsent draft', updatedAt: 1000 }));
  assert.equal(storage.getItem('agSag.bookmarks.v1:cid-1'), JSON.stringify([1, 2]));
  assert.equal(storage.getItem('agSessionGuard.config.v1'), null);
  assert.equal(storage.getItem('agSessionGuard.draft.v1:cid-1'), null);
  assert.equal(storage.getItem('agSessionGuard.bookmarks.v1:cid-1'), null);
  assert.equal(storage.getItem('unrelated.key'), 'preserve-me');
});

test('legacy-migration: does not overwrite existing agSag.* key and deletes obsolete legacy key', () => {
  const storage = createMockStorage({
    'agSessionGuard.draft.v1:cid-2': 'old-draft',
    'agSag.draft.v1:cid-2': 'newer-draft',
  });

  const res = coexist.migrateLegacyStorage(storage);
  assert.equal(res.migrated, 0);
  assert.equal(res.skipped, 1);
  assert.equal(res.failed, 0);

  assert.equal(storage.getItem('agSag.draft.v1:cid-2'), 'newer-draft');
  assert.equal(storage.getItem('agSessionGuard.draft.v1:cid-2'), null);
});

test('legacy-migration: keeps legacy key intact when setItem throws (e.g. quota exceeded)', () => {
  const storage = createMockStorage(
    {
      'agSessionGuard.bookmarks.v1:cid-3': '[1]',
      'agSessionGuard.draft.v1:cid-3': 'keep-on-fail',
    },
    {
      throwOnSet: (k) => k === 'agSag.draft.v1:cid-3',
    }
  );

  const res = coexist.migrateLegacyStorage(storage);
  assert.equal(res.migrated, 1);
  assert.equal(res.failed, 1);

  assert.equal(storage.getItem('agSag.bookmarks.v1:cid-3'), '[1]');
  assert.equal(storage.getItem('agSessionGuard.bookmarks.v1:cid-3'), null);
  assert.equal(storage.getItem('agSessionGuard.draft.v1:cid-3'), 'keep-on-fail');
  assert.equal(storage.getItem('agSag.draft.v1:cid-3'), null);
});

test('legacy-migration: readStoredConfig falls back to legacy key, and writeStoredConfig writes new key & deletes legacy key', () => {
  const storage = createMockStorage({
    'agSessionGuard.config.v1': JSON.stringify({ compactThreshold: 85 }),
  });

  const loaded = coexist.readStoredConfig(storage);
  assert.equal(loaded.compactThreshold, 85);

  const ok = coexist.writeStoredConfig(storage, { compactThreshold: 90 });
  assert.equal(ok, true);
  assert.ok(storage.getItem('agSag.config.v1'));
  assert.equal(JSON.parse(storage.getItem('agSag.config.v1')).compactThreshold, 90);
  assert.equal(storage.getItem('agSessionGuard.config.v1'), null);
  assert.equal(coexist.writeStoredConfig(null, { compactThreshold: 90 }), false);
  assert.equal(coexist.clearStoredConfig(null), false);
  assert.deepEqual(coexist.migrateLegacyStorage({ length: 1, key: () => 'agSessionGuard.x' }), {
    migrated: 0,
    skipped: 0,
    failed: 0,
  });
});

test('legacy-migration: mountSag migrates localStorage/sessionStorage unless yielded, and destroy leaves zero globals', () => {
  const yieldedWin = {
    __agSessionGuardOwner: 'obsidian-prism',
    localStorage: createMockStorage({ 'agSessionGuard.draft.v1:y': 'stay' }),
  };
  const yieldedApi = core.mountSag({ win: yieldedWin, doc: null, source: 'standalone' });
  assert.equal(yieldedApi.yielded, true);
  assert.equal(yieldedWin.localStorage.getItem('agSessionGuard.draft.v1:y'), 'stay');
  assert.equal(yieldedWin.localStorage.getItem('agSag.draft.v1:y'), null);

  const draftPayload = JSON.stringify({ text: 'migrated-ls', updatedAt: Date.now() });
  const ls = createMockStorage({ 'agSessionGuard.draft.v1:m': draftPayload });
  const ss = createMockStorage({ 'agSessionGuard.pendingClear.v1': '{"mode":"keep"}' });
  const win = {
    localStorage: ls,
    sessionStorage: ss,
    navigator: { language: 'en' },
    addEventListener() {},
    removeEventListener() {},
  };

  const api = core.mountSag({
    win,
    doc: null,
    source: 'obsidian-prism',
    persistConfig: false,
    autoPoll: false,
    autoObserve: false,
    bindVaultShortcut: false,
  });

  assert.equal(ls.getItem('agSag.draft.v1:m'), draftPayload);
  assert.equal(ls.getItem('agSessionGuard.draft.v1:m'), null);
  assert.equal(ss.getItem('agSag.pendingClear.v1'), '{"mode":"keep"}');
  assert.equal(ss.getItem('agSessionGuard.pendingClear.v1'), null);

  assert.equal(win.__agSag, api);
  assert.equal(win.__agSessionGuard, api);
  assert.equal(win.__agSagOwner, 'obsidian-prism');
  assert.equal(win.__agSessionGuardOwner, 'obsidian-prism');

  api.destroy();
  assert.equal(win.__agSag, undefined);
  assert.equal(win.__agSessionGuard, undefined);
  assert.equal(win.__agSagOwner, undefined);
  assert.equal(win.__agSessionGuardOwner, undefined);
});
