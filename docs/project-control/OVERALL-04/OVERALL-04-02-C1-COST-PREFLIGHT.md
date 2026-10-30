# OVERALL-04-02｜C1 费用域预审

## 一、候选文件清单（20 项）

### 代码（8）

| 路径 | 状态 | 归属证据 |
|---|---|---|
| `server/services/objectiveService.js` | M（+5/−6） | 费用/目标域服务 |
| `安全看板vben/apps/web-naive/src/api/hse/cost.ts` | M | 费用 API |
| `安全看板vben/apps/web-naive/src/api/hse/goals.ts` | M | 目标 API |
| `安全看板vben/apps/web-naive/src/views/objectives/cost/index.vue` | M（+315 行，本次最大前端改动） | 费用页面 |
| `安全看板vben/apps/web-naive/src/views/objectives/budget/expenditure/index.vue` | M | 预算支出页 |
| `安全看板vben/apps/web-naive/src/views/objectives/committee/index.vue` | M | 安委会页 |
| `安全看板vben/apps/web-antd/src/views/objectives/committee/index.vue` | M | web-antd 同名页 |
| （注意：`cost/main.js` **已在 HEAD**，本次实读 `git cat-file` 确认——费用业务代码已提交，未提交的只是周边收尾） | — | — |

### 报告（12）

`HSE_COST_BROWSER_ACCEPTANCE_5e8b052.md`、`HSE_COST_BROWSER_ACCEPTANCE_5e8b052_V2.md`、`HSE_COST_GAP01_GAP03_BROWSER_ACCEPTANCE_5e8b052_V1.md`、`OBJECTIVES_BUDGET_BROWSER_CRUD_ACCEPTANCE_V1.md`、`OBJECTIVES_BUDGET_SCHEMA_DRIFT_AUDIT_V1.md`、`OBJECTIVES_BUDGET_SCHEMA_DRIFT_FIX_AUDIT_V1.md`、`OBJECTIVES_BUDGET_STATUS_SEMANTIC_AUDIT_V1.md`、`OBJECTIVES_BUDGET_STATUS_SEMANTIC_FIX_AUDIT_V1.md`、`P2-GAP-01-GAP-03-AUDIT.md`、`P2_FINAL_FREEZE_AUDIT_V1.md`、**`P0_FIX_REPORT_5e8b052.md`**（本次实读首部确认为「HSE P2 安全生产费用域上线阻断修复」，**纠正 OVERALL-03-06 中误归 C5**）、`docs/rule-engine-design/上线运维Runbook.md`（**移出 C1**→C6，实读标题为运维 Runbook 非费用文档）

## 二、特别保护：cost.js

- `server/routes/cost.js`（staged `A `，md5 `e88ae2b0…`）**不进 C1 普通提交**（OVERALL-04 任务书明确「不得混入 C1 普通提交、不得改变内容或暂存状态」，较 B0-06「随 C1 转正」**收紧**）；
- 固化操作风险：index 中已有 staged `A `，执行 C1 时**必须显式路径提交**（`git add <paths> && git commit -- <paths>` 或 `git commit <paths>`），禁止裸 `git commit`（否则暂存区中的 cost.js 会被一并提交）；
- 建议后续以独立微批「cost.js 发布完整性入库」单独授权处置。

## 三、交叉依赖

- `objectiveService.js` 与 assessment 域（目标下发）有历史耦合，但 diff 实质为费用方向小修，**不强拉 C5**；
- 无对未跟踪文件的运行时依赖（cost/main.js 已在 HEAD）→ **C1 可独立固化，无前置批次**。

## 四、测试要求

- 已提交测试：`cost.service.test` 37 例（HEAD 内）；
- 固化前回归：`npx jest cost`（应 37/37）+ `objective` 相关冒烟；本次预审未发现费用域未跟踪测试文件。

## 五、风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| 裸 `git commit` 卷入 staged cost.js | 高 | 强制显式路径提交，固化脚本前置校验 `git diff --cached --name-only` 仅含本批路径 |
| cost/index.vue +315 行大改动无对应测试更新 | 中 | 固化说明中注明「浏览器验收报告代偿」，B-8 集成时补自动化 |

## 六、独立固化建议

**可独立固化（无阻断）**。顺序建议 C1 最先（最小、无依赖、可验证「显式路径提交」流程）。
