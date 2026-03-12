// ─────────────────────────────────────────────────────────────
//  platforms/yc/config/filters.js
//  YC / workatastartup.com filter criteria
//  Remote-only, startup-focused — different thresholds than Naukri
// ─────────────────────────────────────────────────────────────

export const FILTERS = {
  // ── Daily goal ──────────────────────────────────────────────
  DAILY_TARGET: 10,          // YC has fewer but higher quality listings
  MAX_PAGES_PER_TYPE: 5,
  DEAD_PAGES_LIMIT: 2,

  // ── Date filter ──────────────────────────────────────────────
  MAX_DAYS_OLD: 3,           // YC posts fewer jobs, allow 3 days

  // ── Applicants ───────────────────────────────────────────────
  MAX_APPLICANTS: 100,       // YC shows fewer applicants, relax limit

  // ── Experience ───────────────────────────────────────────────
  MAX_EXP_YEARS: 3,

  // ── Salary ───────────────────────────────────────────────────
  MIN_SALARY_LPA: 0,         // YC often lists USD — don't filter by INR
  MIN_SALARY_USD: 60000,     // annual USD minimum (if disclosed)

  MAX_PER_HOUR: 3,

  // ── Score thresholds ─────────────────────────────────────────
  MIN_SCORE: 70,
  HOT_SCORE: 85,

  // ── Scoring weights (must add to 100) ────────────────────────
  WEIGHTS: {
    keywords: 40,    // tech stack match matters most for startups
    recency: 20,
    applicants: 20,
    experience: 15,  // startups care more about fit than years
    easy_apply: 5,
  },

  RECENCY_SCORE: {
    under_3_hours: 20,
    under_6_hours: 18,
    under_12_hours: 14,
    under_24_hours: 10,
    yesterday: 7,
    older: 3,         // allow older posts from YC — fewer listings
  },

  APPLICANTS_SCORE: {
    under_5: 20,
    under_15: 17,
    under_30: 12,
    under_50: 8,
    under_100: 5,
    over_100: 0,
    undisclosed: 10,
  },

  EXP_SCORE: {
    perfect: 15,    // max exp ≤ 2.5 years
    acceptable: 8,  // max exp ≤ 4 years
    too_senior: 0,
  },

  // ── Title blocklist ───────────────────────────────────────────
  TITLE_BLOCKLIST: [
    'java developer',
    'java engineer',
    'python developer',
    'python engineer',
    'php developer',
    '.net developer',
    'devops engineer',
    'qa engineer',
    'test engineer',
    'data scientist',
    'machine learning engineer',
    'ml engineer',
    'embedded engineer',
    'android developer',
    'ios developer',
    'flutter developer',
    'angular developer',
    'vue developer',
    'blockchain engineer',
    'solidity developer',
    'wordpress developer',
    'sales engineer',
    'account executive',
    'customer success',
  ],
};
