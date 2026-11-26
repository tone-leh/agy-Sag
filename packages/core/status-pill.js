// Antigravity Session Guard — Adaptive Context Control Surface (UMD, zero runtime deps)
// Seamless dual-mode architecture (Less is More):
//   1) With Obsidian Prism (#ag-prism-pulse-bar open Shadow DOM #context-card):
//      - ZERO extra top-level pill on the composer footer!
//      - Embeds a native-styled 2-line Auto-Compact + Clean Restart section directly inside Prism's [◔ XX%] Context Card
//   2) Standalone (no Obsidian Prism):
//      - Renders a calm, minimal "● 42%" status pill in .agy-composer-footer + clean floating control card
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
  const PRISM_SEC_TESTID = 'ag-sg-pv-sec';
  const PRISM_STYLE_ID = 'ag-sg-pv-style';

  // Scoped Shadow DOM styles that inherit Obsidian Prism's exact light/dark variables (--f, --mu, --d, --ct, --sl, --ac)
  const PRISM_SHADOW_CSS = `
#context-card[data-ag-pulse-vial-mode="vial"] .ag-sg-pv-sec{grid-column:2;}
.ag-sg-pv-sec{
  margin-top:8px;
  padding-top:8px;
  border-top:1px solid var(--d,rgba(148,163,184,.18));
  display:flex;
  flex-direction:column;
  gap:6px;
}
.ag-sg-pv-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
}
.ag-sg-pv-title-wrap{
  display:inline-flex;
  align-items:center;
  gap:6px;
  min-width:0;
}
.ag-sg-pv-title{
  font-size:11px;
  font-weight:600;
  color:var(--f,#eef1f7);
  white-space:nowrap;
}
.ag-sg-pv-bm{
  appearance:none;
  border:0;
  padding:0 5px;
  height:18px;
  border-radius:999px;
  background:rgba(245,158,11,.14);
  color:#d97706;
  font:600 10px/18px inherit;
  cursor:pointer;
  white-space:nowrap;
}
.ag-sg-pv-bm:hover{filter:brightness(1.08);}
.ag-sg-pv-act{
  appearance:none;
  height:20px;
  padding:0 8px;
  border-radius:999px;
  border:1px solid var(--b,rgba(148,163,184,.26));
  background:var(--ct,rgba(148,163,184,.12));
  color:var(--ch,var(--f,#eef1f7));
  font:500 10.5px/18px inherit;
  cursor:pointer;
  white-space:nowrap;
  transition:background 130ms ease,color 130ms ease,border-color 130ms ease;
}
.ag-sg-pv-act:hover{
  background:var(--hv,rgba(148,163,184,.22));
  color:var(--f,#eef1f7);
  border-color:var(--ac,#3186ff);
}
.ag-sg-pv-seg{
  display:grid;
  grid-template-columns:repeat(5,1fr);
  gap:3px;
  padding:2px;
  border-radius:8px;
  background:var(--ct,rgba(148,163,184,.12));
  border:1px solid var(--d,rgba(148,163,184,.14));
}
.ag-sg-pv-seg button{
  appearance:none;
  border:0;
  height:21px;
  padding:0 4px;
  border-radius:6px;
  background:transparent;
  color:var(--mu,#94a3b8);
  font:500 10.5px/21px inherit;
  font-variant-numeric:tabular-nums;
  cursor:pointer;
  white-space:nowrap;
  transition:background 130ms ease,color 130ms ease,box-shadow 130ms ease;
}
.ag-sg-pv-seg button:hover{color:var(--f,#eef1f7);}
.ag-sg-pv-seg button[aria-pressed="true"]{
  background:var(--sl,rgba(49,134,255,.18));
  color:var(--ac,var(--f,#3186ff));
  font-weight:600;
  box-shadow:0 1px 2px rgba(0,0,0,.08);
}
`.trim();

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
    let embeddedShadowHosts = new Set();
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

    function removeStandalonePill() {
      cardOpen = false;
      try { wrapEl?.remove?.(); } catch {}
      wrapEl = pillBtn = dotEl = labelEl = cardEl = null;
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

    function findPrismPulseHosts() {
      if (!doc || typeof doc.querySelectorAll !== 'function') return [];
      return Array.from(
        doc.querySelectorAll('#ag-prism-pulse-bar, [data-ag-prism-pulse-bar="true"], #ag-pulse-status-bar, [data-ag-pulse-bar="true"]') || []
      );
    }

    function closePrismContextCard(sr) {
      try {
        const card = sr?.getElementById?.('context-card');
        if (card) card.hidden = true;
        const chip = sr?.querySelector?.('.chip[data-card="context"], .chip[aria-expanded="true"]');
        if (chip) chip.setAttribute?.('aria-expanded', 'false');
      } catch {}
    }

    function syncPrismContextCards() {
      const hosts = findPrismPulseHosts();
      let embeddedCount = 0;
      const cfg = getConfig();
      const strings = S();
      const bmCount = Number(lastState.bookmarkCount) || 0;

      for (const host of hosts) {
        const sr = host?.shadowRoot;
        if (!sr || typeof sr.getElementById !== 'function') continue;
        const ctxCard = sr.getElementById('context-card');
        if (!ctxCard) continue;

        // Ensure scoped Shadow DOM style
        let st = sr.getElementById(PRISM_STYLE_ID);
        if (!st) {
          st = coexist.markOwnedNoTranslate(doc.createElement('style'));
          st.id = PRISM_STYLE_ID;
          st.textContent = PRISM_SHADOW_CSS;
          sr.appendChild(st);
        }

        // Reuse or create embedded section right before #context-note inside #context-card
        let sec = ctxCard.querySelector?.(`[data-testid="${PRISM_SEC_TESTID}"]`) || null;
        if (!sec) {
          sec = coexist.markOwnedNoTranslate(doc.createElement('section'));
          sec.className = 'ag-sg-pv-sec';
          sec.setAttribute('data-testid', PRISM_SEC_TESTID);
          const note = sr.getElementById('context-note');
          if (note && note.parentElement === ctxCard && typeof ctxCard.insertBefore === 'function') {
            ctxCard.insertBefore(sec, note);
          } else {
            ctxCard.appendChild(sec);
          }
        }

        while (sec.firstChild) sec.removeChild(sec.firstChild);

        const head = doc.createElement('div');
        head.className = 'ag-sg-pv-head';

        const titleWrap = doc.createElement('div');
        titleWrap.className = 'ag-sg-pv-title-wrap';
        const title = doc.createElement('span');
        title.className = 'ag-sg-pv-title';
        title.textContent = strings.pvAutoCompactTitle;
        title.title = strings.setDescThreshold;
        titleWrap.appendChild(title);

        if (bmCount > 0 && typeof options.onOpenVault === 'function') {
          const bmBtn = doc.createElement('button');
          bmBtn.type = 'button';
          bmBtn.className = 'ag-sg-pv-bm';
          bmBtn.setAttribute('data-ag-sg-pv-act', 'open-vault');
          bmBtn.textContent = `★ ${bmCount}`;
          bmBtn.addEventListener('click', (ev) => {
            ev?.preventDefault?.();
            ev?.stopPropagation?.();
            closePrismContextCard(sr);
            options.onOpenVault();
          });
          titleWrap.appendChild(bmBtn);
        }
        head.appendChild(titleWrap);

        if (typeof options.onCleanRestart === 'function') {
          const cleanBtn = doc.createElement('button');
          cleanBtn.type = 'button';
          cleanBtn.className = 'ag-sg-pv-act';
          cleanBtn.setAttribute('data-ag-sg-pv-act', 'clean-restart');
          cleanBtn.textContent = strings.btnClearKeep;
          cleanBtn.title = strings.clearKeepTip;
          cleanBtn.addEventListener('click', (ev) => {
            ev?.preventDefault?.();
            ev?.stopPropagation?.();
            closePrismContextCard(sr);
            options.onCleanRestart({ mode: 'keep' });
          });
          head.appendChild(cleanBtn);
        }
        sec.appendChild(head);

        const seg = doc.createElement('div');
        seg.className = 'ag-sg-pv-seg';
        seg.setAttribute('role', 'group');
        for (const p of THRESHOLD_PRESETS) {
          const b = doc.createElement('button');
          b.type = 'button';
          b.textContent = p === 'off' ? strings.cfgThresholdOff : `${p}%`;
          b.setAttribute('data-ag-sg-pv-th', String(p));
          b.setAttribute('aria-pressed', String(cfg.compactThreshold === p));
          b.addEventListener('click', (ev) => {
            ev?.preventDefault?.();
            ev?.stopPropagation?.();
            updateConfig({ compactThreshold: p });
          });
          seg.appendChild(b);
        }
        sec.appendChild(seg);

        embeddedShadowHosts.add(host);
        embeddedCount += 1;
      }

      return embeddedCount;
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

    function renderStandaloneCard() {
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
        const cleanBtn = mkAct('ag-sg-btn ag-sg-btn-primary', strings.btnClearKeep, 'clean-restart', () => {
          close();
          options.onCleanRestart({ mode: 'keep' });
        });
        cleanBtn.title = strings.clearKeepTip;
        foot.appendChild(cleanBtn);
      }
      if (foot.children.length > 0) cardEl.appendChild(foot);
    }

    function ensureStandalonePill() {
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

      // Priority 1: Integrate directly inside Obsidian Prism's [◔ XX%] Context Card -> zero extra top-level footer pill!
      const embeddedCount = syncPrismContextCards();
      if (embeddedCount > 0) {
        removeStandalonePill();
        return;
      }

      // Priority 2: Standalone user (no Obsidian Prism Context Card) -> render calm "● XX%" pill in composer footer
      const el = ensureStandalonePill();
      if (!el || !pillBtn || !labelEl) return;

      const cfg = getConfig();
      const strings = S();
      const snap = lastState.snap;
      const tone = computeTone(snap, cfg, lastState.watchdog);
      const bmCount = Number(lastState.bookmarkCount) || 0;

      pillBtn.setAttribute('data-tone', tone);
      pillBtn.setAttribute('data-compact', '0');
      pillBtn.setAttribute('aria-expanded', String(cardOpen));
      pillBtn.title = strings.pillEntryTitle;

      const pctTxt = snap && typeof snap.usedPct === 'number' ? `${snap.usedPct}%` : strings.brandShort;
      labelEl.textContent = bmCount > 0 ? `${pctTxt} · ★${bmCount}` : pctTxt;
      renderStandaloneCard();
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
      removeStandalonePill();
      try { createdStyleEl?.remove?.(); } catch {}
      createdStyleEl = null;
      // Lossless Shadow DOM teardown across every Obsidian Prism Pulse host
      const hosts = new Set([...embeddedShadowHosts, ...findPrismPulseHosts()]);
      for (const h of hosts) {
        try {
          const sr = h?.shadowRoot;
          sr?.getElementById?.(PRISM_STYLE_ID)?.remove?.();
          sr?.querySelectorAll?.(`[data-testid="${PRISM_SEC_TESTID}"]`)?.forEach?.((n) => n.remove?.());
        } catch {}
      }
      embeddedShadowHosts.clear();
      activePaneEl = null;
    }

    sync();

    return {
      sync,
      open,
      close,
      toggle,
      getDebugState: () => {
        const prismEmbedded = findPrismPulseHosts().some((h) =>
          Boolean(h?.shadowRoot?.querySelector?.(`[data-testid="${PRISM_SEC_TESTID}"]`))
        );
        return {
          destroyed,
          mode: prismEmbedded ? 'prism-context-card' : wrapEl && wrapEl.isConnected !== false ? 'standalone-pill' : 'none',
          prismCardEmbedded: prismEmbedded,
          mounted: prismEmbedded || Boolean(wrapEl && wrapEl.isConnected !== false),
          cardOpen,
          label: labelEl?.textContent || '',
        };
      },
      destroy,
    };
  }

  return {
    PILL_TESTID,
    CARD_TESTID,
    PRISM_SEC_TESTID,
    PRISM_STYLE_ID,
    createStatusPillController,
  };
});
