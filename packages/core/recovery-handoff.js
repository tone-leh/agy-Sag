// Antigravity Session Guard — Post-Compact Lossless Recovery Snapshot & Handoff Builder (UMD)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSgRecoveryHandoff = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  const HANDOFF_STORAGE_PREFIX = 'agSessionGuard.handoff.v1:';
  const MAX_PROMPT_CHARS = 1800;

  function resolveDep(globalKey, relPath) {
    if (globalRoot && globalRoot[globalKey]) return globalRoot[globalKey];
    if (typeof require === 'function') return require(relPath);
    return null;
  }

  function compactOneLine(raw, maxLen = 220, exporter = null) {
    const clean = (exporter ? exporter.redactSecrets(raw) : String(raw || ''))
      .replace(/\s+/g, ' ')
      .trim();
    if (clean.length <= maxLen) return clean;
    return `${clean.slice(0, maxLen).trimEnd()}…`;
  }

  function buildRecoveryPrompt(anchors = [], strings = null) {
    const i18n = resolveDep('__agSgI18n', './i18n.js');
    const S = strings || i18n?.getStrings?.('zh-CN') || {
      recoveryPromptHeader: '[Post-Compact Context Anchors] Continue from these preserved decisions:',
      mdTurn: 'Turn {n}',
    };
    const fmt = i18n?.formatTemplate || ((t, v) => String(t).replace('{n}', v.n));
    if (!Array.isArray(anchors) || anchors.length === 0) return '';

    const lines = [S.recoveryPromptHeader];
    for (const a of anchors) {
      const tag = a.starred ? '★ ' : '';
      const turnLabel = fmt(S.mdTurn, { n: a.turnNum });
      const parts = [];
      if (a.user) parts.push(a.user);
      if (a.assistant) parts.push(`→ ${a.assistant}`);
      lines.push(`- ${tag}[${turnLabel}] ${parts.join(' ')}`);
    }
    const joined = lines.join('\n');
    if (joined.length <= MAX_PROMPT_CHARS) return joined;
    return `${joined.slice(0, MAX_PROMPT_CHARS).trimEnd()}…`;
  }

  function capturePreCompactSnapshot({
    doc = null,
    scopeEl = null,
    turns = null,
    storage = null,
    cascadeId = '',
    bookmarks = null,
    usedPct = null,
    strings = null,
    now = new Date(),
  } = {}) {
    const exporter = resolveDep('__agSgPrecompactExport', './precompact-export.js');
    const allTurns = Array.isArray(turns) ? turns : exporter?.extractConversationTurns?.(doc, scopeEl) || [];
    if (allTurns.length === 0) return null;

    const cid = cascadeId || 'default-session';
    const bmSet =
      bookmarks instanceof Set
        ? bookmarks
        : Array.isArray(bookmarks)
          ? new Set(bookmarks)
          : exporter?.loadBookmarks?.(storage, cid) || new Set();

    const starredTurns = allTurns.filter((t) => bmSet.has(t.turnNum));
    const chosen = starredTurns.length > 0 ? starredTurns.slice(-5) : allTurns.slice(-2);

    const anchors = chosen.map((t) => ({
      turnNum: t.turnNum,
      starred: bmSet.has(t.turnNum),
      user: compactOneLine(t.user || '', 180, exporter),
      assistant: compactOneLine(t.assistant || '', 220, exporter),
    }));

    const prompt = buildRecoveryPrompt(anchors, strings);
    const snapshot = {
      cascadeId: cid,
      capturedAt: (now instanceof Date ? now : new Date(now)).toISOString(),
      usedPct: typeof usedPct === 'number' && Number.isFinite(usedPct) ? usedPct : null,
      anchorCount: anchors.length,
      starredCount: starredTurns.length,
      anchors,
      prompt,
      pendingRecovery: true,
    };

    if (storage && cid) {
      try {
        storage.setItem(HANDOFF_STORAGE_PREFIX + cid, JSON.stringify(snapshot));
      } catch {}
    }
    return snapshot;
  }

  function loadSnapshot(storage, cascadeId) {
    if (!storage || !cascadeId) return null;
    try {
      const raw = storage.getItem(HANDOFF_STORAGE_PREFIX + cascadeId);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.prompt) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function clearSnapshot(storage, cascadeId) {
    if (!storage || !cascadeId) return false;
    try {
      storage.removeItem(HANDOFF_STORAGE_PREFIX + cascadeId);
      return true;
    } catch {
      return false;
    }
  }

  return {
    HANDOFF_STORAGE_PREFIX,
    buildRecoveryPrompt,
    capturePreCompactSnapshot,
    loadSnapshot,
    clearSnapshot,
  };
});
