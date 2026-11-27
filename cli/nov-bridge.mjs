/**
 * agy-Sag × agy-NOV Dual-Star Zero-Port Bridge Core (Zero runtime npm deps, ESM)
 *
 * Provides read-only discovery, strict-whitelist atomic config mutation, and
 * CDP Runtime.addBinding message dispatch for controlling agy-NOV's 13 native
 * modules & 5 presets directly from agy-Sag without opening any extra HTTP port.
 *
 * Security invariants:
 *   1. readNovState() and resolveNovPaths() are 100% read-only (zero mkdir, zero disk writes).
 *   2. Rejects symlink escapes on plugin directory, manifests, dataDir, and config.json.
 *   3. Atomic config writes use 0700 directory, 0600 same-dir temp file, and fs.renameSync.
 *   4. Only whitelisted actions, module IDs, presets, locales, and fields are accepted.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  atomicRenameWithRetry,
  canonicalRealpathSync,
  isPathWithinBase,
  isPlatformSystemRootSymlink,
  normalizePathForCompare,
  safeChmodSync,
} from './platform-utils.mjs';

export const NOV_MODULE_IDS = Object.freeze([
  'review',
  'guard',
  'xray',
  'turbo',
  'radar',
  'verify',
  'worktree',
  'spec',
  'studio',
  'canvas',
  'mem',
  'ops',
  'remote',
]);

export const NOV_MODULE_CATEGORY_IDS = Object.freeze([
  'core-dev',
  'safety',
  'observability',
  'workspace',
  'connectivity',
]);

export const NOV_MODULE_CATEGORIES = Object.freeze({
  'core-dev': Object.freeze({
    id: 'core-dev',
    label: 'Code & Speed',
    description: 'PR-grade diff review, worktrees, and token-saving batch codebase tools.',
  }),
  safety: Object.freeze({
    id: 'safety',
    label: 'Safety Shield',
    description: 'Pre-tool secret leak firewall, command guard, zero-Git snapshots, and stop verify gate.',
  }),
  observability: Object.freeze({
    id: 'observability',
    label: 'Context & Radar',
    description: 'Token/cache X-Ray, cross-session search, and multi-session completion radar.',
  }),
  workspace: Object.freeze({
    id: 'workspace',
    label: 'Spec, Studio & Workspace',
    description: 'Spec flow DAG, local data/doc studio, visual canvas, memory graph, and prompt ops.',
  }),
  connectivity: Object.freeze({
    id: 'connectivity',
    label: 'Opt-In Remote',
    description: 'Strictly OFF by default: local mobile PWA and IM webhook alerts / approvals.',
  }),
});

export const NOV_BASE_TOOLS_COUNT = 2; // nov_open + nov_status

export const NOV_MODULES_CATALOG = Object.freeze({
  review: Object.freeze({
    id: 'review',
    category: 'core-dev',
    tier: 'offline',
    toolsCount: 2,
    defaultEnabled: true,
    name: 'Diff Review',
    shortLabel: 'Review',
    hasUiTab: true,
  }),
  guard: Object.freeze({
    id: 'guard',
    category: 'safety',
    tier: 'offline',
    toolsCount: 4,
    defaultEnabled: true,
    name: 'Guard & Snapshots',
    shortLabel: 'Guard',
    hasUiTab: true,
  }),
  xray: Object.freeze({
    id: 'xray',
    category: 'observability',
    tier: 'offline',
    toolsCount: 4,
    defaultEnabled: true,
    name: 'Context X-Ray',
    shortLabel: 'X-Ray',
    hasUiTab: true,
  }),
  turbo: Object.freeze({
    id: 'turbo',
    category: 'core-dev',
    tier: 'offline',
    toolsCount: 3,
    defaultEnabled: false,
    name: 'Turbo & Output Guard',
    shortLabel: 'Turbo',
    hasUiTab: true,
  }),
  radar: Object.freeze({
    id: 'radar',
    category: 'observability',
    tier: 'offline',
    toolsCount: 2,
    defaultEnabled: false,
    name: 'Session Radar & Chime',
    shortLabel: 'Radar',
    hasUiTab: true,
  }),
  verify: Object.freeze({
    id: 'verify',
    category: 'safety',
    tier: 'offline',
    toolsCount: 4,
    defaultEnabled: false,
    name: 'Verify Gate',
    shortLabel: 'Verify',
    hasUiTab: true,
  }),
  worktree: Object.freeze({
    id: 'worktree',
    category: 'core-dev',
    tier: 'offline',
    toolsCount: 4,
    defaultEnabled: false,
    name: 'Worktree Orchestrator',
    shortLabel: 'Worktree',
    hasUiTab: true,
  }),
  spec: Object.freeze({
    id: 'spec',
    category: 'workspace',
    tier: 'offline',
    toolsCount: 4,
    defaultEnabled: false,
    name: 'Spec Flow & Task DAG',
    shortLabel: 'Spec',
    hasUiTab: true,
  }),
  studio: Object.freeze({
    id: 'studio',
    category: 'workspace',
    tier: 'offline',
    toolsCount: 4,
    defaultEnabled: false,
    name: 'Workspace Studio',
    shortLabel: 'Studio',
    hasUiTab: true,
  }),
  canvas: Object.freeze({
    id: 'canvas',
    category: 'workspace',
    tier: 'offline',
    toolsCount: 4,
    defaultEnabled: false,
    name: 'Visual Canvas',
    shortLabel: 'Canvas',
    hasUiTab: true,
  }),
  mem: Object.freeze({
    id: 'mem',
    category: 'workspace',
    tier: 'offline',
    toolsCount: 3,
    defaultEnabled: false,
    name: 'Memory Graph',
    shortLabel: 'Memory',
    hasUiTab: true,
  }),
  ops: Object.freeze({
    id: 'ops',
    category: 'workspace',
    tier: 'offline',
    toolsCount: 3,
    defaultEnabled: false,
    name: 'Prompt Vault & Budget Doctor',
    shortLabel: 'Ops',
    hasUiTab: true,
  }),
  remote: Object.freeze({
    id: 'remote',
    category: 'connectivity',
    tier: 'network',
    toolsCount: 4,
    defaultEnabled: false,
    name: 'Mobile & IM Remote',
    shortLabel: 'Remote',
    hasUiTab: true,
  }),
});

function buildModulesMap(enabledList) {
  const enabledSet = new Set(enabledList);
  const out = {};
  for (const id of NOV_MODULE_IDS) {
    out[id] = enabledSet.has(id);
  }
  return Object.freeze(out);
}

export function countNovEnabledTools(modules = {}) {
  let count = NOV_BASE_TOOLS_COUNT;
  for (const id of NOV_MODULE_IDS) {
    if (modules[id]) {
      count += NOV_MODULES_CATALOG[id].toolsCount;
    }
  }
  return count;
}

function makePresetSpec(id, label, enabledModules) {
  const modules = buildModulesMap(enabledModules);
  return Object.freeze({
    id,
    label,
    enabledModules: Object.freeze([...enabledModules]),
    modules,
    toolsCount: countNovEnabledTools(modules),
  });
}

export const NOV_PRESETS = Object.freeze({
  minimal: makePresetSpec('minimal', 'Minimal Shield', ['guard']),
  core: makePresetSpec('core', 'Core (Default)', ['review', 'guard', 'xray']),
  power: makePresetSpec('power', 'Power Dev (9 Offline)', [
    'review',
    'guard',
    'xray',
    'turbo',
    'radar',
    'verify',
    'worktree',
    'spec',
    'ops',
  ]),
  'local-all': makePresetSpec('local-all', 'Local All (12 Offline)', [
    'review',
    'guard',
    'xray',
    'turbo',
    'radar',
    'verify',
    'worktree',
    'spec',
    'studio',
    'canvas',
    'mem',
    'ops',
  ]),
  full: makePresetSpec('full', 'Full Suite (All 13)', [...NOV_MODULE_IDS]),
});

export const NOV_PRESET_IDS = Object.freeze(Object.keys(NOV_PRESETS));

export const ALLOWED_NOV_LOCALES = Object.freeze([
  'auto',
  'en',
  'zh-CN',
  'zh-TW',
  'ja',
  'ko',
  'es',
  'fr',
  'de',
]);

const ALLOWED_COMMAND_ACTIONS = new Set(['get_state', 'set_module', 'apply_preset', 'set_locale']);
const ALLOWED_ACTION_KEYS = Object.freeze({
  get_state: new Set(['action']),
  set_module: new Set(['action', 'moduleId', 'enabled']),
  apply_preset: new Set(['action', 'preset']),
  set_locale: new Set(['action', 'locale']),
});

const BRIDGE_TYPE_TO_ACTION = Object.freeze(
  Object.assign(Object.create(null), {
    'nov:get_state': 'get_state',
    'nov:set_module': 'set_module',
    'nov:apply_preset': 'apply_preset',
    'nov:set_locale': 'set_locale',
  })
);

const MUTATING_BRIDGE_ACTIONS = new Set(['set_module', 'apply_preset', 'set_locale']);

export const MAX_BRIDGE_PAYLOAD_BYTES = 64 * 1024;
let tmpFileCounter = 0;

function isPlainObject(val) {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
  const proto = Object.getPrototypeOf(val);
  return proto === Object.prototype || proto === null;
}

function hasUnexpandedPlaceholder(str) {
  return /\$\{?[A-Za-z_][A-Za-z0-9_]*\}?/.test(str);
}

export function sanitizePathCandidate(candidate) {
  if (typeof candidate !== 'string') return null;
  if (candidate.includes('\0')) return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  if (hasUnexpandedPlaceholder(trimmed)) return null;
  return path.resolve(trimmed);
}

function safeLstat(targetPath) {
  try {
    return fs.lstatSync(targetPath);
  } catch {
    return null;
  }
}

function safeRealpath(targetPath) {
  try {
    return canonicalRealpathSync(targetPath);
  } catch {
    return null;
  }
}

/**
 * Walks targetPath and all its ancestors up to root (or baseDir if inside baseDir),
 * ensuring no existing path segment is a symbolic link (skipping only macOS /var, /tmp, /etc).
 */
