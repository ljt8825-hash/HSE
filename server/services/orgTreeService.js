/**
 * HSE 员工域 · 组织树管理服务（department 表，五级树形：集团/区域/企业/项目/班组）
 * 从 hse-employee/org-tree.js route 内联 handler 迁移 —— 行为逐字节不变
 * 仅承载业务规则 + SQL；无 express 依赖，可独立单测
 */

const { pool } = require('../config/db');
const { buildDeptPath } = require('../routes/hse-employee/_shared');

// GET /departments/tree — 重组部门树（阶段1：hse_org_unit 骨架 + department 班组叶子）
// 提示词-124：以 hse_org_unit 为骨架，department 班组级节点（按乡镇名前缀）挂载为乡镇叶子，
// 一次性解决同名冗余、空列表、编制人数三大问题。前端 departments.vue 依赖 snake_case 字段。
async function getOrgTree(includeInactive) {
  const teamCondition = includeInactive
    ? 'd.is_deleted = false'
    : "d.is_deleted = false AND d.status = 'active'";

  // 第 1 步：hse_org_unit 全量节点（骨架）
  const ouRes = await pool.query(
    `SELECT id, parent_id, org_name, org_type, org_code, org_path, level,
            sort_order, headcount, status, description, manager_id
     FROM hse_org_unit WHERE is_deleted = false ORDER BY level, sort_order, id`
  );
  const ouRows = ouRes.rows;

  // 第 2 步：department 班组级节点（车队 / 片区 / X班）。正则命中"X班"结尾、"车队"、"片区"。
  const teamRes = await pool.query(
    `SELECT d.id, d.dept_code, d.name, d.short_name, d.parent_id, d.level, d.path, d.township,
            d.manager_id, d.safety_manager_id, d.headcount, d.sort_order, d.status, d.description,
            d.org_unit_id
     FROM department d
     WHERE ${teamCondition}
       AND d.name ~ '(\u4e00|\u4e8c|\u4e09|\u56db|\u4e94|\u516d|\u4e03|\u516b|\u4e5d|\u5341)\u73ed$|^\u8f66\u961f$|^\u7247\u533a$|.*\u7247\u533a$'
     ORDER BY d.sort_order ASC, d.id ASC`
  );
  const teamRows = teamRes.rows;

  // 第 3 步：员工数（精确，按 org_unit_id）+ 负责人姓名（从 employee_assignment.supervisor_id 关联）
  const ouIds = ouRows.map(r => r.id);
  const countMap = {};
  const supMap = {};
  const mgrMap = {};
  if (ouIds.length > 0) {
    const cRes = await pool.query(
      `SELECT ea.org_unit_id, COUNT(DISTINCT ea.employee_id)::int AS count
       FROM employee_assignment ea
       JOIN employee e ON e.id = ea.employee_id AND e.is_deleted = false
       WHERE ea.org_unit_id = ANY($1)
         AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false
         AND e.employment_relation = '正式员工'
       GROUP BY ea.org_unit_id`,
      [ouIds]
    );
    cRes.rows.forEach(r => { countMap[r.org_unit_id] = r.count; });

    // 负责人姓名：部门“直接上级”= 该部门内职位最高者（负责人）在花名册中的“直接上级”
    const sRes = await pool.query(
      `SELECT top.org_unit_id, e.direct_supervisor AS supervisor_name
       FROM (
         SELECT DISTINCT ON (ea.org_unit_id)
           ea.org_unit_id, ea.employee_id
         FROM employee_assignment ea
         JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
         WHERE ea.org_unit_id = ANY($1)
           AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false
         ORDER BY ea.org_unit_id,
           CASE WHEN p.name LIKE '%总经理%' THEN 0
                WHEN p.name LIKE '%作业中心经理%' OR p.name LIKE '%片区经理%' THEN 1
                WHEN p.name LIKE '%经理%' THEN 2
                WHEN p.name LIKE '%管理员%' THEN 3
                WHEN p.name LIKE '%站长%' THEN 4
                WHEN p.name LIKE '%班长%' OR p.name LIKE '%网格长%' THEN 5
                ELSE 9 END ASC,
           ea.employee_id ASC
       ) top
       JOIN employee e ON e.id = top.employee_id AND e.is_deleted = false`,
      [ouIds]
    );
    sRes.rows.forEach(r => { supMap[r.org_unit_id] = r.supervisor_name || null; });

    // 部门负责人：取该组织单元「职位最高者」（负责人）的员工 id 与姓名
    const mgrRes = await pool.query(
      `SELECT DISTINCT ON (ea.org_unit_id)
         ea.org_unit_id, ea.employee_id AS mgr_id, e.name AS mgr_name
       FROM employee_assignment ea
       JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
       JOIN employee e ON e.id = ea.employee_id AND e.is_deleted = false
       WHERE ea.org_unit_id = ANY($1)
         AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false
       ORDER BY ea.org_unit_id,
         CASE WHEN p.name LIKE '%总经理%' THEN 0
              WHEN p.name LIKE '%作业中心经理%' OR p.name LIKE '%片区经理%' THEN 1
              WHEN p.name LIKE '%经理%' THEN 2
              WHEN p.name LIKE '%管理员%' THEN 3
              WHEN p.name LIKE '%站长%' THEN 4
              WHEN p.name LIKE '%班长%' OR p.name LIKE '%网格长%' THEN 5
              ELSE 9 END ASC,
         ea.employee_id ASC`,
      [ouIds]
    );
    mgrRes.rows.forEach(r => { mgrMap[r.org_unit_id] = { id: r.mgr_id, name: r.mgr_name }; });
  }

  // 构建 hse_org_unit 节点：id 用合成 "ou_<id>"；乡镇节点显示名剥离"作业中心"后缀
  const ouNodeMap = new Map();
  ouRows.forEach(r => {
    const isTown = r.org_type === 'town_center';
    const displayName = isTown ? r.org_name.replace(/作业中心$/, '') : r.org_name;
    ouNodeMap.set(r.id, {
      id: 'ou_' + r.id,
      name: displayName,
      dept_code: r.org_code,
      org_type: r.org_type,
      level: r.level,
      status: r.status || 'active',
      headcount: r.headcount,
      employee_count: countMap[r.id] || 0,
      actual_headcount: countMap[r.id] || 0,
      manager_id: (mgrMap[r.id] && mgrMap[r.id].id) ?? r.manager_id,
      manager_name: (mgrMap[r.id] && mgrMap[r.id].name) ?? null,
      safety_manager_id: null,
      supervisor_name: supMap[r.id] || null,
      short_name: null,
      township: isTown ? displayName : null,
      parent_id: r.parent_id != null ? 'ou_' + r.parent_id : null,
      sort_order: r.sort_order,
      description: r.description,
      path: r.org_path,
      org_unit_id: r.id,
      children: [],
      employee_count_approximate: false,
    });
  });

  // 构建 department 班组节点：用真实 department.id 作 id
  const teamNames = teamRows.map(r => r.name);
  const teamCntMap = {};
  const teamMgrMap = {};
  if (teamNames.length > 0) {
    const tRes = await pool.query(
      `SELECT ea.dept_name, COUNT(DISTINCT ea.employee_id)::int AS count
       FROM employee_assignment ea
       JOIN employee e ON e.id = ea.employee_id AND e.is_deleted = false
       WHERE ea.dept_name = ANY($1)
         AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false
         AND e.employment_relation = '正式员工'
       GROUP BY ea.dept_name`,
      [teamNames]
    );
    tRes.rows.forEach(r => { teamCntMap[r.dept_name] = r.count; });

    const tmRes = await pool.query(
      `SELECT DISTINCT ON (ea.dept_name)
         ea.dept_name, ea.employee_id AS mgr_id, e.name AS mgr_name
       FROM employee_assignment ea
       JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
       JOIN employee e ON e.id = ea.employee_id AND e.is_deleted = false
       WHERE ea.dept_name = ANY($1)
         AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false
         AND e.employment_relation = '正式员工'
       ORDER BY ea.dept_name,
         CASE WHEN p.name LIKE '%经理%' THEN 0
              WHEN p.name LIKE '%管理员%' THEN 1
              WHEN p.name LIKE '%站长%' THEN 2
              WHEN p.name LIKE '%班长%' OR p.name LIKE '%网格长%' THEN 3
              ELSE 9 END ASC,
         ea.employee_id ASC`,
      [teamNames]
    );
    tmRes.rows.forEach(r => { teamMgrMap[r.dept_name] = { id: r.mgr_id, name: r.mgr_name }; });
  }
  const teamNodeMap = new Map();
  teamRows.forEach(r => {
    const cnt = teamCntMap[r.name] || 0;
    const m = teamMgrMap[r.name];
    teamNodeMap.set(r.id, {
      id: r.id,
      name: r.name,
      dept_code: r.dept_code,
      org_type: 'team',
      level: r.level,
      status: r.status || 'active',
      headcount: r.headcount,
      employee_count: cnt,
      actual_headcount: cnt,
      manager_id: (m && m.id) ?? r.manager_id,
      manager_name: (m && m.name) ?? null,
      safety_manager_id: r.safety_manager_id,
      supervisor_name: null,
      short_name: r.short_name,
      township: r.township,
      parent_id: r.parent_id,
      sort_order: r.sort_order,
      description: r.description,
      path: r.path,
      org_unit_id: r.org_unit_id,
      children: [],
      employee_count_approximate: false,
    });
  });

  // 班组按"乡镇名前缀"挂载到 hse_org_unit 乡镇节点
  const townNodes = ouRows.filter(r => r.org_type === 'town_center');
  const townShortOf = {};
  townNodes.forEach(r => { townShortOf[r.id] = r.org_name.replace(/作业中心$/, ''); });
  teamRows.forEach(t => {
    let hitOuId = null;
    let hitLen = 0;
    for (const r of townNodes) {
      const ts = townShortOf[r.id];
      if (t.name.startsWith(ts) && ts.length > hitLen) {
        hitOuId = r.id;
        hitLen = ts.length;
      }
    }
    if (hitOuId != null) {
      ouNodeMap.get(hitOuId).children.push(teamNodeMap.get(t.id));
    } else {
      // 无法匹配乡镇的班组（如车队）挂到根公司节点，避免丢失
      ouNodeMap.get(ouRows[0].id).children.push(teamNodeMap.get(t.id));
    }
  });

  // 串联 hse_org_unit 主干（company → 职能/作业中心 → 乡镇）
  ouRows.forEach(r => {
    if (r.parent_id != null && ouNodeMap.has(r.parent_id)) {
      ouNodeMap.get(r.parent_id).children.push(ouNodeMap.get(r.id));
    }
  });

  // 班组人数：父乡镇精确人数 / 班组数（近似）
  ouNodeMap.forEach((node, ouId) => {
    if (node.org_type === 'town_center' && node.children.length > 0) {
      const townCount = countMap[ouId] || 0;
      const n = node.children.length;
      node.children.forEach(child => {
        child.employee_count = Math.round(townCount / n);
        child.actual_headcount = child.employee_count;
        child.employee_count_approximate = true;
      });
    }
  });

  // 汇总：作业中心 = 下属乡镇+车队之和；公司 = 直属职能部门之和（不含乡镇/作业中心）
  ouNodeMap.forEach(node => {
    if (node.org_type === 'center') {
      const s = node.children.reduce((a, c) => a + (c.employee_count || 0), 0);
      node.employee_count = s;
      node.actual_headcount = s;
    }
  });
  ouNodeMap.forEach(node => {
    if (node.org_type === 'company') {
      const s = node.children
        .filter(c => c.org_type === 'department')
        .reduce((a, c) => a + (c.employee_count || 0), 0);
      node.employee_count = s;
      node.actual_headcount = s;
    }
  });

  // 根为 company 节点（parent_id = null）；返回 snake_case 以与 departments.vue 一致
  const root = ouNodeMap.get(ouRows[0].id);
  return root ? [root] : [];
}

