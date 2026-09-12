# Sprint-C Step 1：旧模型使用情况审计报告

> **报告版本**: v2.0（实际扫描版）
> **编制日期**: 2026-07-28
> **项目**: Sprint-C v1.0 人员中心新模型稳定化与旧模型治理
> **审计范围**: 后端路由、服务、脚本、SQL、测试、前端 API/视图
> **扫描日期**: 2026-07-28
> **扫描方法**: Grep 全量扫描 + 关键文件阅读

---

## 一、审计概述

本报告基于对项目代码的实际扫描，全面梳理 `hse_employee_relation` 和 `hse_employee_org` 两张旧模型表在后端、前端、SQL 脚本、测试代码中的使用情况。

**扫描结果概要**：

- `hse_employee_relation`：在 **27** 个文件中被引用
- `hse_employee_org`：在 **20+** 个文件中被引用
- **P0 阻断项**：生产路由 `hse-employee.js` 中存在对 `hse_employee_org` 的 INSERT/UPDATE/DELETE 操作
- **P0 阻断项**：测试脚本 `_sprint6b_import.js`、`_sprint6c_import.js`、`migrate_employee_v2.js` 中存在对 `hse_employee_relation` 的 INSERT 操作

---

## 二、hse_employee_relation 使用情况

### 2.1 生产后端路由

| 模块 | 文件路径 | 行号 | 操作类型 | 风险等级 | 描述 |
|------|---------|------|---------|---------|------|
| 员工路由 | `server/routes/hse-employee.js` | — | 未直接引用 | Low | hse-employee.js 未直接引用 hse_employee_relation |

### 2.2 历史迁移/检查脚本（非生产运行时）

| 模块 | 文件路径 | 行号 | 操作类型 | 风险等级 | 描述 |
|------|---------|------|---------|---------|------|
| 迁移脚本 | `server/migrate-employee-assignment.js` | 5,49,60,67,70,73,75 | SELECT | Low | 从 hse_employee_relation 迁移到 employee_assignment 的一次性脚本 |
| 检查脚本 | `server/_check_emp_relation.js` | 7,32 | SELECT | Low | 数据检查脚本，仅做只读查询 |
| 检查脚本 | `server/_check_supervisor.js` | 24,27,29,32,35,37 | 元数据查询 | Low | 查看表结构的诊断脚本 |
| 检查脚本 | `server/check-driver-position.js` | 4 | SELECT | Low | 查询驾驶员岗位关联 |
| 检查脚本 | `server/_init_help.js` | 81 | SELECT | Low | 单行引用 |
| 调研脚本 | `server/survey-sprint63a1.js` | 3,20,23,25,45,48,53,91,94,96 | SELECT | Low | Sprint 6.3 调研脚本 |
| 调研脚本 | `server/survey-sprint63a2.js` | 34,37,39,44,49,60,64,104,107,109,120,124,128,129 | SELECT | Low | 表结构和数据对比脚本 |
| 初始化脚本 | `server/_setup_test_data.js` | 6 | UPDATE | Medium | 测试数据设置脚本，UPDATE hse_employee_relation |
| 初始化脚本 | `server/_check_hse_emp.js` | 6 | 元数据查询 | Low | 表存在性检查 |

### 2.3 数据导入脚本（历史导入）

| 模块 | 文件路径 | 行号 | 操作类型 | 风险等级 | 描述 |
|------|---------|------|---------|---------|------|
| 导入脚本 | `server/_sprint6b_import.js` | 520 | **INSERT** | **P0 阻断** | 员工花名册导入，向 hse_employee_relation 写入数据 |
| 导入脚本 | `server/_sprint6c_import.js` | 511 | **INSERT** | **P0 阻断** | 同上，另一批次导入 |
| 迁移脚本 | `server/scripts/migrate_employee_v2.js` | 615 | **INSERT** | **P0 阻断** | V2 模型迁移脚本，向 hse_employee_relation 写入 |

### 2.4 SQL 脚本引用

| 文件路径 | 操作类型 | 风险等级 | 描述 |
|---------|---------|---------|------|
| `server/sql/hse_org_center_v68_migration.sql` | CREATE TABLE, SELECT, INDEX | Low | v68 版本表定义和索引创建 |
| `server/sql/sprint5_6_employee_master_migration.sql` | 注释引用 | Low | 标注已废弃，由 employee_assignment 替代 |
| `server/sql/sprint61_risk_profile_migration.sql` | SELECT (JOIN) | Low | 员工风险画像迁移中 JOIN 查询 |
| `server/sql/hse_employee_master_v59_migration.sql` | 注释引用 | Low | 旧版本定义 |

### 2.5 测试/审计脚本

