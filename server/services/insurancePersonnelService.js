/**
 * 保险模块 · 人员保险服务（personnel_insurance 表）—— PostgreSQL + 内存降级双模式
 * 从 routes/insurance.js /personnel 子域迁移，业务逻辑 + SQL，无 express 依赖。
 * 跨域共享辅助取自 services/insuranceShared（calcInsuranceStatus / formatPersonnelIns / policyPivotSql / personLevelSql 等）。
 */

const { pool, isConnected } = require('../config/db');
const logger = require('../utils/logger');
const { paginateMemory, buildMemoryRecord, camelKeys } = require('../utils/commonResponse');
const { normalizeInsuranceType } = require('./insuranceTypeDict');
const { getBusinessDayStr, BUSINESS_DAY_SQL } = require('./businessDay');
const {
  findActivePolicyConflict,
  findActivePolicyConflictInMemory,
  isPolicyActiveOnBusinessDay,
} = require('./personnelInsurancePolicyService');
const { resolveEmployee } = require('./employeeResolver');
const {
  initMemoryData,
  memoryStores,
  memoryCounters,
  toBusinessDayStr,
  cleanModel,
  toDateStr,
  maskIdCard,
  calcExpiryStatus,
  calcInsuranceStatus,
  calcPersonStatus,
  calcComplianceStatus,
  pickBestInsuranceRecord,
  formatPersonnelIns,
  formatPersonnelInsPivoted,
  policyStateSql,
  policyPivotSql,
  activePolicySql,
  snapshotMismatchSql,
  personLevelSql,
  complianceStatusSql,
  buildPersonnelStatsPivotSql,
  ACTIVE_ROSTER_JOIN,
} = require('./insuranceShared');

// 【B-1-P1-03-02】正式员工资格片段（花名册权威口径，单一事实源 employeeStatusDict）
const { formalEmployeeEligibilitySql } = require('./employeeStatusDict');

const _insuranceRule = require('../config/hseRules/insurance-rule.json');

/** 列表查询异常统一收敛为安全文案（原实现 try/catch 兜底：不向客户端泄漏内部 SQL/连接细节） */
function safeListQueryError(err, page, pageSize) {
  logger.error('[Insurance] 人员列表查询失败:', { message: err.message, stack: err.stack });
  return { __t: 'list', error: { code: -1, message: '查询失败，请稍后重试' }, list: [], total: 0, page: parseInt(page), pageSize: parseInt(pageSize) };
}

function _calcAge(birthDate) {
  if (!birthDate) return 0;
  const bd = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - bd.getFullYear();
  const m = now.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) age--;
  return age;
}
function _matchInsuranceRule(person) {
  const age = person.age || _calcAge(person.birth_date);
  const gender = person.gender || '';
  const thresholds = _insuranceRule.overAgeThresholds;
  const isOverAge = (gender === '男' && age >= thresholds.male) || (gender === '女' && age >= thresholds.female);
  const rules = _insuranceRule.personnelInsurance.rules;
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const cond = rule.conditions;
    if (cond.ageGender === 'overAge' && isOverAge) return { matched: true, rule, isOverAge, age, recommendedPlan: rule.insurancePlan };
    if (cond.ageGender === 'adult' && !isOverAge) {
      if (cond.hasFiveIns === true && person.has_five_ins === true) return { matched: true, rule, isOverAge, age, recommendedPlan: rule.insurancePlan };
      if (cond.hasFiveIns === false && person.has_five_ins !== true) return { matched: true, rule, isOverAge, age, recommendedPlan: rule.insurancePlan };
    }
  }
  return { matched: false, isOverAge, age };
}

