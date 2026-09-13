/**
 * 保险模块 · 全量统计服务（/stats/overview）—— PostgreSQL + 内存降级双模式
 * 从 routes/insurance.js /stats/overview 子域迁移，业务逻辑 + SQL，无 express 依赖。
 * 跨域共享辅助取自 services/insuranceShared（buildPersonnelStatsPivotSql / ensureOtherInsuranceTable / memoryStores / pickBestInsuranceRecord / calcInsuranceStatus / calcPersonStatus）。
 */

const { pool, isConnected } = require('../config/db');
const {
  ensureOtherInsuranceTable,
  memoryStores,
  pickBestInsuranceRecord,
  calcInsuranceStatus,
  calcPersonStatus,
  buildPersonnelStatsPivotSql,
} = require('./insuranceShared');

// GET /stats/overview — 保险模块全量统计（供安全总览调用）
async function overViewStats() {
  const result = {
    personnel: { total: 0, covered: 0, expired: 0, expiring: 0, pending: 0 },
    vehicle: { total: 0, active: 0, expired: 0, expiring: 0, totalPremium: 0 },
    other: { total: 0, normal: 0, expiring: 0, expired: 0, totalPremium: 0, totalCoverage: 0 }
  };

  if (isConnected()) {
    // 任务9：personnel 以当前花名册人员为主，复用 /personnel/stats 的确定性双险透视与
    // 人员级互斥四态（buildPersonnelStatsPivotSql），不再按保险记录数简单统计。
    const pv = await pool.query(buildPersonnelStatsPivotSql());
    result.personnel.total = pv.rows[0].total;
    result.personnel.covered = pv.rows[0].covered;
    result.personnel.expired = pv.rows[0].expired;
    result.personnel.pending = pv.rows[0].pending;
    result.personnel.expiring = pv.rows[0].expiring;

    const r5 = await pool.query("SELECT COUNT(*)::int AS v FROM vehicles WHERE is_deleted = false");
    result.vehicle.total = r5.rows[0].v;
    const r6 = await pool.query("SELECT COUNT(*)::int AS v FROM vehicles WHERE is_deleted = false AND insurance_end >= CURRENT_DATE");
    result.vehicle.active = r6.rows[0].v;
    const r7 = await pool.query("SELECT COUNT(*)::int AS v FROM vehicles WHERE is_deleted = false AND insurance_end < CURRENT_DATE");
    result.vehicle.expired = r7.rows[0].v;
    const r8 = await pool.query("SELECT COUNT(*)::int AS v FROM vehicles WHERE is_deleted = false AND insurance_end >= CURRENT_DATE AND insurance_end <= CURRENT_DATE + INTERVAL '30 days'");
    result.vehicle.expiring = r8.rows[0].v;
    const r9 = await pool.query("SELECT COALESCE(SUM(premium),0)::float AS v FROM vehicles WHERE is_deleted = false");
    result.vehicle.totalPremium = r9.rows[0].v;

    await ensureOtherInsuranceTable();
    const r10 = await pool.query("SELECT COUNT(*)::int AS v FROM other_insurance WHERE is_deleted = false");
    result.other.total = r10.rows[0].v;
    const r11 = await pool.query("SELECT COUNT(*)::int AS v FROM other_insurance WHERE is_deleted = false AND expire_date > CURRENT_DATE + INTERVAL '30 days'");
    result.other.normal = r11.rows[0].v;
    const r12 = await pool.query("SELECT COUNT(*)::int AS v FROM other_insurance WHERE is_deleted = false AND expire_date >= CURRENT_DATE AND expire_date <= CURRENT_DATE + INTERVAL '30 days'");
    result.other.expiring = r12.rows[0].v;
    const r13 = await pool.query("SELECT COUNT(*)::int AS v FROM other_insurance WHERE is_deleted = false AND expire_date < CURRENT_DATE");
    result.other.expired = r13.rows[0].v;
    const r14 = await pool.query("SELECT COALESCE(SUM(premium),0)::float AS p, COALESCE(SUM(coverage_amount),0)::float AS c FROM other_insurance WHERE is_deleted = false");
    result.other.totalPremium = r14.rows[0].p;
    result.other.totalCoverage = r14.rows[0].c;
  } else {
    // 任务9：overview 内存模式 personnel 复用与 /personnel/stats 相同的人数口径
    const byEmp = new Map();
    memoryStores.personnel.filter(r => !r.is_deleted && r.employee_id != null).forEach(r => {
      if (!byEmp.has(r.employee_id)) byEmp.set(r.employee_id, { emp: [], inj: [] });
      const bucket = byEmp.get(r.employee_id);
      if (r.insurance_type === '雇主责任险') bucket.emp.push(r);
      else if (r.insurance_type === '工伤保险') bucket.inj.push(r);
    });
    const today = new Date();
    let covered = 0;
    let expired = 0;
    let pending = 0;
    let expiring = 0;
    byEmp.forEach((bucket) => {
      const emp = pickBestInsuranceRecord(bucket.emp, today);
      const inj = pickBestInsuranceRecord(bucket.inj, today);
      const es = emp ? calcInsuranceStatus({ isCurrent: emp.is_current, startDate: emp.start_date, expireDate: emp.expire_date }, today) : 'uninsured';
      const is2 = inj ? calcInsuranceStatus({ isCurrent: inj.is_current, startDate: inj.start_date, expireDate: inj.expire_date }, today) : 'uninsured';
      const personState = calcPersonStatus(es, is2);
      if (personState === 'insured' || personState === 'expiring') { covered++; if (es === 'expiring' || is2 === 'expiring') expiring++; }
      else if (personState === 'expired') expired++;
      else pending++;
    });
    result.personnel.total = byEmp.size;
    result.personnel.covered = covered;
    result.personnel.expired = expired;
    result.personnel.pending = pending;
    result.personnel.expiring = expiring;
  }

  return { __t: 'json', payload: result, message: '查询成功' };
}

module.exports = { overViewStats };