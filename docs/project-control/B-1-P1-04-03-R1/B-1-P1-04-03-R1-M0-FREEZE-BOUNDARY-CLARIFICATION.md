# B-1-P1-04-03-R1 — M0 总体实施冻结评估：边界澄清报告

> 节点性质：B-1-P1-04-03 的边界澄清修订（R1），**只读审计 / 设计修订**，零代码、零 DDL、零生产查询。
> 交付纪律：报告单独提交、单独推送，不与业务代码混合；推送后执行远端核验。

---

## 元信息

| 项 | 值 |
|---|---|
| 分支 | `feat/b02-dec-03.13-a02d-status-code` |
| 本节点基底 HEAD | `cb012d0`（= B-1-P1-04-03 M0 评估，已推送远端核验 0/0） |
| 报告提交后新 HEAD | 见文末 §7（待推送后回填） |
| 日期 | 2026-10-31 |
| 前置成果（10 份，已 push） | 04-02C（4463f10）→ R1（1e5f5e0）→ R2（65b304e）→ R3（3b092ba）→ R3-R1（6b55742）→ 04-03（cb012d0） |
| 关联报告 | `docs/project-control/B-1-P1-04-03/B-1-P1-04-03-M0-OVERALL-FREEZE-ASSESSMENT.md` |

**硬约束复核（提交前已核验）**：
- `server/routes/cost.js` 状态 `A`（staged），MD5 `e88ae2b0b275346dfc1431408aa00bff` —— 本 R1 节点**未触碰**。
- 工作区存在其他无关 modified 文件（docs/191 副、grid-mobile-cloudflare、server/app.js 等），**不在本节点 pathspec 内，不触碰、不提交**。
- DB 仅 `safety_dashboard_dev`；本节点无任何 DB 连接、无任何查询。

---

## §0 背景与触发

B-1-P1-04-03（M0 总体实施冻结评估）已按任务书 8 问交付 404 行报告并提交 `cb012d0`。经独立审查与复盘，报告中三处表述在「边界」层面存在被误解风险，需本 R1 节点澄清，避免将**目标设计态**误读为**代码实施态**、将**管理组织停用锁关注点**误扩到**作业单元**、将**重建审查域**误读为**已与原任务书逐字一致**。

三处修订对应任务书 R1 指令：
- **R1-01**：拆分 D-07 管理组织（`hse_org_unit`）与作业单元（`hse_operation_unit`）边界。
- **R1-02**：区分「目标设计（writeSegment 目标入口）」与「当前代码现状（四路径各自直写，未收编）」。
- **R1-03**：任务书截断范围核对，不得把重建域写成已证明与原文一致。

---

## §1 R1-01 — D-07 边界拆分：管理组织 vs 作业单元

### 1.1 事实核证（本轮实码重读 + Grep 扫描）

**FK 实码（与 04-02C-R3-R1 结论一致，本轮复核无变化）**：
- `employee_assignment.org_unit_id` → `fk_employee_assignment_org_unit` REFERENCES `hse_org_unit(id)` **ON DELETE SET NULL**（`server/sql/hse_fk_phase2_assessment_events.sql:341-344`，**有 FK，且为组织↔任职的唯一外键**）。
- `employee_assignment.operation_unit_id`（`server/sql/sprint5_6_employee_master_migration.sql:21`）BIGINT **无 REFERENCES**。
- `hse_org_unit.manager_id`：全仓 `REFERENCES` 仅命中 `hse_responsibility_chain`（无指向 employee / org_unit 的 FK）。
- `hse_operation_unit.org_unit_id`（`server/sql/hse_org_center_v68_migration.sql:61`）NOT NULL BIGINT **无 FK**；`hse_operation_unit` 无 `manager_id` 列。

**现有端点扫描（Grep `server/**/*.js`）**：
- `hse_org_unit`：`hse-org-center.js:202` `UPDATE hse_org_unit ...`（PUT /org/:id，含 `manager_id = COALESCE($6, manager_id)` 矛盾，见 04-03 §四）、`:239` `UPDATE hse_org_unit SET is_deleted = true`（软删）。
- `hse_operation_unit`：`hse-org-center.js:442` `UPDATE hse_operation_unit ...`（状态字段更新）、`:471` `UPDATE hse_operation_unit SET is_deleted = true`（软删）。
- **D-07 目标「停用端点」（status='inactive' + 锁内校验 + 任职引用检查）：两表均零落地**。现有 `:442/:471` 是既有 CRUD，非 D-07 设计端点，且无 FOR UPDATE、无任职引用检查。

