# HSE基础数据模型设计

> 版本：v1.0（Sprint6开发前最终版）
> 阶段：Sprint5.17（基础责任数据模型收口设计）
> 日期：2026年7月22日
> 依据：HSE责任体系最终设计说明、HSE组织中心设计报告-v1.0、岗位体系设计
> 状态：🔒 Sprint6开发依据（最终版）

---

## 一、设计定位

### 1.1 文档目的

本文档是Sprint6开发前HSE基础数据模型的**最终设计**，统一整合组织、员工、岗位、责任类型、网格责任、生产管理责任的数据模型。

### 1.2 模型清单

| 模型分类 | 表名 | 说明 | 状态 |
|----------|------|------|:----:|
| 员工主数据 | employee | 员工主表 | ❌ 不修改 |
| 任职关系 | employee_assignment | 员工任职关系 | ❌ 不修改 |
| 管理组织 | hse_org_unit | 管理组织单元 | Sprint6新建 |
| 作业单元 | hse_operation_unit | 生产作业单元 | Sprint6新建 |
| 标准岗位 | position | 标准岗位定义 | Sprint6扩展 |
| 岗位别名 | hse_position_alias | 岗位别名映射 | Sprint6新建 |
| 责任配置 | hse_responsibility_config | 岗位责任类型配置 | Sprint6新建 |
| 责任记录 | hse_responsibility | 统一责任记录 | Sprint6新建 |
| 责任区域 | hse_responsibility_area | 责任区域（可选） | Sprint6新建 |
| 导入映射 | employee_import_mapping_rule | 组织映射规则 | Sprint6新建 |
| 岗位映射 | employee_position_mapping_rule | 岗位映射规则 | Sprint6新建 |
| 规则版本 | employee_import_mapping_rule_version | 规则版本管理 | Sprint6新建 |
| 导入批次 | employee_import_batch | 导入批次记录 | Sprint6新建 |
| 待确认 | employee_import_pending | 待确认记录 | Sprint6新建 |

### 1.3 设计原则

| 原则 | 说明 |
|------|------|
| 不修改核心模型 | employee、employee_assignment、hazards、training、violation_records 不修改 |
| 统一责任模型 | hse_responsibility 统一支持网格责任和生产管理责任 |
| 外键关联 | 所有表通过外键关联，保证数据完整性 |
| 软删除 | 所有业务表使用 is_deleted 软删除 |
| 审计字段 | 所有表包含 created_at、updated_at、created_by、updated_by |

---

## 二、员工主数据模型（不修改）

### 2.1 employee 表

> **状态**：❌ 不修改（Sprint6不改动表结构）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键 |
| employee_no | VARCHAR(64) | UNIQUE | 员工编号 |
| name | VARCHAR(64) | NOT NULL | 姓名 |
| id_card_hash | VARCHAR(64) | UNIQUE | 身份证哈希 |
| phone_hash | VARCHAR(64) | | 手机号哈希 |
| gender | VARCHAR(8) | | 性别 |
| birth_date | DATE | | 出生日期 |
| hire_date | DATE | | 入职日期 |
| status | VARCHAR(20) | DEFAULT 'active' | 状态 |
| ... | ... | ... | 其他字段不修改 |

### 2.2 employee_assignment 表

> **状态**：❌ 不修改（Sprint6不改动表结构）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键 |
| employee_id | BIGINT | NOT NULL, REFERENCES employee(id) | 员工ID |
| org_unit_id | BIGINT | REFERENCES hse_org_unit(id) | 管理组织ID |
| operation_unit_id | BIGINT | REFERENCES hse_operation_unit(id) | 作业单元ID |
| position_id | BIGINT | REFERENCES position(id) | 岗位ID |
| is_primary | BOOLEAN | DEFAULT TRUE | 是否主任职 |
| status | VARCHAR(20) | DEFAULT 'active' | 状态 |
| ... | ... | ... | 其他字段不修改 |

