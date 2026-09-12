# HSE 网格巡查身份链 · PG-SOURCE-SWITCH-01-B
## 人工裁定落地 + 10 条未映射记录正式补迁 + 切换前一致性复核

- 阶段：`PG-SOURCE-SWITCH-01-B`
- 日期：2026-09-10
- 项目：`G:\hse-dashboard`（后端 `server/`，正式前端 `安全看板vben/apps/web-naive`）
- 数据源（执行期间与执行后均保持不变）：`WPS_GRID_DATA_SOURCE=true`、`WPS_GRID_SYNC=false`
- **最终状态：`PHASE_PG_SOURCE_SWITCH_01B_COMPLETED_READY_FOR_PRODUCTION_SWITCH`**

---

## 1. 执行摘要

本阶段依据人工已批准的业务裁定，将 **10 条**此前未映射的 WPS 记录正式补迁至 PostgreSQL，并完成补迁后全量一致性复核。

| 项 | 结果 |
|---|---|
| A 池保留并迁入 | `BS`（王铁民）、`D_`（谢俊章） → **2 条** |
| A 池放弃迁入 | `BT`（王铁民）、`EA`（谢俊章） → 2 条（保留 WPS 原始） |
| B 池真实三违全部补迁 | `FD/FG/FT/FU/FV/FW`（刘金涛→grid 6）、`FN/FQ`（黄殿兴→grid 1）→ **8 条** |
| **正式补迁合计** | **10 条** |
| PG 记录 | **2051 → 2061** |
| sync_map | **2051 → 2061** |
| `grid_id IS NULL` | **327 → 327（未变）** |
| `grid_id IS NOT NULL` | **1724 → 1734** |
| live grids | **62（未变）** |
| WPS | **2063（未变，零删除零修改）** |
| WPS-only | **2** = `BT`, `EA` |
| 字段级不一致（10 条 × 23 字段） | **0** |
| 逐条核验（grid_id / inspector_employee_id / sync_map / 日期） | **10/10 PASS** |
| 幂等性（重放 10 条） | **10/10 ALREADY_EXISTS，零写入** |
| 放弃迁移记录（BT/EA） | WPS 存在 ✓、无 sync_map ✓、PG 无同编号记录 ✓ |
| 生产数据源切换 | **NOT_EXECUTED** |
| `.env` 修改 | **无**（mtime 2026-09-10 17:38，早于本阶段） |
| WPS Schema / 字段 / 记录修改 | **无** |

**结论：** 10 条人工批准记录已按批准值落库，PG 已具备正式切换的数据与权限条件；本阶段未执行、也未触碰任何生产切换动作。

---

## 2. 写入明细（10 条）

批次号：`WPS03B-20260910222711`

| # | WPS ID | 姓名 | 原始编号 | 原始日期 → PG 日期 | PG ID | grid_id | inspector_employee_id | sync_map | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **BS** | 王铁民 | L2604 | `2026-09-02 08:23` → 2026-09-02 | 7183 | **60** | **6789** | ✓ | PASS |
| 2 | **D_** | 谢俊章 | L2793 | `2026-09-05 11:15` → 2026-09-05 | 7184 | **14** | **7437** | ✓ | PASS |
| 3 | **FD** | 刘金涛 | （无） | `2026年09月02日` → 2026-09-02 | 7185 | **6** | **6698** | ✓ | PASS |
| 4 | **FG** | 刘金涛 | （无） | `2026年09月02日` → 2026-09-02 | 7186 | **6** | **6698** | ✓ | PASS |
| 5 | **FT** | 刘金涛 | （无） | `2026年09月02日` → 2026-09-02 | 7187 | **6** | **6698** | ✓ | PASS |
| 6 | **FU** | 刘金涛 | （无） | `2026年09月02日` → 2026-09-02 | 7188 | **6** | **6698** | ✓ | PASS |
| 7 | **FV** | 刘金涛 | （无） | `2026年09月02日` → 2026-09-02 | 7189 | **6** | **6698** | ✓ | PASS |
| 8 | **FW** | 刘金涛 | （无） | `2026年09月04日` → 2026-09-04 | 7190 | **6** | **6698** | ✓ | PASS |
| 9 | **FN** | 黄殿兴 | （空） | `2026年09月01日` → 2026-09-01 | 7191 | **1** | **6692** | ✓ | PASS |
| 10 | **FQ** | 黄殿兴 | （无） | `2026年09月04日` → 2026-09-04 | 7192 | **1** | **6692** | ✓ | PASS |

