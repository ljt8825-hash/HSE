# Sprint-C Step 6：人员中心数据治理规范 v1.0

> **文档版本**: v1.0
> **编制日期**: 2026-07-28
> **项目**: Sprint-C v1.0 人员中心新模型稳定化与旧模型治理
> **适用范围**: 所有涉及人员组织关系的开发、运维、数据操作

---

## 一、数据模型架构

### 1.1 新模型架构（唯一事实来源）

```
┌─────────────────────────────────────────────────────────┐
│                    employee（人员主体）                    │
│  ├── id, employee_code, name, id_card, gender, ...       │
│  └── 员工基本信息（只读被引用）                             │
└──────────────────────┬──────────────────────────────────┘
                       │ 1:N
                       ▼
┌─────────────────────────────────────────────────────────┐
│              employee_assignment（关系模型）                │
│  ├── id, employee_id, org_unit_id, operation_unit_id      │
│  ├── position_id, supervisor_id                          │
│  ├── is_current, status, is_primary                      │
│  ├── start_date, end_date, is_deleted                    │
│  └── ⭐ 唯一事实来源：人员×组织×岗位×状态的关系             │
└──────────────────────┬──────────────────────────────────┘
                       │ N:1
                       ▼
┌─────────────────────────────────────────────────────────┐
│                 hse_org_unit（组织树）                    │
│  ├── id, parent_id, name, path, level                    │
│  └── 组织层级定义（独立维护）                              │
└──────────────────────┬──────────────────────────────────┘
                       │ N:1
                       ▼
┌─────────────────────────────────────────────────────────┐
│                    position（岗位定义）                    │
│  ├── id, name, dept_id, description                      │
│  └── 岗位字典（独立维护）                                 │
└─────────────────────────────────────────────────────────┘
```

### 1.2 新表职责定义

| 表名 | 职责 | 说明 |
|------|------|------|
| `employee` | 人员主体 | 存储员工基本信息，被其他表引用 |
| `employee_assignment` | **人员×组织×岗位×状态关系** | ⭐ **唯一事实来源**，所有人员组织关系的查询和写入必须通过此表 |
| `hse_org_unit` | 组织树 | 定义组织结构，被 employee_assignment 引用 |
| `position` | 岗位字典 | 定义岗位信息，被 employee_assignment 引用 |
| `hse_operation_unit` | 作业单元 | 定义作业单元，被 employee_assignment 引用（可选） |

### 1.3 旧表状态

| 表名 | 状态 | 允许操作 | 禁止操作 | 说明 |
|------|------|---------|---------|------|
| `hse_employee_relation` | 冻结 | ✅ SELECT | ❌ INSERT/UPDATE/DELETE/DROP | 只读审计表，历史归档用 |
| `hse_employee_org` | 冻结 | ✅ SELECT | ❌ INSERT/UPDATE/DELETE/DROP | 只读审计表，历史归档用 |

---

## 二、唯一事实来源规则

### 2.1 核心规则

> **`employee_assignment` 是人员组织关系的唯一事实来源。**

所有涉及人员组织关系的查询和写入，**必须且只能**通过 `employee_assignment` 表进行。

### 2.2 查询规范

✅ **正确做法**：
```sql
SELECT * FROM employee_assignment 
WHERE employee_id = $1 AND is_current = true AND is_deleted = false;
```

❌ **禁止做法**：
```sql
SELECT * FROM hse_employee_org WHERE ...;  -- 禁止
SELECT * FROM hse_employee_relation WHERE ...;  -- 禁止
```

### 2.3 写入规范

✅ **正确做法**：
```sql
INSERT INTO employee_assignment (employee_id, org_unit_id, position_id, ...)
VALUES ($1, $2, $3, ...);

UPDATE employee_assignment SET is_current = false WHERE id = $1;
```

❌ **禁止做法**：
```sql
INSERT INTO hse_employee_org ...;  -- 禁止
INSERT INTO hse_employee_relation ...;  -- 禁止
UPDATE hse_employee_org ...;  -- 禁止
```

---

## 三、开发规范

### 3.1 新增业务开发

1. **必须使用 `employee_assignment`** 作为人员组织关系的数据源
2. **禁止引用** `hse_employee_relation` 或 `hse_employee_org`
3. 若需历史数据查询，可只读引用旧表，但必须在代码中注明
4. 所有新 API 必须基于新模型设计

### 3.2 代码评审检查清单

| # | 检查项 | 要求 |
|---|--------|------|
| 1 | SQL 中是否引用 hse_employee_relation | ❌ 禁止（只读诊断脚本除外） |
| 2 | SQL 中是否引用 hse_employee_org | ❌ 禁止（只读诊断脚本除外） |
| 3 | 是否使用 employee_assignment | ✅ 必须 |
| 4 | employee_assignment 查询是否带 is_current 过滤 | ✅ 必须 |
| 5 | employee_assignment 查询是否带 is_deleted 过滤 | ✅ 必须 |
| 6 | 写入操作是否通过 employee_assignment | ✅ 必须 |

