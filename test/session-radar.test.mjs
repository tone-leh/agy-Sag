import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const radar = require('../packages/core/session-radar.js');

function makeNode(tag) {
  const attrs = new Map();
  const cls = new Set();
  const ls = new Map();
  const el = {
    tagName: String(tag).toUpperCase(),
    nodeType: 1,
    hidden: false,
    _text: '',
    children: [],
    parentElement: null,
    get firstChild() { return el.children[0] || null; },
    get className() { return [...cls].join(' '); },
    set className(v) { cls.clear(); String(v || '').split(/\s+/).filter(Boolean).forEach((c) => cls.add(c)); },
    classList: { contains: (c) => cls.has(c) },
    get textContent() { return el.children.length ? el._text + el.children.map((c) => c.textContent).join('') : el._text; },
    set textContent(v) { el._text = String(v ?? ''); el.children.length = 0; },
    setAttribute(k, v) { attrs.set(k, String(v)); },
    getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
    hasAttribute(k) { return attrs.has(k); },
    removeAttribute(k) { attrs.delete(k); },
    appendChild(c) { c.parentElement = el; el.children.push(c); return c; },
    insertBefore(c, ref) {
      c.parentElement = el;
      const i = el.children.indexOf(ref);
      if (i >= 0) el.children.splice(i, 0, c);
      else el.children.push(c);
      return c;
    },
    remove() {
      if (!el.parentElement) return;
      el.parentElement.children = el.parentElement.children.filter((x) => x !== el);
      el.parentElement = null;
    },
    addEventListener(ev, fn) { if (!ls.has(ev)) ls.set(ev, []); ls.get(ev).push(fn); },
    removeEventListener() {},
    click() { for (const fn of ls.get('click') || []) fn({ preventDefault() {}, stopPropagation() {} }); },
    querySelectorAll(sel) {
      const out = [];
      const match = (n) =>
        sel.split(',').some((raw) => {
          const s = raw.trim();
          const m = /^\[([^\]=*]+)(\*)?(?:="([^"]*)")?\]$/.exec(s);
          if (!m) return false;
          const val = n.getAttribute(m[1]);
          if (val === null) return false;
          if (m[3] === undefined) return true;
          return m[2] === '*' ? val.includes(m[3]) : val === m[3];
        });
      const walk = (n) => {
        for (const c of n.children) {
          if (match(c)) out.push(c);
          walk(c);
        }
      };
      walk(el);
      return out;
    },
    querySelector(sel) { return el.querySelectorAll(sel)[0] || null; },
  };
  return el;
}

test('SessionRadar: default-off gating and running -> awaiting_decision / completed transitions', () => {
  const events = [];
  const ctl = radar.createSessionRadarController({
    enabled: false,
    onTransition: (ev) => events.push(ev),
  });

  assert.deepEqual(ctl.sync([{ id: 's1', status: 'running', title: 'Build' }]), []);
  assert.equal(events.length, 0);

  ctl.setEnabled(true);
  ctl.sync([
    { id: 's1', status: 'running', title: 'Deploy' },
    { id: 's2', status: 'running', title: 'Refactor' },
  ]);
  assert.equal(events.length, 0, 'Initial baseline snapshot must not emit spurious transition events');

  ctl.sync([
    { id: 's1', status: 'awaiting_decision', title: 'Deploy' },
    { id: 's2', status: 'completed', title: 'Refactor' },
  ]);
  assert.equal(events.length, 2);
  assert.deepEqual(events[0].type, 'awaiting_decision');
  assert.deepEqual(events[1].type, 'completed');

  ctl.destroy();
  assert.equal(ctl.getDebugState().destroyed, true);
  assert.equal(ctl.getDebugState().trackedCount, 0);
});

test('SessionRadar: sidebar attention filter pill filters rows, sends blurred-only OS alert, and restores cleanly on destroy()', () => {
  const doc = {
    hidden: false,
    documentElement: makeNode('html'),
    body: makeNode('body'),
    createElement: makeNode,
    querySelectorAll: (s) => doc.body.querySelectorAll(s),
    querySelector: (s) => doc.body.querySelector(s),
  };
  doc.documentElement.setAttribute('data-ag-cs-lang', 'zh-CN');

  const sidebar = makeNode('div');
  sidebar.setAttribute('data-testid', 'conversation-list-sidebar');
  const rRun = makeNode('div');
  rRun.setAttribute('data-testid', 'conversation-row-sidebar');
  rRun.setAttribute('data-cascade-id', 's-run');
  rRun.setAttribute('data-status', 'running');
  rRun.textContent = 'Running task';
  const rAwait = makeNode('div');
  rAwait.setAttribute('data-testid', 'conversation-row-sidebar');
  rAwait.setAttribute('data-cascade-id', 's-await');
  rAwait.setAttribute('data-status', 'awaiting_decision');
  rAwait.textContent = 'Needs approval';
  const rIdle = makeNode('div');
  rIdle.setAttribute('data-testid', 'conversation-row-sidebar');
  rIdle.setAttribute('data-cascade-id', 's-idle');
  rIdle.setAttribute('data-status', 'idle');
  rIdle.textContent = 'Idle chat';
  sidebar.appendChild(rRun);
  sidebar.appendChild(rAwait);
  sidebar.appendChild(rIdle);
  doc.body.appendChild(sidebar);

  const alerts = [];
  const win = { document: doc, addEventListener() {}, removeEventListener() {} };
  const ctl = radar.createSessionRadarController({
    win,
    doc,
    enabled: true,
    notifyMode: 'awaiting',
    onNotify: (n) => alerts.push(n),
  });

  // Filter to awaiting_decision only
  ctl.setFilterMode('awaiting_decision');
  assert.equal(rAwait.hidden, false);
  assert.equal(rRun.hidden, true);
  assert.equal(rIdle.hidden, true);

  // While focused (not blurred), transition must NOT send blurred OS notification
  rRun.setAttribute('data-status', 'awaiting_decision');
  ctl.syncFromDom();
  assert.equal(alerts.length, 0, 'Must NOT notify while window is focused');

  // Switch back to running, then blur window, then transition to awaiting_decision -> MUST notify
  rRun.setAttribute('data-status', 'running');
  ctl.syncFromDom();
  doc.hidden = true;
  rRun.setAttribute('data-status', 'awaiting_decision');
  ctl.syncFromDom();
  assert.equal(alerts.length, 1, 'Must fire opt-in notification when window is blurred/hidden');
  assert.equal(alerts[0].id, 's-run');

  ctl.destroy();
  assert.equal(rIdle.hidden, false, 'destroy() must unhide all filtered sidebar rows');
  assert.equal(doc.querySelector('[data-testid="ag-sg-radar-bar"]'), null);
});

