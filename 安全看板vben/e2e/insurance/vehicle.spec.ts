import { test, expect, type Page } from '@playwright/test';

import { loginViaToken, adminCredentials } from '../utils/auth';
import { waitForPageReady } from '../utils/wait';

/**
 * 车辆保险 UI 增强 E2E（提示词-144 验收项）
 * 前置条件：后端 :5800 与前端 dev server :5173 已启动（见 e2e/README.md）
 * 运行：pnpm test:e2e --grep "vehicle"
 */
test.describe('[vehicle] 车辆保险 UI 增强 E2E（提示词-144）', () => {
  test.beforeEach(async ({ page }: { page: Page }) => {
    // 登录：token 注入 localStorage，绕过 SliderCaptcha
    await loginViaToken(page, adminCredentials);
  });

  test.afterEach(async ({ page }: { page: Page }) => {
    await page.context().clearCookies();
  });

  // V1 —— 统计卡片渲染（车辆总数 / 保险有效 / 即将到期 / 已过期）
  test('V1 统计卡片渲染（4 张可点击卡片）', async ({ page }: { page: Page }) => {
    await waitForPageReady(page, '车辆总数');

    const cards = page.locator('.hse-stat-card.stat-card-clickable');
    await expect(cards).toHaveCount(4);

    await expect(page.getByText('车辆总数', { exact: false })).toBeVisible();
    await expect(page.getByText('保险有效', { exact: false })).toBeVisible();
    await expect(page.getByText('即将到期', { exact: false })).toBeVisible();
    await expect(page.getByText('已过期', { exact: false })).toBeVisible();
  });

  // V2 —— 卡片点击联动「保险时效状态」筛选器
  test('V2 点击「已过期」卡片联动筛选器', async ({ page }: { page: Page }) => {
    await waitForPageReady(page, '车辆总数');

    const expiredCard = page
      .locator('.hse-stat-card.stat-card-clickable', { hasText: '已过期' })
      .first();
    await expiredCard.click();

    const statusFilter = page
      .locator('.ant-form-item', { hasText: '保险时效状态' })
      .locator('.ant-select-selection-item')
      .first();
    await expect(statusFilter).toHaveText(/已过期/);
  });

  // V3 —— 切换「保险时效状态」筛选器选项
  test('V3 切换「保险时效状态」筛选器选项', async ({ page }: { page: Page }) => {
    await waitForPageReady(page, '车辆总数');

    const statusFormItem = page.locator('.ant-form-item', { hasText: '保险时效状态' }).first();
    const select = statusFormItem.locator('.ant-select').first();
    await select.click();

    const option = page.locator('.ant-select-item-option', { hasText: '即将到期' }).first();
    await expect(option).toBeVisible();
    await option.click();

    await expect(
      statusFormItem.locator('.ant-select-selection-item').first(),
    ).toHaveText(/即将到期/);
  });

  // V6 —— 打开行「查看」Drawer 并校验精简字段
  test('V6 打开行「查看」Drawer 并校验字段', async ({ page }: { page: Page }) => {
    await waitForPageReady(page, '车辆总数');

    const firstRow = page.locator('.ant-table-tbody > tr.ant-table-row').first();
    const viewLink = firstRow
      .locator('a:has-text("查看"), button:has-text("查看")')
      .first();
    await viewLink.click({ timeout: 10_000 });

    const drawer = page.locator('.ant-drawer').first();
    await expect(drawer).toBeVisible({ timeout: 10_000 });

    // 移入 Drawer 的精简字段应存在
    await expect(drawer.getByText('发动机号', { exact: false })).toBeVisible();
    await expect(drawer.getByText('行驶证车主', { exact: false })).toBeVisible();
    await expect(drawer.getByText('初次登记', { exact: false })).toBeVisible();
  });

  // V7 —— 表格含「保险时效状态」列（与 calcExpiryStatus 口径一致，bonus 校验）
  test('V7 表格含「保险时效状态」列', async ({ page }: { page: Page }) => {
    await waitForPageReady(page, '车辆总数');

    await expect(
      page.locator('.ant-table-thead').getByText('保险时效状态', { exact: false }),
    ).toBeVisible();
  });
});
