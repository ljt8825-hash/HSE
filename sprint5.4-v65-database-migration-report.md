# HSE Sprint5.4 数据库迁移报告（确认版）

## 迁移概述
本报告记录了Sprint5.4 v65扩展功能的数据库迁移情况，包括检查模板表和隐患来源追踪字段。

## 迁移脚本信息

| 项目 | 说明 |
|------|------|
| 基础脚本 | `hse_employee_master_v64_extension.sql` |
| 扩展脚本 | `hse_employee_master_v65_extension.sql` |
| 版本号 | v64 → v65 |
| 迁移方式 | 增量迁移，可重复执行 |

## v65 新增内容

### 一、hazard_record 表扩展

新增字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| source_type | VARCHAR(32) | 来源类型：inspection/report/audit/external/other |
| source_id | BIGINT | 来源记录ID |
| confirmed_by | BIGINT | 确认人ID（关联employee.id） |
| confirmed_at | TIMESTAMP | 确认时间 |

新增索引：
- `idx_hazard_record_source_type` - 按来源类型查询
- `idx_hazard_record_source_id` - 按来源ID查询
- `idx_hazard_record_confirmed_by` - 按确认人查询

### 二、inspection_plan 表扩展

新增字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| template_id | BIGINT | 关联检查清单模板ID |

### 三、inspection_checklist_template（检查清单模板表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 主键 |
| template_name | VARCHAR(128) | 模板名称 |
| template_code | VARCHAR(64) | 模板编号（唯一） |
| template_category | VARCHAR(32) | 模板分类 |
| description | TEXT | 模板描述 |
| version | VARCHAR(16) | 模板版本 |
| is_active | BOOLEAN | 是否启用 |
| applicable_scope | TEXT | 适用范围 |
| remark | TEXT | 备注 |
| created_by | BIGINT | 创建人ID |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |
| is_deleted | BOOLEAN | 软删除标识 |

### 四、inspection_checklist_item（检查项模板表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 主键 |
| template_id | BIGINT | 关联模板ID |
| item_code | VARCHAR(64) | 检查项编号 |
| item_name | VARCHAR(128) | 检查项名称 |
| item_category | VARCHAR(64) | 检查项分类 |
| description | TEXT | 检查项描述 |
| standard_requirement | TEXT | 标准要求 |
| inspection_method | TEXT | 检查方法 |
| sort_order | INTEGER | 排序序号 |
| is_required | BOOLEAN | 是否必检 |
| remark | TEXT | 备注 |
| created_by | BIGINT | 创建人ID |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |
| is_deleted | BOOLEAN | 软删除标识 |

## 执行结果

- ✅ hazard_record 表新增4个字段
- ✅ inspection_plan 表新增1个字段
- ✅ inspection_checklist_template 表创建成功
- ✅ inspection_checklist_item 表创建成功
- ✅ 所有索引创建成功

## 来源类型枚举

| 值 | 说明 | source_id关联 |
|----|------|----------------|
| inspection | 检查发现 | inspection_record.id |
| report | 主动上报 | hazard_report.id |
| audit | 审核发现 | audit_record.id |
| external | 外部来源 | 外部系统记录ID |
| other | 其他来源 | null |

## 数据关系图

```
inspection_checklist_template（检查清单模板）
    │
    │  template_id
    ▼
inspection_checklist_item（检查项模板）
    │
    │  引用模板
    ▼
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
    │  source_type = 'inspection'
    │  source_id → inspection_record.id
    ▼
hazard_record（隐患记录）
    │
    └─► confirmed_by → employee.id（确认人）
```