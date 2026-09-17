/**
 * 阶段 P2-B1-D-IMPLEMENTATION-04-B：通道 B 待归属 —— 人工归属服务层
 *
 * 设计边界（严禁触雷）：
 *  - 不接 auth/JWT/login（操作人来自 req.user，由 router 注入）
 *  - 不接 scheduler / 不创建后台进程
 *  - 不写 WPS / 不创建 WPS 映射
 *  - 不修改任何冻结文件（authenticatedEmployeeResolver / gridScope / site-mgmt / Pull Engine / .env）
 *  - 审计必须走「当前事务 client」直写 audit_record；严禁 auditLog()/createAuditRecord()（用 pool、吞异常、非原子）
 *  - 客户端只能提交 record_id + candidate_employee_id；grid_id/inspector_employee_id/attribution_status 等一律由服务端决定
 *
 * 事务模型（§九/§十一）：
 *   BEGIN → 校验 candidate employee → deriveGridIdForEmployee → 条件 UPDATE(rowCount 守卫) → 直写 audit_record → COMMIT
 *   任何一步失败 → ROLLBACK（单次，catch 统一处理）
 */
const { pool } = require('../config/db');
const { deriveGridIdForEmployee } = require('../services/gridScope');

class ApiError extends Error {
  constructor(httpStatus, code, message) {
    super(message);
    this.httpStatus = httpStatus;
    this.code = code;
  }
}

function normalizeInt(v) {
  if (v == null) return null;
  const n = Number.parseInt(String(v), 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

// ===================== GET pending =====================
// 严格 ONLY pending + 双 NULL；不得用 OR；NULL 绝不自动显示为 pending（§五/§十三）
async function getPendingRecords({ limit = 500, offset = 0 } = {}) {
  // 05-E-B：仅扩展 SELECT 展示列（serial_no/violator_name/grid_level/position/upload_time），
  // 供 admin 人工判断历史归属；WHERE 严格条件与状态机零改动。
  const r = await pool.query(
    `SELECT id, serial_no, inspection_date, area_team, personnel_name, grid_level, position,
            violator_name, violation_behavior, upload_time,
            attribution_status, created_at, updated_at
     FROM grid_inspection_records
     WHERE attribution_status = 'pending'
       AND inspector_employee_id IS NULL
       AND grid_id IS NULL
     ORDER BY id
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return r.rows;
}

async function getPendingCount() {
  const r = await pool.query(
    `SELECT count(*)::int AS c FROM grid_inspection_records
     WHERE attribution_status = 'pending' AND inspector_employee_id IS NULL AND grid_id IS NULL`
  );
  return r.rows[0].c;
}

// ===================== 事务内审计直写 =====================
async function insertAudit(client, { userId, username, module, table_name, record_id, action, old_value, new_value, changed_fields, ip_address }) {
  // 仅测试故障注入开关（生产永不设置）：用于验证「审计失败→整事务 ROLLBACK」（§十六 R）
  if (process.env.P2B1D_FORCE_AUDIT_FAIL === 'true') {
    throw new Error('[test] forced audit insert failure');
  }
  const r = await client.query(
    `INSERT INTO audit_record
       (operation_log_id, user_id, username, module, table_name, record_id, action, old_value, new_value, changed_fields, ip_address)
     VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      userId,
      username || 'unknown',
      module || 'grid-attribution',
      table_name,
      String(record_id),
      action,
      old_value != null ? old_value : null, // jsonb：直接传对象
      new_value != null ? new_value : null, // jsonb：直接传对象
      changed_fields != null ? changed_fields : null, // text[]：直接传数组
      ip_address || null,
    ]
  );
  return r.rows[0].id;
}

// ===================== POST attribute =====================
async function attributeRecord({ record_id, candidate_employee_id, operator, ip }) {
  const rid = normalizeInt(record_id);
  const eid = normalizeInt(candidate_employee_id);
  if (rid == null) throw new ApiError(400, 'INVALID_RECORD_ID', 'record_id 无效');
  if (eid == null) throw new ApiError(400, 'INVALID_EMPLOYEE_ID', 'candidate_employee_id 无效');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. candidate employee 必须存在且有效
    const emp = await client.query('SELECT id, is_deleted FROM employee WHERE id = $1', [eid]);
    if (emp.rows.length === 0 || emp.rows[0].is_deleted === true) {
      throw new ApiError(409, 'EMPLOYEE_INVALID', '候选员工不存在或已失效');
    }

    // 2. 由服务端派生唯一 live grid（fail-closed：禁止猜测/选第一个）
    const g = await deriveGridIdForEmployee(eid, { client });
    if (g.status === 'no_grid') throw new ApiError(409, 'GRID_NONE', '该员工无关联网格，无法归属');
    if (g.status === 'multiple') throw new ApiError(409, 'GRID_MULTIPLE', '该员工关联多个网格，无法自动归属');

    // 3. 条件 UPDATE（仅 pending + 双 NULL 才动；rowCount 守卫）
    const upd = await client.query(
      `UPDATE grid_inspection_records
       SET attribution_status = 'manual_confirmed',
           inspector_employee_id = $2,
           grid_id = $3,
           updated_at = NOW()
       WHERE id = $1
         AND attribution_status = 'pending'
         AND inspector_employee_id IS NULL
         AND grid_id IS NULL`,
      [rid, eid, g.gridId]
    );
    if (upd.rowCount !== 1) {
      throw new ApiError(409, 'RECORD_NOT_PENDING', '该记录当前不可归属（非 pending 或已被处理）');
    }

    // 4. 审计（同事务，真实 client）
    await insertAudit(client, {
      userId: operator.userId,
      username: operator.username,
      module: 'grid-attribution',
      table_name: 'grid_inspection_records',
      record_id: rid,
      action: 'attribute',
      old_value: { attribution_status: 'pending', inspector_employee_id: null, grid_id: null },
      new_value: { attribution_status: 'manual_confirmed', inspector_employee_id: eid, grid_id: g.gridId },
      changed_fields: ['attribution_status', 'inspector_employee_id', 'grid_id'],
      ip_address: ip,
    });

    await client.query('COMMIT');
    return { ok: true, record_id: rid, inspector_employee_id: eid, grid_id: g.gridId };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof ApiError) return { httpStatus: err.httpStatus, code: err.code, message: err.message };
    return { httpStatus: 500, code: 'ATTRIBUTE_FAILED', message: err && err.message ? err.message : '归属失败' };
  } finally {
    client.release();
  }
}

