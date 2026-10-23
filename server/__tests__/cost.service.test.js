/**
 * 安全生产费用业务域 集成测试（上线阻断项修复版，需 PostgreSQL）
 * ---------------------------------------------------------------------------
 * 运行方式（dev 库）：
 *   DB_NAME=safety_dashboard_dev ./node_modules/.bin/jest __tests__/cost.service.test.js \
 *     --config <最小内联配置> --runInBand
 * 安全护栏：本测试仅允许在 safety_dashboard_dev / *_test / test_* 库运行；
 *          若误连生产（safety_dashboard）则所有涉及写库的用例整体跳过，绝不写入。
 * 覆盖（本轮新增/加强）：
 *   P0-1 结构守卫：缺表/缺列/缺索引 → 业务接口明确报「迁移未完成」，绝不自动 DDL、绝不假报成功
 *   P0-2 独立分摊：事务+锁定实际支出+总额校验（首笔不足/超额拒绝、补齐成功、不存在/已删除拒绝、
 *        并发不超额、中途异常全部回滚、修改流程、删除约束、冲销类型一致）
 *   P0-3 导入防重：批次+指纹绑定、编码判重、空编码业务键判重、同批次重复确认、并发确认、
 *        并发批次、文件替换拒绝、部分非法、失败重试、批次留痕
 *   P1  金额解析：非法文本/超精度/负值/零/超范围/科学计数法一律拒绝
 *   回归：事务回滚 / 财务口径一致性 / 审批防重与状态回退 / 冲销净额 / 统计口径
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
const createdActualIds = [];
const tmpFiles = [];
const createdBatchNos = [];

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
// 创建一笔带完整归因的实际支出，返回 { actualId, allocationId }
async function newAttributedActual(budgetId, requestId, amount, domain = 'sanitation') {
  const r = await service.actualCreate({
    requestId, budgetId, actualAmount: amount, actualDate: '2026-10-23',
    allocations: [{ bizDomainId: refs[domain].domainId, opTypeId: refs[domain].opTypeId, investCategoryId: refs.catId, amount }],
  });
  expect(r.error).toBeUndefined();
  createdActualIds.push(r.payload.id);
  const al = await pool.query('SELECT id FROM hse_cost_allocation WHERE cost_actual_id=$1 AND is_deleted=false', [r.payload.id]);
  return { actualId: r.payload.id, allocationId: al.rows[0].id };
}
function tmpXlsx(name, rows) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const p = path.join(os.tmpdir(), `cost_${name}_${ts}_${Math.random().toString(36).slice(2, 6)}.xlsx`);
  XLSX.writeFile({ SheetNames: ['预算'], Sheets: { 预算: ws } }, p);
  tmpFiles.push(p);
  return p;
}

beforeAll(async () => {
  await testConnection();
  const db = await pool.query('SELECT current_database() db');
  allowed = ALLOWED.test(db.rows[0].db);
  ts = Date.now();
  if (!allowed) return;
  // P0-1：结构必须由受控迁移先行执行；业务代码绝不自动建表。缺失即明确失败，不静默跳过。
  const schema = await service.checkCostSchema();
  if (!schema.ok) {
    throw new Error(`dev 库缺少安全生产费用域结构（${JSON.stringify(schema.missing)}），请先按受控流程执行 server/sql/20261023_*.sql、20261024_*.sql、20261025_*.sql`);
  }
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
  await pool.query("UPDATE hse_safety_budget SET is_deleted=true WHERE budget_code LIKE 'TEST-COST-%' OR budget_code LIKE 'IMP-%' OR project_name LIKE '无编码导入项目%'");
  if (tmpFiles.length) {
    await pool.query('DELETE FROM hse_cost_import_batch WHERE file_path = ANY($1)', [tmpFiles]);
    for (const p of tmpFiles) { try { fs.unlinkSync(p); } catch (_) { /* ignore */ } }
  }
  await pool.end().catch(() => {});
});

