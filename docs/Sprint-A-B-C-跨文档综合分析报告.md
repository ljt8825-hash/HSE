# Sprint A / B / C 系列报告跨文档综合分析报告

> **编制日期**：2026-07-28
> **分析范围**：`F:\hse-dashboard\docs\` 下 32 份 Sprint A / Sprint B / Sprint C 系列报告
> **分析方法**：逐文档通读 → 关键数据抽取 → 跨文档矛盾识别 → 方法论评估 → 结论对比 → 专业判断
> **呈现约定**：本报告严格区分 **【事实陈述】**（可直接从原文引用、可复核）与 **【专业评价】**（基于事实的判断与推断）。凡属推断均明确标注，避免与事实混淆。

---

## 执行摘要（TL;DR）

1. **Sprint A 系列证据最扎实**：修复了 3 个导入报错、零 DDL、真实运行清空 1360 员工 + 1304 任职关系并通过验收，可信度最高。
2. **Sprint B 存在一个未被解释的重大数量矛盾**：迁移源表 `hse_employee_relation` 在生产审计中记录为 **1304 条**，但在 Dry Run 第二轮基线中记录为 **3156 条**（相差约 2.4 倍），无任何文档解释差异来源。
3. **"status 未知值处理"存在文档内部不一致**：最终生产 Runbook（Runbook-Final §7.7）的 B-2 SQL 已正确做到"显式映射、无 ELSE"；但作为"修复证据"被 Go-NoGo 引用的 `Baseline-Validation-Fix.md §2.3` 仍保留 `ELSE 'active'` 的 3 分支版本，且 `Status-Mapping.md` 自身 §3.1（ELSE NULL）与 §3.2（ELSE 'active`）相互矛盾、其实际状态分布调查结果栏为空白。
4. **4 份修复文档中有 3 份为空白模板**（Constraint-Check / Baseline-Validation-Fix / Status-Mapping 的结果栏、勾选项、签字栏全部未填），但 Go-NoGo 报告却据此声称"4/4 修复项已完成 PASS"。
5. **签字治理存在缺口**：Dry Run 第二轮与 Go-NoGo 的签字栏全部空白；而 Go-NoGo §7.3 明订"经以下角色签字批准后，方可执行"，即批准前置条件未满足却已给出"PASS — 允许生产迁移"结论。
6. **Sprint C 的"达标"声称缺乏执行证据**：12 个接口迁移声明完成，但后端/前端测试全部为"⏳ 待验证"，数据验证 SQL 为"⏳ 待执行"，且引用了一个不存在的文件路径。

---

## 一、数据与事实核查

### 1.1 关键数据对照表（事实）

| 数据项 | 来源文档 | 记录值 | 备注 |
|---|---|---|---|
| employee 总记录 / 活跃 / 已软删 | 前置审计清单 §一 | 1361 / 1 / 1360 | Sprint A 清空后仅 1 条测试数据 |
| employee_assignment 总 / 活跃 / 已软删 | 前置审计清单 §二 | 1305 / 1 / 1304 | 与 employee 同步软删 |
| hse_employee_org 总 / 活跃 | 前置审计清单 §三 | 1285 / 1285 | 未被 Sprint A 清空影响 |
| personnel 总记录 | 前置审计清单 §四 | 0 | 已无数据 |
| hse_employee_relation 总 / 活跃 / 当前在职 | Pre-risk 审计 §1.2 | 1304 / 1304 / 1304 | 由迁移脚本单日批量生成 |
| hse_employee_relation `operation_unit_id` 有效性 | Pre-risk 审计 §1.4 | 1300/1304 有效（4 异常） | org_unit_id 100% 有效 |
| hse_employee_relation 与 hse_employee_org 重叠员工 | Pre-risk 审计 §1.5 | 1246 人 | status/position 匹配均为 0 |
| employee 可恢复数（来自 hse_employee_org） | Pre-risk 审计 §2.2 | 1285 | 单个源表口径 |
| B-0 恢复基线 / 实际 | Dry Run R2 §3.2 | 1287 / 1287 | 并集口径（详见 1.2-D） |
| B-2 迁移基线 `her_current_count` / 实际 | Dry Run R2 §3.4 | 3156 / 3156 | **与生产审计 1304 不一致** |
| 三违 `violator_id` 为 NULL | 前置审计清单 §8.1 | 890 / 890 (100%) | 无法关联员工档案 |
| 培训 `employee_id` 为 NULL | 前置审计清单 §8.2 | 100 / 100 (100%) | 无法关联员工档案 |
| Sprint A 真实清空 | Sprint-A 真实运行验收 | 员工 1360 + 任职 1304 | 已通过验收 |

