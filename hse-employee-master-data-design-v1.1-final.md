# HSE 人员主数据中心架构设计 v1.1

> 版本：v1.1
> 日期：2026-07-20
> 原则：**单一人员主表** + **employee_id 全局关联** + **禁止重复人员表** + **历史变更追踪**

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
| 组织关系无历史追踪 | 员工调岗后无法追溯历史组织归属 |
| 岗位安全属性未独立 | 风险等级、证书要求、培训频次散落在岗位表中，无法灵活配置 |
| 三违直接扣安全积分 | 三违记录直接形成处罚积分，不符合风险管控理念 |

### 1.2 v1.1 修订要点

| 序号 | 修订内容 | 说明 |
|------|---------|------|
| 1 | employee 表降级为纯人员主数据 | 移除 dept_id、position_id、hire_date、leave_date、employment_status，由 hse_employee_org 管理组织关系 |
| 2 | 新增 hse_employee_org | 管理集团→区域→企业→项目→班组五级组织关系，支持历史变更 |
| 3 | 新增 employee_history | 记录入职、调岗、离职、岗位变化等人事变动 |
| 4 | 新增 position_safety_profile | 定义岗位风险等级、必需证书、必需培训、年龄限制 |
| 5 | 新增 position_training_requirement | 岗位自动生成培训要求 |
| 6 | 新增 driver_training_record | 支持驾驶员实操培训记录 |
| 7 | 三违改为安全风险指标 | 移除 deduction_score，改为风险评分和风险等级 |
| 8 | 数据迁移方案优化 | 采用"旧表→同步→验证→逐步切换→归档"的增量迁移策略 |

### 1.3 设计原则

1. **单一人员主表**：`employee` 作为唯一员工主表，仅存储基础身份信息。
2. **employee_id 全局关联**：所有业务模块必须通过 `employee_id` 外键关联员工主表。
3. **组织-岗位-人员三层模型**：`department`（组织树）→ `position`（岗位）→ `hse_employee_org`（人员-组织关联）。
4. **历史变更追踪**：组织关系和人事变动必须保留完整历史记录。
5. **岗位安全属性独立化**：岗位的风险等级、证书要求、培训要求独立配置。
6. **风险指标导向**：三违记录转为安全风险指标，禁止直接形成处罚积分。
7. **冗余字段清理**：业务表仅保留 `employee_id` + 业务专属字段。
8. **软删除一致性**：所有表统一 `is_deleted` + `created_at` + `updated_at` 审计字段。

---

## 二、架构总览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      HSE 人员主数据中心 v1.1                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐            │
│  │  department  │────→│   position   │────→│   employee   │            │
│  │  (组织模型)   │ 1:N │  (岗位模型)   │ 1:N │  (员工主表)   │            │
│  └──────────────┘     └──────┬───────┘     └──────┬───────┘            │
│                              │                    │                    │
│                    ┌─────────▼─────────┐          │                    │
│                    │position_safety_   │          │                    │
│                    │  profile          │          │                    │
│                    │(岗位安全属性)      │          │                    │
│                    └───────────────────┘          │                    │
│                                                   │                    │
│                    ┌──────────────────────────────┼────────┐           │
│                    │                              │        │           │
│           ┌────────▼─────────┐        ┌───────────▼──────┐ │           │
│           │hse_employee_org  │        │  employee_history│ │           │
│           │(人员组织关系)      │        │  (人事变动记录)   │ │           │
│           │ 支持历史变更       │        │  入职/调岗/离职   │ │           │
│           └──────────────────┘        └──────────────────┘ │           │
│                                                              │           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │           │
│  │insurance     │  │  driver      │  │  violation   │      │           │
│  │  _record     │  │  _profile    │  │  _record     │      │           │
│  │ (保险关联)    │  │ (驾驶员关联)  │  │(三违风险指标) │      │           │
│  └──────────────┘  └──────┬───────┘  └──────────────┘      │           │
│                           │                               │           │
│                   ┌───────▼───────┐                       │           │
│                   │driver_training│                       │           │
│                   │  _record      │                       │           │
│                   │(驾驶员实操培训)│                       │           │
│                   └───────────────┘                       │           │
│                                                              │           │
│  ┌──────────────┐              ┌──────────────┐            │           │
│  │grid_respon   │              │fire_safety   │            │           │
│  │  _sibility   │              │ _responsibil │            │           │
│  │ (网格责任)    │              │  ity (消防)   │            │           │
│  └──────────────┘              └──────────────┘            │           │
│                                                              │           │
│  ┌───────────────────────────────────────────────────────────┘           │
│  │                                                                        │
│  │  ┌─────────────────────────────────────────────────────────────┐      │
│  │  │            position_training_requirement                    │      │
│  │  │          (岗位培训要求 - 自动生成培训计划)                     │      │
│  │  └─────────────────────────────────────────────────────────────┘      │
│  │                                                                        │
│  │  ┌─────────────────────────────────────────────────────────────┐      │
│  │  │            training_record                                  │      │
│  │  │          (培训记录 - 关联员工与培训要求)                       │      │
│  │  └─────────────────────────────────────────────────────────────┘      │
│  └────────────────────────────────────────────────────────────────────────┘
```

### 关联关系总表

| 业务模块 | 表名 | 关联字段 | 关系 | 说明 |
|---------|------|---------|------|------|
| 员工主表 | `employee` | `id` | 1:N | 纯人员主数据，仅存身份信息 |
| 组织模型 | `department` | `id` | 1:N | 部门树形结构（五级） |
| 岗位模型 | `position` | `id` | 1:N | 岗位挂载部门 |
| 人员组织关系 | `hse_employee_org` | `employee_id`, `dept_id`, `position_id` | N:N | 支持历史变更 |
| 人事变动记录 | `employee_history` | `employee_id` | 1:N | 入职/调岗/离职记录 |
| 岗位安全属性 | `position_safety_profile` | `position_id` | 1:1 | 风险等级/证书/培训/年龄限制 |
| 岗位培训要求 | `position_training_requirement` | `position_id` | 1:N | 岗位自动生成培训要求 |
| 培训记录 | `training_record` | `employee_id` | 1:N | 培训记录 |
| 保险关联 | `insurance_record` | `employee_id` | 1:N | 参保记录 |
| 驾驶员关联 | `driver_profile` | `employee_id` | 1:1 | 驾驶员资质 |
| 驾驶员实操培训 | `driver_training_record` | `employee_id` | 1:N | 实操培训记录 |
| 三违记录 | `violation_record` | `employee_id` | 1:N | 安全风险指标（禁止扣分） |
| 网格责任 | `grid_responsibility` | `employee_id` | 1:N | 网格长/网格员 |
| 消防责任 | `fire_safety_responsibility` | `employee_id` | 1:N | 消防器材责任人 |

---

## 三、详细表设计

### 3.1 员工主表 `employee`

> **v1.1 修订**：降级为纯人员主数据，仅存储基础身份信息。组织关系（部门、岗位、入职/离职）全部迁移至 `hse_employee_org`，人事变动记录至 `employee_history`。

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
    -- 人员分类（基础属性）
    person_category     VARCHAR(32),  -- 适龄人员/超龄人员
    person_type         VARCHAR(32),  -- 生产人员/管理人员/驾驶员
    is_public_welfare   BOOLEAN      DEFAULT FALSE,      -- 是否公益岗
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

CREATE INDEX idx_employee_category ON employee(person_category) WHERE is_deleted = false;
CREATE INDEX idx_employee_type     ON employee(person_type)     WHERE is_deleted = false;
CREATE INDEX idx_employee_tenant   ON employee(tenant_id)       WHERE is_deleted = false;
```

