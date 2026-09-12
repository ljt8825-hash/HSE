-- 清理提示词-137 探针创建的测试预案
DELETE FROM emergency_plans WHERE name = '探针预案' AND is_deleted = false;
SELECT 'remaining 探针预案: ' || COUNT(*) AS cnt FROM emergency_plans WHERE name = '探针预案';
