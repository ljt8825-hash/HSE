# Sprint-WPS-03-B-0 正式迁移前置核验报告

> **状态：READY_FOR_FORMAL_MIGRATION**
> （核验完成，已停止。未获人工明确批准前，不得进入 Sprint-WPS-03-B 正式迁移。）

- 核验时间：2026-09-08 21:10 前后
- 执行脚本：`server/scripts/_wps03b0_preflight.cjs`（全程只读：PG 仅 SELECT、WPS 仅读、零 DDL、零写入）
- 机器产物：`server/scripts/output/wps03b0-{syncmap-audit, idempotency-audit, preflight-summary, safety-check}.json`

---

## 一、A 段 327 条：权威幂等分类（补齐 v2 报告 §5.2）

权威幂等键 = **`wps_record_id` + `wps_file_id`**（varchar 字符串，实读确认）。serial_no/姓名/日期/组合字段/WPS 行号均未用作幂等键。

```text
A候选 = 327（与 Dry Run v2 逐条 Record ID 完全一致，crossCheck=true）
        ↓ grid_record_sync_map 权威查询
NOT_EXISTS     = 327   ✓（§四通过条件满足）
ALREADY_EXISTS = 0
CONFLICT       = 0
ORPHAN         = 0
```

判定：**ALL_NOT_EXISTS** → A 段 327 条在幂等层面全部干净，允许进入正式迁移队列。

依据：候选 327 个 `wps_record_id` 以 `ANY($1::text[])` 查询 sync_map，零命中；且逐条复核 file_id 一致性、多条映射、pg_record_id 有效性，均无异常。无需列出示例（issues 数组为空，见 `wps03b0-idempotency-audit.json`）。

## 二、grid_record_sync_map 全量实读审计

| 项 | 结果 |
|---|---|
| 表结构 | 11 列（id/pg_record_id integer/wps_record_id **varchar**/wps_file_id/wps_sheet_id bigint/last_sync_at/pg_updated_at/wps_updated_at/sync_hash/conflict/created_at） |
| 现有记录数 | **1724** |
| wps_record_id 类型 | `character varying` ✓ 字符串处理，无数值化风险 |
| wps_file_id 分布 | `cn229thwalDs` × 1724（100% 现用文件） |
| wps_sheet_id 分布 | `3` × 1724（100% 现用数据表） |
| pg_record_id 有效性 | **orphan = 0**（全部能在 grid_inspection_records 找到） |
| 唯一约束 | `UNIQUE(pg_record_id)` + `UNIQUE(wps_record_id, wps_file_id)` ✓ |
| 异常重复 | 键重复 = 0；pg 重复映射 = 0；conflict 标志 = 0 |
| **健康判定** | **HEALTHY** |

## 三、B 段 1724 条映射完整性（只读，不修改、不迁移）

| 项 | 结果 |
|---|---|
| sync_map 总数 | 1724 |
| 与当前 WPS B 段 Record ID 匹配 | **1724 / 1724**（零多余映射、零缺失） |
| 有效 PG 映射（orphan） | 0 |
| 重复 / 异常 | 0 / 0 |
| 映射指向的 PG 记录月份分布 | **2026-08 × 1724**（100%，与 B 段 8 月补录定性完全吻合） |

B 段维持 **永久排除本次迁移**。其映射数据即 sync_map 的现有 1724 行，正式迁移写入 A 段映射时不会与之冲突（wps_record_id 零交集）。

## 四、C 段 12 条

8 条公司管理行 + 4 条 A 段疑似重复 = **12 条，不进入本次迁移、不删除、不修改**（与 03-0 审计边界一致）。

## 五、327 条业务数据映射复核（§九）

| 检查项 | 结果 |
|---|---|
| 23 个必须目标字段 | **ALL_FIELDS_RETAINED**（真丢失 = 0） |
| 键"缺失"甄别 | `rectified_photo` 缺 243 键 = 源字段为空（无整改照片 243 条，列将为 NULL）；`schematic` 缺 327 键 = A 段示意图全空。**均属"源空即 NULL"合规行为，非数据丢失** |
| `"nan" → NULL` | 327 / 327（`is_resubmit` 全部置 NULL，零字符串 "nan" 入库） |
| 脏值原样保留 | 9 条（性别 "67"/"女′"、年龄 "64.60"/"60岁"/"58岁" 等）——未清洗、未修正，历史原值保留 |
| 迁移状态 | READY=306 / WARNING=21 / BLOCKED=0（与 v2 一致） |
| inspectorEmployeeId | **327 / 327 全部 NOT_FILLED**（含 unique=315 也不写入，留 Batch 3） |
| violatorEmployeeId | **RESERVED**，violator_name 只写入姓名字段，零自动绑定 |

