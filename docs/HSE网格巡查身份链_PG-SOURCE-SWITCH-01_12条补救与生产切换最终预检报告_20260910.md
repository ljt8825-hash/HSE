# HSE 网格巡查身份链 · PG-SOURCE-SWITCH-01

## 12 条未映射记录补救 + PG 正式切换前最终预检

- **项目**：`G:\hse-dashboard`
- **后端**：`G:\hse-dashboard\server`
- **正式前端**：`G:\hse-dashboard\安全看板vben\apps\web-naive`
- **执行时间**：2026-09-10 22:13 ~ 22:20（GMT+8）
- **阶段性质**：**数据补救准备 + 只读预检**（零写业务数据、零切换）
- **最终状态**：`PHASE_PG_SOURCE_SWITCH_01_BLOCKED_WAITING_HUMAN_DECISION`

---

## 1. 执行摘要

上一阶段 `PG-SOURCE-SWITCH-00` 判定 `BLOCKED_READY_FOR_REMEDIATION`，阻塞项为 12 条 WPS 未映射记录、327 条 NULL grid_id 业务口径、切换窗口准备。本阶段完成了其中**可在只读条件下完成**的全部工作，并对 12 条记录建立了正式人工裁定机制。

**核心结论：12 条差异已 100% 溯源归因，但其中 8 条（B 池）属真实业务数据缺失，必须由人工批准后补迁；4 条（A 池）的处置方式存在两种合理解释，必须由人工裁定。故本阶段终态为 `BLOCKED_WAITING_HUMAN_DECISION`。**

| 维度 | 结论 |
|---|---|
| 12 条差异重锁（真实 API + PG + sync_map） | ✅ 12 条全部满足「WPS 存在 / PG 不存在 / sync_map 不存在」 |
| 分段闭合 | ✅ A=331（含重复 4）／B=1724／C=8 → 331+1724+8 = 2063 |
| A 池 4 条（疑似重复） | ⚠️ **HUMAN_DECISION_REQUIRED** —— 成因已查明，处置需人工裁定 |
| B 池 8 条（真实三违） | ⚠️ **建议补迁**（**≠ 已迁移**），`REQUIRES_HUMAN_APPROVAL = true` |
| **grid_id 推荐** | 🔴 **长指令推定「公司管理 → grid_id=1」仅对黄殿兴成立；本阶段实证修正为按人区分** |
| 327 条 NULL grid_id | ⚠️ `FAIL_CLOSED_ACCEPTED_PENDING_HUMAN_CONFIRMATION` |
| 切换前技术条件（数据 / 身份） | ✅ 全部 PASS（不变量成立） |
| PG own_grid 真机 | ✅ **29/29 ALL_PASS**，零残留，计数不变 |
| 字段级一致性 | ✅ **不一致 = 0**（2051 对全配对，含日期本地归一化 2051/2051） |
| 前端兼容性 | ✅ 完全数据源无关，切换零改动 |

### 🔴 本阶段最重要的修正（请优先阅读）

长指令 §六 推定 `公司管理 → grid_id=1`，并要求核验 `grid_id=1 → name=黄殿兴 / grid_code=G001`。**该核验成立**（实证见 §6）。但**该推定不能直接套用于全部 8 条**：B 池 8 条的巡查人是**两位不同的人**——刘金涛 6 条、黄殿兴 2 条。按与既有 PG 记录完全一致的口径（`网格等级` + `姓名 → grid_areas.name` 唯一 live 网格）：

```text
黄殿兴（总网格长）      → RECOMMENDED_GRID_ID = 1   (G001 / 黄殿兴 / 总网格长)
刘金涛（一级网格长）    → RECOMMENDED_GRID_ID = 6   (G006 / 刘金涛 / 一级网格长)
REQUIRES_HUMAN_APPROVAL = true
```

**若按长指令原样「统一补迁至 grid_id=1」，刘金涛的 6 条将被错误挂载到黄殿兴的网格**，与 PG 既有先例（刘金涛 历史记录 14 条在 grid 6、仅 1 条在 grid 1）相矛盾。故必须以**按人推荐**为准。

---

## 2. 本阶段性质与禁止事项执行证明

### 2.1 阶段边界

本阶段唯一目标为「数据补救准备 + 只读预检」。**未执行任何实际切换**。

### 2.2 禁止事项逐条执行证明

