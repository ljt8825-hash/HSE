# Sprint A/B/C 整改：TRAE 执行提示词序列

> 协作模式定义 + 步骤总览 + 给执行者（TRAE）的分步提示词。
> 角色：TRAE = 执行者（读代码 / 跑 SQL / 改文件 / 产 md）；Senior Developer（吴八哥）= 验证者 + 提示词生成者。
> 循环：我给提示词 → TRAE 执行并产出 md → 我验证 md → 我生成下一步提示词。

## 0. 协作机制

### 0.1 md 文档规范（TRAE 每步必须产出）
文件名：`docs/TRAE-Step{n}-{主题}.md`
必须章节：
1. **目标** — 复述本步目标。
2. **环境与权限** — 是否访问数据库（是/否 + 原因）。
3. **执行动作与原始结果** — 贴实际 SQL / 命令 / 代码改动 diff；**禁止编造结果**，未执行的须注明"未实测"。
4. **发现** — 事实陈述（带证据）。
5. **结论** — 与证据一致，不臆断。
6. **风险与建议** — 对后续的具体建议。
7. **待办 / 下一步** — 需验证者确认或下一步处理的事项。
8. **证据索引** — 每条结论对应 SQL 结果行 / 代码文件:行号。

### 0.2 验证者核对标准（我收到 md 后逐条核对）
- 事实有可复核证据（SQL 结果 / 代码行），非断言。
- 结论与证据一致，无跳跃推理。
- 所有"未实测"项已明确标注，未伪装成结论。
- 与《跨文档综合分析报告》《整改行动计划》的已认定事实不冲突（或冲突处有合理解释）。

### 0.3 步骤总览（对应整改行动计划 ACT-01~07）
| Step | 对应 ACT | 目标 | 是否需 DB | TRAE 可独立完成 |
|------|----------|------|-----------|----------------|
| 0 | — | 现状诊断（代码+数据，所有步骤前提） | 是 | 部分（需环境） |
| 1 | ACT-01 | 源表 1304 vs 3156 基线复核 + 下游关联 NULL 诊断 | 是 | 否（需 DB） |
| 2 | ACT-02 | 锁定 status 映射 SQL 执行版（仅 Runbook-Final §7.7） | 否 | 是 |
| 3 | ACT-03 | Sprint C 验证 SQL 实测回填（替换 ⏳ 待验证） | 是 | 否（需环境） |
| 4 | ACT-05 | Dry Run / Go-NoGo 签字补录（文档层面，签字需人工） | 否 | 文档可填，签字需人 |
| 5 | ACT-04 | 三份空白修复模板补证 / 撤回 PASS | 否 | 文档可填，需质量角色 |
| 6 | ACT-06 | B-0 恢复 1285 vs 1287 偏差说明 | 是 | 否（需 DB） |
| 7 | ACT-07 | hse_employee_org 保留口径统一 | 否 | 是 |

> 用户背景强调"花名册导入后与其他板块无法交互"是根因，故 Step 1 在 ACT-01 基线复核之外，额外要求诊断下游外键 NULL 根因，使审计整改直接服务于核心痛点。

---

## Step 1 提示词（当前交付，可直接复制给 TRAE）

```markdown
# 任务：Sprint B 人员迁移数据基线复核 + 花名册关联现状诊断

## 背景（必读）
我们在做 HSE 安全看板的人员中心重构。根因：花名册导入后与其他业务板块（三违、培训等）无法交互——这些板块的人员外键（如三违表 violator_id、培训表 employee_id）大量为 NULL。历史上这一块曾开发过交互逻辑，后来丢失/未生效。同时早期迁移文档存在数据不一致，需复核基线。
你之前（Sprint C）已完成 hse-employee.js 接口从 hse_employee_org 到 employee_assignment 的迁移。现在有跨文档审查发现一处严重数据不一致需要你核实。

## 目标
1. 复核迁移源表行数：前置审计记载 hse_employee_relation = 1304 条、hse_employee_org = 1285 条；但 Dry Run 第二轮基线 her_current_count = 3156 条（差 2.4 倍），无任何文档解释来源。查清 3156 的真实来源。
2. 诊断花名册与下游板块的关联现状：确认三违 violator_id、培训 employee_id 等外键的 NULL 比例与根因（呼应"无法交互"背景）。
3. 产出 md 文档记录发现。

## 输入（先阅读以对齐上下文）
- docs/Sprint-B-Pre实施前风险确认报告.md
- docs/Sprint-B人员模型统一前置审计清单.md
- docs/Sprint-B-v2.1-DryRun-Round2-Report.md（重点 her_current_count=3156、recover_id_count）
- docs/Sprint-A测试验收报告.md
- docs/Sprint-A-B-C-跨文档综合分析报告.md（审查发现汇总）
- docs/Sprint-A-B-C-整改行动计划.md（ACT-01 定义）
- 代码仓库中花名册导入相关逻辑、三违/培训模块的人员关联代码

## 执行动作
### A. 数据库核对（若可访问数据库）
执行并如实记录：
SELECT 'hse_employee_relation' AS src, count(*) AS cnt FROM hse_employee_relation
UNION ALL SELECT 'hse_employee_org', count(*) FROM hse_employee_org;
-- 若 migration_baseline 表存在，查其记录的基线值（按实际表结构调整）
- 若 3156 来自 hse_employee_relation，进一步分析是否含历史版本、重复键、多租户、软删除(is_deleted/deleted_at)未过滤导致膨胀。
- 若无法访问数据库，明确说明原因，改为基于代码与文档的静态分析，标注"未实测"。

### B. 下游关联诊断
SELECT
  (SELECT count(*) FROM <三违表>) AS total,
  (SELECT count(*) FROM <三违表> WHERE violator_id IS NULL) AS null_violator,
  (SELECT count(*) FROM <培训表>) AS train_total,
  (SELECT count(*) FROM <培训表> WHERE employee_id IS NULL) AS null_employee;
- 结合花名册导入代码，分析为何外键未填充（导入未写关联？下游模块独立建表未回写？曾有的交互逻辑是否残留/丢失？）。

### C. 代码阅读
- 阅读花名册导入相关文件（如 安全看板vben/.../employee-import*），确认导入后是否回写 employee_assignment / 人员关联。
- 阅读三违、培训模块的人员选择/关联逻辑，留意是否残留被注释或失效的关联代码。

## 产出文档要求
产出 docs/TRAE-Step1-数据基线复核与关联诊断.md，含以下章节：
1. 目标
2. 环境与权限（是否访问 DB，是/否 + 原因）
3. 执行动作与原始结果（贴实际 SQL 与返回；未执行须注明，禁止编造）
4. 发现（源表实际行数 vs 1304/1285/3156 对比 + 3156 来源推断；下游 NULL 比例与根因）
5. 结论（基线是否准确、下游关联是否断裂、严重程度）
6. 风险与建议（对后续迁移/修复的具体建议）
7. 待办/下一步
8. 证据索引（每条结论对应 SQL 结果行或 代码文件:行号）

## 验收点（供验证者核对）
- [ ] 源表行数已用真实查询或明确标注"未实测"核实
- [ ] 3156 差异给出有证据的解释
- [ ] 下游 NULL 比例有数据支撑
- [ ] 结论与证据一致，无臆断
- [ ] md 已按要求章节产出

完成后将 md 路径回复给验证者（Senior Developer），我将据此验证并生成 Step 2 提示词。
```

---

