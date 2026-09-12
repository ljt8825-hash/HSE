# HSE Sprint5.6 员工主数据中心测试报告

## 一、测试概述

本报告记录 Sprint5.6 员工主数据中心开发阶段的验证结果。当前阶段已完成代码开发及基础语法检查，完整端到端测试需在数据库迁移执行后进行。

**测试范围**：
- 数据库迁移脚本（6张表 + 视图 + 索引）
- 初始化数据脚本（组织/岗位/作业单元/映射规则）
- Excel导入V2 API（6个接口）
- 组织/作业单元/岗位匹配逻辑
- 异常审核和正式入库流程

---

## 二、静态检查

### 2.1 代码语法检查

| 文件 | 检查命令 | 结果 |
|------|----------|------|
| `server/routes/hse-employee-import-v2.js` | `node -c` | ✅ 通过 |
| `server/app.js` | `node -c` | ✅ 通过 |

### 2.2 依赖完整性检查

| 依赖模块 | 导出函数 | 状态 |
|----------|----------|------|
| `server/middleware/response.js` | `success`, `error` | ✅ 存在 |
| `server/utils/encryption.js` | `encrypt`, `hashSensitive` | ✅ 存在 |
| `server/middleware/auth.js` | `requireRole` | ✅ 存在 |
| `server/middleware/upload.js` | `uploadExcel`, `validateUploadedFile`, `deleteFile` | ✅ 存在 |
| `server/routes/audit.js` | `auditLog` | ✅ 存在 |
| `server/config/db.js` | `pool`, `isConnected` | ✅ 存在 |

### 2.3 SQL脚本语法检查（PostgreSQL）

| 脚本 | 检查方式 | 结果 |
|------|----------|------|
| `sprint5_6_employee_master_migration.sql` | 人工审查 + 语法结构校验 | ✅ 通过，使用 `IF NOT EXISTS` 和 `CREATE OR REPLACE` 保证可重复执行 |
| `sprint5_6_employee_master_init_data.sql` | 人工审查 + 语法结构校验 | ✅ 通过，所有 INSERT 使用 `WHERE NOT EXISTS` 保证增量安全 |

---

## 三、单元测试计划

### 3.1 待测试场景

以下场景需在数据库迁移完成后，使用 Jest + supertest 进行自动化测试：

#### employee_assignment 表
- [ ] 插入主岗记录成功
- [ ] 同一员工插入两个当前主岗应触发唯一索引冲突
- [ ] 标记旧主岗为非当前后，可插入新主岗
- [ ] 查询 `v_employee_current` 视图返回完整关联数据

#### employee_import_batch / employee_import_pending
- [ ] 创建批次记录成功
- [ ] 更新批次状态计数正确
- [ ] pending 记录状态机流转（pending → approved → imported）
- [ ] pending 记录状态机流转（pending → rejected）

#### 匹配逻辑
- [ ] `matchOrgUnit`：精确匹配已知部门
- [ ] `matchOrgUnit`：未知部门返回 null
- [ ] `matchPosition`：无条件匹配
- [ ] `matchPosition`：条件匹配（司机+车队 vs 司机+片区）
- [ ] `matchPosition`：过期规则不匹配
- [ ] `matchOperationUnit`：映射规则直接命中
- [ ] `matchOperationUnit`：班组动态创建保洁组（getOrCreate）
- [ ] `matchOperationUnit`：岗位推断创建收运车组
- [ ] `matchEmployee`：employee_no 精确匹配
- [ ] `matchEmployee`：id_card_hash 匹配
- [ ] `matchEmployee`：phone_hash + name 匹配
- [ ] `matchEmployee`：新员工返回 null

### 3.2 测试命令

```bash
cd server
npm test -- --testPathPattern="employee-import-v2"
```

---

## 四、集成测试计划

### 4.1 导入流程端到端测试

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | POST `/api/hse/employee-import/v2/upload` 上传标准模板 | 返回 batchId，successCount > 0，pendingCount >= 0 |
| 2 | GET `/api/hse/employee-import/v2/batches` | 列表中包含新批次，status='pending_review' |
| 3 | GET `/api/hse/employee-import/v2/batch/{batchId}/preview` | 返回批次详情和 pendingList |
| 4 | POST `/api/hse/employee-import/v2/pending/{id}/resolve` approved | pending 状态变为 approved，批次计数更新 |
| 5 | POST `/api/hse/employee-import/v2/pending/{id}/resolve` rejected | pending 状态变为 rejected，批次计数更新 |
| 6 | POST `/api/hse/employee-import/v2/batch/{batchId}/import` | approved 记录写入 employee + employee_assignment，批次状态变为 completed/partial_completed |
| 7 | 重复执行 import | 返回错误"该批次已入库完成，禁止重复导入" |