| # | 禁止事项 | 执行情况 | 证据 |
|---|---|---|---|
| 1 | 修改 `WPS_GRID_DATA_SOURCE` | ✅ 未改 | `.env` 仍为 `WPS_GRID_DATA_SOURCE=true`；mtime `2026-09-10 17:38:21`（早于本阶段 22:13） |
| 2 | 修改 `.env` | ✅ 未改 | 同上；本阶段无任何 `.env` 写入 |
| 3 | 重启生产 5876 | ✅ 未重启 | health `uptime` 持续增长（22:13 探测 uptime=946s，未归零） |
| 4 | 正式切换 WPS → PG | ✅ 未执行 | 见 §12 矩阵「生产数据源切换 = NOT_EXECUTED」 |
| 5 | 开启 `WPS_GRID_SYNC` | ✅ 未开启 | 仍为 `false` |
| 6–8 | 修改 WPS Schema / 字段 / 记录 | ✅ 未执行 | 仅调用 WPS `list_by_page`（只读 GET/POST list） |
| 9–11 | 按姓名推导 employee_id / 猜测 grid_id / 回填 327 / 回填 `inspector_employee_id` | ✅ 未执行 | 仅输出 `RECOMMENDED_GRID_ID` 与 `REQUIRES_HUMAN_APPROVAL`，**零写入** |
| 12–14 | 修改 JWT/auth/login、users 表结构、gridScope | ✅ 未执行 | `middleware/auth.js` mtime `19:19:33`、`services/gridScope.js` mtime `19:19:23`（均在阶段开始前） |
| 15–17 | 修改前端菜单 / 新增组件 / 修改 Vben Core | ✅ 未执行 | `views/site/grid-ledger/index.vue` mtime `09-08 20:14`；仅读取 |
| 18–19 | 开发 H5/mobile、开发新业务功能 | ✅ 未执行 | 无新增业务代码 |
| 20 | 开启 WPS-PG 双写 | ✅ 未开启 | 无任何双写路径被激活 |

### 2.3 写入面声明

- **唯一写入**：2 个本阶段产物文件（`server/scripts/_pgsource01_precheck.cjs`、`server/scripts/output/pgsource01-final-precheck.json`）。
- **业务数据写入**：0 条（`grid_inspection_records` / `grid_record_sync_map` / `grid_areas` / `users` / `employee` 全表零写）。
- **探针记录**：仅在 `_pgsource00_ownscope_test.cjs`（临时实例 PORT=5881 + 进程级 `WPS_GRID_DATA_SOURCE=false`）中创建 2 条探针并**立即删除**，结束时计数恢复 `2051 / 2051 / 62`。
- **DELETE ALL**：未执行任何真实清空。仅验证 ①权限层 403（grid_inspector）与 ③二次确认层 400（admin 缺 `confirmText`），两者均在删除动作**之前**返回。

### 2.4 关键文件 mtime（只读证明）

```text
server/.env                                              2026-09-10 17:38:21
server/routes/site-mgmt.js                               2026-09-10 19:21:30
server/routes/import.js                                  2026-09-03 14:21:26
server/services/gridScope.js                             2026-09-10 19:19:23
server/services/wpsGridMigrationService.js               2026-09-08 22:32:07
server/middleware/auth.js                                2026-09-10 19:19:33
server/services/wps/gridInspectionRepository.js          2026-09-08 20:29:23
安全看板vben/.../views/site/grid-ledger/index.vue        2026-09-08 20:14:26
安全看板vben/.../src/api/hse/site.ts                     2026-09-08 20:17:00
安全看板vben/.../router/routes/modules/hse-site.ts       2026-09-10 20:05:55
```

> 全部 mtime 均**早于**本阶段开始时间（22:13），证明生产业务代码与前端源码均未被本阶段修改。（`server/` 与前端源码为 git untracked，故以 mtime 为证。）

---

## 3. 12 条差异重锁结果（真实 WPS API + PG + sync_map）

**方法**：不信任阶段 00 的旧 JSON，直接从真实 WPS API（`listAllRecords`，2063 条）+ PG 全量 + `grid_record_sync_map` 重新计算。

### 3.1 分段复算（与 `wpsGridMigrationService.deriveCandidates.bandOf` 完全同口径）

```text
A 段（日期 ^2026-09-0[1-6]）        = 331 条
B 段（日期 ^2026-08）               = 1724 条
C 段（其余，含中文日期）            =    8 条
────────────────────────────────────────────
WPS 合计                            = 2063 条  (= 331 + 1724 + 8)

A 段保护性重复排除（组合A 键重复）  =    4 条
A 段实际候选（已迁 PG）             =  327 条
B 段（已迁 PG）                     = 1724 条
────────────────────────────────────────────
PG 合计                             = 2051 条  (= 327 + 1724)
```