// GET /departments — 部门扁平列表
async function listDepartments() {
  const result = await pool.query(
    `SELECT id, dept_code, name, short_name, parent_id, level, path, township,
            manager_id, safety_manager_id, headcount, sort_order, status, description,
            org_unit_id
     FROM department WHERE is_deleted = false ORDER BY level ASC, sort_order ASC`
  );
  return result.rows;
}

// GET /departments/:id/employees — 查询部门下的员工列表
async function listDepartmentEmployees({ rawId, query }) {
  const { page = 1, pageSize = 20 } = query;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
  const offset = (pageNum - 1) * limitNum;

  const conditions = [
    'e.is_deleted = false',
    "e.employment_relation = '正式员工'",
    'ea.is_current = true',
    'ea.is_deleted = false',
    'ea.is_primary = true',
    'ou.is_deleted = false',
  ];
  const params = [];
  let paramIdx = 1;

  let orgUnitIds = [];

  const ouIdsParam = String(query.ouIds || '').trim();
  const deptNameParam = String(query.deptName || '').trim();
  const scopeByDeptName = !!deptNameParam;

  if (deptNameParam) {
    conditions.push(`ea.dept_name = $${paramIdx}`);
    params.push(deptNameParam);
    paramIdx++;
  } else if (ouIdsParam) {
    const ids = ouIdsParam.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
    if (ids.length === 0) return { error: -2, message: '无效的组织ID' };
    orgUnitIds = ids;
    conditions.push(`ou.id = ANY($${paramIdx})`);
    params.push(orgUnitIds);
    paramIdx++;
  } else {
    // 提示词-125 C-1：处理 ou_X 合成 ID（来自 hse_org_unit 合并树节点）
    if (typeof rawId === 'string' && rawId.startsWith('ou_')) {
      const orgUnitId = parseInt(rawId.slice(3), 10);
      if (isNaN(orgUnitId)) return { error: -2, message: '无效的组织ID' };
      orgUnitIds = [orgUnitId];
    } else {
      const deptId = parseInt(rawId);
      if (isNaN(deptId)) return { error: -2, message: '部门不存在' };

      // 提示词-108 T1：修复跨 ID 空间比较 bug（department.id 与 hse_org_unit.id 不同空间）
      const deptRow = await pool.query(
        `SELECT name, org_unit_id FROM department WHERE id = $1 AND is_deleted = false`, [deptId]
      );
      if (deptRow.rows.length === 0) return { error: -2, message: '部门不存在' };

      // 提示词-112 T2.2：优先使用 ID 映射（方案A核心）
      if (deptRow.rows[0].org_unit_id) {
        orgUnitIds = [deptRow.rows[0].org_unit_id];
      } else {
        // 提示词-125 C-2：降级分支增加班组名称前缀提取（乡镇/片区/车队）
        const deptName = deptRow.rows[0].name;
        let matchName = deptName;
        const teamPattern = /^(.+?)(一|二|三|四|五|六|七|八|九|十)班$/;
        const areaPattern = /^(.+?)片区$/;
        if (teamPattern.test(deptName)) {
          matchName = deptName.match(teamPattern)[1];
        } else if (areaPattern.test(deptName)) {
          matchName = deptName.match(areaPattern)[1];
        } else if (deptName === '车队') {
          matchName = deptName;
        }
        const ouRows = await pool.query(
          `SELECT id, (org_name = $1) AS exact_hit FROM hse_org_unit
            WHERE is_deleted = false AND (org_name = $1 OR org_name LIKE $1 || '%')`,
          [matchName]
        );
        const exactIds = ouRows.rows.filter((r) => r.exact_hit).map((r) => r.id);
        orgUnitIds = exactIds.length > 0 ? exactIds : ouRows.rows.map((r) => r.id);
      }
    }
  }

  // 班组级部门在 hse_org_unit 中无对应节点，返回空列表而非报错
  if (!scopeByDeptName && orgUnitIds.length === 0) {
    return { empty: true, total: 0, rows: [], pageNum, limitNum };
  }

  if (orgUnitIds.length > 0) {
    conditions.push(`ou.id = ANY($${paramIdx})`);
    params.push(orgUnitIds);
    paramIdx++;
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM employee e
     JOIN employee_assignment ea ON ea.employee_id = e.id
     JOIN hse_org_unit ou ON ea.org_unit_id = ou.id
     WHERE ${whereClause}`,
    params
  );
  const total = countResult.rows[0].total;

  params.push(limitNum, offset);
  const result = await pool.query(
    `SELECT e.id, e.employee_code, e.id_card, e.name, e.gender, e.birth_date, e.phone,
            CASE WHEN e.birth_date IS NOT NULL THEN EXTRACT(YEAR FROM age(e.birth_date))::INT ELSE NULL END AS age,
            ou.org_path, ea.position_id, ea.start_date,
            p.name AS position_name
     FROM employee e
     JOIN employee_assignment ea ON ea.employee_id = e.id
     JOIN hse_org_unit ou ON ea.org_unit_id = ou.id
     LEFT JOIN position p ON ea.position_id = p.id AND p.is_deleted = false
     WHERE ${whereClause}
     ORDER BY e.created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    params
  );

  // 部门详情的员工子列表：前端 employeeColumns 用 snake_case
  return { total, rows: result.rows, pageNum, limitNum };
}

