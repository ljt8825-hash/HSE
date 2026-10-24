# P3-04-02｜历史隐患状态规范化迁移｜执行报告 V1.0

**执行时间**：2026-10-24 17:4x（Asia/Shanghai）
**执行范围**：`safety_dashboard_dev`（**仅 dev，生产库未触碰**）
**执行方案**：A —— `已完成 60 → closed`、`NULL 50 → discovered`
**执行结果**：**EXECUTED / PASS**
**验收**：service 级 **31/31 PASS**，接口级 **18/18 PASS**，指纹逆向还原**逐字节一致**
**未制造**：0 条 review / 0 条 verify / 0 条验收记录 / 0 个新列 / 0 张新表

---

## 一、为什么最终执行的是方案 A（而不是 01.2 原文的方案 B）

P3-04-01.2 §13/§14 要求「60 条 → closed，9 条 → discovered，其余 41 条保持 NULL」。
执行前门禁实测发现方案 B 三项硬性矛盾（见 `P3-04-02_HAZARD_STATUS_MIGRATION_PREFLIGHT_BLOCKED_V1.md`）：

| 检验 | 方案 B 实测 | 应然 |
|---|---:|---:|
| 生命周期四桶合计 | **69** | 110 |
| NULL 残留 | **41** | 0 |
| `stats().overdueCount` | **9** | 50 |

原因是 `discovered` 的定义就是「已发现、尚未形成闭环」——**不需要任何证据**；而 50 条 NULL 的 7 个闭环字段（`verify_user` / `verify_date` / `reviewer_id` / `review_date` / `review_result` / `rectify_date` / `actual_rectify_date`）全部为 0，这个事实**恰好等于** `discovered` 的定义。因此 `NULL → discovered` 是证据支持的映射，不是推断，更不是补造。

反之，「41 条保持 NULL」不是保守，而是把 4 轮审计一直在清理的 NULL 三值逻辑缺陷固化成永久存量：这 41 条会被 `status <> 'closed'` 类谓词静默丢弃，在生命周期统计里彻底消失。

经确认后采用方案 A。**这不是对原方案的擅自改写，是执行前门禁发现不可执行后上报、由授权方选择的结果。**

---

## 二、执行动作（原样记录）

```bash
cd server && node scripts/p3-04-02-migrate-legacy-status.js --plan=A --execute
```

脚本内实际发出两条语句，包在一个事务里：

```sql
UPDATE hazards SET status='closed'      WHERE is_deleted=false AND status='已完成';   -- 60 行
UPDATE hazards SET status='discovered'  WHERE is_deleted=false AND status IS NULL;    -- 50 行
COMMIT;
```

护栏全部生效：

| 护栏 | 结果 |
|---|---|
| G1 库名断言 `current_database()='safety_dashboard_dev'` | PASS |
| G2 迁移前分布严格 `{已完成:60, NULL:50}`、无第三种取值 | PASS |
| G3 总行数 = 110 | PASS |
| G4 `rowCount` 精确等于 60 / 50 | PASS（60 / 50） |
| G5 事务内四桶复核 + NULL 残留 + `updated_at` 未变 | PASS |
| G6 回滚 id 清单落盘 | 已落盘 |

---

## 三、指纹证据（可复核）

| 时点 | `row_hash` = md5( id \| status \| updated_at ) |
|---|---|
| 迁移前 | `0ba357407eab96e9bf036986cd007718` |
| 迁移后 | `80b8b2180ff3a28116236eafa1675948` |
| **逆向还原**（`closed→已完成`、`discovered→NULL` 重算） | **`0ba357407eab96e9bf036986cd007718`** |

**逆向还原后与迁移前逐字节一致** ⇒ 除 `status` 外，`id` 与 `updated_at` 一列都没动；`hazards` 无触发器，不存在"顺手更新修改时间"。

时间字段同时校验：

| 字段 | 迁移前 | 迁移后 |
|---|---|---|
| `max(created_at)` | `2026-08-24 23:36:23.420706` | 不变 |
| `max(updated_at)` | `2026-08-25 07:58:27.198297` | 不变 |
| `min(updated_at)` | `2026-08-24 23:36:23.249943` | 不变 |

