/**
 * 测试：services/ruleEngine/deductionWriter.js
 * 覆盖：幂等 upsert 状态机（inserted/noop/updated/revived/locked）与 revoke（none/locked/removed），
 *      以及 dryRun 不写库。
 *
 * 隔离约定（遵循 jest.config.js）：mock config/db 的 pool，mock assessmentScoringEngine，
 * 全程不连接真实数据库。
 */

// mock 需在 require 被测模块之前声明
jest.mock('../../../config/db', () => ({
  pool: { query: jest.fn() },
  isConnected: jest.fn(() => true),
}));

jest.mock('../../assessmentScoringEngine', () => ({
  ensureTargetScoreRecord: jest.fn(async () => 1001),
}));

const { pool } = require('../../../config/db');
const engine = require('../../assessmentScoringEngine');
const { createDeductionWriter, stableStringify } = require('../deductionWriter');

const SOURCE_TABLE = 'grid_inspection_records';
const KIND = 'grid_unchecked_monthly';

function makeWriter() {
  return createDeductionWriter({
    sourceTable: SOURCE_TABLE,
    kind: KIND,
    deductKeyFn: ({ cycleId, employeeId }) => `grid-unchecked:${cycleId}:${employeeId}`,
  });
}

/** 构造一次 upsert 所需的入参 */
function makeIntent(overrides = {}) {
  return {
    cycleId: 24,
    targetId: 55,
    employeeId: 7643,
    metricId: 12,
    metricCode: 'HSE-KPI-SAF-004',
    score: 3,
    item: '未检查',
    detail: { expected: 30, actual: 27, missing: 3, summary: '未检查（本月应巡30次/实巡27次/缺3次）' },
    ...overrides,
  };
}

/** 期望写入库中的 detail（含 kind/deductKey 前缀字段） */
function expectedDetail(intent) {
  return {
    kind: KIND,
    deductKey: `grid-unchecked:${intent.cycleId}:${intent.employeeId}`,
    ...intent.detail,
  };
}

beforeEach(() => {
  pool.query.mockReset();
  engine.ensureTargetScoreRecord.mockClear();
});

