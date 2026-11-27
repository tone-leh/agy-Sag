/**
 * agy-Sag — Cross-Platform Path, Entry, Symlink & Atomic File Utilities (Zero runtime npm deps)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WIN_RETRYABLE_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);

/**
 * Strips Windows extended-length device prefixes (`\\?\`, `\\?\UNC\`, `//?/`, `//?/UNC/`).
 */
export function stripWindowsDevicePrefix(p) {
  const s = String(p ?? '');
  if (!s) return '';
  if (/^(?:\\\\\?\\|\/\/\?\/)UNC[\\/]/i.test(s)) {
    return `\\\\${s.replace(/^(?:\\\\\?\\|\/\/\?\/)UNC[\\/]/i, '')}`;
  }
  if (/^(?:\\\\\?\\|\/\/\?\/)/.test(s)) {
    return s.replace(/^(?:\\\\\?\\|\/\/\?\/)/, '');
  }
  return s;
}

/**
 * Normalizes a path for deterministic cross-platform comparison:
 * - Strips Windows `\\?\` and `\\?\UNC\` device prefixes
 * - Unifies separators to `/`
 * - Lowercases on `win32` (drive letters + path segments)
 * - Removes trailing slashes except filesystem roots (`/`, `c:/`, `//server/share`)
 */
