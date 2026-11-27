// agy-Sag — Post-Compact Lossless Recovery & New-Session Handoff Builder (UMD)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSgRecoveryHandoff = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  const HANDOFF_STORAGE_PREFIX = 'agSag.handoff.v1:';
  const MAX_PROMPT_CHARS = 1800;
  const MAX_NEW_SESSION_HANDOFF_CHARS = 2400;

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

  function buildNewSessionHandoff({
    turns = [],
    bookmarks = null,
    cascadeId = '',
    title = '',
    usedPct = null,
    strings = null,
  } = {}) {
    const i18n = resolveDep('__agSgI18n', './i18n.js');
    const exporter = resolveDep('__agSgPrecompactExport', './precompact-export.js');
    const S = strings || i18n?.getStrings?.('zh-CN') || {
      handoffHeader: '[New Session Handoff] Continue the previous Antigravity session with these preserved facts:',
      handoffGoalLabel: 'Session Goal',
      handoffDecisionsLabel: 'Key Decisions & Anchors',
      handoffLatestLabel: 'Latest Progress',
      handoffInstruction: 'Please confirm you have this context and continue from the latest step without repeating completed work.',
      mdTurn: 'Turn {n}',
    };
    const fmt = i18n?.formatTemplate || ((t, v) => String(t).replace('{n}', v.n));
    const list = Array.isArray(turns) ? turns.filter((t) => t && (t.user || t.assistant)) : [];
    if (list.length === 0) return { ok: false, anchorCount: 0, starredCount: 0, prompt: '' };

    const bmSet =
      bookmarks instanceof Set
        ? bookmarks
        : Array.isArray(bookmarks)
          ? new Set(bookmarks.map((n) => Number(n)))
          : new Set();

    const firstTurn = list[0];
    const latestTurn = list[list.length - 1];
    const starredTurns = list.filter((t) => bmSet.has(t.turnNum));
    const chosen = starredTurns.length > 0 ? starredTurns.slice(-6) : list.slice(-3);

    const lines = [S.handoffHeader];
    const metaParts = [];
    if (title) metaParts.push(compactOneLine(title, 80, exporter));
    if (cascadeId) metaParts.push(`#${String(cascadeId).slice(0, 8)}`);
    if (typeof usedPct === 'number' && Number.isFinite(usedPct)) metaParts.push(`${usedPct}%`);
    if (metaParts.length > 0) lines.push(`(${metaParts.join(' · ')})`);

    const goalText = compactOneLine(firstTurn.user || firstTurn.assistant || '', 220, exporter);
    if (goalText) {
      lines.push('');
      lines.push(`## ${S.handoffGoalLabel}`);
      lines.push(goalText);
    }

    lines.push('');
    lines.push(`## ${S.handoffDecisionsLabel}`);
    for (const t of chosen) {
      const tag = bmSet.has(t.turnNum) ? '★ ' : '';
      const turnLabel = fmt(S.mdTurn, { n: t.turnNum });
      const u = compactOneLine(t.user || '', 170, exporter);
      const a = compactOneLine(t.assistant || '', 210, exporter);
      const parts = [];
      if (u) parts.push(u);
      if (a) parts.push(`→ ${a}`);
      lines.push(`- ${tag}[${turnLabel}] ${parts.join(' ')}`);
    }

    const latestIncluded = chosen.some((t) => t.turnNum === latestTurn.turnNum);
    if (!latestIncluded && latestTurn) {
      const u = compactOneLine(latestTurn.user || '', 160, exporter);
      const a = compactOneLine(latestTurn.assistant || '', 220, exporter);
      const parts = [];
      if (u) parts.push(u);
      if (a) parts.push(`→ ${a}`);
      if (parts.length > 0) {
        lines.push('');
        lines.push(`## ${S.handoffLatestLabel}`);
        lines.push(`- [${fmt(S.mdTurn, { n: latestTurn.turnNum })}] ${parts.join(' ')}`);
      }
    }

    if (S.handoffInstruction) {
      lines.push('');
      lines.push(S.handoffInstruction);
    }

    const joined = lines.join('\n').trim();
    const prompt =
      joined.length <= MAX_NEW_SESSION_HANDOFF_CHARS
        ? joined
        : `${joined.slice(0, MAX_NEW_SESSION_HANDOFF_CHARS).trimEnd()}…`;

    return {
      ok: true,
      anchorCount: chosen.length,
      starredCount: starredTurns.length,
      turnCount: list.length,
      prompt,
    };
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
    MAX_NEW_SESSION_HANDOFF_CHARS,
    buildRecoveryPrompt,
    buildNewSessionHandoff,
    capturePreCompactSnapshot,
    loadSnapshot,
    clearSnapshot,
  };
});
