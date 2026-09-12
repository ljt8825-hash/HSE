# Sprint-A 提交记录

**提交日期**：2026-07-28  
**分支**：`feature/personnel-sprint-a-fix`  
**Commit ID**：`49a7497`  

---

## 一、Commit 信息

```
commit 49a7497
Author: HSE Dev <dev@hse-dashboard.local>
Date:   2026-07-28

    feat(personnel): complete sprint-a employee import and clear fix

    - fix: posMatch.target_position_id 空指针报错（L639 改为可选链）
    - fix: employee INSERT 字段对齐 v59+v60+v67 真实结构（移除 name_encrypted/source/status）
    - fix: 删除 6 处 deleted_at 引用，仅保留 is_deleted 软删除
    - docs: Sprint-A 实施方案、代码修改报告、测试验收报告、真实运行验收报告
```

---

## 二、修改文件列表

| 序号 | 文件路径 | 变更类型 | 说明 |
|---|---|---|---|
| 1 | `server/routes/hse-employee-import-v2.js` | New (Bug 修复) | 修复花名册导入与清空人员功能 |
| 2 | `docs/Sprint-A-人员导入与清空功能修复实施方案.md` | New | 实施方案文档 |
| 3 | `docs/Sprint-A代码修改报告.md` | New | 代码修改详细记录 |
| 4 | `docs/Sprint-A测试验收报告.md` | New | 静态分析验收报告 |
| 5 | `docs/Sprint-A.1真实运行验收报告.md` | New | 真实运行验收报告 |

**统计**：5 files changed, 2521 insertions(+)

---

## 三、修复问题

### 3.1 花名册导入空指针报错

**问题**：`Cannot read properties of null (reading 'target_position_id')`

**根因**：当 Excel 行 `raw_position` 为空时，`matchPosition()` 返回 `null`，直接访问 `posMatch.target_position_id` 触发空指针异常。

**修复**：[hse-employee-import-v2.js:639](file:///F:/hse-dashboard/server/routes/hse-employee-import-v2.js#L639)

```javascript
// 修改前
posMatch.target_position_id

// 修改后
posMatch?.target_position_id || null
```

### 3.2 employee INSERT 字段不存在

**问题**：`INSERT INTO employee` 包含 `name_encrypted`、`source`、`status` 三个数据库中不存在的字段。

**根因**：V2 导入代码的 INSERT 语句未与 v59+v60+v67 数据库迁移脚本对齐。

**修复**：[hse-employee-import-v2.js:941-950](file:///F:/hse-dashboard/server/routes/hse-employee-import-v2.js#L941-L950)

```javascript
// 修改后字段列表（对齐 v59 真实结构）
INSERT INTO employee
  (employee_code, id_card, id_card_hash, name, gender, birth_date,
   phone, phone_hash, person_category, person_type, is_public_welfare, id_address,
   created_at, updated_at)
```

### 3.3 清空人员 deleted_at 字段不存在

**问题**：`关系 "employee_assignment" 的 "deleted_at" 字段不存在`

**根因**：代码中 6 处 SQL 引用了 `deleted_at` 列，但 `employee`、`employee_assignment`、`employee_import_pending`、`employee_import_batch` 四张表均未定义该列，软删除使用 `is_deleted` 字段。

**修复**：6 处 SQL 统一删除 `, deleted_at = CURRENT_TIMESTAMP`，仅保留 `is_deleted = true`。

| 位置 | 行号 | SQL 语句 |
|---|---|---|
| DELETE /batch/:batchId | L1078 | `UPDATE employee_import_pending SET is_deleted = true WHERE ...` |
| DELETE /batch/:batchId | L1082 | `UPDATE employee_import_batch SET is_deleted = true WHERE ...` |
| POST /clear-all | L1116 | `UPDATE employee_assignment SET is_deleted = true WHERE ...` |
| POST /clear-all | L1121 | `UPDATE employee SET is_deleted = true WHERE ...` |
| POST /clear-all | L1126 | `UPDATE employee_import_pending SET is_deleted = true WHERE ...` |
| POST /clear-all | L1131 | `UPDATE employee_import_batch SET is_deleted = true WHERE ...` |

---

## 四、测试结果

### 4.1 静态验证

| 验证项 | 结果 |
|---|---|
| Node.js 语法检查 (`node --check`) | ✅ exit code 0 |
| 残留 `deleted_at` 搜索 | ✅ No matches found |
| 未保护的 `.target_position_id` 搜索 | ✅ 两处均已使用 `?.` |
| employee 表字段与 v59 对齐 | ✅ 12 字段完全一致 |

### 4.2 真实运行验证

| 测试项 | 结果 | 详细数据 |
|---|---|---|
| 后端服务启动 | ✅ | 端口 5666 正常监听 |
| 数据库连接 | ✅ | PostgreSQL 连接池正常 |
| Excel 上传解析 | ✅ | 3 条记录解析成功（1 成功 + 2 pending） |
| 岗位为空员工导入 | ✅ | TEST001 入库成功，`position_id = NULL` |
| 批次入库 | ✅ | 新增员工 1 人，任职关系 1 条 |
| 清空人员功能 | ✅ | 1360 条员工 + 1304 条任职关系全量软删除 |
| employee 表数据验证 | ✅ | `id_card`/`phone` 加密存储，`person_type`/`person_category` 正确 |
| deleted_at 列检查 | ✅ | 4 张表均不存在 `deleted_at` 列 |

### 4.3 验收结论

**✅ Sprint A 最终通过验收**

---

## 五、回滚方式

### 5.1 Git 回滚

```bash
# 方式一：revert（保留历史记录，推荐）
git revert 49a7497

# 方式二：reset（删除提交记录，谨慎使用）
git reset --hard HEAD~1
```

### 5.2 数据回滚

本次修改**不涉及数据迁移或表结构变更**，仅修复应用层代码逻辑，因此：
- **无需数据回滚**
- 回滚代码后，系统恢复到修复前的报错状态（花名册导入失败、清空人员失败）

### 5.3 服务重启

代码回滚后需重启后端服务：
```bash
# 停止当前后端服务
# 重新启动
node server/app.js
```

---

## 六、后续阶段

| 阶段 | 内容 | 状态 |
|---|---|---|
| Sprint A | 修复花名册导入与清空人员功能 | ✅ 已完成并提交 |
| Sprint B | 统一人员模型（employee_assignment 替代 hse_employee_org） | ⏳ 待启动 |
| Sprint C | 业务模块关联治理（三违、培训等数据联动） | ⏳ 待启动 |
| Sprint D | 废弃旧代码（冻结 personnel.js） | ⏳ 待启动 |

---

*Sprint-A 提交记录结束。*