# HSE Sprint5.1 人员主数据中心 - 数据库迁移报告

**版本**: v1.0  
**日期**: 2026-07-20  
**数据库**: PostgreSQL 17  
**迁移脚本**: v59 + v61

---

## 一、迁移概述

### 1.1 迁移目标
Sprint5.1 人员主数据中心数据库迁移，创建 7 张核心业务表 + 1 个视图，支持人员主数据全生命周期管理。

### 1.2 迁移版本

| 版本 | 脚本文件 | 内容 |
|------|----------|------|
| v59 | `hse_employee_master_v59_migration.sql` | 基础5张表 + 1视图 |
| v61 | `hse_employee_master_v61_extension.sql` | 扩展2张表（证件 + 一人一档） |

### 1.3 迁移原则
- **增量迁移**: 所有脚本使用 `CREATE TABLE IF NOT EXISTS`，可重复执行
- **向后兼容**: 不删除已有字段，不修改已有表结构
- **软删除**: 所有表使用 `is_deleted BOOLEAN DEFAULT FALSE`
- **审计字段**: 所有表含 `created_at` / `updated_at`

---

## 二、v59 基础迁移（5张表 + 1视图）

### 2.1 department - 组织模型（五级树形）

**说明**: 支持五级组织架构：集团→区域公司→企业→项目→班组

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键 |
| dept_code | VARCHAR(50) | NOT NULL UNIQUE | 部门编码（业务唯一） |
| name | VARCHAR(100) | NOT NULL | 部门名称 |
| short_name | VARCHAR(50) | - | 简称 |
| parent_id | BIGINT | REFERENCES department(id) | 父部门ID |
| level | SMALLINT | NOT NULL CHECK(1-5) | 层级：1=集团 2=区域 3=企业 4=项目 5=班组 |
| path | VARCHAR(500) | NOT NULL DEFAULT '/' | 层级路径，如 /1/5/12/ |
| township | VARCHAR(100) | - | 所属乡镇（环卫项目特有） |
| manager_id | BIGINT | - | 部门负责人 employee_id |
| safety_manager_id | BIGINT | - | 安全负责人 employee_id |
| headcount | INTEGER | NOT NULL DEFAULT 0 | 编制人数 |
| sort_order | INTEGER | NOT NULL DEFAULT 0 | 排序 |
| status | VARCHAR(20) | NOT NULL DEFAULT 'active' | 状态：active/inactive/merged/dissolved |
| description | TEXT | - | 描述 |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 更新时间 |
| is_deleted | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除标识 |

**索引**:
- `idx_department_parent` - parent_id
- `idx_department_level` - level
- `idx_department_path` - path
- `idx_department_township` - township

### 2.2 position - 岗位模型

**说明**: 岗位管理，支持特种作业、安全关键岗位标识

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键 |
| position_code | VARCHAR(50) | NOT NULL UNIQUE | 岗位编码 |
| name | VARCHAR(100) | NOT NULL | 岗位名称 |
| dept_id | BIGINT | REFERENCES department(id) | 所属部门ID |
| job_category | VARCHAR(50) | - | 工种分类：管理/技术/生产/辅助/特种 |
| is_special_post | BOOLEAN | NOT NULL DEFAULT FALSE | 是否特种作业岗位 |
| is_safety_critical | BOOLEAN | NOT NULL DEFAULT FALSE | 是否安全关键岗位 |
| safety_duties | TEXT | - | 安全职责描述 |
| sort_order | INTEGER | NOT NULL DEFAULT 0 | 排序 |
| status | VARCHAR(20) | NOT NULL DEFAULT 'active' | 状态 |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 更新时间 |
| is_deleted | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除标识 |

**索引**:
- `idx_position_dept` - dept_id

### 2.3 employee - 员工主表（唯一人员表）

