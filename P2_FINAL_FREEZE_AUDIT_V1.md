# P2｜安全生产费用业务闭环域 最终冻结审计 V1.0

> 审计性质：**只读冻结审计**（本轮只审不改，发现的问题只记录不修复）。
> 审计日期：2026-10-24
> 结论：**FREEZE PASS WITH ISSUES**

---

## 1. 审计范围

- 分支 `feat/hse-business-closure` 上 P2「安全生产费用业务闭环域」的当前未提交改动。
- 涉及任务：P0（路由聚合入口修复）、GAP-03（成本分摊 CRUD + UI + 金额类型修复）、ISSUE-01/P0 Schema Drift（删除 `year` 映射）、ISSUE-02（status 与 executionStatus 语义分离）。
- 对象：Git 工作树、后端路由/服务、前端页面/API、DB 结构、dev 业务数据、既有审计报告与测试证据。
- 不包含：生产数据库（本次未连接生产）、任何代码修复。

---

## 2. 当前 Git 基线

| 项 | 值 |
|---|---|
| Repository | G:/hse-dashboard |
| Branch | `feat/hse-business-closure` |
| HEAD | `5e8b0524ccd69369e59857024f0640cadec5f4cb` |
| Working tree | 5 个 tracked 修改 + 1 个 P0 新文件 + 多份审计报告（untracked） |
| Dev DB | `safety_dashboard_dev` |
| `git diff --check` | 退出码 0（无空白/语法类问题） |

---

## 3. 工作树状态

### Tracked 已修改（5 个，全部可解释）
1. `server/services/objectiveService.js`（+11/-2）：Plan A（删 `year`） + ISSUE-02（`calcBudgetStatus` 改返 `executionStatus`、CREATE/UPDATE/STATS 消费点同步、响应附加派生字段）。
2. `安全看板vben/apps/web-naive/src/api/hse/cost.ts`（+106）：GAP-03 成本分摊/实际支出 API 客户端与类型。
3. `安全看板vben/apps/web-naive/src/api/hse/goals.ts`（+1）：ISSUE-02 `BudgetItem.executionStatus?` 类型扩展。
4. `安全看板vben/apps/web-naive/src/views/objectives/budget/expenditure/index.vue`（+15）：ISSUE-02 新增「执行健康度」只读展示，原「状态」保留业务语义。
5. `安全看板vben/apps/web-naive/src/views/objectives/cost/index.vue`（+315）：GAP-03 成本分摊 UI + P0 Naive UI 组件 import 修复。

### Untracked 新增
- `server/routes/cost.js`：P0 路由聚合入口（必要，解决 `/api/cost` MODULE_NOT_FOUND）。
- 8 份审计报告 `.md`：本轮及前序任务的审计交付物（预期产物）。

### ⚠️ 未记录/应排除的游离产物（必须处理，不得随 P2 提交）
- `acl-out/acl-report-91cd6ac1db3841f5834a9c1af26a10e7.jsonl`：外部 ACL 修复工具生成的报告（2026-10-23 16:00），**非 P2 产物**；该工具未改动任何 tracked 文件（git diff 干净），但产物未被 gitignore，**若直接 commit 会被纳入**。
- `安全看板vben/test-write.txt`：4 字节调试文件（`test`），**非 P2 产物**，未被 gitignore，**若直接 commit 会被纳入**。
- `.tmp-chrome-tmp/`：Playwright/Chrome 运行时缓存，已被 gitignore，无风险。

---

## 4. 当前修改文件清单

| 文件 | 修改目的 | 归属任务 | 超范围 |
|---|---|---|---|
| server/routes/cost.js | 路由聚合入口（挂载 ./cost/main） | P0 | NO |
| server/services/objectiveService.js | 删 `year` 映射 + executionStatus 分离 | ISSUE-01/P0 + ISSUE-02 | NO |
| src/api/hse/cost.ts | 分摊/实际支出 API+类型 | GAP-03 | NO |
| src/api/hse/goals.ts | BudgetItem 加 executionStatus | ISSUE-02 | NO |
| views/objectives/budget/expenditure/index.vue | 执行健康度展示 | ISSUE-02 | NO |
| views/objectives/cost/index.vue | 分摊UI + Naive import 修复 | GAP-03 + P0 | NO |

