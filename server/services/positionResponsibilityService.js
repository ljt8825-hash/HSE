/**
 * 岗位体系 + 责任体系（/api/hse/position-resp）—— service 层
 * 原 routes/hse-position-responsibility.js 的业务逻辑全部下沉至此：
 *   - 标准岗位 CRUD（position）
 *   - 岗位别名 CRUD（hse_position_alias）
 *   - 责任配置 CRUD（hse_responsibility_config，含固定配置不可改责任类型约束）
 *   - 责任记录 CRUD（hse_responsibility）
 *   - 枚举接口（责任类型 / 网格层级 / 岗位类别）
 * 权限：admin / safety_manager 可写；其他角色只读（鉴权在路由层绑定）。
 *
 * 契约：每个对外函数返回统一描述符
 *   - 成功 JSON：{ __t:'json', payload, message }（等价原 res.json(success(...))）
 *   - 业务错误：{ __t:'json', error:{code,message} }（等价原 res.json(error(...))）
 *     code 语义沿用原值：业务分支多为 404（记录不存在）或默认 -1；catch 一律 -1。
 *
 * 异常约定：本域各端点 catch 的 message 前缀各不相同（「获取岗位列表失败:」「创建岗位
 * 失败:」…），且逐一 console.error 原日志。故每个对外函数在 service 层内保留原
 * try/catch 并返回带各自前缀的错误描述符；controller 的 run() 仅作兜底（实际不触发）。
 * 枚举端点（types/grid-levels/job-categories）为纯静态返回，无 try/catch、不触库。
 */
const { pool } = require('../config/db');

// ============================================================
// 统一描述符
// ============================================================
const ok = (payload, message) => ({ __t: 'json', payload, message });
// 既有故障还原：error() 签名为 (code,message)。本文件几乎所有错误分支均以"消息串"/"附加码"
// 直接传参，导致 error(code,message) 参数换位，产生两种怪形状，为逐字节忠实还原原样构造：
const errCatch = (msg) => ({ __t: 'json', error: { code: msg, message: '操作失败' } }); // error(msg) 单参
const errNot = (msg) => ({ __t: 'json', error: { code: msg, message: 404 } });         // error(msg, 404)

