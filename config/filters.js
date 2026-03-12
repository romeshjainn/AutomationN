// ─────────────────────────────────────────────────────────────
//  ALL filter criteria lives here
//  Change anything here — nothing else needs touching
// ─────────────────────────────────────────────────────────────

export const FILTERS = {
  // ── Daily goal ──────────────────────────────────────────────
  DAILY_TARGET: 30, // stop scraping once 30 qualified jobs found
  MAX_PAGES_PER_TYPE: 10, // safety — don't go past page 10 per type
  DEAD_PAGES_LIMIT: 3, // stop type if 3 consecutive pages give 0 results

  // ── Date filter (MANDATORY) ──────────────────────────────────
  // Only jobs posted today or yesterday
  MAX_DAYS_OLD: 1,

  // ── Applicants ───────────────────────────────────────────────
  MAX_APPLICANTS: 50, // hard kill if applicants > this

  // ── Experience ───────────────────────────────────────────────
  // Kill if the MINIMUM experience required exceeds this
  MAX_EXP_YEARS: 3, // "4-6 years" → killed, "1-3 years" → ok

  // ── Salary (LPA) ─────────────────────────────────────────────
  // Only kills if salary is DISCLOSED and below minimum
  // "Not Disclosed" always passes (benefit of doubt)
  MIN_SALARY_LPA: 5.5,

  // ── Score threshold ──────────────────────────────────────────
  MIN_SCORE: 60, // hard kill below this
  HOT_SCORE: 85, // flagged 🔥 and sent first

  // ── Scoring weights (must add up to 100) ─────────────────────
  WEIGHTS: {
    keywords: 35, // tech stack keyword match
    recency: 25, // how fresh the posting is
    applicants: 25, // less applicants = more pts
    experience: 10, // closer to 0-2.5yr = more pts
    easy_apply: 5, // easy apply button present
  },

  // ── Recency scoring breakdown (out of 25) ────────────────────
  RECENCY_SCORE: {
    under_3_hours: 25,
    under_6_hours: 20,
    under_12_hours: 15,
    under_24_hours: 10,
    yesterday: 5,
    older: 0, // killed before scoring anyway
  },

  // ── Applicants scoring breakdown (out of 25) ─────────────────
  APPLICANTS_SCORE: {
    under_5: 25, // 🔥 almost no competition
    under_15: 20,
    under_30: 15,
    under_50: 8,
    over_50: 0, // killed before scoring anyway
    undisclosed: 10, // neutral
  },

  // ── Experience scoring breakdown (out of 10) ─────────────────
  EXP_SCORE: {
    perfect: 10, // max exp ≤ 2.5 years
    acceptable: 5, // max exp ≤ 4 years
    too_senior: 0, // killed before scoring
  },

  // ── Salary scoring (added as bonus, not a separate weight) ───
  SALARY_BONUS: {
    above_8_lpa: 10,
    above_6_lpa: 8,
    above_5_5_lpa: 5,
    not_disclosed: 5,
    below_5_5_lpa: 0, // killed before scoring
  },

  // ── Title blocklist ───────────────────────────────────────────
  // Job TITLE must not contain any of these (case-insensitive)
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
