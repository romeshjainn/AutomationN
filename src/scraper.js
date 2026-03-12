// ─────────────────────────────────────────────────────────────
//  Core scraper — card extraction + job page enrichment + retry
// ─────────────────────────────────────────────────────────────

import { CONFIG } from './constants/config.js';
import { sleep, parsePostedOn, isBlocked } from './utils/helpers.js';
import { sortByDate, clickNextPage } from './utils/browser.js';

const CARD_SELECTORS = [
  'div.cust-job-tuple',
  'article.jobTuple',
  'div[class*="jobTuple"]',
  'div[class*="job-tuple"]',
  'div[data-job-id]',
];

// ── Extract cards from listing page ──────────────────────────

async function extractCards(page, entry) {
  await page.waitForSelector(CARD_SELECTORS.join(', '), { timeout: 12000 }).catch(() => {});
  await sleep(CONFIG.DELAYS.afterCardLoad);

  const rawJobs = await page.evaluate(
    ({ cardSelectors, keywords, mustHave }) => {
      let cards = [];
      for (const sel of cardSelectors) {
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
            'ul.tags li, ul[class*="tag"] li, ul[class*="skill"] li, [class*="skillsList"] li, [class*="skills-list"] li',
          );
          const skills = skillEls.length
            ? [...skillEls]
                .map((e) => e.innerText.trim())
                .filter(Boolean)
                .join(', ')
            : getText('[class*="skillsList"]', '[class*="skills"]', '.tags', '[class*="skill"]');

          const experience = getText(
            '[class*="expwdth"]',
            'span[class*="exp"]',
            'li[class*="exp"]',
            '[class*="experience"] li',
            '[title*="year"]',
            '.exp',
          );
          const city = getText(
            '[class*="locWdth"]',
            'span[class*="loc"]',
            'li[class*="loc"]',
            '[class*="location"] li',
            '.location',
            '[class*="city"]',
          );
          const how_long = getText(
            'span.job-post-day',
            'span[class*="job-post-day"]',
            'span[class*="postDate"]',
            'span[class*="posted"]',
            '[class*="jobAge"]',
            'span[class*="date"]',
            '[class*="daysAgo"]',
          );

          const haystack = `${title} ${skills}`.toLowerCase();
          const hasMust = mustHave.some((kw) => haystack.includes(kw.toLowerCase()));
          const matched = keywords.filter((kw) => haystack.includes(kw.toLowerCase()));
          const score = Math.min(10, Math.round((matched.length / keywords.length) * 14));

          return { title, link, skills, experience, city, how_long, score, matched, hasMust };
        })
        .filter((j) => j.title && j.link);
    },
    { cardSelectors: CARD_SELECTORS, keywords: entry.keywords, mustHave: entry.mustHave },
  );

  return rawJobs.map((j) => ({
    title: j.title,
    link: j.link,
    skills_needed: j.skills,
    experience: j.experience,
    city: j.city,
    how_long: j.how_long,
    posted_on: parsePostedOn(j.how_long),
    score: j.score,
    matched_keywords: j.matched,
    _hasMust: j.hasMust,
    // all enriched on job detail page visit
    is_auto_apply_available: null,
    applicants_count: null,
    openings: null,
    salary: null,
  }));
}

// ── Visit job detail page — grab everything in one shot ───────

async function scrapeJobDetail(context, jobUrl) {
  const jobPage = await context.newPage();

  const fallback = {
    is_auto_apply_available: false,
    applicants_count: null,
    openings: null,
    salary: null,
    key_skills: null,
  };

  try {
    await jobPage.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(800);

    const detail = await jobPage.evaluate(() => {
      const getText = (...sels) => {
        for (const s of sels) {
          const el = document.querySelector(s);
          if (el?.innerText?.trim()) return el.innerText.trim();
        }
        return null;
      };

      const allEls = [...document.querySelectorAll('span, div, li, p')];

      // ── Easy Apply button
      const allBtns = [...document.querySelectorAll('button, a, span')];
      const isEasyApply = allBtns.some((el) => /easy\s*apply/i.test(el.innerText));

      // ── Applicants — "100+ Applicants" / "Be among the first applicants"
      let applicants = null;
      for (const el of allEls) {
        const t = el.innerText?.trim() || '';
        if (/applicant/i.test(t) && t.length < 80) {
          applicants = t;
          break;
        }
      }

      // ── Openings — "1 Opening" / "3 Openings"
      let openings = null;
      for (const el of allEls) {
        const t = el.innerText?.trim() || '';
        if (/\d+\s*opening/i.test(t) && t.length < 40) {
          openings = t;
          break;
        }
      }

      // ── Salary
      let salary = getText(
        '[class*="salary"]',
        '[class*="ctc"]',
        '[class*="compensation"]',
        'span[class*="sal"]',
        '[class*="package"]',
      );
      if (!salary) {
        for (const el of allEls) {
          const t = el.innerText?.trim() || '';
          if (/not disclosed|lpa|lakh|₹|per annum/i.test(t) && t.length < 80) {
            salary = t;
            break;
          }
        }
      }

      // ── Key skills from detail page (much richer than listing card)
      const skillChips = document.querySelectorAll(
        '[class*="key-skill"] a, [class*="keySkill"] a, ' +
          '[class*="chip"], [class*="skill-chip"], ' +
          '[class*="tag-container"] a, [class*="skillTag"], ' +
          'a[class*="skill"], [class*="skills"] a',
      );
      let key_skills = skillChips.length
        ? [...skillChips]
            .map((e) => e.innerText.trim())
            .filter(Boolean)
            .join(', ')
        : getText('[class*="keySkills"]', '[class*="key-skills"]');

      return { isEasyApply, applicants, openings, salary, key_skills };
    });

    return {
      is_auto_apply_available: detail.isEasyApply,
      applicants_count: detail.applicants,
      openings: detail.openings,
      salary: detail.salary,
      key_skills: detail.key_skills,
    };
  } catch (e) {
    console.log(`    ⚠️  Detail page failed: ${jobUrl.slice(0, 55)}...`);
    return fallback;
  } finally {
    await jobPage.close();
  }
}

