const { pool } = require('../config/db');
const { cleanVName, NAME_ALIAS } = require('./companyViolationDeduct');

/**
 * 解析一批违章人原始姓名 → 其员工主数据归属（与「公司查处扣分」同源口径）：
 *   - dept      = 员工花名册「所属部门」(roster_department)，或人工审核映射表(hse_violator_name_resolution)
 *                 指向员工的部门；查不到为 ''
 *   - supervisor= 员工直接上级 (employee.direct_supervisor)，同源；查不到为 ''
 * 归并顺序：去括号/空白(cleanVName) → NAME_ALIAS 笔误归并 → 员工表按名匹配 → 人工审核映射。
 * @param {string[]} rawNames 违章人原始姓名数组
 * @returns {Promise<Map<string, {dept: string, supervisor: string}>>} key = alias 后的规范化姓名
 */
async function resolveViolatorAttribs(rawNames) {
  const cleaned = [];
  for (const n of rawNames || []) {
    const c = cleanVName(n);
    if (c) cleaned.push(c);
  }
  const result = new Map(); // alias -> {dept, supervisor}
  if (!cleaned.length) return result;

  const aliasMap = new Map();
  const namesToLookup = [];
  for (const c of [...new Set(cleaned)]) {
    const alias = NAME_ALIAS[c] || c;
    aliasMap.set(c, alias);
    namesToLookup.push(alias);
  }

  // 1) 员工表按名直接命中 → dept/supervisor
  const deptByName = new Map();
  const supByName = new Map();
  if (namesToLookup.length) {
    const em = await pool.query(
      `SELECT name, roster_department, direct_supervisor
         FROM employee WHERE name = ANY($1) AND is_deleted = FALSE`,
      [namesToLookup],
    );
    for (const r of em.rows || []) {
      deptByName.set(r.name, String(r.roster_department || '').trim());
      const s = String(r.direct_supervisor || '').trim();
      if (s) supByName.set(r.name, s);
    }
  }

  // 2) 员工表未直接命中 → 人工审核映射表 (source_name → employee_id → dept/supervisor)
  let resByName = new Map();
  let resAttrib = new Map(); // employeeId -> {dept, supervisor}
  try {
    const rs = await pool.query(
      `SELECT source_name, employee_id
         FROM hse_violator_name_resolution WHERE employee_id IS NOT NULL`,
    );
    const resIds = new Set();
    for (const r of rs.rows || []) {
      if (!resByName.has(r.source_name)) {
        resByName.set(r.source_name, String(r.employee_id));
        resIds.add(String(r.employee_id));
      }
    }
    if (resIds.size) {
      const em2 = await pool.query(
        `SELECT id, roster_department, direct_supervisor
           FROM employee WHERE id = ANY($1) AND is_deleted = FALSE`,
        [[...resIds]],
      );
      for (const r of em2.rows || []) {
        resAttrib.set(String(r.id), {
          dept: String(r.roster_department || '').trim(),
          supervisor: String(r.direct_supervisor || '').trim(),
        });
      }
    }
  } catch {
    resByName = new Map();
    resAttrib = new Map();
  }

  for (const c of [...new Set(cleaned)]) {
    const alias = aliasMap.get(c);
    let dept = deptByName.get(alias) || '';
    let supervisor = supByName.get(alias) || '';
    if (!dept) {
      const eid = resByName.get(alias) || resByName.get(c);
      if (eid && resAttrib.has(eid)) {
        dept = resAttrib.get(eid).dept || '';
        supervisor = resAttrib.get(eid).supervisor || '';
      }
    }
    result.set(alias, { dept, supervisor });
  }
  return result;
}

module.exports = { resolveViolatorAttribs, cleanVName, NAME_ALIAS };