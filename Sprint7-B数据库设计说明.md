# Sprint7-B 数据库设计说明

## 一、概述

本文档描述HSE智能预警中心的数据库设计，共包含4张核心业务表，所有表均遵循PostgreSQL规范，支持软删除和版本化管理。

### 1.1 设计原则
- 所有规则版本化管理，读取hse_warning_rule_version表
- 不修改任何现有冻结模型表结构
- 支持软删除（is_deleted字段）
- 冗余设计优化查询性能
- 索引覆盖常用查询字段

### 1.2 表清单

| 序号 | 表名 | 说明 | 版本 |
|------|------|------|------|
| 1 | hse_warning_rule | 预警规则表 | v1.1 |
| 2 | hse_warning_record | 预警记录表 | v1.1 |
| 3 | hse_warning_task | 预警整改任务表 | v1.1 |
| 4 | hse_warning_rule_version | 预警规则版本管理表 | v1.1 |

---

## 二、表结构详细设计

### 2.1 hse_warning_rule（预警规则表）

**说明**：存储所有预警规则的配置信息，支持版本化管理。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键ID |
| rule_code | VARCHAR(64) | NOT NULL UNIQUE | 规则编号，如WR-EMP-001 |
| rule_name | VARCHAR(128) | NOT NULL | 规则名称 |
| source_type | VARCHAR(32) | NOT NULL | 预警来源：employee_risk/driver_risk/accident/assessment/management |
| warning_level | VARCHAR(20) | NOT NULL | 预警等级：critical/major/minor/info |
| target_type | VARCHAR(20) | NOT NULL DEFAULT 'employee' | 预警对象类型：employee/organization |
| condition_config | JSONB | NOT NULL DEFAULT '{}' | 触发条件配置（JSON） |
| action_config | JSONB | NOT NULL DEFAULT '{}' | 处置动作配置（是否自动派发任务等） |
| description | TEXT | | 规则描述 |
| status | VARCHAR(20) | NOT NULL DEFAULT 'active' | 状态：active/inactive |
| version | VARCHAR(20) | NOT NULL DEFAULT 'v1.0' | 规则版本号 |
| parent_version_id | BIGINT | | 上一版本ID（版本链） |
| created_by | BIGINT | | 创建人ID |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 更新时间 |
| is_deleted | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除标记 |

**索引**：
- `idx_warning_rule_source`：source_type（is_deleted = false）
- `idx_warning_rule_status`：status（is_deleted = false）

---

### 2.2 hse_warning_record（预警记录表）

**说明**：存储系统生成的预警记录，包含升级机制字段。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键ID |
| warning_code | VARCHAR(64) | NOT NULL UNIQUE | 预警编号，如WN-20250115-0001 |
| rule_id | BIGINT | | 关联规则ID |
| rule_name | VARCHAR(128) | | 规则名称（冗余） |
| rule_version | VARCHAR(20) | | 规则版本（冗余） |
| source_type | VARCHAR(32) | NOT NULL | 预警来源 |
| warning_level | VARCHAR(20) | NOT NULL | 预警等级 |
| target_type | VARCHAR(20) | NOT NULL DEFAULT 'employee' | 对象类型 |
| target_id | BIGINT | | 对象ID（员工ID或组织ID） |
| target_name | VARCHAR(128) | | 对象名称 |
| org_id | BIGINT | | 责任单位ID |
| org_name | VARCHAR(128) | | 责任单位名称 |
| risk_reason | TEXT | | 风险原因描述 |
| risk_data | JSONB | | 风险原始数据（JSON快照） |
| status | VARCHAR(20) | NOT NULL DEFAULT 'pending' | 状态：pending/processing/resolved/closed/ignored |
| rectification_task_id | BIGINT | | 关联整改任务ID |
| handled_by | BIGINT | | 处理人ID |
| handled_at | TIMESTAMP | | 处理时间 |
| closed_by | BIGINT | | 关闭人ID |
| closed_at | TIMESTAMP | | 关闭时间 |
| close_remark | TEXT | | 关闭备注 |
| is_escalated | BOOLEAN | NOT NULL DEFAULT FALSE | 是否已升级（v1.1新增） |
| escalated_at | TIMESTAMP | | 升级时间（v1.1新增） |
| original_level | VARCHAR(20) | | 原始预警等级（v1.1新增） |
| escalation_notified | BOOLEAN | NOT NULL DEFAULT FALSE | 是否已发送升级通知（v1.1新增） |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 更新时间 |
| is_deleted | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除标记 |

