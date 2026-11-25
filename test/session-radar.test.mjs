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
