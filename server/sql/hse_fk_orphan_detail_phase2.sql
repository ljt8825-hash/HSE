-- ============================================================
-- FK Phase 2 遗留孤儿数据详细探查（实勘修正版）
-- 日期：2026-07-30
-- 实勘修正（相对提示词原文）：
--   1) hse_deduction_adjustment / hse_assessment_audit_log 两张表【均无 is_deleted 列】，
--      提示词"软删除孤儿置 NULL"策略不适用（无软删除机制，所有孤儿均为活跃）。
--   2) adjusted_by / operator_id 均为 NOT NULL，按红线不得强制 SET NULL。
--   3) 两张表均保留 *_name 文本列（adjusted_by_name / operator_name）可作溯源。
-- 本脚本仅读取，不修改任何数据。
-- 执行：psql -h 127.0.0.1 -p 5432 -U hse_app -d safety_dashboard -f 本文件
-- ============================================================

\echo '=== A1. hse_deduction_adjustment.adjusted_by 孤儿记录（表无 is_deleted，全部视为活跃）==='
SELECT
    a.id AS adjustment_id,
    a.adjusted_by AS orphan_employee_id,
    a.adjusted_by_name AS orphan_employee_name,
    a.adjustment_reason,
    a.adjusted_at
FROM hse_deduction_adjustment a
LEFT JOIN employee e ON a.adjusted_by = e.id AND e.is_deleted = false
WHERE a.adjusted_by IS NOT NULL
  AND e.id IS NULL
ORDER BY a.adjusted_at DESC;

\echo '--- A1 孤儿总数 ---'
SELECT count(*) AS total_orphan
FROM hse_deduction_adjustment a
LEFT JOIN employee e ON a.adjusted_by = e.id AND e.is_deleted = false
WHERE a.adjusted_by IS NOT NULL AND e.id IS NULL;

\echo '=== A2. hse_assessment_audit_log.operator_id 孤儿记录 ==='
SELECT
    l.id AS log_id,
    l.operator_id AS orphan_employee_id,
    l.operator_name AS orphan_employee_name,
    l.module,
    l.operation_type,
    l.operation_time
FROM hse_assessment_audit_log l
LEFT JOIN employee e ON l.operator_id = e.id AND e.is_deleted = false
WHERE l.operator_id IS NOT NULL
  AND e.id IS NULL
ORDER BY l.operation_time DESC;

\echo '--- A2 孤儿总数 ---'
SELECT count(*) AS total_orphan
FROM hse_assessment_audit_log l
LEFT JOIN employee e ON l.operator_id = e.id AND e.is_deleted = false
WHERE l.operator_id IS NOT NULL AND e.id IS NULL;

\echo '=== A3. hse_events 人员关联列确认（全量检索 person/user/staff/operator/handler/reporter/employee）==='
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'hse_events'
  AND (column_name ILIKE '%person%' OR column_name ILIKE '%user%' OR column_name ILIKE '%staff%'
       OR column_name ILIKE '%operator%' OR column_name ILIKE '%handler%' OR column_name ILIKE '%reporter%'
       OR column_name ILIKE '%employee%' OR column_name = 'id')
ORDER BY ordinal_position;

\echo '=== A4. hse_reviews 复核人关联列确认 ==='
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'hse_reviews'
  AND (column_name ILIKE '%review%' OR column_name ILIKE '%person%' OR column_name ILIKE '%user%' OR column_name ILIKE '%employee%')
ORDER BY ordinal_position;

\echo '=== A5. 孤儿引用的 employee_id 是否存在（任意 is_deleted 状态）==='
SELECT 'adjusted_by 引用的 employee_id' AS src, a.adjusted_by AS emp_id,
       CASE WHEN EXISTS (SELECT 1 FROM employee e2 WHERE e2.id = a.adjusted_by)
            THEN 'employee 表存在该 id（可能已软删除）' ELSE 'employee 表完全不存在该 id' END AS emp_state
FROM hse_deduction_adjustment a
LEFT JOIN employee e ON a.adjusted_by = e.id AND e.is_deleted = false
WHERE a.adjusted_by IS NOT NULL AND e.id IS NULL
GROUP BY a.adjusted_by
UNION ALL
SELECT 'operator_id 引用的 employee_id', l.operator_id,
       CASE WHEN EXISTS (SELECT 1 FROM employee e2 WHERE e2.id = l.operator_id)
            THEN 'employee 表存在该 id（可能已软删除）' ELSE 'employee 表完全不存在该 id' END
FROM hse_assessment_audit_log l
LEFT JOIN employee e ON l.operator_id = e.id AND e.is_deleted = false
WHERE l.operator_id IS NOT NULL AND e.id IS NULL
GROUP BY l.operator_id;
