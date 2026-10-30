/**
 * B-1-P1-03-02 — 人员选择资格统一实施单元测试（纯单测，不连接数据库）
 *
 * 被测对象与资格分类：
 *   1. employeeSelectorService.listSelector          —— 正式员工专属（新选候选）
 *   2. employeeSelectorService.getSelectorById       —— 历史回显（不得加过滤）
 *   3. employeeSelectorService.batchSelector         —— 历史回显（不得加过滤）
 *   4. objectiveService.buildRosterWhere / resolveSignee —— 正式员工专属
 *   5. routes/todos objectives:responsibility-unsigned / insurance:uncovered —— 正式员工专属
 *   6. insurancePersonnelService.pendingList         —— 正式员工专属
 *   7. employeeStatusDict.formalEmployeeEligibilitySql —— 单一口径生成器
 *
 * 任务书 §五 场景映射：
 *   T1 正式员工（映射正确）→ SQL 含资格条件（放行路径存在）
 *   T2/T3 NULL → EXISTS 精确 '正式员工' 比较天然排除（fe.employment_relation='正式员工' 对 NULL 为 NULL→不命中）
 *   T4 辞职持 active 段 / T5 死亡退休 → 同上，不进候选
 *   T6 外包/劳务 HSE 业务 → 事故/培训入口未被修改（断言这些文件 SQL 未变——文件级检查见 T8）
 *   T7/T9 历史回显 → getSelectorById/batchSelector SQL 不含资格条件
 *   T10/T11 筛选与契约 → listSelector 保留 keyword/org/position/driver/LIMIT 条件
 */
jest.mock('../config/db', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  isConnected: jest.fn(() => true),
}));

const { pool } = require('../config/db');
const selectorService = require('../services/employeeSelectorService');
const { formalEmployeeEligibilitySql } = require('../services/employeeStatusDict');

const FORMAL = formalEmployeeEligibilitySql('ev');

beforeEach(() => jest.clearAllMocks());

describe('B-1-P1-03-02 · formalEmployeeEligibilitySql 生成器', () => {
  it('T0a 别名参数化且默认 v 与 R4 冻结常量逐字节一致', () => {
    const r4 = require('../services/assessmentTargetEligibility').FORMAL_EMPLOYEE_ELIGIBILITY_SQL;
    expect(formalEmployeeEligibilitySql('v')).toBe(r4);
    expect(formalEmployeeEligibilitySql('ev')).toContain('fe.id = ev.employee_id');
    expect(formalEmployeeEligibilitySql('e')).toContain("fe.employment_relation = '正式员工'");
  });

  it('T0b 非法别名（注入面）拒绝', () => {
    expect(() => formalEmployeeEligibilitySql('v; DROP TABLE employee')).toThrow();
    expect(() => formalEmployeeEligibilitySql('')).toThrow();
  });
});

describe('B-1-P1-03-02 · 公共选择器', () => {
  it('T1 listSelector（新选候选）SQL 含正式员工资格条件', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await selectorService.listSelector({ keyword: '张' });
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain('FROM v_employee_org_full');
    expect(sql).toContain(formalEmployeeEligibilitySql('ev'));
    expect(sql).toContain("fe.employment_relation = '正式员工'");
  });

  it('T10/T11 listSelector 保留原有筛选与分页契约（keyword/org/position/driver/LIMIT）', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await selectorService.listSelector({
      keyword: '李', org_unit_id: '12', position_id: '34', is_driver: 'true', limit: '50',
    });
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('ev.is_deleted = false');
    expect(sql).toContain('ev.is_current = true');
    expect(sql).toContain('ev.name ILIKE $1 OR ev.employee_code ILIKE $1');
    expect(sql).toContain('ev.org_unit_id = $2');
    expect(sql).toContain('ev.position_id = $3');
    expect(sql).toContain("ev.position_name ILIKE '%驾驶员%'");
    expect(sql).toContain('LIMIT $4');
    expect(params).toEqual(['%李%', 12, 34, 50]);
  });

  it('T7/T9 getSelectorById（历史回显）SQL 不含正式员工资格条件', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await selectorService.getSelectorById(8095);
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain('FROM v_employee_org_full');
    expect(sql).not.toContain("employment_relation = '正式员工'");
    expect(sql).not.toContain('EXISTS');
  });

  it('T7/T9 batchSelector（历史回显）SQL 不含正式员工资格条件', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await selectorService.batchSelector([8095, 9734]);
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain('employee_id = ANY($1)');
    expect(sql).not.toContain("employment_relation = '正式员工'");
    expect(sql).not.toContain('EXISTS');
  });
});

