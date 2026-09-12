/**
 * 测试：services/ruleEngine/categoryCap.js
 * 覆盖：类别上限读取、allowed/cappedScore 计算、excludeId 当前行排除、
 *       同 kind 多行累加（修复 excludeKind 旧语义漏算）、grid+violation 共存累加、上限缺失降级。
 *
 * 隔离约定（遵循 jest.config.js）：mock config/db 的 pool 与 isConnected，
 * mock assessmentRuleCategoryService.resolveRuleForDeductionRows，全程不连接真实数据库。
 */

jest.mock('../../../config/db', () => ({
  pool: { query: jest.fn() },
  isConnected: jest.fn(() => true),
}));

jest.mock('../../assessmentRuleCategoryService', () => ({
  resolveRuleForDeductionRows: jest.fn(async (rows) =>
    // 默认实现：按 source_detail.ruleName 直接透传为 category，便于测试自定义
    rows.map((d) => ({ deduction: d, ruleName: d.deduction_item, category: d.__category ?? null })),
  ),
  // 任务A新增：人工扣分提示用单条解析（source_detail.category 优先，回退 deduction_item）
  resolveDeductionRule: jest.fn(async (d) =>
    ({ ruleName: d.deduction_item, category: (d.source_detail && d.source_detail.category) || d.__category || null }),
  ),
}));

const { pool, isConnected } = require('../../../config/db');
const { resolveRuleForDeductionRows, resolveDeductionRule } = require('../../assessmentRuleCategoryService');
const { getCategoryCap, getOtherCategoryScore, getValidCategoryScore, applyCap, computeManualCapWarning, roleFromPosition } = require('../categoryCap');

const CATEGORY = '三违管理';
const KIND = 'grid_unchecked_monthly';

beforeEach(() => {
  pool.query.mockReset();
  resolveRuleForDeductionRows.mockClear();
  isConnected.mockReturnValue(true);
});

describe('getCategoryCap', () => {
  it('读到上限 → 返回数值', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ max_deduct: 15 }] });
    expect(await getCategoryCap(CATEGORY)).toBe(15);
  });

  it('未配置（0 行） → Infinity（不设上限）', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    expect(await getCategoryCap(CATEGORY)).toBe(Infinity);
  });

  it('max_deduct 为 NULL → Infinity', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ max_deduct: null }] });
    expect(await getCategoryCap(CATEGORY)).toBe(Infinity);
  });

  it('查询抛异常 → Infinity（不阻断扣分通路）', async () => {
    pool.query.mockRejectedValueOnce(new Error('db down'));
    expect(await getCategoryCap(CATEGORY)).toBe(Infinity);
  });

  it('category 为空 → Infinity 且不查库', async () => {
    expect(await getCategoryCap('')).toBe(Infinity);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('负值上限 → 夹到 0', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ max_deduct: -5 }] });
    expect(await getCategoryCap(CATEGORY)).toBe(0);
  });

  it('按岗位(role)分套读取：管理员 → admin 套', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ max_deduct: 30 }] });
    expect(await getCategoryCap(CATEGORY, pool, 'admin')).toBe(30);
    // 校验查询携带 target_role='admin'
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain('target_role');
    expect(pool.query.mock.calls[0][1]).toEqual([CATEGORY, 'admin']);
  });

  it('按岗位(role)分套读取：缺省/经理 → manager 套', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ max_deduct: 15 }] });
    expect(await getCategoryCap(CATEGORY, pool, 'manager')).toBe(15);
    expect(pool.query.mock.calls[0][1]).toEqual([CATEGORY, 'manager']);
  });
});

describe('roleFromPosition', () => {
  it('管理员 → admin；乡镇作业中心经理/空/未知 → manager', () => {
    expect(roleFromPosition('管理员')).toBe('admin');
    expect(roleFromPosition('乡镇作业中心经理')).toBe('manager');
    expect(roleFromPosition('')).toBe('manager');
    expect(roleFromPosition(null)).toBe('manager');
    expect(roleFromPosition('网格长')).toBe('manager');
  });
});