// ============================================================
// 一、标准岗位（position）
// ============================================================
async function positionList(query) {
  try {
    const { job_category, org_type, responsibility_type, keyword, status = 'active', page = 1, pageSize = 20 } = query;

    const pageNum = parseInt(page);
    const pageSizeNum = parseInt(pageSize);
    const offset = (pageNum - 1) * pageSizeNum;

    let countSql = `SELECT COUNT(*) as total FROM position WHERE is_deleted = false`;
    let listSql = `SELECT id, position_code, name, job_category, risk_level, is_safety_critical, org_type, responsibility_type, status, sort_order, created_at
                   FROM position
                   WHERE is_deleted = false`;

    const params = [];
    let idx = 1;

    if (job_category) {
      const cond = ` AND job_category = $${idx++}`;
      countSql += cond;
      listSql += cond;
      params.push(job_category);
    }
    if (org_type) {
      const cond = ` AND org_type = $${idx++}`;
      countSql += cond;
      listSql += cond;
      params.push(org_type);
    }
    if (responsibility_type) {
      const cond = ` AND responsibility_type = $${idx++}`;
      countSql += cond;
      listSql += cond;
      params.push(responsibility_type);
    }
    if (keyword) {
      const cond = ` AND (name ILIKE $${idx} OR position_code ILIKE $${idx})`;
      countSql += cond;
      listSql += cond;
      params.push(`%${keyword}%`);
      idx++;
    }
    if (status && status !== 'all') {
      const cond = ` AND status = $${idx++}`;
      countSql += cond;
      listSql += cond;
      params.push(status);
    }

    listSql += ` ORDER BY sort_order, id LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(pageSizeNum, offset);

    const countResult = await pool.query(countSql, params.slice(0, params.length - 2));
    const listResult = await pool.query(listSql, params);

    return ok({
      list: listResult.rows,
      total: parseInt(countResult.rows[0].total),
      page: pageNum,
      pageSize: pageSizeNum
    }, '岗位列表获取成功');
  } catch (err) {
    console.error('[Position List] Error:', err.message);
    return errCatch('获取岗位列表失败: ' + err.message);
  }
}

async function positionAll(query) {
  try {
    const { job_category, org_type } = query;

    let sql = `SELECT id, position_code, name, job_category, org_type, responsibility_type
               FROM position
               WHERE is_deleted = false AND status = 'active'`;
    const params = [];
    let idx = 1;

    if (job_category) {
      sql += ` AND job_category = $${idx++}`;
      params.push(job_category);
    }
    if (org_type) {
      sql += ` AND org_type = $${idx++}`;
      params.push(org_type);
    }

    sql += ` ORDER BY sort_order, id`;

    const result = await pool.query(sql, params);
    return ok(result.rows, '岗位获取成功');
  } catch (err) {
    console.error('[Position All] Error:', err.message);
    return errCatch('获取岗位失败: ' + err.message);
  }
}

async function positionDetail(params) {
  try {
    const { id } = params;
    const result = await pool.query(
      `SELECT * FROM position WHERE id = $1 AND is_deleted = false`,
      [id]
    );
    if (result.rows.length === 0) {
      return errNot('岗位不存在');
    }
    return ok(result.rows[0], '岗位详情获取成功');
  } catch (err) {
    console.error('[Position Detail] Error:', err.message);
    return errCatch('获取岗位详情失败: ' + err.message);
  }
}

async function positionCreate(body) {
  try {
    const { position_code, name, job_category, risk_level = 'medium', is_safety_critical = false, org_type, responsibility_type = 'none', sort_order = 0, description } = body;

    if (!name || !position_code) {
      return errCatch('岗位编码、岗位名称不能为空');
    }

    // 检查编码是否重复
    const existResult = await pool.query(
      `SELECT id FROM position WHERE position_code = $1 AND is_deleted = false`,
      [position_code]
    );
    if (existResult.rows.length > 0) {
      return errCatch('岗位编码已存在');
    }

    const result = await pool.query(
      `INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, org_type, responsibility_type, sort_order, description, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
       RETURNING id`,
      [position_code, name, job_category || null, risk_level, is_safety_critical, org_type || null, responsibility_type, sort_order, description || null]
    );

    return ok({ id: result.rows[0].id }, '岗位创建成功');
  } catch (err) {
    console.error('[Position Create] Error:', err.message);
    return errCatch('创建岗位失败: ' + err.message);
  }
}

async function positionUpdate(params, body) {
  try {
    const { id } = params;
    const { name, job_category, risk_level, is_safety_critical, org_type, responsibility_type, sort_order, status, description } = body;

    const existResult = await pool.query(
      `SELECT id FROM position WHERE id = $1 AND is_deleted = false`,
      [id]
    );
    if (existResult.rows.length === 0) {
      return errNot('岗位不存在');
    }

    await pool.query(
      `UPDATE position
       SET name = COALESCE($1, name),
           job_category = COALESCE($2, job_category),
           risk_level = COALESCE($3, risk_level),
           is_safety_critical = COALESCE($4, is_safety_critical),
           org_type = COALESCE($5, org_type),
           responsibility_type = COALESCE($6, responsibility_type),
           sort_order = COALESCE($7, sort_order),
           status = COALESCE($8, status),
           description = COALESCE($9, description),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $10`,
      [name || null, job_category || null, risk_level || null, is_safety_critical !== undefined ? is_safety_critical : null, org_type || null, responsibility_type || null, sort_order !== undefined ? sort_order : null, status || null, description !== undefined ? description : null, id]
    );

    return ok(null, '岗位更新成功');
  } catch (err) {
    console.error('[Position Update] Error:', err.message);
    return errCatch('更新岗位失败: ' + err.message);
  }
}

async function positionDelete(params) {
  try {
    const { id } = params;
    await pool.query(
      `UPDATE position SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );
    return ok(null, '岗位删除成功');
  } catch (err) {
    console.error('[Position Delete] Error:', err.message);
    return errCatch('删除岗位失败: ' + err.message);
  }
}

