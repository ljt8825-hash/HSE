# Sprint-C Step 2：后端 API 收敛报告

> **报告版本**: v2.0（实际扫描版）
> **编制日期**: 2026-07-28
> **项目**: Sprint-C v1.0 人员中心新模型稳定化与旧模型治理
> **核心目标**: 将所有人员相关 API 从旧模型（hse_employee_org）收敛至新模型（employee_assignment + hse_org_unit）

---

## 一、收敛原则

1.  **统一数据源**：所有人员组织关系的查询和写入，必须通过 `employee_assignment` 表进行。
2.  **立即停止旧写入**：`hse_employee_org` 必须立即停止 INSERT/UPDATE/DELETE 操作。
3.  **保持接口契约**：前端 API 路径和响应结构保持不变，内部实现切换。
4.  **分阶段执行**：先冻结写入 → 再迁移读取 → 最后清理。

---

## 二、新旧模型结构差异分析

### 2.1 hse_employee_org（旧模型）

```
hse_employee_org
├── employee_id          -- 员工ID
├── group_id             -- 集团级组织ID (department.id)
├── region_id            -- 区域级组织ID (department.id)
├── enterprise_id        -- 企业级组织ID (department.id)
├── project_id           -- 项目级组织ID (department.id)
├── team_id              -- 班组级组织ID (department.id)
├── org_path             -- 组织路径快照（冗余存储）
├── position_id          -- 岗位ID
├── start_date           -- 开始日期
├── end_date             -- 结束日期
├── status               -- 状态（在职/待岗/离职/退休/返聘）
├── is_current           -- 是否当前记录
├── supervisor_id        -- 上级ID
├── change_reason        -- 变更原因
├── is_deleted           -- 软删除
├── created_at           -- 创建时间
└── updated_at           -- 更新时间
```

**特点**：五列扁平组织结构（group/region/enterprise/project/team），通过 `org_path` 冗余存储完整路径。

### 2.2 employee_assignment（新模型）

```
employee_assignment
├── employee_id          -- 员工ID
├── org_unit_id          -- 组织单元ID (hse_org_unit.id)
├── operation_unit_id    -- 作业单元ID (hse_operation_unit.id)
├── position_id          -- 岗位ID (position.id)
├── supervisor_id        -- 上级ID (employee.id)
├── is_current           -- 是否当前记录
├── status               -- 状态
├── is_primary           -- 是否主岗
├── start_date           -- 开始日期
├── end_date             -- 结束日期
├── remark               -- 备注
├── created_by           -- 创建人
├── created_at           -- 创建时间
├── updated_at           -- 更新时间
└── is_deleted           -- 软删除
```

**特点**：引用 `hse_org_unit` 和 `hse_operation_unit` 的规范化关系模型。

### 2.3 字段映射差异

| hse_employee_org 字段 | employee_assignment 字段 | 映射说明 |
|----------------------|------------------------|---------|
| group_id + region_id + enterprise_id + project_id + team_id | org_unit_id | 旧模型5列扁平 → 新模型1列引用 |
| org_path | 无直接对应 | 新模型通过 hse_org_unit 层级动态计算 |
| change_reason | remark | 字段重命名 |
| — | is_primary | 新模型独有：主岗标识 |
| — | operation_unit_id | 新模型独有：作业单元 |

**关键差异**：旧模型的5列扁平组织ID需要通过 hse_org_unit 层级关系来重构。

---

## 三、核心 API 依赖分析与迁移映射

### 3.1 API 端点 → 旧模型 → 新模型映射表

#### A. 员工统计与查询（SELECT，高风险）

