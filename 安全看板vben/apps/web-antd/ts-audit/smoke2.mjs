import { chromium } from 'file:///F:/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ executablePath: 'C:/Users/honey/AppData/Local/ms-playwright/chromium-1226/chrome-win64/chrome.exe', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)); });
for (const path of ['/hse/accidents', '/hse/employee', '/personnel/over-age']) {
  await page.goto('http://127.0.0.1:5173' + path, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(4000);
  console.log('PATH:', path, 'URL:', page.url(), 'TITLE:', await page.title());
}
await page.screenshot({ path: 'smoke-route.png' });
console.log('ERRORS:', errors.length ? errors.slice(0, 8).join('\n') : 'none');
await browser.close();