---

## 三、管理组织模型

### 3.1 hse_org_unit 表

> **用途**：管理组织单元（公司/部门/中心/乡镇作业中心）

```sql
CREATE TABLE hse_org_unit (
    id                  BIGSERIAL    PRIMARY KEY,
    parent_id           BIGINT       REFERENCES hse_org_unit(id),
    org_name            VARCHAR(100) NOT NULL,
    org_type            VARCHAR(20)  NOT NULL,  -- company/department/center/town_center
    org_code            VARCHAR(50)  UNIQUE,
    org_alias           VARCHAR(256),           -- 组织别名（v1.1新增）
    leader_employee_id  BIGINT       REFERENCES employee(id),
    safety_manager_id   BIGINT       REFERENCES employee(id),
    headcount           INTEGER      DEFAULT 0,
    sort_order          INTEGER      DEFAULT 0,
    status              VARCHAR(20)  DEFAULT 'active',
    description         TEXT,
    created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    is_deleted          BOOLEAN      DEFAULT FALSE
);

-- 索引
CREATE INDEX idx_hse_org_unit_parent ON hse_org_unit(parent_id);
CREATE INDEX idx_hse_org_unit_type ON hse_org_unit(org_type);
CREATE INDEX idx_hse_org_unit_code ON hse_org_unit(org_code);
CREATE INDEX idx_hse_org_unit_status ON hse_org_unit(status);
```

### 3.2 hse_operation_unit 表

> **用途**：生产作业单元（转运站/收运车组/保洁组/车辆作业组等）

```sql
CREATE TABLE hse_operation_unit (
    id              BIGSERIAL    PRIMARY KEY,
    org_unit_id     BIGINT       NOT NULL REFERENCES hse_org_unit(id),
    unit_name       VARCHAR(100) NOT NULL,
    unit_type       VARCHAR(32)  NOT NULL,  -- transfer_station/collection_team/cleaning_team/barrel_team/vehicle_team/greening_team/maintenance_team
    unit_code       VARCHAR(50)  UNIQUE,
    leader_employee_id BIGINT    REFERENCES employee(id),
    headcount       INTEGER      DEFAULT 0,
    status          VARCHAR(20)  DEFAULT 'active',
    description     TEXT,
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    is_deleted      BOOLEAN      DEFAULT FALSE
);

-- 索引
CREATE INDEX idx_hse_op_unit_org ON hse_operation_unit(org_unit_id);
CREATE INDEX idx_hse_op_unit_type ON hse_operation_unit(unit_type);
CREATE INDEX idx_hse_op_unit_status ON hse_operation_unit(status);
```

### 3.3 组织类型说明

| org_type | 说明 | 层级 | 示例 |
|----------|------|:----:|------|
| company | 公司（根节点） | 1 | XXX环卫有限公司 |
| department | 职能部门 | 2 | 安环管理部、生产管理部、人力综合部、财务部 |
| center | 作业中心 | 2 | 环卫作业中心、市政绿化作业中心 |
| town_center | 乡镇作业中心 | 3 | 宁城街道作业中心、柴胡店镇作业中心 |

### 3.4 作业单元类型说明

| unit_type | 说明 | 归属组织类型 |
|-----------|------|:----------:|
| transfer_station | 转运站 | town_center |
| collection_team | 收运车组 | town_center |
| cleaning_team | 保洁组 | town_center |
| barrel_team | 挂桶组 | town_center |
| vehicle_team | 车辆作业组 | center |
| greening_team | 绿化养护组 | center |
| maintenance_team | 市政维护组 | center |

---

## 四、岗位模型

### 4.1 position 表（扩展）

> **状态**：Sprint6扩展（新增2个标准岗位）

