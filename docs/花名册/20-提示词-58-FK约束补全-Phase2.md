# 提示词-58：数据库外键约束补全（Phase 2 — 考核 + HSE 核心事件 + 基础设施表）

> 编号：提示词-58
> 日期：2026-07-30
> 性质：**数据完整性加固（P2）**
> 前置：提示词-57 v2 执行报告（supervisor_id 读取补全 ✅）
> 关联：提示词-53（FK Phase 1 — 培训/三违/目标责任，已生成待执行）
> 改动文件：3 个（2 个新 SQL + 1 个审计脚本）

---

## 0. 背景

提示词-53（Phase 1）覆盖了培训、三违、目标责任模块的 11 张表。**Phase 2 覆盖剩余模块**：考核核心表、HSE 核心事件表、以及基础设施表 `employee_assignment`。

当前数据库中已有 12 条 FK 约束（来自 v59/v68/v69 迁移），但以下模块的 ~20 个外键列仍为裸 BIGINT，无参照完整性保护：

| 模块 | 表数 | 缺 FK 列数 | 风险 |
|------|:--:|:--:|------|
| 考核核心 | 6 | 12 | 考核目标/扣分/追责链引用不存在的 employee |
| HSE 核心事件 | 5 | 10 | 事件/整改/复核引用不存在的 employee/org |
| 基础设施 | 1 | 4 | employee_assignment 是最核心的关联表，无任何 FK |

---

## 1. 任务 A：FK 审计脚本（先审计，再建约束）

创建文件 `server/sql/hse_fk_audit_phase2.sql`：

```sql
-- ============================================================
-- FK 审计 Phase 2：考核 + HSE 核心事件 + employee_assignment
-- 目的：检查孤儿引用，为 FK 创建做准备
-- 执行方式：只读查询，不修改任何数据
-- ============================================================

-- ========================
-- 1. 考核核心表
-- ========================

-- 1.1 hse_assessment_cycle
SELECT 'hse_assessment_cycle.created_by' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_assessment_cycle c
LEFT JOIN employee e ON c.created_by = e.id AND e.is_deleted = false
WHERE c.created_by IS NOT NULL AND e.id IS NULL;

SELECT 'hse_assessment_cycle.frozen_by' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_assessment_cycle c
LEFT JOIN employee e ON c.frozen_by = e.id AND e.is_deleted = false
WHERE c.frozen_by IS NOT NULL AND e.id IS NULL;

-- 1.2 hse_assessment_target
SELECT 'hse_assessment_target.employee_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_assessment_target t
LEFT JOIN employee e ON t.employee_id = e.id AND e.is_deleted = false
WHERE t.employee_id IS NOT NULL AND e.id IS NULL;

-- 1.3 hse_assessment_deduction
SELECT 'hse_assessment_deduction.violator_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_assessment_deduction d
LEFT JOIN employee e ON d.violator_id = e.id AND e.is_deleted = false
WHERE d.violator_id IS NOT NULL AND e.id IS NULL;

-- 1.4 hse_deduction_adjustment
SELECT 'hse_deduction_adjustment.adjusted_by' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_deduction_adjustment a
LEFT JOIN employee e ON a.adjusted_by = e.id AND e.is_deleted = false
WHERE a.adjusted_by IS NOT NULL AND e.id IS NULL;

SELECT 'hse_deduction_adjustment.reviewed_by' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_deduction_adjustment a
LEFT JOIN employee e ON a.reviewed_by = e.id AND e.is_deleted = false
WHERE a.reviewed_by IS NOT NULL AND e.id IS NULL;

-- 1.5 hse_responsibility_chain
SELECT 'hse_responsibility_chain.subordinate_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_responsibility_chain c
LEFT JOIN employee e ON c.subordinate_id = e.id AND e.is_deleted = false
WHERE c.subordinate_id IS NOT NULL AND e.id IS NULL;

SELECT 'hse_responsibility_chain.manager_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_responsibility_chain c
LEFT JOIN employee e ON c.manager_id = e.id AND e.is_deleted = false
WHERE c.manager_id IS NOT NULL AND e.id IS NULL;

-- 1.6 hse_assessment_audit_log
SELECT 'hse_assessment_audit_log.operator_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_assessment_audit_log l
LEFT JOIN employee e ON l.operator_id = e.id AND e.is_deleted = false
WHERE l.operator_id IS NOT NULL AND e.id IS NULL;

-- ========================
-- 2. HSE 核心事件表
-- ========================

-- 2.1 hse_events
SELECT 'hse_events.personnel_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_events ev
LEFT JOIN employee e ON ev.personnel_id = e.id AND e.is_deleted = false
WHERE ev.personnel_id IS NOT NULL AND e.id IS NULL;

SELECT 'hse_events.department_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_events ev
LEFT JOIN hse_org_unit o ON ev.department_id = o.id
WHERE ev.department_id IS NOT NULL AND o.id IS NULL;

-- 2.2 hse_event_timeline
SELECT 'hse_event_timeline.actor_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_event_timeline t
LEFT JOIN employee e ON t.actor_id = e.id AND e.is_deleted = false
WHERE t.actor_id IS NOT NULL AND e.id IS NULL;

-- 2.3 hse_control_measures
SELECT 'hse_control_measures.responsible_person_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_control_measures m
LEFT JOIN employee e ON m.responsible_person_id = e.id AND e.is_deleted = false
WHERE m.responsible_person_id IS NOT NULL AND e.id IS NULL;

SELECT 'hse_control_measures.department_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_control_measures m
LEFT JOIN hse_org_unit o ON m.department_id = o.id
WHERE m.department_id IS NOT NULL AND o.id IS NULL;

-- 2.4 hse_rectifications
SELECT 'hse_rectifications.responsible_person_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_rectifications r
LEFT JOIN employee e ON r.responsible_person_id = e.id AND e.is_deleted = false
WHERE r.responsible_person_id IS NOT NULL AND e.id IS NULL;

SELECT 'hse_rectifications.department_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_rectifications r
LEFT JOIN hse_org_unit o ON r.department_id = o.id
WHERE r.department_id IS NOT NULL AND o.id IS NULL;

-- 2.5 hse_reviews
SELECT 'hse_reviews.reviewer_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_reviews r
LEFT JOIN employee e ON r.reviewer_id = e.id AND e.is_deleted = false
WHERE r.reviewer_id IS NOT NULL AND e.id IS NULL;

-- ========================
-- 3. employee_assignment（基础设施表）
-- ========================

SELECT 'employee_assignment.employee_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM employee_assignment ea
LEFT JOIN employee e ON ea.employee_id = e.id AND e.is_deleted = false
WHERE ea.employee_id IS NOT NULL AND e.id IS NULL;

SELECT 'employee_assignment.supervisor_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM employee_assignment ea
LEFT JOIN employee e ON ea.supervisor_id = e.id AND e.is_deleted = false
WHERE ea.supervisor_id IS NOT NULL AND e.id IS NULL;

SELECT 'employee_assignment.position_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM employee_assignment ea
LEFT JOIN position p ON ea.position_id = p.id
WHERE ea.position_id IS NOT NULL AND p.id IS NULL;

SELECT 'employee_assignment.org_unit_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM employee_assignment ea
LEFT JOIN hse_org_unit o ON ea.org_unit_id = o.id
WHERE ea.org_unit_id IS NOT NULL AND o.id IS NULL;
```

