# Sprint-A：人员导入与清空功能修复实施方案

**文档版本**：v1.0  
**编制日期**：2026-07-28  
**对应方案**：《人员中心重构实施方案》- Sprint A  
**目标**：修复花名册导入与清空人员功能报错，恢复系统可用性  
**范围**：仅限后端代码逻辑修复，不涉及数据库结构变更  

---

## 一、实施目标

本次 Sprint A 的核心目标是**修复三大报错**，恢复「人员管理」模块的基础可用性：

1. **恢复花名册上传解析**：解决 Excel 上传后岗位匹配为空导致的空指针报错
2. **恢复花名册批次入库**：解决正式入库时因 `employee` 表字段不匹配导致的 INSERT 失败
3. **恢复清空人员信息**：解决 `employee_assignment` 等表因不存在 `deleted_at` 字段导致的清空操作失败

---

## 二、影响文件分析

### 2.1 核心影响文件

**文件路径**：`server/routes/hse-employee-import-v2.js`

该文件是花名册 V2 导入的核心路由，承载了从 Excel 上传到最终入库的完整流程。

### 2.2 详细影响点清单

| 序号 | 方法/路由 | 代码位置 | 修改原因 |
|---|---|---|---|
| 1 | `POST /import/excel` → 批量入库分支 | L639 | `posMatch` 可能为 `null`，访问 `target_position_id` 时报 `Cannot read properties of null` |
| 2 | `POST /batch/:batchId/import` → 员工创建分支 | L941-945 | `employee` 表 INSERT 包含 `name_encrypted`、`source`、`status` 三个不存在的列 |
| 3 | `POST /clear-all` | L1116 | 清空 `employee_assignment` 时引用不存在的 `deleted_at` 列 |
| 4 | `POST /clear-all` | L1121 | 清空 `employee` 时引用不存在的 `deleted_at` 列 |
| 5 | `POST /clear-all` | L1126 | 清空 `employee_import_pending` 时引用不存在的 `deleted_at` 列 |
| 6 | `POST /clear-all` | L1131 | 清空 `employee_import_batch` 时引用不存在的 `deleted_at` 列 |
| 7 | `DELETE /batch/:batchId` | L1078 | 删除批次时引用 `employee_import_pending` 不存在的 `deleted_at` 列 |
| 8 | `DELETE /batch/:batchId` | L1082 | 删除批次时引用 `employee_import_batch` 不存在的 `deleted_at` 列 |

---

## 三、代码修改清单

### 3.1 修改点一：岗位匹配空指针保护

**问题位置**：`server/routes/hse-employee-import-v2.js` L639

**原始代码**：
```javascript
// 在 INSERT INTO employee_import_pending 的 VALUES 参数中:
posMatch.target_position_id,  // 当 posMatch === null 时报错
```

**修改为**：
```javascript
posMatch?.target_position_id || null,  // 使用可选链，null 时返回 null
```

**影响分析**：
- 当 Excel 行 `raw_position` 为空字符串，或岗位未匹配到规则表时，`posMatch` 为 `null`
- 修改后，`target_pos_id` 写入 `NULL`，后续 `employee_assignment` 的 `position_id` 允许为 NULL（已确认为合法设计）
- **仅影响**：岗位为空的员工导入行，这些行在系统中将无岗位关联，但员工身份数据可正常入库

### 3.2 修改点二：employee INSERT 字段对齐

**问题位置**：`server/routes/hse-employee-import-v2.js` L941-945

**原始代码**：
```javascript
INSERT INTO employee
  (employee_code, name, name_encrypted, id_card, id_card_hash, phone, phone_hash,
   gender, birth_date, person_type, person_category, source, status, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
```

**修改为**（基于 v59 真实表结构）：
```javascript
INSERT INTO employee
  (employee_code, id_card, id_card_hash, name, gender, birth_date,
   phone, phone_hash, person_category, person_type, is_public_welfare, id_address,
   created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
```

**字段映射说明**：