| 岗位ID | 标准岗位名称 | 岗位类别 | 归属组织类型 | 网格层级 | 网格角色 |
|:------:|-------------|----------|:----------:|:--------:|----------|
| 1 | 项目总经理 | 管理岗位 | company | grid1 | 总网格长 |
| 2 | 部门经理 | 管理岗位 | department | grid2 | 一级网格长 |
| 5 | 乡镇作业中心经理 | 管理岗位 | town_center | grid3 | 二级网格长 |
| 6 | 管理员 | 管理岗位 | town_center | grid4 | 三级网格长 |
| 7 | 环卫作业中心片区长 | 管理岗位 | center | - | 生产管理责任人 |
| 8 | 环卫作业中心副经理（人工） | 管理岗位 | center | - | 生产管理责任人 |
| 20 | 保洁员 | 作业岗位 | town_center | - | - |
| 21 | 挂桶员 | 作业岗位 | town_center | - | - |
| 22 | 垃圾收运辅助工 | 作业岗位 | town_center | - | - |
| 31 | 垃圾转运车驾驶员 | 驾驶员岗位 | center | - | - |
| 32 | 垃圾收运车驾驶员 | 驾驶员岗位 | town_center | - | - |
| 33 | 吸污车驾驶员 | 驾驶员岗位 | center | - | - |
| 40 | 转运站管理员 | 站管岗位 | town_center | - | - |
| 50 | 安全管理员 | 职能岗位 | department | - | - |
| 51 | 文员 | 职能岗位 | department | - | - |
| 52 | 会计 | 职能岗位 | department | - | - |
| 53 | 人事专员 | 职能岗位 | department | - | - |

### 4.2 hse_position_alias 表

> **用途**：岗位别名映射（兼容花名册导入）

```sql
CREATE TABLE hse_position_alias (
    id              BIGSERIAL    PRIMARY KEY,
    position_id     BIGINT       NOT NULL REFERENCES position(id),
    position_name   VARCHAR(64)  NOT NULL,
    alias_name      VARCHAR(64)  NOT NULL,
    alias_source    VARCHAR(32),  -- roster/colloquial
    status          VARCHAR(20)  DEFAULT 'active',
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    is_deleted      BOOLEAN      DEFAULT FALSE
);

-- 索引
CREATE INDEX idx_pos_alias_position ON hse_position_alias(position_id);
CREATE INDEX idx_pos_alias_name ON hse_position_alias(alias_name);
CREATE UNIQUE INDEX idx_pos_alias_unique ON hse_position_alias(position_id, alias_name) WHERE is_deleted = FALSE;
```

### 4.3 岗位别名初始化数据

| 标准岗位 | 岗位别名 | 别名来源 |
|----------|----------|:--------:|
| 乡镇作业中心经理 | 乡镇主管 | roster |
| 乡镇作业中心经理 | 人工片区长 | roster |
| 管理员 | 人工班长 | roster |
| 转运站管理员 | 中转站管理员 | roster |
| 安全管理员 | 安环专员 | roster |
| 文员 | 行政综合主管 | roster |
| 文员 | 库管专员 | roster |
| 保洁员 | 乡镇保洁员 | roster |
| 环卫作业中心副经理（人工） | 生产作业中心副经理（人工） | roster |
| 环卫作业中心片区长 | 片区长 | roster |
| 部门经理 | 人力综合部副经理 | roster |
| 部门经理 | 安环管理部副经理 | roster |
| 部门经理 | 生产管理部经理 | roster |
| 文员 | 主管 | roster |
| 文员 | 标准化专员 | roster |
| 文员 | 维保管理专员 | roster |

---

## 五、责任模型（统一）

### 5.1 hse_responsibility 表（核心表）

> **用途**：统一责任记录（网格长责任 + 生产管理责任）
> **命名决策**：hse_grid_responsibility → hse_responsibility（详见《HSE责任体系最终设计说明.md》）