function findSymlinkViolation(targetPath, homeDir = null) {
  const resolved = path.resolve(targetPath);
  const resolvedHome = homeDir ? path.resolve(homeDir) : null;
  const stopAt =
    resolvedHome && isPathWithinBase(resolved, resolvedHome)
      ? resolvedHome
      : null;

  let cur = resolved;
  const root = path.parse(cur).root;
  while (true) {
    if (stopAt && normalizePathForCompare(cur) === normalizePathForCompare(stopAt)) return null;
    const st = safeLstat(cur);
    if (st && st.isSymbolicLink() && !isPlatformSystemRootSymlink(cur)) {
      return `Symbolic link is not allowed at: ${cur}`;
    }
    if (cur === root) return null;
    const parent = path.dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

function inspectPluginDirSafe(dir, homeDir, requiredParentDir = null) {
  if (!dir) return null;
  if (findSymlinkViolation(dir, homeDir)) return null;

  const dirStat = safeLstat(dir);
  if (!dirStat || dirStat.isSymbolicLink() || !dirStat.isDirectory()) return null;

  const realDir = safeRealpath(dir);
  if (!realDir) return null;

  if (requiredParentDir) {
    const realParent = safeRealpath(requiredParentDir);
    if (!realParent || !isPathWithinBase(realDir, realParent)) return null;
  }

  let version = null;
  let hasManifest = false;
  for (const filename of ['plugin.json', 'package.json']) {
    const manifestPath = path.join(dir, filename);
    const fileStat = safeLstat(manifestPath);
    if (!fileStat || fileStat.isSymbolicLink() || !fileStat.isFile()) continue;

    const realManifest = safeRealpath(manifestPath);
    if (!realManifest || !isPathWithinBase(realManifest, realDir)) continue;

    hasManifest = true;
    try {
      const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (parsed && typeof parsed.version === 'string' && parsed.version.trim()) {
        version = parsed.version.trim();
        break;
      }
    } catch {
      // Ignore malformed manifest version; still counts as present if valid file
    }
  }

  if (!hasManifest) return null;
  return {
    installed: true,
    version,
    pluginDir: dir,
  };
}

function statRealConfigFile(dataDir, homeDir) {
  if (findSymlinkViolation(dataDir, homeDir)) return null;
  const dirStat = safeLstat(dataDir);
  if (!dirStat || dirStat.isSymbolicLink() || !dirStat.isDirectory()) return null;

  const cfgPath = path.join(dataDir, 'config.json');
  const fileStat = safeLstat(cfgPath);
  if (!fileStat || fileStat.isSymbolicLink() || !fileStat.isFile()) return null;

  const realDir = safeRealpath(dataDir);
  const realCfg = safeRealpath(cfgPath);
  if (!realDir || !realCfg || !isPathWithinBase(realCfg, realDir)) return null;

  return { stat: fileStat, configPath: cfgPath, realCfg };
}

export function detectNovPreset(modules = {}) {
  for (const presetId of NOV_PRESET_IDS) {
    const target = NOV_PRESETS[presetId].modules;
    if (NOV_MODULE_IDS.every((id) => Boolean(modules[id]) === Boolean(target[id]))) {
      return presetId;
    }
  }
  return 'custom';
}

export function createDefaultNovConfig() {
  return {
    schemaVersion: 1,
    preset: 'core',
    modules: { ...NOV_PRESETS.core.modules },
    defaultTab: 'review',
    locale: 'auto',
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeNovConfig(raw) {
  const base = createDefaultNovConfig();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;

  const rawModules =
    raw.modules && typeof raw.modules === 'object' && !Array.isArray(raw.modules) ? raw.modules : {};
  const modules = { ...base.modules };
  for (const id of NOV_MODULE_IDS) {
    if (typeof rawModules[id] === 'boolean') {
      modules[id] = rawModules[id];
    }
  }

  const enabledTabs = NOV_MODULE_IDS.filter((id) => modules[id] && NOV_MODULES_CATALOG[id].hasUiTab);
  const defaultTab =
    typeof raw.defaultTab === 'string' &&
    NOV_MODULE_IDS.includes(raw.defaultTab) &&
    modules[raw.defaultTab] &&
    NOV_MODULES_CATALOG[raw.defaultTab].hasUiTab
      ? raw.defaultTab
      : enabledTabs[0] || 'review';

  const locale = ALLOWED_NOV_LOCALES.includes(raw.locale) ? raw.locale : 'auto';
  const updatedAt = typeof raw.updatedAt === 'string' && raw.updatedAt.trim() ? raw.updatedAt : base.updatedAt;
  const startupView = raw.startupView === 'hub' || raw.startupView === 'last' ? raw.startupView : undefined;

  return {
    schemaVersion: 1,
    preset: detectNovPreset(modules),
    modules,
    defaultTab,
    locale,
    ...(startupView ? { startupView } : {}),
    updatedAt,
  };
}

/**
 * Resolves agy-NOV plugin installation path and config.json data directory strictly read-only.
 */
export function resolveNovPaths({ homeDir = os.homedir(), env = process.env, explicitDataDir = null } = {}) {
  const resolvedHome = path.resolve(homeDir);
  const pluginsRoot = path.join(resolvedHome, '.gemini', 'config', 'plugins');

  // 1. Detect installed agy-NOV plugin directory (blocking symlink escapes)
  const pluginCandidates = [];
  const envNovDir = sanitizePathCandidate(env?.AGY_NOV_DIR);
  if (envNovDir) {
    pluginCandidates.push({ dir: envNovDir, requiredParentDir: null });
  }
  pluginCandidates.push({ dir: path.join(pluginsRoot, 'agy-nov'), requiredParentDir: pluginsRoot });
  pluginCandidates.push({ dir: path.join(pluginsRoot, 'agy-NOV'), requiredParentDir: pluginsRoot });

  let pluginInfo = null;
  for (const item of pluginCandidates) {
    const res = inspectPluginDirSafe(item.dir, resolvedHome, item.requiredParentDir);
    if (res) {
      pluginInfo = res;
      break;
    }
  }

  const installed = Boolean(pluginInfo?.installed);
  const version = pluginInfo?.version ?? null;
  const pluginDir = pluginInfo?.pluginDir ?? null;

  // 2. Resolve config.json dataDir with priority:
  //    (1) explicitDataDir -> (2) env.AGY_NOV_DATA_DIR -> (3) candidate probing
  let dataDir = null;
  let source = 'fallback';

  const cleanExplicit = sanitizePathCandidate(explicitDataDir);
  const cleanEnvDataDir = sanitizePathCandidate(env?.AGY_NOV_DATA_DIR);

  if (cleanExplicit) {
    dataDir = cleanExplicit;
    source = 'explicit';
  } else if (cleanEnvDataDir) {
    dataDir = cleanEnvDataDir;
    source = 'env';
  } else {
    const pluginDataRoot = path.join(resolvedHome, '.gemini', 'antigravity', 'plugin_data');
    const dataCandidates = [
      path.join(pluginDataRoot, 'agy-nov'),
      path.join(pluginDataRoot, 'agy-NOV'),
      path.join(resolvedHome, '.agy-nov-data'),
    ];

    let newest = null;
    const seenReal = new Set();
    for (const cand of dataCandidates) {
      const probed = statRealConfigFile(cand, resolvedHome);
      if (!probed) continue;
      if (seenReal.has(probed.realCfg)) continue;
      seenReal.add(probed.realCfg);
      if (!newest || probed.stat.mtimeMs > newest.mtimeMs) {
        newest = { dir: cand, mtimeMs: probed.stat.mtimeMs };
      }
    }

    if (newest) {
      dataDir = newest.dir;
      source = 'existing-config';
    } else {
      const pluginDirLower = path.join(pluginsRoot, 'agy-nov');
      const pluginDirUpper = path.join(pluginsRoot, 'agy-NOV');
      const hasPluginInstall =
        installed ||
        Boolean(safeLstat(pluginDirLower)?.isDirectory()) ||
        Boolean(safeLstat(pluginDirUpper)?.isDirectory());
      const hasPluginDataRoot =
        !findSymlinkViolation(pluginDataRoot, resolvedHome) &&
        Boolean(safeLstat(pluginDataRoot)?.isDirectory());

      if (hasPluginInstall || hasPluginDataRoot) {
        dataDir = path.join(pluginDataRoot, 'agy-nov');
        source = 'plugin-data-default';
      } else {
        dataDir = path.join(resolvedHome, '.agy-nov-data');
        source = 'fallback';
      }
    }
  }

  return {
    installed,
    version,
    pluginDir,
    dataDir,
    configPath: path.join(dataDir, 'config.json'),
    source,
  };
}

/**
 * Reads agy-NOV installation and config state strictly read-only (never creates directories or files).
 */
export function readNovState(opts = {}) {
  const homeDir = opts.homeDir || os.homedir();
  const paths = resolveNovPaths(opts);
  const probed = statRealConfigFile(paths.dataDir, homeDir);

  let configExists = false;
  let signature = null;
  let config = createDefaultNovConfig();

  if (probed) {
    configExists = true;
    signature = `${probed.stat.ino}:${probed.stat.mtimeMs}:${probed.stat.size}`;
    try {
      const raw = JSON.parse(fs.readFileSync(probed.configPath, 'utf8'));
      config = normalizeNovConfig(raw);
    } catch {
      config = createDefaultNovConfig();
    }
  }

  return {
    installed: paths.installed,
    version: paths.version,
    pluginDir: paths.pluginDir,
    dataDir: paths.dataDir,
    configPath: path.join(paths.dataDir, 'config.json'),
    configExists,
    signature,
    config,
    enabledModules: NOV_MODULE_IDS.filter((id) => Boolean(config.modules[id])),
    enabledToolsCount: countNovEnabledTools(config.modules),
    catalog: NOV_MODULES_CATALOG,
    categories: NOV_MODULE_CATEGORIES,
    presets: NOV_PRESETS,
  };
}

const NOV_TEMPLATES_MAX_BYTES = 262144; // 256 KB strict cap
const NOV_TEMPLATES_MAX_COUNT = 100;
const NOV_FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Strictly read-only loader for agy-NOV's ops/prompts.json templates.
 * Never creates or writes files; enforces symlink guard, 256 KB cap, and field whitelisting.
 */
export function readNovOpsTemplates(opts = {}) {
  const homeDir = opts.homeDir || os.homedir();
  const paths = resolveNovPaths(opts);
  // Prefer agy-NOV v0.7+ layout (dataDir/modules/ops/prompts.json), fallback to legacy (dataDir/ops/prompts.json)
  const modOpsDir = path.join(paths.dataDir, 'modules', 'ops');
  const modPromptsPath = path.join(modOpsDir, 'prompts.json');
  const legacyOpsDir = path.join(paths.dataDir, 'ops');
  const useModulesLayout = Boolean(safeLstat(modPromptsPath) || safeLstat(modOpsDir));
  const opsDir = useModulesLayout ? modOpsDir : legacyOpsDir;
  const promptsPath = path.join(opsDir, 'prompts.json');

  const dirViolation = findSymlinkViolation(opsDir, homeDir);
  if (dirViolation) {
    return { ok: false, available: false, templates: [], error: dirViolation };
  }

  const opsStat = safeLstat(opsDir);
  if (!opsStat) {
    return { ok: true, available: false, templates: [] };
  }
  if (opsStat.isSymbolicLink() || !opsStat.isDirectory()) {
    return { ok: false, available: false, templates: [], error: 'Refusing to read non-directory or symlink ops dir' };
  }

  const fileStat = safeLstat(promptsPath);
  if (!fileStat) {
    return { ok: true, available: false, templates: [] };
  }
  if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
    return { ok: false, available: false, templates: [], error: 'Refusing to read symlink or non-regular prompts.json' };
  }
  if (fileStat.size > NOV_TEMPLATES_MAX_BYTES) {
    return { ok: false, available: false, templates: [], error: `prompts.json exceeds ${NOV_TEMPLATES_MAX_BYTES} bytes limit` };
  }

  const realOps = safeRealpath(opsDir);
  const realPrompts = safeRealpath(promptsPath);
  if (!realOps || !realPrompts || !isPathWithinBase(realPrompts, realOps)) {
    return { ok: false, available: false, templates: [], error: 'Refusing to read prompts.json outside real ops directory' };
  }

  try {
    const rawText = fs.readFileSync(realPrompts, 'utf8');
    const parsed = JSON.parse(rawText);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).some((k) => NOV_FORBIDDEN_KEYS.has(k))) {
      return { ok: false, available: false, templates: [], error: 'Prototype pollution key rejected in prompts.json' };
    }
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray(parsed.prompts)
        ? parsed.prompts
        : [];
    const templates = [];
    const seen = new Set();
    for (const item of list) {
      if (templates.length >= NOV_TEMPLATES_MAX_COUNT) break;
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      if (Object.keys(item).some((k) => NOV_FORBIDDEN_KEYS.has(k))) continue;
      const id = typeof item.id === 'string' ? item.id.trim().slice(0, 64) : '';
      const title = typeof item.title === 'string' ? item.title.trim().slice(0, 80) : '';
      const body = typeof item.body === 'string' ? item.body.trim().slice(0, 4000) : '';
      if (!title || !body) continue;
      const safeId = id && !NOV_FORBIDDEN_KEYS.has(id) ? id : `nov-${templates.length + 1}`;
      if (seen.has(safeId)) continue;
      seen.add(safeId);
      const description = typeof item.description === 'string' ? item.description.trim().slice(0, 200) : '';
      const tags = Array.isArray(item.tags)
        ? item.tags.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().slice(0, 24)).slice(0, 6)
        : [];
      templates.push({
        id: safeId,
        source: 'nov',
        title,
        description,
        tags,
        body,
      });
    }
    return { ok: true, available: true, templates };
  } catch {
    return { ok: false, available: false, templates: [], error: 'Failed to parse agy-NOV prompts.json' };
  }
}

