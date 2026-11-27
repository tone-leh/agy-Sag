#!/usr/bin/env node
/**
 * agy-Sag — All-in-One Offline Interactive Workbench
 *
 * Previews all modular capabilities offline without touching any live Antigravity instance:
 *   - Host i18n (10-language Zero-ASAR native UI live translation + physical code/slash/chat immunity)
 *   - One-Click Presets (Essential / i18n Only / Power / Full Auto)
 *   - Prompt Queue (queue follow-up tasks while streaming + automatic debounced dispatch)
 *   - Safe Auto-Accept (policy-gated dev-flow demo vs ironclad HARD_DENY_PATTERNS blacklist audit)
 *   - Theme Studio (zero-:has() 5 optical themes + CJK font tuning + density)
 *   - Quota Pulse (read-only 5h/7d ledger + 429 Rate Limit DOM alert detection)
 *   - Compact Guard + Smart /compact Focus Presets + Post-Compact Recovery Strip + Bookmarks + Session Radar + Watchdog
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCoreSources } from '../cli/bundle.mjs';

const DEFAULT_PORT = 4179;

export const SMOKE_REQUIRED_MARKERS = Object.freeze([
  // Legacy-compatible DOM markers
  'mountSag',
  'ag-sg-radar-bar',
  'ag-sg-bm-dock',
  'ag-sg-recovery-bar',
  'ag-sg-vault-modal',
  // New agy-Sag v1.0.0 modular engine markers
  '__agSagHostI18n',
  '__agSagPromptQueue',
  '__agSagSafeAutoAccept',
  '__agSagThemeStudio',
  '__agSagQuotaPulse',
  '__agSagNovSynergy',
  'ag-sag-synergy',
  'agSag.hostI18n.customPacks.v1',
]);

export function buildHtmlPage() {
  const coreScript = readCoreSources()
    .map((p) => `/* ${p.file} */\n${p.code}`)
    .join('\n;\n');

  return `<!doctype html>
<html lang="zh-CN" data-ag-cs-lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>agy-Sag · All-in-One Offline Workbench</title>
  <style>
    :root{
      --background:#0b0d13; --card:#131722; --popover:#171c2a; --foreground:#eef1f7; --muted-foreground:#94a3b8;
      --primary:#3186ff; --primary-foreground:#ffffff; --secondary:rgba(148,163,184,.14);
      --border:rgba(148,163,184,.24); --warning:#f59e0b; --error:#ef4444; --success:#34d399;
    }
    html[data-theme="crystal"]{
      --background:#f3f6fb; --card:#ffffff; --popover:#ffffff; --foreground:#0f172a; --muted-foreground:#475569;
      --primary:#2563eb; --primary-foreground:#ffffff; --secondary:rgba(15,23,42,.06);
      --border:rgba(15,23,42,.12); --warning:#d97706; --error:#dc2626; --success:#059669;
    }
    html[data-theme="alabaster"]{
      --background:#f5f2eb; --card:#faf8f3; --popover:#fdfbf6; --foreground:#1c1917; --muted-foreground:#57534e;
      --primary:#b45309; --primary-foreground:#ffffff; --secondary:rgba(68,52,32,.07);
      --border:rgba(68,52,32,.14); --warning:#d97706; --error:#dc2626; --success:#059669;
    }
    html[data-theme="warm"]{
      --background:#110f0d; --card:#1b1714; --popover:#221d19; --foreground:#f2ede4; --muted-foreground:#a89f91;
      --primary:#f59e0b; --primary-foreground:#110f0d; --secondary:rgba(242,237,228,.08);
      --border:rgba(242,237,228,.16); --warning:#f59e0b; --error:#f87171; --success:#34d399;
    }
    *{box-sizing:border-box}
    body{margin:0;background:var(--background);color:var(--foreground);font:13px/1.55 Inter,system-ui,-apple-system,sans-serif;display:grid;grid-template-columns:255px 330px 1fr;min-height:100vh;}
    .sidebar-sim{border-right:1px solid var(--border);padding:12px;background:color-mix(in srgb,var(--card) 94%,var(--background));display:flex;flex-direction:column;gap:8px;}
    .sim-hint{font-size:11px;line-height:1.45;color:var(--muted-foreground);margin:0 0 2px 0;}
    .conv-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 9px;border-radius:8px;border:1px solid var(--border);background:var(--card);font-size:12px;cursor:pointer;transition:border-color 120ms ease,background 120ms ease;}
    .conv-row:hover{border-color:color-mix(in srgb,var(--primary) 45%,var(--border));}
    .conv-row[data-active="1"]{border-color:color-mix(in srgb,var(--primary) 75%,transparent);background:color-mix(in srgb,var(--primary) 12%,var(--card));font-weight:600;}
    .conv-row[hidden]{display:none!important;}
    .badge{font-size:10px;padding:1px 6px;border-radius:999px;border:1px solid var(--border);color:var(--muted-foreground);flex:0 0 auto;}
    .badge.run{color:var(--primary);border-color:color-mix(in srgb,var(--primary) 50%,transparent);}
    .badge.await{color:var(--warning);border-color:color-mix(in srgb,var(--warning) 55%,transparent);}
    .badge.ok{color:var(--success);border-color:color-mix(in srgb,var(--success) 55%,transparent);}
    .badge.err{color:var(--error);border-color:color-mix(in srgb,var(--error) 55%,transparent);}
    aside.controls{border-right:1px solid var(--border);padding:14px;background:var(--card);display:flex;flex-direction:column;gap:10px;overflow-y:auto;max-height:100vh;}
    .ctl-group{border:1px solid var(--border);border-radius:10px;padding:9px 10px;background:color-mix(in srgb,var(--background) 55%,var(--card));display:flex;flex-direction:column;gap:7px;}
    .ctl-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center;}
    main{padding:18px 22px;display:flex;flex-direction:column;max-width:920px;width:100%;margin:0 auto;gap:12px;}
    .chat-header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-bottom:8px;border-bottom:1px solid var(--border);font-size:12.5px;font-weight:600;}
    .host-ui-zone{border:1px solid var(--border);border-radius:12px;padding:12px 14px;background:var(--card);display:flex;flex-direction:column;gap:9px;}
    .host-ui-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11.5px;color:var(--muted-foreground);}
    .host-nav-row{display:flex;flex-wrap:wrap;gap:6px;}
    .host-pill{padding:4px 9px;border-radius:8px;border:1px solid var(--border);background:var(--secondary);font-size:12px;font-weight:500;}
    .host-meta-row{display:flex;flex-wrap:wrap;gap:10px;font-size:12px;color:var(--muted-foreground);}
    .host-immunity-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding-top:6px;border-top:1px dashed var(--border);font-size:12px;}
    .slash-cmd{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;padding:2px 6px;border-radius:6px;background:color-mix(in srgb,var(--primary) 16%,transparent);color:var(--primary);font-weight:600;}
    .host-immunity-row code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;padding:2px 6px;border-radius:6px;background:var(--background);border:1px solid var(--border);}
    .approval-stage{display:flex;flex-direction:column;gap:8px;}
    .approval-stage:empty{display:none;}
    .approval-card{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:10px;border:1px solid color-mix(in srgb,var(--warning) 55%,var(--border));background:color-mix(in srgb,var(--warning) 10%,var(--card));font-size:12px;}
    .approval-card[data-demo-result="accepted"]{border-color:color-mix(in srgb,var(--success) 65%,var(--border));background:color-mix(in srgb,var(--success) 10%,var(--card));}
    .approval-card[data-demo-result="denied"]{border-color:color-mix(in srgb,var(--error) 65%,var(--border));background:color-mix(in srgb,var(--error) 10%,var(--card));}
    .quota-alert-banner{padding:9px 12px;border-radius:10px;border:1px solid color-mix(in srgb,var(--error) 60%,var(--border));background:color-mix(in srgb,var(--error) 12%,var(--card));color:var(--foreground);font-size:12px;display:flex;align-items:center;justify-content:space-between;gap:8px;}
    .quota-alert-banner[hidden]{display:none!important;}
    h1{font-size:15px;margin:0}
    h2{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted-foreground);margin:0}
    label{display:flex;flex-direction:column;gap:4px;font-size:12px;}
    input[type="range"]{width:100%}
    select,button.ctl{padding:5px 8px;border-radius:8px;border:1px solid var(--border);background:var(--secondary);color:var(--foreground);font:inherit;font-size:12px;cursor:pointer;}
    button.ctl.active{background:var(--primary);border-color:var(--primary);color:var(--primary-foreground);font-weight:600;}
    button.ctl.approve{background:var(--primary);border-color:var(--primary);color:var(--primary-foreground);font-weight:600;font-size:11.5px;padding:4px 10px;}
    button.ctl.danger{border-color:color-mix(in srgb,var(--error) 55%,var(--border));color:var(--error);}
    .hud-box{padding:7px 9px;border-radius:8px;border:1px solid var(--border);background:var(--background);font-size:11.5px;color:var(--muted-foreground);font-variant-numeric:tabular-nums;}
    .chat{flex:1;display:flex;flex-direction:column;gap:12px;border:1px solid var(--border);border-radius:14px;padding:16px;background:var(--card);}
    .bubble-u{align-self:flex-end;display:flex;align-items:center;gap:6px;background:color-mix(in srgb,var(--primary) 16%,transparent);border:1px solid color-mix(in srgb,var(--primary) 34%,transparent);padding:10px 13px;border-radius:12px;max-width:84%;}
    .bubble-a{align-self:flex-start;background:var(--secondary);border:1px solid var(--border);padding:10px 13px;border-radius:12px;max-width:88%;}
    .composer-wrap{margin-top:auto;}
    [data-testid="agent-input-box"]{border:1px solid var(--border);border-radius:14px;padding:10px 12px;background:var(--card);display:flex;flex-direction:column;gap:8px;}
    textarea{width:100%;min-height:58px;background:transparent;border:0;outline:none;color:var(--foreground);font:inherit;resize:vertical;}
    .composer-foot{display:flex;justify-content:space-between;align-items:center;font-size:11.5px;color:var(--muted-foreground);}
    pre.md-out{margin:0;padding:9px;border-radius:9px;border:1px solid var(--border);background:var(--background);color:var(--foreground);font:11px/1.45 ui-monospace,SFMono-Regular,monospace;max-height:190px;overflow:auto;white-space:pre-wrap;}
    .nov-mirror-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;}
    .nov-mirror-pill{display:flex;align-items:center;justify-content:space-between;gap:4px;padding:3px 6px;border-radius:6px;border:1px solid var(--border);background:var(--background);font-size:10.5px;color:var(--muted-foreground);transition:border-color 140ms ease,background 140ms ease,color 140ms ease;}
    .nov-mirror-pill[data-on="1"]{border-color:color-mix(in srgb,var(--success) 55%,transparent);background:color-mix(in srgb,var(--success) 12%,var(--background));color:var(--foreground);font-weight:600;}
    .nov-mirror-pill[data-net="1"][data-on="1"]{border-color:color-mix(in srgb,var(--warning) 60%,transparent);background:color-mix(in srgb,var(--warning) 14%,var(--background));color:var(--warning);}
    .sim-settings-dialog{border:1px solid var(--border);border-radius:14px;background:var(--card);overflow:hidden;}
    .sim-settings-dialog .p-6{padding:14px 16px;}
    .sim-settings-dialog .space-y-2{display:flex;flex-direction:column;gap:6px;}
    .sim-settings-dialog h2{font-size:13px;text-transform:none;letter-spacing:-.01em;color:var(--foreground);font-weight:600;}
    .sim-settings-sub{font-size:11px;color:var(--muted-foreground);}
  </style>
