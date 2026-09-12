# WPS-PG-SYNC-05-E-1A：05-C 测试数据治理审计报告

- **日期**：2026-09-11
- **阶段**：WPS-PG-SYNC-05-E-1A（READ-ONLY AUDIT）
- **前置阶段**：`PHASE_WPS_PG_SYNC_05E0_COMPLETED_READY_FOR_05E1`
- **终态**：**`PHASE_WPS_PG_SYNC_05E1A_COMPLETED_READY_FOR_05E1B`（PASS）**
- **证据**：`server/scripts/output/wpssync05e1a-testdata.json`、`wpssync05e1a-baseline-before.json`、`wpssync05d-recheck.json`

---

## 1. 执行摘要

本阶段对 SYNC-05-C 遗留的两组测试数据（A：WPS `gt` ↔ PG `7217`；B：WPS `go` ↔ PG `6796`）完成 **WPS / sync_map / PG 三方关系审计**，并对全数据面做了 `SYNC05C` 残留全景搜索。

**核心结论**：

1. 两组测试数据三方映射**完全一致**（WPS 存在 = PG 存在 = sync_map 存在，键 `(wps_record_id, wps_file_id)` 唯一定位）；
2. 引擎视角复算（`toCanonicalDto` + `canonicalHash` 三方对账）：两条记录 **hash 三方全 match，下次 Pull 均 `unchanged`（skippedUnchanged）**，对 Scheduler 开启**零干扰**；
3. PG 时间戳证明两条记录最后变更均在 05-C Pull#1/#2 窗口内，**未被后续修改**；
4. 残留搜索：PG 4 个列命中全部位于这两行；WPS 仅 gt/go 两条；**无未知 SYNC05C 测试数据**；
5. 全程 STRICT READ-ONLY：真实 Pull 0、PG DML 0、WPS 写 0、DDL 0、`.env` 未动、Scheduler 未启动、基线 recheck 100% 不变。

## 2. 测试数据 A 审计（WPS `gt` ↔ PG `7217`）

| 项 | 值 |
|---|---|
| WPS 存在 | ✅（全量 2064 条中定位唯一） |
| PG 存在 | ✅ `grid_inspection_records.id=7217`（当前 MAX(id)） |
| sync_map | ✅ `wps_record_id='gt'` / `wps_file_id='cn229thwalDs'` / `pg_record_id=7217` / `conflict=false` |
| WPS 测试标记 | 标记=`SYNC05C-CREATE-TEST`；三违行为=`SYNC05C 受控新增测试记录（非真实三违数据）` |
| 身份 | `grid_id=NULL`、`inspector_employee_id=NULL`（05-C fail-closed 语义保留至今） |
| 图片 | `image_content / rectified_photo / schematic` 全 NULL |
| sync_hash | 三方 match：WPS 重算 = PG 重算 = sync_map 存量（`d822d527f58d6988…`） |
| 是否被后续 Pull 修改 | 否——`updated_at=pg_updated_at=2026-09-11T04:54:47.638Z`，恰为 05-C Pull#1 完成时刻；晚于 pull3（04:55:55.667Z）无任何变更 |
| 下次 Pull 行为 | **unchanged（skippedUnchanged）** |

## 3. 测试数据 B 审计（WPS `go` ↔ PG `6796`）

| 项 | 值 |
|---|---|
| WPS 存在 | ✅ |
| PG 存在 | ✅ `id=6796`（既有业务记录，05-C 仅改其「标记」一列） |
| sync_map | ✅ `wps_record_id='go'` / `wps_file_id='cn229thwalDs'` / `pg_record_id=6796` / `conflict=false` |
| 当前 marker | WPS=PG=`SYNC05C-UPDATE-TEST`（05-C 写入的测试值；**原始值为 NULL**） |
| 身份 | `grid_id=1`（**05-C 之前既有的归属，非测试产生**，05-C 审计 `gridIdBefore=1` 可证）；`inspector_employee_id=NULL` |
| 图片 | 全 NULL |
| sync_hash | 三方 match（`a87ce6c58f9b57a5…`） |
| 是否被后续 Pull 修改 | 否——`updated_at=pg_updated_at=2026-09-11T04:55:34.662Z`，恰为 05-C Pull#2 完成时刻 |
| 下次 Pull 行为 | **unchanged（skippedUnchanged）** |

> 注：WPS `go` 记录本身是真实业务记录，其被测试污染的仅「标记」一列；治理时还原 marker 为 NULL 后，下一次 Pull 会对该列做一次合规 UPDATE（预期内 rebaseline）。

## 4. WPS / sync_map / PG 三方映射表

| WPS Record ID | PG ID | WPS存在 | PG存在 | sync_map存在 | file_id | grid_id | inspector_employee_id | 当前状态 |
|---|---:|---|---|---|---|---:|---:|---|
| gt | 7217 | ✅ | ✅ | ✅ | cn229thwalDs | NULL | NULL | 三方一致，unchanged |
| go | 6796 | ✅ | ✅ | ✅ | cn229thwalDs | 1（既有） | NULL | 三方一致，unchanged（marker 为测试值） |