### 3.2 12 条未映射三态断言

**12 条全部满足**：`WPS 存在 = true` / `PG 不存在 = true` / `sync_map 不存在 = true`。

```text
未映射 WPS ID：BS, BT, D_, EA, FD, FG, FN, FQ, FT, FU, FV, FW   （12 条）
```

| 断言 | 结果 |
|---|---|
| `all_in_wps`（12/12 在 WPS 中存在） | ✅ true |
| `all_absent_in_syncmap`（12/12 不在 sync_map） | ✅ true |
| `all_absent_in_pg`（12/12 在 PG 中无同编号、无同姓名同本地日期记录） | ✅ true |
| 计数闭合 `2051 + 12 = 2063` | ✅ true |

> 说明：`sync_map` 侧同时满足 `pg_orphan = 0`、`wps_orphan = 0`、`duplicate_pg = 0`、`duplicate_wps = 0`、`conflict=true = 0`。

---

## 4. A 池：4 条疑似重复（人工裁定表）

### 4.1 成员与三态核验

| WPS ID | 编号 | 姓名 | 日期 | 三违行为 | 违章人 | 裁定 |
|---|---|---|---|---|---|---|
| BS | L2604 | 王铁民 | 2026-09-02 08:23 | 无三违行为 | -- | 待人工确认 |
| BT | L2609 | 王铁民 | 2026-09-02 08:25 | 无三违行为 | -- | 待人工确认 |
| D_ | L2793 | 谢俊章 | 2026-09-05 11:15 | 无三违行为 | -- | 待人工确认 |
| EA | L2794 | 谢俊章 | 2026-09-05 11:15 | 无三违行为 | -- | 待人工确认 |

每一条均已核验：`WPS 存在 = true`、`PG 不存在 = true`、`sync_map 不存在 = true`（见 §3.2）。

### 4.2 成因实证（这是本阶段的精确结论）

排除发生在 **`services/wpsGridMigrationService.js` 的 A 段「保护性重复检查」**（源码 L39–L48）：

```js
// A 段保护性重复检查（组合A：姓名+日期+三违行为+违章人姓名），疑似重复排除（→C 段人工池）
const k = [姓名, 日期.slice(0,10), 三违行为, 违章人姓名].join('|');
const dupIdsInA = new Set([...dupMap.entries()].filter(([,v]) => v.length > 1).flatMap(([,v]) => v));
const candidates = aBand.filter((r) => !dupIdsInA.has(r.id));   // ← 成对同时排除
```

WPS A 段中存在 **2 组键完全相同的成对记录**：

```text
组1  键 = 王铁民|2026-09-02|无三违行为|   → BS (L2604), BT (L2609)
组2  键 = 谢俊章|2026-09-05|无三违行为|   → D_ (L2793), EA (L2794)
```

`dupIdsInA` **同时包含成对的两条**，故 `candidates` 把**两条一起排除**，而非「保留一条、排除一条」。

**关键澄清（修正旧表述）**：这 **不是** 「重复于 PG 已有记录」，而是 **WPS 内部自重复**导致成对整体排除。实证：

```text
PG 中 王铁民 2026-09 本地日期序列 = 09-01, 09-03, 09-04, 09-05, 09-06   ← 缺 09-02
PG 中 谢俊章 2026-09 本地日期序列 = 09-01, 09-02, 09-03, 09-04, 09-06   ← 缺 09-05
PG 中不存在 「王铁民 + 本地日期 2026-09-02」  的任何记录
PG 中不存在 「谢俊章 + 本地日期 2026-09-05」  的任何记录
```

### 4.3 人工裁定要点

| 若人工判定 | 则应补迁条数 | 说明 |
|---|---|---|
| 成对为「同日重复提交」，应保留 1 条 | **2 条**（王铁民 09-02 保留 1 + 谢俊章 09-05 保留 1） | 恢复缺失巡查日 |
| 成对为纯冗余，无需入库 | **0 条** | 维持现状 |

> 辅助信息：BS 比 BT 字段更完整（BS 含 `提交时间`/`是否补交`/`来源日期`/`标记`，BT 无）；D_ 与 EA 字段结构相同、时间戳同为 `11:15`。

**本阶段不执行任何删除、不执行任何迁移。**

---

## 5. B 池：8 条真实三违记录（建议补迁，等待批准）

### 5.1 成员与核验

