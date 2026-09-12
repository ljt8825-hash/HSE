# WPS-PG-SYNC-05-C 受控新增/修改同步验证报告

- 项目：`G:\hse-dashboard`（后端 `server`，生产端口 `5876`）
- 阶段：**WPS-PG-SYNC-05-C —— 受控新增 + 修改 + 幂等三重同步验证**
- 上一阶段：`PHASE_WPS_PG_SYNC_05B_COMPLETED_READY_FOR_05C`
- **本阶段终态：`PHASE_WPS_PG_SYNC_05C_COMPLETED_READY_FOR_05D`（PASS）**
- 报告日期：2026-09-11
- 验收脚本：`server/scripts/_wpssync05c_controlled_change.cjs`（子命令式：`audit / create / update / idem`，每个子命令独立进程）
- 证据：`server/scripts/output/wpssync05c-{audit,create,update,idem}.json`、`wpssync05c-{create,update,idem}-raw.json`（Pull 窗口即时落盘）、汇总 `wpssync05c-controlled-change.json`

**测试对象登记（§十八，供后续测试数据治理）**：
- 新增：`testWpsRecordId = gt`、`testPgRecordId = 7217`、`serial_no = SYNC05C-TEST-20260911-001`、`marker = SYNC05C-CREATE-TEST`
- 修改：`wps_record_id = go`、`pg_record_id = 6796`、字段 = `标记`（null → `SYNC05C-UPDATE-TEST`）

---

## 1. beforeSnapshot（§二 只读审计，与 05-B 终态比对）

审计时点 12:53，**baselineDiffs = []**（任何不一致即 BLOCKED 的门禁未触发）。基线：

| 指标 | 值 | 指标 | 值 |
|---|---|---|---|
| 生产 PID | **27248**（≈10:58:58 外部启动，加载 SYNC-02） | `/api/health` | 200 ok |
| gir / sync_map | 2061 / 2061 | MAX(id) / MIN(id) | 7192 / 4954 |
| NULL grid_id（历史 ≤7192） | 327，MD5 `2668ce0c51f9f29b3e1272ba7cc56288` | inspector 非空（历史） | 10 |
| grids / users / gi / adm | 62 / 63 / 62 / 1 | conflict / state 表 | 0 / 0 行 |
| sync_hash 聚合 | `f5b2f630…`（n=2061） | 绑定指纹 | `0d6821ba…`（n=distinctkeys=2061） |
| WPS total | **2063**（WPS-only 恰 = [BT, EA]，mapped missing = 0） | hashnull | 0 |
| 图片列（历史） | 2035 / 557 / 0 | `'--'`（历史） | 1213 |
| 人工 10 条 | 7183–7192 逐条匹配期望 | `.env` | mtime `2026-09-11 07:13:11.963` / 4225B / md5 `dcbfd1c0…` |

## 2. WPS 新增记录快照（§四 受控 CREATE，本阶段两次批准的 WPS 写之一）

- 时间：12:54；调用 `wps.createRecords` **恰好 1 次**。
- 载荷（全字段明文记录）：`{编号: SYNC05C-TEST-20260911-001, 姓名: 05C同步测试, 分组名称: 05C测试分组, 三违行为: SYNC05C 受控新增测试记录（非真实三违数据）, 标记: SYNC05C-CREATE-TEST}`
- 返回：**新 WPS Record ID = `gt`**，回读确认 total 2063 → **2064**、新记录在位、全板 SYNC05C 测试记录恰 1 条（STOP#19 未触发）。
- fileId/sheetId：`cn229thwalDs / 3`；创建前后既有 WPS 记录零改动。

## 3. 新增 Pull result（真实 Pull#1，12:54:45.055 → 12:54:47.672，2617ms）

| 指标 | 期望（§六） | 实际 |
|---|---|---|
| totalWps / pulled | 2064 / 2064 | ✅ |
| newCandidates / inserted | 1 / 1 | ✅ |
| alreadyExists / skippedUnchanged | 2061 / 2061 | ✅ |
| skippedExcluded / bt / ea | 2 / 1 / 1 | ✅ |
| conflicts / wpsDeleted / pgDeleted / errors | 全 0 | ✅ |

期望块 14 项 **0 mismatch**；DML 捕获：**INSERT=2**（业务行 + sync_map，单事务）、UPDATE/DELETE/DDL=0；Pull 窗口内 WPS 写 = 0。

## 4. UPDATE 测试记录快照（§七）

