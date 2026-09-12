/**
 * 规则引擎 · 适配器：现场管理-驾驶员管理「月度」「三检表/灯牌污损/灯具失效/安全监控/消防」扣分
 *
 * 数据源：driver_monthly（驾驶员月度考核台账）
 *   - three_check_management  三检表管理（项次）
 *   - lamp_dirty              灯牌污损（项次）
 *   - lamp_failure            灯具失效（项次）
 *   - safety_monitor          安全监控（项次）
 *   - fire_management         消防管理（项次）
 * 口径（2026-09-04 拍板）：
 *   - 每项每 1 次扣规则库 deductible 分值（默认 1 分，页面可自定义），各子项累加
 *   - 扣分对象 = 传导到所属乡镇作业中心经理 = 驾驶员的直属上级（supervisor，经 v_employee_org_full）
 *   - 当该驾驶员有上级、且上级是当月考核对象时，扣分记到经理 target 名下
 *   - 无法定位到经理 / 经理非考核对象 → 跳过并记 reason（不扣分不报错）
 *   - 计入「现场管理-驾驶员管理」类别，受类别上限钳制（引擎统一处理）
 * 幂等：月度模式，按经理 + 周期每人一条（当月该经理名下全部驾驶问题合并为一条）
 */

const { pool } = require('../../../config/db');
const engine = require('../../assessmentScoringEngine');

const KEY = 'driver_monthly';
const RULE_CODE = 'DRIVER001';
const SOURCE_TABLE = 'driver_monthly';
const KIND = 'driver_monthly';
const EVENT_TYPE = 'DRIVER_MONTHLY';
const METRIC_CODE = 'HSE-KPI-DRV-003';
const METRIC_NAME = '驾驶员月度问题（三检/灯牌/灯具/监控/消防）';

// 子项 → 数据库计数列
const SUBITEMS = [
  { key: 'threeCheck', label: '三检表管理', col: 'three_check_management' },
  { key: 'lampDirty', label: '灯牌污损', col: 'lamp_dirty' },
  { key: 'lampFailure', label: '灯具失效', col: 'lamp_failure' },
  { key: 'safetyMonitor', label: '安全监控', col: 'safety_monitor' },
  { key: 'fireManagement', label: '消防管理', col: 'fire_management' },
];

/**
 * 幂等键：按经理 + 周期
 */
function buildDeductKey({ cycleId, employeeId }) {
  return `driver-monthly:${cycleId}:${employeeId}`;
}

/**
 * 确保指标存在（幂等）
 */
async function ensureMetric(metricCode) {
  let code = metricCode;
  if (code) {
    const existing = await engine.findMetricByCode(code);
    if (existing) return { code, id: existing.id };
    code = METRIC_CODE;
  }
  const metric = await engine.findMetricByCode(METRIC_CODE);
  if (metric) return { code: METRIC_CODE, id: metric.id };
  const r = await pool.query(
    `INSERT INTO hse_assessment_metric
       (metric_code, metric_name, category, target_post, base_score, metric_type,
        data_source, calc_formula, sort_order, status, remark)
     VALUES ($1,$2,'SAFETY','all',0,'auto','driver_monthly',
             '驾驶员本月各问题项次×单次分值，传导到所属乡镇作业中心经理',9,'active',
             '自动考核：现场管理-驾驶员管理月度扣分，传导到经理')
     ON CONFLICT (metric_code) DO UPDATE SET is_deleted=FALSE
     RETURNING id`,
    [METRIC_CODE, METRIC_NAME]
  );
  return { code: METRIC_CODE, id: r.rows[0].id };
}

/**
 * 按"所属作业中心"(department) 找该中心在指定考核周期内的「乡镇作业中心经理」考核对象。
 * 只认该职位；环卫作业中心可命中(韩晓亮/刘菲)，津城街道作业中心无乡镇经理 → 返回 null。
 */
async function findTownManagerForDept(depart, cycleId) {
  const q = `
    SELECT e.employee_id AS id, e.name
      FROM v_employee_org_full e
      JOIN hse_assessment_target t
        ON t.employee_id = e.employee_id AND t.cycle_id = $2 AND t.is_deleted = FALSE
     WHERE e.relation_status = 'active'
       AND e.position_name = '乡镇作业中心经理'
       AND e.org_name = $1
     LIMIT 1`;
  let r = await pool.query(q, [depart, cycleId]);
  if (!r.rows.length) {
    // 兜底：organization 名末段包含（避免"XX作业中心"写法差异）
    const q2 = `SELECT e.employee_id AS id, e.name
                  FROM v_employee_org_full e
                  JOIN hse_assessment_target t
                    ON t.employee_id = e.employee_id AND t.cycle_id = $2 AND t.is_deleted = FALSE
                 WHERE e.relation_status = 'active'
                   AND e.position_name = '乡镇作业中心经理'
                   AND e.org_name LIKE '%' || $1
                 LIMIT 1`;
    r = await pool.query(q2, [depart, cycleId]);
  }
  return r.rows.length ? { id: r.rows[0].id, name: r.rows[0].name } : null;
}

/**
 * 扫描：按驾驶员逐条解析 所属作业中心，聚合到该中心「乡镇作业中心经理」target
 */
