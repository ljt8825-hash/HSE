# HSE Sprint5.4 数据库迁移报告

## 迁移概述
本报告记录了Sprint5.4扩展功能的数据库迁移情况，新增inspection_plan（检查计划）、inspection_task（检查任务）、inspection_record（检查记录）、hazard_record（隐患记录）四个核心表。

## 迁移脚本信息

| 项目 | 说明 |
|------|------|
| 脚本文件 | `server/sql/hse_employee_master_v64_extension.sql` |
| 版本号 | v64 |
| 迁移方式 | 增量迁移，可重复执行 |
| 事务处理 | BEGIN/COMMIT包裹，保证原子性 |

## 新增表结构

### 1. inspection_plan（检查计划表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键ID |
| plan_name | VARCHAR(128) | NOT NULL | 计划名称 |
| plan_code | VARCHAR(64) | NOT NULL | 计划编号 |
| plan_type | VARCHAR(32) | NOT NULL DEFAULT 'routine' | 计划类型 |
| plan_category | VARCHAR(32) | NULL | 计划分类 |
| description | TEXT | NULL | 计划描述 |
| scope_description | TEXT | NULL | 检查范围描述 |
| inspection_items | JSONB | NULL | 检查项清单 |
| frequency | VARCHAR(32) | NOT NULL DEFAULT 'monthly' | 检查频率 |
| frequency_interval | INTEGER | DEFAULT 1 | 频率间隔 |
| start_date | DATE | NOT NULL | 开始日期 |
| end_date | DATE | NULL | 结束日期 |
| next_inspection_date | DATE | NULL | 下次检查日期 |
| responsible_id | BIGINT | NOT NULL | 责任人ID |
| assignee_ids | BIGINT[] | NULL | 执行人员ID列表 |
| department_id | BIGINT | NULL | 所属部门 |
| position_id | BIGINT | NULL | 适用岗位 |
| is_active | BOOLEAN | NOT NULL DEFAULT TRUE | 是否启用 |
| approval_required | BOOLEAN | NOT NULL DEFAULT FALSE | 是否需要审批 |
| approval_level | INTEGER | DEFAULT 1 | 审批级别 |
| ai_analysis_enabled | BOOLEAN | NOT NULL DEFAULT FALSE | 是否启用AI分析 |
| ai_last_analysis_date | TIMESTAMP | NULL | 上次AI分析日期 |
| ai_last_suggestion | TEXT | NULL | AI建议 |
| remark | TEXT | NULL | 备注 |
| created_by | BIGINT | NULL | 创建人ID |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 更新时间 |
| is_deleted | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除标识 |

### 2. inspection_task（检查任务表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键ID |
| plan_id | BIGINT | NOT NULL | 关联计划ID |
| task_name | VARCHAR(128) | NOT NULL | 任务名称 |
| task_code | VARCHAR(64) | NOT NULL | 任务编号 |
| assignee_id | BIGINT | NOT NULL | 执行人ID |
| inspectors | BIGINT[] | NULL | 检查人员ID列表 |
| scheduled_date | DATE | NOT NULL | 计划执行日期 |
| due_date | DATE | NULL | 截止日期 |
| status | VARCHAR(20) | NOT NULL DEFAULT 'pending' | 任务状态 |
| priority | VARCHAR(20) | NOT NULL DEFAULT 'normal' | 优先级 |
| progress | INTEGER | NOT NULL DEFAULT 0 | 进度 |
| inspection_items | JSONB | NULL | 检查项列表 |
| actual_start_time | TIMESTAMP | NULL | 实际开始时间 |
| actual_end_time | TIMESTAMP | NULL | 实际结束时间 |
| result_summary | TEXT | NULL | 结果摘要 |
| completed_items_count | INTEGER | DEFAULT 0 | 已完成检查项数 |
| total_items_count | INTEGER | DEFAULT 0 | 总检查项数 |
| hazards_found_count | INTEGER | DEFAULT 0 | 发现问题数 |
| supervisor_id | BIGINT | NULL | 监督人ID |
| approval_status | VARCHAR(20) | DEFAULT 'pending' | 审批状态 |
| approval_comment | TEXT | NULL | 审批意见 |
| approval_time | TIMESTAMP | NULL | 审批时间 |
| approved_by | BIGINT | NULL | 审批人ID |
| is_deleted | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除标识 |
| created_by | BIGINT | NULL | 创建人ID |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 更新时间 |

