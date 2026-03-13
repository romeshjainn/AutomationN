// ─────────────────────────────────────────────────────────────
//  platforms/yc/src/scraper/index.js
//  workatastartup.com scraper — YC job board
//
//  Site is a React SPA with infinite scroll (no pagination).
//  Each job card links to a detail page with full info.
//
//  NOTE: Selectors may need adjusting if YC redesigns their site.
//  Run with headless: false to debug DOM visually.
// ─────────────────────────────────────────────────────────────

import { checkAI } from '#core/ai/client.js';
import { evaluateJob } from '../ai/prompt.js';
import { JOB_TARGETS } from '../../config/targets.js';
import { insertJob, isNewJob } from '#core/db/queries/jobs.js';
import { getSetting } from '../utils/settings.js';
import { hardFilter } from '../pipeline/filter.js';
import { launchBrowser, scrollForMore } from '../utils/browser.js';
import { parsePostedOn, sleep } from '#core/utils/helpers.js';

const PLATFORM = 'yc';

// ── Extract job cards from listing page ───────────────────────
// workatastartup.com renders jobs as a list of cards
// Selectors based on known YC job board structure

async function extractJobCards(page) {
  await sleep(2500); // SPA needs time to render

  return page.evaluate(() => {
    // YC job cards — try multiple selector strategies
    const cardSelectors = [
      'div.job-name',         // job title container
      '[class*="job-list"] > div',
      '[class*="jobs-list"] > div',
      'div[class*="JobCard"]',
      'div[class*="job-card"]',
      'div[class*="company-job"]',
    ];

    // Find the job list container
    let jobEls = [];
    for (const sel of cardSelectors) {
      jobEls = [...document.querySelectorAll(sel)];
      if (jobEls.length > 2) break;
    }

    // Fallback: grab any clickable job-like divs with title + link
    if (!jobEls.length) {
      jobEls = [...document.querySelectorAll('a[href*="/jobs/"]')];
    }

    return jobEls.map((el) => {
      const getText = (...sels) => {
        for (const s of sels) {
          const found = el.querySelector(s);
          if (found?.innerText?.trim()) return found.innerText.trim();
        }
        return el.innerText?.trim() || '';
      };

      const getHref = (...sels) => {
        for (const s of sels) {
          const found = el.querySelector(s);
          if (found?.href) return found.href;
        }
        if (el.href) return el.href;
        const a = el.querySelector('a[href*="/jobs/"]');
        return a?.href || '';
      };

      const title = getText(
        '.job-name', '[class*="job-name"]', '[class*="jobTitle"]',
        'h2', 'h3', '[class*="title"]',
      );

      const link = getHref(
        'a[href*="/jobs/"]', 'a[href*="/job/"]',
      );

      const company = getText(
        '.company-name', '[class*="company-name"]', '[class*="companyName"]',
        '[class*="startup-name"]',
      );

      const location = getText(
        '.job-location', '[class*="location"]', '[class*="remote"]',
        '[class*="loc"]',
      );

      const salary = getText(
        '.job-salary', '[class*="salary"]', '[class*="compensation"]',
        '[class*="ctc"]',
      );

      const experience = getText(
        '[class*="experience"]', '[class*="exp"]', '[class*="years"]',
      );

      const how_long = getText(
        '[class*="posted"]', '[class*="date"]', '[class*="time"]', 'time',
      );

      const skills = getText(
        '[class*="skills"]', '[class*="tags"]', '[class*="tech"]',
      );

      return { title, link, company, city: location, salary, experience, how_long, skills };
    }).filter((j) => j.title && j.link && j.link.includes('/jobs/'));
  });
}

// ── Visit job detail page ─────────────────────────────────────

