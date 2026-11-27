// agy-Sag — Clean Slate (/clear & Same-Project Fresh Restart, UMD, zero runtime deps)
// Since Antigravity trajectories are append-only per cascadeId, a true zero-bloat /clear opens a fresh
// conversation in the SAME project (0% context, 0 old images, 0 tool logs, minimal token cache) and
// optionally carries over an ultra-compact pure-text brief (<= 1200 chars, secrets & code blocks stripped).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSgCleanSlate = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  const PENDING_CLEAR_KEY = 'agSag.pendingClear.v1';
  const PENDING_TTL_MS = 45 * 1000;
  const MAX_BRIEF_CHARS = 1200;

  function resolveDep(globalKey, relPath) {
    if (globalRoot && globalRoot[globalKey]) return globalRoot[globalKey];
    if (typeof require === 'function') return require(relPath);
    return null;
  }

  function parseClearCommand(rawText) {
    const trimmed = String(rawText || '').replace(/\u200B/g, '').trim();
    const m = trimmed.match(/^\/clear(?:\s+([\s\S]+))?$/i);
    if (!m) return null;
    const arg = (m[1] || '').trim();
    if (!arg) return { mode: 'keep', focus: '' };
    if (/^(?:blank|empty|reset|空白)$/i.test(arg)) {
      return { mode: 'blank', focus: '' };
    }
    if (/^(?:keep|brief|continue|续接|保留)$/i.test(arg)) {
      return { mode: 'keep', focus: '' };
    }
    return { mode: 'keep', focus: arg.slice(0, 240) };
  }

  function stripCodeAndNoise(raw, maxLen = 180, exporter = null) {
    let text = String(raw || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`]{60,}`/g, ' ');
    if (exporter?.redactSecrets) text = exporter.redactSecrets(text);
    text = text.replace(/\s+/g, ' ').trim();
    if (text.length <= maxLen) return text;
    return `${text.slice(0, maxLen).trimEnd()}…`;
  }

  function buildCleanRestartBrief({ turns = [], bookmarks = null, focus = '', strings = null } = {}) {
    const i18n = resolveDep('__agSgI18n', './i18n.js');
    const exporter = resolveDep('__agSgPrecompactExport', './precompact-export.js');
    const S = strings || i18n?.getStrings?.('zh-CN') || {
      clearBriefHeader: '[Clean Context Continue] Fresh session with minimal context only (no prior images/logs):',
      clearBriefGoal: 'Goal',
      clearBriefKey: 'Key Context',
      clearBriefNext: 'Next Focus',
    };

    const list = Array.isArray(turns) ? turns.filter((t) => t && (t.user || t.assistant)) : [];
    const safeFocus = stripCodeAndNoise(focus, 240, exporter);
    if (list.length === 0 && !safeFocus) return '';

    const bmSet =
      bookmarks instanceof Set
        ? bookmarks
        : Array.isArray(bookmarks)
          ? new Set(bookmarks.map((n) => Number(n)))
          : new Set();

    const lines = [S.clearBriefHeader];
    if (list.length > 0) {
      const goal = stripCodeAndNoise(list[0].user || list[0].assistant || '', 160, exporter);
      if (goal) lines.push(`- ${S.clearBriefGoal}: ${goal}`);

      const starred = list.filter((t) => bmSet.has(t.turnNum)).slice(-3);
      const picked = starred.length > 0 ? starred : list.slice(-2);
      const keyPoints = [];
      for (const t of picked) {
        const u = stripCodeAndNoise(t.user || '', 110, exporter);
        const a = stripCodeAndNoise(t.assistant || '', 150, exporter);
        const seg = u && a ? `${u} → ${a}` : a || u;
        if (seg) keyPoints.push(seg);
      }
      if (keyPoints.length > 0) {
        lines.push(`- ${S.clearBriefKey}: ${keyPoints.join(' | ')}`);
      }
    }
    if (safeFocus) {
      lines.push(`- ${S.clearBriefNext}: ${safeFocus}`);
    }

    const joined = lines.join('\n').trim();
    if (joined.length <= MAX_BRIEF_CHARS) return joined;
    return `${joined.slice(0, MAX_BRIEF_CHARS).trimEnd()}…`;
  }

  function extractProjectId(win) {
    try {
      const search = String(win?.location?.search || '');
      const m = search.match(/[?&]project=([^&]+)/i);
      return m && m[1] ? decodeURIComponent(m[1]) : '';
    } catch {
      return '';
    }
  }

  function findNewConversationTrigger(doc, win) {
    if (!doc || typeof doc.querySelector !== 'function') return null;
    const projectId = extractProjectId(win);
    if (projectId && typeof doc.querySelectorAll === 'function') {
      const links = Array.from(doc.querySelectorAll('a') || []);
      const exact = links.find((a) => {
        const href = String(a.getAttribute?.('href') || '');
        return href.includes(`project=${encodeURIComponent(projectId)}`) || href.includes(`project=${projectId}`);
      });
      if (exact) return { el: exact, kind: 'project-link', projectId };
    }
    const generic = doc.querySelector('[data-testid="new-conversation-button"]');
    if (generic) return { el: generic, kind: 'global-new-button', projectId };
    return null;
  }

  function savePendingClear(storage, payload, nowTs = Date.now()) {
    if (!storage || !payload) return false;
    try {
      storage.setItem(PENDING_CLEAR_KEY, JSON.stringify({ ...payload, createdAtMs: nowTs }));
      return true;
    } catch {
      return false;
    }
  }

  function consumePendingClear(storage, currentCascadeId = '', currentProjectId = '', nowTs = Date.now()) {
    if (!storage) return null;
    try {
      const raw = storage.getItem(PENDING_CLEAR_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        storage.removeItem(PENDING_CLEAR_KEY);
        return null;
      }
      if (nowTs - (Number(parsed.createdAtMs) || 0) > PENDING_TTL_MS) {
        storage.removeItem(PENDING_CLEAR_KEY);
        return null;
      }
      // Do not consume while still sitting on the old conversation that triggered /clear
      if (parsed.fromCascadeId && currentCascadeId && parsed.fromCascadeId === currentCascadeId) {
        return null;
      }
      if (parsed.projectId && currentProjectId && parsed.projectId !== currentProjectId) {
        return null;
      }
      storage.removeItem(PENDING_CLEAR_KEY);
      return parsed;
    } catch {
      try { storage.removeItem(PENDING_CLEAR_KEY); } catch {}
      return null;
    }
  }

  function createCleanSlateController(options = {}) {
    const win = options.win || globalRoot;
    const doc = options.doc || win?.document || null;
    const storage = options.storage !== undefined ? options.storage : win?.localStorage || null;
    const ctxSrc = options.contextSource || resolveDep('__agSgContextSource', './context-source.js');
    const exporter = options.exporter || resolveDep('__agSgPrecompactExport', './precompact-export.js');
    const draftMod = options.draftGuardMod || resolveDep('__agSgDraftGuard', './draft-guard.js');
    const i18n = options.i18n || resolveDep('__agSgI18n', './i18n.js');
    const nowFn = typeof options.now === 'function' ? options.now : () => Date.now();

    let destroyed = false;
    let applyTimer = null;
    const listeners = [];

    const getLang = () => (typeof options.getLang === 'function' ? i18n.normalizeLang(options.getLang()) : i18n.detectLang(doc, win));
    const S = () => i18n.getStrings(getLang());

    function writeEditor(text) {
      const ed = ctxSrc.findComposerEditor(doc);
      if (!ed) return false;
      try {
        ed.focus?.();
        const tag = String(ed.tagName || '').toUpperCase();
        if (tag === 'TEXTAREA' || tag === 'INPUT') {
          ed.value = text;
          ed.dispatchEvent?.(new (win.Event || Event)('input', { bubbles: true }));
        } else if (typeof doc.execCommand === 'function' && doc.execCommand('insertText', false, text)) {
          // inserted via execCommand
        } else {
          ed.textContent = text;
          ed.dispatchEvent?.(new (win.Event || Event)('input', { bubbles: true }));
        }
        return true;
      } catch {
        return false;
      }
    }

    function clearEditor() {
      const ed = ctxSrc.findComposerEditor(doc);
      if (!ed) return;
      try {
        const tag = String(ed.tagName || '').toUpperCase();
        if (tag === 'TEXTAREA' || tag === 'INPUT') {
          ed.value = '';
          ed.dispatchEvent?.(new (win.Event || Event)('input', { bubbles: true }));
        } else {
          ed.textContent = '';
          ed.dispatchEvent?.(new (win.Event || Event)('input', { bubbles: true }));
        }
      } catch {}
    }

    function applyPendingIfReady() {
      if (destroyed || !doc) return false;
      const cid = ctxSrc.detectCascadeId(doc, win);
      const pid = extractProjectId(win);
      const existingDraft = ctxSrc.readComposerDraft(doc);
      if (existingDraft) return false;

      const pending = consumePendingClear(storage, cid, pid, nowFn());
      if (!pending) return false;

      if (pending.brief) {
        const ok = writeEditor(pending.brief);
        if (ok && typeof options.onCleanRestartApplied === 'function') {
          try { options.onCleanRestartApplied(pending); } catch {}
        }
        return ok;
      }
      return true;
    }

    function schedulePendingApply() {
      if (applyTimer) {
        clearTimeout(applyTimer);
        applyTimer = null;
      }
      let attempts = 0;
      const step = () => {
        if (destroyed) return;
        if (applyPendingIfReady()) return;
        attempts += 1;
        if (attempts < 12) {
          applyTimer = setTimeout(step, 180);
          applyTimer?.unref?.();
        }
      };
      applyTimer = setTimeout(step, 120);
      applyTimer?.unref?.();
    }

    function triggerCleanClear({ mode = 'keep', focus = '' } = {}) {
      if (destroyed || !doc) return { ok: false, reason: 'destroyed' };
      if (ctxSrc.isTurnStreaming(doc)) {
        return { ok: false, reason: 'streaming' };
      }

      const scope = ctxSrc.resolveActivePaneScope ? ctxSrc.resolveActivePaneScope(doc) : doc;
      const fromCid = ctxSrc.detectCascadeId(doc, win, scope);
      const projectId = extractProjectId(win);
      let brief = '';

      if (mode === 'keep') {
        const turns = exporter?.extractConversationTurns?.(doc, scope) || [];
        const bm = exporter?.loadBookmarks?.(storage, fromCid) || new Set();
        brief = buildCleanRestartBrief({ turns, bookmarks: bm, focus, strings: S() });
      }

      // Clear any saved draft on the old session (e.g. "/clear") so it won't re-prompt
      draftMod?.clearDraft?.(storage, fromCid);
      clearEditor();

      if (brief) {
        savePendingClear(storage, { mode, fromCascadeId: fromCid, projectId, brief }, nowFn());
      }

      const trigger = findNewConversationTrigger(doc, win);
      if (typeof options.onNavigateNewConversation === 'function') {
        options.onNavigateNewConversation({ mode, fromCascadeId: fromCid, projectId, brief, triggerKind: trigger?.kind || 'callback' });
      } else if (trigger?.el && typeof trigger.el.click === 'function') {
        trigger.el.click();
      } else if (win?.location && typeof win.location.assign === 'function') {
        const url = projectId ? `/?project=${encodeURIComponent(projectId)}` : '/';
        win.location.assign(url);
      } else {
        return { ok: false, reason: 'no-new-trigger', brief };
      }

      if (brief) schedulePendingApply();
      if (typeof options.onClearTriggered === 'function') {
        try { options.onClearTriggered({ mode, fromCascadeId: fromCid, projectId, brief }); } catch {}
      }
      return { ok: true, mode, fromCascadeId: fromCid, projectId, brief, triggerKind: trigger?.kind || 'navigate' };
    }

    const onKeyDown = (ev) => {
      if (destroyed || !ev) return;
      if (ev.key !== 'Enter' || ev.shiftKey || ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing) return;
      const draft = ctxSrc.readComposerDraft(doc);
      const parsed = parseClearCommand(draft);
      if (!parsed) return;
      ev.preventDefault?.();
      ev.stopPropagation?.();
      ev.stopImmediatePropagation?.();
      triggerCleanClear(parsed);
    };

    const onSendClick = (ev) => {
      if (destroyed || !ev?.target) return;
      const btn = ev.target.closest?.(
        '[data-testid="input-send-button"], [data-testid="send-button"], button[type="submit"]'
      );
      if (!btn) return;
      const draft = ctxSrc.readComposerDraft(doc);
      const parsed = parseClearCommand(draft);
      if (!parsed) return;
      ev.preventDefault?.();
      ev.stopPropagation?.();
      ev.stopImmediatePropagation?.();
      triggerCleanClear(parsed);
    };

    if (doc && typeof doc.addEventListener === 'function') {
      doc.addEventListener('keydown', onKeyDown, true);
      doc.addEventListener('click', onSendClick, true);
      listeners.push(() => doc.removeEventListener?.('keydown', onKeyDown, true));
      listeners.push(() => doc.removeEventListener?.('click', onSendClick, true));
    }

    function sync() {
      if (destroyed) return;
      applyPendingIfReady();
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      if (applyTimer) {
        clearTimeout(applyTimer);
        applyTimer = null;
      }
      while (listeners.length) {
        try { listeners.pop()(); } catch {}
      }
    }

    // Attempt immediate apply on mount in case a full page reload just completed after /clear keep
    applyPendingIfReady();

    return {
      sync,
      triggerCleanClear,
      applyPendingIfReady,
      getDebugState: () => ({
        destroyed,
        projectId: extractProjectId(win),
        hasPendingClear: Boolean(storage?.getItem?.(PENDING_CLEAR_KEY)),
      }),
      destroy,
    };
  }

  return {
    PENDING_CLEAR_KEY,
    MAX_BRIEF_CHARS,
    parseClearCommand,
    buildCleanRestartBrief,
    extractProjectId,
    findNewConversationTrigger,
    savePendingClear,
    consumePendingClear,
    createCleanSlateController,
  };
});
