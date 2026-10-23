/**
 * 公司管理（总网格长 + 一级网格长）查处三违扣分 · 共享口径
 *
 * 权威来源：hse-sanwei-analysis.js /list 内联逻辑（2026-09-21 冻结）。
 * 抽离为共享服务，供「三违分析」与「三违管理考核」共用，保证两处「公司查处扣分」
 * 的数值与乡镇归属完全一致：只统计公司管理网格长查处的真三违记录；
 * 每起扣分 = 违章行为含「头盔/安全帽」→5分，其他 →1分；按违章人花名册「所属部门」
 * 是否含某乡镇名归属到乡镇（最长匹配）。
 */
const { pool } = require('../config/db');

// 公司管理网格长（总+一级，2026-09-21 花名册为唯一权威）：黄殿兴(总)/刘金涛/张康/刘菲/韩晓亮/黄元同(一级)
const COMPANY_GRID_LEADERS = ['黄殿兴', '刘金涛', '张康', '刘菲', '韩晓亮', '黄元同'];
const HELMET_RE = /头盔|安全帽/;
// 冻结笔误归并（2026-09-21 冻结：8月/9月公司管理三违统计口径）
const NAME_ALIAS = {
  '姚奎岭': '姚奎领', '李建方': '李建芳', '李凤丽': '李风丽', '范志新': '范治新', // 8月
  '李兰凤': '李兰风', '杜瑞兰': '杜润兰', // 9月
};
// 去括号备注/空白 + 归一化空白，用于违章人名清洗
const cleanVName = (n) =>
  String(n || '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/\s+/g, '')
    .trim();

/**
 * 计算公司查处扣分（按「月份|乡镇」聚合）。
 * @param {object} opts
 * @param {string[]} [opts.months]  可选：仅统计这些月份（YYYY-MM）；缺省统计全部月份。
 * @param {string[]}  opts.candidateTowns  乡镇候选名（归属判定：部门含某乡镇名则计入该乡镇）。
 *                                          须用与分析页一致的 town 集合（如 hse_sanwei_score_monthly.town），
 *                                          否则会引入分析页不统计的乡镇（如「环卫」）导致数值偏离。
 * @returns {Promise<{map: Map<string,{score:number,helmetCount:number,otherCount:number,details:object[]}> , unresolved: object[]}>}
 *            map key 为 `${month}|${town}`；unresolved 为「待人工审核」违章人清单（冻结归并/花名册/人工映射均未命中的）。
 */
async function buildCompanyDeduct({ months, candidateTowns = [] }) {
  const map = new Map(); // key: `${month}|${town}` -> { score, helmetCount, otherCount, details }
  let unresolved = [];

  const conds = [
    "inspection_date IS NOT NULL",
    "personnel_name = ANY($1)",
    "violation_behavior IS NOT NULL AND TRIM(violation_behavior) <> ''",
    "TRIM(violation_behavior) NOT IN ('无三违行为','--','-','无')",
  ];
  const params = [COMPANY_GRID_LEADERS];
  if (Array.isArray(months) && months.length) {
    params.push(months);
    conds.push(`to_char(inspection_date, 'YYYY-MM') = ANY($${params.length})`);
  }

  try {
    const cd = await pool.query(
      `SELECT id, to_char(inspection_date, 'YYYY-MM-DD') AS d, to_char(inspection_date, 'YYYY-MM') AS m,
              violator_name, violation_behavior
         FROM grid_inspection_records
        WHERE ${conds.join(' AND ')}`,
      params,
    );

    // 人工审核映射表（落库持久化）：source_name->员工。employee_id 为 NULL 表示「确无此人/不计入」的抑制项。
    const resolutionByName = new Map(); // source_name -> { employee_id, employee_name }
    const resEmployeeDept = new Map(); // "employeeId" -> roster_department
    const resSupervisorById = new Map(); // "employeeId" -> direct_supervisor
    const suppressedSet = new Set(); // 已审核但判定「不计入/确无此人」的 source_name
    const pendingMap = new Map(); // key: `${month}|${source_name}` -> count
    const rs = await pool.query(
      `SELECT source_name, employee_id, employee_name FROM hse_violator_name_resolution`,
    );
    const resIds = [];
    for (const r of rs.rows || []) {
      if (r.employee_id == null) {
        suppressedSet.add(r.source_name);
        continue;
      }
      resolutionByName.set(r.source_name, { employee_id: r.employee_id, employee_name: r.employee_name });
      resIds.push(r.employee_id);
    }
    if (resIds.length) {
      const em2 = await pool.query(
        `SELECT id, name, roster_department, direct_supervisor FROM employee WHERE id = ANY($1) AND is_deleted = FALSE`,
        [resIds],
      );
      for (const row of em2.rows || []) {
        resEmployeeDept.set(String(row.id), String(row.roster_department || '').trim());
        const s = String(row.direct_supervisor || '').trim();
        if (s) resSupervisorById.set(String(row.id), s);
      }
    }

    // 违章人姓名 → 花名册「所属部门」(roster_department)
    const violNames = [...new Set((cd.rows || []).map((x) => cleanVName(x.violator_name)).filter(Boolean))];
    // 查询名单须含笔误归并后的目标名，否则别名目标查不到部门
    const lookupNames = [...new Set([...violNames, ...violNames.map((n) => NAME_ALIAS[n]).filter(Boolean)])];
    const deptByName = new Map();
    const supervisorByName = new Map();
    if (lookupNames.length) {
      const em = await pool.query(
        `SELECT name, roster_department, direct_supervisor FROM employee WHERE name = ANY($1) AND is_deleted = FALSE`,
        [lookupNames],
      );
      for (const row of em.rows || []) {
        deptByName.set(row.name, String(row.roster_department || '').trim());
        const s = String(row.direct_supervisor || '').trim();
        if (s) supervisorByName.set(row.name, s);
      }
    }

    const townSet = [...new Set(candidateTowns || [])].filter(Boolean);
    const records = []; // 每起已乡镇归属的公司查处违章：含 director_supervisor，供「三违管理考核」管理员 tab 按直接上级归属
    for (const row of cd.rows || []) {
      const raw = cleanVName(row.violator_name);
      const name = NAME_ALIAS[raw] || raw;
      let dept = name ? deptByName.get(name) : '';
      let supervisor = name ? supervisorByName.get(name) || '' : '';
      // 花名册未直接命中 → 查人工审核映射
      if (!dept && name) {
        const res = resolutionByName.get(name) || resolutionByName.get(raw);
        if (res && res.employee_id != null) {
          dept = resEmployeeDept.get(String(res.employee_id)) || '';
          supervisor = resSupervisorById.get(String(res.employee_id)) || '';
        }
      }
      if (!name) continue;
      if (!dept) {
        // 已人工审核判定「确无此人/不计入」→ 不计数也不进待审核
        if (suppressedSet.has(name) || suppressedSet.has(raw)) continue;
        // 待审核：冻结归并/花名册/人工映射均未命中
        const pk = `${row.m}|${name}`;
        pendingMap.set(pk, (pendingMap.get(pk) || 0) + 1);
        continue;
      }
      // 部门含某乡镇名（如「大柳镇四班」「大柳镇乡镇作业中心」→「大柳镇」），最长匹配
      let town = null;
      let maxLen = 0;
      for (const t of townSet) {
        if (dept.includes(t) && t.length > maxLen) {
          town = t;
          maxLen = t.length;
        }
      }
      if (!town) continue;
      const key = `${row.m}|${town}`;
      const acc = map.get(key) || { score: 0, helmetCount: 0, otherCount: 0, details: [] };
      let point = 1;
      if (HELMET_RE.test(String(row.violation_behavior || ''))) {
        point = 5;
        acc.helmetCount += 1;
      } else {
        acc.otherCount += 1;
      }
      acc.score += point;
      acc.details.push({
        date: String(row.d || row.m || ''),
        violatorName: name, // 清洗后（含笔误归并/去备注）
        behavior: String(row.violation_behavior || ''),
        score: point,
        /** 网格长巡查台账原始记录 id（供点击跳转定位），月份 = date 前 7 位 */
        recordId: row.id != null ? String(row.id) : undefined,
      });
      map.set(key, acc);
      records.push({
        month: String(row.m || ''),
        town,
        violatorName: name,
        date: String(row.d || row.m || ''),
        behavior: String(row.violation_behavior || ''),
        score: point,
        helmet: Boolean(HELMET_RE.test(String(row.violation_behavior || ''))),
        recordId: row.id != null ? String(row.id) : undefined,
        supervisor,
      });
    }

    // 待审核清单（供前端人工审核入口）
    unresolved = [...pendingMap.entries()]
      .map(([k, c]) => {
        const sep = k.indexOf('|');
        return { month: k.slice(0, sep), sourceName: k.slice(sep + 1), count: c };
      })
      .sort((a, b) => (a.month === b.month ? a.sourceName.localeCompare(b.sourceName) : b.month.localeCompare(a.month)));

    return { map, unresolved, records };
  } catch (e) {
    // 与旧逻辑一致：员工表/台账/映射表缺失时统一返回空（公司查处扣分按 0 处理）
    console.error('[companyViolationDeduct]', e.message);
    return { map: new Map(), unresolved: [], records: [] };
  }
}

module.exports = { buildCompanyDeduct, COMPANY_GRID_LEADERS, HELMET_RE, NAME_ALIAS, cleanVName };