# HSE安全生产管理系统 数据库架构分析报告

## 分析日期
2026-07-20

## 数据库版本
PostgreSQL（通过 `CREATE EXTENSION IF NOT EXISTS pgcrypto` 确认）

---

## 一、数据表清单

### 1.1 核心业务表（按模块分类）

#### 人员模块
| 表名 | 用途 | 状态 |
|------|------|------|
| `department` | 组织模型（五级树形） | ✅ 主表 |
| `position` | 岗位模型 | ✅ 主表 |
| `employee` | 员工主表（唯一） | ✅ 主表 |
| `hse_employee_org` | 人员组织关系 | ✅ 主表 |
| `employee_history` | 人事变动记录 | ✅ 主表 |
| `personnel` | 人员表（旧） | ⚠️ 待清理 |
| `over_age_personnel` | 超龄人员管控 | ⚠️ 需重构 |

#### 标准化评价模块
| 表名 | 用途 | 状态 |
|------|------|------|
| `safety_standard_clauses` | 标准条款主表 | ✅ |
| `standard_evaluation_tasks` | 评价任务表 | ✅ |
| `standard_evaluation_items` | 评价明细表 | ✅ |
| `document_standard_relation` | 文档条款关联 | ✅ |

#### 隐患闭环模块
| 表名 | 用途 | 状态 |
|------|------|------|
| `hazard_record` | 隐患记录（新） | ✅ |
| `rectification_task` | 整改任务 | ✅ |
| `rectification_action` | 整改措施 | ✅ |
| `review_record` | 复查记录 | ✅ |
| `hazards` | 隐患排查（旧） | ⚠️ 待清理 |
| `hse_rectifications` | 整改记录（旧） | ⚠️ 待清理 |
| `hse_reviews` | 复查记录（旧） | ⚠️ 待清理 |

#### 培训模块
| 表名 | 用途 | 状态 |
|------|------|------|
| `training_records` | 培训记录 | ✅ |
| `training_roster` | 培训花名册 | ⚠️ 需重构 |

#### 保险模块
| 表名 | 用途 | 状态 |
|------|------|------|
| `personnel_insurance` | 人员保险 | ✅ |
| `vehicles` | 车辆信息 | ✅ |
| `insurance_history` | 车辆保险历史 | ✅ |

#### 事件与闭环模块
| 表名 | 用途 | 状态 |
|------|------|------|
| `hse_events` | 统一安全事件 | ✅ |
| `hse_event_links` | 事件关联 | ✅ |
| `hse_event_timeline` | 事件时间线 | ✅ |
| `hse_risk_factors` | 危险因素 | ✅ |
| `hse_control_measures` | 控制措施 | ✅ |
| `hse_inspection_plans` | 检查计划 | ✅ |
| `hse_risk_objects` | 风险对象 | ✅ |

#### 报告模块
| 表名 | 用途 | 状态 |
|------|------|------|
| `hse_reports` | 报告表 | ✅ |
| `hse_report_templates` | 报告模板 | ✅ |

#### 批量导入模块
| 表名 | 用途 | 状态 |
|------|------|------|
| `hse_batch_import_tasks` | 批量导入任务 | ✅ |
| `hse_batch_import_items` | 批量导入明细 | ✅ |

#### 文档与AI模块
| 表名 | 用途 | 状态 |
|------|------|------|
| `document_files` | 文档文件 | ✅ |
| `document_ai_analysis` | AI分析记录 | ✅ |

#### 系统管理表
| 表名 | 用途 | 状态 |
|------|------|------|
| `sys_operation_log` | 操作日志 | ✅ |
| `notifications` | 通知表 | ✅ |
| `import_logs` | 导入日志 | ✅ |
| `field_mapping_config` | 字段映射配置 | ✅ |
| `file_records` | 文件记录 | ✅ |

---

## 二、字段统计

### 2.1 主要表字段数

| 表 | 字段数 | 备注 |
|----|--------|------|
| `employee` | 13 | 含加密字段 id_card, phone |
| `hse_employee_org` | 19 | 含五级组织引用 |
| `standard_evaluation_items` | 22 | 含AI相关字段 |
| `hse_reports` | 20 | 含报告状态字段 |
| `hazard_record` | 15 | 新隐患表 |
| `hazards` | 18 | 旧隐患表 |
| `training_records` | 16 | 含人员冗余字段 |

