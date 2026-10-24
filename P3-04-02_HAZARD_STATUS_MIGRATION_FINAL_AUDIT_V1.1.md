# P3-04-02｜DEV 隐患状态规范化迁移最终审计报告

**版本：V1.1（FINAL FREEZE，含本轮更正 C-22～C-24）**
**状态：FINAL FREEZE**
**执行环境：`safety_dashboard_dev`（127.0.0.1:5432 / `hse_app` / PG 17.10 / Asia/Shanghai）**
**Git：`feat/hse-business-closure` / HEAD `5e8b0524ccd69369e59857024f0640cadec5f4cb`**
**生产环境：未迁移**
**本轮修订：审计复算后修订**

> V1.1 已吸收上一轮 C-16 / C-17 / C-18 / C-19 / C-20 / C-21 六项更正。本轮复算又发现 **3 处需修订（C-22～C-24）**：C-15 在 V1.1 修订中丢失（§二 SQL 又退回不带 `is_deleted=false` 的写法）、O-09 文件清单不完整、冻结指纹缺少"执行时必须重算"的前置说明。三处均已就地更正。

---

# 一、最终结论

P3-04-02 DEV 隐患状态规范化迁移：

> **PASS / FROZEN**

实际终态：

```text
closed         60
discovered     50
processing      0
pending_review  0
NULL            0
------------------
total          110
```

同时确认：

```text
软删除行 = 0
live     = 110
全表     = 110
```

因此本次 110/110 条 live 隐患均纳入 canonical lifecycle。

---

# 二、实际迁移范围

本次 DEV 实际执行（逐字，与脚本 `server/scripts/p3-04-02-migrate-legacy-status.js` 一致）：

```sql
BEGIN;

UPDATE hazards
SET status = 'closed'
WHERE is_deleted = false AND status = '已完成';

UPDATE hazards
SET status = 'discovered'
WHERE is_deleted = false AND status IS NULL;

COMMIT;
```

实际影响：

```text
已完成 → closed       60
NULL   → discovered   50
```

最终：

```text
closed        60
discovered    50
NULL           0
```

总记录数：

```text
110 → 110
```

本次没有删除或新增 `hazards` 行。

> **C-22｜更正**：V1.1 稿 §二 再次写成 `WHERE status='已完成'` / `WHERE status IS NULL`，**丢掉了 `is_deleted=false`**——这是上一版 C-15 已修、本轮修订中回退的问题。实际执行语句带该条件。本库软删行为 0，两种写法数值无差，但迁移文档必须与执行语句逐字一致：一旦未来在含软删行的库上照抄本节，影响面会悄悄扩大。

---

# 三、C-20｜110/110 的统计口径

本报告中的：

> “110/110”

统一指：

> `hazards` 普通表全部 live 数据行。

当前实测：

```text
全表         = 110
live         = 110
soft deleted = 0
```

因此本次不存在：

> “全表 110，但业务 live 记录少于 110”

之类的口径歧义。

---

# 四、为什么 50 条 NULL 必须迁移为 discovered

本次执行前曾评估保留部分 NULL。

实测方案 B（dry-run，非推断）：

```text
closed        60
discovered     9
NULL          41
```

会导致：

```text
四桶合计      = 69
NULL 残留     = 41
overdueCount  =  9
```

与总记录 110 不闭合；另 AI 未整改 50→9、`unknownStatus` 0→41、`byStatus` 永久保留 `null: 41` 桶。

同时 `discovered` 的业务定义是：

> 尚未形成闭环证据的隐患。

原 50 条 NULL 的 7 个闭环/验收字段（`verify_user` / `verify_date` / `reviewer_id` / `review_date` / `review_result` / `rectify_date` / `actual_rectify_date`）实测全部为 0，没有有效的历史关闭链条。

因此：

```text
NULL → discovered
```

是 canonical lifecycle 的缺失状态归一化，而不是推断其已经整改完成。

---

