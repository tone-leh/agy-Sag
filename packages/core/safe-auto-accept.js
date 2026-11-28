// agy-Sag — Rule-Based Safe Auto-Accept Controller (UMD, zero runtime deps)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.__agSagSafeAutoAccept = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  const MAX_AUDIT_ENTRIES = 50;
  const DEFAULT_COOLDOWN_MS = 1500;
  const MAX_SNIPPET_CHARS = 160;
  const MAX_CARD_TEXT_CHARS = 8192;
  const MAX_CUSTOM_MATCH_CHARS = 4096;
  const MAX_BUTTON_TEXT_CHARS = 256;
  const MAX_CUSTOM_PATTERN_CHARS = 200;
  const MAX_READONLY_PROMPT_CHARS = 300;

  const CRITICAL_RM_PATH_RE = /^\/(?:(?:etc|usr|var|bin|sbin|lib|lib64|boot|dev|proc|sys|home|Users|System|Applications|Library|root)(?:\/|$)|\*|$)/i;
  const GIT_GLOBAL_OPTS_WITH_VALUE = new Set([
    '-c',
    '-C',
    '--git-dir',
    '--work-tree',
    '--namespace',
    '--super-prefix',
    '--config-env',
    '--exec-path',
    '--list-cmds',
  ]);
  const INTERPRETER_BASENAME_RE = /^(?:sh|bash|zsh|dash|ksh|fish|python[0-9.]*|node|perl|ruby|php|pwsh|powershell)(?:\.exe)?$/i;
  const SQL_TAUTOLOGY_WHERE_RE = /(?:\b1\s*=\s*1\b|\b0\s*=\s*0\b|\btrue\b|'1'\s*=\s*'1'|"1"\s*=\s*"1"|\bor\s+1\b)/i;

  function normalizeForHardDeny(text) {
    return String(text || '')
      .replace(/\\[ \t]*\r?\n\s*/g, ' ')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+/g, ' ');
  }

  function tokenizeShellLine(str) {
    const tokens = [];
    let cur = '';
    let quote = '';
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (quote) {
        if (ch === '\\' && quote === '"' && i + 1 < str.length) {
          cur += str[++i];
        } else if (ch === quote) {
          quote = '';
        } else {
          cur += ch;
        }
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        continue;
      }
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        if (cur) {
          tokens.push(cur);
          cur = '';
        }
        continue;
      }
      if (ch === '&' || ch === ';' || ch === '|' || ch === '(' || ch === ')') {
        if (cur) {
          tokens.push(cur);
          cur = '';
        }
        tokens.push(ch);
        continue;
      }
      cur += ch;
    }
    if (cur) tokens.push(cur);
    return tokens;
  }

  function isBinaryToken(tok, name) {
    const lower = String(tok || '').toLowerCase();
    return (
      lower === name ||
      lower === `${name}.exe` ||
      lower.endsWith(`/${name}`) ||
      lower.endsWith(`\\${name}`) ||
      lower.endsWith(`/${name}.exe`) ||
      lower.endsWith(`\\${name}.exe`)
    );
  }

  function parseGitInvocations(cmd) {
    const tokens = tokenizeShellLine(cmd);
    const results = [];
    const stopTokens = new Set(['&', ';', '|', ')']);
    for (let i = 0; i < tokens.length; i++) {
      if (!isBinaryToken(tokens[i], 'git')) continue;
      const globalArgs = [];
      let j = i + 1;
      while (j < tokens.length && !stopTokens.has(tokens[j])) {
        const t = tokens[j];
        if (t === '--') {
          j += 1;
          break;
        }
        if (!t.startsWith('-')) break;
        globalArgs.push(t);
        if (GIT_GLOBAL_OPTS_WITH_VALUE.has(t) && j + 1 < tokens.length && !stopTokens.has(tokens[j + 1])) {
          globalArgs.push(tokens[j + 1]);
          j += 2;
        } else {
          j += 1;
        }
      }
      const subcommand = j < tokens.length && !stopTokens.has(tokens[j]) ? tokens[j].toLowerCase() : '';
      const subArgs = [];
      if (subcommand) {
        j += 1;
        while (j < tokens.length && !stopTokens.has(tokens[j])) {
          subArgs.push(tokens[j]);
          j += 1;
        }
      }
      results.push({ globalArgs, subcommand, subArgs });
    }
    return results;
  }

  function parseRmInvocations(cmd) {
    const tokens = tokenizeShellLine(cmd);
    const results = [];
    const stopTokens = new Set(['&', ';', '|', ')']);
    for (let i = 0; i < tokens.length; i++) {
      if (!isBinaryToken(tokens[i], 'rm')) continue;
      let hasRecursive = false;
      let hasForce = false;
      let hasCriticalPath = false;
      let afterDoubleDash = false;
      for (let j = i + 1; j < tokens.length && !stopTokens.has(tokens[j]); j++) {
        const t = tokens[j];
        if (!afterDoubleDash && t === '--') {
          afterDoubleDash = true;
          continue;
        }
        if (!afterDoubleDash && t.startsWith('-')) {
          const lower = t.toLowerCase();
          if (lower === '--recursive' || /^-[a-z]*r[a-z]*$/i.test(t)) hasRecursive = true;
          if (lower === '--force' || /^-[a-z]*f[a-z]*$/i.test(t)) hasForce = true;
          continue;
        }
        if (CRITICAL_RM_PATH_RE.test(t)) {
          hasCriticalPath = true;
        }
      }
      results.push({ hasRecursive, hasForce, hasCriticalPath });
    }
    return results;
  }

  function buildHardDenyContext(rawText) {
    const normalized = normalizeForHardDeny(rawText);
    const statements = normalized.split(/[;\r\n]+/).map((s) => s.trim()).filter(Boolean);
    const chainSegments = normalized.split(/(?:[\r\n;]+|&&|\|\|)/).map((s) => s.trim()).filter(Boolean);
    const atomicCmds = [];
    for (let i = 0; i < chainSegments.length; i++) {
      const parts = chainSegments[i].split('|');
      for (let j = 0; j < parts.length; j++) {
        const p = parts[j].trim();
        if (p) atomicCmds.push(p);
      }
    }
    const gitInvocations = [];
    const rmInvocations = [];
    for (let i = 0; i < atomicCmds.length; i++) {
      const cmd = atomicCmds[i];
      if (/\bgit\b/i.test(cmd)) {
        const parsed = parseGitInvocations(cmd);
        for (let k = 0; k < parsed.length; k++) gitInvocations.push(parsed[k]);
      }
      if (/\brm\b/i.test(cmd)) {
        const parsed = parseRmInvocations(cmd);
        for (let k = 0; k < parsed.length; k++) rmInvocations.push(parsed[k]);
      }
    }
    return { normalized, statements, chainSegments, atomicCmds, gitInvocations, rmInvocations };
  }

  const SUDO_OPTS_WITH_VALUE = new Set(['-u', '-g', '-h', '-p', '-C', '-T', '-r', '-t']);
  const ENV_OPTS_WITH_VALUE = new Set(['-u', '-C']);

  function stageInvokesInterpreter(stage) {
    const tokens = tokenizeShellLine(stage);
    let idx = 0;
    while (idx < tokens.length) {
      const tok = tokens[idx];
      const base = tok.split(/[\\/]/).pop().toLowerCase();
      if (base === 'sudo' || base === 'env' || base === 'command' || base === 'exec') {
        const optsWithVal = base === 'sudo' ? SUDO_OPTS_WITH_VALUE : base === 'env' ? ENV_OPTS_WITH_VALUE : null;
        idx += 1;
        while (idx < tokens.length && tokens[idx].startsWith('-')) {
          const opt = tokens[idx];
          idx += 1;
          if (optsWithVal && optsWithVal.has(opt) && idx < tokens.length) {
            idx += 1;
          }
        }
        continue;
      }
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tok)) {
        idx += 1;
        continue;
      }
      return INTERPRETER_BASENAME_RE.test(base);
    }
    return false;
  }

  function matchesRemotePipeExec(chainSegments, downloaderRe) {
    for (let i = 0; i < chainSegments.length; i++) {
      const seg = chainSegments[i];
      if (!seg.includes('|') || !downloaderRe.test(seg)) continue;
      const stages = seg.split('|');
      let seenDownloader = false;
      for (let j = 0; j < stages.length; j++) {
        const st = stages[j].trim();
        if (!seenDownloader) {
          if (downloaderRe.test(st)) seenDownloader = true;
        } else if (stageInvokesInterpreter(st)) {
          return true;
        }
      }
    }
    return false;
  }

  function matchesSqlDelete(statements, mode) {
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const delMatch = /\bdelete\s+from\b/i.exec(stmt);
      if (!delMatch) continue;
      const afterDelete = stmt.slice(delMatch.index + delMatch[0].length);
      const whereMatch = /\bwhere\b/i.exec(afterDelete);
      if (mode === 'unbounded') {
        if (!whereMatch) return true;
      } else if (mode === 'tautology') {
        if (whereMatch) {
          const whereClause = afterDelete.slice(whereMatch.index + whereMatch[0].length);
          if (SQL_TAUTOLOGY_WHERE_RE.test(whereClause)) return true;
        }
      }
    }
    return false;
  }

  // Ironclad non-bypassable hard-deny patterns: ALWAYS block auto-accept across ALL policies including "custom".
  // Every rule uses strictly linear O(n) matching (no nested/adjacent wildcard backtracking).
  const HARD_DENY_PATTERNS = Object.freeze([
    // Deletion & disk destruction
    Object.freeze({
      id: 'rm-rf',
      label: 'rm -rf / rm -fr',
      pattern: /\brm\s+(?:-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*)\b/i,
      match: (ctx) => ctx.rmInvocations.some((inv) => inv.hasRecursive && inv.hasForce),
    }),
    Object.freeze({
      id: 'rm-r-root',
      label: 'rm -r / or critical system directory',
      pattern: /\brm\s+(?:-[a-zA-Z]*r[a-zA-Z]*|--recursive)\s+\/(?:etc|usr|var|bin|sbin|lib|lib64|boot|dev|proc|sys|home|Users|System|Applications|Library|root|\*|\s|$)/i,
      match: (ctx) => ctx.rmInvocations.some((inv) => inv.hasRecursive && inv.hasCriticalPath),
    }),
    Object.freeze({
      id: 'mkfs',
      label: 'mkfs',
      pattern: /\bmkfs(?:\.[a-z0-9_-]+)?\b/i,
    }),
    Object.freeze({
      id: 'dd-if',
      label: 'dd if=',
      pattern: /\bdd\s+if=/i,
      match: (ctx) => ctx.atomicCmds.some((cmd) => /\bdd\b/i.test(cmd) && /(?:^|\s)if=/i.test(cmd)),
    }),
    Object.freeze({
      id: 'dd-of',
      label: 'dd of=',
      pattern: /\bdd\s+of=/i,
      match: (ctx) => ctx.atomicCmds.some((cmd) => /\bdd\b/i.test(cmd) && /(?:^|\s)of=/i.test(cmd)),
    }),
    Object.freeze({
      id: 'shred',
      label: 'shred',
      pattern: /\bshred\s+/i,
    }),
    Object.freeze({
      id: 'format',
      label: 'format',
      pattern: /\bformat\s+/i,
    }),
    Object.freeze({
      id: 'win-del-force',
      label: 'del /f /s /q',
      pattern: /\bdel\s+\/[a-zA-Z]*[fsq]/i,
      match: (ctx) => ctx.atomicCmds.some((cmd) => /\bdel\b/i.test(cmd) && /(?:^|\s)\/[a-zA-Z]*[fsq][a-zA-Z]*(?=\s|$|:)/i.test(cmd)),
    }),
    Object.freeze({
      id: 'win-rmdir-s',
      label: 'rmdir /s or rd /s',
      pattern: /\b(?:rmdir|rd)\s+\/[a-zA-Z]*s/i,
      match: (ctx) => ctx.atomicCmds.some((cmd) => /\b(?:rmdir|rd)\b/i.test(cmd) && /(?:^|\s)\/[a-zA-Z]*s[a-zA-Z]*(?=\s|$)/i.test(cmd)),
    }),
    Object.freeze({
      id: 'ps-remove-item',
      label: 'Remove-Item -Recurse / -Force',
      pattern: /\bRemove-Item\s+-(?:Recurse|Force)\b/i,
      match: (ctx) => ctx.atomicCmds.some((cmd) => /\bRemove-Item\b/i.test(cmd) && /(?:^|\s)-(?:Recurse|Force)\b/i.test(cmd)),
    }),
    Object.freeze({
      id: 'ps-clear-content',
      label: 'Clear-Content',
      pattern: /\bClear-Content\b/i,
    }),
    Object.freeze({
      id: 'ps-format-volume',
      label: 'Format-Volume',
      pattern: /\bFormat-Volume\b/i,
    }),
    Object.freeze({
      id: 'rsync-delete',
      label: 'rsync --delete',
      pattern: /\brsync\s+--delete\b/i,
      match: (ctx) => ctx.atomicCmds.some((cmd) => /\brsync\b/i.test(cmd) && /(?:^|\s)--delete(?:-[a-z]+)?(?=\s|$|=)/i.test(cmd)),
    }),

    // Destructive Git write operations (handles global options like `git -C /repo`, `git -c k=v`, combined short flags & +refspec)
    Object.freeze({
      id: 'git-push-force',
      label: 'git push --force / -f / --force-with-lease / +refspec',
      pattern: /\bgit\s+push\s+(?:--force(?:-with-lease)?\b|-[a-zA-Z]*f[a-zA-Z]*\b|\+[a-zA-Z0-9._/-]+)/i,
      match: (ctx) =>
        ctx.gitInvocations.some((inv) => {
          if (inv.subcommand !== 'push') return false;
          for (let i = 0; i < inv.subArgs.length; i++) {
            const arg = inv.subArgs[i];
            if (/^--force(?:-with-lease|-if-includes)?(?:=|$)/i.test(arg)) return true;
            if (/^-[a-zA-Z]*f[a-zA-Z]*$/i.test(arg)) return true;
            if (!arg.startsWith('-') && /(?:^|:)\+[a-zA-Z0-9._/@~^-]+/.test(arg)) return true;
          }
          return false;
        }),
    }),
    Object.freeze({
      id: 'git-reset-hard',
      label: 'git reset --hard',
      pattern: /\bgit\s+reset\s+--hard\b/i,
      match: (ctx) =>
        ctx.gitInvocations.some(
          (inv) => inv.subcommand === 'reset' && inv.subArgs.some((arg) => /^--hard$/i.test(arg))
        ),
    }),
    Object.freeze({
      id: 'git-clean-force',
      label: 'git clean -f',
      pattern: /\bgit\s+clean\s+(?:-[a-zA-Z]*f[a-zA-Z]*\b|--force\b)/i,
      match: (ctx) =>
        ctx.gitInvocations.some(
          (inv) =>
            inv.subcommand === 'clean' &&
            inv.subArgs.some((arg) => /^--force$/i.test(arg) || /^-[a-zA-Z]*f[a-zA-Z]*$/i.test(arg))
        ),
    }),

    // Destructive SQL / database operations (linear statement-split matching, zero quadratic backtracking)
    Object.freeze({
      id: 'sql-drop-table',
      label: 'DROP TABLE',
      pattern: /\bdrop\s+table\b/i,
    }),
    Object.freeze({
      id: 'sql-drop-database',
      label: 'DROP DATABASE',
      pattern: /\bdrop\s+database\b/i,
    }),
    Object.freeze({
      id: 'sql-drop-schema',
      label: 'DROP SCHEMA',
      pattern: /\bdrop\s+schema\b/i,
    }),
    Object.freeze({
      id: 'sql-truncate-table',
      label: 'TRUNCATE TABLE',
      pattern: /\btruncate\s+table\b/i,
    }),
    Object.freeze({
      id: 'sql-delete-unbounded',
      label: 'DELETE FROM without safe WHERE',
      pattern: /\bdelete\s+from\s+[a-z0-9_."`[\]-]+\s*(?:;|$)/i,
      match: (ctx) => matchesSqlDelete(ctx.statements, 'unbounded'),
    }),
    Object.freeze({
      id: 'sql-delete-tautology',
      label: 'DELETE FROM with tautology WHERE',
      pattern: /\bdelete\s+from\s+[a-z0-9_."`[\]-]+\s+where\s+(?:\b1\s*=\s*1\b|\btrue\b|'1'\s*=\s*'1'|\bor\s+1\b)/i,
      match: (ctx) => matchesSqlDelete(ctx.statements, 'tautology'),
    }),

    // Remote script execution & privilege escalation
    Object.freeze({
      id: 'curl-pipe-shell',
      label: 'curl | interpreter',
      pattern: /\bcurl\b[^|\n]{0,200}\|\s*(?:sudo\s+)?(?:\/[a-zA-Z0-9_.\/-]*\/)?(?:sh|bash|zsh|dash|ksh|fish|python[0-9.]*|node|perl|ruby|php|pwsh|powershell)\b/i,
      match: (ctx) => matchesRemotePipeExec(ctx.chainSegments, /\bcurl\b/i),
    }),
    Object.freeze({
      id: 'wget-pipe-shell',
      label: 'wget | interpreter',
      pattern: /\bwget\b[^|\n]{0,200}\|\s*(?:sudo\s+)?(?:\/[a-zA-Z0-9_.\/-]*\/)?(?:sh|bash|zsh|dash|ksh|fish|python[0-9.]*|node|perl|ruby|php|pwsh|powershell)\b/i,
      match: (ctx) => matchesRemotePipeExec(ctx.chainSegments, /\bwget\b/i),
    }),
    Object.freeze({
      id: 'process-sub-remote-exec',
      label: 'sh/source <(curl/wget)',
      pattern: /(?:(?:ba|z|da|k)?sh|fish|source|\.|python[0-9.]*|node|perl|ruby|php|pwsh|powershell)(?:\s+-[a-zA-Z]+){0,3}\s+<\(\s*(?:curl|wget)\b/i,
    }),
    Object.freeze({
      id: 'sudo',
      label: 'sudo',
      pattern: /\bsudo\s+/i,
    }),
    Object.freeze({
      id: 'chmod-777',
      label: 'chmod 777',
      pattern: /\bchmod\s+(?:-[a-zA-Z]+\s+)*0?777\b/i,
    }),
    Object.freeze({
      id: 'chown-recursive',
      label: 'chown -R',
      pattern: /\bchown\s+(?:-[a-zA-Z]*R[a-zA-Z]*|--recursive)\b/i,
    }),
    Object.freeze({
      id: 'kill-9',
      label: 'kill -9',
      pattern: /\bkill\s+(?:-9|-KILL|-SIGKILL)\b/i,
    }),
    Object.freeze({
      id: 'shutdown',
      label: 'shutdown',
      pattern: /\bshutdown\b/i,
    }),
    Object.freeze({
      id: 'reboot',
      label: 'reboot',
      pattern: /\breboot\b/i,
    }),

    // Windows PowerShell / CMD destructive & remote execution commands
    Object.freeze({
      id: 'win-remove-item-force',
      label: 'Remove-Item -Recurse -Force',
      pattern: /\b(?:remove-item|ri)\b[^\n;|&]{0,160}(?:-recurse\b[^\n;|&]{0,80}-force\b|-force\b[^\n;|&]{0,80}-recurse\b|-r\b[^\n;|&]{0,60}-fo\b)/i,
    }),
    Object.freeze({
      id: 'win-cmd-rd-del-force',
      label: 'rd /s /q or del /f /s',
      pattern: /\b(?:(?:rd|rmdir)\b[^\n;|&]{0,100}\/s\b[^\n;|&]{0,40}\/q\b|(?:del|erase)\b[^\n;|&]{0,100}\/f\b[^\n;|&]{0,40}\/s\b)/i,
    }),
    Object.freeze({
      id: 'win-iwr-iex',
      label: 'PowerShell irm/iwr | iex',
      pattern: /\b(?:irm|iwr|invoke-webrequest|invoke-restmethod)\b[^\n|]{0,180}\|\s*(?:iex|invoke-expression)\b|\b(?:iex|invoke-expression)\s*\(\s*(?:irm|iwr|invoke-webrequest|invoke-restmethod)\b/i,
    }),
    Object.freeze({
      id: 'win-disk-format',
      label: 'format / Clear-Disk / diskpart',
      pattern: /\b(?:clear-disk|diskpart|format\s+[a-z]:)\b/i,
    }),
    Object.freeze({
      id: 'win-taskkill-force',
      label: 'taskkill /F or Stop-Process -Force',
      pattern: /\b(?:taskkill\b[^\n;|&]{0,80}\/f\b|stop-process\b[^\n;|&]{0,80}-force\b)/i,
    }),

    // Sensitive credentials & system paths
    Object.freeze({
      id: 'dotenv',
      label: '.env file',
      pattern: /(?:^|[\s"'`\/\\<>|&;=():,])\.env(?:\.[a-zA-Z0-9_-]+){0,4}(?=$|[\s"'`\/\\<>|&;=():,])/i,
    }),
    Object.freeze({
      id: 'id-rsa',
      label: 'id_rsa key',
      pattern: /\bid_rsa(?:\.pub)?\b/i,
    }),
    Object.freeze({
      id: 'id-ed25519',
      label: 'id_ed25519 key',
      pattern: /\bid_ed25519(?:\.pub)?\b/i,
    }),
    Object.freeze({
      id: 'ssh-dir',
      label: '~/.ssh or /.ssh/',
      pattern: /(?:~|\/)\.ssh(?:\/|\b)/i,
    }),
    Object.freeze({
      id: 'etc-passwd',
      label: '/etc/passwd',
      pattern: /\/etc\/passwd\b/i,
    }),
    Object.freeze({
      id: 'etc-shadow',
      label: '/etc/shadow',
      pattern: /\/etc\/shadow\b/i,
    }),
    Object.freeze({
      id: 'aws-credentials',
      label: 'aws/credentials',
      pattern: /aws[\/\\]credentials\b/i,
    }),
    Object.freeze({
      id: 'secrets',
      label: 'secrets',
      pattern: /(?:^|[\s"'`\/\\~.-])secrets(?=$|[\/\\.\s"'`:;,)])/i,
    }),
  ]);

  const READONLY_COMMAND_PATTERNS = Object.freeze([
    { id: 'git-status', pattern: /^git\s+status(?:\s|$)/i },
    { id: 'git-diff', pattern: /^git\s+diff(?:\s|$)/i },
    { id: 'git-log', pattern: /^git\s+log(?:\s|$)/i },
    { id: 'ls', pattern: /^ls(?:\s|$)/i },
    { id: 'cat', pattern: /^cat(?:\s|$)/i },
    { id: 'rg', pattern: /^rg(?:\s|$)/i },
    { id: 'grep', pattern: /^grep(?:\s|$)/i },
    { id: 'find', pattern: /^find(?:\s|$)/i },
    { id: 'pwd', pattern: /^pwd(?:\s|$)/i },
    { id: 'which', pattern: /^which(?:\s|$)/i },
  ]);

  const DEV_FLOW_COMMAND_PATTERNS = Object.freeze([
    { id: 'npm-test', pattern: /^npm\s+(?:run\s+)?test(?:[:\w-]*)?(?:\s|$)/i },
    { id: 'npm-lint', pattern: /^npm\s+run\s+lint(?:[:\w-]*)?(?:\s|$)/i },
    { id: 'npm-typecheck', pattern: /^npm\s+run\s+typecheck(?:[:\w-]*)?(?:\s|$)/i },
    { id: 'npm-build', pattern: /^npm\s+run\s+build(?:[:\w-]*)?(?:\s|$)/i },
    { id: 'pnpm-test', pattern: /^pnpm\s+(?:run\s+)?(?:test|lint|typecheck|build)(?:[:\w-]*)?(?:\s|$)/i },
    { id: 'yarn-test', pattern: /^yarn\s+(?:run\s+)?(?:test|lint|typecheck|build)(?:[:\w-]*)?(?:\s|$)/i },
    { id: 'vitest', pattern: /^(?:npx\s+)?vitest(?:\s|$)/i },
    { id: 'jest', pattern: /^(?:npx\s+)?jest(?:\s|$)/i },
    { id: 'pytest', pattern: /^(?:python3?\s+-m\s+)?pytest(?:\s|$)/i },
    { id: 'go-test', pattern: /^go\s+test(?:\s|$)/i },
    { id: 'cargo-test', pattern: /^cargo\s+test(?:\s|$)/i },
    { id: 'tsc-noemit', pattern: /^(?:npx\s+)?tsc(?:\s|$)/i, extraCheck: (cmd) => /(?:^|\s)--noEmit(?:\s|$)/i.test(cmd) },
    { id: 'node-test', pattern: /^node\s+--test(?:\s|$)/i },
  ]);

  const POLICY_PRESETS = Object.freeze({
    'readonly-safe': Object.freeze({
      id: 'readonly-safe',
      description: 'Only allow explicit read-only views, continuation prompts, and safe read-only commands.',
      allowButtons: Object.freeze(['Proceed', 'Continue', 'Allow Read', 'View', 'Open']),
      commands: Object.freeze(['git status', 'git diff', 'git log', 'ls', 'cat', 'rg', 'grep', 'find', 'pwd', 'which']),
    }),
    'dev-flow': Object.freeze({
      id: 'dev-flow',
      description: 'Includes readonly-safe plus common local test, lint, typecheck, and build commands.',
      allowButtons: Object.freeze(['Proceed', 'Continue', 'Allow Read', 'View', 'Open']),
      commands: Object.freeze([
        'git status', 'git diff', 'git log', 'ls', 'cat', 'rg', 'grep', 'find', 'pwd', 'which',
        'npm test', 'npm run test', 'npm run lint', 'npm run typecheck', 'npm run build',
        'pnpm test', 'yarn test', 'vitest', 'jest', 'pytest', 'go test', 'cargo test', 'tsc --noEmit', 'node --test',
      ]),
    }),
    custom: Object.freeze({
      id: 'custom',
      description: 'Match user-supplied allowlist patterns after mandatory HARD_DENY_PATTERNS enforcement.',
      allowButtons: Object.freeze([]),
      commands: Object.freeze([]),
    }),
  });

  const VALID_POLICIES = new Set(Object.keys(POLICY_PRESETS));

  const NEGATIVE_BUTTON_RE = /\b(?:deny|reject|cancel|abort|disallow|decline|dismiss|stop|close|don't|do not|never)\b|拒绝|取消|禁止|关闭|停止/i;
  const PERSISTENT_ALLOW_BUTTON_RE = /\b(?:always\s+allow|allow\s+for\s+this\s+workspace|allow\s+all)\b|始终允许|本工作区内允许/i;
  const POSITIVE_BUTTON_RE = /\b(?:allow|accept|approve|run|proceed|continue|confirm)\b|允许|批准|继续|运行/i;
  const READONLY_BUTTON_RE = /^(?:proceed|continue|allow|allow\s+read|accept|approve|confirm|view|open|继续|允许|批准|允许读取|查看)$/i;
  const CROSS_WORKSPACE_RE = /\b(?:outside\s+(?:the\s+)?(?:current\s+)?(?:workspace|project|repo(?:sitory)?)|non-workspace|cross-repo(?:sitory)?|(?:another|different)\s+(?:workspace|repo|repository|project))\b|工作区外|跨仓|外部仓库|其他项目/i;
  const PATH_TRAVERSAL_RE = /(?:^|[^.])\.\.[\/\\]/;
  const STRICT_READONLY_PROMPT_RE = new RegExp(
    [
      String.raw`\b(?:allow\s+read(?:\s+access)?|read-?only(?:\s+(?:access|mode|view|permission))?|read\s+file|view\s+file|open\s+file|inspect(?:\s+(?:file|workspace|directory|code|logs?|state))?|search\s+workspace|list\s+director(?:y|ies)|continue\s+(?:conversation|reading|generating|streaming|response|to\s+next\s+step|next\s+step|turn|thinking))\b`,
      String.raw`(?:允许读取|只读(?:访问|权限|查看)?|读取文件|查看文件|打开文件|检查工作区|搜索工作区|列出目录|继续对话|继续阅读|继续生成|继续下一步)`,
    ].join('|'),
    'i'
  );
  const SAFE_STREAM_MERGE_RE = /(?:^|\s)[12]>&[12](?=\s|$)/g;
  const UNSAFE_SHELL_RE = /[<>`]|\$\(/;
  const CLI_FLAG_OR_OPERATOR_RE = /(?:^|\s)(?:--[a-zA-Z0-9][a-zA-Z0-9-]*|-[a-zA-Z]{1,4}(?=\s|$)|\/[a-zA-Z](?=\s|$))|[|&;<>`$]/;
  const LIKELY_COMMAND_OR_WRITE_RE = new RegExp(
    [
      String.raw`\b(?:run\s+command|execute|executing|command\s*:|shell\s*:|terminal\s*:|bash|zsh|sh\s+-c|powershell|pwsh|cmd(?:\.exe)?|npm|pnpm|yarn|npx|bun|deno|node|python3?|pip3?|cargo|go\s+run|go\s+build|git|curl|wget|mv|cp|rm|mkdir|rmdir|rd|del|touch|chmod|chown|chgrp|ln|dd|tar|unzip|zip|rsync|scp|ssh|docker|kubectl|helm|terraform|ansible|make|cmake|apt(?:-get)?|brew|yum|dnf|pacman|sudo|su|kill|pkill|killall)\b`,
      String.raw`\b(?:overwrite|overwriting|delete|deleting|remove|removing|remove-item|clear-content|set-content|out-file|format-volume|drop|truncate|write|writing|modify|modifying|edit|editing|update|updating|patch|patching|replace|replacing|create|creating|append|install|installing|uninstall|reinstall|upgrade|deploy|deploying|push|pushing|publish|publishing|release|format|formatting|wipe|wiping|erase|erasing|reset|resetting|purge|purging|clean|cleaning|destroy|destroying|apply|applying|commit|merge|rebase|checkout|migrate|migration|seed|restart|reboot|shutdown|stop\s+service|terminate|database|production|secret|credential|password|token)\b`,
      String.raw`(?:删除|删掉|移除|清空|清除|覆盖|覆写|写入|改写|修改|编辑|更新|替换|创建|新建|执行|运行|推送|发布|部署|安装|卸载|重装|升级|格式化|抹除|重置|还原|回滚|销毁|终止|杀死|强杀|重启|关机|数据库|生产环境|凭据|密码|密钥)`,
    ].join('|'),
    'i'
  );
  const UNSAFE_FIND_FLAG_RE = /(?:^|\s)-(?:delete|exec|execdir|ok|okdir|fprint|fprint0|fprintf|fls)(?=\s|$)/i;
  const UNSAFE_RG_FLAG_RE = /(?:^|\s)--pre(?:-glob)?(?:=|\s|$)/i;

  function normalizePolicy(policy) {
    const p = String(policy || '').trim();
    return VALID_POLICIES.has(p) ? p : 'readonly-safe';
  }

  function redactSnippet(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b(?:sk-[a-zA-Z0-9_-]{8,}|ghp_[a-zA-Z0-9]{12,}|AKIA[0-9A-Z]{16})\b/g, '[REDACTED]')
      .slice(0, MAX_SNIPPET_CHARS);
  }

  function matchHardDeny(text) {
    const ctx = buildHardDenyContext(text);
    for (let i = 0; i < HARD_DENY_PATTERNS.length; i++) {
      const rule = HARD_DENY_PATTERNS[i];
      if (typeof rule.match === 'function') {
        if (rule.match(ctx)) return rule;
      } else if (rule.pattern.test(ctx.normalized)) {
        return rule;
      }
    }
    return null;
  }

  function mkMask(all = false) {
    return all ? { m: [-1, -1, -1, -1], na: true } : { m: [0, 0, 0, 0], na: false };
  }

  function setCode(mk, c, foldCase = false) {
    if (c >= 0 && c < 128) {
      mk.m[c >>> 5] |= 1 << (c & 31);
      if (foldCase) {
        if (c >= 65 && c <= 90) mk.m[(c + 32) >>> 5] |= 1 << ((c + 32) & 31);
        else if (c >= 97 && c <= 122) mk.m[(c - 32) >>> 5] |= 1 << ((c - 32) & 31);
      }
    } else if (c >= 128) mk.na = true;
  }

  function foldMaskAsciiCase(mk) {
    if (!mk) return mk;
    for (let c = 65; c <= 90; c += 1) {
      const up = (mk.m[c >>> 5] & (1 << (c & 31))) !== 0;
      const lo = (mk.m[(c + 32) >>> 5] & (1 << ((c + 32) & 31))) !== 0;
      if (up || lo) {
        mk.m[c >>> 5] |= 1 << (c & 31);
        mk.m[(c + 32) >>> 5] |= 1 << ((c + 32) & 31);
      }
    }
    return mk;
  }

  function addShort(mk, ch) {
    if (ch === 'd' || ch === 'w') for (let c = 48; c <= 57; c += 1) setCode(mk, c);
    if (ch === 'w') {
      for (let c = 65; c <= 90; c += 1) setCode(mk, c);
      for (let c = 97; c <= 122; c += 1) setCode(mk, c);
      setCode(mk, 95);
    } else if (ch === 's') {
      for (const c of [9, 10, 11, 12, 13, 32]) setCode(mk, c);
      mk.na = true;
    } else if (ch === 'D' || ch === 'W' || ch === 'S') {
      const b = mkMask(false);
      addShort(b, ch.toLowerCase());
      for (let i = 0; i < 4; i += 1) mk.m[i] |= ~b.m[i];
      mk.na = true;
    } else setCode(mk, ch.charCodeAt(0));
  }

  function parseClassMask(src, idx) {
    let i = idx + 1;
    const neg = src[i] === '^';
    if (neg) i += 1;
    const mk = mkMask(false);
    let prev = -1;
    let range = false;
    while (i < src.length) {
      const ch = src[i];
      if (ch === ']' && i > idx + (neg ? 2 : 1)) {
        if (neg) {
          for (let k = 0; k < 4; k += 1) mk.m[k] = ~mk.m[k];
          mk.na = true;
        }
        return { mk, end: i };
      }
      if (ch === '\\' && i + 1 < src.length) {
        const e = src[i + 1];
        i += 2;
        if ('dDwWsS'.includes(e)) {
          addShort(mk, e);
          prev = -1;
          range = false;
        } else {
          const c = e === 'n' ? 10 : e === 'r' ? 13 : e === 't' ? 9 : e.charCodeAt(0);
          if (range && prev >= 0 && c >= prev) {
            for (let k = prev; k <= Math.min(127, c); k += 1) setCode(mk, k);
            if (c >= 128) mk.na = true;
            range = false;
            prev = -1;
          } else {
            setCode(mk, c);
            prev = c;
          }
        }
        continue;
      }
      if (ch === '-' && prev >= 0 && i + 1 < src.length && src[i + 1] !== ']') {
        range = true;
        i += 1;
        continue;
      }
      const c = ch.charCodeAt(0);
      if (range && prev >= 0 && c >= prev) {
        for (let k = prev; k <= Math.min(127, c); k += 1) setCode(mk, k);
        if (c >= 128) mk.na = true;
        range = false;
        prev = -1;
      } else {
        setCode(mk, c);
        prev = c;
      }
      i += 1;
    }
    return { mk: mkMask(true), end: src.length - 1 };
  }

  function masksHit(a, b) {
    if (!a || !b || (a.na && b.na)) return true;
    for (let i = 0; i < 4; i += 1) if ((a.m[i] & b.m[i]) !== 0) return true;
    return false;
  }

  function readQuant(src, pos) {
    const ch = src[pos];
    if (ch === '*' || ch === '+') return { ex: true, v: true, u: true, n: src[pos + 1] === '?' ? pos + 2 : pos + 1 };
    if (ch === '?') return { ex: true, v: true, u: false, n: src[pos + 1] === '?' ? pos + 2 : pos + 1 };
    if (ch === '{') {
      const m = /^\{(\d+)(?:,(\d*))?\}/.exec(src.slice(pos));
      if (m) {
        const min = Number(m[1]);
        const max = m[2] === undefined || m[2] === '' ? (m[0].includes(',') ? Infinity : min) : Number(m[2]);
        const n = pos + m[0].length + (src[pos + m[0].length] === '?' ? 1 : 0);
        return { ex: true, v: max > min, u: max === Infinity, n };
      }
    }
    return { ex: false, v: false, u: false, n: pos };
  }

  function hasUnsafeCustomRegex(source, flags = 'i') {
    const foldCase = String(flags || '').includes('i');
    if (typeof source !== 'string' || !source || source.length > MAX_CUSTOM_PATTERN_CHARS) return true;
    if (/\([^)]*[+*][^)]*\)[+*?{]/.test(source) || /\([^)]*\{\d+,\d*\}[^)]*\)[+*?{]/.test(source)) return true;
    if (/(?:^|[^\\])\\[1-9]/.test(source)) return true;

    const stk = [{ q: false, alt: false, prev: null }];
    let wilds = 0;
    let i = 0;
    while (i < source.length) {
      const ch = source[i];
      const top = stk[stk.length - 1];
      if (ch === '(') {
        stk.push({ q: false, alt: false, prev: null });
        i += 1;
        if (source[i] === '?') {
          i += 1;
          if (':=!'.includes(source[i] || '')) i += 1;
          else if (source[i] === '<' && '=!'.includes(source[i + 1] || '')) i += 2;
        }
        continue;
      }
      if (ch === '|') { top.alt = true; top.prev = null; i += 1; continue; }
      if (ch === ')') {
        if (stk.length === 1) { i += 1; continue; }
        const f = stk.pop();
        const p = stk[stk.length - 1];
        const q = readQuant(source, i + 1);
        if ((f.q && q.ex) || (f.alt && (q.v || q.u))) return true;
        if (stk.length > 1 && (f.q || q.v || q.u)) p.q = true;
        if (q.v && p.prev?.v) return true;
        p.prev = { v: q.v, mk: null };
        i = q.n;
        continue;
      }
      if (ch === '^' || ch === '$') { top.prev = null; i += 1; continue; }

      let mk = null;
      let wild = false;
      let end = i + 1;
      if (ch === '.') { wild = true; mk = mkMask(true); }
      else if (ch === '[') { const p = parseClassMask(source, i); mk = foldCase ? foldMaskAsciiCase(p.mk) : p.mk; end = p.end + 1; }
      else if (ch === '\\') {
        if (i + 1 >= source.length) { i += 1; continue; }
        const e = source[i + 1];
        end = i + 2;
        if (e === 'b' || e === 'B') { top.prev = null; i = end; continue; }
        mk = mkMask(false);
        addShort(mk, e);
        if (foldCase) foldMaskAsciiCase(mk);
      } else { mk = mkMask(false); setCode(mk, ch.charCodeAt(0), foldCase); }

      const q = readQuant(source, end);
      if (wild && q.u && ++wilds >= 3) return true;
      if (stk.length > 1 && (q.v || q.u)) top.q = true;
      if (q.v && top.prev?.v && masksHit(top.prev.mk, mk)) return true;
      top.prev = { v: q.v, mk };
      i = q.n;
    }
    return false;
  }

  function validateCustomPattern(entry) {
    return Boolean(compileCustomPattern(entry));
  }

  function compileCustomPattern(entry) {
    if (!entry) return null;
    if (entry instanceof RegExp) {
      const flags = entry.flags.replace(/g/g, '');
      if (hasUnsafeCustomRegex(entry.source, flags)) return null;
      try {
        return { raw: entry.toString(), regex: new RegExp(entry.source, flags) };
      } catch {
        return null;
      }
    }
    if (typeof entry !== 'string') return null;
    const trimmed = entry.trim();
    if (!trimmed) return null;

    // Support /pattern/flags literal syntax
    const slashMatch = trimmed.match(/^\/(.+)\/([a-zA-Z]*)$/);
    if (slashMatch) {
      const flags = slashMatch[2].replace(/g/g, '');
      if (hasUnsafeCustomRegex(slashMatch[1], flags)) return null;
      try {
        return { raw: trimmed, regex: new RegExp(slashMatch[1], flags) };
      } catch {
        return null;
      }
    }

    if (hasUnsafeCustomRegex(trimmed, 'i')) return null;
    try {
      return { raw: trimmed, regex: new RegExp(trimmed, 'i') };
    } catch {
      return null;
    }
  }

  const HEADER_ONLY_LINE_RE = /^(?:(?:please\s+)?(?:approve|allow|confirm|run|execute)?\s*(?:agent\s+to\s+)?(?:run|execute)?\s*(?:this\s+)?(?:terminal\s+|shell\s+|bash\s+)?(?:command|tool(?:\s+call)?|action|permission(?:\s+request(?:ed)?)?)|(?:需要审批|请求审批|是否允许|允许执行(?:以下)?命令|执行终端命令|终端命令))\s*[:：?？]?$/i;

  function getEffectiveLines(cardText) {
    return String(cardText || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !HEADER_ONLY_LINE_RE.test(line));
  }

  function hasUnsafeAmpersand(text) {
    const runs = String(text || '').match(/&+/g);
    if (!runs) return false;
    return runs.some((run) => run.length !== 2);
  }

  function hasUnsafeShellSyntax(cardText) {
    const raw = String(cardText || '').trim();
    if (!raw) return false;
    // Reject raw multi-line commands (after stripping optional single header line) and backslash continuations
    if (/\\[ \t]*\r?\n/.test(raw)) return true;
    const effectiveLines = getEffectiveLines(raw);
    if (effectiveLines.length > 1) return true;
    // Strip only explicit harmless stderr/stdout stream merges (2>&1 / 1>&2), then reject any <, >, `, $(), or non-&& ampersand
    const sanitized = raw.replace(SAFE_STREAM_MERGE_RE, ' ');
    if (UNSAFE_SHELL_RE.test(sanitized)) return true;
    if (hasUnsafeAmpersand(sanitized)) return true;
    return false;
  }

  function hasUnsafeBuiltinCommandFlags(cmd) {
    if (!cmd) return false;
    if (/\bfind\b/i.test(cmd) && UNSAFE_FIND_FLAG_RE.test(cmd)) return true;
    if (/\brg\b/i.test(cmd) && UNSAFE_RG_FLAG_RE.test(cmd)) return true;
    if (/\bgit\b/i.test(cmd)) {
      const invocations = parseGitInvocations(cmd);
      for (let i = 0; i < invocations.length; i++) {
        const inv = invocations[i];
        // Block `git -c` / `git -C` / `--config-env` / `--exec-path` in built-in allowlists
        for (let g = 0; g < inv.globalArgs.length; g++) {
          const ga = inv.globalArgs[g];
          if (
            ga === '-c' ||
            /^-c.+/.test(ga) ||
            ga === '-C' ||
            /^-C.+/.test(ga) ||
            /^--config-env(?:=|$)/i.test(ga) ||
            /^--exec-path(?:=|$)/i.test(ga)
          ) {
            return true;
          }
        }
        // Also guard against `-c` or unsafe flags placed in subcommand args
        if (inv.subcommand === 'diff') {
          for (let a = 0; a < inv.subArgs.length; a++) {
            const sa = inv.subArgs[a];
            if (/^--output(?:=|$)/i.test(sa) || /^--ext-diff$/i.test(sa) || /^-O(?:.*)?$/.test(sa)) {
              return true;
            }
          }
        }
      }
      // Catch inline `git -c` / `git -C` even if not parsed into a known subcommand
      if (/(?:^|\s)-[cC](?:\s|=|$)/.test(cmd)) return true;
    }
    return false;
  }

  function extractCommandSegments(cardText) {
    const lines = getEffectiveLines(cardText);
    if (lines.length === 0) return [];

    const out = [];
    for (let i = 0; i < lines.length; i++) {
      let body = lines[i]
        .replace(/^(?:please\s+)?(?:approve|allow|confirm)?\s*(?:running|run|execute|executing)?\s*(?:terminal\s+|shell\s+)?(?:command)?\s*[:：]\s*/i, '')
        .replace(/^\$\s+/, '')
        .trim();
      if ((body.startsWith('"') && body.endsWith('"')) || (body.startsWith("'") && body.endsWith("'"))) {
        body = body.slice(1, -1).trim();
      }
      if (!body) continue;
      const parts = body
        .split(/\s*(?:&&|\|\||;)\s*/)
        .map((seg) => seg.replace(/^\$\s+/, '').trim())
        .filter(Boolean);
      for (let j = 0; j < parts.length; j++) out.push(parts[j]);
    }
    return out;
  }

  function matchCommandSegment(segment, allowDevFlow) {
    if (!segment) return null;
    if (hasUnsafeBuiltinCommandFlags(segment)) return null;
    // Disallow arbitrary pipes in single segment unless every piped step is a safe allowlisted command
    if (segment.includes('|')) {
      const rawPiped = segment.split('|').map((s) => s.trim());
      if (rawPiped.length < 2 || rawPiped.some((s) => !s)) return null;
      let firstRule = null;
      for (const part of rawPiped) {
        if (hasUnsafeBuiltinCommandFlags(part)) return null;
        const hit = matchSingleAtomicCommand(part, allowDevFlow);
        if (!hit) return null;
        if (!firstRule) firstRule = hit;
      }
      return firstRule;
    }
    return matchSingleAtomicCommand(segment, allowDevFlow);
  }

  function matchSingleAtomicCommand(cmd, allowDevFlow) {
    if (hasUnsafeBuiltinCommandFlags(cmd)) return null;
    for (let i = 0; i < READONLY_COMMAND_PATTERNS.length; i++) {
      const rule = READONLY_COMMAND_PATTERNS[i];
      if (rule.pattern.test(cmd)) {
        return rule;
      }
    }
    if (allowDevFlow) {
      for (let i = 0; i < DEV_FLOW_COMMAND_PATTERNS.length; i++) {
        const rule = DEV_FLOW_COMMAND_PATTERNS[i];
        if (rule.pattern.test(cmd) && (!rule.extraCheck || rule.extraCheck(cmd))) {
          return rule;
        }
      }
    }
    return null;
  }

  function classifyApprovalCard({ cardText = '', buttonText = '', policy = 'readonly-safe', customAllowPatterns = [] } = {}) {
    const resolvedPolicy = normalizePolicy(policy);
    const rawCard = String(cardText || '');
    const rawBtn = String(buttonText || '');

    // 0. Guard against oversized inputs to prevent ReDoS or hidden trailing payloads.
    if (rawCard.length > MAX_CARD_TEXT_CHARS || rawBtn.length > MAX_BUTTON_TEXT_CHARS) {
      const bounded = [
        rawCard.slice(0, MAX_CARD_TEXT_CHARS),
        rawBtn.slice(0, MAX_BUTTON_TEXT_CHARS),
      ]
        .filter(Boolean)
        .join('\n');
      const prefixHardHit = matchHardDeny(bounded);
      if (prefixHardHit) {
        return {
          allowed: false,
          decision: 'denied-hard',
          reason: `hard-deny:${prefixHardHit.id}`,
          matchedRule: prefixHardHit.id,
          policy: resolvedPolicy,
        };
      }
      return {
        allowed: false,
        decision: 'skipped-policy',
        reason: 'input-too-long',
        matchedRule: null,
        policy: resolvedPolicy,
      };
    }

    const card = rawCard.trim();
    const btn = rawBtn.trim();
    const combined = [card, btn].filter(Boolean).join('\n');

    // 1. Ironclad HARD_DENY_PATTERNS check — ALWAYS executes first, NEVER bypassable.
    const hardHit = matchHardDeny(combined);
    if (hardHit) {
      return {
        allowed: false,
        decision: 'denied-hard',
        reason: `hard-deny:${hardHit.id}`,
        matchedRule: hardHit.id,
        policy: resolvedPolicy,
      };
    }

    // 1.5 Fail-closed on cross-workspace/cross-repo approvals and persistent allow buttons across ALL policies.
    if (CROSS_WORKSPACE_RE.test(combined)) {
      return {
        allowed: false,
        decision: 'skipped-policy',
        reason: 'cross-workspace-blocked',
        matchedRule: 'cross-workspace',
        policy: resolvedPolicy,
      };
    }
    if (btn && PERSISTENT_ALLOW_BUTTON_RE.test(btn)) {
      return {
        allowed: false,
        decision: 'skipped-policy',
        reason: 'persistent-allow-blocked',
        matchedRule: 'persistent-allow',
        policy: resolvedPolicy,
      };
    }

    // 2. Reject unsafe shell redirection / background chaining / process substitution / multi-line commands / unsafe flags across ALL policies (including custom).
    if (hasUnsafeShellSyntax(card) || hasUnsafeBuiltinCommandFlags(card)) {
      return {
        allowed: false,
        decision: 'skipped-policy',
        reason: 'unsafe-shell-operator',
        matchedRule: null,
        policy: resolvedPolicy,
      };
    }

    // 3. Custom policy: require recognizable action content (never approve solely by button text)
    // and match user allowlist patterns only against bounded action content.
    if (resolvedPolicy === 'custom') {
      const effectiveLines = getEffectiveLines(card);
      const isButtonOnly = Boolean(btn && card.toLowerCase() === btn.toLowerCase());
      if (!card || effectiveLines.length === 0 || isButtonOnly) {
        return {
          allowed: false,
          decision: 'skipped-policy',
          reason: 'missing-action-content:custom',
          matchedRule: null,
          policy: resolvedPolicy,
        };
      }
      if (card.length > MAX_CUSTOM_MATCH_CHARS) {
        return {
          allowed: false,
          decision: 'skipped-policy',
          reason: 'card-too-long:custom',
          matchedRule: null,
          policy: resolvedPolicy,
        };
      }
      const patterns = Array.isArray(customAllowPatterns) ? customAllowPatterns : [];
      for (let i = 0; i < patterns.length; i++) {
        const compiled = compileCustomPattern(patterns[i]);
        if (!compiled) continue;
        if (compiled.regex.test(card)) {
          return {
            allowed: true,
            decision: 'accepted',
            reason: `custom-allow:${compiled.raw}`,
            matchedRule: compiled.raw,
            policy: resolvedPolicy,
          };
        }
      }
      return {
        allowed: false,
        decision: 'skipped-policy',
        reason: 'policy-mismatch:custom',
        matchedRule: null,
        policy: resolvedPolicy,
      };
    }

    const allowDevFlow = resolvedPolicy === 'dev-flow';

    // 4. Match command segments strictly (all chained segments must be allowlisted).
    const segments = extractCommandSegments(card);
    if (segments.length > 0) {
      let matchedAll = true;
      let firstMatched = null;
      for (let i = 0; i < segments.length; i++) {
        const hit = matchCommandSegment(segments[i], allowDevFlow);
        if (!hit) {
          matchedAll = false;
          break;
        }
        if (!firstMatched) firstMatched = hit;
      }
      if (matchedAll && firstMatched) {
        return {
          allowed: true,
          decision: 'accepted',
          reason: `policy:${resolvedPolicy}:${firstMatched.id}`,
          matchedRule: firstMatched.id,
          policy: resolvedPolicy,
        };
      }
    }

    // 5. Strict read-only / continuation prompt fallback:
    // NEVER allow unknown cards solely by button label ("Proceed"/"Continue"/"继续").
    // Requires explicit read-only / no-side-effect card copy AND zero command/write/flag signals.
    if (
      card &&
      card.length <= MAX_READONLY_PROMPT_CHARS &&
      !PATH_TRAVERSAL_RE.test(card) &&
      !LIKELY_COMMAND_OR_WRITE_RE.test(card) &&
      !CLI_FLAG_OR_OPERATOR_RE.test(card) &&
      STRICT_READONLY_PROMPT_RE.test(card) &&
      (!btn || (!NEGATIVE_BUTTON_RE.test(btn) && !PERSISTENT_ALLOW_BUTTON_RE.test(btn) && READONLY_BUTTON_RE.test(btn)))
    ) {
      return {
        allowed: true,
        decision: 'accepted',
        reason: `policy:${resolvedPolicy}:readonly-action`,
        matchedRule: 'readonly-action',
        policy: resolvedPolicy,
      };
    }

    return {
      allowed: false,
      decision: 'skipped-policy',
      reason: `policy-mismatch:${resolvedPolicy}`,
      matchedRule: null,
      policy: resolvedPolicy,
    };
  }

  function isOwnedNode(el) {
    let cur = el;
    while (cur) {
      if (
        cur.getAttribute?.('data-ag-sag-owned') === '1' ||
        cur.getAttribute?.('data-ag-sg-owned') === '1'
      ) {
        return true;
      }
      cur = cur.parentElement;
    }
    return false;
  }

  function isElementVisible(el, win) {
    if (!el || el.isConnected === false) return false;
    let cur = el;
    while (cur) {
      if (cur.hidden === true) return false;
      if (cur.getAttribute?.('aria-hidden') === 'true') return false;
      if (cur.style) {
        if (cur.style.display === 'none' || cur.style.visibility === 'hidden' || cur.style.opacity === '0') {
          return false;
        }
      }
      if (typeof win?.getComputedStyle === 'function') {
        try {
          const cs = win.getComputedStyle(cur);
          if (cs && (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0')) {
            return false;
          }
        } catch {}
      }
      cur = cur.parentElement;
    }
    return true;
  }

  function safeQueryAll(root, selector) {
    if (!root || typeof root.querySelectorAll !== 'function') return [];
    try {
      return Array.from(root.querySelectorAll(selector) || []);
    } catch {
      return [];
    }
  }

  function isButtonEnabled(btn) {
    if (!btn) return false;
    if (btn.disabled === true) return false;
    if (btn.getAttribute?.('aria-disabled') === 'true') return false;
    if (btn.hasAttribute?.('disabled')) return false;
    return true;
  }

  function getButtonLabel(btn) {
    const raw = String(btn?.textContent || btn?.getAttribute?.('aria-label') || '').replace(/\s+/g, ' ').trim();
    return raw;
  }

  function isConfirmActionButton(btn, win) {
    if (!btn || isOwnedNode(btn) || !isButtonEnabled(btn) || !isElementVisible(btn, win)) return false;
    const label = getButtonLabel(btn);
    if (!label) return false;
    if (NEGATIVE_BUTTON_RE.test(label) || PERSISTENT_ALLOW_BUTTON_RE.test(label)) return false;
    return POSITIVE_BUTTON_RE.test(label);
  }

  function extractCardTextWithoutButtons(container) {
    if (!container) return '';
    const parts = [];
    const walk = (node) => {
      if (!node) return;
      const tag = String(node.tagName || '').toUpperCase();
      const role = String(node.getAttribute?.('role') || '').toLowerCase();
      if (tag === 'BUTTON' || role === 'button') return;
      const children = Array.isArray(node.children) ? node.children : Array.from(node.children || []);
      if (children.length === 0) {
        const txt = String(node.textContent || '').trim();
        if (txt) parts.push(txt);
        return;
      }
      if (typeof node._text === 'string' && node._text.trim()) {
        parts.push(node._text.trim());
      } else if (node.childNodes && typeof node.childNodes.length === 'number') {
        for (let i = 0; i < node.childNodes.length; i++) {
          const cn = node.childNodes[i];
          if (cn && cn.nodeType === 3) {
            const t = String(cn.nodeValue || cn.textContent || '').trim();
            if (t) parts.push(t);
          } else if (cn && cn.nodeType === 1) {
            walk(cn);
          }
        }
        return;
      }
      for (let i = 0; i < children.length; i++) {
        walk(children[i]);
      }
    };
    walk(container);
    return parts.join('\n').trim();
  }

  function findApprovalContainers(doc, win) {
    if (!doc) return [];
    const seen = new Set();
    const out = [];
    const addCandidate = (el) => {
      if (!el || seen.has(el) || isOwnedNode(el) || !isElementVisible(el, win)) return;
      seen.add(el);
      out.push(el);
    };
    const sel = '.approval-card, [data-testid*="approval"], [data-testid*="permission"], [role="alertdialog"], [role="dialog"]';
    let selThrew = false;
    if (typeof doc.querySelectorAll === 'function') {
      try {
        for (const el of Array.from(doc.querySelectorAll(sel) || [])) addCandidate(el);
      } catch {
        selThrew = true;
      }
    }
    // Only fall back to full [data-testid] scan in minimal mock DOMs where [attr*="..."] throws
    if (selThrew) {
      for (const el of safeQueryAll(doc, '.approval-card, [role="alertdialog"], [role="dialog"]')) addCandidate(el);
      for (const el of safeQueryAll(doc, '[data-testid]')) {
        const tid = String(el.getAttribute?.('data-testid') || '').toLowerCase();
        if (tid.includes('approval') || tid.includes('permission')) {
          addCandidate(el);
        }
      }
    }
    // Prefer innermost approval containers when wrappers nest (e.g. role="dialog" wrapping .approval-card)
    const isDescendant = (parent, child) => {
      let cur = child?.parentElement;
      while (cur) {
        if (cur === parent) return true;
        cur = cur.parentElement;
      }
      return false;
    };
    return out.filter((node) => !out.some((other) => other !== node && isDescendant(node, other)));
  }

  function resolveCoexist(optCoexist) {
    if (optCoexist) return optCoexist;
    if (globalRoot && globalRoot.__agSgCoexist) return globalRoot.__agSgCoexist;
    if (typeof require === 'function') {
      try { return require('./coexist.js'); } catch {}
    }
    return null;
  }

  function createSafeAutoAcceptController(options = {}) {
    const win = options.win || globalRoot;
    const doc = options.doc || win?.document || null;
    const coexist = resolveCoexist(options.coexist);
    const nowFn = typeof options.now === 'function' ? options.now : () => Date.now();
    const cooldownMs = Math.max(0, Number(options.cooldownMs ?? DEFAULT_COOLDOWN_MS));
    const observeDebounceMs = Math.max(0, Number(options.observeDebounceMs ?? 150));
    const maxAuditEntries = Math.max(1, Number(options.maxAuditEntries ?? MAX_AUDIT_ENTRIES));
    const autoObserve = options.autoObserve !== undefined ? Boolean(options.autoObserve) : true;
    const isHibernated = () =>
      coexist?.isWindowHibernated
        ? coexist.isWindowHibernated(doc, win, false)
        : Boolean(doc?.hidden || doc?.documentElement?.getAttribute?.('data-ag-cs-win-blur') === '1');

    // Strictly disabled by default; requires explicit opt-in.
    let enabled = options.enabled === true;
    let policy = normalizePolicy(options.policy || 'readonly-safe');
    let customAllowPatterns = Array.isArray(options.customAllowPatterns) ? [...options.customAllowPatterns] : [];
    let dryRun = Boolean(options.dryRun);
    let paused = Boolean(options.paused);
    let destroyed = false;

    let lastClickAtMs = -Infinity;
    let totalAccepted = 0;
    let totalDryRun = 0;
    let totalDeniedHard = 0;
    let totalSkippedPolicy = 0;
    let observer = null;
    let observeTimer = null;

    const clickedButtons = new WeakSet();
    const evaluatedSignature = new WeakMap();
    const auditLog = [];

    function getEvalSignature() {
      const customSig = customAllowPatterns.map((p) => String(p)).join('\u0000');
      return `${policy}|${dryRun ? '1' : '0'}|${customSig}`;
    }

    function pushAudit(entry) {
      if (auditLog.length >= maxAuditEntries) {
        auditLog.shift();
      }
      auditLog.push(entry);
      if (typeof options.onDecision === 'function') {
        try { options.onDecision({ ...entry }); } catch {}
      }
    }

    function stopObserver() {
      if (observeTimer) {
        clearTimeout(observeTimer);
        observeTimer = null;
      }
      if (observer) {
        try { observer.disconnect(); } catch {}
        observer = null;
      }
    }

    function startObserver() {
      if (destroyed || !enabled || !autoObserve || !doc || observer) return;
      const MO = win?.MutationObserver || globalThis.MutationObserver;
      const target = doc.body || doc.documentElement;
      if (typeof MO !== 'function' || !target) return;
      observer = new MO((records) => {
        if (destroyed || !enabled || paused || isHibernated()) return;
        if (typeof coexist?.isMutationOwnedOnly === 'function') {
          if (coexist.isMutationOwnedOnly(records)) return;
        } else {
          const hasExternal = Array.isArray(records)
            ? records.some((r) => r && !isOwnedNode(r.target))
            : true;
          if (!hasExternal) return;
        }
        if (observeTimer) clearTimeout(observeTimer);
        observeTimer = setTimeout(() => {
          observeTimer = null;
          if (!destroyed && enabled && !paused && !isHibernated()) {
            scanNow();
          }
        }, observeDebounceMs);
        observeTimer?.unref?.();
      });
      try {
        observer.observe(target, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['hidden', 'disabled', 'aria-disabled'],
        });
      } catch {
        observer = null;
      }
    }

    function scanNow() {
      const stats = {
        active: !destroyed && enabled && !paused,
        scanned: 0,
        accepted: 0,
        dryRun: 0,
        deniedHard: 0,
        skippedPolicy: 0,
        cooldownSkipped: 0,
      };
      if (destroyed || !enabled || paused || !doc) return stats;

      const containers = findApprovalContainers(doc, win);
      const sig = getEvalSignature();
      const visitedButtons = new Set();

      for (let i = 0; i < containers.length; i++) {
        const container = containers[i];
        const buttons = safeQueryAll(container, 'button, [role="button"]');
        const confirmBtn = buttons.find((b) => !visitedButtons.has(b) && isConfirmActionButton(b, win));
        if (!confirmBtn) continue;
        visitedButtons.add(confirmBtn);

        if (clickedButtons.has(confirmBtn)) continue;
        if (evaluatedSignature.get(confirmBtn) === sig) continue;

        stats.scanned += 1;
        const buttonText = getButtonLabel(confirmBtn);
        const cardText = extractCardTextWithoutButtons(container);
        const result = classifyApprovalCard({
          cardText,
          buttonText,
          policy,
          customAllowPatterns,
        });

        const ts = nowFn();
        const snippet = redactSnippet(cardText || buttonText);

        if (result.allowed) {
          if (dryRun) {
            evaluatedSignature.set(confirmBtn, sig);
            stats.dryRun += 1;
            totalDryRun += 1;
            pushAudit({
              ts,
              decision: 'dry-run',
              reason: result.reason,
              buttonText,
              snippet,
              policy,
            });
            continue;
          }

          if (ts - lastClickAtMs < cooldownMs) {
            stats.cooldownSkipped += 1;
            continue;
          }

          clickedButtons.add(confirmBtn);
          evaluatedSignature.set(confirmBtn, sig);
          lastClickAtMs = ts;
          try {
            confirmBtn.click?.();
          } catch {}
          stats.accepted += 1;
          totalAccepted += 1;
          pushAudit({
            ts,
            decision: 'accepted',
            reason: result.reason,
            buttonText,
            snippet,
            policy,
          });
        } else {
          evaluatedSignature.set(confirmBtn, sig);
          if (result.decision === 'denied-hard') {
            stats.deniedHard += 1;
            totalDeniedHard += 1;
          } else {
            stats.skippedPolicy += 1;
            totalSkippedPolicy += 1;
          }
          pushAudit({
            ts,
            decision: result.decision,
            reason: result.reason,
            buttonText,
            snippet,
            policy,
          });
        }
      }

      return stats;
    }

    function setEnabled(val) {
      if (destroyed) return enabled;
      enabled = Boolean(val);
      if (enabled) {
        startObserver();
      } else {
        stopObserver();
      }
      return enabled;
    }

    function setPolicy(nextPolicy) {
      if (destroyed) return policy;
      policy = normalizePolicy(nextPolicy);
      return policy;
    }

    function setCustomAllowPatterns(list) {
      if (destroyed) return [];
      customAllowPatterns = Array.isArray(list) ? [...list] : [];
      return [...customAllowPatterns];
    }

    function setDryRun(val) {
      if (destroyed) return dryRun;
      dryRun = Boolean(val);
      return dryRun;
    }

    function setPaused(val) {
      if (destroyed) return paused;
      paused = Boolean(val);
      return paused;
    }

    function getAuditLog() {
      return auditLog.map((entry) => ({ ...entry }));
    }

    function clearAuditLog() {
      auditLog.length = 0;
    }

    function getDebugState() {
      return {
        enabled,
        destroyed,
        paused,
        dryRun,
        policy,
        cooldownMs,
        customAllowCount: customAllowPatterns.length,
        auditCount: auditLog.length,
        totalAccepted,
        totalDryRun,
        totalDeniedHard,
        totalSkippedPolicy,
        lastClickAtMs: Number.isFinite(lastClickAtMs) ? lastClickAtMs : null,
        observing: Boolean(observer),
      };
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      enabled = false;
      stopObserver();
    }

    if (enabled) {
      startObserver();
    }

    return {
      setEnabled,
      setPolicy,
      setCustomAllowPatterns,
      setDryRun,
      setPaused,
      scanNow,
      getAuditLog,
      clearAuditLog,
      getDebugState,
      destroy,
    };
  }

  return {
    HARD_DENY_PATTERNS,
    POLICY_PRESETS,
    MAX_AUDIT_ENTRIES,
    MAX_CARD_TEXT_CHARS,
    MAX_CUSTOM_MATCH_CHARS,
    MAX_BUTTON_TEXT_CHARS,
    MAX_CUSTOM_PATTERN_CHARS,
    hasUnsafeCustomRegex,
    validateCustomPattern,
    classifyApprovalCard,
    createSafeAutoAcceptController,
  };
});