async function scan({ cycle, year, month, rule, dryRun }) {
  const cycleId = cycle.id;
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  // 台账守卫：当月无驾驶台账 → 跳过
  const cover = await pool.query(`SELECT COUNT(*)::int AS c FROM driver_monthly WHERE month = $1`, [monthStr]);
  if (!cover.rows.length || cover.rows[0].c <= 0) {
    return { scanned: 0, assessed: 0, intents: [], revocations: [], skipped: [], noLedger: true, metric: null };
  }

  const metric = await ensureMetric(rule.metricCode);

  const records = (
    await pool.query(
      `SELECT id, name, personnel_id, department,
              three_check_management, lamp_dirty, lamp_failure, safety_monitor, fire_management
         FROM driver_monthly
        WHERE month = $1 AND is_deleted = FALSE`,
      [monthStr]
    )
  ).rows;

  const unit = rule.deductScore > 0 ? rule.deductScore : 1;
  const byManager = new Map(); // managerId -> { name, mgrName, counts:{subKey:subCount}, driverNames:[...] }
  const skipped = [];
  const managerCache = new Map(); // department -> {id,name}|null
  let scanned = 0;

  for (const rec of records) {
    scanned++;
    // 累计该驾驶员的子问题项次
    const counts = {};
    let any = false;
    for (const si of SUBITEMS) {
      const v = Math.max(0, Number(rec[si.col]) || 0);
      counts[si.key] = v;
      if (v > 0) any = true;
    }
    // 无任何问题 → 不必找经理
    if (!any) continue;

    // 定位所属乡镇作业中心经理（口径：只能是「乡镇作业中心经理」职位）
    // 以驾驶员台账的 department（所属作业中心）为键，在考核对象中找该中心职位为
    // 「乡镇作业中心经理」的人；环卫作业中心有乡镇经理(韩晓亮/刘菲)可传，
    // 津城街道作业中心无乡镇经理目标 → skipped（findTownManagerForDept 返回 null）。
    const dept = rec.department;
    if (!dept) {
      skipped.push({ employeeId: rec.personnel_id, name: rec.name, reason: 'no-department' });
      continue;
    }
    let mgr = managerCache.get(dept);
    if (mgr === undefined) {
      const found = await findTownManagerForDept(dept, cycleId);
      mgr = found; // 可能是 null
      managerCache.set(dept, mgr);
      if (!mgr) {
        skipped.push({ employeeId: rec.personnel_id, name: rec.name, reason: 'no-town-manager', department: dept });
        continue;
      }
    }
    if (!mgr) continue;
    const managerId = mgr.id;
    const managerName = mgr.name;

    const acc = byManager.get(managerId) || { name: managerName, workerName: '', counts: {}, drivers: [] };
    acc.drivers.push(rec.name);
    for (const k of Object.keys(counts)) {
      acc.counts[k] = (acc.counts[k] || 0) + counts[k];
    }
    acc.name = managerName;
    byManager.set(managerId, acc);
  }

  const intents = [];
  const revocations = [];
  let seq = 0;

  for (const [managerId, acc] of byManager) {
    const target = await engine.findAssessmentTarget(cycleId, managerId);
    if (!target) {
      skipped.push({ employeeId: managerId, name: acc.name, reason: 'manager-not-assessment-target' });
      continue;
    }
    let total = 0;
    const detailLines = [];
    for (const si of SUBITEMS) {
      const v = acc.counts[si.key] || 0;
      if (v > 0) {
        total += v * unit;
        detailLines.push(`${si.label}${v}次`);
      }
    }
    const rawScore = Math.round(total * 100) / 100;
    const base = {
      _seq: seq++,
      cycleId,
      targetId: target.id,
      employeeId: managerId,
      employeeName: acc.name,
      ruleName: rule.ruleName,
      category: rule.category,
      counts: acc.counts,
      drivers: acc.drivers,
      unit,
      rawScore,
      year,
      month,
    };
    if (rawScore <= 0) {
      revocations.push(base);
    } else {
      intents.push(base);
    }
  }

  return { scanned, assessed: intents.length + revocations.length, intents, revocations, skipped, noLedger: false, metric };
}

function buildItem(intent, rule) {
  return rule.ruleName;
}

function buildDetail(intent, capRes) {
  const lines = SUBITEMS.filter((si) => (intent.counts[si.key] || 0) > 0)
    .map((si) => `${si.label}${intent.counts[si.key]}次`);
  return {
    kind: KIND,
    deductKey: buildDeductKey({ cycleId: intent.cycleId, employeeId: intent.employeeId }),
    ruleName: intent.ruleName,
    category: intent.category,
    eventType: EVENT_TYPE,
    counts: intent.counts,
    drivers: intent.drivers,
    unit: intent.unit,
    rawScore: intent.rawScore,
    cap: capRes.cap,
    cappedScore: capRes.cappedScore,
    otherCatScore: capRes.otherCatScore,
    year: intent.year,
    month: intent.month,
    summary: `驾驶问题（${lines.join('、')}，传导）`,
  };
}

function buildReportDetail(intent, outcome) {
  const base = {
    employeeId: intent.employeeId,
    employeeName: intent.employeeName,
    counts: intent.counts,
    drivers: intent.drivers,
    rawScore: intent.rawScore,
  };
  if (outcome.type === 'revoke') {
    return { ...base, cappedScore: 0, action: outcome.action };
  }
  if (outcome.type === 'capped-out') {
    return { ...base, cappedScore: 0, cappedOut: true, action: outcome.action };
  }
  return { ...base, cappedScore: outcome.cappedScore, action: outcome.action };
}

module.exports = {
  key: KEY,
  ruleCode: RULE_CODE,
  sourceTable: SOURCE_TABLE,
  kind: KIND,
  metricCode: METRIC_CODE,
  ensureMetric,
  buildDeductKey,
  scan,
  buildItem,
  buildDetail,
  buildReportDetail,
};