| WPS ID | 姓名 | 分组 | 网格等级 | 日期（中文格式） | 三违行为 | 违章人 |
|---|---|---|---|---|---|---|
| FD | 刘金涛 | 公司管理 | 一级网格长 | 2026年09月02日 | 未穿工作服 | 赵万平 |
| FG | 刘金涛 | 公司管理 | 一级网格长 | 2026年09月02日 | 骑车不戴头盔 | 肖瑞红 |
| FT | 刘金涛 | 公司管理 | 一级网格长 | 2026年09月02日 | 背向来车方向作业 | 吕孟辉 |
| FU | 刘金涛 | 公司管理 | 一级网格长 | 2026年09月02日 | 骑车不戴头盔 | 张荣军 |
| FV | 刘金涛 | 公司管理 | 一级网格长 | 2026年09月02日 | 骑车不戴头盔 | 张英华 |
| FW | 刘金涛 | 公司管理 | 一级网格长 | 2026年09月04日 | 背向来车方向作业 | 刘玉花 |
| FN | 黄殿兴 | 公司管理 | 总网格长 | 2026年09月01日 | 骑车不戴头盔 | 王连方 |
| FQ | 黄殿兴 | 公司管理 | 总网格长 | 2026年09月04日 | 未穿工作服 | 许廷臣 |

### 5.2 七项必查断言（全部成立）

| # | 要求 | 结果 |
|---|---|---|
| 1 | WPS 存在 | ✅ 8/8 |
| 2 | PG 不存在 | ✅ 8/8 |
| 3 | sync_map 不存在 | ✅ 8/8 |
| 4 | 均含真实三违内容 | ✅ 8/8（`violation ≠ 无三违行为`） |
| 5 | 均属于公司管理 | ✅ 8/8（`分组名称 = 公司管理`） |
| 6 | 不属于赵书坤/郭秀梅历史身份问题 | ✅ 8/8（姓名为 刘金涛 / 黄殿兴） |
| 7 | 日期均为中文格式 `2026年09月xx日` | ✅ 8/8 |

**刘金涛 6 条 + 黄殿兴 2 条**——与长指令完全一致。

### 5.3 成因实证

`日期` 为中文格式 `2026年09月XX日`，`bandOf()` 既不匹配 `^2026-09-0[1-6]`（A 段）也不匹配 `^2026-08`（B 段）→ 判为 **C 段**。而生产迁移 `MIGRATION_SCOPE = 'A_ONLY'`，**C 段从未进入候选**，故 8 条从未写入 PG。

> **结论：这 8 条不是"重复"、不是"脏数据"，而是因日期格式异常被分段规则漏掉的真实三违记录。不得继续丢弃。**

**本阶段不执行迁移，仅输出建议与推荐 grid_id。**

---

## 6. grid_id 推荐证据（不写入）

### 6.1 `grid_id=1` 核验（长指令要求）

```sql
SELECT id, name, grid_code, personnel_id FROM grid_areas WHERE id = 1;
```

| id | name | grid_code | personnel_id | grid_level | area | township | is_deleted | employee |
|---|---|---|---|---|---|---|---|---|
| 1 | **黄殿兴** | **G001** | **6692** | 总网格长 | 环卫、绿化业务 | NULL | false | 黄殿兴（未删除） |

✅ **`grid_id=1 / name=黄殿兴 / grid_code=G001` 核验成立。**

### 6.2 🔴 关键修正：推荐值必须按人区分

B 池包含**两位不同巡查人**。补充核验 `grid_areas` 中按姓名的唯一 live 网格，以及 PG 中该姓名的既有网格分布（先例）：

```text
grid_areas: id=1  name=黄殿兴  grid_code=G001  personnel_id=6692  grid_level=总网格长
grid_areas: id=6  name=刘金涛  grid_code=G006  personnel_id=6698  grid_level=一级网格长

PG 既有记录·刘金涛 grid 分布 = grid 6: 14 条, grid 1: 1 条
PG 既有记录·黄殿兴 grid 分布 = grid 1: 11 条, grid 6: 1 条
```

推荐口径与既有先例、`网格等级` 完全一致：

| 姓名 | 网格等级 | 唯一 live 网格 | RECOMMENDED_GRID_ID | 对应 WPS ID |
|---|---|---|---|---|
| 黄殿兴 | 总网格长 | G001（grid 1，总网格长） | **1** | FN, FQ |
| 刘金涛 | 一级网格长 | G006（grid 6，一级网格长） | **6** | FD, FG, FT, FU, FV, FW |

```text
RECOMMENDED_GRID_ID      = { "黄殿兴": 1, "刘金涛": 6 }
REQUIRES_HUMAN_APPROVAL  = true
```

