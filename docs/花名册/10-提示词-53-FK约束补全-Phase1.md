# 提示词-53：数据库外键约束补全（Phase 1 — 审计 + 培训/三违/目标责任模块）

> 编号：提示词-53
> 日期：2026-07-30
> 性质：**数据完整性加固（P2）**
> 前置：提示词-52 执行报告（模板下载坏链修复闭环）
> 改动文件：1 个新迁移 SQL + 0 个业务代码改动

---

## 0. 背景

当前数据库已有 24 个 FK 约束（覆盖 employee、department、position、hse_org_unit、hazards、accidents、emergency_plans 等核心表），但 **培训、三违、考核、目标责任** 四大业务模块约 25+ 张表仅有索引无 FK 约束，存在参照完整性风险。

v68 迁移明确标注了"花名册为基石 - 业务表落库员工ID外键"的目标，已为 hazards/accidents/emergency_plans 添加了 FK。本提示词继续推进，分两期完成剩余模块的 FK 补全。

**本期（Phase 1）范围**：培训 + 三违 + 目标责任模块（共 11 张表），考核模块留到 Phase 2。

---

## 1. 任务 A：FK 审计脚本（先审计，再建约束）

在创建 FK 前，必须先审计目标表中是否存在孤儿引用（引用了不存在的 employee/id/position/org_unit）。如果存在孤儿行，直接 ADD CONSTRAINT 会失败。

### 1.1 审计 SQL

创建文件 `server/sql/hse_fk_audit_phase1.sql`：

