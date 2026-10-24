# P3-04-02｜DEV 隐患状态规范化迁移最终审计报告

**版本：V1.0（含本轮更正 C-15～C-21）**
**审计阶段：P3-04-02**
**执行环境：`safety_dashboard_dev`（127.0.0.1:5432，用户 `hse_app`，PG 17.10，时区 Asia/Shanghai）**
**Git：`feat/hse-business-closure` / HEAD `5e8b0524ccd69369e59857024f0640cadec5f4cb`**
**执行结论：PASS**
**生产库状态：未执行、未修改（只读核验 2 次）**

> 本报告在用户提供的报告稿基础上，逐项回源复算。**结论方向一致，但发现 7 处需要更正/补强（C-15～C-21）**，其中 C-16 为证据强度问题、C-18 为生产迁移前置缺口、C-21 为代码残留缺陷，均在正文相应位置就地更正，并在第 22 节汇总。

---

# 一、执行结论

本次完成开发数据库 `safety_dashboard_dev` 的历史隐患状态规范化迁移。

迁移前：

```text
已完成    60
NULL      50
总计      110
```

迁移后（`is_deleted=false` 口径）：

```text
closed         60
discovered     50
processing      0
pending_review  0
NULL            0
总计           110
```

全表口径同样为 110 行（软删行 = 0，`is_deleted=true` 计 0 行），因此本报告不存在口径歧义。

最终结果：

> **110/110 条隐患均进入 canonical lifecycle，NULL 残留 0，非 canonical 生命周期状态 0，中文/大写生命周期值 0。**

本次迁移未新增、未删除任何隐患记录；除 `status` 外的 45 个字段经**未迁移生产库对照**证明逐字节未变（见第五节）。

---

# 二、实际执行 SQL（逐字）

实际执行的语句（`server/scripts/p3-04-02-migrate-legacy-status.js`，`--plan=A --execute`）：

```sql
BEGIN;

UPDATE hazards SET status='closed'
 WHERE is_deleted=false AND status='已完成';

UPDATE hazards SET status='discovered'
 WHERE is_deleted=false AND status IS NULL;

-- 事务内阻断校验（行数 / 分布 / 总量 / updated_at / NULL 残留）
COMMIT;
```

执行结果：

```text
已完成 → closed       60 rows
NULL   → discovered   50 rows
总影响               110 rows
```

> **C-15｜更正**：原稿 §2 写作 `WHERE status='已完成'` / `WHERE status IS NULL`，**漏掉了 `is_deleted=false`**。实际执行的语句带该条件。因本库软删行为 0，两种写法数值无差，但迁移文档必须与执行语句逐字一致，否则未来在含软删行的库上复用会扩大影响面。

---

# 三、为什么最终采用 NULL → discovered

此前方案曾要求保留 41 条 NULL。执行前门禁实测发现该方案不可接受。

保留 41 条 NULL 时实测（plan=B dry-run，非推断）：

| 检验 | 实测结果 | 应然结果 |
|---|---:|---:|
| 四桶合计 | 69 | 110 |
| NULL 残留 | 41 | 0 |
| `stats().overdueCount` | 9 | 50 |
| AI 未整改 | 9 | 50 |
| AI unknownStatus | 41 | 0 |
| `overview.byStatus` | 永久保留 `null: 41` 桶 | 仅 canonical 键 |

因此该方案会导致 canonical lifecycle 与 PostgreSQL NULL 三值逻辑长期并存。

`discovered` 的定义即「尚未形成任何闭环证据的隐患」，而原 50 条 NULL 的 7 个闭环/验收字段全部为 0（`verify_user` / `verify_date` / `reviewer_id` / `review_date` / `review_result` / `rectify_date` / `actual_rectify_date`）。

因此：

```text
NULL → discovered
```

属于**基于字段定义的数据规范化映射**，不是对整改完成情况的推测。最终采用：

```text
60 × 已完成 → closed
50 × NULL   → discovered
```

---

# 四、迁移前后数据完整性验证

## 4.1 总记录数

| 口径 | 迁移前 | 迁移后 |
|---|---:|---:|
| `is_deleted=false` | 110 | 110 |
| 全表 | 110 | 110 |
| 软删（`is_deleted=true`） | 0 | 0 |

结论：**总记录数零变化，且不存在"只迁 live 行、漏迁软删行"的口径撕裂。**

