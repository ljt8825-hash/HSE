# HSE V2.0 Sprint5 Phase0 — 架构设计文档

> **版本**: v1.0（架构冻结版）
> **日期**: 2026-07-19
> **前置基础**: Sprint1~4 已稳定交付，V2.0.1 已发布
> **设计目标**: 从「标准化评价」升级到「安全管理闭环运营」
> **状态**: 待审核，通过后进入编码

---

## 一、设计原则与约束

### 1.1 核心原则

| 原则 | 说明 |
|------|------|
| **增量扩展** | 所有新表新字段增量添加，不修改 Sprint1~4 已有表结构和数据 |
| **复用优先** | 优先复用已有表、服务、组件，不重复造轮子 |
| **AI 双轨制** | AI 建议与人工确认分字段存储，AI 永远不直接作为最终结论 |
| **闭环完整性** | 每个模块必须形成「发现→处理→验证→关闭」完整闭环 |
| **数据可追溯** | 所有状态变更必须记录操作日志，全流程可审计 |
| **数据隔离** | 企业级数据隔离，集团/区域/企业三级权限体系 |

### 1.2 技术约束（红线）

| 约束项 | 状态 | 说明 |
|--------|------|------|
| 不修改 packages/@core/ | ✅ 遵守 | Vben 核心目录不动 |
| 不修改 packages/effects/ | ✅ 遵守 | 主题效果不动 |
| 不修改 packages/themes/ | ✅ 遵守 | 主题样式不动 |
| 不修改 auth middleware | ✅ 遵守 | 仅复用 requireRole |
| 不修改 auth routes | ✅ 遵守 | 认证路由不动 |
| 不修改 auth store | ✅ 遵守 | 认证状态管理不动 |
| 不修改 JWT | ✅ 遵守 | Token 机制不动 |
| 不新增 npm 依赖 | ✅ 遵守 | 复用 pg / xlsx / multer / echarts |
| 不创建 src/components/ | ✅ 遵守 | 业务组件放 views/hse/{module}/components/ |
| 不修改 upload.js | ✅ 遵守 | 使用 createUploader 工厂方法 |

### 1.3 业务红线（AI 边界）

| 禁止项 | 说明 | 替代方案 |
|--------|------|---------|
| ❌ 自动关闭隐患 | 隐患关闭必须人工复查 | AI 提供分析建议，人工确认关闭 |
| ❌ 自动定责 | 责任归属必须人工调查 | AI 分析技术原因，不涉及责任判定 |
| ❌ 自动认证 | 延续 Sprint4 禁令 | 标准化自评报告供人工评审参考 |
| ❌ 自动处罚 | 处罚决定必须人工审批 | AI 识别违规行为，人工判定处罚 |
| ❌ 替代人工审核 | 所有 AI 结果仅供参考 | 关键操作必须人工二次确认 |

---

## 二、企业组织模型

### 2.1 四级组织架构

```
        集团（Group）
            │
       ┌────┴────┐
       ▼         ▼
   区域公司A   区域公司B   （Regional Company）
       │         │
    ┌──┴──┐   ┌──┴──┐
    ▼     ▼   ▼     ▼
  企业1  企业2  企业3  企业4   （Enterprise）
    │
 ┌──┴──┐
 ▼     ▼
项目部1 项目部2 ...         （Project Department）
```

### 2.2 组织表设计

#### 2.2.1 `hse_organizations` — 企业组织表

> **新增表**。支持集团-区域公司-企业-项目部四级层级，使用 `org_path` 优化层级查询。

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `id` | BIGSERIAL | ✅ | 主键 |
| `org_code` | VARCHAR(32) | ✅ | 组织编码（唯一，业务可读） |
| `org_name` | VARCHAR(128) | ✅ | 组织名称 |
| `org_type` | VARCHAR(20) | ✅ | 组织类型: `group` / `regional` / `enterprise` / `project` |
| `parent_id` | BIGINT | ❌ | 上级组织 ID（NULL 表示顶级） |
| `org_path` | VARCHAR(512) | ✅ | 组织路径（物化路径，如 `/1/5/12/`），加速子树查询 |
| `level` | SMALLINT | ✅ | 层级深度: 1=集团, 2=区域, 3=企业, 4=项目部 |
| `sort_order` | INTEGER | ❌ | 同级排序号 |
| `contact_person` | VARCHAR(64) | ❌ | 联系人 |
| `contact_phone` | VARCHAR(32) | ❌ | 联系电话 |
| `address` | VARCHAR(256) | ❌ | 地址 |
| `region` | VARCHAR(64) | ❌ | 所在区域 |
| `status` | VARCHAR(20) | ✅ | `active` / `inactive` |
| `metadata` | JSONB | ❌ | 扩展元数据 |
| `created_by` | VARCHAR(64) | ✅ | 创建人 |
| `created_at` | TIMESTAMPTZ | ✅ | 创建时间 |
| `updated_at` | TIMESTAMPTZ | ✅ | 更新时间 |
| `is_deleted` | BOOLEAN | ✅ | 软删除标记 |

**索引设计（6 个）**:
- `uk_organizations_code` — UNIQUE (org_code)
- `idx_organizations_parent` — (parent_id)
- `idx_organizations_path` — (org_path) — 支持前缀匹配子树查询
- `idx_organizations_type` — (org_type)
- `idx_organizations_status` — (status)
- `idx_organizations_level` — (level)

#### 2.2.2 组织与用户关联

**复用现有 `users` 表**，不新增用户表。关联方式：

| 方式 | 说明 |
|------|------|
| `users.department_id` | 已有字段，关联组织 ID |
| `users.role` | 已有字段，控制功能权限 |
| 新增 `org_scope` (JSONB) | 用户可访问的组织范围（多组织时） |

> **不修改** `users` 表结构，`department_id` 可直接复用为所属企业/部门 ID。如需支持多组织数据访问，新增 `hse_user_org_scope` 表。

