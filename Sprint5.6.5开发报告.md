# HSE Sprint5.6.5 员工花名册导入管理开发报告

## 一、任务概述

基于 Sprint5.6 完成的员工主数据后端导入 API，开发对应的前端管理页面。同时对后端进行 3 项同步修复。

**开发范围**：
- 前端：1 个管理页面（集成批次列表/Excel 上传/导入预览/异常审核/确认入库 5 个功能模块）
- 后端：3 项同步修复
  - `employee_import_pending` 增加 `hire_date / is_driver / license_type` 字段
  - 正式入库补充字段写入
  - upload/resolve/import 三处接入 auditLog

**核心原则**：
- 严格遵守冻结约束
- 复用现有 Vben 组件库 + useAccess + requestClient
- 最小化新增代码

---

## 二、前端开发交付物

### 2.1 API 接口层

**文件**：`apps/web-antd/src/api/hse/employee-import-v2.ts`

- 命名空间 `EmployeeImportV2Api` 定义完整 TS 类型
- 6 个 API 函数（对应后端 6 个接口）：
  - `uploadEmployeeRoster(file)` - 上传花名册
  - `getImportBatchList(params)` - 批次列表
  - `getBatchPreview(batchId)` - 批次预览
  - `getBatchPendingList(batchId, params)` - 待确认记录
  - `resolvePending(id, data)` - 审核
  - `executeImport(batchId)` - 正式入库

### 2.2 路由配置

**文件**：`apps/web-antd/src/router/routes/modules/hse-employee-import-v2.ts`

- 父路由：`/hse/employee-import-v2`（"员工花名册导入"）
- 子路由：`/hse/employee-import-v2/list`（"批次管理"）
- 权限：`authority: ['admin', 'safety_manager']`
- 图标：`lucide:file-spreadsheet`
- 菜单 order: 6

### 2.3 页面实现

**文件**：`apps/web-antd/src/views/hse/employee-import-v2/index.vue`

**页面结构**（5 个功能集成）：

#### (1) 批次列表
- 表格列：批次号 / 文件名称 / 规则版本 / 总人数 / 已匹配 / 异常 / 跳过 / 状态 / 操作人 / 导入时间 / 操作
- 分页：默认 20/页，可调
- 筛选：批次状态下拉、批次号/文件名搜索
- 状态颜色：默认/已上传/待审核(cyan)/已入库(success)/部分入库(warning)/失败(error)
- 行内操作：批次号链接 → 打开详情抽屉；详情按钮

#### (2) Excel 上传抽屉
- 使用 `Upload.Dragger` 拖拽上传
- 文件类型校验：.xlsx / .xls
- 文件大小限制：50MB
- 拖拽后立即调用 `uploadEmployeeRoster`
- 成功响应展示 4 个 Statistic：批次号 / 总人数 / 成功匹配 / 异常待审
- 上传后自动刷新列表

#### (3) 批次详情抽屉
- 顶部 6 个 Statistic 概览：总人数/已匹配/异常/跳过/规则版本/状态
- 操作栏：刷新、批量通过、确认入库
- 筛选：待审状态下拉、异常类型下拉
- 待审记录表（11 列）：Excel行/员工编号/姓名/所属部门/职位/班组/匹配状态/描述/状态/规则版本/操作
- 异常类型颜色：自动匹配(green) / 字段缺失(warning) / 未知部门/岗位/冲突类(error)
- 行内"审核"按钮（仅 pending 状态显示）

#### (4) 异常审核弹窗
- 显示员工信息 + 异常描述 Alert
- 决议选择：通过 / 拒绝
- 通过时显示目标组织/作业单元/岗位 ID 输入框（当前版本简化，可后续扩展为带搜索的 Select）
- 备注文本域
- 调用 `resolvePending`

#### (5) 批量通过
- 一键通过所有"已匹配组织/岗位"的 pending 记录
- 弹窗确认 → 循环调用 resolvePending → 反馈通过数量

#### (6) 确认入库
- 弹窗确认 → 调用 `executeImport`
- 入库结果 Modal：成功/部分成功状态 + 详细计数（总数/新增/更新/任职关系/失败）
- 失败记录列表展示

**交互流程**：
```
首页 → 点击"上传花名册" → 拖拽文件 → 上传抽屉展示解析结果
首页 → 点击批次号 → 详情抽屉 → 筛选待审 → 审核或批量通过 → 确认入库 → 入库结果
```

### 2.4 权限控制

- 上传/审核/入库按钮通过 `useAccess` + `hasAccessByRoles(['admin', 'safety_manager'])` 控制
- 路由 meta.authority: `['admin', 'safety_manager']`

---

## 三、后端同步修复

### 3.1 employee_import_pending 表新增字段