## 4.2 未牵连业务域

| 表 | 迁移后行数 |
|---|---:|
| `rectification_task` | 0 |
| `review_record` | 1（孤儿行：`hazard_id=99999`，现有 id ≤ 203） |
| `hse_reviews` | 0 |

结论：**本次迁移未新增任何复核/验收事实。** `review_record` 那 1 行是迁移前即存在的孤儿行，未被本次操作触碰。

---

# 五、Row Hash 逆向验证（含本轮证据强化）

## 5.1 原指纹（3 列口径）

迁移前基准：

```text
0ba357407eab96e9bf036986cd007718
```

算法：`md5(string_agg(id | status映射 | updated_at, ',' ORDER BY id))`，其中 `closed→已完成`、`discovered→NULL` 逆向还原。

迁移后逆向重算：

```text
0ba357407eab96e9bf036986cd007718
```

**字节级一致。**

> **C-16｜更正（重要）**：该指纹只覆盖 **id / status / updated_at 三列**（46 列中的 3 列）。原文由此推出"迁移未改变其他业务字段"属于**证据越界**。哈希一致只能证明这三列没变。

## 5.2 本轮新增：45 列全列指纹 + 未迁移生产库对照组

为避免上述证据越界，本轮补算**除 `status` 外全部 45 列**的全列指纹（`md5(string_agg(id || (to_jsonb(t)-'status')::text, ',' ORDER BY id))`）：

| 对象 | 时点 | 除 status 外 45 列指纹 |
|---|---|---|
| `safety_dashboard_dev` | **迁移后** | `10ed9e9120e4bbf8e49331acb9c66a66` |
| `safety_dashboard`（生产） | **未迁移** | `10ed9e9120e4bbf8e49331acb9c66a66` |

> **两者完全一致。** 生产库是本次迁移的**天然对照组**：同一份数据的未迁移副本。dev 迁移后 45 个非 status 列仍与生产逐字节相同 ⇒ **除 status 外没有任何字段被改动，这是对照证明，不是推断。**

含 `status` 的全列指纹（差异符合预期，仅 status 不同）：

| 对象 | 全列指纹 |
|---|---|
| dev（迁移后） | `be45b42e06362c58734df59a4a9ee01d` |
| prod（迁移前） | `9e8d8b24c56cfe4e80d9015d628658cc` |

**该对照同时确立 P3-04-03 的验收基准**：生产数据未变且迁移正确时，迁移后生产全列指纹应等于 `be45b42e06362c58734df59a4a9ee01d`，而除 status 指纹应保持 `10ed9e9120e4bbf8e49331acb9c66a66` 不变。

---

# 六、触发器与写入通道检查

| 检查项 | 实测 |
|---|---|
| `pg_trigger` on `hazards`（非 internal） | **0** |
| `pg_rewrite` 规则（`ev_class=hazards`） | **0** |
| `pg_class.relkind` | **`r`（普通表，非视图/外部表）** |

结论：不存在

```text
UPDATE status → trigger → 自动改 updated_at
```

等隐式副作用；也不存在视图 `INSTEAD OF` 规则改道。结合 `SET` 子句只列 `status` 一个列，结构上排除其他列被改写的路径。

`updated_at` 实测（迁移前后一致）：

```text
min(updated_at) = 2026-08-24 23:36:23.249943
max(updated_at) = 2026-08-25 07:58:27.198297
```

---

# 七、Service 级验收

执行 `node scripts/p3-04-02-post-verify.js`（本轮复跑）：

```text
TOTAL=31  PASS=31  FAIL=0
```

核心四桶：

```text
discovered       50
processing        0
pending_review    0
closed           60
总计            110
```

---

# 八、核心指标验收

| 指标 | 迁移前 | 迁移后 | 判定 |
|---|---:|---:|---|
| `stats().overdueCount` | 60 | **50** | 命中冻结基线 |
| `remindersOverdue.total` | 60 | **50** | 符合 canonical 预期 |
| `overview.byStatus` | `{null:50, 已完成:60}` | `{closed:60, discovered:50}` | 仅 2 个 canonical 键 |
| `hazard.closed` | 0 | **60** | 与 `closed=60` 一致 |
| `todos`（`hazard:overdue`） | 60 | **50** | 命中基线 |
| AI 未整改 | 0 | **50** | — |
| AI unknownStatus | 50 | **0** | NULL 不再形成未知状态 |
| R-01 `rectificationStatus` | `[110,60,0,0,0]` | `[110,60,0,0,0]` | **零漂移** |

