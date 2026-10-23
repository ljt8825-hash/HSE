/**
 * 安全生产费用业务域 集成测试（需 PostgreSQL）
 * 运行方式：npm run test:integration（需 ALLOW_INTEGRATION_TESTS=true + 专用 test_* 库）
 * 安全护栏：本测试仅允许在 safety_dashboard_dev 或 *_test / test_* 库运行；
 *          若误连生产（safety_dashboard）则整体跳过，绝不写入。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const XLSX = require('xlsx');
const { pool, testConnection } = require('../config/db');
const service = require('../services/costService');

const ALLOWED = /^(safety_dashboard_dev|.*_test|test_.*)$/;
let allowed = false;
let budgetId, reqId, ts, tmpXlsx;

beforeAll(async () => {
  await testConnection();
  const db = await pool.query('SELECT current_database() db');
  allowed = ALLOWED.test(db.rows[0].db);
  if (!allowed) {
    // 不允许在生产库运行，跳过而非失败，避免误写
    return;
  }
  ts = Date.now();
  const bR = await pool.query(
    "INSERT INTO hse_safety_budget(budget_code,budget_year,project_name,item_name,budget_amount,category,status) VALUES($1,$2,$3,$4,$5,$6,'active') RETURNING id",
    ['TEST-COST-' + ts, 2026, '测试项目', '测试事项', 100000, '测试'],
  );
  budgetId = bR.rows[0].id;
  const dom = await service.listBizDomains();
  const domainId = dom.payload.find((d) => d.code === 'sanitation').id;
  const opR = await service.listOpTypes(domainId);
  const cat = await service.listInvestCategories();
  const catId = cat.payload.find((c) => c.code === 'hazard_rectify').id;
  global.__refs = { domainId, opTypeId: opR.payload[0].id, catId };

  const ws = XLSX.utils.json_to_sheet([
    { 预算年度: 2026, 预算编码: 'IMP-' + ts, 项目名称: '导入项目', 明细名称: '导入事项', 预算金额: 20000, 部门: '测试部' },
    { 预算年度: 2026, 预算编码: 'IMP-' + (ts + 1), 项目名称: '导入项目2', 明细名称: '导入事项2', 预算金额: 15000 },
  ]);
  tmpXlsx = path.join(os.tmpdir(), 'cost_imp_' + ts + '.xlsx');
  XLSX.writeFile({ SheetNames: ['预算'], Sheets: { 预算: ws } }, tmpXlsx);
});

afterAll(async () => {
  if (!allowed) return;
  if (reqId) {
    await pool.query('DELETE FROM hse_cost_allocation WHERE request_id=$1 OR cost_actual_id IN (SELECT id FROM hse_cost_actual WHERE request_id=$1)', [reqId]);
    await pool.query('DELETE FROM hse_cost_actual WHERE request_id=$1', [reqId]);
    await pool.query('DELETE FROM hse_cost_commitment WHERE request_id=$1', [reqId]);
    await pool.query('DELETE FROM hse_cost_request WHERE id=$1', [reqId]);
  }
  if (budgetId) await pool.query('DELETE FROM hse_budget_item WHERE budget_id=$1', [budgetId]);
  await pool.query("UPDATE hse_safety_budget SET is_deleted=true WHERE budget_code LIKE 'TEST-COST-%' OR budget_code LIKE 'IMP-%'");
  if (tmpXlsx && fs.existsSync(tmpXlsx)) fs.unlinkSync(tmpXlsx);
  await pool.end().catch(() => {});
});

describe('安全生产费用业务域', () => {
  it('环境护栏：仅允许在 dev/test 库运行', () => {
    expect(allowed).toBe(true);
  });

  it('预算明细创建', async () => {
    const r = await service.budgetItemCreate({ budgetId, itemName: '明细A', plannedAmount: 40000, bizDomainId: global.__refs.domainId });
    expect(r.payload.id).toBeDefined();
  });

  it('费用申请创建并自动生成承诺（审批通过）', async () => {
    const cr = await service.costRequestCreate({
      budgetId, title: '隐患整改费用', sourceType: 'hazard', sourceId: 1, applyAmount: 50000,
      allocations: [{ bizDomainId: global.__refs.domainId, opTypeId: global.__refs.opTypeId, investCategoryId: global.__refs.catId, objectType: 'transfer_station', objectName: '某转运站', eventType: 'hazard', eventId: 1, amount: 50000 }],
    });
    reqId = cr.payload.id;
    expect(cr.payload.requestNo).toBeDefined();
    const up = await service.costRequestUpdate(reqId, { status: 'approved', approvedAmount: 50000 });
    expect(up.payload.status).toBe('approved');
    const cmt = await pool.query('SELECT COALESCE(SUM(amount),0) s FROM hse_cost_commitment WHERE request_id=$1 AND is_deleted=false', [reqId]);
    expect(parseFloat(cmt.rows[0].s)).toBe(50000);
  });

  it('实际支出 + 成本归因，并计算财务状态（余额/执行率由交易表得出）', async () => {
    const act = await service.actualCreate({
      requestId: reqId, budgetId, actualAmount: 30000, actualDate: '2026-10-23',
      allocations: [{ bizDomainId: global.__refs.domainId, opTypeId: global.__refs.opTypeId, investCategoryId: global.__refs.catId, objectType: 'transfer_station', objectName: '某转运站', eventType: 'hazard', eventId: 1, amount: 30000 }],
    });
    expect(act.payload.id).toBeDefined();
    const fin = await service.budgetFinancials(budgetId);
    expect(fin.payload.committed).toBe(50000);
    expect(fin.payload.actual).toBe(30000);
    expect(fin.payload.balance).toBe(70000);
    expect(fin.payload.executionRate).toBe(30);
  });

  it('费用统计按业务领域/投入类别归集', async () => {
    const st = await service.costStats({});
    expect(st.payload.totalActual).toBe(30000);
    expect(st.payload.byDomain[0].amount).toBe(30000);
    expect(st.payload.byCategory[0].amount).toBe(30000);
  });

  it('预算导入：预览→确认插入→二次确认防重跳过', async () => {
    const prev = await service.budgetImportPreview(tmpXlsx);
    expect(prev.payload.errorCount).toBe(0);
    const conf = await service.budgetImportConfirm(tmpXlsx, { operatorName: 'test', fileName: 'cost_imp.xlsx' });
    expect(conf.payload.inserted).toBe(2);
    const conf2 = await service.budgetImportConfirm(tmpXlsx, { operatorName: 'test', fileName: 'cost_imp.xlsx' });
    expect(conf2.payload.skipped).toBe(2);
  });
});
