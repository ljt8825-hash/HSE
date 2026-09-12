-- 修复 employee_import_pending 表缺失的字段
ALTER TABLE employee_import_pending ADD COLUMN IF NOT EXISTS row_num INTEGER;
ALTER TABLE employee_import_pending ADD COLUMN IF NOT EXISTS employee_no VARCHAR(50);
ALTER TABLE employee_import_pending ADD COLUMN IF NOT EXISTS employee_name VARCHAR(100);
ALTER TABLE employee_import_pending ADD COLUMN IF NOT EXISTS raw_dept VARCHAR(200);
ALTER TABLE employee_import_pending ADD COLUMN IF NOT EXISTS raw_position VARCHAR(200);
ALTER TABLE employee_import_pending ADD COLUMN IF NOT EXISTS raw_team VARCHAR(200);
ALTER TABLE employee_import_pending ADD COLUMN IF NOT EXISTS pending_type VARCHAR(50);
ALTER TABLE employee_import_pending ADD COLUMN IF NOT EXISTS pending_desc TEXT;
ALTER TABLE employee_import_pending ADD COLUMN IF NOT EXISTS rule_version VARCHAR(20);
ALTER TABLE employee_import_pending ADD COLUMN IF NOT EXISTS hire_date DATE;
ALTER TABLE employee_import_pending ADD COLUMN IF NOT EXISTS is_driver BOOLEAN DEFAULT FALSE;
ALTER TABLE employee_import_pending ADD COLUMN IF NOT EXISTS license_type VARCHAR(50);
ALTER TABLE employee_import_pending ADD COLUMN IF NOT EXISTS target_org_id BIGINT;
ALTER TABLE employee_import_pending ADD COLUMN IF NOT EXISTS target_unit_id BIGINT;
ALTER TABLE employee_import_pending ADD COLUMN IF NOT EXISTS target_pos_id BIGINT;
ALTER TABLE employee_import_pending ADD COLUMN IF NOT EXISTS id_card_hash VARCHAR(100);
ALTER TABLE employee_import_pending ADD COLUMN IF NOT EXISTS phone_hash VARCHAR(100);
ALTER TABLE employee_import_pending ADD COLUMN IF NOT EXISTS resolution VARCHAR(50);
ALTER TABLE employee_import_pending ADD COLUMN IF NOT EXISTS resolved_by BIGINT;

-- 删除旧字段（已被替代的）
ALTER TABLE employee_import_pending DROP COLUMN IF EXISTS row_index;
ALTER TABLE employee_import_pending DROP COLUMN IF EXISTS row_data;
ALTER TABLE employee_import_pending DROP COLUMN IF EXISTS issue_type;
ALTER TABLE employee_import_pending DROP COLUMN IF EXISTS issue_detail;
ALTER TABLE employee_import_pending DROP COLUMN IF EXISTS field_name;
ALTER TABLE employee_import_pending DROP COLUMN IF EXISTS field_value;
ALTER TABLE employee_import_pending DROP COLUMN IF EXISTS suggested_value;
ALTER TABLE employee_import_pending DROP COLUMN IF EXISTS resolution_note;
