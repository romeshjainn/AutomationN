// ─────────────────────────────────────────────────────────────
//  Hard filter — binary pass/fail, no scoring
//  Fast and cheap — runs BEFORE any detail page visits
// ─────────────────────────────────────────────────────────────

import { getSetting } from '../db/queries/settings.js';
import { FILTERS } from '../../config/filters.js';

/**
 * Parse "X days/hours ago" → number of hours ago
 * Returns Infinity if can't parse (treat as old)
 */
function hoursAgo(how_long) {
  if (!how_long) return Infinity;
  const h = how_long.toLowerCase();

  if (/just now|moment|second/.test(h)) return 0;
  if (/minute/.test(h)) {
    const m = h.match(/(\d+)/);
    return m ? parseInt(m[1]) / 60 : 0.5;
  }
  if (/hour/.test(h)) {
    const m = h.match(/(\d+)/);
    return m ? parseInt(m[1]) : 1;
  }
  if (/today/.test(h)) return 12;
  if (/1\s*day|yesterday/.test(h)) return 24;
  const dayMatch = h.match(/(\d+)\s*day/);
  if (dayMatch) return parseInt(dayMatch[1]) * 24;
  if (/week/.test(h)) return 168;
  if (/month/.test(h)) return 720;

  return Infinity;
}

/**
 * Parse experience string → { min, max } in years
 * e.g. "2-4 Yrs" → { min: 2, max: 4 }
 */
function parseExperience(expStr) {
  if (!expStr) return null;
  const nums = expStr.match(/\d+(\.\d+)?/g)?.map(Number) || [];
  if (nums.length >= 2) return { min: nums[0], max: nums[1] };
  if (nums.length === 1) return { min: nums[0], max: nums[0] };
  return null;
}

/**
 * Parse salary string → number in LPA
 * e.g. "6-8 LPA" → 6, "Not Disclosed" → null
 */
function parseSalaryMin(salaryStr) {
  if (!salaryStr) return null;
  if (/not disclosed|n\/a/i.test(salaryStr)) return null;
  const nums = salaryStr.match(/\d+(\.\d+)?/g)?.map(Number) || [];
  return nums.length ? Math.min(...nums) : null;
}

function parseSalaryMax(salaryStr) {
  if (!salaryStr) return null;
  if (/not disclosed|n\/a/i.test(salaryStr)) return null;
  const nums = salaryStr.match(/\d+(\.\d+)?/g)?.map(Number) || [];
  if (!nums.length) return null;
  return Math.max(...nums); // use highest number in range
}
/**
 * Main hard filter function.
 * Returns { passed: boolean, reason: string }
 */
export function hardFilter(job) {
  const title = (job.title || '').toLowerCase();
  const MAX_DAYS_OLD = getSetting('MAX_DAYS_OLD');
  const MAX_APPLICANTS = getSetting('MAX_APPLICANTS');
  const MAX_EXP_YEARS = getSetting('MAX_EXP_YEARS');
  const MIN_SALARY_LPA = getSetting('MIN_SALARY_LPA');

  // ── 1. Title blocklist ───────────────────────────────────────
  const blocked = FILTERS.TITLE_BLOCKLIST.some((b) => title.includes(b.toLowerCase()));
  if (blocked) return { passed: false, reason: 'blocklist' };

  // ── 2. Must have a link ──────────────────────────────────────
  if (!job.link) return { passed: false, reason: 'no_link' };

  // ── 3. Date filter — today or yesterday only ─────────────────
  const hours = hoursAgo(job.how_long);
  const maxHours = MAX_DAYS_OLD * 24;
  if (hours > maxHours) return { passed: false, reason: `too_old (${job.how_long})` };

  // ── 4. Experience ────────────────────────────────────────────
  const exp = parseExperience(job.experience);
  if (exp && exp.min > MAX_EXP_YEARS) {
    return { passed: false, reason: `exp_too_high (${job.experience})` };
  }

  // ── 5. Salary — only kills if disclosed AND below minimum ────
  const salaryMax = parseSalaryMax(job.salary);
  if (salaryMax !== null && salaryMax < MIN_SALARY_LPA) {
    return { passed: false, reason: `salary_too_low (${job.salary})` };
  }

  return { passed: true, reason: 'ok' };
}

// Export parsers so scorer.js can reuse them
export { hoursAgo, parseExperience, parseSalaryMin };
