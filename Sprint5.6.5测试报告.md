# HSE Sprint5.6.5 员工花名册导入管理测试报告

## 一、测试概述

本报告记录 Sprint5.6.5 员工花名册导入管理页面的验证情况。

**测试范围**：
- 前端 5 个集成功能（批次列表 / Excel上传 / 预览 / 异常审核 / 确认入库）
- 后端 3 项同步修复（pending 表新增字段 / 入库字段补充 / auditLog 接入）

---

## 二、静态检查

### 2.1 代码语法

| 文件 | 检查方式 | 结果 |
|------|----------|------|
| `server/routes/hse-employee-import-v2.js` | `node -c` | ✅ 通过 |
| `apps/web-antd/src/views/hse/employee-import-v2/index.vue` | pnpm build / vite check | 待执行 |
| `apps/web-antd/src/api/hse/employee-import-v2.ts` | tsc 类型检查 | 待执行 |
| `apps/web-antd/src/router/routes/modules/hse-employee-import-v2.ts` | tsc 类型检查 | 待执行 |

### 2.2 导入路径

| 文件 | 导入项 | 来源 | 状态 |
|------|--------|------|------|
| `index.vue` | `Page` | `@vben/common-ui` | ✅ 已存在 |
| `index.vue` | `IconifyIcon` | `@vben/icons` | ✅ 已存在 |
| `index.vue` | `useAccess` | `@vben/access` | ✅ 已存在 |
| `index.vue` | `requestClient` → 通过 `#/api/hse/employee-import-v2` | 项目内 API | ✅ 符合 vben 模式 |
| `index.vue` | Ant Design Vue 组件 | `ant-design-vue` | ✅ 已安装 |

### 2.3 路由自动加载

- 文件位于 `apps/web-antd/src/router/routes/modules/hse-employee-import-v2.ts`
- Vben 框架自动扫描 `modules/` 下所有文件并合并到主路由
- 无需修改 `router/routes/index.ts`

### 2.4 SQL 结构

- `sprint5_6_employee_master_migration.sql` 新增 3 个字段位置正确（在 `pending_type` 之前），不影响已有索引
- `WHERE NOT EXISTS` / `IF NOT EXISTS` 保证可重复执行

---

## 三、功能测试计划

### 3.1 批次列表功能

| 用例 | 操作 | 预期 |
|------|------|------|
| TC-001 | 访问 `/hse/employee-import-v2/list` | 页面正常加载，显示列表 |
| TC-002 | 点击"上传花名册"按钮 | 打开上传抽屉 |
| TC-003 | 选择状态筛选"待审核" | 列表重新加载，仅显示 pending_review 状态 |
| TC-004 | 搜索"批次号"关键字 | 列表重新加载，仅显示匹配项（注意：当前后端仅按 status 过滤，keyword 为前端占位） |
| TC-005 | 翻页 | pagination.page/pageSize 变化，列表刷新 |
| TC-006 | 点击批次号 | 打开详情抽屉 |
| TC-007 | 表格加载中 | Loading spinner 显示 |

### 3.2 Excel 上传功能

| 用例 | 操作 | 预期 |
|------|------|------|
| TC-101 | 拖拽 .xlsx 文件 | 显示上传中状态 |
| TC-102 | 上传成功 | 显示 4 个 Statistic：批次号/总人数/成功匹配/异常待审 |
| TC-103 | 上传失败 | 弹出错误提示 |
| TC-104 | 上传 .pdf 文件 | 拦截提示"不支持的文件类型" |
| TC-105 | 上传 > 50MB 文件 | 拦截提示"文件大小不能超过 50MB" |
| TC-106 | 关闭上传抽屉 | 抽屉关闭，上传结果清空 |
| TC-107 | 重新上传 | 结果重置 |

### 3.3 预览功能

| 用例 | 操作 | 预期 |
|------|------|------|
| TC-201 | 点击批次号 | 打开详情抽屉 |
| TC-202 | 顶部 6 个 Statistic 显示 | 总人数/已匹配/异常/跳过/规则版本/状态 |
| TC-203 | 加载待审记录表 | 列表加载 |
| TC-204 | 筛选"待审核"状态 | 仅显示 pending 记录 |
| TC-205 | 筛选"未知部门"异常类型 | 仅显示 unknown_dept 记录 |
| TC-206 | 点击"刷新"按钮 | 重新调用 preview/pending API |

### 3.4 异常审核功能

| 用例 | 操作 | 预期 |
|------|------|------|
| TC-301 | 点击待审行"审核"按钮 | 打开审核弹窗 |
| TC-302 | 选择"通过" | 显示目标组织/作业单元/岗位 ID 输入 |
| TC-303 | 选择"拒绝" | 不显示目标 ID 输入 |
| TC-304 | 提交通过 | 提示"已通过"，列表刷新 |
| TC-305 | 提交拒绝 | 提示"已拒绝"，列表刷新 |
| TC-306 | 关闭弹窗 | 弹窗关闭 |
| TC-307 | 点击"批量通过" | 仅通过有 target_org_id 的 pending 记录 |
| TC-308 | 批量通过 0 条 | 提示"没有可批量通过的记录" |

### 3.5 确认入库功能

| 用例 | 操作 | 预期 |
|------|------|------|
| TC-401 | 点击"确认入库" | 弹出确认弹窗 |
| TC-402 | 确认入库 | 调用 executeImport API |
| TC-403 | 入库成功 | 入库结果 Modal 显示 success 状态 |
| TC-404 | 部分入库 | 入库结果 Modal 显示 warning 状态 + 失败记录 |
| TC-405 | 入库失败 | message.error 提示 |
| TC-406 | 重复入库 | 后端返回"该批次已入库完成" |