- 全部经**每条独立事务**写入：`BEGIN → 事务内幂等预检(wps_record_id+wps_file_id) → INSERT grid_inspection_records RETURNING id → INSERT grid_record_sync_map → COMMIT`。
- 10 条均 `sync_map.wps_sheet_id=3`、`conflict=false`。
- **中文日期归一化**：`2026年09月02日 → 2026-09-02`，全部成功，无一条因日期格式再次漏迁（见 §5）。

---

## 3. 放弃迁移明细（2 条）

| WPS ID | 姓名 | 编号 | WPS 原始记录 | PG 正式映射 | PG 同编号记录 |
|---|---|---|---|---|---|
| **BT** | 王铁民 | L2609 | **保留** ✓ | 无 ✓ | 无 ✓ |
| **EA** | 谢俊章 | L2794 | **保留** ✓ | 无 ✓ | 无 ✓ |

> **仅不进入 PG 正式业务台账；WPS 原始记录完整保留、未删除、未修改。** WPS 继续作为历史原始数据留存。

---

## 4. 数据不变量

| 指标 | 执行前 | 执行后 | 期望 | 判定 |
|---|---|---|---|---|
| `grid_inspection_records` | 2051 | **2061** | 2061 | PASS |
| `grid_id IS NOT NULL` | 1724 | **1734** | 1734 | PASS |
| `grid_id IS NULL` | 327 | **327** | 327（不得变） | PASS |
| `grid_record_sync_map` | 2051 | **2061** | 2061 | PASS |
| live `grid_areas` | 62 | **62** | 62 | PASS |
| `users` active | 63 | **63** | 63 | PASS |
| `sync_map.conflict=true` | 0 | **0** | 0 | PASS |
| WPS 总记录 | 2063 | **2063** | 2063 | PASS |
| WPS − PG | 12 | **2** | 2（BT/EA） | PASS |
| `inspector_employee_id IS NOT NULL` | 0 | **10** | 10（仅本次批次） | PASS |

**327 条 NULL grid_id 完全未被触碰**（逐月同口径不变），`grid_id IS NULL` 计数自始至终恒为 327。

### 网格归属分布（10 条）

| grid_id | 记录数 | 归属人 | 累计网格记录数 |
|---|---|---|---|
| 1 | 2 | 黄殿兴 | 14 |
| 6 | 6 | 刘金涛 | 21 |
| 14 | 1 | 谢俊章 | 31 |
| 60 | 1 | 王铁民 | 32 |

---

## 5. 字段一致性

对 10 条补迁记录执行 **WPS 原始记录 ↔ PG 记录** 字段级逐条比较，共 **23 字段/条**：

```
姓名 personnel_name        分组名称 area_team         所属岗位 position
网格等级 grid_level        日期 inspection_date       三违行为 violation_behavior
昵称2 nickname             当日是否报名 signup_today   是否补交 is_resubmit
提交时间 upload_time        标记 marker               上报状态 report_status
车辆类型 vehicle_type       违章类型结果 violation_type_result
是否需要整改 need_rectification  整改人 rectifier
违章人姓名 violator_name     违章人性别 violator_gender  违章人年龄 violator_age
编号 serial_no             三违照片链接 image_content
整改后照片链接 rectified_photo  示意图链接 schematic
```

| 项 | 结果 |
|---|---|
| 配对 | **10/10** |
| 比较字段 | 23 × 10 = 230 |
| **字段级不一致** | **0** |
| 日期归一化差异（合法） | 8 条中文日期 → ISO，全部按官方 `toIsoDate` 归一化 |
| 照片链接 | 10/10 `三违照片链接` 为合法 `https://` URL，已入库 `image_content`；`整改后照片链接`/`示意图链接` 源为空 → NULL（不伪装） |

