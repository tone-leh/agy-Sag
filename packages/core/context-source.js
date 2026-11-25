// Antigravity Session Guard — Context Telemetry & Host DOM State Adapter (UMD)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSgContextSource = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const DEFAULT_MAX_TOKENS = 512000;

  function isFiniteNum(v) {
    return typeof v === 'number' && Number.isFinite(v);
  }

  function formatTokens(n) {
    if (!isFiniteNum(n) || n < 0) return '—';
    if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
    return String(Math.round(n));
  }

  function detectCascadeId(doc, win) {
    try {
      const cv = doc?.querySelector?.('[data-testid="conversation-view"]');
      const cid =
        cv?.getAttribute?.('data-cascade-id') ||
        cv?.closest?.('[data-cascade-id]')?.getAttribute?.('data-cascade-id') ||
        doc?.querySelector?.('[data-cascade-id]')?.getAttribute?.('data-cascade-id') ||
        '';
      if (cid && GUID_RE.test(cid.trim())) return cid.trim().toLowerCase();
      const pathname = String(win?.location?.pathname || '');
      const m = pathname.match(/\/c\/([0-9a-f-]{36})/i);
      if (m && m[1]) return m[1].toLowerCase();
    } catch {}
    return 'default-session';
  }

  function isConversationView(doc, win) {
    if (!doc) return false;
    if (doc.querySelector?.('.agy-home, [data-testid="home-greeting"]')) return false;
    const pathname = String(win?.location?.pathname || '');
    if (pathname && !/\/c\/[0-9a-f-]{8,}/i.test(pathname)) {
      if (!doc.querySelector?.('[data-testid="conversation-view"], [data-cascade-id], [data-testid="agent-input-box"]')) {
        return false;
      }
    }
    return Boolean(
      doc.querySelector?.('[data-testid="conversation-view"], [data-testid="agent-input-box"], .surface-composer-card')
    );
  }

  function isTurnStreaming(doc) {
    if (!doc || typeof doc.querySelector !== 'function') return false;
    return Boolean(
      doc.querySelector(
        '[data-testid="agent-input-box"] [data-testid="input-cancel-button"], [data-testid="agent-input-box"] [data-testid="stop-button"], [data-testid="stop-button"], [data-testid="cancel-button"]'
      )
    );
  }

  function findComposerEditor(doc) {
    if (!doc || typeof doc.querySelector !== 'function') return null;
    const box = doc.querySelector('[data-testid="agent-input-box"], .surface-composer-card') || doc;
    return (
      box.querySelector('[data-lexical-editor="true"], [contenteditable="true"], textarea') ||
      doc.querySelector('[data-lexical-editor="true"], [contenteditable="true"], textarea')
    );
  }

  function readComposerDraft(doc) {
    const ed = findComposerEditor(doc);
    if (!ed) return '';
    const tag = String(ed.tagName || '').toUpperCase();
    const raw = tag === 'TEXTAREA' || tag === 'INPUT' ? ed.value : ed.textContent;
    return String(raw || '').replace(/\u200B/g, '').trim();
  }

  function readFromPulseShadowDom(doc) {
    if (!doc || typeof doc.querySelectorAll !== 'function') return null;
    const hosts = doc.querySelectorAll('#ag-prism-pulse-bar, [data-ag-prism-pulse-bar="true"], #ag-pulse-status-bar, [data-ag-pulse-bar="true"]');
    for (let i = 0; i < hosts.length; i++) {
      const sr = hosts[i]?.shadowRoot;
      if (!sr) continue;
      const pctText = sr.getElementById?.('context-percent')?.textContent || '';
      const pm = pctText.match(/(\d+(?:\.\d+)?)\s*%/);
      if (!pm) continue;
      const usedFraction = Number(pm[1]) / 100;
      if (!isFiniteNum(usedFraction)) continue;
      const tokText = sr.getElementById?.('context-tokens')?.textContent || '';
      const tm = tokText.match(/([\d.]+)\s*([kKmM]?)\s*\/\s*([\d.]+)\s*([kKmM]?)/);
      const parseUnit = (num, u) => {
        const base = Number(num);
        if (!isFiniteNum(base)) return null;
        if (u === 'm' || u === 'M') return Math.round(base * 1e6);
        if (u === 'k' || u === 'K') return Math.round(base * 1e3);
        return Math.round(base);
      };
      const maxTokens = tm ? parseUnit(tm[3], tm[4]) || DEFAULT_MAX_TOKENS : DEFAULT_MAX_TOKENS;
      const usedTokens = tm ? parseUnit(tm[1], tm[2]) : Math.round(usedFraction * maxTokens);
      return {
        source: 'pulse-dom',
        usedFraction,
        usedTokens,
        maxTokens,
        compactedCount: 0,
        compacted: false,
      };
    }
    return null;
  }

  function estimateFromConversationDom(doc) {
    if (!doc || typeof doc.querySelector !== 'function') return null;
    const vw = doc.querySelector('[data-testid="conversation-view"]');
    if (!vw) return null;
    let chars = 0;
    const nodes = vw.querySelectorAll?.(
      '[data-testid="user-message-bubble"], [data-testid="planner-response-text"], [data-testid="agent-response"]'
    );
    if (nodes && nodes.length > 0) {
      for (let i = 0; i < nodes.length; i++) {
        chars += String(nodes[i].textContent || '').length;
      }
    } else {
      chars = String(vw.textContent || '').length;
    }
    const maxTokens = DEFAULT_MAX_TOKENS;
    const usedTokens = Math.max(2000, Math.round(chars / 3.2) + 6000);
    return {
      source: 'dom-estimate',
      usedFraction: usedTokens / maxTokens,
      usedTokens,
      maxTokens,
      compactedCount: 0,
      compacted: false,
    };
  }

  function withTimeout(promise, ms) {
    return new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          resolve(null);
        }
      }, ms);
      timer?.unref?.();
      Promise.resolve(promise).then(
        (v) => {
          if (!done) {
            done = true;
            clearTimeout(timer);
            resolve(v || null);
          }
        },
        () => {
          if (!done) {
            done = true;
            clearTimeout(timer);
            resolve(null);
          }
        }
      );
    });
  }

  function extractFromBridgePayload(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const ctx = payload.speed?.context || payload.context || null;
    if (!ctx || typeof ctx !== 'object') return null;
    const maxTokens = isFiniteNum(ctx.maxTokens) && ctx.maxTokens > 0 ? ctx.maxTokens : DEFAULT_MAX_TOKENS;
    let usedFraction = isFiniteNum(ctx.usedFraction) ? ctx.usedFraction : null;
    let usedTokens = isFiniteNum(ctx.usedTokens) ? ctx.usedTokens : null;
    if (usedFraction === null && usedTokens !== null) usedFraction = usedTokens / maxTokens;
    if (usedTokens === null && usedFraction !== null) usedTokens = Math.round(usedFraction * maxTokens);
    if (usedFraction === null) return null;

    const compArr = payload.compactedAtStepIndices || payload.speed?.compactedAtStepIndices || ctx.compactedAtStepIndices;
    const compactedCount = Array.isArray(compArr) ? compArr.length : ctx.compacted ? 1 : 0;
    return {
      source: payload.connection === 'local-estimate' ? 'bridge-estimate' : 'host-bridge',
      usedFraction,
      usedTokens,
      maxTokens,
      model: ctx.model || payload.speed?.model || '',
      compactedCount,
      compacted: Boolean(ctx.compacted || ctx.estimatedAfterCompaction || compactedCount > 0),
    };
  }

  async function sampleContextState(opts = {}) {
    const win = opts.win || globalRoot;
    const doc = opts.doc || win?.document || null;
    const cascadeId = detectCascadeId(doc, win);
    const streaming = isTurnStreaming(doc);
    const draft = readComposerDraft(doc);

    // 1) Custom injected provider (used by host integrators & workbench simulator)
    if (typeof opts.getContextSnapshot === 'function') {
      const custom = await withTimeout(opts.getContextSnapshot({ cascadeId }), 1200);
      if (custom && isFiniteNum(custom.usedFraction)) {
        const maxTokens = isFiniteNum(custom.maxTokens) && custom.maxTokens > 0 ? custom.maxTokens : DEFAULT_MAX_TOKENS;
        const usedTokens = isFiniteNum(custom.usedTokens) ? custom.usedTokens : Math.round(custom.usedFraction * maxTokens);
        return {
          cascadeId: custom.cascadeId || cascadeId,
          streaming: custom.streaming !== undefined ? Boolean(custom.streaming) : streaming,
          draft: custom.draft !== undefined ? String(custom.draft) : draft,
          usedFraction: custom.usedFraction,
          usedPct: Math.round(Math.max(0, custom.usedFraction) * 100),
          usedTokens,
          maxTokens,
          model: custom.model || '',
          compactedCount: Number(custom.compactedCount) || 0,
          compacted: Boolean(custom.compacted),
          source: custom.source || 'custom',
        };
      }
    }

    // 2) Zero-overhead reuse of Obsidian Prism / AG Pulse existing metrics bridge
    const bridges = [win?.__agPrismMetricsBridge, win?.agPulseHost].filter((b) => b && typeof b.getMetrics === 'function');
    for (const bridge of bridges) {
      const latest = typeof bridge.getLatestSnapshot === 'function' ? bridge.getLatestSnapshot() : null;
      const fromLatest = extractFromBridgePayload(latest);
      const live = await withTimeout(bridge.getMetrics({ conversationId: cascadeId, force: false }), 1500);
      const parsed = extractFromBridgePayload(live) || fromLatest;
      if (parsed) {
        return {
          cascadeId,
          streaming,
          draft,
          ...parsed,
          usedPct: Math.round(Math.max(0, parsed.usedFraction) * 100),
        };
      }
    }

    // 3) Read Pulse bar shadow DOM if visible
    const fromDomBar = readFromPulseShadowDom(doc);
    if (fromDomBar) {
      return {
        cascadeId,
        streaming,
        draft,
        ...fromDomBar,
        usedPct: Math.round(Math.max(0, fromDomBar.usedFraction) * 100),
      };
    }

    // 4) Lightweight native conversation DOM fallback
    const est = estimateFromConversationDom(doc);
    if (est) {
      return {
        cascadeId,
        streaming,
        draft,
        ...est,
        usedPct: Math.round(Math.max(0, est.usedFraction) * 100),
      };
    }

    return null;
  }

  return {
    DEFAULT_MAX_TOKENS,
    formatTokens,
    detectCascadeId,
    isConversationView,
    isTurnStreaming,
    findComposerEditor,
    readComposerDraft,
    sampleContextState,
  };
});