- 目标选定：`sync_map` 内 + `grid_id` 非空 + 非人工 10 条 + 非 BT/EA + **预检「改 marker 后引擎视角差异仅 marker 一项」**，按 pg_record_id 倒序取首 → **pg=6796 / wps=go**（grid_id=1，inspector=NULL）。
- 修改前：WPS 全字段快照、PG 行快照、`sync_hash`、绑定关系均已存证（`wpssync05c-audit.json`/`-update.json`）。
- 修改内容：仅 `标记` 字段：`null → "SYNC05C-UPDATE-TEST"`；载荷采用**全字段合并**（`{...before, 标记: 新值}`）规避整体替换风险。
- WPS 回读校验：**字段级 diff 恰 1 项且为「标记」**（其余字段逐项不变）。
- 修改前 `sync_hash` 与绑定：已冻结存证；禁止修改项（wps_record_id/fileId/grid_id/inspector/BT/EA）均未触碰。

## 5. UPDATE Pull result（真实 Pull#2，12:55:32.086 → 12:55:34.707，2621ms）

| 指标 | 期望（§八） | 实际 |
|---|---|---|
| changedCandidates / updated | 1 / 1 | ✅ |
| inserted / newCandidates | 0 / 0 | ✅ |
| skippedUnchanged / alreadyExists | 2061 / 2062 | ✅ |
| skippedExcluded / conflicts / wpsDeleted / pgDeleted / errors | 全 0 | ✅ |

期望块 13 项 **0 mismatch**；DML 捕获：**UPDATE=2**（业务列 + sync_map 基线，同事务）、INSERT/DELETE/DDL=0；Pull 窗口内 WPS 写 = 0。

**§八 逐项证明**：
- 被修改字段 `WPS值 == PG值`：`marker = "SYNC05C-UPDATE-TEST"` 两端一致 ✅
- `grid_id before == after`：1 → 1 ✅；`inspector_employee_id before == after`：NULL → NULL ✅
- 绑定不变：`go | cn229thwalDs → 6796` 前后一致 ✅；`sync_hash` 已 rebaseline 为新哈希（`hashRebaselined` 语义）✅
- UPDATE 语句未触碰 grid_id / inspector_employee_id（DML 语句捕获核对）✅

## 6. 最终幂等 Pull result（真实 Pull#3，12:55:52.805 → 12:55:55.667，2862ms）

| 指标 | 期望（§九） | 实际 |
|---|---|---|
| newCandidates / changedCandidates | 0 / 0 | ✅ |
| inserted / updated | 0 / 0 | ✅ |
| pgDeleted / errors / conflicts / wpsDeleted | 全 0 | ✅ |
| totalWps / skippedUnchanged / skippedExcluded | 2064 / 2062 / 2 | ✅ |

- 2063 条原数据：BT/EA 继续排除（bt=1, ea=1）；修改测试记录（go）转为 **unchanged**；新增测试记录（gt）保持正常映射。
- DML 全 0；`pg_stat_user_tables` 三表计数增量全 0；`sync_hash` 聚合与 `last_sync_at/pg_updated_at` 聚合指纹前后不变。
- **真实 Pull 预算：1 + 1 + 1 = 恰好 3 次**（每阶段脚本先校验前一阶段证据中的计数，防重复 Pull）。

## 7. PG before/after

| 阶段 | gir | sm | MAX(id) | nullall | nullhist | nnhist | insphist |
|---|---|---|---|---|---|---|---|
| audit（05-B 终态） | 2061 | 2061 | 7192 | 327 | 327 | 1734 | 10 |
| Pull#1 后 | **2062** | **2062** | **7217** | 328 | 327 | 1734 | 10 |
| Pull#2 后 | 2062 | 2062 | 7217 | 328 | 327 | 1734 | 10 |
| Pull#3 后 | 2062 | 2062 | 7217 | 328 | 327 | 1734 | 10 |

- 新 PG id = **7217**（= 序列 nextval 预测值，`last_value=7216→7217, is_called=true`，仅前进 1 步；无异常增长，STOP#16 未触发）。
- MIN(id)=4954、grids/users/gi/adm 全程不变。

## 8. sync_map before/after

| 阶段 | n | distinctkeys | 绑定指纹 MD5 |
|---|---|---|---|
| audit | 2061 | 2061 | `0d6821ba…`（05-B 冻结值） |
| Pull#1 后 | **2062** | **2062** | `e0d11e45…`（+1 新绑定 gt→7217，键唯一） |
| Pull#2 后 | 2062 | 2062 | `e0d11e45…`（go 的绑定未变，仅 sync_hash 更新） |
| Pull#3 后 | 2062 | 2062 | `e0d11e45…`（不变） |

- 新绑定行：`{pg_record_id: 7217, wps_record_id: 'gt', wps_file_id: 'cn229thwalDs', wps_sheet_id: 3, conflict: false}`。
- **无任何重新绑定/改绑**（STOP#9 未触发）。