身份边界重申：赵书坤 → 7085/8259、郭秀梅 → 7172/7947/9478 仍未裁定，禁止猜测、禁止取第一个、禁止修改 users/JWT、禁止永久姓名绑定。

## 六、图片规则复核

三违照片 327/327 合法 http(s) URL；整改后照片 84；示意图 0；URL 异常 = 0；相对路径 = 0；DISPIMG = 0。仅合法 URL 进入迁移目标，"是"等非 URL 值 A 段零命中。

## 七、事务模型审计（§七，只审代码不执行）

**现有同步链路（wpsGridSyncService.js）不具备事务原子性**：

- 使用 `pool.query` 逐条执行，无显式 BEGIN/COMMIT
- `bindMap()` 为带 `ON CONFLICT DO UPDATE` 的 upsert（`UNIQUE(pg_record_id)` 冲突时改绑），适合对账场景但不适合一次性迁移

**正式迁移事务模型要求（Sprint-03-B 实现时遵循）**：

```text
BEGIN
  INSERT INTO grid_inspection_records (...) VALUES (...) RETURNING id
    ↓
  INSERT INTO grid_record_sync_map (pg_record_id, wps_record_id, wps_file_id, wps_sheet_id, ...)
    ↓
COMMIT
```

- 两表必须同一 transaction，任一步失败 ROLLBACK，禁止"PG 记录已建但映射不存在"或反向的半成功状态
- 不得复用同步链路的非事务写入路径

## 八、失败重试策略确认（§八）

- 逐条状态机：成功 / 失败 / 待人工确认，失败只重跑 failed 子集，禁止整批重新 INSERT
- 重试前置检查：按 `wps_record_id + wps_file_id` 查 sync_map，已成功（ALREADY_EXISTS）→ 跳过
- **禁止用 serial_no 判断是否已迁移**（本次 serial_no 与 PG 交集 = 0 仅为旁证，不作为依据）

## 九、执行前后只读安全检查（§十三）

| 检查项 | 前 | 后 | 结论 |
|---|---|---|---|
| grid_inspection_records.count | 1724 | 1724 | 一致 ✓ |
| grid_inspection_records.max(id) | 6796 | 6796 | 一致 ✓ |
| grid_record_sync_map.count | 1724 | 1724 | 一致 ✓ |
| PG INSERT / UPDATE / DELETE / DDL | — | — | **0 / 0 / 0 / 0** |
| WPS write API | — | — | **0** |

详见 `wps03b0-safety-check.json`（overall = PASS）。

## 十、DDL 边界确认（§六）

本次 **零 DDL**。未添加 `migration_batch_id` / `source_type` / `status` 等字段——sync_map 正被现有同步链路使用，任何 ALTER TABLE 另立 Sprint 经审核后执行。正式迁移优先复用现有四列（wps_record_id / wps_file_id / wps_sheet_id / pg_record_id）完成幂等控制；批次台账等扩展需求可在 03-B 方案中提出、单独评审。

## 十一、最终结论

```text
Sprint-WPS-03-B-0 = READY_FOR_FORMAL_MIGRATION

A段：327 候选
  NOT_EXISTS = 327 / ALREADY_EXISTS = 0 / CONFLICT = 0 / ORPHAN = 0

B段：1724（sync_map 完整性 HEALTHY，永久排除本次迁移）
C段：12（不进入本次迁移）

数据质量：WARNING = 21，BLOCKED = 0
数据库：PG 写入 = 0，WPS 写入 = 0，DDL = 0
```

**本 Sprint 到此停止。** 只有在获得人工明确批准后，才允许进入 Sprint-WPS-03-B 正式历史数据迁移；届时 21 条 WARNING 的处置（12 条多人匹配归属 + 9 条脏值）与事务化写入路径的实现为一并待办事项。
