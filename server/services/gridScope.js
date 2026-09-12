/**
 * 阶段3-B-2：网格巡查行级数据范围（data scope）
 *
 * 设计原则（禁止客户端决定范围）：
 *   1. 范围只由「认证用户 + users.role + 后端角色权限配置」决定；
 *      前端不得传 scope=all_grid / own_grid 作为授权依据（客户端参数仅作查询条件）。
 *   2. 唯一身份关系（frontend 不可干预）：
 *        users.employee_id = grid_areas.personnel_id → grid_areas.id
 *      即 users.employee_id 是网格负责人与网格的唯一可信纽带；禁止姓名/昵称/手机/username 匹配。
 *   3. Fail-Closed：查不到网格、未绑定员工、角色未识别 → 不可见任何记录（1 = 0）。
 *   4. 本模块只有 SELECT，不修改任何数据。
 *
 * 支持的范围类型：
 *   all_grid  —— 拥有全部网格（平台级高权限角色）
 *   own_grid  —— 仅本人负责网格（网格负责人，按 employee_id → grid_areas.personnel_id 反查）
 *   none      —— 无可见（未识别角色 / 未绑定 / 查不到网格）
 *
 * org_grid：阶段3-A 已确认 grid_areas.township 大量 NULL，组织关系不可靠 → 本阶段 DEFERRED。
 *   在 org_grid 落地前，township_manager 暂按 all_grid 处理（与其现有「可见全部」行为一致，
 *   待组织字段补全后收窄为 org_grid）。
 */
const { pool } = require('../config/db');

const SCOPE = {
  ALL: 'all_grid',
  OWN: 'own_grid',
  NONE: 'none',
};

// 平台级高权限：本就拥有跨网格监督能力 → all_grid（复用现有角色权限模型，不新建 scope 表）
const ALL_GRID_ROLES = ['system_admin', 'admin', 'hse_manager', 'safety_manager', 'township_manager'];
// 网格负责人：仅本人负责网格
const OWN_GRID_ROLES = ['grid_inspector', 'manager'];

/**
 * 解析当前用户的网格数据范围。
 * @param {{ role?: string, userId?: number|string, employeeId?: number|string }} ctx
 * @param {{ client?: object, logger?: object }} [opts]
 * @returns {Promise<{ scopeType: string, employeeId: number|null, gridIds: number[] }>}
 *   - gridIds：own_grid 时由 grid_areas 反查得到的网格 id 列表（仅信息用途 / 测试输出；
 *     SQL 过滤统一用 employeeId 子查询，避免预计算漂移）。
 */
async function resolveGridScope(ctx, { client, logger = console } = {}) {
  const db = client || pool;
  const role = ctx && ctx.role;
  if (typeof role !== 'string' || role.trim() === '') {
    return { scopeType: SCOPE.NONE, employeeId: null, gridIds: [] };
  }

  if (ALL_GRID_ROLES.includes(role)) {
    const empId = ctx.employeeId != null ? Number(ctx.employeeId) : null;
    return { scopeType: SCOPE.ALL, employeeId: empId, gridIds: null };
  }

  if (OWN_GRID_ROLES.includes(role)) {
    let empId = ctx.employeeId != null ? Number(ctx.employeeId) : null;
    // req.user 当前不含 employee_id（authMiddleware 仅注入 id/username/role/realName），
    // 由 userId 实时查 users.employee_id（与 authenticatedEmployeeResolver 同源，保证绑定关系即时生效）。
    if (empId == null && ctx.userId != null) {
      try {
        const r = await db.query(
          'SELECT employee_id FROM public.users WHERE id = $1 AND is_active = true',
          [Number(ctx.userId)]
        );
        if (r.rows[0] && r.rows[0].employee_id != null) {
          empId = Number(r.rows[0].employee_id);
        }
      } catch (e) {
        if (typeof logger.error === 'function') {
          logger.error('[gridScope] users.employee_id 查询失败:', e && e.message);
        }
        return { scopeType: SCOPE.OWN, employeeId: null, gridIds: [] }; // fail-closed
      }
    }
    // 未绑定员工 → 无可见网格
    if (empId == null) {
      return { scopeType: SCOPE.OWN, employeeId: null, gridIds: [] };
    }
    let rows;
    try {
      const r = await db.query(
        'SELECT id FROM grid_areas WHERE personnel_id = $1 AND is_deleted = false ORDER BY id',
        [empId]
      );
      rows = r.rows;
    } catch (e) {
      if (typeof logger.error === 'function') {
        logger.error('[gridScope] grid_areas 查询失败:', e && e.message);
      }
      return { scopeType: SCOPE.OWN, employeeId: empId, gridIds: [] }; // fail-closed
    }
    const gridIds = rows.map((x) => Number(x.id));
    return { scopeType: SCOPE.OWN, employeeId: empId, gridIds };
  }

  // 未识别角色（如 viewer）→ 无网格巡查可见范围
  return { scopeType: SCOPE.NONE, employeeId: null, gridIds: [] };
}