```sql
CREATE TABLE hse_responsibility (
    id                      BIGSERIAL    PRIMARY KEY,
    employee_id             BIGINT       NOT NULL REFERENCES employee(id),
    responsibility_type     VARCHAR(32)  NOT NULL,  -- grid_leader/production_manager
    grid_level              VARCHAR(16),            -- 仅grid_leader：grid1/grid2/grid3/grid4
    grid_role               VARCHAR(32),            -- 仅grid_leader：总/一级/二级/三级网格长
    standard_position       VARCHAR(64),            -- 标准岗位名称
    position_alias          VARCHAR(128),           -- 岗位别名（兼容花名册）
    responsible_org         VARCHAR(128),           -- 责任组织名称
    responsible_org_id      BIGINT       REFERENCES hse_org_unit(id),
    responsible_area        VARCHAR(255),           -- 责任区域描述
    area_id                 BIGINT,                 -- 关联 hse_responsibility_area.id（可选）
    parent_id               BIGINT,                 -- 上级责任记录ID（自关联）
    inspection_frequency    VARCHAR(32),            -- 仅grid_leader：1次/3天、1次/2天、1次/1天
    start_date              DATE,                   -- 责任开始日期
    end_date                DATE,                   -- 责任结束日期（NULL表示当前有效）
    status                  VARCHAR(32)  DEFAULT 'active',
    remark                  TEXT,
    is_deleted              BOOLEAN      DEFAULT FALSE,
    created_at              TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    created_by              BIGINT,
    updated_by              BIGINT
);

-- 索引
CREATE INDEX idx_resp_employee_id ON hse_responsibility(employee_id);
CREATE INDEX idx_resp_type ON hse_responsibility(responsibility_type);
CREATE INDEX idx_resp_grid_level ON hse_responsibility(grid_level);
CREATE INDEX idx_resp_responsible_org_id ON hse_responsibility(responsible_org_id);
CREATE INDEX idx_resp_area_id ON hse_responsibility(area_id);
CREATE INDEX idx_resp_parent_id ON hse_responsibility(parent_id);
CREATE INDEX idx_resp_status ON hse_responsibility(status);
CREATE INDEX idx_resp_employee_active ON hse_responsibility(employee_id, status, is_deleted);
CREATE INDEX idx_resp_type_active ON hse_responsibility(responsibility_type, status, is_deleted);
CREATE INDEX idx_resp_level_active ON hse_responsibility(grid_level, status, is_deleted);
```

### 5.2 hse_responsibility_config 表

> **用途**：岗位责任类型配置（默认责任类型 + 可配置）

```sql
CREATE TABLE hse_responsibility_config (
    id                              BIGSERIAL    PRIMARY KEY,
    position_id                     BIGINT       NOT NULL REFERENCES position(id),
    position_name                   VARCHAR(64)  NOT NULL,
    default_responsibility_type     VARCHAR(32)  NOT NULL,  -- grid_leader/production_manager/none
    default_grid_level              VARCHAR(16),            -- 仅grid_leader
    default_grid_role               VARCHAR(32),            -- 仅grid_leader
    default_inspection_frequency    VARCHAR(32),            -- 仅grid_leader
    is_configurable                 BOOLEAN      DEFAULT TRUE,
    status                          VARCHAR(20)  DEFAULT 'active',
    created_at                      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at                      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    is_deleted                      BOOLEAN      DEFAULT FALSE
);

-- 索引
CREATE INDEX idx_resp_config_position ON hse_responsibility_config(position_id);
CREATE UNIQUE INDEX idx_resp_config_unique ON hse_responsibility_config(position_id) WHERE is_deleted = FALSE;
```

### 5.3 hse_responsibility_area 表（可选）

> **用途**：责任区域信息（区域边界、面积等）