补充：独立的 `_pgsource01_precheck.cjs` 在补迁后对**全部 2061 条**映射记录重算字段一致性，结果为 `pairs=2061 / match=2061 / mismatch=0`。

### 5.1 关于 `buildDto` 的日期处理（重要技术说明）

现有 `wpsGridMigrationService.buildDto` 的日期正则为 `/^(\d{4})-(\d{2})-(\d{2})/`，**只能识别 `YYYY-MM-DD…`**；B 池 8 条为中文 `2026年09月XX日`，若不处理将得到 `inspection_date = NULL`（这正是该 8 条此前被 C 段排除的同一根因）。

本阶段**未新建第二套转换体系**，而是复用同步服务既有的官方归一化函数 `wpsGridSyncService.wpsToPg()`（即 `canonicalHash` 所依赖的同一函数、同一口径）对日期补正：`target.inspection_date = buildDto.date || wpsToPg(fields).inspection_date`。写入后 8 条日期全部正确，且与 `sync_hash` 口径内部一致。

---

## 6. 身份验证

| 姓名 | 角色 | users | employee.id | grid_areas | grid_code | 网格等级 |
|---|---|---|---|---|---|---|
| 王铁民 | grid_inspector | `w4710` (id 134) | **6789** | id **60** | G060 | 三级网格长 |
| 谢俊章 | grid_inspector | `x7778` (id 88) | **7437** | id **14** | G014 | 二级网格长 |
| 刘金涛 | grid_inspector | `l0822` (id 80) | **6698** | id **6** | G006 | 一级网格长 |
| 黄殿兴 | grid_inspector | `h2660` (id 75) | **6692** | id **1** | G001 | 总网格长 |

四条身份链均满足 `users.employee_id → employee.id → grid_areas.personnel_id → 唯一 live grid`（每人恰 1 个 live 网格），且账号 `role='grid_inspector'`、`is_active=true`。**`admin.employee_id` 仍为 NULL，未修改。**

### 6.1 `grid_id` 决策依据（严格遵守「禁止错误映射」）

- **刘金涛 → grid 6、黄殿兴 → grid 1**：采用人工批准值（与 §六 独立核验一致）。
- **王铁民 → grid 60、谢俊章 → grid 14**：**非按姓名猜测**，而是使用系统**现有正式业务归属规则**（`employee.id → grid_areas.personnel_id → 唯一 live grid`），并有 PG 既有先例佐证：
  - 王铁民历史 PG 记录 `grid_id=60` × 31 条（另有 5 条历史 NULL，属 327 历史批次）；
  - 谢俊章历史 PG 记录 `grid_id=14` × 30 条（另有 5 条历史 NULL）。
- **未采用**任何「公司管理 → grid_id=1」的统一规则；核验证明「公司管理」并非单一网格（PG 既有分布 grid6/grid1/grid4/NULL 并存），按巡查人所辖网格归属。若统一挂 grid 1，刘金涛 6 条将被**错挂到黄殿兴的网格**。
- 全部 10 条的 `grid_id` 在写入前均经 `gridOk/empOk/userOk` 三重守卫（10/10 OK）复算通过。

---

## 7. 权限验证

以真实 Express HTTP 复跑 own_grid 安全路径（临时 PG 实例 `PORT=5881`，进程级 `WPS_GRID_DATA_SOURCE=false`，**不触碰 .env、不触碰生产 5876**）：**29/29 ALL_PASS**。

