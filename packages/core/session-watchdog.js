// agy-Sag — Turn Stall Watchdog (+5m Snooze & Elapsed Duration) & Context Burn-Rate Estimator (UMD, zero runtime deps)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSgSessionWatchdog = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const SPIKE_DELTA_PCT = 18;
  const MAX_DELTAS = 5;
  const DEFAULT_SNOOZE_SECONDS = 300;

  function computeConversationFingerprint(doc, snap, scopeEl = null) {
    let textLen = 0;
    let nodeCount = 0;
    if (doc && typeof doc.querySelector === 'function') {
      const scopedConv =
        scopeEl && scopeEl.isConnected !== false
          ? scopeEl.getAttribute?.('data-testid') === 'conversation-view'
            ? scopeEl
            : scopeEl.querySelector?.('[data-testid="conversation-view"]')
          : null;
      const conv = scopedConv || doc.querySelector('[data-testid="conversation-view"]');
      if (conv && typeof conv.querySelectorAll === 'function') {
        const nodes = conv.querySelectorAll(
          '[data-testid="planner-response-text"], [data-testid="agent-response"], [data-testid="user-message-bubble"]'
        );
        nodeCount = nodes.length;
        const last = nodes[nodes.length - 1];
        if (last) textLen = String(last.textContent || '').length;
      }
    }
    const tok = Number(snap?.usedTokens) || 0;
    return `${nodeCount}:${textLen}:${tok}`;
  }

  function createSessionWatchdog(options = {}) {
    const nowFn = typeof options.now === 'function' ? options.now : () => Date.now();
    let enabled = options.enabled !== undefined ? Boolean(options.enabled) : true;
    let stallThresholdSeconds =
      options.stallThresholdSeconds === 'off' ? 'off' : Math.max(30, Number(options.stallThresholdSeconds) || 180);

    // Per-cascadeId tracking
    const stateByCid = new Map();

    const getState = (cid) => {
      const key = cid || 'default-session';
      let s = stateByCid.get(key);
      if (!s) {
        s = {
          lastPct: null,
          lastCompactedCount: 0,
          deltas: [],
          lastDeltaPct: 0,
          spikeDetected: false,
          streamingSince: null,
          lastProgressAt: null,
          lastFingerprint: '',
          elapsedSec: 0,
          stalled: false,
          stalledForSec: 0,
          stallAlertedForEpisode: false,
          stallDismissedForEpisode: false,
          snoozedUntilTs: null,
          snoozeCount: 0,
          lastTurnElapsedSec: null,
          lastTurnCompletedAt: null,
        };
        stateByCid.set(key, s);
      }
      return s;
    };

    function resetBurn(s) {
      s.deltas = [];
      s.lastDeltaPct = 0;
      s.spikeDetected = false;
    }

    function resetStall(s) {
      s.streamingSince = null;
      s.lastProgressAt = null;
      s.lastFingerprint = '';
      s.elapsedSec = 0;
      s.stalled = false;
      s.stalledForSec = 0;
      s.stallAlertedForEpisode = false;
      s.stallDismissedForEpisode = false;
      s.snoozedUntilTs = null;
      s.snoozeCount = 0;
    }

    function observe({ snap, doc = null, scopeEl = null, threshold = 80 } = {}) {
      if (!enabled || !snap) {
        return {
          avgDeltaPct: 0,
          estimatedTurnsLeft: null,
          spikeDetected: false,
          lastDeltaPct: 0,
          elapsedSec: 0,
          stalled: false,
          stalledForSec: 0,
          newlyStalled: false,
          stallDismissed: false,
          snoozed: false,
          snoozeRemainingSec: 0,
          snoozeCount: 0,
          lastTurnElapsedSec: null,
        };
      }

      const ts = nowFn();
      const s = getState(snap.cascadeId);
      const pct = Number(snap.usedPct) || 0;
      const compactedCount = Number(snap.compactedCount) || 0;

      // 1) Burn-rate & token spike tracking
      if (compactedCount > s.lastCompactedCount || (s.lastPct !== null && s.lastPct - pct >= 10)) {
        s.lastCompactedCount = Math.max(s.lastCompactedCount, compactedCount);
        resetBurn(s);
        s.lastPct = pct;
      } else if (s.lastPct === null) {
        s.lastPct = pct;
      } else if (pct > s.lastPct) {
        const delta = pct - s.lastPct;
        s.lastPct = pct;
        if (delta >= 1) {
          s.deltas.push(delta);
          if (s.deltas.length > MAX_DELTAS) s.deltas.shift();
          s.lastDeltaPct = delta;
          s.spikeDetected = delta >= SPIKE_DELTA_PCT;
        }
      }

      const avgDeltaPct =
        s.deltas.length > 0
          ? Math.round((s.deltas.reduce((a, b) => a + b, 0) / s.deltas.length) * 10) / 10
          : 0;

      let estimatedTurnsLeft = null;
      const thNum = threshold === 'off' ? null : Number(threshold);
      if (thNum !== null && Number.isFinite(thNum) && avgDeltaPct > 0) {
        if (pct < thNum) {
          estimatedTurnsLeft = Math.max(1, Math.ceil((thNum - pct) / avgDeltaPct));
        } else {
          estimatedTurnsLeft = 0;
        }
      }

      // 2) Streaming stall detection with +5m Snooze & elapsed duration tracking
      let newlyStalled = false;
      let snoozed = false;
      let snoozeRemainingSec = 0;

      if (!snap.streaming || stallThresholdSeconds === 'off') {
        if (!snap.streaming && s.streamingSince !== null) {
          s.lastTurnElapsedSec = Math.max(1, Math.round((ts - s.streamingSince) / 1000));
          s.lastTurnCompletedAt = ts;
        }
        resetStall(s);
      } else {
        const fp = computeConversationFingerprint(doc, snap, scopeEl);
        if (s.streamingSince === null) {
          s.streamingSince = ts;
          s.lastProgressAt = ts;
          s.lastFingerprint = fp;
          s.elapsedSec = 0;
          s.stalled = false;
          s.stalledForSec = 0;
          s.snoozedUntilTs = null;
          s.snoozeCount = 0;
        } else if (fp !== s.lastFingerprint) {
          s.lastFingerprint = fp;
          s.lastProgressAt = ts;
          s.elapsedSec = Math.max(0, Math.floor((ts - s.streamingSince) / 1000));
          s.stalled = false;
          s.stalledForSec = 0;
          s.stallAlertedForEpisode = false;
          s.stallDismissedForEpisode = false;
          s.snoozedUntilTs = null;
          s.snoozeCount = 0;
        } else {
          s.elapsedSec = Math.max(0, Math.floor((ts - s.streamingSince) / 1000));
          const idleSec = Math.max(0, Math.floor((ts - s.lastProgressAt) / 1000));
          s.stalledForSec = idleSec;

          if (s.snoozedUntilTs !== null && ts < s.snoozedUntilTs) {
            snoozed = true;
            snoozeRemainingSec = Math.max(1, Math.ceil((s.snoozedUntilTs - ts) / 1000));
            s.stalled = false;
          } else {
            if (s.snoozedUntilTs !== null && ts >= s.snoozedUntilTs) {
              s.snoozedUntilTs = null;
            }
            if (idleSec >= stallThresholdSeconds) {
              s.stalled = true;
              if (!s.stallAlertedForEpisode) {
                s.stallAlertedForEpisode = true;
                newlyStalled = true;
              }
            }
          }
        }
      }

      return {
        avgDeltaPct,
        estimatedTurnsLeft,
        spikeDetected: s.spikeDetected,
        lastDeltaPct: s.lastDeltaPct,
        elapsedSec: s.elapsedSec,
        stalled: s.stalled,
        stalledForSec: s.stalledForSec,
        newlyStalled,
        stallDismissed: s.stallDismissedForEpisode,
        snoozed,
        snoozeRemainingSec,
        snoozeCount: s.snoozeCount,
        lastTurnElapsedSec: s.lastTurnElapsedSec,
      };
    }

    function snoozeStall(cascadeId, snoozeSec = DEFAULT_SNOOZE_SECONDS) {
      const s = getState(cascadeId);
      const sec = Math.max(30, Math.min(3600, Math.round(Number(snoozeSec) || DEFAULT_SNOOZE_SECONDS)));
      const until = nowFn() + sec * 1000;
      s.snoozedUntilTs = until;
      s.snoozeCount += 1;
      s.stalled = false;
      s.stallAlertedForEpisode = false;
      s.stallDismissedForEpisode = false;
      return { snoozedUntilTs: until, snoozeSec: sec, snoozeCount: s.snoozeCount };
    }

    function dismissStall(cascadeId) {
      const s = getState(cascadeId);
      s.stallDismissedForEpisode = true;
      s.snoozedUntilTs = null;
    }

    function setConfig({ enabled: nextEnabled, stallThresholdSeconds: nextSec } = {}) {
      if (nextEnabled !== undefined) enabled = Boolean(nextEnabled);
      if (nextSec !== undefined) {
        stallThresholdSeconds = nextSec === 'off' ? 'off' : Math.max(30, Number(nextSec) || 180);
      }
      if (!enabled || stallThresholdSeconds === 'off') {
        for (const s of stateByCid.values()) resetStall(s);
      }
    }

    function resetAll() {
      stateByCid.clear();
    }

    function getDebugState(cascadeId = null) {
      const s = cascadeId ? stateByCid.get(cascadeId) : null;
      return {
        enabled,
        stallThresholdSeconds,
        trackedSessions: stateByCid.size,
        current: s
          ? {
              lastPct: s.lastPct,
              deltas: [...s.deltas],
              lastDeltaPct: s.lastDeltaPct,
              spikeDetected: s.spikeDetected,
              elapsedSec: s.elapsedSec,
              stalled: s.stalled,
              stalledForSec: s.stalledForSec,
              snoozedUntilTs: s.snoozedUntilTs,
              snoozeCount: s.snoozeCount,
              lastTurnElapsedSec: s.lastTurnElapsedSec,
            }
          : null,
      };
    }

    return {
      observe,
      snoozeStall,
      dismissStall,
      setConfig,
      resetAll,
      getDebugState,
    };
  }

  return {
    SPIKE_DELTA_PCT,
    DEFAULT_SNOOZE_SECONDS,
    computeConversationFingerprint,
    createSessionWatchdog,
  };
});
