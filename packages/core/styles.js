// agy-Sag — Theme-Adaptive Zero-:has() Stylesheet (UMD)
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
  flex-wrap:nowrap;
  margin:0 0 10px 0;
  padding:6px 10px;
  border-radius:10px;
  border:1px solid var(--border,rgba(148,163,184,.24));
  background:color-mix(in srgb,var(--popover,var(--card,#ffffff)) 94%,transparent);
  backdrop-filter:blur(12px);
  color:var(--foreground,#0f172a);
  font:12px/1.35 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei UI",sans-serif;
  box-shadow:0 4px 16px -6px rgba(15,23,42,.12);
  z-index:30;
  transition:opacity 160ms ease,transform 160ms ease,border-color 160ms ease;
}
.ag-sg-banner[hidden]{display:none!important;}
.ag-sg-banner[data-severity="overflow"]{
  border-color:color-mix(in srgb,var(--error,#ef4444) 42%,var(--border,rgba(148,163,184,.24)));
}
.ag-sg-banner[data-severity="countdown"]{
  border-color:color-mix(in srgb,var(--primary,#3186ff) 36%,var(--border,rgba(148,163,184,.24)));
}
.ag-sg-banner[data-severity="stall"]{
  border-color:color-mix(in srgb,var(--warning,#f59e0b) 44%,var(--border,rgba(148,163,184,.24)));
}
.ag-sg-left{
  display:flex;
  align-items:center;
  gap:7px;
  min-width:0;
  flex:1 1 auto;
}
.ag-sg-dot{
  width:6px;
  height:6px;
  border-radius:999px;
  flex:0 0 auto;
  background:var(--warning,#f59e0b);
}
.ag-sg-banner[data-severity="overflow"] .ag-sg-dot{
  background:var(--error,#ef4444);
}
.ag-sg-banner[data-severity="countdown"] .ag-sg-dot{
  background:var(--primary,#3186ff);
}
.ag-sg-banner[data-severity="stall"] .ag-sg-dot{
  background:var(--warning,#f59e0b);
}
.ag-sg-msg{
  font-weight:500;
  font-variant-numeric:tabular-nums;
  white-space:nowrap;
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
  flex-wrap:nowrap;
  margin:0 0 10px 0;
  padding:6px 10px;
  border-radius:10px;
  border:1px solid var(--border,rgba(148,163,184,.24));
  background:color-mix(in srgb,var(--popover,var(--card,#ffffff)) 94%,transparent);
  backdrop-filter:blur(12px);
  color:var(--foreground,#0f172a);
  font:12px/1.35 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei UI",sans-serif;
  box-shadow:0 4px 16px -6px rgba(15,23,42,.12);
  z-index:29;
}
.ag-sg-recovery-bar[hidden]{display:none!important;}
.ag-sg-recovery-dot{
  width:6px;
  height:6px;
  border-radius:999px;
  flex:0 0 auto;
  background:var(--success,#10b981);
}
.ag-sg-draft-bar{
  box-sizing:border-box;
  width:100%;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  flex-wrap:nowrap;
  margin:0 0 10px 0;
  padding:6px 10px;
  border-radius:10px;
  border:1px solid var(--border,rgba(148,163,184,.24));
  background:color-mix(in srgb,var(--popover,var(--card,#ffffff)) 94%,transparent);
  backdrop-filter:blur(12px);
  color:var(--foreground,#0f172a);
  font:12px/1.35 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei UI",sans-serif;
  box-shadow:0 4px 16px -6px rgba(15,23,42,.12);
  z-index:28;
}
.ag-sg-draft-bar[hidden]{display:none!important;}
.ag-sg-draft-dot{
  width:6px;
  height:6px;
  border-radius:999px;
  flex:0 0 auto;
  background:var(--primary,#3186ff);
}
.ag-sg-pill-wrap{
  position:relative;
  display:inline-flex;
  align-items:center;
  flex:0 0 auto;
  margin:0 4px;
  font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei UI",sans-serif;
}
.ag-sg-status-pill{
  appearance:none;
  display:inline-flex;
  align-items:center;
  gap:6px;
  height:24px;
  padding:0 8px;
  border-radius:8px;
  border:1px solid transparent;
  background:color-mix(in srgb,var(--secondary,rgba(148,163,184,.14)) 72%,transparent);
  color:var(--muted-foreground,#64748b);
  font:500 11.5px/1 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei UI",sans-serif;
  font-variant-numeric:tabular-nums;
  cursor:pointer;
  white-space:nowrap;
  transition:background 140ms ease,color 140ms ease,border-color 140ms ease;
}
.ag-sg-status-pill:hover,.ag-sg-status-pill[aria-expanded="true"]{
  background:color-mix(in srgb,var(--secondary,rgba(148,163,184,.2)) 100%,transparent);
  border-color:var(--border,rgba(148,163,184,.26));
  color:var(--foreground,#0f172a);
}
.ag-sg-status-dot{
  width:6px;
  height:6px;
  border-radius:999px;
  flex:0 0 auto;
  background:var(--muted-foreground,#94a3b8);
}
.ag-sg-status-pill[data-tone="ok"] .ag-sg-status-dot{background:var(--success,#10b981);}
.ag-sg-status-pill[data-tone="warm"] .ag-sg-status-dot{background:var(--primary,#3186ff);}
.ag-sg-status-pill[data-tone="warn"] .ag-sg-status-dot{background:var(--warning,#f59e0b);}
.ag-sg-status-pill[data-tone="danger"] .ag-sg-status-dot{background:var(--error,#ef4444);}
.ag-sg-status-pill[data-synergy="1"]{
  border-color:color-mix(in srgb,var(--primary,#3186ff) 32%,var(--border,rgba(148,163,184,.24)));
}
.ag-sg-status-pill[data-synergy="1"] .ag-sg-status-dot{
  box-shadow:0 0 0 2px color-mix(in srgb,var(--primary,#3186ff) 30%,transparent);
}
.ag-sg-status-card{
  position:absolute;
  right:0;
  bottom:calc(100% + 10px);
  width:min(288px,calc(100vw - 28px));
  overflow:hidden;
  border-radius:12px;
  border:1px solid var(--border,rgba(148,163,184,.28));
  background:var(--popover,var(--card,#ffffff));
  color:var(--foreground,#0f172a);
  box-shadow:0 16px 40px -10px rgba(15,23,42,.24),0 2px 6px rgba(15,23,42,.08);
  font:12px/1.45 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei UI",sans-serif;
  z-index:60;
}
.ag-sg-status-card[hidden]{display:none!important;}
.ag-sg-card-link{
  appearance:none;
  border:0;
  padding:0;
  background:transparent;
  color:var(--warning,#d97706);
  font:600 11.5px/1.3 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei UI",sans-serif;
  font-variant-numeric:tabular-nums;
  cursor:pointer;
}
.ag-sg-card-link:hover{text-decoration:underline;}
.ag-sg-card-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  padding:11px 14px 9px;
  border-bottom:1px solid var(--border,rgba(148,163,184,.2));
}
.ag-sg-card-title{
  font-size:12.5px;
  font-weight:600;
  letter-spacing:-.01em;
}
.ag-sg-card-meta{
  font-size:11.5px;
  color:var(--muted-foreground,#64748b);
  font-variant-numeric:tabular-nums;
}
.ag-sg-card-grid{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:6px 16px;
  padding:10px 14px;
  border-bottom:1px solid var(--border,rgba(148,163,184,.2));
}
.ag-sg-card-metric{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  min-width:0;
}
.ag-sg-card-mk{
  font-size:11.5px;
  color:var(--muted-foreground,#64748b);
  white-space:nowrap;
}
.ag-sg-card-mv{
  font-size:11.5px;
  font-weight:500;
  color:var(--foreground,#0f172a);
  font-variant-numeric:tabular-nums;
  white-space:nowrap;
}
.ag-sg-card-body{
  padding:10px 14px 4px;
}
.ag-sg-card-foot{
  display:flex;
  align-items:center;
  justify-content:flex-end;
  gap:6px;
  padding:9px 14px 11px;
  border-top:1px solid var(--border,rgba(148,163,184,.2));
}
.ag-sg-set-section{
  margin-top:12px;
  display:flex;
  flex-direction:column;
  gap:6px;
}
.ag-sg-set-subhead{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
}
.ag-sg-set-row-inner{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  flex-wrap:wrap;
  padding:10px 0;
}
.ag-sg-set-text{
  display:flex;
  flex-direction:column;
  gap:2px;
  min-width:160px;
}
.ag-sg-set-row-title{
  font-size:12.5px;
  font-weight:500;
  color:var(--foreground,#0f172a);
}
.ag-sg-set-row-desc{
  font-size:11px;
  line-height:1.4;
  color:var(--muted-foreground,#64748b);
}
.ag-sg-mod-guide{
  display:flex;
  flex-direction:column;
  gap:4px;
  margin-top:8px;
  padding:8px 10px;
  border-radius:8px;
  background:color-mix(in srgb,var(--secondary,rgba(148,163,184,.12)) 58%,transparent);
  border:1px solid color-mix(in srgb,var(--border,rgba(148,163,184,.2)) 65%,transparent);
}
.ag-sg-mod-guide-item{
  display:flex;
  align-items:baseline;
  gap:6px;
  font-size:11px;
  line-height:1.45;
  color:var(--muted-foreground,#64748b);
}
.ag-sg-mod-guide-dot{
  width:5px;
  height:5px;
  border-radius:999px;
  flex:0 0 auto;
  align-self:center;
  background:color-mix(in srgb,var(--muted-foreground,#94a3b8) 45%,transparent);
}
.ag-sg-mod-guide-item[data-active="1"] .ag-sg-mod-guide-dot{
  background:var(--primary,#3186ff);
}
.ag-sg-mod-guide-name{
  flex:0 0 auto;
  font-weight:600;
  color:var(--foreground,#0f172a);
  opacity:.72;
}
.ag-sg-mod-guide-item[data-active="1"] .ag-sg-mod-guide-name{
  opacity:1;
}
.ag-sg-mod-guide-desc{
  min-width:0;
}
.ag-sg-set-input{
  margin:0 0 8px 0;
  box-sizing:border-box;
}
.ag-sg-native-section{
  margin-top:18px;
  display:flex;
  flex-direction:column;
  gap:8px;
  font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei UI",sans-serif;
}
.ag-sg-native-heading{
  margin:0;
  font-size:13px;
  font-weight:600;
  color:var(--foreground,#0f172a);
}
.ag-sg-native-card{
  border-radius:12px;
  border:1px solid var(--border,rgba(148,163,184,.24));
  background:var(--card,transparent);
  padding:0 14px;
}
.ag-sg-native-card .ag-sg-set-row + .ag-sg-set-row{
  border-top:1px solid var(--border,rgba(148,163,184,.18));
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
  position:relative;
  appearance:none;
  flex:0 0 auto;
  align-self:center;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:24px;
  height:24px;
  padding:4px;
  margin:0;
  border-radius:6px;
  border:0;
  background:transparent;
  color:var(--muted-foreground,#64748b);
  font-size:13px;
  line-height:1;
  cursor:pointer;
  pointer-events:auto;
  transition:color 120ms ease,background 120ms ease,opacity 120ms ease;
}
.ag-sg-bm-star svg{
  display:block;
  width:16px;
  height:16px;
  flex:0 0 auto;
}
.ag-sg-bm-star:hover{
  color:var(--secondary-foreground,var(--foreground,#0f172a));
}
.ag-sg-bm-star[data-starred="1"]{
  color:var(--warning,#f59e0b);
}
.ag-sg-bm-star[data-starred="1"]:hover{
  color:var(--warning,#d97706);
  background:color-mix(in srgb,var(--warning,#f59e0b) 10%,transparent);
}
.ag-sg-bm-star[data-tip]:hover::after{
  content:attr(data-tip);
  position:absolute;
  right:0;
  top:calc(100% + 6px);
  padding:4px 8px;
  border-radius:6px;
  background:var(--popover,var(--foreground,#0f172a));
  color:var(--popover-foreground,var(--background,#f8fafc));
  border:1px solid var(--border,rgba(148,163,184,.22));
  box-shadow:0 6px 18px -4px rgba(15,23,42,.22);
  font:500 11px/1.3 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei UI",sans-serif;
  white-space:nowrap;
  pointer-events:none;
  z-index:55;
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
@keyframes ag-sag-pulse{
  0%,100%{opacity:1;transform:scale(1);}
  50%{opacity:.55;transform:scale(.88);}
}
.ag-sag-suite-panel{
  margin-top:12px;
  border-radius:12px;
  border:1px solid var(--border,rgba(148,163,184,.24));
  background:color-mix(in srgb,var(--foreground,#eef1f7) 4%,var(--card,transparent));
  box-shadow:0 6px 22px -12px rgba(15,23,42,.22);
  overflow:hidden;
  display:flex;
  flex-direction:column;
  font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei UI",sans-serif;
}
.ag-sag-fold-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  flex-wrap:wrap;
  width:100%;
  padding:10px 13px;
  border:0;
  border-bottom:1px solid color-mix(in srgb,var(--border,rgba(148,163,184,.22)) 75%,transparent);
  background:linear-gradient(
    135deg,
    color-mix(in srgb,var(--primary,#3186ff) 9%,var(--card,transparent)),
    color-mix(in srgb,var(--foreground,#eef1f7) 4%,var(--card,transparent))
  );
  color:var(--foreground,#eef1f7);
  cursor:pointer;
  text-align:left;
  transition:background 150ms ease;
}
.ag-sag-fold-head:hover{
  background:linear-gradient(
    135deg,
    color-mix(in srgb,var(--primary,#3186ff) 13%,var(--card,transparent)),
    color-mix(in srgb,var(--foreground,#eef1f7) 6%,var(--card,transparent))
  );
}
.ag-sag-fold-head[aria-expanded="false"]{
  border-bottom-color:transparent;
}
.ag-sag-fold-left{
  display:flex;
  align-items:center;
  gap:7px;
  flex-wrap:wrap;
  min-width:0;
}
.ag-sag-fold-right{
  display:flex;
  align-items:center;
  gap:7px;
  flex:0 0 auto;
}
.ag-sag-brand-badge{
  display:inline-flex;
  align-items:center;
  gap:6px;
  font-size:12.5px;
  font-weight:700;
  letter-spacing:-.015em;
  color:var(--foreground,#eef1f7);
}
.ag-sag-live-dot{
  width:7px;
  height:7px;
  border-radius:999px;
  background:var(--success,#10b981);
  box-shadow:0 0 0 3px color-mix(in srgb,var(--success,#10b981) 20%,transparent);
  animation:ag-sag-pulse 2.6s ease-in-out infinite;
  flex:0 0 auto;
}
.ag-sag-meta-pill{
  display:inline-flex;
  align-items:center;
  padding:2px 7px;
  border-radius:999px;
  border:1px solid color-mix(in srgb,var(--border,rgba(148,163,184,.26)) 85%,transparent);
  background:color-mix(in srgb,var(--foreground,#eef1f7) 5%,var(--card,transparent));
  color:var(--muted-foreground,#94a3b8);
  font-size:10.5px;
  font-weight:600;
  font-variant-numeric:tabular-nums;
  line-height:1.3;
  white-space:nowrap;
}
.ag-sag-dual-pill{
  appearance:none;
  display:inline-flex;
  align-items:center;
  gap:5px;
  padding:2px 9px;
  border-radius:999px;
  border:1px solid color-mix(in srgb,var(--primary,#3186ff) 48%,transparent);
  background:linear-gradient(
    135deg,
    color-mix(in srgb,var(--primary,#3186ff) 20%,var(--card,transparent)),
    color-mix(in srgb,var(--success,#10b981) 16%,var(--card,transparent))
  );
  color:var(--primary,#3186ff);
  font:700 10.5px/1.35 Inter,system-ui,-apple-system,sans-serif;
  letter-spacing:.01em;
  cursor:pointer;
  white-space:nowrap;
  transition:filter 130ms ease,transform 130ms ease;
}
.ag-sag-dual-pill:hover{
  filter:brightness(1.08);
  transform:translateY(-0.5px);
}
.ag-sag-dual-dot{
  width:6px;
  height:6px;
  border-radius:999px;
  background:var(--primary,#3186ff);
  box-shadow:0 0 0 2px color-mix(in srgb,var(--primary,#3186ff) 28%,transparent);
  animation:ag-sag-pulse 2.2s ease-in-out infinite;
}
.ag-sag-fold-chevron{
  font-size:10.5px;
  color:var(--muted-foreground,#94a3b8);
  padding:0 2px;
  user-select:none;
}
.ag-sag-fold-body{
  padding:11px 13px 13px;
  display:flex;
  flex-direction:column;
  gap:10px;
}
.ag-sag-fold-body[hidden]{display:none!important;}
.ag-sag-topdeck{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  flex-wrap:wrap;
  padding:8px 10px;
  border-radius:10px;
  border:1px solid color-mix(in srgb,var(--border,rgba(148,163,184,.22)) 78%,transparent);
  background:color-mix(in srgb,var(--foreground,#eef1f7) 3%,var(--card,transparent));
}
.ag-sag-subtabs{
  display:flex;
  align-items:center;
  gap:4px;
  flex-wrap:wrap;
  padding:3px;
  border-radius:10px;
  border:1px solid color-mix(in srgb,var(--border,rgba(148,163,184,.22)) 80%,transparent);
  background:color-mix(in srgb,var(--secondary,rgba(148,163,184,.12)) 60%,var(--card,transparent));
}
.ag-sag-subtab{
  appearance:none;
  flex:1 1 auto;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:5px;
  border:1px solid transparent;
  background:transparent;
  color:var(--muted-foreground,#64748b);
  border-radius:7px;
  padding:5px 9px;
  font:500 11px/1.25 Inter,system-ui,-apple-system,sans-serif;
  cursor:pointer;
  white-space:nowrap;
  transition:background 140ms ease,color 140ms ease,border-color 140ms ease,box-shadow 140ms ease;
}
.ag-sag-subtab:hover{
  color:var(--foreground,#0f172a);
  background:color-mix(in srgb,var(--foreground,#0f172a) 5%,transparent);
}
.ag-sag-subtab[aria-pressed="true"]{
  background:color-mix(in srgb,var(--primary,#3186ff) 14%,var(--card,transparent));
  border-color:color-mix(in srgb,var(--primary,#3186ff) 46%,transparent);
  color:var(--foreground,#0f172a);
  font-weight:600;
  box-shadow:0 2px 6px -2px rgba(15,23,42,.18);
}
.ag-sag-subtab-dot{
  width:5px;
  height:5px;
  border-radius:999px;
  background:var(--success,#10b981);
  flex:0 0 auto;
}
.ag-sag-pane{
  display:flex;
  flex-direction:column;
  gap:9px;
}
.ag-sag-pane[hidden]{display:none!important;}
.ag-sag-suite-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  flex-wrap:wrap;
}
.ag-sag-suite-title{
  font-size:11.5px;
  font-weight:600;
  color:var(--foreground,#eef1f7);
}
.ag-sag-suite-sub{
  font-size:10.5px;
  color:var(--muted-foreground,#94a3b8);
}
.ag-sag-suite-row{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  flex-wrap:wrap;
  padding:8px 10px;
  border-radius:10px;
  border:1px solid color-mix(in srgb,var(--border,rgba(148,163,184,.2)) 72%,transparent);
  background:color-mix(in srgb,var(--foreground,#eef1f7) 2.5%,var(--card,transparent));
}
.ag-sag-suite-row-stack{
  flex-direction:column;
  align-items:stretch;
}
.ag-sag-suite-label{
  display:flex;
  flex-direction:column;
  gap:2px;
  min-width:140px;
  flex:1 1 auto;
}
.ag-sag-suite-label strong{
  font-size:11.5px;
  font-weight:600;
  color:var(--foreground,#eef1f7);
}
.ag-sag-suite-label span{
  font-size:10.5px;
  line-height:1.4;
  color:var(--muted-foreground,#94a3b8);
}
.ag-sag-select{
  appearance:none;
  border:1px solid var(--border,rgba(148,163,184,.28));
  background-color:var(--card,#ffffff);
  background-image:linear-gradient(45deg,transparent 50%,var(--muted-foreground,#64748b) 50%),linear-gradient(135deg,var(--muted-foreground,#64748b) 50%,transparent 50%);
  background-position:calc(100% - 14px) 50%,calc(100% - 9px) 50%;
  background-size:5px 5px,5px 5px;
  background-repeat:no-repeat;
  color:var(--foreground,#0f172a);
  border-radius:7px;
  padding:4px 24px 4px 9px;
  font:500 11.5px/1.3 Inter,system-ui,-apple-system,sans-serif;
  cursor:pointer;
}
.ag-sag-ext-grid{
  display:flex;
  flex-wrap:wrap;
  gap:5px;
  align-items:center;
}
.ag-sag-chip{
  appearance:none;
  border:1px solid var(--border,rgba(148,163,184,.26));
  background:color-mix(in srgb,var(--foreground,#0f172a) 2%,transparent);
  color:var(--muted-foreground,#64748b);
  border-radius:999px;
  padding:3px 9px;
  font:500 11px/1.3 Inter,system-ui,-apple-system,sans-serif;
  cursor:pointer;
  transition:background 120ms ease,border-color 120ms ease,color 120ms ease;
}
.ag-sag-chip:hover{
  color:var(--foreground,#0f172a);
  border-color:color-mix(in srgb,var(--foreground,#0f172a) 28%,transparent);
}
.ag-sag-chip[aria-pressed="true"]{
  background:color-mix(in srgb,var(--primary,#3186ff) 14%,var(--card,transparent));
  border-color:color-mix(in srgb,var(--primary,#3186ff) 56%,transparent);
  color:var(--primary,#2563eb);
  font-weight:600;
}
.ag-sag-chip[data-risk="high"][aria-pressed="true"]{
  background:color-mix(in srgb,var(--warning,#f59e0b) 16%,transparent);
  border-color:color-mix(in srgb,var(--warning,#f59e0b) 55%,transparent);
  color:var(--warning,#f59e0b);
}
.ag-sag-badge-note{
  font-size:10.5px;
  color:var(--muted-foreground,#94a3b8);
  font-variant-numeric:tabular-nums;
}
.ag-sag-flow-list{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(195px,1fr));
  gap:6px;
}
.ag-sag-flow-card{
  display:flex;
  flex-direction:column;
  gap:3px;
  padding:7px 9px;
  border-radius:8px;
  border:1px solid color-mix(in srgb,var(--border,rgba(148,163,184,.2)) 70%,transparent);
  background:color-mix(in srgb,var(--card,transparent) 75%,transparent);
  font-size:10.5px;
  color:var(--muted-foreground,#94a3b8);
}
.ag-sag-flow-card strong{
  font-size:11px;
  color:var(--foreground,#eef1f7);
}
.ag-sag-nov-banner{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  flex-wrap:wrap;
  padding:9px 11px;
  border-radius:10px;
  border:1px solid color-mix(in srgb,var(--primary,#3186ff) 32%,var(--border,rgba(148,163,184,.24)));
  background:linear-gradient(
    135deg,
    color-mix(in srgb,var(--primary,#3186ff) 11%,var(--card,transparent)),
    color-mix(in srgb,var(--success,#10b981) 6%,var(--card,transparent))
  );
}
.ag-sag-nov-meta{
  font-size:11px;
  color:var(--muted-foreground,#94a3b8);
  font-variant-numeric:tabular-nums;
}
.ag-sag-nov-grid{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(168px,1fr));
  gap:6px;
  width:100%;
}
.ag-sag-nov-card{
  appearance:none;
  display:flex;
  flex-direction:column;
  align-items:flex-start;
  gap:4px;
  padding:8px 9px;
  border-radius:9px;
  border:1px solid color-mix(in srgb,var(--border,rgba(148,163,184,.24)) 82%,transparent);
  background:color-mix(in srgb,var(--foreground,#eef1f7) 2%,var(--card,transparent));
  color:var(--foreground,#eef1f7);
  text-align:left;
  cursor:pointer;
  transition:border-color 130ms ease,background 130ms ease,transform 120ms ease;
}
.ag-sag-nov-card:hover{
  border-color:color-mix(in srgb,var(--primary,#3186ff) 48%,var(--border,rgba(148,163,184,.28)));
  transform:translateY(-1px);
}
.ag-sag-nov-card[aria-pressed="true"]{
  border-color:color-mix(in srgb,var(--primary,#3186ff) 56%,transparent);
  background:color-mix(in srgb,var(--primary,#3186ff) 11%,var(--card,transparent));
}
.ag-sag-nov-card[data-privacy="opt-in-network"][aria-pressed="true"]{
  border-color:color-mix(in srgb,var(--warning,#f59e0b) 58%,transparent);
  background:color-mix(in srgb,var(--warning,#f59e0b) 11%,var(--card,transparent));
}
.ag-sag-nov-card-top{
  width:100%;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:6px;
}
.ag-sag-nov-card-name{
  font-size:11.5px;
  font-weight:600;
  color:var(--foreground,#eef1f7);
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.ag-sag-nov-led{
  width:7px;
  height:7px;
  border-radius:999px;
  flex:0 0 auto;
  background:color-mix(in srgb,var(--muted-foreground,#94a3b8) 38%,transparent);
}
.ag-sag-nov-card[aria-pressed="true"] .ag-sag-nov-led{
  background:var(--success,#10b981);
  box-shadow:0 0 0 2px color-mix(in srgb,var(--success,#10b981) 24%,transparent);
}
.ag-sag-nov-card[data-privacy="opt-in-network"][aria-pressed="true"] .ag-sag-nov-led{
  background:var(--warning,#f59e0b);
  box-shadow:0 0 0 2px color-mix(in srgb,var(--warning,#f59e0b) 24%,transparent);
}
.ag-sag-nov-card-tags{
  display:flex;
  align-items:center;
  gap:4px;
  flex-wrap:wrap;
}
.ag-sag-nov-tag{
  display:inline-flex;
  align-items:center;
  padding:1px 5px;
  border-radius:999px;
  font-size:9.5px;
  font-weight:600;
  line-height:1.35;
  border:1px solid color-mix(in srgb,var(--border,rgba(148,163,184,.24)) 80%,transparent);
  color:var(--muted-foreground,#94a3b8);
  background:color-mix(in srgb,var(--secondary,rgba(148,163,184,.12)) 55%,transparent);
}
.ag-sag-nov-tag[data-kind="network"]{
  border-color:color-mix(in srgb,var(--warning,#f59e0b) 50%,transparent);
  color:var(--warning,#f59e0b);
  background:color-mix(in srgb,var(--warning,#f59e0b) 12%,transparent);
}
.ag-sag-synergy-box{
  display:flex;
  flex-direction:column;
  gap:6px;
  padding:9px 10px;
  border-radius:10px;
  border:1px solid color-mix(in srgb,var(--border,rgba(148,163,184,.22)) 78%,transparent);
  background:color-mix(in srgb,var(--foreground,#eef1f7) 2.5%,var(--card,transparent));
}
.ag-sag-synergy-title{
  font-size:11.5px;
  font-weight:600;
  color:var(--foreground,#eef1f7);
}
.ag-sag-synergy-list{
  display:flex;
  flex-direction:column;
  gap:6px;
}
.ag-sag-synergy-item{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  flex-wrap:wrap;
  padding:7px 9px;
  border-radius:8px;
  border:1px solid color-mix(in srgb,var(--border,rgba(148,163,184,.22)) 78%,transparent);
  border-left:3px solid var(--primary,#3186ff);
  background:color-mix(in srgb,var(--primary,#3186ff) 5%,var(--card,transparent));
}
.ag-sag-synergy-item[data-status="active"]{
  border-left-color:var(--success,#10b981);
  background:color-mix(in srgb,var(--success,#10b981) 7%,var(--card,transparent));
}
.ag-sag-synergy-item[data-status="recommend"],
.ag-sag-synergy-item[data-status="warn"]{
  border-left-color:var(--warning,#f59e0b);
  background:color-mix(in srgb,var(--warning,#f59e0b) 8%,var(--card,transparent));
}
.ag-sag-synergy-item[data-status="tip"]{
  border-left-color:var(--primary,#3186ff);
  background:color-mix(in srgb,var(--primary,#3186ff) 7%,var(--card,transparent));
}
.ag-sag-synergy-item[data-status="connected"]{
  border-left-color:var(--primary,#3186ff);
  background:linear-gradient(
    90deg,
    color-mix(in srgb,var(--primary,#3186ff) 10%,var(--card,transparent)),
    color-mix(in srgb,var(--success,#10b981) 5%,var(--card,transparent))
  );
}
.ag-sag-synergy-text{
  font-size:11px;
  line-height:1.4;
  color:var(--foreground,#eef1f7);
  flex:1 1 180px;
}
.ag-sag-synergy-act{
  appearance:none;
  border:1px solid color-mix(in srgb,var(--primary,#3186ff) 52%,transparent);
  background:color-mix(in srgb,var(--primary,#3186ff) 16%,var(--card,transparent));
  color:var(--primary,#3186ff);
  border-radius:999px;
  padding:3px 10px;
  font:600 10.5px/1.35 Inter,system-ui,-apple-system,sans-serif;
  cursor:pointer;
  white-space:nowrap;
  transition:filter 120ms ease,background 120ms ease;
}
.ag-sag-synergy-act:hover{
  filter:brightness(1.08);
  background:color-mix(in srgb,var(--primary,#3186ff) 24%,var(--card,transparent));
}
.ag-sag-nov-promo{
  display:flex;
  flex-direction:column;
  gap:8px;
  padding:12px 13px;
  border-radius:11px;
  border:1px dashed color-mix(in srgb,var(--primary,#3186ff) 42%,var(--border,rgba(148,163,184,.28)));
  background:linear-gradient(
    135deg,
    color-mix(in srgb,var(--primary,#3186ff) 8%,var(--card,transparent)),
    color-mix(in srgb,var(--foreground,#eef1f7) 3%,var(--card,transparent))
  );
}
.ag-sag-nov-promo-title{
  font-size:12px;
  font-weight:700;
  color:var(--foreground,#eef1f7);
}
.ag-sag-nov-promo-desc{
  font-size:11px;
  line-height:1.48;
  color:var(--muted-foreground,#94a3b8);
}
.ag-sag-nov-cmd-row{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  flex-wrap:wrap;
  padding:6px 9px;
  border-radius:8px;
  border:1px solid var(--border,rgba(148,163,184,.24));
  background:color-mix(in srgb,var(--background,#0b0d13) 72%,var(--card,transparent));
}
.ag-sag-nov-cmd-code{
  font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;
  color:var(--foreground,#0f172a);
  word-break:break-all;
}
.ag-sag-pack-ctrl{
  display:flex;
  flex-direction:column;
  gap:7px;
  width:100%;
}
.ag-sag-pack-editor{
  display:flex;
  flex-direction:column;
  gap:6px;
}
.ag-sag-pack-editor[hidden]{display:none!important;}
.ag-sag-pack-textarea{
  width:100%;
  min-height:88px;
  padding:7px 9px;
  border-radius:8px;
  border:1px solid var(--border,rgba(148,163,184,.28));
  background:color-mix(in srgb,var(--background,#f8fafc) 75%,var(--card,transparent));
  color:var(--foreground,#0f172a);
  font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;
  resize:vertical;
  box-sizing:border-box;
}
.ag-sag-pack-textarea:focus-visible{
  outline:2px solid var(--primary,#3186ff);
  outline-offset:1px;
}
.ag-sag-pack-actions{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  flex-wrap:wrap;
}
.ag-sag-pack-status{
  font-size:11px;
  line-height:1.4;
  color:var(--muted-foreground,#64748b);
  word-break:break-word;
}
.ag-sag-pack-status[data-tone="ok"]{color:var(--success,#059669);}
.ag-sag-pack-status[data-tone="error"]{color:var(--error,#dc2626);}
.ag-sag-chip:disabled{
  opacity:.46;
  cursor:not-allowed;
}
.ag-sg-btn:focus-visible,
.ag-sg-status-pill:focus-visible,
.ag-sg-seg button:focus-visible,
.ag-sg-radar-pill:focus-visible,
.ag-sg-bm-star:focus-visible,
.ag-sg-bm-chip:focus-visible,
.ag-sag-fold-head:focus-visible,
.ag-sag-dual-pill:focus-visible,
.ag-sag-subtab:focus-visible,
.ag-sag-select:focus-visible,
.ag-sag-chip:focus-visible,
.ag-sag-nov-card:focus-visible,
.ag-sag-synergy-act:focus-visible{
  outline:2px solid var(--primary,#3186ff);
  outline-offset:2px;
}
`.trim();

  return { STYLE_ID, CORE_CSS };
});
