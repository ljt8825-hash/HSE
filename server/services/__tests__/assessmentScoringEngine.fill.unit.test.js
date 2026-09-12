/**
 * 提示词-11 任务 B2：旧评分路（FILL_SOURCES）刹车开关单测
 *
 * 仅覆盖 fillMissingDeductionsForTarget 的两条旧路（training / accident）的开关行为；
 * mock config/db 的 pool，不连真实库。
 * 注：addAutoDeduction 在模块内以局部绑定调用，jest.spyOn 无法拦截，故统一用通用
 *     pool.query mock 让补扣路径成功落库，并以「INSERT INTO hse_assessment_deduction」
 *     出现次数 + fetch SQL 是否出现 作为断言（等价于"是否产生补扣/否决"）。
 *
 * 关键断言：
 *   - 默认（env 未设）：两路 fetch 均执行，并各产生一次补扣/否决（= 现状，零行为变化）
 *   - LEGACY_TRAINING_FILL=false：training fetch 不被调用、不产生培训补扣
 *   - LEGACY_ACCIDENT_VETO=false：accident fetch 不被调用、不产生否决
 */

jest.mock('../../config/db', () => ({
  pool: { query: jest.fn() },
  isConnected: jest.fn(() => true),
}));

const db = require('../../config/db');

function requireFreshEngine(envOverrides = {}) {
  const saved = {};
  ['LEGACY_TRAINING_FILL', 'LEGACY_ACCIDENT_VETO'].forEach((k) => {
    saved[k] = process.env[k];
    if (envOverrides[k] === undefined) delete process.env[k];
    else process.env[k] = envOverrides[k];
  });
  let mod;
  jest.isolateModules(() => { mod = require('../assessmentScoringEngine'); });
  ['LEGACY_TRAINING_FILL', 'LEGACY_ACCIDENT_VETO'].forEach((k) => {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  });
  return mod;
}

// 默认引擎（env 未设，开关均应为 true = 现状）
const engineDefault = requireFreshEngine();

const CYCLE = { id: 43, start_time: new Date(2026, 8, 1), end_time: new Date(2026, 8, 30, 23, 59, 59, 999) };
const TARGET = { id: 1, employee_id: 'E001' };

// 通用 mock：让补扣路径成功落库；按需返回 training/accident fetch 行
function setupMock({ trainingRows = [], accidentRows = [] }) {
  db.pool.query.mockImplementation(async (sql) => {
    const s = String(sql);
    if (s.includes('training_records')) return { rows: trainingRows };
    if (s.includes('accidents')) return { rows: accidentRows };
    if (s.includes('FROM hse_assessment_deduction WHERE target_id')) return { rows: [] }; // dedBySource
    if (s.includes('INSERT INTO hse_assessment_deduction')) return { rows: [{ id: 99 }] }; // 补扣落库
    if (s.includes('hse_assessment_score')) return { rows: [{ id: 7 }] }; // ensureTargetScoreRecord
    if (s.includes('hse_assessment_metric')) return { rows: [] };
    if (s.includes('v_employee_org_full')) return { rows: [] }; // getTargetDimensions
    return { rows: [] };
  });
}

function insertCount() {
  return db.pool.query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO hse_assessment_deduction')).length;
}
function issuedSqls() {
  return db.pool.query.mock.calls.map((c) => String(c[0]));
}

describe('旧路开关（默认=现状，env 未设）', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMock({
      trainingRows: [{ source_id: 1, ev_date: '2026-09-01' }],
      accidentRows: [{ source_id: 5, accident_type: '交通事故', ev_date: '2026-09-02' }],
    });
  });

  test('training 与 accident fetch 均执行，且各产生一次补扣/否决', async () => {
    const r = await engineDefault.fillMissingDeductionsForTarget(CYCLE, TARGET);
    const sqls = issuedSqls();
    expect(sqls.some((s) => s.includes('training_records'))).toBe(true);
    expect(sqls.some((s) => s.includes('accidents'))).toBe(true);
    expect(insertCount()).toBe(2); // 培训补扣 + 事故否决
    expect(r.added).toBe(2);
  });
});

describe('LEGACY_TRAINING_FILL=false（停用培训补扣路）', () => {
  const engine = requireFreshEngine({ LEGACY_TRAINING_FILL: 'false' });
  beforeEach(() => {
    jest.clearAllMocks();
    setupMock({ accidentRows: [{ source_id: 5, accident_type: '环境污染事故', ev_date: '2026-09-02' }] });
  });

  test('training fetch 不被调用、不产生培训补扣；accident 路仍运行', async () => {
    const r = await engine.fillMissingDeductionsForTarget(CYCLE, TARGET);
    const sqls = issuedSqls();
    expect(sqls.some((s) => s.includes('training_records'))).toBe(false);
    expect(sqls.some((s) => s.includes('accidents'))).toBe(true);
    expect(insertCount()).toBe(1); // 仅事故否决
    expect(r.added).toBe(1);
  });
});

describe('LEGACY_ACCIDENT_VETO=false（停用事故否决路）', () => {
  const engine = requireFreshEngine({ LEGACY_ACCIDENT_VETO: 'false' });
  beforeEach(() => {
    jest.clearAllMocks();
    setupMock({ trainingRows: [{ source_id: 1, ev_date: '2026-09-01' }] });
  });

  test('accident fetch 不被调用、不产生否决；training 路仍运行', async () => {
    const r = await engine.fillMissingDeductionsForTarget(CYCLE, TARGET);
    const sqls = issuedSqls();
    expect(sqls.some((s) => s.includes('accidents'))).toBe(false);
    expect(sqls.some((s) => s.includes('training_records'))).toBe(true);
    expect(insertCount()).toBe(1); // 仅培训补扣
    expect(r.added).toBe(1);
  });
});

describe('两开关同时关闭', () => {
  const engine = requireFreshEngine({ LEGACY_TRAINING_FILL: 'false', LEGACY_ACCIDENT_VETO: 'false' });
  beforeEach(() => {
    jest.clearAllMocks();
    setupMock({});
  });

  test('两条旧路均跳过，无 fetch、无补扣', async () => {
    const r = await engine.fillMissingDeductionsForTarget(CYCLE, TARGET);
    const sqls = issuedSqls();
    expect(sqls.some((s) => s.includes('training_records'))).toBe(false);
    expect(sqls.some((s) => s.includes('accidents'))).toBe(false);
    expect(insertCount()).toBe(0);
    expect(r.added).toBe(0);
  });
});
