// agy-Sag — Session Radar Module (Module B: Sidebar Attention Filter + Blurred OS Alert, UMD)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSgSessionRadar = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  function resolveDep(globalKey, relPath) {
    if (globalRoot && globalRoot[globalKey]) return globalRoot[globalKey];
    if (typeof require === 'function') return require(relPath);
    return null;
  }

  const AWAITING_RE = /\b(?:awaiting|waiting\s+for\s+(?:input|approval)|needs?\s+(?:input|attention|approval)|action\s+required)\b|等待(?:确认|审批|输入)|需要(?:确认|操作|输入)/i;
  const RUNNING_RE = /\b(?:running|working|thinking|in\s+progress|generating|streaming)\b|运行中|正在(?:运行|思考|生成)/i;
  const AUDIO_MODES = Object.freeze(['off', 'chime', 'tts', 'both']);
  const QUIET_HOURS_RE = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/;

  function normalizeQuietHours(raw) {
    const s = String(raw || '').trim();
    return QUIET_HOURS_RE.test(s) ? s : '';
  }

  function isWithinQuietHours(quietHoursStr, nowInput = null) {
    const clean = normalizeQuietHours(quietHoursStr);
    if (!clean) return false;
    const m = clean.match(QUIET_HOURS_RE);
    if (!m) return false;
    const startMin = Number(m[1]) * 60 + Number(m[2]);
    const endMin = Number(m[3]) * 60 + Number(m[4]);
    if (startMin === endMin) return false;
    const d = nowInput instanceof Date ? nowInput : nowInput ? new Date(nowInput) : new Date();
    const curMin = d.getHours() * 60 + d.getMinutes();
    if (startMin < endMin) {
      return curMin >= startMin && curMin < endMin;
    }
    return curMin >= startMin || curMin < endMin;
  }

  function playSynthesizedChime(win, eventType = 'awaiting_decision') {
    const AudioCtor = win?.AudioContext || win?.webkitAudioContext;
    if (typeof AudioCtor !== 'function') return false;
    let ctx = null;
    try {
      ctx = new AudioCtor();
      const now = Number(ctx.currentTime) || 0;
      const notes =
        eventType === 'stalled'
          ? [392, 330]
          : eventType === 'compact_warn'
            ? [523.25, 440]
            : eventType === 'completed'
              ? [523.25, 659.25]
              : [587.33, 880]; // awaiting_decision bright two-tone chime

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.14);
        gain.gain.setValueAtTime(0.001, now + idx * 0.14);
        gain.gain.exponentialRampToValueAtTime(0.08, now + idx * 0.14 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0008, now + idx * 0.14 + 0.24);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.14);
        osc.stop(now + idx * 0.14 + 0.26);
      });
      const closeTimer = setTimeout(() => {
        try { ctx?.close?.(); } catch {}
      }, 700);
      closeTimer?.unref?.();
      return true;
    } catch {
      try { ctx?.close?.(); } catch {}
      return false;
    }
  }

  function speakLocalAlert(win, text, lang = 'en') {
    const synth = win?.speechSynthesis;
    const UtterCtor = win?.SpeechSynthesisUtterance;
    if (!synth || typeof synth.speak !== 'function' || typeof UtterCtor !== 'function') return false;
    const cleanText = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 140);
    if (!cleanText) return false;
    try {
      synth.cancel?.();
      const utter = new UtterCtor(cleanText);
      utter.lang = String(lang || 'en');
      utter.rate = 1.05;
      utter.volume = 0.85;
      synth.speak(utter);
      return true;
    } catch {
      return false;
    }
  }

  function classifyRowStatus(row) {
    if (!row) return 'idle';
    const explicit = String(
      row.getAttribute?.('data-status') ||
      row.getAttribute?.('data-run-status') ||
      row.getAttribute?.('data-ag-status') ||
      ''
    ).toLowerCase();
    if (/await|wait|approv|decision|attention|blocked/.test(explicit)) return 'awaiting_decision';
    if (/run|work|stream|progress|active/.test(explicit)) return 'running';

    if (
      row.hasAttribute?.('data-ag-cs-row-awaiting') ||
      row.querySelector?.(
        '[data-testid*="await"], [data-testid*="approval"], [data-testid*="attention"], [data-testid*="needs-input"], [data-testid*="permission-request"], [data-status="awaiting_decision"]'
      )
    ) {
      return 'awaiting_decision';
    }
    if (
      row.hasAttribute?.('data-ag-cs-row-running') ||
      row.querySelector?.(
        '[data-testid="status-loading-spinner"], [data-testid="status-task-running"], [data-testid*="running"], [data-ag-sub-running="1"], [data-status="running"]'
      )
    ) {
      return 'running';
    }
    const label = `${row.getAttribute?.('aria-label') || ''} ${row.textContent || ''}`;
    if (AWAITING_RE.test(label)) return 'awaiting_decision';
    if (RUNNING_RE.test(label)) return 'running';
    return 'idle';
  }

  function extractRowMeta(row, index) {
    const id =
      row.getAttribute?.('data-cascade-id') ||
      row.getAttribute?.('data-conversation-id') ||
      row.getAttribute?.('data-id') ||
      `row-${index + 1}`;
    const titleNode = row.querySelector?.('[data-testid="conversation-title"], .truncate, span') || row;
    const title = String(titleNode.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    return { id, title, status: classifyRowStatus(row), el: row };
  }

  function detectAttentionTransitions(prevById, nextSessions) {
    const events = [];
    const nextMap = new Map();
    for (const s of Array.isArray(nextSessions) ? nextSessions : []) {
      if (!s || !s.id) continue;
      const status = String(s.status || 'idle');
      nextMap.set(s.id, status);
      const prev = prevById?.get?.(s.id) || null;
      if (prev && prev !== status) {
        if (status === 'awaiting_decision') {
          events.push({ type: 'awaiting_decision', id: s.id, title: s.title || '', el: s.el || null });
        } else if (prev === 'running' && (status === 'idle' || status === 'completed')) {
          events.push({ type: 'completed', id: s.id, title: s.title || '', el: s.el || null });
        }
      }
    }
    return { events, nextMap };
  }

  function createSessionRadarController(options = {}) {
    const win = options.win || globalRoot;
    const doc = options.doc || win?.document || null;
    const coexist = options.coexist || resolveDep('__agSgCoexist', './coexist.js');
    const i18n = options.i18n || resolveDep('__agSgI18n', './i18n.js');

    let enabled = Boolean(options.enabled);
    let notifyMode = ['off', 'awaiting', 'all'].includes(options.notifyMode) ? options.notifyMode : 'off';
    let audioMode = AUDIO_MODES.includes(options.audioMode) ? options.audioMode : 'off';
    let quietHours = normalizeQuietHours(options.quietHours);
    let filterMode = 'all'; // 'all' | 'running' | 'awaiting_decision'
    let destroyed = false;
    let blurred = false;
    let prevStates = new Map();
    let counts = { all: 0, running: 0, awaiting: 0 };
    let barEl = null;
    let notificationsSent = 0;
    let audioPlayedCount = 0;
    let ttsSpokenCount = 0;
    let quietSuppressedCount = 0;
    const listeners = [];
    const nowFn = typeof options.now === 'function' ? options.now : () => Date.now();

    const getLang = () => (typeof options.getLang === 'function' ? i18n.normalizeLang(options.getLang()) : i18n.detectLang(doc, win));
    const S = () => i18n.getStrings(getLang());

    const clearFilterHiding = () => {
      try {
        doc?.querySelectorAll?.('[data-ag-sg-radar-hidden="1"]')?.forEach?.((row) => {
          row.hidden = false;
          row.removeAttribute?.('data-ag-sg-radar-hidden');
        });
      } catch {}
    };

    const removeBar = () => {
      try { barEl?.remove?.(); } catch {}
      barEl = null;
      clearFilterHiding();
    };

    const ensureBar = () => {
      if (!doc || !enabled) return null;
      const sidebar = doc.querySelector?.('[data-testid="conversation-list-sidebar"]');
      if (!sidebar) return null;
      if (barEl && barEl.isConnected !== false) return barEl;

      const wrap = coexist.markOwnedNoTranslate(doc.createElement('div'));
      wrap.className = 'ag-sg-radar-bar';
      wrap.setAttribute('data-testid', 'ag-sg-radar-bar');
      wrap.setAttribute('role', 'tablist');

      const defs = [
        ['all', 'all'],
        ['running', 'running'],
        ['awaiting_decision', 'awaiting'],
      ];
      for (const [key] of defs) {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'ag-sg-radar-pill';
        b.setAttribute('data-ag-sg-radar-filter', key);
        b.setAttribute('aria-pressed', String(filterMode === key));
        b.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          filterMode = key;
          syncFromDom();
        });
        wrap.appendChild(b);
      }

      if (sidebar.firstChild) sidebar.insertBefore(wrap, sidebar.firstChild);
      else sidebar.appendChild(wrap);
      barEl = wrap;
      return barEl;
    };

    const updateBarLabels = () => {
      if (!barEl) return;
      const strings = S();
      const map = {
        all: `${strings.radarAll} ${counts.all}`,
        running: `${strings.radarRunning} ${counts.running}`,
        awaiting_decision: `${strings.radarAwaiting} ${counts.awaiting}`,
      };
      const btns = barEl.querySelectorAll?.('[data-ag-sg-radar-filter]') || [];
      for (const b of btns) {
        const k = b.getAttribute?.('data-ag-sg-radar-filter');
        if (k && map[k]) {
          b.textContent = map[k];
          b.setAttribute('aria-pressed', String(filterMode === k));
          b.setAttribute('data-has-alert', k === 'awaiting_decision' && counts.awaiting > 0 ? '1' : '0');
        }
      }
    };

    const dispatchNonVisualAudio = (evType, spokenText) => {
      let played = false;
      let spoken = false;
      if (audioMode === 'chime' || audioMode === 'both') {
        played = typeof options.onPlayChime === 'function'
          ? Boolean(options.onPlayChime(evType))
          : playSynthesizedChime(win, evType);
        if (played) audioPlayedCount += 1;
      }
      if (audioMode === 'tts' || audioMode === 'both') {
        const lang = getLang();
        spoken = typeof options.onSpeakTts === 'function'
          ? Boolean(options.onSpeakTts(spokenText, lang, evType))
          : speakLocalAlert(win, spokenText, lang);
        if (spoken) ttsSpokenCount += 1;
      }
      return { played, spoken };
    };

    const maybeNotify = (ev) => {
      const osAllowed = notifyMode !== 'off' && (notifyMode !== 'awaiting' || ev.type === 'awaiting_decision');
      const audioAllowed = audioMode !== 'off';
      if (!osAllowed && !audioAllowed) return false;
      if (!coexist.isWindowHibernated(doc, win, blurred)) return false;

      if (isWithinQuietHours(quietHours, nowFn())) {
        quietSuppressedCount += 1;
        return false;
      }

      const strings = S();
      const title =
        ev.type === 'awaiting_decision'
          ? strings.radarNotifyAwaitingTitle
          : ev.type === 'stalled'
            ? strings.radarNotifyStallTitle
            : ev.type === 'compact_warn'
              ? (strings.brand || 'agy-Sag')
              : strings.radarNotifyDoneTitle;
      const body = ev.title || ev.id;

      let fired = false;
      if (audioAllowed) {
        const audioRes = dispatchNonVisualAudio(ev.type, `${title}. ${body}`);
        if (audioRes.played || audioRes.spoken) fired = true;
      }

      if (osAllowed) {
        if (typeof options.onNotify === 'function') {
          options.onNotify({ ...ev, notifTitle: title, notifBody: body, audioMode });
          notificationsSent += 1;
          return true;
        }

        const NotifCtor = win?.Notification;
        if (typeof NotifCtor === 'function' && NotifCtor.permission === 'granted') {
          try {
            const n = new NotifCtor(title, { body, tag: `ag-sg-${ev.id}` });
            n.onclick = () => {
              try { win.focus?.(); } catch {}
              try { ev.el?.click?.(); } catch {}
            };
            notificationsSent += 1;
            return true;
          } catch {}
        }
      }
      return fired;
    };

    function sync(sessions = []) {
      if (destroyed || !enabled) return [];
      const { events, nextMap } = detectAttentionTransitions(prevStates, sessions);
      prevStates = nextMap;
      counts = {
        all: sessions.length,
        running: sessions.filter((s) => s.status === 'running').length,
        awaiting: sessions.filter((s) => s.status === 'awaiting_decision').length,
      };
      if (events.length) {
        for (const ev of events) {
          maybeNotify(ev);
          if (typeof options.onTransition === 'function') options.onTransition(ev);
        }
      }
      updateBarLabels();
      return events;
    }

    function syncFromDom() {
      if (destroyed || !enabled) {
        removeBar();
        return [];
      }
      const sidebar = doc?.querySelector?.('[data-testid="conversation-list-sidebar"]');
      if (!sidebar) return [];
      ensureBar();
      const rows = Array.from(sidebar.querySelectorAll?.('[data-testid="conversation-row-sidebar"]') || []);
      const sessions = rows.map((row, i) => extractRowMeta(row, i));

      for (const s of sessions) {
        const match = filterMode === 'all' || s.status === filterMode;
        if (!match) {
          s.el.hidden = true;
          s.el.setAttribute('data-ag-sg-radar-hidden', '1');
        } else if (s.el.getAttribute?.('data-ag-sg-radar-hidden') === '1') {
          s.el.hidden = false;
          s.el.removeAttribute?.('data-ag-sg-radar-hidden');
        }
      }
      return sync(sessions);
    }

    const addL = (target, ev, fn) => {
      if (!target || typeof target.addEventListener !== 'function') return;
      target.addEventListener(ev, fn);
      listeners.push(() => target.removeEventListener?.(ev, fn));
    };
    addL(win, 'blur', () => { blurred = true; });
    addL(win, 'focus', () => { blurred = false; });

    function setEnabled(v) {
      if (destroyed) return;
      enabled = Boolean(v);
      if (!enabled) {
        prevStates.clear();
        filterMode = 'all';
        removeBar();
      } else {
        syncFromDom();
      }
    }

    function setNotifyMode(m) {
      if (destroyed) return;
      notifyMode = ['off', 'awaiting', 'all'].includes(m) ? m : 'off';
    }

    function setAudioMode(m) {
      if (destroyed) return;
      audioMode = AUDIO_MODES.includes(m) ? m : 'off';
    }

    function setQuietHours(raw) {
      if (destroyed) return;
      quietHours = normalizeQuietHours(raw);
    }

    function testAudioAlert() {
      if (destroyed) return { played: false, spoken: false };
      const prevMode = audioMode;
      if (audioMode === 'off') {
        const played = typeof options.onPlayChime === 'function'
          ? Boolean(options.onPlayChime('awaiting_decision'))
          : playSynthesizedChime(win, 'awaiting_decision');
        if (played) audioPlayedCount += 1;
        return { played, spoken: false };
      }
      const res = dispatchNonVisualAudio('awaiting_decision', S().radarNotifyAwaitingTitle || 'agy-Sag alert test');
      audioMode = prevMode;
      return res;
    }

    function notifyCompactThreshold({ pct = 80, cascadeId = '' } = {}) {
      if (destroyed) return false;
      const body = i18n.formatTemplate(S().pillReached || 'Context at {pct}%', { pct });
      return maybeNotify({ type: 'compact_warn', id: cascadeId || 'active-session', title: body, el: null });
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      enabled = false;
      while (listeners.length) {
        try { listeners.pop()(); } catch {}
      }
      prevStates.clear();
      removeBar();
    }

    if (enabled) syncFromDom();

    function notifyStall({ cascadeId = '', stalledForSec = 0 } = {}) {
      if (destroyed) return false;
      const min = Math.floor(Math.max(1, Number(stalledForSec) || 0) / 60);
      const sec = Math.max(0, Number(stalledForSec) || 0) % 60;
      const body = i18n.formatTemplate(S().pillStallAlert, { min, sec });
      return maybeNotify({ type: 'stalled', id: cascadeId || 'active-session', title: body, el: null });
    }

    return {
      sync,
      syncFromDom,
      notifyStall,
      notifyCompactThreshold,
      testAudioAlert,
      setEnabled,
      setNotifyMode,
      setAudioMode,
      setQuietHours,
      setFilterMode: (m) => {
        if (['all', 'running', 'awaiting_decision'].includes(m)) {
          filterMode = m;
          syncFromDom();
        }
      },
      getDebugState: () => ({
        enabled,
        destroyed,
        notifyMode,
        audioMode,
        quietHours,
        filterMode,
        counts: { ...counts },
        trackedCount: prevStates.size,
        notificationsSent,
        audioPlayedCount,
        ttsSpokenCount,
        quietSuppressedCount,
      }),
      destroy,
    };
  }

  return {
    AUDIO_MODES,
    normalizeQuietHours,
    isWithinQuietHours,
    playSynthesizedChime,
    speakLocalAlert,
    classifyRowStatus,
    detectAttentionTransitions,
    createSessionRadarController,
  };
});
