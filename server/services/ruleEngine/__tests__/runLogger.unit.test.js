/**
 * 测试：services/ruleEngine/runLogger.js
 * 覆盖 buildRunSummary 的计量单位文案（阶段3 事件通路修复）：
 *   - events 单位：deducted 段称「人次」
 *   - people 单位（含默认）：deducted 段称「人」
 *   - 省略考核段：assessed===scanned 时省去「考核N人」
 *
 * 隔离约定：mock config/db（buildRunSummary 为纯函数，不触库；
 * recordRuleRun 依赖 isConnected/pool，本测试仅覆盖纯函数文案）。
 */

jest.mock('../../../config/db', () => ({
  pool: { query: jest.fn() },
  isConnected: jest.fn(() => true),
}));

const { buildRunSummary } = require('../runLogger');

describe('runLogger · buildRunSummary 计量单位文案', () => {
  it('events 单位：deducted 段称「人次」（assessed≠scanned 补考核段）', () => {
    expect(buildRunSummary({ scanned: 5, assessed: 3, deducted: 4, deductedUnit: 'events' }))
      .toBe('扫描5人/考核3人/扣分4人次');
  });

  it('people 单位：deducted 段称「人」（明确声明）', () => {
    expect(buildRunSummary({ scanned: 5, assessed: 3, deducted: 4, deductedUnit: 'people' }))
      .toBe('扫描5人/考核3人/扣分4人');
  });

  it('people 单位：未声明 deductedUnit 时默认按人', () => {
    expect(buildRunSummary({ scanned: 5, assessed: 3, deducted: 4 }))
      .toBe('扫描5人/考核3人/扣分4人');
  });

  it('省略考核段（events）：assessed===scanned 时省去「考核N人」，deducted 仍称人次', () => {
    expect(buildRunSummary({ scanned: 5, assessed: 5, deducted: 4, deductedUnit: 'events' }))
      .toBe('扫描5人/扣分4人次');
  });

  it('省略考核段（people）：assessed===scanned 默认省去考核段，deducted 称人', () => {
    expect(buildRunSummary({ scanned: 5, assessed: 5, deducted: 4 }))
      .toBe('扫描5人/扣分4人');
  });

  it('零值边界：events 单位下 0 人 0 人次文案正确', () => {
    expect(buildRunSummary({ scanned: 0, assessed: 0, deducted: 0, deductedUnit: 'events' }))
      .toBe('扫描0人/扣分0人次');
  });
});
