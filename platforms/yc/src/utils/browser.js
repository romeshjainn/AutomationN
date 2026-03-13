// ─────────────────────────────────────────────────────────────
//  platforms/yc/src/utils/browser.js
//  Browser utilities for workatastartup.com
//  Different timing than Naukri — SPA needs more wait time
// ─────────────────────────────────────────────────────────────

import { chromium } from 'playwright';
import { sleep } from '#core/utils/helpers.js';

const BROWSER_CONFIG = {
  headless: false,
  slowMo: 0,
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
  viewport: { width: 1440, height: 900 },
};

const DELAYS = {
  afterPageLoad: 2500,  // YC site is a React SPA — needs more time
  afterScroll: 1500,    // infinite scroll — wait after scrolling
  afterDetail: 1200,
};

/** Launch browser + context. Returns { browser, context, page } */
export async function launchBrowser() {
  const browser = await chromium.launch({
    headless: BROWSER_CONFIG.headless,
    slowMo: BROWSER_CONFIG.slowMo,
  });
  const context = await browser.newContext({
    userAgent: BROWSER_CONFIG.userAgent,
    viewport: BROWSER_CONFIG.viewport,
  });
  const page = await context.newPage();
  return { browser, context, page, DELAYS };
}

/**
 * Scroll down to load more jobs (YC uses infinite scroll, not pagination)
 * Returns true if new content appeared, false if end of list
 */
export async function scrollForMore(page) {
  const prevHeight = await page.evaluate(() => document.body.scrollHeight);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(DELAYS.afterScroll);
  const newHeight = await page.evaluate(() => document.body.scrollHeight);
  return newHeight > prevHeight;
}
