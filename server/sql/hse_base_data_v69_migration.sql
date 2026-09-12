-- ============================================================
-- HSE Sprint6.0 基础数据底座迁移脚本
-- 版本: v69（紧接 v68 组织中心）
-- 新增: hse_position_alias / hse_responsibility_config / hse_responsibility / hse_responsibility_area / employee_import_mapping_rule / employee_position_mapping_rule / employee_import_mapping_rule_version / employee_import_batch / employee_import_pending
-- 方式: 增量迁移，可重复执行，不删旧表
-- 执行: psql -U hse_user -d hse_db -f hse_base_data_v69_migration.sql
-- ============================================================

BEGIN;

-- ============================================================
-- 一、hse_position_alias — 岗位别名映射表
-- ============================================================

CREATE TABLE IF NOT EXISTS hse_position_alias (
    id              BIGSERIAL    PRIMARY KEY,
    position_id     BIGINT       NOT NULL REFERENCES position(id),
    position_name   VARCHAR(64)  NOT NULL,
    alias_name      VARCHAR(128) NOT NULL,
    alias_source    VARCHAR(32)  DEFAULT 'roster',
    status          VARCHAR(20)  DEFAULT 'active',
    sort_order      INTEGER      DEFAULT 0,
    remark          VARCHAR(256),
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT,
    updated_by      BIGINT,
    is_deleted      BOOLEAN      DEFAULT FALSE
);

COMMENT ON TABLE  hse_position_alias IS 'HSE 岗位别名映射表（花名册导入兼容）';
COMMENT ON COLUMN hse_position_alias.position_id   IS '标准岗位ID（关联position.id）';
COMMENT ON COLUMN hse_position_alias.position_name IS '标准岗位名称';
COMMENT ON COLUMN hse_position_alias.alias_name    IS '岗位别名（花名册中的原始名称）';
COMMENT ON COLUMN hse_position_alias.alias_source  IS '别名来源: roster=花名册, colloquial=口语';
COMMENT ON COLUMN hse_position_alias.sort_order    IS '排序号';
COMMENT ON COLUMN hse_position_alias.remark        IS '备注';

