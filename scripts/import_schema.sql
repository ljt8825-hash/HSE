-- ============================================================
-- HSE 安全管理系统 — 统一 PostgreSQL Schema（唯一权威版本）
-- 文件: unified_schema.sql
-- 数据库: safety_dashboard (已有，不重建)
-- 编码: UTF8
-- 说明: 合并 MySQL 业务表（转换）+ PostgreSQL 导入系统表
--       本文件为幂等设计，可安全重复执行
-- 执行: psql -U postgres -d safety_dashboard -f unified_schema.sql
-- ============================================================

-- ============ 0. 扩展 ============
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()


-- ============================================================
-- 1. 字典/基础数据表
-- ============================================================

-- 1.1 部门表（用于规范化 dept 字段）
CREATE TABLE IF NOT EXISTS departments (
    id           BIGSERIAL    PRIMARY KEY,
    name         VARCHAR(64)  NOT NULL,
    short_name   VARCHAR(32),
    parent_id    BIGINT,
    township     VARCHAR(32),
    sort_order   INTEGER      DEFAULT 0,
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted   BOOLEAN      NOT NULL DEFAULT false
);

COMMENT ON TABLE  departments IS '部门表';
COMMENT ON COLUMN departments.id IS '主键';
COMMENT ON COLUMN departments.name IS '部门名称';
COMMENT ON COLUMN departments.short_name IS '简称';
COMMENT ON COLUMN departments.parent_id IS '上级部门ID';
COMMENT ON COLUMN departments.township IS '所属乡镇';
COMMENT ON COLUMN departments.sort_order IS '排序';
COMMENT ON COLUMN departments.is_deleted IS '软删除';

CREATE UNIQUE INDEX IF NOT EXISTS uk_dept_name ON departments (name);
CREATE INDEX IF NOT EXISTS idx_dept_parent ON departments (parent_id);
CREATE INDEX IF NOT EXISTS idx_dept_township ON departments (township);


-- ============================================================
-- 2. 车辆模块
-- ============================================================

-- 2.1 车辆基础信息
CREATE TABLE IF NOT EXISTS vehicles (
    id                BIGSERIAL     PRIMARY KEY,
    plate             VARCHAR(16)   NOT NULL,
    vin               VARCHAR(32),
    engine_no         VARCHAR(32),
    reg_date          DATE,
    model             VARCHAR(128),
    owner             VARCHAR(128),
    insurance_type    VARCHAR(32),
    insurance_start   DATE,
    insurance_end     DATE,
    premium           DECIMAL(12,2) DEFAULT 0.00,
    vehicle_type      VARCHAR(32),
    status            VARCHAR(16)   DEFAULT '在用',
    remark            VARCHAR(512),
    created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted        BOOLEAN       NOT NULL DEFAULT false
);

COMMENT ON TABLE  vehicles IS '车辆基础信息表';
COMMENT ON COLUMN vehicles.plate IS '车牌号';
COMMENT ON COLUMN vehicles.vin IS '车架号';
COMMENT ON COLUMN vehicles.engine_no IS '发动机号';
COMMENT ON COLUMN vehicles.reg_date IS '注册日期';
COMMENT ON COLUMN vehicles.model IS '车型';
COMMENT ON COLUMN vehicles.owner IS '车辆所有人/所属公司';
COMMENT ON COLUMN vehicles.insurance_type IS '保险类型: 交强险/商业险/交强险+商业险';
COMMENT ON COLUMN vehicles.insurance_start IS '当前保险起期';
COMMENT ON COLUMN vehicles.insurance_end IS '当前保险止期';
COMMENT ON COLUMN vehicles.premium IS '当前保费';
COMMENT ON COLUMN vehicles.vehicle_type IS '车辆类型(垃圾车/吸污车/载货汽车等)';
COMMENT ON COLUMN vehicles.status IS '状态: 在用/停用/报废';

CREATE UNIQUE INDEX IF NOT EXISTS uk_vehicle_plate ON vehicles (plate);
CREATE INDEX IF NOT EXISTS idx_vehicle_vin ON vehicles (vin);
CREATE INDEX IF NOT EXISTS idx_vehicle_owner ON vehicles (owner);
CREATE INDEX IF NOT EXISTS idx_vehicle_ins_end ON vehicles (insurance_end);
CREATE INDEX IF NOT EXISTS idx_vehicle_ins_start ON vehicles (insurance_start);
CREATE INDEX IF NOT EXISTS idx_vehicle_status ON vehicles (status);
CREATE INDEX IF NOT EXISTS idx_vehicle_deleted ON vehicles (is_deleted);


-- 2.2 车辆保险历史
CREATE TABLE IF NOT EXISTS insurance_history (
    id                BIGSERIAL     PRIMARY KEY,
    vehicle_id        BIGINT        NOT NULL,
    plate             VARCHAR(16)   NOT NULL,
    insurance_type    VARCHAR(32),
    start_date        DATE          NOT NULL,
    end_date          DATE          NOT NULL,
    premium           DECIMAL(12,2) DEFAULT 0.00,
    is_current        BOOLEAN       NOT NULL DEFAULT false,
    policy_no         VARCHAR(64),
    insurer           VARCHAR(64),
    remark            VARCHAR(512),
    created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted        BOOLEAN       NOT NULL DEFAULT false
);

COMMENT ON TABLE  insurance_history IS '车辆保险历史表';
COMMENT ON COLUMN insurance_history.vehicle_id IS '车辆ID';
COMMENT ON COLUMN insurance_history.plate IS '车牌号(冗余便于查询)';
COMMENT ON COLUMN insurance_history.insurance_type IS '保险类型';
COMMENT ON COLUMN insurance_history.start_date IS '保险起期';
COMMENT ON COLUMN insurance_history.end_date IS '保险止期';
COMMENT ON COLUMN insurance_history.premium IS '保费';
COMMENT ON COLUMN insurance_history.is_current IS '是否当前有效';
COMMENT ON COLUMN insurance_history.policy_no IS '保单号';
COMMENT ON COLUMN insurance_history.insurer IS '承保公司';

