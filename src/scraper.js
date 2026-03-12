// ─────────────────────────────────────────────────────────────
//  Scraper — goal-driven
//  Scrapes page by page until DAILY_TARGET qualified jobs found
//
//  3-gate system before visiting any detail page:
//  Gate 1 — hard filter  (blocklist, date, exp)       free
//  Gate 2 — pre-score    (keywords+recency+exp ≥ 40)  free
//  Gate 3 — detail visit (applicants, salary, skills) costs a page visit
// ─────────────────────────────────────────────────────────────

import { FILTERS } from '../config/filters.js';
import { JOB_TARGETS } from './constants/jobTargets.js';
import { insertJob, isNewJob } from './db/queries/jobs.js';
import { getSetting } from './db/queries/settings.js';
import { hardFilter, hoursAgo, parseExperience } from './pipeline/filter.js';
import { scoreJob } from './pipeline/scorer.js';
import { clickNextPage, sortByDate } from './utils/browser.js';
import { parsePostedOn, sleep } from './utils/helpers.js';

// ── Pre-score gate (card data only, no page visit) ────────────
// Uses keywords + recency + experience — max 70pts possible
// If this doesn't clear 40, final score can never reach 70
// so skip the detail page entirely

const PRE_SCORE_THRESHOLD = 40;

function preScore(card, keywords) {
  const W = FILTERS.WEIGHTS;

  // Keywords (0→35) using title + card skills
  const haystack = `${card.title} ${card.skills || ''}`.toLowerCase();
  const matched = keywords.filter((kw) => haystack.includes(kw.toLowerCase()));
  const kwScore = Math.round((matched.length / keywords.length) * W.keywords);

  // Recency (0→25)
  const hours = hoursAgo(card.how_long);
  let recencyScore = 0;
  if (hours <= 3) recencyScore = FILTERS.RECENCY_SCORE.under_3_hours;
  else if (hours <= 6) recencyScore = FILTERS.RECENCY_SCORE.under_6_hours;
  else if (hours <= 12) recencyScore = FILTERS.RECENCY_SCORE.under_12_hours;
  else if (hours <= 24) recencyScore = FILTERS.RECENCY_SCORE.under_24_hours;
  else if (hours <= 48) recencyScore = FILTERS.RECENCY_SCORE.yesterday;

  // Experience fit (0→10)
  const exp = parseExperience(card.experience);
  let expScore = FILTERS.EXP_SCORE.acceptable;
  if (exp) {
    if (exp.max <= 2.5) expScore = FILTERS.EXP_SCORE.perfect;
    else if (exp.max <= 4) expScore = FILTERS.EXP_SCORE.acceptable;
    else expScore = 0;
  }

  return {
    total: kwScore + recencyScore + expScore,
    kw: kwScore,
    rec: recencyScore,
    exp: expScore,
  };
}

// ── DOM selectors ─────────────────────────────────────────────

const CARD_SELECTORS = [
  'div.cust-job-tuple',
  'article.jobTuple',
  'div[class*="jobTuple"]',
  'div[class*="job-tuple"]',
  'div[data-job-id]',
];

// ── Extract listing cards (one page) ─────────────────────────

async function extractListingCards(page) {
  await page.waitForSelector(CARD_SELECTORS.join(', '), { timeout: 12000 }).catch(() => {});
  await sleep(800);

  return page.evaluate((selectors) => {
    let cards = [];
    for (const sel of selectors) {
      cards = [...document.querySelectorAll(sel)];
      if (cards.length) break;
    }

    return cards
      .map((card) => {
        const getText = (...sels) => {
          for (const s of sels) {
            const el = card.querySelector(s);
            if (el?.innerText?.trim()) return el.innerText.trim();
          }
          return '';
        };
        const getHref = (...sels) => {
          for (const s of sels) {
            const el = card.querySelector(s);
            if (el?.href) return el.href;
          }
          return '';
        };

        const title = getText(
          'a.title',
          'a[class*="title"]',
          '[class*="jobTitle"] a',
          'h2 a',
          'h3 a',
        );
        const link = getHref(
          'a.title',
          'a[class*="title"]',
          '[class*="jobTitle"] a',
          'h2 a',
          'h3 a',
        );

        const skillEls = card.querySelectorAll(
          'ul.tags li, ul[class*="tag"] li, ul[class*="skill"] li, [class*="skillsList"] li',
        );
        const skills = skillEls.length
          ? [...skillEls]
              .map((e) => e.innerText.trim())
              .filter(Boolean)
              .join(', ')
          : getText('[class*="skillsList"]', '[class*="skills"]', '.tags');

        const experience = getText(
          '[class*="expwdth"]',
          'span[class*="exp"]',
          'li[class*="exp"]',
          '[class*="experience"] li',
          '.exp',
        );
        const city = getText(
          '[class*="locWdth"]',
          'span[class*="loc"]',
          'li[class*="loc"]',
          '[class*="location"] li',
          '.location',
        );
        const how_long = getText(
          'span.job-post-day',
          'span[class*="job-post-day"]',
          'span[class*="postDate"]',
          '[class*="jobAge"]',
          'span[class*="date"]',
        );

        return { title, link, skills, experience, city, how_long };
      })
      .filter((j) => j.title && j.link);
  }, CARD_SELECTORS);
}