describe('getOtherCategoryScore', () => {
  it('排除当前行（excludeId）后，同类别其他扣分（含同 kind 多行）全部累加', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        { id: 1, deduction_item: '未检查', source_detail: { kind: KIND }, suggested_score: 9, confirmed_score: null, review_status: 'pending', __category: CATEGORY },
        { id: 2, deduction_item: '三违1次', source_detail: { kind: 'violation_event' }, suggested_score: 4, confirmed_score: null, review_status: 'pending', __category: CATEGORY },
        { id: 3, deduction_item: '培训缺失', source_detail: { kind: 'x' }, suggested_score: 8, confirmed_score: null, review_status: 'pending', __category: 'HSE教育培训' },
      ],
    });

    // 排除 id=1（当前行），应累加 id=2(4)。id=3 属其他类别不计入。
    expect(await getOtherCategoryScore(24, 55, CATEGORY, 1)).toBe(4);
  });

  it('同 kind 多行正确累加（修复 excludeKind 旧语义漏算：一人多次三违应合计受上限约束）', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        { id: 1, deduction_item: 'v1', source_detail: { kind: 'violation_event' }, suggested_score: 5, confirmed_score: null, review_status: 'pending', __category: CATEGORY },
        { id: 2, deduction_item: 'v2', source_detail: { kind: 'violation_event' }, suggested_score: 5, confirmed_score: null, review_status: 'pending', __category: CATEGORY },
        { id: 3, deduction_item: 'v3', source_detail: { kind: 'violation_event' }, suggested_score: 5, confirmed_score: null, review_status: 'pending', __category: CATEGORY },
      ],
    });
    // excludeId=null（当前为新增行）→ 三行全部累加 = 15
    expect(await getOtherCategoryScore(24, 55, CATEGORY, null)).toBe(15);
  });

  it('不同 kind 但同类别的行也累加（grid + violation 共存，仅排除当前行）', async () => {
    // 本用例两次调用 getOtherCategoryScore（excludeId=1 / 2），各需一次查询返回
    const rows = [
      { id: 1, deduction_item: '未检查', source_detail: { kind: KIND }, suggested_score: 9, confirmed_score: null, review_status: 'pending', __category: CATEGORY },
      { id: 2, deduction_item: '三违1次', source_detail: { kind: 'violation_event' }, suggested_score: 4, confirmed_score: null, review_status: 'pending', __category: CATEGORY },
    ];
    pool.query.mockResolvedValueOnce({ rows }).mockResolvedValueOnce({ rows });
    // 排除 id=1（grid 当前行），violation(4) 仍应计入 → 4
    expect(await getOtherCategoryScore(24, 55, CATEGORY, 1)).toBe(4);
    // 排除 id=2（violation 当前行），grid(9) 仍应计入 → 9
    expect(await getOtherCategoryScore(24, 55, CATEGORY, 2)).toBe(9);
  });

  it('approved/adjusted 取 confirmed_score，pending 取 suggested_score', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        { id: 10, deduction_item: 'a', source_detail: {}, suggested_score: 1, confirmed_score: 5, review_status: 'approved', __category: CATEGORY },
        { id: 11, deduction_item: 'b', source_detail: {}, suggested_score: 2, confirmed_score: 6, review_status: 'adjusted', __category: CATEGORY },
        { id: 12, deduction_item: 'c', source_detail: {}, suggested_score: 3, confirmed_score: 99, review_status: 'pending', __category: CATEGORY },
      ],
    });

    // excludeId=null → 全部计入：5 + 6 + 3 = 14
    expect(await getOtherCategoryScore(24, 55, CATEGORY, null)).toBe(5 + 6 + 3);
  });

  it('approved 但 confirmed_score 为空 → 回退 suggested_score', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        { id: 1, deduction_item: 'a', source_detail: {}, suggested_score: 2, confirmed_score: null, review_status: 'approved', __category: CATEGORY },
      ],
    });
    expect(await getOtherCategoryScore(24, 55, CATEGORY, null)).toBe(2);
  });

  it('无行 → 0，且不调用 resolveRuleForDeductionRows', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    expect(await getOtherCategoryScore(24, 55, CATEGORY, null)).toBe(0);
    expect(resolveRuleForDeductionRows).not.toHaveBeenCalled();
  });

  it('DB 未连接 / category 为空 → 0 且不查库', async () => {
    isConnected.mockReturnValue(false);
    expect(await getOtherCategoryScore(24, 55, CATEGORY, null)).toBe(0);
    isConnected.mockReturnValue(true);
    expect(await getOtherCategoryScore(24, 55, '', null)).toBe(0);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('applyCap', () => {
  /** 让 getCategoryCap 返回指定上限、getOtherCategoryScore 返回指定其他扣分 */
  function stub(cap, otherRows) {
    pool.query
      .mockResolvedValueOnce({ rows: cap == null ? [] : [{ max_deduct: cap }] })
      .mockResolvedValueOnce({ rows: otherRows });
  }

  it('allowed = max(0, cap − 其他)；cappedScore = min(raw, allowed)', async () => {
    stub(15, [
      { id: 2, deduction_item: '三违1次', source_detail: {}, suggested_score: 4, confirmed_score: null, review_status: 'pending', __category: CATEGORY },
    ]);

    const r = await applyCap({ cycleId: 24, targetId: 55, category: CATEGORY, excludeId: null, rawScore: 3 });
    expect(r.cap).toBe(15);
    expect(r.otherCatScore).toBe(4);
    expect(r.allowed).toBe(11);
    expect(r.cappedScore).toBe(3);
    expect(r.cappedOut).toBe(false);
  });

  it('原始分超过剩余额度 → 被钳制到 allowed', async () => {
    stub(15, [
      { id: 2, deduction_item: '三违1次', source_detail: {}, suggested_score: 12, confirmed_score: null, review_status: 'pending', __category: CATEGORY },
    ]);

    const r = await applyCap({ cycleId: 24, targetId: 55, category: CATEGORY, excludeId: null, rawScore: 10 });
    expect(r.allowed).toBe(3);
    expect(r.cappedScore).toBe(3);
    expect(r.cappedOut).toBe(false);
  });

  it('其他扣分已顶满上限 → allowed=0，cappedScore=0 且 cappedOut=true', async () => {
    stub(15, [
      { id: 2, deduction_item: '三违1次', source_detail: {}, suggested_score: 20, confirmed_score: null, review_status: 'pending', __category: CATEGORY },
    ]);

    const r = await applyCap({ cycleId: 24, targetId: 55, category: CATEGORY, excludeId: null, rawScore: 5 });
    expect(r.allowed).toBe(0);
    expect(r.cappedScore).toBe(0);
    expect(r.cappedOut).toBe(true);
  });

  it('排除当前行：其自身历史分不计入 otherCatScore（其余同类别行照常累加）', async () => {
    stub(15, [
      { id: 1, deduction_item: '未检查', source_detail: { kind: KIND }, suggested_score: 9, confirmed_score: null, review_status: 'pending', __category: CATEGORY },
      { id: 2, deduction_item: '三违1次', source_detail: { kind: 'other' }, suggested_score: 2, confirmed_score: null, review_status: 'pending', __category: CATEGORY },
    ]);

    const r = await applyCap({ cycleId: 24, targetId: 55, category: CATEGORY, excludeId: 1, rawScore: 4 });
    expect(r.otherCatScore).toBe(2);   // 自身 9 分（id=1）被按行排除
    expect(r.allowed).toBe(13);
    expect(r.cappedScore).toBe(4);
  });

  it('cap 缺失（Infinity）→ allowed=Infinity，cappedScore=原始分', async () => {
    stub(null, []);

    const r = await applyCap({ cycleId: 24, targetId: 55, category: CATEGORY, excludeId: null, rawScore: 7 });
    expect(r.cap).toBe(Infinity);
    expect(r.allowed).toBe(Infinity);
    expect(r.cappedScore).toBe(7);
    expect(r.cappedOut).toBe(false);
  });

  it('rawScore=0 → cappedScore=0 且 cappedOut=false（零分不算被钳制）', async () => {
    stub(15, []);
    const r = await applyCap({ cycleId: 24, targetId: 55, category: CATEGORY, excludeId: null, rawScore: 0 });
    expect(r.cappedScore).toBe(0);
    expect(r.cappedOut).toBe(false);
  });
});

describe('computeManualCapWarning（任务A 人工扣分上限提示 · 纯 advisory）', () => {
  /** 让 getCategoryCap 返回指定上限、getValidCategoryScore 返回指定有效扣分行 */
  function stub(cap, rows) {
    pool.query
      .mockResolvedValueOnce({ rows: cap == null ? [] : [{ max_deduct: cap }] })
      .mockResolvedValueOnce({ rows });
  }

  beforeEach(() => {
    resolveDeductionRule.mockClear();
  });

  it('未超限：合计 10 + 本次 3 = 13 ≤ 上限 15 → 返回 null（不提示）', async () => {
    stub(15, [
      { id: 2, deduction_item: '三违1次', source_detail: {}, suggested_score: 10, confirmed_score: null, review_status: 'pending', __category: CATEGORY },
    ]);
    const w = await computeManualCapWarning({
      cycleId: 24, targetId: 55, deductionItem: '三违1次', sourceDetail: { category: CATEGORY }, adding: 3,
    });
    expect(w).toBeNull();
  });

  it('刚好超限：合计 13 + 本次 5 = 18 > 15 → 返回 warning（category/cap/currentTotal/adding/wouldTotal）', async () => {
    stub(15, [
      { id: 2, deduction_item: '三违1次', source_detail: {}, suggested_score: 13, confirmed_score: null, review_status: 'pending', __category: CATEGORY },
    ]);
    const w = await computeManualCapWarning({
      cycleId: 24, targetId: 55, deductionItem: '三违1次', sourceDetail: { category: CATEGORY }, adding: 5,
    });
    expect(w).toEqual({ category: CATEGORY, cap: 15, currentTotal: 13, adding: 5, wouldTotal: 18 });
  });

  it('编辑排除本行：excludeId 行不计入合计（自身 5 分被排除 → 8 + 10 = 18 仍超限，currentTotal=8）', async () => {
    stub(15, [
      { id: 99, deduction_item: '三违1次', source_detail: {}, suggested_score: 5, confirmed_score: null, review_status: 'pending', __category: CATEGORY },
      { id: 2, deduction_item: '三违1次', source_detail: {}, suggested_score: 8, confirmed_score: null, review_status: 'pending', __category: CATEGORY },
    ]);
    const w = await computeManualCapWarning({
      cycleId: 24, targetId: 55, deductionItem: '三违1次', sourceDetail: { category: CATEGORY }, adding: 10, excludeId: 99,
    });
    // 若未排除 id=99，currentTotal=13 → 13+10=23；排除后 currentTotal=8 → 8+10=18
    expect(w).toEqual({ category: CATEGORY, cap: 15, currentTotal: 8, adding: 10, wouldTotal: 18 });
  });

  it('无上限：类别无 max_deduct 配置 → cap=Infinity → 返回 null（不提示）', async () => {
    stub(null, []);
    const w = await computeManualCapWarning({
      cycleId: 24, targetId: 55, deductionItem: '三违1次', sourceDetail: { category: CATEGORY }, adding: 20,
    });
    expect(w).toBeNull();
  });

  it('类别缺失：resolveDeductionRule 未命中类别 → 返回 null 且不查库', async () => {
    const w = await computeManualCapWarning({
      cycleId: 24, targetId: 55, deductionItem: '未知扣分项', sourceDetail: {}, adding: 5,
    });
    expect(w).toBeNull();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejected 与软删行由 SQL 排除：校验 getValidCategoryScore 查询含 is_deleted=FALSE / review_status 排除 / 全部来源', async () => {
    // 用自定义 executor 截获 SQL 字符串，证明过滤条件在查询层（mock 无法模拟 SQL 行级过滤）
    const sqlSeen = [];
    const fakeExecutor = {
      query: async (sql, params) => {
        sqlSeen.push({ sql, params });
        // 上限查询返回 15；扣分行查询返回空（重点在 SQL 过滤断言，不关心合计）
        if (sql.includes('hse_assessment_category_limit')) return { rows: [{ max_deduct: 15 }] };
        return { rows: [] };
      },
    };
    const w = await computeManualCapWarning({
      cycleId: 24, targetId: 55, deductionItem: '三违1次', sourceDetail: { category: CATEGORY }, adding: 3, executor: fakeExecutor,
    });
    // 无行 → currentTotal=0 → 3 ≤ 15 不提示；此处重点是 SQL 过滤断言
    expect(w).toBeNull();
    const dedSql = sqlSeen.find(s => s.sql.includes('FROM hse_assessment_deduction'));
    expect(dedSql).toBeTruthy();
    expect(dedSql.sql).toContain('is_deleted = FALSE');
    expect(dedSql.sql).toContain('review_status <> ALL');
    expect(dedSql.sql).toContain('deduction_source = ANY');
    // 全部来源（含 manual）：auto + manual + chain_transmission
    expect(dedSql.params[3]).toEqual(['auto', 'manual', 'chain_transmission']);
  });
});