## 5. 测试数据对 Scheduler 正常运行的影响

依据引擎代码路径（`wpsGridPullEngine.pullWpsToPg` 主流程，05-E-1A 只读复核）：

### 场景 1：保留测试数据（当前状态）

gt/go 均已映射且 hash 三方 match → 走 ④→⑤ 分支：`alreadyExists++` → hash 相等 → `skippedUnchanged++`。**每次 Pull 恒定 2 条 skippedUnchanged，零 DML。不影响 Scheduler。**

### 场景 2：删除 PG 行、保留 WPS + sync_map

引擎 ④ 分支显式处理：已映射但 PG 行不存在 → **`ORPHAN`（skippedUnbound++），不自动修复、不改绑、不删除、不重新 INSERT**。映射成为永久 stale 行（仍计入 mappingCount），无数据安全风险，但留下需人工清理的孤儿映射。

### 场景 3：删除 WPS 记录、保留 PG + sync_map

WPS 消失只产生 `wpsDeleted++` 统计（WPS-only 集合），**绝不触发 PG DELETE**（`assertNoPgDelete` 硬断言 + 引擎无任何 DELETE SQL）——与 BT/EA 反向缺席同构。PG 行与 sync_map 绑定保留为孤儿（gir 中多一条无 WPS 来源的记录）。

### 场景 4：WPS + PG 双边清理

若只删 gir 行 + WPS 记录而**保留 sync_map** → 退化为场景 2 的 ORPHAN 残留（map 行永不复用，因 `(gt, cn229thwalDs)` 键不会再次出现）。**必须三边同清**（WPS 记录 + gir 行 + sync_map 行）才无残留。三边同清后下次 Pull **不会再出现**：幂等键以 WPS Record ID 为准，被删记录不会复生，新记录将获得全新 Record ID。

## 6. SYNC05C 残留全景搜索结果

| 面 | 结果 |
|---|---|
| PG `grid_inspection_records`（全列 `::text LIKE '%SYNC05C%'`） | **4 个列命中、全部位于 2 行**：6796.marker；7217.marker + serial_no + violation_behavior。无其他行命中 |
| PG `grid_record_sync_map` | 0 |
| PG `grid_record_sync_state` | 0 |
| WPS 全量 2064 条字段值扫描 | 仅 gt、go 两条（与登记一致） |
| 文件系统 | 脚本 `_wpssync05c_controlled_change.cjs`；输出 `wpssync05c-*.json` 8 份（均为只读证据，留存归档，不属数据残留） |

**结论：不存在未知 SYNC05C 测试数据；测试残留边界与 05-C 登记完全吻合。**

## 7. 三种治理方案比较

### 方案 A：永久保留

- **优点**：零操作、零风险；不触碰任何生产数据。
- **缺点**：生产正式数据集永久含 1 条假记录（gir 2062/WPS 2064 计数虚高）；go 的 marker 永久为测试值，污染业务展示；统计口径需长期排除 7217。
- **对生产 Pull 的影响**：恒 2 条 skippedUnchanged，无 DML。
- **是否推荐**：❌ 不推荐（长期方案）。

### 方案 B：标记为测试数据后保留（当前已是此状态）

- **优点**：数据已自带双标记（serial `SYNC05C-TEST-20260911-001` + marker），可识别、可定位、可随时清理；对 Scheduler 完全无干扰；为治理决策保留全部现场。
- **缺点**：与方案 A 相同的计数虚高与展示污染，仅多一层可识别性。
- **对生产 Pull 的影响**：同场景 1，恒 skippedUnchanged。
- **是否推荐**：✅ **推荐作为过渡态**——先保留以开启 Scheduler（05-E-1），治理放在独立的受控变更阶段执行。

### 方案 C：WPS + PG + sync_map 三边完整清理

- **必须处理的对象**：① WPS 删除记录 `gt`；② WPS 还原 `go` 的标记→NULL；③ PG 删除 `grid_inspection_records` 行 7217；④ PG 删除 `grid_record_sync_map` 行（pg_record_id=7217）；⑤ 还原 6796 的 marker（经 Pull 合规 UPDATE 或直接 UPDATE 后 rebaseline）。**为什么不能只删 PG**：只删 PG 行会产生场景 2 的 ORPHAN 永久残留；只删 WPS 会产生场景 3 的孤儿业务行；必须三边同步才无残留。
- **优点**：生产数据集恢复纯净（WPS=2063/gir=2061 计数回归）；无测试污染。
- **缺点/风险**：涉及 PG DELETE（历史上从未在生产执行过，需全新门禁设计）；涉及 WPS DELETE（本链路从未授权过）；需逐项 before/after 证据与回滚方案；go 的 marker 还原会触发一次预期 UPDATE。
- **是否推荐**：✅ 作为**最终目标态**，但必须在独立的受控治理阶段（授权 + 专门门禁）执行，**不得与 Scheduler 开启混在同一阶段**。

