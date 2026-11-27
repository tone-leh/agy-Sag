#!/usr/bin/env node
/**
 * agy-Sag — Native Antigravity Plugin Installer (Zero runtime deps)
 *
 * Installs the runtime plugin bundle (plugin.json + sidecars/daemon + packages/core + cli + assets)
 * into ~/.gemini/config/plugins/agy-sag/ so Antigravity manages the Zero-ASAR watch sidecar
 * alongside Obsidian Prism & agy-NOV with zero app.asar modification.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertNoSymlinkAncestors,
  copyFileSafeAtomic,
  expandTildePath,
  isCliEntry,
  isPathWithinBase,
} from './platform-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

export const PLUGIN_ROOT_FILES = ['plugin.json', 'package.json', 'README.md', 'README.zh-CN.md', 'AGENTS.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md'];
export const PLUGIN_SUBDIRS = ['assets', 'packages/core', 'cli', 'sidecars/daemon'];

export function parseInstallArgs(argv, homeDir = os.homedir()) {
  const opts = {
    targetDir: path.join(homeDir, '.gemini', 'config', 'plugins', 'agy-sag'),
    dryRun: false,
  };
  for (const a of argv || []) {
    if (a === '--dry-run') opts.dryRun = true;
    else if (a.startsWith('--dir=')) {
      const p = a.slice('--dir='.length).trim();
      if (!p) throw new Error(`Invalid --dir value: ${a}`);
      opts.targetDir = path.resolve(expandTildePath(p, homeDir));
    }
  }
  return opts;
}

function assertNotSymlinkIfExists(targetPath) {
  let st = null;
  try {
    st = fs.lstatSync(targetPath);
  } catch (err) {
    if (err?.code !== 'ENOENT' && err?.code !== 'ENOTDIR') throw err;
  }
  if (st && st.isSymbolicLink()) {
    throw new Error(`Security violation: refusing symlink target ${targetPath}`);
  }
  return st;
}

function assertSafeInstallDestination(rootDir, realRootDir, destFilePath) {
  const resolvedDest = path.resolve(destFilePath);
  if (!isPathWithinBase(resolvedDest, rootDir)) {
    throw new Error(`Security violation: destination escapes targetDir (${resolvedDest})`);
  }
  // Check every intermediate directory segment from rootDir down to parent dir
  const relParent = path.relative(rootDir, path.dirname(resolvedDest));
  let cur = rootDir;
  if (relParent && relParent !== '.') {
    for (const seg of relParent.split(path.sep)) {
      if (!seg || seg === '.') continue;
      cur = path.join(cur, seg);
      const st = assertNotSymlinkIfExists(cur);
      if (st && !st.isDirectory()) {
        throw new Error(`Security violation: expected directory at ${cur}`);
      }
    }
  }
  const existingFileStat = assertNotSymlinkIfExists(resolvedDest);
  if (existingFileStat && existingFileStat.isDirectory()) {
    throw new Error(`Security violation: refusing to overwrite directory with file at ${resolvedDest}`);
  }

  fs.mkdirSync(path.dirname(resolvedDest), { recursive: true });
  const realParent = fs.realpathSync(path.dirname(resolvedDest));
  if (!isPathWithinBase(realParent, realRootDir)) {
    throw new Error(`Security violation: destination directory escapes targetDir (${resolvedDest})`);
  }
  assertNotSymlinkIfExists(resolvedDest);
}

export function installLocalPlugin({ repoRoot = REPO_ROOT, targetDir, dryRun = false } = {}) {
  if (!targetDir) throw new Error('targetDir is required');
  const resolvedRepoRoot = path.resolve(expandTildePath(String(repoRoot)));
  const resolvedTargetDir = path.resolve(expandTildePath(String(targetDir)));

  assertNoSymlinkAncestors(resolvedRepoRoot);
  assertNoSymlinkAncestors(resolvedTargetDir);

  const planned = [];

  for (const rel of PLUGIN_ROOT_FILES) {
    const src = path.join(resolvedRepoRoot, rel);
    const srcStat = assertNotSymlinkIfExists(src);
    if (srcStat && srcStat.isFile()) {
      planned.push({ rel, src, dst: path.join(resolvedTargetDir, rel) });
    }
  }

  const walk = (sub) => {
    const sDir = path.join(resolvedRepoRoot, sub);
    const dirStat = assertNotSymlinkIfExists(sDir);
    if (!dirStat || !dirStat.isDirectory()) return;
    for (const ent of fs.readdirSync(sDir, { withFileTypes: true })) {
      if (ent.name === '.DS_Store' || ent.name === '__pycache__' || ent.isSymbolicLink()) continue;
      const rel = path.join(sub, ent.name);
      const src = path.join(resolvedRepoRoot, rel);
      const st = assertNotSymlinkIfExists(src);
      if (!st) continue;
      if (st.isDirectory()) walk(rel);
      else if (st.isFile()) planned.push({ rel, src, dst: path.join(resolvedTargetDir, rel) });
    }
  };
  for (const sub of PLUGIN_SUBDIRS) walk(sub);

  if (!dryRun) {
    const preTargetStat = assertNotSymlinkIfExists(resolvedTargetDir);
    if (preTargetStat && !preTargetStat.isDirectory()) {
      throw new Error(`Security violation: targetDir exists and is not a directory (${resolvedTargetDir})`);
    }
    fs.mkdirSync(resolvedTargetDir, { recursive: true });
    assertNoSymlinkAncestors(resolvedTargetDir);
    const realTargetDir = fs.realpathSync(resolvedTargetDir);
    for (const item of planned) {
      assertSafeInstallDestination(resolvedTargetDir, realTargetDir, item.dst);
      copyFileSafeAtomic(item.src, item.dst, realTargetDir);
    }
  }

  return {
    ok: true,
    dryRun,
    targetDir: resolvedTargetDir,
    filesCopied: planned.length,
    files: planned.map((p) => p.rel),
  };
}

export function runInstallPluginCli(argv = process.argv.slice(2)) {
  const opts = parseInstallArgs(argv);
  const res = installLocalPlugin(opts);
  console.log(
    `[agy-Sag:install] ${res.dryRun ? 'Dry-run' : 'Installed'} ${res.filesCopied} files -> ${res.targetDir}`
  );
  return res;
}

const isEntry = isCliEntry(import.meta.url);
if (isEntry) {
  try {
    runInstallPluginCli(process.argv.slice(2));
  } catch (err) {
    console.error('[agy-Sag:install]', err?.message || err);
    process.exitCode = 1;
  }
}