```sql
CREATE TABLE hse_responsibility_area (
    id                  BIGSERIAL    PRIMARY KEY,
    area_code           VARCHAR(64)  UNIQUE,
    area_name           VARCHAR(128) NOT NULL,
    area_type           VARCHAR(32),  -- road/community/township/project
    parent_id           BIGINT       REFERENCES hse_responsibility_area(id),
    area_level          INTEGER      DEFAULT 1,
    boundary            TEXT,        -- 区域边界（GeoJSON）
    area_size           DECIMAL(10,2),-- 面积（平方公里）
    responsible_org     VARCHAR(128),
    remark              TEXT,
    is_deleted          BOOLEAN      DEFAULT FALSE,
    created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_resp_area_code ON hse_responsibility_area(area_code);
CREATE INDEX idx_resp_area_parent ON hse_responsibility_area(parent_id);
CREATE INDEX idx_resp_area_level ON hse_responsibility_area(area_level);
CREATE INDEX idx_resp_area_type ON hse_responsibility_area(area_type);
```

### 5.4 责任类型字段值关系

| 责任类型 | grid_level | grid_role | inspection_frequency | responsibility_type |
|----------|:----------:|:---------:|:--------------------:|:------------------:|
| 网格长 | grid1-4 | 总/一级/二级/三级网格长 | 1次/N天 | grid_leader |
| 生产管理责任人 | NULL | NULL | NULL | production_manager |
| 非责任人 | - | - | - | none（不生成记录） |

---

## 六、花名册导入模型

### 6.1 employee_import_mapping_rule 表

> **用途**：组织映射规则（Excel"所属部门" → hse_org_unit + hse_operation_unit）

```sql
CREATE TABLE employee_import_mapping_rule (
    id              BIGSERIAL    PRIMARY KEY,
    source_value    VARCHAR(128) NOT NULL,
    source_type     VARCHAR(32)  NOT NULL,  -- excel_department
    target_type     VARCHAR(32)  NOT NULL,  -- org_unit/operation_unit
    target_id       BIGINT,
    target_name     VARCHAR(128),
    condition_dept  VARCHAR(128),
    rule_version    VARCHAR(20)  NOT NULL,
    match_priority  INTEGER      DEFAULT 0,
    remark          VARCHAR(256),
    status          VARCHAR(20)  DEFAULT 'active',
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    is_deleted      BOOLEAN      DEFAULT FALSE
);

CREATE INDEX idx_import_mapping_source ON employee_import_mapping_rule(source_value, source_type);
CREATE INDEX idx_import_mapping_version ON employee_import_mapping_rule(rule_version);
```

### 6.2 employee_position_mapping_rule 表

> **用途**：岗位映射规则（Excel"职位" → 标准岗位 + 责任推导）

```sql
CREATE TABLE employee_position_mapping_rule (
    id                      BIGSERIAL    PRIMARY KEY,
    source_position         VARCHAR(128) NOT NULL,
    target_position_id      BIGINT       NOT NULL REFERENCES position(id),
    target_position_name    VARCHAR(128),
    target_position_alias   VARCHAR(128),
    condition_dept          VARCHAR(128),
    grid_level              VARCHAR(16),
    grid_role               VARCHAR(32),
    responsibility_type     VARCHAR(32),  -- v1.1新增：责任类型
    rule_version            VARCHAR(20)  NOT NULL,
    effective_date          DATE         NOT NULL DEFAULT CURRENT_DATE,
    expire_date             DATE,
    status                  VARCHAR(20)  DEFAULT 'active',
    remark                  VARCHAR(256),
    created_by              VARCHAR(64),
    created_at              TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    is_deleted              BOOLEAN      DEFAULT FALSE
);

CREATE INDEX idx_pos_mapping_source ON employee_position_mapping_rule(source_position);
CREATE INDEX idx_pos_mapping_version ON employee_position_mapping_rule(rule_version);
```

### 6.3 其他导入表

| 表名 | 用途 |
|------|------|
| employee_import_mapping_rule_version | 规则版本管理 |
| employee_import_batch | 导入批次记录 |
| employee_import_pending | 待确认记录 |

---

## 七、模型关系图

### 7.1 整体关系图