### 1.2 `hse_org_unit` 边界（D-07 锁关注点**适用**）

管理组织 `hse_org_unit` 是 `employee_assignment.org_unit_id` 的**外键目标**，且自身持有 `manager_id`。因此 D-07 并发锁关注点（来自 04-02C-R3 R3-02 死锁分析）**仅**在此表成立：
- 事务 A（负责人更新 PUT /org/:id）：锁序 `unit → employee`（更新 manager_id 后可能触发的员工侧逻辑）。
- 事务 B（任职段写入）：锁序 `employee → unit`（FK `employee_assignment.org_unit_id` 隐式对 `hse_org_unit` 取 FOR KEY SHARE）。
- 两事务锁序相反 ⇒ 死锁根因。04-02C-R3 已裁定**统一锁序 `employee → org_unit`** 消除。

→ **D-07 锁边界声明仅对 `hse_org_unit` 有效**，且依赖「未来 dev 双会话并发测试 + 业务确认停用语义」方能从静态分析升级为实测结论。

### 1.3 `hse_operation_unit` 边界（D-07 锁关注点**不适用**）

作业单元 `hse_operation_unit`：
- 无任何 inbound FK 来自 `employee_assignment`（`operation_unit_id` 无 REFERENCES），故任职写入事务 B **不对其取隐式锁**。
- 无 `manager_id` 列，故不存在事务 A 式的负责人更新路径。
- 现有 `:442/:471` 端点为既有 CRUD（状态更新 / 软删），无 FOR UPDATE、无任职引用检查，**不构成 D-07 死锁环路**。

→ **D-07 锁边界声明不适用于 `hse_operation_unit`**。04-02C-R3 报告 §205 曾将「作业单元停用 D-07｜仅 unit」误套于 `hse_operation_unit`，已由 04-02C-R3-R1（6b55742）R3-R1-02 纠正；本 R1 重申该纠正并明确：任何涉及 `hse_operation_unit` 的并发分析，均需重新立项（其无 FK/无锁/无停用路径），**不得**沿用 `hse_org_unit` 的 D-07 结论。

### 1.4 小结

| 维度 | `hse_org_unit`（管理组织） | `hse_operation_unit`（作业单元） |
|---|---|---|
| 是 employee_assignment 外键目标 | 是（ON DELETE SET NULL） | 否（无 FK） |
| 持有 manager_id | 是 | 否 |
| D-07 停用端点（目标设计） | 待实现 | 待实现 |
| D-07 并发锁关注点（R3-02） | **适用**，统一锁序 `employee→unit` | **不适用** |
| 现有 CRUD 端点 | :202 / :239 | :442 / :471（非 D-07 设计） |
| 结论升级条件 | dev 双会话实测 + 业务确认 | 需独立立项，不可沿用 org 结论 |

---

## §2 R1-02 — 目标设计 vs 代码现状分离

### 2.1 `writeSegment` 目标设计现状（本轮 Grep 复核）

Grep `assignmentSegmentService|writeSegment` 于 `server/**/*.js`：**零命中**。
唯一出现位置为 `docs/project-control/B-1-P1-04-02C-R2` 与 R1/R3 报告 —— **纯目标设计，无任何代码落地**。

结论：`assignmentSegmentService.writeSegment` 在当前代码库中**不存在**，是 04-02C-R2 定稿的「未来统一任职段服务入口」设计，尚未进入实现阶段。

### 2.2 四路径各自直写实码（本轮 Grep 复核）

各路径的关段 / 建段 SQL **仍为各自内联**，未收编至任何统一服务：

