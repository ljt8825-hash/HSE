/**
 * 三违活源 · 按考核人聚合（共享服务）
 *
 * 供两处复用，保证同一处聚合口径、不漂移：
 *   1) routes/hse-violation-assessment.js  /list 端点（三违管理考核列表）
 *   2) assessmentScoringEngine.recalculateTarget 三违类别封顶计分
 *
 * 返回：Map<employee_id, {
 *   gridDeduct, violationDeduct, unrectifiedDeduct,   // 已落库扣分 hse_assessment_deduction（kind 分级）
 *   rectifiedDeduct,                                   // 未按时整改（真三违未整改条数，1分/起）
 *   driverDeduct,                                      // 驾驶员三违（驾驶员月度「考核分数」列之和）
 *   companyDeduct,                                     // 公司查处扣分（共享口径）
 * }>
 * 口径与 /list 完全一致（regionBase 归属、buildCompanyDeduct、violatorResolver）。
 */
const { pool } = require('../config/db');
const { buildCompanyDeduct } = require('./companyViolationDeduct');
const { resolveViolatorAttribs, cleanVName, NAME_ALIAS } = require('./violatorResolver');

// 三固定列 → hse_assessment_deduction.source_detail->>'kind' 映射
const KIND_MAP = {
  gridDeduct: 'grid_unchecked_monthly', // 网格长巡查考核
  violationDeduct: 'violation_event', // 三违巡查
  unrectifiedDeduct: 'violation_unrectified', // 三违信息填报
};
const KIND_VALUES = Object.values(KIND_MAP);

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** 乡镇/片区 → 乡镇基名：截掉「片区/作业中心/中心」后缀（与 /list 同源） */
function regionBase(s) {
  const v = String(s || '').replace(/乡镇/g, '').trim();
  if (!v) return '';
  if (v.endsWith('片区')) return v.slice(0, -2);
  if (v.endsWith('作业中心')) return v.slice(0, -4);
  if (v.endsWith('中心')) return v.slice(0, -2);
  return v;
}

/**
 * 按考核人聚合三违活源扣分。
 * @param {number} cycleId
 * @param {string} position  '乡镇作业中心经理' | '管理员'
 * @param {object} [opts]    { year, month } 可显式传入周期年月，避免重复查周期（引擎已持有）
 * @returns {Promise<Map<number, object>>}
 */