### 1.2 已识别的事实层面不一致（事实陈述）

**A. 迁移源表行数矛盾（生产审计 1304 vs Dry Run 基线 3156）**
- 【事实】`Sprint-B-Pre实施前风险确认报告.md` §1.2 记录 `hse_employee_relation` 总数为 **1304**（全部 `is_deleted=false`、`is_current=true`）。
- 【事实】`Sprint-B-v2.1-DryRun-Round2-Report.md` §3.4 记录 B-2 基线 `her_current_count = 3156`，实际迁移 `3156`，偏差 0%。
- 【事实】`Sprint-B-v2.1-Runbook-Final.md` Check 0.12 将 `her_current_count` 定义为 `SELECT COUNT(*) FROM hse_employee_relation WHERE is_current=true AND is_deleted=false`，即 3156 是"测试环境"中该条件下的实际计数。
- 【事实】上述两个计数（1304 vs 3156）相差约 2.4 倍，且**没有任何文档对测试环境与生产审计环境的行数差异做出解释或标注**（Go-NoGo §3.3 R1 仅笼统提示"生产环境数据量可能更大"，未提及 1304↔3156 的具体差异）。

**B. 迁移源表的归属在两版审计间不一致**
- 【事实】`Sprint-B人员模型统一前置审计清单.md` §九.2 将迁移方向写为 `hse_employee_org → employee_assignment`，迁移量 1,285 条（并通篇未提及 `hse_employee_relation`）。
- 【事实】`Sprint-B-Pre实施前风险确认报告.md` §六.1 明确"问题 1：hse_employee_relation 是否作为迁移源？**是**"，依据是其字段与 `employee_assignment` 对齐、业务路由未引用、属历史迁移数据。
- 【事实】`Runbook-Final.md` §7.1 与 `Baseline-Validation-Fix.md` §2.3 的 B-2 SQL 均 `FROM hse_employee_relation`。
- 【推论（标注为评价）】前置审计清单对源表的判断已被后续 Pre-risk 审计与 Runbook 推翻/取代；该清单的"1,285 需迁移"数字已不反映最终设计。这是文档演进未同步的问题，可能误导后续读者。

**C. status 映射的"ELSE"处理方式在文档间不一致**
- 【事实】`Status-Mapping.md` 标题约束写明"**禁止使用 `ELSE 'active'` 自动覆盖未知状态**"（第 6 行）。
- 【事实】`Status-Mapping.md` §3.1 "最终确认版 SQL"使用 `ELSE NULL`；§3.2 "推荐版 SQL"使用 `ELSE 'active'`。**同一文档内部两种方案并存**。
- 【事实】`Baseline-Validation-Fix.md` §2.3（被 Go-NoGo §二列为"修复项 2 交付物"）的 B-2 SQL 仅含 `active/pending/inactive` 三分支 + `ELSE 'active'`，且异常检查仅排除 `(active, pending, inactive)` —— 即 `leave/resigned/retired/dismissed/returned/NULL` 全部落入 `ELSE 'active'`。
- 【事实】`Runbook-Final.md` §7.7 的 B-2 SQL 为**显式全映射 + 无 ELSE**（注释"无 ELSE；未知 status 由 Step 1.6 预检查阻断"），与 Status-Mapping §2.1 映射表一致（leave→inactive 等）。
- 【推论（评价）】生产可执行版（Runbook-Final）在 status 处理上是正确且自洽的；但作为"修复证据"被引用的 `Baseline-Validation-Fix.md` 保留了与 Runbook 冲突的错误 SQL。Dry Run 第二轮报告未附实际执行 SQL 文本，因此**无法确认 Dry Run 当时跑的是哪一版**。