| 路径 | 文件 | 关段 | 建段 | 收编状态 |
|---|---|---|---|---|
| `assignEmployee` | `employeeAssignmentService.js` | `:493` UPDATE is_current=false | `:506` INSERT | 各自直写 |
| `rehireEmployee` | `employeeAssignmentService.js` | （不关段，`closeCurrent:false`） | `:788` INSERT | 各自直写 |
| `terminateEmployee` | `employeeAssignmentService.js` | `:935/:942` UPDATE status | — | 各自直写 |
| V2 批次导入 | `employeeImportV2Service.js` | `:1031` UPDATE | `:1057` INSERT | 各自直写 |
| V1 遗留导入 | `employeeImportService.js` | `:702` UPDATE | `:721` INSERT | 各自直写（非 M0 收编目标） |

附：`employeeService.js:632` 另有一处 `UPDATE employee_assignment SET is_current=false`（编辑页直改关系路径，见 MEMORY A-02e.4），亦为独立直写。

→ 事实：**「四路径统一收编进 writeSegment」是目标设计态，当前代码态为五处（含 V1）各自直写、无 rowCount 校验、V2 无批次去重 / 无员工行锁**。两者不可混同。

### 2.3 「设计冻结」≠「代码实施通过」

B-1-P1-04-03 报告（04-03）在 §2/§3 多处以「目标态 → 现状 → 改造点」表格呈现，可能被误读为「设计已落地」。本 R1 明确：
- 04-03 中 D-01/D-02/D-06/D-07/D-08/D-09 等决策项均为**设计定稿**，其「改造点」列描述的是**未来 M1/M2/M3 待实施动作**，非已完成。
- 04-03 §5「M0 结论」原措辞若含「设计冻结」字样，须严格理解为**设计决策冻结（不再变更方案）**，而**非代码已实施、非 M1/M2 已授权**。

### 2.4 04-03 相关表述修订登记

| 04-03 原表述倾向 | R1 澄清后 |
|---|---|
| writeSegment 收编四路径（疑似已完成） | writeSegment 零代码落地；四路径仍各自直写；收编为 M1/M3 待实施 |
| D-07 锁边界（疑似覆盖两表） | 仅 `hse_org_unit` 适用；`hse_operation_unit` 不适用，需独立立项 |
| 「设计冻结」 | 仅指决策冻结；不派生代码实施通过、不派生 M1/M2 授权 |

---

## §3 R1-03 — 任务书范围核对

### 3.1 截断事实

B-1-P1-04-03 原始任务书在「3.x 审查范围 / 所有」处被截断（仅露出 3.1 开头），完整 3.1~3.6 审查域清单未到达。04-03 报告已在 §0.2 声明该截断，并基于 10 份前置成果**重建**了 3.1~3.6 审查域覆盖。

### 3.2 重建域清单（声明为「重建」，非「与原任务书逐字一致」）

04-03 重建并覆盖的审查域（声明性质）：
- 3.1 任职段数据模型与唯一约束（`uk_emp_assign_primary` partial unique index）
- 3.2 四路径写入一致性与终态复活路径
- 3.3 跨表锁序与死锁（R3-02）
- 3.4 批次导入确定性与回滚语义（R3 / R3-R1）
- 3.5 组织/作业单元停用边界（D-07，本次 R1-01 进一步拆分）
- 3.6 统计与考核域关联（只读，无 M0 改造）

### 3.3 无法确认项登记（范围待核实）

- 原任务书 3.x 截断部分是否含**超出上述重建域**的审查要求（如特定表、特定端点、特定指标），**无法确认**。
- 若用户后续补发被截断的超域审查项，须**另出补充评估**，不得假定已覆盖。
- 本 R1 所有「覆盖」声明均限定于「重建域」，不得上升为「已与原任务书全文核对一致」。

---

## §4 M0 最终结论（措辞修正）

### 4.1 结论措辞

依任务书纪律，M0 结论**只能**使用「可以冻结 / 有条件冻结 / 暂不可冻结」三档。结合本 R1 三项修订，结论维持：

> **M0 评估结论：有条件冻结（设计决策冻结）。**

- 「冻结」指 **B-1-P1-04 链的设计决策（D-01~D-09 方案）不再变更**。
- 「有条件」指：①writeSegment 等设计尚未代码落地，其实施质量须在 M1/M2/M3 独立验证；②D-07 锁边界仅 `hse_org_unit` 成立且依赖 dev 双会话实测；③任务书 3.x 截断域未逐字核对，超域项待补发。

### 4.2 冻结范围与开放项