/**
 * 生成 GET/PUT/DELETE 的 SQL 范围条件片段（SQL 层过滤，禁止 Node 内全量拉取后过滤）。
 * @param {{ scopeType: string, employeeId: number|null }} scope
 * @param {number} startIndex 条件中第一个参数的 $ 占位序号
 * @returns {{ condition: string|null, params: any[] }}
 *   - all_grid：返回 null（无额外限制）
 *   - own_grid 且 employeeId 已知：grid_id IN (SELECT id FROM grid_areas WHERE personnel_id = $startIndex AND is_deleted = false)
 *   - own_grid 无网格 / none：'1 = 0'（不可见任何记录，fail-closed）
 */
function buildScopeSqlCondition(scope, startIndex) {
  if (!scope || scope.scopeType === SCOPE.ALL) {
    return { condition: null, params: [] };
  }
  if (scope.scopeType === SCOPE.OWN && scope.employeeId != null) {
    return {
      condition: `grid_id IN (SELECT id FROM grid_areas WHERE personnel_id = $${startIndex} AND is_deleted = false)`,
      params: [scope.employeeId],
    };
  }
  // own_grid 无网格 或 none → 不可见任何记录
  return { condition: '1 = 0', params: [] };
}

/**
 * PG 新建巡查记录时后端派生 grid_id（fail-closed）：
 *   0 个 live grid → 'no_grid'  （调用方应 403 拒绝创建）
 *   1 个 live grid  → 'ok'       （使用派生的 gridId）
 *   >1 个 live grid → 'multiple'  （调用方应 409 拒绝创建，禁止猜测）
 * @param {number|string} employeeId
 * @param {{ client?: object, logger?: object }} [opts]
 */
async function deriveGridIdForEmployee(employeeId, { client, logger = console } = {}) {
  const db = client || pool;
  const empId = employeeId != null ? Number(employeeId) : null;
  if (empId == null) {
    return { status: 'no_grid', gridId: null };
  }
  let rows;
  try {
    const r = await db.query(
      'SELECT id FROM grid_areas WHERE personnel_id = $1 AND is_deleted = false ORDER BY id',
      [empId]
    );
    rows = r.rows;
  } catch (e) {
    if (typeof logger.error === 'function') {
      logger.error('[gridScope] deriveGridId 查询失败:', e && e.message);
    }
    return { status: 'no_grid', gridId: null };
  }
  if (rows.length === 0) return { status: 'no_grid', gridId: null };
  if (rows.length > 1) return { status: 'multiple', gridId: null };
  return { status: 'ok', gridId: Number(rows[0].id) };
}

module.exports = {
  SCOPE,
  ALL_GRID_ROLES,
  OWN_GRID_ROLES,
  resolveGridScope,
  buildScopeSqlCondition,
  deriveGridIdForEmployee,
};
