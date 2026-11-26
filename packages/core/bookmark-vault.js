// Antigravity Session Guard — Cross-Session Bookmark & Recap Vault (UMD, zero runtime deps)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSgBookmarkVault = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  const META_STORAGE_PREFIX = 'agSessionGuard.bookmarkMeta.v1:';

  function resolveDep(globalKey, relPath) {
    if (globalRoot && globalRoot[globalKey]) return globalRoot[globalKey];
    if (typeof require === 'function') return require(relPath);
    return null;
  }

  function storageKeys(storage) {
    if (!storage) return [];
    const keys = [];
    if (typeof storage.length === 'number' && typeof storage.key === 'function') {
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (typeof k === 'string') keys.push(k);
      }
      return keys;
    }
    if (typeof storage.keys === 'function') {
      try {
        return Array.from(storage.keys()).filter((k) => typeof k === 'string');
      } catch {}
    }
    try {
      return Object.keys(storage);
    } catch {
      return [];
    }
  }

  function detectConversationTitle(doc, cascadeId) {
    if (doc && typeof doc.querySelector === 'function') {
      if (cascadeId) {
        const row = doc.querySelector(`[data-testid="conversation-row-sidebar"][data-cascade-id="${cascadeId}"]`);
        const titleEl = row?.querySelector?.('[data-testid="conversation-title"], .truncate, span');
        const txt = String(titleEl?.textContent || '').replace(/\s+/g, ' ').trim();
        if (txt) return txt.slice(0, 80);
      }
      const firstBubble = doc.querySelector('[data-testid="conversation-view"] [data-testid="user-message-bubble"]');
      if (firstBubble) {
        const exporter = resolveDep('__agSgPrecompactExport', './precompact-export.js');
        const raw = exporter ? exporter.extractNodeTextWithoutOwned(firstBubble) : firstBubble.textContent || '';
        const clean = (exporter ? exporter.redactSecrets(raw) : String(raw)).replace(/\s+/g, ' ').trim();
        if (clean) return clean.length > 52 ? `${clean.slice(0, 52)}…` : clean;
      }
    }
    return cascadeId ? `Session ${cascadeId.slice(0, 8)}` : 'Default Session';
  }

  function loadSessionMeta(storage, cascadeId) {
    if (!storage || !cascadeId) return null;
    try {
      const raw = storage.getItem(META_STORAGE_PREFIX + cascadeId);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  function syncSessionMeta({ storage, cascadeId, bookmarks, turns = [], title = '', now = new Date() } = {}) {
    if (!storage || !cascadeId) return null;
    const exporter = resolveDep('__agSgPrecompactExport', './precompact-export.js');
    const bmList = Array.from(bookmarks || [])
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n > 0)
      .sort((a, b) => a - b);

    if (bmList.length === 0) {
      try { storage.removeItem(META_STORAGE_PREFIX + cascadeId); } catch {}
      return null;
    }

    const prev = loadSessionMeta(storage, cascadeId);
    const turnByNum = new Map();
    for (const t of Array.isArray(turns) ? turns : []) {
      if (t && Number.isInteger(t.turnNum)) turnByNum.set(t.turnNum, t);
    }

    const items = {};
    const stamp = (now instanceof Date ? now : new Date(now)).toISOString();
    for (const num of bmList) {
      const t = turnByNum.get(num);
      const prevItem = prev?.items?.[String(num)] || null;
      const rawUser = t?.user || prevItem?.snippet || '';
      const rawReply = t?.assistant || prevItem?.replySnippet || '';
      const snippet = (exporter ? exporter.redactSecrets(rawUser) : String(rawUser))
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 220);
      const replySnippet = (exporter ? exporter.redactSecrets(rawReply) : String(rawReply))
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 220);
      items[String(num)] = {
        turnNum: num,
        snippet,
        replySnippet,
        starredAt: prevItem?.starredAt || stamp,
      };
    }

    const meta = {
      cascadeId,
      title: (exporter ? exporter.redactSecrets(title || prev?.title || '') : String(title || prev?.title || ''))
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) || `Session ${cascadeId.slice(0, 8)}`,
      updatedAt: stamp,
      items,
    };

    try {
      storage.setItem(META_STORAGE_PREFIX + cascadeId, JSON.stringify(meta));
    } catch {}
    return meta;
  }

  function listAllSessions(storage) {
    if (!storage) return [];
    const exporter = resolveDep('__agSgPrecompactExport', './precompact-export.js');
    const bmPrefix = exporter?.BOOKMARK_STORAGE_PREFIX || 'agSessionGuard.bookmarks.v1:';
    const keys = storageKeys(storage);
    const cids = new Set();

    for (const k of keys) {
      if (k.startsWith(bmPrefix)) cids.add(k.slice(bmPrefix.length));
      else if (k.startsWith(META_STORAGE_PREFIX)) cids.add(k.slice(META_STORAGE_PREFIX.length));
    }

    const sessions = [];
    for (const cid of cids) {
      if (!cid) continue;
      const bmSet = exporter ? exporter.loadBookmarks(storage, cid) : new Set();
      const meta = loadSessionMeta(storage, cid);
      const nums = new Set([...bmSet]);
      if (meta?.items) {
        for (const k of Object.keys(meta.items)) {
          const n = Number(k);
          if (Number.isInteger(n) && n > 0 && bmSet.size === 0) nums.add(n);
        }
      }
      const sortedNums = [...nums].sort((a, b) => a - b);
      if (sortedNums.length === 0) continue;

      const items = sortedNums.map((n) => {
        const m = meta?.items?.[String(n)] || null;
        return {
          turnNum: n,
          snippet: m?.snippet || `Turn #${n}`,
          replySnippet: m?.replySnippet || '',
          starredAt: m?.starredAt || meta?.updatedAt || '',
        };
      });
      sessions.push({
        cascadeId: cid,
        title: meta?.title || `Session ${cid.slice(0, 8)}`,
        updatedAt: meta?.updatedAt || '',
        items,
      });
    }

    sessions.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    return sessions;
  }

  function searchVault(storage, query = '') {
    const sessions = listAllSessions(storage);
    const q = String(query || '').trim().toLowerCase();
    if (!q) return sessions;

    const filtered = [];
    for (const s of sessions) {
      const titleMatch = s.title.toLowerCase().includes(q) || s.cascadeId.toLowerCase().includes(q);
      const matchedItems = titleMatch
        ? s.items
        : s.items.filter(
            (it) =>
              it.snippet.toLowerCase().includes(q) ||
              it.replySnippet.toLowerCase().includes(q) ||
              String(it.turnNum) === q
          );
      if (matchedItems.length > 0) {
        filtered.push({ ...s, items: matchedItems });
      }
    }
    return filtered;
  }

  function buildVaultMarkdown(sessions = [], { strings = null, now = new Date() } = {}) {
    const i18n = resolveDep('__agSgI18n', './i18n.js');
    const exporter = resolveDep('__agSgPrecompactExport', './precompact-export.js');
    const S = strings || i18n?.getStrings?.('zh-CN') || {
      vaultMdTitle: 'Antigravity Cross-Session Bookmark Vault',
      mdExportedAt: 'Exported At',
      mdTurn: 'Turn {n}',
      mdUser: 'User',
      mdAssistant: 'Assistant',
    };
    const fmt = i18n?.formatTemplate || ((t, v) => String(t).replace('{n}', v.n));
    if (!Array.isArray(sessions) || sessions.length === 0) return { ok: false, sessions: 0, items: 0, markdown: '' };

    const lines = [
      `# ${S.vaultMdTitle}`,
      '',
      `- **${S.mdExportedAt}**: ${(now instanceof Date ? now : new Date(now)).toISOString()}`,
      '',
    ];
    let totalItems = 0;
    for (const s of sessions) {
      lines.push(`## ${s.title} (\`${s.cascadeId}\`)`);
      lines.push('');
      for (const it of s.items || []) {
        totalItems += 1;
        const safeUser = exporter ? exporter.redactSecrets(it.snippet) : it.snippet;
        const safeReply = exporter ? exporter.redactSecrets(it.replySnippet) : it.replySnippet;
        lines.push(`### ★ ${fmt(S.mdTurn, { n: it.turnNum })}`);
        if (safeUser) lines.push(`- **${S.mdUser}**: ${safeUser}`);
        if (safeReply) lines.push(`- **${S.mdAssistant}**: ${safeReply}`);
        lines.push('');
      }
    }
    return {
      ok: totalItems > 0,
      sessions: sessions.length,
      items: totalItems,
      markdown: `${lines.join('\n').trim()}\n`,
    };
  }

  function removeBookmarkFromVault(storage, cascadeId, turnNum) {
    const exporter = resolveDep('__agSgPrecompactExport', './precompact-export.js');
    if (!storage || !cascadeId || !exporter) return false;
    const set = exporter.loadBookmarks(storage, cascadeId);
    set.delete(Number(turnNum));
    exporter.saveBookmarks(storage, cascadeId, set);
    syncSessionMeta({ storage, cascadeId, bookmarks: set });
    return true;
  }

  function clearSessionFromVault(storage, cascadeId) {
    const exporter = resolveDep('__agSgPrecompactExport', './precompact-export.js');
    if (!storage || !cascadeId) return false;
    exporter?.saveBookmarks?.(storage, cascadeId, []);
    try { storage.removeItem(META_STORAGE_PREFIX + cascadeId); } catch {}
    return true;
  }

  function createBookmarkVaultController(options = {}) {
    const win = options.win || globalRoot;
    const doc = options.doc || win?.document || null;
    const storage = options.storage !== undefined ? options.storage : win?.localStorage || null;
    const coexist = options.coexist || resolveDep('__agSgCoexist', './coexist.js');
    const exporter = options.exporter || resolveDep('__agSgPrecompactExport', './precompact-export.js');
    const handoff = options.handoff || resolveDep('__agSgRecoveryHandoff', './recovery-handoff.js');
    const i18n = options.i18n || resolveDep('__agSgI18n', './i18n.js');

    let isOpen = false;
    let query = '';
    let destroyed = false;
    let overlayEl = null;
    let searchEl = null;
    let bodyEl = null;
    let statsEl = null;
    let statusEl = null;
    const listeners = [];

    const getLang = () => (typeof options.getLang === 'function' ? i18n.normalizeLang(options.getLang()) : i18n.detectLang(doc, win));
    const S = () => i18n.getStrings(getLang());

    function renderBody() {
      if (!overlayEl || !bodyEl || destroyed) return;
      const strings = S();
      const all = listAllSessions(storage);
      const matched = searchVault(storage, query);
      const totalItems = matched.reduce((acc, s) => acc + s.items.length, 0);

      if (statsEl) {
        statsEl.textContent = i18n.formatTemplate(strings.vaultStats, { sessions: matched.length, items: totalItems });
      }

      while (bodyEl.firstChild) bodyEl.removeChild(bodyEl.firstChild);

      if (matched.length === 0) {
        const empty = doc.createElement('div');
        empty.className = 'ag-sg-vault-empty';
        empty.textContent = all.length === 0 ? strings.vaultEmpty : strings.vaultNoMatch;
        bodyEl.appendChild(empty);
        return;
      }

      for (const s of matched) {
        const card = doc.createElement('div');
        card.className = 'ag-sg-vault-card';
        card.setAttribute('data-ag-sg-vault-cid', s.cascadeId);

        const chead = doc.createElement('div');
        chead.className = 'ag-sg-vault-card-head';

        const left = doc.createElement('div');
        left.textContent = s.title;
        const cidSpan = doc.createElement('span');
        cidSpan.className = 'ag-sg-vault-cid';
        cidSpan.textContent = ` · ${s.cascadeId.slice(0, 8)}`;
        left.appendChild(cidSpan);

        const headActs = doc.createElement('div');
        headActs.className = 'ag-sg-actions';

        if (handoff?.buildNewSessionHandoff) {
          const handoffBtn = doc.createElement('button');
          handoffBtn.type = 'button';
          handoffBtn.className = 'ag-sg-btn';
          handoffBtn.setAttribute('data-ag-sg-vault-handoff', s.cascadeId);
          handoffBtn.textContent = strings.btnCopyHandoff;
          handoffBtn.title = strings.btnCopyHandoffTitle;
          handoffBtn.addEventListener('click', async (ev) => {
            ev?.preventDefault?.();
            ev?.stopPropagation?.();
            const turns = s.items.map((it) => ({
              turnNum: it.turnNum,
              user: it.snippet,
              assistant: it.replySnippet,
            }));
            const bm = s.items.map((it) => it.turnNum);
            const built = handoff.buildNewSessionHandoff({
              turns,
              bookmarks: bm,
              cascadeId: s.cascadeId,
              title: s.title,
              strings: S(),
            });
            if (!built.ok) return;
            await exporter?.copyRecapToClipboard?.(built.prompt, win);
            if (typeof options.onCopyHandoff === 'function') options.onCopyHandoff({ ...built, cascadeId: s.cascadeId });
            if (statusEl) {
              statusEl.textContent = i18n.formatTemplate(S().toastHandoffCopied, { n: built.anchorCount });
            }
          });
          headActs.appendChild(handoffBtn);
        }

        const clearBtn = doc.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'ag-sg-btn';
        clearBtn.setAttribute('data-ag-sg-vault-clear', s.cascadeId);
        clearBtn.textContent = strings.vaultClearSession;
        clearBtn.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          clearSessionFromVault(storage, s.cascadeId);
          if (typeof options.onVaultMutated === 'function') options.onVaultMutated({ cascadeId: s.cascadeId });
          renderBody();
        });
        headActs.appendChild(clearBtn);

        chead.appendChild(left);
        chead.appendChild(headActs);
        card.appendChild(chead);

        for (const it of s.items) {
          const row = doc.createElement('div');
          row.className = 'ag-sg-vault-turn';

          const txt = doc.createElement('div');
          txt.className = 'ag-sg-vault-turn-text';
          const numBadge = doc.createElement('span');
          numBadge.className = 'ag-sg-bm-num';
          numBadge.textContent = `★ ${i18n.formatTemplate(strings.bmTurnPrefix, { n: it.turnNum })} `;
          txt.appendChild(numBadge);
          const qSpan = doc.createElement('span');
          qSpan.textContent = it.snippet;
          txt.appendChild(qSpan);

          if (it.replySnippet) {
            const rep = doc.createElement('div');
            rep.className = 'ag-sg-vault-reply';
            rep.textContent = `→ ${it.replySnippet}`;
            txt.appendChild(rep);
          }

          const rm = doc.createElement('button');
          rm.type = 'button';
          rm.className = 'ag-sg-bm-unstar';
          rm.setAttribute('data-ag-sg-vault-rm', `${s.cascadeId}:${it.turnNum}`);
          rm.textContent = '×';
          rm.title = strings.bmUnstarTitle;
          rm.addEventListener('click', (ev) => {
            ev?.preventDefault?.();
            ev?.stopPropagation?.();
            removeBookmarkFromVault(storage, s.cascadeId, it.turnNum);
            if (typeof options.onVaultMutated === 'function') options.onVaultMutated({ cascadeId: s.cascadeId });
            renderBody();
          });

          row.appendChild(txt);
          row.appendChild(rm);
          card.appendChild(row);
        }
        bodyEl.appendChild(card);
      }
    }

    function ensureModal() {
      if (!doc || destroyed) return null;
      if (overlayEl && overlayEl.isConnected !== false) return overlayEl;
      const strings = S();

      overlayEl = coexist.markOwnedNoTranslate(doc.createElement('div'));
      overlayEl.className = 'ag-sg-vault-overlay';
      overlayEl.setAttribute('data-testid', 'ag-sg-vault-overlay');
      overlayEl.hidden = true;
      overlayEl.addEventListener('click', (ev) => {
        if (ev?.target === overlayEl) close();
      });

      const modal = doc.createElement('div');
      modal.className = 'ag-sg-vault-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('data-testid', 'ag-sg-vault-modal');

      const head = doc.createElement('div');
      head.className = 'ag-sg-vault-head';
      const titleWrap = doc.createElement('div');
      const titleEl = doc.createElement('div');
      titleEl.className = 'ag-sg-vault-title';
      titleEl.textContent = strings.vaultTitle;
      statsEl = doc.createElement('div');
      statsEl.className = 'ag-sg-vault-stats';
      titleWrap.appendChild(titleEl);
      titleWrap.appendChild(statsEl);

      const closeBtn = doc.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'ag-sg-btn';
      closeBtn.setAttribute('data-ag-sg-act', 'vault-close');
      closeBtn.textContent = strings.vaultClose;
      closeBtn.addEventListener('click', () => close());

      head.appendChild(titleWrap);
      head.appendChild(closeBtn);

      searchEl = doc.createElement('input');
      searchEl.type = 'search';
      searchEl.className = 'ag-sg-vault-search';
      searchEl.setAttribute('data-testid', 'ag-sg-vault-search');
      searchEl.placeholder = strings.vaultSearchPlaceholder;
      searchEl.value = query;
      searchEl.addEventListener('input', () => {
        query = searchEl.value || '';
        renderBody();
      });

      bodyEl = doc.createElement('div');
      bodyEl.className = 'ag-sg-vault-body';

      const foot = doc.createElement('div');
      foot.className = 'ag-sg-vault-foot';
      statusEl = doc.createElement('span');
      statusEl.className = 'ag-sg-vault-stats';

      const footBtns = doc.createElement('div');
      footBtns.className = 'ag-sg-actions';

      const copyAllBtn = doc.createElement('button');
      copyAllBtn.type = 'button';
      copyAllBtn.className = 'ag-sg-btn';
      copyAllBtn.setAttribute('data-ag-sg-act', 'vault-copy-all');
      copyAllBtn.textContent = strings.vaultCopyAll;
      copyAllBtn.addEventListener('click', async () => {
        const res = buildVaultMarkdown(searchVault(storage, query), { strings: S() });
        if (!res.ok) return;
        await exporter?.copyRecapToClipboard?.(res.markdown, win);
        if (typeof options.onExportMarkdown === 'function') options.onExportMarkdown(res);
        statusEl.textContent = i18n.formatTemplate(S().vaultCopiedToast, { sessions: res.sessions });
      });

      const dlAllBtn = doc.createElement('button');
      dlAllBtn.type = 'button';
      dlAllBtn.className = 'ag-sg-btn ag-sg-btn-primary';
      dlAllBtn.setAttribute('data-ag-sg-act', 'vault-download-all');
      dlAllBtn.textContent = strings.vaultDownloadAll;
      dlAllBtn.addEventListener('click', () => {
        const res = buildVaultMarkdown(searchVault(storage, query), { strings: S() });
        if (!res.ok) return;
        const filename = exporter
          ? exporter.buildRecapFilename('vault', new Date(), { onlyBookmarked: true })
          : 'antigravity-vault.md';
        const dl = exporter?.downloadRecapMarkdown?.(res.markdown, filename, win, doc) || { ok: false };
        const payload = { ...res, filename, downloaded: dl.ok };
        if (typeof options.onDownloadMarkdown === 'function') options.onDownloadMarkdown(payload);
        if (typeof options.onExportMarkdown === 'function') options.onExportMarkdown(payload);
        statusEl.textContent = i18n.formatTemplate(S().vaultDownloadedToast, { file: filename });
      });

      footBtns.appendChild(copyAllBtn);
      footBtns.appendChild(dlAllBtn);
      foot.appendChild(statusEl);
      foot.appendChild(footBtns);

      modal.appendChild(head);
      modal.appendChild(searchEl);
      modal.appendChild(bodyEl);
      modal.appendChild(foot);
      overlayEl.appendChild(modal);

      (doc.body || doc.documentElement)?.appendChild?.(overlayEl);
      return overlayEl;
    }

    function open(initialQuery = null) {
      if (destroyed) return;
      if (typeof initialQuery === 'string') query = initialQuery;
      const el = ensureModal();
      if (!el) return;
      isOpen = true;
      el.hidden = false;
      if (searchEl) searchEl.value = query;
      if (statusEl) statusEl.textContent = '';
      renderBody();
      searchEl?.focus?.();
    }

    function close() {
      isOpen = false;
      if (overlayEl) overlayEl.hidden = true;
    }

    // Optional keyboard shortcut: Ctrl+Shift+B / Cmd+Shift+B (and Escape to close)
    const onKeyDown = (ev) => {
      if (destroyed || !ev) return;
      const key = String(ev.key || '').toLowerCase();
      if (isOpen && key === 'escape') {
        ev.preventDefault?.();
        close();
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && key === 'b') {
        ev.preventDefault?.();
        if (isOpen) close();
        else open();
      }
    };
    if (options.bindShortcut !== false && win && typeof win.addEventListener === 'function') {
      win.addEventListener('keydown', onKeyDown);
      listeners.push(() => win.removeEventListener?.('keydown', onKeyDown));
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      isOpen = false;
      while (listeners.length) {
        try { listeners.pop()(); } catch {}
      }
      try { overlayEl?.remove?.(); } catch {}
      overlayEl = searchEl = bodyEl = statsEl = statusEl = null;
    }

    return {
      open,
      close,
      toggle: () => (isOpen ? close() : open()),
      setQuery: (q) => {
        query = String(q || '');
        if (searchEl) searchEl.value = query;
        renderBody();
      },
      listAllSessions: () => listAllSessions(storage),
      search: (q) => searchVault(storage, q),
      getDebugState: () => ({
        isOpen,
        destroyed,
        query,
        sessionCount: listAllSessions(storage).length,
      }),
      destroy,
    };
  }

  return {
    META_STORAGE_PREFIX,
    detectConversationTitle,
    loadSessionMeta,
    syncSessionMeta,
    listAllSessions,
    searchVault,
    buildVaultMarkdown,
    removeBookmarkFromVault,
    clearSessionFromVault,
    createBookmarkVaultController,
  };
});
