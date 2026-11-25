// Antigravity Session Guard — Compact Guard Controller (Module G, UMD, zero runtime deps)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSgCompactGuard = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  const THRESHOLD_PRESETS = ['off', 70, 75, 80, 85, 90];
  const COMPACT_CMD = '/compact';

  function resolveDep(globalKey, relPath) {
    if (globalRoot && globalRoot[globalKey]) return globalRoot[globalKey];
    if (typeof require === 'function') return require(relPath);
    return null;
  }

  function createCompactGuardController(options = {}) {
    const win = options.win || globalRoot;
    const doc = options.doc || win?.document || null;
    const storage = options.storage !== undefined ? options.storage : win?.localStorage || null;
    const i18n = options.i18n || resolveDep('__agSgI18n', './i18n.js');
    const coexist = options.coexist || resolveDep('__agSgCoexist', './coexist.js');
    const ctxSrc = options.contextSource || resolveDep('__agSgContextSource', './context-source.js');
    const exporter = options.exporter || resolveDep('__agSgPrecompactExport', './precompact-export.js');
    const styles = options.styles || resolveDep('__agSgStyles', './styles.js');

    let config = coexist.sanitizeConfig(options.config || coexist.readStoredConfig(storage) || coexist.DEFAULT_CONFIG);
    let destroyed = false;
    let blurred = false;
    let pollTimer = null;
    let countdownTimer = null;
    let toastTimer = null;
    let countdownRemaining = 0;
    let countdownCanceledForSession = new Set();
    let lastSnapshot = null;
    let popoverOpen = false;
    let bannerEl = null;
    let msgEl = null;
    let actionsEl = null;
    let primaryBtn = null;
    let fillBtn = null;
    let exportBtn = null;
    let downloadBtn = null;
    let cancelCdBtn = null;
    let dismissBtn = null;
    let gearBtn = null;
    let toastEl = null;
    let popEl = null;
    let styleEl = null;
    let composerListenerOff = null;
    const listeners = [];

    // Per-cascadeId session state for smart dismiss & auto-reset on compaction
    const sessionState = new Map();
    const getSess = (cid) => {
      const k = cid || 'default-session';
      let s = sessionState.get(k);
      if (!s) {
        s = { dismissedAtPct: null, lastCompactedCount: 0, autoSentAtPct: null };
        sessionState.set(k, s);
      }
      return s;
    };

    const getLang = () => (typeof options.getLang === 'function' ? i18n.normalizeLang(options.getLang()) : i18n.detectLang(doc, win));
    const S = () => i18n.getStrings(getLang());

    const setToast = (text, tone = '') => {
      if (!toastEl) return;
      if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
      toastEl.textContent = text || '';
      toastEl.hidden = !text;
      if (tone) toastEl.setAttribute('data-tone', tone);
      else toastEl.removeAttribute('data-tone');
      if (text) {
        toastTimer = setTimeout(() => {
          toastTimer = null;
          if (!destroyed && toastEl) toastEl.hidden = true;
        }, 3200);
        toastTimer?.unref?.();
      }
    };

    const stopCountdown = () => {
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
      countdownRemaining = 0;
    };

    const ensureStyle = () => {
      if (!doc || !styles) return;
      const existing = doc.getElementById?.(styles.STYLE_ID);
      if (existing) {
        styleEl = existing;
        return;
      }
      const el = doc.createElement('style');
      el.id = styles.STYLE_ID;
      el.textContent = styles.CORE_CSS;
      coexist.markOwnedNoTranslate(el);
      (doc.head || doc.documentElement || doc.body)?.appendChild?.(el);
      styleEl = el;
    };

    const findBannerAnchor = () => {
      if (!doc) return null;
      return (
        doc.querySelector?.('[data-testid="agent-input-box"]') ||
        doc.querySelector?.('.surface-composer-card') ||
        doc.querySelector?.('[data-testid="conversation-view"]') ||
        null
      );
    };

    const bindComposerDraftGuard = () => {
      if (composerListenerOff) {
        try { composerListenerOff(); } catch {}
        composerListenerOff = null;
      }
      const ed = ctxSrc.findComposerEditor(doc);
      if (!ed || typeof ed.addEventListener !== 'function') return;
      const onInput = () => {
        if (countdownTimer && ctxSrc.readComposerDraft(doc).length > 0) {
          stopCountdown();
          if (lastSnapshot?.cascadeId) countdownCanceledForSession.add(lastSnapshot.cascadeId);
          setToast(S().toastDraftProtected, 'warn');
          render();
        }
      };
      ed.addEventListener('input', onInput);
      composerListenerOff = () => ed.removeEventListener?.('input', onInput);
    };

    const insertCompactIntoComposer = ({ submit = false } = {}) => {
      const strings = S();
      if (ctxSrc.isTurnStreaming(doc) || lastSnapshot?.streaming) {
        setToast(strings.toastStreamingBlocked, 'warn');
        return { ok: false, reason: 'streaming' };
      }
      const existingDraft = ctxSrc.readComposerDraft(doc);
      if (existingDraft && existingDraft !== COMPACT_CMD) {
        setToast(strings.toastDraftProtected, 'warn');
        return { ok: false, reason: 'draft-present' };
      }

      const ed = ctxSrc.findComposerEditor(doc);
      if (!ed) return { ok: false, reason: 'no-editor' };

      try {
        ed.focus?.();
        const tag = String(ed.tagName || '').toUpperCase();
        if (tag === 'TEXTAREA' || tag === 'INPUT') {
          ed.value = COMPACT_CMD;
          ed.dispatchEvent?.(new (win.Event || Event)('input', { bubbles: true }));
        } else if (typeof doc.execCommand === 'function' && doc.execCommand('insertText', false, COMPACT_CMD)) {
          // inserted via execCommand
        } else {
          ed.textContent = COMPACT_CMD;
          ed.dispatchEvent?.(new (win.Event || Event)('input', { bubbles: true }));
        }
      } catch {
        return { ok: false, reason: 'insert-failed' };
      }

      if (submit) {
        if (typeof options.onSubmitCompact === 'function') {
          options.onSubmitCompact({ command: COMPACT_CMD, cascadeId: lastSnapshot?.cascadeId || '' });
        } else {
          const sendBtn =
            doc.querySelector?.('[data-testid="send-button"], [data-testid="input-send-button"], button[type="submit"]');
          if (sendBtn && !sendBtn.disabled && typeof sendBtn.click === 'function') {
            sendBtn.click();
          } else {
            const KEv = win.KeyboardEvent || globalThis.KeyboardEvent;
            if (typeof KEv === 'function') {
              ed.dispatchEvent?.(new KEv('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
            }
          }
        }
        const sess = getSess(lastSnapshot?.cascadeId);
        sess.dismissedAtPct = lastSnapshot?.usedPct ?? config.compactThreshold;
        sess.autoSentAtPct = lastSnapshot?.usedPct ?? config.compactThreshold;
        stopCountdown();
        setToast(strings.toastSent, 'ok');
        return { ok: true, submitted: true };
      }

      setToast(strings.toastFilled, 'ok');
      return { ok: true, submitted: false };
    };

    const handleExportMd = async ({ onlyBookmarked = false, download = false } = {}) => {
      const strings = S();
      const turns = exporter.extractConversationTurns(doc);
      const cid = lastSnapshot?.cascadeId || ctxSrc.detectCascadeId(doc, win);
      const bm = exporter.loadBookmarks(storage, cid);
      const built = exporter.buildRecapMarkdown({
        turns,
        bookmarks: bm,
        onlyBookmarked,
        cascadeId: cid,
        usedPct: lastSnapshot?.usedPct ?? null,
        usedLabel: lastSnapshot ? ctxSrc.formatTokens(lastSnapshot.usedTokens) : '',
        maxLabel: lastSnapshot ? ctxSrc.formatTokens(lastSnapshot.maxTokens) : '',
        strings,
      });
      if (!built.ok) {
        setToast(strings.toastExportEmpty, 'warn');
        return built;
      }
      if (download) {
        const filename = exporter.buildRecapFilename(cid, new Date(), { onlyBookmarked: onlyBookmarked && bm.size > 0 });
        const dl = exporter.downloadRecapMarkdown(built.markdown, filename, win, doc);
        const payload = { ...built, filename, downloaded: dl.ok };
        if (typeof options.onDownloadMarkdown === 'function') {
          options.onDownloadMarkdown(payload);
        }
        if (typeof options.onExportMarkdown === 'function') {
          options.onExportMarkdown(payload);
        }
        setToast(i18n.formatTemplate(strings.toastDownloaded, { file: filename, turns: built.count }), 'ok');
        return payload;
      }
      await exporter.copyRecapToClipboard(built.markdown, win);
      if (typeof options.onExportMarkdown === 'function') {
        options.onExportMarkdown(built);
      }
      setToast(i18n.formatTemplate(strings.toastExported, { turns: built.count }), 'ok');
      return built;
    };

    const mkBtn = (cls, text, attrKey, onClick) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.textContent = text;
      if (attrKey) b.setAttribute('data-ag-sg-act', attrKey);
      b.addEventListener('click', (ev) => {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
        onClick();
      });
      return b;
    };

    const renderPopover = () => {
      if (!popEl) return;
      popEl.hidden = !popoverOpen;
      if (!popoverOpen) return;
      const strings = S();
      while (popEl.firstChild) popEl.removeChild(popEl.firstChild);

      const title = doc.createElement('div');
      title.className = 'ag-sg-pop-title';
      title.textContent = strings.cfgTitle;
      popEl.appendChild(title);

      // Row 1: Threshold presets
      const r1 = doc.createElement('div');
      r1.className = 'ag-sg-pop-row';
      const l1 = doc.createElement('span');
      l1.className = 'ag-sg-pop-lbl';
      l1.textContent = strings.cfgThreshold;
      const seg1 = doc.createElement('div');
      seg1.className = 'ag-sg-seg';
      for (const preset of THRESHOLD_PRESETS) {
        const b = doc.createElement('button');
        b.type = 'button';
        b.textContent = preset === 'off' ? strings.cfgThresholdOff : `${preset}%`;
        b.setAttribute('data-ag-sg-th', String(preset));
        b.setAttribute('aria-pressed', String(config.compactThreshold === preset));
        b.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          updateConfig({ compactThreshold: preset });
        });
        seg1.appendChild(b);
      }
      r1.appendChild(l1);
      r1.appendChild(seg1);
      popEl.appendChild(r1);

      // Row 2: Trigger mode
      const r2 = doc.createElement('div');
      r2.className = 'ag-sg-pop-row';
      const l2 = doc.createElement('span');
      l2.className = 'ag-sg-pop-lbl';
      l2.textContent = strings.cfgMode;
      const seg2 = doc.createElement('div');
      seg2.className = 'ag-sg-seg';
      const modes = [
        ['confirm', strings.cfgModeConfirm],
        ['fill-only', strings.cfgModeFill],
        ['auto-countdown', strings.cfgModeCountdown],
      ];
      for (const [mKey, mLabel] of modes) {
        const b = doc.createElement('button');
        b.type = 'button';
        b.textContent = mLabel;
        b.setAttribute('data-ag-sg-mode', mKey);
        b.setAttribute('aria-pressed', String(config.compactTriggerMode === mKey));
        b.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          updateConfig({ compactTriggerMode: mKey });
        });
        seg2.appendChild(b);
      }
      r2.appendChild(l2);
      r2.appendChild(seg2);
      popEl.appendChild(r2);

      // Row 3: Modules (Turn Bookmarks & Session Radar)
      const r3 = doc.createElement('div');
      r3.className = 'ag-sg-pop-row';
      const l3 = doc.createElement('span');
      l3.className = 'ag-sg-pop-lbl';
      l3.textContent = strings.cfgModules;
      const seg3 = doc.createElement('div');
      seg3.className = 'ag-sg-seg';
      const modDefs = [
        ['outlineBookmarks', strings.cfgModBookmarks],
        ['sessionRadar', strings.cfgModRadar],
      ];
      for (const [mKey, mLabel] of modDefs) {
        const b = doc.createElement('button');
        b.type = 'button';
        b.textContent = mLabel;
        b.setAttribute('data-ag-sg-mod', mKey);
        b.setAttribute('aria-pressed', String(Boolean(config.modules[mKey])));
        b.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          updateConfig({ modules: { ...config.modules, [mKey]: !config.modules[mKey] } });
        });
        seg3.appendChild(b);
      }
      r3.appendChild(l3);
      r3.appendChild(seg3);
      popEl.appendChild(r3);

      // Row 4: Blurred OS Notification mode (when Session Radar is active)
      if (config.modules.sessionRadar) {
        const r4 = doc.createElement('div');
        r4.className = 'ag-sg-pop-row';
        const l4 = doc.createElement('span');
        l4.className = 'ag-sg-pop-lbl';
        l4.textContent = strings.cfgRadarNotify;
        const seg4 = doc.createElement('div');
        seg4.className = 'ag-sg-seg';
        for (const [nKey, nLabel] of [
          ['off', strings.cfgNotifyOff],
          ['awaiting', strings.cfgNotifyAwaiting],
          ['all', strings.cfgNotifyAll],
        ]) {
          const b = doc.createElement('button');
          b.type = 'button';
          b.textContent = nLabel;
          b.setAttribute('data-ag-sg-notify', nKey);
          b.setAttribute('aria-pressed', String(config.radarNotifyMode === nKey));
          b.addEventListener('click', (ev) => {
            ev?.preventDefault?.();
            ev?.stopPropagation?.();
            updateConfig({ radarNotifyMode: nKey });
          });
          seg4.appendChild(b);
        }
        r4.appendChild(l4);
        r4.appendChild(seg4);
        popEl.appendChild(r4);
      }

      const hint = doc.createElement('p');
      hint.className = 'ag-sg-pop-hint';
      hint.textContent = strings.cfgHint;
      popEl.appendChild(hint);
    };

    const ensureBanner = () => {
      if (!doc) return null;
      const anchor = findBannerAnchor();
      if (!anchor || !anchor.parentElement) return null;
      ensureStyle();
      if (bannerEl && bannerEl.isConnected !== false) return bannerEl;

      const wrap = coexist.markOwnedNoTranslate(doc.createElement('div'));
      wrap.className = 'ag-sg-banner';
      wrap.setAttribute('role', 'status');
      wrap.setAttribute('data-testid', 'ag-sg-compact-banner');
      wrap.hidden = true;

      const left = doc.createElement('div');
      left.className = 'ag-sg-left';
      const dot = doc.createElement('span');
      dot.className = 'ag-sg-dot';
      dot.setAttribute('aria-hidden', 'true');
      msgEl = doc.createElement('span');
      msgEl.className = 'ag-sg-msg';
      left.appendChild(dot);
      left.appendChild(msgEl);

      actionsEl = doc.createElement('div');
      actionsEl.className = 'ag-sg-actions';

      primaryBtn = mkBtn('ag-sg-btn ag-sg-btn-primary', '', 'compact-now', () => {
        const shouldSubmit = config.compactTriggerMode !== 'fill-only';
        insertCompactIntoComposer({ submit: shouldSubmit });
        render();
      });
      fillBtn = mkBtn('ag-sg-btn', '', 'fill-only', () => {
        stopCountdown();
        insertCompactIntoComposer({ submit: false });
        render();
      });
      exportBtn = mkBtn('ag-sg-btn', '', 'export-md', () => {
        const cid = lastSnapshot?.cascadeId || ctxSrc.detectCascadeId(doc, win);
        const bmCount = exporter.loadBookmarks(storage, cid).size;
        void handleExportMd({ onlyBookmarked: bmCount > 0, download: false });
      });
      downloadBtn = mkBtn('ag-sg-btn', '', 'download-md', () => {
        const cid = lastSnapshot?.cascadeId || ctxSrc.detectCascadeId(doc, win);
        const bmCount = exporter.loadBookmarks(storage, cid).size;
        void handleExportMd({ onlyBookmarked: bmCount > 0, download: true });
      });
      cancelCdBtn = mkBtn('ag-sg-btn', '', 'cancel-countdown', () => {
        stopCountdown();
        if (lastSnapshot?.cascadeId) countdownCanceledForSession.add(lastSnapshot.cascadeId);
        render();
      });
      gearBtn = mkBtn('ag-sg-btn ag-sg-btn-icon', '⚙', 'settings', () => {
        popoverOpen = !popoverOpen;
        renderPopover();
      });
      dismissBtn = mkBtn('ag-sg-btn', '', 'dismiss', () => {
        stopCountdown();
        if (lastSnapshot) {
          getSess(lastSnapshot.cascadeId).dismissedAtPct = lastSnapshot.usedPct;
        }
        popoverOpen = false;
        render();
      });

      actionsEl.appendChild(primaryBtn);
      actionsEl.appendChild(fillBtn);
      actionsEl.appendChild(exportBtn);
      actionsEl.appendChild(downloadBtn);
      actionsEl.appendChild(cancelCdBtn);
      actionsEl.appendChild(gearBtn);
      actionsEl.appendChild(dismissBtn);

      toastEl = doc.createElement('div');
      toastEl.className = 'ag-sg-toast';
      toastEl.hidden = true;

      popEl = doc.createElement('div');
      popEl.className = 'ag-sg-popover';
      popEl.setAttribute('data-testid', 'ag-sg-settings-popover');
      popEl.hidden = true;

      wrap.appendChild(left);
      wrap.appendChild(actionsEl);
      wrap.appendChild(toastEl);
      wrap.appendChild(popEl);

      anchor.parentElement.insertBefore(wrap, anchor);
      bannerEl = wrap;
      bindComposerDraftGuard();
      return bannerEl;
    };

    const shouldShowForSnapshot = (snap) => {
      if (!snap || config.compactThreshold === 'off' || !config.modules.compactGuard) return false;
      const th = Number(config.compactThreshold);
      if (!Number.isFinite(th)) return false;

      const sess = getSess(snap.cascadeId);

      // Reset dismiss state if compaction happened or context dropped cleanly below threshold - resetDropPct
      if (snap.compactedCount > sess.lastCompactedCount || snap.usedPct <= th - config.resetDropPct) {
        sess.lastCompactedCount = Math.max(sess.lastCompactedCount, snap.compactedCount);
        sess.dismissedAtPct = null;
        sess.autoSentAtPct = null;
        countdownCanceledForSession.delete(snap.cascadeId);
      } else if (snap.compactedCount > sess.lastCompactedCount) {
        sess.lastCompactedCount = snap.compactedCount;
      }

      if (snap.usedPct < th) return false;

      if (sess.dismissedAtPct !== null && snap.usedPct < sess.dismissedAtPct + config.rearmDeltaPct) {
        return false;
      }
      return true;
    };

    const maybeManageCountdown = (snap, visible) => {
      const canCountdown =
        visible &&
        config.compactTriggerMode === 'auto-countdown' &&
        !snap.streaming &&
        !snap.draft &&
        !coexist.isWindowHibernated(doc, win, blurred) &&
        !countdownCanceledForSession.has(snap.cascadeId) &&
        getSess(snap.cascadeId).autoSentAtPct === null;

      if (!canCountdown) {
        if (countdownTimer) stopCountdown();
        return;
      }
      if (countdownTimer) return;

      countdownRemaining = config.countdownSeconds;
      countdownTimer = setInterval(() => {
        if (destroyed) { stopCountdown(); return; }
        if (
          coexist.isWindowHibernated(doc, win, blurred) ||
          ctxSrc.isTurnStreaming(doc) ||
          ctxSrc.readComposerDraft(doc).length > 0
        ) {
          stopCountdown();
          if (ctxSrc.readComposerDraft(doc).length > 0) {
            if (lastSnapshot?.cascadeId) countdownCanceledForSession.add(lastSnapshot.cascadeId);
            setToast(S().toastDraftProtected, 'warn');
          }
          render();
          return;
        }
        countdownRemaining -= 1;
        if (countdownRemaining <= 0) {
          stopCountdown();
          insertCompactIntoComposer({ submit: true });
        }
        render();
      }, 1000);
      countdownTimer?.unref?.();
    };

    const render = () => {
      if (destroyed) return;
      const snap = lastSnapshot;
      const visible = shouldShowForSnapshot(snap);
      if (!visible && !popoverOpen) {
        stopCountdown();
        if (bannerEl) bannerEl.hidden = true;
        return;
      }
      const el = ensureBanner();
      if (!el) return;

      maybeManageCountdown(snap, visible);

      const strings = S();
      const pct = snap ? snap.usedPct : 0;
      const used = snap ? ctxSrc.formatTokens(snap.usedTokens) : '—';
      const max = snap ? ctxSrc.formatTokens(snap.maxTokens) : '—';
      const isOverflow = pct >= 100;
      const isCounting = Boolean(countdownTimer && countdownRemaining > 0);

      el.hidden = !visible && !popoverOpen;
      el.setAttribute('data-severity', isCounting ? 'countdown' : isOverflow ? 'overflow' : 'warn');

      if (isCounting) {
        msgEl.textContent = i18n.formatTemplate(strings.pillCountdown, { pct, sec: countdownRemaining });
      } else if (snap?.streaming) {
        msgEl.textContent = i18n.formatTemplate(strings.pillStreaming, { pct });
      } else if (isOverflow) {
        msgEl.textContent = i18n.formatTemplate(strings.pillOverflow, { pct, used, max });
      } else {
        msgEl.textContent = i18n.formatTemplate(strings.pillReached, { pct, used, max });
      }

      primaryBtn.textContent = config.compactTriggerMode === 'fill-only' ? strings.btnFillOnly : strings.btnCompactNow;
      primaryBtn.disabled = Boolean(snap?.streaming);
      fillBtn.textContent = strings.btnFillOnly;
      fillBtn.hidden = config.compactTriggerMode === 'fill-only';
      fillBtn.disabled = Boolean(snap?.streaming);
      const curCid = lastSnapshot?.cascadeId || ctxSrc.detectCascadeId(doc, win);
      const bmCount = exporter.loadBookmarks(storage, curCid).size;
      exportBtn.textContent =
        bmCount > 0 && strings.btnExportBmMd
          ? i18n.formatTemplate(strings.btnExportBmMd, { n: bmCount })
          : strings.btnExportMd;
      exportBtn.hidden = !config.modules.precompactExport;
      downloadBtn.textContent = strings.btnDownloadMd;
      downloadBtn.title = strings.btnDownloadMdTitle;
      downloadBtn.setAttribute('aria-label', strings.btnDownloadMdTitle);
      downloadBtn.hidden = !config.modules.precompactExport;
      cancelCdBtn.textContent = strings.btnCancelCountdown;
      cancelCdBtn.hidden = !isCounting;
      gearBtn.title = strings.btnSettings;
      gearBtn.setAttribute('aria-label', strings.btnSettings);
      dismissBtn.textContent = strings.btnDismiss;

      renderPopover();
    };

    async function evaluateNow() {
      if (destroyed || coexist.isWindowHibernated(doc, win, blurred)) return lastSnapshot;
      if (config.compactThreshold === 'off' || !config.modules.compactGuard) {
        stopCountdown();
        if (bannerEl && !popoverOpen) bannerEl.hidden = true;
        return lastSnapshot;
      }
      const snap = await ctxSrc.sampleContextState({
        win,
        doc,
        getContextSnapshot: options.getContextSnapshot,
      });
      lastSnapshot = snap;
      render();
      return snap;
    }

    const stopPoll = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const startPoll = () => {
      stopPoll();
      if (destroyed || options.autoPoll === false || coexist.isWindowHibernated(doc, win, blurred)) return;
      const intervalMs = Math.max(500, Number(options.pollIntervalMs) || 3000);
      pollTimer = setInterval(() => {
        if (destroyed || coexist.isWindowHibernated(doc, win, blurred)) {
          stopPoll();
          stopCountdown();
          return;
        }
        void evaluateNow();
      }, intervalMs);
      pollTimer?.unref?.();
    };

    function updateConfig(patch) {
      if (destroyed) return config;
      config = coexist.sanitizeConfig({ ...config, ...(patch || {}) }, config);
      if (options.persistConfig !== false) coexist.writeStoredConfig(storage, config);
      if (config.compactTriggerMode !== 'auto-countdown' || config.compactThreshold === 'off') {
        stopCountdown();
      }
      render();
      if (typeof options.onConfigChange === 'function') {
        try { options.onConfigChange({ ...config }); } catch {}
      }
      return { ...config };
    }

    const addL = (target, ev, fn) => {
      if (!target || typeof target.addEventListener !== 'function') return;
      target.addEventListener(ev, fn);
      listeners.push(() => target.removeEventListener?.(ev, fn));
    };

    addL(win, 'blur', () => {
      blurred = true;
      stopPoll();
      stopCountdown();
    });
    addL(win, 'focus', () => {
      blurred = false;
      void evaluateNow();
      startPoll();
    });
    addL(doc, 'visibilitychange', () => {
      if (doc?.hidden) {
        stopPoll();
        stopCountdown();
      } else {
        blurred = false;
        void evaluateNow();
        startPoll();
      }
    });

    function openSettingsPopover() {
      popoverOpen = true;
      ensureBanner();
      render();
    }

    function getDebugState() {
      return {
        destroyed,
        config: { ...config, modules: { ...config.modules } },
        visible: Boolean(bannerEl && !bannerEl.hidden),
        popoverOpen,
        countdownActive: Boolean(countdownTimer),
        countdownRemaining,
        pollActive: Boolean(pollTimer),
        hibernated: coexist.isWindowHibernated(doc, win, blurred),
        lastSnapshot: lastSnapshot ? { ...lastSnapshot } : null,
      };
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      stopPoll();
      stopCountdown();
      if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
      if (composerListenerOff) { try { composerListenerOff(); } catch {} composerListenerOff = null; }
      while (listeners.length) {
        try { listeners.pop()(); } catch {}
      }
      try { bannerEl?.remove?.(); } catch {}
      try { styleEl?.remove?.(); } catch {}
      bannerEl = msgEl = actionsEl = primaryBtn = fillBtn = exportBtn = downloadBtn = cancelCdBtn = dismissBtn = gearBtn = toastEl = popEl = styleEl = null;
      sessionState.clear();
      countdownCanceledForSession.clear();
    }

    startPoll();
    if (options.autoPoll !== false) void evaluateNow();

    return {
      evaluateNow,
      updateConfig,
      getConfig: () => ({ ...config, modules: { ...config.modules } }),
      insertCompact: insertCompactIntoComposer,
      exportMarkdown: handleExportMd,
      downloadMarkdown: (opts) => handleExportMd({ ...(opts || {}), download: true }),
      openSettingsPopover,
      getDebugState,
      destroy,
    };
  }

  return { THRESHOLD_PRESETS, COMPACT_CMD, createCompactGuardController };
});
