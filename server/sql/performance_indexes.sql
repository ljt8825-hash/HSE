-- ============================================================
-- HSE 安全管理系统 - 性能索引脚本
-- 为高频查询创建复合索引，提升查询性能
-- 使用 IF NOT EXISTS 保证幂等执行
-- 创建时间: 2026-07-10
-- ============================================================

-- ============================================================
-- 1. hazards（隐患）表索引
-- ============================================================

-- 按状态+创建时间复合索引：用于按状态筛选并按时间排序的列表查询
CREATE INDEX IF NOT EXISTS idx_hazards_status_created_at
  ON hazards (status, created_at DESC);

-- 按等级+状态复合索引：用于隐患等级统计和按等级筛选
CREATE INDEX IF NOT EXISTS idx_hazards_level_status
  ON hazards (level, status);

-- 按区域+状态复合索引：用于按区域统计隐患
CREATE INDEX IF NOT EXISTS idx_hazards_area_status
  ON hazards (area, status);

-- 按创建时间索引：用于时间范围查询
CREATE INDEX IF NOT EXISTS idx_hazards_created_at
  ON hazards (created_at DESC);

-- ============================================================
-- 2. accidents（事故）表索引
-- ============================================================

-- 按状态+发生时间复合索引：用于事故列表筛选和时间排序
CREATE INDEX IF NOT EXISTS idx_accidents_status_occurred_at
  ON accidents (status, occurred_at DESC);

-- 按事故类型+状态复合索引：用于按类型统计和筛选
CREATE INDEX IF NOT EXISTS idx_accidents_type_status
  ON accidents (accident_type, status);

-- 按严重程度+状态复合索引：用于事故严重程度统计
CREATE INDEX IF NOT EXISTS idx_accidents_severity_status
  ON accidents (severity, status);

-- 按区域+状态复合索引：用于区域事故统计
CREATE INDEX IF NOT EXISTS idx_accidents_area_status
  ON accidents (area, status);

-- ============================================================
-- 3. audit_logs（审计日志）表索引
-- ============================================================

-- 按创建时间+模块复合索引：用于按时间范围和模块筛选审计日志
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at_module
  ON audit_logs (created_at DESC, module);

-- 按用户+时间索引：用于查询特定用户的操作记录
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created_at
  ON audit_logs (user_id, created_at DESC);

-- 按操作类型索引：用于统计操作类型分布
CREATE INDEX IF NOT EXISTS idx_audit_logs_action
  ON audit_logs (action);

-- ============================================================
-- 4. login_attempts（登录尝试）表索引
-- ============================================================

-- 按用户名+尝试时间复合索引：用于登录安全分析（暴力破解检测）
CREATE INDEX IF NOT EXISTS idx_login_attempts_username_time
  ON login_attempts (username, attempt_time DESC);

-- 按尝试时间+是否成功索引：用于统计登录失败趋势
CREATE INDEX IF NOT EXISTS idx_login_attempts_time_success
  ON login_attempts (attempt_time DESC, success);

-- 按IP地址+时间索引：用于IP封禁分析
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time
  ON login_attempts (ip_address, attempt_time DESC);

-- ============================================================
-- 5. notifications（通知）表索引
-- ============================================================

-- 按用户+是否已读复合索引：用于查询用户未读通知
CREATE INDEX IF NOT EXISTS idx_notifications_user_read
  ON notifications (user_id, is_read);

-- 按创建时间索引：用于按时间排序通知列表
CREATE INDEX IF NOT EXISTS idx_notifications_created_at
  ON notifications (created_at DESC);

-- 按类型+已读索引：用于按类型统计通知
CREATE INDEX IF NOT EXISTS idx_notifications_type_read
  ON notifications (type, is_read);

-- ============================================================
-- 6. dashboard 趋势查询相关索引
-- ============================================================

-- 隐患月度统计索引：按创建时间的年月分组
CREATE INDEX IF NOT EXISTS idx_hazards_created_month
  ON hazards (date_trunc('month', created_at));

-- 事故月度统计索引：按发生时间的年月分组
CREATE INDEX IF NOT EXISTS idx_accidents_occurred_month
  ON accidents (date_trunc('month', occurred_at));

-- 隐患整改完成率统计：按整改截止日期
CREATE INDEX IF NOT EXISTS idx_hazards_deadline_status
  ON hazards (rectification_deadline, status);

-- 培训统计索引：按培训日期
CREATE INDEX IF NOT EXISTS idx_training_records_training_date
  ON training_records (training_date DESC);

-- 车辆安全检查索引：按检查日期+状态
CREATE INDEX IF NOT EXISTS idx_vehicles_check_date_status
  ON vehicles (last_check_date, status);

-- ============================================================
-- 7. 其他高频查询优化索引
-- ============================================================

-- 工作流状态索引：用于工作流列表筛选
CREATE INDEX IF NOT EXISTS idx_workflow_status_created_at
  ON workflow_instances (status, created_at DESC);

-- 文件记录索引：按创建时间
CREATE INDEX IF NOT EXISTS idx_file_records_created_at
  ON file_records (created_at DESC);

-- 保险理赔索引：按状态+提交时间
CREATE INDEX IF NOT EXISTS idx_insurance_status_submitted_at
  ON insurance_claims (status, submitted_at DESC);

-- ============================================================
-- 完成
-- ============================================================
-- 可通过以下命令验证索引创建情况：
--   SELECT indexname, indexdef FROM pg_indexes
--   WHERE schemaname = 'public'
--   ORDER BY indexname;
-- ============================================================
