/**
 * 测试：services/ruleEngine/adapters/violationAdapter.js
 * 覆盖：
 *   - 纯函数：buildDeductKey / checkSourceText / buildItem / buildDetail / buildReportDetail
 *   - ensureMetric：已有指标复用 / 缺失补建
 *   - scan：公司查处→5 分、乡镇/自查/未标注→1 分、非考核对象 skip、无日期 skip
 *   - scan 撤销（A2）：记录软删 → revoke；violator_id 换人 → 旧扣分 revoke；
 *                     未换人不误撤销；历史行无 employeeId 跳过换人判定
 *   - scanned / assessed 口径
 *
 * 隔离约定：mock config/db 的 pool，mock assessmentScoringEngine，全程不连真实库。
 */

jest.mock('../../../config/db', () => ({
  pool: { query: jest.fn() },
  isConnected: jest.fn(() => true),
}));

jest.mock('../../assessmentScoringEngine', () => ({
  findMetricByCode: jest.fn(),
  findAssessmentTarget: jest.fn(),
}));

const { pool } = require('../../../config/db');
const engine = require('../../assessmentScoringEngine');
const adapter = require('../adapters/violationAdapter');

const RULE = {
  ruleName: '自身三违行为',
  category: '三违管理',
  deductScore: 1,
  metricCode: 'HSE-KPI-SAF-001',
};

function makeCycle() {
  return { id: 24, assessment_year: 2026, assessment_month: 8, status: 'pending_review' };
}

// 用 UTC 构造以避免 toISOString 时区偏移
function utcDate(s) {
  return new Date(`${s}T00:00:00Z`);
}

beforeEach(() => {
  pool.query.mockReset();
  engine.findMetricByCode.mockReset();
  engine.findAssessmentTarget.mockReset();
  engine.findMetricByCode.mockResolvedValue({ id: 12, metricCode: 'HSE-KPI-SAF-001' });
});

describe('violationAdapter · 纯函数', () => {
  // E-08-04：键增 employeeId 段（传递下一记录多对象扣分追溯）；缺省 '-'
  it('buildDeductKey = violation:{cycleId}:{sourceId}:{employeeId|-"-"}', () => {
    expect(adapter.buildDeductKey({ cycleId: 24, sourceId: '901' })).toBe('violation:24:901:-');
    expect(adapter.buildDeductKey({ cycleId: 24, sourceId: '901', employeeId: 7643 })).toBe('violation:24:901:7643');
  });

  it('buildItem：公司查处带括号标注，其余仅「三违1次」', () => {
    expect(adapter.buildItem({ checkSource: 'company' })).toBe('三违1次（公司查处）');
    expect(adapter.buildItem({ checkSource: 'township' })).toBe('三违1次');
    expect(adapter.buildItem({ checkSource: 'self' })).toBe('三违1次');
    expect(adapter.buildItem({ checkSource: null })).toBe('三违1次');
  });

  it('buildDetail 含 kind/sourceId/violationDate/checkSource/cap/cappedScore', () => {
    const detail = adapter.buildDetail(
      { cycleId: 24, sourceId: '901', violationDate: '2026-08-10', checkSource: 'company', checkSourceText: '公司查处', rawScore: 5 },
      { cap: { cap: 15, cappedScore: 5, otherCatScore: 0 }, cappedScore: 5, otherCatScore: 0 }
    );
    expect(detail.kind).toBe('violation_event');
    expect(detail.deductKey).toBe('violation:24:901:-'); // E-08-04：键含 employeeId 段（缺省 '-'）
    expect(detail.sourceId).toBe('901');
    expect(detail.violationDate).toBe('2026-08-10');
    expect(detail.checkSource).toBe('company');
    expect(detail.cappedScore).toBe(5);
    expect(detail.summary).toContain('公司查处');
  });

  it('buildReportDetail：deduct / revoke / capped-out 三种形态（E-08-04 增 isTransmission）', () => {
    const base = {
      employeeId: 7643, employeeName: '张三', checkSource: 'company',
      checkSourceText: '公司查处', rawScore: 5,
    };
    const withFlag = { ...base, isTransmission: false };
    expect(adapter.buildReportDetail(base, { type: 'deduct', action: 'inserted', cappedScore: 5 }))
      .toEqual({ ...withFlag, cappedScore: 5, action: 'inserted' });
    expect(adapter.buildReportDetail(base, { type: 'revoke', action: 'removed' }))
      .toEqual({ ...withFlag, cappedScore: 0, action: 'removed' });
    expect(adapter.buildReportDetail(base, { type: 'capped-out', action: 'capped-out' }))
      .toEqual({ ...withFlag, cappedScore: 0, cappedOut: true, action: 'capped-out' });
  });
});

