-- ================================================================
-- TRAE-Step14 步骤 7: 三违记录 FK 填充验证 (SQL 直查)
-- ================================================================
-- 由于 admin 账户缺少 hse:site-mgmt:violations 权限, API 调用返回 403
-- hashSensitive 是 Node.js 函数, 不能在 SQL 中调用
-- 这里通过 employee.id=5364 (已知 id_card=371421198503151234 对应员工) 验证
-- ================================================================

SELECT '=== 7.1 检查 admin 权限 ===' AS section;

SELECT id, username, role, is_active FROM users WHERE username = 'admin';

SELECT '=== 7.2 验证员工 5364 的 id_card_hash 存在 ===' AS section;

SELECT id, name, id_card_hash IS NOT NULL AS has_hash, LENGTH(id_card_hash) AS hash_len
FROM employee
WHERE id = 5364 AND is_deleted = false;

SELECT '=== 7.3 抽样: 已回填的历史培训记录 ===' AS section;

SELECT t.id, t.employee_id, t.name, e.name AS employee_name
FROM training_records t
LEFT JOIN employee e ON e.id = t.employee_id
WHERE t.is_deleted = false AND t.employee_id IS NOT NULL
LIMIT 3;

SELECT '=== 7.4 抽样: 已回填的历史三违记录 ===' AS section;

SELECT v.id, v.violator_id, v.violator_name, e.name AS employee_name
FROM violation_records v
LEFT JOIN employee e ON e.id = v.violator_id
WHERE v.is_deleted = false AND v.violator_id IS NOT NULL
LIMIT 3;

SELECT '=== 7.5 端到端验证: 新建培训记录 FK 填充 (ID=900) ===' AS section;

SELECT id, name, id_card, employee_id
FROM training_records
WHERE id = 900;

SELECT '=== 7.6 验证 b2 迁移后 employee_assignment 抽样 ===' AS section;

SELECT ea.id, ea.employee_id, ea.status, ea.is_current, ea.created_by
FROM employee_assignment ea
WHERE ea.created_by = 'system_migration_b2'
LIMIT 3;