| 原字段 | 处理方式 | 新字段 | 说明 |
|---|---|---|---|
| `employee_code` | 保留 | `employee_code` | 工号 |
| `name` | 保留位置 | `id_card` | 身份证密文 |
| `name_encrypted` | **删除** | - | 表中不存在 |
| `id_card` | 后移 | `id_card_hash` | 身份证哈希 |
| `id_card_hash` | 后移 | `name` | 姓名（明文） |
| `phone` | 保留 | `gender` | 性别 |
| `phone_hash` | 保留 | `birth_date` | 出生日期 |
| `gender` | 保留 | `phone` | 手机号密文 |
| `birth_date` | 保留 | `phone_hash` | 手机号哈希 |
| `person_type` | 保留 | `person_category` | 人员分类 |
| `person_category` | 保留 | `person_type` | 人员类型 |
| `source` | **删除** | `is_public_welfare` | 是否公益岗（默认 false） |
| `status` | **删除** | `id_address` | 身份证地址 |

**参数数组同步调整**：
```javascript
// 参数数组需与新的字段顺序严格对齐
[p.employee_no || null,
 p.id_card_encrypted || null,  // id_card 密文
 p.id_card_hash || null,      // id_card 哈希
 p.employee_name,             // name
 p.gender || null,
 p.birth_date || null,
 p.phone_encrypted || null,   // phone 密文
 p.phone_hash || null,
 personCategory,              // person_category
 personType,                  // person_type
 false,                       // is_public_welfare
 null,                        // id_address
]
```

**影响分析**：
- `name_encrypted`：原代码错误地加密了姓名，现改为明文存储（与 `hse-employee.js` V1 实现一致）
- `source`：原用于标记导入来源（如 'excel_import'），现移除。如需记录，建议后续 Sprint 在 `employee_history` 中追溯
- `status`：原用于标记员工状态（如 'active'），现移除。员工状态应通过 `hse_employee_org` / `employee_assignment` 的 `status` 字段管理

### 3.3 修改点三：删除 deleted_at 引用

**问题位置**：`server/routes/hse-employee-import-v2.js` L1078, L1082, L1116, L1121, L1126, L1131

**涉及表**：`employee_assignment`, `employee`, `employee_import_pending`, `employee_import_batch`

**统一修改策略**：将所有 SQL 中的 `, deleted_at = CURRENT_TIMESTAMP` 移除，仅保留 `is_deleted = true`

**修改示例**：

以 L1116 为例：
```sql
-- 原始：
UPDATE employee_assignment SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP WHERE is_deleted = false

-- 修改为：
UPDATE employee_assignment SET is_deleted = true WHERE is_deleted = false
```

**其余 5 处同理**，不再逐一列出。

**影响分析**：
- 不影响软删除功能（`is_deleted` 置为 `true` 仍然有效）
- 唯一功能损失：无法通过 `deleted_at` 精确追踪删除时间。可通过 `updated_at` 近似推断（软删除通常会同步更新 `updated_at`）
- 为后续审计增强预留空间：如未来需要精确删除时间，可单独立项增加 `deleted_at` 列

---

## 四、数据库影响分析

### 4.1 本次 Sprint A **禁止**的操作

| 禁止项 | 原因 |
|---|---|
| `ALTER TABLE` | 本次为修复 Bug，不应引入结构变更风险 |
| 新增字段 | 与目标矛盾，应修改代码而非表结构 |
| 索引变更 | 无必要 |
| 视图变更 | 无必要 |
| 数据迁移 | 无必要 |

### 4.2 本次 Sprint A **允许**的操作

| 允许项 | 说明 |
|---|---|
| 修改 `server/routes/hse-employee-import-v2.js` | 核心修复文件 |
| 重启后端服务 | 验证修复效果 |
| 正常读写数据库 | 代码修复后功能恢复正常使用 |

### 4.3 确认：本次 Sprint A 仅修改代码

**不执行任何 DDL 操作**，所有修复限于应用层代码。

---

## 五、导入流程验证方案

### 5.1 完整流程验证步骤

#### 步骤 1：Excel 上传解析

**操作**：使用标准花名册模板上传一个包含以下类型行的 Excel：
- 正常行（有工号、姓名、岗位、组织路径）
- 岗位为空行
- 岗位未匹配到规则行
- 重复工号行（用于测试冲突检测）

**验证点**：
| 验证项 | 预期结果 |
|---|---|
| 上传接口响应 | `200 OK`，返回 `batchId` |
| `successCount` | 正常行 + 岗位为空行（成功匹配）的数量 |
| `pendingCount` | 岗位未匹配 + 重复工号（待审核）的数量 |
| `raw_position` 为空的行 | 不应报错，应标记为 `ready`（岗位为空不影响入库） |

#### 步骤 2：批次预览