describe('deductionWriter · upsert 状态机', () => {
  it('无既有行 → inserted，INSERT 参数含 source_table/kind/deductKey/pending/current_version=1', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })            // findExisting
      .mockResolvedValueOnce({ rows: [{ id: 999 }] }); // INSERT ... RETURNING

    const writer = makeWriter();
    const action = await writer.upsert(makeIntent());

    expect(action).toBe('inserted');

    // 第二条语句是 INSERT，校验其 SQL 与位置参数
    // 参数顺序：score_id, target_id, cycle_id, metric_id, metric_code, deduction_item,
    //          source_table, source_detail, suggested_score
    // 其余（deduction_type='auto_deduction' / deduction_source='auto' / current_version=1 /
    //      review_status='pending' / source_id=NULL / is_transmission=FALSE / is_deleted=FALSE）均为 SQL 字面量
    const insertCall = pool.query.mock.calls[1];
    const sql = insertCall[0];
    const params = insertCall[1];
    expect(sql).toContain('INSERT INTO hse_assessment_deduction');
    expect(params[0]).toBe(1001);                        // score_id（来自 ensureTargetScoreRecord）
    expect(params[1]).toBe(55);                          // target_id
    expect(params[2]).toBe(24);                          // cycle_id
    expect(params[5]).toBe('未检查');                     // deduction_item
    expect(params[6]).toBe(SOURCE_TABLE);                // source_table
    expect(params[7]).toBeNull();                       // 月度模式 source_id 固定 NULL（参数占位 $8）
    expect(params[8]).toEqual(expectedDetail(makeIntent())); // source_detail（$9）
    expect(params[8].kind).toBe(KIND);
    expect(params[8].deductKey).toBe('grid-unchecked:24:7643');
    expect(params[9]).toBe(3);                           // suggested_score（$10）
    // 关键字面量：类型/来源/版本/初始状态
    expect(sql).toContain("'auto_deduction'");
    expect(sql).toContain("'auto'");
    expect(sql).toMatch(/VALUES[^)]*,\s*1\s*,\s*'pending'/s); // current_version=1, review_status='pending'
  });

  it('同分同 detail（键序不同也算同） → noop，且不执行写操作', async () => {
    const intent = makeIntent();
    // 键序故意打乱，验证稳定化比较
    const shuffled = {};
    for (const k of Object.keys(expectedDetail(intent)).reverse()) {
      shuffled[k] = expectedDetail(intent)[k];
    }
    pool.query.mockResolvedValueOnce({
      rows: [{
        id: 999,
        suggested_score: intent.score,
        confirmed_score: null,
        review_status: 'pending',
        is_deleted: false,
        source_detail: shuffled,
      }],
    });

    const writer = makeWriter();
    const action = await writer.upsert(intent);

    expect(action).toBe('noop');
    // 只有一次 SELECT（findExisting），无 INSERT/UPDATE
    // 注：ensureTargetScoreRecord 在判断写入分支之前调用（既有设计，幂等无副作用），故此处不断言其未被调用
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][0]).toContain('SELECT');
  });

  it('分数变化 → updated，UPDATE 写入新分数与新 detail', async () => {
    const intent = makeIntent({ score: 5 });
    pool.query
      .mockResolvedValueOnce({
        rows: [{
          id: 999,
          suggested_score: 3,
          confirmed_score: null,
          review_status: 'pending',
          is_deleted: false,
          source_detail: expectedDetail(makeIntent({ score: 3 })),
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const writer = makeWriter();
    const action = await writer.upsert(intent);

    expect(action).toBe('updated');
    const updateCall = pool.query.mock.calls[1];
    expect(updateCall[0]).toContain('UPDATE hse_assessment_deduction');
    expect(updateCall[1][0]).toBe(5);
    expect(updateCall[1][2]).toBe(999);
  });

  it('软删行 → revived（is_deleted=FALSE、review_status 重置 pending、confirmed_score 清空）', async () => {
    const intent = makeIntent();
    pool.query
      .mockResolvedValueOnce({
        rows: [{
          id: 999,
          suggested_score: 3,
          confirmed_score: 7,
          review_status: 'rejected',
          is_deleted: true,
          source_detail: expectedDetail(intent),
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const writer = makeWriter();
    const action = await writer.upsert(intent);

    expect(action).toBe('revived');
    const sql = pool.query.mock.calls[1][0];
    const params = pool.query.mock.calls[1][1];
    expect(sql).toContain('is_deleted = FALSE');
    expect(sql).toContain("review_status = 'pending'");
    expect(sql).toContain('confirmed_score = NULL');
    expect(params[2]).toBeNull();                       // 月度模式 source_id 参数占位 = NULL
    expect(params[3]).toBe(999);                         // WHERE id = $4
  });

  it.each(['approved', 'adjusted'])('人工锁定 review_status=%s → locked 且不执行 UPDATE/INSERT', async (lockedStatus) => {
    pool.query.mockResolvedValueOnce({
      rows: [{
        id: 999,
        suggested_score: 3,
        confirmed_score: 2,
        review_status: lockedStatus,
        is_deleted: false,
        source_detail: expectedDetail(makeIntent()),
      }],
    });

    const writer = makeWriter();
    const action = await writer.upsert(makeIntent({ score: 9 }));

    expect(action).toBe('locked');
    expect(pool.query).toHaveBeenCalledTimes(1); // 仅 findExisting
    expect(engine.ensureTargetScoreRecord).not.toHaveBeenCalled();
  });

  it('dryRun 不写库，一律返回 noop', async () => {
    const writer = makeWriter();
    const action = await writer.upsert(makeIntent(), { dryRun: true });

    expect(action).toBe('noop');
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('deductionWriter · revoke', () => {
  it('无既有行 → none', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const writer = makeWriter();
    expect(await writer.revoke({ cycleId: 24, targetId: 55, employeeId: 7643 })).toBe('none');
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it.each(['approved', 'adjusted'])('锁定行 → locked 且不软删', async (lockedStatus) => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 999, review_status: lockedStatus, is_deleted: false, source_detail: {} }],
    });
    const writer = makeWriter();
    expect(await writer.revoke({ cycleId: 24, targetId: 55, employeeId: 7643 })).toBe('locked');
    expect(pool.query).toHaveBeenCalledTimes(1); // 无 UPDATE
  });

  it('普通行 → removed（软删）', async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [{ id: 999, review_status: 'pending', is_deleted: false, source_detail: {} }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const writer = makeWriter();
    expect(await writer.revoke({ cycleId: 24, targetId: 55, employeeId: 7643 })).toBe('removed');

    const sql = pool.query.mock.calls[1][0];
    expect(sql).toContain('is_deleted = TRUE');
    expect(pool.query.mock.calls[1][1][0]).toBe(999);
  });

  it('dryRun 预演返回 removed 但不写库', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 999, review_status: 'pending', is_deleted: false, source_detail: {} }],
    });
    const writer = makeWriter();
    expect(await writer.revoke({ cycleId: 24, targetId: 55, employeeId: 7643 }, { dryRun: true })).toBe('removed');
    expect(pool.query).toHaveBeenCalledTimes(1); // 仅查询，无 UPDATE
  });
});

describe('stableStringify', () => {
  it('键序不同但内容相同 → 字符串一致', () => {
    expect(stableStringify({ a: 1, b: { c: 2, d: 3 } })).toBe(stableStringify({ b: { d: 3, c: 2 }, a: 1 }));
  });
  it('内容不同 → 字符串不同', () => {
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }));
  });
});

