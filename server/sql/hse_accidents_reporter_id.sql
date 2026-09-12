-- ============================================================
-- 迁移：accidents 表新增 reporter_id 列
-- 日期：2026-07-30
-- 编号：R1-Phase2-01
-- 类型：DDL（新增列 + FK + 索引）
-- 说明：
--   将事故「报告人(reporter)」从纯文本上报升级为花名册关联员工 ID。
--   注：经核验，accidents 表当前【不存在】reporter 文本列（历史数据
--       中 reporter 实际复用 handler 文本兜底），故本次仅新增 reporter_id
--       关联列；报告人姓名通过前端 EmployeeName(reporterId) 运行时解析，
--       无需单独文本列。
--   完全幂等，可安全重复执行。
-- ============================================================

-- 步骤 1：新增列（可空，兼容历史数据）
ALTER TABLE accidents
  ADD COLUMN IF NOT EXISTS reporter_id INTEGER;

-- 步骤 2：外键约束（关联 employee.id，删除员工时置 NULL）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_accidents_reporter_employee'
  ) THEN
    ALTER TABLE accidents
      ADD CONSTRAINT fk_accidents_reporter_employee
      FOREIGN KEY (reporter_id) REFERENCES employee(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 步骤 3：索引（加速按报告人筛选）
CREATE INDEX IF NOT EXISTS idx_accidents_reporter_id
  ON accidents(reporter_id);

-- 步骤 4：验证
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'accidents'
  AND column_name = 'reporter_id';

SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname = 'fk_accidents_reporter_employee';
