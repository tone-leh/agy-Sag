// Antigravity Session Guard — Compact Guard Controller (Module G + Smart Focus + Post-Compact Recovery + Watchdog, UMD)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSgCompactGuard = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  const THRESHOLD_PRESETS = ['off', 70, 75, 80, 85, 90];
  const STALL_PRESETS = ['off', 120, 180, 300];
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
    const handoff = options.handoff || resolveDep('__agSgRecoveryHandoff', './recovery-handoff.js');
    const watchdogMod = options.watchdogMod || resolveDep('__agSgSessionWatchdog', './session-watchdog.js');
    const styles = options.styles || resolveDep('__agSgStyles', './styles.js');

    let config = coexist.sanitizeConfig(options.config || coexist.readStoredConfig(storage) || coexist.DEFAULT_CONFIG);
    const watchdog = watchdogMod?.createSessionWatchdog
      ? watchdogMod.createSessionWatchdog({
          enabled: Boolean(config.modules.sessionWatchdog),
          stallThresholdSeconds: config.stallThresholdSeconds,
          now: options.now,
        })
      : null;

    let destroyed = false;
    let blurred = false;
    let pollTimer = null;
    let countdownTimer = null;
    let toastTimer = null;
    let countdownRemaining = 0;
    let countdownCanceledForSession = new Set();
    let lastSnapshot = null;
    let lastWatchdog = null;
    let activeRecovery = null;
    let popoverOpen = false;
    let bannerEl = null;
    let recoveryEl = null;
    let recoveryMsgEl = null;
    let recoveryFillBtn = null;
    let recoveryCopyBtn = null;
    let recoveryDismissBtn = null;
    let msgEl = null;
    let focusTagEl = null;
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
    let activePaneEl = null;
    let composerListenerOff = null;
    const listeners = [];
    const getScope = () => (ctxSrc.resolveActivePaneScope ? ctxSrc.resolveActivePaneScope(doc, activePaneEl) : doc);

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
        }, 3400);
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

    const findBannerAnchor = (scope = getScope()) => {
      if (!doc) return null;
      return (
        scope?.querySelector?.('[data-testid="agent-input-box"]') ||
        scope?.querySelector?.('.surface-composer-card') ||
        scope?.querySelector?.('[data-testid="conversation-view"]') ||
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
      const ed = ctxSrc.findComposerEditor(doc, getScope());
      if (!ed || typeof ed.addEventListener !== 'function') return;
      const onInput = () => {
        if (countdownTimer && ctxSrc.readComposerDraft(doc, getScope()).length > 0) {
          stopCountdown();
          if (lastSnapshot?.cascadeId) countdownCanceledForSession.add(lastSnapshot.cascadeId);
          setToast(S().toastDraftProtected, 'warn');
          render();
        }
      };
      ed.addEventListener('input', onInput);
      composerListenerOff = () => ed.removeEventListener?.('input', onInput);
    };

    const getFocusLabel = (strings) => {
      if (config.compactFocusPreset === 'code-errors') return strings.cfgFocusCode;
      if (config.compactFocusPreset === 'bookmarks') return strings.cfgFocusBookmarks;
      if (config.compactFocusPreset === 'custom') return strings.cfgFocusCustom;
      return strings.cfgFocusDefault;
    };

    function buildCompactCommand() {
      const strings = S();
      const preset = config.compactFocusPreset || 'default';
      if (preset === 'default') return COMPACT_CMD;
      if (preset === 'code-errors') {
        return `${COMPACT_CMD} ${strings.compactFocusCodePrompt}`;
      }
      if (preset === 'custom') {
        const custom = exporter
          ? exporter.redactSecrets(config.customCompactFocus || '').replace(/\s+/g, ' ').trim()
          : String(config.customCompactFocus || '').trim();
        return custom ? `${COMPACT_CMD} ${custom}` : COMPACT_CMD;
      }
      if (preset === 'bookmarks') {
        const scope = getScope();
        const cid = lastSnapshot?.cascadeId || ctxSrc.detectCascadeId(doc, win, scope);
        const bm = exporter?.loadBookmarks?.(storage, cid) || new Set();
        const turns = exporter?.extractConversationTurns?.(doc, scope) || [];
        const starred = turns.filter((t) => bm.has(t.turnNum)).slice(-3);
        if (starred.length === 0) {
          return `${COMPACT_CMD} ${strings.compactFocusBookmarksFallback}`;
        }
        const summary = starred
          .map((t) => {
            const snippet = exporter
              .redactSecrets(t.user || t.assistant || '')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 72);
            return `#${t.turnNum} ${snippet}`;
          })
          .join('; ');
        return `${COMPACT_CMD} ${strings.compactFocusBookmarksPrefix}${summary}`.slice(0, 320);
      }
      return COMPACT_CMD;
    }

    function captureRecoverySnapshot() {
      if (!handoff) return null;
      const scope = getScope();
      const cid = lastSnapshot?.cascadeId || ctxSrc.detectCascadeId(doc, win, scope);
      return handoff.capturePreCompactSnapshot({
        doc,
        scopeEl: scope,
        storage,
        cascadeId: cid,
        usedPct: lastSnapshot?.usedPct ?? null,
        strings: S(),
      });
    }

    const writeTextIntoComposer = (text, { allowSameAs = [] } = {}) => {
      const strings = S();
      const scope = getScope();
      const existingDraft = ctxSrc.readComposerDraft(doc, scope);
      if (existingDraft && !allowSameAs.includes(existingDraft)) {
        setToast(strings.toastDraftProtected, 'warn');
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
        return { ok: true, editor: ed };
      } catch {
        return { ok: false, reason: 'insert-failed' };
      }
    };

    const insertCompactIntoComposer = ({ submit = false } = {}) => {
      const strings = S();
      const scope = getScope();
      if (ctxSrc.isTurnStreaming(doc, scope) || lastSnapshot?.streaming) {
        setToast(strings.toastStreamingBlocked, 'warn');
        return { ok: false, reason: 'streaming' };
      }
      const cmd = buildCompactCommand();
      const written = writeTextIntoComposer(cmd, { allowSameAs: [COMPACT_CMD, cmd] });
      if (!written.ok) return written;

      // Silently preserve pre-compact recovery snapshot for seamless post-compact handoff
      captureRecoverySnapshot();

      if (submit) {
        if (typeof options.onSubmitCompact === 'function') {
          options.onSubmitCompact({
            command: cmd,
            preset: config.compactFocusPreset,
            cascadeId: lastSnapshot?.cascadeId || '',
          });
        } else {
          const sendSel =
            '[data-testid="agent-input-box"] [data-testid="input-send-button"], [data-testid="agent-input-box"] [data-testid="send-button"], [data-testid="send-button"], [data-testid="input-send-button"], [data-testid="agent-input-box"] button[aria-label*="Send" i], [data-testid="agent-input-box"] button[aria-label*="发送"], button[type="submit"]';
          const sendBtn = scope?.querySelector?.(sendSel) || doc.querySelector?.(sendSel);
          if (sendBtn && !sendBtn.disabled && typeof sendBtn.click === 'function') {
            sendBtn.click();
          } else {
            const KEv = win.KeyboardEvent || globalThis.KeyboardEvent;
            if (typeof KEv === 'function') {
              written.editor.dispatchEvent?.(new KEv('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
            }
          }
        }
        const sess = getSess(lastSnapshot?.cascadeId);
        sess.dismissedAtPct = lastSnapshot?.usedPct ?? config.compactThreshold;
        sess.autoSentAtPct = lastSnapshot?.usedPct ?? config.compactThreshold;
        stopCountdown();
        const shortCmd = cmd.length > 36 ? `${cmd.slice(0, 36)}…` : cmd;
        setToast(i18n.formatTemplate(strings.toastSent, { cmd: shortCmd }), 'ok');
        return { ok: true, submitted: true, command: cmd };
      }

      const shortCmd = cmd.length > 36 ? `${cmd.slice(0, 36)}…` : cmd;
      setToast(i18n.formatTemplate(strings.toastFilled, { cmd: shortCmd }), 'ok');
      return { ok: true, submitted: false, command: cmd };
    };

    const handleExportMd = async ({ onlyBookmarked = false, download = false } = {}) => {
      const strings = S();
      const scope = getScope();
      const turns = exporter.extractConversationTurns(doc, scope);
      const cid = lastSnapshot?.cascadeId || ctxSrc.detectCascadeId(doc, win, scope);
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

    const ensureRecoveryBar = () => {
      if (!doc) return null;
      const anchor = findBannerAnchor();
      if (!anchor || !anchor.parentElement) return null;
      ensureStyle();
      if (recoveryEl && recoveryEl.isConnected !== false) {
        if (recoveryEl.parentElement !== anchor.parentElement) {
          anchor.parentElement.insertBefore(recoveryEl, anchor);
        }
        return recoveryEl;
      }

      const bar = coexist.markOwnedNoTranslate(doc.createElement('div'));
      bar.className = 'ag-sg-recovery-bar';
      bar.setAttribute('role', 'status');
      bar.setAttribute('data-testid', 'ag-sg-recovery-bar');
      bar.hidden = true;

      const left = doc.createElement('div');
      left.className = 'ag-sg-left';
      const dot = doc.createElement('span');
      dot.className = 'ag-sg-recovery-dot';
      dot.setAttribute('aria-hidden', 'true');
      recoveryMsgEl = doc.createElement('span');
      recoveryMsgEl.className = 'ag-sg-msg';
      left.appendChild(dot);
      left.appendChild(recoveryMsgEl);

      const acts = doc.createElement('div');
      acts.className = 'ag-sg-actions';

      recoveryFillBtn = mkBtn('ag-sg-btn ag-sg-btn-primary', '', 'recovery-fill', () => {
        if (!activeRecovery?.prompt) return;
        const written = writeTextIntoComposer(activeRecovery.prompt, { allowSameAs: [activeRecovery.prompt] });
        if (written.ok) {
          if (typeof options.onRecoveryFill === 'function') options.onRecoveryFill(activeRecovery);
          handoff?.clearSnapshot?.(storage, activeRecovery.cascadeId);
          activeRecovery = null;
          renderRecoveryBar();
          setToast(S().recoveryFilledToast, 'ok');
        }
      });

      recoveryCopyBtn = mkBtn('ag-sg-btn', '', 'recovery-copy', async () => {
        if (!activeRecovery?.prompt) return;
        await exporter?.copyRecapToClipboard?.(activeRecovery.prompt, win);
        if (typeof options.onRecoveryCopy === 'function') options.onRecoveryCopy(activeRecovery);
        setToast(S().recoveryCopiedToast, 'ok');
      });

      recoveryDismissBtn = mkBtn('ag-sg-btn', '', 'recovery-dismiss', () => {
        if (activeRecovery?.cascadeId) handoff?.clearSnapshot?.(storage, activeRecovery.cascadeId);
        activeRecovery = null;
        renderRecoveryBar();
      });

      acts.appendChild(recoveryFillBtn);
      acts.appendChild(recoveryCopyBtn);
      acts.appendChild(recoveryDismissBtn);

      bar.appendChild(left);
      bar.appendChild(acts);
      anchor.parentElement.insertBefore(bar, anchor);
      recoveryEl = bar;
      return recoveryEl;
    };

    const renderRecoveryBar = () => {
      if (destroyed) return;
      if (!activeRecovery || !activeRecovery.prompt) {
        if (recoveryEl) recoveryEl.hidden = true;
        return;
      }
      const el = ensureRecoveryBar();
      if (!el) return;
      const strings = S();
      el.hidden = false;
      recoveryMsgEl.textContent = i18n.formatTemplate(strings.recoveryMsg, { n: activeRecovery.anchorCount || 1 });
      recoveryFillBtn.textContent = strings.recoveryFillBtn;
      recoveryCopyBtn.textContent = strings.recoveryCopyBtn;
      recoveryDismissBtn.textContent = strings.recoveryDismissBtn;
    };

    const renderPopover = () => {
      if (!popEl) return;
      popEl.hidden = !popoverOpen;
      if (!popoverOpen) return;
      const strings = S();
      while (popEl.firstChild) popEl.removeChild(popEl.firstChild);

      const title = doc.createElement('div');
      title.className = 'ag-sg-pop-title';
      const titleTxt = doc.createElement('span');
      titleTxt.textContent = strings.cfgTitle;
      title.appendChild(titleTxt);

      if (typeof options.onOpenVault === 'function') {
        const vaultBtn = doc.createElement('button');
        vaultBtn.type = 'button';
        vaultBtn.className = 'ag-sg-btn';
        vaultBtn.setAttribute('data-ag-sg-act', 'open-vault');
        vaultBtn.textContent = strings.bmOpenVaultBtn;
        vaultBtn.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          popoverOpen = false;
          renderPopover();
          options.onOpenVault();
        });
        title.appendChild(vaultBtn);
      }
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
      for (const [mKey, mLabel] of [
        ['confirm', strings.cfgModeConfirm],
        ['fill-only', strings.cfgModeFill],
        ['auto-countdown', strings.cfgModeCountdown],
      ]) {
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

      // Row 3: Smart /compact Focus Presets
      const rFocus = doc.createElement('div');
      rFocus.className = 'ag-sg-pop-row';
      const lFocus = doc.createElement('span');
      lFocus.className = 'ag-sg-pop-lbl';
      lFocus.textContent = strings.cfgFocus;
      const segFocus = doc.createElement('div');
      segFocus.className = 'ag-sg-seg';
      for (const [fKey, fLabel] of [
        ['default', strings.cfgFocusDefault],
        ['code-errors', strings.cfgFocusCode],
        ['bookmarks', strings.cfgFocusBookmarks],
        ['custom', strings.cfgFocusCustom],
      ]) {
        const b = doc.createElement('button');
        b.type = 'button';
        b.textContent = fLabel;
        b.setAttribute('data-ag-sg-focus', fKey);
        b.setAttribute('aria-pressed', String(config.compactFocusPreset === fKey));
        b.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          updateConfig({ compactFocusPreset: fKey });
        });
        segFocus.appendChild(b);
      }
      rFocus.appendChild(lFocus);
      rFocus.appendChild(segFocus);
      if (config.compactFocusPreset === 'custom') {
        const inp = doc.createElement('input');
        inp.type = 'text';
        inp.className = 'ag-sg-pop-input';
        inp.setAttribute('data-ag-sg-custom-focus', '1');
        inp.placeholder = strings.cfgFocusCustomPlaceholder;
        inp.value = config.customCompactFocus || '';
        inp.addEventListener('input', () => {
          config = coexist.sanitizeConfig({ ...config, customCompactFocus: inp.value }, config);
          if (options.persistConfig !== false) coexist.writeStoredConfig(storage, config);
        });
        rFocus.appendChild(inp);
      }
      popEl.appendChild(rFocus);

      // Row 4: Stall Watchdog timeout presets
      const rStall = doc.createElement('div');
      rStall.className = 'ag-sg-pop-row';
      const lStall = doc.createElement('span');
      lStall.className = 'ag-sg-pop-lbl';
      lStall.textContent = strings.cfgStall;
      const segStall = doc.createElement('div');
      segStall.className = 'ag-sg-seg';
      for (const sec of STALL_PRESETS) {
        const b = doc.createElement('button');
        b.type = 'button';
        b.textContent = sec === 'off' ? strings.cfgStallOff : `${Math.round(sec / 60)}m`;
        b.setAttribute('data-ag-sg-stall', String(sec));
        b.setAttribute('aria-pressed', String(config.stallThresholdSeconds === sec));
        b.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          updateConfig({ stallThresholdSeconds: sec });
        });
        segStall.appendChild(b);
      }
      rStall.appendChild(lStall);
      rStall.appendChild(segStall);
      popEl.appendChild(rStall);

      // Row 5: Modules
      const r3 = doc.createElement('div');
      r3.className = 'ag-sg-pop-row';
      const l3 = doc.createElement('span');
      l3.className = 'ag-sg-pop-lbl';
      l3.textContent = strings.cfgModules;
      const seg3 = doc.createElement('div');
      seg3.className = 'ag-sg-seg';
      for (const [mKey, mLabel] of [
        ['outlineBookmarks', strings.cfgModBookmarks],
        ['sessionRadar', strings.cfgModRadar],
        ['sessionWatchdog', strings.cfgModWatchdog],
      ]) {
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

      // Row 6: Blurred OS Notification mode (when Session Radar is active)
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
      if (bannerEl && bannerEl.isConnected !== false) {
        if (bannerEl.parentElement !== anchor.parentElement) {
          anchor.parentElement.insertBefore(bannerEl, anchor);
          bindComposerDraftGuard();
        }
        return bannerEl;
      }

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
      focusTagEl = doc.createElement('span');
      focusTagEl.className = 'ag-sg-focus-tag';
      focusTagEl.setAttribute('data-testid', 'ag-sg-focus-tag');
      focusTagEl.hidden = true;
      left.appendChild(dot);
      left.appendChild(msgEl);
      left.appendChild(focusTagEl);

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
        if (lastWatchdog?.stalled && !lastWatchdog?.stallDismissed && lastSnapshot) {
          watchdog?.dismissStall?.(lastSnapshot.cascadeId);
          lastWatchdog = { ...lastWatchdog, stallDismissed: true };
        } else if (lastSnapshot) {
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
      if (!snap || !config.modules.compactGuard) return false;
      const sess = getSess(snap.cascadeId);
      const th = config.compactThreshold === 'off' ? null : Number(config.compactThreshold);

      // Detect compaction completed -> reset dismiss state AND surface post-compact recovery strip if snapshot exists
      const compactedByCount = snap.compactedCount > sess.lastCompactedCount;
      const compactedByDrop = th !== null && Number.isFinite(th) && snap.usedPct <= th - config.resetDropPct;
      if (compactedByCount || compactedByDrop) {
        const hadPriorCompactCycle = compactedByCount || sess.dismissedAtPct !== null || sess.autoSentAtPct !== null;
        sess.lastCompactedCount = Math.max(sess.lastCompactedCount, snap.compactedCount);
        sess.dismissedAtPct = null;
        sess.autoSentAtPct = null;
        countdownCanceledForSession.delete(snap.cascadeId);
        if (hadPriorCompactCycle || compactedByCount) {
          const saved = handoff?.loadSnapshot?.(storage, snap.cascadeId) || null;
          if (saved && saved.pendingRecovery) {
            activeRecovery = saved;
          }
        }
      }

      if (lastWatchdog?.stalled && !lastWatchdog?.stallDismissed) return true;
      if (th === null || !Number.isFinite(th)) return false;
      if (snap.usedPct < th) return false;

      if (sess.dismissedAtPct !== null && snap.usedPct < sess.dismissedAtPct + config.rearmDeltaPct) {
        return false;
      }
      return true;
    };

    const maybeManageCountdown = (snap, visible, isStallAlert) => {
      const canCountdown =
        visible &&
        !isStallAlert &&
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
      renderRecoveryBar();

      if (!visible && !popoverOpen) {
        stopCountdown();
        if (bannerEl) bannerEl.hidden = true;
        return;
      }
      const el = ensureBanner();
      if (!el) return;

      const isStallAlert = Boolean(lastWatchdog?.stalled && !lastWatchdog?.stallDismissed);
      maybeManageCountdown(snap, visible, isStallAlert);

      const strings = S();
      const pct = snap ? snap.usedPct : 0;
      const used = snap ? ctxSrc.formatTokens(snap.usedTokens) : '—';
      const max = snap ? ctxSrc.formatTokens(snap.maxTokens) : '—';
      const isOverflow = pct >= 100;
      const isCounting = Boolean(countdownTimer && countdownRemaining > 0);

      el.hidden = !visible && !popoverOpen;
      el.setAttribute('data-severity', isStallAlert ? 'stall' : isCounting ? 'countdown' : isOverflow ? 'overflow' : 'warn');

      if (isStallAlert) {
        const totalSec = Math.max(1, Number(lastWatchdog.stalledForSec) || 0);
        const min = Math.floor(totalSec / 60);
        const sec = totalSec % 60;
        msgEl.textContent = i18n.formatTemplate(strings.pillStallAlert, { min, sec });
      } else if (isCounting) {
        msgEl.textContent = i18n.formatTemplate(strings.pillCountdown, { pct, sec: countdownRemaining });
      } else if (snap?.streaming) {
        msgEl.textContent = i18n.formatTemplate(strings.pillStreaming, { pct });
      } else if (isOverflow) {
        msgEl.textContent = i18n.formatTemplate(strings.pillOverflow, { pct, used, max });
      } else {
        let baseMsg = i18n.formatTemplate(strings.pillReached, { pct, used, max });
        if (lastWatchdog?.estimatedTurnsLeft > 0) {
          baseMsg += ` ${i18n.formatTemplate(strings.pillBurnEta, { turns: lastWatchdog.estimatedTurnsLeft })}`;
        }
        if (lastWatchdog?.spikeDetected && lastWatchdog.lastDeltaPct > 0) {
          baseMsg += ` ${i18n.formatTemplate(strings.pillSpikeHint, { delta: lastWatchdog.lastDeltaPct })}`;
        }
        msgEl.textContent = baseMsg;
      }

      if (focusTagEl) {
        const showFocus = !isStallAlert && config.compactFocusPreset !== 'default';
        focusTagEl.hidden = !showFocus;
        if (showFocus) {
          focusTagEl.textContent = getFocusLabel(strings);
          focusTagEl.title = buildCompactCommand();
        }
      }

      primaryBtn.textContent = config.compactTriggerMode === 'fill-only' ? strings.btnFillOnly : strings.btnCompactNow;
      primaryBtn.title = buildCompactCommand();
      primaryBtn.disabled = Boolean(snap?.streaming);
      primaryBtn.hidden = isStallAlert;
      fillBtn.textContent = strings.btnFillOnly;
      fillBtn.hidden = isStallAlert || config.compactTriggerMode === 'fill-only';
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
      if (!config.modules.compactGuard) {
        stopCountdown();
        if (bannerEl && !popoverOpen) bannerEl.hidden = true;
        if (recoveryEl) recoveryEl.hidden = true;
        return lastSnapshot;
      }
      const scope = getScope();
      const snap = await ctxSrc.sampleContextState({
        win,
        doc,
        scopeEl: scope,
        getContextSnapshot: options.getContextSnapshot,
      });
      lastSnapshot = snap;
      if (watchdog && snap) {
        lastWatchdog = watchdog.observe({
          snap,
          doc,
          scopeEl: scope,
          threshold: config.compactThreshold,
        });
        if (lastWatchdog.newlyStalled && typeof options.onStallDetected === 'function') {
          try {
            options.onStallDetected({
              cascadeId: snap.cascadeId,
              stalledForSec: lastWatchdog.stalledForSec,
            });
          } catch {}
        }
      }
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
      watchdog?.setConfig?.({
        enabled: Boolean(config.modules.sessionWatchdog),
        stallThresholdSeconds: config.stallThresholdSeconds,
      });
      if (config.compactTriggerMode !== 'auto-countdown' || config.compactThreshold === 'off') {
        stopCountdown();
      }
      render();
      if (typeof options.onConfigChange === 'function') {
        try { options.onConfigChange({ ...config }); } catch {}
      }
      return { ...config };
    }

    const addL = (target, ev, fn, cap = false) => {
      if (!target || typeof target.addEventListener !== 'function') return;
      target.addEventListener(ev, fn, cap);
      listeners.push(() => target.removeEventListener?.(ev, fn, cap));
    };

    const onPaneFocus = (ev) => {
      if (destroyed || !ev?.target || !ctxSrc.findPaneRootForNode) return;
      const rootPane = ctxSrc.findPaneRootForNode(ev.target, doc);
      if (rootPane && rootPane !== activePaneEl) {
        activePaneEl = rootPane;
        void evaluateNow();
      }
    };
    addL(doc, 'pointerdown', onPaneFocus, true);
    addL(doc, 'focusin', onPaneFocus, true);

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
        recoveryVisible: Boolean(recoveryEl && !recoveryEl.hidden),
        popoverOpen,
        countdownActive: Boolean(countdownTimer),
        countdownRemaining,
        pollActive: Boolean(pollTimer),
        hibernated: coexist.isWindowHibernated(doc, win, blurred),
        lastSnapshot: lastSnapshot ? { ...lastSnapshot } : null,
        watchdog: lastWatchdog ? { ...lastWatchdog } : null,
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
      try { recoveryEl?.remove?.(); } catch {}
      try { styleEl?.remove?.(); } catch {}
      bannerEl = recoveryEl = recoveryMsgEl = recoveryFillBtn = recoveryCopyBtn = recoveryDismissBtn = null;
      msgEl = focusTagEl = actionsEl = primaryBtn = fillBtn = exportBtn = downloadBtn = cancelCdBtn = dismissBtn = gearBtn = toastEl = popEl = styleEl = null;
      activeRecovery = null;
      lastWatchdog = null;
      watchdog?.resetAll?.();
      sessionState.clear();
      countdownCanceledForSession.clear();
    }

    startPoll();
    if (options.autoPoll !== false) void evaluateNow();

    return {
      evaluateNow,
      updateConfig,
      getConfig: () => ({ ...config, modules: { ...config.modules } }),
      buildCompactCommand,
      captureRecoverySnapshot,
      insertCompact: insertCompactIntoComposer,
      exportMarkdown: handleExportMd,
      downloadMarkdown: (opts) => handleExportMd({ ...(opts || {}), download: true }),
      openSettingsPopover,
      getDebugState,
      destroy,
    };
  }

  return { THRESHOLD_PRESETS, STALL_PRESETS, COMPACT_CMD, createCompactGuardController };
});