function readSafeNovSubJson(dataDir, homeDir, subDir, fileName, maxBytes = NOV_TEMPLATES_MAX_BYTES) {
  const dirPath = path.join(dataDir, subDir);
  const filePath = path.join(dirPath, fileName);

  const dirViolation = findSymlinkViolation(dirPath, homeDir);
  if (dirViolation) return { ok: false, exists: false, data: null, error: dirViolation };

  const dirStat = safeLstat(dirPath);
  if (!dirStat) return { ok: true, exists: false, data: null };
  if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) {
    return { ok: false, exists: false, data: null, error: `Refusing to read symlink/non-directory ${subDir}` };
  }

  const fileStat = safeLstat(filePath);
  if (!fileStat) return { ok: true, exists: false, data: null };
  if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
    return { ok: false, exists: false, data: null, error: `Refusing to read symlink/non-regular ${subDir}/${fileName}` };
  }
  if (fileStat.size > maxBytes) {
    return { ok: false, exists: false, data: null, error: `${subDir}/${fileName} exceeds ${maxBytes} bytes limit` };
  }

  const realDir = safeRealpath(dirPath);
  const realFile = safeRealpath(filePath);
  if (!realDir || !realFile || !isPathWithinBase(realFile, realDir)) {
    return { ok: false, exists: false, data: null, error: `Refusing to read ${subDir}/${fileName} outside real dir` };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(realFile, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).some((k) => NOV_FORBIDDEN_KEYS.has(k))) {
      return { ok: false, exists: false, data: null, error: `Prototype key rejected in ${subDir}/${fileName}` };
    }
    return { ok: true, exists: true, data: parsed };
  } catch {
    return { ok: false, exists: false, data: null, error: `Failed to parse ${subDir}/${fileName}` };
  }
}

