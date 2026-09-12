-- ============================================================
-- HSE 人员主数据中心 Sprint5.1 迁移脚本
-- 版本: v59
--
-- 依据: hse-employee-master-data-design-v1.2-freeze.md
-- 范围: 人员主数据基础能力（不含 Sprint5.2/5.3 内容）
--
-- 新增表:
--   1. department         - 组织模型（五级树形）
--   2. position           - 岗位模型
--   3. employee           - 员工主表（唯一人员表）
--   4. hse_employee_org   - 人员组织关系
--   5. employee_history   - 人事变动记录
--
-- 新增视图:
--   1. v_employee_with_age - 员工视图（通过 birth_date 计算年龄）
--
-- 设计要点:
--   - employee 为唯一人员主表，所有关联使用 employee_id
--   - 无 age 字段，年龄由 birth_date 计算（视图或内联 SQL）
--   - person_type 四类: 生产人员/管理人员/技术人员/辅助人员（不含驾驶员）
--   - org_path 组织路径快照，历史记录不可变
--   - is_current 标识当前记录，调岗时旧记录 is_current=false 并设 end_date
--   - 统一审计字段: created_at / updated_at / is_deleted
--   - 软删除: 所有表使用 is_deleted BOOLEAN DEFAULT FALSE
--   - 加密字段: id_card VARCHAR(128), phone VARCHAR(64) 以容纳 AES-256-GCM 密文
--
-- 约束: 增量迁移，仅 CREATE TABLE IF NOT EXISTS，不修改已有表结构
-- ============================================================

BEGIN;