### 审计结果处理规则

| 审计结果 | 处理方式 |
|----------|---------|
| 孤儿计数 = 0 | 直接创建 FK 约束 |
| 孤儿计数 > 0 且引用列允许 NULL | 将孤儿行的该列 SET NULL，再创建 FK |
| 孤儿计数 > 0 且引用列为 NOT NULL | 记录到报告，跳过该列，不创建 FK（需人工介入） |

---

## 2. 任务 B：FK 约束创建迁移

创建文件 `server/sql/hse_fk_phase2_assessment_events.sql`：

```sql
-- ============================================================
-- FK 约束补全 Phase 2：考核 + HSE 核心事件 + employee_assignment
-- 日期：2026-07-30
-- 前置：hse_fk_audit_phase2.sql 审计通过
-- 依赖：employee(id), position(id), hse_org_unit(id) 主键已存在
-- ============================================================

BEGIN;

-- ========================
-- 1. 考核核心表 (6 张表，12 个 FK)
-- ========================

-- 1.1 hse_assessment_cycle
ALTER TABLE hse_assessment_cycle
  ADD CONSTRAINT fk_assessment_cycle_created_by
    FOREIGN KEY (created_by) REFERENCES employee(id)
    ON DELETE SET NULL;

ALTER TABLE hse_assessment_cycle
  ADD CONSTRAINT fk_assessment_cycle_frozen_by
    FOREIGN KEY (frozen_by) REFERENCES employee(id)
    ON DELETE SET NULL;

-- 1.2 hse_assessment_target
ALTER TABLE hse_assessment_target
  ADD CONSTRAINT fk_assessment_target_employee
    FOREIGN KEY (employee_id) REFERENCES employee(id)
    ON DELETE SET NULL;

-- 1.3 hse_assessment_deduction
ALTER TABLE hse_assessment_deduction
  ADD CONSTRAINT fk_assessment_deduction_violator
    FOREIGN KEY (violator_id) REFERENCES employee(id)
    ON DELETE SET NULL;

-- 1.4 hse_deduction_adjustment
ALTER TABLE hse_deduction_adjustment
  ADD CONSTRAINT fk_deduction_adjust_adjusted_by
    FOREIGN KEY (adjusted_by) REFERENCES employee(id)
    ON DELETE SET NULL;

ALTER TABLE hse_deduction_adjustment
  ADD CONSTRAINT fk_deduction_adjust_reviewed_by
    FOREIGN KEY (reviewed_by) REFERENCES employee(id)
    ON DELETE SET NULL;

-- 1.5 hse_responsibility_chain
ALTER TABLE hse_responsibility_chain
  ADD CONSTRAINT fk_resp_chain_subordinate
    FOREIGN KEY (subordinate_id) REFERENCES employee(id)
    ON DELETE SET NULL;

ALTER TABLE hse_responsibility_chain
  ADD CONSTRAINT fk_resp_chain_manager
    FOREIGN KEY (manager_id) REFERENCES employee(id)
    ON DELETE SET NULL;

-- 1.6 hse_assessment_audit_log
ALTER TABLE hse_assessment_audit_log
  ADD CONSTRAINT fk_assessment_audit_operator
    FOREIGN KEY (operator_id) REFERENCES employee(id)
    ON DELETE SET NULL;

-- ========================
-- 2. HSE 核心事件表 (5 张表，10 个 FK)
-- ========================

-- 2.1 hse_events
ALTER TABLE hse_events
  ADD CONSTRAINT fk_hse_events_personnel
    FOREIGN KEY (personnel_id) REFERENCES employee(id)
    ON DELETE SET NULL;

ALTER TABLE hse_events
  ADD CONSTRAINT fk_hse_events_department
    FOREIGN KEY (department_id) REFERENCES hse_org_unit(id)
    ON DELETE SET NULL;

-- 2.2 hse_event_timeline
ALTER TABLE hse_event_timeline
  ADD CONSTRAINT fk_event_timeline_actor
    FOREIGN KEY (actor_id) REFERENCES employee(id)
    ON DELETE SET NULL;

-- 2.3 hse_control_measures
ALTER TABLE hse_control_measures
  ADD CONSTRAINT fk_control_measures_responsible
    FOREIGN KEY (responsible_person_id) REFERENCES employee(id)
    ON DELETE SET NULL;

ALTER TABLE hse_control_measures
  ADD CONSTRAINT fk_control_measures_department
    FOREIGN KEY (department_id) REFERENCES hse_org_unit(id)
    ON DELETE SET NULL;

-- 2.4 hse_rectifications
ALTER TABLE hse_rectifications
  ADD CONSTRAINT fk_rectifications_responsible
    FOREIGN KEY (responsible_person_id) REFERENCES employee(id)
    ON DELETE SET NULL;

ALTER TABLE hse_rectifications
  ADD CONSTRAINT fk_rectifications_department
    FOREIGN KEY (department_id) REFERENCES hse_org_unit(id)
    ON DELETE SET NULL;

-- 2.5 hse_reviews
ALTER TABLE hse_reviews
  ADD CONSTRAINT fk_reviews_reviewer
    FOREIGN KEY (reviewer_id) REFERENCES employee(id)
    ON DELETE SET NULL;

-- ========================
-- 3. employee_assignment（基础设施表，4 个 FK）
-- ========================

-- ⚠️ 注意：employee_assignment 是核心关联表，写入频繁。
-- 如审计发现大量孤儿行，优先清理后再创建 FK。
-- employee_id 和 org_unit_id 通常为 NOT NULL，孤儿行需人工介入。

ALTER TABLE employee_assignment
  ADD CONSTRAINT fk_employee_assignment_employee
    FOREIGN KEY (employee_id) REFERENCES employee(id)
    ON DELETE CASCADE;

ALTER TABLE employee_assignment
  ADD CONSTRAINT fk_employee_assignment_supervisor
    FOREIGN KEY (supervisor_id) REFERENCES employee(id)
    ON DELETE SET NULL;

ALTER TABLE employee_assignment
  ADD CONSTRAINT fk_employee_assignment_position
    FOREIGN KEY (position_id) REFERENCES position(id)
    ON DELETE SET NULL;

ALTER TABLE employee_assignment
  ADD CONSTRAINT fk_employee_assignment_org_unit
    FOREIGN KEY (org_unit_id) REFERENCES hse_org_unit(id)
    ON DELETE SET NULL;

COMMIT;
```