未发现未报告的新代码文件、临时脚本、SQL 导出或调试脚本（除第 3 节标红的 2 个游离产物）。

---

## 5. P0 修复复核

`server/routes/cost.js`（全 19 行）：
- 仅 `express.Router()` + `router.use('/', require('./cost/main'))` + `module.exports`。
- 注释声明：项目既有「同名文件优先于目录」约定，缺失该文件导致 `app.js` 启动 `MODULE_NOT_FOUND`。属于**启动修复，零业务逻辑**。
- 已确认 `server/routes/cost/main.js` 存在（3201 字节）并完整注册预算/分摊/实际支出/承诺等路由。
- 复核结论：P0 仅为可启动性修复，范围干净，**无额外业务逻辑修改**。✓

---

## 6. GAP-03 复核

**后端**（`server/routes/cost/main.js` 已注册，tracked 未改）：
- 预算：`/budgets`(overview)、`/budgets/stats`、`/budgets/:id/financials`、`/budgets/import-preview`、`/budgets/import`、`/budget-items`(CRUD)。
- 成本分摊：`/allocations`(list/create)、`/allocations/:id`(put/delete)，均挂 `costWriter` 鉴权中间件。
- 实际支出：`/actuals`(list/create)。
- 承诺：`/commitments`(CRUD) + `/commitments/audit-duplicates`（只读去重审计）。

**前端**（`cost/index.vue` diff 扫描）：
- P0：补 Naive UI 组件 import（NButton/NForm/NFormItem/NModal/NTag/useMessage + `import { dialog } from '#/adapter/naive'`）。
- GAP-03：接入 `getAllocations/createAllocation/updateAllocation/deleteAllocation/getCostActuals`。
- 金额类型修复：金额入 NInputNumber 与数值比较前统一 `Number()`（注释明确 + 多处 `Number(row.amount)/Number(a.actualAmount)`），ID 比较用 `String()`。
- 权限/确认：删除走 `dialog` 二次确认，文案区分「已参与归因不可删 / 计划归因可删」。
- 复核结论：GAP-03 范围清晰，**无超出范围的修改**。✓

---

## 7. Schema Drift 修复复核（ISSUE-01 / Plan A）

`server/services/objectiveService.js` `budgetToSnake()`（339-366）：
- **已删除** `year: b.budgetYear ?? b.budget_year ?? b.year,`（Plan A 唯一删除行）。
- 保留 `budget_year: b.budgetYear ?? b.budget_year ?? b.year,`。
- 全表字段映射中**无**任何独立 `year` 列写入键。
- DB 核查：`hse_safety_budget` 仅含 `budget_year`，**无 `year` 列**（CREATE TABLE 定义 line 75 亦为 `budget_year INT NOT NULL`）。
- 读侧 `year: r.budget_year ?? r.year`（line 314）为**只读别名**，不产生写入，不造成污染。
- 其它 `year` 命中均属于无关表（goals `year`、township `period_year`），与预算无关。
- 结论：Schema Drift 已解决，`year` **不再进入 INSERT/UPDATE**。✓

---

## 8. ISSUE-02 修复复核（status ↔ executionStatus 分离）

**`calcBudgetStatus()`（153-164）**：原 `return { executionRate, status }` → `return { executionRate, executionStatus: status }`；early-return 同步改为 `executionStatus: 'normal'`。**计算公式与阈值（默认 85，源自 `getBudgetWarningThreshold()`）均未改变**。✓

**`budgetList`（1371-1374）/ `budgetDetail`（1396）**：沿用 `{ ...budgetToCamel(row), ...calcBudgetStatus(...) }`。因 calc 不再产出 `status` 键，DB 业务 `status`（`budgetToCamel` 透传）**不再被覆盖**。✓

**`budgetCreate`（1408）/ `budgetUpdate`（1435）**：响应体追加 `...calcBudgetStatus(...)`（派生字段），写库逻辑不变：
- INSERT 用 `keys = Object.keys(fm)`（fieldMap 键），`executionStatus/executionRate` **不在 fieldMap** → 不进 SQL。
- UPDATE（1426）`for (const [k,v] of Object.entries(fm))` 仅遍历 fieldMap 键，`executionStatus/executionRate` **绝不进入 UPDATE SET**。✓