### 2.2 字段类型分布

| 类型 | 数量 | 说明 |
|------|------|------|
| BIGSERIAL | 46 | 主键 |
| VARCHAR | ~200 | 文本字段 |
| TIMESTAMP/TIMESTAMPTZ | ~60 | 时间字段 |
| INTEGER | ~40 | 数值字段 |
| BOOLEAN | ~30 | 布尔字段 |
| JSONB | ~15 | JSON字段 |
| DECIMAL | ~10 | 金额/评分字段 |
| DATE | ~15 | 日期字段 |

---

## 三、索引分析

### 3.1 索引统计

| 表 | 索引数 | 唯一索引 | 普通索引 | 状态 |
|----|--------|----------|----------|------|
| `employee` | 4 | 1 | 3 | ✅ |
| `hse_employee_org` | 6 | 0 | 6 | ✅ |
| `department` | 4 | 1 | 3 | ✅ |
| `position` | 2 | 1 | 1 | ✅ |
| `safety_standard_clauses` | 4 | 1 | 3 | ✅ |
| `standard_evaluation_items` | 6 | 1 | 5 | ✅ |
| `hse_batch_import_tasks` | 8 | 1 | 7 | ✅ |
| `hse_events` | 9 | 1 | 8 | ✅ |
| `hazard_record` | 0 | 0 | 0 | ❌ 需优化 |
| `personnel` | 9 | 1 | 8 | ⚠️ 旧表 |

### 3.2 缺失索引分析

| 表 | 建议索引 | 原因 |
|----|----------|------|
| `hazard_record` | `idx_hazard_record_status` | 按状态查询隐患 |
| `hazard_record` | `idx_hazard_record_deadline` | 按截止日期查询 |
| `hazard_record` | `idx_hazard_record_enterprise` | 按企业查询 |
| `training_records` | `idx_training_records_employee` | 按人员查询 |
| `personnel_insurance` | `idx_pi_expire_employee` | 按到期日期+人员查询 |

---

## 四、外键分析

### 4.1 外键完整性

| 表 | 外键数 | 完整性 | 问题 |
|----|--------|--------|------|
| `hse_employee_org` | 6 | ✅ | 完整 |
| `standard_evaluation_items` | 2 | ✅ | 完整 |
| `hse_rectifications` | 2 | ⚠️ | 缺少与隐患的外键 |
| `hse_reviews` | 2 | ⚠️ | 缺少与整改的外键 |
| `hazard_record` | 0 | ❌ | 无外键约束 |
| `rectification_task` | 1 | ⚠️ | 缺少与复查的外键 |

### 4.2 外键缺失影响

| 缺失外键 | 影响 |
|----------|------|
| `hazard_record.employee_id` | 无法关联员工表 |
| `hazard_record.department_id` | 无法关联部门表 |
| `rectification_task.hazard_id` → `hazard_record.id` | 整改与隐患无法关联 |
| `review_record.rectification_id` → `rectification_task.id` | 复查与整改无法关联 |

---

## 五、唯一约束

### 5.1 当前唯一约束

| 表 | 唯一约束字段 | 状态 |
|----|-------------|------|
| `employee` | `employee_code`（部分唯一） | ✅ |
| `department` | `dept_code` | ✅ |
| `position` | `position_code` | ✅ |
| `safety_standard_clauses` | `code` | ✅ |
| `hse_batch_import_tasks` | `task_no` | ✅ |
| `vehicles` | `plate` | ✅ |
| `personnel` | `id_card`（旧表） | ⚠️ |

### 5.2 建议新增唯一约束

| 表 | 字段 | 原因 |
|----|------|------|
| `employee` | `id_card_hash` | 身份证号唯一 |
| `hazard_record` | `hazard_code` | 隐患编号唯一 |
| `training_records` | `personnel_id, training_date, training_type` | 同一人同一天同一类型培训唯一 |

---

## 六、软删除设计

### 6.1 软删除字段