**D. B-0 恢复行数 1287 vs 生产审计 1285**
- 【事实】Pre-risk 审计 §2.2 按**单一源表** `hse_employee_org` 计算可恢复数为 **1285**。
- 【事实】Dry Run R2 §3.2 的 B-0 恢复基线 `recover_id_count = 1287`，与 Runbook §5.4 采用的**并集策略**（`hse_employee_relation ∪ hse_employee_org`）一致。
- 【评价】2 条差异可由"并集口径 vs 单源口径"解释，属方法差异而非数据造假，但 Pre-risk 审计未提示将改用并集，读者容易误以为审计数（1285）即为最终恢复数。

**E. 三份"修复文档"为空白模板，却被宣称为 PASS**
- 【事实】`Constraint-Check.md`：执行结果单元全部为 `____`，勾选项未勾，负责人签字空白（§二/§四/§五）。
- 【事实】`Baseline-Validation-Fix.md` §4 三个测试场景"实际"栏为 `____`、勾选未填；§5 五项"修复确认"全部 `□ 是` 未勾；修复人/审核人/日期空白。
- 【事实】`Status-Mapping.md` §一.1.2 实际状态分布调查结果为空白；§五签字栏空白；§2.1 各"是否已确认"列均为 `□`。
- 【事实】`Data-Clean-Check.sql` **并非空白**，其脏数据检查 `DO $$` 块为完整可执行脚本（与 Dry Run R2 §3.4 Step 1.5 `duplicate_count=0` 对应）。
- 【事实】`Go-NoGo §二` 却将这 4 项全部标注为"**已完成 / PASS**"，完成率"4/4 = 100%"。

**F. 签字栏普遍空白却给出 PASS 结论**
- 【事实】`DryRun-Round2-Report.md` §8 五个角色（数据迁移负责人/DBA/后端/前端/QA）姓名、签字、日期全空。
- 【事实】`Go-NoGo.md` §7.3 六个角色签字栏全空，但同节写明"**本报告经以下角色签字批准后，方可执行生产迁移**"，且 §一最终结论为"**PASS — 允许生产迁移**"。
- 【评价】文档自身的批准前置条件未满足，却已出具允许迁移结论，构成治理闭环缺口。

**G. Sprint C 结论与证据不匹配 + 引用路径错误**
- 【事实】`Sprint-C-Phase1-API-Convergence-Report.md` §六全部后端/前端测试结果为"⏳ 待验证"；§七数据验证 SQL 为"⏳ 待执行"。
- 【事实】同一报告 §十"验收标准"却填写"实际值=目标值、✅ 达标"（生产写入 0 / 使用率 100% / 接口变更 0 / 表结构变更 0）。
- 【事实】§十一附录引用 `../Sprint-B-v2.1-Production-Ready-Report.md`，而文档清单中对应文件名为 `Sprint-B v2.1 最终执行版本交付报告.md`，路径/文件名不匹配。
- 【评价】Sprint C 的"达标"为前置性声明，缺少实际验证支撑；其"保留 hse_employee_org 用于审计"（§八）与 Sprint A/B 整体"冻结旧表、保留只读"的口径一致，二者并非矛盾。

### 1.3 专业评价（数据可靠性）

- **高可靠数据**：Sprint A 的真实运行计数（1360/1304）、前置审计清单的表级计数（1361/1305/1285/0）、Pre-risk 审计的 `hse_employee_relation` 1304 及关联有效性，均来自直接查询且可复核，可靠性高。
- **中可靠但需复核**：Dry Run 第二轮的过程计数（1287/3156）本身记录了"基线=实际、偏差 0%"，但其**基线的来源口径（测试环境 3156 vs 生产审计 1304）未对齐**，因此在用于生产决策前必须重新在生产环境基线化。
- **低可靠/存疑**：① Go-NoGo 基于空白模板得出的"4/4 已完成 PASS"；② Status-Mapping 中空白的实际分布调查；③ Sprint C 未执行的"达标"声明。这些结论的支撑证据缺失，不应作为独立可信结论引用。

