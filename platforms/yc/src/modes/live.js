// ─────────────────────────────────────────────────────────────
//  platforms/yc/src/modes/live.js
//  YC live mode — checks every 30 mins (YC posts fewer jobs)
// ─────────────────────────────────────────────────────────────

import { v4 as uuid } from 'uuid';
import { getRecentlySent, getSentTodayCount, updateStatus } from '../../../../core/db/queries/jobs.js';
import { insertRun, updateRun } from '../../../../core/db/queries/runs.js';
import { getSetting } from '../utils/settings.js';
import { scrapeUntilGoal } from '../scraper/index.js';
import { launchBrowser } from '../utils/browser.js';
import { YC_TELEGRAM } from '../../config/telegram.js';
import { notify, sendDailyReport, sendHeader, sendJob } from '../../../../core/telegram/base.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const INTERVAL = parseInt(process.env.SCRAPE_INTERVAL_MS ?? '0'); // 0 = restart immediately
const STOP_HOUR = parseInt(process.env.STOP_HOUR ?? '18'); // default 6 PM, override in .env
const PLATFORM = 'yc';

export async function runLive() {
  const DAILY_TARGET = getSetting('DAILY_TARGET');
  const HOT_SCORE = getSetting('HOT_SCORE');

  console.log(`\n[YC] 🔄 Live mode — every 30 mins until ${STOP_HOUR}:00 | target: ${DAILY_TARGET} jobs`);

  const { browser, context, page } = await launchBrowser();
  let headerSent = false;

  async function onJobFound(job) {
    const currentSent = getSentTodayCount(PLATFORM);
    if (currentSent >= DAILY_TARGET) return;

    if (!headerSent) {
      await sendHeader(YC_TELEGRAM, DAILY_TARGET, 'live');
      headerSent = true;
    }

    if (job.score >= HOT_SCORE) {
      console.log(`\n🔥 [YC] HOT [${job.score}/100] — ${job.title}`);
      await sendJob(YC_TELEGRAM, job, currentSent + 1);
      updateStatus(job.id, 'sent');
      return;
    }

    const recent = getRecentlySent(3, PLATFORM);
    const avgScore = recent.length ? recent.reduce((s, j) => s + j.score, 0) / recent.length : 0;

    if (recent.length < 3 || job.score >= avgScore - 5) {
      console.log(`\n📱 [YC] Sending [${job.score}/100 vs avg ${Math.round(avgScore)}] — ${job.title}`);
      await sendJob(YC_TELEGRAM, job, currentSent + 1);
      updateStatus(job.id, 'sent');
    } else {
      console.log(`\n⏸  [YC] Holding [${job.score}/100 below avg ${Math.round(avgScore)}] — ${job.title}`);
    }
  }

  try {
    while (true) {
      const hour = new Date().getHours();

      if (hour >= STOP_HOUR) {
        console.log(`\n🛑 [YC] ${STOP_HOUR}:00 — stopping`);
        await sendDailyReport(YC_TELEGRAM, PLATFORM);
        break;
      }

      const sentToday = getSentTodayCount(PLATFORM);

      if (sentToday >= DAILY_TARGET) {
        console.log(`\n🎯 [YC] Cap hit (${sentToday}/${DAILY_TARGET}) — silent until ${STOP_HOUR}:00`);
        await sleep(5 * 60 * 1000); // check again in 5 mins
        continue;
      }

      const remaining = DAILY_TARGET - sentToday;
      const runId = uuid();
      insertRun(runId, 'live', PLATFORM);

      console.log(`\n[YC] 🔄 Scraping | Sent: ${sentToday}/${DAILY_TARGET} | Need: ${remaining}`);

      const { totalScraped, qualified } = await scrapeUntilGoal(page, context, runId, onJobFound, remaining);

      updateRun(runId, {
        jobsScraped: totalScraped,
        jobsQualified: qualified.length,
        jobsSent: getSentTodayCount(PLATFORM) - sentToday,
      });

      console.log(`\n[YC] 🔄 Waiting ${INTERVAL / 60000} mins...`);
      await sleep(INTERVAL);
    }
  } catch (err) {
    console.error('❌ [YC] Live mode error:', err.message);
    await notify(YC_TELEGRAM, `❌ YC Bot error: ${err.message}`);
  } finally {
    await browser.close();
  }

  console.log('\n✅ [YC] Live mode finished');
}
