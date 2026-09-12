# 提示词 39：P1 技术债清理（终）— 员工列表 deptName 筛选缺列修复

> 创建日期：2026-07-29
> 前置条件：提示词 38 已完成（3 个兄弟端点缺列修复），`R1-Phase1-P1-视图缺列兄弟端点修复报告.md` 已出具
> 关联文档：`R1-Phase1-P1-技术债清理报告.md`（§5 范围外残留 #1）、`R1-Phase1-P1-视图缺列兄弟端点修复报告.md`（§4 #3、§5.2）
> 性质：**代码修改**（后端 1 文件 1 端点，不涉及数据库迁移/路由/菜单/前端）

---

## 背景

提示词 37/38 两轮修复了 4 个引用 `v_employee_current` 视图不存在列的端点。提示词 38 报告 §4 #3 和 §5.2 明确标注了最后一个同类残留：**`GET /employees` 端点（L544）的 `deptName` 筛选条件引用了 `ev.unit_name`，该列不在 `v_employee_current` 视图中**。

当用户在前端员工列表页面输入部门名称进行筛选时，`deptName` 参数传入后端，WHERE 条件 `ev.unit_name = $N` 触发 `column ev.unit_name does not exist`，端点返回 500。

---

## 要求

### 1. 读取关键文件

- `F:\hse-dashboard\server\routes\hse-employee.js`（L509-591，`GET /employees` 端点完整代码）
- `F:\hse-dashboard\server\sql\sprint5_6_employee_master_migration.sql`（`v_employee_current` 视图定义，L262-309）
- `F:\hse-dashboard\docs\R1-Phase1-P1-视图缺列兄弟端点修复报告.md`（§4 #3、§5.2）

### 2. 视图实际列清单（已确认）

```
v_employee_current 实际列（10 列）：
employee_id, employee_code, name, assignment_status, is_current,
hire_date, org_name, org_type, position_name, is_driver
```

`unit_name` **不在视图中**。

### 3. 红线规则

- 不修改视图定义
- 不新增数据库迁移
- 不修改路由定义、菜单配置
- 修复后端点 `deptName` 筛选必须 200

---

## 3. 问题分析

`GET /employees` 端点（L509-591）的结构：

```
WHERE 条件（L519-557）：
  ev.name, ev.employee_code, e.phone, e.person_type, e.person_category,
  e.gender, ev.org_name, ev.unit_name ← 不存在！, ev.position_name, ev.assignment_status

COUNT 查询（L561-563）：
  FROM v_employee_current ev JOIN employee e

主查询（L568-583）：
  FROM v_employee_current ev
  JOIN employee e
  LEFT JOIN employee_assignment ea  ← 已 JOIN，但未 JOIN hse_operation_unit
```

**缺陷**：`ev.unit_name` 不在 `v_employee_current` 中。`unit_name` 实际来自 `hse_operation_unit` 表，需要通过 `employee_assignment.operation_unit_id` 关联。

**影响范围**：仅当 `deptName` 参数传入时触发（`deptName` 为空时条件不加入 WHERE，不触发 500）。不影响无筛选的列表查询。

---

## 4. 修改方案

文件：`server/routes/hse-employee.js`

### 4.1 WHERE 条件修复（L544）

```diff
    if (deptName) {
-     conditions.push(`(ev.org_name = $${paramIdx} OR ev.unit_name = $${paramIdx})`);
+     conditions.push(`(ev.org_name = $${paramIdx} OR opu.unit_name = $${paramIdx})`);
      params.push(deptName);
      paramIdx++;
    }
```

`ev.org_name` 保留（在视图中存在），`ev.unit_name` → `opu.unit_name`（通过新增 JOIN 获取）。

### 4.2 COUNT 查询补充 JOIN（L561-563）

```diff
    const countResult = await pool.query(
-     `SELECT COUNT(*)::int AS total FROM v_employee_current ev JOIN employee e ON e.id = ev.employee_id WHERE ${whereClause}`,
+     `SELECT COUNT(*)::int AS total
+      FROM v_employee_current ev
+      JOIN employee e ON e.id = ev.employee_id
+      LEFT JOIN employee_assignment ea ON ea.employee_id = ev.employee_id AND ea.is_current = true AND ea.is_deleted = false
+      LEFT JOIN hse_operation_unit opu ON opu.id = ea.operation_unit_id AND opu.is_deleted = false
+      WHERE ${whereClause}`,
      params
    );
```

