# P3-04-02｜历史隐患状态迁移执行前门禁｜BLOCKED 报告 V1.0

**结论：BLOCKED（未执行任何写入）**
**P3-04-01.2 = 不可按原文放行**
**P3-04-02 = NO-GO（原文方案）**
**数据库写入 = 0 行**
**DDL = 0 / DML = 0 / Commit = 0 / Push = 0**

---

## 一、本报告在做什么

收到 P3-04-01.2（自主检查与执行版）后，按该文件 §16「执行前最后技术检查」的第 1～5 项执行：

1. 当前数据库确认 → 通过（`safety_dashboard_dev` / `hse_app` / `Asia/Shanghai`）
2. 当前 Git HEAD 确认 → `5e8b052`（未变）
3. 迁移前快照 → 已取
4. 目标记录 ID 快照 → 已取（60 + 9 + 50）
5. SQL dry-run → 已跑（方案 A / 方案 B 各一次）

**第 6 项「迁移事务执行」未启动。**

原因不是授权不足，而是**方案 B 的终态在数据上自相矛盾**：按 §13/§14 执行后，`hazards` 会停在 `closed 60 + discovered 9 + NULL 41` 这种**既不符合 §3 自己定义的生命周期、也过不了 §16 第 8 项回归**的状态。

按项目既有纪律（"出现不一致立即 BLOCKED"），此处停止并回报，不做写库。

---

## 二、核心发现：方案 B 三项硬性矛盾（实测，非推断）

同一套 SQL，仅替换 `CASE` 映射，对撞三种时点：

| 指标 | 当前 | 方案 A（60+50） | 方案 B（60+9+41） |
|---|---:|---:|---:|
| 生命周期四桶合计 | **0** | **110** | **69** |
| ├ discovered | 0 | 50 | 9 |
| ├ processing | 0 | 0 | 0 |
| ├ pending_review | 0 | 0 | 0 |
| ├ closed | 0 | 60 | 60 |
| ├ 仍为 NULL | 50 | **0** | **41** |
| └ 非 canonical（`已完成`） | 60 | 0 | 0 |
| `hazards.total` | 110 | 110 | 110 |
| `stats().overdueCount` | 60 | **50** | **9** |
| `todos hazard:overdue` | 50 | 50 | 50 |
| `overview.hazard.closed` | 0 | 60 | 60 |
| R-01 completed / pending | 60 / 0 | 60 / 0 | 60 / 0 |
| AI `unrectified` | 0 | **50** | **9** |
| AI `unknown_status` | 50 | 0 | **41** |

### 机器判定

```text
FAIL  B: 四桶合计 = total ?            （69 ≠ 110）
FAIL  B: 无 NULL 残留 ?                （残留 41）
FAIL  B: overdueCount 命中冻结基线 50 ? （实测 9）
PASS  A: 四桶合计 = total ?
PASS  A: 无 NULL 残留 ?
PASS  A: overdueCount 命中冻结基线 50 ?
```

`byStatus` 键的实际形状：

```text
当前 : [{"<NULL>":50}, {"已完成":60}]
方案A: [{"closed":60}, {"discovered":50}]
方案B: [{"<NULL>":41}, {"closed":60}, {"discovered":9}]
```

### 这意味着什么

方案 B 执行后：

- **110 条隐患中有 41 条（37.3%）在生命周期统计里彻底消失**——`stats()` 四桶合计 69，但 `total` 是 110，对不上；
- `overdueCount` 从 60 掉到 **9**，而冻结基线是 **50**；
- AI 未整改数从「迁移后应为 50」变成 **9**，`unknown_status` 从 0 变成 **41**；
- `overview.byStatus` 里永远留着一个 `null: 41` 的桶。

这正是 P3-04-00.4 用四轮审计在消灭的那个缺陷：**NULL 被三值逻辑静默丢弃**。方案 B 等于把这个缺陷以 41 条永久存量的形式保留下来。

---

## 三、F-02：文档三处事实性错误（含一处新造表名）