// GET /personnel — 人员保险列表（透视）
async function listPersonnel(query) {
  const { page = 1, pageSize = 20, keyword, department, insuranceStatus, isHighRisk, highRiskCategory, syncStatus, complianceStatus } = query;

  if (!isConnected()) {
    const byEmp = new Map();
    memoryStores.personnel.filter(r => !r.is_deleted && r.employee_id != null).forEach(r => {
      if (!byEmp.has(r.employee_id)) byEmp.set(r.employee_id, { emp: [], inj: [], info: r });
      const bucket = byEmp.get(r.employee_id);
      if (r.insurance_type === '雇主责任险') bucket.emp.push(r);
      else if (r.insurance_type === '工伤保险') bucket.inj.push(r);
    });
    let list = [];
    byEmp.forEach((bucket, employeeId) => {
      const emp = pickBestInsuranceRecord(bucket.emp, new Date());
      const inj = pickBestInsuranceRecord(bucket.inj, new Date());
      const base = bucket.info;
      const row = {
        name: base.person_name,
        employee_id: employeeId,
        id_card: base.id_card || base.idcard || '',
        org_name: base.department || base.dept || '',
        position_name: base.position || base.post || '',
        gender: base.gender || '',
        age: base.age != null ? base.age : null,
        personnel_id: base.personnel_id != null ? base.personnel_id : employeeId,
        emp_id: emp ? emp.id : null,
        emp_policy_no: emp ? emp.policy_no : null,
        emp_start_date: emp ? emp.start_date : null,
        emp_expire_date: emp ? emp.expire_date : null,
        emp_is_current: emp ? (emp.is_current === true) : null,
        emp_premium: emp ? emp.premium : null,
        emp_coverage: emp ? emp.coverage_amount : null,
        emp_department: emp ? emp.department : null,
        emp_position: emp ? emp.position : null,
        emp_person_name: emp ? emp.person_name : null,
        inj_id: inj ? inj.id : null,
        inj_policy_no: inj ? inj.policy_no : null,
        inj_start_date: inj ? inj.start_date : null,
        inj_expire_date: inj ? inj.expire_date : null,
        inj_is_current: inj ? (inj.is_current === true) : null,
        inj_premium: inj ? inj.premium : null,
        inj_coverage: inj ? inj.coverage_amount : null,
        inj_department: inj ? inj.department : null,
        inj_position: inj ? inj.position : null,
        inj_person_name: inj ? inj.person_name : null,
      };
      list.push(row);
    });
    if (keyword) {
      const kw = keyword.toLowerCase();
      list = list.filter(r => (r.name && r.name.toLowerCase().includes(kw)));
    }
    if (department) {
      list = list.filter(r => r.org_name === department);
    }
    if (isHighRisk === 'true' || isHighRisk === true) {
      list = list.filter(r => memoryStores.personnel.some(p => !p.is_deleted && p.employee_id === r.employee_id && p.is_high_risk === true));
    }
    if (highRiskCategory) {
      list = list.filter(r => memoryStores.personnel.some(p => !p.is_deleted && p.employee_id === r.employee_id && p.high_risk_category === highRiskCategory));
    }
    if (insuranceStatus) {
      list = list.filter(r => {
        const es = calcInsuranceStatus({ isCurrent: r.emp_is_current, startDate: r.emp_start_date, expireDate: r.emp_expire_date }, new Date());
        const is = calcInsuranceStatus({ isCurrent: r.inj_is_current, startDate: r.inj_start_date, expireDate: r.inj_expire_date }, new Date());
        const personState = calcPersonStatus(es, is);
        if (insuranceStatus === 'insured')   return personState === 'insured';
        if (insuranceStatus === 'expiring')  return personState === 'expiring';
        if (insuranceStatus === 'expired')   return personState === 'expired';
        if (insuranceStatus === 'uninsured') return personState === 'uninsured';
        return true;
      });
    }
    if (complianceStatus) {
      list = list.filter(r => {
        const es = calcInsuranceStatus({ isCurrent: r.emp_is_current, startDate: r.emp_start_date, expireDate: r.emp_expire_date }, new Date());
        const is = calcInsuranceStatus({ isCurrent: r.inj_is_current, startDate: r.inj_start_date, expireDate: r.inj_expire_date }, new Date());
        const st = calcComplianceStatus({ employerStatus: es, injuryExists: r.inj_id != null, empCoverage: r.emp_coverage });
        if (complianceStatus === 'compliant') return st === 'compliant';
        if (complianceStatus === 'noncompliant') return st !== 'compliant';
        return true;
      });
    }
    if (syncStatus) {
      list = list.filter(r => {
        const hasAny = r.emp_id != null || r.inj_id != null;
        if (syncStatus === 'missing') return !hasAny;
        if (!hasAny) return false;
        const snapshots = [];
        if (r.emp_id != null) snapshots.push({ name: r.emp_person_name, dept: r.emp_department, pos: r.emp_position });
        if (r.inj_id != null) snapshots.push({ name: r.inj_person_name, dept: r.inj_department, pos: r.inj_position });
        const allMatch = snapshots.every((s) =>
          (s.name || '') === (r.name || '') &&
          (s.dept || '') === (r.org_name || '') &&
          (s.pos || '') === (r.position_name || '')
        );
        if (syncStatus === 'synced') return allMatch;
        if (syncStatus === 'unsynced') return !allMatch;
        return true;
      });
    }
    const total = list.length;
    const off = (parseInt(page) - 1) * parseInt(pageSize);
    list = list.slice(off, off + parseInt(pageSize));
    return { __t: 'list', list: list.map(r => formatPersonnelInsPivoted(r, null)), total, page, pageSize, message: '查询成功(内存透视模式)' };
  }

  const empPivot = policyPivotSql('雇主责任险');
  const injPivot = policyPivotSql('工伤保险');

  let whereSql = ' WHERE ev.employee_deleted = false';
  const params = [];
  let paramIdx = 0;
  if (keyword) { paramIdx++; whereSql += ` AND ev.name ILIKE $${paramIdx}`; params.push(`%${keyword}%`); }
  if (department) { paramIdx++; whereSql += ` AND ev.org_name = $${paramIdx}`; params.push(department); }
  if (isHighRisk === 'true' || isHighRisk === true) {
    whereSql += ` AND ev.name IN (SELECT name FROM over_age_personnel WHERE is_deleted = false AND control_type LIKE '%高危%')`;
  }
  const personState = personLevelSql('emp', 'inj');
  if (insuranceStatus === 'insured') {
    whereSql += ` AND NOT (${personState.expiring}) AND (${personState.covered})`;
  } else if (insuranceStatus === 'expiring') {
    whereSql += ` AND (${personState.expiring})`;
  } else if (insuranceStatus === 'expired') {
    whereSql += ` AND NOT (${personState.covered}) AND (${personState.hasExpired})`;
  } else if (insuranceStatus === 'uninsured') {
    whereSql += ` AND NOT (${personState.covered}) AND NOT (${personState.hasExpired})`;
  }
  const complianceExpr = complianceStatusSql('emp', 'inj');
  if (complianceStatus === 'compliant') {
    whereSql += ` AND ${complianceExpr}`;
  } else if (complianceStatus === 'noncompliant') {
    whereSql += ` AND NOT ${complianceExpr}`;
  }
  if (syncStatus === 'missing') {
    whereSql += ` AND emp.id IS NULL AND inj.id IS NULL`;
  } else if (syncStatus === 'synced') {
    whereSql += ` AND (emp.id IS NOT NULL OR inj.id IS NOT NULL) AND NOT (${snapshotMismatchSql('emp', 'ev')} OR ${snapshotMismatchSql('inj', 'ev')})`;
  } else if (syncStatus === 'unsynced') {
    whereSql += ` AND (${snapshotMismatchSql('emp', 'ev')} OR ${snapshotMismatchSql('inj', 'ev')})`;
  }

  let countR;
  try {
    countR = await pool.query(`SELECT COUNT(*)::int AS total FROM v_employee_current ev ${ACTIVE_ROSTER_JOIN} LEFT JOIN (${empPivot}) emp ON emp.employee_id = ev.employee_id LEFT JOIN (${injPivot}) inj ON inj.employee_id = ev.employee_id${whereSql}`, params);
  } catch (err) {
    return safeListQueryError(err, page, pageSize);
  }
  const total = countR.rows[0].total;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  paramIdx++; const lp = paramIdx; params.push(parseInt(pageSize));
  paramIdx++; const op = paramIdx; params.push(offset);

  const querySql = `
    SELECT
      ev.name, ev.gender, ev.age, ev.employee_id,
      COALESCE(emp.id_card, inj.id_card, ev.id_card) AS id_card,
      ev.org_name AS department, ev.position_name AS position,
      ev.start_date AS entry_date,
      COALESCE(emp.personnel_id, inj.personnel_id) AS personnel_id,
      emp.id AS emp_id, emp.policy_no AS emp_policy_no,
      emp.start_date AS emp_start_date, emp.expire_date AS emp_expire_date,
      emp.is_current AS emp_is_current,
      emp.premium AS emp_premium, emp.coverage_amount AS emp_coverage,
      emp.department AS emp_department, emp.position AS emp_position, emp.person_name AS emp_person_name,
      inj.id AS inj_id, inj.policy_no AS inj_policy_no,
      inj.start_date AS inj_start_date, inj.expire_date AS inj_expire_date,
      inj.is_current AS inj_is_current,
      inj.premium AS inj_premium, inj.coverage_amount AS inj_coverage,
      inj.department AS inj_department, inj.position AS inj_position, inj.person_name AS inj_person_name
    FROM v_employee_current ev
    ${ACTIVE_ROSTER_JOIN}
    LEFT JOIN (${empPivot}) emp ON emp.employee_id = ev.employee_id
    LEFT JOIN (${injPivot}) inj ON inj.employee_id = ev.employee_id
    ${whereSql}
    ORDER BY CASE WHEN ${complianceExpr} THEN 1 ELSE 0 END ASC, ev.name
    LIMIT $${lp} OFFSET $${op}`;
  let result;
  try {
    result = await pool.query(querySql, params);
  } catch (err) {
    return safeListQueryError(err, page, pageSize);
  }
  const list = result.rows.map(r => formatPersonnelInsPivoted(r, null));
  return { __t: 'list', list, total, page: parseInt(page), pageSize: parseInt(pageSize), message: '查询成功' };
}

