# WPS-PG-SYNC-05-E-1B-0：测试数据三边清理执行前最终门禁审计报告

- **日期**：2026-09-11
- **阶段**：WPS-PG-SYNC-05-E-1B-0（STRICT READ-ONLY，清理前最终门禁）
- **前置阶段**：`PHASE_WPS_PG_SYNC_05E1A_COMPLETED_READY_FOR_05E1B`
- **终态**：**`PHASE_WPS_PG_SYNC_05E1B0_COMPLETED_READY_FOR_05E1B`（PASS）**
- **证据**：`server/scripts/output/wpssync05e1b0-gates.json`、`wpssync05e1b0-baseline-before.json`、`wpssync05d-recheck.json`

---

## 1. 执行摘要

本阶段对 05-C 遗留测试数据的三边受控清理做执行前最终门禁审计，共九道门禁（G1–G9）全部 PASS，STOP 条件 12 项 0 触发。**本阶段未执行任何清理动作**：WPS writes=0、PG DML=0、DDL=0、真实 Pull=0、`.env` 未动、Scheduler 保持关闭、全程 PID 28168 未变、终检 recheck fails=[]。

最终产出正式清理任务清单（**仅设计，未执行**）：
- **Action A（gt 三边清理）**：WPS 删除 `gt` → sync_map 删除 `(gt, cn229thwalDs)` → gir 删除 `7217`；
- **Action B（go marker 恢复）**：WPS `go.标记` `SYNC05C-UPDATE-TEST → NULL`，随后由正式 Pull 使 PG `6796.marker → NULL`（预期 DML=2 UPDATE）。

## 2. gt 三方定位（G1 ✅）

| 断言 | 结果 |
|---|---|
| WPS `gt` 存在且唯一（2064 条中恰好 1 条） | ✅ |
| PG `grid_inspection_records.id=7217` 存在且唯一 | ✅ |
| sync_map `(gt, cn229thwalDs) → 7217`，`conflict=false` | ✅ |
| `7217.grid_id IS NULL` / `inspector_employee_id IS NULL` | ✅ 无人工业务关联 |
| sync_hash 三方一致（WPS 重算 = PG 重算 = 存量 `d822d527…`） | ✅ |

## 3. go 三方定位（G1 ✅）

| 断言 | 结果 |
|---|---|
| WPS `go` 存在且唯一 | ✅ |
| PG `6796` 存在 | ✅ |
| sync_map `(go, cn229thwalDs) → 6796`，`conflict=false` | ✅ |
| `6796.grid_id = 1` | ✅ |
| `grid_id=1` 是 05-C 之前既有业务归属 | ✅（05-C 审计快照 `gridIdBefore=1` + 本阶段 G2 双侧比对证明未变） |

## 4. go marker 污染范围（G2 ✅）

以 05-C 审计采集的**修改前快照**（`wpssync05c-audit.json updateTarget`）为基准，与当前值做双侧字段级比对：

- **WPS 字段 diff**：`[{"field":"标记","before":null,"now":"SYNC05C-UPDATE-TEST"}]` —— **恰 1 项**；
- **PG 投影列 diff**：`[{"col":"marker","before":null,"now":"SYNC05C-UPDATE-TEST"}]` —— **恰 1 项**；
- `grid_id`：1 → 1（未变，且证明为历史归属）；`inspector_employee_id`：NULL → NULL；serial_no 未变；姓名/日期/三违行为/违章人/性别/年龄/图片三列等全部投影字段零差异。

**结论：05-C 对 go 的污染范围仅「标记」一列，恢复方案可精确到单字段。**

## 5. 7217 引用检查（G9 ✅）

| 检查面 | 方法 | 结果 |
|---|---|---|
| FK 约束 | `pg_constraint` 全库扫描 | 唯一 FK 为 `grid_inspection_records.grid_id → grid_areas`（gir 是引用方）；**无任何表指向 gir** |
| 关联/业务表 | 全 public 表列名启发式（`record_id/inspection_id/gir_id/grid_inspection`），逐列 `::text='7217'` 精确计数 | 唯一命中 `grid_record_sync_map.pg_record_id`（**三边清理对象本身**，非未知引用）；audit_record/file_attachments/hazard_record/import_logs 等候选表全部 0 命中 |
| sync_state | 行数 | 0（无引用） |
| 业务日志 | 16 张 log/audit/history/track 表**全列** `::text='7217'` 精确扫描 | 0 命中 |

