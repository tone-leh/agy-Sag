import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_DATA_DIR,
  parseStorageArgs,
  redactSecrets,
  auditAntigravityStorage,
  exportSanitizedSession,
  createStorageBackup,
  formatStorageAuditHuman,
} from '../cli/storage-doctor.mjs';

const CLI_PATH = fileURLToPath(new URL('../cli/storage-doctor.mjs', import.meta.url));

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agy-sag-'));
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

test('StorageDoctor: parseStorageArgs validates audit, backup, and export CLI flags', () => {
  assert.ok(DEFAULT_DATA_DIR.endsWith(path.join('.gemini', 'antigravity')));

  const a1 = parseStorageArgs(['audit', '--data-dir=/tmp/demo', '--top=5', '--json']);
  assert.equal(a1.command, 'audit');
  assert.equal(a1.dataDir, '/tmp/demo');
  assert.equal(a1.topN, 5);
  assert.equal(a1.json, true);

  const b1 = parseStorageArgs(['backup', '--out=/tmp/bkp', '--dry-run']);
  assert.equal(b1.command, 'backup');
  assert.equal(b1.outDir, '/tmp/bkp');
  assert.equal(b1.dryRun, true);

  const e1 = parseStorageArgs(['export', '--session=sess-01', '--format=json', '--out=/tmp/out.json']);
  assert.equal(e1.command, 'export');
  assert.equal(e1.sessionId, 'sess-01');
  assert.equal(e1.format, 'json');
  assert.equal(e1.outFile, '/tmp/out.json');

  assert.throws(() => parseStorageArgs(['unknown-cmd']));
  assert.throws(() => parseStorageArgs(['backup']), /requires --out/);
  assert.throws(() => parseStorageArgs(['export']), /requires --session/);
  assert.throws(() => parseStorageArgs(['export', '--session=abc', '--format=yaml']), /Invalid --format/);
  assert.throws(() => parseStorageArgs(['audit', '--top=0']), /Invalid --top/);
});

test('StorageDoctor: redactSecrets masks PEM keys, API tokens, Bearer tokens and JWTs', () => {
  const pem = [
    '-----BEGIN RSA PRIVATE KEY-----',
    'MIIEowIBAAKCAQEAnFakePrivateKeyBody1234567890',
    '-----END RSA PRIVATE KEY-----',
  ].join('\n');
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  const input = [
    pem,
    'OPENAI=sk-proj-abc1234567890XYZ',
    'GOOGLE=AIzaSyD-ExampleKey1234567890',
    'GH=ghp_1234567890abcdef1234567890',
    'GL=glpat-abcdef1234567890XYZ',
    'Authorization: Bearer mySuperSecretTokenValue_12345',
    `JWT=${jwt}`,
    'Normal text: hello world',
  ].join('\n');

  const out = redactSecrets(input);
  assert.ok(out.includes('[REDACTED_PRIVATE_KEY]'));
  assert.equal(out.includes('MIIEowIBAAKCAQE'), false);
  assert.equal(out.includes('sk-proj-'), false);
  assert.equal(out.includes('AIzaSyD'), false);
  assert.equal(out.includes('ghp_1234'), false);
  assert.equal(out.includes('glpat-abcdef'), false);
  assert.equal(out.includes('mySuperSecretTokenValue'), false);
  assert.ok(out.includes('Bearer [REDACTED_TOKEN]'));
  assert.ok(out.includes('[REDACTED_JWT]'));
  assert.equal(out.includes('eyJhbGciOi'), false);
  assert.ok(out.includes('Normal text: hello world'));
});