**v1.1 变更说明**：

| 移除字段 | 迁移目标 | 说明 |
|---------|---------|------|
| `dept_id` | `hse_employee_org.dept_id` | 组织关系独立管理 |
| `position_id` | `hse_employee_org.position_id` | 岗位关联独立管理 |
| `hire_date` | `hse_employee_org.start_date` + `employee_history` | 入职日期记录在组织关系和人事历史中 |
| `leave_date` | `hse_employee_org.end_date` + `employee_history` | 离职日期记录在组织关系和人事历史中 |
| `employment_status` | `hse_employee_org.status` | 在职状态由组织关系管理 |
| `direct_supervisor_id` | `hse_employee_org.supervisor_id` | 直接上级在组织关系中管理 |

---

### 3.2 组织模型 `department`

> **设计要点**：基于现有 `departments` 表扩展，支持五级组织架构（集团→区域→企业→项目→班组），增加层级编码、负责人、编制人数。

```sql
CREATE TABLE department (
    id              BIGSERIAL PRIMARY KEY,
    dept_code       VARCHAR(32)  NOT NULL UNIQUE,  -- 部门编码（如 NJ-HSE-001）
    name            VARCHAR(64)  NOT NULL,          -- 部门全称
    short_name      VARCHAR(32),                    -- 简称
    parent_id       BIGINT REFERENCES department(id), -- 上级部门（树形自关联）
    level           INT,                            -- 层级（1=集团/2=区域/3=企业/4=项目/5=班组）
    path            VARCHAR(256),                   -- 层级路径（如 /1/5/12/）
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
CREATE INDEX idx_dept_level   ON department(level)     WHERE is_deleted = false;
CREATE INDEX idx_dept_tenant  ON department(tenant_id) WHERE is_deleted = false;
```

**五级组织架构**：

| 层级 | level 值 | 说明 | 示例 |
|------|----------|------|------|
| 集团 | 1 | 最高层级 | 江苏环卫集团 |
| 区域 | 2 | 省级/区域分公司 | 南京分公司 |
| 企业 | 3 | 子公司/运营单位 | 江宁运营中心 |
| 项目 | 4 | 具体项目 | 东山街道项目 |
| 班组 | 5 | 最小组织单元 | 清运一班 |

---

### 3.3 岗位模型 `position`

> **设计要点**：新建独立岗位表，挂载在部门下。岗位安全属性（风险等级、证书要求等）已迁移至 `position_safety_profile`。

```sql
CREATE TABLE position (
    id                  BIGSERIAL PRIMARY KEY,
    position_code       VARCHAR(32)  NOT NULL UNIQUE,  -- 岗位编码（如 POS-DRIVER-01）
    name                VARCHAR(64)  NOT NULL,          -- 岗位名称（驾驶员/网格长/安全员...）
    dept_id             BIGINT REFERENCES department(id), -- 所属部门
    -- 岗位属性
    job_category        VARCHAR(32),   -- 岗位类别（管理岗/操作岗/辅助岗）
    is_special_post     BOOLEAN      DEFAULT FALSE,     -- 是否特殊工种（需持证）
    is_safety_critical  BOOLEAN      DEFAULT FALSE,     -- 是否安全关键岗位
    -- 安全职责
    safety_duties       TEXT,          -- 岗位安全职责描述
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
CREATE INDEX idx_position_tenant ON position(tenant_id) WHERE is_deleted = false;
```

**v1.1 变更说明**：

| 移除字段 | 迁移目标 | 说明 |
|---------|---------|------|
| `risk_level` | `position_safety_profile.risk_level` | 风险等级独立配置 |
| `required_certificates` | `position_safety_profile.required_certificates` | 证书要求独立配置 |
| `training_frequency` | `position_safety_profile.training_frequency` | 培训频次独立配置 |

---

### 3.4 人员组织关系 `hse_employee_org` ⭐ 新增

> **设计要点**：v1.1 核心新增表。管理员工的组织归属关系，支持历史变更追踪。员工可能有多个历史组织记录，但只有一条当前有效记录。

