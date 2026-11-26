// Antigravity Session Guard (领航哨) — Unified Modular Entrypoint (UMD)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSgCore = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  const VERSION = '0.3.0';

  function resolveDep(globalKey, relPath) {
    if (globalRoot && globalRoot[globalKey]) return globalRoot[globalKey];
    if (typeof require === 'function') return require(relPath);
    return null;
  }

  function mountSessionGuard(options = {}) {
    const win = options.win || globalRoot;
    const doc = options.doc || win?.document || null;
    const source = options.source || 'standalone';
    const coexist = options.coexist || resolveDep('__agSgCoexist', './coexist.js');
    const compactMod = options.compactGuardMod || resolveDep('__agSgCompactGuard', './compact-guard.js');
    const draftMod = options.draftGuardMod || resolveDep('__agSgDraftGuard', './draft-guard.js');
    const cleanSlateMod = options.cleanSlateMod || resolveDep('__agSgCleanSlate', './clean-slate.js');
    const bookmarkMod = options.outlineBookmarksMod || resolveDep('__agSgOutlineBookmarks', './outline-bookmarks.js');
    const vaultMod = options.bookmarkVaultMod || resolveDep('__agSgBookmarkVault', './bookmark-vault.js');
    const radarMod = options.sessionRadarMod || resolveDep('__agSgSessionRadar', './session-radar.js');
    const prismBridgeMod = options.prismBridgeMod || resolveDep('__agSgPrismBridge', './prism-bridge.js');
    const statusPillMod = options.statusPillMod || resolveDep('__agSgStatusPill', './status-pill.js');

    // Coexistence auto-yield: if a host integrator (e.g. Obsidian Prism Channel 13) already owns Session Guard, standalone yields cleanly
    if (coexist.shouldYieldToHostIntegrator(win, source)) {
      return {
        version: VERSION,
        yielded: true,
        owner: win[coexist.OWNER_GLOBAL],
        destroy() {},
        getDebugState: () => ({ yielded: true, owner: win[coexist.OWNER_GLOBAL], version: VERSION }),
      };
    }

    // Replace any prior standalone instance losslessly
    try { win?.[coexist.INSTANCE_GLOBAL]?.destroy?.(); } catch {}

    let draftGuard = null;
    let cleanSlate = null;
    let outlineBookmarks = null;
    let bookmarkVault = null;
    let sessionRadar = null;
    let prismBridge = null;
    let statusPill = null;

    const openVault = () => bookmarkVault?.open?.();
    const syncStatusPill = () => {
      if (!statusPill) return;
      const cgState = compactGuard.getDebugState();
      const bmState = outlineBookmarks?.getDebugState?.() || null;
      const dgState = draftGuard?.getDebugState?.() || null;
      statusPill.sync({
        snap: cgState.lastSnapshot || null,
        watchdog: cgState.watchdog || null,
        bookmarkCount: bmState?.bookmarkCount || 0,
        hasDraft: Boolean(dgState?.barVisible || (dgState?.savedDraftCount || 0) > 0),
      });
    };

    const compactGuard = compactMod.createCompactGuardController({
      ...options,
      win,
      doc,
      coexist,
      prismBridgeMod,
      onOpenVault: openVault,
      onEvaluated: () => syncStatusPill(),
      onStallDetected: (ev) => {
        sessionRadar?.notifyStall?.(ev);
        syncStatusPill();
        if (typeof options.onStallDetected === 'function') options.onStallDetected(ev);
      },
      onConfigChange: (nextCfg) => {
        draftGuard?.setEnabled?.(Boolean(nextCfg.modules?.draftGuard));
        outlineBookmarks?.setEnabled?.(Boolean(nextCfg.modules?.outlineBookmarks));
        sessionRadar?.setEnabled?.(Boolean(nextCfg.modules?.sessionRadar));
        sessionRadar?.setNotifyMode?.(nextCfg.radarNotifyMode || 'off');
        prismBridge?.sync?.();
        syncStatusPill();
        if (typeof options.onConfigChange === 'function') options.onConfigChange(nextCfg);
      },
    });
    const cfg = compactGuard.getConfig();

    draftGuard = draftMod?.createDraftGuardController
      ? draftMod.createDraftGuardController({
          win,
          doc,
          storage: options.storage,
          coexist,
          enabled: cfg.modules?.draftGuard !== false,
          now: options.now,
          debounceMs: options.draftDebounceMs,
          getLang: options.getLang,
          onDraftRestored: (ev) => {
            syncStatusPill();
            if (typeof options.onDraftRestored === 'function') options.onDraftRestored(ev);
          },
          onDraftDiscarded: (ev) => {
            syncStatusPill();
            if (typeof options.onDraftDiscarded === 'function') options.onDraftDiscarded(ev);
          },
        })
      : null;

    outlineBookmarks = bookmarkMod.createOutlineBookmarksController({
      win,
      doc,
      storage: options.storage,
      coexist,
      enabled: Boolean(cfg.modules?.outlineBookmarks),
      autoObserve: options.autoObserve,
      getLang: options.getLang,
      onOpenVault: openVault,
      onCopyHandoff: options.onCopyHandoff,
      onBookmarksChange: (ev) => {
        void compactGuard.evaluateNow().then(syncStatusPill);
        syncStatusPill();
        if (typeof options.onBookmarksChange === 'function') options.onBookmarksChange(ev);
      },
      onExportMarkdown: options.onExportMarkdown,
      onDownloadMarkdown: options.onDownloadMarkdown,
    });

    bookmarkVault = vaultMod?.createBookmarkVaultController
      ? vaultMod.createBookmarkVaultController({
          win,
          doc,
          storage: options.storage,
          coexist,
          getLang: options.getLang,
          bindShortcut: options.bindVaultShortcut,
          onVaultMutated: () => {
            outlineBookmarks?.sync?.();
            void compactGuard.evaluateNow().then(syncStatusPill);
          },
          onCopyHandoff: options.onCopyHandoff,
          onExportMarkdown: options.onExportMarkdown,
          onDownloadMarkdown: options.onDownloadMarkdown,
        })
      : null;

    sessionRadar = radarMod.createSessionRadarController({
      win,
      doc,
      coexist,
      enabled: Boolean(cfg.modules?.sessionRadar),
      notifyMode: cfg.radarNotifyMode || 'off',
      getLang: options.getLang,
      onTransition: options.onRadarTransition,
      onNotify: options.onRadarNotify,
    });

    cleanSlate = cleanSlateMod?.createCleanSlateController
      ? cleanSlateMod.createCleanSlateController({
          win,
          doc,
          storage: options.storage,
          draftGuardMod: draftMod,
          now: options.now,
          getLang: options.getLang,
          onNavigateNewConversation: options.onNavigateNewConversation,
          onClearTriggered: options.onClearTriggered,
          onCleanRestartApplied: options.onCleanRestartApplied,
        })
      : null;

    statusPill = statusPillMod?.createStatusPillController
      ? statusPillMod.createStatusPillController({
          win,
          doc,
          coexist,
          getLang: options.getLang,
          getConfig: () => compactGuard.getConfig(),
          onUpdateConfig: (patch) => api.updateConfig(patch),
          onCompactNow: () => compactGuard.insertCompact({ submit: true }),
          onCleanRestart: (opts) => cleanSlate?.triggerCleanClear?.(opts),
          onOpenVault: openVault,
        })
      : null;

    prismBridge = prismBridgeMod?.createPrismBridgeController
      ? prismBridgeMod.createPrismBridgeController({
          win,
          doc,
          coexist,
          autoObserve: options.autoObserve,
          getLang: options.getLang,
          getConfig: () => compactGuard.getConfig(),
          onUpdateConfig: (patch) => api.updateConfig(patch),
          onHostContextChange: () => {
            compactGuard.refreshUi?.();
            draftGuard?.sync?.();
            outlineBookmarks?.sync?.();
            sessionRadar?.syncFromDom?.();
            syncStatusPill();
          },
        })
      : null;

    let destroyed = false;

    const api = {
      version: VERSION,
      source,
      yielded: false,
      compactGuard,
      draftGuard,
      cleanSlate,
      outlineBookmarks,
      bookmarkVault,
      sessionRadar,
      prismBridge,
      statusPill,
      evaluateNow: async () => {
        draftGuard?.sync?.();
        cleanSlate?.sync?.();
        outlineBookmarks.sync();
        sessionRadar.syncFromDom();
        prismBridge?.sync?.();
        const snap = await compactGuard.evaluateNow();
        syncStatusPill();
        return snap;
      },
      updateConfig: (patch) => {
        const next = compactGuard.updateConfig(patch);
        draftGuard?.setEnabled?.(Boolean(next.modules?.draftGuard));
        outlineBookmarks.setEnabled(Boolean(next.modules?.outlineBookmarks));
        sessionRadar.setEnabled(Boolean(next.modules?.sessionRadar));
        sessionRadar.setNotifyMode(next.radarNotifyMode || 'off');
        prismBridge?.sync?.();
        syncStatusPill();
        return next;
      },
      getConfig: () => compactGuard.getConfig(),
      clearAndRestart: (opts) => cleanSlate?.triggerCleanClear?.(opts),
      copyNewSessionHandoff: () => compactGuard.copyNewSessionHandoff(),
      openStatusCard: () => statusPill?.open?.(),
      openSettingsPopover: () => compactGuard.openSettingsPopover(),
      openBookmarkVault: (q) => bookmarkVault?.open?.(q),
      getDebugState: () => ({
        version: VERSION,
        source,
        yielded: false,
        destroyed,
        compactGuard: compactGuard.getDebugState(),
        draftGuard: draftGuard?.getDebugState?.() || null,
        cleanSlate: cleanSlate?.getDebugState?.() || null,
        outlineBookmarks: outlineBookmarks.getDebugState(),
        bookmarkVault: bookmarkVault?.getDebugState?.() || null,
        sessionRadar: sessionRadar.getDebugState(),
        prismBridge: prismBridge?.getDebugState?.() || null,
        statusPill: statusPill?.getDebugState?.() || null,
      }),
      destroy() {
        if (destroyed) return;
        destroyed = true;
        statusPill?.destroy?.();
        prismBridge?.destroy?.();
        cleanSlate?.destroy?.();
        draftGuard?.destroy?.();
        compactGuard.destroy();
        outlineBookmarks.destroy();
        bookmarkVault?.destroy?.();
        sessionRadar.destroy();
        try { doc?.getElementById?.('ag-sg-core-css')?.remove?.(); } catch {}
        try {
          if (win && win[coexist.INSTANCE_GLOBAL] === api) delete win[coexist.INSTANCE_GLOBAL];
          if (win && win[coexist.OWNER_GLOBAL] === source) delete win[coexist.OWNER_GLOBAL];
        } catch {}
      },
    };

    syncStatusPill();

    if (win) {
      win[coexist.INSTANCE_GLOBAL] = api;
      if (source !== 'standalone') win[coexist.OWNER_GLOBAL] = source;
    }
    return api;
  }

  return { VERSION, mountSessionGuard };
});
