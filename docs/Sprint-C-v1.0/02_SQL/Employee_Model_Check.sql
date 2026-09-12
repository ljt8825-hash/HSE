-- ============================================================================
-- Sprint-C Step 7：人员中心数据完整性巡检脚本
-- 版本: v1.0
-- 日期: 2026-07-28
-- 目标: 每日检查 employee_assignment 数据完整性
-- 用途: 可配置为定时任务（cron）每日执行
-- 输出: 巡检结果报告（Markdown 格式）
-- ============================================================================

-- ============================================================
-- 巡检项 1：孤儿 employee（有 assignment 记录但 employee 主记录不存在）
-- ============================================================

SELECT 
  'ORPHAN_EMPLOYEE' AS check_type,
  COUNT(*) AS issue_count,
  '有 assignment 记录但 employee 主记录不存在的数量' AS description
FROM employee_assignment ea
LEFT JOIN employee e ON ea.employee_id = e.id
WHERE ea.is_deleted = false 
  AND e.id IS NULL;

-- 详情查询（仅在有问题时执行）
-- SELECT ea.* FROM employee_assignment ea
-- LEFT JOIN employee e ON ea.employee_id = e.id
-- WHERE ea.is_deleted = false AND e.id IS NULL;

-- ============================================================
-- 巡检项 2：孤儿 position（assignment 引用的 position 不存在）
-- ============================================================

SELECT 
  'ORPHAN_POSITION' AS check_type,
  COUNT(*) AS issue_count,
  'assignment 引用的 position 不存在或已删除的数量' AS description
FROM employee_assignment ea
LEFT JOIN position p ON ea.position_id = p.id AND p.is_deleted = false
WHERE ea.is_deleted = false 
  AND ea.position_id IS NOT NULL 
  AND p.id IS NULL;

-- ============================================================
-- 巡检项 3：孤儿 org_unit（assignment 引用的 org_unit 不存在）
-- ============================================================

SELECT 
  'ORPHAN_ORG_UNIT' AS check_type,
  COUNT(*) AS issue_count,
  'assignment 引用的 hse_org_unit 不存在的数量' AS description
FROM employee_assignment ea
LEFT JOIN hse_org_unit ou ON ea.org_unit_id = ou.id
WHERE ea.is_deleted = false 
  AND ea.org_unit_id IS NOT NULL 
  AND ou.id IS NULL;

-- ============================================================
-- 巡检项 4：重复当前关系（同一员工 is_current=true 有多条记录）
-- ============================================================

SELECT 
  'DUPLICATE_CURRENT' AS check_type,
  COUNT(*) AS issue_count,
  '同一员工有多条 is_current=true 的 assignment 记录数量' AS description
FROM (
  SELECT employee_id
  FROM employee_assignment
  WHERE is_current = true AND is_deleted = false
  GROUP BY employee_id
  HAVING COUNT(*) > 1
) dup;

-- 详情查询
-- SELECT employee_id, COUNT(*) as cnt 
-- FROM employee_assignment 
-- WHERE is_current = true AND is_deleted = false 
-- GROUP BY employee_id 
-- HAVING COUNT(*) > 1;

-- ============================================================
-- 巡检项 5：非法 status（不在允许列表中）
-- ============================================================

SELECT 
  'INVALID_STATUS' AS check_type,
  COUNT(*) AS issue_count,
  'status 字段值不在允许列表中的记录数量' AS description
FROM employee_assignment
WHERE is_deleted = false 
  AND status NOT IN ('active', 'pending', 'inactive', 'retired', 'reinstated')
  AND status IS NOT NULL;

-- ============================================================
-- 巡检项 6： supervisor_id 指向不存在的员工
-- ============================================================

SELECT 
  'ORPHAN_SUPERVISOR' AS check_type,
  COUNT(*) AS issue_count,
  'assignment 引用的 supervisor_id 在 employee 表中不存在的数量' AS description
FROM employee_assignment ea
LEFT JOIN employee s ON ea.supervisor_id = s.id AND s.is_deleted = false
WHERE ea.is_deleted = false 
  AND ea.supervisor_id IS NOT NULL 
  AND s.id IS NULL;

-- ============================================================
-- 巡检项 7：日期逻辑异常（end_date < start_date）
-- ============================================================