# 五、C-16｜非 status 字段完整性证据修正

上一版报告曾根据：

```text
id | status | updated_at
```

三列 row hash 一致，表述为：

> “迁移未改变其他业务字段。”

该表述超出了证据范围。

三列 hash 只能证明：

> `id`、`status`、`updated_at` 这三列满足对应的逆向指纹条件。

不能单独证明其余 43 列未发生变化。

因此该表述正式撤回并修正。

---

# 六、45 列非 status 对照证明

本次使用生产库作为未迁移对照样本。

计算：

> **除 `status` 外的其余 45 列完整指纹**（`md5(string_agg(id || (to_jsonb(t)-'status')::text))`）。

结果（冻结时点复算，17:5x）：

```text
DEV  迁移后（除 status）：10ed9e9120e4bbf8e49331acb9c66a66
PROD 迁移前（除 status）：10ed9e9120e4bbf8e49331acb9c66a66
```

完全一致。

由于生产库本轮只读检查确认仍为：

```text
已完成 60
NULL   50
```

且生产未执行本次迁移，因此 DEV 与 PROD 可作为本次同源数据的迁移前/迁移后对照。

结论限定为：

> **45 个非 status 列在 DEV 迁移后与未迁移 PROD 对照样本逐字节一致。**

因此可以确认：

> 本次迁移未改变除 `status` 外的 45 个字段。

结构侧独立佐证（不依赖哈希）：

```text
trigger = 0
rule    = 0
relkind = r（普通表）
SET 子句只列 status 一列
```

三者合起来排除了"通过触发器/规则/视图改道改写其他列"的路径。

---

# 七、P3-04-03 的生产迁移指纹基线

本次已经形成生产迁移的明确验收标尺。

## 7.1 除 status 外

生产迁移前：

```text
10ed9e9120e4bbf8e49331acb9c66a66
```

生产迁移后必须保持：

```text
10ed9e9120e4bbf8e49331acb9c66a66
```

## 7.2 包含 status

生产迁移前：

```text
9e8d8b24c56cfe4e80d9015d628658cc
```

生产迁移后必须等于 DEV 最终基线：

```text
be45b42e06362c58734df59a4a9ee01d
```

该指纹将作为：

> **P3-04-03 Production Migration Gate**

的核心验收条件。

> **C-24｜前置约束（必须写明）**：本节三个哈希是 **2026-10-24 17:5x 冻结时点的快照值**，不是永久常量。生产库若在迁移前发生任何写入（新增隐患、修字段、更新 `updated_at`），全列指纹必然变化。因此 P3-04-03 **执行时必须重新计算生产迁移前指纹，并以迁移后"45 列指纹不变 + 全列指纹等于当次 dev 同源基线"为准**，不得拿今天这三个值直接比对。（dev 侧同理：`be45b42e…` 只对"当前 dev 数据"成立。）

---

# 八、Service 验收

本轮重新实际执行：

```text
node scripts/p3-04-02-post-verify.js
```

结果：

> **TOTAL=31  PASS=31  FAIL=0**

核心统计：

```text
discovered       50
processing        0
pending_review    0
closed           60
total           110
```

---

# 九、Endpoint 验收

本轮重新实际执行：

```text
node scripts/p3-04-02-endpoint-verify.js
```

结果：

> **17 项接口强断言 PASS + 1 项既有缺陷登记。**

必须纠正上一版表述：

```text
17 项 = 强断言
 1 项 = FU-18 缺陷登记
```

因此不得写成：

> “18/18 强断言 PASS”。

覆盖接口（全部真实 Express 路由 + supertest，无需账号）：

```text
/api/hazards/stats     total 110 / discovered 50 / closed 60 / overdueCount 50
/api/hazards           total 110，返回行无中文状态
/api/overview/stats    hazard.total 110，byStatus {closed:60, discovered:50}，hazard.closed 60
/api/hse/todos         hazard_overdue.count = 50
/api/hse/alerts        200 + total=0（FU-18，既有缺陷，非回归）
```