**操作**：调用 `GET /batch/:batchId/preview`

**验证点**：
| 验证项 | 预期结果 |
|---|---|
| 批次状态 | `pending_review` |
| `pendingList` | 包含所有待审核记录 |
| 待审核记录状态 | 岗位未匹配 → `pending`；重复工号 → `pending`；其他 → `approved` |

#### 步骤 3：审核待确认记录

**操作**：对岗位未匹配的记录执行 `POST /pending/:id/resolve`（`resolution = 'approved'`）

**验证点**：
| 验证项 | 预期结果 |
|---|---|
| 审核接口响应 | `200 OK` |
| 批次状态 | `success_count` 增加，`pending_count` 减少 |

#### 步骤 4：批次入库

**操作**：调用 `POST /batch/:batchId/import`

**验证点**：
| 验证项 | 预期结果 |
|---|---|
| 入库接口响应 | `200 OK`，返回 `insertedCount` 和 `assignmentCount` |
| `employee` 表 | 新增员工数据，`is_deleted = false` |
| `employee_assignment` 表 | 新增任职关系，`is_current = true`，`is_deleted = false` |
| 数据库无异常 | 无 `列不存在`、`空指针` 等错误 |

#### 步骤 5：数据一致性校验

**操作**：执行以下 SQL 验证

```sql
-- 5.1 确认 employee 数据已入库
SELECT id, employee_code, name, id_card_hash, phone_hash, person_type
FROM employee
WHERE employee_code IN ('EMP001', 'EMP002') AND is_deleted = false;

-- 5.2 确认 employee_assignment 数据已入库
SELECT ea.employee_id, ea.org_unit_id, ea.position_id, ea.is_current, ea.status
FROM employee_assignment ea
JOIN employee e ON ea.employee_id = e.id
WHERE e.employee_code IN ('EMP001', 'EMP002') AND ea.is_deleted = false;

-- 5.3 确认岗位为空的员工也已入库（position_id 为 NULL）
SELECT e.employee_code, e.name, ea.position_id AS pos_id
FROM employee e
LEFT JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true
WHERE e.is_deleted = false AND ea.is_deleted = false;
```

**验证点**：
| 验证项 | 预期结果 |
|---|---|
| 5.1 employee 表 | 可查到对应工号的员工记录 |
| 5.2 employee_assignment 表 | 可查到对应员工的任职关系，`is_current = true` |
| 5.3 岗位为空 | `position_id` 为 `NULL`，不影响员工存在 |

#### 步骤 6：清空人员

**操作**：调用 `POST /clear-all`

**验证点**：
| 验证项 | 预期结果 |
|---|---|
| 清空接口响应 | `200 OK`，返回 `employeeCount` 和 `assignmentCount` |
| `employee` 表 | 所有记录 `is_deleted = true` |
| `employee_assignment` 表 | 所有记录 `is_deleted = true` |
| `employee_import_pending` 表 | 所有记录 `is_deleted = true` |
| `employee_import_batch` 表 | 所有记录 `is_deleted = true` |
| 无 SQL 错误 | 无 `deleted_at 列不存在` 报错 |

---

## 六、回归测试清单

### 6.1 员工列表（V1 员工管理）

| 测试项 | 操作 | 预期结果 |
|---|---|---|
| 查询员工列表 | 访问 `/employees` | 返回员工列表，无异常 |
| 查询单个员工 | 访问 `/employees/:id` | 返回员工详情，含当前组织关系 |
| 新增员工 | POST `/employees` | 成功新增，写入 `employee` 表 |
| 编辑员工 | PUT `/employees/:id` | 成功更新，无异常 |
| 删除员工 | DELETE `/employees/:id` | 软删除成功，`is_deleted = true` |

### 6.2 员工档案

| 测试项 | 操作 | 预期结果 |
|---|---|---|
| 查看员工档案详情 | 前端员工详情页 | 基本信息、组织关系、岗位信息正常显示 |
| 员工档案列表 | 前端员工列表页 | 列表数据正常加载 |

### 6.3 花名册导入（本次修复重点）

| 测试项 | 操作 | 预期结果 |
|---|---|---|
| 正常 Excel 导入 | 上传标准模板 | 解析成功、入库成功 |
| 空岗位行导入 | 上传岗位为空的 Excel | 解析成功、`position_id` 为 NULL、入库成功 |
| 岗位未匹配行导入 | 上传未配置规则的岗位 | 标记为 `pending`，人工审核后入库 |
| 重复工号导入 | 上传含重复工号的 Excel | 标记为 `pending`，不报错 |
| 清空所有人员 | 点击清空按钮 | 清空成功，无 `deleted_at` 报错 |