## 8.1 关于 `byStatus`

迁移后仅两个键，无 `已完成` / `未完成` / `已整改` / `已验收` / `进行中` / `待处理` 等中文遗留值。

## 8.2 关于 `overdueCount` 60 → 50 的机理（须说清，否则会被当成"丢数据"）

`overdueCount` 的 SQL 谓词是 `h.status != 'closed'`（**裸 `!=`，非 NULL 安全**）。迁移前：

- 60 条 `已完成`：`'已完成' != 'closed'` → TRUE，**被算作未关闭**；
- 50 条 NULL：`NULL != 'closed'` → NULL → **被静默丢弃**。

迁移后：`closed` 60 条被正确排除，`discovered` 50 条被正确计入 → 50。

> 即迁移前 60 这个数值本身是错的（把历史"已完成"当成未关闭），迁移后的 50 才是真值。**这是业务纠正，不是数据丢失。**

## 8.3 关于 R-01 恒 0 的结构性原因

`pending` / `overdue` / `inProgress` 恒 0 的原因是库中 `status='未完成'` **0 行**，与本次迁移无关，也不是"所有隐患都已整改"。

---

# 九、Endpoint 级验收

执行 `node scripts/p3-04-02-endpoint-verify.js`（真实 Express 路由 + supertest，无需账号）：

```text
TOTAL=18  PASS=18  FAIL=0
```

> **C-17｜口径更正**：这 18 项中，**17 项是迁移相关强断言**，第 18 项是 `/api/hse/alerts` 的 **FU-18 既有缺陷登记项**（脚本按"记录"处理，不构成通过）。因此更准确的表述是：
>
> ```text
> 迁移相关断言 17/17 PASS + 1 项已知缺陷登记
> ```

覆盖接口：

```text
/api/hazards/stats        → total 110 / discovered 50 / closed 60 / overdueCount 50
/api/hazards              → total 110，返回行无中文状态
/api/overview/stats       → hazard.total 110，byStatus {closed:60, discovered:50}，hazard.closed 60
/api/hse/todos            → hazard_overdue.count = 50
/api/hse/alerts           → 200 + 空列表（FU-18，既有缺陷，非回归）
```

---

# 十、路径纠正

原审计文档曾写 `/api/hse/overview` —— **该路径不存在**。实际为：

```text
/api/overview/stats      ← 含 hazard.byStatus
/api/overview/summary    ← 不含 byStatus
```

更细一层：驾驶舱字段是 **`hazard.byStatus.discovered`**，不存在 `hazard.discovered` 这个字段（`routes/overview.js` 全文 `discovered` 命中位于 `byStatus` 构造处）。后续文档与验收脚本不得再引用 `/api/hse/overview` 或 `hazard.discovered`。

---

# 十一、D-01｜迁移脚本校验缺陷

## 现象

脚本的"非 canonical 残留"校验位于 `COMMIT` **之后**，且该 SQL 的 `HAVING` 引用了未分组列 ⇒ 数据已提交成功，脚本却以退出码 `1` 结束。

```text
脚本 exit 1  ≠  数据迁移失败
```

## 处理

已修正：`HAVING` 改为引用分组别名；校验语句移入事务、`COMMIT` 之前。

## 固化要求

```
BEGIN
 ↓ UPDATE
 ↓ rowCount 精确比对
 ↓ 分布检查（四桶 + NULL 残留 + 非 canonical）
 ↓ 总量检查（110）
 ↓ 指纹检查（updated_at 不变）
 ↓ 任一失败 → ROLLBACK
COMMIT
 ↓ 仅允许只读验证
```

---

# 十二、D-02｜验收工具自身缺陷

初次验收 6 项 FAIL，经复核**全部为验证工具问题**，非数据库问题。

## 问题 1：`fix_date` 去重数

按记忆写 25，实测 **20**。已纠正（本轮复跑仍为 20）。

## 问题 2：`stats()` 全 0

未先调用 `db.testConnection()` ⇒ `isConnected() = false` ⇒ service 进入内存降级模式，静默返回 0。

