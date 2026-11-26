// Antigravity Session Guard — Composer Draft Auto-Save & Crash/Switch Recovery (UMD, zero runtime deps)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSgDraftGuard = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  const DRAFT_STORAGE_PREFIX = 'agSessionGuard.draft.v1:';
  const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  const MAX_DRAFT_CHARS = 16000;
  const MIN_DRAFT_CHARS = 2;

  function resolveDep(globalKey, relPath) {
    if (globalRoot && globalRoot[globalKey]) return globalRoot[globalKey];
    if (typeof require === 'function') return require(relPath);
    return null;
  }

  function storageKeys(storage) {
    if (!storage) return [];
    if (typeof storage.length === 'number' && typeof storage.key === 'function') {
      const out = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (typeof k === 'string') out.push(k);
      }
      return out;
    }
    if (typeof storage.keys === 'function') {
      try { return Array.from(storage.keys()).filter((k) => typeof k === 'string'); } catch {}
    }
    try { return Object.keys(storage); } catch { return []; }
  }

  function isSaveableDraft(text) {
    const cleaned = String(text || '').replace(/\u200B/g, '').trim();
    if (cleaned.length < MIN_DRAFT_CHARS) return false;
    // Do not cache transient /compact commands as unsent user drafts
    if (/^\/compact(?:\s|$)/i.test(cleaned)) return false;
    return true;
  }

  function loadDraft(storage, cascadeId, nowTs = Date.now()) {
    if (!storage || !cascadeId) return null;
    try {
      const raw = storage.getItem(DRAFT_STORAGE_PREFIX + cascadeId);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || typeof parsed.text !== 'string') return null;
      if (!isSaveableDraft(parsed.text)) return null;
      const savedAtMs = Number(parsed.savedAtMs) || Date.parse(parsed.savedAt || '') || 0;
      if (savedAtMs > 0 && nowTs - savedAtMs > DRAFT_TTL_MS) {
        try { storage.removeItem(DRAFT_STORAGE_PREFIX + cascadeId); } catch {}
        return null;
      }
      return {
        cascadeId,
        text: parsed.text,
        charCount: parsed.text.length,
        savedAt: parsed.savedAt || new Date(savedAtMs || nowTs).toISOString(),
        savedAtMs: savedAtMs || nowTs,
      };
    } catch {
      return null;
    }
  }

  function saveDraft(storage, cascadeId, text, nowTs = Date.now()) {
    if (!storage || !cascadeId) return null;
    const normalized = String(text || '').replace(/\u200B/g, '').trim();
    if (!isSaveableDraft(normalized)) return null;
    const clipped = normalized.length > MAX_DRAFT_CHARS ? normalized.slice(0, MAX_DRAFT_CHARS) : normalized;
    const payload = {
      cascadeId,
      text: clipped,
      charCount: clipped.length,
      savedAt: new Date(nowTs).toISOString(),
      savedAtMs: nowTs,
    };
    try {
      storage.setItem(DRAFT_STORAGE_PREFIX + cascadeId, JSON.stringify(payload));
      return payload;
    } catch {
      return null;
    }
  }

  function clearDraft(storage, cascadeId) {
    if (!storage || !cascadeId) return false;
    try {
      storage.removeItem(DRAFT_STORAGE_PREFIX + cascadeId);
      return true;
    } catch {
      return false;
    }
  }

  function listSavedDrafts(storage, nowTs = Date.now()) {
    if (!storage) return [];
    const drafts = [];
    for (const k of storageKeys(storage)) {
      if (!k.startsWith(DRAFT_STORAGE_PREFIX)) continue;
      const cid = k.slice(DRAFT_STORAGE_PREFIX.length);
      const d = loadDraft(storage, cid, nowTs);
      if (d) drafts.push(d);
    }
    drafts.sort((a, b) => (b.savedAtMs || 0) - (a.savedAtMs || 0));
    return drafts;
  }

  function pruneExpiredDrafts(storage, nowTs = Date.now()) {
    if (!storage) return 0;
    let removed = 0;
    for (const k of storageKeys(storage)) {
      if (!k.startsWith(DRAFT_STORAGE_PREFIX)) continue;
      const cid = k.slice(DRAFT_STORAGE_PREFIX.length);
      const before = storage.getItem(k);
      const loaded = loadDraft(storage, cid, nowTs);
      if (before && !loaded) {
        try { storage.removeItem(k); } catch {}
        removed += 1;
      }
    }
    return removed;
  }

  function createDraftGuardController(options = {}) {
    const win = options.win || globalRoot;
    const doc = options.doc || win?.document || null;
    const storage = options.storage !== undefined ? options.storage : win?.localStorage || null;
    const coexist = options.coexist || resolveDep('__agSgCoexist', './coexist.js');
    const ctxSrc = options.contextSource || resolveDep('__agSgContextSource', './context-source.js');
    const exporter = options.exporter || resolveDep('__agSgPrecompactExport', './precompact-export.js');
    const i18n = options.i18n || resolveDep('__agSgI18n', './i18n.js');
    const styles = options.styles || resolveDep('__agSgStyles', './styles.js');
    const nowFn = typeof options.now === 'function' ? options.now : () => Date.now();
    const debounceMs = Math.max(0, Number(options.debounceMs ?? 450));

    let enabled = options.enabled !== undefined ? Boolean(options.enabled) : true;
    let destroyed = false;
    let activePaneEl = null;
    let currentCid = '';
    let lastLiveDraftByCid = new Map();
    let lastTurnCountByCid = new Map();
    let dismissedCids = new Set();
    let saveTimer = null;
    let boundEditor = null;
    let boundEditorOff = null;
    let barEl = null;
    let msgEl = null;
    let restoreBtn = null;
    let discardBtn = null;
    let createdStyleEl = null;
    const listeners = [];

    const getLang = () => (typeof options.getLang === 'function' ? i18n.normalizeLang(options.getLang()) : i18n.detectLang(doc, win));
    const S = () => i18n.getStrings(getLang());
    const getScope = () => (ctxSrc.resolveActivePaneScope ? ctxSrc.resolveActivePaneScope(doc, activePaneEl) : doc);

    function ensureStyle() {
      if (!doc || !styles) return;
      if (doc.getElementById?.(styles.STYLE_ID)) return;
      const el = doc.createElement('style');
      el.id = styles.STYLE_ID;
      el.textContent = styles.CORE_CSS;
      coexist.markOwnedNoTranslate(el);
      (doc.head || doc.documentElement || doc.body)?.appendChild?.(el);
      createdStyleEl = el;
    }

    function countUserTurns(scope) {
      const conv = ctxSrc.resolveActiveConversationView ? ctxSrc.resolveActiveConversationView(doc, scope) : doc?.querySelector?.('[data-testid="conversation-view"]');
      if (!conv || typeof conv.querySelectorAll !== 'function') return 0;
      return conv.querySelectorAll('[data-testid="user-message-bubble"]').length;
    }

    function writeIntoComposer(text) {
      const scope = getScope();
      const existing = ctxSrc.readComposerDraft(doc, scope);
      if (existing && existing !== text) {
        return { ok: false, reason: 'draft-present' };
      }
      const ed = ctxSrc.findComposerEditor(doc, scope);
      if (!ed) return { ok: false, reason: 'no-editor' };
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
        return { ok: true };
      } catch {
        return { ok: false, reason: 'insert-failed' };
      }
    }

    function findBarAnchor(scope = getScope()) {
      if (!doc) return null;
      return (
        scope?.querySelector?.('[data-testid="agent-input-box"]') ||
        scope?.querySelector?.('.surface-composer-card') ||
        doc.querySelector?.('[data-testid="agent-input-box"]') ||
        doc.querySelector?.('.surface-composer-card') ||
        null
      );
    }

    function ensureBar() {
      if (!doc) return null;
      const anchor = findBarAnchor();
      if (!anchor || !anchor.parentElement) return null;
      ensureStyle();
      if (barEl && barEl.isConnected !== false) {
        if (barEl.parentElement !== anchor.parentElement) {
          anchor.parentElement.insertBefore(barEl, anchor);
        }
        return barEl;
      }

      const bar = coexist.markOwnedNoTranslate(doc.createElement('div'));
      bar.className = 'ag-sg-draft-bar';
      bar.setAttribute('role', 'status');
      bar.setAttribute('data-testid', 'ag-sg-draft-bar');
      bar.hidden = true;

      const left = doc.createElement('div');
      left.className = 'ag-sg-left';
      const dot = doc.createElement('span');
      dot.className = 'ag-sg-draft-dot';
      dot.setAttribute('aria-hidden', 'true');
      msgEl = doc.createElement('span');
      msgEl.className = 'ag-sg-msg';
      left.appendChild(dot);
      left.appendChild(msgEl);

      const acts = doc.createElement('div');
      acts.className = 'ag-sg-actions';

      restoreBtn = doc.createElement('button');
      restoreBtn.type = 'button';
      restoreBtn.className = 'ag-sg-btn ag-sg-btn-primary';
      restoreBtn.setAttribute('data-ag-sg-act', 'draft-restore');
      restoreBtn.addEventListener('click', (ev) => {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
        restoreCurrentDraft();
      });

      discardBtn = doc.createElement('button');
      discardBtn.type = 'button';
      discardBtn.className = 'ag-sg-btn';
      discardBtn.setAttribute('data-ag-sg-act', 'draft-discard');
      discardBtn.addEventListener('click', (ev) => {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
        discardCurrentDraft();
      });

      acts.appendChild(restoreBtn);
      acts.appendChild(discardBtn);
      bar.appendChild(left);
      bar.appendChild(acts);

      anchor.parentElement.insertBefore(bar, anchor);
      barEl = bar;
      return barEl;
    }

    function hideBar() {
      if (barEl) barEl.hidden = true;
    }

    function flushNow(explicitCid = null) {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      if (destroyed || !enabled) return null;
      const scope = getScope();
      const cid = explicitCid || ctxSrc.detectCascadeId(doc, win, scope);
      currentCid = cid;
      const liveText = ctxSrc.readComposerDraft(doc, scope);
      const prevText = lastLiveDraftByCid.get(cid) || '';
      const turnCount = countUserTurns(scope);
      const prevTurns = lastTurnCountByCid.get(cid);
      const streaming = ctxSrc.isTurnStreaming(doc, scope);

      if (isSaveableDraft(liveText)) {
        lastLiveDraftByCid.set(cid, liveText);
        lastTurnCountByCid.set(cid, turnCount);
        dismissedCids.delete(cid);
        const saved = saveDraft(storage, cid, liveText, nowFn());
        hideBar();
        return saved;
      }

      // If editor cleared because user sent the message (streaming started or turn count increased), clear stored draft
      const sentDetected =
        !liveText &&
        (streaming || (prevTurns !== undefined && turnCount > prevTurns)) &&
        prevText.length > 0;
      if (sentDetected) {
        clearDraft(storage, cid);
        lastLiveDraftByCid.delete(cid);
        dismissedCids.delete(cid);
      } else if (!liveText && prevText.length > 0 && !streaming) {
        // User manually deleted their own live text while staying in the same session
        clearDraft(storage, cid);
        lastLiveDraftByCid.delete(cid);
      }
      lastTurnCountByCid.set(cid, turnCount);
      return null;
    }

    function scheduleFlush() {
      if (destroyed || !enabled) return;
      if (saveTimer) clearTimeout(saveTimer);
      if (debounceMs === 0) {
        flushNow();
        return;
      }
      saveTimer = setTimeout(() => {
        saveTimer = null;
        flushNow();
      }, debounceMs);
      saveTimer?.unref?.();
    }

    function markCurrentSent(cid = null) {
      const targetCid = cid || currentCid || ctxSrc.detectCascadeId(doc, win, getScope());
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      if (targetCid) {
        clearDraft(storage, targetCid);
        lastLiveDraftByCid.delete(targetCid);
        dismissedCids.delete(targetCid);
      }
      hideBar();
    }

    function bindEditor() {
      const scope = getScope();
      const ed = ctxSrc.findComposerEditor(doc, scope);
      if (ed === boundEditor) return;
      if (boundEditorOff) {
        try { boundEditorOff(); } catch {}
        boundEditorOff = null;
        boundEditor = null;
      }
      if (!ed || typeof ed.addEventListener !== 'function') return;
      const onInput = () => {
        if (destroyed || !enabled) return;
        const cid = ctxSrc.detectCascadeId(doc, win, getScope());
        currentCid = cid;
        const txt = ctxSrc.readComposerDraft(doc, getScope());
        if (txt) hideBar();
        scheduleFlush();
      };
      const onKeyDown = (ev) => {
        if (destroyed || !enabled || !ev) return;
        if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
          // User submitted prompt via Enter -> clear cached draft after microtask
          const cid = ctxSrc.detectCascadeId(doc, win, getScope());
          markCurrentSent(cid);
        }
      };
      ed.addEventListener('input', onInput);
      ed.addEventListener('keydown', onKeyDown);
      boundEditor = ed;
      boundEditorOff = () => {
        ed.removeEventListener?.('input', onInput);
        ed.removeEventListener?.('keydown', onKeyDown);
      };
    }

    function renderBar() {
      if (destroyed || !enabled) {
        hideBar();
        return;
      }
      const scope = getScope();
      const cid = ctxSrc.detectCascadeId(doc, win, scope);
      currentCid = cid;
      const liveText = ctxSrc.readComposerDraft(doc, scope);
      if (liveText.length > 0 || dismissedCids.has(cid)) {
        hideBar();
        return;
      }
      const saved = loadDraft(storage, cid, nowFn());
      if (!saved) {
        hideBar();
        return;
      }
      const bar = ensureBar();
      if (!bar) return;
      const strings = S();
      const safeRaw = (exporter ? exporter.redactSecrets(saved.text) : saved.text).replace(/\s+/g, ' ').trim();
      const preview = safeRaw.length > 48 ? `${safeRaw.slice(0, 48)}…` : safeRaw;
      msgEl.textContent = i18n.formatTemplate(strings.draftFoundMsg, {
        chars: saved.charCount,
        preview,
      });
      restoreBtn.textContent = strings.draftRestoreBtn;
      discardBtn.textContent = strings.draftDiscardBtn;
      bar.hidden = false;
    }

    function restoreCurrentDraft() {
      if (destroyed || !enabled) return { ok: false, reason: 'disabled' };
      const scope = getScope();
      const cid = ctxSrc.detectCascadeId(doc, win, scope);
      const saved = loadDraft(storage, cid, nowFn());
      if (!saved) {
        hideBar();
        return { ok: false, reason: 'no-draft' };
      }
      const res = writeIntoComposer(saved.text);
      if (res.ok) {
        lastLiveDraftByCid.set(cid, saved.text);
        hideBar();
        if (typeof options.onDraftRestored === 'function') {
          try { options.onDraftRestored(saved); } catch {}
        }
        return { ok: true, draft: saved };
      }
      return res;
    }

    function discardCurrentDraft() {
      const cid = currentCid || ctxSrc.detectCascadeId(doc, win, getScope());
      if (cid) {
        clearDraft(storage, cid);
        lastLiveDraftByCid.delete(cid);
        dismissedCids.add(cid);
      }
      hideBar();
      if (typeof options.onDraftDiscarded === 'function') {
        try { options.onDraftDiscarded({ cascadeId: cid }); } catch {}
      }
    }

    function sync() {
      if (destroyed) return;
      if (!enabled) {
        hideBar();
        return;
      }
      bindEditor();
      const scope = getScope();
      const cid = ctxSrc.detectCascadeId(doc, win, scope);
      const prevCid = currentCid;
      currentCid = cid;
      const liveText = ctxSrc.readComposerDraft(doc, scope);
      const turnCount = countUserTurns(scope);
      const prevTurns = lastTurnCountByCid.get(cid);
      const streaming = ctxSrc.isTurnStreaming(doc, scope);

      if (isSaveableDraft(liveText)) {
        lastLiveDraftByCid.set(cid, liveText);
        lastTurnCountByCid.set(cid, turnCount);
        saveDraft(storage, cid, liveText, nowFn());
      } else if (!liveText && cid === prevCid && (streaming || (prevTurns !== undefined && turnCount > prevTurns))) {
        markCurrentSent(cid);
      }
      lastTurnCountByCid.set(cid, turnCount);
      renderBar();
    }

    const addL = (target, ev, fn, cap = false) => {
      if (!target || typeof target.addEventListener !== 'function') return;
      target.addEventListener(ev, fn, cap);
      listeners.push(() => target.removeEventListener?.(ev, fn, cap));
    };

    const onPaneFocus = (ev) => {
      if (destroyed || !enabled || !ev?.target || !ctxSrc.findPaneRootForNode) return;
      const rootPane = ctxSrc.findPaneRootForNode(ev.target, doc);
      if (rootPane && rootPane !== activePaneEl) {
        flushNow();
        activePaneEl = rootPane;
        sync();
      }
    };
    const onSendClick = (ev) => {
      if (destroyed || !enabled || !ev?.target) return;
      const btn = ev.target.closest?.(
        '[data-testid="input-send-button"], [data-testid="send-button"], button[type="submit"]'
      );
      if (btn) {
        markCurrentSent();
      }
    };

    addL(doc, 'pointerdown', onPaneFocus, true);
    addL(doc, 'focusin', onPaneFocus, true);
    addL(doc, 'click', onSendClick, true);
    addL(win, 'blur', () => { flushNow(); });
    addL(win, 'beforeunload', () => { flushNow(); });
    addL(doc, 'visibilitychange', () => {
      if (doc?.hidden) flushNow();
      else sync();
    });

    function setEnabled(v) {
      if (destroyed) return;
      enabled = Boolean(v);
      if (!enabled) {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        hideBar();
      } else {
        sync();
      }
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      if (boundEditorOff) { try { boundEditorOff(); } catch {} boundEditorOff = null; boundEditor = null; }
      while (listeners.length) {
        try { listeners.pop()(); } catch {}
      }
      try { barEl?.remove?.(); } catch {}
      try { createdStyleEl?.remove?.(); } catch {}
      barEl = msgEl = restoreBtn = discardBtn = createdStyleEl = null;
      activePaneEl = null;
      lastLiveDraftByCid.clear();
      lastTurnCountByCid.clear();
      dismissedCids.clear();
    }

    pruneExpiredDrafts(storage, nowFn());
    if (enabled) sync();

    return {
      sync,
      flushNow,
      markCurrentSent,
      restoreCurrentDraft,
      discardCurrentDraft,
      setEnabled,
      listSavedDrafts: () => listSavedDrafts(storage, nowFn()),
      getDebugState: () => ({
        enabled,
        destroyed,
        cascadeId: currentCid,
        barVisible: Boolean(barEl && !barEl.hidden),
        savedDraftCount: listSavedDrafts(storage, nowFn()).length,
      }),
      destroy,
    };
  }

  return {
    DRAFT_STORAGE_PREFIX,
    DRAFT_TTL_MS,
    MAX_DRAFT_CHARS,
    isSaveableDraft,
    loadDraft,
    saveDraft,
    clearDraft,
    listSavedDrafts,
    pruneExpiredDrafts,
    createDraftGuardController,
  };
});
