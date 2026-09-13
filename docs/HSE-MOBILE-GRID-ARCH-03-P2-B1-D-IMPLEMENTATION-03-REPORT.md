# HSE-MOBILE-GRID-ARCH-03 · P2-B1-D · IMPLEMENTATION-03 报告

**阶段**：通道 B 待归属数据闭环 —— 第三阶段：STAGING / STAMPING WORKER 最小落地
**性质**：IMPLEMENTATION ONLY
**状态**：`PHASE_HSE-MOBILE-GRID-ARCH-03_P2-B1-D_IMPLEMENTATION_03_COMPLETED`
**时间**：2026-09-13（生产 dry-run 完成；生产 apply 未执行，见 §十五）
**项目目录**：`G:\hse-dashboard`

---

## 0. 摘要

- 新增**独立 stamping worker** `server/scripts/_p2b1d_impl03_stamping_worker.cjs`（新文件，未触碰任何冻结文件）。
- 来源识别**仅依赖正式 Pull 映射**：`EXISTS (SELECT 1 FROM grid_record_sync_map s WHERE s.pg_record_id = grid_inspection_records.id)`，即「该 gir 行确有 WPS Pull 回流产生的 sync_map 映射」。
- 实测确认：`grid_record_sync_map.pg_record_id` 是到 `grid_inspection_records.id` 的 1:1 映射；生产 2061 行全部有映射（conflict=0）。
- **DEV 验收 29/29 PASS**（dry-run → apply → repeat → 逐场景 A~J）。
- **生产 dry-run**：candidate=0、数据零变化；**生产 apply 未执行**（§十 STOP）。
- 冻结态、`.env`、PID 23396、05-H-0 常量全部未变。
- worker 唯一生产写操作 = `UPDATE ... SET attribution_status='pending'`；零 INSERT/DELETE/TRUNCATE/WPS write。

---

## 1. Preflight（生产基线，只读）

执行 `server/scripts/_p2b1d_impl03_introspect.cjs`（只读 SELECT）与 worker 生产 dry-run，确认：

| 项 | 值 |
|---|---|
| database | `safety_dashboard` @ 127.0.0.1:5432 |
| gir 行数 | 2061 |
| sync_map 行数 | 2061 |
| MAX(gir.id) | 7192 |
| conflict | 0 |
| grid_id 非空 | 1734 |
| inspector_employee_id 非空 | 10 |
| both-null | 327 |
| attribution_status 非 NULL | 0（全 NULL） |
| source_channel 非 NULL | 0 |
| client_token 非 NULL | 0 |
| sync_map.pg_record_id 全部有效指向 gir | 2061/2061 |

基线与设计预期完全一致，无异常。

---

## 2. 来源识别逻辑（§三/§四，最关键）

通道 B 判定的**唯一可信锚点**是正式同步链：
`WPS → wpsGridPullEngine → grid_inspection_records ↔ grid_record_sync_map`。

判定 SQL（已在 DEV 与生产验证）：
```sql
EXISTS (SELECT 1 FROM grid_record_sync_map s WHERE s.pg_record_id = grid_inspection_records.id)
```

**明确禁止的推断（均未采用）**：
- ❌ `id > 7192 → attribution_status='pending'`（id 仅是扫描边界 watermark，不是来源判定）
- ❌ `wps_record_id IS NOT NULL → source_channel='wps_form'`（§十二，worker 不写 source_channel）
- ❌ 「存在 WPS 字段 ⇒ 通道 B」（来源仅由 sync_map 映射证明）
- ❌ 使用 姓名/昵称/手机号/realName/巡查人员ID/creator 自动归属（§二-27~29，全部未写）

**为何可信**：`grid_record_sync_map` 是 Pull Engine 的回流映射表，其 `pg_record_id` 指向被拉入的 gir 行。有映射 = 该行确由 WPS Pull 产生，属通道 B。无映射（如纯 H5 通道 A 行）= 不进入待归属队列。

> 注：生产当前 2061 行**全部**有 sync_map 映射（05-H-0 为 WPS→Pull→PG 单向，历史数据皆经 Pull）。但 worker **不处理历史**：watermark=7192 把全部历史排除，只处理「结构上线后新增 + 有映射 + 无既有归属」的行。

