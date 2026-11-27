// agy-Sag — Prompt Queue Controller (UMD, zero runtime deps)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSagPromptQueue = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  const STORAGE_PREFIX = 'agSag.promptQueue.v1:';
  const MAX_QUEUE_ITEMS = 20;
  const MAX_ITEM_CHARS = 4000;
  const STYLE_ID = 'ag-sag-queue-css';

  const QUEUE_CSS = `
.ag-sag-queue-bar{
  position:relative;
  box-sizing:border-box;
  width:100%;
  margin:0 0 8px 0;
  padding:6px 10px;
  border-radius:10px;
  border:1px solid var(--border,rgba(148,163,184,.24));
  background:color-mix(in srgb,var(--popover,var(--card,#ffffff)) 94%,transparent);
  color:var(--foreground,#0f172a);
  font:12px/1.35 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei UI",sans-serif;
  z-index:28;
}
.ag-sag-queue-bar[hidden]{display:none!important;}
.ag-sag-queue-bar[data-state="collapsed"]{
  display:flex;
  align-items:center;
  justify-content:flex-end;
  padding:2px 0;
  border:0;
  background:transparent;
}
.ag-sag-queue-trigger{
  appearance:none;
  border:1px solid var(--border,rgba(148,163,184,.28));
  background:color-mix(in srgb,var(--secondary,rgba(148,163,184,.12)) 72%,transparent);
  color:var(--muted-foreground,var(--foreground,#475569));
  border-radius:999px;
  padding:2px 9px;
  font:500 11px/1.3 inherit;
  cursor:pointer;
}
.ag-sag-queue-trigger[hidden]{display:none!important;}
.ag-sag-queue-panel[hidden]{display:none!important;}
.ag-sag-queue-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  margin-bottom:6px;
}
.ag-sag-queue-title{
  display:flex;
  align-items:center;
  gap:6px;
  font-weight:600;
  min-width:0;
}
.ag-sag-queue-status{
  font-size:11px;
  font-weight:500;
  color:var(--muted-foreground,#64748b);
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.ag-sag-queue-actions{
  display:flex;
  align-items:center;
  gap:4px;
  flex:0 0 auto;
}
.ag-sag-queue-btn{
  appearance:none;
  border:1px solid var(--border,rgba(148,163,184,.28));
  background:color-mix(in srgb,var(--secondary,rgba(148,163,184,.14)) 75%,transparent);
  color:var(--foreground,#0f172a);
  border-radius:7px;
  padding:2px 7px;
  font:500 11px/1.3 inherit;
  cursor:pointer;
}
.ag-sag-queue-btn:disabled{opacity:.45;cursor:not-allowed;}
.ag-sag-queue-list{
  display:flex;
  flex-direction:column;
  gap:4px;
  margin:0 0 6px 0;
  padding:0;
  list-style:none;
  max-height:160px;
  overflow-y:auto;
}
.ag-sag-queue-list[hidden]{display:none!important;}
.ag-sag-queue-item{
  display:flex;
  align-items:center;
  gap:6px;
  padding:4px 6px;
  border-radius:7px;
  background:color-mix(in srgb,var(--secondary,rgba(148,163,184,.12)) 65%,transparent);
}
.ag-sag-queue-idx{
  flex:0 0 auto;
  font-variant-numeric:tabular-nums;
  font-weight:600;
  color:var(--muted-foreground,#64748b);
}
.ag-sag-queue-preview{
  flex:1 1 auto;
  min-width:0;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.ag-sag-queue-item-acts{
  display:flex;
  align-items:center;
  gap:3px;
  flex:0 0 auto;
}
.ag-sag-queue-composer{
  display:flex;
  align-items:center;
  gap:6px;
}
.ag-sag-queue-input{
  flex:1 1 auto;
  min-width:0;
  box-sizing:border-box;
  border:1px solid var(--border,rgba(148,163,184,.32));
  border-radius:7px;
  background:var(--background,transparent);
  color:var(--foreground,#0f172a);
  padding:4px 8px;
  font:12px/1.35 inherit;
}
`;

  function resolveDep(globalKey, relPath) {
    if (globalRoot && globalRoot[globalKey]) return globalRoot[globalKey];
    if (typeof require === 'function') {
      try { return require(relPath); } catch {}
    }
    return null;
  }

  function normalizeQueueText(text) {
    const cleaned = String(text ?? '').replace(/\u200B/g, '').trim();
    if (!cleaned) return '';
    return cleaned.length > MAX_ITEM_CHARS ? cleaned.slice(0, MAX_ITEM_CHARS) : cleaned;
  }

  function sanitizeQueueItem(raw, fallbackNow, idx) {
    if (!raw || typeof raw !== 'object') return null;
    const text = normalizeQueueText(raw.text);
    if (!text) return null;
    const id = typeof raw.id === 'string' && raw.id.trim()
      ? raw.id.trim()
      : `q-${fallbackNow}-${idx}`;
    const createdAt = Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : fallbackNow;
    return { id, text, createdAt };
  }

  function loadQueue(storage, cascadeId, nowTs = Date.now()) {
    if (!storage || !cascadeId) return [];
    try {
      const raw = storage.getItem(STORAGE_PREFIX + cascadeId);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
      const out = [];
      const seenIds = new Set();
      for (let i = 0; i < list.length && out.length < MAX_QUEUE_ITEMS; i++) {
        const item = sanitizeQueueItem(list[i], nowTs, i);
        if (!item) continue;
        if (seenIds.has(item.id)) item.id = `${item.id}-${i}`;
        seenIds.add(item.id);
        out.push(item);
      }
      return out;
    } catch {
      return [];
    }
  }

  function saveQueue(storage, cascadeId, items) {
    if (!storage || !cascadeId) return false;
    try {
      const normalized = [];
      const src = Array.isArray(items) ? items : [];
      for (let i = 0; i < src.length && normalized.length < MAX_QUEUE_ITEMS; i++) {
        const item = sanitizeQueueItem(src[i], Date.now(), i);
        if (item) normalized.push(item);
      }
      if (normalized.length === 0) {
        storage.removeItem?.(STORAGE_PREFIX + cascadeId);
      } else {
        storage.setItem(STORAGE_PREFIX + cascadeId, JSON.stringify(normalized));
      }
      return true;
    } catch {
      return false;
    }
  }

  function clearQueue(storage, cascadeId) {
    if (!storage || !cascadeId) return false;
    try {
      storage.removeItem?.(STORAGE_PREFIX + cascadeId);
      return true;
    } catch {
      return false;
    }
  }

  function cloneItems(items) {
    return items.map((it) => ({ id: it.id, text: it.text, createdAt: it.createdAt }));
  }

  function isOwnedNode(el) {
    let cur = el;
    while (cur) {
      if (
        cur.getAttribute?.('data-ag-sag-owned') === '1' ||
        cur.getAttribute?.('data-ag-sg-owned') === '1' ||
        cur.getAttribute?.('data-testid') === 'ag-sag-queue-bar'
      ) {
        return true;
      }
      cur = cur.parentElement;
    }
    return false;
  }

  function isElementVisible(el, win) {
    if (!el || el.isConnected === false) return false;
    let cur = el;
    while (cur) {
      if (cur.hidden === true || cur.hasAttribute?.('hidden')) return false;
      if (cur.getAttribute?.('aria-hidden') === 'true') return false;
      if (cur.style) {
        const display = String(cur.style.display || '').trim().toLowerCase();
        const visibility = String(cur.style.visibility || '').trim().toLowerCase();
        const opacity = String(cur.style.opacity ?? '').trim();
        if (display === 'none' || visibility === 'hidden' || opacity === '0') {
          return false;
        }
      }
      if (typeof win?.getComputedStyle === 'function') {
        try {
          const cs = win.getComputedStyle(cur);
          if (cs) {
            const display = String(cs.display || '').trim().toLowerCase();
            const visibility = String(cs.visibility || '').trim().toLowerCase();
            const opacity = String(cs.opacity ?? '').trim();
            if (display === 'none' || visibility === 'hidden' || opacity === '0') {
              return false;
            }
          }
        } catch {}
      }
      cur = cur.parentElement;
    }
    return true;
  }

  function safeQueryAll(root, selector) {
    if (!root || typeof root.querySelectorAll !== 'function') return [];
    try {
      return Array.from(root.querySelectorAll(selector) || []);
    } catch {
      return [];
    }
  }

  function getUiStrings(lang) {
    const isZh = String(lang || '').toLowerCase().startsWith('zh');
    if (isZh) {
      return {
        addTrigger: '+ 排队',
        title: '指令队列',
        pause: '暂停',
        resume: '继续',
        clear: '清空',
        collapse: '收起',
        add: '入队',
        placeholder: '输入后续指令，按 Enter 入队…',
        moveUp: '上移',
        moveDown: '下移',
        remove: '删除',
        statusPaused: '已暂停',
        statusStreaming: '等待当前回复完成',
        statusDraft: '输入框有草稿，已自动暂停',
        statusApproval: '等待审批处理，已自动暂停',
        statusSpecLock: 'agy-NOV Spec 写锁生效，队列暂停',
        statusReady: '空闲后自动发送',
      };
    }
    return {
      addTrigger: '+ Queue',
      title: 'Prompt Queue',
      pause: 'Pause',
      resume: 'Resume',
      clear: 'Clear',
      collapse: 'Hide',
      add: 'Add',
      placeholder: 'Queue next prompt, press Enter…',
      moveUp: 'Up',
      moveDown: 'Down',
      remove: 'Remove',
      statusPaused: 'Paused',
      statusStreaming: 'Waiting for stream',
      statusDraft: 'Paused: composer has draft',
      statusApproval: 'Paused: approval pending',
      statusSpecLock: 'Paused: agy-NOV Spec write-lock active',
      statusReady: 'Auto-send when idle',
    };
  }

  function createPromptQueueController(options = {}) {
    const win = options.win || globalRoot;
    const doc = options.doc || win?.document || null;
    const storage = options.storage !== undefined ? options.storage : win?.localStorage || null;
    const coexist = options.coexist || resolveDep('__agSgCoexist', './coexist.js');
    const ctxSrc = options.contextSource || resolveDep('__agSgContextSource', './context-source.js');
    const exporter = options.exporter || resolveDep('__agSgPrecompactExport', './precompact-export.js');
    const nowFn = typeof options.now === 'function' ? options.now : () => Date.now();
    const dispatchDelayMs = Math.max(0, Number(options.dispatchDelayMs ?? 1200));
    const autoObserve = options.autoObserve !== undefined ? Boolean(options.autoObserve) : true;

    let enabled = options.enabled !== undefined ? Boolean(options.enabled) : true;
    let paused = Boolean(options.paused);
    let panelOpen = false;
    let destroyed = false;
    let currentCid = '';
    let items = [];
    let seq = 0;
    let lastSkipReason = null;
    let dispatchedCount = 0;
    let lastDispatchedItem = null;
    let dispatchTimer = null;
    let observeTimer = null;
    let observer = null;
    let barEl = null;
    let triggerBtn = null;
    let panelEl = null;
    let titleTextEl = null;
    let statusEl = null;
    let pauseBtn = null;
    let clearBtn = null;
    let collapseBtn = null;
    let listEl = null;
    let inputEl = null;
    let addBtn = null;
    let createdStyleEl = null;
    const ownedNodes = new Set();
    const listeners = [];

    function markOwned(el) {
      if (!el || typeof el.setAttribute !== 'function') return el;
      if (coexist && typeof coexist.markOwnedNoTranslate === 'function') {
        coexist.markOwnedNoTranslate(el);
      } else {
        el.setAttribute('data-ag-sg-owned', '1');
        el.setAttribute('data-ag-no-i18n', '1');
        el.setAttribute('translate', 'no');
        el.setAttribute('data-no-translate', 'true');
      }
      el.setAttribute('data-ag-sag-owned', '1');
      ownedNodes.add(el);
      return el;
    }

    function detectLang() {
      if (typeof options.getLang === 'function') {
        try { return String(options.getLang() || 'en'); } catch {}
      }
      const attrLang =
        doc?.documentElement?.getAttribute?.('data-ag-sag-lang') ||
        doc?.documentElement?.getAttribute?.('data-ag-cs-lang') ||
        doc?.documentElement?.getAttribute?.('lang');
      if (attrLang) return attrLang;
      return String(win?.navigator?.language || 'en');
    }

    function getScope() {
      if (!doc) return null;
      return ctxSrc?.resolveActivePaneScope ? ctxSrc.resolveActivePaneScope(doc) : doc;
    }

    function detectCascadeId() {
      if (typeof options.getCascadeId === 'function') {
        try {
          const custom = String(options.getCascadeId() || '').trim();
          if (custom) return custom;
        } catch {}
      }
      const scope = getScope();
      if (ctxSrc && typeof ctxSrc.detectCascadeId === 'function') {
        const detected = ctxSrc.detectCascadeId(doc, win, scope);
        if (detected && detected !== 'default-session') return detected;
      }
      const cv = scope?.querySelector?.('[data-testid="conversation-view"]') || doc?.querySelector?.('[data-testid="conversation-view"]');
      const directCid = cv?.getAttribute?.('data-cascade-id') || doc?.querySelector?.('[data-cascade-id]')?.getAttribute?.('data-cascade-id') || '';
      if (directCid.trim()) return directCid.trim();
      const pathname = String(win?.location?.pathname || '');
      const m = pathname.match(/\/c\/([^/?#]+)/i);
      if (m && m[1]) return m[1];
      return 'default-session';
    }

    function emitQueueChange() {
      if (typeof options.onQueueChange === 'function') {
        try {
          options.onQueueChange({
            cascadeId: currentCid,
            items: cloneItems(items),
            paused,
            enabled,
          });
        } catch {}
      }
    }

    function clearDispatchTimer() {
      if (dispatchTimer) {
        clearTimeout(dispatchTimer);
        dispatchTimer = null;
      }
    }

    function clearObserveTimer() {
      if (observeTimer) {
        clearTimeout(observeTimer);
        observeTimer = null;
      }
    }

    function findComposerBox(scope = getScope()) {
      if (!doc) return null;
      const candidates = [
        ...safeQueryAll(scope, '[data-testid="agent-input-box"], .surface-composer-card'),
        ...safeQueryAll(doc, '[data-testid="agent-input-box"], .surface-composer-card'),
      ];
      return candidates.find((el) => el && !isOwnedNode(el)) || null;
    }

    function findComposerEditor(scope = getScope()) {
      if (!doc) return null;
      const box = findComposerBox(scope);
      const sel = '[data-lexical-editor="true"], [contenteditable="true"], textarea';
      const pools = [box, scope, doc].filter(Boolean);
      for (const pool of pools) {
        const found = safeQueryAll(pool, sel).find((el) => el && !isOwnedNode(el));
        if (found) return found;
      }
      return null;
    }

    function readComposerText(scope = getScope()) {
      const ed = findComposerEditor(scope);
      if (!ed) return '';
      const tag = String(ed.tagName || '').toUpperCase();
      const raw = tag === 'TEXTAREA' || tag === 'INPUT' ? ed.value : ed.textContent;
      return String(raw || '').replace(/\u200B/g, '').trim();
    }

    function checkStreaming(scope = getScope()) {
      if (typeof options.isStreaming === 'function') {
        try {
          if (options.isStreaming({ cascadeId: currentCid, doc, scope })) return true;
        } catch {}
      }
      if (!doc) return false;
      const sel = '[data-testid="stop-button"], [data-testid="input-cancel-button"]';
      const nodes = [...safeQueryAll(scope, sel), ...safeQueryAll(doc, sel)];
      for (const n of nodes) {
        if (!n || isOwnedNode(n)) continue;
        if (isElementVisible(n, win)) return true;
      }
      return false;
    }

    function checkBlockingApproval(scope = getScope()) {
      if (typeof options.hasBlockingApproval === 'function') {
        try {
          if (options.hasBlockingApproval({ cascadeId: currentCid, doc, scope })) return true;
        } catch {}
      }
      if (!doc) return false;
      const seen = new Set();
      const candidates = [];
      const pushList = (list) => {
        for (const el of list) {
          if (!el || seen.has(el) || isOwnedNode(el)) continue;
          seen.add(el);
          candidates.push(el);
        }
      };
      const approvalSel = '.approval-card, [data-testid*="approval"], [data-testid*="permission"], [role="alertdialog"]';
      pushList(safeQueryAll(scope, approvalSel));
      pushList(safeQueryAll(doc, approvalSel));
      // Fallback for minimal DOM mocks that do not implement [attr*="val"]
      for (const el of safeQueryAll(doc, '[data-testid]')) {
        if (!el || seen.has(el) || isOwnedNode(el)) continue;
        const tid = String(el.getAttribute?.('data-testid') || '').toLowerCase();
        if (tid.includes('approval') || tid.includes('permission')) {
          seen.add(el);
          candidates.push(el);
        }
      }
      return candidates.some((el) => isElementVisible(el, win));
    }

    function evaluateReadiness() {
      if (destroyed) return { ready: false, reason: 'destroyed' };
      if (!enabled) return { ready: false, reason: 'disabled' };
      if (paused) return { ready: false, reason: 'paused' };
      if (items.length === 0) return { ready: false, reason: 'empty' };

      const scope = getScope();
      if (checkStreaming(scope)) {
        return { ready: false, reason: 'streaming' };
      }
      if (readComposerText(scope).length > 0) {
        return { ready: false, reason: 'composer-occupied' };
      }
      if (checkBlockingApproval(scope)) {
        return { ready: false, reason: 'blocking-approval' };
      }
      if (typeof options.isSpecWriteLocked === 'function' && options.isSpecWriteLocked()) {
        return { ready: false, reason: 'spec-write-lock' };
      }
      return { ready: true, reason: null, scope };
    }

    function dispatchInputEvent(target) {
      const EvCtor = win?.Event || globalThis.Event;
      if (typeof EvCtor === 'function') {
        try {
          target.dispatchEvent?.(new EvCtor('input', { bubbles: true }));
          return;
        } catch {}
      }
      target.dispatchEvent?.({ type: 'input', bubbles: true, target });
    }

    function writeAndSubmitComposer(text, scope) {
      const ed = findComposerEditor(scope);
      if (!ed) return { ok: false, reason: 'no-editor' };
      try {
        try {
          ed.focus?.({ preventScroll: true });
        } catch {
          ed.focus?.();
        }
        const tag = String(ed.tagName || '').toUpperCase();
        if (tag === 'TEXTAREA' || tag === 'INPUT') {
          ed.value = text;
          dispatchInputEvent(ed);
        } else {
          try {
            const sel = win?.getSelection?.() || doc?.getSelection?.();
            if (sel?.removeAllRanges && doc?.createRange) {
              const range = doc.createRange();
              range.selectNodeContents(ed);
              range.collapse(false);
              sel.removeAllRanges();
              sel.addRange(range);
            }
          } catch {}
          if (typeof doc?.execCommand === 'function' && doc.execCommand('insertText', false, text)) {
            // inserted via execCommand
          } else {
            ed.textContent = text;
            dispatchInputEvent(ed);
          }
        }
      } catch {
        return { ok: false, reason: 'insert-failed' };
      }

      const box = findComposerBox(scope);
      const sendSels = [
        '[data-testid="send-button"]',
        '[data-testid="input-send-button"]',
        'button[type="submit"]',
      ];
      const scopes = [box, scope, doc].filter(Boolean);
      let sendBtn = null;
      for (const sc of scopes) {
        for (const sel of sendSels) {
          const btns = safeQueryAll(sc, sel);
          sendBtn = btns.find(
            (b) =>
              b &&
              !isOwnedNode(b) &&
              !b.disabled &&
              b.getAttribute?.('aria-disabled') !== 'true' &&
              !b.hasAttribute?.('disabled') &&
              typeof b.click === 'function'
          );
          if (sendBtn) break;
        }
        if (sendBtn) break;
      }

      if (sendBtn) {
        sendBtn.click();
        return { ok: true, method: 'click-send-button' };
      }

      const KEv = win?.KeyboardEvent || globalThis.KeyboardEvent;
      if (typeof KEv === 'function') {
        try {
          ed.dispatchEvent?.(new KEv('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
          return { ok: true, method: 'enter-key' };
        } catch {}
      }
      return { ok: true, method: 'fill-only' };
    }

    function ensureStyle() {
      if (!doc) return;
      if (doc.getElementById?.(STYLE_ID)) return;
      const el = doc.createElement('style');
      el.id = STYLE_ID;
      el.textContent = QUEUE_CSS;
      markOwned(el);
      (doc.head || doc.documentElement || doc.body)?.appendChild?.(el);
      createdStyleEl = el;
    }

    function ensureBar() {
      if (!doc) return null;
      const anchor = findComposerBox();
      if (!anchor || !anchor.parentElement) return null;
      ensureStyle();

      if (barEl && barEl.isConnected !== false) {
        if (barEl.parentElement !== anchor.parentElement) {
          anchor.parentElement.insertBefore(barEl, anchor);
        }
        return barEl;
      }

      const bar = markOwned(doc.createElement('div'));
      bar.className = 'ag-sag-queue-bar';
      bar.setAttribute('data-testid', 'ag-sag-queue-bar');
      bar.setAttribute('role', 'region');

      triggerBtn = doc.createElement('button');
      triggerBtn.type = 'button';
      triggerBtn.className = 'ag-sag-queue-trigger';
      triggerBtn.setAttribute('data-ag-sag-act', 'queue-open');
      triggerBtn.addEventListener('click', (ev) => {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
        togglePanel(true);
        try { inputEl?.focus?.(); } catch {}
      });

      panelEl = doc.createElement('div');
      panelEl.className = 'ag-sag-queue-panel';
      panelEl.hidden = true;

      const head = doc.createElement('div');
      head.className = 'ag-sag-queue-head';

      const titleWrap = doc.createElement('div');
      titleWrap.className = 'ag-sag-queue-title';
      titleTextEl = doc.createElement('span');
      statusEl = doc.createElement('span');
      statusEl.className = 'ag-sag-queue-status';
      titleWrap.appendChild(titleTextEl);
      titleWrap.appendChild(statusEl);

      const acts = doc.createElement('div');
      acts.className = 'ag-sag-queue-actions';

      pauseBtn = doc.createElement('button');
      pauseBtn.type = 'button';
      pauseBtn.className = 'ag-sag-queue-btn';
      pauseBtn.setAttribute('data-ag-sag-act', 'queue-toggle-pause');
      pauseBtn.addEventListener('click', (ev) => {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
        setPaused(!paused);
      });

      clearBtn = doc.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'ag-sag-queue-btn';
      clearBtn.setAttribute('data-ag-sag-act', 'queue-clear');
      clearBtn.addEventListener('click', (ev) => {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
        clear();
      });

      collapseBtn = doc.createElement('button');
      collapseBtn.type = 'button';
      collapseBtn.className = 'ag-sag-queue-btn';
      collapseBtn.setAttribute('data-ag-sag-act', 'queue-toggle-panel');
      collapseBtn.addEventListener('click', (ev) => {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
        togglePanel(false);
      });

      acts.appendChild(pauseBtn);
      acts.appendChild(clearBtn);
      acts.appendChild(collapseBtn);
      head.appendChild(titleWrap);
      head.appendChild(acts);

      listEl = doc.createElement('ul');
      listEl.className = 'ag-sag-queue-list';
      listEl.setAttribute('data-testid', 'ag-sag-queue-list');

      const composer = doc.createElement('div');
      composer.className = 'ag-sag-queue-composer';
      composer.setAttribute('data-testid', 'ag-sag-queue-composer');

      inputEl = doc.createElement('input');
      inputEl.type = 'text';
      inputEl.className = 'ag-sag-queue-input';
      inputEl.setAttribute('data-testid', 'ag-sag-queue-input');
      inputEl.addEventListener('keydown', (ev) => {
        if (!ev || ev.key !== 'Enter' || ev.shiftKey || ev.isComposing) return;
        ev.preventDefault?.();
        ev.stopPropagation?.();
        const text = inputEl.value;
        if (enqueue(text)) {
          inputEl.value = '';
        }
      });

      addBtn = doc.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'ag-sag-queue-btn';
      addBtn.setAttribute('data-ag-sag-act', 'queue-add');
      addBtn.addEventListener('click', (ev) => {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
        const text = inputEl.value;
        if (enqueue(text)) {
          inputEl.value = '';
        }
      });

      composer.appendChild(inputEl);
      composer.appendChild(addBtn);

      panelEl.appendChild(head);
      panelEl.appendChild(listEl);
      panelEl.appendChild(composer);

      bar.appendChild(triggerBtn);
      bar.appendChild(panelEl);

      anchor.parentElement.insertBefore(bar, anchor);
      barEl = bar;
      return barEl;
    }

    function formatPreview(text) {
      const safe = (exporter && typeof exporter.redactSecrets === 'function' ? exporter.redactSecrets(text) : text)
        .replace(/\s+/g, ' ')
        .trim();
      return safe.length > 72 ? `${safe.slice(0, 72)}…` : safe;
    }

    function renderBar() {
      if (destroyed || !doc) return;
      if (!enabled) {
        if (barEl) barEl.hidden = true;
        return;
      }
      const bar = ensureBar();
      if (!bar) return;

      const s = getUiStrings(detectLang());
      const expanded = items.length > 0 || panelOpen;

      bar.hidden = false;
      bar.setAttribute('data-state', expanded ? 'expanded' : 'collapsed');
      triggerBtn.textContent = s.addTrigger;
      triggerBtn.hidden = expanded;
      panelEl.hidden = !expanded;

      if (!expanded) return;

      titleTextEl.textContent = `${s.title} (${items.length}/${MAX_QUEUE_ITEMS})`;
      if (paused) statusEl.textContent = s.statusPaused;
      else if (lastSkipReason === 'streaming') statusEl.textContent = s.statusStreaming;
      else if (lastSkipReason === 'composer-occupied') statusEl.textContent = s.statusDraft;
      else if (lastSkipReason === 'blocking-approval') statusEl.textContent = s.statusApproval;
      else if (lastSkipReason === 'spec-write-lock') statusEl.textContent = s.statusSpecLock || 'Spec write-lock active, paused';
      else statusEl.textContent = s.statusReady;

      pauseBtn.textContent = paused ? s.resume : s.pause;
      clearBtn.textContent = s.clear;
      clearBtn.disabled = items.length === 0;
      collapseBtn.textContent = s.collapse;
      collapseBtn.hidden = items.length > 0;
      addBtn.textContent = s.add;
      addBtn.disabled = items.length >= MAX_QUEUE_ITEMS;
      inputEl.setAttribute('placeholder', s.placeholder);

      while (listEl.firstChild) {
        listEl.removeChild(listEl.firstChild);
      }
      listEl.hidden = items.length === 0;

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const li = doc.createElement('li');
        li.className = 'ag-sag-queue-item';
        li.setAttribute('data-queue-id', it.id);

        const idxEl = doc.createElement('span');
        idxEl.className = 'ag-sag-queue-idx';
        idxEl.textContent = `${i + 1}.`;

        const previewEl = doc.createElement('span');
        previewEl.className = 'ag-sag-queue-preview';
        previewEl.textContent = formatPreview(it.text);

        const itemActs = doc.createElement('div');
        itemActs.className = 'ag-sag-queue-item-acts';

        const upBtn = doc.createElement('button');
        upBtn.type = 'button';
        upBtn.className = 'ag-sag-queue-btn';
        upBtn.textContent = s.moveUp;
        upBtn.disabled = i === 0;
        upBtn.setAttribute('data-ag-sag-act', 'queue-move-up');
        upBtn.setAttribute('data-queue-id', it.id);
        upBtn.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          move(it.id, -1);
        });

        const downBtn = doc.createElement('button');
        downBtn.type = 'button';
        downBtn.className = 'ag-sag-queue-btn';
        downBtn.textContent = s.moveDown;
        downBtn.disabled = i === items.length - 1;
        downBtn.setAttribute('data-ag-sag-act', 'queue-move-down');
        downBtn.setAttribute('data-queue-id', it.id);
        downBtn.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          move(it.id, 1);
        });

        const delBtn = doc.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'ag-sag-queue-btn';
        delBtn.textContent = s.remove;
        delBtn.setAttribute('data-ag-sag-act', 'queue-remove');
        delBtn.setAttribute('data-queue-id', it.id);
        delBtn.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          remove(it.id);
        });

        itemActs.appendChild(upBtn);
        itemActs.appendChild(downBtn);
        itemActs.appendChild(delBtn);

        li.appendChild(idxEl);
        li.appendChild(previewEl);
        li.appendChild(itemActs);
        listEl.appendChild(li);
      }
    }

    function refreshCascade(forceLoad = false) {
      const nextCid = detectCascadeId();
      if (forceLoad || nextCid !== currentCid) {
        currentCid = nextCid;
        items = loadQueue(storage, currentCid, nowFn());
        clearDispatchTimer();
        lastSkipReason = null;
        return true;
      }
      return false;
    }

    function scheduleDispatch(precomputedCheck) {
      if (destroyed || !enabled || paused || items.length === 0) {
        clearDispatchTimer();
        return;
      }
      const check = precomputedCheck || evaluateReadiness();
      if (!check.ready) {
        clearDispatchTimer();
        if (check.reason !== 'empty' && check.reason !== 'disabled' && check.reason !== 'destroyed') {
          lastSkipReason = check.reason;
        }
        renderBar();
        return;
      }
      // Preserve an already scheduled countdown to prevent timer starvation under frequent DOM mutations.
      if (dispatchTimer !== null) return;
      dispatchTimer = setTimeout(() => {
        dispatchTimer = null;
        flushIfReady();
      }, dispatchDelayMs);
      dispatchTimer?.unref?.();
    }

    function flushIfReady() {
      clearDispatchTimer();
      if (destroyed) return { dispatched: false, reason: 'destroyed' };
      refreshCascade(false);

      const check = evaluateReadiness();
      if (!check.ready) {
        if (check.reason === 'empty') {
          lastSkipReason = null;
        } else if (check.reason !== 'disabled' && check.reason !== 'destroyed') {
          lastSkipReason = check.reason;
        }
        renderBar();
        return { dispatched: false, reason: check.reason };
      }

      const head = items[0];
      if (!head) return { dispatched: false, reason: 'empty' };

      if (typeof options.onDispatch === 'function') {
        const snapshot = { id: head.id, text: head.text, createdAt: head.createdAt };
        items.shift();
        saveQueue(storage, currentCid, items);
        let outcome;
        try {
          outcome = options.onDispatch(snapshot, { cascadeId: currentCid });
        } catch {
          items.unshift(head);
          saveQueue(storage, currentCid, items);
          lastSkipReason = 'dispatch-error';
          renderBar();
          return { dispatched: false, reason: 'dispatch-error' };
        }
        if (outcome === false || (outcome && typeof outcome === 'object' && outcome.ok === false)) {
          items.unshift(head);
          saveQueue(storage, currentCid, items);
          lastSkipReason = (outcome && outcome.reason) || 'dispatch-rejected';
          renderBar();
          return { dispatched: false, reason: lastSkipReason };
        }
        lastSkipReason = null;
        dispatchedCount += 1;
        lastDispatchedItem = snapshot;
        renderBar();
        emitQueueChange();
        return { dispatched: true, item: snapshot, method: 'custom-callback' };
      }

      const res = writeAndSubmitComposer(head.text, check.scope);
      if (!res.ok) {
        lastSkipReason = res.reason || 'insert-failed';
        renderBar();
        return { dispatched: false, reason: lastSkipReason };
      }

      const dispatchedItem = { id: head.id, text: head.text, createdAt: head.createdAt };
      items.shift();
      saveQueue(storage, currentCid, items);
      lastSkipReason = null;
      dispatchedCount += 1;
      lastDispatchedItem = dispatchedItem;
      renderBar();
      emitQueueChange();
      return { dispatched: true, item: dispatchedItem, method: res.method };
    }

    function enqueue(text) {
      if (destroyed) return null;
      refreshCascade(false);
      const normalized = normalizeQueueText(text);
      if (!normalized) return null;
      if (items.length >= MAX_QUEUE_ITEMS) return null;
      const item = {
        id: `q-${nowFn()}-${++seq}`,
        text: normalized,
        createdAt: nowFn(),
      };
      items.push(item);
      saveQueue(storage, currentCid, items);
      renderBar();
      emitQueueChange();
      if (enabled && !paused) {
        scheduleDispatch();
      }
      return { id: item.id, text: item.text, createdAt: item.createdAt };
    }

    function remove(id) {
      if (destroyed || !id) return false;
      refreshCascade(false);
      const idx = items.findIndex((it) => it.id === id);
      if (idx < 0) return false;
      items.splice(idx, 1);
      saveQueue(storage, currentCid, items);
      if (items.length === 0) {
        clearDispatchTimer();
        lastSkipReason = null;
      }
      renderBar();
      emitQueueChange();
      return true;
    }

    function move(id, delta) {
      if (destroyed || !id) return false;
      refreshCascade(false);
      const step = Number(delta);
      if (!Number.isFinite(step) || step === 0) return false;
      const idx = items.findIndex((it) => it.id === id);
      if (idx < 0) return false;
      const nextIdx = Math.max(0, Math.min(items.length - 1, idx + Math.trunc(step)));
      if (nextIdx === idx) return false;
      const [moved] = items.splice(idx, 1);
      items.splice(nextIdx, 0, moved);
      saveQueue(storage, currentCid, items);
      renderBar();
      emitQueueChange();
      return true;
    }

    function clear() {
      if (destroyed) return 0;
      refreshCascade(false);
      const removedCount = items.length;
      items = [];
      clearDispatchTimer();
      lastSkipReason = null;
      clearQueue(storage, currentCid);
      renderBar();
      emitQueueChange();
      return removedCount;
    }

    function setPaused(val) {
      if (destroyed) return paused;
      paused = Boolean(val);
      if (paused) {
        clearDispatchTimer();
        lastSkipReason = 'paused';
      } else {
        if (lastSkipReason === 'paused') lastSkipReason = null;
        scheduleDispatch();
      }
      renderBar();
      emitQueueChange();
      return paused;
    }

    function removeOwnedDom() {
      for (const node of ownedNodes) {
        try { node?.remove?.(); } catch {}
      }
      ownedNodes.clear();
      try { barEl?.remove?.(); } catch {}
      try { createdStyleEl?.remove?.(); } catch {}
      barEl = triggerBtn = panelEl = titleTextEl = statusEl = null;
      pauseBtn = clearBtn = collapseBtn = listEl = inputEl = addBtn = createdStyleEl = null;
    }

    function stopObserver() {
      clearObserveTimer();
      if (observer) {
        try { observer.disconnect(); } catch {}
        observer = null;
      }
    }

    function setEnabled(val) {
      if (destroyed) return enabled;
      enabled = Boolean(val);
      if (!enabled) {
        clearDispatchTimer();
        stopObserver();
        removeOwnedDom();
      } else {
        startObserver();
        sync();
      }
      emitQueueChange();
      return enabled;
    }

    function togglePanel(force) {
      if (destroyed) return false;
      panelOpen = typeof force === 'boolean' ? force : !panelOpen;
      renderBar();
      return panelOpen;
    }

    function sync() {
      if (destroyed) return;
      const switched = refreshCascade(false);
      if (!enabled) {
        clearDispatchTimer();
        stopObserver();
        removeOwnedDom();
        return;
      }
      if (items.length > 0 && !paused) {
        const check = evaluateReadiness();
        if (!check.ready && check.reason !== 'empty') {
          lastSkipReason = check.reason;
          clearDispatchTimer();
        } else if (check.ready) {
          lastSkipReason = null;
          if (dispatchTimer === null) {
            scheduleDispatch(check);
          }
        }
      } else if (paused && items.length > 0) {
        lastSkipReason = 'paused';
        clearDispatchTimer();
      } else if (items.length === 0) {
        lastSkipReason = null;
        clearDispatchTimer();
      }
      renderBar();
      if (switched) emitQueueChange();
    }

    function startObserver() {
      if (destroyed || !enabled || !autoObserve || !doc || observer) return;
      const MO = win?.MutationObserver || globalThis.MutationObserver;
      const target = doc.body || doc.documentElement;
      if (typeof MO !== 'function' || !target) return;
      observer = new MO((records) => {
        if (destroyed || !enabled) return;
        const hasExternal = Array.isArray(records)
          ? records.some((r) => r && !isOwnedNode(r.target))
          : true;
        if (!hasExternal) return;
        if (observeTimer) return;
        observeTimer = setTimeout(() => {
          observeTimer = null;
          sync();
        }, 60);
        observeTimer?.unref?.();
      });
      try {
        observer.observe(target, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['hidden', 'aria-hidden', 'disabled', 'data-cascade-id', 'data-ag-sag-lang', 'style', 'class'],
        });
      } catch {
        observer = null;
      }
    }

    function addL(target, ev, fn, cap = false) {
      if (!target || typeof target.addEventListener !== 'function') return;
      target.addEventListener(ev, fn, cap);
      listeners.push(() => target.removeEventListener?.(ev, fn, cap));
    }

    addL(doc, 'input', (ev) => {
      if (destroyed || !enabled || isOwnedNode(ev?.target)) return;
      if (items.length > 0 && readComposerText().length > 0) {
        clearDispatchTimer();
        lastSkipReason = 'composer-occupied';
        renderBar();
      }
    }, true);

    function getItems() {
      if (destroyed) return [];
      refreshCascade(false);
      return cloneItems(items);
    }

    function getDebugState() {
      return {
        enabled,
        destroyed,
        paused,
        panelOpen,
        cascadeId: currentCid,
        itemCount: items.length,
        items: cloneItems(items),
        lastSkipReason,
        autoPaused:
          lastSkipReason === 'composer-occupied' ||
          lastSkipReason === 'blocking-approval' ||
          lastSkipReason === 'spec-write-lock',
        dispatchedCount,
        lastDispatchedItem: lastDispatchedItem ? { ...lastDispatchedItem } : null,
        barMounted: Boolean(barEl && barEl.isConnected !== false),
        barVisible: Boolean(barEl && !barEl.hidden),
        pendingTimer: Boolean(dispatchTimer),
        observing: Boolean(observer),
      };
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      enabled = false;
      clearDispatchTimer();
      stopObserver();
      while (listeners.length) {
        try { listeners.pop()(); } catch {}
      }
      removeOwnedDom();
      items = [];
    }

    refreshCascade(true);
    if (enabled) {
      startObserver();
      renderBar();
    }

    return {
      enqueue,
      remove,
      move,
      clear,
      setPaused,
      setEnabled,
      togglePanel,
      sync,
      flushIfReady,
      getItems,
      getDebugState,
      destroy,
    };
  }

  return {
    STORAGE_PREFIX,
    MAX_QUEUE_ITEMS,
    MAX_ITEM_CHARS,
    normalizeQueueText,
    loadQueue,
    saveQueue,
    clearQueue,
    getUiStrings,
    createPromptQueueController,
  };
});
