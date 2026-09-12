# HSE-MOBILE-GRID-ARCH-03-P2-B0-CONTINUATION-REPORT

> 阶段：`ARCH-03 → P2-B0-CONTINUE`（补齐 P2-B0 最小基础设施：sync_map 扩展 + 身份桥接 + fail-safe 骨架）
> 性质：`IMPLEMENTATION + MIGRATION DRY-RUN + FAIL-SAFE FOUNDATION`
> 目标库（唯一写目标）：`safety_dashboard_dev`（本机 PG 隔离克隆，2061 行，02-B 同源基线）
> 最终状态机：**`PHASE_HSE_MOBILE_GRID_ARCH_03_P2_B0_COMPLETED`**
> 前向信号（非自动进入）：`READY_FOR_P2-B1`

---

## 1. 本回合实际修改文件

| 文件 | 类型 | 说明 |
|---|---|---|
| `server/sql/20260912_arch03_p2b0_sync_map_ext.sql` | 新增 | sync_map 加 `business_fingerprint` + 非唯一索引 |
| `server/sql/20260912_arch03_p2b0_bridge.sql` | 新增 | 建 `wps_account_employee_map` 空表 + 两索引 |
| `server/sql/20260912_arch03_p2b0_indexes.sql` | 新增 | `client_token` 部分 UNIQUE 索引 + `submission_fingerprint` 普通索引 |
| `server/scripts/_p2b0_continue_migrate.cjs` | 新增 | 受护栏迁移 runner（DRY-RUN 默认 / `--apply` / 硬拒生产 / client_token 重复 STOP） |
| `server/scripts/_p2b0_continue_introspect.cjs` | 新增 | 只读 PRECHECK（prod+dev 双库 schema 核查） |
| `server/scripts/_p2b0_continue_test.cjs` | 新增 | 测试 A–H + 漂移清理 |
| `server/services/wps/gridEnrichmentService.js` | 新增 | Fail-safe Post-Insert Enrichment 最小骨架（纯函数，不触网/不触库） |

**未修改（冻结层，全程未触碰）**：`wpsFieldMap.js`、`wpsGridPullEngine.js`、`gridInspectionRepository.js`、`authenticatedEmployeeResolver.js`、`gridScope.js`、`site-mgmt.js`、`config/db.js`、`server/.env`。

---

## 2. 实际执行 SQL

仅对 `safety_dashboard_dev` 执行（runner `--apply`）。三份文件内容即实际 DDL：

1. `20260912_arch03_p2b0_sync_map_ext.sql`
   ```sql
   ALTER TABLE grid_record_sync_map ADD COLUMN IF NOT EXISTS business_fingerprint text NULL;
   CREATE INDEX IF NOT EXISTS idx_grid_record_sync_map_business_fingerprint
     ON grid_record_sync_map (business_fingerprint);
   ```
2. `20260912_arch03_p2b0_bridge.sql`
   ```sql
   CREATE TABLE IF NOT EXISTS wps_account_employee_map (
     id bigserial PRIMARY KEY,
     wps_account_id text NOT NULL,
     employee_id bigint NOT NULL,
     status text NULL,
     created_at TIMESTAMP NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMP NOT NULL DEFAULT NOW()
   );
   CREATE INDEX IF NOT EXISTS idx_wps_account_employee_map_wps_account_id ON wps_account_employee_map (wps_account_id);
   CREATE INDEX IF NOT EXISTS idx_wps_account_employee_map_employee_id ON wps_account_employee_map (employee_id);
   ```
3. `20260912_arch03_p2b0_indexes.sql`
   ```sql
   CREATE UNIQUE INDEX IF NOT EXISTS uq_grid_inspection_records_client_token_notnull
     ON grid_inspection_records (client_token) WHERE client_token IS NOT NULL;
   CREATE INDEX IF NOT EXISTS idx_grid_inspection_records_submission_fingerprint
     ON grid_inspection_records (submission_fingerprint);
   ```

测试阶段曾在 dev 写入漂移行（`client_token='P2B0_TEST_TOKEN_9F3A'` / `submission_fingerprint='P2B0_TEST_FP_7C2D'`），**均已 DELETE 清理**（见 §10）。

