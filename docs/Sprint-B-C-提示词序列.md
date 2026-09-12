# Sprint-B-C 整改提示词序列

> 创建日期：2026-07-28
> 用途：按优先级顺序执行，每个提示词给 WorkBuddy 执行，完成后将生成的 MD 文档交回审核，再生成下一个提示词。
> 约束：不修改代码、不动 vben 组件、不自定义仅使用 vben 组件、目标路径 F:\hse-dashboard\安全看板vben

---

## 提示词 1：P0-1 — 迁移源表行数矛盾调查

**状态**：✅ 已完成（文件：`P0-1-行数矛盾调查报告.md`）

**审核结论**：报告质量高，通过交叉验证。关键发现：
- 1,304 双源互证（Pre-risk 审计 + TRAE-Step1 实测），可信度高
- 3,156 仅 Dry Run R2 单源，标注为测试环境，不可外推为生产基线
- 根因：环境数据基数不同，非统计口径/时间/表合并问题
- 风险：若沿用 3,156 作生产基线，B-2 偏差 59% 将触发 RAISE EXCEPTION 中止迁移

**验证结果**：经 Grep 扫描全量 docs 目录，确认 1,304 出现在 10+ 份文档中（Pre-risk、Step1、跨文档分析、审计报告等），3,156 仅出现在 Dry Run R2 和引用它的二级文档中。结论一致。

---

```

任务：回填 3 份"修复文档"——Constraint-Check、Baseline-Validation-Fix、Status-Mapping

背景：
在 Sprint-B v2.1 的 Go-NoGo 评审中，声称"4/4 修复项已完成 PASS"，但跨文档综合分析发现其中 3 份文档存在严重问题：
1. Constraint-Check.md：开发环境部分已填写（FAIL），但生产环境验证项和签字栏均为空白
2. Baseline-Validation-Fix.md：所有实际值栏（实际/结果）均为空白，签字栏空白
3. Status-Mapping.md：映射规则已填写，但签字栏全部空白，status 分布仅填充了开发环境数据

这 3 份文档的状态与 Go-NoGo 声称的"PASS"不匹配，构成审计证据链断裂。

要求：
1. 读取以下文档，理解当前状态和需要回填的内容：
   - F:\hse-dashboard\docs\Sprint-B-v2.1-Constraint-Check.md
   - F:\hse-dashboard\docs\Sprint-B-v2.1-Baseline-Validation-Fix.md
   - F:\hse-dashboard\docs\Sprint-B-v2.1-Status-Mapping.md
   - F:\hse-dashboard\docs\Sprint-B-v2.1-DryRun-Round2-Report.md（了解 Dry Run 实际执行情况）
   - F:\hse-dashboard\docs\Sprint-B-v2.1-Go-NoGo-Review.md（了解 Go-NoGo 的声明）
   - F:\hse-dashboard\docs\Sprint-A-B-C-跨文档综合分析报告.md（了解跨文档分析发现的问题）

2. 对每份文档执行以下操作：

### Constraint-Check.md
- 检查当前填写状态：开发环境已勾选 `[x] FAIL`（约束不存在），但生产环境验证项 `□ PASS □ FAIL` 未勾选
- 需要回填的内容：
  - 如果生产环境可访问：执行约束检查 SQL，在"生产环境检查"行回填实际结果
  - 如果生产环境不可访问：在"生产环境检查"行标注"待生产 Step 0 Check 0.5 回填"
  - 签字栏保持空白，加注"禁止代签 — 待 DBA 在生产环境验证后签字"
- 禁止：伪造 PASS 结果、代签

### Baseline-Validation-Fix.md
- 检查当前填写状态：所有"实际"栏和"结果"栏均为空白
- 需要回填的内容：
  - 如果 Dry Run 环境可访问：执行验证 SQL，回填实际值和 PASS/FAIL 结果
  - 如果 Dry Run 环境不可访问：基于 Dry Run R2 报告中的已知数据（如 1287/3156/偏差 0%）回填，但明确标注数据来源
  - 对每个空白的"实际：____"栏，要么填真实数据，要么填"待生产 Step 0 回填"
  - 签字栏保持空白，加注"禁止代签"
- 禁止：伪造执行结果、代签

### Status-Mapping.md
- 检查当前填写状态：映射规则已制定，开发环境 status 分布已填写（active=1304），签字栏全部空白
- 需要回填的内容：
  - 确认 status 映射规则中是否仍存在 `ELSE 'active'` 矛盾（该文档 §3.2 曾有 ELSE 'active' 版本，但当前版本已改为 ELSE NULL）
  - 在 §5 签字栏加注说明：当前仅开发环境实测（active=1304），生产环境 status 分布需在 Step 0 Check 0.10 实测后由业务方确认再签字
  - 签字栏所有行保持空白，每行加注"禁止代签"
- 禁止：伪造 status 分布、代签

3. 在每份文档的顶部添加"审计状态"小节，包含：
   - 当前填写完整度（百分比）
   - 哪些项已填写（有实际数据）
   - 哪些项待生产环境回填
   - 哪些项禁止代签

4. 如果发现 Go-NoGo-Review.md 中有与这 3 份文档实际状态不一致的声明，记录在输出报告中

输出格式：
- 生成 Markdown 文档，保存到 F:\hse-dashboard\docs\P0-2-修复文档回填报告.md
- 文档结构：
  - 执行摘要（3 份文档的回填状态一览表）
  - Constraint-Check 回填详情
  - Baseline-Validation-Fix 回填详情
  - Status-Mapping 回填详情
  - Go-NoGo 声明 vs 实际状态对比
  - 遗留待办（哪些项仍需生产环境回填）
  - 签字治理状态
- 重要的：本次任务只修改这 3 份文档，不修改其他任何文件，不修改代码、路由、接口、配置

禁止事项：
- 禁止伪造 PASS 或任何执行结果
- 禁止代签任何角色
- 禁止删除或修改已有的正确内容
- 禁止修改 Go-NoGo-Review.md 或其他文件
- 禁止修改代码、路由、接口、配置
```

---

## 提示词 2：P0-2 — 修复文档回填

**状态**：✅ 已完成（文件：`P0-2-修复文档回填报告.md`）

**审核结论**：报告质量高，回填操作合规，通过验证。关键发现：
- 3 份文档均已添加"审计状态"小节，完整度 60%~70%
- 所有可确证数据已回填（Constraint-Check 开发环境 FAIL、Baseline 测试环境 1287/3156、Status-Mapping ELSE NULL 确认）
- 生产环境项全部标注"待生产 Step 0 回填"
- 所有签字栏保持空白 + "🔒 禁止代签"
- Check 编号从 0.5 修正为 0.7（与 Runbook-Final 一致）
- 关键发现：Go-NoGo"4/4 PASS"结论在证据层面仍缺乏支撑，签字栏仍全部空白

**验证结果**：经 Grep 核对 3 份文档 + Go-NoGo，确认回填内容与报告一致。Go-NoGo §二明确声称"4/4 已完成 | PASS"，§七签字表全部空白，§七.1 明订"经以下角色签字批准后，方可执行生产迁移"与结论矛盾。

---

## 提示词 3：P0-3 — 签字治理缺口补录

**状态**：✅ 已完成（文件：`P0-3-签字治理缺口报告.md`）

**审核结论**：报告质量高，治理操作合规，通过验证。关键发现：
- 8 份文档审计覆盖完整，签字缺口全景：5 份有"PASS/READY"结论但签字全空白
- 5 份文档已添加"🔒 禁止代签"注记（Go-NoGo / DryRun-R2 / Production-Ready / Pre-Readiness / Change-Approval）
- PASS 结论文字原样保留（作为审计证据），仅加脚注说明"正式放行以签字完成为前置条件"
- 7 个角色 × 共 25+ 处签字栏全部空白，无一签过
- 按角色归集了签字待办清单，明确标注"签字完成前不构成正式放行"

**验证结果**：经 Grep 核对 5 份被修改文档，确认"🔒 禁止代签"注记已到位，PASS 文字原样保留，P0-2 的 3 份文档未被重复修改。

---

## 提示词 4：P0-4 — 4 项前置 Task 状态确认

**状态**：✅ 已完成（文件：`P0-4-前置Task状态确认报告.md` + `P0-4-签字就绪检查清单.md`）

**审核结论**：报告质量高，审计全面，合规。关键发现：
- 4 项前置 Task 全部未完成，是生产迁移最大阻塞项
- 发现两份就绪检查文档（Pre-Readiness 与 Pre-Closure）95% 重复，建议合并
- 19 个签字点全部空白，约 62 个角色签名无一完成
- 7 个签字点缺少"禁止代签"注记（P0-3 遗留），已标注为缺口
- README.md 等 4 处联系方式全空

**验证结果**：经 Grep 交叉验证，Pre-Closure 无注记、README 联系方式全空、Pre-Readiness §3.2 六方签字缺注记等声明均与源文档一致。

---

## 提示词 5：P1-1 — 禁止代签注记补齐（P0-3 遗留缺口）

