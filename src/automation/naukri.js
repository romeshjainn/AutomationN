'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');
const db   = require('../db/database');
const { fillQuestionnaire } = require('./helper');

const DATA_DIR     = path.join(__dirname, '../../data');
const SESSION_PATH = path.join(DATA_DIR, 'session.json');

// ─── Selectors ────────────────────────────────────────────────────────────────

const SEL = {
  // Login page
  emailField:    '#usernameField',
  passwordField: '#passwordField',
  loginBtn:      'button[type="submit"]',

  // Logged-in detection
  loggedInNav:
    '.nI-gNb-bar2 .nI-gNb-menuList-icon, [class*="nI-gNb"] .user-icon, .nI-gNb-mob__icon-wrapper',

  // Search results
  jobCard:       'article.jobTuple, div.jobTuple, .srp-jobtuple-wrapper, article[type="jobs"]',
  jobTitle:      'a.title, .title a, a.jobTitle',
  jobCompany:    '.comp-name, .companyDesig a, .companyDesig',
  jobLocation:   '.locWdth, .job-location, .location',
  jobExperience: '.expwdth',
  jobSalary:     '.sal-wrap .salary-tag, .salaryTag, .salary',
  nextPageBtn:   'a.fright.fs14.btn-secondary.next-btn, a[class*="next-btn"], .pagination-btn.next',

  // Job detail / apply
  applyBtn:      '.apply-button, button.applyButton, a.applyButton, [class*="apply-btn"]',
  alreadyApplied:'.applied-state, [class*="alreadyApplied"], .apply-success',
  confirmModal:  'button.btn-dark, button[class*="confirm"], .chatbot-popup button:first-child',

  questionnaireForm:   '[class*="ssQuestions"], [class*="apply-questions"], form[class*="apply"]',
  formField:           '[class*="form-group"], [class*="field-wrap"], .ssQuestion',
  textInput:           'input[type="text"], input[type="number"]',
  selectDropdown:      'select',
  radioInput:          'input[type="radio"]',
  submitQuestionnaire: 'button[type="submit"], button[class*="submit"], button[class*="apply"]',
};

// ─── Session helpers ──────────────────────────────────────────────────────────

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

async function saveSession(context) {
  ensureDataDir();
  const state = await context.storageState();
  fs.writeFileSync(SESSION_PATH, JSON.stringify(state, null, 2));
  db.addLog({ level: 'info', event: 'session', message: 'Session saved to disk' });
}

