# Sprint-WPS-03-B Batch 3 身份回填 DRY-RUN 报告

> 执行时间：2026-09-09 21:2x（GMT+8）｜模式：**DRY_RUN 零写入**｜判定：**BATCH3_DRY_RUN = BLOCKED**
> 脚本：`server/scripts/_wps03b_batch3_dryrun.cjs`｜产物：`server/scripts/output/wps03b-batch3-dryrun.json`

## 1. 判定结论

**BLOCKED —— 目标列不存在，PG 原地回填在本阶段（禁 DDL）不可执行。**

`grid_inspection_records` 实有 27 列中**没有** `inspector_employee_id`，也没有 `violator_employee_id`。这与 Batch 1 迁移计划当时「identity 不写入（PG 无对应列）」的记录完全一致。另外经代码查证：`grid_id` 列语义 = **`grid_areas.id`（网格区域外键）**，被 `gridCompletionService` 用于「每网格实际检查次数」聚合统计——**严禁**把 employee_id 写入该列，否则完成度统计错乱。

## 2. 映射与裁定证据（12/12 全部成立，零写入）

解析路径严格按规程：`wps_record_id + wps_file_id → grid_record_sync_map → pg_record_id → grid_inspection_records`，**未做任何姓名模糊匹配**：

| WPS_RECORD_ID | WPS_FILE_ID | PG_RECORD_ID | personnel_name | inspection_date | serial_no | current | target | status |
|---|---|---|---|---|---|---|---|---|
| O | cn229thwalDs | 6807 | 赵书坤 | 2026-09-01 | L2561 | — | 7085 | BLOCKED_NO_TARGET_COLUMN |
| BF | cn229thwalDs | 6862 | 赵书坤 | 2026-09-02 | L2622 | — | 7085 | 同上 |
| B_ | cn229thwalDs | 6918 | 赵书坤 | 2026-09-03 | L2636 | — | 7085 | 同上 |
| C3 | cn229thwalDs | 6974 | 赵书坤 | 2026-09-04 | L2705 | — | 7085 | 同上 |
| Dt | cn229thwalDs | 7028 | 赵书坤 | 2026-09-05 | L2777 | — | 7085 | 同上 |
| Ei | cn229thwalDs | 7079 | 赵书坤 | 2026-09-06 | L2818 | — | 7085 | 同上 |
| 4 | cn229thwalDs | 6849 | 郭秀梅 | 2026-09-01 | L2558 | — | 7947 | 同上 |
| Bw | cn229thwalDs | 6903 | 郭秀梅 | 2026-09-02 | L2599 | — | 7947 | 同上 |
| Co | cn229thwalDs | 6959 | 郭秀梅 | 2026-09-03 | L2680 | — | 7947 | 同上 |
| Dg | cn229thwalDs | 7015 | 郭秀梅 | 2026-09-04 | L2714 | — | 7947 | 同上 |
| EV | cn229thwalDs | 7066 | 郭秀梅 | 2026-09-05 | L2771 | — | 7947 | 同上 |
| FP | cn229thwalDs | 7121 | 郭秀梅 | 2026-09-06 | L2824 | — | 7947 | 同上 |

（`current` 一栏因目标列不存在而无值可言；锚点校验=姓名+编号+日期三重一致 12/12 通过）

## 3. 验收清单对照

| 要求 | 结果 |
|---|---|
| target_count=12 | ✅ 12 |
| resolved_pg_records=12（sync_map 唯一命中） | ✅ 12/12，未解析=0 |
| 锚点一致（姓名/编号/日期） | ✅ 12/12 |
| target_7085=6 / target_7947=6 | ✅ 6/6、6/6 |
| current_null=12 | ⚠️ **无法评估**——目标列缺失 |
| other_records_affected=0（范围外同名记录 61 条不涉及） | ✅ 0 |
| WPS Record ID 误当 employee_id | ✅ 0（7085/7947 未出现在 wps_record_id 域） |
| PG Record ID 误当 employee_id | ✅ 0 |
| 姓名/编号/日期/sync_hash/照片等被触碰 | ✅ 0 写入 |
| writes：PG / WPS / sync_map / DDL | ✅ 0 / 0 / 0 / 0 |
| WPS_GRID_SYNC 保持关闭 | ✅ false 未动 |

因 `current_null=12` 与 `would_update=12` 两项在列缺失前提下**结构性无法满足**，按验收规则输出 **BLOCKED**（而非 PASS）。

## 4. 需要您决策的三条路径（任选其一，本阶段均未执行）

**方案 A（推荐）：授权一次性 DDL，新增身份列**
```sql
ALTER TABLE grid_inspection_records
  ADD COLUMN IF NOT EXISTS inspector_employee_id varchar(20),
  ADD COLUMN IF NOT EXISTS violator_employee_id  varchar(20);
```
- 与现有链路兼容性已论证：新列不在 FIELD_MAP 的 18 字段内、不入 canonicalHash（同 vehicle_type 等 PG_ONLY 列语义），迁移/同步哈希零影响；无需改 routes。
- 授权后重跑本 DRY-RUN 即转 **PASS**（解析/锚点/目标值证据已全部就绪），再由您批准 EXECUTE（12 条 UPDATE，仅 `inspector_employee_id`，范围硬编码 12 条）。

**方案 B：改回填 WPS 板「巡查人员ID」列（列 X，Sprint-02-C 已建好）**
- 对 12 条 WPS 记录写 7085/7947（updateRecords，仅该字段）。
- 属 WPS 写入，本阶段禁改 WPS，需阶段二另行授权；且 WPS_GRID_SYNC 必须保持 false。

**方案 C：仅保留裁定绑定存档（现状即完成）**
- `wps03b-batch3-adjudication-dossier.json` 已含 CONFIRMED_BY_USER 绑定（赵书坤→7085、郭秀梅→7947），待后续批次再落地。

## 5. 边界声明

本阶段实际动作：只读查询（information_schema / sync_map / grid_inspection_records / 花名册）+ 产物落盘 + 本报告。**零 PG 写入、零 WPS 写入、零 DDL、sync_map/sync_hash/serial_no/inspection_date/personnel_name/照片链接等全部未触碰**，WPS_GRID_SYNC 保持 false。
