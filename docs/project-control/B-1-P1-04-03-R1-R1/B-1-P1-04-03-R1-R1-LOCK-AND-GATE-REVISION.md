# B-1-P1-04-03-R1-R1 — 锁序证据与阶段门槛修正报告

> 节点性质：B-1-P1-04-03-R1 的二次定向修订（R1-R1），**只读核验 + 报告修订**，零业务代码、零 DDL、零生产/开发库连接。
> 交付纪律：仅新增本报告文件，单独提交、单独推送；推送后 `git ls-remote` 核验远端 HEAD；原 R1 报告不被覆盖/删除/改写。

---

## 元信息

| 项 | 值 |
|---|---|
| 分支 | `feat/b02-dec-03.13-a02d-status-code` |
| 本节点基底 HEAD | `11b82b5`（= B-1-P1-04-03-R1 回填 §7，已推送远端核验 0/0） |
| 报告提交后新 HEAD | 见文末 §9（待推送后回填） |
| 日期 | 2026-10-31 |
| 前置节点 | B-1-P1-04-03-R1（dbc38f4 + 11b82b5，独立审查「有条件通过」） |
| 关联报告 | `docs/project-control/B-1-P1-04-03-R1/B-1-P1-04-03-R1-M0-FREEZE-BOUNDARY-CLARIFICATION.md` |

**硬约束复核（提交前已核验）**：
- `server/routes/cost.js` 状态 `A`（staged），MD5 `e88ae2b0b275346dfc1431408aa00bff` —— 本节点**未触碰**。
- 工作区存在大量**既有、归属明确的其他修改**（docs/191 副、grid-mobile-cloudflare、server 多文件、安全看板 vben 等，详见 §8）——均**非本节点产生、不纳入本节点 pathspec、不提交、不清理**。
- DB 仅允许 `safety_dashboard_dev`；本节点**无任何 DB 连接、无任何查询、无任何 SQL**。
- 本报告所有行号均以**当前分支真实文件**复核为准，不沿用旧报告或任务书行号。

---

## §1 修订目的与范围

B-1-P1-04-03-R1 已交付并经独立审查「有条件通过」。审查指出三处需修正，本节点据此修订，**不扩大审计范围**：

1. **R1-R1-01**：原报告 D-07 对 `hse_org_unit` 负责人更新的锁序论证，未能由当前真实路由代码证明（当前路由根本无事务、无锁）。须以真实代码区分「当前代码事实」与「未来目标设计」。
2. **R1-R1-02**：原报告对任职写入路径并发保护描述不够准确，遗漏了 `assignEmployee` 已有的事务内员工行锁。须逐项核对六条路径并形成对照表。
3. **R1-R1-03**：原报告 §4.3 将部分 M1 实施内容同时写成进入 M1 的前置条件，造成阶段门槛循环。须明确 M0/M1/M2 各自边界。

---

## §2 修订前问题

- **问题 1（证据缺口）**：原 R1 报告 §1.2 沿用 B-1-P1-04-02C-R3 的「负责人更新事务锁序 `unit→employee`」表述，但该表述是**未来 D-07 端点设计**，并非当前 `PUT /api/hse/org/:id` 的代码事实。当前该路由无事务、无锁，故「锁序论证」缺乏真实代码支撑。
- **问题 2（事实偏差）**：原报告将「四路径各自直写、未收编」笼统表述，易被误读为「所有路径都没有员工锁」。事实上 `assignEmployee`/`rehireEmployee`/`terminateEmployee` 均已具备事务内员工行 `FOR UPDATE`，仅 V2 导入与 `deleteEmployee` 缺失（V2 为已知缺口）。
- **问题 3（门槛循环）**：原报告 §4.3 将「统一任职段写入服务、收敛写入路径、落实事务/锁/rowCount/SAVEPOINT/批次去重」既列为 M1 实施内容，又列为「M1 开始前前置条件」，逻辑自相矛盾。

---

## §3 当前源码路径、函数、实际行号及证据

### 3.1 组织 / 作业单元路由（R1-R1-01 证据源）

文件：`server/routes/hse-org-center.js`（当前分支真实内容）

| 路由 | 行号 | 事务 | 显式行锁 | 人员引用校验 | 关键证据 |
|---|---|---|---|---|---|
| `PUT /org/:id` | 188–219 | **无**（`await pool.query` 裸调用，无 `BEGIN`） | 无 | 无 | `:201-212` 裸 `UPDATE hse_org_unit ... manager_id = COALESCE($6, manager_id)`；`:193-199` 仅存在性 `SELECT`（无 `FOR UPDATE`） |
| `DELETE /org/:id` | 225–248 | **无** | 无 | 无（仅查子组织 `parent_id`） | `:238-241` 软删 `is_deleted=true`；`:230-236` 仅查子组织数量 |
| `PUT /operation-unit/:id` | 428–460 | **无** | 无 | 无 | `:441-453` 裸 `UPDATE hse_operation_unit ... supervisor_id = COALESCE($7, supervisor_id)` |
| `DELETE /operation-unit/:id` | 466–480 | **无** | 无 | 无 | `:470-473` 软删 `is_deleted=true` |

