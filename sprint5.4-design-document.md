# HSE Sprint5.4 设计文档 - HSE检查管理中心

**版本**: v1.0  
**日期**: 2026-07-20  
**依据**: 
- Sprint5.3完成报告
- employee表（员工主表）

---

## 一、概述

### 1.1 目标

Sprint5.4 聚焦于**HSE检查管理中心**，新增四个核心表：

| 序号 | 模型 | 表名 | 说明 |
|------|------|------|------|
| 1 | 检查计划 | `inspection_plan` | 定期检查计划管理 |
| 2 | 检查任务 | `inspection_task` | 检查任务分配与执行 |
| 3 | 检查记录 | `inspection_record` | 检查执行记录 |
| 4 | 问题发现 | `hazard_record` | 检查发现的问题/隐患记录 |

### 1.2 业务流程

```
┌─────────────────────────────────────────────────────────────────┐
│                      HSE检查管理流程                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  inspection_plan              inspection_task                   │
│  （检查计划）                  （检查任务）                      │
│      │                              │                           │
│      │  创建任务                    ▼                           │
│      └────────►  执行检查  ─────────────► inspection_record     │
│                                              （检查记录）       │
│                                                   │             │
│                                                   │ 发现问题    │
│                                                   ▼             │
│                                           hazard_record         │
│                                           （问题发现/隐患记录） │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 技术约束

| 约束项 | 说明 |
|--------|------|
| 禁止新增人员表 | `employee` 为唯一人员主表 |
| 禁止姓名关联 | 必须使用employee_id关联人员 |
| 禁止修改 Vben 核心目录 | 不碰 `packages/@core/`、`packages/effects/`、`packages/themes/` |
| 禁止修改 auth/JWT | 不修改认证相关代码 |
| 禁止新增 npm 依赖 | 复用已有依赖 |
| AI 字段仅辅助分析 | AI 不参与安全结论自动生成 |

---

## 二、检查计划（inspection_plan）

### 2.1 设计目标

管理定期检查计划，包括：
- 计划基本信息（名称、类型、范围）
- 频率设置（每日/每周/每月/每年）
- 检查标准与内容清单
- 责任人分配

### 2.2 表结构

```sql
CREATE TABLE inspection_plan (
    id                      BIGSERIAL PRIMARY KEY,
    plan_name               VARCHAR(128) NOT NULL,
    plan_code               VARCHAR(64) NOT NULL UNIQUE,
    plan_type               VARCHAR(32) NOT NULL DEFAULT 'routine',
    plan_category           VARCHAR(32),
    description             TEXT,
    scope_description       TEXT,
    inspection_items        JSONB,
    frequency               VARCHAR(32) NOT NULL DEFAULT 'monthly',
    frequency_interval      INTEGER DEFAULT 1,
    start_date              DATE NOT NULL,
    end_date                DATE,
    next_inspection_date    DATE,
    responsible_id          BIGINT NOT NULL,
    assignee_ids            BIGINT[],
    department_id           BIGINT,
    position_id             BIGINT,
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    approval_required       BOOLEAN NOT NULL DEFAULT FALSE,
    approval_level          INTEGER DEFAULT 1,
    ai_analysis_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
    ai_last_analysis_date   TIMESTAMP,
    ai_last_suggestion      TEXT,
    remark                  TEXT,
    created_by              BIGINT,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    is_deleted              BOOLEAN NOT NULL DEFAULT FALSE
);
```

### 2.3 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| plan_name | VARCHAR(128) | 计划名称 |
| plan_code | VARCHAR(64) | 计划编号（唯一） |
| plan_type | VARCHAR(32) | 计划类型 |
| plan_category | VARCHAR(32) | 计划分类 |
| description | TEXT | 计划描述 |
| scope_description | TEXT | 检查范围描述 |
| inspection_items | JSONB | 检查项清单 |
| frequency | VARCHAR(32) | 检查频率 |
| frequency_interval | INTEGER | 频率间隔（如每2周） |
| start_date | DATE | 开始日期 |
| end_date | DATE | 结束日期 |
| next_inspection_date | DATE | 下次检查日期 |
| responsible_id | BIGINT | 责任人ID（关联employee.id） |
| assignee_ids | BIGINT[] | 执行人员ID列表 |
| department_id | BIGINT | 所属部门 |
| position_id | BIGINT | 适用岗位 |
| is_active | BOOLEAN | 是否启用 |
| approval_required | BOOLEAN | 是否需要审批 |
| approval_level | INTEGER | 审批级别 |
| ai_analysis_enabled | BOOLEAN | 是否启用AI分析 |
| ai_last_analysis_date | TIMESTAMP | 上次AI分析日期 |
| ai_last_suggestion | TEXT | AI建议（仅参考） |

### 2.4 枚举值定义

**计划类型（plan_type）**：
| 值 | 说明 |
|----|------|
| routine | 日常巡检 |
| periodic | 定期检查 |
| special | 专项检查 |
| audit | 内审 |
| external | 外审 |
| emergency | 应急检查 |

**计划分类（plan_category）**：
| 值 | 说明 |
|----|------|
| safety | 安全检查 |
| health | 职业健康 |
| environment | 环保检查 |
| fire | 消防检查 |
| equipment | 设备检查 |
| quality | 质量检查 |

**检查频率（frequency）**：
| 值 | 说明 |
|----|------|
| daily | 每日 |
| weekly | 每周 |
| monthly | 每月 |
| quarterly | 每季度 |
| yearly | 每年 |
| once | 一次性 |

### 2.5 API 端点

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/inspection-plans` | 分页查询检查计划 |
| GET | `/inspection-plans/stats` | 检查计划统计 |
| GET | `/inspection-plans/:id` | 检查计划详情 |
| POST | `/inspection-plans` | 新增检查计划 |
| PUT | `/inspection-plans/:id` | 更新检查计划 |
| DELETE | `/inspection-plans/:id` | 删除检查计划 |
| POST | `/inspection-plans/:id/generate-tasks` | 生成检查任务 |
| POST | `/inspection-plans/batch-generate` | 批量生成任务 |

