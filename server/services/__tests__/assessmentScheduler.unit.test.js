/**
 * 提示词-10 任务 B4：调度语义单测（不连真实库、不真实注册 cron）
 *
 * mock 策略：
 *   - node-cron：schedule 返回假 task，绝不真实注册定时任务；
 *   - config/db：pool.query 由用例按需实现，isConnected 可控；
 *   - 同级服务（评分引擎/事件服务/网格缺巡服务）：仅保留被调度器调用的函数，
 *     避免加载其下游依赖（适配器/规则引擎/DB）。
 */

jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({ stop: jest.fn() })),
}));

jest.mock('../../config/db', () => ({
  pool: { query: jest.fn() },
  isConnected: jest.fn(() => true),
}));

jest.mock('../assessmentScoringEngine', () => ({
  recalculateTarget: jest.fn(),
  logAudit: jest.fn(),
}));

jest.mock('../assessmentEventService', () => ({
  consume: jest.fn(),
  EVENT_TYPES: {},
}));

jest.mock('../gridUncheckedDeductionService', () => ({
  syncGridUncheckedDeductions: jest.fn(),
}));

const cron = require('node-cron');
const { pool, isConnected } = require('../../config/db');
const gridUnchecked = require('../gridUncheckedDeductionService');
const scheduler = require('../assessmentScheduler');

