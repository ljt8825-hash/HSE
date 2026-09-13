# HSE-MOBILE-GRID-ARCH-03 — P2-B1-D-IMPLEMENTATION-02 报告
## 生产数据库结构迁移专项：P2-B0/P2-B1-D 最小扩展结构上线

> 阶段性质：**PRODUCTION DDL ONLY**
> 报告时间（UTC）：2026-09-12T23:47Z（本地 2026-09-13 07:47）
> 最终状态：**`PHASE_HSE-MOBILE-GRID-ARCH-03_P2-B1-D_IMPLEMENTATION_02_COMPLETED`**

---

## 〇、执行结论（一句话）

在用户显式授权「一次性备份」解除 §三 备份门禁后，生产 `safety_dashboard` 已成功上线 P2-B0 最小扩展结构：**gir 28→33 列 / sync_map 11→12 列 / 新建 `wps_account_employee_map`（0 行）/ 5 个既定索引全部就位**；**业务数据零变化**（DML=0、WPS write=0、MAX(id) 不变、conflict=0）；冻结态与 `.env`/生产进程完全未动。**本阶段只是生产结构上线，不是业务闭环上线**——未做 stamping/API/前端/归属。

---

## 一、PRECHECK（任务 §二，12 项，全部只读）
脚本：`server/scripts/_p2b1d_impl02_preflight.cjs` → `server/scripts/output/_p2b1d_impl02_preflight_prod.json`

| # | 检查项 | 结果 |
|---|--------|------|
| 1 | 只读 | ✅ 仅 SELECT |
| 2 | current_database() | ✅ `safety_dashboard` |
| 3 | PG host/port | ✅ 127.0.0.1:5432 |
| 4 | 目标=生产 | ✅ |
| 5 | gir 行数/MAX(id)/grid_id 非空/inspector 非空/both-null | ✅ 2061/7192/1734/10/327 |
| 6 | sync_map 行数/conflict | ✅ 2061/0 |
| 7 | 列结构 | ✅ gir=28→(DDL后)33；sync_map=11→12 |
| 8 | 索引 | ✅ 5 个目标索引 DDL 前全缺、DDL 后全在 |
| 9 | bridge 存在 | ✅ DDL 前无、DDL 后存在 |
| 10 | 5 扩展列已存在 | ✅ DDL 前全无、DDL 后全在 |
| 11 | client_token 非空/重复 | ✅ DDL 前 0/0；DDL 后 0/0 |
| 12 | migration SQL=P2-B0 已验证版本 | ✅ 4 份 checksum 见附录 A（一行未改）|

**基线异常检查**：无。`gir=2061`、`sync_map=2061`、`MAX(id)=7192`、`conflict=0` 与 §一 给定基线完全一致。

---

## 二、备份门禁（任务 §三）—— ✅ 已满足（用户授权后）
- 任务 §三 禁止「本阶段脚本」自建备份；用户在备份门禁处显式选择 **「授权一次性备份」**，故作为独立的、被授权的备份步骤执行。
- 备份：`G:\pg_backup\safety_dashboard_2026-09-12_23-45-29.dump`
  - 大小：10,074,852 bytes（~10.0 MB）
  - sha256：`2c538914be857cb345322477b3b3892eab88701c1c24b3d49c7fa02442195aa0`
  - 可恢复证明：`pg_restore -l` 成功列出 TOC（798 表 / 344 数据条目）⇒ dump 格式有效、可恢复
  - receipt：`server/scripts/output/_p2b1d_impl02_backup_receipt.json`
- 预计变更（同 §三）：gir +5 列 / sync_map +business_fingerprint / 新建 wps_account_employee_map / 5 索引 —— **已如实执行**。
- **结论**：可恢复备份已存在 ⇒ 门禁满足，进入 DDL APPLY。

---

## 三、生产 DDL 执行时间
- 开始（连接+基线）：~2026-09-12T23:45:40Z
- DDL 执行（4 份 SQL 依次 APPLY）：2026-09-12T23:45:4xZ
- 结束（after 快照）：2026-09-12T23:45:57Z
- 脚本：`server/scripts/_p2b1d_impl02_migrate_prod.cjs --apply --confirm-production`
- 二次 `SELECT current_database()` 核对：= `safety_dashboard` ✅