| # | API 端点 | 文件:行号 | 当前 SQL | 新模型方案 | 优先级 |
|---|---------|----------|---------|----------|--------|
| A1 | `GET /employees/stats` | hse-employee.js:504 | `SELECT eo.status, COUNT(*) FROM hse_employee_org eo WHERE eo.is_current = true AND eo.is_deleted = false GROUP BY eo.status` | `SELECT ea.status, COUNT(*) FROM employee_assignment ea WHERE ea.is_current = true AND ea.is_deleted = false GROUP BY ea.status` | **P1** |
| A2 | `GET /employees/:id` | hse-employee.js:542 | 查 employee + JOIN hse_employee_org 5层department | 查 employee + JOIN employee_assignment + hse_org_unit | **P1** |
| A3 | `GET /departments/tree` | hse-employee.js:734-742 | 用 hse_employee_org 统计各部门在职人数 | 改用 employee_assignment 统计 | **P1** |
| A4 | `GET /employees/list` | hse-employee.js:820,833 | JOIN hse_employee_org 做员工列表 | JOIN employee_assignment | **P1** |
| A5 | `GET /org/employee/:id` | hse-employee.js:1106 | 直接 SELECT hse_employee_org | SELECT employee_assignment | **P1** |
| A6 | `GET /org/employee/:id/history` | hse-employee.js:1135 | SELECT hse_employee_org + employee_history | SELECT employee_assignment + employee_history | **P1** |
| A7 | 其他业务查询 | hse-employee.js:4297 | JOIN hse_employee_org | JOIN employee_assignment | **P1** |

#### B. 写操作接口（INSERT/UPDATE，P0 阻断）

| # | API 端点 | 文件:行号 | 当前操作 | 新模型方案 | 优先级 |
|---|---------|----------|---------|----------|--------|
| B1 | `POST /org/assign` 调岗 | hse-employee.js:1193 | UPDATE hse_employee_org (结束旧记录) | UPDATE employee_assignment (is_current=false, end_date) | **P0** |
| B2 | `POST /org/assign` 调岗 | hse-employee.js:1205 | INSERT INTO hse_employee_org | INSERT INTO employee_assignment | **P0** |
| B3 | `PUT /org/:id/status` 状态变更 | hse-employee.js:1272 | UPDATE hse_employee_org (离职/退休) | UPDATE employee_assignment | **P0** |
| B4 | `PUT /org/:id/status` 状态变更 | hse-employee.js:1278 | UPDATE hse_employee_org (待岗/复岗) | UPDATE employee_assignment | **P0** |
| B5 | `DELETE /employees/:id` 删除员工 | hse-employee.js:693 | UPDATE hse_employee_org (级联结束) | UPDATE employee_assignment (级联结束) | **P0** |
| B6 | `POST /employees/import` Excel导入 | hse-employee.js:1677 | UPDATE hse_employee_org (旧记录置非当前) | UPDATE employee_assignment | **P0** |
| B7 | `POST /employees/import` Excel导入 | hse-employee.js:1683 | INSERT INTO hse_employee_org | INSERT INTO employee_assignment | **P0** |

### 3.2 外部路由对 hse_employee_org 的引用

| # | 路由文件 | 引用方式 | 说明 |
|---|---------|---------|------|
| 1 | `hse-warning-center.js` | JOIN employee_assignment | ✅ 已使用新模型 |
| 2 | `hse-risk-profile.js` | JOIN employee_assignment | ✅ 已使用新模型 |
| 3 | `hse-risk-profile-detail.js` | FROM employee_assignment | ✅ 已使用新模型 |
| 4 | `hse-risk-profile-base.js` | FROM employee_assignment | ✅ 已使用新模型 |
| 5 | `riskScoreService.js` | FROM employee_assignment | ✅ 已使用新模型 |
| 6 | `hse-employee.js` | **深度依赖 hse_employee_org** | ❌ 旧模型 |

**关键发现**：其他业务路由（预警中心、风险画像、风险评分）已经迁移到 `employee_assignment`，**仅 `hse-employee.js` 路由仍在使用旧模型**。

---

## 四、迁移执行计划

### Phase 0：立即冻结旧模型写入（Step 4 前置）

**目标**：立即阻止对 hse_employee_org 的所有写操作。

