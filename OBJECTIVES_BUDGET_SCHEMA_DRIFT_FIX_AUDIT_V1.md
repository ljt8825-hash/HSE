# Objectives 预算 Schema Drift — 方案 A 最小修复验证报告

> 基线：`feat/hse-business-closure` @ `5e8b052`（`5e8b0524ccd69369e59857024f0640cadec5f4cb`）
> 依据：`OBJECTIVES_BUDGET_SCHEMA_DRIFT_AUDIT_V1.md`（专项审计，结论 BLOCKED）
> 纪律：只做「删除 `budgetToSnake()` 中错误的 `year` 映射」一件事；其余发现全部保持原状。
> 验证环境：`safety_dashboard_dev`（全程 `current_database()` 护栏），后端 `PORT=5882 SCHEDULER_ENABLED=false`，未连接生产。

---

## 1. 修改前状态

专项审计已用四层证据证明：`budgetToSnake()` 同时生成 `budget_year` 与 `year` 两个键，`budgetCreate()` 以 `Object.keys(fm)` 不过滤 undefined 生成 INSERT 列，而 dev 库 `hse_safety_budget` 无 `year` 列（年度列为 `budget_year`）。因此**修复前任何携带年度的 CREATE 均确定性失败**：

```text
code: -1  message: 关系 hse_safety_budget 的 year 字段不存在   （PG 42703）
```

该失败证据来自上一轮 GAP-01 验收（UI 实测 + 最小探针，已存档）。本报告不复述其过程，仅引用结论。

---

## 2. 修改内容

| 项 | 内容 |
|---|---|
| 文件 | `server/services/objectiveService.js`（本轮唯一修改文件） |
| 函数 | `budgetToSnake()`（实际位置 L338-367，以工作树实测为准） |
| 删除字段 | `year`（L341：`year: b.budgetYear ?? b.budget_year ?? b.year,`） |
| 保留字段 | `budget_year`（L340：`budget_year: b.budgetYear ?? b.budget_year ?? b.year,`）及其余 23 个映射**原样不动** |
| 未做 | 不重构、不改变量名、不改排序、不动其他字段、不格式化、不碰周边代码 |

**设计要点**：保留的 `budget_year` 行仍以 `?? b.year` 兜底——旧式 `year` 输入被正确吸收进 `budget_year`（向后兼容，见 §4 纯函数验证第 2 组），不会因输入对象含 `year` 而重新映射出 DB 不存在的列。

---

## 3. Diff 审计

```diff
--- a/server/services/objectiveService.js
+++ b/server/services/objectiveService.js
@@ -338,7 +338,6 @@ function budgetToCamel(r) {
 function budgetToSnake(b) {
   const fieldMap = {
     budget_year: b.budgetYear ?? b.budget_year ?? b.year,
-    year: b.budgetYear ?? b.budget_year ?? b.year,
     category: b.category,
```

| 检查 | 结果 |
|---|---|
| 是否只有预期一行 | **是**——`git diff --stat`：`1 file changed, 1 deletion(-)` |
| 是否有其他文件 | **否**——diff 仅触及 `objectiveService.js` |
| `git diff --check` | **CLEAN**（无空白/冲突标记） |
| 语法 | `node --check server/services/objectiveService.js` 通过 |

---

## 4. 纯函数验证（不连库、不写库）

从当前工作树源码提取 `budgetToSnake` eval 实测，**14/14 PASS**：

| 用例 | 结果 |
|---|---|
| CREATE payload（`budgetYear:2026`，忠实前端 contract） | 输出 24 键含 `budget_year=2026`，**不含 `year`**；INSERT 列不含 `year` |
| CREATE payload（旧式 `year:2025` 输入） | `year` 输入被 `budget_year` 吸收（=2025），输出**仍不含** `year` 键 |
| UPDATE payload（`{budgetYear:2027, year:2027}`，两前端页编辑年度都发双字段） | SET 列**仅 `budget_year`**，无 `year` |
| UPDATE payload（仅 `{remark, status}`） | SET 列 = `status, remark`，无年度列——普通字段行为不变 |
| 源码断言 | 函数体内 `year:` 映射行数 = 0；`budget_year` 映射保留 = 1 处 |

---

## 5. Create 验证（活库 API）

真实后端（5882 / dev）+ 真实路由 + admin token；payload **忠实复刻前端 `expenditure/index.vue:337-364` 的发送结构**（`budgetYear` + `year` 双字段 + 完整业务字段），项目名带本轮唯一标识 `HSE_BUDGET_SCHEMA_FIX_20261024_001`。