### 3. inspection_record（检查记录表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键ID |
| task_id | BIGINT | NOT NULL | 关联任务ID |
| plan_id | BIGINT | NULL | 关联计划ID |
| employee_id | BIGINT | NOT NULL | 检查人员ID |
| position_id | BIGINT | NULL | 检查人员岗位ID |
| inspection_time | TIMESTAMP | NOT NULL | 检查时间 |
| inspection_location | VARCHAR(128) | NULL | 检查地点 |
| item_name | VARCHAR(128) | NOT NULL | 检查项名称 |
| item_category | VARCHAR(64) | NULL | 检查项分类 |
| item_code | VARCHAR(64) | NULL | 检查项编号 |
| result | VARCHAR(20) | NOT NULL DEFAULT 'pass' | 检查结果 |
| comment | TEXT | NULL | 备注说明 |
| photos | JSONB | NULL | 现场照片列表 |
| attachments | JSONB | NULL | 附件列表 |
| ai_analysis | TEXT | NULL | AI分析结果 |
| ai_suggestion | TEXT | NULL | AI建议 |
| ai_confidence | DECIMAL(5,2) | NULL | AI置信度 |
| is_hazard_detected | BOOLEAN | NOT NULL DEFAULT FALSE | 是否发现隐患 |
| hazard_record_id | BIGINT | NULL | 关联隐患记录ID |
| is_deleted | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除标识 |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 更新时间 |

### 4. hazard_record（隐患记录表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键ID |
| hazard_code | VARCHAR(64) | NOT NULL | 隐患编号 |
| task_id | BIGINT | NOT NULL | 关联任务ID |
| record_id | BIGINT | NULL | 关联检查记录ID |
| employee_id | BIGINT | NOT NULL | 发现人ID |
| department_id | BIGINT | NULL | 所属部门 |
| position_id | BIGINT | NULL | 发现人岗位 |
| hazard_level | VARCHAR(20) | NOT NULL DEFAULT 'medium' | 隐患等级 |
| hazard_category | VARCHAR(32) | NOT NULL | 隐患分类 |
| hazard_type | VARCHAR(64) | NULL | 隐患类型 |
| description | TEXT | NOT NULL | 隐患描述 |
| location | VARCHAR(128) | NULL | 隐患位置 |
| photos | JSONB | NULL | 隐患照片 |
| evidence | JSONB | NULL | 证据材料 |
| root_cause | TEXT | NULL | 根本原因 |
| ai_root_cause_analysis | TEXT | NULL | AI根因分析 |
| ai_suggestion | TEXT | NULL | AI整改建议 |
| ai_confidence | DECIMAL(5,2) | NULL | AI置信度 |
| responsible_id | BIGINT | NOT NULL | 整改责任人ID |
| corrective_actions | JSONB | NULL | 整改措施 |
| deadline_date | DATE | NOT NULL | 整改期限 |
| actual_completion_date | DATE | NULL | 实际完成日期 |
| status | VARCHAR(20) | NOT NULL DEFAULT 'open' | 隐患状态 |
| review_status | VARCHAR(20) | DEFAULT 'pending' | 复查状态 |
| review_comment | TEXT | NULL | 复查意见 |
| reviewer_id | BIGINT | NULL | 复查人ID |
| review_date | DATE | NULL | 复查日期 |
| is_closed | BOOLEAN | NOT NULL DEFAULT FALSE | 是否已关闭 |
| is_deleted | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除标识 |
| created_by | BIGINT | NULL | 创建人ID |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 更新时间 |

## 索引创建

### inspection_plan索引
| 索引名 | 类型 | 字段 |
|--------|------|------|
| uk_inspection_plan_code | UNIQUE | plan_code |
| idx_inspection_plan_type | NORMAL | plan_type |
| idx_inspection_plan_category | NORMAL | plan_category |
| idx_inspection_plan_responsible | NORMAL | responsible_id |
| idx_inspection_plan_department | NORMAL | department_id |
| idx_inspection_plan_position | NORMAL | position_id |
| idx_inspection_plan_active | NORMAL | is_active |
| idx_inspection_plan_start_date | NORMAL | start_date |
| idx_inspection_plan_next_date | NORMAL | next_inspection_date |

### inspection_task索引
| 索引名 | 类型 | 字段 |
|--------|------|------|
| uk_inspection_task_code | UNIQUE | task_code |
| idx_inspection_task_plan | NORMAL | plan_id |
| idx_inspection_task_assignee | NORMAL | assignee_id |
| idx_inspection_task_status | NORMAL | status |
| idx_inspection_task_priority | NORMAL | priority |
| idx_inspection_task_scheduled_date | NORMAL | scheduled_date |
| idx_inspection_task_due_date | NORMAL | due_date |
| idx_inspection_task_supervisor | NORMAL | supervisor_id |
| idx_inspection_task_approval_status | NORMAL | approval_status |

### inspection_record索引
| 索引名 | 类型 | 字段 |
|--------|------|------|
| idx_inspection_record_task | NORMAL | task_id |
| idx_inspection_record_plan | NORMAL | plan_id |
| idx_inspection_record_employee | NORMAL | employee_id |
| idx_inspection_record_position | NORMAL | position_id |
| idx_inspection_record_time | NORMAL | inspection_time |
| idx_inspection_record_result | NORMAL | result |
| idx_inspection_record_hazard | NORMAL | is_hazard_detected |
| idx_inspection_record_hazard_id | NORMAL | hazard_record_id |

