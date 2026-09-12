/**
 * 测试：services/ruleEngine/adapters/violationUnrectifiedAdapter.js（提示词-07 任务 B 备建）
 * 覆盖：
 *   - 纯函数：buildDeductKey / buildItem / buildDetail / buildReportDetail
 *   - ensureMetric：METRIC_CODE=null → 返回 {code:null,id:null} 且零写库
 *   - scan 候选 SQL 过滤条件（need_rectification='是' / 未整改三态 / violator_id 非空 / 月窗口）
 *   - scan 计分口径：需整改未整改命中→1 分、非考核对象 skip、无日期 skip、scanned/assessed 口径
 *   - scan 撤销：记录离开候选集→revoke；换人 revoke；未换人不误撤销；历史行无 employeeId 跳过
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
const adapter = require('../adapters/violationUnrectifiedAdapter');

const RULE = {
  ruleName: '检查未反馈',
  category: '三违管理',
  deductScore: 1,
  metricCode: null, // 激活前未映射
};

function makeCycle() {
  return { id: 24, assessment_year: 2026, assessment_month: 8, status: 'pending_review' };
}

function utcDate(s) {
  return new Date(`${s}T00:00:00Z`);
}

beforeEach(() => {
  pool.query.mockReset();
  engine.findMetricByCode.mockReset();
  engine.findAssessmentTarget.mockReset();
});

describe('violationUnrectifiedAdapter · 纯函数', () => {
  it('buildDeductKey = violation-unrectified:{cycleId}:{sourceId}', () => {
    expect(adapter.buildDeductKey({ cycleId: 24, sourceId: '901' })).toBe('violation-unrectified:24:901');
  });

  it('buildItem = 检查未反馈/未整改1次', () => {
    expect(adapter.buildItem()).toBe('检查未反馈/未整改1次');
    expect(adapter.buildItem({ checkSource: 'company' })).toBe('检查未反馈/未整改1次');
  });

  it('buildDetail 含 kind/sourceId/violationDate/needRectification/cap/cappedScore', () => {
    const detail = adapter.buildDetail(
      { cycleId: 24, sourceId: '901', employeeId: 7643, targetId: 55, violationDate: '2026-08-10', needRectification: '是', rawScore: 1 },
      { cap: { cap: 15, cappedScore: 1, otherCatScore: 0 }, cappedScore: 1, otherCatScore: 0 }
    );
    expect(detail.kind).toBe('violation_unrectified');
    expect(detail.deductKey).toBe('violation-unrectified:24:901');
    expect(detail.sourceId).toBe('901');
    expect(detail.employeeId).toBe(7643);
    expect(detail.targetId).toBe(55);
    expect(detail.violationDate).toBe('2026-08-10');
    expect(detail.needRectification).toBe('是');
    expect(detail.cappedScore).toBe(1);
    expect(detail.summary).toContain('检查未反馈/未整改1次');
  });

  it('buildReportDetail：deduct / revoke / capped-out 三种形态', () => {
    const base = { employeeId: 7643, employeeName: '张三', needRectification: '是', rawScore: 1 };
    expect(adapter.buildReportDetail(base, { type: 'deduct', action: 'inserted', cappedScore: 1 }))
      .toEqual({ ...base, cappedScore: 1, action: 'inserted' });
    expect(adapter.buildReportDetail(base, { type: 'revoke', action: 'removed' }))
      .toEqual({ ...base, cappedScore: 0, action: 'removed' });
    expect(adapter.buildReportDetail(base, { type: 'capped-out', action: 'capped-out' }))
      .toEqual({ ...base, cappedScore: 0, cappedOut: true, action: 'capped-out' });
  });
});

describe('violationUnrectifiedAdapter · ensureMetric（激活前）', () => {
  it('METRIC_CODE=null → 返回 {code:null,id:null} 且不写库', async () => {
    const m = await adapter.ensureMetric(null);
    expect(m).toEqual({ code: null, id: null });
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('violationUnrectifiedAdapter · scan 候选 SQL 过滤', () => {
  it('候选查询含 need_rectification=是 / 未整改三态 / violator_id 非空 / 月窗口', async () => {
    engine.findAssessmentTarget.mockResolvedValue({ id: 55, employee_name: '张三' });
    pool.query
      .mockResolvedValueOnce({ rows: [] }) // ① 候选
      .mockResolvedValueOnce({ rows: [] }) // ② 无日期
      .mockResolvedValueOnce({ rows: [] }); // ③ 既有扣分

    await adapter.scan({ cycle: makeCycle(), year: 2026, month: 8, rule: RULE, dryRun: false });

    const candSql = pool.query.mock.calls[0][0];
    expect(candSql).toContain("need_rectification = '是'");
    expect(candSql).toContain('violator_id IS NOT NULL');
    expect(candSql).toContain('rectification IS NULL');
    expect(candSql).toContain("btrim(rectification) = ''");
    expect(candSql).toContain('rectification_time IS NULL');
    // 月窗口
    expect(candSql).toContain('make_date($1,$2,1)');
    expect(candSql).toContain("INTERVAL '1 month'");
    // 撤销集查询按本 kind 隔离
    const existSql = pool.query.mock.calls[2][0];
    expect(existSql).toContain("source_detail ->> 'kind' = $3");
  });
});

describe('violationUnrectifiedAdapter · scan 计分口径与跳过', () => {
  it('需整改未整改命中→1 分；非考核对象与无日期跳过；口径 scanned=1 assessed=1', async () => {
    engine.findAssessmentTarget.mockImplementation(async (cycleId, employeeId) =>
      employeeId === 7643 ? { id: 55, employee_name: '张三' } : null
    );
    pool.query
      .mockResolvedValueOnce({
        // ① 候选：901 命中（需整改未整改），902 属非考核对象
        rows: [
          { id: 901, violator_id: 7643, violator_name: '张三', need_rectification: '是', rectification: null, rectification_time: null, violation_date: utcDate('2026-08-10') },
          { id: 902, violator_id: 8888, violator_name: '李四', need_rectification: '是', rectification: null, rectification_time: null, violation_date: utcDate('2026-08-12') },
        ],
      })
      .mockResolvedValueOnce({
        // ② 无日期记录（跳过）
        rows: [{ violator_id: 7777, violator_name: '王五' }],
      })
      .mockResolvedValueOnce({ rows: [] }); // ③ 既有扣分

    const res = await adapter.scan({ cycle: makeCycle(), year: 2026, month: 8, rule: RULE, dryRun: false });

    expect(res.intents.length).toBe(1);
    expect(res.intents[0].sourceId).toBe('901');
    expect(res.intents[0].rawScore).toBe(1); // 统一 1 分/条
    expect(res.intents[0].eventType).toBe('VIOLATION_UNRECTIFIED');
    expect(res.skipped.some((s) => s.employeeId === 8888 && s.reason === 'not-assessment-target')).toBe(true);
    expect(res.skipped.some((s) => s.employeeId === 7777 && s.reason === 'no-date')).toBe(true);
    expect(res.scanned).toBe(2); // 本月窗口去重违规人数（7643、8888）
    expect(res.assessed).toBe(1);
    expect(res.metric).toEqual({ code: null, id: null });
  });

  it('有效未整改候选 → 产出 intent 并透传 needRectification / rectificationTime（已整改由候选 SQL 排除，见 SQL 过滤测试）', async () => {
    engine.findAssessmentTarget.mockResolvedValue({ id: 55, employee_name: '张三' });
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 901, violator_id: 7643, violator_name: '张三', need_rectification: '是', rectification: null, rectification_time: null, violation_date: utcDate('2026-08-10') }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await adapter.scan({ cycle: makeCycle(), year: 2026, month: 8, rule: RULE, dryRun: false });
    expect(res.intents.length).toBe(1);
    expect(res.intents[0].needRectification).toBe('是');
    expect(res.intents[0].rectification).toBeNull();
    expect(res.intents[0].rectificationTime).toBeNull();
    expect(res.scanned).toBe(1);
  });
});

describe('violationUnrectifiedAdapter · scan 撤销', () => {
  it('记录离开候选集（整改后） → 既有扣分 source_id 不在有效集 → revocation', async () => {
    engine.findAssessmentTarget.mockResolvedValue({ id: 55, employee_name: '张三' });
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 901, violator_id: 7643, violator_name: '张三', need_rectification: '是', rectification: null, rectification_time: null, violation_date: utcDate('2026-08-10') }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 551, target_id: 55, source_id: '999', source_detail: { employeeId: 7643, employeeName: '张三' } }] });

    const res = await adapter.scan({ cycle: makeCycle(), year: 2026, month: 8, rule: RULE, dryRun: false });
    expect(res.intents.length).toBe(1);
    expect(res.revocations.length).toBe(1);
    expect(res.revocations[0].sourceId).toBe('999');
  });

  it('换人撤销：violator_id 由 A 改挂 B → A 的旧扣分 revoke，B 产出新 intent', async () => {
    engine.findAssessmentTarget.mockImplementation(async (cycleId, employeeId) =>
      employeeId === 7643 ? { id: 55, employee_name: '张三' } : employeeId === 8888 ? { id: 66, employee_name: '李四' } : null
    );
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 901, violator_id: 8888, violator_name: '李四', need_rectification: '是', rectification: null, rectification_time: null, violation_date: utcDate('2026-08-10') }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 551, target_id: 55, source_id: '901', source_detail: { employeeId: 7643, employeeName: '张三' } }] });

    const res = await adapter.scan({ cycle: makeCycle(), year: 2026, month: 8, rule: RULE, dryRun: false });
    expect(res.intents.length).toBe(1);
    expect(res.intents[0].employeeId).toBe(8888);
    expect(res.intents[0].targetId).toBe(66);
    expect(res.revocations.length).toBe(1);
    expect(res.revocations[0].employeeId).toBe(7643);
  });

  it('未换人不误撤销：记录仍在同人名下 → 不产出 revocation', async () => {
    engine.findAssessmentTarget.mockResolvedValue({ id: 55, employee_name: '张三' });
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 901, violator_id: 7643, violator_name: '张三', need_rectification: '是', rectification: null, rectification_time: null, violation_date: utcDate('2026-08-10') }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 551, target_id: 55, source_id: '901', source_detail: { employeeId: 7643, employeeName: '张三' } }] });

    const res = await adapter.scan({ cycle: makeCycle(), year: 2026, month: 8, rule: RULE, dryRun: false });
    expect(res.intents.length).toBe(1);
    expect(res.revocations.length).toBe(0);
  });

  it('历史行无 employeeId → 跳过换人判定，不误撤销', async () => {
    engine.findAssessmentTarget.mockImplementation(async (cycleId, employeeId) =>
      employeeId === 8888 ? { id: 66, employee_name: '李四' } : null
    );
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 901, violator_id: 8888, violator_name: '李四', need_rectification: '是', rectification: null, rectification_time: null, violation_date: utcDate('2026-08-10') }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 551, target_id: 55, source_id: '901', source_detail: { employeeName: '张三' } }] });

    const res = await adapter.scan({ cycle: makeCycle(), year: 2026, month: 8, rule: RULE, dryRun: false });
    expect(res.intents.length).toBe(1);
    expect(res.revocations.length).toBe(0);
  });
});
