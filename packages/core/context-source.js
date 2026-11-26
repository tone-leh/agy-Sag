// Antigravity Session Guard — Context Telemetry & Multi-Pane Split View Host DOM Adapter (UMD)
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

  function isConnectedNode(el) {
    return Boolean(el && el.isConnected !== false);
  }

  function findPaneRootForNode(node, doc) {
    if (!isConnectedNode(node)) return null;
    let cur = node;
    for (let depth = 0; cur && depth < 8; depth++) {
      if (cur === doc?.body || cur === doc?.documentElement) break;
      const hasConv = Boolean(cur.getAttribute?.('data-testid') === 'conversation-view' || cur.querySelector?.('[data-testid="conversation-view"]'));
      const hasInput = Boolean(cur.getAttribute?.('data-testid') === 'agent-input-box' || cur.querySelector?.('[data-testid="agent-input-box"], .surface-composer-card'));
      if (hasConv && hasInput) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  function resolveActivePaneScope(doc, preferredNode = null) {
    if (!doc) return null;
    if (isConnectedNode(preferredNode)) {
      const fromPref = findPaneRootForNode(preferredNode, doc);
      if (fromPref) return fromPref;
    }
    const act = doc.activeElement;
    if (isConnectedNode(act) && act !== doc.body && act !== doc.documentElement) {
      const fromAct = findPaneRootForNode(act, doc);
      if (fromAct) return fromAct;
    }
    const focusedCv = doc.querySelector?.(
      '[data-testid="conversation-view"][data-focused="true"], [data-testid="conversation-view"][data-active="true"]'
    );
    if (isConnectedNode(focusedCv)) {
      const fromFocus = findPaneRootForNode(focusedCv, doc);
      if (fromFocus) return fromFocus;
    }
    const firstCv = doc.querySelector?.('[data-testid="conversation-view"]');
    if (isConnectedNode(firstCv)) {
      const fromFirst = findPaneRootForNode(firstCv, doc);
      if (fromFirst) return fromFirst;
    }
    return doc;
  }

  function resolveActiveConversationView(doc, scopeEl = null) {
    if (!doc) return null;
    const sc = isConnectedNode(scopeEl) ? scopeEl : resolveActivePaneScope(doc);
    if (sc?.getAttribute?.('data-testid') === 'conversation-view') return sc;
    return sc?.querySelector?.('[data-testid="conversation-view"]') || doc.querySelector?.('[data-testid="conversation-view"]') || null;
  }

  function detectCascadeId(doc, win, scopeEl = null) {
    try {
      const cv = resolveActiveConversationView(doc, scopeEl);
      const cvCid =
        cv?.getAttribute?.('data-cascade-id') ||
        cv?.closest?.('[data-cascade-id]')?.getAttribute?.('data-cascade-id') ||
        '';
      if (cvCid && GUID_RE.test(cvCid.trim())) return cvCid.trim().toLowerCase();
      const pathname = String(win?.location?.pathname || '');
      const m = pathname.match(/\/c\/([0-9a-f-]{36})/i);
      if (m && m[1]) return m[1].toLowerCase();
      const fallback = doc?.querySelector?.('[data-cascade-id]:not([data-testid="conversation-row-sidebar"])')?.getAttribute?.('data-cascade-id') || '';
      if (fallback && GUID_RE.test(fallback.trim())) return fallback.trim().toLowerCase();
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

  function isTurnStreaming(doc, scopeEl = null) {
    const root = isConnectedNode(scopeEl) ? scopeEl : doc;
    if (!root || typeof root.querySelector !== 'function') return false;
    return Boolean(
      root.querySelector(
        '[data-testid="agent-input-box"] [data-testid="input-cancel-button"], [data-testid="agent-input-box"] [data-testid="stop-button"], [data-testid="stop-button"], [data-testid="cancel-button"]'
      )
    );
  }

  function findComposerEditor(doc, scopeEl = null) {
    const root = isConnectedNode(scopeEl) ? scopeEl : doc;
    if (!root || typeof root.querySelector !== 'function') return null;
    const box = root.querySelector('[data-testid="agent-input-box"], .surface-composer-card') || root;
    return (
      box.querySelector('[data-lexical-editor="true"], [contenteditable="true"], textarea') ||
      root.querySelector('[data-lexical-editor="true"], [contenteditable="true"], textarea') ||
      (root !== doc ? doc?.querySelector?.('[data-lexical-editor="true"], [contenteditable="true"], textarea') : null)
    );
  }

  function readComposerDraft(doc, scopeEl = null) {
    const ed = findComposerEditor(doc, scopeEl);
    if (!ed) return '';
    const tag = String(ed.tagName || '').toUpperCase();
    const raw = tag === 'TEXTAREA' || tag === 'INPUT' ? ed.value : ed.textContent;
    return String(raw || '').replace(/\u200B/g, '').trim();
  }

  function readFromPulseShadowDom(doc, scopeEl = null) {
    const root = isConnectedNode(scopeEl) ? scopeEl : doc;
    if (!root || typeof root.querySelectorAll !== 'function') return null;
    const sel = '#ag-prism-pulse-bar, [data-ag-prism-pulse-bar="true"], #ag-pulse-status-bar, [data-ag-pulse-bar="true"]';
    let hosts = root.querySelectorAll(sel);
    if ((!hosts || hosts.length === 0) && root !== doc && doc?.querySelectorAll) {
      hosts = doc.querySelectorAll(sel);
    }
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

  function estimateFromConversationDom(doc, scopeEl = null) {
    const vw = resolveActiveConversationView(doc, scopeEl);
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
    const scopeEl = opts.scopeEl || resolveActivePaneScope(doc);
    const cascadeId = detectCascadeId(doc, win, scopeEl);
    const streaming = isTurnStreaming(doc, scopeEl);
    const draft = readComposerDraft(doc, scopeEl);

    // 1) Custom injected provider (used by host integrators & workbench simulator)
    if (typeof opts.getContextSnapshot === 'function') {
      const custom = await withTimeout(opts.getContextSnapshot({ cascadeId, scopeEl }), 1200);
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

    // 2) Zero-overhead reuse of Obsidian Prism / AG Pulse existing metrics bridge (scoped by active pane cascadeId)
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

    // 3) Read active pane's Pulse bar shadow DOM if visible
    const fromDomBar = readFromPulseShadowDom(doc, scopeEl);
    if (fromDomBar) {
      return {
        cascadeId,
        streaming,
        draft,
        ...fromDomBar,
        usedPct: Math.round(Math.max(0, fromDomBar.usedFraction) * 100),
      };
    }

    // 4) Lightweight native active conversation DOM fallback
    const est = estimateFromConversationDom(doc, scopeEl);
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
    findPaneRootForNode,
    resolveActivePaneScope,
    resolveActiveConversationView,
    detectCascadeId,
    isConversationView,
    isTurnStreaming,
    findComposerEditor,
    readComposerDraft,
    readFromPulseShadowDom,
    sampleContextState,
  };
});
