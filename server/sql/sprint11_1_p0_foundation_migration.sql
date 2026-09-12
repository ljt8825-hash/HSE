-- ============================================================
-- Sprint11-1 P0 HSE基础能力迁移脚本
-- 版本: v70（紧接 v69 基础数据）
-- 新增: hse_business_help / import_batch / import_error_log / audit_record
-- 方式: 增量迁移，可重复执行，不删旧表
-- ============================================================

BEGIN;

-- ============================================================
-- 一、hse_business_help — 业务知识库（帮助说明）
-- 支持一级菜单、二级菜单帮助说明
-- ============================================================

CREATE TABLE IF NOT EXISTS hse_business_help (
    id                  BIGSERIAL    PRIMARY KEY,
    menu_code           VARCHAR(64)  NOT NULL,
    title               VARCHAR(256) NOT NULL,
    content             TEXT,
    field_description   TEXT,
    calculate_rule      TEXT,
    generate_rule     TEXT,
    relation_rule     TEXT,
    permission_rule   TEXT,
    version             VARCHAR(32)  DEFAULT '1.0',
    status              VARCHAR(20)  DEFAULT 'active',
    sort_order          INTEGER      DEFAULT 0,
    remark              VARCHAR(512),
    created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    created_by          BIGINT,
    updated_by          BIGINT,
    is_deleted          BOOLEAN      DEFAULT FALSE
);

COMMENT ON TABLE  hse_business_help IS 'HSE业务知识库 - 菜单帮助说明表';
COMMENT ON COLUMN hse_business_help.menu_code         IS '菜单编码（关联menu-codes.json）';
COMMENT ON COLUMN hse_business_help.title             IS '帮助标题';
COMMENT ON COLUMN hse_business_help.content           IS '帮助内容（Markdown/HTML）';
COMMENT ON COLUMN hse_business_help.field_description IS '字段说明';
COMMENT ON COLUMN hse_business_help.calculate_rule    IS '计算规则说明';
COMMENT ON COLUMN hse_business_help.generate_rule   IS '生成规则说明';
COMMENT ON COLUMN hse_business_help.relation_rule   IS '关联规则说明';
COMMENT ON COLUMN hse_business_help.permission_rule IS '权限规则说明';
COMMENT ON COLUMN hse_business_help.version           IS '版本号';
COMMENT ON COLUMN hse_business_help.status            IS '状态: active/inactive';
COMMENT ON COLUMN hse_business_help.sort_order        IS '排序号';

CREATE INDEX IF NOT EXISTS idx_hse_help_menu_code    ON hse_business_help (menu_code) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_hse_help_status        ON hse_business_help (status) WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS uk_hse_help_menu_unique ON hse_business_help (menu_code) WHERE is_deleted = false;

-- ============================================================
-- 二、import_batch — 统一导入批次表
-- 所有业务模块共用
-- ============================================================

CREATE TABLE IF NOT EXISTS import_batch (
    id                  BIGSERIAL    PRIMARY KEY,
    batch_no            VARCHAR(64)  NOT NULL,
    module_name         VARCHAR(64)  NOT NULL,
    module_code           VARCHAR(64)  NOT NULL,
    file_name           VARCHAR(256) NOT NULL,
    file_path           VARCHAR(512),
    file_size           BIGINT       DEFAULT 0,
    total_count           INTEGER      DEFAULT 0,
    success_count       INTEGER      DEFAULT 0,
    error_count         INTEGER      DEFAULT 0,
    status              VARCHAR(32)  DEFAULT 'pending',
    started_at          TIMESTAMP,
    finished_at         TIMESTAMP,
    operator_id         BIGINT,
    operator_name       VARCHAR(128),
    remark              VARCHAR(512),
    created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    is_deleted          BOOLEAN      DEFAULT FALSE
);

COMMENT ON TABLE  import_batch IS '统一导入批次表';
COMMENT ON COLUMN import_batch.batch_no        IS '批次号';
COMMENT ON COLUMN import_batch.module_name     IS '模块名称';
COMMENT ON COLUMN import_batch.module_code   IS '模块编码';
COMMENT ON COLUMN import_batch.file_name       IS '文件名';
COMMENT ON COLUMN import_batch.file_path       IS '文件存储路径';
COMMENT ON COLUMN import_batch.file_size       IS '文件大小（字节）';
COMMENT ON COLUMN import_batch.total_count   IS '总记录数';
COMMENT ON COLUMN import_batch.success_count IS '成功数';
COMMENT ON COLUMN import_batch.error_count     IS '错误数';
COMMENT ON COLUMN import_batch.status        IS '状态: pending/processing/completed/failed';
COMMENT ON COLUMN import_batch.started_at  IS '开始时间';
COMMENT ON COLUMN import_batch.finished_at IS '结束时间';
COMMENT ON COLUMN import_batch.operator_id IS '操作人ID';
COMMENT ON COLUMN import_batch.operator_name   IS '操作人姓名';