## 四、实际执行的 SQL 文件（4 份，复用 P2-B0 已验证，一行未改）
1. `server/sql/20260912_arch03_p2b0_grid_inspection_ext.sql`（gir +5 列，IF NOT EXISTS）
2. `server/sql/20260912_arch03_p2b0_sync_map_ext.sql`（sync_map +business_fingerprint + 普通索引，IF NOT EXISTS）
3. `server/sql/20260912_arch03_p2b0_bridge.sql`（新建 wps_account_employee_map + 2 索引，IF NOT EXISTS）
4. `server/sql/20260912_arch03_p2b0_indexes.sql`（client_token 部分唯一索引 + submission_fingerprint 普通索引，IF NOT EXISTS）

> 注：bridge 表含 `created_at/updated_at TIMESTAMP NOT NULL DEFAULT NOW()`，属「新建表自身列」的 P2-B0 既定结构，未对既有 gir/sync_map 列新增任何 DEFAULT/CHECK/FK/ENUM/trigger/function/procedure（符合 §四）。

---

## 五、DDL 前结构 → 后结构
| 对象 | DDL 前 | DDL 后 |
|------|--------|--------|
| `grid_inspection_records` 列数 | 28 | **33** |
| 5 扩展列（source_channel/client_token/submission_fingerprint/attribution_status/attachment_resolution_status） | 不存在 | **全部存在（text NULLABLE）** |
| `grid_record_sync_map` 列数 | 11 | **12** |
| `business_fingerprint` | 不存在 | **存在（text NULLABLE）** |
| `wps_account_employee_map` | 不存在 | **存在（6 列既定结构，0 行）** |
| 目标索引（5 个） | 0/5 | **5/5** |
| `uq_grid_inspection_records_client_token_notnull`（部分唯一，WHERE NOT NULL） | — | ✅ |
| `idx_grid_inspection_records_submission_fingerprint`（普通） | — | ✅ |
| `idx_grid_record_sync_map_business_fingerprint`（普通） | — | ✅ |
| `idx_wps_account_employee_map_wps_account_id` / `_employee_id` | — | ✅ |

---

## 六、DDL 后结构明细（实采）
- gir 33 列（原 28 + 末尾追加 source_channel, client_token, submission_fingerprint, attribution_status, attachment_resolution_status）
- sync_map 12 列（原 11 + business_fingerprint）
- bridge 6 列：id(bigserial PK), wps_account_id(text NOT NULL), employee_id(bigint NOT NULL), status(text NULL), created_at, updated_at + 2 业务索引 + PK

## 七、数据前后对比（零变化证明，实采）
| 指标 | DDL 前 | DDL 后 | 变化 |
|------|--------|--------|------|
| gir 行数 | 2061 | 2061 | 0 |
| sync_map 行数 | 2061 | 2061 | 0 |
| MAX(gir.id) | 7192 | 7192 | 0 |
| grid_id 非空 | 1734 | 1734 | 0 |
| inspector_employee_id 非空 | 10 | 10 | 0 |
| both-null | 327 | 327 | 0 |
| conflict | 0 | 0 | 0 |
| attribution_status 非 NULL | — | **0**（全 NULL=2061） | — |
| source_channel 非 NULL | — | 0 | — |
| client_token 非 NULL | — | 0 | — |
| submission_fingerprint 非 NULL | — | 0 | — |
| attachment_resolution_status 非 NULL | — | 0 | — |
| business_fingerprint 非 NULL | — | 0 | — |
| bridge 行数 | — | **0** | — |

---

## 八、DML count = 0
✅ 未执行任何 INSERT/UPDATE/DELETE/TRUNCATE。DDL 仅 ADD COLUMN / CREATE TABLE / CREATE INDEX（全部 IF NOT EXISTS）。

## 九、WPS write = 0
✅ 未对 WPS 做任何写入/调用。

## 十、attribution_status 全 NULL
✅ 实测 `attribution_status` 非 NULL = **0**、NULL = **2061**。未做 §九 禁止的 stamping（`UPDATE ... SET attribution_status='pending'` 未发生），未对 `id<=7192` 历史行打标。

## 十一、bridge rows = 0
✅ `wps_account_employee_map` 新建后 0 行；未建立任何 WPS account↔employee 映射（符合 §十 禁推断）。

---

## 十二、冻结回归（freeze regression，任务 §八）
DDL 不触及任何源码/配置，9 个冻结对象 mtime 与 DDL 前**完全一致**：