## 9. 327 NULL 集合指纹（§十一，历史集合与测试行分列统计）

- **历史 327 条**（id ≤ 7192）：SUM=2275920 / COUNT=327 / MIN=6797 / MAX=7123 / **MD5 `2668ce0c51f9f29b3e1272ba7cc56288`** —— 三次 Pull 前后完全不变 ✅
- **本阶段新增测试行**（id=7217，grid_id=NULL）：单独统计，nullall = 328 = 327（历史）+ 1（测试行），两者严格分离 ✅

## 10. 10 条人工记录指纹（§十）

7183 `60/6789`、7184 `14/7437`、7185–7190 `6/6698`、7191–7192 `1/6692` —— 三次 Pull 前后逐条匹配，`mismatch=[] missing=[] extra=[]` ✅。
历史身份集合指纹（`id:grid_id:inspector_employee_id`，id≤7192）：三阶段前后不变（`dd019ca3…`）；新增测试行 NULL/NULL 单独登记，不混入集合 ✅。

## 11. BT / EA 排除证据（§十二）

- WPS：BT、EA 全程存在（`btExists/eaExists = true`）。
- PG sync_map：`wps_record_id IN ('BT','EA')` 三次快照均 **0 行**。
- Pull：bt=1、ea=1、skippedExcluded=2（`FROZEN_EXCLUSIONS` 检查先于幂等判定）✅

## 12. WPS write calls（§十四）

| 调用 | 次数 | 授权依据 |
|---|---|---|
| createRecords | **1** | §四 明确批准的受控 CREATE（测试记录） |
| updateRecords | **1** | §七 明确要求的单字段修改（受控测试写） |
| deleteRecords | **0** | 恒禁 |
| Pull 窗口内（3 次） | **0** | 引擎单向只读拉取 |

> 说明：任务书 §四/§十四 所列「updateRecords = 0」指**未经批准的** WPS 写（STOP#2 为「非批准 WPS WRITE > 0」）；§七 本身即要求修改一条 WPS 记录，故该单字段修改为任务书内批准的受控测试写，全程 WPS 写合计恰好 2 次（1 CREATE + 1 UPDATE），均逐字段快照存证。

## 13. PG DML 统计（语句捕获 + pg_stat 双重证据）

| Pull | INSERT | UPDATE | DELETE | DDL | SELECT（引擎自读） |
|---|---|---|---|---|---|
| #1（新增） | **2**（gir+sm） | 0 | 0 | 0 | 5 |
| #2（更新） | 0 | **2**（gir+sm） | 0 | 0 | 4 |
| #3（幂等） | 0 | 0 | 0 | 0 | 4 |

`pg_stat_user_tables` 增量与语句捕获一致（Pull#1：gir ins+1 / sm ins+1；Pull#2：gir upd+1 / sm upd+1；Pull#3：全 0）✅

## 14. image 列保护证据

- 历史图片值集合指纹（id≤7192 三列联合 MD5）：三阶段前后不变 ✅
- 新增测试行 image_content / rectified_photo / schematic 全 NULL（无 WPS 图片字段 → fail-safe 键省略）✅
- UPDATE 语句捕获中触碰 image 列的语句 **0 条**；imageWarnings 仅 fail-safe 占位符告警 ✅

## 15. protected columns touched 统计

`grid_id` / `inspector_employee_id` 被写入的语句：**0 条**（引擎 `assertNoProtectedColumns` 硬断言 + DML 捕获双重证明）；新增行两列恒 NULL；UPDATE 前后两列逐值不变 ✅

## 16. natural key 命中统计

- `naturalKey` / `findPgIdByNaturalKey` 全项目命中 **0 处**（静态复证）。
- 幂等键全程 = `(wps_record_id, wps_file_id)`；新绑定以 WPS Record ID `gt` 定位，与 serialNo/姓名/日期无关 ✅

## 17. grid / inspector inference 统计

- 引擎投影不含 grid_id/inspector_employee_id（fail-closed）；新行两列 NULL；无姓名/分组/岗位/乡镇→grid 或 WPS→inspector 推断：**0 次推断** ✅
- 测试记录姓名「05C同步测试」仅写入 `personnel_name` 文本快照列，未触发任何人员关联。

## 18. Scheduler 状态（§十五）

- `syncEnabledByEnv=false`、`running=false`、`grid_record_sync_state` 全程 **0 行**；未新增任何 cron / setInterval / PM2 / 计划任务 ✅

## 19. .env mtime/hash

