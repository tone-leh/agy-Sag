// Antigravity Session Guard — Calm Composer Status Pill & Floating Control Card (UMD, zero runtime deps)
// Provides a quiet, always-reachable entry point for BOTH standalone users (no Obsidian Prism) and combined users:
//   - Standalone (no Prism Pulse bar): compact "● 42%" status pill in .agy-composer-footer
//   - With Obsidian Prism Pulse bar: compact icon+dot pill (never duplicates a second % readout)
//   - Clicking opens a minimal, light/dark-adaptive floating card with live metrics, inline settings & quick tools
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSgStatusPill = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  const THRESHOLD_PRESETS = ['off', 70, 75, 80, 85, 90];
  const STALL_PRESETS = ['off', 120, 180, 300];
  const PILL_TESTID = 'ag-sg-status-pill';
  const CARD_TESTID = 'ag-sg-status-card';

  function resolveDep(globalKey, relPath) {
    if (globalRoot && globalRoot[globalKey]) return globalRoot[globalKey];
    if (typeof require === 'function') return require(relPath);
    return null;
  }

  function createStatusPillController(options = {}) {
    const win = options.win || globalRoot;
    const doc = options.doc || win?.document || null;
    const coexist = options.coexist || resolveDep('__agSgCoexist', './coexist.js');
    const ctxSrc = options.contextSource || resolveDep('__agSgContextSource', './context-source.js');
    const i18n = options.i18n || resolveDep('__agSgI18n', './i18n.js');
    const styles = options.styles || resolveDep('__agSgStyles', './styles.js');

    let destroyed = false;
    let cardOpen = false;
    let activePaneEl = null;
    let wrapEl = null;
    let pillBtn = null;
    let dotEl = null;
    let labelEl = null;
    let cardEl = null;
    let createdStyleEl = null;
    let lastState = {
      snap: null,
      watchdog: null,
      bookmarkCount: 0,
      hasDraft: false,
    };
    const listeners = [];

    const getConfig = () => (typeof options.getConfig === 'function' ? options.getConfig() : coexist.DEFAULT_CONFIG);
    const updateConfig = (patch) => {
      if (typeof options.onUpdateConfig === 'function') return options.onUpdateConfig(patch);
      return getConfig();
    };
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

    function findFooterHost(scope = getScope()) {
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

    function hasSiblingPulseBar(footerEl) {
      if (!footerEl || typeof footerEl.querySelector !== 'function') return false;
      return Boolean(
        footerEl.querySelector('#ag-prism-pulse-bar, [data-ag-prism-pulse-bar="true"], #ag-pulse-status-bar, [data-ag-pulse-bar="true"]')
      );
    }

    function computeTone(snap, cfg, watchdog) {
      if (watchdog?.stalled && !watchdog?.stallDismissed) return 'warn';
      const pct = snap && typeof snap.usedPct === 'number' ? snap.usedPct : null;
      if (pct === null) return 'idle';
      if (pct >= 100) return 'danger';
      const th = cfg.compactThreshold === 'off' ? 85 : Number(cfg.compactThreshold) || 80;
      if (pct >= th) return 'warn';
      if (pct >= Math.max(55, th - 12)) return 'warm';
      return 'ok';
    }

    function renderCard() {
      if (!cardEl || destroyed) return;
      cardEl.hidden = !cardOpen;
      if (!cardOpen) return;

      const cfg = getConfig();
      const strings = S();
      const snap = lastState.snap;
      const wd = lastState.watchdog;
      const pct = snap && typeof snap.usedPct === 'number' ? `${snap.usedPct}%` : '—';
      const thText = cfg.compactThreshold === 'off' ? strings.cfgThresholdOff : `${cfg.compactThreshold}%`;
      const usedLbl = snap ? ctxSrc.formatTokens(snap.usedTokens) : '—';
      const maxLbl = snap ? ctxSrc.formatTokens(snap.maxTokens) : '—';
      const tokText = snap ? `${usedLbl} / ${maxLbl}` : '—';
      const etaText =
        wd && typeof wd.estimatedTurnsLeft === 'number' && wd.estimatedTurnsLeft > 0
          ? i18n.formatTemplate(strings.cardTurnsVal, { n: wd.estimatedTurnsLeft })
          : '—';
      const bmText = i18n.formatTemplate(strings.cardCountVal, { n: lastState.bookmarkCount || 0 });
      const draftText = lastState.hasDraft ? strings.cardDraftSaved : strings.cardDraftNone;

      while (cardEl.firstChild) cardEl.removeChild(cardEl.firstChild);

      // Header
      const head = doc.createElement('div');
      head.className = 'ag-sg-card-head';
      const titleEl = doc.createElement('span');
      titleEl.className = 'ag-sg-card-title';
      titleEl.textContent = strings.brand;
      const metaEl = doc.createElement('span');
      metaEl.className = 'ag-sg-card-meta';
      metaEl.textContent = `${pct} · ${strings.cardThresholdShort} ${thText}`;
      head.appendChild(titleEl);
      head.appendChild(metaEl);
      cardEl.appendChild(head);

      // Clean 2-column live telemetry grid
      const grid = doc.createElement('div');
      grid.className = 'ag-sg-card-grid';
      const mkMetric = (k, v) => {
        const cell = doc.createElement('div');
        cell.className = 'ag-sg-card-metric';
        const kEl = doc.createElement('span');
        kEl.className = 'ag-sg-card-mk';
        kEl.textContent = k;
        const vEl = doc.createElement('span');
        vEl.className = 'ag-sg-card-mv';
        vEl.textContent = v;
        cell.appendChild(kEl);
        cell.appendChild(vEl);
        return cell;
      };
      grid.appendChild(mkMetric(strings.cardContextLabel, tokText));
      grid.appendChild(mkMetric(strings.cardEtaLabel, etaText));
      grid.appendChild(mkMetric(strings.cardBookmarksLabel, bmText));
      grid.appendChild(mkMetric(strings.cardDraftLabel, draftText));
      cardEl.appendChild(grid);

      // Settings body
      const body = doc.createElement('div');
      body.className = 'ag-sg-card-body';

      const mkRow = (label, specs, extraEl = null) => {
        const r = doc.createElement('div');
        r.className = 'ag-sg-pop-row';
        const l = doc.createElement('span');
        l.className = 'ag-sg-pop-lbl';
        l.textContent = label;
        const seg = doc.createElement('div');
        seg.className = 'ag-sg-seg';
        for (const sp of specs) {
          const b = doc.createElement('button');
          b.type = 'button';
          b.textContent = sp.label;
          if (sp.attr) b.setAttribute(sp.attr, String(sp.val));
          b.setAttribute('aria-pressed', String(Boolean(sp.active)));
          b.addEventListener('click', (ev) => {
            ev?.preventDefault?.();
            ev?.stopPropagation?.();
            sp.onClick();
          });
          seg.appendChild(b);
        }
        r.appendChild(l);
        r.appendChild(seg);
        if (extraEl) r.appendChild(extraEl);
        return r;
      };

      body.appendChild(
        mkRow(
          strings.cfgThreshold,
          THRESHOLD_PRESETS.map((p) => ({
            label: p === 'off' ? strings.cfgThresholdOff : `${p}%`,
            attr: 'data-ag-sg-card-th',
            val: p,
            active: cfg.compactThreshold === p,
            onClick: () => updateConfig({ compactThreshold: p }),
          }))
        )
      );

      body.appendChild(
        mkRow(strings.cfgMode, [
          { label: strings.cfgModeConfirm, attr: 'data-ag-sg-card-mode', val: 'confirm', active: cfg.compactTriggerMode === 'confirm', onClick: () => updateConfig({ compactTriggerMode: 'confirm' }) },
          { label: strings.cfgModeFill, attr: 'data-ag-sg-card-mode', val: 'fill-only', active: cfg.compactTriggerMode === 'fill-only', onClick: () => updateConfig({ compactTriggerMode: 'fill-only' }) },
          { label: strings.cfgModeCountdown, attr: 'data-ag-sg-card-mode', val: 'auto-countdown', active: cfg.compactTriggerMode === 'auto-countdown', onClick: () => updateConfig({ compactTriggerMode: 'auto-countdown' }) },
        ])
      );

      let customInput = null;
      if (cfg.compactFocusPreset === 'custom') {
        customInput = doc.createElement('input');
        customInput.type = 'text';
        customInput.className = 'ag-sg-pop-input';
        customInput.setAttribute('data-ag-sg-card-custom-focus', '1');
        customInput.placeholder = strings.cfgFocusCustomPlaceholder;
        customInput.value = cfg.customCompactFocus || '';
        customInput.addEventListener('input', () => {
          updateConfig({ customCompactFocus: customInput.value });
        });
      }
      body.appendChild(
        mkRow(
          strings.cfgFocus,
          [
            { label: strings.cfgFocusDefault, attr: 'data-ag-sg-card-focus', val: 'default', active: cfg.compactFocusPreset === 'default', onClick: () => updateConfig({ compactFocusPreset: 'default' }) },
            { label: strings.cfgFocusCode, attr: 'data-ag-sg-card-focus', val: 'code-errors', active: cfg.compactFocusPreset === 'code-errors', onClick: () => updateConfig({ compactFocusPreset: 'code-errors' }) },
            { label: strings.cfgFocusBookmarks, attr: 'data-ag-sg-card-focus', val: 'bookmarks', active: cfg.compactFocusPreset === 'bookmarks', onClick: () => updateConfig({ compactFocusPreset: 'bookmarks' }) },
            { label: strings.cfgFocusCustom, attr: 'data-ag-sg-card-focus', val: 'custom', active: cfg.compactFocusPreset === 'custom', onClick: () => updateConfig({ compactFocusPreset: 'custom' }) },
          ],
          customInput
        )
      );

      body.appendChild(
        mkRow(
          strings.cfgStall,
          STALL_PRESETS.map((sec) => ({
            label: sec === 'off' ? strings.cfgStallOff : `${Math.round(sec / 60)}m`,
            attr: 'data-ag-sg-card-stall',
            val: sec,
            active: cfg.stallThresholdSeconds === sec,
            onClick: () => updateConfig({ stallThresholdSeconds: sec }),
          }))
        )
      );

      body.appendChild(
        mkRow(strings.cfgModules, [
          { label: strings.cfgModDraftGuard, attr: 'data-ag-sg-card-mod', val: 'draftGuard', active: Boolean(cfg.modules?.draftGuard), onClick: () => updateConfig({ modules: { ...cfg.modules, draftGuard: !cfg.modules?.draftGuard } }) },
          { label: strings.cfgModBookmarks, attr: 'data-ag-sg-card-mod', val: 'outlineBookmarks', active: Boolean(cfg.modules?.outlineBookmarks), onClick: () => updateConfig({ modules: { ...cfg.modules, outlineBookmarks: !cfg.modules?.outlineBookmarks } }) },
          { label: strings.cfgModRadar, attr: 'data-ag-sg-card-mod', val: 'sessionRadar', active: Boolean(cfg.modules?.sessionRadar), onClick: () => updateConfig({ modules: { ...cfg.modules, sessionRadar: !cfg.modules?.sessionRadar } }) },
          { label: strings.cfgModWatchdog, attr: 'data-ag-sg-card-mod', val: 'sessionWatchdog', active: Boolean(cfg.modules?.sessionWatchdog), onClick: () => updateConfig({ modules: { ...cfg.modules, sessionWatchdog: !cfg.modules?.sessionWatchdog } }) },
        ])
      );

      if (cfg.modules?.sessionRadar) {
        body.appendChild(
          mkRow(strings.cfgRadarNotify, [
            { label: strings.cfgNotifyOff, attr: 'data-ag-sg-card-notify', val: 'off', active: cfg.radarNotifyMode === 'off', onClick: () => updateConfig({ radarNotifyMode: 'off' }) },
            { label: strings.cfgNotifyAwaiting, attr: 'data-ag-sg-card-notify', val: 'awaiting', active: cfg.radarNotifyMode === 'awaiting', onClick: () => updateConfig({ radarNotifyMode: 'awaiting' }) },
            { label: strings.cfgNotifyAll, attr: 'data-ag-sg-card-notify', val: 'all', active: cfg.radarNotifyMode === 'all', onClick: () => updateConfig({ radarNotifyMode: 'all' }) },
          ])
        );
      }

      cardEl.appendChild(body);

      // Footer quick actions
      const foot = doc.createElement('div');
      foot.className = 'ag-sg-card-foot';
      const mkAct = (cls, text, act, onClick) => {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = cls;
        b.textContent = text;
        b.setAttribute('data-ag-sg-card-act', act);
        b.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          onClick();
        });
        return b;
      };
      if (typeof options.onOpenVault === 'function') {
        foot.appendChild(
          mkAct('ag-sg-btn', strings.bmOpenVaultBtn, 'open-vault', () => {
            close();
            options.onOpenVault();
          })
        );
      }
      if (typeof options.onCopyHandoff === 'function') {
        foot.appendChild(
          mkAct('ag-sg-btn', strings.btnCopyHandoff, 'copy-handoff', () => {
            void options.onCopyHandoff();
          })
        );
      }
      if (typeof options.onDownloadMarkdown === 'function') {
        foot.appendChild(
          mkAct('ag-sg-btn ag-sg-btn-primary', strings.btnDownloadMd, 'download-md', () => {
            void options.onDownloadMarkdown();
          })
        );
      }
      if (foot.children.length > 0) cardEl.appendChild(foot);
    }

    function ensurePill() {
      if (!doc || destroyed) return null;
      const footer = findFooterHost();
      if (!footer) return null;
      ensureStyle();

      if (!wrapEl || wrapEl.parentElement !== footer) {
        if (wrapEl) {
          try { wrapEl.remove?.(); } catch {}
        }
        wrapEl = coexist.markOwnedNoTranslate(doc.createElement('div'));
        wrapEl.className = 'ag-sg-pill-wrap';
        wrapEl.setAttribute('data-testid', 'ag-sg-pill-wrap');

        pillBtn = doc.createElement('button');
        pillBtn.type = 'button';
        pillBtn.className = 'ag-sg-status-pill';
        pillBtn.setAttribute('data-testid', PILL_TESTID);
        pillBtn.setAttribute('aria-haspopup', 'dialog');
        pillBtn.setAttribute('aria-expanded', 'false');
        pillBtn.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          toggle();
        });

        dotEl = doc.createElement('span');
        dotEl.className = 'ag-sg-status-dot';
        dotEl.setAttribute('aria-hidden', 'true');

        labelEl = doc.createElement('span');
        labelEl.className = 'ag-sg-status-label';

        pillBtn.appendChild(dotEl);
        pillBtn.appendChild(labelEl);

        cardEl = doc.createElement('div');
        cardEl.className = 'ag-sg-status-card';
        cardEl.setAttribute('role', 'dialog');
        cardEl.setAttribute('data-testid', CARD_TESTID);
        cardEl.hidden = true;

        wrapEl.appendChild(pillBtn);
        wrapEl.appendChild(cardEl);

        // Insert right before the trailing action cluster in .agy-composer-footer so layout stays balanced
        const kids = Array.from(footer.children || []);
        const trailing = kids.length > 1 ? kids[kids.length - 1] : null;
        if (trailing && typeof footer.insertBefore === 'function') {
          footer.insertBefore(wrapEl, trailing);
        } else {
          footer.appendChild(wrapEl);
        }
      }
      return wrapEl;
    }

    function sync(statePatch = null) {
      if (destroyed) return;
      if (statePatch && typeof statePatch === 'object') {
        lastState = { ...lastState, ...statePatch };
      }
      const el = ensurePill();
      if (!el || !pillBtn || !labelEl) return;

      const footer = el.parentElement;
      const compactMode = hasSiblingPulseBar(footer);
      const cfg = getConfig();
      const strings = S();
      const snap = lastState.snap;
      const tone = computeTone(snap, cfg, lastState.watchdog);
      const bmCount = Number(lastState.bookmarkCount) || 0;

      pillBtn.setAttribute('data-tone', tone);
      pillBtn.setAttribute('data-compact', compactMode ? '1' : '0');
      pillBtn.setAttribute('aria-expanded', String(cardOpen));
      pillBtn.title = strings.pillEntryTitle;

      if (compactMode) {
        // Alongside Obsidian Prism Pulse bar: avoid duplicate % meter; stay ultra-compact
        labelEl.textContent = bmCount > 0 ? `★ ${bmCount}` : strings.brandShort;
      } else {
        const pctTxt = snap && typeof snap.usedPct === 'number' ? `${snap.usedPct}%` : strings.brandShort;
        labelEl.textContent = bmCount > 0 ? `${pctTxt} · ★${bmCount}` : pctTxt;
      }

      renderCard();
    }

    function open() {
      if (destroyed) return;
      cardOpen = true;
      sync();
    }

    function close() {
      cardOpen = false;
      if (pillBtn) pillBtn.setAttribute('aria-expanded', 'false');
      if (cardEl) cardEl.hidden = true;
    }

    function toggle() {
      if (cardOpen) close();
      else open();
    }

    const addL = (target, ev, fn, cap = false) => {
      if (!target || typeof target.addEventListener !== 'function') return;
      target.addEventListener(ev, fn, cap);
      listeners.push(() => target.removeEventListener?.(ev, fn, cap));
    };

    const onOutsideClick = (ev) => {
      if (!cardOpen || destroyed || !wrapEl) return;
      const t = ev?.target;
      if (t && (t === wrapEl || t.closest?.('[data-testid="ag-sg-pill-wrap"]'))) return;
      close();
    };
    const onKeyDown = (ev) => {
      if (cardOpen && !destroyed && String(ev?.key || '').toLowerCase() === 'escape') {
        ev.preventDefault?.();
        close();
      }
    };
    const onPaneFocus = (ev) => {
      if (destroyed || !ev?.target || !ctxSrc.findPaneRootForNode) return;
      const rootPane = ctxSrc.findPaneRootForNode(ev.target, doc);
      if (rootPane && rootPane !== activePaneEl) {
        activePaneEl = rootPane;
        sync();
      }
    };

    addL(doc, 'pointerdown', onOutsideClick, true);
    addL(doc, 'pointerdown', onPaneFocus, true);
    addL(doc, 'focusin', onPaneFocus, true);
    addL(win, 'keydown', onKeyDown);

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      cardOpen = false;
      while (listeners.length) {
        try { listeners.pop()(); } catch {}
      }
      try { wrapEl?.remove?.(); } catch {}
      try { createdStyleEl?.remove?.(); } catch {}
      wrapEl = pillBtn = dotEl = labelEl = cardEl = createdStyleEl = null;
      activePaneEl = null;
    }

    sync();

    return {
      sync,
      open,
      close,
      toggle,
      getDebugState: () => ({
        destroyed,
        mounted: Boolean(wrapEl && wrapEl.isConnected !== false),
        cardOpen,
        compactMode: Boolean(pillBtn?.getAttribute?.('data-compact') === '1'),
        label: labelEl?.textContent || '',
      }),
      destroy,
    };
  }

  return {
    PILL_TESTID,
    CARD_TESTID,
    createStatusPillController,
  };
});