#### 2.2.3 `hse_user_org_scope` — 用户组织权限范围表（可选 MVP 后补）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | BIGSERIAL | 主键 |
| `user_id` | BIGINT | 用户 ID |
| `org_id` | BIGINT | 可访问的组织 ID |
| `access_type` | VARCHAR(20) | 访问类型: `read` / `write` / `admin` |
| `created_at` | TIMESTAMPTZ | 创建时间 |

### 2.3 数据隔离机制

#### 2.3.1 隔离策略

| 角色 | 数据范围 | 实现方式 |
|------|---------|---------|
| 集团管理员 | 所有组织数据 | 不过滤 enterprise_id |
| 区域管理员 | 本区域下所有企业数据 | org_path LIKE '/{group_id}/{regional_id}/%' |
| 企业管理员 | 本企业数据 | enterprise_id = current_enterprise_id |
| 企业安全员 | 本企业数据 | enterprise_id = current_enterprise_id |
| 项目部用户 | 本项目部数据 | org_id = current_project_id |

#### 2.3.2 实现方式

**MVP 阶段**：所有业务表增加 `enterprise_id` 字段，查询时按 `enterprise_id` 过滤。

```sql
-- 所有新表均包含 enterprise_id 字段
-- 查询示例：企业管理员只能看本企业数据
SELECT * FROM hse_rectification_tasks 
WHERE enterprise_id = current_user_enterprise_id 
  AND is_deleted = FALSE;
```

**扩展阶段**：引入 `org_path` 实现区域公司/集团跨企业查询。

```sql
-- 区域管理员：查看区域下所有企业数据
SELECT * FROM hse_rectification_tasks rt
JOIN hse_organizations o ON rt.enterprise_id = o.id
WHERE o.org_path LIKE '/{group_id}/{regional_id}/%'
  AND rt.is_deleted = FALSE;
```

### 2.4 与现有系统的兼容

| 现有表 | 兼容策略 |
|--------|---------|
| `document_files` | 现有 `enterprise_id` 字段可直接复用 |
| `standard_evaluation_tasks` | 新增 `enterprise_id` 字段（增量，可空） |
| `hse_reports` | 新增 `enterprise_id` 字段（增量，可空） |
| `users` | `department_id` 映射到组织 ID |
| `hse_batch_import_tasks` | 已有 `enterprise_id` + `department_id` |

> **增量原则**：不对现有表做破坏性修改，新增字段全部 `DEFAULT NULL`，不影响现有数据。

---

## 三、整改闭环模型

### 3.1 业务定位

整改任务是闭环运营的核心枢纽，承接所有「发现问题」场景：
- 评价缺项（Sprint4）
- 安全检查发现（检查模块）
- 隐患登记（隐患模块）
- 人工录入

### 3.2 表设计

#### 3.2.1 `hse_rectification_tasks` — 整改任务表

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `id` | BIGSERIAL | ✅ | 主键 |
| `rect_code` | VARCHAR(32) | ✅ | 整改编号（业务可读，如 RT-20260719-001） |
| `task_title` | VARCHAR(256) | ✅ | 整改任务标题 |
| `description` | TEXT | ❌ | 问题描述 |
| `source_type` | VARCHAR(20) | ✅ | 来源类型: `evaluation` / `inspection` / `hazard` / `manual` |
| `source_id` | BIGINT | ❌ | 来源 ID（逻辑关联，不加外键） |
| `clause_id` | BIGINT | ❌ | 关联标准条款 ID（引用 safety_standard_clauses.id） |
| `hazard_level` | VARCHAR(20) | ❌ | 隐患级别: `general` / `major`（来自隐患时复用） |
| `priority` | VARCHAR(20) | ✅ | 优先级: `high` / `medium` / `low` |
| `responsible_person_id` | BIGINT | ❌ | 责任人 ID |
| `responsible_person_name` | VARCHAR(64) | ❌ | 责任人姓名（冗余，便于展示） |
| `responsible_dept_id` | BIGINT | ❌ | 责任部门 ID |
| `responsible_dept_name` | VARCHAR(128) | ❌ | 责任部门名称 |
| `supervisor_id` | BIGINT | ❌ | 督办人 ID |
| `deadline` | DATE | ❌ | 完成期限 |
| `status` | VARCHAR(20) | ✅ | 见状态机 |
| `rectification_measure` | TEXT | ❌ | 整改措施 |
| `evidence_attachment_ids` | JSONB | ❌ | 整改证据附件 ID 列表（引用 document_files.id） |
| `rectification_remark` | TEXT | ❌ | 整改说明 |
| `reviewer_id` | BIGINT | ❌ | 复查人 ID |
| `reviewer_name` | VARCHAR(64) | ❌ | 复查人姓名 |
| `review_result` | VARCHAR(20) | ❌ | 复查结果: `passed` / `rejected` |
| `review_remark` | TEXT | ❌ | 复查意见 |
| `reviewed_at` | TIMESTAMPTZ | ❌ | 复查时间 |
| `reopen_count` | INTEGER | ✅ | 驳回重开次数，默认 0 |
| `ai_suggestion` | TEXT | ❌ | AI 整改建议（AI 字段，仅供参考） |
| `enterprise_id` | BIGINT | ❌ | 企业 ID（数据隔离） |
| `org_id` | BIGINT | ❌ | 组织 ID（细粒度隔离） |
| `created_by` | VARCHAR(64) | ✅ | 创建人 |
| `created_at` | TIMESTAMPTZ | ✅ | 创建时间 |
| `started_at` | TIMESTAMPTZ | ❌ | 开始整改时间 |
| `completed_at` | TIMESTAMPTZ | ❌ | 完成时间（整改提交时间） |
| `closed_at` | TIMESTAMPTZ | ❌ | 关闭时间（复查通过时间） |
| `updated_at` | TIMESTAMPTZ | ✅ | 更新时间 |
| `is_deleted` | BOOLEAN | ✅ | 软删除 |

