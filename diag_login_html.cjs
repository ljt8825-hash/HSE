const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  const logs = [];
  try {
    await page.goto('http://localhost:5173/auth/login', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);
    const info = await page.evaluate(() => {
      const out = [];
      const all = Array.from(document.querySelectorAll('*'));
      all.forEach(e => {
        const t = e.textContent || '';
        if (t.includes('滑块') || t.includes('拖动')) {
          out.push('TXT: cls=' + (e.className?.toString().slice(0,50)) + ' tag=' + e.tagName + ' html=' + e.outerHTML.slice(0, 350));
        }
      });
      out.push('CANVAS count=' + document.querySelectorAll('canvas').length);
      out.push('svg-with-drag count=' + document.querySelectorAll('[class*="action"],[class*="thumb"],[class*="handle"]').length);
      return out.slice(0, 10);
    });
    logs.push(info.join('\n'));
  } catch (e) { logs.push('ERR ' + e.message); }
  console.log(logs.join('\n'));
  await browser.close();
})();