function toSafeNonNegInt(val) {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function redactNovFeedText(raw, maxLen = 120) {
  if (typeof raw !== 'string') return '';
  let s = raw;
  s = s.replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, '[REDACTED]');
  s = s.replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/g, '[REDACTED]');
  s = s.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [REDACTED]');
  s = s.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]');
  s = s.replace(
    /\b(?:sk-proj-|sk-ant-|sk_(?:live|test)_|sk-|gh[pousr]_|github_pat_|glpat-|AIza|AKIA|ASIA|xox[baprs]-|npm_)[A-Za-z0-9_-]{8,}\b/g,
    '[REDACTED]'
  );
  s = s.replace(/\b(api[_-]?key|secret|token|password|passwd|auth)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{8,}["']?/gi, '$1=[REDACTED]');
  return s.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function readSafeNovRootJson(dataDir, homeDir, fileName, maxBytes = 64 * 1024) {
  const dirViolation = findSymlinkViolation(dataDir, homeDir);
  if (dirViolation) return { ok: false, exists: false, data: null, error: dirViolation };
  const dirStat = safeLstat(dataDir);
  if (!dirStat) return { ok: true, exists: false, data: null };
  if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) {
    return { ok: false, exists: false, data: null, error: `Refusing to read symlink/non-directory dataDir` };
  }
  const filePath = path.join(dataDir, fileName);
  const fileStat = safeLstat(filePath);
  if (!fileStat) return { ok: true, exists: false, data: null };
  if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
    return { ok: false, exists: false, data: null, error: `Refusing to read symlink/non-regular ${fileName}` };
  }
  if (fileStat.size > maxBytes) {
    return { ok: false, exists: false, data: null, error: `${fileName} exceeds ${maxBytes} bytes limit` };
  }
  const realDir = safeRealpath(dataDir);
  const realFile = safeRealpath(filePath);
  if (!realDir || !realFile || !isPathWithinBase(realFile, realDir)) {
    return { ok: false, exists: false, data: null, error: `Refusing to read ${fileName} outside real dataDir` };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(realFile, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).some((k) => NOV_FORBIDDEN_KEYS.has(k))) {
      return { ok: false, exists: false, data: null, error: `Prototype key rejected in ${fileName}` };
    }
    return { ok: true, exists: true, data: parsed };
  } catch {
    return { ok: false, exists: false, data: null, error: `Failed to parse ${fileName}` };
  }
}

