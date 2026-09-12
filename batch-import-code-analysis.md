# HSE V2.0 批量导入中心 - 现有代码扫描分析

> 文档类型：代码扫描分析报告（不包含编码实现）
> 日期：2026-07-19
> 扫描范围：文件中心、AI 分析中心、标准条款中心、报告中心
> 目的：为批量导入中心设计提供现有代码基础分析

---

## 一、现有上传流程分析

### 1.1 文件上传完整链路

```
HTTP 请求
  │
  ▼
server/middleware/upload.js
  ├─ createUploader({ type, subDir, maxSize, fieldName, multiple, maxCount })
  │    ├─ createStorage(subDir) → multer.diskStorage
  │    │    ├─ destination: server/uploads/{subDir}/
  │    │    └─ filename: {timestamp}_{9位随机base36}{扩展名}
  │    ├─ createFileFilter(type) → 扩展名白名单 + MIME 白名单
  │    └─ 返回 { single, array, fields, any, _multer }
  │
  ├─ validateUploadedFile(file, expectedType)
  │    └─ 读取前 16 字节进行魔术字节比对（PDF/Excel/Word/Image）
  │
  └─ 预设上传器：uploadExcel / uploadImage / uploadDocument / uploadInsurance / uploadHazard
       │
       ▼
server/routes/hse-documents.js
  ├─ POST /api/hse/documents/upload
  │    ├─ documentUploader.single('file')  ← 单文件上传
  │    ├─ 魔术字节校验 validateUploadedFile
  │    ├─ 解析 FormData 文本字段（categoryId/summary/validStartDate/...）
  │    └─ 调用 documentService.uploadFile(file, extra, user, req)
  │
  └─ 其他 18 个端点（列表/详情/下载/审核/AI 分析等）
       │
       ▼
server/services/documentService.js
  ├─ uploadFile(file, extra, user, req)
  │    ├─ 生成 fileUuid = uuid.v4()
  │    ├─ 生成 fileUrl = {protocol}://{host}/uploads/documents/{filename}
  │    ├─ 根据扩展名推断 fileType（pdf/word/excel/image/video/other）
  │    └─ INSERT INTO document_files (...) RETURNING *
  │
  └─ 其他方法：getFileList / getFileDetail / softDeleteFile / updateFile /
              downloadFile / reviewFile / syncLatestAnalysis 等
```

### 1.2 现有上传能力参数

| 参数 | 当前值 | 位置 |
|------|--------|------|
| 存储根目录 | `server/uploads/` | upload.js L80 |
| 单文件大小限制 | 10 MB | upload.js L81 |
| 文件名字段 | `file`（单文件） | hse-documents.js L47 |
| 上传模式 | `single('file')` 仅单文件 | hse-documents.js L47 |
| 类型白名单 | `type: 'all'`（不限制） | hse-documents.js L42 |
| 存储子目录 | `documents` | hse-documents.js L42 |
| 权限 | 仅登录校验（无 requireRole） | hse-documents.js L47 |
| 魔术字节校验 | 支持（PDF/Excel/Word/Image） | upload.js L19-77 |

### 1.3 现有上传流程的关键限制

| 限制点 | 说明 | 影响 |
|--------|------|------|
| 仅支持单文件 | `upload.single('file')` | 无法一次接收 100+ 文件 |
| 文件大小 10MB | `maxSize: 10 * 1024 * 1024` | 不支持大型文档 |
| 无并发控制 | 无任务数限制 | 并发上传可能耗尽资源 |
| 无进度追踪 | HTTP 同步处理 | 大批量上传无进度反馈 |
| 无失败重试 | 失败需手动重新上传 | 批量场景效率低 |
| 无重复检测 | 不计算文件 hash | 可能重复导入相同文件 |
| 无操作日志 | 未记录到审计表 | 无法追溯导入历史 |

### 1.4 AI 分析流程（参考异步模式）

```
POST /api/hse/documents/:id/analyze
  │
  ▼
documentAiService.createAnalysisTask(fileId, triggeredBy)
  ├─ 检查重复任务（pending/processing）
  ├─ INSERT document_ai_analysis (status='pending')
  └─ startAnalysisAsync(fileId, analysisId)
       └─ setImmediate(() => runAnalysis(...))  ← 异步触发
            │
            ▼
       runAnalysis(fileId, analysisId)
            ├─ UPDATE status='processing', started_at=NOW()
            ├─ extractText(fileRow)
            │    ├─ Excel 全文解析（xlsx.readFile + sheet_to_csv）
            │    ├─ 元数据模式（降级）
            │    └─ 文件名模式（兜底）
            ├─ aiService.chat(prompt)  ← 调用 AI
            ├─ UPDATE status='completed' + AI 结果字段
            ├─ documentService.syncLatestAnalysis(fileId, analysis)
            └─ notificationService.createNotification（WS 推送）
            │
            └─（异常）UPDATE status='failed' + error_message + failed_at
```

**关键模式**：`setImmediate` 异步触发 + 状态机管理 + 前端轮询，与 Sprint2/3/4 一致。

