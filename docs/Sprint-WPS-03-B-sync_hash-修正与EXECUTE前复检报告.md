# Sprint-WPS-03-B：sync_hash 修正与 EXECUTE 前复检报告

- 检查/修正时间：2026-09-08 22:30（Asia/Shanghai）
- 性质：最小代码修正（2 文件）+ 只读验证；**未执行 EXECUTE、零 PG 写入、零 WPS 写入、零 DDL、零 .env 修改**

> ## 最终状态：**WPS-03-B EXECUTE PRECHECK = PASS**（已停止，等待人工批准 EXECUTE）

---

## 1. sync_hash 原业务语义（检查确认）

`grid_record_sync_map.sync_hash` 是现有 WPS↔PG 双向增量同步的**「最近同步内容 SHA-256 指纹」**：

- 上行（WPS→PG）`wpsGridSyncService.js:255`：`m.sync_hash === canonicalHash(pgDict)` → 跳过未变记录
- 下行（PG→WPS）`wpsGridSyncService.js:361`：同一比对决定是否推送
- `bindMap`（:195）每次绑定均以 `canonicalHash` 覆写

## 2. 本次发现的问题

上一版迁移设计将 `sync_hash = 'migration:wps03b:<batchId>'` 写入该字段——非内容指纹值。虽当前 `WPS_GRID_SYNC=false` 时零即时影响，但未来重开同步会使 327 条迁移记录首轮全部无法命中"unchanged 跳过"，破坏语义不变量（详见前一份检查报告，判定 BLOCKED）。

## 3. 修正内容（最小修改）

| 文件 | 修改 |
|---|---|
| `server/services/wpsGridMigrationService.js` | ① 复用 `wpsGridSyncService` 导出的纯函数 `wpsToPg` + `canonicalHash`（构造上保证同口径）；② `buildDto` 增加 `syncHash = canonicalHash(wpsToPg(原始字段))`；③ `migrateRecord` 的 sync_map INSERT 改写 `sync_hash = dto.syncHash`，批次号彻底移出 sync_hash |
| `server/scripts/_wps03b_migrate.cjs` | ① canonicalHash 兼容性独立重算验证（327 条逐条比对，不一致即退出）；② B 段 sync_hash 历史完整性检查；③ summary/safety-check 增加语义元数据 |

## 4. canonicalHash 兼容性检查

```text
MIGRATION_CANONICAL_HASH_COMPATIBLE = PASS
- 独立重算比对 327/327 逐字节一致（mismatchCount=0）
- syncHashLength = 64
- syncHashFormat = SHA-256 hex
- 语义 = canonicalHash(wpsToPg(WPS原始字段))，与上行同步对账完全同函数
- batchIdInSyncHash = false
```

哈希覆盖范围 = 同步服务 `FIELD_MAP` 的 **18 个业务字段**（nickname/area_team/personnel_name/position/grid_level/inspection_date(date)/violation_behavior/violator_name/gender/age/signup_today/marker/is_resubmit/upload_time/serial_no + 3 个照片链接列）。`report_status`/`vehicle_type`/`violation_type_result`/`need_rectification`/`rectifier` 属于同步服务 `PG_ONLY_COLUMNS`（本就不入哈希，与现有下行写入口径一致，非迁移特有差异）。A 段日期均为 ISO 格式，迁移解析与 `toIsoDate` 结果一致，无分歧。

**职责分离**：`migrationBatchId = WPS03B-<yyyyMMddHHmmss>` 保留，仅出现在控制台输出、migration-result/reconciliation JSON、审计报告；**绝不写入 sync_hash**；未新增数据库字段/表（零 DDL）。

## 5. DRY_RUN 结果（零写入实证）

```text
[canonicalHash 兼容] MIGRATION_CANONICAL_HASH_COMPATIBLE=PASS 长度=64 格式=SHA-256 hex
[B段 sync_hash 完整性] B_SYNC_HASH_INTEGRITY=PASS 总行=1724 异常=0
[安全门] pass=true phase=first processSet=327
[WPS_GRID_SYNC] = "false" → 通过
[重试门仿真] PASS（首次/重试/all_done/同步开启阻断 4/4）

候选=327（B=1724、C=12、疑似重复=4 全部排除）  将处理=327 跳过=0
幂等: NOT_EXISTS=327 ALREADY_EXISTS=0 CONFLICT=0 ORPHAN=0
READY=306 WARNING=21（12 多人匹配 + 9 脏值）
nan→NULL=327 脏值保留=9 图片: 三违=327 整改=84 示意图=0
安全: PG 1724→1724（maxId 6796 不变） syncMap 1724→1724 unchanged=true
```

## 6. grid_record_sync_map 历史完整性

```text
B_SYNC_HASH_INTEGRITY = PASS
- 全表 1724 行逐一校验 sync_hash：64 位 hex 100% 合规
- 'migration:' 前缀污染 = 0（修正发生在 EXECUTE 之前，历史数据未被触碰）
```

## 7. 复检清单汇总

| 检查项 | 结果 |
|---|---|
| canonicalHash 兼容 | ✅ PASS（327/327 逐字节一致） |
| sync_hash 语义 | ✅ PASS（内容指纹，批次号已移出） |
| B 段 sync_map 完整性 | ✅ PASS（1724 行零污染） |
| A=327 范围锁 | ✅ PASS |
| 幂等检查 | ✅ PASS（NOT_EXISTS=327，其余 0） |
| WPS_GRID_SYNC=false | ✅ PASS（只检不改） |
| DRY_RUN | ✅ PASS（READY=306/WARNING=21） |
| PG/WPS/DB 零写入 | ✅ PASS（1724→1724，unchanged=true） |

## 8. 结论

```text
WPS-03-B EXECUTE PRECHECK = PASS
```

全部 8 项复检通过。**已停止，未执行 EXECUTE。**

等待人工明确批准后执行：

```bash
node scripts/_wps03b_migrate.cjs EXECUTE
```

执行时将自动完成：逐条事务迁移（sync_hash=canonicalHash）→ 幂等复检（期望 ALREADY_EXISTS=327）→ 逐条对账（含 migrationBatchId）→ 字段级对账。
