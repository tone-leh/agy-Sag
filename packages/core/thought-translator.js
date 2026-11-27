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
    let scanTimer = null;
    let yieldedToPrism = false;

    const cache = new Map();
    const inFlightKeys = new Set();
    const panelState = new WeakMap(); // panel -> { sourceText, translated, showOriginal, boxEl, hiddenOriginalNodes }
    const titleOriginals = new WeakMap(); // textNode -> { orig, translated }
    const modifiedTitles = new Set(); // track Text nodes for 100% lossless restore

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

      let box = panel.querySelector?.(`.${BOX_CLASS}[data-ag-sag-owned="1"]`) || st.boxEl;
      if (!box) {
        box = coexist.markOwnedNoTranslate(doc.createElement('div'));
        box.className = BOX_CLASS;
        box.setAttribute('data-testid', 'ag-sag-thought-box');
        panel.appendChild(box);
        st.boxEl = box;
      }

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
      const children = panel.children ? Array.from(panel.children) : [];
      for (const ch of children) {
        if (ch === box || ch.getAttribute?.('data-ag-sag-owned') === '1') continue;
        if (hideSource) {
          ch.setAttribute('data-ag-sag-thought-hidden', '1');
          if (ch.style) ch.style.display = 'none';
        } else if (ch.getAttribute?.('data-ag-sag-thought-hidden') === '1') {
          ch.removeAttribute('data-ag-sag-thought-hidden');
          if (ch.style) ch.style.display = '';
        }
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
      if (btn.insertAdjacentElement) {
        try { btn.insertAdjacentElement('afterend', chip); return; } catch {}
      }
      btn.parentElement?.appendChild?.(chip);
    };

    const translatePanel = async (panel, { force = false } = {}) => {
      if (destroyed || !enabled || !panel) return { ok: false, reason: 'disabled' };
      const text = extractThoughtText(panel);
      if (!text || text.length < 4) return { ok: false, reason: 'empty' };
      const lang = getEffectiveTargetLang();
      const cacheKey = `thought|${engine}|${lang}|${text}`;
      if (!force) {
        const hit = getCache(cacheKey);
        if (hit) {
          renderTranslatedBox(panel, hit, { sourceText: text, engine, cached: true });
          return { ok: true, cached: true, translated: hit };
        }
      }
      if (inFlightKeys.has(cacheKey)) return { ok: false, reason: 'in-flight' };
      if (typeof options.onRequestTranslate !== 'function') {
        renderTranslatedBox(panel, '', { sourceText: text, error: 'Watch sidecar bridge offline' });
        return { ok: false, reason: 'bridge-offline' };
      }
      inFlightKeys.add(cacheKey);
      renderTranslatedBox(panel, '', { sourceText: text, loading: true });
      try {
        const res = await options.onRequestTranslate({
          engine,
          targetLang: lang,
          kind: 'thought',
          text,
          force,
        });
        if (destroyed || !enabled) return { ok: false, reason: 'aborted' };
        if (res?.ok && res.data?.translated) {
          setCache(cacheKey, res.data.translated);
          renderTranslatedBox(panel, res.data.translated, {
            sourceText: text,
            engine: res.data.engine || engine,
            cached: Boolean(res.data.cached),
          });
          return { ok: true, translated: res.data.translated };
        }
        renderTranslatedBox(panel, '', { sourceText: text, error: res?.error || 'Translation failed' });
        return { ok: false, error: res?.error || 'Translation failed' };
      } catch (err) {
        if (!destroyed && enabled) {
          renderTranslatedBox(panel, '', { sourceText: text, error: err?.message || 'Translation failed' });
        }
        return { ok: false, error: err?.message || 'Translation failed' };
      } finally {
        inFlightKeys.delete(cacheKey);
      }
    };

    const scanTitles = () => {
      if (!doc || !enabled || !translateTitles || yieldedToPrism) return;
      if (typeof options.onRequestTranslate !== 'function') return;
      const lang = getEffectiveTargetLang();
      const nodes = Array.from(doc.querySelectorAll?.(TITLE_SEL) || []);
      for (const el of nodes) {
        if (!el || el.getAttribute?.('data-ag-sag-owned') === '1') continue;
        // Find primary leaf text node
        const textNode = findFirstMeaningfulTextNode(el);
        if (!textNode) continue;
        const curText = String(textNode.nodeValue || '').trim();
        if (!curText || curText.length < 3 || curText.length > 200) continue;
        const tracked = titleOriginals.get(textNode);
        if (tracked && tracked.translated === curText) continue;
        const origText = tracked ? tracked.orig : curText;
        const key = `title|${engine}|${lang}|${origText}`;
        const hit = getCache(key);
        if (hit) {
          if (!tracked) {
            titleOriginals.set(textNode, { orig: origText, translated: hit });
            modifiedTitles.add(textNode);
          } else {
            tracked.translated = hit;
          }
          textNode.nodeValue = hit;
          continue;
        }
        if (inFlightKeys.has(key)) continue;
        inFlightKeys.add(key);
        void Promise.resolve(
          options.onRequestTranslate({ engine, targetLang: lang, kind: 'title', text: origText, force: false })
        )
          .then((res) => {
            if (destroyed || !enabled || !translateTitles) return;
            if (res?.ok && res.data?.translated) {
              const tr = String(res.data.translated).trim();
              if (!tr) return;
              setCache(key, tr);
              titleOriginals.set(textNode, { orig: origText, translated: tr });
              modifiedTitles.add(textNode);
              textNode.nodeValue = tr;
            }
          })
          .catch(() => {})
          .finally(() => {
            inFlightKeys.delete(key);
          });
      }
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
      if (!doc) return;
      try {
        doc.querySelectorAll?.(`.${BOX_CLASS}[data-ag-sag-owned="1"], .${BAR_CLASS}[data-ag-sag-owned="1"]`)?.forEach?.((n) => n.remove?.());
      } catch {}
      try {
        doc.querySelectorAll?.('[data-ag-sag-thought-hidden="1"]')?.forEach?.((n) => {
          n.removeAttribute('data-ag-sag-thought-hidden');
          if (n.style) n.style.display = '';
        });
      } catch {}
    };

    const scanNow = () => {
      if (destroyed || !doc) return;
      if (!enabled) {
        yieldedToPrism = false;
        cleanupDom();
        return;
      }
      if (isPrismThoughtActive()) {
        yieldedToPrism = true;
        cleanupDom();
        return;
      }
      yieldedToPrism = false;

      const triggers = Array.from(doc.querySelectorAll?.(TRIGGER_SEL) || []);
      for (const btn of triggers) {
        const panel = findThoughtPanel(btn);
        if (!panel) continue;
        ensureTriggerButton(btn, panel);
        if (triggerMode === 'auto' && !isTriggerStreaming(btn)) {
          const text = extractThoughtText(panel);
          const prev = panelState.get(panel);
          if (text && (!prev || prev.sourceText !== text)) {
            void translatePanel(panel, { force: false });
          } else if (prev) {
            applyViewModeToPanel(panel, prev);
          }
        } else {
          const prev = panelState.get(panel);
          if (prev) applyViewModeToPanel(panel, prev);
        }
      }
      if (translateTitles) {
        scanTitles();
      } else if (modifiedTitles.size > 0) {
        restoreTitles();
      }
    };

    const scheduleScan = () => {
      if (destroyed || !enabled) return;
      if (scanTimer) clearTimeout(scanTimer);
      scanTimer = setTimeout(() => {
        scanTimer = null;
        scanNow();
      }, 600);
      scanTimer?.unref?.();
    };

    const startObserver = () => {
      if (observer || !doc || options.autoObserve === false) return;
      const MO = win?.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
      if (!MO || !doc.body) return;
      observer = new MO((records) => {
        if (!enabled || destroyed) return;
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
      try { observer?.disconnect?.(); } catch {}
      observer = null;
    };

    const configure = (patch = {}) => {
      const prevEnabled = enabled;
      if (typeof patch.enabled === 'boolean') enabled = patch.enabled;
      if (typeof patch.engine === 'string') engine = patch.engine;
      if (typeof patch.targetLang === 'string') targetLang = patch.targetLang;
      if (patch.triggerMode === 'auto' || patch.triggerMode === 'manual') triggerMode = patch.triggerMode;
      if (patch.viewMode === 'bilingual' || patch.viewMode === 'translated') viewMode = patch.viewMode;
      if (typeof patch.translateTitles === 'boolean') translateTitles = patch.translateTitles;
      if (patch.conflictPolicy === 'yield' || patch.conflictPolicy === 'takeover') conflictPolicy = patch.conflictPolicy;

      if (!enabled) {
        stopObserver();
        cleanupDom();
      } else {
        if (!prevEnabled) startObserver();
        scanNow();
      }
    };

    const destroy = () => {
      if (destroyed) return;
      destroyed = true;
      enabled = false;
      stopObserver();
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
