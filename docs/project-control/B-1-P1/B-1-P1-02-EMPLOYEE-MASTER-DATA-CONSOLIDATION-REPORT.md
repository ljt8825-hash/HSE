# B-1-P1-02 · 人员主数据第一批安全收敛实施报告

> 节点：B-1-P1-02（人员主数据第一批安全收敛实施）
> 分支：`feat/b02-dec-03.13-a02d-status-code`
> 业务提交：`83f0c58`（7 文件，+267/−108）
> 报告提交：本文件单独提交
> 前置：B-1-P1-01 依赖审计（`17360ca`）｜B-1-P0 生产只读复核（`0a71d31`）｜OVERALL-07（`5f22220`）
> 日期：2026-10-30

---

## 一、任务与纪律执行

本节点按任务书实施五项代码修复（A–E），全程遵守：

- **不裸 commit**：业务代码以 pathspec 显式路径提交，禁 `git add .`；
- **不动 cost.js**：`server/routes/cost.js` 全程未触碰（提交后 diff-tree 核验零卷入，staged `A` 与 MD5 `e88ae2b0b275346dfc1431408aa00bff` 不变，HEAD 提交树不含该文件）；
- **不动 H5/WPS/飞书冻结链路**：`grid-mobile-cloudflare/` 零改动；
- **禁止生产写入**：所有 DDL/DML 仅作用于 `safety_dashboard_dev`（psql 连接首条 `SELECT current_database()` 断言通过，`current_database() = safety_dashboard_dev`、用户 `hse_app`）；
- **D3 已确认**：employee_assignment 为唯一权威任职段，本次全部改造围绕该定局；
- **终态判定统一走 employeeStatusDict**：本节点五项均不新增终态判定逻辑，复用既有口径；
- **停止条件**：未触发（无生产写入需求、字段全部兼容、事务可安全调整、零数据删除、cost.js 未被触碰、无不可解释测试失败）。

## 二、基线记录（实施前）

| 项 | 状态 |
|---|---|
| 起始 HEAD | `17360ca`（= 任务书指定起始提交；`git fetch` 无代理失败 Empty reply，不影响本地基线，本地 HEAD 与 origin 本地缓存记录一致） |
| 工作区 | 145 ?? / 1 A(cost.js) / 50 M —— 与 P1-01 收尾一致 |
| cost.js | staged `A`，MD5 `e88ae2b0b275346dfc1431408aa00bff` ✔ |
| 完整性检查 | 6 处问题（A 2 + B 4）：均为 untracked 历史存量（`grid-mobile-cloudflare` 2 处、`app.js:46` require risk-library、`trainingPlanService` require、A 类 2 处），与 P1-01 报告记录一致，非本轮引入，按纪律登记不清理 |
| 测试基线 | 全量 `jest`（多 worker）：**8 套件失败 / 3 用例失败 / 762 通过 / 765 总数**；失败含 `hse-violation-assessment` 路由 babel 解析错误（app.js:473 require 链）与 jest worker OOM，均为既有基线失败。注：`--runInBand` 单进程模式会在 personnel-insurance 套件 require app.js 时 OOM（4GB/8GB 堆均复现），属基线既有问题，多 worker 口径可正常完成 |

## 三、五项实施详情

### A｜移除 V2 导入运行时视图 DDL（最高优先）✔

**文件**：`server/services/employeeImportV2Service.js`（原 `ensureViewFields` :641–707 及调用点 :719）