// GET /personnel/stats — 人员保险统计
async function personnelStats() {
  const stats = { total: 0, covered: 0, expired: 0, pending: 0, highRisk: 0, expiring30d: 0 };
  let byType = {};
  let byDepartment = {};

  if (isConnected()) {
    const pivotStats = buildPersonnelStatsPivotSql();
    const r1 = await pool.query(pivotStats);
    stats.total = r1.rows[0].total;
    stats.covered = r1.rows[0].covered;
    stats.expired = r1.rows[0].expired;
    stats.pending = r1.rows[0].pending;
    stats.expiring30d = r1.rows[0].expiring;
    stats.noncompliant = r1.rows[0].noncompliant || 0;
    const r5 = await pool.query("SELECT COUNT(*)::int AS v FROM over_age_personnel WHERE is_deleted = false AND control_type LIKE '%高危%'");
    stats.highRisk = r5.rows[0].v;
    const r7 = await pool.query(`
      WITH emp_piv AS (
        SELECT p.* FROM (${policyPivotSql('雇主责任险')}) p
      ),
      inj_piv AS (
        SELECT p.* FROM (${policyPivotSql('工伤保险')}) p
      )
      SELECT
        COUNT(*) FILTER (WHERE emp_piv.id IS NOT NULL AND ${activePolicySql('emp_piv')})::int AS emp_cnt,
        COUNT(*) FILTER (WHERE inj_piv.id IS NOT NULL AND ${activePolicySql('inj_piv')})::int AS inj_cnt
      FROM v_employee_current ev
      ${ACTIVE_ROSTER_JOIN}
      LEFT JOIN emp_piv ON emp_piv.employee_id = ev.employee_id
      LEFT JOIN inj_piv ON inj_piv.employee_id = ev.employee_id
      WHERE ev.employee_deleted = false`);
    byType = { '雇主责任险': r7.rows[0].emp_cnt, '工伤保险': r7.rows[0].inj_cnt };
    const r8 = await pool.query(`
      SELECT COALESCE(ev.org_name, '未分配') AS dept, COUNT(*)::int AS cnt
      FROM v_employee_current ev
      ${ACTIVE_ROSTER_JOIN}
      WHERE ev.employee_deleted = false
      GROUP BY dept
    `);
    r8.rows.forEach(r => { byDepartment[r.dept] = r.cnt; });
  } else {
    const byEmp = new Map();
    memoryStores.personnel.filter(r => !r.is_deleted).forEach(r => {
      if (r.employee_id == null) return;
      if (!byEmp.has(r.employee_id)) byEmp.set(r.employee_id, { emp: [], inj: [] });
      const bucket = byEmp.get(r.employee_id);
      if (r.insurance_type === '雇主责任险') bucket.emp.push(r);
      else if (r.insurance_type === '工伤保险') bucket.inj.push(r);
    });
    const today = new Date();
    let empActive = 0;
    let injActive = 0;
    let expiring30dCnt = 0;
    let noncompliantCnt = 0;
    byEmp.forEach((bucket) => {
      const emp = pickBestInsuranceRecord(bucket.emp, today);
      const inj = pickBestInsuranceRecord(bucket.inj, today);
      const es = emp ? calcInsuranceStatus({ isCurrent: emp.is_current, startDate: emp.start_date, expireDate: emp.expire_date }, today) : 'uninsured';
      const is2 = inj ? calcInsuranceStatus({ isCurrent: inj.is_current, startDate: inj.start_date, expireDate: inj.expire_date }, today) : 'uninsured';
      if (es === 'insured' || es === 'expiring') empActive++;
      if (is2 === 'insured' || is2 === 'expiring') injActive++;
      if (es === 'expiring' || is2 === 'expiring') expiring30dCnt++;
      const personState = calcPersonStatus(es, is2);
      if (personState === 'insured' || personState === 'expiring') stats.covered++;
      else if (personState === 'expired') stats.expired++;
      else stats.pending++;
      if (calcComplianceStatus({ employerStatus: es, injuryExists: bucket.inj.length > 0, empCoverage: emp ? emp.coverage_amount : null }) !== 'compliant') {
        noncompliantCnt++;
      }
    });
    stats.total = byEmp.size;
    stats.expiring30d = expiring30dCnt;
    stats.noncompliant = noncompliantCnt;
    stats.highRisk = memoryStores.personnel.filter(r => !r.is_deleted && r.is_high_risk === true).length;
    byType = { '雇主责任险': empActive, '工伤保险': injActive };
    const seenEmpDept = new Set();
    memoryStores.personnel
      .filter(r => !r.is_deleted && r.employee_id != null)
      .forEach(r => {
        if (seenEmpDept.has(r.employee_id)) return;
        seenEmpDept.add(r.employee_id);
        const d = r.department || r.dept || '未分配';
        byDepartment[d] = (byDepartment[d] || 0) + 1;
      });
  }

  return { __t: 'json', payload: { stats, byType, byDepartment }, message: '查询成功' };
}

// GET /personnel/departments — 花名册（在职）部门列表
async function departments() {
  let departments = [];
  if (isConnected()) {
    const r = await pool.query(`
      SELECT DISTINCT ev.org_name AS dept
      FROM v_employee_current ev
      ${ACTIVE_ROSTER_JOIN}
      WHERE ev.employee_deleted = false
        AND ev.org_name IS NOT NULL
        AND ev.org_name <> ''
      ORDER BY dept ASC
    `);
    departments = r.rows.map((row) => row.dept);
  } else {
    departments = [...new Set(
      memoryStores.personnel
        .filter((p) => !p.is_deleted && p.department)
        .map((p) => p.department),
    )].sort();
  }
  return { __t: 'json', payload: { departments }, message: '查询成功', empty: {} };
}

// POST /personnel/sync-from-roster
async function syncFromRoster(employeeIds) {
  if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
    return { __t: 'error', code: -1, message: '请选择要同步的人员' };
  }
  let synced = 0;
  const failed = [];
  const errors = [];
  if (isConnected()) {
    for (const employeeId of employeeIds) {
      try {
        const r = await pool.query(`
          UPDATE personnel_insurance p
          SET person_name = e.name,
              department = e.org_name,
              position = e.position_name,
              updated_at = CURRENT_TIMESTAMP
          FROM v_employee_current e
          WHERE p.employee_id = $1
            AND p.is_deleted = false
            AND e.employee_id = $1
            AND e.employee_deleted = false
          RETURNING p.id
        `, [employeeId]);
        if (r.rows.length > 0) synced++;
        else { failed.push(employeeId); errors.push(`员工${employeeId}: 未找到可同步的保险记录或员工不存在`); }
      } catch (e2) {
        failed.push(employeeId);
        errors.push(`员工${employeeId}: ${e2.message}`);
      }
    }
  } else {
    employeeIds.forEach(id => { failed.push(id); });
    errors.push('内存模式不支持同步');
  }
  return { __t: 'json', payload: { synced, failed, errors }, message: `成功同步${synced}人，失败${failed.length}人` };
}

// GET /personnel/job-type-stats — 按工种分组统计
async function jobTypeStats() {
  let result = [];
  if (isConnected()) {
    const r = await pool.query(`
      SELECT COALESCE(NULLIF(insurance_type, ''), '未分类') AS job_type, COUNT(*)::int AS count
      FROM personnel_insurance
      WHERE is_deleted = false
      GROUP BY insurance_type
      ORDER BY count DESC
    `);
    result = r.rows.map(row => ({ jobType: row.job_type, count: row.count }));
  } else {
    const map = new Map();
    for (const p of memoryStores.personnel.filter(r => !r.is_deleted)) {
      const t = p.insurance_type || '未分类';
      map.set(t, (map.get(t) || 0) + 1);
    }
    result = Array.from(map.entries()).map(([jobType, count]) => ({ jobType, count }));
  }
  return { __t: 'json', payload: result, message: '查询成功' };
}

