/**
 * 安全生产费用业务域 集成测试（返修强化版，需 PostgreSQL）
 * ---------------------------------------------------------------------------
 * 运行方式：在 safety_dashboard_dev 上以 jest 运行本文件，例如
 *   node --experimental-vm-modules node_modules/.bin/jest __tests__/cost.service.test.js --config jest.config.js
 * 安全护栏：本测试仅允许在 safety_dashboard_dev / *_test / test_* 库运行；
 *          若误连生产（safety_dashboard）则所有涉及写库的用例整体跳过，绝不写入。
 * 覆盖：修正1 事务回滚 / 修正2 金额校验+冲销+待归因 / 修正3 财务口径一致性 /
 *       修正4 审批防重+状态回退 / 修正5 导入预览确认防重。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const XLSX = require('xlsx');
const { pool, testConnection } = require('../config/db');
const service = require('../services/costService');

const ALLOWED = /^(safety_dashboard_dev|.*_test|test_.*)$/;
let allowed = false;
let ts;
let refs; // { sanitation:{domainId,opTypeId}, landscape:{domainId,opTypeId}, catId }
const createdBudgetIds = [];
const createdRequestIds = [];
let tmpXlsx;

async function newBudget(amount = 100000) {
  const code = 'TEST-COST-' + ts + '-' + Math.random().toString(36).slice(2, 7);
  const r = await pool.query(
    "INSERT INTO hse_safety_budget(budget_code,budget_year,project_name,item_name,budget_amount,category,status) VALUES($1,2026,$2,$3,$4,'测试','active') RETURNING id",
    [code, '测试项目' + code, '测试事项', amount],
  );
  createdBudgetIds.push(r.rows[0].id);
  return r.rows[0].id;
}
async function newRequest(budgetId, applyAmount = 50000) {
  const r = await service.costRequestCreate({ budgetId, title: '测试申请-' + Math.random().toString(36).slice(2, 6), sourceType: 'hazard', applyAmount });
  createdRequestIds.push(r.payload.id);
  return r.payload.id;
}

beforeAll(async () => {
  await testConnection();
  const db = await pool.query('SELECT current_database() db');
  allowed = ALLOWED.test(db.rows[0].db);
  ts = Date.now();
  if (!allowed) return;
  await service.ensureCostTables();
  const dom = await service.listBizDomains();
  const cat = await service.listInvestCategories();
  const san = dom.payload.find((d) => d.code === 'sanitation');
  const lan = dom.payload.find((d) => d.code === 'landscape');
  const sanOp = (await service.listOpTypes(san.id)).payload[0];
  const lanOp = (await service.listOpTypes(lan.id)).payload[0];
  refs = {
    sanitation: { domainId: san.id, opTypeId: sanOp.id },
    landscape: { domainId: lan.id, opTypeId: lanOp.id },
    catId: cat.payload.find((c) => c.code === 'hazard_rectify').id,
  };
  const ws = XLSX.utils.json_to_sheet([
    { 预算年度: 2026, 预算编码: 'IMP-' + ts, 项目名称: '导入项目', 明细名称: '导入事项', 预算金额: 20000, 部门: '测试部' },
    { 预算年度: 2026, 预算编码: 'IMP-' + (ts + 1), 项目名称: '导入项目2', 明细名称: '导入事项2', 预算金额: 15000 },
  ]);
  tmpXlsx = path.join(os.tmpdir(), 'cost_imp_' + ts + '.xlsx');
  XLSX.writeFile({ SheetNames: ['预算'], Sheets: { 预算: ws } }, tmpXlsx);
});

afterAll(async () => {
  if (!allowed) { await pool.end().catch(() => {}); return; }
  for (const rid of createdRequestIds) {
    await pool.query('DELETE FROM hse_cost_allocation WHERE request_id=$1 OR cost_actual_id IN (SELECT id FROM hse_cost_actual WHERE request_id=$1)', [rid]);
    await pool.query('DELETE FROM hse_cost_actual WHERE request_id=$1', [rid]);
    await pool.query('DELETE FROM hse_cost_commitment WHERE request_id=$1', [rid]);
    await pool.query('DELETE FROM hse_cost_request WHERE id=$1', [rid]);
  }
  for (const bid of createdBudgetIds) await pool.query('DELETE FROM hse_budget_item WHERE budget_id=$1', [bid]);
  await pool.query("UPDATE hse_safety_budget SET is_deleted=true WHERE budget_code LIKE 'TEST-COST-%' OR budget_code LIKE 'IMP-%'");
  if (tmpXlsx && fs.existsSync(tmpXlsx)) fs.unlinkSync(tmpXlsx);
  await pool.end().catch(() => {});
});

describe('安全生产费用业务域（返修强化）', () => {
  it('环境护栏：仅允许在 dev/test 库运行', () => {
    expect(allowed).toBe(true);
  });

  // ---- 金额精度助手（纯函数，无需库）----
  it('金额精度：以「分」为整数，规避浮点误差', () => {
    expect(service.toCents('100.50')).toBe(10050);
    expect(service.toCents(0.07)).toBe(7);
    expect(service.toCents(0.1) + service.toCents(0.2)).toBe(service.toCents(0.3)); // 10+20===30，非浮点和
    expect(service.fromCents(30000)).toBe(300);
  });

  // ================= 修正2：金额一致性校验 =================
  it('实际金额与单一分摊一致 → 成功', async () => {
    if (!allowed) return;
    const bid = await newBudget();
    const rid = await newRequest(bid);
    const r = await service.actualCreate({
      requestId: rid, budgetId: bid, actualAmount: 30000, actualDate: '2026-10-23',
      allocations: [{ bizDomainId: refs.sanitation.domainId, opTypeId: refs.sanitation.opTypeId, investCategoryId: refs.catId, amount: 30000 }],
    });
    expect(r.error).toBeUndefined();
    expect(r.payload.id).toBeDefined();
  });

  it('实际金额与分摊不一致 → 失败且不落库', async () => {
    if (!allowed) return;
    const bid = await newBudget();
    const rid = await newRequest(bid);
    const r = await service.actualCreate({
      requestId: rid, budgetId: bid, actualAmount: 30000,
      allocations: [{ bizDomainId: refs.sanitation.domainId, investCategoryId: refs.catId, amount: 20000 }],
    });
    expect(r.error).toBeDefined();
    const cnt = await pool.query('SELECT COUNT(*)::int c FROM hse_cost_actual WHERE request_id=$1', [rid]);
    expect(cnt.rows[0].c).toBe(0);
  });

  it('多领域分摊合计一致 → 成功', async () => {
    if (!allowed) return;
    const bid = await newBudget();
    const rid = await newRequest(bid);
    const r = await service.actualCreate({
      requestId: rid, budgetId: bid, actualAmount: 30000, actualDate: '2026-10-23',
      allocations: [
        { bizDomainId: refs.sanitation.domainId, investCategoryId: refs.catId, amount: 10000 },
        { bizDomainId: refs.landscape.domainId, investCategoryId: refs.catId, amount: 20000 },
      ],
    });
    expect(r.error).toBeUndefined();
    expect(r.payload.id).toBeDefined();
  });

  it('分摊合计不足/超出 → 失败', async () => {
    if (!allowed) return;
    const bid = await newBudget();
    const rid = await newRequest(bid);
    const under = await service.actualCreate({
      requestId: rid, budgetId: bid, actualAmount: 30000,
      allocations: [{ bizDomainId: refs.sanitation.domainId, investCategoryId: refs.catId, amount: 25000 }],
    });
    expect(under.error).toBeDefined();
    const over = await service.actualCreate({
      requestId: rid, budgetId: bid, actualAmount: 30000,
      allocations: [{ bizDomainId: refs.sanitation.domainId, investCategoryId: refs.catId, amount: 35000 }],
    });
    expect(over.error).toBeDefined();
    const cnt = await pool.query('SELECT COUNT(*)::int c FROM hse_cost_actual WHERE request_id=$1', [rid]);
    expect(cnt.rows[0].c).toBe(0);
  });

  it('负数/零分摊、零实际金额 → 失败', async () => {
    if (!allowed) return;
    const bid = await newBudget();
    const rid = await newRequest(bid);
    expect((await service.actualCreate({ requestId: rid, budgetId: bid, actualAmount: 30000, allocations: [{ bizDomainId: refs.sanitation.domainId, amount: -100 }] })).error).toBeDefined();
    expect((await service.actualCreate({ requestId: rid, budgetId: bid, actualAmount: 30000, allocations: [{ bizDomainId: refs.sanitation.domainId, amount: 0 }] })).error).toBeDefined();
    expect((await service.actualCreate({ requestId: rid, budgetId: bid, actualAmount: 0 })).error).toBeDefined();
    const cnt = await pool.query('SELECT COUNT(*)::int c FROM hse_cost_actual WHERE request_id=$1', [rid]);
    expect(cnt.rows[0].c).toBe(0);
  });

  // ================= 修正1：事务回滚 =================
  it('分摊中途数据库异常 → 实际支出与分摊全部回滚（无半条记录）', async () => {
    if (!allowed) return;
    const bid = await newBudget();
    const rid = await newRequest(bid);
    // 合计=实际(30000)，校验通过；但第2条分摊引用不存在的投入类别 → FK 违规 → 整体回滚
    const r = await service.actualCreate({
      requestId: rid, budgetId: bid, actualAmount: 30000, actualDate: '2026-10-23',
      allocations: [
        { bizDomainId: refs.sanitation.domainId, opTypeId: refs.sanitation.opTypeId, investCategoryId: refs.catId, amount: 20000 },
        { bizDomainId: refs.sanitation.domainId, investCategoryId: 999999999, amount: 10000 },
      ],
    });
    expect(r.error).toBeDefined();
    const act = await pool.query('SELECT COUNT(*)::int c FROM hse_cost_actual WHERE request_id=$1', [rid]);
    const al = await pool.query('SELECT COUNT(*)::int c FROM hse_cost_allocation WHERE request_id=$1', [rid]);
    expect(act.rows[0].c).toBe(0);
    expect(al.rows[0].c).toBe(0);
  });

  // ================= 修正2：冲销（reversal）净额 =================
  it('退款/冲销为独立反向记录，净支出=正常-冲销，不改历史', async () => {
    if (!allowed) return;
    const bid = await newBudget();
    const rid = await newRequest(bid);
    await service.actualCreate({ requestId: rid, budgetId: bid, actualAmount: 30000, actualDate: '2026-10-23', allocations: [{ bizDomainId: refs.sanitation.domainId, investCategoryId: refs.catId, amount: 30000 }] });
    await service.actualCreate({ requestId: rid, budgetId: bid, actualAmount: 10000, actualDate: '2026-10-24', recordType: 'reversal', allocations: [{ bizDomainId: refs.sanitation.domainId, investCategoryId: refs.catId, amount: 10000 }] });
    const fin = await service.budgetFinancials(bid);
    expect(fin.payload.actual).toBe(20000); // 30000 - 10000
    // 历史原始记录仍在（2 条 actual，未删除）
    const cnt = await pool.query('SELECT COUNT(*)::int c FROM hse_cost_actual WHERE request_id=$1 AND is_deleted=false', [rid]);
    expect(cnt.rows[0].c).toBe(2);
  });

  // ================= 修正3：财务口径一致性 =================
  it('财务口径：已承诺/待执行承诺/实际/余额/可用/承诺率/执行率（承诺被实际消耗不重复扣减）', async () => {
    if (!allowed) return;
    const bid = await newBudget(100000);
    const rid = await newRequest(bid, 50000);
    const up = await service.costRequestUpdate(rid, { status: 'approved', approvedAmount: 50000 });
    const cmtId = up.payload && up.payload.id; // 承诺 id 需另查
    const cmt = await pool.query("SELECT id FROM hse_cost_commitment WHERE request_id=$1 AND status='active' AND is_deleted=false", [rid]);
    const commitmentId = cmt.rows[0].id;
    // 实际支出关联到该承诺（commitment_id），金额 30000 → 消耗承诺 30000
    await service.actualCreate({ requestId: rid, budgetId: bid, commitmentId, actualAmount: 30000, actualDate: '2026-10-23', allocations: [{ bizDomainId: refs.sanitation.domainId, investCategoryId: refs.catId, amount: 30000 }] });
    const fin = await service.budgetFinancials(bid);
    expect(fin.payload.budgetAmount).toBe(100000);
    expect(fin.payload.committed).toBe(50000);            // 已承诺总额
    expect(fin.payload.pendingCommitted).toBe(20000);     // 待执行承诺 = 50000 - 已被实际消耗30000
    expect(fin.payload.actual).toBe(30000);               // 实际净支出
    expect(fin.payload.balance).toBe(70000);              // 未支出余额 = 100000 - 30000
    expect(fin.payload.availableUncommitted).toBe(80000); // 未承诺可用 = 100000 - 待执行承诺20000（未把已花费的承诺重复扣减）
    expect(fin.payload.commitmentRate).toBe(50);
    expect(fin.payload.executionRate).toBe(30);
    // 关键：不得出现 budget - committed - actual 的重复扣减口径
    expect(fin.payload.availableUncommitted).not.toBe(100000 - 50000 - 30000);
  });

  it('费用统计：按领域/类别汇总与总量一致，未归因单列，年度用 actual_date 过滤', async () => {
    if (!allowed) return;
    const bid = await newBudget();
    const rid = await newRequest(bid);
    // 以独立年度 2099 隔离，精确断言
    await service.actualCreate({ requestId: rid, budgetId: bid, actualAmount: 30000, actualDate: '2099-06-01', allocations: [{ bizDomainId: refs.sanitation.domainId, investCategoryId: refs.catId, amount: 30000 }] });
    await service.actualCreate({ requestId: rid, budgetId: bid, actualAmount: 20000, actualDate: '2099-06-02', allocations: [{ bizDomainId: refs.landscape.domainId, investCategoryId: refs.catId, amount: 20000 }] });
    await service.actualCreate({ requestId: rid, budgetId: bid, actualAmount: 5000, actualDate: '2099-06-03' }); // 待归因（无分摊）
    const st = await service.costStats({ budgetYear: 2099 });
    expect(st.payload.totalActual).toBe(55000);
    expect(st.payload.allocatedTotal).toBe(50000);
    expect(st.payload.unattributedActual).toBe(5000);
    const domSum = st.payload.byDomain.reduce((s, d) => s + d.amount, 0);
    const catSum = st.payload.byCategory.reduce((s, c) => s + c.amount, 0);
    expect(domSum).toBe(st.payload.allocatedTotal);   // 领域汇总 = 已归集
    expect(catSum).toBe(st.payload.allocatedTotal);   // 类别汇总 = 已归集
    const san = st.payload.byDomain.find((d) => d.bizDomain === '环卫作业');
    const lan = st.payload.byDomain.find((d) => d.bizDomain === '市政园林作业');
    expect(san && san.amount).toBe(30000);
    expect(lan && lan.amount).toBe(20000);
    expect(st.payload.totalActual - st.payload.unattributedActual).toBe(st.payload.allocatedTotal);
  });

  // ================= 修正4：审批防重与状态一致性 =================
  it('重复审批同一申请 → 仅一条有效承诺（幂等）', async () => {
    if (!allowed) return;
    const bid = await newBudget();
    const rid = await newRequest(bid, 50000);
    await service.costRequestUpdate(rid, { status: 'approved', approvedAmount: 50000 });
    await service.costRequestUpdate(rid, { status: 'approved', approvedAmount: 50000 });
    const c = await pool.query("SELECT COUNT(*)::int c, COALESCE(SUM(amount),0) s FROM hse_cost_commitment WHERE request_id=$1 AND status='active' AND is_deleted=false", [rid]);
    expect(c.rows[0].c).toBe(1);
    expect(parseFloat(c.rows[0].s)).toBe(50000);
  });

  it('并发审批同一申请 → 仅一条有效承诺（行锁串行化）', async () => {
    if (!allowed) return;
    const bid = await newBudget();
    const rid = await newRequest(bid, 50000);
    await Promise.all([
      service.costRequestUpdate(rid, { status: 'approved', approvedAmount: 50000 }),
      service.costRequestUpdate(rid, { status: 'approved', approvedAmount: 50000 }),
      service.costRequestUpdate(rid, { status: 'approved', approvedAmount: 50000 }),
    ]);
    const c = await pool.query("SELECT COUNT(*)::int c FROM hse_cost_commitment WHERE request_id=$1 AND status='active' AND is_deleted=false", [rid]);
    expect(c.rows[0].c).toBe(1);
  });

  it('审批金额变更 → 更新既有承诺金额，不新增承诺', async () => {
    if (!allowed) return;
    const bid = await newBudget();
    const rid = await newRequest(bid, 50000);
    await service.costRequestUpdate(rid, { status: 'approved', approvedAmount: 50000 });
    await service.costRequestUpdate(rid, { status: 'approved', approvedAmount: 40000 });
    const c = await pool.query("SELECT COUNT(*)::int c, COALESCE(SUM(amount),0) s FROM hse_cost_commitment WHERE request_id=$1 AND status='active' AND is_deleted=false", [rid]);
    expect(c.rows[0].c).toBe(1);
    expect(parseFloat(c.rows[0].s)).toBe(40000);
  });

  it('审批后驳回（未被实际消耗）→ 释放承诺（取消）', async () => {
    if (!allowed) return;
    const bid = await newBudget();
    const rid = await newRequest(bid, 50000);
    await service.costRequestUpdate(rid, { status: 'approved', approvedAmount: 50000 });
    await service.costRequestUpdate(rid, { status: 'rejected', rejectReason: '预算调整' });
    const c = await pool.query("SELECT COUNT(*)::int c FROM hse_cost_commitment WHERE request_id=$1 AND status='active' AND is_deleted=false", [rid]);
    const cancelled = await pool.query("SELECT COUNT(*)::int c FROM hse_cost_commitment WHERE request_id=$1 AND status='cancelled' AND is_deleted=false", [rid]);
    expect(c.rows[0].c).toBe(0);
    expect(cancelled.rows[0].c).toBe(1);
    const fin = await service.budgetFinancials(bid);
    expect(fin.payload.committed).toBe(0);
  });

  it('审批后已被实际消耗 → 驳回不释放承诺（资金已花）', async () => {
    if (!allowed) return;
    const bid = await newBudget();
    const rid = await newRequest(bid, 50000);
    await service.costRequestUpdate(rid, { status: 'approved', approvedAmount: 50000 });
    await service.actualCreate({ requestId: rid, budgetId: bid, actualAmount: 30000, actualDate: '2026-10-23', allocations: [{ bizDomainId: refs.sanitation.domainId, investCategoryId: refs.catId, amount: 30000 }] });
    await service.costRequestUpdate(rid, { status: 'rejected' });
    const c = await pool.query("SELECT COUNT(*)::int c FROM hse_cost_commitment WHERE request_id=$1 AND status='active' AND is_deleted=false", [rid]);
    expect(c.rows[0].c).toBe(1); // 仍有效，不能凭空释放已花费资金
  });

  it('审计既有重复有效承诺：只读、只报不删', async () => {
    if (!allowed) return;
    const r = await service.auditDuplicateCommitments();
    expect(r.error).toBeUndefined();
    expect(Array.isArray(r.payload)).toBe(true);
  });

  // ================= 修正5：预算导入 =================
  it('预算导入：预览→确认插入→二次确认防重跳过', async () => {
    if (!allowed) return;
    const prev = await service.budgetImportPreview(tmpXlsx);
    expect(prev.payload.errorCount).toBe(0);
    const conf = await service.budgetImportConfirm(tmpXlsx, { operatorName: 'test', fileName: 'cost_imp.xlsx' });
    expect(conf.payload.inserted).toBe(2);
    const conf2 = await service.budgetImportConfirm(tmpXlsx, { operatorName: 'test', fileName: 'cost_imp.xlsx' });
    expect(conf2.payload.skipped).toBe(2);
    expect(conf2.payload.inserted).toBe(0);
  });

  it('申请创建携带计划归因：申请与分摊原子写入', async () => {
    if (!allowed) return;
    const bid = await newBudget();
    const r = await service.costRequestCreate({
      budgetId: bid, title: '带归因申请', applyAmount: 12345.67,
      allocations: [{ bizDomainId: refs.sanitation.domainId, investCategoryId: refs.catId, amount: 12345.67 }],
    });
    expect(r.error).toBeUndefined();
    createdRequestIds.push(r.payload.id);
    const al = await pool.query('SELECT COUNT(*)::int c FROM hse_cost_allocation WHERE request_id=$1 AND is_deleted=false', [r.payload.id]);
    expect(al.rows[0].c).toBe(1);
  });
});
