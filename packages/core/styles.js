// Antigravity Session Guard — Theme-Adaptive Zero-:has() Stylesheet (UMD)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.__agSgStyles = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const STYLE_ID = 'ag-sg-core-css';

  // Zero :has(), pure host CSS variables for automatic Native & Obsidian Prism 4-theme integration
  const CORE_CSS = `
.ag-sg-banner{
  position:relative;
  box-sizing:border-box;
  width:100%;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  flex-wrap:wrap;
  margin:0 0 8px 0;
  padding:8px 12px;
  border-radius:12px;
  border:1px solid color-mix(in srgb,var(--warning,#f59e0b) 36%,var(--border,rgba(148,163,184,.28)));
  background:color-mix(in srgb,var(--card,#141720) 92%,var(--warning,#f59e0b) 8%);
  color:var(--foreground,#eef1f7);
  font:12px/1.4 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;
  box-shadow:0 8px 24px -10px rgba(0,0,0,.32);
  z-index:30;
  transition:opacity 160ms ease,transform 160ms ease,border-color 160ms ease;
}
.ag-sg-banner[hidden]{display:none!important;}
.ag-sg-banner[data-severity="overflow"]{
  border-color:color-mix(in srgb,var(--error,#ef4444) 55%,var(--border,rgba(148,163,184,.3)));
  background:color-mix(in srgb,var(--card,#141720) 88%,var(--error,#ef4444) 12%);
}
.ag-sg-banner[data-severity="countdown"]{
  border-color:color-mix(in srgb,var(--primary,#3186ff) 52%,var(--border,rgba(148,163,184,.3)));
  background:color-mix(in srgb,var(--card,#141720) 90%,var(--primary,#3186ff) 10%);
}
.ag-sg-banner[data-severity="stall"]{
  border-color:color-mix(in srgb,var(--warning,#f59e0b) 68%,var(--error,#ef4444) 32%);
  background:color-mix(in srgb,var(--card,#141720) 88%,var(--warning,#f59e0b) 12%);
}
.ag-sg-left{
  display:flex;
  align-items:center;
  gap:8px;
  min-width:0;
  flex:1 1 220px;
}
.ag-sg-dot{
  width:8px;
  height:8px;
  border-radius:999px;
  flex:0 0 auto;
  background:var(--warning,#f59e0b);
  box-shadow:0 0 8px color-mix(in srgb,var(--warning,#f59e0b) 65%,transparent);
}
.ag-sg-banner[data-severity="overflow"] .ag-sg-dot{
  background:var(--error,#ef4444);
  box-shadow:0 0 8px color-mix(in srgb,var(--error,#ef4444) 70%,transparent);
}
.ag-sg-banner[data-severity="countdown"] .ag-sg-dot{
  background:var(--primary,#3186ff);
  box-shadow:0 0 8px color-mix(in srgb,var(--primary,#3186ff) 70%,transparent);
}
.ag-sg-banner[data-severity="stall"] .ag-sg-dot{
  background:var(--warning,#f59e0b);
  box-shadow:0 0 10px color-mix(in srgb,var(--error,#ef4444) 65%,var(--warning,#f59e0b));
}
.ag-sg-msg{
  font-weight:500;
  font-variant-numeric:tabular-nums;
  overflow:hidden;
  text-overflow:ellipsis;
}
.ag-sg-focus-tag{
  flex:0 0 auto;
  padding:1px 6px;
  border-radius:999px;
  border:1px solid color-mix(in srgb,var(--primary,#3186ff) 45%,transparent);
  background:color-mix(in srgb,var(--primary,#3186ff) 14%,transparent);
  color:var(--primary,#3186ff);
  font:600 10.5px/1.3 Inter,system-ui,-apple-system,sans-serif;
  white-space:nowrap;
}
.ag-sg-focus-tag[hidden]{display:none!important;}
.ag-sg-actions{
  display:flex;
  align-items:center;
  gap:6px;
  flex-wrap:wrap;
  flex:0 0 auto;
}
.ag-sg-btn{
  appearance:none;
  border:1px solid var(--border,rgba(148,163,184,.28));
  background:color-mix(in srgb,var(--secondary,rgba(148,163,184,.14)) 75%,transparent);
  color:var(--foreground,#eef1f7);
  border-radius:8px;
  padding:4px 9px;
  font:500 11.5px/1.3 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;
  cursor:pointer;
  white-space:nowrap;
  transition:background 130ms ease,border-color 130ms ease,opacity 130ms ease;
}
.ag-sg-btn:hover:not(:disabled){
  background:color-mix(in srgb,var(--foreground,#eef1f7) 10%,transparent);
  border-color:color-mix(in srgb,var(--foreground,#eef1f7) 26%,transparent);
}
.ag-sg-btn:disabled{opacity:.48;cursor:not-allowed;}
.ag-sg-btn-primary{
  background:var(--primary,#3186ff);
  border-color:color-mix(in srgb,var(--primary,#3186ff) 80%,#fff);
  color:var(--primary-foreground,#ffffff);
  font-weight:600;
}
.ag-sg-btn-primary:hover:not(:disabled){
  filter:brightness(1.08);
  background:var(--primary,#3186ff);
}
.ag-sg-btn-icon{
  padding:4px 7px;
  min-width:26px;
  text-align:center;
}
.ag-sg-toast{
  width:100%;
  font-size:11px;
  color:var(--muted-foreground,#94a3b8);
  padding-top:2px;
}
.ag-sg-toast[hidden]{display:none!important;}
.ag-sg-toast[data-tone="warn"]{color:var(--warning,#f59e0b);}
.ag-sg-toast[data-tone="ok"]{color:var(--success,#34d399);}
.ag-sg-recovery-bar{
  box-sizing:border-box;
  width:100%;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  flex-wrap:wrap;
  margin:0 0 8px 0;
  padding:7px 12px;
  border-radius:12px;
  border:1px solid color-mix(in srgb,var(--success,#34d399) 45%,var(--border,rgba(148,163,184,.28)));
  background:color-mix(in srgb,var(--card,#141720) 92%,var(--success,#34d399) 8%);
  color:var(--foreground,#eef1f7);
  font:12px/1.4 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;
  z-index:29;
}
.ag-sg-recovery-bar[hidden]{display:none!important;}
.ag-sg-recovery-dot{
  width:8px;
  height:8px;
  border-radius:999px;
  flex:0 0 auto;
  background:var(--success,#34d399);
  box-shadow:0 0 8px color-mix(in srgb,var(--success,#34d399) 65%,transparent);
}
.ag-sg-popover{
  position:absolute;
  right:0;
  bottom:calc(100% + 8px);
  width:min(340px,calc(100vw - 24px));
  max-height:min(74vh,520px);
  overflow:auto;
  padding:12px 13px;
  border-radius:12px;
  border:1px solid var(--border,rgba(148,163,184,.26));
  background:var(--card,#141720);
  color:var(--foreground,#eef1f7);
  box-shadow:0 16px 38px rgba(0,0,0,.38);
  z-index:40;
}
.ag-sg-popover[hidden]{display:none!important;}
.ag-sg-pop-title{
  display:flex;
  align-items:center;
  justify-content:space-between;
  font-size:12px;
  font-weight:600;
  margin:0 0 8px 0;
}
.ag-sg-pop-row{
  margin-bottom:9px;
}
.ag-sg-pop-lbl{
  display:block;
  font-size:11px;
  color:var(--muted-foreground,#94a3b8);
  margin-bottom:5px;
}
.ag-sg-pop-input{
  width:100%;
  margin-top:6px;
  padding:5px 8px;
  border-radius:7px;
  border:1px solid var(--border,rgba(148,163,184,.28));
  background:var(--background,#0b0d13);
  color:var(--foreground,#eef1f7);
  font:11.5px/1.35 Inter,system-ui,-apple-system,sans-serif;
  outline:none;
}
.ag-sg-pop-input:focus{
  border-color:color-mix(in srgb,var(--primary,#3186ff) 65%,transparent);
}
.ag-sg-seg{
  display:flex;
  flex-wrap:wrap;
  gap:4px;
}
.ag-sg-seg button{
  appearance:none;
  border:1px solid var(--border,rgba(148,163,184,.24));
  background:transparent;
  color:var(--foreground,#eef1f7);
  border-radius:7px;
  padding:3px 7px;
  font:500 11px/1.3 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;
  cursor:pointer;
}
.ag-sg-seg button[aria-pressed="true"]{
  background:color-mix(in srgb,var(--primary,#3186ff) 18%,transparent);
  border-color:color-mix(in srgb,var(--primary,#3186ff) 60%,transparent);
  color:var(--primary,#3186ff);
  font-weight:600;
}
.ag-sg-pop-hint{
  margin:4px 0 0 0;
  font-size:10.5px;
  line-height:1.45;
  color:var(--muted-foreground,#94a3b8);
}
.ag-sg-bm-star{
  appearance:none;
  flex:0 0 auto;
  align-self:center;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  margin-left:8px;
  padding:1px 5px;
  border-radius:6px;
  border:1px solid transparent;
  background:transparent;
  color:var(--muted-foreground,#94a3b8);
  font-size:12px;
  line-height:1.2;
  cursor:pointer;
  opacity:.72;
  transition:opacity 120ms ease,color 120ms ease,background 120ms ease;
}
.ag-sg-bm-star:hover,.ag-sg-bm-star[data-starred="1"]{
  opacity:1;
  color:var(--warning,#f59e0b);
  background:color-mix(in srgb,var(--warning,#f59e0b) 12%,transparent);
}
.ag-sg-bm-dock{
  position:sticky;
  top:6px;
  height:0;
  overflow:visible;
  display:flex;
  justify-content:flex-end;
  pointer-events:none;
  z-index:26;
}
.ag-sg-bm-dock[hidden]{display:none!important;}
.ag-sg-bm-dock-inner{
  position:relative;
  pointer-events:auto;
  display:inline-flex;
  flex-direction:column;
  align-items:flex-end;
}
.ag-sg-bm-chip{
  appearance:none;
  display:inline-flex;
  align-items:center;
  gap:5px;
  padding:3px 9px;
  border-radius:999px;
  border:1px solid color-mix(in srgb,var(--warning,#f59e0b) 50%,var(--border,rgba(148,163,184,.28)));
  background:color-mix(in srgb,var(--card,#141720) 92%,var(--warning,#f59e0b) 8%);
  color:var(--warning,#f59e0b);
  font:600 11px/1.3 Inter,system-ui,-apple-system,sans-serif;
  font-variant-numeric:tabular-nums;
  cursor:pointer;
  box-shadow:0 6px 18px -6px rgba(0,0,0,.35);
  transition:transform 120ms ease,border-color 120ms ease,background 120ms ease;
}
.ag-sg-bm-chip:hover{
  transform:translateY(-1px);
  border-color:color-mix(in srgb,var(--warning,#f59e0b) 72%,var(--border,rgba(148,163,184,.3)));
}
.ag-sg-bm-drawer{
  position:absolute;
  top:28px;
  right:0;
  width:min(336px,calc(100vw - 28px));
  max-height:340px;
  display:flex;
  flex-direction:column;
  gap:6px;
  padding:10px;
  border-radius:12px;
  border:1px solid var(--border,rgba(148,163,184,.28));
  background:var(--card,#141720);
  color:var(--foreground,#eef1f7);
  box-shadow:0 16px 38px rgba(0,0,0,.42);
  font:12px/1.4 Inter,system-ui,-apple-system,sans-serif;
  z-index:35;
}
.ag-sg-bm-drawer[hidden]{display:none!important;}
.ag-sg-bm-drawer-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  font-size:11.5px;
  font-weight:600;
  padding-bottom:4px;
  border-bottom:1px solid var(--border,rgba(148,163,184,.2));
}
.ag-sg-bm-list{
  display:flex;
  flex-direction:column;
  gap:4px;
  overflow:auto;
  max-height:210px;
}
.ag-sg-bm-item{
  display:flex;
  align-items:center;
  gap:6px;
  padding:5px 7px;
  border-radius:8px;
  border:1px solid var(--border,rgba(148,163,184,.18));
  background:color-mix(in srgb,var(--secondary,rgba(148,163,184,.12)) 65%,transparent);
  color:var(--foreground,#eef1f7);
  cursor:pointer;
  text-align:left;
  font:11.5px/1.35 Inter,system-ui,-apple-system,sans-serif;
  transition:border-color 120ms ease,background 120ms ease;
}
.ag-sg-bm-item:hover{
  border-color:color-mix(in srgb,var(--warning,#f59e0b) 55%,transparent);
  background:color-mix(in srgb,var(--warning,#f59e0b) 10%,transparent);
}
.ag-sg-bm-num{
  flex:0 0 auto;
  font-weight:600;
  font-variant-numeric:tabular-nums;
  color:var(--warning,#f59e0b);
}
.ag-sg-bm-snippet{
  flex:1 1 auto;
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.ag-sg-bm-unstar{
  appearance:none;
  border:0;
  background:transparent;
  color:var(--muted-foreground,#94a3b8);
  cursor:pointer;
  padding:0 4px;
  font-size:12px;
  line-height:1;
}
.ag-sg-bm-unstar:hover{color:var(--error,#ef4444);}
.ag-sg-bm-foot{
  display:flex;
  align-items:center;
  justify-content:flex-end;
  gap:6px;
  padding-top:6px;
  border-top:1px solid var(--border,rgba(148,163,184,.2));
}
[data-ag-sg-pulse="1"]{
  outline:2px solid color-mix(in srgb,var(--warning,#f59e0b) 80%,transparent)!important;
  outline-offset:2px!important;
  transition:outline-color 220ms ease!important;
}
.ag-sg-vault-overlay{
  position:fixed;
  inset:0;
  background:rgba(2,6,23,.58);
  display:flex;
  align-items:center;
  justify-content:center;
  padding:18px;
  z-index:90;
}
.ag-sg-vault-overlay[hidden]{display:none!important;}
.ag-sg-vault-modal{
  width:min(640px,100%);
  max-height:min(78vh,620px);
  display:flex;
  flex-direction:column;
  gap:10px;
  padding:14px 16px;
  border-radius:14px;
  border:1px solid var(--border,rgba(148,163,184,.28));
  background:var(--card,#141720);
  color:var(--foreground,#eef1f7);
  box-shadow:0 24px 60px rgba(0,0,0,.5);
  font:12px/1.45 Inter,system-ui,-apple-system,sans-serif;
}
.ag-sg-vault-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
}
.ag-sg-vault-title{
  font-size:13.5px;
  font-weight:600;
}
.ag-sg-vault-stats{
  font-size:11px;
  color:var(--muted-foreground,#94a3b8);
}
.ag-sg-vault-search{
  width:100%;
  padding:7px 10px;
  border-radius:9px;
  border:1px solid var(--border,rgba(148,163,184,.28));
  background:var(--background,#0b0d13);
  color:var(--foreground,#eef1f7);
  font:12px/1.4 Inter,system-ui,-apple-system,sans-serif;
  outline:none;
}
.ag-sg-vault-search:focus{
  border-color:color-mix(in srgb,var(--primary,#3186ff) 65%,transparent);
}
.ag-sg-vault-body{
  flex:1 1 auto;
  overflow:auto;
  display:flex;
  flex-direction:column;
  gap:8px;
  min-height:120px;
}
.ag-sg-vault-empty{
  padding:28px 12px;
  text-align:center;
  color:var(--muted-foreground,#94a3b8);
  font-size:12px;
}
.ag-sg-vault-card{
  border:1px solid var(--border,rgba(148,163,184,.22));
  border-radius:10px;
  padding:9px 11px;
  background:color-mix(in srgb,var(--secondary,rgba(148,163,184,.1)) 55%,transparent);
  display:flex;
  flex-direction:column;
  gap:6px;
}
.ag-sg-vault-card-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  font-size:11.5px;
  font-weight:600;
}
.ag-sg-vault-cid{
  font-family:ui-monospace,SFMono-Regular,monospace;
  font-size:10.5px;
  color:var(--muted-foreground,#94a3b8);
  font-weight:400;
}
.ag-sg-vault-turn{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:8px;
  padding:5px 7px;
  border-radius:7px;
  background:var(--card,#141720);
  border:1px solid var(--border,rgba(148,163,184,.16));
  font-size:11.5px;
}
.ag-sg-vault-turn-text{
  flex:1 1 auto;
  min-width:0;
  word-break:break-word;
}
.ag-sg-vault-reply{
  margin-top:3px;
  font-size:11px;
  color:var(--muted-foreground,#94a3b8);
}
.ag-sg-vault-foot{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  padding-top:8px;
  border-top:1px solid var(--border,rgba(148,163,184,.2));
}
.ag-sg-outline-bm-filter{
  margin-left:auto;
  font-size:10.5px;
  padding:2px 6px;
}
.ag-sg-outline-bm-filter[aria-pressed="true"]{
  border-color:color-mix(in srgb,var(--warning,#f59e0b) 55%,transparent);
  color:var(--warning,#f59e0b);
}
.ag-sg-outline-star{
  margin-left:auto;
  padding:0 4px;
  color:var(--muted-foreground,#94a3b8);
  cursor:pointer;
}
.ag-sg-outline-star[data-starred="1"]{color:var(--warning,#f59e0b);}
.ag-sg-radar-bar{
  display:flex;
  align-items:center;
  gap:4px;
  padding:6px 8px;
  margin:0 0 6px 0;
  border-bottom:1px solid var(--border,rgba(148,163,184,.2));
}
.ag-sg-radar-pill{
  appearance:none;
  flex:1 1 auto;
  border:1px solid var(--border,rgba(148,163,184,.22));
  background:transparent;
  color:var(--muted-foreground,#94a3b8);
  border-radius:999px;
  padding:3px 7px;
  font:500 11px/1.25 Inter,system-ui,-apple-system,sans-serif;
  font-variant-numeric:tabular-nums;
  cursor:pointer;
  white-space:nowrap;
  transition:background 130ms ease,border-color 130ms ease,color 130ms ease;
}
.ag-sg-radar-pill[aria-pressed="true"]{
  background:color-mix(in srgb,var(--primary,#3186ff) 16%,transparent);
  border-color:color-mix(in srgb,var(--primary,#3186ff) 52%,transparent);
  color:var(--foreground,#eef1f7);
  font-weight:600;
}
.ag-sg-radar-pill[data-has-alert="1"]{
  border-color:color-mix(in srgb,var(--warning,#f59e0b) 58%,transparent);
  color:var(--warning,#f59e0b);
}
`.trim();

  return { STYLE_ID, CORE_CSS };
});