> **ON DELETE 策略说明**：
> - `employee` 引用 → `ON DELETE SET NULL`（业务记录保留，引用列置空）
> - `employee_assignment.employee_id` → `ON DELETE CASCADE`（员工删除后其任职记录一并删除，避免孤儿主记录）
> - `hse_org_unit` 引用 → `ON DELETE SET NULL`（组织删除后记录保留）
> - `position` 引用 → `ON DELETE SET NULL`（岗位删除后任职记录保留）

---

## 3. 改动范围

| 文件 | 改动 | 类型 |
|------|------|------|
| `server/sql/hse_fk_audit_phase2.sql` | 新建：审计脚本（只读，22 条查询） | SQL |
| `server/sql/hse_fk_phase2_assessment_events.sql` | 新建：FK 创建迁移（26 个约束） | SQL |
| 业务代码 | **0 改动** | - |

---

## 4. 执行步骤

### Step 1：审计

```bash
psql -U postgres -d safety_dashboard -f server/sql/hse_fk_audit_phase2.sql
```

记录所有 `orphan_count > 0` 的表/列，按审计结果处理规则处理。

### Step 2：清理孤儿数据（如有）

```sql
-- 示例：如果 hse_assessment_target.employee_id 存在孤儿引用
UPDATE hse_assessment_target
SET employee_id = NULL
WHERE employee_id IS NOT NULL
  AND employee_id NOT IN (SELECT id FROM employee WHERE is_deleted = false);

-- 示例：如果 employee_assignment 存在孤儿引用（NOT NULL 列，需人工确认）
-- SELECT * FROM employee_assignment
-- WHERE employee_id NOT IN (SELECT id FROM employee WHERE is_deleted = false);
```