// ============================================================
// 二、岗位别名（hse_position_alias）
// ============================================================
async function aliasList(query) {
  try {
    const { position_id, keyword, page = 1, pageSize = 20 } = query;

    const pageNum = parseInt(page);
    const pageSizeNum = parseInt(pageSize);
    const offset = (pageNum - 1) * pageSizeNum;

    let countSql = `SELECT COUNT(*) as total FROM hse_position_alias WHERE is_deleted = false`;
    let listSql = `SELECT pa.id, pa.position_id, pa.position_name, pa.alias_name, pa.alias_source, pa.sort_order, pa.status, pa.remark, pa.created_at
                   FROM hse_position_alias pa
                   WHERE pa.is_deleted = false`;

    const params = [];
    let idx = 1;

    if (position_id) {
      const cond = ` AND pa.position_id = $${idx++}`;
      countSql += cond;
      listSql += cond;
      params.push(position_id);
    }
    if (keyword) {
      const cond = ` AND (pa.alias_name ILIKE $${idx} OR pa.position_name ILIKE $${idx})`;
      countSql += cond;
      listSql += cond;
      params.push(`%${keyword}%`);
      idx++;
    }

    listSql += ` ORDER BY pa.sort_order, pa.id LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(pageSizeNum, offset);

    const countResult = await pool.query(countSql, params.slice(0, params.length - 2));
    const listResult = await pool.query(listSql, params);

    return ok({
      list: listResult.rows,
      total: parseInt(countResult.rows[0].total),
      page: pageNum,
      pageSize: pageSizeNum
    }, '岗位别名列表获取成功');
  } catch (err) {
    console.error('[Position Alias List] Error:', err.message);
    return errCatch('获取岗位别名列表失败: ' + err.message);
  }
}

async function aliasByPosition(params) {
  try {
    const { positionId } = params;
    const result = await pool.query(
      `SELECT id, alias_name, alias_source, sort_order FROM hse_position_alias
       WHERE position_id = $1 AND is_deleted = false AND status = 'active'
       ORDER BY sort_order, id`,
      [positionId]
    );
    return ok(result.rows, '岗位别名获取成功');
  } catch (err) {
    console.error('[Position Alias By Position] Error:', err.message);
    return errCatch('获取岗位别名失败: ' + err.message);
  }
}

async function aliasCreate(body) {
  try {
    const { position_id, alias_name, alias_source = 'roster', sort_order = 0, remark } = body;

    if (!position_id || !alias_name) {
      return errCatch('岗位ID、别名名称不能为空');
    }

    const posResult = await pool.query(
      `SELECT id, name FROM position WHERE id = $1 AND is_deleted = false`,
      [position_id]
    );
    if (posResult.rows.length === 0) {
      return errCatch('岗位不存在');
    }

    const existResult = await pool.query(
      `SELECT id FROM hse_position_alias WHERE position_id = $1 AND alias_name = $2 AND is_deleted = false`,
      [position_id, alias_name]
    );
    if (existResult.rows.length > 0) {
      return errCatch('该岗位已存在相同别名');
    }

    const result = await pool.query(
      `INSERT INTO hse_position_alias (position_id, position_name, alias_name, alias_source, sort_order, remark, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')
       RETURNING id`,
      [position_id, posResult.rows[0].name, alias_name, alias_source, sort_order, remark || null]
    );

    return ok({ id: result.rows[0].id }, '岗位别名创建成功');
  } catch (err) {
    console.error('[Position Alias Create] Error:', err.message);
    return errCatch('创建岗位别名失败: ' + err.message);
  }
}

async function aliasDelete(params) {
  try {
    const { id } = params;
    await pool.query(
      `UPDATE hse_position_alias SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );
    return ok(null, '岗位别名删除成功');
  } catch (err) {
    console.error('[Position Alias Delete] Error:', err.message);
    return errCatch('删除岗位别名失败: ' + err.message);
  }
}

