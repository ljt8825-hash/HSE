-- =====================================================================
-- 培训记录页面改造（按培训人员汇总）迁移脚本
-- 变更点：
--   1) training_records.trainer_id 作为「培训人员(培训讲师)」员工外键（已有列，补索引）
--   2) 回填：按 trainer 姓名与员工档案唯一存活匹配，写 trainer_id
--   3) 新建视图 v_training_personnel：培训人员清单（岗位/部门口径）
-- 幂等：全部为 IF NOT EXISTS / IF EXISTS，可重复执行。
-- =====================================================================

-- 1. trainer_id 索引（用于按培训人员按月度统计实际培训人数）
CREATE INDEX IF NOT EXISTS idx_training_records_trainer
  ON training_records (trainer_id);

-- 2. 回填 trainer_id：trainer 姓名与 v_employee_org_full 唯一存活匹配时落键
--    （重名 / 未匹配不做回填，保留 NULL）
UPDATE training_records tr
SET trainer_id = sub.employee_id,
    updated_at = CURRENT_TIMESTAMP
FROM (
  SELECT tr2.id,
         (SELECT e.employee_id
            FROM v_employee_org_full e
           WHERE e.name = tr2.trainer
             AND e.is_deleted = false AND e.is_current = true
           GROUP BY e.employee_id
           HAVING COUNT(*) = 1) AS employee_id
  FROM training_records tr2
  WHERE tr2.is_deleted = false
    AND tr2.trainer IS NOT NULL
    AND tr2.trainer <> ''
    AND tr2.trainer_id IS NULL
) sub
WHERE tr.id = sub.id AND sub.employee_id IS NOT NULL;

-- 3. 培训人员清单视图：岗位口径 + 职能部门口径
CREATE OR REPLACE VIEW v_training_personnel AS
SELECT e.employee_id AS id,
       e.name,
       e.employee_code,
       e.position_name,
       e.org_unit_id,
       e.org_name   AS dept_name,
       e.org_type,
       e.org_path,
       e.supervisor_id,
       e.supervisor_name
FROM v_employee_org_full e
WHERE e.is_deleted = false AND e.is_current = true
  AND (e.position_name IN ('乡镇作业中心经理','管理员','环卫作业中心片区长','网格长')
       OR e.org_type = 'department');