```sql
-- ============================================================
-- FK 审计 Phase 1：培训 + 三违 + 目标责任模块
-- 目的：检查孤儿引用，为 FK 创建做准备
-- 执行方式：只读查询，不修改任何数据
-- ============================================================

-- ========================
-- 1. 培训模块
-- ========================

-- 1.1 training_record
SELECT 'training_record.employee_id' AS table_column,
       COUNT(*) AS orphan_count
FROM training_record t
LEFT JOIN employee e ON t.employee_id = e.id AND e.is_deleted = false
WHERE t.employee_id IS NOT NULL AND e.id IS NULL;

SELECT 'training_record.position_id' AS table_column,
       COUNT(*) AS orphan_count
FROM training_record t
LEFT JOIN position p ON t.position_id = p.id
WHERE t.position_id IS NOT NULL AND p.id IS NULL;

-- 1.2 employee_induction_training
SELECT 'employee_induction_training.employee_id' AS table_column,
       COUNT(*) AS orphan_count
FROM employee_induction_training t
LEFT JOIN employee e ON t.employee_id = e.id AND e.is_deleted = false
WHERE t.employee_id IS NOT NULL AND e.id IS NULL;

SELECT 'employee_induction_training.position_id' AS table_column,
       COUNT(*) AS orphan_count
FROM employee_induction_training t
LEFT JOIN position p ON t.position_id = p.id
WHERE t.position_id IS NOT NULL AND p.id IS NULL;

-- 1.3 employee_training_status
SELECT 'employee_training_status.employee_id' AS table_column,
       COUNT(*) AS orphan_count
FROM employee_training_status t
LEFT JOIN employee e ON t.employee_id = e.id AND e.is_deleted = false
WHERE t.employee_id IS NOT NULL AND e.id IS NULL;

SELECT 'employee_training_status.position_id' AS table_column,
       COUNT(*) AS orphan_count
FROM employee_training_status t
LEFT JOIN position p ON t.position_id = p.id
WHERE t.position_id IS NOT NULL AND p.id IS NULL;

-- 1.4 position_training_requirement
SELECT 'position_training_requirement.position_id' AS table_column,
       COUNT(*) AS orphan_count
FROM position_training_requirement t
LEFT JOIN position p ON t.position_id = p.id
WHERE t.position_id IS NOT NULL AND p.id IS NULL;

-- 1.5 position_safety_profile
SELECT 'position_safety_profile.position_id' AS table_column,
       COUNT(*) AS orphan_count
FROM position_safety_profile t
LEFT JOIN position p ON t.position_id = p.id
WHERE t.position_id IS NOT NULL AND p.id IS NULL;

-- ========================
-- 2. 三违模块
-- ========================

-- 2.1 violation_records（多列引用 employee）
SELECT 'violation_records.violator_id' AS table_column,
       COUNT(*) AS orphan_count
FROM violation_records v
LEFT JOIN employee e ON v.violator_id = e.id AND e.is_deleted = false
WHERE v.violator_id IS NOT NULL AND e.id IS NULL;

SELECT 'violation_records.inspector_id' AS table_column,
       COUNT(*) AS orphan_count
FROM violation_records v
LEFT JOIN employee e ON v.inspector_id = e.id AND e.is_deleted = false
WHERE v.inspector_id IS NOT NULL AND e.id IS NULL;

SELECT 'violation_records.handler_id' AS table_column,
       COUNT(*) AS orphan_count
FROM violation_records v
LEFT JOIN employee e ON v.handler_id = e.id AND e.is_deleted = false
WHERE v.handler_id IS NOT NULL AND e.id IS NULL;

SELECT 'violation_records.punisher_id' AS table_column,
       COUNT(*) AS orphan_count
FROM violation_records v
LEFT JOIN employee e ON v.punisher_id = e.id AND e.is_deleted = false
WHERE v.punisher_id IS NOT NULL AND e.id IS NULL;

-- ========================
-- 3. 目标责任模块
-- ========================

-- 3.1 safety_goals
SELECT 'safety_goals.responsible_person_id' AS table_column,
       COUNT(*) AS orphan_count
FROM safety_goals g
LEFT JOIN employee e ON g.responsible_person_id = e.id AND e.is_deleted = false
WHERE g.responsible_person_id IS NOT NULL AND e.id IS NULL;

-- 3.2 hse_target_contracts
SELECT 'hse_target_contracts.signer_employee_id' AS table_column,
       COUNT(*) AS orphan_count
FROM hse_target_contracts t
LEFT JOIN employee e ON t.signer_employee_id = e.id AND e.is_deleted = false
WHERE t.signer_employee_id IS NOT NULL AND e.id IS NULL;

SELECT 'hse_target_contracts.signee_employee_id' AS table_column,
       COUNT(*) AS orphan_count
FROM hse_target_contracts t
LEFT JOIN employee e ON t.signee_employee_id = e.id AND e.is_deleted = false
WHERE t.signee_employee_id IS NOT NULL AND e.id IS NULL;

SELECT 'hse_target_contracts.org_unit_id' AS table_column,
       COUNT(*) AS orphan_count
FROM hse_target_contracts t
LEFT JOIN hse_org_unit o ON t.org_unit_id = o.id
WHERE t.org_unit_id IS NOT NULL AND o.id IS NULL;

-- 3.3 hse_safety_committee
SELECT 'hse_safety_committee.employee_id' AS table_column,
       COUNT(*) AS orphan_count
FROM hse_safety_committee c
LEFT JOIN employee e ON c.employee_id = e.id AND e.is_deleted = false
WHERE c.employee_id IS NOT NULL AND e.id IS NULL;

SELECT 'hse_safety_committee.org_unit_id' AS table_column,
       COUNT(*) AS orphan_count
FROM hse_safety_committee c
LEFT JOIN hse_org_unit o ON c.org_unit_id = o.id
WHERE c.org_unit_id IS NOT NULL AND o.id IS NULL;

-- 3.4 hse_responsibility_assessment
SELECT 'hse_responsibility_assessment.employee_id' AS table_column,
       COUNT(*) AS orphan_count
FROM hse_responsibility_assessment r
LEFT JOIN employee e ON r.employee_id = e.id AND e.is_deleted = false
WHERE r.employee_id IS NOT NULL AND e.id IS NULL;

SELECT 'hse_responsibility_assessment.org_unit_id' AS table_column,
       COUNT(*) AS orphan_count
FROM hse_responsibility_assessment r
LEFT JOIN hse_org_unit o ON r.org_unit_id = o.id
WHERE r.org_unit_id IS NOT NULL AND o.id IS NULL;

-- 3.5 hse_safety_budget
SELECT 'hse_safety_budget.org_unit_id' AS table_column,
       COUNT(*) AS orphan_count
FROM hse_safety_budget b
LEFT JOIN hse_org_unit o ON b.org_unit_id = o.id
WHERE b.org_unit_id IS NOT NULL AND o.id IS NULL;

SELECT 'hse_safety_budget.responsible_employee_id' AS table_column,
       COUNT(*) AS orphan_count
FROM hse_safety_budget b
LEFT JOIN employee e ON b.responsible_employee_id = e.id AND e.is_deleted = false
WHERE b.responsible_employee_id IS NOT NULL AND e.id IS NULL;
```

### 1.2 审计结果处理规则

