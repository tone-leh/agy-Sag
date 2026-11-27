// agy-Sag — Unified Segmented Status Capsule HUD & Prism Context Embed (UMD, zero runtime deps)
// Seamless dual-mode architecture (Less is More):
//   1) With Obsidian Prism (#ag-prism-pulse-bar open Shadow DOM #context-card):
//      - ZERO extra top-level pill on the composer footer!
//      - Embeds read-only Auto-Compact %, Clean Restart, HUD chips & Settings link inside Prism's Context Card
//   2) Standalone (no Obsidian Prism):
//      - Renders a unified multi-segment HUD capsule in .agy-composer-footer + serene read-only quick card
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSgStatusPill = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  const PILL_TESTID = 'ag-sg-status-pill';
  const CARD_TESTID = 'ag-sg-status-card';
  const PRISM_SEC_TESTID = 'ag-sg-pv-sec';
  const PRISM_STYLE_ID = 'ag-sg-pv-style';

  const QUOTA_TONE_MAP = Object.freeze({
    ok: 'ok',
    warm: 'warm',
    warn: 'warn',
    limited: 'danger',
  });

  function resolveDep(globalKey, relPath) {
    if (globalRoot && globalRoot[globalKey]) return globalRoot[globalKey];
    if (typeof require === 'function') return require(relPath);
    return null;
  }

  function computeTone(snap, cfg, watchdog) {
    if (watchdog?.stalled && !watchdog?.stallDismissed) return 'warn';
    const pct = snap && typeof snap.usedPct === 'number' ? snap.usedPct : null;
    if (pct === null) return 'idle';
    if (pct >= 100) return 'danger';
    const th = cfg?.compactThreshold === 'off' ? 85 : Number(cfg?.compactThreshold) || 80;
    if (pct >= th) return 'warn';
    if (pct >= Math.max(55, th - 12)) return 'warm';
    return 'ok';
  }

  function formatTpl(tpl, vars = {}) {
    let out = String(tpl || '');
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(String(v ?? ''));
    }
    return out;
  }

  function formatDurationMMSS(sec) {
    const total = Math.max(0, Math.round(Number(sec) || 0));
    const m = Math.floor(total / 60);
    const s = String(total % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  function computeQuotaPct(quota) {
    if (!quota) return 0;
    const obsPct = quota.observed?.observedPct;
    if (typeof obsPct === 'number' && Number.isFinite(obsPct)) return Math.max(0, Math.round(obsPct));
    const ratio = Number(quota.localEstimate?.warn5hRatio) || 0;
    return Math.max(0, Math.round(ratio * 100));
  }

  function computeHudSegments({
    cfg = {},
    snap = null,
    watchdog = null,
    quota = null,
    queue = null,
    bookmarkCount = 0,
    autoAccept = null,
    nov = null,
    strings = {},
    formatTokens = null,
  } = {}) {
    const mods = cfg?.modules || {};
    const segs = [];

    // 1. ctx segment
    if (mods.compactGuard && snap && typeof snap.usedPct === 'number' && Number.isFinite(snap.usedPct)) {
      const pct = Math.max(0, Math.min(100, Math.round(snap.usedPct)));
      const fmt = typeof formatTokens === 'function' ? formatTokens : (n) => String(n ?? '—');
      const used = fmt(snap.usedTokens);
      const max = fmt(snap.maxTokens);
      const ctxTitle = `${strings.cardContextLabel || 'Context'}: ${snap.usedPct}% (${used} / ${max})`;
      segs.push({
        id: 'ctx',
        text: `${snap.usedPct}%`,
        tone: computeTone(snap, cfg, watchdog),
        title: ctxTitle,
        pct,
      });
    }

    // 2. eta / stall segment
    if (mods.sessionWatchdog && watchdog) {
      if (watchdog.stalled && !watchdog.stallDismissed) {
        const time = formatDurationMMSS(watchdog.stalledForSec);
        const text = formatTpl(strings.hudStallShort || 'Stalled {time}', { time });
        segs.push({
          id: 'eta',
          text,
          tone: 'warn',
          title: text,
        });
      } else if (Number(watchdog.estimatedTurnsLeft) > 0) {
        const turns = Number(watchdog.estimatedTurnsLeft);
        const text = formatTpl(strings.hudEtaShort || '≈{n} turns', { n: turns });
        let title = formatTpl(strings.pillBurnEta || '· ~{turns} turns left', { turns }).replace(/^[·\s]+/, '');
        if (watchdog.spikeDetected && Number(watchdog.lastDeltaPct) > 0) {
          title += ` ${formatTpl(strings.pillSpikeHint || '· +{delta}%', { delta: watchdog.lastDeltaPct })}`;
        }
        segs.push({
          id: 'eta',
          text,
          tone: watchdog.spikeDetected ? 'warm' : 'idle',
          title,
        });
      }
    }

    // 3. quota segment
    if (mods.quotaPulse && quota) {
      const qPct = computeQuotaPct(quota);
      const turns5h = Number(quota.localEstimate?.turns5h) || 0;
      const soft5h = Number(quota.limits?.softTurns5h) || 60;
      const turns7d = Number(quota.localEstimate?.turns7d) || 0;
      const soft7d = Number(quota.limits?.softTurns7d) || 350;
      segs.push({
        id: 'quota',
        text: `5h ${qPct}%`,
        tone: QUOTA_TONE_MAP[quota.health] || 'ok',
        title: formatTpl(
          strings.hudQuotaTitle || 'Quota Pulse · 5h {turns5h}/{soft5h} turns · 7d {turns7d}/{soft7d} turns (local estimate, read-only)',
          { turns5h, soft5h, turns7d, soft7d }
        ),
      });
    }

    // 4. queue segment
    const qCount = Number(queue?.itemCount) || 0;
    if (mods.promptQueue && qCount > 0) {
      const base = formatTpl(strings.hudQueueShort || 'Queue {n}', { n: qCount });
      const text = queue?.paused ? `${base} ⏸` : base;
      segs.push({
        id: 'queue',
        text,
        tone: queue?.paused ? 'warn' : 'idle',
        title: text,
      });
    }

    // 5. bookmarks segment
    const bmCount = Number(bookmarkCount) || 0;
    if (mods.outlineBookmarks && bmCount > 0) {
      const text = `★${bmCount}`;
      segs.push({
        id: 'bookmarks',
        text,
        tone: 'idle',
        title: `${strings.cardBookmarksLabel || 'Bookmarks'}: ${bmCount}`,
      });
    }

    // 6. autoAccept segment
    if (mods.safeAutoAccept && autoAccept && autoAccept.enabled && !autoAccept.paused) {
      const text = autoAccept.dryRun
        ? (strings.hudAutoAcceptDryRun || 'Dry-run')
        : (strings.hudAutoAcceptShort || 'Auto-OK');
      segs.push({
        id: 'autoAccept',
        text,
        tone: autoAccept.dryRun ? 'idle' : 'warm',
        title: text,
      });
    }

    // 7. nov segment (enriched with read-only sag:nov_feed lock/drift/guard signals)
    if (nov && nov.connected) {
      const on = Number(nov.enabledCount) || 0;
      const total = Number(nov.total) || 13;
      const locked = Boolean(nov.specWriteLocked);
      const drifted = Math.max(0, Number(nov.memDrifted) || 0);
      const blocked = Math.max(0, Number(nov.guardBlocked) || 0);
      let text = 'NOV';
      let tone = 'accent';
      if (locked) {
        text = 'NOV 🔒';
        tone = 'warn';
      } else if (drifted > 0) {
        text = `NOV · Δ${drifted}`;
        tone = 'warn';
      }
      const extras = [];
      if (locked) extras.push('Spec Lock');
      if (drifted > 0) extras.push(`Mem drift ${drifted}`);
      if (blocked > 0) extras.push(`Guard blocked ${blocked}`);
      const baseTitle = formatTpl(strings.hudNovTitle || 'agy-NOV connected · {on}/{total} modules', { on, total });
      segs.push({
        id: 'nov',
        text,
        tone,
        title: extras.length ? `${baseTitle} · ${extras.join(' · ')}` : baseTitle,
      });
    }

    // 8. brand fallback
    if (segs.length === 0) {
      segs.push({
        id: 'brand',
        text: strings.brandShort || 'agy-Sag',
        tone: 'idle',
        title: strings.pillEntryTitle || 'agy-Sag',
      });
    }

    return segs;
  }

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
.ag-sg-pv-hud{
  display:flex;
  flex-wrap:wrap;
  gap:4px;
}
.ag-sg-pv-chip{
  display:inline-flex;
  align-items:center;
  height:18px;
  padding:0 6px;
  border-radius:999px;
  background:var(--ct,rgba(148,163,184,.14));
  color:var(--mu,#94a3b8);
  font:500 10.5px/18px inherit;
  font-variant-numeric:tabular-nums;
  white-space:nowrap;
}
.ag-sg-pv-chip[data-tone="warn"]{color:#d97706;}
.ag-sg-pv-chip[data-tone="danger"]{color:#ef4444;}
.ag-sg-pv-chip[data-tone="ok"]{color:#10b981;}
.ag-sg-pv-chip[data-tone="accent"]{color:var(--ac,#3186ff);}
.ag-sg-pv-link{
  appearance:none;
  border:0;
  padding:0;
  background:transparent;
  color:var(--ac,#3186ff);
  font:500 10.5px/1.3 inherit;
  align-self:flex-end;
  cursor:pointer;
}
.ag-sg-pv-link:hover{text-decoration:underline;}
`.trim();

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
    let segsEl = null;
    let cardEl = null;
    let createdStyleEl = null;
    let embeddedShadowHosts = new Set();
    let lastSegments = [];
    let lastState = {
      snap: null,
      watchdog: null,
      bookmarkCount: 0,
      hasDraft: false,
      queue: null,
      quota: null,
      autoAccept: null,
      nov: null,
      synergyConnected: false,
    };
    const listeners = [];

    const getConfig = () => (typeof options.getConfig === 'function' ? options.getConfig() : coexist.DEFAULT_CONFIG);
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
      wrapEl = pillBtn = dotEl = segsEl = cardEl = null;
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

    function buildNovInput(cfg) {
      if (lastState.nov && typeof lastState.nov === 'object') {
        return lastState.nov;
      }
      const connected = Boolean(
        lastState.synergyConnected || (typeof options.novSynergy?.isConnected === 'function' && options.novSynergy.isConnected())
      );
      const ns = options.novSynergy?.getState?.();
      const nf = options.novSynergy?.getFeed?.();
      return {
        connected,
        enabledCount: Number(ns?.enabledCount) || 0,
        total: 13,
        specWriteLocked: Boolean(nf?.spec?.writeLockActive),
        memDrifted: Number(nf?.mem?.driftedCount) || 0,
        guardBlocked: Number(nf?.guard?.blockedCount) || 0,
        radarAwaiting: Number(nf?.radar?.awaitingCount) || 0,
      };
    }

    function getCurrentSegments(cfg, strings) {
      return computeHudSegments({
        cfg,
        snap: lastState.snap,
        watchdog: lastState.watchdog,
        quota: lastState.quota,
        queue: lastState.queue,
        bookmarkCount: lastState.bookmarkCount,
        autoAccept: lastState.autoAccept,
        nov: buildNovInput(cfg),
        strings,
        formatTokens: ctxSrc?.formatTokens,
      });
    }

    function syncPrismContextCards() {
      const hosts = findPrismPulseHosts();
      let embeddedCount = 0;
      const cfg = getConfig();
      const strings = S();
      const bmCount = Number(lastState.bookmarkCount) || 0;
      const thText = cfg.compactThreshold === 'off' ? strings.cfgThresholdOff : `${cfg.compactThreshold}%`;
      const allSegs = getCurrentSegments(cfg, strings);
      lastSegments = allSegs;
      const chipSegs = allSegs.filter((seg) => seg.id !== 'ctx' && seg.id !== 'bookmarks' && seg.id !== 'brand');

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
        title.textContent = `${strings.pvAutoCompactTitle} ${thText}`;
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

        const hudRow = doc.createElement('div');
        hudRow.className = 'ag-sg-pv-hud';
        if (chipSegs.length === 0) {
          hudRow.hidden = true;
        } else {
          for (const seg of chipSegs) {
            const chip = doc.createElement('span');
            chip.className = 'ag-sg-pv-chip';
            chip.setAttribute('data-ag-sag-hud-seg', seg.id);
            chip.setAttribute('data-tone', seg.tone);
            if (seg.title) chip.title = seg.title;
            chip.textContent = seg.text;
            hudRow.appendChild(chip);
          }
        }
        sec.appendChild(hudRow);

        const settingsBtn = doc.createElement('button');
        settingsBtn.type = 'button';
        settingsBtn.className = 'ag-sg-pv-link';
        settingsBtn.setAttribute('data-ag-sg-pv-act', 'open-settings');
        settingsBtn.textContent = strings.cardOpenSettingsBtn || 'Full Settings →';
        settingsBtn.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          closePrismContextCard(sr);
          options.onOpenSettings?.('conversation');
        });
        sec.appendChild(settingsBtn);

        embeddedShadowHosts.add(host);
        embeddedCount += 1;
      }

      return embeddedCount;
    }

    function appendMetric(grid, label, value, testAttr) {
      const cell = doc.createElement('div');
      cell.className = 'ag-sg-card-metric';
      if (testAttr) cell.setAttribute('data-ag-sag-card-metric', testAttr);
      const k = doc.createElement('span');
      k.className = 'ag-sg-card-mk';
      k.textContent = label;
      const v = doc.createElement('span');
      v.className = 'ag-sg-card-mv';
      v.textContent = value;
      cell.appendChild(k);
      cell.appendChild(v);
      grid.appendChild(cell);
    }

    function renderStandaloneCard() {
      if (!cardEl || destroyed) return;
      cardEl.hidden = !cardOpen;
      if (!cardOpen) return;

      const cfg = getConfig();
      const mods = cfg.modules || {};
      const strings = S();
      const snap = lastState.snap;
      const pct = snap && typeof snap.usedPct === 'number' ? `${snap.usedPct}%` : '—';
      const usedLbl = snap ? ctxSrc.formatTokens(snap.usedTokens) : '—';
      const maxLbl = snap ? ctxSrc.formatTokens(snap.maxTokens) : '—';
      const tokText = snap ? `${usedLbl} / ${maxLbl}` : '—';
      const bmCount = Number(lastState.bookmarkCount) || 0;
      const thText = cfg.compactThreshold === 'off' ? strings.cfgThresholdOff : `${cfg.compactThreshold}%`;

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

      if (mods.compactGuard) {
        appendMetric(grid, strings.cardContextLabel, tokText, 'context');
        appendMetric(grid, strings.cardAutoCompactLabel || 'Auto-compact', thText, 'auto-compact');
      }

      if (mods.sessionWatchdog && Number(lastState.watchdog?.estimatedTurnsLeft) > 0) {
        appendMetric(
          grid,
          strings.cardEtaLabel || 'Est. left',
          i18n.formatTemplate(strings.cardTurnsVal || '~{n} turns', { n: lastState.watchdog.estimatedTurnsLeft }),
          'eta'
        );
      }

      if (mods.outlineBookmarks) {
        const bmCell = doc.createElement('div');
        bmCell.className = 'ag-sg-card-metric';
        bmCell.setAttribute('data-ag-sag-card-metric', 'bookmarks');
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
      }

      if (mods.draftGuard !== false) {
        appendMetric(
          grid,
          strings.cardDraftLabel || 'Draft',
          lastState.hasDraft ? (strings.cardDraftSaved || 'Saved') : (strings.cardDraftNone || 'None'),
          'draft'
        );
      }

      if (mods.quotaPulse && lastState.quota) {
        const qPct = computeQuotaPct(lastState.quota);
        const turns5h = Number(lastState.quota.localEstimate?.turns5h) || 0;
        const soft5h = Number(lastState.quota.limits?.softTurns5h) || 60;
        appendMetric(grid, strings.cardQuotaLabel || '5h quota', `${qPct}% · ${turns5h}/${soft5h}`, 'quota');
      }

      if (mods.promptQueue && lastState.queue) {
        const qCnt = Number(lastState.queue.itemCount) || 0;
        appendMetric(
          grid,
          strings.cardQueueLabel || 'Queued',
          i18n.formatTemplate(strings.cardCountVal || '{n}', { n: qCnt }),
          'queue'
        );
      }

      const novInfo = buildNovInput(cfg);
      if (novInfo.connected) {
        appendMetric(grid, 'agy-NOV', `${novInfo.enabledCount}/${novInfo.total}`, 'nov');
      }

      if (grid.children.length > 0) cardEl.appendChild(grid);

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
      if (typeof options.onOpenSettings === 'function' && strings.cardOpenSettingsBtn) {
        foot.appendChild(
          mkAct('ag-sg-btn', strings.cardOpenSettingsBtn, 'open-settings', () => {
            close();
            options.onOpenSettings('overview');
          })
        );
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

        segsEl = doc.createElement('span');
        segsEl.className = 'ag-sag-hud-segs';

        pillBtn.appendChild(dotEl);
        pillBtn.appendChild(segsEl);

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

      // Priority 1: Integrate directly inside Obsidian Prism's Context Card -> zero extra top-level footer pill
      const embeddedCount = syncPrismContextCards();
      if (embeddedCount > 0) {
        removeStandalonePill();
        return;
      }

      // Priority 2: Standalone user -> render unified multi-segment HUD capsule in composer footer
      const cfg = getConfig();
      const strings = S();
      const segs = getCurrentSegments(cfg, strings);
      lastSegments = segs;

      const el = ensureStandalonePill();
      if (!el || !pillBtn || !segsEl) return;

      const ctxSeg = segs.find((s) => s.id === 'ctx');
      const pillTone = ctxSeg ? ctxSeg.tone : 'idle';
      const novInfo = buildNovInput(cfg);
      const synergyOn = Boolean(novInfo.connected);

      if (dotEl) {
        dotEl.hidden = Boolean(ctxSeg);
      }

      pillBtn.setAttribute('data-tone', pillTone);
      pillBtn.setAttribute('data-compact', '0');
      pillBtn.setAttribute('aria-expanded', String(cardOpen));
      if (synergyOn) {
        pillBtn.setAttribute('data-synergy', '1');
        dotEl?.setAttribute?.('data-synergy', '1');
      } else {
        pillBtn.removeAttribute?.('data-synergy');
        dotEl?.removeAttribute?.('data-synergy');
      }

      const titles = segs.map((s) => s.title).filter(Boolean);
      if (strings.pillEntryTitle) titles.push(strings.pillEntryTitle);
      pillBtn.title = titles.join(' · ');

      while (segsEl.firstChild) segsEl.removeChild(segsEl.firstChild);
      for (const seg of segs) {
        const segEl = doc.createElement('span');
        segEl.className = 'ag-sag-hud-seg';
        segEl.setAttribute('data-ag-sag-hud-seg', seg.id);
        segEl.setAttribute('data-tone', seg.tone);
        if (seg.title) segEl.title = seg.title;

        if (seg.id === 'ctx') {
          const ring = doc.createElement('span');
          ring.className = 'ag-sag-hud-ring';
          ring.setAttribute('aria-hidden', 'true');
          ring.style?.setProperty?.('--ag-sag-hud-p', String(seg.pct ?? 0));
          segEl.appendChild(ring);
        }

        const txt = doc.createElement('span');
        txt.textContent = seg.text;
        segEl.appendChild(txt);
        segsEl.appendChild(segEl);
      }

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
      lastSegments = [];
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
          synergyConnected: Boolean(buildNovInput(getConfig()).connected),
          label: segsEl?.textContent || '',
          segments: lastSegments.map((s) => s.id),
          novText: lastSegments.find((s) => s.id === 'nov')?.text || '',
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
    computeHudSegments,
    createStatusPillController,
  };
});