---

# 十、核心指标

## 10.1 overdueCount

最终：

```text
50
```

这不是：

> “迁移导致 60 下降到 50”。

准确解释是：迁移前统计逻辑同时存在两个问题：

1. `status != 'closed'` 将 60 条历史 `已完成` 错误视为未关闭；
2. PostgreSQL 对 NULL 执行 `!=` 结果为 UNKNOWN，因此 50 条 NULL 被静默排除。

所以迁移前：

```text
60
```

本身就是错误统计结果。迁移后：

```text
50
```

才与 canonical lifecycle：

```text
discovered = 50
```

一致。

因此：

> **这是业务统计逻辑纠正，不是数据丢失。**

## 10.2 remindersOverdue 的迁移前值

```text
迁移前 60 → 迁移后 50
```

同源同因：它用的也是裸 `h.status != 'closed'`（`hazardService.js:1123`），并非独立指标交叉印证。**不要把它当作"两个指标互相验证"，两者共用同一缺陷谓词。**

---

# 十一、其他关键验收

| 指标 | 最终结果 |
|---|---:|
| hazards total | 110 |
| closed | 60 |
| discovered | 50 |
| processing | 0 |
| pending_review | 0 |
| NULL | 0 |
| overdueCount | 50 |
| remindersOverdue | 50 |
| todos（`hazard:overdue`） | 50 |
| AI 未整改 | 50 |
| AI unknown status | 0 |
| R-01 | `[110,60,0,0,0]` |
| `rectification_task` | 0（未变） |
| `review_record` | 1（孤儿行，未动） |
| `hse_reviews` | 0（未变） |

---

# 十二、R-01

本轮重新验证：

```text
[110,60,0,0,0]
```

迁移前后零漂移。

结论：

> 本次 status 规范化没有造成 R-01 数值变化。

补充事实：`pending` 恒 0 的结构性原因是库中 `status='未完成'` **0 行**，与本次迁移无关，也不代表"所有隐患都已整改"。

---

# 十三、触发器 / 规则 / 表类型

本轮重新检查：

```text
trigger = 0
rule    = 0
relkind = r
```

说明：

- 无触发器；
- 无规则；
- `hazards` 为普通表。

因此没有发现 status UPDATE 通过数据库触发器产生额外写入的路径。

配套时间戳证据：

```text
min(updated_at) = 2026-08-24 23:36:23.249943
max(updated_at) = 2026-08-25 07:58:27.198297
```

迁移前后一致。

---

# 十四、D-01｜迁移脚本提交后校验问题

迁移过程中发现：

> 残留检查位于 COMMIT 后。

且检查 SQL 曾存在 `HAVING` 未分组列问题。

导致：

> 数据已经成功 COMMIT，但脚本最终 exit 1。

该问题已修正（`HAVING` 改引用分组别名；校验语句移入事务）。

后续正式生产迁移要求：

```text
BEGIN
→ UPDATE
→ 行数检查
→ 状态分布检查
→ 总量检查
→ 非 status 指纹检查
→ status 指纹检查
→ 阻断性校验
→ COMMIT
→ COMMIT 后只读复核
```

不能把：

> COMMIT 后检查失败

解释成：

> 数据库事务自动回滚。

---

# 十五、D-02｜验收工具问题

初次验收出现 6 项 FAIL。

经复算确认均为验证工具自身问题。

## 15.1 fix_date distinct

错误预期：

```text
25
```

实际：

```text
20
```

已经修正（本轮复跑仍为 20）。

## 15.2 stats 内存降级

未先：

```text
db.testConnection()
```

导致：

```text
isConnected() = false
```

进入内存降级模式并返回 0。

该结果不得解释为数据库真实数据为 0。

后续验证工具必须明确区分：

```text
DB unavailable
```

和：

```text
query result = 0
```

---

# 十六、D-03 / FU-18｜Alerts 缺陷