---

## 3. Dev DB schema before / after

| 对象 | Before（P2-B0-CONT 起点） | After（本回合结束） |
|---|---|---|
| `grid_inspection_records` | 33 列（含 P2-B0 的 5 个新列） | 33 列（本回合未改动 gir，5 列已就位） |
| `grid_record_sync_map` | 11 列（无 `business_fingerprint`） | **12 列（+`business_fingerprint`）** |
| `wps_account_employee_map` | 不存在 | **存在（空表，6 列）** |
| `client_token` 部分唯一索引 | 无 | **有**（`WHERE client_token IS NOT NULL`） |
| `submission_fingerprint` 索引 | 无 | **有** |

> 注：gir 的 5 个 nullable 扩展列（`source_channel`/`client_token`/`submission_fingerprint`/`attribution_status`/`attachment_resolution_status`）由**上一回合 P2-B0** 落地，本回合仅补齐 sync_map / 桥接表 / 索引 / 骨架，未重复改动 gir。

---

## 4. sync_map before / after

- Before：11 列 → `id, pg_record_id, wps_record_id, wps_file_id, wps_sheet_id, last_sync_at, pg_updated_at, wps_updated_at, sync_hash, conflict, created_at`
- After：12 列 → 上述 11 列 **+ `business_fingerprint text NULL`**
- `UNIQUE(wps_record_id, wps_file_id)` **保持 intact**（未改动）。
- `business_fingerprint` **未**纳入任何 WPS 18 列 hash（仅存于 sync_map，与 `SYNC_PROJECTION_ORDER` 完全解耦）。

---

## 5. bridge table schema

`wps_account_employee_map`（当前 0 行）：

| 列 | 类型 | NULL | 说明 |
|---|---|---|---|
| `id` | bigint (bigserial) | NO | PK |
| `wps_account_id` | text | NO | WPS 稳定账号 ID（如 Creator 系统标识），**非 employee.id** |
| `employee_id` | bigint | NO | 指向 `employee.id`（与 `employee.id`/`inspector_employee_id` 同为 bigint） |
| `status` | text | YES | 预留（pending/linked/disabled） |
| `created_at` | timestamp | NO | DEFAULT NOW() |
| `updated_at` | timestamp | NO | DEFAULT NOW() |

设计约束落实：① 仅 dev 创建；② **不自动从姓名/昵称/手机号/personnel_name 建映射**；③ **未插入任何推测映射（0 行）**；④ employee_id 与 employee.id 类型一致（bigint）；⑤ **未新增 FK**（项目当前无类似约束，保持最小变更）；⑥ `wps_account_id` 与 `employee.id` 明确区分。

---

## 6. client_token index

`uq_grid_inspection_records_client_token_notnull` —— **部分 UNIQUE 索引**，`ON grid_inspection_records (client_token) WHERE client_token IS NOT NULL`。

- 前提校验（runner 内置护栏）：迁移前查询 dev 中 `client_token` 非空重复组 = **0** → 安全建索。
- 语义：client_token 是明确的客户端提交幂等键（仅 Channel A 提供），WPS 通道保持 NULL 不受影响。
- 测试 D 已实证：同一非空 token 第二次 INSERT 被 23505 拒绝。
- 若未来 dev 出现非空重复，runner 将 **STOP（exit 4）**，绝不强行建索。

---

## 7. fingerprint index

`idx_grid_inspection_records_submission_fingerprint` —— **普通（非唯一）索引**。

- 仅加速按指纹查询；**禁止**自动生成/回填/删除/覆盖/合并/拒绝重复。
- 测试 E 已实证：同一 `submission_fingerprint` 可存在多条记录（added=2）。
- `business_fingerprint`（sync_map）同理，仅作「重复候选」查询键，非唯一。

---

## 8. fail-safe service

`server/services/wps/gridEnrichmentService.js`（新建，纯模块，无副作用、无网络、无 DB）：