// ============================================================
// 三、责任配置（hse_responsibility_config）
// ============================================================
async function configList(query) {
  try {
    const { default_responsibility_type, is_configurable, keyword, page = 1, pageSize = 20 } = query;

    const pageNum = parseInt(page);
    const pageSizeNum = parseInt(pageSize);
    const offset = (pageNum - 1) * pageSizeNum;

    let countSql = `SELECT COUNT(*) as total FROM hse_responsibility_config WHERE is_deleted = false`;
    let listSql = `SELECT rc.id, rc.position_id, rc.position_name, rc.default_responsibility_type,
                          rc.default_grid_level, rc.default_grid_role, rc.default_inspection_frequency,
                          rc.is_configurable, rc.sort_order, rc.status, rc.remark, rc.created_at
                   FROM hse_responsibility_config rc
                   WHERE rc.is_deleted = false`;

    const params = [];
    let idx = 1;

    if (default_responsibility_type) {
      const cond = ` AND rc.default_responsibility_type = $${idx++}`;
      countSql += cond;
      listSql += cond;
      params.push(default_responsibility_type);
    }
    if (is_configurable !== undefined && is_configurable !== '') {
      const cond = ` AND rc.is_configurable = $${idx++}`;
      countSql += cond;
      listSql += cond;
      params.push(is_configurable === 'true' || is_configurable === true);
    }
    if (keyword) {
      const cond = ` AND rc.position_name ILIKE $${idx}`;
      countSql += cond;
      listSql += cond;
      params.push(`%${keyword}%`);
      idx++;
    }

    listSql += ` ORDER BY rc.sort_order, rc.id LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(pageSizeNum, offset);

    const countResult = await pool.query(countSql, params.slice(0, params.length - 2));
    const listResult = await pool.query(listSql, params);

    return ok({
      list: listResult.rows,
      total: parseInt(countResult.rows[0].total),
      page: pageNum,
      pageSize: pageSizeNum
    }, '责任配置列表获取成功');
  } catch (err) {
    console.error('[Responsibility Config List] Error:', err.message);
    return errCatch('获取责任配置列表失败: ' + err.message);
  }
}

async function configByPosition(params) {
  try {
    const { positionId } = params;
    const result = await pool.query(
      `SELECT * FROM hse_responsibility_config WHERE position_id = $1 AND is_deleted = false`,
      [positionId]
    );
    if (result.rows.length === 0) {
      return ok(null, '该岗位暂无责任配置');
    }
    return ok(result.rows[0], '责任配置获取成功');
  } catch (err) {
    console.error('[Responsibility Config By Position] Error:', err.message);
    return errCatch('获取责任配置失败: ' + err.message);
  }
}

async function configUpdate(params, body) {
  try {
    const { id } = params;
    const { default_responsibility_type, default_grid_level, default_grid_role, default_inspection_frequency, is_configurable, remark } = body;

    const existResult = await pool.query(
      `SELECT id, is_configurable FROM hse_responsibility_config WHERE id = $1 AND is_deleted = false`,
      [id]
    );
    if (existResult.rows.length === 0) {
      return errNot('责任配置不存在');
    }

    // 如果 is_configurable = false，禁止修改责任类型
    if (!existResult.rows[0].is_configurable && default_responsibility_type !== undefined) {
      return errCatch('该岗位责任类型为固定配置，不可修改');
    }

    await pool.query(
      `UPDATE hse_responsibility_config
       SET default_responsibility_type = COALESCE($1, default_responsibility_type),
           default_grid_level = COALESCE($2, default_grid_level),
           default_grid_role = COALESCE($3, default_grid_role),
           default_inspection_frequency = COALESCE($4, default_inspection_frequency),
           is_configurable = COALESCE($5, is_configurable),
           remark = COALESCE($6, remark),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7`,
      [default_responsibility_type || null, default_grid_level || null, default_grid_role || null, default_inspection_frequency || null, is_configurable !== undefined ? is_configurable : null, remark !== undefined ? remark : null, id]
    );

    return ok(null, '责任配置更新成功');
  } catch (err) {
    console.error('[Responsibility Config Update] Error:', err.message);
    return errCatch('更新责任配置失败: ' + err.message);
  }
}

// ============================================================
// 四、责任记录（hse_responsibility）
// ============================================================
async function responsibilityList(query) {
  try {
    const { responsibility_type, grid_level, responsible_org_id, employee_id, keyword, status = 'active', page = 1, pageSize = 20 } = query;

    const pageNum = parseInt(page);
    const pageSizeNum = parseInt(pageSize);
    const offset = (pageNum - 1) * pageSizeNum;

    let countSql = `SELECT COUNT(*) as total FROM hse_responsibility r WHERE r.is_deleted = false`;
    let listSql = `SELECT r.id, r.employee_id, r.responsibility_type, r.grid_level, r.grid_role,
                          r.standard_position, r.position_alias, r.responsible_org, r.responsible_org_id,
                          r.responsible_area, r.inspection_frequency, r.start_date, r.end_date,
                          r.status, r.source, r.remark, r.created_at,
                          e.name as employee_name, e.employee_code
                   FROM hse_responsibility r
                   LEFT JOIN employee e ON e.id = r.employee_id
                   WHERE r.is_deleted = false`;

    const params = [];
    let idx = 1;

    if (responsibility_type) {
      const cond = ` AND r.responsibility_type = $${idx++}`;
      countSql += cond;
      listSql += cond;
      params.push(responsibility_type);
    }
    if (grid_level) {
      const cond = ` AND r.grid_level = $${idx++}`;
      countSql += cond;
      listSql += cond;
      params.push(grid_level);
    }
    if (responsible_org_id) {
      const cond = ` AND r.responsible_org_id = $${idx++}`;
      countSql += cond;
      listSql += cond;
      params.push(responsible_org_id);
    }
    if (employee_id) {
      const cond = ` AND r.employee_id = $${idx++}`;
      countSql += cond;
      listSql += cond;
      params.push(employee_id);
    }
    if (keyword) {
      const cond = ` AND (e.name ILIKE $${idx} OR r.standard_position ILIKE $${idx} OR r.responsible_org ILIKE $${idx})`;
      countSql += cond;
      listSql += cond;
      params.push(`%${keyword}%`);
      idx++;
    }
    if (status && status !== 'all') {
      const cond = ` AND r.status = $${idx++}`;
      countSql += cond;
      listSql += cond;
      params.push(status);
    }

    listSql += ` ORDER BY r.id DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(pageSizeNum, offset);

    const countResult = await pool.query(countSql, params.slice(0, params.length - 2));
    const listResult = await pool.query(listSql, params);

    return ok({
      list: listResult.rows,
      total: parseInt(countResult.rows[0].total),
      page: pageNum,
      pageSize: pageSizeNum
    }, '责任记录列表获取成功');
  } catch (err) {
    console.error('[Responsibility List] Error:', err.message);
    return errCatch('获取责任记录列表失败: ' + err.message);
  }
}

