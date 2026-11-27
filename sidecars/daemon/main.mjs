// agy-Sag — Native Plugin Sidecar Daemon Entrypoint
import { startWatchDaemonCli } from '../../cli/watch-daemon.mjs';

startWatchDaemonCli(process.argv.slice(2)).catch((err) => {
  console.error('[agy-Sag:sidecar]', err?.message || err);
  process.exitCode = 1;
});