- `resolveAttributionStatus(record)`：仅有可信 `inspector_employee_id` → `attributed`；否则 `pending`（**无信息只算 pending，绝不当 failed，绝不用 personnel_name 猜测**）。
- `resolveAttachmentStatus(record)`：PG 已有合法 http(s) URL 镜像 → `resolved`；否则 `pending`（**绝不假造 URL、绝不把 Attachment ID 当 URL**）。
- `computeSubmissionFingerprint(record)`：仅当 `inspector_employee_id`/`inspection_date`/`area_team`/`violation_behavior`/`violator_name` 全部可信齐全才 SHA-256；否则 **NULL**（禁止用姓名替代 employee_id）。
- `detectDuplicateCandidate(...)`：返回 `{ isCandidate:false, action:'candidate_only' }` —— **命中仅作候选，不删除/不覆盖/不拒绝**；真实查询延后 P2-B1。
- `enrichAfterInsert(record)`：组合入口，**try/catch fail-safe** —— 任一子步骤异常回落 pending/NULL/candidate-only，绝不抛错中断主链。

**关键**：本服务**未被 Pull Engine 调用**（§十二 硬要求），也未 import 任何 WPS 客户端（grep 验证：无 `wpsClient`/`fetch(`/`axios`/`http(s).request`/`kso.cn`/`wps.cn`/`/openapi`）。

---

## 9. 测试结果（§十四 A–H，26/26 PASS）

| 测试 | 结果 |
|---|---|
| A. dev gir = 33 列，5 新列齐全 | PASS (33) |
| B. sync_map 含 `business_fingerprint`；`UNIQUE(wps_record_id,wps_file_id)` 仍在 | PASS |
| C. `wps_account_employee_map` 存在且为空（0 行） | PASS |
| D. `client_token` 部分唯一索引阻止第二重复 token | PASS (23505) |
| E. 同 `submission_fingerprint` 允许多条 | PASS (added=2) |
| D/E 漂移清理无残留 | PASS (residual=0) |
| F. fail-safe 单元测试（attribution/attachment/fingerprint/dup 全部符合 pending/NULL/candidate-only） | PASS |
| G. 生产只读复核：gir=2061 / sync_map=2061 / max(id)=7192 / conflict=0 / 生产 gir 仍 28 列 | PASS |
| H. 无 WPS 写；Pull 未 import enrichment；迁移无 WPS 写入 | PASS |

---

## 10. 测试数据创建 / 清理情况

- 创建：`grid_inspection_records` 中插入 `client_token='P2B0_TEST_TOKEN_9F3A'`（1 行，用于 D）+ `submission_fingerprint='P2B0_TEST_FP_7C2D'`（2 行，用于 E）。
- 清理：测试结束前 `DELETE FROM grid_inspection_records WHERE client_token=$1 OR submission_fingerprint=$2` 已执行。
- 复核：`residual=0`（无漂移残留）。生产库全程零写入。

---

## 11. 生产边界复核（红线）

| 项 | 状态 |
|---|---|
| 目标库 ≠ 生产 | ✅ 写操作仅对 `safety_dashboard_dev` |
| 目标进程 ≠ PID 23396 | ✅ 独立 node 脚本，非生产后端 |
| 目标端口 ≠ 5876 | ✅ 直连 PG `:5432`，不经后端 |
| 生产 `safety_dashboard` 未改 | ✅ 仍 28 列、gir=2061、sync_map=2061、max(id)=7192、conflict=0 |
| `.env` 未改 | ✅ 仅作凭证来源（host/user/pw/port），database 被强制覆盖为 dev |
| `WPS_GRID_SYNC` / `SCHEDULER_ENABLED` 未改 | ✅ 仍为 `true`（生产语义保持冻结） |
| `5876/PID 23396` 未触碰 | ✅ 全程未向生产发任何请求 |

---

## 12. 05-H-0 冻结层复核

| 冻结项 | 状态 |
|---|---|
| `SYNC_PROJECTION_ORDER` 前 18 列 | ✅ 未改 |
| `SYNC_HASH_COLUMNS` / `SYNC_HASH_COLUMN_COUNT=18` | ✅ 未改 |
| `canonicalHash` / `toCanonicalDto` / `toLegacyHashDict` | ✅ 未改 |
| `PROTECTED_COLUMNS = ['grid_id','inspector_employee_id']` | ✅ 未改（新列均在其外） |
| 既有 `FIELD_MAP` 映射 | ✅ 未改 |
| `sync_hash` 算法 | ✅ 未改（新列不进 hash） |
| `UNIQUE(wps_record_id,wps_file_id)` | ✅ 未改、仍有效 |
| Pull Engine no-delete 语义 | ✅ 未改 |
| WPS reverse-write no-op | ✅ 未改 |
| `wpsGridPullEngine.js` | ✅ **未修改、未 import enrichment** |

