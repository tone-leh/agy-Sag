// agy-Sag — Opt-In Thought & Sidebar Title Real-Time Translator (UMD, zero runtime deps)
// Strictly opt-in (default OFF). All external network requests go through the zero-port CDP HostBridge
// into Node Sidecar's TranslatorService (never stores API keys or makes external fetch calls in the page).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSagThoughtTranslator = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  const TRIGGER_SEL = 'button[data-testid="thinking-collapsible-trigger"]';
  const TITLE_SEL = '[data-testid="conversation-row-sidebar"], [data-testid="conversation-row-history"], [data-testid="breadcrumb-segment"]';
  const BOX_CLASS = 'ag-sag-thought-box';
  const BAR_CLASS = 'ag-sag-thought-bar';
  const MAX_CACHE = 200;
  const MAX_AUTO_PANELS_PER_SCAN = 5;
  const MAX_AUTO_CONCURRENT = 2;
  const MAX_TITLES_PER_SCAN = 15;
  const MAX_TITLE_CONCURRENT = 2;
  const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

  function resolveDep(globalKey, relPath) {
    if (globalRoot && globalRoot[globalKey]) return globalRoot[globalKey];
    if (typeof require === 'function') {
      try { return require(relPath); } catch { return null; }
    }
    return null;
  }

  function isTriggerStreaming(btn) {
    if (!btn) return false;
    if (btn.getAttribute?.('data-op-thought-state') === 'streaming') return true;
    if (btn.getAttribute?.('data-ag-cs-spark-streaming') === '1') return true;
    try {
      if (btn.querySelector?.('.animate-spin, .animate-pulse, .animate-shimmer-text, [class*="animate-shimmer"]')) {
        return true;
      }
    } catch {}
    const txt = String(btn.textContent || '').trim();
    if (/thinking|正在思考|思考中|推演中/i.test(txt) && !/\d+\s*(s|sec|秒|m|min|分)/i.test(txt)) {
      return true;
    }
    return false;
  }

  function findThoughtPanel(btn) {
    if (!btn) return null;
    const ctrlId = btn.getAttribute?.('aria-controls');
    if (ctrlId && btn.ownerDocument?.getElementById) {
      const byId = btn.ownerDocument.getElementById(ctrlId);
      if (byId) return byId;
    }
    let sib = btn.nextElementSibling;
    while (sib) {
      if (sib.getAttribute?.('data-ag-sag-owned') !== '1' && !sib.classList?.contains?.(BOX_CLASS)) {
        return sib;
      }
      sib = sib.nextElementSibling;
    }
    const parent = btn.parentElement;
    if (parent && parent.children && parent.children.length >= 2) {
      for (const ch of Array.from(parent.children)) {
        if (ch !== btn && ch.getAttribute?.('data-ag-sag-owned') !== '1') {
          return ch;
        }
      }
    }
    return null;
  }

  function extractThoughtText(panel) {
    if (!panel) return '';
    // Read text excluding our own injected translation nodes
    const parts = [];
    const walk = (node) => {
      if (!node) return;
      if (node.nodeType === 3) {
        const s = String(node.nodeValue || '');
        if (s.trim()) parts.push(s);
        return;
      }
      if (node.nodeType !== 1) return;
      if (node.getAttribute?.('data-ag-sag-owned') === '1' || node.getAttribute?.('data-ag-sg-owned') === '1') return;
      if (node.getAttribute?.('data-op-thought') === '1') return;
      const children = node.childNodes ? Array.from(node.childNodes) : [];
      for (const c of children) walk(c);
      const tag = String(node.tagName || '').toUpperCase();
      if (tag === 'P' || tag === 'DIV' || tag === 'LI' || tag === 'BR' || tag === 'PRE') {
        parts.push('\n');
      }
    };
    walk(panel);
    return parts
      .join('')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function createThoughtTranslatorController(options = {}) {
    const win = options.win || globalRoot;
    const doc = options.doc || win?.document || null;
    const coexist = options.coexist || resolveDep('__agSgCoexist', './coexist.js');

    let enabled = Boolean(options.enabled);
    let engine = String(options.engine || 'mt');
    let targetLang = String(options.targetLang || 'zh-CN');
    let triggerMode = options.triggerMode === 'manual' ? 'manual' : 'auto';
    let viewMode = options.viewMode === 'translated' ? 'translated' : 'bilingual';
    let translateTitles = Boolean(options.translateTitles);
    let conflictPolicy = options.conflictPolicy === 'takeover' ? 'takeover' : 'yield';

    let destroyed = false;
    let observer = null;
    let busOff = null;
    let scanTimer = null;
    let yieldedToPrism = false;
    let runEpoch = 0;

    const requestTimeoutMs = Math.max(100, Number(options.requestTimeoutMs) || DEFAULT_REQUEST_TIMEOUT_MS);
    const cache = new Map();
    const inFlightKeys = new Set();
    let panelState = new WeakMap(); // panel -> { sourceText, translated, showOriginal, boxEl }
    const hiddenSrcPanels = new Set(); // track panels with data-ag-sag-thought-hide-src for O(k) cleanup
    const titleOriginals = new WeakMap(); // textNode -> { orig, translated }
    const modifiedTitles = new Set(); // track Text nodes for 100% lossless restore
    const autoQueue = [];
    const autoQueuedSet = new WeakSet();
    let autoInFlight = 0;
    const titleQueue = [];
    const titleQueuedSet = new WeakSet();
    let titleInFlight = 0;

    const safeAppend = (parent, node) => {
      if (typeof coexist?.safeAppendChild === 'function') return coexist.safeAppendChild(parent, node);
      try { parent?.appendChild?.(node); return true; } catch { return false; }
    };
    const safeInsert = (parent, node, ref) => {
      if (typeof coexist?.safeInsertBefore === 'function') return coexist.safeInsertBefore(parent, node, ref);
      try {
        if (ref && ref.parentElement === parent && typeof parent.insertBefore === 'function') {
          parent.insertBefore(node, ref);
          return true;
        }
        parent?.appendChild?.(node);
        return true;
      } catch {
        return false;
      }
    };
    const safeRemove = (node) => {
      if (typeof coexist?.safeRemoveNode === 'function') return coexist.safeRemoveNode(node);
      try { node?.remove?.(); return true; } catch { return false; }
    };

    const requestWithTimeout = (req) =>
      new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          resolve({ ok: false, error: 'Translation timeout' });
        }, requestTimeoutMs);
        timer?.unref?.();
        let reqPromise;
        try {
          reqPromise = Promise.resolve(options.onRequestTranslate(req));
        } catch (err) {
          settled = true;
          clearTimeout(timer);
          reject(err);
          return;
        }
        reqPromise.then(
          (res) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(res);
          },
          (err) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(err);
          }
        );
      });

    const pruneDetachedTitles = () => {
      for (const tn of Array.from(modifiedTitles)) {
        if (!tn || tn.isConnected === false || tn.parentElement?.isConnected === false) {
          modifiedTitles.delete(tn);
        }
      }
    };

    const clearAutoQueue = () => {
      while (autoQueue.length) {
        const p = autoQueue.pop();
        if (p) autoQueuedSet.delete(p);
      }
    };

    const clearTitleQueue = () => {
      while (titleQueue.length) {
        const item = titleQueue.pop();
        if (item?.textNode) titleQueuedSet.delete(item.textNode);
      }
    };

    const drainAutoQueue = () => {
      while (autoInFlight < MAX_AUTO_CONCURRENT && autoQueue.length > 0 && !destroyed && enabled && triggerMode === 'auto') {
        const panel = autoQueue.shift();
        if (panel) autoQueuedSet.delete(panel);
        if (!panel || panel.isConnected === false) continue;
        autoInFlight += 1;
        void Promise.resolve(translatePanel(panel, { force: false }))
          .catch(() => {})
          .finally(() => {
            autoInFlight = Math.max(0, autoInFlight - 1);
            if (!destroyed && enabled && triggerMode === 'auto') drainAutoQueue();
          });
      }
    };

    const enqueueAutoPanel = (panel) => {
      if (!panel || autoQueuedSet.has(panel)) return;
      if (autoQueue.length >= MAX_AUTO_PANELS_PER_SCAN) return;
      autoQueuedSet.add(panel);
      autoQueue.push(panel);
    };

    const getEffectiveTargetLang = () => {
      if (targetLang && targetLang !== 'auto') return targetLang;
      const hostLang = typeof options.getEffectiveLang === 'function' ? options.getEffectiveLang() : '';
      if (hostLang && hostLang !== 'auto' && hostLang !== 'en') return hostLang;
      return 'zh-CN';
    };

    const isPrismThoughtActive = () => {
      if (!doc || conflictPolicy === 'takeover') return false;
      const html = doc.documentElement;
      if (html?.hasAttribute?.('data-ag-prism-thought-owner')) return true;
      try {
        if (doc.querySelector?.('.ag-prism-thought-overlay[data-op-thought="1"]')) return true;
      } catch {}
      return false;
    };

    const getCache = (k) => {
      if (!cache.has(k)) return null;
      const v = cache.get(k);
      cache.delete(k);
      cache.set(k, v);
      return v;
    };

    const setCache = (k, v) => {
      if (cache.has(k)) cache.delete(k);
      cache.set(k, v);
      while (cache.size > MAX_CACHE) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.delete(oldest);
      }
    };

    const renderTranslatedBox = (panel, translatedText, meta = {}) => {
      if (!doc || !panel) return;
      let st = panelState.get(panel);
      if (!st) {
        st = { sourceText: meta.sourceText || '', translated: '', showOriginal: false, boxEl: null };
        panelState.set(panel, st);
      }
      st.translated = translatedText;
      if (meta.sourceText) st.sourceText = meta.sourceText;

      let box = panel.querySelector?.(`.${BOX_CLASS}[data-ag-sag-owned="1"]`) || null;
      if (!box && st.boxEl && st.boxEl.isConnected !== false && st.boxEl.parentElement === panel) {
        box = st.boxEl;
      }
      if (!box) {
        box = coexist.markOwnedNoTranslate(doc.createElement('div'));
        box.className = BOX_CLASS;
        box.setAttribute('data-testid', 'ag-sag-thought-box');
        if (!safeAppend(panel, box)) return;
      }
      st.boxEl = box;

      while (box.firstChild) box.removeChild(box.firstChild);

      const head = doc.createElement('div');
      head.className = 'ag-sag-thought-box-head';
      const tag = doc.createElement('span');
      tag.className = 'ag-sag-thought-tag';
      tag.textContent = meta.error
        ? `agy-Sag · ${meta.error}`
        : `agy-Sag · ${meta.engine || engine}${meta.cached ? ' (cached)' : ''}`;
      head.appendChild(tag);

      const acts = doc.createElement('div');
      acts.className = 'ag-sag-thought-actions';

      const toggleBtn = doc.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'ag-sag-thought-btn';
      toggleBtn.setAttribute('data-testid', 'ag-sag-thought-toggle');
      toggleBtn.textContent = st.showOriginal ? '译文' : viewMode === 'translated' ? '原文' : '隐藏译文';
      toggleBtn.addEventListener('click', (ev) => {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
        st.showOriginal = !st.showOriginal;
        applyViewModeToPanel(panel, st);
        toggleBtn.textContent = st.showOriginal ? '译文' : viewMode === 'translated' ? '原文' : '隐藏译文';
      });
      acts.appendChild(toggleBtn);

      const retryBtn = doc.createElement('button');
      retryBtn.type = 'button';
      retryBtn.className = 'ag-sag-thought-btn';
      retryBtn.setAttribute('data-testid', 'ag-sag-thought-retry');
      retryBtn.textContent = '重译';
      retryBtn.addEventListener('click', (ev) => {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
        void translatePanel(panel, { force: true });
      });
      acts.appendChild(retryBtn);

      head.appendChild(acts);
      box.appendChild(head);

      const body = doc.createElement('div');
      body.className = 'ag-sag-thought-body';
      body.setAttribute('data-testid', 'ag-sag-thought-body');
      if (meta.loading) {
        body.textContent = 'Translating…';
      } else if (meta.error) {
        body.setAttribute('data-tone', 'error');
        body.textContent = meta.error;
      } else {
        const lines = String(translatedText || '').split(/\n{2,}/);
        for (const para of lines) {
          const pEl = doc.createElement('p');
          pEl.textContent = para.trim();
          body.appendChild(pEl);
        }
      }
      box.appendChild(body);
      applyViewModeToPanel(panel, st);
    };

    const applyViewModeToPanel = (panel, st) => {
      if (!panel || !st) return;
      const box = st.boxEl;
      const body = box?.querySelector?.('.ag-sag-thought-body');
      const hideSource = viewMode === 'translated' && !st.showOriginal && Boolean(st.translated);
      const hideTranslated = viewMode === 'bilingual' && st.showOriginal;
      if (body) body.hidden = hideTranslated;
      if (hideSource) {
        panel.setAttribute?.('data-ag-sag-thought-hide-src', '1');
        hiddenSrcPanels.add(panel);
      } else if (panel.getAttribute?.('data-ag-sag-thought-hide-src') === '1' || hiddenSrcPanels.has(panel)) {
        panel.removeAttribute?.('data-ag-sag-thought-hide-src');
        hiddenSrcPanels.delete(panel);
      }
    };

    const ensureTriggerButton = (btn, panel) => {
      if (!doc || !btn || !panel) return;
      const existing = btn.parentElement?.querySelector?.(`.${BAR_CLASS}[data-ag-sag-owned="1"]`);
      if (existing) return;
      const chip = coexist.markOwnedNoTranslate(doc.createElement('button'));
      chip.type = 'button';
      chip.className = BAR_CLASS;
      chip.setAttribute('data-testid', 'ag-sag-thought-trigger-btn');
      chip.textContent = '译';
      chip.title = 'Translate thought block (agy-Sag)';
      chip.addEventListener('click', (ev) => {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
        void translatePanel(panel, { force: false });
      });
      safeInsert(btn.parentElement, chip, btn.nextElementSibling || null);
    };

    const translatePanel = async (panel, { force = false } = {}) => {
      if (destroyed || !enabled || !panel || yieldedToPrism || isPrismThoughtActive() || panel.isConnected === false) {
        return { ok: false, reason: 'disabled' };
      }
      const text = extractThoughtText(panel);
      if (!text || text.length < 4) return { ok: false, reason: 'empty' };
      const reqEngine = engine;
      const lang = getEffectiveTargetLang();
      const cacheKey = `thought|${reqEngine}|${lang}|${text}`;
      if (!force) {
        const hit = getCache(cacheKey);
        if (hit) {
          renderTranslatedBox(panel, hit, { sourceText: text, engine: reqEngine, cached: true });
          return { ok: true, cached: true, translated: hit };
        }
      }
      if (inFlightKeys.has(cacheKey)) return { ok: false, reason: 'in-flight' };
      if (typeof options.onRequestTranslate !== 'function') {
        renderTranslatedBox(panel, '', { sourceText: text, error: 'Watch sidecar bridge offline' });
        return { ok: false, reason: 'bridge-offline' };
      }
      const epoch = runEpoch;
      inFlightKeys.add(cacheKey);
      renderTranslatedBox(panel, '', { sourceText: text, loading: true });
      try {
        const res = await requestWithTimeout({
          engine: reqEngine,
          targetLang: lang,
          kind: 'thought',
          text,
          force,
        });
        if (
          epoch !== runEpoch ||
          destroyed ||
          !enabled ||
          yieldedToPrism ||
          isPrismThoughtActive() ||
          panel.isConnected === false
        ) {
          return { ok: false, reason: 'aborted' };
        }
        if (extractThoughtText(panel) !== text) {
          return { ok: false, reason: 'stale-source' };
        }
        if (res?.ok && res.data?.translated) {
          setCache(cacheKey, res.data.translated);
          renderTranslatedBox(panel, res.data.translated, {
            sourceText: text,
            engine: res.data.engine || reqEngine,
            cached: Boolean(res.data.cached),
          });
          return { ok: true, translated: res.data.translated };
        }
        renderTranslatedBox(panel, '', { sourceText: text, error: res?.error || 'Translation failed' });
        return { ok: false, error: res?.error || 'Translation failed' };
      } catch (err) {
        if (
          epoch === runEpoch &&
          !destroyed &&
          enabled &&
          !yieldedToPrism &&
          !isPrismThoughtActive() &&
          panel.isConnected !== false &&
          extractThoughtText(panel) === text
        ) {
          renderTranslatedBox(panel, '', { sourceText: text, error: err?.message || 'Translation failed' });
        }
        return { ok: false, error: err?.message || 'Translation failed' };
      } finally {
        inFlightKeys.delete(cacheKey);
      }
    };

    const drainTitleQueue = () => {
      while (
        titleInFlight < MAX_TITLE_CONCURRENT &&
        titleQueue.length > 0 &&
        !destroyed &&
        enabled &&
        translateTitles &&
        !yieldedToPrism &&
        !isPrismThoughtActive()
      ) {
        const task = titleQueue.shift();
        if (task?.textNode) titleQueuedSet.delete(task.textNode);
        if (!task || !task.textNode || task.textNode.isConnected === false || task.textNode.parentElement?.isConnected === false) {
          continue;
        }
        if (task.epoch !== runEpoch) continue;
        if (inFlightKeys.has(task.key)) continue;
        inFlightKeys.add(task.key);
        titleInFlight += 1;
        void requestWithTimeout({
          engine: task.engine,
          targetLang: task.lang,
          kind: 'title',
          text: task.origText,
          force: false,
        })
          .then((res) => {
            if (
              task.epoch !== runEpoch ||
              destroyed ||
              !enabled ||
              !translateTitles ||
              yieldedToPrism ||
              isPrismThoughtActive() ||
              task.textNode.isConnected === false ||
              task.textNode.parentElement?.isConnected === false
            ) {
              return;
            }
            if (res?.ok && res.data?.translated) {
              const tr = String(res.data.translated).trim();
              if (!tr) return;
              setCache(task.key, tr);
              titleOriginals.set(task.textNode, { orig: task.origText, translated: tr });
              modifiedTitles.add(task.textNode);
              try { task.textNode.nodeValue = tr; } catch {}
            }
          })
          .catch(() => {})
          .finally(() => {
            inFlightKeys.delete(task.key);
            titleInFlight = Math.max(0, titleInFlight - 1);
            if (!destroyed && enabled && translateTitles && !yieldedToPrism) drainTitleQueue();
          });
      }
    };

    const scanTitles = () => {
      if (!doc || !enabled || !translateTitles || yieldedToPrism || isPrismThoughtActive()) return;
      if (typeof options.onRequestTranslate !== 'function') return;
      const reqEngine = engine;
      const lang = getEffectiveTargetLang();
      const epoch = runEpoch;
      const nodes = Array.from(doc.querySelectorAll?.(TITLE_SEL) || []);
      let batchQueued = 0;
      for (const el of nodes) {
        if (!el || el.isConnected === false || el.getAttribute?.('data-ag-sag-owned') === '1') continue;
        // Find primary leaf text node
        const textNode = findFirstMeaningfulTextNode(el);
        if (!textNode || textNode.isConnected === false) continue;
        const curText = String(textNode.nodeValue || '').trim();
        if (!curText || curText.length < 3 || curText.length > 200) continue;
        const tracked = titleOriginals.get(textNode);
        if (tracked && tracked.translated === curText) continue;
        const origText = tracked ? tracked.orig : curText;
        const key = `title|${reqEngine}|${lang}|${origText}`;
        const hit = getCache(key);
        if (hit) {
          if (!tracked) {
            titleOriginals.set(textNode, { orig: origText, translated: hit });
            modifiedTitles.add(textNode);
          } else {
            tracked.translated = hit;
          }
          try { textNode.nodeValue = hit; } catch {}
          continue;
        }
        if (batchQueued >= MAX_TITLES_PER_SCAN || titleQueue.length >= MAX_TITLES_PER_SCAN) break;
        if (inFlightKeys.has(key) || titleQueuedSet.has(textNode)) continue;
        titleQueuedSet.add(textNode);
        titleQueue.push({ textNode, origText, key, engine: reqEngine, lang, epoch });
        batchQueued += 1;
      }
      drainTitleQueue();
    };

    function findFirstMeaningfulTextNode(rootEl) {
      if (!rootEl) return null;
      const stack = [rootEl];
      while (stack.length) {
        const cur = stack.shift();
        if (!cur) continue;
        if (cur.nodeType === 3) {
          if (String(cur.nodeValue || '').trim().length >= 3) return cur;
          continue;
        }
        if (cur.nodeType !== 1) continue;
        if (cur.getAttribute?.('data-ag-sag-owned') === '1' || cur.getAttribute?.('data-ag-no-i18n') === '1') continue;
        const children = cur.childNodes ? Array.from(cur.childNodes) : [];
        for (const c of children) stack.push(c);
      }
      return null;
    }

    const restoreTitles = () => {
      for (const tn of Array.from(modifiedTitles)) {
        const rec = titleOriginals.get(tn);
        if (rec && typeof rec.orig === 'string') {
          try { tn.nodeValue = rec.orig; } catch {}
        }
      }
      modifiedTitles.clear();
    };

    const cleanupDom = () => {
      restoreTitles();
      panelState = new WeakMap();
      if (!doc) return;
      try {
        doc.querySelectorAll?.(`.${BOX_CLASS}[data-ag-sag-owned="1"], .${BAR_CLASS}[data-ag-sag-owned="1"]`)?.forEach?.((n) => safeRemove(n));
      } catch {}
      for (const p of Array.from(hiddenSrcPanels)) {
        try { p.removeAttribute?.('data-ag-sag-thought-hide-src'); } catch {}
      }
      hiddenSrcPanels.clear();
      try {
        doc.querySelectorAll?.('[data-ag-sag-thought-hide-src="1"]')?.forEach?.((n) => {
          n.removeAttribute?.('data-ag-sag-thought-hide-src');
        });
      } catch {}
    };

    const scanNow = () => {
      if (destroyed || !doc) return;
      if (!enabled) {
        if (yieldedToPrism) runEpoch += 1;
        yieldedToPrism = false;
        clearAutoQueue();
        clearTitleQueue();
        cleanupDom();
        return;
      }
      if (isPrismThoughtActive()) {
        if (!yieldedToPrism) {
          yieldedToPrism = true;
          runEpoch += 1;
          clearAutoQueue();
          clearTitleQueue();
          cleanupDom();
        }
        return;
      }
      if (yieldedToPrism) {
        yieldedToPrism = false;
        runEpoch += 1;
      }
      pruneDetachedTitles();

      const triggers = Array.from(doc.querySelectorAll?.(TRIGGER_SEL) || []);
      let autoEligibleSeen = 0;
      for (let i = triggers.length - 1; i >= 0; i -= 1) {
        const btn = triggers[i];
        const panel = findThoughtPanel(btn);
        if (!panel) continue;
        ensureTriggerButton(btn, panel);
        const prev = panelState.get(panel);
        if (triggerMode === 'auto' && !isTriggerStreaming(btn)) {
          autoEligibleSeen += 1;
          if (autoEligibleSeen <= MAX_AUTO_PANELS_PER_SCAN) {
            const text = extractThoughtText(panel);
            if (text && (!prev || prev.sourceText !== text)) {
              enqueueAutoPanel(panel);
            } else if (prev) {
              applyViewModeToPanel(panel, prev);
            }
          } else if (prev) {
            applyViewModeToPanel(panel, prev);
          }
        } else if (prev) {
          applyViewModeToPanel(panel, prev);
        }
      }
      if (triggerMode === 'auto') drainAutoQueue();
      if (translateTitles) {
        scanTitles();
      } else if (modifiedTitles.size > 0) {
        clearTitleQueue();
        restoreTitles();
      }
    };

    const scheduleScan = () => {
      if (destroyed || !enabled) return;
      if (scanTimer) clearTimeout(scanTimer);
      scanTimer = setTimeout(() => {
        scanTimer = null;
        if (destroyed || !enabled) return;
        if (coexist?.isWindowHibernated?.(doc, win, false)) return;
        scanNow();
      }, 600);
      scanTimer?.unref?.();
    };

    const startObserver = () => {
      if (busOff || observer || !doc || options.autoObserve === false) return;
      if (typeof coexist?.getDomMutationBus === 'function') {
        busOff = coexist.getDomMutationBus(doc, win).subscribe(
          'thoughtTranslator',
          () => {
            if (!enabled || destroyed) return;
            scheduleScan();
          },
          { wakeOnResume: true }
        );
        return;
      }
      const MO = win?.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
      if (!MO || !doc.body) return;
      observer = new MO((records) => {
        if (!enabled || destroyed) return;
        if (coexist?.isWindowHibernated?.(doc, win, false)) return;
        if (typeof coexist?.isMutationOwnedOnly === 'function') {
          if (coexist.isMutationOwnedOnly(records)) return;
          scheduleScan();
          return;
        }
        for (const rec of records) {
          const target = rec.target;
          if (target?.closest?.('[data-ag-sag-owned="1"], [data-ag-sg-owned="1"]')) continue;
          scheduleScan();
          break;
        }
      });
      try {
        observer.observe(doc.body, { childList: true, subtree: true });
      } catch {}
    };

    const stopObserver = () => {
      if (scanTimer) {
        clearTimeout(scanTimer);
        scanTimer = null;
      }
      if (busOff) {
        try { busOff(); } catch {}
        busOff = null;
      }
      try { observer?.disconnect?.(); } catch {}
      observer = null;
    };

    const configure = (patch = {}) => {
      const prevEnabled = enabled;
      const prevEngine = engine;
      const prevTargetLang = targetLang;
      const prevConflictPolicy = conflictPolicy;
      if (typeof patch.enabled === 'boolean') enabled = patch.enabled;
      if (typeof patch.engine === 'string') engine = patch.engine;
      if (typeof patch.targetLang === 'string') targetLang = patch.targetLang;
      if (patch.triggerMode === 'auto' || patch.triggerMode === 'manual') triggerMode = patch.triggerMode;
      if (patch.viewMode === 'bilingual' || patch.viewMode === 'translated') viewMode = patch.viewMode;
      if (typeof patch.translateTitles === 'boolean') translateTitles = patch.translateTitles;
      if (patch.conflictPolicy === 'yield' || patch.conflictPolicy === 'takeover') conflictPolicy = patch.conflictPolicy;

      const engineOrLangChanged = engine !== prevEngine || targetLang !== prevTargetLang;
      if (!enabled || engineOrLangChanged || conflictPolicy !== prevConflictPolicy) {
        runEpoch += 1;
        clearAutoQueue();
        clearTitleQueue();
      }

      if (!enabled) {
        stopObserver();
        cleanupDom();
      } else {
        if (engineOrLangChanged) {
          cleanupDom();
        }
        if (!prevEnabled) startObserver();
        scanNow();
      }
    };

    const destroy = () => {
      if (destroyed) return;
      destroyed = true;
      enabled = false;
      runEpoch += 1;
      stopObserver();
      clearAutoQueue();
      clearTitleQueue();
      cleanupDom();
      cache.clear();
      inFlightKeys.clear();
    };

    if (enabled) {
      startObserver();
      scanNow();
    }

    return {
      configure,
      scanNow,
      translatePanel,
      clearCache: () => cache.clear(),
      getDebugState: () => ({
        enabled,
        destroyed,
        engine,
        targetLang: getEffectiveTargetLang(),
        triggerMode,
        viewMode,
        translateTitles,
        yieldedToPrism,
        cacheSize: cache.size,
        modifiedTitleCount: modifiedTitles.size,
      }),
      destroy,
    };
  }

  return {
    TRIGGER_SEL,
    TITLE_SEL,
    BOX_CLASS,
    BAR_CLASS,
    isTriggerStreaming,
    findThoughtPanel,
    extractThoughtText,
    createThoughtTranslatorController,
  };
});