**全局扫描**：`executionStatus` 在 `server/**/*.js` 仅出现 3 处（calc 定义 ×2、budgetStats 消费 ×1），**无任何 INSERT/UPDATE/fieldMap 出现**。✓

**前端**：
- `expenditure/index.vue`：新增 `EXECUTION_STATUS_TEXT/TAG` 仅用于详情抽屉「执行健康度」只读展示（684-685）；原「状态」仍读 `currentBudget.status`。
- 保存负载（line 372 `status: budgetForm.status`）**仅发业务 status**；编辑回填（line 327 `status: record.status || 'planning'`）取业务 status；**不发送 executionStatus**。✓

**结论**：ISSUE-02 已解决，两套状态互不覆盖。✓

---

## 9. 前后端 API Contract（预算对象字段矩阵）

| 前端字段 | API 字段 | Service 字段 | DB 字段 | 状态 |
|---|---|---|---|---|
| budgetYear | budget_year | budget_year（budgetToSnake） | budget_year | OK（写入） |
| year | —（仅只读别名 `year: r.budget_year`） | year（只读） | 无此列 | OK，不再写入（Plan A 删除 `year:` 键） |
| budgetCode | budget_code? | **字段表未含 budget_code** | budget_code（UNIQUE, nullable） | ⚠ GAP：前端若传 budgetCode 不被映射，budget_code 恒为 NULL（ISSUE-01/OBS） |
| status | status | status（budgetToSnake） | status | OK（业务生命周期，未被污染） |
| executionStatus | executionStatus | 派生（calcBudgetStatus 响应附加） | 无 | OK（派生，绝不进 SQL） |
| executionRate | executionRate | 派生 | 无 | OK（派生） |

---

## 10. 数据库完整性（dev，只读）

| 检查项 | 结果 |
|---|---|
| 当前库 | `safety_dashboard_dev`（未触碰生产） |
| `budget_year` 列 | 存在 |
| `year` 列 | 不存在 |
| `executionStatus` / `execution_status` 列 | 不存在（未新增 DB 字段） |
| 表结构 | 无变化 |
| status 分布（live） | `active: 101`（无 planning/normal/warning/overspend） |
| 污染计数（status ∈ normal/warning/overspend） | **0** |
| live 总数 | **101**（与审计基线一致） |
| 测试残留（status='planning' 的测试行） | **0**（前序测试记录已软删，is_deleted=true 排除） |

结论：数据库结构未变、数据未被污染、基线恢复。✓

---

## 11. 测试证据矩阵

| 能力 | 测试证据 | 当前状态 |
|---|---|---|
| 成本预算读取 | HSE_COST_BROWSER_ACCEPTANCE_5e8b052_V2.md；routes 注册核对 | PASS（证据存在） |
| 预算创建 | OBJECTIVES_BUDGET_BROWSER_CRUD_ACCEPTANCE_V1.md；Fix-Audit 服务层调用 | PASS（服务层实测 CREATE status=planning） |
| 预算编辑 | 同上；Fix-Audit 两次仅改 remark 回写 | PASS（status 不再被覆盖） |
| 预算删除 | budgetDelete 软删（1439-1446） | 代码确认（服务层未重跑） |
| 预算导入 | `/budgets/import-preview`+`/import`（有 preview 防误写） | 路由确认 + 历史报告 |
| 重复导入 | `/commitments/audit-duplicates`（只读审计） | 路由确认 |
| 成本分摊新增 | cost.ts + main.js `/allocations` POST | GAP-03 代码确认 |
| 成本分摊编辑 | `/allocations/:id` PUT（重算总额一致性） | 代码确认 |
| 成本分摊删除 | `/allocations/:id` DELETE（受总额约束保护） | 代码确认 |
| 预算金额约束 | 前端 `Number()` 转换 | GAP-03 代码确认 |
| Schema Drift | OBJECTIVES_BUDGET_SCHEMA_DRIFT_AUDIT/FIX_AUDIT；本审计 DB 核查 | RESOLVED |
| status 语义分离 | OBJECTIVES_BUDGET_STATUS_SEMANTIC_AUDIT/FIX_AUDIT；本审计全局扫描 | RESOLVED |
| warning | Fix-Audit 纯函数 + 服务层（90%→warning） | PASS |
| overspend | Fix-Audit 纯函数 + 服务层（≥100%→overspend） | PASS |
| F5 数据一致性 | 服务层 LIST/DETAIL/UPDATE 闭环实测 | PASS（服务层） |

