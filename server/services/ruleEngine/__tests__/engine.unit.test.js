/**
 * 测试：services/ruleEngine/engine.js
 * 覆盖：
 *   - runCycleAdapters：某适配器 noLedger 时「按适配器跳过」而非整轮中止，adapters 含两项明细
 *   - runCycleAutoDeductions 统一门面：聚合全部自动扣分适配器（网格 + 三违）明细
 *   - 周期不存在 / 状态 frozen → ok:false 且 adapters:[]
 *   - 写入 changed 动作计入 affected 与 changedTargets 重算
 *
 * 隔离约定：mock config/db、assessmentScoringEngine、ruleLoader、adapterRegistry、
 *          deductionWriter、categoryCap、runLogger，全程不连真实库。
 */

jest.mock('../../../config/db', () => ({
  pool: { query: jest.fn() },
  isConnected: jest.fn(() => true),
}));

jest.mock('../../assessmentScoringEngine', () => ({
  recalculateTarget: jest.fn(async () => {}),
}));

jest.mock('../ruleLoader', () => ({
  getRuleByAdapterKey: jest.fn(),
  getRuleByCode: jest.fn(),
}));

jest.mock('../adapterRegistry', () => ({
  getAdapter: jest.fn(),
  listActiveAdapterKeys: jest.fn(() => ['grid_unchecked', 'violation_record']),
  registerAdapter: jest.fn(),
}));

jest.mock('../deductionWriter', () => ({
  createDeductionWriter: jest.fn(() => ({
    upsert: jest.fn(async () => 'inserted'),
    revoke: jest.fn(async () => 'none'),
    // 阶段2 修复：applyCap 前需按幂等键定位当前行；单测默认无既有行 → 返回 null
    findExisting: jest.fn(async () => null),
  })),
}));

jest.mock('../categoryCap', () => ({
  applyCap: jest.fn(async () => ({ cap: { cap: 15, cappedScore: 1, otherCatScore: 0 }, cappedScore: 1 })),
}));

jest.mock('../runLogger', () => ({
  recordRuleRun: jest.fn(async () => {}),
}));

const { pool, isConnected } = require('../../../config/db');
const engine = require('../../assessmentScoringEngine');
const { getRuleByAdapterKey, getRuleByCode } = require('../ruleLoader');
const { getAdapter } = require('../adapterRegistry');
const { createDeductionWriter } = require('../deductionWriter');
const { applyCap } = require('../categoryCap');
const { recordRuleRun } = require('../runLogger');
const { runCycleAdapters, runCycleAutoDeductions, shouldWriteObservability } = require('../engine');

const GRID = 'grid_unchecked';
const VIOLATION = 'violation_record';

function makeRule() {
  return { ruleId: 1, ruleName: 'r', category: '三违管理', deductScore: 1, metricCode: 'M' };
}

const fakeGrid = {
  sourceTable: 'grid_inspection_records',
  kind: 'grid_unchecked_monthly',
  idempotency: 'monthly',
  buildDeductKey: ({ cycleId, employeeId }) => `grid:${cycleId}:${employeeId}`,
  buildItem: () => '未检查',
  buildDetail: (i) => ({ kind: 'grid_unchecked_monthly', deductKey: '', x: i.rawScore }),
  buildReportDetail: (i, o) => ({ employeeId: i.employeeId, action: o.action }),
  scan: jest.fn(),
};

const fakeViolation = {
  sourceTable: 'violation_records',
  kind: 'violation_event',
  idempotency: 'event',
  buildDeductKey: ({ cycleId, sourceId }) => `violation:${cycleId}:${sourceId}`,
  buildItem: () => '三违1次',
  buildDetail: (i) => ({ kind: 'violation_event', deductKey: '', x: i.rawScore }),
  buildReportDetail: (i, o) => ({ employeeId: i.employeeId, action: o.action }),
  scan: jest.fn(),
};

function setupAdapters(gridScan, violationScan) {
  fakeGrid.scan.mockReset();
  fakeViolation.scan.mockReset();
  fakeGrid.scan.mockResolvedValue(gridScan);
  fakeViolation.scan.mockResolvedValue(violationScan);
  getAdapter.mockImplementation((key) => (key === GRID ? fakeGrid : key === VIOLATION ? fakeViolation : null));
  getRuleByAdapterKey.mockResolvedValue(makeRule());
  getRuleByCode.mockResolvedValue(null);
  createDeductionWriter().upsert.mockResolvedValue('inserted');
  createDeductionWriter().revoke.mockResolvedValue('none');
}

