// ─────────────────────────────────────────────────────────────
//  platforms/naukri/src/scraper/index.js
//  Naukri scraper — three-gate pipeline
//
//  Gate 1 — Hard filter   (static, instant) — blocklist/date/exp
//  Gate 2 — Detail visit  — full job data from detail page
//  Gate 3 — AI evaluate   — gemma3:4b scores and pass/fails
// ─────────────────────────────────────────────────────────────

import { checkAI } from '#core/ai/client.js';
import { evaluateJob } from '../ai/prompt.js';
import { JOB_TARGETS } from '../../config/targets.js';
import { insertJob, isNewJob } from '#core/db/queries/jobs.js';
import { getSetting } from '../utils/settings.js';
import { hardFilter } from '../pipeline/filter.js';
import { clickNextPage, sortByDate } from '../utils/browser.js';
import { parsePostedOn, sleep } from '#core/utils/helpers.js';

const PLATFORM = 'naukri';

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

        const title = getText('a.title', 'a[class*="title"]', '[class*="jobTitle"] a', 'h2 a', 'h3 a');
        const link = getHref('a.title', 'a[class*="title"]', '[class*="jobTitle"] a', 'h2 a', 'h3 a');

        const skillEls = card.querySelectorAll(
          'ul.tags li, ul[class*="tag"] li, ul[class*="skill"] li, [class*="skillsList"] li',
        );
        const skills = skillEls.length
          ? [...skillEls].map((e) => e.innerText.trim()).filter(Boolean).join(', ')
          : getText('[class*="skillsList"]', '[class*="skills"]', '.tags');

        const experience = getText('[class*="expwdth"]', 'span[class*="exp"]', 'li[class*="exp"]', '[class*="experience"] li', '.exp');
        const city = getText('[class*="locWdth"]', 'span[class*="loc"]', 'li[class*="loc"]', '[class*="location"] li', '.location');
        const how_long = getText('span.job-post-day', 'span[class*="job-post-day"]', 'span[class*="postDate"]', '[class*="jobAge"]', 'span[class*="date"]');
        const salary =
          getText('[class*="salary"]', '[class*="sal-wrap"]', '[class*="ctc"]', 'span[class*="sal"]', '[class*="compensation"]', 'li[class*="salary"]', 'span[class*="package"]') ||
          (() => {
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
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await sleep(1000);

    return await page.evaluate(() => {
      const allEls = [...document.querySelectorAll('span, div, li, p')];
      const allBtns = [...document.querySelectorAll('button, a, span')];

      const easy_apply = allBtns.some((el) => /easy\s*apply/i.test(el.innerText));

      let applicants = null;
      for (const el of allEls) {
        const t = el.innerText?.trim() || '';
        if (/applicant/i.test(t) && t.length < 80) {
          if (/be among the first/i.test(t)) { applicants = 1; break; }
          const n = t.match(/(\d+)\+?/);
          if (n) { applicants = parseInt(n[1]); break; }
        }
      }

      let openings = null;
      for (const el of allEls) {
        const t = el.innerText?.trim() || '';
        const m = t.match(/(\d+)\s*opening/i);
        if (m) { openings = parseInt(m[1]); break; }
      }

      let salary = null;
      const salaryEl = document.querySelector('[class*="salary"], [class*="ctc"], [class*="sal-wrap"], [class*="compensation"], [class*="package"], span[class*="sal"]');
      if (salaryEl?.innerText?.trim()) salary = salaryEl.innerText.trim();
      if (!salary) {
        for (const el of allEls) {
          const t = el.innerText?.trim() || '';
          if (
            t.length < 100 && t.length > 3 &&
            /not disclosed|lpa|lakh|lac|₹|per annum|p\.a\b|pa\b|ctc|per month|\d+\s*-\s*\d+/i.test(t) &&
            !/apply|posted|opening|applicant|experience|location/i.test(t)
          ) {
            salary = t; break;
          }
        }
      }

      let key_skills = null;
      const chipEls = document.querySelectorAll(
        '[class*="key-skill"] a, [class*="keySkill"] a, ' +
        '[class*="chip"]:not([class*="location"]):not([class*="exp"]), ' +
        '[class*="skill-chip"], [class*="skillTag"], ' +
        '[class*="tags"] li, [class*="tag-list"] li, ' +
        'a[class*="skill"], [class*="skills"] a',
      );
      if (chipEls.length > 0) {
        key_skills = [...chipEls].map((e) => e.innerText.trim()).filter(Boolean).join(', ');
      }
      if (!key_skills) {
        for (const el of allEls) {
          if (/key skills|required skills/i.test(el.innerText) && el.innerText.length < 30) {
            const next = el.nextElementSibling;
            if (next) { key_skills = next.innerText.trim(); break; }
          }
        }
      }

      return { easy_apply, applicants, openings, salary, key_skills };
    });
  } catch (err) {
    console.log(`    ⚠️  Detail page error: ${err.message?.slice(0, 60)}`);
    return { easy_apply: false, applicants: null, openings: null, salary: null, key_skills: null };
  } finally {
    await page.close();
  }
}

