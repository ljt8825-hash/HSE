import { chromium } from 'file:///F:/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core/index.mjs';
const exe = 'C:/Users/honey/AppData/Local/ms-playwright/chromium-1226/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)); });
const routes = ['/', '/hse/accidents', '/hse/employee', '/personnel/import', '/personnel/over-age'];
for (const p of routes) {
  await page.goto('http://127.0.0.1:5173' + p, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(4000);
  const bodyLen = ((await page.textContent('body')) || '').trim().length;
  const url = page.url();
  const title = await page.title();
  console.log('ROUTE ' + p + ' | url=' + url + ' | bodyLen=' + bodyLen + ' | title=' + title);
}
await page.screenshot({ path: 'smoke-phase2.png' });
console.log('TOTAL_JS_ERRORS=' + errors.length);
if (errors.length) console.log(errors.slice(0, 12).join('\n'));
await browser.close();