| 审计结果 | 处理方式 |
|----------|---------|
| 孤儿计数 = 0 | 直接创建 FK 约束 |
| 孤儿计数 > 0 且引用列允许 NULL | 将孤儿行的该列 SET NULL，再创建 FK |
| 孤儿计数 > 0 且引用列为 NOT NULL | 记录到报告，跳过该列，不创建 FK（需人工介入） |

---

## 2. 任务 B：FK 约束创建迁移

创建文件 `server/sql/hse_fk_phase1_training_violations_goals.sql`：

```sql
-- ============================================================
-- FK 约束补全 Phase 1：培训 + 三违 + 目标责任模块
-- 日期：2026-07-30
-- 前置：hse_fk_audit_phase1.sql 审计通过
-- 依赖：employee(id), position(id), hse_org_unit(id) 主键已存在
-- ============================================================

BEGIN;

-- ========================
-- 1. 培训模块 (5 张表)
-- ========================

-- 1.1 training_record
ALTER TABLE training_record
  ADD CONSTRAINT fk_training_record_employee
    FOREIGN KEY (employee_id) REFERENCES employee(id)
    ON DELETE SET NULL;

ALTER TABLE training_record
  ADD CONSTRAINT fk_training_record_position
    FOREIGN KEY (position_id) REFERENCES position(id)
    ON DELETE SET NULL;

-- 1.2 employee_induction_training
ALTER TABLE employee_induction_training
  ADD CONSTRAINT fk_induction_training_employee
    FOREIGN KEY (employee_id) REFERENCES employee(id)
    ON DELETE SET NULL;

ALTER TABLE employee_induction_training
  ADD CONSTRAINT fk_induction_training_position
    FOREIGN KEY (position_id) REFERENCES position(id)
    ON DELETE SET NULL;

-- 1.3 employee_training_status
ALTER TABLE employee_training_status
  ADD CONSTRAINT fk_training_status_employee
    FOREIGN KEY (employee_id) REFERENCES employee(id)
    ON DELETE SET NULL;

ALTER TABLE employee_training_status
  ADD CONSTRAINT fk_training_status_position
    FOREIGN KEY (position_id) REFERENCES position(id)
    ON DELETE SET NULL;

-- 1.4 position_training_requirement
ALTER TABLE position_training_requirement
  ADD CONSTRAINT fk_training_req_position
    FOREIGN KEY (position_id) REFERENCES position(id)
    ON DELETE CASCADE;

-- 1.5 position_safety_profile
ALTER TABLE position_safety_profile
  ADD CONSTRAINT fk_safety_profile_position
    FOREIGN KEY (position_id) REFERENCES position(id)
    ON DELETE CASCADE;

-- ========================
-- 2. 三违模块 (1 张表，4 列)
-- ========================

-- 2.1 violation_records
ALTER TABLE violation_records
  ADD CONSTRAINT fk_violation_violator
    FOREIGN KEY (violator_id) REFERENCES employee(id)
    ON DELETE SET NULL;

ALTER TABLE violation_records
  ADD CONSTRAINT fk_violation_inspector
    FOREIGN KEY (inspector_id) REFERENCES employee(id)
    ON DELETE SET NULL;

ALTER TABLE violation_records
  ADD CONSTRAINT fk_violation_handler
    FOREIGN KEY (handler_id) REFERENCES employee(id)
    ON DELETE SET NULL;

ALTER TABLE violation_records
  ADD CONSTRAINT fk_violation_punisher
    FOREIGN KEY (punisher_id) REFERENCES employee(id)
    ON DELETE SET NULL;

-- ========================
-- 3. 目标责任模块 (5 张表)
-- ========================

-- 3.1 safety_goals
ALTER TABLE safety_goals
  ADD CONSTRAINT fk_safety_goals_responsible
    FOREIGN KEY (responsible_person_id) REFERENCES employee(id)
    ON DELETE SET NULL;

-- 3.2 hse_target_contracts
ALTER TABLE hse_target_contracts
  ADD CONSTRAINT fk_target_contracts_signer
    FOREIGN KEY (signer_employee_id) REFERENCES employee(id)
    ON DELETE SET NULL;

ALTER TABLE hse_target_contracts
  ADD CONSTRAINT fk_target_contracts_signee
    FOREIGN KEY (signee_employee_id) REFERENCES employee(id)
    ON DELETE SET NULL;

ALTER TABLE hse_target_contracts
  ADD CONSTRAINT fk_target_contracts_org
    FOREIGN KEY (org_unit_id) REFERENCES hse_org_unit(id)
    ON DELETE SET NULL;

-- 3.3 hse_safety_committee
ALTER TABLE hse_safety_committee
  ADD CONSTRAINT fk_safety_committee_employee
    FOREIGN KEY (employee_id) REFERENCES employee(id)
    ON DELETE SET NULL;

ALTER TABLE hse_safety_committee
  ADD CONSTRAINT fk_safety_committee_org
    FOREIGN KEY (org_unit_id) REFERENCES hse_org_unit(id)
    ON DELETE SET NULL;

-- 3.4 hse_responsibility_assessment
ALTER TABLE hse_responsibility_assessment
  ADD CONSTRAINT fk_resp_assessment_employee
    FOREIGN KEY (employee_id) REFERENCES employee(id)
    ON DELETE SET NULL;

ALTER TABLE hse_responsibility_assessment
  ADD CONSTRAINT fk_resp_assessment_org
    FOREIGN KEY (org_unit_id) REFERENCES hse_org_unit(id)
    ON DELETE SET NULL;

-- 3.5 hse_safety_budget
ALTER TABLE hse_safety_budget
  ADD CONSTRAINT fk_safety_budget_org
    FOREIGN KEY (org_unit_id) REFERENCES hse_org_unit(id)
    ON DELETE SET NULL;

ALTER TABLE hse_safety_budget
  ADD CONSTRAINT fk_safety_budget_responsible
    FOREIGN KEY (responsible_employee_id) REFERENCES employee(id)
    ON DELETE SET NULL;

COMMIT;
```

