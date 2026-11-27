// agy-Sag — Prompt Library & Command Palette (UMD, zero runtime deps)
// Opt-in quick slash command, {{variable}} snippet vault, and read-only agy-NOV ops template palette.
// Security & Coexistence invariants:
//   - Zero innerHTML / eval / external network calls; strict textContent DOM rendering
//   - Bounded storage (<= 100 snippets, <= 4000 chars body, <= 128 KB JSON import, prototype-key rejection)
//   - Never hijacks right-click contextmenu (yields peacefully to Obsidian Prism menus)
//   - Never auto-submits composer; appends safely when existing draft is present
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSagPromptLibrary = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  const STORAGE_KEY = 'agSag.promptLibrary.v1';
  const TRIGGER_TESTID = 'ag-sag-pl-trigger';
  const BACKDROP_TESTID = 'ag-sag-pl-backdrop';
  const MODAL_TESTID = 'ag-sag-pl-modal';

  const MAX_SNIPPETS = 100;
  const MAX_IMPORT_BYTES = 131072; // 128 KB
  const MAX_TITLE_LEN = 80;
  const MAX_DESC_LEN = 200;
  const MAX_BODY_LEN = 4000;
  const MAX_TAG_COUNT = 6;
  const MAX_TAG_LEN = 24;
  const MAX_VAR_VALUE_LEN = 1000;
  const VAR_TOKEN_RE = /\{\{\s*([a-zA-Z0-9_\u4e00-\u9fff-]{1,40})(?:\s*=\s*([^}]{0,120}))?\s*\}\}/g;
  const SELECTION_PREFILL_VAR_RE = /^(?:selection|code|target|error|topic|snippet|subject|issue|symptom)$/i;
  const BARE_SLASH_CMD_RE = /^\/[a-zA-Z0-9_-]*$/;
  const URL_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;
  const POSIX_EXT_PATH_RE = /^(?:\.{0,2}\/|~\/|\/)?[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._ -]+)+\.[A-Za-z0-9]{1,10}(?::\d+(?::\d+)?)?$/;
  const POSIX_ROOTED_PATH_RE = /^(?:\/|~\/|\.{1,2}\/)[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+(?::\d+(?::\d+)?)?$/;
  const WIN_DRIVE_PATH_RE = /^[A-Za-z]:[\\/](?:[^<>:"|?*\r\n\\/]+[\\/])*[^<>:"|?*\r\n\\/]+(?::\d+(?::\d+)?)?$/;
  const WIN_UNC_PATH_RE = /^\\\\[A-Za-z0-9._-]+\\[^<>:"|?*\r\n\\/]+(?:\\[^<>:"|?*\r\n\\/]+)+(?::\d+(?::\d+)?)?$/;
  const WIN_REL_PATH_RE = /^(?:\.{1,2}\\)?[A-Za-z0-9._-]+(?:\\[A-Za-z0-9._ -]+)+(?::\d+(?::\d+)?)?$/;
  const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

  const BUILTIN_SLASH_ITEMS = Object.freeze([
    Object.freeze({
      id: 'slash-compact',
      source: 'slash',
      titleZh: '/compact · 智能压缩上下文',
      titleEn: '/compact · Compact conversation context',
      descZh: '释放历史上下文占用并保留核心任务脉络',
      descEn: 'Summarize history and reclaim context window cleanly',
      tags: ['slash', 'compact'],
      body: '/compact',
    }),
    Object.freeze({
      id: 'slash-compact-code',
      source: 'slash',
      titleZh: '/compact · 优先保留代码与报错',
      titleEn: '/compact · Preserve code changes & errors',
      descZh: '带焦点指令压缩，保留修改路径、报错堆栈与待验证项',
      descEn: 'Compact with focus on modified files, stack traces, and pending tests',
      tags: ['slash', 'compact', 'debug'],
      body: '/compact Focus on modified files, error stack traces, root causes, and pending verification steps.',
    }),
    Object.freeze({
      id: 'slash-compact-bookmarks',
      source: 'slash',
      titleZh: '/compact · 优先保留已收藏要点',
      titleEn: '/compact · Preserve key decisions & bookmarks',
      descZh: '保留本会话已确认的架构约束与核心决策',
      descEn: 'Compact while keeping confirmed architecture constraints and decisions',
      tags: ['slash', 'compact', 'bookmarks'],
      body: '/compact Preserve all confirmed architecture decisions, constraints, and key turn conclusions.',
    }),
    Object.freeze({
      id: 'slash-clear',
      source: 'slash',
      titleZh: '/clear · 同项目清爽重开',
      titleEn: '/clear · Clean slate fresh restart',
      descZh: '在当前项目开启零历史包袱的新对话',
      descEn: 'Start a clean conversation inside the current project',
      tags: ['slash', 'clear'],
      body: '/clear',
    }),
    Object.freeze({
      id: 'slash-clear-keep',
      source: 'slash',
      titleZh: '/clear keep · 携带脱敏交接重开',
      titleEn: '/clear keep · Fresh restart with continuity brief',
      descZh: '新开对话并自动带入脱敏后的目标、结论与下一步',
      descEn: 'Fresh conversation carrying a redacted continuity handoff brief',
      tags: ['slash', 'clear', 'handoff'],
      body: '/clear keep',
    }),
  ]);

  const BUILTIN_TEMPLATES = Object.freeze([
    Object.freeze({
      id: 'tpl-diff-review',
      source: 'builtin',
      titleZh: '代码 Diff 深度审阅',
      titleEn: 'Deep Code Diff Review',
      descZh: '按逻辑漏洞、边界条件、性能与回归风险逐项审查改动',
      descEn: 'Audit changes for logic bugs, edge cases, regressions, and security risks',
      tags: ['review', 'quality'],
      bodyZh: '请审查 {{target=当前未提交改动}} 的代码实现：\n1. 排查逻辑漏洞、边界空值、并发与状态不同步问题；\n2. 核查安全风险（注入、路径越界、敏感信息泄露）与资源清理；\n3. 按严重程度列出具体文件、行号与最小修复建议。',
      bodyEn: 'Review the implementation in {{target=current uncommitted diff}}:\n1. Check for logic bugs, edge cases, race conditions, and state drift;\n2. Audit security risks (injection, traversal, secret exposure) and teardown hygiene;\n3. Report findings by severity with exact file paths, lines, and minimal fixes.',
    }),
    Object.freeze({
      id: 'tpl-root-cause',
      source: 'builtin',
      titleZh: '故障根因排查与最小修复',
      titleEn: 'Root Cause Investigation & Minimal Fix',
      descZh: '先复现定位根因，再给出不扩大影响面的验证修复',
      descEn: 'Reproduce and isolate root cause before applying a minimal verified fix',
      tags: ['debug', 'fix'],
      bodyZh: '请排查问题「{{symptom}}」：\n- 现象与触发范围：{{scope=请结合日志与相关模块分析}}\n- 要求：先定位根因并给出证据链，再实施最小改动修复，最后补充回归测试并运行验证。',
      bodyEn: 'Investigate the issue "{{symptom}}":\n- Scope/context: {{scope=inspect logs and related modules}}\n- Requirements: isolate the root cause with concrete evidence, apply the smallest clean fix, add a regression test, and verify.',
    }),
    Object.freeze({
      id: 'tpl-test-coverage',
      source: 'builtin',
      titleZh: '补齐边界与回归测试用例',
      titleEn: 'Add Edge-Case & Regression Tests',
      descZh: '针对核心模块补全异常输入、边界条件与清理验收测试',
      descEn: 'Write deterministic unit and regression tests for boundary and failure paths',
      tags: ['test', 'qa'],
      bodyZh: '请为 {{module}} 补充单元测试：\n1. 覆盖正常路径、空值/超限边界、非法输入与异常降级；\n2. 验证初始化、状态切换与销毁清理（destroy）零残留；\n3. 运行测试确保全部通过且无抖动。',
      bodyEn: 'Add unit tests for {{module}}:\n1. Cover happy paths, empty/boundary limits, malformed inputs, and graceful fallbacks;\n2. Verify mount, state transitions, and zero-residue teardown;\n3. Execute the suite and confirm deterministic passing results.',
    }),
    Object.freeze({
      id: 'tpl-refactor-plan',
      source: 'builtin',
      titleZh: '渐进式重构与兼容方案',
      titleEn: 'Incremental Refactor Plan',
      descZh: '拆解安全重构步骤并保持对外接口与旧数据兼容',
      descEn: 'Plan safe step-by-step refactoring while preserving public contracts',
      tags: ['refactor', 'architecture'],
      bodyZh: '请为 {{target}} 制定渐进式重构方案：\n1. 目标：{{goal=降低耦合、消除重复逻辑并提升可读性}}；\n2. 列出受影响的调用方、兼容策略与每步验证命令；\n3. 避免破坏现有公开接口与持久化格式。',
      bodyEn: 'Design an incremental refactor plan for {{target}}:\n1. Goal: {{goal=reduce coupling, remove duplication, improve clarity}};\n2. List affected callers, backward-compatibility guarantees, and per-step verification;\n3. Keep existing public APIs and persisted schemas compatible.',
    }),
    Object.freeze({
      id: 'tpl-handoff',
      source: 'builtin',
      titleZh: '阶段交接与状态总结',
      titleEn: 'Phase Handoff Summary',
      descZh: '沉淀已完成改动、实测证据、风险与下一步清单',
      descEn: 'Summarize completed work, verification outputs, risks, and next steps',
      tags: ['handoff', 'docs'],
      bodyZh: '请整理 {{milestone=当前阶段}} 的结构化交接摘要：\n1. 已完成改动及关键文件路径；\n2. 已执行的验证命令与真实通过结果；\n3. 已知限制、待确认事项与下一步建议。',
      bodyEn: 'Write a structured handoff summary for {{milestone=current phase}}:\n1. Completed changes and key file paths;\n2. Verification commands run and exact observed results;\n3. Remaining risks, open decisions, and recommended next steps.',
    }),
    Object.freeze({
      id: 'tpl-security-audit',
      source: 'builtin',
      titleZh: '安全与权限边界自检',
      titleEn: 'Security & Boundary Audit',
      descZh: '核查路径穿越、XSS、ReDoS、凭据泄露与权限最小化',
      descEn: 'Audit path traversal, XSS, ReDoS, secret redaction, and least privilege',
      tags: ['security', 'audit'],
      bodyZh: '请对 {{target}} 执行安全边界审计，重点核查：\n1. XSS / DOM 注入（禁止 innerHTML）与正则线性耗时防 ReDoS；\n2. 文件路径穿越、symlink 逃逸、大小上限与原型污染防护；\n3. 凭证脱敏与默认关闭（opt-in）安全策略。',
      bodyEn: 'Perform a security boundary audit on {{target}} focusing on:\n1. XSS / DOM injection (zero innerHTML) and linear-time ReDoS safety;\n2. Path traversal, symlink guards, payload caps, and prototype-pollution defense;\n3. Secret redaction and opt-in defaults.',
    }),
  ]);

  function resolveDep(globalKey, relPath) {
    if (globalRoot && globalRoot[globalKey]) return globalRoot[globalKey];
    if (typeof require === 'function') {
      try {
        return require(relPath);
      } catch {
        return null;
      }
    }
    return null;
  }

  function extractVariables(body) {
    const src = String(body || '');
    const seen = new Set();
    const out = [];
    VAR_TOKEN_RE.lastIndex = 0;
    let m;
    while ((m = VAR_TOKEN_RE.exec(src)) !== null) {
      const name = String(m[1] || '').trim();
      if (!name || FORBIDDEN_KEYS.has(name) || seen.has(name)) continue;
      seen.add(name);
      out.push({
        name,
        defaultValue: m[2] !== undefined ? String(m[2]).trim() : '',
      });
      if (out.length >= 24) break;
    }
    return out;
  }

  function renderTemplate(body, values = {}) {
    const src = String(body || '');
    const vals = values && typeof values === 'object' ? values : {};
    const defaults = new Map();
    for (const v of extractVariables(src)) {
      if (v.defaultValue) defaults.set(v.name, v.defaultValue);
    }
    VAR_TOKEN_RE.lastIndex = 0;
    return src.replace(VAR_TOKEN_RE, (full, rawName, rawDef) => {
      const name = String(rawName || '').trim();
      if (!name || FORBIDDEN_KEYS.has(name)) return full;
      const hasVal = Object.prototype.hasOwnProperty.call(vals, name);
      const userVal = hasVal ? String(vals[name] ?? '').slice(0, MAX_VAR_VALUE_LEN) : '';
      if (userVal.trim()) return userVal;
      const defVal = rawDef !== undefined && String(rawDef).trim() ? String(rawDef).trim() : (defaults.get(name) || '');
      if (defVal) return defVal;
      return full;
    });
  }

  function normalizeTags(rawTags) {
    if (!Array.isArray(rawTags)) return [];
    const seen = new Set();
    const out = [];
    for (const item of rawTags) {
      if (typeof item !== 'string') continue;
      const clean = item.trim().slice(0, MAX_TAG_LEN);
      if (!clean || seen.has(clean.toLowerCase())) continue;
      seen.add(clean.toLowerCase());
      out.push(clean);
      if (out.length >= MAX_TAG_COUNT) break;
    }
    return out;
  }

  function generateSnippetId(seed = '') {
    const rand = Math.random().toString(36).slice(2, 8);
    const slug = String(seed || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 20);
    return `usr-${slug || 'snip'}-${rand}`;
  }

  function sanitizeSnippet(raw, { fallbackId = null, source = 'user' } = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, MAX_TITLE_LEN) : '';
    const body = typeof raw.body === 'string' ? raw.body.trim().slice(0, MAX_BODY_LEN) : '';
    if (!title || !body) return null;

    const rawId = typeof raw.id === 'string' ? raw.id.trim().slice(0, 64) : '';
    const safeId = rawId && !FORBIDDEN_KEYS.has(rawId) ? rawId : (fallbackId || generateSnippetId(title));
    const description = typeof raw.description === 'string' ? raw.description.trim().slice(0, MAX_DESC_LEN) : '';
    const tags = normalizeTags(raw.tags);
    const updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt.slice(0, 40) : new Date().toISOString();

    return {
      id: safeId,
      source: source === 'nov' ? 'nov' : 'user',
      title,
      description,
      tags,
      body,
      updatedAt,
    };
  }

  function hasForbiddenOwnKey(obj) {
    if (!obj || typeof obj !== 'object') return false;
    for (const k of Object.keys(obj)) {
      if (FORBIDDEN_KEYS.has(k)) return true;
    }
    return false;
  }

  function sanitizeImportedSnippets(rawInput) {
    const errors = [];
    let parsed = rawInput;
    if (typeof rawInput === 'string') {
      if (rawInput.length > MAX_IMPORT_BYTES) {
        return { ok: false, snippets: [], errors: [`Import payload exceeds ${MAX_IMPORT_BYTES} bytes limit`] };
      }
      const byteLen = typeof TextEncoder !== 'undefined'
        ? new TextEncoder().encode(rawInput).length
        : rawInput.length * 2;
      if (byteLen > MAX_IMPORT_BYTES) {
        return { ok: false, snippets: [], errors: [`Import payload exceeds ${MAX_IMPORT_BYTES} bytes limit`] };
      }
      if (!rawInput.trim()) {
        return { ok: false, snippets: [], errors: ['Empty import payload'] };
      }
      try {
        parsed = JSON.parse(rawInput);
      } catch {
        return { ok: false, snippets: [], errors: ['Invalid JSON syntax'] };
      }
    }

    if (hasForbiddenOwnKey(parsed)) {
      return { ok: false, snippets: [], errors: ['Prototype pollution key rejected'] };
    }

    let list = null;
    if (Array.isArray(parsed)) {
      list = parsed;
    } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.snippets)) {
      list = parsed.snippets;
    } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.prompts)) {
      list = parsed.prompts;
    } else {
      return { ok: false, snippets: [], errors: ['Expected a JSON array or { snippets: [...] } object'] };
    }

    const seenIds = new Set();
    const snippets = [];
    let dropped = 0;

    for (const item of list) {
      if (snippets.length >= MAX_SNIPPETS) {
        dropped += 1;
        continue;
      }
      if (!item || typeof item !== 'object' || Array.isArray(item) || hasForbiddenOwnKey(item)) {
        dropped += 1;
        continue;
      }
      const clean = sanitizeSnippet(item, { source: 'user' });
      if (!clean) {
        dropped += 1;
        continue;
      }
      if (seenIds.has(clean.id)) {
        clean.id = generateSnippetId(clean.title);
      }
      seenIds.add(clean.id);
      snippets.push(clean);
    }

    if (snippets.length === 0 && list.length > 0) {
      errors.push('No valid snippets found (each item requires non-empty title and body)');
      return { ok: false, snippets: [], errors, dropped };
    }

    return { ok: true, snippets, errors, dropped };
  }

  function sanitizeNovTemplates(rawList) {
    if (!Array.isArray(rawList)) return [];
    const seen = new Set();
    const out = [];
    for (const item of rawList) {
      if (out.length >= MAX_SNIPPETS) break;
      if (!item || typeof item !== 'object' || Array.isArray(item) || hasForbiddenOwnKey(item)) continue;
      const clean = sanitizeSnippet(item, { source: 'nov' });
      if (!clean || seen.has(clean.id)) continue;
      seen.add(clean.id);
      out.push(clean);
    }
    return out;
  }

  function isEditableTarget(el) {
    if (!el) return false;
    const tag = String(el.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.getAttribute?.('contenteditable') === 'true') return true;
    if (el.closest?.('[contenteditable="true"], [data-lexical-editor="true"]')) return true;
    return false;
  }

  function createPromptLibraryController(options = {}) {
    const win = options.win || globalRoot;
    const doc = options.doc || win?.document || null;
    const storage = options.storage || win?.localStorage || null;
    const coexist = options.coexist || resolveDep('__agSgCoexist', './coexist.js');
    const ctxSrc = options.contextSource || resolveDep('__agSgContextSource', './context-source.js');
    const i18n = options.i18n || resolveDep('__agSgI18n', './i18n.js');
    const styles = options.styles || resolveDep('__agSgStyles', './styles.js');

    let enabled = Boolean(options.enabled);
    let destroyed = false;
    let modalOpen = false;
    let activeFilter = 'all'; // 'all' | 'slash' | 'builtin' | 'user' | 'nov'
    let queryText = '';
    let selectedIndex = 0;
    let activeVarItem = null;
    let varValues = {};
    let editorMode = false; // inline create/edit snippet mode
    let editingSnippetId = null;
    let insertMode = 'append'; // 'append' | 'replace'

    let userSnippets = [];
    let novTemplates = sanitizeNovTemplates(options.initialNovTemplates || []);
    let novRefreshInFlight = false;
    let activePaneEl = null;

    let triggerBtn = null;
    let backdropEl = null;
    let modalEl = null;
    let searchInputEl = null;
    let createdStyleEl = null;
    let keydownOff = null;
    let domObserver = null;
    let observerTimer = null;

    const getLang = () =>
      typeof options.getLang === 'function' ? i18n.normalizeLang(options.getLang()) : i18n.detectLang(doc, win);
    const isZh = () => {
      const l = getLang();
      return l === 'zh-CN' || l === 'zh-TW' || l === 'yue';
    };
    const t = (key, fallback = '') => {
      const sag = typeof i18n?.getSagStrings === 'function' ? i18n.getSagStrings(getLang()) : null;
      return sag?.[key] ?? fallback;
    };
    const getScope = () => (ctxSrc?.resolveActivePaneScope ? ctxSrc.resolveActivePaneScope(doc, activePaneEl) : doc);

    function loadSnippets() {
      if (!storage || typeof storage.getItem !== 'function') return [];
      try {
        const raw = storage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const res = sanitizeImportedSnippets(raw);
        return res.ok ? res.snippets : [];
      } catch {
        return [];
      }
    }

    function persistSnippets() {
      if (!storage || typeof storage.setItem !== 'function') return false;
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, snippets: userSnippets }));
        return true;
      } catch {
        return false;
      }
    }

    userSnippets = loadSnippets();

    function ensureStyle() {
      if (!doc || !styles) return;
      if (doc.getElementById?.(styles.STYLE_ID)) return;
      const el = doc.createElement('style');
      el.id = styles.STYLE_ID;
      el.textContent = styles.CORE_CSS;
      coexist?.markOwnedNoTranslate?.(el);
      (doc.head || doc.documentElement || doc.body)?.appendChild?.(el);
      createdStyleEl = el;
    }

    function getAllItems() {
      const zh = isZh();
      const slash = BUILTIN_SLASH_ITEMS.map((item) => ({
        id: item.id,
        source: 'slash',
        title: zh ? item.titleZh : item.titleEn,
        description: zh ? item.descZh : item.descEn,
        tags: item.tags,
        body: item.body,
      }));
      const builtin = BUILTIN_TEMPLATES.map((item) => ({
        id: item.id,
        source: 'builtin',
        title: zh ? item.titleZh : item.titleEn,
        description: zh ? item.descZh : item.descEn,
        tags: item.tags,
        body: zh ? item.bodyZh : item.bodyEn,
      }));
      const user = userSnippets.map((item) => ({ ...item, source: 'user' }));
      const nov = novTemplates.map((item) => ({ ...item, source: 'nov' }));
      return [...user, ...slash, ...builtin, ...nov];
    }

    function getFilteredItems() {
      const all = getAllItems();
      const byTab = activeFilter === 'all' ? all : all.filter((item) => item.source === activeFilter);
      const q = queryText.trim().toLowerCase();
      if (!q) return byTab;
      const terms = q.split(/\s+/).filter(Boolean);
      return byTab.filter((item) => {
        const hay = `${item.title} ${item.description} ${(item.tags || []).join(' ')} ${item.body}`.toLowerCase();
        return terms.every((term) => hay.includes(term));
      });
    }

    function insertIntoComposer(text, opts = {}) {
      const payload = String(text ?? '');
      const mode = (typeof opts === 'string' ? opts : opts?.mode) || insertMode || 'append';
      if (!payload && mode !== 'replace') return { ok: false, reason: 'empty' };
      const scope = getScope();
      const ed = ctxSrc?.findComposerEditor ? ctxSrc.findComposerEditor(doc, scope) : null;
      if (!ed) return { ok: false, reason: 'no-editor' };

      const existing = ctxSrc?.readComposerDraft ? String(ctxSrc.readComposerDraft(doc, scope) || '') : '';
      const hasExisting = existing.trim().length > 0;
      const finalText = hasExisting && mode !== 'replace' ? `${existing}\n\n${payload}` : payload;

      try {
        ed.focus?.();
        const tag = String(ed.tagName || '').toUpperCase();
        if (tag === 'TEXTAREA' || tag === 'INPUT') {
          ed.value = finalText;
          try {
            if (typeof ed.setSelectionRange === 'function') {
              ed.setSelectionRange(finalText.length, finalText.length);
            }
          } catch {}
          const EvCtor = win?.Event || Event;
          ed.dispatchEvent?.(new EvCtor('input', { bubbles: true }));
          return { ok: true, mode: hasExisting && mode !== 'replace' ? 'append' : 'replace', length: finalText.length };
        }

        // Lexical / contenteditable: prefer execCommand('insertText') with strict editor-scoped Selection
        const insertDelta = hasExisting && mode !== 'replace' ? `\n\n${payload}` : payload;
        if (mode === 'replace' && hasExisting) {
          let scopedSelect = false;
          if (typeof win?.getSelection === 'function' && typeof doc.createRange === 'function') {
            try {
              const range = doc.createRange();
              range.selectNodeContents(ed);
              const sel = win.getSelection();
              sel?.removeAllRanges?.();
              sel?.addRange?.(range);
              scopedSelect = true;
            } catch {}
          }
          if (!scopedSelect && typeof doc.execCommand === 'function') {
            try { doc.execCommand('selectAll', false); } catch {}
          }
        } else if (hasExisting && typeof win?.getSelection === 'function' && typeof doc.createRange === 'function') {
          try {
            const range = doc.createRange();
            range.selectNodeContents(ed);
            range.collapse(false);
            const sel = win.getSelection();
            sel?.removeAllRanges?.();
            sel?.addRange?.(range);
          } catch {}
        }

        if (typeof doc.execCommand === 'function' && doc.execCommand('insertText', false, insertDelta)) {
          return { ok: true, mode: hasExisting && mode !== 'replace' ? 'append' : 'replace', length: finalText.length };
        }

        ed.textContent = finalText;
        const EvCtor = win?.Event || Event;
        ed.dispatchEvent?.(new EvCtor('input', { bubbles: true }));
        return { ok: true, mode: hasExisting && mode !== 'replace' ? 'append' : 'replace', length: finalText.length };
      } catch {
        return { ok: false, reason: 'insert-failed' };
      }
    }

    function applySelectedItem(item) {
      if (!item) return;
      const vars = extractVariables(item.body);
      if (vars.length > 0 && activeVarItem?.id !== item.id) {
        activeVarItem = item;
        varValues = {};
        for (const v of vars) {
          const prefill = selectionContext && SELECTION_PREFILL_VAR_RE.test(v.name) ? selectionContext : '';
          varValues[v.name] = prefill || v.defaultValue || '';
        }
        renderModal();
        return;
      }
      const rendered = vars.length > 0 ? renderTemplate(item.body, varValues) : item.body;
      const res = insertIntoComposer(rendered, { mode: insertMode });
      if (typeof options.onInsert === 'function') {
        try {
          options.onInsert({ item, text: rendered, result: res });
        } catch {}
      }
      if (res.ok) {
        close();
      }
    }

    function saveSnippet(input) {
      const clean = sanitizeSnippet(input, { fallbackId: input?.id || null, source: 'user' });
      if (!clean) return { ok: false, error: 'Title and body are required' };

      const idx = userSnippets.findIndex((s) => s.id === clean.id);
      if (idx >= 0) {
        userSnippets[idx] = clean;
      } else {
        if (userSnippets.length >= MAX_SNIPPETS) {
          return { ok: false, error: `Maximum ${MAX_SNIPPETS} custom snippets reached` };
        }
        userSnippets.unshift(clean);
      }
      persistSnippets();
      notifyChanged();
      if (modalOpen) renderModal();
      return { ok: true, snippet: clean };
    }

    function deleteSnippet(id) {
      const targetId = String(id || '');
      const before = userSnippets.length;
      userSnippets = userSnippets.filter((s) => s.id !== targetId);
      if (userSnippets.length === before) return false;
      persistSnippets();
      notifyChanged();
      if (modalOpen) renderModal();
      return true;
    }

    function exportSnippetsJson() {
      return JSON.stringify({ version: 1, snippets: userSnippets }, null, 2);
    }

    function importSnippetsJson(raw) {
      const res = sanitizeImportedSnippets(raw);
      if (!res.ok) return res;
      const existingById = new Map(userSnippets.map((s) => [s.id, s]));
      let applied = 0;
      let capDropped = 0;
      for (const s of res.snippets) {
        if (!existingById.has(s.id) && existingById.size >= MAX_SNIPPETS) {
          capDropped += 1;
          continue;
        }
        existingById.set(s.id, s);
        applied += 1;
      }
      userSnippets = Array.from(existingById.values()).slice(0, MAX_SNIPPETS);
      persistSnippets();
      notifyChanged();
      if (modalOpen) renderModal();
      return {
        ok: true,
        count: applied,
        total: userSnippets.length,
        dropped: (res.dropped || 0) + capDropped,
        errors: [],
      };
    }

    function notifyChanged() {
      if (typeof options.onChange === 'function') {
        try {
          options.onChange(getDebugState());
        } catch {}
      }
    }

    async function refreshNovTemplates() {
      if (destroyed || !enabled || novRefreshInFlight) return novTemplates;
      if (typeof options.requestNovTemplates !== 'function') return novTemplates;
      novRefreshInFlight = true;
      try {
        const res = await options.requestNovTemplates();
        const rawList = Array.isArray(res)
          ? res
          : Array.isArray(res?.templates)
            ? res.templates
            : Array.isArray(res?.data?.templates)
              ? res.data.templates
              : [];
        novTemplates = sanitizeNovTemplates(rawList);
        if (modalOpen) renderModal();
        notifyChanged();
      } catch {
        // Silent read-only fallback
      } finally {
        novRefreshInFlight = false;
      }
      return novTemplates;
    }

    function setNovTemplates(list) {
      novTemplates = sanitizeNovTemplates(list);
      if (modalOpen) renderModal();
      notifyChanged();
      return novTemplates.length;
    }

    function findTriggerAnchor(scope = getScope()) {
      if (!doc) return null;
      const root = scope && scope.isConnected !== false ? scope : doc;
      return (
        root.querySelector?.('.agy-composer-footer') ||
        doc.querySelector?.('.agy-composer-footer') ||
        root.querySelector?.('[data-testid="agent-input-box"] .composer-foot') ||
        doc.querySelector?.('[data-testid="agent-input-box"] .composer-foot') ||
        null
      );
    }

    function removeTrigger() {
      try { triggerBtn?.remove?.(); } catch {}
      triggerBtn = null;
    }

    function ensureTrigger() {
      if (!doc || destroyed || !enabled) {
        removeTrigger();
        return null;
      }
      const footer = findTriggerAnchor();
      if (!footer) return null;
      ensureStyle();

      if (!triggerBtn || triggerBtn.parentElement !== footer) {
        removeTrigger();
        const btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = 'ag-sag-pl-trigger';
        btn.setAttribute('data-testid', TRIGGER_TESTID);
        coexist?.markOwnedNoTranslate?.(btn);
        btn.textContent = t('plTriggerBtn', '⌘ Prompts');
        btn.title = t('plTriggerTitle', 'Prompt Library (Ctrl/Cmd+Alt+P)');
        btn.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          toggle();
        });

        const pillWrap = footer.querySelector?.('[data-testid="ag-sg-pill-wrap"]');
        if (pillWrap && pillWrap.parentElement === footer && typeof footer.insertBefore === 'function') {
          footer.insertBefore(btn, pillWrap);
        } else {
          const kids = Array.from(footer.children || []);
          const trailing = kids.length > 1 ? kids[kids.length - 1] : null;
          if (trailing && typeof footer.insertBefore === 'function') {
            footer.insertBefore(btn, trailing);
          } else {
            footer.appendChild(btn);
          }
        }
        triggerBtn = btn;
      } else {
        const nextLabel = t('plTriggerBtn', '⌘ Prompts');
        const nextTitle = t('plTriggerTitle', 'Prompt Library (Ctrl/Cmd+Alt+P)');
        if (triggerBtn.textContent !== nextLabel) triggerBtn.textContent = nextLabel;
        if (triggerBtn.title !== nextTitle) triggerBtn.title = nextTitle;
      }
      return triggerBtn;
    }

    function ensureModalShell() {
      if (!doc || !doc.body || destroyed) return null;
      ensureStyle();
      if (!backdropEl || backdropEl.isConnected === false) {
        backdropEl = coexist?.markOwnedNoTranslate
          ? coexist.markOwnedNoTranslate(doc.createElement('div'))
          : doc.createElement('div');
        backdropEl.className = 'ag-sag-pl-backdrop';
        backdropEl.setAttribute('data-testid', BACKDROP_TESTID);
        backdropEl.hidden = true;
        backdropEl.addEventListener('click', (ev) => {
          if (ev?.target === backdropEl) close();
        });

        modalEl = doc.createElement('div');
        modalEl.className = 'ag-sag-pl-modal';
        modalEl.setAttribute('role', 'dialog');
        modalEl.setAttribute('aria-modal', 'true');
        modalEl.setAttribute('data-testid', MODAL_TESTID);
        modalEl.addEventListener('click', (ev) => ev?.stopPropagation?.());

        backdropEl.appendChild(modalEl);
        doc.body.appendChild(backdropEl);
      }
      return modalEl;
    }

    function removeModalShell() {
      try { backdropEl?.remove?.(); } catch {}
      backdropEl = modalEl = searchInputEl = null;
    }

    function renderVariableForm(container, item) {
      const vars = extractVariables(item.body);
      const wrap = doc.createElement('div');
      wrap.className = 'ag-sag-pl-form';
      wrap.setAttribute('data-testid', 'ag-sag-pl-var-form');

      const header = doc.createElement('div');
      header.className = 'ag-sag-pl-form-head';
      const title = doc.createElement('strong');
      title.textContent = item.title;
      const backBtn = doc.createElement('button');
      backBtn.type = 'button';
      backBtn.className = 'ag-sag-chip';
      backBtn.setAttribute('data-testid', 'ag-sag-pl-var-back');
      backBtn.textContent = t('plBackBtn', '← Back');
      backBtn.addEventListener('click', () => {
        activeVarItem = null;
        renderModal();
      });
      header.appendChild(title);
      header.appendChild(backBtn);
      wrap.appendChild(header);

      const preview = doc.createElement('pre');
      preview.className = 'ag-sag-pl-preview';
      preview.setAttribute('data-testid', 'ag-sag-pl-var-preview');
      const syncPreview = () => {
        preview.textContent = renderTemplate(item.body, varValues);
      };

      for (const v of vars) {
        const field = doc.createElement('label');
        field.className = 'ag-sag-pl-field';
        const lbl = doc.createElement('span');
        lbl.textContent = v.name;
        const inp = doc.createElement('input');
        inp.type = 'text';
        inp.className = 'ag-sag-search-input';
        inp.setAttribute('data-ag-sag-pl-var', v.name);
        inp.placeholder = v.defaultValue || `{{${v.name}}}`;
        const prefillSel =
          selectionContext && SELECTION_PREFILL_VAR_RE.test(v.name)
            ? selectionContext
            : '';
        const initVal = varValues[v.name] !== undefined ? varValues[v.name] : (prefillSel || v.defaultValue || '');
        varValues[v.name] = initVal;
        inp.value = initVal;
        inp.addEventListener('input', () => {
          varValues[v.name] = inp.value;
          syncPreview();
        });
        inp.addEventListener('keydown', (ev) => {
          if (ev?.isComposing || ev?.keyCode === 229) return;
          if (ev?.key === 'Enter') {
            ev.preventDefault?.();
            applySelectedItem(item);
          }
        });
        field.appendChild(lbl);
        field.appendChild(inp);
        wrap.appendChild(field);
      }

      syncPreview();
      wrap.appendChild(preview);

      const foot = doc.createElement('div');
      foot.className = 'ag-sag-pl-form-foot';
      const modeBtn = doc.createElement('button');
      modeBtn.type = 'button';
      modeBtn.className = 'ag-sag-chip';
      modeBtn.setAttribute('data-testid', 'ag-sag-pl-insert-mode');
      modeBtn.textContent = insertMode === 'append' ? t('plModeAppend', 'Mode: Append') : t('plModeReplace', 'Mode: Replace');
      modeBtn.addEventListener('click', () => {
        insertMode = insertMode === 'append' ? 'replace' : 'append';
        renderModal();
      });

      const confirmBtn = doc.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.className = 'ag-sag-chip';
      confirmBtn.setAttribute('aria-pressed', 'true');
      confirmBtn.setAttribute('data-testid', 'ag-sag-pl-var-insert');
      confirmBtn.textContent = t('plInsertBtn', 'Insert into Composer');
      confirmBtn.addEventListener('click', () => applySelectedItem(item));

      foot.appendChild(modeBtn);
      foot.appendChild(confirmBtn);
      wrap.appendChild(foot);
      container.appendChild(wrap);
    }

    function renderSnippetEditor(container) {
      const existing = editingSnippetId ? userSnippets.find((s) => s.id === editingSnippetId) : null;
      const wrap = doc.createElement('div');
      wrap.className = 'ag-sag-pl-form';
      wrap.setAttribute('data-testid', 'ag-sag-pl-editor');

      const head = doc.createElement('div');
      head.className = 'ag-sag-pl-form-head';
      const hTitle = doc.createElement('strong');
      hTitle.textContent = existing ? t('plEditSnippetTitle', 'Edit Snippet') : t('plNewSnippetTitle', 'New Snippet');
      const cancelBtn = doc.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'ag-sag-chip';
      cancelBtn.textContent = t('plBackBtn', '← Back');
      cancelBtn.addEventListener('click', () => {
        editorMode = false;
        editingSnippetId = null;
        renderModal();
      });
      head.appendChild(hTitle);
      head.appendChild(cancelBtn);
      wrap.appendChild(head);

      const titleInp = doc.createElement('input');
      titleInp.type = 'text';
      titleInp.className = 'ag-sag-search-input';
      titleInp.setAttribute('data-testid', 'ag-sag-pl-edit-title');
      titleInp.placeholder = t('plTitlePlaceholder', 'Snippet title');
      titleInp.value = existing?.title || '';

      const descInp = doc.createElement('input');
      descInp.type = 'text';
      descInp.className = 'ag-sag-search-input';
      descInp.setAttribute('data-testid', 'ag-sag-pl-edit-desc');
      descInp.placeholder = t('plDescPlaceholder', 'Short description (optional)');
      descInp.value = existing?.description || '';

      const tagsInp = doc.createElement('input');
      tagsInp.type = 'text';
      tagsInp.className = 'ag-sag-search-input';
      tagsInp.setAttribute('data-testid', 'ag-sag-pl-edit-tags');
      tagsInp.placeholder = t('plTagsPlaceholder', 'Tags separated by commas');
      tagsInp.value = (existing?.tags || []).join(', ');

      const bodyTa = doc.createElement('textarea');
      bodyTa.className = 'ag-sag-pack-textarea';
      bodyTa.setAttribute('data-testid', 'ag-sag-pl-edit-body');
      bodyTa.placeholder = t('plBodyPlaceholder', 'Prompt body, supports {{variable=default}}');
      bodyTa.value = existing?.body || '';

      const errEl = doc.createElement('div');
      errEl.className = 'ag-sag-pack-status';
      errEl.setAttribute('data-tone', 'error');
      errEl.hidden = true;

      const saveBtn = doc.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'ag-sag-chip';
      saveBtn.setAttribute('aria-pressed', 'true');
      saveBtn.setAttribute('data-testid', 'ag-sag-pl-edit-save');
      saveBtn.textContent = t('plSaveBtn', 'Save Snippet');
      saveBtn.addEventListener('click', () => {
        const res = saveSnippet({
          id: existing?.id,
          title: titleInp.value,
          description: descInp.value,
          tags: tagsInp.value.split(',').map((s) => s.trim()).filter(Boolean),
          body: bodyTa.value,
        });
        if (!res.ok) {
          errEl.textContent = res.error || 'Invalid snippet';
          errEl.hidden = false;
          return;
        }
        editorMode = false;
        editingSnippetId = null;
        activeFilter = 'user';
        renderModal();
      });

      wrap.appendChild(titleInp);
      wrap.appendChild(descInp);
      wrap.appendChild(tagsInp);
      wrap.appendChild(bodyTa);
      wrap.appendChild(errEl);
      const foot = doc.createElement('div');
      foot.className = 'ag-sag-pl-form-foot';
      foot.appendChild(saveBtn);
      wrap.appendChild(foot);
      container.appendChild(wrap);
    }

    function renderModal() {
      const m = ensureModalShell();
      if (!m || !backdropEl) return;
      backdropEl.hidden = !modalOpen;
      if (!modalOpen) return;

      const hadSearchFocus = doc.activeElement === searchInputEl;
      while (m.firstChild) m.removeChild(m.firstChild);

      // Header
      const head = doc.createElement('div');
      head.className = 'ag-sag-pl-head';
      const title = doc.createElement('strong');
      title.textContent = t('plPaletteTitle', 'Prompt Library');
      const headActs = doc.createElement('div');
      headActs.className = 'ag-sag-pl-head-acts';

      if (!editorMode && !activeVarItem) {
        const newBtn = doc.createElement('button');
        newBtn.type = 'button';
        newBtn.className = 'ag-sag-chip';
        newBtn.setAttribute('data-testid', 'ag-sag-pl-new-btn');
        newBtn.textContent = t('plNewBtn', '+ New');
        newBtn.addEventListener('click', () => {
          editorMode = true;
          editingSnippetId = null;
          renderModal();
        });
        headActs.appendChild(newBtn);
      }

      const closeBtn = doc.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'ag-sag-chip';
      closeBtn.setAttribute('data-testid', 'ag-sag-pl-close');
      closeBtn.textContent = t('drawerClose', 'Close');
      closeBtn.addEventListener('click', () => close());
      headActs.appendChild(closeBtn);

      head.appendChild(title);
      head.appendChild(headActs);
      m.appendChild(head);

      if (editorMode) {
        renderSnippetEditor(m);
        return;
      }

      if (activeVarItem) {
        renderVariableForm(m, activeVarItem);
        return;
      }

      // Search bar
      const searchWrap = doc.createElement('div');
      searchWrap.className = 'ag-sag-pl-search';
      const inp = doc.createElement('input');
      inp.type = 'search';
      inp.className = 'ag-sag-search-input';
      inp.setAttribute('data-testid', 'ag-sag-pl-search');
      inp.placeholder = t('plSearchPlaceholder', 'Search slash commands, templates, or snippets...');
      inp.value = queryText;
      inp.addEventListener('input', () => {
        queryText = inp.value;
        selectedIndex = 0;
        renderListArea(listHost);
      });
      searchInputEl = inp;
      searchWrap.appendChild(inp);
      m.appendChild(searchWrap);

      // Filter chips
      const tabsRow = doc.createElement('div');
      tabsRow.className = 'ag-sag-pl-tabs';
      const tabDefs = [
        ['all', t('plTabAll', 'All')],
        ['slash', t('plTabSlash', 'Slash')],
        ['builtin', t('plTabBuiltin', 'Templates')],
        ['user', `${t('plTabUser', 'Mine')} (${userSnippets.length})`],
        ['nov', `agy-NOV (${novTemplates.length})`],
      ];
      for (const [fid, flbl] of tabDefs) {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'ag-sag-chip';
        b.setAttribute('data-ag-sag-pl-tab', fid);
        b.setAttribute('aria-pressed', String(activeFilter === fid));
        b.textContent = flbl;
        b.addEventListener('click', () => {
          activeFilter = fid;
          selectedIndex = 0;
          renderModal();
        });
        tabsRow.appendChild(b);
      }
      m.appendChild(tabsRow);

      const listHost = doc.createElement('div');
      listHost.className = 'ag-sag-pl-list';
      listHost.setAttribute('data-testid', 'ag-sag-pl-list');
      renderListArea(listHost);
      m.appendChild(listHost);

      const foot = doc.createElement('div');
      foot.className = 'ag-sag-pl-foot';
      const hint = doc.createElement('span');
      hint.className = 'ag-sag-badge-note';
      hint.textContent = t('plFooterHint', '↑↓ Navigate · Enter Insert (never auto-sends) · Esc Close');
      foot.appendChild(hint);
      m.appendChild(foot);

      if (hadSearchFocus || !doc.activeElement || doc.activeElement === doc.body) {
        try { inp.focus?.(); } catch {}
      }
    }

    function renderListArea(listHost) {
      if (!listHost) return;
      while (listHost.firstChild) listHost.removeChild(listHost.firstChild);
      const items = getFilteredItems();
      if (items.length === 0) {
        const empty = doc.createElement('div');
        empty.className = 'ag-sag-badge-note';
        empty.setAttribute('data-testid', 'ag-sag-pl-empty');
        empty.textContent = t('plEmptyText', 'No matching prompts found');
        listHost.appendChild(empty);
        return;
      }
      if (selectedIndex >= items.length) selectedIndex = items.length - 1;
      if (selectedIndex < 0) selectedIndex = 0;

      const sourceLabels = {
        slash: t('plBadgeSlash', 'Slash'),
        builtin: t('plBadgeBuiltin', 'Template'),
        user: t('plBadgeUser', 'Mine'),
        nov: 'agy-NOV',
      };

      items.forEach((item, idx) => {
        const row = doc.createElement('div');
        row.className = 'ag-sag-pl-item';
        row.setAttribute('data-ag-sag-pl-item', item.id);
        row.setAttribute('data-source', item.source);
        row.setAttribute('data-selected', idx === selectedIndex ? '1' : '0');

        const mainBtn = doc.createElement('button');
        mainBtn.type = 'button';
        mainBtn.className = 'ag-sag-pl-item-main';
        mainBtn.addEventListener('click', () => applySelectedItem(item));

        const top = doc.createElement('div');
        top.className = 'ag-sag-pl-item-top';
        const nm = doc.createElement('span');
        nm.className = 'ag-sag-pl-item-title';
        nm.textContent = item.title;
        const badge = doc.createElement('span');
        badge.className = 'ag-sag-pl-badge';
        badge.setAttribute('data-source', item.source);
        badge.textContent = sourceLabels[item.source] || item.source;
        top.appendChild(nm);
        top.appendChild(badge);

        const vars = extractVariables(item.body);
        if (vars.length > 0) {
          const vBadge = doc.createElement('span');
          vBadge.className = 'ag-sag-pl-badge';
          vBadge.textContent = `{{${vars.length}}}`;
          top.appendChild(vBadge);
        }

        const desc = doc.createElement('div');
        desc.className = 'ag-sag-pl-item-desc';
        desc.textContent = item.description || item.body.slice(0, 100);

        mainBtn.appendChild(top);
        mainBtn.appendChild(desc);
        row.appendChild(mainBtn);

        if (item.source === 'user') {
          const acts = doc.createElement('div');
          acts.className = 'ag-sag-pl-item-acts';
          const editBtn = doc.createElement('button');
          editBtn.type = 'button';
          editBtn.className = 'ag-sag-chip';
          editBtn.setAttribute('data-ag-sag-pl-edit', item.id);
          editBtn.textContent = t('plEditBtn', 'Edit');
          editBtn.addEventListener('click', (ev) => {
            ev?.stopPropagation?.();
            editorMode = true;
            editingSnippetId = item.id;
            renderModal();
          });
          const delBtn = doc.createElement('button');
          delBtn.type = 'button';
          delBtn.className = 'ag-sag-chip';
          delBtn.setAttribute('data-risk', 'high');
          delBtn.setAttribute('data-ag-sag-pl-del', item.id);
          delBtn.textContent = t('plDeleteBtn', 'Delete');
          delBtn.addEventListener('click', (ev) => {
            ev?.stopPropagation?.();
            deleteSnippet(item.id);
          });
          acts.appendChild(editBtn);
          acts.appendChild(delBtn);
          row.appendChild(acts);
        }

        listHost.appendChild(row);
      });
    }

    let selectionContext = '';
    let selPillEl = null;
    let ctxMenuEl = null;
    let ctxToastEl = null;
    let ctxToastTimer = null;
    let extraListenersOff = [];

    function removeSelectionPill() {
      try { selPillEl?.remove?.(); } catch {}
      selPillEl = null;
    }

    function removeCtxToast() {
      if (ctxToastTimer) {
        clearTimeout(ctxToastTimer);
        ctxToastTimer = null;
      }
      try { ctxToastEl?.remove?.(); } catch {}
      ctxToastEl = null;
    }

    function showCtxToast(msg) {
      if (destroyed || !doc?.body || !msg) return;
      ensureStyle();
      removeCtxToast();
      const el = coexist?.markOwnedNoTranslate
        ? coexist.markOwnedNoTranslate(doc.createElement('div'))
        : doc.createElement('div');
      el.className = 'ag-sag-ctx-toast';
      el.setAttribute('data-testid', 'ag-sag-ctx-toast');
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.textContent = String(msg);
      doc.body.appendChild(el);
      ctxToastEl = el;
      ctxToastTimer = setTimeout(() => {
        ctxToastTimer = null;
        if (ctxToastEl === el) removeCtxToast();
      }, 2400);
      ctxToastTimer?.unref?.();
    }

    function insertSlashSafely(cmdText) {
      const scope = getScope();
      const existing = ctxSrc?.readComposerDraft ? String(ctxSrc.readComposerDraft(doc, scope) || '').trim() : '';
      const isBareSlashPlaceholder = BARE_SLASH_CMD_RE.test(existing);
      if (existing && !isBareSlashPlaceholder) {
        showCtxToast(t('plCtxDraftBusy', 'Composer has an unsent draft; send or clear it first'));
        return { ok: false, reason: 'draft-occupied' };
      }
      return insertIntoComposer(cmdText, 'replace');
    }

    function removeContextMenu() {
      try { ctxMenuEl?.remove?.(); } catch {}
      ctxMenuEl = null;
    }

    function hasPrismContextMenu() {
      if (win?.__agPrismBtwMenu || win?.__agPrismContextMenu) return true;
      if (doc?.documentElement?.hasAttribute?.('data-ag-cs-style')) return true;
      if (doc?.getElementById?.('ag-cs-settings-sec')) return true;
      if (doc?.querySelector?.('.ag-cs-ctx-menu, [data-ag-prism-ctx-menu="1"]')) return true;
      return false;
    }

    function isRecognizedFilePathText(raw) {
      const txt = String(raw || '').trim();
      if (txt.length < 3 || txt.length > 260) return false;
      if (/[\r\n<>|*?"]/.test(txt) || URL_SCHEME_RE.test(txt)) return false;
      return (
        WIN_DRIVE_PATH_RE.test(txt) ||
        WIN_UNC_PATH_RE.test(txt) ||
        WIN_REL_PATH_RE.test(txt) ||
        POSIX_EXT_PATH_RE.test(txt) ||
        POSIX_ROOTED_PATH_RE.test(txt)
      );
    }

    function formatAtFileRef(filePath) {
      const clean = String(filePath || '').trim();
      if (!clean) return '';
      return /\s/.test(clean) ? `@"${clean.replace(/"/g, '\\"')}"` : `@${clean}`;
    }

    function extractPathFromTarget(target) {
      if (!target || target.nodeType !== 1) return '';
      const attrPath =
        target.getAttribute?.('data-file-path') ||
        target.getAttribute?.('data-path') ||
        target.closest?.('[data-file-path]')?.getAttribute?.('data-file-path') ||
        '';
      if (attrPath && attrPath.length <= 260) return attrPath.trim();
      const tag = String(target.tagName || '').toUpperCase();
      if (tag === 'CODE' || tag === 'A' || tag === 'SPAN') {
        const txt = String(target.textContent || '').trim();
        if (isRecognizedFilePathText(txt)) {
          return txt;
        }
      }
      return '';
    }

    function getConversationSelectionText() {
      try {
        const sel = win?.getSelection?.();
        const text = String(sel?.toString?.() || '').trim();
        if (text.length < 4 || text.length > 4000) return '';
        const anchor = sel?.anchorNode;
        const el = anchor?.nodeType === 1 ? anchor : anchor?.parentElement;
        if (!el || isOwnedMutationNode(el) || isEditableTarget(el)) return '';
        if (typeof el.closest === 'function' && !el.closest('[data-testid="conversation-view"]')) return '';
        return text;
      } catch {
        return '';
      }
    }

    function showSelectionPill(selectedText, clientX = 0, clientY = 0) {
      if (destroyed || !enabled || !doc?.body || !selectedText) {
        removeSelectionPill();
        return;
      }
      ensureStyle();
      removeSelectionPill();
      const pill = coexist?.markOwnedNoTranslate
        ? coexist.markOwnedNoTranslate(doc.createElement('div'))
        : doc.createElement('div');
      pill.className = 'ag-sag-sel-pill';
      pill.setAttribute('data-testid', 'ag-sag-sel-pill');
      if (pill.style) {
        if (clientX > 0) pill.style.left = `${Math.max(12, clientX)}px`;
        if (clientY > 0) pill.style.top = `${Math.max(12, clientY - 36)}px`;
      }

      const quoteBtn = doc.createElement('button');
      quoteBtn.type = 'button';
      quoteBtn.className = 'ag-sag-code-btn';
      quoteBtn.setAttribute('data-ag-sag-sel-act', 'quote');
      quoteBtn.textContent = t('plSelQuoteBtn', 'Quote');
      quoteBtn.addEventListener('click', (ev) => {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
        const quoted = `> ${selectedText.replace(/\r?\n/g, '\n> ')}\n\n`;
        insertIntoComposer(quoted, 'append');
        removeSelectionPill();
      });

      const tplBtn = doc.createElement('button');
      tplBtn.type = 'button';
      tplBtn.className = 'ag-sag-code-btn';
      tplBtn.setAttribute('data-ag-sag-sel-act', 'template');
      tplBtn.textContent = t('plSelTplBtn', 'Use Template');
      tplBtn.addEventListener('click', (ev) => {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
        removeSelectionPill();
        open({ selection: selectedText });
      });

      pill.appendChild(quoteBtn);
      pill.appendChild(tplBtn);
      doc.body.appendChild(pill);
      selPillEl = pill;
    }

    function openContextMenu({ selection = '', filePath = '', allowQuickSlash = false, x = 0, y = 0 } = {}) {
      if (destroyed || !enabled || !doc?.body) return false;
      if (hasPrismContextMenu()) return false;
      if (!selection && !filePath && !allowQuickSlash) return false;
      ensureStyle();
      removeContextMenu();

      const menu = coexist?.markOwnedNoTranslate
        ? coexist.markOwnedNoTranslate(doc.createElement('div'))
        : doc.createElement('div');
      menu.className = 'ag-sag-ctx-menu';
      menu.setAttribute('data-testid', 'ag-sag-ctx-menu');
      menu.setAttribute('role', 'menu');
      const vw = Number(win?.innerWidth) || 0;
      const vh = Number(win?.innerHeight) || 0;
      const estW = 228;
      const estH = 220;
      const clampedX = vw > estW + 16 ? Math.min(Math.max(8, x), vw - estW - 8) : Math.max(8, x);
      const clampedY = vh > estH + 16 ? Math.min(Math.max(8, y), vh - estH - 8) : Math.max(8, y);
      if (menu.style) {
        menu.style.left = `${clampedX}px`;
        menu.style.top = `${clampedY}px`;
      }

      const addItem = (label, act, fn) => {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'ag-sag-ctx-item';
        b.setAttribute('role', 'menuitem');
        b.setAttribute('data-ag-sag-ctx-act', act);
        b.textContent = label;
        b.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          removeContextMenu();
          fn();
        });
        menu.appendChild(b);
      };

      const copyText = (txt) => {
        const onCopyFail = () => {
          showCtxToast(t('plCtxCopyFailed', 'Copy failed: clipboard unavailable'));
        };
        try {
          if (typeof options.onCopyText === 'function') {
            const res = options.onCopyText(txt);
            if (res === false) {
              onCopyFail();
            } else if (res && typeof res.then === 'function') {
              res.then((v) => {
                if (v === false) onCopyFail();
              }, onCopyFail);
            }
            return;
          }
          const writeFn = win?.navigator?.clipboard?.writeText;
          if (typeof writeFn !== 'function') {
            onCopyFail();
            return;
          }
          const p = writeFn.call(win.navigator.clipboard, txt);
          if (p && typeof p.then === 'function') {
            p.then(undefined, onCopyFail);
          }
        } catch {
          onCopyFail();
        }
      };

      if (selection) {
        addItem(t('plCtxCopySel', 'Copy selection'), 'copy-sel', () => copyText(selection));
        addItem(t('plCtxQuoteSel', 'Quote into composer'), 'quote-sel', () => {
          insertIntoComposer(`> ${selection.replace(/\r?\n/g, '\n> ')}\n\n`, 'append');
        });
        addItem(t('plCtxBtw', '/btw Ask quick side question'), 'btw-sel', () => {
          const brief = selection.replace(/\s+/g, ' ').trim().slice(0, 160);
          insertSlashSafely(`/btw ${brief} `);
        });
        addItem(t('plCtxPlan', '/plan Switch to planning mode'), 'plan-sel', () => {
          const brief = selection.replace(/\s+/g, ' ').trim().slice(0, 160);
          insertSlashSafely(`/plan ${brief} `);
        });
        addItem(t('plCtxUseTpl', 'Fill into Prompt Template…'), 'tpl-sel', () => {
          open({ selection });
        });
        addItem(t('plCtxCompactFocus', 'Fill /compact focusing on this'), 'compact-sel', () => {
          const brief = selection.replace(/\s+/g, ' ').trim().slice(0, 140);
          insertSlashSafely(`/compact Focus on: ${brief}`);
        });
      } else if (allowQuickSlash) {
        addItem(t('plCtxBtw', '/btw Ask quick side question'), 'btw-quick', () => {
          insertSlashSafely('/btw ');
        });
        addItem(t('plCtxPlan', '/plan Switch to planning mode'), 'plan-quick', () => {
          insertSlashSafely('/plan ');
        });
        addItem(t('plCtxOpenPalette', 'Open Prompt Library…'), 'open-palette', () => {
          open();
        });
      }
      if (filePath) {
        addItem(t('plCtxCopyPath', 'Copy file path'), 'copy-path', () => copyText(filePath));
        addItem(t('plCtxInsertAt', 'Insert @file reference'), 'insert-at', () => {
          const ref = formatAtFileRef(filePath);
          if (ref) insertIntoComposer(`${ref} `, 'append');
        });
      }

      doc.body.appendChild(menu);
      ctxMenuEl = menu;
      return true;
    }

    function open(openOpts = {}) {
      if (destroyed || !enabled) return false;
      selectionContext = typeof openOpts?.selection === 'string' ? openOpts.selection.trim().slice(0, 1200) : '';
      modalOpen = true;
      activeVarItem = null;
      editorMode = false;
      editingSnippetId = null;
      insertMode = 'append';
      selectedIndex = 0;
      removeSelectionPill();
      removeContextMenu();
      removeCtxToast();
      renderModal();
      void refreshNovTemplates();
      return true;
    }

    function close() {
      modalOpen = false;
      activeVarItem = null;
      editorMode = false;
      editingSnippetId = null;
      selectionContext = '';
      if (backdropEl) backdropEl.hidden = true;
    }

    function toggle() {
      if (modalOpen) close();
      else open();
    }

    function onKeyDown(ev) {
      if (destroyed || !enabled) return;
      const key = String(ev?.key || '');
      const code = String(ev?.code || '');
      const isPaletteChord =
        Boolean((ev?.ctrlKey || ev?.metaKey) && ev?.altKey && !ev?.shiftKey) &&
        (key.toLowerCase() === 'p' || code === 'KeyP');

      if (isPaletteChord) {
        ev.preventDefault?.();
        ev.stopPropagation?.();
        toggle();
        return;
      }

      if (!modalOpen) return;

      if (key === 'Escape') {
        ev.preventDefault?.();
        ev.stopPropagation?.();
        if (activeVarItem) {
          activeVarItem = null;
          renderModal();
        } else if (editorMode) {
          editorMode = false;
          editingSnippetId = null;
          renderModal();
        } else {
          close();
        }
        return;
      }

      if (activeVarItem || editorMode) return;

      const items = getFilteredItems();
      if (key === 'ArrowDown' && items.length > 0) {
        ev.preventDefault?.();
        selectedIndex = (selectedIndex + 1) % items.length;
        const host = modalEl?.querySelector?.('[data-testid="ag-sag-pl-list"]');
        renderListArea(host);
      } else if (key === 'ArrowUp' && items.length > 0) {
        ev.preventDefault?.();
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        const host = modalEl?.querySelector?.('[data-testid="ag-sag-pl-list"]');
        renderListArea(host);
      } else if (key === 'Enter' && items.length > 0 && (!isEditableTarget(ev?.target) || ev?.target === searchInputEl)) {
        if (ev?.isComposing || ev?.keyCode === 229) return;
        ev.preventDefault?.();
        applySelectedItem(items[selectedIndex]);
      }
    }

    function isOwnedMutationNode(node) {
      if (!node || node.nodeType !== 1) return false;
      if (node.getAttribute?.('data-ag-sg-owned') === '1' || node.getAttribute?.('data-ag-sag-owned') === '1') return true;
      if (node.closest?.('[data-ag-sg-owned="1"], [data-ag-sag-owned="1"]')) return true;
      return false;
    }

    function scheduleEnsureTrigger() {
      if (observerTimer || destroyed || !enabled) return;
      observerTimer = setTimeout(() => {
        observerTimer = null;
        if (destroyed || !enabled) return;
        if (coexist?.isWindowHibernated?.(doc, win, false)) return;
        ensureTrigger();
      }, 60);
      observerTimer?.unref?.();
    }

    function attachListeners() {
      if (!doc || keydownOff) return;
      doc.addEventListener?.('keydown', onKeyDown, true);
      keydownOff = () => doc.removeEventListener?.('keydown', onKeyDown, true);

      const onInputTrigger = (ev) => {
        if (destroyed || !enabled || modalOpen) return;
        const target = ev?.target;
        if (!target || !isEditableTarget(target) || isOwnedMutationNode(target)) return;
        const ed = ctxSrc?.findComposerEditor ? ctxSrc.findComposerEditor(doc, getScope()) : null;
        if (ed && target !== ed && !ed.contains?.(target)) return;
        const val = String(ctxSrc?.readComposerDraft ? ctxSrc.readComposerDraft(doc, getScope()) : target.value || '').trim();
        if (val === '//') {
          if (ed && (String(ed.tagName || '').toUpperCase() === 'TEXTAREA' || String(ed.tagName || '').toUpperCase() === 'INPUT')) {
            ed.value = '';
          } else {
            insertIntoComposer('', { mode: 'replace' });
          }
          open();
        }
      };

      const onMouseUp = (ev) => {
        if (destroyed || !enabled || modalOpen) return;
        if (isOwnedMutationNode(ev?.target)) return;
        removeContextMenu();
        const selText = getConversationSelectionText();
        if (selText) {
          showSelectionPill(selText, Number(ev?.clientX) || 0, Number(ev?.clientY) || 0);
        } else {
          removeSelectionPill();
        }
      };

      const onDocClick = (ev) => {
        if (ctxMenuEl && !isOwnedMutationNode(ev?.target)) removeContextMenu();
        if (selPillEl && !isOwnedMutationNode(ev?.target)) {
          if (!getConversationSelectionText()) removeSelectionPill();
        }
      };

      const onContextMenu = (ev) => {
        if (destroyed || !enabled || !ev) return;
        if (hasPrismContextMenu()) return;
        // Shift+Right-Click or right-clicking while menu is already open yields cleanly to native menu
        if (ev.shiftKey || ctxMenuEl) {
          removeContextMenu();
          return;
        }
        const target = ev.target;
        if (!target || isOwnedMutationNode(target) || isEditableTarget(target)) return;
        if (typeof target.closest === 'function' && !target.closest('[data-testid="conversation-view"]')) return;
        const filePath = extractPathFromTarget(target);
        if (
          !filePath &&
          typeof target.closest === 'function' &&
          target.closest('a[href], button, [role="button"], img, video, audio, canvas, iframe, [role="dialog"], [role="menu"]')
        ) {
          return;
        }
        const selText = getConversationSelectionText();
        if (openContextMenu({ selection: selText, filePath, allowQuickSlash: true, x: Number(ev.clientX) || 0, y: Number(ev.clientY) || 0 })) {
          ev.preventDefault?.();
          ev.stopPropagation?.();
        }
      };

      const addDocL = (evName, fn, cap = false) => {
        doc.addEventListener?.(evName, fn, cap);
        extraListenersOff.push(() => doc.removeEventListener?.(evName, fn, cap));
      };
      addDocL('input', onInputTrigger, true);
      addDocL('mouseup', onMouseUp, false);
      addDocL('click', onDocClick, true);
      addDocL('contextmenu', onContextMenu, false);

      if (options.autoObserve !== false && typeof win?.MutationObserver === 'function' && doc.body) {
        domObserver = new win.MutationObserver((records) => {
          if (!enabled || destroyed) return;
          if (coexist?.isWindowHibernated?.(doc, win, false)) return;
          if (Array.isArray(records) && records.length > 0) {
            const hasExternal = records.some((rec) => {
              if (!isOwnedMutationNode(rec?.target)) {
                const added = Array.from(rec?.addedNodes || []);
                const removed = Array.from(rec?.removedNodes || []);
                const allOwned =
                  (added.length > 0 || removed.length > 0) &&
                  added.every(isOwnedMutationNode) &&
                  removed.every(isOwnedMutationNode);
                return !allOwned;
              }
              return false;
            });
            if (!hasExternal) return;
          }
          scheduleEnsureTrigger();
        });
        try {
          domObserver.observe(doc.body, { childList: true, subtree: true });
        } catch {}
      }
    }

    function detachListeners() {
      if (observerTimer) {
        clearTimeout(observerTimer);
        observerTimer = null;
      }
      if (keydownOff) {
        try { keydownOff(); } catch {}
        keydownOff = null;
      }
      while (extraListenersOff.length) {
        try { extraListenersOff.pop()(); } catch {}
      }
      removeSelectionPill();
      removeContextMenu();
      removeCtxToast();
      if (domObserver) {
        try { domObserver.disconnect(); } catch {}
        domObserver = null;
      }
    }

    function setEnabled(next) {
      if (destroyed) return;
      const val = Boolean(next);
      if (val === enabled) {
        if (enabled) ensureTrigger();
        return;
      }
      enabled = val;
      if (enabled) {
        attachListeners();
        ensureTrigger();
      } else {
        close();
        detachListeners();
        removeTrigger();
        removeModalShell();
      }
      notifyChanged();
    }

    function sync() {
      if (destroyed) return;
      if (enabled) {
        ensureTrigger();
        if (modalOpen) renderModal();
      } else {
        removeTrigger();
      }
    }

    function getDebugState() {
      return {
        enabled,
        destroyed,
        modalOpen,
        triggerMounted: Boolean(triggerBtn && triggerBtn.isConnected !== false),
        userSnippetCount: userSnippets.length,
        builtinCount: BUILTIN_TEMPLATES.length,
        slashCount: BUILTIN_SLASH_ITEMS.length,
        novTemplateCount: novTemplates.length,
        activeFilter,
        insertMode,
      };
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      enabled = false;
      close();
      removeCtxToast();
      detachListeners();
      removeTrigger();
      removeModalShell();
      try { createdStyleEl?.remove?.(); } catch {}
      createdStyleEl = null;
      activePaneEl = null;
    }

    if (enabled) {
      attachListeners();
      ensureTrigger();
    }

    return {
      open,
      close,
      toggle,
      sync,
      setEnabled,
      getSnippets: () => userSnippets.map((s) => ({ ...s })),
      saveSnippet,
      deleteSnippet,
      exportSnippetsJson,
      importSnippetsJson,
      setNovTemplates,
      refreshNovTemplates,
      insertIntoComposer,
      openContextMenu,
      getDebugState,
      destroy,
    };
  }

  return {
    STORAGE_KEY,
    TRIGGER_TESTID,
    BACKDROP_TESTID,
    MODAL_TESTID,
    MAX_SNIPPETS,
    MAX_IMPORT_BYTES,
    BUILTIN_SLASH_ITEMS,
    BUILTIN_TEMPLATES,
    extractVariables,
    renderTemplate,
    sanitizeSnippet,
    sanitizeImportedSnippets,
    sanitizeNovTemplates,
    createPromptLibraryController,
  };
});
