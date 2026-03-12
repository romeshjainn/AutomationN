// ─────────────────────────────────────────────────────────────
//  platforms/yc/src/pipeline/filter.js
//  Hard filter for YC / workatastartup.com
//  Remote-only jobs, relaxed salary filter (USD range)
// ─────────────────────────────────────────────────────────────

import { getSetting } from '../utils/settings.js';
import { FILTERS } from '../../config/filters.js';

export function hoursAgo(how_long) {
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

export function parseExperience(expStr) {
  if (!expStr) return null;
  const nums = expStr.match(/\d+(\.\d+)?/g)?.map(Number) || [];
  if (nums.length >= 2) return { min: nums[0], max: nums[1] };
  if (nums.length === 1) return { min: nums[0], max: nums[0] };
  return null;
}

export function parseSalaryMin(salaryStr) {
  if (!salaryStr) return null;
  if (/not disclosed|n\/a/i.test(salaryStr)) return null;
  const nums = salaryStr.match(/\d+(\.\d+)?/g)?.map(Number) || [];
  return nums.length ? Math.min(...nums) : null;
}

/**
 * Hard filter for YC jobs.
 * Returns { passed: boolean, reason: string }
 */
export function hardFilter(job) {
  const title = (job.title || '').toLowerCase();
  const MAX_DAYS_OLD = getSetting('MAX_DAYS_OLD');
  const MAX_EXP_YEARS = getSetting('MAX_EXP_YEARS');

  // ── 1. Title blocklist ───────────────────────────────────────
  const blocked = FILTERS.TITLE_BLOCKLIST.some((b) => title.includes(b.toLowerCase()));
  if (blocked) return { passed: false, reason: 'blocklist' };

  // ── 2. Must have a link ──────────────────────────────────────
  if (!job.link) return { passed: false, reason: 'no_link' };

  // ── 3. Date filter ───────────────────────────────────────────
  const hours = hoursAgo(job.how_long);
  const maxHours = MAX_DAYS_OLD * 24;
  if (hours > maxHours) return { passed: false, reason: `too_old (${job.how_long})` };

  // ── 4. Experience ────────────────────────────────────────────
  const exp = parseExperience(job.experience);
  if (exp && exp.min > MAX_EXP_YEARS) {
    return { passed: false, reason: `exp_too_high (${job.experience})` };
  }

  // ── 5. Remote only ───────────────────────────────────────────
  // YC targets are already remote-filtered by URL, but double-check
  // if location is explicitly "onsite only" in a non-remote city
  // (leave this check loose — trust the URL filter)

  return { passed: true, reason: 'ok' };
}
