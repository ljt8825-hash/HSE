-- HSE-MOBILE-GRID-03-B：生产库只读指纹（前后比对，证明零写入）
-- 仅 SELECT / 元数据，无任何 DDL/DML
\pset tuples_only on
\pset format unaligned

SELECT '--- 1. grid_inspection_records 内容指纹 ---';
SELECT 'count=' || COUNT(*) || ' max_id=' || COALESCE(MAX(id)::text,'-') || ' min_id=' || COALESCE(MIN(id)::text,'-') FROM grid_inspection_records;
SELECT 'md5_all_rows=' || COALESCE(md5(string_agg(t::text, '' ORDER BY id)), '-') FROM grid_inspection_records t;
SELECT 'rectified_photo_nonempty=' || COUNT(*) FROM grid_inspection_records WHERE rectified_photo IS NOT NULL AND TRIM(rectified_photo) <> '';
SELECT 'rectified_photo_null_or_empty=' || COUNT(*) FROM grid_inspection_records WHERE rectified_photo IS NULL OR TRIM(rectified_photo) = '';
SELECT 'inspector_employee_id_nonnull=' || COUNT(*) FROM grid_inspection_records WHERE inspector_employee_id IS NOT NULL;
SELECT 'grid_id_nonnull=' || COUNT(*) FROM grid_inspection_records WHERE grid_id IS NOT NULL;
SELECT 'personnel_name_null=' || COUNT(*) FROM grid_inspection_records WHERE personnel_name IS NULL;

SELECT '--- 2. 同步映射表 ---';
SELECT 'sync_map_count=' || COUNT(*) FROM grid_record_sync_map;
SELECT 'sync_state_count=' || COUNT(*) FROM grid_record_sync_state;

SELECT '--- 3. 人员/账号 ---';
SELECT 'users_count=' || COUNT(*) || ' max_last_login=' || COALESCE(MAX(last_login_at)::text,'-') FROM users;
SELECT 'employee_count=' || COUNT(*) FROM employee;
SELECT 'grid_areas_count=' || COUNT(*) || ' max_updated=' || COALESCE(MAX(updated_at)::text,'-') FROM grid_areas;

SELECT '--- 4. 三违月度考核（sanweiLedgerDerive 落库表）---';
SELECT 'sanwei_monthly_count=' || COUNT(*) || ' max_created=' || COALESCE(MAX(created_at)::text,'-') FROM hse_sanwei_score_monthly;

SELECT '--- 5. 登录尝试 ---';
SELECT 'login_attempts_count=' || COUNT(*) || ' max_attempt=' || COALESCE(MAX(attempt_time)::text,'-') FROM login_attempts;

SELECT '--- 6. 审计日志 ---';
SELECT 'audit_record_count=' || COUNT(*) || ' max_time=' || COALESCE(MAX(created_at)::text,'-') FROM audit_record;