---

## 四、迁移后状态

| 项 | 迁移前 | 迁移后 |
|---|---:|---:|
| 总记录 | 110 | **110** |
| `已完成` | 60 | **0** |
| `NULL` | 50 | **0** |
| `closed` | 0 | **60** |
| `discovered` | 0 | **50** |
| 非 canonical 状态 | 60 | **0** |
| 生命周期四桶合计 | 0 | **110** |

业务字段零改动（迁移前后一致）：`fixer` 覆盖 97、`fix_date` 去重 20、`verify_user` 有值 0、`review_result` 有值 0。

---

## 五、验收结果

### 5.1 Service 级（`scripts/p3-04-02-post-verify.js`）：31/31 PASS

| 路径 | 实测 |
|---|---|
| `hazardService.stats()` 四桶 | discovered 50 / processing 0 / pending_review 0 / closed 60 |
| `stats().total` | 110 |
| `stats().overdueCount` | **50**（冻结基线 50 ✅） |
| `hazardService.remindersOverdue().total` | **50** |
| `overview.byStatus` | `{closed:60, discovered:50}`，无 `null` / `已完成` 键 |
| `overview.hazard.closed` | **60** |
| `todos hazard:overdue` | **50** |
| AI `unrectifiedCount` | **50** |
| AI `unknownStatus` | **0** |
| R-01 `rectificationStatus` | `[110, 60, 0, 0, 0]`（零漂移） |
| `rectification_task` / `review_record` / `hse_reviews` | 0 / 1 / 0（未牵连） |

### 5.2 接口级（`scripts/p3-04-02-endpoint-verify.js`，真实 Express 路由 + supertest）：18/18 PASS

| 接口 | 结果 |
|---|---|
| `GET /api/hazards/stats` | 200 → total 110 / discovered 50 / closed 60 / overdueCount 50 |
| `GET /api/hazards?page=1&pageSize=5` | 200 → total 110，返回 5 行，无中文状态 |
| `GET /api/overview/stats` | 200 → `hazard.byStatus = {discovered:50, closed:60}`，`closed=60` |
| `GET /api/hse/todos?cadence=daily` | 200 → `hazard_overdue.count = 50` |
| `GET /api/hse/alerts` | 200 + `total=0` —— **既有缺陷，非迁移回归**（见 D-03） |

---

## 六、偏差与事故登记（全部如实记录）

### D-01｜迁移脚本提交后报错（已修，数据无影响）

脚本在 `COMMIT` **之后**执行"非 canonical 残留"检查时，SQL 写错：

```sql
GROUP BY coalesce(status,'<NULL>')  ...  HAVING coalesce(status,'') NOT IN (...)
```

`HAVING` 引用了未分组的 `status`，报 `字段 "hazards.status" 必须出现在 GROUP BY 子句中`，进程 `exit 1`。

- **影响面**：仅影响该行日志与退出码，`COMMIT` 已在此之前完成，数据正确（后续 31 项 + 18 项验收全部通过）。
- **已修**：`HAVING` 改用分组别名 `k`。
- **教训**：**把"提交后复核"写在 `COMMIT` 之后，其异常会伪装成"迁移失败"**。迁移脚本里凡是校验语句本身可能报错的，都应放在事务内、`COMMIT` 之前。

### D-02｜验收脚本初跑 6 项 FAIL，两处都是"验证工具自身"的问题

1. **`fix_date` 去重数**：我按记忆写了期望 25，实测 **20**（19 个「已完成」日期 + 1 个「9 条」的 2026-05-27）。→ 断言期望值必须 `count(DISTINCT)` 实跑，不能手算。
2. **`hazardService.stats()` 返回全 0**：因为脚本没有调用 `db.testConnection()`，`isConnected()` 为 `false`，服务进入**内存降级模式**，`stats()` 与 `remindersOverdue()` 静默返回空数据（HTTP 200 + 0）。
   - 这正是 `config/db.js` 里那句告警的实战复现：**"全部读接口静默返回空数据，请勿误判为业务数据为空"**。
   - 差一点被误读成"迁移把数据清了"。
   - **已修**：脚本开头显式 `await db.testConnection()`，并在注释里写明原因。