> **ON DELETE 策略说明**：
> - `employee` 引用 → `ON DELETE SET NULL`（员工删除后业务记录保留，引用列置空）
> - `position` 引用 → `ON DELETE SET NULL`（岗位删除后培训记录保留）
> - `position` 元数据表（training_requirement / safety_profile）→ `ON DELETE CASCADE`（岗位删除后关联配置一并删除）
> - `hse_org_unit` 引用 → `ON DELETE SET NULL`（组织删除后记录保留）

---

## 3. 改动范围

| 文件 | 改动 | 类型 |
|------|------|------|
| `server/sql/hse_fk_audit_phase1.sql` | 新建：审计脚本（只读） | SQL |
| `server/sql/hse_fk_phase1_training_violations_goals.sql` | 新建：FK 创建迁移 | SQL |
| 业务代码 | **0 改动** | - |

---

## 4. 执行步骤

### Step 1：审计

```bash
psql -U postgres -d safety_dashboard -f server/sql/hse_fk_audit_phase1.sql
```

记录所有 `orphan_count > 0` 的表/列，按 1.2 规则处理。

### Step 2：清理孤儿数据（如有）

```sql
-- 示例：如果 training_record.employee_id 存在孤儿引用
UPDATE training_record
SET employee_id = NULL
WHERE employee_id IS NOT NULL
  AND employee_id NOT IN (SELECT id FROM employee WHERE is_deleted = false);
```

### Step 3：创建 FK 约束

```bash
psql -U postgres -d safety_database -f server/sql/hse_fk_phase1_training_violations_goals.sql
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

- [ ] 审计脚本执行完成，输出孤儿引用统计
- [ ] 孤儿数据已清理（如有）
- [ ] FK 迁移执行成功，无报错
- [ ] `pg_constraint` 查询确认新增 FK 数量（预期 22 个）
- [ ] 后端重启后 `/api/health` 正常
- [ ] 培训、三违、目标责任模块的 CRUD 功能正常（回归冒烟）

---

## 6. 红线约束

- 仅创建 FK 约束，不修改业务代码
- 不修改路由定义、菜单配置、组件库
- 不修改表结构（仅 ADD CONSTRAINT）
- 不修改登录相关代码
- 所有 FK 使用 `ON DELETE SET NULL` 或 `ON DELETE CASCADE`，避免级联删除风险
- 审计脚本为只读查询，不修改任何数据

---

## 7. 后续任务（Phase 2，范围外）

| # | 内容 | 优先级 |
|---|------|--------|
| 1 | 考核模块 FK 补全（hse_assessment_* 6 张表） | P2 |
| 2 | HSE 核心事件模块 FK 补全（hse_events 等 5 张表） | P2 |
| 3 | 全项目 TS 存量错误清零 | P2 |
| 4 | 回填策略增强 v1.2 | P2 |

---

> 编制：Senior Developer（高级开发工程师）
> 关联：`09-提示词-52-执行报告.md`