**索引设计（9 个）**:
- `uk_rectification_code` — UNIQUE (rect_code)
- `idx_rectification_source` — (source_type, source_id)
- `idx_rectification_status` — (status)
- `idx_rectification_priority` — (priority)
- `idx_rectification_deadline` — (deadline)
- `idx_rectification_responsible` — (responsible_person_id)
- `idx_rectification_clause` — (clause_id)
- `idx_rectification_enterprise` — (enterprise_id, status)
- `idx_rectification_created` — (created_at DESC)

### 3.3 状态机

```
          open（待分配/待整改）
              │
              ├─ 责任人接受 → in_progress（整改中）
              │        │
              │        └─ 提交整改证据 → pending_review（待复查）
              │                       │
              │                       ├─ 复查通过 → completed（已完成）
              │                       │       → 触发隐患关闭（如来源是隐患）
              │                       └─ 复查驳回 → in_progress（重新整改）
              │                               → reopen_count++
              │
              └─ 超过 deadline → overdue（已超期）
                                        → 自动预警通知
```

| 状态 | 说明 | 可执行操作 |
|------|------|-----------|
| `open` | 待整改（已创建，未开始） | 分配责任人、开始整改、修改、删除 |
| `in_progress` | 整改中 | 提交整改、修改措施 |
| `pending_review` | 待复查 | 复查（通过/驳回） |
| `completed` | 已完成（复查通过） | 查看、导出 |
| `overdue` | 已超期 | 查看、督办、延期申请 |
| `cancelled` | 已取消 | 查看 |

### 3.4 来源类型与关联

| source_type | source_id 指向 | 说明 |
|-------------|---------------|------|
| `evaluation` | `standard_evaluation_items.id` | 评价缺项转化 |
| `inspection` | `hse_inspection_items.id` | 检查发现问题转化 |
| `hazard` | `hse_hazard_records.id` | 隐患整改（隐患→整改 1:N） |
| `manual` | NULL | 人工录入 |

> **关键设计**: `source_id` 是**逻辑关联**，不加数据库外键。这样可以跨模块关联而不破坏表独立性。

### 3.5 与 AI 的关系

| AI 能力 | 存储字段 | 说明 |
|---------|---------|------|
| 整改建议生成 | `ai_suggestion` | AI 辅助生成整改措施建议，仅参考 |
| AI 角色 | 辅助分析 | 不自动生成结论，不自动分配责任人 |

**AI 边界重申**:
- ❌ AI 不自动关闭整改任务
- ❌ AI 不自动判定责任人
- ❌ AI 不自动生成处罚
- ✅ AI 仅提供整改建议和分析参考

---

## 四、检查模型

### 4.1 业务定位

安全检查是发现问题的主要手段之一。检查任务基于标准条款生成检查清单，检查人员逐项核验，发现的问题可转化为隐患或整改任务。

### 4.2 表设计

#### 4.2.1 `hse_inspection_tasks` — 安全检查任务表

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `id` | BIGSERIAL | ✅ | 主键 |
| `inspection_code` | VARCHAR(32) | ✅ | 检查编号（IT-20260719-001） |
| `task_name` | VARCHAR(256) | ✅ | 检查任务名称 |
| `inspection_type` | VARCHAR(20) | ✅ | 检查类型: `daily` / `special` / `monthly` / `group` |
| `inspection_date` | DATE | ✅ | 检查日期 |
| `inspection_scope` | JSONB | ❌ | 检查范围 { departments: [], areas: [], clause_ids: [] } |
| `checklist_mode` | VARCHAR(20) | ✅ | 清单模式: `all_clauses` / `selected` / `template` |
| `checklist_template_id` | BIGINT | ❌ | 检查清单模板 ID（预留） |
| `inspector_ids` | JSONB | ❌ | 检查人 ID 列表 |
| `inspector_names` | JSONB | ❌ | 检查人姓名列表（冗余展示） |
| `inspection_dept_id` | BIGINT | ❌ | 检查组织部门 ID |
| `status` | VARCHAR(20) | ✅ | 见状态机 |
| `result_summary` | TEXT | ❌ | 检查结果摘要 |
| `total_items` | INTEGER | ✅ | 检查项总数 |
| `passed_count` | INTEGER | ✅ | 合格数 |
| `failed_count` | INTEGER | ✅ | 不合格数 |
| `na_count` | INTEGER | ✅ | 不适用数 |
| `hazard_count` | INTEGER | ✅ | 发现隐患数 |
| `attachment_ids` | JSONB | ❌ | 检查记录附件 |
| `enterprise_id` | BIGINT | ❌ | 企业 ID |
| `org_id` | BIGINT | ❌ | 组织 ID |
| `created_by` | VARCHAR(64) | ✅ | 创建人 |
| `created_at` | TIMESTAMPTZ | ✅ | 创建时间 |
| `started_at` | TIMESTAMPTZ | ❌ | 开始检查时间 |
| `completed_at` | TIMESTAMPTZ | ❌ | 完成时间 |
| `updated_at` | TIMESTAMPTZ | ✅ | 更新时间 |
| `is_deleted` | BOOLEAN | ✅ | 软删除 |

**索引设计（7 个）**:
- `uk_inspection_code` — UNIQUE (inspection_code)
- `idx_inspection_type` — (inspection_type)
- `idx_inspection_status` — (status)
- `idx_inspection_date` — (inspection_date DESC)
- `idx_inspection_enterprise` — (enterprise_id)
- `idx_inspection_created_by` — (created_by)
- `idx_inspection_scope` — GIN (inspection_scope)

