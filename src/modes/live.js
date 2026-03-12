// ─────────────────────────────────────────────────────────────
//  Live mode — runs all day, every 20 minutes
//  Sends each job IMMEDIATELY as found
//  Hot jobs (88+) always sent first
//  Normal jobs compared against recent avg before sending
//  Stops at 6 PM sharp or when daily cap hit
// ─────────────────────────────────────────────────────────────

import { v4 as uuid } from 'uuid';
import { getRecentlySent, getSentTodayCount, updateStatus } from '../db/queries/jobs.js';
import { insertRun, updateRun } from '../db/queries/runs.js';
import { getSetting } from '../db/queries/settings.js';
import { scrapeUntilGoal } from '../scraper.js';
import { launchBrowser } from '../utils/browser.js';
import { notify, sendDailyReport, sendHeader, sendJob } from '../utils/telegram.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// const INTERVAL = 20 * 60 * 1000;
const INTERVAL = 3000;
const STOP_HOUR = 18;

export async function runLive() {
  const DAILY_TARGET = getSetting('DAILY_TARGET');
  const HOT_SCORE = getSetting('HOT_SCORE');

  console.log(`🔄 Live mode — every 20 mins until ${STOP_HOUR}:00 | target: ${DAILY_TARGET} jobs`);

  const { browser, context, page } = await launchBrowser();

  let headerSent = false;

  // ── Fires immediately each time a job qualifies ──────────────
  async function onJobFound(job) {
    const currentSent = getSentTodayCount();

    if (currentSent >= DAILY_TARGET) return;

    if (!headerSent) {
      await sendHeader(DAILY_TARGET, 'live');
      headerSent = true;
    }

    // HOT job → send immediately, skip comparison
    if (job.score >= HOT_SCORE) {
      console.log(`\n🔥 HOT [${job.score}/100] — ${job.title}`);
      await sendJob(job, currentSent + 1);
      updateStatus(job.id, 'sent');
      return;
    }

    // Normal job → compare against last 3 sent
    const recent = getRecentlySent(3);
    const avgScore = recent.length ? recent.reduce((s, j) => s + j.score, 0) / recent.length : 0;

    if (recent.length < 3 || job.score >= avgScore - 5) {
      console.log(`\n📱 Sending [${job.score}/100 vs avg ${Math.round(avgScore)}] — ${job.title}`);
      await sendJob(job, currentSent + 1);
      updateStatus(job.id, 'sent');
    } else {
      console.log(
        `\n⏸  Holding [${job.score}/100 below avg ${Math.round(avgScore)}] — ${job.title}`,
      );
      // stays queued in DB
    }
  }

  // ── Main loop ─────────────────────────────────────────────────
  try {
    while (true) {
      const hour = new Date().getHours();

      // 6 PM → stop
      if (hour >= STOP_HOUR) {
        console.log(`\n🛑 ${STOP_HOUR}:00 — stopping live mode`);
        await sendDailyReport();
        break;
      }

      const sentToday = getSentTodayCount();

      // Cap hit → go silent but keep looping (hot jobs can still appear)
      if (sentToday >= DAILY_TARGET) {
        console.log(`\n🎯 Cap hit (${sentToday}/${DAILY_TARGET}) — silent until 6 PM`);
        await sleep(INTERVAL);
        continue;
      }

      const remaining = DAILY_TARGET - sentToday;
      const runId = uuid();
      insertRun(runId, 'live');

      console.log(`\n🔄 Scraping | Sent: ${sentToday}/${DAILY_TARGET} | Need: ${remaining}`);

      const { totalScraped, qualified } = await scrapeUntilGoal(
        page,
        context,
        runId,
        onJobFound,
        remaining,
      );

      updateRun(runId, {
        jobsScraped: totalScraped,
        jobsQualified: qualified.length,
        jobsSent: getSentTodayCount() - sentToday,
      });

      console.log(`\n🔄 Restarting scrape immediately...`);
      await sleep(INTERVAL);
    }
  } catch (err) {
    console.error('❌ Live mode error:', err.message);
    await notify(`❌ Bot error: ${err.message}`);
  } finally {
    await browser.close();
  }

  console.log('\n✅ Live mode finished');
}
