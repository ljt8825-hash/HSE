# HSE-MOBILE-GRID-ARCH-03 / P2-B1-D / 05-C-A
# Production Stamping Apply 最终安全审计报告（只读）

- **阶段**：`PHASE_HSE-MOBILE-GRID-ARCH-03_P2-B1-D_05-C-A`
- **性质**：Production Apply 前只读最终安全审计（**本阶段未执行 --apply，未发生任何生产 DML**）
- **执行时间**：2026-09-13 14:31 – 14:44 CST
- **审计结论**：**PASS** —— 下一阶段 Production Stamping Apply（`--target=prod --watermark=0 --apply`）被证明**最多只能**将 327 条历史 NULL `attribution_status` 初始化为 `pending`（+`updated_at`），具备事务、并发保护、幂等保护，不会修改 grid / inspector / identity / sync_map / WPS 等任何其他数据。

---

## 1. Apply 安全审计结论

**PASS**（§三 12 项全成立；§六/§七/§八 全部具备；无任何 STOP 条件触发）。

## 2. 预计 UPDATE 数量

**327**（= 05-B Dry-Run 候选集 = 当前生产 scope 集合，两者逐 id 严格相等，零差异）。

## 3. 预计字段变化

| 字段 | 变化 |
|---|---|
| `attribution_status` | NULL → **pending**（仅此一处语义变化） |
| `updated_at` | NOW()（任务允许变化） |
| `grid_id` / `inspector_employee_id` / `source_channel` / `client_token` / `submission_fingerprint` | **0 变化**（SET 子句无任何赋值路径；且生产实测 327 条旧值全部唯一为 NULL） |
| `sync_hash` / sync_map 其余列 | **0 变化**（UPDATE 不触及 `grid_record_sync_map`） |

逐条 327 行的完整 old/new 证明表：`docs/HSE-MOBILE-GRID-ARCH-03-P2-B1-D-05-C-A-FIELD-IMPACT-MAPPING.md`（全部行为同一模式：仅 attribution_status NULL→pending，其余列 NULL→NULL）。

## 4. 幂等性（代码审计 + DEV 等价实证双证）

**代码层**：first apply 后 327 条 `attribution_status='pending'`；CANDIDATE_SQL 的 `WHERE ... attribution_status IS NULL` 将其全部排除 ⇒ 第二次运行 `candidate_count=0` ⇒ worker 在 `candidateIds.length===0` 时根本不进入 UPDATE 分支 ⇒ **second_apply_update_count = 0**。

**DEV 等价实证**（dev 库与生产同构：gir=2061/max=7192/scope=327/sync_map=2061/attribution 全 NULL）：

| 次数 | candidate_count | updated | pending 前→后 | passed |
|---|---|---|---|---|
| 第 1 次 `--apply` | 327 | **327** | 0 → 327 | true |
| 第 2 次 `--apply` | 0 | **0** | 327 → 327 | true |

apply 后 dev 实测：grid 非空仍=1734 / inspector 非空仍=10 / client_token·source_channel·submission_fingerprint 非空仍=0 —— **除 2 个 SET 字段外零字段受影响（实证）**。dev 已完整回滚（327 行 attribution_status + updated_at 双还原，scope=327、attribution 全 NULL=2061 复原）。

## 5. Production DML（本阶段）

**= 0**。`pg_stat_database`（safety_dashboard）tup_inserted / tup_updated / tup_deleted 三计数在 05-C-A 起点、中点、终点均为 **35831 / 73187 / 32249**（与 05-B 终点亦相等）；所有生产连接带 `default_transaction_read_only=on`。

## 6. WPS write（本阶段）

**= 0**。worker 全文件仅 `require(path/fs/dotenv/pg)`，无 fetch/axios/任何网络调用；enrichment 链亦无 WPS 调用；本阶段未运行任何 WPS 探针。

## 7. 修改文件

**产品代码：0**。本阶段仅新增：审计报告、字段影响映射文档、只读/验证脚本（`.workbuddy/tmp/`）、dev 证据 JSON（`server/scripts/output/_p2b1d_impl03_stamping_dev_apply.json`，旧文件不存在故无需备份）。`.env` mtime 未变；vite.config.ts 未触碰（现 mtime=13:57 系 05-B0 既授权改动）；5876/5881/Scheduler 均未重启。

---

## §三 官方 Worker 12 项审计明细（全部成立）

worker：`server/scripts/_p2b1d_impl03_stamping_worker.cjs`（mtime 2026-09-13 07:57:30，与 05-B Dry-Run 所用版本同一文件，未变）。

