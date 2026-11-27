// agy-Sag — Optical Theme & Typography Studio (Zero-:has(), UMD, zero runtime deps)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSagThemeStudio = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  const STYLE_ID = 'ag-sag-theme-css';
  const MAX_CUSTOM_CSS_LEN = 8192;

  const THEME_ATTR_KEYS = [
    'data-ag-sag-theme',
    'data-ag-sag-theme-preset',
    'data-ag-sag-theme-density',
    'data-ag-sag-theme-policy',
    'data-ag-sag-theme-colors',
    'data-ag-sag-theme-cjk',
    'data-ag-sag-theme-sidebar',
    'data-ag-sag-theme-wide',
  ];

  const CJK_SANS_STACK =
    '"PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Microsoft YaHei UI", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const CJK_MONO_STACK =
    '"JetBrains Mono", "SF Mono", "Fira Code", Menlo, Consolas, "PingFang SC", "Noto Sans Mono CJK SC", "Microsoft YaHei UI", monospace';

  const THEME_PRESETS = Object.freeze({
    native: Object.freeze({
      id: 'native',
      label: 'Native',
      colorScheme: null,
      vars: null,
    }),
    'midnight-ink': Object.freeze({
      id: 'midnight-ink',
      label: 'Midnight Ink',
      colorScheme: 'dark',
      vars: Object.freeze({
        '--background': '#0b0f17',
        '--card': '#111827',
        '--popover': '#151e30',
        '--foreground': '#eef2f7',
        '--card-foreground': '#eef2f7',
        '--popover-foreground': '#eef2f7',
        '--muted': '#182235',
        '--muted-foreground': '#94a3b8',
        '--secondary': '#1b263b',
        '--secondary-foreground': '#e2e8f0',
        '--accent': '#1f2d47',
        '--accent-foreground': '#f8fafc',
        '--primary': '#60a5fa',
        '--primary-foreground': '#08101e',
        '--border': 'rgba(148, 163, 184, 0.22)',
        '--input': 'rgba(148, 163, 184, 0.28)',
        '--ring': '#60a5fa',
      }),
    }),
    'nord-frost': Object.freeze({
      id: 'nord-frost',
      label: 'Nord Frost',
      colorScheme: 'dark',
      vars: Object.freeze({
        '--background': '#2e3440',
        '--card': '#3b4252',
        '--popover': '#3f4758',
        '--foreground': '#eceff4',
        '--card-foreground': '#eceff4',
        '--popover-foreground': '#eceff4',
        '--muted': '#434c5e',
        '--muted-foreground': '#aeb9cc',
        '--secondary': '#434c5e',
        '--secondary-foreground': '#e5e9f0',
        '--accent': '#4c566a',
        '--accent-foreground': '#eceff4',
        '--primary': '#88c0d0',
        '--primary-foreground': '#232831',
        '--border': 'rgba(216, 222, 233, 0.17)',
        '--input': 'rgba(216, 222, 233, 0.24)',
        '--ring': '#88c0d0',
      }),
    }),
    'warm-paper': Object.freeze({
      id: 'warm-paper',
      label: 'Warm Paper',
      colorScheme: 'light',
      vars: Object.freeze({
        '--background': '#f7f3ea',
        '--card': '#fbf8f1',
        '--popover': '#fdfbf6',
        '--foreground': '#27231d',
        '--card-foreground': '#27231d',
        '--popover-foreground': '#27231d',
        '--muted': '#ede6d8',
        '--muted-foreground': '#695f51',
        '--secondary': '#efe8da',
        '--secondary-foreground': '#332d25',
        '--accent': '#e7decb',
        '--accent-foreground': '#1f1b16',
        '--primary': '#b45309',
        '--primary-foreground': '#fffdf8',
        '--border': 'rgba(105, 95, 81, 0.20)',
        '--input': 'rgba(105, 95, 81, 0.28)',
        '--ring': '#b45309',
      }),
    }),
    'oled-pure': Object.freeze({
      id: 'oled-pure',
      label: 'OLED Pure',
      colorScheme: 'dark',
      vars: Object.freeze({
        '--background': '#000000',
        '--card': '#0a0a0c',
        '--popover': '#101014',
        '--foreground': '#f5f5f7',
        '--card-foreground': '#f5f5f7',
        '--popover-foreground': '#f5f5f7',
        '--muted': '#141418',
        '--muted-foreground': '#9ca3af',
        '--secondary': '#16161b',
        '--secondary-foreground': '#e5e7eb',
        '--accent': '#1c1c23',
        '--accent-foreground': '#ffffff',
        '--primary': '#38bdf8',
        '--primary-foreground': '#000000',
        '--border': 'rgba(255, 255, 255, 0.16)',
        '--input': 'rgba(255, 255, 255, 0.22)',
        '--ring': '#38bdf8',
      }),
    }),
  });

  const DENSITY_PRESETS = Object.freeze({
    compact: Object.freeze({
      id: 'compact',
      fontSize: '13.5px',
      lineHeight: '1.52',
      messageGap: '8px',
      blockPadY: '6px',
      blockPadX: '10px',
      paragraphGap: '0.5em',
      codeFontSize: '12.5px',
    }),
    balanced: Object.freeze({
      id: 'balanced',
      fontSize: '14.5px',
      lineHeight: '1.66',
      messageGap: '14px',
      blockPadY: '10px',
      blockPadX: '14px',
      paragraphGap: '0.72em',
      codeFontSize: '13px',
    }),
    comfortable: Object.freeze({
      id: 'comfortable',
      fontSize: '15.5px',
      lineHeight: '1.8',
      messageGap: '20px',
      blockPadY: '14px',
      blockPadX: '18px',
      paragraphGap: '0.95em',
      codeFontSize: '13.5px',
    }),
  });

  const DEFAULT_SETTINGS = Object.freeze({
    preset: 'native',
    cjkFontTuning: true,
    density: 'balanced',
    compactSidebar: false,
    wideReadable: false,
    customCss: '',
    conflictPolicy: 'yield',
  });

  function normalizeSettings(raw = {}, base = DEFAULT_SETTINGS) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const prev = base && typeof base === 'object' ? base : DEFAULT_SETTINGS;

    const presetCand = src.preset !== undefined ? String(src.preset) : prev.preset;
    const preset = Object.prototype.hasOwnProperty.call(THEME_PRESETS, presetCand) ? presetCand : 'native';

    const densityCand = src.density !== undefined ? String(src.density) : prev.density;
    const density = Object.prototype.hasOwnProperty.call(DENSITY_PRESETS, densityCand) ? densityCand : 'balanced';

    const policyCand = src.conflictPolicy !== undefined ? String(src.conflictPolicy) : prev.conflictPolicy;
    const conflictPolicy = policyCand === 'takeover' ? 'takeover' : 'yield';

    return {
      preset,
      cjkFontTuning: src.cjkFontTuning !== undefined ? Boolean(src.cjkFontTuning) : Boolean(prev.cjkFontTuning),
      density,
      compactSidebar: src.compactSidebar !== undefined ? Boolean(src.compactSidebar) : Boolean(prev.compactSidebar),
      wideReadable: src.wideReadable !== undefined ? Boolean(src.wideReadable) : Boolean(prev.wideReadable),
      customCss: src.customCss !== undefined ? String(src.customCss ?? '') : String(prev.customCss ?? ''),
      conflictPolicy,
    };
  }

  const MAX_SANITIZE_PASSES = 8;
  const SAFE_LOCAL_URL_RE = /^#[A-Za-z0-9_-]+$/;
  const SAFE_DATA_IMAGE_URL_RE = /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[A-Za-z0-9+/=]+$/i;

  function findMatchingParen(str, openIdx) {
    let depth = 1;
    let quote = null;
    for (let i = openIdx + 1; i < str.length; i += 1) {
      const ch = str[i];
      if (quote) {
        if (ch === '\\') {
          i += 1;
          continue;
        }
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        continue;
      }
      if (ch === '(') {
        depth += 1;
      } else if (ch === ')') {
        depth -= 1;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  function findUnclosedCallEnd(str, startIdx, stopAtOpenBrace = false) {
    for (let i = startIdx; i < str.length; i += 1) {
      const ch = str[i];
      if (ch === ';' || ch === '}' || ch === '\n' || (stopAtOpenBrace && ch === '{')) {
        return i;
      }
    }
    return str.length;
  }

  function replaceCssCall(css, headRegex, replacer, { checkIdentBefore = true, stopAtOpenBrace = false } = {}) {
    headRegex.lastIndex = 0;
    let out = '';
    let cursor = 0;
    let match;

    while ((match = headRegex.exec(css)) !== null) {
      const start = match.index;
      if (start < cursor) continue;
      if (checkIdentBefore && start > 0 && /[A-Za-z0-9_-]/.test(css[start - 1])) {
        continue;
      }
      const openIdx = start + match[0].length - 1;
      const closeIdx = findMatchingParen(css, openIdx);
      if (closeIdx !== -1) {
        const full = css.slice(start, closeIdx + 1);
        const inner = css.slice(openIdx + 1, closeIdx);
        out += css.slice(cursor, start) + replacer(full, inner, true);
        cursor = closeIdx + 1;
        headRegex.lastIndex = cursor;
      } else {
        const endIdx = findUnclosedCallEnd(css, openIdx + 1, stopAtOpenBrace);
        const full = css.slice(start, endIdx);
        const inner = css.slice(openIdx + 1, endIdx);
        out += css.slice(cursor, start) + replacer(full, inner, false);
        cursor = endIdx;
        headRegex.lastIndex = cursor;
      }
    }

    if (cursor === 0) return css;
    return out + css.slice(cursor);
  }

  function isSafeUrlInner(inner) {
    const trimmed = String(inner || '').trim();
    if (!trimmed) return false;
    let unquoted = trimmed;
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
    ) {
      const quote = trimmed[0];
      unquoted = trimmed.slice(1, -1).trim();
      if (unquoted.includes(quote)) return false;
    } else if (/[\s"'()]/.test(unquoted)) {
      return false;
    }
    return SAFE_LOCAL_URL_RE.test(unquoted) || SAFE_DATA_IMAGE_URL_RE.test(unquoted);
  }

  function sanitizeImageSetCalls(css) {
    return replaceCssCall(css, /(?:-(?:webkit|moz|o|ms)-)?image-set\s*\(/gi, (full, inner, closed) => {
      if (!closed) return '';
      let hasUnsafeUrl = false;
      const remainder = replaceCssCall(inner, /\burl\s*\(/gi, (_uFull, uInner, uClosed) => {
        if (!uClosed || !isSafeUrlInner(uInner)) {
          hasUnsafeUrl = true;
          return '';
        }
        return ' ';
      });
      if (hasUnsafeUrl) return '';
      if (
        /["']/.test(remainder) ||
        /(?:https?:|\/\/|ftp:|file:|javascript:|vbscript:|data:)/i.test(remainder) ||
        /\b(?:url|image-set)\s*\(/i.test(remainder)
      ) {
        return '';
      }
      return full;
    });
  }

  function sanitizeUrlCalls(css) {
    return replaceCssCall(css, /\burl\s*\(/gi, (full, inner, closed) => {
      if (!closed) return '';
      return isSafeUrlInner(inner) ? full : '';
    });
  }

  function sanitizeCssSinglePass(input) {
    let css = input;

    // 1. Strip all CSS block comments (complete and unclosed tail)
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const openComment = css.indexOf('/*');
    if (openComment !== -1) css = css.slice(0, openComment);

    // 2. Decode CSS escapes
    // Fold CSS string line continuations (backslash followed by newline)
    css = css.replace(/\\\n/g, '');
    // Decode ASCII hex escapes per CSS Syntax Level 3 (1..6 hex digits max, 0x20..0x7E including 0x5C backslash);
    // preserve >= 0x80 Unicode escapes like \2022
    css = css.replace(/\\([0-9a-fA-F]{1,6})[ \t\n\f]?/g, (m, hex) => {
      const cp = parseInt(hex, 16);
      if (cp === 0) return '';
      if (cp === 0x09 || cp === 0x0a || cp === 0x0c || cp === 0x0d) return ' ';
      if (cp >= 0x20 && cp <= 0x7e) return String.fromCharCode(cp);
      return m;
    });
    // Decode non-hex backslash escapes (defeats @\i\m\p\o\r\t and \u\r\l(...))
    css = css.replace(/\\([^\n\r\f0-9a-fA-F])/g, '$1');

    // 3. Strip HTML/script/style tags and strip every '<' character so </style> or <script> can never form
    for (let t = 0; t < 4; t += 1) {
      const prevTag = css;
      css = css
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
        .replace(/<\s*\/?\s*(?:script|style|iframe|object|embed|svg|link|meta|base)\b[^>]*>?/gi, '');
      if (css === prevTag) break;
    }
    css = css.replace(/</g, '');

    // 4. Strip @import, @charset, @namespace rules and legacy script-execution primitives
    css = css.replace(
      /@\s*(?:import|charset|namespace)\b(?:(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^;{}\n])*)(?:;|\n|(?=\{)|$)/gi,
      ''
    );
    css = replaceCssCall(css, /\bexpression\s*\(/gi, () => '');
    css = css.replace(/(^|[^A-Za-z0-9_-])(?:-moz-binding|behavior)\s*:[^;}\n]*/gi, '$1');

    // 5. Strip unsafe image-set(...) / -webkit-image-set(...) (supports nested parens)
    css = sanitizeImageSetCalls(css);

    // 6. Enforce strict whitelist on url(...) (only #local-id or base64 bitmap data:image/...)
    css = sanitizeUrlCalls(css);

    // 7. Strip all :has(...) selectors (repo-wide zero :has() invariant)
    css = replaceCssCall(css, /:has\s*\(/gi, () => '', { checkIdentBefore: false, stopAtOpenBrace: true });

    return css;
  }

  function sanitizeCustomCss(raw) {
    if (raw === null || raw === undefined) return '';
    let css = String(raw).replace(/\u0000/g, '').replace(/\r\n?/g, '\n');

    // Cap pre-sanitization input size to prevent pathological CPU usage
    if (css.length > MAX_CUSTOM_CSS_LEN * 8) {
      css = css.slice(0, MAX_CUSTOM_CSS_LEN * 8);
    }

    // Multi-pass fixed-point sanitization (max 8 passes; fail-closed to '' if non-convergent)
    let converged = false;
    for (let pass = 0; pass < MAX_SANITIZE_PASSES; pass += 1) {
      const next = sanitizeCssSinglePass(css);
      if (next === css) {
        converged = true;
        break;
      }
      css = next;
    }
    if (!converged) {
      return '';
    }

    css = css.trim();
    if (css.length > MAX_CUSTOM_CSS_LEN) {
      css = css.slice(0, MAX_CUSTOM_CSS_LEN).trimEnd();
      // Final quick pass after truncation so cut-off tokens cannot leave partial dangerous constructs
      for (let pass = 0; pass < 3; pass += 1) {
        const next = sanitizeCssSinglePass(css);
        if (next === css) break;
        css = next;
      }
      css = css.trim();
    }

    // Defense-in-depth final check
    if (
      css.includes('<') ||
      /@\s*(?:import|charset|namespace)\b/i.test(css) ||
      /:has\s*\(/i.test(css) ||
      /(?:^|[^A-Za-z0-9_-])expression\s*\(/i.test(css)
    ) {
      return '';
    }

    return css;
  }

  function detectPrismTheme(doc) {
    const html = doc?.documentElement;
    if (!html) return false;
    if (typeof html.hasAttribute === 'function') {
      return Boolean(html.hasAttribute('data-ag-cs-style'));
    }
    if (typeof html.getAttribute === 'function') {
      const val = html.getAttribute('data-ag-cs-style');
      return val !== null && val !== undefined;
    }
    return false;
  }

  function buildThemeCss(cfg = {}) {
    const settings = normalizeSettings(cfg, DEFAULT_SETTINGS);
    const prismDetected = Boolean(cfg && cfg.prismDetected);
    const presetSpec = THEME_PRESETS[settings.preset] || THEME_PRESETS.native;
    const densitySpec = DENSITY_PRESETS[settings.density] || DENSITY_PRESETS.balanced;
    const colorsYielded = Boolean(prismDetected && settings.conflictPolicy === 'yield');
    const applyColors = Boolean(presetSpec.vars && !colorsYielded);

    const blocks = [];

    if (applyColors) {
      const selector =
        settings.conflictPolicy === 'takeover'
          ? 'html[data-ag-sag-theme="1"][data-ag-sag-theme-policy="takeover"], :root[data-ag-sag-theme="1"][data-ag-sag-theme-policy="takeover"]'
          : 'html[data-ag-sag-theme="1"][data-ag-sag-theme-colors="active"], :root[data-ag-sag-theme="1"][data-ag-sag-theme-colors="active"]';

      const decls = [];
      if (presetSpec.colorScheme) {
        decls.push(`color-scheme:${presetSpec.colorScheme};`);
      }
      for (const [k, v] of Object.entries(presetSpec.vars)) {
        decls.push(`${k}:${v};`);
      }
      blocks.push(`${selector}{\n  ${decls.join('\n  ')}\n}`);
      blocks.push(
        `html[data-ag-sag-theme="1"][data-ag-sag-theme-colors="active"] body{\n  background-color:var(--background);\n  color:var(--foreground);\n}`
      );
    }

    if (settings.cjkFontTuning) {
      blocks.push(
        `html[data-ag-sag-theme="1"][data-ag-sag-theme-cjk="1"]{\n` +
          `  --ag-sag-font-sans:${CJK_SANS_STACK};\n` +
          `  --ag-sag-font-mono:${CJK_MONO_STACK};\n` +
          `  --font-sans:${CJK_SANS_STACK};\n` +
          `  --font-mono:${CJK_MONO_STACK};\n` +
          `}\n` +
          `html[data-ag-sag-theme="1"][data-ag-sag-theme-cjk="1"] body,\n` +
          `html[data-ag-sag-theme="1"][data-ag-sag-theme-cjk="1"] [data-testid="conversation-view"]{\n` +
          `  font-family:var(--ag-sag-font-sans);\n` +
          `  text-rendering:optimizeLegibility;\n` +
          `  -webkit-font-smoothing:antialiased;\n` +
          `}\n` +
          `html[data-ag-sag-theme="1"][data-ag-sag-theme-cjk="1"] pre,\n` +
          `html[data-ag-sag-theme="1"][data-ag-sag-theme-cjk="1"] code,\n` +
          `html[data-ag-sag-theme="1"][data-ag-sag-theme-cjk="1"] kbd,\n` +
          `html[data-ag-sag-theme="1"][data-ag-sag-theme-cjk="1"] samp{\n` +
          `  font-family:var(--ag-sag-font-mono);\n` +
          `}`
      );
    }

    blocks.push(
      `html[data-ag-sag-theme="1"]{\n` +
        `  --ag-sag-font-size:${densitySpec.fontSize};\n` +
        `  --ag-sag-line-height:${densitySpec.lineHeight};\n` +
        `  --ag-sag-message-gap:${densitySpec.messageGap};\n` +
        `  --ag-sag-block-pad-y:${densitySpec.blockPadY};\n` +
        `  --ag-sag-block-pad-x:${densitySpec.blockPadX};\n` +
        `  --ag-sag-paragraph-gap:${densitySpec.paragraphGap};\n` +
        `  --ag-sag-code-font-size:${densitySpec.codeFontSize};\n` +
        `}\n` +
        `html[data-ag-sag-theme="1"] [data-testid="conversation-view"]{\n` +
        `  gap:var(--ag-sag-message-gap);\n` +
        `}\n` +
        `html[data-ag-sag-theme="1"] [data-testid="user-message-bubble"],\n` +
        `html[data-ag-sag-theme="1"] [data-testid="agent-response"],\n` +
        `html[data-ag-sag-theme="1"] [data-testid="planner-response-text"]{\n` +
        `  font-size:var(--ag-sag-font-size);\n` +
        `  line-height:var(--ag-sag-line-height);\n` +
        `  padding-top:var(--ag-sag-block-pad-y);\n` +
        `  padding-bottom:var(--ag-sag-block-pad-y);\n` +
        `}\n` +
        `html[data-ag-sag-theme="1"] [data-testid="agent-response"] p,\n` +
        `html[data-ag-sag-theme="1"] [data-testid="planner-response-text"] p{\n` +
        `  margin-bottom:var(--ag-sag-paragraph-gap);\n` +
        `}\n` +
        `html[data-ag-sag-theme="1"] [data-testid="conversation-view"] pre code{\n` +
        `  font-size:var(--ag-sag-code-font-size);\n` +
        `}`
    );

    if (settings.compactSidebar) {
      blocks.push(
        `html[data-ag-sag-theme="1"][data-ag-sag-theme-sidebar="1"] aside a,\n` +
          `html[data-ag-sag-theme="1"][data-ag-sag-theme-sidebar="1"] [data-testid="sidebar"] a,\n` +
          `html[data-ag-sag-theme="1"][data-ag-sag-theme-sidebar="1"] [data-testid="conversation-list"] li,\n` +
          `html[data-ag-sag-theme="1"][data-ag-sag-theme-sidebar="1"] [data-testid="conversation-list"] a{\n` +
          `  min-height:28px;\n` +
          `  padding-top:3px;\n` +
          `  padding-bottom:3px;\n` +
          `  line-height:1.3;\n` +
          `}\n` +
          `html[data-ag-sag-theme="1"][data-ag-sag-theme-sidebar="1"] [data-testid="conversation-list"]{\n` +
          `  gap:2px;\n` +
          `}`
      );
    }

    if (settings.wideReadable) {
      blocks.push(
        `html[data-ag-sag-theme="1"][data-ag-sag-theme-wide="1"] [data-testid="conversation-view"],\n` +
          `html[data-ag-sag-theme="1"][data-ag-sag-theme-wide="1"] [data-testid="agent-response"],\n` +
          `html[data-ag-sag-theme="1"][data-ag-sag-theme-wide="1"] [data-testid="planner-response-text"],\n` +
          `html[data-ag-sag-theme="1"][data-ag-sag-theme-wide="1"] [data-testid="conversation-view"] .prose{\n` +
          `  max-width:min(1180px, 94%);\n` +
          `}`
      );
    }

    const safeCustom = sanitizeCustomCss(settings.customCss);
    if (safeCustom) {
      blocks.push(`/* ag-sag-custom-css */\n${safeCustom}`);
    }

    return blocks.join('\n\n') + '\n';
  }

  function createThemeStudioController(options = {}) {
    const win = options.win || globalRoot || null;
    const doc = options.doc || win?.document || null;

    let enabled = Boolean(options.enabled === true);
    let destroyed = false;
    let settings = normalizeSettings(options, DEFAULT_SETTINGS);
    let styleEl = null;
    let lastCss = '';
    let lastPrismDetected = false;
    let lastColorsYielded = false;
    let lastSyncedFrames = 0;

    function isAllowedExtensionFrame(iframe) {
      if (!iframe) return false;
      const src = String(iframe.getAttribute?.('src') || iframe.src || '').trim();
      if (!src || src === 'about:blank') {
        return Boolean(
          iframe.hasAttribute?.('data-ag-nov-frame') ||
            iframe.hasAttribute?.('data-plugin-frame') ||
            String(iframe.getAttribute?.('name') || '').toLowerCase().includes('plugin')
        );
      }
      return /^(?:plugin|vscode-webview|antigravity-plugin|app):\/\//i.test(src) || /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\//i.test(src);
    }

    function syncExtensionFrames(presetSpec, colorsState) {
      if (!doc || typeof doc.querySelectorAll !== 'function') {
        lastSyncedFrames = 0;
        return 0;
      }
      const frames = Array.from(doc.querySelectorAll('iframe') || []);
      let count = 0;
      const payload = {
        type: 'ag-sag:theme-sync',
        enabled: Boolean(enabled && !destroyed),
        preset: settings.preset,
        mode: presetSpec?.mode || 'inherit',
        colorsState,
        vars: colorsState === 'active' && presetSpec?.vars ? { ...presetSpec.vars } : null,
      };
      for (const f of frames) {
        if (!isAllowedExtensionFrame(f)) continue;
        try {
          if (typeof f.contentWindow?.postMessage === 'function') {
            f.contentWindow.postMessage(payload, '*');
            count += 1;
          }
        } catch {}
      }
      lastSyncedFrames = count;
      return count;
    }

    function clearHtmlAttributes() {
      const html = doc?.documentElement;
      if (!html) return;
      for (const key of THEME_ATTR_KEYS) {
        try {
          html.removeAttribute?.(key);
        } catch {}
      }
      // Also sweep any dynamically added data-ag-sag-theme* attribute on real DOM
      if (html.attributes && typeof html.attributes.length === 'number') {
        const names = [];
        for (let i = 0; i < html.attributes.length; i++) {
          const name = html.attributes[i]?.name;
          if (name && name.startsWith('data-ag-sag-theme')) names.push(name);
        }
        for (const name of names) {
          try {
            html.removeAttribute?.(name);
          } catch {}
        }
      }
    }

    function removeStyleElement() {
      try {
        styleEl?.remove?.();
      } catch {}
      styleEl = null;
      if (doc && typeof doc.getElementById === 'function') {
        try {
          const existing = doc.getElementById(STYLE_ID);
          if (existing && typeof existing.remove === 'function') existing.remove();
        } catch {}
      }
      lastCss = '';
    }

    function ensureStyleElement() {
      if (!doc) return null;
      if (styleEl && styleEl.parentElement) return styleEl;
      if (typeof doc.getElementById === 'function') {
        const existing = doc.getElementById(STYLE_ID);
        if (existing) {
          styleEl = existing;
          return styleEl;
        }
      }
      if (typeof doc.createElement !== 'function') return null;
      const el = doc.createElement('style');
      el.id = STYLE_ID;
      el.setAttribute?.('id', STYLE_ID);
      el.setAttribute?.('data-ag-sag-owned', '1');
      const host = doc.head || doc.documentElement || doc.body;
      if (!host || typeof host.appendChild !== 'function') return null;
      host.appendChild(el);
      styleEl = el;
      return styleEl;
    }

    function sync() {
      if (destroyed || !enabled) {
        removeStyleElement();
        clearHtmlAttributes();
        lastPrismDetected = detectPrismTheme(doc);
        lastColorsYielded = false;
        syncExtensionFrames(THEME_PRESETS.native, 'disabled');
        return {
          applied: false,
          enabled,
          destroyed,
          prismDetected: lastPrismDetected,
          colorsYielded: false,
          cssLength: 0,
          syncedFrames: lastSyncedFrames,
        };
      }

      const prismDetected = detectPrismTheme(doc);
      const presetSpec = THEME_PRESETS[settings.preset] || THEME_PRESETS.native;
      const colorsYielded = Boolean(prismDetected && settings.conflictPolicy === 'yield' && presetSpec.vars);
      const colorsState = !presetSpec.vars ? 'native' : colorsYielded ? 'yielded' : 'active';

      lastPrismDetected = prismDetected;
      lastColorsYielded = colorsYielded;

      const html = doc?.documentElement;
      if (html && typeof html.setAttribute === 'function') {
        html.setAttribute('data-ag-sag-theme', '1');
        html.setAttribute('data-ag-sag-theme-preset', settings.preset);
        html.setAttribute('data-ag-sag-theme-density', settings.density);
        html.setAttribute('data-ag-sag-theme-policy', settings.conflictPolicy);
        html.setAttribute('data-ag-sag-theme-colors', colorsState);
        html.setAttribute('data-ag-sag-theme-cjk', settings.cjkFontTuning ? '1' : '0');
        html.setAttribute('data-ag-sag-theme-sidebar', settings.compactSidebar ? '1' : '0');
        html.setAttribute('data-ag-sag-theme-wide', settings.wideReadable ? '1' : '0');
      }

      const css = buildThemeCss({ ...settings, prismDetected });
      const el = ensureStyleElement();
      if (el && lastCss !== css) {
        el.textContent = css;
        lastCss = css;
      }

      const syncedFrames = syncExtensionFrames(presetSpec, colorsState);

      return {
        applied: Boolean(el || !doc),
        enabled,
        destroyed,
        prismDetected,
        colorsYielded,
        colorsState,
        cssLength: css.length,
        syncedFrames,
      };
    }

    function updateSettings(patch) {
      if (destroyed) return { ...settings };
      settings = normalizeSettings(patch, settings);
      if (enabled) sync();
      return { ...settings };
    }

    function setEnabled(next) {
      if (destroyed) return false;
      enabled = Boolean(next);
      sync();
      return enabled;
    }

    function getDebugState() {
      const sanitizedLen = sanitizeCustomCss(settings.customCss).length;
      const mounted = Boolean(
        styleEl && (styleEl.parentElement || (typeof doc?.getElementById === 'function' && doc.getElementById(STYLE_ID)))
      );
      return {
        enabled,
        destroyed,
        styleId: STYLE_ID,
        styleMounted: mounted,
        prismDetected: lastPrismDetected,
        colorsYielded: lastColorsYielded,
        settings: { ...settings },
        sanitizedCustomCssLength: sanitizedLen,
        cssLength: lastCss.length,
        syncedFrames: lastSyncedFrames,
      };
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      enabled = false;
      removeStyleElement();
      clearHtmlAttributes();
      syncExtensionFrames(THEME_PRESETS.native, 'disabled');
      lastColorsYielded = false;
    }

    if (enabled) {
      sync();
    }

    return {
      updateSettings,
      setEnabled,
      sync,
      getDebugState,
      destroy,
    };
  }

  return {
    STYLE_ID,
    MAX_CUSTOM_CSS_LEN,
    THEME_PRESETS,
    DENSITY_PRESETS,
    DEFAULT_SETTINGS,
    sanitizeCustomCss,
    buildThemeCss,
    createThemeStudioController,
  };
});