## 我对 Step 1 的验证清单（收到 TRAE 的 md 后逐条核对）
1. 环境章节是否诚实声明 DB 访问情况；若"未实测"，是否通篇未把推测当事实。
2. 源表 count 结果是否与文档已知的 1304/1285/3156 三者之一吻合，或对 3156 给出可被复算的差异归因（如"含历史版本 N 条 + 软删除未过滤 M 条"）。
3. 下游 NULL 比例是否为真实查询结果，且根因分析指向具体代码位置（文件:行）或明确的架构原因。
4. 结论是否区分"已证实"与"推断"。
5. 证据索引是否可追溯到具体行/结果。

## 执行进度

| Step | ACT | 状态 | 产出 |
|------|-----|------|------|
| 1 | ACT-01 | ✅ 已验证通过 | docs/TRAE-Step1-数据基线复核与关联诊断.md |
| 2 | ACT-02 | ✅ 已验证通过 | docs/TRAE-Step2-status映射SQL锁定.md |
| 3 | ACT-03 | ✅ 已验证通过（含 1 处勘误） | docs/TRAE-Step3-SprintC验证SQL实测回填.md |
| 4 | ACT-05 | ✅ 已验证通过 | docs/TRAE-Step4-DryRun-GoNoGo签字补录.md |
| 5 | ACT-04 | ✅ 已验证通过 | docs/TRAE-Step5-空白修复模板补证.md |
| 6 | ACT-06 | ✅ 已验证通过 | docs/TRAE-Step6-B0恢复偏差说明.md |
| 7 | ACT-07 | ✅ 已验证通过 | docs/TRAE-Step7-hse_employee_org保留口径统一.md |
| 8 | —(文档补正) | ✅ 已验证通过（6 文档多已修正，仅剩空白栏待生产回填，无需篡改） | docs/TRAE-Step8-文档补正提示词.md |
| 9 | —(只读保护+巡检) | ✅ 已验证通过 | docs/TRAE-Step9-只读保护与巡检部署.md |
| 10 | —(Sprint D 下游修复) | ✅ 已验证通过 | docs/TRAE-Step10-下游交互根因修复.md |
| 11 | —(前端打通+脚本加固) | ✅ 已验证通过 | docs/TRAE-Step11-前端打通与脚本加固.md |
| 12 | —(生产放行门控 Runbook) | ✅ 已验证通过（v1.1 已修复 2 缺陷，批准交付 DBA） | docs/TRAE-Step12-生产放行执行门控Runbook.md |
| 13 | —(Runbook 缺陷修订) | ✅ 已验证通过（v1.1 已落地，验收点全过） | docs/TRAE-Step13-提示词.md |
| 14 | —(生产放行清单 Dev 彩排) | ✅ 已验证通过（彩排暴露 P0/P1 两处 SQL 缺陷） | docs/TRAE-Step14-生产放行清单Dev彩排.md |
| 15 | —(生产包/Runbook 缺陷修订) | ✅ 已验证通过（P0/P1 已修，v1.2-fix 经独立核对正确） | docs/TRAE-Step15-生产包与Runbook缺陷修订.md |
| 16 | —(pre-DBA 就绪清理+全链路彩排) | ✅ 已验证通过（v1.3-ready 已核实，P0/P1/P2 全清零） | docs/TRAE-Step16-生产包最终就绪确认.md |

---

## Step 1 审核结论（验证者：Senior Developer 吴八哥）

**验证方法**：对照本文件第 0.3 节验证清单，并实际 Grep 复核 TRAE 引用的代码 / 视图 / 字段。

### ✅ 验证通过项
1. **环境声明诚实**：§2 明确"数据库访问=是（只读）"，所有数据均为真实查询结果，未以静态分析冒充。
2. **源表实测与审计一致**：hse_employee_relation=1304、hse_employee_org=1285，与 Pre-risk 审计、前置审计清单完全吻合。
3. **下游 NULL 比例真实**：三违 violator_id 890/890=100% NULL、培训 employee_id 100/100=100% NULL，与前置审计清单一致。
4. **代码引用全部复核真实**（Grep 命中）：
   - `violations.js:167` 确为 `violator_id: data.violator_id || null`
   - `training.js:353/473` INSERT 含 `employee_id || null`
   - `hse-employee-import-v2.js:941` `INSERT INTO employee`、`:990` `INSERT INTO employee_assignment`
   - `v_employee_org_full`、`v_employee_current` 视图均存在且被引用
   - **`hse-employee-import-v2.js` 中 0 处引用 `hse_employee_org`** → 证实"V2 导入不写旧表、不联动下游"结论
5. **结论区分事实与推断**：当前环境 1304 为已证实；3156 来自环境差异为推断，且已列待办。

### ⚠️ 观察 / 保留项（不阻塞，需跟进）
1. **3156 来源仍为推断**（环境差异），未直接查证 Dry Run 环境；已列入待办，若可访问 Dry Run 库需在 Step 2 补查。
2. **employee_assignment 1304 条 is_deleted=true「推测为 Sprint A 清空所致」**：逻辑吻合（Sprint A 清空 1360 员工+1304 任职），但属推测，建议日后看迁移脚本确认。
3. **id_card_hash 字段未能验证**（Grep 超时）：Step1 培训回填建议「用 id_card_hash 匹配」可行性待确认——已列入 Step 2 查证。
4. **下游断裂 P0 已确诊，根因明确**（后端不回填 + 导入无联动）。这是用户核心痛点的真正病灶，但修复属功能开发，应在 ACT 序列之外立项（建议 Sprint D），不阻塞当前审计整改。

**总体判定：Step 1 ✅ 通过，可进入 Step 2。**

---

## Step 2 提示词（给 TRAE）

