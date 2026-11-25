#!/usr/bin/env node
/**
 * Antigravity Session Guard — Offline Interactive Preview Workbench (v0.3)
 *
 * Previews all modules offline without touching any live Antigravity instance:
 *   - Module G: Compact Guard (10% -> 115% slider, 102% overflow alert, 5s countdown, draft & streaming guards, ↓ .md download)
 *   - Module D: Turn Bookmarks + Native Floating ★ N Jump Drawer (star turns -> jump with pulse -> Copy / Download ★ .md)
 *   - Module B: Session Radar (sidebar All/Running/Awaiting filter pill + simulated blurred-window notification)
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCoreSources } from '../cli/bundle.mjs';

const DEFAULT_PORT = 4179;

function buildHtmlPage() {
  const coreScript = readCoreSources()
    .map((p) => `/* ${p.file} */\n${p.code}`)
    .join('\n;\n');

  return `<!doctype html>
<html lang="zh-CN" data-ag-cs-lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Antigravity Session Guard · Offline Workbench v0.3</title>
  <style>
    :root{
      --background:#0b0d13; --card:#131722; --foreground:#eef1f7; --muted-foreground:#94a3b8;
      --primary:#3186ff; --primary-foreground:#ffffff; --secondary:rgba(148,163,184,.14);
      --border:rgba(148,163,184,.24); --warning:#f59e0b; --error:#ef4444; --success:#34d399;
    }
    html[data-theme="crystal"]{
      --background:#f3f6fb; --card:#ffffff; --foreground:#0f172a; --muted-foreground:#475569;
      --primary:#2563eb; --primary-foreground:#ffffff; --secondary:rgba(15,23,42,.06);
      --border:rgba(15,23,42,.12); --warning:#d97706; --error:#dc2626; --success:#059669;
    }
    html[data-theme="alabaster"]{
      --background:#f5f2eb; --card:#faf8f3; --foreground:#1c1917; --muted-foreground:#57534e;
      --primary:#b45309; --primary-foreground:#ffffff; --secondary:rgba(68,52,32,.07);
      --border:rgba(68,52,32,.14); --warning:#d97706; --error:#dc2626; --success:#059669;
    }
    html[data-theme="warm"]{
      --background:#110f0d; --card:#1b1714; --foreground:#f2ede4; --muted-foreground:#a89f91;
      --primary:#f59e0b; --primary-foreground:#110f0d; --secondary:rgba(242,237,228,.08);
      --border:rgba(242,237,228,.16); --warning:#f59e0b; --error:#f87171; --success:#34d399;
    }
    *{box-sizing:border-box}
    body{margin:0;background:var(--background);color:var(--foreground);font:13px/1.55 Inter,system-ui,-apple-system,sans-serif;display:grid;grid-template-columns:250px 270px 1fr;min-height:100vh;}
    .sidebar-sim{border-right:1px solid var(--border);padding:12px;background:color-mix(in srgb,var(--card) 94%,var(--background));display:flex;flex-direction:column;gap:8px;}
    .conv-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 9px;border-radius:8px;border:1px solid var(--border);background:var(--card);font-size:12px;cursor:pointer;}
    .conv-row[hidden]{display:none!important;}
    .badge{font-size:10px;padding:1px 6px;border-radius:999px;border:1px solid var(--border);color:var(--muted-foreground);}
    .badge.run{color:var(--primary);border-color:color-mix(in srgb,var(--primary) 50%,transparent);}
    .badge.await{color:var(--warning);border-color:color-mix(in srgb,var(--warning) 55%,transparent);}
    aside.controls{border-right:1px solid var(--border);padding:16px;background:var(--card);display:flex;flex-direction:column;gap:12px;}
    main{padding:20px 24px;display:flex;flex-direction:column;max-width:860px;width:100%;margin:0 auto;gap:14px;}
    h1{font-size:15px;margin:0}
    h2{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted-foreground);margin:6px 0 4px}
    label{display:flex;flex-direction:column;gap:4px;font-size:12px;}
    input[type="range"]{width:100%}
    select,button.ctl{padding:6px 9px;border-radius:8px;border:1px solid var(--border);background:var(--secondary);color:var(--foreground);font:inherit;cursor:pointer;}
    .chat{flex:1;display:flex;flex-direction:column;gap:12px;border:1px solid var(--border);border-radius:14px;padding:16px;background:var(--card);}
    .bubble-u{align-self:flex-end;display:flex;align-items:center;gap:6px;background:color-mix(in srgb,var(--primary) 16%,transparent);border:1px solid color-mix(in srgb,var(--primary) 34%,transparent);padding:10px 13px;border-radius:12px;max-width:84%;}
    .bubble-a{align-self:flex-start;background:var(--secondary);border:1px solid var(--border);padding:10px 13px;border-radius:12px;max-width:88%;}
    .composer-wrap{margin-top:auto;}
    [data-testid="agent-input-box"]{border:1px solid var(--border);border-radius:14px;padding:10px 12px;background:var(--card);display:flex;flex-direction:column;gap:8px;}
    textarea{width:100%;min-height:60px;background:transparent;border:0;outline:none;color:var(--foreground);font:inherit;resize:vertical;}
    .composer-foot{display:flex;justify-content:space-between;align-items:center;font-size:11.5px;color:var(--muted-foreground);}
    pre.md-out{margin:0;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--background);color:var(--foreground);font:11px/1.45 ui-monospace,SFMono-Regular,monospace;max-height:220px;overflow:auto;white-space:pre-wrap;}
  </style>
