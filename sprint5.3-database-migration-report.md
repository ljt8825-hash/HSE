# HSE Sprint5.3 数据库迁移报告

## 迁移概述
本报告记录了Sprint5.3扩展功能的数据库迁移情况，新增training_record（员工培训台账）、employee_induction_training（新员工入职培训）、employee_training_status（培训状态统计）三个核心表。

## 迁移脚本信息

| 项目 | 说明 |
|------|------|
| 脚本文件 | `server/sql/hse_employee_master_v63_extension.sql` |
| 版本号 | v63 |
| 迁移方式 | 增量迁移，可重复执行 |
| 事务处理 | BEGIN/COMMIT包裹，保证原子性 |

## 新增表结构

### 1. training_record（员工培训台账表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键ID |
| employee_id | BIGINT | NOT NULL | 员工ID |
| position_id | BIGINT | NULL | 岗位ID（培训时所在岗位） |
| training_requirement_id | BIGINT | NULL | 岗位培训要求ID |
| training_type | VARCHAR(64) | NOT NULL | 培训类型名称 |
| training_category | VARCHAR(32) | NOT NULL | 培训分类 |
| training_name | VARCHAR(128) | NOT NULL | 培训项目名称 |
| training_source | VARCHAR(32) | NOT NULL DEFAULT 'planned' | 培训来源 |
| training_provider | VARCHAR(128) | NULL | 培训机构 |
| trainer | VARCHAR(64) | NULL | 培训讲师 |
| training_location | VARCHAR(128) | NULL | 培训地点 |
| start_date | DATE | NOT NULL | 培训开始日期 |
| end_date | DATE | NULL | 培训结束日期 |
| actual_hours | DECIMAL(5,2) | NOT NULL DEFAULT 0 | 实际培训学时 |
| status | VARCHAR(20) | NOT NULL DEFAULT 'completed' | 培训状态 |
| assessment_result | VARCHAR(20) | NULL | 考核结果 |
| assessment_score | DECIMAL(5,2) | NULL | 考核成绩 |
| passing_score | INTEGER | NULL | 及格分数 |
| certificate_issued | BOOLEAN | NOT NULL DEFAULT FALSE | 是否颁发证书 |
| certificate_no | VARCHAR(64) | NULL | 证书编号 |
| certificate_valid_from | DATE | NULL | 证书生效日期 |
| certificate_valid_until | DATE | NULL | 证书失效日期 |
| cost | DECIMAL(10,2) | NULL | 培训费用 |
| remark | TEXT | NULL | 备注 |
| attachments | JSONB | NULL | 附件列表 |
| created_by | BIGINT | NULL | 创建人ID |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 更新时间 |
| is_deleted | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除标识 |

### 2. employee_induction_training（新员工入职培训表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键ID |
| employee_id | BIGINT | NOT NULL | 员工ID |
| position_id | BIGINT | NOT NULL | 入职岗位ID |
| induction_start_date | DATE | NOT NULL | 入职培训开始日期 |
| induction_end_date | DATE | NULL | 入职培训结束日期 |
| company_level_status | VARCHAR(20) | NOT NULL DEFAULT 'pending' | 公司级培训状态 |
| company_level_date | DATE | NULL | 公司级培训日期 |
| company_level_trainer | VARCHAR(64) | NULL | 公司级培训讲师 |
| company_level_hours | DECIMAL(5,2) | DEFAULT 0 | 公司级培训学时 |
| company_level_result | VARCHAR(20) | NULL | 公司级考核结果 |
| department_level_status | VARCHAR(20) | NOT NULL DEFAULT 'pending' | 部门级培训状态 |
| department_level_date | DATE | NULL | 部门级培训日期 |
| department_level_trainer | VARCHAR(64) | NULL | 部门级培训讲师 |
| department_level_hours | DECIMAL(5,2) | DEFAULT 0 | 部门级培训学时 |
| department_level_result | VARCHAR(20) | NULL | 部门级考核结果 |
| team_level_status | VARCHAR(20) | NOT NULL DEFAULT 'pending' | 班组级培训状态 |
| team_level_date | DATE | NULL | 班组级培训日期 |
| team_level_trainer | VARCHAR(64) | NULL | 班组级培训讲师 |
| team_level_hours | DECIMAL(5,2) | DEFAULT 0 | 班组级培训学时 |
| team_level_result | VARCHAR(20) | NULL | 班组级考核结果 |
| total_hours | DECIMAL(5,2) | DEFAULT 0 | 总学时 |
| overall_status | VARCHAR(20) | NOT NULL DEFAULT 'in_progress' | 整体状态 |
| overall_result | VARCHAR(20) | NULL | 整体考核结果 |
| qualified_date | DATE | NULL | 合格日期 |
| expiry_date | DATE | NULL | 过期日期 |
| remark | TEXT | NULL | 备注 |
| created_by | BIGINT | NULL | 创建人ID |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 更新时间 |
| is_deleted | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除标识 |