#### 4.2.2 `hse_inspection_items` — 检查明细表

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `id` | BIGSERIAL | ✅ | 主键 |
| `inspection_id` | BIGINT | ✅ | 关联检查任务 ID |
| `clause_id` | BIGINT | ❌ | 关联标准条款 ID（引用 safety_standard_clauses.id） |
| `clause_code` | VARCHAR(64) | ❌ | 条款编号（冗余） |
| `clause_title` | VARCHAR(256) | ❌ | 条款标题（冗余） |
| `seq_no` | INTEGER | ✅ | 检查项序号 |
| `check_result` | VARCHAR(20) | ❌ | 检查结果: `passed` / `failed` / `not_applicable` / `pending` |
| `check_remark` | TEXT | ❌ | 检查说明 |
| `evidence_ids` | JSONB | ❌ | 现场证据照片/文件 ID 列表 |
| `has_hazard` | BOOLEAN | ✅ | 是否发现隐患（默认 false） |
| `hazard_id` | BIGINT | ❌ | 关联隐患 ID（逻辑关联） |
| `rectification_id` | BIGINT | ❌ | 关联整改任务 ID（逻辑关联） |
| `checked_by` | VARCHAR(64) | ❌ | 检查人 |
| `checked_at` | TIMESTAMPTZ | ❌ | 检查时间 |
| `created_at` | TIMESTAMPTZ | ✅ | 创建时间 |
| `updated_at` | TIMESTAMPTZ | ✅ | 更新时间 |
| `is_deleted` | BOOLEAN | ✅ | 软删除 |

**索引设计（5 个）**:
- `idx_inspection_items_task` — (inspection_id)
- `idx_inspection_items_clause` — (clause_id)
- `idx_inspection_items_result` — (check_result)
- `idx_inspection_items_hazard` — (has_hazard) WHERE has_hazard = TRUE
- `idx_inspection_items_seq` — (inspection_id, seq_no)

### 4.3 状态机

```
planned（计划中）
    │
    ├─ 开始检查 → in_progress（检查中）
    │        │
    │        └─ 完成检查 → completed（已完成）
    │                 → 自动统计合格/不合格/隐患数
    │                 → 不合格项可生成隐患/整改
    │
    └─ 取消 → cancelled（已取消）
```

| 状态 | 说明 |
|------|------|
| `planned` | 计划中（已创建，未开始） |
| `in_progress` | 检查中 |
| `completed` | 已完成 |
| `cancelled` | 已取消 |

### 4.4 检查清单生成

| 模式 | 说明 | 实现方式 |
|------|------|---------|
| `all_clauses` | 全部条款 | 遍历 safety_standard_clauses 全部 active 条款 |
| `selected` | 自选条款 | 用户选择条款 ID 列表 |
| `template` | 模板生成 | 基于检查模板（预留，MVP 不实现） |

> **MVP 策略**: 实现 `all_clauses` 和 `selected` 两种模式，`template` 预留字段。

### 4.5 与其他模块的关联

```
hse_inspection_tasks
    │
    ├─ 1:N → hse_inspection_items
    │         │
    │         ├─ clause_id → safety_standard_clauses.id（基于条款）
    │         │
    │         └─ 不合格项 → 生成隐患 → hse_hazard_records
    │                            │
    │                            └─ 生成整改 → hse_rectification_tasks
    │
    └─ 完成检查 → 生成检查报告（复用 hse_reports + inspection_report 分类）
```

---

## 五、隐患模型

### 5.1 业务定位

隐患治理是安全管理的核心闭环。隐患从发现到关闭全流程跟踪，是衡量安全管理成效的关键指标。

### 5.2 表设计

#### 5.2.1 `hse_hazard_records` — 隐患记录表

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `id` | BIGSERIAL | ✅ | 主键 |
| `hazard_code` | VARCHAR(32) | ✅ | 隐患编号（HZ-20260719-001） |
| `hazard_title` | VARCHAR(256) | ✅ | 隐患标题 |
| `hazard_description` | TEXT | ✅ | 隐患描述 |
| `hazard_level` | VARCHAR(20) | ✅ | 隐患级别: `general`（一般） / `major`（重大） |
| `hazard_type` | VARCHAR(64) | ❌ | 隐患类型: `equipment` / `behavior` / `management` / `environment` |
| `location` | VARCHAR(256) | ❌ | 隐患位置 |
| `source_type` | VARCHAR(20) | ✅ | 来源类型: `inspection` / `evaluation` / `report` / `manual` / `patrol` |
| `source_id` | BIGINT | ❌ | 来源 ID（逻辑关联） |
| `clause_id` | BIGINT | ❌ | 关联标准条款 ID |
| `discoverer_id` | BIGINT | ❌ | 发现人 ID |
| `discoverer_name` | VARCHAR(64) | ❌ | 发现人姓名 |
| `discovered_at` | TIMESTAMPTZ | ✅ | 发现时间 |
| `responsible_person_id` | BIGINT | ❌ | 责任人 ID |
| `responsible_dept_id` | BIGINT | ❌ | 责任部门 ID |
| `supervisor_id` | BIGINT | ❌ | 督办人 ID |
| `rectification_deadline` | DATE | ❌ | 整改期限 |
| `status` | VARCHAR(20) | ✅ | 见状态机 |
| `rectification_measure` | TEXT | ❌ | 整改措施 |
| `rectification_cost` | DECIMAL(12,2) | ❌ | 整改费用（预留） |
| `evidence_before_ids` | JSONB | ❌ | 整改前证据附件 ID 列表 |
| `evidence_after_ids` | JSONB | ❌ | 整改后证据附件 ID 列表 |
| `reviewer_id` | BIGINT | ❌ | 复查人 ID |
| `reviewer_name` | VARCHAR(64) | ❌ | 复查人姓名 |
| `review_result` | VARCHAR(20) | ❌ | 复查结果: `passed` / `rejected` |
| `review_remark` | TEXT | ❌ | 复查意见 |
| `reviewed_at` | TIMESTAMPTZ | ❌ | 复查时间 |
| `reopen_count` | INTEGER | ✅ | 重开次数，默认 0 |
| `ai_analysis` | TEXT | ❌ | AI 隐患分析（根因+影响+预防建议，AI 字段） |
| `enterprise_id` | BIGINT | ❌ | 企业 ID |
| `org_id` | BIGINT | ❌ | 组织 ID |
| `created_by` | VARCHAR(64) | ✅ | 创建人 |
| `created_at` | TIMESTAMPTZ | ✅ | 创建时间 |
| `rectified_at` | TIMESTAMPTZ | ❌ | 整改完成时间 |
| `closed_at` | TIMESTAMPTZ | ❌ | 关闭时间 |
| `updated_at` | TIMESTAMPTZ | ✅ | 更新时间 |
| `is_deleted` | BOOLEAN | ✅ | 软删除 |

