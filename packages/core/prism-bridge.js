// Antigravity Session Guard — Universal Settings Bridge (Obsidian Prism Modules Tab + Native Standalone Settings, UMD)
// Consumer-first design:
//   - Zero defensive badges or version strings in end-user UI
//   - With Obsidian Prism: mounts cleanly inside #ag-cs-settings-sec [data-ag-cs-group="modules"]
//   - Standalone (no Obsidian Prism): mounts a clean native card directly inside Antigravity's Settings dialog
//   - Bidirectional live sync with inline controls & live language/theme updates; 100% lossless destroy()
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
  const NATIVE_SECTION_TESTID = 'ag-sg-native-settings-section';
  const THRESHOLD_PRESETS = ['off', 75, 80, 85, 90];
  const SETTINGS_APPEARANCE_TITLES = new Set([
    'Appearance',
    '外观',
    '外觀',
    '外観',
    '외관',
    '모양',
    'Apariencia',
    'Apparence',
    'Darstellung',
    'Erscheinungsbild',
  ]);

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

    let versionHint = '';
    try {
      const aboutTxt = settingsEl?.querySelector?.('[data-ag-cs-about="1"]')?.textContent || '';
      const m = aboutTxt.match(/Obsidian\s+Prism\s+v([0-9]+\.[0-9]+\.[0-9]+(?:-(?:beta|alpha|rc)\.[0-9]+)?)/i);
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

  function findNativeSettingsAnchor(doc) {
    if (!doc || typeof doc.querySelectorAll !== 'function') return null;
    let panel = null;
    const headings = Array.from(doc.querySelectorAll('[role="dialog"] h2') || []);
    for (const h2 of headings) {
      if (SETTINGS_APPEARANCE_TITLES.has(String(h2.textContent || '').trim())) {
        panel = h2.closest?.('div.p-6') || h2.parentElement?.parentElement || null;
        if (panel) break;
      }
    }
    if (!panel || typeof panel.querySelectorAll !== 'function') return null;
    const sections = Array.from(panel.querySelectorAll('div.space-y-2') || []).filter(
      (s) =>
        s.getAttribute?.('data-ag-sg-owned') !== '1' &&
        !String(s.id || '').startsWith('ag-cs-') &&
        !(s.parentElement && s.parentElement.closest?.('div.space-y-2'))
    );
    const anchor = sections[sections.length - 1] || null;
    if (!anchor || !anchor.parentElement) return null;
    return { panel, anchor, parent: anchor.parentElement };
  }

  function createPrismBridgeController(options = {}) {
    const win = options.win || globalRoot;
    const doc = options.doc || win?.document || null;
    const coexist = options.coexist || resolveDep('__agSgCoexist', './coexist.js');
    const i18n = options.i18n || resolveDep('__agSgI18n', './i18n.js');
    const styles = options.styles || resolveDep('__agSgStyles', './styles.js');

    let destroyed = false;
    let mountedEl = null;
    let mountedMode = 'none'; // 'none' | 'prism' | 'native'
    let createdStyleEl = null;
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

    function mkSegRow({ key, title, desc, buttons, extraEl = null, inPrism = false }) {
      const row = doc.createElement('div');
      row.className = 'ag-sg-set-row';
      row.setAttribute('data-ag-sg-prism-row', key);

      const inner = doc.createElement('div');
      inner.className = inPrism ? 'py-2 ag-sg-set-row-inner' : 'ag-sg-set-row-inner';

      const textCol = doc.createElement('div');
      textCol.className = 'flex-1 ag-sg-set-text';
      const titleLine = doc.createElement('div');
      titleLine.className = inPrism ? 'ag-cs-settings-title-line ag-sg-set-row-title' : 'ag-sg-set-row-title';
      titleLine.textContent = title;
      textCol.appendChild(titleLine);
      if (desc) {
        const dSpan = doc.createElement('span');
        dSpan.className = 'ag-sg-set-row-desc';
        dSpan.textContent = desc;
        textCol.appendChild(dSpan);
      }

      const ctrlWrap = doc.createElement('div');
      ctrlWrap.className = 'shrink-0';
      const group = doc.createElement('div');
      group.className = inPrism ? 'ag-cs-seg-group ag-sg-seg' : 'ag-sg-seg';
      group.setAttribute('role', 'group');

      for (const spec of buttons) {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = inPrism ? 'ag-cs-seg-btn ag-sg-set-seg-btn' : 'ag-sg-set-seg-btn';
        b.textContent = spec.label;
        if (spec.title) b.title = spec.title;
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

    function populateSettingsCard(section, inPrism) {
      const cfg = getConfig();
      const strings = S();

      while (section.firstChild) section.removeChild(section.firstChild);

      // Clean consumer-facing section header — zero engineering badges or version clutter
      const head = doc.createElement(inPrism ? 'div' : 'h2');
      head.className = inPrism ? 'ag-cs-settings-subhead ag-sg-set-subhead' : 'ag-sg-native-heading';
      head.textContent = strings.brand;
      section.appendChild(head);

      const card = doc.createElement('div');
      card.className = inPrism ? 'ag-cs-settings-card divide-y ag-sg-set-card' : 'ag-sg-native-card';

      card.appendChild(
        mkSegRow({
          key: 'threshold',
          title: strings.cfgThreshold,
          desc: strings.setDescThreshold,
          inPrism,
          buttons: THRESHOLD_PRESETS.map((preset) => ({
            label: preset === 'off' ? strings.cfgThresholdOff : `${preset}%`,
            attr: 'data-ag-sg-prism-th',
            val: preset,
            active: cfg.compactThreshold === preset,
            onClick: () => updateConfig({ compactThreshold: preset }),
          })),
        })
      );

      card.appendChild(
        mkSegRow({
          key: 'mode',
          title: strings.cfgMode,
          desc: strings.setDescMode,
          inPrism,
          buttons: [
            ['auto-silent', strings.cfgModeSilent],
            ['confirm', strings.cfgModeConfirm],
          ].map(([mKey, mLabel]) => ({
            label: mLabel,
            attr: 'data-ag-sg-prism-mode',
            val: mKey,
            active: cfg.compactTriggerMode === mKey,
            onClick: () => updateConfig({ compactTriggerMode: mKey }),
          })),
        })
      );

      const modSpecs = [
        ['draftGuard', strings.cfgModDraftGuard, strings.modDescDraftGuard],
        ['outlineBookmarks', strings.cfgModBookmarks, strings.modDescBookmarks],
        ['sessionWatchdog', strings.cfgModWatchdog, strings.modDescWatchdog],
        ['sessionRadar', strings.cfgModRadar, strings.modDescRadar],
      ];
      const modGuide = doc.createElement('div');
      modGuide.className = 'ag-sg-mod-guide';
      modGuide.setAttribute('data-testid', 'ag-sg-mod-guide');
      for (const [mKey, mLabel, mDesc] of modSpecs) {
        const active = Boolean(cfg.modules?.[mKey]);
        const item = doc.createElement('div');
        item.className = 'ag-sg-mod-guide-item';
        item.setAttribute('data-active', active ? '1' : '0');
        const dot = doc.createElement('span');
        dot.className = 'ag-sg-mod-guide-dot';
        dot.setAttribute('aria-hidden', 'true');
        const name = doc.createElement('span');
        name.className = 'ag-sg-mod-guide-name';
        name.textContent = mLabel;
        const txt = doc.createElement('span');
        txt.className = 'ag-sg-mod-guide-desc';
        txt.textContent = mDesc;
        item.appendChild(dot);
        item.appendChild(name);
        item.appendChild(txt);
        modGuide.appendChild(item);
      }

      card.appendChild(
        mkSegRow({
          key: 'modules',
          title: strings.cfgModules,
          desc: strings.setDescModules,
          inPrism,
          extraEl: modGuide,
          buttons: modSpecs.map(([mKey, mLabel, mDesc]) => ({
            label: mLabel,
            title: mDesc,
            attr: 'data-ag-sg-prism-mod',
            val: mKey,
            active: Boolean(cfg.modules?.[mKey]),
            onClick: () => updateConfig({ modules: { ...cfg.modules, [mKey]: !cfg.modules?.[mKey] } }),
          })),
        })
      );

      if (cfg.modules?.sessionRadar) {
        card.appendChild(
          mkSegRow({
            key: 'notify',
            title: strings.cfgRadarNotify,
            inPrism,
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

      section.appendChild(card);
    }

    function renderIntoSettings() {
      if (destroyed || !doc) return false;
      ensureStyle();

      // Priority 1: Embed cleanly inside Obsidian Prism's Modules tab if #ag-cs-settings-sec exists
      const settingsEl = doc.getElementById?.(PRISM_SETTINGS_SEC_ID);
      const modulesGroup = settingsEl?.querySelector?.(PRISM_MODULES_GROUP_SEL) || null;
      if (settingsEl && modulesGroup) {
        // Remove standalone native section if Prism appeared afterwards so there is never duplication
        doc.querySelectorAll?.(`[data-testid="${NATIVE_SECTION_TESTID}"]`)?.forEach?.((n) => n.remove?.());
        let section = modulesGroup.querySelector?.(`[data-testid="${EMBED_SECTION_TESTID}"]`) || null;
        if (!section) {
          section = coexist.markOwnedNoTranslate(doc.createElement('div'));
          section.className = 'ag-sg-set-section';
          section.setAttribute('data-testid', EMBED_SECTION_TESTID);
          modulesGroup.appendChild(section);
        }
        mountedEl = section;
        mountedMode = 'prism';
        populateSettingsCard(section, true);
        return true;
      }

      // Priority 2: Standalone user (no Obsidian Prism) -> mount cleanly in Antigravity's native Settings dialog
      const nativeAnchor = findNativeSettingsAnchor(doc);
      if (nativeAnchor) {
        let section = nativeAnchor.parent.querySelector?.(`[data-testid="${NATIVE_SECTION_TESTID}"]`) || null;
        if (!section) {
          section = coexist.markOwnedNoTranslate(doc.createElement('div'));
          section.className = 'space-y-2 ag-sg-native-section';
          section.setAttribute('data-testid', NATIVE_SECTION_TESTID);
          nativeAnchor.parent.appendChild(section);
        }
        mountedEl = section;
        mountedMode = 'native';
        populateSettingsCard(section, false);
        return true;
      }

      if (mountedEl && mountedEl.isConnected === false) {
        mountedEl = null;
        mountedMode = 'none';
      }
      return false;
    }

    function checkHostContextChange() {
      if (destroyed || !doc?.documentElement) return;
      const curLang = doc.documentElement.getAttribute?.('data-ag-cs-lang') || doc.documentElement.getAttribute?.('lang') || '';
      const curTheme = doc.documentElement.getAttribute?.('data-ag-cs-theme') || '';
      if (curLang !== lastLang || curTheme !== lastTheme) {
        lastLang = curLang;
        lastTheme = curTheme;
        renderIntoSettings();
        if (typeof options.onHostContextChange === 'function') {
          try { options.onHostContextChange({ lang: curLang, theme: curTheme }); } catch {}
        }
      }
    }

    function sync() {
      if (destroyed) return false;
      checkHostContextChange();
      return renderIntoSettings();
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
              if (!destroyed) renderIntoSettings();
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
            attributeFilter: ['data-ag-cs-lang', 'data-ag-cs-theme', 'data-ag-cs-style', 'lang'],
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
      try { createdStyleEl?.remove?.(); } catch {}
      try {
        doc?.querySelectorAll?.(`[data-testid="${EMBED_SECTION_TESTID}"], [data-testid="${NATIVE_SECTION_TESTID}"]`)?.forEach?.((n) => n.remove?.());
      } catch {}
      mountedEl = createdStyleEl = null;
      mountedMode = 'none';
    }

    lastLang = doc?.documentElement?.getAttribute?.('data-ag-cs-lang') || doc?.documentElement?.getAttribute?.('lang') || '';
    lastTheme = doc?.documentElement?.getAttribute?.('data-ag-cs-theme') || '';
    renderIntoSettings();
    if (options.autoObserve !== false) startObservers();

    return {
      sync,
      detectEnvironment: () => detectPrismEnvironment(doc, win),
      getDebugState: () => ({
        destroyed,
        embedded: Boolean(mountedEl && mountedEl.isConnected !== false),
        mountedMode: mountedEl && mountedEl.isConnected !== false ? mountedMode : 'none',
        env: detectPrismEnvironment(doc, win),
      }),
      destroy,
    };
  }

  return {
    PRISM_SETTINGS_SEC_ID,
    PRISM_MODULES_GROUP_SEL,
    EMBED_SECTION_TESTID,
    NATIVE_SECTION_TESTID,
    detectPrismEnvironment,
    findNativeSettingsAnchor,
    createPrismBridgeController,
  };
});
