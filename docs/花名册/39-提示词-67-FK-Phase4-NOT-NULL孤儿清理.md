# 提示词-67：FK Phase 4 — 提示词-61 NOT NULL 孤儿清理与 FK 补建

> 编号：提示词-67
> 日期：2026-07-30
> 性质：**数据治理（P2）**
> 前置：提示词-61 执行（5 条 FK 因 NOT NULL 孤儿跳过）、提示词-66 执行（FK 109 条）
> 改动范围：仅数据库（0 业务代码改动）

---

## 0. 背景

提示词-61（FK Phase 1：培训 + 三违 + 目标责任）审计发现 22 个候选列中 17 列孤儿=0 直接建 FK，**5 列因 NOT NULL 孤儿被红线跳过**：

| 表.列 | 孤儿数 | 孤儿取值 | 孤儿特征 |
|------|:----:|------|------|
| `employee_induction_training.employee_id` | 16 | employee 106~181 | 种子/demo 数据，指向不存在的 employee |
| `employee_induction_training.position_id` | 16 | position 35~81 | 同上，指向不存在的 position |
| `employee_training_status.employee_id` | 16 | employee 106~181 | 同上 |
| `employee_training_status.position_id` | 16 | position 35~81 | 同上 |
| `position_safety_profile.position_id` | 24 | position 35~81 | 同上 |

> 真实 employee id ~5000+，position id 正常范围与之不同。这些孤儿取值 106~181 / 35~81 明显为种子/demo 数据，引用不存在的父表主键。

---

## 1. 修复策略

### 策略选择

| 方案 | 描述 | 风险 |
|------|------|------|
| A. 删除孤儿行 | DELETE 88 行种子数据，然后重跑 FK 脚本 | 低（均为种子/demo，无业务价值） |
| B. 补建 employee/position | 创建虚拟 employee 106~181 和 position 35~81 | 高（污染花名册，引入虚假数据） |

**推荐方案 A**：与提示词-65 同理——88 行均为种子/demo 数据，删除后无业务损失。脚本 `hse_fk_phase1_training_violations_goals.sql` 已幂等，重跑后 5 条 FK 将自动补建。

### 执行步骤

```
B-0: 全库备份（pg_dump）
B-1: 审计确认（只读，列出 88 行待删孤儿上下文）
B-2: 检查三张表是否有防改触发器
B-3: 删除孤儿行（如有触发器则临时禁用）
B-4: 验证孤儿=0
B-5: 重跑 hse_fk_phase1_training_violations_goals.sql（幂等，自动补建 5 条 FK）
B-6: 验证 FK 创建成功 + 计数
```

---

## 2. 任务 A：全库备份（B-0）

```bash
pg_dump -h localhost -U hse_app -d hse_dashboard -Fc -f _backup_before_fk67_$(date +%Y%m%d_%H%M%S).dump
```

---

## 3. 任务 B：审计确认（B-1，只读）

输出 88 行待删孤儿的完整上下文，供人工确认：

```sql
-- 3 张表孤儿详情（只读）
SELECT 'employee_induction_training' AS tbl, eit.*
FROM employee_induction_training eit
LEFT JOIN employee e ON e.id = eit.employee_id
WHERE eit.employee_id IS NOT NULL AND e.id IS NULL
UNION ALL
SELECT 'employee_training_status', ets.*
FROM employee_training_status ets
LEFT JOIN employee e ON e.id = ets.employee_id
WHERE ets.employee_id IS NOT NULL AND e.id IS NULL
UNION ALL
SELECT 'position_safety_profile', psp.*
FROM position_safety_profile psp
LEFT JOIN hse_position p ON p.id = psp.position_id
WHERE psp.position_id IS NOT NULL AND p.id IS NULL;
```

**门控**：输出行数 = 88（16+16+16+16+24），确认全部为种子/demo 数据后方可进入 B-3。

---

## 4. 任务 C：触发器检查（B-2）

```sql
-- 检查三张表是否有 BEFORE DELETE OR UPDATE 触发器
SELECT tgname, tgrelid::regclass::text AS tbl, tgenabled
FROM pg_trigger
WHERE tgrelid::regclass::text IN (
  'employee_induction_training',
  'employee_training_status',
  'position_safety_profile'
)
  AND tgtype & 8 > 0;  -- bit 3 = INSTEAD OF
```

> 如无触发器 → 直接 DELETE。如有 → 参考提示词-65 做法：`DISABLE TRIGGER` → DELETE → `ENABLE TRIGGER`。

---

## 5. 任务 D：删除孤儿（B-3）+ 验证（B-4）

