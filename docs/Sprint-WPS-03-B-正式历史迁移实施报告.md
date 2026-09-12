# Sprint-WPS-03-B 正式历史迁移实施报告（第一阶段：实现 + Dry Run）

> **状态：IMPLEMENTATION_READY**
> （实现与 DRY_RUN 完成，零写入。**本阶段未执行 EXECUTE**，等待人工明确批准："批准执行 Sprint-WPS-03-B 正式迁移"。）

- 时间：2026-09-08 21:45 前后
- 新增代码：`server/services/wpsGridMigrationService.js`（专用迁移事务服务）、`server/scripts/_wps03b_migrate.cjs`（DRY_RUN/EXECUTE 双模式脚本）
- 前置依据：Sprint-WPS-02-C PASS / 03-0 READY / 03-A v2 DRY_RUN_READY_FOR_REVIEW / 03-B-0 READY_FOR_FORMAL_MIGRATION

---

## 一、实现内容

### 1. 专用迁移事务服务（不复用同步链路）

`wpsGridMigrationService.js` —— 独立于 `wpsGridSyncService`，**未调用 `bindMap()`**：

| 要求 | 实现 |
|---|---|
| 事务模型 | 逐条独立事务：`pool.connect()` → `BEGIN` → `INSERT grid_inspection_records (...) RETURNING id` → `INSERT grid_record_sync_map`（**纯 INSERT，无 ON CONFLICT DO UPDATE**）→ `COMMIT`；任一步失败 `ROLLBACK` |
| 半成功防护 | PG 记录 ⇔ sync_map 映射同事务落库，不存在单边状态 |
| 唯一键冲突 | `23505` → ROLLBACK → 按 `wps_record_id + wps_file_id` 重读判定为 ALREADY_EXISTS/CONFLICT，**禁止改绑** |
| 幂等键 | 唯一权威键 = `wps_record_id(varchar) + wps_file_id`；serial_no/姓名/日期/组合字段/行号一律不用 |
| 范围硬保护 | `MIGRATION_SCOPE='A_ONLY'` 代码级常量 + 安全门：候选数 ≠ 327 退出；候选混入非 A 段退出；CONFLICT/ORPHAN > 0 退出 |
| 双模式 | `DRY_RUN`（默认）/ `EXECUTE`（仅显式传参触发）；DRY_RUN 全程零写入并做前后快照比对 |
| 失败重试 | 逐条状态 SUCCESS / ALREADY_EXISTS / CONFLICT / FAILED；重跑仅处理 NOT_EXISTS 子集；已成功按幂等键跳过 |

### 2. 数据规则（严格沿用 v2）

- 23 个目标字段映射不变；`"nan"` 伪空 → NULL（327/327）
- 脏值（"64.60"/"60岁"/"女′" 等 9 条）**原样保留**仅 WARNING（PG `violator_gender`/`violator_age` 均为 varchar，可承载）
- 照片仅合法 http(s) URL 入库：三违 327/327、整改 84、示意图 0；非 URL 置 NULL 不伪装；DISPIMG = 0
- **inspectorEmployeeId = NULL（327/327 NOT_FILLED）**，PG 无该列（实读确认），双重保险；赵书坤 7085/8259、郭秀梅 7172/7947/9478 不猜测，留 Batch 3
- **violatorEmployeeId = RESERVED**，只写 violator_name，零自动绑定
- 不触碰 users / JWT / 登录 / employee 主数据 / WPS 原始数据 / B 段 / C 段 / 疑似重复 4 条

## 二、DRY_RUN 执行结果（零写入实证）

| 项 | 结果 |
|---|---|
| 安全门 | **pass=true**（scope=A_ONLY ✓、候选=327 ✓、零 B/C 混入 ✓、CONFLICT=0 ✓、ORPHAN=0 ✓） |
| A 候选 | 327（实时推导，与 v2 同口径） |
| 幂等预检 | **NOT_EXISTS=327 / ALREADY_EXISTS=0 / CONFLICT=0 / ORPHAN=0** |
| 迁移状态 | **READY=306 / WARNING=21**（12 多人匹配 + 9 脏值；与 v2 完全一致，仅作记录不阻塞） |
| 将处理 / 跳过 | 327 / 0 |
| 特殊值 | nan→NULL=327；脏值保留=9 |
| 图片 | 三违 327、整改 84、示意图 0 |
| 快照比对 | PG 1724→1724（maxId 6796 不变）、sync_map 1724→1724，**unchanged=true** |

> 口径说明：迁移 DTO 的身份匹配结论记录在逐条 `identity` 元数据（matchType/candidateIds），多人匹配同时记入 warnings——与 v2 的 306/21 分布完全一致。

## 三、EXECUTE 模式预置能力（未执行）

- 理论结果：`grid_inspection_records 1724 → 2051`、`grid_record_sync_map 1724 → 2051`，新增各 **327**；数量不符 → 判定 MIGRATION_FAILED
- 迁移后自动对账：① 幂等复检（期望 ALREADY_EXISTS=327 / CONFLICT=0 / ORPHAN=0）；② 逐条对账文件（WPS_RECORD_ID / PG_RECORD_ID / serial_no / inspection_date / personnel_name / migration_status）；③ 字段级对账（personnel_name、inspection_date、violation_behavior、serial_no、image_content 非空 = 327/327；rectified_photo=84；`is_resubmit` 中 "nan"=0）
- 执行命令（批准后手动运行）：`node scripts/_wps03b_migrate.cjs EXECUTE`

## 四、产物清单（`server/scripts/output/`）

| 文件 | 内容 |
|---|---|
| `wps03b-pre-migration-snapshot.json` | 迁移前快照（count/maxId/月度分布/file_id 分布） |
| `wps03b-dryrun-summary.json` | DRY_RUN 汇总（含安全门、前后快照、unchanged） |
| `wps03b-dryrun-records.json` | 327 条逐条 DTO 预览（含 targetPreview/insertColumns/identity/warnings） |
| `wps03b-dryrun-warning.json` | 21 条 WARNING 明细 |
| `wps03b-idempotency-preview.json` | 幂等预览（NOT_EXISTS=327 等） |
| `wps03b-execution-plan.json` | 执行计划（事务模型/理论结果/处理集/跳过集） |

## 五、最终结论

```text
Sprint-WPS-03-B（第一阶段）
状态：IMPLEMENTATION_READY

迁移能力：已实现（专用事务服务 + DRY_RUN/EXECUTE 双模式 + 幂等 + 失败重试 + 快照/对账）
DRY_RUN：通过（327 候选全 NOT_EXISTS，安全门 pass，PG/WPS 零变化）
EXECUTE：未执行

等待人工批准："批准执行 Sprint-WPS-03-B 正式迁移"
```

**本阶段到此停止。** 未获明确批准前不会执行 EXECUTE；批准后执行命令为 `node scripts/_wps03b_migrate.cjs EXECUTE`（预期 PG 1724→2051、sync_map 1724→2051，新增各 327，随后自动生成对账与幂等复检结果）。
