// ─────────────────────────────────────────────────────────────
//  platforms/naukri/src/utils/browser.js
//  Browser utilities for Naukri — launch, sort, pagination
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
  afterPageLoad: 1500,
  afterSort: 1500,
  afterNextPage: 2000,
  sortDropdownOpen: 500,
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
  return { browser, context, page };
}

export async function sortByDate(page) {
  console.log('  📅 Applying Sort by Date...');
  try {
    const sortTriggers = [
      '[data-ga-track="srp_sort"]',
      'div[class*="sort-by"] button',
      'div[class*="sortBy"] button',
      'button[class*="sort"]',
    ];

    let opened = false;
    for (const sel of sortTriggers) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        await el.click();
        await sleep(DELAYS.sortDropdownOpen);
        opened = true;
        break;
      }
    }

    if (opened) {
      const dateOpt = page
        .locator(
          '[class*="sort"] li:has-text("Date"), [class*="dropdown"] li:has-text("Date"), ul li:has-text("Date")',
        )
        .first();
      if (await dateOpt.isVisible({ timeout: 2000 }).catch(() => false)) {
        await dateOpt.click();
        await sleep(DELAYS.afterSort);
        console.log('  ✅ Sorted by Date (dropdown)');
        return;
      }
    }

    // No URL param fallback — Naukri's complex URLs break with &sort=1 appended
    console.log('  ℹ️  Sort dropdown not found — continuing with default order');
  } catch (e) {
    console.log('  ⚠️  Sort by date issue:', e.message);
  }
}

export async function clickNextPage(page) {
  return page.evaluate(() => {
    const all = [...document.querySelectorAll('a, button')];
    const btn =
      all.find((el) => el.innerText.trim() === '>') ||
      all.find((el) => /^next$/i.test(el.innerText.trim())) ||
      document.querySelector('a[class*="next"], button[class*="next"]');
    if (btn && !btn.disabled && !btn.classList.contains('disabled')) {
      btn.click();
      return true;
    }
    return false;
  });
}
