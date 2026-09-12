# 提示词 38：P1 技术债清理（续）— 视图缺列兄弟端点修复

> 创建日期：2026-07-29
> 前置条件：提示词 37 已完成（P1-1/P1-2/P1-3 全部修复），`R1-Phase1-P1-技术债清理报告.md` 已出具
> 关联文档：`提示词-37-R1-Phase1-P1-技术债清理.md`（§5.1 视图列分析）、`R1-Phase1-P1-技术债清理报告.md`（§3.1 偏差说明、§5 范围外残留）
> 性质：**代码修改**（后端 1 文件，不涉及数据库迁移/路由/菜单/前端）

---

## 背景

提示词 37 任务 C 修复了 `GET /employees/profile/list` 端点的视图缺列问题。执行过程中发现一个关键事实：**生产环境 `v_employee_current` 视图实际仅 10 列**（`employee_id, employee_code, name, assignment_status, is_current, hire_date, org_name, org_type, position_name, is_driver`），而非提示词假设的完整列集合。

P1 技术债清理报告 §5 明确指出：**3 个兄弟端点同样引用 `v_employee_current` 不存在的列，生产环境同样会 500**。本次任务修复这 3 个端点，消除同一类缺陷的全部残留。

---

## 要求

### 1. 读取关键文件

- `F:\hse-dashboard\server\routes\hse-employee.js`（以下端点位置）：
  - `profile/:id` — L5842-5850
  - `over-age/auto-list` — L6144-6165
  - `over-age/auto/:id` — L6254-6261
- `F:\hse-dashboard\server\sql\sprint5_6_employee_master_migration.sql`（`v_employee_current` 视图定义，L262-309）
- `F:\hse-dashboard\docs\R1-Phase1-P1-技术债清理报告.md`（§3 偏差说明、§5 范围外残留）

### 2. 视图实际列清单（以 `information_schema` 实时核验为准）

```
v_employee_current 实际列（10 列）：
employee_id, employee_code, name, assignment_status, is_current,
hire_date, org_name, org_type, position_name, is_driver
```

**不存在**的列（需通过 JOIN 基表补充）：
- `org_unit_id`, `org_code`, `org_path` → 需 JOIN `employee_assignment` + `hse_org_unit`
- `operation_unit_id`, `unit_name`, `unit_type`, `unit_code` → 需 JOIN `employee_assignment` + `hse_operation_unit`
- `position_id`, `position_code`, `risk_level` → 需 JOIN `employee_assignment` + `position`
- `supervisor_id`, `supervisor_name` → 需 JOIN `employee_assignment` + `employee`
- `start_date`, `end_date` → 来自 `employee_assignment`
- `phone`, `id_card`, `gender`, `birth_date`, `age` → 来自 `employee`

### 3. 红线规则

- 不修改视图定义（避免影响其他消费者）
- 不新增数据库迁移
- 不修改路由定义、菜单配置
- 修复后端点必须 200，返回字段与前端契约一致

---

## 3. 任务 A：修复 `GET /employees/profile/:id`（L5842-5850）

### 3.1 问题

```sql
SELECT ev.org_unit_id, ev.org_name, ev.org_type, ev.org_code, ev.org_path,
       ev.operation_unit_id, ev.unit_name, ev.unit_type, ev.unit_code,
       ev.position_id, ev.position_name, ev.position_code, ev.risk_level,
       ev.supervisor_id, ev.supervisor_name,
       ev.assignment_status, ev.start_date, ev.end_date
FROM v_employee_current ev WHERE ev.employee_id = $1
```

17 个列中仅 `org_name, org_type, position_name, assignment_status` 4 个存在于视图，其余 13 个均不存在。

### 3.2 修改方案

参照 `profile/:id/assignments` 端点（L5871-5884）的已有模式，改用 `employee_assignment` 直连基表：

```sql
SELECT ea.org_unit_id, ou.org_name, ou.org_type, ou.org_code, ou.org_path,
       ea.operation_unit_id, opu.unit_name, opu.unit_type, opu.unit_code,
       ea.position_id, p.name AS position_name, p.position_code, p.risk_level,
       ea.supervisor_id, sup.name AS supervisor_name,
       ea.status AS assignment_status, ea.start_date, ea.end_date
FROM employee_assignment ea
LEFT JOIN hse_org_unit ou ON ou.id = ea.org_unit_id AND ou.is_deleted = false
LEFT JOIN hse_operation_unit opu ON opu.id = ea.operation_unit_id AND opu.is_deleted = false
LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
LEFT JOIN employee sup ON sup.id = ea.supervisor_id AND sup.is_deleted = false
WHERE ea.employee_id = $1 AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false
```