async function responsibilityDetail(params) {
  try {
    const { id } = params;
    const result = await pool.query(
      `SELECT r.*, e.name as employee_name, e.employee_code
       FROM hse_responsibility r
       LEFT JOIN employee e ON e.id = r.employee_id
       WHERE r.id = $1 AND r.is_deleted = false`,
      [id]
    );
    if (result.rows.length === 0) {
      return errNot('责任记录不存在');
    }
    return ok(result.rows[0], '责任记录详情获取成功');
  } catch (err) {
    console.error('[Responsibility Detail] Error:', err.message);
    return errCatch('获取责任记录详情失败: ' + err.message);
  }
}

async function responsibilityCreate(body) {
  try {
    const { employee_id, responsibility_type, grid_level, grid_role, standard_position, position_alias,
            responsible_org, responsible_org_id, responsible_area, inspection_frequency,
            start_date, end_date, remark } = body;

    if (!employee_id || !responsibility_type) {
      return errCatch('员工ID、责任类型不能为空');
    }

    const result = await pool.query(
      `INSERT INTO hse_responsibility (employee_id, responsibility_type, grid_level, grid_role,
                                       standard_position, position_alias, responsible_org,
                                       responsible_org_id, responsible_area, inspection_frequency,
                                       start_date, end_date, source, status, remark)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'manual', 'active', $13)
       RETURNING id`,
      [employee_id, responsibility_type, grid_level || null, grid_role || null,
       standard_position || null, position_alias || null, responsible_org || null,
       responsible_org_id || null, responsible_area || null, inspection_frequency || null,
       start_date || null, end_date || null, remark || null]
    );

    return ok({ id: result.rows[0].id }, '责任记录创建成功');
  } catch (err) {
    console.error('[Responsibility Create] Error:', err.message);
    return errCatch('创建责任记录失败: ' + err.message);
  }
}

