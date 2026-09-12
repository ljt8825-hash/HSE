# HSE Sprint5.2 数据库迁移报告

## 迁移概述
本报告记录了Sprint5.2扩展功能的数据库迁移情况，新增position_safety_profile（岗位安全画像）和position_training_requirement（岗位培训要求）两个核心表。

## 迁移脚本信息

| 项目 | 说明 |
|------|------|
| 脚本文件 | `server/sql/hse_employee_master_v62_extension.sql` |
| 版本号 | v62 |
| 迁移方式 | 增量迁移，可重复执行 |
| 事务处理 | BEGIN/COMMIT包裹，保证原子性 |

## 新增表结构

### 1. position_safety_profile（岗位安全画像表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键ID |
| position_id | BIGINT | NOT NULL | 岗位ID |
| risk_level | VARCHAR(20) | NOT NULL DEFAULT 'unknown' | 风险等级 |
| risk_score | DECIMAL(5,2) | NULL | 风险评分(0-100) |
| risk_factors | JSONB | NULL | 风险因素 |
| required_cert_categories | TEXT[] | NULL | 必备证件分类 |
| required_special_operation | BOOLEAN | NOT NULL DEFAULT FALSE | 是否要求特种作业资质 |
| required_safety_critical | BOOLEAN | NOT NULL DEFAULT FALSE | 是否安全关键岗位 |
| safety_hazards | JSONB | NULL | 安全危害因素 |
| safety_procedures | TEXT | NULL | 安全操作规程 |
| emergency_response | TEXT | NULL | 应急响应方案 |
| ppe_requirements | JSONB | NULL | PPE要求 |
| work_permit_required | BOOLEAN | NOT NULL DEFAULT FALSE | 是否需要作业许可 |
| inspection_frequency | VARCHAR(32) | NULL | 巡检频率 |
| last_risk_assessment_date | DATE | NULL | 上次风险评估日期 |
| assessment_method | VARCHAR(32) | NULL | 评估方式 |
| ai_risk_analysis | TEXT | NULL | AI风险分析（仅参考） |
| ai_suggestion | TEXT | NULL | AI建议（仅参考） |
| ai_analysis_date | TIMESTAMP | NULL | AI分析日期 |
| ai_analysis_version | VARCHAR(32) | NULL | AI分析版本 |
| remark | TEXT | NULL | 备注 |
| created_by | BIGINT | NULL | 创建人ID |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 更新时间 |
| is_deleted | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除标识 |

### 2. position_training_requirement（岗位培训要求表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键ID |
| position_id | BIGINT | NOT NULL | 岗位ID |
| training_type | VARCHAR(64) | NOT NULL | 培训类型名称 |
| training_category | VARCHAR(32) | NOT NULL | 培训分类 |
| required_hours | DECIMAL(5,2) | NOT NULL DEFAULT 0 | 学时要求 |
| frequency | VARCHAR(32) | NULL | 培训频率 |
| assessment_required | BOOLEAN | NOT NULL DEFAULT TRUE | 是否需要考核 |
| retraining_interval_months | INTEGER | NULL | 复训间隔（月） |
| is_mandatory | BOOLEAN | NOT NULL DEFAULT TRUE | 是否强制 |
| description | TEXT | NULL | 培训描述 |
| materials | TEXT | NULL | 培训材料 |
| responsible_role | VARCHAR(64) | NULL | 负责角色 |
| remark | TEXT | NULL | 备注 |
| created_by | BIGINT | NULL | 创建人ID |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 更新时间 |
| is_deleted | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除标识 |

## 索引创建

### position_safety_profile索引
| 索引名 | 类型 | 字段 | 条件 |
|--------|------|------|------|
| uk_pos_safety_profile_position | UNIQUE | position_id | is_deleted = false |
| idx_pos_safety_risk_level | NORMAL | risk_level | - |
| idx_pos_safety_position | NORMAL | position_id | - |

### position_training_requirement索引
| 索引名 | 类型 | 字段 | 条件 |
|--------|------|------|------|
| uk_pos_training_position_type | UNIQUE | position_id, training_type | is_deleted = false |
| idx_pos_training_category | NORMAL | training_category | - |
| idx_pos_training_position | NORMAL | position_id | - |

## 枚举值约束

### VALID_POSITION_RISK_LEVELS
- low（低风险）
- medium（中风险）
- high（高风险）
- critical（重大风险）
- unknown（未知）

### VALID_POSITION_ASSESSMENT_METHODS
- manual（人工评估）
- auto（自动评估）
- ai_assisted（AI辅助评估）

### VALID_INSPECTION_FREQUENCIES
- daily（每日）
- weekly（每周）
- monthly（每月）
- quarterly（每季度）
- yearly（每年）

### VALID_TRAINING_CATEGORIES
- safety（安全培训）
- skill（技能培训）
- special_operation（特种作业培训）
- emergency（应急培训）
- first_aid（急救培训）
- induction（入职培训）

### VALID_TRAINING_FREQUENCIES
- daily（每日）
- weekly（每周）
- monthly（每月）
- quarterly（每季度）
- yearly（每年）
- once（一次性）

## 迁移执行

### 执行命令
```bash
cd f:\deploy\hse-dashboard\server
set PGPASSWORD=your_password
psql -h localhost -U hse_user -d hse_dashboard -f sql/hse_employee_master_v62_extension.sql
```

### 执行结果
- ✅ position_safety_profile表创建成功
- ✅ position_training_requirement表创建成功
- ✅ 所有索引创建成功
- ✅ 可重复执行验证通过

## 兼容性说明

| 项目 | 说明 |
|------|------|
| 增量迁移 | 仅新增表和索引，不修改已有结构 |
| 可重入性 | 使用CREATE TABLE IF NOT EXISTS，支持重复执行 |
| 数据迁移 | 无需数据迁移，新表为空 |
| 回滚策略 | 如需回滚，DROP TABLE position_safety_profile, position_training_requirement |

## 数据关系图

```
position (岗位表)
    │
    ├── position_safety_profile (岗位安全画像)  [1:1]
    │       ├── position_id → position.id
    │       └── risk_level, risk_score, ...
    │
    └── position_training_requirement (岗位培训要求)  [1:N]
            ├── position_id → position.id
            └── training_type, training_category, ...
```

## 安全考量

| 考量点 | 说明 |
|--------|------|
| 软删除 | 所有表使用is_deleted字段，避免物理删除 |
| 审计字段 | created_by/created_at/updated_at完整记录 |
| 权限控制 | API层面通过requireRole中间件控制访问 |
| AI字段 | ai_risk_analysis/ai_suggestion仅作参考，不参与风险等级判定 |