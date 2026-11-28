// agy-Sag — Multi-Engine Thought & Title Translator Service (Node >= 22, zero runtime deps)
//
// Security & Privacy Guarantees:
// 1. Strict opt-in: invoked ONLY when user explicitly enables thoughtTranslate & calls via main-frame CDP binding.
// 2. Secret isolation: API keys live strictly in a dedicated 0600 file outside ~/.gemini/antigravity/
//    (macOS/Linux: ~/.config/agy-sag/translator-secrets.json, Windows: %APPDATA%\agy-sag\translator-secrets.json).
//    Keys are NEVER returned in plaintext to the renderer, NEVER included in config export or storage-doctor backups.
// 3. SSRF & Redirect protection: blocks cloud metadata hosts, blocks non-http(s) schemes, enforces https for public
//    hosts (http allowed only for localhost / RFC1918 LAN endpoints like Ollama/LM Studio), and sets redirect:'error'
//    so Authorization/API-Key headers can never leak across redirects.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertNoSymlinkAncestors,
  atomicRenameWithRetry,
  canonicalRealpathSync,
  expandTildePath,
  isPathWithinBase,
  safeChmodSync,
} from './platform-utils.mjs';

export const TRANSLATOR_ENGINES = Object.freeze(['mt', 'openai', 'anthropic', 'gemini', 'ollama']);
export const MAX_TRANSLATE_TEXT_CHARS = 12000;
export const MAX_CACHE_ENTRIES = 400;
export const MAX_CONCURRENT_REQUESTS = 3;
export const MAX_WAIT_QUEUE_SIZE = 32;
export const MAX_RESPONSE_BYTES = 1024 * 1024;
export const DEFAULT_TIMEOUT_MS = 25000;
let secretsWriteCounter = 0;