### D-03｜`/api/hse/alerts` 是既有缺陷（FU-18），迁移前就是坏的

`routes/alerts.js` 的列表 SQL：

```sql
SELECT id, title, description, level, status, location, created_at, updated_at, resolved_at FROM hazards
```

`hazards` 的 46 列中**没有 `title`，也没有 `resolved_at`**（已逐列核对）。直跑该 SQL 报 `字段 "title" 不存在`。

更麻烦的是它被 `catch` 吞掉后返回 **HTTP 200 + `list:[]` + `total:0`**，前端会显示"暂无告警"，无法与"真的没有告警"区分。

- 与本次迁移**无关**：缺列错误在任何 status 取值下都会发生。
- 本次**未修**（§17 禁止顺手改无关模块，FU-18 已登记）。
- 结论：`/api/hse/alerts` 不能作为"迁移验收通过"的证据，只能记为"既有缺陷未修复"。

### D-04｜文档 §18 的接口路径与实际不符（两处）

| 文档写法 | 实际路径 |
|---|---|
| `/api/hse/overview` | **`/api/overview/stats`**（`summary` 里没有 `byStatus`） |
| `/api/alerts` | `/api/hse/alerts` |

已按实际路径验收。

---

## 七、执行范围边界（重要）

| 库 | hazards 现状 | 是否被本次改动 |
|---|---|---|
| `safety_dashboard_dev` | `closed 60 / discovered 50` | **是（已迁移）** |
| `safety_dashboard`（生产） | `已完成 60 / NULL 50` | **否（完全未触碰）** |

生产库经只读查询确认仍为 `{已完成:60, NULL:50}`，与 dev 迁移前完全一致。

**本次只完成了 dev 演练，不等于生产已迁移。** 生产写库按既有红线需要：单独授权 + 执行窗口 + 生产指纹留档 + 回滚预案，属 P3-04-03 范围，本次不涉及。

---

## 八、回滚方案

回滚清单已落盘：

```text
%TEMP%\p3-04-02-rollback-<ts>.json
```

内容包含：迁移前指纹、`status='已完成'` 的 60 个 id、`fixer+fix_date` 的 9 个 id、全部 50 个 NULL 的 id。

由于迁移后 `closed` = 原来是 `已完成` 的 60 条，**不能**用 `status='closed'` 反推，必须按 id 清单反向执行：

```sql
UPDATE hazards SET status='已完成' WHERE id IN (<60 个 id>);
UPDATE hazards SET status=NULL     WHERE id IN (<50 个 id>);
-- 回滚后校验 row_hash 应回到 0ba357407eab96e9bf036986cd007718
```

---

## 九、结论

```text
P3-04-01.2 按方案 A 修正后      = PASS
P3-04-02 dev 迁移执行            = PASS（方案 A，110 行）
Service 级验收                   = 31/31 PASS
接口级验收                       = 18/18 PASS
指纹完整性（逆向还原）           = 逐字节一致
伪造 review / verify             = 0
新增列 / 新增表                  = 0
生产库                           = 未触碰（仍 已完成60 / NULL50）
Git                              = 未 commit / 未 push
```

**遗留**：`/api/hse/alerts` 的 `title` / `resolved_at` 缺列（FU-18）仍需单独修复；生产库迁移需单独立项授权。

---

## 附录｜复现命令

```bash
# 迁移（幂等前提：仅当现状仍为 已完成60/NULL50 时可重复；已迁移则 G2 会拦下）
cd server && node scripts/p3-04-02-migrate-legacy-status.js --plan=A --execute

# 迁移后 service 级验收（31 项）
node scripts/p3-04-02-post-verify.js

# 迁移后接口级验收（18 项，真实路由 + supertest，无需账号）
node scripts/p3-04-02-endpoint-verify.js

# 双方案指标对撞（只读，迁移后再跑会显示 A 已达成）
node scripts/p3-04-02-preflight-dual-plan.js
```
