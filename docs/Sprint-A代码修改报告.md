# Sprint-A 代码修改报告

**文档版本**：v1.0  
**修改日期**：2026-07-28  
**分支**：`feature/personnel-sprint-a-fix`  
**修改文件**：`server/routes/hse-employee-import-v2.js`  
**修改范围**：仅后端 V2 花名册导入路由，不涉及数据库结构变更  

---

## 一、修改文件清单

| 序号 | 文件路径 | 修改类型 |
|---|---|---|
| 1 | `server/routes/hse-employee-import-v2.js` | Bug 修复（空指针保护） |
| 2 | `server/routes/hse-employee-import-v2.js` | Bug 修复（INSERT 字段对齐） |
| 3 | `server/routes/hse-employee-import-v2.js` | Bug 修复（删除不存在的 `deleted_at` 引用） |

**本次修改未涉及的其他文件**：
- `server/routes/hse-employee.js`（V1 员工管理）—— 未修改
- `server/routes/personnel.js`（旧人员管理）—— 未修改
- 前端页面 —— 未修改
- 数据库结构 —— 未修改（零 DDL）

---

## 二、修改位置与前后代码对比

### 修改点一：空指针保护（L639）

**位置**：`server/routes/hse-employee-import-v2.js` L639  
**上下文**：Excel 解析后写入 `employee_import_pending` 表的 `target_pos_id` 字段

**修改前**：
```javascript
           orgMatch.target_id, unitMatch?.target_id || null, posMatch.target_position_id,
```

**修改后**：
```javascript
           orgMatch.target_id, unitMatch?.target_id || null, posMatch?.target_position_id || null,
```

**问题原因**：当 Excel 行的 `raw_position` 为空字符串时，`matchPosition()` 返回 `null`，直接访问 `posMatch.target_position_id` 触发 `Cannot read properties of null (reading 'target_position_id')`。

**修复说明**：使用可选链 `?.` 和 `|| null` 兜底，与同一文件 L609 的写法保持一致。

---

### 修改点二：employee INSERT 字段对齐（L940-950）

**位置**：`server/routes/hse-employee-import-v2.js` L940-950  
**上下文**：批次入库时，为新员工执行 `INSERT INTO employee`

