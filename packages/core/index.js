// Antigravity Session Guard (领航哨) — Unified Modular Entrypoint (UMD)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSgCore = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  const VERSION = '0.1.0';

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

    const compactGuard = compactMod.createCompactGuardController({
      ...options,
      win,
      doc,
      coexist,
    });
    const cfg = compactGuard.getConfig();
    const sessionRadar = radarMod.createSessionRadarController({
      enabled: Boolean(cfg.modules?.sessionRadar),
      onTransition: options.onRadarTransition,
    });

    let destroyed = false;

    const api = {
      version: VERSION,
      source,
      yielded: false,
      compactGuard,
      sessionRadar,
      evaluateNow: () => compactGuard.evaluateNow(),
      updateConfig: (patch) => {
        const next = compactGuard.updateConfig(patch);
        sessionRadar.setEnabled(Boolean(next.modules?.sessionRadar));
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
        sessionRadar: sessionRadar.getDebugState(),
      }),
      destroy() {
        if (destroyed) return;
        destroyed = true;
        compactGuard.destroy();
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
