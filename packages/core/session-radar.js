// Antigravity Session Guard — Session Radar Module Skeleton (Module B, default off, v0.2 ready)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.__agSgSessionRadar = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // Pure state-transition detector for multi-session attention radar (running -> awaiting_decision / idle)
  function detectAttentionTransitions(prevById, nextSessions) {
    const events = [];
    const nextMap = new Map();
    for (const s of Array.isArray(nextSessions) ? nextSessions : []) {
      if (!s || !s.id) continue;
      const status = String(s.status || 'idle');
      nextMap.set(s.id, status);
      const prev = prevById?.get?.(s.id) || null;
      if (prev && prev !== status) {
        if (status === 'awaiting_decision') {
          events.push({ type: 'awaiting_decision', id: s.id, title: s.title || '' });
        } else if (prev === 'running' && (status === 'idle' || status === 'completed')) {
          events.push({ type: 'completed', id: s.id, title: s.title || '' });
        }
      }
    }
    return { events, nextMap };
  }

  function createSessionRadarController(options = {}) {
    let enabled = Boolean(options.enabled);
    let destroyed = false;
    let prevStates = new Map();

    function sync(sessions = []) {
      if (destroyed || !enabled) return [];
      const { events, nextMap } = detectAttentionTransitions(prevStates, sessions);
      prevStates = nextMap;
      if (events.length && typeof options.onTransition === 'function') {
        for (const ev of events) options.onTransition(ev);
      }
      return events;
    }

    function setEnabled(v) {
      if (destroyed) return;
      enabled = Boolean(v);
      if (!enabled) prevStates.clear();
    }

    function destroy() {
      destroyed = true;
      enabled = false;
      prevStates.clear();
    }

    return {
      sync,
      setEnabled,
      getDebugState: () => ({ enabled, destroyed, trackedCount: prevStates.size }),
      destroy,
    };
  }

  return { detectAttentionTransitions, createSessionRadarController };
});