// GET /personnel/expiring-soon
async function expiringSoon(query) {
  const rawDays = parseInt(query.days, 10);
  const days = (Number.isFinite(rawDays) && rawDays > 0 && rawDays <= 365) ? rawDays : 30;
  let list = [];
  if (isConnected()) {
    const r = await pool.query(`
      SELECT p.* FROM personnel_insurance p
      WHERE p.is_deleted = false
        AND p.is_current = true
        AND p.start_date IS NOT NULL AND p.expire_date IS NOT NULL
        AND p.start_date <= ${BUSINESS_DAY_SQL}
        AND p.expire_date >= ${BUSINESS_DAY_SQL}
        AND p.expire_date <= ${BUSINESS_DAY_SQL} + ($1::int * INTERVAL '1 day')
      ORDER BY p.expire_date ASC
    `, [days]);
    list = r.rows.map(formatPersonnelIns);
  } else {
    const today = new Date();
    const todayStr = toBusinessDayStr(today);
    list = memoryStores.personnel
      .filter(r => !r.is_deleted && r.is_current === true && r.start_date && r.expire_date)
      .filter(r => {
        const st = calcInsuranceStatus({ isCurrent: r.is_current, startDate: r.start_date, expireDate: r.expire_date }, todayStr);
        if (st !== 'insured' && st !== 'expiring') return false;
        const daysLeft = Math.ceil((new Date(`${toDateStr(r.expire_date)}T00:00:00Z`) - new Date(`${todayStr}T00:00:00Z`)) / 86400000);
        return daysLeft >= 0 && daysLeft <= days;
      })
      .sort((a, b) => toDateStr(a.expire_date) < toDateStr(b.expire_date) ? -1 : 1);
  }
  return { __t: 'json', payload: list, message: '查询成功' };
}

// PUT /personnel/batch-renewal — 批量续保
async function batchRenewal(body) {
  const { ids, policyStartDate, policyEndDate, premium, remark } = body;
  const requested = ids.length;
  const businessDay = toBusinessDayStr();
  const rowErrors = [];
  const failRow = (row, reason, message) => rowErrors.push({ row, reason, message });

  if (!isConnected()) {
    const plans = [];
    for (const id of ids) {
      const target = memoryStores.personnel.find((x) => x.id === id && !x.is_deleted);
      if (!target) { failRow(id, 'target_not_found', `记录 ${id} 不存在`); continue; }
      const merged = { ...target };
      if (policyStartDate) merged.start_date = policyStartDate;
      merged.expire_date = policyEndDate;
      if (premium !== undefined && premium !== null) merged.premium = premium;
      if (remark !== undefined && remark !== null) merged.remark = remark;
      if (merged.start_date && String(merged.start_date) > String(merged.expire_date)) {
        failRow(id, 'date_order_invalid', `记录 ${id} 续保后起期晚于止期`);
        continue;
      }
      plans.push({ id, merged });
    }
    if (rowErrors.length === 0) {
      const batchKeys = new Map();
      for (const p of plans) {
        const m = p.merged;
        if (!isPolicyActiveOnBusinessDay({ isCurrent: m.is_current, startDate: m.start_date, expireDate: m.expire_date })) continue;
        const key = `${m.employee_id}|${m.insurance_type}`;
        if (batchKeys.has(key)) {
          failRow(p.id, 'duplicate_active_policy_in_batch', `记录 ${p.id} 续保后与记录 ${batchKeys.get(key)} 形成同一员工同险种并行当前有效保单`);
          continue;
        }
        batchKeys.set(key, p.id);
        const conflict = findActivePolicyConflictInMemory(
          { employeeId: m.employee_id, insuranceType: m.insurance_type, excludeId: p.id },
          { records: memoryStores.personnel, businessDay }
        );
        if (conflict.error) { failRow(p.id, 'duplicate_check_failed', '重复保单检查失败，请稍后重试'); continue; }
        if (conflict.conflict) { failRow(p.id, 'duplicate_active_policy', `记录 ${p.id} 续保后撞上该员工当前有效${m.insurance_type}（保单ID ${conflict.conflict.id}）`); continue; }
      }
    }
    if (rowErrors.length > 0) {
      return { __t: 'json', payload: { requested, renewed: 0, failed: rowErrors.length, rowErrors }, message: '续保校验未通过，未执行任何变更（内存模式）' };
    }
    for (const p of plans) {
      Object.assign(p.merged, { updated_at: new Date().toISOString() });
      const target = memoryStores.personnel.find((x) => x.id === p.id && !x.is_deleted);
      Object.assign(target, p.merged);
    }
    return { __t: 'json', payload: { requested, renewed: plans.length, failed: 0, rowErrors }, message: `成功续保${plans.length}条记录(内存模式)` };
  }

  // DB 模式
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const selR = await client.query('SELECT * FROM personnel_insurance WHERE id = ANY($1::bigint[]) AND is_deleted = false FOR UPDATE', [ids]);
      const byId = new Map(selR.rows.map((r) => [Number(r.id), r]));
      const plans = [];
      for (const id of ids) {
        const existing = byId.get(Number(id));
        if (!existing) { failRow(id, 'target_not_found', `记录 ${id} 不存在`); continue; }
        const merged = { ...existing };
        if (policyStartDate) merged.start_date = policyStartDate;
        merged.expire_date = policyEndDate;
        if (premium !== undefined && premium !== null) merged.premium = premium;
        if (remark !== undefined && remark !== null) merged.remark = remark;
        if (merged.start_date && String(merged.start_date) > String(merged.expire_date)) {
          failRow(id, 'date_order_invalid', `记录 ${id} 续保后起期晚于止期`);
          continue;
        }
        plans.push({ id: Number(id), merged });
      }
      if (rowErrors.length === 0) {
        const batchKeys = new Map();
        for (const p of plans) {
          const m = p.merged;
          if (!isPolicyActiveOnBusinessDay({ isCurrent: m.is_current, startDate: m.start_date, expireDate: m.expire_date })) continue;
          const key = `${m.employee_id}|${m.insurance_type}`;
          if (batchKeys.has(key)) {
            failRow(p.id, 'duplicate_active_policy_in_batch', `记录 ${p.id} 续保后与记录 ${batchKeys.get(key)} 形成同一员工同险种并行当前有效保单`);
            continue;
          }
          batchKeys.set(key, p.id);
          const conflict = await findActivePolicyConflict(
            { employeeId: m.employee_id, insuranceType: m.insurance_type, excludeId: p.id },
            { db: client }
          );
          if (conflict.error) { failRow(p.id, 'duplicate_check_failed', '重复保单检查失败，请稍后重试'); continue; }
          if (conflict.conflict) { failRow(p.id, 'duplicate_active_policy', `记录 ${p.id} 续保后撞上该员工当前有效${m.insurance_type}（保单ID ${conflict.conflict.id}）`); continue; }
        }
      }
      if (rowErrors.length > 0) {
        await client.query('ROLLBACK');
        return { __t: 'json', payload: { requested, renewed: 0, failed: rowErrors.length, rowErrors }, message: '续保校验未通过，未执行任何变更' };
      }
      for (const p of plans) {
        const upd = await client.query(
          `UPDATE personnel_insurance SET start_date=$2, expire_date=$3, premium=$4, remark=$5, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND is_deleted=false`,
          [p.id, p.merged.start_date || null, p.merged.expire_date, p.merged.premium != null ? p.merged.premium : 0, p.merged.remark != null ? p.merged.remark : '']
        );
        if (!upd || upd.rowCount !== 1) {
          const err = new Error(`批量续保目标 ${p.id} 更新 0 行（记录可能已被删除或变更），事务回滚`);
          err.code = 'RENEWAL_ROWCOUNT_ZERO';
          throw err;
        }
      }
      await client.query('COMMIT');
      return { __t: 'json', payload: { requested, renewed: plans.length, failed: 0, rowErrors }, message: `成功续保${plans.length}条记录` };
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (e2) { }
      logger.error('[Insurance] 批量续保失败（内部错误不向前端泄漏）:', { message: e && e.message, stack: e && e.stack });
      return { __t: 'json', payload: null, message: '', error: { code: -1, message: '续保失败，请稍后重试' } };
    } finally {
      client.release();
    }
  } catch (err) {
    return { __t: 'json', payload: null, message: '', error: { code: -1, message: '续保失败，请稍后重试' } };
  }
}

