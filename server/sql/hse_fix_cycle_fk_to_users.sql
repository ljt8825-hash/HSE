-- ============================================================
-- 月度安全履职考核 - 考核周期外键修复脚本
-- 日期：2026-08-27
-- 问题：hse_fk_phase2_assessment_events.sql(2026-07-30) 将
--       hse_assessment_cycle.created_by / frozen_by 外键指向 employee(id)，
--       但模块代码（server/routes/hse-assessment-monthly.js）始终写入
--       系统用户 ID（users.id）。users 与 employee 为两套独立 ID 序列，
--       无对应关系 → 创建/冻结考核周期必然违反外键 → HTTP 500「创建考核周期失败」。
-- 修复：将两处外键改指 users(id)，与代码语义一致（操作者为系统账号）。
-- 幂等：可安全重复执行。
-- ============================================================

BEGIN;

-- 1. 清理孤儿（users 表中不存在的 created_by/frozen_by 置 NULL）
UPDATE hse_assessment_cycle SET created_by = NULL
 WHERE created_by IS NOT NULL AND created_by NOT IN (SELECT id FROM users);

UPDATE hse_assessment_cycle SET frozen_by = NULL
 WHERE frozen_by IS NOT NULL AND frozen_by NOT IN (SELECT id FROM users);

-- 2. 重建外键，指向 users(id)
ALTER TABLE hse_assessment_cycle
  DROP CONSTRAINT IF EXISTS fk_assessment_cycle_created_by;
ALTER TABLE hse_assessment_cycle
  DROP CONSTRAINT IF EXISTS fk_assessment_cycle_frozen_by;

ALTER TABLE hse_assessment_cycle
  ADD CONSTRAINT fk_assessment_cycle_created_by
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE hse_assessment_cycle
  ADD CONSTRAINT fk_assessment_cycle_frozen_by
    FOREIGN KEY (frozen_by) REFERENCES users(id) ON DELETE SET NULL;

COMMIT;

-- 验证：
-- SELECT conname, confrelid::regclass
--   FROM pg_constraint
--  WHERE conname IN ('fk_assessment_cycle_created_by','fk_assessment_cycle_frozen_by');