> ⚠️ **风险提示**：长指令 §六 的「公司管理 → grid_id=1」仅对黄殿兴成立。若按「统一 grid_id=1」补迁，刘金涛的 6 条会被错误挂载到黄殿兴的网格，与 PG 既有先例（刘金涛 14/15 条在 grid 6）矛盾。**必须按人推荐执行，并等待人工批准。**
>
> 说明：`公司管理` 并非单一网格；PG 既有 `area_team='公司管理'` 记录分布为 grid 6（15 条）、grid 1（12 条）、grid 4（6 条）、NULL（4 条）——即"公司管理"是按**巡查人所辖网格**归属，而非固定网格。

**本阶段不写入任何 grid_id。**

---

## 7. 327 条 NULL grid_id 最终确认与权限口径

### 7.1 最终确认（§八）

| 断言 | 结果 |
|---|---|
| 327 条全部存在 PG | ✅ true（`total_null = 327`） |
| 327 条全部有 sync_map | ✅ true（`has_syncmap = 327`，`missing_syncmap = 0`） |
| 327 条均为 2026-09 迁移批次 | ✅ true（`in_2026_09 = 327`，100%） |
| 327 条 grid_id 全部 NULL | ✅ true |
| 327 条允许通过权限层绕过 | ❌ **不允许**（SQL 层过滤，不可绕过） |

### 7.2 权限行为确认

```text
admin          → all_grid   → 可见 2051（含 327 NULL）
grid_inspector → own_grid   → 仅见自身 grid_id；327 NULL 不可见（SQL 层 fail-closed）
```

真机验证见 §9（A/B 均 `看不到 grid_id=NULL` → PASS）。

```text
327_NULL_GRID_POLICY = FAIL_CLOSED_ACCEPTED_PENDING_HUMAN_CONFIRMATION
```

> 人工口径未确认 → 本项维持 BLOCKED。**未修改任何数据。**

---

## 8. 切换前最终技术条件预检

### 8.1 数据（§九）

| 项目 | 期望 | 实测 | 结果 |
|---|---|---|---|
| `grid_inspection_records` | 2051 | **2051** | ✅ |
| `grid_record_sync_map` | 2051 | **2051** | ✅ |
| live `grid_areas` | 62 | **62**（全表亦 62，无软删） | ✅ |
| `conflict = true` | 0 | **0** | ✅ |
| PG orphan（grid_id 不存在于 grid_areas） | 0 | **0** | ✅ |
| WPS orphan（sync_map 指向不存在的 WPS 记录） | 0 | **0** | ✅ |
| 落在已删网格的记录 | 0 | **0** | ✅ |
| `grid_id IS NOT NULL` | — | 1724 | ✅ |
| `grid_id IS NULL` | — | 327 | ✅ |

### 8.2 身份（§九）

| 项目 | 期望 | 实测 | 结果 |
|---|---|---|---|
| users active | 63 | **63** | ✅ |
| `grid_inspector` | 62 | **62** | ✅ |
| `admin` | 1 | **1** | ✅ |
| `users.employee_id` 非空 | 62 | **62** | ✅ |
| `admin.employee_id` | 不修改 | **null（未修改，只读快照）** | ✅ |

### 8.3 字段级一致性复算（经正式 WPS adapter / FIELD_MAP）

```text
已配对条数                = 2051
字段级不一致总数          = 0
inspection_date 本地归一化 = pairs 2051 / match 2051 / mismatch 0
```

> ✅ PG 与 WPS 在 2051 条映射对上**字段级完全等价**。日期比对采用**本地日期分量**（`to_char(...,'YYYY-MM-DD')`），避免 UTC−8 假报。

---

## 9. PG own_grid 重新确认（真实 HTTP，真机）

**方法**：复用 `server/scripts/_pgsource00_ownscope_test.cjs` —— 独立**临时 Express 实例**（`PORT=5881` + 进程级 `WPS_GRID_DATA_SOURCE=false`），**不改 `.env`、不重启生产 5876**；写操作仅限自建探针（创建 → 立即删除）。

**账号**：A = `z1658`（emp 7099 / grid 48 / owned 32）；B = `g4977`（emp 6948 / grid 56 / owned 32）；admin。

```text
VERDICT = ALL_PASS  (29/29 pass)
```