// ── Visit job detail page ─────────────────────────────────────

async function scrapeDetail(context, jobUrl) {
  const page = await context.newPage();
  try {
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(700);

    return await page.evaluate(() => {
      const allEls = [...document.querySelectorAll('span, div, li, p')];
      const allBtns = [...document.querySelectorAll('button, a, span')];

      // Easy Apply
      const easy_apply = allBtns.some((el) => /easy\s*apply/i.test(el.innerText));

      // Applicants — parse number out of "100+ Applicants"
      let applicants = null;
      for (const el of allEls) {
        const t = el.innerText?.trim() || '';
        if (/applicant/i.test(t) && t.length < 80) {
          const n = t.match(/(\d+)\+?/);
          if (n) {
            applicants = parseInt(n[1]);
            break;
          }
          if (/be among the first/i.test(t)) {
            applicants = 1;
            break;
          }
        }
      }

      // Openings
      let openings = null;
      for (const el of allEls) {
        const t = el.innerText?.trim() || '';
        const m = t.match(/(\d+)\s*opening/i);
        if (m) {
          openings = parseInt(m[1]);
          break;
        }
      }

      // Salary
      let salary = null;
      for (const el of allEls) {
        const t = el.innerText?.trim() || '';
        if (/not disclosed|lpa|lakh|₹|per annum/i.test(t) && t.length < 80) {
          salary = t;
          break;
        }
      }

      // Full skills from detail page
      const chipEls = document.querySelectorAll(
        '[class*="key-skill"] a, [class*="keySkill"] a, ' +
          '[class*="chip"], [class*="skill-chip"], ' +
          '[class*="skillTag"], [class*="skills"] a',
      );
      const key_skills = chipEls.length
        ? [...chipEls]
            .map((e) => e.innerText.trim())
            .filter(Boolean)
            .join(', ')
        : null;

      return { easy_apply, applicants, openings, salary, key_skills };
    });
  } catch {
    return { easy_apply: false, applicants: null, openings: null, salary: null, key_skills: null };
  } finally {
    await page.close();
  }
}

// ── Main scrape function ──────────────────────────────────────

/**
 * Scrapes page by page across all job targets.
 * Stops as soon as DAILY_TARGET qualified jobs are found.
 * Returns array of fully enriched + scored jobs.
 */