**索引**：
- `idx_warning_record_source`：source_type（is_deleted = false）
- `idx_warning_record_level`：warning_level（is_deleted = false）
- `idx_warning_record_status`：status（is_deleted = false）
- `idx_warning_record_org`：org_id（is_deleted = false）
- `idx_warning_record_target`：target_id, target_type（is_deleted = false）
- `idx_warning_record_created`：created_at DESC

---

### 2.3 hse_warning_task（预警整改任务表）

**说明**：存储预警关联的整改任务，支持完整闭环工作流。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键ID |
| task_code | VARCHAR(64) | NOT NULL UNIQUE | 任务编号，如WT-20250115-0001 |
| warning_id | BIGINT | | 关联预警ID |
| warning_code | VARCHAR(64) | | 关联预警编号（冗余） |
| task_title | VARCHAR(200) | NOT NULL | 任务标题 |
| description | TEXT | | 任务描述 |
| responsible_id | BIGINT | NOT NULL | 责任人ID（employee.id） |
| responsible_name | VARCHAR(64) | | 责任人姓名（冗余） |
| org_id | BIGINT | | 责任单位ID |
| org_name | VARCHAR(128) | | 责任单位名称 |
| deadline_date | DATE | NOT NULL | 整改期限 |
| actual_completion_date | DATE | | 实际完成日期 |
| status | VARCHAR(20) | NOT NULL DEFAULT 'pending' | 状态：pending/dispatched/processing/pending_review/closed/rejected |
| progress | INTEGER | DEFAULT 0 | 进度(0-100) |
| priority | VARCHAR(20) | DEFAULT 'normal' | 优先级：low/normal/high/urgent |
| process_note | TEXT | | 处理说明 |
| process_attachment | JSONB | | 处理附件（证明材料路径列表） |
| processed_at | TIMESTAMP | | 处理提交时间 |
| review_by | BIGINT | | 复核人ID |
| review_name | VARCHAR(64) | | 复核人姓名 |
| review_note | TEXT | | 复核意见 |
| review_attachment | JSONB | | 复核附件 |
| reviewed_at | TIMESTAMP | | 复核时间 |
| review_result | VARCHAR(20) | | 复核结果：approved/rejected |
| closed_at | TIMESTAMP | | 关闭时间 |
| closed_by | BIGINT | | 关闭人ID |
| close_note | TEXT | | 关闭备注 |
| created_by | BIGINT | | 创建人ID |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 更新时间 |
| is_deleted | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除标记 |

**索引**：
- `idx_warning_task_status`：status（is_deleted = false）
- `idx_warning_task_responsible`：responsible_id（is_deleted = false）
- `idx_warning_task_org`：org_id（is_deleted = false）
- `idx_warning_task_warning`：warning_id（is_deleted = false）
- `idx_warning_task_deadline`：deadline_date（is_deleted = false）
- `idx_warning_task_priority`：priority（is_deleted = false）

---

### 2.4 hse_warning_rule_version（预警规则版本管理表）

**说明**：存储规则的版本快照，支持版本追溯和回滚。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键ID |
| rule_id | BIGINT | NOT NULL | 规则ID |
| version | VARCHAR(20) | NOT NULL | 版本号 |
| snapshot | JSONB | NOT NULL | 规则快照（完整配置） |
| change_log | TEXT | | 变更说明 |
| status | VARCHAR(20) | NOT NULL DEFAULT 'active' | 状态：active/expired |
| created_by | BIGINT | | 创建人ID |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 创建时间 |
| is_deleted | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除标记 |