### 3.2 关键约束 / 字段定义（真实 SQL）

| 定义 | 文件:行 | 内容 |
|---|---|---|
| `fk_employee_assignment_org_unit` | `server/sql/hse_fk_phase2_assessment_events.sql:341-343` | `FOREIGN KEY (org_unit_id) REFERENCES hse_org_unit(id) ON DELETE SET NULL` |
| `hse_org_unit.manager_id` | `server/sql/hse_org_center_v68_migration.sql:27` | `manager_id BIGINT,`（**无 FK 约束**，`:43` 仅注释「负责人ID（关联employee.id）」） |
| `employee_assignment.operation_unit_id` | `server/sql/sprint5_6_employee_master_migration.sql:21` | `operation_unit_id BIGINT,`（**无 REFERENCES**；`:40` 注释关联 hse_operation_unit，但无外键） |
| `hse_operation_unit.org_unit_id` | `server/sql/hse_org_center_v68_migration.sql:61` | `NOT NULL BIGINT`（**无 FK**） |

### 3.3 六条任职写入路径（R1-R1-02 证据源）

| 路径 | 文件:函数:行 |
|---|---|
| `assignEmployee` | `server/services/employeeAssignmentService.js:419-563` |
| `rehireEmployee` | `server/services/employeeAssignmentService.js:648-880` |
| `terminateEmployee` | `server/services/employeeAssignmentService.js:1060-1210+` |
| V2 花名册导入 | `server/services/employeeImportV2Service.js:925-1080` |
| V1 导入 | `server/services/employeeImportService.js:685-727`（片段） |
| `employeeService.deleteEmployee` | `server/services/employeeService.js:615-644` |

---

## §4 六条任职写入路径对照表

判定口径：✅=存在/是；❌=不存在/否；⚠️=部分/已知缺口；N/A=不适用；「待结合上下文」=本节点仅读取片段，未展开全文确认。

| # | 路径 | 事务 | 员工行 `SELECT…FOR UPDATE` | 复核 `employment_relation` | 直接写 `employee_assignment` | 关闭旧段 | 关段 `UPDATE` 查 `rowCount` | 行级 `SAVEPOINT` | 批次内同 employee 去重 | 已用 `writeSegment` |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `assignEmployee` | ✅ `:446/522/558` | ✅ `:455-458` | ✅ `:439-442`+`:463-467` | ✅ `:506-512` | ✅ `:492-496` | ❌（关段无断言） | ❌ | N/A | ❌ |
| 2 | `rehireEmployee` | ✅ `:665/818/875` | ✅ `:668-672` | ✅（须 `RETIRED` `:683-686`） | ✅ `:787-797` | ❌（有段则拒 `:694-702`） | ✅（关系 `:780-784`） | ❌ | N/A | ❌ |
| 3 | `terminateEmployee` | ✅ `:1089` | ✅ `:1092-1095`（段亦 `:1135-1141`） | ✅ `:1105-1132` | ✅（关段 `:1185-1190`） | ✅ `:1185-1190` | ✅ `:1191-1194` | ❌ | N/A | ❌ |
| 4 | V2 导入 | ✅（外层 `:927`） | ❌（`:939-955` 无 `FOR UPDATE`，已知缺口） | ✅（终态闸门 `:964-971`） | ✅（关 `:1031-1035`/建 `:1056-1062`） | ✅ `:1031-1035` | ❌（关段无断言） | ✅（`:933/:1071/:1075`） | ❌（无 `seenEmployeeIds`，R3-01 缺陷） | ❌ |
| 5 | V1 导入 | ✅（外层批次事务，片段内 `:701-727`） | 待结合上下文 | 待结合上下文 | ✅（关 `:702-713`/建 `:720-727`） | ✅ `:702-713` | ✅（`:714-717` 判 0→warning） | 待结合上下文 | 待结合上下文 | ❌ |
| 6 | `deleteEmployee` | ✅ `:618/637/640` | ❌（用 `UPDATE` 软删自身锁行，非 `SELECT FOR UPDATE`） | ❌（不查关系直接软删） | ✅（关段 `:632`） | ✅ `:632` | ❌（关段无断言；员工软删判 0 `:624-627`） | ❌ | N/A | ❌ |

**关键更正（针对问题 2）**：`assignEmployee`/`rehireEmployee`/`terminateEmployee` **均已具备事务内员工行 `FOR UPDATE` 与 `employment_relation` 复核**；「未统一服务入口」≠「所有路径都没有员工锁」。缺口仅存在于 **V2 导入（无员工行锁，R3-02 已裁定补强）** 与 **`deleteEmployee`（用 UPDATE 软删自身锁行、未锁任职段即关段）**。