**状态**：✅ 已完成（文件：`P1-1-禁止代签注记补齐报告.md`）

**审核结论**：操作精准合规，通过验证。关键发现：
- Pre-Closure 5 处 + Pre-Readiness §3.2 1 处 + Migration-Checklist 1 处 = 7 处全部补齐
- 19/19 签字点注记覆盖率 100%
- Pre-Readiness 已有 4 处注记未被重复修改
- PASS/READY 文字原样保留

**验证结果**：经 Grep 核对 3 份源文档（Pre-Closure 5 处/Pre-Readiness 5 处含新增/Migration-Checklist 1 处），注记全部到位，已有注记未重复添加。

---

## 提示词 6：P1-2 — 就绪检查文档合并与 Status 映射文档统一

**状态**：✅ 已完成（文件：`P1-2-就绪文档合并与映射统一报告.md`）

**审核结论**：报告质量高，合并操作精准合规，通过验证。关键发现：
- 两份就绪文档合并为单一份 v2.0（T-1h + T-0 双 gate），新增 R1~R5 现场实时复核项填补原 T-0 缺失
- Pre-Closure 顶部加 DEPRECATED 标记，正文全保留作审计历史
- Status-Mapping 新增 §六 文档关联，映射表 9 行与就绪文档完全一致
- 不重复原则执行到位：Pre-Closure §五/§六.2 与合并版 §七/§八.2 逐字相同，未重复复制
- 6 处签字注记全部保留，100% 覆盖率无回退

**验证结果**：经 Grep 核对合并版 Pre-Readiness（6 处 🔒）、Pre-Closure（DEPRECATED 标记）、Status-Mapping（§六 文档关联），所有声明与源文档一致。

---

## 提示词 7：P1-3 — Dry Run 可追溯证据补充

**状态**：✅ 已完成（文件：`P1-3-DryRun可追溯证据补充报告.md`）

**审核结论**：报告质量高，回填操作合规，通过验证。关键发现：
- 三份文档（B-2 执行报告 / Step0 执行报告 / SQL 日志模板）共回填 18 处执行结果
- 所有数据均源自 Dry Run R2 报告，未留痕字段统一标注，无伪造
- 三份文档顶部均添加数据来源声明，her=3156 加注"⚠️测试环境不可外推为生产基线"
- 证据链本质局限未改变：仍是单源 + 测试环境 + 无原始 SQL 文本
- 签字栏全部空白，未代签
- SQL 日志模板 §1.3/§1.4 因 Dry Run R2 无对应原始输出而保持空白，与 Step0 报告已回填的结论不矛盾

**验证结果**：逐项核对三份源文件，所有回填数值与报告声明一致，红线全部遵守。

```
任务：回填 Dry Run R2 执行报告和 SQL 日志模板，补充可追溯证据

背景：
P0-1 行数矛盾调查发现 Dry Run R2 的 3,156 仅单源声明（Dry Run R2 报告），无 SQL 执行文本留痕、无独立佐证。同时，以下执行报告和日志模板均为空白，导致 Dry Run 证据链断裂：
1. Sprint-B-B2-Execution-Report.md — 「插入记录数」等关键字段为 ____
2. Sprint-B-Step0-Execution-Report.md — her= 等基线值为 ____
3. Sprint-B-SQL-Execution-Log-Template.md — 无 Dry Run 实际执行日志

虽然 Dry Run 是测试环境产物、不可外推为生产基线，但作为"Dry Run 已执行并通过"的证据支撑，这些空白模板严重削弱了 Go-NoGo 评审的可信度。

本次任务需要：
1. 从 Dry Run R2 报告中提取已知的实际执行数据，回填到空白执行报告和日志模板中
2. 无法回填的项明确标注"Dry Run 原始数据未留痕，待生产回填"
3. 生成一份 Dry Run 证据可追溯性矩阵

要求：
1. 读取以下文档，理解当前状态和 Dry Run R2 已知数据：
   - F:\hse-dashboard\docs\Sprint-B-v2.1-DryRun-Round2-Report.md（§三 执行时间线，提取所有实际数值）
   - F:\hse-dashboard\docs\Sprint-B-v2.1-Production-Package\Sprint-B-B2-Execution-Report.md（B-2 空白模板）
   - F:\hse-dashboard\docs\Sprint-B-v2.1-Production-Package\Sprint-B-Step0-Execution-Report.md（Step0 空白模板）
   - F:\hse-dashboard\docs\Sprint-B-v2.1-Production-Package\04_Log\Sprint-B-SQL-Execution-Log-Template.md（日志模板）
   - F:\hse-dashboard\docs\P0-1-行数矛盾调查报告.md（§二 数据追溯表，了解所有已知数字）
   - F:\hse-dashboard\docs\Sprint-B-v2.1-Baseline-Validation-Fix.md（了解 baseline 验证逻辑）

2. 回填 B-2 执行报告（Sprint-B-B2-Execution-Report.md）：
   - 从 Dry Run R2 §3.4 提取实际数据：
     - Step 1 迁移前备份：ea_backup_count = 0，耗时 210 ms
     - Step 1.5 脏数据检查：duplicate_count = 0，耗时 95 ms
     - Step 1.6 status 映射预检查：unknown_status_count = 0，耗时 88 ms
     - Step 2 执行迁移：actual_migrate_count = 3156，anomaly_count = 0，耗时 1250 ms
     - Step 3 导出异常：0 条异常，耗时 60 ms
   - 回填到对应字段，在顶部加"数据来源：Dry Run R2 测试环境"标注
   - 无法从 Dry Run R2 报告中提取的字段（如具体 SQL 输出文本、完整执行日志）标注"Dry Run 原始数据未留痕"

3. 回填 Step0 执行报告（Sprint-B-Step0-Execution-Report.md）：
   - 从 Dry Run R2 §3.1 提取 Step 0 检查项数据：
     - 数据库锁检查：PASS（14:02）
     - 活跃连接检查：PASS（14:02）
     - Schema 版本检查：PASS（14:03）
     - employee 无 updated_by：PASS（14:03）
     - employee_assignment 表存在：PASS（14:03）
     - employee_assignment 数据量评估：previous_migration_records = 0（14:04）
     - uk_emp_assign_primary 索引存在：PASS（14:04）
     - 数据差异基线已记录：PASS（14:05）
     - hse_employee_org status 分布：PASS（14:05）
     - hse_employee_relation status 分布：PASS（14:06）
     - status 映射完整性确认：PASS（14:06）
     - 迁移基线表已创建：4 条基线记录（14:06）
     - 迁移备份注册表已创建：PASS（14:07）
   - 回填到对应字段，在顶部加"数据来源：Dry Run R2 测试环境"标注
   - 注意：her 具体数值填写 3156（测试环境值），加注"不可外推为生产基线"

4. 回填 SQL 执行日志模板（Sprint-B-SQL-Execution-Log-Template.md）：
   - 在表格中填入 Dry Run R2 各步骤的已知数据（执行时间、耗时、影响行数、结果）
   - 缺失的字段（如具体 SQL 文本输出、实际返回行数明细）标注"Dry Run 原始数据未留痕"
   - 在顶部加"数据来源：Dry Run R2 测试环境"标注

5. 生成 Dry Run 证据可追溯性矩阵：
   - 列出 Dry Run R2 报告中的每一项数据声明
   - 对应到本次回填的执行报告/日志模板中的具体位置
   - 标注哪些数据有"原始 SQL 输出留痕"、哪些仅"报告文字声明"
   - 评估整体证据链强度

输出格式：
- 生成 Markdown 文档，保存到 F:\hse-dashboard\docs\P1-3-DryRun可追溯证据补充报告.md
- 文档结构：
  - 执行摘要（回填前/后对比）
  - B-2 执行报告回填详情（回填项 vs 仍空白项）
  - Step0 执行报告回填详情（回填项 vs 仍空白项）
  - SQL 日志模板回填详情
  - Dry Run 证据可追溯性矩阵
  - 证据链强度评估（强/中/弱，含改进建议）
  - 遗留待办

禁止事项：
- 禁止修改代码、路由、接口、配置、SQL
- 禁止代签任何角色
- 禁止修改 Dry Run R2 报告原文
- 禁止伪造任何执行数据（只能从 Dry Run R2 报告中提取已知数据）
- 所有回填数据必须标注"数据来源：Dry Run R2 测试环境"
- 所有 Dry Run R2 报告中找不到的数据标注"Dry Run 原始数据未留痕"，不得自行编造
```

---

## 提示词 8：P1-4 — hse_employee_org 只读保护就绪审计

**状态**：✅ 已完成（文件：`P1-4-hse_employee_org只读保护就绪审计报告.md`）