**修改前**：
```javascript
          if (!employeeId) {
            // 创建新员工
            const nameEncrypted = encrypt(p.employee_name);
            const personType = p.person_type || inferPersonType(p.raw_dept, p.raw_position);
            const personCategory = p.birth_date
              ? (parseInt(String(p.birth_date).substring(0, 4)) <= (new Date().getFullYear() - 60) ? '超龄人员' : '适龄人员')
              : null;
            const insertEmp = await client.query(
              `INSERT INTO employee
               (employee_code, name, name_encrypted, id_card, id_card_hash, phone, phone_hash,
                gender, birth_date, person_type, person_category, source, status, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id`,
              [p.employee_no || null, p.employee_name, nameEncrypted,
               p.id_card_encrypted || null, p.id_card_hash || null,
               p.phone_encrypted || null, p.phone_hash || null,
               p.gender || null, p.birth_date || null,
               personType, personCategory,
               'excel_import', 'active']
            );
```

**修改后**：
```javascript
          if (!employeeId) {
            // 创建新员工
            const personType = p.person_type || inferPersonType(p.raw_dept, p.raw_position);
            const personCategory = p.birth_date
              ? (parseInt(String(p.birth_date).substring(0, 4)) <= (new Date().getFullYear() - 60) ? '超龄人员' : '适龄人员')
              : null;
            const insertEmp = await client.query(
              `INSERT INTO employee
               (employee_code, id_card, id_card_hash, name, gender, birth_date, phone, phone_hash,
                person_category, person_type, is_public_welfare, id_address, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id`,
              [p.employee_no || null, p.id_card_encrypted || null, p.id_card_hash || null,
               p.employee_name, p.gender || null, p.birth_date || null,
               p.phone_encrypted || null, p.phone_hash || null,
               personCategory, personType,
               false, null]
            );
```

**字段变更对照表**：

| 字段 | 原状态 | 新状态 | 原因 |
|---|---|---|---|
| `employee_code` | 保留 | 保留 | 工号 |
| `name` | 第 2 位 | 第 4 位 | 调整顺序，与 V1 一致 |
| `name_encrypted` | 存在（第 3 位） | **删除** | 表中不存在该列 |
| `id_card` | 第 4 位 | 第 2 位 | 调整顺序，与 V1 一致 |
| `id_card_hash` | 第 5 位 | 第 3 位 | 调整顺序，与 V1 一致 |
| `phone` | 第 6 位 | 第 7 位 | 调整顺序，与 V1 一致 |
| `phone_hash` | 第 7 位 | 第 8 位 | 调整顺序，与 V1 一致 |
| `gender` | 第 8 位 | 第 5 位 | 调整顺序，与 V1 一致 |
| `birth_date` | 第 9 位 | 第 6 位 | 调整顺序，与 V1 一致 |
| `person_type` | 第 10 位 | 第 10 位 | 保留，顺序与 V1 一致 |
| `person_category` | 第 11 位 | 第 9 位 | 调整顺序，与 V1 一致 |
| `source` | 存在（第 12 位） | **删除** | 表中不存在该列 |
| `status` | 存在（第 13 位） | **删除** | 表中不存在该列 |
| `is_public_welfare` | 不存在 | **新增**（第 11 位） | v59 真实字段，默认值 `false` |
| `id_address` | 不存在 | **新增**（第 12 位） | v67 扩展字段，V2 无数据，设为 `null` |
| `created_at` / `updated_at` | 保留 | 保留 | 由 `CURRENT_TIMESTAMP` 填充 |

**与 V1 新增逻辑对齐验证**：

V1（`hse-employee.js` L588）INSERT 语句：
```sql
INSERT INTO employee (employee_code, id_card, id_card_hash, name, gender, birth_date, phone, phone_hash, person_category, person_type, is_public_welfare, id_address)
```

V2 修改后 INSERT 语句：
```sql
INSERT INTO employee (employee_code, id_card, id_card_hash, name, gender, birth_date, phone, phone_hash, person_category, person_type, is_public_welfare, id_address, created_at, updated_at)
```

**结论**：字段名称、顺序、数据类型完全一致。V2 额外显式传入 `created_at` / `updated_at`，功能等效。

---

### 修改点三：删除 deleted_at 引用（6 处）

**统一修改策略**：将所有 SQL 中的 `, deleted_at = CURRENT_TIMESTAMP` 移除，仅保留 `is_deleted = true`。

#### 3.1 DELETE /batch/:batchId（L1076）

**修改前**：
```javascript
        'UPDATE employee_import_pending SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP WHERE batch_id = $1 AND is_deleted = false',
```

**修改后**：
```javascript
        'UPDATE employee_import_pending SET is_deleted = true WHERE batch_id = $1 AND is_deleted = false',
```

#### 3.2 DELETE /batch/:batchId（L1080）

**修改前**：
```javascript
        'UPDATE employee_import_batch SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = false RETURNING id',
```

**修改后**：
```javascript
        'UPDATE employee_import_batch SET is_deleted = true WHERE id = $1 AND is_deleted = false RETURNING id',
```

#### 3.3 POST /clear-all（L1114）

**修改前**：
```javascript
        'UPDATE employee_assignment SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP WHERE is_deleted = false'
```

**修改后**：
```javascript
        'UPDATE employee_assignment SET is_deleted = true WHERE is_deleted = false'
```

#### 3.4 POST /clear-all（L1118）

**修改前**：
```javascript
        'UPDATE employee SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP WHERE is_deleted = false'
```

**修改后**：
```javascript
        'UPDATE employee SET is_deleted = true WHERE is_deleted = false'
```

#### 3.5 POST /clear-all（L1122）

**修改前**：
```javascript
        'UPDATE employee_import_pending SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP WHERE is_deleted = false'
```

**修改后**：
```javascript
        'UPDATE employee_import_pending SET is_deleted = true WHERE is_deleted = false'
```

#### 3.6 POST /clear-all（L1126）

**修改前**：
```javascript
        'UPDATE employee_import_batch SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP WHERE is_deleted = false'
```

**修改后**：
```javascript
        'UPDATE employee_import_batch SET is_deleted = true WHERE is_deleted = false'
```

---

## 三、数据库字段验证结果

### 3.1 employee 表真实字段（v59 + v60 + v67）

**来源**：
- `server/sql/hse_employee_master_v59_migration.sql`（L112-L133）
- `server/sql/hse_employee_master_v60_hardening.sql`（L32-L33）
- `server/sql/hse_employee_master_v67_extension.sql`（L19）

**确认字段列表**：
```text
id                  BIGSERIAL PRIMARY KEY
employee_code       VARCHAR(50)
id_card             VARCHAR(128)
id_card_hash        VARCHAR(64)      -- v60 新增
name                VARCHAR(100) NOT NULL
gender              VARCHAR(10)
birth_date          DATE
phone               VARCHAR(64)
phone_hash          VARCHAR(64)      -- v60 新增
person_category     VARCHAR(20)
person_type         VARCHAR(20)
is_public_welfare   BOOLEAN NOT NULL DEFAULT FALSE
id_address          VARCHAR(256)     -- v67 新增
created_at          TIMESTAMP NOT NULL DEFAULT NOW()
updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
is_deleted          BOOLEAN NOT NULL DEFAULT FALSE
```

**验证结论**：
- `name_encrypted` ❌ 不存在 —— 已删除
- `source` ❌ 不存在 —— 已删除
- `status` ❌ 不存在 —— 已删除
- `is_public_welfare` ✅ 存在 —— 已添加（默认值 `false`）
- `id_address` ✅ 存在 —— 已添加（V2 无数据，设为 `null`）

### 3.2 deleted_at 字段核查

| 表名 | 是否存在 `deleted_at` | 结论 |
|---|---|---|
| `employee` | ❌ 不存在 | 移除代码引用 |
| `employee_assignment` | ❌ 不存在 | 移除代码引用 |
| `employee_import_pending` | ❌ 不存在 | 移除代码引用 |
| `employee_import_batch` | ❌ 不存在 | 移除代码引用 |
| `hse_employee_org` | ❌ 不存在 | 未涉及 |

### 3.3 target_position_id 访问保护核查

| 位置 | 修改前 | 修改后 | 结论 |
|---|---|---|---|
| L609 | `posMatch?.target_position_id \|\| null` | 未改动 | 原本正确 |
| L639 | `posMatch.target_position_id` | `posMatch?.target_position_id \|\| null` | 已修复 |
| 其他位置 | 无直接访问 | — | 无问题 |

---

## 四、基础验证结果

### 4.1 Node.js 语法检查

```bash
node --check server/routes/hse-employee-import-v2.js
```

**结果**：`exit code 0`，语法通过 ✅

### 4.2 残留 `deleted_at` 搜索

```bash
grep -n "deleted_at" server/routes/hse-employee-import-v2.js
```

**结果**：`No matches found`，已全部清除 ✅

### 4.3 未保护的 `.target_position_id` 搜索

```bash
grep -n "\.target_position_id[^?]" server/routes/hse-employee-import-v2.js
```

**结果**：
```
609: orgMatch.target_id, unitMatch?.target_id || null, posMatch?.target_position_id || null,
639: orgMatch.target_id, unitMatch?.target_id || null, posMatch?.target_position_id || null,
```

两处均已使用 `?.` 保护 ✅

### 4.4 文件修改统计

| 指标 | 数值 |
|---|---|
| 修改文件数 | 1 |
| 修改行数 | 约 20 行（3 处逻辑修改 + 6 处 SQL 修正） |
| 新增代码行 | 0（仅修正和删除） |
| 删除代码行 | 约 10 行（`nameEncrypted` 变量、`deleted_at` 引用、`source`/`status` 字段） |

---

## 五、风险分析

### 5.1 功能影响

| 功能 | 影响 | 说明 |
|---|---|---|
| 花名册上传解析 | 修复 | 岗位为空的行不再报错 |
| 花名册批次入库 | 修复 | 不再因「列不存在」导致 INSERT 失败 |
| 清空所有人员 | 修复 | 不再因 `deleted_at` 报错 |
| 员工列表查询 | 无影响 | 未修改 `hse-employee.js` |
| 员工档案查询 | 无影响 | 未修改 `hse-employee.js` |
| 三违管理 | 无影响 | 未修改相关文件 |
| 培训管理 | 无影响 | 未修改相关文件 |
| 风险画像 | 无影响 | 未修改相关文件 |
| 预警中心 | 无影响 | 未修改相关文件 |

### 5.2 数据影响

| 数据维度 | 影响 | 说明 |
|---|---|---|
| employee 表结构 | 无影响 | 零 DDL，未改表 |
| employee 数据内容 | 修复 | V2 导入的员工数据现在能正确入库 |
| employee_assignment 数据 | 修复 | 清空操作现在能正确执行 |
| 历史 employee 数据 | 无影响 | 仅修改新增逻辑，不影响已有数据 |
| `is_deleted` 软删除 | 等效 | `is_deleted = true` 功能与之前一致 |
| `deleted_at` 审计时间 | 功能损失 | 无法精确记录删除时间，但 `updated_at` 可近似推断 |

### 5.3 回滚方式

如需回滚：
1. 使用 Git revert 回滚 `server/routes/hse-employee-import-v2.js`
2. 重启后端服务
3. 回滚后恢复到「报错状态」（花名册导入失败、清空失败）

**回滚数据影响**：无。本次修改不涉及数据迁移或表结构变更。

---

## 六、测试步骤（待执行）

### 6.1 单元测试

1. **空岗位行导入测试**
   - 准备 Excel：包含至少一行 `岗位` 列为空
   - 上传解析 → 确认无 `target_position_id` 报错
   - 批次入库 → 确认该员工成功入库，`employee_assignment.position_id` 为 `NULL`

2. **正常行导入测试**
   - 准备 Excel：包含完整的员工信息
   - 上传 → 解析 → 入库
   - 确认 `employee` 表新增记录，字段值正确

3. **清空人员测试**
   - 执行「清空所有人员信息」
   - 确认返回成功，`employee` 和 `employee_assignment` 中所有记录 `is_deleted = true`
   - 确认无 `deleted_at` 相关 SQL 报错

### 6.2 集成测试

1. **V1 员工列表兼容性**
   - 导入 V2 花名册后，访问 V1 `/employees` 接口
   - 确认新导入员工出现在列表中

2. **风险画像关联**
   - 导入员工后，查看风险画像
   - 确认员工基本信息正确显示

3. **预警中心关联**
   - 导入员工后，在预警中心选择人员
   - 确认下拉列表包含新导入员工

### 6.3 回归测试

1. **V1 新增员工**：`POST /employees` 是否正常
2. **V1 编辑员工**：`PUT /employees/:id` 是否正常
3. **V1 删除员工**：`DELETE /employees/:id` 是否正常
4. **员工档案页面**：基本信息、组织关系是否正常显示

---

## 七、待办事项

| 序号 | 事项 | 状态 | 负责人 |
|---|---|---|---|
| 1 | 代码修改 | 已完成 | 开发 |
| 2 | 基础验证（语法/残留搜索） | 已完成 | 开发 |
| 3 | 后端启动测试 | 待执行 | 测试 |
| 4 | 花名册导入全流程测试 | 待执行 | 测试 |
| 5 | 清空人员功能测试 | 待执行 | 测试 |
| 6 | V1 员工管理回归测试 | 待执行 | 测试 |
| 7 | Git 提交 | 待执行 | 开发 |
| 8 | Sprint A 验收 | 待执行 | 产品/测试 |

---

## 八、修改总结

本次 Sprint A 针对「人员管理」模块的 3 个核心报错进行了修复：

1. **空指针报错**：通过可选链保护 `posMatch?.target_position_id`，避免岗位为空时崩溃
2. **INSERT 列不存在**：将 `employee` 表 INSERT 字段对齐到数据库真实结构（v59+v60+v67），移除 `name_encrypted`、`source`、`status` 三个不存在的字段
3. **deleted_at 不存在**：删除 6 处 SQL 中对 `deleted_at` 的引用，仅保留 `is_deleted = true`

**所有修改均限于 `server/routes/hse-employee-import-v2.js` 单一文件，未修改数据库结构、未修改 V1 员工管理代码、未修改前端页面。**

---

*报告结束。等待测试验证通过后执行 Git 提交。*