export const DEFAULT_PROVIDERS = Object.freeze({
  mt: Object.freeze({ endpoint: '' }),
  openai: Object.freeze({ baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: '' }),
  anthropic: Object.freeze({ baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-5-haiku-latest', apiKey: '' }),
  gemini: Object.freeze({ baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash', apiKey: '' }),
  ollama: Object.freeze({ baseUrl: 'http://127.0.0.1:11434', model: 'qwen2.5:7b', apiKey: '' }),
});

const LANG_NAME_MAP = Object.freeze({
  'zh-CN': 'Simplified Chinese',
  'zh-TW': 'Traditional Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ru: 'Russian',
  'pt-BR': 'Brazilian Portuguese',
  en: 'English',
});

const MT_LANG_CODE_MAP = Object.freeze({
  'zh-CN': 'zh-CN',
  'zh-TW': 'zh-TW',
  ja: 'ja',
  ko: 'ko',
  es: 'es',
  fr: 'fr',
  de: 'de',
  ru: 'ru',
  'pt-BR': 'pt',
  en: 'en',
});

const BLOCKED_METADATA_HOSTS = new Set([
  '169.254.169.254',
  '169.254.170.2',
  '100.100.100.200',
  'metadata.google.internal',
  'metadata',
  'fd00:ec2::254',
  '0.0.0.0',
  '::',
]);

function getEnvCI(env, key) {
  if (!env || typeof env !== 'object') return '';
  if (typeof env[key] === 'string' && env[key].trim()) return env[key].trim();
  const target = key.toLowerCase();
  for (const k of Object.keys(env)) {
    if (k.toLowerCase() === target && typeof env[k] === 'string' && env[k].trim()) {
      return env[k].trim();
    }
  }
  return '';
}

export function resolveSecretsPath({
  platform = process.platform,
  homeDir = os.homedir(),
  env = process.env,
  explicitPath = null,
} = {}) {
  if (explicitPath) {
    return path.resolve(expandTildePath(String(explicitPath), homeDir));
  }
  if (platform === 'win32') {
    const rawHome = String(homeDir || os.homedir());
    const winHome = /^[A-Za-z]:[\\/]/.test(rawHome) || rawHome.includes('\\') ? rawHome : path.win32.resolve(rawHome);
    const appData = getEnvCI(env, 'APPDATA') || path.win32.join(winHome, 'AppData', 'Roaming');
    return path.win32.join(appData, 'agy-sag', 'translator-secrets.json');
  }
  const resolvedHome = path.resolve(String(homeDir || os.homedir()));
  const xdgConfig = getEnvCI(env, 'XDG_CONFIG_HOME')
    ? expandTildePath(getEnvCI(env, 'XDG_CONFIG_HOME'), resolvedHome)
    : path.join(resolvedHome, '.config');
  return path.join(path.resolve(xdgConfig), 'agy-sag', 'translator-secrets.json');
}

export function maskApiKey(rawKey) {
  const s = String(rawKey || '').trim();
  if (!s) return '';
  if (s.length <= 8) return `${s.slice(0, 2)}***`;
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

function isLoopbackOrPrivateHost(hostname) {
  const h = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return false;
  if (h === 'localhost' || h === '::1' || h === '127.0.0.1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) {
    return true;
  }
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  const m172 = h.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (m172) {
    const oct = Number(m172[1]);
    if (oct >= 16 && oct <= 31) return true;
  }
  return false;
}

export function validateEndpointUrl(rawUrl, { allowPrivateHttp = false } = {}) {
  const str = String(rawUrl || '').trim();
  if (!str || str.length > 512) {
    return { ok: false, error: 'Invalid or empty endpoint URL' };
  }
  let parsed;
  try {
    parsed = new URL(str);
  } catch {
    return { ok: false, error: 'Malformed endpoint URL' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, error: `Unsupported URL protocol: ${parsed.protocol}` };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: 'Embedded URL credentials are not allowed' };
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !host ||
    BLOCKED_METADATA_HOSTS.has(host) ||
    host.startsWith('169.254.') ||
    host.startsWith('fe80:') ||
    host.startsWith('::ffff:169.254.') ||
    host.startsWith('::ffff:a9fe:') ||
    host === '::ffff:100.100.100.200' ||
    host === '::ffff:6464:64c8' ||
    host === '::ffff:0.0.0.0' ||
    host === '::ffff:0:0'
  ) {
    return { ok: false, error: `Blocked unsafe host: ${host}` };
  }
  const isLocal = isLoopbackOrPrivateHost(host);
  if (parsed.protocol === 'http:' && !(allowPrivateHttp && isLocal)) {
    return { ok: false, error: 'HTTPS is required for non-local endpoints' };
  }
  return { ok: true, url: parsed.toString().replace(/\/+$/, ''), parsed, isLocal };
}

function normalizeProviderStore(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const prov = src.providers && typeof src.providers === 'object' ? src.providers : {};
  const cleanStr = (v, maxLen = 512) => (typeof v === 'string' ? v.trim().slice(0, maxLen) : '');
  return {
    version: 1,
    providers: {
      mt: {
        endpoint: cleanStr(prov.mt?.endpoint, 512),
      },
      openai: {
        baseUrl: cleanStr(prov.openai?.baseUrl, 512) || DEFAULT_PROVIDERS.openai.baseUrl,
        model: cleanStr(prov.openai?.model, 160) || DEFAULT_PROVIDERS.openai.model,
        apiKey: cleanStr(prov.openai?.apiKey, 512),
      },
      anthropic: {
        baseUrl: cleanStr(prov.anthropic?.baseUrl, 512) || DEFAULT_PROVIDERS.anthropic.baseUrl,
        model: cleanStr(prov.anthropic?.model, 160) || DEFAULT_PROVIDERS.anthropic.model,
        apiKey: cleanStr(prov.anthropic?.apiKey, 512),
      },
      gemini: {
        baseUrl: cleanStr(prov.gemini?.baseUrl, 512) || DEFAULT_PROVIDERS.gemini.baseUrl,
        model: cleanStr(prov.gemini?.model, 160) || DEFAULT_PROVIDERS.gemini.model,
        apiKey: cleanStr(prov.gemini?.apiKey, 512),
      },
      ollama: {
        baseUrl: cleanStr(prov.ollama?.baseUrl, 512) || DEFAULT_PROVIDERS.ollama.baseUrl,
        model: cleanStr(prov.ollama?.model, 160) || DEFAULT_PROVIDERS.ollama.model,
        apiKey: cleanStr(prov.ollama?.apiKey, 512),
      },
    },
  };
}

export function readProviderSecrets(opts = {}) {
  const filePath = resolveSecretsPath(opts);
  const platform = opts.platform || process.platform;
  try {
    assertNoSymlinkAncestors(filePath, { platform });
    const st = fs.lstatSync(filePath);
    if (st.isSymbolicLink() || !st.isFile() || st.size > 128 * 1024) {
      return normalizeProviderStore(null);
    }
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return normalizeProviderStore(raw);
  } catch {
    return normalizeProviderStore(null);
  }
}

export function writeProviderSecrets(nextStore, opts = {}) {
  const filePath = resolveSecretsPath(opts);
  const platform = opts.platform || process.platform;
  const normalized = normalizeProviderStore(nextStore);
  const dir = path.dirname(filePath);

  assertNoSymlinkAncestors(filePath, { platform });
  fs.mkdirSync(dir, { recursive: true });
  safeChmodSync(dir, 0o700, { platform });
  assertNoSymlinkAncestors(filePath, { platform });

  const realDir = canonicalRealpathSync(dir);
  secretsWriteCounter += 1;
  const randomSuffix = crypto.randomBytes(6).toString('hex');
  const tmpPath = path.join(
    dir,
    `.translator-secrets.${process.pid}.${Date.now()}.${secretsWriteCounter}.${randomSuffix}.tmp`
  );
  if (!isPathWithinBase(tmpPath, dir, platform)) {
    throw new Error('Security violation: temp secrets path escapes config directory');
  }
  const existing = (() => {
    try { return fs.lstatSync(filePath); } catch { return null; }
  })();
  if (existing && (existing.isSymbolicLink() || !existing.isFile())) {
    throw new Error('Security violation: refusing symlink or non-file secrets target');
  }

  const payload = JSON.stringify(normalized, null, 2) + '\n';
  fs.writeFileSync(tmpPath, payload, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  try {
    safeChmodSync(tmpPath, 0o600, { platform });
    const realTmpParent = canonicalRealpathSync(path.dirname(tmpPath));
    if (!isPathWithinBase(realTmpParent, realDir, platform)) {
      throw new Error('Security violation: secrets parent escaped directory');
    }
    atomicRenameWithRetry(tmpPath, filePath, { platform });
    safeChmodSync(filePath, 0o600, { platform });
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch {}
    throw err;
  }
  return { ok: true, filePath, store: normalized };
}

export function getSafeProviderStatus(opts = {}) {
  const store = readProviderSecrets(opts);
  const out = {};
  for (const eng of TRANSLATOR_ENGINES) {
    const p = store.providers[eng] || {};
    if (eng === 'mt') {
      out.mt = {
        endpoint: p.endpoint || '',
        configured: true,
        needsKey: false,
      };
    } else if (eng === 'ollama') {
      out.ollama = {
        baseUrl: p.baseUrl || DEFAULT_PROVIDERS.ollama.baseUrl,
        model: p.model || DEFAULT_PROVIDERS.ollama.model,
        hasKey: Boolean(p.apiKey),
        maskedKey: maskApiKey(p.apiKey),
        configured: Boolean(p.baseUrl && p.model),
        needsKey: false,
      };
    } else {
      const def = DEFAULT_PROVIDERS[eng];
      const baseUrl = p.baseUrl || def.baseUrl;
      const model = p.model || def.model;
      const isLocalOpenAi = eng === 'openai' && validateEndpointUrl(baseUrl, { allowPrivateHttp: true }).isLocal;
      out[eng] = {
        baseUrl,
        model,
        hasKey: Boolean(p.apiKey),
        maskedKey: maskApiKey(p.apiKey),
        configured: Boolean(baseUrl && model && (p.apiKey || isLocalOpenAi)),
        needsKey: !isLocalOpenAi,
      };
    }
  }
  const env = opts.env || process.env;
  const proxyEnvDetected = Boolean(
    getEnvCI(env, 'HTTPS_PROXY') || getEnvCI(env, 'HTTP_PROXY') || getEnvCI(env, 'ALL_PROXY')
  );
  return {
    secretsPathDisplay: resolveSecretsPath(opts),
    proxyEnvDetected,
    providers: out,
  };
}

export function updateProviderConfig(payload, opts = {}) {
  const engine = String(payload?.engine || '').trim().toLowerCase();
  if (!TRANSLATOR_ENGINES.includes(engine)) {
    return { ok: false, error: `Unsupported translator engine: ${engine}` };
  }
  const store = readProviderSecrets(opts);
  const cur = { ...(store.providers[engine] || {}) };

  if (engine === 'mt') {
    const ep = typeof payload?.endpoint === 'string' ? payload.endpoint.trim() : cur.endpoint || '';
    if (ep) {
      const v = validateEndpointUrl(ep, { allowPrivateHttp: true });
      if (!v.ok) return { ok: false, error: v.error };
      cur.endpoint = v.url;
    } else {
      cur.endpoint = '';
    }
  } else {
    if (typeof payload?.baseUrl === 'string' && payload.baseUrl.trim()) {
      const allowPrivate = engine === 'ollama' || engine === 'openai';
      const v = validateEndpointUrl(payload.baseUrl.trim(), { allowPrivateHttp: allowPrivate });
      if (!v.ok) return { ok: false, error: v.error };
      cur.baseUrl = v.url;
    }
    if (typeof payload?.model === 'string' && payload.model.trim()) {
      cur.model = payload.model.trim().slice(0, 160);
    }
    if (payload?.clearApiKey === true) {
      cur.apiKey = '';
    } else if (typeof payload?.apiKey === 'string' && payload.apiKey.trim()) {
      cur.apiKey = payload.apiKey.trim().slice(0, 512);
    }
  }

  store.providers[engine] = cur;
  writeProviderSecrets(store, opts);
  return { ok: true, data: getSafeProviderStatus(opts) };
}

function buildSystemPrompt(targetLang, kind) {
  const langName = LANG_NAME_MAP[targetLang] || 'Simplified Chinese';
  if (kind === 'title') {
    return `Translate the short conversation title into concise, natural ${langName}. Preserve technical terms, file names, and identifiers verbatim. Output ONLY the translated title with no quotes or explanation.`;
  }
  return `Translate the AI agent's reasoning/thought notes into clear, natural ${langName}. Preserve inline code, file paths, symbol names, CLI commands, and technical terms verbatim. Maintain paragraph breaks. Output ONLY the translated text.`;
}

function splitTextForMt(text, maxChunk = 1800) {
  const chunks = [];
  const paragraphs = String(text || '').split(/\n{2,}/);
  let buf = '';
  for (const p of paragraphs) {
    if (p.length > maxChunk) {
      if (buf) {
        chunks.push(buf);
        buf = '';
      }
      for (let i = 0; i < p.length; i += maxChunk) {
        chunks.push(p.slice(i, i + maxChunk));
      }
    } else if (!buf) {
      buf = p;
    } else if (buf.length + 2 + p.length <= maxChunk) {
      buf += '\n\n' + p;
    } else {
      chunks.push(buf);
      buf = p;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

async function readResponseTextBounded(res, maxBytes = MAX_RESPONSE_BYTES) {
  const contentLengthRaw = typeof res?.headers?.get === 'function' ? res.headers.get('content-length') : null;
  if (contentLengthRaw !== null && contentLengthRaw !== undefined && String(contentLengthRaw).trim() !== '') {
    const contentLength = Number(contentLengthRaw);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      try { await res.body?.cancel?.(); } catch {}
      throw new Error(`Upstream response exceeds ${maxBytes} byte limit`);
    }
  }
  if (res?.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        const buf = Buffer.isBuffer(value)
          ? value
          : Buffer.from(value.buffer, value.byteOffset, value.byteLength);
        totalBytes += buf.length;
        if (totalBytes > maxBytes) {
          try { await reader.cancel(); } catch {}
          throw new Error(`Upstream response exceeds ${maxBytes} byte limit`);
        }
        chunks.push(buf);
      }
    } finally {
      try { reader.releaseLock(); } catch {}
    }
    return Buffer.concat(chunks, totalBytes).toString('utf8');
  }
  const text = await res.text();
  if (Buffer.byteLength(String(text || ''), 'utf8') > maxBytes) {
    throw new Error(`Upstream response exceeds ${maxBytes} byte limit`);
  }
  return text;
}

async function fetchJsonSafe(fetchFn, url, init, timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = MAX_RESPONSE_BYTES) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Request timed out')), timeoutMs);
  timer?.unref?.();
  try {
    const res = await fetchFn(url, {
      ...init,
      redirect: 'error',
      signal: controller.signal,
    });
    const text = await readResponseTextBounded(res, maxBytes);
    if (!res.ok) {
      const preview = text.replace(/\s+/g, ' ').slice(0, 180);
      throw new Error(`HTTP ${res.status}${preview ? `: ${preview}` : ''}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Upstream returned non-JSON response');
    }
  } finally {
    clearTimeout(timer);
  }
}

async function translateViaMt(text, targetLang, providerCfg, fetchFn, timeoutMs) {
  const tl = MT_LANG_CODE_MAP[targetLang] || 'zh-CN';
  const customEndpoint = String(providerCfg?.endpoint || '').trim();
  if (customEndpoint) {
    const v = validateEndpointUrl(customEndpoint, { allowPrivateHttp: true });
    if (!v.ok) throw new Error(v.error);
    const data = await fetchJsonSafe(
      fetchFn,
      v.url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: text, text, source: 'auto', target: tl }),
      },
      timeoutMs
    );
    const out = data?.translatedText || data?.translation || data?.text || data?.data?.translatedText;
    if (typeof out !== 'string' || !out.trim()) throw new Error('Custom MT endpoint returned empty translation');
    return out.trim();
  }

  const chunks = splitTextForMt(text, 1800);
  const translatedChunks = [];
  for (const chunk of chunks) {
    const qs = new URLSearchParams({
      client: 'gtx',
      sl: 'auto',
      tl,
      dt: 't',
      q: chunk,
    });
    const url = `https://translate.googleapis.com/translate_a/single?${qs.toString()}`;
    const data = await fetchJsonSafe(
      fetchFn,
      url,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
      timeoutMs
    );
    const segs = Array.isArray(data?.[0]) ? data[0] : [];
    const merged = segs.map((item) => (Array.isArray(item) && typeof item[0] === 'string' ? item[0] : '')).join('');
    if (!merged) throw new Error('Machine translation returned empty payload');
    translatedChunks.push(merged);
  }
  return translatedChunks.join('\n\n').trim();
}

async function translateViaOpenAi(text, targetLang, kind, providerCfg, fetchFn, timeoutMs) {
  const baseUrl = providerCfg?.baseUrl || DEFAULT_PROVIDERS.openai.baseUrl;
  const model = providerCfg?.model || DEFAULT_PROVIDERS.openai.model;
  const apiKey = providerCfg?.apiKey || '';
  const v = validateEndpointUrl(baseUrl, { allowPrivateHttp: true });
  if (!v.ok) throw new Error(v.error);
  if (!apiKey && !v.isLocal) {
    throw new Error('OpenAI-compatible API key is not configured');
  }
  const endpoint = v.url.endsWith('/chat/completions') ? v.url : `${v.url}/chat/completions`;
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const data = await fetchJsonSafe(
    fetchFn,
    endpoint,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          { role: 'system', content: buildSystemPrompt(targetLang, kind) },
          { role: 'user', content: text },
        ],
      }),
    },
    timeoutMs
  );
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenAI-compatible model returned empty content');
  }
  return content.trim();
}

async function translateViaAnthropic(text, targetLang, kind, providerCfg, fetchFn, timeoutMs) {
  const baseUrl = providerCfg?.baseUrl || DEFAULT_PROVIDERS.anthropic.baseUrl;
  const model = providerCfg?.model || DEFAULT_PROVIDERS.anthropic.model;
  const apiKey = providerCfg?.apiKey || '';
  const v = validateEndpointUrl(baseUrl, { allowPrivateHttp: false });
  if (!v.ok) throw new Error(v.error);
  if (!apiKey) throw new Error('Anthropic API key is not configured');
  const endpoint = v.url.endsWith('/messages') ? v.url : `${v.url}/messages`;
  const data = await fetchJsonSafe(
    fetchFn,
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: kind === 'title' ? 128 : 4096,
        temperature: 0.1,
        system: buildSystemPrompt(targetLang, kind),
        messages: [{ role: 'user', content: text }],
      }),
    },
    timeoutMs
  );
  const blocks = Array.isArray(data?.content) ? data.content : [];
  const merged = blocks.map((b) => (b && typeof b.text === 'string' ? b.text : '')).join('\n').trim();
  if (!merged) throw new Error('Anthropic model returned empty content');
  return merged;
}