```sql
CREATE TABLE hse_employee_org (
    id                  BIGSERIAL PRIMARY KEY,
    employee_id         BIGINT NOT NULL REFERENCES employee(id), -- 关联员工
    -- 五级组织关联
    group_id            BIGINT REFERENCES department(id), -- 集团ID（level=1）
    region_id           BIGINT REFERENCES department(id), -- 区域ID（level=2）
    enterprise_id       BIGINT REFERENCES department(id), -- 企业ID（level=3）
    project_id          BIGINT REFERENCES department(id), -- 项目ID（level=4）
    team_id             BIGINT REFERENCES department(id), -- 班组ID（level=5）
    -- 岗位关联
    position_id         BIGINT REFERENCES position(id),    -- 当前岗位
    -- 任职时间
    start_date          DATE NOT NULL,   -- 任职开始日期
    end_date            DATE,            -- 任职结束日期（NULL=当前有效）
    -- 直接上级
    supervisor_id       BIGINT REFERENCES employee(id), -- 直接上级
    -- 状态
    status              VARCHAR(16) DEFAULT '在职', -- 在职/离职/退休/返聘/待岗
    is_current          BOOLEAN      DEFAULT TRUE,  -- 是否当前有效记录
    -- 变更原因
    change_reason       VARCHAR(256), -- 变更原因（入职/调岗/晋升/降级/离职）
    -- 多租户
    tenant_id           BIGINT DEFAULT 1,
    -- 审计
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    is_deleted          BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_emp_org_employee    ON hse_employee_org(employee_id)    WHERE is_deleted = false;
CREATE INDEX idx_emp_org_group       ON hse_employee_org(group_id)       WHERE is_deleted = false;
CREATE INDEX idx_emp_org_region      ON hse_employee_org(region_id)      WHERE is_deleted = false;
CREATE INDEX idx_emp_org_enterprise  ON hse_employee_org(enterprise_id)  WHERE is_deleted = false;
CREATE INDEX idx_emp_org_project     ON hse_employee_org(project_id)     WHERE is_deleted = false;
CREATE INDEX idx_emp_org_team        ON hse_employee_org(team_id)        WHERE is_deleted = false;
CREATE INDEX idx_emp_org_position    ON hse_employee_org(position_id)    WHERE is_deleted = false;
CREATE INDEX idx_emp_org_is_current  ON hse_employee_org(is_current)     WHERE is_deleted = false;
CREATE INDEX idx_emp_org_status      ON hse_employee_org(status)         WHERE is_deleted = false;
```

**历史变更示例**：

```
员工A 入职记录：
├── group_id=1, region_id=2, enterprise_id=3, project_id=4, team_id=5, position_id=10
├── start_date=2024-01-01, end_date=NULL, is_current=true
└── change_reason='入职'

员工A 调岗记录（2025-06-01）：
├── 更新旧记录：end_date=2025-05-31, is_current=false
└── 新增记录：position_id=15, start_date=2025-06-01, end_date=NULL, is_current=true, change_reason='调岗'
```

---

### 3.5 人事变动记录 `employee_history` ⭐ 新增

> **设计要点**：记录员工的重大人事变动事件（入职、调岗、离职、岗位变化），与 `hse_employee_org` 形成互补。

```sql
CREATE TABLE employee_history (
    id                  BIGSERIAL PRIMARY KEY,
    employee_id         BIGINT NOT NULL REFERENCES employee(id), -- 关联员工
    -- 变动类型
    event_type          VARCHAR(32) NOT NULL,  -- 事件类型（入职/调岗/离职/岗位变化/部门变更/转正/晋升/降级）
    event_date          DATE NOT NULL,         -- 事件发生日期
    -- 变动前后信息
    before_dept_id      BIGINT REFERENCES department(id),  -- 变动前部门
    after_dept_id       BIGINT REFERENCES department(id),  -- 变动后部门
    before_position_id  BIGINT REFERENCES position(id),     -- 变动前岗位
    after_position_id   BIGINT REFERENCES position(id),     -- 变动后岗位
    before_status       VARCHAR(16),  -- 变动前状态
    after_status        VARCHAR(16),  -- 变动后状态
    -- 审批信息
    approver_id         BIGINT REFERENCES employee(id), -- 审批人
    approve_date        DATE,                           -- 审批日期
    approval_no         VARCHAR(64),                    -- 审批单号
    -- 备注
    remark              VARCHAR(512),
    -- 多租户
    tenant_id           BIGINT DEFAULT 1,
    -- 审计
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    is_deleted          BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_emp_history_employee  ON employee_history(employee_id)   WHERE is_deleted = false;
CREATE INDEX idx_emp_history_event_type ON employee_history(event_type)   WHERE is_deleted = false;
CREATE INDEX idx_emp_history_event_date ON employee_history(event_date)  WHERE is_deleted = false;
CREATE INDEX idx_emp_history_dept       ON employee_history(after_dept_id) WHERE is_deleted = false;
```

**事件类型说明**：

| event_type | 说明 | 触发场景 |
|------------|------|---------|
| 入职 | 员工首次入职 | 新员工录入 |
| 调岗 | 部门或岗位变更 | 内部调动 |
| 离职 | 员工离职 | 离职办理 |
| 岗位变化 | 仅岗位变更 | 同部门内岗位调整 |
| 部门变更 | 仅部门变更 | 跨部门调动 |
| 转正 | 试用期转正 | 转正审批 |
| 晋升 | 职位晋升 | 晋升审批 |
| 降级 | 职位降级 | 降级处理 |

---

### 3.6 岗位安全属性 `position_safety_profile` ⭐ 新增

> **设计要点**：v1.1 核心新增表。定义岗位的安全属性（风险等级、必需证书、必需培训、年龄限制），支持灵活配置和合规检查。

```sql
CREATE TABLE position_safety_profile (
    id                  BIGSERIAL PRIMARY KEY,
    position_id         BIGINT NOT NULL UNIQUE REFERENCES position(id), -- 1:1 关联岗位
    -- 风险等级
    risk_level          VARCHAR(16)  DEFAULT '一般',     -- 风险等级（重大/较大/一般/低）
    risk_description    VARCHAR(512),                     -- 风险描述
    -- 必需证书（JSON 数组）
    required_certificates JSONB,  -- 必需证书列表，如 ["驾驶证A1","电工证","高空作业证"]
    certificates_expire_warning INT DEFAULT 30, -- 证书到期预警天数
    -- 必需培训（关联 position_training_requirement）
    -- 年龄限制
    min_age             INT,        -- 最低年龄
    max_age             INT,        -- 最高年龄
    age_warning_threshold INT DEFAULT 5, -- 年龄预警阈值（距最大年龄剩余月数）
    -- 健康要求
    medical_required    BOOLEAN DEFAULT TRUE,  -- 是否需要体检
    medical_frequency   VARCHAR(32),           -- 体检频次（每年/每两年）
    -- 状态
    is_active           BOOLEAN DEFAULT TRUE,  -- 是否启用
    -- 多租户
    tenant_id           BIGINT DEFAULT 1,
    -- 审计
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    is_deleted          BOOLEAN DEFAULT FALSE,
    CONSTRAINT uk_safety_profile_position UNIQUE (position_id)
);

CREATE INDEX idx_safety_profile_risk  ON position_safety_profile(risk_level) WHERE is_deleted = false;
CREATE INDEX idx_safety_profile_tenant ON position_safety_profile(tenant_id) WHERE is_deleted = false;
```

**必需证书 JSON 结构示例**：

