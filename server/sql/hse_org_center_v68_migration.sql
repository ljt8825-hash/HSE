-- ============================================================
-- HSE V2.1 组织中心迁移脚本
-- 版本: v68（紧接 v67 花名册表头对齐扩展）
-- 新增: hse_org_unit / hse_operation_unit / hse_employee_relation
-- 方式: 增量迁移，可重复执行，不删旧表，仅新增/标记
-- 执行: psql -U hse_user -d hse_db -f hse_org_center_v68_migration.sql
-- ============================================================

BEGIN;

-- ============================================================
-- 一、hse_org_unit — 管理组织单元表
-- ============================================================

CREATE TABLE IF NOT EXISTS hse_org_unit (
    id              BIGSERIAL    PRIMARY KEY,
    parent_id       BIGINT,
    org_name        VARCHAR(128) NOT NULL,
    org_type        VARCHAR(32)  NOT NULL,
    org_code        VARCHAR(64)  NOT NULL,
    org_path        VARCHAR(512),
    level           INTEGER,
    sort_order      INTEGER      DEFAULT 0,
    headcount       INTEGER      DEFAULT 0,
    status          VARCHAR(20)  NOT NULL DEFAULT 'active',
    description     VARCHAR(256),
    manager_id      BIGINT,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE  hse_org_unit IS 'HSE V2.1 管理组织单元表（公司/部门/中心/乡镇四级）';
COMMENT ON COLUMN hse_org_unit.parent_id   IS '父组织ID，根节点为NULL';
COMMENT ON COLUMN hse_org_unit.org_name    IS '组织名称';
COMMENT ON COLUMN hse_org_unit.org_type    IS '组织类型: company/department/center/town_center';
COMMENT ON COLUMN hse_org_unit.org_code    IS '组织编码（唯一，业务可读）';
COMMENT ON COLUMN hse_org_unit.org_path    IS '组织路径，如 /宁津项目公司/环卫作业中心/长官镇作业中心';
COMMENT ON COLUMN hse_org_unit.level       IS '层级: 1-公司, 2-部门/中心, 3-乡镇';
COMMENT ON COLUMN hse_org_unit.sort_order  IS '排序号';
COMMENT ON COLUMN hse_org_unit.headcount   IS '编制人数（冗余统计）';
COMMENT ON COLUMN hse_org_unit.status      IS '状态: active/inactive';
COMMENT ON COLUMN hse_org_unit.manager_id  IS '负责人ID（关联employee.id）';
COMMENT ON COLUMN hse_org_unit.description IS '描述';

-- 索引
CREATE UNIQUE INDEX IF NOT EXISTS uk_hse_org_unit_code     ON hse_org_unit (org_code) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_hse_org_unit_parent          ON hse_org_unit (parent_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_hse_org_unit_type            ON hse_org_unit (org_type) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_hse_org_unit_status          ON hse_org_unit (status) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_hse_org_unit_path            ON hse_org_unit (org_path) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_hse_org_unit_sort            ON hse_org_unit (sort_order) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_hse_org_unit_tree            ON hse_org_unit (parent_id, org_type, sort_order) WHERE is_deleted = false;

-- ============================================================
-- 二、hse_operation_unit — 生产作业单元表
-- ============================================================

CREATE TABLE IF NOT EXISTS hse_operation_unit (
    id              BIGSERIAL    PRIMARY KEY,
    org_unit_id     BIGINT       NOT NULL,
    unit_name       VARCHAR(128) NOT NULL,
    unit_type       VARCHAR(32)  NOT NULL,
    unit_code       VARCHAR(64)  NOT NULL,
    headcount       INTEGER      DEFAULT 0,
    location        VARCHAR(256),
    status          VARCHAR(20)  NOT NULL DEFAULT 'active',
    description     VARCHAR(256),
    supervisor_id   BIGINT,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE  hse_operation_unit IS 'HSE V2.1 生产作业单元表（保洁组/车组/转运站等）';
COMMENT ON COLUMN hse_operation_unit.org_unit_id   IS '所属管理组织ID（关联hse_org_unit.id）';
COMMENT ON COLUMN hse_operation_unit.unit_name     IS '作业单元名称';
COMMENT ON COLUMN hse_operation_unit.unit_type     IS '单元类型: cleaning_team/collection_team/transfer_station/vehicle_team/greening_team/maintenance_team';
COMMENT ON COLUMN hse_operation_unit.unit_code     IS '单元编码（唯一，业务可读）';
COMMENT ON COLUMN hse_operation_unit.headcount     IS '人员数量（冗余统计）';
COMMENT ON COLUMN hse_operation_unit.location      IS '位置/区域描述';
COMMENT ON COLUMN hse_operation_unit.status        IS '状态: active/inactive';
COMMENT ON COLUMN hse_operation_unit.supervisor_id IS '组长/负责人ID（关联employee.id）';
COMMENT ON COLUMN hse_operation_unit.description   IS '描述';

-- 索引
CREATE UNIQUE INDEX IF NOT EXISTS uk_hse_op_unit_code     ON hse_operation_unit (unit_code) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_hse_op_unit_org            ON hse_operation_unit (org_unit_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_hse_op_unit_type           ON hse_operation_unit (unit_type) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_hse_op_unit_status         ON hse_operation_unit (status) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_hse_op_unit_org_type       ON hse_operation_unit (org_unit_id, unit_type) WHERE is_deleted = false;

-- ============================================================
-- 三、hse_employee_relation — 人员-组织-作业单元关系表
-- ============================================================

CREATE TABLE IF NOT EXISTS hse_employee_relation (
    id                  BIGSERIAL    PRIMARY KEY,
    employee_id         BIGINT       NOT NULL,
    org_unit_id         BIGINT       NOT NULL,
    operation_unit_id   BIGINT,
    position_id         BIGINT,
    supervisor_id       BIGINT,
    is_current          BOOLEAN      NOT NULL DEFAULT true,
    status              VARCHAR(20)  NOT NULL DEFAULT 'active',
    start_date          DATE,
    end_date            DATE,
    is_primary          BOOLEAN      NOT NULL DEFAULT true,
    remark              VARCHAR(256),
    created_by          VARCHAR(64),
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted          BOOLEAN      NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE  hse_employee_relation IS 'HSE V2.1 人员-组织-作业单元关系表';
COMMENT ON COLUMN hse_employee_relation.employee_id       IS '员工ID（关联employee.id）';
COMMENT ON COLUMN hse_employee_relation.org_unit_id       IS '管理组织ID（关联hse_org_unit.id）';
COMMENT ON COLUMN hse_employee_relation.operation_unit_id IS '作业单元ID（关联hse_operation_unit.id，可为NULL）';
COMMENT ON COLUMN hse_employee_relation.position_id       IS '岗位ID（关联position.id）';
COMMENT ON COLUMN hse_employee_relation.supervisor_id     IS '直接上级ID（关联employee.id）';
COMMENT ON COLUMN hse_employee_relation.is_current        IS '是否当前有效关系';
COMMENT ON COLUMN hse_employee_relation.status            IS '状态: active/leave/transfer/pending';
COMMENT ON COLUMN hse_employee_relation.start_date        IS '关系开始日期';
COMMENT ON COLUMN hse_employee_relation.end_date          IS '关系结束日期';
COMMENT ON COLUMN hse_employee_relation.is_primary        IS '是否主岗（支持一人多岗）';
COMMENT ON COLUMN hse_employee_relation.remark            IS '备注';
COMMENT ON COLUMN hse_employee_relation.created_by        IS '创建人';

-- 索引
CREATE INDEX IF NOT EXISTS idx_hse_emp_rel_employee     ON hse_employee_relation (employee_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_hse_emp_rel_org          ON hse_employee_relation (org_unit_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_hse_emp_rel_op           ON hse_employee_relation (operation_unit_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_hse_emp_rel_position     ON hse_employee_relation (position_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_hse_emp_rel_supervisor   ON hse_employee_relation (supervisor_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_hse_emp_rel_current      ON hse_employee_relation (employee_id, is_current) WHERE is_deleted = false AND is_current = true;
CREATE INDEX IF NOT EXISTS idx_hse_emp_rel_org_status   ON hse_employee_relation (org_unit_id, status) WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS uk_hse_emp_rel_primary ON hse_employee_relation (employee_id) WHERE is_deleted = false AND is_current = true AND is_primary = true;

-- ============================================================
-- 四、position 表扩展字段（风险等级、安全关键岗）
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'position' AND column_name = 'risk_level') THEN
        ALTER TABLE position ADD COLUMN risk_level VARCHAR(20) DEFAULT 'medium';
        RAISE NOTICE '[v68] Added risk_level column to position';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'position' AND column_name = 'is_safety_critical') THEN
        ALTER TABLE position ADD COLUMN is_safety_critical BOOLEAN DEFAULT false;
        RAISE NOTICE '[v68] Added is_safety_critical column to position';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'position' AND column_name = 'job_category') THEN
        ALTER TABLE position ADD COLUMN job_category VARCHAR(20);
        RAISE NOTICE '[v68] Added job_category column to position';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'position' AND column_name = 'position_code') THEN
        ALTER TABLE position ADD COLUMN position_code VARCHAR(32);
        RAISE NOTICE '[v68] Added position_code column to position';
    END IF;
END $$;

COMMENT ON COLUMN position.risk_level         IS '风险等级: low/medium/high/critical';
COMMENT ON COLUMN position.is_safety_critical IS '是否安全关键岗';
COMMENT ON COLUMN position.job_category       IS '岗位类别: 管理/技术/生产/辅助';
COMMENT ON COLUMN position.position_code      IS '岗位编码（唯一）';

-- ============================================================
-- 五、旧表标记 deprecated（增量迁移，不删除）
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'department' AND column_name = 'is_deprecated') THEN
        ALTER TABLE department ADD COLUMN is_deprecated BOOLEAN DEFAULT false;
        RAISE NOTICE '[v68] Added is_deprecated column to department';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'hse_employee_org' AND column_name = 'is_deprecated') THEN
        ALTER TABLE hse_employee_org ADD COLUMN is_deprecated BOOLEAN DEFAULT false;
        RAISE NOTICE '[v68] Added is_deprecated column to hse_employee_org';
    END IF;
END $$;

COMMENT ON COLUMN department.is_deprecated       IS '是否已废弃（V2.1新组织模型启用后标记为true）';
COMMENT ON COLUMN hse_employee_org.is_deprecated IS '是否已废弃（V2.1新关系模型启用后标记为true）';

-- ============================================================
-- 六、视图 v_employee_org_full — 员工完整组织关系视图
-- 【B-1-P1-02-B 修订】原定义 LEFT JOIN hse_employee_relation（Sprint6.0 验证数据）。
--   生产实测：hse_employee_relation 共 1,304 行且 employee_id（3866~5363）与
--   employee.id（6692~10240）区间完全不相交 → 100% 断链死数据，
--   视图 relation_status='active' 恒 0 行，曾导致考核周期 targetCount=0、
--   评分冻结空转（2026-08-27 hse_fix_v_employee_org_full.sql 已在生产修复）。
--   本节原样重放会把视图改回断链版，故改为 employee_assignment 权威任职段版。
--   字段名/顺序/类型/语义与 hse_fix_v_employee_org_full.sql（现行生产定义）逐列一致；
--   employee_assignment.id 与 hse_employee_relation.id 同为 bigint，relation_id 列兼容，
--   CREATE OR REPLACE 对已存在的修复版视图可直接覆盖（幂等）。
--   若目标库视图存在但列类型漂移导致 OR REPLACE 报错，参照 hse_fix 版
--   先 DROP VIEW IF EXISTS v_employee_org_full 再执行下方 CREATE VIEW。
-- ============================================================

CREATE OR REPLACE VIEW v_employee_org_full AS
SELECT
    e.id AS employee_id,
    e.employee_code,
    e.name,
    e.gender,
    e.birth_date,
    e.phone,
    e.person_category,
    e.person_type,
    EXTRACT(YEAR FROM age(e.birth_date))::INT AS age,
    ea.id AS relation_id,
    ea.org_unit_id,
    ou.org_name,
    ou.org_type,
    ou.org_code,
    ou.org_path,
    ea.operation_unit_id,
    opu.unit_name,
    opu.unit_type,
    opu.unit_code,
    ea.position_id,
    p.name AS position_name,
    p.position_code,
    p.risk_level,
    p.is_safety_critical,
    p.job_category,
    ea.supervisor_id,
    sup.name AS supervisor_name,
    ea.status AS relation_status,
    ea.start_date,
    ea.end_date,
    ea.is_current,
    ea.is_primary,
    ea.created_at,
    e.is_deleted
FROM employee e
LEFT JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_deleted = false AND ea.is_primary = true
LEFT JOIN hse_org_unit ou ON ou.id = ea.org_unit_id AND ou.is_deleted = false
LEFT JOIN hse_operation_unit opu ON opu.id = ea.operation_unit_id AND opu.is_deleted = false
LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
LEFT JOIN employee sup ON sup.id = ea.supervisor_id AND sup.is_deleted = false;

COMMENT ON VIEW v_employee_org_full IS '员工完整组织关系视图（V2.1，数据源=employee_assignment 权威任职段；relation_id 列名保留以兼容既有消费者）';

-- ============================================================
-- 七、验证查询
-- ============================================================

DO $$
DECLARE
    v_org_unit_count INTEGER;
    v_op_unit_count INTEGER;
    v_emp_rel_count INTEGER;
    v_pos_fields INTEGER;
    v_deprecated_fields INTEGER;
    v_view_count INTEGER;
    v_org_idx_count INTEGER;
    v_op_idx_count INTEGER;
    v_rel_idx_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_org_unit_count FROM information_schema.tables WHERE table_name = 'hse_org_unit';
    SELECT COUNT(*) INTO v_op_unit_count FROM information_schema.tables WHERE table_name = 'hse_operation_unit';
    SELECT COUNT(*) INTO v_emp_rel_count FROM information_schema.tables WHERE table_name = 'hse_employee_relation';
    
    SELECT COUNT(*) INTO v_pos_fields FROM information_schema.columns
    WHERE table_name = 'position' AND column_name IN ('risk_level', 'is_safety_critical', 'job_category', 'position_code');
    
    SELECT COUNT(*) INTO v_deprecated_fields FROM information_schema.columns
    WHERE column_name = 'is_deprecated' AND table_name IN ('department', 'hse_employee_org');
    
    SELECT COUNT(*) INTO v_view_count FROM information_schema.views WHERE table_name = 'v_employee_org_full';
    
    -- 索引统计
    SELECT COUNT(*) INTO v_org_idx_count FROM pg_indexes 
    WHERE tablename = 'hse_org_unit' AND indexname LIKE '%hse_org_unit%';
    
    SELECT COUNT(*) INTO v_op_idx_count FROM pg_indexes 
    WHERE tablename = 'hse_operation_unit' AND indexname LIKE '%hse_op_unit%';
    
    SELECT COUNT(*) INTO v_rel_idx_count FROM pg_indexes 
    WHERE tablename = 'hse_employee_relation' AND indexname LIKE '%hse_emp_rel%';
    
    RAISE NOTICE '========================================';
    RAISE NOTICE '  HSE V2.1 组织中心 v68 迁移验证';
    RAISE NOTICE '========================================';
    RAISE NOTICE '  1. hse_org_unit 表:          %', CASE WHEN v_org_unit_count > 0 THEN '✓ 通过' ELSE '✗ 失败' END;
    RAISE NOTICE '  2. hse_operation_unit 表:    %', CASE WHEN v_op_unit_count > 0 THEN '✓ 通过' ELSE '✗ 失败' END;
    RAISE NOTICE '  3. hse_employee_relation 表: %', CASE WHEN v_emp_rel_count > 0 THEN '✓ 通过' ELSE '✗ 失败' END;
    RAISE NOTICE '  4. position扩展字段:         %/4', v_pos_fields;
    RAISE NOTICE '  5. 旧表标记字段:             %/2', v_deprecated_fields;
    RAISE NOTICE '  6. v_employee_org_full视图:  %', CASE WHEN v_view_count > 0 THEN '✓ 通过' ELSE '✗ 失败' END;
    RAISE NOTICE '========================================';
    RAISE NOTICE '  v68迁移完成！';
    RAISE NOTICE '========================================';
END $$;

COMMIT;
