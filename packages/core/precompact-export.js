// Antigravity Session Guard — Pre-Compact Structured Markdown Exporter & Secret Redactor (UMD)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSgPrecompactExport = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  const BOOKMARK_STORAGE_PREFIX = 'agSessionGuard.bookmarks.v1:';

  function redactSecrets(text) {
    return String(text || '')
      .replace(/-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
      .replace(/\b(?:sk|rk|pk|ak|AIza|ghp|gho|ghu|ghs|glpat)[-_A-Za-z0-9]{10,}\b/g, '[REDACTED_KEY]')
      .replace(/\bBearer\s+[A-Za-z0-9._\-+/=]{12,}\b/gi, 'Bearer [REDACTED_TOKEN]')
      .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_JWT]');
  }

  function normalizeBlockText(raw, maxLen = 6000) {
    const cleaned = redactSecrets(String(raw || '').replace(/\r\n?/g, '\n').replace(/\u200B/g, '').trim());
    if (cleaned.length <= maxLen) return cleaned;
    return `${cleaned.slice(0, maxLen).trimEnd()}\n\n... [truncated ${cleaned.length - maxLen} chars]`;
  }

  function loadBookmarks(storage, cascadeId) {
    if (!storage || !cascadeId) return new Set();
    try {
      const raw = storage.getItem(BOOKMARK_STORAGE_PREFIX + cascadeId);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0) : []);
    } catch {
      return new Set();
    }
  }

  function saveBookmarks(storage, cascadeId, setOrArr) {
    if (!storage || !cascadeId) return false;
    try {
      const arr = Array.from(setOrArr || [])
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n > 0)
        .sort((a, b) => a - b);
      if (arr.length === 0) storage.removeItem(BOOKMARK_STORAGE_PREFIX + cascadeId);
      else storage.setItem(BOOKMARK_STORAGE_PREFIX + cascadeId, JSON.stringify(arr));
      return true;
    } catch {
      return false;
    }
  }

  function extractConversationTurns(doc) {
    if (!doc || typeof doc.querySelector !== 'function') return [];
    const conv = doc.querySelector('[data-testid="conversation-view"]') || doc.body;
    if (!conv || typeof conv.querySelectorAll !== 'function') return [];

    const nodes = Array.from(
      conv.querySelectorAll(
        '[data-testid="user-message-bubble"], [data-testid="user-message-content"], [data-testid="planner-response-text"], [data-testid="agent-response"]'
      )
    );
    const turns = [];
    let current = null;
    const seenEl = new Set();

    for (const el of nodes) {
      if (!el || seenEl.has(el)) continue;
      const tid = el.getAttribute?.('data-testid') || '';
      if (tid === 'user-message-content' && el.closest?.('[data-testid="user-message-bubble"]')) continue;
      if (tid === 'planner-response-text' && el.closest?.('[data-testid="agent-response"]')) continue;
      seenEl.add(el);

      const text = normalizeBlockText(el.textContent || '');
      if (!text) continue;

      if (tid === 'user-message-bubble' || tid === 'user-message-content') {
        current = { turnNum: turns.length + 1, user: text, assistant: '' };
        turns.push(current);
      } else {
        if (!current) {
          current = { turnNum: turns.length + 1, user: '', assistant: text };
          turns.push(current);
        } else {
          current.assistant = current.assistant ? `${current.assistant}\n\n${text}` : text;
        }
      }
    }
    return turns;
  }

  function buildRecapMarkdown({
    turns = [],
    bookmarks = null,
    onlyBookmarked = false,
    cascadeId = '',
    usedPct = null,
    usedLabel = '',
    maxLabel = '',
    strings = null,
    now = new Date(),
  } = {}) {
    const i18nMod = globalRoot.__agSgI18n || (typeof require === 'function' ? require('./i18n.js') : null);
    const S = strings || i18nMod?.getStrings?.('zh-CN') || {
      mdTitle: 'Antigravity Session Recap',
      mdExportedAt: 'Exported At',
      mdContext: 'Context Usage',
      mdConversation: 'Conversation ID',
      mdTurn: 'Turn {n}',
      mdUser: 'User',
      mdAssistant: 'Assistant',
      mdBookmarkedTag: '★ Bookmarked',
    };
    const fmt = i18nMod?.formatTemplate || ((t, v) => String(t).replace('{n}', v.n));
    const bmSet = bookmarks instanceof Set ? bookmarks : new Set(Array.isArray(bookmarks) ? bookmarks : []);

    const selected = onlyBookmarked && bmSet.size > 0 ? turns.filter((t) => bmSet.has(t.turnNum)) : turns;
    if (selected.length === 0) return { ok: false, count: 0, markdown: '' };

    const lines = [
      `# ${S.mdTitle}`,
      '',
      `- **${S.mdExportedAt}**: ${(now instanceof Date ? now : new Date(now)).toISOString()}`,
    ];
    if (cascadeId) lines.push(`- **${S.mdConversation}**: \`${cascadeId}\``);
    if (typeof usedPct === 'number' && Number.isFinite(usedPct)) {
      const cap = usedLabel && maxLabel ? ` (${usedLabel} / ${maxLabel})` : '';
      lines.push(`- **${S.mdContext}**: ${usedPct}%${cap}`);
    }
    lines.push('');

    for (const t of selected) {
      const bmTag = bmSet.has(t.turnNum) ? ` ${S.mdBookmarkedTag}` : '';
      lines.push(`## ${fmt(S.mdTurn, { n: t.turnNum })}${bmTag}`);
      lines.push('');
      if (t.user) {
        lines.push(`### ${S.mdUser}`);
        lines.push('');
        lines.push(t.user);
        lines.push('');
      }
      if (t.assistant) {
        lines.push(`### ${S.mdAssistant}`);
        lines.push('');
        lines.push(t.assistant);
        lines.push('');
      }
    }

    return { ok: true, count: selected.length, markdown: lines.join('\n').trim() + '\n' };
  }

  async function copyRecapToClipboard(markdown, win) {
    const w = win || globalRoot;
    try {
      if (w?.navigator?.clipboard?.writeText) {
        await w.navigator.clipboard.writeText(markdown);
        return true;
      }
    } catch {}
    return false;
  }

  return {
    BOOKMARK_STORAGE_PREFIX,
    redactSecrets,
    loadBookmarks,
    saveBookmarks,
    extractConversationTurns,
    buildRecapMarkdown,
    copyRecapToClipboard,
  };
});
