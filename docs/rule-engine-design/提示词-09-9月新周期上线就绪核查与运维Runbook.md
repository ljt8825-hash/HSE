# 提示词-09：9 月新周期上线就绪核查 + 运维 Runbook

> 执行方：WorkBuddy（全栈编码代理）
> 日期：2026-08-31
> 背景：引擎化主体工作（网格/三违两适配器、上限钳制、人工锁定、可观测、数据治理、人工提示、VIOLATION002 休眠备建）已全部审核通过。**明天 2026-09-01 是规则引擎迎来的第一个全新月份实战**——8 月周期（cycle 24）是在引擎上线前就存在的历史周期，9 月周期将首次经历"月初建周期 → 每日调度累计应巡 → 月末冻结"的完整生命周期。本轮做上线前就绪核查，以只读核查、dryRun 演练、文档为主。
> 本轮铁律：**零评分行为变化**。不激活 VIOLATION002、不改 AUTO_DEDUCTION_ADAPTERS、不拆 FILL_SOURCES、不碰 web-antd；除"发现会导致错误扣分的调度缺陷"外不改调度逻辑（发现问题先在报告中详述，修复需单独证明零影响）。
> 完成后：执行报告写到 `g:\hse-dashboard\docs\rule-engine-design\执行报告-09-9月上线就绪核查.md`。

---

## 0. 已核验事实（直接采信）

- 调度器：`server/services/assessmentScheduler.js`，node-cron 三个任务——CRON_CREATE_CYCLE（自动建周期，日志文案"自动创建上月考核周期"）、CRON_DAILY_CHECK（每日全量校验）、CRON_GRID_CHECK（网格校验，约 366 行对每个周期调 `gridUncheckedDeduction.syncGridUncheckedDeductions(c.id)` → 薄门面 → `runCycleAutoDeductions` 跑 grid_unchecked + violation_record 两适配器）；受 `SCHEDULER_ENABLED` 环境开关控制；时区 CRON_TZ。
- 引擎：门面 `runCycleAutoDeductions(cycleId,{dryRun})`；适配器注册 3 个（含休眠的 violation_unrectified），AUTO 列表 2 个；事件/月度双幂等（事件按 source_id+kind）；人工锁定 approved/adjusted；上限钳制 categoryCap；观测三数写 hse_assessment_rule.last_run_*（dryRun 不写）。
- 网格应巡累计：进行中月份 `endDate = 今天`（getGridPatrolStats），历史月份按月末——9 月 1 日应巡次数从 1 天起累计，属预期。
- 违规月窗口：violationAdapter 按 violation_date 落在周期月窗口取数；9 月周期窗口 = 2026-09-01 ~ 2026-09-30；历史违规 violator_id 全 NULL → 新周期三违扣分同样依赖新录入落键。
- 基线：cycle 24 网格 54 行/103.00 分/全 pending；三违来源 0 行；ruleEngine jest 95/95（7 套件）；全量 jest 失败 7 条基线；typecheck 51 基线。
- 周期数据：hse_assessment_cycle（cycle 24 = 2026-08）；目标对象 hse_assessment_target（cycle24 58 人）；得分 hse_assessment_score。

## 1. 任务 A：调度与周期创建链路只读核查

读码 `assessmentScheduler.js` 及其调用的周期创建服务，输出：

1. 三个 cron 的**实际表达式**（几点跑）、SCHEDULER_ENABLED 在当前 .env/部署环境的取值、CRON_TZ。
2. CRON_CREATE_CYCLE 完整逻辑：创建的是哪个月份的周期（"上月"文案的真实语义——是每月初创建刚结束月份用于考核，还是提前创建当月？）、目标对象如何生成（人数/筛选口径是否与 cycle24 同口径）、幂等性（同月重复触发会不会建重）、失败重试。
3. CRON_GRID_CHECK 遍历周期的 **WHERE 条件**：哪些状态的周期会跑（进行中？已冻结/历史周期是否也被遍历？）；若历史周期也被遍历，说明幂等下的影响（应无变化但有日志噪声/资源消耗）。
4. 9 月首跑时间线推演表：9/1 当天各任务触发顺序与预期结果（周期何时存在、网格首日应巡累计、三违窗口、观测写入）；月末（9/30）与 10/1 冻结/新建衔接。
5. 风险点清单：周期未建成时网格校验是否安全跳过、调度异常日志位置、后端重启是否影响 cron。

## 2. 任务 B：9 月新周期 dryRun 演练（零写入）

1. 连库确认 9 月周期是否已存在（hse_assessment_cycle 2026-09 行）；若已存在，报告其 id/targets 数量/创建方式（调度 or 人工）。
2. 对 9 月周期（不存在则见下）执行 `runCycleAutoDeductions(cycleId,{dryRun:true})`，脚本放 `server/scripts/_ruleEngine/_probe_cycle_sept.js`：
   - 输出两适配器 scanned/assessed/intents/revocations/skipped/noLedger；
   - 预期：grid 月初 missing 应为 0 或极小（首日应巡）、violation 窗口切 9 月后命中 0（无 9 月落键违规）；
   - **全程 dryRun，断言零写入**（演练前后 hse_assessment_deduction/score/rule last_run_* 快照一致）。