```markdown
# 任务：Sprint B 迁移 status 映射 SQL 一致性核查与执行版锁定（ACT-02）+ 两项遗留查证

## 背景
Step1 已验证通过：当前环境 hse_employee_relation=1304、下游三违/培训外键 100% NULL 已确诊根因（后端不回填、导入无联动）。本次聚焦 ACT-02：跨文档审查发现 status 字段映射存在 ELSE 'active' 错误 SQL，可能把离职/退休人员误标为在职。

## 目标
1. ACT-02 核心：在全部迁移相关 SQL（文档 + 实际执行脚本）中核查 status 映射，确认仅正确版进入执行包，错误版被标注作废。
2. 遗留查证 A：尝试确认 Dry Run 环境 3156 的来源（若可达），否则确认 baseline 表机制。
3. 遗留查证 B：确认 employee 表是否有 id_card_hash 列（评估 Step1 培训回填建议可行性）。

## 输入
- docs/Sprint-B-v2.1-Runbook-Final.md（§7.7 status 映射）
- docs/Sprint-B-v2.1-Baseline-Validation-Fix.md（§2.3 错误 SQL）
- docs/Sprint-B-v2.1-Status-Mapping.md（§3.1 与 §3.2 矛盾）
- docs/Sprint-B-v2.1-Production-Go-NoGo-Review.md（声称 P1-2 CLOSED）
- docs/Sprint-A-B-C-跨文档综合分析报告.md
- docs/Sprint-A-B-C-整改行动计划.md（ACT-02）
- 实际代码：server/ 下任何迁移执行脚本（migration runner、被 Runbook 引用的 .sql 文件）

## 执行动作
### A. status 映射全量核查（核心）
1. 在 docs/ 与 server/ 全仓库搜索 `ELSE 'active'` 及 status 映射片段，列出每个命中：文件、位置、上下文（前后 3 行）。
2. 读取 Runbook-Final §7.7，确认其 status 映射为显式全枚举、无 ELSE（正确版）。
3. 读取 Baseline-Validation-Fix §2.3 与 Status-Mapping §3.1/§3.2，记录冲突点。
4. 关键：找到真正会被执行的迁移脚本——Runbook 的 Step 调用了哪个 .sql 文件？还是内联在 Runbook？还是由某个 node 脚本执行？确认该执行入口里的 status 映射用哪一版。这是判定"错误 SQL 是否真会进入生产"的唯一可靠依据。
5. 若执行入口引用了错误版（含 ELSE 'active'），明确标注 文件:行，并给出改为显式映射的修改建议。
6. 若执行入口正确，则确认 Baseline-Validation-Fix §2.3 仅为文档示例、不进入执行包，标注其"非执行参考 / 已作废"。

### B. 3156 来源查证（遗留）
1. 检查是否有 Dry Run 测试环境数据库可连接（配置/凭证）。
2. 若可达：执行 `SELECT count(*) FROM hse_employee_relation WHERE is_deleted=false AND is_current=true;` 及按 is_deleted/is_current/status 维度分组，查清 3156 构成。
3. 若不可达：明确说明，并查证当前环境的 migration_baseline 表是否存在、由 Runbook 哪一步创建（查 Runbook Step 0）。

### C. id_card_hash 字段查证（遗留）
1. 查 employee 表 schema（information_schema.columns 或建表 SQL），确认是否有 id_card_hash 列。
2. 若有：说明培训回填可用 `training_records.id_card` 哈希后匹配 `employee.id_card_hash`。
3. 若无：说明 Step1 的培训回填建议需调整为"按明文 id_card 匹配"或"先给 employee 表加 id_card_hash 列"。

## 产出文档
docs/TRAE-Step2-status映射SQL锁定与执行版确认.md，含 8 章节（目标 / 环境 / 执行动作与原始结果 / 发现 / 结论 / 风险与建议 / 待办 / 证据索引）。

## 验收点（供验证者核对）
- [ ] 全仓库 ELSE 'active' 命中已列全（文件:行 + 上下文）
- [ ] 实际执行入口（非仅文档）的 status 映射版本已确认
- [ ] 错误 SQL 是否进入执行包已明确结论（是/否 + 证据）
- [ ] 3156 查证已尝试并说明结果（可达/不可达 + 数据）
- [ ] id_card_hash 是否存在已确认
- [ ] 结论区分"已证实"与"推断"

完成后将 md 路径回复验证者（Senior Developer），我将据此验证并生成 Step 3 提示词。
```

---

> 验证通过后，我将生成 Step 3（ACT-03：Sprint C 验证 SQL 实测回填）的完整提示词，继续上述循环。

---

## Step 1~7 批量审核结论（验证者：Senior Developer 吴八哥，2026-07-28）

### 总体判定
7 份文档（Step 2~7）整体质量合格、证据链基本完整，可作为整改闭环依据。但 **Step 3 有一处事实性错误需更正**，**Step 5 有一项关键 DB 声明需在生产前复核**。

### 逐份审核

**Step 2（ACT-02 status 映射锁定）✅ PASS**
- 独立复核：读取 `docs/Sprint-B-v2.1-Production-Package/02_SQL/04_B2_Assignment_Migration.sql` L140-151，确认 8 分支显式映射、无 ELSE、与 Runbook-Final §7.7 一致；全仓 Production-Package 目录 Grep `ELSE 'active'` 0 命中。生产执行 SQL 正确的结论成立。
- 遗留查证 B（id_card_hash）：本步未给出明确结论，须在 Step 10（Sprint D 回填）前确认。

**Step 3（ACT-03 Sprint C 验证）⚠️ PASS（含 1 处事实更正）**
- ✅ 已核实：`hse-employee.js` 中 `hse_employee_org` 仅 12 处注释（行号与验证者 Grep 完全一致），0 处实际 SQL；巡检 SQL 文件存在并已执行；employee_assignment 仅 1 条（TEST001）与 Step 1 一致。
- ❌ 事实错误：§3.4 称 "OrgTransferModal.vue 不存在 / Glob 未找到"。验证者 Glob 实际命中 `安全看板vben/apps/web-antd/src/views/hse/employee/components/OrgTransferModal.vue`；进一步 Grep 该文件正文，其**未引用** `hse_employee_org` / `employee_assignment` / `hse-employee` API。即：文件存在，但不是旧模型污染点。Sprint C 报告"OrgTransferModal 调用旧 API"的指控不成立。结论"前端依赖声明无法验证"应更正为"已验证：该组件未耦合旧模型"。
- 影响：不影响"代码层已迁移、数据层待 Sprint B 迁移"主结论，但需在文档中更正该子项，避免误导后续维护者。

**Step 4（ACT-05 签字补录）✅ PASS**
- 与跨文档分析报告及验证者此前读取的源文档一致：Dry Run §八、Go-NoGo §7.3、Status-Mapping §五 签字栏全空白；Go-NoGo §6.2 六项前置条件全未勾选。"PASS 不可采信 / 生产未就绪"判定成立。

**Step 5（ACT-04 空白模板补证）✅ PASS（含 1 项重点提示）**
- 三份修复文档空白/半成品状态与源文档一致。
- 🔴 关键声明：当前环境 `uk_emp_assign_primary` 索引不存在（pg_indexes 0 行）。若属实，B-2 迁移 SQL 将因 `ON CONFLICT ON CONSTRAINT uk_emp_assign_primary` 失败。但 Runbook-Final §4.7 Check 0.7 含"缺失即自动创建"逻辑（L271 `CREATE UNIQUE INDEX`），执行路径有兜底。**必须在生产 Step 0 现场复核该索引创建是否成功**，不能仅依赖声明。

**Step 6（ACT-06 B-0 偏差）✅ PASS**
- 并集恢复逻辑与 Runbook-Final §5.4（L466-480）一致；1287 vs 1285 偏差 = Dry Run 环境 her_only=2，属正常并集行为。当前环境 her_only=58 为新发现，须在生产 Step 0 Check 0.8 记录真实基线。

**Step 7（ACT-07 保留口径）✅ PASS**
- `hse-employee.js` 注释（12 行）与治理层口径一致，已核实。三类口径冲突定位准确，patch 级修改建议可落地。

### 优先级修正（基于审核）
- **P0 仍未闭环**：① 签字补录（Step 4）；② 三份修复文档补填（Step 5，含 Baseline-Fix §2.3 SQL 修正）；③ 生产 Step 0 复核 `uk_emp_assign_primary`；④ **Sprint B 数据迁移尚未执行**（Step 3 指出"当前唯一阻断项"）。
- **用户核心痛点（下游无法交互）仍属未解功能缺口**，需立项 Sprint D（见 Step 10）。

---

## Phase 2 执行序列（文档补正 + 只读保护 + 下游根因修复）

> 7 个 ACT 整改已完成"诊断与证据对齐"。Phase 2 进入"实际闭合 + 根因修复"，仍沿用 TRAE 执行 / 吴八哥验证 的循环。
> ⚠️ 铁律：所有"签字 / 验收结论"必须由对应角色人工完成，**TRAE 禁止代签或伪造 PASS**；可客观填写的项（SQL 修正、数据分布、口径文本）方可修改。

### Step 8 提示词（文档补正执行 — 闭合 ACT-02/04/07）

