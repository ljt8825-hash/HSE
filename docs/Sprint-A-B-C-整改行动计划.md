# Sprint A/B/C 跨文档整改行动计划

> 本文档基于《Sprint-A-B-C-跨文档综合分析报告》（同目录）生成，将报告中识别的 7 处不一致 / 证据缺口转化为可执行的整改行动项。所有"问题事实"均可在分析报告的证据索引表追溯，本文不重复论证。

## 0. 用法说明

- **优先级**：P0 = 生产迁移阻断项（放行前必须闭合）；P1 = 放行前需闭合（否则 PASS 结论不成立）；P2 = 可并行 / 后续治理项。
- **阻断判定**：标注"是"的项未闭合前，不建议执行生产迁移。
- **责任人建议**：按角色给建议，实际指派由技术负责人确认；本文不代替签字。
- **验证方法**：尽量给出可在数据库 / 文档层面直接执行的具体动作。

## 1. 整改项总览矩阵

| 编号 | 问题主题 | 优先级 | 阻断生产迁移 | 责任角色建议 |
|------|----------|--------|--------------|--------------|
| ACT-01 | 迁移源行数 1304 vs 3156 差异溯源 | P0 | 是 | DBA / 数据负责人 |
| ACT-02 | status 映射 ELSE 'active' 冲突 | P0 | 是 | 后端 Lead / DBA |
| ACT-03 | Sprint C 验证 / 测试全"待验证" | P0 | 是 | Sprint C 执行人 |
| ACT-04 | 空白修复模板被宣称为 PASS | P1 | 否（需撤回 / 补证） | 质量 / 审计 |
| ACT-05 | Dry Run / Go-NoGo 签字缺失 | P1 | 是（按 Go-NoGo 自身条款） | 技术负责人 |
| ACT-06 | B-0 恢复行数 1285 vs 1287 偏差 | P2 | 否 | DBA |
| ACT-07 | hse_employee_org 保留口径不一致 | P2 | 否 | 架构 / 后端 |

## 2. 逐项整改卡

### ACT-01　迁移源行数 1304 vs 3156 差异溯源

- **事实**：前置审计（Sprint-B-Pre 风险确认 / 人员模型统一前置审计清单）记载 `hse_employee_relation` = 1304 条、`hse_employee_org` = 1285 条；Dry Run Round2 基线 `her_current_count` = 3156 条。倍数 2.4×，无任何文档解释来源。
- **风险**：基线不准 → 迁移量、回滚量、"偏差 0%"全部建立在错误基准上；"偏差 0%"只能证明内部自洽，不能证明数据正确。
- **阻断判定**：是。
- **验证方法**：
  1. 在生产 / 准生产库执行：
     ```sql
     SELECT 'hse_employee_relation' t, count(*) FROM hse_employee_relation
     UNION ALL SELECT 'hse_employee_org', count(*) FROM hse_employee_org;
     ```
  2. 对齐 Dry Run Round2 中 3156 的计算口径（是否含历史版本、重复键、多租户、软删除未过滤）。
  3. 输出《差异归因说明》，明确 3156 的构成。
- **交付物**：差异归因说明 + 重新基线化后的 count 值（写入 Runbook 基线表）。
- **关联证据**：Sprint-B-Pre实施前风险确认报告.md；Sprint-B人员模型统一前置审计清单.md；Sprint-B-v2.1-DryRun-Round2-Report.md（her_current_count=3156）。

### ACT-02　status 映射 ELSE 'active' 冲突

- **事实**：
  - 正确版：`Runbook-Final.md §7.7` 为显式全映射、无 ELSE。
  - 错误版：`Baseline-Validation-Fix.md §2.3` 仅映射 active / pending / inactive，末支 `ELSE 'active'`——会使 leave / resigned / retired / dismissed 被写成 active（在职）。
  - 自相矛盾：`Status-Mapping.md` §3.1 规定 ELSE NULL，§3.2 又用 ELSE 'active'；实际状态分布调查栏为空。
  - Go-NoGo 声称 P1-2（ELSE 自动覆盖）已 CLOSED，但其引用的修复文档仍含错误 SQL。
- **风险**：若错误 SQL 进入执行包，离职 / 退休人员在目标表被标记为"在职"，造成业务数据错误且难以察觉。
- **阻断判定**：是。
- **验证方法**：
  1. 在全部迁移 SQL 文档中检索 `ELSE 'active'`，列出命中文件与位置。
  2. 确认仅 `Runbook-Final §7.7` 进入执行包；将 `Baseline-Validation-Fix §2.3` 显式标注"非执行参考 / 已作废"。
  3. 在 `Runbook-Final` 增加禁用备注，并要求执行前对目标表抽样核对状态分布。
- **交付物**：SQL 版本锁定说明 + 执行包清单（仅含正确版）。
- **关联证据**：Sprint-B-v2.1-Runbook-Final.md §7.7；Sprint-B-v2.1-Baseline-Validation-Fix.md §2.3；Sprint-B-v2.1-Status-Mapping.md §3.1 / §3.2；Sprint-B-v2.1-Production-Go-NoGo-Review.md。

### ACT-03　Sprint C 验证 / 测试全"待验证"