**操作**：
1. 注释/禁用 hse-employee.js 中所有 INSERT/UPDATE hse_employee_org 的代码块
2. 在数据库层添加只读保护触发器（Step 4 将生成 SQL）
3. 记录所有被禁用的接口，通知前端暂时不可用

### Phase 1：写操作接口迁移（P0 项，核心）

**按优先级排序**：

1. **B1/B2** — `POST /org/assign` 调岗接口
   - 替换 `hse_employee_org` INSERT/UPDATE → `employee_assignment`
   - 需处理字段映射：5列扁平组织 → org_unit_id
   - 响应结构保持不变（前端依赖）

2. **B3/B4** — `PUT /org/:id/status` 状态变更接口
   - 替换 UPDATE hse_employee_org → UPDATE employee_assignment
   - 需将旧 org 记录 ID 关联到新 assignment 记录 ID

3. **B5** — `DELETE /employees/:id` 级联更新
   - 替换 UPDATE hse_employee_org → UPDATE employee_assignment

4. **B6/B7** — `POST /employees/import` Excel 导入
   - 替换 INSERT/UPDATE hse_employee_org → employee_assignment
   - 需重建导入逻辑中的组织路径匹配

### Phase 2：读取接口迁移（P1 项）

5. **A5/A6** — 组织关系查询接口
   - 直接替换 SELECT 源表
   - `getEmployeeOrg` → 查 employee_assignment + hse_org_unit 层级
   - `getEmployeeOrgHistory` → 查 employee_assignment 历史

6. **A1** — 统计接口
   - 替换数据源为 employee_assignment

7. **A2/A3/A4/A7** — 其他查询
   - 逐步替换 JOIN 源表

### Phase 3：验证与清理

8. 全量接口回归测试
9. 性能对比验证
10. 清理 hse_employee_org 引用代码
11. 前端接口联调

---

## 五、字段映射详细方案

### 5.1 调岗接口字段映射（B1/B2）

**旧模型输入 → 新模型写入**：

| 旧参数 | 新字段 | 映射逻辑 |
|--------|-------|---------|
| employee_id | employee_id | 直接映射 |
| position_id | position_id | 直接映射 |
| supervisor_id | supervisor_id | 直接映射 |
| start_date | start_date | 直接映射 |
| change_reason | remark | 重命名 |
| group_id + region_id + enterprise_id + project_id + team_id | org_unit_id | **需查 hse_org_unit 表确定** |

**org_unit_id 确定逻辑**：
```
若 team_id 存在 → org_unit_id = hse_org_unit.id WHERE hse_org_unit.team_id = team_id
若 project_id 存在 → org_unit_id = hse_org_unit.id WHERE hse_org_unit.project_id = project_id
若 enterprise_id 存在 → org_unit_id = hse_org_unit.id WHERE hse_org_unit.enterprise_id = enterprise_id
若 region_id 存在 → org_unit_id = hse_org_unit.id WHERE hse_org_unit.region_id = region_id
若 group_id 存在 → org_unit_id = hse_org_unit.id WHERE hse_org_unit.group_id = group_id
```

### 5.2 查询接口字段映射（A2/A5）

**旧模型响应 → 新模型响应**：

旧模型直接返回5列组织信息 + 名称关联；新模型需通过 hse_org_unit 层级获取：

```sql
-- 旧模型查询
SELECT eo.*, dg.name AS group_name, dr.name AS region_name, ...
FROM hse_employee_org eo LEFT JOIN department dg ON eo.group_id = dg.id ...

-- 新模型查询
SELECT ea.*, ou.name AS org_name, ou.path AS org_path, ...
FROM employee_assignment ea 
LEFT JOIN hse_org_unit ou ON ea.org_unit_id = ou.id
```

---

## 六、风险与应对