| 断言位置 | 原文 | 实测 | 判定 |
|---|---|---|---|
| §3 / §5.2 / §8 | `hazard_reviews = 0` | `to_regclass('public.hazard_reviews')` = **`null`**，该表**不存在** | **错误** |
| §13 §14 §15 | 41 条 NULL 保持不动 | 41 条会让四桶合计 ≠ total、overdue 偏离基线 | **不可行** |
| §5.2 | "没有可以自动恢复的复核记录" | 结论成立，但承载表名错 | 需改表名 |

`public` 下与 review/verify 相关的表实际是：

| 表 | 行数 | 是否隐患复核 |
|---|---:|---|
| `review_record` | **1** | 是（列含 `hazard_id` / `review_result` / `is_final`），但这 1 行 `hazard_id = 99999`，**110 条隐患中无此 id**（现存 id ≤ 153）⇒ 孤儿/测试行 |
| `hse_reviews` | **0** | 是（列含 `hazard_id`） |
| `hse_document_reviews` | 1 | 否（文档评审） |
| `backup_98_hse_reviews` | 0 | 备份表 |

**结论不变**：110 条隐患确实没有任何一条存在可用复核记录，"不补造 review"的判断正确。但"`hazard_reviews = 0`"这个表述应改为"无 `hazard_reviews` 表；`review_record` 仅 1 行孤儿、`hse_reviews` 0 行"。

> 这是本系列第三次出现"引用一个不存在的表"（前两次：`statusMap` 死配置误判、`migration_review_queue`）。签核/执行文件里凡出现表名，必须先 `to_regclass` 验证。

---

## 四、F-03：方案 B 与冻结基线全面冲突

P3-04-00.4 的 25 条读取矩阵，其全部迁移后期望值都是**按「50 条 NULL 全部 → discovered」推导的**：

| 冻结基线（00.4） | 期望值 | 方案 A | 方案 B |
|---|---:|---:|---:|
| `stats()` discovered | 50 | 50 ✅ | 9 ❌ |
| `stats()` 四桶合计 | 110 | 110 ✅ | 69 ❌ |
| `stats().overdueCount` | 50 | 50 ✅ | 9 ❌ |
| `overview.byStatus.discovered` | 50 | 50 ✅ | 9 ❌ |
| AI `unrectifiedCount` | 50 | 50 ✅ | 9 ❌ |
| AI `unknownStatus` | 0 | 0 ✅ | 41 ❌ |
| `overdueCount` 变化方向 | 60→50 | ✅ | 60→9 ❌ |

而 §16 第 8 项明确要求「25 条读路径回归」。**在方案 B 下，这项回归在构造上就不可能通过**——不是代码 bug，是终态与基线不一致。

---

## 五、F-05：为什么「保持 NULL 更保守」这个理由不成立

§15 的理由是：

> 这 41 条没有 fixer+fix_date，无法推断是 discovered 还是 processing，更不能推断 closed，所以保持 NULL 最保守。

这个推理错在**把 `discovered` 当成了需要证据的状态**。按 §5 自己给出的定义：

| 状态 | 含义 | 需要什么证据 |
|---|---|---|
| `discovered` | 已发现，**尚未形成有效整改闭环** | **不需要**。它就是"没有任何闭环证据"的默认位置 |
| `processing` | 正在整改 | 需要"正在整改"的证据 |
| `pending_review` | 已提交整改，等待复核 | 需要提交证据 |
| `closed` | 已完成闭环 | 需要验收证据 |

50 条 NULL 的共同事实是「**没有任何一条有闭环证据**」（7 个验收/复核字段全为 0）。这个事实**恰好等价于 `discovered` 的定义**，因此 `NULL → discovered` 是**证据支持的映射**，不是推断，更不是补造。

反过来：

- `NULL → closed` = 补造闭环事实（禁止）；
- `NULL → 保持 NULL` = 让 41 条继续以数据库里的非法值存在，且被所有 `!= 'closed'` 类谓词静默丢弃（这正是 4 轮审计修掉的 bug）。

**"不动"在这里不等于"保守"，等于"把问题留在库里"。**

---

## 六、方案 A 为什么是唯一自洽解

```text
已完成 (60)  → closed       证据：历史系统保存的完成状态（唯一可用事实）
NULL     (50) → discovered   证据：7 个闭环字段全为 0 ⇒ 无闭环证据 ⇒ 即 discovered 定义
```

执行后：