**文件**：`server/sql/sprint5_6_employee_master_migration.sql`

```sql
-- 新增 3 个字段（pending 表不在冻结之列）
raw_team        VARCHAR(128),  -- 原有
hire_date       DATE,            -- 新增
is_driver       BOOLEAN,         -- 新增
license_type    VARCHAR(32),     -- 新增
```

**注**：`rule_version` 字段在 Sprint5.6 已建，无需重复添加。

### 3.2 正式入库补充字段

**文件**：`server/routes/hse-employee-import-v2.js`

调整后 `INSERT employee`：
- 增加 `id_card` 加密存储（v59 已有 `id_card VARCHAR(128)` 加密字段）
- `phone` 加密存储（v59 已有 `phone VARCHAR(128)` 加密字段）
- `name_encrypted` 加密姓名
- 增加 `inferPersonType()` 函数根据部门/岗位推断 person_type

调整后 `INSERT employee_assignment`：
- `start_date = COALESCE(p.hire_date, CURRENT_DATE)`
- `remark` 字段记录 driver/license_type 元信息（格式：`is_driver=true;license_type=B2`）
- 旧主岗自动 `is_current=false, end_date=CURRENT_DATE`

### 3.3 接入 auditLog

**文件**：`server/routes/hse-employee-import-v2.js`

三处操作调用 `auditLog`：

| 位置 | action | 关键字段 |
|------|--------|----------|
| upload | `upload` | fileName, batchNo, batchId, totalCount, successCount, pendingCount, skippedCount, ruleVersion |
| resolvePending | `resolve_pending` | pendingId, batchId, resolution, targetOrgId, targetUnitId, targetPosId, remark |
| import | `import` | batchId, total, insertedCount, updatedCount, assignmentCount, failedCount, errors |

每个调用都包裹在 try-catch 中，审计失败不影响主流程。

---

## 四、修改文件清单

| 序号 | 文件路径 | 操作 | 说明 |
|------|----------|------|------|
| 1 | `apps/web-antd/src/api/hse/employee-import-v2.ts` | 新增 | 6 个 API + TS 类型 |
| 2 | `apps/web-antd/src/router/routes/modules/hse-employee-import-v2.ts` | 新增 | 路由配置 |
| 3 | `apps/web-antd/src/views/hse/employee-import-v2/index.vue` | 新增 | 集成 5 个功能的主页面 |
| 4 | `server/sql/sprint5_6_employee_master_migration.sql` | 修改 | pending 表新增 3 字段 |
| 5 | `server/routes/hse-employee-import-v2.js` | 修改 | 入库字段补充 + auditLog + inferPersonType |

**未修改的文件（符合冻结约束）**：
- `apps/web-antd/src/` 现有所有模块
- `packages/@core/*`、`packages/effects/*`、`packages/themes/*`（Vben核心）
- `auth/` 下所有登录/JWT相关代码
- `employee`、`employee_assignment`、`hse_org_unit`、`hse_operation_unit`、`position` 表结构
- 无新增 npm 依赖

---

## 五、技术要点

### 5.1 TSX 渲染
- 表格列、Tag、Tooltip 等使用 `tsx` 渲染
- 与现有 `batch-import` 模块保持一致风格

### 5.2 状态管理
- 全部使用 `ref` / `reactive`，未引入新 store
- 抽屉/弹窗可见性用 `ref<boolean>` 模式

### 5.3 文件上传
- `Upload.Dragger` + `customRequest` 拦截自动上传，手动调用 API
- `beforeUpload` 做白名单校验返回 `Upload.LIST_IGNORE`

### 5.4 错误处理
- 全部 API 调用 `try-catch` + `message.error(e.message)`
- 批量通过单条失败不影响其他记录

---

## 六、待办与后续工作

1. **审核目标选择器扩展**：当前通过/拒绝弹窗中的 target_org_id/unit_id/pos_id 是简化版（仅输入ID），后续应扩展为带搜索的 Select 控件
2. **国际化**：当前文案均为中文硬编码（项目内其他 HSE 模块也未启用 i18n），可后续统一抽取
3. **批量入库存档导出**：导出失败记录供排查
4. **删除/重置批次**：当前不支持删除批次，仅在 is_deleted 上隐式删除

---

## 七、交付确认

- [x] API 接口层
- [x] 路由配置
- [x] 批次列表页面
- [x] Excel 上传抽屉
- [x] 批次详情/预览抽屉
- [x] 异常审核弹窗
- [x] 批量通过功能
- [x] 确认入库功能
- [x] 后端 pending 表字段扩展
- [x] 后端入库字段补充
- [x] 后端 auditLog 接入
- [x] 开发报告
- [x] 测试报告