差一点被误读为"迁移把数据清空了"。

## 固化要求

HSE 验收工具必须显式区分：

```text
DB unavailable        ≠   query result = 0
```

数据库不可用时须**抛错退出**，禁止静默降级成"业务数据为 0"。

---

# 十三、D-03｜FU-18：Alerts 既有缺陷

`/api/hse/alerts` 的 SQL 选择 `title` / `resolved_at`，而 `hazards` 46 列中**均不存在**。查询失败后被 `catch` 成：

```text
HTTP 200 + data.list = [] + total = 0
```

后果：**"没有告警"与"SQL 报错"在接口层无法区分**（前端无法感知故障）。

- 触发条件：任何 `status` 取值下都必失败，与本次迁移无关；
- 本轮复跑确认：`字段 "title" 不存在`，返回 `200 + total=0`，行为与迁移前一致；
- 处置：正式编号 **FU-18**，按范围控制**本次不修**，独立立项。

---

# 十四、D-04｜审计文档路径偏差

`/api/hse/overview` → 实际 `/api/overview/stats`；`hazard.discovered` → 实际 `hazard.byStatus.discovered`。

性质：**审计文档错误**，非数据迁移缺陷。已在本报告更正。

---

# 十五、生产环境隔离验证

本次执行严格限制在 `safety_dashboard_dev`（连接串与 `current_database()` 双重断言）。

对生产 `safety_dashboard` 仅做**只读**查询（本轮再次复核）：

```text
[生产库] safety_dashboard
[生产 is_deleted=false] {<NULL>: 50, 已完成: 60}
[生产 全表]             {<NULL>: 50, 已完成: 60}
[生产 除 status 45 列指纹] 10ed9e9120e4bbf8e49331acb9c66a66   ← 与 dev 迁移后一致
```

结论：

> **生产数据未发生任何变化，且与 dev 迁移后除 status 外完全一致。**

---

# 十六、Git 状态

```text
branch = feat/hse-business-closure
HEAD   = 5e8b0524ccd69369e59857024f0640cadec5f4cb
commit = 未执行
push   = 未执行
```

> **C-18｜补强（生产前置缺口）**：原稿仅写"未 commit/未 push"，但实际工作区并非干净：
>
> | 类别 | 数量 | 说明 |
> |---|---:|---|
> | 已修改（` M`） | **17** | 其中 **12 个属 P3-04 域**（11 个后端 + `statusColors.ts`），**5 个属 objectives/budget 在途工作** |
> | 未跟踪（`??`） | **35** | 其中 **16 个属 P3-04 域**（8 份报告 + 5 个脚本 + 3 项其他） |
> | 合计 | **52** | — |
>
> **关键事实：执行本次迁移的后端代码不在 git 中。** HEAD `5e8b052` 不包含 P3-04 的任何修复（`hazardService.js`、`todos.js` 的 `sqlStatusOpen`、`importShared.js` 白名单等 11 个文件均为未提交状态）。
>
> 因此"迁移结果与 Git 版本严格分离"这句话只能说明**未提交**，不能说明**生产可复现**。按项目红线「工作区即发布源」，**P3-04-03 开始前必须冻结"实际运行代码清单"（逐文件 sha256）**，否则无法证明生产迁移跑的是被审计过的那份代码。

---

# 十七、阶段状态

```text
P3-04-00       PASS
P3-04-00.1     PASS
P3-04-00.2     PASS
P3-04-00.3     PASS
P3-04-00.4     PASS
P3-04-01       PASS（自决，见下）
P3-04-02       PASS（DEV MIGRATION）
```

> **C-19｜必须标注的定性**：`P3-04-01 = PASS` 的来源是 **P3-04-01.2「自主执行版」授权**（由审计方自决关闭 BG-05 / BG-06 / BG-06b / A-1 与 O-01 / O-02 / O-07 / O-08），**全程无任何人工业务签字**。
>
> 同时，`P3-04-01` 与 `P3-04-01.1` 两份签核包文件的头部状态仍为 `NO-GO / BUSINESS APPROVAL = PENDING`，决策页签署栏空白。两者**不矛盾**：前者是"签核包状态"，后者是"自决执行结论"。
>
> 若未来需向外部/合规追溯，必须明确写为：**该 PASS 属"审计方自决执行"，不属"业务审批"。** 不得表述为"业务已签核"。

