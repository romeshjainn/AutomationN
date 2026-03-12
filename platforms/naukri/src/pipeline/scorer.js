// ─────────────────────────────────────────────────────────────
//  platforms/naukri/src/pipeline/scorer.js
//  100-point static scorer — used as AI fallback
//  keywords(35) + recency(25) + applicants(25) + exp(10) + easy_apply(5)
// ─────────────────────────────────────────────────────────────

import { FILTERS } from '../../config/filters.js';
import { getSetting } from '../utils/settings.js';
import { hoursAgo, parseExperience } from './filter.js';

/**
 * Score a fully enriched job out of 100.
 * Returns { score, priority, matched_keywords, breakdown }
 */
export function scoreJob(job, keywords) {
  const W = FILTERS.WEIGHTS;

  // ── 1. Keyword score (0 → 35) ────────────────────────────────
  const haystack = `${job.title} ${job.skills_needed || ''}`.toLowerCase();
  const matched = keywords.filter((kw) => haystack.includes(kw.toLowerCase()));
  const kwScore = Math.round((matched.length / keywords.length) * W.keywords);

  // ── 2. Recency score (0 → 25) ────────────────────────────────
  const hours = hoursAgo(job.how_long);
  let recencyScore = 0;
  if (hours <= 3) recencyScore = FILTERS.RECENCY_SCORE.under_3_hours;
  else if (hours <= 6) recencyScore = FILTERS.RECENCY_SCORE.under_6_hours;
  else if (hours <= 12) recencyScore = FILTERS.RECENCY_SCORE.under_12_hours;
  else if (hours <= 24) recencyScore = FILTERS.RECENCY_SCORE.under_24_hours;
  else if (hours <= 48) recencyScore = FILTERS.RECENCY_SCORE.yesterday;
  else recencyScore = 0;

  // ── 3. Applicants score (0 → 25) ─────────────────────────────
  const ap = job.applicants;
  let applicantsScore = FILTERS.APPLICANTS_SCORE.undisclosed;
  if (ap === null || ap === undefined) applicantsScore = FILTERS.APPLICANTS_SCORE.undisclosed;
  else if (ap < 5) applicantsScore = FILTERS.APPLICANTS_SCORE.under_5;
  else if (ap < 15) applicantsScore = FILTERS.APPLICANTS_SCORE.under_15;
  else if (ap < 30) applicantsScore = FILTERS.APPLICANTS_SCORE.under_30;
  else if (ap < 50) applicantsScore = FILTERS.APPLICANTS_SCORE.under_50;
  else applicantsScore = FILTERS.APPLICANTS_SCORE.over_50;

  // ── 4. Experience score (0 → 10) ─────────────────────────────
  const exp = parseExperience(job.experience);
  let expScore = FILTERS.EXP_SCORE.acceptable;
  if (exp) {
    if (exp.max <= 2.5) expScore = FILTERS.EXP_SCORE.perfect;
    else if (exp.max <= 4) expScore = FILTERS.EXP_SCORE.acceptable;
    else expScore = FILTERS.EXP_SCORE.too_senior;
  }

  // ── 5. Easy Apply (0 → 5) ────────────────────────────────────
  const easyScore = job.easy_apply ? W.easy_apply : 0;

  // ── Total ─────────────────────────────────────────────────────
  const total = kwScore + recencyScore + applicantsScore + expScore + easyScore;
  const score = Math.min(100, total);

  const HOT_SCORE = getSetting('HOT_SCORE');
  const MIN_SCORE = getSetting('MIN_SCORE');
  const priority = score >= HOT_SCORE ? 'hot' : score >= MIN_SCORE ? 'normal' : 'low';

  return {
    score,
    priority,
    matched_keywords: matched,
    breakdown: { keywords: kwScore, recency: recencyScore, applicants: applicantsScore, experience: expScore, easy_apply: easyScore },
  };
}