---

## 3. Watermark 方案（§六）

- **显式优先**：`--watermark=N`。
- **状态文件兜底**：`server/scripts/output/_p2b1d_impl03_watermark_<dev|prod>.json`，记录 `last_watermark` / `last_run` / `run_id` / `updated_count`（按 target 隔离，不跨库污染）。
- **默认**：无显式值且无 state 时取当前 `MAX(id)`（可审计，打印警告，非写死）。
- **不写死 7192**：每次运行打印所用 watermark；生产首次建议显式 `--watermark=7192`（= 结构上线高水位）。
- **幂等**：候选取 `attribution_status IS NULL` 守卫；重复运行不会重复改已 pending 行。
- **不建第二套同步状态体系**：state 仅是 worker 自身运行元数据 JSON，非业务同步系统。
- **未来正式化**：建议将 watermark 并入既有调度/作业元数据表（如 `sys_operation_log` 的 run 维度），或引入轻量 `etl_watermark` 表；本阶段不强行新增基础设施（符合 §六允许项）。

---

## 4. Worker 文件

- `server/scripts/_p2b1d_impl03_stamping_worker.cjs`（核心；导出 `runWorker`，可 CLI / 被测试 require）
- `server/scripts/_p2b1d_impl03_devtest.cjs`（DEV 全场景验收，含隔离数据插入与清理）
- `server/scripts/_p2b1d_impl03_introspect.cjs`（只读来源识别调查）
- `server/scripts/_p2b1d_impl03_probe_update.cjs`（调试用，验证 UPDATE 语句，已通过）

**Worker 护栏**：
- 默认 dry-run；`--apply` 才真实 UPDATE。
- 生产 apply 需 `--target=prod --apply --confirm-production`（三件套），且 `STAGE_GUARDS.productionApplyAllowed=false` 当前否决（§十）。
- 连接后二次 `SELECT current_database()` 复核。
- 实际 UPDATE 数 > dry-run candidate ⇒ ROLLBACK + 失败。
- 事务包裹：`BEGIN → 条件 UPDATE → rowCount 复核 → COMMIT`（异常 `ROLLBACK`）。

---

## 5. Dry-run 机制

- 默认行为 = 只读 SELECT 候选（打印 database/host/port/candidate/watermark/attribution 前后统计 + channel-B 条件），不执行任何 UPDATE。
- DEV 与 PROD 共用同一 `CANDIDATE_SQL` / `UPDATE_SQL`，保证 dry-run 与实际 apply 语义一致。

---

## 6. DEV 测试（§十一 A~J，29/29 PASS）

环境 `safety_dashboard_dev`，基线同生产（gir=2061 / MAX(id)=7192 / both-null=327）。插入 10 条隔离测试行（MARK=`P2B1D-IMPL03-TEST`）+ 8 条 sync_map 映射，覆盖：

| 场景 | 构造 | 期望 | 结果 |
|---|---|---|---|
| A 正常候选 | WPS 映射 + both-null + NULL | → pending | PASS（A1/A2） |
| B 幂等 | 重复运行 | 第二次 UPDATE=0 | PASS |
| C 已归属保护 | attribution='attributed' | 不改 | PASS |
| D 非 NULL 状态保护 | attribution='manual_confirmed' | 不改 | PASS |
| E 非 WPS 来源 | 无 sync_map | 保持 NULL | PASS |
| F 历史保护 | id≤7192 正式历史 | 0 行被标 | PASS（2061 历史不动） |
| G 来源不确定 | 无 sync_map | 保持 NULL | PASS |
| H 并发 | 条件 UPDATE + 幂等守卫 | 二次 UPDATE=0 | PASS（rowCount=0） |
| I fingerprint | 同 fingerprint 两行 | 均 pending（不合并去重） | PASS |
| J 身份 | inspector/grid 非空 | 保持 NULL；不写归属列 | PASS |