**索引设计（10 个）**:
- `uk_hazard_code` — UNIQUE (hazard_code)
- `idx_hazard_level` — (hazard_level)
- `idx_hazard_type` — (hazard_type)
- `idx_hazard_status` — (status)
- `idx_hazard_source` — (source_type, source_id)
- `idx_hazard_clause` — (clause_id)
- `idx_hazard_discoverer` — (discoverer_id)
- `idx_hazard_responsible` — (responsible_person_id)
- `idx_hazard_enterprise` — (enterprise_id, status)
- `idx_hazard_created` — (created_at DESC)

### 5.3 状态机

```
open（待整改）
    │
    ├─ 开始整改 → rectifying（整改中）
    │        │
    │        └─ 提交整改 → pending_review（待复查）
    │                       │
    │                       ├─ 复查通过 → closed（已关闭）
    │                       └─ 复查驳回 → rectifying（重新整改）
    │                               → reopen_count++
    │
    └─ 超期未整改 → overdue（已超期）
                    → 自动预警
```

| 状态 | 说明 |
|------|------|
| `open` | 待整改（已登记，未开始） |
| `rectifying` | 整改中 |
| `pending_review` | 待复查 |
| `closed` | 已关闭（复查通过） |
| `overdue` | 已超期 |
| `cancelled` | 已取消/已排除 |

### 5.4 闭环四步

| 步骤 | 操作 | 关键变更 |
|------|------|---------|
| **发现** | 隐患登记 | 创建记录，status=open |
| **整改** | 制定措施+执行 | status=rectifying，填写整改措施+责任人+期限 |
| **复查** | 复查验收 | 提交证据 → pending_review → 复查人审核 |
| **关闭** | 复查通过 | status=closed，记录关闭时间和复查人 |

### 5.5 多来源汇聚

| 来源 | source_type | source_id | 说明 |
|------|-------------|-----------|------|
| 安全检查 | `inspection` | hse_inspection_items.id | 检查不合格项生成隐患 |
| 评价缺项 | `evaluation` | standard_evaluation_items.id | 评价不合规条款生成隐患 |
| 日常上报 | `manual` | NULL | 员工/安全员手工上报 |
| 巡查发现 | `patrol` | hse_events.id | 来自统一事件表（已有） |
| 举报投诉 | `report` | NULL | 外部举报（预留） |

### 5.6 与整改任务的关系

**1:N 关系**: 一个隐患可以对应多个整改任务（多次整改、分阶段整改）。

```
hse_hazard_records (1)
    │
    └─ (N) hse_rectification_tasks
            └─ source_type = 'hazard'
               source_id = hse_hazard_records.id
```

**隐患关闭条件**: 最新的整改任务复查通过（review_result = passed），隐患自动关闭。

> **MVP 简化**: MVP 阶段 1:1 关系，一个隐患对应一个整改任务。多次整改通过 reopen 机制实现。

### 5.7 AI 边界

| AI 能力 | 存储位置 | 说明 |
|---------|---------|------|
| 隐患根因分析 | `ai_analysis` | 分析技术原因，不定责 |
| 整改建议生成 | 复用 rectification AI | 生成可操作的整改建议 |
| 风险趋势分析 | 报告 AI 字段 | 统计层面的趋势分析 |

**禁止事项**:
- ❌ AI 不自动关闭隐患
- ❌ AI 不自动判定隐患级别
- ❌ AI 不自动定责（技术原因 ≠ 责任归属）
- ❌ AI 不自动生成处罚
- ✅ AI 仅提供分析和建议，人工最终决策

---

## 六、权限模型

### 6.1 角色体系

基于现有角色体系扩展，不修改 auth 表结构。

| 角色编码 | 角色名称 | 组织层级 | 数据范围 | 说明 |
|---------|---------|---------|---------|------|
| `admin` | 系统管理员 | 系统级 | 全部 | 超级管理员，已有 |
| `group_admin` | 集团管理员 | 集团 | 所有企业 | 集团总部安全管理 |
| `regional_admin` | 区域管理员 | 区域公司 | 本区域所有企业 | 区域公司安全管理 |
| `safety_manager` | 企业安全主管 | 企业 | 本企业 | 企业安全管理部门负责人 |
| `safety_officer` | 企业安全员 | 企业 | 本企业 | 执行层安全人员 |
| `project_officer` | 项目部安全员 | 项目部 | 本项目部 | 项目部安全人员 |
| `department_head` | 部门负责人 | 部门 | 本部门 | 整改责任人角色 |

> **MVP 范围**: MVP 阶段实现 `group_admin` / `safety_manager` / `safety_officer` 三个核心角色，其余角色预留。

### 6.2 权限矩阵

#### 6.2.1 整改闭环权限

| 操作 | group_admin | safety_manager | safety_officer | department_head |
|------|:-----------:|:--------------:|:--------------:|:---------------:|
| 查看整改任务 | ✅ 全部 | ✅ 本企业 | ✅ 本企业 | ✅ 本人负责 |
| 创建整改任务 | ❌ | ✅ | ✅ | ❌ |
| 分配责任人 | ❌ | ✅ | ❌ | ❌ |
| 开始整改 | ❌ | ✅ | ✅ | ✅ |
| 提交整改证据 | ❌ | ✅ | ✅ | ✅ |
| 复查整改 | ❌ | ✅ | ❌ | ❌ |
| 驳回重开 | ❌ | ✅ | ❌ | ❌ |
| 删除整改任务 | ❌ | ✅ | ❌ | ❌ |
| 导出整改报告 | ✅ | ✅ | ❌ | ❌ |

#### 6.2.2 安全检查权限

