# Sprint-WPS-03-B：sync_hash 业务语义检查报告（EXECUTE 前只读检查）

- 检查时间：2026-09-08 22:10
- 性质：只读（零代码修改 / 零 DB / 零 WPS / 零 .env / 未执行 EXECUTE）

## 结论

> **判定 = B：sync_hash 参与现有同步业务语义 → 按当前设计 EXECUTE 前需先修正，本检查判定 BLOCKED。**

## 证据（3 个使用点）

1. **`wpsGridSyncService.js:255`（上行 WPS→PG 变更检测）**：
   `if (m && m.sync_hash === hash) { stats.skippedUnchanged++; continue; }`
   —— `hash = canonicalHash(pgDict)`（记录内容 SHA-256）。sync_hash 不等于当前内容哈希 → 视为"有变化"。

2. **`wpsGridSyncService.js:361`（下行 PG→WPS 变更检测）**：
   `if (m && m.sync_hash === hash) return { skipped: true, reason: 'unchanged' };`
   —— 同一语义：sync_hash 是"最近一次同步内容指纹"，不是普通记录字段。

3. **`wpsGridSyncService.js:195`（bindMap upsert）**：
   每次 bind 都用 `canonicalHash` 覆写 sync_hash，进一步证明其内容指纹语义。

`canonicalHash`（:121）= 对 FIELD_MAP 全部业务字段做规范化后取 SHA-256 hex（64 字符）。

## 当前迁移设计的影响分析

当前设计 `sync_hash = 'migration:wps03b:<batchId>'`（38 字符，长度合法）写入的是**非内容指纹值**，后果：

- **现在（WPS_GRID_SYNC=false）**：同步未启用，`isEnabled()` 为 false，**零即时影响**，迁移与幂等本身不受影响。
- **未来重新开启同步后的首次上行对账**：327 条迁移记录全部无法命中"unchanged 跳过"→ 进入"已绑定"分支做 LWW 更新。因迁移时 `last_sync_at` 与 PG `updated_at` 同为 NOW()，`pgTs > last_sync_at` 不成立 → 不触发 conflict 标记 → 用相同内容回写 PG 一次，随后 sync_hash 被覆写为规范哈希（**自愈**）。
- 影响定性：**有界、一次性、内容无损**，但会（a）污染同步统计（327 条假"updated"）；（b）破坏「sync_hash = 最近同步内容哈希」的语义不变量，给后续增量对账逻辑埋下解释成本；（c）若 PG 行在迁移后、同步开启前被人工编辑，将走 conflict 人工路径（该场景本就会发生，非本次设计引入，但混在一起难以区分）。

## 修正建议（另立最小修改，本检查未动代码）

- **推荐**：迁移事务内 `sync_hash` 写 `canonicalHash(pgDict)`（与 bindMap 完全同口径），维持语义不变量；批次号改记到既有的 `grid_record_sync_state` 键值表（如 key=`migration:wps03b:<batchId>`，value=Record ID 清单）或仅保留在对账 JSON 中 —— 两者均**零 DDL、零新表**。
- 备选：维持现状并书面接受"重开同步后首轮 327 次冗余更新"的自愈成本（不建议）。

## 状态

```text
WPS-03-B EXECUTE PRECHECK = BLOCKED
（原因：sync_hash 为同步变更检测字段，当前设计写入非规范值；
 修正为 canonicalHash 后可复检转 PASS。等待人工决策。）
```