function readSafeNovModuleJson(dataDir, homeDir, subDir, fileName, maxBytes = NOV_TEMPLATES_MAX_BYTES) {
  // Prefer agy-NOV real layout dataDir/modules/<subDir>/<fileName>, fallback to legacy dataDir/<subDir>/<fileName>
  const modRes = readSafeNovSubJson(dataDir, homeDir, path.join('modules', subDir), fileName, maxBytes);
  if (!modRes.ok || modRes.exists) return modRes;
  return readSafeNovSubJson(dataDir, homeDir, subDir, fileName, maxBytes);
}

const NOV_FEED_FILES = Object.freeze([
  ['guard', 'audit.json'],
  ['guard', 'snapshots.json'],
  ['radar', 'status-capsule.json'],
  ['mem', 'memories.json'],
  ['spec', 'state.json'],
]);

function statOneFeedPath(baseDir, relParts) {
  let cur = baseDir;
  for (let i = 0; i < relParts.length - 1; i += 1) {
    cur = path.join(cur, relParts[i]);
    const st = safeLstat(cur);
    if (!st) return 'missing';
    if (st.isSymbolicLink() || !st.isDirectory()) return 'unsafe';
  }
  const fPath = path.join(cur, relParts[relParts.length - 1]);
  const fStat = safeLstat(fPath);
  if (!fStat) return 'missing';
  if (fStat.isSymbolicLink() || !fStat.isFile()) return 'unsafe';
  return `${fStat.ino || 0}:${Math.trunc(fStat.mtimeMs || 0)}:${fStat.size || 0}`;
}

/**
 * Strictly read-only stat signature across feed-snapshot.json and the 5 agy-NOV module feed files.
 * Never creates directories or follows symlinks.
 */
export function computeNovFeedSignature(opts = {}) {
  const homeDir = opts.homeDir || os.homedir();
  const paths = resolveNovPaths(opts);
  const dataDir = paths.dataDir;
  if (!dataDir || findSymlinkViolation(dataDir, homeDir)) return 'invalid-dir';
  const dirStat = safeLstat(dataDir);
  if (!dirStat) return ['missing', ...NOV_FEED_FILES.map(() => 'missing')].join('|');
  if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) return 'invalid-dir';

  const snapSig = statOneFeedPath(dataDir, ['feed-snapshot.json']);
  const parts = [snapSig];
  for (const [subDir, fileName] of NOV_FEED_FILES) {
    const modSig = statOneFeedPath(dataDir, ['modules', subDir, fileName]);
    parts.push(modSig !== 'missing' ? modSig : statOneFeedPath(dataDir, [subDir, fileName]));
  }
  return parts.join('|');
}

/**
 * Strictly read-only aggregator for agy-NOV live module feeds (guard, radar, mem, spec).
 * Prefers agy-NOV v0.7+ atomic feed-snapshot.json (<=64 KiB), falling back to modules/<id>/ and legacy paths.
 * Enforces symlink guards, size caps, realpath containment, and redacted summary output.
 */