**结论：7217 无任何未知业务引用，可安全进入三边清理。**

## 6. 三边删除对象（G3 ✅，均唯一）

```text
WPS:     file_id=cn229thwalDs, sheet_id=3, record_id=gt        （唯一）
PG:      grid_inspection_records.id=7217                       （唯一）
sync_map: wps_record_id='gt' AND wps_file_id='cn229thwalDs'
          AND pg_record_id=7217                                （唯一）
```

## 7. 删除顺序设计（G4，只设计不执行）

**推荐顺序：WPS → sync_map → PG**（单窗口内连续执行，期间 Scheduler 关闭、禁止任何手工 Pull）。

七个必须回答的问题：

1. **为什么不会导致 Scheduler 重新插入 7217**：第一步删除 WPS 记录后，`gt` 从 `listAllRecords` 结果中消失——引擎只遍历 WPS 记录，任何后续 Pull 都没有 gt 可处理，INSERT 路径在源头关闭；且清理窗口内 Scheduler 本身关闭（`SCHEDULER_ENABLED=false` 双闸 + `WPS_GRID_SYNC=false`）。
2. **为什么不会形成 orphan sync_map**：map 行在第 2 步删除；即使流程在第 1 步后中断，残留 map 行也是**安全的稳定中间态**——引擎对「map 存在但 WPS 缺失」只做统计（wpsDeleted/orphan 计数），绝无 DML，恢复执行第 2 步即消除。
3. **为什么不会形成 orphan PG**：gir 行在第 3 步删除；若在第 2 步后中断（map 已删、gir 在），gir 7217 只是一条无 WPS 来源的普通行，引擎按 WPS 记录遍历永远不会触碰它；第 3 步完成后彻底消除。
4. **为什么不会因单向 Pull 复活 gt**：幂等键 `(gt, cn229thwalDs)` 的 WPS 侧记录已删，无记录即无 `newCandidates`，无 INSERT；`assertNoPgDelete` 与单向语义保证 Pull 不产生任何删除类副作用。
5. **为什么 `(gt, cn229thwalDs)` 删除后不会重新出现**：WPS Record ID 由 WPS 平台分配且不复用；被删记录不可复生，新记录将获得全新 ID，幂等键永不重逢。
6. **任一步失败如何停止**：每步独立验证（存在性查询）后落盘证据再进下一步；失败即停、不回滚不重试，报告中间态（三种中间态均为安全稳定态，见 2/3/4）；整体动作可分多次授权会话续作。
7. **如何验证三边最终一致**：清理后三查——WPS 无 gt、gir 无 7217、map 无 `(gt,cn229thwalDs)`；基线应为 `gir=2061 / sm=2061 / nullall=327（历史 327 集合不变）/ MAX(id)=7192`，hash 聚合与绑定指纹按删除后重算比对；`pg_stat_user_tables` 应恰有 gir 与 map 各 1 次 delete 增量。

> 备选顺序 `PG → sync_map → WPS` 亦安全（第一步即触发引擎 ORPHAN 保护），但 WPS 优先能在**最早时刻**关闭重新 INSERT 的唯一入口，窗口最小，故为推荐。

## 8. go 恢复方案（G5 ✅，只预演不执行）

```text
WPS go.标记:  SYNC05C-UPDATE-TEST  →  NULL（唯一 WPS UPDATE，属 Action B）
正式 Pull:    PG 6796.marker  →  NULL
```

Hash 预演（引擎口径 `toLegacyHashDict → canonicalHash`）：

| 项 | 值 |
|---|---|
| 当前 WPS hash = sync_map 存量 | `a87ce6c5…`（match，现状未变更） |
| 恢复 marker→NULL 后预期 WPS hash | `36408fd9…` |
| 恢复后预期 PG hash（marker=NULL 重算） | `36408fd9…` —— **与 WPS 侧 MATCH，三方重新一致** |
| marker 是否在 hash 口径内 | ✅（恢复必然触发变更检测） |
| 预期 Pull DML | **1 UPDATE（gir 6796 marker→NULL）+ 1 UPDATE（sync_map rebaseline）**，其余全零 |

恢复后 go 完全回归 05-C 之前状态（marker=NULL），该记录即不再是测试数据。

## 9. Scheduler 状态（G6 ✅）

