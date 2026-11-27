// agy-Sag — Universal Control Center Hub & Settings Drawer (Native Settings + Prism Modules + Global Drawer, UMD)
// Single-Source-of-Truth IA:
//   - 6 mutually exclusive tabs: overview | ui | conversation | guard | nov | advanced
//   - Module master switches live strictly in "overview" (zero duplicate switches)
//   - Parameters live strictly in their layer tab; advanced controls fold inside <details>
//   - Same renderHub() powers native Settings, Prism embed, and Ctrl/Cmd+Alt+, Drawer
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
  const DRAWER_BACKDROP_TESTID = 'ag-sag-drawer-backdrop';
  const DRAWER_TESTID = 'ag-sag-settings-drawer';
  const THRESHOLD_PRESETS = ['off', 75, 80, 85, 90];
  const STALL_PRESETS = ['off', 60, 180, 300, 600];
  const SUBTAB_IDS = ['overview', 'ui', 'conversation', 'guard', 'nov', 'advanced'];
  const LEGACY_TAB_MAP = {
    all: 'overview',
    flow: 'conversation',
    auto: 'guard',
  };
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
    'Внешний вид',
    'Aparência',
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
    if (!panel) {
      for (const h2 of headings) {
        const dlg = h2.closest?.('[role="dialog"]');
        const aria = String(dlg?.getAttribute?.('aria-label') || '');
        if (/settings|设置|設定|설정|ajustes|paramètres|einstellungen|настройки|configurações/i.test(aria)) {
          const candidate = h2.closest?.('div.p-6') || h2.parentElement?.parentElement || null;
          if (candidate && candidate.id !== PRISM_SETTINGS_SEC_ID) {
            panel = candidate;
            break;
          }
        }
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

  function normalizeSubTab(rawTab) {
    const t = String(rawTab || '').trim();
    if (SUBTAB_IDS.includes(t)) return t;
    if (Object.prototype.hasOwnProperty.call(LEGACY_TAB_MAP, t)) return LEGACY_TAB_MAP[t];
    return 'overview';
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
    let drawerBackdropEl = null;
    let drawerEl = null;
    let drawerBodyEl = null;
    let drawerOpen = false;
    let createdStyleEl = null;
    let domObserver = null;
    let htmlObserver = null;
    let keydownCleanup = null;
    let lastLang = '';
    let lastTheme = '';
    let copiedInstallFeedback = false;
    let copyResetTimer = null;
    let novAutoRefreshInFlight = false;
    let novAutoRefreshAttempted = false;

    const savedRawTab = String(readUiState(SUBTAB_STORAGE_KEY, 'overview') || '').trim();
    let activeSubTab = normalizeSubTab(savedRawTab);
    if (savedRawTab && savedRawTab !== activeSubTab && Object.prototype.hasOwnProperty.call(LEGACY_TAB_MAP, savedRawTab)) {
      writeUiState(SUBTAB_STORAGE_KEY, activeSubTab);
    }

    const savedExpanded = readUiState(EXPANDED_STORAGE_KEY, '1');
    let panelExpanded = savedExpanded !== '0';

    // Ephemeral UI draft states (preserved across re-renders)
    let searchQuery = '';
    let customPackEditorOpen = false;
    let customPackDraftText = '';
    let customPackStatusText = '';
    let customPackStatusTone = 'info';
    let customCssDraftText = null;
    let customCssStatusText = '';
    let customPatternsDraftText = null;
    let customPatternsStatusText = '';
    let cfgImportDraftText = '';
    let cfgStatusText = '';
    let cfgStatusTone = 'info';
    let resetConfirmPending = false;
    let diagCopiedFeedback = false;

    function downloadJsonPayload(filename, dataObj) {
      const jsonText = JSON.stringify(dataObj, null, 2);
      try {
        win?.navigator?.clipboard?.writeText?.(jsonText)?.catch?.(() => {});
      } catch {}
      if (typeof options.onCopyText === 'function') {
        try { options.onCopyText(jsonText); } catch {}
      }
      const BlobCtor = win?.Blob || (typeof Blob !== 'undefined' ? Blob : null);
      const UrlApi = win?.URL || (typeof URL !== 'undefined' ? URL : null);
      if (BlobCtor && UrlApi && typeof UrlApi.createObjectURL === 'function' && doc?.createElement) {
        let objectUrl = '';
        let a = null;
        try {
          const blob = new BlobCtor([jsonText], { type: 'application/json;charset=utf-8' });
          objectUrl = UrlApi.createObjectURL(blob);
          a = coexist.markOwnedNoTranslate(doc.createElement('a'));
          a.href = objectUrl;
          a.download = filename;
          a.setAttribute?.('download', filename);
          if (a.style) a.style.display = 'none';
          (doc.body || doc.documentElement)?.appendChild?.(a);
          a.click?.();
          const t = setTimeout(() => {
            try { UrlApi.revokeObjectURL?.(objectUrl); } catch {}
          }, 1000);
          t?.unref?.();
        } catch {
          if (objectUrl) {
            try { UrlApi.revokeObjectURL?.(objectUrl); } catch {}
          }
        } finally {
          try { a?.remove?.(); } catch {}
        }
      }
      return jsonText;
    }

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

    function createHexBadgeSvg(letter, size = 15, testId = '') {
      const mkSvg = (tag) =>
        typeof doc.createElementNS === 'function' ? doc.createElementNS('http://www.w3.org/2000/svg', tag) : doc.createElement(tag);
      const svg = mkSvg('svg');
      svg.setAttribute('class', 'ag-sag-hex-icon');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', String(size));
      svg.setAttribute('height', String(size));
      svg.setAttribute('aria-hidden', 'true');
      if (testId) svg.setAttribute('data-testid', testId);

      const gradId = `ag-sag-hex-grad-${letter}`;
      const defs = mkSvg('defs');
      const lg = mkSvg('linearGradient');
      lg.setAttribute('id', gradId);
      lg.setAttribute('x1', '0%');
      lg.setAttribute('y1', '0%');
      lg.setAttribute('x2', '100%');
      lg.setAttribute('y2', '100%');
      for (const [offset, color] of [
        ['0%', '#38bdf8'],
        ['50%', '#818cf8'],
        ['100%', '#34d399'],
      ]) {
        const st = mkSvg('stop');
        st.setAttribute('offset', offset);
        st.setAttribute('stop-color', color);
        lg.appendChild(st);
      }
      defs.appendChild(lg);
      svg.appendChild(defs);

      const poly = mkSvg('polygon');
      poly.setAttribute('points', '12,2 21,7 21,17 12,22 3,17 3,7');
      poly.setAttribute('fill', `url(#${gradId})`);
      svg.appendChild(poly);

      const txt = mkSvg('text');
      txt.setAttribute('x', '12');
      txt.setAttribute('y', '16');
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('fill', '#ffffff');
      txt.setAttribute('font-size', '12');
      txt.setAttribute('font-weight', '800');
      txt.setAttribute('font-family', 'Inter,system-ui,sans-serif');
      txt.textContent = letter;
      svg.appendChild(txt);
      return svg;
    }

    function refreshAllViews() {
      if (destroyed) return;
      renderIntoSettings();
      if (drawerOpen && drawerBodyEl) {
        renderHub(drawerBodyEl, { inPrism: false, inDrawer: true });
      }
    }

    function buildCtx(inPrism, inDrawer) {
      const cfg = getConfig();
      const strings = S();
      const sagStrings = typeof i18n.getSagStrings === 'function' ? i18n.getSagStrings(getLang()) : {};
      const lang = getLang();
      const isZh = lang === 'zh-CN' || lang === 'zh-TW' || lang === 'yue';
      const novState = novSynergy?.getState ? novSynergy.getState() : null;
      const novConnected = Boolean(novState?.installed && novState?.bridgeConnected);
      const t = (key, fallback = '') => sagStrings?.[key] ?? strings?.[key] ?? fallback;

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

      const mkChip = ({ label, active, attr, val, risk, title, testId, disabled, onClick }) => {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'ag-sag-chip';
        b.textContent = label;
        if (title) b.title = title;
        if (testId) b.setAttribute('data-testid', testId);
        b.setAttribute('aria-pressed', String(Boolean(active)));
        if (attr && val !== undefined) b.setAttribute(attr, String(val));
        if (risk) b.setAttribute('data-risk', risk);
        if (disabled) b.disabled = true;
        b.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          onClick();
        });
        return b;
      };

      const mkSwitch = ({ checked, attr, val, risk, title, testId, onClick }) => {
        const sw = doc.createElement('button');
        sw.type = 'button';
        sw.className = 'ag-sag-switch';
        sw.setAttribute('role', 'switch');
        sw.setAttribute('aria-checked', String(Boolean(checked)));
        if (title) {
          sw.title = title;
          sw.setAttribute('aria-label', title);
        }
        if (testId) sw.setAttribute('data-testid', testId);
        if (attr && val !== undefined) sw.setAttribute(attr, String(val));
        if (risk) sw.setAttribute('data-risk', risk);
        sw.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          onClick();
        });
        return sw;
      };

      const mkSuiteRow = (labelText, descText, rightEl, opts = {}) => {
        const r = doc.createElement('div');
        r.className = opts.stacked ? 'ag-sag-suite-row ag-sag-suite-row-stack' : 'ag-sag-suite-row';
        const searchTerms = [labelText, descText, opts.searchExtra || ''].filter(Boolean).join(' ').toLowerCase();
        r.setAttribute('data-ag-sag-search', searchTerms);
        if (opts.testId) r.setAttribute('data-testid', opts.testId);
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

      return {
        cfg,
        strings,
        sagStrings,
        lang,
        isZh,
        inPrism,
        inDrawer,
        novState,
        novConnected,
        t,
        enabledModuleCount,
        totalModuleCount,
        activeSagPreset: detectActiveSagPreset(),
        mkChip,
        mkSwitch,
        mkSuiteRow,
      };
    }

    function renderHeader(suite, ctx, onFocusAfterToggle) {
      const { cfg, t, enabledModuleCount, totalModuleCount, novConnected, inDrawer } = ctx;
      const foldHead = doc.createElement('div');
      foldHead.className = 'ag-sag-fold-head';
      foldHead.setAttribute('data-testid', 'ag-sag-fold-head');
      foldHead.setAttribute('role', 'button');
      foldHead.setAttribute('tabindex', '0');
      const expandedNow = inDrawer ? true : panelExpanded;
      foldHead.setAttribute('aria-expanded', String(expandedNow));
      foldHead.title = expandedNow ? t('foldCollapse', 'Collapse') : t('foldExpand', 'Expand');

      const foldLeft = doc.createElement('div');
      foldLeft.className = 'ag-sag-fold-left';

      const brandBadge = doc.createElement('span');
      brandBadge.className = 'ag-sag-brand-badge';
      brandBadge.appendChild(createHexBadgeSvg('S', 15, 'ag-sag-hex-logo'));
      const brandTxt = doc.createElement('span');
      brandTxt.textContent = t('foldBrand', 'agy-Sag');
      brandBadge.appendChild(brandTxt);
      foldLeft.appendChild(brandBadge);

      const countPill = doc.createElement('span');
      countPill.className = 'ag-sag-meta-pill';
      countPill.setAttribute('data-testid', 'ag-sag-mod-count');
      countPill.textContent = i18n.formatTemplate(t('foldOnCount', '{on}/{total} ON'), {
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
        dualPill.appendChild(createHexBadgeSvg('N', 13, 'ag-sag-nov-mini-hex'));
        const dLbl = doc.createElement('span');
        dLbl.textContent = 'agy-NOV';
        dualPill.appendChild(dLbl);
        dualPill.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          panelExpanded = true;
          activeSubTab = 'nov';
          searchQuery = '';
          writeUiState(EXPANDED_STORAGE_KEY, '1');
          writeUiState(SUBTAB_STORAGE_KEY, 'nov');
          refreshAllViews();
        });
        foldRight.appendChild(dualPill);
      }

      if (!inDrawer) {
        const chev = doc.createElement('span');
        chev.className = 'ag-sag-fold-chevron';
        chev.setAttribute('aria-hidden', 'true');
        chev.textContent = panelExpanded ? '▾' : '▸';
        foldRight.appendChild(chev);

        const toggleFold = () => {
          panelExpanded = !panelExpanded;
          writeUiState(EXPANDED_STORAGE_KEY, panelExpanded ? '1' : '0');
          refreshAllViews();
        };
        foldHead.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          toggleFold();
        });
        foldHead.addEventListener('keydown', (ev) => {
          if (ev?.key === 'Enter' || ev?.key === ' ') {
            ev?.preventDefault?.();
            ev?.stopPropagation?.();
            toggleFold();
            onFocusAfterToggle?.();
          }
        });
      }

      foldHead.appendChild(foldLeft);
      foldHead.appendChild(foldRight);
      suite.appendChild(foldHead);
    }

    function renderPresetRow(foldBody, ctx) {
      if (typeof options.onApplyPreset !== 'function') return;
      const { t, activeSagPreset, mkChip } = ctx;
      const topDeck = doc.createElement('div');
      topDeck.className = 'ag-sag-topdeck';
      topDeck.setAttribute('data-testid', 'ag-sag-topdeck');
      const tdLeft = doc.createElement('div');
      tdLeft.className = 'ag-sag-suite-label';
      const tdTitle = doc.createElement('strong');
      tdTitle.textContent = t('presetLabel', 'Presets');
      const tdDesc = doc.createElement('span');
      tdDesc.textContent = t('presetDesc', '');
      tdLeft.appendChild(tdTitle);
      tdLeft.appendChild(tdDesc);

      const pGrid = doc.createElement('div');
      pGrid.className = 'ag-sag-ext-grid';
      for (const [pId, pLbl] of [
        ['essential', t('presetEssential', 'Essential')],
        ['i18n-only', t('presetI18nOnly', 'i18n Only')],
        ['power', t('presetPower', 'Power')],
        ['full-auto', t('presetFullAuto', 'Full Auto')],
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
      if (!activeSagPreset) {
        const customTag = doc.createElement('span');
        customTag.className = 'ag-sag-meta-pill';
        customTag.setAttribute('data-testid', 'ag-sag-preset-custom');
        customTag.textContent = t('presetCustomTag', 'Custom');
        pGrid.appendChild(customTag);
      }
      topDeck.appendChild(tdLeft);
      topDeck.appendChild(pGrid);
      foldBody.appendChild(topDeck);
    }

    function renderTabBar(foldBody, ctx, rootHost) {
      const { cfg, t, novConnected } = ctx;
      const subtabs = doc.createElement('div');
      subtabs.className = 'ag-sag-subtabs';
      subtabs.setAttribute('data-testid', 'ag-sag-subtabs');
      subtabs.setAttribute('role', 'tablist');

      const uiHasOn = Boolean(cfg.modules?.hostI18n || cfg.modules?.themeStudio);
      const convHasOn = Boolean(
        cfg.modules?.compactGuard ||
          cfg.modules?.precompactExport ||
          cfg.modules?.draftGuard ||
          cfg.modules?.promptQueue ||
          cfg.modules?.outlineBookmarks
      );
      const guardHasOn = Boolean(
        cfg.modules?.sessionWatchdog ||
          cfg.modules?.sessionRadar ||
          cfg.modules?.safeAutoAccept ||
          cfg.modules?.quotaPulse
      );

      const tabSpecs = [
        ['overview', t('tabOverview', 'Overview'), false],
        ['ui', t('tabUi', 'UI'), uiHasOn],
        ['conversation', t('tabConversation', 'Chat'), convHasOn],
        ['guard', t('tabGuard', 'Guard'), guardHasOn],
        ['nov', t('tabNov', 'agy-NOV'), novConnected],
        ['advanced', t('tabAdvanced', 'Advanced'), false],
      ];

      for (const [tabId, tabLabel, hasDot] of tabSpecs) {
        const tb = doc.createElement('button');
        tb.type = 'button';
        tb.className = 'ag-sag-subtab';
        tb.setAttribute('role', 'tab');
        tb.setAttribute('data-ag-sag-subtab', tabId);
        tb.setAttribute('aria-pressed', String(activeSubTab === tabId));
        tb.setAttribute('aria-selected', String(activeSubTab === tabId));
        if (hasDot) {
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
          const wasFocused = doc.activeElement === tb;
          activeSubTab = tabId;
          searchQuery = '';
          if (tabId === 'nov') novAutoRefreshAttempted = false;
          writeUiState(SUBTAB_STORAGE_KEY, tabId);
          refreshAllViews();
          if (wasFocused) {
            rootHost?.querySelector?.(`[data-ag-sag-subtab="${tabId}"]`)?.focus?.();
          }
        });
        subtabs.appendChild(tb);
      }
      foldBody.appendChild(subtabs);
    }

    function renderOverview(pane, ctx) {
      const { cfg, t, mkSwitch } = ctx;
      const groups = coexist?.MODULE_GROUPS || [
        { id: 'ui', layer: 'L1', settingsTab: 'ui' },
        { id: 'conversation', layer: 'L2', settingsTab: 'conversation' },
        { id: 'guard', layer: 'L3', settingsTab: 'guard' },
      ];
      const metaMap = coexist?.MODULE_META || {};
      const allMeta = Object.values(metaMap);

      const groupTitleMap = {
        ui: t('groupUi', 'UI Layer'),
        conversation: t('groupConversation', 'Conversation Layer'),
        guard: t('groupGuard', 'Guard Layer'),
      };

      for (const grp of groups) {
        const grpBox = doc.createElement('div');
        grpBox.className = 'ag-sag-overview-group';
        grpBox.setAttribute('data-ag-sag-group', grp.id);

        const gHead = doc.createElement('div');
        gHead.className = 'ag-sag-group-title';
        gHead.textContent = groupTitleMap[grp.id] || grp.id;
        grpBox.appendChild(gHead);

        const grid = doc.createElement('div');
        grid.className = 'ag-sag-mod-grid';

        const topMods = allMeta.filter((m) => m.group === grp.id && !m.parentId);
        for (const m of topMods) {
          const isOn = Boolean(cfg.modules?.[m.id]);
          const card = doc.createElement('div');
          card.className = 'ag-sag-mod-card';
          card.setAttribute('data-ag-sag-mod-card', m.id);
          card.setAttribute('data-active', isOn ? '1' : '0');

          const mTitle = t(m.labelKey, m.id);
          const mDesc = t(m.descKey, '');
          const subMods = allMeta.filter((sub) => sub.parentId === m.id);
          const subSearch = subMods
            .map((sub) => `${t(sub.labelKey, sub.id)} ${t(sub.descKey, '')} ${sub.id}`)
            .join(' ');
          card.setAttribute('data-ag-sag-search', `${mTitle} ${mDesc} ${m.id} ${subSearch}`.trim().toLowerCase());

          const head = doc.createElement('div');
          head.className = 'ag-sag-mod-card-head';
          const titleEl = doc.createElement('span');
          titleEl.className = 'ag-sag-mod-card-title';
          titleEl.textContent = mTitle;
          head.appendChild(titleEl);
          head.appendChild(
            mkSwitch({
              checked: isOn,
              attr: 'data-ag-sag-mod',
              val: m.id,
              risk: m.aggressive ? 'high' : '',
              title: mTitle,
              onClick: () => updateConfig({ modules: { ...cfg.modules, [m.id]: !isOn } }),
            })
          );
          card.appendChild(head);

          const descEl = doc.createElement('div');
          descEl.className = 'ag-sag-mod-card-desc';
          descEl.textContent = mDesc;
          card.appendChild(descEl);

          // Child module switch (e.g., precompactExport inside compactGuard)
          for (const sub of subMods) {
            const subOn = Boolean(cfg.modules?.[sub.id]);
            const subRow = doc.createElement('div');
            subRow.className = 'ag-sag-mod-sub';
            const subLbl = doc.createElement('span');
            subLbl.textContent = t(sub.labelKey, sub.id);
            subRow.appendChild(subLbl);
            subRow.appendChild(
              mkSwitch({
                checked: subOn,
                attr: 'data-ag-sag-mod',
                val: sub.id,
                title: t(sub.labelKey, sub.id),
                onClick: () => updateConfig({ modules: { ...cfg.modules, [sub.id]: !subOn } }),
              })
            );
            card.appendChild(subRow);
          }

          const foot = doc.createElement('div');
          foot.className = 'ag-sag-mod-card-foot';
          const goBtn = doc.createElement('button');
          goBtn.type = 'button';
          goBtn.className = 'ag-sag-link-btn';
          goBtn.setAttribute('data-ag-sag-goto', m.settingsTab);
          goBtn.textContent = t('goToSettings', 'Settings →');
          goBtn.addEventListener('click', (ev) => {
            ev?.preventDefault?.();
            ev?.stopPropagation?.();
            activeSubTab = m.settingsTab;
            searchQuery = '';
            writeUiState(SUBTAB_STORAGE_KEY, m.settingsTab);
            refreshAllViews();
          });
          foot.appendChild(goBtn);
          card.appendChild(foot);

          grid.appendChild(card);
        }

        grpBox.appendChild(grid);
        pane.appendChild(grpBox);
      }
    }

    function renderUiTab(pane, ctx) {
      const { cfg, t, mkChip, mkSwitch, mkSuiteRow } = ctx;

      // 1. Native UI Language selector + conflict arbitration (NO module master switch)
      const langCtrl = doc.createElement('div');
      langCtrl.className = 'ag-sag-ext-grid';
      const sel = doc.createElement('select');
      sel.className = 'ag-sag-select';
      sel.setAttribute('data-testid', 'ag-sag-host-locale-select');
      const localeOpts = [
        ['auto', t('hostI18nAuto', 'Auto Detect')],
        ['en', t('hostI18nOrig', 'English')],
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
          label: cfg.hostI18nConflictPolicy === 'takeover' ? t('conflictTakeover', 'Takeover') : t('conflictYield', 'Auto Yield'),
          active: cfg.hostI18nConflictPolicy === 'takeover',
          attr: 'data-ag-sag-i18n-policy',
          val: cfg.hostI18nConflictPolicy || 'yield',
          onClick: () =>
            updateConfig({
              hostI18nConflictPolicy: cfg.hostI18nConflictPolicy === 'takeover' ? 'yield' : 'takeover',
            }),
        })
      );
      pane.appendChild(mkSuiteRow(t('hostI18nLabel', 'Native UI Translation'), t('hostI18nDesc', ''), langCtrl, { searchExtra: 'hostI18n locale language' }));

      // 2. Optical Theme Studio: skins + CJK font + density
      const thGrid = doc.createElement('div');
      thGrid.className = 'ag-sag-ext-grid';
      for (const [tid, tLbl] of [
        ['native', t('themeNative', 'Native')],
        ['midnight-ink', t('themeMidnight', 'Midnight')],
        ['nord-frost', t('themeNord', 'Nord')],
        ['warm-paper', t('themeWarmPaper', 'Warm Paper')],
        ['oled-pure', t('themeOled', 'OLED')],
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
          label: t('themeCjk', 'CJK Fonts'),
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
        ['compact', t('densityCompact', 'Compact')],
        ['balanced', t('densityBalanced', 'Balanced')],
        ['comfortable', t('densityComfortable', 'Comfortable')],
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
      pane.appendChild(mkSuiteRow(t('themeLabel', 'Theme & Typography'), t('themeDesc', ''), thGrid, { searchExtra: 'theme preset density cjk' }));

      // 3. Advanced Appearance (<details>): compactSidebar, wideReadable, themeConflictPolicy, customCss
      const advThemeDetails = doc.createElement('details');
      advThemeDetails.className = 'ag-sag-details';
      advThemeDetails.setAttribute('data-testid', 'ag-sag-adv-appearance');
      const advThemeSum = doc.createElement('summary');
      advThemeSum.textContent = t('themeAdvSummary', 'Advanced Appearance');
      advThemeDetails.appendChild(advThemeSum);

      const advThemeBody = doc.createElement('div');
      advThemeBody.className = 'ag-sag-details-body';

      advThemeBody.appendChild(
        mkSuiteRow(
          t('themeCompactSidebarLabel', 'Compact Sidebar'),
          t('themeCompactSidebarDesc', ''),
          mkSwitch({
            checked: Boolean(cfg.themeCompactSidebar),
            attr: 'data-ag-sag-theme-compact-sidebar',
            val: '1',
            title: t('themeCompactSidebarLabel', 'Compact Sidebar'),
            onClick: () =>
              updateConfig({
                themeCompactSidebar: !cfg.themeCompactSidebar,
                modules: { ...cfg.modules, themeStudio: true },
              }),
          }),
          { searchExtra: 'themeCompactSidebar' }
        )
      );

      advThemeBody.appendChild(
        mkSuiteRow(
          t('themeWideReadableLabel', 'Wide Readable Layout'),
          t('themeWideReadableDesc', ''),
          mkSwitch({
            checked: Boolean(cfg.themeWideReadable),
            attr: 'data-ag-sag-theme-wide',
            val: '1',
            title: t('themeWideReadableLabel', 'Wide Readable Layout'),
            onClick: () =>
              updateConfig({
                themeWideReadable: !cfg.themeWideReadable,
                modules: { ...cfg.modules, themeStudio: true },
              }),
          }),
          { searchExtra: 'themeWideReadable' }
        )
      );

      const cssWrap = doc.createElement('div');
      cssWrap.className = 'ag-sag-pack-ctrl';
      const cssTa = doc.createElement('textarea');
      cssTa.className = 'ag-sag-pack-textarea';
      cssTa.setAttribute('data-testid', 'ag-sag-theme-css-textarea');
      cssTa.setAttribute('spellcheck', 'false');
      cssTa.placeholder = t('themeCustomCssPlaceholder', '');
      cssTa.value = customCssDraftText !== null ? customCssDraftText : cfg.themeCustomCss || '';
      cssTa.addEventListener('input', () => {
        customCssDraftText = cssTa.value;
      });
      const cssBtns = doc.createElement('div');
      cssBtns.className = 'ag-sag-ext-grid';
      cssBtns.appendChild(
        mkChip({
          label: t('themeCustomCssApply', 'Apply CSS'),
          active: true,
          testId: 'ag-sag-theme-css-apply',
          onClick: () => {
            const val = cssTa.value;
            customCssDraftText = val;
            customCssStatusText = t('themeCustomCssApplied', 'Applied');
            updateConfig({
              themeCustomCss: val,
              modules: { ...cfg.modules, themeStudio: true },
            });
          },
        })
      );
      cssBtns.appendChild(
        mkChip({
          label: t('themeCustomCssClear', 'Clear CSS'),
          active: false,
          testId: 'ag-sag-theme-css-clear',
          onClick: () => {
            customCssDraftText = '';
            cssTa.value = '';
            customCssStatusText = '';
            updateConfig({ themeCustomCss: '' });
          },
        })
      );
      if (customCssStatusText) {
        const cssNote = doc.createElement('span');
        cssNote.className = 'ag-sag-badge-note';
        cssNote.textContent = customCssStatusText;
        cssBtns.appendChild(cssNote);
      }
      cssWrap.appendChild(cssTa);
      cssWrap.appendChild(cssBtns);
      advThemeBody.appendChild(mkSuiteRow(t('themeCustomCssLabel', 'Custom CSS'), '', cssWrap, { stacked: true, searchExtra: 'themeCustomCss' }));

      advThemeDetails.appendChild(advThemeBody);
      pane.appendChild(advThemeDetails);

      // 4. Custom Language Pack Tools (<details>)
      const packDetails = doc.createElement('details');
      packDetails.className = 'ag-sag-details';
      packDetails.setAttribute('data-testid', 'ag-sag-adv-custom-pack');
      if (customPackEditorOpen || cfg.hostI18nCollectMissing || customPackStatusText) {
        packDetails.open = true;
      }
      const packSum = doc.createElement('summary');
      packSum.textContent = t('customPackAdvSummary', 'Custom Packs & Missing Phrases');
      packDetails.appendChild(packSum);

      const packCtrl = doc.createElement('div');
      packCtrl.className = 'ag-sag-pack-ctrl';
      const packBtnRow = doc.createElement('div');
      packBtnRow.className = 'ag-sag-ext-grid';

      const fileInput = coexist.markOwnedNoTranslate(doc.createElement('input'));
      fileInput.type = 'file';
      fileInput.accept = 'application/json,.json';
      fileInput.hidden = true;
      fileInput.setAttribute('data-testid', 'ag-sag-pack-file-input');

      const editorWrap = doc.createElement('div');
      editorWrap.className = 'ag-sag-pack-editor';
      editorWrap.setAttribute('data-testid', 'ag-sag-pack-editor-wrap');
      editorWrap.hidden = !customPackEditorOpen;

      const textarea = doc.createElement('textarea');
      textarea.className = 'ag-sag-pack-textarea';
      textarea.setAttribute('data-testid', 'ag-sag-pack-textarea');
      textarea.setAttribute('spellcheck', 'false');
      textarea.placeholder = t('customPackPlaceholder', '');
      textarea.value = customPackDraftText;
      textarea.addEventListener('input', () => {
        customPackDraftText = textarea.value;
      });

      const statusEl = doc.createElement('div');
      statusEl.className = 'ag-sag-pack-status';
      statusEl.setAttribute('data-testid', 'ag-sag-pack-status');
      if (customPackStatusText) {
        statusEl.textContent = customPackStatusText;
        statusEl.setAttribute('data-tone', customPackStatusTone || 'info');
      } else {
        statusEl.hidden = true;
      }

      const setPackStatus = (msg, tone = 'info') => {
        customPackStatusText = String(msg || '');
        customPackStatusTone = tone;
        const targets = new Set([
          statusEl,
          mountedEl?.querySelector?.('[data-testid="ag-sag-pack-status"]'),
          drawerBodyEl?.querySelector?.('[data-testid="ag-sag-pack-status"]'),
          doc.querySelector?.('[data-testid="ag-sag-pack-status"]'),
        ]);
        for (const target of targets) {
          if (!target) continue;
          target.textContent = customPackStatusText;
          target.setAttribute('data-tone', tone);
          target.hidden = !customPackStatusText;
        }
      };

      const importBtn = mkChip({
        label: t('customPackImportBtn', 'Import JSON'),
        active: false,
        testId: 'ag-sag-pack-import-btn',
        onClick: () => fileInput.click?.(),
      });

      const toggleEditorBtn = mkChip({
        label: customPackEditorOpen ? t('customPackHideBtn', 'Hide Editor') : t('customPackEditBtn', 'Edit JSON'),
        active: customPackEditorOpen,
        testId: 'ag-sag-pack-toggle-btn',
        onClick: () => {
          customPackEditorOpen = !customPackEditorOpen;
          packDetails.open = true;
          editorWrap.hidden = !customPackEditorOpen;
          toggleEditorBtn.textContent = customPackEditorOpen ? t('customPackHideBtn', 'Hide') : t('customPackEditBtn', 'Edit');
          toggleEditorBtn.setAttribute('aria-pressed', String(customPackEditorOpen));
        },
      });

      fileInput.addEventListener('change', async () => {
        const f = fileInput.files?.[0];
        if (!f) return;
        try {
          let text = '';
          if (typeof f.text === 'function') {
            text = await f.text();
          } else if (typeof win?.FileReader === 'function') {
            text = await new Promise((resolve, reject) => {
              const reader = new win.FileReader();
              reader.onload = () => resolve(String(reader.result || ''));
              reader.onerror = () => reject(new Error('File read error'));
              reader.readAsText(f);
            });
          }
          customPackDraftText = text;
          textarea.value = text;
          customPackEditorOpen = true;
          packDetails.open = true;
          editorWrap.hidden = false;
          toggleEditorBtn.textContent = t('customPackHideBtn', 'Hide');
          toggleEditorBtn.setAttribute('aria-pressed', 'true');
        } catch (err) {
          setPackStatus(err?.message || 'File read failed', 'error');
        } finally {
          try { fileInput.value = ''; } catch {}
        }
      });

      const exportBtn = mkChip({
        label: t('customPackExportBtn', 'Export Custom Pack'),
        active: false,
        testId: 'ag-sag-pack-export-btn',
        onClick: () => {
          const all = typeof options.onExportCustomPacks === 'function' ? options.onExportCustomPacks() : {};
          const keys = Object.keys(all || {});
          if (keys.length === 0) {
            setPackStatus(t('customPackEmpty', 'Empty'), 'error');
            return;
          }
          const targetLoc = cfg.hostI18nLocale && all[cfg.hostI18nLocale] ? cfg.hostI18nLocale : keys[0];
          const payload = all[targetLoc] || all;
          downloadJsonPayload(`agy-sag-pack-${targetLoc}.json`, payload);
          setPackStatus(i18n.formatTemplate(t('customPackExported', 'Exported {locale}'), { locale: targetLoc }), 'ok');
        },
      });

      const collectMissingBtn = mkChip({
        label: t('customPackCollectBtn', 'Collect Missing'),
        active: Boolean(cfg.hostI18nCollectMissing),
        attr: 'data-ag-sag-collect-missing',
        val: cfg.hostI18nCollectMissing ? '1' : '0',
        onClick: () => updateConfig({ hostI18nCollectMissing: !cfg.hostI18nCollectMissing }),
      });

      const exportMissingBtn = mkChip({
        label: t('customPackMissingBtn', 'Export Missing'),
        active: false,
        testId: 'ag-sag-pack-missing-btn',
        title: cfg.hostI18nCollectMissing ? undefined : t('customPackMissingTip', ''),
        disabled: !cfg.hostI18nCollectMissing,
        onClick: () => {
          if (!cfg.hostI18nCollectMissing) return;
          const tpl = typeof options.onExportMissingTemplate === 'function' ? options.onExportMissingTemplate() : null;
          const out = tpl || { meta: { locale: cfg.hostI18nLocale || 'zh-CN', schemaVersion: 2, count: 0 }, exact: {}, patterns: [] };
          const loc = out.meta?.locale || cfg.hostI18nLocale || 'zh-CN';
          downloadJsonPayload(`agy-sag-missing-template-${loc}.json`, out);
          setPackStatus(
            i18n.formatTemplate(t('customPackMissingExported', 'Exported {count}'), { count: out.meta?.count || 0 }),
            'ok'
          );
        },
      });

      const clearBtn = mkChip({
        label: t('customPackClearBtn', 'Clear Custom Packs'),
        active: false,
        risk: 'high',
        testId: 'ag-sag-pack-clear-btn',
        onClick: () => {
          if (typeof options.onClearCustomPacks === 'function') options.onClearCustomPacks();
          customPackDraftText = '';
          textarea.value = '';
          setPackStatus(t('customPackCleared', 'Cleared'), 'ok');
        },
      });

      packBtnRow.appendChild(fileInput);
      packBtnRow.appendChild(importBtn);
      packBtnRow.appendChild(toggleEditorBtn);
      packBtnRow.appendChild(exportBtn);
      packBtnRow.appendChild(collectMissingBtn);
      packBtnRow.appendChild(exportMissingBtn);
      packBtnRow.appendChild(clearBtn);

      const applyBtn = mkChip({
        label: t('customPackApplyBtn', 'Apply'),
        active: true,
        testId: 'ag-sag-pack-apply-btn',
        onClick: () => {
          const rawText = textarea.value;
          customPackDraftText = rawText;
          const importer =
            typeof options.onImportCustomPack === 'function'
              ? options.onImportCustomPack
              : (v) => {
                  const packsMod = resolveDep('__agSagHostI18nPacks', './host-i18n-packs.js');
                  return packsMod?.sanitizeImportedPack
                    ? packsMod.sanitizeImportedPack(v)
                    : { ok: false, errors: ['Pack sanitizer unavailable'], stats: { exactCount: 0, patternCount: 0 } };
                };
          const res = importer(rawText);
          if (!res || !res.ok) {
            const msg = (res?.errors && res.errors.length ? res.errors : ['Invalid pack']).join('; ');
            setPackStatus(msg, 'error');
            return;
          }
          setPackStatus(
            i18n.formatTemplate(t('customPackApplied', 'Applied'), {
              exact: res.stats?.exactCount ?? Object.keys(res.pack?.exact || {}).length,
              patterns: res.stats?.patternCount ?? (res.pack?.patterns?.length || 0),
              locale: res.pack?.locale || '',
            }),
            'ok'
          );
        },
      });

      const editorFoot = doc.createElement('div');
      editorFoot.className = 'ag-sag-pack-actions';
      editorFoot.appendChild(applyBtn);
      editorWrap.appendChild(textarea);
      editorWrap.appendChild(editorFoot);

      packCtrl.appendChild(packBtnRow);
      packCtrl.appendChild(editorWrap);
      packCtrl.appendChild(statusEl);
      packDetails.appendChild(mkSuiteRow(t('customPackLabel', 'Custom Language Pack'), t('customPackDesc', ''), packCtrl, { stacked: true, searchExtra: 'customPack import export collectMissing' }));
      pane.appendChild(packDetails);
    }

    function renderConversationTab(pane, ctx) {
      const { cfg, t, mkChip, mkSuiteRow } = ctx;

      // 1. Auto-Compact Threshold
      const thGrid = doc.createElement('div');
      thGrid.className = 'ag-sag-ext-grid';
      for (const preset of THRESHOLD_PRESETS) {
        const b = mkChip({
          label: preset === 'off' ? t('cfgThresholdOff', 'Off') : `${preset}%`,
          active: cfg.compactThreshold === preset,
          attr: 'data-ag-sag-th',
          val: preset,
          onClick: () => updateConfig({ compactThreshold: preset }),
        });
        b.setAttribute('data-ag-sg-th', String(preset));
        thGrid.appendChild(b);
      }
      pane.appendChild(
        mkSuiteRow(t('cfgThreshold', 'Auto-Compact Threshold'), t('convThresholdsDesc', ''), thGrid, {
          searchExtra: 'compactThreshold percent',
        })
      );

      // 2. Trigger Mode
      const modeGrid = doc.createElement('div');
      modeGrid.className = 'ag-sag-ext-grid';
      for (const [mKey, mLbl] of [
        ['auto-silent', t('cfgModeSilent', 'Silent Auto')],
        ['confirm', t('cfgModeConfirm', 'Confirm Bar')],
        ['fill-only', t('cfgModeFill', 'Fill Only')],
        ['auto-countdown', 'Countdown'],
      ]) {
        const b = mkChip({
          label: mLbl,
          active: cfg.compactTriggerMode === mKey,
          attr: 'data-ag-sg-mode',
          val: mKey,
          onClick: () => updateConfig({ compactTriggerMode: mKey }),
        });
        b.setAttribute('data-ag-sag-mode', mKey);
        modeGrid.appendChild(b);
      }
      pane.appendChild(mkSuiteRow(t('cfgMode', 'Trigger Mode'), t('setDescMode', ''), modeGrid, { searchExtra: 'compactTriggerMode silent confirm' }));

      // 3. Compact Focus Preset + Custom directive
      const focusWrap = doc.createElement('div');
      focusWrap.className = 'ag-sag-pack-ctrl';
      const focusGrid = doc.createElement('div');
      focusGrid.className = 'ag-sag-ext-grid';
      for (const [fKey, fLbl] of [
        ['default', t('cfgFocusDefault', 'Default')],
        ['code-errors', t('cfgFocusCode', 'Code & Errors')],
        ['bookmarks', t('cfgFocusBookmarks', 'Bookmarks')],
        ['custom', t('cfgFocusCustom', 'Custom')],
      ]) {
        const b = mkChip({
          label: fLbl,
          active: (cfg.compactFocusPreset || 'default') === fKey,
          attr: 'data-ag-sg-focus',
          val: fKey,
          onClick: () => updateConfig({ compactFocusPreset: fKey }),
        });
        b.setAttribute('data-ag-sag-focus', fKey);
        focusGrid.appendChild(b);
      }
      focusWrap.appendChild(focusGrid);

      if (cfg.compactFocusPreset === 'custom') {
        const focusInp = doc.createElement('input');
        focusInp.type = 'text';
        focusInp.className = 'ag-sag-search-input';
        focusInp.setAttribute('data-ag-sg-custom-focus', '1');
        focusInp.placeholder = t('cfgFocusCustomPlaceholder', '');
        focusInp.value = cfg.customCompactFocus || '';
        focusInp.addEventListener('input', () => {
          updateConfig({ customCompactFocus: focusInp.value });
        });
        focusWrap.appendChild(focusInp);
      }
      pane.appendChild(
        mkSuiteRow(t('cfgFocus', 'Preserve Focus'), '', focusWrap, {
          stacked: cfg.compactFocusPreset === 'custom',
          searchExtra: 'compactFocusPreset customCompactFocus',
        })
      );

      // 4. Bookmarks & Vault quick action
      const bmRight = doc.createElement('div');
      bmRight.className = 'ag-sag-ext-grid';
      const bmState = typeof options.getBookmarkState === 'function' ? options.getBookmarkState() : null;
      const bmNote = doc.createElement('span');
      bmNote.className = 'ag-sag-badge-note';
      bmNote.textContent = `${bmState?.bookmarkCount ?? 0} ★`;
      bmRight.appendChild(bmNote);
      if (typeof options.onOpenVault === 'function') {
        bmRight.appendChild(
          mkChip({
            label: t('convOpenVaultBtn', 'Open Bookmark Vault'),
            active: false,
            testId: 'ag-sag-open-vault-btn',
            onClick: () => options.onOpenVault(),
          })
        );
      }
      pane.appendChild(mkSuiteRow(t('convBookmarksLabel', 'Turn Bookmarks & Vault'), t('convBookmarksDesc', ''), bmRight, { searchExtra: 'outlineBookmarks vault' }));

      // 5. Prompt Queue & Draft Guard live readout
      const pqState = typeof options.getQueueState === 'function' ? options.getQueueState() : null;
      const pqBadge = doc.createElement('span');
      pqBadge.className = 'ag-sag-badge-note';
      pqBadge.textContent = `${pqState?.itemCount ?? 0} queued`;
      pane.appendChild(mkSuiteRow(t('convQueueLabel', 'Prompt Queue'), t('convQueueDesc', ''), pqBadge, { searchExtra: 'promptQueue' }));

      const dgState = typeof options.getDraftState === 'function' ? options.getDraftState() : null;
      const dgBadge = doc.createElement('span');
      dgBadge.className = 'ag-sag-badge-note';
      dgBadge.textContent = `${dgState?.savedDraftCount ?? 0} drafts`;
      pane.appendChild(mkSuiteRow(t('cfgModDraftGuard', 'Draft Guard'), t('convDraftDesc', ''), dgBadge, { searchExtra: 'draftGuard' }));
    }

    function renderGuardTab(pane, ctx) {
      const { cfg, t, mkChip, mkSuiteRow } = ctx;

      // 1. Stall Watchdog timeout presets
      const stallGrid = doc.createElement('div');
      stallGrid.className = 'ag-sag-ext-grid';
      for (const sec of STALL_PRESETS) {
        const b = mkChip({
          label: sec === 'off' ? t('cfgStallOff', 'Off') : `${Math.round(sec / 60)}m`,
          active: cfg.stallThresholdSeconds === sec,
          attr: 'data-ag-sag-stall',
          val: sec,
          onClick: () => updateConfig({ stallThresholdSeconds: sec }),
        });
        b.setAttribute('data-ag-sg-stall', String(sec));
        stallGrid.appendChild(b);
      }
      pane.appendChild(mkSuiteRow(t('cfgStall', 'Stall Alert'), t('guardWatchdogDesc', ''), stallGrid, { searchExtra: 'sessionWatchdog stallThresholdSeconds' }));

      // 2. Sidebar Radar & Blurred OS Notification mode
      const notifyGrid = doc.createElement('div');
      notifyGrid.className = 'ag-sag-ext-grid';
      for (const [nKey, nLbl] of [
        ['off', t('cfgNotifyOff', 'Off')],
        ['awaiting', t('cfgNotifyAwaiting', 'Awaiting Only')],
        ['all', t('cfgNotifyAll', 'Awaiting + Done')],
      ]) {
        const b = mkChip({
          label: nLbl,
          active: cfg.radarNotifyMode === nKey,
          attr: 'data-ag-sg-prism-notify',
          val: nKey,
          onClick: () => updateConfig({ radarNotifyMode: nKey }),
        });
        b.setAttribute('data-ag-sag-notify', nKey);
        notifyGrid.appendChild(b);
      }
      pane.appendChild(mkSuiteRow(t('cfgRadarNotify', 'Background Alerts'), t('guardRadarDesc', ''), notifyGrid, { searchExtra: 'sessionRadar radarNotifyMode' }));

      // 3. Safe Auto-Accept Policy + Dry Run + <details> custom allow patterns
      const aaGrid = doc.createElement('div');
      aaGrid.className = 'ag-sag-ext-grid';
      for (const [pol, pLbl] of [
        ['readonly-safe', t('autoAcceptReadonly', 'Read-only Safe')],
        ['dev-flow', t('autoAcceptDevFlow', 'Dev Flow')],
        ['custom', t('cfgFocusCustom', 'Custom')],
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
          label: t('autoAcceptDryRun', 'Dry Run'),
          active: Boolean(cfg.autoAcceptDryRun),
          attr: 'data-ag-sag-aa-dryrun',
          val: '1',
          onClick: () => updateConfig({ autoAcceptDryRun: !cfg.autoAcceptDryRun }),
        })
      );
      pane.appendChild(
        mkSuiteRow(
          t('autoAcceptLabel', 'Safe Auto-Accept Policy'),
          cfg.modules?.safeAutoAccept ? t('autoAcceptDesc', '') : t('autoAcceptOffHint', ''),
          aaGrid,
          { searchExtra: 'safeAutoAccept autoAcceptPolicy dryRun' }
        )
      );

      const aaAdv = doc.createElement('details');
      aaAdv.className = 'ag-sag-details';
      aaAdv.setAttribute('data-testid', 'ag-sag-adv-aa');
      if (cfg.autoAcceptPolicy === 'custom' || customPatternsStatusText) aaAdv.open = true;
      const aaSum = doc.createElement('summary');
      aaSum.textContent = t('guardAutoAcceptAdvSummary', 'Custom Allow Rules');
      aaAdv.appendChild(aaSum);

      const aaWrap = doc.createElement('div');
      aaWrap.className = 'ag-sag-pack-ctrl';
      const aaTa = doc.createElement('textarea');
      aaTa.className = 'ag-sag-pack-textarea';
      aaTa.setAttribute('data-testid', 'ag-sag-aa-custom-textarea');
      aaTa.setAttribute('spellcheck', 'false');
      aaTa.value =
        customPatternsDraftText !== null
          ? customPatternsDraftText
          : Array.isArray(cfg.autoAcceptCustomPatterns)
            ? cfg.autoAcceptCustomPatterns.join('\n')
            : '';
      aaTa.addEventListener('input', () => {
        customPatternsDraftText = aaTa.value;
      });
      const aaBtns = doc.createElement('div');
      aaBtns.className = 'ag-sag-ext-grid';
      aaBtns.appendChild(
        mkChip({
          label: t('guardAutoAcceptCustomApply', 'Save Rules'),
          active: true,
          testId: 'ag-sag-aa-custom-apply',
          onClick: () => {
            const lines = aaTa.value
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 30);
            customPatternsDraftText = lines.join('\n');
            customPatternsStatusText = i18n.formatTemplate(t('guardAutoAcceptCustomSaved', 'Saved {n}'), { n: lines.length });
            updateConfig({ autoAcceptCustomPatterns: lines });
          },
        })
      );
      if (customPatternsStatusText) {
        const note = doc.createElement('span');
        note.className = 'ag-sag-badge-note';
        note.textContent = customPatternsStatusText;
        aaBtns.appendChild(note);
      }
      aaWrap.appendChild(aaTa);
      aaWrap.appendChild(aaBtns);
      aaAdv.appendChild(mkSuiteRow(t('guardAutoAcceptCustomLabel', 'Custom Allow Regex'), '', aaWrap, { stacked: true, searchExtra: 'autoAcceptCustomPatterns' }));
      pane.appendChild(aaAdv);

      // 4. Quota Pulse summary + <details> soft turn thresholds
      const qCtrl = doc.createElement('div');
      qCtrl.className = 'ag-sag-ext-grid';
      if (typeof options.getQuotaSummary === 'function') {
        const qs = options.getQuotaSummary();
        const badge = doc.createElement('span');
        badge.className = 'ag-sag-badge-note';
        badge.setAttribute('data-testid', 'ag-sag-quota-summary');
        badge.textContent = i18n.formatTemplate(t('quotaSummary', '5h: {t5} · 7d: {t7} · {health}'), {
          t5: qs?.localEstimate?.turns5h ?? 0,
          t7: qs?.localEstimate?.turns7d ?? 0,
          health: qs?.health || 'ok',
        });
        qCtrl.appendChild(badge);
      }
      pane.appendChild(
        mkSuiteRow(t('quotaLabel', 'Quota Pulse'), cfg.modules?.quotaPulse ? t('quotaDesc', '') : t('quotaOffHint', ''), qCtrl, {
          searchExtra: 'quotaPulse 5h 7d',
        })
      );

      const qAdv = doc.createElement('details');
      qAdv.className = 'ag-sag-details';
      qAdv.setAttribute('data-testid', 'ag-sag-adv-quota');
      const qSum = doc.createElement('summary');
      qSum.textContent = t('guardQuotaAdvSummary', 'Quota Soft Thresholds');
      qAdv.appendChild(qSum);
      const qBody = doc.createElement('div');
      qBody.className = 'ag-sag-details-body';

      const mkNumCtrl = (val, min, max, testId, onSave) => {
        const inp = doc.createElement('input');
        inp.type = 'number';
        inp.min = String(min);
        inp.max = String(max);
        inp.className = 'ag-sag-select';
        inp.setAttribute('data-testid', testId);
        inp.value = String(val);
        inp.addEventListener('change', () => {
          const n = Number(inp.value);
          if (Number.isFinite(n)) onSave(n);
        });
        return inp;
      };
      qBody.appendChild(
        mkSuiteRow(
          t('guardQuota5hLabel', '5h Turn Budget'),
          '',
          mkNumCtrl(cfg.quotaSoftTurns5h || 60, 10, 500, 'ag-sag-quota-5h-input', (n) => updateConfig({ quotaSoftTurns5h: n })),
          { searchExtra: 'quotaSoftTurns5h' }
        )
      );
      qBody.appendChild(
        mkSuiteRow(
          t('guardQuota7dLabel', '7d Turn Budget'),
          '',
          mkNumCtrl(cfg.quotaSoftTurns7d || 350, 30, 5000, 'ag-sag-quota-7d-input', (n) => updateConfig({ quotaSoftTurns7d: n })),
          { searchExtra: 'quotaSoftTurns7d' }
        )
      );
      qAdv.appendChild(qBody);
      pane.appendChild(qAdv);
    }

    function renderNovTab(pane, ctx) {
      const { cfg, isZh, t, novState, novConnected, mkChip } = ctx;
      pane.setAttribute('data-testid', 'ag-sag-nov-panel');

      if (
        ctx.allowNovAutoRefresh !== false &&
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

      const novModulesMeta = novSynergyMod?.NOV_MODULES_META || [];
      const novCategoryMap = novSynergyMod?.NOV_MODULE_CATEGORIES || {};
      const novCategoryIds = novSynergyMod?.NOV_MODULE_CATEGORY_IDS || Object.keys(novCategoryMap);
      const novCategories = Array.isArray(novCategoryMap)
        ? novCategoryMap
        : novCategoryIds.map((id) => novCategoryMap[id]).filter(Boolean);
      const novPresetsMeta = novSynergyMod?.NOV_PRESETS_META || [];
      const installCmd = novSynergyMod?.NOV_INSTALL_CMD || 'agy plugin install https://github.com/tone-leh/agy-NOV';

      if (novConnected && novState) {
        const banner = doc.createElement('div');
        banner.className = 'ag-sag-nov-banner';
        const bLeft = doc.createElement('div');
        bLeft.className = 'ag-sag-suite-label';
        const bTitle = doc.createElement('strong');
        bTitle.textContent = t('novHeaderTitle', 'agy-NOV Control Hub');
        const bMeta = doc.createElement('span');
        bMeta.className = 'ag-sag-nov-meta';
        bMeta.setAttribute('data-testid', 'ag-sag-nov-meta');
        bMeta.textContent = i18n.formatTemplate(t('novConnectedMeta', 'v{ver} · {preset} · {on}/{total} · {tools} tools'), {
          ver: novState.version || '0.5.0',
          preset: novState.config?.preset || 'core',
          on: novState.enabledCount ?? 0,
          total: novModulesMeta.length || 13,
          tools: novState.toolCount ?? 2,
        });
        bLeft.appendChild(bTitle);
        bLeft.appendChild(bMeta);
        banner.appendChild(bLeft);

        if (typeof novSynergy?.refresh === 'function') {
          banner.appendChild(
            mkChip({
              label: t('novRefreshBtn', 'Refresh'),
              active: false,
              attr: 'data-ag-nov-refresh',
              val: '1',
              onClick: () => void novSynergy.refresh(),
            })
          );
        }
        pane.appendChild(banner);

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
              onClick: () => void novSynergy.applyPreset(p.id),
            })
          );
        }
        pane.appendChild(ctx.mkSuiteRow(t('novPresetLabel', 'agy-NOV Presets'), t('novPresetDesc', ''), novPresetGrid, { searchExtra: 'nov preset' }));

        // 13 agy-NOV Modules grouped by category
        const catContainer = doc.createElement('div');
        catContainer.className = 'ag-sag-pack-ctrl';
        catContainer.setAttribute('data-testid', 'ag-sag-nov-mod-grid');

        const renderModuleCards = (mods) => {
          const modGrid = doc.createElement('div');
          modGrid.className = 'ag-sag-nov-grid';
          for (const m of mods) {
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
            toolTag.textContent = i18n.formatTemplate(t('novToolsBadge', '{n} tools'), { n: m.toolCount });
            tags.appendChild(toolTag);

            const privTag = doc.createElement('span');
            privTag.className = 'ag-sag-nov-tag';
            if (m.privacy === 'opt-in-network') {
              privTag.setAttribute('data-kind', 'network');
              privTag.textContent = t('novPrivacyNetwork', 'Opt-in Net');
            } else {
              privTag.textContent = t('novPrivacyOffline', 'Offline');
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
          return modGrid;
        };

        if (novCategories.length > 0) {
          for (const cat of novCategories) {
            const mods = novModulesMeta.filter((m) => m.category === cat.id);
            if (!mods.length) continue;
            const catBox = doc.createElement('div');
            catBox.className = 'ag-sag-overview-group';
            catBox.setAttribute('data-ag-nov-category', cat.id);
            const catHead = doc.createElement('div');
            catHead.className = 'ag-sag-group-title';
            catHead.textContent = isZh ? cat.nameZh : cat.nameEn;
            catBox.appendChild(catHead);
            catBox.appendChild(renderModuleCards(mods));
            catContainer.appendChild(catBox);
          }
        } else {
          catContainer.appendChild(renderModuleCards(novModulesMeta));
        }

        pane.appendChild(ctx.mkSuiteRow(t('novModulesLabel', '13 Native Modules'), t('novModulesDesc', ''), catContainer, { stacked: true, searchExtra: 'nov modules' }));

        // Dual-Star Synergy Effects
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
        synTitle.textContent = t('novSynergyTitle', 'Dual-Star Synergy');
        synBox.appendChild(synTitle);

        const synList = doc.createElement('div');
        synList.className = 'ag-sag-synergy-list';
        if (!synEffects.length) {
          const empty = doc.createElement('span');
          empty.className = 'ag-sag-badge-note';
          empty.textContent = t('novSynergyEmpty', '');
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
        pane.appendChild(synBox);
      } else if (novState?.installed && !novState.bridgeConnected) {
        const waitCard = doc.createElement('div');
        waitCard.className = 'ag-sag-nov-promo';
        waitCard.setAttribute('data-testid', 'ag-sag-nov-waiting');
        const wt = doc.createElement('div');
        wt.className = 'ag-sag-nov-promo-title';
        wt.textContent = t('novHeaderTitle', 'agy-NOV Control Hub');
        const wd = doc.createElement('div');
        wd.className = 'ag-sag-nov-promo-desc';
        wd.textContent = t('novBridgeWaiting', '');
        waitCard.appendChild(wt);
        waitCard.appendChild(wd);
        if (typeof novSynergy?.refresh === 'function') {
          waitCard.appendChild(
            mkChip({
              label: t('novRefreshBtn', 'Refresh'),
              active: false,
              attr: 'data-ag-nov-refresh',
              val: '1',
              onClick: () => void novSynergy.refresh(),
            })
          );
        }
        pane.appendChild(waitCard);
      } else {
        const promo = doc.createElement('div');
        promo.className = 'ag-sag-nov-promo';
        promo.setAttribute('data-testid', 'ag-sag-nov-promo');
        const pt = doc.createElement('div');
        pt.className = 'ag-sag-nov-promo-title';
        pt.textContent = t('novPromoTitle', 'Pair with agy-NOV');
        const pd = doc.createElement('div');
        pd.className = 'ag-sag-nov-promo-desc';
        pd.textContent = t('novPromoDesc', '');
        const featRow = doc.createElement('div');
        featRow.className = 'ag-sag-ext-grid';
        for (const lbl of [t('novPromoBadge1', ''), t('novPromoBadge2', ''), t('novPromoBadge3', ''), t('novPromoBadge4', '')].filter(Boolean)) {
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
        copyBtn.textContent = copiedInstallFeedback ? t('novPromoCopiedBtn', 'Copied') : t('novPromoCopyBtn', 'Copy');
        copyBtn.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          try {
            if (typeof options.onCopyText === 'function') options.onCopyText(installCmd);
            else if (win?.navigator?.clipboard?.writeText) void win.navigator.clipboard.writeText(installCmd).catch(() => {});
          } catch {}
          copiedInstallFeedback = true;
          refreshAllViews();
          if (copyResetTimer) clearTimeout(copyResetTimer);
          copyResetTimer = setTimeout(() => {
            copyResetTimer = null;
            if (destroyed) return;
            copiedInstallFeedback = false;
            refreshAllViews();
          }, 1800);
          copyResetTimer?.unref?.();
        });
        cmdRow.appendChild(cmdCode);
        cmdRow.appendChild(copyBtn);
        promo.appendChild(pt);
        promo.appendChild(pd);
        promo.appendChild(featRow);
        promo.appendChild(cmdRow);
        pane.appendChild(promo);
      }
    }

    function renderAdvancedTab(pane, ctx) {
      const { cfg, t, mkChip, mkSuiteRow, novConnected, novState, enabledModuleCount, totalModuleCount } = ctx;

      const cfgStatusEl = doc.createElement('div');
      cfgStatusEl.className = 'ag-sag-pack-status';
      cfgStatusEl.setAttribute('data-testid', 'ag-sag-cfg-status');
      if (cfgStatusText) {
        cfgStatusEl.textContent = cfgStatusText;
        cfgStatusEl.setAttribute('data-tone', cfgStatusTone || 'info');
      } else {
        cfgStatusEl.hidden = true;
      }

      const setCfgStatus = (msg, tone = 'ok') => {
        cfgStatusText = String(msg || '');
        cfgStatusTone = tone;
        const targets = new Set([
          cfgStatusEl,
          mountedEl?.querySelector?.('[data-testid="ag-sag-cfg-status"]'),
          drawerBodyEl?.querySelector?.('[data-testid="ag-sag-cfg-status"]'),
          doc.querySelector?.('[data-testid="ag-sag-cfg-status"]'),
        ]);
        for (const target of targets) {
          if (!target) continue;
          target.textContent = cfgStatusText;
          target.setAttribute('data-tone', tone);
          target.hidden = !cfgStatusText;
        }
      };

      // 1. Export full config JSON
      pane.appendChild(
        mkSuiteRow(
          t('advExportLabel', 'Export Config'),
          t('advExportDesc', ''),
          mkChip({
            label: t('advExportBtn', 'Export JSON'),
            active: false,
            testId: 'ag-sag-cfg-export-btn',
            onClick: () => {
              downloadJsonPayload('agy-sag-config.json', cfg);
              setCfgStatus(t('advExportDone', 'Exported'), 'ok');
            },
          }),
          { searchExtra: 'export config json' }
        )
      );

      // 2. Import & sanitize config JSON
      const impWrap = doc.createElement('div');
      impWrap.className = 'ag-sag-pack-ctrl';
      const impTa = doc.createElement('textarea');
      impTa.className = 'ag-sag-pack-textarea';
      impTa.setAttribute('data-testid', 'ag-sag-cfg-import-textarea');
      impTa.setAttribute('spellcheck', 'false');
      impTa.placeholder = t('advImportPlaceholder', '');
      impTa.value = cfgImportDraftText;
      impTa.addEventListener('input', () => {
        cfgImportDraftText = impTa.value;
      });
      const impBtns = doc.createElement('div');
      impBtns.className = 'ag-sag-ext-grid';
      impBtns.appendChild(
        mkChip({
          label: t('advImportApplyBtn', 'Validate & Import'),
          active: true,
          testId: 'ag-sag-cfg-import-btn',
          onClick: () => {
            const raw = impTa.value.trim();
            cfgImportDraftText = impTa.value;
            try {
              const parsed = JSON.parse(raw);
              if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error('Must be a JSON object');
              }
              const cleaned = coexist.sanitizeConfig(parsed, coexist.DEFAULT_CONFIG);
              updateConfig(cleaned);
              setCfgStatus(t('advImportOk', 'Imported'), 'ok');
            } catch {
              setCfgStatus(t('advImportErr', 'Invalid JSON'), 'error');
            }
          },
        })
      );
      impWrap.appendChild(impTa);
      impWrap.appendChild(impBtns);
      pane.appendChild(mkSuiteRow(t('advImportLabel', 'Import Config'), t('advImportDesc', ''), impWrap, { stacked: true, searchExtra: 'import config json' }));

      // 3. Inline 2-step Reset to Defaults (zero window.confirm)
      const resetCtrl = doc.createElement('div');
      resetCtrl.className = 'ag-sag-ext-grid';
      if (!resetConfirmPending) {
        resetCtrl.appendChild(
          mkChip({
            label: t('advResetBtn', 'Reset Defaults'),
            active: false,
            risk: 'high',
            testId: 'ag-sag-reset-btn',
            onClick: () => {
              resetConfirmPending = true;
              refreshAllViews();
            },
          })
        );
      } else {
        resetCtrl.appendChild(
          mkChip({
            label: t('advResetConfirmBtn', 'Confirm Reset?'),
            active: true,
            risk: 'high',
            testId: 'ag-sag-reset-confirm',
            onClick: () => {
              resetConfirmPending = false;
              customCssDraftText = null;
              customCssStatusText = '';
              customPatternsDraftText = null;
              customPatternsStatusText = '';
              cfgImportDraftText = '';
              diagCopiedFeedback = false;
              cfgStatusText = t('advResetDone', 'Restored defaults');
              cfgStatusTone = 'ok';
              const def = coexist.DEFAULT_CONFIG;
              updateConfig({ ...def, modules: { ...def.modules } });
            },
          })
        );
        resetCtrl.appendChild(
          mkChip({
            label: t('advResetCancelBtn', 'Cancel'),
            active: false,
            testId: 'ag-sag-reset-cancel',
            onClick: () => {
              resetConfirmPending = false;
              refreshAllViews();
            },
          })
        );
      }
      pane.appendChild(mkSuiteRow(t('advResetLabel', 'Reset to Defaults'), t('advResetDesc', ''), resetCtrl, { searchExtra: 'reset default' }));
      pane.appendChild(cfgStatusEl);

      // 4. Diagnostics summary
      const diagObj = {
        mountedMode: drawerOpen ? 'drawer' : mountedMode,
        locale: cfg.hostI18nLocale || 'auto',
        enabledModules: `${enabledModuleCount}/${totalModuleCount}`,
        hostI18n: typeof options.getHostI18nState === 'function' ? options.getHostI18nState() : null,
        novConnected,
        novPreset: novState?.config?.preset || null,
      };
      const diagWrap = doc.createElement('div');
      diagWrap.className = 'ag-sag-pack-ctrl';
      const diagPre = doc.createElement('pre');
      diagPre.className = 'ag-sag-pack-textarea';
      diagPre.setAttribute('data-testid', 'ag-sag-diag-pre');
      diagPre.textContent = JSON.stringify(diagObj, null, 2);
      const diagBtns = doc.createElement('div');
      diagBtns.className = 'ag-sag-ext-grid';
      diagBtns.appendChild(
        mkChip({
          label: diagCopiedFeedback ? t('advDiagCopied', 'Copied') : t('advDiagCopyBtn', 'Copy Diagnostics'),
          active: false,
          testId: 'ag-sag-diag-copy-btn',
          onClick: () => {
            const text = JSON.stringify(diagObj, null, 2);
            try {
              if (typeof options.onCopyText === 'function') options.onCopyText(text);
              else if (win?.navigator?.clipboard?.writeText) void win.navigator.clipboard.writeText(text).catch(() => {});
            } catch {}
            diagCopiedFeedback = true;
            refreshAllViews();
          },
        })
      );
      diagWrap.appendChild(diagPre);
      diagWrap.appendChild(diagBtns);
      pane.appendChild(mkSuiteRow(t('advDiagLabel', 'Diagnostics'), t('advDiagDesc', ''), diagWrap, { stacked: true, searchExtra: 'diagnostics debug' }));
    }

    function renderHub(section, { inPrism = false, inDrawer = false } = {}) {
      if (!section || !doc) return;
      const sagStrings = typeof i18n.getSagStrings === 'function' ? i18n.getSagStrings(getLang()) : null;
      if (!sagStrings) return;

      const hadSearchFocus = doc.activeElement?.getAttribute?.('data-testid') === 'ag-sag-search-input';
      const ctx = buildCtx(inPrism, inDrawer);
      while (section.firstChild) section.removeChild(section.firstChild);

      const suite = doc.createElement('div');
      suite.className = 'ag-sag-suite-panel';
      suite.setAttribute('data-testid', 'ag-sag-suite-panel');

      renderHeader(suite, ctx, () => {
        section.querySelector?.('[data-testid="ag-sag-fold-head"]')?.focus?.();
      });

      const foldBody = doc.createElement('div');
      foldBody.className = 'ag-sag-fold-body';
      foldBody.setAttribute('data-testid', 'ag-sag-fold-body');
      foldBody.hidden = inDrawer ? false : !panelExpanded;

      // Global Search Input (stays mounted in place during typing so focus is preserved)
      const searchWrap = doc.createElement('div');
      searchWrap.className = 'ag-sag-search-wrap';
      const searchInp = doc.createElement('input');
      searchInp.type = 'search';
      searchInp.className = 'ag-sag-search-input';
      searchInp.setAttribute('data-testid', 'ag-sag-search-input');
      searchInp.placeholder = ctx.t('searchPlaceholder', 'Search settings…');
      searchInp.value = searchQuery;

      const clearSearchBtn = ctx.mkChip({
        label: ctx.t('searchClear', 'Clear'),
        active: false,
        testId: 'ag-sag-search-clear',
        onClick: () => {
          searchQuery = '';
          searchInp.value = '';
          updateSearchView();
          searchInp.focus?.();
        },
      });
      clearSearchBtn.hidden = !searchQuery.trim();
      searchWrap.appendChild(searchInp);
      searchWrap.appendChild(clearSearchBtn);
      foldBody.appendChild(searchWrap);

      const presetAndTabsWrap = doc.createElement('div');
      presetAndTabsWrap.className = 'ag-sag-pane';
      renderPresetRow(presetAndTabsWrap, ctx);
      renderTabBar(presetAndTabsWrap, ctx, section);

      const pane = doc.createElement('div');
      pane.className = 'ag-sag-pane';
      pane.setAttribute('data-ag-sag-pane', activeSubTab);
      if (activeSubTab === 'overview') renderOverview(pane, ctx);
      else if (activeSubTab === 'ui') renderUiTab(pane, ctx);
      else if (activeSubTab === 'conversation') renderConversationTab(pane, ctx);
      else if (activeSubTab === 'guard') renderGuardTab(pane, ctx);
      else if (activeSubTab === 'nov') renderNovTab(pane, ctx);
      else if (activeSubTab === 'advanced') renderAdvancedTab(pane, ctx);
      presetAndTabsWrap.appendChild(pane);

      const searchResultsHost = doc.createElement('div');
      searchResultsHost.className = 'ag-sag-pane';
      searchResultsHost.setAttribute('data-testid', 'ag-sag-search-results');

      const updateSearchView = () => {
        const q = searchQuery.trim().toLowerCase();
        clearSearchBtn.hidden = !q;
        while (searchResultsHost.firstChild) searchResultsHost.removeChild(searchResultsHost.firstChild);
        if (!q) {
          presetAndTabsWrap.hidden = false;
          searchResultsHost.hidden = true;
          return;
        }
        presetAndTabsWrap.hidden = true;
        searchResultsHost.hidden = false;

        const virtualAll = doc.createElement('div');
        const searchCtx = { ...ctx, allowNovAutoRefresh: false };
        renderOverview(virtualAll, searchCtx);
        renderUiTab(virtualAll, searchCtx);
        renderConversationTab(virtualAll, searchCtx);
        renderGuardTab(virtualAll, searchCtx);
        renderNovTab(virtualAll, searchCtx);
        renderAdvancedTab(virtualAll, searchCtx);

        const matches = Array.from(virtualAll.querySelectorAll?.('[data-ag-sag-search]') || []).filter((el) =>
          String(el.getAttribute('data-ag-sag-search') || '').includes(q)
        );
        if (!matches.length) {
          const emptyEl = doc.createElement('div');
          emptyEl.className = 'ag-sag-badge-note';
          emptyEl.setAttribute('data-testid', 'ag-sag-search-empty');
          emptyEl.textContent = ctx.t('searchEmpty', 'No matching settings found');
          searchResultsHost.appendChild(emptyEl);
          return;
        }
        for (const item of matches) {
          searchResultsHost.appendChild(item);
        }
        const liveCfgStatus = virtualAll.querySelector?.('[data-testid="ag-sag-cfg-status"]');
        if (liveCfgStatus && !searchResultsHost.querySelector?.('[data-testid="ag-sag-cfg-status"]')) {
          searchResultsHost.appendChild(liveCfgStatus);
        }
      };

      searchInp.addEventListener('input', () => {
        searchQuery = searchInp.value;
        updateSearchView();
      });

      updateSearchView();
      foldBody.appendChild(presetAndTabsWrap);
      foldBody.appendChild(searchResultsHost);
      suite.appendChild(foldBody);
      section.appendChild(suite);

      if (hadSearchFocus) {
        try { searchInp.focus?.(); } catch {}
      }
    }

    function ensureDrawerDom() {
      if (!doc || !doc.body || destroyed) return null;
      ensureStyle();
      if (!drawerBackdropEl || !drawerBackdropEl.isConnected) {
        drawerBackdropEl = coexist.markOwnedNoTranslate(doc.createElement('div'));
        drawerBackdropEl.className = 'ag-sag-drawer-backdrop';
        drawerBackdropEl.setAttribute('data-testid', DRAWER_BACKDROP_TESTID);
        drawerBackdropEl.hidden = true;
        drawerBackdropEl.addEventListener('click', (ev) => {
          if (ev?.target === drawerBackdropEl) closeDrawer();
        });

        drawerEl = doc.createElement('div');
        drawerEl.className = 'ag-sag-drawer';
        drawerEl.setAttribute('role', 'dialog');
        drawerEl.setAttribute('aria-modal', 'true');
        drawerEl.setAttribute('data-testid', DRAWER_TESTID);

        const dHead = doc.createElement('div');
        dHead.className = 'ag-sag-drawer-head';
        const dTitle = doc.createElement('div');
        dTitle.className = 'ag-sag-brand-badge';
        dTitle.appendChild(createHexBadgeSvg('S', 16));
        const dTxt = doc.createElement('span');
        dTxt.textContent = typeof i18n.getSagStrings === 'function' ? i18n.getSagStrings(getLang())?.drawerTitle || 'agy-Sag' : 'agy-Sag';
        dTitle.appendChild(dTxt);

        const dClose = doc.createElement('button');
        dClose.type = 'button';
        dClose.className = 'ag-sag-chip';
        dClose.setAttribute('data-testid', 'ag-sag-drawer-close');
        dClose.textContent = typeof i18n.getSagStrings === 'function' ? i18n.getSagStrings(getLang())?.drawerClose || 'Close' : 'Close';
        dClose.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          closeDrawer();
        });
        dHead.appendChild(dTitle);
        dHead.appendChild(dClose);

        drawerBodyEl = doc.createElement('div');
        drawerBodyEl.className = 'ag-sag-drawer-body';

        drawerEl.appendChild(dHead);
        drawerEl.appendChild(drawerBodyEl);
        drawerBackdropEl.appendChild(drawerEl);
        doc.body.appendChild(drawerBackdropEl);
      }
      return drawerBackdropEl;
    }

    function openDrawer(tabId) {
      if (destroyed || !doc) return false;
      if (tabId) {
        activeSubTab = normalizeSubTab(tabId);
        writeUiState(SUBTAB_STORAGE_KEY, activeSubTab);
      }
      drawerOpen = true;
      const bd = ensureDrawerDom();
      if (!bd || !drawerBodyEl) return false;
      bd.hidden = false;
      renderHub(drawerBodyEl, { inPrism: false, inDrawer: true });
      return true;
    }

    function closeDrawer() {
      drawerOpen = false;
      if (drawerBackdropEl) {
        drawerBackdropEl.hidden = true;
      }
      if (drawerBodyEl) {
        while (drawerBodyEl.firstChild) drawerBodyEl.removeChild(drawerBodyEl.firstChild);
      }
      return true;
    }

    function renderIntoSettings() {
      if (destroyed || !doc) return false;
      ensureStyle();

      // Priority 1: Embed cleanly inside Obsidian Prism's Modules tab if #ag-cs-settings-sec exists
      const settingsEl = doc.getElementById?.(PRISM_SETTINGS_SEC_ID);
      const modulesGroup = settingsEl?.querySelector?.(PRISM_MODULES_GROUP_SEL) || null;
      if (settingsEl && modulesGroup) {
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
        renderHub(section, { inPrism: true, inDrawer: false });
        return true;
      }

      // Priority 2: Standalone user -> mount cleanly in Antigravity's native Settings dialog
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
        renderHub(section, { inPrism: false, inDrawer: false });
        return true;
      }

      const existingNative =
        mountedMode === 'native' && mountedEl && mountedEl.isConnected
          ? mountedEl
          : doc.querySelector?.(`[data-testid="${NATIVE_SECTION_TESTID}"]`) || null;
      if (existingNative && existingNative.isConnected) {
        mountedEl = existingNative;
        mountedMode = 'native';
        renderHub(existingNative, { inPrism: false, inDrawer: false });
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
        lastLang = readHostLangSignature();
        refreshAllViews();
      }
    }

    function sync() {
      if (destroyed) return false;
      checkHostContextChange();
      const mountedOk = renderIntoSettings();
      if (drawerOpen && drawerBodyEl) {
        renderHub(drawerBodyEl, { inPrism: false, inDrawer: true });
      }
      return mountedOk;
    }

    function bindShortcuts() {
      if (!doc || typeof doc.addEventListener !== 'function') return;
      if (options.bindDrawerShortcut === false) return;
      const handler = (ev) => {
        if (destroyed || !ev) return;
        if (ev.key === 'Escape' && drawerOpen) {
          ev.preventDefault?.();
          ev.stopPropagation?.();
          closeDrawer();
          return;
        }
        if ((ev.ctrlKey || ev.metaKey) && ev.altKey && !ev.shiftKey && (ev.key === ',' || ev.code === 'Comma')) {
          ev.preventDefault?.();
          ev.stopPropagation?.();
          if (drawerOpen) closeDrawer();
          else openDrawer();
        }
      };
      doc.addEventListener('keydown', handler, true);
      keydownCleanup = () => doc.removeEventListener('keydown', handler, true);
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
      drawerOpen = false;
      if (copyResetTimer) {
        try { clearTimeout(copyResetTimer); } catch {}
        copyResetTimer = null;
      }
      if (keydownCleanup) {
        try { keydownCleanup(); } catch {}
        keydownCleanup = null;
      }
      try { domObserver?.disconnect?.(); } catch {}
      try { htmlObserver?.disconnect?.(); } catch {}
      domObserver = htmlObserver = null;
      try { mountedEl?.remove?.(); } catch {}
      try { drawerBackdropEl?.remove?.(); } catch {}
      try { createdStyleEl?.remove?.(); } catch {}
      try {
        doc?.querySelectorAll?.(
          `[data-testid="${EMBED_SECTION_TESTID}"], [data-testid="${NATIVE_SECTION_TESTID}"], [data-testid="${DRAWER_BACKDROP_TESTID}"]`
        )?.forEach?.((n) => n.remove?.());
      } catch {}
      mountedEl = drawerBackdropEl = drawerEl = drawerBodyEl = createdStyleEl = null;
      mountedMode = 'none';
    }

    lastLang = readHostLangSignature();
    lastTheme =
      doc?.documentElement?.getAttribute?.('data-ag-sag-theme') ||
      doc?.documentElement?.getAttribute?.('data-ag-cs-theme') ||
      '';
    bindShortcuts();
    renderIntoSettings();
    if (options.autoObserve !== false) startObservers();

    return {
      sync,
      renderHub,
      openDrawer,
      closeDrawer,
      isDrawerOpen: () => drawerOpen,
      getActiveSubTab: () => activeSubTab,
      setActiveSubTab: (tabId) => {
        const next = normalizeSubTab(tabId);
        if (!SUBTAB_IDS.includes(next)) return false;
        activeSubTab = next;
        searchQuery = '';
        writeUiState(SUBTAB_STORAGE_KEY, next);
        refreshAllViews();
        return true;
      },
      isExpanded: () => panelExpanded,
      setExpanded: (expanded) => {
        panelExpanded = Boolean(expanded);
        writeUiState(EXPANDED_STORAGE_KEY, panelExpanded ? '1' : '0');
        refreshAllViews();
        return panelExpanded;
      },
      detectEnvironment: () => detectPrismEnvironment(doc, win),
      getDebugState: () => ({
        destroyed,
        embedded: Boolean(mountedEl && mountedEl.isConnected !== false),
        mountedMode: mountedEl && mountedEl.isConnected !== false ? mountedMode : 'none',
        drawerOpen,
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
    DRAWER_BACKDROP_TESTID,
    DRAWER_TESTID,
    SUBTAB_IDS,
    LEGACY_TAB_MAP,
    normalizeSubTab,
    detectPrismEnvironment,
    findNativeSettingsAnchor,
    createPrismBridgeController,
  };
});
