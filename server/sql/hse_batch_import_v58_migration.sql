-- ============================================================
-- HSE V2 Sprint5: 批量导入中心
-- 版本: v58（紧接 Sprint4 v57）
-- 新增: hse_batch_import_tasks, hse_batch_import_items
-- 约束: 增量迁移，不修改已有表，不删除字段
-- ============================================================

BEGIN;

-- ============================================================
-- 1. 批量导入任务主表
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_batch_import_tasks (
    id                  BIGSERIAL    PRIMARY KEY,
    task_no             VARCHAR(32)  NOT NULL,
    import_type         VARCHAR(32)  NOT NULL,
    import_version      VARCHAR(20)  DEFAULT 'v1.0',
    enterprise_id       BIGINT,
    department_id       BIGINT,
    business_scope      JSONB        DEFAULT '{}',
    total_count         INTEGER      NOT NULL DEFAULT 0,
    success_count       INTEGER      NOT NULL DEFAULT 0,
    fail_count          INTEGER      NOT NULL DEFAULT 0,
    pending_count       INTEGER      NOT NULL DEFAULT 0,
    status              VARCHAR(20)  NOT NULL DEFAULT 'pending',
    precheck_result     JSONB        DEFAULT '{}',
    progress            INTEGER      NOT NULL DEFAULT 0,
    file_storage_dir    VARCHAR(512),
    result_summary      JSONB        DEFAULT '{}',
    error_message       TEXT,
    created_by          VARCHAR(64)  NOT NULL,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    prechecked_at       TIMESTAMP,
    confirmed_at        TIMESTAMP,
    started_at          TIMESTAMP,
    completed_at        TIMESTAMP,
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted          BOOLEAN      NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE  hse_batch_import_tasks IS 'HSE 批量导入任务主表';
COMMENT ON COLUMN hse_batch_import_tasks.task_no        IS '任务编号，业务可读';
COMMENT ON COLUMN hse_batch_import_tasks.import_type    IS '导入类型: document/standard_clause/safety_record';
COMMENT ON COLUMN hse_batch_import_tasks.import_version IS '导入模板版本: v1.0';
COMMENT ON COLUMN hse_batch_import_tasks.enterprise_id  IS '企业ID，支持集团-区域-企业数据隔离';
COMMENT ON COLUMN hse_batch_import_tasks.department_id  IS '部门ID，支持部门数据隔离';
COMMENT ON COLUMN hse_batch_import_tasks.business_scope IS '业务范围: {categoryId, enterpriseId, department, ...}';
COMMENT ON COLUMN hse_batch_import_tasks.status         IS '任务状态: pending/prechecking/prechecked/confirmed/processing/completed/failed/cancelled';
COMMENT ON COLUMN hse_batch_import_tasks.precheck_result IS '预检查结果: {validCount, invalidCount, dupCount, items: [...]}';
COMMENT ON COLUMN hse_batch_import_tasks.progress       IS '进度百分比 0-100';
COMMENT ON COLUMN hse_batch_import_tasks.file_storage_dir IS '本次导入文件的临时存储目录';
COMMENT ON COLUMN hse_batch_import_tasks.result_summary IS '结果汇总: {byErrorType: {...}, byCategory: {...}}';
COMMENT ON COLUMN hse_batch_import_tasks.error_message  IS '任务级错误信息';
COMMENT ON COLUMN hse_batch_import_tasks.created_by     IS '创建人';

-- 索引
CREATE UNIQUE INDEX IF NOT EXISTS uk_batch_import_task_no    ON hse_batch_import_tasks (task_no);
CREATE INDEX IF NOT EXISTS idx_batch_import_tasks_type        ON hse_batch_import_tasks (import_type);
CREATE INDEX IF NOT EXISTS idx_batch_import_tasks_status      ON hse_batch_import_tasks (status);
CREATE INDEX IF NOT EXISTS idx_batch_import_tasks_created     ON hse_batch_import_tasks (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_batch_import_tasks_creator     ON hse_batch_import_tasks (created_by);
CREATE INDEX IF NOT EXISTS idx_batch_import_tasks_enterprise  ON hse_batch_import_tasks (enterprise_id);
CREATE INDEX IF NOT EXISTS idx_batch_import_tasks_department  ON hse_batch_import_tasks (department_id);
CREATE INDEX IF NOT EXISTS idx_batch_import_tasks_scope       ON hse_batch_import_tasks (enterprise_id, department_id, status);

-- ============================================================
-- 2. 批量导入明细表
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_batch_import_items (
    id                  BIGSERIAL    PRIMARY KEY,
    task_id             BIGINT       NOT NULL,
    seq_no              INTEGER      NOT NULL,
    original_name       VARCHAR(256) NOT NULL,
    storage_name        VARCHAR(128),
    file_path           VARCHAR(512),
    file_size           BIGINT       DEFAULT 0,
    file_type           VARCHAR(32),
    mime_type           VARCHAR(128),
    file_hash           VARCHAR(64),
    status              VARCHAR(20)  NOT NULL DEFAULT 'pending',
    precheck_status     VARCHAR(20)  DEFAULT 'pending',
    precheck_message    TEXT,
    target_table        VARCHAR(64),
    target_id           BIGINT,
    error_code          VARCHAR(32),
    error_message       TEXT,
    retry_count         INTEGER      NOT NULL DEFAULT 0,
    max_retry           INTEGER      NOT NULL DEFAULT 3,
    metadata            JSONB        DEFAULT '{}',
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    prechecked_at       TIMESTAMP,
    started_at          TIMESTAMP,
    completed_at        TIMESTAMP,
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted          BOOLEAN      NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE  hse_batch_import_items IS 'HSE 批量导入明细表';
COMMENT ON COLUMN hse_batch_import_items.task_id         IS '关联任务 ID';
COMMENT ON COLUMN hse_batch_import_items.seq_no          IS '文件序号';
COMMENT ON COLUMN hse_batch_import_items.file_hash       IS '文件 SHA-256，用于重复检测';
COMMENT ON COLUMN hse_batch_import_items.status          IS '明细状态: pending/prechecking/prechecked/invalid/duplicate/processing/success/failed/skipped/retrying';
COMMENT ON COLUMN hse_batch_import_items.precheck_status IS '预检查状态: pending/passed/failed';
COMMENT ON COLUMN hse_batch_import_items.precheck_message IS '预检查说明';
COMMENT ON COLUMN hse_batch_import_items.target_id       IS '落库目标记录 ID（仅逻辑关联，不加外键）';
COMMENT ON COLUMN hse_batch_import_items.error_code      IS '错误码: DUP_FILE/INVALID_TYPE/INVALID_SIGNATURE/OVERSIZE/BIZ_ERROR/PARSE_ERROR/DB_ERROR/UNKNOWN';

-- 索引
CREATE INDEX IF NOT EXISTS idx_batch_import_items_task    ON hse_batch_import_items (task_id);
CREATE INDEX IF NOT EXISTS idx_batch_import_items_status  ON hse_batch_import_items (status);
CREATE INDEX IF NOT EXISTS idx_batch_import_items_hash    ON hse_batch_import_items (file_hash);
CREATE INDEX IF NOT EXISTS idx_batch_import_items_target  ON hse_batch_import_items (target_table, target_id);

COMMIT;

-- ============================================================
-- 验证查询
-- ============================================================
SELECT 'hse_batch_import_tasks' as table_name, count(*) as index_count
FROM pg_indexes
WHERE tablename = 'hse_batch_import_tasks'
UNION ALL
SELECT 'hse_batch_import_items' as table_name, count(*) as index_count
FROM pg_indexes
WHERE tablename = 'hse_batch_import_items';

-- ============================================================
-- [提示词-129] 新增模块分类字段
-- ============================================================
ALTER TABLE hse_batch_import_tasks
ADD COLUMN IF NOT EXISTS module VARCHAR(32) DEFAULT NULL;

COMMENT ON COLUMN hse_batch_import_tasks.module IS '业务模块编码：objectives/standards/risk/hazards/site/personnel/training/emergency/insurance/overview/system';
