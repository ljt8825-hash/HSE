# 提示词-08：人工扣分上限提示（决策⑤收尾）+ VIOLATION002 激活就绪包

> 执行方：WorkBuddy（全栈编码代理）
> 日期：2026-08-31
> 前置：第 07 轮（kind 键修复 + VIOLATION002 备建）已审核通过。原始 6 项决策中仅剩⑤的"人工扣分仅提示"未落地；VIOLATION002 适配器已休眠备建，本轮把激活动作做成"一键就绪包"但**不激活**。
> 本轮铁律：**自动扣分零行为变化**。不激活 VIOLATION002、不改 AUTO_DEDUCTION_ADAPTERS、不拆 FILL_SOURCES、不碰 web-antd；人工扣分提示是**纯 advisory**（只提示不拦截）。
> 完成后：执行报告写到 `g:\hse-dashboard\docs\rule-engine-design\执行报告-08-人工扣分上限提示与激活就绪包.md`。

---

## 0. 已核验事实（直接采信）

- 决策⑤口径：大类上限对**自动扣分强制执行**（categoryCap 已实现：allowed=max(0, cap−该对象该类别其他自动扣分)，cappedScore=min(raw, allowed)）；对**人工扣分仅提示、不拦截**。
- 类别上限数据：hse_assessment_rule_category（或规则库类别上限表，前端 Tab2「类别扣分上限」维护，字段 category/max_deduct）；已知三违管理 cap=15、HSE教育培训 cap=30。
- 人工扣分行特征：hse_assessment_deduction 中 deduction_source='manual'（自动='auto'、链传='chain_transmission'）；有效行 is_deleted=FALSE、review_status<>'rejected'；approved/adjusted 为人工锁定行。
- 归类口径：扣分行类别以 source_detail->>'category' 为准（categoryCap 的 resolveRuleForDeductionRows 同口径，优先 source_detail.category）。
- 前端：评分明细抽屉在 `apps/web-naive/src/views/hse/assessment-monthly/scoring.vue`（只读）；人工扣分录入入口需自行定位（grep 后端 `deduction_source`/manual 写入路由与 web-naive 对应表单页，可能在 assessment-monthly 或考核评分相关页面）。
- VIOLATION002 现状：适配器 `violationUnrectifiedAdapter.js` 已注册（3 个）但不在 AUTO 列表（仍 2 个）；规则行 integration_status='pending_data'、adapter_key NULL、metric_code NULL；METRIC_CODE 常量为 null（ensureMetric 零写）；激活清单见执行报告-07 §6。
- 基线：cycle 24 网格 54 行/103.00 分/全 pending；三违来源 0 行；ruleEngine jest 89/89（7 套件）；全量 jest 失败 7 条基线（import-personnel-behavior）；typecheck 51 基线。

## 1. 任务 A：人工扣分上限提示（决策⑤收尾）

1. **定位入口**：grep 后端人工扣分创建/编辑路由（INSERT/UPDATE hse_assessment_deduction 且 deduction_source='manual' 或人工表单提交路径）与 web-naive 对应录入表单（评分页抽屉/弹框/Excel 录入），在报告中列明调用链。
2. **后端提示接口/逻辑**（二选一，按现有架构择优）：
   - 方案 1：人工扣分保存接口在写库前计算 `该对象该周期该类别有效扣分合计（auto+manual+chain_transmission，排除 rejected/软删，编辑时排除本行）+ 本次分值`，若 > 类别 max_deduct，响应中带 `capWarning: { category, cap, currentTotal, adding, wouldTotal }`（**照常保存，不拦截**）；
   - 方案 2：新增只读预检接口（POST 预检或 GET 计算），前端提交前调用。
   - 类别无法确定（人工录入未选规则/类别）或该类别无上限（max_deduct NULL）→ 不提示。
   - 复用 categoryCap 的归类与合计口径（抽公共函数或 require 复用，禁止复制出第二套口径）。