export async function scrapeUntilGoal(page, context, runId, onJobFound = null, remaining = null) {
  const DAILY_TARGET = remaining ?? getSetting('DAILY_TARGET');
  const MAX_PAGES_PER_TYPE = getSetting('MAX_PAGES_PER_TYPE');
  const DEAD_PAGES_LIMIT = getSetting('DEAD_PAGES_LIMIT');

  const qualified = [];
  let totalScrped = 0;

  console.log(`\n🎯 Goal: find ${DAILY_TARGET} more qualified jobs\n`);

  for (const target of JOB_TARGETS) {
    if (qualified.length >= DAILY_TARGET) break;

    console.log(`\n🔍 [${target.type}] Starting...`);

    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await sleep(1500);
    await sortByDate(page);

    let pageNum = 1;
    let deadPages = 0;

    while (qualified.length < DAILY_TARGET && pageNum <= MAX_PAGES_PER_TYPE) {
      console.log(`  📄 Page ${pageNum} | Qualified so far: ${qualified.length}/${DAILY_TARGET}`);

      // Step 1 — get raw cards from listing
      const rawCards = await extractListingCards(page);
      totalScrped += rawCards.length;

      if (!rawCards.length) break;

      // Step 2 — hard filter (instant, no page visits)
      const survivors = [];
      for (const card of rawCards) {
        const { passed, reason } = hardFilter({ ...card, type: target.type });
        if (passed) survivors.push({ ...card, type: target.type });
      }

      console.log(`  ✅ ${rawCards.length} cards → ${survivors.length} passed hard filter`);

      if (survivors.length === 0) {
        deadPages++;
        console.log(`  ⚠️  Dead page ${deadPages}/${DEAD_PAGES_LIMIT}`);
        if (deadPages >= DEAD_PAGES_LIMIT) {
          console.log(`  🚫 Too many dead pages — moving to next type`);
          break;
        }
      } else {
        deadPages = 0;
      }

      // Step 3 — visit detail pages ONLY for survivors that pass pre-score
      for (const job of survivors) {
        if (qualified.length >= DAILY_TARGET) break;

        // Gate 1 — dedup check (free)
        if (!isNewJob(job.link)) {
          console.log(`    ⏭  Duplicate — ${job.title}`);
          continue;
        }

        // Gate 2 — pre-score on card data only (free, no page visit)
        // Scores keywords + recency + experience from listing card
        // If can't reach MIN_SCORE even with perfect applicants/easy_apply → skip
        const preScoreBreakdown = preScore(job, target.keywords);
        const ps = preScoreBreakdown.total;

        if (ps < PRE_SCORE_THRESHOLD) {
          console.group(`⏭ SKIPPED: ${job.title}`);

          console.log(`Score: ${ps} (threshold ${PRE_SCORE_THRESHOLD})`);

          console.group('Score Breakdown');
          console.log(`keywords: ${preScoreBreakdown.kw}`);
          console.log(`recency : ${preScoreBreakdown.rec}`);
          console.log(`exp     : ${preScoreBreakdown.exp}`);
          console.groupEnd();

          console.group('Job Details');
          console.log(`posted: ${job.how_long}`);
          console.log(`experience: ${job.experience}`);
          console.log(`skills: ${job.skills?.slice(0, 60)}`);
          console.groupEnd();

          console.groupEnd();

          continue;
        }

        // FIND THIS:
        console.log(`    ⏭  Pre-score too low (${ps}) — skipping detail page — ${job.title}`);

        // REPLACE WITH:

        console.log(`    🔎 Pre-score: ${ps} — visiting detail page — ${job.title}`);

        // Gate 3 — visit detail page (costs one page open)
        const detail = await scrapeDetail(context, job.link);
        await sleep(400);

        // Merge listing + detail
        const enriched = {
          ...job,
          easy_apply: detail.easy_apply,
          applicants: detail.applicants,
          openings: detail.openings,
          salary: detail.salary,
          skills_needed: detail.key_skills || job.skills,
          posted_on: parsePostedOn(job.how_long),
        };

        // Step 4 — score
        const { score, priority, matched_keywords, breakdown } = scoreJob(
          enriched,
          target.keywords,
        );

        const MIN_SCORE = getSetting('MIN_SCORE');
        if (score < MIN_SCORE) {
          console.log(`    ❌ Score too low (${score}) — ${job.title}`);
          continue;
        }

        const finalJob = { ...enriched, score, priority, matched_keywords };

        // Save to DB
        insertJob(finalJob, runId);
        qualified.push(finalJob);

        const tag = priority === 'hot' ? '🔥 HOT' : '✅';
        console.log(
          `    ${tag} [${score}/100] ${job.title} | ${detail.applicants ?? '?'} applicants`,
        );

        // ── Fire callback immediately — send to Telegram right now ──
        if (onJobFound) await onJobFound(finalJob);
      }

      // Next page
      const hasNext = await clickNextPage(page);
      if (!hasNext) {
        console.log('  🚫 No next page');
        break;
      }
      await sleep(2000);
      pageNum++;
    }

    console.log(`\n📦 [${target.type}] done | Qualified total: ${qualified.length}`);
  }

  console.log(`\n✅ Scrape complete — ${qualified.length} qualified from ${totalScrped} scraped`);

  return {
    qualified,
    totalScraped: totalScrped,
  };
}