`/api/hse/alerts` 存在既有缺陷。

SQL 引用了：

```text
title
resolved_at
```

但当前 `hazards` 46 列中不存在这些字段。

错误被 catch 后返回：

```text
HTTP 200 + 空列表
```

导致：

> SQL 故障与“没有告警”无法区分。

本轮复跑实测报错文本：`字段 "title" 不存在`，返回 `200 + total=0`，与迁移前行为一致。

本次不修。正式登记：

```text
FU-18
```

与 P3-04-02 status 迁移无因果关系。

---

# 十七、D-04｜接口路径文档修正

错误路径：

```text
/api/hse/overview                ← 不存在
```

实际：

```text
/api/overview/stats              ← 含 hazard.byStatus
/api/overview/summary            ← 不含 byStatus
```

另需注意字段层级：真实字段是 **`hazard.byStatus.discovered`**，**不存在 `hazard.discovered`**。按后者核对会得到"迁移前后都是 undefined"，从而误判"迁移未生效"。

本次以真实 Express route 为准完成验证。后续文档统一使用真实路径与真实字段层级。

---

# 十八、C-21｜FU-19 新发现代码残留

发现 5 处仍存在：

```sql
status != 'closed'
```

位置：

| 文件:行 | 所属函数 |
|---|---|
| `hazardService.js:619` | `stats()`（`overdueCount`） |
| `hazardService.js:1100` | `remindersHighRisk()` |
| `hazardService.js:1123` | `remindersOverdue()` |
| `hazardService.js:1171` | `analysisResponsibleOverdue()`（`CASE WHEN`） |
| `overview.js:172` | `expired` 指标 |

这些谓词仍然存在 PostgreSQL NULL 三值逻辑风险。

当前：

```text
NULL = 0
```

所以目前统计不受影响（`overdueCount=50`、`remindersOverdue=50` 已实测）。

但 `status` 当前仍允许 NULL：

> 将来任何路径重新写入显式 NULL，都可能造成静默漏算，且不会报错。

正式登记：

```text
FU-19
```

优先级：

> **P2**

本次不修，不扩大 P3-04-02 范围。修复方向：统一改用 `hazardService.sqlStatusOpen(alias)`。

---

# 十九、C-18｜生产迁移代码可复现性缺口

当前：

```text
Git HEAD = 5e8b052
```

但 P3-04 修复并未进入 HEAD。

工作区实际：

```text
52 项未提交变化
  ├─ 17 个已修改
  └─ 35 个未跟踪
```

P3-04 核心修改位于工作区，而不是当前 Git HEAD。

因此：

> **不能因为“未 commit / 未 push”就认为生产迁移可复现。**

生产迁移前必须建立：

> **P3-04 执行代码冻结清单。**

## 19.1 清单范围（必须完整，否则冻结无效）

P3-04 域共 **12 个已修改文件**（11 个后端 + 1 个前端）：

```text
server/services/hazardService.js
server/services/importShared.js
server/services/importExcelService.js
server/services/riskControlService.js
server/services/hseAssessmentAnalysisService.js
server/routes/todos.js
server/routes/overview.js
server/routes/dashboard.js
server/routes/demo-data.js
server/routes/alerts.js
server/tests/e2e/hazard-alert-flow.test.js
安全看板vben/apps/web-naive/src/components/hse/statusColors.ts
```

> **C-23｜更正**：V1.1 稿 §十九 只列了 8 个文件，**漏掉 `demo-data.js`、`hseAssessmentAnalysisService.js`、`tests/e2e/hazard-alert-flow.test.js`、`statusColors.ts` 四项**。按 8 项冻结会漏掉导入侧的 3 个关键文件，冻结清单形同虚设。

## 19.2 不属于 P3-04 的在途改动（不得混入生产执行包）

工作区另有 **5 个已修改文件属于 objectives/budget 在途工作**：

