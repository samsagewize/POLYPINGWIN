import { runScan } from './scan.js';

// Minimal loop: run scan every N seconds and print to stdout.
// Designed for Railway/cron-like environments.

const intervalSec = Number(process.env.SCAN_INTERVAL_SEC || 300); // 5 minutes default

async function loop() {
  while (true) {
    const started = Date.now();
    try {
      const out = await runScan();
      console.log(JSON.stringify(out));
    } catch (e) {
      console.error(JSON.stringify({
        checked_at: new Date().toISOString(),
        error: String(e?.message || e),
      }));
    }

    const elapsed = (Date.now() - started) / 1000;
    const sleep = Math.max(1, intervalSec - elapsed);
    await new Promise((r) => setTimeout(r, sleep * 1000));
  }
}

loop();