```json
[
    {
        "certificate_type": "驾驶证",
        "required_level": "A1",
        "description": "大型客车驾驶证",
        "is_mandatory": true
    },
    {
        "certificate_type": "从业资格证",
        "required_level": "道路旅客运输",
        "description": "道路旅客运输从业资格证",
        "is_mandatory": true
    }
]
```

---

### 3.7 岗位培训要求 `position_training_requirement` ⭐ 新增

> **设计要点**：v1.1 核心新增表。根据岗位安全属性自动生成培训要求，实现岗位→培训需求的自动化关联。

```sql
CREATE TABLE position_training_requirement (
    id                  BIGSERIAL PRIMARY KEY,
    position_id         BIGINT NOT NULL REFERENCES position(id), -- 关联岗位
    -- 培训信息
    training_code       VARCHAR(32) NOT NULL UNIQUE,  -- 培训要求编号（如 TR-POS-DRIVER-01）
    training_name       VARCHAR(128) NOT NULL,         -- 培训名称
    training_type       VARCHAR(32),                   -- 培训类型（岗前培训/在岗培训/专项培训/复训）
    training_category   VARCHAR(32),                   -- 培训类别（安全培训/技能培训/法规培训）
    -- 频次要求
    frequency_type      VARCHAR(32),                   -- 频次类型（每日/每周/每月/每季度/每年）
    frequency_value     INT DEFAULT 1,                 -- 频次值（如每月1次）
    -- 时长要求
    duration_minutes    INT DEFAULT 60,                -- 培训时长（分钟）
    -- 考核要求
    require_exam        BOOLEAN DEFAULT TRUE,          -- 是否需要考核
    pass_score          DECIMAL(5,2) DEFAULT 80,       -- 及格分数
    -- 合规关联
    related_certificate VARCHAR(64),   -- 关联证书（培训合格后颁发）
    compliance_require  BOOLEAN DEFAULT TRUE, -- 是否为合规必需培训
    -- 状态
    is_active           BOOLEAN DEFAULT TRUE,
    -- 多租户
    tenant_id           BIGINT DEFAULT 1,
    -- 审计
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    is_deleted          BOOLEAN DEFAULT FALSE,
    CONSTRAINT uk_training_requirement_code UNIQUE (training_code)
);

CREATE INDEX idx_training_req_position  ON position_training_requirement(position_id)   WHERE is_deleted = false;
CREATE INDEX idx_training_req_type      ON position_training_requirement(training_type) WHERE is_deleted = false;
CREATE INDEX idx_training_req_category  ON position_training_requirement(training_category) WHERE is_deleted = false;
CREATE INDEX idx_training_req_tenant    ON position_training_requirement(tenant_id)     WHERE is_deleted = false;
```

**岗位→培训要求关联示例**：

```
驾驶员岗位 (position_id=10)
    ├── TR-POS-DRIVER-01: 交通安全法规培训（每年1次，4学时，需考核）
    ├── TR-POS-DRIVER-02: 车辆安全检查培训（每月1次，2学时，需考核）
    ├── TR-POS-DRIVER-03: 应急处置培训（每季度1次，4学时，需考核）
    └── TR-POS-DRIVER-04: 防御性驾驶培训（每半年1次，6学时，需考核）
```

---

### 3.8 人员安全档案 `employee_safety_profile`

> **设计要点**：1:1 关联员工主表，承载安全专属信息（超龄管控、合规状态、体检、证书）。v1.1 移除 `safety_score`（三违不再扣分）。

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
    -- 多租户
    tenant_id           BIGINT DEFAULT 1,
    -- 审计
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    is_deleted          BOOLEAN DEFAULT FALSE,
    CONSTRAINT uk_safety_profile_employee UNIQUE (employee_id)
);

