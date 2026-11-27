// agy-Sag — Reading Navigation & Long Code Block Folding (UMD, zero runtime deps)
// Opt-in reading ergonomics for long Antigravity conversations:
//   1) Automatic folding for >= N-line code blocks (<pre>) with sticky header bar (lines badge, expand/collapse, copy)
//   2) Alt+ArrowUp / Alt+ArrowDown turn-to-turn keyboard navigation (never hijacks editable inputs)
//   3) Floating mini turn rail with bookmark star indicators (auto-yields to Obsidian Prism outline rail)
//   4) Zero innerHTML, non-destructive DOM attributes, zero-loop debounced MutationObserver, 100% lossless destroy()
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSagReadingNav = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  const RAIL_TESTID = 'ag-sag-rnav-rail';
  const CODE_BAR_ATTR = 'data-ag-sag-code-bar';
  const CODE_FOLDED_ATTR = 'data-ag-sag-code-folded';
  const CODE_ENHANCED_ATTR = 'data-ag-sag-code-enhanced';
  const DEFAULT_COLLAPSE_LINES = 40;
  const MIN_COLLAPSE_LINES = 20;
  const MAX_COLLAPSE_LINES = 200;

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

  function clampCollapseLines(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_COLLAPSE_LINES;
    return Math.max(MIN_COLLAPSE_LINES, Math.min(MAX_COLLAPSE_LINES, Math.round(n)));
  }

  function countCodeLines(text) {
    const src = String(text || '');
    if (!src.trim()) return 0;
    const trimmedEnd = src.replace(/\r?\n+$/, '');
    if (!trimmedEnd) return 0;
    return trimmedEnd.split(/\r?\n/).length;
  }

  function isEditableTarget(el) {
    if (!el) return false;
    const tag = String(el.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.getAttribute?.('contenteditable') === 'true') return true;
    if (el.closest?.('[contenteditable="true"], [data-lexical-editor="true"]')) return true;
    return false;
  }

  function isOwnedNode(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.getAttribute?.('data-ag-sg-owned') === '1' || node.getAttribute?.('data-ag-sag-owned') === '1') return true;
    if (node.closest?.('[data-ag-sg-owned="1"], [data-ag-sag-owned="1"]')) return true;
    return false;
  }

  function createReadingNavController(options = {}) {
    const win = options.win || globalRoot;
    const doc = options.doc || win?.document || null;
    const coexist = options.coexist || resolveDep('__agSgCoexist', './coexist.js');
    const ctxSrc = options.contextSource || resolveDep('__agSgContextSource', './context-source.js');
    const i18n = options.i18n || resolveDep('__agSgI18n', './i18n.js');
    const styles = options.styles || resolveDep('__agSgStyles', './styles.js');

    let enabled = Boolean(options.enabled);
    let destroyed = false;
    let collapseLines = clampCollapseLines(options.collapseLines ?? DEFAULT_COLLAPSE_LINES);
    let currentTurnIndex = -1;
    let railYielded = false;
    let foldedCount = 0;
    let enhancedCount = 0;

    let railEl = null;
    let createdStyleEl = null;
    let keydownOff = null;
    let domObserver = null;
    let observerTimer = null;
    let pulseTimer = null;
    let pulsedEl = null;
    let activePaneEl = null;

    const userToggleState = new WeakMap(); // preEl -> boolean (true = expanded by user, false = folded by user)
    const enhancedPres = new Set(); // track pre elements for lossless teardown
    const codeBars = new WeakMap(); // preEl -> barEl

    const getLang = () =>
      typeof options.getLang === 'function' ? i18n.normalizeLang(options.getLang()) : i18n.detectLang(doc, win);
    const t = (key, fallback = '') => {
      const sag = typeof i18n?.getSagStrings === 'function' ? i18n.getSagStrings(getLang()) : null;
      return sag?.[key] ?? fallback;
    };
    const getScope = () => (ctxSrc?.resolveActivePaneScope ? ctxSrc.resolveActivePaneScope(doc, activePaneEl) : doc);

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

    function getConversationContainer() {
      if (!doc) return null;
      const scope = getScope();
      return (
        (ctxSrc?.resolveActiveConversationView ? ctxSrc.resolveActiveConversationView(doc, scope) : null) ||
        scope?.querySelector?.('[data-testid="conversation-view"]') ||
        doc.querySelector?.('[data-testid="conversation-view"]') ||
        null
      );
    }

    function getUserTurnElements() {
      const conv = getConversationContainer();
      if (!conv || typeof conv.querySelectorAll !== 'function') return [];
      return Array.from(conv.querySelectorAll('[data-testid="user-message-bubble"]') || []);
    }

    function hasPrismNavConflict() {
      if (!doc || typeof doc.querySelector !== 'function') return false;
      return Boolean(
        doc.querySelector('.ag-cs-nav-outline-trigger, .ag-cs-nav-rail, [data-ag-prism-nav-rail="1"]')
      );
    }

    function clearPulse() {
      if (pulseTimer) {
        clearTimeout(pulseTimer);
        pulseTimer = null;
      }
      if (pulsedEl) {
        try { pulsedEl.removeAttribute?.('data-ag-sg-pulse'); } catch {}
        pulsedEl = null;
      }
    }

    function jumpToTurn(index) {
      if (destroyed || !enabled) return false;
      const turns = getUserTurnElements();
      if (!turns.length) return false;
      const clamped = Math.max(0, Math.min(turns.length - 1, Number(index)));
      const target = turns[clamped];
      if (!target) return false;

      currentTurnIndex = clamped;
      clearPulse();
      try {
        target.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      } catch {}
      try {
        target.setAttribute?.('data-ag-sg-pulse', '1');
        pulsedEl = target;
        pulseTimer = setTimeout(() => {
          clearPulse();
        }, 1400);
        pulseTimer?.unref?.();
      } catch {}
      renderRail();
      if (typeof options.onNavigateTurn === 'function') {
        try {
          options.onNavigateTurn({ index: clamped, total: turns.length, element: target });
        } catch {}
      }
      return true;
    }

    function jumpRelative(delta) {
      const turns = getUserTurnElements();
      if (!turns.length) return false;
      let nextIdx;
      if (currentTurnIndex < 0 || currentTurnIndex >= turns.length) {
        nextIdx = delta < 0 ? turns.length - 1 : 0;
      } else {
        nextIdx = Math.max(0, Math.min(turns.length - 1, currentTurnIndex + delta));
      }
      return jumpToTurn(nextIdx);
    }

    function copyCodeText(text, btn) {
      const str = String(text || '');
      if (typeof options.onCopyCode === 'function') {
        try { options.onCopyCode(str); } catch {}
      } else {
        try { win?.navigator?.clipboard?.writeText?.(str); } catch {}
      }
      if (btn) {
        const copiedLabel = t('rnavCopiedBtn', 'Copied ✓');
        if (btn.textContent !== copiedLabel) btn.textContent = copiedLabel;
        const timer = setTimeout(() => {
          if (!destroyed && btn.isConnected !== false) {
            const copyLabel = t('rnavCopyBtn', 'Copy');
            if (btn.textContent !== copyLabel) btn.textContent = copyLabel;
          }
        }, 1200);
        timer?.unref?.();
      }
    }

    function applyPreFoldVisual(pre, bar, isFolded, lineCount) {
      if (isFolded) {
        if (pre.getAttribute?.(CODE_FOLDED_ATTR) !== '1') pre.setAttribute?.(CODE_FOLDED_ATTR, '1');
      } else {
        if (pre.hasAttribute?.(CODE_FOLDED_ATTR)) pre.removeAttribute?.(CODE_FOLDED_ATTR);
      }
      if (bar) {
        const meta = bar.querySelector?.('[data-ag-sag-code-meta]');
        const metaTxt = i18n?.formatTemplate
          ? i18n.formatTemplate(t('rnavLinesBadge', '{n} lines'), { n: lineCount })
          : `${lineCount} lines`;
        if (meta && meta.textContent !== metaTxt) meta.textContent = metaTxt;

        const toggleBtn = bar.querySelector?.('[data-ag-sag-code-toggle]');
        if (toggleBtn) {
          const lbl = isFolded ? t('rnavExpandBtn', 'Expand') : t('rnavCollapseBtn', 'Collapse');
          if (toggleBtn.textContent !== lbl) toggleBtn.textContent = lbl;
          toggleBtn.setAttribute?.('aria-expanded', String(!isFolded));
        }
      }
    }

    function cleanupEnhancedCodeBlocks() {
      for (const pre of Array.from(enhancedPres)) {
        const bar = codeBars.get(pre);
        try { bar?.remove?.(); } catch {}
        codeBars.delete(pre);
        try { pre.removeAttribute?.(CODE_FOLDED_ATTR); } catch {}
        try { pre.removeAttribute?.(CODE_ENHANCED_ATTR); } catch {}
        enhancedPres.delete(pre);
      }
      if (doc && typeof doc.querySelectorAll === 'function') {
        try {
          doc.querySelectorAll(`[${CODE_BAR_ATTR}="1"]`).forEach((n) => n.remove?.());
          doc.querySelectorAll(`[${CODE_FOLDED_ATTR}]`).forEach((n) => n.removeAttribute?.(CODE_FOLDED_ATTR));
          doc.querySelectorAll(`[${CODE_ENHANCED_ATTR}]`).forEach((n) => n.removeAttribute?.(CODE_ENHANCED_ATTR));
        } catch {}
      }
      foldedCount = 0;
      enhancedCount = 0;
    }

    function scanCodeBlocks() {
      if (destroyed || !enabled) return { enhanced: 0, folded: 0 };
      const conv = getConversationContainer();
      if (!conv || typeof conv.querySelectorAll !== 'function') return { enhanced: 0, folded: 0 };
      ensureStyle();

      // Prune detached pre elements
      for (const pre of Array.from(enhancedPres)) {
        if (pre.isConnected === false) {
          try { codeBars.get(pre)?.remove?.(); } catch {}
          codeBars.delete(pre);
          enhancedPres.delete(pre);
        }
      }

      const pres = Array.from(conv.querySelectorAll('pre') || []);
      let curEnhanced = 0;
      let curFolded = 0;

      for (const pre of pres) {
        if (!pre || isOwnedNode(pre)) continue;
        const lines = countCodeLines(pre.textContent || '');
        if (lines < collapseLines) {
          // If threshold increased and pre was previously enhanced, restore cleanly
          if (enhancedPres.has(pre)) {
            try { codeBars.get(pre)?.remove?.(); } catch {}
            codeBars.delete(pre);
            pre.removeAttribute?.(CODE_FOLDED_ATTR);
            pre.removeAttribute?.(CODE_ENHANCED_ATTR);
            enhancedPres.delete(pre);
          }
          continue;
        }

        curEnhanced += 1;
        let bar = codeBars.get(pre) || null;
        if (!bar || bar.isConnected === false) {
          bar = coexist?.markOwnedNoTranslate
            ? coexist.markOwnedNoTranslate(doc.createElement('div'))
            : doc.createElement('div');
          bar.className = 'ag-sag-code-bar';
          bar.setAttribute(CODE_BAR_ATTR, '1');

          const meta = doc.createElement('span');
          meta.className = 'ag-sag-code-meta';
          meta.setAttribute('data-ag-sag-code-meta', '1');

          const acts = doc.createElement('div');
          acts.className = 'ag-sag-code-acts';

          const toggleBtn = doc.createElement('button');
          toggleBtn.type = 'button';
          toggleBtn.className = 'ag-sag-code-btn';
          toggleBtn.setAttribute('data-ag-sag-code-toggle', '1');
          toggleBtn.addEventListener('click', (ev) => {
            ev?.preventDefault?.();
            ev?.stopPropagation?.();
            const currentlyFolded = pre.getAttribute?.(CODE_FOLDED_ATTR) === '1';
            userToggleState.set(pre, currentlyFolded); // true means user expanded
            applyPreFoldVisual(pre, bar, !currentlyFolded, countCodeLines(pre.textContent || ''));
            recountFolded();
          });

          const copyBtn = doc.createElement('button');
          copyBtn.type = 'button';
          copyBtn.className = 'ag-sag-code-btn';
          copyBtn.setAttribute('data-ag-sag-code-copy', '1');
          copyBtn.textContent = t('rnavCopyBtn', 'Copy');
          copyBtn.addEventListener('click', (ev) => {
            ev?.preventDefault?.();
            ev?.stopPropagation?.();
            copyCodeText(pre.textContent || '', copyBtn);
          });

          acts.appendChild(toggleBtn);
          acts.appendChild(copyBtn);
          bar.appendChild(meta);
          bar.appendChild(acts);

          if (pre.parentElement && typeof pre.parentElement.insertBefore === 'function') {
            pre.parentElement.insertBefore(bar, pre);
          }
          codeBars.set(pre, bar);
          enhancedPres.add(pre);
          pre.setAttribute?.(CODE_ENHANCED_ATTR, '1');
        }

        const userExpanded = userToggleState.has(pre) ? Boolean(userToggleState.get(pre)) : false;
        const shouldFold = !userExpanded;
        if (shouldFold) curFolded += 1;
        applyPreFoldVisual(pre, bar, shouldFold, lines);
      }

      enhancedCount = curEnhanced;
      foldedCount = curFolded;
      return { enhanced: enhancedCount, folded: foldedCount };
    }

    function recountFolded() {
      let f = 0;
      for (const pre of enhancedPres) {
        if (pre.isConnected !== false && pre.getAttribute?.(CODE_FOLDED_ATTR) === '1') f += 1;
      }
      foldedCount = f;
    }

    function removeRail() {
      try { railEl?.remove?.(); } catch {}
      railEl = null;
    }

    function getStarredTurnSet() {
      if (typeof options.getStarredTurns !== 'function') return new Set();
      try {
        const res = options.getStarredTurns();
        if (res instanceof Set) return res;
        if (Array.isArray(res)) return new Set(res.map((n) => Number(n)));
      } catch {}
      return new Set();
    }

    function renderRail() {
      if (destroyed || !enabled || !doc || !doc.body) {
        removeRail();
        railYielded = false;
        return;
      }

      if (hasPrismNavConflict()) {
        railYielded = true;
        removeRail();
        return;
      }
      railYielded = false;

      const turns = getUserTurnElements();
      if (turns.length < 2) {
        removeRail();
        return;
      }

      ensureStyle();
      if (!railEl || railEl.isConnected === false) {
        railEl = coexist?.markOwnedNoTranslate
          ? coexist.markOwnedNoTranslate(doc.createElement('nav'))
          : doc.createElement('nav');
        railEl.className = 'ag-sag-rnav-rail';
        railEl.setAttribute('data-testid', RAIL_TESTID);
        railEl.setAttribute('aria-label', t('rnavRailLabel', 'Turn Navigation'));
        doc.body.appendChild(railEl);
      }

      const starred = getStarredTurnSet();
      while (railEl.firstChild) railEl.removeChild(railEl.firstChild);

      const prevBtn = doc.createElement('button');
      prevBtn.type = 'button';
      prevBtn.className = 'ag-sag-rnav-step';
      prevBtn.setAttribute('data-ag-sag-rnav-step', 'prev');
      prevBtn.textContent = '↑';
      prevBtn.title = t('rnavPrevTip', 'Previous turn (Alt+↑)');
      prevBtn.addEventListener('click', () => jumpRelative(-1));
      railEl.appendChild(prevBtn);

      const dotsWrap = doc.createElement('div');
      dotsWrap.className = 'ag-sag-rnav-dots';
      const maxDots = Math.min(turns.length, 30);
      for (let i = 0; i < maxDots; i += 1) {
        const turnNum = i + 1;
        const snippet = String(turns[i]?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 64);
        const dot = doc.createElement('button');
        dot.type = 'button';
        dot.className = 'ag-sag-rnav-dot';
        dot.setAttribute('data-ag-sag-rnav-turn', String(turnNum));
        if (starred.has(turnNum)) dot.setAttribute('data-starred', '1');
        if (i === currentTurnIndex) dot.setAttribute('data-active', '1');
        dot.title = `#${turnNum}${starred.has(turnNum) ? ' ★' : ''}: ${snippet}`;
        dot.setAttribute('aria-label', dot.title);
        dot.addEventListener('click', () => jumpToTurn(i));
        dotsWrap.appendChild(dot);
      }
      railEl.appendChild(dotsWrap);

      const nextBtn = doc.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'ag-sag-rnav-step';
      nextBtn.setAttribute('data-ag-sag-rnav-step', 'next');
      nextBtn.textContent = '↓';
      nextBtn.title = t('rnavNextTip', 'Next turn (Alt+↓)');
      nextBtn.addEventListener('click', () => jumpRelative(1));
      railEl.appendChild(nextBtn);
    }

    function onKeyDown(ev) {
      if (destroyed || !enabled) return;
      if (!ev?.altKey || ev?.ctrlKey || ev?.metaKey || ev?.shiftKey) return;
      if (isEditableTarget(ev?.target)) return;
      const key = String(ev?.key || '');
      if (key === 'ArrowUp') {
        if (jumpRelative(-1)) {
          ev.preventDefault?.();
          ev.stopPropagation?.();
        }
      } else if (key === 'ArrowDown') {
        if (jumpRelative(1)) {
          ev.preventDefault?.();
          ev.stopPropagation?.();
        }
      }
    }

    function scheduleSync() {
      if (observerTimer || destroyed || !enabled) return;
      observerTimer = setTimeout(() => {
        observerTimer = null;
        if (destroyed || !enabled) return;
        if (coexist?.isWindowHibernated?.(doc, win, false)) return;
        scanCodeBlocks();
        renderRail();
      }, 80);
      observerTimer?.unref?.();
    }

    function attachListeners() {
      if (!doc || keydownOff) return;
      doc.addEventListener?.('keydown', onKeyDown, true);
      keydownOff = () => doc.removeEventListener?.('keydown', onKeyDown, true);

      if (options.autoObserve !== false && typeof win?.MutationObserver === 'function' && doc.body) {
        domObserver = new win.MutationObserver((records) => {
          if (!enabled || destroyed) return;
          if (coexist?.isWindowHibernated?.(doc, win, false)) return;
          if (Array.isArray(records) && records.length > 0) {
            const hasExternal = records.some((rec) => {
              if (!isOwnedNode(rec?.target)) {
                const added = Array.from(rec?.addedNodes || []);
                const removed = Array.from(rec?.removedNodes || []);
                const allOwned =
                  (added.length > 0 || removed.length > 0) &&
                  added.every(isOwnedNode) &&
                  removed.every(isOwnedNode);
                return !allOwned;
              }
              return false;
            });
            if (!hasExternal) return;
          }
          scheduleSync();
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
      if (domObserver) {
        try { domObserver.disconnect(); } catch {}
        domObserver = null;
      }
    }

    function sync() {
      if (destroyed) return;
      if (!enabled) {
        cleanupEnhancedCodeBlocks();
        removeRail();
        return;
      }
      scanCodeBlocks();
      renderRail();
    }

    function setEnabled(next) {
      if (destroyed) return;
      const val = Boolean(next);
      if (val === enabled) {
        if (enabled) sync();
        return;
      }
      enabled = val;
      if (enabled) {
        attachListeners();
        sync();
      } else {
        detachListeners();
        clearPulse();
        cleanupEnhancedCodeBlocks();
        removeRail();
        railYielded = false;
      }
    }

    function setCollapseLines(nextLines) {
      collapseLines = clampCollapseLines(nextLines);
      if (enabled && !destroyed) scanCodeBlocks();
      return collapseLines;
    }

    function getDebugState() {
      return {
        enabled,
        destroyed,
        collapseLines,
        enhancedCodeBlocks: enhancedCount,
        foldedCodeBlocks: foldedCount,
        railMounted: Boolean(railEl && railEl.isConnected !== false),
        railYielded,
        currentTurnIndex,
      };
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      enabled = false;
      detachListeners();
      clearPulse();
      cleanupEnhancedCodeBlocks();
      removeRail();
      try { createdStyleEl?.remove?.(); } catch {}
      createdStyleEl = null;
      activePaneEl = null;
      railYielded = false;
    }

    if (enabled) {
      attachListeners();
      sync();
    }

    return {
      sync,
      setEnabled,
      setCollapseLines,
      jumpToTurn,
      jumpRelative,
      getDebugState,
      destroy,
    };
  }

  return {
    RAIL_TESTID,
    CODE_BAR_ATTR,
    CODE_FOLDED_ATTR,
    CODE_ENHANCED_ATTR,
    DEFAULT_COLLAPSE_LINES,
    clampCollapseLines,
    countCodeLines,
    createReadingNavController,
  };
});
