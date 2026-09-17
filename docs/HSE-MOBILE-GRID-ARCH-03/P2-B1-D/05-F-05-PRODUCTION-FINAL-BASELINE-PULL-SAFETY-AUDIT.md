# 05-F-05：327 条历史归属完成后的生产最终基线与 Pull 覆盖保护审计报告

- 状态：`PHASE_P2_B1_D_05_F_05: PASS`
- 审计时间：2026-09-13 17:20–17:35（全程 READ-ONLY，`default_transaction_read_only=on` 实测）
- 结论一句话：**2061 条正式记录归属闭环完成、327 条 manual_confirmed 稳定且与冻结清单 100% 一致、WPS Pull Engine 经代码实证不会覆盖人工归属字段、新生产基线已冻结。**

## 1. 分析范围
生产 DB（safety_dashboard）全量只读核验 + Pull Engine / Sync Service / Scheduler / FieldMap 四个文件代码审计 + WPS→PG dryRun 只读干跑。

## 2. 数据基线（实测，非历史报告）
gir=2061（max id 7192）；attribution：NULL=1734 / pending=0 / **manual_confirmed=327** / attributed=0；**grid_id NULL=0**；inspector NULL 全表 1724（**327 条 WPS 集合内=0**，其余为历史 Excel 通道 A 既有形态：grid_id 全有、由 grid owner 承担归属）；身份三字段全 0；sync_map=2061；bridge=0；PID 39616 / health 200 / `.env` 未变。

## 3. 327 条 vs 冻结清单（§四）
逐条比对 record_id / inspector / grid / serial_no / area_team / personnel_name / inspection_date：**mismatch=0、missing=0、unexpected=0、duplicate=0**——327/327 完全一致，无任何漂移。

## 4. employee→grid 唯一性（§五）
- 327 条集合：58 distinct inspector，OK=327 / MULTIPLE_GRID=0 / NO_GRID=0 / GRID_MISMATCH=0 / 已删除=0
- 全表 60 distinct：59 OK，唯一例外 employee 6692（黄殿兴）NO_GRID——其网格 grid#1 已被业务删除，历史既有，不在 327 条内

## 5. grid_id→owner 一致性（§六）
2061 条全量：owner==inspector 335、owner≠inspector **0**、ownerless 0；1712 条历史行 inspector NULL（既有形态）；14 条指向已删除 grid#1（0 条 manual_confirmed，与 327 集合零交集）。历史 area_team 未做任何解释或修改。

## 6. Pull Engine 覆盖保护审计（§七/八，本阶段核心）

**判定：SAFE——三项保护全部成立（PASS 判定第 8/9/10 条）**：

| 问题 | 答案 | 代码证据 |
|---|---|---|
| A. 是否 UPDATE 身份三字段？ | **否** | `toCanonicalDto`（wpsGridPullEngine.js:116-140）仅遍历 SYNC_PROJECTION（wpsFieldMap.js:107-115，23 列全业务字段）；L137-138 防御删除 PROTECTED_COLUMNS；`assertNoProtectedColumns`（L223-230）在两个写入口（L244/L283）硬断言 |
| B. 是否 UPDATE 业务列？ | 是（设计内单向同步） | `updateBusinessColumns`（L281-308）SET=dto 业务列+updated_at，仅在 sync_hash 变化且 dtoEqualsPgRow 字段级比较发现真实差异时触发 |
| C. WPS 修改会重置人工归属吗？ | **不会** | 身份三字段不在 SET 列表 → manual_confirmed/inspector/grid 恒保持，仅 updated_at 变化 |
| D. 全字段 upsert / 冲突覆盖 / hash 全重写 / 重建 grid_id / 写回 NULL / 清空身份？ | **均不存在** | 无 ON CONFLICT DO UPDATE（23505→ALREADY_EXISTS，L273）；hash 变化仍需字段级权威比较（L473-474）；rebaselineHash 仅动 sync_map；WPS 删除只统计 pgDeleted 恒 0（L232-238/L508）；调度链唯一（app.js:89→Scheduler 双闸→facade 反向写入全 no-op→engine.pullWpsToPg） |

**§八 回归推演结论**：manual_confirmed 记录即使 WPS 业务字段变化，下次 Pull 只 SET 业务列 → attribution_status 保持 manual_confirmed、inspector/grid 保持原值 → **不可能**降级或清空 → 非 BLOCKING。唯一副作用 updated_at 变化（预期无害）。

## 7. WPS 实际运行基线（§九）
dryRun 只读干跑（零写入）：**totalWps=2063 = PG 2061 + BT + EA** ✓；BT/EA 各 1 冻结排除 ✓；newCandidates=0 / changedCandidates=0 / skippedUnchanged=2061（WPS 与 PG 当前零差异）；wpsDeleted=0 / pgDeleted=0 / errors=0 / ok=true。

## 8. 审计完整性（§十）
audit_record 总数 333（=6 前置+327）；05-F-04 执行窗口 attribute=327、distinct record_id=327、每条恰 1 条；changed_fields 全表统一恰为 [attribution_status, inspector_employee_id, grid_id]；历史 05-D-B / 05-F-01 审计（6 条）未重复计入。

## 9. 环境完整性（§十一）
PID 39616 未变、health 200、`.env` mtime 未变（2026-09-11 22:22:50）、生产库实测只读事务、WPS write=0、Scheduler 未动、未重启。

## 10. 判定汇总（§十三/十四）
- **PASS**：13 项判定全满足（第 3 条在 327 条 WPS 集合上成立；全表 1724 条 inspector NULL 为历史通道 A 既有形态，按 §十四 不列 blocking）
- **WARNING（非阻塞，历史遗留仅记录）**：grid#1 已删但 14 条历史行指向（0 条 mc）；employee 6692 无 live grid；grid#67/#126 档案字段（area/township）空缺
- **BLOCKING：无**

## 11. 新生产基线冻结
`05F05-production-final-baseline.json` + `05F05-production-final-baseline.md` 已生成，作为 P2-B1-D 完成后的正式基线。后续任何生产归属/同步动作以此基线为对照。

## 12. 边界证明
本阶段 DML=0、DDL=0、WPS write=0、生产代码/配置/结构零修改、未重启生产。
