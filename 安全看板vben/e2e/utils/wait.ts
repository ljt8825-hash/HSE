import type { Page } from '@playwright/test';

export interface WaitOptions {
  /** 目标路由（默认 /insurance/vehicle） */
  path?: string;
  /** 导航等待策略（默认 domcontentloaded，避免 vite 长轮询导致 networkidle 超时） */
  waitUntil?: 'domcontentloaded' | 'load' | 'networkidle';
  /** 关键字等待超时（ms，默认 90000，提示词-148：覆盖 Vite dev server 首屏依赖预构建冷启动） */
  keywordTimeout?: number;
  /** 关键字命中后额外稳定等待（ms，默认 4000） */
  settle?: number;
}

/**
 * 导航到目标页并等待页面渲染出关键字文本。
 *
 * 提取自提示词-146 的 domcontentloaded + 关键文案等待逻辑：
 *  - 用 domcontentloaded 而非 networkidle，规避 vite dev server 的 HMR 长连接导致超时
 *  - 命中关键字（如「车辆总数」）后再稳定等待一段，确保 Vue 渲染与接口回填完成
 *
 * @param page    Playwright Page
 * @param keyword 期望出现在 document.body.innerText 中的关键字
 * @param options 路径 / 等待策略 / 超时
 */
export async function waitForPageReady(
  page: Page,
  keyword: string,
  options: WaitOptions = {},
): Promise<void> {
  const {
    path = '/insurance/vehicle',
    waitUntil = 'domcontentloaded',
    keywordTimeout = 90_000,
    settle = 4_000,
  } = options;

  await page.goto(path, { waitUntil });

  await page.waitForFunction(
    (kw) => (document.body?.innerText ?? '').includes(kw),
    keyword,
    { timeout: keywordTimeout },
  );

  await page.waitForTimeout(settle);
}