```text
server/services/objectiveService.js                          ← budget 状态字段重命名
安全看板vben/.../src/api/hse/cost.ts
安全看板vben/.../src/api/hse/goals.ts
安全看板vben/.../src/views/objectives/budget/expenditure/index.vue
安全看板vben/.../src/views/objectives/cost/index.vue
```

这些**不在 P3-04 范围内**，生产执行包必须显式排除，或由各自的任务线单独评审放行。

## 19.3 冻结清单格式

最终形成：

```text
文件路径
SHA-256
用途
是否属于 P3-04
是否进入生产执行包
```

基线哈希见 **附录 D**（2026-10-24 17:5x 冻结时点快照）。

---

# 二十、C-19｜P3-04-01 状态说明修正

本报告不得写：

> “业务已经签核。”

准确表述：

> **P3-04-01 = 在用户于 P3-04-01.2 中明确授权审计方自主检查、判断与执行的前提下，形成的自决结论。**

没有人工签字。BG-05 / BG-06 / BG-06b / A-1 与 O-01 / O-02 / O-07 / O-08 八项均为**自决关闭**，不是签核关闭。

此前两个签核包文件中的：

```text
NO-GO / BUSINESS APPROVAL = PENDING
```

与本次自主执行结论并不矛盾。

它们属于：

> 不同阶段、不同审批模型下形成的文档状态。

本报告以用户后续明确授权的自主执行模型为准。**对外/合规场合必须同时说明"自决 ≠ 审批"。**

---

# 二十一、生产数据库状态

生产库：

```text
safety_dashboard
```

本轮只读确认（冻结时点复算）：

```text
已完成    60
NULL      50
n       110
除 status 45 列指纹 10ed9e9120e4bbf8e49331acb9c66a66
全列指纹            9e8d8b24c56cfe4e80d9015d628658cc
```

没有执行：

```text
UPDATE / INSERT / DELETE / DDL
```

生产数据保持原状。

---

# 二十二、本轮数据库变更

本轮审计复算：

```text
DML = 0
DDL = 0
```

没有修改任何数据库行或列。

> 口径提示：`DDL` 在 P3-04 全周期内不是 0——`P3-04-00.3` 轮执行过 1 次 `ALTER COLUMN status SET DEFAULT 'discovered'`（未改任何行）。正确写法是：**00.3 轮 DDL=1，此后各轮 DDL=0。**

---

# 二十三、当前 Git 状态

```text
HEAD   = 5e8b052
commit = 0
push   = 0
```

工作区仍保留未提交 P3-04 相关修改（详见 §十九）。

---

# 二十四、P3-04-02 最终冻结状态

```text
P3-04-02
DEV MIGRATION PASS
FROZEN
```

冻结数据：

```text
closed        60
discovered    50
NULL           0
total        110
```

冻结指纹（2026-10-24 17:5x 时点）：

```text
非 status 45 列：
10ed9e9120e4bbf8e49331acb9c66a66

DEV 最终全列：
be45b42e06362c58734df59a4a9ee01d

3 列逆向 row_hash（还原后应回到）：
0ba357407eab96e9bf036986cd007718
```

---

# 二十五、P3-04-03 当前状态

```text
P3-04-03 = NOT STARTED
```

不得直接执行生产 UPDATE。

启动前新增两个必须关闭的门禁：

```text
O-09 生产前代码冻结清单
O-10 status NULL 写入风险决策
```

同时：

```text
FU-18 = OPEN
FU-19 = OPEN / P2
```

不作为生产迁移前必须修复项，除非后续风险判断改变。

---

# 二十六、O-09｜生产前代码冻结

必须完成：

```text
P3-04 相关文件清单（12 项，见 19.1）
+
每个文件 SHA-256
+
执行版本标识
+
迁移脚本 SHA-256
+
验收脚本 SHA-256
```

并确认：

> 生产执行代码必须与 DEV 已审计版本一致。

如果代码发生变化：

> 必须重新执行相应审计。

当前状态：**OPEN**（附录 D 已给出基线哈希，待用户确认冻结时点后转为可执行清单）。

