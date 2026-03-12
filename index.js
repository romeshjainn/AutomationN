// ─────────────────────────────────────────────────────────────
//  Entry point — run: node index.js  (or: npm start)
// ─────────────────────────────────────────────────────────────

import fs from 'fs';
import { JOB_TARGETS } from './src/constants/jobTargets.js';
import { CONFIG } from './src/constants/config.js';
import { launchBrowser } from './src/utils/browser.js';
import { scrapeType } from './src/scraper.js';
import { notifyTelegram } from './src/utils/telegram.js';

const { browser, context, page } = await launchBrowser();
const result = {};

try {
  for (const entry of JOB_TARGETS) {
    // Pass context so scraper can open job pages for Easy Apply check
    const jobs = await scrapeType(page, context, entry);
    result[entry.type] = jobs;
    const easyCount = jobs.filter((j) => j.is_auto_apply_available).length;
    console.log(
      `\n📦 [${entry.type}] ${jobs.length} jobs | ✅ ${easyCount} Easy Apply | Top: "${jobs[0]?.title}" (${jobs[0]?.score}/10)`,
    );
  }
} catch (err) {
  console.error('❌ Fatal error:', err.message);
} finally {
  await browser.close();
}

const flat = Object.entries(result).flatMap(([type, jobs]) => jobs.map((j) => ({ ...j, type })));

fs.writeFileSync(CONFIG.OUTPUT_FILE, JSON.stringify(flat, null, 2));
console.log(`\n✅ ${flat.length} total jobs saved → ${CONFIG.OUTPUT_FILE}`);

const { token, chatId, topN } = CONFIG.TELEGRAM;
if (token !== 'YOUR_BOT_TOKEN_HERE') {
  await notifyTelegram(token, chatId, flat, topN);
} else {
  console.log('⚠️  Telegram not configured — skipping notification');
}