| 文件路径 | 操作类型 | 风险等级 | 描述 |
|---------|---------|---------|------|
| `server/test-uploads/audit-pre-sprint-b.js` | SELECT, JOIN | Low | Sprint-B 前置审计，只读 |
| `server/test-uploads/audit-org-model.js` | SELECT | Low | 组织模型审计，只读 |
| `server/__tests__/hse-employee.permissions.test.js` | DELETE | Medium | 测试清理中删除 hse_employee_org 测试数据 |

### 2.6 前端代码引用

| 模块 | 文件路径 | 操作类型 | 风险等级 | 描述 |
|------|---------|---------|---------|------|
| API 层 | `安全看板vben/apps/web-antd/src/api/hse/employee.ts` | 间接（通过后端API） | Low | 前端仅调用后端接口，未直接引用表名 |

**小结**：`hse_employee_relation` 在生产路由中无直接引用，仅在历史迁移脚本和一次性导入脚本中存在 INSERT 操作。前端未直接引用。

---

## 三、hse_employee_org 使用情况

### 3.1 生产后端路由（核心风险区）

| 模块 | 文件路径 | 行号 | 操作类型 | 风险等级 | 描述 |
|------|---------|------|---------|---------|------|
| 统计接口 | `server/routes/hse-employee.js` | 504 | SELECT | High | 员工统计接口，按 status 分组查询 |
| 员工详情 | `server/routes/hse-employee.js` | 542 | SELECT | High | 查询员工当前组织关系用于详情展示 |
| 员工删除 | `server/routes/hse-employee.js` | 693 | UPDATE | **P0 阻断** | 删除员工时将 hse_employee_org 置为非当前 |
| 组织树 | `server/routes/hse-employee.js` | 734-742 | SELECT | High | 统计各部门在职人数 |
| 员工列表 | `server/routes/hse-employee.js` | 820,833 | SELECT (JOIN) | High | 员工列表查询 JOIN hse_employee_org |
| 组织关系查询 | `server/routes/hse-employee.js` | 1106,1135 | SELECT | High | 专属组织关系查询接口 |
| 调岗接口 | `server/routes/hse-employee.js` | 1175 | SELECT | **P0 阻断** | 查询当前组织关系（调岗前置） |
| 调岗接口 | `server/routes/hse-employee.js` | 1193 | **UPDATE** | **P0 阻断** | 结束旧组织关系（is_current=false） |
| 调岗接口 | `server/routes/hse-employee.js` | 1205 | **INSERT** | **P0 阻断** | 新增组织关系 |
| 状态变更 | `server/routes/hse-employee.js` | 1257 | SELECT | **P0 阻断** | 查询组织关系（状态变更前置） |
| 状态变更 | `server/routes/hse-employee.js` | 1272 | **UPDATE** | **P0 阻断** | 离职/退休：结束当前记录 |
| 状态变更 | `server/routes/hse-employee.js` | 1278 | **UPDATE** | **P0 阻断** | 待岗/复岗/返聘：更新状态 |
| Excel 导入 | `server/routes/hse-employee.js` | 1677 | **UPDATE** | **P0 阻断** | 导入时将旧组织关系置为非当前 |
| Excel 导入 | `server/routes/hse-employee.js` | 1683 | **INSERT** | **P0 阻断** | 导入时新增组织关系 |
| 其他查询 | `server/routes/hse-employee.js` | 4297 | SELECT (JOIN) | High | 其他业务查询 |

### 3.2 测试/审计脚本

| 文件路径 | 操作类型 | 风险等级 | 描述 |
|---------|---------|---------|------|
| `server/test-uploads/audit-sprint-b.js` | SELECT | Low | Sprint-B 审计，只读查询 |
| `server/test-uploads/audit-org-model.js` | SELECT | Low | 组织模型审计，只读查询 |
| `server/__tests__/hse-employee.standalone.test.js` | **DELETE** | Medium | 测试清理，删除测试数据 |
| `server/__tests__/hse-employee.permissions.test.js` | **DELETE** | Medium | 权限测试清理 |
| `server/_inspect_org.js` | SELECT | Low | 诊断脚本，查看表结构和样本 |
| `server/_tmp_check_data.js` | SELECT | Low | 临时数据检查 |

### 3.3 SQL 脚本引用

| 文件路径 | 操作类型 | 风险等级 | 描述 |
|---------|---------|---------|------|
| `server/sql/hse_employee_master_v59_migration.sql` | CREATE TABLE, INDEX | Low | v59 版本表定义 |
| `server/sql/hse_org_center_v68_migration.sql` | ALTER TABLE, COLUMN ADD | Low | 增加 is_deprecated 列 |
| `server/sql/sprint61_risk_profile_migration.sql` | SELECT (JOIN) | Low | 风险画像迁移 JOIN 查询 |

