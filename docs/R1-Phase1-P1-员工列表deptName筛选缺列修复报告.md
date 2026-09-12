# R1-Phase1 P1 · 员工列表 deptName 筛选缺列修复报告

> 任务来源：`docs/提示词-39-R1-Phase1-P1-员工列表deptName筛选缺列修复.md`
> 修复日期：2026-07-29
> 唯一改动文件：`server/routes/hse-employee.js`
> 修复人：Senior Developer（高级开发工程师）
> 结论：`GET /employees` 端点的 `deptName` 筛选已修复，3 处 SQL 均补充 `LEFT JOIN hse_operation_unit`，无筛选 + 带筛选两个冒烟测试全部 HTTP 200。

---

## 1. 背景与根因

`v_employee_current` 视图仅含 10 列，`unit_name` 不在其中。`GET /employees` 端点 L544 的 `deptName` 筛选条件引用了 `ev.unit_name`，当 `deptName` 参数传入时触发 `column ev.unit_name does not exist`，端点返回 500。

`unit_name` 实际来自 `hse_operation_unit` 表，需通过 `employee_assignment.operation_unit_id` 关联。

---

## 2. 修复明细

**文件**：`server/routes/hse-employee.js`

### 2.1 WHERE 条件（L544）

```diff
- conditions.push(`(ev.org_name = $${paramIdx} OR ev.unit_name = $${paramIdx})`);
+ conditions.push(`(ev.org_name = $${paramIdx} OR opu.unit_name = $${paramIdx})`);
```

`ev.org_name` 保留（视图中存在），`ev.unit_name` → `opu.unit_name`。

### 2.2 COUNT 查询（L561-568）

新增 `LEFT JOIN employee_assignment ea` + `LEFT JOIN hse_operation_unit opu`：

```sql
SELECT COUNT(*)::int AS total
FROM v_employee_current ev
JOIN employee e ON e.id = ev.employee_id
LEFT JOIN employee_assignment ea ON ea.employee_id = ev.employee_id AND ea.is_current = true AND ea.is_deleted = false
LEFT JOIN hse_operation_unit opu ON opu.id = ea.operation_unit_id AND opu.is_deleted = false
WHERE ...
```

### 2.3 主查询（L583-589）

新增 `LEFT JOIN hse_operation_unit opu`（`employee_assignment` 已有）：

```sql
FROM v_employee_current ev
JOIN employee e ON e.id = ev.employee_id
LEFT JOIN employee_assignment ea ON ea.employee_id = ev.employee_id AND ea.is_current = true
LEFT JOIN hse_operation_unit opu ON opu.id = ea.operation_unit_id AND opu.is_deleted = false
WHERE ...
```

---

## 3. 验证证据

### 3.1 语法校验

```
node --check server/routes/hse-employee.js → SYNTAX_OK (Exit Code 0)
```

### 3.2 冒烟测试（PID 14148，端口 5666，admin 令牌）

| 测试 | 端点 | 结果 |
|------|------|------|
| 无 deptName 筛选（回归） | `GET /employees?page=1&pageSize=3` | HTTP 200，total=1305 |
| 带 deptName 筛选（核心验证） | `GET /employees?page=1&pageSize=3&deptName=柴胡店镇作业中心` | HTTP 200，total=168，3 条记录 dept_name 均为"柴胡店镇作业中心" |

带筛选返回记录示例：
```
id=4111 name=盖广勇 dept_name=柴胡店镇作业中心 org_status=active
id=4080 name=赵永芬 dept_name=柴胡店镇作业中心 org_status=active
```

---

## 4. 红线遵守

| 红线 | 遵守情况 |
|------|---------|
| 不修改视图定义 | ✅ 未改动 |
| 不新增数据库迁移 | ✅ 未新增 |
| 不修改路由定义/菜单配置 | ✅ 仅改 SQL 内部 |
| 修复后端点 200 | ✅ 两个场景均 200 |

---

## 5. 最终完整性确认

`hse-employee.js` 中所有引用 `v_employee_current` 不存在列的端点已**全部清零**：

| 端点 | 状态 |
|------|------|
| `fetchEmployeeInfosByIds` | ✅ 提示词 37 前已修复 |
| `GET /employees`（deptName 筛选） | ✅ 本次修复 |
| `GET /employees/profile/list` | ✅ 提示词 37 |
| `GET /employees/profile/:id` | ✅ 提示词 38 |
| `GET /employees/profile/:id/assignments` | ✅ 无需修复 |
| `GET /employees/profile/:id/driver-info` | ✅ 无需修复 |
| `GET /over-age/auto-list` | ✅ 提示词 38 |
| `GET /over-age/auto/:id` | ✅ 提示词 38 |
| `GET /over-age/auto-stats` | ✅ 无需修复 |
| `v_employee_org_full` 引用端点 | ✅ 无需修复（不同视图） |

---

> 编制：Senior Developer（高级开发工程师）
> 关联文档：`提示词-39-R1-Phase1-P1-员工列表deptName筛选缺列修复.md`