**审核结论**：报告质量高，关键发现经代码级验证通过。核心发现：
- **F1 反转发现**：hse-employee.js 中 hse_employee_org 的 INSERT/UPDATE/DELETE 经代码 Grep 确认为 0 处（12 处引用均为注释），API 收敛前置条件已满足
- 旧审计报告（Legacy_Table_Lifecycle / Legacy_Model_Usage / Employee_API_Migration）称"7 处写入未迁移"为收敛前快照，与 Phase1 报告和代码实况矛盾
- SQL 脚本审计全部通过（正确性/完整性/验证覆盖/回滚），TRAE-Step9 开发环境验证一致
- 真正阻塞项：G2 冒烟测试（12 接口 ⏳）、G3 数据一致性巡检（Employee_Model_Check.sql ⏳）、G5 签字门控
- 提前执行风险低（写入已清零），延迟执行风险高（旧表持续可写），建议优先完成验证后执行

**验证结果**：Grep 代码确认 0 处写入，交叉验证 Phase1 报告与旧审计报告矛盾，所有源文档引用与报告一致。小注：报告称 22 处引用，实际 Grep 为 12 行；Legacy_Model_Usage_Report §5.1 引用需精确化。

```
任务：审计 hse_employee_org 只读保护 SQL 的就绪状态，生成差距分析与执行清单

背景：
Sprint-C v1.0 已生成只读保护 SQL 脚本（`Sprint-C-v1.0/02_SQL/hse_employee_org_ReadOnly_Change.sql`），TRAE-Step9 在开发环境验证了触发器创建逻辑可行。但根据《Legacy_Table_Lifecycle_Report》，hse_employee_org 当前仍为"使用中"状态——hse-employee.js 中存在 7 处生产写入操作尚未迁移至 employee_assignment。

项目约束明确规定：
- "只读保护SQL已生成，API收敛完成后可立即执行"
- "核心迁移任务（后端API收敛）需作为独立开发任务在后续迭代中执行"

因此在 API 收敛完成前，只读保护 SQL 不能直接在生产环境执行。本次任务的目标是审计就绪状态，而非执行 SQL。

本次任务需要：
1. 审计只读保护 SQL 脚本的正确性、完整性
2. 对比 TRAE-Step9 开发环境验证结果与生产环境前置条件
3. 明确 API 收敛的 7 处写入操作现状
4. 生成差距分析报告：什么已完成、什么待完成、什么阻塞
5. 生成执行清单：API 收敛完成后可立即执行的步骤序列

要求：
1. 读取以下文档，理解只读保护的当前状态和前置条件：
   - F:\hse-dashboard\docs\Sprint-C-v1.0\02_SQL\hse_employee_org_ReadOnly_Change.sql（只读保护 SQL 脚本）
   - F:\hse-dashboard\docs\TRAE-Step9-只读保护与巡检部署.md（开发环境验证报告）
   - F:\hse-dashboard\docs\Sprint-C-v1.0\03_Governance\Legacy_Table_Lifecycle_Report.md（旧表生命周期评估）
   - F:\hse-dashboard\docs\Sprint-C-v1.0\01_Audit\Legacy_Model_Usage_Report.md（旧模型使用审计）
   - F:\hse-dashboard\docs\Sprint-C-v1.0\01_Audit\Employee_API_Model_Migration_Report.md（API 迁移审计）
   - F:\hse-dashboard\docs\Sprint-C-Phase1-API-Convergence-Report.md（API 收敛阶段报告，如果存在）
   - F:\hse-dashboard\docs\Sprint-C-v1.0\04_Report\Sprint-C-v1.0-Final-Report.md（Sprint-C 最终报告）

2. 审计只读保护 SQL 脚本：
   - 检查 Step 0（前置检查）逻辑是否完整
   - 检查 Step 1（触发器创建）语法是否正确
   - 检查 Step 3（验证测试）覆盖是否充分（SELECT/INSERT/UPDATE/DELETE）
   - 检查 Step 4（回滚脚本）是否可用
   - 检查 hse_employee_relation 可选保护（Step 2 注释部分）是否需要在本次一并执行
   - 对比 TRAE-Step9 开发环境验证结果，确认 SQL 在逻辑上是可行的

3. 审计 API 收敛前置条件：
   - 从 Legacy_Model_Usage_Report 和 API_Migration_Report 中提取 hse_employee_org 的 7 处写入操作清单
   - 确认哪些已迁移至 employee_assignment、哪些仍未迁移
   - 评估如果 API 收敛未完成就执行只读保护的风险（生产功能是否会中断）

4. 生成就绪状态矩阵：
   | 就绪条件 | 当前状态 | 阻塞项 | 归属 |
   |----------|----------|--------|------|
   | SQL 脚本正确性 | 待审计 | — | 本次 |
   | 开发环境验证 | 已完成（TRAE-Step9）| — | — |
   | 生产环境前置检查（Step 0）| 待 API 收敛后执行 | API 收敛 | 后端 |
   | API 收敛（7 处写入迁移）| 待确认 | 后端开发 | 后端 |
   | hse_employee_relation 同步保护 | 待决策 | 业务确认 | 业务/DBA |
   | 回滚脚本就绪 | 待审计 | — | 本次 |

5. 生成执行清单（API 收敛完成后的步骤序列）：
   - 按顺序列出从"API 收敛确认"→"只读保护执行"→"验证"→"回滚准备"的完整步骤
   - 每步标注负责角色、前置条件、验证方法

输出格式：
- 生成 Markdown 文档，保存到 F:\hse-dashboard\docs\P1-4-hse_employee_org只读保护就绪审计报告.md
- 文档结构：
  - 执行摘要（就绪状态一览）
  - SQL 脚本审计（正确性/完整性/验证覆盖）
  - API 收敛前置条件审计（7 处写入操作现状）
  - 就绪状态矩阵（已完成 vs 待完成 vs 阻塞）
  - 差距分析（什么阻止了立即执行）
  - 执行清单（API 收敛完成后的步骤序列）
  - 风险评估（提前执行的风险 / 延迟执行的风险）
  - 遗留待办

禁止事项：
- 禁止修改代码、SQL、路由、接口、配置
- 禁止执行任何 SQL（包括开发环境、测试环境、生产环境）
- 禁止修改只读保护 SQL 脚本内容（仅审计，不编辑）
- 禁止修改 TRAE-Step9 或其他已有文档
- 禁止代签任何角色
- 所有审计结论必须引用源文档具体位置，不得凭空断言
```

---

## 提示词 9：P2-1 — 旧审计报告状态回写（P1-4 发现 G1）

**状态**：✅ 已完成（文件：`P2-1-旧审计报告状态回写报告.md`）

**审核结论**：操作精准合规，通过验证。关键发现：
- 3 份文档均正确追加「Phase1 收敛后状态更新」小节，原审计内容零删除
- 7 处写入 → 0 处、P0 阻断 → 已解除、❌未迁移 → ✅已迁移，三条更新全部到位
- 所有更新标注引用来源（P1-4 §三 + Phase1 报告），🔒 禁止代签注记嵌入小节
- Legacy_Model_Usage_Report 额外追加 §5.1 前向指针，消除深层矛盾
- 诚实标注了不在范围内的残留：Final-Report.md L71 仍含"7 处写入"、Lifecycle §3.1/§四/§6.3 仍有陈旧表述

**验证结果**：Grep 确认 3 份文档原内容（L53/L150-159/L241）保留，更新小节（L71-85/L161-174/L246-259）与报告一致，矛盾已消除。

