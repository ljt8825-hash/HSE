-- 检查 migration_backup_registry 表的实际结构
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'migration_backup_registry'
ORDER BY ordinal_position;

-- 检查已有数据
SELECT * FROM migration_backup_registry ORDER BY created_at DESC LIMIT 5;