- **事实**：Sprint-C-Phase1-API-Convergence-Report 中测试结果栏全部"⏳ 待验证"，数据验证 SQL "⏳ 待执行"；且引用了一个不存在的文件路径；声称"生产写入清零"但无实测佐证。
- **风险**：Sprint C 的"达标"结论缺乏实测支撑；前端接口是否真正切换至 `employee_assignment` 未验证。
- **阻断判定**：是。
- **验证方法**：
  1. 在测试环境执行报告中标注"待执行"的验证 SQL，记录实际行数 / 比对结果。
  2. 修正 / 补回不存在的文件引用。
  3. 将"⏳ 待验证"逐项回填为实测 PASS / FAIL。
- **交付物**：Sprint C 实测验收记录（替换占位符）。
- **关联证据**：Sprint-C-Phase1-API-Convergence-Report.md。

### ACT-04　空白修复模板被宣称为 PASS

- **事实**：Constraint-Check / Baseline-Validation-Fix / Status-Mapping 三份文档的结果栏、勾选项、签字栏全为空白（`____` 占位）；Go-NoGo 却称"4/4 已完成 PASS"。注：`Data-Clean-Check.sql` 为完整脚本，不属此列。
- **风险**：审计证据链断裂；对外呈现的"已验证"状态与实际不符。
- **阻断判定**：否（但需撤回错误 PASS 声明或补证）。
- **验证方法**：
  1. 由质量 / 审计角色对三份文档实际重做检查并填值。
  2. 若无法补证，将 Go-NoGo 的对应 PASS 降级为"未验证 / 有条件"。
- **交付物**：补填后的三份文档 或 Go-NoGo 修正版。
- **关联证据**：Sprint-B-v2.1-Constraint-Check.md；Sprint-B-v2.1-Baseline-Validation-Fix.md；Sprint-B-v2.1-Status-Mapping.md；Sprint-B-v2.1-Production-Go-NoGo-Review.md。

### ACT-05　Dry Run / Go-NoGo 签字缺失

- **事实**：Dry Run Round2 与 Go-NoGo 签字栏全空；Go-NoGo 自身写明"签字后方可执行"，却已给"PASS — 允许生产迁移"。
- **风险**：放行无责任主体背书，不符合变更治理要求；出问题时无法追溯决策人。
- **阻断判定**：是（按 Go-NoGo 文档自身条款）。
- **验证方法**：
  1. 由技术负责人、DBA、质量代表在对应签字栏补全签字与日期。
  2. 补签前不视为有效放行。
- **交付物**：签字完整的 Dry Run / Go-NoGo 文档。
- **关联证据**：Sprint-B-v2.1-DryRun-Round2-Report.md；Sprint-B-v2.1-Production-Go-NoGo-Review.md。

### ACT-06　B-0 恢复行数 1285 vs 1287 偏差

- **事实**：前置审计称 employee 可恢复 1285 条；Dry Run Round2 称 recover_id_count=1287（基于 hse_employee_relation ∪ hse_employee_org 并集），偏差未说明。
- **风险**：回滚量预估与实际不一致，影响回滚预案可信度。
- **阻断判定**：否（建议澄清）。
- **验证方法**：说明 1287 的来源（并集去重规则），确认与 1285 的 2 条差异性质（重复 / 历史）。
- **交付物**：一行偏差说明。
- **关联证据**：Sprint-B人员模型统一前置审计清单.md；Sprint-B-v2.1-DryRun-Round2-Report.md。

### ACT-07　hse_employee_org 保留口径不一致

- **事实**：Sprint-A 报告明确"保留 hse_employee_org 用于审计"；Sprint-C 报告称"生产写入清零 / 旧接口已切换"，两者对旧表处置口径不一。
- **风险**：文档对外口径冲突，易误导后续维护者。
- **阻断判定**：否。
- **验证方法**：在人员中心重构总方案层面统一表述——旧表冻结只读（仅审计用途），写入全部走 `employee_assignment`。
- **交付物**：口径统一说明（更新至人员中心重构实施方案）。
- **关联证据**：Sprint-A测试验收报告.md；Sprint-C-Phase1-API-Convergence-Report.md；人员中心重构实施方案.md。

## 3. 执行顺序与里程碑

**阶段一（生产迁移前必做 — P0）**
1. ACT-01 重新基线化 → 输出差异归因
2. ACT-02 锁定 SQL 执行版 → 作废错误 SQL
3. ACT-03 Sprint C 实测回填

**阶段二（放行治理 — P1）**
4. ACT-05 补签字（先于或随阶段一）
5. ACT-04 补证 / 撤回 PASS

**阶段三（后续治理 — P2）**
6. ACT-06 偏差说明
7. ACT-07 口径统一

## 4. 生产迁移放行门槛（Gate）

满足以下全部条件方可执行生产迁移：

- [ ] ACT-01 差异归因完成且基线值被 Runbook 采纳
- [ ] ACT-02 执行包仅含正确 status 映射 SQL，错误版已作废
- [ ] ACT-03 Sprint C 实测验收记录完整（无"待验证"占位）
- [ ] ACT-05 Dry Run 与 Go-NoGo 签字完整
- [ ] ACT-04 三份修复文档已补证 或 Go-NoGo PASS 已修正

> 注：本文为整改行动建议，不涉及实际数据库操作；所有验证需在授权环境下由对应角色执行。
