# B0-06｜备份与分批固化建议（仅方案，未执行）

> 铁律：不一次性提交全部修改；不整体 git add 未跟踪文件；不自动生成提交；不改 .gitignore；不执行清理；不覆盖现有备份。本方案待总控授权后由专门批次执行。

## 一、必须立即备份的文件（方案 1：工作区冷备份）

当前 73 M + 1 A + ~200 未跟踪**只存在于本地工作区**，远端零备份。建议（任选其一，授权后执行）：

- **方案 1a（推荐）**：对工作区做一次带外快照（如 `robocopy G:\hse-dashboard X:\backup\hse-ws-20261030 /MIR /XD node_modules .git _migration_backups`），避开 node_modules/.git 与敏感备份目录；快照后校验抽样 md5。
- **方案 1b**：若倾向纯 Git 手段，用 `git stash create` 生成悬空提交对象并记录 SHA（不 stash、不切换，仅生成对象防丢）+ 未跟踪文件打 tar。**注意：这属于 Git 元数据操作，仍需总控确认不属于禁止范围。**

**优先级最高（若只备份一批）**：
1. `server/services/employeeService.js` / `employeeAssignmentService.js` / `employeeStatusDict.js` + 8 个 employee 测试 + TerminalModal/RehireModal + `web-naive employee/index.vue`（A-02 全链成果）；
2. `server/sql/*.sql` 11 个迁移文件；
3. `server/routes/cost.js`（保护态）；
4. `grid-mobile-cloudflare/` 全域（冻结链 + 待验收培训扩展）。

## 二、建议按域分批固化的提交序列（方案 2，供总控裁决）

> 每批 = 显式路径 `git add <paths>` + 独立 commit；提交前跑 `node tools/check-repo-source-integrity.mjs`（红线 8）与凭据/PII 双扫（红线 5）。

| 批次 | 内容 | 文件来源 | 提交信息建议 |
|---|---|---|---|
| **C1** | 费用域收尾 + cost.js 转正 | cost.js(A)、objectiveService、cost.ts/goals.ts、objectives 4 页、OBJECTIVES_*/HSE_COST_* 8 报告、.gitignore、utils/logger.js | `feat(hse-cost): 费用域验收报告归档 + cost.js 聚合入口入库` |
| **C2** | 人员底座 A-02d~A-02B 全链 | 13 个 M + employeeStatusDict + 8 测试 + 3 api ts + 2 Modal + web-antd 5 件 + B02-DEC-03.13~03.35 报告 26 份 | `feat(personnel): A-02 系列状态域闭环（编码/闸门/返聘/终态/编辑收口）` |
| **C3** | 隐患 + 风险库 + 迁移 SQL | hazardService、hazards/main、auth.js、alerts、risk-library 4 件套、web-naive risk-library 3 件、app.js、11 个 SQL、P3-04/P3-05 文档、p3-05 迁移脚本 | `feat(risk,hazard): P3-04/05 成果与迁移 SQL 入库` |
| **C4** | 现场/统计/预警/集成杂项 | siteMgmtService、statisticsService、warningCenterService、workflowService、hse-chain、overview.js、locales、剩余 docs | `chore(integration): 现场与集成域收尾` |
| **C5** | 培训 + 考核引擎 | ruleEngine 4 件、assessmentMonthly 5 件、assessmentScheduler、trainingPlan 3 件、trainingController、assessment views 3 页、package.json/lock、测试 | `feat(training,assessment): P3-16 状态机 + P0/P1-A 历史保护` |
| **C6** | 文档归档 | 根目录 17 份报告、docs/audit、191副、rule-engine-design 执行报告、_md 资料转换（可选） | `docs: 历史审计与验收报告归档` |
| **专项 Z** | 冻结域培训 H5 | grid-mobile-cloudflare 11 M + 3 新增 | **不进常规序列**：须总控先裁决"培训 H5 验收通过后才允许提交+部署"，且提交与部署解耦 |

## 三、不建议提交的临时文件（方案 3）

`安全看板vben/test-write.txt`、`risk02_err2.txt`、`30000,description`（均空/残留）、`install-scrapling-skill.sh`、`.acl-recovery/`、`.codegraph/`、`acl-out/`、根目录历史 `.log/.cjs` 调试残留（已被现有 .gitignore 覆盖，保持忽略即可）。B-0 不删除，仅标注。

## 四、需进一步确认的文件（方案 4，K 类）

1. `server/scripts/prod-launch.cjs` 的未提交 diff——B-1 前必须人工逐行审（涉生产 5876 启动器，红线 2b）。
2. `dsh-gpt-agent-preset/`——确认是否本仓库资产；若否，移出仓库目录（需授权）或加入 .gitignore（需授权，B-0 不改）。
3. `30000,description` 来源。
4. H5 培训扩展的验收状态与部署窗口（2026-10-29 文档说明"待验收"）。

## 五、必须永久冻结的文件（方案 5）

| 资产 | 冻结要求 |
|---|---|
| `server/routes/cost.js` | 保持 staged A + md5 `e88ae2b0…`；C1 批次提交后仍按"发布完整性"对象管理，后续修改须走发布流程 |
| `grid-mobile-cloudflare/`（除培训专项 Z 外） | 禁改禁迁禁重构（红线 7） |
| `server/services/wpsGridPullEngine.js` REVERSE_WRITE_ENABLED=false、18 列哈希 | 禁改 |
| `server/sql/*` 已执行迁移 | 只追加不修改；`_migration_backups/` 永不入库（.gitignore 已排除） |
| 花名册权威 | 飞书 `tbl2ZHdXX5d8R12a` 唯一权威不变 |

## 六、B-1 可安全继承的成果（方案 6）

1. **人员底座全链**（C2 批次内容）：主数据收敛（B-1）将触碰 employee 域，A-02 的闸门/字典/状态编码是其直接前置——必须先 C2 固化再动 B-1，否则 B-1 的 diff 会淹没 A-02 成果。
2. **P3-05 风险库 14 表模型 + 11 个迁移 SQL**：B-1 主数据治理需引用 `risk_area_dict/risk_work_type_dict` 的既有建模。
3. **B02-DEC 裁决包（15 项）与 B01 主数据审计 5 份**：B-1 的决策输入。
4. **架构基线四件套 + A02-05 十二域总表**：B-1 范围界定依据。
5. **dev-only 守卫范式**（`current_database()` 断言 + DB_NAME 注入约定）：B-1 全部迁移脚本必须沿用。

## 七、执行前置条件（供总控确认）

1. 备份方案 1a/1b 择一授权；
2. 批次序列 C1→C6 顺序与拆并裁决（**专项 Z 单独裁决，不并入**）；
3. K 类 3 项人工核实结果；
4. 确认 2026-10-30 11:22 之后无并行会话继续写入工作区（见 B0-07 R-0）。