| 断言 | 结果 |
|---|---|
| A GET 仅见自己网格 grid_id=48 | ✅ gridIds=[48] |
| A 看不到 grid_id=NULL（327 条） | ✅ false |
| A 记录数 = 自己网格记录数 | ✅ 32 |
| B GET 仅见自己网格 grid_id=56 | ✅ gridIds=[56] |
| B 看不到 grid_id=NULL | ✅ false |
| A 与 B 记录互不相交 | ✅ 0 |
| A 新增自动派生 `grid_id=48`、`inspector_employee_id=7099`（客户端 999999 被剥离、DTO 不外泄） | ✅ |
| A 改自己记录 → 200 且生效 | ✅ |
| A 改 B 记录 → **403 SCOPE_DENIED** 且 B 数据未被篡改 | ✅ |
| grid_inspector DELETE → 403 | ✅ |
| grid_inspector DELETE ALL → 403 | ✅ |
| 两次被拒后记录仍存在 | ✅ |
| admin GET 全量（2051+探针=2053），未受 scope 限制 | ✅ |
| grid_id=NULL 对 admin 可见（DB 侧存在 327） | ✅ |
| admin DELETE ALL 缺 `confirmText` → **400**（删除前拦截） | ✅ |
| admin 清理探针 → 探针零残留 | ✅ |
| 计数不变 | ✅ 2051 / 2051 / 62 |

> 未创建任何永久测试数据；未触发任何真实 DELETE ALL。

---

## 10. Excel 导入风险（只读确认，不修改）

**结论：导入确为 `/site-mgmt/grid-records` facade 之外的独立网关，本阶段不修复，列为后续独立治理事项。**

| 检查项 | 实测 | 结果 |
|---|---|---|
| 走 `/import/*` 而非 `/site-mgmt/grid-records` | `routes/import.js` 全部 `router.*` 挂 `/import/*` | ✅ |
| grid_inspector 不能使用 | 全部端点 `requireRole('admin','safety_manager')`（L1190/1283/1346/1378/1433/1462/1665/1804） | ✅ |
| admin / safety_manager 才可用 | 同上 | ✅ |
| 仍存在「姓名 → grid_id」匹配逻辑 | L2720–2746：`WHERE is_deleted=false AND grid_level=$1 AND (name=$2 OR name ILIKE $3)` | ✅ 存在 |
| 前端入口 | `useGenericImport.ts` → `GET /import/template/:module`、`POST /import/upload`、`POST /import/confirm` | ✅ |

> 该姓名模糊匹配与「禁止姓名作正式身份键」红线冲突，属**待治理**事项；因 grid_inspector 不可达，**不构成 own_grid 越权**。
>
> 附注：`routes/import.js` 另有一处内存降级路径（L3654–3662，`grid_id: null`），仅在无库内存模式生效，生产不适用。

---

## 11. 前端兼容性只读确认

**结论：切 PG 前端零改动。**

| 检查项 | 实测 | 结果 |
|---|---|---|
| 页面文件 | `views/site/grid-ledger/index.vue`（mtime 09-08 20:14，本阶段未改） | ✅ |
| 统一 facade 端点 | `api/hse/site.ts` 全部指向 `/site-mgmt/grid-records*` | ✅ |
| GET list | `getGridInspectionList` → `GET /site-mgmt/grid-records` | ✅ |
| GET filter-options | `getGridInspectionFilterOptions` → `GET /site-mgmt/grid-records/filter-options` | ✅ |
| POST | `createGridInspectionRecord` → `POST /site-mgmt/grid-records` | ✅ |
| PUT | `updateGridInspectionRecord` → `PUT /site-mgmt/grid-records/:id` | ✅ |
| DELETE | `deleteGridInspectionRecords` → `DELETE /site-mgmt/grid-records` | ✅ |
| DELETE ALL | `clearGridInspectionRecords` → `DELETE /site-mgmt/grid-records/all` | ✅ |
| GET detail | **不存在，也不需要**（页面零处引用） | ✅ |
| 页面是否使用 `gridId` / `grid_id` / `inspector*` | **0 处** | ✅ |
| 是否需要新增 WPS 专属字段 | 不需要 | ✅ |
| 是否需要修改页面 / 菜单 / Naive UI 主题 / Vben Core | 不需要（本阶段均未改） | ✅ |

---

## 12. 切换前状态矩阵（§十三）