### 3.6 权限测试

| 用例 | 角色 | 预期 |
|------|------|------|
| TC-501 | admin | 可见"上传花名册"/"批量通过"/"确认入库"按钮 |
| TC-502 | safety_manager | 同 admin |
| TC-503 | 普通员工 | 看不到上述按钮，但能查看列表 |

---

## 四、后端修复验证

### 4.1 pending 表新增字段

```sql
-- 验证 SQL
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'employee_import_pending'
  AND column_name IN ('hire_date', 'is_driver', 'license_type');

-- 预期返回 3 行
```

### 4.2 入库字段写入

```sql
-- 验证 employee 写入
SELECT employee_code, name, name_encrypted, id_card, phone, source
FROM employee
WHERE source = 'excel_import'
ORDER BY created_at DESC LIMIT 5;

-- 验证 employee_assignment remark
SELECT employee_id, start_date, remark
FROM employee_assignment
WHERE remark LIKE 'is_driver=true%'
ORDER BY created_at DESC LIMIT 5;
```

### 4.3 auditLog 记录

```sql
-- 验证审计日志
SELECT module, action, username, ip, status_code, detail
FROM audit_log
WHERE module = 'employee_import_v2'
ORDER BY created_at DESC LIMIT 10;

-- 预期看到 3 类 action: upload / resolve_pending / import
```

---

## 五、端到端测试场景

### 场景 1：完整导入流程（100% 自动匹配）

1. 准备标准模板 Excel（10 行已知部门/岗位）
2. 上传 → successCount = 10, pendingCount = 0
3. 打开详情 → 顶部显示 10 / 10 / 0 / 0
4. 直接点击"确认入库" → insertedCount = 10, assignmentCount = 10
5. 列表状态变为"已入库"

### 场景 2：部分匹配 + 异常审核

1. 准备 Excel（10 行，其中 2 行未知部门）
2. 上传 → successCount = 8, pendingCount = 2
3. 打开详情 → 筛选"待审核"，2 行
4. 点击"审核" → 选择"拒绝" + 备注 → 提交
5. 顶部 pendingCount 减少为 1
6. 继续处理 1 行 → 通过
7. pendingCount = 0
8. "确认入库" → 8 条入库

### 场景 3：身份证冲突

1. 准备 Excel（含 1 行身份证与系统已有员工相同）
2. 上传 → 1 条进入 pending（type=id_card_conflict）
3. 详情中显示冲突描述：`身份证冲突: 系统中已存在员工 XXX`
4. 审核时选择通过 → 仍能入库（系统会更新现有员工）
5. 或选择拒绝 → 跳过

---

## 六、已知问题与限制

| 序号 | 问题 | 风险 | 处理方式 |
|------|------|------|----------|
| 1 | 审核弹窗中 target_org_id/unit_id/pos_id 仅支持手动输入数字，未提供搜索选择器 | 中 | 后续扩展为 Ant Design AutoComplete + 后端搜索 API |
| 2 | 前端 searchForm.keyword 仅前端占位（后端仅按 status 过滤） | 低 | 后续后端扩展 keyword 查询 |
| 3 | 大批量入库（1300+行）同步处理，可能超时 | 中 | 后续改造为异步队列 + WebSocket 进度 |
| 4 | 缺少模板下载功能 | 中 | 后续在上传抽屉加"下载模板"按钮 |
| 5 | 失败记录无文件导出 | 低 | 后续增加"导出失败记录.xlsx" |
| 6 | 国际化为中文硬编码 | 低 | 与其他 HSE 模块保持一致，后续统一抽取 |

---

## 七、约束合规检查

| 约束 | 实现 | 状态 |
|------|------|------|
| 不修改 Vben 核心目录 | 未触碰 `packages/@core/` `packages/effects/` `packages/themes/` | ✅ |
| 不修改 auth/JWT | 未触碰 `auth/` 相关代码 | ✅ |
| 不新增 npm 依赖 | 全部使用现有 `ant-design-vue` `@vben/common-ui` `@vben/icons` `@vben/access` | ✅ |
| 不修改冻结数据模型 | employee/employee_assignment/hse_org_unit/hse_operation_unit/position 表结构未变 | ✅ |
| 不硬编码组织/岗位规则 | 全部走 employee_import_mapping_rule / employee_position_mapping_rule 配置表 | ✅ |
| 复用现有模式 | 复用 batch-import 路由结构、Api 命名空间、access 控制 | ✅ |
| 统一 employee_assignment | 导入流程所有任职关系都走 employee_assignment | ✅ |

---

## 八、测试结论

- **静态检查**：后端 JS 通过 `node -c`，前端待 `pnpm build` 时一并校验
- **SQL 兼容性**：`sprint5_6_employee_master_migration.sql` 增量字段已确认不影响已有索引
- **代码评审**：通过核心约束检查（见第七节）
- **集成测试**：需在测试环境执行完整流程验证（第三/四/五节）
- **E2E 测试**：建议按第五节 3 个场景执行

---

## 九、后续行动

1. 执行 `pnpm build` 校验前端 TS/Vue 编译
2. 测试环境执行 SQL 迁移（已包含新增 3 字段）
3. 启动后端 + 前端，按第三/四/五节执行完整测试
4. 修复测试中发现的问题
5. 补充缺失功能（模板下载 / 失败导出 / 搜索后端支持）