export function normalizePathForCompare(p, platform = process.platform) {
  if (typeof p !== 'string' || !p.trim()) return '';
  const stripped = stripWindowsDevicePrefix(p);
  if (platform === 'win32') {
    const winNorm = path.win32.normalize(stripped.replace(/\//g, '\\'));
    let unified = winNorm.replace(/\\/g, '/').toLowerCase();
    // Preserve drive root `c:/` and UNC share root `//server/share`
    if (/^[a-z]:\/$/.test(unified)) return unified;
    if (/^\/\/[^/]+\/[^/]+\/?$/.test(unified)) {
      return unified.replace(/\/+$/, '');
    }
    unified = unified.replace(/\/+$/, '');
    return unified;
  }
  const posixNorm = path.posix.normalize(p);
  if (posixNorm === '/') return '/';
  return posixNorm.replace(/\/+$/, '');
}

/**
 * Checks whether `childPath` is equal to or strictly nested inside `basePath`,
 * safely handling Windows drive-letter casing, mixed slashes, `\\?\`, and `\\?\UNC\` prefixes.
 */
export function isPathWithinBase(childPath, basePath, platform = process.platform) {
  const normChild = normalizePathForCompare(childPath, platform);
  const normBase = normalizePathForCompare(basePath, platform);
  if (!normChild || !normBase) return false;
  if (normChild === normBase) return true;
  const prefix = normBase.endsWith('/') ? normBase : `${normBase}/`;
  return normChild.startsWith(prefix);
}

function resolvePathForPlatform(p, platform = process.platform) {
  const stripped = stripWindowsDevicePrefix(String(p ?? ''));
  if (platform === 'win32') {
    if (/^(?:[A-Za-z]:|\\\\|\/\/)/.test(stripped)) {
      return path.win32.resolve(stripped);
    }
    return path.win32.resolve(stripped);
  }
  return path.resolve(stripped);
}

function safeRealpathOrResolve(p, platform = process.platform, realpathSyncFn = fs.realpathSync) {
  const raw = String(p ?? '');
  if (!raw) return '';
  try {
    return realpathSyncFn(raw);
  } catch {
    return resolvePathForPlatform(raw, platform);
  }
}

/**
 * Reliable CLI entrypoint check across POSIX symlinks (`npm link`) and Windows
 * drive-letter casing / `\\?\` extended paths.
 */
export function isCliEntry(
  importMetaUrl,
  argv1 = process.argv[1],
  platform = process.platform,
  { realpathSyncFn = fs.realpathSync } = {}
) {
  if (!importMetaUrl || !argv1) return false;
  let metaPath;
  try {
    metaPath = String(importMetaUrl).startsWith('file:') ? fileURLToPath(importMetaUrl) : String(importMetaUrl);
  } catch {
    return false;
  }
  const resolvedMeta = safeRealpathOrResolve(metaPath, platform, realpathSyncFn);
  const resolvedArgv = safeRealpathOrResolve(String(argv1), platform, realpathSyncFn);
  if (!resolvedMeta || !resolvedArgv) return false;
  return normalizePathForCompare(resolvedArgv, platform) === normalizePathForCompare(resolvedMeta, platform);
}

/**
 * Expands a leading `~`, `~/...`, or `~\...` against `homeDir`.
 */
export function expandTildePath(p, homeDir = os.homedir()) {
  if (typeof p !== 'string') return p;
  if (p === '~') return homeDir;
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    const rest = p.slice(2);
    const isWinHome = /^[A-Za-z]:[\\/]/.test(homeDir) || homeDir.includes('\\');
    return isWinHome ? path.win32.join(homeDir, rest) : path.join(homeDir, rest);
  }
  return p;
}

function sleepSyncBounded(ms) {
  const delay = Math.max(1, Math.min(200, Math.round(ms)));
  try {
    const arr = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(arr, 0, 0, delay);
  } catch {
    const end = Date.now() + delay;
    while (Date.now() < end) {
      // Bounded fallback spin
    }
  }
}

/**
 * Performs `fs.renameSync` with short synchronous backoff retries on `win32` when
 * transient AV scanners or handle locks raise `EPERM`, `EACCES`, or `EBUSY`.
 * Total retry wait is strictly bounded below 200ms.
 */
export function atomicRenameWithRetry(
  tmpPath,
  targetPath,
  {
    platform = process.platform,
    maxRetries = 4,
    baseDelayMs = 15,
    maxTotalWaitMs = 180,
    renameSyncFn = fs.renameSync,
    waitFn = null,
  } = {}
) {
  const retries = platform === 'win32' ? Math.max(0, Math.floor(maxRetries)) : 0;
  let totalWaited = 0;

  for (let attempt = 0; ; attempt += 1) {
    try {
      renameSyncFn(tmpPath, targetPath);
      return;
    } catch (err) {
      const code = err?.code;
      if (attempt >= retries || !WIN_RETRYABLE_RENAME_CODES.has(code)) {
        throw err;
      }
      const remaining = maxTotalWaitMs - totalWaited;
      if (remaining <= 0) {
        throw err;
      }
      const delay = Math.min(remaining, Math.max(1, baseDelayMs * (attempt + 1)));
      if (typeof waitFn === 'function') {
        waitFn(delay);
      } else {
        sleepSyncBounded(delay);
      }
      totalWaited += delay;
    }
  }
}

/**
 * Applies POSIX `chmodSync`, tolerating unsupported ACL/chmod errors on `win32`.
 */
export function safeChmodSync(
  targetPath,
  mode,
  { platform = process.platform, chmodSyncFn = fs.chmodSync } = {}
) {
  if (platform === 'win32') {
    try {
      chmodSyncFn(targetPath, mode);
    } catch {
      // Windows ACLs do not map cleanly to POSIX mode bits
    }
    return;
  }
  chmodSyncFn(targetPath, mode);
}

/**
 * Quotes a shell argument safely for copy-pasteable display in user guidance.
 */
export function quoteShellArgForDisplay(arg, platform = process.platform) {
  const s = String(arg ?? '');
  if (!s) return '""';
  if (platform === 'win32') {
    if (/^[A-Za-z0-9._:/\\=@,+-]+$/.test(s)) return s;
    return `"${s.replace(/"/g, '\\"')}"`;
  }
  if (/^[A-Za-z0-9._:/=@,+-]+$/.test(s)) return s;
  if (!/[$`"\\!]/.test(s) && !s.includes("'")) {
    return `"${s}"`;
  }
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * Only macOS top-level compatibility symlinks (`/var`, `/tmp`, `/etc`) are exempted
 * during ancestor symlink walks.
 */
export function isPlatformSystemRootSymlink(p, platform = process.platform) {
  return platform === 'darwin' && /^\/(?:var|tmp|etc)$/.test(String(p ?? ''));
}

/**
 * Walks `targetPath` and all existing ancestors up to `stopAt` (or filesystem root),
 * throwing a security error if any segment is a symbolic link (except macOS `/var`, `/tmp`, `/etc`).
 */
export function assertNoSymlinkAncestors(
  targetPath,
  {
    stopAt = null,
    platform = process.platform,
    lstatSyncFn = fs.lstatSync,
  } = {}
) {
  const resolved = path.resolve(String(targetPath));
  const resolvedStop =
    stopAt && isPathWithinBase(resolved, path.resolve(String(stopAt)), platform)
      ? path.resolve(String(stopAt))
      : null;

  let cur = resolved;
  const root = path.parse(cur).root;

  while (true) {
    if (resolvedStop && normalizePathForCompare(cur, platform) === normalizePathForCompare(resolvedStop, platform)) {
      return;
    }
    let st = null;
    try {
      st = lstatSyncFn(cur);
    } catch (err) {
      if (err?.code !== 'ENOENT' && err?.code !== 'ENOTDIR') {
        throw err;
      }
    }
    if (st && st.isSymbolicLink() && !isPlatformSystemRootSymlink(cur, platform)) {
      throw new Error(`Security violation: refusing symlink path ${cur}`);
    }
    if (cur === root) return;
    const parent = path.dirname(cur);
    if (parent === cur) return;
    cur = parent;
  }
}

let atomicCopyCounter = 0;

/**
 * Safely copies `srcPath` to `destPath` inside an already-verified `realDestRoot` using an
 * exclusive same-directory temp file (`wx`) followed by atomic rename.
 * Refuses destination symlinks/hardlinks (nlink > 1) and verifies parent realpath containment
 * immediately before temp creation and rename to narrow TOCTOU windows and avoid overwriting
 * hardlinked inodes outside the destination tree.
 */
export function copyFileSafeAtomic(srcPath, destPath, realDestRoot, { platform = process.platform } = {}) {
  const destDir = path.dirname(destPath);
  const realParent = fs.realpathSync(destDir);
  if (!isPathWithinBase(realParent, realDestRoot, platform)) {
    throw new Error(`Security violation: destination parent escapes root (${destPath})`);
  }
  let existing = null;
  try {
    existing = fs.lstatSync(destPath);
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
  }
  if (existing) {
    if (existing.isSymbolicLink()) {
      throw new Error(`Security violation: refusing symlink target (${destPath})`);
    }
    if (existing.isDirectory()) {
      throw new Error(`Security violation: refusing to overwrite directory (${destPath})`);
    }
  }

  atomicCopyCounter += 1;
  const tmpName = `.sag-tmp.${process.pid}.${Date.now()}.${atomicCopyCounter}.${Math.random().toString(16).slice(2)}`;
  const tmpPath = path.join(realParent, tmpName);
  const srcBuf = fs.readFileSync(srcPath);
  let createdTmp = false;
  try {
    fs.writeFileSync(tmpPath, srcBuf, { flag: 'wx' });
    createdTmp = true;
    const recheckParent = fs.realpathSync(destDir);
    if (!isPathWithinBase(recheckParent, realDestRoot, platform)) {
      throw new Error(`Security violation: destination parent moved outside root (${destPath})`);
    }
    try {
      const postTarget = fs.lstatSync(destPath);
      if (postTarget.isSymbolicLink()) {
        throw new Error(`Security violation: refusing symlink target (${destPath})`);
      }
    } catch (err) {
      if (err?.code !== 'ENOENT') throw err;
    }
    atomicRenameWithRetry(tmpPath, destPath, { platform });
  } catch (err) {
    if (createdTmp) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {}
    }
    throw err;
  }
}