```markdown
# 任务：Sprint B/C 整改文档补正（授权修改，禁止代签）

## 背景
Step 2/5/7 已定位文档层缺口：Baseline-Validation-Fix §2.3 含错误 SQL、Status-Mapping §3.2 矛盾且分布空白、Constraint-Check 全空白、人员中心重构实施方案 §2.3/§3.3 与 Sprint-C 治理层口径冲突、Sprint-A 报告表述过时、TRAE-Step3 关于 OrgTransferModal 的事实错误需勘误。本次由你（TRAE）实际修改这些文档。

## 目标
1. 修正 Baseline-Validation-Fix.md §2.3 的 B-2 SQL：替换为 Runbook-Final §7.7 的 8 分支无 ELSE 版本（与 04_B2_Assignment_Migration.sql L140-151 完全一致）。
2. 修正 Status-Mapping.md：删除 §3.2（ELSE 'active' 推荐版），保留 §3.1；在 §一.1.2 回填真实分布（环境实测：active=1304、NULL=0、无其他枚举）；在 §五 签字栏**保留空白并加注"待业务/HR/DBA 人工签字，禁止代签"**。
3. Constraint-Check.md：若当前 dev 环境可安全执行 Check 0.7，则真实执行并回填 §二/§三/§四 的结果与结论；若不可执行，明确标注"待生产 Step 0 回填"，**不得伪造 PASS**。
4. 人员中心重构实施方案.md §2.3、§3.3 按 Step 7 §6.3 的 patch 修改（统一为"永久冻结只读、禁止 DROP"）。
5. Sprint-A测试验收报告.md §6.2、§9.1 按 Step 7 §6.3 的 patch 修改（标注"已于 Sprint-B B-2 + Sprint-C Phase1 完成"）。
6. 在 TRAE-Step3 文档末尾追加"勘误"小节：更正 OrgTransferModal.vue 子项（文件存在，路径见 Glob 结果；正文未引用 hse_employee_org，非旧模型污染点）。

## 输入
- docs/Sprint-B-v2.1-Baseline-Validation-Fix.md / Status-Mapping.md / Constraint-Check.md
- docs/Sprint-B-v2.1-Runbook-Final.md §7.7、04_B2_Assignment_Migration.sql L140-151
- docs/人员中心重构实施方案.md、docs/Sprint-A测试验收报告.md
- docs/TRAE-Step7-hse_employee_org保留口径统一.md §6.3、docs/TRAE-Step3-SprintC验证SQL实测回填.md
- 安全看板vben/apps/web-antd/src/views/hse/employee/components/OrgTransferModal.vue（勘误用）

## 执行动作
- 逐文件 Edit，保留原结构，仅改指定章节；每个改动 commit 到独立段落说明。
- 禁止触碰任何 SQL 执行入口、路由、接口、配置（仅文档）。
- 所有"签字/验收"栏位保持空白 + 禁止代签注记。

## 产出
更新上述文档，并在文末或单独 md 列出"修改清单（文件:章节 → 旧→新）"供验证者核对。

## 验收点（供验证者核对）
- [ ] Baseline-Validation-Fix §2.3 已无 ELSE 'active'，与 §7.7 一致
- [ ] Status-Mapping §3.2 已删除、§一.1.2 已回填真实分布、§五 未代签
- [ ] Constraint-Check 已真实回填或明确标注"待生产"
- [ ] 两份方案/报告文档口径已统一为"永久冻结只读"
- [ ] TRAE-Step3 已附 OrgTransferModal 勘误
- [ ] 无任何伪造签字/PASS
```

### Step 9 提示词（只读保护 + 巡检部署 + 索引复核）

```markdown
# 任务：hse_employee_org 只读保护落地 + 巡检部署 + uk_emp_assign_primary 复核

## 背景
Step 3/5/7 指出：代码层已无旧表写入，但数据库层只读触发器尚未创建（存在误写风险）；Sprint C 巡检 SQL 已就绪未部署；当前环境 `uk_emp_assign_primary` 索引缺失（生产 B-2 迁移依赖此索引）。

## 目标
1. 复核 `uk_emp_assign_primary` 索引：在当前（或预发）环境执行 Runbook §4.7 Check 0.7 查询，记录结果；若缺失，确认 Runbook Step 0 自动创建逻辑可成功执行（或手动预创建该唯一索引），输出创建前后证据。
2. 预校验 hse_employee_org_ReadOnly_Change.sql：检查语法、确认无代码路径仍写旧表（结合 Step 3 结论），在维护窗口（或 dev 环境）执行，验证 SELECT 成功 / INSERT/UPDATE/DELETE 被触发器阻断。
3. 部署 Employee_Model_Check.sql 为巡检任务：在 Sprint B 数据迁移完成后，配置为定时任务（cron / node scheduler），输出调度配置与首次全量执行计划（暂不自动执行，等迁移完成）。

## 输入
- docs/Sprint-B-v2.1-Runbook-Final.md §4.7
- docs/Sprint-C-v1.0/02_SQL/hse_employee_org_ReadOnly_Change.sql
- docs/Sprint-C-v1.0/02_SQL/Employee_Model_Check.sql
- server/routes/hse-employee.js（确认 0 处写入）

## 执行动作
- 索引：执行 Check 0.7 SELECT；若无效，跑 CREATE UNIQUE INDEX 并二次验证；记录 before/after 行数。
- 只读保护：dry-run 校验 SQL → 维护窗口执行 → 用测试 INSERT 验证被阻断。
- 巡检：编写调度配置（如 scripts/cron/employee_model_check.yaml 或 node 定时器），不实际跑全量（等迁移后）。

## 产出
docs/TRAE-Step9-只读保护与巡检部署.md，含索引复核证据、触发器执行证据、调度配置。

## 验收点
- [ ] uk_emp_assign_primary 存在性已确认 + 创建证据（如适用）
- [ ] 只读触发器已创建且写入被阻断（有测试证据）
- [ ] 巡检调度已配置、明确"等 Sprint B 迁移后首次全量"
```

### Step 10 提示词（Sprint D：下游交互根因修复 — 用户核心痛点）

> ✅ 本步关键前提已在本轮回合确认：`employee.id_card_hash` 列**确实存在**（hse-employee-import-v2.js:354/587/922、hse-employee.js:617/621/669 等多处引用），是规范身份键。故下游回填可用 `id_card_hash` 关联。

```markdown
# 任务：Sprint D 下游板块交互根因修复（dev 开发与验证）

你是执行者。请仅在生产迁移之外的 dev 环境工作，产出一份规范 md。
禁止修改任何迁移 SQL（Sprint-B-v2.1-Production-Package 下的 .sql）和 hse_employee_org 相关对象。

## 目标
修复"花名册导入后与其他板块无法交互"：让三违/培训等下游记录在写入时能关联 employee，
并回填历史上 violator_id / employee_id 为 NULL 的记录。

## 步骤
1. **确认关联键（必做，先查后写）**
   - 已知 employee 表有 id_card_hash 列（HMAC-SHA256 / hashSensitive，见 hse-employee-import-v2.js:353、hse-employee.js:617）。
   - 查明三违表（routes/violations.js 对应 DB 表）、培训表（routes/training.js 对应 DB 表）
     各自可用于关联 employee 的列：violator_id_card / id_card / id_card_hash / employee_no / name 等。
   - 输出每张表候选关联键清单，并判定哪个键能稳定 join 到 employee.id_card_hash
     （下游存明文身份证则先用 hashSensitive 算 hash 再 join；存姓名且重名风险高须标注可靠性风险）。

2. **开发写入路径修复（代码层）**
   - 修改 violations.js 写入逻辑（约 L167）：INSERT/UPDATE 时解析 employee.id 回填 violator_id
     （解析不到时如何处理——留 NULL+WARN 还是阻断——显式决定并说明理由）。
   - 修改 training.js 写入逻辑（约 L353/473）：同理回填 employee_id。
   - 给出精确代码 diff（文件:行号 + 改前/改后），不破坏现有接口契约。

3. **开发历史数据回填脚本（dev 可测）**
   - 写 UPDATE SQL / node 脚本：将三违/培训表 violator_id/employee_id 为 NULL 的记录，
     通过步骤1键 join employee.id_card_hash 回填。
   - dev 样本数据跑通：先 SELECT 估算可回填比例，再 UPDATE，再 SELECT 复核。
   - 输出可回填/不可回填条数及不可回填原因（如缺关联键）。

4. **验证**
   - 用 1 条带关联键的新造三违/培训记录走写入路径，确认 violator_id/employee_id 被填上。
   - 确认巡检视图 v_employee_assignment_health 不受影响（本步不改 employee_assignment）。

5. **生产门控说明（重要）**
   - md 中明确：步骤3历史回填脚本**不得在 dev 之外执行**；
     生产回填须在 Sprint B 生产迁移（B-0/B-2）完成且 DBA 签字后，由 DBA 在生产库执行。

## 产出
- 文档：docs/TRAE-Step10-下游交互根因修复.md
  章节：①环境与权限 ②关联键调查结果 ③代码 diff ④回填脚本与 dev 实测 ⑤验证结果
        ⑥生产门控说明 ⑦证据索引（文件:行号）⑧遗留/需决策项
- 改动文件清单（仅限 violations.js / training.js / 新建回填脚本，禁动迁移 SQL 与旧表）
- 签字栏留空，禁止代签。
```