CREATE INDEX IF NOT EXISTS idx_inshist_vehicle ON insurance_history (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_inshist_plate ON insurance_history (plate);
CREATE INDEX IF NOT EXISTS idx_inshist_end ON insurance_history (end_date);
CREATE INDEX IF NOT EXISTS idx_inshist_start ON insurance_history (start_date);
CREATE INDEX IF NOT EXISTS idx_inshist_current ON insurance_history (is_current);


-- ============================================================
-- 3. 人员模块
-- ============================================================

-- 3.1 人员基础信息
CREATE TABLE IF NOT EXISTS personnel (
    id                  BIGSERIAL     PRIMARY KEY,
    name                VARCHAR(32)   NOT NULL,
    employee_code       VARCHAR(32),
    id_card             VARCHAR(32),
    gender              VARCHAR(8),
    birth_date          DATE,
    age                 INTEGER,
    dept                VARCHAR(64),
    dept_id             BIGINT,
    position            VARCHAR(64),
    hire_date           DATE,
    leave_date          DATE,
    person_category     VARCHAR(32),
    person_type         VARCHAR(32),
    is_public_welfare   BOOLEAN       NOT NULL DEFAULT false,
    phone               VARCHAR(32),
    status              VARCHAR(16)   DEFAULT '在职',
    remark              VARCHAR(512),
    created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted          BOOLEAN       NOT NULL DEFAULT false
);

COMMENT ON TABLE  personnel IS '人员基础信息表';
COMMENT ON COLUMN personnel.name IS '姓名';
COMMENT ON COLUMN personnel.employee_code IS '工号';
COMMENT ON COLUMN personnel.id_card IS '身份证号';
COMMENT ON COLUMN personnel.gender IS '性别';
COMMENT ON COLUMN personnel.birth_date IS '出生日期';
COMMENT ON COLUMN personnel.age IS '年龄';
COMMENT ON COLUMN personnel.dept IS '部门/班组';
COMMENT ON COLUMN personnel.dept_id IS '部门ID';
COMMENT ON COLUMN personnel.position IS '岗位';
COMMENT ON COLUMN personnel.hire_date IS '入职日期';
COMMENT ON COLUMN personnel.leave_date IS '离职日期';
COMMENT ON COLUMN personnel.person_category IS '人员分类: 适龄人员/超龄人员';
COMMENT ON COLUMN personnel.person_type IS '人员类型: 生产人员/管理人员';
COMMENT ON COLUMN personnel.is_public_welfare IS '是否公益岗';
COMMENT ON COLUMN personnel.phone IS '联系电话';
COMMENT ON COLUMN personnel.status IS '状态: 在职/离职';

CREATE UNIQUE INDEX IF NOT EXISTS uk_person_idcard ON personnel (id_card);
CREATE INDEX IF NOT EXISTS idx_person_name ON personnel (name);
CREATE INDEX IF NOT EXISTS idx_person_empcode ON personnel (employee_code);
CREATE INDEX IF NOT EXISTS idx_person_dept ON personnel (dept);
CREATE INDEX IF NOT EXISTS idx_person_age ON personnel (age);
CREATE INDEX IF NOT EXISTS idx_person_category ON personnel (person_category);
CREATE INDEX IF NOT EXISTS idx_person_birth ON personnel (birth_date);
CREATE INDEX IF NOT EXISTS idx_person_hire ON personnel (hire_date);
CREATE INDEX IF NOT EXISTS idx_person_status ON personnel (status);
CREATE INDEX IF NOT EXISTS idx_person_deleted ON personnel (is_deleted);


-- 3.2 人员参保记录（一人可能有多条保单）
CREATE TABLE IF NOT EXISTS personnel_insurance (
    id                  BIGSERIAL     PRIMARY KEY,
    personnel_id        BIGINT        NOT NULL,
    person_name         VARCHAR(32)   NOT NULL,
    insurance_type      VARCHAR(32),
    coverage_amount     DECIMAL(12,2) DEFAULT 0.00,
    premium             DECIMAL(12,2) DEFAULT 0.00,
    start_date          DATE,
    expire_date         DATE,
    is_current          BOOLEAN       NOT NULL DEFAULT true,
    policy_no           VARCHAR(64),
    remark              VARCHAR(512),
    created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted          BOOLEAN       NOT NULL DEFAULT false
);

COMMENT ON TABLE  personnel_insurance IS '人员参保记录表';
COMMENT ON COLUMN personnel_insurance.personnel_id IS '人员ID';
COMMENT ON COLUMN personnel_insurance.person_name IS '姓名(冗余)';
COMMENT ON COLUMN personnel_insurance.insurance_type IS '险种: 工伤险/雇主责任险';
COMMENT ON COLUMN personnel_insurance.coverage_amount IS '保额(万)';
COMMENT ON COLUMN personnel_insurance.premium IS '年保费(元)';
COMMENT ON COLUMN personnel_insurance.start_date IS '保险起期';
COMMENT ON COLUMN personnel_insurance.expire_date IS '保险止期';
COMMENT ON COLUMN personnel_insurance.is_current IS '是否当前有效';
COMMENT ON COLUMN personnel_insurance.policy_no IS '保单号';

CREATE INDEX IF NOT EXISTS idx_pi_person ON personnel_insurance (personnel_id);
CREATE INDEX IF NOT EXISTS idx_pi_name ON personnel_insurance (person_name);
CREATE INDEX IF NOT EXISTS idx_pi_expire ON personnel_insurance (expire_date);
CREATE INDEX IF NOT EXISTS idx_pi_type ON personnel_insurance (insurance_type);
CREATE INDEX IF NOT EXISTS idx_pi_current ON personnel_insurance (is_current);


-- 3.3 超龄人员管控
CREATE TABLE IF NOT EXISTS over_age_personnel (
    id                  BIGSERIAL     PRIMARY KEY,
    personnel_id        BIGINT,
    name                VARCHAR(32)   NOT NULL,
    id_card             VARCHAR(32),
    gender              VARCHAR(8),
    birth_date          DATE,
    age                 INTEGER       NOT NULL,
    dept                VARCHAR(64),
    position            VARCHAR(64),
    hire_date           DATE,
    person_type         VARCHAR(32),
    control_type        VARCHAR(32),
    is_to_optimize      BOOLEAN       NOT NULL DEFAULT false,
    actual_insurance    VARCHAR(64),
    has_injury          BOOLEAN       DEFAULT false,
    has_employer        BOOLEAN       DEFAULT false,
    compliance          VARCHAR(32),
    expire_date         DATE,
    optimize_status     VARCHAR(16)   DEFAULT '待处理',
    optimize_date       DATE,
    optimize_remark     VARCHAR(512),
    created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted          BOOLEAN       NOT NULL DEFAULT false
);

COMMENT ON TABLE  over_age_personnel IS '超龄人员管控表';
COMMENT ON COLUMN over_age_personnel.personnel_id IS '关联 personnel.id';
COMMENT ON COLUMN over_age_personnel.name IS '姓名';
COMMENT ON COLUMN over_age_personnel.id_card IS '身份证号';
COMMENT ON COLUMN over_age_personnel.age IS '当前年龄';
COMMENT ON COLUMN over_age_personnel.person_type IS '生产人员/管理人员';
COMMENT ON COLUMN over_age_personnel.control_type IS '管控类型: 年龄临界预警/3个月内到达70周岁';
COMMENT ON COLUMN over_age_personnel.is_to_optimize IS '是否列入待优化';
COMMENT ON COLUMN over_age_personnel.optimize_status IS '优化状态: 待处理/已优化/暂缓';

CREATE INDEX IF NOT EXISTS idx_oap_name ON over_age_personnel (name);
CREATE INDEX IF NOT EXISTS idx_oap_idcard ON over_age_personnel (id_card);
CREATE INDEX IF NOT EXISTS idx_oap_age ON over_age_personnel (age);
CREATE INDEX IF NOT EXISTS idx_oap_dept ON over_age_personnel (dept);
CREATE INDEX IF NOT EXISTS idx_oap_control ON over_age_personnel (control_type);
CREATE INDEX IF NOT EXISTS idx_oap_optimize ON over_age_personnel (optimize_status);
CREATE INDEX IF NOT EXISTS idx_oap_expire ON over_age_personnel (expire_date);
CREATE INDEX IF NOT EXISTS idx_oap_person ON over_age_personnel (personnel_id);


-- ============================================================
-- 4. 培训模块
-- ============================================================

-- 4.1 培训记录
CREATE TABLE IF NOT EXISTS training_records (
    id                BIGSERIAL     PRIMARY KEY,
    personnel_id      BIGINT,
    name              VARCHAR(32)   NOT NULL,
    id_card           VARCHAR(32),
    dept              VARCHAR(64),
    position          VARCHAR(64),
    grid_level        VARCHAR(32),
    frequency         VARCHAR(32),
    training_type     VARCHAR(32)   DEFAULT 'HSE',
    training_date     DATE,
    duration_minutes  INTEGER       DEFAULT 0,
    content           VARCHAR(512),
    result            VARCHAR(16)   DEFAULT '合格',
    score             DECIMAL(5,2),
    trainer           VARCHAR(32),
    remark            VARCHAR(512),
    created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted        BOOLEAN       NOT NULL DEFAULT false
);

COMMENT ON TABLE  training_records IS '培训记录表';
COMMENT ON COLUMN training_records.personnel_id IS '人员ID';
COMMENT ON COLUMN training_records.name IS '参训人姓名';
COMMENT ON COLUMN training_records.grid_level IS '网格层级';
COMMENT ON COLUMN training_records.frequency IS '培训频次: 1天1次/2天1次/3天1次';
COMMENT ON COLUMN training_records.training_type IS '培训类型';
COMMENT ON COLUMN training_records.training_date IS '培训日期';
COMMENT ON COLUMN training_records.duration_minutes IS '培训时长(分钟)';
COMMENT ON COLUMN training_records.content IS '培训内容';
COMMENT ON COLUMN training_records.result IS '结果: 合格/不合格/缺勤';
COMMENT ON COLUMN training_records.score IS '考核分数';
COMMENT ON COLUMN training_records.trainer IS '培训人';

CREATE INDEX IF NOT EXISTS idx_tr_name ON training_records (name);
CREATE INDEX IF NOT EXISTS idx_tr_date ON training_records (training_date);
CREATE INDEX IF NOT EXISTS idx_tr_dept ON training_records (dept);
CREATE INDEX IF NOT EXISTS idx_tr_gridlevel ON training_records (grid_level);
CREATE INDEX IF NOT EXISTS idx_tr_person ON training_records (personnel_id);


-- 4.2 培训花名册（参训人员基础档）
CREATE TABLE IF NOT EXISTS training_roster (
    id            BIGSERIAL    PRIMARY KEY,
    name          VARCHAR(32)  NOT NULL,
    level         VARCHAR(32),
    group_name    VARCHAR(64),
    position      VARCHAR(64),
    frequency     VARCHAR(32),
    personnel_id  BIGINT,
    is_active     BOOLEAN      NOT NULL DEFAULT true,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted    BOOLEAN      NOT NULL DEFAULT false
);

COMMENT ON TABLE  training_roster IS '培训花名册表';
COMMENT ON COLUMN training_roster.name IS '姓名';
COMMENT ON COLUMN training_roster.level IS '网格层级';
COMMENT ON COLUMN training_roster.group_name IS '所属组/部门';
COMMENT ON COLUMN training_roster.personnel_id IS '关联 personnel.id';

CREATE UNIQUE INDEX IF NOT EXISTS uk_roster_name ON training_roster (name);
CREATE INDEX IF NOT EXISTS idx_roster_level ON training_roster (level);
CREATE INDEX IF NOT EXISTS idx_roster_group ON training_roster (group_name);


-- ============================================================
-- 5. 隐患排查治理
-- ============================================================

CREATE TABLE IF NOT EXISTS hazards (
    id              BIGSERIAL     PRIMARY KEY,
    no              INTEGER,
    hazard_date     DATE,
    township        VARCHAR(32),
    category        VARCHAR(32),
    level           VARCHAR(16)   DEFAULT '一般',
    description     TEXT          NOT NULL,
    location        VARCHAR(128),
    measure         TEXT,
    deadline        DATE,
    checker         VARCHAR(128),
    responsible_dept VARCHAR(64),
    fixer           VARCHAR(64),
    fix_date        DATE,
    status          VARCHAR(16)   DEFAULT '未完成',
    verify_user     VARCHAR(32),
    verify_date     DATE,
    remark          VARCHAR(512),
    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted      BOOLEAN       NOT NULL DEFAULT false
);

COMMENT ON TABLE  hazards IS '隐患排查治理表';
COMMENT ON COLUMN hazards.no IS '隐患编号';
COMMENT ON COLUMN hazards.hazard_date IS '排查日期';
COMMENT ON COLUMN hazards.township IS '所属乡镇';
COMMENT ON COLUMN hazards.category IS '隐患类别';
COMMENT ON COLUMN hazards.level IS '等级: 一般/较大/重大';
COMMENT ON COLUMN hazards.description IS '隐患描述';
COMMENT ON COLUMN hazards.location IS '隐患位置';
COMMENT ON COLUMN hazards.measure IS '整改措施';
COMMENT ON COLUMN hazards.deadline IS '整改期限';
COMMENT ON COLUMN hazards.checker IS '排查人';
COMMENT ON COLUMN hazards.fixer IS '整改负责人';
COMMENT ON COLUMN hazards.fix_date IS '整改完成日期';
COMMENT ON COLUMN hazards.status IS '状态: 未完成/整改中/已完成/已逾期';
COMMENT ON COLUMN hazards.verify_user IS '复核人';

CREATE INDEX IF NOT EXISTS idx_haz_no ON hazards (no);
CREATE INDEX IF NOT EXISTS idx_haz_date ON hazards (hazard_date);
CREATE INDEX IF NOT EXISTS idx_haz_township ON hazards (township);
CREATE INDEX IF NOT EXISTS idx_haz_status ON hazards (status);
CREATE INDEX IF NOT EXISTS idx_haz_level ON hazards (level);
CREATE INDEX IF NOT EXISTS idx_haz_deadline ON hazards (deadline);
CREATE INDEX IF NOT EXISTS idx_haz_fixdate ON hazards (fix_date);
CREATE INDEX IF NOT EXISTS idx_haz_deleted ON hazards (is_deleted);


-- ============================================================
-- 6. 事故管理
-- ============================================================

-- 6.1 事故记录
CREATE TABLE IF NOT EXISTS accidents (
    id                   BIGSERIAL     PRIMARY KEY,
    no                   INTEGER,
    accident_date        DATE          NOT NULL,
    year                 INTEGER,
    month                INTEGER,
    township             VARCHAR(32),
    location             VARCHAR(128),
    involved_vehicle     VARCHAR(16),
    vehicle_id           BIGINT,
    involved_person      VARCHAR(32),
    personnel_id         BIGINT,
    accident_type        VARCHAR(32),
    responsibility       VARCHAR(32),
    responsibility_level VARCHAR(32),
    level                VARCHAR(16)   DEFAULT '一般',
    description          TEXT          NOT NULL,
    cause_analysis       TEXT,
    loss_amount          DECIMAL(14,2) DEFAULT 0.00,
    compensation         DECIMAL(14,2) DEFAULT 0.00,
    status               VARCHAR(16)   DEFAULT '处理中',
    handler              VARCHAR(32),
    close_date           DATE,
    remark               VARCHAR(512),
    created_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted           BOOLEAN       NOT NULL DEFAULT false
);

COMMENT ON TABLE  accidents IS '事故记录表';
COMMENT ON COLUMN accidents.no IS '事故编号(年度内序号)';
COMMENT ON COLUMN accidents.accident_date IS '事故日期';
COMMENT ON COLUMN accidents.year IS '事故年份';
COMMENT ON COLUMN accidents.month IS '事故月份';
COMMENT ON COLUMN accidents.township IS '所属乡镇';
COMMENT ON COLUMN accidents.location IS '事故地点';
COMMENT ON COLUMN accidents.involved_vehicle IS '涉及车辆车牌';
COMMENT ON COLUMN accidents.vehicle_id IS '车辆ID';
COMMENT ON COLUMN accidents.involved_person IS '涉事人员姓名';
COMMENT ON COLUMN accidents.personnel_id IS '人员ID';
COMMENT ON COLUMN accidents.accident_type IS '事故类型: 生产安全/交通事故/突发疾病';
COMMENT ON COLUMN accidents.responsibility IS '责任情形: 上班期间/上下班途中/非上班';
COMMENT ON COLUMN accidents.responsibility_level IS '责任等级: 主要/同等/次要/无责/责任';
COMMENT ON COLUMN accidents.level IS '事故等级: 轻伤/重伤/死亡/重大';
COMMENT ON COLUMN accidents.description IS '事故描述';
COMMENT ON COLUMN accidents.loss_amount IS '经济损失(元)';
COMMENT ON COLUMN accidents.compensation IS '赔偿金额(元)';
COMMENT ON COLUMN accidents.status IS '状态: 处理中/已结案';

CREATE INDEX IF NOT EXISTS idx_acc_date ON accidents (accident_date);
CREATE INDEX IF NOT EXISTS idx_acc_year ON accidents (year);
CREATE INDEX IF NOT EXISTS idx_acc_month ON accidents (month);
CREATE INDEX IF NOT EXISTS idx_acc_township ON accidents (township);
CREATE INDEX IF NOT EXISTS idx_acc_type ON accidents (accident_type);
CREATE INDEX IF NOT EXISTS idx_acc_status ON accidents (status);
CREATE INDEX IF NOT EXISTS idx_acc_vehicle ON accidents (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_acc_person ON accidents (personnel_id);
CREATE INDEX IF NOT EXISTS idx_acc_level ON accidents (level);


-- 6.2 事故涉事人员多对多（支持多人）
CREATE TABLE IF NOT EXISTS accident_persons (
    id           BIGSERIAL    PRIMARY KEY,
    accident_id  BIGINT       NOT NULL,
    personnel_id BIGINT,
    name         VARCHAR(32)  NOT NULL,
    id_card      VARCHAR(32),
    injury_level VARCHAR(16),
    remark       VARCHAR(256),
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted   BOOLEAN      NOT NULL DEFAULT false
);

COMMENT ON TABLE  accident_persons IS '事故涉事人员多对多表';
COMMENT ON COLUMN accident_persons.accident_id IS '事故ID';
COMMENT ON COLUMN accident_persons.personnel_id IS '人员ID';
COMMENT ON COLUMN accident_persons.name IS '涉事人员姓名';
COMMENT ON COLUMN accident_persons.injury_level IS '伤亡等级';

CREATE INDEX IF NOT EXISTS idx_ap_accident ON accident_persons (accident_id);
CREATE INDEX IF NOT EXISTS idx_ap_person ON accident_persons (personnel_id);


-- ============================================================
-- 7. 网格管理
-- ============================================================

-- 7.1 网格管理人员
CREATE TABLE IF NOT EXISTS grid_areas (
    id               BIGSERIAL     PRIMARY KEY,
    grid_code        VARCHAR(32)   NOT NULL,
    grid_level       VARCHAR(32)   NOT NULL,
    name             VARCHAR(32)   NOT NULL,
    personnel_id     BIGINT,
    position         VARCHAR(64),
    area             VARCHAR(128),
    township         VARCHAR(32),
    patrol_frequency VARCHAR(32),
    phone            VARCHAR(32),
    completion_rate  DECIMAL(5,2)  DEFAULT 100.00,
    risk_level       VARCHAR(16)   DEFAULT '一般',
    remarks          VARCHAR(512),
    status           VARCHAR(16)   DEFAULT '在岗',
    created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted       BOOLEAN       NOT NULL DEFAULT false
);

COMMENT ON TABLE  grid_areas IS '网格管理人员表';
COMMENT ON COLUMN grid_areas.grid_code IS '网格编号 g000';
COMMENT ON COLUMN grid_areas.grid_level IS '总网格长/一级/二级/三级';
COMMENT ON COLUMN grid_areas.name IS '网格长姓名';
COMMENT ON COLUMN grid_areas.area IS '网格区域';
COMMENT ON COLUMN grid_areas.patrol_frequency IS '巡查频次';
COMMENT ON COLUMN grid_areas.completion_rate IS '完成率%';
COMMENT ON COLUMN grid_areas.risk_level IS '风险等级';
COMMENT ON COLUMN grid_areas.status IS '在岗/离岗';

CREATE UNIQUE INDEX IF NOT EXISTS uk_grid_code ON grid_areas (grid_code);
CREATE INDEX IF NOT EXISTS idx_grid_level ON grid_areas (grid_level);
CREATE INDEX IF NOT EXISTS idx_grid_name ON grid_areas (name);
CREATE INDEX IF NOT EXISTS idx_grid_township ON grid_areas (township);
CREATE INDEX IF NOT EXISTS idx_grid_status ON grid_areas (status);


-- 7.2 网格巡查日志
CREATE TABLE IF NOT EXISTS grid_patrol_logs (
    id             BIGSERIAL     PRIMARY KEY,
    grid_id        BIGINT        NOT NULL,
    grid_code      VARCHAR(32)   NOT NULL,
    patrol_date    DATE          NOT NULL,
    patrol_time    TIMESTAMP,
    patrol_user    VARCHAR(32)   NOT NULL,
    check_items    TEXT,
    problems_found TEXT,
    images         VARCHAR(1024),
    result         VARCHAR(16)   DEFAULT '正常',
    created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted     BOOLEAN       NOT NULL DEFAULT false
);

COMMENT ON TABLE  grid_patrol_logs IS '网格巡查日志表';
COMMENT ON COLUMN grid_patrol_logs.grid_id IS '网格ID';
COMMENT ON COLUMN grid_patrol_logs.patrol_date IS '巡查日期';
COMMENT ON COLUMN grid_patrol_logs.patrol_time IS '巡查时间';
COMMENT ON COLUMN grid_patrol_logs.patrol_user IS '巡查人';
COMMENT ON COLUMN grid_patrol_logs.check_items IS '检查项JSON';
COMMENT ON COLUMN grid_patrol_logs.problems_found IS '发现问题';
COMMENT ON COLUMN grid_patrol_logs.images IS '图片URL,逗号分隔';
COMMENT ON COLUMN grid_patrol_logs.result IS '正常/异常';

CREATE INDEX IF NOT EXISTS idx_patrol_grid ON grid_patrol_logs (grid_id);
CREATE INDEX IF NOT EXISTS idx_patrol_date ON grid_patrol_logs (patrol_date);
CREATE INDEX IF NOT EXISTS idx_patrol_user ON grid_patrol_logs (patrol_user);


-- ============================================================
-- 8. 风险源管控（新增，替代内存存储）
-- ============================================================

CREATE TABLE IF NOT EXISTS risk_sources (
    id              BIGSERIAL       PRIMARY KEY,
    source_id       VARCHAR(32),
    name            VARCHAR(128)    NOT NULL,
    type            VARCHAR(64),
    category        VARCHAR(64),
    location        VARCHAR(256),
    accident_type   VARCHAR(64),
    level           VARCHAR(16)     DEFAULT '四级',
    measures        TEXT,
    emergency       TEXT,
    lat             DOUBLE PRECISION,
    lng             DOUBLE PRECISION,
    area            VARCHAR(128),
    sheet           VARCHAR(128),
    polygon         JSONB           DEFAULT '[]'::jsonb,
    status          VARCHAR(16)     DEFAULT '正常',
    is_deleted      BOOLEAN         NOT NULL DEFAULT false,
    data_period     DATE,
    source_file_id  INTEGER,
    import_job_id   UUID,
    row_hash        CHAR(64),
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  risk_sources IS '风险源管控表（替代前端内存存储）';
COMMENT ON COLUMN risk_sources.source_id IS '前端ID 如 R001';
COMMENT ON COLUMN risk_sources.name IS '风险源名称';
COMMENT ON COLUMN risk_sources.type IS '风险类型';
COMMENT ON COLUMN risk_sources.category IS '分类';
COMMENT ON COLUMN risk_sources.location IS '位置描述';
COMMENT ON COLUMN risk_sources.accident_type IS '事故类型';
COMMENT ON COLUMN risk_sources.level IS '风险等级: 一级/二级/三级/四级';
COMMENT ON COLUMN risk_sources.measures IS '管控措施';
COMMENT ON COLUMN risk_sources.emergency IS '应急措施';
COMMENT ON COLUMN risk_sources.lat IS '纬度';
COMMENT ON COLUMN risk_sources.lng IS '经度';
COMMENT ON COLUMN risk_sources.area IS '所属区域';
COMMENT ON COLUMN risk_sources.sheet IS '所属表';
COMMENT ON COLUMN risk_sources.polygon IS '多边形坐标';
COMMENT ON COLUMN risk_sources.status IS '状态';

CREATE UNIQUE INDEX IF NOT EXISTS uk_risk_source_id ON risk_sources (source_id);
CREATE INDEX IF NOT EXISTS idx_risk_type ON risk_sources (type);
CREATE INDEX IF NOT EXISTS idx_risk_category ON risk_sources (category);
CREATE INDEX IF NOT EXISTS idx_risk_level ON risk_sources (level);
CREATE INDEX IF NOT EXISTS idx_risk_area ON risk_sources (area);
CREATE INDEX IF NOT EXISTS idx_risk_status ON risk_sources (status);
CREATE INDEX IF NOT EXISTS idx_risk_data_period ON risk_sources (data_period);
CREATE INDEX IF NOT EXISTS idx_risk_import_job_id ON risk_sources (import_job_id);
CREATE INDEX IF NOT EXISTS idx_risk_row_hash ON risk_sources (row_hash);


-- ============================================================
-- 9. 系统操作日志
-- ============================================================

CREATE TABLE IF NOT EXISTS sys_operation_log (
    id           BIGSERIAL    PRIMARY KEY,
    module       VARCHAR(32)  NOT NULL,
    action       VARCHAR(32)  NOT NULL,
    target_id    BIGINT,
    target_type  VARCHAR(32),
    operator     VARCHAR(32),
    ip           VARCHAR(64),
    detail       TEXT,
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  sys_operation_log IS '系统操作日志表';
COMMENT ON COLUMN sys_operation_log.module IS '模块名';
COMMENT ON COLUMN sys_operation_log.action IS '操作: 新增/修改/删除/导入';
COMMENT ON COLUMN sys_operation_log.operator IS '操作人';

CREATE INDEX IF NOT EXISTS idx_log_module ON sys_operation_log (module);
CREATE INDEX IF NOT EXISTS idx_log_time ON sys_operation_log (created_at);
CREATE INDEX IF NOT EXISTS idx_log_operator ON sys_operation_log (operator);


-- ============================================================
-- 10. 导入系统表（来自 import_schema.sql）
-- ============================================================

-- 10.1 增强 file_records 表（如已存在则追加字段）
ALTER TABLE file_records ADD COLUMN IF NOT EXISTS module_type VARCHAR(50);
ALTER TABLE file_records ADD COLUMN IF NOT EXISTS data_period DATE;
ALTER TABLE file_records ADD COLUMN IF NOT EXISTS file_hash CHAR(64);
ALTER TABLE file_records ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'uploaded';
ALTER TABLE file_records ADD COLUMN IF NOT EXISTS import_job_id UUID;
ALTER TABLE file_records ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_file_records_module_type ON file_records (module_type);
CREATE INDEX IF NOT EXISTS idx_file_records_data_period ON file_records (data_period);
CREATE INDEX IF NOT EXISTS idx_file_records_file_hash ON file_records (file_hash);
CREATE INDEX IF NOT EXISTS idx_file_records_status ON file_records (status);
CREATE INDEX IF NOT EXISTS idx_file_records_import_job_id ON file_records (import_job_id);


-- 10.2 导入日志表（以 import_schema.sql 的增强版为准）
CREATE TABLE IF NOT EXISTS import_logs (
    id              SERIAL       PRIMARY KEY,
    file_record_id  INTEGER      REFERENCES file_records(id) ON DELETE SET NULL,
    job_id          UUID         NOT NULL DEFAULT gen_random_uuid(),
    module_type     VARCHAR(50)  NOT NULL,
    data_period     DATE         NOT NULL,
    target_table    VARCHAR(200) NOT NULL,
    total_rows      INTEGER      DEFAULT 0,
    inserted_rows   INTEGER      DEFAULT 0,
    updated_rows    INTEGER      DEFAULT 0,
    skipped_rows    INTEGER      DEFAULT 0,
    error_count     INTEGER      DEFAULT 0,
    status          VARCHAR(20)  DEFAULT 'pending',
    started_at      TIMESTAMP,
    finished_at     TIMESTAMP,
    operator        VARCHAR(100) DEFAULT '',
    error_details   JSONB        DEFAULT '[]'::jsonb,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  import_logs IS '数据导入日志表（增强版）';
COMMENT ON COLUMN import_logs.job_id IS '导入任务UUID';
COMMENT ON COLUMN import_logs.module_type IS '模块类型';
COMMENT ON COLUMN import_logs.data_period IS '数据期间';
COMMENT ON COLUMN import_logs.target_table IS '目标表名';
COMMENT ON COLUMN import_logs.error_details IS '错误详情JSON';

CREATE INDEX IF NOT EXISTS idx_import_logs_job_id ON import_logs (job_id);
CREATE INDEX IF NOT EXISTS idx_import_logs_module_type ON import_logs (module_type);
CREATE INDEX IF NOT EXISTS idx_import_logs_data_period ON import_logs (data_period);
CREATE INDEX IF NOT EXISTS idx_import_logs_status ON import_logs (status);
CREATE INDEX IF NOT EXISTS idx_import_logs_file_record_id ON import_logs (file_record_id);


-- 10.3 字段映射配置表
CREATE TABLE IF NOT EXISTS field_mapping_config (
    id                  SERIAL       PRIMARY KEY,
    module_type         VARCHAR(50)  NOT NULL,
    table_name          VARCHAR(200) NOT NULL,
    file_pattern        VARCHAR(500),
    sheet_name          VARCHAR(200) DEFAULT '',
    header_row          INTEGER      DEFAULT 0,
    column_mapping      JSONB        NOT NULL DEFAULT '{}'::jsonb,
    conflict_keys       TEXT[]       DEFAULT '{}',
    data_cleaning_rules JSONB        DEFAULT '{}'::jsonb,
    is_active           BOOLEAN      DEFAULT true,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(module_type, table_name)
);

COMMENT ON TABLE  field_mapping_config IS '字段映射配置表';
COMMENT ON COLUMN field_mapping_config.module_type IS '模块类型';
COMMENT ON COLUMN field_mapping_config.table_name IS '目标表名';
COMMENT ON COLUMN field_mapping_config.file_pattern IS '文件名匹配正则';
COMMENT ON COLUMN field_mapping_config.column_mapping IS 'Excel列名→数据库字段映射';
COMMENT ON COLUMN field_mapping_config.conflict_keys IS '冲突检测键';
COMMENT ON COLUMN field_mapping_config.data_cleaning_rules IS '数据清洗规则';

CREATE INDEX IF NOT EXISTS idx_fmc_module_type ON field_mapping_config (module_type);
CREATE INDEX IF NOT EXISTS idx_fmc_is_active ON field_mapping_config (is_active);


-- ============================================================
-- 11. 视图（PostgreSQL 语法）
-- ============================================================

-- 11.1 车辆保险即将到期（60天内）
-- MySQL DATEDIFF(end, CURDATE()) → PG 日期减法 (end - CURRENT_DATE)
DROP VIEW IF EXISTS v_vehicle_insurance_expiring;
CREATE OR REPLACE VIEW v_vehicle_insurance_expiring AS
SELECT
    v.id, v.plate, v.vin, v.model, v.owner,
    v.insurance_type, v.insurance_start, v.insurance_end,
    v.premium,
    (v.insurance_end - CURRENT_DATE) AS days_to_expire
FROM vehicles v
WHERE v.is_deleted = false
  AND v.insurance_end IS NOT NULL
  AND (v.insurance_end - CURRENT_DATE) <= 60;

COMMENT ON VIEW v_vehicle_insurance_expiring IS '车辆保险即将到期视图（60天内）';


-- 11.2 隐患未完成
DROP VIEW IF EXISTS v_hazard_pending;
CREATE OR REPLACE VIEW v_hazard_pending AS
SELECT id, no, hazard_date, township, level, description, status, deadline, fixer
FROM hazards
WHERE is_deleted = false
  AND status IN ('未完成', '整改中', '已逾期');

COMMENT ON VIEW v_hazard_pending IS '隐患未完成视图';


-- 11.3 人员参保异常视图
-- 注意: 原 MySQL 版本引用了 personnel 表中不存在的字段
--       (employer_coverage_required, compliance_level)
--       这些字段实际存在于 over_age_personnel 表
--       此视图改为基于 over_age_personnel 表查询
DROP VIEW IF EXISTS v_personnel_insurance_anomaly;
CREATE OR REPLACE VIEW v_personnel_insurance_anomaly AS
SELECT
    oap.id,
    oap.name,
    oap.id_card,
    oap.dept,
    oap.position,
    oap.age,
    p.person_category,
    oap.compliance,
    oap.actual_insurance,
    oap.has_injury,
    oap.has_employer,
    oap.expire_date
FROM over_age_personnel oap
LEFT JOIN personnel p ON p.id = oap.personnel_id
WHERE oap.is_deleted = false
  AND oap.compliance IN ('danger', 'warning');

COMMENT ON VIEW v_personnel_insurance_anomaly IS '人员参保异常视图（基于超龄人员管控表）';


-- ============================================================
-- 12. 字段映射配置初始数据
-- ============================================================

INSERT INTO field_mapping_config (module_type, table_name, file_pattern, column_mapping, conflict_keys, data_cleaning_rules) VALUES
-- === 培训模块 (t_01) ===
('training', 't_01_hse教育培训_乡镇教育培训扣分汇总', '培训|教育|考核.*乡镇',
    '{"月份":"月份","经理":"经理","乡镇":"乡镇","应到人数":"应到人数","培训人数":"培训人数","未培训人员数量":"未培训人员数量","缺少签字人数":"缺少签字人数","记录不完整":"记录不完整","总计":"总计"}',
    ARRAY['月份','乡镇','经理'], '{}'::jsonb),
('training', 't_01_hse教育培训_管理员教育培训扣分汇总', '培训|教育.*管理员',
    '{"月份":"月份","乡镇":"乡镇","应到人数":"应到人数","培训人数":"培训人数","未培训人员数量":"未培训人员数量","缺少签字人数":"缺少签字人数","记录不完整":"记录不完整","总计":"总计"}',
    ARRAY['月份','乡镇'], '{}'::jsonb),

-- === 保险模块 (t_02) ===
('insurance', 't_02_保险及人员管理_人员保险', '人员保险|保险.*人员',
    '{"姓名":"姓名","员工编码":"员工编码","身份证号码":"身份证号码","性别":"性别","年龄":"年龄","所属部门":"所属部门","职位":"职位","入职日期":"入职日期","年龄分类":"年龄分类","应缴保险类型":"应缴保险类型","实际投保":"实际投保","工伤保险":"工伤保险","工伤险金额":"工伤险金额","工伤险来源":"工伤险来源","雇主责任险":"雇主责任险","雇主责任险金额":"雇主责任险金额","雇主责任险岗位":"雇主责任险岗位","保险起期":"保险起期","保险止期":"保险止期","是否公益岗":"是否公益岗","合规状态":"合规状态","合规等级":"合规等级"}',
    ARRAY['姓名'], '{"身份证号码":"id_card","入职日期":"date","保险起期":"date","保险止期":"date"}'::jsonb),
('insurance', 't_02_保险及人员管理_员工信息维护', '员工信息|人员.*维护',
    '{"序号":"序号","员工编码":"员工编码","姓名":"姓名","所属部门":"所属部门","职位":"职位","入职日期":"入职日期","身份证号码":"身份证号码","性别":"性别","年龄":"年龄","直接上级":"直接上级","国际区号手机号码":"国际区号手机号码","完整度百分比":"完整度百分比"}',
    ARRAY['员工编码'], '{"身份证号码":"id_card","入职日期":"date"}'::jsonb),
('insurance', 't_02_保险及人员管理_宁津项目车辆保险统计表', '车辆保险|车险',
    '{"车牌号":"车牌号","投保人_被保险人":"投保人_被保险人","行驶证车主":"行驶证车主","车架号":"车架号","发动机号":"发动机号","初次登记年月":"初次登记年月","厂牌车型":"厂牌车型","保险起期":"保险起期","保险止期":"保险止期","保额":"保额","保费":"保费","商业险合计":"商业险合计","交强险":"交强险","车船税":"车船税","合计":"合计","三者险保额":"三者险保额","三者险保费":"三者险保费"}',
    ARRAY['车牌号'], '{"保险起期":"date","保险止期":"date","初次登记年月":"date"}'::jsonb),
('insurance', 't_02_保险及人员管理_车牌号姓名映射', '车牌号.*姓名|姓名.*车牌',
    '{"车牌号":"车牌号","姓名":"姓名"}',
    ARRAY['车牌号','姓名'], '{}'::jsonb),
('insurance', 't_02_保险及人员管理_花名册', '花名册',
    '{"序号":"d_1","员工编码":"d_179501","身份证号码":"d_372425197112167312","姓名":"黄殿兴","所属部门":"项目管理层","职位":"项目总经理","入职日期":"d_2018_09_04","性别":"男"}',
    ARRAY['d_179501'], '{"d_372425197112167312":"id_card","d_2018_09_04":"date"}'::jsonb),
('insurance', 't_02_保险及人员管理_最新雇员清单', '雇员清单|最新雇员',
    '{"雇员姓名":"雇员姓名","证件类型名称":"证件类型名称","证件号码":"证件号码","工种属性_职业类别":"工种属性_职业类别","岗位名称":"岗位名称","保险起期":"保险起期","保险止期":"保险止期","备注":"备注","生效时间":"生效时间"}',
    ARRAY['雇员姓名','证件号码'], '{"证件号码":"id_card","保险起期":"date","保险止期":"date","生效时间":"date"}'::jsonb),

-- === 规章制度模块 (t_03) ===
('regulations', 't_03_规章制度_制度清单', '制度清单',
    '{"序号":"序号","制度名称":"制度名称","版本号":"版本号","状态":"状态","生效日期":"生效日期"}',
    ARRAY['序号','制度名称'], '{"生效日期":"date"}'::jsonb),
('regulations', 't_03_规章制度_全员岗位安全生产责任制清单', '责任制清单|全员岗位',
    '{"序号":"序号","部门":"部门","岗位":"岗位","岗位安全生产职责":"岗位安全生产职责"}',
    ARRAY['序号','部门','岗位'], '{}'::jsonb),
('regulations', 't_03_规章制度_项目安全生产和职业卫生法律法规', '法律法规|安全生产.*职业',
    '{"序号":"序号","法规名称":"法规名称","文件号":"文件号","发布时间":"发布时间","实施时间":"实施时间","分类":"分类"}',
    ARRAY['序号','法规名称'], '{"发布时间":"date","实施时间":"date"}'::jsonb),
('regulations', 't_03_规章制度_宁津项目安全生产网格化管理清单', '网格化.*管理清单|网格.*清单',
    '{"项目名称":"项目名称","总网格长_项目负责人":"总网格长_项目负责人","一级网格长":"一级网格长","二级网格长":"二级网格长","三级网格长":"三级网格长"}',
    ARRAY['项目名称'], '{}'::jsonb),

-- === 事故管理模块 (t_05) ===
('accident', 't_05_事故管理_历史未完成案件', '历史.*未完成|未结.*案件',
    '{"事故时间":"事故时间","事故等级":"事故等级","事故类型":"事故类型","涉事人员":"涉事人员","事故地点与经过":"事故地点与经过","处理状态":"处理状态"}',
    ARRAY['事故时间','事故类型','涉事人员'], '{"事故时间":"date"}'::jsonb),

-- === 三违管理模块 (t_07) ===
('sanwei', 't_07_三违管理_乡镇人员名单_微信', '乡镇.*人员.*名单|人员名单.*微信',
    '{"序号":"序号","乡镇":"乡镇","职务":"职务","姓名":"姓名","微信名":"微信名"}',
    ARRAY['序号','姓名'], '{}'::jsonb),
('sanwei', 't_07_三违管理_宁津项目三违检查清单_表_2_全员', '三违.*检查.*清单|检查清单.*全员',
    '{"人员姓名":"人员姓名","网格等级":"网格等级","所属层级_分组":"所属层级_分组","所属岗位":"所属岗位","巡查频次":"巡查频次"}',
    ARRAY['人员姓名'], '{}'::jsonb),
('sanwei', 't_07_三违管理_拍照巡检_ai_识别', '拍照.*巡检|巡检.*ai',
    '{"现场拍照":"现场拍照","ai_智能巡检识别":"ai_智能巡检识别","责任人":"责任人","巡检日期":"巡检日期","穿拖鞋":"穿拖鞋","未穿工装":"未穿工装","未佩戴安全头盔":"未佩戴安全头盔","创建人":"创建人","上传时间":"上传时间"}',
    ARRAY['责任人','巡检日期'], '{"巡检日期":"date","上传时间":"date"}'::jsonb),

-- === 现场管理模块 (t_08) ===
('site', 't_08_现场管理_宁津项目三违检查清单_三违检查', '三违.*检查.*记录|三违检查',
    '{"片区_班组":"片区_班组","上传时间":"上传时间","检查人姓名":"检查人姓名","网格等级":"网格等级","所属岗位":"所属岗位","违章人姓名":"违章人姓名","违章人性别":"违章人性别","违章人年龄":"违章人年龄","车辆类型_保洁员":"车辆类型_保洁员","上报状态":"上报状态","图片内容":"图片内容","三违_行为":"三违_行为","三违类型_输出结果":"三违类型_输出结果","需要整改":"需要整改","整改执行人":"整改执行人","整改后的照片":"整改后的照片","扣分情况":"扣分情况","示意图":"示意图"}',
    ARRAY['片区_班组','上传时间','违章人姓名'], '{"上传时间":"date"}'::jsonb),
('site', 't_08_现场管理_网格管理人员名单', '网格.*人员.*名单|网格.*管理.*名单',
    '{"姓名":"姓名","网格层级":"网格层级","所属区域":"所属区域","职务":"职务","巡查频率":"巡查频率"}',
    ARRAY['姓名'], '{}'::jsonb),

-- === 风险分级管控模块 (t_09) ===
('risk', 't_09_风险分级管控_宁津项目重大风险管控清单', '风险.*管控|重大风险',
    '{"高风险":"高风险","col_1":"col_1","col_2":"col_2","col_3":"col_3","col_4":"col_4","col_5":"col_5","col_6":"col_6","col_7":"col_7","col_8":"col_8"}',
    ARRAY['高风险','col_1'], '{}'::jsonb),

-- === 隐患排查治理模块 (t_10) ===
('hidden_danger', 't_10_隐患排查治理_隐悦排查登记表_2026_06_21', '隐患.*排查|隐悦.*排查',
    '{"序号":"序号","隐悦描述":"隐悦描述","整改措施":"整改措施","检查时间":"检查时间","检查人员":"检查人员","整改人员":"整改人员","整改时间":"整改时间","是否整改完成":"是否整改完成","备注":"备注","区域":"区域","分类":"分类"}',
    ARRAY['序号'], '{"检查时间":"date","整改时间":"date"}'::jsonb)
ON CONFLICT (module_type, table_name) DO NOTHING;


-- ============================================================
-- 13. 验证 — 输出各表记录数
-- ============================================================
DO $$
DECLARE
    tbl TEXT;
    cnt INTEGER;
BEGIN
    RAISE NOTICE '========== Schema 验证 ==========';
    FOR tbl IN
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
    LOOP
        EXECUTE format('SELECT count(*) FROM %I', tbl) INTO cnt;
        RAISE NOTICE '  % : % 条记录', tbl, cnt;
    END LOOP;
    RAISE NOTICE '=================================';
END $$;

-- ============================================================
-- END OF unified_schema.sql
-- ============================================================
