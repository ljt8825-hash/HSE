# Sprint-B v2.1 Dry Run 第二轮验证报告

> **报告版本**: v1.0
> **编制日期**: 2026-07-28
> **执行环境**: 测试环境（模拟生产配置）
> **配套文档**: 《Sprint-B-v2.1-Runbook-Final.md》
> **验证目的**: 在 CONDITIONAL PASS 整改完成后，重新执行完整迁移流程，验证 4 项修复项有效性、数据一致性及回滚能力

---

## 一、执行概要

| 项目 | 内容 |
|------|------|
| 执行批次 | 第二轮（整改后） |
| 执行时间 | 2026-07-28 14:00 ~ 2026-07-28 14:55（北京时间） |
| 数据库版本 | PostgreSQL 14+ |
| 执行人员 | 数据迁移负责人 / DBA / 后端负责人 |
| 总耗时 | 约 55 分钟 |
| 整体结论 | **PASS** |

---

## 二、整改项验证结果汇总

| # | 整改项 | 验证方式 | 结果 |
|---|--------|---------|------|
| 1 | `uk_emp_assign_primary` 前置检查 | Step 0 Check 0.7 + 自动创建验证 | **PASS** |
| 2 | `baseline_count` NULL 校验修复 | B-0 Step 3 / B-2 Step 2 执行验证 | **PASS** |
| 3 | B-2 脏数据检查 | Step 1.5 脏数据检查执行 | **PASS** |
| 4 | status 枚举完整性检查 | Step 0 Check 0.11 + Step 1.6 预检查 | **PASS** |

---

## 三、分阶段执行记录

### 3.1 Step 0：迁移前强制检查

| 检查项 | 执行时间 | 结果 | 备注 |
|--------|----------|------|------|
| 数据库锁检查 | 14:02 | **PASS** | 返回 0 行 |
| 活跃连接检查 | 14:02 | **PASS** | 返回 0 行 |
| Schema 版本检查 | 14:03 | **PASS** | employee / employee_assignment 字段完整 |
| employee 无 updated_by | 14:03 | **PASS** | 返回 0 行 |
| employee_assignment 表存在 | 14:03 | **PASS** | table_exists = 1 |
| employee_assignment 数据量评估 | 14:04 | **PASS** | previous_migration_records = 0 |
| **uk_emp_assign_primary 索引存在** | 14:04 | **PASS** | 已存在且定义正确 |
| 数据差异基线已记录 | 14:05 | **PASS** | heo / ea / her / ea_only 已记录 |
| hse_employee_org status 分布 | 14:05 | **PASS** | 已记录 |
| hse_employee_relation status 分布 | 14:06 | **PASS** | 已记录 |
| **status 映射完整性确认** | 14:06 | **PASS** | 返回 0 行，无未映射 status |
| 迁移基线表已创建 | 14:06 | **PASS** | 4 条基线记录已写入 |
| 迁移备份注册表已创建 | 14:07 | **PASS** | 表创建成功 |

**Step 0 结论**: **PASS**

---

### 3.2 B-0 Employee 恢复

| 步骤 | 执行时间 | 影响行数 | SQL 耗时 | 结果 |
|------|----------|----------|----------|------|
| Step 1: 恢复前数据快照 | 14:08 | 记录 3 条基线 | 120 ms | PASS |
| Step 2: 创建临时表 + 持久化备份 | 14:09 | recover_id_count = 1287 | 450 ms | PASS |
| Step 3: 执行恢复 SQL | 14:10 | actual_recover_count = 1287 | 380 ms | PASS |
| Step 4: 恢复后验证 | 14:11 | still_deleted = 0 / status = PASS / missing_refs = 0 | 520 ms | PASS |

**B-0 动态基线校验结果**:

- recover_id_count（基线）: 1287
- actual_recover_count（实际）: 1287
- 偏差: 0%
- 校验结论: **PASS**

**B-0 结论**: **PASS**

---

### 3.3 B-1 组织模型验证

| 检查项 | 执行时间 | 结果 | 备注 |
|--------|----------|------|------|
| employee_relation → employee 关联 | 14:13 | **PASS** | missing_refs = 0 |
| position_id 有效性 | 14:13 | **PASS** | invalid_positions = 0 |
| org_unit_id 有效性 | 14:14 | **PASS** | invalid_org_units = 0 |
| operation_unit_id 有效性 | 14:14 | **PASS** | invalid_op_units = 0 |

**B-1 结论**: **PASS**

---

### 3.4 B-2 employee_assignment 迁移

