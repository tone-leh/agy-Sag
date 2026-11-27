// agy-Sag — Compact Guard Controller (Module G + Smart Focus + Post-Compact Recovery + Watchdog, UMD)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSgCompactGuard = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  const THRESHOLD_PRESETS = ['off', 70, 75, 80, 85, 90];
  const STALL_PRESETS = ['off', 120, 180, 300];
  const COMPACT_CMD = '/compact';
  const AUTO_SEND_COOLDOWN_MS = 120_000; // Hard 2-minute anti-loop cooldown per session

  function resolveDep(globalKey, relPath) {
    if (globalRoot && globalRoot[globalKey]) return globalRoot[globalKey];
    if (typeof require === 'function') return require(relPath);
    return null;
  }

  function createCompactGuardController(options = {}) {
    const win = options.win || globalRoot;
    const doc = options.doc || win?.document || null;
    const storage = options.storage !== undefined ? options.storage : win?.localStorage || null;
    const i18n = options.i18n || resolveDep('__agSgI18n', './i18n.js');
    const coexist = options.coexist || resolveDep('__agSgCoexist', './coexist.js');
    const ctxSrc = options.contextSource || resolveDep('__agSgContextSource', './context-source.js');
    const exporter = options.exporter || resolveDep('__agSgPrecompactExport', './precompact-export.js');
    const handoff = options.handoff || resolveDep('__agSgRecoveryHandoff', './recovery-handoff.js');
    const vault = options.vault || resolveDep('__agSgBookmarkVault', './bookmark-vault.js');
    const prismBridgeMod = options.prismBridgeMod || resolveDep('__agSgPrismBridge', './prism-bridge.js');
    const watchdogMod = options.watchdogMod || resolveDep('__agSgSessionWatchdog', './session-watchdog.js');
    const styles = options.styles || resolveDep('__agSgStyles', './styles.js');

    let config = coexist.sanitizeConfig(options.config || coexist.readStoredConfig(storage) || coexist.DEFAULT_CONFIG);
    const watchdog = watchdogMod?.createSessionWatchdog
      ? watchdogMod.createSessionWatchdog({
          enabled: Boolean(config.modules.sessionWatchdog),
          stallThresholdSeconds: config.stallThresholdSeconds,
          now: options.now,
        })
      : null;

    let destroyed = false;
    let blurred = false;
    let pollTimer = null;
    let countdownTimer = null;
    let silentTimer = null;
    let toastTimer = null;
    const slashTimers = new Set();
    let submitToken = 0;
    let countdownRemaining = 0;
    let countdownCanceledForSession = new Set();
    let lastSnapshot = null;
    let lastWatchdog = null;
    let activeRecovery = null;
    let bannerEl = null;
    let recoveryEl = null;
    let recoveryMsgEl = null;
    let recoveryFillBtn = null;
    let recoveryCopyBtn = null;
    let recoveryDismissBtn = null;
    let msgEl = null;
    let focusTagEl = null;
    let actionsEl = null;
    let primaryBtn = null;
    let snoozeBtn = null;
    let cancelCdBtn = null;
    let dismissBtn = null;
    let toastEl = null;
    let styleEl = null;
    let activePaneEl = null;
    let composerListenerOff = null;
    let activeScrollShield = null;
    let lastUserScrollAtMs = 0;
    const listeners = [];
    const getScope = () => (ctxSrc.resolveActivePaneScope ? ctxSrc.resolveActivePaneScope(doc, activePaneEl) : doc);

    const SCROLL_NAV_KEYS = new Set(['PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Home', 'End', ' ']);

    const findProtoDescriptor = (obj, prop) => {
      let cur = obj ? Object.getPrototypeOf(obj) : null;
      while (cur) {
        const desc = Object.getOwnPropertyDescriptor(cur, prop);
        if (desc) return desc;
        cur = Object.getPrototypeOf(cur);
      }
      return null;
    };

    const releaseActiveScrollShield = () => {
      if (activeScrollShield) {
        try { activeScrollShield.release(); } catch {}
        activeScrollShield = null;
      }
    };

    const isEditableEventTarget = (target) => {
      if (!target || typeof target !== 'object') return false;
      const tag = String(target.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (target.isContentEditable || target.getAttribute?.('contenteditable') === 'true') return true;
      return Boolean(target.closest?.('[contenteditable="true"], [data-lexical-editor="true"]'));
    };

    // Temporarily pin the active conversation scroll viewport during automated /compact submission so
    // host auto-scroll never yanks the user to the bottom while reading earlier replies.
    // Zero global prototype mutation: overrides live only on the single viewport instance and are deleted on release.
    const engageViewportScrollShield = (scope) => {
      releaseActiveScrollShield();
      const vp = ctxSrc.findConversationScrollViewport?.(doc, scope) || null;
      if (!vp) return { active: false, release() {} };

      const shieldDurationMs = Number.isFinite(Number(options.scrollShieldMs))
        ? Math.max(50, Number(options.scrollShieldMs))
        : 2800;
      const maxShieldMs = Number.isFinite(Number(options.scrollShieldMaxMs))
        ? Math.max(shieldDurationMs, Number(options.scrollShieldMaxMs))
        : 14000;
      const shieldStartCid = lastSnapshot?.cascadeId || ctxSrc.detectCascadeId(doc, win, scope);

      const hadOwnScrollTop = Object.prototype.hasOwnProperty.call(vp, 'scrollTop');
      const ownScrollTopDesc = hadOwnScrollTop ? Object.getOwnPropertyDescriptor(vp, 'scrollTop') : null;
      const protoScrollTopDesc = findProtoDescriptor(vp, 'scrollTop');

      let getRawTop;
      let setRawTop;
      if (protoScrollTopDesc && typeof protoScrollTopDesc.get === 'function' && typeof protoScrollTopDesc.set === 'function') {
        getRawTop = () => Number(protoScrollTopDesc.get.call(vp)) || 0;
        setRawTop = (v) => {
          try { protoScrollTopDesc.set.call(vp, v); } catch {}
        };
      } else if (ownScrollTopDesc && typeof ownScrollTopDesc.get === 'function' && typeof ownScrollTopDesc.set === 'function') {
        getRawTop = () => Number(ownScrollTopDesc.get.call(vp)) || 0;
        setRawTop = (v) => {
          try { ownScrollTopDesc.set.call(vp, v); } catch {}
        };
      } else {
        let mockRawTop = Number(vp.scrollTop) || 0;
        getRawTop = () => mockRawTop;
        setRawTop = (v) => { mockRawTop = Math.max(0, Number(v) || 0); };
      }

      let pinnedTop = getRawTop();
      let userIntentUntil = 0;
      let lastWheelDeltaY = 0;
      let pointerDragging = false;
      let released = false;
      let sawStreaming = false;
      let releaseTimer = null;
      const startedAt = nowFn();
      const shieldListeners = [];
      const overriddenMethods = [];
      let scrollTopOverridden = false;

      const isUserScrollIntent = () => pointerDragging || nowFn() <= userIntentUntil;
      const markUserIntent = (graceMs = 400) => {
        userIntentUntil = Math.max(userIntentUntil, nowFn() + graceMs);
      };

      const handle = { active: true, release: () => {} };

      const release = () => {
        if (released) return;
        released = true;
        handle.active = false;
        if (releaseTimer) {
          clearTimeout(releaseTimer);
          releaseTimer = null;
        }
        while (shieldListeners.length) {
          try { shieldListeners.pop()(); } catch {}
        }
        if (scrollTopOverridden) {
          try {
            if (!hadOwnScrollTop) {
              delete vp.scrollTop;
            } else if (ownScrollTopDesc) {
              if ('value' in ownScrollTopDesc) {
                Object.defineProperty(vp, 'scrollTop', { ...ownScrollTopDesc, value: getRawTop() });
              } else {
                Object.defineProperty(vp, 'scrollTop', ownScrollTopDesc);
              }
            }
          } catch {}
          scrollTopOverridden = false;
        }
        while (overriddenMethods.length) {
          const item = overriddenMethods.pop();
          try {
            if (!item.hadOwn) {
              delete vp[item.name];
            } else if (item.prevDesc) {
              Object.defineProperty(vp, item.name, item.prevDesc);
            }
          } catch {}
        }
        if (activeScrollShield === handle) {
          activeScrollShield = null;
        }
      };
      handle.release = release;

      // 1) Block programmatic vp.scrollTop = ... assignments on this viewport instance only
      try {
        const canRedefine = !hadOwnScrollTop || ownScrollTopDesc?.configurable !== false;
        if (canRedefine) {
          Object.defineProperty(vp, 'scrollTop', {
            configurable: true,
            enumerable: ownScrollTopDesc ? Boolean(ownScrollTopDesc.enumerable) : false,
            get: () => getRawTop(),
            set: () => {
              // Swallow programmatic auto-scroll while the reading shield is active
            },
          });
          scrollTopOverridden = true;
        }
      } catch {}

      // 2) Block programmatic vp.scrollTo / vp.scroll / vp.scrollBy on this viewport instance only
      for (const mName of ['scrollTo', 'scroll', 'scrollBy']) {
        try {
          const hadOwn = Object.prototype.hasOwnProperty.call(vp, mName);
          const prevDesc = hadOwn ? Object.getOwnPropertyDescriptor(vp, mName) : null;
          if (!hadOwn || prevDesc?.configurable !== false) {
            Object.defineProperty(vp, mName, {
              configurable: true,
              writable: true,
              enumerable: prevDesc ? Boolean(prevDesc.enumerable) : false,
              value: () => {},
            });
            overriddenMethods.push({ name: mName, hadOwn, prevDesc });
          }
        } catch {}
      }

      const addSL = (target, ev, fn, opts) => {
        if (!target || typeof target.addEventListener !== 'function') return;
        target.addEventListener(ev, fn, opts);
        shieldListeners.push(() => target.removeEventListener?.(ev, fn, opts));
      };

      // 3) Track genuine user scroll gestures so manual wheel/touch/scrollbar/keys ALWAYS win immediately
      const onWheel = (ev) => {
        lastWheelDeltaY = Number(ev?.deltaY) || 0;
        lastUserScrollAtMs = nowFn();
        markUserIntent(420);
      };
      addSL(vp, 'wheel', onWheel, { passive: true, capture: true });
      addSL(doc, 'wheel', onWheel, { passive: true, capture: true });
      addSL(vp, 'touchstart', () => { lastWheelDeltaY = 0; lastUserScrollAtMs = nowFn(); markUserIntent(480); }, { passive: true });
      addSL(vp, 'touchmove', () => { lastWheelDeltaY = 0; lastUserScrollAtMs = nowFn(); markUserIntent(480); }, { passive: true });
      addSL(doc, 'pointerdown', (ev) => {
        if (ev?.target?.closest?.('[data-testid="conversation-row-sidebar"]')) {
          release();
          return;
        }
        const btn = ev?.target?.closest?.('button');
        if (btn) {
          const lbl = `${btn.getAttribute?.('aria-label') || ''} ${btn.getAttribute?.('data-testid') || ''} ${btn.textContent || ''}`;
          if (/scroll.?to.?bottom|滚动到底部|回到最新/i.test(lbl)) {
            release();
            return;
          }
        }
        if (ev?.target === vp || vp.contains?.(ev?.target)) {
          pointerDragging = true;
          markUserIntent(450);
        }
      }, true);
      addSL(doc, 'pointermove', (ev) => {
        if (pointerDragging && (ev?.buttons === undefined || ev.buttons > 0)) {
          markUserIntent(350);
        }
      }, true);
      addSL(doc, 'pointerup', () => {
        if (pointerDragging) {
          pointerDragging = false;
          markUserIntent(220);
        }
      }, true);
      addSL(doc, 'pointercancel', () => { pointerDragging = false; }, true);
      addSL(doc, 'keydown', (ev) => {
        if (!ev || !SCROLL_NAV_KEYS.has(ev.key) || isEditableEventTarget(ev.target)) return;
        lastWheelDeltaY = ev.key === 'ArrowUp' || ev.key === 'PageUp' || ev.key === 'Home' ? -1 : 1;
        lastUserScrollAtMs = nowFn();
        markUserIntent(380);
      }, true);

      // 4) Guard against child.scrollIntoView() bypassing vp.scrollTop setter
      addSL(vp, 'scroll', () => {
        if (released || destroyed) return;
        const curTop = getRawTop();
        const jumpDown = curTop - pinnedTop;
        const looksLikeHostSnap = !isUserScrollIntent() || (lastWheelDeltaY < 0 && jumpDown > 260);
        if (looksLikeHostSnap && Math.abs(curTop - pinnedTop) > 1) {
          setRawTop(pinnedTop);
          return;
        }
        pinnedTop = curTop;
        const distFromBottom = (Number(vp.scrollHeight) || 0) - (Number(vp.clientHeight) || 0) - curTop;
        if (isUserScrollIntent() && lastWheelDeltaY > 0 && distFromBottom <= 24) {
          release();
        }
      }, false);

      // 5) Auto-release once compaction settles (extends through active streaming up to maxShieldMs)
      const scheduleReleaseCheck = (delayMs) => {
        if (released || destroyed) return;
        releaseTimer = setTimeout(() => {
          releaseTimer = null;
          if (released || destroyed) return;
          if (vp.isConnected === false) {
            release();
            return;
          }
          const curCid = ctxSrc.detectCascadeId(doc, win, getScope());
          if (shieldStartCid && shieldStartCid !== 'default-session' && curCid && curCid !== 'default-session' && curCid !== shieldStartCid) {
            release();
            return;
          }
          const elapsed = nowFn() - startedAt;
          const streamingNow = ctxSrc.isTurnStreaming(doc, getScope());
          if (streamingNow) sawStreaming = true;
          if (elapsed < maxShieldMs && streamingNow) {
            scheduleReleaseCheck(Math.min(600, maxShieldMs - elapsed));
            return;
          }
          if (sawStreaming && elapsed < maxShieldMs) {
            sawStreaming = false;
            scheduleReleaseCheck(Math.min(900, maxShieldMs - elapsed));
            return;
          }
          release();
        }, delayMs);
        releaseTimer?.unref?.();
      };
      scheduleReleaseCheck(shieldDurationMs);

      activeScrollShield = handle;
      return handle;
    };

    const nowFn = typeof options.now === 'function' ? options.now : () => Date.now();
    // Per-cascadeId session state for smart dismiss, anti-flicker streak & auto-reset on compaction
    const sessionState = new Map();
    const getSess = (cid) => {
      const k = cid || 'default-session';
      let s = sessionState.get(k);
      if (!s) {
        s = { dismissedAtPct: null, lastCompactedCount: 0, autoSentAtPct: null, lastAutoSentAtMs: 0, lowDropStreak: 0 };
        sessionState.set(k, s);
      }
      return s;
    };

    const getLang = () => (typeof options.getLang === 'function' ? i18n.normalizeLang(options.getLang()) : i18n.detectLang(doc, win));
    const S = () => i18n.getStrings(getLang());

    const setToast = (text, tone = '') => {
      if (!toastEl) return;
      if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
      toastEl.textContent = text || '';
      toastEl.hidden = !text;
      if (tone) toastEl.setAttribute('data-tone', tone);
      else toastEl.removeAttribute('data-tone');
      if (text) {
        toastTimer = setTimeout(() => {
          toastTimer = null;
          if (!destroyed && toastEl) toastEl.hidden = true;
        }, 3400);
        toastTimer?.unref?.();
      }
    };

    const stopSilent = () => {
      if (silentTimer) {
        clearTimeout(silentTimer);
        silentTimer = null;
      }
    };

    const stopCountdown = () => {
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
      countdownRemaining = 0;
    };

    const ensureStyle = () => {
      if (!doc || !styles) return;
      const existing = doc.getElementById?.(styles.STYLE_ID);
      if (existing) {
        styleEl = existing;
        return;
      }
      const el = doc.createElement('style');
      el.id = styles.STYLE_ID;
      el.textContent = styles.CORE_CSS;
      coexist.markOwnedNoTranslate(el);
      (doc.head || doc.documentElement || doc.body)?.appendChild?.(el);
      styleEl = el;
    };

    const findBannerAnchor = (scope = getScope()) => {
      if (!doc) return null;
      return (
        scope?.querySelector?.('[data-testid="agent-input-box"]') ||
        scope?.querySelector?.('.surface-composer-card') ||
        scope?.querySelector?.('[data-testid="conversation-view"]') ||
        doc.querySelector?.('[data-testid="agent-input-box"]') ||
        doc.querySelector?.('.surface-composer-card') ||
        doc.querySelector?.('[data-testid="conversation-view"]') ||
        null
      );
    };

    const bindComposerDraftGuard = () => {
      if (composerListenerOff) {
        try { composerListenerOff(); } catch {}
        composerListenerOff = null;
      }
      const ed = ctxSrc.findComposerEditor(doc, getScope());
      if (!ed || typeof ed.addEventListener !== 'function') return;
      const onInput = () => {
        if ((countdownTimer || silentTimer) && ctxSrc.readComposerDraft(doc, getScope()).length > 0) {
          stopCountdown();
          stopSilent();
          if (lastSnapshot?.cascadeId) {
            countdownCanceledForSession.add(lastSnapshot.cascadeId);
            getSess(lastSnapshot.cascadeId).dismissedAtPct = lastSnapshot.usedPct;
          }
          render();
        }
      };
      ed.addEventListener('input', onInput);
      composerListenerOff = () => ed.removeEventListener?.('input', onInput);
    };

    const getFocusLabel = (strings) => {
      if (config.compactFocusPreset === 'code-errors') return strings.cfgFocusCode;
      if (config.compactFocusPreset === 'bookmarks') return strings.cfgFocusBookmarks;
      if (config.compactFocusPreset === 'custom') return strings.cfgFocusCustom;
      return strings.cfgFocusDefault;
    };

    function buildCompactCommand() {
      const strings = S();
      const preset = config.compactFocusPreset || 'default';
      if (preset === 'default') return COMPACT_CMD;
      if (preset === 'code-errors') {
        return `${COMPACT_CMD} ${strings.compactFocusCodePrompt}`;
      }
      if (preset === 'custom') {
        const custom = exporter
          ? exporter.redactSecrets(config.customCompactFocus || '').replace(/\s+/g, ' ').trim()
          : String(config.customCompactFocus || '').trim();
        return custom ? `${COMPACT_CMD} ${custom}` : COMPACT_CMD;
      }
      if (preset === 'bookmarks') {
        const scope = getScope();
        const cid = lastSnapshot?.cascadeId || ctxSrc.detectCascadeId(doc, win, scope);
        const bm = exporter?.loadBookmarks?.(storage, cid) || new Set();
        const turns = exporter?.extractConversationTurns?.(doc, scope) || [];
        const starred = turns.filter((t) => bm.has(t.turnNum)).slice(-3);
        if (starred.length === 0) {
          return `${COMPACT_CMD} ${strings.compactFocusBookmarksFallback}`;
        }
        const summary = starred
          .map((t) => {
            const snippet = exporter
              .redactSecrets(t.user || t.assistant || '')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 72);
            return `#${t.turnNum} ${snippet}`;
          })
          .join('; ');
        return `${COMPACT_CMD} ${strings.compactFocusBookmarksPrefix}${summary}`.slice(0, 320);
      }
      return COMPACT_CMD;
    }

    function captureRecoverySnapshot() {
      if (!handoff) return null;
      const scope = getScope();
      const cid = lastSnapshot?.cascadeId || ctxSrc.detectCascadeId(doc, win, scope);
      return handoff.capturePreCompactSnapshot({
        doc,
        scopeEl: scope,
        storage,
        cascadeId: cid,
        usedPct: lastSnapshot?.usedPct ?? null,
        strings: S(),
      });
    }

    const cancelPendingSlashSubmits = () => {
      submitToken += 1;
      for (const t of slashTimers) {
        try { clearTimeout(t); } catch {}
      }
      slashTimers.clear();
      releaseActiveScrollShield();
    };

    const scheduleSlashTimer = (fn, ms, token = submitToken) => {
      const t = setTimeout(() => {
        slashTimers.delete(t);
        if (!destroyed && token === submitToken) fn();
      }, ms);
      t?.unref?.();
      slashTimers.add(t);
      return t;
    };

    const readEditorDraftText = (editor) => {
      if (!editor) return '';
      const tag = String(editor.tagName || '').toUpperCase();
      const raw = tag === 'TEXTAREA' || tag === 'INPUT' ? editor.value : editor.textContent;
      return String(raw || '').replace(/\u200B/g, '').trim();
    };

    const writeTextIntoComposer = (text, { allowSameAs = [], append = false } = {}) => {
      const strings = S();
      const scope = getScope();
      const existingDraft = ctxSrc.readComposerDraft(doc, scope);
      if (!append && existingDraft && !allowSameAs.includes(existingDraft)) {
        setToast(strings.toastDraftProtected, 'warn');
        return { ok: false, reason: 'draft-present' };
      }
      const ed = ctxSrc.findComposerEditor(doc, scope);
      if (!ed) return { ok: false, reason: 'no-editor' };
      try {
        try {
          ed.focus?.({ preventScroll: true });
        } catch {
          ed.focus?.();
        }
        const tag = String(ed.tagName || '').toUpperCase();
        if (tag === 'TEXTAREA' || tag === 'INPUT') {
          ed.value = append ? `${String(ed.value || '')}${text}` : text;
          ed.dispatchEvent?.(new (win.Event || Event)('input', { bubbles: true }));
        } else {
          // Ensure a valid Selection inside the Lexical contenteditable editor so execCommand('insertText')
          // reliably updates Lexical state and triggers the native slash-command typeahead menu.
          try {
            const sel = win?.getSelection?.() || doc?.getSelection?.();
            if (sel?.removeAllRanges && doc?.createRange) {
              const range = doc.createRange();
              range.selectNodeContents(ed);
              if (append || !existingDraft) range.collapse(false);
              sel.removeAllRanges();
              sel.addRange(range);
            }
          } catch {}
          if (typeof doc.execCommand === 'function' && doc.execCommand('insertText', false, text)) {
            // inserted via execCommand
          } else {
            ed.textContent = append ? `${String(ed.textContent || '')}${text}` : text;
            ed.dispatchEvent?.(new (win.Event || Event)('input', { bubbles: true }));
          }
        }
        return { ok: true, editor: ed };
      } catch {
        return { ok: false, reason: 'insert-failed' };
      }
    };

    const findSlashCompactTarget = () => {
      if (!doc || typeof doc.querySelectorAll !== 'function') return null;
      const opts = Array.from(
        doc.querySelectorAll('[id^="typeahead-item-"][role="option"], [role="option"], [data-testid*="command-item"]') || []
      );
      const seen = new Set();
      for (const el of opts) {
        if (!el || seen.has(el)) continue;
        seen.add(el);
        if (
          el.getAttribute?.('aria-disabled') === 'true' ||
          el.querySelector?.('[data-testid="menu-category-row"], [aria-disabled="true"]')
        ) {
          continue;
        }
        const elId = String(el.getAttribute?.('id') || '');
        const elTestId = String(el.getAttribute?.('data-testid') || '').toLowerCase();
        const inSlashMenu =
          elId.startsWith('typeahead-item-') ||
          elTestId.includes('command-item') ||
          Boolean(el.closest?.('[role="listbox"], [data-testid*="slash"], [data-testid*="command"], [data-testid*="typeahead"]'));
        if (!inSlashMenu) continue;

        // Antigravity v2.34/v2.35 renders inner [data-testid="menu-option-label"] with bare "compact" and
        // attaches React onClickCapture on the inner row/label rather than the outer [role="option"].
        const labelEl = el.querySelector?.('[data-testid="menu-option-label"]');
        if (labelEl) {
          const lv = String(labelEl.textContent || '').trim().toLowerCase();
          if (lv === 'compact' || lv === '/compact') {
            return { opt: el, clickTarget: labelEl };
          }
          continue;
        }
        const dataVal = String(el.getAttribute?.('data-value') || '').trim().toLowerCase();
        if (dataVal === 'compact' || dataVal === '/compact') {
          return { opt: el, clickTarget: el };
        }
        const txt = String(el.textContent || '').trim().toLowerCase();
        if (/^(?:\/compact|compact)(?:\s|$)/.test(txt)) {
          return { opt: el, clickTarget: el };
        }
      }
      return null;
    };

    const clickComposerSendButton = (editor, scope) => {
      const sendSels = [
        '[data-testid="input-send-button"]',
        '[data-testid="send-button"]',
        'button[aria-label*="Send" i]',
        'button[aria-label*="发送"]',
        'button[type="submit"]',
      ];
      const inSidePanel = (node) =>
        Boolean(node?.closest?.('[data-side-panel-focus-scope="true"], [data-testid="side-question-panel"]'));
      const box = editor?.closest?.('[data-testid="agent-input-box"], .surface-composer-card') || null;
      const formScope = editor?.closest?.('form') || null;
      const scopes = [box, formScope, scope && scope !== doc ? scope : null].filter(Boolean);
      const fallbackScopes = scopes.length ? scopes : [doc].filter(Boolean);
      const allowedSels = scopes.length ? sendSels : ['[data-testid="input-send-button"]', '[data-testid="send-button"]'];
      let sendBtn = null;
      for (const sc of fallbackScopes) {
        for (const sel of allowedSels) {
          const btns = Array.from(sc.querySelectorAll?.(sel) || []);
          sendBtn = btns.find(
            (b) =>
              b &&
              !inSidePanel(b) &&
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
        return 'click-send-button';
      }
      const KEv = win.KeyboardEvent || globalThis.KeyboardEvent;
      if (typeof KEv === 'function' && editor) {
        editor.dispatchEvent?.(new KEv('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
        return 'enter-key';
      }
      return 'none';
    };

    const insertCompactIntoComposer = ({ submit = false, preserveScroll = false, triggerMode = null } = {}) => {
      const strings = S();
      const scope = getScope();
      if (ctxSrc.isTurnStreaming(doc, scope) || lastSnapshot?.streaming) {
        setToast(strings.toastStreamingBlocked, 'warn');
        return { ok: false, reason: 'streaming' };
      }
      if (submit) {
        cancelPendingSlashSubmits();
      }
      const myToken = submitToken;
      const expectedMode = triggerMode || config.compactTriggerMode;
      const isAutoTriggered = triggerMode === 'auto-silent' || triggerMode === 'auto-countdown';
      const cmd = buildCompactCommand();
      const extraSuffix = cmd.startsWith(`${COMPACT_CMD} `) ? cmd.slice(COMPACT_CMD.length) : '';
      const editorPreview = ctxSrc.findComposerEditor(doc, scope);
      const prevActiveEl = doc?.activeElement || null;
      const wasInComposer = Boolean(
        prevActiveEl &&
        editorPreview &&
        (prevActiveEl === editorPreview || editorPreview.contains?.(prevActiveEl))
      );
      const restoreReadingFocus = (editor) => {
        if (!preserveScroll || wasInComposer) return;
        try { editor?.blur?.(); } catch {}
        if (
          prevActiveEl &&
          prevActiveEl !== doc?.body &&
          prevActiveEl !== doc?.documentElement &&
          prevActiveEl.isConnected !== false &&
          typeof prevActiveEl.focus === 'function'
        ) {
          try { prevActiveEl.focus({ preventScroll: true }); } catch {}
        }
      };

      const shield = submit && preserveScroll ? engageViewportScrollShield(scope) : null;
      const isRichLexical = Boolean(
        editorPreview?.getAttribute?.('data-lexical-editor') === 'true' ||
        editorPreview?.getAttribute?.('contenteditable') === 'true'
      );
      // In Lexical with submit=true, insert bare "/compact" first so the host slash-command typeahead opens;
      // any custom focus prompt suffix is appended right after selecting the native slash chip.
      const initialText = submit && isRichLexical && typeof options.onSubmitCompact !== 'function' ? COMPACT_CMD : cmd;
      const written = writeTextIntoComposer(initialText, { allowSameAs: [COMPACT_CMD, cmd] });
      if (!written.ok) {
        shield?.release?.();
        return written;
      }

      // Silently preserve pre-compact recovery snapshot for seamless post-compact handoff
      captureRecoverySnapshot();

      const startCid = lastSnapshot?.cascadeId || ctxSrc.detectCascadeId(doc, win, scope);
      const sess = getSess(startCid);

      if (submit) {
        sess.dismissedAtPct = lastSnapshot?.usedPct ?? config.compactThreshold;
        sess.autoSentAtPct = lastSnapshot?.usedPct ?? config.compactThreshold;
        sess.lastAutoSentAtMs = nowFn();
        stopCountdown();

        if (typeof options.onSubmitCompact === 'function') {
          options.onSubmitCompact({
            command: cmd,
            preset: config.compactFocusPreset,
            cascadeId: startCid || '',
          });
          restoreReadingFocus(written.editor);
          const shortCmd = cmd.length > 36 ? `${cmd.slice(0, 36)}…` : cmd;
          setToast(i18n.formatTemplate(strings.toastSent, { cmd: shortCmd }), 'ok');
          return { ok: true, submitted: true, command: cmd };
        }

        if (isRichLexical) {
          // Antigravity v2.34/v2.35 Lexical two-step slash execution:
          // (1) Pick the real slash-command menu item (converts "/compact" into a native slash chip),
          // (2) Wait briefly for Lexical chip commit (plus optional focus suffix), then click Send.
          // Fail-safe: if no slash-command option appears, NEVER click Send (avoids spamming plain "/compact" text).
          const slashPollMs = Number.isFinite(Number(options.slashPollMs)) ? Math.max(5, Number(options.slashPollMs)) : 45;
          const slashSubmitDelayMs = Number.isFinite(Number(options.slashSubmitDelayMs))
            ? Math.max(0, Number(options.slashSubmitDelayMs))
            : 50;
          const canProceedPendingSubmit = (phase) => {
            if (destroyed || myToken !== submitToken) return false;
            if (!config.modules.compactGuard) return false;
            if (config.compactTriggerMode === 'fill-only') return false;
            if (isAutoTriggered && (config.compactTriggerMode !== expectedMode || config.compactThreshold === 'off')) {
              return false;
            }
            if (ctxSrc.isTurnStreaming(doc, scope) || lastSnapshot?.streaming) return false;
            if (written.editor?.isConnected === false) return false;
            const curCid = ctxSrc.detectCascadeId(doc, win, getScope());
            if (startCid && startCid !== 'default-session' && curCid && curCid !== 'default-session' && curCid !== startCid) {
              return false;
            }
            const curDraft = readEditorDraftText(written.editor);
            if (phase === 'poll') {
              if (curDraft !== COMPACT_CMD && curDraft !== cmd) {
                return false;
              }
            } else if (phase === 'finalize') {
              if (curDraft) {
                const lower = curDraft.toLowerCase();
                const stillCompact =
                  lower === 'compact' ||
                  curDraft === COMPACT_CMD ||
                  curDraft === cmd;
                if (!stillCompact) return false;
              }
            }
            return true;
          };
          const executePickedSlash = (target) => {
            if (!canProceedPendingSubmit('poll')) {
              shield?.release?.();
              return;
            }
            try { target.clickTarget.click(); } catch {}
            const finalizeSubmit = () => {
              if (!canProceedPendingSubmit('finalize')) {
                shield?.release?.();
                return;
              }
              if (extraSuffix) {
                writeTextIntoComposer(extraSuffix, { append: true });
              }
              clickComposerSendButton(written.editor, getScope());
              restoreReadingFocus(written.editor);
              const shortCmd = cmd.length > 36 ? `${cmd.slice(0, 36)}…` : cmd;
              setToast(i18n.formatTemplate(strings.toastSent, { cmd: shortCmd }), 'ok');
            };
            if (slashSubmitDelayMs === 0) {
              finalizeSubmit();
            } else {
              scheduleSlashTimer(finalizeSubmit, slashSubmitDelayMs, myToken);
            }
          };

          const immediateTarget = findSlashCompactTarget();
          if (immediateTarget) {
            executePickedSlash(immediateTarget);
            return { ok: true, submitted: true, viaSlashOption: true, command: cmd };
          }

          let attempts = 0;
          const maxAttempts = 8;
          const pollSlash = () => {
            if (!canProceedPendingSubmit('poll')) {
              shield?.release?.();
              return;
            }
            const found = findSlashCompactTarget();
            if (found) {
              executePickedSlash(found);
              return;
            }
            attempts += 1;
            if (attempts < maxAttempts) {
              scheduleSlashTimer(pollSlash, slashPollMs, myToken);
            } else {
              restoreReadingFocus(written.editor);
              shield?.release?.();
              const shortCmd = cmd.length > 36 ? `${cmd.slice(0, 36)}…` : cmd;
              setToast(i18n.formatTemplate(strings.toastFilled, { cmd: shortCmd }), 'ok');
            }
          };
          scheduleSlashTimer(pollSlash, slashPollMs, myToken);
          const shortCmd = cmd.length > 36 ? `${cmd.slice(0, 36)}…` : cmd;
          setToast(i18n.formatTemplate(strings.toastFilled, { cmd: shortCmd }), 'ok');
          return { ok: true, submitted: false, pendingSlashOption: true, command: cmd };
        }

        clickComposerSendButton(written.editor, scope);
        restoreReadingFocus(written.editor);
        const shortCmd = cmd.length > 36 ? `${cmd.slice(0, 36)}…` : cmd;
        setToast(i18n.formatTemplate(strings.toastSent, { cmd: shortCmd }), 'ok');
        return { ok: true, submitted: true, command: cmd };
      }

      const shortCmd = cmd.length > 36 ? `${cmd.slice(0, 36)}…` : cmd;
      setToast(i18n.formatTemplate(strings.toastFilled, { cmd: shortCmd }), 'ok');
      return { ok: true, submitted: false, command: cmd };
    };

    const handleExportMd = async ({ onlyBookmarked = false, download = false } = {}) => {
      const strings = S();
      const scope = getScope();
      const turns = exporter.extractConversationTurns(doc, scope);
      const cid = lastSnapshot?.cascadeId || ctxSrc.detectCascadeId(doc, win, scope);
      const bm = exporter.loadBookmarks(storage, cid);
      const built = exporter.buildRecapMarkdown({
        turns,
        bookmarks: bm,
        onlyBookmarked,
        cascadeId: cid,
        usedPct: lastSnapshot?.usedPct ?? null,
        usedLabel: lastSnapshot ? ctxSrc.formatTokens(lastSnapshot.usedTokens) : '',
        maxLabel: lastSnapshot ? ctxSrc.formatTokens(lastSnapshot.maxTokens) : '',
        strings,
      });
      if (!built.ok) {
        setToast(strings.toastExportEmpty, 'warn');
        return built;
      }
      if (download) {
        const filename = exporter.buildRecapFilename(cid, new Date(), { onlyBookmarked: onlyBookmarked && bm.size > 0 });
        const dl = exporter.downloadRecapMarkdown(built.markdown, filename, win, doc);
        const payload = { ...built, filename, downloaded: dl.ok };
        if (typeof options.onDownloadMarkdown === 'function') {
          options.onDownloadMarkdown(payload);
        }
        if (typeof options.onExportMarkdown === 'function') {
          options.onExportMarkdown(payload);
        }
        setToast(i18n.formatTemplate(strings.toastDownloaded, { file: filename, turns: built.count }), 'ok');
        return payload;
      }
      await exporter.copyRecapToClipboard(built.markdown, win);
      if (typeof options.onExportMarkdown === 'function') {
        options.onExportMarkdown(built);
      }
      setToast(i18n.formatTemplate(strings.toastExported, { turns: built.count }), 'ok');
      return built;
    };

    const handleCopyNewSessionHandoff = async () => {
      const strings = S();
      if (!handoff?.buildNewSessionHandoff) return { ok: false, prompt: '' };
      const scope = getScope();
      const turns = exporter.extractConversationTurns(doc, scope);
      const cid = lastSnapshot?.cascadeId || ctxSrc.detectCascadeId(doc, win, scope);
      const bm = exporter.loadBookmarks(storage, cid);
      const title = vault?.detectConversationTitle?.(doc, cid) || '';
      const built = handoff.buildNewSessionHandoff({
        turns,
        bookmarks: bm,
        cascadeId: cid,
        title,
        usedPct: lastSnapshot?.usedPct ?? null,
        strings,
      });
      if (!built.ok) {
        setToast(strings.toastExportEmpty, 'warn');
        return built;
      }
      await exporter.copyRecapToClipboard(built.prompt, win);
      if (typeof options.onCopyHandoff === 'function') {
        options.onCopyHandoff({ ...built, cascadeId: cid });
      }
      setToast(i18n.formatTemplate(strings.toastHandoffCopied, { n: built.anchorCount }), 'ok');
      return built;
    };

    const handleSnoozeStall = (snoozeSec = 300) => {
      if (!watchdog?.snoozeStall || !lastSnapshot) return null;
      const res = watchdog.snoozeStall(lastSnapshot.cascadeId, snoozeSec);
      lastWatchdog = {
        ...(lastWatchdog || {}),
        stalled: false,
        snoozed: true,
        snoozeRemainingSec: res.snoozeSec,
        snoozeCount: res.snoozeCount,
      };
      const mins = Math.max(1, Math.round(res.snoozeSec / 60));
      setToast(i18n.formatTemplate(S().toastStallSnoozed, { min: mins }), 'ok');
      render();
      return res;
    };

    const mkBtn = (cls, text, attrKey, onClick) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.textContent = text;
      if (attrKey) b.setAttribute('data-ag-sg-act', attrKey);
      b.addEventListener('click', (ev) => {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
        onClick();
      });
      return b;
    };

    const ensureRecoveryBar = () => {
      if (!doc) return null;
      const anchor = findBannerAnchor();
      if (!anchor || !anchor.parentElement) return null;
      ensureStyle();
      if (recoveryEl && recoveryEl.isConnected !== false) {
        if (recoveryEl.parentElement !== anchor.parentElement) {
          anchor.parentElement.insertBefore(recoveryEl, anchor);
        }
        return recoveryEl;
      }

      const bar = coexist.markOwnedNoTranslate(doc.createElement('div'));
      bar.className = 'ag-sg-recovery-bar';
      bar.setAttribute('role', 'status');
      bar.setAttribute('data-testid', 'ag-sg-recovery-bar');
      bar.hidden = true;

      const left = doc.createElement('div');
      left.className = 'ag-sg-left';
      const dot = doc.createElement('span');
      dot.className = 'ag-sg-recovery-dot';
      dot.setAttribute('aria-hidden', 'true');
      recoveryMsgEl = doc.createElement('span');
      recoveryMsgEl.className = 'ag-sg-msg';
      left.appendChild(dot);
      left.appendChild(recoveryMsgEl);

      const acts = doc.createElement('div');
      acts.className = 'ag-sg-actions';

      recoveryFillBtn = mkBtn('ag-sg-btn ag-sg-btn-primary', '', 'recovery-fill', () => {
        if (!activeRecovery?.prompt) return;
        const written = writeTextIntoComposer(activeRecovery.prompt, { allowSameAs: [activeRecovery.prompt] });
        if (written.ok) {
          if (typeof options.onRecoveryFill === 'function') options.onRecoveryFill(activeRecovery);
          handoff?.clearSnapshot?.(storage, activeRecovery.cascadeId);
          activeRecovery = null;
          renderRecoveryBar();
          setToast(S().recoveryFilledToast, 'ok');
        }
      });

      recoveryCopyBtn = mkBtn('ag-sg-btn', '', 'recovery-copy', async () => {
        if (!activeRecovery?.prompt) return;
        await exporter?.copyRecapToClipboard?.(activeRecovery.prompt, win);
        if (typeof options.onRecoveryCopy === 'function') options.onRecoveryCopy(activeRecovery);
        setToast(S().recoveryCopiedToast, 'ok');
      });

      recoveryDismissBtn = mkBtn('ag-sg-btn', '', 'recovery-dismiss', () => {
        if (activeRecovery?.cascadeId) handoff?.clearSnapshot?.(storage, activeRecovery.cascadeId);
        activeRecovery = null;
        renderRecoveryBar();
      });

      acts.appendChild(recoveryFillBtn);
      acts.appendChild(recoveryCopyBtn);
      acts.appendChild(recoveryDismissBtn);

      bar.appendChild(left);
      bar.appendChild(acts);
      anchor.parentElement.insertBefore(bar, anchor);
      recoveryEl = bar;
      return recoveryEl;
    };

    const renderRecoveryBar = () => {
      if (destroyed) return;
      if (!activeRecovery || !activeRecovery.prompt) {
        if (recoveryEl) recoveryEl.hidden = true;
        return;
      }
      const el = ensureRecoveryBar();
      if (!el) return;
      const strings = S();
      el.hidden = false;
      recoveryMsgEl.textContent = i18n.formatTemplate(strings.recoveryMsg, { n: activeRecovery.anchorCount || 1 });
      recoveryFillBtn.textContent = strings.recoveryFillBtn;
      recoveryCopyBtn.textContent = strings.recoveryCopyBtn;
      recoveryDismissBtn.textContent = strings.recoveryDismissBtn;
    };

    const ensureBanner = () => {
      if (!doc) return null;
      const anchor = findBannerAnchor();
      if (!anchor || !anchor.parentElement) return null;
      ensureStyle();
      if (bannerEl && bannerEl.isConnected !== false) {
        if (bannerEl.parentElement !== anchor.parentElement) {
          anchor.parentElement.insertBefore(bannerEl, anchor);
          bindComposerDraftGuard();
        }
        return bannerEl;
      }

      const wrap = coexist.markOwnedNoTranslate(doc.createElement('div'));
      wrap.className = 'ag-sg-banner';
      wrap.setAttribute('role', 'status');
      wrap.setAttribute('data-testid', 'ag-sg-compact-banner');
      wrap.hidden = true;

      const left = doc.createElement('div');
      left.className = 'ag-sg-left';
      const dot = doc.createElement('span');
      dot.className = 'ag-sg-dot';
      dot.setAttribute('aria-hidden', 'true');
      msgEl = doc.createElement('span');
      msgEl.className = 'ag-sg-msg';
      focusTagEl = doc.createElement('span');
      focusTagEl.className = 'ag-sg-focus-tag';
      focusTagEl.setAttribute('data-testid', 'ag-sg-focus-tag');
      focusTagEl.hidden = true;
      left.appendChild(dot);
      left.appendChild(msgEl);
      left.appendChild(focusTagEl);

      actionsEl = doc.createElement('div');
      actionsEl.className = 'ag-sg-actions';

      primaryBtn = mkBtn('ag-sg-btn ag-sg-btn-primary', '', 'compact-now', () => {
        stopCountdown();
        const shouldSubmit = config.compactTriggerMode !== 'fill-only';
        insertCompactIntoComposer({ submit: shouldSubmit });
        render();
      });
      snoozeBtn = mkBtn('ag-sg-btn ag-sg-btn-primary', '', 'snooze-stall', () => {
        handleSnoozeStall(300);
      });
      cancelCdBtn = mkBtn('ag-sg-btn', '', 'cancel-countdown', () => {
        stopCountdown();
        if (lastSnapshot?.cascadeId) {
          countdownCanceledForSession.add(lastSnapshot.cascadeId);
          getSess(lastSnapshot.cascadeId).dismissedAtPct = lastSnapshot.usedPct;
        }
        render();
      });
      dismissBtn = mkBtn('ag-sg-btn ag-sg-btn-icon', '×', 'dismiss', () => {
        stopCountdown();
        if (lastWatchdog?.stalled && !lastWatchdog?.stallDismissed && lastSnapshot) {
          watchdog?.dismissStall?.(lastSnapshot.cascadeId);
          lastWatchdog = { ...lastWatchdog, stallDismissed: true };
        } else if (lastSnapshot) {
          getSess(lastSnapshot.cascadeId).dismissedAtPct = lastSnapshot.usedPct;
        }
        render();
      });

      actionsEl.appendChild(primaryBtn);
      actionsEl.appendChild(snoozeBtn);
      actionsEl.appendChild(cancelCdBtn);
      actionsEl.appendChild(dismissBtn);

      toastEl = doc.createElement('div');
      toastEl.className = 'ag-sg-toast';
      toastEl.hidden = true;

      wrap.appendChild(left);
      wrap.appendChild(actionsEl);
      wrap.appendChild(toastEl);

      anchor.parentElement.insertBefore(wrap, anchor);
      bannerEl = wrap;
      bindComposerDraftGuard();
      return bannerEl;
    };

    const shouldShowForSnapshot = (snap) => {
      if (!snap || !config.modules.compactGuard) return false;
      const sess = getSess(snap.cascadeId);
      const th = config.compactThreshold === 'off' ? null : Number(config.compactThreshold);

      // Detect compaction completed -> reset dismiss state (require 2 consecutive low samples on drop to ignore cross-tab flicker!)
      const compactedByCount = snap.compactedCount > sess.lastCompactedCount;
      const isBelowReset = th !== null && Number.isFinite(th) && snap.usedPct <= th - config.resetDropPct;
      if (isBelowReset) sess.lowDropStreak += 1;
      else sess.lowDropStreak = 0;
      const compactedByDrop = isBelowReset && sess.lowDropStreak >= 2;
      if (compactedByCount || compactedByDrop) {
        const hadPriorCompactCycle = compactedByCount || sess.dismissedAtPct !== null || sess.autoSentAtPct !== null;
        sess.lastCompactedCount = Math.max(sess.lastCompactedCount, snap.compactedCount);
        sess.dismissedAtPct = null;
        sess.autoSentAtPct = null;
        sess.lowDropStreak = 0;
        countdownCanceledForSession.delete(snap.cascadeId);
        if (hadPriorCompactCycle || compactedByCount) {
          const saved = handoff?.loadSnapshot?.(storage, snap.cascadeId) || null;
          // Only surface post-compact recovery strip if the user explicitly starred anchors
          if (saved && saved.pendingRecovery && Number(saved.starredCount) > 0) {
            activeRecovery = saved;
          }
        }
      }

      if (lastWatchdog?.stalled && !lastWatchdog?.stallDismissed) return true;
      // Stay completely invisible while AI is still streaming; wait until turn finishes
      if (snap.streaming) return false;
      if (th === null || !Number.isFinite(th)) return false;
      if (snap.usedPct < th) return false;

      if (sess.dismissedAtPct !== null && snap.usedPct < sess.dismissedAtPct + config.rearmDeltaPct) {
        return false;
      }
      return true;
    };

    const maybeManageSilentAutoCompact = (snap, visible, isStallAlert) => {
      const sess = snap ? getSess(snap.cascadeId) : null;
      const inCooldown = Boolean(sess && sess.lastAutoSentAtMs && nowFn() - sess.lastAutoSentAtMs < AUTO_SEND_COOLDOWN_MS);
      const canAutoSilent =
        visible &&
        !isStallAlert &&
        config.compactTriggerMode === 'auto-silent' &&
        !snap.streaming &&
        !snap.draft &&
        !coexist.isWindowHibernated(doc, win, blurred) &&
        !countdownCanceledForSession.has(snap.cascadeId) &&
        sess?.autoSentAtPct === null &&
        !inCooldown;

      if (!canAutoSilent) {
        stopSilent();
        return;
      }
      if (silentTimer) return;

      // Ensure draft typing guard is active even when zero banner DOM is mounted
      bindComposerDraftGuard();
      const targetCid = snap.cascadeId;
      const delayMs = Number.isFinite(Number(options.silentIdleDelayMs))
        ? Math.max(0, Number(options.silentIdleDelayMs))
        : 450;
      const defaultSettleMs = options.silentIdleDelayMs === 0 ? 0 : 800;
      const scrollSettleMs = Number.isFinite(Number(options.scrollSettleMs))
        ? Math.max(0, Number(options.scrollSettleMs))
        : defaultSettleMs;

      const fireSilent = () => {
        silentTimer = null;
        if (destroyed || config.compactTriggerMode !== 'auto-silent') return;
        const scope = getScope();
        if (
          coexist.isWindowHibernated(doc, win, blurred) ||
          ctxSrc.isTurnStreaming(doc, scope) ||
          ctxSrc.readComposerDraft(doc, scope).length > 0
        ) {
          if (ctxSrc.readComposerDraft(doc, scope).length > 0 && targetCid) {
            countdownCanceledForSession.add(targetCid);
          }
          return;
        }
        const curCid = lastSnapshot?.cascadeId || ctxSrc.detectCascadeId(doc, win, scope);
        if (targetCid && curCid && targetCid !== curCid) return;
        if (countdownCanceledForSession.has(curCid)) return;

        // Defer quietly while the user is actively scrolling through conversation history
        if (scrollSettleMs > 0 && lastUserScrollAtMs > 0) {
          const sinceScroll = nowFn() - lastUserScrollAtMs;
          if (sinceScroll >= 0 && sinceScroll < scrollSettleMs) {
            silentTimer = setTimeout(fireSilent, Math.max(25, scrollSettleMs - sinceScroll + 40));
            silentTimer?.unref?.();
            return;
          }
        }

        insertCompactIntoComposer({ submit: true, preserveScroll: true, triggerMode: 'auto-silent' });
      };

      const sinceScrollInitial = lastUserScrollAtMs > 0 ? nowFn() - lastUserScrollAtMs : Infinity;
      const waitForScroll =
        scrollSettleMs > 0 && sinceScrollInitial >= 0 && sinceScrollInitial < scrollSettleMs
          ? scrollSettleMs - sinceScrollInitial + 40
          : 0;
      const effectiveDelayMs = Math.max(delayMs, waitForScroll);

      if (effectiveDelayMs === 0) {
        fireSilent();
        return;
      }
      silentTimer = setTimeout(fireSilent, effectiveDelayMs);
      silentTimer?.unref?.();
    };

    const maybeManageCountdown = (snap, visible, isStallAlert) => {
      const sess = snap ? getSess(snap.cascadeId) : null;
      const inCooldown = Boolean(sess && sess.lastAutoSentAtMs && nowFn() - sess.lastAutoSentAtMs < AUTO_SEND_COOLDOWN_MS);
      const canCountdown =
        visible &&
        !isStallAlert &&
        config.compactTriggerMode === 'auto-countdown' &&
        !snap.streaming &&
        !snap.draft &&
        !coexist.isWindowHibernated(doc, win, blurred) &&
        !countdownCanceledForSession.has(snap.cascadeId) &&
        sess?.autoSentAtPct === null &&
        !inCooldown;

      if (!canCountdown) {
        if (countdownTimer) stopCountdown();
        return;
      }
      if (countdownTimer) return;

      countdownRemaining = config.countdownSeconds;
      countdownTimer = setInterval(() => {
        if (destroyed) { stopCountdown(); return; }
        if (
          coexist.isWindowHibernated(doc, win, blurred) ||
          ctxSrc.isTurnStreaming(doc) ||
          ctxSrc.readComposerDraft(doc).length > 0
        ) {
          stopCountdown();
          if (ctxSrc.readComposerDraft(doc).length > 0) {
            if (lastSnapshot?.cascadeId) countdownCanceledForSession.add(lastSnapshot.cascadeId);
            setToast(S().toastDraftProtected, 'warn');
          }
          render();
          return;
        }
        countdownRemaining -= 1;
        if (countdownRemaining <= 0) {
          stopCountdown();
          insertCompactIntoComposer({ submit: true, preserveScroll: true, triggerMode: 'auto-countdown' });
        }
        render();
      }, 1000);
      countdownTimer?.unref?.();
    };

    const render = () => {
      if (destroyed) return;
      const snap = lastSnapshot;
      const visible = shouldShowForSnapshot(snap);
      renderRecoveryBar();

      const isStallAlert = Boolean(lastWatchdog?.stalled && !lastWatchdog?.stallDismissed);

      // Zero-popup silent mode: never pop up a countdown banner above the composer;
      // silently trigger native two-step /compact once idle and empty.
      if (config.compactTriggerMode === 'auto-silent' && !isStallAlert) {
        stopCountdown();
        if (bannerEl) bannerEl.hidden = true;
        maybeManageSilentAutoCompact(snap, visible, false);
        return;
      }

      stopSilent();

      if (!visible) {
        stopCountdown();
        if (bannerEl) bannerEl.hidden = true;
        return;
      }
      const el = ensureBanner();
      if (!el) return;

      maybeManageCountdown(snap, visible, isStallAlert);

      const strings = S();
      const pct = snap ? snap.usedPct : 0;
      const used = snap ? ctxSrc.formatTokens(snap.usedTokens) : '—';
      const max = snap ? ctxSrc.formatTokens(snap.maxTokens) : '—';
      const isOverflow = pct >= 100;
      const isCounting = Boolean(countdownTimer && countdownRemaining > 0);

      el.hidden = !visible;
      el.setAttribute('data-severity', isStallAlert ? 'stall' : isCounting ? 'countdown' : isOverflow ? 'overflow' : 'warn');

      if (isStallAlert) {
        const totalSec = Math.max(1, Number(lastWatchdog.stalledForSec) || 0);
        const min = Math.floor(totalSec / 60);
        const sec = totalSec % 60;
        let stallTxt = i18n.formatTemplate(strings.pillStallAlert, { min, sec });
        const elapsed = Number(lastWatchdog.elapsedSec) || 0;
        if (elapsed > totalSec + 5 && strings.pillStallElapsed) {
          const eMin = Math.floor(elapsed / 60);
          const eSec = elapsed % 60;
          stallTxt += ` ${i18n.formatTemplate(strings.pillStallElapsed, { min: eMin, sec: eSec })}`;
        }
        msgEl.textContent = stallTxt;
      } else if (isCounting) {
        msgEl.textContent = i18n.formatTemplate(strings.pillCountdown, { pct, sec: countdownRemaining });
      } else if (snap?.streaming) {
        msgEl.textContent = i18n.formatTemplate(strings.pillStreaming, { pct });
      } else if (isOverflow) {
        msgEl.textContent = i18n.formatTemplate(strings.pillOverflow, { pct, used, max });
      } else {
        msgEl.textContent = i18n.formatTemplate(strings.pillReached, { pct, used, max });
      }

      if (focusTagEl) {
        const showFocus = !isStallAlert && config.compactFocusPreset !== 'default';
        focusTagEl.hidden = !showFocus;
        if (showFocus) {
          focusTagEl.textContent = getFocusLabel(strings);
          focusTagEl.title = buildCompactCommand();
        }
      }

      primaryBtn.textContent = config.compactTriggerMode === 'fill-only' ? strings.btnFillOnly : strings.btnCompactNow;
      primaryBtn.title = buildCompactCommand();
      primaryBtn.disabled = Boolean(snap?.streaming);
      primaryBtn.hidden = isStallAlert;
      snoozeBtn.textContent = strings.btnSnoozeStall;
      snoozeBtn.title = strings.btnSnoozeStallTitle;
      snoozeBtn.hidden = !isStallAlert;
      cancelCdBtn.textContent = strings.btnCancelCountdown;
      cancelCdBtn.hidden = !isCounting;
      dismissBtn.title = strings.btnDismiss;
      dismissBtn.setAttribute('aria-label', strings.btnDismiss);
      dismissBtn.hidden = isCounting;
    };

    async function evaluateNow() {
      if (destroyed || coexist.isWindowHibernated(doc, win, blurred)) return lastSnapshot;
      if (!config.modules.compactGuard) {
        stopCountdown();
        stopSilent();
        cancelPendingSlashSubmits();
        if (bannerEl) bannerEl.hidden = true;
        if (recoveryEl) recoveryEl.hidden = true;
        return lastSnapshot;
      }
      const scope = getScope();
      const snap = await ctxSrc.sampleContextState({
        win,
        doc,
        scopeEl: scope,
        getContextSnapshot: options.getContextSnapshot,
      });
      const prevCid = lastSnapshot?.cascadeId || '';
      lastSnapshot = snap;
      if (prevCid && snap?.cascadeId && snap.cascadeId !== prevCid) {
        cancelPendingSlashSubmits();
      }
      if (watchdog && snap) {
        lastWatchdog = watchdog.observe({
          snap,
          doc,
          scopeEl: scope,
          threshold: config.compactThreshold,
        });
        if (lastWatchdog.newlyStalled && typeof options.onStallDetected === 'function') {
          try {
            options.onStallDetected({
              cascadeId: snap.cascadeId,
              stalledForSec: lastWatchdog.stalledForSec,
            });
          } catch {}
        }
      }
      render();
      if (typeof options.onEvaluated === 'function') {
        try { options.onEvaluated(snap, lastWatchdog); } catch {}
      }
      return snap;
    }

    const stopPoll = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const startPoll = () => {
      stopPoll();
      if (destroyed || options.autoPoll === false || coexist.isWindowHibernated(doc, win, blurred)) return;
      const intervalMs = Math.max(500, Number(options.pollIntervalMs) || 3000);
      pollTimer = setInterval(() => {
        if (destroyed || coexist.isWindowHibernated(doc, win, blurred)) {
          stopPoll();
          stopCountdown();
          return;
        }
        void evaluateNow();
      }, intervalMs);
      pollTimer?.unref?.();
    };

    function updateConfig(patch) {
      if (destroyed) return config;
      const prevMode = config.compactTriggerMode;
      const prevEnabled = Boolean(config.modules.compactGuard);
      config = coexist.sanitizeConfig({ ...config, ...(patch || {}) }, config);
      if (options.persistConfig !== false) coexist.writeStoredConfig(storage, config);
      watchdog?.setConfig?.({
        enabled: Boolean(config.modules.sessionWatchdog),
        stallThresholdSeconds: config.stallThresholdSeconds,
      });
      if (!config.modules.compactGuard || config.compactTriggerMode !== prevMode || config.compactThreshold === 'off') {
        cancelPendingSlashSubmits();
      }
      if (!config.modules.compactGuard || config.compactTriggerMode !== 'auto-countdown' || config.compactThreshold === 'off') {
        stopCountdown();
      }
      if (!config.modules.compactGuard || config.compactTriggerMode !== 'auto-silent' || config.compactThreshold === 'off') {
        stopSilent();
      }
      if (prevEnabled && !config.modules.compactGuard) {
        if (bannerEl) bannerEl.hidden = true;
        if (recoveryEl) recoveryEl.hidden = true;
      }
      render();
      if (typeof options.onConfigChange === 'function') {
        try { options.onConfigChange({ ...config }); } catch {}
      }
      return { ...config };
    }

    function setEnabled(nextEnabled) {
      if (destroyed) return false;
      const flag = Boolean(nextEnabled);
      if (!flag) {
        stopCountdown();
        stopSilent();
        cancelPendingSlashSubmits();
      }
      updateConfig({ modules: { ...config.modules, compactGuard: flag } });
      return Boolean(config.modules.compactGuard);
    }

    const addL = (target, ev, fn, cap = false) => {
      if (!target || typeof target.addEventListener !== 'function') return;
      target.addEventListener(ev, fn, cap);
      listeners.push(() => target.removeEventListener?.(ev, fn, cap));
    };

    const onPaneFocus = (ev) => {
      if (destroyed || !ev?.target || !ctxSrc.findPaneRootForNode) return;
      const rootPane = ctxSrc.findPaneRootForNode(ev.target, doc);
      if (rootPane && rootPane !== activePaneEl) {
        activePaneEl = rootPane;
        cancelPendingSlashSubmits();
        void evaluateNow();
      }
    };
    addL(doc, 'pointerdown', onPaneFocus, true);
    addL(doc, 'focusin', onPaneFocus, true);

    // Lightweight passive reading-scroll tracker so auto-silent waits for the user to finish scrolling
    const onUserScrollActivity = () => {
      if (!destroyed) lastUserScrollAtMs = nowFn();
    };
    addL(doc, 'wheel', onUserScrollActivity, { passive: true, capture: true });
    addL(doc, 'touchmove', onUserScrollActivity, { passive: true, capture: true });
    addL(doc, 'keydown', (ev) => {
      if (!destroyed && ev && SCROLL_NAV_KEYS.has(ev.key) && !isEditableEventTarget(ev.target)) {
        lastUserScrollAtMs = nowFn();
      }
    }, true);

    addL(win, 'blur', () => {
      blurred = true;
      stopPoll();
      stopCountdown();
      stopSilent();
    });
    addL(win, 'focus', () => {
      blurred = false;
      void evaluateNow();
      startPoll();
    });
    addL(doc, 'visibilitychange', () => {
      if (doc?.hidden) {
        stopPoll();
        stopCountdown();
      } else {
        blurred = false;
        void evaluateNow();
        startPoll();
      }
    });

    function openSettingsPopover(tabId) {
      if (typeof options.onOpenSettingsDrawer === 'function') {
        return options.onOpenSettingsDrawer(tabId);
      }
      return false;
    }

    function getDebugState() {
      return {
        destroyed,
        config: { ...config, modules: { ...config.modules } },
        visible: Boolean(bannerEl && !bannerEl.hidden),
        recoveryVisible: Boolean(recoveryEl && !recoveryEl.hidden),
        popoverOpen: Boolean(options.isSettingsDrawerOpen?.()),
        countdownActive: Boolean(countdownTimer),
        countdownRemaining,
        silentPending: Boolean(silentTimer),
        pendingSlashTimers: slashTimers.size,
        scrollShieldActive: Boolean(activeScrollShield?.active),
        pollActive: Boolean(pollTimer),
        hibernated: coexist.isWindowHibernated(doc, win, blurred),
        lastSnapshot: lastSnapshot ? { ...lastSnapshot } : null,
        watchdog: lastWatchdog ? { ...lastWatchdog } : null,
      };
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      stopPoll();
      stopCountdown();
      stopSilent();
      cancelPendingSlashSubmits();
      if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
      if (composerListenerOff) { try { composerListenerOff(); } catch {} composerListenerOff = null; }
      while (listeners.length) {
        try { listeners.pop()(); } catch {}
      }
      try { bannerEl?.remove?.(); } catch {}
      try { recoveryEl?.remove?.(); } catch {}
      try { styleEl?.remove?.(); } catch {}
      bannerEl = recoveryEl = recoveryMsgEl = recoveryFillBtn = recoveryCopyBtn = recoveryDismissBtn = null;
      msgEl = focusTagEl = actionsEl = primaryBtn = snoozeBtn = cancelCdBtn = dismissBtn = toastEl = styleEl = null;
      activeRecovery = null;
      lastWatchdog = null;
      watchdog?.resetAll?.();
      sessionState.clear();
      countdownCanceledForSession.clear();
    }

    startPoll();
    if (options.autoPoll !== false) void evaluateNow();

    return {
      evaluateNow,
      updateConfig,
      setEnabled,
      getConfig: () => ({ ...config, modules: { ...config.modules } }),
      buildCompactCommand,
      captureRecoverySnapshot,
      insertCompact: insertCompactIntoComposer,
      exportMarkdown: handleExportMd,
      downloadMarkdown: (opts) => handleExportMd({ ...(opts || {}), download: true }),
      copyNewSessionHandoff: handleCopyNewSessionHandoff,
      snoozeStall: handleSnoozeStall,
      refreshUi: render,
      openSettingsPopover,
      getDebugState,
      destroy,
    };
  }

  return { THRESHOLD_PRESETS, STALL_PRESETS, COMPACT_CMD, createCompactGuardController };
});
