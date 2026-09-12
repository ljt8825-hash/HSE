# 提示词-61：FK 约束补全 Phase 1 执行 — 培训 + 三违 + 目标责任模块

> 编号：提示词-61
> 日期：2026-07-30
> 性质：**数据完整性加固（P2）— 执行档**
> 前置：提示词-53（FK Phase 1 设计文档已生成）、提示词-58/59（Phase 2 已完成，17 条 FK 已建）
> 关联：`docs/花名册/10-提示词-53-FK约束补全-Phase1.md`（完整设计）
> 改动文件：2 个新 SQL + 1 个审计报告（0 业务代码改动）

---

## 0. 背景

提示词-53 已完整设计了 FK Phase 1 的审计脚本和迁移脚本，覆盖培训、三违、目标责任三大模块 11 张表 22 条 FK。但 Phase 2（考核 + HSE 事件 + employee_assignment）先于 Phase 1 执行，现已完成 17 条 FK。

当前数据库 FK 总数 17 条。Phase 1 执行后预计增至约 39 条（22 条新建，实际取决于审计结果）。

**Phase 2 已沉淀的执行范式**直接复用：
1. `pg_dump` 全库备份
2. `information_schema` 核验列存在性/类型/可空性
3. 只读审计 → 孤儿按可空性 SET NULL / 跳过
4. `DO $$` 块幂等建约束（判列存在性 + 约束存在性）
5. `pg_constraint` 复核计数

---

## 1. 任务 A：实勘核验（执行前必做）

在审计前，必须用 `information_schema` 核验提示词-53 中列出的 22 个列是否真实存在：

```sql
-- 核验 training_record 的 employee_id / position_id
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'training_record', 'employee_induction_training', 'employee_training_status',
    'position_training_requirement', 'position_safety_profile',
    'violation_records',
    'safety_goals', 'hse_target_contracts', 'hse_safety_committee',
    'hse_responsibility_assessment', 'hse_safety_budget'
  )
  AND column_name IN (
    'employee_id', 'position_id',
    'violator_id', 'inspector_id', 'handler_id', 'punisher_id',
    'responsible_person_id', 'signer_employee_id', 'signee_employee_id',
    'org_unit_id', 'responsible_employee_id'
  )
ORDER BY table_name, ordinal_position;
```

**门控规则**：若某列不存在，该列对应的 FK 跳过，记录到审计报告。

---

## 2. 任务 B：审计脚本执行

**文件**：`server/sql/hse_fk_audit_phase1.sql`（提示词-53 §1.1，已设计完成）

执行：
```bash
psql -U postgres -d safety_dashboard -f server/sql/hse_fk_audit_phase1.sql
```

输出重定向到 `server/sql/_audit_phase1_result.txt`。

**审计结果处理规则**（与 Phase 2 一致）：

| 审计结果 | 处理方式 |
|----------|---------|
| 孤儿计数 = 0 | 直接创建 FK 约束 |
| 孤儿计数 > 0 且引用列允许 NULL | 将孤儿行的该列 SET NULL，再创建 FK |
| 孤儿计数 > 0 且引用列为 NOT NULL | 记录到报告，跳过该列，不创建 FK（需人工介入） |

---

## 3. 任务 C：FK 迁移脚本增强（幂等改造）

提示词-53 §2 的迁移脚本是原始 `ALTER TABLE ... ADD CONSTRAINT` 形式，不可重跑。**必须按 Phase 2 范式增强为 `DO $$` 幂等块**：

创建文件 `server/sql/hse_fk_phase1_training_violations_goals.sql`（覆盖提示词-53 同名文件）：

