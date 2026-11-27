// agy-Sag — Read-Only Dual-Bucket Quota Pulse (UMD, zero network/credentials/deps)
// Strictly read-only UI signal parser + local 5h/7d activity ledger in localStorage.
// Never sends outbound requests, never inspects cookies/tokens/auth headers.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSagQuotaPulse = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  const STORAGE_KEY = 'agSag.quotaPulse.v1';
  const WINDOW_5H_MS = 5 * 60 * 60 * 1000;
  const WINDOW_7D_MS = 7 * 24 * 60 * 60 * 1000;
  const DEFAULT_SOFT_TURNS_5H = 60;
  const DEFAULT_SOFT_TURNS_7D = 350;
  const OBSERVED_NO_RESET_TTL_MS = 15 * 60 * 1000;
  const OBSERVED_PCT_TTL_MS = 60 * 60 * 1000;
  const MAX_RAW_ENTRIES = 400;
  const KEEP_RECENT_RAW_ENTRIES = 60;
  const MINUTE_BUCKET_MS = 60 * 1000;
  const ARCHIVE_BUCKET_MS = 60 * 60 * 1000;

  const HTTP_429_BEFORE_RE =
    /(?:\b(?:http|status|error|err|code|rate|too\s+many|limit|quota|throttl(?:e|ed|ing))\b|(?:状态码|错误|限流|配额))[^.\n]{0,24}\b429\b/i;
  const HTTP_429_AFTER_RE =
    /\b429\b[^.\n]{0,24}(?:\b(?:too\s+many|rate|limit|quota|error|exceeded|throttl(?:e|ed|ing))\b|(?:限流|错误|配额|请求过于频繁))/i;

  const SIGNAL_SELECTORS = [
    '[role="alert"]',
    '[role="status"]',
    '[aria-live]',
    '[data-testid*="toast"]',
    '[data-testid*="alert"]',
    '[data-testid*="error"]',
    '[data-testid*="banner"]',
    '[data-testid*="quota"]',
    '[data-testid*="limit"]',
    '.toast',
    '.alert',
    '.notification',
  ].join(', ');

  function parseResetSeconds(text) {
    const src = String(text || '');

    // English countdown phrases: "Resets in 2h 15m", "Resets in 45m", "Resets in 3d 4h", "Try again in 1h 30m"
    const enPrefix =
      /\b(?:resets?|refreshes?|renews?|try\s+again|available(?:\s+again)?|retry)\s+(?:in|after)\s+((?:\d+\s*(?:d(?:ays?)?|h(?:rs?|ours?)?|m(?:ins?|inutes?)?|s(?:ecs?|econds?)?)\b[\s,]*)+)/i;
    const enMatch = enPrefix.exec(src);
    if (enMatch && enMatch[1]) {
      let total = 0;
      const unitRe = /(\d+)\s*(d(?:ays?)?|h(?:rs?|ours?)?|m(?:ins?|inutes?)?|s(?:ecs?|econds?)?)\b/gi;
      let m;
      while ((m = unitRe.exec(enMatch[1])) !== null) {
        const val = Number(m[1]);
        const unit = m[2].toLowerCase()[0];
        if (!Number.isFinite(val) || val < 0) continue;
        if (unit === 'd') total += val * 86400;
        else if (unit === 'h') total += val * 3600;
        else if (unit === 'm') total += val * 60;
        else if (unit === 's') total += val;
      }
      if (total > 0) return Math.round(total);
    }

    // Chinese countdown phrases: "2小时15分钟后重置", "45分钟后恢复", "3天4小时后重置"
    const zhPrefix = /((?:\d+\s*(?:天|小时|分钟?|秒)\s*)+)后\s*(?:重置|恢复|刷新)/;
    const zhMatch = zhPrefix.exec(src);
    if (zhMatch && zhMatch[1]) {
      let total = 0;
      const zhUnitRe = /(\d+)\s*(天|小时|分钟?|秒)/g;
      let m;
      while ((m = zhUnitRe.exec(zhMatch[1])) !== null) {
        const val = Number(m[1]);
        const unit = m[2];
        if (!Number.isFinite(val) || val < 0) continue;
        if (unit === '天') total += val * 86400;
        else if (unit === '小时') total += val * 3600;
        else if (unit.startsWith('分')) total += val * 60;
        else if (unit === '秒') total += val;
      }
      if (total > 0) return Math.round(total);
    }

    return null;
  }

  function parseObservedPct(text) {
    // Strip non-quota resource usage phrases so "Context usage: 78%" / "CPU usage: 45%" are never misread as quota
    const src = String(text || '').replace(/\b(?:context|memory|cpu|disk|ram|gpu|battery)\s+usage\b[^.,;\n]*/gi, '');
    // Require quota/usage/limit keyword near percentage so generic percentages like "Build 78%" are ignored
    const patterns = [
      /\b(?:weekly|7[\s-]?d(?:ay)?|5[\s-]?h(?:our)?|rolling|daily)?\s*(?:quota|usage|limit|allowance|budget)(?:\s+(?:used|usage|consumed|reached|at))?\s*[:\-]?\s*(\d{1,3}(?:\.\d+)?)\s*%/i,
      /(\d{1,3}(?:\.\d+)?)\s*%\s*(?:of\s+)?(?:(?:your|the)\s+)?(?:weekly|7[\s-]?d(?:ay)?|5[\s-]?h(?:our)?|rolling)?\s*(?:quota|usage\s+limit|limit|allowance)/i,
      /(?:周配额|5小时配额|配额|额度)(?:已用|使用率|消耗)?\s*[:：]?\s*(\d{1,3}(?:\.\d+)?)\s*%/,
    ];

    for (const re of patterns) {
      const m = re.exec(src);
      if (m && m[1] !== undefined) {
        const val = Number(m[1]);
        if (Number.isFinite(val) && val >= 0 && val <= 100) {
          return Math.round(val);
        }
      }
    }
    return null;
  }

  function detectRateLimited(text) {
    const src = String(text || '');
    return (
      HTTP_429_BEFORE_RE.test(src) ||
      HTTP_429_AFTER_RE.test(src) ||
      /\btoo\s+many\s+requests\b/i.test(src) ||
      /\brate\s*limit(?:\s+(?:exceeded|reached|hit))?\b/i.test(src) ||
      /\bquota\s+(?:exceeded|exhausted|reached|depleted)\b/i.test(src) ||
      /\b(?:weekly|5[\s-]?h(?:our)?|usage)\s+limit(?:\s+(?:reached|exceeded|hit))?\b/i.test(src) ||
      /(?:触发限流|配额已用尽|配额超限|周配额已达上限|请求过于频繁)/.test(src)
    );
  }

  function detectBucket(text, resetSeconds) {
    const src = String(text || '');
    if (/\b(?:weekly|7[\s-]?d(?:ay)?s?|per\s+week|this\s+week)\b/i.test(src) || /(?:周配额|每周)/.test(src)) {
      return 'weekly';
    }
    if (/\b(?:5[\s-]?h(?:our|r)?s?|rolling\s+window|short[\s-]?term\s+quota)\b/i.test(src) || /(?:5\s*小时|短期配额)/.test(src)) {
      return '5h';
    }
    if (typeof resetSeconds === 'number' && Number.isFinite(resetSeconds) && resetSeconds > 5 * 3600) {
      return 'weekly';
    }
    return 'unknown';
  }

  function parseQuotaSignalsFromText(text) {
    const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) {
      return {
        matched: false,
        rateLimited: false,
        bucket: 'unknown',
        resetSeconds: null,
        observedPct: null,
        rawSnippet: '',
      };
    }

    const resetSeconds = parseResetSeconds(cleaned);
    const rateLimited = detectRateLimited(cleaned);
    const observedPct = parseObservedPct(cleaned);
    const matched = Boolean(rateLimited || resetSeconds !== null || observedPct !== null);
    const bucket = matched ? detectBucket(cleaned, resetSeconds) : 'unknown';

    return {
      matched,
      rateLimited,
      bucket,
      resetSeconds,
      observedPct,
      rawSnippet: matched ? cleaned.slice(0, 160) : '',
    };
  }

  function normalizePositiveLimit(val, fallback) {
    const n = Number(val);
    if (!Number.isFinite(n) || n < 1) return fallback;
    return Math.round(n);
  }

  function roundRatio(n) {
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 10000) / 10000;
  }

  function parseOptionalFiniteNumber(val) {
    if (val === null || val === undefined || val === '' || typeof val === 'boolean') return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  }

  function compactEntriesByBucket(items, bucketMs) {
    const bucketMap = new Map();
    for (const item of items) {
      const key = Math.floor(item.ts / bucketMs);
      const prev = bucketMap.get(key);
      if (prev) {
        if (item.ts > prev.ts) prev.ts = item.ts;
        prev.turns += item.turns;
        prev.tokens += item.tokens;
      } else {
        bucketMap.set(key, { ts: item.ts, turns: item.turns, tokens: item.tokens });
      }
    }
    return [...bucketMap.values()];
  }

  function createEmptyObserved() {
    return {
      rateLimited: false,
      bucket: 'unknown',
      resetAt: null,
      observedPct: null,
      observedAt: null,
      snippet: '',
    };
  }

  function isOwnedNode(el) {
    let cur = el;
    let guard = 0;
    while (cur && guard < 64) {
      guard += 1;
      const ownedSg = cur.getAttribute?.('data-ag-sg-owned');
      const ownedSag = cur.getAttribute?.('data-ag-sag-owned');
      if (ownedSg === '1' || ownedSag === '1') return true;
      cur = cur.parentElement || null;
    }
    return false;
  }

  function isHiddenNode(el) {
    let cur = el;
    let guard = 0;
    while (cur && guard < 64) {
      guard += 1;
      if (cur.hidden === true) return true;
      try {
        if (cur.getAttribute?.('aria-hidden') === 'true') return true;
        if (cur.hasAttribute?.('hidden') && cur.hidden !== false) return true;
      } catch {}
      const display = cur.style?.display;
      if (typeof display === 'string' && display.trim().toLowerCase() === 'none') return true;
      const visibility = cur.style?.visibility;
      if (typeof visibility === 'string' && visibility.trim().toLowerCase() === 'hidden') return true;
      cur = cur.parentElement || null;
    }
    return false;
  }

  function createQuotaPulseController(options = {}) {
    const win = options.win || globalRoot || null;
    const doc = options.doc || win?.document || null;
    const nowFn = typeof options.now === 'function' ? options.now : () => Date.now();
    const onChange = typeof options.onChange === 'function' ? options.onChange : null;

    function resolveStorage() {
      if (options.storage !== undefined) return options.storage;
      try {
        return win?.localStorage || null;
      } catch {
        return null;
      }
    }

    const storage = resolveStorage();

    let enabled = Boolean(options.enabled === true);
    let destroyed = false;
    let softTurns5h = normalizePositiveLimit(options.softTurns5h, DEFAULT_SOFT_TURNS_5H);
    let softTurns7d = normalizePositiveLimit(options.softTurns7d, DEFAULT_SOFT_TURNS_7D);

    // Compact entries: { ts: number, turns: number, tokens: number }
    let entries = [];
    let observed = createEmptyObserved();
    let loaded = false;
    let lastScanAt = null;

    function currentNow() {
      const n = Number(nowFn());
      return Number.isFinite(n) ? n : Date.now();
    }

    function pruneEntries(nowMs) {
      const cutoff7d = nowMs - WINDOW_7D_MS;
      const cutoff5h = nowMs - WINDOW_5H_MS;
      const futureGuard = nowMs + 60 * 1000;
      const recent = [];
      const older = [];

      for (const item of entries) {
        if (!item || !Number.isFinite(item.ts)) continue;
        if (item.ts < cutoff7d || item.ts > futureGuard) continue;
        const turns = Number(item.turns);
        const tokens = Number(item.tokens);
        if (!Number.isFinite(turns) || turns <= 0) continue;
        const clean = {
          ts: item.ts,
          turns,
          tokens: Number.isFinite(tokens) && tokens > 0 ? Math.round(tokens) : 0,
        };
        if (clean.ts >= cutoff5h) {
          recent.push(clean);
        } else {
          older.push(clean);
        }
      }

      const totalKept = recent.length + older.length;
      let nextOlder = older;
      let nextRecent = recent;

      // Compact older (> 5h) entries into 1-hour buckets once total count exceeds threshold
      if (totalKept > MAX_RAW_ENTRIES && older.length > 0) {
        nextOlder = compactEntriesByBucket(older, ARCHIVE_BUCKET_MS);
      }

      // Cap 5h window raw entries at MAX_RAW_ENTRIES by folding older 5h entries into 60s minute buckets
      if (recent.length > MAX_RAW_ENTRIES) {
        recent.sort((a, b) => a.ts - b.ts);
        const splitIdx = Math.max(0, recent.length - KEEP_RECENT_RAW_ENTRIES);
        const olderRecent = compactEntriesByBucket(recent.slice(0, splitIdx), MINUTE_BUCKET_MS);
        const tailRecent = recent.slice(splitIdx);
        const combinedRecent = [...olderRecent, ...tailRecent];
        nextRecent =
          combinedRecent.length > MAX_RAW_ENTRIES ? compactEntriesByBucket(combinedRecent, MINUTE_BUCKET_MS) : combinedRecent;
      }

      entries = [...nextOlder, ...nextRecent].sort((a, b) => a.ts - b.ts);
    }

    function loadFromStorage() {
      if (loaded) return;
      loaded = true;
      if (!storage || typeof storage.getItem !== 'function') return;
      try {
        const raw = storage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return;
        if (Array.isArray(parsed.entries)) {
          entries = parsed.entries
            .map((row) => {
              if (Array.isArray(row)) {
                return { ts: Number(row[0]), turns: Number(row[1]), tokens: Number(row[2] || 0) };
              }
              if (row && typeof row === 'object') {
                return { ts: Number(row.ts), turns: Number(row.turns), tokens: Number(row.tokens || 0) };
              }
              return null;
            })
            .filter(Boolean);
        }
        if (parsed.observed && typeof parsed.observed === 'object') {
          const parsedPct = parseOptionalFiniteNumber(parsed.observed.observedPct);
          observed = {
            rateLimited: Boolean(parsed.observed.rateLimited),
            bucket: ['5h', 'weekly', 'unknown'].includes(parsed.observed.bucket) ? parsed.observed.bucket : 'unknown',
            resetAt: parseOptionalFiniteNumber(parsed.observed.resetAt),
            observedPct: parsedPct !== null ? Math.max(0, Math.min(100, Math.round(parsedPct))) : null,
            observedAt: parseOptionalFiniteNumber(parsed.observed.observedAt),
            snippet: typeof parsed.observed.snippet === 'string' ? parsed.observed.snippet.slice(0, 160) : '',
          };
        }
        pruneEntries(currentNow());
      } catch {
        entries = [];
        observed = createEmptyObserved();
      }
    }

    function saveToStorage() {
      if (!storage || typeof storage.setItem !== 'function') return false;
      try {
        const compactEntries = entries.map((e) => [e.ts, e.turns, e.tokens]);
        const payload = {
          v: 1,
          entries: compactEntries,
          observed,
        };
        storage.setItem(STORAGE_KEY, JSON.stringify(payload));
        return true;
      } catch {
        return false;
      }
    }

    function computeEffectiveObserved(nowMs) {
      if (!observed.observedAt) {
        return {
          rateLimited: false,
          bucket: 'unknown',
          resetAt: null,
          remainingSec: null,
          observedPct: null,
          source: 'none',
        };
      }

      const ageMs = nowMs - observed.observedAt;
      let rateLimited = Boolean(observed.rateLimited);
      let resetAt = observed.resetAt;
      let remainingSec = null;
      let observedPct = observed.observedPct;

      if (resetAt !== null) {
        const diffSec = Math.ceil((resetAt - nowMs) / 1000);
        if (diffSec <= 0) {
          // Cooldown window has elapsed
          rateLimited = false;
          resetAt = null;
          remainingSec = 0;
          observedPct = null;
        } else {
          remainingSec = diffSec;
        }
      } else if (rateLimited && ageMs > OBSERVED_NO_RESET_TTL_MS) {
        rateLimited = false;
      }

      if (observedPct !== null && resetAt === null && ageMs > OBSERVED_PCT_TTL_MS) {
        observedPct = null;
      }

      const hasActiveSignal = Boolean(rateLimited || (resetAt !== null && remainingSec > 0) || observedPct !== null);
      if (!hasActiveSignal) {
        return {
          rateLimited: false,
          bucket: 'unknown',
          resetAt: null,
          remainingSec: null,
          observedPct: null,
          source: 'none',
        };
      }

      return {
        rateLimited,
        bucket: observed.bucket || 'unknown',
        resetAt,
        remainingSec,
        observedPct,
        source: 'observed-ui',
      };
    }

    function getSummary() {
      if (enabled && !destroyed) loadFromStorage();
      const nowMs = currentNow();
      pruneEntries(nowMs);

      const cutoff5h = nowMs - WINDOW_5H_MS;
      const cutoff7d = nowMs - WINDOW_7D_MS;

      let turns5h = 0;
      let tokens5h = 0;
      let turns7d = 0;
      let tokens7d = 0;

      for (const item of entries) {
        if (item.ts >= cutoff7d && item.ts <= nowMs + 60 * 1000) {
          turns7d += item.turns;
          tokens7d += item.tokens;
          if (item.ts >= cutoff5h) {
            turns5h += item.turns;
            tokens5h += item.tokens;
          }
        }
      }

      const warn5hRatio = roundRatio(turns5h / softTurns5h);
      const warn7dRatio = roundRatio(turns7d / softTurns7d);
      const obs = computeEffectiveObserved(nowMs);

      const maxLocalRatio = Math.max(warn5hRatio, warn7dRatio);
      const obsPct = obs.observedPct;

      let health = 'ok';
      let adviceKey = 'none';

      if (obs.rateLimited || (obsPct !== null && obsPct >= 100)) {
        health = 'limited';
        adviceKey = 'wait-reset';
      } else if (maxLocalRatio >= 0.85 || (obsPct !== null && obsPct >= 85)) {
        health = 'warn';
        adviceKey = 'switch-light-model';
      } else if (maxLocalRatio >= 0.6 || (obsPct !== null && obsPct >= 60)) {
        health = 'warm';
        adviceKey = 'enable-compact';
      }

      return {
        enabled,
        observed: obs,
        localEstimate: {
          turns5h,
          tokens5h,
          turns7d,
          tokens7d,
          warn5hRatio,
          warn7dRatio,
          source: 'local-estimate',
        },
        limits: {
          softTurns5h,
          softTurns7d,
        },
        health,
        adviceKey,
      };
    }

    function recordTurn(ev = {}) {
      if (destroyed || !enabled) return null;
      loadFromStorage();

      const nowMs = currentNow();
      const tsCand = parseOptionalFiniteNumber(ev?.ts);
      const ts = tsCand !== null ? tsCand : nowMs;
      const rawDelta = Number(ev?.deltaTokens ?? 0);
      const deltaTokens = Number.isFinite(rawDelta) && rawDelta > 0 ? Math.round(rawDelta) : 0;

      entries.push({
        ts,
        turns: 1,
        tokens: deltaTokens,
      });

      pruneEntries(nowMs);
      saveToStorage();

      const summary = getSummary();
      try {
        onChange?.(summary);
      } catch {}
      return summary;
    }

    function applyObservedSignal(signal, nowMs) {
      if (!signal || !signal.matched) return false;
      const resetAt =
        typeof signal.resetSeconds === 'number' && Number.isFinite(signal.resetSeconds) && signal.resetSeconds > 0
          ? nowMs + signal.resetSeconds * 1000
          : observed.resetAt && observed.resetAt > nowMs
            ? observed.resetAt
            : null;

      observed = {
        rateLimited: Boolean(signal.rateLimited),
        bucket: signal.bucket !== 'unknown' ? signal.bucket : observed.bucket || 'unknown',
        resetAt,
        observedPct: signal.observedPct !== null ? signal.observedPct : signal.rateLimited ? observed.observedPct : null,
        observedAt: nowMs,
        snippet: signal.rawSnippet || '',
      };

      saveToStorage();
      return true;
    }

    function scanDomForSignals() {
      if (destroyed || !enabled) {
        return { scanned: false, matched: false, signal: null };
      }
      loadFromStorage();
      const nowMs = currentNow();
      lastScanAt = nowMs;

      if (!doc || typeof doc.querySelectorAll !== 'function') {
        return { scanned: false, matched: false, signal: null };
      }

      let nodes = [];
      try {
        nodes = Array.from(doc.querySelectorAll(SIGNAL_SELECTORS) || []);
      } catch {
        nodes = [];
      }

      let best = null;
      let bestScore = -1;

      for (const el of nodes) {
        if (!el || isHiddenNode(el) || isOwnedNode(el)) continue;
        const txt = String(el.textContent || '').trim();
        if (!txt || txt.length > 1500) continue;
        const sig = parseQuotaSignalsFromText(txt);
        if (!sig.matched) continue;

        const score =
          (sig.rateLimited ? 100 : 0) +
          (sig.resetSeconds !== null ? 20 : 0) +
          (sig.observedPct !== null ? 10 : 0) +
          (sig.bucket !== 'unknown' ? 5 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = sig;
        }
      }

      if (best) {
        applyObservedSignal(best, nowMs);
        const summary = getSummary();
        try {
          onChange?.(summary);
        } catch {}
        return { scanned: true, matched: true, signal: best, summary };
      }

      return { scanned: true, matched: false, signal: null };
    }

    function setEnabled(next) {
      if (destroyed) return false;
      enabled = Boolean(next);
      if (enabled) {
        loadFromStorage();
      }
      return enabled;
    }

    function updateLimits(patch = {}) {
      if (destroyed) return { softTurns5h, softTurns7d };
      if (patch && patch.softTurns5h !== undefined) {
        softTurns5h = normalizePositiveLimit(patch.softTurns5h, softTurns5h);
      }
      if (patch && patch.softTurns7d !== undefined) {
        softTurns7d = normalizePositiveLimit(patch.softTurns7d, softTurns7d);
      }
      return { softTurns5h, softTurns7d };
    }

    function resetLedger() {
      entries = [];
      observed = createEmptyObserved();
      loaded = true;
      try {
        storage?.removeItem?.(STORAGE_KEY);
      } catch {}
      return true;
    }

    function getDebugState() {
      return {
        enabled,
        destroyed,
        storageKey: STORAGE_KEY,
        hasStorage: Boolean(storage),
        loaded,
        entryCount: entries.length,
        limits: { softTurns5h, softTurns7d },
        observed: { ...observed },
        lastScanAt,
      };
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      enabled = false;
      entries = [];
      observed = createEmptyObserved();
      loaded = false;
      lastScanAt = null;
    }

    if (enabled) {
      loadFromStorage();
    }

    return {
      setEnabled,
      updateLimits,
      recordTurn,
      scanDomForSignals,
      resetLedger,
      getSummary,
      getDebugState,
      destroy,
    };
  }

  return {
    STORAGE_KEY,
    WINDOW_5H_MS,
    WINDOW_7D_MS,
    DEFAULT_SOFT_TURNS_5H,
    DEFAULT_SOFT_TURNS_7D,
    MAX_RAW_ENTRIES,
    parseQuotaSignalsFromText,
    createQuotaPulseController,
  };
});