---

## 三、检查任务（inspection_task）

### 3.1 设计目标

管理检查任务的分配与执行状态，包括：
- 任务基本信息（关联计划、执行人员）
- 任务状态（待执行/进行中/已完成）
- 任务优先级
- 截止日期

### 3.2 表结构

```sql
CREATE TABLE inspection_task (
    id                      BIGSERIAL PRIMARY KEY,
    plan_id                 BIGINT NOT NULL,
    task_name               VARCHAR(128) NOT NULL,
    task_code               VARCHAR(64) NOT NULL UNIQUE,
    assignee_id             BIGINT NOT NULL,
    inspectors              BIGINT[],
    scheduled_date          DATE NOT NULL,
    due_date                DATE,
    status                  VARCHAR(20) NOT NULL DEFAULT 'pending',
    priority                VARCHAR(20) NOT NULL DEFAULT 'normal',
    progress                INTEGER NOT NULL DEFAULT 0,
    inspection_items        JSONB,
    actual_start_time       TIMESTAMP,
    actual_end_time         TIMESTAMP,
    result_summary          TEXT,
    completed_items_count   INTEGER DEFAULT 0,
    total_items_count       INTEGER DEFAULT 0,
    hazards_found_count     INTEGER DEFAULT 0,
    supervisor_id           BIGINT,
    approval_status         VARCHAR(20) DEFAULT 'pending',
    approval_comment        TEXT,
    approval_time           TIMESTAMP,
    approved_by             BIGINT,
    is_deleted              BOOLEAN NOT NULL DEFAULT FALSE,
    created_by              BIGINT,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 3.3 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| plan_id | BIGINT | 关联检查计划ID |
| task_name | VARCHAR(128) | 任务名称 |
| task_code | VARCHAR(64) | 任务编号（唯一） |
| assignee_id | BIGINT | 执行人ID（关联employee.id） |
| inspectors | BIGINT[] | 检查人员ID列表 |
| scheduled_date | DATE | 计划执行日期 |
| due_date | DATE | 截止日期 |
| status | VARCHAR(20) | 任务状态 |
| priority | VARCHAR(20) | 优先级 |
| progress | INTEGER | 进度（0-100） |
| inspection_items | JSONB | 检查项列表 |
| actual_start_time | TIMESTAMP | 实际开始时间 |
| actual_end_time | TIMESTAMP | 实际结束时间 |
| result_summary | TEXT | 结果摘要 |
| completed_items_count | INTEGER | 已完成检查项数 |
| total_items_count | INTEGER | 总检查项数 |
| hazards_found_count | INTEGER | 发现问题数 |
| supervisor_id | BIGINT | 监督人ID |
| approval_status | VARCHAR(20) | 审批状态 |
| approval_comment | TEXT | 审批意见 |
| approval_time | TIMESTAMP | 审批时间 |
| approved_by | BIGINT | 审批人ID |

### 3.4 枚举值定义

**任务状态（status）**：
| 值 | 说明 |
|----|------|
| pending | 待执行 |
| in_progress | 进行中 |
| completed | 已完成 |
| cancelled | 已取消 |
| overdue | 已逾期 |

**优先级（priority）**：
| 值 | 说明 |
|----|------|
| low | 低 |
| normal | 正常 |
| high | 高 |
| urgent | 紧急 |

**审批状态（approval_status）**：
| 值 | 说明 |
|----|------|
| pending | 待审批 |
| approved | 已批准 |
| rejected | 已驳回 |

### 3.5 API 端点

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/inspection-tasks` | 分页查询检查任务 |
| GET | `/inspection-tasks/stats` | 检查任务统计 |
| GET | `/inspection-tasks/:id` | 检查任务详情 |
| GET | `/inspection-tasks/assignee/:employeeId` | 查询员工待执行任务 |
| POST | `/inspection-tasks` | 新增检查任务 |
| PUT | `/inspection-tasks/:id` | 更新检查任务 |
| PUT | `/inspection-tasks/:id/start` | 开始执行任务 |
| PUT | `/inspection-tasks/:id/complete` | 完成任务 |
| PUT | `/inspection-tasks/:id/approve` | 审批任务 |
| DELETE | `/inspection-tasks/:id` | 删除检查任务 |