3. **前端提示**：人工录入表单提交后收到 capWarning（或预检命中）→ dialog.warning 提示「该人员「{类别}」类别扣分将达 {wouldTotal} 分，超过类别上限 {cap} 分。人工扣分不受上限强制限制，是否继续保存？」，"继续保存"才真正提交（若用方案 1 则为保存成功后的警示提示 + 列表高亮，按实际交互择优，报告说明）。
4. **单测**：后端上限计算纯函数单测（未超限/刚好超限/编辑排除本行/无上限/类别缺失/rejected 与软删排除）；mock db。
5. 不改动自动扣分任何路径；自动钳制行为不变。

## 2. 任务 B：VIOLATION002 激活就绪包（只备不执行）

1. **激活迁移 SQL** `server/sql/sprint_activate_violation002_READY_NOT_RUN.sql`：
   - 头部大注释「**未执行**，业务拍板后由人工去掉注释执行」；
   - 备份 VIOLATION002 规则行到 bak 表（可重复）；
   - 动作：UPDATE 规则行 integration_status='active'、adapter_key='violation_unrectified'、metric_code=:metric（指标号留占位并注释两个选项：新增 HSE-KPI-SAF-007 或复用 HSE-KPI-SAF-001，业务定）；
   - 附引擎开关说明注释：`engine.js` 第 30 行 AUTO_DEDUCTION_ADAPTERS 追加 'violation_unrectified'（代码改动行在注释中写明，不由 SQL 执行）；
   - 回滚段（恢复 pending_data/adapter_key NULL/metric NULL + 从 AUTO 列表移除）。
2. **激活前检查清单**（写入 SQL 头注释与报告）：①业务确认口径（是否区分查处来源、与 VIOLATION003 同记录双扣分是否允许）；②指标号拍板；③历史 violator_id 全 NULL → 激活后命中为 0，需录入端持续落键；④激活后首次真实运行核对观测文案（"人次"）与扣分归属。
3. **不执行**：SQL 保持注释态；AUTO 列表不改；规则行不动（报告贴库内值证明仍 pending_data）。

## 3. 任务 C：文档同步

更新 `docs/rule-engine-design/规则引擎覆盖矩阵与阶段总结.md`：
- VIOLATION002 行状态改为「适配器已备建休眠（kind=violation_unrectified，dryRun 零命中），待业务拍板一键激活」，激活就绪包路径入矩阵；
- 决策⑤状态更新为「自动钳制✅ + 人工提示✅（本轮）」；
- 各轮交付清单追加 07、08 两轮。

## 4. 硬约束

1. 自动扣分零行为变化：cycle 24 parity（连续两次真实运行 affected=0、54 行/103.00/全 pending）、三违来源 0 行、R000001/VIOLATION003 观测不变。
2. VIOLATION002 不激活：AUTO 列表仍 2 个、规则行仍 pending_data、就绪 SQL 不执行。
3. 人工提示纯 advisory：任何情况下不得阻止人工扣分保存（除既有校验外）。
4. 只改 apps/web-naive，web-antd 禁碰；中文注释。
5. ruleEngine jest ≥89 全绿；全量 jest 失败数=7 基线；typecheck=51 基线；测试数据验完清理。

## 5. 验收清单（证据进报告）

1. 任务 A：人工扣分入口调用链说明；后端上限计算代码（复用 categoryCap 口径证明）；前端提示交互代码片段；单测输出；造一条人工扣分触发超上限提示的实测（截图/响应 JSON），**测试数据验完删除**。
2. 任务 B：就绪 SQL 路径与内容要点（注释态证明：grep 无未注释 UPDATE/执行记录）；规则行库内值仍 pending_data；AUTO 列表 grep 仍 2 个。
3. 任务 C：矩阵文档更新片段。
4. 回归：parity 两次运行输出；jest ruleEngine 总数；全量 jest 失败数；typecheck；FILL_SOURCES 未动 grep；web-antd 未动证明。

## 6. 本轮明确不做（非目标）

- 不激活 VIOLATION002、不建事故/培训/车辆/消防/转运站/晨会适配器。
- 不做事故录入治理（下一轮候选）；不做 82 行乱码清理；不回填历史数据。
- 不改自动钳制逻辑、不改规则分值。
