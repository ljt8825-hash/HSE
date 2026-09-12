# Sprint-WPS-03-B 正式执行前最终安全审计报告

> **状态：SAFETY_AUDIT_PASS / IMPLEMENTATION_READY（EXECUTE 未执行，等待人工明确批准）**

- 审计时间：2026-09-08 21:55（Asia/Shanghai）
- 审计性质：只读（PG 仅 SELECT、WPS 仅读、零 DDL、零写入）
- 涉及文件（仅 2 个，最小修改）：
  - `server/services/wpsGridMigrationService.js` —— 安全门重构 + 事务内幂等预检 + 批次号
  - `server/scripts/_wps03b_migrate.cjs` —— final 产物输出 + 重试门仿真 + 对账字段补全

---

## 一、本次修正内容

### 1.1 首次执行与失败重试的安全门分离（核心修正）

修正前问题：安全门仅校验「候选=327」，未区分首次与重试语义；若首次部分成功（如 SUCCESS=320 / FAILED=7），重跑虽然处理集正确（NOT_EXISTS=7），但缺少对重试态的显式判定与完整性校验。

修正后 `checkGates(ctx)` 三态判定：

| phase | 判定条件 | 附加校验 | 处理集 |
|---|---|---|---|
| `first` | ALREADY_EXISTS=0 且 NOT_EXISTS=327 | NOT_EXISTS 必须=327、ALREADY_EXISTS 必须=0 | 全量 327 |
| `retry` | 0 < NOT_EXISTS < 327 | 完整性：NOT_EXISTS + ALREADY_EXISTS = 327（CONFLICT/ORPHAN 已阻断为 0） | **动态 NOT_EXISTS 子集** |
| `all_done` | NOT_EXISTS=0 且 ALREADY_EXISTS=327 | 无 | 空集（非错误） |

**硬保护（任何 phase 不变）**：

- `A_ONLY_TOTAL = 327`（历史迁移总范围变化即阻断）
- 候选混入非 A 段 → 阻断（B=1724 / C=12 / 疑似重复 4 条永不进入）
- CONFLICT > 0 → 阻断；ORPHAN > 0 → 阻断
- 幂等键唯一 = `wps_record_id(varchar) + wps_file_id`，serial_no/姓名/日期/组合字段/WPS 行号全部禁用

### 1.2 WPS 实时同步安全门（新增）

EXECUTE / DRY_RUN 开始前读取运行配置中的 `WPS_GRID_SYNC`：

- `=true` → `MIGRATION_BLOCKED`，立即退出
- **只检查并阻断，绝不自动关闭，不修改 .env**
- 检查结果写入 `wps03b-final-safety-check.json`

当前实测：`WPS_GRID_SYNC = "false"` → 通过。

### 1.3 事务边界补强

在原有「BEGIN → INSERT records RETURNING id → INSERT sync_map → COMMIT」基础上，**事务内新增幂等预检**：

```text
BEGIN
  ↓ SELECT sync_map WHERE wps_record_id + wps_file_id（FOR SHARE）   ← 新增
  ↓ 已存在 → ROLLBACK，返回 ALREADY_EXISTS（跳过，不改绑）
  ↓ INSERT grid_inspection_records RETURNING id
  ↓ INSERT grid_record_sync_map（纯 INSERT，禁 ON CONFLICT DO UPDATE）
COMMIT
```

唯一键冲突（并发兜底）→ ROLLBACK → 重读判定，禁止改绑。**单边 PG 成功 / 单边 sync_map 成功在结构上不可能发生。**

### 1.4 批次号（无 DDL）

- `migrationBatchId = WPS03B-<yyyyMMddHHmmss>`（EXECUTE 时生成）
- 写入 `grid_record_sync_map.sync_hash = migration:wps03b:<batchId>`（复用现有列，零 DDL、零新表）
- 贯穿逐条对账文件：`migrationBatchId / WPS_RECORD_ID / WPS_FILE_ID / PG_RECORD_ID / migration_status`

---

## 二、重试门仿真验证（纯函数级，零 DB 操作）

DRY_RUN 内置 4 个仿真用例（不触碰数据库，仅调用门函数）：

