// ─────────────────────────────────────────────────────────────
//  Entry point
//  Reads --mode flag and routes to correct mode
//
//  Usage (via bot.sh):
//    ./bot.sh quick 15    → quick mode, 15 minutes
//    ./bot.sh live        → live mode, runs all day
//    ./bot.sh report      → send daily report to Telegram
//    ./bot.sh status      → print today's queue stats
// ─────────────────────────────────────────────────────────────

import 'dotenv/config';
import { runMigrations } from './src/db/migrations.js';
import { getTodayStats } from './src/db/queries/jobs.js';
import { sendDailyReport, notify } from './src/utils/telegram.js';
import { checkAI } from './src/ai/client.js';

// ── Bootstrap ─────────────────────────────────────────────────
runMigrations();
await checkAI(); // logs whether AI is ready or falling back to static

// ── Parse flags ───────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag) => {
  const i = args.findIndex((a) => a.startsWith(`--${flag}`));
  if (i === -1) return null;
  return args[i].split('=')[1] || args[i + 1] || null;
};

const mode = getArg('mode') || 'quick';
const minutes = parseInt(getArg('minutes') || '15');

console.log(
  `\n🤖 Naukri Bot starting — mode: ${mode}${mode === 'quick' ? ` (${minutes} mins)` : ''}\n`,
);

// ── Route to mode ─────────────────────────────────────────────
if (mode === 'quick') {
  const { runQuick } = await import('./src/modes/quick.js');
  await runQuick(minutes);
} else if (mode === 'live') {
  const { runLive } = await import('./src/modes/live.js');
  await runLive();
} else if (mode === 'report') {
  await sendDailyReport();
  console.log('✅ Daily report sent');
} else if (mode === 'status') {
  const stats = getTodayStats();
  console.log("\n📊 Today's stats:");
  console.table(stats);
} else {
  console.error(`❌ Unknown mode: ${mode}`);
  console.log('Valid modes: quick, live, report, status');
  process.exit(1);
}
