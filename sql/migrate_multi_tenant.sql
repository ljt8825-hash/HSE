-- ============================================================
-- 多租户支持 — 数据库迁移脚本
-- 说明: 为核心表增加 tenant_id 字段，默认值为 1（默认租户）
-- 注意: 生产环境请谨慎执行，建议在低峰期执行并备份
-- ============================================================

BEGIN;

-- 1. 创建租户表 (可选，如需要完整多租户)
CREATE TABLE IF NOT EXISTS tenants (
    id              BIGSERIAL      PRIMARY KEY,
    code            VARCHAR(50)    UNIQUE NOT NULL,
    name            VARCHAR(100)   NOT NULL,
    status          VARCHAR(20)    NOT NULL DEFAULT 'active',
    config          JSONB,
    created_at      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 插入默认租户
INSERT INTO tenants (id, code, name, status)
VALUES (1, 'default', '默认租户', 'active')
ON CONFLICT (id) DO NOTHING;

-- 设置自增起始值
SELECT setval('tenants_id_seq', GREATEST((SELECT MAX(id) FROM tenants), 1));

-- ============================================================
-- 2. 为核心表添加 tenant_id 字段
-- ============================================================

-- 用户表
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'users' AND column_name = 'tenant_id') THEN
        ALTER TABLE users ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 1;
        ALTER TABLE users ADD CONSTRAINT fk_users_tenant
            FOREIGN KEY (tenant_id) REFERENCES tenants(id);
    END IF;
END $$;

-- 角色表
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'roles' AND column_name = 'tenant_id') THEN
        ALTER TABLE roles ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 1;
        ALTER TABLE roles ADD CONSTRAINT fk_roles_tenant
            FOREIGN KEY (tenant_id) REFERENCES tenants(id);
    END IF;
END $$;

-- 菜单表 (通常全局共享，可不加租户)
-- DO $$
-- BEGIN
--     IF NOT EXISTS (SELECT 1 FROM information_schema.columns
--                    WHERE table_name = 'menus' AND column_name = 'tenant_id') THEN
--         ALTER TABLE menus ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 1;
--     END IF;
-- END $$;

-- 用户角色关联表
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'user_roles' AND column_name = 'tenant_id') THEN
        ALTER TABLE user_roles ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 1;
    END IF;
END $$;

-- 告警表
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'alerts' AND column_name = 'tenant_id') THEN
        ALTER TABLE alerts ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 1;
        ALTER TABLE alerts ADD CONSTRAINT fk_alerts_tenant
            FOREIGN KEY (tenant_id) REFERENCES tenants(id);
    END IF;
END $$;

-- 审计日志表
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'audit_logs' AND column_name = 'tenant_id') THEN
        ALTER TABLE audit_logs ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 1;
    END IF;
END $$;

-- 工作流定义表
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'workflows' AND column_name = 'tenant_id') THEN
        ALTER TABLE workflows ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 1;
    END IF;
END $$;

-- 工作流实例表
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'workflow_instances' AND column_name = 'tenant_id') THEN
        ALTER TABLE workflow_instances ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 1;
    END IF;
END $$;

-- 工作流任务表
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'workflow_tasks' AND column_name = 'tenant_id') THEN
        ALTER TABLE workflow_tasks ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 1;
    END IF;
END $$;

-- 工作流历史表
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'workflow_history' AND column_name = 'tenant_id') THEN
        ALTER TABLE workflow_history ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 1;
    END IF;
END $$;

-- 通知表
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'notifications' AND column_name = 'tenant_id') THEN
        ALTER TABLE notifications ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 1;
    END IF;
END $$;

-- ============================================================
-- 3. 更新索引 (添加 tenant_id 前缀)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users (tenant_id);
CREATE INDEX IF NOT EXISTS idx_roles_tenant_id ON roles (tenant_id);
CREATE INDEX IF NOT EXISTS idx_alerts_tenant_status ON alerts (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_alerts_tenant_created ON alerts (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_module ON audit_logs (tenant_id, module, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wf_inst_tenant_status ON workflow_instances (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_wf_tasks_tenant_assignee ON workflow_tasks (tenant_id, assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_user ON notifications (tenant_id, user_id, is_read);

COMMIT;

-- ============================================================
-- 多租户使用说明:
--
-- 1. 默认开启: 环境变量 MULTI_TENANT_ENABLED=true
-- 2. 单租户模式: MULTI_TENANT_ENABLED=false (默认，向后兼容)
-- 3. 开启多租户后:
--    - 用户登录后 tenant_id 写入 JWT
--    - 所有查询自动添加 tenant_id 过滤 (通过 TenantMiddleware)
--    - 创建新数据时自动带上 tenant_id
-- 4. 切换租户: 需要超级管理员权限，可跨租户操作
--
-- 回滚方案:
--   设置 MULTI_TENANT_ENABLED=false 即可退化为单租户模式
--   所有数据默认 tenant_id=1，不影响现有数据
-- ============================================================