### 3.3 SQL 模板

#### 查询当前有效的组织关系
```sql
SELECT 
  ea.*,
  ou.name AS org_name,
  ou.path AS org_path,
  p.name AS position_name,
  e.name AS employee_name
FROM employee_assignment ea
JOIN employee e ON ea.employee_id = e.id AND e.is_deleted = false
LEFT JOIN hse_org_unit ou ON ea.org_unit_id = ou.id
LEFT JOIN position p ON ea.position_id = p.id AND p.is_deleted = false
WHERE ea.employee_id = $1 
  AND ea.is_current = true 
  AND ea.is_deleted = false;
```

#### 插入新的组织关系
```sql
INSERT INTO employee_assignment (
  employee_id, org_unit_id, operation_unit_id, position_id,
  supervisor_id, is_current, status, is_primary,
  start_date, remark, created_by
) VALUES (
  $1, $2, $3, $4, $5, true, $6, $7, $8, $9, $10
) RETURNING *;
```

#### 结束当前组织关系
```sql
UPDATE employee_assignment
SET is_current = false, end_date = $1, updated_at = NOW()
WHERE id = $2 AND is_current = true AND is_deleted = false;
```

---

## 四、数据完整性约束

### 4.1 必须遵守的约束

| # | 约束 | 说明 |
|---|------|------|
| 1 | 每个员工同一时刻只有 1 条 is_current=true 的记录 | 应用层保证 + uk_emp_assign_primary 约束 |
| 2 | 不允许删除员工的唯一有效 assignment 记录 | 业务层校验 |
| 3 | 新记录的 start_date 必须 >= 旧记录的 start_date | 时间连续性 |
| 4 | is_deleted 只能从 false → true（软删除） | 禁止物理删除 |
| 5 | 组织关系变更必须记录 employee_history | 审计要求 |

### 4.2 禁止的操作

| # | 禁止操作 | 原因 |
|---|---------|------|
| 1 | 仅通过姓名匹配人员 | 必须优先使用 employee_id / 员工编号 |
| 2 | 绕过 employee_assignment 写旧表 | 破坏唯一事实来源 |
| 3 | 删除 employee_assignment 记录 | 审计追溯 |
| 4 | 使用 ELSE 默认映射未知 status | 必须显式映射 |
| 5 | 跳过 is_deleted 过滤条件 | 软删除数据不应参与业务查询 |

---

## 五、运维规范

### 5.1 巡检周期

| 检查项 | 频率 | 负责人 |
|--------|------|--------|
| employee_assignment 数据完整性 | 每日 | 自动化巡检 |
| 旧表只读保护触发器状态 | 每周 | DBA |
| 新旧模型数据一致性 | 每月 | 后端负责人 |
| 索引使用和性能分析 | 每季度 | DBA |

### 5.2 巡检内容

每日自动化检查（详见 Step 7）：
1. 孤儿 employee（有 assignment 无 employee 主记录）
2. 孤儿 position（assignment 引用的 position 不存在）
3. 孤儿 org_unit（assignment 引用的 org_unit 不存在）
4. 重复当前关系（同一员工 is_current=true 有多条）
5. 非法 status（不在允许列表中的状态值）

### 5.3 变更管理

所有涉及 employee_assignment 的变更必须：
1. 经过代码评审
2. 在测试环境验证
3. 有回滚方案
4. 变更日志记录

---

## 六、版本历史

| 版本 | 日期 | 变更内容 | 作者 |
|------|------|---------|------|
| v1.0 | 2026-07-28 | 初始版本，确立新模型唯一事实来源地位 | Sprint-C 启动 |

---

## 七、相关文档

| 文档 | 路径 | 说明 |
|------|------|------|
| 旧模型使用报告 | `Sprint-C-v1.0/01_Audit/Legacy_Model_Usage_Report.md` | 旧模型使用情况审计 |
| API 迁移报告 | `Sprint-C-v1.0/01_Audit/Employee_API_Model_Migration_Report.md` | 后端 API 收敛方案 |
| 旧表生命周期报告 | `Sprint-C-v1.0/03_Governance/Legacy_Table_Lifecycle_Report.md` | 旧表处理决策 |
| 巡检 SQL | `Sprint-C-v1.0/02_SQL/Employee_Model_Check.sql` | 自动化巡检脚本 |

---

> **文档结束**
>
> 本规范为人员中心数据治理的长期规范，所有涉及人员组织关系的开发和运维活动必须遵守。