| 层 | 证据 |
|---|---|
| API | `POST /api/objectives/safety-budget` → HTTP 200，body.code **0**，message **「创建成功」**，返回 id=**744** |
| DB | `hse_safety_budget` 新增 1 行：`budget_year=2026`、`budget_amount=1000000.00`、`is_deleted=false` |
| 对照 | 修复前同形状请求确定性 42703（§1）——**由必败变为成功** |

**未使用「HTTP 200 = PASS」判定**：业务成败以 `body.code=0` + DB 最终状态双重确认（本任务 objectives API 为 HTTP 200 + body.code 约定）。

---

## 6. Update 年度验证

| 层 | 证据 |
|---|---|
| API | `PUT /api/objectives/safety-budget/744`，body `{budgetYear:2027, year:2027}`（真实双字段 contract）→ HTTP 200，code **0**，「更新成功」 |
| DB | 该行 `budget_year` 由 2026 → **2027**（其余字段不变） |
| 对照 | 修复前同形状 PUT 确定性 42703 |

---

## 7. Update 普通字段验证

| 层 | 证据 |
|---|---|
| API | `PUT /api/objectives/safety-budget/744`，body `{remark:"…UPDATED-REMARK", status:"active"}` → HTTP 200，code **0**，「更新成功」 |
| DB | `remark` 与 `status` 均已更新；`budget_year=2027` 未被牵连改动 |

结论：原本正常工作的非年度字段更新行为**保持正常**（纯函数第 4 组已证 SET 列不含年度列）。

---

## 8. Read regression

| 端点 | 路径 | 结果 |
|---|---|---|
| GET list | `/api/objectives/safety-budget?keyword=…`（前端实际路径） | HTTP 200，code 0，「查询成功」；标记行在列，`budget_year=2027`、camel `budgetYear=2027` 正确 |
| GET detail | `/api/objectives/budgets/744`（canonical） | HTTP 200，code 0，「操作成功」；`budget_year=2027` 正确 |
| GET stats | `/api/objectives/safety-budget/stats?year=2027`（前端实际路径） | HTTP 200，code 0，「统计成功」；`{total:1, planTotal:100, spentTotal:0, executionRate:0}` 聚合正确 |

只读观察（**记录，不修**）：`GET /api/objectives/safety-budget/:id`（别名 detail）返回 404「API路径不存在」——别名绑定层（`routes/objectives/main.js:121-126`）未注册 GET `/:id`，属既有行为，前端 detail 抽屉不使用该路径（直接用列表行数据）。

---

## 9. budget_code（只读观察，不修）

| 项 | 值 |
|---|---|
| CREATE 后 `budget_code` 实际值 | **NULL** |
| 当前行为 | `budgetToSnake` 的 fieldMap 无 `budget_code` 键（源码实证），经该端点创建的预算编码恒为 NULL |
| 是否为空 | **是** |

按任务要求仅记录：这是与 `year` 映射无关的**下一项独立问题**（`budget_code` 映射缺失），本轮不顺手修改。

---

## 10. 测试结果

### 10.1 本轮新增验证（全部通过）

| 验证 | 结果 |
|---|---|
| 纯函数 14 项 | **14/14 PASS**（§4） |
| 活库 CREATE | **PASS**（code 0 + DB 落库） |
| 活库 UPDATE 年度 | **PASS**（code 0 + DB 2027） |
| 活库 UPDATE 普通字段 | **PASS**（code 0 + DB 生效） |
| 活库 READ ×3 | **PASS**（list/detail/stats 均 code 0） |
| 测试数据清理 | **PASS**（§12） |

### 10.2 既有测试（`npm test` 单元套件，不连库）

| 运行 | Test Suites | Tests |
|---|---|---|
| **修复后**（工作树） | 8 failed / 22 passed / 30 total | 3 failed / 407 passed / 410 total |
| **修复前**（HEAD 版，原子交换实测） | 8 failed / 22 passed / 30 total | 3 failed / 407 passed / 410 total |

**A/B 完全一致 → 本轮修复零回归。** 8 个失败套件（auth-gate、import-personnel-behavior、insurance-file、personnel-insurance、routes/import、routes/vehicles 六个 require 期失败 + aiCapabilityLayer 2 例 + violationAdapter 1 例）与 3 个失败测试在修复前后**逐项相同**，均为仓库既有基线失败，无一套件涉及 objectiveService。

> A/B 方法说明：为避免任何工作树永久变动，采用单条命令内的原子交换（`git show HEAD:… > file` → 跑 jest → 从备份还原 → md5 校验），`.git` 零改动；交换窗口内未向 5882 发任何请求（单元套件走进程内 supertest，与 5882 无关）。

### 10.3 `objectives.test.js`（集成套件）——既有 contract mismatch，非本轮造成

