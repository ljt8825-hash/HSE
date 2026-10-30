# OVERALL-05｜C1 费用域正式固化执行报告

- 节点：HSE-OVERALL-05（B-0 分批固化阶段 · C1 费用域）
- 执行时间：2026-10-30 12:55 ~ 13:05（GMT+8）
- 执行环境：Windows / Git Bash，仓库 `G:\hse-dashboard`，分支 `feat/b02-dec-03.13-a02d-status-code`
- 执行性质：经总控授权的 Git 定向固化（依据 OVERALL-04-02 预审报告）

## 一、执行前 Git 基线（12:55 实测，非沿用预审旧数）

| 项 | 值 |
|---|---|
| 分支 / HEAD | `feat/b02-dec-03.13-a02d-status-code` / `eff20f03` |
| 修改未暂存 | 73 |
| 已暂存 | 1（仅 `server/routes/cost.js`，`A` 态，md5 `e88ae2b0b275346dfc1431408aa00bff`） |
| 未跟踪 | 199 |
| 删除/重命名/冲突 | 0 / 0 / 0 |
| 远端 | `origin/ljt8825-hash/HSE` 同名分支 = `eff20f03`（与本地一致，无分叉） |

**基线差异说明**：未跟踪数与 OVERALL-04 的 200 相比减少 1，系 12:31 快照将 `docs/project-control/` 整目录折叠计为 1 个条目、报告上传后该条目消失所致；逐文件 diff 证明**无任何新增/消失文件**，不触发停止条件。

## 二、C1 最终 Manifest（19 文件，全部允许提交）

**代码（8）**

| 路径 | 状态 | 类别 | 处理 |
|---|---|---|---|
| `.gitignore` | M（+3 行：排除 `/_migration_backups/`，防 pg_dump 凭据泄漏） | 配置 | ✅ 提交（OVERALL-04-09:25 归属 C1） |
| `server/services/objectiveService.js` | M（+5/−6） | 代码 | ✅ 提交 |
| `安全看板vben/apps/web-naive/src/api/hse/cost.ts` | M（+106） | 代码 | ✅ 提交 |
| `安全看板vben/apps/web-naive/src/api/hse/goals.ts` | M（+1） | 代码 | ✅ 提交 |
| `安全看板vben/apps/web-naive/src/views/objectives/cost/index.vue` | M（+315） | 代码 | ✅ 提交 |
| `安全看板vben/apps/web-naive/src/views/objectives/budget/expenditure/index.vue` | M（+15） | 代码 | ✅ 提交 |
| `安全看板vben/apps/web-naive/src/views/objectives/committee/index.vue` | M（46 行改动） | 代码 | ✅ 提交 |
| `安全看板vben/apps/web-antd/src/views/objectives/committee/index.vue` | M（62 行改动） | 代码 | ✅ 提交 |

**报告（11，位于仓库根）**

`HSE_COST_BROWSER_ACCEPTANCE_5e8b052.md`、`HSE_COST_BROWSER_ACCEPTANCE_5e8b052_V2.md`、`HSE_COST_GAP01_GAP03_BROWSER_ACCEPTANCE_5e8b052_V1.md`、`OBJECTIVES_BUDGET_BROWSER_CRUD_ACCEPTANCE_V1.md`、`OBJECTIVES_BUDGET_SCHEMA_DRIFT_AUDIT_V1.md`、`OBJECTIVES_BUDGET_SCHEMA_DRIFT_FIX_AUDIT_V1.md`、`OBJECTIVES_BUDGET_STATUS_SEMANTIC_AUDIT_V1.md`、`OBJECTIVES_BUDGET_STATUS_SEMANTIC_FIX_AUDIT_V1.md`、`P2-GAP-01-GAP-03-AUDIT.md`、`P2_FINAL_FREEZE_AUDIT_V1.md`、`P0_FIX_REPORT_5e8b052.md` — 均为新增（untracked→入库）。

**排除（3）**

| 路径 | 排除原因 |
|---|---|
| `server/routes/cost.js` | 最高级保护对象，staged `A` 态保持，不进 C1 提交 |
| `docs/rule-engine-design/上线运维Runbook.md` | 预审已移出 C1→C6 |
| 其余 65 M / 188 未跟踪 | 属 C2~C6 / Z / K / J，不在授权范围 |

## 三、固化前检查结果