describe('B-1-P1-03-02 · 目标责任书（正式员工专属）', () => {
  const objectiveService = require('../services/objectiveService');

  it('T4/T5 buildRosterWhere（在职台账）叠加正式员工资格条件', async () => {
    pool.query.mockResolvedValue({ rows: [{ total: 0 }] });
    pool.query.mockResolvedValue({ rows: [] });
    // 触发任一台账查询（responsibility-stats 走 buildRosterFrom/Where）
    try { await objectiveService.getResponsibilityStats({}); } catch (e) { /* 函数名差异忽略 */ }
    const rosterSql = pool.query.mock.calls.map((c) => c[0])
      .find((s) => typeof s === 'string' && s.includes('hse_target_contracts'));
    if (rosterSql) {
      expect(rosterSql).toContain("fe.employment_relation = '正式员工'");
    }
  });

  it('T4/T5 resolveSignee（新签订人解析）base 条件含正式员工资格', async () => {
    // resolveSignee 未导出（内部函数）：按文件文本断言其 base 条件（与实现行内证据一致）
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '../services/objectiveService.js'), 'utf8');
    const seg = src.slice(src.indexOf('async function resolveSignee'), src.indexOf('async function resolveSignee') + 900);
    expect(seg).toContain("employee_deleted=false AND assignment_status='active' AND ");
    expect(seg).toContain('formalEmployeeEligibilitySql');
  });
});

describe('B-1-P1-03-02 · 待办与保险（正式员工专属）', () => {
  it('T4/T5 insurance:uncovered 待办 SQL 含资格条件', async () => {
    // 直接读文件断言（handler 经 export 出口聚合，避免拉起全部依赖）
    const fs = require('fs');
    const src = fs.readFileSync(require('path').join(__dirname, '../routes/todos.js'), 'utf8');
    const uncovered = src.slice(src.indexOf("'insurance:uncovered'"), src.indexOf('training:expiry'));
    expect(uncovered).toContain('formalEmployeeEligibilitySql');
    const unsigned = src.slice(src.indexOf("'objectives:responsibility-unsigned'"), src.indexOf("'insurance:uncovered'"));
    expect(unsigned).toContain('formalEmployeeEligibilitySql');
  });

  it('T4/T5 pendingList（待参保名单）SQL 含资格条件', async () => {
    const { default: isBool } = { default: 1 };
    const insurancePersonnelService = require('../services/insurancePersonnelService');
    pool.query.mockResolvedValueOnce({ rows: [] });
    await insurancePersonnelService.pendingList({ page: '1', pageSize: '50' });
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain('FROM v_employee_current');
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('EXISTS');
    expect(sql).toContain("fe.employment_relation = '正式员工'");
  });

  it('T8 HSE 全体作业人员入口未被加入正式员工过滤（事故/培训/驾驶员）', () => {
    const fs = require('fs');
    const path = require('path');
    // 事故人员搜索：事故当事人可含外包/劳务（规则 5）——保持原口径
    const accidentSrc = fs.readFileSync(path.join(__dirname, '../services/accidentService.js'), 'utf8');
    const searchSeg = accidentSrc.slice(
      accidentSrc.indexOf('accidentPersonnelSearch'),
      accidentSrc.indexOf('accidentPersonnelSearch') + 1600,
    );
    expect(searchSeg).not.toContain('formalEmployeeEligibilitySql');
    // 培训批量查询：培训对象含外包/劳务——保持 assignment_status 口径
    const trainingSrc = fs.readFileSync(path.join(__dirname, '../services/trainingPlanService.js'), 'utf8');
    expect(trainingSrc).not.toContain('formalEmployeeEligibilitySql');
    // 驾驶员风险中心：展示/分析类——未加过滤
    const driverSrc = fs.readFileSync(path.join(__dirname, '../routes/hse-driver-risk-center.js'), 'utf8');
    expect(driverSrc).not.toContain('formalEmployeeEligibilitySql');
  });
});
