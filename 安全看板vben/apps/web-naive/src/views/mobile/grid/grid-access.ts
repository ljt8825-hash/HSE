/**
 * HSE-MOBILE-GRID-03-B：移动端网格域「可修改」角色判定（客户端显示门槛）
 *
 * 目的：仅用于决定移动端是否展示「补传整改照片」入口（显示门槛），**不作为授权依据**。
 * 真正的授权判定 100% 在服务器端完成：
 *   - requirePermission('hse:site:grid:update')  → server/routes/site-mgmt.js（PUT /grid-records/:id）
 *   - resolveGridScope() + buildScopeSqlCondition() → 行级 own_grid，越权 403 + code=SCOPE_DENIED
 *
 * 角色清单来源（逐条核对，非按角色名猜测）：
 *   server/middleware/auth.js
 *     :327-372  HSE_MANAGER_PERMISSIONS（含 'hse:site:grid:update'）
 *     :379      admin            → HSE_MANAGER_PERMISSIONS
 *     :382      safety_manager   → HSE_MANAGER_PERMISSIONS
 *     :385      hse_manager      → HSE_MANAGER_PERMISSIONS
 *     :402      township_manager → 含 'hse:site:grid:update'
 *     :426      manager          → 含 'hse:site:grid:update'
 *     :445-449  grid_inspector   → 含 'hse:site:grid:update'
 *     :376      system_admin     → ['*']
 *
 * 说明：前端 accessStore 的权限码来自 GET /auth/codes，其内容为**角色名**
 * （server/routes/vben-compat.js:76 `codes = role === 'admin' ? ['admin'] : [role]`），
 * 故此处只能按角色判定（与项目既有页面统一使用 hasAccessByRoles 的现状一致）。
 */

/** 持有 hse:site:grid:update 的角色（与后端 ROLE_PERMISSIONS_MAP 一致） */
export const GRID_UPDATE_ROLES = [
  'admin',
  'hse_manager',
  'safety_manager',
  'system_admin',
  'township_manager',
  'manager',
  'grid_inspector',
];

/**
 * 当前登录角色是否可能具备网格记录修改权限。
 * @param hasAccessByRoles 来自 `useAccess()` 的角色判定函数
 */
export function canUpdateGridRecords(
  hasAccessByRoles: (roles: string[]) => boolean,
): boolean {
  return hasAccessByRoles([...GRID_UPDATE_ROLES]);
}
