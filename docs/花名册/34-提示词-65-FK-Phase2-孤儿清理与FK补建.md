# 提示词-65：FK Phase 2 — 孤儿清理与 FK 补建（收尾）

> 编号：提示词-65
> 日期：2026-07-30
> 性质：**数据治理（P2）**
> 前置：提示词-59 执行（`23-FK-Phase2-遗留项治理跟踪.md`）
> 改动范围：仅数据库（0 业务代码改动）

---

## 0. 背景

提示词-59（FK Phase 2 数据治理闭环）在执行中发现 2 条 FK 约束因孤儿数据无法创建：

| 约束 | 表.列 | 孤儿数 | 孤儿特征 |
|------|------|:----:|------|
| `fk_deduction_adjust_adjusted_by` | `hse_deduction_adjustment.adjusted_by` | 4 | 全部 NOT NULL，引用 employee id=1（不存在） |
| `fk_assessment_audit_operator` | `hse_assessment_audit_log.operator_id` | 49 | 全部 NOT NULL，引用 employee id=1（不存在） |

53 条孤儿均为 **2026-07-23 ~ 2026-07-24 测试种子数据**，`employee` 表中 id=1 完全不存在（含软删除行）。两表均无 `is_deleted` 列，无法按「软删除置 NULL」清洗。

---

## 1. 修复策略

### 1.1 策略选择

| 方案 | 描述 | 风险 |
|------|------|------|
| A. 删除孤儿行 | DELETE 53 条测试数据，然后建 FK | 低（确认均为测试种子，无业务价值） |
| B. 创建 employee id=1 | INSERT 一条虚拟员工，然后建 FK | 中（引入虚假数据，污染花名册） |
| C. 改列为可空→SET NULL→建 FK→改回 NOT NULL | 事务内操作 | 高（DDL 锁表风险） |

**推荐方案 A**：53 条孤儿全部为测试种子数据，`adjusted_at` / `operation_time` 集中在 2026-07-23 22:33 ~ 2026-07-24 09:13，`reason` / `module` 明确标注「测试」「全流程测试」「场景4测试」，无业务价值，删除后无回归风险。

### 1.2 执行步骤

```
B-0: 全库备份（pg_dump）
B-1: 审计确认（只读，列出待删行供人工复核）
B-2: 删除孤儿行（hse_deduction_adjustment 4 行 + hse_assessment_audit_log 49 行）
B-3: 验证孤儿=0
B-4: 创建 2 条 FK 约束
B-5: 验证 FK 创建成功 + 无新孤儿
```

---

## 2. 任务 A：全库备份（B-0）

```bash
pg_dump -h localhost -U hse_app -d hse_dashboard -Fc -f _backup_before_fk65_$(date +%Y%m%d_%H%M%S).dump
```

---

## 3. 任务 B：审计确认（B-1，只读）

输出待删行的完整上下文，供人工最终确认：

```sql
-- B-1a: hse_deduction_adjustment 孤儿详情
SELECT da.*
FROM hse_deduction_adjustment da
LEFT JOIN employee e ON e.id = da.adjusted_by
WHERE da.adjusted_by IS NOT NULL
  AND e.id IS NULL
ORDER BY da.adjusted_at;

-- B-1b: hse_assessment_audit_log 孤儿详情
SELECT al.*
FROM hse_assessment_audit_log al
LEFT JOIN employee e ON e.id = al.operator_id
WHERE al.operator_id IS NOT NULL
  AND e.id IS NULL
ORDER BY al.operation_time DESC;
```

**门控**：输出行数与 23-FK-Phase2 报告一致（4 + 49 = 53），且确认全部为测试数据后，方可进入 B-2。

---

## 4. 任务 C：删除孤儿（B-2）+ 验证（B-3）

