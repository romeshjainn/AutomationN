// ─────────────────────────────────────────────────────────────
//  Live mode — runs all day, every 20 minutes
//  Stops at STOP_HOUR (default 3 PM) or when daily cap hit
//  Only sends NEW jobs each iteration (dedup handles the rest)
// ─────────────────────────────────────────────────────────────

import { v4 as uuid } from 'uuid';
import { launchBrowser } from '../utils/browser.js';
import { scrapeUntilGoal } from '../scraper.js';
import { updateStatus, getSentTodayCount } from '../db/queries/jobs.js';
import { insertRun, updateRun } from '../db/queries/runs.js';
import { getSetting } from '../db/queries/settings.js';
import { sendJob, sendHeader, sendDailyReport, notify } from '../utils/telegram.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const INTERVAL = 20 * 60 * 1000; // 20 minutes
const STOP_HOUR = 15; // 3 PM

export async function runLive() {
  const DAILY_TARGET = getSetting('DAILY_TARGET');
  console.log(`🔄 Live mode started — runs every 20 mins until ${STOP_HOUR}:00`);

  const { browser, context, page } = await launchBrowser();
  let iteration = 0;

  try {
    while (true) {
      const now = new Date();
      const hour = now.getHours();

      // Stop at end of day
      if (hour >= STOP_HOUR) {
        console.log(`\n🛑 It's ${STOP_HOUR}:00 — stopping live mode`);
        await sendDailyReport();
        break;
      }

      // Check daily cap
      const sentToday = getSentTodayCount();
      if (sentToday >= DAILY_TARGET) {
        console.log(`\n🎯 Daily target reached (${sentToday}/${DAILY_TARGET}) — going silent`);
        await notify(
          `✅ Daily target of ${DAILY_TARGET} jobs reached! Bot going silent. Check your list and start applying 🚀`,
        );
        break;
      }

      iteration++;
      const remaining = DAILY_TARGET - sentToday;
      console.log(
        `\n🔄 Iteration ${iteration} | Sent today: ${sentToday}/${DAILY_TARGET} | Need ${remaining} more`,
      );

      const runId = uuid();
      insertRun(runId, 'live');

      const { qualified, hotJobs, totalScraped } = await scrapeUntilGoal(page, context, runId);

      // Only truly new jobs (insertJob already deduped, check status=queued)
      const newJobs = qualified.filter((j) => j.id); // only jobs that were actually inserted

      console.log(`\n📬 ${newJobs.length} new jobs this iteration`);

      // Send hot jobs first, immediately
      const hotNew = newJobs.filter((j) => j.priority === 'hot');
      const normalNew = newJobs
        .filter((j) => j.priority !== 'hot')
        .sort((a, b) => b.score - a.score);

      const allToSend = [...hotNew, ...normalNew].slice(0, remaining);

      for (let i = 0; i < allToSend.length; i++) {
        const job = allToSend[i];
        await sendJob(job, sentToday + i + 1);
        updateStatus(job.id, 'sent');
        await sleep(350);
      }

      updateRun(runId, {
        jobsScraped: totalScraped,
        jobsQualified: qualified.length,
        jobsSent: allToSend.length,
      });

      if (allToSend.length === 0) {
        console.log('💤 No new jobs this round — waiting for next iteration');
      }

      console.log(`\n⏳ Next check in 20 minutes...`);
      await sleep(INTERVAL);
    }
  } catch (err) {
    console.error('❌ Live mode error:', err.message);
    await notify(`❌ Bot error in live mode: ${err.message}`);
  } finally {
    await browser.close();
  }

  console.log('\n✅ Live mode finished');
}