```
┌─────────────┐     ┌──────────────────────┐     ┌──────────────────┐
│  employee   │────→│ employee_assignment  │────→│  hse_org_unit    │
│  (员工主表)  │     │   (任职关系)          │     │  (管理组织)       │
└─────────────┘     └──────────┬───────────┘     └────────┬─────────┘
                               │                          │
                               │                          ↓
                               │                 ┌────────────────────┐
                               │                 │ hse_operation_unit │
                               │                 │   (作业单元)        │
                               │                 └────────────────────┘
                               │
                               ↓
                    ┌──────────────────┐
                    │     position     │
                    │   (标准岗位)      │
                    └────────┬─────────┘
                             │
                ┌────────────┼────────────┐
                │            │            │
                ↓            ↓            ↓
    ┌──────────────────┐ ┌────────────────────┐ ┌────────────────────┐
    │hse_position_alias│ │hse_responsibility_ │ │ hse_responsibility │
    │   (岗位别名)      │ │     config         │ │   (责任记录)        │
    └──────────────────┘ │   (责任配置)        │ └────────────────────┘
                         └────────────────────┘
```

### 7.2 关联关系说明

| 关联 | 主表 | 从表 | 关联字段 | 关系 |
|------|------|------|----------|:----:|
| 员工任职 | employee | employee_assignment | employee_id | 1:N |
| 任职组织 | employee_assignment | hse_org_unit | org_unit_id | N:1 |
| 任职作业单元 | employee_assignment | hse_operation_unit | operation_unit_id | N:1 |
| 任职岗位 | employee_assignment | position | position_id | N:1 |
| 岗位别名 | position | hse_position_alias | position_id | 1:N |
| 岗位责任配置 | position | hse_responsibility_config | position_id | 1:1 |
| 员工责任 | employee | hse_responsibility | employee_id | 1:N |
| 责任组织 | hse_responsibility | hse_org_unit | responsible_org_id | N:1 |
| 组织作业单元 | hse_org_unit | hse_operation_unit | org_unit_id | 1:N |

---

## 八、历史兼容方案

### 8.1 视图兼容

```sql
-- 兼容历史设计文档中的 hse_grid_responsibility 引用
CREATE VIEW hse_grid_responsibility AS
SELECT 
    id, employee_id, grid_level, grid_role,
    standard_position, position_alias,
    responsible_org, responsible_org_id,
    responsible_area, area_id, parent_id,
    inspection_frequency,
    start_date, end_date, status, remark,
    is_deleted, created_at, updated_at, created_by, updated_by
FROM hse_responsibility
WHERE responsibility_type = 'grid_leader'
  AND is_deleted = FALSE;

-- 兼容历史设计文档中的 hse_position_responsibility_config 引用
CREATE VIEW hse_position_responsibility_config AS
SELECT * FROM hse_responsibility_config;

-- 兼容历史设计文档中的 hse_grid_area 引用
CREATE VIEW hse_grid_area AS
SELECT * FROM hse_responsibility_area;
```

### 8.2 命名映射

| 历史命名 | 新命名 | 兼容方式 |
|----------|--------|----------|
| hse_grid_responsibility | hse_responsibility | 视图 |
| hse_position_responsibility_config | hse_responsibility_config | 视图 |
| hse_grid_area | hse_responsibility_area | 视图 |

---

## 九、修订记录

| 版本 | 日期 | 修订内容 |
|:----:|------|----------|
| v1.0 | 2026-07-22 | 初始版本：Sprint6开发前最终基础数据模型<br>1. 统一责任表命名：hse_responsibility<br>2. 14个数据模型完整设计（含索引）<br>3. 模型关系图与关联关系说明<br>4. 历史兼容方案（视图）<br>5. 17个标准岗位 + 16个别名映射 |

---

**设计完成日期**：2026-07-22
**设计状态**：🔒 Sprint6开发依据（最终版）
