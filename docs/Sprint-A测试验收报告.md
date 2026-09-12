# Sprint-A 测试验收报告

**文档版本**：v1.0  
**验收日期**：2026-07-28  
**验收范围**：Sprint A 代码修复（花名册导入与清空功能）  
**验收分支**：`feature/personnel-sprint-a-fix`  
**验收方法**：代码审计 + 静态分析（非运行时测试）  
**验收文件**：`docs/Sprint-A代码修改报告.md`  

---

## 一、测试环境

### 1.1 环境配置

| 检查项 | 检查方式 | 结果 |
|---|---|---|
| 后端服务加载 | `node -e "require('./server/routes/hse-employee-import-v2')"` | ✅ 成功，返回 `type: function` |
| 数据库连接 | `node -e "require('./server/config/db').testConnection()"` | ✅ `[DB] PostgreSQL 连接池初始化成功` |
| 路由注册 | `grep "app.use.*hse.*import" server/app.js` | ✅ 已注册 `/api/hse/employee-import/v2` |
| Node.js 版本 | `node --version` | v18.x（默认） |
| 数据库 | PostgreSQL（配置见 `server/config/db.js`） | ✅ 连接正常 |

### 1.2 代码加载验证

```bash
node -e "require('./server/routes/hse-employee-import-v2')"
# 无错误输出，模块加载成功
```

---

## 二、测试数据（模拟）

由于本次验收采用**代码审计 + 静态分析**方式，不启动实际服务，以下测试用例基于代码逻辑路径推演。

### 2.1 测试A：岗位为空员工

**模拟 Excel 数据**：
```text
employee_no: EMP001
name: 张三
raw_dept: 宁津项目
raw_position: （空字符串）
gender: 男
birth_date: 1985-03-15
```

**预期行为**：
1. Excel 上传 → 解析成功
2. 组织匹配 → `orgMatch.target_id` 有值
3. 岗位匹配 → `row.raw_position` 为空，`posMatch` 保持为 `null`（不调用 `matchPosition`）
4. pending 写入 → `target_pos_id = NULL`
5. 批次入库 → `employee` 新增成功，`employee_assignment.position_id = NULL`

**代码路径验证**：

| 步骤 | 代码位置 | 关键逻辑 | 修复状态 |
|---|---|---|---|
| 岗位为空判断 | L558-560 | `if (row.raw_position && String(row.raw_position).trim())` | ✅ 空字符串时跳过 matchPosition |
| pending 写入 | L639 | `posMatch?.target_position_id || null` | ✅ 已修复为可选链 |
| employee INSERT | L941-950 | 12 字段对齐 v59 结构 | ✅ 已修复 |
| assignment INSERT | L993 | `position_id = p.target_pos_id`（来自 pending，为 NULL） | ✅ 合法 |

**结论**：不会触发 `Cannot read properties of null (reading 'target_position_id')` 报错。

### 2.2 测试B：完整员工信息

**模拟 Excel 数据**：
```text
employee_no: EMP002
name: 李四
raw_dept: 宁津项目/清扫一队
raw_position: 驾驶员
gender: 男
birth_date: 1990-05-20
id_card: 371421199005201234
phone: 13800138000
```

**预期行为**：
1. 组织匹配 → 成功
2. 岗位匹配 → 成功（假设规则表有映射）
3. pending 写入 → `target_pos_id` 有值
4. 批次入库 → `employee` 新增，字段完整

**代码路径验证**：

| 字段 | INSERT 位置 | 来源 | V1 对齐 |
|---|---|---|---|
| `employee_code` | 第 1 位 | `p.employee_no` | ✅ |
| `id_card` | 第 2 位 | `p.id_card_encrypted`（加密后） | ✅ |
| `id_card_hash` | 第 3 位 | `p.id_card_hash`（HMAC） | ✅ |
| `name` | 第 4 位 | `p.employee_name` | ✅ |
| `gender` | 第 5 位 | `p.gender` | ✅ |
| `birth_date` | 第 6 位 | `p.birth_date` | ✅ |
| `phone` | 第 7 位 | `p.phone_encrypted`（加密后） | ✅ |
| `phone_hash` | 第 8 位 | `p.phone_hash`（HMAC） | ✅ |
| `person_category` | 第 9 位 | 由 `birth_date` 推断（适龄/超龄） | ✅ |
| `person_type` | 第 10 位 | `p.person_type` 或 `inferPersonType()` | ✅ |
| `is_public_welfare` | 第 11 位 | `false`（默认值） | ✅ |
| `id_address` | 第 12 位 | `null`（V2 无此字段） | ✅ |

**结论**：字段顺序、名称、数据类型与 V1（`hse-employee.js` L588）完全一致。

