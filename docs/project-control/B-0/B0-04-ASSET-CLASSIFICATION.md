# B0-04｜全部资产分类及归属

> 标签定义（任务书第五部分）：A 人员底座 A-02｜B 费用及 cost 保护｜C 隐患/风险/检查｜D 培训/考核/三违/网格｜E 事故/车辆/驾驶员/保险｜F AI/驾驶舱/集成｜G 数据库迁移 SQL｜H 测试｜I 历史审计报告与文档｜J 临时调试/日志/中间产物｜K 无法判断需人工核实。另加 **FZ=冻结域**（任务书 6.3，物理上与 A-K 正交）。
> 逐文件明细见 B0-02（修改/暂存 74 项）与 B0-03（未跟踪 200 项）；本文档为分类总表与归属-任务映射。

## 一、分类总表

| 标签 | 修改(含暂存) | 未跟踪 | 合计 | 代表资产 |
|---|---|---|---|---|
| A 人员底座 | 13 | ~18 | ~31 | employeeService.js、employeeAssignmentService.js、employeeStatusDict.js、8 个 employee 测试、TerminalModal/RehireModal、B02-DEC-03.13~03.35 报告链 |
| B 费用/cost | 6（含 cost.js staged A） | ~13 | ~19 | cost.js(18行shim)、objectiveService、cost.ts/goals.ts、objectives 4 页、OBJECTIVES_* 5 报告 |
| C 隐患/风险/检查 | 10 | ~60 | ~70 | hazardService、risk-library 4 件套、P3-01~04 文档、P3-04 目录、P3-05 51 项、G-7/N-02 SQL |
| D 培训/考核/三违/网格 | 16 | ~12 | ~28 | ruleEngine 4 件套、assessmentMonthly 5 件套、trainingPlanStatusMachine、H5 培训扩展(FZ)、P3-16 |
| E 事故/车辆/驾驶员/保险 | 0 | 0 | 0（域内修改已随历史提交） | — |
| F AI/驾驶舱/集成 | 6 | 少量文档 | ~10 | app.js、statisticsService、warningCenterService、locales |
| G 迁移 SQL | 0（.gitignore 关联 1） | 11 | 12 | p3_05_03_04 m1~m6、r2/r4 fix、g7、n02a、p1a_snapshot |
| H 测试 | 5（package/lock、ruleEngine test 等） | ~14 | ~19 | 8 employee 测试、3 trainingPlan 测试、p1a 快照测试、前端 4 件 |
| I 文档 | 4 | ~115 | ~119 | 根目录 17 份验收/审计、docs/AI智能分析 全系列、架构基线 8 份、191副 8 份 |
| J 临时/中间产物 | 0 | ~9 | ~9 | test-write.txt、risk02_err2.txt(空)、30000,description(空)、install-scrapling-skill.sh、.acl-recovery/.codegraph/acl-out、_md 资料转换 |
| K 待人工核实 | 1（prod-launch.cjs 改动实质未逐行核） | 2 | 3 | prod-launch.cjs diff、dsh-gpt-agent-preset/、30000,description |
| FZ 冻结域（跨标签） | 12 | 3 | 15 | grid-mobile-cloudflare 11M+2 新增、worker/training.js、wpsGridSyncScheduler.js |

（有交叠计数：FZ 文件同时计入 D/I 等；以 B0-02/B0-03 明细为准。）

## 二、文件 → 历史任务映射（核心成果）

| 历史任务/节点 | 代码资产 | 测试 | 报告 |
|---|---|---|---|
| A-02d 状态编码统一（03.13~03.18） | employeeStatusDict.js、employeeService、web-naive employee.ts、web-antd employee-status.ts | employee-status-code.unit.test | 03.13/03.14/03.15/03.17/03.18 |
| A-02e.3/4 规则契约（03.19~03.22） | employeeStatusDict、employeeAssignmentService | — | 03.19/03.20/03.20A/03.21/03.21A/03.22 |
| A-02e.5-B1 分配终态闸门（03.23） | employeeAssignmentService:362-432 | terminal-guard 测试 | 03.23 |
| A-02e.5-C1 导入防复活（03.24） | employeeImportService/employeeImportV2Service | import-v1/v2-terminal-guard、purge-guard | 03.24 |
| A-02e.5-B2.1/B2.2 返聘（03.25/03.26/03.27） | rehireEmployee(:648)、/org/rehire 路由、RehireModal、employee-rehire.ts | employee-rehire.unit.test | 03.25/03.26/03.27 |
| A-02e.5-D1 前端入口（03.28） | index.vue 组合 action | — | 03.28 |
| A-01 设计冻结（03.32/03.33） | （设计，无代码） | — | 03.32/03.33 |
| A-02A 终态登记（03.34/03.34-R） | terminateEmployee(:1039)、POST /org/terminate、TerminalModal、employee-terminate.ts | employee-terminate 15 例 | 03.34/03.34-R |
| A-02B 编辑收口（03.35） | employeeService:489-494 闸门、并发栅栏 :455-467、index.vue 只读降级 | relation-d1+terminal-guard 73 例 | 03.35 |
| P2 费用域（9d9b173→5e8b052 修复链） | cost.js shim(staged)、objectiveService、cost 页面 | cost.service.test 37 例(已提交) | 根目录 OBJECTIVES_*/HSE_COST_* 8 份 |
| P3-04 隐患（d0066c4 封口） | hazardService、hazards/main、auth.js、alerts.js | G-7/G-8 实测 | P3-04 目录 13+ 文档、p3_04_g7/n02a SQL |
| P3-05 风险库 | risk-library 4 件套、app.js 挂载 | — | P3-05 51 项、m1~m6+r2/r4 SQL |
| P3-16 培训状态机 | trainingPlanStatusMachine、trainingPlanService、trainingController | 3 个 trainingPlan 测试 | P3-16 3 份 |
| P1-A/P0 考核历史保护 | ruleEngine 4 件套、assessmentMonthly 5 件套、assessmentScheduler | history-protection + p1a 快照测试 | P1-A 3 份 + P0 验收报告 |

## 三、归属判定方法说明

- 修改文件归属依据：diff 实读（.gitignore/package.json/cost.js）+ 项目记忆中的行号级证据（employeeService:489-494 等，本次已抽查吻合）+ 同批测试/报告对应关系。
- 未跟踪文件归属依据：路径模式 + 内容抽查（test-write.txt="test"、risk02_err2.txt=空、30000,description=空）+ 历史报告文件名闭环（如 p3-05-03.4-migrate.js ↔ P3-05-03-04 实施报告）。
- **未逐行 diff 的修改文件**（38 个 server/ 前端源码 M 文件）其"改动实质"列来自历史任务记录，标注为高置信推断；B-1 开工前如需逐文件 diff 存档，见 B0-06 方案 6。

## 四、K 类清单（不得猜测，须人工核实）

1. `server/scripts/prod-launch.cjs` 的未暂存 diff 实质（涉生产 5876 启动，红线 2b）。
2. `dsh-gpt-agent-preset/` 整目录（第三方工具，LICENSE 齐全，但与本仓库关系未核实）。
3. `30000,description` 空文件来源。
