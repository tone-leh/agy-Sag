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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

export const PLUGIN_ROOT_FILES = ['plugin.json', 'package.json', 'README.md', 'README.zh-CN.md', 'AGENTS.md', 'LICENSE'];
export const PLUGIN_SUBDIRS = ['assets', 'packages/core', 'cli', 'sidecars/daemon'];

export function parseInstallArgs(argv) {
  const opts = {
    targetDir: path.join(os.homedir(), '.gemini', 'config', 'plugins', 'agy-sag'),
    dryRun: false,
  };
  for (const a of argv || []) {
    if (a === '--dry-run') opts.dryRun = true;
    else if (a.startsWith('--dir=')) {
      const p = a.slice('--dir='.length).trim();
      if (!p) throw new Error(`Invalid --dir value: ${a}`);
      opts.targetDir = path.resolve(p);
    }
  }
  return opts;
}

export function installLocalPlugin({ repoRoot = REPO_ROOT, targetDir, dryRun = false } = {}) {
  if (!targetDir) throw new Error('targetDir is required');
  const planned = [];

  for (const rel of PLUGIN_ROOT_FILES) {
    const src = path.join(repoRoot, rel);
    if (fs.existsSync(src) && fs.statSync(src).isFile()) {
      planned.push({ rel, src, dst: path.join(targetDir, rel) });
    }
  }

  const walk = (sub) => {
    const sDir = path.join(repoRoot, sub);
    if (!fs.existsSync(sDir)) return;
    for (const ent of fs.readdirSync(sDir, { withFileTypes: true })) {
      if (ent.name === '.DS_Store' || ent.name === '__pycache__' || ent.isSymbolicLink()) continue;
      const rel = path.join(sub, ent.name);
      const src = path.join(repoRoot, rel);
      if (ent.isDirectory()) walk(rel);
      else if (ent.isFile()) planned.push({ rel, src, dst: path.join(targetDir, rel) });
    }
  };
  for (const sub of PLUGIN_SUBDIRS) walk(sub);

  if (!dryRun) {
    fs.mkdirSync(targetDir, { recursive: true });
    for (const item of planned) {
      fs.mkdirSync(path.dirname(item.dst), { recursive: true });
      fs.copyFileSync(item.src, item.dst);
    }
  }

  return {
    ok: true,
    dryRun,
    targetDir,
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

const isEntry = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isEntry) {
  try {
    runInstallPluginCli(process.argv.slice(2));
  } catch (err) {
    console.error('[agy-Sag:install]', err?.message || err);
    process.exitCode = 1;
  }
}