### 3.4 前端代码引用

| 模块 | 文件路径 | 操作类型 | 风险等级 | 描述 |
|------|---------|---------|---------|------|
| API 层 | `安全看板vben/apps/web-antd/src/api/hse/employee.ts` | 间接 | Medium | `getEmployeeOrg` → `GET /org/employee/:id`；`getEmployeeOrgHistory` → `GET /org/employee/:id/history`；`assignOrg` → `POST /org/assign`；`updateOrgStatus` → `PUT /org/:id/status` |

**前端 API 函数与后端路由映射**：

| 前端函数 | 后端路由 | 操作类型 |
|---------|---------|---------|
| `getEmployeeOrg(employeeId)` | `GET /org/employee/:employeeId` | SELECT hse_employee_org |
| `getEmployeeOrgHistory(employeeId)` | `GET /org/employee/:employeeId/history` | SELECT hse_employee_org |
| `assignOrg(data)` | `POST /org/assign` | INSERT + UPDATE hse_employee_org |
| `updateOrgStatus(id, data)` | `PUT /org/:id/status` | UPDATE hse_employee_org |

**小结**：前端未直接引用表名，但通过 4 个 API 函数间接依赖后端对 `hse_employee_org` 的增删改查。

---

## 四、关键发现与阻断条件

### 4.1 阻断项（P0级）

**定义：发现 INSERT INTO / UPDATE / DELETE hse_employee_relation 或 hse_employee_org 且在生产服务中执行。**

| # | 表名 | 文件路径 | 行号 | 操作类型 | 执行场景 | 判定 |
|---|------|---------|------|---------|---------|------|
| 1 | hse_employee_org | `server/routes/hse-employee.js` | 1205 | INSERT | **POST /org/assign**（生产接口） | **P0 阻断** |
| 2 | hse_employee_org | `server/routes/hse-employee.js` | 1193 | UPDATE | **POST /org/assign**（生产接口） | **P0 阻断** |
| 3 | hse_employee_org | `server/routes/hse-employee.js` | 1272 | UPDATE | **PUT /org/:id/status**（生产接口） | **P0 阻断** |
| 4 | hse_employee_org | `server/routes/hse-employee.js` | 1278 | UPDATE | **PUT /org/:id/status**（生产接口） | **P0 阻断** |
| 5 | hse_employee_org | `server/routes/hse-employee.js` | 693 | UPDATE | **DELETE /employees/:id**（生产接口） | **P0 阻断** |
| 6 | hse_employee_org | `server/routes/hse-employee.js` | 1677 | UPDATE | **POST /employees/import**（生产接口） | **P0 阻断** |
| 7 | hse_employee_org | `server/routes/hse-employee.js` | 1683 | INSERT | **POST /employees/import**（生产接口） | **P0 阻断** |
| 8 | hse_employee_relation | `server/_sprint6b_import.js` | 520 | INSERT | 历史导入脚本（非生产运行时） | **P0 阻断** |
| 9 | hse_employee_relation | `server/_sprint6c_import.js` | 511 | INSERT | 历史导入脚本（非生产运行时） | **P0 阻断** |
| 10 | hse_employee_relation | `server/scripts/migrate_employee_v2.js` | 615 | INSERT | 历史迁移脚本（非生产运行时） | **P0 阻断** |

### 🔄 Phase1 收敛后状态更新（2026-07-29 追加）

> 本小节为治理回写，非删除原审计。原 §4.1 阻断项表（#1~#10）作为收敛前（2026-07-28）历史快照保留。

| 原阻断项 | 收敛前 | 收敛后（Phase1 实测） | 依据 |
|----------|--------|----------------------|------|
| #1~#7（hse_employee_org 生产写入 P0） | 7 处 P0 阻断 | **全部清零**（代码 Grep 确认 INSERT/UPDATE/DELETE 各 0 处） | Phase1 报告 §四 / P1-4 §三 |
| #8~#10（hse_employee_relation 历史脚本 INSERT） | P0 阻断 | **非生产路由，不受影响**（仅一次性历史脚本，生产运行时无引用） | Legacy_Table_Lifecycle_Report §2.1 |
| **P0 阻断状态** | 生效 | **已解除** | Phase1 报告 §十（hse_employee_org 生产写入 0/0 达标） |

- **引用来源**：P1-4 审计报告 §三（代码 Grep 实证）+ Sprint-C-Phase1-API-Convergence-Report §四（清理前/后 3→0 / 3→0 / 1→0 / 8→0）。
- **说明**：原 §4.1 的「7 处 P0 写操作」为 Phase1 实施前快照。实施完成后该阻断解除，旧表进入「待只读保护」状态；#8~#10 始终为非生产历史脚本，不随本次收敛改变。