async function translateViaGemini(text, targetLang, kind, providerCfg, fetchFn, timeoutMs) {
  const baseUrl = providerCfg?.baseUrl || DEFAULT_PROVIDERS.gemini.baseUrl;
  const model = providerCfg?.model || DEFAULT_PROVIDERS.gemini.model;
  const apiKey = providerCfg?.apiKey || '';
  const v = validateEndpointUrl(baseUrl, { allowPrivateHttp: false });
  if (!v.ok) throw new Error(v.error);
  if (!apiKey) throw new Error('Gemini API key is not configured');
  const safeModel = encodeURIComponent(model.replace(/^models\//, ''));
  const endpoint = `${v.url}/models/${safeModel}:generateContent`;
  const data = await fetchJsonSafe(
    fetchFn,
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildSystemPrompt(targetLang, kind) }] },
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: { temperature: 0.1 },
      }),
    },
    timeoutMs
  );
  const parts = Array.isArray(data?.candidates?.[0]?.content?.parts) ? data.candidates[0].content.parts : [];
  const merged = parts.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('').trim();
  if (!merged) throw new Error('Gemini model returned empty content');
  return merged;
}

async function translateViaOllama(text, targetLang, kind, providerCfg, fetchFn, timeoutMs) {
  const baseUrl = providerCfg?.baseUrl || DEFAULT_PROVIDERS.ollama.baseUrl;
  const model = providerCfg?.model || DEFAULT_PROVIDERS.ollama.model;
  const v = validateEndpointUrl(baseUrl, { allowPrivateHttp: true });
  if (!v.ok) throw new Error(v.error);
  const endpoint = v.url.endsWith('/api/chat') ? v.url : `${v.url}/api/chat`;
  const headers = { 'Content-Type': 'application/json' };
  if (providerCfg?.apiKey) headers.Authorization = `Bearer ${providerCfg.apiKey}`;
  const data = await fetchJsonSafe(
    fetchFn,
    endpoint,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        stream: false,
        options: { temperature: 0.1 },
        messages: [
          { role: 'system', content: buildSystemPrompt(targetLang, kind) },
          { role: 'user', content: text },
        ],
      }),
    },
    timeoutMs
  );
  const content = data?.message?.content || data?.response;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Ollama returned empty response');
  }
  return content.trim();
}

