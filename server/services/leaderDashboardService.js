/**
 * 领导视角统一看板（/api/hse/leader-dashboard）—— service 层
 * 按组织维度（作业中心 → 乡镇 → 角色 → 人员）跨模块聚合，全部只读 SELECT，无写入。
 * 契约：对外函数返回 { __t:'json', body }；异常抛错由 controller run() 归一 500。
 *
 * 乡镇归因统一策略（与三违按花名册口径一致）：
 *   a) 记录带人员 ID 且命中当前任职 → 按 v_employee_org_full 反推组织
 *   b) 否则按自由文本（township / area_team）对乡镇短名做最长前缀匹配
 *   c) 均未命中 → 未匹配桶
 */

const { pool } = require('../config/db');

// ===== 乡镇名归因 =====
function townshipShortName(orgName) {
  if (!orgName) return '';
  return String(orgName).replace(/作业中心$/, '').trim();
}

function cleanText(raw) {
  return String(raw == null ? '' : raw).trim();
}

/**
 * 姓名清洗（对齐三违按花名册口径，_aug_generate.py clean_viol）：
 * 去除（ ）( ) 括号备注后 trim；笔误归并表属三违分析模块按月维护，此处不复刻。
 */
function cleanPersonName(raw) {
  return String(raw == null ? '' : raw).replace(/[（(][^）)]*[）)]/g, '').trim();
}

/** 行政区后缀归一：长官镇/刘营伍乡/宁城街道 → 长官/刘营伍/宁城（转运站 area_team、隐患描述短名匹配用） */
function normalizeRegion(s) {
  return String(s == null ? '' : s).replace(/(镇|乡|街道)$/, '').trim();
}

/** 文本归因：把业务自由文本对齐到乡镇/公园组织；towns=[{id,orgName,short}]，未命中返回 null */
function matchTownship(raw, towns) {
  const text = cleanText(raw);
  if (!text) return null;
  const textNorm = normalizeRegion(text);
  let best = null;
  const consider = (matchLen, t) => {
    if (!best || matchLen > best.matchLen) {
      best = { orgId: t.id, orgName: t.orgName, matchLen };
    }
  };
  for (const t of towns) {
    const candidates = [];
    if (t.orgName) candidates.push(t.orgName);
    if (t.short) candidates.push(t.short);
    for (const cand of candidates) {
      // a) 原口径：文本以组织全名/短名开头（如「长官镇三班三违」）
      if (text.startsWith(cand)) consider(cand.length, t);
      const candNorm = normalizeRegion(cand);
      // b) 去后缀前缀匹配：文本以「相衙」「保店」开头（隐患描述「相衙转运站…」）；限长>=2 防单字误配
      if (candNorm.length >= 2 && text.startsWith(candNorm)) consider(candNorm.length, t);
      // c) 去后缀相等匹配：area_team=「保店」↔ 短名「保店镇」（转运站检查台账）
      if (candNorm && textNorm && candNorm === textNorm) consider(cand.length, t);
    }
  }
  return best;
}

function getYearRange(year) {
  const y = parseInt(year, 10);
  const valid = Number.isFinite(y) && y >= 2000 && y <= 2100 ? y : new Date().getFullYear();
  return { year: valid, start: `${valid}-01-01`, end: `${valid}-12-31` };
}

/**
 * 年度/累计范围：year 缺省 / null / 'all' → 全历史（历年累计）；显式年份 → 当年；非法回退当前年。
 * 返回 null=累计模式（不过滤日期），否则 { year, start, end }。
 */
function buildRange(year) {
  if (year == null || year === '' || String(year).toLowerCase() === 'all') return null;
  return getYearRange(year);
}

/** 10 维度汇总骨架（环卫线全量；园林线前端按维度集渲染，drivers/transferStations 恒 0） */
function emptySummary() {
  return {
    accidents: { count: 0, major: 0, weightedIndex: 0 },
    drivers: { personCount: 0, demeritCount: 0, vehicleCheckCount: 0, driverCheckCount: 0, violationCount: 0 },
    risks: { count: 0 },
    hazards: { count: 0 },
    transferStations: { checkCount: 0 },
    violations: { count: 0, serious: 0 },
    inspections: { count: 0 },
    trainings: { recordCount: 0, personCount: 0 },
    emergencies: { count: 0, passed: 0 },
    assessments: { targetCount: 0, avgScore: 0, gradeGood: 0 },
  };
}

/** 全局唯一姓名 → employeeId（姓名兜底用；重名不参与，避免错配） */
function buildUniqueNameIndex(employees) {
  const cnt = new Map();
  for (const e of employees.values()) cnt.set(e.name, (cnt.get(e.name) || 0) + 1);
  const idx = new Map();
  for (const e of employees.values()) if (cnt.get(e.name) === 1) idx.set(e.name, e.employeeId);
  return idx;
}

/** 岗位 → 角色分组（乡镇作业中心经理/管理员/驾驶员/其他） */
function identifyRole(positionName) {
  const p = String(positionName || '');
  if (p.includes('乡镇作业中心经理')) return 'manager';
  if (p.includes('管理员')) return 'admin';
  if (p.includes('驾驶') || p.includes('司机')) return 'driver';
  return 'other';
}

// ===== 基础数据加载 =====
async function loadOrg() {
  const r = await pool.query(
    `SELECT id, parent_id, org_name, org_type, org_code, level
     FROM hse_org_unit
     WHERE is_deleted = false AND org_type IN ('center', 'town_center', 'park')
     ORDER BY level, sort_order, id`
  );
  const centers = [];
  const towns = [];
  for (const row of r.rows) {
    const node = {
      // hse_org_unit.id 为 bigint，node-pg 返回字符串；统一归一 number 避免 === 比较落空
      id: toNumber(row.id),
      parentId: toNumber(row.parent_id),
      orgName: row.org_name,
      orgType: row.org_type,
      orgCode: row.org_code,
      level: row.level,
      short: townshipShortName(row.org_name),
      towns: [],
    };
    if (row.org_type === 'center') centers.push(node);
    else towns.push(node);
  }
  const townById = new Map(towns.map(t => [t.id, t]));
  for (const t of towns) {
    const parent = centers.find(c => c.id === t.parentId);
    if (parent) parent.towns.push({ id: t.id, orgName: t.orgName, short: t.short, orgType: t.orgType });
  }
  const townIndex = towns.map(t => ({ id: t.id, orgName: t.orgName, short: t.short, orgType: t.orgType }));
  return { centers, towns, townIndex };
}

/** 员工当前任职链：employeeId → {orgId, orgName, orgType, positionName} */
async function loadEmployees() {
  const r = await pool.query(
    `SELECT employee_id, employee_code, name, position_name, org_unit_id, org_name, org_type, supervisor_name
     FROM v_employee_org_full
     WHERE relation_status = 'active' AND is_deleted = false`
  );
  const map = new Map();
  for (const row of r.rows) {
    // employee_id / org_unit_id 亦为 bigint（node-pg 字符串），统一归一 number
    map.set(toNumber(row.employee_id), {
      employeeId: toNumber(row.employee_id),
      employeeCode: row.employee_code,
      name: row.name,
      positionName: row.position_name,
      orgId: toNumber(row.org_unit_id),
      orgName: row.org_name,
      orgType: row.org_type,
      supervisorName: row.supervisor_name,
    });
  }
  return map;
}

/**
 * 记录归因：优先人员反推，其次文本匹配。
 * record: { employeeId?, text? }；towns/townIndex 为文本匹配候选。
 * 返回 { orgId } 或 { direct: true, orgType, orgName }（中心直管/职能部门）或 null。
 */
function attributeRecord(record, townIndex, employees) {
  if (record.employeeId != null && employees.has(record.employeeId)) {
    const emp = employees.get(record.employeeId);
    if (emp.orgType === 'town_center') return { orgId: emp.orgId };
    return { direct: true, orgType: emp.orgType, orgName: emp.orgName };
  }
  const m = matchTownship(record.text, townIndex);
  return m ? { orgId: m.orgId } : null;
}

// ===== 聚合辅助 =====
function groupByOrg(rows, townIndex, employees, opts = {}) {
  const groups = new Map();
  const direct = {};
  let unmatched = 0;
  const get = orgId => {
    if (!groups.has(orgId)) groups.set(orgId, opts.init ? opts.init() : {});
    return groups.get(orgId);
  };
  for (const row of rows) {
    const attr = attributeRecord(row, townIndex, employees);
    if (attr && attr.orgId) get(attr.orgId);
    else if (attr && attr.direct) direct[attr.orgName] = (direct[attr.orgName] || 0) + 1;
    else unmatched += 1;
  }
  return { groups, direct, unmatched };
}

