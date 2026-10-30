# B0-02｜已修改、已暂存、已删除文件清单

> 实测 2026-10-30 11:21。共 74 条状态行 = 73 个已修改未暂存（` M`）+ 1 个已暂存新增（`A `）。已删除/重命名/冲突 = 0。
> 分类标签见 B0-04 定义（A人员底座/B费用/C隐患风险检查/D培训考核三违网格/E事故车辆保险/F AI驾驶舱集成/G SQL/H测试/I文档/J临时/K待核实/FZ冻结域）。
> "批次"为 B0-06 固化建议批次编号（仅建议，未执行）。

## 一、已暂存（1）

| # | 路径 | 状态 | 标签 | 用途与判断依据 | 保留 | 批次 |
|---|---|---|---|---|---|---|
| 1 | `server/routes/cost.js` | `A `（暂存新增，工作区与暂存区一致，无未暂存 diff） | **B/FZ** | 18 行聚合入口 shim：`router.use('/', require('./cost/main'))`。注释明示"同名文件优先于目录，缺失即 app.js 启动 MODULE_NOT_FOUND"。业务在 cost/main.js。发布完整性保护态（md5 `e88ae2b0b275346dfc1431408aa00bff`，实测未变） | 必须保留 | C1（保护态随费用域批次，保持 staged 不动） |

## 二、已修改未暂存（73）

### 2.1 配置与工程（4）

| # | 路径 | 标签 | 改动实质（diff 实读） | 保留 | 批次 |
|---|---|---|---|---|---|
| 2 | `.gitignore` | I | 追加 `/_migration_backups/` 排除（P3-05-03-04 迁移备份含全库数据与凭据，仓库 PUBLIC 防泄漏）——正当且必要 | 保留 | C1 |
| 3 | `server/package.json` | H | test 脚本追加 `HSE_LOG_DIR=./logs/test`（测试日志落盘隔离） | 保留 | C5 |
| 4 | `server/package-lock.json` | H | 随 package.json | 保留 | C5 |
| 5 | `server/scripts/prod-launch.cjs` | 运维 | 生产 5876 启动器（红线 2b：计划任务 HSE-Backend 由它注入 NODE_ENV=production）；改动实质未逐行 diff（K-级核实建议） | 保留，B-1 前需人工 diff 核实 | K-核 |

### 2.2 冻结域：H5 生产链路（11）⚠️

| # | 路径 | 标签 | 改动实质 | 保留 | 批次 |
|---|---|---|---|---|---|
| 6-9 | `grid-mobile-cloudflare/_pages_deploy/{check.app.js,check.html,login.html,version.json}` | FZ/D | 培训 H5 扩展（check.app.js +217 行、check.html +178 行） | 保留（不部署） | **总控专项裁决** |
| 10-13 | `grid-mobile-cloudflare/frontend/{check.app.js,check.html,login.html,version.json}` | FZ/D | 同上（_pages_deploy 与 frontend 双份同步改） | 保留 | 同上 |
| 14 | `grid-mobile-cloudflare/worker/index.js` | FZ/D | +38 行（培训路由挂载迹象） | 保留 | 同上 |
| 15 | `grid-mobile-cloudflare/worker/storage/index.js` | FZ/D | +20 行 | 保留 | 同上 |
| 16 | `grid-mobile-cloudflare/worker/wrangler.toml` | FZ/D | +15 行 | 保留 | 同上 |

依据：docs/191副/②交付报告/2026-10-29_培训模块H5代码完成待验收.md + ③决策结论/2026-10-27_培训模块H5设计与测试账号方案.md。**红线 7 冻结链出现未提交改动 + 未跟踪新增（train.app.js/worker/training.js），属"待验收交付物"性质，但 mtime 显示 11:22 仍在更新（疑似并行会话）**→ 见 B0-07 R-0/R-1。

### 2.3 后端 server/（38）