- **移除**：`let viewUpdated` + `ensureViewFields()`（每次 V2 导入首触发 `DROP VIEW IF EXISTS v_employee_current` + 按代码副本重建）整体删除，调用点替换为说明注释。
- **风险定性（修复依据）**：代码副本列集缺 `employment_relationship_status`，而 `server/sql/alter_employee_relation_status.sql`（2026-10-23 已在 dev+生产执行）的权威定义已含该列及 `id_card / is_public_welfare / id_address` 全部业务列 ⇒ 运行时副本相对权威定义**无独有列、纯旧版残留**，触发即把视图打回旧版破坏依赖该列的消费者（如 B02-DEC-03.28 报告记载的引用缺口）。移除后导入业务（视图只读场景 `:576 matchTownCenter` 等）零能力损失。
- **ensurePendingColumns 登记（保留不扩展）**：首次调用对 `employee_import_pending` 执行 7 条 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`（纯加列、幂等、`pendingColumnsReady` 缓存使进程生命周期内至多一轮）。**无立即阻断风险**：列均已存在（IF NOT EXISTS 空转）、语句幂等且 catch 吞重复列冲突、不删列/不改类型/不加约束。遗留治理项登记：应迁入正式迁移脚本后整体移除（不属本轮）。
- **clearAll 保护确认**：`clearAll`(:1408–1410) 与 `clearAllCascade`(:1552–1554) 均在函数最顶端被 `PURGE_ALL_PERMANENTLY_DISABLED = true`(:55) fail-closed 短路，早于 `pool.connect()`，拒绝路径零连接、零 SQL；`clearAllPreview` 只读不删。**不可绕过（本文件内无旁路开关）**。

### B｜修订 v68 迁移脚本 v_employee_org_full 视图定义 ✔

**文件**：`server/sql/hse_org_center_v68_migration.sql`（第六节 :210–257 → 修订后含 B-1-P1-02-B 注释头）

- 原定义 `LEFT JOIN hse_employee_relation`（1,304 行 employee_id 3866~5363 与生产 employee.id 6692~10240 区间完全不相交，100% 断链）重放会把视图改回断链版。
- 修订为 `employee_assignment` 版（`ea.is_current=true AND ea.is_primary=true AND ea.is_deleted=false`），字段名/顺序/类型/语义与 `hse_fix_v_employee_org_full.sql`（2026-08-27 生产修复版、现行生产定义）**逐列一致**；`relation_id` 列名保留兼容既有消费者（两表 id 同为 bigint，类型兼容，`CREATE OR REPLACE` 对已存在的修复版视图可直接覆盖）。
- **重复执行行为（dev 实证）**：全文件幂等（加列 DO 块 IF NOT EXISTS + CREATE OR REPLACE 视图 + 配置 INSERT ON CONFLICT DO NOTHING）；连续执行两次，`v_employee_org_full` 行数稳定 3,417（active=3,238），无行为突变。
- **回滚方法**：将第六节改回原 relation 版 `CREATE OR REPLACE VIEW` 即可（视图是查询层，无数据变更）；亦可用 `hse_fix_v_employee_org_full.sql` 头部注释的旧定义。
- **未在生产执行**（生产现行定义已是 assignment 版，无需任何动作）。

### C｜修复风险画像视图 ✔

**文件**：`server/sql/sprint61_risk_profile_migration.sql`（:113–117）

- 原 `JOIN hse_employee_relation er ON ... is_current=true AND is_deleted=false`（INNER JOIN 断链表 ⇒ 视图恒 0 行，消费方 `hseRiskProfileService.js:116/244/419` 生产永远拿不到画像）。
- 改为 `JOIN employee_assignment ea ON ea.employee_id=e.id AND ea.is_current=true AND ea.is_primary=true AND ea.is_deleted=false`——与 `v_employee_current` / `v_employee_org_full` 同口径，`uk_emp_assign_primary` 唯一索引保证一人至多一行。
- **兼容性**：输出列名全部不变（`org_unit_id / operation_unit_id / position_id` 等两表同名列），消费方零改动。
- **禁止姓名匹配替代**：三违子查询既有 `name+township` 匹配为 violations 表无 employee_id 的历史逻辑，本轮原样保留、注释声明不以其替代任何 employee_id 关联；断链修复本身纯走 employee_id。
- **dev 边界实证**：

| 检查 | 结果 |
|---|---|
| 视图数据源 | relation → **assignment** |
| 行数 | **0 → 3,238**（3,417 在职员工中 3,238 有 current 主段） |
| 一人一行 | 3,238 行 = 3,238 distinct employee_id ✔ |
| 无段员工排除 | dev 163 个在职员工无 current 主段，均不在视图 ✔（3,417−3,238=179 含 16 个已软删员工，本视图 `WHERE e.is_deleted=false` 与原版一致） |
| 无快照员工 | 3,115 人 COALESCE 归零（violation/accident/hazard/training 全 0）✔ |
| 幂等重放 | 重放后行数稳定 3,238 ✔ |

### D｜V1 导入关段补全 ✔

**文件**：`server/services/employeeImportService.js`（原 :694）

修复前：`UPDATE employee_assignment SET is_current = false, updated_at = NOW() WHERE employee_id = $1 AND is_current = true`——缺 `end_date`、缺 `is_deleted=false` 条件。

修复后（单条 UPDATE）：

1. **补 `end_date`**：`CASE WHEN $2::date IS NOT NULL THEN ($2::date - INTERVAL '1 day')::date ELSE CURRENT_DATE END`——对齐 `employeeAssignmentService.assignEmployee` 关段范式（end_date = 新段 start_date − 1，时间轴无重叠无缝隙）；花名册未填入职日期（`startDate=null`）时回退 `CURRENT_DATE` 并记 warning；
2. **补 `is_deleted = false` 条件**：软删段不再被业务 UPDATE 触碰；
3. **异常显式处理**：本 UPDATE 不做局部 try/catch——失败即向上抛出，由既有行级 catch 统一 ROLLBACK 并计入该行 `errors`（行级失败可见，不静默吞掉、不存在「关段失败但新段照插」的半更新）；**新增 `rowCount === 0` 检查**：无现行段可关时 push warning 留痕（不阻断导入）。

配套：`employee-import-v1-terminal-guard.unit.test.js` 两处断言从单行子串改为等价正则（意图不变：关段 UPDATE 存在、先于建段），并新增断言关段 SQL 含 `end_date = CASE`（证明修复生效）。

### E｜deleteEmployee 事务化 ✔

**文件**：`server/services/employeeService.js`（原 :610–626）

- 原实现两次独立 `pool.query`（软删 employee + 关段）——第二次失败留下「员工已软删但任职段仍 is_current=true」的半更新脏状态。
- 现实现：`pool.connect()` → `BEGIN` → 软删（`RETURNING id, name`）→ 关段 → `COMMIT`；任一失败 `ROLLBACK` 并**向上抛出**（controller `hse-employee.js:212–227` 既有 try/catch 捕获后统一 `error(-1, err.message)`，调用链安全）；`ROLLBACK` 自身失败不掩盖原异常；`finally` 释放连接。
- **语义保留**：`end_date = CURRENT_DATE` 不变（删除无新段 start_date 可对齐 ASG 的 start−1 规则）；返回结构不变（成功 `{audit:{id,name}}` / 不存在 `{error:-2}`）。
- **新测试**：`__tests__/employee-delete-transaction.unit.test.js` 5 例（T1 正常删除+COMMIT+CURRENT_DATE 断言；T2 员工不存在 ROLLBACK 零 COMMIT；T3 关段失败回滚+上抛；T4 COMMIT 失败回滚+上抛；T5 ROLLBACK 二次故障不掩盖原异常）——**5/5 绿**。

## 四、测试与验证结果

| 层 | 结果 |
|---|---|
| 语法 | 三个 service 文件 `node --check` 通过 |
| 员工域回归 | 8 套件（v1/v2 terminal-guard、v2 purge-guard、assignment terminal-guard、status-code、terminate、rehire、relation-d1）**253/253 绿** |
| 新增测试 | delete-transaction **5/5 绿** |
| 全量回归 | **767 通过 / 3 失败，44 套件 8 失败**——失败 8 套件/3 用例与基线（762 通过/3 失败/43 套件 8 失败）完全一致，**零劣化**（+5 通过 = 新增测试；+1 套件 = 新增测试文件） |
| dev 库实证 | current_database 断言 ✔；v68+sprint61 各执行一次+重放一次均成功且视图行数稳定（org_full 3,417/active 3,238；risk 3,238）；无段/无快照边界 ✔ |
| 完整性 | 6 处问题与基线完全一致（untracked 历史存量），零新增 |
| 敏感扫描 | 改动文件 diff 中 password/secret/key/token/私钥头/手机号/身份证号模式 **零命中** |

## 五、提交与核验

| 项 | 值 |
|---|---|
| 业务提交 | `83f0c58` fix(employee): B-1-P1-02 人员主数据第一批安全收敛（A-E 五项） |
| 提交内容 | 恰为 7 个目标文件（diff-tree 核验）：employeeImportV2Service.js、employeeImportService.js、employeeService.js、hse_org_center_v68_migration.sql、sprint61_risk_profile_migration.sql、employee-import-v1-terminal-guard.unit.test.js、employee-delete-transaction.unit.test.js（新增） |
| cost.js | 零卷入；staged `A`；MD5 `e88ae2b0b275346dfc1431408aa00bff`；不在 `83f0c58` 提交树（`git cat-file -e` 确认） |
| 报告提交 | 本文件，单独提交 |
| push | 7890 代理推送（另行执行，结果见交付回复） |

## 六、遗留与登记项（不阻塞本节点关闭）

1. **ensurePendingColumns 迁移脚本化**：`employee_import_pending` 运行时 ALTER TABLE 应迁入正式 SQL 迁移后整体移除（本轮仅登记）。
2. **生产侧无需动作**：`v_employee_org_full` 生产已是 assignment 版；`v_employee_risk_profile` 生产是否仍为 relation 断链版需下次生产只读窗口确认（若为 relation 版，可按本次修订文件在授权窗口执行，仅此一条 `CREATE OR REPLACE VIEW`）。
3. **测试基线既有失败**（8 套件/3 用例）继续由既有基线口径承接，非本轮范围。
4. **violations 表姓名匹配**（sprint61 三违子查询）为历史逻辑，待 violations 域具备 employee_id 关联后另行收敛。