async function scrapeDetail(context, jobUrl) {
  const page = await context.newPage();
  try {
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await sleep(2000); // SPA needs time

    return await page.evaluate(() => {
      const allEls = [...document.querySelectorAll('span, div, li, p, section')];
      const allBtns = [...document.querySelectorAll('button, a, span')];

      // Easy Apply — YC has "Apply" button on detail page
      const easy_apply = allBtns.some((el) =>
        /^apply$|easy\s*apply|apply\s*now/i.test(el.innerText?.trim()),
      );

      // Applicants — YC sometimes shows applicant count
      let applicants = null;
      for (const el of allEls) {
        const t = el.innerText?.trim() || '';
        if (/applicant/i.test(t) && t.length < 80) {
          if (/be among the first/i.test(t)) { applicants = 1; break; }
          const n = t.match(/(\d+)\+?/);
          if (n) { applicants = parseInt(n[1]); break; }
        }
      }

      // Salary / compensation — YC often shows USD range
      let salary = null;
      for (const el of allEls) {
        const t = el.innerText?.trim() || '';
        if (
          t.length < 120 && t.length > 3 &&
          /\$|\busd\b|salary|compensation|equity|\d+k|\d+,\d{3}/i.test(t) &&
          !/apply|posted|location|role|about/i.test(t)
        ) {
          salary = t; break;
        }
      }

      // Skills — look for tech stack section
      let key_skills = null;
      const skillEls = document.querySelectorAll(
        '[class*="skill"] li, [class*="tech"] li, [class*="tag"] li, ' +
        '[class*="chip"], [class*="badge"], [class*="stack"] li',
      );
      if (skillEls.length) {
        key_skills = [...skillEls].map((e) => e.innerText.trim()).filter(Boolean).join(', ');
      }

      // Fallback: look for skills section heading
      if (!key_skills) {
        for (const el of allEls) {
          if (/tech(nology|nologies)?\s*stack|skills|requirements/i.test(el.innerText) && el.innerText.length < 40) {
            const next = el.nextElementSibling;
            if (next) { key_skills = next.innerText.trim().slice(0, 300); break; }
          }
        }
      }

      // Company size
      let companySize = null;
      for (const el of allEls) {
        const t = el.innerText?.trim() || '';
        if (/\d+[-–]\d+\s*(employees|people)|team\s*of\s*\d+/i.test(t) && t.length < 60) {
          companySize = t; break;
        }
      }

      return { easy_apply, applicants, salary, key_skills, company_size: companySize, openings: null };
    });
  } catch (err) {
    console.log(`    ⚠️  YC detail page error: ${err.message?.slice(0, 60)}`);
    return { easy_apply: false, applicants: null, salary: null, key_skills: null, openings: null };
  } finally {
    await page.close();
  }
}

// ── Instant reject ────────────────────────────────────────────

const INSTANT_REJECT =
  /\bjava\b|spring boot|django|laravel|ruby on rails|angular developer|vue developer|data scientist|machine learning|devops engineer|qa engineer|test engineer|salesforce|blockchain|solidity|customer success|account executive|sales manager/i;

// ── Main scrape function ──────────────────────────────────────