</head>
<body>
  <section class="sidebar-sim">
    <h2>模拟侧边栏 · Session Radar (B)</h2>
    <div data-testid="conversation-list-sidebar">
      <div class="conv-row" data-testid="conversation-row-sidebar" data-cascade-id="s-1" data-status="awaiting_decision">
        <span data-testid="conversation-title">发布 PR 审批确认</span>
        <span class="badge await">待确认</span>
      </div>
      <div class="conv-row" data-testid="conversation-row-sidebar" data-cascade-id="s-2" data-status="running" id="sim-row-running">
        <span data-testid="conversation-title">重构遥测聚合引擎</span>
        <span class="badge run">运行中</span>
      </div>
      <div class="conv-row" data-testid="conversation-row-sidebar" data-cascade-id="s-3" data-status="idle">
        <span data-testid="conversation-title">v2.35 兼容性核验</span>
        <span class="badge">空闲</span>
      </div>
      <div class="conv-row" data-testid="conversation-row-sidebar" data-cascade-id="s-4" data-status="awaiting_decision">
        <span data-testid="conversation-title">子代理部署脚本核准</span>
        <span class="badge await">待确认</span>
      </div>
    </div>
    <button class="ctl" id="btn-sim-transition">模拟「运行中 → 待确认」跃迁（触发失焦通知）</button>
  </section>

  <aside class="controls">
    <div>
      <h1>Antigravity Session Guard</h1>
      <div style="font-size:11.5px;color:var(--muted-foreground)">v0.3 离线交互工作台 · 零碰实机</div>
    </div>
    <label>上下文占比：<strong id="pct-val">82%</strong> (可拖至 102%+)
      <input id="pct-slider" type="range" min="10" max="115" value="82" />
    </label>
    <label>主题预览（四套皮肤 CSS 变量）
      <select id="theme-sel">
        <option value="obsidian">Obsidian Dark</option>
        <option value="crystal">Daylight Crystal (Light)</option>
        <option value="alabaster">Warm Alabaster (Light)</option>
        <option value="warm">Warm Dark</option>
      </select>
    </label>
    <label>界面语言（5 语种）
      <select id="lang-sel">
        <option value="zh-CN">简体中文</option>
        <option value="zh-TW">繁體中文</option>
        <option value="yue">粵語</option>
        <option value="en">English</option>
        <option value="ja">日本語</option>
      </select>
    </label>
    <label style="flex-direction:row;align-items:center;gap:8px">
      <input id="stream-chk" type="checkbox" /> 模拟流式生成中（防打断）
    </label>
    <label style="flex-direction:row;align-items:center;gap:8px">
      <input id="radar-chk" type="checkbox" checked /> 开启左侧「侧栏聚光 (B)」
    </label>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button class="ctl" id="btn-compact-sim">模拟压缩回落至 18%</button>
      <button class="ctl" id="btn-open-cfg">打开 ⚙ 设置浮窗</button>
      <button class="ctl" id="btn-remount">卸载重挂 (0 残留)</button>
    </div>
    <h2>实时事件 / 脱敏导出预览</h2>
    <pre class="md-out" id="log-out">就绪！可点右上角 ☆ 标星轮次，再点「仅导出 ★」或拖滑块到 102%。</pre>
  </aside>

  <main>
    <div class="chat" data-testid="conversation-view" data-cascade-id="11111111-2222-4333-8444-555555555555">
      <div class="bubble-u" data-testid="user-message-bubble"><span>帮我排查为什么上下文经常到 102% 还没触发压缩，注意凭据 sk-testSecretKey1234567890 不能外泄。</span></div>
      <div class="bubble-a" data-testid="agent-response">宿主协议未暴露压缩阈值字段，且 usedFraction 不封顶。建议在自定义阈值时浮条提前确认并一键 /compact。</div>
      <div class="bubble-u" data-testid="user-message-bubble"><span>请把标星的关键架构结论先导出脱敏 Markdown，再安心执行压缩。</span></div>
      <div class="bubble-a" data-testid="agent-response">点击每轮提问右侧 ☆ 即可按会话持久化书签，顶部会浮现原生「★ N」快捷跳转抽屉，压缩条也提供一键复制与 ↓ .md 本地下载。</div>
      <div class="bubble-u" data-testid="user-message-bubble"><span>如果重启或新开了 Antigravity 窗口，怎么做到无感自动重挂？</span></div>
      <div class="bubble-a" data-testid="agent-response">执行 <code>npm run watch</code> 即可启动零依赖 Watch Daemon：自适应退避探测 CDP 端口，窗口新建或重载后自动挂载，绝不触碰 app.asar。</div>
    </div>
    <div class="composer-wrap">
      <div data-testid="agent-input-box">
        <textarea id="composer" placeholder="在此输入草稿可测试“草稿零覆盖保护”与倒计时自动取消..."></textarea>
        <div class="composer-foot">
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
    const streamChk = document.getElementById('stream-chk');
    const radarChk = document.getElementById('radar-chk');
    const stopBtn = document.getElementById('stop-btn');
    const logOut = document.getElementById('log-out');
    const composer = document.getElementById('composer');
    let compactedCount = 0;

    function getSimSnap() {
      const pct = Number(slider.value);
      const maxTokens = 512000;
      const usedTokens = Math.round((pct / 100) * maxTokens);
      pctVal.textContent = pct + '%';
      ctxStatus.textContent = 'Context: ' + pct + '% (' + Math.round(usedTokens / 1000) + 'K / 512K)';
      return {
        cascadeId: '11111111-2222-4333-8444-555555555555',
        usedFraction: pct / 100,
        usedTokens,
        maxTokens,
        streaming: streamChk.checked,
        compactedCount,
      };
    }

    function mountGuard() {
      return window.__agSgCore.mountSessionGuard({
        win: window,
        doc: document,
        autoPoll: false,
        autoObserve: false,
        config: {
          compactThreshold: 80,
          compactTriggerMode: 'confirm',
          radarNotifyMode: 'all',
          modules: { compactGuard: true, precompactExport: true, outlineBookmarks: true, sessionRadar: radarChk.checked },
        },
        getContextSnapshot: () => getSimSnap(),
        onSubmitCompact: ({ command }) => {
          logOut.textContent = '[SUBMIT] ' + command + ' at ' + slider.value + '%';
          composer.value = '';
        },
        onExportMarkdown: ({ markdown, filename, downloaded }) => {
          logOut.textContent = (downloaded && filename ? '[DOWNLOAD .MD] ' + filename + '\\n\\n' : '') + markdown;
        },
        onDownloadMarkdown: ({ filename, count }) => {
          console.log('[workbench] downloaded', filename, count);
        },
        onRadarNotify: (ev) => {
          logOut.textContent = '[BLURRED OS ALERT] ' + ev.notifTitle + '\\n→ ' + ev.notifBody;
        },
      });
    }

    let guard = mountGuard();
    guard.evaluateNow();

    slider.addEventListener('input', () => guard.evaluateNow());
    streamChk.addEventListener('change', () => {
      stopBtn.hidden = !streamChk.checked;
      guard.evaluateNow();
    });
    radarChk.addEventListener('change', () => {
      const cur = guard.getConfig();
      guard.updateConfig({ modules: { ...cur.modules, sessionRadar: radarChk.checked } });
      guard.evaluateNow();
    });
    document.getElementById('theme-sel').addEventListener('change', (e) => {
      document.documentElement.setAttribute('data-theme', e.target.value);
    });
    document.getElementById('lang-sel').addEventListener('change', (e) => {
      document.documentElement.setAttribute('data-ag-cs-lang', e.target.value);
      guard.evaluateNow();
    });
    document.getElementById('btn-compact-sim').addEventListener('click', () => {
      compactedCount += 1;
      slider.value = '18';
      guard.evaluateNow();
      logOut.textContent = '[COMPACTED #' + compactedCount + '] Context reset to 18%. Dismiss state cleared.';
    });
    document.getElementById('btn-open-cfg').addEventListener('click', () => guard.openSettingsPopover());
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
      const leftover = document.querySelectorAll('[data-ag-sg-owned="1"]').length;
      guard = mountGuard();
      guard.evaluateNow();
      logOut.textContent = '[TEARDOWN TEST] Leftover owned nodes after destroy(): ' + leftover + ' -> Re-mounted cleanly.';
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

const isEntry = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isEntry) {
  if (process.argv.includes('--smoke')) {
    startWorkbenchServer(0)
      .then(async (srv) => {
        const { port } = srv.address();
        const res = await fetch(`http://127.0.0.1:${port}/`);
        const html = await res.text();
        srv.close();
        if (res.status !== 200 || !html.includes('mountSessionGuard') || !html.includes('ag-sg-radar-bar') || !html.includes('ag-sg-bm-dock')) {
          throw new Error(`Unexpected smoke response: status=${res.status}`);
        }
        console.log(`[agy-session-guard] Workbench smoke OK (HTTP ${res.status}, ${Buffer.byteLength(html, 'utf8')} B)`);
      })
      .catch((err) => {
        console.error('[agy-session-guard] Workbench smoke failed:', err?.message || err);
        process.exitCode = 1;
      });
  } else {
    const portArg = process.argv.find((a) => a.startsWith('--port='));
    const port = portArg ? Number(portArg.slice('--port='.length)) : DEFAULT_PORT;
    startWorkbenchServer(port).then(() => {
      console.log(`[agy-session-guard] Offline Workbench v0.3 listening at http://127.0.0.1:${port}`);
    });
  }
}
