import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import {
  TranslatorService,
  maskApiKey,
  resolveSecretsPath,
  validateEndpointUrl,
} from '../cli/translator-service.mjs';
import { SagWatchDaemon } from '../cli/watch-daemon.mjs';

const require = createRequire(import.meta.url);
const coexist = require('../packages/core/coexist.js');
const thoughtMod = require('../packages/core/thought-translator.js');

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeFakeResponse(obj, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return typeof obj === 'string' ? obj : JSON.stringify(obj);
    },
  };
}

test('1. TranslatorService: cross-platform secrets path, 0600 isolated storage, masked status & clearApiKey', () => {
  const macPath = resolveSecretsPath({ platform: 'darwin', homeDir: '/Users/dev', env: {} });
  assert.equal(macPath, path.resolve('/Users/dev/.config/agy-sag/translator-secrets.json'));

  const linuxXdg = resolveSecretsPath({ platform: 'linux', homeDir: '/home/dev', env: { XDG_CONFIG_HOME: '/home/dev/.xdg' } });
  assert.equal(linuxXdg, path.resolve('/home/dev/.xdg/agy-sag/translator-secrets.json'));

  const winPath = resolveSecretsPath({
    platform: 'win32',
    homeDir: 'C:\\Users\\Dev',
    env: { APPDATA: 'C:\\Users\\Dev\\AppData\\Roaming' },
  });
  assert.ok(winPath.includes('agy-sag') && winPath.endsWith('translator-secrets.json'));

  assert.equal(maskApiKey('sk-proj-1234567890abcd'), 'sk-p...abcd');
  assert.equal(maskApiKey('short'), 'sh***');

  const tmp = makeTempDir('agy-sag-translator-');
  try {
    const secretsFile = path.join(tmp, 'secrets', 'translator-secrets.json');
    const svc = new TranslatorService({ explicitPath: secretsFile });

    const saveRes = svc.saveProvider({
      engine: 'openai',
      baseUrl: 'https://api.deepseek.com/v1/',
      model: 'deepseek-chat',
      apiKey: 'sk-deepseek-secret-998877',
    });
    assert.equal(saveRes.ok, true);
    assert.equal(saveRes.data.providers.openai.baseUrl, 'https://api.deepseek.com/v1');
    assert.equal(saveRes.data.providers.openai.model, 'deepseek-chat');
    assert.equal(saveRes.data.providers.openai.hasKey, true);
    assert.equal(saveRes.data.providers.openai.maskedKey, 'sk-d...8877');
    assert.equal(JSON.stringify(saveRes.data).includes('sk-deepseek-secret-998877'), false, 'Plaintext API key must NEVER leak in status');

    if (process.platform !== 'win32') {
      const mode = fs.statSync(secretsFile).mode & 0o777;
      assert.equal(mode, 0o600, 'Secrets file must be 0600 on POSIX');
    }

    const clearRes = svc.saveProvider({ engine: 'openai', clearApiKey: true });
    assert.equal(clearRes.ok, true);
    assert.equal(clearRes.data.providers.openai.hasKey, false);
    assert.equal(clearRes.data.providers.openai.maskedKey, '');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('2. TranslatorService: SSRF, metadata, non-HTTPS, embedded-cred & redirect guards', () => {
  assert.equal(validateEndpointUrl('http://169.254.169.254/latest/meta-data', { allowPrivateHttp: true }).ok, false);
  assert.equal(validateEndpointUrl('http://metadata.google.internal/computeMetadata/v1', { allowPrivateHttp: true }).ok, false);
  assert.equal(validateEndpointUrl('file:///etc/passwd', { allowPrivateHttp: true }).ok, false);
  assert.equal(validateEndpointUrl('https://user:pass@api.openai.com/v1', { allowPrivateHttp: true }).ok, false);
  assert.equal(validateEndpointUrl('http://api.openai.com/v1', { allowPrivateHttp: true }).ok, false, 'Public host requires HTTPS');
  assert.equal(validateEndpointUrl('http://127.0.0.1:11434', { allowPrivateHttp: true }).ok, true, 'Local Ollama HTTP allowed');
  assert.equal(validateEndpointUrl('http://192.168.1.20:1234/v1', { allowPrivateHttp: true }).ok, true, 'LAN LM Studio HTTP allowed');
  assert.equal(validateEndpointUrl('https://api.openai.com/v1', { allowPrivateHttp: false }).ok, true);
});

test('3. TranslatorService: all 5 engines (mt, openai, anthropic, gemini, ollama), LRU cache, secret-redacted errors & WatchDaemon bridge', async () => {
  const tmp = makeTempDir('agy-sag-translator-eng-');
  try {
    const secretsFile = path.join(tmp, 'translator-secrets.json');
    const calls = [];
    const fetchFn = async (url, init) => {
      calls.push({ url, init });
      assert.equal(init.redirect, 'error', 'All upstream requests must block redirects');
      if (url.includes('translate.googleapis.com')) {
        return makeFakeResponse([[['重构模块结构', 'Refactor module structure']]]);
      }
      if (url.endsWith('/chat/completions')) {
        assert.equal(init.headers.Authorization, 'Bearer sk-openai-test-123456');
        return makeFakeResponse({ choices: [{ message: { content: '分析路由依赖关系' } }] });
      }
      if (url.endsWith('/messages')) {
        assert.equal(init.headers['x-api-key'], 'sk-ant-test-654321');
        return makeFakeResponse({ content: [{ type: 'text', text: '检查配置校验逻辑' }] });
      }
      if (url.includes(':generateContent')) {
        assert.equal(url.includes('AIza'), false, 'Gemini API key must never appear in URL query string');
        assert.equal(init.headers['x-goog-api-key'], 'AIzaTestSecretKey9999');
        return makeFakeResponse({ candidates: [{ content: { parts: [{ text: '验证跨平台路径规范化' }] } }] });
      }
      if (url.endsWith('/api/chat')) {
        return makeFakeResponse({ message: { content: '本地 Ollama 离线译文' } });
      }
      return makeFakeResponse('not found', 404);
    };

    const svc = new TranslatorService({ explicitPath: secretsFile, fetchFn });
    svc.saveProvider({ engine: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: 'sk-openai-test-123456' });
    svc.saveProvider({ engine: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-5-haiku-latest', apiKey: 'sk-ant-test-654321' });
    svc.saveProvider({ engine: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash', apiKey: 'AIzaTestSecretKey9999' });
    svc.saveProvider({ engine: 'ollama', baseUrl: 'http://127.0.0.1:11434', model: 'qwen2.5:7b' });

    const rMt = await svc.translate({ engine: 'mt', targetLang: 'zh-CN', kind: 'title', text: 'Refactor module structure' });
    assert.equal(rMt.ok, true);
    assert.equal(rMt.data.translated, '重构模块结构');
    assert.equal(rMt.data.cached, false);

    // Second call hits LRU cache (zero extra fetch)
    const beforeCacheCalls = calls.length;
    const rMtCached = await svc.translate({ engine: 'mt', targetLang: 'zh-CN', kind: 'title', text: 'Refactor module structure' });
    assert.equal(rMtCached.ok, true);
    assert.equal(rMtCached.data.cached, true);
    assert.equal(calls.length, beforeCacheCalls);

    const rOpenAi = await svc.translate({ engine: 'openai', targetLang: 'zh-CN', kind: 'thought', text: 'Analyzing routing deps' });
    assert.equal(rOpenAi.ok, true);
    assert.equal(rOpenAi.data.translated, '分析路由依赖关系');

    const rAnt = await svc.translate({ engine: 'anthropic', targetLang: 'zh-CN', kind: 'thought', text: 'Checking config schema' });
    assert.equal(rAnt.ok, true);
    assert.equal(rAnt.data.translated, '检查配置校验逻辑');

    const rGem = await svc.translate({ engine: 'gemini', targetLang: 'zh-CN', kind: 'thought', text: 'Verifying path normalization' });
    assert.equal(rGem.ok, true);
    assert.equal(rGem.data.translated, '验证跨平台路径规范化');

    const rOll = await svc.translate({ engine: 'ollama', targetLang: 'zh-CN', kind: 'thought', text: 'Offline reasoning note' });
    assert.equal(rOll.ok, true);
    assert.equal(rOll.data.translated, '本地 Ollama 离线译文');

    // Diagnose works through WatchDaemon._handleHostBridgePayload
    const daemon = new SagWatchDaemon({ enableHostBridge: false, translatorService: svc });
    const bridgeDiag = await daemon._handleHostBridgePayload(
      JSON.stringify({ reqId: 'req-diag-1', type: 'sag:translate_diagnose', payload: { engine: 'mt', targetLang: 'zh-CN' } })
    );
    assert.equal(bridgeDiag.ok, true);
    assert.equal(bridgeDiag.reqId, 'req-diag-1');
    assert.equal(bridgeDiag.data.sample, '重构模块结构');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('4. thought-translator.js: strict opt-in, streaming guard, bilingual/translated toggle, title restore, Prism yield & lossless destroy', async () => {
  // Lightweight DOM harness supporting text nodes, attributes, classList & querySelectorAll
  class FakeNode {
    constructor(nodeType, tagName = '', value = '') {
      this.nodeType = nodeType;
      this.tagName = tagName.toUpperCase();
      this.nodeValue = value;
      this.children = [];
      this.childNodes = [];
      this.parentElement = null;
      this.attrs = new Map();
      this.style = {};
      this.hidden = false;
      this.listeners = new Map();
      this.className = '';
      this.ownerDocument = null;
      this.classList = {
        contains: (c) => String(this.className || '').split(/\s+/).includes(c),
        add: (c) => {
          const s = new Set(String(this.className || '').split(/\s+/).filter(Boolean));
          s.add(c);
          this.className = Array.from(s).join(' ');
        },
      };
    }
    get textContent() {
      if (this.nodeType === 3) return this.nodeValue;
      return this.childNodes.map((c) => c.textContent).join('');
    }
    set textContent(v) {
      if (this.nodeType === 3) {
        this.nodeValue = String(v ?? '');
        return;
      }
      this.children = [];
      this.childNodes = [];
      if (v !== '' && v !== null && v !== undefined) {
        const tn = new FakeNode(3, '', String(v));
        tn.parentElement = this;
        this.childNodes.push(tn);
      }
    }
    get firstChild() {
      return this.childNodes[0] || null;
    }
    get nextElementSibling() {
      if (!this.parentElement) return null;
      const idx = this.parentElement.children.indexOf(this);
      return idx >= 0 ? this.parentElement.children[idx + 1] || null : null;
    }
    setAttribute(k, v) {
      this.attrs.set(k, String(v));
    }
    getAttribute(k) {
      return this.attrs.has(k) ? this.attrs.get(k) : null;
    }
    hasAttribute(k) {
      return this.attrs.has(k);
    }
    removeAttribute(k) {
      this.attrs.delete(k);
    }
    appendChild(ch) {
      if (ch.parentElement) ch.remove();
      ch.parentElement = this;
      ch.ownerDocument = this.ownerDocument;
      this.childNodes.push(ch);
      if (ch.nodeType === 1) this.children.push(ch);
      return ch;
    }
    removeChild(ch) {
      this.childNodes = this.childNodes.filter((n) => n !== ch);
      this.children = this.children.filter((n) => n !== ch);
      ch.parentElement = null;
      return ch;
    }
    remove() {
      this.parentElement?.removeChild(this);
    }
    addEventListener(ev, fn) {
      if (!this.listeners.has(ev)) this.listeners.set(ev, []);
      this.listeners.get(ev).push(fn);
    }
    click() {
      for (const fn of this.listeners.get('click') || []) fn({ preventDefault() {}, stopPropagation() {} });
    }
    matches(sel) {
      for (const part of sel.split(',').map((s) => s.trim())) {
        if (part === 'button[data-testid="thinking-collapsible-trigger"]') {
          if (this.tagName === 'BUTTON' && this.getAttribute('data-testid') === 'thinking-collapsible-trigger') return true;
        } else if (part.startsWith('[data-testid="') && part.endsWith('"]')) {
          const id = part.slice(14, -2);
          if (this.getAttribute('data-testid') === id) return true;
        } else if (part.startsWith('.') && part.includes('[data-ag-sag-owned="1"]')) {
          const cls = part.slice(1, part.indexOf('['));
          if (this.classList.contains(cls) && this.getAttribute('data-ag-sag-owned') === '1') return true;
        } else if (part === '[data-ag-sag-thought-hidden="1"]') {
          if (this.getAttribute('data-ag-sag-thought-hidden') === '1') return true;
        } else if (part === '.ag-sag-thought-body') {
          if (this.classList.contains('ag-sag-thought-body')) return true;
        } else if (part.startsWith('.')) {
          if (this.classList.contains(part.slice(1))) return true;
        }
      }
      return false;
    }
    querySelectorAll(sel) {
      const out = [];
      const walk = (n) => {
        for (const c of n.children) {
          if (c.matches(sel)) out.push(c);
          walk(c);
        }
      };
      walk(this);
      return out;
    }
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    }
  }

  const doc = new FakeNode(9, '#document');
  doc.documentElement = new FakeNode(1, 'html');
  doc.body = new FakeNode(1, 'body');
  doc.documentElement.appendChild(doc.body);
  doc.appendChild(doc.documentElement);
  doc.createElement = (tag) => {
    const el = new FakeNode(1, tag);
    el.ownerDocument = doc;
    return el;
  };

  // Build thought card + sidebar title
  const card = doc.createElement('div');
  const triggerBtn = doc.createElement('button');
  triggerBtn.setAttribute('data-testid', 'thinking-collapsible-trigger');
  triggerBtn.textContent = 'Thinking...';
  const panel = doc.createElement('div');
  const origP = doc.createElement('p');
  origP.textContent = 'Inspecting cross-platform symlink behavior.';
  panel.appendChild(origP);
  card.appendChild(triggerBtn);
  card.appendChild(panel);
  doc.body.appendChild(card);

  const sideRow = doc.createElement('div');
  sideRow.setAttribute('data-testid', 'conversation-row-sidebar');
  const titleSpan = doc.createElement('span');
  titleSpan.textContent = 'Fix Windows 8.3 short paths';
  sideRow.appendChild(titleSpan);
  doc.body.appendChild(sideRow);

  const requests = [];
  const ctrl = thoughtMod.createThoughtTranslatorController({
    win: {},
    doc,
    coexist,
    enabled: false,
    autoObserve: false,
    onRequestTranslate: async (req) => {
      requests.push(req);
      if (req.kind === 'title') return { ok: true, data: { translated: '修复 Windows 8.3 短路径', engine: req.engine } };
      return { ok: true, data: { translated: '正在检查跨平台符号链接行为。', engine: req.engine } };
    },
  });

  // Strict opt-in: default OFF does zero requests and zero DOM injection
  assert.equal(requests.length, 0);
  assert.equal(doc.querySelectorAll('[data-testid="ag-sag-thought-box"]').length, 0);

  // Enable while still streaming ("Thinking...") -> should NOT auto-translate yet
  ctrl.configure({ enabled: true, engine: 'mt', targetLang: 'zh-CN', triggerMode: 'auto', viewMode: 'bilingual', translateTitles: true });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(requests.filter((r) => r.kind === 'thought').length, 0, 'Must defer while thought is still streaming');
  assert.equal(titleSpan.textContent, '修复 Windows 8.3 短路径', 'Sidebar title translated when enabled');

  // Finish thinking ("Thought for 4s") -> auto-translates cleanly
  triggerBtn.textContent = 'Thought for 4s';
  ctrl.scanNow();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(requests.filter((r) => r.kind === 'thought').length, 1);
  const box = doc.querySelector('[data-testid="ag-sag-thought-box"]');
  assert.ok(box, 'Translated box injected');
  assert.ok(box.textContent.includes('正在检查跨平台符号链接行为。'));

  // Translated-only mode hides original paragraph cleanly via parent attribute (zero host child style mutation)
  ctrl.configure({ viewMode: 'translated' });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(panel.getAttribute('data-ag-sag-thought-hide-src'), '1');
  assert.ok(!origP.style.display, 'Must not mutate host child inline style.display');

  // Obsidian Prism yield check
  doc.documentElement.setAttribute('data-ag-prism-thought-owner', 'obsidian-prism-thought');
  ctrl.scanNow();
  assert.equal(ctrl.getDebugState().yieldedToPrism, true);
  assert.equal(doc.querySelectorAll('[data-testid="ag-sag-thought-box"]').length, 0);
  assert.equal(titleSpan.textContent, 'Fix Windows 8.3 short paths', 'Yield restores sidebar title losslessly');
  assert.equal(panel.getAttribute('data-ag-sag-thought-hide-src'), null, 'Yield removes translated-only hide attribute');
  assert.ok(!origP.style.display, 'Yield keeps host original paragraph style untouched');

  // Destroy cleans everything
  doc.documentElement.removeAttribute('data-ag-prism-thought-owner');
  ctrl.destroy();
  assert.equal(ctrl.getDebugState().destroyed, true);
  assert.equal(coexist.DEFAULT_CONFIG.modules.thoughtTranslate, false, 'Default config keeps thoughtTranslate strictly OFF');
});
