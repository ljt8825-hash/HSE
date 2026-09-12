-- ============================================================
-- sys_operation_log 审计日志表
-- 用于记录系统操作日志（登录/增删改查/导入导出等）
-- ============================================================

CREATE TABLE IF NOT EXISTS sys_operation_log (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL,
  username      VARCHAR(100) NOT NULL DEFAULT '',
  action        VARCHAR(50) NOT NULL DEFAULT '',
  module        VARCHAR(100) NOT NULL DEFAULT 'system',
  description   TEXT,
  ip_address    VARCHAR(50),
  user_agent    VARCHAR(500),
  status_code   INTEGER DEFAULT 200,
  detail        JSONB,
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_operation_log_user_id ON sys_operation_log(user_id);
CREATE INDEX IF NOT EXISTS idx_operation_log_module ON sys_operation_log(module);
CREATE INDEX IF NOT EXISTS idx_operation_log_action ON sys_operation_log(action);
CREATE INDEX IF NOT EXISTS idx_operation_log_created_at ON sys_operation_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operation_log_user_action ON sys_operation_log(user_id, action);

-- 表注释
COMMENT ON TABLE sys_operation_log IS '系统操作审计日志表';
COMMENT ON COLUMN sys_operation_log.user_id IS '操作人ID';
COMMENT ON COLUMN sys_operation_log.username IS '操作人用户名';
COMMENT ON COLUMN sys_operation_log.action IS '操作类型(login/create/update/delete/export/import等)';
COMMENT ON COLUMN sys_operation_log.module IS '业务模块(auth/users/vehicles/accidents/hazards等)';
COMMENT ON COLUMN sys_operation_log.description IS '操作描述';
COMMENT ON COLUMN sys_operation_log.detail IS '操作详情(JSON格式)';
