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
    const bookmarkMod = options.outlineBookmarksMod || resolveDep('__agSgOutlineBookmarks', './outline-bookmarks.js');
    const vaultMod = options.bookmarkVaultMod || resolveDep('__agSgBookmarkVault', './bookmark-vault.js');
    const radarMod = options.sessionRadarMod || resolveDep('__agSgSessionRadar', './session-radar.js');
    const prismBridgeMod = options.prismBridgeMod || resolveDep('__agSgPrismBridge', './prism-bridge.js');

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
    let outlineBookmarks = null;
    let bookmarkVault = null;
    let sessionRadar = null;
    let prismBridge = null;

    const openVault = () => bookmarkVault?.open?.();

    const compactGuard = compactMod.createCompactGuardController({
      ...options,
      win,
      doc,
      coexist,
      prismBridgeMod,
      onOpenVault: openVault,
      onStallDetected: (ev) => {
        sessionRadar?.notifyStall?.(ev);
        if (typeof options.onStallDetected === 'function') options.onStallDetected(ev);
      },
      onConfigChange: (nextCfg) => {
        draftGuard?.setEnabled?.(Boolean(nextCfg.modules?.draftGuard));
        outlineBookmarks?.setEnabled?.(Boolean(nextCfg.modules?.outlineBookmarks));
        sessionRadar?.setEnabled?.(Boolean(nextCfg.modules?.sessionRadar));
        sessionRadar?.setNotifyMode?.(nextCfg.radarNotifyMode || 'off');
        prismBridge?.sync?.();
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
          onDraftRestored: options.onDraftRestored,
          onDraftDiscarded: options.onDraftDiscarded,
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
        void compactGuard.evaluateNow();
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
            void compactGuard.evaluateNow();
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

    prismBridge = prismBridgeMod?.createPrismBridgeController
      ? prismBridgeMod.createPrismBridgeController({
          win,
          doc,
          coexist,
          autoObserve: options.autoObserve,
          getLang: options.getLang,
          getConfig: () => compactGuard.getConfig(),
          onUpdateConfig: (patch) => api.updateConfig(patch),
          onOpenVault: openVault,
          onCopyHandoff: () => compactGuard.copyNewSessionHandoff(),
          onHostContextChange: () => {
            compactGuard.refreshUi?.();
            draftGuard?.sync?.();
            outlineBookmarks?.sync?.();
            sessionRadar?.syncFromDom?.();
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
      outlineBookmarks,
      bookmarkVault,
      sessionRadar,
      prismBridge,
      evaluateNow: async () => {
        draftGuard?.sync?.();
        outlineBookmarks.sync();
        sessionRadar.syncFromDom();
        prismBridge?.sync?.();
        return compactGuard.evaluateNow();
      },
      updateConfig: (patch) => {
        const next = compactGuard.updateConfig(patch);
        draftGuard?.setEnabled?.(Boolean(next.modules?.draftGuard));
        outlineBookmarks.setEnabled(Boolean(next.modules?.outlineBookmarks));
        sessionRadar.setEnabled(Boolean(next.modules?.sessionRadar));
        sessionRadar.setNotifyMode(next.radarNotifyMode || 'off');
        prismBridge?.sync?.();
        return next;
      },
      getConfig: () => compactGuard.getConfig(),
      copyNewSessionHandoff: () => compactGuard.copyNewSessionHandoff(),
      openSettingsPopover: () => compactGuard.openSettingsPopover(),
      openBookmarkVault: (q) => bookmarkVault?.open?.(q),
      getDebugState: () => ({
        version: VERSION,
        source,
        yielded: false,
        destroyed,
        compactGuard: compactGuard.getDebugState(),
        draftGuard: draftGuard?.getDebugState?.() || null,
        outlineBookmarks: outlineBookmarks.getDebugState(),
        bookmarkVault: bookmarkVault?.getDebugState?.() || null,
        sessionRadar: sessionRadar.getDebugState(),
        prismBridge: prismBridge?.getDebugState?.() || null,
      }),
      destroy() {
        if (destroyed) return;
        destroyed = true;
        prismBridge?.destroy?.();
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

    if (win) {
      win[coexist.INSTANCE_GLOBAL] = api;
      if (source !== 'standalone') win[coexist.OWNER_GLOBAL] = source;
    }
    return api;
  }

  return { VERSION, mountSessionGuard };
});
