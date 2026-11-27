// agy-Sag — Context Telemetry & Multi-Pane Split View Host DOM Adapter (UMD)
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

  function findConversationScrollViewport(doc, scopeEl = null) {
    if (!doc) return null;
    const cv = resolveActiveConversationView(doc, scopeEl);
    const sc = isConnectedNode(scopeEl) ? scopeEl : doc;
    const explicit =
      cv?.querySelector?.('[data-testid="autoscroll-viewport"]') ||
      sc?.querySelector?.('[data-testid="autoscroll-viewport"]') ||
      doc.querySelector?.('[data-testid="autoscroll-viewport"]') ||
      null;
    if (isConnectedNode(explicit)) return explicit;

    const isScrollableEl = (el) => {
      if (!isConnectedNode(el)) return false;
      const sh = Number(el.scrollHeight) || 0;
      const ch = Number(el.clientHeight) || 0;
      if (sh <= ch + 20) return false;
      try {
        const gcs = globalRoot?.getComputedStyle || doc?.defaultView?.getComputedStyle;
        if (typeof gcs === 'function') {
          const ov = String(gcs(el)?.overflowY || '');
          if (ov && !/(auto|scroll|overlay)/.test(ov)) return false;
        }
      } catch {}
      return true;
    };

    if (cv) {
      if (isScrollableEl(cv)) return cv;
      const children = cv.querySelectorAll?.('*') || [];
      for (let i = 0; i < children.length; i++) {
        if (isScrollableEl(children[i])) return children[i];
      }
    }
    return null;
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

  /**
   * Pure DOM local context breakdown (zero external calls, zero credentials).
   * Splits visible conversation text into user prompts, assistant prose, and code/tool output,
   * plus Top-3 heaviest turns for instant jump navigation.
   */
  function analyzeContextBreakdown(doc, scopeEl = null) {
    const vw = resolveActiveConversationView(doc, scopeEl);
    if (!vw || typeof vw.querySelectorAll !== 'function') return null;

    const userBubbles = Array.from(vw.querySelectorAll('[data-testid="user-message-bubble"]') || []);
    const assistantNodes = Array.from(
      vw.querySelectorAll('[data-testid="planner-response-text"], [data-testid="agent-response"]') || []
    );
    if (userBubbles.length === 0 && assistantNodes.length === 0) return null;

    const measureOwnedExcludedLen = (node) => {
      if (!node) return 0;
      const raw = String(node.textContent || '');
      let ownedLen = 0;
      const owned = node.querySelectorAll?.('[data-ag-sg-owned="1"], [data-ag-sag-owned="1"]') || [];
      for (let i = 0; i < owned.length; i++) {
        ownedLen += String(owned[i].textContent || '').length;
      }
      return Math.max(0, raw.length - ownedLen);
    };

    const measureCodeAndToolChars = (root) => {
      if (!root || typeof root.querySelectorAll !== 'function') return 0;
      const blocks = Array.from(
        root.querySelectorAll('pre, [data-testid*="tool"], [data-testid*="step"], details') || []
      );
      let total = 0;
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        if (b.getAttribute?.('data-ag-sg-owned') === '1' || b.getAttribute?.('data-ag-sag-owned') === '1') continue;
        // Skip nested match to avoid double counting (e.g., pre inside details)
        let nested = false;
        let p = b.parentElement;
        while (p && p !== root) {
          if (blocks.includes(p)) {
            nested = true;
            break;
          }
          p = p.parentElement;
        }
        if (nested) continue;
        total += measureOwnedExcludedLen(b);
      }
      return total;
    };

    let userChars = 0;
    let assistantChars = 0;
    let codeToolsChars = 0;

    // Also include standalone tool/step blocks inside conversation view not already inside assistantNodes
    for (let i = 0; i < userBubbles.length; i++) {
      userChars += measureOwnedExcludedLen(userBubbles[i]);
    }
    for (let i = 0; i < assistantNodes.length; i++) {
      const a = assistantNodes[i];
      const totalA = measureOwnedExcludedLen(a);
      const ct = Math.min(totalA, measureCodeAndToolChars(a));
      codeToolsChars += ct;
      assistantChars += Math.max(0, totalA - ct);
    }

    // Build per-turn weight list (pairing user turn i with assistant turn i when aligned)
    const turnWeights = [];
    for (let i = 0; i < userBubbles.length; i++) {
      const uNode = userBubbles[i];
      const aNode = assistantNodes[i] || null;
      const uLen = measureOwnedExcludedLen(uNode);
      const aLen = aNode ? measureOwnedExcludedLen(aNode) : 0;
      const tChars = uLen + aLen;
      const rawPreview = String(uNode.textContent || '').replace(/\s+/g, ' ').trim();
      turnWeights.push({
        turnNum: i + 1,
        chars: tChars,
        estTokens: Math.max(1, Math.round(tChars / 3.2)),
        preview: rawPreview.slice(0, 36),
        node: uNode,
      });
    }

    const totalChars = Math.max(1, userChars + assistantChars + codeToolsChars);
    const totalEstTokens = Math.max(1, Math.round(totalChars / 3.2));
    const userPct = Math.round((userChars / totalChars) * 100);
    const codeToolsPct = Math.round((codeToolsChars / totalChars) * 100);
    const assistantPct = Math.max(0, 100 - userPct - codeToolsPct);

    const topTurns = [...turnWeights]
      .filter((t) => t.chars > 0)
      .sort((a, b) => b.chars - a.chars || a.turnNum - b.turnNum)
      .slice(0, 3)
      .map((t) => ({
        ...t,
        pctOfChat: Math.max(1, Math.round((t.chars / totalChars) * 100)),
      }));

    return {
      totalChars,
      totalEstTokens,
      userChars,
      assistantChars,
      codeToolsChars,
      shares: {
        userPct,
        assistantPct,
        codeToolsPct,
      },
      turnCount: userBubbles.length,
      topTurns,
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
    const normCid = String(cascadeId || '').toLowerCase();
    const hasRealCid = GUID_RE.test(normCid);
    const extractPayloadCid = (p) =>
      String(
        p?.conversationId ||
        p?.cascadeId ||
        p?.speed?.conversationId ||
        p?.speed?.cascadeId ||
        p?.context?.conversationId ||
        ''
      ).trim().toLowerCase();
    const bridges = [win?.__agPrismMetricsBridge, win?.agPulseHost].filter((b) => b && typeof b.getMetrics === 'function');
    for (const bridge of bridges) {
      const latest = typeof bridge.getLatestSnapshot === 'function' ? bridge.getLatestSnapshot() : null;
      const latestCid = extractPayloadCid(latest);
      // Never allow an untagged or different-session global latest snapshot to bleed into a known UUID conversation
      const latestMatches = hasRealCid ? latestCid === normCid : (!latestCid || latestCid === normCid);
      const fromLatest = latestMatches ? extractFromBridgePayload(latest) : null;
      const live = await withTimeout(bridge.getMetrics({ conversationId: cascadeId, force: false }), 1500);
      const liveCid = extractPayloadCid(live);
      const liveMatches = !liveCid || !hasRealCid || liveCid === normCid;
      const parsed = (liveMatches ? extractFromBridgePayload(live) : null) || fromLatest;
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
    findConversationScrollViewport,
    detectCascadeId,
    isConversationView,
    isTurnStreaming,
    findComposerEditor,
    readComposerDraft,
    readFromPulseShadowDom,
    analyzeContextBreakdown,
    sampleContextState,
  };
});