---

# 十八、生产迁移状态

```text
P3-04-03 = NOT STARTED
```

不得将 DEV 完成等同于生产完成。生产迁移必须独立完成：

```text
生产迁移前快照（全列指纹 + 分布 + 行数 + 时间戳）
 ↓
代码冻结清单（逐文件 sha256，证明与 dev 验证版一致）
 ↓
dry-run（行数/分布/终态推导三对撞）
 ↓
回滚方案（id 清单落盘 + 逆向 SQL）
 ↓
正式执行（事务）
 ↓
COMMIT 前阻断检查
 ↓
COMMIT
 ↓
只读验收（全列指纹必须等于 be45b42e06362c58734df59a4a9ee01d）
```

---

# 十九、P3-04-03 启动条件

P3-04-03 仅允许处理：**生产数据库 `safety_dashboard` 的历史状态规范化迁移。**

启动前必须具备：

- [ ] 生产库操作授权（含执行窗口）
- [ ] 生产迁移前全列指纹留档（除 status = `10ed9e91…`，全列 = `9e8d8b24…`）
- [ ] 代码冻结清单（17 个改动文件的 sha256，确认与 dev 验证版一致）
- [ ] dry-run 三对撞通过
- [ ] 回滚 id 清单 + 逆向 SQL 就绪
- [ ] `status` 仍 NULLABLE 的风险告知（DEFAULT 只封"省略列"路径，显式 `NULL` 仍可写）
- [ ] 4 处残留 NULL 不安全谓词已登记（见第 22 节 FU-19），确认不构成生产迁移阻塞

不允许顺便：

- 修复 FU-18；
- 修改其他业务表；
- 删除历史模型；
- 重构 hazard 服务；
- 修改 P2 / 登录权限 / WPS / 风险库 / 网格数据。

---

# 二十、最终审计结论

```text
DEV 数据迁移            PASS
数据完整性              PASS
状态规范化              PASS
Service 验收            31/31 PASS
Endpoint 验收           17/17 PASS（+1 项 FU-18 登记）
R-01 漂移               零漂移
Row Hash 逆向           一致（3 列口径）
45 列对照指纹           一致（dev 迁移后 == prod 未迁移）
触发器/规则             0 / 0，relkind = r
生产隔离                PASS（只读 2 次，分布未变）
Git                     未 commit / 未 push（HEAD 5e8b052）
```

终态：

```text
closed       60
discovered   50
NULL          0
total        110
```

---

# 二十一、冻结结论

> **P3-04-02 DEV 隐患状态规范化迁移正式冻结为 PASS。**

当前唯一允许推进的方向：**P3-04-03｜生产迁移准备。**

在进入生产迁移之前：不再修改 DEV 的历史状态结果，不因 FU-18 扩大本次迁移范围，也不因本轮发现扩大 P3-04-02 的执行范围（C-15～C-21 均为**文档更正与登记**，零 DML、零 DDL）。

---

# 二十二、本轮审计更正汇总（C-15～C-21）

| 编号 | 位置 | 问题 | 处置 |
|---|---|---|---|
| **C-15** | §2 | 文档 SQL 漏 `is_deleted=false` | 已改为逐字一致；实测软删 0 行，数值无差 |
| **C-16** | §5/§6 | row_hash 仅覆盖 3/46 列，却推出"其他字段未变" | 已改为：结构证据（单列 SET + 0 触发器 + 0 规则 + `relkind=r`）+ **45 列对照指纹**（dev 迁移后 == prod 未迁移 == `10ed9e91…`） |
| **C-17** | §9 | "18/18 PASS" 含 1 项缺陷登记 | 已改为 17 项强断言 + 1 项 FU-18 登记 |
| **C-18** | §16 | 只说未提交，未披露工作区 52 项未提交、P3-04 代码不在 git | 已补：17 改 + 35 未跟踪；P3-04 域 12 改 + 16 未跟踪；生产前须冻结代码 sha256 |
| **C-19** | §17 | `P3-04-01 = PASS` 未标注来源 | 已注明：**自决执行结论，无人工签核**；签核包文件仍为 PENDING |
| **C-20** | §4 | "110/110 进入 canonical" 未标口径 | 已补：live 110 / 全表 110 / 软删 0，无口径歧义 |
| **C-21** | §8 | `remindersOverdue` 等仍用裸 `!=` 谓词，未登记 | 新登记 **FU-19**（见下），P2，不构成迁移回归 |

