// ─────────────────────────────────────────────────────────────
//  Browser utilities — launch, sort, pagination
// ─────────────────────────────────────────────────────────────

import { chromium } from 'playwright';
import { CONFIG } from '../constants/config.js';
import { sleep } from './helpers.js';

/** Launch browser + context. Returns { browser, context, page } */
export async function launchBrowser() {
  const browser = await chromium.launch({
    headless: CONFIG.BROWSER.headless,
    slowMo: CONFIG.BROWSER.slowMo,
  });
  const context = await browser.newContext({
    userAgent: CONFIG.BROWSER.userAgent,
    viewport: CONFIG.BROWSER.viewport,
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
        await sleep(CONFIG.DELAYS.sortDropdownOpen);
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
        await sleep(CONFIG.DELAYS.afterSort);
        console.log('  ✅ Sorted by Date (dropdown)');
        return;
      }
    }

    const currentUrl = page.url();
    if (!currentUrl.includes('sort=1')) {
      const sortedUrl = currentUrl.includes('?') ? `${currentUrl}&sort=1` : `${currentUrl}?sort=1`;
      await page.goto(sortedUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(CONFIG.DELAYS.afterSort);
      console.log('  ✅ Sorted by Date (URL param)');
    }
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