**关键变更**：
- 数据源由 `v_employee_current` 改为 `employee_assignment`（直连基表，与 `profile/:id/assignments` 一致）
- 新增 `is_current = true AND is_primary = true` 过滤（确保取当前主职）
- `ev.assignment_status` → `ea.status`（`employee_assignment` 表字段名不同）
- 视图不存在的列全部通过 JOIN 补充

### 3.3 响应字段对照

| 原字段（ev.xxx） | 新字段 | 来源 |
|------------------|--------|------|
| `ev.org_unit_id` | `ea.org_unit_id` | employee_assignment |
| `ev.org_name` | `ou.org_name` | hse_org_unit |
| `ev.org_type` | `ou.org_type` | hse_org_unit |
| `ev.org_code` | `ou.org_code` | hse_org_unit |
| `ev.org_path` | `ou.org_path` | hse_org_unit |
| `ev.operation_unit_id` | `ea.operation_unit_id` | employee_assignment |
| `ev.unit_name` | `opu.unit_name` | hse_operation_unit |
| `ev.unit_type` | `opu.unit_type` | hse_operation_unit |
| `ev.unit_code` | `opu.unit_code` | hse_operation_unit |
| `ev.position_id` | `ea.position_id` | employee_assignment |
| `ev.position_name` | `p.name AS position_name` | position |
| `ev.position_code` | `p.position_code` | position |
| `ev.risk_level` | `p.risk_level` | position |
| `ev.supervisor_id` | `ea.supervisor_id` | employee_assignment |
| `ev.supervisor_name` | `sup.name AS supervisor_name` | employee |
| `ev.assignment_status` | `ea.status AS assignment_status` | employee_assignment |
| `ev.start_date` | `ea.start_date` | employee_assignment |
| `ev.end_date` | `ea.end_date` | employee_assignment |

---

## 4. 任务 B：修复 `GET /over-age/auto-list`（L6144-6165）

### 4.1 问题

```sql
SELECT ..., ev.org_unit_id, ev.org_name AS dept_name, ev.org_path,
       ev.position_id, ev.position_name, ev.assignment_status AS status
FROM employee e
LEFT JOIN v_employee_current ev ON ev.employee_id = e.id
```

`ev.org_unit_id, ev.org_name, ev.org_path, ev.position_id, ev.position_name, ev.assignment_status` 均不存在于视图。

### 4.2 修改方案

将 `LEFT JOIN v_employee_current` 替换为 `LEFT JOIN employee_assignment` + 关联表：

**COUNT 查询（L6144-6149）**：

```sql
SELECT COUNT(*)::int AS total FROM employee e
LEFT JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false
WHERE ${whereClause}
```

**主查询（L6153-6165）**：

```sql
SELECT e.id, e.employee_code, e.id_card, e.name, e.gender, e.birth_date, e.phone,
       e.person_category, e.person_type, e.is_public_welfare,
       EXTRACT(YEAR FROM age(e.birth_date))::INT AS age,
       ${buildOverAgeYearsExpr('e')} AS over_age_years,
       ea.org_unit_id, ou.org_name AS dept_name, ou.org_path,
       ea.position_id, p.name AS position_name, ea.status AS status
FROM employee e
LEFT JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false
LEFT JOIN hse_org_unit ou ON ou.id = ea.org_unit_id AND ou.is_deleted = false
LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
WHERE ${whereClause}
ORDER BY age DESC, e.birth_date ASC
LIMIT $${paramIdx++} OFFSET $${paramIdx++}
```

**字段映射**：

| 原字段 | 新字段 |
|--------|--------|
| `ev.org_unit_id` | `ea.org_unit_id` |
| `ev.org_name AS dept_name` | `ou.org_name AS dept_name` |
| `ev.org_path` | `ou.org_path` |
| `ev.position_id` | `ea.position_id` |
| `ev.position_name` | `p.name AS position_name` |
| `ev.assignment_status AS status` | `ea.status AS status` |

---

## 5. 任务 C：修复 `GET /over-age/auto/:id`（L6254-6261）

### 5.1 问题

```sql
SELECT ev.org_unit_id, ev.org_name AS dept_name, ev.org_path,
       ev.position_id, ev.position_name, ev.assignment_status AS status,
       ev.start_date
FROM v_employee_current ev WHERE ev.employee_id = $1
```

