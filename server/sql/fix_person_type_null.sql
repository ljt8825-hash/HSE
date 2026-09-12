-- fix_person_type_null.sql
-- 任务2 (提示词-82 D3): 推断并补全 person_type 为空的员工
-- 幂等: 仅更新 is_deleted=false 且 person_type IS NULL 的员工
--
-- 复用 提示词-82 给出的 inferPersonType() 分类规则(4 类, 与后端 VALID_PERSON_TYPES 一致):
--   包含 管理/经理/区长/班长            -> 管理人员
--   包含 安全/专员/会计/人事            -> 技术人员
--   包含 保洁/司机/驾驶员/中转站/挂桶  -> 生产人员
--   其他                               -> 辅助人员
--
-- 信号源优先级(employee_assignment 无 raw_dept/raw_position 列, 故改用更可靠的信号):
--   1) 当前任职 position_id 对应的 position.name (最可靠)
--   2) employee_import_pending.raw_position (最新非空)
--   3) employee_import_pending.raw_dept    (最新非空)
--   4) 均无 -> 辅助人员
--
-- 已知规范缺口(非本次引入, 已记录于报告):
--   规范关键词未含"主管", 故 乡镇主管/行政综合主管/作业质量管理主管 等会落入"辅助人员";
--   其余关键词覆盖完整。是否将"主管"纳入管理人员需后续代码侧确认。

WITH emp_signal AS (
  SELECT e.id AS emp_id,
         COALESCE(
           (SELECT p.name
              FROM employee_assignment a2
              JOIN position p ON p.id = a2.position_id
             WHERE a2.employee_id = e.id
               AND a2.is_current = true AND a2.is_deleted = false
               AND a2.position_id IS NOT NULL
             LIMIT 1),
           (SELECT MAX(pnd.raw_position)
              FROM employee_import_pending pnd
             WHERE pnd.employee_no = e.employee_code
               AND pnd.raw_position IS NOT NULL AND pnd.raw_position <> ''),
           (SELECT MAX(pnd.raw_dept)
              FROM employee_import_pending pnd
             WHERE pnd.employee_no = e.employee_code
               AND pnd.raw_dept IS NOT NULL AND pnd.raw_dept <> '')
         ) AS sig
  FROM employee e
  WHERE e.is_deleted = false AND e.person_type IS NULL
)
UPDATE employee e
SET person_type = CASE
  WHEN sig IS NULL OR sig = '' THEN '辅助人员'
  WHEN sig LIKE '%管理%' OR sig LIKE '%经理%' OR sig LIKE '%区长%' OR sig LIKE '%班长%' THEN '管理人员'
  WHEN sig LIKE '%安全%' OR sig LIKE '%专员%' OR sig LIKE '%会计%' OR sig LIKE '%人事%' THEN '技术人员'
  WHEN sig LIKE '%保洁%' OR sig LIKE '%司机%' OR sig LIKE '%驾驶员%' OR sig LIKE '%中转站%' OR sig LIKE '%挂桶%' THEN '生产人员'
  ELSE '辅助人员'
END
FROM emp_signal s
WHERE e.id = s.emp_id
  AND e.is_deleted = false
  AND e.person_type IS NULL;