// ── Instant reject regex ──────────────────────────────────────

const INSTANT_REJECT =
  /\bjava\b|\.net\b|spring boot|django|laravel|ruby on rails|angular developer|vue developer|kotlin developer|swift developer|data scientist|machine learning|devops engineer|qa engineer|test engineer|salesforce|sap \b|bpo|kpo|non.?voice|voice process|email process|chat process|back office|customer support|telecaller|data entry|email support|project manager|project lead|scrum master|delivery manager|program manager/i;

// ── Main scrape function ──────────────────────────────────────

/**
 * Scrapes page by page across all Naukri job targets.
 * Stops as soon as goal reached.
 *
 * @param {Page}     page
 * @param {Context}  context
 * @param {string}   runId
 * @param {Function} onJobFound  - callback fired immediately per qualified job
 * @param {number}   remaining   - how many more jobs needed
 */
export async function scrapeUntilGoal(page, context, runId, onJobFound = null, remaining = null) {
  const DAILY_TARGET = remaining ?? getSetting('DAILY_TARGET');
  const MAX_PAGES_PER_TYPE = getSetting('MAX_PAGES_PER_TYPE');
  const DEAD_PAGES_LIMIT = getSetting('DEAD_PAGES_LIMIT');

  const qualified = [];
  let totalScraped = 0;

  const aiAvailable = await checkAI();
  console.log(
    `\n🎯 Goal: find ${DAILY_TARGET} more qualified jobs | AI: ${aiAvailable ? '✅ ON' : '⚠️ OFF (static fallback)'}\n`,
  );

  // Prioritise react 70% of the time, then mern, then RN
  const rand = Math.random();
  const shuffled =
    rand < 0.7
      ? [JOB_TARGETS[0], JOB_TARGETS[1], JOB_TARGETS[2]]
      : [JOB_TARGETS[1], JOB_TARGETS[0], JOB_TARGETS[2]];

  for (const target of shuffled) {
    if (qualified.length >= DAILY_TARGET) break;

    console.log(`\n🔍 [${target.type}] Starting...`);

    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await sleep(1500);
    await sortByDate(page);

    let pageNum = 1;
    let deadPages = 0;

    while (qualified.length < DAILY_TARGET && pageNum <= MAX_PAGES_PER_TYPE) {
      console.log(`\n  📄 Page ${pageNum} | Qualified: ${qualified.length}/${DAILY_TARGET}`);

      const rawCards = await extractListingCards(page);
      totalScraped += rawCards.length;

      if (!rawCards.length) {
        console.log(`  ⚠️  No cards found on page ${pageNum} — may be blocked or empty`);
        break;
      }

      // ── Gate 1: Hard filter ─────────────────────────────────
      const survivors = [];
      for (const card of rawCards) {
        const { passed, reason } = hardFilter({ ...card, type: target.type });
        if (passed) {
          survivors.push({ ...card, type: target.type });
          console.log(`    ✓ PASS | "${card.title}" | ${card.experience} | ${card.how_long}`);
        } else {
          console.log(`    ✗ KILL [${reason.padEnd(30)}] | "${card.title}"`);
        }
      }
      console.log(`  ✅ Hard filter: ${survivors.length} passed | ${rawCards.length - survivors.length} killed`);

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

      // ── Gate 2 + 3: Detail visit + AI ──────────────────────
      for (const job of survivors) {
        if (qualified.length >= DAILY_TARGET) break;

        if (!isNewJob(job.link)) {
          console.log(`    ⏭  DUPLICATE | Already in DB — "${job.title}"`);
          continue;
        }

        // ── Pre-detail reject: title + listing skills (free, no page visit) ──
        if (INSTANT_REJECT.test(`${job.title} ${job.skills || ''}`)) {
          console.log(`    ⛔ TITLE REJECT  | Wrong stack — "${job.title}"`);
          continue;
        }

        console.log(`\n    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`    🌐 VISITING   | "${job.title}"`);
        console.log(`    📍 Location   | ${job.city || 'N/A'} | Exp: ${job.experience || 'N/A'} | Posted: ${job.how_long}`);

        const detail = await scrapeDetail(context, job.link);
        console.log(`    📊 DETAIL     | Applicants: ${detail.applicants ?? '?'} | Salary: ${detail.salary || 'Not disclosed'} | Easy Apply: ${detail.easy_apply ? 'YES' : 'NO'}`);
        await sleep(400);

        const enriched = {
          ...job,
          easy_apply: detail.easy_apply,
          applicants: detail.applicants,
          openings: detail.openings,
          salary: detail.salary,
          skills_needed: detail.key_skills || job.skills,
          posted_on: parsePostedOn(job.how_long),
        };

        // Post-detail reject: re-check with full skills from detail page
        if (INSTANT_REJECT.test(`${job.title} ${enriched.skills_needed || ''}`)) {
          console.log(`    ⛔ SKILL REJECT  | Wrong stack in detail — "${job.title}"`);
          continue;
        }

        console.log(`    🤖 AI EVALUATING...`);
        const evaluation = await evaluateJob(enriched, target.type, target.keywords, aiAvailable);
        const aiStatus = evaluation.pass ? '✅ PASS' : '❌ FAIL';
        const aiTag = evaluation.score >= 88 ? '🔥 HOT' : evaluation.score >= 75 ? '⭐ GOOD' : '📋 WEAK';
        console.log(`    ${aiStatus} | ${aiTag} | Score: ${evaluation.score}/100`);
        console.log(`    💬 ${evaluation.reason}`);
        if (evaluation.highlights) console.log(`    ⭐ ${evaluation.highlights}`);
        if (evaluation.concerns) console.log(`    ⚠️  ${evaluation.concerns}`);

        if (!evaluation.pass) continue;

        // ── Passed everything — save and send ────────────────
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

        insertJob(finalJob, runId, PLATFORM);
        qualified.push(finalJob);

        const tag = priority === 'hot' ? '🔥 HOT' : '✅ QUALIFIED';
        console.log(`    ${tag} | Score: ${evaluation.score}/100 | "${job.title}"`);
        console.log(`    📲 SENDING TO TELEGRAM NOW...`);

        if (onJobFound) await onJobFound(finalJob);
      }

      const hasNext = await clickNextPage(page);
      if (!hasNext) { console.log('  🚫 No next page'); break; }
      await sleep(2000);
      pageNum++;
    }

    console.log(`\n📦 [${target.type}] done | Qualified total: ${qualified.length}`);
  }

  console.log(`\n✅ Scrape complete — ${qualified.length} qualified from ${totalScraped} scraped`);
  return { qualified, totalScraped };
}