---

## 四、检查记录（inspection_record）

### 4.1 设计目标

记录每次检查的详细执行情况，包括：
- 检查项执行结果
- 检查时间
- 检查人员
- 现场照片/证据

### 4.2 表结构

```sql
CREATE TABLE inspection_record (
    id                      BIGSERIAL PRIMARY KEY,
    task_id                 BIGINT NOT NULL,
    plan_id                 BIGINT,
    employee_id             BIGINT NOT NULL,
    position_id             BIGINT,
    inspection_time         TIMESTAMP NOT NULL,
    inspection_location     VARCHAR(128),
    item_name               VARCHAR(128) NOT NULL,
    item_category           VARCHAR(64),
    item_code               VARCHAR(64),
    result                  VARCHAR(20) NOT NULL DEFAULT 'pass',
    comment                 TEXT,
    photos                  JSONB,
    attachments             JSONB,
    ai_analysis             TEXT,
    ai_suggestion           TEXT,
    ai_confidence           DECIMAL(5,2),
    is_hazard_detected      BOOLEAN NOT NULL DEFAULT FALSE,
    hazard_record_id        BIGINT,
    is_deleted              BOOLEAN NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 4.3 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| task_id | BIGINT | 关联检查任务ID |
| plan_id | BIGINT | 关联检查计划ID |
| employee_id | BIGINT | 检查人员ID（关联employee.id） |
| position_id | BIGINT | 检查人员岗位ID |
| inspection_time | TIMESTAMP | 检查时间 |
| inspection_location | VARCHAR(128) | 检查地点 |
| item_name | VARCHAR(128) | 检查项名称 |
| item_category | VARCHAR(64) | 检查项分类 |
| item_code | VARCHAR(64) | 检查项编号 |
| result | VARCHAR(20) | 检查结果 |
| comment | TEXT | 备注说明 |
| photos | JSONB | 现场照片列表 |
| attachments | JSONB | 附件列表 |
| ai_analysis | TEXT | AI分析结果（仅参考） |
| ai_suggestion | TEXT | AI建议（仅参考） |
| ai_confidence | DECIMAL(5,2) | AI置信度 |
| is_hazard_detected | BOOLEAN | 是否发现隐患 |
| hazard_record_id | BIGINT | 关联隐患记录ID |

### 4.4 枚举值定义

**检查结果（result）**：
| 值 | 说明 |
|----|------|
| pass | 合格 |
| fail | 不合格 |
| pending | 待确认 |
| not_applicable | 不适用 |

### 4.5 API 端点

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/inspection-records` | 分页查询检查记录 |
| GET | `/inspection-records/stats` | 检查记录统计 |
| GET | `/inspection-records/:id` | 检查记录详情 |
| GET | `/inspection-records/task/:taskId` | 查询任务检查记录 |
| GET | `/inspection-records/employee/:employeeId` | 查询员工检查记录 |
| POST | `/inspection-records` | 新增检查记录 |
| PUT | `/inspection-records/:id` | 更新检查记录 |
| DELETE | `/inspection-records/:id` | 删除检查记录 |
| POST | `/inspection-records/batch-create` | 批量创建检查记录 |

