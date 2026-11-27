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
  const OUTLINE_TESTID = 'ag-sag-rnav-outline';
  const MERMAID_MODAL_TESTID = 'ag-sag-mermaid-modal';
  const CODE_BAR_ATTR = 'data-ag-sag-code-bar';
  const CODE_FOLDED_ATTR = 'data-ag-sag-code-folded';
  const CODE_ENHANCED_ATTR = 'data-ag-sag-code-enhanced';
  const CODE_WRAP_ATTR = 'data-ag-sag-code-wrap';
  const MERMAID_BTN_ATTR = 'data-ag-sag-mermaid-zoom';
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
    let outlineEl = null;
    let outlineOpen = false;
    let outlineQuery = '';
    let outlineStarOnly = false;
    let mermaidModalEl = null;
    let mermaidZoomScale = 1;
    let allFoldedToggleState = true;
    let createdStyleEl = null;
    let keydownOff = null;
    let paneTrackOff = null;
    let domObserver = null;
    let observerTimer = null;
    let pulseTimer = null;
    let pulsedEl = null;
    let activePaneEl = null;

    const userToggleState = new WeakMap(); // preEl -> boolean (true = expanded by user, false = folded by user)
    const enhancedPres = new Set(); // track pre elements for lossless teardown
    const codeBars = new WeakMap(); // preEl -> barEl
    const mermaidBtns = new Map(); // svgEl -> btnEl
    const originalDetailsOpen = new WeakMap(); // detailsEl -> original boolean open state
    const modifiedDetails = new Set(); // track modified host <details> for lossless restore

    const isStreamingNow = () => {
      if (typeof options.isStreaming === 'function') {
        try {
          return Boolean(options.isStreaming());
        } catch {}
      }
      return Boolean(ctxSrc?.isTurnStreaming?.(doc, getScope()));
    };

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
      if (scope && scope !== doc) {
        if (scope.getAttribute?.('data-testid') === 'conversation-view') return scope;
        const scopedConv = scope.querySelector?.('[data-testid="conversation-view"]') || null;
        if (scopedConv) return scopedConv;
      }
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
      const show = (ok) => {
        if (!btn || destroyed || btn.isConnected === false) return;
        btn.textContent = ok ? t('rnavCopiedBtn', 'Copied ✓') : t('rnavCopyFailedBtn', 'Copy failed');
        const tm = setTimeout(() => {
          if (!destroyed && btn.isConnected !== false) btn.textContent = t('rnavCopyBtn', 'Copy');
        }, 1200);
        tm?.unref?.();
      };
      const done = (r) => (r && typeof r.then === 'function' ? r.then((v) => show(v !== false), () => show(false)) : show(r !== false));
      try {
        if (typeof options.onCopyCode === 'function') return void done(options.onCopyCode(str));
        const wf = win?.navigator?.clipboard?.writeText;
        if (typeof wf !== 'function') return void show(false);
        done(wf.call(win.navigator.clipboard, str));
      } catch {
        show(false);
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
        try { pre.removeAttribute?.(CODE_WRAP_ATTR); } catch {}
        enhancedPres.delete(pre);
      }
      if (doc && typeof doc.querySelectorAll === 'function') {
        try {
          doc.querySelectorAll(`[${CODE_BAR_ATTR}="1"]`).forEach((n) => n.remove?.());
          doc.querySelectorAll(`[${CODE_FOLDED_ATTR}]`).forEach((n) => n.removeAttribute?.(CODE_FOLDED_ATTR));
          doc.querySelectorAll(`[${CODE_ENHANCED_ATTR}]`).forEach((n) => n.removeAttribute?.(CODE_ENHANCED_ATTR));
          doc.querySelectorAll(`[${CODE_WRAP_ATTR}]`).forEach((n) => n.removeAttribute?.(CODE_WRAP_ATTR));
        } catch {}
      }
      foldedCount = 0;
      enhancedCount = 0;
    }

    function collectTargetContainers() {
      const out = [];
      const conv = getConversationContainer();
      if (conv) out.push({ el: conv, isConv: true });
      const scope = getScope();
      const artNodes =
        scope?.querySelectorAll?.('[data-testid="artifact-view"]') ||
        doc?.querySelectorAll?.('[data-testid="artifact-view"]') ||
        [];
      for (const art of artNodes) {
        if (art && !out.some((x) => x.el === art)) out.push({ el: art, isConv: false });
      }
      return out;
    }

    function togglePreWithScrollCompensation(pre, bar) {
      const currentlyFolded = pre.getAttribute?.(CODE_FOLDED_ATTR) === '1';
      const nextFolded = !currentlyFolded;
      const vp = nextFolded ? ctxSrc?.findConversationScrollViewport?.(doc, getScope()) : null;
      const prevH = Number(pre.offsetHeight) || 0;
      const prevTop = typeof pre.getBoundingClientRect === 'function' ? pre.getBoundingClientRect()?.top ?? 0 : 0;

      userToggleState.set(pre, currentlyFolded); // true means user expanded
      applyPreFoldVisual(pre, bar, nextFolded, countCodeLines(pre.textContent || ''));
      recountFolded();

      // Anchor scrollTop compensation when folding a tall block whose top scrolled above viewport
      if (nextFolded && prevTop < 0 && vp && typeof vp.scrollTop === 'number' && prevH > 0) {
        const measuredAfter = Number(pre.offsetHeight) || 0;
        const afterH = measuredAfter > 0 && measuredAfter < prevH ? measuredAfter : Math.min(prevH, 220);
        const delta = Math.max(0, prevH - afterH);
        if (delta > 0) {
          try {
            vp.scrollTop = Math.max(0, vp.scrollTop - delta);
          } catch {}
        }
      }
    }

    function scanCodeBlocks() {
      if (destroyed || !enabled) return { enhanced: 0, folded: 0 };
      const containers = collectTargetContainers();
      if (!containers.length) return { enhanced: 0, folded: 0 };
      ensureStyle();

      // Prune detached pre elements
      for (const pre of Array.from(enhancedPres)) {
        if (pre.isConnected === false) {
          try { codeBars.get(pre)?.remove?.(); } catch {}
          codeBars.delete(pre);
          enhancedPres.delete(pre);
        }
      }

      const streaming = isStreamingNow();
      let curEnhanced = 0;
      let curFolded = 0;

      for (const { el: rootEl, isConv } of containers) {
        const pres = Array.from(rootEl.querySelectorAll?.('pre') || []);
        const lastIdx = pres.length - 1;
        for (let idx = 0; idx < pres.length; idx += 1) {
          const pre = pres[idx];
          if (!pre || isOwnedNode(pre)) continue;
          // Streaming guard: never interrupt the active tail code block while assistant is still generating
          if (streaming && isConv && idx === lastIdx && !enhancedPres.has(pre)) continue;

          const lines = countCodeLines(pre.textContent || '');
          if (lines < collapseLines) {
            if (enhancedPres.has(pre)) {
              try { codeBars.get(pre)?.remove?.(); } catch {}
              codeBars.delete(pre);
              pre.removeAttribute?.(CODE_FOLDED_ATTR);
              pre.removeAttribute?.(CODE_ENHANCED_ATTR);
              pre.removeAttribute?.(CODE_WRAP_ATTR);
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
              togglePreWithScrollCompensation(pre, bar);
            });

            const wrapBtn = doc.createElement('button');
            wrapBtn.type = 'button';
            wrapBtn.className = 'ag-sag-code-btn';
            wrapBtn.setAttribute('data-ag-sag-code-wrap-btn', '1');
            wrapBtn.setAttribute('aria-pressed', 'false');
            wrapBtn.textContent = t('rnavWrapBtn', 'Wrap');
            wrapBtn.addEventListener('click', (ev) => {
              ev?.preventDefault?.();
              ev?.stopPropagation?.();
              const wrapped = pre.getAttribute?.(CODE_WRAP_ATTR) === '1';
              if (wrapped) {
                pre.removeAttribute?.(CODE_WRAP_ATTR);
                wrapBtn.setAttribute('aria-pressed', 'false');
              } else {
                pre.setAttribute?.(CODE_WRAP_ATTR, '1');
                wrapBtn.setAttribute('aria-pressed', 'true');
              }
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
            acts.appendChild(wrapBtn);
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
      }

      enhancedCount = curEnhanced;
      foldedCount = curFolded;
      return { enhanced: enhancedCount, folded: foldedCount };
    }

    function restoreModifiedDetails() {
      for (const det of Array.from(modifiedDetails)) {
        if (det && det.isConnected !== false && originalDetailsOpen.has(det)) {
          try {
            det.open = Boolean(originalDetailsOpen.get(det));
          } catch {}
        }
        originalDetailsOpen.delete(det);
        modifiedDetails.delete(det);
      }
    }

    function toggleFoldAllStepsAndCode(forceFold = null) {
      const targetFold = typeof forceFold === 'boolean' ? forceFold : !allFoldedToggleState;
      allFoldedToggleState = targetFold;
      for (const pre of enhancedPres) {
        if (pre.isConnected === false) continue;
        const bar = codeBars.get(pre);
        userToggleState.set(pre, !targetFold);
        applyPreFoldVisual(pre, bar, targetFold, countCodeLines(pre.textContent || ''));
      }
      recountFolded();
      const conv = getConversationContainer();
      if (conv && typeof conv.querySelectorAll === 'function') {
        const detailsList = conv.querySelectorAll('details') || [];
        for (const det of detailsList) {
          if (isOwnedNode(det)) continue;
          try {
            if (!originalDetailsOpen.has(det)) {
              originalDetailsOpen.set(det, Boolean(det.open));
            }
            modifiedDetails.add(det);
            det.open = !targetFold;
          } catch {}
        }
      }
      return { folded: targetFold, foldedCodeBlocks: foldedCount };
    }

    function closeMermaidModal() {
      try { mermaidModalEl?.remove?.(); } catch {}
      mermaidModalEl = null;
      mermaidZoomScale = 1;
    }

    function openMermaidZoom(svgEl) {
      if (!svgEl || !doc?.body || destroyed) return false;
      closeMermaidModal();
      ensureStyle();
      mermaidZoomScale = 1;

      const overlay = coexist?.markOwnedNoTranslate
        ? coexist.markOwnedNoTranslate(doc.createElement('div'))
        : doc.createElement('div');
      overlay.className = 'ag-sag-mermaid-modal';
      overlay.setAttribute('data-testid', MERMAID_MODAL_TESTID);
      overlay.setAttribute('role', 'dialog');
      overlay.addEventListener('click', (ev) => {
        if (ev?.target === overlay) closeMermaidModal();
      });

      const box = doc.createElement('div');
      box.className = 'ag-sag-mermaid-box';

      const head = doc.createElement('div');
      head.className = 'ag-sag-mermaid-head';
      const ttl = doc.createElement('strong');
      ttl.textContent = t('rnavMermaidZoom', 'Mermaid Diagram');

      const ctrls = doc.createElement('div');
      ctrls.className = 'ag-sag-code-acts';

      const stage = doc.createElement('div');
      stage.className = 'ag-sag-mermaid-stage';
      const canvas = doc.createElement('div');
      canvas.className = 'ag-sag-mermaid-canvas';
      const cloned = typeof svgEl.cloneNode === 'function' ? svgEl.cloneNode(true) : null;
      if (cloned) canvas.appendChild(cloned);
      stage.appendChild(canvas);

      const applyScale = (next) => {
        mermaidZoomScale = Math.max(0.5, Math.min(3, Math.round(next * 100) / 100));
        if (canvas.style) canvas.style.transform = `scale(${mermaidZoomScale})`;
        scaleLbl.textContent = `${Math.round(mermaidZoomScale * 100)}%`;
      };

      const mkBtn = (txt, act, fn) => {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'ag-sag-code-btn';
        b.setAttribute('data-ag-sag-mermaid-act', act);
        b.textContent = txt;
        b.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          fn();
        });
        return b;
      };
      const scaleLbl = doc.createElement('span');
      scaleLbl.className = 'ag-sag-code-meta';
      scaleLbl.textContent = '100%';

      ctrls.appendChild(mkBtn('-', 'zoom-out', () => applyScale(mermaidZoomScale - 0.25)));
      ctrls.appendChild(scaleLbl);
      ctrls.appendChild(mkBtn('+', 'zoom-in', () => applyScale(mermaidZoomScale + 0.25)));
      ctrls.appendChild(mkBtn('100%', 'zoom-reset', () => applyScale(1)));
      ctrls.appendChild(
        mkBtn(t('rnavMermaidExportSvg', 'Download SVG'), 'export-svg', () => {
          try {
            const Serializer = win?.XMLSerializer || globalThis.XMLSerializer;
            const rawSvg = Serializer ? new Serializer().serializeToString(svgEl) : String(svgEl.outerHTML || '');
            if (!rawSvg) return;
            const BlobCtor = win?.Blob || globalThis.Blob;
            const UrlApi = win?.URL || globalThis.URL;
            if (!BlobCtor || !UrlApi?.createObjectURL) return;
            const url = UrlApi.createObjectURL(new BlobCtor([rawSvg], { type: 'image/svg+xml;charset=utf-8' }));
            const a = coexist?.markOwnedNoTranslate ? coexist.markOwnedNoTranslate(doc.createElement('a')) : doc.createElement('a');
            a.href = url;
            a.download = 'mermaid-diagram.svg';
            if (a.style) a.style.display = 'none';
            doc.body.appendChild(a);
            a.click?.();
            a.remove?.();
            const timer = setTimeout(() => { try { UrlApi.revokeObjectURL?.(url); } catch {} }, 1000);
            timer?.unref?.();
          } catch {}
        })
      );
      ctrls.appendChild(mkBtn(t('rnavClose', 'Close'), 'close', closeMermaidModal));

      head.appendChild(ttl);
      head.appendChild(ctrls);
      box.appendChild(head);
      box.appendChild(stage);
      overlay.appendChild(box);
      doc.body.appendChild(overlay);
      mermaidModalEl = overlay;
      return true;
    }

    function cleanupMermaidButtons() {
      closeMermaidModal();
      for (const [svg, btn] of mermaidBtns.entries()) {
        try { btn?.remove?.(); } catch {}
        mermaidBtns.delete(svg);
      }
      if (doc && typeof doc.querySelectorAll === 'function') {
        try {
          doc.querySelectorAll(`[${MERMAID_BTN_ATTR}="1"]`).forEach((n) => n.remove?.());
        } catch {}
      }
    }

    function scanMermaidDiagrams() {
      if (destroyed || !enabled) return 0;
      const containers = collectTargetContainers();
      if (!containers.length) return 0;
      for (const [svg, btn] of mermaidBtns.entries()) {
        if (svg.isConnected === false) {
          try { btn?.remove?.(); } catch {}
          mermaidBtns.delete(svg);
        }
      }
      let count = 0;
      for (const { el: rootEl } of containers) {
        const svgs = Array.from(rootEl.querySelectorAll?.('svg[id^="mermaid"], .mermaid svg') || []);
        for (const svg of svgs) {
          if (!svg || isOwnedNode(svg)) continue;
          count += 1;
          const existing = mermaidBtns.get(svg);
          if (existing && existing.isConnected !== false) continue;
          const btn = coexist?.markOwnedNoTranslate
            ? coexist.markOwnedNoTranslate(doc.createElement('button'))
            : doc.createElement('button');
          btn.type = 'button';
          btn.className = 'ag-sag-code-btn ag-sag-mermaid-btn';
          btn.setAttribute(MERMAID_BTN_ATTR, '1');
          btn.textContent = '⤢';
          btn.title = t('rnavMermaidZoom', 'Zoom Mermaid Diagram');
          btn.setAttribute('aria-label', btn.title);
          btn.addEventListener('click', (ev) => {
            ev?.preventDefault?.();
            ev?.stopPropagation?.();
            openMermaidZoom(svg);
          });
          if (svg.parentElement && typeof svg.parentElement.insertBefore === 'function') {
            svg.parentElement.insertBefore(btn, svg);
          }
          mermaidBtns.set(svg, btn);
        }
      }
      return count;
    }

    function recountFolded() {
      let f = 0;
      for (const pre of enhancedPres) {
        if (pre.isConnected !== false && pre.getAttribute?.(CODE_FOLDED_ATTR) === '1') f += 1;
      }
      foldedCount = f;
    }

    function removeOutline() {
      try { outlineEl?.remove?.(); } catch {}
      outlineEl = null;
      outlineOpen = false;
    }

    function removeRail() {
      try { railEl?.remove?.(); } catch {}
      railEl = null;
      removeOutline();
    }

    function renderOutlinePopover(focusInput = false) {
      if (destroyed || !enabled || !outlineOpen || !doc?.body) {
        try { outlineEl?.remove?.(); } catch {}
        outlineEl = null;
        return;
      }
      ensureStyle();
      const turns = getUserTurnElements();
      const starred = getStarredTurnSet();

      if (!outlineEl || outlineEl.isConnected === false) {
        outlineEl = coexist?.markOwnedNoTranslate
          ? coexist.markOwnedNoTranslate(doc.createElement('div'))
          : doc.createElement('div');
        outlineEl.className = 'ag-sag-rnav-outline';
        outlineEl.setAttribute('data-testid', OUTLINE_TESTID);
        doc.body.appendChild(outlineEl);
      }

      let inp = outlineEl.querySelector?.('[data-testid="ag-sag-rnav-outline-input"]');
      let listBox = outlineEl.querySelector?.('[data-testid="ag-sag-rnav-outline-list"]');
      let starBtn = outlineEl.querySelector?.('[data-testid="ag-sag-rnav-outline-star"]');

      if (!inp || !listBox) {
        while (outlineEl.firstChild) outlineEl.removeChild(outlineEl.firstChild);
        const head = doc.createElement('div');
        head.className = 'ag-sag-rnav-outline-head';

        inp = doc.createElement('input');
        inp.type = 'search';
        inp.className = 'ag-sag-search-input';
        inp.setAttribute('data-testid', 'ag-sag-rnav-outline-input');
        inp.placeholder = t('rnavOutlinePlaceholder', 'Filter turns (Enter to jump)…');
        inp.value = outlineQuery;
        inp.addEventListener('input', () => {
          outlineQuery = inp.value;
          populateOutlineList(listBox, getUserTurnElements(), getStarredTurnSet());
        });
        inp.addEventListener('keydown', (ev) => {
          if (ev?.key === 'Escape') {
            ev.preventDefault?.();
            removeOutline();
            return;
          }
          if (ev?.key === 'Enter') {
            ev.preventDefault?.();
            const firstItem = listBox.querySelector?.('[data-ag-sag-outline-idx]');
            if (firstItem) {
              const idx = Number(firstItem.getAttribute('data-ag-sag-outline-idx'));
              if (Number.isFinite(idx)) {
                jumpToTurn(idx);
                removeOutline();
              }
            }
          }
        });

        starBtn = doc.createElement('button');
        starBtn.type = 'button';
        starBtn.className = 'ag-sag-code-btn';
        starBtn.setAttribute('data-testid', 'ag-sag-rnav-outline-star');
        starBtn.addEventListener('click', () => {
          outlineStarOnly = !outlineStarOnly;
          starBtn.setAttribute('aria-pressed', String(outlineStarOnly));
          populateOutlineList(listBox, getUserTurnElements(), getStarredTurnSet());
        });

        const closeBtn = doc.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'ag-sag-code-btn';
        closeBtn.textContent = '×';
        closeBtn.title = t('rnavClose', 'Close');
        closeBtn.addEventListener('click', () => removeOutline());

        head.appendChild(inp);
        head.appendChild(starBtn);
        head.appendChild(closeBtn);
        outlineEl.appendChild(head);

        listBox = doc.createElement('div');
        listBox.className = 'ag-sag-rnav-outline-list';
        listBox.setAttribute('data-testid', 'ag-sag-rnav-outline-list');
        outlineEl.appendChild(listBox);
      }

      if (starBtn) {
        starBtn.textContent = `★ ${t('rnavOutlineStarOnly', 'Starred')}`;
        starBtn.setAttribute('aria-pressed', String(outlineStarOnly));
      }
      populateOutlineList(listBox, turns, starred);
      if (focusInput) {
        try { inp?.focus?.(); } catch {}
      }
    }

    function populateOutlineList(listBox, turns, starred) {
      if (!listBox) return;
      while (listBox.firstChild) listBox.removeChild(listBox.firstChild);
      const q = String(outlineQuery || '').trim().toLowerCase();
      let matched = 0;
      for (let i = 0; i < turns.length; i += 1) {
        const turnNum = i + 1;
        const isStar = starred.has(turnNum);
        if (outlineStarOnly && !isStar) continue;
        const rawText = String(turns[i]?.textContent || '').replace(/\s+/g, ' ').trim();
        if (q && !rawText.toLowerCase().includes(q) && !`#${turnNum}`.includes(q)) continue;
        matched += 1;
        const row = doc.createElement('button');
        row.type = 'button';
        row.className = 'ag-sag-rnav-outline-item';
        row.setAttribute('data-ag-sag-outline-idx', String(i));
        if (i === currentTurnIndex) row.setAttribute('data-active', '1');
        row.textContent = `#${turnNum}${isStar ? ' ★' : ''} ${rawText.slice(0, 72) || '(empty)'}`;
        row.addEventListener('click', () => {
          jumpToTurn(i);
          removeOutline();
        });
        listBox.appendChild(row);
      }
      if (matched === 0) {
        const empty = doc.createElement('div');
        empty.className = 'ag-sag-badge-note';
        empty.textContent = t('rnavOutlineEmpty', 'No matching turns');
        listBox.appendChild(empty);
      }
    }

    function openOutlineSearch() {
      if (destroyed || !enabled) return false;
      outlineOpen = true;
      renderOutlinePopover(true);
      return true;
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

      const outlineBtn = doc.createElement('button');
      outlineBtn.type = 'button';
      outlineBtn.className = 'ag-sag-rnav-step';
      outlineBtn.setAttribute('data-ag-sag-rnav-act', 'outline');
      outlineBtn.textContent = '☰';
      outlineBtn.title = t('rnavOutlineBtn', 'Search Outline (Alt+F)');
      outlineBtn.addEventListener('click', () => {
        outlineOpen = !outlineOpen;
        renderOutlinePopover(outlineOpen);
      });
      railEl.appendChild(outlineBtn);

      const foldAllBtn = doc.createElement('button');
      foldAllBtn.type = 'button';
      foldAllBtn.className = 'ag-sag-rnav-step';
      foldAllBtn.setAttribute('data-ag-sag-rnav-act', 'fold-all');
      foldAllBtn.textContent = '⊟';
      foldAllBtn.title = t('rnavFoldAllBtn', 'Toggle fold all code blocks & steps');
      foldAllBtn.addEventListener('click', () => {
        toggleFoldAllStepsAndCode();
      });
      railEl.appendChild(foldAllBtn);

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
      // Uncapped scrollable turn dots (no 30-turn truncation)
      for (let i = 0; i < turns.length; i += 1) {
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

      const bottomBtn = doc.createElement('button');
      bottomBtn.type = 'button';
      bottomBtn.className = 'ag-sag-rnav-step';
      bottomBtn.setAttribute('data-ag-sag-rnav-step', 'bottom');
      bottomBtn.textContent = '⤓';
      bottomBtn.title = t('rnavBottomTip', 'Scroll to bottom');
      bottomBtn.addEventListener('click', () => scrollToBottom());
      railEl.appendChild(bottomBtn);

      if (outlineOpen) renderOutlinePopover(false);
    }

    function findScopedScrollViewport() {
      const scope = getScope();
      const conv = getConversationContainer();
      const ok = (el) => Boolean(el && el.isConnected !== false);
      const hit =
        conv?.querySelector?.('[data-testid="autoscroll-viewport"]') ||
        (scope && scope !== doc ? scope.querySelector?.('[data-testid="autoscroll-viewport"]') : null);
      if (ok(hit)) return hit;
      const canScroll = (el) => {
        if (!ok(el) || (Number(el.scrollHeight) || 0) <= (Number(el.clientHeight) || 0) + 20) return false;
        try {
          const ov = String((win?.getComputedStyle || doc?.defaultView?.getComputedStyle)?.(el)?.overflowY || '');
          if (ov && !/(auto|scroll|overlay)/.test(ov)) return false;
        } catch {}
        return true;
      };
      if (conv) {
        if (canScroll(conv)) return conv;
        for (const el of conv.querySelectorAll?.('*') || []) if (canScroll(el)) return el;
        return conv;
      }
      return scope && scope !== doc ? scope : null;
    }

    function scrollToBottom() {
      if (destroyed || !enabled) return false;
      const vp = findScopedScrollViewport();
      if (!vp) return false;
      const targetTop = Math.max(0, Number(vp.scrollHeight) || 0);
      if (typeof vp.scrollTo === 'function') {
        try {
          vp.scrollTo({ top: targetTop, behavior: 'smooth' });
          return true;
        } catch {}
      }
      try {
        vp.scrollTop = targetTop;
        return true;
      } catch {
        return false;
      }
    }

    function onKeyDown(ev) {
      if (destroyed || !enabled) return;
      const key = String(ev?.key || '');
      if (key === 'Escape') {
        if (mermaidModalEl) {
          closeMermaidModal();
          ev.preventDefault?.();
          return;
        }
        if (outlineOpen) {
          removeOutline();
          ev.preventDefault?.();
          return;
        }
      }
      if (!ev?.altKey || ev?.ctrlKey || ev?.metaKey || ev?.shiftKey) return;
      if (isEditableTarget(ev?.target)) return;
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
      } else if (key.toLowerCase() === 'f') {
        if (openOutlineSearch()) {
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
        scanMermaidDiagrams();
        renderRail();
      }, 80);
      observerTimer?.unref?.();
    }

    function attachListeners() {
      if (!doc || keydownOff) return;
      doc.addEventListener?.('keydown', onKeyDown, true);
      keydownOff = () => doc.removeEventListener?.('keydown', onKeyDown, true);

      if (ctxSrc?.findPaneRootForNode) {
        const onPaneFocus = (ev) => {
          if (destroyed || !enabled || !ev?.target || isOwnedNode(ev.target)) return;
          const pane = ctxSrc.findPaneRootForNode(ev.target, doc);
          if (pane && pane !== activePaneEl) {
            activePaneEl = pane;
          }
        };
        doc.addEventListener?.('pointerdown', onPaneFocus, true);
        doc.addEventListener?.('focusin', onPaneFocus, true);
        paneTrackOff = () => {
          doc.removeEventListener?.('pointerdown', onPaneFocus, true);
          doc.removeEventListener?.('focusin', onPaneFocus, true);
        };
      }

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
      if (paneTrackOff) {
        try { paneTrackOff(); } catch {}
        paneTrackOff = null;
      }
      if (domObserver) {
        try { domObserver.disconnect(); } catch {}
        domObserver = null;
      }
    }

    function sync() {
      if (destroyed) return;
      if (!enabled) {
        restoreModifiedDetails();
        cleanupEnhancedCodeBlocks();
        cleanupMermaidButtons();
        removeRail();
        return;
      }
      scanCodeBlocks();
      scanMermaidDiagrams();
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
        restoreModifiedDetails();
        cleanupEnhancedCodeBlocks();
        cleanupMermaidButtons();
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
        mermaidCount: mermaidBtns.size,
        mermaidModalOpen: Boolean(mermaidModalEl && mermaidModalEl.isConnected !== false),
        outlineOpen: Boolean(outlineOpen && outlineEl && outlineEl.isConnected !== false),
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
      restoreModifiedDetails();
      cleanupEnhancedCodeBlocks();
      cleanupMermaidButtons();
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
      scrollToBottom,
      openOutlineSearch,
      toggleFoldAllStepsAndCode,
      openMermaidZoom,
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
