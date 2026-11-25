// Antigravity Session Guard (领航哨) — Unified Modular Entrypoint (UMD)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSgCore = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  const VERSION = '0.2.0';

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
    const bookmarkMod = options.outlineBookmarksMod || resolveDep('__agSgOutlineBookmarks', './outline-bookmarks.js');
    const radarMod = options.sessionRadarMod || resolveDep('__agSgSessionRadar', './session-radar.js');

    // Coexistence auto-yield: if a host integrator (e.g. Obsidian Prism) already owns Session Guard, standalone yields cleanly
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

    let outlineBookmarks = null;
    let sessionRadar = null;

    const compactGuard = compactMod.createCompactGuardController({
      ...options,
      win,
      doc,
      coexist,
      onConfigChange: (nextCfg) => {
        outlineBookmarks?.setEnabled?.(Boolean(nextCfg.modules?.outlineBookmarks));
        sessionRadar?.setEnabled?.(Boolean(nextCfg.modules?.sessionRadar));
        sessionRadar?.setNotifyMode?.(nextCfg.radarNotifyMode || 'off');
        if (typeof options.onConfigChange === 'function') options.onConfigChange(nextCfg);
      },
    });
    const cfg = compactGuard.getConfig();

    outlineBookmarks = bookmarkMod.createOutlineBookmarksController({
      win,
      doc,
      storage: options.storage,
      coexist,
      enabled: Boolean(cfg.modules?.outlineBookmarks),
      autoObserve: options.autoObserve,
      getLang: options.getLang,
      onBookmarksChange: (ev) => {
        void compactGuard.evaluateNow();
        if (typeof options.onBookmarksChange === 'function') options.onBookmarksChange(ev);
      },
    });

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

    let destroyed = false;

    const api = {
      version: VERSION,
      source,
      yielded: false,
      compactGuard,
      outlineBookmarks,
      sessionRadar,
      evaluateNow: async () => {
        outlineBookmarks.sync();
        sessionRadar.syncFromDom();
        return compactGuard.evaluateNow();
      },
      updateConfig: (patch) => {
        const next = compactGuard.updateConfig(patch);
        outlineBookmarks.setEnabled(Boolean(next.modules?.outlineBookmarks));
        sessionRadar.setEnabled(Boolean(next.modules?.sessionRadar));
        sessionRadar.setNotifyMode(next.radarNotifyMode || 'off');
        return next;
      },
      getConfig: () => compactGuard.getConfig(),
      openSettingsPopover: () => compactGuard.openSettingsPopover(),
      getDebugState: () => ({
        version: VERSION,
        source,
        yielded: false,
        destroyed,
        compactGuard: compactGuard.getDebugState(),
        outlineBookmarks: outlineBookmarks.getDebugState(),
        sessionRadar: sessionRadar.getDebugState(),
      }),
      destroy() {
        if (destroyed) return;
        destroyed = true;
        compactGuard.destroy();
        outlineBookmarks.destroy();
        sessionRadar.destroy();
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
