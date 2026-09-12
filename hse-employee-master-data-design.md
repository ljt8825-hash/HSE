# HSE 人员主数据中心架构设计

> 版本：v1.0
> 日期：2026-07-19
> 原则：**单一人员主表** + **employee_id 全局关联** + **禁止重复人员表**

---

## 一、设计目标与原则

### 1.1 痛点分析（现状）

| 问题 | 表现 |
|------|------|
| 人员信息重复存储 | `personnel`、`over_age_personnel`、`training_records`、`training_roster`、`grid_areas`、`accident_persons` 等表均冗余存储 `name`/`id_card`/`dept`/`position` |
| 无独立岗位表 | 岗位以字符串散落在 6+ 张表中，无法统一维护岗位安全职责 |
| 三违/消防无物理表 | `violations`、`fire_equipment` 仅存内存，重启即丢失 |
| 驾驶员无独立关联 | 复用 `position` 字符串判断，无法关联驾驶证、准驾车型 |
| 组织模型扁平 | `departments` 仅 parent_id 树形结构，无岗位挂载、无人员编制 |

### 1.2 设计原则

1. **单一人员主表**：`employee` 作为唯一员工主表，其他业务表禁止冗余存储姓名/身份证/部门等基础信息，统一通过 `employee_id` 关联取数。
2. **employee_id 全局关联**：所有业务模块（培训、保险、驾驶员、三违、网格、消防）必须通过 `employee_id` 外键关联员工主表。
3. **组织-岗位-人员三层模型**：`department`（组织树）→ `position`（岗位）→ `employee`（员工），岗位挂载在组织下，员工归属岗位。
4. **冗余字段清理**：业务表仅保留 `employee_id` + 业务专属字段，姓名/部门/岗位通过 JOIN 主表获取。
5. **软删除一致性**：所有表统一 `is_deleted` + `created_at` + `updated_at` 审计字段。

---

## 二、架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                      HSE 人员主数据中心                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │  department  │────→│   position   │────→│   employee   │    │
│  │  (组织模型)   │ 1:N │  (岗位模型)   │ 1:N │  (员工主表)   │    │
│  └──────────────┘     └──────────────┘     └──────┬───────┘    │
│                                                   │            │
│                              ┌────────────────────┼────────┐   │
│                              │                    │        │   │
│                     ┌────────▼─────────┐  ┌───────▼──────┐ │   │
│                     │ employee_safety  │  │  training    │ │   │
│                     │   _profile       │  │  _record     │ │   │
│                     │  (安全档案)       │  │  (培训关联)   │ │   │
│                     └──────────────────┘  └──────────────┘ │   │
│                                                              │   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │   │
│  │ insurance    │  │  driver      │  │  violation   │      │   │
│  │  _record     │  │  _profile    │  │  _record     │      │   │
│  │ (保险关联)    │  │ (驾驶员关联)  │  │ (三违关联)    │      │   │
│  └──────────────┘  └──────────────┘  └──────────────┘      │   │
│                                                              │   │
│  ┌──────────────┐              ┌──────────────┐            │   │
│  │ grid_respon  │              │ fire_safety  │            │   │
│  │  _sibility   │              │ _responsibil │            │   │
│  │ (网格责任)    │              │  ity (消防)   │            │   │
│  └──────────────┘              └──────────────┘            │   │
│                                                              │   │
└──────────────────────────────────────────────────────────────┘
```

### 关联关系总表

| 业务模块 | 表名 | 关联字段 | 关系 | 说明 |
|---------|------|---------|------|------|
| 员工主表 | `employee` | `id` | 1:N | 全局唯一人员主表 |
| 组织模型 | `department` | `id` → `employee.dept_id` | 1:N | 部门树形结构 |
| 岗位模型 | `position` | `id` → `employee.position_id` | 1:N | 岗位挂载部门 |
| 安全档案 | `employee_safety_profile` | `employee_id` → `employee.id` | 1:1 | 员工安全专属信息 |
| 培训关联 | `training_record` | `employee_id` → `employee.id` | 1:N | 培训记录 |
| 保险关联 | `insurance_record` | `employee_id` → `employee.id` | 1:N | 参保记录 |
| 驾驶员关联 | `driver_profile` | `employee_id` → `employee.id` | 1:1 | 驾驶员资质 |
| 三违关联 | `violation_record` | `employee_id` → `employee.id` | 1:N | 三违记录 |
| 网格责任 | `grid_responsibility` | `employee_id` → `employee.id` | 1:N | 网格长/网格员 |
| 消防责任 | `fire_safety_responsibility` | `employee_id` → `employee.id` | 1:N | 消防器材责任人 |

---

## 三、详细表设计

### 3.1 员工主表 `employee`

> **设计要点**：整合现有 `personnel` 表，作为全系统唯一人员数据源。所有其他表禁止冗余存储 `name`/`id_card`/`dept`/`position`。

```sql
CREATE TABLE employee (
    id                  BIGSERIAL PRIMARY KEY,
    employee_code       VARCHAR(32)  NOT NULL UNIQUE,   -- 工号（全局唯一）
    id_card             VARCHAR(32)  UNIQUE,            -- 身份证号（全局唯一）
    name                VARCHAR(64)  NOT NULL,           -- 姓名
    gender              VARCHAR(8),                      -- 性别（男/女）
    birth_date          DATE,                            -- 出生日期
    age                 INT,                             -- 年龄（计算字段或冗余）
    phone               VARCHAR(20),                     -- 手机号
    -- 组织与岗位关联
    dept_id             BIGINT  REFERENCES department(id),  -- 部门ID
    position_id         BIGINT  REFERENCES position(id),    -- 岗位ID
    -- 入职/离职
    hire_date           DATE,                            -- 入职日期
    leave_date          DATE,                            -- 离职日期
    -- 人员分类
    person_category     VARCHAR(32),  -- 适龄人员/超龄人员
    person_type         VARCHAR(32),  -- 生产人员/管理人员/驾驶员
    employment_status   VARCHAR(16)  DEFAULT '在职',      -- 在职/离职/退休/返聘
    is_public_welfare   BOOLEAN      DEFAULT FALSE,      -- 是否公益岗
    -- 直接上级（员工自关联）
    direct_supervisor_id BIGINT REFERENCES employee(id), -- 直接上级ID
    -- 多租户
    tenant_id           BIGINT       DEFAULT 1,
    -- 审计
    created_at          TIMESTAMPTZ  DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  DEFAULT NOW(),
    is_deleted          BOOLEAN      DEFAULT FALSE,
    -- 索引
    CONSTRAINT uk_employee_code UNIQUE (employee_code),
    CONSTRAINT uk_employee_idcard UNIQUE (id_card)
);