// ===================== DELETE revoke =====================
// 仅 manual_confirmed → pending；事务内 SELECT FOR UPDATE 取真实旧值；拒绝任何客户端 old* 提交（§十一）
async function revokeRecord({ record_id, operator, ip, reason }) {
  const rid = normalizeInt(record_id);
  if (rid == null) throw new ApiError(400, 'INVALID_RECORD_ID', 'record_id 无效');
  if (reason) {
    // reason 仅作审计 detail，不参与权限，不持久化（audit_record 无 detail 列，04-A 决定不新增字段）
    console.log('[grid-attribution] revoke reason (not persisted):', reason);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. 取真实当前状态（FOR UPDATE 串行化并发撤销）
    const cur = await client.query(
      `SELECT attribution_status, inspector_employee_id, grid_id
       FROM grid_inspection_records WHERE id = $1 FOR UPDATE`,
      [rid]
    );
    if (cur.rows.length === 0) throw new ApiError(404, 'RECORD_NOT_FOUND', '记录不存在');
    const row = cur.rows[0];
    if (row.attribution_status !== 'manual_confirmed') {
      throw new ApiError(409, 'NOT_REVOCABLE', '仅 manual_confirmed 状态可撤销');
    }
    const oldValue = {
      attribution_status: row.attribution_status,
      inspector_employee_id: row.inspector_employee_id,
      grid_id: row.grid_id,
    };

    // 2. 条件 UPDATE：仅 manual_confirmed → pending，清空身份
    const upd = await client.query(
      `UPDATE grid_inspection_records
       SET attribution_status = 'pending',
           inspector_employee_id = NULL,
           grid_id = NULL,
           updated_at = NOW()
       WHERE id = $1
         AND attribution_status = 'manual_confirmed'`,
      [rid]
    );
    if (upd.rowCount !== 1) throw new ApiError(409, 'REVOKE_CONFLICT', '撤销失败：状态已被并发修改');

    // 3. 审计（真实旧值）
    await insertAudit(client, {
      userId: operator.userId,
      username: operator.username,
      module: 'grid-attribution',
      table_name: 'grid_inspection_records',
      record_id: rid,
      action: 'revoke',
      old_value: oldValue,
      new_value: { attribution_status: 'pending', inspector_employee_id: null, grid_id: null },
      changed_fields: ['attribution_status', 'inspector_employee_id', 'grid_id'],
      ip_address: ip,
    });

    await client.query('COMMIT');
    return { ok: true, record_id: rid, attribution_status: 'pending' };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof ApiError) return { httpStatus: err.httpStatus, code: err.code, message: err.message };
    return { httpStatus: 500, code: 'REVOKE_FAILED', message: err && err.message ? err.message : '撤销失败' };
  } finally {
    client.release();
  }
}

