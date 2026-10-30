# OVERALL-04-06｜C5 培训、考核预审

## 一、候选文件清单（29 项）

### 后端代码（14 M）

`server/services/ruleEngine/{engine,ruleLoader,deductionWriter}.js`、`server/services/assessmentMonthly{Chain,Deduction,Scoring,Shared,Target}Service.js`×5、`server/services/assessmentScheduler.js`、`server/routes/hse-assessment-category.js`、`server/services/trainingPlanService.js`、`server/controllers/trainingController.js`、`server/package.json`、`server/package-lock.json`（test 脚本加 HSE_LOG_DIR）

### 未跟踪代码/SQL（6）

`server/services/trainingPlanStatusMachine.js`、`server/sql/sprint_p1a_rule_snapshot.sql`（**从 C3 移入**，考核快照域）

### 测试（5，未跟踪）

`server/__tests__/assessment-monthly-history-protection.unit.test.js`、`server/services/__tests__/trainingPlanService.{createStatus,statusGuard}.unit.test.js`、`trainingPlanStatusMachine.unit.test.js`、`server/services/ruleEngine/__tests__/p1a-history-rule-snapshot.unit.test.js`

### 前端（3 M）

web-naive `views/hse/assessment-monthly/{freeze,scoring,targets}.vue`

### 报告（6）

`P0-月度安全履职考核-历史数据保护整改-验收报告.md`、`P1-A-{PRECHECK,IMPLEMENTATION-REPORT,TEST-REPORT}.md`、`P1-月度安全履职考核-历史规则与责任链稳定性审计报告.md`、`docs/AI智能分析/P3-16/`（P3-16 系列可选并入本批）

> 归属纠正：`P0_FIX_REPORT_5e8b052.md` **移出 C5 → C1**（实读确认为费用域修复报告）。

## 二、测试证据（本次新鲜复跑）

6 套件 **128/128 全绿（EXIT=0，2026-10-30 12:47）**：history-protection + trainingPlan×3 + p1a-snapshot + deductionWriter。

## 三、SQL 执行状态

`sprint_p1a_rule_snapshot.sql`：**①已执行（dev）且有证据**——`P1-A-IMPLEMENTATION-REPORT.md` 最终判定 **PASS WITH CONTROL GAP**（整改目标达成，控制缺口为范围外既有事实）。

## 四、H5 隔离核验

- C5 候选中**无任何 grid-mobile-cloudflare 文件** ✅；
- `docs/191副/` 培训 H5 三份文档（10-27 设计、10-29 待验收、10-29 候选名单风险）归 **C6 文档**，不属 C5 代码批；
- H5 培训扩展代码全部在专项 Z（见 04-08），与 C5 彻底隔离 ✅。

## 五、依赖与建议

- `ruleEngine` 4 件与 `assessmentMonthly` 5 件同批自洽；`package.json` 变更（HSE_LOG_DIR）与测试同批；
- C5 **可独立固化**；建议顺序 C1 → C2 → C3 → C4 → **C5**（或 C5 与 C2 并行，无相互依赖）；
- 风险：考核域存在 3 套扣分算法并行的既有结构债（非本批引入）；`assessmentScheduler` 属调度器，固化后生产生效语义不变（NODE_ENV 修复在 prod-launch.cjs，K 类单列）。