> 🔒 **禁止代签**：本状态更新为文档治理回写，不涉及代码 / SQL 变更。若需签字确认，须由后端负责人 / 架构师亲签；本报告原无独立签字栏，保持空白，禁止代签。

### 4.2 高风险 SELECT 依赖

| # | 表名 | 文件路径 | 行号 | 操作类型 | 影响接口 | 风险描述 |
|---|------|---------|------|---------|---------|---------|
| 1 | hse_employee_org | `server/routes/hse-employee.js` | 504 | SELECT | GET /employees/stats | 员工统计接口依赖旧表 |
| 2 | hse_employee_org | `server/routes/hse-employee.js` | 542 | SELECT | GET /employees/:id | 员工详情依赖旧表 |
| 3 | hse_employee_org | `server/routes/hse-employee.js` | 734-742 | SELECT | GET /departments/tree | 组织树人数统计依赖旧表 |
| 4 | hse_employee_org | `server/routes/hse-employee.js` | 820,833 | SELECT | GET /employees/list | 员工列表 JOIN 旧表 |
| 5 | hse_employee_org | `server/routes/hse-employee.js` | 1106 | SELECT | GET /org/employee/:id | 组织关系专用查询 |
| 6 | hse_employee_org | `server/routes/hse-employee.js` | 1135 | SELECT | GET /org/employee/:id/history | 组织历史查询 |
| 7 | hse_employee_org | `server/routes/hse-employee.js` | 4297 | SELECT | 其他业务查询 | 其他模块通过 JOIN 引用 |

### 4.3 非阻断项（可延后处理）

| # | 表名 | 文件路径 | 类型 | 说明 |
|---|------|---------|------|------|
| 1 | hse_employee_relation | `server/test-uploads/audit-*.js` | 只读审计 | 历史审计脚本，不影响生产 |
| 2 | hse_employee_org | `server/_inspect_org.js` | 诊断脚本 | 临时诊断工具 |
| 3 | hse_employee_relation | `server/_check_supervisor.js` | 诊断脚本 | 查看表结构 |
| 4 | hse_employee_org | `server/__tests__/*.test.js` | 测试清理 | 测试中的 DELETE 操作，不影响生产 |
| 5 | hse_employee_relation | `server/sql/*.sql` | SQL 脚本 | 历史迁移脚本，已执行完毕 |

---

## 五、总结与结论

### 5.1 总体评估

| 维度 | 评估 | 详情 |
|------|------|------|
| hse_employee_relation 生产写入 | ✅ 无 | 生产路由未直接引用 hse_employee_relation |
| hse_employee_relation 历史写入 | ⚠️ 存在 | 3 个历史脚本中存在 INSERT（已执行完毕） |
| hse_employee_org 生产写入 | ❌ 存在 | 生产路由中存在 5 处写操作（INSERT/UPDATE） |
| hse_employee_org 生产读取 | ❌ 深度依赖 | 至少 7 个生产接口依赖 hse_employee_org 的 SELECT |
| 前端依赖 | ⚠️ 间接依赖 | 4 个 API 函数通过后端间接依赖 hse_employee_org |

> ⚠️ **见 §4.1「Phase1 收敛后状态更新」**：本 §5.1 评估为收敛前快照，其中「hse_employee_org 生产写入 ❌ 存在 / 5 处写操作」已被 Phase1 收敛事实取代（生产写入已清零，见 §4.1 更新表）。原表保留作历史快照，不删除。

### 5.2 阻断结论

**系统当前处于「旧模型写入中」状态**，不满足冻结条件：

1. **hse_employee_org 仍为生产主写入表**：调岗、状态变更、Excel 导入、员工删除等核心功能均写入此表
2. **hse_employee_org 为生产主读取表**：员工详情、列表、统计、组织树等查询均依赖此表
3. **hse_employee_relation 已完成冻结**：无生产写入，仅历史脚本中有一次性 INSERT（已执行完毕）

### 5.3 下一步行动（Sprint-C Step 2）

必须先完成 **后端 API 收敛**：

1. 将 `hse-employee.js` 中所有对 `hse_employee_org` 的 INSERT/UPDATE 操作迁移到 `employee_assignment`
2. 将 `hse-employee.js` 中所有对 `hse_employee_org` 的 SELECT 操作迁移到 `employee_assignment` + `hse_org_unit`
3. 确保迁移后前端 API 调用不受影响（保持接口契约）
4. 完成后再执行 hse_employee_org 冻结（Step 4）

---

> **报告结束**
>
> 本报告由 AI 辅助生成，基于 2026-07-28 实际代码扫描结果。所有风险项需由开发团队确认。