CREATE INDEX IF NOT EXISTS idx_import_batch_module   ON import_batch (module_code) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_import_batch_status   ON import_batch (status) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_import_batch_operator ON import_batch (operator_id) WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS uk_import_batch_no ON import_batch (batch_no) WHERE is_deleted = false;

-- ============================================================
-- 三、import_error_log — 导入错误日志表
-- ============================================================

CREATE TABLE IF NOT EXISTS import_error_log (
    id                  BIGSERIAL    PRIMARY KEY,
    batch_id            BIGINT       NOT NULL REFERENCES import_batch(id),
    row_number          INTEGER      DEFAULT 0,
    field_name          VARCHAR(128),
    field_value         TEXT,
    error_code          VARCHAR(64),
    error_message       VARCHAR(512) NOT NULL,
    raw_data            JSONB,
    created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    is_deleted          BOOLEAN      DEFAULT FALSE
);

COMMENT ON TABLE  import_error_log IS '导入错误日志表';
COMMENT ON COLUMN import_error_log.batch_id      IS '批次ID（关联import_batch.id）';
COMMENT ON COLUMN import_error_log.row_number    IS '行号';
COMMENT ON COLUMN import_error_log.field_name    IS '字段名';
COMMENT ON COLUMN import_error_log.field_value   IS '字段值';
COMMENT ON COLUMN import_error_log.error_code    IS '错误码';
COMMENT ON COLUMN import_error_log.error_message IS '错误信息';
COMMENT ON COLUMN import_error_log.raw_data      IS '原始行数据（JSON）';

CREATE INDEX IF NOT EXISTS idx_import_error_batch ON import_error_log (batch_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_import_error_row   ON import_error_log (row_number) WHERE is_deleted = false;

-- ============================================================
-- 四、audit_record — 审计记录表（数据变化追踪）
-- 与 sys_operation_log 配合使用：
--   sys_operation_log = 谁做了什么操作
--   audit_record      = 哪些数据发生了什么变化
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_record (
    id                  BIGSERIAL    PRIMARY KEY,
    operation_log_id        BIGINT       REFERENCES sys_operation_log(id),
    user_id             INTEGER      NOT NULL,
    username            VARCHAR(100) NOT NULL DEFAULT '',
    module              VARCHAR(100) NOT NULL DEFAULT 'system',
    table_name          VARCHAR(128) NOT NULL,
    record_id           VARCHAR(64),
    action              VARCHAR(50)  NOT NULL,
    old_value           JSONB,
    new_value           JSONB,
    changed_fields      TEXT[],
    ip_address          VARCHAR(50),
    created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  audit_record IS '审计记录表 - 数据变化追踪';
COMMENT ON COLUMN audit_record.operation_log_id  IS '关联操作日志ID';
COMMENT ON COLUMN audit_record.user_id           IS '操作人ID';
COMMENT ON COLUMN audit_record.username          IS '操作人用户名';
COMMENT ON COLUMN audit_record.module            IS '业务模块';
COMMENT ON COLUMN audit_record.table_name      IS '数据表名';
COMMENT ON COLUMN audit_record.record_id         IS '记录ID';
COMMENT ON COLUMN audit_record.action            IS '操作: create/update/delete';
COMMENT ON COLUMN audit_record.old_value         IS '变更前数据（JSON）';
COMMENT ON COLUMN audit_record.new_value         IS '变更后数据（JSON）';
COMMENT ON COLUMN audit_record.changed_fields    IS '变更字段列表';
COMMENT ON COLUMN audit_record.ip_address        IS '客户端IP';

CREATE INDEX IF NOT EXISTS idx_audit_record_user    ON audit_record (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_record_module  ON audit_record (module);
CREATE INDEX IF NOT EXISTS idx_audit_record_table   ON audit_record (table_name);
CREATE INDEX IF NOT EXISTS idx_audit_record_record  ON audit_record (record_id);
CREATE INDEX IF NOT EXISTS idx_audit_record_created ON audit_record (created_at DESC);

COMMIT;
