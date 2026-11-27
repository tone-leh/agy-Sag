// agy-Sag — Dual-Star Synergy Controller & Zero-Port CDP Bridge Client for agy-NOV (UMD, zero runtime deps)
// Independent MIT-licensed implementation:
//   - Bridges renderer UI to Watch Sidecar via CDP Runtime.addBinding (window.__agSagHostBridge) or injected novTransport
//   - Receives live reverse state pushes via window.__agSagBridgeReceiver.onPush({ event: 'nov:state', state })
//   - Computes the 4 real-time Dual-Star Synergy Effects (dual-shield, context-memory, radar-dedup, dual-star-hub)
//   - 100% lossless destroy() with strict receiver ownership checks and pending timer teardown
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSagNovSynergy = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  const HOST_BRIDGE_GLOBAL = '__agSagHostBridge';
  const RECEIVER_GLOBAL = '__agSagBridgeReceiver';
  const NOV_INSTALL_CMD = 'agy plugin install https://github.com/tone-leh/agy-NOV';
  const NOV_BASE_TOOL_COUNT = 2; // nov_open + nov_status
  const DEFAULT_TIMEOUT_MS = 4000;

  const NOV_MODULE_IDS = Object.freeze([
    'review',
    'guard',
    'xray',
    'turbo',
    'radar',
    'canvas',
    'mem',
    'ops',
    'remote',
  ]);

  const NOV_MODULES_META = Object.freeze([
    Object.freeze({
      id: 'review',
      category: 'core-dev',
      nameZh: 'Diff 审阅',
      nameEn: 'Diff Review',
      shortZh: '审阅',
      shortEn: 'Review',
      descZh: 'PR 级行内 Diff 批注与精准返修',
      descEn: 'PR-grade inline diff review & line annotations',
      toolCount: 2,
      privacy: 'offline',
      defaultEnabled: true,
    }),
    Object.freeze({
      id: 'guard',
      category: 'safety',
      nameZh: '安全护盾与快照',
      nameEn: 'Guard & Snapshots',
      shortZh: '护盾',
      shortEn: 'Guard',
      descZh: '密钥防泄漏、命令防火墙与零 Git 改前快照',
      descEn: 'Secret firewall, command guard & pre-edit snapshots',
      toolCount: 4,
      privacy: 'offline',
      defaultEnabled: true,
    }),
    Object.freeze({
      id: 'xray',
      category: 'observability',
      nameZh: '上下文透视',
      nameEn: 'Context X-Ray',
      shortZh: '透视',
      shortEn: 'X-Ray',
      descZh: 'Token 缓存拆解、改动文件树与跨会话检索',
      descEn: 'Token/cache breakdown & cross-session BM25 search',
      toolCount: 4,
      privacy: 'offline',
      defaultEnabled: true,
    }),
    Object.freeze({
      id: 'turbo',
      category: 'core-dev',
      nameZh: '极速检索与压缩',
      nameEn: 'Turbo & Output Guard',
      shortZh: '极速',
      shortEn: 'Turbo',
      descZh: '批量代码检索、符号大纲切片与超长日志压缩',
      descEn: 'Batch search, outline slices & large-output compaction',
      toolCount: 3,
      privacy: 'offline',
      defaultEnabled: false,
    }),
    Object.freeze({
      id: 'radar',
      category: 'observability',
      nameZh: '多会话雷达',
      nameEn: 'Session Radar & Chime',
      shortZh: '雷达',
      shortEn: 'Radar',
      descZh: '基于官方 Hook 的多会话看板与完成提示音',
      descEn: 'Hook-based multi-session board & completion chimes',
      toolCount: 2,
      privacy: 'offline',
      defaultEnabled: false,
    }),
    Object.freeze({
      id: 'canvas',
      category: 'workspace',
      nameZh: '视觉画布',
      nameEn: 'Visual Canvas',
      shortZh: '画布',
      shortEn: 'Canvas',
      descZh: 'HTML/SVG/幻灯片隔离沙盒预览与图钉批注',
      descEn: 'Sandboxed HTML/SVG/Slide preview & pin feedback',
      toolCount: 4,
      privacy: 'offline',
      defaultEnabled: false,
    }),
    Object.freeze({
      id: 'mem',
      category: 'workspace',
      nameZh: '记忆图谱',
      nameEn: 'Memory Graph',
      shortZh: '记忆',
      shortEn: 'Memory',
      descZh: 'SHA-256 代码锚定的跨会话长期记忆与漂移告警',
      descEn: 'Code-anchored long-term memory with drift detection',
      toolCount: 3,
      privacy: 'offline',
      defaultEnabled: false,
    }),
    Object.freeze({
      id: 'ops',
      category: 'workspace',
      nameZh: '提示词库与体检',
      nameEn: 'Prompt Vault & Doctor',
      shortZh: '运维',
      shortEn: 'Ops',
      descZh: '参数化提示词模板库、工作区资产与存储审计',
      descEn: 'Parameterized prompt vault & workspace asset audit',
      toolCount: 3,
      privacy: 'offline',
      defaultEnabled: false,
    }),
    Object.freeze({
      id: 'remote',
      category: 'connectivity',
      nameZh: '手机与 IM 远程',
      nameEn: 'Mobile & IM Remote',
      shortZh: '远程',
      shortEn: 'Remote',
      descZh: '默认彻底关闭；按需开启手机 PWA 或 IM 通知与审批',
      descEn: 'Opt-in mobile PWA & IM webhook alerts / approvals',
      toolCount: 4,
      privacy: 'opt-in-network',
      defaultEnabled: false,
    }),
  ]);

  const NOV_MODULES_MAP = Object.freeze(
    NOV_MODULES_META.reduce((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, Object.create(null))
  );

  function buildPresetModulesMap(enabledList) {
    const enabledSet = new Set(enabledList);
    const out = {};
    for (const id of NOV_MODULE_IDS) {
      out[id] = enabledSet.has(id);
    }
    return Object.freeze(out);
  }

  const NOV_PRESETS_META = Object.freeze([
    Object.freeze({
      id: 'minimal',
      nameZh: '极简护盾',
      nameEn: 'Minimal',
      descZh: '仅开启 Guard，最低工具开销 (6 工具)',
      descEn: 'Guard only, minimum tool footprint (6 tools)',
      enabledModules: Object.freeze(['guard']),
      modules: buildPresetModulesMap(['guard']),
      toolCount: 6,
      privacy: 'offline',
    }),
    Object.freeze({
      id: 'core',
      nameZh: '核心默认',
      nameEn: 'Core',
      descZh: 'Review + Guard + X-Ray，100% 本地离线 (12 工具)',
      descEn: 'Review + Guard + X-Ray, 100% offline (12 tools)',
      enabledModules: Object.freeze(['review', 'guard', 'xray']),
      modules: buildPresetModulesMap(['review', 'guard', 'xray']),
      toolCount: 12,
      privacy: 'offline',
    }),
    Object.freeze({
      id: 'power',
      nameZh: '极客日常',
      nameEn: 'Power',
      descZh: 'Core + Turbo + Radar + Ops，高能本地 (20 工具)',
      descEn: 'Core + Turbo + Radar + Ops, offline (20 tools)',
      enabledModules: Object.freeze(['review', 'guard', 'xray', 'turbo', 'radar', 'ops']),
      modules: buildPresetModulesMap(['review', 'guard', 'xray', 'turbo', 'radar', 'ops']),
      toolCount: 20,
      privacy: 'offline',
    }),
    Object.freeze({
      id: 'local-all',
      nameZh: '全本地 8 项',
      nameEn: 'Local All',
      descZh: '全部 8 个离线模块，Remote 零端口 (27 工具)',
      descEn: 'All 8 offline modules, zero ports (27 tools)',
      enabledModules: Object.freeze(['review', 'guard', 'xray', 'turbo', 'radar', 'canvas', 'mem', 'ops']),
      modules: buildPresetModulesMap(['review', 'guard', 'xray', 'turbo', 'radar', 'canvas', 'mem', 'ops']),
      toolCount: 27,
      privacy: 'offline',
    }),
    Object.freeze({
      id: 'full',
      nameZh: '全套 9 项',
      nameEn: 'Full',
      descZh: '全部 9 个模块含按需联网的 Remote (31 工具)',
      descEn: 'All 9 modules incl. opt-in Remote (31 tools)',
      enabledModules: NOV_MODULE_IDS,
      modules: buildPresetModulesMap(NOV_MODULE_IDS),
      toolCount: 31,
      privacy: 'opt-in-network',
    }),
  ]);

  const NOV_PRESETS_MAP = Object.freeze(
    NOV_PRESETS_META.reduce((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, Object.create(null))
  );

  function createDefaultNovModules() {
    const out = {};
    for (const m of NOV_MODULES_META) {
      out[m.id] = Boolean(m.defaultEnabled);
    }
    return out;
  }

  function detectNovPreset(modules) {
    const mods = modules && typeof modules === 'object' ? modules : {};
    for (const preset of NOV_PRESETS_META) {
      if (NOV_MODULE_IDS.every((id) => Boolean(mods[id]) === Boolean(preset.modules[id]))) {
        return preset.id;
      }
    }
    return 'custom';
  }

  function countEnabledNovModules(modules) {
    const mods = modules && typeof modules === 'object' ? modules : {};
    let count = 0;
    for (const id of NOV_MODULE_IDS) {
      if (mods[id]) count += 1;
    }
    return count;
  }

  function countNovModelTools(modules) {
    const mods = modules && typeof modules === 'object' ? modules : {};
    let total = NOV_BASE_TOOL_COUNT;
    for (const m of NOV_MODULES_META) {
      if (mods[m.id]) total += m.toolCount;
    }
    return total;
  }

  function normalizeNovState(raw, fallbackConnected = false) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const installed = Boolean(src.installed);
    const rawCfg = src.config && typeof src.config === 'object' ? src.config : {};
    const rawMods =
      rawCfg.modules && typeof rawCfg.modules === 'object'
        ? rawCfg.modules
        : src.modules && typeof src.modules === 'object'
          ? src.modules
          : {};
    const baseMods = createDefaultNovModules();
    const modules = {};
    for (const id of NOV_MODULE_IDS) {
      modules[id] = typeof rawMods[id] === 'boolean' ? rawMods[id] : baseMods[id];
    }
    const preset =
      typeof rawCfg.preset === 'string' && (NOV_PRESETS_MAP[rawCfg.preset] || rawCfg.preset === 'custom')
        ? rawCfg.preset
        : typeof src.preset === 'string' && (NOV_PRESETS_MAP[src.preset] || src.preset === 'custom')
          ? src.preset
          : detectNovPreset(modules);
    const locale = typeof rawCfg.locale === 'string' && rawCfg.locale ? rawCfg.locale : 'auto';
    const enabledCount = installed ? countEnabledNovModules(modules) : 0;
    const rawToolCount =
      src.toolCount !== undefined && src.toolCount !== null ? src.toolCount : src.enabledToolsCount;
    const toolCount =
      installed
        ? Number.isFinite(Number(rawToolCount)) && Number(rawToolCount) >= NOV_BASE_TOOL_COUNT
          ? Math.round(Number(rawToolCount))
          : countNovModelTools(modules)
        : 0;
    const bridgeConnected =
      typeof src.bridgeConnected === 'boolean' ? src.bridgeConnected : Boolean(fallbackConnected);

    return {
      installed,
      version: typeof src.version === 'string' ? src.version : '',
      dataDir: typeof src.dataDir === 'string' ? src.dataDir : '',
      bridgeConnected,
      enabledCount,
      toolCount,
      updatedAt: typeof rawCfg.updatedAt === 'string' ? rawCfg.updatedAt : typeof src.updatedAt === 'string' ? src.updatedAt : '',
      config: {
        schemaVersion: 1,
        preset,
        modules,
        locale,
        defaultTab: typeof rawCfg.defaultTab === 'string' ? rawCfg.defaultTab : 'review',
      },
    };
  }

  function computeSynergyEffects(sagConfig, novState, options = {}) {
    const sagMods = sagConfig && typeof sagConfig === 'object' && sagConfig.modules && typeof sagConfig.modules === 'object'
      ? sagConfig.modules
      : {};
    const nov = normalizeNovState(novState, Boolean(options.bridgeConnected));
    const novMods = nov.config.modules;
    const bridgeConnected =
      typeof options.bridgeConnected === 'boolean' ? options.bridgeConnected : Boolean(nov.bridgeConnected);

    const effects = [];

    if (!nov.installed) {
      return effects;
    }

    // 1) dual-shield: safeAutoAccept x agy-NOV guard
    if (Boolean(sagMods.safeAutoAccept)) {
      if (Boolean(novMods.guard)) {
        effects.push({
          id: 'dual-shield',
          status: 'active',
          tone: 'ok',
          titleZh: '双层安全护盾已激活',
          titleEn: 'Dual-Layer Safety Shield Active',
          descZh: '🛡 双层安全护盾已激活：前端铁壁黑名单 + agy-NOV 后端改前快照',
          descEn: '🛡 Dual-layer shield active: frontend hard-deny blacklist + agy-NOV backend pre-edit snapshots',
          quickAction: null,
        });
      } else {
        effects.push({
          id: 'dual-shield',
          status: 'recommend',
          tone: 'warn',
          titleZh: '建议开启 agy-NOV 后端快照护盾',
          titleEn: 'Recommend Enabling agy-NOV Guard',
          descZh: '🛡 已开启前端自动审批，建议一键开启 agy-NOV guard 补齐密钥防火墙与改前快照防线',
          descEn: '🛡 Auto-Accept is active. Enable agy-NOV guard for backend secret firewall & pre-edit snapshots',
          quickAction: {
            type: 'enable-nov-module',
            moduleId: 'guard',
            labelZh: '一键开启 agy-NOV guard',
            labelEn: 'Enable agy-NOV guard',
          },
        });
      }
    }

    // 2) context-memory: compactGuard x agy-NOV mem & xray
    if (Boolean(sagMods.compactGuard)) {
      if (Boolean(novMods.mem) && Boolean(novMods.xray)) {
        effects.push({
          id: 'context-memory',
          status: 'active',
          tone: 'ok',
          titleZh: '防爆 × 记忆 × 透视全链路协同',
          titleEn: 'Compact × Memory × X-Ray Full Synergy',
          descZh: '🧠 压缩护航 + 代码锚定记忆 + X-Ray 透视全链路已协同',
          descEn: '🧠 Auto-compact + code-anchored memory + Context X-Ray synced end to end',
          quickAction: null,
        });
      } else if (!novMods.mem) {
        effects.push({
          id: 'context-memory',
          status: 'tip',
          tone: 'info',
          titleZh: '压缩前自动沉淀跨会话记忆',
          titleEn: 'Anchor Decisions Before Compaction',
          descZh: '🧠 建议开启 agy-NOV mem，压缩前自动沉淀跨会话架构决策并锚定代码哈希',
          descEn: '🧠 Enable agy-NOV mem to preserve architectural decisions anchored to code hashes before compacting',
          quickAction: {
            type: 'enable-nov-module',
            moduleId: 'mem',
            labelZh: '一键开启 agy-NOV mem',
            labelEn: 'Enable agy-NOV mem',
          },
        });
      } else if (!novMods.xray) {
        effects.push({
          id: 'context-memory',
          status: 'tip',
          tone: 'info',
          titleZh: '补齐 X-Ray Token 缓存透视',
          titleEn: 'Add X-Ray Token & Cache Analytics',
          descZh: '🧠 建议开启 agy-NOV xray，配合压缩护航实时拆解缓存命中率与高耗工具',
          descEn: '🧠 Enable agy-NOV xray alongside Compact Guard to inspect cache hits and token-heavy tools',
          quickAction: {
            type: 'enable-nov-module',
            moduleId: 'xray',
            labelZh: '一键开启 agy-NOV xray',
            labelEn: 'Enable agy-NOV xray',
          },
        });
      }
    }

    // 3) radar-dedup: sessionRadar x agy-NOV radar
    if (Boolean(sagMods.sessionRadar) && Boolean(novMods.radar)) {
      effects.push({
        id: 'radar-dedup',
        status: 'warn',
        tone: 'warn',
        titleZh: '检测到双侧提醒同时开启',
        titleEn: 'Duplicate Session Alerts Detected',
        descZh: '🔔 检测到 agy-Sag 侧栏聚光与 agy-NOV 多会话雷达同时开启，建议一键关闭重复的侧栏通知保持清爽',
        descEn: '🔔 Both agy-Sag Session Radar and agy-NOV Radar are ON. Disable the duplicate sidebar alert to stay uncluttered',
        quickAction: {
          type: 'disable-sag-module',
          moduleId: 'sessionRadar',
          labelZh: '关闭重复提醒',
          labelEn: 'Disable Duplicate Radar',
        },
      });
    }

    // 4) dual-star-hub: unified dual-star control plane
    if (bridgeConnected) {
      const enabledCount = countEnabledNovModules(novMods);
      const toolCount = countNovModelTools(novMods);
      const verLabel = nov.version ? ` v${nov.version}` : '';
      effects.push({
        id: 'dual-star-hub',
        status: 'connected',
        tone: 'accent',
        enabledCount,
        toolCount,
        titleZh: '双星统一控制面已连通',
        titleEn: 'Dual-Star Control Hub Connected',
        descZh: `✦ agy-NOV${verLabel} 零端口直连 · 已启用 ${enabledCount}/9 模块 · 暴露 ${toolCount} 个模型工具`,
        descEn: `✦ agy-NOV${verLabel} zero-port bridged · ${enabledCount}/9 modules ON · ${toolCount} model tools exposed`,
        quickAction: null,
      });
    }

    return effects;
  }

  function parseIncomingMessage(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
    return typeof raw === 'object' ? raw : null;
  }

  function extractStateFromPayload(msg) {
    if (!msg || typeof msg !== 'object') return null;
    if (msg.state && typeof msg.state === 'object') return msg.state;
    if (msg.result && typeof msg.result === 'object') {
      if (msg.result.state && typeof msg.result.state === 'object') return msg.result.state;
      if (typeof msg.result.installed === 'boolean' || msg.result.config) return msg.result;
    }
    if (msg.data && typeof msg.data === 'object') {
      if (msg.data.state && typeof msg.data.state === 'object') return msg.data.state;
      if (typeof msg.data.installed === 'boolean' || msg.data.config) return msg.data;
    }
    if (msg.payload && typeof msg.payload === 'object') {
      if (msg.payload.state && typeof msg.payload.state === 'object') return msg.payload.state;
      if (typeof msg.payload.installed === 'boolean' || msg.payload.config) return msg.payload;
    }
    if (typeof msg.installed === 'boolean' || msg.config) return msg;
    return null;
  }

  function createNovSynergyController(options = {}) {
    const win = options.win || globalRoot;
    const timeoutMs = Math.max(10, Number(options.requestTimeoutMs) || DEFAULT_TIMEOUT_MS);
    const setTimer = typeof options.setTimer === 'function' ? options.setTimer : (fn, ms) => setTimeout(fn, ms);
    const clearTimer = typeof options.clearTimer === 'function' ? options.clearTimer : (t) => clearTimeout(t);
    const novTransport = options.novTransport || null;

    let destroyed = false;
    let reqSeq = 0;
    let bridgeConnected = false;
    let lastError = null;
    let lastUpdatedAt = 0;
    let currentState = normalizeNovState(options.initialState || null, false);
    const pending = new Map(); // reqId -> { resolve, timer, type }
    const subscribers = new Set();
    let unsubscribeTransport = null;

    if (typeof options.onStateChange === 'function') {
      subscribers.add(options.onStateChange);
    }

    function hasHostBridge() {
      return Boolean(win && typeof win[HOST_BRIDGE_GLOBAL] === 'function');
    }

    function hasTransport() {
      return Boolean(
        novTransport &&
          (typeof novTransport === 'function' ||
            typeof novTransport.request === 'function' ||
            typeof novTransport.send === 'function')
      );
    }

    function isBridgeAvailable() {
      return !destroyed && (hasTransport() || hasHostBridge());
    }

    function notifyStateChange() {
      const snapshot = getState();
      for (const cb of subscribers) {
        try {
          cb(snapshot);
        } catch {}
      }
    }

    function applyIncomingState(rawState, markConnected = true) {
      if (destroyed || !rawState || typeof rawState !== 'object') return currentState;
      if (markConnected) bridgeConnected = true;
      currentState = normalizeNovState(rawState, bridgeConnected);
      lastError = null;
      lastUpdatedAt = typeof options.now === 'function' ? options.now() : Date.now();
      notifyStateChange();
      return currentState;
    }

    function handleResponse(rawMsg) {
      if (destroyed) return false;
      const msg = parseIncomingMessage(rawMsg);
      if (!msg || !msg.reqId) return false;
      const entry = pending.get(String(msg.reqId));
      if (!entry) return false;
      pending.delete(String(msg.reqId));
      try {
        clearTimer(entry.timer);
      } catch {}

      const ok = msg.ok !== false && !msg.error;
      if (!entry.skipStateApply) {
        const stateObj = extractStateFromPayload(msg);
        if (ok && stateObj) {
          applyIncomingState(stateObj, true);
        } else if (ok) {
          bridgeConnected = true;
          currentState = { ...currentState, bridgeConnected: true };
        } else {
          lastError = String(msg.error || 'Bridge request failed');
        }
      }

      entry.resolve({
        ok,
        reqId: String(msg.reqId),
        error: ok ? null : String(msg.error || 'Bridge request failed'),
        state: getState(),
        raw: msg,
      });
      return true;
    }

    function handlePush(rawMsg) {
      if (destroyed) return false;
      const msg = parseIncomingMessage(rawMsg);
      if (!msg) return false;
      const ev = String(msg.event || msg.type || '');
      if (ev === 'nov:state' || ev === 'nov:state_changed') {
        const stateObj = extractStateFromPayload(msg);
        if (stateObj) {
          applyIncomingState(stateObj, true);
          return true;
        }
      }
      return false;
    }

    const receiver = {
      onResponse: handleResponse,
      onPush: handlePush,
    };

    if (win) {
      try {
        win[RECEIVER_GLOBAL] = receiver;
      } catch {}
    }

    if (novTransport && typeof novTransport.subscribe === 'function') {
      try {
        unsubscribeTransport = novTransport.subscribe((pushMsg) => handlePush(pushMsg));
      } catch {}
    }

    function sendRequest(type, payload = {}, opts = {}) {
      if (destroyed) {
        return Promise.resolve({ ok: false, error: 'Controller destroyed', state: getState() });
      }
      if (!isBridgeAvailable()) {
        bridgeConnected = false;
        currentState = { ...currentState, bridgeConnected: false };
        return Promise.resolve({ ok: false, error: 'Bridge unavailable', unavailable: true, state: getState() });
      }

      reqSeq += 1;
      const reqId = `sag-nov-${reqSeq}-${Math.random().toString(36).slice(2, 7)}`;
      const envelope = { reqId, type, payload };
      const skipStateApply = Boolean(opts && opts.rawOnly);

      // Mode A: Injected novTransport (offline workbench & unit tests)
      if (hasTransport()) {
        return new Promise((resolve) => {
          let settled = false;
          const finish = (res) => {
            if (settled) return;
            settled = true;
            pending.delete(reqId);
            try {
              clearTimer(timer);
            } catch {}
            resolve(res);
          };
          const timer = setTimer(() => {
            lastError = 'Bridge request timed out';
            finish({ ok: false, reqId, timedOut: true, error: 'Bridge request timed out', state: getState() });
          }, timeoutMs);
          pending.set(reqId, { resolve: finish, timer, type, skipStateApply });

          try {
            const callPromise =
              typeof novTransport === 'function'
                ? Promise.resolve(novTransport(envelope))
                : typeof novTransport.request === 'function'
                  ? Promise.resolve(novTransport.request(envelope))
                  : Promise.resolve(novTransport.send(envelope));

            callPromise.then(
              (resp) => {
                if (settled || destroyed) return;
                if (resp !== undefined && resp !== null) {
                  const msg = parseIncomingMessage(resp);
                  if (msg && !msg.reqId) msg.reqId = reqId;
                  if (msg) {
                    handleResponse(msg);
                    return;
                  }
                }
              },
              (err) => {
                if (settled || destroyed) return;
                lastError = err?.message || String(err);
                finish({ ok: false, reqId, error: lastError, state: getState() });
              }
            );
          } catch (err) {
            lastError = err?.message || String(err);
            finish({ ok: false, reqId, error: lastError, state: getState() });
          }
        });
      }

      // Mode B: Zero-Port CDP Runtime.addBinding (window.__agSagHostBridge)
      return new Promise((resolve) => {
        const timer = setTimer(() => {
          if (!pending.has(reqId)) return;
          pending.delete(reqId);
          lastError = 'Bridge request timed out';
          resolve({ ok: false, reqId, timedOut: true, error: 'Bridge request timed out', state: getState() });
        }, timeoutMs);
        pending.set(reqId, { resolve, timer, type, skipStateApply });

        try {
          win[HOST_BRIDGE_GLOBAL](JSON.stringify(envelope));
        } catch (err) {
          if (pending.has(reqId)) {
            pending.delete(reqId);
            try {
              clearTimer(timer);
            } catch {}
          }
          lastError = err?.message || String(err);
          resolve({ ok: false, reqId, error: lastError, state: getState() });
        }
      });
    }

    function requestRaw(type, payload = {}) {
      return sendRequest(type, payload, { rawOnly: true });
    }

    function refresh() {
      return sendRequest('nov:get_state', {});
    }

    function setModule(moduleId, enabled) {
      const id = String(moduleId || '').trim();
      if (!NOV_MODULES_MAP[id]) {
        return Promise.resolve({ ok: false, error: `Unknown agy-NOV module: ${id}`, state: getState() });
      }
      return sendRequest('nov:set_module', { moduleId: id, enabled: Boolean(enabled) });
    }

    function applyPreset(preset) {
      const id = String(preset || '').trim().toLowerCase();
      if (!NOV_PRESETS_MAP[id]) {
        return Promise.resolve({ ok: false, error: `Unknown agy-NOV preset: ${id}`, state: getState() });
      }
      return sendRequest('nov:apply_preset', { preset: id });
    }

    function setLocale(locale) {
      const loc = String(locale || 'auto').trim();
      return sendRequest('nov:set_locale', { locale: loc });
    }

    function getState() {
      return {
        ...currentState,
        bridgeConnected,
        config: {
          ...currentState.config,
          modules: { ...currentState.config.modules },
        },
      };
    }

    function getSynergyEffects(sagConfigOverride) {
      const sagCfg =
        sagConfigOverride ||
        (typeof options.getSagConfig === 'function' ? options.getSagConfig() : null) ||
        {};
      return computeSynergyEffects(sagCfg, currentState, { bridgeConnected });
    }

    function onStateChange(fn) {
      if (typeof fn !== 'function') return () => {};
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    }

    function getDebugState() {
      return {
        destroyed,
        bridgeAvailable: isBridgeAvailable(),
        bridgeConnected,
        transportMode: hasTransport() ? 'injected' : hasHostBridge() ? 'cdp-binding' : 'none',
        installed: currentState.installed,
        version: currentState.version,
        preset: currentState.config.preset,
        enabledCount: currentState.enabledCount,
        toolCount: currentState.toolCount,
        pendingCount: pending.size,
        lastError,
        lastUpdatedAt,
      };
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const [reqId, entry] of pending.entries()) {
        try {
          clearTimer(entry.timer);
        } catch {}
        try {
          entry.resolve({ ok: false, reqId, error: 'Controller destroyed', state: getState() });
        } catch {}
      }
      pending.clear();
      subscribers.clear();
      if (typeof unsubscribeTransport === 'function') {
        try {
          unsubscribeTransport();
        } catch {}
        unsubscribeTransport = null;
      }
      if (win && win[RECEIVER_GLOBAL] === receiver) {
        try {
          delete win[RECEIVER_GLOBAL];
        } catch {}
      }
    }

    if (options.autoRefresh !== false && isBridgeAvailable()) {
      void refresh();
    }

    return {
      refresh,
      setModule,
      applyPreset,
      setLocale,
      requestRaw,
      getState,
      getSynergyEffects,
      isBridgeAvailable,
      isConnected: () => Boolean(!destroyed && bridgeConnected && currentState.installed),
      onStateChange,
      getDebugState,
      destroy,
    };
  }

  return {
    HOST_BRIDGE_GLOBAL,
    RECEIVER_GLOBAL,
    NOV_INSTALL_CMD,
    NOV_BASE_TOOL_COUNT,
    NOV_MODULE_IDS,
    NOV_MODULES_META,
    NOV_MODULES_MAP,
    NOV_PRESETS_META,
    NOV_PRESETS_MAP,
    detectNovPreset,
    countEnabledNovModules,
    countNovModelTools,
    normalizeNovState,
    computeSynergyEffects,
    createNovSynergyController,
  };
});