- **无法按项目门控对 dev 运行**：`scripts/integration-gate.js` 要求 DB 名匹配 `^test_`/`_test$` 且不得为 `safety_dashboard`（dev 亦被拒）——这是项目故意的 fail-closed 设计，本报告不绕过。
- **新建 test_ 库亦不可行**：`__tests__/setup.js` 不自建 admin 用户（登录依赖已种子化的 `admin/admin123`），空库登录即失败——这同时印证专项审计的判断：该套件从未在活库上跑过。
- **改用等价实证**（与测试用例逐字相同的 payload 打活库 API）：

  `objectives.test.js:181` 创建用例发送 `{item, amount}`（无年度字段，且 `amount` 并非映射字段）：

  | 时点 | 结果 |
  |---|---|
  | 修复前 | INSERT 列含 `year` → 确定性 **42703**（HEAD 版纯函数实测：keys 含 `year`） |
  | 修复后 | INSERT 列不含 `year`，但 `budget_year` 为 null → **NOT NULL 违约**（活库实测：HTTP 200 / code -1 / `null value in column "budget_year" … violates not-null constraint` / DB 0 行） |

  该用例**修复前后均不可能通过**（失败原因不同），属既有测试 contract 与真实 DB 不一致；本轮修复使「携带合法年度的请求」由必败变为成功，严格改善了该域可操作性。按任务要求：**未修改测试、未为凑绿改业务代码**。

### 10.4 必填校验观察（只读，不修）

无年度 POST → HTTP 200 / code -1 / PG NOT NULL 违约，DB 0 行。即：**删除 `year` 映射后没有破坏任何已有 contract**；应用层必填校验缺失由 DB NOT NULL 兜底——属专项审计已记录的未处理项，本轮不修。

---

## 11. 数据库清理

| 项 | 值 |
|---|---|
| 测试前预算总数 / 存活数 | **339 / 101**（与专项审计前基线一致；开跑前已核验，基线未漂移） |
| 本轮创建 | **1** 行（id=744，标识 `HSE_BUDGET_SCHEMA_FIX_20261024_001`） |
| 清理动作 | 单条定向 `DELETE … WHERE id=744 OR project_name/item_name LIKE 标识%`（先过 `current_database()='safety_dashboard_dev'` 护栏；未用 TRUNCATE/DROP/批量清空） |
| 测试后预算总数 / 存活数 | **339 / 101**（基线完整恢复） |
| 标记残留 | **0**（`budget_year=2027` 行数亦归 0） |

其余环境恢复：5882 后端已停（用户 5888/5173 未动）；本轮全部临时脚本/备份/基线快照已删除。

---

## 12. Git 状态（终局）

| 文件 | 状态 | 归属 |
|---|---|---|
| `server/services/objectiveService.js` | M（**1 行删除**） | **本轮** |
| `安全看板vben/apps/web-naive/src/api/hse/cost.ts` | M | 上轮 GAP-03（完好） |
| `安全看板vben/apps/web-naive/src/views/objectives/cost/index.vue` | M | 上轮 GAP-03 + P0 imports（完好） |
| `server/routes/cost.js` | ??（未跟踪新文件） | 上轮 P0（完好） |
| `HSE_COST_*`/`OBJECTIVES_BUDGET_*`/`P0_FIX_REPORT`/`P2-GAP-01-GAP-03-AUDIT` 等 .md、`acl-out/`、`test-write.txt` | ?? | 往轮交付物/产物，本轮未触碰 |

- P0 修改仍存在 ✓；GAP-03 修改仍存在 ✓；`objectiveService.js` 仅预期 1 行 ✓；无其他意外文件 ✓
- 未 commit / 未 push / 未 merge；未连生产；未改任何 SQL/migration/前端/cost 域/登录 JWT。

---

## 13. 最终判定

# PASS WITH ISSUES

**通过项**：CREATE（活库 code 0 + DB 落库）、年度 UPDATE（code 0 + `budget_year` 2027）、普通字段 UPDATE（code 0 + DB 生效）、READ regression（list/detail/stats 全 code 0）、纯函数 14/14、单元套件 A/B 零回归、测试数据完整清理（339 基线恢复）。

**遗留 ISSUES（均只记录，未处理）**：
1. `budget_code` 映射缺失——经该端点创建的预算编码恒 NULL（§9）
2. 应用层 create 必填校验缺失——仅靠 DB NOT NULL 兜底（§10.4）
3. `objectives.test.js:181` 创建用例与真实 DB contract 不一致，且集成门控+空库无种子用户导致其无法在本机运行（§10.3）
4. 别名 `GET /api/objectives/safety-budget/:id` 未注册（§8，前端不用该路径）
5. 上轮已记录：`budgetUpdate` 仅传部分字段时行为正常，但若未来映射再引入漂移仍无 schema 过滤层防护（专项审计方案 B，未做）

**范围合规**：本轮仅删除 1 行错误映射，未扩大任何范围。
