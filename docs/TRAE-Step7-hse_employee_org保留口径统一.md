# TRAE Step 7：hse_employee_org 保留口径统一（ACT-07）

> **文档版本**：v1.0
> **执行日期**：2026-07-28
> **执行环境**：本地静态分析（无需数据库访问）
> **执行人**：TRAE
> **对应 ACT**：ACT-07
> **优先级**：P2（不阻断生产迁移）

---

## 1. 目标

1. **复核跨文档对 `hse_employee_org` 的处置表述**：扫描 Sprint-A / Sprint-B / Sprint-C / 人员中心重构实施方案等关键文档，定位口径不一致点。
2. **统一保留口径**：在人员中心重构总方案层面统一为「旧表冻结只读（仅审计用途），写入全部走 `employee_assignment`，禁止 DROP / TRUNCATE」。
3. **输出具体修改建议**（patch 级别）：作为待办交由验证者审核，由授权人员执行文档更新。
4. **不修改任何业务代码、SQL、路由、接口、配置**（仅做文档层面统一）。

---

## 2. 环境与权限

| 项目 | 状态 | 说明 |
|------|------|------|
| 数据库访问 | 否 | 本任务为文档口径统一，无需访问 DB |
| 代码访问 | 是 | 阅读 `server/routes/hse-employee.js` 注释与 Sprint-C 报告 |
| 文档访问 | 是 | 阅读 `docs/` 下相关方案、审计、治理、报告文档 |
| 写入权限 | 仅本 md 文档 | 不修改其他文档与代码，修改建议以 patch 形式列入待办 |
| 执行方式 | 静态文档比对 + 代码注释核对 | — |

---

## 3. 执行动作与原始结果

### 3.1 跨文档口径扫描

扫描以下 7 份关键文档中对 `hse_employee_org` 的处置表述：