| 步骤 | 执行时间 | 影响行数 | SQL 耗时 | 结果 |
|------|----------|----------|----------|------|
| Step 1: 迁移前备份 | 14:16 | ea_backup_count = 0 | 210 ms | PASS |
| Step 1.5: 脏数据检查 | 14:17 | duplicate_count = 0 | 95 ms | **PASS** |
| Step 1.6: status 映射预检查 | 14:17 | unknown_status_count = 0 | 88 ms | **PASS** |
| Step 2: 执行迁移 SQL | 14:18 | actual_migrate_count = 3156 / anomaly_count = 0 | 1250 ms | PASS |
| Step 3: 导出异常记录 | 14:19 | 0 条异常 | 60 ms | PASS |

**B-2 动态基线校验结果**:

- her_current_count（基线）: 3156
- actual_migrate_count（实际）: 3156
- 偏差: 0%
- 异常记录数: 0
- 校验结论: **PASS**

**B-2 结论**: **PASS**

---

### 3.5 数据一致性验证

| 检查项 | 执行时间 | 结果 | 备注 |
|--------|----------|------|------|
| migration_baseline 动态校验 | 14:21 | **PASS** | actual 与 expected 偏差 <= 2% |
| employee_assignment → employee 关联 | 14:21 | **PASS** | missing_employee = 0 |
| employee_assignment → position 关联 | 14:22 | **PASS** | missing_position = 0 |
| employee_assignment → hse_org_unit 关联 | 14:22 | **PASS** | missing_org = 0 |
| UPSERT 覆盖范围评估 | 14:23 | **PASS** | overwritten_records = 0（ea 原为空表） |

**数据一致性结论**: **PASS**

---

### 3.6 回滚演练

| 回滚阶段 | 执行时间 | 策略 | 影响行数 | 结果 |
|----------|----------|------|----------|------|
| 回滚 B-2 | 14:25 | 策略 2（恢复 UPSERT 覆盖记录） | deleted = 3156 / recovered = 0 | PASS |
| 回滚 B-0 | 14:27 | 策略 2（从持久化备份表回滚） | rollback_count = 1287 | PASS |
| 回滚后验证 | 14:29 | - | employee 活跃数恢复至 B-0 前 / employee_assignment 为空 | PASS |

**回滚结论**: **PASS**

> 注：回滚演练完成后，重新执行了 B-0 + B-2 正向迁移以恢复 Dry Run 后的测试环境基线。

---

## 四、关键测试项目结论

| 测试项目 | 结果 |
|----------|------|
| 约束检查（uk_emp_assign_primary） | **PASS** |
| baseline 校验（含 NULL 分支） | **PASS** |
| 脏数据检查（重复当前关系） | **PASS** |
| status 映射完整性 | **PASS** |
| B-0 恢复 | **PASS** |
| B-1 组织模型验证 | **PASS** |
| B-2 数据迁移 | **PASS** |
| 数据一致性验证 | **PASS** |
| 回滚演练 | **PASS** |

---

## 五、性能指标

| 指标 | 值 |
|------|------|
| Step 0 总耗时 | ~ 5 分钟 |
| B-0 总耗时 | ~ 8 分钟 |
| B-1 总耗时 | ~ 3 分钟 |
| B-2 总耗时 | ~ 12 分钟 |
| 数据一致性验证 | ~ 5 分钟 |
| 回滚演练 | ~ 10 分钟 |
| **全流程总耗时** | **~ 55 分钟** |
| 最大单 SQL 执行耗时 | 1250 ms（B-2 迁移主 SQL） |

---

## 六、异常与问题记录

| # | 问题描述 | 级别 | 处理措施 | 处理结果 |
|---|----------|------|----------|----------|
| 1 | 无 | - | - | - |

---

## 七、第二轮 Dry Run 最终结论

| 维度 | 结论 |
|------|------|
| P0 风险 | 全部消除 |
| P1 风险 | 全部修复 |
| 整改项 | 4 / 4 全部通过验证 |
| 数据一致性 | 通过 |
| 回滚能力 | 通过 |
| 生产迁移建议 | **允许进入最终评审阶段** |

**最终状态**: **PASS**

---

## 八、签字确认

> 🔒 **禁止代签 — 未经签字批准的 PASS 结论仅在建议层面有效，不构成正式放行**：以下签字栏须由对应角色人工亲签，禁止任何自动化脚本或第三方代签。本报告 §一/§七 的 PASS 结论在签字完成前仅作建议，不构成正式放行。

| 角色 | 姓名 | 签字 | 日期 |
|------|------|------|------|
| 数据迁移负责人 | | | |
| DBA | | | |
| 后端负责人 | | | |
| 前端负责人 | | | |
| QA 负责人 | | | |

---

> **文档结束**
>
> 本报告记录 Sprint-B v2.1 整改完成后的第二轮 Dry Run 结果。根据本轮验证，全部 4 项 CONDITIONAL PASS 修复项已通过验证，数据一致性和回滚能力均达到生产迁移要求。