describe('createDeductionWriter 参数校验', () => {
  it.each([
    [{ kind: KIND, deductKeyFn: () => 'k' }, '缺少 sourceTable'],
    [{ sourceTable: SOURCE_TABLE, deductKeyFn: () => 'k' }, '缺少 kind'],
    [{ sourceTable: SOURCE_TABLE, kind: KIND }, '缺少 deductKeyFn'],
  ])('必填参数缺失时抛错（%s）', (cfg) => {
    expect(() => createDeductionWriter(cfg)).toThrow();
  });
});

// ============================================================
// 事件模式（violation_record）：一条源记录 = 一条扣分，按 source_id 幂等
// ============================================================
const EVENT_SOURCE_TABLE = 'violation_records';
const EVENT_KIND = 'violation_event';

function makeEventWriter() {
  return createDeductionWriter({
    sourceTable: EVENT_SOURCE_TABLE,
    kind: EVENT_KIND,
    deductKeyFn: ({ cycleId, sourceId }) => `violation:${cycleId}:${sourceId}`,
    idempotency: 'event',
  });
}

function makeEventIntent(overrides = {}) {
  return {
    cycleId: 24,
    targetId: 55,
    employeeId: 7643,
    metricId: 12,
    metricCode: 'HSE-KPI-SAF-001',
    score: 5, // 公司查处
    item: '三违1次（公司查处）',
    detail: {
      sourceId: '901',
      violationDate: '2026-08-10',
      checkSource: 'company',
      checkSourceText: '公司查处',
      rawScore: 5,
      summary: '三违1次（公司查处，2026-08-10）',
    },
    sourceId: '901',
    ...overrides,
  };
}

function expectedEventDetail(intent) {
  return { kind: EVENT_KIND, deductKey: `violation:${intent.cycleId}:${intent.sourceId}`, ...intent.detail };
}