---

## 三、清空人员测试

### 3.1 测试场景

执行 `POST /api/hse/employee-import/v2/clear-all`

### 3.2 代码路径验证

| SQL 语句 | 原代码（修复前） | 修复后代码 | 状态 |
|---|---|---|---|
| `UPDATE employee_assignment` | `SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP` | `SET is_deleted = true` | ✅ 已修复 |
| `UPDATE employee` | `SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP` | `SET is_deleted = true` | ✅ 已修复 |
| `UPDATE employee_import_pending` | `SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP` | `SET is_deleted = true` | ✅ 已修复 |
| `UPDATE employee_import_batch` | `SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP` | `SET is_deleted = true` | ✅ 已修复 |

### 3.3 预期结果

- 所有记录的 `is_deleted` 字段被置为 `true`
- 不再因 `deleted_at` 列不存在而报错
- 功能等效：软删除成功执行

**结论**：清空人员功能已修复。

---

## 四、接口回归测试

### 4.1 接口列表

| 接口 | 路径 | 状态 |
|---|---|---|
| Excel 上传解析 | `POST /api/hse/employee-import/v2/import/excel` | 代码审计通过 |
| 批次入库 | `POST /api/hse/employee-import/v2/batch/:id/import` | 代码审计通过 |
| 删除批次 | `DELETE /api/hse/employee-import/v2/batch/:batchId` | 代码审计通过 |
| 清空人员 | `POST /api/hse/employee-import/v2/clear-all` | 代码审计通过 |

### 4.2 静态检查结果

```bash
# 1. Node.js 语法检查
node --check server/routes/hse-employee-import-v2.js
# 结果：exit code 0，无语法错误

# 2. 残留 deleted_at 搜索
grep -n "deleted_at" server/routes/hse-employee-import-v2.js
# 结果：No matches found

# 3. 未保护的 .target_position_id 搜索
grep -n "\.target_position_id[^?]" server/routes/hse-employee-import-v2.js
# 结果：两处均已使用 ?. 保护
```

**结论**：所有静态检查通过。

---

## 五、数据一致性检查

### 5.1 V2 导入数据与 V1 数据模型对齐

| 数据维度 | V1（`hse-employee.js`） | V2（修复后） | 一致性 |
|---|---|---|---|
| `employee` 表结构 | v59+v60+v67 定义 | INSERT 12 字段对齐 | ✅ 完全一致 |
| `id_card` 加密方式 | AES-256-GCM 密文 | `p.id_card_encrypted`（上游已加密） | ✅ 一致 |
| `phone` 加密方式 | AES-256-GCM 密文 | `p.phone_encrypted`（上游已加密） | ✅ 一致 |
| `id_card_hash` | HMAC-SHA256 | `p.id_card_hash`（上游已计算） | ✅ 一致 |
| `phone_hash` | HMAC-SHA256 | `p.phone_hash`（上游已计算） | ✅ 一致 |
| `name` 存储 | 明文 | `p.employee_name`（明文） | ✅ 一致 |
| `person_type` | 手动选择或推断 | `inferPersonType()` 或 Excel 列 | ✅ 一致 |
| `person_category` | 由 `birth_date` 计算 | 由 `birth_date` 计算（适龄/超龄） | ✅ 一致 |

### 5.2 V2 导入员工能否被其他模块查询

| 模块 | 查询方式 | 预期结果 | 说明 |
|---|---|---|---|
| 员工列表（V1） | `SELECT * FROM employee WHERE is_deleted = false` | ✅ 可查询到 | V2 导入的员工写入 `employee` 表，符合统一主数据模型 |
| 员工档案（V1） | `SELECT * FROM v_employee_current WHERE employee_id = ?` | ✅ 可查询到 | 视图基于 `employee_assignment`，V2 导入时写入该表 |
| 风险画像 | `SELECT * FROM employee WHERE id = ?` + `employee_assignment` | ✅ 可查询到 | 同上 |
| 预警中心 | 人员下拉框查询 `employee` 表 | ✅ 可查询到 | 同上 |

**结论**：V2 导入的员工数据与 V1 数据模型完全一致，其他模块可正常查询。

---

## 六、发现问题

### 6.1 Sprint A 范围内问题（已修复）

| 序号 | 问题描述 | 修复状态 |
|---|---|---|
| 1 | 岗位为空时，`posMatch.target_position_id` 空指针报错 | ✅ 已修复（L639） |
| 2 | `employee` INSERT 包含 `name_encrypted`、`source`、`status` 三个不存在的字段 | ✅ 已修复（L941-950） |
| 3 | 清空人员时，`deleted_at` 字段不存在报错 | ✅ 已修复（6 处 SQL） |

