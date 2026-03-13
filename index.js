// ─────────────────────────────────────────────────────────────
//  index.js — Root entry point
//
//  Usage:
//    node index.js --platform=naukri --mode=live
//    node index.js --platform=yc --mode=quick --minutes=20
//    node index.js --platform=all --mode=live
//    node index.js --platform=naukri --mode=report
//    node index.js --platform=naukri --mode=status
//
//  bot.bat handles double-click launch (defaults to all live)
// ─────────────────────────────────────────────────────────────

import 'dotenv/config';
import { checkAI } from './core/ai/client.js';
import { runMigrations } from './core/db/migrations.js';
import { getTodayStats } from './core/db/queries/jobs.js';
import { PLATFORMS, PLATFORM_NAMES } from './platforms/index.js';

// ── Parse CLI flags ───────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (flag) => {
  const i = args.findIndex((a) => a.startsWith(`--${flag}`));
  if (i === -1) return null;
  return args[i].split('=')[1] || args[i + 1] || null;
};

const platform = getArg('platform') || 'naukri';
const mode = getArg('mode') || 'quick';
const minutes = parseInt(getArg('minutes') || '15');

// ── Validate ──────────────────────────────────────────────────

if (platform !== 'all' && !PLATFORMS[platform]) {
  console.error(`❌ Unknown platform: "${platform}"`);
  console.error(`   Available: ${PLATFORM_NAMES.join(', ')}, all`);
  process.exit(1);
}

// ── Bootstrap (runs once regardless of platform) ──────────────

runMigrations();
await checkAI();

console.log(
  `\n🤖 Job Bot starting — platform: ${platform} | mode: ${mode}${mode === 'quick' ? ` (${minutes} mins)` : ''}\n`,
);

// ── Route: all platforms ──────────────────────────────────────

if (platform === 'all') {
  const targets = Object.entries(PLATFORMS);
  console.log(`🌐 Running all ${targets.length} platforms: ${PLATFORM_NAMES.join(', ')}\n`);

  if (mode === 'live') {
    // Live mode — run ALL platforms concurrently (each has its own browser)
    await Promise.all(
      targets.map(async ([key, config]) => {
        if (!config.modes.live) {
          console.warn(`⚠️  Platform "${key}" has no live mode — skipping`);
          return;
        }
        const mod = await config.modes.live();
        await mod.runLive();
      }),
    );
  } else if (mode === 'quick') {
    // Quick mode — run sequentially (avoid resource contention)
    for (const [key, config] of targets) {
      if (!config.modes.quick) {
        console.warn(`⚠️  Platform "${key}" has no quick mode — skipping`);
        continue;
      }
      console.log(`\n${'═'.repeat(50)}\n  ${config.name}\n${'═'.repeat(50)}\n`);
      const mod = await config.modes.quick();
      await mod.runQuick(minutes);
    }
  }

  process.exit(0);
}

// ── Route: single platform ────────────────────────────────────

const config = PLATFORMS[platform];

if (mode === 'quick') {
  const { runQuick } = await config.modes.quick();
  await runQuick(minutes);
} else if (mode === 'live') {
  const { runLive } = await config.modes.live();
  await runLive();
} else if (mode === 'report') {
  // Load platform-specific telegram config
  const { sendDailyReport } = await import(`./platforms/${platform}/src/utils/telegram.js`);
  await sendDailyReport();
  console.log(`✅ Daily report sent for ${platform}`);
} else if (mode === 'status') {
  const stats = getTodayStats(platform);
  console.log(`\n📊 Today's stats [${platform}]:`);
  console.table(stats);
} else {
  console.error(`❌ Unknown mode: "${mode}"`);
  console.error('   Valid modes: quick, live, report, status');
  process.exit(1);
}