- mtime：`2026-09-11 07:13:11.963`（UTC `2026-09-10T23:13:11.963Z`）——**全程未变**；bytes=4225；md5=`dcbfd1c0baf8e3f47ff731edff41167e`；`WPS_GRID_SYNC=false`、`WPS_GRID_DATA_SOURCE=false` ✅
- 引擎驱动仅通过一次性进程级 `process.env.WPS_GRID_SYNC='true'`（与 05-A/05-B 相同，进程退出即消失）。

## 20. STOP 条件逐项核查（§十七，21 项）

| # | 条件 | 结果 | 证据 |
|---|---|---|---|
| 1 | PG DELETE > 0 | ❌ 未触发 | 三次 Pull delete=0；pg_stat del 增量 0 |
| 2 | 非批准 WPS WRITE > 0 | ❌ 未触发 | 仅批准的 1 CREATE + 1 UPDATE；Pull 窗口 0 |
| 3 | DDL > 0 | ❌ 未触发 | ddl=0 |
| 4 | BT/EA 进入 PG | ❌ 未触发 | sync_map 中 0 行 |
| 5 | 历史 327 NULL 集合变化 | ❌ 未触发 | MD5 五项指纹不变 |
| 6 | 10 条人工记录漂移 | ❌ 未触发 | mismatch/missing/extra 全空 |
| 7 | inspector_employee_id 被自动修改 | ❌ 未触发 | insphist=10 不变；UPDATE 前后 NULL 不变 |
| 8 | grid_id 被自动修改 | ❌ 未触发 | nnhist=1734 不变；目标行 1→1 |
| 9 | sync_map 被重新绑定 | ❌ 未触发 | go→6796 绑定不变；键唯一 |
| 10 | natural key 被用于绑定 | ❌ 未触发 | 命中 0 |
| 11 | WPS → PG 身份推断 | ❌ 未触发 | 新行 inspector=NULL |
| 12 | group → grid 推断 | ❌ 未触发 | 新行 grid=NULL |
| 13 | WPS → inspector 推断 | ❌ 未触发 | 新行 inspector=NULL |
| 14 | errors > 0 | ❌ 未触发 | 三次 Pull errors=[] |
| 15 | 未授权 INSERT > 0 | ❌ 未触发 | 仅 Pull#1 的 1 条业务 INSERT（批准路径） |
| 16 | MAX(id) 异常增长 | ❌ 未触发 | 7192→7217（序列 nextval 恰 +1 步） |
| 17 | Scheduler 自动启动 | ❌ 未触发 | staterows=0；running=false |
| 18 | .env 被修改 | ❌ 未触发 | mtime/bytes/md5 不变 |
| 19 | 第二条以上 WPS 新增测试数据 | ❌ 未触发 | SYNC05C 标记记录恒 1 条 |
| 20 | 图片列被非必要覆盖 | ❌ 未触发 | 历史图片指纹不变；触碰语句 0 |
| 21 | push 重新开放 | ❌ 未触发 | 认证 `/push` → 410 `REVERSE_WRITE_DISABLED`（audit/idem 双时点验证） |

**触发数：0 / 21。**

## 21. 最终结论

新增验证 PASS + UPDATE 验证 PASS + 第三次 Pull 幂等 PASS + 327 NULL PASS + 10 条人工记录 PASS + BT/EA PASS + 身份安全 PASS + WPS 反向写安全 PASS + PG DELETE=0 + DDL=0 + Scheduler 未启动 + .env 未修改 ⇒

```text
PHASE_WPS_PG_SYNC_05C_COMPLETED_READY_FOR_05D
```

> 本阶段未开启 Scheduler、未做定时同步、未做 legacy cleanup、未做 WPS 全量重同步、未修改身份架构与既有 grid_id/inspector_employee_id 数据；真实 Pull 恰好 3 次且每次均有完整 before/after 证据。**未自行进入 05-D。**
>
> 遗留测试数据（不清理，按 §十八 留待单独治理）：WPS `gt`（编号 SYNC05C-TEST-20260911-001）↔ PG id 7217；WPS `go`（pg 6796）的 `标记` 字段现为 `SYNC05C-UPDATE-TEST`。

## 附录：执行环境与工程纪律

- 生产 PID 27248（外部 ≈10:58:58 启动，加载 SYNC-02；本会话重启 0 次）。
- 脚本工程质量（§十九）：所有 SELECT 具名 FROM；别名全小写；prodConn 外层持有、catch 同步 release 后立即退出（绝不 await pool.end()）；6 分钟看门狗；每次 Pull 窗口即时落盘 raw 证据；Pull 失败不自动重试；子命令间以证据文件中的 `realPullExecutions` 计数互锁防重复 Pull。
- 05-C 全程未修改任何引擎/服务/路由源码（mtime 冻结：engine 08:39:40 / service 08:15:42 / fieldMap 08:14:02 / wpsClient 09-08 18:45 / routes 08:16:03）。
