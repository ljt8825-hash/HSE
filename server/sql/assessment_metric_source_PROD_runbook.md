# 生产执行清单 · 指标取数配置表建表（Runbook）

> 配套 SQL：`server/sql/assessment_metric_source_config.sql`
> 关联改造：`server/services/assessmentScoringEngine.js`（配置驱动 + `getMetricSources` 容错回退）
> 设计文档：`docs/指标取数配置化改造_设计与实施.md`

---

## 0. 红线与前置约束（先读）

1. **护栏**：项目红线第 1 条明文「DML/DDL 只准 `safety_dashboard_dev`，护栏硬拒生产库」。
   本清单是**给你/受控流程在 `safety_dashboard`（生产库）执行的作业指导**，**不是**让 AI 直跑生产库。
2. **实例说明**：生产库 `safety_dashboard` 与本机 dev 库 `safety_dashboard_dev` 同处本地 `127.0.0.1:5432` 实例。
   正因同实例、易误连，执行前**必须**手动 `SELECT current_database();` 核对，确认连的是 `safety_dashboard` 而非 dev 库。
3. **执行方式**：**不要用 `require('../config/db')` 的 node 脚本跑本 SQL**（脚本约定只允许连 dev）。
   请用 `psql` / PGAdmin / 其它 PG 客户端**直连生产库**执行本 SQL 文件。
4. **回滚必备**：执行前先按第 1 节做快照；回滚语句见第 4 节（一键 `DROP TABLE` 即可，引擎自动回退 legacy，无需改代码）。
5. **发布源纪律**：生产 5876 跑的是工作区代码（已含 `getMetricSources` 容错），**即便本表未建，重启 5876 也不会崩**（会回退 legacy）。建表只是让配置驱动路径生效。

---

## 1. 执行前快照（受控环境逐项核对）

在**生产库 `safety_dashboard`** 连接上依次执行，记录结果，确认无误再继续：

```sql
-- (1) 第一步也是最重要的一步：确认当前库
SELECT current_database();
-- 期望：safety_dashboard。若显示 safety_dashboard_dev 或别的，立即中断、重连。

-- (2) 确认表尚未存在（幂等 IF NOT EXISTS，但应先确认无残留旧结构）
SELECT to_regclass('public.hse_assessment_metric_source') AS tbl_exists;
-- 期望：NULL（不存在）。若已存在，先评估是否复用/重建，勿盲目重跑。

-- (3) 确认关联指标 code 存在（seed 引用的 4 个 metric_code）
SELECT metric_code FROM hse_assessment_metric
WHERE metric_code IN ('HSE-KPI-TRN-002','HSE-KPI-NEG-001','HSE-KPI-NEG-002','HSE-KPI-NEG-003')
  AND is_deleted = FALSE
ORDER BY metric_code;
-- 期望：4 行。若缺，先补 hse_assessment_metric 再 seed（否则扣分明细关联不到指标）。

-- (4) 确认业务来源表存在（seed 直查这两张）
SELECT to_regclass('public.training_records'), to_regclass('public.accidents');
-- 期望：两列均非 NULL。

-- (5) 记录当前活跃周期与目标数（建表前基线，供第 3 节对比）
SELECT id, cycle_name, start_time, end_time
FROM hse_assessment_cycle WHERE is_deleted = FALSE
ORDER BY start_time DESC LIMIT 3;
```

**快照结论留痕**（执行人填写）：
- `current_database()` = `safety_dashboard` □
- 表不存在 □
- 4 个 metric_code 齐全 □
- 业务表存在 □

---

## 2. 执行（建表 + 幂等 seed）

用 PG 客户端直连 `safety_dashboard` 执行 **`server/sql/assessment_metric_source_config.sql`** 全文。

- 建表 `CREATE TABLE IF NOT EXISTS hse_assessment_metric_source`（含 2 个索引）
- Seed 2 行：`training`（培训不合格，扣 3 分）、`accident`（事故否决，映射 3 个指标）
- 幂等：表已存在不报错；seed 用 `WHERE NOT EXISTS` 防重复

> ⚠️ 若客户端提示事务中断，确认中断点。本文件无事务包裹，单条语句失败不影响已成功的建表/索引。

---

## 3. 执行后校验

执行完成后，在同一连接上核对：

```sql
-- (1) 表与索引已建
SELECT to_regclass('public.hse_assessment_metric_source') AS tbl_exists;
SELECT indexname FROM pg_indexes
WHERE tablename = 'hse_assessment_metric_source';
-- 期望：表非 NULL；含 idx_metric_source_code、idx_metric_source_enabled。

-- (2) seed 行到位且启用
SELECT source_name, source_table, agg_type, fixed_score, is_veto, enabled
FROM hse_assessment_metric_source
WHERE is_deleted = FALSE ORDER BY sort_order;
-- 期望：training / accident 两行，enabled 均为 TRUE。

-- (3) 事故映射正确（JSONB）
SELECT source_name, veto_metric_map
FROM hse_assessment_metric_source WHERE source_name = 'accident';
-- 期望：{"交通事故":"HSE-KPI-NEG-002","环境污染事故":"HSE-KPI-NEG-003","default":"HSE-KPI-NEG-001"}

-- (4) 周期/目标数是否与第 1 节(5)一致（确认建表动作未误伤其它表）
SELECT count(*) FROM hse_assessment_target WHERE is_deleted = FALSE;
```