### 1.5 标准条款导入流程

```
前端 ImportModal.vue
  ├─ accept=".json"（仅支持 JSON 文件）
  ├─ FileReader 读取 + JSON.parse
  └─ importClauses(previewData) → POST /api/hse/standard/import
       │
       ▼
server/routes/hse-standard.js L161-L174
  ├─ requireRole('admin', 'safety_manager')
  ├─ 接收 { clauses: [...] } JSON body
  └─ standardService.batchImportClauses(clauses, user)
       │
       ▼
server/services/standardService.js L335-L362
  ├─ 逐条调用 createClause(clauses[i], user)
  ├─ 失败累计到 errors 数组（失败隔离）
  ├─ 无事务包装（部分成功会持久化）
  └─ 返回 { total, success, failed, errors: [...] }
```

**关键发现**：`standardService.batchImportClauses` 接收的是 **JSON 数组**，不包含 Excel 解析逻辑。Excel 解析需在调用方完成。

---

## 二、可复用 Service 分析

### 2.1 documentService（文件上传 Service）

**文件**：[server/services/documentService.js](file:///f:/deploy/hse-dashboard/server/services/documentService.js)

| 方法 | 行号 | 可复用性 | 说明 |
|------|------|---------|------|
| `uploadFile(file, extra, user, req)` | L97-L152 | ✅ 直接复用 | 批量导入的核心：写入 document_files |
| `getFileList(params)` | L155-L228 | ⚠️ 部分复用 | 可参考分页+筛选逻辑 |
| `getFileDetail(id)` | L233-L258 | ✅ 直接复用 | 查询文件详情 |
| `softDeleteFile(id)` | L263-L270 | ✅ 直接复用 | 软删除文件 |
| `updateFile(id, data)` | L275-L309 | ✅ 直接复用 | 更新文件信息 |
| `downloadFile(req, res, id)` | L314-L334 | ✅ 直接复用 | 流式下载 |
| `reviewFile(id, data, user)` | L342-L376 | ✅ 直接复用 | 文件审核 |
| `getCategoryTree()` | L385-L413 | ✅ 直接复用 | 分类树查询 |
| `getFileStats()` | L524-L562 | ✅ 直接复用 | 统计数据 |
| `syncLatestAnalysis(fileId, analysis)` | L573-L600 | ✅ 直接复用 | AI 结果同步 |
| `camelRow(row)` | L30-L66 | ✅ 直接复用 | DB 行转驼峰 |
| `calcValidStatus(...)` | L72-L81 | ✅ 直接复用 | 有效期计算 |
| `formatFileSize(bytes)` | L86-L91 | ✅ 直接复用 | 文件大小格式化 |

**复用方式**：批量导入中心在 `_dispatchToBusiness` 中直接调用 `documentService.uploadFile`，传入批量任务中的每个文件。

### 2.2 upload 中间件

**文件**：[server/middleware/upload.js](file:///f:/deploy/hse-dashboard/server/middleware/upload.js)

| 能力 | 行号 | 可复用性 | 说明 |
|------|------|---------|------|
| `createUploader(options)` | L183-L211 | ✅ 直接复用 | 支持 `array(field, count)` 多文件模式 |
| `createFileFilter(type)` | L150-L168 | ✅ 直接复用 | 扩展名 + MIME 双重校验 |
| `validateUploadedFile(file, type)` | L171-L181 | ✅ 直接复用 | 魔术字节校验 |
| `createStorage(subDir)` | L133-L148 | ✅ 直接复用 | 磁盘存储引擎 |
| `getFileUrl(req, filename, subDir)` | L219-L222 | ✅ 直接复用 | URL 生成 |
| `getFilePath(filename, subDir)` | L224-L226 | ✅ 直接复用 | 路径生成 |
| `deleteFile(filePath)` | L228 | ✅ 直接复用 | 物理删除文件 |
| `ensureDir(dir)` | L126-L128 | ✅ 直接复用 | 目录创建 |
| `fixFilenameEncoding(name)` | L7-L17 | ✅ 直接复用 | 中文文件名编码修复 |

**关键复用点**：批量导入可使用 `createUploader({ type: 'all', subDir: 'batch-import', maxSize: 100MB }).array('files', 500)` 接收多文件。

### 2.3 documentAiService（AI 分析 Service）

**文件**：[server/services/documentAiService.js](file:///f:/deploy/hse-dashboard/server/services/documentAiService.js)

| 方法 | 行号 | 可复用性 | 说明 |
|------|------|---------|------|
| `createAnalysisTask(fileId, triggeredBy)` | L29-L51 | ✅ 参考模式 | 异步任务创建模式 |
| `startAnalysisAsync(fileId, analysisId)` | L53-L59 | ✅ 参考模式 | setImmediate 异步触发 |
| `runAnalysis(fileId, analysisId)` | L61-L171 | ✅ 参考模式 | 状态机管理（pending→processing→completed/failed） |
| `extractText(fileRow)` | L173-L223 | ✅ 参考模式 | 三级降级策略 |
| `retryAnalysis(fileId, analysisId, triggeredBy)` | L433-L444 | ✅ 参考模式 | 重试机制 |

**复用方式**：批量导入中心**不直接调用** AI 分析，但参考其异步处理模式（setImmediate + 状态机 + 轮询）。

### 2.4 standardService（标准条款 Service）

**文件**：[server/services/standardService.js](file:///f:/deploy/hse-dashboard/server/services/standardService.js)

| 方法 | 行号 | 可复用性 | 说明 |
|------|------|---------|------|
| `batchImportClauses(clauses, user)` | L335-L362 | ✅ 直接复用 | 批量导入条款（JSON 数组） |
| `createClause(data, user)` | L162-L211 | ✅ 直接复用 | 单条条款创建 |
| `exportClauses()` | L367-L374 | ✅ 直接复用 | 导出 JSON |
| `getClauseTree(options)` | L81-L99 | ✅ 直接复用 | 三级条款树 |
| `getClauseStats()` | L383-L410 | ✅ 直接复用 | 条款统计 |
| `buildTree(rows, opts)` | L45-L70 | ✅ 直接复用 | 通用树构建 |

**复用方式**：批量导入条款时，在 `_dispatchToBusiness` 中先解析 Excel 为 JSON 数组，再调用 `standardService.batchImportClauses`。

### 2.5 notificationService（通知 Service）

**文件**：[server/services/notificationService.js](file:///f:/deploy/hse-dashboard/server/services/notificationService.js)

| 方法 | 行号 | 可复用性 | 说明 |
|------|------|---------|------|
| `createNotification({ userId, title, content, type, bizType, bizId, pushWs })` | L9-L46 | ✅ 直接复用 | 通知 + WS 推送 |

**复用方式**：批量导入任务完成时调用，`type='system'`，`bizType='batch_import'`。

### 2.6 response 中间件

**文件**：[server/middleware/response.js](file:///f:/deploy/hse-dashboard/server/middleware/response.js)

| 能力 | 可复用性 | 说明 |
|------|---------|------|
| `success(data, msg)` | ✅ 直接复用 | 统一成功响应 |
| `error(code, msg)` | ✅ 直接复用 | 统一错误响应 |

### 2.7 auth 中间件

**文件**：[server/middleware/auth.js](file:///f:/deploy/hse-dashboard/server/middleware/auth.js)

| 能力 | 行号 | 可复用性 | 说明 |
|------|------|---------|------|
| `requireRole(...allowedRoles)` | L201-L218 | ✅ 直接复用 | 角色权限校验 |

---

## 三、需要新增 Service

### 3.1 新增文件清单

| 文件路径 | 类型 | 说明 |
|---------|------|------|
| `server/services/batchImportService.js` | 新增 | 批量导入核心服务 |
| `server/routes/hse-batch-import.js` | 新增 | 批量导入路由 |
| `server/sql/hse_batch_import_v58_migration.sql` | 新增 | 数据库迁移（v58） |
| `server/test/sprint5-batch-import-test.js` | 新增 | 单元测试 |
| `server/data/templates/` | 新增 | 导入模板文件目录 |

### 3.2 batchImportService.js 方法清单

| 方法 | 职责 | 复用关系 |
|------|------|---------|
| `createTask({ importType, enterpriseId, departmentId, businessScope, files, createdBy })` | 创建批量导入任务 | 复用 `_checkConcurrentTaskLimit` |
| `processTask(taskId)` | 异步处理任务 | 复用 `setImmediate` 模式 |
| `processItem(itemId)` | 处理单个文件 | 复用 `_validateFile` + `_checkDuplicate` + `_dispatchToBusiness` |
| `retryItem(itemId, operator)` | 失败重试 | 复用 `setImmediate` 模式 |
| `cancelTask(taskId, operator)` | 取消任务 | - |
| `listTasks({ page, pageSize, ...filters })` | 任务列表 | 参考documentService.getFileList |
| `getTaskDetail(taskId)` | 任务详情 | - |
| `getTaskProgress(taskId)` | 任务进度（轻量） | - |
| `listTaskItems({ taskId, status, page, pageSize })` | 明细列表 | - |
| `exportTaskResult(taskId)` | 导出结果报表 | 复用 `xlsx` 库 |
| `getTemplate(type)` | 获取导入模板 | - |
| `_generateTaskNo()` | 生成任务编号 | - |
| `_calculateFileHash(filePath)` | 计算 SHA-256 | 复用 Node.js `crypto` |
| `_validateFile(file, importType)` | 文件校验 | 复用 `upload.validateUploadedFile` |
| `_checkDuplicate(fileHash, importType)` | 重复检测 | - |
| `_dispatchToBusiness(item, importType, ...)` | 业务分发 | 复用 `documentService.uploadFile` / `standardService.batchImportClauses` |
| `_updateTaskProgress(taskId)` | 更新进度 | - |
| `_buildResultSummary(taskId)` | 生成结果汇总 | - |
| `_notifyTaskCompletion(task)` | 发送通知 | 复用 `notificationService.createNotification` |
| `_writeOperationLog(...)` | 写入操作日志 | 复用 `sys_operation_log` 表 |
| `_checkConcurrentTaskLimit()` | 检查并发任务数 | - |

### 3.3 业务分发逻辑

```javascript
// _dispatchToBusiness 分发策略（伪代码，不实现）
case 'document':
  → documentService.uploadFile(file, extra, user, req)
  → 返回 { fileId }

case 'standard_clause':
  → 读取 Excel（xlsx 库） → 解析为 clauses 数组
  → standardService.batchImportClauses(clauses, user)
  → 返回 { insertedCount, clauseIds: [] }

case 'safety_record':
  → MVP 暂不实现，留作扩展点
```

---

## 四、数据库影响分析

### 4.1 现有表结构（不修改）

#### document_files 表

**定义位置**：[sql/v2_document_tables.sql](file:///f:/deploy/hse-dashboard/sql/v2_document_tables.sql) L59-94

| 关键字段 | 类型 | 说明 |
|---------|------|------|
| id | BIGSERIAL | 主键 |
| file_uuid | VARCHAR(36) | UUID 唯一索引 |
| original_name | VARCHAR(256) | 原始文件名 |
| storage_name | VARCHAR(128) | 存储文件名 |
| file_path | VARCHAR(512) | 文件路径 |
| file_url | VARCHAR(512) | 访问 URL |
| file_size | BIGINT | 文件大小 |
| file_type | VARCHAR(32) | 文件类型 |
| mime_type | VARCHAR(128) | MIME 类型 |
| category_id | BIGINT | 分类 ID（外键） |
| source_type | VARCHAR(32) | 来源类型（upload/import/system/sync） |
| review_status | VARCHAR(16) | 审核状态（pending/approved/rejected） |
| analysis_status | VARCHAR(16) | 分析状态（pending/analyzing/completed/failed） |
| status | VARCHAR(16) | 状态（active/inactive） |
| uploaded_by | VARCHAR(64) | 上传人（username） |
| uploaded_at | TIMESTAMP | 上传时间 |
| metadata | JSONB | 元数据 |
| latest_ai_analysis_id | BIGINT | 最新 AI 分析 ID（扩展字段） |

**批量导入影响**：通过 `documentService.uploadFile` 写入，`source_type` 可设为 `'import'` 标识批量导入来源。

#### document_ai_analysis 表

**定义位置**：[server/sql/document_ai_analysis.sql](file:///f:/deploy/hse-dashboard/server/sql/document_ai_analysis.sql) L11-67

**批量导入影响**：**不直接操作**。AI 分析由 Sprint2 流程独立触发。

#### document_standard_relation 表

**定义位置**：[sql/v2_document_tables.sql](file:///f:/deploy/hse-dashboard/sql/v2_document_tables.sql) L155-168 + [server/sql/hse_standard_relation_v55_migration.sql](file:///f:/deploy/hse-dashboard/server/sql/hse_standard_relation_v55_migration.sql)

**批量导入影响**：**不直接操作**。资料-标准关联由 Sprint4 关联管理模块处理。

#### safety_standard_clauses 表

**定义位置**：[server/sql/hse_standard_v54_migration.sql](file:///f:/deploy/hse-dashboard/server/sql/hse_standard_v54_migration.sql) L18-37

**批量导入影响**：通过 `standardService.batchImportClauses` 写入。

#### sys_operation_log 表（重要修正）

**定义位置**：[server/sql/sys_operation_log.sql](file:///f:/deploy/hse-dashboard/server/sql/sys_operation_log.sql)

> **重要发现**：项目中**不存在** `hse_operation_logs` 表，实际审计日志表为 **`sys_operation_log`**。v1.1 设计文档中的 `hse_operation_logs` 需要修正为 `sys_operation_log`。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| user_id | INTEGER | 用户 ID |
| username | VARCHAR(100) | 用户名 |
| action | VARCHAR(50) | 操作类型（login/create/update/delete/export/import） |
| module | VARCHAR(100) | 模块（auth/users/vehicles/accidents/hazards） |
| description | TEXT | 描述 |
| ip_address | VARCHAR(50) | IP 地址 |
| user_agent | VARCHAR(500) | User-Agent |
| status_code | INTEGER | 状态码 |
| detail | JSONB | 详情 |
| created_at | TIMESTAMP WITH TIME ZONE | 创建时间 |

**批量导入影响**：复用此表记录操作日志，`module='batch_import'`，`action` 取值为 `create/start/retry/complete/cancel`。

### 4.2 新增表（增量迁移）

#### hse_batch_import_tasks 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 主键 |
| task_no | VARCHAR(32) | 任务编号（BI{yyyyMMdd}{3位序号}） |
| import_type | VARCHAR(32) | 导入类型（document/standard_clause/safety_record） |
| enterprise_id | BIGINT | 企业 ID（数据隔离） |
| department_id | BIGINT | 部门 ID（数据隔离） |
| business_scope | JSONB | 业务范围 |
| total_count | INTEGER | 总数量 |
| success_count | INTEGER | 成功数量 |
| fail_count | INTEGER | 失败数量 |
| pending_count | INTEGER | 待处理数量 |
| status | VARCHAR(20) | 任务状态（pending/processing/completed/failed/cancelled） |
| progress | INTEGER | 进度百分比 0-100 |
| file_storage_dir | VARCHAR(512) | 文件临时存储目录 |
| result_summary | JSONB | 结果汇总 |
| error_message | TEXT | 任务级错误信息 |
| created_by | VARCHAR(64) | 创建人 |
| created_at | TIMESTAMP | 创建时间 |
| started_at | TIMESTAMP | 开始处理时间 |
| completed_at | TIMESTAMP | 完成时间 |
| updated_at | TIMESTAMP | 更新时间 |
| is_deleted | BOOLEAN | 软删除 |

**索引**：task_no（唯一）、import_type、status、created_at、created_by、enterprise_id、department_id、(enterprise_id, department_id, status) 复合索引。

#### hse_batch_import_items 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 主键 |
| task_id | BIGINT | 关联任务 ID |
| seq_no | INTEGER | 文件序号 |
| original_name | VARCHAR(256) | 原始文件名 |
| storage_name | VARCHAR(128) | 存储文件名 |
| file_path | VARCHAR(512) | 文件路径 |
| file_size | BIGINT | 文件大小 |
| file_type | VARCHAR(32) | 文件扩展名 |
| mime_type | VARCHAR(128) | MIME 类型 |
| file_hash | VARCHAR(64) | SHA-256（重复检测） |
| status | VARCHAR(20) | 明细状态（pending/processing/success/failed/skipped/retrying） |
| target_table | VARCHAR(64) | 落库目标表 |
| target_id | BIGINT | 落库目标记录 ID（逻辑关联，无外键） |
| error_code | VARCHAR(32) | 错误码 |
| error_message | TEXT | 失败原因 |
| retry_count | INTEGER | 已重试次数 |
| max_retry | INTEGER | 最大重试次数（默认 3） |
| metadata | JSONB | 扩展元数据 |
| created_at | TIMESTAMP | 创建时间 |
| started_at | TIMESTAMP | 开始处理时间 |
| completed_at | TIMESTAMP | 完成时间 |
| updated_at | TIMESTAMP | 更新时间 |
| is_deleted | BOOLEAN | 软删除 |

**索引**：task_id、status、file_hash、(target_table, target_id)。

### 4.3 迁移版本号

- **当前最新版本**：v57（[hse_self_assessment_report_v57_migration.sql](file:///f:/deploy/hse-dashboard/server/sql/hse_self_assessment_report_v57_migration.sql)）
- **批量导入迁移版本**：**v58**（紧接 v57）
- **迁移规范**：IF NOT EXISTS + BEGIN/COMMIT，不修改已有表，不删除字段

---

## 五、API 设计

### 5.1 接口总览

所有接口挂载在 `/api/hse/batch-import` 前缀下。

| 方法 | 路径 | 说明 | 权限码 | 角色要求 |
|------|------|------|--------|---------|
| POST | `/tasks` | 创建批量导入任务（含文件接收） | `batch_import:create` | admin / safety_manager / group_admin |
| GET | `/tasks` | 任务列表（分页 + 筛选） | `batch_import:view` | 所有登录用户 |
| GET | `/tasks/:id` | 任务详情（含明细汇总） | `batch_import:view` | 所有登录用户 |
| GET | `/tasks/:id/progress` | 任务进度（轮询用，轻量） | `batch_import:view` | 所有登录用户 |
| GET | `/tasks/:id/items` | 任务明细列表（分页 + 状态筛选） | `batch_import:view` | 所有登录用户 |
| POST | `/items/:id/retry` | 失败明细重试 | `batch_import:retry` | admin / safety_manager / group_admin |
| POST | `/tasks/:id/cancel` | 取消任务 | `batch_import:create` | admin / safety_manager / group_admin |
| GET | `/tasks/:id/export` | 导出结果报表（Excel） | `batch_import:view` | 所有登录用户 |
| GET | `/templates/:type` | 下载导入模板（Excel） | `batch_import:view` | 所有登录用户 |

### 5.2 路由挂载

在 [server/app.js](file:///f:/deploy/hse-dashboard/server/app.js) 中挂载（参考现有 L354 的挂载方式）：

```javascript
// 伪代码（不实现）
const hseBatchImportRoutes = require('./routes/hse-batch-import');
app.use('/api/hse/batch-import', hseBatchImportRoutes);
```

### 5.3 权限校验实现

复用现有 `requireRole` 中间件（[server/middleware/auth.js](file:///f:/deploy/hse-dashboard/server/middleware/auth.js) L201-L218）：

```javascript
// 伪代码（不实现）
router.post('/tasks', requireRole('admin', 'safety_manager', 'group_admin'), async (req, res) => {
  // 创建任务
});

router.get('/tasks', requireRole('admin', 'safety_manager', 'safety_officer', 'group_admin'), async (req, res) => {
  // 列表查询（根据角色过滤数据）
});

router.post('/items/:id/retry', requireRole('admin', 'safety_manager', 'group_admin'), async (req, res) => {
  // 失败重试
});
```

### 5.4 创建任务接口

`POST /api/hse/batch-import/tasks`（multipart/form-data）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| importType | string | 是 | document / standard_clause / safety_record |
| enterpriseId | string | 否 | 企业 ID |
| departmentId | string | 否 | 部门 ID |
| businessScope | JSON string | 否 | 业务范围 |
| files | File[] | 是 | 多文件，字段名 `files`，最大 500 个 |

**multer 配置**（复用 createUploader）：

```javascript
// 伪代码（不实现）
const batchUploader = createUploader({
  type: 'all',
  subDir: 'batch-import',
  maxSize: 100 * 1024 * 1024,  // 100MB
  fieldName: 'files',
  multiple: true,
  maxCount: 500,
});

router.post('/tasks', requireRole(...), batchUploader.array('files', 500), async (req, res) => {
  // 创建任务
});
```

### 5.5 异步处理时序

```
前端                                后端
 │                                   │
 │  POST /tasks (files + metadata)   │
 │ ─────────────────────────────────▶│
 │                                   │  1. 并发任务数检查（≤3）
 │                                   │  2. 创建 task 记录
 │                                   │  3. 批量接收文件到 uploads/batch-import/{taskId}/
 │                                   │  4. 为每个文件创建 item 记录
 │                                   │  5. 写入操作日志（sys_operation_log）
 │                                   │  6. setImmediate(() => processTask(taskId))
 │  200 {taskId, total, status}      │
 │ ◀─────────────────────────────────│
 │                                   │  7. 后台 processTask：
 │                                   │     - 写入操作日志（start）
 │                                   │     - for each item: processItem
 │                                   │     - 校验 → 重复检测 → 调用业务 Service
 │                                   │     - 全部完成后 task.status=completed
 │                                   │     - 写入操作日志（complete）
 │                                   │     - 发送通知
 │                                   │
 │  GET /tasks/:id/progress (轮询)   │
 │ ─────────────────────────────────▶│
 │  200 {total, success, fail, ...}  │
 │ ◀─────────────────────────────────│
```

---

## 六、前端页面设计

### 6.1 目录结构

```
apps/web-antd/src/views/hse/batch-import/
  ├─ api.ts                       API 层（参考 views/hse/standard/api.ts 就近放置模式）
  ├─ types.ts                     TypeScript 类型定义
  ├─ index.vue                    批量导入中心列表页
  ├─ BatchImportDrawer.vue        批量导入抽屉（拖拽上传 + 进度）
  ├─ TaskDetailDrawer.vue         任务详情抽屉（明细 + 重试）
  └─ components/
       ├─ FileDropZone.vue        拖拽上传区域
       ├─ FileListTable.vue       文件列表表格
       ├─ ProgressPanel.vue       进度面板（环形+数字）
       ├─ ResultSummary.vue       结果统计卡片
       ├─ ItemRetryButton.vue     失败重试按钮
       └─ TemplateDownload.vue    模板下载按钮
```

### 6.2 现有前端模式参考

#### 资料中心列表页（参考模式）

**文件**：[apps/web-antd/src/views/hse/documents/library/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/documents/library/index.vue)

**关键模式**：
- 使用 `Page` 容器（@vben/common-ui）
- 顶部统计卡片（HseStatCard 组件）
- 左侧分类树（a-tree）+ 右侧表格（a-table）
- **未使用** `useVbenForm` / `useVbenVxeGrid`，直接使用 Ant Design Vue 原生组件
- 手写 `columns` 定义 + `queryParams` reactive + `pagination` reactive
- API 调用：`import { ... } from '#/api/hse/documents'`

#### 标准条款管理（参考模式）

**文件**：[apps/web-antd/src/views/hse/standard/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/standard/index.vue)

**关键模式**：
- 左树右详情布局（a-tree + a-descriptions）
- **在组件内使用** `useAccess().hasAccessByRoles(['admin', 'safety_manager'])` 控制按钮显隐
- API 文件就近放置：`views/hse/standard/api.ts`（非 `api/hse/` 公共目录）
- ImportModal 仅支持 JSON 格式（`accept=".json"`）

#### ImportModal 导入弹窗（参考模式）

**文件**：[apps/web-antd/src/views/hse/standard/components/ImportModal.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/standard/components/ImportModal.vue)

**关键模式**：
- `a-modal` + `a-upload-dragger`（拖拽上传）
- `FileReader` 客户端读取 + `JSON.parse` 解析
- 预览前 5 条数据
- 提供"下载模板"功能（生成示例 JSON 文件）

### 6.3 批量导入前端设计要点

| 设计点 | 方案 | 参考来源 |
|--------|------|---------|
| 页面容器 | `Page`（@vben/common-ui） | documents/library |
| 统计卡片 | `HseStatCard`（#/components/hse/） | documents/library |
| 列表表格 | `a-table` + 手写 columns | documents/library |
| 筛选区域 | `a-select` + `a-input-search` | documents/library |
| 上传组件 | `a-upload-dragger`（Upload.Dragger） | standard/ImportModal |
| 进度展示 | `a-progress`（Progress 组件） | 新增 |
| 抽屉组件 | `useVbenDrawer` 或 `a-drawer` | documents/DocumentAiAnalysis |
| 表单配置 | `a-form` + `a-tree-select` + `a-date-picker` | documents/UploadModal |
| 状态标签 | `a-tag`（Tag 组件） | documents/library |
| 取消确认 | `a-popconfirm`（Popconfirm） | 项目规范 |
| 权限控制 | `useAccess().hasAccessByRoles(...)` | standard/index |
| API 层 | 就近放置 `api.ts` | standard/api.ts |
| i18n | `$t('hse.batchImport.*')` | 项目规范 |
| 路由 | `meta.authority` 数组格式 | hse-documents.ts |

### 6.4 路由规划

**文件**：[apps/web-antd/src/router/routes/modules/hse-batch-import.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/)（新增）

```typescript
// 伪代码（不实现）
const routes: RouteRecordRaw[] = [
  {
    path: '/hse/batch-import',
    name: 'HseBatchImport',
    component: () => import('#/views/hse/batch-import/index.vue'),
    meta: {
      title: '批量导入中心',
      icon: 'lucide:upload-cloud',
      authority: ['admin', 'safety_manager', 'group_admin'],  // 数组格式
      order: 50,
      keepAlive: true,
    },
  },
];
```

**路由规范**（从现有代码确认）：
- `authority` 必须为数组（如 `['admin']` 或 `['admin', 'safety_manager']`）
- `icon` 使用 `lucide:` 前缀
- 放入 `modules/` 目录即自动加载，无需修改 `router/routes/index.ts`
- `keepAlive: true` 启用缓存

### 6.5 i18n 规划

在 `locales/langs/zh-CN/hse.json` 新增 `batchImport` 模块：

```json
{
  "batchImport": {
    "title": "批量导入中心",
    "newTask": "新建批量导入",
    "downloadTemplate": "下载导入模板",
    "importType": {
      "document": "安全资料",
      "standard_clause": "标准条款",
      "safety_record": "安全记录"
    },
    "status": {
      "pending": "待处理",
      "processing": "处理中",
      "completed": "已完成",
      "failed": "已失败",
      "cancelled": "已取消"
    },
    "limit": {
      "maxFiles": "单次最多 500 个文件",
      "maxFileSize": "单个文件 ≤ 100MB",
      "maxTasks": "当前最多 3 个任务同时运行"
    }
  }
}
```

### 6.6 前端轮询策略

参考 DocumentAiAnalysis.vue 的轮询模式：

| 策略 | 说明 |
|------|------|
| 轮询间隔 | 2 秒 |
| 轮询接口 | `GET /tasks/:id/progress` |
| 停止条件 | status 为 completed / failed / cancelled |
| 单次响应 | < 50ms（仅查询汇总字段） |
| 组件销毁 | `onUnmounted` 时停止轮询 |

---

## 七、开发风险分析

### 7.1 技术风险

| 风险 | 等级 | 说明 | 缓解措施 |
|------|------|------|---------|
| 大文件上传超时 | 中 | 100MB 文件可能超过 nginx/proxy 超时 | 配置超时时间，前端提示 |
| 数据库连接耗尽 | 中 | 500 文件串行处理可能长时间占用连接 | 单任务串行 + 并发任务限制为 3 |
| 内存溢出（SHA-256） | 低 | 大文件 hash 计算可能内存溢出 | 使用流式读取计算 hash |
| multer 内存占用 | 中 | 500 文件同时接收可能内存压力大 | multer.diskStorage 磁盘存储 |
| Excel 解析性能 | 低 | 大 Excel 文件解析慢 | 使用 xlsx.readFile 流式解析 |

### 7.2 兼容性风险

| 风险 | 等级 | 说明 | 缓解措施 |
|------|------|------|---------|
| upload.js 字段名不一致 | 低 | `validateUploadedFile` 返回 `error` 字段，路由读取 `reason` | 批量导入路由正确读取 `error` 字段 |
| upload.js 魔术字节校验缺陷 | 中 | 无签名扩展名会抛 TypeError 被误判为非法 | 批量导入在 Service 层补充校验 |
| standardService 无事务 | 中 | 批量导入条款部分失败会持久化 | 接受部分成功模式，记录失败明细 |
| 操作日志表名不一致 | 高 | v1.1 设计文档中 `hse_operation_logs` 实际不存在 | **修正为 `sys_operation_log`** |
| 前端未使用 useVbenForm | 低 | 现有页面直接使用 Ant Design Vue 原生组件 | 批量导入保持一致风格 |

### 7.3 业务风险

| 风险 | 等级 | 说明 | 缓解措施 |
|------|------|------|---------|
| AI 分析干扰 | 低 | 批量导入可能误触发 AI 分析 | 严格隔离：批量导入仅写资料，不触发 AI |
| 权限越权访问 | 中 | 用户可能访问非本企业/部门任务 | Service 层强制校验 enterprise_id/department_id |
| 重复文件堆积 | 中 | 相同文件多次导入导致冗余 | SHA-256 重复检测，命中标记为 skipped |
| 并发任务资源竞争 | 中 | 多个批量任务同时运行影响系统 | 限制并发任务数为 3 |
| 导入模板版本管理 | 低 | 模板更新后旧模板不兼容 | 模板文件版本化命名 |

### 7.4 约束合规风险

| 约束 | 合规性 | 说明 |
|------|--------|------|
| 不修改 packages/@core/、effects/、themes/ | ✅ 合规 | 批量导入不涉及这些目录 |
| 不修改 auth / JWT / 登录逻辑 | ✅ 合规 | 复用现有 requireRole 中间件 |
| 不新增 npm 依赖 | ✅ 合规 | 复用 multer、xlsx、pg、crypto（内置） |
| 不创建 src/components/ | ✅ 合规 | 组件放 views/hse/batch-import/components/ |
| 不修改 upload.js 中间件 | ✅ 合规 | 复用 createUploader，不改动原文件 |
| 不修改现有业务路由 | ✅ 合规 | 通过调用现有 Service 方法集成 |
| 批量导入不负责 AI 分析 | ✅ 合规 | 仅写资料，AI 由 Sprint2 流程处理 |

---

## 八、关键修正点（相对于 v1.1 设计文档）

基于代码扫描结果，v1.1 设计文档需要以下修正：

| 修正项 | v1.1 设计文档 | 实际代码 | 修正建议 |
|--------|-------------|---------|---------|
| 操作日志表名 | `hse_operation_logs` | `sys_operation_log` | 修正为 `sys_operation_log` |
| 操作日志字段 | `operator, operation, target_type, target_id, detail` | `user_id, username, action, module, description, ip_address, user_agent, status_code, detail` | 修正字段名 |
| standardService Excel 解析 | 设计中提到"读取 Excel 文件" | 实际接收 JSON 数组，不含 Excel 解析 | 批量导入需自行实现 Excel 解析 |
| 前端组件 | 设计中提到 `useVbenForm` | 实际使用 Ant Design Vue 原生组件 | 保持一致，使用原生组件 |
| 前端 API 位置 | 设计中提到 `api/hse/batch-import.ts` | standard 模块就近放置在 `views/hse/standard/api.ts` | 建议就近放置 `views/hse/batch-import/api.ts` |
| 文件大小限制 | upload.js 默认 10MB | 需自定义 100MB | createUploader 传入 maxSize: 100MB |
| 上传权限 | hse-documents.js 上传接口无 requireRole | 批量导入需 requireRole | 路由层添加 requireRole |

---

## 九、总结

### 9.1 可行性评估

| 评估项 | 结论 | 说明 |
|--------|------|------|
| 技术可行性 | ✅ 可行 | 复用现有 upload/documentService/standardService/notificationService |
| 约束合规性 | ✅ 合规 | 不修改核心目录、auth、JWT，不新增依赖 |
| 架构一致性 | ✅ 一致 | 异步模式与 Sprint2/3/4 一致（setImmediate + 状态机 + 轮询） |
| 数据库影响 | ✅ 增量 | 仅新增 2 张表，不修改现有表 |
| 前端一致性 | ✅ 一致 | 复用现有组件和模式，保持风格统一 |

### 9.2 核心复用清单

| 复用对象 | 来源 | 用途 |
|---------|------|------|
| `createUploader` | upload.js | 多文件上传（array 模式，maxCount=500） |
| `validateUploadedFile` | upload.js | 魔术字节校验 |
| `documentService.uploadFile` | documentService.js | 资料落库 |
| `standardService.batchImportClauses` | standardService.js | 条款批量导入 |
| `notificationService.createNotification` | notificationService.js | 任务完成通知 |
| `requireRole` | auth.js | 权限校验 |
| `success` / `error` | response.js | 统一响应 |
| `setImmediate` 模式 | documentAiService.js | 异步处理 |
| `Page` / `HseStatCard` | 前端组件 | 页面容器和统计卡片 |
| `useAccess` | @vben/access | 前端权限控制 |
| `requestClient` | #/api/request | API 调用 |
| `xlsx` 库 | 现有依赖 | Excel 解析和生成 |
| `crypto` | Node.js 内置 | SHA-256 计算 |

### 9.3 下一步建议

1. **修正 v1.1 设计文档**：将 `hse_operation_logs` 修正为 `sys_operation_log`，调整字段映射
2. **确认 Excel 解析方案**：standardService 不含 Excel 解析，需在 batchImportService 中实现
3. **确认前端 API 位置**：建议就近放置在 `views/hse/batch-import/api.ts`
4. **确认并发控制实现**：使用数据库查询 `status='processing'` 的任务数
5. **进入编码阶段**：审核通过后按 Phase1→Phase6 顺序实施

---

**本文档仅为代码扫描分析，不包含编码实现。等待审核后进入编码阶段。**