**索引**：
- `idx_warning_rule_version_rule`：rule_id（is_deleted = false）

---

## 三、初始化数据

### 3.1 10条默认预警规则

系统初始化时自动插入10条预警规则，版本信息如下：

| 规则编号 | 规则名称 | 来源类型 | 等级 | 版本 | 自动派发 | 整改期限 |
|----------|----------|----------|------|------|----------|----------|
| WR-EMP-001 | 高风险员工预警 | employee_risk | critical | v1.0 | 是 | 3天 |
| WR-EMP-002 | 风险持续升高员工预警 | employee_risk | major | v1.0 | 否 | 7天 |
| WR-DRV-001 | 驾驶证扣分异常预警 | driver_risk | major | v1.1 | 是 | 5天 |
| WR-DRV-002 | 交通事故责任人员预警 | driver_risk | major | v1.0 | 是 | 7天 |
| WR-ACC-001 | 重大事故预警 | accident | critical | v1.0 | 是 | 3天 |
| WR-ACC-002 | 重复事故预警 | accident | major | v1.0 | 是 | 5天 |
| WR-ASM-001 | 组织评分下降预警 | assessment | minor | v1.0 | 否 | 10天 |
| WR-ASM-002 | 红黄牌组织预警 | assessment | major | v1.0 | 是 | 7天 |
| WR-MGT-001 | 网格长巡查不足预警 | management | minor | v1.0 | 否 | 7天 |
| WR-MGT-002 | 整改逾期预警 | management | major | v1.0 | 是 | 3天 |

---

## 四、ER关系图

```
hse_warning_rule (1) ──── (N) hse_warning_rule_version
       │
       │ 1
       │
       │ N
       ↓
hse_warning_record (1) ──── (0..1) hse_warning_task
```

关系说明：
- 一条规则对应多个版本记录
- 一条规则可生成多条预警记录
- 一条预警记录关联0或1条整改任务

---

## 五、迁移文件

**文件路径**：[sprint7_warning_center_migration.sql](file:///f:/deploy/hse-dashboard/server/sql/sprint7_warning_center_migration.sql)

**执行说明**：
1. 使用`CREATE TABLE IF NOT EXISTS`确保幂等性
2. 使用`INSERT ... WHERE NOT EXISTS`确保初始化数据幂等
3. 所有索引使用`CREATE INDEX IF NOT EXISTS`
4. 执行命令：`psql -U username -d database -f sprint7_warning_center_migration.sql`

---

## 六、数据字典

### 6.1 预警来源枚举（source_type）

| 值 | 说明 |
|----|------|
| employee_risk | 员工风险 |
| driver_risk | 驾驶风险 |
| accident | 事故中心 |
| assessment | 考核中心 |
| management | 管理履职 |

### 6.2 预警等级枚举（warning_level）

| 值 | 说明 | 颜色 |
|----|------|------|
| critical | 重大 | red |
| major | 较大 | orange |
| minor | 一般 | gold |
| info | 提示 | blue |

### 6.3 预警状态枚举（status - record）

| 值 | 说明 |
|----|------|
| pending | 待处理 |
| processing | 处理中 |
| resolved | 已解决 |
| closed | 已关闭 |
| ignored | 已忽略 |

### 6.4 任务状态枚举（status - task）

| 值 | 说明 |
|----|------|
| pending | 待下发 |
| dispatched | 已下发 |
| processing | 处理中 |
| pending_review | 待复核 |
| closed | 已关闭 |
| rejected | 已驳回 |

### 6.5 任务优先级枚举（priority）

| 值 | 说明 |
|----|------|
| low | 低 |
| normal | 正常 |
| high | 高 |
| urgent | 紧急 |