const VALID_GRID = { scanned: 24, assessed: 24, intents: [{ _seq: 0, cycleId: 24, targetId: 55, employeeId: 7643, rawScore: 1 }], revocations: [], skipped: [], noLedger: false, metric: { id: 1 } };
const VALID_VIOLATION = { scanned: 2, assessed: 2, intents: [{ _seq: 0, cycleId: 24, targetId: 56, employeeId: 8888, rawScore: 5 }], revocations: [], skipped: [], noLedger: false, metric: { id: 2 } };
const NO_LEDGER = { scanned: 0, assessed: 0, intents: [], revocations: [], skipped: [], noLedger: true, metric: null };

beforeEach(() => {
  pool.query.mockReset();
  isConnected.mockReturnValue(true);
  engine.recalculateTarget.mockClear();
  applyCap.mockClear();
  recordRuleRun.mockClear();
  // 周期查询默认返回一条有效周期（含窗口，覆盖当前时刻 → 观测守卫放行）
  const now = Date.now();
  pool.query.mockResolvedValue({
    rows: [{
      id: 24, assessment_year: 2026, assessment_month: 8, status: 'pending_review',
      start_time: new Date(now - 86400000), end_time: new Date(now + 86400000),
    }],
  });
});

describe('runCycleAdapters · noLedger 按适配器跳过', () => {
  it('某适配器 noLedger 时不整轮中止，adapters 含两项，另一适配器仍正常处理', async () => {
    setupAdapters(VALID_GRID, NO_LEDGER);

    const res = await runCycleAdapters(24, { adapterKeys: [GRID, VIOLATION], dryRun: false });

    expect(res.ok).toBe(true);
    expect(res.adapters).toHaveLength(2);
    expect(res.adapters[0]).toMatchObject({ key: GRID, ok: true, scanned: 24, assessed: 24 });
    expect(res.adapters[1]).toMatchObject({ key: VIOLATION, ok: false, reason: 'no-ledger-data', scanned: 0, assessed: 0 });
    // 整体口径仅含成功适配器
    expect(res.scanned).toBe(24);
    expect(res.assessed).toBe(24);
    // 失败的适配器不应触发其落库 / 重算
    expect(applyCap).toHaveBeenCalledTimes(1); // 仅 grid 的 1 条 intent
  });

  it('两适配器均正常 → adapters 两项均 ok，口径累加', async () => {
    setupAdapters(VALID_GRID, VALID_VIOLATION);

    const res = await runCycleAdapters(24, { adapterKeys: [GRID, VIOLATION], dryRun: false });

    expect(res.ok).toBe(true);
    expect(res.adapters).toHaveLength(2);
    expect(res.adapters.every((a) => a.ok)).toBe(true);
    expect(res.scanned).toBe(26); // 24 + 2
    expect(res.assessed).toBe(26);
    expect(applyCap).toHaveBeenCalledTimes(2);
    expect(recordRuleRun).toHaveBeenCalledTimes(2);
  });
});

describe('runCycleAutoDeductions · 统一门面', () => {
  it('执行全部自动扣分适配器（grid_unchecked + violation_record）并返回 adapters 明细', async () => {
    setupAdapters(VALID_GRID, VALID_VIOLATION);

    const res = await runCycleAutoDeductions(24, { dryRun: false });

    expect(res.ok).toBe(true);
    expect(res.adapters.map((a) => a.key)).toEqual([GRID, VIOLATION]);
    expect(res.adapters.every((a) => a.ok)).toBe(true);
    expect(engine.recalculateTarget).toHaveBeenCalled(); // 有 changed 动作 → 重算
  });

  it('dryRun 只算不写（applyCap 仍调用以预览，但 recordRuleRun 不写、重算不触发）', async () => {
    setupAdapters(VALID_GRID, VALID_VIOLATION);

    const res = await runCycleAutoDeductions(24, { dryRun: true });

    expect(res.ok).toBe(true);
    expect(applyCap).toHaveBeenCalledTimes(2);
    expect(recordRuleRun).not.toHaveBeenCalled();
    expect(engine.recalculateTarget).not.toHaveBeenCalled();
  });
});

