/**
 * HSE 员工档案中心 API（基于 v_employee_current 视图）
 * 从 hse-employee.js 拆分迁移 —— 保持对外路由契约逐字节不变
 * 由父路由 router.use('/', this) 挂载，最终契约 /api/hse/employee/employees/profile(...) / roster-version(...)
 */
const express = require('express');
const router = express.Router();

const { pool, isConnected } = require('../../config/db');
const { success, error } = require('../../middleware/response');
const { camelKeys } = require('../../utils/commonResponse');
const { decryptMiddleware, decryptFields } = require('../../middleware/encryption');

/**
 * GET /employees/profile/list
 * 员工档案列表（分页 + 搜索 + 筛选）
 */
router.get('/employees/profile/list', decryptMiddleware('id_card', 'phone'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(success(camelKeys({ list: [], total: 0, page: 1, pageSize: 20 }), '数据库未连接'));

    const { page = 1, pageSize = 20, keyword, org_unit_id, position_id, is_driver, status } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
    const offset = (pageNum - 1) * limitNum;

    // 列表 SQL 直接返回 snake_case 字段名（与前端 dataIndex 完全一致），不再经过 camelKeys 转换。
    // 此前后端对结果执行 camelKeys() → 键变为 camelCase，而前端 dataIndex 全为 snake_case，
    // 导致键不匹配、列表所有字段显示为空。
    // v_employee_current 视图现已提供 org_code/operation_unit_id/unit_name/unit_type/position_code
    // 等全部所需字段（此前误置 NULL，现改为 ev.xxx 取真实值）。
    // 入职日期取 start_date（视图无 hire_date 列）；is_driver 由 position_name 派生
    // （本库 employee_assignment.remark 与视图 remark 均为 NULL，无法用 remark 判定，
    //  保留岗位名启发式，与下方 is_driver 筛选条件一致，实测识别 43 名驾驶员）。
    const conditions = ['e.is_deleted = false'];
    const params = [];
    let paramIdx = 1;

    if (keyword) {
      conditions.push(`(ev.name ILIKE $${paramIdx} OR ev.employee_code ILIKE $${paramIdx})`);
      params.push(`%${keyword}%`);
      paramIdx++;
    }
    if (org_unit_id) {
      conditions.push(`ea.org_unit_id = $${paramIdx}`);
      params.push(parseInt(org_unit_id));
      paramIdx++;
    }
    if (position_id) {
      conditions.push(`ea.position_id = $${paramIdx}`);
      params.push(parseInt(position_id));
      paramIdx++;
    }
    if (is_driver === 'true') {
      conditions.push(`(ev.position_name ILIKE '%驾驶员%' OR ev.position_name ILIKE '%司机%')`);
      // 以花名册为准：排除已离职（用工关系=辞职/死亡）的驾驶员。
      // 兼容历史遗留/人工写错导致的「幽灵在职记录」（当前行 employment_relation 为 NULL，
      // 如王春堂 id=9727、张海涛 id=8043）：其真实用工状态在另一条有 employment_relation 的行上，
      // 故按 id_card_hash > 工号 > 姓名 匹配该员工有用工状态的花名册行为权威值，命中辞职/死亡则判定离职。
      conditions.push(`
        COALESCE(
          (SELECT x.employment_relation FROM employee x
             WHERE x.is_deleted = false AND x.employment_relation IS NOT NULL
               AND x.id_card_hash IS NOT NULL AND e.id_card_hash IS NOT NULL
               AND x.id_card_hash = e.id_card_hash ORDER BY x.id LIMIT 1),
          (SELECT x.employment_relation FROM employee x
             WHERE x.is_deleted = false AND x.employment_relation IS NOT NULL
               AND x.employee_code IS NOT NULL AND e.employee_code IS NOT NULL
               AND x.employee_code = e.employee_code ORDER BY x.id LIMIT 1),
          (SELECT x.employment_relation FROM employee x
             WHERE x.is_deleted = false AND x.employment_relation IS NOT NULL
               AND x.name IS NOT NULL AND x.name = e.name ORDER BY x.id LIMIT 1),
          e.employment_relation
        ) NOT IN ('辞职', '死亡')
      `);
    } else if (is_driver === 'false') {
      // 筛选"否"：显式排除驾驶员；position_name 为 NULL 的视为非驾驶员（NULL NOT ILIKE 在 SQL 中结果为 NULL，需显式包含）
      conditions.push(`(ev.position_name IS NULL OR (ev.position_name NOT ILIKE '%驾驶员%' AND ev.position_name NOT ILIKE '%司机%'))`);
    }
    if (status) {
      conditions.push(`ev.assignment_status = $${paramIdx}`);
      params.push(status);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM v_employee_current ev
       JOIN employee e ON e.id = ev.employee_id AND e.is_deleted = false
       LEFT JOIN employee_assignment ea ON ea.employee_id = ev.employee_id AND ea.is_current = true AND ea.is_deleted = false AND ea.is_primary = true
       WHERE ${whereClause}`,
      params
    );
    const total = countResult.rows[0].total;

    params.push(limitNum, offset);
    const result = await pool.query(
      `SELECT ev.employee_id AS id, ev.employee_code, ev.name,
              e.gender,
              CASE WHEN e.birth_date IS NOT NULL THEN EXTRACT(YEAR FROM AGE(e.birth_date))::int END AS age,
              ea.org_unit_id,
              ev.org_name, ev.org_type,
              ev.org_code,
              ev.operation_unit_id,
              ev.unit_name,
              ev.unit_type,
              COALESCE(ea.dept_name, ev.org_name) AS dept_name,
              ea.position_id,
              ev.position_name,
              ev.position_code,
              CASE WHEN e.employment_relation IN ('辞职','死亡') THEN 'left' ELSE ev.assignment_status END AS status,
              COALESCE(ea.start_date, ev.start_date) AS hire_date,
              e.leave_date,
              e.roster_department,
              e.roster_position,
              e.roster_work_area,
              e.phone, e.id_card,
              (ev.position_name ILIKE '%驾驶员%' OR ev.position_name ILIKE '%司机%') AS is_driver
       FROM v_employee_current ev
       JOIN employee e ON e.id = ev.employee_id AND e.is_deleted = false
       LEFT JOIN employee_assignment ea ON ea.employee_id = ev.employee_id AND ea.is_current = true AND ea.is_deleted = false AND ea.is_primary = true
       WHERE ${whereClause}
       ORDER BY ea.start_date DESC NULLS LAST
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      params
    );

    res.json(success({ list: result.rows, total, page: pageNum, pageSize: limitNum }, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

/**
 * GET /employees/profile/roster-version
 * 花名册驾驶员名单版本号（仅用于前端本地缓存比对：是否需重新加载花名册名单）。
 * 口径：与 /employees/profile/list?is_driver=true 的驾驶员筛选一致的 VERSION Condition——
 *   合并「姓名 + 用工关系 + 离职日期 + 更新时间  + 主岗部门」生成哈希。
 *   一旦花名册导入增删改驾驶员、或调整用工/离岗状态，updated_at/字段变化 → 版本号变化，
 *   前端据此判断本地缓存的花名册名单已过期，需按「以花名册导入为节点」重新加载。
 */
router.get('/employees/profile/roster-version', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    // scope=driver（默认）：驾驶员工种名单；scope=all：全部在职员工名单
    const scope = req.query.scope === 'all' ? 'all' : 'driver';
    const positionCond =
      scope === 'driver'
        ? ` AND (ev.position_name ILIKE '%驾驶员%' OR ev.position_name ILIKE '%司机%')`
        : '';
    const r = await pool.query(
      `SELECT ev.name, e.employment_relation, e.leave_date, e.updated_at, COALESCE(ea.dept_name, ev.org_name) AS dept
       FROM v_employee_current ev
       JOIN employee e ON e.id = ev.employee_id AND e.is_deleted = false
       LEFT JOIN employee_assignment ea ON ea.employee_id = ev.employee_id
         AND ea.is_current = true AND ea.is_deleted = false AND ea.is_primary = true
       WHERE e.is_deleted = false${positionCond}
       ORDER BY ev.name, e.id`,
    );
    const crypto = require('crypto');
    const payload = r.rows
      .map((x) => [x.name, x.employment_relation ?? '', x.leave_date ?? '', x.updated_at ?? '', x.dept ?? ''].join('|'))
      .join(';');
    const version = crypto.createHash('md5').update(payload).digest('hex');
    const latest = r.rows.reduce((m, x) => (x.updated_at && x.updated_at > m ? x.updated_at : m), '');
    res.json(success({ version, count: r.rows.length, updatedAt: latest || null }, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});
router.get('/employees/profile/:id', decryptMiddleware('id_card', 'phone'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const { id } = req.params;

    const empResult = await pool.query(
      `SELECT e.id, e.employee_code, e.name, e.gender, e.birth_date, e.phone, e.id_card,
              e.person_type, e.person_category, e.is_public_welfare,
              CASE WHEN e.employment_relation IN ('辞职','死亡') THEN 'left'
                   WHEN e.is_deleted THEN 'inactive' ELSE 'active' END AS status,
              e.roster_department, e.roster_position, e.roster_work_area, e.leave_date,
              CASE WHEN e.birth_date IS NOT NULL THEN EXTRACT(YEAR FROM age(e.birth_date))::INT ELSE NULL END AS age,
              e.created_at, e.updated_at
       FROM employee e WHERE e.id = $1 AND e.is_deleted = false`,
      [parseInt(id)]
    );
    if (empResult.rows.length === 0) return res.json(error(-2, '员工不存在'));

    const emp = empResult.rows[0];

    // 手动解密敏感字段：decryptMiddleware 只处理 data.data 顶层，而详情结构是
    // { data: { basic: { id_card, phone }, currentOrg } }，id_card/phone 位于 basic 内，
    // 中间件无法命中 → 此处对扁平的 emp 行直接解密（emp 顶层即含 id_card/phone）。
    const decryptedEmp = decryptFields(emp, ['id_card', 'phone']);

    const currentResult = await pool.query(
      `SELECT ea.org_unit_id, ou.org_name, ou.org_type, ou.org_code, ou.org_path,
              ea.operation_unit_id, opu.unit_name, opu.unit_type, opu.unit_code,
              ea.dept_name,
              ea.position_id, p.name AS position_name, p.position_code, p.risk_level,
              ea.supervisor_id, sup.name AS supervisor_name,
              ea.status AS assignment_status, ea.start_date, ea.end_date
       FROM employee_assignment ea
       LEFT JOIN hse_org_unit ou ON ou.id = ea.org_unit_id AND ou.is_deleted = false
       LEFT JOIN hse_operation_unit opu ON opu.id = ea.operation_unit_id AND opu.is_deleted = false
       LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
       LEFT JOIN employee sup ON sup.id = ea.supervisor_id AND sup.is_deleted = false
       WHERE ea.employee_id = $1 AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false`,
      [parseInt(id)]
    );

    // 详情接口直接返回 snake_case（与列表页 /employees/profile/list 策略一致）：
    // SQL 列名本就是 snake_case（employee_code/org_name/start_date/is_public_welfare…），
    // employee-profile/index.vue 的 Drawer 与 employee-profile.ts 类型均按 snake_case 读取，
    // 套 camelKeys() 会转成 camelCase 导致键名不匹配、Drawer 整列空。
    res.json(success({
      basic: decryptedEmp,
      currentOrg: currentResult.rows.length > 0 ? currentResult.rows[0] : null,
    }, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

/**
 * GET /employees/profile/:id/assignments
 * 员工任职历史列表
 */
router.get('/employees/profile/:id/assignments', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const { id } = req.params;

    const result = await pool.query(
      `SELECT ea.id, ea.org_unit_id, ea.operation_unit_id, ea.position_id,
              ea.is_primary, ea.is_current, ea.status, ea.start_date, ea.end_date, ea.remark,
              ea.dept_name,
              ou.org_name, ou.org_code,
              opu.unit_name, opu.unit_type,
              p.name AS position_name, p.position_code,
              sup.name AS supervisor_name
       FROM employee_assignment ea
       LEFT JOIN hse_org_unit ou ON ou.id = ea.org_unit_id AND ou.is_deleted = false
       LEFT JOIN hse_operation_unit opu ON opu.id = ea.operation_unit_id AND opu.is_deleted = false
       LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
       LEFT JOIN employee sup ON sup.id = ea.supervisor_id AND sup.is_deleted = false
       WHERE ea.employee_id = $1 AND ea.is_deleted = false
       ORDER BY ea.start_date DESC`,
      [parseInt(id)]
    );

    // 保持 snake_case 返回（与 /employees/profile/list、/employees/profile/:id 一致），
    // 前端 employee-profile/index.vue 的任职历史表与 AssignmentItem 均按 snake_case 读取。
    res.json(success(result.rows, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

/**
 * GET /employees/profile/:id/driver-info
 * 员工驾驶员信息（从 employee_assignment.remark 解析）
 */
router.get('/employees/profile/:id/driver-info', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const { id } = req.params;

    const result = await pool.query(
      `SELECT ea.remark
       FROM employee_assignment ea
       WHERE ea.employee_id = $1 AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false`,
      [parseInt(id)]
    );

    let driverInfo = { is_driver: false, license_type: null };
    if (result.rows.length > 0 && result.rows[0].remark) {
      const remark = result.rows[0].remark;
      driverInfo.is_driver = remark.includes('is_driver=true');
      const licenseMatch = remark.match(/license_type=([^;]+)/);
      if (licenseMatch) driverInfo.license_type = licenseMatch[1];
    }

    res.json(success(camelKeys(driverInfo), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

module.exports = router;