---

# 二十七、O-10｜status NULL 写入风险

当前事实：

> `hazards.status` 仍允许 NULL（`is_nullable = YES`）。

同时 FU-19 已发现 5 处裸：

```sql
!= 'closed'
```

因此必须在生产迁移前明确处理策略。

当前推荐：

## 方案 A（推荐）

保持字段 nullable，但：

- 所有正常写入路径禁止 NULL（W1 `create` 硬写 `discovered`、W2 `update` 摘除 status 分支、导入层 L1~L4 白名单）；
- DB default = `discovered`；
- 服务层继续 fail-closed（`classifyStatus()`）；
- FU-19 后续修复；
- 生产迁移后持续监测 NULL。

## 方案 B

增加：

```sql
NOT NULL
```

但这属于独立 DDL 变更，需要单独评估和审批（须先做全量 NULL 扫描 + 写入路径复核 + 回滚预案）。

本次不因为 P3-04-02 已完成就直接执行 NOT NULL。

---

# 二十八、当前开放项

| 编号 | 项目 | 状态 | 是否阻断 P3-04-03 |
|---|---|---|---|
| O-09 | 生产代码冻结 | OPEN | **是** |
| O-10 | NULL 写入风险决策 | OPEN | **是** |
| FU-18 | alerts 缺列 + 静默返空 | OPEN | 否 |
| FU-19 | 5 处裸 `!=`（NULL 不安全） | OPEN / P2 | 否 |
| C-22 | V1.1 稿 §二 丢失 `is_deleted=false` | 已修 | 否 |
| C-23 | O-09 清单漏 4 个文件 | 已修 | 否 |
| C-24 | 冻结指纹缺"执行时重算"约束 | 已修 | 否 |

---

# 二十九、最终阶段状态

```text
P3-04-00       PASS
P3-04-00.1     PASS
P3-04-00.2     PASS
P3-04-00.3     PASS
P3-04-00.4     PASS

P3-04-01       PASS
               （自主执行授权下的自决结论，无人工签字）

P3-04-02       DEV MIGRATION PASS
               FROZEN

P3-04-03       NOT STARTED
```

---

# 三十、最终审计结论

P3-04-02 DEV 迁移：

> **通过并冻结。**

本次迁移实现：

```text
60 × 已完成 → closed
50 × NULL   → discovered
```

最终：

```text
closed        60
discovered    50
NULL           0
total        110
```

数据完整性通过：

- 110/110 live；
- soft delete = 0；
- 45 列非 status 指纹与生产未迁移对照**完全一致**；
- 3 列逆向 row hash 一致；
- trigger / rule = 0；
- relkind = `r`。

功能验收：

```text
31/31 Service PASS
17 项 Endpoint 强断言 PASS
 1 项 FU-18 缺陷登记
R-01 零漂移
```

生产：

> **未迁移。**

下一阶段：

> **P3-04-03 只能在 O-09、O-10 关闭后启动。**

---

# 三十一、本轮更正汇总（C-22～C-24）

| 编号 | 位置 | 问题 | 处置 |
|---|---|---|---|
| **C-22** | §二 | V1.1 稿 SQL 再次丢失 `is_deleted=false`（C-15 回退） | 已改为与脚本逐字一致；本库软删 0 行，数值无差，但文档级回退必须拦下 |
| **C-23** | §十九 | O-09 文件清单只列 8 项，漏 4 项（`demo-data.js` / `hseAssessmentAnalysisService.js` / `hazard-alert-flow.test.js` / `statusColors.ts`） | 已补全 12 项；并单列 5 个非 P3-04 在途文件，明确排除出生产执行包 |
| **C-24** | §七 | 指纹被当作永久常量 | 已加约束：三个哈希是 17:5x 快照，P3-04-03 执行时必须**重算生产迁移前指纹**，以"迁移后 45 列不变 + 全列等于当次 dev 同源基线"判定 |