```sql
BEGIN;

-- 若存在防改触发器，先禁用
-- ALTER TABLE employee_induction_training DISABLE TRIGGER ALL;
-- ALTER TABLE employee_training_status DISABLE TRIGGER ALL;
-- ALTER TABLE position_safety_profile DISABLE TRIGGER ALL;

-- 删除 employee_induction_training 孤儿（employee_id 与 position_id 孤儿）
DELETE FROM employee_induction_training
WHERE employee_id NOT IN (SELECT id FROM employee)
   OR position_id NOT IN (SELECT id FROM hse_position);

-- 删除 employee_training_status 孤儿
DELETE FROM employee_training_status
WHERE employee_id NOT IN (SELECT id FROM employee)
   OR position_id NOT IN (SELECT id FROM hse_position);

-- 删除 position_safety_profile 孤儿
DELETE FROM position_safety_profile
WHERE position_id NOT IN (SELECT id FROM hse_position);

-- B-4: 验证孤儿=0
SELECT 'employee_induction_training' AS tbl, COUNT(*) AS orphans
FROM employee_induction_training eit
LEFT JOIN employee e ON e.id = eit.employee_id
WHERE eit.employee_id IS NOT NULL AND e.id IS NULL
UNION ALL
SELECT 'employee_training_status', COUNT(*)
FROM employee_training_status ets
LEFT JOIN employee e ON e.id = ets.employee_id
WHERE ets.employee_id IS NOT NULL AND e.id IS NULL
UNION ALL
SELECT 'position_safety_profile', COUNT(*)
FROM position_safety_profile psp
LEFT JOIN hse_position p ON p.id = psp.position_id
WHERE psp.position_id IS NOT NULL AND p.id IS NULL;

-- 确认三行均为 0 后 COMMIT
COMMIT;

-- 若临时禁用了触发器，恢复
-- ALTER TABLE employee_induction_training ENABLE TRIGGER ALL;
-- ALTER TABLE employee_training_status ENABLE TRIGGER ALL;
-- ALTER TABLE position_safety_profile ENABLE TRIGGER ALL;
```

---

## 6. 任务 E：重跑 FK 迁移脚本（B-5）+ 验证（B-6）

```bash
psql -h localhost -U hse_app -d hse_dashboard -f server/sql/hse_fk_phase1_training_violations_goals.sql
```

该脚本已幂等（`DO $$` 块），5 条 FK 将自动补建：

| 约束名 | 表.列 | 策略 |
|------|------|------|
| `fk_induction_training_employee` | `employee_induction_training.employee_id` | `ON DELETE SET NULL` |
| `fk_induction_training_position` | `employee_induction_training.position_id` | `ON DELETE SET NULL` |
| `fk_training_status_employee` | `employee_training_status.employee_id` | `ON DELETE SET NULL` |
| `fk_training_status_position` | `employee_training_status.position_id` | `ON DELETE SET NULL` |
| `fk_safety_profile_position` | `position_safety_profile.position_id` | `ON DELETE CASCADE`（元数据表） |

```sql
-- 验证新建 FK 存在
SELECT conname, conrelid::regclass::text AS tbl
FROM pg_constraint
WHERE contype = 'f'
  AND conname IN (
    'fk_induction_training_employee',
    'fk_induction_training_position',
    'fk_training_status_employee',
    'fk_training_status_position',
    'fk_safety_profile_position'
  );

-- FK 总数
SELECT COUNT(*) AS fk_total FROM pg_constraint WHERE contype = 'f';
```

---

## 7. 验证清单

- [ ] B-0：全库备份成功
- [ ] B-1：审计输出 88 行，全部确认为种子/demo 数据
- [ ] B-2：触发器状态已确认
- [ ] B-4：孤儿计数 = 0（三行均为 0）
- [ ] B-5：重跑脚本无报错
- [ ] B-6：5 条 FK 均存在，FK 总数 = **114**（109 → 114）
- [ ] 后端 `/api/health` 正常，DB connected
- [ ] 触发器（如有禁用）已恢复 ENABLED

---

## 8. 改动范围

| 层级 | 改动 | 类型 |
|------|------|------|
| 数据库 | DELETE 88 行种子孤儿 + 5 条 ALTER TABLE ADD CONSTRAINT | DML + DDL |
| 业务代码 | 0 改动 | — |

---

## 9. 红线约束

- 仅操作 `employee_induction_training`、`employee_training_status`、`position_safety_profile` 三张表
- 不修改其他表、业务逻辑、路由、菜单、组件
- 删除前必须人工确认 B-1 审计输出（88 行全部为种子数据）
- 删除在事务内执行，B-4 验证通过才 COMMIT
- 有防改触发器时必须参照提示词-65 的 DISABLE/ENABLE 范式
- 不创建虚假 employee/position 记录

---

## 10. FK 补全终态

| Phase | 提示词 | 新建 FK | 累计 FK |
|-------|--------|:------:|:------:|
| Phase 2 主体 | 58 | 16 | 17 |
| Phase 1 执行 | 61 | 17 | 105 |
| Phase 2 收尾 | 65 | 2 | 107 |
| Phase 3 列缺失 | 66 | 2 | 109 |
| Phase 4 孤儿清理（本次） | **67** | **5** | **114** |

> 目标终态：114 条 FK 约束。提示词-61 的 22 个候选 FK **全部补建完成**（17 首轮 + 5 本次）。FK 补全工程真正终结。

---

> 编制：Senior Developer（高级开发工程师）
> 关联：`27-提示词-61-执行报告.md`（§2 跳过 5 条 FK）、`38-DB治理与列表修复-总总结.md`（§6 待办项 2）
> 前置：`37-提示词-66-执行报告.md`（FK 109 条）