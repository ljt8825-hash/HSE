-- ============================================================
-- FK Phase 4 (提示词-67) B-1 只读审计
-- 核对 3 张表 5 个 NOT NULL 列的孤儿（引用 id 在父表主键完全不存在，含软删除态也算存在）
-- 父表：employee(id) / position(id)
-- 注意：提示词 B-1 查询误用 hse_position，实际父表为 position
-- ============================================================

-- 孤儿计数（门控用）
SELECT 'employee_induction_training.employee_id' AS col,
       COUNT(*) AS orphans
FROM employee_induction_training t
LEFT JOIN employee e ON t.employee_id = e.id
WHERE t.employee_id IS NOT NULL AND e.id IS NULL
UNION ALL
SELECT 'employee_induction_training.position_id', COUNT(*)
FROM employee_induction_training t
LEFT JOIN position p ON t.position_id = p.id
WHERE t.position_id IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'employee_training_status.employee_id', COUNT(*)
FROM employee_training_status t
LEFT JOIN employee e ON t.employee_id = e.id
WHERE t.employee_id IS NOT NULL AND e.id IS NULL
UNION ALL
SELECT 'employee_training_status.position_id', COUNT(*)
FROM employee_training_status t
LEFT JOIN position p ON t.position_id = p.id
WHERE t.position_id IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'position_safety_profile.position_id', COUNT(*)
FROM position_safety_profile t
LEFT JOIN position p ON t.position_id = p.id
WHERE t.position_id IS NOT NULL AND p.id IS NULL;

-- 各表总行数（确认删除范围，避免误删有效行）
SELECT 'employee_induction_training' AS tbl, COUNT(*) AS total_rows FROM employee_induction_training
UNION ALL
SELECT 'employee_training_status', COUNT(*) FROM employee_training_status
UNION ALL
SELECT 'position_safety_profile', COUNT(*) FROM position_safety_profile;

-- 孤儿取值特征（确认种子/demo 数据）
SELECT 'eit.employee_id' AS which, t.employee_id AS orphan_val, COUNT(*) AS cnt
FROM employee_induction_training t
LEFT JOIN employee e ON t.employee_id = e.id
WHERE t.employee_id IS NOT NULL AND e.id IS NULL
GROUP BY t.employee_id ORDER BY t.employee_id
UNION ALL
SELECT 'eit.position_id', t.position_id, COUNT(*)
FROM employee_induction_training t
LEFT JOIN position p ON t.position_id = p.id
WHERE t.position_id IS NOT NULL AND p.id IS NULL
GROUP BY t.position_id ORDER BY t.position_id
UNION ALL
SELECT 'ets.employee_id', t.employee_id, COUNT(*)
FROM employee_training_status t
LEFT JOIN employee e ON t.employee_id = e.id
WHERE t.employee_id IS NOT NULL AND e.id IS NULL
GROUP BY t.employee_id ORDER BY t.employee_id
UNION ALL
SELECT 'ets.position_id', t.position_id, COUNT(*)
FROM employee_training_status t
LEFT JOIN position p ON t.position_id = p.id
WHERE t.position_id IS NOT NULL AND p.id IS NULL
GROUP BY t.position_id ORDER BY t.position_id
UNION ALL
SELECT 'psp.position_id', t.position_id, COUNT(*)
FROM position_safety_profile t
LEFT JOIN position p ON t.position_id = p.id
WHERE t.position_id IS NOT NULL AND p.id IS NULL
GROUP BY t.position_id ORDER BY t.position_id;
