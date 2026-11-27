// agy-Sag — Unified Modular Suite Entrypoint (UMD)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSgCore = factory(root);
    root.__agSagCore = root.__agSgCore;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  const VERSION = '1.0.0';

  function resolveDep(globalKey, relPath) {
    if (globalRoot && globalRoot[globalKey]) return globalRoot[globalKey];
    if (typeof require === 'function') {
      try {
        return require(relPath);
      } catch {
        return null;
      }
    }
    return null;
  }

  function mountSag(options = {}) {
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
    const hostI18nMod = options.hostI18nMod || resolveDep('__agSagHostI18n', './host-i18n.js');
    const promptQueueMod = options.promptQueueMod || resolveDep('__agSagPromptQueue', './prompt-queue.js');
    const safeAutoAcceptMod = options.safeAutoAcceptMod || resolveDep('__agSagSafeAutoAccept', './safe-auto-accept.js');
    const themeStudioMod = options.themeStudioMod || resolveDep('__agSagThemeStudio', './theme-studio.js');
    const quotaPulseMod = options.quotaPulseMod || resolveDep('__agSagQuotaPulse', './quota-pulse.js');
    const novSynergyMod = options.novSynergyMod || resolveDep('__agSagNovSynergy', './nov-synergy.js');

    // Coexistence auto-yield: if a host integrator (e.g. Obsidian Prism Channel 13) already owns agy-Sag, standalone yields cleanly
    if (coexist.shouldYieldToHostIntegrator(win, source)) {
      const owner = coexist.readHostOwner
        ? coexist.readHostOwner(win)
        : win?.[coexist.OWNER_GLOBAL] || win?.[coexist.LEGACY_OWNER_GLOBAL];
      return {
        version: VERSION,
        yielded: true,
        owner,
        destroy() {},
        getDebugState: () => ({ yielded: true, owner, version: VERSION }),
      };
    }

    // Replace any prior standalone instance losslessly
    try { win?.[coexist.INSTANCE_GLOBAL]?.destroy?.(); } catch {}
    if (coexist.LEGACY_INSTANCE_GLOBAL) {
      try { win?.[coexist.LEGACY_INSTANCE_GLOBAL]?.destroy?.(); } catch {}
    }

    // Migrate legacy agSessionGuard.* keys to agSag.* before sub-modules initialize
    try { coexist.migrateLegacyStorage?.(win?.localStorage); } catch {}
    try { coexist.migrateLegacyStorage?.(win?.sessionStorage); } catch {}
    if (options.storage && options.storage !== win?.localStorage && options.storage !== win?.sessionStorage) {
      try { coexist.migrateLegacyStorage?.(options.storage); } catch {}
    }

    let draftGuard = null;
    let cleanSlate = null;
    let outlineBookmarks = null;
    let bookmarkVault = null;
    let sessionRadar = null;
    let prismBridge = null;
    let statusPill = null;
    let hostI18n = null;
    let promptQueue = null;
    let safeAutoAccept = null;
    let themeStudio = null;
    let quotaPulse = null;
    let novSynergy = null;
    const quotaBySession = new Map();

    const openVault = () => bookmarkVault?.open?.();
    const syncStatusPill = () => {
      if (!statusPill) return;
      const cgState = compactGuard.getDebugState();
      const bmState = outlineBookmarks?.getDebugState?.() || null;
      const dgState = draftGuard?.getDebugState?.() || null;
      const pqState = promptQueue?.getDebugState?.() || null;
      const qpState = quotaPulse?.getSummary?.() || null;
      const aaState = safeAutoAccept?.getDebugState?.() || null;
      const hiState = hostI18n?.getDebugState?.() || null;
      statusPill.sync({
        snap: cgState.lastSnapshot || null,
        watchdog: cgState.watchdog || null,
        bookmarkCount: bmState?.bookmarkCount || 0,
        hasDraft: Boolean(dgState?.barVisible || (dgState?.savedDraftCount || 0) > 0),
        queueCount: pqState?.itemCount || 0,
        quotaHealth: qpState?.health || 'ok',
        autoAcceptActive: Boolean(aaState?.enabled && !aaState?.paused),
        hostLocale: hiState?.locale || 'en',
        synergyConnected: Boolean(novSynergy?.isConnected?.()),
      });
    };

    const syncSubModulesFromConfig = (nextCfg) => {
      draftGuard?.setEnabled?.(Boolean(nextCfg.modules?.draftGuard));
      outlineBookmarks?.setEnabled?.(Boolean(nextCfg.modules?.outlineBookmarks));
      sessionRadar?.setEnabled?.(Boolean(nextCfg.modules?.sessionRadar));
      sessionRadar?.setNotifyMode?.(nextCfg.radarNotifyMode || 'off');

      if (hostI18n) {
        hostI18n.setConflictPolicy?.(nextCfg.hostI18nConflictPolicy || 'yield');
        hostI18n.setCollectMissing?.(Boolean(nextCfg.hostI18nCollectMissing));
        hostI18n.setLocale?.(nextCfg.hostI18nLocale || 'auto');
        hostI18n.setEnabled?.(Boolean(nextCfg.modules?.hostI18n));
      }

      if (promptQueue) {
        promptQueue.setEnabled?.(Boolean(nextCfg.modules?.promptQueue));
      }

      if (safeAutoAccept) {
        safeAutoAccept.setPolicy?.(nextCfg.autoAcceptPolicy || 'readonly-safe');
        safeAutoAccept.setCustomAllowPatterns?.(nextCfg.autoAcceptCustomPatterns || []);
        safeAutoAccept.setDryRun?.(Boolean(nextCfg.autoAcceptDryRun));
        safeAutoAccept.setEnabled?.(Boolean(nextCfg.modules?.safeAutoAccept));
      }

      if (themeStudio) {
        themeStudio.updateSettings?.({
          preset: nextCfg.themePreset || 'native',
          cjkFontTuning: nextCfg.themeCjkFont !== false,
          density: nextCfg.themeDensity || 'balanced',
          compactSidebar: Boolean(nextCfg.themeCompactSidebar),
          wideReadable: Boolean(nextCfg.themeWideReadable),
          customCss: nextCfg.themeCustomCss || '',
          conflictPolicy: nextCfg.themeConflictPolicy || 'yield',
        });
        themeStudio.setEnabled?.(Boolean(nextCfg.modules?.themeStudio));
      }

      if (quotaPulse) {
        quotaPulse.updateLimits?.({
          softTurns5h: nextCfg.quotaSoftTurns5h || 60,
          softTurns7d: nextCfg.quotaSoftTurns7d || 350,
        });
        quotaPulse.setEnabled?.(Boolean(nextCfg.modules?.quotaPulse));
      }

      prismBridge?.sync?.();
      syncStatusPill();
    };

    const compactGuard = compactMod.createCompactGuardController({
      ...options,
      win,
      doc,
      coexist,
      prismBridgeMod,
      onOpenVault: openVault,
      onEvaluated: (snap) => {
        if (quotaPulse && compactGuard.getConfig().modules?.quotaPulse) {
          const usedTokens = Number(snap?.usedTokens);
          const cid = String(snap?.cascadeId || 'default');
          const streaming = Boolean(snap?.streaming);
          if (Number.isFinite(usedTokens) && usedTokens > 0) {
            const prev = quotaBySession.get(cid);
            if (!prev) {
              quotaBySession.set(cid, { usedTokens, streaming });
            } else if (!streaming) {
              // Record once per completed turn (or steady-state growth) per isolated cascadeId
              if (usedTokens > prev.usedTokens) {
                quotaPulse.recordTurn?.({
                  deltaTokens: usedTokens - prev.usedTokens,
                  cascadeId: cid,
                });
              }
              quotaBySession.set(cid, { usedTokens, streaming: false });
            } else {
              // While streaming, keep baseline usedTokens until turn finishes to avoid double-counting
              quotaBySession.set(cid, { usedTokens: prev.usedTokens, streaming: true });
            }
          }
          quotaPulse.scanDomForSignals?.();
        }
        if (promptQueue && compactGuard.getConfig().modules?.promptQueue && !snap?.streaming) {
          promptQueue.sync?.();
        }
        syncStatusPill();
      },
      onStallDetected: (ev) => {
        sessionRadar?.notifyStall?.(ev);
        syncStatusPill();
        if (typeof options.onStallDetected === 'function') options.onStallDetected(ev);
      },
      onConfigChange: (nextCfg) => {
        syncSubModulesFromConfig(nextCfg);
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

    hostI18n = hostI18nMod?.createHostI18nController
      ? hostI18nMod.createHostI18nController({
          win,
          doc,
          coexist,
          enabled: cfg.modules?.hostI18n !== false,
          locale: cfg.hostI18nLocale || 'auto',
          conflictPolicy: cfg.hostI18nConflictPolicy || 'yield',
          collectMissing: Boolean(cfg.hostI18nCollectMissing),
          autoObserve: options.autoObserve,
          customPacks: options.customHostI18nPacks,
        })
      : null;

    promptQueue = promptQueueMod?.createPromptQueueController
      ? promptQueueMod.createPromptQueueController({
          win,
          doc,
          storage: options.storage,
          coexist,
          enabled: cfg.modules?.promptQueue !== false,
          autoObserve: options.autoObserve,
          now: options.now,
          dispatchDelayMs: options.promptQueueDispatchDelayMs,
          getLang: options.getLang,
          isStreaming: () => Boolean(compactGuard.getDebugState()?.lastSnapshot?.streaming),
          onDispatch: options.onPromptQueueDispatch,
          onQueueChange: (ev) => {
            syncStatusPill();
            if (typeof options.onPromptQueueChange === 'function') options.onPromptQueueChange(ev);
          },
        })
      : null;

    safeAutoAccept = safeAutoAcceptMod?.createSafeAutoAcceptController
      ? safeAutoAcceptMod.createSafeAutoAcceptController({
          win,
          doc,
          coexist,
          enabled: Boolean(cfg.modules?.safeAutoAccept),
          policy: cfg.autoAcceptPolicy || 'readonly-safe',
          customAllowPatterns: cfg.autoAcceptCustomPatterns || [],
          dryRun: Boolean(cfg.autoAcceptDryRun),
          autoObserve: options.autoObserve,
          now: options.now,
          cooldownMs: options.autoAcceptCooldownMs,
          onDecision: (ev) => {
            syncStatusPill();
            if (typeof options.onAutoAcceptDecision === 'function') options.onAutoAcceptDecision(ev);
          },
        })
      : null;

    themeStudio = themeStudioMod?.createThemeStudioController
      ? themeStudioMod.createThemeStudioController({
          win,
          doc,
          coexist,
          enabled: Boolean(cfg.modules?.themeStudio),
          preset: cfg.themePreset || 'native',
          cjkFontTuning: cfg.themeCjkFont !== false,
          density: cfg.themeDensity || 'balanced',
          compactSidebar: Boolean(cfg.themeCompactSidebar),
          wideReadable: Boolean(cfg.themeWideReadable),
          customCss: cfg.themeCustomCss || '',
          conflictPolicy: cfg.themeConflictPolicy || 'yield',
        })
      : null;

    quotaPulse = quotaPulseMod?.createQuotaPulseController
      ? quotaPulseMod.createQuotaPulseController({
          win,
          doc,
          storage: options.storage,
          enabled: Boolean(cfg.modules?.quotaPulse),
          softTurns5h: cfg.quotaSoftTurns5h || 60,
          softTurns7d: cfg.quotaSoftTurns7d || 350,
          now: options.now,
        })
      : null;

    novSynergy = novSynergyMod?.createNovSynergyController
      ? novSynergyMod.createNovSynergyController({
          win,
          doc,
          novTransport: options.novTransport,
          initialState: options.novInitialState,
          requestTimeoutMs: options.novRequestTimeoutMs,
          autoRefresh: options.novAutoRefresh,
          now: options.now,
          getSagConfig: () => compactGuard.getConfig(),
          onStateChange: (novState) => {
            prismBridge?.sync?.();
            syncStatusPill();
            if (typeof options.onNovStateChange === 'function') options.onNovStateChange(novState);
          },
        })
      : null;

    statusPill = statusPillMod?.createStatusPillController
      ? statusPillMod.createStatusPillController({
          win,
          doc,
          coexist,
          novSynergy,
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
          storage: options.storage,
          coexist,
          novSynergy,
          novSynergyMod,
          autoObserve: options.autoObserve,
          getLang: options.getLang,
          getConfig: () => compactGuard.getConfig(),
          onUpdateConfig: (patch) => api.updateConfig(patch),
          onApplyPreset: (presetId) => api.applyPreset(presetId),
          onCopyText: options.onCopyText,
          getHostI18nState: () => hostI18n?.getDebugState?.() || null,
          getAutoAcceptState: () => safeAutoAccept?.getDebugState?.() || null,
          getQuotaSummary: () => quotaPulse?.getSummary?.() || null,
          onHostContextChange: () => {
            compactGuard.refreshUi?.();
            draftGuard?.sync?.();
            outlineBookmarks?.sync?.();
            sessionRadar?.syncFromDom?.();
            hostI18n?.scanNow?.();
            themeStudio?.sync?.();
            syncStatusPill();
          },
        })
      : null;

    let destroyed = false;

    const api = {
      version: VERSION,
      brand: 'agy-Sag',
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
      hostI18n,
      promptQueue,
      safeAutoAccept,
      themeStudio,
      quotaPulse,
      novSynergy,
      evaluateNow: async () => {
        draftGuard?.sync?.();
        cleanSlate?.sync?.();
        outlineBookmarks.sync();
        sessionRadar.syncFromDom();
        hostI18n?.scanNow?.();
        promptQueue?.sync?.();
        safeAutoAccept?.scanNow?.();
        themeStudio?.sync?.();
        quotaPulse?.scanDomForSignals?.();
        prismBridge?.sync?.();
        const snap = await compactGuard.evaluateNow();
        syncStatusPill();
        return snap;
      },
      updateConfig: (patch) => {
        // compactGuard.updateConfig already triggers onConfigChange -> syncSubModulesFromConfig
        return compactGuard.updateConfig(patch);
      },
      applyPreset: (presetId) => {
        const patch = coexist.resolvePresetPatch?.(presetId);
        if (!patch) return null;
        return api.updateConfig(patch);
      },
      setHostLocale: (locale) => {
        return api.updateConfig({
          hostI18nLocale: locale,
          modules: { ...api.getConfig().modules, hostI18n: locale !== 'en' },
        });
      },
      setNovModule: (id, enabled) => {
        if (!novSynergy?.setModule) return Promise.resolve({ ok: false, error: 'nov-synergy unavailable' });
        return novSynergy.setModule(id, enabled);
      },
      applyNovPreset: (preset) => {
        if (!novSynergy?.applyPreset) return Promise.resolve({ ok: false, error: 'nov-synergy unavailable' });
        return novSynergy.applyPreset(preset);
      },
      getSynergyEffects: () => {
        if (!novSynergy?.getSynergyEffects) return [];
        return novSynergy.getSynergyEffects(compactGuard.getConfig());
      },
      getCatalog: () => ({
        modules: coexist.MODULE_CATALOG || [],
        presets: coexist.PRESETS || {},
      }),
      getConfig: () => compactGuard.getConfig(),
      clearAndRestart: (opts) => cleanSlate?.triggerCleanClear?.(opts),
      copyNewSessionHandoff: () => compactGuard.copyNewSessionHandoff(),
      openStatusCard: () => statusPill?.open?.(),
      openSettingsPopover: () => compactGuard.openSettingsPopover(),
      openBookmarkVault: (q) => bookmarkVault?.open?.(q),
      getDebugState: () => ({
        version: VERSION,
        brand: 'agy-Sag',
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
        hostI18n: hostI18n?.getDebugState?.() || null,
        promptQueue: promptQueue?.getDebugState?.() || null,
        safeAutoAccept: safeAutoAccept?.getDebugState?.() || null,
        themeStudio: themeStudio?.getDebugState?.() || null,
        quotaPulse: quotaPulse?.getDebugState?.() || null,
        novSynergy: novSynergy?.getDebugState?.() || null,
      }),
      destroy() {
        if (destroyed) return;
        destroyed = true;
        statusPill?.destroy?.();
        prismBridge?.destroy?.();
        novSynergy?.destroy?.();
        hostI18n?.destroy?.();
        promptQueue?.destroy?.();
        safeAutoAccept?.destroy?.();
        themeStudio?.destroy?.();
        quotaPulse?.destroy?.();
        cleanSlate?.destroy?.();
        draftGuard?.destroy?.();
        compactGuard.destroy();
        outlineBookmarks.destroy();
        bookmarkVault?.destroy?.();
        sessionRadar.destroy();
        try { doc?.getElementById?.('ag-sg-core-css')?.remove?.(); } catch {}
        try { doc?.getElementById?.('ag-sag-theme-css')?.remove?.(); } catch {}
        try {
          if (win && win[coexist.INSTANCE_GLOBAL] === api) delete win[coexist.INSTANCE_GLOBAL];
          if (win && coexist.LEGACY_INSTANCE_GLOBAL && win[coexist.LEGACY_INSTANCE_GLOBAL] === api) {
            delete win[coexist.LEGACY_INSTANCE_GLOBAL];
          }
          if (win && win[coexist.OWNER_GLOBAL] === source) delete win[coexist.OWNER_GLOBAL];
          if (win && coexist.LEGACY_OWNER_GLOBAL && win[coexist.LEGACY_OWNER_GLOBAL] === source) {
            delete win[coexist.LEGACY_OWNER_GLOBAL];
          }
        } catch {}
      },
    };

    syncStatusPill();

    if (win) {
      win[coexist.INSTANCE_GLOBAL] = api;
      if (coexist.LEGACY_INSTANCE_GLOBAL) win[coexist.LEGACY_INSTANCE_GLOBAL] = api;
      if (source !== 'standalone') {
        win[coexist.OWNER_GLOBAL] = source;
        if (coexist.LEGACY_OWNER_GLOBAL) win[coexist.LEGACY_OWNER_GLOBAL] = source;
      }
    }
    return api;
  }

  return { VERSION, mountSag, mountSessionGuard: mountSag };
});