// ===================== GET attributed（04-D-B） =====================
// 已归属记录只读查询。
// 状态口径（§五 / 冻结状态机）：仅 attribution_status IN ('attributed','manual_confirmed')；
//   禁止用 id>7192 / wps_record_id IS NOT NULL / inspector_employee_id IS NOT NULL 等方式推断。
// 服务端固定查询范围（§六/§十三）：不接受客户端 grid_id / inspector_employee_id /
//   operator_employee_id / attribution_status 参数（忽略，不读取）；仅接受 page/pageSize/keyword。
// 真分页（§十二）：LIMIT/OFFSET + 独立 count；pageSize 服务端裁剪上限 200（与 /hse/audit-records 一致）。
// 排序（04-D-A §陷阱）：id DESC（gir.updated_at 每 15 分钟被 Pull 重写，禁止作归属时间/排序依据）。
function escapeLike(s) {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

async function listAttributed({ page = 1, pageSize = 20, keyword } = {}) {
  const p = normalizeInt(page) || 1;
  let ps = normalizeInt(pageSize) || 20;
  if (ps > 200) ps = 200;

  const params = [];
  let where = `g.attribution_status IN ('attributed', 'manual_confirmed')`;
  const kwRaw = keyword == null ? '' : String(keyword).trim();
  if (kwRaw !== '') {
    const like = `%${escapeLike(kwRaw)}%`;
    params.push(like);
    const textCond =
      `(g.serial_no ILIKE $${params.length} ESCAPE '\\'` +
      ` OR g.personnel_name ILIKE $${params.length} ESCAPE '\\'` +
      ` OR g.violator_name ILIKE $${params.length} ESCAPE '\\')`;
    const asId = normalizeInt(kwRaw);
    if (asId != null) {
      params.push(asId);
      where += ` AND (${textCond} OR g.id = $${params.length})`;
    } else {
      where += ` AND ${textCond}`;
    }
  }

  const baseSql = `
    FROM grid_inspection_records g
    LEFT JOIN employee e        ON e.id  = g.inspector_employee_id
    LEFT JOIN grid_areas ga     ON ga.id = g.grid_id`;

  const totalR = await pool.query(
    `SELECT count(*)::int AS c ${baseSql} WHERE ${where}`,
    params,
  );

  params.push(ps, (p - 1) * ps);
  const lim = `$${params.length - 1}`;
  const off = `$${params.length}`;
  const rows = await pool.query(
    `SELECT g.id, g.serial_no, g.inspection_date, g.area_team, g.personnel_name,
            g.violator_name, g.violation_behavior,
            g.grid_id, g.inspector_employee_id, g.attribution_status, g.created_at,
            e.name  AS inspector_name,
            ga.name AS grid_name,
            ga.township AS grid_township
     ${baseSql}
     WHERE ${where}
     ORDER BY g.id DESC
     LIMIT ${lim} OFFSET ${off}`,
    params,
  );

  return { total: totalR.rows[0].c, page: p, pageSize: ps, list: rows.rows };
}

module.exports = {
  ApiError,
  getPendingRecords,
  getPendingCount,
  attributeRecord,
  revokeRecord,
  listAttributed,
};