---

## 二、方法论评估

### 2.1 各报告采用方法概述（事实）

| 报告 | 核心方法 | 验证手段 |
|---|---|---|
| Sprint A 系列 | 定位导入报错根因（空指针/字段缺失/软删字段），单文件改 `hse-employee-import-v2.js` | 真实运行导入，统计清空 1360/1304，通过验收 |
| 前置审计清单 | 直接查询生产库四表计数 + 业务模块 NULL 率统计 | 静态快照，无动态推演 |
| Pre-risk 审计 | 审计 SQL + 全项目代码搜索 + 样本抽查 + 脚本执行（exit code 0） | 证据链（department→org_unit_id 名称一一对应） |
| Runbook-Final | 定义 Step 0/B-0/B-1/B-2 + 动态基线校验 + UPSERT + 回滚策略 | 设计为生产可执行，含 13 项强制检查 |
| Dry Run R2 | 测试环境模拟生产全流程，动态基线偏差校验 + 回滚演练 | 过程计数记录，但**未附执行 SQL 文本** |
| Go-NoGo | 基于 Dry Run 与修复文档的评审 | 文档完备性检查 + 风险状态表 |
| Sprint C | 路由层 API 迁移（12 接口）+ 新增服务层 | **仅声明完成，未执行测试/数据验证** |

### 2.2 方法局限与偏差（评价）

1. **Sprint A 范围受限但恰当**：仅修复报错、未触及双表根因，这是合理分期，但意味着"双任职表并存"问题被推迟到 B/C 解决——读者不应从 Sprint A 的"通过"推断人员模型已统一。
2. **Dry Run 的"偏差 0%"依赖基线自洽**：B-2 校验是 `actual_migrate_count` 对比 `her_current_count` 基线，二者均取自同一次执行，逻辑上必然自洽。**该校验只能证明"本次迁移内部一致"，不能证明"迁移数据量正确"**——因为基线 3156 本身未与生产审计 1304 对齐。
3. **Dry Run 缺乏可追溯的执行证据**：报告罗列"PASS"但未附实际执行 SQL 与返回结果快照，无法独立核验其使用的是 Runbook-Final 的正确版本还是 Baseline-Validation-Fix 的错误版本。
4. **修复文档"形式完备、内容空白"**：Constraint/Baseline/Status-Mapping 三项给出模板结构却未填实际值，使 Go-NoGo 的"已完成"断言失去底层证据。
5. **Sprint C 验证缺位**：方法上完成了代码迁移设计，但跳过了"执行冒烟测试 + 数据一致性 SQL"这一关键验证环，结论成熟度显著低于 Sprint A。
6. **抽样偏差**：Pre-risk 审计对 `operation_unit_id` 仅抽查"前 20 条"，对 enterprise/project/team 以"样本中无显著数据"为由判定"不迁移"——属合理推断，但未经全量统计确认，生产环境若存在这类值需重新评估。

---

## 三、结论对比

### 3.1 主流共识（事实 + 评价）

| 共识观点 | 支撑文档 | 评价 |
|---|---|---|
| 双任职表（`employee_assignment` + `hse_employee_org`）并存是核心问题 | 前置审计清单、Pre-risk 审计、Runbook、Sprint C | 跨文档高度一致，属主流定论 |
| `employee_assignment` 应成为人员组织关系唯一事实来源 | Pre-risk 审计 §6.2、Runbook §7.1、Sprint C §一 | 一致 |
| `hse_employee_org` 冻结为只读历史表、保留不删 | Pre-risk 审计 §6.3、Runbook §10、Sprint C §八 | 一致（Sprint C 称"保留用于审计"，口径相同） |
| `personnel` 表废弃 | 前置审计清单 §四、Pre-risk 审计 §6.4 | 一致 |
| 分期推进 A→B→C→D | 多文档交叉引用 | 一致，路线图清晰 |
| `hse_employee_relation` 为 B-2 迁移源 | Pre-risk 审计、Runbook、Baseline-Fix | 一致（仅前置审计清单例外，见 B） |