3. 若 9 月周期不存在：**不得为演练创建正式周期**。改为读码核查周期创建服务函数 + 在脚本中以事务方式创建演练周期、dryRun、随后 ROLLBACK/物理删除演练周期及其 targets/scores/deductions（报告贴清理前后 count 证明零残留）；或直接在报告中注明"等调度 9/1 自动创建后首日复核"，把首日复核步骤写进 Runbook。
4. 同时对 cycle 24 再跑一次 dryRun 证明无回归（affected=0、54/103 不变）。

## 3. 任务 C：前端可观测性核验

1. `apps/web-naive/src/views/hse/assessment-rule/index.vue` 规则库页：
   - 13 条有效规则的「接入状态」标签四种态（active/pending_data/no_table/manual）渲染正确；
   - 「最近执行结果」列对 R000001 显示「扫描62人/考核56人/扣分54人」、VIOLATION003 显示「扫描0人/扣分0**人次**」、未跑过的规则显示空态/占位；
   - pending_data/no_table 行下方"暂不会自动扣分"小字提示可见；
   - 两条软删规则（E2E-TEST-001/DEMO-SHOW-001）不在列表出现。
   - 证据方式：独立实例（同库同 .env，参考第 08 轮 5801 端口方式）启动后页面截图或 DOM 查询输出；不得要求用户重启其后端进程。
2. 评分页 `assessment-monthly/scoring.vue` 明细抽屉中自动扣分类型/来源展示正常（抽查看不看得到网格扣分行）。
3. 发现纯展示层 bug（文案/标签/空态）可直接修复并 typecheck 验证；涉及数据语义的问题只报告不修。

## 4. 任务 D：上线运维 Runbook

新建 `g:\hse-dashboard\docs\rule-engine-design\上线运维Runbook.md`，面向业务管理员/运维：

1. **月初检查清单**（每月 1 日）：周期是否自动创建（查 hse_assessment_cycle/界面）、调度日志关键字（`[assessment-scheduler]`）、规则库「最近执行结果」三数读法。
2. **月中**：自动扣分每日随调度累计（进行中周期数字增长属预期，月末冻结为整月口径）；人工扣分 Excel 导入超上限提示的含义（仅提示不拦截）。
3. **手动触发/重跑**：用 `server/scripts/_ruleEngine/` 下脚本（facade 幂等可安全重跑，dryRun 预览）；操作步骤与输出解读。
4. **VIOLATION002 激活流程**：链接就绪 SQL 与 4 步动作（业务口径确认 → 指标号 → 去注释执行 SQL → AUTO 列表加键重启），强调激活前需录入端落键。
5. **待业务决策 5 项**（未标注来源 1 分 vs 0 分、培训口径 A/B、82 行乱码处置、VIOLATION002 口径、四类无源表检查立项）逐项写明"不决策的影响"。
6. **异常处置**：调度没跑怎么办、扣分明显错误如何查（source_detail/source_id/kind 排查路径）、回滚要点（适配器下线=从 AUTO 移除+规则置 pending_data，扣分行软删）。
7. 9/1 首日复核记录表格（留空，供运维当天填写实际数字）。

## 5. 硬约束

1. 零评分变化：cycle 24 parity（54 行/103.00/全 pending）、三违来源 0 行、观测值不被 dryRun 改写。
2. 不激活 VIOLATION002、不改 AUTO 列表、不动 FILL_SOURCES、不执行任何就绪/清理 SQL。
3. 演练数据零残留：正式 9 月周期若由调度自然创建属业务数据（保留并报告）；任何人工演练数据必须清理并给证据。
4. 只改 apps/web-naive，web-antd 禁碰；中文注释。
5. ruleEngine jest ≥95 全绿；全量 jest 失败数=7 基线；typecheck=51 基线（任务 C 若修展示 bug，错误数不得超过 51）。

## 6. 验收清单（证据进报告）

1. 任务 A：cron 表达式/开关/时区实值；周期创建逻辑与幂等结论；遍历周期 WHERE 条件；9 月时间线推演表；风险清单。
2. 任务 B：9 月周期存在性查询；dryRun 两适配器输出；零写入快照对比；cycle24 无回归输出；演练数据清理证据（如涉及）。
3. 任务 C：规则库页四态标签/"人次"文案/未接入提示/软删不可见的截图或 DOM 证据；展示层修复清单（如有）。
4. 任务 D：Runbook 路径与目录。
5. 回归：parity、jest ruleEngine 总数、全量失败数、typecheck、grep（AUTO 仍 2 个/FILL_SOURCES 未动/web-antd 未动）。

## 7. 本轮明确不做（非目标）

- 不做事故录入治理与事故适配器（事故否决旧路随落键自然激活的风险需专项评估，下一轮候选）。
- 不建培训/车辆/消防/转运站/晨会适配器；不回填历史数据；不清理 82 行乱码。
- 不改业务规则分值；不做人工扣分表单（当前 Excel 导入为唯一入口）。