---

## 13. WPS 是否触碰

**未触碰。** 本回合：
- 未向 WPS 发起任何读/写请求；
- enrichment 骨架不含任何 WPS 客户端依赖（§8 grep 验证）；
- 迁移 SQL 仅操作 PG DDL，无 `INSERT INTO wps...`；
- 测试 D/E 仅在 dev PG 本地造数，不涉及 WPS。

---

## 14. 是否修改 Pull Engine

**否。** `wpsGridPullEngine.js` 未读取、未编辑、未 import `gridEnrichmentService`。新字段（`source_channel`/`client_token`/.../`business_fingerprint`）全部位于冻结投影之外，Pull 既不会读也不会写这些列，行为零回归。Enrichment 与 Pull 的接线方式（旁路/钩子 vs 改引擎）留待 P2-B1 设计，本阶段严守「不修改 Pull」硬要求。

---

## 15. 未验证能力清单（UNVERIFIED，全部 fail-safe 降级）

| 能力 | 状态 | 本阶段降级行为 |
|---|---|---|
| WPS Creator 稳定唯一 ID | UNVERIFIED | 不依赖，身份缺省 `pending` |
| WPS Creator → `employee.id` 可靠映射 | UNVERIFIED | 桥接表空表，不推测；`attribution=pending` |
| WPS Attachment → 稳定 download_url | UNVERIFIED | 不解析；`attachment=pending`，绝不假造 URL |
| 表单隐藏全部内部字段 | UNVERIFIED | 不涉及，历史数据不批量猜测 |
| 表单自动生成 `grid_id` / `inspector_employee_id` | UNVERIFIED | 不假设，缺省 `NULL` + `pending` |
| WPS 条件查询端点（按字段查） | UNVERIFIED (ARCH-01/02 既有) | 重复候选查询延后 P2-B1 |
| 业务指纹实算所需全部可信身份字段 | 依赖上述 | 前置不完整 → `submission_fingerprint=NULL` |

---

## 16. P2-B1 是否具备条件

**基础设施层已就绪 → `READY_FOR_P2-B1`（前向信号，非自动进入）。**

已具备：
- dev 库 schema 扩展（gir 5 列 + sync_map `business_fingerprint` + 桥接表 + 3 索引）；
- fail-safe Enrichment 骨架（接口/语义/单测就绪）；
- 受护栏迁移/测试工具链（DRY-RUN + 生产硬拒 + 漂移清理）。

P2-B1 启动前仍须满足（须单独授权）：
1. **WPS 能力真机验证**：Creator 稳定 ID、Creator→employee 映射、Attachment→稳定 URL（当前全 UNVERIFIED）。
2. **桥接表至少一条经核验映射**：`wps_account_id → employee.id` 须来自可信系统账号标识，禁止姓名匹配。
3. **Enrichment × Pull 接线设计**：§十二 禁改 Pull，须用旁路/事件钩子而非改引擎；须论证不破坏主链原子性与失败隔离。
4. **重复候选查询实现**：基于 `sync_map.business_fingerprint` 的候选检索 + 人工/后续规则判定（本阶段仅留字段与索引）。
5. **重新跑只读门禁**：P2-B1 实施前须重跑 §二 PRECHECK + §十四 测试，确认生产边界与冻结层未被触及。

---

## 状态机判定

```
PHASE_HSE_MOBILE_GRID_ARCH_03_P2_B0_COMPLETED
（所有红线、冻结层、生产边界、身份安全、唯一键、数据完整性校验均 PASS；无 NEEDS_REVIEW 触发项）
前向信号：READY_FOR_P2-B1  ← 仅信号，本回合不自动进入 P2-B1（§十七）
```