```sql
BEGIN;

-- B-2a: 删除 hse_deduction_adjustment 孤儿
DELETE FROM hse_deduction_adjustment
WHERE adjusted_by IS NOT NULL
  AND adjusted_by NOT IN (SELECT id FROM employee);

-- B-2b: 删除 hse_assessment_audit_log 孤儿
DELETE FROM hse_assessment_audit_log
WHERE operator_id IS NOT NULL
  AND operator_id NOT IN (SELECT id FROM employee);

-- B-3: 验证孤儿=0
SELECT 'hse_deduction_adjustment' AS tbl, COUNT(*) AS orphans
FROM hse_deduction_adjustment da
LEFT JOIN employee e ON e.id = da.adjusted_by
WHERE da.adjusted_by IS NOT NULL AND e.id IS NULL
UNION ALL
SELECT 'hse_assessment_audit_log', COUNT(*)
FROM hse_assessment_audit_log al
LEFT JOIN employee e ON e.id = al.operator_id
WHERE al.operator_id IS NOT NULL AND e.id IS NULL;

-- 确认两行均为 0 后 COMMIT，否则 ROLLBACK
COMMIT;
```

---

## 5. 任务 D：创建 FK 约束（B-4）+ 验证（B-5）

```sql
BEGIN;

-- B-4a: fk_deduction_adjust_adjusted_by
ALTER TABLE hse_deduction_adjustment
  ADD CONSTRAINT fk_deduction_adjust_adjusted_by
  FOREIGN KEY (adjusted_by) REFERENCES employee(id)
  ON DELETE SET NULL;

-- B-4b: fk_assessment_audit_operator
ALTER TABLE hse_assessment_audit_log
  ADD CONSTRAINT fk_assessment_audit_operator
  FOREIGN KEY (operator_id) REFERENCES employee(id)
  ON DELETE SET NULL;

-- B-5: 验证 FK 存在
SELECT conname, conrelid::regclass::text AS tbl
FROM pg_constraint
WHERE contype = 'f'
  AND conname IN ('fk_deduction_adjust_adjusted_by', 'fk_assessment_audit_operator');

COMMIT;
```

> 注意：`ON DELETE SET NULL` 要求目标列可空。当前两列均为 NOT NULL。若 ADD CONSTRAINT 报错，需先 ALTER COLUMN SET NOT NULL → DROP NOT NULL → 建 FK → 验证。

---

## 6. 验证清单

- [ ] B-0：全库备份成功（.dump 文件存在且 > 0 字节）
- [ ] B-1：审计输出 53 行（4 + 49），全部确认为测试数据
- [ ] B-3：孤儿计数 = 0（两行均为 0）
- [ ] B-5：`pg_constraint` 中 2 条 FK 均存在
- [ ] 后端 `/api/health` 正常，DB connected
- [ ] 抽查 `GET /api/hse/employee/employees` 返回正常（无因 FK 导致的查询失败）

---

## 7. 改动范围

| 层级 | 改动 | 类型 |
|------|------|------|
| 数据库 | DELETE 53 行测试孤儿 + 2 条 ALTER TABLE ADD CONSTRAINT | DML + DDL |
| 业务代码 | 0 改动 | — |

---

## 8. 红线约束

- 仅操作 `hse_deduction_adjustment` 和 `hse_assessment_audit_log` 两张表
- 不修改其他表、业务逻辑、路由、菜单、组件
- 删除前必须人工确认 B-1 审计输出
- 删除必须在事务内执行，B-3 验证通过才 COMMIT
- 不创建虚假 employee 记录（不污染花名册）

---

## 9. FK 补全终态

| Phase | 提示词 | 新建 FK | 累计 FK |
|-------|--------|:------:|:------:|
| Phase 2 主体 | 58 | 16 | 17 |
| Phase 1 执行 | 61 | 17 | 105 |
| Phase 2 收尾（本次） | **65** | **2** | **107** |

> 目标终态：107 条 FK 约束，覆盖核心考核表、HSE 事件表、employee_assignment、培训、三违、目标责任、扣分调整、考核审计日志。

---

> 编制：Senior Developer（高级开发工程师）
> 关联：`23-FK-Phase2-遗留项治理跟踪.md`（§5 待人工介入项）
> 前置：`33-提示词-64-执行报告.md`（行重复修复终态）