-- 索引
CREATE INDEX IF NOT EXISTS idx_hse_pos_alias_position ON hse_position_alias (position_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_hse_pos_alias_name     ON hse_position_alias (alias_name) WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS uk_hse_pos_alias_unique ON hse_position_alias (position_id, alias_name) WHERE is_deleted = false;

-- ============================================================
-- 二、hse_responsibility_config — 岗位责任配置表
-- ============================================================

CREATE TABLE IF NOT EXISTS hse_responsibility_config (
    id                              BIGSERIAL    PRIMARY KEY,
    position_id                     BIGINT       NOT NULL,
    position_name                   VARCHAR(64)  NOT NULL,
    default_responsibility_type     VARCHAR(32)  NOT NULL,
    default_grid_level              VARCHAR(16),
    default_grid_role               VARCHAR(32),
    default_inspection_frequency    VARCHAR(32),
    is_configurable                 BOOLEAN      DEFAULT TRUE,
    sort_order                      INTEGER      DEFAULT 0,
    status                          VARCHAR(20)  DEFAULT 'active',
    remark                          VARCHAR(256),
    created_at                      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at                      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    created_by                      BIGINT,
    updated_by                      BIGINT,
    is_deleted                      BOOLEAN      DEFAULT FALSE
);

COMMENT ON TABLE  hse_responsibility_config IS 'HSE 岗位责任配置表（导入时自动推导责任类型）';
COMMENT ON COLUMN hse_responsibility_config.position_id                 IS '标准岗位ID';
COMMENT ON COLUMN hse_responsibility_config.position_name               IS '标准岗位名称';
COMMENT ON COLUMN hse_responsibility_config.default_responsibility_type IS '默认责任类型: grid_leader=网格长, production_manager=生产管理责任人, none=非责任人';
COMMENT ON COLUMN hse_responsibility_config.default_grid_level          IS '默认网格层级: grid1/grid2/grid3/grid4（仅grid_leader）';
COMMENT ON COLUMN hse_responsibility_config.default_grid_role           IS '默认网格角色（仅grid_leader）';
COMMENT ON COLUMN hse_responsibility_config.default_inspection_frequency IS '默认巡查频次（仅grid_leader）';
COMMENT ON COLUMN hse_responsibility_config.is_configurable             IS '是否允许人工配置覆盖默认值';
COMMENT ON COLUMN hse_responsibility_config.sort_order                  IS '排序号';

-- 索引
CREATE INDEX IF NOT EXISTS idx_hse_resp_config_position ON hse_responsibility_config (position_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_hse_resp_config_type     ON hse_responsibility_config (default_responsibility_type) WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS uk_hse_resp_config_unique ON hse_responsibility_config (position_id) WHERE is_deleted = false;

-- ============================================================
-- 三、hse_responsibility — 统一责任记录表（核心）
-- ============================================================

CREATE TABLE IF NOT EXISTS hse_responsibility (
    id                      BIGSERIAL    PRIMARY KEY,
    employee_id             BIGINT       NOT NULL REFERENCES employee(id),
    responsibility_type     VARCHAR(32)  NOT NULL,
    grid_level              VARCHAR(16),
    grid_role               VARCHAR(32),
    standard_position       VARCHAR(64),
    position_alias          VARCHAR(128),
    responsible_org         VARCHAR(128),
    responsible_org_id      BIGINT       REFERENCES hse_org_unit(id),
    responsible_area        VARCHAR(255),
    area_id                 BIGINT,
    parent_id               BIGINT,
    inspection_frequency    VARCHAR(32),
    start_date              DATE,
    end_date                DATE,
    status                  VARCHAR(32)  DEFAULT 'active',
    source                  VARCHAR(32)  DEFAULT 'auto',
    remark                  TEXT,
    created_at              TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    created_by              BIGINT,
    updated_by              BIGINT,
    is_deleted              BOOLEAN      DEFAULT FALSE
);

COMMENT ON TABLE  hse_responsibility IS 'HSE 统一责任记录表（网格责任+生产管理责任）';
COMMENT ON COLUMN hse_responsibility.employee_id         IS '员工ID（关联employee.id）';
COMMENT ON COLUMN hse_responsibility.responsibility_type IS '责任类型: grid_leader=网格长, production_manager=生产管理责任人';
COMMENT ON COLUMN hse_responsibility.grid_level          IS '网格层级: grid1/grid2/grid3/grid4（仅grid_leader类型有值）';
COMMENT ON COLUMN hse_responsibility.grid_role           IS '网格角色（仅grid_leader类型有值）';
COMMENT ON COLUMN hse_responsibility.standard_position   IS '标准岗位名称';
COMMENT ON COLUMN hse_responsibility.position_alias      IS '岗位别名（兼容花名册）';
COMMENT ON COLUMN hse_responsibility.responsible_org     IS '责任组织名称';
COMMENT ON COLUMN hse_responsibility.responsible_org_id  IS '责任组织ID（关联hse_org_unit.id）';
COMMENT ON COLUMN hse_responsibility.responsible_area    IS '责任区域描述';
COMMENT ON COLUMN hse_responsibility.area_id             IS '责任区域ID（关联hse_responsibility_area.id，可选）';
COMMENT ON COLUMN hse_responsibility.parent_id           IS '上级责任记录ID（用于层级关联）';
COMMENT ON COLUMN hse_responsibility.inspection_frequency IS '巡查频次（仅grid_leader类型有值）';
COMMENT ON COLUMN hse_responsibility.start_date          IS '责任开始日期';
COMMENT ON COLUMN hse_responsibility.end_date            IS '责任结束日期';
COMMENT ON COLUMN hse_responsibility.status              IS '状态: active/inactive';
COMMENT ON COLUMN hse_responsibility.source              IS '来源: auto=自动生成, manual=人工配置, import=导入生成';

-- 索引
CREATE INDEX IF NOT EXISTS idx_hse_resp_employee_id   ON hse_responsibility (employee_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_hse_resp_type          ON hse_responsibility (responsibility_type) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_hse_resp_grid_level    ON hse_responsibility (grid_level) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_hse_resp_org_id        ON hse_responsibility (responsible_org_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_hse_resp_parent_id     ON hse_responsibility (parent_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_hse_resp_status        ON hse_responsibility (status) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_hse_resp_emp_active    ON hse_responsibility (employee_id, status, is_deleted) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_hse_resp_type_active   ON hse_responsibility (responsibility_type, status, is_deleted) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_hse_resp_org_active    ON hse_responsibility (responsible_org_id, status, is_deleted) WHERE is_deleted = false;

-- ============================================================
-- 四、hse_responsibility_area — 责任区域表（可选扩展）
-- ============================================================

CREATE TABLE IF NOT EXISTS hse_responsibility_area (
    id                  BIGSERIAL    PRIMARY KEY,
    area_name           VARCHAR(128) NOT NULL,
    area_code           VARCHAR(64)  NOT NULL,
    area_type           VARCHAR(32)  DEFAULT 'township',
    org_unit_id         BIGINT       REFERENCES hse_org_unit(id),
    parent_id           BIGINT,
    boundary_desc       VARCHAR(512),
    area_order          INTEGER      DEFAULT 0,
    status              VARCHAR(20)  DEFAULT 'active',
    remark              VARCHAR(256),
    created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    created_by          BIGINT,
    updated_by          BIGINT,
    is_deleted          BOOLEAN      DEFAULT FALSE
);

COMMENT ON TABLE  hse_responsibility_area IS 'HSE 责任区域表（网格责任区域管理）';
COMMENT ON COLUMN hse_responsibility_area.area_name    IS '区域名称';
COMMENT ON COLUMN hse_responsibility_area.area_code    IS '区域编码';
COMMENT ON COLUMN hse_responsibility_area.area_type    IS '区域类型: township=乡镇, area=片区, team=班组, station=转运站';
COMMENT ON COLUMN hse_responsibility_area.org_unit_id  IS '所属管理组织ID';
COMMENT ON COLUMN hse_responsibility_area.parent_id    IS '上级区域ID';
COMMENT ON COLUMN hse_responsibility_area.boundary_desc IS '边界描述';
COMMENT ON COLUMN hse_responsibility_area.area_order   IS '排序号';

-- 索引
CREATE INDEX IF NOT EXISTS idx_hse_resp_area_code     ON hse_responsibility_area (area_code) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_hse_resp_area_org      ON hse_responsibility_area (org_unit_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_hse_resp_area_parent   ON hse_responsibility_area (parent_id) WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS uk_hse_resp_area_code ON hse_responsibility_area (area_code) WHERE is_deleted = false;

-- ============================================================
-- 五、employee_import_mapping_rule — 组织导入映射规则表
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_import_mapping_rule (
    id              BIGSERIAL    PRIMARY KEY,
    source_value    VARCHAR(128) NOT NULL,
    source_type     VARCHAR(32)  NOT NULL,
    target_type     VARCHAR(32)  NOT NULL,
    target_id       BIGINT,
    target_name     VARCHAR(128),
    condition_dept  VARCHAR(128),
    rule_version    VARCHAR(20)  NOT NULL,
    match_priority  INTEGER      DEFAULT 0,
    remark          VARCHAR(256),
    status          VARCHAR(20)  DEFAULT 'active',
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT,
    updated_by      BIGINT,
    is_deleted      BOOLEAN      DEFAULT FALSE
);

COMMENT ON TABLE  employee_import_mapping_rule IS '员工花名册导入-组织映射规则表';
COMMENT ON COLUMN employee_import_mapping_rule.source_value   IS 'Excel原始值（所属部门）';
COMMENT ON COLUMN employee_import_mapping_rule.source_type    IS '来源类型: excel_department';
COMMENT ON COLUMN employee_import_mapping_rule.target_type    IS '目标类型: org_unit=管理组织, operation_unit=作业单元';
COMMENT ON COLUMN employee_import_mapping_rule.target_id      IS '目标记录ID';
COMMENT ON COLUMN employee_import_mapping_rule.target_name    IS '目标名称';
COMMENT ON COLUMN employee_import_mapping_rule.condition_dept IS '条件：所属部门（用于细分判断）';
COMMENT ON COLUMN employee_import_mapping_rule.rule_version   IS '规则版本';
COMMENT ON COLUMN employee_import_mapping_rule.match_priority IS '匹配优先级（数字越大优先级越高）';

-- 索引
CREATE INDEX IF NOT EXISTS idx_eimr_source      ON employee_import_mapping_rule (source_value) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_eimr_version     ON employee_import_mapping_rule (rule_version) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_eimr_target_type ON employee_import_mapping_rule (target_type) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_eimr_source_ver  ON employee_import_mapping_rule (source_value, rule_version) WHERE is_deleted = false;

-- ============================================================
-- 六、employee_position_mapping_rule — 岗位导入映射规则表
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_position_mapping_rule (
    id                      BIGSERIAL    PRIMARY KEY,
    source_position         VARCHAR(128) NOT NULL,
    target_position_id      BIGINT       NOT NULL,
    target_position_name    VARCHAR(128),
    target_position_alias   VARCHAR(128),
    condition_dept          VARCHAR(128),
    grid_level              VARCHAR(16),
    grid_role               VARCHAR(32),
    rule_version            VARCHAR(20)  NOT NULL,
    effective_date          DATE         DEFAULT CURRENT_DATE,
    expire_date             DATE,
    match_priority          INTEGER      DEFAULT 0,
    remark                  VARCHAR(256),
    status                  VARCHAR(20)  DEFAULT 'active',
    created_at              TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    created_by              BIGINT,
    updated_by              BIGINT,
    is_deleted              BOOLEAN      DEFAULT FALSE
);

COMMENT ON TABLE  employee_position_mapping_rule IS '员工花名册导入-岗位映射规则表';
COMMENT ON COLUMN employee_position_mapping_rule.source_position      IS 'Excel原始职位名（别名）';
COMMENT ON COLUMN employee_position_mapping_rule.target_position_id   IS '目标标准岗位ID';
COMMENT ON COLUMN employee_position_mapping_rule.target_position_name IS '目标标准岗位名称';
COMMENT ON COLUMN employee_position_mapping_rule.target_position_alias IS '岗位别名（兼容花名册展示）';
COMMENT ON COLUMN employee_position_mapping_rule.condition_dept       IS '条件：所属部门（司机细分用）';
COMMENT ON COLUMN employee_position_mapping_rule.grid_level           IS '推导的网格层级（grid1/grid2/grid3/grid4）';
COMMENT ON COLUMN employee_position_mapping_rule.grid_role            IS '推导的网格角色';
COMMENT ON COLUMN employee_position_mapping_rule.rule_version         IS '规则版本';
COMMENT ON COLUMN employee_position_mapping_rule.effective_date       IS '生效日期';
COMMENT ON COLUMN employee_position_mapping_rule.expire_date          IS '失效日期';
COMMENT ON COLUMN employee_position_mapping_rule.match_priority       IS '匹配优先级';

-- 索引
CREATE INDEX IF NOT EXISTS idx_epmr_source     ON employee_position_mapping_rule (source_position) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_epmr_version    ON employee_position_mapping_rule (rule_version) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_epmr_target     ON employee_position_mapping_rule (target_position_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_epmr_source_ver ON employee_position_mapping_rule (source_position, rule_version) WHERE is_deleted = false;

-- ============================================================
-- 七、employee_import_mapping_rule_version — 规则版本管理表
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_import_mapping_rule_version (
    id              BIGSERIAL    PRIMARY KEY,
    version         VARCHAR(20)  NOT NULL UNIQUE,
    version_desc    VARCHAR(256),
    effective_date  DATE         NOT NULL,
    expire_date     DATE,
    status          VARCHAR(20)  DEFAULT 'active',
    created_by      VARCHAR(64),
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    is_deleted      BOOLEAN      DEFAULT FALSE
);

COMMENT ON TABLE  employee_import_mapping_rule_version IS '员工花名册导入-规则版本管理表';
COMMENT ON COLUMN employee_import_mapping_rule_version.version      IS '版本号（如 v1.0, v1.1）';
COMMENT ON COLUMN employee_import_mapping_rule_version.version_desc IS '版本描述';
COMMENT ON COLUMN employee_import_mapping_rule_version.effective_date IS '生效日期';
COMMENT ON COLUMN employee_import_mapping_rule_version.expire_date    IS '失效日期';
COMMENT ON COLUMN employee_import_mapping_rule_version.created_by     IS '创建人';

-- ============================================================
-- 八、employee_import_batch — 导入批次记录表
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_import_batch (
    id                  BIGSERIAL    PRIMARY KEY,
    batch_no            VARCHAR(64)  NOT NULL UNIQUE,
    file_name           VARCHAR(256),
    file_size           BIGINT,
    total_count         INTEGER      DEFAULT 0,
    success_count       INTEGER      DEFAULT 0,
    failed_count        INTEGER      DEFAULT 0,
    pending_count       INTEGER      DEFAULT 0,
    rule_version        VARCHAR(20),
    import_type         VARCHAR(32)  DEFAULT 'employee',
    status              VARCHAR(20)  DEFAULT 'pending',
    error_message       TEXT,
    started_at          TIMESTAMP,
    completed_at        TIMESTAMP,
    created_by          BIGINT,
    created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    is_deleted          BOOLEAN      DEFAULT FALSE
);

COMMENT ON TABLE  employee_import_batch IS '员工花名册导入-批次记录表';
COMMENT ON COLUMN employee_import_batch.batch_no      IS '批次号（唯一）';
COMMENT ON COLUMN employee_import_batch.file_name     IS '文件名';
COMMENT ON COLUMN employee_import_batch.file_size     IS '文件大小（字节）';
COMMENT ON COLUMN employee_import_batch.total_count   IS '总记录数';
COMMENT ON COLUMN employee_import_batch.success_count IS '成功数';
COMMENT ON COLUMN employee_import_batch.failed_count  IS '失败数';
COMMENT ON COLUMN employee_import_batch.pending_count IS '待确认数';
COMMENT ON COLUMN employee_import_batch.rule_version  IS '使用的规则版本';
COMMENT ON COLUMN employee_import_batch.import_type   IS '导入类型: employee=员工, org=组织';
COMMENT ON COLUMN employee_import_batch.status        IS '状态: pending=待处理, parsing=解析中, validating=校验中, importing=导入中, completed=已完成, failed=失败';
COMMENT ON COLUMN employee_import_batch.error_message IS '错误信息';
COMMENT ON COLUMN employee_import_batch.started_at    IS '开始时间';
COMMENT ON COLUMN employee_import_batch.completed_at  IS '完成时间';

-- 索引
CREATE INDEX IF NOT EXISTS idx_eib_batch_no ON employee_import_batch (batch_no) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_eib_status   ON employee_import_batch (status) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_eib_created  ON employee_import_batch (created_at) WHERE is_deleted = false;

-- ============================================================
-- 九、employee_import_pending — 待确认记录表
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_import_pending (
    id                  BIGSERIAL    PRIMARY KEY,
    batch_id            BIGINT       NOT NULL REFERENCES employee_import_batch(id),
    row_index           INTEGER      NOT NULL,
    row_data            JSONB        NOT NULL,
    issue_type          VARCHAR(32)  NOT NULL,
    issue_detail        VARCHAR(256),
    field_name          VARCHAR(64),
    field_value         VARCHAR(256),
    suggested_value     VARCHAR(256),
    status              VARCHAR(20)  DEFAULT 'pending',
    resolved_at         TIMESTAMP,
    resolved_by         BIGINT,
    resolution_note     VARCHAR(256),
    created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    is_deleted          BOOLEAN      DEFAULT FALSE
);

COMMENT ON TABLE  employee_import_pending IS '员工花名册导入-待确认记录表';
COMMENT ON COLUMN employee_import_pending.batch_id        IS '导入批次ID';
COMMENT ON COLUMN employee_import_pending.row_index       IS '行号（Excel行号）';
COMMENT ON COLUMN employee_import_pending.row_data        IS '行原始数据（JSON）';
COMMENT ON COLUMN employee_import_pending.issue_type      IS '问题类型: org_not_found=组织未匹配, position_not_found=岗位未匹配, position_ambiguous=岗位歧义, new_position=新增岗位, team_unconfirmed=班组未确认, data_error=数据错误';
COMMENT ON COLUMN employee_import_pending.issue_detail    IS '问题详情';
COMMENT ON COLUMN employee_import_pending.field_name      IS '问题字段名';
COMMENT ON COLUMN employee_import_pending.field_value     IS '问题字段值';
COMMENT ON COLUMN employee_import_pending.suggested_value IS '建议值';
COMMENT ON COLUMN employee_import_pending.status          IS '状态: pending=待确认, resolved=已解决, skipped=已跳过, applied=已应用';
COMMENT ON COLUMN employee_import_pending.resolved_at     IS '解决时间';
COMMENT ON COLUMN employee_import_pending.resolved_by     IS '解决人';
COMMENT ON COLUMN employee_import_pending.resolution_note IS '解决备注';

-- 索引
CREATE INDEX IF NOT EXISTS idx_eip_batch    ON employee_import_pending (batch_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_eip_issue    ON employee_import_pending (issue_type) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_eip_status   ON employee_import_pending (status) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_eip_batch_status ON employee_import_pending (batch_id, status) WHERE is_deleted = false;

-- ============================================================
-- 十、position 表扩展字段（归属组织类型）
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'position' AND column_name = 'org_type') THEN
        ALTER TABLE position ADD COLUMN org_type VARCHAR(32);
        RAISE NOTICE '[v69] Added org_type column to position';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'position' AND column_name = 'responsibility_type') THEN
        ALTER TABLE position ADD COLUMN responsibility_type VARCHAR(32);
        RAISE NOTICE '[v69] Added responsibility_type column to position';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'position' AND column_name = 'is_deleted') THEN
        ALTER TABLE position ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;
        RAISE NOTICE '[v69] Added is_deleted column to position';
    END IF;
END $$;

COMMENT ON COLUMN position.org_type            IS '归属组织类型: company/department/center/town_center';
COMMENT ON COLUMN position.responsibility_type IS '默认责任类型（冗余，从hse_responsibility_config同步）';
COMMENT ON COLUMN position.is_deleted          IS '软删除标记';

-- ============================================================
-- 十一、历史兼容视图：hse_grid_responsibility
-- ============================================================

CREATE OR REPLACE VIEW hse_grid_responsibility AS
SELECT
    id,
    employee_id,
    grid_level,
    grid_role,
    standard_position,
    position_alias,
    responsible_org,
    responsible_org_id,
    responsible_area,
    area_id,
    parent_id,
    inspection_frequency,
    start_date,
    end_date,
    status,
    remark,
    is_deleted,
    created_at,
    updated_at,
    created_by,
    updated_by
FROM hse_responsibility
WHERE responsibility_type = 'grid_leader'
  AND is_deleted = FALSE;

COMMENT ON VIEW hse_grid_responsibility IS '历史兼容视图：网格长责任记录（从hse_responsibility过滤grid_leader类型）';

-- ============================================================
-- 十二、验证查询
-- ============================================================

DO $$
DECLARE
    v_pos_alias INTEGER;
    v_resp_config INTEGER;
    v_responsibility INTEGER;
    v_resp_area INTEGER;
    v_eimr INTEGER;
    v_epmr INTEGER;
    v_eirv INTEGER;
    v_eib INTEGER;
    v_eip INTEGER;
    v_pos_fields INTEGER;
    v_view INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_pos_alias  FROM information_schema.tables WHERE table_name = 'hse_position_alias';
    SELECT COUNT(*) INTO v_resp_config FROM information_schema.tables WHERE table_name = 'hse_responsibility_config';
    SELECT COUNT(*) INTO v_responsibility FROM information_schema.tables WHERE table_name = 'hse_responsibility';
    SELECT COUNT(*) INTO v_resp_area FROM information_schema.tables WHERE table_name = 'hse_responsibility_area';
    SELECT COUNT(*) INTO v_eimr FROM information_schema.tables WHERE table_name = 'employee_import_mapping_rule';
    SELECT COUNT(*) INTO v_epmr FROM information_schema.tables WHERE table_name = 'employee_position_mapping_rule';
    SELECT COUNT(*) INTO v_eirv FROM information_schema.tables WHERE table_name = 'employee_import_mapping_rule_version';
    SELECT COUNT(*) INTO v_eib FROM information_schema.tables WHERE table_name = 'employee_import_batch';
    SELECT COUNT(*) INTO v_eip FROM information_schema.tables WHERE table_name = 'employee_import_pending';

    SELECT COUNT(*) INTO v_pos_fields FROM information_schema.columns
    WHERE table_name = 'position' AND column_name IN ('org_type', 'responsibility_type', 'is_deleted');

    SELECT COUNT(*) INTO v_view FROM information_schema.views WHERE table_name = 'hse_grid_responsibility';

    RAISE NOTICE '========================================';
    RAISE NOTICE '  HSE Sprint6.0 基础数据底座 v69 迁移验证';
    RAISE NOTICE '========================================';
    RAISE NOTICE '  新增表（9张）:';
    RAISE NOTICE '    1. hse_position_alias:           %', CASE WHEN v_pos_alias > 0 THEN '✓ 通过' ELSE '✗ 失败' END;
    RAISE NOTICE '    2. hse_responsibility_config:   %', CASE WHEN v_resp_config > 0 THEN '✓ 通过' ELSE '✗ 失败' END;
    RAISE NOTICE '    3. hse_responsibility:          %', CASE WHEN v_responsibility > 0 THEN '✓ 通过' ELSE '✗ 失败' END;
    RAISE NOTICE '    4. hse_responsibility_area:     %', CASE WHEN v_resp_area > 0 THEN '✓ 通过' ELSE '✗ 失败' END;
    RAISE NOTICE '    5. emp_import_mapping_rule:     %', CASE WHEN v_eimr > 0 THEN '✓ 通过' ELSE '✗ 失败' END;
    RAISE NOTICE '    6. emp_position_mapping_rule:   %', CASE WHEN v_epmr > 0 THEN '✓ 通过' ELSE '✗ 失败' END;
    RAISE NOTICE '    7. emp_import_mapping_version:  %', CASE WHEN v_eirv > 0 THEN '✓ 通过' ELSE '✗ 失败' END;
    RAISE NOTICE '    8. employee_import_batch:       %', CASE WHEN v_eib > 0 THEN '✓ 通过' ELSE '✗ 失败' END;
    RAISE NOTICE '    9. employee_import_pending:     %', CASE WHEN v_eip > 0 THEN '✓ 通过' ELSE '✗ 失败' END;
    RAISE NOTICE '  position扩展字段:                  %/3', v_pos_fields;
    RAISE NOTICE '  历史兼容视图 hse_grid_responsibility: %', CASE WHEN v_view > 0 THEN '✓ 通过' ELSE '✗ 失败' END;
    RAISE NOTICE '========================================';
    RAISE NOTICE '  v69迁移完成！';
    RAISE NOTICE '  下一步: 执行 v69 初始化数据脚本';
    RAISE NOTICE '========================================';
END $$;

COMMIT;