执行序列：`DEV dry-run`（candidate=4）→ `DEV apply`（updated=4）→ `DEV repeat apply`（updated=0）→ 逐场景断言 → 精确清理（residual=0，基线还原 2061/7192/327/0）。

证据：`server/scripts/output/_p2b1d_impl03_devtest_safety_dashboard_dev.json`。

---

## 7. 幂等测试

- 首次 apply：candidate=4，updated=4，pending 前 0 → 后 4。
- 二次 apply：candidate=0，updated=0（候选因 `attribution_status IS NULL` 守卫已为空）。
- 证明重复执行不产生重复状态变化。

---

## 8. 并发测试（§十一 H）

- worker 的 UPDATE 自带 `attribution_status IS NULL AND inspector_employee_id IS NULL AND grid_id IS NULL AND EXISTS(sync_map)` 条件守卫，且候选由 `id=ANY(候选数组)` 限定上界。
- 模拟第二名并发 worker：对已 pending 行再跑一次条件 UPDATE，rowCount=**0**（无重复状态变化）。
- 即使两事务竞态，第二名要么先于第一名（自己标），要么后于第一名（0 行），最终一致，无半批次不可解释态。

---

## 9. 历史保护测试（§十一 F）

- watermark=7192 把全部历史（id≤7192，共 2061 行）排除在候选之外。
- 断言：`id <= 7192 AND attribution_status IS NOT NULL` = 0；历史行总数仍 2061。
- 满足 §十九「不得把历史 2061 条全部处理」。

---

## 10. 身份保护测试（§十一 J，§二-27~35）

- worker **只写** `attribution_status`（+ `updated_at` 审计时间戳），**绝不写** `inspector_employee_id` / `grid_id` / `source_channel` / `client_token` / `sync_hash`。
- 断言：A1 的 inspector/grid 仍 NULL；J1/J2（inspector 或 grid 非空）保持 NULL 且不进队列；A1/J1 的 `source_channel` 保持 NULL（未批量写 `wps_form`）。
- 不使用 creator / 姓名 / 昵称 / 手机号 / realName / 巡查人员ID 做任何归属。

---

## 11. 生产 Dry-run（§十）

命令：
```
node server/scripts/_p2b1d_impl03_stamping_worker.cjs --target=prod --watermark=7192 --dry-run
```
结果：
- database = `safety_dashboard`；mode = DRY-RUN；watermark = 7192（live MAX(id)=7192）。
- **candidate_count = 0**（当前无超过水位的新记录）。
- attribution 前：`{NULL:2061}` / pending=0 / total=2061。
- 未执行任何 UPDATE。

证据：`server/scripts/output/_p2b1d_impl03_stamping_prod_dryrun.json`。

> 来源识别**充分**（已用 sync_map 映射证明通道 B 判定有效，对照 candidate_no_watermark=327）；生产 candidate=0 仅因 watermark 排除全部历史（无新记录），**非**「SOURCE IDENTIFICATION NOT SUFFICIENT」。

---

## 12. 生产数据零变化

- 生产 dry-run 仅 SELECT，无任何 DML。
- 当前生产：gir=2061 / sync_map=2061 / MAX(id)=7192 / attribution 全 NULL / pending=0。
- 未发生 INSERT / UPDATE / DELETE / TRUNCATE。

---

## 13. 冻结回归（§十八）

| 文件 | mtime（前态=后态） | 状态 |
|---|---|---|
| server/.env | 2026-09-11 22:22:50 | 未变 |
| server/services/wpsGridPullEngine.js | 2026-09-11 08:39:40 | 未变 |
| server/services/wps/wpsFieldMap.js | 2026-09-11 08:14:02 | 未变 |
| server/services/wps/gridInspectionRepository.js | 2026-09-08 20:29:23 | 未变 |
| server/services/authenticatedEmployeeResolver.js | 2026-09-10 14:49:40 | 未变 |
| server/services/gridScope.js | 2026-09-10 19:19:23 | 未变 |
| server/routes/site-mgmt.js | 2026-09-12 16:41:31 | 未变 |
| server/services/wpsGridSyncScheduler.js | 2026-09-11 16:29:00 | 未变 |
| server/app.js | 2026-09-09 22:38:15 | 未变 |