## FU-19｜残留 NULL 不安全谓词（新登记，P2）

`hazards.status` **仍为 NULLABLE**（DEFAULT 只封"省略列"路径），以下位置仍使用裸 `!=`，对 NULL 求值为 NULL ⇒ 行被静默丢弃：

| 文件:行 | 所属函数 | 谓词 |
|---|---|---|
| `services/hazardService.js:619` | `stats()`（`overdueCount`） | `h.status != 'closed'` |
| `services/hazardService.js:1100` | `remindersHighRisk()` | 同上 |
| `services/hazardService.js:1123` | `remindersOverdue()` | 同上 |
| `services/hazardService.js:1171` | `analysisResponsibleOverdue()` | 同上（`CASE WHEN`） |
| `routes/overview.js:172` | `expired` 指标 | 同上（且 `deadline_date` 100% NULL，指标本身为死指标，FU-15） |

**当前影响：0**——dev 迁移后 NULL 行 = 0，这 5 处数值均正确（`overdueCount=50`、`remindersOverdue=50` 已实测）。

**风险**：一旦未来出现显式 `NULL` 写入（列仍可空），这 5 处会再次静默漏统计，且**不会报错**。修复方向：统一改用 `hazardService.sqlStatusOpen(alias)`。本次按范围控制**不修**。

---

# 附录 A｜迁移前后完整指纹对照（供 P3-04-03 直接引用）

| 项目 | 迁移前（prod 现态 / dev 历史基线） | 迁移后（dev 现态） |
|---|---|---|
| 分布 | `已完成 60` / `NULL 50` | `closed 60` / `discovered 50` |
| 行数 | 110 | 110 |
| 软删行 | 0 | 0 |
| row_hash（3 列逆向） | `0ba357407eab96e9bf036986cd007718` | 同值（还原后一致） |
| 除 status 45 列指纹 | `10ed9e9120e4bbf8e49331acb9c66a66` | `10ed9e9120e4bbf8e49331acb9c66a66` |
| 含 status 全列指纹 | `9e8d8b24c56cfe4e80d9015d628658cc`（prod） | `be45b42e06362c58734df59a4a9ee01d`（dev） |
| `hazards` 列数 | 46 | 46 |
| public 关系数 | 352 基表 + 13 视图 = 365 | 同 |
| `max(created_at)` | `2026-08-24 23:36:23.420706`（本地）/ `15:36:23.420Z`（UTC） | 同 |
| `min/max(updated_at)` | `23:36:23.249943` / `2026-08-25 07:58:27.198297` | 同 |
| `status` DEFAULT | `'discovered'`（00.3 轮已改） | 同 |
| `status` NULLABLE | YES | YES |
| 触发器 / 规则 | 0 / 0 | 0 / 0 |

# 附录 B｜可复现脚本

| 脚本 | 用途 | 本轮复跑 |
|---|---|---|
| `server/scripts/p3-04-02-preflight-dual-plan.js` | 双方案指标对撞（只读） | 已跑 |
| `server/scripts/p3-04-02-migrate-legacy-status.js` | 迁移执行（六道护栏，默认 dry-run） | 未再执行 |
| `server/scripts/p3-04-02-post-verify.js` | Service 级验收 | **31/31 PASS** |
| `server/scripts/p3-04-02-endpoint-verify.js` | 接口级验收（真实路由 + supertest） | **18/18（17 强断言 + 1 登记）** |
| `server/scripts/p3-04-01-signoff-factcheck.js` | 迁移**前**基线断言（现已按设计失败，勿判异常） | 未跑 |

# 附录 C｜未闭合事项

| 编号 | 事项 | 状态 |
|---|---|---|
| FU-18 | `/api/hse/alerts` 缺列 + 静默返空 | OPEN（独立立项） |
| FU-19 | 5 处残留裸 `!=` 谓词（NULL 不安全） | OPEN（P2） |
| O-09 | 生产迁移前代码冻结清单（17 文件 sha256） | OPEN（C-18 新增） |
| O-10 | `status` 仍 NULLABLE 的风险告知与决策 | OPEN |
| P3-04-03 | 生产迁移（未开始） | NOT STARTED |
