// agy-Sag — Universal Settings Bridge (Obsidian Prism Modules Tab + Native Standalone Settings, UMD)
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
    const novSynergyMod = options.novSynergyMod || resolveDep('__agSagNovSynergy', './nov-synergy.js');
    const novSynergy = options.novSynergy || null;
    const uiStorage = options.storage || win?.localStorage || null;

    const SUBTAB_IDS = ['all', 'ui', 'flow', 'auto', 'nov'];
    const SUBTAB_STORAGE_KEY = 'agSag.ui.activeSubTab.v1';
    const EXPANDED_STORAGE_KEY = 'agSag.ui.panelExpanded.v1';

    function readUiState(key, fallback) {
      try {
        const val = uiStorage?.getItem?.(key);
        return val !== null && val !== undefined ? val : fallback;
      } catch {
        return fallback;
      }
    }

    function writeUiState(key, val) {
      try {
        uiStorage?.setItem?.(key, String(val));
      } catch {}
    }

    let destroyed = false;
    let mountedEl = null;
    let mountedMode = 'none'; // 'none' | 'prism' | 'native'
    let createdStyleEl = null;
    let domObserver = null;
    let htmlObserver = null;
    let lastLang = '';
    let lastTheme = '';
    let copiedInstallFeedback = false;
    let copyResetTimer = null;
    let novAutoRefreshInFlight = false;
    let novAutoRefreshAttempted = false;
    const savedTab = readUiState(SUBTAB_STORAGE_KEY, 'all');
    let activeSubTab = SUBTAB_IDS.includes(savedTab) ? savedTab : 'all';
    const savedExpanded = readUiState(EXPANDED_STORAGE_KEY, '1');
    let panelExpanded = savedExpanded !== '0';

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

      // agy-Sag Native-Grade Modular Control Center + Dual-Star agy-NOV Synergy Hub
      const sagStrings = typeof i18n.getSagStrings === 'function' ? i18n.getSagStrings(getLang()) : null;
      if (sagStrings) {
        const lang = getLang();
        const isZh = lang === 'zh-CN' || lang === 'zh-TW' || lang === 'yue';
        const suite = doc.createElement('div');
        suite.className = 'ag-sag-suite-panel';
        suite.setAttribute('data-testid', 'ag-sag-suite-panel');

        const novState = novSynergy?.getState ? novSynergy.getState() : null;
        const novConnected = Boolean(novState?.installed && novState?.bridgeConnected);
        const allModuleKeys = Object.keys(cfg.modules || {});
        const enabledModuleCount = allModuleKeys.filter((k) => Boolean(cfg.modules?.[k])).length;
        const totalModuleCount = allModuleKeys.length || 11;

        const detectActiveSagPreset = () => {
          const presets = coexist?.PRESETS || {};
          for (const pid of ['essential', 'i18n-only', 'power', 'full-auto']) {
            const spec = presets[pid];
            if (!spec || !spec.modules) continue;
            const keys = Object.keys(spec.modules);
            if (keys.every((k) => Boolean(cfg.modules?.[k]) === Boolean(spec.modules[k]))) {
              return pid;
            }
          }
          return '';
        };
        const activeSagPreset = detectActiveSagPreset();

        // Collapsible Summary Header (.ag-sag-fold-head)
        const foldHead = doc.createElement('div');
        foldHead.className = 'ag-sag-fold-head';
        foldHead.setAttribute('data-testid', 'ag-sag-fold-head');
        foldHead.setAttribute('role', 'button');
        foldHead.setAttribute('tabindex', '0');
        foldHead.setAttribute('aria-expanded', String(panelExpanded));
        foldHead.title = panelExpanded ? sagStrings.foldCollapse : sagStrings.foldExpand;

        const foldLeft = doc.createElement('div');
        foldLeft.className = 'ag-sag-fold-left';

        const brandBadge = doc.createElement('span');
        brandBadge.className = 'ag-sag-brand-badge';
        const liveDot = doc.createElement('span');
        liveDot.className = 'ag-sag-live-dot';
        liveDot.setAttribute('aria-hidden', 'true');
        const brandTxt = doc.createElement('span');
        brandTxt.textContent = sagStrings.foldBrand;
        brandBadge.appendChild(liveDot);
        brandBadge.appendChild(brandTxt);
        foldLeft.appendChild(brandBadge);

        const countPill = doc.createElement('span');
        countPill.className = 'ag-sag-meta-pill';
        countPill.setAttribute('data-testid', 'ag-sag-mod-count');
        countPill.textContent = i18n.formatTemplate(sagStrings.foldOnCount, {
          on: enabledModuleCount,
          total: totalModuleCount,
        });
        foldLeft.appendChild(countPill);

        const langPill = doc.createElement('span');
        langPill.className = 'ag-sag-meta-pill';
        langPill.setAttribute('data-testid', 'ag-sag-lang-badge');
        langPill.textContent = cfg.hostI18nLocale || 'auto';
        foldLeft.appendChild(langPill);

        const foldRight = doc.createElement('div');
        foldRight.className = 'ag-sag-fold-right';

        if (novConnected) {
          const dualPill = doc.createElement('button');
          dualPill.type = 'button';
          dualPill.className = 'ag-sag-dual-pill';
          dualPill.setAttribute('data-testid', 'ag-sag-dual-star-pill');
          const dDot = doc.createElement('span');
          dDot.className = 'ag-sag-dual-dot';
          dDot.setAttribute('aria-hidden', 'true');
          const dLbl = doc.createElement('span');
          dLbl.textContent = sagStrings.foldDualPill;
          dualPill.appendChild(dDot);
          dualPill.appendChild(dLbl);
          dualPill.addEventListener('click', (ev) => {
            ev?.preventDefault?.();
            ev?.stopPropagation?.();
            panelExpanded = true;
            activeSubTab = 'nov';
            writeUiState(EXPANDED_STORAGE_KEY, '1');
            writeUiState(SUBTAB_STORAGE_KEY, 'nov');
            renderIntoSettings();
          });
          foldRight.appendChild(dualPill);
        }

        const chev = doc.createElement('span');
        chev.className = 'ag-sag-fold-chevron';
        chev.setAttribute('aria-hidden', 'true');
        chev.textContent = panelExpanded ? '▾' : '▸';
        foldRight.appendChild(chev);

        foldHead.appendChild(foldLeft);
        foldHead.appendChild(foldRight);
        foldHead.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          panelExpanded = !panelExpanded;
          writeUiState(EXPANDED_STORAGE_KEY, panelExpanded ? '1' : '0');
          renderIntoSettings();
        });
        suite.appendChild(foldHead);

        // Collapsible Body
        const foldBody = doc.createElement('div');
        foldBody.className = 'ag-sag-fold-body';
        foldBody.setAttribute('data-testid', 'ag-sag-fold-body');
        foldBody.hidden = !panelExpanded;

        const mkSuiteRow = (labelText, descText, rightEl, stacked = false) => {
          const r = doc.createElement('div');
          r.className = stacked ? 'ag-sag-suite-row ag-sag-suite-row-stack' : 'ag-sag-suite-row';
          const left = doc.createElement('div');
          left.className = 'ag-sag-suite-label';
          const st = doc.createElement('strong');
          st.textContent = labelText;
          left.appendChild(st);
          if (descText) {
            const sp = doc.createElement('span');
            sp.textContent = descText;
            left.appendChild(sp);
          }
          r.appendChild(left);
          if (rightEl) r.appendChild(rightEl);
          return r;
        };

        const mkChip = ({ label, active, attr, val, risk, title, onClick }) => {
          const b = doc.createElement('button');
          b.type = 'button';
          b.className = 'ag-sag-chip';
          b.textContent = label;
          if (title) b.title = title;
          b.setAttribute('aria-pressed', String(Boolean(active)));
          if (attr && val !== undefined) b.setAttribute(attr, String(val));
          if (risk) b.setAttribute('data-risk', risk);
          b.addEventListener('click', (ev) => {
            ev?.preventDefault?.();
            ev?.stopPropagation?.();
            onClick();
          });
          return b;
        };

        // TopDeck: Scene Presets
        if (typeof options.onApplyPreset === 'function') {
          const topDeck = doc.createElement('div');
          topDeck.className = 'ag-sag-topdeck';
          topDeck.setAttribute('data-testid', 'ag-sag-topdeck');
          const tdLeft = doc.createElement('div');
          tdLeft.className = 'ag-sag-suite-label';
          const tdTitle = doc.createElement('strong');
          tdTitle.textContent = sagStrings.presetLabel;
          const tdDesc = doc.createElement('span');
          tdDesc.textContent = sagStrings.presetDesc;
          tdLeft.appendChild(tdTitle);
          tdLeft.appendChild(tdDesc);

          const pGrid = doc.createElement('div');
          pGrid.className = 'ag-sag-ext-grid';
          for (const [pId, pLbl] of [
            ['essential', sagStrings.presetEssential],
            ['i18n-only', sagStrings.presetI18nOnly],
            ['power', sagStrings.presetPower],
            ['full-auto', sagStrings.presetFullAuto],
          ]) {
            pGrid.appendChild(
              mkChip({
                label: pLbl,
                active: activeSagPreset === pId,
                attr: 'data-ag-sag-preset',
                val: pId,
                onClick: () => options.onApplyPreset(pId),
              })
            );
          }
          topDeck.appendChild(tdLeft);
          topDeck.appendChild(pGrid);
          foldBody.appendChild(topDeck);
        }

        // 5 Horizontal Segmented SubTabs
        const subtabs = doc.createElement('div');
        subtabs.className = 'ag-sag-subtabs';
        subtabs.setAttribute('data-testid', 'ag-sag-subtabs');
        subtabs.setAttribute('role', 'tablist');
        const tabSpecs = [
          ['all', sagStrings.tabAll],
          ['ui', sagStrings.tabUi],
          ['flow', sagStrings.tabFlow],
          ['auto', sagStrings.tabAuto],
          ['nov', sagStrings.tabNov],
        ];
        for (const [tabId, tabLabel] of tabSpecs) {
          const tb = doc.createElement('button');
          tb.type = 'button';
          tb.className = 'ag-sag-subtab';
          tb.setAttribute('role', 'tab');
          tb.setAttribute('data-ag-sag-subtab', tabId);
          tb.setAttribute('aria-pressed', String(activeSubTab === tabId));
          tb.setAttribute('aria-selected', String(activeSubTab === tabId));
          if (tabId === 'nov' && novConnected) {
            const dot = doc.createElement('span');
            dot.className = 'ag-sag-subtab-dot';
            dot.setAttribute('aria-hidden', 'true');
            tb.appendChild(dot);
          }
          const lblSpan = doc.createElement('span');
          lblSpan.textContent = tabLabel;
          tb.appendChild(lblSpan);
          tb.addEventListener('click', (ev) => {
            ev?.preventDefault?.();
            ev?.stopPropagation?.();
            activeSubTab = tabId;
            if (tabId === 'nov' || tabId === 'all') novAutoRefreshAttempted = false;
            writeUiState(SUBTAB_STORAGE_KEY, tabId);
            renderIntoSettings();
          });
          subtabs.appendChild(tb);
        }
        foldBody.appendChild(subtabs);

        const showTab = (tabId) => activeSubTab === 'all' || activeSubTab === tabId;

        // === Tab 1: ui (Language & Optical Appearance) ===
        if (showTab('ui')) {
          const uiPane = doc.createElement('div');
          uiPane.className = 'ag-sag-pane';
          uiPane.setAttribute('data-ag-sag-pane', 'ui');

          // 10-Language Native UI Translator
          const langCtrl = doc.createElement('div');
          langCtrl.className = 'ag-sag-ext-grid';
          const sel = doc.createElement('select');
          sel.className = 'ag-sag-select';
          sel.setAttribute('data-testid', 'ag-sag-host-locale-select');
          const localeOpts = [
            ['auto', sagStrings.hostI18nAuto],
            ['en', sagStrings.hostI18nOrig],
            ['zh-CN', '简体中文 (zh-CN)'],
            ['zh-TW', '繁體中文 (zh-TW)'],
            ['ja', '日本語 (ja)'],
            ['ko', '한국어 (ko)'],
            ['es', 'Español (es)'],
            ['fr', 'Français (fr)'],
            ['de', 'Deutsch (de)'],
            ['ru', 'Русский (ru)'],
            ['pt-BR', 'Português (pt-BR)'],
          ];
          for (const [code, label] of localeOpts) {
            const opt = doc.createElement('option');
            opt.value = code;
            opt.textContent = label;
            if ((cfg.hostI18nLocale || 'auto') === code) opt.selected = true;
            sel.appendChild(opt);
          }
          sel.value = cfg.hostI18nLocale || 'auto';
          sel.addEventListener('change', (ev) => {
            const nextLoc = ev?.target?.value || sel.value || 'auto';
            updateConfig({
              hostI18nLocale: nextLoc,
              modules: { ...cfg.modules, hostI18n: nextLoc !== 'en' },
            });
          });
          langCtrl.appendChild(sel);
          langCtrl.appendChild(
            mkChip({
              label: cfg.hostI18nConflictPolicy === 'takeover' ? sagStrings.conflictTakeover : sagStrings.conflictYield,
              active: cfg.hostI18nConflictPolicy === 'takeover',
              attr: 'data-ag-sag-i18n-policy',
              val: cfg.hostI18nConflictPolicy || 'yield',
              onClick: () =>
                updateConfig({
                  hostI18nConflictPolicy: cfg.hostI18nConflictPolicy === 'takeover' ? 'yield' : 'takeover',
                }),
            })
          );
          uiPane.appendChild(mkSuiteRow(sagStrings.hostI18nLabel, sagStrings.hostI18nDesc, langCtrl));

          // Optical Theme Studio: 5 skins + CJK font + density
          if (cfg.modules?.themeStudio || activeSubTab === 'ui') {
            const thGrid = doc.createElement('div');
            thGrid.className = 'ag-sag-ext-grid';
            for (const [tid, tLbl] of [
              ['native', sagStrings.themeNative],
              ['midnight-ink', sagStrings.themeMidnight],
              ['nord-frost', sagStrings.themeNord],
              ['warm-paper', sagStrings.themeWarmPaper],
              ['oled-pure', sagStrings.themeOled],
            ]) {
              thGrid.appendChild(
                mkChip({
                  label: tLbl,
                  active: Boolean(cfg.modules?.themeStudio) && (cfg.themePreset || 'native') === tid,
                  attr: 'data-ag-sag-theme',
                  val: tid,
                  onClick: () =>
                    updateConfig({
                      themePreset: tid,
                      modules: { ...cfg.modules, themeStudio: tid !== 'native' ? true : Boolean(cfg.modules?.themeStudio) },
                    }),
                })
              );
            }
            thGrid.appendChild(
              mkChip({
                label: sagStrings.themeCjk,
                active: cfg.themeCjkFont !== false,
                attr: 'data-ag-sag-theme-cjk',
                val: '1',
                onClick: () =>
                  updateConfig({
                    themeCjkFont: cfg.themeCjkFont === false,
                    modules: { ...cfg.modules, themeStudio: true },
                  }),
              })
            );
            for (const [did, dLbl] of [
              ['compact', sagStrings.densityCompact],
              ['balanced', sagStrings.densityBalanced],
              ['comfortable', sagStrings.densityComfortable],
            ]) {
              thGrid.appendChild(
                mkChip({
                  label: dLbl,
                  active: (cfg.themeDensity || 'balanced') === did,
                  attr: 'data-ag-sag-theme-density',
                  val: did,
                  onClick: () =>
                    updateConfig({
                      themeDensity: did,
                      modules: { ...cfg.modules, themeStudio: true },
                    }),
                })
              );
            }
            uiPane.appendChild(mkSuiteRow(sagStrings.themeLabel, sagStrings.themeDesc, thGrid));
          }

          foldBody.appendChild(uiPane);
        }

        // === Tab 2: flow (Conversation & Productivity) ===
        if (showTab('flow')) {
          const flowPane = doc.createElement('div');
          flowPane.className = 'ag-sag-pane';
          flowPane.setAttribute('data-ag-sag-pane', 'flow');

          const extGrid = doc.createElement('div');
          extGrid.className = 'ag-sag-ext-grid';
          const flowSpecs = [
            ['hostI18n', sagStrings.modHostI18n, sagStrings.modDescHostI18n, ''],
            ['promptQueue', sagStrings.modPromptQueue, sagStrings.modDescPromptQueue, ''],
            ['safeAutoAccept', sagStrings.modSafeAutoAccept, sagStrings.modDescSafeAutoAccept, 'high'],
            ['themeStudio', sagStrings.modThemeStudio, sagStrings.modDescThemeStudio, ''],
            ['quotaPulse', sagStrings.modQuotaPulse, sagStrings.modDescQuotaPulse, ''],
          ];
          for (const [mKey, mLabel, mDesc, risk] of flowSpecs) {
            extGrid.appendChild(
              mkChip({
                label: mLabel,
                title: mDesc,
                active: Boolean(cfg.modules?.[mKey]),
                attr: 'data-ag-sag-mod',
                val: mKey,
                risk,
                onClick: () => updateConfig({ modules: { ...cfg.modules, [mKey]: !cfg.modules?.[mKey] } }),
              })
            );
          }
          flowPane.appendChild(mkSuiteRow(sagStrings.extModulesLabel, sagStrings.extModulesDesc, extGrid));

          if (activeSubTab === 'flow') {
            const flowList = doc.createElement('div');
            flowList.className = 'ag-sag-flow-list';
            for (const [mKey, mLabel, mDesc] of flowSpecs) {
              const fc = doc.createElement('div');
              fc.className = 'ag-sag-flow-card';
              fc.setAttribute('data-active', cfg.modules?.[mKey] ? '1' : '0');
              const ft = doc.createElement('strong');
              ft.textContent = `${mLabel} · ${cfg.modules?.[mKey] ? 'ON' : 'OFF'}`;
              const fd = doc.createElement('span');
              fd.textContent = mDesc;
              fc.appendChild(ft);
              fc.appendChild(fd);
              flowList.appendChild(fc);
            }
            flowPane.appendChild(flowList);
          }

          foldBody.appendChild(flowPane);
        }

        // === Tab 3: auto (Safety & Read-Only Quota) ===
        if (showTab('auto')) {
          const autoPane = doc.createElement('div');
          autoPane.className = 'ag-sag-pane';
          autoPane.setAttribute('data-ag-sag-pane', 'auto');

          if (cfg.modules?.safeAutoAccept || activeSubTab === 'auto') {
            const aaGrid = doc.createElement('div');
            aaGrid.className = 'ag-sag-ext-grid';
            if (activeSubTab === 'auto') {
              aaGrid.appendChild(
                mkChip({
                  label: sagStrings.modSafeAutoAccept,
                  active: Boolean(cfg.modules?.safeAutoAccept),
                  attr: 'data-ag-sag-mod',
                  val: 'safeAutoAccept',
                  risk: 'high',
                  onClick: () =>
                    updateConfig({
                      modules: { ...cfg.modules, safeAutoAccept: !cfg.modules?.safeAutoAccept },
                    }),
                })
              );
            }
            for (const [pol, pLbl] of [
              ['readonly-safe', sagStrings.autoAcceptReadonly],
              ['dev-flow', sagStrings.autoAcceptDevFlow],
            ]) {
              aaGrid.appendChild(
                mkChip({
                  label: pLbl,
                  active: Boolean(cfg.modules?.safeAutoAccept) && (cfg.autoAcceptPolicy || 'readonly-safe') === pol,
                  attr: 'data-ag-sag-aa-policy',
                  val: pol,
                  risk: 'high',
                  onClick: () =>
                    updateConfig({
                      autoAcceptPolicy: pol,
                      modules: { ...cfg.modules, safeAutoAccept: true },
                    }),
                })
              );
            }
            aaGrid.appendChild(
              mkChip({
                label: sagStrings.autoAcceptDryRun,
                active: Boolean(cfg.autoAcceptDryRun),
                attr: 'data-ag-sag-aa-dryrun',
                val: '1',
                onClick: () => updateConfig({ autoAcceptDryRun: !cfg.autoAcceptDryRun }),
              })
            );
            autoPane.appendChild(
              mkSuiteRow(
                sagStrings.autoAcceptLabel,
                cfg.modules?.safeAutoAccept ? sagStrings.autoAcceptDesc : sagStrings.autoAcceptOffHint,
                aaGrid
              )
            );
          }

          if ((cfg.modules?.quotaPulse && typeof options.getQuotaSummary === 'function') || activeSubTab === 'auto') {
            const qCtrl = doc.createElement('div');
            qCtrl.className = 'ag-sag-ext-grid';
            if (activeSubTab === 'auto') {
              qCtrl.appendChild(
                mkChip({
                  label: sagStrings.modQuotaPulse,
                  active: Boolean(cfg.modules?.quotaPulse),
                  attr: 'data-ag-sag-mod',
                  val: 'quotaPulse',
                  onClick: () =>
                    updateConfig({
                      modules: { ...cfg.modules, quotaPulse: !cfg.modules?.quotaPulse },
                    }),
                })
              );
            }
            if (cfg.modules?.quotaPulse && typeof options.getQuotaSummary === 'function') {
              const qs = options.getQuotaSummary();
              const badge = doc.createElement('span');
              badge.className = 'ag-sag-badge-note';
              badge.setAttribute('data-testid', 'ag-sag-quota-summary');
              badge.textContent = i18n.formatTemplate(sagStrings.quotaSummary, {
                t5: qs?.localEstimate?.turns5h ?? 0,
                t7: qs?.localEstimate?.turns7d ?? 0,
                health: qs?.health || 'ok',
              });
              qCtrl.appendChild(badge);
            }
            autoPane.appendChild(
              mkSuiteRow(
                sagStrings.quotaLabel,
                cfg.modules?.quotaPulse ? sagStrings.quotaDesc : sagStrings.quotaOffHint,
                qCtrl
              )
            );
          }

          if (autoPane.children.length > 0) {
            foldBody.appendChild(autoPane);
          }
        }

        // === Tab 4: nov (Dual-Star agy-NOV Synergy Hub) ===
        if (showTab('nov')) {
          if (
            !novState?.bridgeConnected &&
            typeof novSynergy?.isBridgeAvailable === 'function' &&
            novSynergy.isBridgeAvailable() &&
            !novAutoRefreshInFlight &&
            !novAutoRefreshAttempted
          ) {
            novAutoRefreshInFlight = true;
            novAutoRefreshAttempted = true;
            Promise.resolve(novSynergy.refresh?.())
              .catch(() => {})
              .finally(() => {
                novAutoRefreshInFlight = false;
              });
          } else if (novState?.bridgeConnected) {
            novAutoRefreshAttempted = false;
          }
          const novPane = doc.createElement('div');
          novPane.className = 'ag-sag-pane';
          novPane.setAttribute('data-ag-sag-pane', 'nov');
          novPane.setAttribute('data-testid', 'ag-sag-nov-panel');

          const novModulesMeta = novSynergyMod?.NOV_MODULES_META || [];
          const novPresetsMeta = novSynergyMod?.NOV_PRESETS_META || [];
          const installCmd = novSynergyMod?.NOV_INSTALL_CMD || 'agy plugin install https://github.com/tone-leh/agy-NOV';

          if (novConnected && novState) {
            // Connected agy-NOV Banner
            const banner = doc.createElement('div');
            banner.className = 'ag-sag-nov-banner';
            const bLeft = doc.createElement('div');
            bLeft.className = 'ag-sag-suite-label';
            const bTitle = doc.createElement('strong');
            bTitle.textContent = sagStrings.novHeaderTitle;
            const bMeta = doc.createElement('span');
            bMeta.className = 'ag-sag-nov-meta';
            bMeta.setAttribute('data-testid', 'ag-sag-nov-meta');
            bMeta.textContent = i18n.formatTemplate(sagStrings.novConnectedMeta, {
              ver: novState.version || '0.2.0',
              preset: novState.config?.preset || 'core',
              on: novState.enabledCount ?? 0,
              tools: novState.toolCount ?? 2,
            });
            bLeft.appendChild(bTitle);
            bLeft.appendChild(bMeta);
            banner.appendChild(bLeft);

            if (typeof novSynergy?.refresh === 'function') {
              banner.appendChild(
                mkChip({
                  label: sagStrings.novRefreshBtn,
                  active: false,
                  attr: 'data-ag-nov-refresh',
                  val: '1',
                  onClick: () => {
                    void novSynergy.refresh();
                  },
                })
              );
            }
            novPane.appendChild(banner);

            // 5 agy-NOV Scene Presets
            const novPresetGrid = doc.createElement('div');
            novPresetGrid.className = 'ag-sag-ext-grid';
            for (const p of novPresetsMeta) {
              novPresetGrid.appendChild(
                mkChip({
                  label: isZh ? p.nameZh : p.nameEn,
                  title: isZh ? p.descZh : p.descEn,
                  active: (novState.config?.preset || '') === p.id,
                  attr: 'data-ag-nov-preset',
                  val: p.id,
                  risk: p.privacy === 'opt-in-network' ? 'high' : '',
                  onClick: () => {
                    void novSynergy.applyPreset(p.id);
                  },
                })
              );
            }
            novPane.appendChild(mkSuiteRow(sagStrings.novPresetLabel, sagStrings.novPresetDesc, novPresetGrid));

            // 9 agy-NOV Module Switch Cards Grid
            const modGrid = doc.createElement('div');
            modGrid.className = 'ag-sag-nov-grid';
            modGrid.setAttribute('data-testid', 'ag-sag-nov-mod-grid');
            for (const m of novModulesMeta) {
              const isOn = Boolean(novState.config?.modules?.[m.id]);
              const cardBtn = doc.createElement('button');
              cardBtn.type = 'button';
              cardBtn.className = 'ag-sag-nov-card';
              cardBtn.setAttribute('data-ag-nov-mod', m.id);
              cardBtn.setAttribute('data-privacy', m.privacy);
              cardBtn.setAttribute('aria-pressed', String(isOn));
              cardBtn.title = isZh ? m.descZh : m.descEn;

              const top = doc.createElement('div');
              top.className = 'ag-sag-nov-card-top';
              const nm = doc.createElement('span');
              nm.className = 'ag-sag-nov-card-name';
              nm.textContent = isZh ? m.nameZh : m.nameEn;
              const led = doc.createElement('span');
              led.className = 'ag-sag-nov-led';
              led.setAttribute('aria-hidden', 'true');
              top.appendChild(nm);
              top.appendChild(led);

              const tags = doc.createElement('div');
              tags.className = 'ag-sag-nov-card-tags';
              const toolTag = doc.createElement('span');
              toolTag.className = 'ag-sag-nov-tag';
              toolTag.textContent = i18n.formatTemplate(sagStrings.novToolsBadge, { n: m.toolCount });
              tags.appendChild(toolTag);

              const privTag = doc.createElement('span');
              privTag.className = 'ag-sag-nov-tag';
              if (m.privacy === 'opt-in-network') {
                privTag.setAttribute('data-kind', 'network');
                privTag.textContent = sagStrings.novPrivacyNetwork;
              } else {
                privTag.textContent = sagStrings.novPrivacyOffline;
              }
              tags.appendChild(privTag);

              cardBtn.appendChild(top);
              cardBtn.appendChild(tags);
              cardBtn.addEventListener('click', (ev) => {
                ev?.preventDefault?.();
                ev?.stopPropagation?.();
                void novSynergy.setModule(m.id, !isOn);
              });
              modGrid.appendChild(cardBtn);
            }
            novPane.appendChild(mkSuiteRow(sagStrings.novModulesLabel, sagStrings.novModulesDesc, modGrid, true));

            // Real-time Dual-Star Synergy Effects Zone
            const synEffects = novSynergy?.getSynergyEffects
              ? novSynergy.getSynergyEffects(cfg)
              : novSynergyMod?.computeSynergyEffects
                ? novSynergyMod.computeSynergyEffects(cfg, novState, { bridgeConnected: true })
                : [];
            const synBox = doc.createElement('div');
            synBox.className = 'ag-sag-synergy-box';
            synBox.setAttribute('data-testid', 'ag-sag-synergy-effects');

            const synTitle = doc.createElement('div');
            synTitle.className = 'ag-sag-synergy-title';
            synTitle.textContent = sagStrings.novSynergyTitle;
            synBox.appendChild(synTitle);

            const synList = doc.createElement('div');
            synList.className = 'ag-sag-synergy-list';
            if (!synEffects.length) {
              const empty = doc.createElement('span');
              empty.className = 'ag-sag-badge-note';
              empty.textContent = sagStrings.novSynergyEmpty;
              synList.appendChild(empty);
            } else {
              for (const eff of synEffects) {
                const rowEl = doc.createElement('div');
                rowEl.className = 'ag-sag-synergy-item';
                rowEl.setAttribute('data-ag-synergy-id', eff.id);
                rowEl.setAttribute('data-status', eff.status);

                const txt = doc.createElement('span');
                txt.className = 'ag-sag-synergy-text';
                txt.textContent = isZh ? eff.descZh : eff.descEn;
                rowEl.appendChild(txt);

                if (eff.quickAction) {
                  const act = eff.quickAction;
                  const actBtn = doc.createElement('button');
                  actBtn.type = 'button';
                  actBtn.className = 'ag-sag-synergy-act';
                  actBtn.setAttribute('data-ag-synergy-action', act.type);
                  actBtn.setAttribute('data-ag-synergy-target', act.moduleId);
                  actBtn.textContent = isZh ? act.labelZh : act.labelEn;
                  actBtn.addEventListener('click', (ev) => {
                    ev?.preventDefault?.();
                    ev?.stopPropagation?.();
                    if (act.type === 'enable-nov-module' && novSynergy?.setModule) {
                      void novSynergy.setModule(act.moduleId, true);
                    } else if (act.type === 'disable-sag-module') {
                      updateConfig({ modules: { ...cfg.modules, [act.moduleId]: false } });
                    }
                  });
                  rowEl.appendChild(actBtn);
                }
                synList.appendChild(rowEl);
              }
            }
            synBox.appendChild(synList);
            novPane.appendChild(synBox);
          } else if (novState?.installed && !novState.bridgeConnected) {
            // Installed locally, awaiting Watch Sidecar bridge
            const waitCard = doc.createElement('div');
            waitCard.className = 'ag-sag-nov-promo';
            waitCard.setAttribute('data-testid', 'ag-sag-nov-waiting');
            const wt = doc.createElement('div');
            wt.className = 'ag-sag-nov-promo-title';
            wt.textContent = sagStrings.novHeaderTitle;
            const wd = doc.createElement('div');
            wd.className = 'ag-sag-nov-promo-desc';
            wd.textContent = sagStrings.novBridgeWaiting;
            waitCard.appendChild(wt);
            waitCard.appendChild(wd);
            if (typeof novSynergy?.refresh === 'function') {
              waitCard.appendChild(
                mkChip({
                  label: sagStrings.novRefreshBtn,
                  active: false,
                  attr: 'data-ag-nov-refresh',
                  val: '1',
                  onClick: () => {
                    void novSynergy.refresh();
                  },
                })
              );
            }
            novPane.appendChild(waitCard);
          } else {
            // Not installed / bridge offline -> Graceful Companion Recommendation Card
            const promo = doc.createElement('div');
            promo.className = 'ag-sag-nov-promo';
            promo.setAttribute('data-testid', 'ag-sag-nov-promo');

            const pt = doc.createElement('div');
            pt.className = 'ag-sag-nov-promo-title';
            pt.textContent = sagStrings.novPromoTitle;
            const pd = doc.createElement('div');
            pd.className = 'ag-sag-nov-promo-desc';
            pd.textContent = sagStrings.novPromoDesc;

            const featRow = doc.createElement('div');
            featRow.className = 'ag-sag-ext-grid';
            for (const lbl of [
              sagStrings.novPromoBadge1,
              sagStrings.novPromoBadge2,
              sagStrings.novPromoBadge3,
              sagStrings.novPromoBadge4,
            ]) {
              const tag = doc.createElement('span');
              tag.className = 'ag-sag-meta-pill';
              tag.textContent = lbl;
              featRow.appendChild(tag);
            }

            const cmdRow = doc.createElement('div');
            cmdRow.className = 'ag-sag-nov-cmd-row';
            const cmdCode = doc.createElement('code');
            cmdCode.className = 'ag-sag-nov-cmd-code';
            cmdCode.setAttribute('data-testid', 'ag-sag-nov-install-cmd');
            cmdCode.textContent = installCmd;

            const copyBtn = doc.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'ag-sag-synergy-act';
            copyBtn.setAttribute('data-ag-nov-copy-install', '1');
            copyBtn.textContent = copiedInstallFeedback ? sagStrings.novPromoCopiedBtn : sagStrings.novPromoCopyBtn;
            copyBtn.addEventListener('click', (ev) => {
              ev?.preventDefault?.();
              ev?.stopPropagation?.();
              try {
                if (typeof options.onCopyText === 'function') {
                  options.onCopyText(installCmd);
                } else if (win?.navigator?.clipboard?.writeText) {
                  void win.navigator.clipboard.writeText(installCmd).catch(() => {});
                }
              } catch {}
              copiedInstallFeedback = true;
              renderIntoSettings();
              if (copyResetTimer) clearTimeout(copyResetTimer);
              copyResetTimer = setTimeout(() => {
                copyResetTimer = null;
                if (destroyed) return;
                copiedInstallFeedback = false;
                renderIntoSettings();
              }, 1800);
              copyResetTimer?.unref?.();
            });
            cmdRow.appendChild(cmdCode);
            cmdRow.appendChild(copyBtn);

            promo.appendChild(pt);
            promo.appendChild(pd);
            promo.appendChild(featRow);
            promo.appendChild(cmdRow);
            novPane.appendChild(promo);
          }

          foldBody.appendChild(novPane);
        }

        suite.appendChild(foldBody);
        section.appendChild(suite);
      }
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

    function readHostLangSignature() {
      const html = doc?.documentElement;
      if (!html) return '';
      return [
        html.getAttribute?.('data-ag-cs-lang') || '',
        html.getAttribute?.('data-ag-sag-lang') || '',
        html.getAttribute?.('lang') || '',
      ].join('|');
    }

    function checkHostContextChange() {
      if (destroyed || !doc?.documentElement) return;
      const curLang = readHostLangSignature();
      const curTheme =
        doc.documentElement.getAttribute?.('data-ag-sag-theme') ||
        doc.documentElement.getAttribute?.('data-ag-cs-theme') ||
        '';
      if (curLang !== lastLang || curTheme !== lastTheme) {
        lastLang = curLang;
        lastTheme = curTheme;
        if (typeof options.onHostContextChange === 'function') {
          try { options.onHostContextChange({ lang: curLang, theme: curTheme }); } catch {}
        }
        // Re-sync signature in case onHostContextChange updated data-ag-sag-lang / theme
        lastLang = readHostLangSignature();
        renderIntoSettings();
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
            attributeFilter: ['data-ag-sag-lang', 'data-ag-sag-theme', 'data-ag-cs-lang', 'data-ag-cs-theme', 'data-ag-cs-style', 'lang'],
          });
        }
      } catch {}
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      if (copyResetTimer) {
        try { clearTimeout(copyResetTimer); } catch {}
        copyResetTimer = null;
      }
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

    lastLang = readHostLangSignature();
    lastTheme =
      doc?.documentElement?.getAttribute?.('data-ag-sag-theme') ||
      doc?.documentElement?.getAttribute?.('data-ag-cs-theme') ||
      '';
    renderIntoSettings();
    if (options.autoObserve !== false) startObservers();

    return {
      sync,
      getActiveSubTab: () => activeSubTab,
      setActiveSubTab: (tabId) => {
        if (!SUBTAB_IDS.includes(tabId)) return false;
        activeSubTab = tabId;
        writeUiState(SUBTAB_STORAGE_KEY, tabId);
        renderIntoSettings();
        return true;
      },
      isExpanded: () => panelExpanded,
      setExpanded: (expanded) => {
        panelExpanded = Boolean(expanded);
        writeUiState(EXPANDED_STORAGE_KEY, panelExpanded ? '1' : '0');
        renderIntoSettings();
        return panelExpanded;
      },
      detectEnvironment: () => detectPrismEnvironment(doc, win),
      getDebugState: () => ({
        destroyed,
        embedded: Boolean(mountedEl && mountedEl.isConnected !== false),
        mountedMode: mountedEl && mountedEl.isConnected !== false ? mountedMode : 'none',
        activeSubTab,
        panelExpanded,
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