```sql
-- ============================================================
-- FK 约束补全 Phase 1：培训 + 三违 + 目标责任模块
-- 日期：2026-07-30
-- 前置：hse_fk_audit_phase1.sql 审计通过
-- 依赖：employee(id), position(id), hse_org_unit(id) 主键已存在
-- 特性：DO $$ 块幂等（判列存在性 + 约束存在性），可重跑
-- ============================================================

-- ========================
-- 1. 培训模块 (5 张表，10 个 FK)
-- ========================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='training_record' AND column_name='employee_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_training_record_employee') THEN
    ALTER TABLE training_record ADD CONSTRAINT fk_training_record_employee
      FOREIGN KEY (employee_id) REFERENCES employee(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='training_record' AND column_name='position_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_training_record_position') THEN
    ALTER TABLE training_record ADD CONSTRAINT fk_training_record_position
      FOREIGN KEY (position_id) REFERENCES position(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employee_induction_training' AND column_name='employee_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_induction_training_employee') THEN
    ALTER TABLE employee_induction_training ADD CONSTRAINT fk_induction_training_employee
      FOREIGN KEY (employee_id) REFERENCES employee(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employee_induction_training' AND column_name='position_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_induction_training_position') THEN
    ALTER TABLE employee_induction_training ADD CONSTRAINT fk_induction_training_position
      FOREIGN KEY (position_id) REFERENCES position(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employee_training_status' AND column_name='employee_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_training_status_employee') THEN
    ALTER TABLE employee_training_status ADD CONSTRAINT fk_training_status_employee
      FOREIGN KEY (employee_id) REFERENCES employee(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employee_training_status' AND column_name='position_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_training_status_position') THEN
    ALTER TABLE employee_training_status ADD CONSTRAINT fk_training_status_position
      FOREIGN KEY (position_id) REFERENCES position(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='position_training_requirement' AND column_name='position_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_training_req_position') THEN
    ALTER TABLE position_training_requirement ADD CONSTRAINT fk_training_req_position
      FOREIGN KEY (position_id) REFERENCES position(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='position_safety_profile' AND column_name='position_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_safety_profile_position') THEN
    ALTER TABLE position_safety_profile ADD CONSTRAINT fk_safety_profile_position
      FOREIGN KEY (position_id) REFERENCES position(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ========================
-- 2. 三违模块 (1 张表，4 个 FK)
-- ========================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='violation_records' AND column_name='violator_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_violation_violator') THEN
    ALTER TABLE violation_records ADD CONSTRAINT fk_violation_violator
      FOREIGN KEY (violator_id) REFERENCES employee(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='violation_records' AND column_name='inspector_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_violation_inspector') THEN
    ALTER TABLE violation_records ADD CONSTRAINT fk_violation_inspector
      FOREIGN KEY (inspector_id) REFERENCES employee(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='violation_records' AND column_name='handler_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_violation_handler') THEN
    ALTER TABLE violation_records ADD CONSTRAINT fk_violation_handler
      FOREIGN KEY (handler_id) REFERENCES employee(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='violation_records' AND column_name='punisher_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_violation_punisher') THEN
    ALTER TABLE violation_records ADD CONSTRAINT fk_violation_punisher
      FOREIGN KEY (punisher_id) REFERENCES employee(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ========================
-- 3. 目标责任模块 (5 张表，10 个 FK)
-- ========================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='safety_goals' AND column_name='responsible_person_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_safety_goals_responsible') THEN
    ALTER TABLE safety_goals ADD CONSTRAINT fk_safety_goals_responsible
      FOREIGN KEY (responsible_person_id) REFERENCES employee(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_target_contracts' AND column_name='signer_employee_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_target_contracts_signer') THEN
    ALTER TABLE hse_target_contracts ADD CONSTRAINT fk_target_contracts_signer
      FOREIGN KEY (signer_employee_id) REFERENCES employee(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_target_contracts' AND column_name='signee_employee_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_target_contracts_signee') THEN
    ALTER TABLE hse_target_contracts ADD CONSTRAINT fk_target_contracts_signee
      FOREIGN KEY (signee_employee_id) REFERENCES employee(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_target_contracts' AND column_name='org_unit_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_target_contracts_org') THEN
    ALTER TABLE hse_target_contracts ADD CONSTRAINT fk_target_contracts_org
      FOREIGN KEY (org_unit_id) REFERENCES hse_org_unit(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_safety_committee' AND column_name='employee_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_safety_committee_employee') THEN
    ALTER TABLE hse_safety_committee ADD CONSTRAINT fk_safety_committee_employee
      FOREIGN KEY (employee_id) REFERENCES employee(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_safety_committee' AND column_name='org_unit_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_safety_committee_org') THEN
    ALTER TABLE hse_safety_committee ADD CONSTRAINT fk_safety_committee_org
      FOREIGN KEY (org_unit_id) REFERENCES hse_org_unit(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_responsibility_assessment' AND column_name='employee_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_resp_assessment_employee') THEN
    ALTER TABLE hse_responsibility_assessment ADD CONSTRAINT fk_resp_assessment_employee
      FOREIGN KEY (employee_id) REFERENCES employee(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_responsibility_assessment' AND column_name='org_unit_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_resp_assessment_org') THEN
    ALTER TABLE hse_responsibility_assessment ADD CONSTRAINT fk_resp_assessment_org
      FOREIGN KEY (org_unit_id) REFERENCES hse_org_unit(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_safety_budget' AND column_name='org_unit_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_safety_budget_org') THEN
    ALTER TABLE hse_safety_budget ADD CONSTRAINT fk_safety_budget_org
      FOREIGN KEY (org_unit_id) REFERENCES hse_org_unit(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_safety_budget' AND column_name='responsible_employee_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_safety_budget_responsible') THEN
    ALTER TABLE hse_safety_budget ADD CONSTRAINT fk_safety_budget_responsible
      FOREIGN KEY (responsible_employee_id) REFERENCES employee(id) ON DELETE SET NULL;
  END IF;
END $$;
```

