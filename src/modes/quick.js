// ─────────────────────────────────────────────────────────────
//  Quick mode — sends each job to Telegram IMMEDIATELY as found
//  No waiting between iterations
//  Stops when DAILY_TARGET hit or time runs out
// ─────────────────────────────────────────────────────────────

import { v4 as uuid } from 'uuid';
import { launchBrowser } from '../utils/browser.js';
import { scrapeUntilGoal } from '../scraper.js';
import { updateStatus } from '../db/queries/jobs.js';
import { insertRun, updateRun } from '../db/queries/runs.js';
import { getSetting } from '../db/queries/settings.js';
import { sendJob, sendHeader, sendFooter, notify } from '../utils/telegram.js';

export async function runQuick(minutes = 15) {
  const DAILY_TARGET = getSetting('DAILY_TARGET');
  const deadline = Date.now() + minutes * 60 * 1000;
  const runId = uuid();

  insertRun(runId, 'quick');
  console.log(`⚡ Quick mode — ${minutes} min deadline | target: ${DAILY_TARGET} jobs`);

  const { browser, context, page } = await launchBrowser();

  let sentCount = 0;

  // ── Called immediately each time a job qualifies ────────────
  async function onJobFound(job) {
    if (sentCount === 0) {
      await sendHeader(DAILY_TARGET, 'quick');
    }
    sentCount++;
    console.log(`\n📱 Sending job #${sentCount} to Telegram: [${job.score}/100] ${job.title}`);
    await sendJob(job, sentCount);
    updateStatus(job.id, 'sent');
  }

  try {
    while (Date.now() < deadline && sentCount < DAILY_TARGET) {
      console.log(
        `\n🔄 Scraping | Sent: ${sentCount}/${DAILY_TARGET} | Time left: ${Math.round((deadline - Date.now()) / 60000)} mins`,
      );

      const { totalScraped } = await scrapeUntilGoal(
        page,
        context,
        runId,
        onJobFound, // ← callback fired per job as found
        DAILY_TARGET - sentCount, // ← only find what we still need
      );

      if (sentCount >= DAILY_TARGET) {
        console.log(`\n🎯 Target reached — ${sentCount} jobs sent`);
        break;
      }

      // If scraper exhausted all pages and still need more — stop, don't loop
      console.log(`\n⚠️  Scraper exhausted — got ${sentCount}/${DAILY_TARGET} jobs`);
      break;
    }
  } catch (err) {
    console.error('❌ Quick mode error:', err.message);
    await notify(`❌ Bot error: ${err.message}`);
  } finally {
    await browser.close();
  }

  if (sentCount === 0) {
    await notify('😔 No qualifying jobs found. Try lowering MIN_SCORE in config/filters.js');
    return;
  }

  await sendFooter({ total: sentCount });

  updateRun(runId, {
    jobsScraped: sentCount,
    jobsQualified: sentCount,
    jobsSent: sentCount,
  });

  console.log(`\n✅ Done — ${sentCount} jobs sent to Telegram`);
}