```
任务：回写 3 份旧审计报告中的 API 收敛状态，消除与代码实况的矛盾

背景：
P1-4 就绪审计发现关键矛盾（F1）：当前代码中 hse-employee.js 对 hse_employee_org 的写入已清零（Grep 确认 0 处 INSERT/UPDATE/DELETE），Phase1 报告已声明"写入风险清除"。但以下 3 份旧审计报告仍称"7 处写入未迁移"，这些报告均为 Phase1 收敛前的快照，与代码事实不符：

1. Legacy_Table_Lifecycle_Report §2.2：hse_employee_org 状态标为"使用中"，写入操作标为"7 处生产写入"
2. Legacy_Model_Usage_Report §4.1：列出 7 处 P0 级写操作（行 90-101），标注为"P0 阻断"
3. Employee_API_Model_Migration_Report §7.1：hse-employee.js 写操作标为"❌ 未迁移，7 处 P0"

如果不回写，这些过时声明会持续造成判断混乱——P1-4 任务背景本身就是基于旧报告的错误前提编写的。

本次任务需要：
1. 对 3 份文档进行状态回写，在相关位置添加"Phase1 收敛后状态更新"小节
2. 不删除原有审计内容（保留为历史快照），仅追加更新说明
3. 确保回写后文档自洽——不再出现"7 处写入未迁移"与"Phase1 已完成"的矛盾

要求：
1. 读取以下文档，理解当前状态和需要回写的位置：
   - F:\hse-dashboard\docs\Sprint-C-v1.0\03_Governance\Legacy_Table_Lifecycle_Report.md
   - F:\hse-dashboard\docs\Sprint-C-v1.0\01_Audit\Legacy_Model_Usage_Report.md
   - F:\hse-dashboard\docs\Sprint-C-v1.0\01_Audit\Employee_API_Model_Migration_Report.md
   - F:\hse-dashboard\docs\Sprint-C-Phase1-API-Convergence-Report.md（作为回写依据）
   - F:\hse-dashboard\docs\P1-4-hse_employee_org只读保护就绪审计报告.md（作为审计证据）

2. 对每份文档执行以下操作：

### Legacy_Table_Lifecycle_Report.md
- 在 §2.2 hse_employee_org 小节末尾添加「Phase1 收敛后状态更新」:
  - 写入操作：7 处 → 0 处（Phase1 已收敛，代码 Grep 确认）
  - 当前状态：使用中 → 已收敛，待只读保护执行
  - 生命周期阶段：迁移 → 已完成（勾选 ☑）
  - 引用来源：P1-4 审计报告 §三 + Phase1 报告 §一
- 保留原有 §2.2 表格不变（作为收敛前历史快照）
- 签字栏保持空白，加注"🔒 禁止代签"

### Legacy_Model_Usage_Report.md
- 在 §4.1 阻断项列表后添加「Phase1 收敛后状态更新」：
  - 7 处 P0 写操作（#1~#7）→ 全部清零（Phase1 收敛完成）
  - 8~10（hse_employee_relation 历史脚本）→ 非生产路由，不受影响
  - P0 阻断状态：已解除
  - 引用来源：P1-4 审计报告 §三 + 代码 Grep 实证
- 保留原有 §4.1 表格不变（作为收敛前审计快照）
- 签字栏保持空白，加注"🔒 禁止代签"

### Employee_API_Model_Migration_Report.md
- 在 §7.1 后添加「Phase1 收敛后状态更新」：
  - hse-employee.js 写操作：❌ 未迁移 → ✅ 已迁移（Phase1 收敛完成）
  - 引用来源：P1-4 审计报告 §三 + 代码 Grep 实证
- 保留原有 §7.1 内容不变
- 签字栏保持空白，加注"🔒 禁止代签"

3. 验证回写后的文档自洽性：
   - 检查 3 份文档中不再出现"7 处写入未迁移"与"Phase1 已完成"的直接矛盾
   - 确认所有更新均标注"Phase1 收敛后状态更新"和引用来源
   - 确认原有审计内容未删除

输出格式：
- 生成 Markdown 文档，保存到 F:\hse-dashboard\docs\P2-1-旧审计报告状态回写报告.md
- 文档结构：
  - 执行摘要（3 份文档回写状态一览）
  - Legacy_Table_Lifecycle_Report 回写详情
  - Legacy_Model_Usage_Report 回写详情
  - Employee_API_Model_Migration_Report 回写详情
  - 自洽性验证（矛盾消除确认）
  - 遗留待办

禁止事项：
- 禁止修改代码、路由、接口、配置、SQL
- 禁止删除原有审计内容（仅追加更新，不删除历史快照）
- 禁止代签任何角色
- 禁止修改 Phase1 报告或其他已有文档
- 所有回写必须标注引用来源（P1-4 审计报告或 Phase1 报告具体位置）

---

## 提示词 10：P2-2 — 残余陈旧表述清理与报告参数统一

**状态**：✅ 已完成（文件：`P2-2-残余陈旧表述清理报告.md`）

**审核结论**：操作精准合规，通过验证。关键发现：
- Final-Report 8 处 + Lifecycle 3 处 = 11 处更新全部到位，Grep 确认
- 原内容零删除：L78「7 处生产写入」、L97「7 处 P0」、L176-177「⏳ 进行中/待执行」、L259「仍在生产写入」全部保留为快照
- Lifecycle 全线自洽：§2.2（P2-1）→ §3.1 → §四 → §6.3 不再出现「已完成」与「进行中」矛盾
- 11 处更新均嵌入 🔒 禁止代签注记，引用来源齐备
- 报告附录记录了编辑竞态及修复过程，透明可信

**验证结果**：Grep 确认 Final-Report 8 处更新（L21/L81/L101/L180/L194/L227/L261/L277）、Lifecycle 3 处更新（L121/L157/L214），原内容保留确认，红线全部遵守。

---
## 提示词 11：P2-3 — 人员联系信息模板统一与缺口标注

**状态**：✅ 已完成（文件：`P2-3-人员联系信息模板统一报告.md`）

**审核结论**：操作精准合规，通过验证。关键发现：
- 4 份文档联系人表全部统一为 5 角色标准模板，姓名/电话列全部空白（Grep 确认无虚构数据）
- ⚠️ 待填写提示 + 🔒 禁止代签注记 4 份文档全部到位
- Pre-Readiness §5.3 和 Pre-Closure §4.3 改为指针指向合并表，原 6→5 角色调整有决策说明
- Pre-Closure §4.4 补齐了此前缺失的禁止代签注记（P1-1 遗留缺口）
- 诚实标注了 3 处不在范围内的残留不一致：README §人员到位清单仍含 QA 负责人（6 角色）、Pre-Readiness §3.2/Pre-Closure §2.2 签字表仍用缩写名

**验证结果**：Grep 核对 4 份文档，联系人表统一格式确认，姓名/电话列全空确认，禁止代签注记确认。README §人员到位清单（L120-126）仍含 6 角色（含 QA 负责人），与联系人表 5 角色存在轻度不一致，但属联系人表以外内容，红线禁止修改，已在报告中如实标注。

---
## 提示词 12：P3-1 — 治理阶段收尾：跨文档一致性终审与执行就绪仪表板

**状态**：✅ 已完成（文件：`P3-1-治理收尾与执行就绪仪表板.md`）

**审核结论**：报告质量极高，全量扫描覆盖 65 份文档，通过验证。关键发现：
- 核心数字全线一致：1,304（无误标为生产基线）、0 写入（无「7 vs 0」矛盾）、19 签字点（声明一致）
- 状态口径全线一致：API 收敛 ✅ / 只读保护 ⏳ / 签字门控 🔴 / 禁止代签 100% 覆盖
- 文档间引用全部有效：Phase1 报告 §一/§三/§四/§十 均真实存在
- 5 项残余矛盾均为历史快照且已显式标注，11 轮治理操作未引入任何新增矛盾
- 执行就绪仪表板：12 已完成 → 7 待执行 → 4 阻塞，过渡路径图清晰

**验证结果**：P3-1 报告本身为纯审计产物（未修改任何文档），所有结论均引用源文档具体位置，Grep 交叉验证确认无误。

---
## 提示词 13：P3-2 — 项目负责人执行前简报

**状态**：✅ 已完成（文件：`P3-2-项目负责人执行前简报.md`）

**审核结论**：简报质量极高，可直接交付项目负责人使用。关键发现：
- T-24h 行动清单（3 项门控）逐项可勾选，位置引用精确到章节标题
- 19 个签字点按文档归集完整，与 P0-4 清单 100% 一致（10 文档 × 19 点，逐项核验通过）
- T-0 执行速查卡步骤清晰，包含关键验证点（如真实行 ID 阻断测试）
- 8 场景快速索引覆盖所有常见问题，文档路径均经核验存在
- 红线提醒贯穿全程，强调禁止代签/禁止沿用 3,156/禁止跳过 Step 0

**验证结果**：Grep 确认 19 签字点分布与 P0-4 清单完全一致；4 份联系人表位置引用准确（README L156、Timeline L277、Pre-Readiness L193、Pre-Closure §4.3）；Runbook-Final 确在 docs 根目录；两份 SQL 路径存在（hse_employee_org_ReadOnly_Change.sql + Employee_Model_Check.sql）。生产包 7 文件 23 处「禁止代签」注记覆盖率 100%。简报语言简洁可操作，符合非技术角色需求。

> 详细任务内容见独立提示词文件：`F:\hse-dashboard\docs\提示词-13-P3-2-项目负责人执行前简报.md`

---

## 提示词 14：P3-3 — 签字缺口补注与执行前最终检查

**状态**：✅ 已完成（文件：`P3-3-执行前最终检查报告.md`）

**审核结论**：报告质量极高，审计全面精准，通过交叉验证。关键发现：
- 4 项门控全部可操作（19 签字点文档/位置/角色/影响 100% 明确，4 份联系人表模板一致，Step 0 路径+红线就绪，维护窗口 4 项通知可勾选）
- 19 签字点「禁止代签」注记覆盖率 100%（19/19），经全量 Grep + 5 份深度抽样核验，P1-1 补齐的 7 处完好未被覆盖
- 4 份联系人表模板一致（5 角色统一、注记齐全、全空待填），设计内差异（到位时间列）已说明
- 8 场景文档 + 2 份 SQL + Runbook + 回滚脚本全部可定位（10/10），3 处路径偏差已校正
- 重要发现：只读保护存在「双机制」表述（Runbook §十 REVOKE vs 触发器 SQL 的 BEFORE TRIGGER），执行前需明确采用其一或互补
- 重要发现：SQL 自检 `WHERE id=0` 存在「误通过」陷阱（BEFORE ROW 触发器在 id=0 不存在时不触发），执行时须用真实行 ID 验证

**验证结果**：Grep 逐份核验 10 份签字文档注记（Pre-Closure 7 处/Pre-Readiness 8 处/Change-Approval 2 处/Migration-Checklist 1 处/Go-NoGo 1 处/DryRun-R2 1 处/Ready-Report 1 处/Status-Mapping 4 处/Constraint-Check 4 处/Baseline-Fix 3 处），100% 覆盖。Glob 核验 3 处路径校正均确认（Go-NoGo 在 docs 根目录、Change-Approval 在 05_Approval、Step0 文件名无 v2.1- 前缀）。Runbook-Final L1132 与 SQL L68/74/80 双机制确认，SQL L153/165 WHERE id=0 确认。

> 详细任务内容见独立提示词文件：`F:\hse-dashboard\docs\提示词-14-P3-3-执行前最终检查.md`

---

## 提示词 15：P4-1 — 只读保护双机制决策与 SQL 自检修复建议

**状态**：✅ 已完成（文件：`P4-1-只读保护双机制决策与SQL修复建议.md`）

**审核结论**：报告质量极高，技术分析深度到位，决策建议可执行。关键发现：
- 9 维度优劣矩阵全面且客观，每个维度均引用源文档行号（Runbook L1162、SQL L68/74/80、TRAE-Step9 L105-147）
- 推荐方案 C（互补：触发器为主 + REVOKE 兜底）理由充分：触发器已验证且覆盖 superuser，REVOKE 提供纵深防御
- 冲突风险分析精准：正确识别「先 REVOKE 后触发器」会导致验证不可判定，执行顺序（先触发器→验证→再 REVOKE）逻辑自洽
- WHERE id=0 误通过链路完整拆解（5 步伪代码），方案 A（真实行 ID）与 TRAE-Step9 实践一致
- 修复后 SQL 片段可直接替换使用，Step 3.2（INSERT）正确识别为无需修复
- 重要发现 R3：互补方案回滚必须两步都做（DROP TRIGGER + GRANT），Runbook §11.2 仅含 GRANT 不含 DROP TRIGGER，属已知回滚缺口
- 决策卡 5 区完整（方案选择/执行顺序/修复确认/回滚准备/DBA 签认），DBA 可逐项勾选

**验证结果**：TRAE-Step9 L133-134 确认开发环境使用 `WHERE id = 1`（真实 ID），L136 记录了 `id=0` 不触发陷阱；Runbook L1211 确认 GRANT 回滚语句；P1-4 L72 确认陷阱前置警告。报告中所有行号引用与源文档一致，修复 SQL 片段语法正确。

> 详细任务内容见独立提示词文件：`F:\hse-dashboard\docs\提示词-15-P4-1-只读保护双机制决策.md`

---

## 提示词 16：P4-2 — 生产执行交接包（治理→执行最终交付）

**状态**：✅ 已完成（文件：`P4-2-生产执行交接包.md`）

**审核结论**：交接包质量极高，自包含设计完美实现，可直接交付 DBA 和项目负责人使用。关键发现：
- 自包含原则贯彻到位：全文无"见 Px-x 报告"引用，10 个章节全部直接呈现内容
- 19 签字点路线图完整覆盖 10 文档（含 5 个 DEPRECATED 标注），路径全部经 P3-3 校正
- 只读保护决策卡 5 区完整（方案选择/执行顺序/修复 SQL/回滚准备/DBA 签认），修复 SQL 片段可直接替换使用
- 4 门控检查清单含详细说明子节，负责角色/截止时间/解除条件明确
- 路径校正表覆盖 4 个关键误标，索引表扩展至 10 场景
- 交接签收区 4 角色（治理/项目负责人/DBA/迁移负责人），合规（AI 治理代理不代签业务角色）
- T-0 速查卡 + 残余风险表完整，冗余度低，一页可通览

**验证结果**：Ready-Report §八 签字区确认存在，Pre-Closure §4.4 应急联系人表格确认存在，治理阶段关闭声明在 P3-3 已正式发布。签字路线图 19 点与 P0-4 清单逐项核对一致，路径校正 4 项与 P3-3 一致。

> 详细任务内容见独立提示词文件：`F:\hse-dashboard\docs\提示词-16-P4-2-生产执行交接包.md`

---

## 提示词 17：P5-1 — Sprint-B-C 治理收尾总结

**状态**：✅ 已完成（文件：`P5-1-Sprint-B-C治理收尾总结.md`）

**审核结论**：总结质量极高，结构清晰完整，计数准确，可作为治理阶段的正式收官文档。关键发现：
- 诚实纠正了规划口径的计数偏差（原标"15 轮"→ 实际 16 轮，P0-4 产出 2 份文档 → 共 17 份 Px-x 文档），计数说明嵌入文档开头，透明可信
- 治理前→治理后对比表 8 行，每行均引用跨文档综合分析报告（基线）和具体治理轮次（现状），对比维度完整
- 16 轮回顾表关键发现与提示词序列审核结论一致，日期精确到日
- 关键数字 12 项统计完整，8 处注记补齐（P1-1 补 7 + P2-3 补 1）统计准确
- 10 维度成果每维度含治理前→治理后对比，逻辑清晰
- 遗留事项三分类（门控阻塞/残余风险/文档修订待办）层次分明，后续建议 5 步按优先级排序
- 交付物清单 20 行，含治理前基线文档路径，追溯完整
- 治理阶段关闭声明正确引用 P3-3 §八

**验证结果**：提示词序列确为 17 条（提示词 1~17），P0-4 产出 2 份文档，7 项 ACT 整改项与治理覆盖范围完全吻合。跨文档分析报告基线确认存在。17 份 Px-x 文档计数经逐项核验一致。

> 详细任务内容见独立提示词文件：`F:\hse-dashboard\docs\提示词-17-P5-1-治理收尾总结.md`

---

## 提示词 18：P5-2 — 治理序列闭卷：ACT 整改对照与最终确认

**状态**：✅ 已完成（文件：`P5-2-治理序列闭卷-ACT对照确认.md`）

**审核结论**：闭卷文档质量极高，ACT 对照完整准确，标志治理序列正式结束。关键发现：
- 7 项 ACT 整改项 100% 覆盖（7/7），5 项完全解决，2 项治理层面解决（残余在人工/执行阶段）
- ACT 原始描述与《整改行动计划》原文完全一致，覆盖轮次与提示词序列审核结论一一对应
- 闭卷声明明确：文档治理阶段已完成，所有产出物已归档，后续转入执行阶段
- 残余事项分类清晰：4 项人工门控（签字/联系人/实测/窗口）+ 1 项文档修订待办（Runbook 双机制同步）

**验证结果**：Grep 确认 7 项 ACT 全部存在于《整改行动计划》；16 轮覆盖轮次与提示词序列逐一核对一致；闭卷声明符合 P3-3 治理关闭条件。文档未修改任何源文件，符合红线要求。

> 详细任务内容见独立提示词文件：`F:\hse-dashboard\docs\提示词-18-P5-2-治理序列闭卷.md`

---

## 提示词 19：P6-1 — 执行阶段启动：就绪确认与门控推进计划

**状态**：✅ 已完成（文件：`P6-1-执行阶段就绪确认与门控推进计划.md` + 门控确认：`P6-1-门控确认与生产放行.md`）

**审核结论**：报告质量高，结构完整，逐项验证通过。关键发现：
- 9 维度就绪确认矩阵准确：5✅ + 4🔴，与源文档一致
- 19 签字点按 6 角色归集清晰，DEPRECATED 5 处标注正确
- 13 项 Step 0 强制检查与 Runbook 一致，关键阻断项标注明确
- 5 项风险提示含触发条件+应对措施，完整
- 发现预存路径问题：Production-Ready-Report 实际在 `Production-Package/`，P4-2 误标为 `docs/`（P6-1 使用正确路径）
- 4 项门控已由项目负责人授权 AI 治理审计确认闭环（P6-1-门控确认与生产放行.md）

**验证结果**：19 签字点与 P0-4 清单逐项核对一致；5 角色名与 P2-3 一致；13 项 Step 0 与 Runbook 一致；路径与 P3-3 和 Production-Package README 一致。

> 详细任务内容见独立提示词文件：`F:\hse-dashboard\docs\提示词-19-P6-1-执行阶段启动与门控推进.md`

---

## 提示词 20：P6-2 — T-0 执行前最终环境检查与准备清单

**状态**：✅ 已完成（文件：`P6-2-T0执行前环境检查与准备清单.md`）

**审核结论**：报告质量高，SQL 文件清单与实际 LS 输出完全一致。关键发现：
- 8 个 SQL 脚本全部就位（目录 A 6 个 + 目录 B 2 个），文件名与 LS 一致
- 2 个执行模板（Step0 / B-2）就位，数据来源标注完整
- 回滚缺口精准识别：只读保护回滚（DROP TRIGGER × 3 + DROP FUNCTION）在 SQL 中为注释形式；方案 C 的 GRANT 恢复全文档缺失
- T-0 步骤速查卡与 Runbook 一致，每步含耗时/角色/通过标准/失败处理
- 5 项阻断与 P4-1/P4-2 完全一致

**验证结果**：Production-Package/02_SQL/ LS 输出 6 文件与报告一致；Sprint-C-v1.0/02_SQL/ LS 输出 2 文件与报告一致；回滚缺口与 P4-1 R3 一致。

> 详细任务内容见独立提示词文件：`F:\hse-dashboard\docs\提示词-20-P6-2-T0执行准备与环境检查.md`

---

## 提示词 21：P6-3 — T-0 执行追踪表

**状态**：✅ 已完成（文件：`P6-3-T0执行追踪表.md`）

**审核结论**：报告质量极高，35 步追踪表完整覆盖 T-0 全流程，是 DBA 现场操作的理想工具。关键发现：
- 8 阶段 35 步（S1-S35）完整覆盖维护窗口进入→Step 0 13 项→B-0→B-1→B-2→只读保护→验证→窗口退出
- P0 阻断项精准标注（S10 uk 缺失/S13 her 偏差>5%/S15 baseline NULL）
- 只读保护执行顺序正确（S27-S28 先触发器→再 S29-S30 REVOKE），标注不可颠倒
- 异常决策树覆盖 4 分支（P0 阻断/非 P0/B-2 FAIL/只读保护 FAIL/回滚）
- 回滚快速参考卡 5 场景，回滚缺口标注与 P6-2 一致
- 关键数据速查 14 项，含 uk_emp_assign_primary 索引谓词、只读保护函数名、3 触发器名
- 总预估耗时 95 分钟，远在维护窗口 3h10m 内

**验证结果**：35 步与 Runbook §四/§五/§六/§十 对应一致；SQL 文件名与 P6-2 LS 输出一致；P0 阻断项与 Runbook 和 project_memory 约束一致。

> 详细任务内容见独立提示词文件：`F:\hse-dashboard\docs\提示词-21-P6-3-T0执行追踪表.md`

---

## 提示词 22：P6-4 — Sprint-B-C 最终交付与归档清单

**状态**：✅ 已完成（文件：`P6-4-Sprint-B-C最终交付与归档清单.md`）

**审核结论**：报告质量极高，全量交付物清单经 Glob/LS 实际核验，计数偏差透明标注。关键发现：
- 治理 Px-x 文档 19 份（规划 17 份），执行过渡 Px-x 文档 5 份，独立提示词 15 份（规划 17 份）
- T-0 执行速查索引 10 场景，路径全部可验证
- 残余事项 7 项（P1 4 项/P2 3 项），优先级明确
- 归档声明准确：22 轮操作，7 ACT 100% 覆盖，4 门控闭环
- 一页纸核对表 12 项，覆盖窗口/门控/SQL/追踪表/关键数据/应急联系人

**验证结果**：Glob 核验 Px-x 文档 24 份，提示词文件 15 份；路径索引与实际一致；残余事项与 P4-1/P5-1/P6-2/P6-3 完全一致。

**依赖**：P6-3 T-0 执行追踪表完成（35 步追踪、8 阶段、回滚参考卡、关键数据速查）

**目标**：Sprint-B-C 全序列的最终交付与归档。这是整个序列的最后一份文档，将全部交付物归档、生成最终索引、给出完整交接清单，供 DBA 和项目负责人在 T-0 执行时直接使用。纯归档整理，不执行任何 SQL。

**关键要求**：
- 生成全量交付物清单（按阶段分类：治理 17 份报告 + 执行过渡 4 份 + 生产包 8 个 SQL + 2 个模板）
- 生成 T-0 执行速查索引（10 场景 → 文档映射，DBA 快速定位）
- 生成残余事项清单（7 项执行后待办，含优先级/负责角色）
- 生成 Sprint-B-C 最终归档声明（21 轮 / 7 ACT / 4 门控 / 全序列完成）
- 生成 T-0 执行前最终核对表（一页纸，10 项勾选）
- 所有文件名必须通过 Glob/LS 确认实际存在
- 禁止执行任何 SQL，禁止修改任何文件

> 详细任务内容见独立提示词文件：`F:\hse-dashboard\docs\提示词-22-P6-4-最终交付与归档.md`

---

# Sprint-Q 消费层提示词序列

> 创建日期：2026-07-29
> 前置条件：Sprint-B-C 治理序列闭卷（P6-4 归档完成），基础层（employee_assignment 统一模型 + API 收敛 + 旧表只读保护）就绪
> 愿景：以花名册为基石打通各模块交互——花名册导入后，花名册信息作为各模块的基础，打通各模块的标准，为各模块之间提供交互
> 约束：同 Sprint-B-C（不修改代码、不动 vben 组件、不自定义仅使用 vben 组件、目标路径 F:\hse-dashboard\安全看板vben）

## Sprint-Q 路线图总览

```
Sprint-Q 消费层（6 轮，Q1→Q6）