---

## §5 当前代码事实 vs 未来目标设计对照（R1-R1-01 结论）

### 5.1 当前代码事实（A）—— 以 §3.1/§3.2 真实代码为准

- **负责人更新路由 `PUT /org/:id`**：无事务、无显式组织行锁、无员工行锁、无更新后员工关联校验。
- **`hse_org_unit.manager_id`**：`BIGINT` **无 FK**（仅注释）。因此更新 `manager_id` 既不会触发任何隐式外键锁，也不存在「负责人→员工」的数据库级约束路径。
- **FK `employee_assignment.org_unit_id → hse_org_unit`**：存在且为 `ON DELETE SET NULL`，**但**组织删除是**软删除（`is_deleted=true`）而非物理 `DELETE`**，故 `ON DELETE` 动作在生产中**永不触发**；且该 FK 的隐式锁方向是「写入 `employee_assignment` 时锁 `hse_org_unit`（`FOR KEY SHARE`）」，**反向不成立**——修改 `hse_org_unit`（如 PUT 负责人）**不会**对 `employee_assignment` 产生任何隐式锁。
- **作业单元 `PUT/DELETE /operation-unit/:id`**：无事务、无锁、无人员引用检查；`employee_assignment.operation_unit_id` **无 FK**，故无数据库级引用约束可借力。

> 结论：当前代码中，**D-07 锁序/死锁环路缺乏任何真实代码支撑**。原 R1 报告将「未来 D-07 端点设计」表述为组织↔任职锁关注点的做法，在「当前代码事实」层面不成立。

### 5.2 未来目标设计（B）—— 明确标记为「目标设计，非当前事实」

- **若**后续实施负责人更新事务（D-07 端点），拟采用锁序 **`employee → org_unit`**，与任职段写入事务（D-02：锁序 `employee → org_unit`，FK 隐式 `FOR KEY SHARE` 落 `hse_org_unit`）保持一致，以消除「组织写事务 `org→employee` 与任职写事务 `employee→org` 锁序相反」的潜在死锁。此锁序属**目标设计**，依赖 M1/M2 实际落地与 dev 双会话实测，不得描述成当前代码已具备。
- **作业单元停用/删除**：必须**独立设计**人员引用检查（因其无 inbound FK），**不得借用** `hse_org_unit` 的锁证据或外键结论。

### 5.3 并发验证（C）

- 当前**尚无** PostgreSQL 双会话实测证据 → 明确标记「**尚未实测**」。
- **不得**仅凭 FK 存在即认定死锁环路成立（FK 隐式锁方向与环路假设相反，见 5.1）。
- **不得**将 `hse_org_unit` 的锁设计套用到 `hse_operation_unit`（后者无 FK、无 manager_id、无停用路径）。

---

## §6 修订后的 M0 / M1 / M2 阶段门槛（R1-R1-03）

### 6.1 M0：设计决策冻结

- 冻结：组织与作业单元**分离原则**；已确认的业务规则；目标技术设计及未决事项边界。
- **不代表**：业务代码已实施；数据库迁移已完成；生产数据已修改。
- M0 结论措辞维持「**有条件冻结（设计决策冻结）**」（见原 R1 §4.1）。

### 6.2 M1：人员任职写入路径实施（内容与验收，**非**前置条件）

M1 的实施内容与验收要求（**属于 M1 内部，不得前置为进入 M1 的门槛**）：
- 统一任职段写入服务（`assignmentSegmentService.writeSegment`，当前零落地）；
- 梳理并收敛 `assign`/`rehire`/`terminate`/V1/V2 导入等写入路径；
- 落实事务、员工行锁、旧段关闭、新段创建、`UPDATE rowCount` 校验、行级 `SAVEPOINT`、批次重复员工处理；
- 补齐对应自动化测试（A/B/C 场景 × 四入口、V2 批次部分失败隔离、并发双会话等）；
- 实施后由助手独立审查代码与测试。

**M1 开始前仅要求**：M0 已正式冻结、实施范围明确、业务规则无阻断性未决项（Q-A/Q-B/Q-C/U03/U06/C04 待裁决）、实施授权明确。

### 6.3 M2：组织与作业单元实施（独立，不与 M1 混为一项）

- 管理组织及负责人关系（D-07 端点、锁内校验、负责人更新事务）；
- 作业单元引用、停用和人员转移（**独立设计**人员引用检查，不可借 org 锁证据）；
- 相关约束、迁移及兼容处理。
- **不得**与 M1 的任职段统一服务混为一个未经拆分的大任务。
- 生产变更仍须单独授权（U05）。

