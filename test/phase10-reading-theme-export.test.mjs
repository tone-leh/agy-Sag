import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const readingNavMod = require('../packages/core/reading-nav.js');
const themeStudioMod = require('../packages/core/theme-studio.js');
const exporterMod = require('../packages/core/precompact-export.js');
const coexistMod = require('../packages/core/coexist.js');

function makeEl(tag) {
  const attrs = new Map();
  const cls = new Set();
  const ls = new Map();
  const el = {
    tagName: String(tag).toUpperCase(),
    nodeType: 1,
    id: '',
    value: '',
    open: true,
    offsetHeight: 0,
    scrollTop: 0,
    style: {},
    children: [],
    parentElement: null,
    parentNode: null,
    scrolled: false,
    focused: false,
    _rectTop: 0,
    get isConnected() { return true; },
    get firstChild() { return el.children[0] || null; },
    get className() { return [...cls].join(' '); },
    set className(v) { cls.clear(); String(v || '').split(/\s+/).filter(Boolean).forEach((c) => cls.add(c)); },
    classList: { add: (...a) => a.forEach((c) => c && cls.add(c)), remove: (...a) => a.forEach((c) => cls.delete(c)), contains: (c) => cls.has(c) },
    _text: '',
    get textContent() { return el.children.length ? el._text + el.children.map((c) => c.textContent).join('') : el._text; },
    set textContent(v) { el._text = String(v ?? ''); el.children.length = 0; },
    setAttribute(k, v) { attrs.set(k, String(v)); if (k === 'id') el.id = String(v); if (k === 'class') el.className = String(v); },
    getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
    hasAttribute(k) { return attrs.has(k); },
    removeAttribute(k) { attrs.delete(k); },
    appendChild(c) { if (c.parentElement) c.remove(); c.parentElement = el; c.parentNode = el; el.children.push(c); return c; },
    insertBefore(c, ref) { if (!ref) return el.appendChild(c); const i = el.children.indexOf(ref); c.parentElement = el; c.parentNode = el; el.children.splice(i < 0 ? el.children.length : i, 0, c); return c; },
    removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); c.parentElement = null; c.parentNode = null; return c; },
    remove() { el.parentElement?.removeChild(el); },
    cloneNode() { const c = makeEl(el.tagName); c.id = el.id; c.textContent = el.textContent; return c; },
    getBoundingClientRect() { return { top: el._rectTop, height: el.offsetHeight }; },
    scrollIntoView() { el.scrolled = true; },
    focus() { el.focused = true; },
    addEventListener(ev, fn) { if (!ls.has(ev)) ls.set(ev, []); ls.get(ev).push(fn); },
    removeEventListener(ev, fn) { const a = ls.get(ev); if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
    dispatchEvent(ev) { const e = typeof ev === 'string' ? { type: ev } : ev; for (const fn of [...(ls.get(e.type) || [])]) fn(e); return true; },
    click() { el.dispatchEvent({ type: 'click', target: el, preventDefault() {}, stopPropagation() {} }); },
    closest() { return null; },
    querySelectorAll(sel) {
      const out = [];
      const parts = sel.split(',').map((s) => s.trim());
      const match = (n) => parts.some((p) => {
        if (p === 'pre' && n.tagName === 'PRE') return true;
        if (p === 'details' && n.tagName === 'DETAILS') return true;
        if (p === 'iframe' && n.tagName === 'IFRAME') return true;
        if (p === 'svg[id^="mermaid"]' && n.tagName === 'SVG' && String(n.id || '').startsWith('mermaid')) return true;
        if (p === '.mermaid svg' && n.tagName === 'SVG' && n.parentElement?.classList.contains('mermaid')) return true;
        if (p.startsWith('.') && n.classList.contains(p.slice(1))) return true;
        const mEq = p.match(/^\[([a-zA-Z0-9-]+)="([^"]+)"\]$/);
        if (mEq && n.getAttribute(mEq[1]) === mEq[2]) return true;
        const mHas = p.match(/^\[([a-zA-Z0-9-]+)\]$/);
        if (mHas && n.hasAttribute(mHas[1])) return true;
        return false;
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

test('Phase 10: readingNav 2.0 protects streaming tail code, covers artifact-view, supports wrap/scroll-compensation, uncapped searchable outline, fold-all & Mermaid zoom', () => {
  const doc = {
    documentElement: makeEl('html'),
    head: makeEl('head'),
    body: makeEl('body'),
    createElement: makeEl,
    getElementById: () => null,
    querySelector: (s) => doc.documentElement.querySelector(s),
    querySelectorAll: (s) => doc.documentElement.querySelectorAll(s),
    addEventListener(ev, fn) { doc.body.addEventListener(ev, fn); },
    removeEventListener(ev, fn) { doc.body.removeEventListener(ev, fn); },
  };
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);

  const conv = makeEl('div');
  conv.setAttribute('data-testid', 'conversation-view');
  conv.scrollTop = 900;
  // Add 35 turns (> old 30-dot cap)
  for (let i = 1; i <= 35; i += 1) {
    const u = makeEl('div');
    u.setAttribute('data-testid', 'user-message-bubble');
    u.textContent = i === 33 ? 'Fix auth token expiry' : `Question number ${i}`;
    conv.appendChild(u);
  }
  const det = makeEl('details');
  det.open = true;
  conv.appendChild(det);

  const tailPre = makeEl('pre');
  tailPre.textContent = 'line\n'.repeat(45);
  tailPre.offsetHeight = 620;
  tailPre._rectTop = -120;
  conv.appendChild(tailPre);

  const mermaidSvg = makeEl('svg');
  mermaidSvg.setAttribute('id', 'mermaid-1');
  mermaidSvg.textContent = 'graph LR; A-->B;';
  conv.appendChild(mermaidSvg);
  doc.body.appendChild(conv);

  const art = makeEl('div');
  art.setAttribute('data-testid', 'artifact-view');
  const artPre = makeEl('pre');
  artPre.textContent = 'artifact line\n'.repeat(44);
  art.appendChild(artPre);
  doc.body.appendChild(art);

  let streaming = true;
  const rn = readingNavMod.createReadingNavController({
    win: { document: doc },
    doc,
    coexist: coexistMod,
    contextSource: {
      resolveActivePaneScope: () => doc,
      resolveActiveConversationView: () => conv,
      findConversationScrollViewport: () => conv,
    },
    enabled: true,
    autoObserve: false,
    isStreaming: () => streaming,
    getStarredTurns: () => [33],
  });

  try {
    // 1) Streaming guard skips folding tailPre in conv, while still enhancing artifact-view pre
    assert.equal(tailPre.getAttribute('data-ag-sag-code-enhanced'), null, 'Streaming tail pre must not be folded mid-stream');
    assert.equal(artPre.getAttribute('data-ag-sag-code-enhanced'), '1', 'Artifact view pre must be enhanced');

    // Finish streaming -> tailPre enhanced + wrap toggle + scroll compensation
    streaming = false;
    rn.sync();
    assert.equal(tailPre.getAttribute('data-ag-sag-code-enhanced'), '1');
    const wrapBtn = conv.querySelector('[data-ag-sag-code-wrap-btn="1"]');
    wrapBtn.click();
    assert.equal(tailPre.getAttribute('data-ag-sag-code-wrap'), '1');
    // Expand then collapse with negative rect.top -> scrollTop compensates upward
    const toggleBtn = conv.querySelector('[data-ag-sag-code-toggle="1"]');
    toggleBtn.click(); // expand
    tailPre.offsetHeight = 620;
    toggleBtn.click(); // fold back
    assert.ok(conv.scrollTop < 900, 'Folding tall code block above viewport must compensate scrollTop');

    // 2) Uncapped rail (>30 turns) + Alt+F searchable outline + fold-all details
    assert.equal(doc.querySelectorAll('.ag-sag-rnav-dot').length, 35, 'Rail must render all 35 turns without 30-dot cap');
    rn.openOutlineSearch();
    const inp = doc.querySelector('[data-testid="ag-sag-rnav-outline-input"]');
    assert.ok(inp && inp.focused);
    inp.value = 'expiry';
    inp.dispatchEvent({ type: 'input', target: inp });
    const items = doc.querySelectorAll('.ag-sag-rnav-outline-item');
    assert.equal(items.length, 1);
    assert.ok(items[0].textContent.includes('#33 ★'));

    // Dynamic live turn added while outline is open must be found immediately on next input
    const u36 = makeEl('div');
    u36.setAttribute('data-testid', 'user-message-bubble');
    u36.textContent = 'Brand new dynamic turn 36';
    conv.appendChild(u36);
    inp.value = 'dynamic turn 36';
    inp.dispatchEvent({ type: 'input', target: inp });
    const liveItems = doc.querySelectorAll('.ag-sag-rnav-outline-item');
    assert.equal(liveItems.length, 1);
    assert.ok(liveItems[0].textContent.includes('#36'));

    rn.toggleFoldAllStepsAndCode(true);
    assert.equal(det.open, false, 'Fold-all must collapse <details> step cards');

    // 3) Mermaid zoom modal
    const zoomBtn = conv.querySelector('[data-ag-sag-mermaid-zoom="1"]');
    assert.ok(zoomBtn, 'Mermaid zoom button must attach');
    zoomBtn.click();
    assert.equal(rn.getDebugState().mermaidModalOpen, true);
  } finally {
    rn.destroy();
  }
  assert.equal(doc.querySelector('[data-testid="ag-sag-mermaid-modal"]'), null);
  assert.equal(doc.querySelector('[data-ag-sag-mermaid-zoom="1"]'), null);
  assert.equal(tailPre.getAttribute('data-ag-sag-code-wrap'), null);
});

test('Phase 10: themeStudio bridges CSS vars only to allowed plugin/local iframes and precompactExport denoises verbose outputs', () => {
  const sentPlugin = [];
  const sentExternal = [];
  const pluginFrame = makeEl('iframe');
  pluginFrame.setAttribute('src', 'plugin://agy-nov/panel.html');
  pluginFrame.contentWindow = { postMessage: (msg) => sentPlugin.push(msg) };
  const extFrame = makeEl('iframe');
  extFrame.setAttribute('src', 'https://untrusted.example.com/embed');
  extFrame.contentWindow = { postMessage: (msg) => sentExternal.push(msg) };

  const doc = {
    documentElement: makeEl('html'),
    head: makeEl('head'),
    body: makeEl('body'),
    createElement: makeEl,
    getElementById: () => null,
    querySelector: (s) => doc.documentElement.querySelector(s),
    querySelectorAll: (s) => doc.documentElement.querySelectorAll(s),
  };
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);
  doc.body.appendChild(pluginFrame);
  doc.body.appendChild(extFrame);

  const ts = themeStudioMod.createThemeStudioController({
    win: { document: doc },
    doc,
    enabled: true,
    preset: 'midnight-ink',
  });
  try {
    assert.equal(sentPlugin.length, 1);
    assert.equal(sentPlugin[0].type, 'ag-sag:theme-sync');
    assert.equal(sentPlugin[0].preset, 'midnight-ink');
    assert.equal(sentExternal.length, 0, 'Must never broadcast theme vars to untrusted external https iframes');
  } finally {
    ts.destroy();
  }
  assert.equal(sentPlugin.length, 2, 'destroy() must notify synced extension iframe with disabled theme state');
  assert.equal(sentPlugin[1].colorsState, 'disabled');
  assert.equal(sentPlugin[1].enabled, false);

  // Denoised Markdown export condenses >18-line code fences while preserving conclusions
  const longCode = '```js\n' + 'console.log(1);\n'.repeat(30) + '```\nFinal conclusion: keep zero deps.';
  const mdRes = exporterMod.buildRecapMarkdown({
    turns: [{ turnNum: 1, user: 'Audit code', assistant: longCode }],
    denoise: true,
  });
  assert.equal(mdRes.ok, true);
  assert.ok(mdRes.markdown.includes('Denoised Summary'));
  assert.ok(mdRes.markdown.includes('[code/tool output condensed: 30 lines]'));
  assert.ok(mdRes.markdown.includes('Final conclusion: keep zero deps.'));

  // Linear-time ReDoS safety check on pathological unclosed braces & newline+stack inputs
  const adv1 = '\n{'.repeat(10000) + 'a'.repeat(2000);
  const adv2 = '\n'.repeat(20000) + ' at x\n';
  const t0 = performance.now();
  exporterMod.denoiseBlockText(adv1);
  exporterMod.denoiseBlockText(adv2);
  const dt = performance.now() - t0;
  assert.ok(dt < 50, `denoiseBlockText must run in linear time (<50ms), took ${dt.toFixed(2)}ms`);
});