Phase 1: 审计（1 轮）
  Q1: 跨模块员工数据消费现状深度审计        ← 建立基线，识别缺口

Phase 2: 设计（1 轮）
  Q2: 消费层跨模块交互标准设计              ← 基于 Q1 基线，制定标准

Phase 3: 实现（3 轮）
  Q3: 公共 Composable 实现                   ← useEmployeeData / useEmployeeEvent / useEmployeeLink / useEmployeeSearch
  Q4: EmployeeSelector 增强与统一            ← 按 Q2 设计增强 EmployeeSelector
  Q5: 模块间联动事件系统实现                 ← 事件订阅/发布 + 模块依赖声明落地

Phase 4: 验证（1 轮）
  Q6: 消费层集成验证与收尾                   ← 全模块回归 + 消费层终态报告
```

---

## 提示词 23：Q1 — 跨模块员工数据消费现状深度审计

**状态**：✅ 已完成（文件：`Q1-跨模块员工数据消费现状审计.md`）

**审核结论**：报告质量极高，18 模块全覆盖，代码引用精准。关键发现：
- P0 级缺口 6 项：hazards 姓名失效（返回 `员工${id}`）、标识符命名分裂、4 模块脱钩主数据（accidents/emergency/objectives/insurance）、cockpit 端点分叉+死代码+联动断链、删除员工无引用校验、状态枚举不一致
- P1 级缺口 3 项：姓名→档案跳转缺失、调岗/离职无联动、风险看板未过滤离职人员
- P2 级缺口 4 项：training 误用 EmployeeSelector props、快照普遍、重复人员台账、死代码
- 模块依赖关系图清晰（直接依赖 5 模块、间接依赖 5 模块、脱钩 7 模块）
- 基础事实确认：`getEmployeeDetail` 全仓零调用、无 `getEmployeesByIds`、主档案 UI 无入口

**验证结果**：抽样 Grep 确认 hazards `getEmployeeName` 返回 `员工${id}`（L1402-1405）、training/requirements/plans 误用 `v-model:employee-id`/`mode="position"`、accidents `handler` 纯文本、cockpit 裸调 `/overview/*` 端点。全部引用的代码行号与文件路径与实际一致。

**依赖**：Sprint-B-C 治理序列闭卷（P6-4 归档完成），基础层（employee_assignment 统一模型 + API 收敛）就绪

**新阶段**：消费层（Sprint-Q）——以花名册为基石打通各模块交互

**目标**：审计各模块对员工数据的消费现状，生成消费层设计基线。纯审计，不修改任何代码。

**关键要求**：
- 审计 18 个核心模块（三违/隐患/培训/事故/应急等）
- 4 维度审计：使用方式/数据一致性/模块联动/API 模式
- 生成模块×维度矩阵（18×4），评分（✅/⚠️/❌/—）
- 识别 P0/P1/P2 级缺口（数据不一致/交互缺失/代码重复）
- 生成模块依赖关系图（以花名册为中心）
- 提出消费层设计建议（优先级排序 + 推荐方案）
- 所有结论必须引用具体代码位置（文件名+行号）

> 详细任务内容见独立提示词文件：`F:\hse-dashboard\docs\提示词-23-Q1-跨模块员工数据消费现状审计.md`

---

## 提示词 24：Q2 — 消费层跨模块交互标准设计

**状态**：✅ 已完成（文件：`Q2-消费层跨模块交互标准设计.md`）

**审核结论**：报告质量极高，设计严谨完整，与 Q1 审计发现逐条映射。关键亮点：
- §1.2 将 Q1 的 13 项缺口（P0×6 + P1×3 + P2×4）逐一映射到设计章节，无遗漏
- 事件体系 4 类事件含完整 TypeScript 类型定义、幂等性保证、版本管理策略
- 4 个 Composable 接口签名完整、参数/返回值/缓存策略明确
- EmployeeSelector 增强方案含向后兼容 + 迁移指南（旧用法→新用法对照表）
- 实施路线图 Phase 1/2/3 按 Q1 P0/P1/P2 分级，每阶段含任务清单/涉及文件/验收标准/风险点
- 风险清单 7 项（R1~R7），每项含缓解措施

**验证结果**：Q2 所有设计章节均引用 Q1 具体代码位置（如 §3.1 引用 `hazards/index.vue:1402-1405`、§3.4 引用 `targets.vue:130-134`、§4.1 引用 `requirements:98-100`），无凭空设计。

**依赖**：Q1 审计完成（`Q1-跨模块员工数据消费现状审计.md`）

**目标**：基于 Q1 审计基线，设计消费层跨模块交互标准体系。纯设计，不修改任何代码。

**关键要求**：
- 设计跨模块事件体系（EMPLOYEE_TRANSFERRED / RESIGNED / STATUS_CHANGED / INFO_UPDATED）
- 设计 4 个公共 Composable 接口规范（useEmployeeData / useEmployeeEvent / useEmployeeLink / useEmployeeSearch）
- 设计 EmployeeSelector 增强方案（统一 props / 搜索增强 / 批量选择 / 向后兼容）
- 设计 API 规范标准（查询接口 / 批量查询 / 统计接口 / 响应格式统一）
- 设计模块间数据依赖声明规范（employee-deps.json）
- 制定优先级排序的实施路线图（Phase 1 P0 / Phase 2 P1 / Phase 3 P2）
- 所有设计必须基于 Q1 审计实际发现，不得凭空设计

> 详细任务内容见独立提示词文件：`F:\hse-dashboard\docs\提示词-24-Q2-消费层跨模块交互标准设计.md`

---

## 提示词 25：Q3 — 公共 Composable 实现

**状态**：✅ 已完成（文件：`Q3-公共Composable实现报告.md`）

**审核结论**：代码质量高，10 文件 671 行，接口签名与 Q2 设计完全一致，12 用例全部通过。关键发现：
- 4 个 Composable 严格按 Q2 TypeScript 接口实现，signature 零偏差
- `useEmployeeData` 兜底 API 智能选择：因 `getEmployeeList` 不支持 `employeeIds` 参数，改用 `getEmployeeSelectorBatch`（真实可用），并标注 TODO 待批量端点
- `useEmployeeEvent` 进程内事件总线含幂等去重（`type+employeeId+occurredAt`）+ 自动清理防内存泄漏
- `useEmployeeLink` 的 `EmployeeName` 组件：`<a>` + Tooltip 卡片 + loading 省略号，R5 路径标注 TODO
- `useEmployeeSearch` 防抖 300ms + 单选/多选 + `filterStatus` 坦白标注「当前 API 不支持」
- `useEmployeeSelectorAdapter` 桥接映射表基于真实组件 props/emits 核验，`change` 事件回写完整 `SelectorItem`
- 类型体系完整：`EmployeeInfo`（camelCase 统一）+ `EmployeeEventEnvelope` + 4 种载荷类型 + `mapSelectorToInfo` 映射

**验证结果**：Glob 确认 10 文件全部存在；Grep 确认 `getEmployeeSelectorBatch` 兜底调用正确；代码审查确认 `useEmployeeData.ts` 缓存逻辑正确、`useEmployeeLink.ts` Tooltip+`<a>` 实现正确、`types.ts` 类型定义与 Q2 §5.1 一致。无任何已有文件被修改。

**目标**：按 Q2 设计的接口规范，实现 4 个公共 Composable（useEmployeeData / useEmployeeEvent / useEmployeeLink / useEmployeeSearch），创建统一类型定义与 EmployeeSelector 桥接适配器，编写单元测试。首次修改代码，仅新建文件，不修改任何已有模块。

**关键要求**：
- 在 `src/composables/hse/` 下新建 7 个源文件 + 3 个测试文件
- 严格按 Q2 TypeScript 接口实现，signature 必须一致
- `useEmployeeData` 缓存 + 兜底 API（`getEmployeesByIds` 未实现时用 `getEmployeeSelectorBatch`）
- `useEmployeeEvent` 进程内发布/订阅 + 幂等去重 + 预留 `publish` 私有方法
- `useEmployeeLink` 跳转风险画像 + `EmployeeName` 可点击组件（Tooltip 卡片）
- `useEmployeeSearch` 防抖 300ms + 单选/多选 + 部门/状态过滤
- 适配桥接器映射 EmployeeSelector 现有 props/emits
- 单元测试通过 `npx vitest run composables/hse/`

> 详细任务内容见独立提示词文件：`F:\hse-dashboard\docs\提示词-25-Q3-公共Composable实现.md`

---

## 提示词 26：Q4 — EmployeeSelector 增强与统一

**状态**：✅ 已完成（文件：`Q4-EmployeeSelector增强报告.md`）

**审核结论**：代码实现与报告一致，8 项验证全部通过。关键发现：
- EmployeeSelector 新增 4 个 props（filterStatus/pasteEmployeeCodes/showErrorState/debounceMs）+ 1 个 emit（error），全部 optional，向后兼容
- 模板增强：Alert 错误态、Empty 无结果、tagRender 头像首字母、Input.TextArea 批量粘贴、下拉搜索提示
- 误用修复 5 项精准到位：training/requirements/plans 的 v-model:employee-id 误用→v-model:value、hazards checker/fixer 纯文本→选择器、hazards 详情姓名 EmployeeName 替代 getEmployeeName、accidents/emergency 兼容过渡
- 6 个现有模块回归零破坏（violations/hazards-finderId/training-ledger/training-execute/goals/insurance-over-age）
- 已知局限 5 项诚实标注：filterStatus 需后端支持、批量粘贴仅数字 ID、新 *Id 字段为兼容过渡、accidents 无编辑表单、EmployeeName 跳转路径待补

**验证结果**：经 Grep 核对 7 个修改文件，所有代码变更与报告声明一致，红线全部遵守。

---

## 提示词 27：Q5 — 模块间联动事件系统实现

**状态**：✅ 已完成（文件：`Q5-模块间联动事件系统报告.md`）

**审核结论**：代码实现与报告一致，8 项验证全部通过。关键发现：
- 8/8 模块 employee-deps.json 全部创建，字段名严格使用 Q2 §6.1 枚举，零自由文本键
- `node scripts/validate-employee-deps.mjs` 退出码 0，4 层校验（扫描/JSON Schema/完整性/一致性）全部通过
- useEmployeeData 事件驱动缓存刷新：EMPLOYEE_* 事件 → 命中缓存即失效 + 当前展示员工触发 refresh，try/catch 隔离 + onUnmounted 清理
- violations 订阅示例：EMPLOYEE_TRANSFERRED/EMPLOYEE_RESIGNED → fetchData() 刷新列表，onUnmounted 取消订阅
- assessment-monthly 路径纠正：提示词假设 `src/views/assessment-monthly/` 不存在，实际为 `src/views/hse/assessment-monthly/`，报告主动标注偏差并纠正，校验脚本采用递归扫描兼容嵌套模块
- 已知局限 4 项诚实标注：后端事件未发布（R6）、getEmployeesByIds 未落地、assessment-monthly 路径纠正、既有类型错误不在本次范围

**验证结果**：经 Glob 确认 8 个 deps.json 文件、Grep 确认 useEmployeeData 事件集成 + violations 订阅、RunCommand 执行校验脚本退出码 0，全部与报告一致。

---

## 提示词 28：Q6 — 消费层集成验证与收尾

**状态**：✅ 已完成（文件：`Q6-Sprint-Q消费层终态报告.md`）

**审核结论**：报告质量极高，全量审计覆盖完整，代码验证全部通过。关键发现：
- Sprint-Q 5 轮迭代全部交付物就位（5 类 × 10+ 项，~1000 行代码 + 9 份文档 + 9 份提示词）
- Q1 14 项问题：已解决 5 / 部分解决 6 / 未解决 3，含部分解决覆盖率 78.6%
- 3 处死代码全部标注 @deprecated（employee.ts/getEmployeeDetail、employee-selector.ts/getEmployeeSelectorById、cockpit.ts 全部 7 函数），Grep 全仓确认零调用，函数体未改
- 编号口径说明诚实透明：Q1 原 13 项 + P2-5 = 14 项，未编造第 15 项
- Q2 5 大设计覆盖率矩阵：事件体系前端 100%（后端待发布）、Composable 4/4、EmployeeSelector 4 props+1 emit、API 规范类型统一（批量端点待后端）、依赖声明 8/8 valid
- 校验脚本 `node scripts/validate-employee-deps.mjs` 退出码 0
- 残留问题 5 项清晰标注阻塞原因和归属（P0-4 cockpit 端点分叉、P0-5 删除员工无引用校验、P1-3 风险看板未过滤离职、P2-5 10 模块未接入、长期 Phase 1 后端依赖）
- 消费层架构图完整（直接依赖/间接依赖/事件驱动/脱钩/死代码五层，标注状态）
- Sprint-Q 终态声明：前端基础已就绪，可在后端事件发布后即时接入真实联动

**验证结果**：经 Grep 核对 3 处死代码 @deprecated 标注、Glob 确认 8 个 deps.json、RunCommand 校验脚本退出码 0、Grep 确认 Q4 误用零残留，全部与报告一致。红线零违反。

---

## 提示词 29：R1 — Phase 1 后端协作任务（Sprint-Q 依赖项）

**状态**：⏳ 待执行（独立提示词文件：`提示词-29-R1-Phase1后端协作.md`）

**依赖**：Sprint-Q 消费层前端建设完成（Q6 终态报告）

**目标**：实现 Sprint-Q 消费层前端依赖的 3 个 P0 后端任务（getEmployeesByIds 批量端点、EMPLOYEE_* 事件发布、新 *Id 字段落库），打通「花名册为基石」的完整数据链路。生成 Phase 1 后端协作需求规格文档。

**关键要求**：
- P0-1：`GET /api/hse/employee/employees/batch?ids=1,2,3` 返回完整 EmployeeInfo（含 orgStatus/phone/idCard）
- P0-2：EMPLOYEE_* 事件发布（WebSocket 推荐方案 / 轮询备选方案），事件格式严格遵循 Q2 §2.2
- P0-3：5 个新 *Id 字段 DDL + 历史数据回填 SQL + 回滚 SQL
- 生成完整需求规格文档（接口规格/DDL/测试用例/前端切换计划/风险）
- 不修改前端 Q3/Q4/Q5 代码（仅记录后续切换计划）

> 详细任务内容见独立提示词文件：`F:\hse-dashboard\docs\提示词-29-R1-Phase1后端协作.md`

---

## 提示词 30：R1-Phase1 规格文档 v1.1 修正（代码核验→修正→重新审核）

**状态**：✅ 已完成（独立提示词文件：`提示词-30-R1-Phase1-规格文档v1.1修正.md`）

**审核结论**：通过。7 项修正（4 P0 + 3 P1）全部代码核验通过：
- 4 处事件 type 已加 `EMPLOYEE_` 前缀（与前端 `EmployeeEventType` 对齐）
- 回填 SQL 已重写为四级容错（L1~L4 命中统计）
- baseline/backup_registry 已嵌入迁移脚本
- WS 双层包裹、hazards UPDATE 入参、Dry Run 阶段、锁检查均已补全

**依赖**：提示词 29 已完成（规格文档 + 后端代码已落地）

**目标**：对 9 个关键文件进行代码核验，发现 4 个 P0 级问题（事件类型前后端不一致导致订阅失效、回填仅姓名匹配违反硬约束、缺少 baseline/registry、WS 推送格式描述不准确）和 3 个 P1 级问题（hazards UPDATE 入参不兼容、缺少 Dry Run、缺少锁检查），修正代码和规格文档后生成 v1.1。

**关键修正**：
- **P0-1**：`hse-employee.js` 4 处事件 type 值加 `EMPLOYEE_` 前缀（与前端 `EmployeeEventType` 对齐）
- **P0-2**：`v68_extension.sql` 回填从单一姓名匹配改为四级容错策略（编号→姓名→模糊）
- **P0-3**：`v68_extension.sql` 增加 `migration_baseline` 和 `migration_backup_registry` 创建
- **P0-4**：规格文档补充 WS 推送双层包裹说明（`NOTIFICATION` → `EMPLOYEE_EVENT`）
- **P1-1**：`hazards.js` PUT 入参补全 `b.checker_id`/`b.fixer_id` 兼容
- **P1-2**：规格文档实施顺序增加 Dry Run 阶段
- **P1-3**：规格文档执行顺序增加锁检查和活跃连接检查

> 详细任务内容见独立提示词文件：`F:\hse-dashboard\docs\提示词-30-R1-Phase1-规格文档v1.1修正.md`

---

## 提示词 31：R1-Phase1 Dry Run 执行（测试环境验证 → 灰度放行）

**状态**：✅ 已完成（独立提示词文件：`提示词-31-R1-Phase1-DryRun执行.md`）

**审核结论**：NO-GO（暂不放行生产）。Dry Run 发现 1 项阻断性缺陷：
- **P0-1 阻断**：`fetchEmployeeInfosByIds` 引用 `v_employee_current.ev.id_card`，视图无此列 → 所有正常批量查询返回 `-1`
- **P0-2 通过**：事件信封契约（`EMPLOYEE_` 前缀 + 10s 去重）+ `/events` 轮询端点验证通过
- **P0-3 通过**：字段落库 + 外键约束生效
- **回填 0%**：数据格式不匹配（占位符/多人员拼接），非脚本 Bug，前端文本兜底
- **迁移脚本幂等性**：baseline INSERT 与既有表 schema 不兼容 → 整事务回滚
- 放行前置条件：修复 P0-1 → 重跑 Dry Run → 5 用例全绿

> 详细任务内容见独立提示词文件：`F:\hse-dashboard\docs\提示词-31-R1-Phase1-DryRun执行.md`

---

## 提示词 32：R1-Phase1 P0-1 缺陷修复 + 重跑 Dry Run

**状态**：✅ 已完成（文件：`R1-Phase1-缺陷修复报告.md` + `R1-Phase1-DryRun-R2执行报告.md`）

**审核结论**：通过。5 项修复全部落地，Dry Run R2 门控 = Go。关键发现：
- P0-1 批量端点 5/5 用例全绿（idCard 明文返回、空参返回 []、200 上限生效）
- P0-2 事件信封契约（EMPLOYEE_ 前缀 + 10s 去重）+ /events 轮询端点正常
- P0-3 字段落库（创建/更新/DB 一致/外键生效），测试数据已清理
- 迁移脚本修复后重跑 COMMIT 成功，且对 baseline schema 漂移具备弹性
- 4 项前置条件已明确（回填 0% 随行、ROLE_PERMISSIONS_MAP 补映射、profile/list 修复、生产等价测试库重跑）

**验证结果**：P0-1 5 用例全绿，语法校验通过，GET /employees 列表端点正常返回。

---

## 提示词 33：R1-Phase1 阶段 1 — 灰度部署准备与生产放行检查清单

**状态**：✅ 已完成（文件：`R1-Phase1-阶段1-灰度部署放行确认单.md`）

**审核结论**：通过。确认单 7 段完整，代码核验全部通过。关键发现：
- 6 个文件变更清单完整，5 个 JS `node --check` 实跑 SYNTAX_OK
- 4 项前置条件逐项确认（#1 已知风险不阻塞 / #2 预存在建议不阻塞 / #3 预存在建议不阻塞 / #4 必须纳入执行）
- 6 步执行步骤（含步骤 0 独立测试库重跑），每步含具体命令
- 15 个冒烟用例（12 个 R2 已通过），回滚预案三重兜底 + 决策树
- 阶段 2 前端预检清单 4 项任务 + 3 条硬性注意事项
- 门控 = 🟢 Go，签字区 5 角色 + 🔒 禁止代签

**验证结果**：代码变更清单 6 文件与 Grep 核验一致，语法校验实跑 ALL_PASSED，回滚 SQL 行号与源文件一致。

---

## 提示词 34：R1-Phase1 阶段 2 — 前端切换（兜底 API → 真实后端）

**状态**：✅ 已完成（文件：`R1-Phase1-阶段2-前端切换报告.md`）

**审核结论**：通过。7 项任务全部落地，代码核验全部通过。关键发现：
- 任务 A：`getEmployeesByIds` 已新增到 `employee.ts` L273（POST `/hse/employee/employees/batch`）
- 任务 B：`useEmployeeData.ts` 调用已切换为 `getEmployeesByIds` + `mapEmployeeItemToInfo`，TODO 已移除
- 任务 C：`useHseWebSocket.ts` L200-209 已接入 EMPLOYEE_EVENT 双层包裹解析 → `publishEmployeeEvent`
- 任务 D：hazards 详情新增 checker/fixer EmployeeName；accidents 表单新增 handlerId + EmployeeSelector；emergency 表格列 bodyCell EmployeeName + 校验修复
- 任务 E：`useEmployeeLink.ts` 路由 TODO 已明确化
- 任务 F：单元测试 mock 已切换，4/4 通过
- 已知局限 5 项诚实标注：路由未就绪、as any 残留、reporter 纯文本、无轮询兜底、独立测试库重跑待执行

**验证结果**：10 个文件 Grep 核验全部与报告一致，单元测试 4/4 通过。

---

## 提示词 35：R1-Phase1 阶段 3 — 回归验证与收尾

**状态**：⏳ 待执行（独立提示词文件：`提示词-35-R1-Phase1-阶段3-回归与收尾.md`）

**依赖**：提示词 34 已完成（前端切换报告 + 代码已落地）

**目标**：R1-Phase1 全链路回归验证 + 治理收尾。对「以花名册为基石」的完整数据链路做端到端验证，处理残留问题，生成 R1-Phase1 终态报告。纯验证 + 文档生成，不修改代码。

**关键任务**：
- 任务 A：全链路数据一致性验证（从花名册 → 批量端点 → 业务表 *Id → 前端展示，5 条链路）
- 任务 B：处理 5 项已知局限（逐一确认处理方式 + 优先级）
- 任务 C：回填数据质量复盘（统计命中率 + 评估影响 + 建议）
- 任务 D：R1-Phase1 终态报告（完整交付物清单 + 门控状态 + 后续建议）
- 任务 E：Sprint-Q + R1 全序列收尾声明

> 详细任务内容见独立提示词文件：`F:\hse-dashboard\docs\提示词-35-R1-Phase1-阶段3-回归与收尾.md`