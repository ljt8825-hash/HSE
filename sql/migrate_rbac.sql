-- ============================================================
-- HSE 安全管理系统 — RBAC 权限体系迁移脚本
-- 文件: migrate_rbac.sql
-- 数据库: safety_dashboard
-- 说明: 新增角色管理、菜单管理、权限分配相关表
--       本文件为幂等设计，可安全重复执行
-- 执行: psql -U postgres -d safety_dashboard -f migrate_rbac.sql
-- ============================================================

-- ============ 0. 扩展 ============
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================
-- 1. 角色表 roles
-- ============================================================
CREATE TABLE IF NOT EXISTS roles (
    id              BIGSERIAL     PRIMARY KEY,
    code            VARCHAR(50)   NOT NULL UNIQUE,
    name            VARCHAR(100)  NOT NULL,
    description     VARCHAR(500),
    sort_order      INTEGER       DEFAULT 0,
    is_active       BOOLEAN       NOT NULL DEFAULT true,
    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  roles IS '角色表';
COMMENT ON COLUMN roles.id IS '主键';
COMMENT ON COLUMN roles.code IS '角色编码（唯一标识，如 admin/manager/viewer）';
COMMENT ON COLUMN roles.name IS '角色名称';
COMMENT ON COLUMN roles.description IS '角色描述';
COMMENT ON COLUMN roles.sort_order IS '排序序号';
COMMENT ON COLUMN roles.is_active IS '是否启用';

CREATE INDEX IF NOT EXISTS idx_roles_code ON roles (code);
CREATE INDEX IF NOT EXISTS idx_roles_active ON roles (is_active);


-- ============================================================
-- 2. 菜单表 menus（支持树形结构，包含权限点）
-- ============================================================
CREATE TABLE IF NOT EXISTS menus (
    id              BIGSERIAL     PRIMARY KEY,
    parent_id       BIGINT,
    name            VARCHAR(100)  NOT NULL,
    path            VARCHAR(255),
    component       VARCHAR(255),
    icon            VARCHAR(100),
    permission      VARCHAR(100),
    type            VARCHAR(20)   NOT NULL DEFAULT 'menu',
    sort_order      INTEGER       DEFAULT 0,
    is_active       BOOLEAN       NOT NULL DEFAULT true,
    hidden          BOOLEAN       NOT NULL DEFAULT false,
    keep_alive      BOOLEAN       NOT NULL DEFAULT false,
    redirect        VARCHAR(255),
    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  menus IS '菜单表';
COMMENT ON COLUMN menus.id IS '主键';
COMMENT ON COLUMN menus.parent_id IS '父菜单ID（0或NULL表示一级菜单）';
COMMENT ON COLUMN menus.name IS '菜单名称';
COMMENT ON COLUMN menus.path IS '路由路径';
COMMENT ON COLUMN menus.component IS '前端组件路径';
COMMENT ON COLUMN menus.icon IS '图标名称';
COMMENT ON COLUMN menus.permission IS '权限标识（如 dashboard:view）';
COMMENT ON COLUMN menus.type IS '类型：menu（菜单）/ button（按钮）/ api（接口）';
COMMENT ON COLUMN menus.sort_order IS '排序序号';
COMMENT ON COLUMN menus.is_active IS '是否启用';
COMMENT ON COLUMN menus.hidden IS '是否在侧边栏隐藏';
COMMENT ON COLUMN menus.keep_alive IS '是否缓存';
COMMENT ON COLUMN menus.redirect IS '重定向路径';

CREATE INDEX IF NOT EXISTS idx_menus_parent ON menus (parent_id);
CREATE INDEX IF NOT EXISTS idx_menus_type ON menus (type);
CREATE INDEX IF NOT EXISTS idx_menus_active ON menus (is_active);
CREATE INDEX IF NOT EXISTS idx_menus_permission ON menus (permission);


-- ============================================================
-- 3. 角色-菜单关联表 role_menu
-- ============================================================
CREATE TABLE IF NOT EXISTS role_menu (
    id              BIGSERIAL     PRIMARY KEY,
    role_id         BIGINT        NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    menu_id         BIGINT        NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
    UNIQUE (role_id, menu_id),
    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  role_menu IS '角色-菜单关联表';
COMMENT ON COLUMN role_menu.role_id IS '角色ID';
COMMENT ON COLUMN role_menu.menu_id IS '菜单/权限点ID';


-- ============================================================
-- 4. 用户-角色关联表 user_role
-- ============================================================
CREATE TABLE IF NOT EXISTS user_role (
    id              BIGSERIAL     PRIMARY KEY,
    user_id         INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id         BIGINT        NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    UNIQUE (user_id, role_id),
    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  user_role IS '用户-角色关联表';
COMMENT ON COLUMN user_role.user_id IS '用户ID';
COMMENT ON COLUMN user_role.role_id IS '角色ID';


-- ============================================================
-- 5. 初始化默认角色
-- ============================================================
INSERT INTO roles (code, name, description, sort_order, is_active) VALUES
('admin', '超级管理员', '拥有系统全部权限', 1, true),
('manager', '部门管理员', '拥有部门级管理权限', 2, true),
('viewer', '普通用户', '仅拥有查看权限', 3, true)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active;


-- ============================================================
-- 6. 初始化系统菜单（树形结构）
-- ============================================================

-- 6.1 一级菜单
INSERT INTO menus (parent_id, name, path, component, icon, permission, type, sort_order, is_active, hidden, keep_alive) VALUES
(0, '安全看板', '/dashboard', 'features/dashboard/views/DashboardView.vue', 'Dashboard', 'dashboard:view', 'menu', 1, true, false, true),
(0, '用户管理', '/user', NULL, 'User', 'user:view', 'menu', 2, true, false, false),
(0, '系统管理', '/system', NULL, 'Setting', 'system:view', 'menu', 3, true, false, false),
(0, '告警中心', '/alerts', NULL, 'Bell', 'alert:view', 'menu', 4, true, false, false),
(0, '工作流', '/workflow', NULL, 'Workflow', 'workflow:view', 'menu', 5, true, false, false);


-- 6.2 用户管理子菜单
INSERT INTO menus (parent_id, name, path, component, icon, permission, type, sort_order, is_active, hidden, keep_alive) VALUES
((SELECT id FROM menus WHERE path = '/user' LIMIT 1), '用户列表', '/user/list', 'features/user/views/UserListView.vue', NULL, 'user:list', 'menu', 1, true, false, true),
((SELECT id FROM menus WHERE path = '/user' LIMIT 1), '个人中心', '/user/profile', 'features/user/views/UserProfileView.vue', NULL, 'user:profile', 'menu', 2, true, false, false);


-- 6.3 系统管理子菜单
INSERT INTO menus (parent_id, name, path, component, icon, permission, type, sort_order, is_active, hidden, keep_alive) VALUES
((SELECT id FROM menus WHERE path = '/system' LIMIT 1), '角色管理', '/system/role', 'features/system/views/RoleManageView.vue', NULL, 'system:role', 'menu', 1, true, false, true),
((SELECT id FROM menus WHERE path = '/system' LIMIT 1), '菜单管理', '/system/menu', 'features/system/views/MenuManageView.vue', NULL, 'system:menu', 1, true, false, true),
((SELECT id FROM menus WHERE path = '/system' LIMIT 1), '审计日志', '/system/audit', 'features/audit/views/AuditLogView.vue', NULL, 'audit:view', 'menu', 3, true, false, true),
((SELECT id FROM menus WHERE path = '/system' LIMIT 1), '系统日志', '/system/log', 'features/system/views/SystemLogView.vue', NULL, 'system:log', 'menu', 4, true, false, false);


-- 6.4 告警中心子菜单
INSERT INTO menus (parent_id, name, path, component, icon, permission, type, sort_order, is_active, hidden, keep_alive) VALUES
((SELECT id FROM menus WHERE path = '/alerts' LIMIT 1), '实时告警', '/alerts/center', 'features/alert/views/AlertCenterView.vue', NULL, 'alert:view', 'menu', 1, true, false, true);


-- 6.5 工作流子菜单
INSERT INTO menus (parent_id, name, path, component, icon, permission, type, sort_order, is_active, hidden, keep_alive) VALUES
((SELECT id FROM menus WHERE path = '/workflow' LIMIT 1), '流程列表', '/workflow/list', 'features/workflow/views/WorkflowListView.vue', NULL, 'workflow:list', 'menu', 1, true, false, true),
((SELECT id FROM menus WHERE path = '/workflow' LIMIT 1), '发起流程', '/workflow/create', 'features/workflow/views/WorkflowCreateView.vue', NULL, 'workflow:create', 'menu', 2, true, false, false);


-- ============================================================
-- 7. 初始化按钮级权限点（作为不可见菜单）
-- ============================================================

-- 用户管理按钮权限
INSERT INTO menus (parent_id, name, path, component, icon, permission, type, sort_order, is_active, hidden, keep_alive) VALUES
((SELECT id FROM menus WHERE path = '/user/list' LIMIT 1), '创建用户', NULL, NULL, NULL, 'user:create', 'button', 1, true, true, false),
((SELECT id FROM menus WHERE path = '/user/list' LIMIT 1), '编辑用户', NULL, NULL, NULL, 'user:edit', 'button', 2, true, true, false),
((SELECT id FROM menus WHERE path = '/user/list' LIMIT 1), '删除用户', NULL, NULL, NULL, 'user:delete', 'button', 3, true, true, false),
((SELECT id FROM menus WHERE path = '/user/list' LIMIT 1), '导出用户', NULL, NULL, NULL, 'user:export', 'button', 4, true, true, false),
((SELECT id FROM menus WHERE path = '/user/list' LIMIT 1), '重置密码', NULL, NULL, NULL, 'user:reset-password', 'button', 5, true, true, false);


-- 系统管理按钮权限
INSERT INTO menus (parent_id, name, path, component, icon, permission, type, sort_order, is_active, hidden, keep_alive) VALUES
((SELECT id FROM menus WHERE path = '/system/role' LIMIT 1), '创建角色', NULL, NULL, NULL, 'system:role:create', 'button', 1, true, true, false),
((SELECT id FROM menus WHERE path = '/system/role' LIMIT 1), '编辑角色', NULL, NULL, NULL, 'system:role:edit', 'button', 2, true, true, false),
((SELECT id FROM menus WHERE path = '/system/role' LIMIT 1), '删除角色', NULL, NULL, NULL, 'system:role:delete', 'button', 3, true, true, false),
((SELECT id FROM menus WHERE path = '/system/menu' LIMIT 1), '创建菜单', NULL, NULL, NULL, 'system:menu:create', 'button', 4, true, true, false),
((SELECT id FROM menus WHERE path = '/system/menu' LIMIT 1), '编辑菜单', NULL, NULL, NULL, 'system:menu:edit', 'button', 5, true, true, false),
((SELECT id FROM menus WHERE path = '/system/menu' LIMIT 1), '删除菜单', NULL, NULL, NULL, 'system:menu:delete', 'button', 6, true, true, false),
((SELECT id FROM menus WHERE path = '/system/audit' LIMIT 1), '导出审计日志', NULL, NULL, NULL, 'audit:export', 'button', 7, true, true, false);


-- 告警中心按钮权限
INSERT INTO menus (parent_id, name, path, component, icon, permission, type, sort_order, is_active, hidden, keep_alive) VALUES
((SELECT id FROM menus WHERE path = '/alerts/center' LIMIT 1), '处理告警', NULL, NULL, NULL, 'alert:process', 'button', 1, true, true, false),
((SELECT id FROM menus WHERE path = '/alerts/center' LIMIT 1), '解决告警', NULL, NULL, NULL, 'alert:resolve', 'button', 2, true, true, false),
((SELECT id FROM menus WHERE path = '/alerts/center' LIMIT 1), '导出告警', NULL, NULL, NULL, 'alert:export', 'button', 3, true, true, false);


-- 工作流按钮权限
INSERT INTO menus (parent_id, name, path, component, icon, permission, type, sort_order, is_active, hidden, keep_alive) VALUES
((SELECT id FROM menus WHERE path = '/workflow/list' LIMIT 1), '审批通过', NULL, NULL, NULL, 'workflow:approve', 'button', 1, true, true, false),
((SELECT id FROM menus WHERE path = '/workflow/list' LIMIT 1), '审批拒绝', NULL, NULL, NULL, 'workflow:reject', 'button', 2, true, true, false),
((SELECT id FROM menus WHERE path = '/workflow/list' LIMIT 1), '撤回流程', NULL, NULL, NULL, 'workflow:withdraw', 'button', 3, true, true, false);


-- ============================================================
-- 8. 为 admin 角色分配所有权限
-- ============================================================
INSERT INTO role_menu (role_id, menu_id)
SELECT r.id, m.id
FROM roles r
CROSS JOIN menus m
WHERE r.code = 'admin'
ON CONFLICT (role_id, menu_id) DO NOTHING;


-- ============================================================
-- 9. 为 manager 角色分配常用权限
-- ============================================================
INSERT INTO role_menu (role_id, menu_id)
SELECT r.id, m.id
FROM roles r
JOIN menus m ON m.permission IN (
    'dashboard:view',
    'user:view', 'user:list', 'user:create', 'user:edit',
    'audit:view',
    'alert:view', 'alert:process', 'alert:resolve',
    'workflow:view', 'workflow:list', 'workflow:create',
    'system:view', 'system:log'
)
WHERE r.code = 'manager'
ON CONFLICT (role_id, menu_id) DO NOTHING;


-- ============================================================
-- 10. 为 viewer 角色分配只读权限
-- ============================================================
INSERT INTO role_menu (role_id, menu_id)
SELECT r.id, m.id
FROM roles r
JOIN menus m ON m.permission IN (
    'dashboard:view',
    'user:view', 'user:profile',
    'audit:view',
    'alert:view'
)
WHERE r.code = 'viewer'
ON CONFLICT (role_id, menu_id) DO NOTHING;


-- ============================================================
-- 11. 将现有 users 表中的 role 字段同步到 user_role 表
-- ============================================================
INSERT INTO user_role (user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN roles r ON u.role = r.code
ON CONFLICT (user_id, role_id) DO NOTHING;


-- ============================================================
-- 12. 验证
-- ============================================================
DO $$
DECLARE
    tbl TEXT;
    cnt INTEGER;
BEGIN
    RAISE NOTICE '========== RBAC Schema 验证 ==========';
    RAISE NOTICE '';
    RAISE NOTICE '--- 角色表 ---';
    FOR tbl IN SELECT 'roles' UNION SELECT 'menus' UNION SELECT 'role_menu' UNION SELECT 'user_role' LOOP
        EXECUTE format('SELECT count(*) FROM %I', tbl) INTO cnt;
        RAISE NOTICE '  % : % 条记录', tbl, cnt;
    END LOOP;
    RAISE NOTICE '';
    RAISE NOTICE '--- 默认角色权限 ---';
    RAISE NOTICE '  admin 权限数: %', (SELECT count(*) FROM role_menu rm JOIN roles r ON rm.role_id = r.id WHERE r.code = 'admin');
    RAISE NOTICE '  manager 权限数: %', (SELECT count(*) FROM role_menu rm JOIN roles r ON rm.role_id = r.id WHERE r.code = 'manager');
    RAISE NOTICE '  viewer 权限数: %', (SELECT count(*) FROM role_menu rm JOIN roles r ON rm.role_id = r.id WHERE r.code = 'viewer');
    RAISE NOTICE '';
    RAISE NOTICE '======================================';
END $$;

-- ============================================================
-- END OF migrate_rbac.sql
-- ============================================================