> **ON DELETE 策略**：employee 引用 → SET NULL；position 元数据表（training_requirement / safety_profile）→ CASCADE；其余 → SET NULL。

---

## 4. 执行步骤

### Step 0：全库备份
```bash
pg_dump -U postgres -d safety_dashboard -Fc -f server/sql/_backup_before_fk61_$(date +%Y%m%d_%H%M%S).dump
```

### Step 1：列存在性核验（§1）
```bash
psql -U postgres -d safety_dashboard -f server/sql/_probe_fk61_columns.sql
```
记录缺失列，跳过对应 FK。

### Step 2：审计

```bash
psql -U postgres -d safety_dashboard -f server/sql/hse_fk_audit_phase1.sql > server/sql/_audit_phase1_result.txt
```

### Step 3：孤儿清洗（按审计结果）
```sql
-- 仅对可空列且孤儿 > 0 的情况执行
-- NOT NULL 孤儿跳过，记录到报告
```

### Step 4：FK 创建
```bash
psql -U postgres -d safety_dashboard -f server/sql/hse_fk_phase1_training_violations_goals.sql
```

### Step 5：验证
```sql
SELECT count(*) AS total_fk FROM pg_constraint WHERE contype = 'f';
```

---

## 5. 改动范围

| 文件 | 改动 | 类型 |
|------|------|------|
| `server/sql/hse_fk_audit_phase1.sql` | 已设计（提示词-53），直接执行 | SQL（只读） |
| `server/sql/hse_fk_phase1_training_violations_goals.sql` | 已设计（提示词-53），需增强为 DO $$ 幂等块（本提示词 §3） | SQL |
| 业务代码 | 0 改动 | — |

---

## 6. 验证清单

- [ ] 列存在性核验完成，记录缺失列
- [ ] `pg_dump` 全库备份完成
- [ ] 审计脚本执行完成，输出孤儿统计
- [ ] 孤儿数据已清洗（可空列 SET NULL），NOT NULL 孤儿已记录
- [ ] FK 迁移执行成功，无报错
- [ ] `pg_constraint` 查询确认新增 FK 数量（预期约 22 条，取决于审计结果）
- [ ] 后端重启后 `/api/health` 正常
- [ ] 培训模块（培训记录/入职培训/培训状态）CRUD 正常
- [ ] 三违模块（三违记录）CRUD 正常
- [ ] 目标责任模块（安全目标/责任合同/安委会/责任评估/安全预算）CRUD 正常

---

## 7. 红线约束

- 仅创建 FK 约束，不修改业务代码
- 不修改路由定义、菜单配置、组件库
- 不修改表结构（仅 ADD CONSTRAINT）
- 不修改登录相关代码
- 审计脚本为只读查询，不修改任何数据
- NOT NULL 活跃孤儿不得强制 SET NULL，必须标记人工介入
- 所有清洗操作必须有 `pg_dump` 前置备份
- 迁移脚本必须为 `DO $$` 幂等块（判列存在性 + 约束存在性），可重跑

---

## 8. FK 补全终态总览（更新）

| Phase | 提示词 | 覆盖模块 | 新建 FK | 跳过 | 状态 |
|-------|--------|---------|:------:|:----:|------|
| Phase 1 | 53→61 | 培训 + 三违 + 目标责任 | ~22 | 待审计 | 🔲 待执行 |
| Phase 2 | 58 | 考核 + HSE 事件 + employee_assignment | 16 | 5 | ✅ 已建 |
| 收尾 | 59 | Phase 2 遗留治理 | 0 | 4 | ✅ 跟踪中 |
| **合计** | — | — | **~38** | **~9** | — |

> 注：Phase 1 执行后 FK 总数预计从 17 条增至约 39 条。Phase 2 遗留的 4 项 TK 仍在跟踪中。

---

> 编制：Senior Developer（高级开发工程师）
> 关联：`10-提示词-53-FK约束补全-Phase1.md`、`23-FK-Phase2-遗留项治理跟踪.md`、`25-提示词-60-执行报告-花名册列表页表头优化.md`