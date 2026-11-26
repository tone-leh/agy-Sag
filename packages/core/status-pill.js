// Antigravity Session Guard — Calm Composer Status Pill & Minimal Control Card (UMD, zero runtime deps)
// Less is More:
//   - Standalone (no Prism Pulse bar): compact "● 42%" pill in .agy-composer-footer
//   - With Obsidian Prism Pulse bar: compact "● 领航哨" (or "● ★ 2") pill without duplicating %
//   - Clicking opens a serene, zero-clutter card: live context + threshold picker + 2 core actions (Compact / Clean Restart)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSgStatusPill = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  const THRESHOLD_PRESETS = ['off', 75, 80, 85, 90];
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
      const pct = snap && typeof snap.usedPct === 'number' ? `${snap.usedPct}%` : '—';
      const usedLbl = snap ? ctxSrc.formatTokens(snap.usedTokens) : '—';
      const maxLbl = snap ? ctxSrc.formatTokens(snap.maxTokens) : '—';
      const tokText = snap ? `${usedLbl} / ${maxLbl}` : '—';
      const bmCount = Number(lastState.bookmarkCount) || 0;

      while (cardEl.firstChild) cardEl.removeChild(cardEl.firstChild);

      // 1) Header: Brand + live %
      const head = doc.createElement('div');
      head.className = 'ag-sg-card-head';
      const titleEl = doc.createElement('span');
      titleEl.className = 'ag-sg-card-title';
      titleEl.textContent = strings.brand;
      const metaEl = doc.createElement('span');
      metaEl.className = 'ag-sg-card-meta';
      metaEl.textContent = pct;
      head.appendChild(titleEl);
      head.appendChild(metaEl);
      cardEl.appendChild(head);

      // 2) Single calm telemetry row (Context + optional clickable Bookmarks count)
      const grid = doc.createElement('div');
      grid.className = 'ag-sg-card-grid';

      const ctxCell = doc.createElement('div');
      ctxCell.className = 'ag-sg-card-metric';
      const ctxK = doc.createElement('span');
      ctxK.className = 'ag-sg-card-mk';
      ctxK.textContent = strings.cardContextLabel;
      const ctxV = doc.createElement('span');
      ctxV.className = 'ag-sg-card-mv';
      ctxV.textContent = tokText;
      ctxCell.appendChild(ctxK);
      ctxCell.appendChild(ctxV);
      grid.appendChild(ctxCell);

      const bmCell = doc.createElement('div');
      bmCell.className = 'ag-sg-card-metric';
      const bmK = doc.createElement('span');
      bmK.className = 'ag-sg-card-mk';
      bmK.textContent = strings.cardBookmarksLabel;
      if (bmCount > 0 && typeof options.onOpenVault === 'function') {
        const bmLink = doc.createElement('button');
        bmLink.type = 'button';
        bmLink.className = 'ag-sg-card-link';
        bmLink.setAttribute('data-ag-sg-card-act', 'open-vault');
        bmLink.textContent = `★ ${bmCount}`;
        bmLink.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          close();
          options.onOpenVault();
        });
        bmCell.appendChild(bmK);
        bmCell.appendChild(bmLink);
      } else {
        const bmV = doc.createElement('span');
        bmV.className = 'ag-sg-card-mv';
        bmV.textContent = String(bmCount);
        bmCell.appendChild(bmK);
        bmCell.appendChild(bmV);
      }
      grid.appendChild(bmCell);
      cardEl.appendChild(grid);

      // 3) Single core setting: Auto-Compact Threshold (Off / 75% / 80% / 85% / 90%)
      const body = doc.createElement('div');
      body.className = 'ag-sg-card-body';
      const row = doc.createElement('div');
      row.className = 'ag-sg-pop-row';
      const lbl = doc.createElement('span');
      lbl.className = 'ag-sg-pop-lbl';
      lbl.textContent = strings.cfgThreshold;
      const seg = doc.createElement('div');
      seg.className = 'ag-sg-seg';
      for (const p of THRESHOLD_PRESETS) {
        const b = doc.createElement('button');
        b.type = 'button';
        b.textContent = p === 'off' ? strings.cfgThresholdOff : `${p}%`;
        b.setAttribute('data-ag-sg-card-th', String(p));
        b.setAttribute('aria-pressed', String(cfg.compactThreshold === p));
        b.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          updateConfig({ compactThreshold: p });
        });
        seg.appendChild(b);
      }
      row.appendChild(lbl);
      row.appendChild(seg);
      body.appendChild(row);
      cardEl.appendChild(body);

      // 4) Two irreplaceable actions only: Compact Now + Clean Restart (keep minimal text, drop images/logs)
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
      if (typeof options.onCompactNow === 'function') {
        foot.appendChild(
          mkAct('ag-sg-btn', strings.btnCompactNow, 'compact-now', () => {
            close();
            options.onCompactNow();
          })
        );
      }
      if (typeof options.onCleanRestart === 'function') {
        foot.appendChild(
          mkAct('ag-sg-btn ag-sg-btn-primary', strings.btnClearKeep, 'clean-restart', () => {
            close();
            options.onCleanRestart({ mode: 'keep' });
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