| 类别 | 内容 | 状态 |
|---|---|---|
| 已冻结（决策） | D-01 事务边界 / D-02 writeSegment 设计 / D-06 差异核对 / D-07 org 锁边界 / D-08 周期表隔离 / D-09 字段映射 | 决策冻结 |
| 开放（待实施） | writeSegment 收编四路径（M1/M3）、V2 补员工行锁与去重（M1）、D-07 端点实现 + dev 双会话实测（M1/M2） | 未实施 |
| 开放（待核实） | 任务书 3.x 超域审查项 | 待补发 |

### 4.3 M1 / M2 前置条件（不含授权，仅列门槛）

- **M1（基础代码兼容）前置**：本 R1 验收通过 + `assignmentSegmentService.writeSegment` 落地骨架 + V2 批次去重/员工行锁补强。
- **M2（数据映射治理）前置**：M1 完成 + D-07 `hse_org_unit` 停用端点实现 + dev 双会话锁序实测通过。
- **硬性阻断（不变）**：Q-A（is_primary 语义）/ Q-B（班组考核口径）/ Q-C（返聘作业归属）/ U05（生产 DDL 前置）/ U03/U06/C04 未决前，不得进入对应子阶段。

---

## §5 零变更证明（本 R1 节点）

| 检查项 | 结果 |
|---|---|
| 代码文件修改 | 0（仅新增本报告文档） |
| DDL / 迁移脚本 | 0 |
| 生产 / dev 数据库查询 | 0 |
| `server/routes/cost.js` 状态 | 保持 `A`，MD5 `e88ae2b0b275346dfc1431408aa00bff`（未触碰） |
| 其他无关 modified 文件 | 未纳入本节点 pathspec，未提交 |
| Git 操作 | 仅 `git add docs/project-control/B-1-P1-04-03-R1/`（新增文档） |

---

## §6 下一步（纪律）

- 本 R1 节点完成后**停止**，等待独立审查；**不自行启动 M0 正式冻结 / M1 / M2**。
- 若审查通过：M0 正式冻结（受 R1 结论约束）→ M1 → M2 → M3（任职收敛）→ M4（旧模型退役）→ B-1-P2（超龄）→ B-1-P3（personnel_id）→ B-1-P4（视图收敛）。
- 若用户补发任务书 3.x 截断域：另出补充评估，不并入本 R1。

---

## §7 提交与远端核验（执行后回填）

- 提交命令：`git add docs/project-control/B-1-P1-04-03-R1/ && git commit -m "docs(B-1-P1-04-03-R1): M0 冻结评估边界澄清报告" -- docs/project-control/B-1-P1-04-03-R1`
- 推送：`HTTPS_PROXY=http://127.0.0.1:7890 git push origin feat/b02-dec-03.13-a02d-status-code`
- 远端核验：`git ls-remote origin feat/b02-dec-03.13-a02d-status-code` 比对 SHA 与本地新 HEAD 一致。
- 新 HEAD（推送成功后回填）：`__________`（占位，待执行）

---

## 附录 A — 本轮核验命令与关键输出摘要

1. `git rev-parse HEAD` → `cb012d0`（基底正确）
2. `git status --short server/routes/cost.js` → `A server/routes/cost.js`（staged 不变）
3. `md5sum server/routes/cost.js` → `e88ae2b0b275346dfc1431408aa00bff`
4. Grep `assignmentSegmentService|writeSegment` in `server/**/*.js` → 仅 docs 命中，代码零命中
5. Grep `INSERT INTO employee_assignment|UPDATE employee_assignment` in `server/**/*.js` → 命中 `employeeAssignmentService.js:236/493/506/788/935/942/1186`、`employeeImportV2Service.js:1031/1057`、`employeeImportService.js:702/721`、`employeeService.js:632`（各自直写证据）
6. Grep `hse_operation_unit` in `server/**/*.js` → `hse-org-center.js:442/:471` 为既有 CRUD（非 D-07 设计端点）
7. Grep `UPDATE hse_org_unit` / `UPDATE hse_operation_unit` → `hse-org-center.js:202/:239`（org）、`:442/:471`（opu）

> 所有 Grep 命中点均已在本报告 §1/§2 交叉引用，作为边界澄清的事实依据。