## 附：本轮复算确认（与 V1.0 一致，无漂移）

```text
DEV  分布   closed 60 / discovered 50 / NULL 0 / n 110
DEV  45 列  10ed9e9120e4bbf8e49331acb9c66a66
DEV  全列   be45b42e06362c58734df59a4a9ee01d
PROD 分布   已完成 60 / NULL 50 / n 110
PROD 45 列  10ed9e9120e4bbf8e49331acb9c66a66
PROD 全列   9e8d8b24c56cfe4e80d9015d628658cc
post-verify 31/31 PASS
endpoint-verify 17 强断言 + 1 登记
R-01        [110,60,0,0,0]
HEAD        5e8b052（未 commit / 未 push）
```

---

# 附录 A｜迁移前后完整指纹对照

| 项目 | 迁移前（prod 现态 / dev 历史基线） | 迁移后（dev 现态） |
|---|---|---|
| 分布 | `已完成 60` / `NULL 50` | `closed 60` / `discovered 50` |
| 行数（live / 全表 / 软删） | 110 / 110 / 0 | 110 / 110 / 0 |
| row_hash（3 列逆向） | `0ba357407eab96e9bf036986cd007718` | 同值（还原后一致） |
| 除 status 45 列指纹 | `10ed9e9120e4bbf8e49331acb9c66a66` | `10ed9e9120e4bbf8e49331acb9c66a66` |
| 含 status 全列指纹 | `9e8d8b24c56cfe4e80d9015d628658cc`（prod） | `be45b42e06362c58734df59a4a9ee01d`（dev） |
| `hazards` 列数 | 46 | 46 |
| public 关系数 | 352 基表 + 13 视图 = 365 | 同 |
| `max(created_at)` | `2026-08-24 23:36:23.420706`（本地）/ `15:36:23.420Z`（UTC） | 同 |
| `min` / `max(updated_at)` | `23:36:23.249943` / `2026-08-25 07:58:27.198297` | 同 |
| `status` DEFAULT | `'discovered'` | 同 |
| `status` NULLABLE | YES | YES |
| trigger / rule / relkind | 0 / 0 / `r` | 同 |

# 附录 B｜可复现脚本

| 脚本 | 用途 | 最近复跑 |
|---|---|---|
| `server/scripts/p3-04-02-preflight-dual-plan.js` | 双方案指标对撞（只读） | 已跑 |
| `server/scripts/p3-04-02-migrate-legacy-status.js` | 迁移执行（六道护栏，默认 dry-run，`--plan=A/B`，`--execute` 才写） | 未再执行 |
| `server/scripts/p3-04-02-post-verify.js` | Service 级验收 | **31/31 PASS** |
| `server/scripts/p3-04-02-endpoint-verify.js` | 接口级验收（真实路由 + supertest） | **17 强断言 + 1 登记** |
| `server/scripts/p3-04-00-status-safety.test.js` | 写入口封口回归（T01-T26 + EXTRA） | 27/27（00.4 轮） |
| `server/scripts/p3-04-01-signoff-factcheck.js` | 迁移**前**基线断言 | **按设计失败，勿判异常** |

# 附录 C｜未闭合事项

| 编号 | 事项 | 状态 |
|---|---|---|
| FU-18 | `/api/hse/alerts` 缺列 + 静默返空 | OPEN（独立立项） |
| FU-19 | 5 处残留裸 `!=` 谓词（NULL 不安全） | OPEN（P2） |
| O-09 | 生产前代码冻结清单（12 文件 + 脚本 sha256） | OPEN（基线见附录 D） |
| O-10 | `status` 仍 NULLABLE 的风险决策（建议方案 A） | OPEN |
| P3-04-03 | 生产迁移 | NOT STARTED |

# 附录 D｜O-09 基线哈希（2026-10-24 17:5x 冻结时点快照）

> 用途：作为 O-09「生产前代码冻结清单」的起点。**冻结时点一旦确认，本表即转为可执行比对基线；代码若有任何改动（含格式化），必须重新审计。**

