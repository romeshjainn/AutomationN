// ─────────────────────────────────────────────────────────────
//  platforms/yc/src/modes/quick.js
//  YC quick mode — burst scrape, send immediately
// ─────────────────────────────────────────────────────────────

import { v4 as uuid } from 'uuid';
import { updateStatus } from '#core/db/queries/jobs.js';
import { insertRun, updateRun } from '#core/db/queries/runs.js';
import { getSetting } from '../utils/settings.js';
import { scrapeUntilGoal } from '../scraper/index.js';
import { launchBrowser } from '../utils/browser.js';
import { YC_TELEGRAM } from '../../config/telegram.js';
import { notify, sendFooter, sendHeader, sendJob } from '#core/telegram/base.js';

const PLATFORM = 'yc';

export async function runQuick(minutes = 20) {
  const DAILY_TARGET = getSetting('DAILY_TARGET');
  const deadline = Date.now() + minutes * 60 * 1000;
  const runId = uuid();

  insertRun(runId, 'quick', PLATFORM);
  console.log(`\n[YC] ⚡ Quick mode — ${minutes} min deadline | target: ${DAILY_TARGET} jobs`);

  const { browser, context, page } = await launchBrowser();
  let sentCount = 0;

  async function onJobFound(job) {
    if (sentCount === 0) await sendHeader(YC_TELEGRAM, DAILY_TARGET, 'quick');
    sentCount++;
    console.log(`\n📱 [YC] Sending job #${sentCount}: [${job.score}/100] ${job.title}`);
    await sendJob(YC_TELEGRAM, job, sentCount);
    updateStatus(job.id, 'sent');
  }

  try {
    while (Date.now() < deadline && sentCount < DAILY_TARGET) {
      console.log(
        `\n[YC] 🔄 Scraping | Sent: ${sentCount}/${DAILY_TARGET} | Time left: ${Math.round((deadline - Date.now()) / 60000)} mins`,
      );

      await scrapeUntilGoal(page, context, runId, onJobFound, DAILY_TARGET - sentCount);

      if (sentCount >= DAILY_TARGET) {
        console.log(`\n🎯 [YC] Target reached — ${sentCount} jobs sent`);
        break;
      }

      console.log(`\n⚠️  [YC] Scraper exhausted — got ${sentCount}/${DAILY_TARGET} jobs`);
      break;
    }
  } catch (err) {
    console.error('❌ [YC] Quick mode error:', err.message);
    await notify(YC_TELEGRAM, `❌ YC Bot error: ${err.message}`);
  } finally {
    await browser.close();
  }

  if (sentCount === 0) {
    await notify(YC_TELEGRAM, '😔 No qualifying YC jobs found today. Stack filters may be too strict.');
    return;
  }

  await sendFooter(YC_TELEGRAM, { total: sentCount });

  updateRun(runId, {
    jobsScraped: sentCount,
    jobsQualified: sentCount,
    jobsSent: sentCount,
  });

  console.log(`\n✅ [YC] Done — ${sentCount} jobs sent to Telegram`);
}