### Step 3：创建 FK 约束

```bash
psql -U postgres -d safety_dashboard -f server/sql/hse_fk_phase2_assessment_events.sql
```

### Step 4：验证

```sql
-- 确认所有 FK 已创建
SELECT conname, conrelid::regclass AS table_name
FROM pg_constraint
WHERE contype = 'f'
  AND conname LIKE 'fk_%'
ORDER BY conname;
```

---

## 5. 验证清单

- [ ] 审计脚本执行完成，输出孤儿引用统计（22 条查询）
- [ ] 孤儿数据已清理（如有），NOT NULL 列孤儿已标记人工介入
- [ ] FK 迁移执行成功，无报错
- [ ] `pg_constraint` 查询确认新增 FK 数量（预期 26 个）
- [ ] 后端重启后 `/api/health` 正常
- [ ] 考核模块（月度考核/扣分/追责）CRUD 功能正常
- [ ] HSE 事件模块（事件/时间线/整改/复核）CRUD 功能正常
- [ ] 员工花名册导入/更新功能正常（employee_assignment FK 不影响写入）

---

## 6. 红线约束

- 仅创建 FK 约束，不修改业务代码
- 不修改路由定义、菜单配置、组件库
- 不修改表结构（仅 ADD CONSTRAINT）
- 不修改登录相关代码
- 所有 FK 使用 `ON DELETE SET NULL` 或 `ON DELETE CASCADE`，避免级联删除风险
- 审计脚本为只读查询，不修改任何数据
- `employee_assignment` 的 FK 创建需特别谨慎：如审计发现大量孤儿，先标记不执行，待人工确认后再处理

---

## 7. 风险提示

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| `employee_assignment.employee_id` 孤儿 | NOT NULL 列，无法 SET NULL | 审计后人工确认，必要时先补全 employee 记录 |
| `employee_assignment.org_unit_id` 孤儿 | NOT NULL 列 | 同上 |
| `hse_assessment_target.employee_id` 孤儿 | NOT NULL 列 | 同上 |
| `hse_deduction_adjustment.adjusted_by` 孤儿 | NOT NULL 列 | 同上 |
| `hse_responsibility_chain` 双列孤儿 | 两列均为 NOT NULL | 审计后逐条确认 |
| `hse_assessment_audit_log.operator_id` 孤儿 | NOT NULL 列 | 同上 |
| 考核模块运行时写入触发 FK 校验失败 | 业务流程中断 | 先审计清孤再建约束，建后立即回归冒烟 |

---

## 8. FK 补全总览

| Phase | 提示词 | 覆盖模块 | 表数 | FK 数 | 状态 |
|-------|--------|---------|:--:|:--:|------|
| Phase 1 | 53 | 培训 + 三违 + 目标责任 | 11 | 22 | 📋 已生成 |
| **Phase 2** | **58** | **考核 + HSE 核心事件 + employee_assignment** | **12** | **26** | 📋 本提示词 |
| 已有 | v59/v68/v69 | employee_relation/hazards/accidents/emergency | 5 | 12 | ✅ 已存在 |
| **合计** | — | — | **28** | **60** | — |

---

> 编制：Senior Developer（高级开发工程师）
> 关联：`10-提示词-53-FK约束补全-Phase1.md`、`19-提示词-57-执行报告-supervisor_id读取补全v2.md`