| # | 路径 | 标签 | 用途（历史任务归属） | 保留 | 批次 |
|---|---|---|---|---|---|
| 17 | `server/app.js` | F | 挂载新增路由（risk-library 等） | 保留 | C4 |
| 18 | `server/controllers/hse-assignment.js` | A | A-02A terminate / B2.2 rehire 控制器（03.34/03.26） | 保留 | C2 |
| 19 | `server/controllers/trainingController.js` | D | 培训（P3-16 关联） | 保留 | C5 |
| 20 | `server/middleware/auth.js` | C | 权限串（G-8 hse:hazard:review 等） | 保留 | C3 |
| 21 | `server/routes/alerts.js` | C | 告警 P2 修复（缺 is_deleted 等） | 保留 | C4 |
| 22 | `server/routes/hazards/main.js` | C | 隐患 canonical（P3-04 后续） | 保留 | C3 |
| 23 | `server/routes/hse-assessment-category.js` | D | 考核类目 | 保留 | C5 |
| 24 | `server/routes/hse-chain.js` | C | 检查链 hse_tasks | 保留 | C4 |
| 25 | `server/routes/hse-employee/assignment.js` | A | `POST /org/rehire` 路由（B2.2，03.26） | 保留 | C2 |
| 26 | `server/routes/overview.js` | C/F | 总览统计（P0-2 直读 Excel 残留表所在文件，改动方向待 B-1 治理） | 保留 | C4 |
| 27 | `server/services/assessmentMonthlyChainService.js` | D | 月度考核链（P1-A 历史保护） | 保留 | C5 |
| 28 | `server/services/assessmentMonthlyDeductionService.js` | D | 同上 | 保留 | C5 |
| 29 | `server/services/assessmentMonthlyScoringService.js` | D | 同上 | 保留 | C5 |
| 30 | `server/services/assessmentMonthlyShared.js` | D | 同上 | 保留 | C5 |
| 31 | `server/services/assessmentMonthlyTargetService.js` | D | 同上 | 保留 | C5 |
| 32 | `server/services/assessmentScheduler.js` | D | 考核调度器 | 保留 | C5 |
| 33 | `server/services/employeeAssignmentService.js` | A | B1 终态闸门+B2.2 rehireEmployee(:648)+A-02B 并发栅栏(:455-467) | 保留 | **C2 首批** |
| 34 | `server/services/employeeImportService.js` | A | C1 V1 导入终态闸门（03.24） | 保留 | C2 |
| 35 | `server/services/employeeImportV2Service.js` | A | C1 V2 导入终态闸门（03.24） | 保留 | C2 |
| 36 | `server/services/employeeProfileService.js` | A | 人员档案（terminalRelationInSql 等） | 保留 | C2 |
| 37 | `server/services/employeeService.js` | A | A-02B W1 收口闸门(:489-494)（03.35） | 保留 | **C2 首批** |
| 38 | `server/services/hazardService.js` | C | 隐患 canonical 状态封口延续 | 保留 | C3 |
| 39 | `server/services/objectiveService.js` | B | 预算/目标（费用域关联） | 保留 | C1 |
| 40 | `server/services/ruleEngine/__tests__/deductionWriter.unit.test.js` | H | 规则引擎测试 | 保留 | C5 |
| 41 | `server/services/ruleEngine/deductionWriter.js` | D | P1-A 扣分复原 | 保留 | C5 |
| 42 | `server/services/ruleEngine/engine.js` | D | P1-A 规则快照 | 保留 | C5 |
| 43 | `server/services/ruleEngine/ruleLoader.js` | D | P1-A 规则加载 | 保留 | C5 |
| 44 | `server/services/siteMgmtService.js` | C | 现场管理 | 保留 | C4 |
| 45 | `server/services/statisticsService.js` | F | 统计 | 保留 | C4 |
| 46 | `server/services/trainingPlanService.js` | D | P3-16 状态机接入 | 保留 | C5 |
| 47 | `server/services/warningCenterService.js` | F | 预警中心 | 保留 | C4 |
| 48 | `server/services/workflowService.js` | C | 工作流 | 保留 | C4 |
| 49 | `server/services/wpsGridSyncScheduler.js` | FZ | WPS 同步调度（05-B 幂等验证通过版本，冻结邻接） | 保留，禁改 | 冻结 |
| 50 | `server/utils/logger.js` | 运维 | winston-daily-rotate-file 修复（红线 2c） | 保留 | C1 |