export class TranslatorService {
  constructor(options = {}) {
    this.options = options;
    this.fetchFn = options.fetchFn || globalThis.fetch;
    this.timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS;
    this.cache = new Map();
    this.inFlight = 0;
    this.waitQueue = [];
  }

  _cacheKey(engine, model, targetLang, kind, text) {
    const hash = crypto.createHash('sha256').update(`${engine}|${model}|${targetLang}|${kind}|${text}`).digest('hex');
    return hash;
  }

  _getCached(key) {
    if (!this.cache.has(key)) return null;
    const val = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, val);
    return val;
  }

  _setCached(key, val) {
    if (this.cache.has(key)) this.cache.delete(key);
    this.cache.set(key, val);
    while (this.cache.size > MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  async _withSlot(fn) {
    if (this.inFlight >= MAX_CONCURRENT_REQUESTS) {
      if (this.waitQueue.length >= MAX_WAIT_QUEUE_SIZE) {
        throw new Error('Translator queue busy');
      }
      await new Promise((resolve) => this.waitQueue.push(resolve));
    }
    this.inFlight += 1;
    try {
      return await fn();
    } finally {
      this.inFlight -= 1;
      const next = this.waitQueue.shift();
      if (next) next();
    }
  }

  getStatus() {
    return getSafeProviderStatus(this.options);
  }

  saveProvider(payload) {
    const res = updateProviderConfig(payload, this.options);
    if (res.ok) this.cache.clear();
    return res;
  }

  async translate({ engine = 'mt', targetLang = 'zh-CN', kind = 'thought', text = '', force = false } = {}) {
    const eng = TRANSLATOR_ENGINES.includes(engine) ? engine : 'mt';
    const lang = Object.prototype.hasOwnProperty.call(LANG_NAME_MAP, targetLang) ? targetLang : 'zh-CN';
    const normKind = kind === 'title' ? 'title' : 'thought';
    const cleanText = String(text || '').trim();
    if (!cleanText) return { ok: false, error: 'Empty text' };
    if (cleanText.length > MAX_TRANSLATE_TEXT_CHARS) {
      return { ok: false, error: `Text exceeds ${MAX_TRANSLATE_TEXT_CHARS} char limit` };
    }
    if (typeof this.fetchFn !== 'function') {
      return { ok: false, error: 'Node fetch API unavailable' };
    }

    const store = readProviderSecrets(this.options);
    const pCfg = store.providers[eng] || {};
    const modelTag = pCfg.model || pCfg.endpoint || 'default';
    const key = this._cacheKey(eng, modelTag, lang, normKind, cleanText);

    if (!force) {
      const hit = this._getCached(key);
      if (hit) {
        return { ok: true, data: { translated: hit, engine: eng, model: pCfg.model || '', cached: true } };
      }
    }

    const startedAt = Date.now();
    try {
      const translated = await this._withSlot(async () => {
        if (eng === 'mt') return translateViaMt(cleanText, lang, pCfg, this.fetchFn, this.timeoutMs);
        if (eng === 'openai') return translateViaOpenAi(cleanText, lang, normKind, pCfg, this.fetchFn, this.timeoutMs);
        if (eng === 'anthropic') return translateViaAnthropic(cleanText, lang, normKind, pCfg, this.fetchFn, this.timeoutMs);
        if (eng === 'gemini') return translateViaGemini(cleanText, lang, normKind, pCfg, this.fetchFn, this.timeoutMs);
        if (eng === 'ollama') return translateViaOllama(cleanText, lang, normKind, pCfg, this.fetchFn, this.timeoutMs);
        throw new Error(`Unsupported engine: ${eng}`);
      });
      this._setCached(key, translated);
      return {
        ok: true,
        data: {
          translated,
          engine: eng,
          model: pCfg.model || '',
          cached: false,
          latencyMs: Date.now() - startedAt,
        },
      };
    } catch (err) {
      // Never echo API keys in error messages
      const safeMsg = String(err?.message || 'Translation failed')
        .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
        .replace(/\b(?:sk|AIza|x-api-key)[-_A-Za-z0-9]{6,}/gi, '[REDACTED_KEY]');
      return { ok: false, error: safeMsg };
    }
  }

  async diagnose({ engine = 'mt', targetLang = 'zh-CN' } = {}) {
    const res = await this.translate({
      engine,
      targetLang,
      kind: 'title',
      text: 'Refactor module structure',
      force: true,
    });
    if (!res.ok) {
      return { ok: false, error: res.error, engine };
    }
    return {
      ok: true,
      data: {
        engine: res.data.engine,
        model: res.data.model,
        sample: res.data.translated,
        latencyMs: res.data.latencyMs,
      },
    };
  }

  async handleBridgeRequest(type, payload = {}) {
    if (type === 'sag:translate_status') {
      return { ok: true, data: this.getStatus() };
    }
    if (type === 'sag:translate_save_provider') {
      return this.saveProvider(payload);
    }
    if (type === 'sag:translate_text') {
      return this.translate(payload);
    }
    if (type === 'sag:translate_diagnose') {
      return this.diagnose(payload);
    }
    return { ok: false, error: `Unknown translator bridge action: ${type}` };
  }
}