describe('violationAdapter · ensureMetric', () => {
  it('规则配的 metric_code 已存在 → 直接复用', async () => {
    engine.findMetricByCode.mockResolvedValueOnce({ id: 12, metricCode: 'HSE-KPI-SAF-001' });
    const m = await adapter.ensureMetric('HSE-KPI-SAF-001');
    expect(m).toEqual({ code: 'HSE-KPI-SAF-001', id: 12 });
    expect(pool.query).not.toHaveBeenCalled(); // 不插入
  });

  it('指标不存在 → 补建 HSE-KPI-SAF-001 并返回新 id', async () => {
    engine.findMetricByCode
      .mockResolvedValueOnce(null)   // rule.metricCode 不存在（兜底到常量）
      .mockResolvedValueOnce(null);  // 常量 METRIC_CODE 也不存在
    pool.query.mockResolvedValueOnce({ rows: [{ id: 77 }] }); // INSERT ... RETURNING id
    const m = await adapter.ensureMetric('NOPE');
    expect(m).toEqual({ code: 'HSE-KPI-SAF-001', id: 77 });
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][0]).toContain('INSERT INTO hse_assessment_metric');
  });
});

describe('violationAdapter · scan 计分口径', () => {
  it('公司查处 5 分 / 乡镇查处 1 分 / 未标注 1 分；非考核对象与无日期跳过；口径 scanned=2 assessed=1', async () => {
    // findAssessmentTarget：7643 是考核对象，8888 不是
    engine.findAssessmentTarget.mockImplementation(async (cycleId, employeeId) =>
      employeeId === 7643 ? { id: 55, employee_name: '张三' } : null
    );

    pool.query
      .mockResolvedValueOnce({ rows: [{ present: true }] }) // ⓪ vr source_type 列探测（E-06 隔离守卫，仅首 scan 消耗）
      .mockResolvedValueOnce({
        // ① 本月窗口候选
        rows: [
          { id: 901, violator_id: 7643, violator_name: '张三', check_source: 'company', violation_date: utcDate('2026-08-10') },
          { id: 902, violator_id: 7643, violator_name: '张三', check_source: 'township', violation_date: utcDate('2026-08-12') },
          { id: 903, violator_id: 8888, violator_name: '李四', check_source: null, violation_date: utcDate('2026-08-15') },
        ],
      })
      .mockResolvedValueOnce({
        // ② 无日期记录（跳过）
        rows: [
          { violator_id: 7777, violator_name: '王五' },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }); // ③ 既有扣分（无撤销）

    const res = await adapter.scan({ cycle: makeCycle(), year: 2026, month: 8, rule: RULE, dryRun: false });

    // 公司查处 5 分
    const company = res.intents.find((i) => i.sourceId === '901');
    expect(company.rawScore).toBe(5);
    expect(company.checkSourceText).toBe('公司查处');
    // 乡镇查处 1 分
    const township = res.intents.find((i) => i.sourceId === '902');
    expect(township.rawScore).toBe(1);
    // 未标注 1 分（NULL_SCORE）
    expect(res.intents.find((i) => i.sourceId === '903')).toBeUndefined(); // 8888 非考核对象
    // 非考核对象跳过
    expect(res.skipped.some((s) => s.employeeId === 8888 && s.reason === 'not-assessment-target')).toBe(true);
    // 无日期跳过
    expect(res.skipped.some((s) => s.employeeId === 7777 && s.reason === 'no-date')).toBe(true);
    // 口径
    expect(res.scanned).toBe(2); // 7643、8888 去重（7777 无日期不计入 scanned）
    expect(res.assessed).toBe(1); // 仅 7643 命中考核对象
    expect(res.noLedger).toBe(false);
    expect(res.metric).toEqual({ code: 'HSE-KPI-SAF-001', id: 12 });
  });

  it('撤销：既有自动扣分 source_id 不在本月有效集 → 产出 revocation', async () => {
    engine.findAssessmentTarget.mockResolvedValue({ id: 55, employee_name: '张三' });
    pool.query
      .mockResolvedValueOnce({
        // ① 本月窗口：仅 901 有效
        rows: [{ id: 901, violator_id: 7643, violator_name: '张三', check_source: 'company', violation_date: utcDate('2026-08-10') }],
      })
      .mockResolvedValueOnce({ rows: [] }) // ② 无日期
      .mockResolvedValueOnce({
        // ③ 既有扣分：含一条 source_id='999'（记录已软删/改挂），应撤销
        rows: [{ id: 551, target_id: 55, source_id: '999', source_detail: { employeeId: 7643, employeeName: '张三' } }],
      });

    const res = await adapter.scan({ cycle: makeCycle(), year: 2026, month: 8, rule: RULE, dryRun: false });
    expect(res.intents.length).toBe(1);
    expect(res.revocations.length).toBe(1);
    expect(res.revocations[0].sourceId).toBe('999');
    expect(res.revocations[0].targetId).toBe(55);
  });

  it('换人撤销（A2 修复）：violator_id 由 A 改挂 B → A 的旧扣分 revoke，B 产出新 intent', async () => {
    // A=7643（target 55）、B=8888（target 66）均为考核对象
    engine.findAssessmentTarget.mockImplementation(async (cycleId, employeeId) =>
      employeeId === 7643 ? { id: 55, employee_name: '张三' }
        : employeeId === 8888 ? { id: 66, employee_name: '李四' }
          : null
    );
    pool.query
      .mockResolvedValueOnce({
        // ① 本月窗口：901 已改挂 8888（当前 violator_id）
        rows: [{ id: 901, violator_id: 8888, violator_name: '李四', check_source: 'company', violation_date: utcDate('2026-08-10') }],
      })
      .mockResolvedValueOnce({ rows: [] }) // ② 无日期
      .mockResolvedValueOnce({
        // ③ 既有扣分：901 的扣分仍挂在 A(7643) 名下 → 换人，应撤销
        rows: [{ id: 551, target_id: 55, source_id: '901', source_detail: { employeeId: 7643, employeeName: '张三' } }],
      });

    const res = await adapter.scan({ cycle: makeCycle(), year: 2026, month: 8, rule: RULE, dryRun: false });

    // B 产出新 intent
    expect(res.intents.length).toBe(1);
    expect(res.intents[0].sourceId).toBe('901');
    expect(res.intents[0].employeeId).toBe(8888);
    expect(res.intents[0].targetId).toBe(66);
    // A 的旧扣分产出 revocation（换人）
    expect(res.revocations.length).toBe(1);
    expect(res.revocations[0].sourceId).toBe('901');
    expect(res.revocations[0].employeeId).toBe(7643);
    expect(res.revocations[0].targetId).toBe(55);
  });

  it('未换人不误撤销：记录仍在同人名下 → 不产出 revocation', async () => {
    engine.findAssessmentTarget.mockResolvedValue({ id: 55, employee_name: '张三' });
    pool.query
      .mockResolvedValueOnce({
        rows: [{ id: 901, violator_id: 7643, violator_name: '张三', check_source: 'company', violation_date: utcDate('2026-08-10') }],
      })
      .mockResolvedValueOnce({ rows: [] }) // ② 无日期
      .mockResolvedValueOnce({
        // ③ 既有扣分归属与记录当前 violator_id 一致 → 不撤销
        rows: [{ id: 551, target_id: 55, source_id: '901', source_detail: { employeeId: 7643, employeeName: '张三' } }],
      });

    const res = await adapter.scan({ cycle: makeCycle(), year: 2026, month: 8, rule: RULE, dryRun: false });
    expect(res.intents.length).toBe(1);
    expect(res.revocations.length).toBe(0);
  });

  it('历史行无 employeeId → 跳过换人判定，不误撤销', async () => {
    engine.findAssessmentTarget.mockImplementation(async (cycleId, employeeId) =>
      employeeId === 8888 ? { id: 66, employee_name: '李四' } : null
    );
    pool.query
      .mockResolvedValueOnce({
        rows: [{ id: 901, violator_id: 8888, violator_name: '李四', check_source: 'company', violation_date: utcDate('2026-08-10') }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        // ③ 历史行：source_detail 无 employeeId → 不做换人判定
        rows: [{ id: 551, target_id: 55, source_id: '901', source_detail: { employeeName: '张三' } }],
      });

    const res = await adapter.scan({ cycle: makeCycle(), year: 2026, month: 8, rule: RULE, dryRun: false });
    expect(res.intents.length).toBe(1);
    expect(res.revocations.length).toBe(0);
  });

  it('buildDetail 落 employeeId / targetId（换人撤销判定依据）', () => {
    const detail = adapter.buildDetail(
      {
        cycleId: 24, sourceId: '901', employeeId: 7643, targetId: 55,
        ruleName: '自身三违行为', category: '三违管理', violationDate: '2026-08-10',
        checkSource: 'company', checkSourceText: '公司查处', rawScore: 5,
      },
      { cap: 15, cappedScore: 5, otherCatScore: 0 }
    );
    expect(detail.employeeId).toBe(7643);
    expect(detail.targetId).toBe(55);
  });
});