export function readNovFeed(opts = {}) {
  const homeDir = opts.homeDir || os.homedir();
  const paths = resolveNovPaths(opts);

  // Fast path: unified agy-NOV v0.7+ dataDir/feed-snapshot.json (<= 64 KiB, already redacted)
  const snapFeedRes = readSafeNovRootJson(paths.dataDir, homeDir, 'feed-snapshot.json', 64 * 1024);
  if (!snapFeedRes.ok) {
    return {
      ok: false,
      available: false,
      errors: [snapFeedRes.error || 'Failed to read feed-snapshot.json'],
      feed: {
        guard: { blockedCount: 0, askCount: 0, forceAskCount: 0, permissionMode: null, snapshotCount: 0, latestSnapshotId: null, latestBlocked: null },
        radar: { awaitingCount: 0, runningCount: 0, headline: '' },
        mem: { totalCount: 0, driftedCount: 0 },
        spec: { writeLockActive: false, activeSpecId: null, activeSpecTitle: '' },
        verify: { enforceOnStop: false, lastStatus: null, dirtyFilesCount: 0 },
        alerts: [],
      },
    };
  }
  const ALLOWED_PERM_MODES = new Set(['readonly-audit', 'balanced-dev', 'strict-gate']);
  const ALLOWED_VERIFY_STATUS = new Set(['pass', 'fail', 'warn', 'skipped', 'running', 'idle']);
  if (snapFeedRes.exists && snapFeedRes.data && typeof snapFeedRes.data === 'object') {
    const snap = snapFeedRes.data;
    const g = snap.guard && typeof snap.guard === 'object' ? snap.guard : {};
    const r = snap.radar && typeof snap.radar === 'object' ? snap.radar : {};
    const m = snap.mem && typeof snap.mem === 'object' ? snap.mem : {};
    const sp = snap.spec && typeof snap.spec === 'object' ? snap.spec : {};
    const vf = snap.verify && typeof snap.verify === 'object' ? snap.verify : {};
    const lastEv = g.lastEvent && typeof g.lastEvent === 'object' ? g.lastEvent : null;
    const lastEvDecision = typeof lastEv?.decision === 'string' ? lastEv.decision.trim().toLowerCase().slice(0, 24) : '';
    const permMode = typeof g.permissionMode === 'string' && ALLOWED_PERM_MODES.has(g.permissionMode.trim()) ? g.permissionMode.trim() : null;
    const verifyStatus = typeof vf.lastStatus === 'string' && ALLOWED_VERIFY_STATUS.has(vf.lastStatus.trim().toLowerCase()) ? vf.lastStatus.trim().toLowerCase() : null;
    const forceAskCount = toSafeNonNegInt(
      g.forceAskCount ?? (lastEvDecision === 'force_ask' ? 1 : 0)
    );
    const rawAlerts = Array.isArray(snap.alerts) ? snap.alerts : [];
    const alerts = rawAlerts
      .slice(0, 4)
      .map((a) => {
        if (typeof a === 'string') return redactNovFeedText(a, 100);
        if (a && typeof a === 'object') return redactNovFeedText(a.message || a.title || a.summary || '', 100);
        return '';
      })
      .filter(Boolean);
    return {
      ok: true,
      available: true,
      errors: [],
      source: 'feed-snapshot',
      feed: {
        guard: {
          blockedCount: toSafeNonNegInt(g.blockedCount),
          askCount: toSafeNonNegInt(g.askCount),
          forceAskCount,
          permissionMode: permMode,
          snapshotCount: toSafeNonNegInt(g.snapshotCount),
          latestSnapshotId: typeof g.latestSnapshotId === 'string' ? redactNovFeedText(g.latestSnapshotId, 64) : null,
          latestBlocked: lastEv
            ? {
                ts: typeof lastEv.ts === 'string' ? lastEv.ts.slice(0, 40) : '',
                tool: redactNovFeedText(lastEv.tool, 48),
                decision: lastEvDecision || 'deny',
                reason: redactNovFeedText(lastEv.reason || lastEv.summary, 120),
              }
            : null,
        },
        radar: {
          awaitingCount: toSafeNonNegInt(r.awaitingCount),
          runningCount: toSafeNonNegInt(r.runningCount),
          headline: redactNovFeedText(r.headline || (r.awaitingCount > 0 ? `${r.awaitingCount} awaiting` : ''), 80),
        },
        mem: {
          totalCount: toSafeNonNegInt(m.totalMemories ?? m.totalCount),
          driftedCount: toSafeNonNegInt(m.staleCount ?? m.driftedCount),
        },
        spec: {
          writeLockActive: Boolean(sp.writeLockActive),
          activeSpecId: typeof sp.activeSpecId === 'string' ? redactNovFeedText(sp.activeSpecId, 64) : null,
          activeSpecTitle: redactNovFeedText(sp.title || sp.activeSpecTitle, 80),
        },
        verify: {
          enforceOnStop: Boolean(vf.enforceOnStop),
          lastStatus: verifyStatus,
          dirtyFilesCount: toSafeNonNegInt(vf.dirtyFilesCount),
        },
        alerts,
      },
    };
  }

  const errors = [];
  const auditRes = readSafeNovModuleJson(paths.dataDir, homeDir, 'guard', 'audit.json');
  const snapRes = readSafeNovModuleJson(paths.dataDir, homeDir, 'guard', 'snapshots.json');
  const radarRes = readSafeNovModuleJson(paths.dataDir, homeDir, 'radar', 'status-capsule.json');
  const memRes = readSafeNovModuleJson(paths.dataDir, homeDir, 'mem', 'memories.json');
  const specRes = readSafeNovModuleJson(paths.dataDir, homeDir, 'spec', 'state.json');

  for (const r of [auditRes, snapRes, radarRes, memRes, specRes]) {
    if (!r.ok && r.error) errors.push(r.error);
  }

  // 1) Guard summary (redacted: only decision/tool/reason prefix, zero raw secrets)
  const auditArr = Array.isArray(auditRes.data)
    ? auditRes.data
    : Array.isArray(auditRes.data?.events)
      ? auditRes.data.events
      : [];
  const blocked = auditArr.filter((e) => {
    const d = String(e?.decision || e?.action || e?.outcome || '').toLowerCase();
    return d === 'block' || d === 'blocked' || d === 'deny' || d === 'denied';
  });
  const asked = auditArr.filter((e) => {
    const d = String(e?.decision || e?.action || e?.outcome || '').toLowerCase();
    return d === 'ask' || d === 'force_ask';
  });
  const forceAsked = auditArr.filter((e) => {
    const d = String(e?.decision || e?.action || e?.outcome || '').toLowerCase();
    return d === 'force_ask';
  });
  const latestBlk = blocked.length ? blocked[blocked.length - 1] : forceAsked.length ? forceAsked[forceAsked.length - 1] : null;
  const snapArr = Array.isArray(snapRes.data)
    ? snapRes.data
    : Array.isArray(snapRes.data?.snapshots)
      ? snapRes.data.snapshots
      : [];
  const latestSnap = snapArr.length ? snapArr[snapArr.length - 1] : null;

  // 2) Radar capsule summary
  const rData = radarRes.data && typeof radarRes.data === 'object' ? radarRes.data : {};
  const awaitingCount = toSafeNonNegInt(rData.awaitingCount ?? rData.awaiting ?? rData.counts?.awaiting ?? 0);
  const runningCount = toSafeNonNegInt(rData.runningCount ?? rData.running ?? rData.counts?.running ?? 0);
  const headline = redactNovFeedText(rData.headline, 80);

  // 3) Memory drift summary
  const memArr = Array.isArray(memRes.data)
    ? memRes.data
    : Array.isArray(memRes.data?.memories)
      ? memRes.data.memories
      : Array.isArray(memRes.data?.entries)
        ? memRes.data.entries
        : [];
  const driftedCount = memArr.filter((m) => {
    if (m?.drifted === true) return true;
    if (Array.isArray(m?.anchors)) {
      return m.anchors.some((a) => String(a?.driftStatus || '') === 'drifted');
    }
    return false;
  }).length;

  // 4) Spec write-lock summary
  const sData = specRes.data && typeof specRes.data === 'object' ? specRes.data : {};
  const specsArr = Array.isArray(sData.specs) ? sData.specs : [];
  const activeSpec = sData.activeSpecId ? specsArr.find((sp) => sp?.id === sData.activeSpecId) : null;
  const writeLockActive =
    typeof sData.writeLockActive === 'boolean'
      ? sData.writeLockActive
      : Boolean(activeSpec && String(activeSpec.status || '').toLowerCase() === 'draft');

  return {
    ok: errors.length === 0,
    available: Boolean(auditRes.exists || snapRes.exists || radarRes.exists || memRes.exists || specRes.exists),
    errors,
    feed: {
      guard: {
        blockedCount: blocked.length,
        askCount: asked.length,
        forceAskCount: forceAsked.length,
        permissionMode: null,
        snapshotCount: snapArr.length,
        latestSnapshotId: typeof latestSnap?.id === 'string' ? redactNovFeedText(latestSnap.id, 64) : null,
        latestBlocked: latestBlk
          ? {
              ts: typeof latestBlk.ts === 'string' ? latestBlk.ts.slice(0, 40) : '',
              tool: redactNovFeedText(latestBlk.tool, 48),
              decision: String(latestBlk.decision || latestBlk.action || 'deny').toLowerCase().slice(0, 24),
              reason: redactNovFeedText(latestBlk.reason, 120),
            }
          : null,
      },
      radar: {
        awaitingCount,
        runningCount,
        headline,
      },
      mem: {
        totalCount: memArr.length,
        driftedCount,
      },
      spec: {
        writeLockActive,
        activeSpecId: typeof sData.activeSpecId === 'string' ? redactNovFeedText(sData.activeSpecId, 64) : null,
        activeSpecTitle: redactNovFeedText(activeSpec?.title, 80),
      },
      verify: {
        enforceOnStop: false,
        lastStatus: null,
        dirtyFilesCount: 0,
      },
      alerts: [],
    },
  };
}