**说明**: 唯一人员主表，所有业务通过 employee_id 关联

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键 |
| employee_code | VARCHAR(50) | - | 工号（业务唯一，可为空表示外部人员） |
| id_card | VARCHAR(128) | - | 身份证号（AES-256-GCM加密存储） |
| name | VARCHAR(100) | NOT NULL | 姓名 |
| gender | VARCHAR(10) | - | 性别：男/女 |
| birth_date | DATE | - | 出生日期 |
| phone | VARCHAR(64) | - | 手机号（AES-256-GCM加密存储） |
| person_category | VARCHAR(20) | - | 人员分类：适龄人员/超龄人员 |
| person_type | VARCHAR(20) | - | 人员类型：生产人员/管理人员/技术人员/辅助人员 |
| is_public_welfare | BOOLEAN | NOT NULL DEFAULT FALSE | 是否公益岗 |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 更新时间 |
| is_deleted | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除标识 |

**索引**:
- `uk_employee_code` - employee_code（部分唯一索引，仅未软删记录）
- `idx_employee_name` - name
- `idx_employee_type` - person_type
- `idx_employee_category` - person_category

> **注意**: 无 age 字段，年龄统一由 birth_date 通过视图或内联 SQL 计算

### 2.4 hse_employee_org - 人员组织关系

**说明**: 支持调岗流程，is_current 标识当前记录

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键 |
| employee_id | BIGINT | NOT NULL REFERENCES employee(id) | 员工ID |
| group_id | BIGINT | REFERENCES department(id) | 集团ID |
| region_id | BIGINT | REFERENCES department(id) | 区域ID |
| enterprise_id | BIGINT | REFERENCES department(id) | 企业ID |
| project_id | BIGINT | REFERENCES department(id) | 项目ID |
| team_id | BIGINT | REFERENCES department(id) | 班组ID |
| org_path | VARCHAR(500) | - | 组织路径快照：/集团名/区域名/企业名/项目名/班组名 |
| position_id | BIGINT | REFERENCES position(id) | 岗位ID |
| supervisor_id | BIGINT | REFERENCES employee(id) | 直接主管 employee_id |
| start_date | DATE | NOT NULL | 开始日期 |
| end_date | DATE | - | 结束日期（当前记录为NULL） |
| status | VARCHAR(20) | NOT NULL DEFAULT '在职' | 状态：在职/待岗/离职/退休/返聘 |
| is_current | BOOLEAN | NOT NULL DEFAULT TRUE | 是否当前记录 |
| change_reason | VARCHAR(200) | - | 变动原因 |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 更新时间 |
| is_deleted | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除标识 |

**索引**:
- `idx_emp_org_employee` - employee_id
- `idx_emp_org_current` - (employee_id, is_current)
- `idx_emp_org_team` - team_id
- `idx_emp_org_project` - project_id
- `idx_emp_org_enterprise` - enterprise_id
- `idx_emp_org_status` - status

### 2.5 employee_history - 人事变动记录

**说明**: 记录员工全生命周期事件，便于追溯

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键 |
| employee_id | BIGINT | NOT NULL REFERENCES employee(id) | 员工ID |
| event_type | VARCHAR(20) | NOT NULL | 事件类型：入职/调岗/待岗/复岗/离职/退休/返聘/状态变更 |
| event_date | DATE | NOT NULL | 事件日期 |
| before_dept_id | BIGINT | - | 变动前部门ID |
| before_position_id | BIGINT | - | 变动前岗位ID |
| before_status | VARCHAR(20) | - | 变动前状态 |
| after_dept_id | BIGINT | - | 变动后部门ID |
| after_position_id | BIGINT | - | 变动后岗位ID |
| after_status | VARCHAR(20) | - | 变动后状态 |
| approver_id | BIGINT | - | 审批人ID |
| approve_date | DATE | - | 审批日期 |
| approval_no | VARCHAR(100) | - | 审批单号 |
| remark | TEXT | - | 备注 |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 更新时间 |
| is_deleted | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除标识 |

**索引**:
- `idx_emp_history_employee` - employee_id
- `idx_emp_history_date` - event_date
- `idx_emp_history_type` - event_type

### 2.6 v_employee_with_age - 员工视图（含年龄计算）

**说明**: 通过 `EXTRACT(YEAR FROM age(birth_date))::INT` 计算年龄

包含字段：id, employee_code, id_card, name, gender, birth_date, phone, person_category, person_type, is_public_welfare, age, created_at, updated_at, is_deleted

