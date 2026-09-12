/**
 * ============================================================
 * Lighthouse CI 配置 — 宁津环卫 HSE 安全管理系统 v4.1
 * ============================================================
 *
 * 用途：自动化前端性能基线检测，集成到 CI Quality Gate 流水线
 * 文档：https://github.com/GoogleChrome/lighthouse-ci
 *
 * 使用方式：
 *   npx lhci autorun --config=performance/lighthouse/lighthouse.config.js
 *
 * 注意事项：
 *   - 需要登录的页面通过 puppeteer 脚本注入 localStorage token
 *   - 本配置使用 desktop 预设，移动端需单独配置 mobile preset
 *   - numberOfRuns=3 取中位数作为最终结果
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

// ----------------------------------------------------------
// URL 配置加载
// ----------------------------------------------------------
const urlsConfig = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'urls.json'), 'utf-8')
);

// ----------------------------------------------------------
// Puppeteer 预处理脚本：为需要登录的页面注入 token
// ----------------------------------------------------------
/**
 * 对于需要登录的页面，通过 puppeteer 在 Lighthouse 采集前
 * 将认证 token 写入 localStorage，实现"已登录"状态模拟。
 *
 * Token 获取方式：
 *   1. 环境变量 LHCI_AUTH_TOKEN（CI 环境中推荐）
 *   2. 手动从浏览器 DevTools -> Application -> Local Storage 中复制
 *   3. 通过 API /api/auth/login 获取后设置
 */
const AUTH_TOKEN =
  process.env.LHCI_AUTH_TOKEN || 'perf-test-token-placeholder';

function getPuppeteerScript(url) {
  const urlEntry = urlsConfig.urls.find(
    (u) => u.url === url || u.path === url.replace('http://localhost:5888', '')
  );

  // 不需要登录的页面，不做任何预处理
  if (!urlEntry || !urlEntry.requiresAuth) {
    return null;
  }

  // 返回 puppeteer 脚本，注入 token 到 localStorage
  return `
    const page = await context.newPage();
    await page.goto('${url}', { waitUntil: 'networkidle0' });

    // 注入认证 token
    await page.evaluate((token) => {
      localStorage.setItem('access_token', token);
      localStorage.setItem('token', token);
      // 如果系统使用 refresh token 也一并注入
      localStorage.setItem('refresh_token', token);

      // 设置 token 过期时间（24 小时后，确保测试期间有效）
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
      localStorage.setItem('token_expires_at', String(expiresAt));

      console.log('Auth token injected for performance testing');
    }, '${AUTH_TOKEN}');

    // 刷新页面使 token 生效
    await page.goto('${url}', { waitUntil: 'networkidle0' });
    await page.close();
  `;
}

// ----------------------------------------------------------
// 收集所有 URL
// ----------------------------------------------------------
const allUrls = urlsConfig.urls.map((entry) => {
  const fullUrl = entry.url.startsWith('http')
    ? entry.url
    : `http://localhost:5888${entry.url}`;
  return fullUrl;
});

// ----------------------------------------------------------
// Lighthouse CI 主配置
// ----------------------------------------------------------
module.exports = {
  ci: {
    // 桌面端预设（移动端需另建 lighthouse.config.mobile.js）
    preset: 'desktop',

    // 测试 URL 列表
    collect: {
      url: allUrls,
      numberOfRuns: 3,

      // Puppeteer 启动配置
      puppeteerLaunchOptions: {
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--window-size=1920,1080',
        ],
      },

      // 为每个需要登录的 URL 生成 puppeteer 预处理脚本
      puppeteerScript: allUrls.map((url) =>
        getPuppeteerScript(url)
      ),

      // 启动服务器前的等待时间（毫秒）
      startServerCommand: null, // CI 中由单独步骤启动 preview server

      // 静态资源超时
      quietChromeOutput: true,
    },

    // 性能断言
    assert: {
      assertions: {
        // ---- 核心指标 ----
        // 性能总分 >= 85 (warn: 低于阈值仅警告，不阻断)
        'categories:performance': ['warn', { minScore: 0.85 }],

        // 无障碍 >= 90 (error: 低于阈值阻断 CI)
        'categories:accessibility': ['error', { minScore: 0.90 }],

        // 最佳实践 >= 90 (warn)
        'categories:best-practices': ['warn', { minScore: 0.90 }],

        // ---- 核心 Web 指标 (Core Web Vitals) ----
        // First Contentful Paint < 2s (error)
        'first-contentful-paint': ['error', { maxNumericValue: 2000 }],

        // Largest Contentful Paint < 4s (error)
        'largest-contentful-paint': ['error', { maxNumericValue: 4000 }],

        // Cumulative Layout Shift < 0.1 (error)
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],

        // Total Blocking Time < 600ms (error)
        'total-blocking-time': ['error', { maxNumericValue: 600 }],

        // Speed Index < 4s (warn)
        'speed-index': ['warn', { maxNumericValue: 4000 }],
      },
      // 断言失败时的行为
      // 'assertMatrix' 模式允许部分页面失败而不阻断整体
      // 'assert-all' 模式下任何一个页面失败都会阻断
      assertionsMatrix: 'warn',
    },

    // 报告输出配置
    upload: {
      // 不上传到 Lighthouse Server（本地 / CI artifact 模式）
      target: 'filesystem',
      outputDir: 'performance/reports/lighthouse',

      // 输出格式：HTML（可视化） + JSON（机器可读）
      reportFormats: ['html', 'json'],
    },

    // 构建目录（用于静态资源分析）
    staticDistDir: './安全看板vben/apps/web-naive/dist',
  },
};
