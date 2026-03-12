// ─────────────────────────────────────────────────────────────
//  platforms/naukri/src/modes/quick.js
//  Quick mode — sends each job IMMEDIATELY as found
//  Stops when DAILY_TARGET hit or time runs out
// ─────────────────────────────────────────────────────────────

import { v4 as uuid } from 'uuid';
import { updateStatus } from '../../../../core/db/queries/jobs.js';
import { insertRun, updateRun } from '../../../../core/db/queries/runs.js';
import { getSetting } from '../utils/settings.js';
import { scrapeUntilGoal } from '../scraper/index.js';
import { launchBrowser } from '../utils/browser.js';
import { NAUKRI_TELEGRAM } from '../../config/telegram.js';
import { notify, sendFooter, sendHeader, sendJob } from '../../../../core/telegram/base.js';

const PLATFORM = 'naukri';

export async function runQuick(minutes = 15) {
  const DAILY_TARGET = getSetting('DAILY_TARGET');
  const deadline = Date.now() + minutes * 60 * 1000;
  const runId = uuid();

  insertRun(runId, 'quick', PLATFORM);
  console.log(`\n[NAUKRI] ⚡ Quick mode — ${minutes} min deadline | target: ${DAILY_TARGET} jobs`);

  const { browser, context, page } = await launchBrowser();
  let sentCount = 0;

  async function onJobFound(job) {
    if (sentCount === 0) await sendHeader(NAUKRI_TELEGRAM, DAILY_TARGET, 'quick');
    sentCount++;
    console.log(`\n📱 Sending job #${sentCount} to Telegram: [${job.score}/100] ${job.title}`);
    await sendJob(NAUKRI_TELEGRAM, job, sentCount);
    updateStatus(job.id, 'sent');
  }

  try {
    while (Date.now() < deadline && sentCount < DAILY_TARGET) {
      console.log(
        `\n🔄 Scraping | Sent: ${sentCount}/${DAILY_TARGET} | Time left: ${Math.round((deadline - Date.now()) / 60000)} mins`,
      );

      const { totalScraped } = await scrapeUntilGoal(
        page, context, runId, onJobFound, DAILY_TARGET - sentCount,
      );

      if (sentCount >= DAILY_TARGET) {
        console.log(`\n🎯 Target reached — ${sentCount} jobs sent`);
        break;
      }

      console.log(`\n⚠️  Scraper exhausted — got ${sentCount}/${DAILY_TARGET} jobs`);
      break;
    }
  } catch (err) {
    console.error('❌ [NAUKRI] Quick mode error:', err.message);
    await notify(NAUKRI_TELEGRAM, `❌ Naukri Bot error: ${err.message}`);
  } finally {
    await browser.close();
  }

  if (sentCount === 0) {
    await notify(NAUKRI_TELEGRAM, '😔 No qualifying jobs found. Try lowering MIN_SCORE in config/filters.js');
    return;
  }

  await sendFooter(NAUKRI_TELEGRAM, { total: sentCount });

  updateRun(runId, {
    jobsScraped: sentCount,
    jobsQualified: sentCount,
    jobsSent: sentCount,
  });

  console.log(`\n✅ [NAUKRI] Done — ${sentCount} jobs sent to Telegram`);
}