</head>
<body>
  <section class="sidebar-sim" data-ag-no-i18n="1">
    <h2>模拟侧边栏 · Session Radar (B)</h2>
    <p class="sim-hint">以下 4 条为模拟的 Antigravity 历史/并行会话，点击任意一条可切换右侧对话并测试独立书签、队列与审批状态。</p>
    <div data-testid="conversation-list-sidebar">
      <div class="conv-row" data-testid="conversation-row-sidebar" data-cascade-id="aaaaaaaa-1111-4111-8111-111111111111" data-status="awaiting_decision">
        <span data-testid="conversation-title">发布 PR 审批确认</span>
        <span class="badge await">待确认</span>
      </div>
      <div class="conv-row" data-testid="conversation-row-sidebar" data-cascade-id="11111111-2222-4333-8444-555555555555" data-status="running" data-active="1" id="sim-row-running">
        <span data-testid="conversation-title">重构遥测聚合引擎</span>
        <span class="badge run">运行中</span>
      </div>
      <div class="conv-row" data-testid="conversation-row-sidebar" data-cascade-id="cccccccc-3333-4333-8333-333333333333" data-status="idle">
        <span data-testid="conversation-title">v2.35 兼容性核验</span>
        <span class="badge">空闲</span>
      </div>
      <div class="conv-row" data-testid="conversation-row-sidebar" data-cascade-id="dddddddd-4444-4444-8444-444444444444" data-status="awaiting_decision">
        <span data-testid="conversation-title">子代理部署脚本核准</span>
        <span class="badge await">待确认</span>
      </div>
    </div>
    <button class="ctl" id="btn-sim-transition">模拟「运行中 → 待确认」跃迁（触发失焦通知）</button>
    <button class="ctl" id="btn-open-vault">打开跨会话书签档案库 (Ctrl+Shift+B)</button>
  </section>

  <aside class="controls" data-ag-no-i18n="1">
    <div>
      <h1>agy-Sag · Offline Workbench</h1>
      <div style="font-size:11.5px;color:var(--muted-foreground)">All-in-One 全模块离线交互沙盒 · 零碰实机</div>
    </div>

    <div class="ctl-group" id="preset-panel">
      <h2>一键场景预设 (Presets)</h2>
      <div class="ctl-row">
        <button class="ctl" data-preset-btn="essential">Essential</button>
        <button class="ctl" data-preset-btn="i18n-only">i18n Only</button>
        <button class="ctl" data-preset-btn="power">Power</button>
        <button class="ctl" data-preset-btn="full-auto">Full Auto</button>
      </div>
      <div class="hud-box" id="preset-hud">当前预设：自定义（全模块演示已挂载）</div>
    </div>

    <div class="ctl-group" id="nov-mirror-panel" data-testid="ag-sag-synergy-mirror">
      <h2>✦ 实时 agy-NOV 运行态镜像监视器</h2>
      <div class="hud-box" id="nov-mirror-hud">agy-NOV v0.2.0 · preset=core · 3/9 模块 · 12 工具</div>
      <div class="nov-mirror-grid" id="nov-mirror-grid"></div>
      <div class="ctl-row">
        <button class="ctl approve" id="btn-ext-nov-power">模拟外部 agy-NOV 切到 power 预设</button>
        <button class="ctl danger" id="btn-ext-nov-guard-off">模拟外部关闭 guard</button>
        <button class="ctl" id="btn-ext-nov-toggle-install">切换已安装/未安装态</button>
      </div>
    </div>

    <div class="ctl-group" id="host-i18n-panel">
      <h2>原生 UI 10 国语言热译 (Host i18n)</h2>
      <label>目标语言（右侧原生英文 UI 区块实时热译）
        <select id="host-lang-sel">
          <option value="en">en · English (还原原文)</option>
          <option value="zh-CN" selected>zh-CN · 简体中文</option>
          <option value="zh-TW">zh-TW · 繁體中文</option>
          <option value="ja">ja · 日本語</option>
          <option value="ko">ko · 한국어</option>
          <option value="es">es · Español</option>
          <option value="fr">fr · Français</option>
          <option value="de">de · Deutsch</option>
          <option value="ru">ru · Русский</option>
          <option value="pt-BR">pt-BR · Português (Brasil)</option>
        </select>
      </label>
      <div class="ctl-row">
        <button class="ctl" id="btn-demo-custom-pack">加载示例自定义语言包</button>
      </div>
      <div class="hud-box" id="host-i18n-hud">Host i18n：就绪</div>
    </div>

    <div class="ctl-group" id="queue-panel">
      <h2>提示词队列演示 (Prompt Queue)</h2>
      <div class="ctl-row">
        <button class="ctl" id="btn-queue-push">+ 塞入演示任务</button>
        <button class="ctl" id="btn-queue-stream-demo">流式结束→观察自动出队</button>
      </div>
      <div class="hud-box" id="queue-hud">队列状态：0 条待发</div>
    </div>

    <div class="ctl-group" id="auto-accept-panel">
      <h2>规则化自动审批演练 (Safe Auto-Accept)</h2>
      <label style="flex-direction:row;align-items:center;gap:8px">
        <input id="auto-accept-chk" type="checkbox" /> 开启 Safe Auto-Accept (<code>dev-flow</code>)
      </label>
      <div class="ctl-row">
        <button class="ctl" id="btn-spawn-safe-card">生成安全卡 (npm test)</button>
        <button class="ctl danger" id="btn-spawn-danger-card">生成高危卡 (rm -rf)</button>
        <button class="ctl" id="btn-clear-demo-cards">清空卡片</button>
      </div>
      <div class="hud-box" id="auto-accept-hud">审批审计：关闭态（需手动开启）</div>
    </div>

    <div class="ctl-group" id="theme-studio-panel">
      <h2>光学主题工坊 (Theme Studio · 0 :has())</h2>
      <label>光学主题预设
        <select id="theme-studio-sel">
          <option value="native" selected>native (宿主默认)</option>
          <option value="midnight-ink">midnight-ink (午夜墨蓝)</option>
          <option value="nord-frost">nord-frost (北欧霜蓝)</option>
          <option value="warm-paper">warm-paper (暖纸护眼)</option>
          <option value="oled-pure">oled-pure (纯黑 OLED)</option>
        </select>
      </label>
      <div class="ctl-row">
        <label style="flex-direction:row;align-items:center;gap:6px">
          <input id="cjk-font-chk" type="checkbox" checked /> CJK 字体优化
        </label>
        <select id="density-sel" aria-label="排版密度">
          <option value="compact">紧凑</option>
          <option value="balanced" selected>均衡</option>
          <option value="comfortable">舒展</option>
        </select>
      </div>
    </div>

    <div class="ctl-group" id="quota-pulse-panel">
      <h2>只读配额脉冲 (Quota Pulse)</h2>
      <div class="ctl-row">
        <button class="ctl danger" id="btn-sim-429">模拟 429 限流弹窗</button>
        <button class="ctl" id="btn-quota-turns">记录 +10 轮</button>
        <button class="ctl" id="btn-quota-reset">重置账本</button>
      </div>
      <div class="hud-box" id="quota-hud">配额健康：ok（纯只读本地账本）</div>
    </div>

    <div class="ctl-group" id="compact-watchdog-panel">
      <h2>压缩盾 · 燃尽监测 · 侧栏聚光</h2>
      <label>上下文占比：<strong id="pct-val">82%</strong> (可拖至 102%+)
        <input id="pct-slider" type="range" min="10" max="115" value="82" />
      </label>
      <div class="hud-box" id="burn-hud">燃尽监测：就绪（点下方按钮模拟增量或卡死）</div>
      <div class="ctl-row">
        <button class="ctl" id="btn-sim-step">模拟一轮 +9%</button>
        <button class="ctl" id="btn-sim-stall">模拟 3 分钟卡死</button>
      </div>
      <label style="flex-direction:row;align-items:center;gap:8px">
        <input id="stream-chk" type="checkbox" /> 模拟流式生成中（防打断）
      </label>
      <label style="flex-direction:row;align-items:center;gap:8px">
        <input id="radar-chk" type="checkbox" checked /> 开启左侧「侧栏聚光 (B)」
      </label>
      <label>宿主 CSS 变量兼容皮肤
        <select id="theme-sel">
          <option value="obsidian">Obsidian Dark</option>
          <option value="crystal">Daylight Crystal (Light)</option>
          <option value="alabaster">Warm Alabaster (Light)</option>
          <option value="warm">Warm Dark</option>
        </select>
      </label>
      <div class="ctl-row">
        <button class="ctl" id="btn-compact-sim">模拟压缩完成 (回落 18%)</button>
        <button class="ctl" id="btn-open-cfg">打开 ⚙ 设置浮窗</button>
        <button class="ctl" id="btn-remount">卸载重挂 (0 残留)</button>
      </div>
    </div>

    <h2>实时事件 / 审计与脱敏导出预览</h2>
    <pre class="md-out" id="log-out">就绪！上方可体验 10 国原生热译、一键预设、提示词队列、安全自动审批与配额脉冲。</pre>
  </aside>

  <main>
    <!-- 模拟 Antigravity 原生英文 UI 区块（供 Host i18n 实时热译与物理免疫验证） -->
    <section class="host-ui-zone" id="sim-host-ui-zone" data-testid="sim-host-ui-zone">
      <div class="host-ui-head" data-ag-no-i18n="1">
        <strong>模拟 Antigravity 原生英文 UI 区块 · Host i18n 热译与物理免疫演练</strong>
        <span id="host-i18n-badge" class="badge ok">10 Locales Live</span>
      </div>
      <div class="host-nav-row">
        <span class="host-pill" id="sim-ui-settings">Settings</span>
        <span class="host-pill" id="sim-ui-appearance">Appearance</span>
        <span class="host-pill" id="sim-ui-new-conv">New Conversation</span>
        <span class="host-pill" id="sim-ui-mcp">MCP Servers</span>
      </div>
      <div class="host-meta-row">
        <span id="sim-ui-files-changed">3 files changed</span>
        <span>·</span>
        <span id="sim-ui-thought-for">Thought for 6s</span>
        <span>·</span>
        <span id="sim-ui-resets-in">Resets in 2h 15m</span>
      </div>
      <div class="host-immunity-row">
        <span class="slash-cmd" id="sim-ui-slash-cmd">/compact</span>
        <span id="sim-ui-slash-desc">Compact conversation</span>
        <span data-ag-no-i18n="1" style="color:var(--muted-foreground)">|</span>
        <code id="sim-ui-code-block">const Settings = true;</code>
      </div>
    </section>

    <!-- 模拟 Antigravity 原生 Settings -> Appearance 面板（供 prism-bridge 直接挂载类 Prism 原生质感 agy-Sag 控制中心 + agy-NOV 双星联动） -->
    <section class="sim-settings-dialog" role="dialog" aria-label="Antigravity Settings" id="sim-native-settings">
      <div class="p-6">
        <div class="space-y-2">
          <h2>Appearance</h2>
          <div class="sim-settings-sub" data-ag-no-i18n="1">模拟 Antigravity 原生设置页 · 下方由 prism-bridge.js 自动注入内嵌式 agy-Sag 控制中心与 ✦ agy-NOV 双星热控区</div>
        </div>
      </div>
    </section>

    <!-- 模拟配额限流 Alert 弹窗（供 Quota Pulse 只读 DOM 监听验证） -->
    <div id="sim-quota-alert" class="quota-alert-banner" role="alert" hidden>
      <span id="sim-quota-alert-text">429 Rate limit · Resets in 1h 45m</span>
      <button type="button" class="ctl" id="btn-dismiss-quota-alert" data-ag-no-i18n="1">关闭弹窗</button>
    </div>

    <!-- 规则化自动审批演练舞台 -->
    <div id="sim-approval-stage" class="approval-stage"></div>

    <div class="chat" id="conv-view" data-testid="conversation-view" data-cascade-id="11111111-2222-4333-8444-555555555555"></div>
    <div class="composer-wrap">
      <div data-testid="agent-input-box">
        <textarea id="composer" placeholder="在此输入草稿可测试“草稿零覆盖保护”与提示词队列防抢占互锁..."></textarea>
        <div class="composer-foot" data-ag-no-i18n="1">
          <span id="ctx-status">Context: 82% (420K / 512K)</span>
          <div style="display:flex;gap:8px;align-items:center">
            <button id="stop-btn" class="ctl" data-testid="stop-button" hidden>Stop</button>
            <button id="send-btn" class="ctl" data-testid="send-button">Send</button>
          </div>
        </div>
      </div>
    </div>
  </main>
  <script>
