-- 修复 employee_import_batch 表缺失的字段
ALTER TABLE employee_import_batch ADD COLUMN IF NOT EXISTS uploaded_by VARCHAR(100);
ALTER TABLE employee_import_batch ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMP;
ALTER TABLE employee_import_batch ADD COLUMN IF NOT EXISTS operator VARCHAR(100);
ALTER TABLE employee_import_batch ADD COLUMN IF NOT EXISTS import_source VARCHAR(50);
ALTER TABLE employee_import_batch ADD COLUMN IF NOT EXISTS client_ip VARCHAR(50);
ALTER TABLE employee_import_batch ADD COLUMN IF NOT EXISTS skipped_count INTEGER DEFAULT 0;