## D.1 P3-04 域代码文件（12 项，必须进入生产执行包）

| 文件 | SHA-256 |
|---|---|
| `server/services/hazardService.js` | `c494e3e92686f6b774f284fbc4f66764745c8adacd1fd2ef781638945306ced3` |
| `server/services/importShared.js` | `0276be9294279acfd8781bf123d67d21955bd37273304ce545aa5e59b6e60130` |
| `server/services/importExcelService.js` | `0534b7fca80a316d98129f01abefe3492001b1cac0322d134fcfd15ece0a0c38` |
| `server/services/riskControlService.js` | `1c8d113abc36b3849003737c67f91a8adf89f5c2674d4cb8513d4cb7639f4265` |
| `server/services/hseAssessmentAnalysisService.js` | `47bee6e0eb7c4989d316f4a97109de04b580662a027b39f3a4f9b7d4e58d79d9` |
| `server/routes/todos.js` | `713c99f222f9c0306aafa4ec8cffd88279783de71955a18936427d5b295db1f6` |
| `server/routes/overview.js` | `6206612f362f1b3a268762ceb18e925b4517a35129ebe52c9af21fa1eb7c8795` |
| `server/routes/dashboard.js` | `3cec86a980423ce5b107cdedb25eeb50d8df696e07347cc549a219a13d32e60e` |
| `server/routes/demo-data.js` | `d18723c94981e1af4f6f7c29838b793832ec7b52119b798061f89994561a1d75` |
| `server/routes/alerts.js` | `fd73d8cb5586de40ce77eff6e00ce910f193eac0558727b3cba6eef76a5b3f4a` |
| `server/tests/e2e/hazard-alert-flow.test.js` | `5e8024def328316586f4fac535141b43a06bc35e4e72a76ad5ecbf6ec474a3cb` |
| `安全看板vben/apps/web-naive/src/components/hse/statusColors.ts` | `e787a1f5c63b1d5bcaa0053c8f3b99c0428d59536aea74150eccb224121dbedb` |

## D.2 P3-04 脚本（7 项）

| 脚本 | SHA-256 |
|---|---|
| `server/scripts/p3-04-02-migrate-legacy-status.js` | `75e6eb5472170dd0a9c57ae7dd8d997c50c76315d3f6dca2f68d75f813e9858a` |
| `server/scripts/p3-04-02-preflight-dual-plan.js` | `98f9e8031d9811ad07eb4e5a52b7319efd669e606af74ca56aa49d0677b251bc` |
| `server/scripts/p3-04-02-post-verify.js` | `37b20646be8be4b313f8406538ff4511ce9b02a52da89add2bf9ef5462cc05e7` |
| `server/scripts/p3-04-02-endpoint-verify.js` | `0fd1c049d69e48a9d1aaf972c6efb59358eee28523ae752b038cf32d88510f6d` |
| `server/scripts/p3-04-00-status-safety.test.js` | `a76e1806b7849d56503cb2a81c4a75a745cbd58089b7cac6b152c32d469d83c3` |
| `server/scripts/p3-04-01-signoff-factcheck.js` | `7d1f9d7df13aaf89cee3d2ea6160598a81f93aa580efefe3ccc902d4408a0e10` |
| `server/scripts/p3-04-00.3-w14-default.ddl.js` | `a07eff2ad2134bdf3d22e4eb11310d5d8a52c4af1e721fe39ac36e199e2ef860` |

## D.3 明确排除（非 P3-04 在途工作，不得进入生产执行包）

```text
server/services/objectiveService.js
安全看板vben/apps/web-naive/src/api/hse/cost.ts
安全看板vben/apps/web-naive/src/api/hse/goals.ts
安全看板vben/apps/web-naive/src/views/objectives/budget/expenditure/index.vue
安全看板vben/apps/web-naive/src/views/objectives/cost/index.vue
```