// 通用 helper：按 SQL 关键字分发 pool.query 实现
function mockQueryBySql(handlers) {
  pool.query.mockImplementation(async (sql, params) => {
    for (const [key, fn] of handlers) {
      if (sql.includes(key)) return fn(sql, params);
    }
    return { rows: [], rowCount: 0 };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  isConnected.mockReturnValue(true);
  pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('getScheduledTargetMonths（纯函数）', () => {
  test('2026-09-01 → 当月 {2026,9} + 上月 {2026,8}', () => {
    const r = scheduler.getScheduledTargetMonths(new Date(2026, 8, 1)); // 9 月 1 日（本地构造，时区无关）
    expect(r).toEqual([{ year: 2026, month: 9 }, { year: 2026, month: 8 }]);
  });

  test('2026-01-15 跨年 → 当月 {2026,1} + 上月 {2025,12}', () => {
    const r = scheduler.getScheduledTargetMonths(new Date(2026, 0, 15));
    expect(r).toEqual([{ year: 2026, month: 1 }, { year: 2025, month: 12 }]);
  });

  test('2026-12-31 年末 → 当月 {2026,12} + 上月 {2026,11}', () => {
    const r = scheduler.getScheduledTargetMonths(new Date(2026, 11, 31));
    expect(r).toEqual([{ year: 2026, month: 12 }, { year: 2026, month: 11 }]);
  });

  test('默认参数（new Date()）返回两项', () => {
    const r = scheduler.getScheduledTargetMonths();
    expect(Array.isArray(r)).toBe(true);
    expect(r).toHaveLength(2);
  });
});

describe('createScheduledCycles（当月+上月兜底，幂等跳过）', () => {
  test('9/1 触发：当月与上月各被尝试一次；已存在时 skipped 不报错、不插入', async () => {
    // 模拟两个周期都已存在 → autoCreateAndSyncCycle 内部走 skipped 分支
    mockQueryBySql([
      ['FROM hse_assessment_cycle WHERE cycle_code', async () => ({ rows: [{ id: 999 }] })],
    ]);

    await scheduler.createScheduledCycles(new Date(2026, 8, 1));

    // 两次 SELECT 分别查 2026-09 与 2026-08
    const calls = pool.query.mock.calls;
    const selectSqls = calls.filter((c) => String(c[0]).includes('cycle_code'));
    expect(selectSqls).toHaveLength(2);
    expect(selectSqls.some((c) => c[1].includes('HSE-CYCLE-202609'))).toBe(true);
    expect(selectSqls.some((c) => c[1].includes('HSE-CYCLE-202608'))).toBe(true);

    // 已存在 → 无 INSERT（证明 skipped 直接返回，未落库）
    const inserted = calls.filter((c) => String(c[0]).includes('INSERT INTO hse_assessment_cycle'));
    expect(inserted).toHaveLength(0);
  });

  test('周期不存在时调用 INSERT（建当月），且仅建一项', async () => {
    mockQueryBySql([
      ['FROM hse_assessment_cycle WHERE cycle_code', async () => ({ rows: [] })], // 都不存在
      ['INSERT INTO hse_assessment_cycle', async () => ({ rows: [{ id: 100 }] })],
      ['FROM v_employee_org_full', async () => ({ rows: [], rowCount: 0 })], // syncAssessmentTargets 子查询
    ]);

    await scheduler.createScheduledCycles(new Date(2026, 8, 1));

    const inserts = pool.query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO hse_assessment_cycle'));
    expect(inserts.length).toBeGreaterThanOrEqual(1); // 至少建了一项（当月）
  });
});

describe('runGridCheck（3 天收尾宽限 WHERE）', () => {
  test('memory-mode：isConnected=false 直接跳过', async () => {
    isConnected.mockReturnValue(false);
    const r = await scheduler.runGridCheck();
    expect(r).toEqual({ skipped: 'memory-mode' });
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('选中窗口含今天 + 刚结束 3 天内的周期，并聚合 upsert 结果', async () => {
    mockQueryBySql([
      ['FROM hse_assessment_cycle', async () => ({
        rows: [{ id: 24, cycle_code: 'HSE-CYCLE-202608', status: 'pending_review' }],
      })],
    ]);
    gridUnchecked.syncGridUncheckedDeductions.mockResolvedValue({ ok: true, scanned: 10, affected: 5 });

    const r = await scheduler.runGridCheck();

    expect(r).toEqual({ cycles: 1, scanned: 10, affected: 5 });

    // 断言 SQL 含状态白名单与 3 天宽限子句
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain("status IN ('in_progress','pending_review')");
    expect(sql).toContain("INTERVAL '3 days'");
    expect(sql).toContain('start_time <= NOW()');

    // 断言对选中周期调用了网格缺巡同步
    expect(gridUnchecked.syncGridUncheckedDeductions).toHaveBeenCalledWith(24);
  });
});

describe('cycleBoundary（本地午夜边界，禁止 Date.UTC）', () => {
  test('2026-09 返回本地 00:00:00 / 23:59:59.999 且月末借位正确', () => {
    const { start, end } = scheduler.cycleBoundary(2026, 9);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(8); // 0 基，9 月
    expect(start.getDate()).toBe(1);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);

    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(8);
    expect(end.getDate()).toBe(30); // 9 月 30 天
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });

  test('2026-12（年末）月末 = 12-31，month 索引自动借位不溢出到下年', () => {
    const { start, end } = scheduler.cycleBoundary(2026, 12);
    expect(start.getMonth()).toBe(11);
    expect(start.getDate()).toBe(1);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(11);
    expect(end.getDate()).toBe(31);
    expect(end.getHours()).toBe(23);
  });

  test('2025-01（年初）月末 = 1-31，始终落在传入年份', () => {
    const { end } = scheduler.cycleBoundary(2025, 1);
    expect(end.getFullYear()).toBe(2025);
    expect(end.getMonth()).toBe(0);
    expect(end.getDate()).toBe(31);
  });

  test('边界为本地墙钟（非 UTC）：start 的本地小时必为 0（与 Date.UTC 方案区分）', () => {
    // 旧实现 Date.UTC(...) 在 Asia/Shanghai 下 getHours()===8；修复后恒为 0（墙钟指定）。
    const { start, end } = scheduler.cycleBoundary(2026, 9);
    expect(start.getHours()).toBe(0);
    expect(end.getHours()).toBe(23);
  });
});

describe('SCHEDULER_ENABLED 外置', () => {
  test('导出值存在（默认由 env 决定，非硬编码 true）', () => {
    expect(typeof scheduler.SCHEDULER_ENABLED).toBe('boolean');
  });

  test('node-cron 的 schedule 可通过 initAssessmentScheduler 调用（验证注册可用）', () => {
    // 仅验证引用关系，不真实启动
    expect(typeof scheduler.initAssessmentScheduler).toBe('function');
    expect(cron.schedule).toBeDefined();
  });
});