test('SessionRadar: recognizes real Antigravity v2.35.1 running & awaiting row indicators', () => {
  const rowSpinner = makeNode('div');
  const sp = makeNode('span');
  sp.setAttribute('data-testid', 'status-loading-spinner');
  rowSpinner.appendChild(sp);
  assert.equal(radar.classifyRowStatus(rowSpinner), 'running');

  const rowPrismRun = makeNode('div');
  rowPrismRun.setAttribute('data-ag-cs-row-running', '1');
  assert.equal(radar.classifyRowStatus(rowPrismRun), 'running');

  const rowPerm = makeNode('div');
  const p = makeNode('span');
  p.setAttribute('data-testid', 'permission-request-badge');
  rowPerm.appendChild(p);
  assert.equal(radar.classifyRowStatus(rowPerm), 'awaiting_decision');
});

test('SessionRadar Phase 5: quiet hours parser handles overnight, same-day & invalid ranges', () => {
  assert.equal(radar.normalizeQuietHours('22:00-08:00'), '22:00-08:00');
  assert.equal(radar.normalizeQuietHours('25:99-08:00'), '');
  assert.equal(radar.isWithinQuietHours('22:00-08:00', new Date(2026, 10, 27, 23, 30)), true);
  assert.equal(radar.isWithinQuietHours('22:00-08:00', new Date(2026, 10, 27, 7, 15)), true);
  assert.equal(radar.isWithinQuietHours('22:00-08:00', new Date(2026, 10, 27, 14, 0)), false);
  assert.equal(radar.isWithinQuietHours('13:00-14:00', new Date(2026, 10, 27, 13, 30)), true);
  assert.equal(radar.isWithinQuietHours('13:00-14:00', new Date(2026, 10, 27, 14, 5)), false);
});

test('SessionRadar Phase 5: WebAudio chime & local TTS fire only when blurred, respect quiet hours, and degrade gracefully', () => {
  const doc = {
    hidden: false,
    documentElement: makeNode('html'),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => makeNode(tag),
  };

  let oscCount = 0;
  let spokenTexts = [];
  const win = {
    document: doc,
    navigator: { language: 'zh-CN' },
    addEventListener() {},
    removeEventListener() {},
    AudioContext: class FakeAudioContext {
      constructor() { this.currentTime = 0; this.destination = {}; }
      createOscillator() {
        oscCount += 1;
        return { type: '', frequency: { setValueAtTime() {} }, connect() {}, start() {}, stop() {} };
      }
      createGain() {
        return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
      }
      close() {}
    },
    SpeechSynthesisUtterance: class FakeUtter {
      constructor(t) { this.text = t; }
    },
    speechSynthesis: {
      cancel() {},
      speak(u) { spokenTexts.push(u.text); },
    },
  };

  let fakeTime = new Date(2026, 10, 27, 15, 0).getTime(); // 15:00 (outside quiet hours)
  const ctl = radar.createSessionRadarController({
    win,
    doc,
    enabled: true,
    notifyMode: 'off',
    audioMode: 'both',
    quietHours: '22:00-08:00',
    now: () => fakeTime,
  });

  try {
    // Focused window -> must NOT play audio/TTS
    assert.equal(ctl.notifyCompactThreshold({ pct: 85, cascadeId: 'c1' }), false);
    assert.equal(oscCount, 0);
    assert.equal(spokenTexts.length, 0);

    // Blurred window outside quiet hours -> fires both WebAudio chime & local TTS
    doc.hidden = true;
    assert.equal(ctl.notifyCompactThreshold({ pct: 85, cascadeId: 'c1' }), true);
    assert.ok(oscCount >= 2);
    assert.equal(spokenTexts.length, 1);
    assert.equal(ctl.getDebugState().audioPlayedCount, 1);
    assert.equal(ctl.getDebugState().ttsSpokenCount, 1);

    // Inside quiet hours (23:15) -> suppressed cleanly
    fakeTime = new Date(2026, 10, 27, 23, 15).getTime();
    assert.equal(ctl.notifyStall({ cascadeId: 'c1', stalledForSec: 180 }), false);
    assert.equal(ctl.getDebugState().quietSuppressedCount, 1);
    assert.equal(spokenTexts.length, 1);

    // Explicit testAudioAlert works regardless of blur/quiet hours
    const testRes = ctl.testAudioAlert();
    assert.equal(testRes.played, true);
    assert.equal(testRes.spoken, true);
  } finally {
    ctl.destroy();
  }

  // Graceful degradation when WebAudio & speechSynthesis are absent
  assert.equal(radar.playSynthesizedChime({}, 'completed'), false);
  assert.equal(radar.speakLocalAlert({}, 'hello', 'en'), false);
});