| 操作 | group_admin | safety_manager | safety_officer |
|------|:-----------:|:--------------:|:--------------:|
| 查看检查任务 | ✅ 全部 | ✅ 本企业 | ✅ 本企业 |
| 创建检查任务 | ❌ | ✅ | ❌ |
| 执行检查 | ❌ | ✅ | ✅ |
| 完成检查 | ❌ | ✅ | ✅ |
| 生成隐患 | ❌ | ✅ | ✅ |
| 删除检查任务 | ❌ | ✅ | ❌ |

#### 6.2.3 隐患治理权限

| 操作 | group_admin | safety_manager | safety_officer |
|------|:-----------:|:--------------:|:--------------:|
| 查看隐患 | ✅ 全部 | ✅ 本企业 | ✅ 本企业 |
| 登记隐患 | ❌ | ✅ | ✅ |
| 制定整改方案 | ❌ | ✅ | ❌ |
| 执行整改 | ❌ | ✅ | ✅ |
| 复查隐患 | ❌ | ✅ | ❌ |
| 关闭隐患 | ❌ | ✅ | ❌ |
| 导出隐患报告 | ✅ | ✅ | ❌ |

#### 6.2.4 组织管理权限

| 操作 | group_admin | safety_manager |
|------|:-----------:|:--------------:|
| 查看组织架构 | ✅ | ✅ 本企业 |
| 新增组织 | ✅ | ❌ |
| 编辑组织 | ✅ | ❌ |
| 停用组织 | ✅ | ❌ |

### 6.3 实现方式

#### 6.3.1 路由层（已复用）

```javascript
// 现有 requireRole 中间件，不修改
router.get('/tasks', requireRole('admin', 'safety_manager', 'safety_officer', 'group_admin'), handler);
```

#### 6.3.2 Service 层数据过滤

```javascript
// Service 层根据用户角色过滤数据
async function getRectificationList(params, user) {
  const conditions = ['is_deleted = FALSE'];
  const values = [];
  
  // 数据隔离：集团管理员看全部，企业用户看本企业
  if (user.role !== 'admin' && user.role !== 'group_admin') {
    conditions.push(`enterprise_id = $${values.length + 1}`);
    values.push(user.enterpriseId);
  }
  
  // ... 其他条件
}
```

#### 6.3.3 操作权限校验

```javascript
// 操作前校验角色 + 数据归属
async function reviewRectification(taskId, result, user) {
  const task = await getTask(taskId);
  
  // 只有 safety_manager 及以上才能复查
  if (!['admin', 'safety_manager', 'group_admin'].includes(user.role)) {
    throw new Error('无权限复查');
  }
  
  // 非管理员只能操作本企业数据
  if (user.role !== 'admin' && user.role !== 'group_admin') {
    if (task.enterprise_id !== user.enterpriseId) {
      throw new Error('无权限操作其他企业数据');
    }
  }
  
  // ... 执行操作
}
```

### 6.4 前端权限控制

```javascript
// 复用 useAccess / hasAccessByRoles
const { hasAccessByRoles } = useAccess();

const canReview = computed(() => 
  hasAccessByRoles(['admin', 'safety_manager', 'group_admin'])
);

const canCreate = computed(() => 
  hasAccessByRoles(['admin', 'safety_manager', 'safety_officer'])
);
```

---

## 七、AI 边界模型

### 7.1 AI 能力矩阵

| 模块 | AI 能力 | 存储字段 | 人工确认 | 说明 |
|------|---------|---------|---------|------|
| 整改闭环 | 整改建议生成 | `ai_suggestion` | ✅ 必须 | AI 生成整改措施建议，责任人可编辑 |
| 隐患治理 | 隐患根因分析 | `ai_analysis` | ✅ 必须 | AI 分析技术原因和影响，不定责 |
| 检查管理 | 检查重点推荐 | 预留 | - | 基于历史数据推荐检查重点（MVP 后） |
| 集团监管 | 趋势分析预警 | 报告 AI 字段 | ✅ 必须 | 统计层面趋势分析，仅预警 |
| 报告生成 | 报告摘要生成 | 复用现有 | ✅ 必须 | 复用 Sprint3 报告 AI 流程 |

### 7.2 AI 使用原则

1. **AI 永远是辅助**: 所有 AI 输出仅作参考，不直接作为最终结论
2. **人工确认前置**: 关键操作（关闭、定责、处罚）必须人工操作
3. **双轨存储**: AI 结果与人工结果分字段存储，互不覆盖
4. **可追溯**: AI 生成的内容保留生成时间和模型版本
5. **可降级**: AI 服务不可用时，不影响核心业务流程

### 7.3 绝对禁止事项

| 禁止项 | 说明 | 违反后果 |
|--------|------|---------|
| ❌ 自动关闭隐患/整改 | 关闭必须人工复查确认 | 严重违规 |
| ❌ 自动定责 | 责任归属必须人工调查 | 严重违规 |
| ❌ 自动认证 | 延续 Sprint4 禁令 | 严重违规 |
| ❌ 自动处罚 | 处罚决定必须人工审批 | 严重违规 |
| ❌ 自动生成考核结果 | 考核必须人工审核 | 中等 |
| ❌ AI 直接修改业务数据 | AI 只能写入 ai_ 前缀字段 | 中等 |
| ❌ AI 替代安全管理员判断 | 关键决策必须有人把关 | 中等 |

### 7.4 AI Prompt 规划（4 个新增）

| Prompt 名称 | 输入 | 输出 | 约束 |
|------------|------|------|------|
| `rectification_suggestion` | 问题描述 + 条款要求 + 关联资料 | 整改措施建议 + 优先级 + 预估工期 | 禁止编造；建议必须可操作；禁止定责 |
| `hazard_analysis` | 隐患描述 + 位置 + 类型 + 历史记录 | 根因分析 + 影响评估 + 预防建议 | 禁止定责；仅分析技术原因；禁止直接给结论 |
| `inspection_focus` | 企业类型 + 历史隐患数据 + 季节/节日 | 检查重点建议 + 风险提示 | 仅建议；不替代检查方案制定 |
| `operation_summary` | 运营数据统计（整改/隐患/检查） | 摘要 + 重点关注 + 改进建议 | 禁止达标结论；仅运营总结 |

