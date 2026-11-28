#!/usr/bin/env node
/**
 * agy-Sag — Read-Only Local Storage Doctor, Safe Backup & Sanitized Session Exporter CLI
 *
 * Zero runtime dependencies (Node.js >= 22 built-ins only).
 * 100% Read-Only during audit: never opens/mutates SQLite databases or follows symlinks.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertNoSymlinkAncestors,
  atomicRenameWithRetry,
  canonicalRealpathSync,
  copyFileSafeAtomic,
  expandTildePath,
  isCliEntry,
  isPathWithinBase,
} from './platform-utils.mjs';

export const DEFAULT_DATA_DIR = path.join(os.homedir(), '.gemini', 'antigravity');

const MAX_WALK_DEPTH = 16;
const MAX_METADATA_SCAN_BYTES = 512 * 1024;
const DEFAULT_AUDIT_MAX_FILES = 50_000;
const DEFAULT_AUDIT_MAX_METADATA_SCANS = 2_000;
const DEFAULT_AUDIT_MAX_DURATION_MS = 4_000;
const DEFAULT_EXPORT_MAX_BYTES = 32 * 1024 * 1024;
const DEFAULT_BACKUP_MAX_FILE_BYTES = 512 * 1024 * 1024;
const DEFAULT_BACKUP_MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
const SQLITE_MAGIC_HEADER = Buffer.from('SQLite format 3\0', 'ascii');
const MAX_SEARCH_SESSIONS = 40;
const MAX_SEARCH_FILE_BYTES = 512 * 1024;
const MAX_SEARCH_LIMIT = 20;
const MAX_SEARCH_MATCHES_PER_SESSION = 3;
const SESSION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const BACKUP_PRIORITY_ROOTS = new Set(['conversations', 'annotations', 'brain']);
let exportTmpCounter = 0;

export function redactSecrets(text) {
  return String(text ?? '')
    .replace(
      /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/g,
      '[REDACTED_PRIVATE_KEY]'
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_JWT]')
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED_KEY]')
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, '[REDACTED_KEY]')
    .replace(/\bnpm_[A-Za-z0-9]{20,}\b/g, '[REDACTED_KEY]')
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '[REDACTED_KEY]')
    .replace(/\b(?:sk|rk|pk|ak|AIza|ghp|gho|ghu|ghs|ghr|glpat|github_pat)[-_A-Za-z0-9]{10,}\b/g, '[REDACTED_KEY]');
}

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let idx = 0;
  let val = n;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  return idx === 0 ? `${Math.round(val)} B` : `${val.toFixed(val >= 100 ? 0 : val >= 10 ? 1 : 2)} ${units[idx]}`;
}

function resolveCanonicalPath(targetPath) {
  const abs = path.resolve(targetPath);
  const tail = [];
  let cur = abs;

  while (true) {
    try {
      const real = canonicalRealpathSync(cur);
      return tail.length ? path.join(real, ...tail.reverse()) : real;
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return abs;
      tail.push(path.basename(cur));
      cur = parent;
    }
  }
}

function isPathInsideOrEqual(candidatePath, baseDirPath) {
  const realCandidate = resolveCanonicalPath(candidatePath);
  const realBase = resolveCanonicalPath(baseDirPath);
  return isPathWithinBase(realCandidate, realBase);
}

function toPosixRel(rootDir, absPath) {
  return path.relative(rootDir, absPath).split(path.sep).join('/');
}

const SQLITE_DB_EXTS = ['.db', '.sqlite', '.sqlite3', '.vscdb'];

function isSqliteDbFilename(filename) {
  const lower = String(filename || '').toLowerCase();
  return SQLITE_DB_EXTS.some((ext) => lower.endsWith(ext));
}

function isSqliteCompanionFilename(filename) {
  const lower = String(filename || '').toLowerCase();
  return SQLITE_DB_EXTS.some(
    (ext) => lower.endsWith(`${ext}-wal`) || lower.endsWith(`${ext}-shm`) || lower.endsWith(`${ext}-journal`)
  );
}

function getBaseSqliteDbPathFromWalOrShm(fullPath) {
  const lower = String(fullPath || '').toLowerCase();
  for (const ext of SQLITE_DB_EXTS) {
    if (lower.endsWith(`${ext}-wal`) || lower.endsWith(`${ext}-shm`)) {
      return fullPath.slice(0, -4);
    }
  }
  return null;
}

function isLockFilename(filename) {
  const name = String(filename || '');
  const lower = name.toLowerCase();
  return (
    isSqliteCompanionFilename(name) ||
    lower.endsWith('.lock') ||
    lower === 'lock' ||
    name.startsWith('Singleton')
  );
}

export function parseStorageArgs(argv = [], homeDir = os.homedir()) {
  const args = Array.isArray(argv) ? argv.map(String) : [];
  const opts = {
    command: 'audit',
    dataDir: DEFAULT_DATA_DIR,
    topN: 10,
    json: false,
    outDir: null,
    outFile: null,
    dryRun: false,
    sessionId: null,
    format: 'md',
    query: '',
    limit: MAX_SEARCH_LIMIT,
    help: false,
  };

  let idx = 0;
  if (args.length > 0 && !args[0].startsWith('-')) {
    const cmd = args[0].trim().toLowerCase();
    if (!['audit', 'backup', 'export', 'search', 'help'].includes(cmd)) {
      throw new Error(`Unknown command: ${args[0]} (expected audit | backup | export | search)`);
    }
    if (cmd === 'help') {
      opts.help = true;
      return opts;
    }
    opts.command = cmd;
    idx = 1;
  }

  let rawOut = null;
  let rawOutFile = null;

  for (; idx < args.length; idx += 1) {
    const a = args[idx];
    if (a === '--help' || a === '-h') {
      opts.help = true;
    } else if (a === '--json') {
      opts.json = true;
    } else if (a === '--dry-run') {
      opts.dryRun = true;
    } else if (a.startsWith('--data-dir=')) {
      const val = a.slice('--data-dir='.length).trim();
      if (!val) throw new Error('Invalid --data-dir value');
      opts.dataDir = expandTildePath(val, homeDir);
    } else if (a === '--data-dir') {
      const val = args[idx + 1];
      if (!val || val.startsWith('--')) throw new Error('Missing value for --data-dir');
      opts.dataDir = expandTildePath(val, homeDir);
      idx += 1;
    } else if (a.startsWith('--top=')) {
      const n = Number(a.slice('--top='.length));
      if (!Number.isInteger(n) || n < 1 || n > 200) throw new Error(`Invalid --top value: ${a}`);
      opts.topN = n;
    } else if (a === '--top') {
      const n = Number(args[idx + 1]);
      if (!Number.isInteger(n) || n < 1 || n > 200) throw new Error(`Invalid --top value: ${args[idx + 1]}`);
      opts.topN = n;
      idx += 1;
    } else if (a.startsWith('--out=')) {
      const val = a.slice('--out='.length).trim();
      if (!val) throw new Error('Invalid --out value');
      rawOut = expandTildePath(val, homeDir);
    } else if (a === '--out') {
      const val = args[idx + 1];
      if (!val || val.startsWith('--')) throw new Error('Missing value for --out');
      rawOut = expandTildePath(val, homeDir);
      idx += 1;
    } else if (a.startsWith('--out-file=')) {
      const val = a.slice('--out-file='.length).trim();
      if (!val) throw new Error('Invalid --out-file value');
      rawOutFile = expandTildePath(val, homeDir);
    } else if (a === '--out-file') {
      const val = args[idx + 1];
      if (!val || val.startsWith('--')) throw new Error('Missing value for --out-file');
      rawOutFile = expandTildePath(val, homeDir);
      idx += 1;
    } else if (a.startsWith('--session=')) {
      const val = a.slice('--session='.length).trim();
      if (!val) throw new Error('Invalid --session value');
      opts.sessionId = val;
    } else if (a === '--session') {
      const val = args[idx + 1];
      if (!val || val.startsWith('--')) throw new Error('Missing value for --session');
      opts.sessionId = val;
      idx += 1;
    } else if (a.startsWith('--format=')) {
      const val = a.slice('--format='.length).trim().toLowerCase();
      if (val !== 'md' && val !== 'json') throw new Error(`Invalid --format value: ${val} (expected md | json)`);
      opts.format = val;
    } else if (a === '--format') {
      const val = String(args[idx + 1] || '').trim().toLowerCase();
      if (val !== 'md' && val !== 'json') throw new Error(`Invalid --format value: ${val} (expected md | json)`);
      opts.format = val;
      idx += 1;
    } else if (a.startsWith('--q=') || a.startsWith('--query=')) {
      const val = a.slice(a.indexOf('=') + 1).trim();
      if (!val) throw new Error('Invalid --q value');
      opts.query = val.slice(0, 120);
    } else if (a === '--q' || a === '--query') {
      const val = args[idx + 1];
      if (!val || val.startsWith('--')) throw new Error(`Missing value for ${a}`);
      opts.query = String(val).trim().slice(0, 120);
      idx += 1;
    } else if (a.startsWith('--limit=')) {
      const n = Number(a.slice('--limit='.length));
      if (!Number.isInteger(n) || n < 1 || n > MAX_SEARCH_LIMIT) throw new Error(`Invalid --limit value: ${a}`);
      opts.limit = n;
    } else if (a === '--limit') {
      const n = Number(args[idx + 1]);
      if (!Number.isInteger(n) || n < 1 || n > MAX_SEARCH_LIMIT) throw new Error(`Invalid --limit value: ${args[idx + 1]}`);
      opts.limit = n;
      idx += 1;
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }

  if (opts.command === 'backup') {
    opts.outDir = rawOut;
    if (!opts.help && !opts.outDir) {
      throw new Error('backup command requires --out=<dir>');
    }
  } else if (opts.command === 'export') {
    opts.outFile = rawOutFile || rawOut;
    if (!opts.help && !opts.sessionId) {
      throw new Error('export command requires --session=<id>');
    }
  } else if (opts.command === 'search') {
    if (!opts.help && !opts.query) {
      throw new Error('search command requires --q=<keyword>');
    }
  }

  return opts;
}

function safeLstat(filePath) {
  try {
    return fs.lstatSync(filePath);
  } catch {
    return null;
  }
}

function walkDirectorySafe(rootDir, { onFile, onDir, onSymlink, onDepthLimit, shouldStop } = {}) {
  function recurse(curDir, depth) {
    if (shouldStop?.()) return;
    if (depth > MAX_WALK_DEPTH) {
      onDepthLimit?.({ fullPath: curDir, relPath: toPosixRel(rootDir, curDir), depth });
      return;
    }
    let entries;
    try {
      entries = fs.readdirSync(curDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (shouldStop?.()) return;
      const fullPath = path.join(curDir, entry.name);
      const st = safeLstat(fullPath);
      if (!st) continue;
      const relPath = toPosixRel(rootDir, fullPath);
      if (st.isSymbolicLink()) {
        onSymlink?.({ fullPath, relPath, name: entry.name });
        continue;
      }
      if (st.isDirectory()) {
        onDir?.({ fullPath, relPath, name: entry.name, stat: st, depth });
        recurse(fullPath, depth + 1);
      } else if (st.isFile()) {
        onFile?.({ fullPath, relPath, name: entry.name, stat: st, depth });
      }
    }
  }

  recurse(rootDir, 0);
}

function compareTopFile(a, b) {
  return b.bytes - a.bytes || a.relPath.localeCompare(b.relPath);
}

function insertTopFile(topFiles, item, limit) {
  if (limit <= 0) return;
  if (topFiles.length >= limit && compareTopFile(item, topFiles[topFiles.length - 1]) >= 0) {
    return;
  }
  let lo = 0;
  let hi = topFiles.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (compareTopFile(item, topFiles[mid]) < 0) hi = mid;
    else lo = mid + 1;
  }
  topFiles.splice(lo, 0, item);
  if (topFiles.length > limit) topFiles.length = limit;
}

function isScannableMetadataFile(relPath, bytes) {
  if (bytes <= 0 || bytes > MAX_METADATA_SCAN_BYTES) return false;
  const lower = relPath.toLowerCase();
  return lower.endsWith('.json') || lower.endsWith('.pbtxt') || lower.endsWith('.txt');
}

function probeSqliteHeaderReadOnly(dbPath, fileBytes) {
  if (fileBytes === 0) {
    return { valid: false, reason: 'corrupt-sqlite-header', bytes: 0 };
  }
  let fd = null;
  try {
    fd = fs.openSync(dbPath, 'r');
    const header = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, header, 0, 16, 0);
    if (bytesRead < 16 || !header.equals(SQLITE_MAGIC_HEADER)) {
      return { valid: false, reason: 'corrupt-sqlite-header', bytes: fileBytes };
    }
    return { valid: true, reason: null, bytes: fileBytes };
  } catch {
    return { valid: true, reason: null, bytes: fileBytes };
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
  }
}

function inspectMetadataAnomalies(fullPath, relPath, bytes, anomalies) {
  if (bytes <= 0 || bytes > MAX_METADATA_SCAN_BYTES) return;
  const lower = relPath.toLowerCase();
  const isJson = lower.endsWith('.json');
  const isPbtxt = lower.endsWith('.pbtxt') || lower.endsWith('.txt');
  if (!isJson && !isPbtxt) return;

  let text;
  try {
    text = fs.readFileSync(fullPath, 'utf8');
  } catch {
    return;
  }

  if (/(?:["']?project_id["']?\s*:\s*""|"project_id"\s*:\s*null)/i.test(text)) {
    anomalies.push({
      type: 'empty-project-id',
      relPath,
      detail: 'Detected empty project_id field in metadata file (read-only finding)',
    });
  }

  if (isJson) {
    try {
      JSON.parse(text);
    } catch {
      anomalies.push({
        type: 'invalid-json',
        relPath,
        detail: 'Malformed JSON file (read-only finding)',
      });
    }
  }
}

function inspectSqliteStatus(resolvedDir, discoveredDbPaths = []) {
  const candidateSet = new Set();
  for (const p of discoveredDbPaths || []) {
    if (p) candidateSet.add(path.resolve(p));
  }
  const defaultDb = path.join(resolvedDir, 'conversation_summaries.db');
  if (safeLstat(defaultDb) || safeLstat(`${defaultDb}-wal`) || safeLstat(`${defaultDb}-shm`)) {
    candidateSet.add(defaultDb);
  }

  const sortedPaths = [...candidateSet].sort((a, b) =>
    toPosixRel(resolvedDir, a).localeCompare(toPosixRel(resolvedDir, b))
  );

  const databases = [];
  const activeDbPaths = [];
  const warnings = [];

  for (const dbPath of sortedPaths) {
    const dbStat = safeLstat(dbPath);
    const walStat = safeLstat(`${dbPath}-wal`);
    const shmStat = safeLstat(`${dbPath}-shm`);

    const dbExists = Boolean(dbStat && !dbStat.isSymbolicLink() && dbStat.isFile());
    const walExists = Boolean(walStat && !walStat.isSymbolicLink() && walStat.isFile());
    const shmExists = Boolean(shmStat && !shmStat.isSymbolicLink() && shmStat.isFile());
    if (!dbExists && !walExists && !shmExists) continue;

    const dbBytes = dbExists ? dbStat.size : 0;
    const walBytes = walExists ? walStat.size : 0;
    const shmBytes = shmExists ? shmStat.size : 0;
    const walActive = Boolean((walExists && walBytes > 0) || (shmExists && shmBytes > 0));
    const relDbPath = toPosixRel(resolvedDir, dbPath);

    databases.push({
      dbPath: relDbPath,
      dbExists,
      dbBytes,
      walExists,
      walBytes,
      shmExists,
      shmBytes,
      walActive,
    });

    if (walActive) {
      activeDbPaths.push(relDbPath);
      warnings.push(
        `SQLite WAL/SHM active (${relDbPath}: wal=${walBytes} B, shm=${shmBytes} B). Close Antigravity before modifying or copying SQLite files directly.`
      );
    }
  }

  const primary =
    databases.find((d) => d.dbPath === 'conversation_summaries.db') ||
    databases.find((d) => d.walActive) ||
    databases[0] ||
    null;

  return {
    dbPath: primary ? primary.dbPath : null,
    dbExists: databases.some((d) => d.dbExists),
    dbBytes: primary ? primary.dbBytes : 0,
    walExists: databases.some((d) => d.walExists),
    walBytes: databases.reduce((sum, d) => sum + d.walBytes, 0),
    shmExists: databases.some((d) => d.shmExists),
    shmBytes: databases.reduce((sum, d) => sum + d.shmBytes, 0),
    walActive: activeDbPaths.length > 0,
    activeDbPaths,
    databases,
    warnings,
  };
}

export function auditAntigravityStorage({
  dataDir = DEFAULT_DATA_DIR,
  topN = 10,
  maxFiles = DEFAULT_AUDIT_MAX_FILES,
  maxMetadataScans = DEFAULT_AUDIT_MAX_METADATA_SCANS,
  maxDurationMs = DEFAULT_AUDIT_MAX_DURATION_MS,
} = {}) {
  const resolvedDir = path.resolve(expandTildePath(dataDir || DEFAULT_DATA_DIR));
  const topLimit = Number.isInteger(topN) && topN > 0 ? topN : 10;
  const fileLimit =
    Number.isFinite(Number(maxFiles)) && Number(maxFiles) > 0
      ? Math.floor(Number(maxFiles))
      : DEFAULT_AUDIT_MAX_FILES;
  const metadataLimit =
    Number.isFinite(Number(maxMetadataScans)) && Number(maxMetadataScans) >= 0
      ? Math.floor(Number(maxMetadataScans))
      : DEFAULT_AUDIT_MAX_METADATA_SCANS;
  const durationLimit =
    Number.isFinite(Number(maxDurationMs)) && Number(maxDurationMs) > 0
      ? Math.floor(Number(maxDurationMs))
      : DEFAULT_AUDIT_MAX_DURATION_MS;

  let rootStat = null;
  try {
    rootStat = fs.statSync(resolvedDir);
  } catch {
    rootStat = null;
  }

  if (!rootStat || !rootStat.isDirectory()) {
    return {
      ok: true,
      exists: false,
      dataDir: resolvedDir,
      totalFiles: 0,
      totalDirs: 0,
      totalBytes: 0,
      skippedSymlinks: 0,
      truncated: false,
      truncatedDirs: [],
      topFiles: [],
      brain: { exists: false, sessionCount: 0, totalBytes: 0, sessions: [] },
      conversations: { exists: false, fileCount: 0, totalBytes: 0, files: [] },
      sqlite: {
        dbPath: null,
        dbExists: false,
        dbBytes: 0,
        walExists: false,
        walBytes: 0,
        shmExists: false,
        shmBytes: 0,
        walActive: false,
        activeDbPaths: [],
        databases: [],
        warnings: [],
      },
      orphans: [],
      corruptFiles: [],
      anomalies: [],
      warnings: [],
    };
  }

  const startedAt = Date.now();
  let totalFiles = 0;
  let totalDirs = 0;
  let totalBytes = 0;
  let skippedSymlinks = 0;
  let truncated = false;
  const truncationReasons = new Set();
  const truncatedDirs = [];
  let metadataScanned = 0;
  let stopRequested = false;

  const topFiles = [];
  const corruptFiles = [];
  const anomalies = [];
  const discoveredDbPaths = new Set();

  let convExists = false;
  const convFiles = [];
  let convTotalBytes = 0;
  const convIdSet = new Set();

  let brainExists = false;
  let brainTotalBytes = 0;
  const brainSessionMap = new Map();

  let opsCount = 0;
  const checkStop = () => {
    if (stopRequested) return true;
    if (totalFiles >= fileLimit) {
      truncated = true;
      truncationReasons.add('max-files');
      stopRequested = true;
      return true;
    }
    opsCount += 1;
    if ((opsCount & 15) === 0 && Date.now() - startedAt >= durationLimit) {
      truncated = true;
      truncationReasons.add('max-duration');
      stopRequested = true;
      return true;
    }
    return false;
  };

  walkDirectorySafe(resolvedDir, {
    shouldStop: checkStop,
    onDepthLimit: ({ relPath }) => {
      truncatedDirs.push(relPath);
    },
    onSymlink: () => {
      skippedSymlinks += 1;
    },
    onDir: ({ relPath, name, depth }) => {
      totalDirs += 1;
      if (depth === 0) {
        if (name === 'conversations') convExists = true;
        else if (name === 'brain') brainExists = true;
      } else if (depth === 1 && relPath.startsWith('brain/')) {
        if (!brainSessionMap.has(name)) {
          brainSessionMap.set(name, {
            sessionId: name,
            relPath: `brain/${name}`,
            bytes: 0,
            fileCount: 0,
            nestedTranscriptBytes: null,
            rootTranscriptBytes: null,
          });
        }
      }
    },
    onFile: ({ fullPath, relPath, name, stat }) => {
      totalFiles += 1;
      totalBytes += stat.size;
      insertTopFile(
        topFiles,
        {
          relPath,
          bytes: stat.size,
          mtimeMs: Math.round(stat.mtimeMs),
        },
        topLimit
      );

      if (isSqliteDbFilename(name)) {
        discoveredDbPaths.add(fullPath);
      } else {
        const companionBase = getBaseSqliteDbPathFromWalOrShm(fullPath);
        if (companionBase) discoveredDbPaths.add(companionBase);
      }

      if (name.toLowerCase().endsWith('.jsonl') && stat.size === 0) {
        corruptFiles.push({
          relPath,
          bytes: 0,
          reason: 'empty-jsonl',
        });
      }

      if (isScannableMetadataFile(relPath, stat.size)) {
        if (metadataScanned < metadataLimit) {
          metadataScanned += 1;
          inspectMetadataAnomalies(fullPath, relPath, stat.size, anomalies);
        } else {
          truncated = true;
          truncationReasons.add('max-metadata-scans');
        }
      }

      if (relPath.startsWith('conversations/')) {
        convTotalBytes += stat.size;
        convFiles.push({ relPath, name, bytes: stat.size });
        const stem = name.replace(/\.[^.]+$/, '');
        if (stem) convIdSet.add(stem);
      } else if (relPath.startsWith('brain/')) {
        const firstSlash = relPath.indexOf('/');
        const secondSlash = relPath.indexOf('/', firstSlash + 1);
        if (secondSlash > firstSlash + 1) {
          const sessionId = relPath.slice(firstSlash + 1, secondSlash);
          let sess = brainSessionMap.get(sessionId);
          if (!sess) {
            sess = {
              sessionId,
              relPath: `brain/${sessionId}`,
              bytes: 0,
              fileCount: 0,
              nestedTranscriptBytes: null,
              rootTranscriptBytes: null,
            };
            brainSessionMap.set(sessionId, sess);
          }
          sess.bytes += stat.size;
          sess.fileCount += 1;
          brainTotalBytes += stat.size;
          const tail = relPath.slice(secondSlash + 1);
          if (tail === '.system_generated/logs/transcript.jsonl') {
            sess.nestedTranscriptBytes = stat.size;
          } else if (tail === 'transcript.jsonl') {
            sess.rootTranscriptBytes = stat.size;
          }
        }
      }
    },
  });

  const brainSessions = [];
  const orphans = [];

  for (const sess of brainSessionMap.values()) {
    let transcriptRel = null;
    let transcriptBytes = 0;
    if (sess.nestedTranscriptBytes !== null) {
      transcriptRel = `brain/${sess.sessionId}/.system_generated/logs/transcript.jsonl`;
      transcriptBytes = sess.nestedTranscriptBytes;
    } else if (sess.rootTranscriptBytes !== null) {
      transcriptRel = `brain/${sess.sessionId}/transcript.jsonl`;
      transcriptBytes = sess.rootTranscriptBytes;
    }

    const hasTranscript = transcriptRel !== null;
    const corruptTranscript = hasTranscript && transcriptBytes === 0;
    const hasConversationMatch = convIdSet.has(sess.sessionId);

    let orphanReason = null;
    if (sess.fileCount === 0) {
      orphanReason = 'empty-session-dir';
    } else if (convFiles.length > 0 && !hasConversationMatch && !hasTranscript) {
      orphanReason = 'orphan-brain-dir';
    }

    if (orphanReason) {
      orphans.push({
        sessionId: sess.sessionId,
        relPath: sess.relPath,
        bytes: sess.bytes,
        fileCount: sess.fileCount,
        reason: orphanReason,
      });
    }

    brainSessions.push({
      sessionId: sess.sessionId,
      relPath: sess.relPath,
      bytes: sess.bytes,
      fileCount: sess.fileCount,
      hasTranscript,
      transcriptPath: transcriptRel,
      transcriptBytes,
      corruptTranscript,
      hasConversationMatch,
      isOrphan: Boolean(orphanReason),
    });
  }

  brainSessions.sort((a, b) => b.bytes - a.bytes || a.sessionId.localeCompare(b.sessionId));

  const sqlite = inspectSqliteStatus(resolvedDir, [...discoveredDbPaths]);

  // Pure read-only 16-byte magic header probe on inactive SQLite databases (skip active WAL/SHM to avoid lock contention & false positives)
  for (const db of sqlite.databases) {
    if (!db.dbExists || db.walActive) continue;
    const absDbPath = path.join(resolvedDir, ...db.dbPath.split('/'));
    const probe = probeSqliteHeaderReadOnly(absDbPath, db.dbBytes);
    if (!probe.valid) {
      corruptFiles.push({
        relPath: db.dbPath,
        bytes: db.dbBytes,
        reason: 'corrupt-sqlite-header',
      });
    }
  }

  const warnings = [...sqlite.warnings];
  if (skippedSymlinks > 0) {
    warnings.push(`Skipped ${skippedSymlinks} symlink(s) during read-only traversal for safety.`);
  }
  const emptyJsonlCount = corruptFiles.filter((c) => c.reason === 'empty-jsonl').length;
  const corruptSqliteCount = corruptFiles.filter((c) => c.reason === 'corrupt-sqlite-header').length;
  if (emptyJsonlCount > 0) {
    warnings.push(`Detected ${emptyJsonlCount} zero-byte .jsonl file(s).`);
  }
  if (corruptSqliteCount > 0) {
    warnings.push(`Detected ${corruptSqliteCount} SQLite database file(s) with invalid or 0-byte header.`);
  }
  if (orphans.length > 0) {
    warnings.push(`Detected ${orphans.length} empty or suspected orphan session director(y/ies) under brain/.`);
  }
  if (anomalies.length > 0) {
    warnings.push(`Detected ${anomalies.length} metadata anomal(y/ies) (read-only audit; no files were modified).`);
  }
  if (truncated) {
    warnings.push(
      `Audit truncated before completion (${[...truncationReasons].join(', ')}); reported totals may be partial.`
    );
  }
  if (truncatedDirs.length > 0) {
    warnings.push(
      `Truncated ${truncatedDirs.length} deep director(y/ies) exceeding max depth (${MAX_WALK_DEPTH}).`
    );
  }

  return {
    ok: true,
    exists: true,
    dataDir: resolvedDir,
    totalFiles,
    totalDirs,
    totalBytes,
    skippedSymlinks,
    truncated,
    truncatedDirs,
    topFiles,
    brain: {
      exists: brainExists,
      sessionCount: brainSessions.length,
      totalBytes: brainTotalBytes,
      sessions: brainSessions,
    },
    conversations: {
      exists: convExists,
      fileCount: convFiles.length,
      totalBytes: convTotalBytes,
      files: convFiles.sort((a, b) => b.bytes - a.bytes || a.relPath.localeCompare(b.relPath)),
    },
    sqlite,
    orphans,
    corruptFiles,
    anomalies,
    warnings,
  };
}

function validateSessionId(sessionId) {
  const sid = String(sessionId ?? '').trim();
  if (!sid || sid.includes('..') || sid.includes('/') || sid.includes('\\') || sid.includes('\0') || !SESSION_ID_RE.test(sid)) {
    throw new Error(`Invalid sessionId "${sid}": path traversal and special path separators are forbidden`);
  }
  return sid;
}

function extractTextFromValue(val) {
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) {
    return val
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          if (typeof part.text === 'string') return part.text;
          if (typeof part.content === 'string') return part.content;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (val && typeof val === 'object') {
    if (typeof val.text === 'string') return val.text;
    if (typeof val.content === 'string') return val.content;
    if (Array.isArray(val.parts)) return extractTextFromValue(val.parts);
  }
  return '';
}

function parseTranscriptJsonl(rawText) {
  const lines = String(rawText || '').split(/\r?\n/);
  const entries = [];
  let malformedLines = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      malformedLines += 1;
      continue;
    }
    if (!obj || typeof obj !== 'object') {
      malformedLines += 1;
      continue;
    }

    const rawRole = obj.role || obj.author || obj.sender || obj.type || 'unknown';
    const role = redactSecrets(String(rawRole)).trim().toLowerCase() || 'unknown';
    const rawContent =
      extractTextFromValue(obj.content) ||
      extractTextFromValue(obj.text) ||
      extractTextFromValue(obj.message) ||
      extractTextFromValue(obj.parts) ||
      '';
    const text = redactSecrets(rawContent).trim();
    const tsRaw = obj.timestamp || obj.createdAt || obj.ts || obj.time || null;
    const timestamp = tsRaw !== null && tsRaw !== undefined ? redactSecrets(String(tsRaw)) : null;

    entries.push({
      index: entries.length + 1,
      role,
      timestamp,
      text,
    });
  }

  return { entries, malformedLines };
}

export function exportSanitizedSession({
  dataDir = DEFAULT_DATA_DIR,
  sessionId,
  outFile = null,
  format = 'md',
  maxBytes = DEFAULT_EXPORT_MAX_BYTES,
} = {}) {
  const sid = validateSessionId(sessionId);
  const fmt = String(format || 'md').trim().toLowerCase();
  if (fmt !== 'md' && fmt !== 'json') {
    throw new Error(`Unsupported export format "${format}" (expected md | json)`);
  }
  const byteLimit =
    Number.isFinite(Number(maxBytes)) && Number(maxBytes) > 0
      ? Math.floor(Number(maxBytes))
      : DEFAULT_EXPORT_MAX_BYTES;

  const resolvedDataDir = path.resolve(expandTildePath(dataDir || DEFAULT_DATA_DIR));
  const brainDir = path.join(resolvedDataDir, 'brain');
  const brainStat = safeLstat(brainDir);
  if (brainStat && brainStat.isSymbolicLink()) {
    throw new Error(`Refusing to traverse symlinked brain directory for session: ${sid}`);
  }
  if (!brainStat || !brainStat.isDirectory()) {
    throw new Error(`Brain directory not found for session: ${sid}`);
  }

  let realDataDir;
  let realBrainDir;
  try {
    realDataDir = canonicalRealpathSync(resolvedDataDir);
    realBrainDir = canonicalRealpathSync(brainDir);
  } catch {
    throw new Error(`Unable to resolve real path for dataDir/brain directory: ${sid}`);
  }

  if (!isPathWithinBase(realBrainDir, realDataDir)) {
    throw new Error(`Resolved brain directory escapes dataDir: ${sid}`);
  }

  const sessionDir = path.resolve(brainDir, sid);

  // Defense-in-depth containment check
  if (!isPathWithinBase(sessionDir, brainDir)) {
    throw new Error(`Resolved session path escapes brain directory: ${sid}`);
  }

  const sessionStat = safeLstat(sessionDir);
  if (!sessionStat || sessionStat.isSymbolicLink() || !sessionStat.isDirectory()) {
    throw new Error(`Session directory not found or symlink rejected: ${sid}`);
  }

  const candidates = [
    path.join(sessionDir, '.system_generated', 'logs', 'transcript.jsonl'),
    path.join(sessionDir, 'transcript.jsonl'),
  ];

  let transcriptPath = null;
  for (const cand of candidates) {
    const st = safeLstat(cand);
    if (st && st.isSymbolicLink()) {
      throw new Error(`Refusing to read symlinked transcript for session: ${sid}`);
    }
    if (st && st.isFile()) {
      // Ensure every parent segment between sessionDir and candidate is also not a symlink
      let cur = path.dirname(cand);
      let symlinkFound = false;
      while (cur.startsWith(sessionDir) && cur !== sessionDir) {
        const pst = safeLstat(cur);
        if (pst && pst.isSymbolicLink()) {
          symlinkFound = true;
          break;
        }
        cur = path.dirname(cur);
      }
      if (symlinkFound) {
        throw new Error(`Refusing to traverse symlinked directory for session: ${sid}`);
      }
      transcriptPath = cand;
      break;
    }
  }

  if (!transcriptPath) {
    throw new Error(`Transcript file not found for session: ${sid}`);
  }

  const realTranscriptPath = canonicalRealpathSync(transcriptPath);
  if (!isPathWithinBase(realTranscriptPath, realDataDir) || !isPathWithinBase(realTranscriptPath, realBrainDir)) {
    throw new Error(`Resolved transcript path escapes dataDir for session: ${sid}`);
  }

  const realTranscriptStat = fs.statSync(realTranscriptPath);
  if (realTranscriptStat.size > byteLimit) {
    throw new Error(
      `Transcript file for session "${sid}" exceeds maxBytes limit (${realTranscriptStat.size} > ${byteLimit} bytes)`
    );
  }

  const rawText = fs.readFileSync(realTranscriptPath, 'utf8');
  const { entries, malformedLines } = parseTranscriptJsonl(rawText);
  const sourceRelPath = toPosixRel(resolvedDataDir, transcriptPath);
  const exportedAt = new Date().toISOString();

  let output;
  if (fmt === 'json') {
    output =
      JSON.stringify(
        {
          sessionId: sid,
          format: 'json',
          source: sourceRelPath,
          exportedAt,
          entryCount: entries.length,
          malformedLines,
          entries,
        },
        null,
        2
      ) + '\n';
  } else {
    const lines = [
      '# Antigravity Sanitized Session Export',
      '',
      `- **Session ID**: \`${sid}\``,
      `- **Source**: \`${sourceRelPath}\``,
      `- **Exported At**: ${exportedAt}`,
      `- **Entries**: ${entries.length}`,
    ];
    if (malformedLines > 0) {
      lines.push(`- **Malformed JSONL Lines Skipped**: ${malformedLines}`);
    }
    lines.push('');

    for (const entry of entries) {
      const tsPart = entry.timestamp ? ` (${entry.timestamp})` : '';
      lines.push(`## #${entry.index} · ${entry.role}${tsPart}`);
      lines.push('');
      lines.push(entry.text || '_(empty)_');
      lines.push('');
    }
    output = lines.join('\n').trimEnd() + '\n';
  }

  if (outFile) {
    const resolvedOut = path.resolve(expandTildePath(String(outFile)));
    if (isPathInsideOrEqual(resolvedOut, resolvedDataDir)) {
      throw new Error('Refusing to write export file inside source dataDir');
    }
    assertNoSymlinkAncestors(resolvedOut);
    const outDirPath = path.dirname(resolvedOut);
    fs.mkdirSync(outDirPath, { recursive: true });
    assertNoSymlinkAncestors(resolvedOut);
    const existingOut = safeLstat(resolvedOut);
    if (existingOut && (existingOut.isSymbolicLink() || existingOut.isDirectory())) {
      throw new Error(`Security violation: refusing symlink or directory export target (${resolvedOut})`);
    }
    exportTmpCounter += 1;
    const tmpName = `.sag-export.${process.pid}.${Date.now()}.${exportTmpCounter}.${Math.random().toString(16).slice(2)}.tmp`;
    const tmpPath = path.join(outDirPath, tmpName);
    let createdTmp = false;
    try {
      fs.writeFileSync(tmpPath, output, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      createdTmp = true;
      assertNoSymlinkAncestors(resolvedOut);
      atomicRenameWithRetry(tmpPath, resolvedOut);
    } catch (err) {
      if (createdTmp) {
        try { fs.unlinkSync(tmpPath); } catch {}
      }
      throw err;
    }
    return {
      ok: true,
      sessionId: sid,
      format: fmt,
      outFile: resolvedOut,
      bytes: Buffer.byteLength(output, 'utf8'),
      entryCount: entries.length,
      malformedLines,
      content: output,
    };
  }

  return output;
}

function buildSearchSnippet(text, queryLower, maxLen = 160) {
  const flat = redactSecrets(String(text || '')).replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  const idx = flat.toLowerCase().indexOf(queryLower);
  if (idx < 0) return flat.slice(0, maxLen);
  const start = Math.max(0, idx - 48);
  const end = Math.min(flat.length, start + maxLen);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < flat.length ? '…' : '';
  return `${prefix}${flat.slice(start, end)}${suffix}`;
}

export function searchSanitizedSessions({
  dataDir = DEFAULT_DATA_DIR,
  query = '',
  limit = MAX_SEARCH_LIMIT,
  maxSessions = MAX_SEARCH_SESSIONS,
} = {}) {
  const resolvedDataDir = path.resolve(expandTildePath(dataDir || DEFAULT_DATA_DIR));
  const cleanQuery = String(query ?? '').trim().slice(0, 120);
  const maxResults = Math.max(1, Math.min(MAX_SEARCH_LIMIT, Number.isFinite(Number(limit)) ? Math.floor(Number(limit)) : MAX_SEARCH_LIMIT));
  const sessionCap = Math.max(1, Math.min(MAX_SEARCH_SESSIONS, Number.isFinite(Number(maxSessions)) ? Math.floor(Number(maxSessions)) : MAX_SEARCH_SESSIONS));

  if (!cleanQuery) {
    return {
      ok: true,
      exists: false,
      dataDir: resolvedDataDir,
      query: '',
      scannedSessions: 0,
      skippedSymlinks: 0,
      skippedLargeFiles: 0,
      totalMatches: 0,
      results: [],
    };
  }

  const brainDir = path.join(resolvedDataDir, 'brain');
  const brainStat = safeLstat(brainDir);
  if (!brainStat || brainStat.isSymbolicLink() || !brainStat.isDirectory()) {
    return {
      ok: true,
      exists: false,
      dataDir: resolvedDataDir,
      query: cleanQuery,
      scannedSessions: 0,
      skippedSymlinks: brainStat?.isSymbolicLink?.() ? 1 : 0,
      skippedLargeFiles: 0,
      totalMatches: 0,
      results: [],
    };
  }

  let realDataDir;
  let realBrainDir;
  try {
    realDataDir = canonicalRealpathSync(resolvedDataDir);
    realBrainDir = canonicalRealpathSync(brainDir);
  } catch {
    return {
      ok: true,
      exists: false,
      dataDir: resolvedDataDir,
      query: cleanQuery,
      scannedSessions: 0,
      skippedSymlinks: 0,
      skippedLargeFiles: 0,
      totalMatches: 0,
      results: [],
    };
  }
  if (!isPathWithinBase(realBrainDir, realDataDir)) {
    return {
      ok: true,
      exists: false,
      dataDir: resolvedDataDir,
      query: cleanQuery,
      scannedSessions: 0,
      skippedSymlinks: 1,
      skippedLargeFiles: 0,
      totalMatches: 0,
      results: [],
    };
  }

  let dirEntries = [];
  try {
    dirEntries = fs.readdirSync(brainDir, { withFileTypes: true });
  } catch {
    dirEntries = [];
  }

  let skippedSymlinks = 0;
  let skippedLargeFiles = 0;
  const sessionCandidates = [];
  for (const entry of dirEntries) {
    if (!SESSION_ID_RE.test(entry.name)) continue;
    const sessionDir = path.join(brainDir, entry.name);
    const st = safeLstat(sessionDir);
    if (!st) continue;
    if (st.isSymbolicLink()) {
      skippedSymlinks += 1;
      continue;
    }
    if (!st.isDirectory()) continue;

    const transcriptCandidates = [
      path.join(sessionDir, '.system_generated', 'logs', 'transcript.jsonl'),
      path.join(sessionDir, 'transcript.jsonl'),
    ];
    let chosenPath = null;
    let chosenStat = null;
    let candSkippedSymlinks = 0;
    for (const tp of transcriptCandidates) {
      const tst = safeLstat(tp);
      if (!tst) continue;
      if (tst.isSymbolicLink()) {
        candSkippedSymlinks += 1;
        continue;
      }
      if (!tst.isFile()) continue;
      let cur = path.dirname(tp);
      let hasSymParent = false;
      while (cur.startsWith(sessionDir) && cur !== sessionDir) {
        const pst = safeLstat(cur);
        if (pst && pst.isSymbolicLink()) {
          hasSymParent = true;
          break;
        }
        cur = path.dirname(cur);
      }
      if (hasSymParent) {
        candSkippedSymlinks += 1;
        continue;
      }
      chosenPath = tp;
      chosenStat = tst;
      break;
    }

    const dirMtimeMs = Math.round(st.mtimeMs || 0);
    const transcriptMtimeMs = chosenStat ? Math.round(chosenStat.mtimeMs || 0) : null;
    sessionCandidates.push({
      sessionId: entry.name,
      sessionDir,
      mtimeMs: transcriptMtimeMs !== null ? transcriptMtimeMs : dirMtimeMs,
      chosenPath,
      chosenStat,
      candSkippedSymlinks,
    });
  }
  sessionCandidates.sort((a, b) => b.mtimeMs - a.mtimeMs || a.sessionId.localeCompare(b.sessionId));

  const queryLower = cleanQuery.toLowerCase();
  const results = [];
  let scannedSessions = 0;
  let totalMatches = 0;

  for (const cand of sessionCandidates.slice(0, sessionCap)) {
    if (results.length >= maxResults) break;
    skippedSymlinks += cand.candSkippedSymlinks;
    const chosenPath = cand.chosenPath;
    const chosenStat = cand.chosenStat;
    if (!chosenPath || !chosenStat) continue;
    if (chosenStat.size > MAX_SEARCH_FILE_BYTES) {
      skippedLargeFiles += 1;
      continue;
    }
    let realTranscript;
    try {
      realTranscript = canonicalRealpathSync(chosenPath);
    } catch {
      continue;
    }
    if (!isPathWithinBase(realTranscript, realBrainDir) || !isPathWithinBase(realTranscript, realDataDir)) {
      skippedSymlinks += 1;
      continue;
    }

    scannedSessions += 1;
    let rawText;
    try {
      rawText = fs.readFileSync(realTranscript, 'utf8');
    } catch {
      continue;
    }
    if (!rawText.toLowerCase().includes(queryLower)) continue;

    const { entries } = parseTranscriptJsonl(rawText);
    const matches = [];
    for (const entry of entries) {
      if (!entry.text || !entry.text.toLowerCase().includes(queryLower)) continue;
      totalMatches += 1;
      if (matches.length < MAX_SEARCH_MATCHES_PER_SESSION) {
        matches.push({
          index: entry.index,
          role: entry.role,
          timestamp: entry.timestamp,
          snippet: buildSearchSnippet(entry.text, queryLower, 160),
        });
      }
    }
    if (matches.length > 0) {
      results.push({
        sessionId: cand.sessionId,
        mtimeMs: Math.round(chosenStat.mtimeMs || cand.mtimeMs || 0),
        matchCount: matches.length,
        matches,
      });
    }
  }

  return {
    ok: true,
    exists: true,
    dataDir: resolvedDataDir,
    query: cleanQuery,
    scannedSessions,
    skippedSymlinks,
    skippedLargeFiles,
    totalMatches,
    results,
  };
}

export function formatStorageSearchHuman(report) {
  const lines = [
    'agy-Sag · Read-Only Session Search (Sanitized)',
    '==============================================',
    `Data Dir: ${report.dataDir}`,
    `Query:    "${report.query}" | Scanned: ${report.scannedSessions} session(s) | Matches: ${report.totalMatches}`,
  ];
  if (!report.results || report.results.length === 0) {
    lines.push('ℹ No matching sanitized entries found.');
    return lines.join('\n');
  }
  for (const r of report.results) {
    lines.push('');
    lines.push(`• Session ${r.sessionId} (${r.matches.length} snippet(s))`);
    for (const m of r.matches) {
      lines.push(`  [#${m.index} · ${m.role}] ${m.snippet}`);
    }
  }
  return lines.join('\n');
}

export function createStorageBackup({
  dataDir = DEFAULT_DATA_DIR,
  outDir,
  dryRun = false,
  maxFileBytes = DEFAULT_BACKUP_MAX_FILE_BYTES,
  maxTotalBytes = DEFAULT_BACKUP_MAX_TOTAL_BYTES,
} = {}) {
  if (!outDir || !String(outDir).trim()) {
    throw new Error('createStorageBackup requires a non-empty outDir');
  }

  const fileByteLimit =
    Number.isFinite(Number(maxFileBytes)) && Number(maxFileBytes) > 0
      ? Math.floor(Number(maxFileBytes))
      : DEFAULT_BACKUP_MAX_FILE_BYTES;
  const totalByteLimit =
    Number.isFinite(Number(maxTotalBytes)) && Number(maxTotalBytes) > 0
      ? Math.floor(Number(maxTotalBytes))
      : DEFAULT_BACKUP_MAX_TOTAL_BYTES;

  const resolvedSrc = path.resolve(expandTildePath(dataDir || DEFAULT_DATA_DIR));
  const resolvedOut = path.resolve(expandTildePath(String(outDir)));

  // Prevent infinite recursion when outDir is equal to or inside dataDir
  if (isPathInsideOrEqual(resolvedOut, resolvedSrc)) {
    throw new Error('Backup outDir cannot be the same as or inside source dataDir (infinite recursion risk)');
  }

  const audit = auditAntigravityStorage({ dataDir: resolvedSrc, topN: 10 });
  if (!audit.exists) {
    return {
      ok: false,
      exists: false,
      dryRun: Boolean(dryRun),
      dataDir: resolvedSrc,
      outDir: resolvedOut,
      walActive: false,
      activeDbPaths: [],
      warnings: ['Source dataDir does not exist'],
      fileCount: 0,
      totalBytes: 0,
      copiedFiles: 0,
      files: [],
      skipped: [],
    };
  }

  const walActive = Boolean(audit.sqlite.walActive);
  const activeDbPaths = [...(audit.sqlite.activeDbPaths || [])];
  const activeDbSet = new Set(activeDbPaths);
  const warnings = [...audit.sqlite.warnings];
  const skippedActiveDbs = [];
  const skippedOversizedFiles = [];
  const skippedOverTotalBudget = [];
  const candidateFiles = [];
  const files = [];
  const skipped = [];

  walkDirectorySafe(resolvedSrc, {
    onSymlink: ({ relPath }) => {
      skipped.push({ relPath, reason: 'symlink' });
    },
    onFile: ({ fullPath, relPath, name, stat }) => {
      const topSegment = relPath.split('/')[0];
      const isRootFile = !relPath.includes('/');
      const isPriorityTree = BACKUP_PRIORITY_ROOTS.has(topSegment);

      if (isLockFilename(name)) {
        skipped.push({ relPath, bytes: stat.size, reason: 'lock-or-wal-file' });
        return;
      }

      if (activeDbSet.has(relPath)) {
        skippedActiveDbs.push(relPath);
        skipped.push({ relPath, bytes: stat.size, reason: 'sqlite-wal-active' });
        return;
      }

      if (!isPriorityTree && !isRootFile) {
        skipped.push({ relPath, bytes: stat.size, reason: 'non-essential-subdir' });
        return;
      }

      if (stat.size > fileByteLimit) {
        skippedOversizedFiles.push(relPath);
        skipped.push({ relPath, bytes: stat.size, reason: 'exceeds-max-file-bytes' });
        return;
      }

      candidateFiles.push({
        srcPath: fullPath,
        relPath,
        bytes: stat.size,
      });
    },
  });

  candidateFiles.sort((a, b) => a.relPath.localeCompare(b.relPath));

  let plannedBytes = 0;
  for (const item of candidateFiles) {
    if (plannedBytes + item.bytes > totalByteLimit) {
      skippedOverTotalBudget.push(item.relPath);
      skipped.push({ relPath: item.relPath, bytes: item.bytes, reason: 'exceeds-max-total-bytes' });
      continue;
    }
    plannedBytes += item.bytes;
    files.push(item);
  }

  if (skippedActiveDbs.length > 0) {
    warnings.push(`Skipped active SQLite database(s) with WAL/SHM lock: ${skippedActiveDbs.join(', ')}`);
  }
  if (skippedOversizedFiles.length > 0) {
    warnings.push(
      `Skipped ${skippedOversizedFiles.length} file(s) exceeding maxFileBytes limit (${formatBytes(fileByteLimit)}).`
    );
  }
  if (skippedOverTotalBudget.length > 0) {
    warnings.push(
      `Skipped ${skippedOverTotalBudget.length} file(s) exceeding maxTotalBytes budget (${formatBytes(totalByteLimit)}).`
    );
  }

  const totalBytes = plannedBytes;

  if (dryRun) {
    return {
      ok: true,
      exists: true,
      dryRun: true,
      dataDir: resolvedSrc,
      outDir: resolvedOut,
      walActive,
      activeDbPaths,
      warnings,
      fileCount: files.length,
      totalBytes,
      copiedFiles: 0,
      files: files.map(({ relPath, bytes }) => ({ relPath, bytes })),
      skipped,
    };
  }

  assertNoSymlinkAncestors(resolvedOut);
  const preOutStat = safeLstat(resolvedOut);
  if (preOutStat && (preOutStat.isSymbolicLink() || !preOutStat.isDirectory())) {
    throw new Error(`Security violation: backup outDir must not be a symlink or non-directory (${resolvedOut})`);
  }
  fs.mkdirSync(resolvedOut, { recursive: true });
  assertNoSymlinkAncestors(resolvedOut);
  const realDestRoot = canonicalRealpathSync(resolvedOut);

  let copiedFiles = 0;
  let copiedBytes = 0;
  const copiedList = [];

  for (const f of files) {
    const destPath = path.join(resolvedOut, ...f.relPath.split('/'));
    if (!isPathWithinBase(destPath, resolvedOut)) {
      throw new Error(`Security violation: backup destination escapes outDir (${destPath})`);
    }
    // Check every directory segment inside destRoot and the target file itself against symlinks/junctions
    const relParent = path.relative(resolvedOut, path.dirname(destPath));
    let cur = resolvedOut;
    if (relParent && relParent !== '.') {
      for (const seg of relParent.split(path.sep)) {
        if (!seg || seg === '.') continue;
        cur = path.join(cur, seg);
        const segStat = safeLstat(cur);
        if (segStat && segStat.isSymbolicLink()) {
          throw new Error(`Security violation: refusing symlink directory inside backup destination (${cur})`);
        }
        if (segStat && !segStat.isDirectory()) {
          throw new Error(`Security violation: non-directory segment inside backup destination (${cur})`);
        }
      }
    }
    const existingDestStat = safeLstat(destPath);
    if (existingDestStat && existingDestStat.isSymbolicLink()) {
      throw new Error(`Security violation: refusing symlink target inside backup destination (${destPath})`);
    }

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const realParentDir = canonicalRealpathSync(path.dirname(destPath));
    if (!isPathWithinBase(realParentDir, realDestRoot)) {
      throw new Error(`Security violation: resolved backup parent escapes destRoot (${destPath})`);
    }
    const postDestStat = safeLstat(destPath);
    if (postDestStat && postDestStat.isSymbolicLink()) {
      throw new Error(`Security violation: refusing symlink target inside backup destination (${destPath})`);
    }

    try {
      copyFileSafeAtomic(f.srcPath, destPath, realDestRoot);
      copiedFiles += 1;
      copiedBytes += f.bytes;
      copiedList.push({ relPath: f.relPath, bytes: f.bytes });
    } catch (err) {
      if (/Security violation/i.test(err?.message || '')) throw err;
      skipped.push({ relPath: f.relPath, bytes: f.bytes, reason: `copy-failed: ${err?.code || err?.message || 'error'}` });
    }
  }

  return {
    ok: true,
    exists: true,
    dryRun: false,
    dataDir: resolvedSrc,
    outDir: resolvedOut,
    walActive,
    activeDbPaths,
    warnings,
    fileCount: files.length,
    totalBytes: copiedBytes,
    copiedFiles,
    files: copiedList,
    skipped,
  };
}

export function formatStorageAuditHuman(report) {
  const lines = [];
  lines.push('agy-Sag · Storage Doctor');
  lines.push('========================');
  lines.push(`Data Dir: ${report.dataDir}`);

  if (!report.exists) {
    lines.push('ℹ Storage directory does not exist (nothing to audit).');
    return lines.join('\n');
  }

  lines.push(
    `✔ Totals: ${report.totalFiles} file(s), ${report.totalDirs} dir(s), ${formatBytes(report.totalBytes)}` +
      (report.skippedSymlinks ? ` (skipped ${report.skippedSymlinks} symlink(s))` : '')
  );
  lines.push(
    `• brain/: ${report.brain.sessionCount} session(s) · ${formatBytes(report.brain.totalBytes)}`
  );
  lines.push(
    `• conversations/: ${report.conversations.fileCount} file(s) · ${formatBytes(report.conversations.totalBytes)}`
  );

  const sq = report.sqlite;
  if (sq.dbExists || sq.walExists || sq.shmExists) {
    const walTag = sq.walActive
      ? `⚠ WAL ACTIVE (wal=${formatBytes(sq.walBytes)}, shm=${formatBytes(sq.shmBytes)})`
      : '✔ WAL clean';
    const activeSuffix =
      Array.isArray(sq.activeDbPaths) && sq.activeDbPaths.length > 1
        ? ` [active: ${sq.activeDbPaths.join(', ')}]`
        : '';
    lines.push(
      `• SQLite (${sq.dbPath || 'conversation_summaries.db'}): ${formatBytes(sq.dbBytes)} · ${walTag}${activeSuffix}`
    );
  } else {
    lines.push('• SQLite: no SQLite database present');
  }

  if (report.topFiles.length > 0) {
    lines.push('');
    lines.push(`Top ${report.topFiles.length} Largest Files:`);
    for (const f of report.topFiles) {
      lines.push(`  - ${formatBytes(f.bytes).padStart(10)}  ${f.relPath}`);
    }
  }

  if (report.orphans.length > 0) {
    lines.push('');
    lines.push(`Orphan / Empty Brain Directories (${report.orphans.length}):`);
    for (const o of report.orphans) {
      lines.push(`  ⚠ ${o.relPath} [${o.reason}] (${formatBytes(o.bytes)})`);
    }
  }

  if (report.corruptFiles.length > 0) {
    lines.push('');
    lines.push(`Corrupt / Empty JSONL Files (${report.corruptFiles.length}):`);
    for (const c of report.corruptFiles) {
      lines.push(`  ✖ ${c.relPath} [${c.reason}]`);
    }
  }

  if (report.anomalies.length > 0) {
    lines.push('');
    lines.push(`Read-Only Metadata Anomalies (${report.anomalies.length}):`);
    for (const a of report.anomalies) {
      lines.push(`  ⚠ ${a.relPath} [${a.type}] — ${a.detail}`);
    }
  }

  if (report.warnings.length > 0) {
    lines.push('');
    lines.push('Safety Warnings:');
    for (const w of report.warnings) {
      lines.push(`  • ${w}`);
    }
  }

  return lines.join('\n');
}

function formatUsage() {
  return [
    'Usage:',
    '  node cli/storage-doctor.mjs audit [--data-dir=<dir>] [--top=<n>] [--json]',
    '  node cli/storage-doctor.mjs backup --out=<dir> [--data-dir=<dir>] [--dry-run] [--json]',
    '  node cli/storage-doctor.mjs export --session=<id> [--data-dir=<dir>] [--format=md|json] [--out=<file>]',
    '  node cli/storage-doctor.mjs search --q=<keyword> [--data-dir=<dir>] [--limit=<1..20>] [--json]',
  ].join('\n');
}

async function runCli() {
  const opts = parseStorageArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(formatUsage());
    return;
  }

  if (opts.command === 'audit') {
    const report = auditAntigravityStorage({ dataDir: opts.dataDir, topN: opts.topN });
    if (opts.json) console.log(JSON.stringify(report, null, 2));
    else console.log(formatStorageAuditHuman(report));
    return;
  }

  if (opts.command === 'backup') {
    const res = createStorageBackup({
      dataDir: opts.dataDir,
      outDir: opts.outDir,
      dryRun: opts.dryRun,
    });
    if (opts.json) {
      console.log(JSON.stringify(res, null, 2));
    } else {
      const mode = res.dryRun ? 'DRY RUN' : 'BACKUP COMPLETE';
      console.log(`[storage-doctor] ${mode}: ${res.fileCount} file(s), ${formatBytes(res.totalBytes)} -> ${res.outDir}`);
      if (res.walActive) {
        console.log('⚠ WAL active detected; live SQLite WAL/SHM/DB lock files were skipped safely.');
      }
      for (const w of res.warnings) console.log(`  • ${w}`);
    }
    if (!res.ok) process.exitCode = 1;
    return;
  }

  if (opts.command === 'search') {
    const report = searchSanitizedSessions({
      dataDir: opts.dataDir,
      query: opts.query,
      limit: opts.limit,
    });
    if (opts.json) console.log(JSON.stringify(report, null, 2));
    else console.log(formatStorageSearchHuman(report));
    return;
  }

  if (opts.command === 'export') {
    const res = exportSanitizedSession({
      dataDir: opts.dataDir,
      sessionId: opts.sessionId,
      outFile: opts.outFile,
      format: opts.format,
    });
    if (typeof res === 'string') {
      process.stdout.write(res);
    } else if (opts.json) {
      console.log(JSON.stringify({ ...res, content: undefined }, null, 2));
    } else {
      console.log(
        `[storage-doctor] Exported ${res.entryCount} entries (${formatBytes(res.bytes)}) -> ${res.outFile}`
      );
    }
  }
}

const isEntry = isCliEntry(import.meta.url);
if (isEntry) {
  runCli().catch((err) => {
    console.error('[agy-Sag:storage-doctor]', err?.message || err);
    process.exitCode = 1;
  });
}