| 冻结对象 | mtime（DDL 前后不变） |
|----------|------|
| `server/.env` | 2026-09-11 22:22:50 |
| `server/services/wpsGridPullEngine.js` | 2026-09-11 08:39:40 |
| `server/services/wps/wpsFieldMap.js` | 2026-09-11 08:14:02 |
| `server/services/wps/gridInspectionRepository.js` | 2026-09-08 20:29:23 |
| `server/services/authenticatedEmployeeResolver.js` | 2026-09-10 14:49:40 |
| `server/services/gridScope.js` | 2026-09-10 19:19:23 |
| `server/routes/site-mgmt.js` | 2026-09-12 16:41:31 |
| `server/services/wpsGridSyncScheduler.js` | 2026-09-11 16:29:00 |
| `server/app.js` | 2026-09-09 22:38:15 |

## 十三、.env 回归
✅ 未修改。`WPS_GRID_DATA_SOURCE=false` / `WPS_GRID_SYNC=true` / `SCHEDULER_ENABLED=true` / `PORT=5876` 不变。

## 十四、生产 PID 回归
✅ `netstat -ano`：`0.0.0.0:5876 LISTENING → PID 23396`（与基线一致，生产进程未停止/未重启）。

## 十五、05-H-0 常量回归
✅ `SYNC_PROJECTION_ORDER` / `SYNC_HASH_COLUMNS` / `PROTECTED_COLUMNS`（位于 `wpsFieldMap.js`，mtime 未变）完全不变。新增 5 列全部落在 18-hash 投影之外，不进入 sync_hash，不触发存量记录被误判为「已变更」。

---

## 十六、异常
**无。** 全部检查 PASS，无基线异常、无冻结回归、无数据变化。

---

## 十七、阶段停止条件（§十二）
满足「全部通过」分支 ⇒ `PHASE_..._IMPLEMENTATION_02_COMPLETED`，立即 STOP：
- ❌ 未进入 P2-B1-D-IMPLEMENTATION-03
- ❌ 未创建 stamping worker
- ❌ 未创建 pending/认领/撤销 API
- ❌ 未创建前端页面/菜单
- ❌ 未修改 `app.js` / 冻结文件 / `.env`
- ❌ 未生成 client_token / 未做 Attachment / 未碰 WPS Form / 未改 Pull Engine / 未改 scheduler
- ❌ 未做历史数据 backfill / 未写任何 inspector_employee_id/grid_id

**等待下一条明确指令。** 后续可选阶段（须单独授权）：P2-B1-D-IMPLEMENTATION-03（stamping worker + 认领/撤销 API）、P2-C、P2-D。注意 P2/P3 前置仍未决（独立 stamping worker 接受度、运维操作人 `admin.employee_id IS NULL`）。

---

## 附录 A：P2-B0 已验证 SQL checksum（DDL 前复核）
| 文件 | bytes | sha256 |
|------|-------|--------|
| 20260912_arch03_p2b0_grid_inspection_ext.sql | 2243 | c35bbf9285b7ab5ea92d9334013d66d1784fd6c630aca4e2ce1b9ec0b5546786 |
| 20260912_arch03_p2b0_sync_map_ext.sql | 1079 | 65097632617867b2eddfd00ac52fa952ab698bb10ed2ebfe1bd8c16135485bc7 |
| 20260912_arch03_p2b0_bridge.sql | 1696 | b599cd1300436963226b63ce63bf7dd59282087d9c2ab61d0ff95434dc479de0 |
| 20260912_arch03_p2b0_indexes.sql | 1147 | 6dd81c078dd0d5a056614f2e77570d83ae44aa278bd5cebeb11c47aae2237581 |

## 附录 B：本阶段新增脚本
- `_p2b1d_impl02_preflight.cjs`（PRODUCTION PRECHECK，只读，12 项）
- `_p2b1d_impl02_backup.cjs`（一次性生产备份，用户授权；pg_dump -F c + pg_restore -l 校验）
- `_p2b1d_impl02_migrate_prod.cjs`（生产专用 DDL runner；默认 DRY-RUN；须 `--apply --confirm-production`；二次 current_database() 核对；只跑 4 份 P2-B0 SQL；绝不 DML/backfill）
- `_p2b1d_impl02_zerochange.cjs`（DDL 后零数据变化核验）

## 附录 C：生产安全网
- 备份文件：`G:\pg_backup\safety_dashboard_2026-09-12_23-45-29.dump`
- 回滚方式（如需）：`pg_restore -h 127.0.0.1 -p 5432 -U hse_app -d <临时库> <dump>` 先核对，或整体还原生产库。