> **延续 Sprint4 Prompt**: 不修改已有 6 个 Prompt，仅新增以上 4 个。

### 7.5 AI 失败降级

```javascript
// AI 调用失败不影响核心流程
async function generateAiSuggestion(task) {
  try {
    const result = await aiService.generate('rectification_suggestion', { ... });
    return result;
  } catch (err) {
    console.warn('[AI] 整改建议生成失败，降级为无建议模式:', err.message);
    return null; // 降级：不显示 AI 建议，不阻断流程
  }
}
```

---

## 八、运营日志模型

### 8.1 设计决策

**复用 `sys_operation_log` 表**，不新建 `hse_operation_logs`。

**理由**:
1. 系统已有统一操作日志表 `sys_operation_log`
2. 减少表数量，统一审计入口
3. `module` 字段可区分业务模块

### 8.2 操作类型规划

| module | operation_action | 说明 |
|--------|-----------------|------|
| `rectification` | `create` | 创建整改任务 |
| `rectification` | `assign` | 分配责任人 |
| `rectification` | `start` | 开始整改 |
| `rectification` | `submit` | 提交整改 |
| `rectification` | `review_pass` | 复查通过 |
| `rectification` | `review_reject` | 复查驳回 |
| `rectification` | `overdue` | 超期预警 |
| `inspection` | `create` | 创建检查任务 |
| `inspection` | `start` | 开始检查 |
| `inspection` | `complete` | 完成检查 |
| `hazard` | `register` | 登记隐患 |
| `hazard` | `rectify` | 开始整改 |
| `hazard` | `review` | 复查隐患 |
| `hazard` | `close` | 关闭隐患 |
| `organization` | `create` | 新增组织 |
| `organization` | `update` | 编辑组织 |
| `organization` | `status_change` | 启停组织 |

### 8.3 日志内容规范

`detail` 字段（JSONB）记录关键变更：

```json
{
  "targetId": 123,
  "targetCode": "RT-20260719-001",
  "fromStatus": "open",
  "toStatus": "pending_review",
  "operator": "张三",
  "remark": "提交整改证据3份"
}
```

---

## 九、报告体系扩展

### 9.1 扩展策略

**复用 Sprint3 报告体系**（`hse_reports` + `hse_report_templates`），扩展 `template_category` 的 CHECK 约束。

### 9.2 新增报告分类

| template_category | 说明 | 来源模块 |
|-------------------|------|---------|
| `rectification_report` | 整改报告 | 整改闭环 |
| `inspection_report` | 检查报告 | 安全检查 |
| `hazard_report` | 隐患治理报告 | 隐患治理 |
| `group_supervision` | 集团监管报告 | 集团监管 |
| `operation_dashboard` | 运营驾驶舱数据 | 综合运营 |

### 9.3 迁移方式

同 Sprint4 Phase6，使用 `DROP CONSTRAINT + ADD CONSTRAINT`（事务包裹），不修改现有数据。

---

## 十、数据库迁移版本规划

| 版本 | 内容 | 新增/修改表 |
|------|------|------------|
| **v59** | 企业组织模型 | 新增 `hse_organizations` |
| **v60** | 整改闭环 | 新增 `hse_rectification_tasks` |
| **v61** | 检查管理 | 新增 `hse_inspection_tasks` + `hse_inspection_items` |
| **v62** | 隐患治理 | 新增 `hse_hazard_records` |
| **v63** | 报告体系扩展 | 扩展 `hse_reports` / `hse_report_templates` CHECK 约束 |
| **v64** | 现有表 enterprise_id 补全 | 扩展已有表（增量，可空） |

> **总计**: 5 张新表 + 1 组约束扩展，全部增量迁移，不修改现有字段和数据。

---

## 十一、整体架构图

### 11.1 模块关系图

```
┌──────────────────────────────────────────────────────────────┐
│                    集团监管层 (group)                         │
│              集团看板 / 组织管理 / 监管报告                    │
└───────────────────────────┬──────────────────────────────────┘
                            │ 数据汇总 / 只读监管
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                    安全运营层 (Sprint5 新增)                   │
│                                                              │
│  ┌───────────┐  发现  ┌───────────┐  发现  ┌───────────────┐ │
│  │ 检查管理  │ ─────→ │ 隐患治理  │ ─────→ │  整改闭环管理  │ │
│  │  (新)    │        │  (新)    │        │    (新)       │ │
│  └───────────┘        └─────┬─────┘        └───────┬───────┘ │
│                            │                        │         │
│                            └────── 生成整改 ────────┘         │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │              运营日志 (复用 sys_operation_log)        │    │
│  └──────────────────────────────────────────────────────┘    │
└───────────────────────────┬──────────────────────────────────┘
                            │ 基于条款 / 资料
                            ▼
┌──────────────────────────────────────────────────────────────┐
│              标准化评价层 (Sprint4 已有)                       │
│     标准条款库 / 资料关联 / AI辅助评价 / 自评报告               │
└───────────────────────────┬──────────────────────────────────┘
                            │ 资料 / AI分析
                            ▼
┌──────────────────────────────────────────────────────────────┐
│              资料管理与AI分析 (Sprint1~3 已有)                │
│       安全资料中心 / AI资料分析 / 安全汇报中心                 │
└──────────────────────────────────────────────────────────────┘
```

### 11.2 ER 关系图（Sprint5 新增部分）

