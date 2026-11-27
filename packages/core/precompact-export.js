// agy-Sag — Pre-Compact Structured Markdown Exporter & Secret Redactor (UMD)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSgPrecompactExport = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  const BOOKMARK_STORAGE_PREFIX = 'agSag.bookmarks.v1:';

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

  function extractNodeTextWithoutOwned(el) {
    if (!el) return '';
    if (Array.isArray(el.children) && el.children.length > 0 && el.children.some((c) => c?.getAttribute?.('data-ag-sg-owned') === '1')) {
      const parts = [];
      if (typeof el._text === 'string' && el._text) parts.push(el._text);
      for (const c of el.children) {
        if (c?.getAttribute?.('data-ag-sg-owned') === '1') continue;
        parts.push(c.textContent || '');
      }
      return parts.join('');
    }
    if (typeof el.cloneNode === 'function') {
      try {
        const clone = el.cloneNode(true);
        clone.querySelectorAll?.('[data-ag-sg-owned="1"]')?.forEach?.((n) => n.remove?.());
        return clone.textContent || '';
      } catch {}
    }
    return String(el.textContent || '').replace(/[☆★]\s*$/, '');
  }

  function extractConversationTurns(doc, scopeEl = null) {
    if (!doc || typeof doc.querySelector !== 'function') return [];
    const scopedConv =
      scopeEl && scopeEl.isConnected !== false
        ? scopeEl.getAttribute?.('data-testid') === 'conversation-view'
          ? scopeEl
          : scopeEl.querySelector?.('[data-testid="conversation-view"]')
        : null;
    const conv = scopedConv || doc.querySelector('[data-testid="conversation-view"]') || doc.body;
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

      const text = normalizeBlockText(extractNodeTextWithoutOwned(el));
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

  function denoiseBlockText(text, maxCodeLines = 18) {
    const src = String(text || '');
    if (!src) return '';
    // 1) Collapse verbose fenced code/tool blocks exceeding maxCodeLines while preserving conclusions
    let out = src.replace(/```[^\n]*\n([\s\S]*?)```/g, (full, body) => {
      const lineCount = String(body || '').replace(/\n+$/, '').split('\n').length;
      if (lineCount <= maxCodeLines) return full;
      return `> [code/tool output condensed: ${lineCount} lines]`;
    });
    // 2) Linear-time stack trace condensation (horizontal whitespace only, zero newline ambiguity)
    out = out.replace(/(?:^[ \t]+at[ \t]+[^\n]+(?:\n|$)){8,}/gm, (m) => {
      const lc = m.trim().split('\n').length;
      return `> [tool log condensed: ${lc} lines]\n`;
    });
    // 3) Strictly linear O(N) line scanner for large raw JSON/object dumps (>=8 lines & >=800 chars)
    const lines = out.split('\n');
    const result = [];
    let i = 0;
    let unclosedUntil = -1;
    while (i < lines.length) {
      const trimmed = lines[i].trim();
      if (i > unclosedUntil && (trimmed.startsWith('{') || trimmed.startsWith('['))) {
        const openCh = trimmed[0];
        const closeCh = openCh === '{' ? '}' : ']';
        let depth = 0;
        let chars = 0;
        let j = i;
        let closedAt = -1;
        let inStr = false;
        let esc = false;
        while (j < lines.length && j - i < 2000) {
          const ln = lines[j];
          chars += ln.length + 1;
          for (let k = 0; k < ln.length; k += 1) {
            const c = ln[k];
            if (inStr) {
              if (esc) { esc = false; continue; }
              if (c === '\\') { esc = true; continue; }
              if (c === '"') inStr = false;
              continue;
            }
            if (c === '"') { inStr = true; continue; }
            if (c === openCh) depth += 1;
            else if (c === closeCh) {
              depth -= 1;
              if (depth === 0) {
                closedAt = j;
                break;
              }
            }
          }
          if (closedAt >= 0) break;
          j += 1;
        }
        if (closedAt < 0) {
          // Never re-scan unclosed opening braces in O(N^2)
          unclosedUntil = j;
        } else {
          const spanLines = closedAt - i + 1;
          if (spanLines >= 8 && chars >= 800) {
            result.push(`> [tool log condensed: ${spanLines} lines]`);
            i = closedAt + 1;
            continue;
          }
        }
      }
      result.push(lines[i]);
      i += 1;
    }
    return result.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function buildRecapMarkdown({
    turns = [],
    bookmarks = null,
    onlyBookmarked = false,
    denoise = false,
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
    if (denoise) lines.push('- **Mode**: Denoised Summary');
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
        lines.push(denoise ? denoiseBlockText(t.assistant) : t.assistant);
        lines.push('');
      }
    }

    return { ok: true, count: selected.length, markdown: lines.join('\n').trim() + '\n' };
  }

  function buildRecapFilename(cascadeId = '', now = new Date(), { onlyBookmarked = false } = {}) {
    const dt = now instanceof Date ? now : new Date(now);
    const iso = Number.isNaN(dt.getTime()) ? '1970-01-01T00:00:00.000Z' : dt.toISOString();
    const stamp = `${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 16).replace(':', '')}`;
    const shortCid = String(cascadeId || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    const parts = ['antigravity-recap'];
    if (onlyBookmarked) parts.push('stars');
    if (shortCid) parts.push(shortCid);
    parts.push(stamp);
    return `${parts.join('-')}.md`;
  }

  function downloadRecapMarkdown(markdown, filename = 'antigravity-recap.md', win, doc) {
    const w = win || globalRoot;
    const d = doc || w?.document || null;
    const BlobCtor = w?.Blob || globalThis.Blob;
    const UrlApi = w?.URL || globalThis.URL;
    if (!markdown || !d || typeof d.createElement !== 'function' || typeof BlobCtor !== 'function' || typeof UrlApi?.createObjectURL !== 'function') {
      return { ok: false, filename, reason: 'unavailable' };
    }
    let objectUrl = '';
    try {
      const blob = new BlobCtor([String(markdown)], { type: 'text/markdown;charset=utf-8' });
      objectUrl = UrlApi.createObjectURL(blob);
      const a = d.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      a.setAttribute?.('download', filename);
      a.setAttribute?.('data-ag-sg-owned', '1');
      if (a.style) a.style.display = 'none';
      (d.body || d.documentElement)?.appendChild?.(a);
      a.click?.();
      a.remove?.();
      const revoke = () => {
        try { UrlApi.revokeObjectURL?.(objectUrl); } catch {}
      };
      const t = setTimeout(revoke, 1000);
      t?.unref?.();
      return { ok: true, filename, bytes: String(markdown).length };
    } catch {
      if (objectUrl) {
        try { UrlApi.revokeObjectURL?.(objectUrl); } catch {}
      }
      return { ok: false, filename, reason: 'download-failed' };
    }
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
    denoiseBlockText,
    extractNodeTextWithoutOwned,
    loadBookmarks,
    saveBookmarks,
    extractConversationTurns,
    buildRecapMarkdown,
    buildRecapFilename,
    downloadRecapMarkdown,
    copyRecapToClipboard,
  };
});