CREATE INDEX idx_employee_dept     ON employee(dept_id)     WHERE is_deleted = false;
CREATE INDEX idx_employee_position ON employee(position_id) WHERE is_deleted = false;
CREATE INDEX idx_employee_status   ON employee(employment_status) WHERE is_deleted = false;
CREATE INDEX idx_employee_tenant   ON employee(tenant_id)   WHERE is_deleted = false;
```

**与现有 `personnel` 表的映射**：

| personnel 字段 | employee 字段 | 变更说明 |
|---------------|---------------|---------|
| `id` | `id` | 主键不变 |
| `employee_code` | `employee_code` | 不变 |
| `id_card` | `id_card` | 不变 |
| `name` | `name` | 不变 |
| `dept` (VARCHAR) | `dept_id` (BIGINT FK) | **字符串→外键**，清理冗余 |
| `position` (VARCHAR) | `position_id` (BIGINT FK) | **字符串→外键**，引入岗位表 |
| `person_category` | `person_category` | 不变 |
| `person_type` | `person_type` | 不变 |
| `status` | `employment_status` | 重命名，语义更清晰 |
| — | `direct_supervisor_id` | **新增**，直接上级自关联 |

---

### 3.2 组织模型 `department`

> **设计要点**：基于现有 `departments` 表扩展，增加层级编码、负责人、编制人数，支持树形组织架构。

```sql
CREATE TABLE department (
    id              BIGSERIAL PRIMARY KEY,
    dept_code       VARCHAR(32)  NOT NULL UNIQUE,  -- 部门编码（如 NJ-HSE-001）
    name            VARCHAR(64)  NOT NULL,          -- 部门全称
    short_name      VARCHAR(32),                    -- 简称
    parent_id       BIGINT REFERENCES department(id), -- 上级部门（树形自关联）
    level           INT,                            -- 层级（1=集团/2=分公司/3=部门/4=班组）
    path            VARCHAR(256),                   -- 层级路径（如 /1/5/12/，便于查询子树）
    township        VARCHAR(32),                    -- 所属乡镇
    -- 负责人关联
    manager_id      BIGINT REFERENCES employee(id), -- 部门负责人
    safety_manager_id BIGINT REFERENCES employee(id), -- 安全负责人
    -- 编制与状态
    headcount       INT  DEFAULT 0,                 -- 编制人数
    sort_order      INT  DEFAULT 0,                 -- 排序
    status          VARCHAR(16) DEFAULT 'active',   -- active/inactive
    description     VARCHAR(256),
    -- 多租户
    tenant_id       BIGINT DEFAULT 1,
    -- 审计
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    is_deleted      BOOLEAN DEFAULT FALSE,
    CONSTRAINT uk_dept_code UNIQUE (dept_code)
);

CREATE INDEX idx_dept_parent  ON department(parent_id) WHERE is_deleted = false;
CREATE INDEX idx_dept_path    ON department(path)      WHERE is_deleted = false;
CREATE INDEX idx_dept_tenant  ON department(tenant_id) WHERE is_deleted = false;
```

**与现有 `departments` 表的映射**：

| departments 字段 | department 字段 | 变更说明 |
|-----------------|----------------|---------|
| `id` | `id` | 不变 |
| `name` | `name` | 不变 |
| `short_name` | `short_name` | 不变 |
| `parent_id` | `parent_id` | 不变 |
| `township` | `township` | 不变 |
| `sort_order` | `sort_order` | 不变 |
| — | `dept_code` | **新增**，统一编码 |
| — | `level` | **新增**，层级 |
| — | `path` | **新增**，层级路径（优化子树查询） |
| — | `manager_id` | **新增**，部门负责人 FK |
| — | `safety_manager_id` | **新增**，安全负责人 FK |
| — | `headcount` | **新增**，编制人数 |

---

### 3.3 岗位模型 `position`

> **设计要点**：新建独立岗位表，挂载在部门下，承载岗位安全职责。解决现有系统中岗位字符串散落各表、无法统一管理的问题。

```sql
CREATE TABLE position (
    id                  BIGSERIAL PRIMARY KEY,
    position_code       VARCHAR(32)  NOT NULL UNIQUE,  -- 岗位编码（如 POS-DRIVER-01）
    name                VARCHAR(64)  NOT NULL,          -- 岗位名称（驾驶员/网格长/安全员...）
    dept_id             BIGINT REFERENCES department(id), -- 所属部门
    -- 岗位属性
    job_category        VARCHAR(32),   -- 岗位类别（管理岗/操作岗/辅助岗）
    risk_level          VARCHAR(16)  DEFAULT '一般',     -- 风险等级（重大/较大/一般/低）
    is_special_post     BOOLEAN      DEFAULT FALSE,     -- 是否特殊工种（需持证）
    is_safety_critical  BOOLEAN      DEFAULT FALSE,     -- 是否安全关键岗位
    -- 安全职责
    safety_duties       TEXT,          -- 岗位安全职责描述
    required_certificates VARCHAR(256), -- 所需证书（JSON 数组，如 ["驾驶证","电工证"]）
    training_frequency  VARCHAR(32),   -- 培训频次要求（1天1次/2天1次/3天1次）
    -- 状态
    sort_order          INT  DEFAULT 0,
    status              VARCHAR(16) DEFAULT 'active',   -- active/inactive
    -- 多租户
    tenant_id           BIGINT DEFAULT 1,
    -- 审计
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    is_deleted          BOOLEAN DEFAULT FALSE,
    CONSTRAINT uk_position_code UNIQUE (position_code)
);