| 用例 | 结果 |
|---|---|
| grid_inspector A 仅见自身网格（grid 56） | PASS |
| grid_inspector A **看不到 `grid_id=NULL`（327 条）** | PASS |
| grid_inspector A 记录数 = 自己网格记录数（32） | PASS |
| grid_inspector B 仅见自身网格（grid 60，含本次新增 BS） | PASS |
| A / B 数据互不相交 | PASS |
| A 新增：`grid_id`/`inspector_employee_id` 由后端派生，客户端 999999 被剥离 | PASS |
| A 改自己 → 200 且生效 | PASS |
| **A 改 B 记录 → 403 `SCOPE_DENIED`，且 B 数据未被篡改** | PASS |
| grid_inspector DELETE → 403 | PASS |
| grid_inspector DELETE ALL → 403 | PASS |
| admin → all_grid 全量可见（含 327 NULL） | PASS |
| admin DELETE ALL 缺二次确认 → 400 | PASS |
| 探针零残留；计数 2061 / 2061 / 62 前后不变 | PASS |

**结论：本阶段新增 10 条数据未放宽任何权限。** 3B-1 三层保护（权限 → 范围 → 二次确认）完整保留。

### 7.1 own_grid 覆盖新记录

| 责任人 | 可见记录（自己网格） | 其中本次新增 |
|---|---|---|
| 王铁民（grid 60） | 32 | 1（BS） |
| 谢俊章（grid 14） | 31 | 1（D_） |
| 刘金涛（grid 6） | 21 | 6（FD/FG/FT/FU/FV/FW） |
| 黄殿兴（grid 1） | 14 | 2（FN/FQ） |

---

## 8. 幂等性证明

幂等键：`wps_record_id + wps_file_id`（**严禁**使用姓名 / 日期 / 编号 / WPS 行号）。

| 证明 | 结果 |
|---|---|
| A. `classifyIdempotency(pool, 10 条 WPS 记录, file_id)` | `NOT_EXISTS=0 / ALREADY_EXISTS=10 / CONFLICT=0 / ORPHAN=0` |
| B. 逐条重放 `migrateRecord`（事务内命中已存在 → ROLLBACK） | **10/10 返回 `ALREADY_EXISTS`，零写入** |
| 重放前后计数 | `gir 2061→2061`、`smap 2061→2061`，**完全不变** |
| 写入前重复守卫 | PG 自然键（日期+姓名+违章人）重复命中 = **0**（禁止盲目 INSERT） |
| 执行前逐条检查 | WPS 存在 ✓ / sync_map 不存在 ✓ / PG 对应映射不存在 ✓ → 方允许 INSERT |

**未产生任何**「PG 有记录但 sync_map 无」或「sync_map 有记录但 PG 无」的半成功状态：`pg_orphan=0`、`map_orphan=0`、`duplicate_map_key=0`、`conflict=0`。

---

## 9. WPS 状态

```
WPS_GRID_DATA_SOURCE = true   （未修改）
WPS_GRID_SYNC        = false  （未修改；未开启）
server/.env mtime    = 2026-09-10 17:38:21 （早于本阶段 22:24–22:31，未写入）
```

- WPS 记录 **2063 条**（与执行前一致），本阶段对 WPS 仅执行 `list_by_page` 只读拉取。
- **未删除 / 未修改 / 未新增** 任何 WPS 记录、字段、Schema、附件、编号；未修改 WPS 板配置。
- 12 条差异记录（BS/BT/D_/EA/FD/FG/FN/FQ/FT/FU/FV/FW）在 WPS 中全部**原样保留**。
- 执行期间与执行后，生产数据源始终为 WPS。

---

## 10. 生产切换

| 项 | 状态 |
|---|---|
| `WPS_GRID_DATA_SOURCE` 切换 | **NOT_EXECUTED** |
| `.env` 修改 | **无** |
| 生产 5876 重启（由本阶段发起） | **无** |
| `WPS_GRID_SYNC` 开启 | **无** |
| 前端修改 | **无** |
| JWT / auth / login 修改 | **无** |
| users 表结构修改 | **无** |
| 327 条 grid_id 回填 | **无**（恒为 327） |
| 历史 `inspector_employee_id` 批量回填 | **无**（仅本次 10 条新记录写入） |
| WPS-PG 双写 | **未开启** |
| 12 条数据迁移 | 仅经人工批准的 10 条；BT/EA 未迁移 |

### 10.1 未修改证明（源码 mtime 全部早于本阶段 22:24）