### Step 10 验收点（验证者逐条核对）
| # | 验收项 | 通过标准 |
|---|--------|----------|
| 1 | 关联键调查 | 明确列出三违/培训表候选键，判定哪个能 join employee.id_card_hash |
| 2 | 写入路径修复 | violations.js / training.js 的 diff 真实存在且可编译，回填逻辑闭合 |
| 3 | 回填脚本 | dev 实测：可回填/不可回填条数清晰，SELECT 前后复核一致 |
| 4 | 未越界 | 未改迁移 SQL、未改 hse_employee_org、未代签 |
| 5 | 生产门控 | md 明确标注回填脚本生产执行前置条件（迁移完成 + DBA 签字） |
| 6 | 证据索引 | 每个结论附文件:行号，可独立复核 |

> ⚠️ 若三违/培训表完全无关联 employee 的键（既无身份证也无工号），属**阻断项**：md 中明确指出并建议替代方案（如业务重新导入带身份证字段）。生产回填为 DBA 职责，本步只做 dev 开发与脚本准备。

> Phase 2 建议从 **Step 8（文档补正）** 起步——它是生产迁移放行的文档前提且零风险；随后 Step 9（保护+索引，生产前必做）；最后 Step 10（Sprint D，解决用户核心痛点）。每一步完成后回复给验证者（吴八哥）审核，再进入下一步。

---

## Step 12 提示词（生产放行门控 Runbook — DBA/运维执行，TRAE 起草）

> **定位**：Step 1~11 全部为 dev 侧开发与文档整改，已验证通过。本步是**真正让生产环境打通下游交互**的唯一剩余动作，但**执行权在 DBA/运维（需生产库访问 + 签字）**，TRAE 仅负责起草一份自包含、可逐步照做的执行门控 Runbook，**不得自行执行任何生产语句**。

```markdown
# 任务：起草《生产放行执行门控 Runbook》（Sprint B 迁移 + Sprint D 回填 + 端到端验证）

## 背景
- dev 侧已全部就绪：employee_assignment 为唯一事实来源（Step 1~2）；
  hse_employee_org 已加只读触发器、巡检定时任务部署（Step 9）；
  后端写入路径已回填外键、前端已打通身份证录入字段、回填脚本已加生产硬拦截（Step 10~11）。
- 生产环境"花名册导入后与其他板块无法交互"的根因（下游 violator_id/employee_id 全 NULL）尚未在生产消除——
  因为 Sprint B 生产迁移（B-0/B-2）与历史数据回填都还没在生产库执行，且需签字放行。
- 本步目标：产出一份 DBA/运维可逐步照做的生产执行 Runbook，把所有前置条件、执行顺序、回滚、签字固化下来。

## 执行动作（TRAE 只写文档，不执行）
1. **Preflight 索引复核**：明确 `uk_emp_assign_primary` 在生产库的存在性检查 SQL（Step 9 已确认 dev 缺失、Runbook §4.7 有"缺失即自动创建"兜底）；
   在 Runbook 的"Step 0"写入该检查 SQL，并附"若不存在则用如下 DDL 创建"的语句（引用 Runbook-Final §4.7 Check 0.7）。
2. **只读触发器确认**：写入生产库验证 `trg_hse_employee_org_block` 已生效的 SQL（Step 9 部署的触发器），
   作为迁移前冻结确认项。
3. **Sprint B 迁移执行步骤**：引用已验证正确的执行包（Sprint-B-v2.1-Production-Package，status 映射为 8 分支无 ELSE 版，Step 2 已确认），
   按 B-0（employee 恢复）→ B-2（employee_assignment 迁移）顺序，写明每步命令、预期影响行数（B-0 ~1287、B-2 以生产库实际基线为准）、回滚策略。
4. **迁移后基线校验**：写入动态基线校验 SQL（migration_baseline 表 / 偏差 0% 判定），引用 Runbook-Final 对应章节。
5. **历史数据回填步骤**：写入 `node server/scripts/backfillEmployeeId.cjs --dry-run` 在生产库先预估（预期：培训 unmatched=100、三违 noName=673 不可自动关联）；
   预估无误后，写明"DBA 签字 → 移除 NODE_ENV 临时执行实际回填"的门控流程（脚本硬拦截已在 Step 11 部署）。
6. **巡检调度启用决策**：当前 `HEALTH_CHECK_ENABLED=false`（Step 9 为 dev 安全默认）；
   在 Runbook 写明生产是否启用（建议 true + cron `0 2 * * *` + Asia/Shanghai），由运维决定并标注。
7. **端到端验证**：给出抽样验证方法——取 1 条已回填三违/培训记录，确认下游板块能显示/联动人员；
   并明确 673/890 条无姓名无身份证的记录"业务补录"为后续流程，不阻塞本次放行。
8. **签字栏**：含 DBA、后端、前端、业务负责人四栏，留空，禁止代签。

## 输入（TRAE 应引用并核对）
- docs/Sprint-B-v2.1-Runbook-Final.md、docs/Sprint-B-v2.1-Production-Package/（已验证执行包）
- docs/TRAE-Step9-只读保护与巡检部署.md（触发器+巡检+索引复核结论）
- docs/TRAE-Step10-下游交互根因修复.md、docs/TRAE-Step11-前端打通与脚本加固.md（dev 就绪声明）
- server/scripts/backfillEmployeeId.cjs（生产硬拦截已部署）

## 产出
- docs/TRAE-Step12-生产放行执行门控Runbook.md
  章节：①适用范围与前置 ②Step 0 Preflight（索引+触发器复核）③Sprint B 迁移执行（B-0/B-2+回滚）
  ④迁移后基线校验 ⑤历史回填（dry-run 预估→签字→执行）⑥巡检启用决策 ⑦端到端验证
  ⑧签字栏（留空）⑨证据索引
- 铁律：TRAE 不执行任何生产语句、不改迁移 SQL、不代签。

## 验收点（验证者逐条核对）
- [ ] Runbook 自包含、顺序正确、每步有回滚
- [ ] 索引/触发器 Preflight SQL 真实可执行（引用 Step 9 结论）
- [ ] 引用的迁移包为已验证正确版（无 ELSE 'active'）
- [ ] 回填明确 dry-run 前置 + DBA 签字门控
- [ ] 673/890 不可关联记录已如实标注为业务补录
- [ ] 签字栏留空、无代签
```

