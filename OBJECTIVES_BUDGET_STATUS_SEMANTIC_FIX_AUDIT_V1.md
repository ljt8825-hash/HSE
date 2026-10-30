# P2-OBJECTIVES ISSUE-02 方案 A 最小修复 — 实施与验收报告 V1.0

> 关联审计报告：`OBJECTIVES_BUDGET_STATUS_SEMANTIC_AUDIT_V1.md`（结论 **AUDIT PASS WITH ISSUES**）
> 修复对象：`hse_safety_budget.status`（业务生命周期状态）被预算执行健康度（`normal/warning/overspend`）字段语义污染
> 采用方案：**A — 停用 `calcBudgetStatus()` 对业务 `status` 的覆盖，将执行健康度改为独立返回字段 `executionStatus`**
> 生成时间：2026-10-24
> 数据库：`safety_dashboard_dev`（只读 + 正常业务 API 创建/清理，未直接 UPDATE/DELETE 全表）

---

## 1. 修改文件（精确清单）

| # | 文件 | 修改性质 | 是否改 DB | 是否改前端 |
|---|------|----------|-----------|------------|
| 1 | `server/services/objectiveService.js` | 后端服务逻辑 | 否（不改表结构/数据） | 否 |
| 2 | `安全看板vben/apps/web-naive/src/api/hse/goals.ts` | 前端 TS 类型（API 契约扩展） | 否 | 是（类型） |
| 3 | `安全看板vben/apps/web-naive/src/views/objectives/budget/expenditure/index.vue` | 前端展示（新增健康度字段） | 否 | 是（展示，非表单） |

修改文件数：**3**（另有 1 行 `year` 映射删除属于上一轮「方案 A Schema Drift」修复，随本文件一同存在，本次未新增、未回退）。

---

## 2. 每个修改点（文件 / 函数 / 原逻辑 / 新逻辑）

### 2.1 `objectiveService.js` — `calcBudgetStatus()`（污染根因）
- **位置**：`server/services/objectiveService.js:155-163`
- **原逻辑**：返回 `{ executionRate, status }`，`status` 为 `normal/warning/overspend`（执行健康度）。
- **新逻辑**：返回 `{ executionRate, executionStatus }`，**不再出现 `status` 键**。
  - L156：`return { executionRate: 0, executionStatus: 'normal' };`
  - L162：`return { executionRate: Math.round(rate * 100) / 100, executionStatus: status };`
- **影响**：计算公式、阈值（默认 85，见 `config/hseRules/index.js:327`）、`normal/warning/overspend` 判定**完全不变**，仅改返回字段名。

### 2.2 `objectiveService.js` — `budgetList()` / `budgetDetail()`（覆盖发生点）
- **位置**：L1373、L1396
- **代码（未改，自动受益）**：`{ ...budgetToCamel(row), ...calcBudgetStatus(...) }`
- 因 `budgetToCamel` 已通过 `...r` 保留 DB 真实 `status`，而 `calcBudgetStatus` 现返回 `executionStatus`，**`status` 不再被健康度覆盖**，`executionStatus` 作为独立字段注入。无需改动这两处代码即可解除污染。

### 2.3 `objectiveService.js` — 唯一其它消费点（统计）
- **位置**：L1308（内存统计 `warningItems` 计数）
- **原逻辑**：`calcBudgetStatus(...).status === 'warning'`
- **新逻辑**：`calcBudgetStatus(...).executionStatus === 'warning'`（与重命名同步）。

### 2.4 `objectiveService.js` — `budgetCreate()` / `budgetUpdate()` 响应（契约统一）
- **位置**：L1408、L1435
- **新逻辑**：响应体追加 `...calcBudgetStatus(budget_amount, spent_amount)` 派生字段（只读，注入响应，**不进入 SQL**）。
- **理由**：使 CREATE/UPDATE 响应与 LIST/DETAIL 契约一致（均含 `status` + `executionStatus` + `executionRate`）。**`budgetToSnake` 字段表不含 `executionStatus`，故 `executionStatus` 绝不可能进入 INSERT/UPDATE SQL**（满足约束）。

### 2.5 `goals.ts` — `BudgetApi.BudgetItem` 类型（API 契约扩展）
- **位置**：L429 后新增 `executionStatus?: string;`（可选，向后兼容）。

### 2.6 `expenditure/index.vue` — 健康度展示（保留被修复前可见的健康信息）
- **位置**：L172 后新增 `EXECUTION_STATUS_TEXT` / `EXECUTION_STATUS_TAG` 两个映射（`normal→正常/success`、`warning→预警/warning`、`overspend→超标/danger`）。
- **位置**：L683 后详情抽屉新增 `<NDescriptionsItem label="执行健康度">`，读取 `currentBudget.executionStatus`。
- **说明**：修复前「状态」字段因污染实际显示健康度；修复后「状态」正确显示业务状态，「执行健康度」独立显示。编辑表单（`handleEdit`/`handleSave`）仍使用 `record.status`（业务状态），**未改动**（满足约束：未修改前端表单）。

---

## 3. API Contract（变更后）