**校验结论留痕**：表已建 □ / seed 2 行启用 □ / 映射正确 □ / 其余表未变 □

> 配置驱动路径在**下一次评分同步（事件驱动）或手动「同步数据」**时自动生效，无需重启 5876。
> 已生成的既有扣分明细不受影响（它们是 `hse_assessment_deduction` 数据，不依赖本表存在）。

---

## 4. 回滚预案

如需撤销（如 seed 口径需调整、或配置路径出异常）：

```sql
-- 一键回滚：删除配置表。引擎检测到表不存在/无 enabled 行将自动回退 legacy，无需改代码。
DROP TABLE IF EXISTS hse_assessment_metric_source CASCADE;
-- 索引随表自动删除，无需单独 DROP。
```

**回滚后行为**：
- 引擎 `getMetricSources()` 捕获异常返回 `[]` → 上层回退原硬编码 `fillMissingDeductionsLegacy`。
- 评分同步、手动「同步数据」恢复为改造前语义，与生产 `.env` 的 `LEGACY_*` 开关行为一致。
- **已生成的 backfill 扣分明细（`hse_assessment_deduction` 中 `source_detail->>'backfill'='true'` 的行）不会被自动删除**——如需一并回退，需单独软删这些明细（按 `source_table` 区分 `training_records` / `accidents`），不在本回滚范围内。

---

## 5. 生产 env 开关说明（关键）

> ⚠️ 2026-10-13 A 方案口径清理后：事故否决已**彻底移出**配置表 / legacy 路径，由规则引擎 `accidentVetoAdapter`（METRIC_CODE=HSE-KPI-NEG-004）独家承担。本配置表**不再 seed accident 源**，引擎 `getMetricSources` 并对 `source_name='accident'` 硬排除。故"配置表 accident 行与规则引擎并存 → 同事故双扣"的陷阱已被根除。

- 既有生产库（建表早、已存在 accident 源的行）需另跑 `assessment_metric_source_remove_accident.sql` 将其 `is_deleted=TRUE`（幂等、纯 UPDATE，已随本改造入库）。未跑前，引擎硬排除仍保证不双扣。
- `training` 行：受 `LEGACY_TRAINING_FILL` 控制（生产该值应维持启用，配置路径即为新口径）。
- `LEGACY_ACCIDENT_VETO` 已无作用（accident 不在路径），保留 env 读取仅为向后兼容。

如需临时关闭某 source 验证：直接 `UPDATE hse_assessment_metric_source SET enabled=FALSE WHERE source_name='training';` 即可，无需改代码、无需回滚整表。

---

## 6. 生效与验证（建表后）

1. 触发一次评分同步（事件驱动自动；或管理端手动「同步数据」→ 走 `fillMissingDeductionsForTarget`）。
2. 核对：配置表启用行被读取、按 `source_table/source_id/metric_code/suggested_score` 生成扣分明细。
3. 与 dev 验证结论一致（见设计文档第 6/9 节）：培训 `TRN-002` 扣 3 分；事故按类型映射 `NEG-002/003/001` 且否决。
4. dev 库已通过零漂移 A/B 验证（`scripts/verify_metric_source_injected.cjs`），生产口径与 dev 同构。

---

## 7. 执行留痕模板（归档用）

| 项 | 内容 |
|---|---|
| 执行人 | |
| 执行时间 | |
| 连接方式 | psql / PGAdmin（直连 127.0.0.1:5432 / safety_dashboard） |
| `current_database()` 复核 | safety_dashboard □ |
| 第 1 节快照结论 | 通过 □ / 异常： |
| 第 3 节校验结论 | 通过 □ / 异常： |
| 回滚预留 | DROP TABLE 语句已知悉 □ |

---

## 8. dev 一键脚本（仅限 dev，生产仍按第 2 节人工直连）

配套脚本：`server/scripts/run_metric_source_ddl.cjs`（参数化、护栏锁死 dev）。

- 动作：`--action=all`（默认 snapshot→apply→verify）| `snapshot` | `apply [--no-seed]` | `verify` | `rollback`
- 护栏：白名单仅 `safety_dashboard_dev`；传 `--db=safety_dashboard`（生产）一律 exit 2 拒绝；require 前硬设 `DB_NAME` + 连接后断言 `current_database()`。
- 生产库建表**不通过该脚本**：本脚本硬拒，须按第 2 节用 psql/PGAdmin 直连 `safety_dashboard` 执行 `assessment_metric_source_config.sql`。
- dev 用法示例：
  ```bash
  cd server
  node scripts/run_metric_source_ddl.cjs                 # dev：快照+建表+seed+校验
  node scripts/run_metric_source_ddl.cjs --action=rollback   # dev：删配置表（回退 legacy）
  node scripts/run_metric_source_ddl.cjs --db=safety_dashboard   # 拒绝并 exit 2
  ```
- 验证状态：已用 dev 库实测 rollback→all 全流程（删表重建，CREATE TABLE + 2 seed 真实插入，verify 通过），并实测生产库参数被拒绝。
