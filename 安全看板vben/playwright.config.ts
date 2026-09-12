import type { PlaywrightTestConfig } from '@playwright/test';

import { devices } from '@playwright/test';

/**
 * 宁津环卫 HSE 安全管理系统 v4.1 - Playwright E2E 测试配置
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
const config: PlaywrightTestConfig = {
  expect: {
    /**
     * Maximum time expect() should wait for the condition to be met.
     * For example in `await expect(locator).toHaveText();`
     */
    timeout: 5000,
  },
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Folder for test artifacts such as screenshots, videos, traces, etc. */
  outputDir: 'test-results/',
  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // 提示词-147：无头 / 沙箱环境（CI、root）下必须加上 --no-sandbox，
        // 否则 Chrome 静默退出（"exited early without writing DevToolsActivePort"）。
        launchOptions: {
          args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
        },
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
      },
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
      },
    },

    /* Test against mobile viewports. */
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 5'],
      },
    },
    {
      name: 'Mobile Safari',
      use: {
        ...devices['iPhone 12'],
      },
    },
  ],
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['list'], ['html', { outputFolder: 'test-results' }]],
  /* Retry on CI only */
  retries: 1,
  testDir: './e2e',
  /* Maximum time one test can run for. */
  /* 提示词-148：放宽至 120s，覆盖 Vite dev server 首屏依赖预构建（esbuild optimize）冷启动耗时 */
  timeout: 120_000,
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Maximum time each action such as `click()` can take. Defaults to 0 (no limit). */
    actionTimeout: 0,
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://127.0.0.1:5173',
    /* Only on CI systems run the tests headless */
    headless: !!process.env.CI,
    /* Locale and timezone settings for Chinese environment */
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    /* Screenshot settings */
    screenshot: 'only-on-failure',
    /* Video settings */
    video: 'retain-on-failure',
  },

  /* 提示词-147：默认不自动启动 dev server，改为手动启动更稳（见 e2e/README.md）。
     如需自动拉起，取消下方注释即可（依赖 pnpm 与后端 :5800 已就绪）。
  webServer: {
    command: 'pnpm dev:antd',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  */


  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
};

export default config;
