# HSE Sprint5.4 设计文档（确认版） - HSE检查管理中心

**版本**: v1.1-confirm  
**日期**: 2026-07-20  
**状态**: ✅ 设计冻结

---

## 一、概述

### 1.1 目标

Sprint5.4 聚焦于**HSE检查管理中心**，新增四个核心表和两个模板表：

| 序号 | 模型 | 表名 | 说明 |
|------|------|------|------|
| 1 | 检查计划 | `inspection_plan` | 定期检查计划管理 |
| 2 | 检查任务 | `inspection_task` | 检查任务分配与执行 |
| 3 | 检查记录 | `inspection_record` | 检查执行记录 |
| 4 | 问题/隐患记录 | `hazard_record` | 检查发现的问题/隐患记录 |
| 5 | 检查清单模板 | `inspection_checklist_template` | 检查清单模板 |
| 6 | 检查项模板 | `inspection_checklist_item` | 检查项模板 |

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
│                                           人工确认问题          │
│                                                   │             │
│                                                   ▼             │
│                                           hazard_record         │
│                                           （隐患记录）          │
│                                           source_type/source_id │
│                                           来源追踪              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 技术约束

| 约束项 | 说明 |
|--------|------|
| 禁止新增人员表 | `employee` 为唯一人员主表 |
| **禁止姓名关联** | **所有人员关联必须使用employee_id，禁止使用姓名字段建立关系** |
| 禁止修改 Vben 核心目录 | 不碰 `packages/@core/`、`packages/effects/`、`packages/themes/` |
| 禁止修改 auth/JWT | 不修改认证相关代码 |
| 禁止新增 npm 依赖 | 复用已有依赖 |
| 禁止创建公共组件 | 不创建可复用的UI组件 |
| AI 字段仅辅助分析 | AI 不参与安全结论自动生成 |

---

## 二、隐患来源追踪

### 2.1 设计目标

隐患记录需要追踪来源，增加以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| source_type | VARCHAR(32) | 来源类型 |
| source_id | BIGINT | 来源记录ID |

### 2.2 来源类型枚举

**source_type 枚举值**：
| 值 | 说明 | source_id关联 |
|----|------|----------------|
| inspection | 检查发现 | inspection_record.id |
| report | 主动上报 | hazard_report.id（如有） |
| audit | 审核发现 | audit_record.id（如有） |
| external | 外部来源 | 外部系统记录ID |
| other | 其他来源 | null |

---

## 三、检查模板

### 3.1 检查清单模板（inspection_checklist_template）

```sql
CREATE TABLE inspection_checklist_template (
    id                      BIGSERIAL PRIMARY KEY,
    template_name           VARCHAR(128) NOT NULL,
    template_code           VARCHAR(64) NOT NULL UNIQUE,
    template_category       VARCHAR(32),
    description             TEXT,
    version                 VARCHAR(16) NOT NULL DEFAULT '1.0',
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    applicable_scope        TEXT,
    created_by              BIGINT,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    is_deleted              BOOLEAN NOT NULL DEFAULT FALSE
);
```

### 3.2 检查项模板（inspection_checklist_item）

```sql
CREATE TABLE inspection_checklist_item (
    id                      BIGSERIAL PRIMARY KEY,
    template_id             BIGINT NOT NULL,
    item_code               VARCHAR(64),
    item_name               VARCHAR(128) NOT NULL,
    item_category           VARCHAR(64),
    description             TEXT,
    standard_requirement    TEXT,
    inspection_method       TEXT,
    sort_order              INTEGER DEFAULT 0,
    is_required             BOOLEAN NOT NULL DEFAULT TRUE,
    created_by              BIGINT,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    is_deleted              BOOLEAN NOT NULL DEFAULT FALSE
);
```

### 3.3 模板使用流程

1. 创建检查清单模板
2. 添加检查项到模板
3. 创建检查计划时引用模板
4. 生成检查任务时复制检查项到任务

---

## 四、核心表结构变更

### 4.1 hazard_record 表变更

新增字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| source_type | VARCHAR(32) | 来源类型：inspection/report/audit/external/other |
| source_id | BIGINT | 来源记录ID |
| confirmed_by | BIGINT | 确认人ID（关联employee.id） |
| confirmed_at | TIMESTAMP | 确认时间 |

### 4.2 inspection_plan 表变更

新增字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| template_id | BIGINT | 关联检查清单模板ID |

---

## 五、API 端点清单

### 检查清单模板（6个端点）
| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/checklist-templates` | 分页查询模板 |
| GET | `/checklist-templates/:id` | 模板详情（含检查项） |
| POST | `/checklist-templates` | 新增模板 |
| PUT | `/checklist-templates/:id` | 更新模板 |
| DELETE | `/checklist-templates/:id` | 删除模板 |
| POST | `/checklist-templates/:id/apply` | 应用模板到计划 |

### 检查项模板（5个端点）
| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/checklist-items/template/:templateId` | 查询模板检查项 |
| POST | `/checklist-items` | 新增检查项 |
| PUT | `/checklist-items/:id` | 更新检查项 |
| DELETE | `/checklist-items/:id` | 删除检查项 |
| POST | `/checklist-items/batch-create` | 批量新增检查项 |