// POST /personnel/batch-delete
async function batchDelete(body) {
  const { ids } = body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return { __t: 'json', payload: null, message: '', error: { code: -1, message: '请选择要删除的记录' } };
  }
  let deletedCount = 0;
  if (isConnected()) {
    const r = await pool.query(
      'UPDATE personnel_insurance SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id = ANY($1::bigint[]) AND is_deleted=false RETURNING id',
      [ids]
    );
    deletedCount = r.rows.length;
  } else {
    for (const id of ids) {
      const r = memoryStores.personnel.find(r => r.id === parseInt(id) && !r.is_deleted);
      if (r) { r.is_deleted = true; deletedCount++; }
    }
  }
  return { __t: 'json', payload: { deleted: deletedCount }, message: `成功删除${deletedCount}条记录` };
}

// POST /personnel/import — 人员保险直接导入
async function importPersonnel(params) {
  const { body, personnelImportRowSchema } = params;
  const reqBody = body || {};
  if (typeof reqBody !== 'object' || Array.isArray(reqBody) || !Array.isArray(reqBody.records) || reqBody.records.length === 0) {
    return { __t: 'json', payload: null, message: '', error: { code: -1, message: '导入数据不能为空' } };
  }
  const records = reqBody.records;
  const MAX_ROWS = 5000;
  if (records.length > MAX_ROWS) {
    return { __t: 'json', payload: null, message: '', error: { code: -1, message: `单次导入行数超过上限 ${MAX_ROWS}` } };
  }
  let successCount = 0;
  let failCount = 0;
  const errors = [];
  const rowErrors = [];

  for (let i = 0; i < records.length; i++) {
    const rowNo = i + 1;
    const raw = records[i];
    const fail = (reason, message, extra = {}) => {
      failCount++;
      errors.push(`第${rowNo}行: ${message}`);
      rowErrors.push({
        row: rowNo, reason, message,
        employeeId: (raw && raw.employeeId != null) ? raw.employeeId : null,
        employeeCode: (raw && raw.employeeCode) ? raw.employeeCode : null,
        ...extra,
      });
    };
    const parsed = personnelImportRowSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const reason = (first && first.path && first.path[0] === 'employeeId' && /缺少人员ID或工号/.test(first.message))
        ? 'missing_employee_id' : 'invalid_row_schema';
      fail(reason, (first && first.message) || '行数据校验失败', { schemaError: true });
      continue;
    }
    const r = parsed.data;
    if (r.startDate && r.expireDate && String(r.startDate) > String(r.expireDate)) {
      fail('date_order_invalid', '起期不能晚于止期');
      continue;
    }
    const canonicalType = normalizeInsuranceType(r.insuranceType);
    if (!canonicalType) {
      fail('unsupported_insurance_type', `不支持的险种: ${r.insuranceType}（人员保险仅支持 雇主责任险/工伤保险）`);
      continue;
    }
    if (isConnected()) {
      const resolved = await resolveEmployee({ employeeId: r.employeeId, employeeCode: r.employeeCode });
      if (!resolved.employee) {
        const reason = resolved.reason || 'employee_not_found';
        const msg = reason === 'missing_employee_id' ? '缺少人员ID或工号'
          : reason === 'employee_multiple_candidates' ? '工号对应多个人员，无法唯一匹配'
          : reason === 'id_code_conflict' ? '员工ID与工号指向不同人员，拒绝导入'
          : reason === 'lookup_failed' ? '人员查询失败，请稍后重试'
          : '人员不存在或已离职';
        fail(reason, msg);
        continue;
      }
      const emp = resolved.employee;
      if (r.personName && emp.name && String(r.personName).trim() !== String(emp.name).trim()) {
        fail('name_mismatch', `姓名与人员主数据不一致（${r.personName} vs ${emp.name}）`);
        continue;
      }
      if (isPolicyActiveOnBusinessDay({ isCurrent: r.isCurrent, startDate: r.startDate, expireDate: r.expireDate })) {
        const conflict = await findActivePolicyConflict({ employeeId: emp.employee_id, insuranceType: canonicalType });
        if (conflict.error) { fail('duplicate_check_failed', '重复保单检查失败，请稍后重试'); continue; }
        if (conflict.conflict) { fail('duplicate_active_policy', `该员工已存在当前有效${canonicalType}（保单ID ${conflict.conflict.id}）`); continue; }
      }
      try {
        await pool.query(`
          INSERT INTO personnel_insurance (employee_id, personnel_id, person_name, department, position, insurance_type, coverage_amount, premium, start_date, expire_date, is_current, policy_no, remark)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        `, [emp.employee_id, emp.employee_id, emp.name, emp.org_name || '', emp.position_name || '', canonicalType, r.coverageAmount || 0, r.premium || 0, r.startDate || null, r.expireDate || null, r.isCurrent, r.policyNo || '', r.remark || '']);
      } catch (e) {
        logger.error('[Insurance] 直接导入 INSERT 失败（内部错误不向前端泄漏）:', { message: e && e.message, stack: e && e.stack });
        fail('internal_error', '写入失败，请稍后重试');
        continue;
      }
    } else {
      if (r.employeeId == null) {
        fail('missing_employee_id', '内存模式缺少 employeeId');
        continue;
      }
      if (isPolicyActiveOnBusinessDay({ isCurrent: r.isCurrent, startDate: r.startDate, expireDate: r.expireDate })) {
        const conflict = findActivePolicyConflictInMemory(
          { employeeId: r.employeeId, insuranceType: canonicalType },
          { records: memoryStores.personnel, businessDay: toBusinessDayStr() }
        );
        if (conflict.error) { fail('duplicate_check_failed', '重复保单检查失败，请稍后重试'); continue; }
        if (conflict.conflict) { fail('duplicate_active_policy', `该员工已存在当前有效${canonicalType}（保单ID ${conflict.conflict.id}）`); continue; }
      }
      memoryStores.personnel.push({ id: memoryCounters.personnel++, employee_id: r.employeeId, personnel_id: r.employeeId, person_name: r.personName || '', insurance_type: canonicalType, coverage_amount: r.coverageAmount || 0, premium: r.premium || 0, start_date: r.startDate || null, expire_date: r.expireDate || null, is_current: r.isCurrent, policy_no: r.policyNo || '', remark: r.remark || '', is_deleted: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }
    successCount++;
  }
  return { __t: 'json', payload: { total: records.length, success: successCount, failed: failCount, errors, rowErrors }, message: '导入完成' };
}

// GET /personnel/export — 导出人员保险数据（CSV）
async function exportPersonnel() {
  let data = [];
  if (isConnected()) {
    const r = await pool.query('SELECT * FROM personnel_insurance WHERE is_deleted = false ORDER BY id ASC');
    data = r.rows.map(formatPersonnelIns);
  } else {
    data = memoryStores.personnel.filter(r => !r.is_deleted).map(formatPersonnelIns);
  }
  const headers = ['ID', '姓名', '身份证号', '部门', '岗位', '保险类型', '保单号', '生效日期', '到期日期', '保费', '保险状态', '时效状态', '备注'];
  const statusMap = { insured: '已参保', expired: '已过期', expiring: '即将到期', uninsured: '未参保' };
  const expiryMap = { normal: '正常', expiring: '临期', expired: '过期', unknown: '未知' };
  const rows = data.map(r => [
    r.id || '',
    (r.name || '').replace(/"/g, '""'),
    maskIdCard(r.idCard).replace(/"/g, '""'),
    (r.department || '').replace(/"/g, '""'),
    (r.position || '').replace(/"/g, '""'),
    (r.insuranceType || '').replace(/"/g, '""'),
    (r.policyNumber || '').replace(/"/g, '""'),
    r.policyStartDate || '',
    r.policyEndDate || '',
    r.premium || 0,
    statusMap[r.insuranceStatus] || r.insuranceStatus || '',
    expiryMap[r.expiryStatus] || r.expiryStatus || '',
    (r.remark || '').replace(/"/g, '""'),
  ].map(v => `"${v}"`).join(','));
  const csv = '\uFEFF' + headers.map(h => `"${h}"`).join(',') + '\n' + rows.join('\n');
  return { __t: 'csv', csv, contentDisposition: `attachment; filename="personnel_insurance_${new Date().toISOString().slice(0, 10)}.csv"` };
}

// GET /personnel/unmatched
async function unmatched(query) {
  const { page = 1, pageSize = 20 } = query;
  const off = (parseInt(page) - 1) * parseInt(pageSize);
  const limit = Math.min(Math.max(parseInt(pageSize) || 20, 1), 200);

  if (!isConnected()) {
    const all = memoryStores.personnel.filter((r) => !r.is_deleted && (r.employee_id == null || r.employee_id === ''));
    const list = all
      .slice(off, off + limit)
      .map((r) => ({ id: r.id, employeeId: null, personName: r.person_name || '', insuranceType: r.insurance_type || '', policyNo: r.policy_no || '', reason: 'missing_employee_id' }));
    const byReason = { missing_employee_id: all.length, employee_not_found: 0 };
    return { __t: 'json', payload: { list, total: all.length, page: parseInt(page), pageSize: limit, byReason }, message: '查询成功(内存模式)' };
  }

  const baseFrom = `
    FROM personnel_insurance p
    LEFT JOIN v_employee_current ev ON ev.employee_id = p.employee_id
    WHERE p.is_deleted = false
      AND (p.employee_id IS NULL OR ev.employee_id IS NULL)`;
  const countR = await pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE p.employee_id IS NULL)::int AS missing_cnt,
            COUNT(*) FILTER (WHERE p.employee_id IS NOT NULL)::int AS not_found_cnt
     ${baseFrom}`
  );
  const total = countR.rows[0].total;
  const result = await pool.query(
    `SELECT p.id, p.employee_id, p.person_name, p.insurance_type, p.policy_no,
            CASE WHEN p.employee_id IS NULL THEN 'missing_employee_id' ELSE 'employee_not_found' END AS reason
     ${baseFrom}
     ORDER BY p.id ASC
     LIMIT $1 OFFSET $2`,
    [limit, off]
  );
  const list = result.rows.map((r) => ({
    id: r.id,
    employeeId: r.employee_id ?? null,
    personName: r.person_name || '',
    insuranceType: r.insurance_type || '',
    policyNo: r.policy_no || '',
    reason: r.reason,
  }));
  return {
    __t: 'json',
    payload: {
      list, total, page: parseInt(page), pageSize: limit,
      byReason: { missing_employee_id: countR.rows[0].missing_cnt, employee_not_found: countR.rows[0].not_found_cnt },
    },
    message: '查询成功',
  };
}

// GET /personnel/rules/match
async function matchRule(query) {
  const { personnelId } = query;
  if (!personnelId) return { __t: 'json', payload: null, message: '', error: { code: -1, message: '请提供人员ID' } };
  if (isConnected()) {
    try {
      const r = await pool.query('SELECT * FROM v_employee_current WHERE employee_id = $1', [personnelId]);
      if (r.rows.length === 0) return { __t: 'json', payload: null, message: '', error: { code: -2, message: '人员不存在' } };
      return { __t: 'json', payload: _matchInsuranceRule(r.rows[0]), message: '规则匹配完成' };
    } catch (e) { return { __t: 'json', payload: { matched: false, note: '花名册视图暂不可用' }, message: '规则匹配完成' }; }
  }
  return { __t: 'json', payload: null, message: '', error: { code: -1, message: '内存模式暂不支持' } };
}

// GET /personnel/pending-list
// 【B-1-P1-03-02】业务资格分类：正式员工专属 —— 待参保名单与保险主列表口径对齐
//   （主列表 ACTIVE_ROSTER_JOIN 即花名册正式员工资格，insuranceShared:361）。
//   原口径混入终态持段人员（P1-03-01 P2 风险），现按 formalEmployeeEligibilitySql 收敛。
async function pendingList(query) {
  const { page = 1, pageSize = 50, department, isOverAge } = query;
  let allPersons = [];
  if (isConnected()) {
    try {
      const empR = await pool.query(`
        SELECT e.employee_id AS id, e.employee_code, e.name, e.gender, e.birth_date,
               e.org_name AS department, e.position_name AS position, e.phone, e.person_category
        FROM v_employee_current e
        WHERE e.employee_deleted = false
          AND e.name IS NOT NULL AND e.name <> ''
          AND ${formalEmployeeEligibilitySql('e')}
          AND NOT EXISTS (
            SELECT 1 FROM personnel_insurance p
            WHERE p.employee_id = e.employee_id AND p.is_deleted = false
          )
        ORDER BY e.employee_id ASC
      `);
      allPersons = empR.rows.map(p => { const m = _matchInsuranceRule(p); return { ...p, age: m.age, isOverAge: m.isOverAge, matchedRule: m.rule ? m.rule.name : '未匹配', recommendedPlan: m.recommendedPlan }; });
    } catch (e) { allPersons = []; }
  }
  let list = allPersons;
  if (department) list = list.filter(p => p.department === department);
  if (isOverAge === 'true') list = list.filter(p => p.isOverAge);
  if (isOverAge === 'false') list = list.filter(p => !p.isOverAge);
  const total = list.length;
  const start = (parseInt(page) - 1) * parseInt(pageSize);
  const summary = { total: allPersons.length, overAgeCount: allPersons.filter(p => p.isOverAge).length, fiveInsCount: allPersons.filter(p => p.has_five_ins === true).length, employerInsCount: allPersons.filter(p => !p.isOverAge && p.has_five_ins !== true).length };
  return { __t: 'json', payload: { list: list.slice(start, start + parseInt(pageSize)), total, page: parseInt(page), pageSize: parseInt(pageSize), summary }, message: '查询成功' };
}

// POST /personnel/generate-from-pending
async function generateFromPending(body) {
  const { ids, defaultStartDate, defaultExpireDate } = body;
  if (!Array.isArray(ids) || ids.length === 0) return { __t: 'json', payload: null, message: '', error: { code: -1, message: '请选择要生成的人员' } };
  let processed = 0;
  let generated = 0;
  const failed = [];
  const rowErrors = [];
  for (const id of ids) {
    try {
      if (!isConnected()) {
        failed.push({ row: id, reason: 'memory_mode_unsupported', message: '规则生成不支持内存模式' });
        continue;
      }
      processed++;
      const empR = await pool.query('SELECT * FROM v_employee_current WHERE employee_id = $1', [id]);
      if (empR.rows.length === 0) { failed.push({ row: id, reason: 'employee_not_found', message: '人员不存在' }); continue; }
      const person = empR.rows[0];
      const match = _matchInsuranceRule(person);
      if (!match.matched) { failed.push({ row: id, reason: 'rule_not_matched', message: `人员${person.name}: 未匹配到规则` }); continue; }
      for (const rawType of (match.recommendedPlan.types || [])) {
        const insType = normalizeInsuranceType(rawType);
        if (!insType) { failed.push({ row: id, reason: 'unsupported_insurance_type', message: `人员${person.name}: 规则输出不支持的险种 ${rawType}，已跳过` }); continue; }
        if (isPolicyActiveOnBusinessDay({ isCurrent: true, startDate: defaultStartDate, expireDate: defaultExpireDate })) {
          const conflict = await findActivePolicyConflict({ employeeId: person.employee_id, insuranceType: insType });
          if (conflict.error) { failed.push({ row: id, reason: 'duplicate_check_failed', message: `人员${person.name}: 重复保单检查失败，请稍后重试` }); continue; }
          if (conflict.conflict) { failed.push({ row: id, reason: 'duplicate_active_policy', message: `人员${person.name}: ${insType}已存在当前保单（ID ${conflict.conflict.id}）` }); continue; }
        }
        await pool.query(`INSERT INTO personnel_insurance (employee_id, personnel_id, person_name, insurance_type, coverage_amount, start_date, expire_date, is_current, remark) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [person.employee_id, person.employee_id, person.name, insType, insType === '雇主责任险' ? (match.recommendedPlan.employerLiabilityAmount || 0) : 0, defaultStartDate || null, defaultExpireDate || null, true, `规则匹配: ${match.rule.name}`]);
        generated++;
      }
    } catch (e) {
      logger.error('[Insurance] generate-from-pending 写入失败（内部错误不泄漏）:', { message: e && e.message, stack: e && e.stack });
      failed.push({ row: id, reason: 'internal_error', message: `人员ID${id}: 写入失败，请稍后重试` });
    }
  }
  rowErrors.push(...failed);
  return { __t: 'json', payload: { processed, generated, failed, rowErrors }, message: `生成完成，成功${generated}条保单` };
}

// GET /personnel/:id
async function getPersonnel(id) {
  if (!isConnected()) {
    const r = memoryStores.personnel.find(r => r.id === parseInt(id) && !r.is_deleted);
    if (!r) return { __t: 'not-found' };
    return { __t: 'json', payload: r, message: '查询成功' };
  }
  const result = await pool.query('SELECT * FROM personnel_insurance WHERE id = $1 AND is_deleted = false', [id]);
  if (result.rows.length === 0) return { __t: 'json', payload: null, message: '', error: { code: -2, message: '记录不存在' } };
  return { __t: 'json', payload: formatPersonnelIns(result.rows[0]), message: '查询成功' };
}

// POST /personnel
async function createPersonnel(body) {
  const b = body;
  const canonicalType = normalizeInsuranceType(b.insuranceType);
  if (!canonicalType) {
    return { __t: 'json', payload: null, message: '', error: { code: -1, message: `不支持的险种: ${b.insuranceType}（人员保险仅支持 雇主责任险/工伤保险）` } };
  }
  if (!isConnected()) {
    if (isPolicyActiveOnBusinessDay({ isCurrent: b.isCurrent, startDate: b.startDate, expireDate: b.expireDate })) {
      const conflict = findActivePolicyConflictInMemory(
        { employeeId: b.employeeId, insuranceType: canonicalType },
        { records: memoryStores.personnel, businessDay: toBusinessDayStr() }
      );
      if (conflict.error) {
        return { __t: 'json', payload: null, message: '', error: { code: -1, message: '重复保单检查失败，请稍后重试' } };
      }
      if (conflict.conflict) {
        return { __t: 'json', payload: null, message: '', error: { code: -1, message: `该员工已存在当前有效${canonicalType}` } };
      }
    }
    const record = buildMemoryRecord(memoryCounters.personnel++, {
      employee_id: b.employeeId,
      personnel_id: b.employeeId,
      person_name: '',
      insurance_type: canonicalType,
      coverage_amount: b.coverageAmount || 0,
      premium: b.premium || 0,
      start_date: b.startDate || null,
      expire_date: b.expireDate || null,
      is_current: b.isCurrent,
      policy_no: b.policyNo || '',
      remark: b.remark || '',
    });
    memoryStores.personnel.push(record);
    return { __t: 'json', payload: record, message: '创建成功(内存模式)' };
  }
  const employeeId = b.employeeId;
  const resolved = await resolveEmployee({ employeeId });
  if (!resolved.employee) {
    return { __t: 'json', payload: null, message: '', error: { code: -2, message: resolved.reason === 'missing_employee_id' ? '缺少人员ID' : '人员不存在或已离职' } };
  }
  const emp = resolved.employee;
  if (isPolicyActiveOnBusinessDay({ isCurrent: b.isCurrent, startDate: b.startDate, expireDate: b.expireDate })) {
    const conflict = await findActivePolicyConflict({ employeeId, insuranceType: canonicalType });
    if (conflict.error) {
      return { __t: 'json', payload: null, message: '', error: { code: -1, message: '重复保单检查失败，请稍后重试' } };
    }
    if (conflict.conflict) {
      return { __t: 'json', payload: null, message: '', error: { code: -1, message: `该员工已存在当前有效${canonicalType}（保单ID ${conflict.conflict.id}）` } };
    }
  }
  const result = await pool.query(`
    INSERT INTO personnel_insurance (employee_id, personnel_id, person_name, department, position, insurance_type, coverage_amount, premium, start_date, expire_date, is_current, policy_no, remark)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
  `, [employeeId, employeeId, emp.name, emp.org_name || '', emp.position_name || '', canonicalType, b.coverageAmount ?? 0, b.premium ?? 0, b.startDate || null, b.expireDate || null, b.isCurrent, b.policyNo || '', b.remark || '']);
  return { __t: 'json', payload: formatPersonnelIns(result.rows[0]), message: '创建成功' };
}

// PUT /personnel/:id
async function updatePersonnel(id, body) {
  const b = body;
  let canonicalType = null;
  if (b.insuranceType !== undefined) {
    canonicalType = normalizeInsuranceType(b.insuranceType);
    if (!canonicalType) return { __t: 'json', payload: null, message: '', error: { code: -1, message: `不支持的险种: ${b.insuranceType}` } };
  }
  if (!isConnected()) {
    const idx = memoryStores.personnel.findIndex(r => r.id === parseInt(id) && !r.is_deleted);
    if (idx === -1) return { __t: 'json', payload: null, message: '', error: { code: -2, message: '记录不存在' } };
    const cur = memoryStores.personnel[idx];
    const merged = { ...cur };
    if (b.employeeId != null) { merged.employee_id = b.employeeId; merged.personnel_id = b.employeeId; }
    if (canonicalType !== null) merged.insurance_type = canonicalType;
    if (b.coverageAmount !== undefined) merged.coverage_amount = b.coverageAmount;
    if (b.premium !== undefined) merged.premium = b.premium;
    if (b.startDate !== undefined) merged.start_date = b.startDate;
    if (b.expireDate !== undefined) merged.expire_date = b.expireDate;
    if (b.isCurrent !== undefined) merged.is_current = b.isCurrent;
    if (b.policyNo !== undefined) merged.policy_no = b.policyNo;
    if (b.remark !== undefined) merged.remark = b.remark;
    if (isPolicyActiveOnBusinessDay(merged)) {
      const conflict = findActivePolicyConflictInMemory(
        { employeeId: merged.employee_id, insuranceType: merged.insurance_type, excludeId: cur.id },
        { records: memoryStores.personnel, businessDay: toBusinessDayStr() }
      );
      if (conflict.error) return { __t: 'json', payload: null, message: '', error: { code: -1, message: '重复保单检查失败，请稍后重试' } };
      if (conflict.conflict) return { __t: 'json', payload: null, message: '', error: { code: -1, message: `该员工已存在当前有效${merged.insurance_type}（保单ID ${conflict.conflict.id}）` } };
    }
    Object.assign(cur, merged, { updated_at: new Date().toISOString() });
    return { __t: 'json', payload: cur, message: '更新成功(内存模式)' };
  }
  const existingR = await pool.query('SELECT * FROM personnel_insurance WHERE id = $1 AND is_deleted = false', [id]);
  if (existingR.rows.length === 0) return { __t: 'json', payload: null, message: '', error: { code: -2, message: '记录不存在' } };
  const existing = existingR.rows[0];
  let employeeId = existing.employee_id != null ? existing.employee_id : null;
  if (b.employeeId != null) {
    const resolved = await resolveEmployee({ employeeId: b.employeeId });
    if (!resolved.employee) {
      return { __t: 'json', payload: null, message: '', error: { code: -2, message: '关联人员不存在或已离职' } };
    }
    employeeId = b.employeeId;
  }
  const mergedType = canonicalType !== null ? canonicalType : existing.insurance_type;
  const mergedStart = b.startDate || existing.start_date;
  const mergedExpire = b.expireDate || existing.expire_date;
  const mergedIsCurrent = b.isCurrent !== undefined ? b.isCurrent : existing.is_current;
  if (isPolicyActiveOnBusinessDay({ isCurrent: mergedIsCurrent, startDate: mergedStart, expireDate: mergedExpire }) && employeeId != null && mergedType) {
    const conflict = await findActivePolicyConflict({ employeeId, insuranceType: mergedType, excludeId: id });
    if (conflict.error) return { __t: 'json', payload: null, message: '', error: { code: -1, message: '重复保单检查失败，请稍后重试' } };
    if (conflict.conflict) return { __t: 'json', payload: null, message: '', error: { code: -1, message: `该员工已存在当前有效${mergedType}（保单ID ${conflict.conflict.id}）` } };
  }
  let setSql = `
    insurance_type=COALESCE($2,insurance_type), coverage_amount=COALESCE($3,coverage_amount),
    premium=COALESCE($4,premium), start_date=COALESCE($5,start_date), expire_date=COALESCE($6,expire_date),
    is_current=COALESCE($7,is_current), policy_no=COALESCE($8,policy_no),
    remark=COALESCE($9,remark), updated_at=CURRENT_TIMESTAMP`;
  let params = [id, canonicalType !== null ? canonicalType : null, b.coverageAmount, b.premium, b.startDate || null, b.expireDate || null, b.isCurrent, b.policyNo || '', b.remark || ''];

  if (b.employeeId != null) {
    const resolved = await resolveEmployee({ employeeId: b.employeeId });
    const emp = resolved.employee;
    setSql = `employee_id=$10, personnel_id=$10, person_name=$11, department=$12, position=$13, ` + setSql;
    params = [...params, b.employeeId, emp.name, emp.org_name || '', emp.position_name || ''];
  }

  const result = await pool.query(
    `UPDATE personnel_insurance SET ${setSql} WHERE id=$1 AND is_deleted=false RETURNING *`,
    params
  );
  if (result.rows.length === 0) return { __t: 'json', payload: null, message: '', error: { code: -2, message: '记录不存在' } };
  return { __t: 'json', payload: formatPersonnelIns(result.rows[0]), message: '更新成功' };
}

// DELETE /personnel/:id
async function deletePersonnel(id) {
  if (!isConnected()) {
    const r = memoryStores.personnel.find(r => r.id === parseInt(id) && !r.is_deleted);
    if (!r) return { __t: 'json', payload: null, message: '', error: { code: -2, message: '记录不存在' } };
    r.is_deleted = true;
    return { __t: 'json', payload: null, message: '删除成功(内存模式)' };
  }
  const result = await pool.query('UPDATE personnel_insurance SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND is_deleted=false RETURNING id', [id]);
  if (result.rows.length === 0) return { __t: 'json', payload: null, message: '', error: { code: -2, message: '记录不存在' } };
  return { __t: 'json', payload: null, message: '删除成功' };
}

module.exports = {
  listPersonnel,
  personnelStats,
  departments,
  syncFromRoster,
  jobTypeStats,
  expiringSoon,
  batchRenewal,
  batchDelete,
  importPersonnel,
  exportPersonnel,
  unmatched,
  matchRule,
  pendingList,
  generateFromPending,
  getPersonnel,
  createPersonnel,
  updatePersonnel,
  deletePersonnel,
};