CREATE INDEX idx_position_dept   ON position(dept_id)   WHERE is_deleted = false;
CREATE INDEX idx_position_risk   ON position(risk_level) WHERE is_deleted = false;
CREATE INDEX idx_position_tenant ON position(tenant_id) WHERE is_deleted = false;
```

**岗位与组织关系**：

```
department (部门)
    │
    ├── position (岗位1)  ← 挂载在部门下
    │     └── employee (员工A)
    │     └── employee (员工B)
    │
    └── position (岗位2)
          └── employee (员工C)
```

---

### 3.4 人员安全档案 `employee_safety_profile`

> **设计要点**：1:1 关联员工主表，承载安全专属信息（超龄管控、合规状态、体检、证书）。整合现有 `over_age_personnel` 表的管控逻辑，消除重复人员表。

```sql
CREATE TABLE employee_safety_profile (
    id                  BIGSERIAL PRIMARY KEY,
    employee_id         BIGINT NOT NULL UNIQUE REFERENCES employee(id), -- 1:1 关联
    -- 超龄管控（原 over_age_personnel 逻辑）
    control_type        VARCHAR(32),   -- 管控类型（年龄临界预警/3个月内到达70周岁）
    is_to_optimize      BOOLEAN DEFAULT FALSE,  -- 是否列入待优化
    optimize_status     VARCHAR(16) DEFAULT '待处理', -- 待处理/已优化/暂缓
    optimize_date       DATE,
    optimize_remark     VARCHAR(256),
    -- 合规状态
    compliance_status   VARCHAR(32) DEFAULT '正常', -- danger/warning/正常
    expire_date         DATE,                       -- 合规到期日
    -- 体检记录
    last_exam_date      DATE,           -- 最近体检日期
    next_exam_date      DATE,           -- 下次体检日期
    exam_result         VARCHAR(16),    -- 合格/不合格/受限
    -- 安全证书汇总（明细在 certificate 子表，此处为快照）
    certificate_count   INT DEFAULT 0,  -- 持证数量
    certificates_expwarning INT DEFAULT 0, -- 即将过期证书数
    -- 安全积分
    safety_score        DECIMAL(5,2) DEFAULT 100, -- 安全积分（满分100，三违扣分）
    -- 审计
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    is_deleted          BOOLEAN DEFAULT FALSE,
    CONSTRAINT uk_safety_profile_employee UNIQUE (employee_id)
);