### 4.2 边界场景测试

| 场景 | 预期行为 |
|------|----------|
| 上传空Excel | 返回错误"Excel 工作表无数据" |
| 上传缺少"姓名"列的Excel | 返回错误"表头必须包含姓名列" |
| 身份证号与系统已有员工冲突 | 进入 pending，type='id_card_conflict' |
| 未知部门 | 进入 pending，type='unknown_dept' |
| 未知岗位 | 进入 pending，type='unknown_position' |
| 1300+ 行大数据量 | 单条失败不影响整体，支持部分完成 |
| 缺失姓名行 | 计入 skippedCount |

---

## 五、数据迁移验证步骤

执行以下命令后，验证数据库状态：

```bash
# 1. 执行迁移
psql -U postgres -d safety_dashboard -f server/sql/sprint5_6_employee_master_migration.sql

# 2. 验证表存在
\dt employee_assignment
\dt employee_import_batch
\dt employee_import_pending
\dt employee_import_mapping_rule
\dt employee_position_mapping_rule
\dt employee_import_mapping_rule_version
\dv v_employee_current

# 3. 执行初始化
psql -U postgres -d safety_dashboard -f server/sql/sprint5_6_employee_master_init_data.sql

# 4. 验证数据
SELECT COUNT(*) FROM hse_org_unit WHERE is_deleted = false;      -- 预期 >= 18
SELECT COUNT(*) FROM position WHERE is_deleted = false;           -- 预期 >= 20
SELECT COUNT(*) FROM hse_operation_unit WHERE is_deleted = false; -- 预期 >= 1
SELECT COUNT(*) FROM employee_import_mapping_rule WHERE is_deleted = false;    -- 预期 >= 20
SELECT COUNT(*) FROM employee_position_mapping_rule WHERE is_deleted = false;  -- 预期 >= 15
SELECT COUNT(*) FROM employee_import_mapping_rule_version WHERE is_deleted = false; -- 预期 >= 1

# 5. 验证视图
SELECT * FROM v_employee_current LIMIT 5;
```

---

## 六、已知问题与风险

| 序号 | 问题 | 风险等级 | 处理方式 |
|------|------|----------|----------|
| 1 | `import` API 中新员工 INSERT 仅写入少量字段（employee_code, name, id_card_hash, phone_hash, source），缺少完整字段 | 中 | 后续根据前端需求扩展，当前满足最小可用 |
| 2 | 大批量导入（1300+行）为同步处理，可能超时 | 中 | 后续优化为异步队列或分页处理 |
| 3 | 动态创建 hse_operation_unit 时，`headcount` 默认为 NULL | 低 | 不影响功能，后续可补充统计逻辑 |
| 4 | 缺少前端导入管理页面 | 高 | 下一阶段开发前端页面 |
| 5 | auditLog 未在 V2 路由中实际调用 | 低 | 后续补充审计日志记录 |

---

## 七、测试结论

- **静态检查**：全部通过（代码语法、依赖完整性、SQL结构）
- **单元测试**：待执行（需先完成数据库迁移）
- **集成测试**：待执行（需先完成数据库迁移 + 启动后端服务）
- **代码评审**：通过核心约束检查
  - ✅ 未修改 Vben 核心目录
  - ✅ 未修改 auth/JWT 相关代码
  - ✅ 未修改冻结表结构（employee, hse_org_unit, hse_operation_unit, position）
  - ✅ 未新增 npm 依赖
  - ✅ 未硬编码组织/岗位规则
  - ✅ 使用 employee_assignment 作为统一关系表

---

## 八、后续行动

1. 在测试环境执行数据库迁移脚本
2. 执行初始化数据脚本
3. 启动后端服务，使用 Postman / curl 进行 API 集成测试
4. 根据测试结果修复问题
5. 开发前端导入管理页面
6. 补充完整字段的导入逻辑（如 birth_date, hire_date, gender 等）