async function getPerEmployeeScores(cycleId, position, opts = {}) {
  // 1) 考核对象名单（拿 employee_id, township, position, employee_name）
  const tgt = await pool.query(
    `SELECT id, employee_id, employee_name, position, township, department
       FROM hse_assessment_target
      WHERE cycle_id = $1 AND position = $2 AND is_deleted = FALSE
      ORDER BY township, employee_name`,
    [cycleId, position],
  );

  // 2) 已落库扣分：按人 × kind 聚合生效分
  const ded = await pool.query(
    `SELECT t.employee_id, d.source_detail->>'kind' AS kind,
            SUM(COALESCE(d.confirmed_score, d.suggested_score, 0))::numeric AS s
       FROM hse_assessment_deduction d
       JOIN hse_assessment_target t ON t.id = d.target_id
      WHERE d.cycle_id = $1 AND d.is_deleted = FALSE
        AND COALESCE(d.review_status, '') <> 'rejected'
        AND d.source_detail->>'kind' = ANY($2::text[])
      GROUP BY t.employee_id, d.source_detail->>'kind'`,
    [cycleId, KIND_VALUES],
  );
  const dedMap = new Map();
  for (const r of ded.rows || []) dedMap.set(`${String(r.employee_id)}::${r.kind}`, round2(r.s));

  // 2.5) 周期月份
  let month = '';
  if (opts && opts.year && opts.month) {
    month = `${opts.year}-${String(opts.month).padStart(2, '0')}`;
  } else {
    const cycM = await pool.query(
      `SELECT assessment_year, assessment_month FROM hse_assessment_cycle WHERE id = $1 AND is_deleted = FALSE`,
      [cycleId],
    );
    const cRow = cycM.rows[0];
    if (cRow && cRow.assessment_year != null) month = `${cRow.assessment_year}-${String(cRow.assessment_month).padStart(2, '0')}`;
  }

  // 3) 公司查处（按镇 / 按直接上级）
  let companyDeductMap = new Map(); // `${month}|${town}` -> 全镇累计（经理 tab）
  let supervisorCompanyMap = new Map(); // `${town}|${直接上级}` -> 该上级直接下属全月累计（管理员 tab）
  if (month) {
    const tw = await pool.query(
      `SELECT DISTINCT town FROM hse_sanwei_score_monthly WHERE month = $1 AND is_deleted = FALSE`,
      [month],
    );
    const candidateTowns = (tw.rows || []).map((r) => r.town).filter(Boolean);
    if (candidateTowns.length) {
      const cd = await buildCompanyDeduct({ months: [month], candidateTowns });
      companyDeductMap = cd.map;
      for (const rec of cd.records || []) {
        const sup = String(rec.supervisor || '').trim();
        if (!sup || !rec.town) continue;
        const key = `${rec.town}|${sup}`;
        const a = supervisorCompanyMap.get(key) || { score: 0, helmetCount: 0, otherCount: 0, details: [] };
        a.score += Number(rec.score) || 0;
        if (rec.helmet) a.helmetCount += 1;
        else a.otherCount += 1;
        a.details.push({
          date: rec.date || rec.month || '',
          violatorName: rec.violatorName,
          behavior: rec.behavior || '',
          score: Number(rec.score) || 0,
          recordId: rec.recordId != null ? rec.recordId : undefined,
        });
        supervisorCompanyMap.set(key, a);
      }
    }
  }

  // 4) 未按时整改：真三违未整改（按镇 / 管理员按责任网格长或直接上级）
  const rectifiedByTown = new Map();
  const unrectifiedEmpMap = new Map();
  if (month) {
    const candQ = await pool.query(
      `SELECT DISTINCT town FROM hse_sanwei_score_monthly WHERE month = $1 AND is_deleted = FALSE`,
      [month],
    );
    const rectCandTowns = (candQ.rows || []).map((r) => r.town).filter(Boolean);
    const rd = await pool.query(
      `SELECT area_team, violator_name, grid_id
         FROM grid_inspection_records
        WHERE to_char(inspection_date, 'YYYY-MM') = $1
          AND trim(violation_behavior) <> '无三违行为'
          AND (rectified_photo IS NULL OR trim(rectified_photo) = '' OR trim(rectified_photo) IN ('--', '-', '无'))`,
      [month],
    );
    for (const r of rd.rows || []) {
      const base = regionBase(r.area_team);
      if (base) rectifiedByTown.set(base, (rectifiedByTown.get(base) || 0) + 1);
    }
    if (position === '管理员' && (rd.rows || []).length) {
      const targetEmpIds = new Set((tgt.rows || []).map((t) => String(t.employee_id)));
      const empIdByName = new Map();
      for (const t of tgt.rows || []) { const n = String(t.employee_name || '').trim(); if (n) empIdByName.set(n, String(t.employee_id)); }
      let gridLeaderMap = new Map();
      const gq = await pool.query(
        `SELECT id, personnel_id FROM grid_areas
          WHERE is_deleted = FALSE AND personnel_id IS NOT NULL AND trim(personnel_id::text) <> ''`,
      );
      for (const g of gq.rows || []) gridLeaderMap.set(String(g.id), String(g.personnel_id).trim());
      const attribs = await resolveViolatorAttribs((rd.rows || []).map((x) => x.violator_name));
      for (const r of rd.rows) {
        let empId = r.grid_id != null && r.grid_id !== '' ? gridLeaderMap.get(String(r.grid_id)) || '' : '';
        if (empId && !targetEmpIds.has(empId)) empId = '';
        if (!empId) {
          const raw = cleanVName(r.violator_name) || '';
          const alias = NAME_ALIAS[raw] || raw;
          const attr = attribs.get(alias);
          const sup = String(attr?.supervisor || '').trim();
          const dept = String(attr?.dept || '').trim();
          if (sup && dept) {
            const town = rectCandTowns.find((t) => dept.includes(t)) || '';
            if (town) empId = empIdByName.get(sup) || '';
          }
        }
        if (!empId || !targetEmpIds.has(empId)) continue;
        unrectifiedEmpMap.set(empId, (unrectifiedEmpMap.get(empId) || 0) + 1);
      }
    }
  }

  // 5) 驾驶员三违：仅经理 tab
  const drvByTown = new Map();
  if (position === '乡镇作业中心经理' && month) {
    const dm = await pool.query(
      `WITH tv AS (
          SELECT trim(name) AS dname, COUNT(*)::int AS cnt
            FROM driver_three_violation
           WHERE left(violation_time, 7) = $1 AND is_deleted = FALSE AND trim(name) <> ''
           GROUP BY trim(name)
       )
       SELECT d.department,
              SUM(COALESCE(d.three_check_management,0) + COALESCE(d.lamp_dirty,0)
                  + COALESCE(d.lamp_failure,0) + COALESCE(d.safety_monitor,0)
                  + COALESCE(d.fire_management,0) + COALESCE(tv.cnt,0))::numeric AS s
         FROM driver_monthly d
         LEFT JOIN tv ON tv.dname = trim(d.name)
        WHERE d.month = $1 AND d.is_deleted = FALSE AND d.department <> ''
        GROUP BY d.department`,
      [month],
    );
    for (const r of dm.rows || []) {
      const base = regionBase(r.department);
      if (base) drvByTown.set(base, round2((drvByTown.get(base) || 0) + Number(r.s || 0)));
    }
  }

  // 组装
  const out = new Map();
  for (const r of tgt.rows) {
    const ekey = String(r.employee_id);
    const townBase = regionBase(r.township);
    const cd = townBase ? companyDeductMap.get(`${month}|${townBase}`) : null;
    const sup = position === '管理员' && townBase
      ? supervisorCompanyMap.get(`${townBase}|${String(r.employee_name || '').trim()}`)
      : null;
    const company = position === '管理员'
      ? { score: sup?.score || 0, helmetCount: sup?.helmetCount || 0, otherCount: sup?.otherCount || 0, details: sup?.details || [] }
      : { score: cd?.score || 0, helmetCount: cd?.helmetCount || 0, otherCount: cd?.otherCount || 0, details: cd?.details || [] };
    out.set(r.employee_id, {
      gridDeduct: dedMap.get(`${ekey}::${KIND_MAP.gridDeduct}`) ?? 0,
      violationDeduct: dedMap.get(`${ekey}::${KIND_MAP.violationDeduct}`) ?? 0,
      unrectifiedDeduct: dedMap.get(`${ekey}::${KIND_MAP.unrectifiedDeduct}`) ?? 0,
      rectifiedDeduct: position === '管理员' ? (unrectifiedEmpMap.get(ekey) ?? 0) : (rectifiedByTown.get(townBase) ?? 0),
      driverDeduct: drvByTown.get(regionBase(r.township)) ?? 0,
      companyDeduct: company,
    });
  }
  return out;
}

/**
 * 便捷：取某考核对象（employee_id）在周期的三违考核「考核分数」合计（六个分量之和）。
 * 供引擎三违类别封顶使用。
 */
async function getEmployeeSanweiTotal(cycleId, position, employeeId, opts = {}) {
  const map = await getPerEmployeeScores(cycleId, position, opts);
  const s = map.get(Number(employeeId)) || map.get(String(employeeId));
  if (!s) return 0;
  return round2(s.gridDeduct + s.violationDeduct + s.unrectifiedDeduct
    + s.rectifiedDeduct + s.driverDeduct + (s.companyDeduct?.score || 0));
}

module.exports = { getPerEmployeeScores, getEmployeeSanweiTotal, regionBase, KIND_MAP };