const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://www.naukri.com/nlogin/login');

  console.log('Login manually and complete OTP...');

  // wait long enough for manual login
  await page.waitForTimeout(120000);

  // save cookies + session
  await context.storageState({ path: 'naukri-session.json' });

  console.log('Session saved!');

  await browser.close();
})();