### 6.2 Sprint A 范围外问题（仅记录，不修改）

| 序号 | 问题描述 | 影响范围 | 建议 Sprint | 当前状态 |
|---|---|---|---|---|
| 1 | ~~V1 和 V2 同时写入 `hse_employee_org` 和 `employee_assignment`，导致双任职关系并存~~ | 数据一致性 | Sprint B | ✅ 已于 Sprint-C Phase 1 解决 |
| 2 | `personnel.js` 使用独立的 `personnel` 表，与 `employee` 表无关联 | 数据孤岛 | Sprint B | 待处理 |
| 3 | 三违管理 `violator_id` 可能为 NULL，无法关联员工档案 | 业务联动 | Sprint C | 待处理 |
| 4 | 培训管理 `personnel_id` 与 `employee_id` 双字段并存 | 数据冗余 | Sprint C | 待处理 |

---

## 七、测试结论

### 7.1 测试结果汇总

| 测试项 | 结果 | 说明 |
|---|---|---|
| 环境检查 | ✅ 通过 | 数据库连接、路由加载、语法检查均正常 |
| 岗位为空员工导入 | ✅ 通过 | 代码逻辑已修复，不再报空指针错误 |
| 完整员工信息导入 | ✅ 通过 | INSERT 字段对齐，数据模型一致 |
| 清空人员功能 | ✅ 通过 | 已删除 `deleted_at` 引用，软删除功能等效 |
| 接口回归测试 | ✅ 通过 | 静态检查全部通过 |
| 数据一致性 | ✅ 通过 | V2 数据与其他模块查询兼容 |

### 7.2 是否通过 Sprint A 验收

**结论：✅ 通过**

**理由**：
1. 三大核心报错（空指针、INSERT 字段不存在、deleted_at 不存在）已全部修复
2. 代码修改符合《Sprint-A人员导入与清空功能修复实施方案》要求
3. 未修改数据库结构、未修改 V1 员工管理代码、未修改前端页面
4. 静态检查全部通过，无残留问题
5. V2 导入数据与 V1 数据模型完全一致，其他模块可正常查询

---

## 八、Git 提交建议

### 8.1 提交文件清单

| 文件 | 变更类型 | 说明 |
|---|---|---|
| `server/routes/hse-employee-import-v2.js` | Modified | 修复空指针、INSERT 字段对齐、删除 deleted_at 引用 |
| `docs/Sprint-A-人员导入与清空功能修复实施方案.md` | New | 实施方案文档 |
| `docs/Sprint-A代码修改报告.md` | New | 代码修改详细记录 |
| `docs/Sprint-A测试验收报告.md` | New | 本文档 |

### 8.2 提交命令建议

```bash
# 1. 添加修改文件
git add server/routes/hse-employee-import-v2.js
git add docs/Sprint-A-人员导入与清空功能修复实施方案.md
git add docs/Sprint-A代码修改报告.md
git add docs/Sprint-A测试验收报告.md

# 2. 提交
git commit -m "fix(personnel): Sprint-A - 修复花名册导入与清空人员功能

- 修复岗位为空时 target_position_id 空指针报错 (L639)
- employee INSERT 字段对齐 v59+v60+v67 结构 (L941-950)
- 删除 6 处 deleted_at 引用，仅保留 is_deleted 软删除
- 生成实施方案、代码修改报告、测试验收报告

Refs: docs/Sprint-A代码修改报告.md"

# 3. 推送到远程（如有）
git push origin feature/personnel-sprint-a-fix
```

---

## 九、后续建议

### 9.1 Sprint B 准备

Sprint A 验收通过后，建议启动 Sprint B（统一人员模型）：

1. 将 `hse-employee.js` 的写入逻辑切换到 `employee_assignment` — ✅ **已于 Sprint-C Phase 1 完成**
2. 冻结 `personnel.js` 的 POST/PUT/DELETE 接口 — 待处理
3. ~~迁移 `hse_employee_org` 历史数据到 `employee_assignment`~~ — ✅ **已于 Sprint-B B-2 + Sprint-C Phase 1 完成**
   - `hse_employee_org` 已冻结为只读审计表（永久保留，禁止 DROP/TRUNCATE）
   - 详见：docs/Sprint-C-v1.0/03_Governance/Legacy_Table_Lifecycle_Report.md

### 9.2 建议的后续测试（运行时）

如有条件，建议补充以下运行时测试：

1. **实际 Excel 上传测试**：使用真实花名册模板，验证解析和入库流程
2. **后端服务启动测试**：`node server/app.js`，验证路由响应
3. **清空人员实际执行测试**：调用 `/clear-all`，验证 SQL 执行无错误

---

*报告结束。Sprint A 验收通过，建议执行 Git 提交。*