`/status`：`syncEnabledByEnv=false`、`running=false`、`reverseWriteEnabled=false`、`deleteSyncEnabled=false`、`mappingCount=2062`、`conflicts=0`、`exclusions=['BT','EA']`、`hashScopeColumns=18`；认证 `/push`→410。`.env` 三开关：`WPS_GRID_DATA_SOURCE=false`、`WPS_GRID_SYNC=false`、`SCHEDULER_ENABLED=false`。全程未修改。

## 10. 全局 SYNC05C 搜索（G8 ✅）

- PG：`grid_inspection_records` 4 个列命中、全部位于 **7217 与 6796** 两行；`grid_record_sync_map`/`grid_record_sync_state` = 0；
- WPS：全量 2064 条字段扫描仅 **gt、go**；
- 无其他记录命中 ⇒ 无未知测试数据。

## 11. 生产基线（G7 ✅）

清理前基线与 05-E-1A 基线**逐组全等**：counts（gir 2062/sm 2062/MAX 7217/MIN 4954/nullall 328/nullhist 327/nnhist 1734/insp 10/grids 62/users 63/gi 62/adm 1/conflict 0/hashnull 0/state 0）、历史 327 指纹 MD5 `2668ce0c…`、身份集合 `6a6c19f3…`、绑定 `e0d11e45…`、聚合 `86de62e9…`、人工 10 条、BT/EA/gt/go、WPS 2064、运行态 9 项、`.env` md5 `8e697bb7…`/4388B/mtime 16:33:49。

> 说明：旧审计脚本中的 `envExpect.schedulerEnabledKeyAbsent=false` 是 05-D 时代（05-E-0 之前）的陈旧期望；05-E-0 已授权显式新增 `SCHEDULER_ENABLED=false` 键，现值正确，非基线漂移。

**审计后终检**：recheck pass=true、fails=[] —— 审计期间零漂移。运行态：全程 PID 28168（≈16:56:20 启动，本阶段无新外部重启）、health ok。

## 12. STOP 条件（§十四 12 项）

| # | 条件 | 结果 |
|---|---|---|
| 1/2 | gt / go 无法唯一定位 | ✅ 未触发（唯一，三方一致） |
| 3 | 7217 存在未知业务引用 | ✅ 未触发（G9：FK 0 / 启发式仅 sync_map 自身 / 日志 0 / state 0） |
| 4 | go grid_id=1 无法证明是历史业务数据 | ✅ 未触发（05-C 前后快照双侧一致） |
| 5 | 三方 mapping 不一致 | ✅ 未触发 |
| 6 | 出现未知 SYNC05C 数据 | ✅ 未触发（仅已知两行/两条） |
| 7 | 基线发生未经解释的变化 | ✅ 未触发（与 05-E-1A 全等；envExpect 旧期望差异已归因） |
| 8 | Scheduler 非预期启动 | ✅ 未触发 |
| 9 | `.env` 非预期变化 | ✅ 未触发 |
| 10 | 生产非预期 DML | ✅ 未触发（recheck fails=[]） |
| 11 | WPS 非预期写入 | ✅ 未触发 |
| 12 | 发现其他测试数据 | ✅ 未触发 |

## 13. 最终结论

**`PHASE_WPS_PG_SYNC_05E1B0_COMPLETED_READY_FOR_05E1B`（PASS）**

```text
READ-ONLY：WPS writes = 0
          PG DML = 0（INSERT/UPDATE/DELETE 全零）
          DDL = 0
          Pull executions = 0
          Scheduler remains disabled
          .env unchanged（md5 8e697bb7…，mtime 16:33:49）
```

## 14. 下一阶段建议

`WPS-PG-SYNC-05-E-1B`：真正的测试数据三边受控清理，执行本报告 §6–§8 设计的 **Action A（gt 三边清理，WPS→sync_map→PG 单窗口顺序）** 与 **Action B（go marker 恢复 → 正式 Pull）**，须人工授权并携带：逐步 before/after 存在性证据、`pg_stat_user_tables` 删除增量核对、清理后新基线（预期 gir=2061/sm=2061/nullall=327/MAX=7192）与回滚快照（清理前备份 7217 行与 map 行全量 JSON 即可精确重建）。

---

**审计脚本**：`server/scripts/_wpssync05e1b0_gate.cjs`（只读；pullWpsToPg 运行期哨兵防误调用，`readOnlyProof.enginePullCalled=false`）