| 项目 | 状态 |
|---|---|
| PG 数据完整性 | **PASS** |
| PG/WPS 2051 条一致性 | **PASS**（字段级不一致 = 0） |
| WPS 12 条差异 | **HUMAN_DECISION_REQUIRED** |
| 327 NULL grid_id | **HUMAN_POLICY_REQUIRED** |
| own_grid | **PASS**（真机 29/29） |
| PG CRUD | **PASS** |
| DELETE 保护 | **PASS**（grid_inspector 403 + admin 缺 confirmText 400） |
| 身份链 | **PASS** |
| 前端兼容 | **PASS** |
| Excel 导入治理 | **DEFERRED** |
| WPS row scope | **DEFERRED** |
| WPS-PG 双写 | **OFF** |
| 生产数据源切换 | **NOT_EXECUTED** |

---

## 13. 人工裁定机制与 `PG-SOURCE-SWITCH-02` 前置条件

### 13.1 正式人工裁定表

```text
12 条差异人工裁定表

A 池 4 条：
  BS / BT（王铁民 2026-09-02）  → 待人工确认（建议：保留 1 条）
  D_ / EA（谢俊章 2026-09-05）  → 待人工确认（建议：保留 1 条）

B 池 8 条：
  FD / FG / FT / FU / FV / FW（刘金涛）  → 建议补迁，推荐 grid_id = 6，等待人工批准
  FN / FQ（黄殿兴）                      → 建议补迁，推荐 grid_id = 1，等待人工批准
```

> 「建议补迁」**不等于**「已经迁移」。本阶段零迁移。

### 13.2 `PG-SOURCE-SWITCH-02` 前置条件（切换前 Checklist）

| # | 前置项 | 状态 |
|---|---|---|
| 1 | 人工裁定 A 池 4 条（保留 1 条 / 全部舍弃） | ⏳ 待人工 |
| 2 | 人工批准 B 池 8 条补迁 + 确认按人推荐 grid_id（刘金涛=6 / 黄殿兴=1） | ⏳ 待人工 |
| 3 | 书面确认 327 条 NULL grid_id 对 grid_inspector 不可见（fail-closed 保持现状） | ⏳ 待人工 |
| 4 | 确认维护窗口（切 PG 需重启 5876，进程内模式缓存一次） | ⏳ 待人工 |
| 5 | 确认切换瞬间无新增 WPS 写入（`WPS_GRID_SYNC=false`，无自动同步） | ✅ 已具备（`WPS_GRID_SYNC=false`） |
| 6 | 数据库备份（`grid_inspection_records` / `grid_record_sync_map` / `grid_areas`） | ⏳ 待执行 |
| 7 | 技术条件全部 PASS（数据 / 身份 / own_grid / CRUD / 前端） | ✅ 本阶段已确认 |

### 13.3 切换后立即验证（Checklist）

| # | 验证项 |
|---|---|
| 1 | 重启后 `GET /api/health` 正常；`grid_inspector` 权限已在 `ROLE_PERMISSIONS_MAP` 加载 |
| 2 | `grid_inspector` GET → 仅见自身 grid；`total` ≤ 自身网格记录数 |
| 3 | `admin` GET → `total = 2051`（+ 新增探针，如有） |
| 4 | 327 NULL 仍不可被 `grid_inspector` 看到 |
| 5 | 新增记录自动派生 `grid_id` / `inspector_employee_id` |
| 6 | 前端页面（5173 → vite proxy → 5876）列表 / 新增 / 修改 / 筛选均正常 |
| 7 | 计数不变量：2051 / 2051 / 62 不变 |
| 8 | Vite proxy 仍指向 `127.0.0.1:5876`（无需改动） |

### 13.4 可延后处理

- 前端按钮级权限（删除/清空入口按角色隐藏；后端已 403，不构成风险）
- Excel 导入网关的姓名匹配治理
- WPS row scope（已于 WPS-ROW-SCOPE-00 判定 `BLOCKED_BY_MISSING_GRID_KEY`）
- `inspector_employee_id` 历史回填（2051 条 100% NULL，不阻塞 own_grid）
- 327 条 NULL grid_id 回填

### 13.5 禁止自动处理

- 禁止按姓名自动推导 employee_id / grid_id
- 禁止自动迁移 12 条
- 禁止自动回填 327 条
- 禁止为「数据显示完整」而放宽 own_grid 权限
- 禁止开启 WPS-PG 双写
- 禁止在无人工批准下执行「统一 grid_id=1」

### 13.6 WPS 切换后定位

`WPS_GRID_DATA_SOURCE=false` + `WPS_GRID_SYNC=false` 后，WPS 应定位为：

```text
A. 外部采集源       ← 现场巡查数据的第一落地点（移动端/小程序提交）
B. 历史原始数据源   ← 2051 条对应的原始记录留存，用于对账与追溯
C. 只读数据保留     ← 可继续只读查询，不参与 HSE 正式权限判断
```