async function responsibilityUpdate(params, body) {
  try {
    const { id } = params;
    const { responsibility_type, grid_level, grid_role, responsible_org, responsible_org_id,
            responsible_area, inspection_frequency, start_date, end_date, status, remark } = body;

    const existResult = await pool.query(
      `SELECT id FROM hse_responsibility WHERE id = $1 AND is_deleted = false`,
      [id]
    );
    if (existResult.rows.length === 0) {
      return errNot('责任记录不存在');
    }

    await pool.query(
      `UPDATE hse_responsibility
       SET responsibility_type = COALESCE($1, responsibility_type),
           grid_level = COALESCE($2, grid_level),
           grid_role = COALESCE($3, grid_role),
           responsible_org = COALESCE($4, responsible_org),
           responsible_org_id = COALESCE($5, responsible_org_id),
           responsible_area = COALESCE($6, responsible_area),
           inspection_frequency = COALESCE($7, inspection_frequency),
           start_date = COALESCE($8, start_date),
           end_date = COALESCE($9, end_date),
           status = COALESCE($10, status),
           remark = COALESCE($11, remark),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $12`,
      [responsibility_type || null, grid_level || null, grid_role || null,
       responsible_org || null, responsible_org_id || null, responsible_area || null,
       inspection_frequency || null, start_date || null, end_date || null,
       status || null, remark !== undefined ? remark : null, id]
    );

    return ok(null, '责任记录更新成功');
  } catch (err) {
    console.error('[Responsibility Update] Error:', err.message);
    return errCatch('更新责任记录失败: ' + err.message);
  }
}

async function responsibilityDelete(params) {
  try {
    const { id } = params;
    await pool.query(
      `UPDATE hse_responsibility SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );
    return ok(null, '责任记录删除成功');
  } catch (err) {
    console.error('[Responsibility Delete] Error:', err.message);
    return errCatch('删除责任记录失败: ' + err.message);
  }
}

// ============================================================
// 五、枚举接口（纯静态，不触库）
// ============================================================
function responsibilityTypes() {
  return ok(
    [
      { value: 'grid_leader', label: '网格长责任' },
      { value: 'production_manager', label: '生产管理责任' },
      { value: 'none', label: '非责任岗位' }
    ],
    '责任类型获取成功'
  );
}

function responsibilityGridLevels() {
  return ok(
    [
      { value: 'grid1', label: '一级网格（总网格长）' },
      { value: 'grid2', label: '二级网格（一级网格长）' },
      { value: 'grid3', label: '三级网格（二级网格长）' },
      { value: 'grid4', label: '四级网格（三级网格长）' }
    ],
    '网格层级获取成功'
  );
}

function positionJobCategories() {
  return ok(
    [
      { value: '管理', label: '管理岗位' },
      { value: '生产', label: '生产岗位' },
      { value: '技术', label: '技术岗位' },
      { value: '辅助', label: '辅助岗位' }
    ],
    '岗位类别获取成功'
  );
}

module.exports = {
  positionList, positionAll, positionDetail, positionCreate, positionUpdate, positionDelete, positionJobCategories,
  aliasList, aliasByPosition, aliasCreate, aliasDelete,
  configList, configByPosition, configUpdate,
  responsibilityList, responsibilityDetail, responsibilityCreate, responsibilityUpdate, responsibilityDelete,
  responsibilityTypes, responsibilityGridLevels,
};