| # | 项 | 证据 | 结果 |
|---|---|---|---|
| 1 | candidate SQL 与 05-B 相同 | 05-B 直接引用本文件导出的 `CANDIDATE_SQL`（同一常量，watermark=0）；本阶段 327 条逐 id 集合比对 strictly_equal=true | ✅ |
| 2 | UPDATE WHERE 限定 scope | `WHERE id=ANY($1::bigint[]) AND attribution_status IS NULL AND inspector_employee_id IS NULL AND grid_id IS NULL AND EXISTS(sync_map.pg_record_id=gir.id)`（:52-58） | ✅ |
| 3 | 不更新 grid_id | SET 子句仅 `attribution_status='pending', updated_at=NOW()` | ✅ |
| 4 | 不更新 inspector_employee_id | 同上 | ✅ |
| 5 | 不更新 source_channel | 同上（列不在 SET） | ✅ |
| 6 | 不更新 client_token | 同上 | ✅ |
| 7 | 不更新 submission_fingerprint | 同上 | ✅ |
| 8 | 不更新 sync_hash | UPDATE 目标表=gir，不触及 `grid_record_sync_map` | ✅ |
| 9 | 不修改 sync_map | 全文件唯一写语句即 gir 的 UPDATE | ✅ |
| 10 | 不写 audit_record | grep 全文件无 audit_record | ✅ |
| 11 | 不写 wps_account_employee_map | grep 全文件无该表 | ✅ |
| 12 | 不访问 WPS 写接口 | 无任何网络调用（仅 path/fs/dotenv/pg） | ✅ |

补充守卫（代码内建）：生产 apply 需 `--target=prod --apply --confirm-production` 三件套，且阶段守卫 `productionApplyAllowed=false` 硬拒（:112-123）；连接后 `current_database()` 二次复核（G3）。

## §六 事务边界

**具备**：`BEGIN` → 条件 UPDATE → rowCount 复核（`updated > candidate` ⇒ ROLLBACK + 失败）→ `COMMIT`；异常路径 ROLLBACK（:178-195）。

**语义备注**（不构成 STOP）：若 SELECT 与 UPDATE 之间发生并发人工归属（目标行 `attribution_status` 已非 NULL），该行被 UPDATE WHERE 排除 → `updated < candidate`，worker 正常提交——这正是 §七 要求的「已归属行不被覆盖」的保护行为。

## §七 并发保护

**具备**：UPDATE 自身 WHERE 完整包含三条件 + sync_map EXISTS（与 candidate SELECT 同一守卫），不依赖应用层时序。05-B 与正式 apply 之间任何人工归属/外部变化的记录都**不可能被覆盖**；同时 apply 前基线已证明当前无任何 pending/attributed/manual_confirmed 行（均为 0），scope 集合与 05-B 严格相等。

## §八 重复执行安全

**已证明**（见 §4）：first=327 / **second=0**（代码审计 + DEV 实证一致）。

## §九/§十 合规声明

未修改身份链、未建 bridge、未匹配姓名/昵称、未动 gridScope/employee/grid_areas、**未修复 grid 126**、未动 WPS/前端/auth/JWT/scheduler/Pull Engine；未重启 5876/5881/Scheduler，未改 `.env`/vite.config.ts/生产 DB 结构/WPS 配置。附带观察：`sys_operation_log` 4586→4588（生产常规审计日志漂移，与本阶段无关，未触碰）。

## Apply 前生产基线快照（§四，2026-09-13 14:33）

gir=2061 / max=7192 / grid 非空=1734 / grid NULL=327 / inspector 非空=10 / attr NULL=2061 / pending=0 / attributed=0 / manual_confirmed=0 / client_token 非空=0 / source_channel 非空=0 / submission_fingerprint 非空=0 / sync_map=2061 / audit_record=0 / bridge=0。
**record_id 集合 = 05-B Dry-Run 327 条，strictly_equal=true（only_in_05B=[] / only_in_now=[]）**。完整集合见 `.workbuddy/tmp/p05ca_prod_baseline.json`。

---

```text
PHASE_HSE-MOBILE-GRID-ARCH-03_P2-B1-D_05-C-A_FINAL_APPLY_SAFETY_AUDIT: PASS
stamping production apply：本阶段未执行（生产 DML=0 / WPS write=0 / 产品代码修改=0）
等待下一阶段：05-C Production Stamping Apply（须 --confirm-production 且另行授权）
```
