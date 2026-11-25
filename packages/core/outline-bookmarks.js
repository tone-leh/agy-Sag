// Antigravity Session Guard — Outline & Turn Bookmarks Controller (Module D, UMD)
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
    const i18n = options.i18n || resolveDep('__agSgI18n', './i18n.js');

    let enabled = options.enabled !== undefined ? Boolean(options.enabled) : true;
    let onlyBookmarkedFilter = false;
    let destroyed = false;
    let currentCid = '';
    let bookmarks = new Set();
    let observer = null;
    const ownedNodes = new Set();

    const getLang = () => (typeof options.getLang === 'function' ? i18n.normalizeLang(options.getLang()) : i18n.detectLang(doc, win));
    const S = () => i18n.getStrings(getLang());

    function refreshCascade() {
      const nextCid = ctxSrc.detectCascadeId(doc, win);
      if (nextCid !== currentCid) {
        currentCid = nextCid;
        bookmarks = exporter.loadBookmarks(storage, currentCid);
        onlyBookmarkedFilter = false;
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
      exporter.saveBookmarks(storage, currentCid, bookmarks);
      sync();
      if (typeof options.onBookmarksChange === 'function') {
        try { options.onBookmarksChange({ cascadeId: currentCid, bookmarks: [...bookmarks] }); } catch {}
      }
      return active;
    }

    function clearOwned() {
      for (const n of ownedNodes) {
        try { n.remove?.(); } catch {}
      }
      ownedNodes.clear();
      // Unhide any outline rows filtered by onlyBookmarkedFilter
      try {
        doc?.querySelectorAll?.('.ag-cs-nav-outline-item[data-ag-sg-bm-hidden="1"]')?.forEach?.((row) => {
          row.hidden = false;
          row.removeAttribute?.('data-ag-sg-bm-hidden');
        });
      } catch {}
    }

    function decorateUserTurns() {
      if (!doc || typeof doc.querySelector !== 'function') return;
      const conv = doc.querySelector('[data-testid="conversation-view"]');
      if (!conv || typeof conv.querySelectorAll !== 'function') return;
      const bubbles = Array.from(conv.querySelectorAll('[data-testid="user-message-bubble"]'));
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
      decorateUserTurns();
      decoratePrismOutlinePopover();
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
      getBookmarks,
      setOnlyBookmarkedFilter: (v) => { onlyBookmarkedFilter = Boolean(v); sync(); },
      setEnabled,
      getDebugState: () => ({
        enabled,
        destroyed,
        cascadeId: currentCid,
        bookmarkCount: bookmarks.size,
        bookmarks: [...bookmarks].sort((a, b) => a - b),
        onlyBookmarkedFilter,
      }),
      destroy,
    };
  }

  return { createOutlineBookmarksController };
});