> 注：以上「PASS」中，模块/服务层与 API 契约层证据充分；**完整登录态浏览器人工验收见第 14 节边界**。

---

## 12. P0/P1/P2 重新分级（基于当前真实代码）

### P0：无
- 应用可启动（P0 路由聚合已修复）；核心路由无 MODULE_NOT_FOUND；核心页面无崩溃；核心写库经服务层实测成功；无数据破坏风险。

### P1：无（已确认）
- 预算核心 CRUD 可靠（服务层实测 CREATE/UPDATE/LIST/DETAIL）。
- status 未再污染（DB 0 污染 + 代码扫描确认）。
- 金额约束：前端 `Number()` 统一。
- 导入：preview+confirm 两阶段，承诺去重审计端点存在。
- 分摊：后端事务 + 锁定实际支出 + 净额一致性强制（不足/超额拒绝），`costWriter` 鉴权。
- 权限：`costWriter` 中间件覆盖写操作。
- DB/API/UI 未发现明显不一致。

### P2 / OBS（遗留，记录不修复）
- **ISSUE-01 / OBS**：`budget_code` 列存在但 `budgetToSnake` 字段表**未含** `budget_code` → 创建/更新时不落库，恒为 NULL（UNIQUE 可允许多 NULL，不违反约束）。属数据完整度缺口。
- **ISSUE-03~06、GAP-02、OBS-01~04**：前序报告记录项；本轮代码改动未触及这些区域，状态未变，沿用既有风险分级。本轮未重新逐项复算（其定义不在本审计直接证据链内，且本分支未改相关代码），列为「携带未变」。

---

## 13. 遗留问题

1. `budget_code` 不落库（ISSUE-01/OBS）—— 不阻断冻结，建议下一阶段处理。
2. 两个游离产物 `acl-out/`、`安全看板vben/test-write.txt` 必须**删除/排除**后再 commit（非 P2 代码，且未被 gitignore）。
3. 完整登录态浏览器人工验收未执行（见第 14 节）。
4. ISSUE-03~06 / GAP-02 / OBS-01~04 按前序报告携带，未在本轮重新复算。

---

## 14. 浏览器验收边界（严格区分三种测试）

- **A. 模块/服务测试**：Fix-Audit 服务层直接调用生产代码打 dev 库，CREATE/UPDATE/LIST/DETAIL 全链路验证通过；纯函数 3 case 通过。**充分证明服务层行为。**
- **B. 应用启动/API 测试**：P0 路由聚合确保 `node app.js` 可启动；routes 注册逐项核对（HTTP 契约存在）。**不等价于浏览器验收。**
- **C. 浏览器人工会话（登录态）**：**未完成**。当前环境无开发账号密码，`/api/auth/debug-login` 仅计算不返回 token，无法构造真实登录态会话（创建→F5→编辑→F5 的纯 UI 闭环未实测）。替代证据为：Vite 编译通过（被编辑 SFC HTTP 200、0 transform 错误）+ 前端静态核查（保存负载仅发 `status`、健康度只读）。**本项明确标记为未完成，未以静态核查包装成 PASS。**

---

## 15. 生产环境边界

- 未连接生产数据库，未执行任何生产 SQL/迁移/数据修改。
- 本次所有 DB 读写（含前序 Fix-Audit 的测试写）均限定在 `safety_dashboard_dev`，且测试数据已清理。
- 结论：**生产环境未验证；本次结论仅针对当前代码 + dev 环境。**

---

## 16. 风险结论

- 数据破坏风险：**无**（status 不再污染、year 不再写入、executionStatus/executionRate 不进 SQL、测试数据已清理）。
- 启动风险：**无**（P0 路由聚合修复）。
- 契约一致性风险：**低**（前端保存仅发业务 status；派生字段不回写）。
- 提交风险：**中**——游离产物 `acl-out/`、`test-write.txt` 未被 gitignore，盲提交会带入仓库（非代码风险，但属仓库卫生问题）。

---

## 17. 最终冻结判定

**FREEZE PASS WITH ISSUES**