-- ============================================================
-- 1. department — 组织模型（五级树形）
-- ============================================================
CREATE TABLE IF NOT EXISTS department (
    id              BIGSERIAL PRIMARY KEY,
    dept_code       VARCHAR(50)  NOT NULL UNIQUE,
    name            VARCHAR(100) NOT NULL,
    short_name      VARCHAR(50),
    parent_id       BIGINT       REFERENCES department(id) ON DELETE RESTRICT,
    level           SMALLINT     NOT NULL CHECK (level BETWEEN 1 AND 5),
    -- 1=集团 2=区域公司 3=企业 4=项目 5=班组
    path            VARCHAR(500) NOT NULL DEFAULT '/',
    -- 层级路径，如 /1/5/12/，便于祖先/后代查询
    township        VARCHAR(100),
    -- 所属乡镇（环卫项目特有）
    manager_id      BIGINT,
    -- 部门负责人 employee_id
    safety_manager_id BIGINT,
    -- 安全负责人 employee_id
    headcount       INTEGER      NOT NULL DEFAULT 0,
    -- 编制人数
    sort_order      INTEGER      NOT NULL DEFAULT 0,
    status          VARCHAR(20)  NOT NULL DEFAULT 'active',
    -- active / inactive / merged / dissolved
    description     TEXT,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_department_parent    ON department(parent_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_department_level     ON department(level)     WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_department_path      ON department(path)      WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_department_township  ON department(township)  WHERE township IS NOT NULL AND is_deleted = false;

COMMENT ON TABLE  department            IS '组织模型 - 五级树形（集团/区域/企业/项目/班组）';
COMMENT ON COLUMN department.dept_code  IS '部门编码（业务唯一）';
COMMENT ON COLUMN department.level      IS '层级: 1=集团 2=区域公司 3=企业 4=项目 5=班组';
COMMENT ON COLUMN department.path       IS '层级路径 /1/5/12/，便于祖先/后代查询';
COMMENT ON COLUMN department.township   IS '所属乡镇（环卫项目特有）';

-- ============================================================
-- 2. position — 岗位模型
-- ============================================================
CREATE TABLE IF NOT EXISTS position (
    id                  BIGSERIAL PRIMARY KEY,
    position_code       VARCHAR(50)  NOT NULL UNIQUE,
    name                VARCHAR(100) NOT NULL,
    dept_id             BIGINT       REFERENCES department(id) ON DELETE RESTRICT,
    job_category        VARCHAR(50),
    -- 工种分类: 管理/技术/生产/辅助/特种
    is_special_post     BOOLEAN      NOT NULL DEFAULT FALSE,
    -- 是否特种作业岗位（电工/焊工/叉车等）
    is_safety_critical  BOOLEAN      NOT NULL DEFAULT FALSE,
    -- 是否安全关键岗位
    safety_duties       TEXT,
    -- 安全职责描述
    sort_order          INTEGER      NOT NULL DEFAULT 0,
    status              VARCHAR(20)  NOT NULL DEFAULT 'active',
    created_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    is_deleted          BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_position_dept  ON position(dept_id) WHERE is_deleted = false;

COMMENT ON TABLE  position                  IS '岗位模型';
COMMENT ON COLUMN position.is_special_post  IS '是否特种作业岗位（电工/焊工/叉车等）';
COMMENT ON COLUMN position.is_safety_critical IS '是否安全关键岗位';

-- ============================================================
-- 3. employee — 员工主表（唯一人员表）
-- ============================================================
-- 设计原则:
--   1. employee 为唯一人员主表，禁止新增其他人员表
--   2. 所有关联使用 employee_id
--   3. 无 age 字段，年龄统一由 birth_date 计算（视图或内联 SQL）
--   4. id_card / phone 使用 AES-256-GCM 加密存储（随机 IV）
--   5. id_card VARCHAR(128) / phone VARCHAR(64) 以容纳密文（ENC:base64(iv+ciphertext+authTag)）
CREATE TABLE IF NOT EXISTS employee (
    id                  BIGSERIAL PRIMARY KEY,
    employee_code       VARCHAR(50),
    -- 工号（业务唯一，可为空表示外部人员）
    id_card             VARCHAR(128),
    -- 身份证号（AES-256-GCM 加密存储）
    name                VARCHAR(100) NOT NULL,
    gender              VARCHAR(10),
    -- 男 / 女
    birth_date          DATE,
    phone               VARCHAR(64),
    -- 手机号（AES-256-GCM 加密存储）
    person_category     VARCHAR(20),
    -- 人员分类: 适龄人员 / 超龄人员
    person_type         VARCHAR(20),
    -- 人员类型: 生产人员 / 管理人员 / 技术人员 / 辅助人员（不含驾驶员）
    is_public_welfare   BOOLEAN      NOT NULL DEFAULT FALSE,
    -- 是否公益岗
    created_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    is_deleted          BOOLEAN      NOT NULL DEFAULT FALSE
);

-- 工号唯一性（仅未软删记录；工号可为空）
CREATE UNIQUE INDEX IF NOT EXISTS uk_employee_code
    ON employee (employee_code) WHERE employee_code IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_employee_name    ON employee(name)        WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_employee_type    ON employee(person_type) WHERE person_type IS NOT NULL AND is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_employee_category ON employee(person_category) WHERE person_category IS NOT NULL AND is_deleted = false;

COMMENT ON TABLE  employee                  IS '员工主表（唯一人员表）';
COMMENT ON COLUMN employee.id_card          IS '身份证号（AES-256-GCM 加密存储，随机IV，密文不可比较）';
COMMENT ON COLUMN employee.phone            IS '手机号（AES-256-GCM 加密存储）';
COMMENT ON COLUMN employee.person_type      IS '人员类型: 生产人员/管理人员/技术人员/辅助人员（不含驾驶员）';
COMMENT ON COLUMN employee.person_category  IS '人员分类: 适龄人员/超龄人员';

-- ============================================================
-- 4. hse_employee_org — 人员组织关系
-- ============================================================
-- 设计原则:
--   1. 支持五级组织：group_id(集团) / region_id(区域) / enterprise_id(企业) / project_id(项目) / team_id(班组)
--   2. org_path 为路径快照，如 /集团名/区域名/企业名/项目名/班组名，历史记录不可变
--   3. is_current 标识当前记录，调岗时旧记录 is_current=false 并设 end_date
--   4. status 状态机: 入职→在职→待岗→复岗(在职)→离职/退休(终态) / 返聘
CREATE TABLE IF NOT EXISTS hse_employee_org (
    id              BIGSERIAL PRIMARY KEY,
    employee_id     BIGINT       NOT NULL REFERENCES employee(id) ON DELETE RESTRICT,
    -- 五级组织引用
    group_id        BIGINT       REFERENCES department(id) ON DELETE RESTRICT,
    region_id       BIGINT       REFERENCES department(id) ON DELETE RESTRICT,
    enterprise_id   BIGINT       REFERENCES department(id) ON DELETE RESTRICT,
    project_id      BIGINT       REFERENCES department(id) ON DELETE RESTRICT,
    team_id         BIGINT       REFERENCES department(id) ON DELETE RESTRICT,
    org_path        VARCHAR(500),
    -- 组织路径快照: /集团名/区域名/企业名/项目名/班组名
    position_id     BIGINT       REFERENCES position(id) ON DELETE RESTRICT,
    supervisor_id   BIGINT       REFERENCES employee(id) ON DELETE SET NULL,
    -- 直接主管 employee_id
    start_date      DATE         NOT NULL,
    end_date        DATE,
    -- 当前记录为 NULL；调岗后旧记录设为结束日期
    status          VARCHAR(20)  NOT NULL DEFAULT '在职',
    -- 在职 / 待岗 / 离职 / 退休 / 返聘
    is_current      BOOLEAN      NOT NULL DEFAULT TRUE,
    -- 是否当前记录（一个员工同时只有一条 is_current=true）
    change_reason   VARCHAR(200),
    -- 变动原因
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_emp_org_employee   ON hse_employee_org(employee_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_emp_org_current    ON hse_employee_org(employee_id, is_current) WHERE is_current = true AND is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_emp_org_team       ON hse_employee_org(team_id)     WHERE team_id IS NOT NULL AND is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_emp_org_project    ON hse_employee_org(project_id)  WHERE project_id IS NOT NULL AND is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_emp_org_enterprise ON hse_employee_org(enterprise_id) WHERE enterprise_id IS NOT NULL AND is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_emp_org_status     ON hse_employee_org(status)      WHERE is_deleted = false;

COMMENT ON TABLE  hse_employee_org          IS '人员组织关系（支持调岗流程，is_current标识当前记录）';
COMMENT ON COLUMN hse_employee_org.org_path IS '组织路径快照: /集团名/区域名/企业名/项目名/班组名（历史记录不可变）';
COMMENT ON COLUMN hse_employee_org.is_current IS '是否当前记录（一个员工同时只有一条 is_current=true）';

-- ============================================================
-- 5. employee_history — 人事变动记录
-- ============================================================
-- 设计原则:
--   1. 记录员工全生命周期事件: 入职/调岗/待岗/复岗/离职/退休/返聘
--   2. 包含变动前后的部门/岗位/状态，便于追溯
--   3. 支持 approval_no 审批单号关联（如有审批系统）
CREATE TABLE IF NOT EXISTS employee_history (
    id                  BIGSERIAL PRIMARY KEY,
    employee_id         BIGINT       NOT NULL REFERENCES employee(id) ON DELETE RESTRICT,
    event_type          VARCHAR(20)  NOT NULL,
    -- 入职 / 调岗 / 待岗 / 复岗 / 离职 / 退休 / 返聘 / 状态变更
    event_date          DATE         NOT NULL,
    -- 变动前
    before_dept_id      BIGINT,
    before_position_id  BIGINT,
    before_status       VARCHAR(20),
    -- 变动后
    after_dept_id       BIGINT,
    after_position_id   BIGINT,
    after_status        VARCHAR(20),
    -- 审批信息
    approver_id         BIGINT,
    approve_date        DATE,
    approval_no         VARCHAR(100),
    remark              TEXT,
    created_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    is_deleted          BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_emp_history_employee ON employee_history(employee_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_emp_history_date     ON employee_history(event_date)  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_emp_history_type     ON employee_history(event_type)  WHERE is_deleted = false;

COMMENT ON TABLE  employee_history            IS '人事变动记录（员工全生命周期）';
COMMENT ON COLUMN employee_history.event_type IS '事件类型: 入职/调岗/待岗/复岗/离职/退休/返聘/状态变更';

-- ============================================================
-- 6. v_employee_with_age — 员工视图（含年龄计算）
-- ============================================================
-- 通过 EXTRACT(YEAR FROM age(birth_date))::INT 计算年龄
CREATE OR REPLACE VIEW v_employee_with_age AS
SELECT
    id,
    employee_code,
    id_card,
    name,
    gender,
    birth_date,
    phone,
    person_category,
    person_type,
    is_public_welfare,
    CASE
        WHEN birth_date IS NOT NULL THEN EXTRACT(YEAR FROM age(birth_date))::INT
        ELSE NULL
    END AS age,
    created_at,
    updated_at,
    is_deleted
FROM employee
WHERE is_deleted = false;

COMMENT ON VIEW v_employee_with_age IS '员工视图（通过 birth_date 计算年龄）';

COMMIT;

-- ============================================================
-- 验证查询
-- ============================================================
SELECT 'department' AS table_name, COUNT(*) AS column_count
FROM information_schema.columns WHERE table_name = 'department'
UNION ALL
SELECT 'position', COUNT(*) FROM information_schema.columns WHERE table_name = 'position'
UNION ALL
SELECT 'employee', COUNT(*) FROM information_schema.columns WHERE table_name = 'employee'
UNION ALL
SELECT 'hse_employee_org', COUNT(*) FROM information_schema.columns WHERE table_name = 'hse_employee_org'
UNION ALL
SELECT 'employee_history', COUNT(*) FROM information_schema.columns WHERE table_name = 'employee_history'
ORDER BY table_name;

-- 检查视图是否存在
SELECT viewname FROM pg_views WHERE viewname = 'v_employee_with_age';

-- ============================================================
-- 迁移说明
-- ============================================================
-- 1. 所有表使用 BIGSERIAL 主键（BIGINT 自增）
-- 2. 所有表包含统一审计字段: created_at / updated_at / is_deleted
-- 3. 所有表使用软删除 (is_deleted BOOLEAN DEFAULT FALSE)
-- 4. 加密字段 id_card / phone 列宽足够容纳 AES-256-GCM 密文
-- 5. 工号 employee_code 可为空（表示外部人员），但非空时唯一
-- 6. hse_employee_org.is_current 确保一个员工同时只有一条当前记录（应用层保证）
-- 7. v59 不包含 Sprint5.1.1 加固字段:
--    - employee_history.operator_id (v60 新增)
--    - employee.id_card_hash / phone_hash (v60 新增)