CREATE INDEX idx_safety_profile_compliance ON employee_safety_profile(compliance_status) WHERE is_deleted = false;
CREATE INDEX idx_safety_profile_optimize   ON employee_safety_profile(optimize_status)  WHERE is_deleted = false;
```

**与现有 `over_age_personnel` 表的映射**：

| over_age_personnel 字段 | employee_safety_profile 字段 | 说明 |
|------------------------|------------------------------|------|
| `personnel_id` | `employee_id` | 改名，语义统一 |
| `name`/`id_card`/`gender`/`age`/`dept`/`position` | **删除冗余** | 通过 JOIN employee 获取 |
| `control_type` | `control_type` | 保留 |
| `is_to_optimize` | `is_to_optimize` | 保留 |
| `optimize_status`/`optimize_date`/`optimize_remark` | 同名 | 保留 |
| `compliance` | `compliance_status` | 重命名 |
| `expire_date` | `expire_date` | 保留 |
| `has_injury`/`has_employer` | **迁移至 insurance_record** | 保险信息归保险模块 |

---

### 3.5 培训关联 `training_record`

> **设计要点**：基于现有 `training_records` 表重构，清理冗余人员字段，统一通过 `employee_id` 关联。

```sql
CREATE TABLE training_record (
    id                  BIGSERIAL PRIMARY KEY,
    employee_id         BIGINT NOT NULL REFERENCES employee(id), -- 关联员工
    -- 培训信息
    training_type       VARCHAR(32) DEFAULT 'HSE',  -- 培训类型（HSE/岗前/专项/复训）
    training_date       DATE NOT NULL,               -- 培训日期
    duration_minutes    INT,                         -- 培训时长（分钟）
    content             VARCHAR(512),                -- 培训内容
    frequency           VARCHAR(32),                 -- 培训频次（1天1次/2天1次/3天1次）
    grid_level          VARCHAR(32),                 -- 网格层级（原冗余字段保留为业务属性）
    -- 考核结果
    result              VARCHAR(16),  -- 合格/不合格/缺勤
    score               DECIMAL(5,2), -- 考核分数
    trainer_id          BIGINT REFERENCES employee(id), -- 培训人（关联员工）
    trainer_name        VARCHAR(64),  -- 培训人姓名（冗余，便于显示）
    -- 培训项目关联
    training_plan_id    BIGINT,       -- 关联培训计划（如有）
    certificate_no      VARCHAR(64),  -- 培训合格证编号
    -- 审计
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    is_deleted          BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_training_employee ON training_record(employee_id)   WHERE is_deleted = false;
CREATE INDEX idx_training_date     ON training_record(training_date) WHERE is_deleted = false;
CREATE INDEX idx_training_type     ON training_record(training_type) WHERE is_deleted = false;
CREATE INDEX idx_training_trainer  ON training_record(trainer_id)    WHERE is_deleted = false;
```

**与现有 `training_records` 表的映射**：

| training_records 字段 | training_record 字段 | 变更说明 |
|----------------------|---------------------|---------|
| `personnel_id` | `employee_id` | **改名**，语义统一 |
| `name`/`id_card`/`dept`/`position` | **删除冗余** | 通过 JOIN employee 获取 |
| `training_type` | `training_type` | 保留 |
| `training_date` | `training_date` | 保留 |
| `duration_minutes` | `duration_minutes` | 保留 |
| `content` | `content` | 保留 |
| `result` | `result` | 保留 |
| `score` | `score` | 保留 |
| `trainer` (VARCHAR) | `trainer_id` (FK) + `trainer_name` | **字符串→外键** |
| `frequency` | `frequency` | 保留 |
| `grid_level` | `grid_level` | 保留为业务属性 |

---

### 3.6 保险关联 `insurance_record`

> **设计要点**：基于现有 `personnel_insurance` 表重构，清理冗余，整合 `over_age_personnel` 中的 `has_injury`/`has_employer` 字段。

```sql
CREATE TABLE insurance_record (
    id                  BIGSERIAL PRIMARY KEY,
    employee_id         BIGINT NOT NULL REFERENCES employee(id), -- 关联员工
    -- 保险信息
    insurance_type      VARCHAR(32) NOT NULL,  -- 险种（工伤险/雇主责任险/意外伤害险）
    policy_no           VARCHAR(64),           -- 保单号
    insurer             VARCHAR(64),           -- 承保公司
    coverage_amount     DECIMAL(12,2),         -- 保额（万元）
    premium             DECIMAL(12,2),         -- 年保费（元）
    -- 有效期
    start_date          DATE NOT NULL,         -- 起保日期
    expire_date         DATE,                  -- 到期日期
    is_current          BOOLEAN DEFAULT TRUE,  -- 是否当前有效
    -- 快照字段（便于快速判断）
    has_injury          BOOLEAN DEFAULT FALSE, -- 是否有工伤险（快照）
    has_employer        BOOLEAN DEFAULT FALSE, -- 是否有雇主险（快照）
    -- 审计
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    is_deleted          BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_insurance_employee  ON insurance_record(employee_id)    WHERE is_deleted = false;
CREATE INDEX idx_insurance_type      ON insurance_record(insurance_type) WHERE is_deleted = false;
CREATE INDEX idx_insurance_expire    ON insurance_record(expire_date)    WHERE is_deleted = false;
CREATE INDEX idx_insurance_current   ON insurance_record(is_current)     WHERE is_deleted = false;
```

**与现有 `personnel_insurance` 表的映射**：

| personnel_insurance 字段 | insurance_record 字段 | 变更说明 |
|-------------------------|----------------------|---------|
| `personnel_id` | `employee_id` | **改名** |
| `person_name` | **删除冗余** | 通过 JOIN employee 获取 |
| `insurance_type` | `insurance_type` | 保留 |
| `policy_no` | `policy_no` | 保留 |
| `coverage_amount` | `coverage_amount` | 保留 |
| `premium` | `premium` | 保留 |
| `start_date`/`expire_date` | 同名 | 保留 |
| `is_current` | `is_current` | 保留 |
| — | `insurer` | **新增**（原仅在车辆保险表有） |
| — | `has_injury`/`has_employer` | **新增**，从 over_age_personnel 迁移 |

---

### 3.7 驾驶员关联 `driver_profile`

> **设计要点**：新建驾驶员专属档案表，1:1 关联员工。解决现有系统无独立驾驶员表、仅靠 `position` 字符串判断的问题。

```sql
CREATE TABLE driver_profile (
    id                  BIGSERIAL PRIMARY KEY,
    employee_id         BIGINT NOT NULL UNIQUE REFERENCES employee(id), -- 1:1 关联
    -- 驾驶证信息
    license_no          VARCHAR(32) NOT NULL,   -- 驾驶证号
    license_type        VARCHAR(16),            -- 准驾车型（A1/A2/B1/B2/C1/C2...）
    issue_date          DATE,                   -- 初次领证日期
    expire_date         DATE,                   -- 驾驶证到期日
    annual_review_date  DATE,                   -- 年审日期
    -- 驾驶资质状态
    license_status      VARCHAR(16) DEFAULT '正常', -- 正常/暂扣/吊销/过期
    is_qualified        BOOLEAN DEFAULT TRUE,   -- 是否具备驾驶资质
    -- 关联车辆（1:N，通过 vehicle 表的 driver_id 反向关联）
    -- 驾驶记录
    total_mileage       DECIMAL(10,1) DEFAULT 0, -- 累计行驶里程（km）
    accident_count      INT DEFAULT 0,           -- 驾驶事故次数
    violation_count     INT DEFAULT 0,           -- 交通违章次数
    -- 健康状态
    last_medical_date   DATE,                    -- 最近职业体检日期
    medical_result      VARCHAR(16),             -- 合格/不合格
    -- 审计
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    is_deleted          BOOLEAN DEFAULT FALSE,
    CONSTRAINT uk_driver_employee UNIQUE (employee_id),
    CONSTRAINT uk_driver_license UNIQUE (license_no)
);

CREATE INDEX idx_driver_license_type  ON driver_profile(license_type)    WHERE is_deleted = false;
CREATE INDEX idx_driver_expire        ON driver_profile(expire_date)      WHERE is_deleted = false;
CREATE INDEX idx_driver_status        ON driver_profile(license_status)   WHERE is_deleted = false;
```

**与现有系统关系**：

| 现有实现 | driver_profile 设计 | 说明 |
|---------|---------------------|------|
| `personnel.position = '驾驶员'` | `employee_id` + `driver_profile` | **字符串判断→独立档案表** |
| `vehicles.owner` (字符串) | `vehicles.driver_id` → `employee.id` | 车辆关联驾驶员改为 FK |
| `accidents.involved_person` | `accidents.employee_id` | 事故涉事驾驶员统一关联 |

---

### 3.8 三违关联 `violation_record`

> **设计要点**：将现有内存存储的三违记录物理化，通过 `employee_id` 关联员工主表。

```sql
CREATE TABLE violation_record (
    id                      BIGSERIAL PRIMARY KEY,
    violation_no            VARCHAR(32) NOT NULL UNIQUE, -- 三违编号（如 VIOL-2026-0001）
    employee_id             BIGINT REFERENCES employee(id), -- 违规人员（关联员工）
    -- 违规信息
    violation_type          VARCHAR(32),  -- 三违类型（违章指挥/违章作业/违反劳动纪律）
    violation_level         VARCHAR(16),  -- 等级（一般/严重）
    violation_date          DATE NOT NULL, -- 违规日期
    department_id           BIGINT REFERENCES department(id), -- 违规发生部门
    area                    VARCHAR(128), -- 违规区域
    description             TEXT,         -- 违规描述
    -- 发现与整改
    discoverer_id           BIGINT REFERENCES employee(id), -- 发现人（关联员工）
    discover_date           DATE,         -- 发现日期
    rectification_measure   TEXT,         -- 整改措施
    deadline                DATE,         -- 整改期限
    rectifier_id            BIGINT REFERENCES employee(id), -- 整改人（关联员工）
    rectification_date      DATE,         -- 整改完成日期
    -- 状态
    status                  VARCHAR(16) DEFAULT '待整改', -- 待整改/整改中/已整改/已复查
    reviewer_id             BIGINT REFERENCES employee(id), -- 复查人
    review_date             DATE,                              -- 复查日期
    review_result           VARCHAR(16),                       -- 合格/不合格
    -- 扣分
    deduction_score         DECIMAL(5,2) DEFAULT 0, -- 扣减安全积分
    remark                  VARCHAR(512),
    -- 审计
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW(),
    is_deleted              BOOLEAN DEFAULT FALSE,
    CONSTRAINT uk_violation_no UNIQUE (violation_no)
);

CREATE INDEX idx_violation_employee   ON violation_record(employee_id)    WHERE is_deleted = false;
CREATE INDEX idx_violation_dept       ON violation_record(department_id)  WHERE is_deleted = false;
CREATE INDEX idx_violation_date       ON violation_record(violation_date) WHERE is_deleted = false;
CREATE INDEX idx_violation_status     ON violation_record(status)         WHERE is_deleted = false;
CREATE INDEX idx_violation_discoverer ON violation_record(discoverer_id)  WHERE is_deleted = false;
```

**与现有内存存储的映射**：

| 内存字段 | violation_record 字段 | 变更说明 |
|---------|----------------------|---------|
| `violator` (VARCHAR) | `employee_id` (FK) | **字符串→外键** |
| `discoverer` (VARCHAR) | `discoverer_id` (FK) | **字符串→外键** |
| `rectifier` (VARCHAR) | `rectifier_id` (FK) | **字符串→外键** |
| `department` (VARCHAR) | `department_id` (FK) | **字符串→外键** |
| `title`/`type`/`level`/`status` | 同名或语义对应 | 保留 |
| `description`/`rectificationMeasure` | `description`/`rectification_measure` | snake_case 规范 |
| — | `violation_no` | **新增**，统一编号 |
| — | `deduction_score` | **新增**，关联安全积分 |

---

### 3.9 网格责任关联 `grid_responsibility`

> **设计要点**：基于现有 `grid_areas` 表重构，清理冗余人员字段，通过 `employee_id` 关联。

```sql
CREATE TABLE grid_responsibility (
    id                  BIGSERIAL PRIMARY KEY,
    grid_code           VARCHAR(32) NOT NULL UNIQUE,  -- 网格编号（如 G001）
    grid_level          VARCHAR(32) NOT NULL,          -- 网格层级（总网格长/一级/二级/三级）
    employee_id         BIGINT NOT NULL REFERENCES employee(id), -- 网格长（关联员工）
    -- 网格区域信息
    area                VARCHAR(128),  -- 网格区域
    township            VARCHAR(32),   -- 所属乡镇
    parent_grid_id      BIGINT REFERENCES grid_responsibility(id), -- 上级网格（树形）
    -- 巡查配置
    patrol_frequency    VARCHAR(32),   -- 巡查频次
    risk_level          VARCHAR(16) DEFAULT '一般', -- 风险等级
    completion_rate     DECIMAL(5,2) DEFAULT 0,     -- 完成率%
    -- 状态
    status              VARCHAR(16) DEFAULT '在岗',  -- 在岗/离岗
    start_date          DATE,           -- 任网格长开始日期
    end_date            DATE,           -- 任网格长结束日期（支持历史记录）
    -- 审计
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    is_deleted          BOOLEAN DEFAULT FALSE,
    CONSTRAINT uk_grid_code UNIQUE (grid_code)
);

CREATE INDEX idx_grid_employee   ON grid_responsibility(employee_id)   WHERE is_deleted = false;
CREATE INDEX idx_grid_level      ON grid_responsibility(grid_level)    WHERE is_deleted = false;
CREATE INDEX idx_grid_parent     ON grid_responsibility(parent_grid_id) WHERE is_deleted = false;
CREATE INDEX idx_grid_township   ON grid_responsibility(township)      WHERE is_deleted = false;
```

**与现有 `grid_areas` 表的映射**：

| grid_areas 字段 | grid_responsibility 字段 | 变更说明 |
|----------------|--------------------------|---------|
| `personnel_id` | `employee_id` | **改名** |
| `name` (网格长姓名) | **删除冗余** | 通过 JOIN employee 获取 |
| `position` (VARCHAR) | **删除冗余** | 通过 JOIN position 获取 |
| `phone` | **删除冗余** | 通过 JOIN employee 获取 |
| `grid_code` | `grid_code` | 保留 |
| `grid_level` | `grid_level` | 保留 |
| `area`/`township` | 同名 | 保留 |
| `patrol_frequency` | `patrol_frequency` | 保留 |
| `completion_rate` | `completion_rate` | 保留 |
| `risk_level` | `risk_level` | 保留 |
| `status` | `status` | 保留 |
| — | `parent_grid_id` | **新增**，网格树形结构 |
| — | `start_date`/`end_date` | **新增**，任期管理 |

---

### 3.10 消防责任关联 `fire_safety_responsibility`

> **设计要点**：将现有内存存储的消防器材物理化，通过 `employee_id` 关联责任人。消防器材与责任人解耦（一个员工可负责多个器材）。

```sql
CREATE TABLE fire_equipment (
    id                  BIGSERIAL PRIMARY KEY,
    equipment_code      VARCHAR(32) NOT NULL UNIQUE,  -- 器材编号
    name                VARCHAR(64) NOT NULL,          -- 器材名称
    type                VARCHAR(32),                   -- 类型（灭火器/消火栓/消防水带...）
    model               VARCHAR(64),                   -- 规格/型号
    quantity            INT DEFAULT 1,                 -- 数量
    location            VARCHAR(256),                  -- 配置地点
    -- 责任人关联
    employee_id         BIGINT REFERENCES employee(id), -- 责任人（关联员工）
    -- 检查维护
    install_date        DATE,           -- 安装日期
    expiry_date         DATE,           -- 到期日期
    last_check_date     DATE,           -- 上次检查日期
    next_check_date     DATE,           -- 下次检查日期
    check_frequency     VARCHAR(32),    -- 检查频次（每月/每季度/每半年）
    status              VARCHAR(16) DEFAULT '正常', -- 正常/异常/已过期/已报废
    remark              VARCHAR(512),
    -- 审计
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    is_deleted          BOOLEAN DEFAULT FALSE,
    CONSTRAINT uk_fire_equipment_code UNIQUE (equipment_code)
);

CREATE INDEX idx_fire_employee  ON fire_equipment(employee_id)  WHERE is_deleted = false;
CREATE INDEX idx_fire_location  ON fire_equipment(location)     WHERE is_deleted = false;
CREATE INDEX idx_fire_status    ON fire_equipment(status)       WHERE is_deleted = false;
CREATE INDEX idx_fire_expiry    ON fire_equipment(expiry_date)  WHERE is_deleted = false;
```

**与现有内存存储的映射**：

| 内存字段 | fire_equipment 字段 | 变更说明 |
|---------|---------------------|---------|
| `manager` (VARCHAR) | `employee_id` (FK) | **字符串→外键** |
| `phone` | **删除冗余** | 通过 JOIN employee 获取 |
| `name`/`type`/`model`/`location`/`quantity` | 同名 | 保留 |
| `installDate`/`expiryDate` | snake_case | 规范化 |
| `lastCheckDate`/`nextCheckDate` | snake_case | 规范化 |
| `status` | `status` | 保留 |
| — | `equipment_code` | **新增**，统一编号 |
| — | `check_frequency` | **新增**，检查频次 |

---

## 四、ER 关系图

```
                    ┌──────────────────┐
                    │    department    │
                    │  (组织模型)       │
                    │  id, dept_code   │
                    │  name, parent_id │
                    │  manager_id ──────┼──→ employee
                    │  level, path      │
                    └────────┬─────────┘
                             │ 1:N
                    ┌────────▼─────────┐
                    │     position     │
                    │  (岗位模型)       │
                    │  id, position_code│
                    │  name, dept_id   │
                    │  risk_level      │
                    │  safety_duties   │
                    └────────┬─────────┘
                             │ 1:N
    ┌────────────────────────┼────────────────────────────────┐
    │                        │                                │
    │              ┌─────────▼─────────┐                      │
    │              │     employee      │                      │
    │              │  (员工主表)        │                      │
    │              │  id, employee_code │                      │
    │              │  name, id_card    │                      │
    │              │  dept_id ─────────┼──→ department        │
    │              │  position_id ─────┼──→ position          │
    │              │  supervisor_id ───┼──→ employee(自关联)   │
    │              └─────────┬─────────┘                      │
    │                        │                                │
    │         ┌──────────────┼──────────────┐                 │
    │         │              │              │                 │
    │  1:1    │   1:N        │   1:N        │   1:N           │
    │  ┌──────▼──────┐ ┌─────▼─────┐ ┌─────▼──────┐ ┌────────▼────────┐
    │  │employee_    │ │training_  │ │insurance_  │ │violation_record │
    │  │safety_      │ │record     │ │record      │ │(三违关联)        │
    │  │profile      │ │(培训关联)  │ │(保险关联)   │ │                 │
    │  │(安全档案)    │ │           │ │            │ │employee_id      │
    │  │             │ │employee_id│ │employee_id │ │violation_type   │
    │  │employee_id  │ │training_  │ │insurance_  │ │status           │
    │  │(UNIQUE)     │ │date       │ │type        │ │deduction_score  │
    │  │control_type │ │result     │ │expire_date │ └─────────────────┘
    │  │compliance   │ │score      │ │is_current  │
    │  │safety_score │ └───────────┘ └────────────┘
    │  └─────────────┘
    │
    │  1:1                    1:N                    1:N
    │  ┌──────────────┐ ┌──────────────┐  ┌───────────────────┐
    │  │driver_profile│ │grid_         │  │fire_equipment     │
    │  │(驾驶员关联)   │ │responsibility│  │(消防责任关联)      │
    │  │              │ │(网格责任)     │  │                   │
    │  │employee_id   │ │employee_id   │  │employee_id        │
    │  │(UNIQUE)      │ │grid_code     │  │equipment_code     │
    │  │license_no    │ │grid_level    │  │name, type, model  │
    │  │license_type  │ │area, township│  │location           │
    │  │expire_date   │ │patrol_freq   │  │expiry_date        │
    │  └──────────────┘ │risk_level    │  │status             │
    │                   │completion_%  │  └───────────────────┘
    │                   └──────────────┘
    │
    └──→ 所有业务表统一通过 employee_id 关联 employee.id
```

---

## 五、迁移策略

### 5.1 迁移原则

1. **存量数据不丢失**：现有 `personnel` 表数据完整迁移至 `employee`，冗余字段在过渡期保留。
2. **渐进式迁移**：分阶段实施，每阶段可独立验证，支持回滚。
3. **双写过渡**：迁移期间新旧表双写，读新写旧，逐步切换。
4. **冗余字段后清理**：所有业务表迁移完成后，清理冗余的 `name`/`id_card`/`dept`/`position` 字段。

### 5.2 迁移阶段

```
阶段1：建表与主数据迁移
├── 创建 department / position / employee 表
├── 迁移 departments → department（补充 dept_code/level/path/manager_id）
├── 从 personnel.position 提取岗位数据 → position
├── 迁移 personnel → employee（dept_id/position_id 填充）
└── 验证：员工数、部门数、岗位数一致性

阶段2：安全档案与业务表迁移
├── 创建 employee_safety_profile
├── 迁移 over_age_personnel → employee_safety_profile（has_injury/has_employer → insurance_record）
├── 创建 insurance_record，迁移 personnel_insurance
├── 创建 training_record，迁移 training_records（清理冗余字段）
└── 验证：档案数、保险记录数、培训记录数一致性

阶段3：新建物理表
├── 创建 driver_profile（从 personnel.position='驾驶员' 提取）
├── 创建 violation_record（从内存数据迁移，若有）
├── 创建 grid_responsibility，迁移 grid_areas
├── 创建 fire_equipment（从内存数据迁移，若有）
└── 验证：各业务表数据完整性

阶段4：应用层切换与冗余清理
├── 后端 API 切换至新表
├── 前端联调验证
├── 清理业务表冗余字段（name/id_card/dept/position）
├── 删除/归档旧表（personnel, over_age_personnel, grid_areas 等）
└── 验证：全功能回归测试
```

### 5.3 数据迁移映射示例（personnel → employee + position）

```sql
-- Step 1: 从 personnel.position 提取岗位（去重）
INSERT INTO position (position_code, name, job_category, risk_level, created_at)
SELECT
    'POS-' || LPAD(ROW_NUMBER() OVER (ORDER BY position)::TEXT, 4, '0'),
    position,
    CASE
        WHEN position LIKE '%驾驶员%' THEN '操作岗'
        WHEN position LIKE '%管理%' OR position LIKE '%长%' THEN '管理岗'
        ELSE '操作岗'
    END,
    CASE
        WHEN position LIKE '%驾驶员%' THEN '重大'
        WHEN position LIKE '%安全%' THEN '较大'
        ELSE '一般'
    END,
    NOW()
FROM personnel
WHERE position IS NOT NULL AND position != ''
  AND is_deleted = false
GROUP BY position;

-- Step 2: 迁移 personnel → employee
INSERT INTO employee (
    employee_code, id_card, name, gender, birth_date, age, phone,
    dept_id, position_id, hire_date, leave_date,
    person_category, person_type, employment_status, is_public_welfare,
    created_at, updated_at, is_deleted
)
SELECT
    p.employee_code,
    p.id_card,
    p.name,
    p.gender,
    p.birth_date,
    p.age,
    p.phone,
    p.dept_id,
    pos.id,
    p.hire_date,
    p.leave_date,
    p.person_category,
    p.person_type,
    p.status,
    p.is_public_welfare,
    p.created_at,
    p.updated_at,
    p.is_deleted
FROM personnel p
LEFT JOIN position pos ON pos.name = p.position
WHERE p.is_deleted = false;
```

---

## 六、查询示例

### 6.1 查询员工完整档案（一查全）

```sql
SELECT
    e.id, e.employee_code, e.name, e.gender, e.age,
    d.name AS dept_name,
    p.name AS position_name, p.risk_level AS position_risk,
    esp.compliance_status, esp.safety_score, esp.control_type,
    ir.insurance_type, ir.expire_date AS insurance_expire,
    dp.license_no, dp.license_type, dp.expire_date AS license_expire
FROM employee e
LEFT JOIN department d  ON e.dept_id = d.id
LEFT JOIN position p    ON e.position_id = p.id
LEFT JOIN employee_safety_profile esp ON esp.employee_id = e.id
LEFT JOIN insurance_record ir ON ir.employee_id = e.id AND ir.is_current = true
LEFT JOIN driver_profile dp   ON dp.employee_id = e.id
WHERE e.id = :employee_id AND e.is_deleted = false;
```

### 6.2 查询部门全员培训记录

```sql
SELECT
    e.employee_code, e.name, p.name AS position_name,
    tr.training_date, tr.training_type, tr.result, tr.score
FROM employee e
LEFT JOIN position p ON e.position_id = p.id
LEFT JOIN training_record tr ON tr.employee_id = e.id AND tr.is_deleted = false
WHERE e.dept_id = :dept_id AND e.is_deleted = false
ORDER BY e.employee_code, tr.training_date DESC;
```

### 6.3 查询某员工的三违记录与安全积分

```sql
SELECT
    vr.violation_no, vr.violation_type, vr.violation_level,
    vr.violation_date, vr.description, vr.status,
    vr.deduction_score,
    esp.safety_score
FROM violation_record vr
JOIN employee_safety_profile esp ON esp.employee_id = vr.employee_id
WHERE vr.employee_id = :employee_id AND vr.is_deleted = false
ORDER BY vr.violation_date DESC;
```

### 6.4 查询网格责任人及其巡查区域

```sql
SELECT
    gr.grid_code, gr.grid_level, gr.area, gr.township,
    gr.risk_level, gr.completion_rate, gr.status,
    e.name AS grid_leader_name, e.phone,
    d.name AS dept_name,
    pos.name AS position_name
FROM grid_responsibility gr
JOIN employee e   ON gr.employee_id = e.id
LEFT JOIN department d ON e.dept_id = d.id
LEFT JOIN position pos ON e.position_id = pos.id
WHERE gr.is_deleted = false
ORDER BY gr.grid_code;
```

### 6.5 查询消防器材责任人及到期预警

```sql
SELECT
    fe.equipment_code, fe.name, fe.type, fe.location,
    fe.expiry_date, fe.status,
    fe.next_check_date,
    e.name AS manager_name, e.phone,
    d.name AS dept_name
FROM fire_equipment fe
LEFT JOIN employee e   ON fe.employee_id = e.id
LEFT JOIN department d ON e.dept_id = d.id
WHERE fe.is_deleted = false
  AND fe.expiry_date <= CURRENT_DATE + INTERVAL '30 days'
ORDER BY fe.expiry_date ASC;
```

---

## 七、与现有系统兼容性说明

### 7.1 保留的表（不改动）

| 表名 | 说明 | 与主数据关系 |
|------|------|-------------|
| `vehicles` | 车辆基础信息 | 新增 `driver_id` FK 关联 `employee.id` |
| `grid_patrol_logs` | 网格巡查日志 | 通过 `grid_id` 关联 `grid_responsibility` |
| `accidents` | 事故记录 | `personnel_id` 改名 `employee_id` |
| `accident_persons` | 事故涉事人员 | `personnel_id` 改名 `employee_id` |
| `hazards` | 隐患排查 | `fixer`/`checker` 改为 `employee_id` FK |
| `hse_events` 等 HSE 核心表 | 事件/风险/管控 | `personnel_id` 改名 `employee_id` |
| `file_records` / `import_logs` | 导入系统 | 不涉及人员主数据 |

### 7.2 废弃的表（迁移后归档）

| 旧表 | 新表 | 迁移方式 |
|------|------|---------|
| `personnel` | `employee` | 数据迁移 + 字段映射 |
| `over_age_personnel` | `employee_safety_profile` + `insurance_record` | 拆分迁移 |
| `departments` | `department` | 补充字段后迁移 |
| `training_records` | `training_record` | 清理冗余字段 |
| `training_roster` | `employee.person_type` + `position` | 花名册逻辑迁移至岗位配置 |
| `personnel_insurance` | `insurance_record` | 清理冗余 + 补充字段 |
| `grid_areas` | `grid_responsibility` | 清理冗余 + 补充字段 |

### 7.3 新建的表

| 新表 | 类型 | 说明 |
|------|------|------|
| `position` | 独立表 | 岗位模型（原无） |
| `employee_safety_profile` | 1:1 扩展 | 安全档案（整合 over_age_personnel） |
| `driver_profile` | 1:1 扩展 | 驾驶员档案（原无） |
| `violation_record` | 独立表 | 三违物理化（原内存） |
| `fire_equipment` | 独立表 | 消防器材物理化（原内存） |

---

## 八、设计规范

### 8.1 命名规范

| 规范 | 示例 |
|------|------|
| 表名：小写 + 下划线 + 单数 | `employee`, `training_record` |
| 字段名：小写 + 下划线 | `employee_id`, `hire_date` |
| 外键字段：`表名单数_id` | `employee_id`, `dept_id`, `position_id` |
| 布尔字段：`is_` / `has_` 前缀 | `is_deleted`, `has_injury` |
| 编码字段：`xxx_code` | `employee_code`, `dept_code`, `grid_code` |
| 日期字段：`xxx_date` | `hire_date`, `expire_date` |

### 8.2 统一审计字段

所有业务表必须包含：

```sql
created_at  TIMESTAMPTZ DEFAULT NOW(),  -- 创建时间
updated_at  TIMESTAMPTZ DEFAULT NOW(),  -- 更新时间
is_deleted  BOOLEAN DEFAULT FALSE       -- 软删除标记
```

### 8.3 外键约束规范

- **人员关联**：统一使用 `employee_id BIGINT REFERENCES employee(id)`
- **组织关联**：统一使用 `dept_id BIGINT REFERENCES department(id)`
- **岗位关联**：统一使用 `position_id BIGINT REFERENCES position(id)`
- **软删除过滤**：所有索引加 `WHERE is_deleted = false` 条件

### 8.4 禁止事项

1. **禁止在业务表中冗余存储人员基础信息**（`name`/`id_card`/`gender`/`age`/`dept`/`position`），统一通过 `employee_id` JOIN 获取。
2. **禁止创建新的人员表**，所有人员数据必须归属 `employee` 表。
3. **禁止使用字符串关联人员**（如 `violator VARCHAR`），必须使用 `employee_id BIGINT` 外键。
4. **禁止在业务表中创建独立的部门字符串字段**，必须使用 `dept_id` 外键。

---

## 九、附录：完整表清单

| # | 表名 | 类型 | 关联键 | 说明 |
|---|------|------|--------|------|
| 1 | `employee` | 主表 | `id` | 员工主表（唯一人员数据源） |
| 2 | `department` | 主表 | `id` | 组织模型（树形） |
| 3 | `position` | 主表 | `id` | 岗位模型 |
| 4 | `employee_safety_profile` | 1:1 扩展 | `employee_id` | 人员安全档案 |
| 5 | `training_record` | 1:N 业务 | `employee_id` | 培训关联 |
| 6 | `insurance_record` | 1:N 业务 | `employee_id` | 保险关联 |
| 7 | `driver_profile` | 1:1 扩展 | `employee_id` | 驾驶员关联 |
| 8 | `violation_record` | 1:N 业务 | `employee_id` | 三违关联 |
| 9 | `grid_responsibility` | 1:N 业务 | `employee_id` | 网格责任关联 |
| 10 | `fire_equipment` | 1:N 业务 | `employee_id` | 消防责任关联 |

**全局关联键**：`employee_id` → `employee.id`