### 3.2 分歧与少数意见（事实 + 评价）

| 分歧点 | 一方说法 | 另一方说法 | 评价 |
|---|---|---|---|
| 迁移源表 | 前置审计清单：hse_employee_org（1,285） | Pre-risk/Runbook/Baseline：hse_employee_relation | 后者为最终设计，前者已被取代 |
| 迁移行数 | Pre-risk：1,304 | Dry Run R2：3,156 | 环境口径未对齐，需生产重新基线化 |
| status 未知值处理 | Status-Mapping 约束"禁止 ELSE"、Runbook"无 ELSE" | Baseline-Fix §2.3 实际 `ELSE 'active'`；Status-Mapping §3.2 也列 `ELSE 'active'` | 生产版正确，但"修复证据"文档冲突 |
| 验收结论强度 | Go-NoGo："PASS 允许生产迁移" | 底层模板空白、签字空白 | 结论强度与证据强度不匹配 |
| Sprint C 达标性 | 报告自称"✅ 达标" | 测试全"待验证"、SQL"待执行" | 自称达标缺乏支撑，属少数（且偏弱）意见 |

---

## 四、专业判断

### 4.1 各报告可信度排序（评价）

> 排序依据：证据是否可复核、结论是否有执行支撑、文档内部是否自洽。

| 排名 | 报告 | 可信度 | 关键理由 |
|---|---|---|---|
| 1 | Sprint A 系列（提交/测试验收/真实运行验收/代码修改） | **高** | 真实运行、计数可复核、零 DDL、已验收 |
| 2 | Sprint-B-Pre实施前风险确认报告 | **高** | 脚本执行（exit 0）、关联有效性有证据链；仅其 1304 与 Dry Run 3156 未对齐 |
| 3 | Sprint-B人员模型统一前置审计清单 | **中高** | 表级计数可靠，但源表判断已过时、被后续文档取代 |
| 4 | Sprint-B v2.1 Runbook-Final | **中高** | 生产 SQL 设计正确自洽（含正确 status 映射、动态基线、回滚）；但依赖未签字/空白证据的 Go-NoGo |
| 5 | Sprint-B v2.1 Data-Clean-Check.sql | **中高** | 完整可执行脏数据检查脚本，非空白 |
| 6 | Sprint-B v2.1 修复文档（Constraint/Baseline/Status-Mapping） | **中低** | 3 份空白模板 + status 内部矛盾（`ELSE NULL` vs `ELSE 'active'`）；Baseline 含错误 SQL |
| 7 | Sprint-B v2.1 Dry Run 第二轮报告 | **中低** | 过程记录完整但基线 3156 未对齐、未附执行 SQL、签字空白 |
| 8 | Sprint-B v2.1 Go-NoGo 评审 | **中低** | "PASS 允许迁移"结论不被链接证据支撑（空白模板、未签字） |
| 9 | Sprint-C Phase1 API 收敛报告 | **低** | 代码迁移声明完成，但测试/数据验证均未执行、引用路径错误 |

### 4.2 主要发现的可靠性评估（评价）

- **可靠**：双表并存问题、Sprint A 修复效果、`hse_employee_relation` 字段与 `employee_assignment` 对齐、`personnel` 可废弃、三违/培训 100% 无关联——均有直接数据支撑。
- **需谨慎采信**：Dry Run "PASS" 与 Go-NoGo "允许生产迁移"——其结论形式完备，但底层三份修复文档为空白、签字缺失、且 B-2 基线 3156 与生产审计 1304 未对齐，结论的可靠性低于其表述强度。
- **存疑/待证伪**：Sprint C "达标"、Baseline-Fix 中 `ELSE 'active'` 是否曾在 Dry Run 中实际执行、生产环境 `hse_employee_relation` 真实行数。

### 4.3 需进一步关注 / 验证的问题清单（行动建议）