| 用例 | 输入 (NOT_EXISTS/ALREADY_EXISTS) | 结果 | 判定 |
|---|---|---|---|
| 首次执行 | 327 / 0 | pass=true, phase=first, processSet=327 | ✅ |
| **部分成功重试 (320/7)** | **7 / 320** | **pass=true, phase=retry, processSet=7**（不被 327 硬门阻断） | ✅ |
| 全部完成 | 0 / 327 | pass=true, phase=all_done, processSet=0 | ✅ |
| 同步开启 | 327 / 0 + WPS_GRID_SYNC=true | pass=false, blockedBySyncGate=true | ✅ |

## 三、本次 DRY_RUN 结果（零写入实证）

```text
[安全门] pass=true phase=first processSet=327
[WPS_GRID_SYNC] = "false" → 通过
[重试门仿真] PASS（4/4 用例符合预期）

候选=327（A段331 − 疑似重复4）将处理=327 跳过=0
幂等: NOT_EXISTS=327 ALREADY_EXISTS=0 CONFLICT=0 ORPHAN=0
READY=306 WARNING=21（12 多人匹配 + 9 脏值，与 v2 一致，仅记录不阻塞）
nan→NULL=327 脏值保留=9 图片: 三违=327 整改=84 示意图=0
安全: PG 1724→1724（maxId 6796 不变） syncMap 1724→1724 unchanged=true
```

## 四、禁止修改清单确认（本次均未触碰）

users / JWT / 登录认证 / employee 主数据 / employee_assignment / WPS 原始数据 / B 段 1724 / C 段 12 / 疑似重复 A 4 条 / violatorEmployeeId（RESERVED）/ inspectorEmployeeId Batch 3 逻辑（327 条全部 NOT_FILLED）/ `grid_record_sync_map` 表结构（零 DDL，批次号走现有 sync_hash 列）/ WPS Schema / WPS 实时同步逻辑 / serial_no 历史值 / nickname / 图片解析规则。零 npm 依赖，零新表。

## 五、EXECUTE 批次结果与成功标准（已预置，未执行）

- 本批核心指标：`SUCCESS / FAILED / ALREADY_EXISTS / CONFLICT` 逐条记录，附 `migrationBatchId + wps_record_id + wps_file_id + pg_record_id + migration_status`
- 首次成功标准：`SUCCESS=327, FAILED=0, CONFLICT=0`；数量核对 PG 与 sync_map 各 +327（1724→2051）
- 存在 FAILED 时：不判定永久失败，保留失败明细，重试仅处理未映射子集（§1.1 retry 门自动放行），已成功记录绝不重复插入
- 迁移后自动执行：幂等复检（期望 ALREADY_EXISTS=327 / NOT_EXISTS=0 / CONFLICT=0 / ORPHAN=0）→ 逐条对账 → 字段级对账（三违照片 327/327、整改 84/84、nan=0、inspectorEmployeeId=NULL、violatorEmployeeId=RESERVED）
- 数量不符自动判定 `MIGRATION_FAILED`

## 六、机器产物清单（server/scripts/output/）

```text
wps03b-final-safety-check.json        ← 本次审计核心（gates + 同步门 + 仿真 + 零写入证明）
wps03b-final-dryrun-summary.json
wps03b-final-dryrun-records.json      （327 条逐条 DTO，含 identity/warnings/target 预览）
wps03b-final-execution-plan.json      （phase / 批次号 / 重试策略 / 事务模型）
wps03b-pre-migration-snapshot.json
wps03b-idempotency-preview.json / wps03b-dryrun-{summary,records,warning}.json / wps03b-execution-plan.json（延续上一阶段产物）
```

---

## 七、结论

```text
Sprint-WPS-03-B 正式执行前最终安全审计 = PASS
状态：SAFETY_AUDIT_PASS / IMPLEMENTATION_READY

首次门  ：✅（NOT_EXISTS=327 / ALREADY_EXISTS=0 / CONFLICT=0 / ORPHAN=0）
重试门  ：✅（仿真验证 320/7 场景不被阻断，处理集动态取 NOT_EXISTS）
同步门  ：✅（WPS_GRID_SYNC=false，只检不改）
零写入  ：✅（PG 1724→1724、syncMap 1724→1724、WPS 0 次写、DDL 0）
范围锁  ：✅（A_ONLY=327，B=1724 / C=12 / 疑似重复 4 全部排除）
```

**执行到此停止。未执行 EXECUTE。**

必须等待人工明确批准——「批准执行 Sprint-WPS-03-B 正式迁移」——后才允许运行：

```bash
node scripts/_wps03b_migrate.cjs EXECUTE
```
