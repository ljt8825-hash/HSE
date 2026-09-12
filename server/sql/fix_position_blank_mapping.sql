-- fix_position_blank_mapping.sql
-- 任务: 花名册导入后部分人员职位(岗位)为空 的根因修复
--
-- 根因:
--   v_employee_current 视图以 LEFT JOIN position p ON p.id= employee_assignment.position_id
--   AND p.is_deleted=false 取职位名。部分员工被指派到已被软删的岗位 1389「安环副经理」，
--   join 不上 → position_name 为 NULL → 前端 "人员管理"列表/档案 职位显示为空。
--   而导入匹配优先命中 employee_position_mapping_rule，其中 安环专员/安全管理员/
--   作业质量管理主管 3 条规则把目标指向了软删的 1389，导致新导入员工落位到空职位岗位。
--
-- 修复口径(业务确认, 同名映射):
--   安环专员        -> 1390 安环专员
--   作业质量管理主管 -> 1413 作业质量管理主管
--   人力综合部经理   -> 1409 人力综合部经理
--   标准化专员      -> 1414 标准化专员
--   行政综合主管    -> 1406 行政综合主管
--   3 名受影响员工任职改指到上述同名活跃岗位。
--
-- 幂等: 以 id 精确更新; 同一条规则/任职重复执行结果不变。
-- 备份: dbbackup/fix_position_blank_backup_*.txt

BEGIN;

-- ============ 1. 修正映射规则为同名岗位 ============
UPDATE employee_position_mapping_rule
SET target_position_id = 1390, target_position_name = '安环专员', match_priority = 1, updated_at = CURRENT_TIMESTAMP
WHERE id = 25 AND source_position = '安环专员';

UPDATE employee_position_mapping_rule
SET target_position_id = 1413, target_position_name = '作业质量管理主管', match_priority = 1, updated_at = CURRENT_TIMESTAMP
WHERE id = 36 AND source_position = '作业质量管理主管';

UPDATE employee_position_mapping_rule
SET target_position_id = 1409, target_position_name = '人力综合部经理', match_priority = 1, updated_at = CURRENT_TIMESTAMP
WHERE id = 30 AND source_position = '人力综合部经理';

UPDATE employee_position_mapping_rule
SET target_position_id = 1414, target_position_name = '标准化专员', match_priority = 1, updated_at = CURRENT_TIMESTAMP
WHERE id = 32 AND source_position = '标准化专员';

UPDATE employee_position_mapping_rule
SET target_position_id = 1406, target_position_name = '行政综合主管', match_priority = 1, updated_at = CURRENT_TIMESTAMP
WHERE id = 35 AND source_position = '行政综合主管';

-- ============ 2. 修正 3 名受影响员工当前任职岗位 ============
-- 安环专员(孟祥宇/李真真) -> 1390 安环专员; 作业质量管理主管(于鑫宁) -> 1413 作业质量管理主管
UPDATE employee_assignment a
SET position_id = 1390, updated_at = CURRENT_TIMESTAMP
FROM employee e
WHERE a.employee_id = e.id AND e.name = '孟祥宇'
  AND a.is_current = true AND a.is_deleted = false AND a.position_id = 1389;

UPDATE employee_assignment a
SET position_id = 1390, updated_at = CURRENT_TIMESTAMP
FROM employee e
WHERE a.employee_id = e.id AND e.name = '李真真'
  AND a.is_current = true AND a.is_deleted = false AND a.position_id = 1389;

UPDATE employee_assignment a
SET position_id = 1413, updated_at = CURRENT_TIMESTAMP
FROM employee e
WHERE a.employee_id = e.id AND e.name = '于鑫宁'
  AND a.is_current = true AND a.is_deleted = false AND a.position_id = 1389;

COMMIT;