`ev.org_unit_id, ev.org_name, ev.org_path, ev.position_id, ev.position_name, ev.assignment_status, ev.start_date` 均不存在于视图。

### 5.2 修改方案

```sql
SELECT ea.org_unit_id, ou.org_name AS dept_name, ou.org_path,
       ea.position_id, p.name AS position_name, ea.status AS status,
       ea.start_date
FROM employee_assignment ea
LEFT JOIN hse_org_unit ou ON ou.id = ea.org_unit_id AND ou.is_deleted = false
LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
WHERE ea.employee_id = $1 AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false
```

---

## 6. 执行顺序

```
任务 A（profile/:id） → 任务 B（over-age/auto-list） → 任务 C（over-age/auto/:id）
```

三个任务互不依赖，可并行执行。建议按"风险从高到低"顺序：A 是核心档案接口（影响面最大），B 和 C 是超龄模块。

---

## 7. 验证清单

### 7.1 语法校验

```bash
node --check server/routes/hse-employee.js
```

- [ ] 语法通过（Exit Code 0）

### 7.2 端点冒烟

```bash
# 任务 A：profile/:id
curl -s -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/hse/employee/employees/profile/1" \
  | python -m json.tool

# 预期：HTTP 200，body.data.basic 含基础信息，body.data.currentOrg 含组织/岗位/上级信息

# 任务 B：over-age/auto-list
curl -s -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/hse/employee/over-age/auto-list?page=1&pageSize=5" \
  | python -m json.tool

# 预期：HTTP 200，body.data.list 含 orgUnitId/deptName/positionId/positionName/status

# 任务 C：over-age/auto/:id
curl -s -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/hse/employee/over-age/auto/1" \
  | python -m json.tool

# 预期：HTTP 200，body.data.org 含 deptName/positionName/status/startDate
```

### 7.3 字段完整性

- [ ] A-1 `profile/:id` 返回 `currentOrg` 含 `orgUnitId, orgName, orgType, orgCode, orgPath, operationUnitId, unitName, unitType, unitCode, positionId, positionName, positionCode, riskLevel, supervisorId, supervisorName, assignmentStatus, startDate, endDate`
- [ ] B-1 `over-age/auto-list` 返回 `list[].deptName, list[].orgPath, list[].positionName, list[].status` 非空（有组织数据的员工）
- [ ] C-1 `over-age/auto/:id` 返回 `org.deptName, org.positionName, org.status, org.startDate` 字段存在

### 7.4 回归

- [ ] `profile/:id/assignments` 端点不受影响（未修改，但需确认无回归）
- [ ] `profile/list` 端点不受影响（已在提示词 37 修复，确认无回归）
- [ ] `over-age/auto-stats` 端点不受影响（该端点仅用 `employee` 表，不涉及视图）

---

## 8. 风险提示

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| `employee_assignment` 无 `is_current=true AND is_primary=true` 记录导致 `currentOrg` 为 null | 低 | 前端已有 `currentOrg ?? null` 兜底，`profile/:id` 原逻辑也是 `currentResult.rows.length > 0 ? rows[0] : null` |
| `over-age/auto-list` 中 `LEFT JOIN` 导致已离职员工的组织信息为 NULL | 极低 | 原查询也用的 `LEFT JOIN v_employee_current`，行为一致 |
| 字段名差异（`ea.status` vs `ev.assignment_status`）导致前端解析异常 | 低 | `camelKeys` 转换后都是 `status`，前端契约不变 |

---

## 9. 完整性确认

完成本次修复后，`hse-employee.js` 中所有引用 `v_employee_current` 不存在的列的端点将**全部清零**：

| 端点 | 状态 |
|------|------|
| `fetchEmployeeInfosByIds`（内部函数） | ✅ 已修复（提示词 37 前） |
| `profile/list` | ✅ 已修复（提示词 37 任务 C） |
| `profile/:id` | → 本次任务 A |
| `profile/:id/assignments` | ✅ 无需修复（直连基表） |
| `profile/:id/driver-info` | ✅ 无需修复（仅用 employee_assignment） |
| `over-age/auto-list` | → 本次任务 B |
| `over-age/auto/:id` | → 本次任务 C |
| `over-age/auto-stats` | ✅ 无需修复（仅用 employee 表） |

---

> 编制：Senior Developer（高级开发工程师）
> 关联文档：`提示词-37-R1-Phase1-P1-技术债清理.md`、`R1-Phase1-P1-技术债清理报告.md`