判定依据：
- ✅ 无 P0、无 P1。
- ✅ 修改范围清晰、git diff 可完全解释。
- ✅ Schema Drift（ISSUE-01/P0）已解决，`year` 不再进入写库。
- ✅ ISSUE-02 已解决，`status` 与 `executionStatus`/`executionRate` 分离，互不覆盖。
- ✅ DB 结构未变、数据无污染、基线恢复（live=101，污染=0）。
- ✅ 核心业务闭环（预算 CRUD / 导入 / 分摊 / 实际支出 / 承诺去重）路由与代码均到位。
- ⚠ 存在 P2/OBS（`budget_code` 不落库等）。
- ⚠ 登录态浏览器人工验收**未完成**（无开发账号）。
- ⚠ 两个游离产物需排除后再提交。

未触发 FREEZE BLOCKED：无 P0/P1、无核心写失败、status 未再污染、Schema Drift 未回归、数据正常、diff 无不可解释改动、测试证据与代码无矛盾。

---

## 18. 是否建议进入下一阶段

**建议：可以进入「冻结后审计 / 下一业务域」**，但须满足以下前置条件：
1. 删除/排除 `acl-out/` 与 `安全看板vben/test-write.txt`（不得随 P2 提交）。
2. 保留本轮及前序 8 份审计报告作为冻结证据（可随代码一并提交或单独归档）。
3. 下一阶段立项处理 P2/OBS（尤其 `budget_code` 落库）。
4. 后续若有开发账号，补一轮真实登录态浏览器人工验收（当前为唯一未完成项）。

---

## 19. 不得遗漏的未解决问题

- ❗ `acl-out/` + `test-write.txt`：游离产物，commit 前必须清理（非代码缺陷，但仓库卫生阻断项）。
- ❗ 登录态浏览器人工验收：未完成，需开发账号后补。
- ❗ `budget_code` 不落库（ISSUE-01/OBS）：数据完整度缺口，下一阶段处理。
- ❗ ISSUE-03~06 / GAP-02 / OBS-01~04：前序报告携带项，本分支未改相关代码，状态未变。

---

# 最终输出格式

```
P2 FINAL FREEZE RESULT

结论：FREEZE PASS WITH ISSUES

P0：无
P1：无
P2：ISSUE-01/OBS（budget_code 不落库）；ISSUE-03~06 / GAP-02 / OBS-01~04（前序携带，未变）

当前 HEAD：5e8b0524ccd69369e59857024f0640cadec5f4cb
当前 Branch：feat/hse-business-closure

工作树：expected changes（5 tracked + 1 P0 新文件 + 审计报告）；
        unexpected：acl-out/ 与 安全看板vben/test-write.txt（游离产物，需排除）

修改文件：
1. server/routes/cost.js            (P0, 新文件)
2. server/services/objectiveService.js (ISSUE-01/P0 + ISSUE-02)
3. src/api/hse/cost.ts             (GAP-03)
4. src/api/hse/goals.ts            (ISSUE-02 类型)
5. views/objectives/budget/expenditure/index.vue (ISSUE-02 UI)
6. views/objectives/cost/index.vue  (GAP-03 + P0 import)

核心闭环：
  预算：list/detail/create/update/delete/export + /safety-budget 别名  ✓
  导入：preview + confirm 两阶段  ✓
  分摊：list/create/update/delete（事务+锁+净额一致性）  ✓
  状态：status=业务生命周期，未被污染  ✓
  执行健康度：executionStatus/executionRate 派生，不进 SQL  ✓

数据库：
  结构：无变化（budget_year 在，year/executionStatus 不在）  ✓
  数据：live=101，全部 active，污染=0，测试残留=0  ✓
  污染：无  ✓

测试：
  Service：PASS（Fix-Audit 服务层 + 纯函数）
  API：路由契约存在，启动无 MODULE_NOT_FOUND  ✓
  Browser：登录态人工验收 未完成（无开发账号）；编译+静态核查通过

未完成：
1. 登录态浏览器人工验收（创建→F5→编辑→F5 闭环）
2. 清理游离产物 acl-out/ 与 test-write.txt（commit 前必做）
3. budget_code 落库（下一阶段）

最终建议：
  满足第 18 节前置条件后，可结束 P2 开发并进入冻结后审计/下一业务域；
  当前 NOT 因代码缺陷 BLOCKED，仅因「浏览器登录态验收未跑 + 仓库卫生项」需收尾。
```