| 检验项 | 期望 | 方案 A 实测推导 |
|---|---:|---:|
| 四桶合计 = total | 110 = 110 | ✅ |
| NULL 残留 | 0 | ✅ 0 |
| 非 canonical 残留 | 0 | ✅ 0 |
| `overdueCount` | 50 | ✅ 50 |
| `todos hazard:overdue` 稳定 | 50 | ✅ 50（`sqlStatusOpen` 把 NULL 视作未闭环，两个方案都不变） |
| `byStatus` | `{closed:60, discovered:50}` | ✅ |
| 新增/删除行 | 0 | ✅ 110 → 110 |
| 非 status 字段改动 | 0 | ✅（`hazards` 无触发器，`updated_at` 不变，脚本逐行校验） |

方案 A 相对方案 B 的**额外动作**只有一句 SQL：

```sql
UPDATE hazards SET status='discovered' WHERE is_deleted=false AND status IS NULL;  -- 50 行
```

它不增加任何业务事实，只是把 41 条从"库里非法、统计里消失"挪到"库里非法值消失、统计里可见"。

---

## 七、执行侧已就绪（但未触发）

新增脚本 `server/scripts/p3-04-02-migrate-legacy-status.js`，六道护栏已实现并实测：

| 护栏 | 内容 | 状态 |
|---|---|---|
| G1 | 库名硬设 `safety_dashboard_dev` + 断言 `current_database()`，只允许 dev | 已验 |
| G2 | 迁移前分布必须严格 `{已完成:60, NULL:50}`，出现第三种取值即中止 | 已验 |
| G3 | 总行数必须 = 110 | 已验 |
| G4 | `UPDATE` 的 `rowCount` 必须精确等于预期（60 / 50 或 9），否则 ROLLBACK | 已实现 |
| G5 | 事务内复核四桶、NULL 残留、`updated_at` 未变，任一失败即 ROLLBACK | 已实现 |
| G6 | 回滚 id 清单落盘（临时目录，不入仓库） | 已验（两次 dry-run 均产出） |

dry-run 实测输出：

```text
方案A 终态: {"discovered":50,"closed":60,"still_null":0,"total":110}
方案B 终态: {"discovered":9, "closed":60,"still_null":41,"total":110}
```

**两次 dry-run 均为只读，数据库零改动**（指纹 `row_hash=0ba357407eab96e9bf036986cd007718` 前后一致）。

---

## 八、需要拍板的一件事

P3-04-01.2 §13/§14/§15 要求「41 条保持 NULL」，但同一份文件 §3 定义的生命周期只有 4 个状态、§18 要求「非法新增状态 = 0」、§16 要求「25 条读路径回归通过」。

这三条与 §14 不能同时成立。必须二选一：

| 选项 | 动作 | 终态 | 后果 |
|---|---|---|---|
| **A（推荐）** | 60→closed，**50→discovered** | `closed 60 / discovered 50 / NULL 0` | 与冻结基线完全一致，四桶合计 110，overdue 50，回归可过 |
| **B（按原文）** | 60→closed，**仅 9→discovered** | `closed 60 / discovered 9 / NULL 41` | 四桶合计 69，overdue 9，AI 未整改 9，回归必然失败，41 条永久不可见 |

选 A 之后，本脚本一条命令即可执行（含事务与回滚清单），随后按 §18 做五项接口回归。

---

## 九、本报告未做的事

- 未执行任何 `INSERT` / `UPDATE` / `DELETE` / DDL；
- 未修改 `hazards` 任何行、任何列（含 `updated_at`、`remark`）；
- 未创建任何表（`migration_review_queue`、`hazard_reviews`、`legacy_closed_without_review` 均未创建）；
- 未 commit、未 push，HEAD 仍 `5e8b052`。

---

## 附录｜复现命令

```bash
# 1) 双方案对撞（只读）
cd server && node scripts/p3-04-02-preflight-dual-plan.js

# 2) 迁移脚本 dry-run（只读）
node scripts/p3-04-02-migrate-legacy-status.js --plan=A
node scripts/p3-04-02-migrate-legacy-status.js --plan=B

# 3) 真执行（需明确指令后才运行）
# node scripts/p3-04-02-migrate-legacy-status.js --plan=A --execute
```
