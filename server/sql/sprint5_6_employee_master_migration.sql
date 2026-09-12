-- ============================================================
-- HSE Sprint5.6 员工主数据中心迁移脚本
-- 版本: v70（紧接 v68 组织中心 + v67 花名册扩展）
-- 新增: employee_assignment / 5张导入配置表 / v_employee_current 视图
-- 废弃: hse_employee_relation（由 employee_assignment 替代，不删除旧表）
-- 方式: 增量迁移，可重复执行，不删旧表，仅新增
-- 执行: psql -U postgres -d safety_dashboard -f sprint5_6_employee_master_migration.sql
-- ============================================================

BEGIN;

-- ============================================================
-- 一、employee_assignment — 统一员工任职关系表
-- ============================================================
-- 定位：替代 hse_employee_relation，统一维护员工与组织/作业单元/岗位/上级关系

CREATE TABLE IF NOT EXISTS employee_assignment (
    id                  BIGSERIAL    PRIMARY KEY,
    employee_id         BIGINT       NOT NULL,
    org_unit_id         BIGINT       NOT NULL,
    operation_unit_id   BIGINT,
    position_id         BIGINT       NOT NULL,
    supervisor_id       BIGINT,
    is_primary          BOOLEAN      NOT NULL DEFAULT true,
    is_current          BOOLEAN      NOT NULL DEFAULT true,
    status              VARCHAR(20)  NOT NULL DEFAULT 'active',
    start_date          DATE         NOT NULL DEFAULT CURRENT_DATE,
    end_date            DATE,
    remark              VARCHAR(256),
    created_by          VARCHAR(64),
    updated_by          VARCHAR(64),
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted          BOOLEAN      NOT NULL DEFAULT false
);

COMMENT ON TABLE  employee_assignment IS 'Sprint5.6 统一员工任职关系表（组织+作业单元+岗位+上级）';
COMMENT ON COLUMN employee_assignment.employee_id       IS '员工ID（关联employee.id）';
COMMENT ON COLUMN employee_assignment.org_unit_id       IS '管理组织ID（关联hse_org_unit.id，必有）';
COMMENT ON COLUMN employee_assignment.operation_unit_id IS '生产作业单元ID（关联hse_operation_unit.id，管理人员可为NULL）';
COMMENT ON COLUMN employee_assignment.position_id       IS '岗位ID（关联position.id，必有）';
COMMENT ON COLUMN employee_assignment.supervisor_id     IS '直接上级员工ID（关联employee.id）';
COMMENT ON COLUMN employee_assignment.is_primary        IS '是否主岗（同一时间只能一个主岗）';
COMMENT ON COLUMN employee_assignment.is_current        IS '是否当前有效关系';
COMMENT ON COLUMN employee_assignment.status            IS '状态: active/inactive';
COMMENT ON COLUMN employee_assignment.start_date        IS '关系开始日期';
COMMENT ON COLUMN employee_assignment.end_date          IS '关系结束日期（调岗/离职时设置）';
COMMENT ON COLUMN employee_assignment.remark            IS '备注（如"内部调岗"）';
COMMENT ON COLUMN employee_assignment.created_by        IS '创建人';
COMMENT ON COLUMN employee_assignment.updated_by        IS '更新人';