| # | 文档 | 章节 | 原文表述 | 口径分类 |
|---|------|------|----------|----------|
| 1 | [Sprint-A测试验收报告.md](file:///F:/hse-dashboard/docs/Sprint-A测试验收报告.md) | §6.2 范围外问题 | "V1 和 V2 同时写入 `hse_employee_org` 和 `employee_assignment`，导致双任职关系并存" → 建议 Sprint B 处理 | **未明确长期保留策略** |
| 2 | [Sprint-A测试验收报告.md](file:///F:/hse-dashboard/docs/Sprint-A测试验收报告.md) | §9.1 Sprint B 准备 | "迁移 `hse_employee_org` 历史数据到 `employee_assignment`" | **表述为「迁移」，未提冻结/只读** |
| 3 | [人员中心重构实施方案.md](file:///F:/hse-dashboard/docs/人员中心重构实施方案.md) | §2.2 表职责定义 | `hse_employee_org` → "冻结，不再写入，仅保留读取兼容" | **冻结只读** ✅ |
| 4 | [人员中心重构实施方案.md](file:///F:/hse-dashboard/docs/人员中心重构实施方案.md) | §2.3 兼容方案 | 短期："停止写入、现有数据保留只读"；中期："将 `hse_employee_org` 中 `is_current=true` 的历史数据迁移到 `employee_assignment`"；长期："前端改为从 `employee_assignment` + `employee_history` 获取，**完成后可废弃** `hse_employee_org`" | **「可废弃」与永久保留口径冲突** ⚠️ |
| 5 | [人员中心重构实施方案.md](file:///F:/hse-dashboard/docs/人员中心重构实施方案.md) | §3.3 | "保留，冻结写入"；"不删除表，不删除数据"；"`hse-employee.js` 中的写入接口改为写入 `employee_assignment`" | **冻结只读** ✅ |
| 6 | [Sprint-C-Phase1-API-Convergence-Report.md](file:///F:/hse-dashboard/docs/Sprint-C-Phase1-API-Convergence-Report.md) | §八 已规避 / §九 后续迭代 | "保留 `hse_employee_org` 用于审计和历史追溯"；建议"执行 `hse_employee_org_ReadOnly_Change.sql` 禁止旧表写入" | **冻结只读** ✅ |
| 7 | [Sprint-C-v1.0/03_Governance/Legacy_Table_Lifecycle_Report.md](file:///F:/hse-dashboard/docs/Sprint-C-v1.0/03_Governance/Legacy_Table_Lifecycle_Report.md) | §二 / §三 / §六 | 状态：冻结；处理：保留；操作：禁止 INSERT/UPDATE/DELETE/DROP/TRUNCATE，允许 SELECT；远期归档（待业务确认） | **冻结保留 + 永久只读** ✅ |
| 8 | [Sprint-C-v1.0/03_Governance/Employee-Center-Data-Governance-v1.0.md](file:///F:/hse-dashboard/docs/Sprint-C-v1.0/03_Governance/Employee-Center-Data-Governance-v1.0.md) | §1.3 旧表状态 | `hse_employee_org` → 冻结 → ✅ SELECT / ❌ INSERT/UPDATE/DELETE/DROP，"只读审计表，历史归档用" | **冻结保留 + 永久只读** ✅ |
| 9 | [Sprint-C-v1.0/02_SQL/hse_employee_org_ReadOnly_Change.sql](file:///F:/hse-dashboard/docs/Sprint-C-v1.0/02_SQL/hse_employee_org_ReadOnly_Change.sql) | 头部注释 | "将 `hse_employee_org` 表冻结为只读状态，禁止 INSERT/UPDATE/DELETE"；"旧模型仅作历史查询" | **冻结只读** ✅ |
| 10 | [Sprint-B-Pre实施前风险确认报告.md](file:///F:/hse-dashboard/docs/Sprint-B-Pre实施前风险确认报告.md) | §四 依赖审计 | 列出 `hse-employee.js` 24 处引用（19 处业务逻辑、5 处注释），标注迁移工作量 | **审计时点状态**（已被 Sprint-C Phase1 覆盖） |

### 3.2 代码层实际状态核对

`server/routes/hse-employee.js` 当前注释（[L22-L24](file:///F:/hse-dashboard/server/routes/hse-employee.js#L22-L24)）：

```javascript
 *   - 人员组织关系从 hse_employee_org 迁移至 employee_assignment
 *   - hse_employee_org 已冻结为只读（仅供审计）
```

`hse-employee.js` 中 `hse_employee_org` 全部引用清单（Grep 命中 12 行）：

| 行号 | 类型 | 内容 |
|------|------|------|
| 22 | 注释 | "人员组织关系从 hse_employee_org 迁移至 employee_assignment" |
| 24 | 注释 | "hse_employee_org 已冻结为只读（仅供审计）" |
| 525 | 注释 | "Sprint-C Phase 1: 使用 employee_assignment 替代 hse_employee_org" |
| 571 | 注释 | 同上 |
| 733 | 注释 | 同上 |
| 776 | 注释 | "Sprint-C Phase 1: 使用 employee_assignment + hse_org_unit 替代 hse_employee_org" |
| 846 | 注释 | 同上 |
| 1137 | 注释 | "四、人员组织关系维护 (hse_employee_org 表)" — 旧模块标题保留 |
| 1141 | 注释 | "Sprint-C Phase 1: 使用 employee_assignment 替代 hse_employee_org" |
| 1178 | 注释 | 同上 |
| 1213 | 注释 | 同上 |
| 4380 | 注释 | 同上 |

**结论**：`hse-employee.js` 中 `hse_employee_org` **仅余 12 处注释引用，0 处实际 SQL 操作**。代码层口径已与 Sprint-C 治理层一致（冻结只读）。

### 3.3 只读保护 SQL 状态核对

`docs/Sprint-C-v1.0/02_SQL/hse_employee_org_ReadOnly_Change.sql` 已生成（[完整文件](file:///F:/hse-dashboard/docs/Sprint-C-v1.0/02_SQL/hse_employee_org_ReadOnly_Change.sql)）：

- ✅ Step 0：前置检查（表存在、数据量、已有触发器）
- ✅ Step 1：创建 `fn_hse_employee_org_read_only()` 函数 + 3 个 BEFORE 触发器（INSERT/UPDATE/DELETE）
- ✅ Step 2：`hse_employee_relation` 同步保护（已注释，按需启用）
- ✅ Step 3：验证 SELECT 成功 / INSERT/UPDATE/DELETE 被阻止
- ✅ Step 4：回滚脚本（DROP TRIGGER）
- ✅ Step 5：触发器 COMMENT 标注

**执行前提**：后端 `hse-employee.js` 的 INSERT/UPDATE 操作已迁移至 `employee_assignment`（Sprint-C Phase 1 已完成 ✅）。

**当前状态**：脚本已就绪，待 API 收敛完成后执行（API 收敛已完成，可立即执行）。

---

## 4. 发现

### 4.1 口径不一致点定位

经全文扫描，跨文档对 `hse_employee_org` 处置表述存在 **3 类口径**：

| 口径分类 | 表述特征 | 持有文档 | 风险 |
|----------|----------|----------|------|
| **A. 冻结只读（永久保留）** | "冻结、禁止 INSERT/UPDATE/DELETE/DROP、允许 SELECT、永久审计归档" | Sprint-C 治理层（Legacy_Table_Lifecycle_Report / Employee-Center-Data-Governance / hse_employee_org_ReadOnly_Change.sql）、`hse-employee.js` 代码注释 | **当前权威口径** ✅ |
| **B. 冻结只读（远期可废弃）** | "短期冻结 → 中期迁移 → 长期可废弃" | 人员中心重构实施方案 §2.3 | **与 A 冲突** ⚠️ 暗示最终可 DROP |
| **C. 仅迁移（未明确保留策略）** | "迁移历史数据到 employee_assignment"，未提冻结/只读 | Sprint-A 测试验收报告 §6.2 / §9.1 | **表述不完整** ⚠️ 易误导后续维护者认为迁移后可删除 |

### 4.2 冲突根因

1. **时间线错位**：人员中心重构实施方案（v1.0）编制于 Sprint-A 阶段，其 §2.3 兼容方案的「短期/中期/长期」是基于「Sprint-B 尚未执行」的预设。Sprint-B 已完成 B-2 数据迁移、Sprint-C 已完成 API 收敛，「中期迁移」步骤已落地，但实施方案未同步更新。
2. **Sprint-A 报告时间点早**：Sprint-A 验收时 `hse_employee_org` 仍是写入主表，仅建议 Sprint-B 迁移，未涉及长期保留策略。
3. **Sprint-C 治理层最权威**：Legacy_Table_Lifecycle_Report 与 Employee-Center-Data-Governance 是 Sprint-C 后期产出的治理基线，明确「永久冻结保留」是当前权威口径。

### 4.3 代码层与治理层已对齐

- `hse-employee.js` 注释：「`hse_employee_org` 已冻结为只读（仅供审计）」 ✅
- `hse_employee_org_ReadOnly_Change.sql` 头部：「旧模型仅作历史查询」 ✅
- Sprint-C-Phase1-API-Convergence-Report §八：「保留 `hse_employee_org` 用于审计和历史追溯」 ✅

### 4.4 待统一文档

需同步口径的文档清单：

| # | 文档 | 需统一章节 | 当前口径 | 目标口径 |
|---|------|-----------|----------|----------|
| 1 | 人员中心重构实施方案.md | §2.3 兼容方案 | B（远期可废弃） | A（永久冻结保留） |
| 2 | 人员中心重构实施方案.md | §3.3（补充长期策略） | A 但未明确禁止 DROP | A（明确禁止 DROP/TRUNCATE） |
| 3 | Sprint-A测试验收报告.md | §6.2 / §9.1 | C（仅迁移） | A（标注已由 Sprint-C 完成 + 冻结只读） |

---

## 5. 结论

| 问题 | 结论 |
|------|------|
| `hse_employee_org` 处置口径是否一致？ | **❌ 否** — 人员中心重构实施方案 §2.3 与 Sprint-C 治理层口径冲突；Sprint-A 报告表述不完整 |
| 代码层是否已对齐？ | **✅ 是** — `hse-employee.js` 0 处实际 SQL 操作，注释与治理层一致 |
| 只读保护 SQL 是否就绪？ | **✅ 是** — `hse_employee_org_ReadOnly_Change.sql` 已生成，API 收敛已完成可立即执行 |
| 是否阻断生产迁移？ | **❌ 否** — ACT-07 优先级 P2，仅文档层面冲突 |
| 是否需要修改代码？ | **❌ 否** — 仅需更新 2 份文档（人员中心重构实施方案、Sprint-A 测试验收报告）的表述 |
| 统一口径是什么？ | **A. 冻结只读（永久保留）**：禁止 INSERT/UPDATE/DELETE/DROP/TRUNCATE，仅允许 SELECT，作审计归档用途 |

---

## 6. 风险与建议

### 6.1 风险

| 风险 | 等级 | 说明 |
|------|------|------|
| 文档口径冲突误导后续维护者 | P2 | 维护者可能按「远期可废弃」口径执行 DROP TABLE，导致审计数据丢失 |
| Sprint-A 报告未更新易混淆时间线 | P3 | Sprint-A 报告时间点早，未反映 Sprint-B/C 实际进展 |
| 只读保护 SQL 尚未实际执行 | P2 | 脚本已就绪但未在数据库层落地，仍存在误写入风险 |

### 6.2 统一口径建议（最终版）

**`hse_employee_org` 统一保留口径**：

> **冻结保留 + 永久只读 + 禁止结构变更**
>
> 1. **状态**：冻结（Frozen）
> 2. **允许操作**：✅ SELECT（仅审计、回溯、历史数据查询）
> 3. **禁止操作**：❌ INSERT / UPDATE / DELETE / DROP / TRUNCATE / ALTER（结构变更）
> 4. **保护机制**：通过 `hse_employee_org_ReadOnly_Change.sql` 创建 BEFORE 触发器阻断写入；通过权限控制限制 DDL
> 5. **保留期限**：**永久保留**（不设废弃时间点），与 `hse_employee_relation` 同等处理
> 6. **写入替代方**：所有人员组织关系写入必须通过 `employee_assignment`（唯一事实来源）
> 7. **查询替代方**：业务查询应使用 `employee_assignment`；`hse_employee_org` 仅用于历史归档查询
> 8. **生命周期阶段**：[已完成] 创建 → [已完成] 使用 → [已完成] 迁移 → [当前] 冻结只读 → [未来] 远期归档（待业务确认，不主动推进）

### 6.3 文档修改建议（patch 级别）

#### 修改建议 1：人员中心重构实施方案 §2.3

**原文**（[L101-L104](file:///F:/hse-dashboard/docs/人员中心重构实施方案.md#L101-L104)）：

```markdown
**兼容方案**：
- 短期内，`hse_employee_org` 停止写入，现有数据保留只读
- 中期，将 `hse_employee_org` 中 `is_current=true` 的历史数据迁移到 `employee_assignment`，通过 `remark` 字段标记来源
- 长期，前端「组织关系历史」查询改为从 `employee_assignment` + `employee_history` 获取，完成后可废弃 `hse_employee_org`
```

**建议改为**：

```markdown
**保留口径（已统一）**：
- `hse_employee_org` 已于 Sprint-C Phase 1 完成迁移，生产代码 0 处写入操作
- 历史数据已通过 Sprint-B B-2 迁移至 `employee_assignment`（`remark` 字段标记来源）
- `hse_employee_org` 永久冻结为只读审计表，禁止 INSERT/UPDATE/DELETE/DROP/TRUNCATE，仅允许 SELECT
- 前端「组织关系历史」查询应从 `employee_assignment` + `employee_history` 获取
- 旧表保留用于审计、回溯、历史数据查询，**不设废弃时间点**（详见 Sprint-C Legacy_Table_Lifecycle_Report）
```

#### 修改建议 2：人员中心重构实施方案 §3.3

**原文**（[L136-L142](file:///F:/hse-dashboard/docs/人员中心重构实施方案.md#L136-L142)）：

```markdown
### 3.3 是否保留 hse_employee_org

**保留，冻结写入。**

- 不删除表，不删除数据
- `hse-employee.js` 中的写入接口（调岗、分配组织关系）改为写入 `employee_assignment`
- 查询接口（员工详情中的 org 信息）先通过视图兼容，逐步迁移
```

**建议改为**：

```markdown
### 3.3 是否保留 hse_employee_org

**保留，永久冻结只读（仅审计用途）。**

- 不删除表，不删除数据，不执行 DROP / TRUNCATE / ALTER
- `hse-employee.js` 中的写入接口（调岗、分配组织关系）已于 Sprint-C Phase 1 完成迁移至 `employee_assignment`
- 查询接口（员工详情中的 org 信息）已切换至 `employee_assignment` + `hse_org_unit`
- 通过 `hse_employee_org_ReadOnly_Change.sql` 创建 BEFORE 触发器，阻断 INSERT/UPDATE/DELETE
- 保留期限：**永久**（与 `hse_employee_relation` 同等处理，不设废弃时间点）
- 详见：Sprint-C-v1.0/03_Governance/Legacy_Table_Lifecycle_Report.md
```

#### 修改建议 3：Sprint-A 测试验收报告 §6.2 与 §9.1

**§6.2 原文**（[L206](file:///F:/hse-dashboard/docs/Sprint-A测试验收报告.md#L206)）：

```markdown
| 1 | V1 和 V2 同时写入 `hse_employee_org` 和 `employee_assignment`，导致双任职关系并存 | 数据一致性 | Sprint B |
```

**建议改为**：

```markdown
| 1 | ~~V1 和 V2 同时写入 `hse_employee_org` 和 `employee_assignment`，导致双任职关系并存~~ **[已于 Sprint-C Phase 1 解决]** | 数据一致性 | ✅ 已闭环 |
```

**§9.1 原文**（[L283](file:///F:/hse-dashboard/docs/Sprint-A测试验收报告.md#L283)）：

```markdown
3. 迁移 `hse_employee_org` 历史数据到 `employee_assignment`
```

**建议改为**：

```markdown
3. ~~迁移 `hse_employee_org` 历史数据到 `employee_assignment`~~ **[已于 Sprint-B B-2 + Sprint-C Phase 1 完成]**
   - `hse_employee_org` 已冻结为只读审计表（永久保留，禁止 DROP）
   - 详见：docs/Sprint-C-v1.0/03_Governance/Legacy_Table_Lifecycle_Report.md
```

---

## 7. 待办 / 下一步

### 7.1 待验证者确认

1. **本 Step 7 md 是否通过验证**：是否需要补充其他文档扫描？
2. **是否授权修改 2 份文档**：
   - `docs/人员中心重构实施方案.md`（§2.3 + §3.3）
   - `docs/Sprint-A测试验收报告.md`（§6.2 + §9.1）
3. **是否在本 Step 中直接执行文档修改**：或保留为独立任务由授权人员执行。

### 7.2 后续建议（不在本 Step 范围）

1. **执行只读保护 SQL**：`hse_employee_org_ReadOnly_Change.sql` 已就绪，建议在维护窗口执行（与 `hse_employee_relation` 同步保护）。
2. **建立定期巡检**：每周检查 `hse_employee_org` 触发器状态、每月对比新旧模型数据一致性。
3. **Sprint-A-B-C-TRAE 执行序列总览**：本 Step 7 为序列最后一步（ACT-07），完成后 7 个 ACT 全部闭环。

### 7.3 TRAE 执行序列进度

| Step | ACT | 状态 | 产出 |
|------|-----|------|------|
| 1 | ACT-01 | ✅ 已验证通过 | [TRAE-Step1-数据基线复核与关联诊断.md](file:///F:/hse-dashboard/docs/TRAE-Step1-数据基线复核与关联诊断.md) |
| 2 | ACT-02 | ✅ 已完成 | [TRAE-Step2-status映射SQL锁定.md](file:///F:/hse-dashboard/docs/TRAE-Step2-status映射SQL锁定.md) |
| 3 | ACT-03 | ✅ 已完成 | [TRAE-Step3-SprintC验证SQL实测回填.md](file:///F:/hse-dashboard/docs/TRAE-Step3-SprintC验证SQL实测回填.md) |
| 4 | ACT-05 | ✅ 已完成 | [TRAE-Step4-DryRun-GoNoGo签字补录.md](file:///F:/hse-dashboard/docs/TRAE-Step4-DryRun-GoNoGo签字补录.md) |
| 5 | ACT-04 | ✅ 已完成 | [TRAE-Step5-空白修复模板补证.md](file:///F:/hse-dashboard/docs/TRAE-Step5-空白修复模板补证.md) |
| 6 | ACT-06 | ✅ 已完成 | [TRAE-Step6-B0恢复偏差说明.md](file:///F:/hse-dashboard/docs/TRAE-Step6-B0恢复偏差说明.md) |
| 7 | ACT-07 | ✅ 本文档 | [TRAE-Step7-hse_employee_org保留口径统一.md](file:///F:/hse-dashboard/docs/TRAE-Step7-hse_employee_org保留口径统一.md) |

---

## 8. 证据索引

| 结论 | 证据位置 |
|------|---------|
| 人员中心重构实施方案 §2.3「远期可废弃」口径 | [人员中心重构实施方案.md](file:///F:/hse-dashboard/docs/人员中心重构实施方案.md#L101-L104) L101-104 |
| 人员中心重构实施方案 §3.3「保留冻结写入」口径 | [人员中心重构实施方案.md](file:///F:/hse-dashboard/docs/人员中心重构实施方案.md#L136-L142) L136-142 |
| 人员中心重构实施方案 §2.2 表职责定义 | [人员中心重构实施方案.md](file:///F:/hse-dashboard/docs/人员中心重构实施方案.md#L82-L90) L82-90 |
| Sprint-A §6.2「双写并存」标注 | [Sprint-A测试验收报告.md](file:///F:/hse-dashboard/docs/Sprint-A测试验收报告.md#L206) L206 |
| Sprint-A §9.1「迁移历史数据」表述 | [Sprint-A测试验收报告.md](file:///F:/hse-dashboard/docs/Sprint-A测试验收报告.md#L283) L283 |
| Sprint-C Legacy_Table_Lifecycle 永久冻结口径 | [Legacy_Table_Lifecycle_Report.md](file:///F:/hse-dashboard/docs/Sprint-C-v1.0/03_Governance/Legacy_Table_Lifecycle_Report.md) §二/§三/§六 |
| Sprint-C 数据治理规范永久只读口径 | [Employee-Center-Data-Governance-v1.0.md](file:///F:/hse-dashboard/docs/Sprint-C-v1.0/03_Governance/Employee-Center-Data-Governance-v1.0.md#L56-L62) §1.3 |
| 只读保护 SQL 已就绪 | [hse_employee_org_ReadOnly_Change.sql](file:///F:/hse-dashboard/docs/Sprint-C-v1.0/02_SQL/hse_employee_org_ReadOnly_Change.sql) 完整文件 |
| Sprint-C Phase1 报告「保留用于审计」口径 | [Sprint-C-Phase1-API-Convergence-Report.md](file:///F:/hse-dashboard/docs/Sprint-C-Phase1-API-Convergence-Report.md) §八/§九 |
| `hse-employee.js` 代码注释「冻结为只读」 | [hse-employee.js](file:///F:/hse-dashboard/server/routes/hse-employee.js#L22-L24) L22-24 |
| `hse-employee.js` 中 `hse_employee_org` 仅余 12 处注释 | [hse-employee.js](file:///F:/hse-dashboard/server/routes/hse-employee.js) Grep 命中行：22/24/525/571/733/776/846/1137/1141/1178/1213/4380 |
| Sprint-B-Pre 依赖审计（已被 Sprint-C 覆盖） | [Sprint-B-Pre实施前风险确认报告.md](file:///F:/hse-dashboard/docs/Sprint-B-Pre实施前风险确认报告.md) §四 |

---

**文档结束。**

> 本文档为 TRAE 执行序列 Step 7（ACT-07）的产出。完成 7 项 ACT 整改后，Sprint-A/B/C 跨文档审查发现的全部问题已闭环（P0/P1 已闭合，P2 已说明）。等待验证者（Senior Developer）审核本 Step 7 md 并决定是否授权执行 §6.3 文档修改建议。