${coreScript}
  </script>
  <script>
    const slider = document.getElementById('pct-slider');
    const pctVal = document.getElementById('pct-val');
    const ctxStatus = document.getElementById('ctx-status');
    const burnHud = document.getElementById('burn-hud');
    const presetHud = document.getElementById('preset-hud');
    const hostI18nHud = document.getElementById('host-i18n-hud');
    const hostI18nBadge = document.getElementById('host-i18n-badge');
    const queueHud = document.getElementById('queue-hud');
    const autoAcceptHud = document.getElementById('auto-accept-hud');
    const quotaHud = document.getElementById('quota-hud');
    const streamChk = document.getElementById('stream-chk');
    const radarChk = document.getElementById('radar-chk');
    const autoAcceptChk = document.getElementById('auto-accept-chk');
    const hostLangSel = document.getElementById('host-lang-sel');
    const themeStudioSel = document.getElementById('theme-studio-sel');
    const cjkFontChk = document.getElementById('cjk-font-chk');
    const densitySel = document.getElementById('density-sel');
    const stopBtn = document.getElementById('stop-btn');
    const logOut = document.getElementById('log-out');
    const composer = document.getElementById('composer');
    const convView = document.getElementById('conv-view');
    const approvalStage = document.getElementById('sim-approval-stage');
    const quotaAlertEl = document.getElementById('sim-quota-alert');
    let clockOffsetMs = 0;
    let demoTaskSeq = 0;

    const DEMO_QUEUE_TASKS = [
      '运行全部单测并汇总失败用例',
      '检查当前 git diff 的边界条件与安全隐患',
      '生成本次改动的中英文变更摘要',
    ];

    const SIM_SESSIONS = {
      '11111111-2222-4333-8444-555555555555': {
        title: '重构遥测聚合引擎',
        pct: 82,
        compactedCount: 0,
        awaitingPrompt: null,
        turns: [
          {
            u: 'Settings and New Conversation in user chat bubbles must remain untouched, and sk-testSecretKey1234567890 must be redacted.',
            a: '宿主协议未暴露压缩阈值字段，且 usedFraction 不封顶。建议在自定义阈值时浮条提前确认，并附带焦点指令一键 /compact。',
          },
          {
            u: '请把标星的关键架构结论先导出脱敏 Markdown，压缩完成后给我无损续接锚点。',
            a: '点击每轮提问右侧 ☆ 即可按会话持久化书签，压缩前静默留存锚点，压缩完成后自动弹出「填入续接提示」绿条。',
          },
          {
            u: '如果重启或新开了 Antigravity 窗口，怎么做到无感自动重挂？',
            a: '执行 npm run watch 即可启动零依赖 Watch Daemon：自适应退避探测 CDP 端口，窗口新建或重载后自动挂载，绝不触碰 app.asar。',
          },
        ],
      },
      'aaaaaaaa-1111-4111-8111-111111111111': {
        title: '发布 PR 审批确认',
        pct: 64,
        compactedCount: 0,
        awaitingPrompt: '子代理请求执行 git push origin feat/v235-fix 并创建 PR，等待你点击批准。',
        turns: [
          {
            u: '检查 PR #56 的单测与字节预算是否全部通过。',
            a: '全部单测通过，Channel 1 保持零 :has()，下一步需要你确认是否推送分支。',
          },
        ],
      },
      'cccccccc-3333-4333-8333-333333333333': {
        title: 'v2.35 兼容性核验',
        pct: 41,
        compactedCount: 0,
        awaitingPrompt: null,
        turns: [
          {
            u: '确认 Channel 1 字节预算上限与共存礼让协议。',
            a: '严格保持 0 :has() 与 __agSagOwner 自动礼让契约，已完成全量回归。',
          },
        ],
      },
      'dddddddd-4444-4444-8444-444444444444': {
        title: '子代理部署脚本核准',
        pct: 78,
        compactedCount: 0,
        awaitingPrompt: '子代理正在等待你批准执行数据库迁移校验命令（只读 dry-run）。',
        turns: [
          {
            u: '先跑一遍只读 dry-run 检查是否存在表锁风险。',
            a: '已生成校验命令，当前处于「待确认」状态，点击上方“模拟批准”后该会话将退出待确认列表。',
          },
        ],
      },
    };

    let activeCid = '11111111-2222-4333-8444-555555555555';

    (function seedDemoVault() {
      const demoCid = 'cccccccc-3333-4333-8333-333333333333';
      if (window.__agSgBookmarkVault && !window.__agSgBookmarkVault.loadSessionMeta(localStorage, demoCid)) {
        window.__agSgPrecompactExport.saveBookmarks(localStorage, demoCid, [1]);
        window.__agSgBookmarkVault.syncSessionMeta({
          storage: localStorage,
          cascadeId: demoCid,
          bookmarks: [1],
          title: 'v2.35 兼容性核验',
          turns: [{ turnNum: 1, user: '确认 Channel 1 字节预算上限与共存礼让协议。', assistant: '严格保持 0 :has() 与 __agSagOwner 自动礼让契约。' }],
        });
      }
    })();

    function appendLog(line) {
      logOut.textContent = line;
    }

    function renderConversation(cid) {
      const sess = SIM_SESSIONS[cid];
      if (!sess) return;
      activeCid = cid;
      convView.setAttribute('data-cascade-id', cid);
      slider.value = String(sess.pct);
      while (convView.firstChild) convView.removeChild(convView.firstChild);

      const header = document.createElement('div');
      header.className = 'chat-header';
      header.setAttribute('data-ag-no-i18n', '1');
      header.textContent = '当前模拟会话：' + sess.title + ' (' + cid.slice(0, 8) + ')';
      convView.appendChild(header);

      const rowEl = document.querySelector('[data-testid="conversation-row-sidebar"][data-cascade-id="' + cid + '"]');
      if (sess.awaitingPrompt && rowEl && rowEl.getAttribute('data-status') === 'awaiting_decision') {
        const card = document.createElement('div');
        card.className = 'approval-card';
        card.setAttribute('data-ag-no-i18n', '1');
        const txt = document.createElement('span');
        txt.textContent = '⏳ 待确认：' + sess.awaitingPrompt;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ctl approve';
        btn.textContent = '模拟批准（清除待确认）';
        btn.addEventListener('click', () => {
          rowEl.setAttribute('data-status', 'idle');
          const b = rowEl.querySelector('.badge');
          if (b) { b.className = 'badge'; b.textContent = '空闲'; }
          sess.awaitingPrompt = null;
          card.remove();
          guard.sessionRadar.syncFromDom();
          appendLog('[APPROVED] 已批准「' + sess.title + '」，左侧雷达「待确认」数量已实时减一。');
        });
        card.appendChild(txt);
        card.appendChild(btn);
        convView.appendChild(card);
      }

      for (const t of sess.turns) {
        const bu = document.createElement('div');
        bu.className = 'bubble-u';
        bu.setAttribute('data-testid', 'user-message-bubble');
        const sp = document.createElement('span');
        sp.textContent = t.u;
        bu.appendChild(sp);

        const ba = document.createElement('div');
        ba.className = 'bubble-a';
        ba.setAttribute('data-testid', 'agent-response');
        ba.textContent = t.a;

        convView.appendChild(bu);
        convView.appendChild(ba);
      }

      document.querySelectorAll('[data-testid="conversation-row-sidebar"]').forEach((r) => {
        r.setAttribute('data-active', r.getAttribute('data-cascade-id') === cid ? '1' : '0');
      });
    }

    function getSimSnap() {
      const sess = SIM_SESSIONS[activeCid];
      const pct = Number(slider.value);
      if (sess) sess.pct = pct;
      const maxTokens = 512000;
      const usedTokens = Math.round((pct / 100) * maxTokens);
      pctVal.textContent = pct + '%';
      ctxStatus.textContent = 'Context: ' + pct + '% (' + Math.round(usedTokens / 1000) + 'K / 512K)';
      return {
        cascadeId: activeCid,
        usedFraction: pct / 100,
        usedTokens,
        maxTokens,
        streaming: streamChk.checked,
        compactedCount: sess ? sess.compactedCount : 0,
      };
    }

    function refreshModuleHuds() {
      if (!guard) return;
      const cfg = guard.getConfig();
      const dbg = guard.getDebugState();

      // Watchdog HUD
      const wd = dbg.compactGuard?.watchdog;
      if (wd) {
        if (wd.stalled) {
          burnHud.textContent = '⚠ 疑似卡死：已停滞 ' + wd.stalledForSec + 's 无新输出';
        } else if (wd.avgDeltaPct > 0) {
          const eta = wd.estimatedTurnsLeft > 0 ? ' · 约剩 ' + wd.estimatedTurnsLeft + ' 轮达阈值' : ' · 已达阈值';
          const spike = wd.spikeDetected ? ' · 突增 +' + wd.lastDeltaPct + '%' : '';
          burnHud.textContent = '燃速均增 +' + wd.avgDeltaPct + '%/轮' + eta + spike;
        } else {
          burnHud.textContent = '燃尽监测：等待多轮增量样本（点击“模拟一轮 +9%”）';
        }
      }

      // Host i18n HUD
      const hi = dbg.hostI18n;
      if (hi) {
        hostI18nHud.textContent = hi.active
          ? '已热译 -> ' + hi.locale + '（追踪文本节点 ' + hi.trackedTextCount + '，代码块与 /compact 免疫）'
          : '已还原原文 (' + hi.locale + ') · 追踪节点 ' + hi.trackedTextCount;
        hostI18nBadge.textContent = hi.active ? hi.locale + ' Active' : 'Original EN';
      }

      // Prompt Queue HUD
      const pq = dbg.promptQueue;
      if (pq) {
        const reason = pq.lastSkipReason ? ' · 等待原因: ' + pq.lastSkipReason : '';
        queueHud.textContent = '队列: ' + pq.itemCount + ' 条待发 | 已自动出队 ' + pq.dispatchedCount + ' 次' + reason;
      }

      // Safe Auto-Accept HUD
      const aa = dbg.safeAutoAccept;
      if (aa) {
        autoAcceptChk.checked = Boolean(aa.enabled);
        autoAcceptHud.textContent = aa.enabled
          ? '已开启 (' + aa.policy + ') · 放行 ' + aa.totalAccepted + ' | 铁壁拦截 ' + aa.totalDeniedHard + ' | 跳过 ' + aa.totalSkippedPolicy
          : '关闭态（勾选上方开关启用 dev-flow 演练）';
      }

      // Quota Pulse HUD
      const qp = guard.quotaPulse?.getSummary?.();
      if (qp) {
        const resetTxt = qp.observed?.remainingSec ? ' · 重置倒计时 ' + Math.round(qp.observed.remainingSec / 60) + 'm' : '';
        quotaHud.textContent =
          '健康度: ' + qp.health +
          ' | 5h: ' + qp.localEstimate.turns5h + '/' + qp.limits.softTurns5h +
          ' | 7d: ' + qp.localEstimate.turns7d + '/' + qp.limits.softTurns7d +
          resetTxt;
      }

      radarChk.checked = Boolean(cfg.modules?.sessionRadar);
    }

    function spawnDemoApprovalCard(kind) {
      const isSafe = kind === 'safe';
      const cmdText = isSafe ? 'npm test' : 'rm -rf /tmp/prod';
      const card = document.createElement('div');
      card.className = 'approval-card';
      card.setAttribute('data-testid', 'demo-approval-card-' + kind);
      card.setAttribute('data-ag-no-i18n', '1');

      const body = document.createElement('div');
      body.textContent = cmdText;

      const acts = document.createElement('div');
      acts.className = 'ctl-row';

      const statusBadge = document.createElement('span');
      statusBadge.className = 'badge ' + (isSafe ? 'await' : 'err');
      statusBadge.textContent = isSafe ? '待审批 (安全命令)' : '待审批 (高危命令)';

      const runBtn = document.createElement('button');
      runBtn.type = 'button';
      runBtn.className = 'ctl approve';
      runBtn.textContent = 'Run';
      runBtn.addEventListener('click', () => {
        card.setAttribute('data-demo-result', 'accepted');
        statusBadge.className = 'badge ok';
        statusBadge.textContent = '已放行';
        runBtn.disabled = true;
        appendLog('[APPROVAL EXECUTED] 命令已执行: ' + cmdText);
      });

      const denyBtn = document.createElement('button');
      denyBtn.type = 'button';
      denyBtn.className = 'ctl';
      denyBtn.textContent = 'Deny';
      denyBtn.addEventListener('click', () => {
        card.remove();
        guard.promptQueue?.sync?.();
      });

      acts.appendChild(statusBadge);
      acts.appendChild(runBtn);
      acts.appendChild(denyBtn);
      card.appendChild(body);
      card.appendChild(acts);
      approvalStage.appendChild(card);

      if (guard.getConfig().modules?.safeAutoAccept) {
        const res = guard.safeAutoAccept.scanNow();
        if (!isSafe && res.deniedHard > 0) {
          card.setAttribute('data-demo-result', 'denied');
          statusBadge.className = 'badge err';
          statusBadge.textContent = '铁壁黑名单已强制拦截';
        }
      }
      refreshModuleHuds();
    }

    // Simulated in-memory agy-NOV v0.2.0 runtime + bidirectional novTransport
    const novMirrorHud = document.getElementById('nov-mirror-hud');
    const novMirrorGrid = document.getElementById('nov-mirror-grid');
    const simNov = {
      installed: true,
      version: '0.2.0',
      config: {
        schemaVersion: 1,
        preset: 'core',
        locale: 'auto',
        defaultTab: 'review',
        modules: {
          review: true,
          guard: true,
          xray: true,
          turbo: false,
          radar: false,
          canvas: false,
          mem: false,
          ops: false,
          remote: false,
        },
      },
    };

    function getSimNovSnapshot() {
      const modApi = window.__agSagNovSynergy;
      const preset = modApi?.detectNovPreset ? modApi.detectNovPreset(simNov.config.modules) : simNov.config.preset;
      simNov.config.preset = preset;
      const enabledCount = simNov.installed && modApi?.countEnabledNovModules ? modApi.countEnabledNovModules(simNov.config.modules) : 0;
      const toolCount = simNov.installed && modApi?.countNovModelTools ? modApi.countNovModelTools(simNov.config.modules) : 0;
      return {
        installed: simNov.installed,
        version: simNov.version,
        enabledCount,
        toolCount,
        config: {
          ...simNov.config,
          modules: { ...simNov.config.modules },
        },
      };
    }

    function renderNovMirror() {
      const snap = getSimNovSnapshot();
      const metas = window.__agSagNovSynergy?.NOV_MODULES_META || [];
      if (!snap.installed) {
        novMirrorHud.textContent = '模拟状态：未安装 agy-NOV（右侧面板展示搭档推荐卡片）';
      } else {
        novMirrorHud.textContent =
          'agy-NOV v' + snap.version +
          ' · preset=' + snap.config.preset +
          ' · ' + snap.enabledCount + '/9 模块 · ' + snap.toolCount + ' 工具';
      }
      while (novMirrorGrid.firstChild) novMirrorGrid.removeChild(novMirrorGrid.firstChild);
      for (const m of metas) {
        const pill = document.createElement('div');
        pill.className = 'nov-mirror-pill';
        const isOn = snap.installed && Boolean(snap.config.modules[m.id]);
        pill.setAttribute('data-nov-mirror-mod', m.id);
        pill.setAttribute('data-on', isOn ? '1' : '0');
        pill.setAttribute('data-net', m.privacy === 'opt-in-network' ? '1' : '0');
        const nameSpan = document.createElement('span');
        nameSpan.textContent = m.id;
        const stateSpan = document.createElement('span');
        stateSpan.textContent = isOn ? 'ON' : 'OFF';
        pill.appendChild(nameSpan);
        pill.appendChild(stateSpan);
        novMirrorGrid.appendChild(pill);
      }
    }

    function pushSimNovState(reasonLabel) {
      const state = getSimNovSnapshot();
      renderNovMirror();
      window.__agSagBridgeReceiver?.onPush?.({ event: 'nov:state', state });
      appendLog('[AGY-NOV PUSH] ' + reasonLabel + ' -> preset=' + state.config.preset + ' (' + state.enabledCount + '/9 ON, ' + state.toolCount + ' tools)');
    }

    function simNovTransport(req) {
      const { reqId, type, payload = {} } = req || {};
      const modApi = window.__agSagNovSynergy;
      if (type === 'nov:set_module' && simNov.installed) {
        if (Object.prototype.hasOwnProperty.call(simNov.config.modules, payload.moduleId)) {
          simNov.config.modules[payload.moduleId] = Boolean(payload.enabled);
        }
        renderNovMirror();
        appendLog('[AGY-NOV BRIDGE] agy-Sag 热切 agy-NOV.' + payload.moduleId + ' -> ' + (payload.enabled ? 'ON' : 'OFF'));
      } else if (type === 'nov:apply_preset' && simNov.installed) {
        const presetDef = modApi?.NOV_PRESETS_MAP?.[payload.preset];
        if (presetDef) {
          simNov.config.modules = { ...presetDef.modules };
          simNov.config.preset = presetDef.id;
        }
        renderNovMirror();
        appendLog('[AGY-NOV BRIDGE] agy-Sag 切换 agy-NOV 预设 -> ' + payload.preset);
      } else if (type === 'nov:set_locale' && simNov.installed) {
        simNov.config.locale = String(payload.locale || 'auto');
        renderNovMirror();
      } else {
        renderNovMirror();
      }
      return { ok: true, reqId, state: getSimNovSnapshot() };
    }

    function mountGuard() {
      const mountFn = window.__agSagCore?.mountSag || window.__agSgCore?.mountSag || window.__agSgCore.mountSessionGuard;
      return mountFn({
        win: window,
        doc: document,
        autoPoll: false,
        autoObserve: false,
        now: () => Date.now() + clockOffsetMs,
        promptQueueDispatchDelayMs: 400,
        autoAcceptCooldownMs: 250,
        novTransport: simNovTransport,
        onNovStateChange: () => {
          renderNovMirror();
          refreshModuleHuds();
        },
        onCopyText: (txt) => {
          appendLog('[COPIED INSTALL CMD] ' + txt);
          try { navigator.clipboard?.writeText?.(txt); } catch {}
        },
        config: {
          compactThreshold: 80,
          compactTriggerMode: 'confirm',
          compactFocusPreset: 'code-errors',
          stallThresholdSeconds: 180,
          radarNotifyMode: 'all',
          hostI18nLocale: hostLangSel.value,
          autoAcceptPolicy: 'dev-flow',
          themePreset: themeStudioSel.value,
          themeCjkFont: cjkFontChk.checked,
          themeDensity: densitySel.value,
          modules: {
            hostI18n: hostLangSel.value !== 'en',
            compactGuard: true,
            precompactExport: true,
            draftGuard: true,
            promptQueue: true,
            outlineBookmarks: true,
            sessionRadar: radarChk.checked,
            sessionWatchdog: true,
            safeAutoAccept: autoAcceptChk.checked,
            themeStudio: themeStudioSel.value !== 'native',
            quotaPulse: true,
          },
        },
        getContextSnapshot: () => getSimSnap(),
        onSubmitCompact: ({ command, preset }) => {
          appendLog('[SUBMIT /compact] preset=' + preset + ' at ' + slider.value + '%\\n' + command);
          composer.value = '';
        },
        onExportMarkdown: ({ markdown, filename, downloaded }) => {
          appendLog((downloaded && filename ? '[DOWNLOAD .MD] ' + filename + '\\n\\n' : '') + markdown);
        },
        onRecoveryFill: (snap) => {
          appendLog('[POST-COMPACT RECOVERY FILLED]\\n' + snap.prompt);
        },
        onStallDetected: (ev) => {
          appendLog('[STALL WATCHDOG] Session ' + ev.cascadeId.slice(0, 8) + ' stalled for ' + ev.stalledForSec + 's');
        },
        onRadarNotify: (ev) => {
          appendLog('[BLURRED OS ALERT] ' + ev.notifTitle + '\\n→ ' + ev.notifBody);
        },
        onPromptQueueDispatch: (item) => {
          const sess = SIM_SESSIONS[activeCid];
          if (sess) {
            sess.turns.push({ u: item.text, a: '（已由 Prompt Queue 自动出队发送并收到模拟回复）' });
            renderConversation(activeCid);
          }
          appendLog('[PROMPT QUEUE AUTO-DISPATCH] 已自动出队发送：' + item.text);
          refreshModuleHuds();
          return { ok: true };
        },
        onPromptQueueChange: () => {
          refreshModuleHuds();
        },
        onAutoAcceptDecision: (ev) => {
          appendLog(
            '[SAFE AUTO-ACCEPT AUDIT] decision=' + ev.decision +
            ' | reason=' + ev.reason +
            ' | policy=' + ev.policy +
            ' | cmd=' + ev.snippet
          );
          refreshModuleHuds();
        },
      });
    }

    renderConversation(activeCid);
    renderNovMirror();
    let guard = mountGuard();
    guard.evaluateNow().then(refreshModuleHuds);

    document.getElementById('btn-ext-nov-power').addEventListener('click', () => {
      simNov.installed = true;
      const powerDef = window.__agSagNovSynergy?.NOV_PRESETS_MAP?.power;
      if (powerDef) {
        simNov.config.modules = { ...powerDef.modules };
        simNov.config.preset = 'power';
      }
      pushSimNovState('外部 agy-NOV 切换至 power 预设（含 radar，可观察防重提醒联动）');
    });

    document.getElementById('btn-ext-nov-guard-off').addEventListener('click', () => {
      simNov.installed = true;
      simNov.config.modules.guard = false;
      pushSimNovState('外部 agy-NOV 关闭 guard（若开启 Auto-Accept 将触发双层护盾推荐）');
    });

    document.getElementById('btn-ext-nov-toggle-install').addEventListener('click', () => {
      simNov.installed = !simNov.installed;
      pushSimNovState(simNov.installed ? '恢复模拟本地已安装 agy-NOV v0.2.0' : '切换为未安装 agy-NOV（展示双星搭档推荐卡片）');
    });

    document.querySelectorAll('[data-preset-btn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-preset-btn');
        const next = guard.applyPreset(id);
        if (!next) return;
        document.querySelectorAll('[data-preset-btn]').forEach((b) => {
          b.classList.toggle('active', b === btn);
        });
        const enabledList = Object.entries(next.modules).filter(([, v]) => v).map(([k]) => k);
        presetHud.textContent = '已应用预设：' + id + '（启用 ' + enabledList.length + ' 项：' + enabledList.join(', ') + '）';
        appendLog('[PRESET APPLIED] ' + id + ' -> ' + JSON.stringify(next.modules, null, 2));
        guard.evaluateNow().then(refreshModuleHuds);
      });
    });

    hostLangSel.addEventListener('change', () => {
      const loc = hostLangSel.value;
      guard.setHostLocale(loc);
      const uiLang = ['zh-CN', 'zh-TW', 'yue', 'en', 'ja', 'ko', 'es', 'fr', 'de'].includes(loc) ? loc : 'en';
      document.documentElement.setAttribute('data-ag-cs-lang', uiLang);
      guard.prismBridge?.sync?.();
      guard.evaluateNow().then(refreshModuleHuds);
      appendLog('[HOST I18N] 已切换原生 UI 语言 -> ' + loc + '（代码块与 /compact 保持原样）');
    });

    document.getElementById('btn-demo-custom-pack')?.addEventListener('click', () => {
      const targetLoc = hostLangSel.value && hostLangSel.value !== 'en' ? hostLangSel.value : 'zh-CN';
      const samplePack = {
        locale: targetLoc,
        exact: {
          Settings: targetLoc === 'zh-TW' ? '偏好設定 (自訂)' : targetLoc === 'zh-CN' ? '系统偏好 (自定义)' : 'Settings (' + targetLoc + ' Custom)',
          Appearance: targetLoc === 'zh-TW' ? '視覺外觀 (自訂)' : targetLoc === 'zh-CN' ? '视觉外观 (自定义)' : 'Appearance (' + targetLoc + ' Custom)',
        },
        patterns: [
          { source: '^(\\\\d+)\\\\s+files\\\\s+changed$', flags: 'i', replace: '[自定义] 变更 {1} 个文件' },
        ],
      };
      if (hostLangSel.value === 'en') {
        hostLangSel.value = 'zh-CN';
        guard.setHostLocale('zh-CN');
        document.documentElement.setAttribute('data-ag-cs-lang', 'zh-CN');
      }
      const res = guard.importCustomHostPack?.(samplePack);
      guard.evaluateNow().then(refreshModuleHuds);
      appendLog('[HOST I18N CUSTOM PACK] ' + JSON.stringify(res));
    });

    document.getElementById('btn-queue-push').addEventListener('click', () => {
      const task = DEMO_QUEUE_TASKS[demoTaskSeq % DEMO_QUEUE_TASKS.length];
      demoTaskSeq += 1;
      if (!guard.getConfig().modules?.promptQueue) {
        guard.updateConfig({ modules: { ...guard.getConfig().modules, promptQueue: true } });
      }
      streamChk.checked = true;
      stopBtn.hidden = false;
      guard.promptQueue.togglePanel(true);
      guard.promptQueue.enqueue(task + ' (#' + demoTaskSeq + ')');
      guard.evaluateNow().then(refreshModuleHuds);
      appendLog('[PROMPT QUEUE] 流式进行中，任务已安全入队：' + task + ' (#' + demoTaskSeq + ')');
    });

    document.getElementById('btn-queue-stream-demo').addEventListener('click', () => {
      if (!guard.getConfig().modules?.promptQueue) {
        guard.updateConfig({ modules: { ...guard.getConfig().modules, promptQueue: true } });
      }
      if (guard.promptQueue.getItems().length === 0) {
        streamChk.checked = true;
        stopBtn.hidden = false;
        guard.promptQueue.togglePanel(true);
        guard.promptQueue.enqueue(DEMO_QUEUE_TASKS[0]);
      }
      composer.value = '';
      approvalStage.innerHTML = '';
      streamChk.checked = false;
      stopBtn.hidden = true;
      guard.evaluateNow().then(refreshModuleHuds);
      appendLog('[PROMPT QUEUE] 流式已结束，将在 400ms 防抖后自动出队发送...');
    });

    autoAcceptChk.addEventListener('change', () => {
      const cur = guard.getConfig();
      guard.updateConfig({
        autoAcceptPolicy: 'dev-flow',
        modules: { ...cur.modules, safeAutoAccept: autoAcceptChk.checked },
      });
      if (autoAcceptChk.checked) {
        guard.safeAutoAccept.scanNow();
      }
      refreshModuleHuds();
      appendLog('[SAFE AUTO-ACCEPT] 已' + (autoAcceptChk.checked ? '开启 (policy=dev-flow)' : '关闭'));
    });

    document.getElementById('btn-spawn-safe-card').addEventListener('click', () => spawnDemoApprovalCard('safe'));
    document.getElementById('btn-spawn-danger-card').addEventListener('click', () => spawnDemoApprovalCard('danger'));
    document.getElementById('btn-clear-demo-cards').addEventListener('click', () => {
      approvalStage.innerHTML = '';
      guard.promptQueue?.sync?.();
      refreshModuleHuds();
    });

    function applyThemeStudioControls() {
      const cur = guard.getConfig();
      guard.updateConfig({
        themePreset: themeStudioSel.value,
        themeCjkFont: cjkFontChk.checked,
        themeDensity: densitySel.value,
        modules: { ...cur.modules, themeStudio: true },
      });
      refreshModuleHuds();
      appendLog('[THEME STUDIO] preset=' + themeStudioSel.value + ' | cjk=' + cjkFontChk.checked + ' | density=' + densitySel.value);
    }
    themeStudioSel.addEventListener('change', applyThemeStudioControls);
    cjkFontChk.addEventListener('change', applyThemeStudioControls);
    densitySel.addEventListener('change', applyThemeStudioControls);

    document.getElementById('btn-sim-429').addEventListener('click', () => {
      const cur = guard.getConfig();
      if (!cur.modules?.quotaPulse) {
        guard.updateConfig({ modules: { ...cur.modules, quotaPulse: true } });
      }
      quotaAlertEl.hidden = false;
      const scan = guard.quotaPulse.scanDomForSignals();
      const summary = guard.quotaPulse.getSummary();
      refreshModuleHuds();
      appendLog('[QUOTA PULSE 429] health=' + summary.health + ' | matched=' + Boolean(scan.matched) + ' | remainingSec=' + summary.observed.remainingSec + ' | advice=' + summary.adviceKey);
    });

    document.getElementById('btn-dismiss-quota-alert').addEventListener('click', () => {
      quotaAlertEl.hidden = true;
    });

    document.getElementById('btn-quota-turns').addEventListener('click', () => {
      const cur = guard.getConfig();
      if (!cur.modules?.quotaPulse) {
        guard.updateConfig({ modules: { ...cur.modules, quotaPulse: true } });
      }
      for (let i = 0; i < 10; i++) {
        guard.quotaPulse.recordTurn({ deltaTokens: 6500 });
      }
      const summary = guard.quotaPulse.getSummary();
      refreshModuleHuds();
      appendLog('[QUOTA PULSE] +10 turns recorded -> 5h=' + summary.localEstimate.turns5h + '/' + summary.limits.softTurns5h + ' | health=' + summary.health);
    });

    document.getElementById('btn-quota-reset').addEventListener('click', () => {
      quotaAlertEl.hidden = true;
      guard.quotaPulse.resetLedger();
      refreshModuleHuds();
      appendLog('[QUOTA PULSE] 配额账本与限流状态已重置。');
    });

    document.querySelectorAll('[data-testid="conversation-row-sidebar"]').forEach((row) => {
      row.addEventListener('click', () => {
        const cid = row.getAttribute('data-cascade-id');
        if (!cid || !SIM_SESSIONS[cid]) return;
        renderConversation(cid);
        guard.evaluateNow().then(refreshModuleHuds);
        appendLog('[SWITCH SESSION] 已切换到模拟会话：' + SIM_SESSIONS[cid].title);
      });
    });

    slider.addEventListener('input', () => guard.evaluateNow().then(refreshModuleHuds));
    streamChk.addEventListener('change', () => {
      stopBtn.hidden = !streamChk.checked;
      guard.evaluateNow().then(refreshModuleHuds);
    });
    radarChk.addEventListener('change', () => {
      const cur = guard.getConfig();
      guard.updateConfig({ modules: { ...cur.modules, sessionRadar: radarChk.checked } });
      guard.evaluateNow().then(refreshModuleHuds);
    });
    document.getElementById('theme-sel').addEventListener('change', (e) => {
      document.documentElement.setAttribute('data-theme', e.target.value);
    });
    document.getElementById('btn-sim-step').addEventListener('click', () => {
      const next = Math.min(115, Number(slider.value) + 9);
      slider.value = String(next);
      guard.evaluateNow().then(refreshModuleHuds);
    });
    document.getElementById('btn-sim-stall').addEventListener('click', async () => {
      streamChk.checked = true;
      stopBtn.hidden = false;
      slider.value = '55';
      await guard.evaluateNow();
      clockOffsetMs += 195_000;
      await guard.evaluateNow();
      refreshModuleHuds();
    });
    document.getElementById('btn-compact-sim').addEventListener('click', () => {
      guard.compactGuard.captureRecoverySnapshot();
      const sess = SIM_SESSIONS[activeCid];
      if (sess) sess.compactedCount += 1;
      streamChk.checked = false;
      stopBtn.hidden = true;
      slider.value = '18';
      guard.evaluateNow().then(refreshModuleHuds);
      appendLog('[COMPACTED #' + (sess ? sess.compactedCount : 1) + '] Context reset to 18%. Post-Compact Recovery strip ready!');
    });
    document.getElementById('btn-open-cfg').addEventListener('click', () => guard.openSettingsPopover());
    document.getElementById('btn-open-vault').addEventListener('click', () => guard.openBookmarkVault());
    document.getElementById('btn-sim-transition').addEventListener('click', () => {
      const row = document.getElementById('sim-row-running');
      const next = row.getAttribute('data-status') === 'running' ? 'awaiting_decision' : 'running';
      row.setAttribute('data-status', next);
      const badge = row.querySelector('.badge');
      badge.className = next === 'running' ? 'badge run' : 'badge await';
      badge.textContent = next === 'running' ? '运行中' : '待确认';
      document.documentElement.setAttribute('data-ag-cs-win-blur', '1');
      guard.sessionRadar.syncFromDom();
      document.documentElement.removeAttribute('data-ag-cs-win-blur');
    });
    document.getElementById('btn-remount').addEventListener('click', () => {
      guard.destroy();
      const leftover = document.querySelectorAll('[data-ag-sg-owned="1"], [data-ag-sag-owned="1"]').length;
      guard = mountGuard();
      guard.evaluateNow().then(refreshModuleHuds);
      appendLog('[TEARDOWN TEST] Leftover owned nodes after destroy(): ' + leftover + ' -> Re-mounted cleanly.');
    });
  </script>
