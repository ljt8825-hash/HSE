/**
 * 任务9/10（提示词09/10）：人员保险险种生产常量测试。
 * 直接导入生产常量 PERSONNEL_INSURANCE_TYPES（禁止在测试内自建同名数组/影子常量），
 * 删除恒真断言；验证：
 *  - 生产常量内容与后端 SUPPORTED_INSURANCE_TYPES 一致（仅双险）
 *  - 人员记录新增/编辑弹窗 与 保单管理导入/编辑弹窗 两个险种下拉都由生产常量渲染
 *  - 页面硬编码双险 option 数量为 0（任一下拉重新硬编码即失败）
 * 旧测试"只找到一次 v-for 也通过"无法发现第二个下拉硬编码 → 本测试断言恰好 2 处 v-for。
 */
import { describe, expect, it } from 'vitest';
import { PERSONNEL_INSURANCE_TYPES } from '#/api/hse/insurance';

describe('人员保险险种生产常量（任务9/10）', () => {
  const pageSource = require('fs').readFileSync(
    require('path').resolve(__dirname, '../../../views/insurance/personnel/index.vue'),
    'utf-8',
  );

  it('生产常量仅含两个规范险种（与后端 SUPPORTED_INSURANCE_TYPES 一致）', () => {
    expect(Array.from(PERSONNEL_INSURANCE_TYPES)).toEqual(['雇主责任险', '工伤保险']);
    expect(PERSONNEL_INSURANCE_TYPES).not.toContain('意外伤害险');
    expect(PERSONNEL_INSURANCE_TYPES).not.toContain('五险');
  });

  it('两个险种下拉（人员记录 + 保单管理）都由 PERSONNEL_INSURANCE_TYPES 渲染', () => {
    // 任务10：必须证明两个下拉（人员记录新增/编辑 + 保单管理导入/编辑）都使用生产常量。
    // 若第二个下拉重新硬编码，v-for 出现次数将 < 2 → 测试失败（旧测试"至少一次"无法发现）。
    const vForCount = (pageSource.match(/v-for="t in PERSONNEL_INSURANCE_TYPES"/g) || []).length;
    expect(vForCount).toBe(2);
  });

  it('页面不存在人员保险双险硬编码 option（数量为 0）', () => {
    // 任务10：任何 <SelectOption value="雇主责任险"> / <SelectOption value="工伤保险">
    // 硬编码都必须在测试下失败。
    const hardcodedEmployer = (pageSource.match(/<SelectOption[^>]*value="雇主责任险"/g) || []).length;
    const hardcodedInjury = (pageSource.match(/<SelectOption[^>]*value="工伤保险"/g) || []).length;
    expect(hardcodedEmployer).toBe(0);
    expect(hardcodedInjury).toBe(0);
    // 意外伤害险在任何下拉/常量中均不得出现
    expect(pageSource).not.toContain('value="意外伤害险"');
  });
});