SELECT 
  'INVALID_DATE_RANGE' AS check_type,
  COUNT(*) AS issue_count,
  'end_date 早于 start_date 的记录数量' AS description
FROM employee_assignment
WHERE is_deleted = false 
  AND end_date IS NOT NULL 
  AND start_date IS NOT NULL
  AND end_date < start_date;

-- ============================================================
-- 巡检项 8：已离职但仍标记为 is_current
-- ============================================================

SELECT 
  'LEAVED_BUT_CURRENT' AS check_type,
  COUNT(*) AS issue_count,
  '状态为 inactive/retired 但 is_current=true 的记录数量' AS description
FROM employee_assignment
WHERE is_deleted = false 
  AND is_current = true 
  AND status IN ('inactive', 'retired');

-- ============================================================
-- 巡检项 9：统计汇总（每日健康报告）
-- ============================================================

SELECT 
  'SUMMARY' AS check_type,
  'TOTAL_ACTIVE_ASSIGNMENTS' AS metric,
  COUNT(*) AS value,
  '当前有效的 assignment 总数' AS description
FROM employee_assignment
WHERE is_current = true AND is_deleted = false

UNION ALL

SELECT 
  'SUMMARY',
  'TOTAL_EMPLOYEES_WITH_ASSIGNMENT',
  COUNT(DISTINCT employee_id),
  '有有效 assignment 的员工数量'
FROM employee_assignment
WHERE is_current = true AND is_deleted = false

UNION ALL

SELECT 
  'SUMMARY',
  'TOTAL_EMPLOYEES_NO_ASSIGNMENT',
  (SELECT COUNT(*) FROM employee WHERE is_deleted = false) - 
  (SELECT COUNT(DISTINCT employee_id) FROM employee_assignment WHERE is_current = true AND is_deleted = false),
  '没有有效 assignment 的员工数量'
FROM employee
WHERE is_deleted = false

UNION ALL

SELECT 
  'SUMMARY',
  'STATUS_DISTRIBUTION',
  COUNT(*),
  '按 status 分布统计'
FROM employee_assignment
WHERE is_current = true AND is_deleted = false
GROUP BY status;

-- ============================================================
-- 巡检项 10：与旧表数据对比（一致性检查）
-- ============================================================

-- 10.1 employee_assignment vs hse_employee_org 员工数对比
SELECT 
  'CONSISTENCY_CHECK' AS check_type,
  'assignment_vs_org_employee_count' AS metric,
  '新模型 employee_assignment 当前在职数: ' || 
    (SELECT COUNT(DISTINCT employee_id) FROM employee_assignment WHERE is_current = true AND is_deleted = false)
  || ' | 旧模型 hse_employee_org 当前在职数: ' ||
    (SELECT COUNT(DISTINCT employee_id) FROM hse_employee_org WHERE is_current = true AND is_deleted = false)
  AS value,
  '新旧模型当前在职员工数量对比' AS description;

-- 10.2 差异检查（有 assignment 但无 hse_employee_org）
SELECT COUNT(*) AS only_in_assignment
FROM employee_assignment ea
WHERE ea.is_current = true AND ea.is_deleted = false
  AND NOT EXISTS (
    SELECT 1 FROM hse_employee_org heo 
    WHERE heo.employee_id = ea.employee_id 
      AND heo.is_current = true 
      AND heo.is_deleted = false
  );

-- 10.3 差异检查（有 hse_employee_org 但无 employee_assignment）
SELECT COUNT(*) AS only_in_org
FROM hse_employee_org heo
WHERE heo.is_current = true AND heo.is_deleted = false
  AND NOT EXISTS (
    SELECT 1 FROM employee_assignment ea 
    WHERE ea.employee_id = heo.employee_id 
      AND ea.is_current = true 
      AND ea.is_deleted = false
  );

-- ============================================================
-- 巡检项 11：一键全量巡检视图
-- ============================================================

CREATE OR REPLACE VIEW v_employee_assignment_health AS
SELECT 'ORPHAN_EMPLOYEE' AS check_type, COUNT(*) AS issue_count
FROM employee_assignment ea
LEFT JOIN employee e ON ea.employee_id = e.id
WHERE ea.is_deleted = false AND e.id IS NULL