describe('deductionWriter · 事件模式（source_id 幂等）', () => {
  it('无既有行 → inserted，INSERT 写入真实 source_id（参数 $8）与 kind/deductKey', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })            // findEventExisting（按 source_id）
      .mockResolvedValueOnce({ rows: [{ id: 9011 }] }); // INSERT ... RETURNING

    const writer = makeEventWriter();
    const action = await writer.upsert(makeEventIntent());

    expect(action).toBe('inserted');
    const insertCall = pool.query.mock.calls[1];
    const sql = insertCall[0];
    const params = insertCall[1];
    expect(sql).toContain('INSERT INTO hse_assessment_deduction');
    expect(params[6]).toBe(EVENT_SOURCE_TABLE);          // source_table
    expect(params[7]).toBe('901');                       // 真实 source_id（事件模式按源记录定位）
    expect(params[8]).toEqual(expectedEventDetail(makeEventIntent())); // source_detail
    expect(params[8].kind).toBe(EVENT_KIND);
    expect(params[8].deductKey).toBe('violation:24:901');
    expect(params[9]).toBe(5);                            // suggested_score
  });

  it('同 source_id 重跑 → noop（事件幂等：不重复插入）', async () => {
    const intent = makeEventIntent();
    pool.query.mockResolvedValueOnce({
      rows: [{
        id: 9011,
        suggested_score: 5,
        confirmed_score: null,
        review_status: 'pending',
        is_deleted: false,
        source_id: '901',
        source_detail: expectedEventDetail(intent),
      }],
    });

    const writer = makeEventWriter();
    const action = await writer.upsert(intent);

    expect(action).toBe('noop');
    expect(pool.query).toHaveBeenCalledTimes(1); // 仅 findEventExisting
  });

  it('分数变化（公司查处 5 → 乡镇查处 1） → updated', async () => {
    const intent = makeEventIntent({ score: 1, item: '三违1次', detail: { ...makeEventIntent().detail, checkSource: 'township', checkSourceText: '乡镇查处', rawScore: 1, summary: '三违1次（乡镇查处，2026-08-10）' } });
    pool.query
      .mockResolvedValueOnce({
        rows: [{
          id: 9011,
          suggested_score: 5,
          confirmed_score: null,
          review_status: 'pending',
          is_deleted: false,
          source_detail: expectedEventDetail(makeEventIntent({ score: 5 })),
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const writer = makeEventWriter();
    const action = await writer.upsert(intent);

    expect(action).toBe('updated');
    const updateCall = pool.query.mock.calls[1];
    expect(updateCall[0]).toContain('UPDATE hse_assessment_deduction');
    expect(updateCall[1][0]).toBe(1); // 新分数
  });

  it('revoke 按 source_id 定位（即便 employeeId 不同，仍命中同一源记录）', async () => {
    // 既有行 source_id='901'，本次撤销用不同 employeeId 但同一 sourceId
    pool.query
      .mockResolvedValueOnce({
        rows: [{ id: 9011, review_status: 'pending', is_deleted: false, source_detail: { sourceId: '901' } }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const writer = makeEventWriter();
    const action = await writer.revoke({ cycleId: 24, targetId: 55, employeeId: 99999, sourceId: '901' });

    expect(action).toBe('removed');
    const sql = pool.query.mock.calls[1][0];
    expect(sql).toContain('is_deleted = TRUE');
    // 定位 SELECT 必须带 source_id 条件
    expect(pool.query.mock.calls[0][0]).toContain('source_id = $4');
  });

  it.each(['approved', 'adjusted'])('事件模式锁定行 revoke → locked 不软删', async (lockedStatus) => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 9011, review_status: lockedStatus, is_deleted: false, source_detail: { sourceId: '901' } }],
    });
    const writer = makeEventWriter();
    const action = await writer.revoke({ cycleId: 24, targetId: 55, employeeId: 7643, sourceId: '901' });
    expect(action).toBe('locked');
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// 事件幂等补 kind 维度（提示词-07 任务 A）：两个事件适配器共用 violation_records
// 时，必须按 source_detail->>'kind' 隔离，避免互相误判「已存在」。
// ============================================================
const EVENT_KIND_B = 'violation_unrectified';

function makeEventWriterB() {
  return createDeductionWriter({
    sourceTable: EVENT_SOURCE_TABLE,
    kind: EVENT_KIND_B,
    deductKeyFn: ({ cycleId, sourceId }) => `violation-unrectified:${cycleId}:${sourceId}`,
    idempotency: 'event',
  });
}

describe('deductionWriter · 事件幂等补 kind 维度（提示词-07 A）', () => {
  it('同 (target,cycle,source_table,source_id) 但 kind 不同 → 视为两条不同扣分（各自 upsert 不互相命中）', async () => {
    pool.query.mockImplementation(async (sql, params) => {
      if (sql.trim().toUpperCase().startsWith('SELECT') && sql.includes('source_id = $4')) {
        // 仅当 kind='violation_event' 时模拟既有行（即 A 适配器的行）
        if (params[4] === 'violation_event') {
          return { rows: [{ id: 9011, suggested_score: 5, confirmed_score: null, review_status: 'pending', is_deleted: false, source_id: '901', source_detail: expectedEventDetail(makeEventIntent()) }] };
        }
        return { rows: [] };
      }
      return { rows: [{ id: 999 }] }; // INSERT RETURNING
    });

    const writerA = makeEventWriter();   // kind='violation_event'
    const writerB = makeEventWriterB();  // kind='violation_unrectified'
    const intent = makeEventIntent();    // sourceId='901'

    // A 适配器命中既有行 → noop
    expect(await writerA.upsert(intent)).toBe('noop');
    // B 适配器同 source_id 但 kind 不同 → 视为不同扣分 → inserted（不命中 A 的行）
    const actionB = await writerB.upsert(intent);
    expect(actionB).toBe('inserted');

    const insertCall = pool.query.mock.calls.find((c) => c[0].includes('INSERT INTO hse_assessment_deduction'));
    expect(insertCall).toBeTruthy();
    expect(insertCall[1][8].kind).toBe(EVENT_KIND_B); // 写入 kind 隔离的扣分行
  });

  it('同 kind 同 source_id 重跑 → 幂等 noop，且定位 SQL 含 kind 过滤', async () => {
    let capturedSql, capturedParams;
    pool.query.mockImplementation(async (sql, params) => {
      if (sql.trim().toUpperCase().startsWith('SELECT') && sql.includes('source_id = $4')) {
        capturedSql = sql;
        capturedParams = params;
        return { rows: [{ id: 9011, suggested_score: 5, confirmed_score: null, review_status: 'pending', is_deleted: false, source_id: '901', source_detail: expectedEventDetail(makeEventIntent()) }] };
      }
      return { rows: [] };
    });

    const writer = makeEventWriter();
    expect(await writer.upsert(makeEventIntent())).toBe('noop');
    expect(capturedSql).toContain("source_detail ->> 'kind' = $5");
    expect(capturedParams[4]).toBe('violation_event');
  });

  it('月度模式行为不受影响（回归）：仍走 monthly 查询（含 deductKey），不含事件式 source_id=$4 匹配', async () => {
    let monthlySql;
    pool.query.mockImplementation(async (sql) => {
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        monthlySql = sql;
        return { rows: [] }; // 无既有行 → inserted
      }
      return { rows: [{ id: 999 }] }; // INSERT RETURNING
    });

    const writer = makeWriter(); // 月度（grid_unchecked）
    expect(await writer.upsert(makeIntent())).toBe('inserted');
    expect(monthlySql).toContain("source_detail ->> 'deductKey' = $5");
    expect(monthlySql).not.toContain('source_id = $4'); // 月度不按 source_id 幂等
  });
});