1. **【高】生产环境重新基线化**：在生产库执行 Runbook Check 0.12，确证 `hse_employee_relation` 当前 `is_current=true AND is_deleted=false` 的真实行数；**禁止直接沿用 Dry Run 的 3156 作为生产基线**。
2. **【高】status 映射最终定稿与签字**：以 Runbook-Final §7.7（无 ELSE、显式全映射）为唯一生产执行版；将 `Baseline-Validation-Fix.md §2.3` 的错误 `ELSE 'active'` SQL 标记为"作废/被 Runbook 取代"；补全 `Status-Mapping.md` §一.1.2 的实际状态分布，并完成 Go-NoGo §7.3 要求的业务方签字。
3. **【高】补齐修复文档实际证据**：在 Constraint-Check / Baseline-Validation-Fix / Status-Mapping 中填入真实执行结果、勾选与签字，否则 Go-NoGo 的"4/4 已完成"不可作为决策依据。
4. **【中】Dry Run 执行 SQL 留痕**：补附第二轮 Dry Run 实际执行的 B-2 SQL 文本与返回行数，以证明跑的是正确版本而非错误版本。
5. **【中】Sprint C 执行验证**：运行 §六列出的冒烟测试与 §七 `Employee_Model_Check.sql`，将"⏳ 待验证/待执行"替换为实际结果；修正 §十一的错误引用路径。
6. **【中】治理闭环**：Go-NoGo 在签字栏补齐前，其"PASS — 允许生产迁移"仅为建议性结论，不应视为已获正式批准。
7. **【低】抽样补全**：对 `operation_unit_id` 及 enterprise/project/team 做全量统计，确认"不迁移"判断在生产数据上依然成立。

---

## 附录：证据索引（文档 → 关键位置）

| 文档 | 关键证据位置 |
|---|---|
| Sprint-B人员模型统一前置审计清单.md | §一/§二/§三/§四（表计数）；§8.1/§8.2（三违/培训 NULL）；§九.2（源表 hse_employee_org） |
| Sprint-B-Pre实施前风险确认报告.md | §1.2（her=1304）；§1.4（有效性）；§1.5（重叠 1246）；§2.2（可恢复 1285）；§六.1（源表确认） |
| Sprint-B-v2.1-Status-Mapping.md | 第 6 行（禁止 ELSE）；§一.1.2（空白）；§2.1（映射表）；§3.1 vs §3.2（ELSE NULL vs ELSE active）；§五（空白签字） |
| Sprint-B-v2.1-Baseline-Validation-Fix.md | §2.3（B-2 SQL `ELSE 'active'` + 仅 3 分支）；§4/§5（空白） |
| Sprint-B-v2.1-Constraint-Check.md | §二/§四/§五（全部空白） |
| Sprint-B-v2.1-Data-Clean-Check.sql | 完整 DO $$ 脏数据检查脚本 |
| Sprint-B-v2.1-DryRun-Round2-Report.md | §3.2（B-0 1287）；§3.4（B-2 3156）；§8（空白签字） |
| Sprint-B-v2.1-Production-Go-NoGo-Review.md | §一（PASS）；§二（4/4 已完成）；§3.2 P1-2（CLOSED）；§7.3（空白签字但要求签字）；§8.5（禁止 ELSE） |
| Sprint-B-v2.1-Runbook-Final.md | §7.1（源表 her）；§7.3（status 映射表）；§7.7（B-2 正确 SQL，无 ELSE）；Check 0.12（her_current_count 定义） |
| Sprint-C-Phase1-API-Convergence-Report.md | §六（测试待验证）；§七（SQL 待执行）；§十（自称达标）；§十一（错误引用路径）；§八（保留审计） |
| Sprint-A 系列（真实运行验收等） | 清空 1360 员工 + 1304 任职关系，通过验收 |

---

> **分析边界说明**：本报告仅基于所提供的 32 份文档内容进行交叉比对，未直接访问生产/测试数据库，也未运行任何 SQL。所有"需验证"项均指向应在数据库中实际执行以确认。报告中的"评价"部分为分析者基于事实的推断，可能与实际执行情况存在差异，建议在决策前完成第 4.3 节所列验证动作。