- 生产进程：`5876 → PID 23396`（未停未重启）。
- 05-H-0 常量：`SYNC_PROJECTION_ORDER`(:107) / `SYNC_HASH_COLUMNS`(:118) / `PROTECTED_COLUMNS`(:127 = `['grid_id','inspector_employee_id']`) 全部未变。
- `.env` 开关：`WPS_GRID_DATA_SOURCE=false` / `WPS_GRID_SYNC=true` / `SCHEDULER_ENABLED=true` 未变。

---

## 14. WPS write = 0

- worker 不调用任何 WPS 端点，不写 WPS，不创建 WPS Form，不建立 WPS Creator→employee 映射。WPS 侧零交互。

---

## 15. Production Apply = NOT EXECUTED

- 按 §十：生产 dry-run 通过后**立即 STOP**，未自动执行 production apply。
- `STAGE_GUARDS.productionApplyAllowed = false`（阶段守卫），即使误给 `--apply --confirm-production` 也会被否决。
- 报告明确：`PRODUCTION APPLY NOT EXECUTED`。
- 后续若需生产 apply，须另行显式授权（解冻 `productionApplyAllowed` 常量 + `--target=prod --apply --confirm-production`），且建议先确认人工归属闭环（P2/P3 前置）是否就绪。

---

## 16. 未完成事项（本阶段边界内禁止实现，均如实说明）

1. **生产 apply 未执行**：worker 已构建并 DEV 全验证，但生产标记需单独授权。
2. **stamping worker 未接入 scheduler**：保持独立手工脚本，不自动启动（§八）。
3. **人工归属闭环未实现**（本阶段禁止）：GET pending / POST attribution / DELETE revoke API、前端页面、菜单——均**未创建**。
4. **Attachment**：未实现（§十三），与 attribution 独立。
5. **client_token 生成器**：未创建（全仓仍无生产代码生成 client_token）。
6. **P2/P3 前置仍未决**：独立 stamping worker 接受度（P2）；`admin.employee_id IS NULL` 运维操作人（P3）——需业务侧拍板。

---

## 17. 下一阶段建议

- **P2-B1-D-IMPLEMENTATION-04（待授权）**：在 P2/P3 前置明确后，执行生产 apply（首次 `--watermark=7192`），并建立独立 pending 查询端点（不改冻结 `site-mgmt.js`，新 router 挂载另开阶段）。
- **人工归属闭环**：认领 / 撤销 API + 前端（需 P3 操作人补齐 + 审计原子性方案）。
- **P2-C / P2-D**：按 ARCH-03 决策谱系，条件进入（P2-C 有条件；P2-D 不可进入）。

---

## 验收对照（§二十）

| 项 | 结果 |
|---|---|
| A worker 独立存在 | PASS |
| B 默认 dry-run | PASS |
| C production hard guard | PASS |
| D current_database 二次核验 | PASS |
| E 来源识别明确（sync_map.pg_record_id） | PASS |
| F 不使用 id>7192 推断 WPS | PASS（id 仅 watermark 边界） |
| G 不使用 wps_record_id 推断 wps_form | PASS |
| H pending 条件完整 | PASS |
| I NULL→pending 幂等 | PASS |
| J 已归属数据不变 | PASS |
| K 非 WPS 数据不变 | PASS |
| L 历史数据不变 | PASS |
| M 不写 inspector_employee_id | PASS |
| N 不写 grid_id | PASS |
| O 不写 sync_hash | PASS |
| P 不写 WPS | PASS |
| Q 不接 scheduler | PASS |
| R DEV tests 全通过 | PASS（29/29） |
| S production dry-run 数据零变化 | PASS |
| T freeze regression PASS | PASS |
| U production APPLY = NOT EXECUTED | PASS |

**结论**：`PHASE_HSE-MOBILE-GRID-ARCH-03_P2-B1-D_IMPLEMENTATION_03_COMPLETED`，立即 STOP（§二十三）。未进入 P2-B1-D-IMPLEMENTATION-04 / P2-C / P2-D，未自动执行 production apply，等待下一条明确指令。