---

## 三、v61 扩展迁移（2张表）

### 3.1 employee_certificate - 证件统一管理表

**说明**: 支持7种证件分类、5种状态、临期预警

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键 |
| employee_id | BIGINT | NOT NULL | 员工ID（关联employee.id） |
| cert_code | VARCHAR(64) | - | 证件业务编号（如CERT-2026-0001） |
| cert_name | VARCHAR(128) | NOT NULL | 证件名称 |
| cert_category | VARCHAR(32) | NOT NULL | 证件分类 |
| cert_type | VARCHAR(64) | - | 证件类型细项（如电工/焊工/叉车） |
| issuer | VARCHAR(128) | - | 发证机关 |
| issue_date | DATE | - | 发证日期 |
| start_date | DATE | - | 有效期开始日期 |
| expire_date | DATE | - | 有效期结束日期（NULL表示长期有效） |
| status | VARCHAR(20) | NOT NULL DEFAULT 'valid' | 状态 |
| cert_no | VARCHAR(64) | - | 证件号码 |
| verification_no | VARCHAR(128) | - | 查验编号 |
| is_special_operation | BOOLEAN | NOT NULL DEFAULT FALSE | 是否特种作业证件 |
| is_safety_critical | BOOLEAN | NOT NULL DEFAULT FALSE | 是否安全关键岗位必备 |
| attachment_ids | JSONB | - | 证件附件文件ID列表 |
| verification_status | VARCHAR(20) | - | 查验状态 |
| verification_date | DATE | - | 最近查验日期 |
| verification_remark | TEXT | - | 查验备注 |
| remark | TEXT | - | 备注 |
| created_by | BIGINT | - | 创建人ID |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 更新时间 |
| is_deleted | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除标识 |

**证件分类（7种）**:
- special_operation - 特种作业操作证
- safety_qualification - 安全资格证
- health - 健康证
- special_equipment - 特种设备作业证
- driver_license - 驾驶证
- professional - 职业资格证
- other - 其他

**证件状态（5种）**:
- valid - 有效
- expired - 已过期
- revoked - 已吊销
- pending_review - 待复审
- invalid - 无效

**索引**:
- `idx_emp_cert_employee` - employee_id
- `idx_emp_cert_category` - cert_category
- `idx_emp_cert_type` - cert_type
- `idx_emp_cert_status` - status
- `idx_emp_cert_expire` - expire_date
- `idx_emp_cert_special` - is_special_operation
- `idx_emp_cert_created_by` - created_by
- `uk_emp_cert_code` - cert_code（部分唯一索引）
- `uk_emp_cert_no_type` - (cert_no, cert_category)（部分唯一索引）

### 3.2 employee_safety_profile - 一人一档风险画像表

**说明**: 员工安全风险画像，风险等级由应用层规则计算

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键 |
| employee_id | BIGINT | NOT NULL | 员工ID |
| risk_level | VARCHAR(20) | NOT NULL DEFAULT 'unknown' | 风险等级 |
| risk_score | DECIMAL(5,2) | - | 风险评分 |
| risk_factors | JSONB | - | 风险因子明细 |
| accident_count | INTEGER | NOT NULL DEFAULT 0 | 事故次数 |
| accident_responsible_count | INTEGER | NOT NULL DEFAULT 0 | 责任事故次数 |
| violation_count | INTEGER | NOT NULL DEFAULT 0 | 违章次数 |
| serious_violation_count | INTEGER | NOT NULL DEFAULT 0 | 严重违章次数 |
| training_count | INTEGER | NOT NULL DEFAULT 0 | 培训次数 |
| training_hours | DECIMAL(8,2) | NOT NULL DEFAULT 0 | 培训时长（小时） |
| last_training_date | DATE | - | 最近培训日期 |
| hazard_involved_count | INTEGER | NOT NULL DEFAULT 0 | 参与隐患整改次数 |
| rectification_count | INTEGER | NOT NULL DEFAULT 0 | 整改次数 |
| rectification_overdue_count | INTEGER | NOT NULL DEFAULT 0 | 整改逾期次数 |
| last_accident_date | DATE | - | 最近事故日期 |
| last_violation_date | DATE | - | 最近违章日期 |
| last_assessment_date | DATE | - | 最近评估日期 |
| assessment_method | VARCHAR(32) | - | 评估方式 |
| safety_qualification | VARCHAR(20) | - | 安全资格状态 |
| special_operation_qualified | BOOLEAN | - | 特种作业资质状态 |
| health_status | VARCHAR(20) | - | 健康状态 |
| last_health_exam_date | DATE | - | 最近体检日期 |
| next_health_exam_date | DATE | - | 下次体检日期 |
| restricted_work_types | JSONB | - | 禁忌作业类型 |
| ai_risk_analysis | TEXT | - | AI风险分析（预留） |
| ai_suggestion | TEXT | - | AI建议（预留） |
| ai_analysis_date | TIMESTAMP | - | AI分析日期（预留） |
| ai_analysis_version | VARCHAR(32) | - | AI分析版本（预留） |
| remark | TEXT | - | 备注 |
| created_by | BIGINT | - | 创建人ID |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 更新时间 |
| is_deleted | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除标识 |