test('StorageDoctor: auditAntigravityStorage handles missing dir gracefully and performs read-only deep audit', () => {
  const tmp = makeTempDir();
  try {
    const missing = auditAntigravityStorage({ dataDir: path.join(tmp, 'does-not-exist') });
    assert.equal(missing.ok, true);
    assert.equal(missing.exists, false);
    assert.equal(missing.totalFiles, 0);
    assert.ok(formatStorageAuditHuman(missing).includes('does not exist'));

    const dataDir = path.join(tmp, 'antigravity-data');
    const outsideSecret = path.join(tmp, 'outside-secret.txt');
    writeFile(outsideSecret, 'DO_NOT_READ_ME');

    // Valid brain session with nested transcript
    writeFile(
      path.join(dataDir, 'brain', 'sess-alpha', '.system_generated', 'logs', 'transcript.jsonl'),
      '{"role":"user","content":"hello"}\n{"role":"assistant","content":"world"}\n'
    );
    writeFile(path.join(dataDir, 'brain', 'sess-alpha', 'big-artifact.bin'), Buffer.alloc(4096, 65));

    // Empty brain dir (orphan)
    fs.mkdirSync(path.join(dataDir, 'brain', 'sess-empty'), { recursive: true });

    // Orphan brain dir (no transcript, no conversation match)
    writeFile(path.join(dataDir, 'brain', 'sess-orphan', 'scratch.txt'), 'orphan scratch');

    // Session with 0-byte corrupt transcript.jsonl
    writeFile(path.join(dataDir, 'brain', 'sess-corrupt', 'transcript.jsonl'), '');

    // Conversations matching sess-alpha
    writeFile(path.join(dataDir, 'conversations', 'sess-alpha.pb'), Buffer.alloc(1024, 66));

    // Metadata anomalies (empty project_id in both pbtxt and json, plus broken json)
    writeFile(path.join(dataDir, 'brain', 'sess-alpha', 'meta.pbtxt'), 'title: "Demo"\nproject_id: ""\n');
    writeFile(path.join(dataDir, 'summary-index.json'), '{"project_id":"","count":1}');
    writeFile(path.join(dataDir, 'broken.json'), '{not-valid-json');

    // SQLite DB + active WAL/SHM (must never be modified!)
    const dbPath = path.join(dataDir, 'conversation_summaries.db');
    const dbPayload = Buffer.from('SQLITE_MOCK_HEADER_UNCHANGED');
    writeFile(dbPath, dbPayload);
    writeFile(`${dbPath}-wal`, Buffer.alloc(512, 1));
    writeFile(`${dbPath}-shm`, Buffer.alloc(128, 2));

    // Symlink pointing outside dataDir (must be skipped safely)
    fs.symlinkSync(outsideSecret, path.join(dataDir, 'escape-link.txt'));
    fs.symlinkSync(dataDir, path.join(dataDir, 'loop-link'));

    const report = auditAntigravityStorage({ dataDir, topN: 3 });
    assert.equal(report.ok, true);
    assert.equal(report.exists, true);
    assert.equal(report.skippedSymlinks, 2);
    assert.equal(report.topFiles.length, 3);
    assert.equal(report.topFiles[0].relPath, 'brain/sess-alpha/big-artifact.bin');
    assert.equal(report.topFiles[0].bytes, 4096);

    assert.equal(report.brain.sessionCount, 4);
    assert.equal(report.conversations.fileCount, 1);

    // Orphans & corrupt files
    const orphanIds = report.orphans.map((o) => o.sessionId).sort();
    assert.deepEqual(orphanIds, ['sess-empty', 'sess-orphan']);
    assert.equal(report.corruptFiles.length, 1);
    assert.equal(report.corruptFiles[0].relPath, 'brain/sess-corrupt/transcript.jsonl');

    // SQLite WAL active detection & immutability verification
    assert.equal(report.sqlite.dbExists, true);
    assert.equal(report.sqlite.walActive, true);
    assert.equal(report.sqlite.walBytes, 512);
    assert.equal(report.sqlite.shmBytes, 128);
    assert.ok(report.sqlite.warnings.some((w) => w.includes('WAL')));
    assert.deepEqual(fs.readFileSync(dbPath), dbPayload, 'audit must remain 100% read-only on SQLite DB');

    // Metadata anomalies
    const emptyPidAnomalies = report.anomalies.filter((a) => a.type === 'empty-project-id');
    assert.equal(emptyPidAnomalies.length, 2);
    assert.ok(report.anomalies.some((a) => a.type === 'invalid-json' && a.relPath === 'broken.json'));

    // Human-readable output
    const human = formatStorageAuditHuman(report);
    assert.ok(human.includes('Storage Doctor'));
    assert.ok(human.includes('WAL ACTIVE'));
    assert.ok(human.includes('brain/sess-alpha/big-artifact.bin'));
    assert.ok(human.includes('sess-corrupt/transcript.jsonl'));
    assert.ok(human.includes('empty-project-id'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('StorageDoctor: exportSanitizedSession blocks path traversal, redacts secrets, and exports md/json safely', () => {
  const tmp = makeTempDir();
  try {
    const dataDir = path.join(tmp, 'data');
    const secretFile = path.join(tmp, 'secret.jsonl');
    writeFile(secretFile, '{"role":"user","content":"TOP_SECRET"}\n');

    const transcriptLines = [
      JSON.stringify({
        role: 'user',
        timestamp: '2026-05-10T10:00:00Z',
        content: 'My key is sk-live-secret1234567890 and token Bearer superSecretBearerToken999',
      }),
      '{corrupt json line',
      JSON.stringify({
        author: 'assistant',
        parts: [{ text: 'Saw ghp_abcdefghijklmnopqrstuvwxyz and AIzaSyA12345678901234567890' }],
      }),
    ].join('\n');

    writeFile(
      path.join(dataDir, 'brain', 'sess-01', '.system_generated', 'logs', 'transcript.jsonl'),
      transcriptLines
    );
    writeFile(
      path.join(dataDir, 'brain', 'sess-02', 'transcript.jsonl'),
      JSON.stringify({ role: 'user', text: 'Direct transcript with glpat-secretToken1234567' }) + '\n'
    );

    // Path traversal & symlink escapes must be rejected
    assert.throws(() => exportSanitizedSession({ dataDir, sessionId: '../secret' }), /Invalid sessionId/);
    assert.throws(() => exportSanitizedSession({ dataDir, sessionId: '..' }), /Invalid sessionId/);
    assert.throws(() => exportSanitizedSession({ dataDir, sessionId: 'sess-01/../../etc' }), /Invalid sessionId/);
    assert.throws(() => exportSanitizedSession({ dataDir, sessionId: 'sess-01\\..\\x' }), /Invalid sessionId/);

    fs.symlinkSync(tmp, path.join(dataDir, 'brain', 'sess-symlink'));
    assert.throws(() => exportSanitizedSession({ dataDir, sessionId: 'sess-symlink' }), /symlink/);

    // Markdown export returned as string when outFile omitted
    const md = exportSanitizedSession({ dataDir, sessionId: 'sess-01', format: 'md' });
    assert.equal(typeof md, 'string');
    assert.ok(md.includes('# Antigravity Sanitized Session Export'));
    assert.ok(md.includes('[REDACTED_KEY]'));
    assert.ok(md.includes('Bearer [REDACTED_TOKEN]'));
    assert.equal(md.includes('sk-live-secret'), false);
    assert.equal(md.includes('superSecretBearerToken'), false);
    assert.equal(md.includes('ghp_abcdef'), false);
    assert.equal(md.includes('AIzaSyA1234'), false);
    assert.ok(md.includes('Malformed JSONL Lines Skipped**: 1'));

    // Direct brain/<id>/transcript.jsonl fallback + JSON export written to outFile
    const outJsonFile = path.join(tmp, 'exports', 'sess-02.json');
    const jsonRes = exportSanitizedSession({
      dataDir,
      sessionId: 'sess-02',
      format: 'json',
      outFile: outJsonFile,
    });
    assert.equal(jsonRes.ok, true);
    assert.equal(jsonRes.entryCount, 1);
    const parsed = JSON.parse(fs.readFileSync(outJsonFile, 'utf8'));
    assert.equal(parsed.sessionId, 'sess-02');
    assert.ok(parsed.entries[0].text.includes('[REDACTED_KEY]'));
    assert.equal(parsed.entries[0].text.includes('glpat-secretToken'), false);

    // Reject writing export back inside source dataDir
    assert.throws(
      () => exportSanitizedSession({ dataDir, sessionId: 'sess-02', outFile: path.join(dataDir, 'leak.md') }),
      /inside source dataDir/
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('StorageDoctor: createStorageBackup prevents self-recursion, supports dryRun, respects walActive, and runs via CLI', () => {
  const tmp = makeTempDir();
  try {
    const dataDir = path.join(tmp, 'src-data');
    writeFile(path.join(dataDir, 'conversations', 'c1.pb'), 'conv-data-1');
    writeFile(path.join(dataDir, 'annotations', 'a1.json'), '{"ok":true}');
    writeFile(path.join(dataDir, 'brain', 's1', 'transcript.jsonl'), '{"role":"user","content":"hi"}\n');
    writeFile(path.join(dataDir, 'conversation_summaries.db'), 'db-bytes');
    writeFile(path.join(dataDir, 'conversation_summaries.db-wal'), 'active-wal-bytes');
    writeFile(path.join(dataDir, 'SingletonLock'), 'lock');
    fs.symlinkSync(path.join(dataDir, 'conversations', 'c1.pb'), path.join(dataDir, 'brain', 's1', 'link.pb'));

    // Self-recursion prevention: same dir, direct child, deep non-existent child, symlink into source
    assert.throws(() => createStorageBackup({ dataDir, outDir: dataDir }), /infinite recursion/i);
    assert.throws(() => createStorageBackup({ dataDir, outDir: path.join(dataDir, 'backup') }), /infinite recursion/i);
    assert.throws(() => createStorageBackup({ dataDir, outDir: path.join(dataDir, 'a', 'b', 'c') }), /infinite recursion/i);

    const sneakLink = path.join(tmp, 'sneak-link');
    fs.symlinkSync(dataDir, sneakLink);
    assert.throws(() => createStorageBackup({ dataDir, outDir: path.join(sneakLink, 'inside') }), /infinite recursion/i);

    // Dry run: previews manifest & bytes without creating outDir
    const dryOut = path.join(tmp, 'dry-backup');
    const dryRes = createStorageBackup({ dataDir, outDir: dryOut, dryRun: true });
    assert.equal(dryRes.ok, true);
    assert.equal(dryRes.dryRun, true);
    assert.equal(dryRes.walActive, true);
    assert.ok(dryRes.warnings.some((w) => w.includes('WAL')));
    assert.equal(fs.existsSync(dryOut), false, 'dryRun must not create output directory');
    assert.equal(dryRes.fileCount, 3);
    assert.ok(dryRes.totalBytes > 0);

    // Real backup while WAL is active: copies safe files, skips WAL/lock/live-DB/symlinks
    const realOut = path.join(tmp, 'real-backup');
    const bkpRes = createStorageBackup({ dataDir, outDir: realOut, dryRun: false });
    assert.equal(bkpRes.ok, true);
    assert.equal(bkpRes.walActive, true);
    assert.equal(bkpRes.copiedFiles, 3);
    assert.equal(fs.readFileSync(path.join(realOut, 'conversations', 'c1.pb'), 'utf8'), 'conv-data-1');
    assert.equal(fs.readFileSync(path.join(realOut, 'annotations', 'a1.json'), 'utf8'), '{"ok":true}');
    assert.equal(fs.existsSync(path.join(realOut, 'conversation_summaries.db-wal')), false);
    assert.equal(fs.existsSync(path.join(realOut, 'conversation_summaries.db')), false);
    assert.equal(fs.existsSync(path.join(realOut, 'SingletonLock')), false);
    assert.equal(fs.existsSync(path.join(realOut, 'brain', 's1', 'link.pb')), false);

    // Clean WAL: conversation_summaries.db is now safely included
    fs.rmSync(path.join(dataDir, 'conversation_summaries.db-wal'));
    const cleanOut = path.join(tmp, 'clean-backup');
    const cleanRes = createStorageBackup({ dataDir, outDir: cleanOut, dryRun: false });
    assert.equal(cleanRes.walActive, false);
    assert.equal(cleanRes.copiedFiles, 4);
    assert.equal(fs.readFileSync(path.join(cleanOut, 'conversation_summaries.db'), 'utf8'), 'db-bytes');

    // End-to-end CLI invocation smoke test on isolated temp dir
    const cliAuditRaw = execFileSync(process.execPath, [CLI_PATH, 'audit', `--data-dir=${dataDir}`, '--json'], {
      encoding: 'utf8',
    });
    const cliAudit = JSON.parse(cliAuditRaw);
    assert.equal(cliAudit.ok, true);
    assert.equal(cliAudit.brain.sessionCount, 1);

    const cliExport = execFileSync(
      process.execPath,
      [CLI_PATH, 'export', `--data-dir=${dataDir}`, '--session=s1', '--format=md'],
      { encoding: 'utf8' }
    );
    assert.ok(cliExport.includes('Antigravity Sanitized Session Export'));
    assert.ok(cliExport.includes('hi'));

    const cliDryBackupRaw = execFileSync(
      process.execPath,
      [CLI_PATH, 'backup', `--data-dir=${dataDir}`, `--out=${path.join(tmp, 'cli-dry-out')}`, '--dry-run', '--json'],
      { encoding: 'utf8' }
    );
    const cliDryBackup = JSON.parse(cliDryBackupRaw);
    assert.equal(cliDryBackup.ok, true);
    assert.equal(cliDryBackup.dryRun, true);
    assert.equal(fs.existsSync(path.join(tmp, 'cli-dry-out')), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('StorageDoctor: redactSecrets covers PKCS#8 PEM, AWS/Slack/npm/ghr tokens, and Base64 Bearer tokens ending with ==', () => {
  const pkcs8Pem = [
    '-----BEGIN PRIVATE KEY-----',
    'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQFakePKCS8Body',
    '-----END PRIVATE KEY-----',
  ].join('\n');

  const fakeAws = 'AKIA' + 'IOSFODNN7EXAMPLE';
  const fakeSlackBot = ['xoxb', '1234567890', 'abcdef1234567890'].join('-');
  const fakeSlackApp = ['xoxp', '9876543210', 'zyxwvut987654321'].join('-');
  const fakeNpm = 'npm_' + 'AbCdEf1234567890GhIjKlMnOpQr';
  const fakeGhr = 'ghr_' + '1234567890abcdefghij1234567890';

  const input = [
    pkcs8Pem,
    `AWS=${fakeAws}`,
    `SLACK_BOT=${fakeSlackBot}`,
    `SLACK_APP=${fakeSlackApp}`,
    `NPM=${fakeNpm}`,
    `GHR=${fakeGhr}`,
    'Authorization: Bearer YWJjZGVmZ2hpamtsbW5vcA==',
    'Keep plain text intact',
  ].join('\n');

  const out = redactSecrets(input);
  assert.ok(out.includes('[REDACTED_PRIVATE_KEY]'));
  assert.equal(out.includes('BEGIN PRIVATE KEY'), false);
  assert.equal(out.includes('FakePKCS8Body'), false);
  assert.equal(out.includes(fakeAws), false);
  assert.equal(out.includes('xoxb-' + '1234567890'), false);
  assert.equal(out.includes('xoxp-' + '9876543210'), false);
  assert.equal(out.includes('npm_' + 'AbCdEf123456'), false);
  assert.equal(out.includes('ghr_' + '1234567890'), false);
  assert.equal(out.includes('YWJjZGVmZ2hpamtsbW5vcA'), false);
  assert.ok(out.includes('Authorization: Bearer [REDACTED_TOKEN]\nKeep plain text intact'));
  assert.equal(out.includes('=='), false, 'Base64 Bearer trailing == must not leak after redaction');
});

test('StorageDoctor: detects and skips any active .sqlite/.sqlite3/.vscdb database with WAL/SHM during audit and backup', () => {
  const tmp = makeTempDir();
  try {
    const dataDir = path.join(tmp, 'multi-db-data');
    writeFile(path.join(dataDir, 'brain', 's1', 'transcript.jsonl'), '{"role":"user","content":"ok"}\n');

    // Active custom .sqlite in root
    writeFile(path.join(dataDir, 'state.sqlite'), 'sqlite-main');
    writeFile(path.join(dataDir, 'state.sqlite-wal'), 'wal-active-data');

    // Active .vscdb in priority subdir (brain/)
    writeFile(path.join(dataDir, 'brain', 's1', 'cache.vscdb'), 'vscdb-main');
    writeFile(path.join(dataDir, 'brain', 's1', 'cache.vscdb-shm'), 'shm-active-data');

    // Active .sqlite3 in conversations/
    writeFile(path.join(dataDir, 'conversations', 'index.sqlite3'), 'sqlite3-main');
    writeFile(path.join(dataDir, 'conversations', 'index.sqlite3-wal'), 'sqlite3-wal-bytes');

    // Clean inactive .sqlite (no WAL/SHM) should still be backed up
    writeFile(path.join(dataDir, 'archive.sqlite'), 'clean-sqlite');

    const report = auditAntigravityStorage({ dataDir });
    assert.equal(report.sqlite.walActive, true);
    assert.deepEqual(report.sqlite.activeDbPaths, [
      'brain/s1/cache.vscdb',
      'conversations/index.sqlite3',
      'state.sqlite',
    ]);
    assert.ok(report.sqlite.warnings.some((w) => w.includes('state.sqlite')));
    assert.ok(report.sqlite.warnings.some((w) => w.includes('brain/s1/cache.vscdb')));
    assert.ok(report.sqlite.warnings.some((w) => w.includes('conversations/index.sqlite3')));

    const outDir = path.join(tmp, 'backup-out');
    const bkp = createStorageBackup({ dataDir, outDir, dryRun: false });
    assert.equal(bkp.ok, true);
    assert.equal(bkp.walActive, true);
    assert.deepEqual(bkp.activeDbPaths, [
      'brain/s1/cache.vscdb',
      'conversations/index.sqlite3',
      'state.sqlite',
    ]);
    assert.ok(bkp.warnings.some((w) => w.includes('state.sqlite')));

    // All active DBs and their -wal/-shm companions must be skipped
    assert.equal(fs.existsSync(path.join(outDir, 'state.sqlite')), false);
    assert.equal(fs.existsSync(path.join(outDir, 'state.sqlite-wal')), false);
    assert.equal(fs.existsSync(path.join(outDir, 'brain', 's1', 'cache.vscdb')), false);
    assert.equal(fs.existsSync(path.join(outDir, 'brain', 's1', 'cache.vscdb-shm')), false);
    assert.equal(fs.existsSync(path.join(outDir, 'conversations', 'index.sqlite3')), false);
    assert.equal(fs.existsSync(path.join(outDir, 'conversations', 'index.sqlite3-wal')), false);

    // Safe transcript & clean archive.sqlite must be backed up
    assert.equal(fs.readFileSync(path.join(outDir, 'archive.sqlite'), 'utf8'), 'clean-sqlite');
    assert.ok(fs.existsSync(path.join(outDir, 'brain', 's1', 'transcript.jsonl')));

    const skippedActive = bkp.skipped.filter((s) => s.reason === 'sqlite-wal-active').map((s) => s.relPath).sort();
    assert.deepEqual(skippedActive, [
      'brain/s1/cache.vscdb',
      'conversations/index.sqlite3',
      'state.sqlite',
    ]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('StorageDoctor: exportSanitizedSession rejects symlinked brain directory escape', () => {
  const tmp = makeTempDir();
  try {
    const dataDir = path.join(tmp, 'data-with-symlink-brain');
    const outsideDir = path.join(tmp, 'outside-target');
    fs.mkdirSync(dataDir, { recursive: true });
    writeFile(
      path.join(outsideDir, 'sess-escape', 'transcript.jsonl'),
      JSON.stringify({ role: 'user', content: 'OUTSIDE_SENSITIVE_DATA' }) + '\n'
    );

    // Point dataDir/brain directly to outsideDir
    fs.symlinkSync(outsideDir, path.join(dataDir, 'brain'));

    assert.throws(
      () => exportSanitizedSession({ dataDir, sessionId: 'sess-escape' }),
      /symlinked brain directory/i
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