> ⚠️ Step 12 是**收口步**：TRAE 起草后由验证者（吴八哥）审核，再交付 DBA/运维执行。DBA 执行完并签字后，整个"花名册导入后与其他板块无法交互"问题方在生产环境闭环。TRAE 的 dev 侧任务到此全部完成。

---

## Step 13 提示词（Runbook 缺陷修订 — 收口前必做）

> **背景**：验证者审核 `TRAE-Step12-生产放行执行门控Runbook.md` 发现 2 处会影响生产安全的缺陷（status 映射本身正确，无需改）。TRAE 仅修订文档，不碰代码/数据。

```markdown
# 任务：修订《生产放行执行门控 Runbook》的 2 处缺陷

## 缺陷 1（重要）：B-2 迁移 SQL 与已验证生产包不一致 + 执行指向模糊
- 现状：Runbook §3.2 B-2-4 内联了一段"简化重写"的迁移 SQL，与已验证正确的
  `docs/Sprint-B-v2.1-Production-Package/02_SQL/04_B2_Assignment_Migration.sql` 不一致：
  (a) 内联版用 `migration_id='B2_PROD_'`，生产包用 `'B2_20260728'`；
  (b) 内联版**删掉了生产包的异常日志 `b2_anomaly_log` 与行数范围硬校验**
      （生产包 L208-215：偏差 >2% 直接 `RAISE EXCEPTION` 中止）；
  (c) Runbook 没明确告诉 DBA「执行生产包文件」，只给了内联 SQL，DBA 可能跑弱化版。
- 修订动作：
  1. 在 §3.2 顶部加醒目说明：「**DBA 必须执行已验证生产包文件
     `docs/Sprint-B-v2.1-Production-Package/02_SQL/04_B2_Assignment_Migration.sql`，
     不要手动执行本 Runbook 内联 SQL；本内联 SQL 仅作逻辑说明。**」
  2. 保留内联 SQL 作为参考，但在其上方标注「参考摘录，以生产包为准」，
     并补一句：若坚持用内联版，须补齐 `b2_anomaly_log` 异常捕获与
     `IF insert_count 超基线 2% 则 RAISE EXCEPTION` 的硬校验，且 `migration_id` 改为 `'B2_20260728'`。
  3. §4 动态基线校验的 `migration_id` 说明里提示：若执行生产包，基线键为 `'B2_20260728'`，
     须与生产包一致（不要混用 `B2_PROD_`）。

## 缺陷 2（回滚缺口）：B-0 全量回滚引用了不存在的备份表
- 现状：Runbook §3.1 B-0-5「全量回滚」SQL 引用 `employee_b0_backup_20260728`，
  但 Runbook 全程从未创建该表（只建了临时表 `temp_b0_recover_ids`）。
  会话断开需全量回滚时，备份表不存在 → 回滚失败。
- 修订动作：
  在 §3.1 B-0-1（恢复前快照）之后新增一步「B-0-1.5 创建全量备份表」：
  ```sql
  DROP TABLE IF EXISTS employee_b0_backup_20260728;
  CREATE TABLE employee_b0_backup_20260728 AS
  SELECT * FROM employee
  WHERE id IN (SELECT employee_id FROM temp_b0_recover_ids);
  ```
  （或：直接说明 B-0 执行依赖生产包中创建该备份表的步骤，Runbook 不重复创建——二选一，须明确。）
  并在回滚策略表中注明该表来源。

## 验收（验证者核对）
- [ ] §3.2 已明确「执行生产包文件，内联 SQL 仅供参考」
- [ ] 内联 SQL 标注参考性质，且说明补齐 anomaly/范围校验 + migration_id 一致性的要求
- [ ] §4 baseline 的 migration_id 与生产包对齐说明
- [ ] B-0 全量回滚引用的 `employee_b0_backup_20260728` 已被创建或明确来源
- [ ] 未改动任何迁移 SQL 正文、未代签
```

> ⚠️ Step 13 完成后，Runbook 方具备交付 DBA 执行的条件。之后由验证者做最终放行判定，不再生成 TRAE 执行提示词。

---

## 🏁 最终放行判定（验证者：Senior Developer 吴八哥 · 2026-07-28 复审 v1.1）

**结论：✅ 批准交付 DBA / 运维执行（Go-Live 放行）。**

### 复审证据（本轮已逐条核实）
- Step 13 两项 P0 缺陷均已落地：§3.2 明确"执行生产包 `04_B2_Assignment_Migration.sql`"且内联版补齐 `b2_anomaly_log` + `±2% RAISE EXCEPTION`；B-0-1.5 已创建 `employee_b0_backup_20260728`，全量回滚引用有效。
- status 映射 9 分支无 ELSE，内联版（Runbook L356-366）与生产包（L140-151）逐行一致，ACT-02 修复精华未退化。
- 7 个 ACT（01~07）全部有对应闭环证据；签字栏全留空、禁代签。

### 残留须知（P2，非阻断，DBA 执行时留意）
- **B-2 回滚备份表名不一致**：生产包创建 `employee_assignment_b2_backup_20260728`（L18），Runbook §3.2 回滚表（L409）/B-2-1（L252）写的是 `employee_assignment_b2_backup_prod`。DBA 执行生产包后，回滚应认 `..._20260728` 这张真实生成的表，勿照 Runbook 内联名找。
- **内联版 anomaly_log 语义不同**（仅参考、不执行）：内联版记录 `resigned/retired/dismissed/leave`（已知映射），生产包记录真正未映射 status。不影响生产执行。

> ⚠️ **重要更正（Step 14 彩排后）**：上面"不再生成 TRAE 执行提示词"的前提被 Step 14 Dev 彩排推翻——彩排在 dev 真实执行生产包时，B-2 迁移**失败**，暴露 2 处此前所有审核均遗漏的 SQL 缺陷（P0: `ON CONFLICT ON CONSTRAINT` 误用于部分唯一索引；P1: `migration_backup_registry.description` 列名错误）。故新增 **Step 15** 修订生产包/Runbook，修订后必须重跑彩排确认 B-2 跑通，DBA 方可执行正式迁移。验证者此前对 Step 2/12/13 的"✅ 通过"结论仅覆盖 status 映射，**未覆盖 `ON CONFLICT` 与索引类型的兼容性**——此盲区由 Step 14 彩排补上。

---

## 🏁 最终放行判定（验证者：Senior Developer 吴八哥 · 2026-07-28 收口 v1.3-ready）

**结论：✅ dev 侧 16 步全部收口，生产包/Runbook 已最终就绪，可交付 DBA 执行（Go-Live 放行）。TRAE 提示词时代结束，不再生成新 TRAE 执行提示词。**

### 收口证据（本轮已独立 Grep 核实实际文件）
- **P0 `ON CONFLICT` 语法**：生产包 L170 / Runbook L389 均为 `ON CONFLICT (employee_id) WHERE is_primary=true AND is_current=true AND is_deleted=false`（部分索引语法正确）。`ON CONFLICT ON CONSTRAINT` 在生产包 L14、Runbook L11/L763 仅作为**修订记录注释/引用**出现，可执行 SQL 0 残留。
- **P1 字段名**：Runbook 可执行 SQL（L152/L268）均为 `remark`；`migration_backup_registry.*description` 仅在 Runbook L9/L10/L12/L764 修订记录引用，可执行 SQL 0 残留。
- **P2 回滚表名**：Runbook L262/L423 与 生产包 L24/L28 均为 `employee_assignment_b2_backup_20260728` / `B2_EA_20260728`；`..._prod` 仅在 Runbook L15/L16/L777/L779 修订记录引用，已对齐。
- **status 映射 8 分支无 ELSE**：生产包 L147-158 未触碰，ACT-02 精华保留。
- **dev 全链路彩排**：B-0 → B-2（真实生产包文件）→ 基线校验 → E2E，B-2 `insert_count=1304, anomaly=0, 偏差 0.00%` PASS。
- **签字栏全留空、禁代签**。

