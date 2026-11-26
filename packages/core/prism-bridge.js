// Antigravity Session Guard — Obsidian Prism Coexistence & Unified Settings Bridge (UMD, zero runtime deps)
// Enables seamless side-by-side coexistence when users install BOTH Obsidian Prism and agy-session-guard:
//   - Embeds Session Guard settings natively inside Obsidian Prism's #ag-cs-settings-sec (Modules tab)
//   - Syncs config bidirectionally with Session Guard's inline quick popover & localStorage
//   - Reacts live to Obsidian Prism language (data-ag-cs-lang) and theme (data-ag-cs-theme) switches
//   - 100% lossless destroy() without leaving any residue in Prism's settings DOM
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSgPrismBridge = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  const PRISM_SETTINGS_SEC_ID = 'ag-cs-settings-sec';
  const PRISM_MODULES_GROUP_SEL = '[data-ag-cs-group="modules"]';
  const EMBED_SECTION_TESTID = 'ag-sg-prism-settings-section';
  const THRESHOLD_PRESETS = ['off', 70, 75, 80, 85, 90];
  const STALL_PRESETS = ['off', 120, 180, 300];

  function resolveDep(globalKey, relPath) {
    if (globalRoot && globalRoot[globalKey]) return globalRoot[globalKey];
    if (typeof require === 'function') return require(relPath);
    return null;
  }

  function detectPrismEnvironment(doc, win) {
    const html = doc?.documentElement || null;
    const styleAttr = html?.hasAttribute?.('data-ag-cs-style') || false;
    const settingsEl = doc?.getElementById?.(PRISM_SETTINGS_SEC_ID) || null;
    const modulesGroup = settingsEl?.querySelector?.(PRISM_MODULES_GROUP_SEL) || null;
    const metricsBridgePresent = Boolean(win?.__agPrismMetricsBridge && typeof win.__agPrismMetricsBridge.getMetrics === 'function');
    const pulseHostPresent = Boolean(win?.agPulseHost && typeof win.agPulseHost.getMetrics === 'function');
    const pulseBarPresent = Boolean(doc?.querySelector?.('#ag-prism-pulse-bar, [data-ag-prism-pulse-bar="true"]'));
    const outlinePopoverPresent = Boolean(doc?.querySelector?.('.ag-cs-nav-outline-popover'));
    const lang = html?.getAttribute?.('data-ag-cs-lang') || settingsEl?.getAttribute?.('data-ag-cs-lang') || '';
    const theme = html?.getAttribute?.('data-ag-cs-theme') || '';

    // Best-effort version extraction from Prism's about header if rendered
    let versionHint = '';
    try {
      const aboutTxt = settingsEl?.querySelector?.('[data-ag-cs-about="1"]')?.textContent || '';
      const m = aboutTxt.match(/Obsidian\s+Prism\s+v([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)/i);
      if (m && m[1]) versionHint = m[1];
    } catch {}

    const active = Boolean(styleAttr || settingsEl || metricsBridgePresent || pulseBarPresent);
    return {
      active,
      versionHint,
      settingsPanelMounted: Boolean(settingsEl),
      modulesGroupFound: Boolean(modulesGroup),
      metricsBridgePresent,
      pulseHostPresent,
      pulseBarPresent,
      outlinePopoverPresent,
      lang,
      theme,
    };
  }

  function createPrismBridgeController(options = {}) {
    const win = options.win || globalRoot;
    const doc = options.doc || win?.document || null;
    const coexist = options.coexist || resolveDep('__agSgCoexist', './coexist.js');
    const i18n = options.i18n || resolveDep('__agSgI18n', './i18n.js');

    let destroyed = false;
    let mountedEl = null;
    let domObserver = null;
    let htmlObserver = null;
    let lastLang = '';
    let lastTheme = '';

    const getConfig = () => (typeof options.getConfig === 'function' ? options.getConfig() : coexist.DEFAULT_CONFIG);
    const updateConfig = (patch) => {
      if (typeof options.onUpdateConfig === 'function') return options.onUpdateConfig(patch);
      return getConfig();
    };
    const getLang = () => (typeof options.getLang === 'function' ? i18n.normalizeLang(options.getLang()) : i18n.detectLang(doc, win));
    const S = () => i18n.getStrings(getLang());

    function mkSegRow({ key, title, desc, buttons, extraEl = null }) {
      const row = doc.createElement('div');
      row.className = 'ag-sg-prism-row';
      row.setAttribute('data-ag-sg-prism-row', key);

      const inner = doc.createElement('div');
      inner.className = 'py-2 ag-sg-prism-row-inner';

      const textCol = doc.createElement('div');
      textCol.className = 'flex-1 ag-sg-prism-text';
      const titleLine = doc.createElement('div');
      titleLine.className = 'ag-cs-settings-title-line ag-sg-prism-row-title';
      titleLine.textContent = title;
      textCol.appendChild(titleLine);
      if (desc) {
        const dSpan = doc.createElement('span');
        dSpan.className = 'ag-sg-prism-row-desc';
        dSpan.textContent = desc;
        textCol.appendChild(dSpan);
      }

      const ctrlWrap = doc.createElement('div');
      ctrlWrap.className = 'shrink-0';
      const group = doc.createElement('div');
      group.className = 'ag-cs-seg-group ag-sg-seg';
      group.setAttribute('role', 'group');

      for (const spec of buttons) {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'ag-cs-seg-btn ag-sg-prism-seg-btn';
        b.textContent = spec.label;
        if (spec.attr && spec.val !== undefined) b.setAttribute(spec.attr, String(spec.val));
        b.setAttribute('aria-pressed', String(Boolean(spec.active)));
        if (spec.active) b.setAttribute('data-pressed', '');
        b.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          spec.onClick();
        });
        group.appendChild(b);
      }
      ctrlWrap.appendChild(group);

      inner.appendChild(textCol);
      inner.appendChild(ctrlWrap);
      row.appendChild(inner);
      if (extraEl) row.appendChild(extraEl);
      return row;
    }

    function renderIntoPrismSettings() {
      if (destroyed || !doc) return false;
      const settingsEl = doc.getElementById?.(PRISM_SETTINGS_SEC_ID);
      const modulesGroup = settingsEl?.querySelector?.(PRISM_MODULES_GROUP_SEL) || null;
      if (!settingsEl || !modulesGroup) {
        if (mountedEl && mountedEl.isConnected === false) mountedEl = null;
        return false;
      }

      // Reuse existing wrapper inside current modulesGroup or create a fresh one
      let section = modulesGroup.querySelector?.(`[data-testid="${EMBED_SECTION_TESTID}"]`) || null;
      if (!section) {
        section = coexist.markOwnedNoTranslate(doc.createElement('div'));
        section.className = 'ag-sg-prism-section';
        section.setAttribute('data-testid', EMBED_SECTION_TESTID);
        modulesGroup.appendChild(section);
      }
      mountedEl = section;

      const cfg = getConfig();
      const strings = S();
      const env = detectPrismEnvironment(doc, win);

      while (section.firstChild) section.removeChild(section.firstChild);

      // Native Obsidian Prism subhead + companion badge
      const head = doc.createElement('div');
      head.className = 'ag-cs-settings-subhead ag-sg-prism-subhead';
      const headTitle = doc.createElement('span');
      headTitle.textContent = strings.prismUnifiedTitle;
      const badge = doc.createElement('span');
      badge.className = 'ag-sg-prism-badge';
      badge.setAttribute('data-testid', 'ag-sg-prism-badge');
      badge.textContent = env.versionHint
        ? i18n.formatTemplate(strings.prismBadgeWithVer, { ver: env.versionHint })
        : strings.prismBadgeSynced;
      head.appendChild(headTitle);
      head.appendChild(badge);
      section.appendChild(head);

      const card = doc.createElement('div');
      card.className = 'ag-cs-settings-card divide-y ag-sg-prism-card';

      // Row 1: Threshold
      card.appendChild(
        mkSegRow({
          key: 'threshold',
          title: strings.cfgThreshold,
          desc: strings.prismDescThreshold,
          buttons: THRESHOLD_PRESETS.map((preset) => ({
            label: preset === 'off' ? strings.cfgThresholdOff : `${preset}%`,
            attr: 'data-ag-sg-prism-th',
            val: preset,
            active: cfg.compactThreshold === preset,
            onClick: () => updateConfig({ compactThreshold: preset }),
          })),
        })
      );

      // Row 2: Trigger mode
      card.appendChild(
        mkSegRow({
          key: 'mode',
          title: strings.cfgMode,
          desc: strings.prismDescMode,
          buttons: [
            ['confirm', strings.cfgModeConfirm],
            ['fill-only', strings.cfgModeFill],
            ['auto-countdown', strings.cfgModeCountdown],
          ].map(([mKey, mLabel]) => ({
            label: mLabel,
            attr: 'data-ag-sg-prism-mode',
            val: mKey,
            active: cfg.compactTriggerMode === mKey,
            onClick: () => updateConfig({ compactTriggerMode: mKey }),
          })),
        })
      );

      // Row 3: Smart /compact Focus
      let customInput = null;
      if (cfg.compactFocusPreset === 'custom') {
        customInput = doc.createElement('input');
        customInput.type = 'text';
        customInput.className = 'ag-sg-pop-input ag-sg-prism-input';
        customInput.setAttribute('data-ag-sg-prism-custom-focus', '1');
        customInput.placeholder = strings.cfgFocusCustomPlaceholder;
        customInput.value = cfg.customCompactFocus || '';
        customInput.addEventListener('input', () => {
          updateConfig({ customCompactFocus: customInput.value });
        });
      }
      card.appendChild(
        mkSegRow({
          key: 'focus',
          title: strings.cfgFocus,
          buttons: [
            ['default', strings.cfgFocusDefault],
            ['code-errors', strings.cfgFocusCode],
            ['bookmarks', strings.cfgFocusBookmarks],
            ['custom', strings.cfgFocusCustom],
          ].map(([fKey, fLabel]) => ({
            label: fLabel,
            attr: 'data-ag-sg-prism-focus',
            val: fKey,
            active: cfg.compactFocusPreset === fKey,
            onClick: () => updateConfig({ compactFocusPreset: fKey }),
          })),
          extraEl: customInput,
        })
      );

      // Row 4: Stall Watchdog
      card.appendChild(
        mkSegRow({
          key: 'stall',
          title: strings.cfgStall,
          buttons: STALL_PRESETS.map((sec) => ({
            label: sec === 'off' ? strings.cfgStallOff : `${Math.round(sec / 60)}m`,
            attr: 'data-ag-sg-prism-stall',
            val: sec,
            active: cfg.stallThresholdSeconds === sec,
            onClick: () => updateConfig({ stallThresholdSeconds: sec }),
          })),
        })
      );

      // Row 5: Complementary Modules
      card.appendChild(
        mkSegRow({
          key: 'modules',
          title: strings.cfgModules,
          desc: strings.prismDescModules,
          buttons: [
            ['draftGuard', strings.cfgModDraftGuard],
            ['outlineBookmarks', strings.cfgModBookmarks],
            ['sessionRadar', strings.cfgModRadar],
            ['sessionWatchdog', strings.cfgModWatchdog],
          ].map(([mKey, mLabel]) => ({
            label: mLabel,
            attr: 'data-ag-sg-prism-mod',
            val: mKey,
            active: Boolean(cfg.modules?.[mKey]),
            onClick: () => updateConfig({ modules: { ...cfg.modules, [mKey]: !cfg.modules?.[mKey] } }),
          })),
        })
      );

      // Row 6: Blurred OS Alerts (shown when Session Radar is active)
      if (cfg.modules?.sessionRadar) {
        card.appendChild(
          mkSegRow({
            key: 'notify',
            title: strings.cfgRadarNotify,
            buttons: [
              ['off', strings.cfgNotifyOff],
              ['awaiting', strings.cfgNotifyAwaiting],
              ['all', strings.cfgNotifyAll],
            ].map(([nKey, nLabel]) => ({
              label: nLabel,
              attr: 'data-ag-sg-prism-notify',
              val: nKey,
              active: cfg.radarNotifyMode === nKey,
              onClick: () => updateConfig({ radarNotifyMode: nKey }),
            })),
          })
        );
      }

      // Row 7: Quick Actions (Vault + Copy New-Session Handoff)
      const actButtons = [];
      if (typeof options.onOpenVault === 'function') {
        actButtons.push({
          label: strings.bmOpenVaultBtn,
          attr: 'data-ag-sg-prism-act',
          val: 'open-vault',
          active: false,
          onClick: () => options.onOpenVault(),
        });
      }
      if (typeof options.onCopyHandoff === 'function') {
        actButtons.push({
          label: strings.btnCopyHandoff,
          attr: 'data-ag-sg-prism-act',
          val: 'copy-handoff',
          active: false,
          onClick: () => { void options.onCopyHandoff(); },
        });
      }
      if (actButtons.length > 0) {
        card.appendChild(
          mkSegRow({
            key: 'actions',
            title: strings.prismQuickActions,
            buttons: actButtons,
          })
        );
      }

      section.appendChild(card);
      return true;
    }

    function checkHostContextChange() {
      if (destroyed || !doc?.documentElement) return;
      const curLang = doc.documentElement.getAttribute?.('data-ag-cs-lang') || '';
      const curTheme = doc.documentElement.getAttribute?.('data-ag-cs-theme') || '';
      if (curLang !== lastLang || curTheme !== lastTheme) {
        lastLang = curLang;
        lastTheme = curTheme;
        renderIntoPrismSettings();
        if (typeof options.onHostContextChange === 'function') {
          try { options.onHostContextChange({ lang: curLang, theme: curTheme }); } catch {}
        }
      }
    }

    function sync() {
      if (destroyed) return false;
      checkHostContextChange();
      return renderIntoPrismSettings();
    }

    function startObservers() {
      if (!doc || typeof win?.MutationObserver !== 'function') return;
      try {
        if (!domObserver) {
          let scheduled = false;
          domObserver = new win.MutationObserver((muts) => {
            if (destroyed || scheduled || coexist.isWindowHibernated(doc, win, false)) return;
            const relevant = muts.some((m) => {
              const t = m.target;
              if (t?.getAttribute?.('data-ag-sg-owned') === '1' || t?.closest?.('[data-ag-sg-owned="1"]')) return false;
              return true;
            });
            if (!relevant) return;
            scheduled = true;
            const run = () => {
              scheduled = false;
              if (!destroyed) renderIntoPrismSettings();
            };
            if (typeof win.requestAnimationFrame === 'function') win.requestAnimationFrame(run);
            else setTimeout(run, 16);
          });
          const rootNode = doc.body || doc.documentElement;
          if (rootNode) domObserver.observe(rootNode, { childList: true, subtree: true });
        }
        if (!htmlObserver && doc.documentElement) {
          htmlObserver = new win.MutationObserver(() => {
            if (!destroyed) checkHostContextChange();
          });
          htmlObserver.observe(doc.documentElement, {
            attributes: true,
            attributeFilter: ['data-ag-cs-lang', 'data-ag-cs-theme', 'data-ag-cs-style'],
          });
        }
      } catch {}
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      try { domObserver?.disconnect?.(); } catch {}
      try { htmlObserver?.disconnect?.(); } catch {}
      domObserver = htmlObserver = null;
      try { mountedEl?.remove?.(); } catch {}
      try {
        doc?.querySelectorAll?.(`[data-testid="${EMBED_SECTION_TESTID}"]`)?.forEach?.((n) => n.remove?.());
      } catch {}
      mountedEl = null;
    }

    lastLang = doc?.documentElement?.getAttribute?.('data-ag-cs-lang') || '';
    lastTheme = doc?.documentElement?.getAttribute?.('data-ag-cs-theme') || '';
    renderIntoPrismSettings();
    if (options.autoObserve !== false) startObservers();

    return {
      sync,
      detectEnvironment: () => detectPrismEnvironment(doc, win),
      getDebugState: () => ({
        destroyed,
        embedded: Boolean(mountedEl && mountedEl.isConnected !== false),
        env: detectPrismEnvironment(doc, win),
      }),
      destroy,
    };
  }

  return {
    PRISM_SETTINGS_SEC_ID,
    PRISM_MODULES_GROUP_SEL,
    EMBED_SECTION_TESTID,
    detectPrismEnvironment,
    createPrismBridgeController,
  };
});
