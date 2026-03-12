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
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await sleep(1000);

    return await page.evaluate(() => {
      const allEls = [...document.querySelectorAll('span, div, li, p')];
      const allBtns = [...document.querySelectorAll('button, a, span')];

      // ── Easy Apply ───────────────────────────────────────────
      const easy_apply = allBtns.some((el) => /easy\s*apply/i.test(el.innerText));

      // ── Applicants ───────────────────────────────────────────
      let applicants = null;
      for (const el of allEls) {
        const t = el.innerText?.trim() || '';
        if (/applicant/i.test(t) && t.length < 80) {
          if (/be among the first/i.test(t)) {
            applicants = 1;
            break;
          }
          const n = t.match(/(\d+)\+?/);
          if (n) {
            applicants = parseInt(n[1]);
            break;
          }
        }
      }

      // ── Openings ─────────────────────────────────────────────
      let openings = null;
      for (const el of allEls) {
        const t = el.innerText?.trim() || '';
        const m = t.match(/(\d+)\s*opening/i);
        if (m) {
          openings = parseInt(m[1]);
          break;
        }
      }

      // ── Salary — expanded regex ───────────────────────────────
      let salary = null;

      // Try dedicated salary selectors first
      const salaryEl = document.querySelector(
        '[class*="salary"], [class*="ctc"], [class*="sal-wrap"], ' +
          '[class*="compensation"], [class*="package"], span[class*="sal"]',
      );
      if (salaryEl?.innerText?.trim()) {
        salary = salaryEl.innerText.trim();
      }

      // Fallback — scan text nodes
      if (!salary) {
        for (const el of allEls) {
          const t = el.innerText?.trim() || '';
          if (
            t.length < 100 &&
            t.length > 3 &&
            /not disclosed|lpa|lakh|lac|₹|per annum|p\.a\b|pa\b|ctc|per month|\d+\s*-\s*\d+/i.test(
              t,
            ) &&
            !/apply|posted|opening|applicant|experience|location/i.test(t)
          ) {
            salary = t;
            break;
          }
        }
      }

      // ── Skills — multiple selector strategies ────────────────
      let key_skills = null;

      // Strategy 1 — dedicated skill chip elements
      const chipEls = document.querySelectorAll(
        '[class*="key-skill"] a, [class*="keySkill"] a, ' +
          '[class*="chip"]:not([class*="location"]):not([class*="exp"]), ' +
          '[class*="skill-chip"], [class*="skillTag"], ' +
          '[class*="tags"] li, [class*="tag-list"] li, ' +
          'a[class*="skill"], [class*="skills"] a',
      );
      if (chipEls.length > 0) {
        key_skills = [...chipEls]
          .map((e) => e.innerText.trim())
          .filter(Boolean)
          .join(', ');
      }

      // Strategy 2 — look for skills section heading then grab nearby text
      if (!key_skills) {
        for (const el of allEls) {
          if (/key skills|required skills/i.test(el.innerText) && el.innerText.length < 30) {
            const next = el.nextElementSibling;
            if (next) {
              key_skills = next.innerText.trim();
              break;
            }
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

  // const shuffled = [...JOB_TARGETS].sort(() => Math.random() - 0.5);
  const rand = Math.random();
  const shuffled =
    rand < 0.7
      ? [JOB_TARGETS[0], JOB_TARGETS[1], JOB_TARGETS[2]] // 70% → react, mern, reactnative
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
      console.log(
        `\n  📄 Page ${pageNum} | Qualified: ${qualified.length}/${DAILY_TARGET} | Found so far: ${qualified.length}`,
      );
      console.log(`  🔎 Extracting cards from page...`);
      // ── Step 1: Extract listing cards ──────────────────────
      const rawCards = await extractListingCards(page);
      console.log(rawCards, 'rawCards');
      totalScrped += rawCards.length;
      if (!rawCards.length) {
        console.log(
          `  ⚠️  NO CARDS FOUND on page ${pageNum} — Naukri may have blocked or page is empty`,
        );
        break;
      }

      // ── Step 2: Hard filter (free, instant) ────────────────
      const survivors = [];
      for (const card of rawCards) {
        const { passed, reason } = hardFilter({ ...card, type: target.type });
        if (passed) {
          survivors.push({ ...card, type: target.type });
          console.log(
            `    ✓ PASS         | "${card.title}" | exp:${card.experience} | posted:${card.how_long}`,
          );
        } else {
          console.log(`    ✗ KILL [${reason.padEnd(30)}] | "${card.title}"`);
        }
      }
      console.log(`  📦 ${rawCards.length} cards extracted`);
      console.log(
        `  ✅ Hard filter: ${survivors.length} passed | ${rawCards.length - survivors.length} killed`,
      );
      if (rawCards.length > 0 && survivors.length === 0) {
        console.log(`  ⚠️  ALL CARDS KILLED — reasons below:`);
        rawCards.slice(0, 5).forEach((card) => {
          const { reason } = hardFilter({ ...card, type: target.type });
          console.log(
            `     ✗ [${reason}] "${card.title}" | posted: ${card.how_long} | exp: ${card.experience}`,
          );
        });
      }

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
          console.log(`    ⏭  DUPLICATE  | Already in DB — "${job.title}"`);
          continue;
        }

        // Visit detail page — get full data
        console.log(`\n    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`    🌐 VISITING   | "${job.title}"`);
        console.log(
          `    📍 Location   | ${job.city || 'N/A'} | Exp: ${job.experience || 'N/A'} | Posted: ${job.how_long}`,
        );
        const detail = await scrapeDetail(context, job.link);
        console.log(
          `    📊 DETAIL     | Applicants: ${detail.applicants ?? '?'} | Salary: ${detail.salary || 'Not disclosed'} | Easy Apply: ${detail.easy_apply ? 'YES' : 'NO'} | Openings: ${detail.openings ?? '?'}`,
        );
        console.log(
          `    🛠  SKILLS     | ${(detail.key_skills || job.skills || 'N/A').slice(0, 80)}`,
        );

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
          console.log(`    ⛔ INSTANT REJECT | Wrong stack detected — "${job.title}"`);
          continue;
        }

        // ── AI evaluation ──────────────────────────────────────
        console.log(`    🤖 AI EVALUATING...`);
        const evaluation = await evaluateJob(enriched, target.type, target.keywords, aiAvailable);
        const aiStatus = evaluation.pass ? '✅ PASS' : '❌ FAIL';
        const aiTag =
          evaluation.score >= 88 ? '🔥 HOT' : evaluation.score >= 75 ? '⭐ GOOD' : '📋 WEAK';
        console.log(`    ${aiStatus} | ${aiTag} | Score: ${evaluation.score}/100`);
        console.log(`    💬 Reason     | ${evaluation.reason}`);
        if (evaluation.highlights) console.log(`    ⭐ Highlights | ${evaluation.highlights}`);
        if (evaluation.concerns) console.log(`    ⚠️  Concerns  | ${evaluation.concerns}`);
        if (!evaluation.pass) console.log(`    ⛔ REJECTED   | Not sending to Telegram`);

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

        const tag = priority === 'hot' ? '🔥 HOT' : '✅ QUALIFIED';
        console.log(
          `    ${tag} | Score: ${evaluation.score}/100 | Applicants: ${detail.applicants ?? '?'} | "${job.title}"`,
        );
        console.log(`    📲 SENDING TO TELEGRAM NOW...`);
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