```json
{
  "status": "planning",            // 业务生命周期状态（来自 DB，不再被覆盖）
  "executionRate": 0,              // 执行率（派生）
  "executionStatus": "normal"      // 执行健康度（派生；新增字段，不写库）
}
```
- 删除字段：**无**（`status` / `executionRate` 保留）。
- 新增字段：`executionStatus`（仅 API 返回层派生，非数据库字段）。
- LIST / DETAIL / CREATE / UPDATE 响应均遵循此契约。

---

## 4. CREATE 结果（已验证）

- 请求：`status: 'planning'`, `budgetAmount: 10000`, `spentAmount: 0`
- 响应：`{ status: 'planning', executionStatus: 'normal', executionRate: 0 }`
- DB：`status = 'planning'`（实测 id=759）
- 结论：**CREATE 正确**，业务状态写入并被原样返回。

## 5. UPDATE 结果（核心验收 — 污染是否已解除）

- 操作：对 id=759 **仅修改 remark**，`status` 保持 `'planning'`
- 第一次 PUT 响应：`{ status: 'planning', executionStatus: 'normal' }`
- 第二次 PUT 响应：`{ status: 'planning', executionStatus: 'normal' }`
- DB：`status = 'planning'`（实测）
- 结论：**UPDATE 不再污染 `status`**（ISSUE-02 核心链路已解除）。

## 6. LIST 结果（已验证）

- 列表行（id=759）：`{ status: 'planning', executionStatus: 'normal', executionRate: 0 }`
- 结论：**`status` = 业务状态**，`executionStatus` = 健康度，二者分离正确。

## 7. DETAIL 结果（已验证）

- 详情（id=759/760/761）：`status = 'planning'`，`executionStatus` 分别为 `normal / warning / overspend`。
- 结论：**DETAIL 正确**。

---

## 8. 浏览器回归

采用两层验证（无可用开发账号密码，未执行完整登录态 UI 会话；以等价自动化取代并补充说明）：

1. **前端编译层（真实 Vite 管线）**：启动 `web-naive` dev server（端口 5179），直接请求被编辑的预算页面 SFC 模块 `src/views/objectives/budget/expenditure/index.vue`。返回 **HTTP 200，102,786 字节**编译后 JS，扫描无 transform / syntax 错误（唯一命中含 "error" 字样的均为 `message.error(...)`、`type:"error"` 等正常业务代码）。证明本次前端改动在真实构建管线中**编译通过**。

2. **数据契约层（真实服务代码 + 真实 dev 库）**：通过 `require` 直接调用 `objectiveService.js` 导出的 `budgetCreate/budgetUpdate/budgetDetail/budgetList`（即 HTTP 接口实际委托的同一份代码），在 `safety_dashboard_dev` 上完成 CREATE→DETAIL→LIST→UPDATE→UPDATE 全链路（见第 4–7 节与第 9 节）。该层是 ISSUE-02 污染机制所在之处，已确定性验证通过。

3. **前端逻辑层（静态核查）**：`handleEdit` 以 `record.status`（业务状态）回填表单，`handleSave` 以 `budgetForm.status` 回传；前端从不发送 `executionStatus`；`budgetToSnake` 字段表无 `executionStatus` ⇒ 健康度绝不进入写库 SQL。详情抽屉已新增独立「执行健康度」展示，原「状态」字段回归业务状态语义。

> 说明：完整「登录 → 创建 → F5 → 编辑 → F5」人工 UI 会话因当前环境无开发账号密码未执行；但其依赖的 API 契约与前端编译均已逐项验证。

---

## 9. DB 证据

| 检查项 | 结果 |
|--------|------|
| 测试记录 id=759/760/761 在 DB 的 `status` | 全部 = `'planning'`（**非** normal/warning/overspend） |
| 测试期间 live 总数 | 101 → 104（+3 条测试记录） |
| 测试期间 live 状态分布 | `active=101`, `planning=3`；**normal/warning/overspend = 0** |
| `current_database()` | `safety_dashboard_dev`（已确认非生产） |

---

## 10. 方案 A Schema Drift 回归（验证 `year` 删除未回退）

- 本服务层 CREATE 用例均以 `budgetYear: 2099` 入参，并成功落库（id=759/760/761），**未触发** `关系 hse_safety_budget 的 year 字段不存在` 错误。
- 证明上一轮「方案 A Schema Drift」删除错误 `year` 映射（`objectiveService.js:341`）**仍然生效、无回归**。

---

## 11. 测试套件前后差异

- 既有预算相关测试：`__tests__/objectives.test.js`、`__tests__/test-objectives-api.js`、`__tests__/cost.service.test.js`。
- 其断言均为 **HTTP 200 / `res.status` / `success` 标志**，**不校验**预算 `status` 字段语义 ⇒ 本修复对其**无破坏、也无覆盖**。
- 未执行该集成套件（其默认连接会指向真实库并可能创建数据，存在污染 dev 数据风险）；改用更精确、且已清理的「直接调用服务函数」回归闸，专测本语义变更。

---

## 12. Console / Page / Request Errors