export async function scrapeUntilGoal(page, context, runId, onJobFound = null, remaining = null) {
  const DAILY_TARGET = remaining ?? getSetting('DAILY_TARGET');
  const MAX_PAGES_PER_TYPE = getSetting('MAX_PAGES_PER_TYPE');
  const DEAD_PAGES_LIMIT = getSetting('DEAD_PAGES_LIMIT');

  const qualified = [];
  let totalScraped = 0;

  const aiAvailable = await checkAI();
  console.log(
    `\n[YC] 🎯 Goal: find ${DAILY_TARGET} jobs | AI: ${aiAvailable ? '✅ ON' : '⚠️ OFF'}\n`,
  );

  for (const target of JOB_TARGETS) {
    if (qualified.length >= DAILY_TARGET) break;

    console.log(`\n[YC] 🔍 [${target.type}] Starting — ${target.url}`);

    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await sleep(3000); // React SPA — wait for hydration

    let scrollCount = 0;
    let deadScrolls = 0;
    const seenLinks = new Set();

    // YC uses infinite scroll — loop by scrolling
    while (qualified.length < DAILY_TARGET && scrollCount < MAX_PAGES_PER_TYPE * 3) {
      console.log(`\n  📄 Scroll ${scrollCount + 1} | Qualified: ${qualified.length}/${DAILY_TARGET}`);

      const rawCards = await extractJobCards(page);
      const newCards = rawCards.filter((c) => c.link && !seenLinks.has(c.link));
      newCards.forEach((c) => seenLinks.add(c.link));
      totalScraped += newCards.length;

      if (!newCards.length) {
        deadScrolls++;
        console.log(`  ⚠️  No new cards (${deadScrolls}/${DEAD_PAGES_LIMIT})`);
        if (deadScrolls >= DEAD_PAGES_LIMIT) { console.log('  🚫 Reached end of list'); break; }
      } else {
        deadScrolls = 0;
      }

      // ── Gate 1: Hard filter ───────────────────────────────
      const survivors = [];
      for (const card of newCards) {
        const { passed, reason } = hardFilter({ ...card, type: target.type });
        if (passed) {
          survivors.push({ ...card, type: target.type });
          console.log(`    ✓ PASS | "${card.title}"`);
        } else {
          console.log(`    ✗ KILL [${reason.padEnd(25)}] | "${card.title}"`);
        }
      }

      // ── Gate 2 + 3: Detail + AI ───────────────────────────
      for (const job of survivors) {
        if (qualified.length >= DAILY_TARGET) break;

        if (!isNewJob(job.link)) {
          console.log(`    ⏭  DUPLICATE | "${job.title}"`);
          continue;
        }

        console.log(`\n    🌐 VISITING | "${job.title}" @ ${job.company || 'Unknown'}`);
        const detail = await scrapeDetail(context, job.link);
        console.log(`    📊 Applicants: ${detail.applicants ?? '?'} | Salary: ${detail.salary || 'N/A'} | Easy Apply: ${detail.easy_apply ? 'YES' : 'NO'}`);
        await sleep(400);

        const enriched = {
          ...job,
          easy_apply: detail.easy_apply,
          applicants: detail.applicants,
          openings: detail.openings,
          salary: detail.salary || job.salary,
          skills_needed: detail.key_skills || job.skills,
          company_size: detail.company_size,
          posted_on: parsePostedOn(job.how_long),
        };

        if (INSTANT_REJECT.test(`${job.title} ${enriched.skills_needed || ''}`)) {
          console.log(`    ⛔ INSTANT REJECT | "${job.title}"`);
          continue;
        }

        console.log(`    🤖 AI EVALUATING...`);
        const evaluation = await evaluateJob(enriched, target.type, target.keywords, aiAvailable);
        const aiTag = evaluation.score >= 85 ? '🔥 HOT' : evaluation.score >= 70 ? '⭐ GOOD' : '📋 WEAK';
        console.log(`    ${evaluation.pass ? '✅ PASS' : '❌ FAIL'} | ${aiTag} | Score: ${evaluation.score}/100`);
        console.log(`    💬 ${evaluation.reason}`);

        if (!evaluation.pass) continue;

        const priority = evaluation.score >= 85 ? 'hot' : 'normal';
        const finalJob = {
          ...enriched,
          score: evaluation.score,
          priority,
          matched_keywords: target.keywords.filter((kw) =>
            `${job.title} ${enriched.skills_needed || ''}`.toLowerCase().includes(kw.toLowerCase()),
          ),
          ai_reason: evaluation.reason,
          ai_highlights: evaluation.highlights,
        };

        insertJob(finalJob, runId, PLATFORM);
        qualified.push(finalJob);

        console.log(`    ${priority === 'hot' ? '🔥 HOT' : '✅ QUALIFIED'} | Score: ${evaluation.score}/100 | "${job.title}"`);
        console.log(`    📲 SENDING TO TELEGRAM NOW...`);

        if (onJobFound) await onJobFound(finalJob);
      }

      // Scroll for more
      const hasMore = await scrollForMore(page);
      if (!hasMore) { console.log('  🚫 No more content to scroll'); break; }
      scrollCount++;
    }

    console.log(`\n[YC] 📦 [${target.type}] done | Qualified: ${qualified.length}`);
  }

  console.log(`\n[YC] ✅ Scrape complete — ${qualified.length} qualified from ${totalScraped} scraped`);
  return { qualified, totalScraped };
}