---

## 五、问题发现（hazard_record）

### 5.1 设计目标

记录检查发现的问题/隐患，包括：
- 问题基本信息（描述、分类、等级）
- 整改责任人与期限
- 整改状态跟踪
- 复查记录

### 5.2 表结构

```sql
CREATE TABLE hazard_record (
    id                      BIGSERIAL PRIMARY KEY,
    hazard_code             VARCHAR(64) NOT NULL UNIQUE,
    task_id                 BIGINT NOT NULL,
    record_id               BIGINT,
    employee_id             BIGINT NOT NULL,
    department_id           BIGINT,
    position_id             BIGINT,
    hazard_level            VARCHAR(20) NOT NULL DEFAULT 'medium',
    hazard_category         VARCHAR(32) NOT NULL,
    hazard_type             VARCHAR(64),
    description             TEXT NOT NULL,
    location                VARCHAR(128),
    photos                  JSONB,
    evidence                JSONB,
    root_cause              TEXT,
    ai_root_cause_analysis  TEXT,
    ai_suggestion           TEXT,
    ai_confidence           DECIMAL(5,2),
    responsible_id          BIGINT NOT NULL,
    corrective_actions      JSONB,
    deadline_date           DATE NOT NULL,
    actual_completion_date  DATE,
    status                  VARCHAR(20) NOT NULL DEFAULT 'open',
    review_status           VARCHAR(20) DEFAULT 'pending',
    review_comment          TEXT,
    reviewer_id             BIGINT,
    review_date             DATE,
    is_closed               BOOLEAN NOT NULL DEFAULT FALSE,
    is_deleted              BOOLEAN NOT NULL DEFAULT FALSE,
    created_by              BIGINT,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 5.3 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| hazard_code | VARCHAR(64) | 隐患编号（唯一） |
| task_id | BIGINT | 关联检查任务ID |
| record_id | BIGINT | 关联检查记录ID |
| employee_id | BIGINT | 发现人ID（关联employee.id） |
| department_id | BIGINT | 所属部门 |
| position_id | BIGINT | 发现人岗位 |
| hazard_level | VARCHAR(20) | 隐患等级 |
| hazard_category | VARCHAR(32) | 隐患分类 |
| hazard_type | VARCHAR(64) | 隐患类型 |
| description | TEXT | 隐患描述 |
| location | VARCHAR(128) | 隐患位置 |
| photos | JSONB | 隐患照片 |
| evidence | JSONB | 证据材料 |
| root_cause | TEXT | 根本原因 |
| ai_root_cause_analysis | TEXT | AI根因分析（仅参考） |
| ai_suggestion | TEXT | AI整改建议（仅参考） |
| ai_confidence | DECIMAL(5,2) | AI置信度 |
| responsible_id | BIGINT | 整改责任人ID（关联employee.id） |
| corrective_actions | JSONB | 整改措施 |
| deadline_date | DATE | 整改期限 |
| actual_completion_date | DATE | 实际完成日期 |
| status | VARCHAR(20) | 隐患状态 |
| review_status | VARCHAR(20) | 复查状态 |
| review_comment | TEXT | 复查意见 |
| reviewer_id | BIGINT | 复查人ID |
| review_date | DATE | 复查日期 |
| is_closed | BOOLEAN | 是否已关闭 |

### 5.4 枚举值定义

**隐患等级（hazard_level）**：
| 值 | 说明 |
|----|------|
| critical | 重大隐患 |
| high | 高风险 |
| medium | 中风险 |
| low | 低风险 |

**隐患分类（hazard_category）**：
| 值 | 说明 |
|----|------|
| safety | 安全隐患 |
| health | 职业健康 |
| environment | 环保隐患 |
| fire | 消防隐患 |
| equipment | 设备隐患 |
| process | 工艺隐患 |
| behavior | 行为隐患 |

**隐患状态（status）**：
| 值 | 说明 |
|----|------|
| open | 待整改 |
| in_progress | 整改中 |
| pending_review | 待复查 |
| closed | 已关闭 |
| rejected | 已驳回 |

**复查状态（review_status）**：
| 值 | 说明 |
|----|------|
| pending | 待复查 |
| passed | 复查合格 |
| failed | 复查不合格 |

### 5.5 API 端点

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/hazard-records` | 分页查询隐患记录 |
| GET | `/hazard-records/stats` | 隐患统计 |
| GET | `/hazard-records/:id` | 隐患详情 |
| GET | `/hazard-records/task/:taskId` | 查询任务隐患 |
| GET | `/hazard-records/responsible/:employeeId` | 查询责任人隐患 |
| GET | `/hazard-records/open` | 待整改隐患列表 |
| GET | `/hazard-records/overdue` | 逾期隐患列表 |
| POST | `/hazard-records` | 新增隐患记录 |
| PUT | `/hazard-records/:id` | 更新隐患记录 |
| PUT | `/hazard-records/:id/assign` | 分配整改责任人 |
| PUT | `/hazard-records/:id/complete` | 完成整改 |
| PUT | `/hazard-records/:id/review` | 复查隐患 |
| PUT | `/hazard-records/:id/close` | 关闭隐患 |
| DELETE | `/hazard-records/:id` | 删除隐患记录 |