### 最终推荐

**B（现状保持）→ Scheduler 开启（05-E-1）不受影响 → 之后单独授权执行 C（三边清理）**。本阶段不执行任何清理。

## 8. 推荐治理方案（见 §7）

## 9. 生产基线核验

| 项 | 审计前 | 审计后 | 结论 |
|---|---|---|---|
| gir / sm / MAX(id) / MIN(id) | 2062 / 2062 / 7217 / 4954 | 全等 | ✅ |
| 历史 NULL（id≤7192） | 327，MD5 `2668ce0c…`，SUM=2275920 | 全等 | ✅ |
| 总 NULL / 非 NULL 历史 / inspector 非空 | 328 / 1734 / 10 | 全等 | ✅ |
| grids / users / gi / admin | 62 / 63 / 62 / 1 | 全等 | ✅ |
| conflict / sync_hash NULL / sync_state | 0 / 0 / 0 行 | 全等 | ✅ |
| 身份集合指纹 / 绑定指纹 / 聚合指纹 | `6a6c19f3…` / `e0d11e45…` / `86de62e9…` | 全等 | ✅ |
| 10 条人工绑定 / gt·go 测试行 / BT·EA | 在位，排除状态不变 | 全等 | ✅ |
| WPS | 2064（BT/EA/gt/go 均在） | 全等 | ✅ |
| `.env` | md5 `8e697bb7…` / 4388B / mtime 16:33:49 | 未动 | ✅ |
| 三开关 | `WPS_GRID_DATA_SOURCE=false` / `WPS_GRID_SYNC=false` / `SCHEDULER_ENABLED=false` | 未动 | ✅ |
| Scheduler | `syncEnabledByEnv=false` / `running=false` | 未变 | ✅ |
| recheck | — | **pass=true，fails=[]** | ✅ |

**运行态备注**：开工时发现 5876 已被外部重启（PID 28020 → **28168**，≈16:56:20 启动，早于本阶段任何动作；当日第 8 次外部重启）。对新进程行为判别：`/push`→410 `REVERSE_WRITE_DISABLED`、`mappingCount=2062`、`exclusions=['BT','EA']`、`hashScopeColumns=18`、`running=false` ⇒ 仍加载 SYNC-02 单向引擎。本会话重启 0 次。

## 10. STOP 条件核查（§十二 12 项）

| # | 条件 | 结果 |
|---|---|---|
| 1 | 测试数据无法唯一定位 | ✅ 未触发（三方唯一） |
| 2 | gt/go 映射异常 | ✅ 未触发 |
| 3 | 7217/6796 被生产业务重新使用 | ✅ 未触发 |
| 4 | 测试数据产生新的人工业务关联 | ✅ 未触发（7217 身份全 NULL；6796 grid_id=1 为既有归属） |
| 5 | 删除一侧可能产生重新同步风险 | ✅ 未触发（场景 2/3 均 ORPHAN/只统计，无重新同步） |
| 6 | WPS/PG/sync_map 三方不一致 | ✅ 未触发 |
| 7 | 存在其他未知 SYNC05C 测试数据 | ✅ 未触发 |
| 8 | Scheduler 已开启 | ✅ 未触发（running=false, syncEnabledByEnv=false） |
| 9 | WPS_GRID_SYNC=true | ✅ 未触发 |
| 10 | SCHEDULER_ENABLED=true | ✅ 未触发 |
| 11 | 生产服务发生重启 | ⚠️ 外部重启 1 次（PID 28168，§9 备注；非本阶段动作，行为判别安全） |
| 12 | PG/WPS 非预期写入 | ✅ 未触发（DML/写全 0） |

## 11. 是否允许进入实际清理 + 下一阶段建议

- **本阶段未执行任何清理**（符合 §六）。
- **允许进入实际清理的前提**（供下一阶段任务书参考）：需明确授权 PG DELETE（7217 + sync_map 对应行）、WPS DELETE（gt）、WPS UPDATE（go.marker→NULL），并提供回滚快照；建议作为独立阶段（05-E-1B 或 05-F）在 Scheduler 开启之后执行。
- **下一阶段建议**：`05-E-1`（Scheduler 受控开启：`.env` 双闸显式 true + 受控重启 + 首小时观察）。测试数据治理不阻塞 05-E-1。

---

**审计脚本**：`server/scripts/_wpssync05e1a_testdata_audit.cjs`（只读，引擎 Pull 函数运行期替换为哨兵防误调用）
**证据**：`server/scripts/output/wpssync05e1a-{testdata,baseline-before}.json` + `wpssync05d-recheck.json`
