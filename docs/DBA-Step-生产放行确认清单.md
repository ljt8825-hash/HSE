# DBA / 运维 生产放行确认清单

> **性质**：TRAE（dev 侧 13 步）已全部验证通过收口，本清单为**生产执行交接物**，不归 TRAE 执行。
> **依据**：`docs/TRAE-Step12-生产放行执行门控Runbook.md`（v1.1，已通过验证者复审）
> **铁律**：所有 SQL 由 DBA 在维护窗口手动执行；签字栏现场人工签字，**禁止代签**。

---

## 一、执行前 5 点确认（必须全勾，否则不得开始）

| # | 确认项 | 依据 | 勾选 |
|---|--------|------|------|
| 1 | 业务方已确认停机窗口（建议 02:00–05:00） | Runbook ① 前置 | □ |
| 2 | `Sprint-B-v2.1-Production-Package` 已上传生产服务器 | Runbook ① 前置 | □ |
| 3 | `server/scripts/backfillEmployeeId.cjs` 已上传生产服务器 | Runbook ① 前置 | □ |
| 4 | 代码仓已打 Tag：`sprint-b-migration-prod` | Runbook ① 前置 | □ |
| 5 | DBA + 后端 + 前端 + 业务负责人均已到位 | Runbook ① 前置 | □ |

> ⚠️ **两个生产前必查点（Step 0 Preflight）**：
> - `uk_emp_assign_primary` 唯一索引必须存在（`WHERE is_primary AND is_current AND NOT is_deleted`），缺失则按 Runbook §2.1 DDL 创建。
> - `hse_employee_org` 只读触发器 3 个（`trg_hse_employee_org_block_insert/update/delete`）必须已部署（Step 9），缺失则执行 `hse_employee_org_ReadOnly_Change.sql`。

---

## 二、执行顺序（严格按此，不得跳步）

1. **Step 0 Preflight** — 索引 + 触发器复核（任一 FAIL 阻断迁移）
2. **B-0 Employee 恢复** — 先 B-0-1.5 建全量备份表 `employee_b0_backup_20260728`，再恢复
3. **B-2 迁移** — ⚠️ **执行生产包文件 `04_B2_Assignment_Migration.sql`**，勿手敲内联 SQL
4. **迁移后基线校验** — 偏差 ≤ 2% 方 PASS
5. **历史回填** — `node scripts/backfillEmployeeId.cjs --dry-run` 预估 → DBA+业务签字 → 再执行实际回填
6. **巡检启用决策** — 运维决定是否开 `HEALTH_CHECK_ENABLED=true`（建议开，cron `0 2 * * *`，Asia/Shanghai）
7. **端到端验证** — 抽样三违/培训/employee_assignment 各 1 条，确认下游联动正常

---

## 三、回滚预案（提前记牢，遇异常即用）

| 环节 | 触发 | 回滚动作 |
|------|------|----------|
| B-0 | 恢复失败 | 会话在：UPDATE employee SET is_deleted=true WHERE id IN (temp_b0_recover_ids)；会话断：从 `employee_b0_backup_20260728` 恢复 |
| B-2 | 行数异常/迁移失败 | 仅撤新增：`DELETE ... WHERE created_by='system_migration_b2'`；全量：`TRUNCATE` + 从生产包生成的 `employee_assignment_b2_backup_20260728` 恢复 |

> ⚠️ **回滚表名注意**：生产包生成的 B-2 备份表是 `employee_assignment_b2_backup_20260728`（非 Runbook 内联写的 `..._prod`）。回滚时认这张真实表。

---

## 四、签字门控（每阶段执行完现场签字）

Preflight → B-0 → B-2+基线 → 历史回填 → 巡检启用 → E2E 验证 → 最终放行。

最终放行需 DBA、后端负责人、前端负责人、业务负责人四方签字。

---

## 五、已知不阻塞项（如实记录，不阻断放行）

- `violation_records` 中 **673/890（75.6%）** 无 `violator_name` 且无 `violator_id_card`，永久无法自动关联 `employee.id`，归业务补录流程。
- 历史回填生产执行前必须先 `--dry-run` 预估并经 DBA+业务签字（脚本生产硬拦截已部署：生产无 `--dry-run` 直接 `exit(1)`）。

---

**执行完并把所有签字栏填满后，整个"花名册导入后与其他板块无法交互"问题方在生产环境闭环。**