function loadStorageState() {
  if (!fs.existsSync(SESSION_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
  } catch {
    return null;
  }
}

// ─── Browser factory ─────────────────────────────────────────────────────────

async function launchBrowser(headless) {
  const storageState = loadStorageState();

  const browser = await chromium.launch({
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const contextOpts = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport:  { width: 1366, height: 768 },
    locale:    'en-IN',
  };
  if (storageState) contextOpts.storageState = storageState;

  const context = await browser.newContext(contextOpts);
  const page    = await context.newPage();

  // Mask automation fingerprint
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  return { browser, context, page };
}

// ─── Login ────────────────────────────────────────────────────────────────────

async function isLoggedIn(page) {
  try {
    await page.waitForSelector(SEL.loggedInNav, { timeout: 4000 });
    return true;
  } catch {
    return false;
  }
}

async function doLogin(page, context, waitForOtp = false) {
  const email    = process.env.NAUKRI_EMAIL;
  const password = process.env.NAUKRI_PASSWORD;

  if (!email || !password) {
    throw new Error('NAUKRI_EMAIL and NAUKRI_PASSWORD must be set in the .env file');
  }

  db.addLog({ level: 'info', event: 'login', message: 'Opening Naukri login page...' });
  await page.goto('https://www.naukri.com/nlogin/login', {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.waitForTimeout(2000);

  await page.fill(SEL.emailField,    email);
  await page.fill(SEL.passwordField, password);
  await page.click(SEL.loginBtn);

  db.addLog({ level: 'info', event: 'login', message: 'Credentials submitted — waiting for redirect...' });

  const redirected = async () => {
    try {
      await page.waitForURL(url => !url.includes('/nlogin/'), { timeout: 30_000 });
      return true;
    } catch {
      return false;
    }
  };

  if (!await redirected()) {
    if (waitForOtp) {
      db.addLog({ level: 'info', event: 'login', message: 'OTP screen detected — waiting up to 5 min for manual entry...' });
      try {
        await page.waitForSelector('.nI-gNb-drawer__bars', { timeout: 300000 });
      } catch {
        throw new Error('OTP timeout: complete the OTP within 5 minutes when running in headed mode');
      }
    } else {
      throw new Error('Login failed or OTP required. Run: npm run run-bot:headed for first-time setup');
    }
  }

  await page.waitForTimeout(2000);
  await saveSession(context);
  db.addLog({ level: 'info', event: 'login', message: 'Login successful' });
}

// ─── Profile refresh ──────────────────────────────────────────────────────────

async function refreshProfile(page) {
  db.addLog({ level: 'info', event: 'profile_refresh', message: 'Refreshing profile visibility...' });
  try {
    await page.goto('https://www.naukri.com/mnjuser/profile', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await page.waitForTimeout(3000);
    db.saveSetting('profile_last_refreshed', new Date().toISOString());
    db.addLog({ level: 'info', event: 'profile_refresh', message: 'Profile refreshed — last-active timestamp updated' });
  } catch (e) {
    db.addLog({ level: 'warn', event: 'profile_refresh', message: `Profile refresh failed: ${e.message}` });
  }
}

// ─── Resume path resolver ─────────────────────────────────────────────────────
// Tries: settings path → today's date name → any RomeshJain_*_Resume.pdf in cwd

function getResumePath() {
  const setting = (db.getSetting('resume_path') || '').trim();
  if (setting) {
    const p = path.resolve(process.cwd(), setting);
    if (fs.existsSync(p)) return p;
  }

  // Dynamic: RomeshJain_11March_Resume.pdf
  const now    = new Date();
  const day    = now.getDate();
  const months = ['January','February','March','April','May','June','July',
                  'August','September','October','November','December'];
  const month  = months[now.getMonth()];
  const dated  = path.resolve(process.cwd(), `RomeshJain_${day}${month}_Resume.pdf`);
  if (fs.existsSync(dated)) return dated;

  // Fallback: any RomeshJain_*_Resume.pdf
  try {
    const files = fs.readdirSync(process.cwd());
    const match = files.find(f => f.startsWith('RomeshJain_') && f.endsWith('_Resume.pdf'));
    if (match) return path.resolve(process.cwd(), match);

    // Last resort: any resume PDF in root
    const anyPdf = files.find(f => f.toLowerCase().includes('resume') && f.endsWith('.pdf'));
    if (anyPdf) return path.resolve(process.cwd(), anyPdf);
  } catch {}

  return null;
}

// ─── Resume upload ────────────────────────────────────────────────────────────

async function uploadResume(page) {
  const resumePath = getResumePath();
  if (!resumePath) {
    db.addLog({ level: 'error', event: 'resume_upload', message: 'Resume file not found. Place RomeshJain_DDMonth_Resume.pdf in project root or set resume_path in settings.' });
    return false;
  }
  db.addLog({ level: 'info', event: 'resume_upload', message: `Using resume: ${path.basename(resumePath)}` });
  try {
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(3000);

    // Try to set file on hidden input directly
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.setInputFiles(resumePath);
      await page.waitForTimeout(3000);
      // Look for save button
      try {
        const saveBtn = await page.$('button.saveBtn, [class*="saveButton"], .btn-dark-ot');
        if (saveBtn) {
          await saveBtn.click();
          await page.waitForTimeout(2000);
        }
      } catch {}
      db.saveSetting('resume_last_uploaded', new Date().toISOString());
      db.addLog({ level: 'info', event: 'resume_upload', message: 'Resume uploaded successfully' });
      return true;
    }
    db.addLog({ level: 'warn', event: 'resume_upload', message: 'File input not found on profile page' });
    return false;
  } catch (e) {
    db.addLog({ level: 'error', event: 'resume_upload', message: `Resume upload error: ${e.message}` });
    return false;
  }
}

// ─── Search URL builder ───────────────────────────────────────────────────────

function buildSearchUrl(keyword, settings, pageNum = 1) {
  const slug   = keyword.trim().toLowerCase().replace(/\s+/g, '-');
  const base   = `https://www.naukri.com/${slug}-jobs`;
  const params = new URLSearchParams();

  const expMin = settings.experience_min;
  const expMax = settings.experience_max;
  if (expMin || expMax) params.set('experience', `${expMin || 0}to${expMax || 30}`);

  const salMin = parseInt(settings.salary_min);
  if (salMin > 0) params.set('salary', String(salMin));

  if (settings.job_type === 'remote') params.set('jobtype', '5');

  if (pageNum > 1) params.set('pg', String(pageNum));

  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

// ─── Scrape job cards from current page ──────────────────────────────────────

async function scrapeJobCards(page) {
  const jobs = [];

  try {
    await page.waitForSelector(SEL.jobCard, { timeout: 10_000 });
  } catch {
    return jobs;
  }

  const cards = await page.$$(SEL.jobCard);
  db.addLog({ level: 'info', event: 'scrape', message: `  ${cards.length} cards on page` });

  for (const card of cards) {
    try {
      // Job ID — prefer data attribute, fallback to URL
      let jobId = (await card.getAttribute('data-job-id')) ||
                  (await card.getAttribute('data-jid'))    || '';

      // Title + URL
      const titleEl = await card.$(SEL.jobTitle);
      if (!titleEl) continue;
      const title = (await titleEl.textContent()).trim();
      const href  = (await titleEl.getAttribute('href')) || '';
      const url   = href.startsWith('http') ? href : `https://www.naukri.com${href}`;

      if (!jobId) {
        const m = href.match(/[_-](\d{7,})/);
        jobId   = m ? m[1] : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }

      const getText = async (sel) => {
        const el = await card.$(sel);
        return el ? (await el.textContent()).trim() : '';
      };

      // Easy apply detection
      const applyBtnEl   = await card.$('.apply-button, button.applyButton, a.applyButton');
      const applyBtnText = applyBtnEl ? (await applyBtnEl.textContent()).toLowerCase() : '';
      const easyApply    = !!(applyBtnEl && !applyBtnText.includes('company site') && !applyBtnText.includes('external'));

      // Posted date (Naukri shows "2 days ago", "3 hours ago" etc.)
      const postedEl   = await card.$([
        '[class*="timeago"]', '[class*="timeAgo"]',
        '.job-post-day', '[class*="post-day"]',
        'span[class*="days"]', '[class*="daysAgo"]',
        '.mnjCardFooter span', '[class*="posted"]',
        'span[class*="postDate"]', '.res-timeline-srp-pTag',
      ].join(', '));
      const postedText = postedEl ? (await postedEl.textContent()).trim() : '';

      jobs.push({
        jobId,
        title,
        company:    await getText(SEL.jobCompany),
        location:   await getText(SEL.jobLocation),
        experience: await getText(SEL.jobExperience),
        salary:     await getText(SEL.jobSalary),
        url,
        easyApply,
        postedText,
      });
    } catch (e) {
      db.addLog({ level: 'warn', event: 'scrape', message: `  Card scrape error: ${e.message}` });
    }
  }

  return jobs;
}

// ─── Search keyword (multi-page) ─────────────────────────────────────────────

async function searchKeyword(page, keyword, settings) {
  db.addLog({ level: 'info', event: 'search', message: `Searching: "${keyword}"` });
  const allJobs = [];
  const MAX_PAGES = 3;

  for (let p = 1; p <= MAX_PAGES; p++) {
    const url = buildSearchUrl(keyword, settings, p);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(2000);

      const pageJobs = await scrapeJobCards(page);
      if (pageJobs.length === 0) break;
      allJobs.push(...pageJobs);

      const next = await page.$(SEL.nextPageBtn);
      if (!next) break;
    } catch (e) {
      db.addLog({ level: 'warn', event: 'search', message: `  Page ${p} error for "${keyword}": ${e.message}` });
      break;
    }
  }

  db.addLog({ level: 'info', event: 'search', message: `  "${keyword}" → ${allJobs.length} jobs scraped` });
  return allJobs;
}

// ─── Apply to one job ─────────────────────────────────────────────────────────

async function applyToJob(page, job) {
  db.addLog({ level: 'info', event: 'apply', message: `Applying: ${job.title} @ ${job.company}` });

  try {
    await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(2000);

    // Already applied?
    const already = await page.$(SEL.alreadyApplied);
    if (already) {
      db.addLog({ level: 'info', event: 'apply', message: `  Already applied — marking in DB` });
      db.updateJobStatus(job.id, 'applied', new Date().toISOString());
      return { success: true, questionnaireFilled: false };
    }

    const applyBtn = await page.$(SEL.applyBtn);
    if (!applyBtn) {
      db.addLog({ level: 'warn', event: 'apply', message: `  No apply button found` });
      db.updateJobStatus(job.id, 'failed');
      return { success: false, questionnaireFilled: false };
    }

    const btnText = ((await applyBtn.textContent()) || '').toLowerCase();
    if (btnText.includes('applied')) {
      db.updateJobStatus(job.id, 'applied', new Date().toISOString());
      return { success: true, questionnaireFilled: false };
    }

    await applyBtn.click();
    await page.waitForTimeout(2000);

    // Handle questionnaire if it appears
    let questionnaireFilled = false;
    try {
      const hasForm = await page.$(SEL.questionnaireForm);
      if (hasForm) {
        await fillQuestionnaire(page);
        questionnaireFilled = true;
      }
    } catch {}

    // Dismiss confirmation modal if present
    try {
      const modal = await page.$(SEL.confirmModal);
      if (modal) {
        await modal.click();
        await page.waitForTimeout(1000);
      }
    } catch {}

    db.updateJobStatus(job.id, 'applied', new Date().toISOString());
    db.addLog({
      level: 'info',
      event: 'apply',
      message: `  Applied successfully`,
      applicationStatus: 'applied',
      questionnaireStatus: questionnaireFilled ? 'filled' : 'none',
    });
    return { success: true, questionnaireFilled };
  } catch (e) {
    db.addLog({ level: 'error', event: 'apply', message: `  Apply failed: ${e.message}` });
    db.updateJobStatus(job.id, 'failed');
    return { success: false, questionnaireFilled: false };
  }
}

// ─── Relevance filter ─────────────────────────────────────────────────────────

const REJECTED_TITLES = [
  'android', 'ios', 'flutter', 'kotlin', 'swift',
  'java developer', 'devops', 'data engineer', 'data scientist',
  'machine learning', 'ml engineer', 'embedded', 'salesforce',
  'wordpress', 'php', 'ruby', 'golang', '.net', 'c++', 'c#',
  'qa ', 'quality assurance', 'tester', 'testing',
  'sap', 'oracle', 'blockchain', 'game developer',
];

const REQUIRED_TITLE_KEYWORDS = [
  'react', 'frontend', 'front-end', 'front end',
  'node', 'next', 'mern', 'javascript', 'fullstack',
  'full stack', 'full-stack', 'ui developer',
];

// ─── 24-hour recency filter ───────────────────────────────────────────────────

function isPostedWithin24Hours(text) {
  if (!text) return true; // no date info → include (don't reject blindly)

  const t = text.toLowerCase().trim();

  // Clearly fresh
  if (t.includes('just now') || t.includes('minute') || t.includes('hour')) return true;
  if (t.includes('today') || t.includes('few seconds')) return true;

  // "1 day ago" = borderline, include
  const dayMatch = t.match(/^(\d+)\s*day/);
  if (dayMatch) return parseInt(dayMatch[1]) <= 1;

  // "few days", "2+ days", "week", "month" → too old
  if (t.includes('day') || t.includes('week') || t.includes('month') || t.includes('year')) return false;

  return true; // unknown format → include
}

function isRelevantJob(job) {
  const title = job.title.toLowerCase();
  const exp   = job.experience?.toLowerCase() || '';

  if (REJECTED_TITLES.some(w => title.includes(w))) return false;
  if (!REQUIRED_TITLE_KEYWORDS.some(w => title.includes(w))) return false;

  // reject if min experience required is more than 5 years
  const expMatch = exp.match(/(\d+)\s*-\s*(\d+)/);
  if (expMatch && parseInt(expMatch[1]) > 5) return false;

  return true;
}

// ─── Main bot runner ─────────────────────────────────────────────────────────

async function runBot({ forceHeaded = false } = {}) {
  const settings = db.getSettings();
  const headless  = forceHeaded ? false : settings.headless === 'true';

  db.addLog({ level: 'info', event: 'bot', message: '========== Naukri Bot Starting ==========' });
  const runId = db.startRun();

  let browser     = null;
  let jobsFound   = 0;
  let jobsApplied = 0;

  try {
    const { browser: b, context, page } = await launchBrowser(headless);
    browser = b;

    // ── Login check ────────────────────────────────────────────────────────
    await page.goto('https://www.naukri.com', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(2000);

    // if (await isLoggedIn(page)) {
    //   db.addLog({ level: 'info', event: 'login', message: 'Session restored — already logged in' });
    // } else {
    //   db.addLog({ level: 'info', event: 'login', message: 'No active session — logging in...' });
    //   await doLogin(page, context, !headless || forceHeaded);
    // }

    // ── Profile refresh ───────────────────────────────────────────────────
    await refreshProfile(page);

    // ── Job search ────────────────────────────────────────────────────────
    const keywords = db.getEnabledKeywords();
    if (keywords.length === 0) {
      db.addLog({ level: 'warn', event: 'search', message: 'No enabled keywords found. Add keywords in the dashboard.' });
    }

    const newJobs = [];

    for (const kw of keywords) {
      const found = await searchKeyword(page, kw, settings);
      let saved   = 0;
      for (const job of found) {
        if (!isRelevantJob(job)) {
          db.addLog({ level: 'info', event: 'filter', message: `  Skipped (irrelevant): ${job.title}` });
          continue;
        }
        if (!isPostedWithin24Hours(job.postedText)) {
          db.addLog({ level: 'info', event: 'filter', message: `  Skipped (old posting – ${job.postedText || 'unknown date'}): ${job.title}` });
          continue;
        }
        if (!db.jobExists(job.jobId)) {
          db.saveJob(job);
          const saved_row = db.getJobByJobId(job.jobId);
          if (saved_row) newJobs.push({ ...job, id: saved_row.id, easy_apply: saved_row.easy_apply });
          saved++;
        }
      }
      db.addLog({ level: 'info', event: 'search', message: `"${kw}" → ${found.length} found, ${saved} new (last 24h, relevant)` });
      jobsFound += saved;
    }

    db.addLog({ level: 'info', event: 'bot', message: `Total new jobs saved: ${jobsFound}` });

    // ── Auto-apply / Telegram approval ───────────────────────────────────
    const telegramEnabled = settings.telegram_approval_enabled === 'true';
    const autoApply       = settings.auto_apply === 'true';
    const dailyLimit      = parseInt(settings.daily_apply_limit) || 10;
    const delay           = parseInt(settings.delay_between_apply) || 3000;

    // Load telegram service lazily
    let telegram = null;
    try { telegram = require('../services/telegramService'); } catch {}

    for (const job of newJobs) {
      if (!job.id) continue;

      const appliedToday = db.getJobsAppliedToday();

      if (appliedToday >= dailyLimit) {
        db.updateJobStatus(job.id, 'manual_review');
        db.addLog({ level: 'warn', event: 'apply', message: `Daily limit reached (${appliedToday}/${dailyLimit}). Moved to manual review: ${job.title}` });
        continue;
      }

      if (telegramEnabled && telegram && telegram.isReady()) {
        // Send to Telegram for approval
        db.updateJobStatus(job.id, 'pending');
        await telegram.sendJobNotification({ ...job, easy_apply: job.easyApply });
        db.addLog({ level: 'info', event: 'telegram', message: `Sent to Telegram for approval: ${job.title}` });
      } else if (autoApply) {
        // Apply immediately
        const result = await applyToJob(page, job);
        if (result.success) jobsApplied++;
        await page.waitForTimeout(delay);
      } else {
        db.addLog({ level: 'info', event: 'bot', message: `Auto-apply disabled — job queued: ${job.title}` });
      }
    }

    // If telegram enabled and there are pending jobs, send bulk prompt
    if (telegramEnabled && telegram && telegram.isReady()) {
      const pending = db.getPendingJobs();
      if (pending.length > 0) {
        await telegram.sendMessage(
          `*${pending.length} jobs pending approval.*\n\nReply to each job notification or use bulk actions below.`,
        );
      }
    }

    db.addLog({ level: 'info', event: 'bot', message: `Applied to ${jobsApplied} jobs` });

    await browser.close();
    db.finishRun(runId, { jobsFound, jobsApplied, status: 'success' });
    db.addLog({ level: 'info', event: 'bot', message: `========== Done: ${jobsFound} found, ${jobsApplied} applied ==========` });

  } catch (err) {
    db.addLog({ level: 'error', event: 'bot', message: `Bot error: ${err.message}` });
    if (browser) await browser.close().catch(() => {});
    db.finishRun(runId, { jobsFound, jobsApplied, status: 'error', error: err.message });
    throw err;
  }

  return { jobsFound, jobsApplied };
}

// ─── Scrape only (no apply) ───────────────────────────────────────────────────

async function runScrapeOnly({ forceHeaded = false } = {}) {
  const settings = db.getSettings();
  const headless  = forceHeaded ? false : settings.headless === 'true';

  db.addLog({ level: 'info', event: 'bot', message: '========== Scrape-Only Run Starting ==========' });
  const runId = db.startRun();

  let browser   = null;
  let jobsFound = 0;

  try {
    const { browser: b, context, page } = await launchBrowser(headless);
    browser = b;

    await page.goto('https://www.naukri.com', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(2000);

    if (await isLoggedIn(page)) {
      db.addLog({ level: 'info', event: 'login', message: 'Session restored — already logged in' });
    } else {
      db.addLog({ level: 'info', event: 'login', message: 'No active session — logging in...' });
      await doLogin(page, context, !headless || forceHeaded);
    }

    const keywords = db.getEnabledKeywords();

    for (const kw of keywords) {
      const found = await searchKeyword(page, kw, settings);
      let saved   = 0;
      for (const job of found) {
        if (!isRelevantJob(job)) continue;
        if (!isPostedWithin24Hours(job.postedText)) continue;
        if (!db.jobExists(job.jobId)) {
          db.saveJob(job);
          const saved_row = db.getJobByJobId(job.jobId);
          if (saved_row) db.updateJobStatus(saved_row.id, 'manual_review');
          saved++;
        }
      }
      db.addLog({ level: 'info', event: 'search', message: `"${kw}" → ${found.length} found, ${saved} new within 24h (manual review)` });
      jobsFound += saved;
    }

    await browser.close();
    db.finishRun(runId, { jobsFound, jobsApplied: 0, status: 'success' });
    db.addLog({ level: 'info', event: 'bot', message: `========== Scrape Done: ${jobsFound} found, 0 applied ==========` });

  } catch (err) {
    db.addLog({ level: 'error', event: 'bot', message: `Scrape error: ${err.message}` });
    if (browser) await browser.close().catch(() => {});
    db.finishRun(runId, { jobsFound, jobsApplied: 0, status: 'error', error: err.message });
    throw err;
  }

  return { jobsFound, jobsApplied: 0 };
}

// ─── Apply to a specific job by DB id ────────────────────────────────────────

async function applyToJobById(jobDbId) {
  const jobRow = db.getJob(jobDbId);
  if (!jobRow) throw new Error(`Job ${jobDbId} not found in database`);

  const settings = db.getSettings();
  const headless  = settings.headless === 'true';

  db.addLog({ level: 'info', event: 'apply', message: `Manual apply triggered for job #${jobDbId}: ${jobRow.title}` });

  let browser = null;
  try {
    const { browser: b, context, page } = await launchBrowser(headless);
    browser = b;

    await page.goto('https://www.naukri.com', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(2000);

    if (!(await isLoggedIn(page))) {
      await doLogin(page, context, false);
    }

    const result = await applyToJob(page, jobRow);
    await browser.close();
    return result;
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    db.addLog({ level: 'error', event: 'apply', message: `applyToJobById failed: ${e.message}` });
    throw e;
  }
}

// ─── Profile refresh standalone ──────────────────────────────────────────────

async function refreshProfileOnly() {
  const settings = db.getSettings();
  const headless  = settings.headless === 'true';

  db.addLog({ level: 'info', event: 'profile_refresh', message: 'Standalone profile refresh started' });
  let browser = null;
  try {
    const { browser: b, context, page } = await launchBrowser(headless);
    browser = b;

    await page.goto('https://www.naukri.com', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(2000);

    if (!(await isLoggedIn(page))) {
      await doLogin(page, context, false);
    }

    await refreshProfile(page);
    await browser.close();
    return true;
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    db.addLog({ level: 'error', event: 'profile_refresh', message: `Profile refresh standalone failed: ${e.message}` });
    throw e;
  }
}

// ─── Upload resume standalone ─────────────────────────────────────────────────

async function uploadResumeStandalone() {
  const settings = db.getSettings();
  const headless  = settings.headless === 'true';

  db.addLog({ level: 'info', event: 'resume_upload', message: 'Standalone resume upload started' });
  let browser = null;
  try {
    const { browser: b, context, page } = await launchBrowser(headless);
    browser = b;

    await page.goto('https://www.naukri.com', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(2000);

    if (!(await isLoggedIn(page))) {
      await doLogin(page, context, false);
    }

    const result = await uploadResume(page);
    await browser.close();
    return result;
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    db.addLog({ level: 'error', event: 'resume_upload', message: `Resume upload standalone failed: ${e.message}` });
    throw e;
  }
}

module.exports = {
  runBot,
  runScrapeOnly,
  applyToJobById,
  uploadResume,
  uploadResumeStandalone,
  refreshProfileOnly,
};