---

## §7 未解决事项与后续验证要求

| 项 | 状态 | 后续要求 |
|---|---|---|
| D-07 `hse_org_unit` 负责人更新锁序 | 目标设计，未实测 | M2 落地后须 dev 双会话并发实测，验证 `employee→org_unit` 锁序无死锁 |
| D-07 `hse_operation_unit` 停用 | 目标设计，须独立立项 | 不得沿用 org 结论；须单独设计人员引用检查 |
| V2 批次员工行锁 + 去重 | 已知缺口（R3-01/R3-02） | M1 实施补强，并补测试 |
| `deleteEmployee` 关段前未锁任职段 | 已知缺口 | M1 评估是否纳入统一 `writeSegment` |
| 任务书 3.x 截断域 | 超域待补发 | 若补发须另出补充评估（同原 R1 R1-03） |
| PostgreSQL 双会话死锁实测 | 尚未实测 | 任何死锁结论在实测前仅作静态分析标注 |

---

## §8 本节点执行边界证明

| 检查项 | 结果 |
|---|---|
| 业务代码修改 | 0（仅新增本报告文档） |
| 前端代码修改 | 0 |
| 自动化测试修改 | 0 |
| SQL / migration 新增或修改 | 0 |
| 开发 / 生产数据库连接或 SQL 执行 | 0 |
| 环境变量 / 配置修改 | 0 |
| `server/routes/cost.js` 修改 | 0（保持 staged `A` + MD5 `e88ae2b0b275346dfc1431408aa00bff`） |
| WPS / H5 / 飞书 / grid-mobile 触碰 | 0 |
| merge / rebase / reset / cherry-pick | 0 |
| 部署 / 生产库变更 | 0 |
| 工作区其他修改文件 | 既有无关修改（docs/191 副、grid-mobile-cloudflare、server/*、安全看板 vben 等）**未纳入 pathspec、未提交、未清理** |
| Git 操作 | 仅 `git add docs/project-control/B-1-P1-04-03-R1-R1/` + 单独提交 + 单独推送 |

---

## §9 修订文件清单与 Git 提交信息

- 新增文件：`docs/project-control/B-1-P1-04-03-R1-R1/B-1-P1-04-03-R1-R1-LOCK-AND-GATE-REVISION.md`
- 提交命令：`git add docs/project-control/B-1-P1-04-03-R1-R1/ && git commit -m "docs(B-1-P1-04-03-R1-R1): 锁序证据与阶段门槛修正报告" -- docs/project-control/B-1-P1-04-03-R1-R1`
- 推送：`HTTPS_PROXY=http://127.0.0.1:7890 git push origin feat/b02-dec-03.13-a02d-status-code`
- 远端核验：`git ls-remote origin feat/b02-dec-03.13-a02d-status-code` 比对 SHA 与本地新 HEAD。
- 基底 HEAD：`11b82b5`；新 HEAD（推送成功后回填）：`__________`（占位，待执行）。
- GitHub 报告 URL（推送后可用）：`https://github.com/ljt8825-hash/HSE/blob/feat/b02-dec-03.13-a02d-status-code/docs/project-control/B-1-P1-04-03-R1-R1/B-1-P1-04-03-R1-R1-LOCK-AND-GATE-REVISION.md`

---

## 附录 A — 本轮核验命令与关键输出摘要

1. `git rev-parse HEAD` → `11b82b5`（基底正确）
2. `git status --short server/routes/cost.js` → `A server/routes/cost.js`（staged 不变）
3. `md5sum server/routes/cost.js` → `e88ae2b0b275346dfc1431408aa00bff`
4. `git ls-remote origin ...` → `11b82b5…`（远端=本地 0/0）
5. 读取 `server/routes/hse-org-center.js` 全文（188–248 / 428–480）→ 四条路由均无事务/无锁/无人员校验
6. Grep `manager_id` in `server/sql` → `v68:27` 为 `BIGINT` 无 FK；`v68:43` 仅注释
7. Grep `operation_unit_id` in `server/sql` → `sprint5_6:21` 无 REFERENCES；`v68:61` 无 FK
8. Grep `fk_employee_assignment_org_unit` → `hse_fk_phase2_assessment_events.sql:341-343` `REFERENCES hse_org_unit(id) ON DELETE SET NULL`
9. 读取 `employeeAssignmentService.js:419-563 / 648-880 / 1055-1210` → 三条路径事务/锁/复核/关段/rowCount 现状
10. 读取 `employeeImportV2Service.js:925-1080` → V2 无员工行锁、无批次去重、有关段/建段/SAVEPOINT
11. 读取 `employeeImportService.js:685-727` → V1 关段查 rowCount、直接写段
12. 读取 `employeeService.js:615-644` → deleteEmployee 事务软删+关段，无 SELECT FOR UPDATE