### 6.4 清空人员

| 测试项 | 操作 | 预期结果 |
|---|---|---|
| 清空后员工列表 | 访问 `/employees` | 返回空列表 |
| 清空后重建员工 | 重新导入 Excel | 新增成功，与之前被清空的员工无冲突（工号唯一） |

### 6.5 风险画像

| 测试项 | 操作 | 预期结果 |
|---|---|---|
| 查看已导入员工画像 | 风险画像页 | 员工信息、任职关系、三违/培训关联正常显示 |
| 清空后画像 | 清空人员后访问画像 | 返回空或无数据提示，不报错 |

### 6.6 预警中心

| 测试项 | 操作 | 预期结果 |
|---|---|---|
| 预警中心人员关联 | 预警中心页面 | 人员下拉可选择已导入员工 |
| 预警详情人员信息 | 查看预警详情 | 关联员工姓名、部门、岗位正确显示 |

---

## 七、实施风险

### 7.1 可能影响范围

| 影响范围 | 风险等级 | 说明 |
|---|---|---|
| 花名册 V2 导入功能 | 低 | 本次即修复该模块的 Bug |
| V1 员工管理功能 | 极低 | 未修改 `hse-employee.js`，不受影响 |
| 预警中心 | 极低 | 预警中心只读 `employee_assignment`，导入修复后数据更完整 |
| 风险画像 | 极低 | 同上 |
| 其他业务模块（三违、培训等） | 无 | 本次未修改相关模块代码 |

### 7.2 风险评估

**本次 Sprint A 修改范围极小**（仅涉及 `hse-employee-import-v2.js` 的 8 处代码），风险可控：

1. **无数据库变更**：不执行任何 DDL，零结构风险
2. **无跨模块影响**：仅修改 V2 导入路由，V1 员工管理和其他业务模块完全不受影响
3. **修改逻辑明确**：
   - 移除 `deleted_at` → SQL 更简洁，功能等效
   - 字段对齐 → 与数据库真实结构一致，修复 Bug
   - 空指针保护 → 增加防御性代码，修复 Bug

### 7.3 回滚方式

如果修复后出现非预期问题，可按以下方式回滚：

**回滚步骤**：
1. 使用 Git 回滚 `hse-employee-import-v2.js` 到修复前版本
2. 重启后端服务
3. 验证回滚后系统状态（恢复到修复前的报错状态）

**回滚前提**：本次修改前需确保 `hse-employee-import-v2.js` 有 Git 提交记录。

**数据回滚**：本次修复不涉及数据写入逻辑变更，仅修复错误代码路径，因此**无需数据回滚**。

---

## 附录：修改点速查表

| 序号 | 文件 | 行号 | 修改类型 | 修改内容 |
|---|---|---|---|---|
| 1 | `hse-employee-import-v2.js` | L639 | Bug 修复 | `posMatch.target_position_id` → `posMatch?.target_position_id \|\| null` |
| 2 | `hse-employee-import-v2.js` | L941-945 | Bug 修复 | INSERT 字段对齐 v59 真实结构，移除 `name_encrypted, source, status` |
| 3 | `hse-employee-import-v2.js` | L1078 | Bug 修复 | 移除 `, deleted_at = CURRENT_TIMESTAMP` |
| 4 | `hse-employee-import-v2.js` | L1082 | Bug 修复 | 移除 `, deleted_at = CURRENT_TIMESTAMP` |
| 5 | `hse-employee-import-v2.js` | L1116 | Bug 修复 | 移除 `, deleted_at = CURRENT_TIMESTAMP` |
| 6 | `hse-employee-import-v2.js` | L1121 | Bug 修复 | 移除 `, deleted_at = CURRENT_TIMESTAMP` |
| 7 | `hse-employee-import-v2.js` | L1126 | Bug 修复 | 移除 `, deleted_at = CURRENT_TIMESTAMP` |
| 8 | `hse-employee-import-v2.js` | L1131 | Bug 修复 | 移除 `, deleted_at = CURRENT_TIMESTAMP` |

---

*文档结束，等待确认后执行代码修改*
