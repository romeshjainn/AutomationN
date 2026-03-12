// ─────────────────────────────────────────────────────────────
//  platforms/naukri/config/filters.js
//  ALL Naukri filter criteria — change here, nothing else needed
// ─────────────────────────────────────────────────────────────

export const FILTERS = {
  // ── Daily goal ──────────────────────────────────────────────
  DAILY_TARGET: 20,
  MAX_PAGES_PER_TYPE: 10,
  DEAD_PAGES_LIMIT: 3,

  // ── Date filter ──────────────────────────────────────────────
  MAX_DAYS_OLD: 1, // today or yesterday only

  // ── Applicants ───────────────────────────────────────────────
  MAX_APPLICANTS: 50,

  // ── Experience ───────────────────────────────────────────────
  MAX_EXP_YEARS: 3, // "4-6 years" → killed, "1-3 years" → ok

  // ── Salary (LPA) ─────────────────────────────────────────────
  MIN_SALARY_LPA: 5, // only kills if disclosed and below minimum

  MAX_PER_HOUR: 4,

  // ── Score thresholds ─────────────────────────────────────────
  MIN_SCORE: 75,
  HOT_SCORE: 88,

  // ── Scoring weights (must add to 100) ────────────────────────
  WEIGHTS: {
    keywords: 35,
    recency: 25,
    applicants: 25,
    experience: 10,
    easy_apply: 5,
  },

  RECENCY_SCORE: {
    under_3_hours: 25,
    under_6_hours: 20,
    under_12_hours: 15,
    under_24_hours: 10,
    yesterday: 5,
    older: 0,
  },

  APPLICANTS_SCORE: {
    under_5: 25,
    under_15: 20,
    under_30: 15,
    under_50: 8,
    over_50: 0,
    undisclosed: 10,
  },

  EXP_SCORE: {
    perfect: 10,    // max exp ≤ 2.5 years
    acceptable: 5,  // max exp ≤ 4 years
    too_senior: 0,
  },

  SALARY_BONUS: {
    above_8_lpa: 10,
    above_6_lpa: 8,
    above_5_5_lpa: 5,
    not_disclosed: 5,
    below_5_5_lpa: 0,
  },

  // ── Title blocklist ───────────────────────────────────────────
  TITLE_BLOCKLIST: [
    'java developer',
    'java engineer',
    'python developer',
    'python engineer',
    'php developer',
    'php engineer',
    '.net developer',
    '.net engineer',
    'devops',
    'devsecops',
    'qa engineer',
    'quality analyst',
    'test engineer',
    'automation test',
    'sap ',
    'salesforce',
    'servicenow',
    'data engineer',
    'data scientist',
    'machine learning',
    'ai engineer',
    'ml engineer',
    'embedded',
    'firmware',
    'android developer',
    'ios developer',
    'flutter developer',
    'flutter engineer',
    'angular developer',
    'vue developer',
    'wordpress',
    'magento',
    'shopify',
    'selenium',
    'appium',
    'cypress engineer',
    'blockchain',
    'solidity',
    'unity',
    'unreal',
    'cobol',
    'mainframe',
  ],
};