| # | 风险点 | 描述 | 影响 | 应对措施 |
|---|-------|------|------|---------|
| R1 | 字段映射不完整 | 旧模型5列扁平组织 vs 新模型1列引用 | 调岗/查询接口 | 建立 hse_org_unit 查找函数，覆盖所有层级组合 |
| R2 | 前端接口契约变更 | 新模型响应中组织字段结构可能不同 | 前端页面 | 保持响应 JSON 结构兼容，后端做适配层转换 |
| R3 | 数据双写风险 | 迁移期间旧表和新表同时写入 | 数据不一致 | 严格禁止双写，迁移完成后立即使旧表只读 |
| R4 | hse_employee_org 仍有有效查询 | 部分历史查询仍依赖旧表 | 查询性能 | 确认 employee_assignment 数据完整性，必要时创建数据同步 |
| R5 | 历史脚本中的 INSERT | 非生产脚本仍可能写入旧表 | 测试数据 | 标记为历史归档，禁止在生产环境执行 |

---

## 七、结论

### 7.1 收敛现状总结

| 维度 | 状态 | 详情 |
|------|------|------|
| 其他业务路由 | ✅ 已迁移 | hse-warning-center、hse-risk-profile 等已使用 employee_assignment |
| hse-employee.js 写操作 | ❌ 未迁移 | 7 处 P0 级写操作仍在 hse_employee_org |
| hse-employee.js 读操作 | ❌ 未迁移 | 7 处高风险 SELECT 仍在 hse_employee_org |
| 历史脚本 | ⚠️ 已归档 | 仅在一次性迁移/导入脚本中引用，不影响生产 |
| 前端 API | ✅ 接口稳定 | 前端调用的 API 路径不变，仅后端实现需切换 |

### 🔄 Phase1 收敛后状态更新（2026-07-29 追加）

> 本小节为治理回写，非删除原审计。原 §7.1 收敛现状总结表作为收敛前（2026-07-28）历史快照保留。

| 维度 | 收敛前（原 §7.1） | 收敛后（Phase1 实测） | 依据 |
|------|------------------|----------------------|------|
| hse-employee.js 写操作 | ❌ 未迁移，7 处 P0 | **✅ 已迁移**（代码 Grep 确认 0 处 INSERT/UPDATE/DELETE） | Phase1 报告 §四 / P1-4 §三 |
| hse-employee.js 读操作 | ❌ 未迁移，7 处高风险 SELECT | ✅ 已迁移（Phase1 报告 §三 Phase 2 共 8 个查询接口完成） | Phase1 报告 §三 |
| 历史脚本 | ⚠️ 已归档 | ⚠️ 未变（非生产，不影响） | — |

- **引用来源**：P1-4 审计报告 §三（代码 Grep 实证 0 写入）+ Sprint-C-Phase1-API-Convergence-Report §一/§四（写入风险清除、清理后 0 处）。
- **说明**：原 §7.1「❌ 未迁移，7 处 P0」为 Phase1 实施前快照。实施完成后 hse-employee.js 所有写/读操作均已切换至 `employee_assignment`，旧表进入「待只读保护」状态。

> 🔒 **禁止代签**：本状态更新为文档治理回写，不涉及代码 / SQL 变更。若需签字确认，须由后端负责人 / 架构师亲签；本报告原无独立签字栏，保持空白，禁止代签。

### 7.2 关键结论

1. **hse-employee.js 是唯一需要迁移的生产路由文件**，其他业务路由已完成迁移
2. **迁移优先级**：先冻结写入（P0）→ 再迁移读取（P1）→ 最后清理
3. **字段映射是核心难点**：5列扁平组织 → 单列 org_unit_id 需要建立查找逻辑
4. **接口契约可保持**：前端 API 路径和响应结构不需要变更

### 7.3 下一步行动

1. **Sprint-C Step 4**：生成 hse_employee_org 只读保护 SQL
2. **代码重构**：按 Phase 0 → Phase 1 → Phase 2 顺序执行 hse-employee.js 迁移
3. **验证**：全量接口回归测试 + 性能对比

---

> **报告结束**
>
> 本报告基于 2026-07-28 实际代码扫描结果生成。迁移代码将作为独立开发任务在后续 Sprint 中执行。