</body>
</html>`;
}

export function startWorkbenchServer(port = DEFAULT_PORT) {
  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buildHtmlPage());
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

export async function runWorkbenchSmoke() {
  const srv = await startWorkbenchServer(0);
  try {
    const { port } = srv.address();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();
    const missing = SMOKE_REQUIRED_MARKERS.filter((m) => !html.includes(m));
    if (res.status !== 200 || missing.length > 0) {
      throw new Error(`Unexpected smoke response: status=${res.status}, missing=[${missing.join(', ')}]`);
    }
    const bytes = Buffer.byteLength(html, 'utf8');
    console.log(`[agy-Sag] Workbench smoke OK (HTTP ${res.status}, ${bytes} B, ${SMOKE_REQUIRED_MARKERS.length} markers verified)`);
    return { ok: true, status: res.status, bytes, markers: SMOKE_REQUIRED_MARKERS };
  } finally {
    srv.close();
  }
}

export async function runWorkbenchCli(argv = process.argv.slice(2)) {
  if (argv.includes('--smoke')) {
    return runWorkbenchSmoke();
  }
  const portArg = argv.find((a) => a.startsWith('--port='));
  const port = portArg ? Number(portArg.slice('--port='.length)) : DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid --port value: ${portArg}`);
  }
  const srv = await startWorkbenchServer(port);
  const actualPort = srv.address()?.port ?? port;
  console.log(`[agy-Sag] All-in-One Offline Workbench listening at http://127.0.0.1:${actualPort}`);
  return srv;
}

const isEntry = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isEntry) {
  runWorkbenchCli(process.argv.slice(2)).catch((err) => {
    console.error('[agy-Sag] Workbench failed:', err?.message || err);
    process.exitCode = 1;
  });
}
