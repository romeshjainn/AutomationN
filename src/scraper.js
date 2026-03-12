// ─────────────────────────────────────────────────────────────
//  Scraper — goal-driven with AI evaluation
//
//  Gate 1 — Hard filter   (static, instant) — blocklist/date/exp
//  Gate 2 — Detail visit  — get full job data
//  Gate 3 — AI evaluate   — gemma3:4b scores and pass/fails
// ─────────────────────────────────────────────────────────────

import { checkAI } from './ai/client.js';
import { evaluateJob } from './ai/evaluator.js';
import { JOB_TARGETS } from './constants/jobTargets.js';
import { insertJob, isNewJob } from './db/queries/jobs.js';
import { getSetting } from './db/queries/settings.js';
import { hardFilter } from './pipeline/filter.js';
import { clickNextPage, sortByDate } from './utils/browser.js';
import { parsePostedOn, sleep } from './utils/helpers.js';

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
        const salary =
          getText(
            '[class*="salary"]',
            '[class*="sal-wrap"]',
            '[class*="ctc"]',
            'span[class*="sal"]',
            '[class*="compensation"]',
            'li[class*="salary"]',
            'span[class*="package"]',
          ) ||
          (() => {
            // fallback — scan all text nodes for LPA/lakh pattern
            const all = [...card.querySelectorAll('span, li, div')];
            for (const el of all) {
              const t = el.innerText?.trim() || '';
              if (/lpa|lakh|₹|lac|per annum|ctc|p\.a/i.test(t) && t.length < 60) return t;
            }
            return '';
          })();

        return { title, link, skills, experience, city, how_long, salary };
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

  // Check AI once at start — if down, fallback to static scoring
  const aiAvailable = await checkAI();
  console.log(
    `\n🎯 Goal: find ${DAILY_TARGET} more qualified jobs | AI: ${aiAvailable ? '✅ ON' : '⚠️ OFF (static fallback)'}\n`,
  );

  const shuffled = [...JOB_TARGETS].sort(() => Math.random() - 0.5);
  for (const target of shuffled) {
    if (qualified.length >= DAILY_TARGET) break;

    console.log(`\n🔍 [${target.type}] Starting...`);

    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await sleep(1500);
    await sortByDate(page);

    let pageNum = 1;
    let deadPages = 0;

    while (qualified.length < DAILY_TARGET && pageNum <= MAX_PAGES_PER_TYPE) {
      console.log(`  📄 Page ${pageNum} | Qualified: ${qualified.length}/${DAILY_TARGET}`);

      // ── Step 1: Extract listing cards ──────────────────────
      const rawCards = await extractListingCards(page);
      totalScrped += rawCards.length;
      if (!rawCards.length) break;

      // ── Step 2: Hard filter (free, instant) ────────────────
      const survivors = [];
      for (const card of rawCards) {
        const { passed, reason } = hardFilter({ ...card, type: target.type });
        if (passed) {
          survivors.push({ ...card, type: target.type });
        } else {
          console.log(`    ✗ [${reason}] ${card.title}`);
        }
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

      // ── Step 3: Visit detail page + AI evaluate ─────────────
      for (const job of survivors) {
        if (qualified.length >= DAILY_TARGET) break;

        // Dedup check
        if (!isNewJob(job.link)) {
          console.log(`    ⏭  Seen before — ${job.title}`);
          continue;
        }

        // Visit detail page — get full data
        console.log(`    🌐 Visiting: ${job.title}`);
        const detail = await scrapeDetail(context, job.link);

        console.log(
          `    💰 DEBUG detail — salary:"${detail.salary}" applicants:${detail.applicants} easy_apply:${detail.easy_apply}`,
        );
        await sleep(400);

        // Merge card + detail into full job object
        const enriched = {
          ...job,
          easy_apply: detail.easy_apply,
          applicants: detail.applicants,
          openings: detail.openings,
          salary: detail.salary,
          skills_needed: detail.key_skills || job.skills,
          posted_on: parsePostedOn(job.how_long),
        };

        // Instant reject — wrong stack or irrelevant role

        const INSTANT_REJECT =
          /\bjava\b|\.net\b|spring boot|django|laravel|ruby on rails|angular developer|vue developer|kotlin developer|swift developer|data scientist|machine learning|devops engineer|qa engineer|test engineer|salesforce|sap \b|bpo|kpo|non.?voice|voice process|email process|chat process|back office|customer support|telecaller|data entry|email support|project manager|project lead|scrum master|delivery manager|program manager/i;

        if (INSTANT_REJECT.test(`${job.title} ${enriched.skills_needed || ''}`)) {
          console.log(`    ⛔ Instant reject (wrong stack) — ${job.title}`);
          continue;
        }

        // ── AI evaluation ──────────────────────────────────────
        console.log(`    🤖 AI evaluating: ${job.title}`);
        const evaluation = await evaluateJob(enriched, target.type, target.keywords, aiAvailable);

        console.log(
          `    ${evaluation.pass ? '✅' : '❌'} AI score: ${evaluation.score}/100 | ${evaluation.reason}`,
        );

        if (!evaluation.pass) {
          if (evaluation.concerns) console.log(`       ⚠️  ${evaluation.concerns}`);
          continue;
        }

        // ── Passed everything — save and send ──────────────────
        const priority = evaluation.score >= 85 ? 'hot' : 'normal';
        const finalJob = {
          ...enriched,
          score: evaluation.score,
          priority,
          matched_keywords: target.keywords.filter((kw) =>
            `${job.title} ${enriched.skills_needed}`.toLowerCase().includes(kw.toLowerCase()),
          ),
          ai_reason: evaluation.reason,
          ai_highlights: evaluation.highlights,
        };

        insertJob(finalJob, runId);
        qualified.push(finalJob);

        const tag = priority === 'hot' ? '🔥 HOT' : '✅ PASS';
        console.log(`    ${tag} [${evaluation.score}/100] ${job.title}`);
        if (evaluation.highlights) console.log(`       ⭐ ${evaluation.highlights}`);

        // Send to Telegram immediately
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

  return { qualified, totalScraped: totalScrped };
}
