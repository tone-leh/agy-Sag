// Antigravity Session Guard (领航哨) — 5-Locale UI Strings (UMD, zero runtime deps)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.__agSgI18n = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const PACKS = {
    'zh-CN': {
      brand: '领航哨',
      pillReached: '上下文已达 {pct}%（{used} / {max}）· 建议提前压缩',
      pillOverflow: '上下文已超限 {pct}%（{used} / {max}）· 强烈建议立即压缩',
      pillStreaming: '上下文已达 {pct}% · 本轮生成结束后可确认压缩',
      pillCountdown: '上下文 {pct}% · {sec}s 后自动发送 /compact',
      btnCompactNow: '确认压缩 /compact',
      btnFillOnly: '仅填入',
      btnExportMd: '先导出 MD',
      btnCancelCountdown: '取消自动',
      btnDismiss: '本轮忽略',
      btnSettings: '压缩阈值设置',
      toastSent: '已发送 /compact',
      toastFilled: '已填入 /compact，请按回车发送',
      toastExported: '已复制脱敏复盘 Markdown（{turns} 轮）',
      toastExportEmpty: '当前未检测到可导出的对话轮次',
      toastDraftProtected: '检测到输入框有未发送草稿，已取消自动填入以防覆盖',
      toastStreamingBlocked: '当前回合正在生成中，请待回复结束后再压缩',
      cfgTitle: '上下文压缩守卫',
      cfgThreshold: '触发预警阈值',
      cfgThresholdOff: '关闭',
      cfgMode: '到达阈值时',
      cfgModeConfirm: '浮条确认',
      cfgModeFill: '仅填入',
      cfgModeCountdown: '空闲 5s 倒计时',
      cfgHint: '生成中不打断、有草稿绝不覆盖；压缩完成或回落 10% 后自动重置。',
      mdTitle: 'Antigravity 会话复盘导出',
      mdExportedAt: '导出时间',
      mdContext: '上下文占用',
      mdConversation: '会话 ID',
      mdTurn: '第 {n} 轮',
      mdUser: '用户提问',
      mdAssistant: '助手回复',
      mdBookmarkedTag: '★ 书签',
    },
    'zh-TW': {
      brand: '領航哨',
      pillReached: '上下文已達 {pct}%（{used} / {max}）· 建議提前壓縮',
      pillOverflow: '上下文已超限 {pct}%（{used} / {max}）· 強烈建議立即壓縮',
      pillStreaming: '上下文已達 {pct}% · 本輪生成結束後可確認壓縮',
      pillCountdown: '上下文 {pct}% · {sec}s 後自動送出 /compact',
      btnCompactNow: '確認壓縮 /compact',
      btnFillOnly: '僅填入',
      btnExportMd: '先匯出 MD',
      btnCancelCountdown: '取消自動',
      btnDismiss: '本輪忽略',
      btnSettings: '壓縮閾值設定',
      toastSent: '已送出 /compact',
      toastFilled: '已填入 /compact，請按 Enter 送出',
      toastExported: '已複製脫敏復盤 Markdown（{turns} 輪）',
      toastExportEmpty: '目前未偵測到可匯出的對話輪次',
      toastDraftProtected: '偵測到輸入框有未送出草稿，已中止自動填入以防覆蓋',
      toastStreamingBlocked: '目前回合正在生成中，請待回覆結束後再壓縮',
      cfgTitle: '上下文壓縮守衛',
      cfgThreshold: '觸發預警閾值',
      cfgThresholdOff: '關閉',
      cfgMode: '到達閾值時',
      cfgModeConfirm: '浮條確認',
      cfgModeFill: '僅填入',
      cfgModeCountdown: '閒置 5s 倒數',
      cfgHint: '生成中不打斷、有草稿絕不覆蓋；壓縮完成或回落 10% 後自動重設。',
      mdTitle: 'Antigravity 會話復盤匯出',
      mdExportedAt: '匯出時間',
      mdContext: '上下文占用',
      mdConversation: '會話 ID',
      mdTurn: '第 {n} 輪',
      mdUser: '使用者提問',
      mdAssistant: '助手回覆',
      mdBookmarkedTag: '★ 書籤',
    },
    yue: {
      brand: '領航哨',
      pillReached: '上下文已經去到 {pct}%（{used} / {max}）· 建議提早壓縮',
      pillOverflow: '上下文超標 {pct}%（{used} / {max}）· 強烈建議即刻壓縮',
      pillStreaming: '上下文已達 {pct}% · 等呢輪出完回覆就可以確認壓縮',
      pillCountdown: '上下文 {pct}% · {sec}s 後自動送出 /compact',
      btnCompactNow: '確認壓縮 /compact',
      btnFillOnly: '淨係填入',
      btnExportMd: '先匯出 MD',
      btnCancelCountdown: '取消自動',
      btnDismiss: '呢輪忽略',
      btnSettings: '壓縮閾值設定',
      toastSent: '已經送出 /compact',
      toastFilled: '已填入 /compact，撳 Enter 就可以送出',
      toastExported: '已複製脫敏復盤 Markdown（{turns} 輪）',
      toastExportEmpty: '暫時搵唔到可以匯出嘅對話輪次',
      toastDraftProtected: '見到輸入框仲有草稿，已經停咗自動填入以免覆蓋',
      toastStreamingBlocked: '仲生成緊回覆，等佢完咗先至壓縮啦',
      cfgTitle: '上下文壓縮守衛',
      cfgThreshold: '觸發預警閾值',
      cfgThresholdOff: '關閉',
      cfgMode: '到達閾值時',
      cfgModeConfirm: '浮條確認',
      cfgModeFill: '淨係填入',
      cfgModeCountdown: '空閒 5s 倒數',
      cfgHint: '生成緊唔會打斷、有草稿絕唔覆蓋；壓縮完或者跌返 10% 會自動重設。',
      mdTitle: 'Antigravity 對話復盤匯出',
      mdExportedAt: '匯出時間',
      mdContext: '上下文占用',
      mdConversation: '對話 ID',
      mdTurn: '第 {n} 輪',
      mdUser: '用戶提問',
      mdAssistant: '助手回覆',
      mdBookmarkedTag: '★ 書籤',
    },
    en: {
      brand: 'Session Guard',
      pillReached: 'Context at {pct}% ({used} / {max}) · Ready to compact early',
      pillOverflow: 'Context exceeded {pct}% ({used} / {max}) · Compact recommended now',
      pillStreaming: 'Context at {pct}% · Waiting for active turn to finish before compact',
      pillCountdown: 'Context {pct}% · Auto-sending /compact in {sec}s',
      btnCompactNow: 'Compact Now',
      btnFillOnly: 'Insert Only',
      btnExportMd: 'Export MD',
      btnCancelCountdown: 'Cancel',
      btnDismiss: 'Dismiss',
      btnSettings: 'Compact Guard Settings',
      toastSent: 'Sent /compact',
      toastFilled: 'Inserted /compact into composer',
      toastExported: 'Copied redacted Markdown summary ({turns} turns)',
      toastExportEmpty: 'No conversation turns detected to export',
      toastDraftProtected: 'Composer has unsent draft text; skipped auto-fill to protect your draft',
      toastStreamingBlocked: 'Turn is still streaming; wait for completion before compacting',
      cfgTitle: 'Context Compaction Guard',
      cfgThreshold: 'Alert Threshold',
      cfgThresholdOff: 'Off',
      cfgMode: 'When Reached',
      cfgModeConfirm: 'Confirm Bar',
      cfgModeFill: 'Insert Only',
      cfgModeCountdown: 'Idle 5s Countdown',
      cfgHint: 'Never interrupts streaming turns or overwrites draft text; resets automatically after compaction.',
      mdTitle: 'Antigravity Session Recap',
      mdExportedAt: 'Exported At',
      mdContext: 'Context Usage',
      mdConversation: 'Conversation ID',
      mdTurn: 'Turn {n}',
      mdUser: 'User',
      mdAssistant: 'Assistant',
      mdBookmarkedTag: '★ Bookmarked',
    },
    ja: {
      brand: 'セッションガード',
      pillReached: 'コンテキスト {pct}%（{used} / {max}）· 早めの圧縮を推奨',
      pillOverflow: 'コンテキスト上限超過 {pct}%（{used} / {max}）· 今すぐ圧縮を推奨',
      pillStreaming: 'コンテキスト {pct}% · 応答完了後に圧縮を確認できます',
      pillCountdown: 'コンテキスト {pct}% · {sec}秒後に /compact を自動送信',
      btnCompactNow: '今すぐ圧縮',
      btnFillOnly: '入力のみ',
      btnExportMd: '先に MD 出力',
      btnCancelCountdown: '自動中止',
      btnDismiss: '今回無視',
      btnSettings: '圧縮しきい値設定',
      toastSent: '/compact を送信しました',
      toastFilled: '/compact を入力欄に挿入しました',
      toastExported: '機密マスキング済 Markdown をコピーしました（{turns} ターン）',
      toastExportEmpty: 'エクスポート可能な会話ターンが見つかりません',
      toastDraftProtected: '入力中の下書きを保護するため自動挿入を中止しました',
      toastStreamingBlocked: '応答生成中のため完了後に圧縮してください',
      cfgTitle: 'コンテキスト圧縮ガード',
      cfgThreshold: '警告しきい値',
      cfgThresholdOff: 'オフ',
      cfgMode: '到達時の動作',
      cfgModeConfirm: '確認バー',
      cfgModeFill: '入力のみ',
      cfgModeCountdown: '待機 5秒カウント',
      cfgHint: '生成中は中断せず下書きも上書きしません。圧縮完了または 10% 低下で自動リセットされます。',
      mdTitle: 'Antigravity セッション振り返り',
      mdExportedAt: '出力日時',
      mdContext: 'コンテキスト使用率',
      mdConversation: '会話 ID',
      mdTurn: 'ターン {n}',
      mdUser: 'ユーザー',
      mdAssistant: 'アシスタント',
      mdBookmarkedTag: '★ ブックマーク',
    },
  };

  function normalizeLang(raw) {
    const s = String(raw || '').trim();
    if (/^yue\b|^zh[-_](?:hk|mo)/i.test(s)) return 'yue';
    if (/^zh[-_](?:tw|hant)/i.test(s)) return 'zh-TW';
    if (/^zh/i.test(s)) return 'zh-CN';
    if (/^ja/i.test(s)) return 'ja';
    if (/^en/i.test(s)) return 'en';
    return 'zh-CN';
  }

  function detectLang(doc, win) {
    const html = doc?.documentElement;
    const raw =
      html?.getAttribute?.('data-ag-cs-lang') ||
      html?.getAttribute?.('lang') ||
      win?.navigator?.language ||
      'zh-CN';
    return normalizeLang(raw);
  }

  function getStrings(lang) {
    return PACKS[normalizeLang(lang)] || PACKS['zh-CN'];
  }

  function formatTemplate(tpl, vars) {
    return String(tpl || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) =>
      vars && Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : ''
    );
  }

  return { PACKS, normalizeLang, detectLang, getStrings, formatTemplate };
});
