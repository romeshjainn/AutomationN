export const CONFIG = {
  TARGET_PER_TYPE: 70,
  MIN_SCORE: 3,
  OUTPUT_FILE: 'reactjs.json',
  PROFILE_URL: 'https://www.naukri.com/mnjuser/profile',

  TELEGRAM: {
    token: process.env.TELEGRAM_BOT_TOKEN, // e.g. '7123456789:AAFx...'
    chatId: process.env.TELEGRAM_CHAT_ID, // e.g. '123456789'
    topN: 20, // how many jobs to send
  },

  RETRY: {
    maxAttempts: 3, // tries 3 times per type before giving up
    delayMs: 8000, // waits 8s between retries
  },

  BROWSER: {
    headless: false,
    slowMo: 0,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
  },

  DELAYS: {
    afterProfileLoad: 0, // was 4000 — no login so no need to wait
    afterPageLoad: 1500, // was 3000 — public pages load fast
    afterSort: 1500, // was 3000
    afterNextPage: 2000, // was 3500
    afterCardLoad: 800, // was 1500
    sortDropdownOpen: 500,
  },

  TITLE_BLOCKLIST: [
    'java developer',
    'java engineer',
    'python developer',
    'php developer',
    '.net developer',
    'devops',
    'qa engineer',
    'test engineer',
    'automation test',
    'sap ',
    'salesforce',
    'servicenow',
    'data engineer',
    'data scientist',
    'machine learning',
    'ai engineer',
    'embedded',
    'android developer',
    'ios developer',
    'flutter',
    'angular developer',
    'vue developer',
    'wordpress',
    'magento',
    'shopify',
    'selenium',
    'appium',
  ],
};