### 3. employee_training_status（培训状态统计表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键ID |
| employee_id | BIGINT | NOT NULL | 员工ID |
| position_id | BIGINT | NOT NULL | 岗位ID |
| total_requirements | INTEGER | NOT NULL DEFAULT 0 | 岗位培训要求总数 |
| completed_count | INTEGER | NOT NULL DEFAULT 0 | 已完成培训数 |
| pending_count | INTEGER | NOT NULL DEFAULT 0 | 待完成培训数 |
| expired_count | INTEGER | NOT NULL DEFAULT 0 | 过期培训数 |
| compliance_rate | DECIMAL(5,2) | DEFAULT 0 | 合规率（%） |
| compliance_status | VARCHAR(20) | NOT NULL DEFAULT 'unknown' | 合规状态 |
| last_training_date | DATE | NULL | 最近培训日期 |
| next_due_date | DATE | NULL | 下次到期日期 |
| pending_trainings | JSONB | NULL | 待完成培训清单 |
| expired_trainings | JSONB | NULL | 过期培训清单 |
| last_analyzed_at | TIMESTAMP | NULL | 最近分析时间 |
| analyzed_by | BIGINT | NULL | 分析执行人ID |
| remark | TEXT | NULL | 备注 |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 更新时间 |
| is_deleted | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除标识 |

## 索引创建

### training_record索引
| 索引名 | 类型 | 字段 |
|--------|------|------|
| idx_training_record_employee | NORMAL | employee_id |
| idx_training_record_position | NORMAL | position_id |
| idx_training_record_requirement | NORMAL | training_requirement_id |
| idx_training_record_type | NORMAL | training_type |
| idx_training_record_category | NORMAL | training_category |
| idx_training_record_status | NORMAL | status |
| idx_training_record_source | NORMAL | training_source |
| idx_training_record_start_date | NORMAL | start_date |
| idx_training_record_result | NORMAL | assessment_result |
| idx_training_record_certificate | NORMAL | certificate_issued |
| idx_training_record_created_by | NORMAL | created_by |

### employee_induction_training索引
| 索引名 | 类型 | 字段 |
|--------|------|------|
| uk_induction_employee_active | UNIQUE | employee_id (is_deleted=false) |
| idx_induction_position | NORMAL | position_id |
| idx_induction_overall_status | NORMAL | overall_status |
| idx_induction_result | NORMAL | overall_result |
| idx_induction_start_date | NORMAL | induction_start_date |
| idx_induction_expiry | NORMAL | expiry_date |

### employee_training_status索引
| 索引名 | 类型 | 字段 |
|--------|------|------|
| uk_training_status_employee_position | UNIQUE | employee_id, position_id (is_deleted=false) |
| idx_training_status_employee | NORMAL | employee_id |
| idx_training_status_position | NORMAL | position_id |
| idx_training_status_compliance_status | NORMAL | compliance_status |
| idx_training_status_compliance_rate | NORMAL | compliance_rate DESC |
| idx_training_status_next_due | NORMAL | next_due_date |
| idx_training_status_last_analyzed | NORMAL | last_analyzed_at |

## 枚举值约束

### 培训来源（training_source）
| 值 | 说明 |
|----|------|
| planned | 计划内培训 |
| temporary | 临时培训 |
| external | 外部培训 |
| onboarding | 入职培训 |
| self_study | 自主学习 |

### 培训状态（status）
| 值 | 说明 |
|----|------|
| scheduled | 已安排 |
| in_progress | 进行中 |
| completed | 已完成 |
| cancelled | 已取消 |
| failed | 未通过 |

### 考核结果（assessment_result）
| 值 | 说明 |
|----|------|
| passed | 合格 |
| failed | 不合格 |
| exempted | 免考 |
| pending | 待考核 |

### 三级安全教育状态（*_level_status）
| 值 | 说明 |
|----|------|
| pending | 待培训 |
| in_progress | 进行中 |
| completed | 已完成 |
| exempted | 免训 |

### 整体状态（overall_status）
| 值 | 说明 |
|----|------|
| in_progress | 进行中 |
| completed | 已完成 |
| expired | 已过期 |

### 合规状态（compliance_status）
| 值 | 说明 |
|----|------|
| compliant | 合规 |
| partial | 部分合规 |
| non_compliant | 不合规 |
| unknown | 未知 |

## 迁移执行

### 执行命令
```bash
cd f:\deploy\hse-dashboard\server
set PGPASSWORD=your_password
psql -h 127.0.0.1 -U hse_app -d safety_dashboard -f sql/hse_employee_master_v63_extension.sql
```

### 执行结果
- ✅ training_record表创建成功
- ✅ employee_induction_training表创建成功
- ✅ employee_training_status表创建成功
- ✅ 所有索引创建成功
- ✅ 可重复执行验证通过

## 兼容性说明

| 项目 | 说明 |
|------|------|
| 增量迁移 | 仅新增表和索引，不修改已有结构 |
| 可重入性 | 使用CREATE TABLE IF NOT EXISTS，支持重复执行 |
| 数据迁移 | 无需数据迁移，新表为空 |
| 回滚策略 | 如需回滚，DROP TABLE training_record, employee_induction_training, employee_training_status |

## 数据关系图

```
position_training_requirement（岗位培训要求 - 标准）
    │
    │  training_requirement_id
    ▼
training_record（员工培训台账 - 实际）
    │
    │  employee_id, position_id
    ▼
employee_training_status（培训状态统计 - 合规判定）
    │
    └─► compliance_status: compliant/partial/non_compliant/unknown

employee_induction_training（新员工入职培训）
    │
    └─► employee_id → employee.id
    └─► position_id → position.id
```

## 安全考量

| 考量点 | 说明 |
|--------|------|
| 软删除 | 所有表使用is_deleted字段，避免物理删除 |
| 审计字段 | created_by/created_at/updated_at完整记录 |
| 权限控制 | API层面通过requireRole中间件控制访问 |
| AI字段 | 无AI字段参与合规判定，分析结果完全基于规则计算 |