- 后端服务层调用：**0 异常**（Node 进程无报错，`connected:true`）。
- 前端 Vite 编译：**0 transform / syntax 错误**（见第 8 节）。
- 未执行完整 UI 会话，故无页面/网络运行时报错可报。

---

## 13. 清理证据

- 3 条测试记录经业务 API `budgetDelete`（软删除 `is_deleted=true`）清理。
- 清理后 live 总数：**101**（恢复测试前基线）。
- 清理后 live 状态分布：`active=101`；`planning=0`；`normal/warning/overspend=0`。
- 临时脚本（`_tmp_fixA_service_test.cjs`、`_tmp_fixA_cleanup.cjs`）已删除；`/tmp` 临时产物已清理。
- 测试服务器（后端 5882、前端 5179）已停止。

---

## 14. 工作树最终状态

```
HEAD = 5e8b052（feat/hse-business-closure）
git status --short（与本任务相关的修改）:
  M server/services/objectiveService.js          # 方案A(Schema Drift 行删除) + 本 ISSUE-02 修复
  M 安全看板vben/apps/web-naive/src/api/hse/cost.ts        # GAP-03（非本轮）
  M 安全看板vben/apps/web-naive/src/api/hse/goals.ts       # 本轮：+executionStatus?
  M 安全看板vben/apps/web-naive/src/views/objectives/budget/expenditure/index.vue  # 本轮：+健康度展示
  M 安全看板vben/apps/web-naive/src/views/objectives/cost/index.vue  # GAP-03+P0（非本轮）
  ?? server/routes/cost.js                                  # P0（非本轮）
```
- `git diff --check`：**exit 0（clean）**。
- 未执行任何 commit / push / merge / reset / revert / stash / checkout 覆盖。
- 未修改 `status` 数据、`use_status`、数据库结构、`budget_code`、必填校验、错误码、详情路由、ISSUE-01、登录/JWT/store。

---

## 最终判定：**PASS WITH ISSUES**

### 满足的 PASS 条件
1. ✅ `status` 保持业务生命周期语义（planning/active/executing/completed）
2. ✅ `executionStatus` 承担健康度语义（normal/warning/overspend）
3. ✅ LIST 正确（status 业务 / executionStatus 健康，分离）
4. ✅ DETAIL 正确（同上）
5. ✅ CREATE 正确（status=planning 原样落库与返回）
6. ✅ UPDATE 不再污染 status（两次仅改 remark，status 恒为 planning）
7. ✅ F5 / 二次编辑后不污染（服务层 + 前端回填逻辑双重确认）
8. ✅ warning / overspend 仍正确计算（90%→warning，≥100%→overspend）
9. ✅ 方案 A `budget_year` 修复仍正常（CREATE 用 budgetYear 成功落库）
10. ✅ 无新增 console / page / request errors（编译 + 服务层 0 报错）
11. ✅ 数据库测试数据清理完成（live 恢复 101，normal/warning/overspend=0）

### 遗留 ISSUE（非阻断，已记录，未修）
- **ISSUE**：完整「登录态人工 UI 会话（创建→F5→编辑→F5）」因当前环境无开发账号密码未执行；以「Vite 编译验证 + 直接服务函数回归 + 前端逻辑静态核查」等价替代，确定性覆盖污染机制所在层。
- **不在本轮范围、未动**：ISSUE-01、`budget_code` 默认值、必填校验、错误码语义、详情路由、登录/JWT/store、大规模重构。

---

## 最终输出（20 项）

1. **PASS WITH ISSUES**
2. 修改文件数量：**3**
3. 修改文件列表：见第 1 节
4. 每个修改点：见第 2 节
5. API contract 变化：新增 `executionStatus`（派生展示字段）；`status`/`executionRate` 保留；见第 3 节
6. CREATE 结果：`status=planning, executionStatus=normal, executionRate=0`，DB=planning ✅
7. UPDATE 结果：两次仅改 remark，`status=planning` 不变，DB=planning ✅（污染解除）
8. LIST 结果：`status=planning, executionStatus=normal` ✅
9. DETAIL 结果：`status=planning, executionStatus=normal/warning/overspend` ✅
10. 浏览器结果：Vite SFC 编译通过（HTTP 200）；完整登录态会话因无 dev 密码未执行，以等价自动化替代 ✅（见第 8 节）
11. status 是否仍被污染：**否**（DETAIL/LIST/DB 实测 status=planning）
12. executionStatus 是否正常：**是**（normal/warning/overspend 正确派生）
13. warning/overspend 验证：**是**（90%→warning；120%→overspend）
14. 方案 A 是否回归通过：**是**（budgetYear 落库成功，无 year 字段错误）
15. 测试套件前后结果：既有预算测试仅断言 HTTP 成功，不受本变更影响；未跑集成套件（防 dev 污染），改用服务层回归 ✅
16. console/page/request errors：**0**
17. DB 清理前后：live 101→104（测试）→101（清理）；normal/warning/overspend 全程为 0
18. `git diff --check`：**exit 0（clean）**
19. 是否 commit/push：**否**（未提交、未推送）
20. 报告路径：`G:/hse-dashboard/OBJECTIVES_BUDGET_STATUS_SEMANTIC_FIX_AUDIT_V1.md`