### 诚实标注的残留缺口（不阻塞交付）
- **三违 E2E 在 dev 彩排因 403 权限未真跑通**（dev admin 缺 `hse:site-mgmt:violations`）；核心逻辑 `resolveViolatorId` 已代码验证、与培训共用 `hashSensitive` 路径。**生产环境必须由真实有权限账号补齐此步**（见 `DBA-Final-放行审核清单.md` 第二章）。

### 下一步（非 TRAE 提示词，是 DBA 执行 + 验证者收尾）
- DBA 按 `DBA-Step-生产放行确认清单.md` + 已验证 `TRAE-Step12`（v1.3-ready）+ 生产包 v1.2-fix 执行 7 步并签字。
- 验证者按 `DBA-Final-放行审核清单.md` 审核 DBA 交回证据 + 生产 E2E 补验 + 出具最终闭环意见。
- ⚠️ **必须先澄清 DBA 执行状态**：若 DBA 已按含 P0 缺陷的旧版执行过，生产库可能处于失败态，需先救场（见审核清单"必须先澄清"段）。
- ⚠️ **数据库闭环 ≠ 功能闭环**：新代码（Step 1~11）必须也已部署生产，否则新建记录外键仍 NULL。

> 至此，从"花名册导入后与其他板块无法交互"的原始痛点出发，经 13 份审计报告 → 16 步 TRAE 执行/验证闭环，dev 侧全部就绪，等待生产放行最终闭环。

---

## Step 15 提示词（生产包/Runbook 缺陷修订 — P0/P1，对应 Step 14 彩排暴露）

```markdown
# 任务：修订生产包与 Runbook 中 Dev 彩排暴露的 2 处 SQL 缺陷（Step 15）

## 背景
Step 14 在 dev 真实执行生产包 `04_B2_Assignment_Migration.sql` 时 B-2 失败：根因是 `uk_emp_assign_primary` 为 PostgreSQL 部分唯一索引（PARTIAL UNIQUE INDEX，Runbook §2.1 L59-63），不是 CONSTRAINT，而 SQL 用 `ON CONFLICT ON CONSTRAINT <name>`（该语法仅支持真正 CONSTRAINT）。带进生产必失败。另：`migration_backup_registry` 真实列名是 `remark` 非 `description`。

## 必须修订（精确位置）
- P0 `ON CONFLICT`：`04_B2_Assignment_Migration.sql` L162、`TRAE-Step12-生产放行执行门控Runbook.md` L375
  - 旧：`ON CONFLICT ON CONSTRAINT uk_emp_assign_primary`
  - 新：`ON CONFLICT (employee_id) WHERE is_primary = true AND is_current = true AND is_deleted = false`
- P1 列名：`TRAE-Step12-生产放行执行门控Runbook.md` L141、L255
  - 旧：`INSERT INTO migration_backup_registry (backup_id, backup_table, description)`
  - 新：`INSERT INTO migration_backup_registry (backup_id, backup_table, remark)`

## 明确不改（已验证正确）
- status 映射 8 分支无 ELSE（L140-151 / Runbook L356-366）
- 索引 DDL（Runbook §2.1 L59-63，部分唯一索引定义正确）
- b2_anomaly_log、±2% 硬校验、回填脚本生产硬拦截

## 修订后回归验证（dev，复用 Step 14 脚本）
1. 重跑生产包文件：`psql ... -f docs/Sprint-B-v2.1-Production-Package/02_SQL/04_B2_Assignment_Migration.sql`
   期望：不再报"约束不存在"；insert_count=1304, baseline=1304, anomaly=0, 偏差 0.00%
2. 重跑 B-0-1.5 备份登记：确认 `remark` 列不再报"字段不存在"
3. 重跑基线校验 + 端到端（Step 14 §六/§九）仍 PASS

## 产出
docs/TRAE-Step15-生产包与Runbook缺陷修订.md（旧/新行 diff + 回归输出 + 版本号 v1.2-fix + 未代签声明）

## 验收点
- [ ] 生产包 L162 与 Runbook L375 已改 `(employee_id) WHERE is_primary=true AND is_current=true AND is_deleted=false`
- [ ] Runbook L141、L255 的 `description`→`remark`
- [ ] status 映射/索引 DDL/硬拦截未动
- [ ] 修订后重跑生产包，B-2 在 dev 真实跑通（insert_count=1304, anomaly=0, 偏差 0%）
- [ ] B-0-1.5 不再报字段错误
- [ ] 版本号标注 v1.2-fix
```

- **673/890 三违记录**无姓名无身份证，永久无法自动关联，已划归业务补录，不阻塞本次放行。

### 下一步（不再是 TRAE 提示词，而是 DBA 执行）
TRAE 的 dev 侧 13 步任务**全部验证通过收口**。后续动作移交 DBA / 运维：
1. 按 Runbook 顺序执行（Preflight → B-0 → B-2 → 基线校验 → 历史回填 dry-run→签字→执行 → 巡检启用 → E2E 验证）。
2. 每步签字栏现场人工签字，**禁止代签**。
3. 执行前重点确认两处：uk_emp_assign_primary 索引存在、hse_employee_org 只读触发器已部署。
4. 交付物：`docs/DBA-Step-生产放行确认清单.md`（执行前 5 点确认 + 顺序 + 签字门控）。

> TRAE 不再有执行提示词；所有后续代码改动门控已就位（回填脚本生产硬拦截、旧表只读触发器）。执行期如遇异常，由 DBA 按 Runbook 回滚方案处置并回报。

---

## Step 14 提示词（生产放行清单 Dev 彩排 — TRAE 例外 dev 任务）

> **新增说明**：上条"TRAE 不再有执行提示词"指生产执行类任务已收口。本 Step 14 是**新追加的 dev 彩排任务**——为降低 DBA 正式执行风险，让 TRAE 在 dev 把 DBA 清单 7 步完整走一遍，产出"每步可否跑通 + 实际输出 + 坑点"的证据。**严格 dev-only，不碰生产、不代签**。