1. **源码完整性检查**（`node tools/check-repo-source-integrity.mjs`）：12 处问题（A2+B10），**全部与 C1 无关**——A 类属 `server/_tmp`（gitignored）与员工导入域（C2）；B 类为 training.js（专项 Z）、risk-library（C3）、employeeStatusDict×6（C2）、trainingPlanStatusMachine（C5）。系其他批次未固化的已知缺件，非 C1 阻断。
2. **凭据/敏感信息扫描**（7 代码 + 11 报告 + .gitignore）：代码与报告零命中；`.gitignore` 唯一命中为注释行（解释探针文件为何被忽略），无真实密钥。无手机号命中。
3. **费用测试**：首次 `npx jest cost` 得 36/37——失败例为「环境护栏：仅允许在 dev/test 库运行」。查证：该套件文件头明确文档化运行方式为 `DB_NAME=safety_dashboard_dev`（自带护栏、误连生产整体跳写），属**调用方式环境问题非代码缺陷**。按文档化方式重跑：`DB_NAME=safety_dashboard_dev npx jest server/__tests__/cost.service.test.js --runInBand` → **37/37 全绿，JEST_EXIT=0**（实际连接 dev 库，护栏断言 current_database 通过）。
4. **objective 冒烟**：`objectiveService.js` 加载成功（60 导出）；专用套件 `objectives.test.js` 因 `uuid` 包 ESM/CommonJS 工具链不兼容在 `./setup` 模块加载期即失败（既有问题，与 C1 文件无关，且该套件依赖活服务器登录，不属 server jest 默认 testMatch）——判定既有失败、不影响本批正确性，以加载冒烟 + 浏览器验收报告代偿。
5. **C1 diff 实质核对**：`objectiveService.js` diff 与验收报告逐条对应（`status→executionStatus` 字段语义修复、`budgetToSnake` 去重 `year` 键）；`cost/index.vue` +315 行与预审记录一致。

## 四、Git 提交执行

- 提交方式：显式路径 `git add <19 路径>` → 断言暂存区 → **pathspec 提交** `git commit -- <19 路径>`（结构上排除暂存区中的 cost.js），全程未用 `git add .` / 裸 `git commit`。
- **C1 业务固化 commit SHA：`2407c10bc0e88cb0d4c9662eccb216d17ce1577c`**
- 提交内容：19 files changed, +3315/−66（11 报告新增 + 7 代码修改 + .gitignore）。

## 五、cost.js 保护核验（前→后）

| 项 | 固化前 | 固化后 |
|---|---|---|
| Git 状态 | `A `（staged） | `A `（staged）✓ |
| MD5 | `e88ae2b0b275346dfc1431408aa00bff` | `e88ae2b0b275346dfc1431408aa00bff` ✓ |
| 是否入提交 | — | 否（`git diff-tree HEAD` 零命中）✓ |

## 六、提交后验收（§八十项）

1. 分支未改变 ✓ 2. 新提交 SHA `2407c10b` ✓ 3. 提交含 19 文件 ✓ 4. 全部属 C1、cost.js 零卷入 ✓ 5. cost.js 仍 staged `A` ✓ 6. md5 与基线一致 ✓ 7. C2~C6/Z/K/J 未被改动（M 73→65 = 恰好 7 代码+.gitignore；untracked 199→188 = 恰好 11 报告）✓ 8. 费用测试 37/37 ✓ 9. 剩余工作区：65 M / 1 staged（cost.js）/ 188 untracked ✓ 10. **推送核验**：`git push origin feat/b02-dec-03.13-a02d-status-code` 成功（`eff20f0..2407c10`，非强制），`ls-remote` 远端 = `2407c10b` = 本地 ✓

## 七、GitHub 报告交付

- 报告上传 commit：（本报告单独提交，SHA 见提交记录）
- 报告路径：`docs/project-control/OVERALL-05/OVERALL-05-01-C1-COST-SOLIDIFICATION-REPORT.md`
- 仓库 `ljt8825-hash/HSE`，分支 `feat/b02-dec-03.13-a02d-status-code`

## 八、未完成事项与风险

- `objectives.test.js` 工具链级 ESM 失败待后续节点修复（非 C1 阻断）；
- `cost.js` 仍处 staged 悬空态，建议按 OVERALL-04-02 建议以独立微批「cost.js 发布完整性入库」单独授权处置；
- cost/index.vue +315 行无自动化测试，浏览器验收报告代偿，B-8 集成时补自动化；
- 完整性检查的 12 处缺件将由 C2/C3/C5/Z 固化自然消解。

## 九、C1 验收结论

**满足 C1 验收条件**：manifest 19 文件全部固化、cost.js 保护态零漂移、费用域测试 37/37、提交与远端核验一致、无越批污染。