```
server/.env                                     2026-09-10 17:38
server/routes/site-mgmt.js                      2026-09-10 19:21
server/routes/import.js                         2026-09-03 14:21
server/services/gridScope.js                    2026-09-10 19:19
server/services/wpsGridMigrationService.js      2026-09-08 22:32
server/services/wpsGridSyncService.js           2026-09-08 18:38
server/middleware/auth.js                       2026-09-10 19:19
server/config/db.js                             2026-09-01 16:15
安全看板vben/.../views/site/grid-ledger/index.vue   2026-09-08 20:14
安全看板vben/.../api/hse/site.ts                    2026-09-08 20:17
安全看板vben/.../router/routes/modules/hse-site.ts  2026-09-10 20:05
```

**生产业务逻辑与前端代码零改动**——本阶段唯一写入为 PG 的 10 条业务记录 + 10 条 sync_map 映射。

---

## 11. 回归测试（§二十三）

执行前先运行、执行后重跑，全部通过：

| 测试 | 执行前 | 执行后 | 说明 |
|---|---|---|---|
| `_wps03b_migrate.cjs`（DRY_RUN） | PASS（phase=first / 327 候选） | **PASS**（phase=all_done，`PG 2061→2061 unchanged=true`） | 幂等，重跑不重复写入 |
| `_phase1_identity_test.cjs` | 22/22 | **22/22** | 断言基线 0 → 10（见下） |
| `_phase2_pg_create_test.cjs` | 30/30 | **30/30** | 断言基线 0 → 10 |
| `_phase3b1_pg_test.cjs` | 36/36 | **36/36** | 断言基线 0 → 10 |
| `_phase3b2_scope_test.cjs` | 49/49 | **49/49** | 动态基线，无需修改 |
| `_pgsource01_precheck.cjs` | PASS（2051 基线） | **PASS**（2061 基线） | 预期基线更新，见下 |
| `_pgsource00_ownscope_test.cjs`（own_grid） | 29/29 | **29/29** | 动态基线 |

### 11.1 允许的测试基线更新（§二十三：仅改预期基线/动态计算，不改生产逻辑）

数据库从 2051→2061 后，以下**固定数量断言**按其既有语义更新，**未改动任何生产代码**：

1. `_phase1_identity_test.cjs` / `_phase2_pg_create_test.cjs` / `_phase3b1_pg_test.cjs`：
   「`inspector_employee_id` 非 NULL 数 = 0（历史未回填）」→「= **10**（仅 01-B 补迁批次；历史未回填）」。语义不变：历史 2051 条仍全为 NULL。
2. `_pgsource01_precheck.cjs`：`invariant_total_2051/invariant_syncmap_2051` 的期望基线 2051 → **2061**；「12 条未映射」判定改为动态识别当前未映射集合（BT/EA），A/B 池成员改为按 WPS 直接构建（不再依赖「未映射」状态）。**原 stage-01 冻结产物已另存**：`output/pgsource01-final-precheck.stage01-frozen.json`。
3. `_pgsource00_audit.cjs`（stage-00 审计of-record）**保持冻结未改**，其 2051 基线属于 stage-00 时点。

---

## 12. 实施方法（复用现有成熟逻辑，未另造体系）

- 复用 `services/wpsGridMigrationService.js`：`buildDto`（23 字段 `FIELD_MAP`、伪空值→NULL、`"nan"`→NULL、仅合法 http(s) URL 入照片列、`sync_hash = canonicalHash(wpsToPg(原始字段))`）+ `migrateRecord`（每条独立事务、纯 INSERT 无 `ON CONFLICT DO UPDATE`）。
- 复用 `services/wpsGridSyncService.js`：`wpsToPg` / `canonicalHash`（同步口径唯一真源）用于日期归一化与哈希。
- 复用 `services/wpsClient.js`：`listAllRecords`（WPS 只读）。
- **本阶段唯一扩展**：对这 10 条将人工批准的 `grid_id` / `inspector_employee_id` 追加进 `insertCols` 并赋值（这两个列属 `PG_ONLY_COLUMNS`，不在 `FIELD_MAP`、不入 `sync_hash`，故不影响未来 WPS 同步对账）。
- 既有 `deriveCandidates/checkGates` 硬编码 A-ONLY 327 批次，**未用于本阶段**（否则会阻断 C 段记录）；改为按 10 条 WPS ID 精确选取 + 自建等价门禁（快照不变量、幂等、PG 自然键重复、grid/emp 守卫）。