---

## 六、数据关联关系

```
inspection_plan（检查计划）
    │
    │  plan_id
    ▼
inspection_task（检查任务）
    │
    │  assignee_id → employee.id（执行人）
    │  inspectors → employee.id（检查人员）
    │  supervisor_id → employee.id（监督人）
    │
    │  task_id
    ▼
inspection_record（检查记录）
    │
    │  employee_id → employee.id（检查人员）
    │  is_hazard_detected = true
    │
    │  record_id
    ▼
hazard_record（隐患记录）
    │
    └─► employee_id → employee.id（发现人）
    └─► responsible_id → employee.id（整改责任人）
    └─► reviewer_id → employee.id（复查人）
```

---

## 七、数据库迁移

### 7.1 迁移版本

- **版本**: v64
- **脚本**: `hse_employee_master_v64_extension.sql`
- **内容**: inspection_plan + inspection_task + inspection_record + hazard_record

### 7.2 迁移原则

- 增量迁移，不删除旧字段
- 使用 `CREATE TABLE IF NOT EXISTS`，可重复执行
- 软删除规范：所有表保留 `is_deleted BOOLEAN DEFAULT FALSE`

---

## 八、技术约束遵守

| 约束 | 状态 | 说明 |
|------|------|------|
| 禁止修改Vben核心目录 | ✅ | 未修改 |
| 禁止修改auth/JWT | ✅ | 未修改 |
| 禁止新增npm依赖 | ✅ | 未新增 |
| 禁止新增人员表 | ✅ | 无新增人员表 |
| 禁止姓名关联 | ✅ | 所有人员关联使用employee_id |
| AI字段仅辅助分析 | ✅ | AI字段仅供参考，不参与状态判定 |

---

**文档版本**: v1.0  
**生成日期**: 2026-07-20  
**状态**: ✅ Sprint5.4 设计冻结

---

**文档结束**