```markdown
# 任务：生产放行清单 Dev 彩排（Rehearsal）

## 性质与硬边界
- DEV ONLY：严禁连接生产库、严禁生产连接串、严禁在生产执行任何 SQL。
- 不代签：签字栏归 DBA/业务负责人现场人工填，TRAE 不得模拟或代填。
- 不改冻结物：04_B2_Assignment_Migration.sql、hse_employee_org_ReadOnly_Change.sql、Runbook v1.1 内容保持不变，只执行 + 报告。
- dev 是沙箱：允许真实执行迁移与回填验证端到端，但执行前须记录 dev 当前行数基线便于回溯。

## 目标
验证 DBA 清单 7 步在真实 dev 环境每步可执行；重点验证端到端联动：跑完 B-2 + 回填后，新建带身份证号的三违/培训记录，确认 violator_id/employee_id 被正确填充。

## 输入
docs/DBA-Step-生产放行确认清单.md、docs/TRAE-Step12-生产放行执行门控Runbook.md（v1.1）、
docs/Sprint-B-v2.1-Production-Package/02_SQL/04_B2_Assignment_Migration.sql、
docs/Sprint-C-v1.0/02_SQL/hse_employee_org_ReadOnly_Change.sql、server/scripts/backfillEmployeeId.cjs

## 执行步骤（对应 DBA 清单 7 步）
0. Dev 行数基线快照（employee/employee_assignment/violation_records/training_records 行数 + 各自 NULL 外键数）。
1. Preflight：查 uk_emp_assign_primary 索引、hse_employee_org 只读触发器 3 个是否存在；缺失则在 dev 实际创建验证 DDL。
2. B-0：按 Runbook B-0-1.5 在 dev 建 employee_b0_backup_20260728，演练恢复 SQL 可执行。
3. B-2：执行生产包文件 04_B2_Assignment_Migration.sql，记录新增行数、是否触发 b2_anomaly_log / ±2% RAISE EXCEPTION，status 映射确认无 ELSE。
4. 基线校验：对比迁移前后 employee_assignment 行数偏差百分比。
5. 历史回填：必做 node scripts/backfillEmployeeId.cjs --dry-run 预估；可选在 dev 真实执行验证写入路径；并用 NODE_ENV=production 不带 --dry-run 验证脚本 exit(1) 硬拦截。
6. 巡检：仅报告 HEALTH_CHECK_ENABLED 当前值与 cron 配置，不强制启用。
7. 端到端：API 新建带身份证号的三违/培训记录，确认 violator_id/employee_id 填充；抽样历史回填记录确认关联。

## 产出
docs/TRAE-Step14-生产放行清单Dev彩排.md：环境声明 + 步骤0基线 + 步骤1~7（命令+输出+PASS/FAIL+DBA提醒）+ 端到端结果 + 整体结论 + 证据索引。

## 验收点
- [ ] 明确 dev-only，无生产连接
- [ ] 步骤0基线已记录
- [ ] Preflight 索引+触发器实际状态已报告
- [ ] B-2 在 dev 真实执行、行数已记录、status 无 ELSE
- [ ] 基线偏差百分比已给
- [ ] 回填 --dry-run 预估已报告
- [ ] 生产硬拦截 NODE_ENV=production 无 --dry-run → exit(1) 已验证
- [ ] 端到端新建记录 FK 填充已验证
- [ ] 未改冻结 SQL/文档、未代签
- [ ] 产出含证据索引
```

> Step 14 由 TRAE 在 dev 执行并产出 md，验证者（吴八哥）审核后，DBA 清单即具备"已彩排、风险已排"的状态，可放心交付 DBA 正式执行。

---

## 🏁 最终放行判定（二次更正 · 2026-07-28 Step 15 审核后）

**结论：v1.2-fix 生产包 + Runbook 的 P0/P1 已修复并经验证者独立核对正确，但交付 DBA 前仍差 Step 16 一处 P2 清理（回滚表名不一致）。**

### 验证者本轮已独立核实（事实）
- 生产包 `04_B2_Assignment_Migration.sql` L13-18（v1.2-fix 头）、L169-170（`ON CONFLICT (employee_id) WHERE is_primary=true AND is_current=true AND is_deleted=false`）、L147-158（8 分支无 ELSE）、L216-223（±2% 硬校验）**全部正确，与 Runbook §2.1 索引 DDL 谓词逐字吻合**。
- Runbook v1.2-fix：L7 版本号、L9-13 修订记录、L147-148 / L262-263（`remark`）、L383-384（ON CONFLICT 正确语法）、L754-764（§⑪ 修订表）**全部正确**。
- **残留 P2**：Runbook §3.2 B-2-1(L258) / B-2-5(L419) 引用的 `employee_assignment_b2_backup_prod` 与生产包实际创建的 `employee_assignment_b2_backup_20260728` 不一致 → DBA 走 B-2 回滚会找不到表。须在 Step 16 对齐。

### 状态定性
- 我此前对 Step 2/12/13 的"✅ 通过/批准放行"**仅覆盖 status 映射**，漏掉 `ON CONFLICT` 兼容性；Step 14 彩排补上，Step 15 修复。现已实质正确。
- **DBA 执行状态仍未确认**（用户称"签字了"但未说明是否执行原包）：若已按 v1.1 原包执行，B-2 必失败 → 生产处于部分/失败态，需立即澄清并评估回滚重来；若仅签字未执行，现在改用 v1.2-fix 即可。

---

## Step 16 提示词（pre-DBA 就绪清理 + 全链路彩排 — TRAE dev 侧最后一环）

> **新增说明**：Step 15 已修复 P0/P1 并经验证者独立核对。本 Step 16 是交付 DBA 前最后清理：对齐回滚表名 + 全仓清零残留旧语法/旧字段名 + 一次全链路 dev 彩排，产出"pre-DBA 就绪"凭证。**dev-only、不代签、不引入新逻辑**。

```markdown
# 任务：生产包最终就绪确认（交付 DBA 前清理 + 全链路彩排）

## 背景
验证者已独立核对 Step 15 修订：生产包 L169-170、Runbook L147-148/L262-263/L383-384 的 ON CONFLICT 语法与 description→remark 改动全部正确。但发现 1 处 P2 残留：生产包实际创建 B-2 备份表 `employee_assignment_b2_backup_20260728`（L24-26+注册 B2_EA_20260728），而 Runbook §3.2 B-2-1(L258) / B-2-5(L419) 仍引用 `employee_assignment_b2_backup_prod`，DBA 走 B-2 回滚会找不到表。本步交付前必须对齐。

## 目标
1. 全仓清零残留：生产包+Runbook 不得再出现 `ON CONFLICT ON CONSTRAINT`、`migration_backup_registry (..., description)`。
2. 修复回滚表名 P2：Runbook §3.2 B-2-1(L258-260) 与 B-2-5(L419) 的 `employee_assignment_b2_backup_prod` → `employee_assignment_b2_backup_20260728`；B-2-1 注册键 `B2_EA_PROD` → `B2_EA_20260728`。
3. 全链路 dev 彩排：连 dev 库按 Runbook 顺序跑 B-0（含 B-0-1.5 用 remark）→ B-2（执行真实生产包文件）→ 基线校验 → E2E（新建培训/三违填身份证确认 FK 填充），产出单一 pre-DBA 就绪证据。
4. 版本标注：保持 v1.2-fix，§⑪ 追加"pre-DBA 就绪确认（Step 16）"行。

## 铁律
DEV ONLY（严禁连生产）；不代签；不引入新逻辑；不改动 status 映射/索引 DDL/硬拦截/±2% 校验。

## 验收点
- [ ] 生产包 Grep `ON CONFLICT ON CONSTRAINT` → 0 命中
- [ ] Runbook Grep `migration_backup_registry (..., description)` → 0 命中
- [ ] Runbook B-2-1/B-2-5 回滚表名 = `employee_assignment_b2_backup_20260728`；注册键 = `B2_EA_20260728`
- [ ] dev 全链路彩排 B-2 insert_count=1304, anomaly=0, 偏差 0.00% PASS
- [ ] E2E FK 填充正常（培训 employee_id / 三违 violator_id 由身份证号关联）
- [ ] 签字栏留空
- [ ] 产出 docs/TRAE-Step16-生产包最终就绪确认.md

## 产出
docs/TRAE-Step16-生产包最终就绪确认.md（残留清零证据 + 回滚表名 diff + 全链路彩排输出 + 验收点 + 证据索引）。
```

> ⚠️ Step 16 是 TRAE 在 dev 侧的最后一环。它交回 `docs/TRAE-Step16-生产包最终就绪确认.md` 并通过验证后，验证者做最终放行判定 → v1.2-fix 生产包 + Runbook 正式交付 DBA 执行 + 签字。**之后不再生成 TRAE 执行提示词。**