### 2.4 文档（4）

| # | 路径 | 标签 | 用途 | 保留 | 批次 |
|---|---|---|---|---|---|
| 51 | `docs/191副/_index.md` | I | 文档索引 | 保留 | C6 |
| 52 | `docs/191副/project_memory.md` | I | 项目记忆 | 保留 | C6 |
| 53 | `docs/rule-engine-design/上线运维Runbook.md` | I | 运维手册 | 保留 | C6 |
| 54 | `docs/架构基线/P2-F_隐患状态字段与状态流转一致性只读审计报告.md` | I | P2-F 审计（772a4cd 后又有补充） | 保留 | C6 |

### 2.5 前端（20）

| # | 路径 | 标签 | 用途 | 保留 | 批次 |
|---|---|---|---|---|---|
| 55 | `web-antd/src/api/hse/employee.ts` | A | 员工 API（OrgTerminateFormData 等，03.34） | 保留 | C2 |
| 56 | `web-antd/src/composables/hse/types.ts` | A | 类型 | 保留 | C2 |
| 57 | `web-antd/src/composables/hse/useEmployeeData.ts` | A | 数据订阅 | 保留 | C2 |
| 58 | `web-antd/src/views/hse/employee-import-v2/index.vue` | A | V2 导入页 | 保留 | C2 |
| 59 | `web-antd/src/views/hse/employee/ProfilePage.vue` | A | 档案页 | 保留 | C2 |
| 60 | `web-antd/src/views/objectives/committee/index.vue` | B | 安委会页 | 保留 | C1 |
| 61 | `web-naive/src/api/hse/cost.ts` | B | 费用 API | 保留 | C1 |
| 62 | `web-naive/src/api/hse/employee.ts` | A | 员工 API（terminateEmployee :584 等） | 保留 | C2 |
| 63 | `web-naive/src/api/hse/goals.ts` | B | 目标 API | 保留 | C1 |
| 64 | `web-naive/src/locales/langs/en-US/page.json` | D/F | 菜单文案（risk-library 等新菜单） | 保留 | C4 |
| 65 | `web-naive/src/locales/langs/zh-CN/page.json` | D/F | 同上 | 保留 | C4 |
| 66 | `web-naive/src/views/hazards/index.vue` | C | 隐患页 | 保留 | C3 |
| 67 | `web-naive/src/views/hse/assessment-monthly/freeze.vue` | D | 结果冻结页（P0-4 门控） | 保留 | C5 |
| 68 | `web-naive/src/views/hse/assessment-monthly/scoring.vue` | D | 自动评分页（P0-2/P0-4） | 保留 | C5 |
| 69 | `web-naive/src/views/hse/assessment-monthly/targets.vue` | D | 考核对象页 | 保留 | C5 |
| 70 | `web-naive/src/views/hse/employee-import-v2/index.vue` | A | V2 导入页 | 保留 | C2 |
| 71 | `web-naive/src/views/hse/employee/index.vue` | A | A-02B 只读降级 + TerminalModal/RehireModal 入口（03.35） | 保留 | **C2 首批** |
| 72 | `web-naive/src/views/objectives/budget/expenditure/index.vue` | B | 费用支出页 | 保留 | C1 |
| 73 | `web-naive/src/views/objectives/committee/index.vue` | B | 安委会页 | 保留 | C1 |
| 74 | `web-naive/src/views/objectives/cost/index.vue` | B | 费用闭环页（+315 行，最大前端改动） | 保留 | C1 |

## 三、汇总

- 已删除：**0**。重命名：**0**。冲突：**0**。
- 73 M 中：冻结域 11（H5 培训扩展）+ WPS 调度 1（冻结邻接）+ 人员底座 13 + 费用域 6 + 隐患/风险/检查 10 + 培训考核 15 + 文档 4 + 工程 4 + 其他集成 9（有交叠）。
- 全部 74 项均建议保留；无一建议删除。冻结域 12 项**不得随常规批次提交**，须总控专项裁决（见 B0-06）。