**风险等级（5级）**:
- low - 低风险（score < 15）
- medium - 中风险（15 ≤ score < 35）
- high - 高风险（35 ≤ score < 60）
- critical - 极高风险（score ≥ 60）
- unknown - 未知（无数据）

**风险评定规则**:
| 因子 | 分值 | 条件 |
|------|------|------|
| 责任事故 | +40 | ≥1次 |
| 严重违章 | +30 | ≥3次 |
| 一般违章 | +15 | ≥5次 |
| 培训不足 | +10 | 近一年培训<2次或<8学时 |
| 整改逾期 | +15 | ≥2次 |
| 证件过期 | +10 | 关键证件过期 |

**索引**:
- `uk_emp_safety_profile_employee` - employee_id（部分唯一索引）
- `idx_emp_safety_risk_level` - risk_level
- `idx_emp_safety_score` - risk_score
- `idx_emp_safety_created_by` - created_by

---

## 四、迁移验证

### 4.1 迁移执行

**v59 迁移**:
```sql
BEGIN;
-- 执行 v59 脚本
COMMIT;
```

**v61 迁移**:
```sql
BEGIN;
-- 执行 v61 脚本
COMMIT;
```

### 4.2 验证结果

| 表名 | 状态 | 说明 |
|------|------|------|
| department | ✅ 已创建 | 五级组织模型 |
| position | ✅ 已创建 | 岗位模型 |
| employee | ✅ 已创建 | 员工主表 |
| hse_employee_org | ✅ 已创建 | 人员组织关系 |
| employee_history | ✅ 已创建 | 人事变动历史 |
| employee_certificate | ✅ 已创建 | 证件管理（v61扩展） |
| employee_safety_profile | ✅ 已创建 | 一人一档（v61扩展） |
| v_employee_with_age | ✅ 已创建 | 员工年龄视图 |

### 4.3 索引验证

所有索引均使用 `CREATE INDEX IF NOT EXISTS`，可重复执行不报错。

---

## 五、数据关联关系

```
employee (主表)
├── hse_employee_org (1:N) - 人员组织关系
│   └── employee_history (1:N) - 人事变动记录
├── employee_certificate (1:N) - 证件
└── employee_safety_profile (1:1) - 一人一档

department (组织树)
└── position (1:N) - 岗位
```

**核心原则**: 所有业务关联均通过 `employee_id` 关联到 `employee` 表，确保人员标识统一。

---

## 六、向后兼容性

| 兼容性 | 状态 | 说明 |
|--------|------|------|
| 可重复执行 | ✅ 是 | 所有 CREATE 使用 IF NOT EXISTS |
| 不删除字段 | ✅ 是 | 迁移脚本仅新增，不删除 |
| 不修改结构 | ✅ 是 | 不修改已有表结构 |
| 数据不丢失 | ✅ 是 | 仅新增表和索引，不修改数据 |

---

**报告生成时间**: 2026-07-20