-- 索引
CREATE INDEX IF NOT EXISTS idx_emp_assign_employee     ON employee_assignment (employee_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_emp_assign_org          ON employee_assignment (org_unit_id, is_current) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_emp_assign_unit         ON employee_assignment (operation_unit_id, is_current) WHERE is_deleted = false AND operation_unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_emp_assign_position     ON employee_assignment (position_id, is_current) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_emp_assign_supervisor   ON employee_assignment (supervisor_id) WHERE is_deleted = false AND supervisor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_emp_assign_current      ON employee_assignment (employee_id, is_current) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_emp_assign_status       ON employee_assignment (status) WHERE is_deleted = false;

-- 主岗唯一约束（同一员工当前只能一个主岗）
CREATE UNIQUE INDEX IF NOT EXISTS uk_emp_assign_primary
    ON employee_assignment (employee_id)
    WHERE is_primary = true AND is_current = true AND is_deleted = false;

-- ============================================================
-- 二、employee_import_batch — 导入批次表
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_import_batch (
    id              BIGSERIAL    PRIMARY KEY,
    batch_no        VARCHAR(64)  NOT NULL UNIQUE,
    file_name       VARCHAR(256),
    rule_version    VARCHAR(20),
    total_count     INTEGER      DEFAULT 0,
    success_count   INTEGER      DEFAULT 0,
    pending_count   INTEGER      DEFAULT 0,
    skipped_count   INTEGER      DEFAULT 0,
    status          VARCHAR(20)  NOT NULL DEFAULT 'uploaded',
    uploaded_by     VARCHAR(64),
    uploaded_at     TIMESTAMP,
    completed_at    TIMESTAMP,
    operator        VARCHAR(64),
    import_source   VARCHAR(32)  DEFAULT 'web',
    client_ip       VARCHAR(64),
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted      BOOLEAN      NOT NULL DEFAULT false
);

COMMENT ON TABLE  employee_import_batch IS '员工花名册导入批次表';
COMMENT ON COLUMN employee_import_batch.batch_no        IS '批次号（业务唯一）';
COMMENT ON COLUMN employee_import_batch.rule_version    IS '使用的映射规则版本';
COMMENT ON COLUMN employee_import_batch.status          IS '状态: uploaded/parsing/validating/matching/pending_review/reviewing/importing/completed/failed';
COMMENT ON COLUMN employee_import_batch.operator        IS '操作人（审计）';
COMMENT ON COLUMN employee_import_batch.import_source   IS '导入来源: web/api/batch';
COMMENT ON COLUMN employee_import_batch.client_ip       IS '客户端IP（审计）';

CREATE INDEX IF NOT EXISTS idx_imp_batch_status     ON employee_import_batch (status) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_imp_batch_operator   ON employee_import_batch (operator) WHERE is_deleted = false AND operator IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_imp_batch_created    ON employee_import_batch (created_at) WHERE is_deleted = false;

-- ============================================================
-- 三、employee_import_pending — 待确认记录表
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_import_pending (
    id              BIGSERIAL    PRIMARY KEY,
    batch_id        BIGINT       NOT NULL,
    row_num         INTEGER,
    employee_no     VARCHAR(64),
    employee_name   VARCHAR(64),
    id_card_hash    VARCHAR(64),
    phone_hash      VARCHAR(64),
    raw_dept        VARCHAR(128),
    raw_position    VARCHAR(128),
    raw_team        VARCHAR(128),
    hire_date       DATE,
    is_driver       BOOLEAN,
    license_type    VARCHAR(32),
    pending_type    VARCHAR(32)  NOT NULL,
    pending_desc    VARCHAR(256),
    resolution      VARCHAR(32),
    resolved_by     VARCHAR(64),
    resolved_at     TIMESTAMP,
    target_org_id   BIGINT,
    target_unit_id  BIGINT,
    target_pos_id   BIGINT,
    rule_version    VARCHAR(20),
    status          VARCHAR(20)  NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted      BOOLEAN      NOT NULL DEFAULT false
);

COMMENT ON TABLE  employee_import_pending IS '员工导入待确认记录表（异常数据临时存储）';
COMMENT ON COLUMN employee_import_pending.batch_id        IS '关联批次ID';
COMMENT ON COLUMN employee_import_pending.row_num         IS 'Excel行号';
COMMENT ON COLUMN employee_import_pending.employee_no     IS '原始员工编号';
COMMENT ON COLUMN employee_import_pending.employee_name   IS '原始姓名';
COMMENT ON COLUMN employee_import_pending.id_card_hash    IS '身份证号哈希（用于匹配）';
COMMENT ON COLUMN employee_import_pending.phone_hash      IS '手机号哈希（用于匹配）';
COMMENT ON COLUMN employee_import_pending.raw_dept        IS '原始所属部门';
COMMENT ON COLUMN employee_import_pending.raw_position    IS '原始职位';
COMMENT ON COLUMN employee_import_pending.raw_team        IS '原始班组';
COMMENT ON COLUMN employee_import_pending.pending_type    IS '异常类型: unknown_dept/unknown_position/duplicate_employee/id_card_conflict/missing_field';
COMMENT ON COLUMN employee_import_pending.pending_desc    IS '异常描述';
COMMENT ON COLUMN employee_import_pending.resolution      IS '处理方式: confirm/skip/add_rule';
COMMENT ON COLUMN employee_import_pending.resolved_by     IS '处理人';
COMMENT ON COLUMN employee_import_pending.target_org_id   IS '审核后指定的组织ID';
COMMENT ON COLUMN employee_import_pending.target_unit_id  IS '审核后指定的作业单元ID';
COMMENT ON COLUMN employee_import_pending.target_pos_id   IS '审核后指定的岗位ID';
COMMENT ON COLUMN employee_import_pending.rule_version    IS '使用的导入规则版本';
COMMENT ON COLUMN employee_import_pending.status          IS '状态: pending/approved/rejected/imported';

CREATE INDEX IF NOT EXISTS idx_imp_pending_batch      ON employee_import_pending (batch_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_imp_pending_status     ON employee_import_pending (status) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_imp_pending_type       ON employee_import_pending (pending_type) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_imp_pending_emp_no     ON employee_import_pending (employee_no) WHERE is_deleted = false AND employee_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_imp_pending_idhash     ON employee_import_pending (id_card_hash) WHERE is_deleted = false AND id_card_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_imp_pending_batch_status ON employee_import_pending (batch_id, status) WHERE is_deleted = false;

-- ============================================================
-- 四、employee_import_mapping_rule — 组织映射规则表
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_import_mapping_rule (
    id              BIGSERIAL    PRIMARY KEY,
    source_value    VARCHAR(128) NOT NULL,
    source_type     VARCHAR(32)  NOT NULL DEFAULT 'excel_department',
    target_type     VARCHAR(32)  NOT NULL,
    target_id       BIGINT,
    target_name     VARCHAR(128),
    condition_dept  VARCHAR(128),
    rule_version    VARCHAR(20)  NOT NULL DEFAULT 'v1.0',
    match_priority  INTEGER      DEFAULT 0,
    remark          VARCHAR(256),
    status          VARCHAR(20)  NOT NULL DEFAULT 'active',
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted      BOOLEAN      NOT NULL DEFAULT false
);

COMMENT ON TABLE  employee_import_mapping_rule IS '员工导入组织映射规则表（Excel部门→组织/作业单元）';
COMMENT ON COLUMN employee_import_mapping_rule.source_value    IS 'Excel原始值';
COMMENT ON COLUMN employee_import_mapping_rule.source_type     IS '来源类型: excel_department/excel_position';
COMMENT ON COLUMN employee_import_mapping_rule.target_type     IS '目标类型: org_unit/operation_unit';
COMMENT ON COLUMN employee_import_mapping_rule.target_id       IS '目标记录ID';
COMMENT ON COLUMN employee_import_mapping_rule.target_name     IS '目标名称（冗余，便于查看）';
COMMENT ON COLUMN employee_import_mapping_rule.condition_dept  IS '条件部门（用于复杂匹配）';
COMMENT ON COLUMN employee_import_mapping_rule.rule_version    IS '规则版本';
COMMENT ON COLUMN employee_import_mapping_rule.match_priority  IS '匹配优先级（数值越大越优先）';

CREATE INDEX IF NOT EXISTS idx_imp_map_source       ON employee_import_mapping_rule (source_value, source_type) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_imp_map_target       ON employee_import_mapping_rule (target_type, target_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_imp_map_version      ON employee_import_mapping_rule (rule_version) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_imp_map_cond         ON employee_import_mapping_rule (source_value, condition_dept) WHERE is_deleted = false AND condition_dept IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_imp_map_active       ON employee_import_mapping_rule (source_value, status, match_priority DESC) WHERE is_deleted = false;

-- ============================================================
-- 五、employee_position_mapping_rule — 岗位映射规则表
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_position_mapping_rule (
    id                   BIGSERIAL    PRIMARY KEY,
    source_position      VARCHAR(128) NOT NULL,
    target_position_id   BIGINT       NOT NULL,
    target_position_name VARCHAR(128),
    condition_dept       VARCHAR(128),
    rule_version         VARCHAR(20)  NOT NULL DEFAULT 'v1.0',
    effective_date       DATE         NOT NULL DEFAULT CURRENT_DATE,
    expire_date          DATE,
    status               VARCHAR(20)  NOT NULL DEFAULT 'active',
    remark               VARCHAR(256),
    created_by           VARCHAR(64),
    created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted           BOOLEAN      NOT NULL DEFAULT false
);

COMMENT ON TABLE  employee_position_mapping_rule IS '员工导入岗位映射规则表（Excel职位→标准岗位，含司机细分）';
COMMENT ON COLUMN employee_position_mapping_rule.source_position      IS 'Excel原始职位名';
COMMENT ON COLUMN employee_position_mapping_rule.target_position_id   IS '目标标准岗位ID（关联position.id）';
COMMENT ON COLUMN employee_position_mapping_rule.target_position_name IS '目标岗位名称（冗余）';
COMMENT ON COLUMN employee_position_mapping_rule.condition_dept       IS '条件：所属部门（司机细分用: 车队/*片区）';
COMMENT ON COLUMN employee_position_mapping_rule.rule_version         IS '规则版本';
COMMENT ON COLUMN employee_position_mapping_rule.effective_date       IS '生效日期';
COMMENT ON COLUMN employee_position_mapping_rule.expire_date          IS '失效日期';

CREATE INDEX IF NOT EXISTS idx_pos_map_source       ON employee_position_mapping_rule (source_position) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_pos_map_version      ON employee_position_mapping_rule (rule_version) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_pos_map_cond         ON employee_position_mapping_rule (source_position, condition_dept) WHERE is_deleted = false AND condition_dept IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pos_map_target       ON employee_position_mapping_rule (target_position_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_pos_map_active       ON employee_position_mapping_rule (source_position, status, effective_date, expire_date) WHERE is_deleted = false;

-- ============================================================
-- 六、employee_import_mapping_rule_version — 规则版本管理表
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_import_mapping_rule_version (
    id              BIGSERIAL    PRIMARY KEY,
    version         VARCHAR(20)  NOT NULL UNIQUE,
    version_desc    VARCHAR(256),
    effective_date  DATE         NOT NULL DEFAULT CURRENT_DATE,
    expire_date     DATE,
    status          VARCHAR(20)  NOT NULL DEFAULT 'active',
    created_by      VARCHAR(64),
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted      BOOLEAN      NOT NULL DEFAULT false
);

COMMENT ON TABLE  employee_import_mapping_rule_version IS '员工导入映射规则版本管理表';
COMMENT ON COLUMN employee_import_mapping_rule_version.version        IS '版本号（如 v1.0）';
COMMENT ON COLUMN employee_import_mapping_rule_version.version_desc   IS '版本描述';
COMMENT ON COLUMN employee_import_mapping_rule_version.effective_date IS '生效日期';
COMMENT ON COLUMN employee_import_mapping_rule_version.expire_date    IS '失效日期';

CREATE INDEX IF NOT EXISTS idx_imp_ver_status ON employee_import_mapping_rule_version (status) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_imp_ver_date   ON employee_import_mapping_rule_version (effective_date, expire_date) WHERE is_deleted = false;

-- ============================================================
-- 七、v_employee_current — 当前员工全景视图（基于 employee_assignment）
-- ============================================================
-- 注意：替代 v68 的 v_employee_org_full（基于 hse_employee_relation）

CREATE OR REPLACE VIEW v_employee_current AS
SELECT DISTINCT ON (e.id)
    e.id AS employee_id,
    e.employee_code,
    e.name,
    e.gender,
    e.birth_date,
    e.phone,
    e.id_card,
    e.person_category,
    e.person_type,
    e.is_public_welfare,
    e.id_address,
    CASE WHEN e.birth_date IS NOT NULL THEN EXTRACT(YEAR FROM age(e.birth_date))::INT ELSE NULL END AS age,
    a.id AS assignment_id,
    a.org_unit_id,
    ou.org_name,
    ou.org_type,
    ou.org_code,
    ou.org_path,
    a.operation_unit_id,
    opu.unit_name,
    opu.unit_type,
    opu.unit_code,
    a.position_id,
    p.name AS position_name,
    p.position_code,
    p.job_category AS position_type,
    p.risk_level,
    p.is_safety_critical,
    a.supervisor_id,
    sup.name AS supervisor_name,
    a.status AS assignment_status,
    a.is_current,
    a.is_primary,
    a.start_date,
    a.end_date,
    a.remark,
    a.created_at AS assigned_at,
    e.is_deleted AS employee_deleted
FROM employee e
LEFT JOIN employee_assignment a
    ON a.employee_id = e.id
    AND a.is_current = true
    AND a.is_primary = true
    AND a.is_deleted = false
LEFT JOIN hse_org_unit ou ON ou.id = a.org_unit_id AND ou.is_deleted = false
LEFT JOIN hse_operation_unit opu ON opu.id = a.operation_unit_id AND opu.is_deleted = false
LEFT JOIN position p ON p.id = a.position_id AND p.is_deleted = false
LEFT JOIN employee sup ON sup.id = a.supervisor_id AND sup.is_deleted = false
WHERE e.is_deleted = false
ORDER BY e.id, a.start_date DESC NULLS LAST;

COMMENT ON VIEW v_employee_current IS '当前员工全景视图（Sprint5.6，基于 employee_assignment）';

-- ============================================================
-- 八、验证查询
-- ============================================================

DO $$
DECLARE
    v_assign_count INTEGER;
    v_batch_count INTEGER;
    v_pending_count INTEGER;
    v_map_count INTEGER;
    v_pos_map_count INTEGER;
    v_ver_count INTEGER;
    v_view_count INTEGER;
    v_assign_idx_count INTEGER;
    v_batch_idx_count INTEGER;
    v_pending_idx_count INTEGER;
    v_map_idx_count INTEGER;
    v_pos_map_idx_count INTEGER;
    v_ver_idx_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_assign_count FROM information_schema.tables WHERE table_name = 'employee_assignment';
    SELECT COUNT(*) INTO v_batch_count FROM information_schema.tables WHERE table_name = 'employee_import_batch';
    SELECT COUNT(*) INTO v_pending_count FROM information_schema.tables WHERE table_name = 'employee_import_pending';
    SELECT COUNT(*) INTO v_map_count FROM information_schema.tables WHERE table_name = 'employee_import_mapping_rule';
    SELECT COUNT(*) INTO v_pos_map_count FROM information_schema.tables WHERE table_name = 'employee_position_mapping_rule';
    SELECT COUNT(*) INTO v_ver_count FROM information_schema.tables WHERE table_name = 'employee_import_mapping_rule_version';
    SELECT COUNT(*) INTO v_view_count FROM information_schema.views WHERE table_name = 'v_employee_current';

    SELECT COUNT(*) INTO v_assign_idx_count FROM pg_indexes WHERE tablename = 'employee_assignment';
    SELECT COUNT(*) INTO v_batch_idx_count FROM pg_indexes WHERE tablename = 'employee_import_batch';
    SELECT COUNT(*) INTO v_pending_idx_count FROM pg_indexes WHERE tablename = 'employee_import_pending';
    SELECT COUNT(*) INTO v_map_idx_count FROM pg_indexes WHERE tablename = 'employee_import_mapping_rule';
    SELECT COUNT(*) INTO v_pos_map_idx_count FROM pg_indexes WHERE tablename = 'employee_position_mapping_rule';
    SELECT COUNT(*) INTO v_ver_idx_count FROM pg_indexes WHERE tablename = 'employee_import_mapping_rule_version';

    RAISE NOTICE '========================================';
    RAISE NOTICE '  HSE Sprint5.6 迁移验证';
    RAISE NOTICE '========================================';
    RAISE NOTICE '  1. employee_assignment 表:           %', CASE WHEN v_assign_count > 0 THEN '✓ 通过' ELSE '✗ 失败' END;
    RAISE NOTICE '  2. employee_import_batch 表:         %', CASE WHEN v_batch_count > 0 THEN '✓ 通过' ELSE '✗ 失败' END;
    RAISE NOTICE '  3. employee_import_pending 表:       %', CASE WHEN v_pending_count > 0 THEN '✓ 通过' ELSE '✗ 失败' END;
    RAISE NOTICE '  4. employee_import_mapping_rule 表:  %', CASE WHEN v_map_count > 0 THEN '✓ 通过' ELSE '✗ 失败' END;
    RAISE NOTICE '  5. employee_position_mapping_rule 表:%', CASE WHEN v_pos_map_count > 0 THEN '✓ 通过' ELSE '✗ 失败' END;
    RAISE NOTICE '  6. employee_import_mapping_rule_version 表:%', CASE WHEN v_ver_count > 0 THEN '✓ 通过' ELSE '✗ 失败' END;
    RAISE NOTICE '  7. v_employee_current 视图:          %', CASE WHEN v_view_count > 0 THEN '✓ 通过' ELSE '✗ 失败' END;
    RAISE NOTICE '  索引统计:';
    RAISE NOTICE '    - employee_assignment:     % 个索引', v_assign_idx_count;
    RAISE NOTICE '    - employee_import_batch:   % 个索引', v_batch_idx_count;
    RAISE NOTICE '    - employee_import_pending: % 个索引', v_pending_idx_count;
    RAISE NOTICE '    - import_mapping_rule:     % 个索引', v_map_idx_count;
    RAISE NOTICE '    - position_mapping_rule:   % 个索引', v_pos_map_idx_count;
    RAISE NOTICE '    - rule_version:            % 个索引', v_ver_idx_count;
    RAISE NOTICE '========================================';
    RAISE NOTICE '  Sprint5.6 迁移完成！';
    RAISE NOTICE '========================================';
END $$;

COMMIT;