### 12.1 本阶段发现并修正的验证代码缺陷（非数据问题）

初版复核脚本报 `mismatch=10`、`notnull1734=false`，经查均为**验证代码**缺陷，数据本身正确：
1. PG `date` 列经 node-pg 返回 JS `Date`（`2026-09-01T16:00:00.000Z` = 本地 2026-09-02，UTC+8）；误用 `String(Date)` 比较导致全量日期假报不一致 → 改用 `to_char(inspection_date,'YYYY-MM-DD')` 本地日期分量比较（历史已知坑）。
2. `EXPECT` 常量缺 `notnullg` 键 → `1724+10` 变 `NaN` → 补齐。
修正后（`_pgsource01b_verify.cjs`）全部为 0 不一致、`notnull=1734`。

---

## 13. 阶段产物

| 产物 | 路径 |
|---|---|
| 补迁脚本（DRY_RUN/EXECUTE） | `server/scripts/_pgsource01b_migrate.cjs` |
| 补迁后只读复核 + 幂等证明 | `server/scripts/_pgsource01b_verify.cjs` |
| 证据侦察 | `server/scripts/_pgsource01b_investigate.cjs` |
| 网格归属证据 | `server/scripts/_pgsource01b_evidence.cjs` |
| DRY_RUN 产物 | `server/scripts/output/pgsource01b-dryrun.json` |
| 正式补迁产物 | `server/scripts/output/pgsource01b-migration.json` |
| 补迁后复核产物 | `server/scripts/output/pgsource01b-postcheck.json` |
| stage-01 预检（已更新基线） | `server/scripts/output/pgsource01-final-precheck.json` |
| stage-01 冻结基线（保留） | `server/scripts/output/pgsource01-final-precheck.stage01-frozen.json` |

---

## 14. 观察到的外部异常（非本阶段行为）

执行期间观察到 **生产 5876 后端进程被外部因素重启**（health `uptime` 从 37.8s → 61.6s），并在本阶段末段处于**未监听**状态。

- **不是本阶段行为**：本阶段所有脚本均不重启任何服务；own_grid 测试仅对自己 `spawn` 的 5881 子进程发 `SIGTERM`（`child.kill`），无法影响 5876。
- 最可能原因：外部开发监视器（如 nodemon）对 `server/` 目录下新增脚本文件产生响应而自动重启。
- 按本阶段红线（§二十），**禁止重启 5876**，故未做任何恢复动作。**请人工确认 5876 运行状态。**
- 该异常**不影响**本阶段结论：数据与权限验证均基于**直连数据库**与**独立临时实例（5881）**完成。
- 生产数据源配置的权威证据为 `.env`：mtime 17:38（早于本阶段）、内容 `WPS_GRID_DATA_SOURCE=true` / `WPS_GRID_SYNC=false`，未被本阶段改写。

---

## 15. 下一阶段建议

**本阶段状态：`PHASE_PG_SOURCE_SWITCH_01B_COMPLETED_READY_FOR_PRODUCTION_SWITCH`**

进入 `PG-SOURCE-SWITCH-02`（正式数据源切换）前，建议人工确认：

1. **5876 运行状态恢复**（外部异常已说明）。
2. 327 条 NULL grid_id 的 fail-closed 口径书面确认（沿用「grid_inspector 不可见 / admin 可见」）。
3. 切换窗口与备份策略（切换操作面仅 `.env` 一行 `WPS_GRID_DATA_SOURCE=false` + 重启 5876；`WPS_GRID_SYNC` 保持 `false`；前端零改动）。
4. 切换瞬间写入冻结策略（避免 WPS/PG 双端同时新增）。

**正式切换须等待人工明确批准，本阶段不自行进入。**
