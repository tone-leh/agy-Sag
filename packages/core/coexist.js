// Antigravity Session Guard — Coexistence, Owner Yield & Idle Hibernation Contract (UMD)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSgCoexist = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  const OWNER_GLOBAL = '__agSessionGuardOwner';
  const INSTANCE_GLOBAL = '__agSessionGuard';
  const STORAGE_KEY = 'agSessionGuard.config.v1';

  const DEFAULT_CONFIG = Object.freeze({
    compactThreshold: 80, // 'off' | 50..98 (recommended default: 80%)
    compactTriggerMode: 'auto-silent', // 'auto-silent' | 'confirm' | 'fill-only' | 'auto-countdown'
    compactFocusPreset: 'default', // 'default' | 'code-errors' | 'bookmarks' | 'custom'
    customCompactFocus: '', // custom focus instructions appended after /compact (<= 240 chars)
    countdownSeconds: 3, // 2..15 (snappy default: 3s)
    rearmDeltaPct: 10, // re-notify after dismiss if usage climbs another +10%
    resetDropPct: 10, // auto-reset dismiss state if usage drops by >=10% below threshold
    stallThresholdSeconds: 180, // 'off' | 60..900 (3 min default)
    radarNotifyMode: 'off', // 'off' | 'awaiting' | 'all' (opt-in blurred OS notifications)
    modules: Object.freeze({
      compactGuard: true,
      precompactExport: true,
      outlineBookmarks: false, // opt-in: adds bookmark icon beside Copy/Undo in user action bar
      draftGuard: true, // unsent composer draft auto-save & crash recovery
      sessionRadar: false, // opt-in sidebar attention filter + alerts
      sessionWatchdog: true, // burn-rate estimate + streaming stall detector
    }),
  });

  function sanitizeConfig(raw, fallback = DEFAULT_CONFIG) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    let threshold = fallback.compactThreshold;
    if (src.compactThreshold === 'off' || src.compactThreshold === false || src.compactThreshold === 0) {
      threshold = 'off';
    } else if (src.compactThreshold !== undefined && src.compactThreshold !== null && src.compactThreshold !== '') {
      const n = Number(src.compactThreshold);
      if (Number.isFinite(n) && n >= 50 && n <= 98) threshold = Math.round(n);
    }

    const allowedModes = ['auto-silent', 'confirm', 'fill-only', 'auto-countdown'];
    const mode = allowedModes.includes(src.compactTriggerMode) ? src.compactTriggerMode : fallback.compactTriggerMode;

    const allowedPresets = ['default', 'code-errors', 'bookmarks', 'custom'];
    const compactFocusPreset = allowedPresets.includes(src.compactFocusPreset)
      ? src.compactFocusPreset
      : fallback.compactFocusPreset || 'default';

    const customCompactFocus =
      typeof src.customCompactFocus === 'string'
        ? src.customCompactFocus.replace(/[\r\n]+/g, ' ').trim().slice(0, 240)
        : fallback.customCompactFocus || '';

    const cdRaw = Number(src.countdownSeconds);
    const countdownSeconds = Number.isFinite(cdRaw) ? Math.max(2, Math.min(15, Math.round(cdRaw))) : fallback.countdownSeconds;

    const rearmRaw = Number(src.rearmDeltaPct);
    const rearmDeltaPct = Number.isFinite(rearmRaw) ? Math.max(3, Math.min(30, Math.round(rearmRaw))) : fallback.rearmDeltaPct;

    const dropRaw = Number(src.resetDropPct);
    const resetDropPct = Number.isFinite(dropRaw) ? Math.max(5, Math.min(30, Math.round(dropRaw))) : fallback.resetDropPct;

    let stallThresholdSeconds = fallback.stallThresholdSeconds !== undefined ? fallback.stallThresholdSeconds : 180;
    if (src.stallThresholdSeconds === 'off' || src.stallThresholdSeconds === false || src.stallThresholdSeconds === 0) {
      stallThresholdSeconds = 'off';
    } else if (src.stallThresholdSeconds !== undefined && src.stallThresholdSeconds !== null && src.stallThresholdSeconds !== '') {
      const s = Number(src.stallThresholdSeconds);
      if (Number.isFinite(s) && s >= 30 && s <= 900) stallThresholdSeconds = Math.round(s);
    }

    const allowedNotify = ['off', 'awaiting', 'all'];
    const radarNotifyMode = allowedNotify.includes(src.radarNotifyMode) ? src.radarNotifyMode : fallback.radarNotifyMode;

    const mSrc = src.modules && typeof src.modules === 'object' ? src.modules : {};
    const fbMods = fallback.modules || DEFAULT_CONFIG.modules;
    const modules = {
      compactGuard: mSrc.compactGuard !== undefined ? Boolean(mSrc.compactGuard) : fbMods.compactGuard,
      precompactExport: mSrc.precompactExport !== undefined ? Boolean(mSrc.precompactExport) : fbMods.precompactExport,
      outlineBookmarks: mSrc.outlineBookmarks !== undefined ? Boolean(mSrc.outlineBookmarks) : fbMods.outlineBookmarks,
      draftGuard: mSrc.draftGuard !== undefined ? Boolean(mSrc.draftGuard) : fbMods.draftGuard !== false,
      sessionRadar: mSrc.sessionRadar !== undefined ? Boolean(mSrc.sessionRadar) : fbMods.sessionRadar,
      sessionWatchdog: mSrc.sessionWatchdog !== undefined ? Boolean(mSrc.sessionWatchdog) : fbMods.sessionWatchdog !== false,
    };

    return {
      compactThreshold: threshold,
      compactTriggerMode: mode,
      compactFocusPreset,
      customCompactFocus,
      countdownSeconds,
      rearmDeltaPct,
      resetDropPct,
      stallThresholdSeconds,
      radarNotifyMode,
      modules,
    };
  }

  function shouldYieldToHostIntegrator(win, source = 'standalone') {
    const w = win || globalRoot;
    if (!w) return false;
    const owner = w[OWNER_GLOBAL];
    if (source === 'standalone' && typeof owner === 'string' && owner && owner !== 'standalone') {
      return true;
    }
    return false;
  }

  function isWindowHibernated(doc, win, blurredFlag = false) {
    if (blurredFlag) return true;
    if (doc?.hidden) return true;
    if (doc?.documentElement?.getAttribute?.('data-ag-cs-win-blur') === '1') return true;
    if (win && typeof win.document?.hasFocus === 'function' && win.document.hidden) return true;
    return false;
  }

  function markOwnedNoTranslate(el) {
    if (!el || typeof el.setAttribute !== 'function') return el;
    el.setAttribute('data-ag-sg-owned', '1');
    el.setAttribute('data-ag-no-i18n', '1');
    el.setAttribute('translate', 'no');
    el.setAttribute('data-no-translate', 'true');
    el.setAttribute('data-ag-localization-skip', 'true');
    el.setAttribute('data-agy-no-translate', 'true');
    el.setAttribute('data-antigravity-zh-skip', '1');
    return el;
  }

  function readStoredConfig(storage) {
    try {
      const raw = storage?.getItem?.(STORAGE_KEY);
      if (!raw) return null;
      return sanitizeConfig(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  function writeStoredConfig(storage, cfg) {
    try {
      storage?.setItem?.(STORAGE_KEY, JSON.stringify(sanitizeConfig(cfg)));
      return true;
    } catch {
      return false;
    }
  }

  function clearStoredConfig(storage) {
    try {
      storage?.removeItem?.(STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
  }

  return {
    OWNER_GLOBAL,
    INSTANCE_GLOBAL,
    STORAGE_KEY,
    DEFAULT_CONFIG,
    sanitizeConfig,
    shouldYieldToHostIntegrator,
    isWindowHibernated,
    markOwnedNoTranslate,
    readStoredConfig,
    writeStoredConfig,
    clearStoredConfig,
  };
});