describe('安全生产费用业务域（上线阻断项修复）', () => {
  it('环境护栏：仅允许在 dev/test 库运行', () => {
    expect(allowed).toBe(true);
  });

  // ================= P0-1：结构守卫（只读，绝不自动 DDL） =================
  it('P0-1：结构完好时检查通过，且报告真实 current_database()', async () => {
    if (!allowed) return;
    const r = await service.checkCostSchema();
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual({ tables: [], columns: [], indexes: [] });
    expect(r.database).toBe('safety_dashboard_dev');
  });

  it('P0-1：缺表/缺列/缺索引 → 检查报告缺失对象（可追踪）', async () => {
    if (!allowed) return;
    const r = await service.checkCostSchema({
      tables: ['hse_cost_request', 'no_such_table_xyz'],
      columns: [{ table: 'hse_cost_actual', column: 'no_such_col_xyz' }],
      indexes: ['no_such_index_xyz'],
    });
    expect(r.ok).toBe(false);
    expect(r.missing.tables).toContain('no_such_table_xyz');
    expect(r.missing.columns).toContain('hse_cost_actual.no_such_col_xyz');
    expect(r.missing.indexes).toContain('no_such_index_xyz');
  });

  it('P0-1：结构缺失时读写接口均明确报「迁移未完成」，绝不自动建表/假报成功', async () => {
    if (!allowed) return;
    const origTables = service.REQUIRED_SCHEMA.tables;
    service.REQUIRED_SCHEMA.tables = [...origTables, 'no_such_table_xyz'];
    try {
      const read = await service.costRequestList({});
      expect(read.error).toBeDefined();
      expect(read.error.code).toBe(-4);
      expect(read.error.message).toContain('迁移未完成');
      expect(read.error.message).toContain('no_such_table_xyz');
      const write = await service.budgetItemCreate({ budgetId: 1, itemName: 'x' });
      expect(write.error).toBeDefined();
      expect(write.error.code).toBe(-4);
      // 关键：业务请求没有执行任何 DDL——表依旧不存在
      const chk = await pool.query("SELECT to_regclass('public.no_such_table_xyz') AS t");
      expect(chk.rows[0].t).toBeNull();
      // 服务不再导出任何「自动迁移」入口
      expect(service.ensureCostTables).toBeUndefined();
    } finally {
      service.REQUIRED_SCHEMA.tables = origTables;
    }
    // 恢复后接口即时可用（无脏缓存）
    const after = await service.costRequestList({ pageSize: 1 });
    expect(after.error).toBeUndefined();
  });

  // ================= P1：金额解析严格化 =================
  it('P1：合法金额格式（1600 / 1600.00 / 0.07）精确到分', () => {
    expect(service.toCents('1600')).toBe(160000);
    expect(service.toCents('1600.00')).toBe(160000);
    expect(service.toCents(1600)).toBe(160000);
    expect(service.toCents('0.07')).toBe(7);
    expect(service.toCents(0.07)).toBe(7);
    expect(service.toCents('999999999999.99')).toBe(99999999999999);
    expect(service.toCents(' 1600.5 ')).toBe(160050); // 去空白
    expect(service.fromCents(30000)).toBe(300);
    expect(service.fromCents(null)).toBe(0);
  });

  it('P1：非法金额一律拒绝（null），绝不静默转 0 或截断', () => {
    expect(service.toCents('abc')).toBeNull();
    expect(service.toCents('1600.555')).toBeNull();     // 超两位小数：拒绝，不截断
    expect(service.toCents('1600.5元')).toBeNull();
    expect(service.toCents('1,600')).toBeNull();        // 千分位
    expect(service.toCents('-5')).toBeNull();           // 负值
    expect(service.toCents(-5)).toBeNull();
    expect(service.toCents('1e3')).toBeNull();          // 科学计数法
    expect(service.toCents(1e21)).toBeNull();
    expect(service.toCents(NaN)).toBeNull();
    expect(service.toCents(Infinity)).toBeNull();
    expect(service.toCents('')).toBeNull();
    expect(service.toCents(null)).toBeNull();
    expect(service.toCents(undefined)).toBeNull();
    expect(service.toCents({})).toBeNull();
    expect(service.toCents('1000000000000.00')).toBeNull(); // 超 NUMERIC(14,2) 范围
    expect(service.toCents('-5', { allowNegative: true })).toBe(-500); // 仅 DB 聚合净额允许负
  });

  it('P1：parseAmountInput 对零/非法给出可理解错误', () => {
    expect(service.parseAmountInput('0', '金额').error).toContain('必须大于 0');
    expect(service.parseAmountInput('abc', '金额').error).toContain('不是合法金额');
    expect(service.parseAmountInput(1600, '金额').cents).toBe(160000);
  });

  it('P1：非法金额文本进入业务接口 → 明确拒绝（不静默变 0）', async () => {
    if (!allowed) return;
    const bid = await newBudget();
    const rid = await newRequest(bid);
    const bad = await service.actualCreate({ requestId: rid, budgetId: bid, actualAmount: 'abc' });
    expect(bad.error).toBeDefined();
    expect(bad.error.message).toContain('不是合法金额');
    const zero = await service.actualCreate({ requestId: rid, budgetId: bid, actualAmount: 0 });
    expect(zero.error).toBeDefined();
    const cnt = await pool.query('SELECT COUNT(*)::int c FROM hse_cost_actual WHERE request_id=$1', [rid]);
    expect(cnt.rows[0].c).toBe(0);
  });

  // ================= P0-2：独立分摊接口（事务 + 锁定 + 总额校验） =================
  it('P0-2：实际 1600 首次分摊 1000 → 拒绝（非完整归因，不落库）', async () => {
    if (!allowed) return;
    const bid = await newBudget();
    const rid = await newRequest(bid);
    const pend = await service.actualCreate({ requestId: rid, budgetId: bid, actualAmount: 1600, actualDate: '2026-10-23' });
    expect(pend.error).toBeUndefined();
    createdActualIds.push(pend.payload.id);
    const r = await service.allocationCreate({ costActualId: pend.payload.id, bizDomainId: refs.sanitation.domainId, investCategoryId: refs.catId, amount: 1000 });
    expect(r.error).toBeDefined();
    expect(r.error.message).toContain('分摊总额校验失败');
    const al = await pool.query('SELECT COUNT(*)::int c FROM hse_cost_allocation WHERE cost_actual_id=$1 AND is_deleted=false', [pend.payload.id]);
    expect(al.rows[0].c).toBe(0); // 未落库
  });

  it('P0-2：已有 1000 归因后追加 700 → 拒绝；追加 600 → 成功（补齐）', async () => {
    if (!allowed) return;
    const bid = await newBudget();
    const rid = await newRequest(bid);
    const act = await service.actualCreate({ requestId: rid, budgetId: bid, actualAmount: 1600, actualDate: '2026-10-23' });
    expect(act.error).toBeUndefined();
    createdActualIds.push(act.payload.id);
    // 直接构造「已归因 1000」的中间态（测试夹具；正常业务流程中归因必须一次补齐，不留半条）
    await pool.query(
      'INSERT INTO hse_cost_allocation(cost_actual_id, request_id, biz_domain_id, invest_category_id, amount) VALUES($1,$2,$3,$4,1000)',
      [act.payload.id, rid, refs.sanitation.domainId, refs.catId]
    );
    const over = await service.allocationCreate({ costActualId: act.payload.id, bizDomainId: refs.landscape.domainId, investCategoryId: refs.catId, amount: 700 });
    expect(over.error).toBeDefined();
    expect(over.error.message).toContain('分摊总额校验失败');
    const alCount = await pool.query('SELECT COUNT(*)::int c FROM hse_cost_allocation WHERE cost_actual_id=$1 AND is_deleted=false', [act.payload.id]);
    expect(alCount.rows[0].c).toBe(1); // 超额追加未落库
    const ok = await service.allocationCreate({ costActualId: act.payload.id, bizDomainId: refs.landscape.domainId, investCategoryId: refs.catId, amount: 600 });
    expect(ok.error).toBeUndefined();
    const net = await pool.query("SELECT COALESCE(SUM(CASE WHEN record_type='reversal' THEN -amount ELSE amount END),0)::numeric s FROM hse_cost_allocation WHERE cost_actual_id=$1 AND is_deleted=false", [act.payload.id]);
    expect(parseFloat(net.rows[0].s)).toBe(1600);
    // 已补齐后再追加任意金额 → 拒绝（不允许超出实际金额）
    const again = await service.allocationCreate({ costActualId: act.payload.id, bizDomainId: refs.landscape.domainId, investCategoryId: refs.catId, amount: 1 });
    expect(again.error).toBeDefined();
  });

  it('P0-2：实际支出不存在 / 已删除 → 拒绝', async () => {
    if (!allowed) return;
    const noExist = await service.allocationCreate({ costActualId: 999999999, bizDomainId: refs.sanitation.domainId, investCategoryId: refs.catId, amount: 100 });
    expect(noExist.error).toBeDefined();
    expect(noExist.error.code).toBe(-2);
    const bid = await newBudget();
    const rid = await newRequest(bid);
    const act = await service.actualCreate({ requestId: rid, budgetId: bid, actualAmount: 1600, actualDate: '2026-10-23' });
    createdActualIds.push(act.payload.id);
    await pool.query('UPDATE hse_cost_actual SET is_deleted=true WHERE id=$1', [act.payload.id]);
    const deleted = await service.allocationCreate({ costActualId: act.payload.id, bizDomainId: refs.sanitation.domainId, investCategoryId: refs.catId, amount: 1600 });
    expect(deleted.error).toBeDefined();
    expect(deleted.error.code).toBe(-2);
    expect(deleted.error.message).toContain('已删除');
  });

  it('P0-2：并发追加分摊不超额（行锁串行化，恰好一条成功）', async () => {
    if (!allowed) return;
    const bid = await newBudget();
    const rid = await newRequest(bid);
    const act = await service.actualCreate({ requestId: rid, budgetId: bid, actualAmount: 1600, actualDate: '2026-10-23' });
    expect(act.error).toBeUndefined();
    createdActualIds.push(act.payload.id);
    const results = await Promise.all([1000, 600, 600, 1600].map((amt) =>
      service.allocationCreate({ costActualId: act.payload.id, bizDomainId: refs.sanitation.domainId, investCategoryId: refs.catId, amount: amt })
    ));
    const succeeded = results.filter((r) => !r.error);
    expect(succeeded.length).toBe(1); // 只有恰好补齐 1600 的那笔成功
    const net = await pool.query("SELECT COALESCE(SUM(CASE WHEN record_type='reversal' THEN -amount ELSE amount END),0)::numeric s FROM hse_cost_allocation WHERE cost_actual_id=$1 AND is_deleted=false", [act.payload.id]);
    expect(parseFloat(net.rows[0].s)).toBe(1600);
  });

  it('P0-2：分摊中途数据库异常 → 全量回滚，不留下部分分摊', async () => {
    if (!allowed) return;
    const bid = await newBudget();
    const rid = await newRequest(bid);
    const act = await service.actualCreate({ requestId: rid, budgetId: bid, actualAmount: 1600, actualDate: '2026-10-23' });
    createdActualIds.push(act.payload.id);
    // 金额校验可通过（1600），但引用不存在的投入类别 → FK 违规 → 整体回滚
    const r = await service.allocationCreate({ costActualId: act.payload.id, bizDomainId: refs.sanitation.domainId, investCategoryId: 999999999, amount: 1600 });
    expect(r.error).toBeDefined();
    const al = await pool.query('SELECT COUNT(*)::int c FROM hse_cost_allocation WHERE cost_actual_id=$1 AND is_deleted=false', [act.payload.id]);
    expect(al.rows[0].c).toBe(0);
  });

  it('P0-2：分摊修改流程（改后重算总额）；删除受同一约束', async () => {
    if (!allowed) return;
    const bid = await newBudget();
    const rid = await newRequest(bid);
    const full = await newAttributedActual(bid, rid, 1600); // 单条 1600 归因
    // 改为 1000 → 总额 1000 ≠ 1600 → 拒绝
    const bad = await service.allocationUpdate(full.allocationId, { amount: 1000 });
    expect(bad.error).toBeDefined();
    expect(bad.error.message).toContain('分摊修改后总额校验失败');
    // 改为 2600 → 拒绝（超额）
    const over = await service.allocationUpdate(full.allocationId, { amount: 2600 });
    expect(over.error).toBeDefined();
    // 只改维度不改金额 → 成功
    const dimOnly = await service.allocationUpdate(full.allocationId, { bizDomainId: refs.landscape.domainId });
    expect(dimOnly.error).toBeUndefined();
    // 已完整归因的实际支出：删除分摊 → 拒绝（破坏归因完整性）
    const del = await service.allocationDelete(full.allocationId);
    expect(del.error).toBeDefined();
    expect(del.error.message).toContain('删除会破坏归因完整性');
    const still = await pool.query('SELECT COUNT(*)::int c FROM hse_cost_allocation WHERE id=$1 AND is_deleted=false', [full.allocationId]);
    expect(still.rows[0].c).toBe(1);
    // 申请级计划归因（未关联实际支出）→ 允许删除
    const req2 = await service.costRequestCreate({ budgetId: bid, title: '计划归因申请', applyAmount: 100, allocations: [{ bizDomainId: refs.sanitation.domainId, investCategoryId: refs.catId, amount: 100 }] });
    createdRequestIds.push(req2.payload.id);
    const planAl = await pool.query('SELECT id FROM hse_cost_allocation WHERE request_id=$1 AND cost_actual_id IS NULL', [req2.payload.id]);
    const delPlan = await service.allocationDelete(planAl.rows[0].id);
    expect(delPlan.error).toBeUndefined();
  });

  it('P0-2：冲销记录必须用 reversal，类型不一致 → 拒绝', async () => {
    if (!allowed) return;
    const bid = await newBudget();
    const rid = await newRequest(bid);
    const rev = await service.actualCreate({ requestId: rid, budgetId: bid, actualAmount: 10000, actualDate: '2026-10-24', recordType: 'reversal', allocations: [{ bizDomainId: refs.sanitation.domainId, investCategoryId: refs.catId, amount: 10000 }] });
    expect(rev.error).toBeUndefined();
    createdActualIds.push(rev.payload.id);
    // 对 reversal 实际支出追加 normal 分摊 → 拒绝
    const wrong = await service.allocationCreate({ costActualId: rev.payload.id, bizDomainId: refs.sanitation.domainId, investCategoryId: refs.catId, amount: 100, recordType: 'normal' });
    expect(wrong.error).toBeDefined();
    expect(wrong.error.message).toContain('必须与实际支出一致');
  });

  // ================= 回归：事务回滚 / 冲销净额 =================
  it('实际金额与分摊一致 → 成功；不一致 → 失败且不落库', async () => {
    if (!allowed) return;
    const bid = await newBudget();
    const rid = await newRequest(bid);
    const good = await service.actualCreate({
      requestId: rid, budgetId: bid, actualAmount: 30000, actualDate: '2026-10-23',
      allocations: [{ bizDomainId: refs.sanitation.domainId, opTypeId: refs.sanitation.opTypeId, investCategoryId: refs.catId, amount: 30000 }],
    });
    expect(good.error).toBeUndefined();
    createdActualIds.push(good.payload.id);
    const bad = await service.actualCreate({
      requestId: rid, budgetId: bid, actualAmount: 30000,
      allocations: [{ bizDomainId: refs.sanitation.domainId, investCategoryId: refs.catId, amount: 20000 }],
    });
    expect(bad.error).toBeDefined();
  });

  it('多领域分摊合计一致 → 成功；不足/超出 → 失败', async () => {
    if (!allowed) return;
    const bid = await newBudget();
    const rid = await newRequest(bid);
    const okr = await service.actualCreate({
      requestId: rid, budgetId: bid, actualAmount: 30000, actualDate: '2026-10-23',
      allocations: [
        { bizDomainId: refs.sanitation.domainId, investCategoryId: refs.catId, amount: 10000 },
        { bizDomainId: refs.landscape.domainId, investCategoryId: refs.catId, amount: 20000 },
      ],
    });
    expect(okr.error).toBeUndefined();
    createdActualIds.push(okr.payload.id);
    expect((await service.actualCreate({ requestId: rid, budgetId: bid, actualAmount: 30000, allocations: [{ bizDomainId: refs.sanitation.domainId, amount: 25000 }] })).error).toBeDefined();
    expect((await service.actualCreate({ requestId: rid, budgetId: bid, actualAmount: 30000, allocations: [{ bizDomainId: refs.sanitation.domainId, amount: 35000 }] })).error).toBeDefined();
  });

  it('分摊中途数据库异常 → 实际支出与分摊全部回滚（无半条记录）', async () => {
    if (!allowed) return;
    const bid = await newBudget();
    const rid = await newRequest(bid);
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

  it('退款/冲销为独立反向记录，净支出=正常-冲销，不改历史', async () => {
    if (!allowed) return;
    const bid = await newBudget();
    const rid = await newRequest(bid);
    await service.actualCreate({ requestId: rid, budgetId: bid, actualAmount: 30000, actualDate: '2026-10-23', allocations: [{ bizDomainId: refs.sanitation.domainId, investCategoryId: refs.catId, amount: 30000 }] });
    await service.actualCreate({ requestId: rid, budgetId: bid, actualAmount: 10000, actualDate: '2026-10-24', recordType: 'reversal', allocations: [{ bizDomainId: refs.sanitation.domainId, investCategoryId: refs.catId, amount: 10000 }] });
    const fin = await service.budgetFinancials(bid);
    expect(fin.payload.actual).toBe(20000); // 30000 - 10000
    const cnt = await pool.query('SELECT COUNT(*)::int c FROM hse_cost_actual WHERE request_id=$1 AND is_deleted=false', [rid]);
    expect(cnt.rows[0].c).toBe(2);
  });

  // ================= 回归：财务口径一致性 =================
  it('财务口径：已承诺/待执行承诺/实际/余额/可用/承诺率/执行率（不重复扣减）', async () => {
    if (!allowed) return;
    const bid = await newBudget(100000);
    const rid = await newRequest(bid, 50000);
    await service.costRequestUpdate(rid, { status: 'approved', approvedAmount: 50000 });
    const cmt = await pool.query("SELECT id FROM hse_cost_commitment WHERE request_id=$1 AND status='active' AND is_deleted=false", [rid]);
    const commitmentId = cmt.rows[0].id;
    await service.actualCreate({ requestId: rid, budgetId: bid, commitmentId, actualAmount: 30000, actualDate: '2026-10-23', allocations: [{ bizDomainId: refs.sanitation.domainId, investCategoryId: refs.catId, amount: 30000 }] });
    const fin = await service.budgetFinancials(bid);
    expect(fin.payload.budgetAmount).toBe(100000);
    expect(fin.payload.committed).toBe(50000);
    expect(fin.payload.pendingCommitted).toBe(20000);
    expect(fin.payload.actual).toBe(30000);
    expect(fin.payload.balance).toBe(70000);
    expect(fin.payload.availableUncommitted).toBe(80000);
    expect(fin.payload.commitmentRate).toBe(50);
    expect(fin.payload.executionRate).toBe(30);
    expect(fin.payload.availableUncommitted).not.toBe(100000 - 50000 - 30000);
  });

  it('费用统计：按领域/类别汇总与总量一致，未归因单列，年度用 actual_date 过滤', async () => {
    if (!allowed) return;
    const bid = await newBudget();
    const rid = await newRequest(bid);
    await service.actualCreate({ requestId: rid, budgetId: bid, actualAmount: 30000, actualDate: '2099-06-01', allocations: [{ bizDomainId: refs.sanitation.domainId, investCategoryId: refs.catId, amount: 30000 }] });
    await service.actualCreate({ requestId: rid, budgetId: bid, actualAmount: 20000, actualDate: '2099-06-02', allocations: [{ bizDomainId: refs.landscape.domainId, investCategoryId: refs.catId, amount: 20000 }] });
    await service.actualCreate({ requestId: rid, budgetId: bid, actualAmount: 5000, actualDate: '2099-06-03' }); // 待归因（无分摊）
    const st = await service.costStats({ budgetYear: 2099 });
    expect(st.payload.totalActual).toBe(55000);
    expect(st.payload.allocatedTotal).toBe(50000);
    expect(st.payload.unattributedActual).toBe(5000);
    const domSum = st.payload.byDomain.reduce((s, d) => s + d.amount, 0);
    const catSum = st.payload.byCategory.reduce((s, c) => s + c.amount, 0);
    expect(domSum).toBe(st.payload.allocatedTotal);
    expect(catSum).toBe(st.payload.allocatedTotal);
    const san = st.payload.byDomain.find((d) => d.bizDomain === '环卫作业');
    const lan = st.payload.byDomain.find((d) => d.bizDomain === '市政园林作业');
    expect(san && san.amount).toBe(30000);
    expect(lan && lan.amount).toBe(20000);
  });

  // ================= 回归：审批防重与状态一致性 =================
  it('重复/并发审批同一申请 → 仅一条有效承诺', async () => {
    if (!allowed) return;
    const bid = await newBudget();
    const rid = await newRequest(bid, 50000);
    await Promise.all([
      service.costRequestUpdate(rid, { status: 'approved', approvedAmount: 50000 }),
      service.costRequestUpdate(rid, { status: 'approved', approvedAmount: 50000 }),
      service.costRequestUpdate(rid, { status: 'approved', approvedAmount: 50000 }),
    ]);
    await service.costRequestUpdate(rid, { status: 'approved', approvedAmount: 50000 });
    const c = await pool.query("SELECT COUNT(*)::int c, COALESCE(SUM(amount),0) s FROM hse_cost_commitment WHERE request_id=$1 AND status='active' AND is_deleted=false", [rid]);
    expect(c.rows[0].c).toBe(1);
    expect(parseFloat(c.rows[0].s)).toBe(50000);
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

  it('审批金额非法 → 拒绝，不生成承诺', async () => {
    if (!allowed) return;
    const bid = await newBudget();
    const rid = await newRequest(bid, 50000);
    const r = await service.costRequestUpdate(rid, { status: 'approved', approvedAmount: 'abc' });
    expect(r.error).toBeDefined();
    const c = await pool.query("SELECT COUNT(*)::int c FROM hse_cost_commitment WHERE request_id=$1", [rid]);
    expect(c.rows[0].c).toBe(0);
  });

  it('审批后驳回（未被实际消耗）→ 释放承诺；已被消耗 → 不释放', async () => {
    if (!allowed) return;
    const bid = await newBudget();
    const rid = await newRequest(bid, 50000);
    await service.costRequestUpdate(rid, { status: 'approved', approvedAmount: 50000 });
    await service.costRequestUpdate(rid, { status: 'rejected', rejectReason: '预算调整' });
    let c = await pool.query("SELECT COUNT(*)::int c FROM hse_cost_commitment WHERE request_id=$1 AND status='active' AND is_deleted=false", [rid]);
    let cancelled = await pool.query("SELECT COUNT(*)::int c FROM hse_cost_commitment WHERE request_id=$1 AND status='cancelled' AND is_deleted=false", [rid]);
    expect(c.rows[0].c).toBe(0);
    expect(cancelled.rows[0].c).toBe(1);

    const rid2 = await newRequest(bid, 50000);
    await service.costRequestUpdate(rid2, { status: 'approved', approvedAmount: 50000 });
    await service.actualCreate({ requestId: rid2, budgetId: bid, actualAmount: 30000, actualDate: '2026-10-23', allocations: [{ bizDomainId: refs.sanitation.domainId, investCategoryId: refs.catId, amount: 30000 }] });
    await service.costRequestUpdate(rid2, { status: 'rejected' });
    c = await pool.query("SELECT COUNT(*)::int c FROM hse_cost_commitment WHERE request_id=$1 AND status='active' AND is_deleted=false", [rid2]);
    expect(c.rows[0].c).toBe(1); // 资金已花，不能凭空释放
  });

  it('审计既有重复有效承诺：只读、只报不删', async () => {
    if (!allowed) return;
    const r = await service.auditDuplicateCommitments();
    expect(r.error).toBeUndefined();
    expect(Array.isArray(r.payload)).toBe(true);
  });

  // ================= P0-3：预算导入防重 =================
  it('P0-3：预览→确认插入→同批次重复确认不重复插入', async () => {
    if (!allowed) return;
    const file = tmpXlsx('imp1', [
      { 预算年度: 2026, 预算编码: 'IMP-' + ts + '-a', 项目名称: '导入项目', 明细名称: '导入事项', 预算金额: 20000, 部门: '测试部' },
      { 预算年度: 2026, 预算编码: 'IMP-' + ts + '-b', 项目名称: '导入项目2', 明细名称: '导入事项2', 预算金额: 15000 },
    ]);
    const prev = await service.budgetImportPreview(file, { fileName: 'imp1.xlsx' });
    expect(prev.error).toBeUndefined();
    expect(prev.payload.batchNo).toBeTruthy();
    expect(prev.payload.errorCount).toBe(0);
    const conf = await service.budgetImportConfirm(file, { operatorName: 'test', fileName: 'imp1.xlsx' }, prev.payload.batchNo);
    expect(conf.error).toBeUndefined();
    expect(conf.payload.inserted).toBe(2);
    const conf2 = await service.budgetImportConfirm(file, { operatorName: 'test', fileName: 'imp1.xlsx' }, prev.payload.batchNo);
    expect(conf2.error).toBeUndefined();
    expect(conf2.payload.duplicateConfirm).toBe(true);
    expect(conf2.payload.inserted).toBe(2); // 返回首次结果，不重复插入
    const dbCount = await pool.query("SELECT COUNT(*)::int c FROM hse_safety_budget WHERE budget_code IN ('IMP-' || $1 || '-a','IMP-' || $1 || '-b')", [String(ts)]);
    expect(dbCount.rows[0].c).toBe(2);
  });

  it('P0-3：确认不带批次号 → 拒绝（强制预览-确认绑定）', async () => {
    if (!allowed) return;
    const file = tmpXlsx('imp2', [
      { 预算年度: 2026, 预算编码: 'IMP-' + ts + '-c', 项目名称: '导入项目3', 明细名称: '导入事项3', 预算金额: 1000 },
    ]);
    const prev = await service.budgetImportPreview(file, { fileName: 'imp2.xlsx' });
    expect(prev.error).toBeUndefined();
    const conf = await service.budgetImportConfirm(file, { operatorName: 'test', fileName: 'imp2.xlsx' }, '');
    expect(conf.error).toBeDefined();
    expect(conf.error.message).toContain('缺少导入批次号');
  });

  it('P0-3：确认时文件被替换 → 拒绝并要求重新预览', async () => {
    if (!allowed) return;
    const fileA = tmpXlsx('impA', [
      { 预算年度: 2026, 预算编码: 'IMP-' + ts + '-d', 项目名称: '导入项目A', 明细名称: '导入事项A', 预算金额: 1000 },
    ]);
    const prev = await service.budgetImportPreview(fileA, { fileName: 'impA.xlsx' });
    expect(prev.error).toBeUndefined();
    const fileB = tmpXlsx('impB', [
      { 预算年度: 2026, 预算编码: 'IMP-' + ts + '-e', 项目名称: '导入项目B', 明细名称: '导入事项B', 预算金额: 2000 },
    ]);
    const conf = await service.budgetImportConfirm(fileB, { operatorName: 'test', fileName: 'impB.xlsx' }, prev.payload.batchNo);
    expect(conf.error).toBeDefined();
    expect(conf.error.message).toContain('不一致');
    const dbCount = await pool.query("SELECT COUNT(*)::int c FROM hse_safety_budget WHERE budget_code IN ('IMP-' || $1 || '-d','IMP-' || $1 || '-e')", [String(ts)]);
    expect(dbCount.rows[0].c).toBe(0); // 什么都没写入
  });

  it('P0-3：带编码重复导入 → 全部跳过；空编码按业务键重复导入 → 全部跳过', async () => {
    if (!allowed) return;
    // 1) 编码重复
    const coded = tmpXlsx('impC', [
      { 预算年度: 2026, 预算编码: 'IMP-' + ts + '-f', 项目名称: '编码重复项目', 明细名称: '事项', 预算金额: 3000 },
    ]);
    const p1 = await service.budgetImportPreview(coded, { fileName: 'impC.xlsx' });
    const c1 = await service.budgetImportConfirm(coded, { operatorName: 'test', fileName: 'impC.xlsx' }, p1.payload.batchNo);
    expect(c1.payload.inserted).toBe(1);
    const p2 = await service.budgetImportPreview(coded, { fileName: 'impC.xlsx' });
    expect(p2.payload.alreadyImported).toBe(true);
    expect(p2.payload.duplicateCount).toBe(1);
    const c2 = await service.budgetImportConfirm(coded, { operatorName: 'test', fileName: 'impC.xlsx' }, p2.payload.batchNo);
    expect(c2.payload.inserted).toBe(0);
    expect(c2.payload.skipped).toBe(1);
    // 2) 空编码业务键重复
    const noCode = tmpXlsx('impD', [
      { 预算年度: 2026, 项目名称: '无编码导入项目' + ts, 明细名称: '事项X', 预算金额: 4321 },
    ]);
    const p3 = await service.budgetImportPreview(noCode, { fileName: 'impD.xlsx' });
    expect(p3.payload.duplicateCount).toBe(0);
    const c3 = await service.budgetImportConfirm(noCode, { operatorName: 'test', fileName: 'impD.xlsx' }, p3.payload.batchNo);
    expect(c3.payload.inserted).toBe(1);
    const p4 = await service.budgetImportPreview(noCode, { fileName: 'impD.xlsx' });
    expect(p4.payload.duplicateCount).toBe(1); // 业务键判重
    const c4 = await service.budgetImportConfirm(noCode, { operatorName: 'test', fileName: 'impD.xlsx' }, p4.payload.batchNo);
    expect(c4.payload.inserted).toBe(0);
    expect(c4.payload.skipped).toBe(1);
  });

  it('P0-3：不同文件但内容相同（指纹一致）→ 判重跳过，不覆盖', async () => {
    if (!allowed) return;
    const fileA = tmpXlsx('impE', [
      { 预算年度: 2026, 预算编码: 'IMP-' + ts + '-g', 项目名称: '同内容项目', 明细名称: '事项', 预算金额: 5000 },
    ]);
    const copy = fileA.replace(/\.xlsx$/, '') + '_copy.xlsx';
    fs.copyFileSync(fileA, copy);
    tmpFiles.push(copy);
    const p1 = await service.budgetImportPreview(fileA, { fileName: 'impE.xlsx' });
    await service.budgetImportConfirm(fileA, { operatorName: 'test', fileName: 'impE.xlsx' }, p1.payload.batchNo);
    const p2 = await service.budgetImportPreview(copy, { fileName: 'impE_copy.xlsx' });
    expect(p2.payload.alreadyImported).toBe(true);
    expect(p2.payload.duplicateCount).toBe(1);
    const c2 = await service.budgetImportConfirm(copy, { operatorName: 'test', fileName: 'impE_copy.xlsx' }, p2.payload.batchNo);
    expect(c2.payload.inserted).toBe(0);
    expect(c2.payload.skipped).toBe(1);
  });

  it('P0-3：并发确认同一批次 → 不重复插入', async () => {
    if (!allowed) return;
    const file = tmpXlsx('impF', [
      { 预算年度: 2026, 预算编码: 'IMP-' + ts + '-h1', 项目名称: '并发同批次项目', 明细名称: '事项1', 预算金额: 100 },
      { 预算年度: 2026, 预算编码: 'IMP-' + ts + '-h2', 项目名称: '并发同批次项目', 明细名称: '事项2', 预算金额: 200 },
    ]);
    const prev = await service.budgetImportPreview(file, { fileName: 'impF.xlsx' });
    const [r1, r2] = await Promise.all([
      service.budgetImportConfirm(file, { operatorName: 'test', fileName: 'impF.xlsx' }, prev.payload.batchNo),
      service.budgetImportConfirm(file, { operatorName: 'test', fileName: 'impF.xlsx' }, prev.payload.batchNo),
    ]);
    expect(r1.error).toBeUndefined();
    expect(r2.error).toBeUndefined();
    const dbCount = await pool.query("SELECT COUNT(*)::int c FROM hse_safety_budget WHERE budget_code LIKE 'IMP-' || $1 || '-h%'", [String(ts)]);
    expect(dbCount.rows[0].c).toBe(2); // 恰好两条，无重复
  });

  it('P0-3：两个并发批次导入同一预算 → 数据库约束保证只插一条', async () => {
    if (!allowed) return;
    const mk = (suffix) => tmpXlsx('impG' + suffix, [
      { 预算年度: 2026, 预算编码: 'IMP-' + ts + '-i', 项目名称: '并发批次项目', 明细名称: '事项', 预算金额: 777 },
    ]);
    const f1 = mk('1');
    const f2 = mk('2');
    const p1 = await service.budgetImportPreview(f1, { fileName: 'impG1.xlsx' });
    const p2 = await service.budgetImportPreview(f2, { fileName: 'impG2.xlsx' });
    const [c1, c2] = await Promise.all([
      service.budgetImportConfirm(f1, { operatorName: 'test', fileName: 'impG1.xlsx' }, p1.payload.batchNo),
      service.budgetImportConfirm(f2, { operatorName: 'test', fileName: 'impG2.xlsx' }, p2.payload.batchNo),
    ]);
    expect(c1.error).toBeUndefined();
    expect(c2.error).toBeUndefined();
    expect(c1.payload.inserted + c2.payload.inserted).toBe(1); // 并发防重：仅一条落地
    const dbCount = await pool.query("SELECT COUNT(*)::int c FROM hse_safety_budget WHERE budget_code = 'IMP-' || $1 || '-i'", [String(ts)]);
    expect(dbCount.rows[0].c).toBe(1);
  });

  it('P0-3：部分记录非法 → 失败计数与原因，合法记录照常插入', async () => {
    if (!allowed) return;
    const file = tmpXlsx('impH', [
      { 预算年度: 2026, 预算编码: 'IMP-' + ts + '-j1', 项目名称: '部分非法项目', 明细名称: '事项1', 预算金额: 1000 },
      { 预算年度: 2026, 预算编码: 'IMP-' + ts + '-j2', 项目名称: '部分非法项目', 明细名称: '事项2', 预算金额: 'abc' },
      { 预算年度: '二十六年', 预算编码: 'IMP-' + ts + '-j3', 项目名称: '部分非法项目', 明细名称: '事项3', 预算金额: 1000 },
    ]);
    const prev = await service.budgetImportPreview(file, { fileName: 'impH.xlsx' });
    expect(prev.payload.errorCount).toBe(2);
    expect(prev.payload.total).toBe(3);
    const conf = await service.budgetImportConfirm(file, { operatorName: 'test', fileName: 'impH.xlsx' }, prev.payload.batchNo);
    expect(conf.payload.inserted).toBe(1);
    expect(conf.payload.failed).toBe(2);
    expect(Array.isArray(conf.payload.errors)).toBe(true);
    expect(conf.payload.errors.length).toBeGreaterThan(0);
    // 批次留痕：指纹/操作人/计数/状态
    const batch = await pool.query('SELECT * FROM hse_cost_import_batch WHERE batch_no=$1', [prev.payload.batchNo]);
    expect(batch.rows[0].status).toBe('done');
    expect(batch.rows[0].file_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(batch.rows[0].operator_name).toBe('test');
    expect(batch.rows[0].inserted).toBe(1);
    expect(batch.rows[0].failed).toBe(2);
  });

  it('P0-3：导入失败（解析错误）→ 什么都不写，批次标记 failed，重试可成功', async () => {
    if (!allowed) return;
    // 伪造 ZIP 头的内容 → XLSX 解析抛错（模拟损坏/非 Excel 文件）
    const garbage = path.join(os.tmpdir(), `cost_garbage_${ts}_${Math.random().toString(36).slice(2, 6)}.xlsx`);
    fs.writeFileSync(garbage, Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('garbagegarbagegarbage')]));
    tmpFiles.push(garbage);
    const prev = await service.budgetImportPreview(garbage, { fileName: 'garbage.xlsx' });
    expect(prev.error).toBeDefined();
    expect(prev.error.message).toContain('文件解析失败');
    // 确认同样拒绝，且不产生任何预算
    const good = tmpXlsx('impI', [
      { 预算年度: 2026, 预算编码: 'IMP-' + ts + '-k', 项目名称: '失败重试项目', 明细名称: '事项', 预算金额: 900 },
    ]);
    const pGood = await service.budgetImportPreview(good, { fileName: 'impI.xlsx' });
    const confBad = await service.budgetImportConfirm(garbage, { operatorName: 'test', fileName: 'garbage.xlsx' }, pGood.payload.batchNo);
    expect(confBad.error).toBeDefined();
    const dbCount = await pool.query("SELECT COUNT(*)::int c FROM hse_safety_budget WHERE budget_code = 'IMP-' || $1 || '-k'", [String(ts)]);
    expect(dbCount.rows[0].c).toBe(0);
    // 同一批次此时应已被标记 failed；重新走「预览→确认」可成功
    const batch = await pool.query("SELECT status FROM hse_cost_import_batch WHERE batch_no=$1", [pGood.payload.batchNo]);
    expect(batch.rows[0].status).toBe('failed');
    const p2 = await service.budgetImportPreview(good, { fileName: 'impI.xlsx' });
    const conf2 = await service.budgetImportConfirm(good, { operatorName: 'test', fileName: 'impI.xlsx' }, p2.payload.batchNo);
    expect(conf2.error).toBeUndefined();
    expect(conf2.payload.inserted).toBe(1);
  });

  it('P0-3：通用 CRUD 禁止绕过实际支出/分摊校验', async () => {
    if (!allowed) return;
    const r1 = await service.genericCrud('hse_cost_actual', null, { actual_amount: 999 }, {});
    expect(r1.error).toBeDefined();
    const r2 = await service.genericCrud('hse_cost_allocation', null, { amount: 999 }, {});
    expect(r2.error).toBeDefined();
  });

  // ================= 回归：申请创建携带计划归因 =================
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