describe('runCycleAdapters · 守卫', () => {
  it('周期不存在 → ok:false reason cycle-not-found，adapters:[]', async () => {
    setupAdapters(VALID_GRID, VALID_VIOLATION);
    pool.query.mockResolvedValue({ rows: [] });

    const res = await runCycleAdapters(24, { adapterKeys: [GRID, VIOLATION] });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('cycle-not-found');
    expect(res.adapters).toEqual([]);
  });

  it('周期状态 frozen → ok:false reason cycle-status-frozen，adapters:[]', async () => {
    setupAdapters(VALID_GRID, VALID_VIOLATION);
    pool.query.mockResolvedValue({ rows: [{ id: 24, assessment_year: 2026, assessment_month: 8, status: 'frozen' }] });

    const res = await runCycleAdapters(24, { adapterKeys: [GRID, VIOLATION] });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('cycle-status-frozen');
    expect(res.adapters).toEqual([]);
  });

  it('未连接数据库（内存模式） → ok:false reason memory-mode，adapters:[]', async () => {
    setupAdapters(VALID_GRID, VALID_VIOLATION);
    isConnected.mockReturnValue(false);

    const res = await runCycleAdapters(24, { adapterKeys: [GRID, VIOLATION] });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('memory-mode');
    expect(res.adapters).toEqual([]);
  });
});

describe('shouldWriteObservability · 纯函数边界', () => {
  const DAY = 86400000;
  it('窗口内（now ∈ [start, end]）→ true', () => {
    const now = new Date('2026-09-15T12:00:00');
    const cycle = { start_time: new Date('2026-09-01T00:00:00'), end_time: new Date('2026-09-30T23:59:59') };
    expect(shouldWriteObservability(cycle, now)).toBe(true);
  });
  it('未来周期（now < start）→ false（人工预创建当月但不刷观测）', () => {
    const now = new Date('2026-08-20T12:00:00');
    const cycle = { start_time: new Date('2026-09-01T00:00:00'), end_time: new Date('2026-09-30T23:59:59') };
    expect(shouldWriteObservability(cycle, now)).toBe(false);
  });
  it('宽限期（end_time 已过去 5 天）→ false（不覆写当月观测）', () => {
    const now = new Date('2026-09-05T01:00:00');
    const cycle = { start_time: new Date('2026-07-31T00:00:00'), end_time: new Date('2026-08-01T23:59:59') };
    expect(shouldWriteObservability(cycle, now)).toBe(false);
  });
  it('月末当秒（now === end_time）→ true', () => {
    const end = new Date('2026-09-30T23:59:59');
    const cycle = { start_time: new Date('2026-09-01T00:00:00'), end_time: end };
    expect(shouldWriteObservability(cycle, new Date(end.getTime()))).toBe(true);
  });
  it('缺 start/end → false（安全默认：不写）', () => {
    const now = new Date('2026-09-15T12:00:00');
    expect(shouldWriteObservability({ id: 1 }, now)).toBe(false);
    expect(shouldWriteObservability(null, now)).toBe(false);
  });
});

describe('runCycleAdapters · 观测写入守卫（提示词-14）', () => {
  it('窗口内周期真实运行 → 扣分正常落库且 recordRuleRun 被调用（每适配器一次）', async () => {
    setupAdapters(VALID_GRID, VALID_VIOLATION);
    const now = Date.now();
    pool.query.mockResolvedValue({
      rows: [{ id: 24, assessment_year: 2026, assessment_month: 8, status: 'pending_review',
        start_time: new Date(now - 86400000), end_time: new Date(now + 86400000) }],
    });

    const res = await runCycleAdapters(24, { adapterKeys: [GRID, VIOLATION] });
    expect(res.ok).toBe(true);
    // 扣分/撤销/钳制链路照常
    expect(applyCap).toHaveBeenCalledTimes(2);
    // 观测三数写入（现状不变）
    expect(recordRuleRun).toHaveBeenCalledTimes(2);
  });

  it('宽限期周期（end_time 已过）真实运行 → 扣分 writer 照常调用，但 recordRuleRun 不写观测', async () => {
    setupAdapters(VALID_GRID, VALID_VIOLATION);
    const now = Date.now();
    pool.query.mockResolvedValue({
      rows: [{ id: 23, assessment_year: 2026, assessment_month: 7, status: 'pending_review',
        start_time: new Date(now - 10 * 86400000), end_time: new Date(now - 5 * 86400000) }],
    });

    const res = await runCycleAdapters(23, { adapterKeys: [GRID, VIOLATION] });
    expect(res.ok).toBe(true);
    // 宽限补跑：扣分/撤销链路仍执行（与窗口内一致）
    expect(applyCap).toHaveBeenCalledTimes(2);
    // 但观测三数不覆写
    expect(recordRuleRun).not.toHaveBeenCalled();
  });

  it('dryRun → 仅预览，recordRuleRun 不写（回归保护）', async () => {
    setupAdapters(VALID_GRID, VALID_VIOLATION);
    const res = await runCycleAdapters(24, { adapterKeys: [GRID, VIOLATION], dryRun: true });
    expect(res.ok).toBe(true);
    expect(recordRuleRun).not.toHaveBeenCalled();
  });
});