### hazard_record索引
| 索引名 | 类型 | 字段 |
|--------|------|------|
| uk_hazard_record_code | UNIQUE | hazard_code |
| idx_hazard_record_task | NORMAL | task_id |
| idx_hazard_record_record | NORMAL | record_id |
| idx_hazard_record_employee | NORMAL | employee_id |
| idx_hazard_record_department | NORMAL | department_id |
| idx_hazard_record_position | NORMAL | position_id |
| idx_hazard_record_level | NORMAL | hazard_level |
| idx_hazard_record_category | NORMAL | hazard_category |
| idx_hazard_record_responsible | NORMAL | responsible_id |
| idx_hazard_record_status | NORMAL | status |
| idx_hazard_record_review_status | NORMAL | review_status |
| idx_hazard_record_deadline | NORMAL | deadline_date |
| idx_hazard_record_closed | NORMAL | is_closed |

## 枚举值约束

### 计划类型（plan_type）
| 值 | 说明 |
|----|------|
| routine | 日常巡检 |
| periodic | 定期检查 |
| special | 专项检查 |
| audit | 内审 |
| external | 外审 |
| emergency | 应急检查 |

### 计划分类（plan_category）
| 值 | 说明 |
|----|------|
| safety | 安全检查 |
| health | 职业健康 |
| environment | 环保检查 |
| fire | 消防检查 |
| equipment | 设备检查 |
| quality | 质量检查 |

### 检查频率（frequency）
| 值 | 说明 |
|----|------|
| daily | 每日 |
| weekly | 每周 |
| monthly | 每月 |
| quarterly | 每季度 |
| yearly | 每年 |
| once | 一次性 |

### 任务状态（status）
| 值 | 说明 |
|----|------|
| pending | 待执行 |
| in_progress | 进行中 |
| completed | 已完成 |
| cancelled | 已取消 |
| overdue | 已逾期 |

### 优先级（priority）
| 值 | 说明 |
|----|------|
| low | 低 |
| normal | 正常 |
| high | 高 |
| urgent | 紧急 |

### 检查结果（result）
| 值 | 说明 |
|----|------|
| pass | 合格 |
| fail | 不合格 |
| pending | 待确认 |
| not_applicable | 不适用 |

### 隐患等级（hazard_level）
| 值 | 说明 |
|----|------|
| critical | 重大隐患 |
| high | 高风险 |
| medium | 中风险 |
| low | 低风险 |

### 隐患分类（hazard_category）
| 值 | 说明 |
|----|------|
| safety | 安全隐患 |
| health | 职业健康 |
| environment | 环保隐患 |
| fire | 消防隐患 |
| equipment | 设备隐患 |
| process | 工艺隐患 |
| behavior | 行为隐患 |

### 隐患状态（status）
| 值 | 说明 |
|----|------|
| open | 待整改 |
| in_progress | 整改中 |
| pending_review | 待复查 |
| closed | 已关闭 |
| rejected | 已驳回 |

## 迁移执行

### 执行命令
```bash
cd f:\deploy\hse-dashboard\server
set PGPASSWORD=your_password
psql -h 127.0.0.1 -U hse_app -d safety_dashboard -f sql/hse_employee_master_v64_extension.sql
```

### 执行结果
- ✅ inspection_plan表创建成功
- ✅ inspection_task表创建成功
- ✅ inspection_record表创建成功
- ✅ hazard_record表创建成功
- ✅ 所有索引创建成功
- ✅ 可重复执行验证通过

## 兼容性说明

| 项目 | 说明 |
|------|------|
| 增量迁移 | 仅新增表和索引，不修改已有结构 |
| 可重入性 | 使用CREATE TABLE IF NOT EXISTS，支持重复执行 |
| 数据迁移 | 无需数据迁移，新表为空 |
| 回滚策略 | 如需回滚，DROP TABLE inspection_plan, inspection_task, inspection_record, hazard_record |

## 数据关系图

```
inspection_plan（检查计划）
    │
    │  plan_id
    ▼
inspection_task（检查任务）
    │
    │  task_id
    ▼
inspection_record（检查记录）
    │
    │  is_hazard_detected = true
    ▼
hazard_record（隐患记录）
    │
    └─► employee_id → employee.id（发现人）
    └─► responsible_id → employee.id（整改责任人）
    └─► reviewer_id → employee.id（复查人）
```

## 安全考量

| 考量点 | 说明 |
|--------|------|
| 软删除 | 所有表使用is_deleted字段，避免物理删除 |
| 审计字段 | created_by/created_at/updated_at完整记录 |
| 权限控制 | API层面通过requireRole中间件控制访问 |
| AI字段 | 无AI字段参与状态判定，分析结果仅作参考 |
| 人员关联 | 所有人员关联均使用employee_id，禁止姓名关联 |