// POST /departments — 新增部门（返回 {row, error}）
async function createDepartment(body, userId) {
  const { dept_code, name, short_name, parent_id, level, township, manager_id, safety_manager_id, headcount, sort_order, description } = body;
  if (!dept_code) return { error: -3, message: '部门编码不能为空' };
  if (!name) return { error: -3, message: '部门名称不能为空' };

  // 提示词-116 P0-1：层级必须在 1-6 之间（与数据库 CHECK 约束一致）
  if (level !== undefined && (level < 1 || level > 6)) {
    return { error: -3, message: '层级必须在 1-6 之间' };
  }

  // 检查编码唯一性
  const existCode = await pool.query(`SELECT id FROM department WHERE dept_code = $1 AND is_deleted = false`, [dept_code]);
  if (existCode.rows.length > 0) return { error: -4, message: '部门编码已存在' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 构建 path
    const parentPath = await buildDeptPath(client, parent_id);
    const path = `${parentPath}${parent_id || ''}/`;

    const result = await client.query(
      `INSERT INTO department (dept_code, name, short_name, parent_id, level, path, township, manager_id, safety_manager_id, headcount, sort_order, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [dept_code, name, short_name || null, parent_id || null, level || null, path,
       township || null, manager_id || null, safety_manager_id || null, headcount || 0, sort_order || 0, description || null]
    );

    // 提示词-112 T3.1：新建部门时自动检测 org_unit_id 映射
    const ouMatch = await client.query(
      `SELECT id FROM hse_org_unit WHERE is_deleted = false AND (org_name = $1 OR org_name LIKE $1 || '%') LIMIT 1`,
      [name]
    );
    if (ouMatch.rows.length > 0) {
      await client.query(
        `UPDATE department SET org_unit_id = $1 WHERE id = $2`,
        [ouMatch.rows[0].id, result.rows[0].id]
      );
      result.rows[0].org_unit_id = ouMatch.rows[0].id;
    }

    await client.query('COMMIT');
    return { row: result.rows[0], audit: { name, dept_code } };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// PUT /departments/:id — 更新部门（返回 {row, error}）
async function updateDepartment(id, body) {
  const updates = body;
  const fields = [];
  const values = [];
  let paramIdx = 1;

  const allowedFields = ['dept_code', 'name', 'short_name', 'parent_id', 'level', 'township', 'manager_id', 'safety_manager_id', 'headcount', 'sort_order', 'status', 'description'];
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      fields.push(`${field} = $${paramIdx++}`);
      values.push(updates[field]);
    }
  }
  if (fields.length === 0) return { error: -3, message: '没有要更新的字段' };

  // 提示词-116 P0-1：层级必须在 1-6 之间（与数据库 CHECK 约束一致）
  if (updates.level !== undefined && (updates.level < 1 || updates.level > 6)) {
    return { error: -3, message: '层级必须在 1-6 之间' };
  }

  // 提示词-112 T3.2：部门改名时自动更新 org_unit_id 映射
  if (updates.name !== undefined) {
    const ouMatch = await pool.query(
      `SELECT id FROM hse_org_unit WHERE is_deleted = false AND (org_name = $1 OR org_name LIKE $1 || '%') LIMIT 1`,
      [updates.name]
    );
    fields.push(`org_unit_id = $${paramIdx++}`);
    values.push(ouMatch.rows.length > 0 ? ouMatch.rows[0].id : null);
  }

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await pool.query(
    `UPDATE department SET ${fields.join(', ')} WHERE id = $${paramIdx} AND is_deleted = false RETURNING *`,
    values
  );
  if (result.rows.length === 0) return { error: -2, message: '部门不存在或已删除' };
  return { row: result.rows[0], audit: { id, name: updates.name || '' } };
}

// DELETE /departments/:id — 删除部门（软删除，先查子部门）
async function deleteDepartment(id) {
  // 检查是否有子部门
  const childResult = await pool.query(`SELECT id FROM department WHERE parent_id = $1 AND is_deleted = false`, [id]);
  if (childResult.rows.length > 0) return { error: -5, message: '存在子部门，无法删除' };

  const result = await pool.query(
    `UPDATE department SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING name`,
    [id]
  );
  if (result.rows.length === 0) return { error: -2, message: '部门不存在或已删除' };
  return { audit: { id, name: result.rows[0].name } };
}

module.exports = {
  getOrgTree,
  listDepartments,
  listDepartmentEmployees,
  createDepartment,
  updateDepartment,
  deleteDepartment,
};