function toNumber(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

function toFloat(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 日期规范化输出 YYYY-MM-DD（2026-09-18 冻结口径）。
 * PG date 列经 node-pg 解析为本地时区 JS Date，直接 JSON 序列化会带 T/Z 且可能回退一天；
 * 统一取本地年月日字符串，前端 formatDateShort 对纯 YYYY-MM-DD 原样显示。
 */
function fmtDate(v) {
  if (v == null) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : String(v);
}

// ===== 1. GET /centers =====
async function centers() {
  const { centers, towns } = await loadOrg();
  const body = centers.map(c => ({
    id: c.id,
    orgName: c.orgName,
    orgType: c.orgType,
    townCount: c.towns.length,
    towns: c.towns.map(t => ({ id: t.id, orgName: t.orgName, shortName: t.short })),
  }));
  return { __t: 'json', body: { code: 0, data: { centers: body, townTotal: towns.length } } };
}

// ===== 共享聚合：单位 10 维度汇总（历年累计 / 按年） =====
const ACCIDENT_WEIGHT = { '轻微': 1, '一般': 3, '较大': 6, '重大': 10, '特别重大': 15 };

/**
 * 填充单位汇总。unitMap: Map<orgId, {id, orgName, shortName, orgType, summary}>
 * scope: null=累计（全历史）| {year,start,end}=按年。全部只读 SELECT。
 */
async function fillSummaries({ unitMap, employees, townIndex, scope }) {
  if (!unitMap.size) return unitMap;
  const isCumulative = !scope;
  const year = scope ? scope.year : null;
  const start = scope ? scope.start : null;
  const end = scope ? scope.end : null;
  const dateClause = col => (isCumulative ? '' : ` AND ${col} >= '${start}' AND ${col} <= '${end}'`);
  const yearLike = isCumulative ? '' : ` AND violation_time LIKE '${year}-%'`;
  const tsLike = isCumulative ? '' : ` AND check_date LIKE '${year}-%'`;

  const [accR, vioR, insR, assessR, trainR, emgR, demR, vehR, dchkR, dvR, dtvR, riskR, hazR, tsR] = await Promise.all([
    pool.query(`SELECT id, township, level, personnel_id FROM accidents WHERE is_deleted = false${dateClause('accident_date')}`),
    pool.query(`SELECT id, area_team, violation_level, violator_id FROM violation_records WHERE is_deleted = false${dateClause('violation_date')}`),
    pool.query(`SELECT id, area_team, inspector_employee_id FROM grid_inspection_records WHERE 1=1${dateClause('inspection_date')}`),
    pool.query(
      `SELECT t.id, t.employee_id, t.township, t.score_total, t.grade
       FROM hse_assessment_target t
       JOIN hse_assessment_cycle c ON c.id = t.cycle_id AND c.is_deleted = false
       WHERE t.is_deleted = false${isCumulative ? '' : ` AND c.assessment_year = ${year}`}`
    ),
    pool.query(`SELECT id, employee_id FROM training_records WHERE is_deleted = false${dateClause('training_date')}`),
    pool.query(`SELECT id, township, name, result FROM emergency_drills WHERE is_deleted = false${dateClause('drill_date')}`),
    pool.query(`SELECT id, employee_id FROM license_demerit_records WHERE is_deleted = false${dateClause('demerit_date')}`),
    pool.query(`SELECT id, employee_id FROM vehicle_inspection_records WHERE is_deleted = false${dateClause('inspection_date')}`),
    pool.query(`SELECT id, employee_id FROM hse_driver_inspection_records WHERE is_deleted = false${dateClause('inspection_date')}`),
    pool.query(`SELECT id, name FROM driver_violation WHERE is_deleted = false${yearLike}`),
    pool.query(`SELECT id, name FROM driver_three_violation WHERE is_deleted = false${yearLike}`),
    pool.query(`SELECT id, area, responsible_person_id FROM risk_sources WHERE is_deleted = false`),
    pool.query(`SELECT id, description FROM hazards WHERE is_deleted = false${dateClause('hazard_date')}`),
    pool.query(`SELECT id, area_team FROM transfer_station_check WHERE is_deleted = false${tsLike}`),
  ]);

  const nameIndex = buildUniqueNameIndex(employees);
  const getUnit = orgId => unitMap.get(orgId);
  const attrBy = row => attributeRecord({ employeeId: row.employeeId, text: row.text }, townIndex, employees);
  const attrByName = name => {
    const id = nameIndex.get(cleanPersonName(name));
    if (id == null) return null;
    return attributeRecord({ employeeId: id, text: null }, townIndex, employees);
  };
  const bump = (orgId, fn) => {
    const u = getUnit(orgId);
    if (u) fn(u.summary);
  };

  // 事故
  for (const r of accR.rows) {
    const a = attributeRecord({ employeeId: toNumber(r.personnel_id), text: r.township }, townIndex, employees);
    if (a && a.orgId) bump(a.orgId, s => {
      s.accidents.count += 1;
      if (r.level === '重大' || r.level === '特别重大') s.accidents.major += 1;
      s.accidents.weightedIndex += ACCIDENT_WEIGHT[r.level] || 1;
    });
  }
  // 三违
  for (const r of vioR.rows) {
    const a = attributeRecord({ employeeId: toNumber(r.violator_id), text: r.area_team }, townIndex, employees);
    if (a && a.orgId) bump(a.orgId, s => {
      s.violations.count += 1;
      if (r.violation_level === '严重') s.violations.serious += 1;
    });
  }
  // 网格长巡查
  for (const r of insR.rows) {
    const a = attributeRecord({ employeeId: toNumber(r.inspector_employee_id), text: r.area_team }, townIndex, employees);
    if (a && a.orgId) bump(a.orgId, s => { s.inspections.count += 1; });
  }
  // 考核
  const assessScores = new Map();
  for (const r of assessR.rows) {
    const a = attributeRecord({ employeeId: toNumber(r.employee_id), text: r.township }, townIndex, employees);
    if (a && a.orgId) {
      bump(a.orgId, s => {
        s.assessments.targetCount += 1;
        if (r.grade === '优秀' || r.grade === '良好') s.assessments.gradeGood += 1;
      });
      assessScores.set(a.orgId, (assessScores.get(a.orgId) || 0) + toFloat(r.score_total));
    }
  }
  for (const [orgId, u] of unitMap) {
    const n = u.summary.assessments.targetCount;
    u.summary.assessments.avgScore = n > 0 ? Math.round((assessScores.get(orgId) || 0) / n * 100) / 100 : 0;
  }
  // 培训
  const trainPersons = new Map();
  for (const r of trainR.rows) {
    const a = attributeRecord({ employeeId: toNumber(r.employee_id), text: null }, townIndex, employees);
    if (a && a.orgId) {
      bump(a.orgId, s => { s.trainings.recordCount += 1; });
      if (!trainPersons.has(a.orgId)) trainPersons.set(a.orgId, new Set());
      trainPersons.get(a.orgId).add(toNumber(r.employee_id));
    }
  }
  for (const [orgId, u] of unitMap) u.summary.trainings.personCount = trainPersons.get(orgId) ? trainPersons.get(orgId).size : 0;
  // 应急（实测 township 为空串、演练名如「津城街道三班」承载乡镇信息 → township||name）
  for (const r of emgR.rows) {
    const a = attributeRecord({ employeeId: null, text: r.township || r.name }, townIndex, employees);
    if (a && a.orgId) bump(a.orgId, s => {
      s.emergencies.count += 1;
      if (r.result === 'pass' || r.result === 'excellent') s.emergencies.passed += 1;
    });
  }
  // 驾驶员：在职驾驶岗位人数（按组织直接归属）
  for (const e of employees.values()) {
    if ((e.orgType === 'town_center' || e.orgType === 'park') && /驾驶|司机/.test(String(e.positionName || ''))) {
      bump(e.orgId, s => { s.drivers.personCount += 1; });
    }
  }
  // 驾驶员：驾驶证记分 / 车辆检查 / 驾驶员检查（employee_id 反推）
  for (const r of demR.rows) {
    const a = attributeRecord({ employeeId: toNumber(r.employee_id), text: null }, townIndex, employees);
    if (a && a.orgId) bump(a.orgId, s => { s.drivers.demeritCount += 1; });
  }
  for (const r of vehR.rows) {
    const a = attributeRecord({ employeeId: toNumber(r.employee_id), text: null }, townIndex, employees);
    if (a && a.orgId) bump(a.orgId, s => { s.drivers.vehicleCheckCount += 1; });
  }
  for (const r of dchkR.rows) {
    const a = attributeRecord({ employeeId: toNumber(r.employee_id), text: null }, townIndex, employees);
    if (a && a.orgId) bump(a.orgId, s => { s.drivers.driverCheckCount += 1; });
  }
  // 驾驶员：违章（姓名兜底，重名不参与）
  for (const r of dvR.rows) {
    const a = attrByName(r.name);
    if (a && a.orgId) bump(a.orgId, s => { s.drivers.violationCount += 1; });
  }
  for (const r of dtvR.rows) {
    const a = attrByName(r.name);
    if (a && a.orgId) bump(a.orgId, s => { s.drivers.violationCount += 1; });
  }
  // 风险（responsible_person_id 反推 + area 文本；实测 area=部门名 → 乡镇级多为未匹配，如实呈现 0）
  for (const r of riskR.rows) {
    const a = attributeRecord({ employeeId: toNumber(r.responsible_person_id), text: r.area }, townIndex, employees);
    if (a && a.orgId) bump(a.orgId, s => { s.risks.count += 1; });
  }
  // 隐患（描述文本含乡镇名，如「相衙转运站…」）
  for (const r of hazR.rows) {
    const a = attributeRecord({ employeeId: null, text: r.description }, townIndex, employees);
    if (a && a.orgId) bump(a.orgId, s => { s.hazards.count += 1; });
  }
  // 转运站（area_team 短名）
  for (const r of tsR.rows) {
    const a = attributeRecord({ employeeId: null, text: r.area_team }, townIndex, employees);
    if (a && a.orgId) bump(a.orgId, s => { s.transferStations.checkCount += 1; });
  }
  return unitMap;
}

// ===== 2. GET /centers/:id/towns =====
async function townsByCenter(rawReq) {
  const centerId = parseInt(rawReq.params.id, 10);
  const scope = buildRange(rawReq.query.year);
  const { centers, townIndex } = await loadOrg();
  const employees = await loadEmployees();
  const center = centers.find(c => c.id === centerId);
  if (!center) {
    return { __t: 'json', body: { code: 1, message: '作业中心不存在' } };
  }
  const unitMap = new Map(center.towns.map(t => [t.id, {
    id: t.id,
    orgName: t.orgName,
    shortName: t.short,
    orgType: t.orgType,
    summary: emptySummary(),
  }]));
  await fillSummaries({ unitMap, employees, townIndex, scope });

  return {
    __t: 'json',
    body: {
      code: 0,
      data: {
        center: { id: center.id, orgName: center.orgName, orgType: center.orgType },
        year: scope ? scope.year : null,
        cumulative: !scope,
        towns: Array.from(unitMap.values()),
      },
    },
  };
}

// ===== 3. GET /towns/:id/roles =====
async function rolesByTown(rawReq) {
  const townId = parseInt(rawReq.params.id, 10);
  const { year, start, end } = getYearRange(rawReq.query.year);
  const { townIndex } = await loadOrg();
  const employees = await loadEmployees();
  const town = townIndex.find(t => t.id === townId);
  if (!town) return { __t: 'json', body: { code: 1, message: '乡镇作业中心不存在' } };

  const townEmp = Array.from(employees.values()).filter(e => e.orgId === townId);
  const byRole = { manager: [], admin: [], driver: [], other: [] };
  const empMap = new Map();
  const nameCnt = new Map();
  for (const e of townEmp) {
    const role = identifyRole(e.positionName);
    byRole[role].push(e);
    empMap.set(e.employeeId, e);
    nameCnt.set(e.name, (nameCnt.get(e.name) || 0) + 1);
  }
  // 唯一姓名 → 员工：姓名兜底匹配；重名不参与兜底，避免错配
  const nameIndex = new Map();
  for (const e of townEmp) {
    if (nameCnt.get(e.name) === 1) nameIndex.set(e.name, e.employeeId);
  }

  const [vioR, accR, insR, trainR, assessR] = await Promise.all([
    pool.query(
      `SELECT id, violator_id, violation_date, violation_type, violation_level, violator_name FROM violation_records
       WHERE is_deleted = false AND violation_date >= $1 AND violation_date <= $2`,
      [start, end]
    ),
    pool.query(
      `SELECT id, personnel_id, accident_date, level FROM accidents
       WHERE is_deleted = false AND accident_date >= $1 AND accident_date <= $2`,
      [start, end]
    ),
    pool.query(
      `SELECT id, inspector_employee_id, personnel_name, inspection_date, area_team, grid_level FROM grid_inspection_records
       WHERE inspection_date >= $1 AND inspection_date <= $2`,
      [start, end]
    ),
    pool.query(
      `SELECT id, employee_id, training_date, training_type, result FROM training_records
       WHERE is_deleted = false AND training_date >= $1 AND training_date <= $2`,
      [start, end]
    ),
    pool.query(
      `SELECT t.employee_id, t.score_total, t.grade, c.assessment_month
       FROM hse_assessment_target t
       JOIN hse_assessment_cycle c ON c.id = t.cycle_id AND c.is_deleted = false
       WHERE t.is_deleted = false AND c.assessment_year = $1`,
      [year]
    ),
  ]);

  // 各员工计数：先按员工 ID，未命中再按清洗后姓名兜底（与详情层口径一致）
  const counters = new Map();
  const getC = empId => {
    if (!counters.has(empId)) counters.set(empId, { violations: 0, accidents: 0, inspections: 0, trainings: 0, assessments: [], assessmentAvg: 0 });
    return counters.get(empId);
  };
  const countByKey = (rows, idGetter, nameGetter, key) => {
    for (const r of rows) {
      const id = toNumber(idGetter(r));
      if (empMap.has(id)) {
        getC(id)[key] += 1;
        continue;
      }
      const nameHit = nameIndex.get(cleanPersonName(nameGetter(r)));
      if (nameHit != null) getC(nameHit)[key] += 1;
    }
  };
  countByKey(vioR.rows, r => r.violator_id, r => r.violator_name, 'violations');
  for (const r of accR.rows) {
    const pid = toNumber(r.personnel_id);
    if (empMap.has(pid)) getC(pid).accidents += 1;
  }
  countByKey(insR.rows, r => r.inspector_employee_id, r => r.personnel_name, 'inspections');
  for (const r of trainR.rows) if (empMap.has(toNumber(r.employee_id))) getC(toNumber(r.employee_id)).trainings += 1;
  for (const r of assessR.rows) {
    if (empMap.has(toNumber(r.employee_id))) getC(toNumber(r.employee_id)).assessments.push({ month: r.assessment_month, score: toFloat(r.score_total), grade: r.grade });
  }

  const buildRole = (role, label) => ({
    role,
    label,
    count: byRole[role].length,
    employees: byRole[role].map(e => {
      const c = getC(e.employeeId);
      const sum = c.assessments.reduce((s, a) => s + a.score, 0);
      return {
        employeeId: e.employeeId,
        employeeCode: e.employeeCode,
        name: e.name,
        positionName: e.positionName,
        summary: {
          violations: c.violations,
          accidents: c.accidents,
          inspections: c.inspections,
          trainings: c.trainings,
          assessmentCount: c.assessments.length,
          assessmentAvgScore: c.assessments.length > 0 ? Math.round((sum / c.assessments.length) * 100) / 100 : 0,
        },
      };
    }),
  });

  const roles = [
    buildRole('manager', '乡镇作业中心经理'),
    buildRole('admin', '管理员'),
    buildRole('driver', '驾驶员'),
    buildRole('other', '其他岗位'),
  ];

  return {
    __t: 'json',
    body: {
      code: 0,
      data: {
        town: { id: town.id, orgName: town.orgName, shortName: town.short },
        year,
        employeeCount: townEmp.length,
        roles,
      },
    },
  };
}

// ===== 4. GET /employees/:id =====
async function employeeDetail(rawReq) {
  const employeeId = parseInt(rawReq.params.id, 10);
  const { year, start, end } = getYearRange(rawReq.query.year);
  const employees = await loadEmployees();
  const emp = employees.get(employeeId);
  if (!emp) return { __t: 'json', body: { code: 1, message: '员工不存在或未在岗' } };

  const [assessR, accR, vioR, insR, trainR, insuR] = await Promise.all([
    pool.query(
      `SELECT t.id, t.score_total, t.grade, t.rank_township, c.assessment_year, c.assessment_month, c.cycle_name
       FROM hse_assessment_target t
       JOIN hse_assessment_cycle c ON c.id = t.cycle_id AND c.is_deleted = false
       WHERE t.is_deleted = false AND t.employee_id = $1 AND c.assessment_year = $2
       ORDER BY c.assessment_month`,
      [employeeId, year]
    ),
    pool.query(
      `SELECT id, no, description, level, accident_date, township FROM accidents
       WHERE is_deleted = false AND accident_date >= $1 AND accident_date <= $2
         AND personnel_id = $3
       ORDER BY accident_date DESC`,
      [start, end, employeeId]
    ),
    pool.query(
      `SELECT id, violation_date, violation_type, violation_level, violator_name FROM violation_records
       WHERE is_deleted = false AND violation_date >= $1 AND violation_date <= $2
         AND (violator_id = $3 OR btrim(regexp_replace(violator_name, '[（(][^）)]*[）)]', '', 'g')) = $4)
       ORDER BY violation_date DESC`,
      [start, end, employeeId, emp.name]
    ),
    pool.query(
      `SELECT id, inspection_date, area_team, grid_level FROM grid_inspection_records
       WHERE inspection_date >= $1 AND inspection_date <= $2
         AND (inspector_employee_id = $3 OR btrim(regexp_replace(personnel_name, '[（(][^）)]*[）)]', '', 'g')) = $4)
       ORDER BY inspection_date DESC`,
      [start, end, employeeId, emp.name]
    ),
    pool.query(
      `SELECT id, training_date, training_type, result, trainer FROM training_records
       WHERE is_deleted = false AND training_date >= $1 AND training_date <= $2 AND employee_id = $3
       ORDER BY training_date DESC`,
      [start, end, employeeId]
    ),
    pool.query(
      `SELECT id, person_name, insurance_type, start_date, expire_date, premium, is_current
       FROM personnel_insurance
       WHERE is_deleted = false AND employee_id = $1
       ORDER BY is_current DESC, id DESC`,
      [employeeId]
    ),
  ]);

  return {
    __t: 'json',
    body: {
      code: 0,
      data: {
        employee: {
          employeeId: emp.employeeId,
          employeeCode: emp.employeeCode,
          name: emp.name,
          positionName: emp.positionName,
          orgName: emp.orgName,
          orgType: emp.orgType,
          supervisorName: emp.supervisorName,
        },
        year,
        assessment: assessR.rows.map(r => ({
          id: r.id,
          month: `${r.assessment_year}-${String(r.assessment_month).padStart(2, '0')}`,
          cycleName: r.cycle_name,
          scoreTotal: toFloat(r.score_total), grade: r.grade, rankTownship: r.rank_township,
        })),
        accidents: accR.rows.map(r => ({
          id: r.id, accidentNo: r.no, title: r.description, level: r.level,
          accidentDate: fmtDate(r.accident_date), township: r.township,
        })),
        violations: vioR.rows.map(r => ({
          id: r.id, violationDate: fmtDate(r.violation_date), violationType: r.violation_type,
          violationLevel: r.violation_level, violatorName: r.violator_name,
        })),
        inspections: insR.rows.map(r => ({
          id: r.id, inspectionDate: fmtDate(r.inspection_date), areaTeam: r.area_team, gridLevel: r.grid_level,
        })),
        trainings: trainR.rows.map(r => ({
          id: r.id, trainingDate: fmtDate(r.training_date), trainingType: r.training_type,
          result: r.result, trainer: r.trainer,
        })),
        insurance: insuR.rows.map(r => ({
          id: r.id, personName: r.person_name, insuranceType: r.insurance_type,
          startDate: fmtDate(r.start_date), expireDate: fmtDate(r.expire_date), premium: toFloat(r.premium),
          isCurrent: !!r.is_current,
        })),
      },
    },
  };
}

// ===== 5. 月度 / 经理双口径（P2 扩展，2026-09-27 冻结口径） =====
// 冻结：
//  - 逐月趋势月份 = 该组织各维度「有记录月份」并集，升序；累计模式下截断到当前月（未来日期脏数据不展示）。
//  - 风险为静态台账（无业务日期）→ 不参与月度；驾驶人员数为时点台账 → 仅累计。
//  - 经理双口径：辖区 = 组织全量（复用 fillSummaries 口径）；个人 = 本人归因（ID 反推 + 全局唯一姓名兜底）。

/** 日期/字符串 → 'YYYY-MM' 月份键；解析失败返回 null */
function monthKey(v) {
  if (v == null) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}`;
  }
  const m = /^(\d{4})-(\d{2})/.exec(String(v));
  return m ? `${m[1]}-${m[2]}` : null;
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 单月单元格（风险/驾驶人员数不参与月度） */
function emptyMonthCell() {
  return {
    accidents: { count: 0, major: 0, weightedIndex: 0 },
    drivers: { demeritCount: 0, vehicleCheckCount: 0, driverCheckCount: 0, violationCount: 0 },
    hazards: { count: 0 },
    transferStations: { checkCount: 0 },
    violations: { count: 0, serious: 0 },
    inspections: { count: 0 },
    trainings: { recordCount: 0, personCount: 0 },
    emergencies: { count: 0, passed: 0 },
    assessments: { targetCount: 0, gradeGood: 0, avgScore: 0 },
  };
}

/**
 * 全量维度行加载（趋势/个人聚合共用，行带 _m 月份键）。
 * SQL 与 fillSummaries 同源同表；scope 过滤与 fillSummaries 一致。
 */
async function loadAllDimensionRows(scope) {
  const isCumulative = !scope;
  const year = scope ? scope.year : null;
  const start = scope ? scope.start : null;
  const end = scope ? scope.end : null;
  const dateClause = col => (isCumulative ? '' : ` AND ${col} >= '${start}' AND ${col} <= '${end}'`);
  const yearLike = isCumulative ? '' : ` AND violation_time LIKE '${year}-%'`;
  const tsLike = isCumulative ? '' : ` AND check_date LIKE '${year}-%'`;

  // 展示字段扩展（2026-09-28）：为 /dim-records 下钻提供明细列，现有端点仅消费各自聚合键，不受影响。
  const [accR, vioR, insR, assessR, trainR, emgR, demR, vehR, dchkR, dvR, dtvR, riskR, hazR, tsR] = await Promise.all([
    pool.query(`SELECT id, no, description, township, level, personnel_id, accident_date AS _d FROM accidents WHERE is_deleted = false${dateClause('accident_date')}`),
    pool.query(`SELECT id, area_team, violation_level, violation_type, violator_id, violator_name, violation_date AS _d FROM violation_records WHERE is_deleted = false${dateClause('violation_date')}`),
    pool.query(`SELECT id, area_team, grid_level, inspector_employee_id, personnel_name, inspection_date AS _d FROM grid_inspection_records WHERE 1=1${dateClause('inspection_date')}`),
    pool.query(
      `SELECT t.id, t.employee_id, t.township, t.score_total, t.grade, t.rank_township, c.cycle_name,
              c.assessment_year AS _ay, c.assessment_month AS _am, e.name AS employee_name
       FROM hse_assessment_target t
       JOIN hse_assessment_cycle c ON c.id = t.cycle_id AND c.is_deleted = false
       LEFT JOIN v_employee_org_full e ON e.employee_id = t.employee_id
       WHERE t.is_deleted = false${isCumulative ? '' : ` AND c.assessment_year = ${year}`}`
    ),
    pool.query(`SELECT t.id, t.employee_id, t.personnel_id, t.training_type, t.result, t.trainer, t.training_date AS _d, e.name AS employee_name
                FROM training_records t
                LEFT JOIN v_employee_org_full e ON e.employee_id = t.employee_id
                WHERE t.is_deleted = false${dateClause('t.training_date')}`),
    pool.query(`SELECT id, township, name, result, drill_date AS _d FROM emergency_drills WHERE is_deleted = false${dateClause('drill_date')}`),
    pool.query(`SELECT id, employee_id, employee_name, demerit_date AS _d FROM license_demerit_records WHERE is_deleted = false${dateClause('demerit_date')}`),
    pool.query(`SELECT v.id, v.employee_id, v.inspection_date AS _d, e.name AS employee_name
                FROM vehicle_inspection_records v
                LEFT JOIN v_employee_org_full e ON e.employee_id = v.employee_id
                WHERE v.is_deleted = false${dateClause('v.inspection_date')}`),
    pool.query(`SELECT d.id, d.employee_id, d.inspection_date AS _d, e.name AS employee_name
                FROM hse_driver_inspection_records d
                LEFT JOIN v_employee_org_full e ON e.employee_id = d.employee_id
                WHERE d.is_deleted = false${dateClause('d.inspection_date')}`),
    pool.query(`SELECT id, name, violation_type, violation_desc, violation_time AS _d FROM driver_violation WHERE is_deleted = false${yearLike}`),
    pool.query(`SELECT id, name, violation_type, violation_desc, violation_time AS _d FROM driver_three_violation WHERE is_deleted = false${yearLike}`),
    pool.query(`SELECT id, name, area, responsible_person_id, responsible_person FROM risk_sources WHERE is_deleted = false`),
    pool.query(`SELECT id, description, finder_id, responsible_id, hazard_date AS _d FROM hazards WHERE is_deleted = false${dateClause('hazard_date')}`),
    pool.query(`SELECT id, area_team, patrol_person, check_date AS _d FROM transfer_station_check WHERE is_deleted = false${tsLike}`),
  ]);

  const withMonth = rows => rows.map(r => ({ ...r, _m: monthKey(r._d) }));
  return {
    accidents: withMonth(accR.rows),
    violations: withMonth(vioR.rows),
    inspections: withMonth(insR.rows),
    assessments: assessR.rows.map(r => ({
      ...r,
      _m: r._ay != null && r._am != null ? `${r._ay}-${String(r._am).padStart(2, '0')}` : null,
    })),
    trainings: withMonth(trainR.rows),
    emergencies: withMonth(emgR.rows),
    demerits: withMonth(demR.rows),
    vehicleChecks: withMonth(vehR.rows),
    driverChecks: withMonth(dchkR.rows),
    driverViolations: withMonth(dvR.rows),
    driverThreeViolations: withMonth(dtvR.rows),
    risks: riskR.rows,
    hazards: withMonth(hazR.rows),
    transferChecks: withMonth(tsR.rows),
  };
}

/** 组织级匹配器：某行是否归因到目标 org（与 fillSummaries 归因口径一一对应） */
function buildOrgMatcher(orgId, townIndex, employees, nameIndex) {
  const byAttr = (row, idKey, textKey) => {
    const a = attributeRecord({ employeeId: toNumber(row[idKey]), text: row[textKey] }, townIndex, employees);
    return a && a.orgId === orgId;
  };
  const byUniqueName = name => {
    const id = nameIndex.get(cleanPersonName(name));
    if (id == null) return false;
    const a = attributeRecord({ employeeId: id, text: null }, townIndex, employees);
    return a && a.orgId === orgId;
  };
  return {
    accidents: r => byAttr(r, 'personnel_id', 'township'),
    violations: r => byAttr(r, 'violator_id', 'area_team'),
    inspections: r => byAttr(r, 'inspector_employee_id', 'area_team'),
    assessments: r => byAttr(r, 'employee_id', 'township'),
    trainings: r => byAttr(r, 'employee_id', null),
    emergencies: r => { const a = attributeRecord({ employeeId: null, text: r.township || r.name }, townIndex, employees); return a && a.orgId === orgId; },
    demerits: r => byAttr(r, 'employee_id', null),
    vehicleChecks: r => byAttr(r, 'employee_id', null),
    driverChecks: r => byAttr(r, 'employee_id', null),
    driverViolations: r => byUniqueName(r.name),
    driverThreeViolations: r => byUniqueName(r.name),
    risks: r => byAttr(r, 'responsible_person_id', 'area'),
    hazards: r => { const a = attributeRecord({ employeeId: null, text: r.description }, townIndex, employees); return a && a.orgId === orgId; },
    transferChecks: r => { const a = attributeRecord({ employeeId: null, text: r.area_team }, townIndex, employees); return a && a.orgId === orgId; },
  };
}

/** 个人级匹配器：某行是否属于该员工（ID 反推 + 全局唯一姓名兜底） */
function buildPersonalMatcher(employee, nameIndex) {
  const empId = employee.employeeId;
  const idOrName = (rowId, rowName) => {
    if (rowId != null && toNumber(rowId) === empId) return true;
    const cn = cleanPersonName(rowName);
    return Boolean(cn) && nameIndex.get(cn) === empId;
  };
  return {
    accidents: r => r.personnel_id != null && toNumber(r.personnel_id) === empId,
    violations: r => idOrName(r.violator_id, r.violator_name),
    inspections: r => idOrName(r.inspector_employee_id, r.personnel_name),
    assessments: r => r.employee_id != null && toNumber(r.employee_id) === empId,
    trainings: r => (r.employee_id != null && toNumber(r.employee_id) === empId) || (r.personnel_id != null && toNumber(r.personnel_id) === empId),
    emergencies: () => false, // 演练表无人员关联字段，个人口径恒 0（如实呈现）
    demerits: r => idOrName(r.employee_id, r.employee_name),
    vehicleChecks: r => r.employee_id != null && toNumber(r.employee_id) === empId,
    driverChecks: r => r.employee_id != null && toNumber(r.employee_id) === empId,
    driverViolations: r => idOrName(null, r.name),
    driverThreeViolations: r => idOrName(null, r.name),
    risks: r => idOrName(r.responsible_person_id, r.responsible_person),
    hazards: r => (r.finder_id != null && toNumber(r.finder_id) === empId) || (r.responsible_id != null && toNumber(r.responsible_id) === empId),
    transferChecks: r => idOrName(null, r.patrol_person),
  };
}

/** 按匹配器汇总累计 10 维（个人口径用；驾驶人员数为时点台账按岗位判定） */
function summarizeWithMatcher(all, matcher, driverPersonCount) {
  const s = emptySummary();
  const assessScores = [];
  const trainPersons = new Set();
  const bump = fn => fn(s);
  for (const r of all.accidents) if (matcher.accidents(r)) {
    bump(x => {
      x.accidents.count += 1;
      if (r.level === '重大' || r.level === '特别重大') x.accidents.major += 1;
      x.accidents.weightedIndex += ACCIDENT_WEIGHT[r.level] || 1;
    });
  }
  for (const r of all.violations) if (matcher.violations(r)) {
    bump(x => {
      x.violations.count += 1;
      if (r.violation_level === '严重') x.violations.serious += 1;
    });
  }
  for (const r of all.inspections) if (matcher.inspections(r)) bump(x => { x.inspections.count += 1; });
  for (const r of all.assessments) if (matcher.assessments(r)) {
    bump(x => {
      x.assessments.targetCount += 1;
      if (r.grade === '优秀' || r.grade === '良好') x.assessments.gradeGood += 1;
    });
    assessScores.push(toFloat(r.score_total));
  }
  for (const r of all.trainings) if (matcher.trainings(r)) {
    bump(x => { x.trainings.recordCount += 1; });
    trainPersons.add(toNumber(r.employee_id) || toNumber(r.personnel_id));
  }
  for (const r of all.emergencies) if (matcher.emergencies(r)) {
    bump(x => {
      x.emergencies.count += 1;
      if (r.result === 'pass' || r.result === 'excellent') x.emergencies.passed += 1;
    });
  }
  for (const r of all.demerits) if (matcher.demerits(r)) bump(x => { x.drivers.demeritCount += 1; });
  for (const r of all.vehicleChecks) if (matcher.vehicleChecks(r)) bump(x => { x.drivers.vehicleCheckCount += 1; });
  for (const r of all.driverChecks) if (matcher.driverChecks(r)) bump(x => { x.drivers.driverCheckCount += 1; });
  for (const r of all.driverViolations) if (matcher.driverViolations(r)) bump(x => { x.drivers.violationCount += 1; });
  for (const r of all.driverThreeViolations) if (matcher.driverThreeViolations(r)) bump(x => { x.drivers.violationCount += 1; });
  for (const r of all.risks) if (matcher.risks(r)) bump(x => { x.risks.count += 1; });
  for (const r of all.hazards) if (matcher.hazards(r)) bump(x => { x.hazards.count += 1; });
  for (const r of all.transferChecks) if (matcher.transferChecks(r)) bump(x => { x.transferStations.checkCount += 1; });
  s.drivers.personCount = driverPersonCount;
  s.trainings.personCount = trainPersons.size;
  s.assessments.avgScore = assessScores.length > 0 ? Math.round((assessScores.reduce((a, b) => a + b, 0) / assessScores.length) * 100) / 100 : 0;
  return s;
}

/** 按匹配器聚合逐月单元格；capMonth=YYYY-MM（累计模式=当前月，按年模式=年末） */
function collectMonthlyWithMatcher(all, matcher, capMonth) {
  const cells = new Map();
  const trainPersons = new Map();
  const assessScores = new Map();
  const get = m => {
    if (!cells.has(m)) cells.set(m, emptyMonthCell());
    return cells.get(m);
  };
  const bump = (m, fn) => fn(get(m));
  const guard = (r, fn) => {
    if (r._m == null) return;
    const m = r._m;
    if (capMonth && m > capMonth) return;
    fn(m);
  };
  for (const r of all.accidents) guard(r, m => { if (matcher.accidents(r)) bump(m, x => {
    x.accidents.count += 1;
    if (r.level === '重大' || r.level === '特别重大') x.accidents.major += 1;
    x.accidents.weightedIndex += ACCIDENT_WEIGHT[r.level] || 1;
  }); });
  for (const r of all.violations) guard(r, m => { if (matcher.violations(r)) bump(m, x => {
    x.violations.count += 1;
    if (r.violation_level === '严重') x.violations.serious += 1;
  }); });
  for (const r of all.inspections) guard(r, m => { if (matcher.inspections(r)) bump(m, x => { x.inspections.count += 1; }); });
  for (const r of all.assessments) guard(r, m => {
    if (matcher.assessments(r)) {
      bump(m, x => {
        x.assessments.targetCount += 1;
        if (r.grade === '优秀' || r.grade === '良好') x.assessments.gradeGood += 1;
      });
      assessScores.set(m, (assessScores.get(m) || 0) + toFloat(r.score_total));
    }
  });
  for (const r of all.trainings) guard(r, m => {
    if (matcher.trainings(r)) {
      bump(m, x => { x.trainings.recordCount += 1; });
      if (!trainPersons.has(m)) trainPersons.set(m, new Set());
      trainPersons.get(m).add(toNumber(r.employee_id) || toNumber(r.personnel_id));
    }
  });
  for (const r of all.emergencies) guard(r, m => { if (matcher.emergencies(r)) bump(m, x => {
    x.emergencies.count += 1;
    if (r.result === 'pass' || r.result === 'excellent') x.emergencies.passed += 1;
  }); });
  for (const r of all.demerits) guard(r, m => { if (matcher.demerits(r)) bump(m, x => { x.drivers.demeritCount += 1; }); });
  for (const r of all.vehicleChecks) guard(r, m => { if (matcher.vehicleChecks(r)) bump(m, x => { x.drivers.vehicleCheckCount += 1; }); });
  for (const r of all.driverChecks) guard(r, m => { if (matcher.driverChecks(r)) bump(m, x => { x.drivers.driverCheckCount += 1; }); });
  for (const r of all.driverViolations) guard(r, m => { if (matcher.driverViolations(r)) bump(m, x => { x.drivers.violationCount += 1; }); });
  for (const r of all.driverThreeViolations) guard(r, m => { if (matcher.driverThreeViolations(r)) bump(m, x => { x.drivers.violationCount += 1; }); });
  for (const r of all.hazards) guard(r, m => { if (matcher.hazards(r)) bump(m, x => { x.hazards.count += 1; }); });
  for (const r of all.transferChecks) guard(r, m => { if (matcher.transferChecks(r)) bump(m, x => { x.transferStations.checkCount += 1; }); });

  const months = Array.from(cells.keys()).sort();
  for (const m of months) {
    const c = cells.get(m);
    const n = c.assessments.targetCount;
    c.assessments.avgScore = n > 0 ? Math.round(((assessScores.get(m) || 0) / n) * 100) / 100 : 0;
    c.trainings.personCount = trainPersons.get(m) ? trainPersons.get(m).size : 0;
  }
  return { months, cells };
}

/** 月度矩阵输出（维度 → 按月数组）；风险静态台账恒 null */
function monthlyRows(cells, months) {
  const pick = (dim, key) => months.map(m => cells.get(m)[dim][key]);
  return {
    accidents: { count: pick('accidents', 'count'), major: pick('accidents', 'major'), weightedIndex: pick('accidents', 'weightedIndex') },
    drivers: { demeritCount: pick('drivers', 'demeritCount'), vehicleCheckCount: pick('drivers', 'vehicleCheckCount'), driverCheckCount: pick('drivers', 'driverCheckCount'), violationCount: pick('drivers', 'violationCount') },
    hazards: { count: pick('hazards', 'count') },
    transferStations: { checkCount: pick('transferStations', 'checkCount') },
    violations: { count: pick('violations', 'count'), serious: pick('violations', 'serious') },
    inspections: { count: pick('inspections', 'count') },
    trainings: { recordCount: pick('trainings', 'recordCount'), personCount: pick('trainings', 'personCount') },
    emergencies: { count: pick('emergencies', 'count'), passed: pick('emergencies', 'passed') },
    assessments: { targetCount: pick('assessments', 'targetCount'), gradeGood: pick('assessments', 'gradeGood'), avgScore: pick('assessments', 'avgScore') },
    risks: null,
  };
}

/** 单位汇总骨架（辖区复用 fillSummaries 口径） */
function singleUnit(town, scope, employees, townIndex) {
  const unitMap = new Map([[town.id, {
    id: town.id,
    orgName: town.orgName,
    shortName: town.short,
    orgType: town.orgType,
    summary: emptySummary(),
  }]]);
  return fillSummaries({ unitMap, employees, townIndex, scope });
}

// ===== 5.1 GET /centers/:centerId/towns/:townId/trend =====
async function townTrend(rawReq) {
  const centerId = toNumber(rawReq.params.centerId);
  const townId = toNumber(rawReq.params.townId);
  const scope = buildRange(rawReq.query.year);
  const { centers, townIndex } = await loadOrg();
  const employees = await loadEmployees();
  const center = centers.find(c => c.id === centerId);
  if (!center) return { __t: 'json', body: { code: 1, message: '作业中心不存在' } };
  const town = townIndex.find(t => t.id === townId);
  if (!town) return { __t: 'json', body: { code: 1, message: '乡镇/公园不存在' } };
  const parent = centers.find(c => c.towns.some(t => t.id === townId));
  if (!parent || parent.id !== centerId) return { __t: 'json', body: { code: 1, message: '乡镇不属于该作业中心' } };

  const unitMap = await singleUnit(town, scope, employees, townIndex);
  const all = await loadAllDimensionRows(scope);
  const nameIndex = buildUniqueNameIndex(employees);
  const matcher = buildOrgMatcher(townId, townIndex, employees, nameIndex);
  const capMonth = scope ? `${scope.year}-12` : currentMonthKey();
  const { months, cells } = collectMonthlyWithMatcher(all, matcher, capMonth);

  return {
    __t: 'json',
    body: {
      code: 0,
      data: {
        center: { id: center.id, orgName: center.orgName, orgType: center.orgType },
        org: { id: town.id, orgName: town.orgName, shortName: town.short, orgType: town.orgType },
        scope: { cumulative: !scope, year: scope ? scope.year : null },
        months,
        summary: unitMap.get(townId).summary,
        rows: monthlyRows(cells, months),
      },
    },
  };
}

// ===== 5.2 GET /towns/:id/managers =====
async function townManagers(rawReq) {
  const townId = toNumber(rawReq.params.id);
  const { townIndex } = await loadOrg();
  const employees = await loadEmployees();
  const town = townIndex.find(t => t.id === townId);
  if (!town) return { __t: 'json', body: { code: 1, message: '乡镇/公园不存在' } };
  const isPark = town.orgType === 'park';
  const managers = Array.from(employees.values())
    .filter(e => e.orgId === townId
      && (isPark ? String(e.positionName || '').includes('管理员') : String(e.positionName || '').includes('乡镇作业中心经理')))
    .map(e => ({ employeeId: e.employeeId, employeeCode: e.employeeCode, name: e.name, positionName: e.positionName }));
  return {
    __t: 'json',
    body: {
      code: 0,
      data: {
        org: { id: town.id, orgName: town.orgName, shortName: town.short, orgType: town.orgType },
        roleLabel: isPark ? '管理员' : '乡镇作业中心经理',
        managers,
      },
    },
  };
}

// ===== 5.3 GET /managers/:employeeId/overview =====
async function managerOverview(rawReq) {
  const employeeId = toNumber(rawReq.params.employeeId);
  const townId = rawReq.query.townId != null && rawReq.query.townId !== '' ? toNumber(rawReq.query.townId) : null;
  const scope = buildRange(rawReq.query.year);
  const { townIndex } = await loadOrg();
  const employees = await loadEmployees();
  const emp = employees.get(employeeId);
  if (!emp) return { __t: 'json', body: { code: 1, message: '员工不存在或未在岗' } };
  if (emp.orgType !== 'town_center' && emp.orgType !== 'park') {
    return { __t: 'json', body: { code: 1, message: '非乡镇经理/公园管理员，不支持双口径' } };
  }
  const orgId = townId || emp.orgId;
  const town = townIndex.find(t => t.id === orgId);
  if (!town) return { __t: 'json', body: { code: 1, message: '辖区不存在' } };
  if (townId && emp.orgId !== orgId) return { __t: 'json', body: { code: 1, message: '员工与辖区不匹配' } };

  const unitMap = await singleUnit(town, scope, employees, townIndex);
  const all = await loadAllDimensionRows(scope);
  const nameIndex = buildUniqueNameIndex(employees);
  const personal = summarizeWithMatcher(all, buildPersonalMatcher(emp, nameIndex), /驾驶|司机/.test(String(emp.positionName || '')) ? 1 : 0);

  return {
    __t: 'json',
    body: {
      code: 0,
      data: {
        employee: {
          employeeId: emp.employeeId,
          employeeCode: emp.employeeCode,
          name: emp.name,
          positionName: emp.positionName,
          orgName: emp.orgName,
          orgType: emp.orgType,
        },
        org: { id: town.id, orgName: town.orgName, shortName: town.short, orgType: town.orgType },
        scope: { cumulative: !scope, year: scope ? scope.year : null },
        jurisdiction: unitMap.get(orgId).summary,
        personal,
      },
    },
  };
}

// ===== 5.4 GET /managers/:employeeId/month-detail =====
async function managerMonthDetail(rawReq) {
  const employeeId = toNumber(rawReq.params.employeeId);
  const townId = rawReq.query.townId != null && rawReq.query.townId !== '' ? toNumber(rawReq.query.townId) : null;
  const month = String(rawReq.query.month || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { __t: 'json', body: { code: 1, message: '月份格式须为 YYYY-MM' } };
  const capMonth = currentMonthKey();
  if (month > capMonth) return { __t: 'json', body: { code: 1, message: '月份超出当前时间' } };

  const { townIndex } = await loadOrg();
  const employees = await loadEmployees();
  const emp = employees.get(employeeId);
  if (!emp) return { __t: 'json', body: { code: 1, message: '员工不存在或未在岗' } };
  if (emp.orgType !== 'town_center' && emp.orgType !== 'park') {
    return { __t: 'json', body: { code: 1, message: '非乡镇经理/公园管理员，不支持双口径' } };
  }
  const orgId = townId || emp.orgId;
  const town = townIndex.find(t => t.id === orgId);
  if (!town) return { __t: 'json', body: { code: 1, message: '辖区不存在' } };
  if (townId && emp.orgId !== orgId) return { __t: 'json', body: { code: 1, message: '员工与辖区不匹配' } };

  // 单月明细按该年加载后按月收窄，避免全历史扫描
  const scope = buildRange(month.slice(0, 4));
  const all = await loadAllDimensionRows(scope);
  const nameIndex = buildUniqueNameIndex(employees);
  const jurisdiction = collectMonthlyWithMatcher(all, buildOrgMatcher(orgId, townIndex, employees, nameIndex), month).cells.get(month) || emptyMonthCell();
  const personal = collectMonthlyWithMatcher(all, buildPersonalMatcher(emp, nameIndex), month).cells.get(month) || emptyMonthCell();

  return {
    __t: 'json',
    body: {
      code: 0,
      data: {
        employee: {
          employeeId: emp.employeeId,
          employeeCode: emp.employeeCode,
          name: emp.name,
          positionName: emp.positionName,
          orgName: emp.orgName,
          orgType: emp.orgType,
        },
        org: { id: town.id, orgName: town.orgName, shortName: town.short, orgType: town.orgType },
        month,
        jurisdiction,
        personal,
      },
    },
  };
}

// ===== 6. GET /dim-records（维度明细下钻，2026-09-28 新增） =====
// 通用下钻：前端点击任意维度数字 → 按 组织（辖区）/ 个人（本人归因）口径返回该维度明细记录。
// 复用 loadAllDimensionRows + buildOrgMatcher / buildPersonalMatcher，口径与汇总层完全一致。
const MAX_DIM_RECORDS = 1000;

/** 维度 → 明细列定义（前端据此动态建列，无需重复维护列映射）
 *  subs：子指标级过滤（2026-09-28 增强）——趋势表子指标行点击下钻时按 sub 二次过滤；
 *  sources 限定来源（drivers 组合维度），filter 为行级谓词（对齐汇总口径）；缺省 sub=维度整体（count 类）。
 */
const DIM_RECORD_SPEC = {
  accidents: {
    title: '事故',
    sources: ['accidents'],
    dateKeys: ['accident_date'],
    sortKey: 'accident_date',
    fields: [
      { k: 'no', label: '事故编号', w: 120 },
      { k: 'description', label: '标题' },
      { k: 'level', label: '等级', w: 80 },
      { k: 'accident_date', label: '日期', w: 110 },
      { k: 'township', label: '乡镇', w: 110 },
    ],
    subs: {
      major: { label: '重大事故', filter: r => r.level === '重大' || r.level === '特别重大' },
    },
  },
  violations: {
    title: '三违',
    sources: ['violations'],
    dateKeys: ['violation_date'],
    sortKey: 'violation_date',
    fields: [
      { k: 'violation_date', label: '日期', w: 110 },
      { k: 'violation_type', label: '类型', w: 110 },
      { k: 'violation_level', label: '等级', w: 80 },
      { k: 'violator_name', label: '违章人', w: 90 },
    ],
    subs: {
      serious: { label: '严重三违', filter: r => r.violation_level === '严重' },
    },
  },
  inspections: {
    title: '网格长巡查',
    sources: ['inspections'],
    dateKeys: ['inspection_date'],
    sortKey: 'inspection_date',
    fields: [
      { k: 'inspection_date', label: '日期', w: 110 },
      { k: 'area_team', label: '片区/班组' },
      { k: 'grid_level', label: '网格等级', w: 90 },
      { k: 'personnel_name', label: '巡查人', w: 90 },
    ],
  },
  assessments: {
    title: '月度考核',
    sources: ['assessments'],
    dateKeys: [],
    sortKey: '_m',
    derive: { _month: '_m' },
    fields: [
      { k: '_month', label: '月份', w: 90 },
      { k: 'employee_name', label: '姓名', w: 90 },
      { k: 'score_total', label: '得分', w: 80 },
      { k: 'grade', label: '等级', w: 80 },
      { k: 'rank_township', label: '乡镇排名', w: 100 },
      { k: 'cycle_name', label: '考核周期' },
    ],
    subs: {
      gradeGood: { label: '考核优良', filter: r => r.grade === '优秀' || r.grade === '良好' },
    },
  },
  trainings: {
    title: '培训',
    sources: ['trainings'],
    dateKeys: ['training_date'],
    sortKey: 'training_date',
    fields: [
      { k: 'training_date', label: '日期', w: 110 },
      { k: 'training_type', label: '培训类型' },
      { k: 'result', label: '结果', w: 80 },
      { k: 'employee_name', label: '参训人', w: 90 },
      { k: 'trainer', label: '培训人', w: 90 },
    ],
  },
  emergencies: {
    title: '应急演练',
    sources: ['emergencies'],
    dateKeys: ['drill_date'],
    sortKey: 'drill_date',
    fields: [
      { k: 'drill_date', label: '日期', w: 110 },
      { k: 'name', label: '演练名称' },
      { k: 'township', label: '乡镇', w: 110 },
      { k: 'result', label: '结果', w: 80 },
    ],
    subs: {
      passed: { label: '演练通过', filter: r => r.result === 'pass' || r.result === 'excellent' },
    },
  },
  drivers: {
    title: '驾驶员',
    sources: ['demerits', 'vehicleChecks', 'driverChecks', 'driverViolations', 'driverThreeViolations'],
    typeKey: '_type',
    typeMap: {
      demerits: '驾驶证记分',
      vehicleChecks: '车辆检查',
      driverChecks: '驾驶员检查',
      driverViolations: '驾驶员违章',
      driverThreeViolations: '驾驶员三违',
    },
    dateKeys: ['_d'],
    sortKey: '_d',
    derive: { _person: null, _reason: null }, // 占位：映射阶段按 employee_name || name / violation_desc || violation_type 生成
    fields: [
      { k: '_type', label: '类型', w: 110 },
      { k: '_reason', label: '违章事由', w: 200 },
      { k: '_d', label: '日期', w: 110 },
      { k: '_person', label: '人员', w: 90 },
    ],
    subs: {
      demeritCount: { label: '驾驶证记分', sources: ['demerits'] },
      vehicleCheckCount: { label: '车辆检查', sources: ['vehicleChecks'] },
      driverCheckCount: { label: '驾驶员检查', sources: ['driverChecks'] },
      violationCount: { label: '驾驶员违章', sources: ['driverViolations', 'driverThreeViolations'] },
    },
  },
  risks: {
    title: '风险台账',
    sources: ['risks'],
    dateKeys: [],
    sortKey: null,
    fields: [
      { k: 'name', label: '风险名称' },
      { k: 'area', label: '区域' },
      { k: 'responsible_person', label: '责任人', w: 90 },
    ],
  },
  hazards: {
    title: '隐患',
    sources: ['hazards'],
    dateKeys: ['hazard_date'],
    sortKey: 'hazard_date',
    fields: [
      { k: 'hazard_date', label: '日期', w: 110 },
      { k: 'description', label: '描述' },
    ],
  },
  transferStations: {
    title: '转运站检查',
    sources: ['transferChecks'],
    dateKeys: ['check_date'],
    sortKey: 'check_date',
    fields: [
      { k: 'check_date', label: '日期', w: 110 },
      { k: 'area_team', label: '片区', w: 110 },
      { k: 'patrol_person', label: '巡查人', w: 90 },
    ],
  },
};

async function dimRecords(rawReq) {
  const scope = String(rawReq.query.scope || '');
  const orgId = rawReq.query.orgId != null && rawReq.query.orgId !== '' ? toNumber(rawReq.query.orgId) : null;
  const employeeId = rawReq.query.employeeId != null && rawReq.query.employeeId !== '' ? toNumber(rawReq.query.employeeId) : null;
  const dim = String(rawReq.query.dim || '');
  const month = String(rawReq.query.month || '').trim();
  const sub = String(rawReq.query.sub || '').trim();
  if (scope !== 'org' && scope !== 'personal') {
    return { __t: 'json', body: { code: 1, message: 'scope 须为 org / personal' } };
  }
  const spec = DIM_RECORD_SPEC[dim];
  if (!spec) return { __t: 'json', body: { code: 1, message: `不支持的维度: ${dim}` } };
  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return { __t: 'json', body: { code: 1, message: '月份格式须为 YYYY-MM' } };
  }
  const subDef = sub ? (spec.subs || {})[sub] : null;
  if (sub && !subDef) return { __t: 'json', body: { code: 1, message: `不支持的子指标: ${sub}` } };

  const { townIndex } = await loadOrg();
  const employees = await loadEmployees();
  const nameIndex = buildUniqueNameIndex(employees);

  let matcher;
  let scopeLabel;
  if (scope === 'org') {
    if (orgId == null) return { __t: 'json', body: { code: 1, message: 'org 口径须传 orgId' } };
    const town = townIndex.find(t => t.id === orgId);
    if (!town) return { __t: 'json', body: { code: 1, message: '组织不存在' } };
    matcher = buildOrgMatcher(orgId, townIndex, employees, nameIndex);
    scopeLabel = town.orgName;
  } else {
    if (employeeId == null) return { __t: 'json', body: { code: 1, message: 'personal 口径须传 employeeId' } };
    const emp = employees.get(employeeId);
    if (!emp) return { __t: 'json', body: { code: 1, message: '员工不存在或未在岗' } };
    matcher = buildPersonalMatcher(emp, nameIndex);
    scopeLabel = emp.name;
  }

  const range = month ? buildRange(month.slice(0, 4)) : buildRange(rawReq.query.year);
  const all = await loadAllDimensionRows(range);

  const sources = subDef && subDef.sources ? subDef.sources : spec.sources;
  const picked = [];
  for (const src of sources) {
    const rows = all[src] || [];
    const match = matcher[src];
    if (!match) continue;
    for (const r of rows) {
      if (!match(r)) continue;
      if (month && r._m !== month) continue;
      if (subDef && subDef.filter && !subDef.filter(r)) continue;
      const rec = { ...r };
      if (spec.typeKey && spec.typeMap) rec[spec.typeKey] = spec.typeMap[src];
      // 日期字段还原：聚合查询以 _d 别名返回日期（2026-09-28 展示字段扩展），
      // 下钻明细需还原为 spec.dateKeys 原字段供表格列消费；drivers 本就以 _d 为列键跳过。
      if (rec._d != null && spec.dateKeys[0] && spec.dateKeys[0] !== '_d') {
        rec[spec.dateKeys[0]] = rec._d;
      }
      if (spec.derive) {
        for (const [to, from] of Object.entries(spec.derive)) {
          if (from === null) {
            if (to === '_person') rec._person = rec.employee_name || rec.name || '';
            if (to === '_reason') rec._reason = rec.violation_desc || rec.violation_type || '';
          } else if (rec[from] != null) {
            rec[to] = rec[from];
          }
        }
      }
      picked.push(rec);
    }
  }
  for (const rec of picked) {
    for (const k of spec.dateKeys) if (rec[k] != null) rec[k] = fmtDate(rec[k]);
    if ('score_total' in rec) rec.score_total = toFloat(rec.score_total);
  }
  if (spec.sortKey) {
    picked.sort((a, b) => String(b[spec.sortKey] || '').localeCompare(String(a[spec.sortKey] || '')));
  }
  // 数据时间跨度（2026-09-29 新增）：累计口径下明细含历史记录，头部展示 from~to 避免误读为数据错误
  const dateKey = spec.dateKeys[0] || (spec.sortKey === '_m' ? '_m' : null);
  let dateSpan = null;
  if (dateKey) {
    const vals = picked.map(r => r[dateKey]).filter(v => v != null && v !== '');
    if (vals.length) {
      const sorted = vals.map(v => String(v).slice(0, 10)).sort();
      dateSpan = { from: sorted[0], to: sorted[sorted.length - 1] };
    }
  }
  const truncated = picked.length > MAX_DIM_RECORDS;
  const records = truncated ? picked.slice(0, MAX_DIM_RECORDS) : picked;

  return {
    __t: 'json',
    body: {
      code: 0,
      data: {
        dim,
        title: spec.title,
        scope,
        scopeLabel,
        year: range ? range.year : null,
        month: month || null,
        sub: sub || null,
        subLabel: subDef ? subDef.label : null,
        dateSpan,
        count: picked.length,
        truncated,
        fields: spec.fields,
        records,
      },
    },
  };
}

module.exports = {
  townshipShortName,
  cleanText,
  cleanPersonName,
  matchTownship,
  getYearRange,
  buildRange,
  identifyRole,
  attributeRecord,
  fmtDate,
  monthKey,
  currentMonthKey,
  emptySummary,
  emptyMonthCell,
  loadOrg,
  loadEmployees,
  loadAllDimensionRows,
  summarizeWithMatcher,
  collectMonthlyWithMatcher,
  monthlyRows,
  fillSummaries,
  centers,
  townsByCenter,
  rolesByTown,
  employeeDetail,
  townTrend,
  townManagers,
  managerOverview,
  managerMonthDetail,
  dimRecords,
};