function validateExplicitDataDirOption(explicitDataDir) {
  if (explicitDataDir === undefined || explicitDataDir === null) return null;
  if (typeof explicitDataDir !== 'string') return 'Invalid explicitDataDir: must be a string';
  if (explicitDataDir.includes('\0')) return 'Invalid explicitDataDir: NUL byte not allowed';
  const trimmed = explicitDataDir.trim();
  if (!trimmed) return 'Invalid explicitDataDir: empty path';
  if (hasUnexpandedPlaceholder(trimmed)) return 'Invalid explicitDataDir: unexpanded placeholder not allowed';
  return null;
}

function assertSafeWritePaths(dataDir, configPath, homeDir) {
  const dirViolation = findSymlinkViolation(dataDir, homeDir);
  if (dirViolation) return dirViolation;

  const existingDir = safeLstat(dataDir);
  if (existingDir) {
    if (existingDir.isSymbolicLink()) return `Refusing to write into symlink dataDir: ${dataDir}`;
    if (!existingDir.isDirectory()) return `dataDir exists and is not a directory: ${dataDir}`;
  }

  const existingCfg = safeLstat(configPath);
  if (existingCfg) {
    if (existingCfg.isSymbolicLink()) return `Refusing to overwrite symlink config.json: ${configPath}`;
    if (!existingCfg.isFile()) return `config.json path is not a regular file: ${configPath}`;
  }

  return null;
}

function writeNovConfigAtomic(dataDir, configPath, configObj, homeDir) {
  const preCheckErr = assertSafeWritePaths(dataDir, configPath, homeDir);
  if (preCheckErr) {
    throw new Error(preCheckErr);
  }

  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  safeChmodSync(dataDir, 0o700);

  // Re-verify after directory creation to guard against races
  const postCheckErr = assertSafeWritePaths(dataDir, configPath, homeDir);
  if (postCheckErr) {
    throw new Error(postCheckErr);
  }

  const realDir = safeRealpath(dataDir);
  if (!realDir) {
    throw new Error(`Unable to resolve realpath for dataDir: ${dataDir}`);
  }
  const existingCfg = safeLstat(configPath);
  if (existingCfg) {
    const realCfg = safeRealpath(configPath);
    if (!realCfg || !isPathWithinBase(realCfg, realDir)) {
      throw new Error(`config.json resolves outside dataDir boundary: ${configPath}`);
    }
  }

  const normalized = normalizeNovConfig({
    ...configObj,
    updatedAt: new Date().toISOString(),
  });
  const payload = `${JSON.stringify(normalized, null, 2)}\n`;

  tmpFileCounter += 1;
  const suffix = `${process.pid}.${Date.now()}${tmpFileCounter > 1 ? `.${tmpFileCounter}` : ''}`;
  const tmpPath = `${configPath}.tmp.${suffix}`;

  try {
    fs.writeFileSync(tmpPath, payload, { mode: 0o600, flag: 'wx' });
    safeChmodSync(tmpPath, 0o600);
    atomicRenameWithRetry(tmpPath, configPath);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // Ignore cleanup failure
    }
    throw err;
  }

  return normalized;
}

/**
 * Applies a strictly whitelisted control command to agy-NOV's config.json atomically.
 */