### 检查计划（8个端点）
| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/inspection-plans` | 分页查询 |
| GET | `/inspection-plans/stats` | 统计 |
| GET | `/inspection-plans/:id` | 详情 |
| POST | `/inspection-plans` | 新增 |
| PUT | `/inspection-plans/:id` | 更新 |
| DELETE | `/inspection-plans/:id` | 删除 |
| POST | `/inspection-plans/:id/generate-tasks` | 生成任务 |
| POST | `/inspection-plans/batch-generate` | 批量生成 |

### 检查任务（10个端点）
| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/inspection-tasks` | 分页查询 |
| GET | `/inspection-tasks/stats` | 统计 |
| GET | `/inspection-tasks/:id` | 详情 |
| GET | `/inspection-tasks/assignee/:employeeId` | 查询员工待执行任务 |
| POST | `/inspection-tasks` | 新增 |
| PUT | `/inspection-tasks/:id` | 更新 |
| PUT | `/inspection-tasks/:id/start` | 开始执行 |
| PUT | `/inspection-tasks/:id/complete` | 完成 |
| PUT | `/inspection-tasks/:id/approve` | 审批 |
| DELETE | `/inspection-tasks/:id` | 删除 |

### 检查记录（9个端点）
| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/inspection-records` | 分页查询 |
| GET | `/inspection-records/stats` | 统计 |
| GET | `/inspection-records/:id` | 详情 |
| GET | `/inspection-records/task/:taskId` | 查询任务检查记录 |
| GET | `/inspection-records/employee/:employeeId` | 查询员工检查记录 |
| POST | `/inspection-records` | 新增 |
| PUT | `/inspection-records/:id` | 更新 |
| DELETE | `/inspection-records/:id` | 删除 |
| POST | `/inspection-records/batch-create` | 批量创建 |

### 隐患记录（16个端点）
| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/hazard-records` | 分页查询 |
| GET | `/hazard-records/stats` | 统计 |
| GET | `/hazard-records/:id` | 详情 |
| GET | `/hazard-records/task/:taskId` | 查询任务隐患 |
| GET | `/hazard-records/responsible/:employeeId` | 查询责任人隐患 |
| GET | `/hazard-records/open` | 待整改隐患 |
| GET | `/hazard-records/overdue` | 逾期隐患 |
| GET | `/hazard-records/source/:sourceType/:sourceId` | 按来源查询 |
| POST | `/hazard-records` | 新增 |
| POST | `/hazard-records/from-inspection` | 从检查记录创建 |
| PUT | `/hazard-records/:id` | 更新 |
| PUT | `/hazard-records/:id/confirm` | 确认隐患 |
| PUT | `/hazard-records/:id/assign` | 分配责任人 |
| PUT | `/hazard-records/:id/complete` | 完成整改 |
| PUT | `/hazard-records/:id/review` | 复查 |
| DELETE | `/hazard-records/:id` | 删除 |

---

## 六、数据关联关系

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
    │  plan_id, template_id
    ▼
inspection_task（检查任务）
    │
    │  assignee_id → employee.id（执行人）
    │  inspectors → employee.id（检查人员）
    │
    │  task_id
    ▼
inspection_record（检查记录）
    │
    │  employee_id → employee.id（检查人员）
    │  is_hazard_detected = true
    │
    │  人工确认
    ▼
hazard_record（隐患记录）
    │
    ├─► employee_id → employee.id（发现人）
    ├─► responsible_id → employee.id（整改责任人）
    ├─► reviewer_id → employee.id（复查人）
    ├─► confirmed_by → employee.id（确认人）
    │
    ├─► source_type = 'inspection'
    └─► source_id → inspection_record.id
```

---

## 七、数据库迁移

### 7.1 迁移版本

- **版本**: v64 (更新版)
- **脚本**: `hse_employee_master_v64_extension.sql`（更新）
- **内容**: 
  - 更新 hazard_record 表（增加 source_type, source_id, confirmed_by, confirmed_at）
  - 新增 inspection_checklist_template 表
  - 新增 inspection_checklist_item 表
  - 更新 inspection_plan 表（增加 template_id）

---

## 八、技术约束遵守

| 约束 | 状态 | 说明 |
|------|------|------|
| 禁止修改Vben核心目录 | ✅ | 未修改 |
| 禁止修改auth/JWT | ✅ | 未修改 |
| 禁止新增npm依赖 | ✅ | 未新增 |
| 禁止创建公共组件 | ✅ | 未创建 |
| 禁止新增人员表 | ✅ | 无新增人员表 |
| **禁止姓名关联** | ✅ | **所有人员关联使用employee_id** |
| AI字段仅辅助分析 | ✅ | AI字段仅供参考 |

---

**文档版本**: v1.1-confirm  
**生成日期**: 2026-07-20  
**状态**: ✅ Sprint5.4 设计冻结（确认版）

---

**文档结束**