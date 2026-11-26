// Antigravity Session Guard — Outline & Turn Bookmarks Controller + Native Jump Drawer (Module D, UMD)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSgOutlineBookmarks = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  function resolveDep(globalKey, relPath) {
    if (globalRoot && globalRoot[globalKey]) return globalRoot[globalKey];
    if (typeof require === 'function') return require(relPath);
    return null;
  }

  function createOutlineBookmarksController(options = {}) {
    const win = options.win || globalRoot;
    const doc = options.doc || win?.document || null;
    const storage = options.storage !== undefined ? options.storage : win?.localStorage || null;
    const coexist = options.coexist || resolveDep('__agSgCoexist', './coexist.js');
    const ctxSrc = options.contextSource || resolveDep('__agSgContextSource', './context-source.js');
    const exporter = options.exporter || resolveDep('__agSgPrecompactExport', './precompact-export.js');
    const vault = options.vault || resolveDep('__agSgBookmarkVault', './bookmark-vault.js');
    const i18n = options.i18n || resolveDep('__agSgI18n', './i18n.js');

    let enabled = options.enabled !== undefined ? Boolean(options.enabled) : true;
    let onlyBookmarkedFilter = false;
    let drawerOpen = false;
    let destroyed = false;
    let currentCid = '';
    let bookmarks = new Set();
    let observer = null;
    let dockEl = null;
    let chipBtn = null;
    let drawerEl = null;
    let pulseTimer = null;
    let pulsedEl = null;
    const ownedNodes = new Set();

    const getLang = () => (typeof options.getLang === 'function' ? i18n.normalizeLang(options.getLang()) : i18n.detectLang(doc, win));
    const S = () => i18n.getStrings(getLang());

    function clearPulse() {
      if (pulseTimer) {
        clearTimeout(pulseTimer);
        pulseTimer = null;
      }
      if (pulsedEl) {
        try { pulsedEl.removeAttribute?.('data-ag-sg-pulse'); } catch {}
        pulsedEl = null;
      }
    }

    function refreshCascade() {
      const nextCid = ctxSrc.detectCascadeId(doc, win);
      if (nextCid !== currentCid) {
        currentCid = nextCid;
        bookmarks = exporter.loadBookmarks(storage, currentCid);
        onlyBookmarkedFilter = false;
        drawerOpen = false;
      }
      return currentCid;
    }

    function toggleBookmark(turnNum) {
      const n = Number(turnNum);
      if (!Number.isInteger(n) || n <= 0) return false;
      refreshCascade();
      let active = false;
      if (bookmarks.has(n)) {
        bookmarks.delete(n);
      } else {
        bookmarks.add(n);
        active = true;
      }
      if (bookmarks.size === 0) drawerOpen = false;
      exporter.saveBookmarks(storage, currentCid, bookmarks);
      if (vault) {
        const turns = exporter.extractConversationTurns(doc);
        const title = vault.detectConversationTitle(doc, currentCid);
        vault.syncSessionMeta({ storage, cascadeId: currentCid, bookmarks, turns, title });
      }
      sync();
      if (typeof options.onBookmarksChange === 'function') {
        try { options.onBookmarksChange({ cascadeId: currentCid, bookmarks: [...bookmarks] }); } catch {}
      }
      return active;
    }

    function getUserBubbles() {
      if (!doc || typeof doc.querySelector !== 'function') return [];
      const conv = doc.querySelector('[data-testid="conversation-view"]');
      if (!conv || typeof conv.querySelectorAll !== 'function') return [];
      return Array.from(conv.querySelectorAll('[data-testid="user-message-bubble"]'));
    }

    function jumpToTurn(turnNum) {
      const n = Number(turnNum);
      if (!Number.isInteger(n) || n <= 0) return false;
      const bubbles = getUserBubbles();
      const target = bubbles[n - 1];
      if (!target) return false;
      clearPulse();
      try {
        target.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      } catch {}
      target.setAttribute?.('data-ag-sg-pulse', '1');
      pulsedEl = target;
      pulseTimer = setTimeout(() => {
        clearPulse();
      }, 950);
      pulseTimer?.unref?.();
      drawerOpen = false;
      renderNativeJumpDock(bubbles);
      return true;
    }

    async function exportBookmarked({ download = false } = {}) {
      const strings = S();
      const turns = exporter.extractConversationTurns(doc);
      const cid = currentCid || ctxSrc.detectCascadeId(doc, win);
      const built = exporter.buildRecapMarkdown({
        turns,
        bookmarks,
        onlyBookmarked: true,
        cascadeId: cid,
        strings,
      });
      if (!built.ok) return built;
      if (download) {
        const filename = exporter.buildRecapFilename(cid, new Date(), { onlyBookmarked: true });
        const dl = exporter.downloadRecapMarkdown(built.markdown, filename, win, doc);
        const payload = { ...built, filename, downloaded: dl.ok };
        if (typeof options.onDownloadMarkdown === 'function') {
          try { options.onDownloadMarkdown(payload); } catch {}
        }
        if (typeof options.onExportMarkdown === 'function') {
          try { options.onExportMarkdown(payload); } catch {}
        }
        return payload;
      }
      await exporter.copyRecapToClipboard(built.markdown, win);
      if (typeof options.onExportMarkdown === 'function') {
        try { options.onExportMarkdown(built); } catch {}
      }
      return built;
    }

    function clearOwned() {
      clearPulse();
      for (const n of ownedNodes) {
        try { n.remove?.(); } catch {}
      }
      ownedNodes.clear();
      dockEl = chipBtn = drawerEl = null;
      drawerOpen = false;
      // Unhide any outline rows filtered by onlyBookmarkedFilter
      try {
        doc?.querySelectorAll?.('.ag-cs-nav-outline-item[data-ag-sg-bm-hidden="1"]')?.forEach?.((row) => {
          row.hidden = false;
          row.removeAttribute?.('data-ag-sg-bm-hidden');
        });
      } catch {}
    }

    function renderNativeJumpDock(bubbles) {
      if (!doc || typeof doc.querySelector !== 'function') return;
      const conv = doc.querySelector('[data-testid="conversation-view"]');
      if (!conv) return;
      const dockHost = conv.querySelector?.('[data-testid="autoscroll-viewport"]') || conv;

      const sorted = [...bookmarks].sort((a, b) => a - b);
      if (sorted.length === 0) {
        if (dockEl) dockEl.hidden = true;
        drawerOpen = false;
        if (drawerEl) drawerEl.hidden = true;
        return;
      }

      if (!dockEl || dockEl.parentElement !== dockHost) {
        if (dockEl) {
          try { dockEl.remove?.(); } catch {}
          ownedNodes.delete(dockEl);
        }
        dockEl = coexist.markOwnedNoTranslate(doc.createElement('div'));
        dockEl.className = 'ag-sg-bm-dock';
        dockEl.setAttribute('data-testid', 'ag-sg-bm-dock');

        const inner = doc.createElement('div');
        inner.className = 'ag-sg-bm-dock-inner';

        chipBtn = doc.createElement('button');
        chipBtn.type = 'button';
        chipBtn.className = 'ag-sg-bm-chip';
        chipBtn.setAttribute('data-ag-sg-act', 'bm-drawer-toggle');
        chipBtn.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          drawerOpen = !drawerOpen;
          renderNativeJumpDock(getUserBubbles());
        });

        drawerEl = doc.createElement('div');
        drawerEl.className = 'ag-sg-bm-drawer';
        drawerEl.setAttribute('data-testid', 'ag-sg-bm-drawer');
        drawerEl.hidden = true;

        inner.appendChild(chipBtn);
        inner.appendChild(drawerEl);
        dockEl.appendChild(inner);

        if (typeof dockHost.insertBefore === 'function' && dockHost.firstChild) {
          dockHost.insertBefore(dockEl, dockHost.firstChild);
        } else {
          dockHost.appendChild(dockEl);
        }
        ownedNodes.add(dockEl);
      }

      const strings = S();
      dockEl.hidden = false;
      chipBtn.textContent = `★ ${sorted.length}`;
      chipBtn.title = strings.bmChipTitle;
      chipBtn.setAttribute('aria-expanded', String(drawerOpen));
      drawerEl.hidden = !drawerOpen;
      if (!drawerOpen) return;

      while (drawerEl.firstChild) drawerEl.removeChild(drawerEl.firstChild);

      const head = doc.createElement('div');
      head.className = 'ag-sg-bm-drawer-head';
      const headTitle = doc.createElement('span');
      headTitle.textContent = i18n.formatTemplate(strings.bmDrawerTitle, { n: sorted.length });
      head.appendChild(headTitle);
      if (typeof options.onOpenVault === 'function') {
        const vaultBtn = doc.createElement('button');
        vaultBtn.type = 'button';
        vaultBtn.className = 'ag-sg-btn';
        vaultBtn.setAttribute('data-ag-sg-act', 'bm-open-vault');
        vaultBtn.textContent = strings.bmOpenVaultBtn;
        vaultBtn.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          drawerOpen = false;
          renderNativeJumpDock(getUserBubbles());
          options.onOpenVault();
        });
        head.appendChild(vaultBtn);
      }
      drawerEl.appendChild(head);

      const list = doc.createElement('div');
      list.className = 'ag-sg-bm-list';

      for (const turnNum of sorted) {
        const bubble = bubbles[turnNum - 1];
        const rawSnippet = bubble ? exporter.extractNodeTextWithoutOwned(bubble) : '';
        const cleanSnippet = exporter.redactSecrets(rawSnippet).replace(/\s+/g, ' ').trim();
        const snippet = cleanSnippet.length > 56 ? `${cleanSnippet.slice(0, 56)}…` : cleanSnippet || '—';

        const row = doc.createElement('div');
        row.className = 'ag-sg-bm-item';
        row.setAttribute('role', 'button');
        row.setAttribute('tabindex', '0');
        row.setAttribute('data-ag-sg-jump', String(turnNum));
        row.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          jumpToTurn(turnNum);
        });

        const num = doc.createElement('span');
        num.className = 'ag-sg-bm-num';
        num.textContent = i18n.formatTemplate(strings.bmTurnPrefix, { n: turnNum });

        const txt = doc.createElement('span');
        txt.className = 'ag-sg-bm-snippet';
        txt.textContent = snippet;

        const rm = doc.createElement('button');
        rm.type = 'button';
        rm.className = 'ag-sg-bm-unstar';
        rm.setAttribute('data-ag-sg-unstar', String(turnNum));
        rm.title = strings.bmUnstarTitle;
        rm.textContent = '×';
        rm.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          toggleBookmark(turnNum);
        });

        row.appendChild(num);
        row.appendChild(txt);
        row.appendChild(rm);
        list.appendChild(row);
      }
      drawerEl.appendChild(list);

      const foot = doc.createElement('div');
      foot.className = 'ag-sg-bm-foot';

      const copyBtn = doc.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'ag-sg-btn';
      copyBtn.setAttribute('data-ag-sg-act', 'bm-copy-md');
      copyBtn.textContent = strings.bmCopyStars;
      copyBtn.addEventListener('click', (ev) => {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
        void exportBookmarked({ download: false });
      });

      const dlBtn = doc.createElement('button');
      dlBtn.type = 'button';
      dlBtn.className = 'ag-sg-btn ag-sg-btn-primary';
      dlBtn.setAttribute('data-ag-sg-act', 'bm-download-md');
      dlBtn.textContent = strings.bmDownloadStars;
      dlBtn.addEventListener('click', (ev) => {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
        void exportBookmarked({ download: true });
      });

      foot.appendChild(copyBtn);
      foot.appendChild(dlBtn);
      drawerEl.appendChild(foot);
    }

    function decorateUserTurns() {
      const bubbles = getUserBubbles();
      if (bubbles.length === 0) {
        renderNativeJumpDock(bubbles);
        return;
      }
      const strings = S();
      bubbles.forEach((bubble, idx) => {
        const turnNum = idx + 1;
        const starred = bookmarks.has(turnNum);
        let btn = bubble.querySelector?.('.ag-sg-bm-star');
        if (!btn) {
          btn = coexist.markOwnedNoTranslate(doc.createElement('button'));
          btn.type = 'button';
          btn.className = 'ag-sg-bm-star';
          btn.setAttribute('data-ag-sg-turn', String(turnNum));
          btn.addEventListener('click', (ev) => {
            ev?.preventDefault?.();
            ev?.stopPropagation?.();
            toggleBookmark(turnNum);
          });
          bubble.appendChild(btn);
          ownedNodes.add(btn);
        }
        btn.setAttribute('data-ag-sg-turn', String(turnNum));
        btn.setAttribute('aria-pressed', String(starred));
        btn.setAttribute('data-starred', starred ? '1' : '0');
        btn.title = starred ? strings.bmUnstarTitle : strings.bmStarTitle;
        btn.textContent = starred ? '★' : '☆';
      });
      renderNativeJumpDock(bubbles);
    }

    function decoratePrismOutlinePopover() {
      if (!doc || typeof doc.querySelector !== 'function') return;
      const pop = doc.querySelector('.ag-cs-nav-outline-popover');
      if (!pop) return;
      const strings = S();
      const head = pop.querySelector?.('.ag-cs-nav-outline-head');
      if (head) {
        let filterBtn = head.querySelector?.('.ag-sg-outline-bm-filter');
        if (!filterBtn) {
          filterBtn = coexist.markOwnedNoTranslate(doc.createElement('button'));
          filterBtn.type = 'button';
          filterBtn.className = 'ag-sg-btn ag-sg-outline-bm-filter';
          filterBtn.setAttribute('data-ag-sg-act', 'bm-filter');
          filterBtn.addEventListener('click', (ev) => {
            ev?.preventDefault?.();
            ev?.stopPropagation?.();
            onlyBookmarkedFilter = !onlyBookmarkedFilter;
            sync();
          });
          head.appendChild(filterBtn);
          ownedNodes.add(filterBtn);
        }
        filterBtn.setAttribute('aria-pressed', String(onlyBookmarkedFilter));
        filterBtn.textContent = `★ ${bookmarks.size}`;
        filterBtn.title = strings.bmFilterTitle;
      }

      const rows = Array.from(pop.querySelectorAll?.('.ag-cs-nav-outline-item') || []);
      for (const row of rows) {
        const turnNum = Number(row.getAttribute?.('data-turn-num') || 0);
        if (!Number.isInteger(turnNum) || turnNum <= 0) continue;
        const starred = bookmarks.has(turnNum);
        let star = row.querySelector?.('.ag-sg-outline-star');
        if (!star) {
          star = coexist.markOwnedNoTranslate(doc.createElement('span'));
          star.className = 'ag-sg-outline-star';
          star.setAttribute('role', 'button');
          star.setAttribute('tabindex', '0');
          star.addEventListener('click', (ev) => {
            ev?.preventDefault?.();
            ev?.stopPropagation?.();
            toggleBookmark(turnNum);
          });
          row.appendChild(star);
          ownedNodes.add(star);
        }
        star.setAttribute('data-starred', starred ? '1' : '0');
        star.textContent = starred ? '★' : '☆';

        if (onlyBookmarkedFilter && !starred) {
          row.hidden = true;
          row.setAttribute('data-ag-sg-bm-hidden', '1');
        } else if (row.getAttribute?.('data-ag-sg-bm-hidden') === '1') {
          row.hidden = false;
          row.removeAttribute?.('data-ag-sg-bm-hidden');
        }
      }
    }

    function sync() {
      if (destroyed) return;
      if (!enabled) {
        clearOwned();
        return;
      }
      refreshCascade();
      bookmarks = exporter.loadBookmarks(storage, currentCid);
      if (bookmarks.size === 0) drawerOpen = false;
      decorateUserTurns();
      decoratePrismOutlinePopover();
      if (vault && bookmarks.size > 0) {
        const turns = exporter.extractConversationTurns(doc);
        const title = vault.detectConversationTitle(doc, currentCid);
        vault.syncSessionMeta({ storage, cascadeId: currentCid, bookmarks, turns, title });
      }
    }

    function startObserver() {
      if (observer || !doc || typeof win?.MutationObserver !== 'function') return;
      try {
        let scheduled = false;
        observer = new win.MutationObserver((muts) => {
          if (destroyed || !enabled || scheduled) return;
          const relevant = muts.some((m) => {
            const t = m.target;
            if (t?.getAttribute?.('data-ag-sg-owned') === '1' || t?.closest?.('[data-ag-sg-owned="1"]')) return false;
            return true;
          });
          if (!relevant) return;
          scheduled = true;
          const run = () => {
            scheduled = false;
            if (!destroyed && enabled) sync();
          };
          if (typeof win.requestAnimationFrame === 'function') win.requestAnimationFrame(run);
          else setTimeout(run, 16);
        });
        const rootNode = doc.body || doc.documentElement;
        if (rootNode) observer.observe(rootNode, { childList: true, subtree: true });
      } catch {}
    }

    function setEnabled(v) {
      if (destroyed) return;
      enabled = Boolean(v);
      if (!enabled) {
        clearOwned();
      } else {
        sync();
        startObserver();
      }
    }

    function getBookmarks() {
      refreshCascade();
      return [...bookmarks].sort((a, b) => a - b);
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      enabled = false;
      try { observer?.disconnect?.(); } catch {}
      observer = null;
      clearOwned();
      bookmarks.clear();
    }

    if (enabled) {
      sync();
      if (options.autoObserve !== false) startObserver();
    }

    return {
      sync,
      toggleBookmark,
      jumpToTurn,
      getBookmarks,
      setDrawerOpen: (v) => { drawerOpen = Boolean(v); renderNativeJumpDock(getUserBubbles()); },
      setOnlyBookmarkedFilter: (v) => { onlyBookmarkedFilter = Boolean(v); sync(); },
      setEnabled,
      getDebugState: () => ({
        enabled,
        destroyed,
        cascadeId: currentCid,
        bookmarkCount: bookmarks.size,
        bookmarks: [...bookmarks].sort((a, b) => a - b),
        onlyBookmarkedFilter,
        drawerOpen,
      }),
      destroy,
    };
  }

  return { createOutlineBookmarksController };
});