UNION ALL

SELECT 'ORPHAN_POSITION', COUNT(*)
FROM employee_assignment ea
LEFT JOIN position p ON ea.position_id = p.id AND p.is_deleted = false
WHERE ea.is_deleted = false AND ea.position_id IS NOT NULL AND p.id IS NULL

UNION ALL

SELECT 'ORPHAN_ORG_UNIT', COUNT(*)
FROM employee_assignment ea
LEFT JOIN hse_org_unit ou ON ea.org_unit_id = ou.id
WHERE ea.is_deleted = false AND ea.org_unit_id IS NOT NULL AND ou.id IS NULL

UNION ALL

SELECT 'DUPLICATE_CURRENT', COUNT(*)
FROM (
  SELECT employee_id FROM employee_assignment
  WHERE is_current = true AND is_deleted = false
  GROUP BY employee_id HAVING COUNT(*) > 1
) dup

UNION ALL

SELECT 'INVALID_STATUS', COUNT(*)
FROM employee_assignment
WHERE is_deleted = false 
  AND status NOT IN ('active', 'pending', 'inactive', 'retired', 'reinstated')
  AND status IS NOT NULL

UNION ALL

SELECT 'ORPHAN_SUPERVISOR', COUNT(*)
FROM employee_assignment ea
LEFT JOIN employee s ON ea.supervisor_id = s.id AND s.is_deleted = false
WHERE ea.is_deleted = false AND ea.supervisor_id IS NOT NULL AND s.id IS NULL

UNION ALL

SELECT 'INVALID_DATE_RANGE', COUNT(*)
FROM employee_assignment
WHERE is_deleted = false 
  AND end_date IS NOT NULL AND start_date IS NOT NULL
  AND end_date < start_date

UNION ALL

SELECT 'LEAVED_BUT_CURRENT', COUNT(*)
FROM employee_assignment
WHERE is_deleted = false 
  AND is_current = true 
  AND status IN ('inactive', 'retired');

-- 使用方法: SELECT * FROM v_employee_assignment_health;
-- 结果: issue_count > 0 表示有问题需要处理

-- ============================================================
-- 巡检项 12：自动化巡检存储过程（可选）
-- ============================================================

CREATE OR REPLACE FUNCTION fn_run_assignment_health_check()
RETURNS TABLE(
  check_type TEXT,
  issue_count BIGINT,
  description TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM v_employee_assignment_health;
  
  RETURN QUERY
  SELECT 
    'TOTAL_ASSIGNMENTS' AS check_type,
    COUNT(*) AS issue_count,
    '总 assignment 记录数' AS description
  FROM employee_assignment
  WHERE is_deleted = false;
  
  RETURN QUERY
  SELECT 
    'ACTIVE_EMPLOYEE_COUNT',
    COUNT(DISTINCT employee_id),
    '当前在职员工数'
  FROM employee_assignment
  WHERE is_current = true AND is_deleted = false;
END;
$$ LANGUAGE plpgsql;

-- 使用方法: SELECT * FROM fn_run_assignment_health_check();

-- ============================================================
-- 执行说明
-- ============================================================
-- 1. 本脚本可配置为 PostgreSQL 定时任务（pg_cron 或外部调度）
-- 2. 建议执行频率: 每日凌晨 02:00
-- 3. 输出方式: 
--    a) 直接查询 SELECT * FROM fn_run_assignment_health_check();
--    b) 结果输出至日志表或告警系统
-- 4. 告警阈值: issue_count > 0 时触发告警
-- 5. 巡检结果样例:
--    check_type         issue_count  description
--    ORPHAN_EMPLOYEE    0           有 assignment 记录但 employee...
--    ORPHAN_POSITION    0           assignment 引用的 position...
--    DUPLICATE_CURRENT  0           同一员工有多条 is_current=true...
--    INVALID_STATUS     0           status 字段值不在允许列表中...

-- ============================================================
-- 扩展说明
-- ============================================================
-- 如需增加巡检项：
-- 1. 在 v_employee_assignment_health 视图中增加 UNION ALL
-- 2. 确保返回 (check_type TEXT, issue_count BIGINT) 格式
-- 3. 在 fn_run_assignment_health_check() 中同步更新