**核心要求：WPS 可继续保留，但不再参与 HSE 正式权限判断**——权限判断全部由 PG 的 `grid_id` + `grid_areas.personnel_id` 承担。

**唯一切换操作面**：`.env` 改 `WPS_GRID_DATA_SOURCE=false` + **重启 5876**（模式在进程内缓存一次）；`WPS_GRID_SYNC` 保持 `false`；前端零改动。

---

## 14. 数据计数前后对比

| 计数项 | 阶段开始（本阶段只读快照） | 阶段结束 | 变化 |
|---|---|---|---|
| `grid_inspection_records` | 2051 | **2051** | 0 |
| `grid_record_sync_map` | 2051 | **2051** | 0 |
| live `grid_areas` | 62 | **62** | 0 |
| `grid_areas`（全表） | 62 | **62** | 0 |
| users active | 63 | **63** | 0 |
| — `grid_inspector` | 62 | **62** | 0 |
| — `admin` | 1 | **1** | 0 |
| `users.employee_id` 非空 | 62 | **62** | 0 |
| `WPS` 记录数（外部，只读） | 2063 | **2063** | 0 |
| `conflict = true` | 0 | **0** | 0 |
| WPS 未映射 | 12 | **12** | 0 |

> 探针记录在同一测试会话内「创建 → 删除」，净变化 0；前后快照完全一致。

---

## 15. 产物清单与证据附录

### 15.1 本阶段产物

| 类型 | 路径 |
|---|---|
| 只读预检脚本 | `server/scripts/_pgsource01_precheck.cjs` |
| 结构化 JSON | `server/scripts/output/pgsource01-final-precheck.json` |
| 本报告 | `docs/HSE网格巡查身份链_PG-SOURCE-SWITCH-01_12条补救与生产切换最终预检报告_20260910.md` |

### 15.2 复用的既有产物（只读）

| 类型 | 路径 |
|---|---|
| own_grid 真机测试脚本 | `server/scripts/_pgsource00_ownscope_test.cjs` |
| own_grid 测试结果 | `server/scripts/output/pgsource00-ownscope-test.json`（本次重跑覆盖，29/29） |
| 阶段 00 审计脚本 / 结果 | `_pgsource00_audit.cjs` / `_pgsource00_audit2.cjs` / `pgsource00-audit.json` / `pgsource00-audit2.json` |

### 15.3 关键源码引用（只读）

| 用途 | 位置 |
|---|---|
| 分段 + A 段保护性重复（排除根因） | `services/wpsGridMigrationService.js` L23–L49 |
| 迁移 scope | `services/wpsGridMigrationService.js` L23（`MIGRATION_SCOPE = 'A_ONLY'`） |
| own_grid scope | `services/gridScope.js` |
| GET/PUT/POST/DELETE + 三层删除保护 | `routes/site-mgmt.js` L1447–L1834 |
| grid_inspector 权限项 | `middleware/auth.js`（`hse:site:grid:view/create/update`，无 delete/purge） |
| Excel 导入独立网关 | `routes/import.js`（全端点 `requireRole('admin','safety_manager')`；L2730 姓名匹配） |
| 前端统一 facade | `apps/web-naive/src/api/hse/site.ts` L392–L421 |

---

## 16. 最终状态

```text
PHASE_PG_SOURCE_SWITCH_01_BLOCKED_WAITING_HUMAN_DECISION
```

**判定依据**：

- 12 条差异中，**B 池 8 条**（真实三违记录）需人工批准补迁 → 仍等待人工决定；
- **A 池 4 条**处置方式存在两种合理解释，需人工裁定 → 仍等待人工决定；
- **327 条 NULL grid_id** 业务口径需人工书面确认 → 仍等待人工决定；
- 其余全部技术条件（PG 数据完整性、PG/WPS 一致性、own_grid、PG CRUD、DELETE 保护、身份链、前端兼容）均 **PASS**，**未发现新的技术问题**。

> 若以上三项人工决定完成，则可进入 `PHASE_PG_SOURCE_SWITCH_01_READY_FOR_PRODUCTION_SWITCH`，并在人工明确批准后进入 `PG-SOURCE-SWITCH-02` 正式生产数据源切换阶段。

### 阶段终止

**本阶段已立即停止。** 未执行 `WPS_GRID_DATA_SOURCE=false`、未重启 5876、未迁移 12 条、未回填 327 条、未开启 `WPS_GRID_SYNC`。等待人工明确批准后再进入下一阶段。