### 4.3 主查询补充 JOIN（L578-583）

```diff
       FROM v_employee_current ev
       JOIN employee e ON e.id = ev.employee_id
       LEFT JOIN employee_assignment ea ON ea.employee_id = ev.employee_id AND ea.is_current = true
+      LEFT JOIN hse_operation_unit opu ON opu.id = ea.operation_unit_id AND opu.is_deleted = false
       WHERE ${whereClause}
       ORDER BY ea.start_date DESC NULLS LAST
```

**设计理由**：
- `hse_operation_unit` 通过 `employee_assignment.operation_unit_id` 关联，两个 JOIN 都是等值连接，索引命中
- `LEFT JOIN` 确保无 `operation_unit_id` 的员工（如无当前任职）不丢失
- 与提示词 38 任务 A/B/C 的修复模式一致，保持代码风格统一

---

## 5. 验证清单

### 5.1 语法校验

```bash
node --check server/routes/hse-employee.js
```
- [ ] 语法通过（Exit Code 0）

### 5.2 端点冒烟

```bash
# 无 deptName 筛选（回归）
curl -s -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/hse/employee/employees?page=1&pageSize=5" \
  | python -m json.tool

# 预期：HTTP 200，正常返回列表

# 带 deptName 筛选（核心验证）
curl -s -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/hse/employee/employees?page=1&pageSize=5&deptName=柴胡店镇作业中心" \
  | python -m json.tool

# 预期：HTTP 200，list 中记录数 ≤ total，且所有记录的 deptName 匹配筛选条件
```

### 5.3 数据一致性

- [ ] `deptName` 筛选结果中 `dept_name` 字段值与筛选参数一致
- [ ] `total` 在有筛选和无筛选时相差合理（筛选后 ≤ 无筛选）
- [ ] 无 `deptName` 筛选时返回结果与修复前一致（total 不变）

---

## 6. 完整性确认

完成本次修复后，`hse-employee.js` 中所有引用 `v_employee_current` 不存在的列的端点将**全部清零**：

| 端点 | 状态 |
|------|------|
| `fetchEmployeeInfosByIds`（内部函数） | ✅ 已修复（提示词 37 前） |
| `GET /employees`（`deptName` 筛选） | → **本次修复** |
| `GET /employees/profile/list` | ✅ 已修复（提示词 37 任务 C） |
| `GET /employees/profile/:id` | ✅ 已修复（提示词 38 任务 A） |
| `GET /employees/profile/:id/assignments` | ✅ 无需修复（直连基表） |
| `GET /employees/profile/:id/driver-info` | ✅ 无需修复（仅用 employee_assignment） |
| `GET /over-age/auto-list` | ✅ 已修复（提示词 38 任务 B） |
| `GET /over-age/auto/:id` | ✅ 已修复（提示词 38 任务 C） |
| `GET /over-age/auto-stats` | ✅ 无需修复（仅用 employee 表） |
| `v_employee_org_full` 引用端点（L5975/6002/6040） | ✅ 无需修复（不同视图，列齐全） |

---

## 7. 风险提示

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| COUNT 查询新增 LEFT JOIN 影响性能 | 极低 | `employee_assignment` 主键等值 JOIN + `hse_operation_unit` 主键等值 JOIN，索引命中 |
| `deptName` 筛选语义变化（原 `ev.org_name OR ev.unit_name` → 改后 `ev.org_name OR opu.unit_name`） | 无 | 语义完全等价，仅数据源从视图列改为基表列 |
| 修复后 `deptName` 筛选结果与前端预期不一致 | 低 | `unit_name` 是 `hse_operation_unit` 的字段，与 `org_name` 是不同维度，原筛选逻辑保持不变 |

---

> 编制：Senior Developer（高级开发工程师）
> 关联文档：`R1-Phase1-P1-视图缺列兄弟端点修复报告.md`（§4 #3、§5.2）