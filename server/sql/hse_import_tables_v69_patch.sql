-- ============================================================
-- Sprint6.0 花名册导入相关表 - 补充迁移脚本
-- 表: hse_import_batch / hse_import_pending / hse_import_mapping_rule
-- ============================================================

-- 1. 导入批次表
CREATE TABLE IF NOT EXISTS hse_import_batch (
    id SERIAL PRIMARY KEY,
    batch_no VARCHAR(64) NOT NULL UNIQUE,
    file_name VARCHAR(255),
    import_type VARCHAR(32) DEFAULT 'roster',
    total_count INTEGER DEFAULT 0,
    org_matched_count INTEGER DEFAULT 0,
    org_unmatched_count INTEGER DEFAULT 0,
    position_matched_count INTEGER DEFAULT 0,
    position_unmatched_count INTEGER DEFAULT 0,
    position_ambiguous_count INTEGER DEFAULT 0,
    position_new_count INTEGER DEFAULT 0,
    team_uncertain_count INTEGER DEFAULT 0,
    pending_count INTEGER DEFAULT 0,
    approved_count INTEGER DEFAULT 0,
    rejected_count INTEGER DEFAULT 0,
    status VARCHAR(32) DEFAULT 'parsed',
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_hse_import_batch_no ON hse_import_batch(batch_no);
CREATE INDEX IF NOT EXISTS idx_hse_import_batch_status ON hse_import_batch(status);
CREATE INDEX IF NOT EXISTS idx_hse_import_batch_type ON hse_import_batch(import_type);

-- 2. 导入待确认表
CREATE TABLE IF NOT EXISTS hse_import_pending (
    id SERIAL PRIMARY KEY,
    batch_no VARCHAR(64) NOT NULL,
    row_index INTEGER,
    employee_code VARCHAR(64),
    name VARCHAR(100),
    id_card VARCHAR(32),
    gender VARCHAR(8),
    birth_date DATE,
    phone VARCHAR(32),
    raw_dept VARCHAR(255),
    raw_team VARCHAR(255),
    raw_position VARCHAR(255),
    hire_date DATE,
    is_driver BOOLEAN DEFAULT false,
    license_type VARCHAR(32),
    org_unit_id INTEGER,
    org_name VARCHAR(255),
    org_match_via VARCHAR(32),
    operation_unit_id INTEGER,
    operation_unit_name VARCHAR(255),
    position_id INTEGER,
    position_name VARCHAR(255),
    position_match_via VARCHAR(32),
    position_alias VARCHAR(255),
    responsibility_type VARCHAR(32),
    grid_level VARCHAR(32),
    grid_role VARCHAR(64),
    inspection_frequency VARCHAR(64),
    responsible_org VARCHAR(255),
    responsible_org_id INTEGER,
    has_exception BOOLEAN DEFAULT false,
    exception_types JSONB,
    exception_detail JSONB,
    status VARCHAR(32) DEFAULT 'pending',
    source VARCHAR(32) DEFAULT 'roster_import',
    approved_by INTEGER,
    approved_at TIMESTAMP,
    reject_reason TEXT,
    remark TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_hse_import_pending_batch ON hse_import_pending(batch_no);
CREATE INDEX IF NOT EXISTS idx_hse_import_pending_status ON hse_import_pending(status);
CREATE INDEX IF NOT EXISTS idx_hse_import_pending_exception ON hse_import_pending(has_exception);
CREATE INDEX IF NOT EXISTS idx_hse_import_pending_name ON hse_import_pending(name);

-- 3. 导入映射规则表
CREATE TABLE IF NOT EXISTS hse_import_mapping_rule (
    id SERIAL PRIMARY KEY,
    mapping_type VARCHAR(32) NOT NULL,
    raw_value VARCHAR(255) NOT NULL,
    org_unit_id INTEGER,
    org_name VARCHAR(255),
    position_id INTEGER,
    position_name VARCHAR(255),
    operation_unit_id INTEGER,
    operation_unit_name VARCHAR(255),
    sort_order INTEGER DEFAULT 0,
    status VARCHAR(32) DEFAULT 'active',
    remark TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_hse_import_mapping_type ON hse_import_mapping_rule(mapping_type);
CREATE INDEX IF NOT EXISTS idx_hse_import_mapping_raw ON hse_import_mapping_rule(raw_value);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hse_import_mapping_unique ON hse_import_mapping_rule(mapping_type, raw_value) WHERE NOT is_deleted;