// ── Enrich all jobs with detail page data ─────────────────────

async function enrichJobDetails(context, jobs) {
  console.log(`  🔍 Fetching detail pages for ${jobs.length} jobs...`);

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const detail = await scrapeJobDetail(context, job.link);

    job.is_auto_apply_available = detail.is_auto_apply_available;
    job.applicants_count = detail.applicants_count;
    job.openings = detail.openings;
    job.salary = detail.salary;

    // Prefer detail page skills — they're always more complete
    if (detail.key_skills) job.skills_needed = detail.key_skills;

    const tag = job.is_auto_apply_available ? '✅ Easy Apply' : '📝 Manual';
    const applicants = job.applicants_count || '? applicants';
    console.log(`    [${i + 1}/${jobs.length}] ${tag} | ${applicants} — ${job.title}`);

    await sleep(400);
  }

  return jobs;
}

// ── Scrape one type (single attempt) ─────────────────────────

async function scrapeTypeOnce(page, entry) {
  const collected = [];
  let pageNum = 1;

  await page.goto(entry.url, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await sleep(CONFIG.DELAYS.afterPageLoad);
  await sortByDate(page);

  while (collected.length < CONFIG.TARGET_PER_TYPE) {
    console.log(`  📄 Page ${pageNum} | Collected: ${collected.length}/${CONFIG.TARGET_PER_TYPE}`);

    const cards = await extractCards(page, entry);
    let passed = 0,
      blocked = 0,
      noMust = 0,
      lowScore = 0;

    for (const job of cards) {
      if (isBlocked(job.title)) {
        blocked++;
        continue;
      }
      if (!job._hasMust) {
        noMust++;
        continue;
      }
      if (job.score < CONFIG.MIN_SCORE) {
        lowScore++;
        continue;
      }
      delete job._hasMust;
      collected.push(job);
      passed++;
    }

    console.log(
      `  ✅ ${cards.length} cards → passed: ${passed} | blocked: ${blocked} | no-must: ${noMust} | low-score: ${lowScore}`,
    );

    if (collected.length >= CONFIG.TARGET_PER_TYPE) break;
    if (cards.length === 0) break;

    const hasNext = await clickNextPage(page);
    if (!hasNext) {
      console.log('  🚫 No next page');
      break;
    }
    await sleep(CONFIG.DELAYS.afterNextPage);
    pageNum++;
  }

  return collected.sort((a, b) => b.score - a.score).slice(0, CONFIG.TARGET_PER_TYPE);
}

// ── Main export — scrape with retry + full enrichment ─────────

export async function scrapeType(page, context, entry) {
  const { maxAttempts, delayMs } = CONFIG.RETRY;
  const TARGET = CONFIG.TARGET_PER_TYPE;

  let attempt = 1;
  let jobs = [];

  while (attempt <= maxAttempts) {
    console.log(`\n🔍 [${entry.type}] Attempt ${attempt}/${maxAttempts}...`);
    try {
      jobs = await scrapeTypeOnce(page, entry);
    } catch (err) {
      console.error(`  ❌ Attempt ${attempt} error: ${err.message}`);
    }

    if (jobs.length >= TARGET) {
      console.log(`  🎯 Got ${jobs.length} jobs — target hit!`);
      break;
    }

    if (attempt < maxAttempts) {
      console.log(`  ⚠️  Only ${jobs.length}/${TARGET}. Retrying in ${delayMs / 1000}s...`);
      await sleep(delayMs);
    } else {
      console.log(`  ⚠️  Max retries reached. Moving on with ${jobs.length} jobs.`);
    }

    attempt++;
  }

  // Visit each job page — get Easy Apply, applicants, openings, salary, skills
  if (jobs.length > 0) {
    jobs = await enrichJobDetails(context, jobs);
  }

  return jobs;
}