CREATE INDEX idx_safety_profile_compliance ON employee_safety_profile(compliance_status) WHERE is_deleted = false;
CREATE INDEX idx_safety_profile_optimize   ON employee_safety_profile(optimize_status)  WHERE is_deleted = false;
```

**v1.1 变更说明**：

| 移除字段 | 原因 |
|---------|------|
| `safety_score` | 三违不再直接扣安全积分，改为安全风险指标 |

---

### 3.9 培训关联 `training_record`

> **设计要点**：基于现有 `training_records` 表重构，新增与岗位培训要求的关联。

```sql
CREATE TABLE training_record (
    id                  BIGSERIAL PRIMARY KEY,
    employee_id         BIGINT NOT NULL REFERENCES employee(id), -- 关联员工
    -- 培训要求关联（v1.1 新增）
    requirement_id      BIGINT REFERENCES position_training_requirement(id), -- 关联岗位培训要求
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
    -- 多租户
    tenant_id           BIGINT DEFAULT 1,
    -- 审计
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    is_deleted          BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_training_employee   ON training_record(employee_id)       WHERE is_deleted = false;
CREATE INDEX idx_training_requirement ON training_record(requirement_id)   WHERE is_deleted = false;
CREATE INDEX idx_training_date       ON training_record(training_date)     WHERE is_deleted = false;
CREATE INDEX idx_training_type       ON training_record(training_type)     WHERE is_deleted = false;
CREATE INDEX idx_training_trainer    ON training_record(trainer_id)        WHERE is_deleted = false;
```

---

### 3.10 保险关联 `insurance_record`

> **设计要点**：基于现有 `personnel_insurance` 表重构，清理冗余，整合 `over_age_personnel` 中的保险字段。

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
    -- 多租户
    tenant_id           BIGINT DEFAULT 1,
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

---

### 3.11 驾驶员关联 `driver_profile`

> **设计要点**：新建驾驶员专属档案表，1:1 关联员工。

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
    -- 驾驶记录
    total_mileage       DECIMAL(10,1) DEFAULT 0, -- 累计行驶里程（km）
    accident_count      INT DEFAULT 0,           -- 驾驶事故次数
    violation_count     INT DEFAULT 0,           -- 交通违章次数
    -- 健康状态
    last_medical_date   DATE,                    -- 最近职业体检日期
    medical_result      VARCHAR(16),             -- 合格/不合格
    -- 多租户
    tenant_id           BIGINT DEFAULT 1,
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

---

### 3.12 驾驶员实操培训记录 `driver_training_record` ⭐ 新增

> **设计要点**：v1.1 新增表。支持驾驶员实操培训的专项记录，包括实操项目、考核结果等。

```sql
CREATE TABLE driver_training_record (
    id                  BIGSERIAL PRIMARY KEY,
    employee_id         BIGINT NOT NULL REFERENCES employee(id), -- 关联员工（驾驶员）
    -- 培训信息
    training_no         VARCHAR(32) NOT NULL UNIQUE,  -- 培训编号（如 DT-2026-0001）
    training_name       VARCHAR(128) NOT NULL,         -- 培训名称（如：倒车入库实操）
    training_type       VARCHAR(32),                   -- 培训类型（场地实操/道路实操/应急处置）
    training_date       DATE NOT NULL,                 -- 培训日期
    duration_minutes    INT DEFAULT 60,                -- 培训时长（分钟）
    -- 实操项目
    practical_items     VARCHAR(512),                  -- 实操项目列表
    -- 考核结果
    assessor_id         BIGINT REFERENCES employee(id), -- 考核人
    result              VARCHAR(16),   -- 合格/不合格/待考核
    score               DECIMAL(5,2),  -- 考核分数
    -- 车辆关联
    vehicle_id          BIGINT,        -- 关联培训车辆（如有）
    vehicle_plate       VARCHAR(32),   -- 车牌号码（冗余）
    -- 状态
    status              VARCHAR(16) DEFAULT '已完成', -- 待培训/培训中/已完成/待考核/已考核
    -- 多租户
    tenant_id           BIGINT DEFAULT 1,
    -- 审计
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    is_deleted          BOOLEAN DEFAULT FALSE,
    CONSTRAINT uk_driver_training_no UNIQUE (training_no)
);

CREATE INDEX idx_driver_training_employee  ON driver_training_record(employee_id)  WHERE is_deleted = false;
CREATE INDEX idx_driver_training_date      ON driver_training_record(training_date) WHERE is_deleted = false;
CREATE INDEX idx_driver_training_type      ON driver_training_record(training_type) WHERE is_deleted = false;
CREATE INDEX idx_driver_training_status    ON driver_training_record(status)       WHERE is_deleted = false;
```

---

### 3.13 三违记录 `violation_record`

> **v1.1 修订**：三违禁止直接形成处罚积分，改为安全风险指标。移除 `deduction_score`，新增风险评分和风险等级字段。

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
    -- 安全风险指标（v1.1 新增，替代 deduction_score）
    risk_score              DECIMAL(5,2) DEFAULT 0, -- 风险评分（0-100，越高风险越大）
    risk_category           VARCHAR(32),   -- 风险类别（低风险/中风险/高风险/重大风险）
    risk_description        VARCHAR(512),  -- 风险描述
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
    -- 备注
    remark                  VARCHAR(512),
    -- 多租户
    tenant_id               BIGINT DEFAULT 1,
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
CREATE INDEX idx_violation_risk       ON violation_record(risk_category)  WHERE is_deleted = false;
CREATE INDEX idx_violation_discoverer ON violation_record(discoverer_id)  WHERE is_deleted = false;
```

**v1.1 变更说明**：

| 移除字段 | 新增字段 | 说明 |
|---------|---------|------|
| `deduction_score` | `risk_score` | 风险评分（0-100），不直接扣分 |
| - | `risk_category` | 风险类别（低/中/高/重大） |
| - | `risk_description` | 风险描述 |

**风险评分规则**：

| 三违类型 | 等级 | risk_score | risk_category |
|---------|------|-----------|---------------|
| 违章指挥 | 一般 | 40 | 中风险 |
| 违章指挥 | 严重 | 80 | 高风险 |
| 违章作业 | 一般 | 30 | 中风险 |
| 违章作业 | 严重 | 70 | 高风险 |
| 违反劳动纪律 | 一般 | 15 | 低风险 |
| 违反劳动纪律 | 严重 | 50 | 中风险 |

---

### 3.14 网格责任关联 `grid_responsibility`

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
    -- 多租户
    tenant_id           BIGINT DEFAULT 1,
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

---

### 3.15 消防责任关联 `fire_safety_responsibility`

> **设计要点**：将现有内存存储的消防器材物理化，通过 `employee_id` 关联责任人。

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
    -- 多租户
    tenant_id           BIGINT DEFAULT 1,
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

---

## 四、ER 关系图

```
                    ┌──────────────────┐
                    │    department    │
                    │  (组织模型)       │
                    │  id, dept_code   │
                    │  name, parent_id │
                    │  level (1-5)     │
                    │  manager_id ──────┼──→ employee
                    └────────┬─────────┘
                             │ 1:N
                    ┌────────▼─────────┐
                    │     position     │
                    │  (岗位模型)       │
                    │  id, position_code│
                    │  name, dept_id   │
                    └────────┬─────────┘
                             │ 1:1
                    ┌────────▼─────────┐
                    │position_safety_  │
                    │   profile        │
                    │(岗位安全属性)     │
                    │risk_level, certs │
                    │min_age, max_age  │
                    └──────────────────┘

                    ┌───────────────────────────────────────────┐
                    │           hse_employee_org               │
                    │     (人员组织关系 - 支持历史变更)           │
                    │  employee_id, group_id, region_id        │
                    │  enterprise_id, project_id, team_id      │
                    │  position_id, start_date, end_date       │
                    │  is_current, change_reason               │
                    └───────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────┐
    │                                                             │
    │              ┌─────────────────────────────────┐            │
    │              │           employee              │            │
    │              │        (员工主表 - 纯身份数据)    │            │
    │              │  id, employee_code, name        │            │
    │              │  id_card, gender, birth_date    │            │
    │              │  phone, person_category         │            │
    │              └──────────────┬──────────────────┘            │
    │                             │                               │
    │     ┌───────────────────────┼───────────────────────┐      │
    │     │                       │                       │      │
    │     │        1:N            │        1:N            │      │
    │     ▼                       ▼                       ▼      │
    │ ┌─────────────┐     ┌───────────────┐     ┌───────────────┐│
    │ │employee_    │     │training_record│     │insurance_     ││
    │ │history      │     │(培训记录)      │     │record         ││
    │ │(人事变动)    │     │requirement_id │     │(保险关联)      ││
    │ │event_type   │     │employee_id    │     │employee_id    ││
    │ │event_date   │     │training_date  │     │insurance_type ││
    │ │before/after │     │result, score  │     │expire_date    ││
    │ └─────────────┘     └───────────────┘     └───────────────┘│
    │                                                             │
    │     ┌─────────────────────────────────────────────────────┐ │
    │     │                                                     │ │
    │     │  1:1                    1:N                         │ │
    │     ▼                         ▼                           │ │
    │ ┌──────────────┐     ┌──────────────┐                     │ │
    │ │driver_profile│     │driver_training│                     │ │
    │ │(驾驶员档案)   │     │_record       │                     │ │
    │ │license_no    │     │(实操培训)     │                     │ │
    │ │license_type  │     │training_no   │                     │ │
    │ │expire_date   │     │employee_id   │                     │ │
    │ └──────────────┘     │training_type │                     │ │
    │                      │result, score │                     │ │
    │                      └──────────────┘                     │ │
    │                                                             │
    │     ┌─────────────────────────────────────────────────────┐ │
    │     │                                                     │ │
    │     │  1:N                    1:N                         │ │
    │     ▼                         ▼                           │ │
    │ ┌──────────────┐     ┌──────────────┐                     │ │
    │ │violation_    │     │grid_         │                     │ │
    │ │record        │     │responsibility│                     │ │
    │ │(三违风险指标) │     │(网格责任)     │                     │ │
    │ │risk_score    │     │employee_id   │                     │ │
    │ │risk_category │     │grid_code     │                     │ │
    │ │status        │     │grid_level    │                     │ │
    │ └──────────────┘     └──────────────┘                     │ │
    │                                                             │
    │     ┌─────────────────────────────────────────────────────┐ │
    │     │                                                     │ │
    │     │                    1:N                              │ │
    │     ▼                                                     │ │
    │ ┌──────────────┐                                          │ │
    │ │fire_equipment│                                          │ │
    │ │(消防器材)     │                                          │ │
    │ │employee_id   │                                          │ │
    │ │equipment_code│                                          │ │
    │ └──────────────┘                                          │ │
    └─────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────────┐
  │                                                                      │
  │            position_training_requirement                              │
  │         (岗位培训要求 - 自动生成)                                      │
  │         position_id, training_code                                   │
  │         training_name, frequency_type                                 │
  │         duration_minutes, require_exam                                │
  │                                                                      │
  │         position_training_requirement.id ──→ training_record.requirement_id
  └──────────────────────────────────────────────────────────────────────┘

  所有业务表统一通过 employee_id 关联 employee.id
```

---

## 五、数据迁移方案

### 5.1 迁移原则

> **v1.1 修订**：禁止一次替换，采用"旧表→同步→验证→逐步切换→归档"的增量迁移策略。

1. **增量迁移**：分阶段实施，每阶段可独立验证，支持回滚。
2. **双写过渡**：迁移期间新旧表双写，读新写旧，逐步切换。
3. **employee_id 全局关联**：保持 `employee_id` 作为全局关联键，确保数据一致性。
4. **历史数据完整保留**：`hse_employee_org` 和 `employee_history` 需要从现有数据中提取历史记录。
5. **风险指标迁移**：三违记录的 `deduction_score` 转换为 `risk_score` 和 `risk_category`。

### 5.2 迁移阶段（v1.1 优化）

```
阶段1：建表与主数据迁移
├── 创建 department / position / employee 表
├── 创建 hse_employee_org（核心新增）
├── 创建 position_safety_profile（核心新增）
├── 创建 position_training_requirement（核心新增）
├── 迁移 departments → department（补充 dept_code/level/path/manager_id）
├── 从 personnel.position 提取岗位数据 → position
├── 迁移 personnel → employee（纯身份数据，移除组织关联字段）
├── 创建 hse_employee_org 记录（从 personnel 提取当前组织关系）
└── 验证：员工数、部门数、岗位数、组织关系数一致性

阶段2：安全档案与业务表迁移
├── 创建 employee_safety_profile（移除 safety_score）
├── 创建 employee_history（核心新增）
├── 迁移 over_age_personnel → employee_safety_profile（has_injury/has_employer → insurance_record）
├── 创建 insurance_record，迁移 personnel_insurance
├── 创建 training_record，迁移 training_records（新增 requirement_id 关联）
├── 创建 driver_profile（从 personnel.position='驾驶员' 提取）
├── 创建 driver_training_record（核心新增，初始化空表）
└── 验证：档案数、保险记录数、培训记录数、驾驶员数一致性

阶段3：三违与责任表迁移（风险指标转换）
├── 创建 violation_record（移除 deduction_score，新增 risk_score/risk_category）
├── 迁移三违内存数据 → violation_record（转换评分规则）
├── 创建 grid_responsibility，迁移 grid_areas
├── 创建 fire_equipment（从内存数据迁移）
└── 验证：三违记录数、风险指标转换正确性、网格责任数、消防器材数一致性

阶段4：同步机制建立（关键阶段）
├── 建立旧表→新表同步触发器（personnel → employee + hse_employee_org）
├── 建立三违评分转换规则（deduction_score → risk_score/risk_category）
├── 配置岗位培训要求（position_training_requirement 初始化）
├── 配置岗位安全属性（position_safety_profile 初始化）
└── 验证：同步机制正确性、转换规则正确性

阶段5：应用层切换
├── 后端 API 逐步切换至新表（按模块切换）
├── 前端联调验证（逐模块验证）
├── 双写验证（确保新旧表数据一致）
└── 验证：全功能回归测试

阶段6：冗余清理与归档
├── 清理业务表冗余字段（name/id_card/dept/position）
├── 停止旧表写入
├── 删除/归档旧表（personnel, over_age_personnel, grid_areas 等）
└── 验证：归档数据完整性、系统稳定性
```

### 5.3 迁移流程详解

```
旧表 (personnel/departments/over_age_personnel/...)
    │
    ▼
┌───────────────────────────────────────────┐
│  阶段1：数据抽取与转换                      │
│  - 提取员工基础身份信息 → employee          │
│  - 提取组织信息 → department               │
│  - 提取岗位信息 → position                 │
│  - 构建组织关系 → hse_employee_org          │
└───────────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────┐
│  阶段2：同步机制建立                        │
│  - 触发器：旧表更新 → 新表同步              │
│  - 双写：新写入同时更新新旧表               │
│  - 定时同步：增量数据同步                    │
└───────────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────┐
│  阶段3：验证                               │
│  - 数据一致性校验（新旧表对比）              │
│  - 业务逻辑验证（查询结果对比）              │
│  - 性能验证（查询响应时间）                  │
└───────────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────┐
│  阶段4：逐步切换                           │
│  - 按模块切换读操作（先读新表）              │
│  - 按模块切换写操作（先写新表）              │
│  - 监控切换后数据一致性                      │
└───────────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────┐
│  阶段5：归档                               │
│  - 停止旧表使用                            │
│  - 备份旧表数据                            │
│  - 删除旧表（可选）                         │
└───────────────────────────────────────────┘
```

### 5.4 关键迁移 SQL 示例

#### 5.4.1 personnel → employee + hse_employee_org

```sql
-- Step 1: 迁移人员基础信息 → employee（纯身份数据）
INSERT INTO employee (
    employee_code, id_card, name, gender, birth_date, age, phone,
    person_category, person_type, is_public_welfare,
    created_at, updated_at, is_deleted, tenant_id
)
SELECT
    p.employee_code,
    p.id_card,
    p.name,
    p.gender,
    p.birth_date,
    p.age,
    p.phone,
    p.person_category,
    p.person_type,
    p.is_public_welfare,
    p.created_at,
    p.updated_at,
    p.is_deleted,
    1
FROM personnel p
WHERE p.is_deleted = false;

-- Step 2: 构建人员组织关系 → hse_employee_org
INSERT INTO hse_employee_org (
    employee_id, dept_id, position_id,
    start_date, end_date, status, is_current,
    change_reason, tenant_id, created_at, updated_at
)
SELECT
    e.id,
    e.dept_id,
    e.position_id,
    e.hire_date,
    e.leave_date,
    e.status,
    CASE WHEN e.status = '在职' THEN true ELSE false END,
    '入职',
    1,
    e.created_at,
    e.updated_at
FROM employee e
LEFT JOIN personnel p ON p.employee_code = e.employee_code
WHERE e.is_deleted = false;
```

#### 5.4.2 三违评分转换（deduction_score → risk_score/risk_category）

```sql
-- 三违评分转换规则
INSERT INTO violation_record (
    violation_no, employee_id, violation_type, violation_level,
    violation_date, department_id, area, description,
    risk_score, risk_category, risk_description,
    discoverer_id, discover_date, rectification_measure,
    deadline, rectifier_id, rectification_date, status,
    reviewer_id, review_date, review_result, remark,
    created_at, updated_at, is_deleted, tenant_id
)
SELECT
    'VIOL-' || LPAD(v.id::TEXT, 6, '0'),
    v.employee_id,
    v.violation_type,
    v.violation_level,
    v.violation_date,
    v.department_id,
    v.area,
    v.description,
    -- 转换规则：deduction_score → risk_score
    CASE
        WHEN v.violation_type = '违章指挥' AND v.violation_level = '严重' THEN 80
        WHEN v.violation_type = '违章指挥' AND v.violation_level = '一般' THEN 40
        WHEN v.violation_type = '违章作业' AND v.violation_level = '严重' THEN 70
        WHEN v.violation_type = '违章作业' AND v.violation_level = '一般' THEN 30
        WHEN v.violation_type = '违反劳动纪律' AND v.violation_level = '严重' THEN 50
        ELSE 15
    END AS risk_score,
    -- 转换规则：risk_category
    CASE
        WHEN v.violation_level = '严重' AND v.violation_type IN ('违章指挥', '违章作业') THEN '高风险'
        WHEN v.violation_level = '严重' THEN '中风险'
        WHEN v.violation_level = '一般' AND v.violation_type IN ('违章指挥', '违章作业') THEN '中风险'
        ELSE '低风险'
    END AS risk_category,
    CONCAT(v.violation_type, '-', v.violation_level, '风险'),
    v.discoverer_id,
    v.discover_date,
    v.rectification_measure,
    v.deadline,
    v.rectifier_id,
    v.rectification_date,
    v.status,
    v.reviewer_id,
    v.review_date,
    v.review_result,
    v.remark,
    v.created_at,
    v.updated_at,
    v.is_deleted,
    1
FROM violations v;
```

---

## 六、查询示例

### 6.1 查询员工完整档案（一查全）

```sql
SELECT
    e.id, e.employee_code, e.name, e.gender, e.age,
    -- 组织信息（从 hse_employee_org 获取当前有效记录）
    dg.name AS group_name,
    dr.name AS region_name,
    de.name AS enterprise_name,
    dp.name AS project_name,
    dt.name AS team_name,
    p.name AS position_name,
    psp.risk_level AS position_risk,
    esp.compliance_status, esp.control_type,
    -- 保险信息
    ir.insurance_type, ir.expire_date AS insurance_expire,
    -- 驾驶员信息
    dp.license_no, dp.license_type, dp.expire_date AS license_expire
FROM employee e
LEFT JOIN hse_employee_org eo ON eo.employee_id = e.id AND eo.is_current = true
LEFT JOIN department dg ON eo.group_id = dg.id
LEFT JOIN department dr ON eo.region_id = dr.id
LEFT JOIN department de ON eo.enterprise_id = de.id
LEFT JOIN department dp ON eo.project_id = dp.id
LEFT JOIN department dt ON eo.team_id = dt.id
LEFT JOIN position p ON eo.position_id = p.id
LEFT JOIN position_safety_profile psp ON psp.position_id = p.id
LEFT JOIN employee_safety_profile esp ON esp.employee_id = e.id
LEFT JOIN insurance_record ir ON ir.employee_id = e.id AND ir.is_current = true
LEFT JOIN driver_profile dp ON dp.employee_id = e.id
WHERE e.id = :employee_id AND e.is_deleted = false;
```

### 6.2 查询员工历史组织变动

```sql
SELECT
    eo.id,
    dg.name AS group_name,
    dr.name AS region_name,
    de.name AS enterprise_name,
    p.name AS position_name,
    eo.start_date,
    eo.end_date,
    eo.status,
    eo.change_reason,
    eh.event_type,
    eh.event_date,
    eh.approval_no
FROM hse_employee_org eo
LEFT JOIN department dg ON eo.group_id = dg.id
LEFT JOIN department dr ON eo.region_id = dr.id
LEFT JOIN department de ON eo.enterprise_id = de.id
LEFT JOIN position p ON eo.position_id = p.id
LEFT JOIN employee_history eh ON eh.employee_id = eo.employee_id 
    AND eh.event_date = eo.start_date
WHERE eo.employee_id = :employee_id AND eo.is_deleted = false
ORDER BY eo.start_date DESC;
```

### 6.3 查询岗位安全属性与培训要求

```sql
SELECT
    p.id, p.position_code, p.name,
    psp.risk_level,
    psp.required_certificates,
    psp.min_age, psp.max_age,
    ptr.training_code,
    ptr.training_name,
    ptr.training_type,
    ptr.frequency_type,
    ptr.frequency_value,
    ptr.duration_minutes,
    ptr.require_exam,
    ptr.pass_score
FROM position p
LEFT JOIN position_safety_profile psp ON psp.position_id = p.id
LEFT JOIN position_training_requirement ptr ON ptr.position_id = p.id
WHERE p.id = :position_id AND p.is_deleted = false
ORDER BY ptr.training_code;
```

### 6.4 查询三违风险指标汇总

```sql
SELECT
    vr.violation_no,
    vr.violation_type,
    vr.violation_level,
    vr.risk_score,
    vr.risk_category,
    vr.risk_description,
    vr.violation_date,
    vr.status,
    e.name AS violator_name,
    d.name AS dept_name
FROM violation_record vr
JOIN employee e ON vr.employee_id = e.id
LEFT JOIN department d ON vr.department_id = d.id
WHERE vr.is_deleted = false
ORDER BY vr.risk_score DESC, vr.violation_date DESC;
```

### 6.5 查询驾驶员实操培训记录

```sql
SELECT
    dtr.training_no,
    dtr.training_name,
    dtr.training_type,
    dtr.training_date,
    dtr.duration_minutes,
    dtr.practical_items,
    dtr.result,
    dtr.score,
    dtr.vehicle_plate,
    e.name AS driver_name,
    ea.name AS assessor_name
FROM driver_training_record dtr
JOIN employee e ON dtr.employee_id = e.id
LEFT JOIN employee ea ON dtr.assessor_id = ea.id
WHERE dtr.employee_id = :employee_id AND dtr.is_deleted = false
ORDER BY dtr.training_date DESC;
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
| `personnel` | `employee` + `hse_employee_org` | 拆分迁移，身份数据→employee，组织关系→hse_employee_org |
| `over_age_personnel` | `employee_safety_profile` + `insurance_record` | 拆分迁移 |
| `departments` | `department` | 补充字段后迁移 |
| `training_records` | `training_record` | 清理冗余字段 + 新增 requirement_id |
| `training_roster` | `position_training_requirement` + `employee.person_type` | 花名册逻辑迁移至岗位培训要求配置 |
| `personnel_insurance` | `insurance_record` | 清理冗余 + 补充字段 |
| `grid_areas` | `grid_responsibility` | 清理冗余 + 补充字段 |

### 7.3 新增的表（v1.1）

| 新表 | 类型 | 说明 |
|------|------|------|
| `hse_employee_org` | N:N 关联 | 人员组织关系（五级），支持历史变更 |
| `employee_history` | 1:N 业务 | 人事变动记录（入职/调岗/离职） |
| `position_safety_profile` | 1:1 扩展 | 岗位安全属性（风险等级/证书/培训/年龄限制） |
| `position_training_requirement` | 1:N 业务 | 岗位培训要求（自动生成培训计划） |
| `driver_training_record` | 1:N 业务 | 驾驶员实操培训记录 |
| `position` | 独立表 | 岗位模型（原无） |
| `employee_safety_profile` | 1:1 扩展 | 安全档案（整合 over_age_personnel） |
| `driver_profile` | 1:1 扩展 | 驾驶员档案（原无） |
| `violation_record` | 独立表 | 三违物理化（原内存，风险指标化） |
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
- **历史记录表**：`hse_employee_org` 和 `employee_history` 不加软删除索引（需保留完整历史）

### 8.4 禁止事项

1. **禁止在业务表中冗余存储人员基础信息**（`name`/`id_card`/`gender`/`age`/`dept`/`position`），统一通过 `employee_id` JOIN 获取。
2. **禁止创建新的人员表**，所有人员数据必须归属 `employee` 表。
3. **禁止使用字符串关联人员**（如 `violator VARCHAR`），必须使用 `employee_id BIGINT` 外键。
4. **禁止在业务表中创建独立的部门字符串字段**，必须使用 `dept_id` 外键。
5. **禁止三违直接扣安全积分**，必须使用风险评分和风险等级。
6. **禁止一次替换迁移**，必须采用"旧表→同步→验证→逐步切换→归档"策略。

---

## 九、附录：完整表清单

| # | 表名 | 类型 | 关联键 | 说明 |
|---|------|------|--------|------|
| 1 | `employee` | 主表 | `id` | 员工主表（纯身份数据） |
| 2 | `department` | 主表 | `id` | 组织模型（五级树形） |
| 3 | `position` | 主表 | `id` | 岗位模型 |
| 4 | `hse_employee_org` | N:N 关联 | `employee_id`, `dept_id`, `position_id` | 人员组织关系（支持历史变更） |
| 5 | `employee_history` | 1:N 业务 | `employee_id` | 人事变动记录 |
| 6 | `position_safety_profile` | 1:1 扩展 | `position_id` | 岗位安全属性 |
| 7 | `position_training_requirement` | 1:N 业务 | `position_id` | 岗位培训要求 |
| 8 | `employee_safety_profile` | 1:1 扩展 | `employee_id` | 人员安全档案 |
| 9 | `training_record` | 1:N 业务 | `employee_id`, `requirement_id` | 培训记录 |
| 10 | `insurance_record` | 1:N 业务 | `employee_id` | 保险关联 |
| 11 | `driver_profile` | 1:1 扩展 | `employee_id` | 驾驶员关联 |
| 12 | `driver_training_record` | 1:N 业务 | `employee_id` | 驾驶员实操培训 |
| 13 | `violation_record` | 1:N 业务 | `employee_id` | 三违记录（风险指标） |
| 14 | `grid_responsibility` | 1:N 业务 | `employee_id` | 网格责任关联 |
| 15 | `fire_equipment` | 1:N 业务 | `employee_id` | 消防责任关联 |

**全局关联键**：`employee_id` → `employee.id`

**核心设计变更（v1.1）**：

| 变更类型 | 变更内容 | 影响范围 |
|---------|---------|---------|
| 表结构调整 | `employee` 降级为纯身份数据 | 所有业务表 |
| 新增表 | `hse_employee_org` | 组织管理、人员查询 |
| 新增表 | `employee_history` | 人事变动追溯 |
| 新增表 | `position_safety_profile` | 岗位安全管理、合规检查 |
| 新增表 | `position_training_requirement` | 培训计划自动生成 |
| 新增表 | `driver_training_record` | 驾驶员实操培训 |
| 字段变更 | `violation_record` 移除 `deduction_score`，新增风险指标 | 三违管理、安全报表 |
| 迁移策略 | 增量迁移（旧表→同步→验证→逐步切换→归档） | 全部模块 |