| 表 | 软删除字段 | 类型 | 状态 |
|----|-----------|------|------|
| `employee` | `is_deleted` | BOOLEAN | ✅ |
| `department` | `is_deleted` | BOOLEAN | ✅ |
| `position` | `is_deleted` | BOOLEAN | ✅ |
| `hse_employee_org` | `is_deleted` | BOOLEAN | ✅ |
| `safety_standard_clauses` | `is_deleted` | BOOLEAN | ✅ |
| `standard_evaluation_tasks` | `is_deleted` | BOOLEAN | ✅ |
| `hse_batch_import_tasks` | `is_deleted` | BOOLEAN | ✅ |
| `hse_reports` | `report_status` | VARCHAR | ✅ |
| `hazard_record` | `is_deleted` | BOOLEAN | ✅ |
| `hazards` | `is_deleted` | BOOLEAN | ⚠️ 旧表 |

### 6.2 软删除一致性

**符合规范的表：**
- ✅ `employee`, `department`, `position`, `hse_employee_org`
- ✅ `safety_standard_clauses`, `standard_evaluation_tasks`
- ✅ `hse_batch_import_tasks`, `hse_batch_import_items`

**待改进的表：**
- ⚠️ `hazard_record` 查询需确认包含 `is_deleted = false`
- ⚠️ `training_records` 查询需确认包含 `is_deleted = false`

---

## 七、数据冗余问题

### 7.1 人员数据冗余

| 冗余字段 | 涉及表 | 问题描述 |
|----------|--------|----------|
| `name` | `personnel`, `employee`, `over_age_personnel`, `training_records` | 姓名重复存储 |
| `id_card` | `personnel`, `employee`, `over_age_personnel` | 身份证号重复存储 |
| `dept` | `personnel`, `training_records`, `over_age_personnel`, `hazards` | 部门名称重复存储 |
| `position` | `personnel`, `training_records`, `over_age_personnel` | 岗位名称重复存储 |

### 7.2 附件表冗余

| 表 | 问题描述 |
|----|----------|
| `hazard_attachments` | 独立附件表 |
| `training_attachments` | 独立附件表 |
| `insurance_attachments` | 独立附件表 |
| `hazard_versions` | 独立版本表 |
| `training_versions` | 独立版本表 |
| `insurance_versions` | 独立版本表 |

**建议：** 创建统一的 `attachments` 和 `versions` 表，通过 `biz_type` + `biz_id` 关联

---

## 八、数据链路分析

### 8.1 完整链路

```
employee → hse_employee_org → department/position
     ↓
training_records
     ↓
hse_inspection_plans
     ↓
hazard_record → rectification_task → review_record
     ↓
hse_events ← hse_event_links ← hse_event_timeline
     ↓
hse_risk_factors → hse_control_measures
     ↓
hse_risk_objects
```

### 8.2 断链问题

| 断链点 | 影响 |
|--------|------|
| `position` → `risk_sources` | 岗位与风险源无关联 |
| `hse_inspection_plans` → `hazard_record` | 检查计划与隐患无关联 |
| `training_records` → `employee` | 使用 `personnel_id` 而非 `employee_id` |

---

## 九、优化建议

### 9.1 数据模型优化

1. **人员表合并**：将 `personnel` 数据迁移至 `employee`，逐步废弃旧表
2. **附件表统一**：创建统一的 `attachments` 表替代各模块独立附件表
3. **字段标准化**：所有关联使用 `employee_id`，移除冗余姓名字段

### 9.2 索引优化

1. **隐患表索引**：为 `hazard_record` 添加状态、截止日期、企业ID索引
2. **培训表索引**：为 `training_records` 添加人员ID索引
3. **保险表索引**：为 `personnel_insurance` 添加到期日期+人员ID复合索引

### 9.3 外键优化

1. **隐患表外键**：添加 `employee_id`、`department_id` 外键
2. **整改表外键**：添加 `hazard_id` 外键关联 `hazard_record`
3. **复查表外键**：添加 `rectification_id` 外键关联 `rectification_task`

### 9.4 查询优化

1. **创建视图**：创建常用查询视图简化复杂查询
2. **添加分页**：所有列表查询强制分页
3. **缓存策略**：对静态数据（部门、岗位、标准条款）添加缓存

---

## 十、数据库健康度评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 数据完整性 | 65/100 | 新旧表并存，字段冗余 |
| 索引完整性 | 75/100 | 部分表缺少索引 |
| 外键完整性 | 60/100 | 多个表缺少外键约束 |
| 软删除一致性 | 85/100 | 大部分表符合规范 |
| 性能优化 | 70/100 | 查询性能有待提升 |

**综合评分：** 71/100

---

**分析日期：** 2026-07-20