export function applyNovCommand(cmd, opts = {}) {
  if (!isPlainObject(cmd)) {
    return { ok: false, error: 'Command must be a plain object' };
  }

  const action = typeof cmd.action === 'string' ? cmd.action.trim() : '';
  if (!ALLOWED_COMMAND_ACTIONS.has(action)) {
    return {
      ok: false,
      error: `Invalid action "${cmd.action ?? ''}" (allowed: get_state | set_module | apply_preset | set_locale)`,
    };
  }

  const allowedKeys = ALLOWED_ACTION_KEYS[action];
  const unexpectedKeys = Object.keys(cmd).filter((k) => !allowedKeys.has(k));
  if (unexpectedKeys.length > 0) {
    return { ok: false, error: `Unexpected field(s) for ${action}: ${unexpectedKeys.join(', ')}` };
  }

  const explicitErr = validateExplicitDataDirOption(opts.explicitDataDir);
  if (explicitErr) {
    return { ok: false, error: explicitErr };
  }

  if (action === 'get_state') {
    return { ok: true, state: readNovState(opts) };
  }

  // Validate action-specific arguments before touching filesystem
  if (action === 'set_module') {
    if (typeof cmd.moduleId !== 'string' || !NOV_MODULE_IDS.includes(cmd.moduleId)) {
      return {
        ok: false,
        error: `Invalid moduleId "${cmd.moduleId ?? ''}" (allowed: ${NOV_MODULE_IDS.join(', ')})`,
      };
    }
    if (typeof cmd.enabled !== 'boolean') {
      return { ok: false, error: 'Invalid enabled value: expected boolean' };
    }
  } else if (action === 'apply_preset') {
    if (typeof cmd.preset !== 'string' || !Object.prototype.hasOwnProperty.call(NOV_PRESETS, cmd.preset)) {
      return {
        ok: false,
        error: `Invalid preset "${cmd.preset ?? ''}" (allowed: ${NOV_PRESET_IDS.join(', ')})`,
      };
    }
  } else if (action === 'set_locale') {
    if (typeof cmd.locale !== 'string' || !ALLOWED_NOV_LOCALES.includes(cmd.locale)) {
      return {
        ok: false,
        error: `Invalid locale "${cmd.locale ?? ''}" (allowed: ${ALLOWED_NOV_LOCALES.join(', ')})`,
      };
    }
  }

  const homeDir = opts.homeDir || os.homedir();
  const currentState = readNovState(opts);
  const current = currentState.config;

  let nextConfig;
  if (action === 'set_module') {
    const nextModules = {
      ...current.modules,
      [cmd.moduleId]: cmd.enabled,
    };
    nextConfig = {
      ...current,
      modules: nextModules,
      defaultTab:
        cmd.enabled && NOV_MODULES_CATALOG[cmd.moduleId].hasUiTab ? cmd.moduleId : current.defaultTab,
    };
  } else if (action === 'apply_preset') {
    const presetSpec = NOV_PRESETS[cmd.preset];
    nextConfig = {
      ...current,
      preset: cmd.preset,
      modules: { ...presetSpec.modules },
      defaultTab: NOV_MODULE_IDS.find((id) => presetSpec.modules[id] && NOV_MODULES_CATALOG[id].hasUiTab) || 'review',
    };
  } else if (action === 'set_locale') {
    nextConfig = {
      ...current,
      locale: cmd.locale,
    };
  }

  try {
    writeNovConfigAtomic(currentState.dataDir, currentState.configPath, nextConfig, homeDir);
    return { ok: true, state: readNovState(opts) };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

function attachBridgeMeta(result, meta) {
  Object.defineProperty(result, '_meta', {
    value: Object.freeze(meta),
    enumerable: false,
    configurable: true,
  });
  return result;
}

/**
 * Dispatches JSON payloads received over CDP Runtime.bindingCalled (__agSagHostBridge).
 * Never throws on malformed payloads.
 */
export function handleBridgePayload(rawPayload, opts = {}) {
  let msg;
  if (typeof rawPayload === 'string') {
    if (
      rawPayload.length > MAX_BRIDGE_PAYLOAD_BYTES ||
      Buffer.byteLength(rawPayload, 'utf8') > MAX_BRIDGE_PAYLOAD_BYTES
    ) {
      return attachBridgeMeta(
        { reqId: null, ok: false, error: 'Bridge payload exceeds maximum size limit' },
        { type: null, action: null, mutated: false }
      );
    }
    try {
      msg = JSON.parse(rawPayload);
    } catch {
      return attachBridgeMeta(
        { reqId: null, ok: false, error: 'Malformed JSON bridge payload' },
        { type: null, action: null, mutated: false }
      );
    }
  } else if (isPlainObject(rawPayload)) {
    msg = rawPayload;
  } else {
    return attachBridgeMeta(
      { reqId: null, ok: false, error: 'Bridge payload must be a JSON string or object' },
      { type: null, action: null, mutated: false }
    );
  }

  if (!isPlainObject(msg)) {
    return attachBridgeMeta(
      { reqId: null, ok: false, error: 'Bridge payload must decode to a plain object' },
      { type: null, action: null, mutated: false }
    );
  }

  const reqId =
    typeof msg.reqId === 'string' || (typeof msg.reqId === 'number' && Number.isFinite(msg.reqId))
      ? String(msg.reqId)
      : null;

  const type = typeof msg.type === 'string' ? msg.type.trim() : '';
  const payload = msg.payload === undefined || msg.payload === null ? {} : msg.payload;

  if (!isPlainObject(payload)) {
    return attachBridgeMeta(
      { reqId, ok: false, error: 'Bridge message payload must be a plain object' },
      { type, action: null, mutated: false }
    );
  }

  if (type === 'sag:ping') {
    return attachBridgeMeta(
      {
        reqId,
        ok: true,
        data: {
          pong: true,
          ts: new Date().toISOString(),
          protocol: 'agy-sag-nov-bridge/1',
        },
      },
      { type, action: null, mutated: false }
    );
  }

  const action = BRIDGE_TYPE_TO_ACTION[type];
  if (!action) {
    return attachBridgeMeta(
      { reqId, ok: false, error: `Unsupported bridge message type: "${type}"` },
      { type, action: null, mutated: false }
    );
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'action')) {
    return attachBridgeMeta(
      { reqId, ok: false, error: 'Bridge payload must not contain reserved field "action"' },
      { type, action, mutated: false }
    );
  }

  const res = applyNovCommand({ ...payload, action }, opts);
  if (!res.ok) {
    return attachBridgeMeta({ reqId, ok: false, error: res.error }, { type, action, mutated: false });
  }
  return attachBridgeMeta(
    { reqId, ok: true, data: res.state },
    { type, action, mutated: MUTATING_BRIDGE_ACTIONS.has(action) }
  );
}