```
hse_organizations (新，四级组织)
    │
    ├─ enterprise_id → hse_rectification_tasks (新)
    │         │
    │         ├─ source_type=evaluation → standard_evaluation_items (Sprint4)
    │         ├─ source_type=inspection → hse_inspection_items (新)
    │         ├─ source_type=hazard → hse_hazard_records (新)
    │         ├─ clause_id → safety_standard_clauses (Sprint4)
    │         └─ evidence_attachment_ids → document_files (Sprint1)
    │
    ├─ enterprise_id → hse_inspection_tasks (新)
    │         │
    │         └─ 1:N → hse_inspection_items (新)
    │                   ├─ clause_id → safety_standard_clauses (Sprint4)
    │                   └─ hazard_id → hse_hazard_records (新)
    │
    └─ enterprise_id → hse_hazard_records (新)
              │
              ├─ source_type=inspection → hse_inspection_items (新)
              ├─ source_type=evaluation → standard_evaluation_items (Sprint4)
              ├─ clause_id → safety_standard_clauses (Sprint4)
              └─ 1:N → hse_rectification_tasks (新)
                    source_type='hazard'

sys_operation_log (已有，复用)
    └─ module 区分 rectification/inspection/hazard/organization
```

---

## 十二、Phase 开发顺序

### 12.1 Phase 划分

```
Phase0: 架构设计（本文档）
    │
    ▼
Phase1: 企业组织模型
    ├─ 数据库: hse_organizations (v59)
    ├─ 后端: organizationService + 路由
    └─ 前端: 组织管理页面
    │
    ▼
Phase2: 整改闭环管理
    ├─ 数据库: hse_rectification_tasks (v60)
    ├─ 后端: rectificationService + 路由
    ├─ 前端: 整改任务列表 + 详情 + 证据上传 + 复查
    └─ 集成: 评价缺项 → 整改任务转化
    │
    ▼
Phase3: 安全检查管理
    ├─ 数据库: hse_inspection_tasks + items (v61)
    ├─ 后端: inspectionService + 路由
    ├─ 前端: 检查任务列表 + 执行页面
    └─ 集成: 检查清单基于标准条款 + 发现隐患
    │
    ▼
Phase4: 隐患治理闭环
    ├─ 数据库: hse_hazard_records (v62)
    ├─ 后端: hazardService + 路由
    ├─ 前端: 隐患列表 + 详情（含整改闭环）
    └─ 集成: 多来源隐患 + 整改任务关联
    │
    ▼
Phase5: 报告体系扩展 + 集团监管
    ├─ 数据库: 报告 CHECK 扩展 (v63)
    ├─ 后端: 集团数据汇总 + 监管报告
    └─ 前端: 集团看板 + 监管报告
    │
    ▼
Phase6: AI 辅助能力增强
    ├─ 后端: 4 个新 Prompt + AI 调用
    ├─ 前端: AI 建议展示（可编辑）
    └─ 测试: AI 边界验证
```

### 12.2 依赖关系

```
Phase1（组织）是 Phase2~5 的数据隔离基础
    │
    ├─ Phase2（整改）← 依赖 Sprint4 评价结果
    │       │
    │       └─ Phase4（隐患）← 隐患可生成整改任务
    │
    ├─ Phase3（检查）← 依赖 Sprint4 标准条款
    │       │
    │       └─ Phase4（隐患）← 检查发现隐患
    │
    └─ Phase5（集团监管）← 依赖 Phase2~4 运营数据

Phase6（AI） 可与 Phase2~5 并行，不阻塞核心流程
```

---

## 十三、架构设计总结

### 13.1 设计要点

| 要点 | 设计方案 |
|------|---------|
| **组织模型** | 四级架构（集团-区域-企业-项目），org_path 物化路径优化查询 |
| **数据隔离** | enterprise_id 字段 + Service 层过滤，MVP 企业级，扩展到区域/集团 |
| **整改闭环** | 5 状态机（open/in_progress/pending_review/completed/overdue） |
| **检查模型** | 任务+明细 1:N，基于标准条款生成清单，不合格项转隐患 |
| **隐患模型** | 四步闭环（发现/整改/复查/关闭），多来源汇聚，1:N 整改 |
| **权限体系** | 6 种角色，按组织层级 + 功能模块双重控制 |
| **AI 边界** | 4 个新增 Prompt，3 条绝对禁令，双轨制存储 |
| **运营日志** | 复用 sys_operation_log，module 区分业务 |
| **报告体系** | 复用 Sprint3 框架，扩展 5 种 template_category |

### 13.2 数据库变更统计

| 类型 | 数量 |
|------|------|
| 新增表 | 5 张（organizations / rectification_tasks / inspection_tasks / inspection_items / hazard_records） |
| 新增索引 | ~37 个 |
| 扩展约束 | 2 个（hse_reports / hse_report_templates 的 template_category CHECK） |
| 新增字段（增量） | ~3 个（现有表补充 enterprise_id） |
| 修改表 | 0 张（全部增量，不修改现有字段和数据） |

### 13.3 约束遵守验证

| 约束 | 状态 |
|------|------|
| 不修改 Vben 核心目录 | ✅ 遵守 |
| 不修改 auth/JWT | ✅ 遵守（复用 requireRole） |
| 不新增 npm 依赖 | ✅ 遵守（复用 pg/xlsx/multer/echarts） |
| 不创建 src/components/ | ✅ 遵守（业务组件放模块内） |
| 不修改 upload.js | ✅ 遵守（使用 createUploader） |
| AI 边界清晰 | ✅ 遵守（3 条绝对禁令 + 双轨制） |
| 增量开发不破坏现有 | ✅ 遵守（全部新增，不修改已有表） |

### 13.4 MVP 范围界定

**MVP 必做**:
- ✅ 企业组织模型（三级：集团-企业-项目，区域预留）
- ✅ 整改闭环管理（全流程）
- ✅ 安全检查管理（daily + special + monthly）
- ✅ 隐患治理闭环（全流程）
- ✅ AI 辅助建议（整改建议 + 隐患分析）
- ✅ 报告体系扩展（整改/隐患/检查报告）

**MVP 后补/预留**:
- ⏳ 区域公司层级（org_path 查询优化）
- ⏳ 集团监管看板
- ⏳ 检查模板管理
- ⏳ 安全台账五大类
- ⏳ 多组织用户权限范围表

---

**文档版本**: v1.0（架构冻结版）
**生成日期**: 2026-07-19
**状态**: 待审核

> 审核通过后，按照 Phase1→Phase2→Phase3→Phase4→Phase5→Phase6 顺序进入编码阶段。
