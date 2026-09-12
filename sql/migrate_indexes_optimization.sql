-- ============================================================
-- 宁津环卫 HSE 安全管理系统 — 数据库性能优化索引脚本
-- 说明: 针对高频查询字段建立索引，提升查询性能
-- 建议: 在生产环境低峰期执行，注意观察磁盘空间和锁等待
-- ============================================================

BEGIN;

-- ============================================================
-- 1. 用户表 (users)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);
CREATE INDEX IF NOT EXISTS idx_users_dept_id ON users (dept_id);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at DESC);

-- 全文搜索索引 (用户名 + 真实姓名)
CREATE INDEX IF NOT EXISTS idx_users_search ON users
USING gin ((username || ' ' || COALESCE(real_name, '')) gin_trgm_ops);

-- ============================================================
-- 2. 角色表 (roles) / 用户角色关联表 (user_roles)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles (role_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_user_role ON user_roles (user_id, role_id);

CREATE INDEX IF NOT EXISTS idx_roles_code ON roles (code);
CREATE INDEX IF NOT EXISTS idx_roles_is_active ON roles (is_active);

-- ============================================================
-- 3. 菜单表 (menus) / 角色菜单表 (role_menus)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_menus_parent_id ON menus (parent_id);
CREATE INDEX IF NOT EXISTS idx_menus_sort_order ON menus (sort_order);
CREATE INDEX IF NOT EXISTS idx_menus_is_active ON menus (is_active);

CREATE INDEX IF NOT EXISTS idx_role_menus_role_id ON role_menus (role_id);
CREATE INDEX IF NOT EXISTS idx_role_menus_menu_id ON role_menus (menu_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_role_menus_role_menu ON role_menus (role_id, menu_id);

-- ============================================================
-- 4. 告警表 (alerts)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts (status);
CREATE INDEX IF NOT EXISTS idx_alerts_level ON alerts (level);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts (type);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_resolved_at ON alerts (resolved_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_source ON alerts (source);

-- 复合索引: 按状态 + 时间筛选 (最高频查询)
CREATE INDEX IF NOT EXISTS idx_alerts_status_created_at ON alerts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_level_created_at ON alerts (level, created_at DESC);

-- ============================================================
-- 5. 审计日志表 (audit_logs)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON audit_logs (module);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address ON audit_logs (ip_address);

-- 复合索引: 按模块 + 时间筛选
CREATE INDEX IF NOT EXISTS idx_audit_logs_module_created_at ON audit_logs (module, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created_at ON audit_logs (user_id, created_at DESC);

-- ============================================================
-- 6. 工作流表 (workflows / workflow_instances / workflow_tasks / workflow_history)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_workflows_code ON workflows (code);
CREATE INDEX IF NOT EXISTS idx_workflows_is_active ON workflows (is_active);
CREATE INDEX IF NOT EXISTS idx_workflows_sort_order ON workflows (sort_order);

CREATE INDEX IF NOT EXISTS idx_wf_instances_workflow_id ON workflow_instances (workflow_id);
CREATE INDEX IF NOT EXISTS idx_wf_instances_initiator_id ON workflow_instances (initiator_id);
CREATE INDEX IF NOT EXISTS idx_wf_instances_status ON workflow_instances (status);
CREATE INDEX IF NOT EXISTS idx_wf_instances_current_node ON workflow_instances (current_node);
CREATE INDEX IF NOT EXISTS idx_wf_instances_created_at ON workflow_instances (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wf_instances_business_key ON workflow_instances (business_key);

-- 复合索引: 发起人 + 状态 (我的待办/已办高频查询)
CREATE INDEX IF NOT EXISTS idx_wf_instances_initiator_status ON workflow_instances (initiator_id, status);

CREATE INDEX IF NOT EXISTS idx_wf_tasks_instance_id ON workflow_tasks (instance_id);
CREATE INDEX IF NOT EXISTS idx_wf_tasks_assignee_id ON workflow_tasks (assignee_id);
CREATE INDEX IF NOT EXISTS idx_wf_tasks_status ON workflow_tasks (status);
CREATE INDEX IF NOT EXISTS idx_wf_tasks_task_code ON workflow_tasks (task_code);
CREATE INDEX IF NOT EXISTS idx_wf_tasks_created_at ON workflow_tasks (created_at DESC);

-- 复合索引: 待办任务查询 (审批人 + 状态)
CREATE INDEX IF NOT EXISTS idx_wf_tasks_assignee_status ON workflow_tasks (assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_wf_tasks_assignee_created ON workflow_tasks (assignee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wf_history_instance_id ON workflow_history (instance_id);
CREATE INDEX IF NOT EXISTS idx_wf_history_operator_id ON workflow_history (operator_id);
CREATE INDEX IF NOT EXISTS idx_wf_history_created_at ON workflow_history (created_at DESC);

-- ============================================================
-- 7. 通知表 (notifications)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications (is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications (type);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at DESC);

-- 复合索引: 用户未读消息查询 (最高频)
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications (user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at DESC);

-- ============================================================
-- 8. 隐患排查表 (hazards) — 如已存在
-- ============================================================
-- 注意: 以下索引针对隐患/事故/培训等业务表，若表名不同请自行调整
-- 可通过 SELECT * FROM information_schema.tables WHERE table_schema='public' 确认表名

-- 隐患表 (示例，根据实际表名调整)
-- CREATE INDEX IF NOT EXISTS idx_hazards_status ON hazards (status);
-- CREATE INDEX IF NOT EXISTS idx_hazards_level ON hazards (level);
-- CREATE INDEX IF NOT EXISTS idx_hazards_created_at ON hazards (created_at DESC);
-- CREATE INDEX IF NOT EXISTS idx_hazards_dept_id ON hazards (dept_id);
-- CREATE INDEX IF NOT EXISTS idx_hazards_location ON hazards (location);
-- CREATE INDEX IF NOT EXISTS idx_hazards_reporter_id ON hazards (reporter_id);

-- 事故表 (示例)
-- CREATE INDEX IF NOT EXISTS idx_accidents_status ON accidents (status);
-- CREATE INDEX IF NOT EXISTS idx_accidents_level ON accidents (accident_level);
-- CREATE INDEX IF NOT EXISTS idx_accidents_date ON accidents (accident_date DESC);
-- CREATE INDEX IF NOT EXISTS idx_accidents_dept_id ON accidents (dept_id);

-- 培训表 (示例)
-- CREATE INDEX IF NOT EXISTS idx_training_status ON training_records (status);
-- CREATE INDEX IF NOT EXISTS idx_training_user_id ON training_records (user_id);
-- CREATE INDEX IF NOT EXISTS idx_training_date ON training_records (training_date DESC);

-- ============================================================
-- 9. 文件记录表 (file_records) — 如已存在
-- ============================================================
-- CREATE INDEX IF NOT EXISTS idx_file_records_biz_type ON file_records (biz_type);
-- CREATE INDEX IF NOT EXISTS idx_file_records_biz_id ON file_records (biz_id);
-- CREATE INDEX IF NOT EXISTS idx_file_records_uploaded_by ON file_records (uploaded_by);
-- CREATE INDEX IF NOT EXISTS idx_file_records_created_at ON file_records (created_at DESC);

COMMIT;

-- ============================================================
-- 索引使用情况监控建议
-- ============================================================
-- 查看索引使用情况:
-- SELECT
--   schemaname, tablename, indexname,
--   idx_scan, idx_tup_read, idx_tup_fetch,
--   pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
-- FROM pg_stat_user_indexes
-- JOIN pg_indexes ON indexrelname = indexname
-- ORDER BY idx_scan ASC;
--
-- 未使用或低效索引建议清理 (idx_scan = 0 的索引)
-- 注意: 低使用率索引可能是月度/季度报表使用，谨慎删除
--
-- 表膨胀监控:
-- SELECT
--   schemaname, tablename,
--   n_live_tup, n_dead_tup,
--   ROUND(n_dead_tup::numeric / NULLIF(n_live_tup, 0) * 100, 2) AS dead_ratio
-- FROM pg_stat_user_tables
-- WHERE n_live_tup > 1000
-- ORDER BY dead_ratio DESC;
-- ============================================================
