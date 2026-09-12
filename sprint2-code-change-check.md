# HSE V2 Sprint2 AI 分析开发 - 代码变更检查清单

> 日期：2026-07-19  
> 目的：编码前扫描现有代码，确认变更点和影响范围

---

## 1. 扫描范围

| 模块 | 文件路径 | 扫描结果 |
|------|---------|----------|
| AI 服务层 | [aiService.js](file:///f:/deploy/hse-dashboard/server/services/aiService.js) | ✅ 已扫描 |
| 文件服务层 | [documentService.js](file:///f:/deploy/hse-dashboard/server/services/documentService.js) | ✅ 已扫描 |
| 文件路由 | [hse-documents.js](file:///f:/deploy/hse-dashboard/server/routes/hse-documents.js) | ✅ 已扫描 |
| 通知服务 | [notificationService.js](file:///f:/deploy/hse-dashboard/server/services/notificationService.js) | ✅ 已扫描 |
| 数据库迁移 | [server/sql/](file:///f:/deploy/hse-dashboard/server/sql/) | ✅ 已扫描 |
| 前端 API | [documents.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/documents.ts) | ✅ 已扫描 |
| 前端页面 | [library/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/documents/library/index.vue) | ✅ 已扫描 |

---

## 2. 现有代码现状分析

### 2.1 aiService.js 现状

**位置**：`server/services/aiService.js`

**现有能力**：
- ✅ `chat(prompt, options)` — 非流式对话，带自动重试
- ✅ `chatStream(prompt, res, options)` — 流式对话（SSE）
- ✅ `initialize()` — 初始化并验证配置
- ✅ `isAvailable()` — 检查服务可用性
- ✅ `getProvider()` — 获取当前提供商
- ✅ `buildReportPrompt(templateName, data, customPrompt)` — 构建报告 Prompt
- ✅ `buildRCAPrompt(incidentData, customPrompt)` — 构建 RCA 分析 Prompt

**现有 Prompt 模板**（`PROMPT_TEMPLATES`）：
1. `report_hazard` — 隐患报告
2. `report_accident` — 事故报告
3. `report_training` — 培训报告
4. `report_patrol` — 巡检报告
5. `rca_analysis` — 5W1H 根因分析

**导出的模板常量**：
```javascript
TEMPLATES: {
  REPORT_HAZARD: 'report_hazard',
  REPORT_ACCIDENT: 'report_accident',
  REPORT_TRAINING: 'report_training',
  REPORT_PATROL: 'report_patrol',
  RCA_ANALYSIS: 'rca_analysis'
}
```

**需要新增**：
- `document_analysis` Prompt 模板（文档分析）
- 对应的 TEMPLATE 导出常量
- 注意：Prompt 中不使用"宁津环卫"，改为"环卫企业安全生产管理系统AI助手"

---

### 2.2 documentService.js 现状

**位置**：`server/services/documentService.js`

**document_files 表现有字段**（从 INSERT 语句推断）：

| 字段 | 类型 | 说明 | AI 相关 |
|------|------|------|---------|
| id | BIGSERIAL | 主键 | 否 |
| file_uuid | VARCHAR | 文件 UUID | 否 |
| original_name | VARCHAR | 原始文件名 | 否 |
| storage_name | VARCHAR | 存储文件名 | 否 |
| file_path | VARCHAR | 文件路径 | 否 |
| file_url | VARCHAR | 文件 URL | 否 |
| file_size | BIGINT | 文件大小 | 否 |
| file_type | VARCHAR | 文件类型 | 否 |
| mime_type | VARCHAR | MIME 类型 | 否 |
| category_id | BIGINT | 分类 ID | 否 |
| summary | TEXT | 摘要 | 否 |
| source_type | VARCHAR | 来源类型 | 否 |
| review_status | VARCHAR | 审核状态 | 否 |
| **analysis_status** | **VARCHAR** | **分析状态** | **是（缓存）** |
| valid_start_date | DATE | 有效期开始 | 否 |
| valid_end_date | DATE | 有效期结束 | 否 |
| remind_days | INTEGER | 提醒天数 | 否 |
| status | VARCHAR | 状态 | 否 |
| uploaded_by | VARCHAR | 上传人 | 否 |
| uploaded_at | TIMESTAMP | 上传时间 | 否 |
| metadata | JSONB | 元数据 | 否 |
| is_deleted | BOOLEAN | 软删除标记 | 否 |
| created_at | TIMESTAMP | 创建时间 | 否 |
| updated_at | TIMESTAMP | 更新时间 | 否 |

**camelRow 中的 AI 相关字段**：
```javascript
analysisStatus: row.analysis_status,
completenessScore: row.completeness_score,  // 数据库无此字段？需确认
riskLevel: row.risk_level,                   // 数据库无此字段？需确认
aiSummary: row.ai_summary,                   // 数据库无此字段？需确认
aiScore: row.ai_score,                       // 数据库无此字段？需确认
```

**✅ 数据库字段确认结果**（2026-07-19 实测）：

document_files 表现有 AI 相关字段：
- `analysis_status` — ✅ 已存在（varchar, NOT NULL）
- `completeness_score` — ✅ 已存在（numeric, NULL）
- `risk_level` — ✅ 已存在（varchar, NULL）
- `ai_summary` — ✅ 已存在（text, NULL）
- `ai_score` — ✅ 已存在（numeric, NULL）
- `content_text` — ✅ 已存在（text, NULL，全文缓存）

**本次需新增的字段**（document_files 表缓存字段）：
- `latest_ai_analysis_id` — ❌ 不存在，需新增（关联 document_ai_analysis.id）

**其他说明**：
- INSERT 语句中没有这些字段是因为它们有默认值或允许 NULL，上传时不填充
- 分析完成后通过 UPDATE 同步这些缓存字段

**现有方法**：
- `uploadFile()` — 文件上传
- `getFileList()` — 文件列表
- `getFileDetail()` — 文件详情
- `softDeleteFile()` — 软删除
- `updateFile()` — 更新文件
- `downloadFile()` — 下载
- `reviewFile()` — 审核
- `getCategoryTree()` — 分类树
- `createCategory()` — 创建分类
- `updateCategory()` — 更新分类
- `deleteCategory()` — 删除分类
- `getTagList()` — 标签列表
- `createTag()` — 创建标签
- `incrementTagUsage()` — 标签使用次数 +1
- `getFileStats()` — 文件统计

**本次需新增方法**：
- `updateLatestAnalysis(fileId, analysisData)` — 同步最新分析结果到 document_files 缓存

---

### 2.3 hse-documents.js 路由现状

**位置**：`server/routes/hse-documents.js`

**现有端点**（挂载路径：`/api/hse/documents`）：

| 方法 | 路径 | 功能 | 权限 |
|------|------|------|------|
| POST | `/upload` | 文件上传 | 登录用户 |
| GET | `/` | 文件列表 | 登录用户 |
| GET | `/stats` | 文件统计 | 登录用户 |
| GET | `/categories` | 分类树 | 登录用户 |
| POST | `/categories` | 创建分类 | admin/safety_manager |
| PUT | `/categories/:id` | 更新分类 | admin/safety_manager |
| DELETE | `/categories/:id` | 删除分类 | admin/safety_manager |
| GET | `/tags` | 标签列表 | 登录用户 |
| POST | `/tags` | 创建标签 | admin/safety_manager |
| GET | `/:id` | 文件详情 | 登录用户 |
| GET | `/:id/download` | 文件下载 | 登录用户 |
| PUT | `/:id` | 更新文件 | admin/safety_manager |
| DELETE | `/:id` | 软删除 | admin/safety_manager |
| POST | `/:id/review` | 文件审核 | admin/safety_manager |

**本次需新增端点**：

| 方法 | 路径 | 功能 | 权限 | Sprint2 |
|------|------|------|------|---------|
| POST | `/:id/analyze` | 触发 AI 分析 | admin/safety_manager | ✅ |
| GET | `/:id/analysis` | 获取最新分析结果 | 登录用户 | ✅ |
| GET | `/:id/analysis/history` | 分析历史列表 | 登录用户 | ✅ |
| GET | `/:id/analysis/:analysisId` | 指定分析详情 | 登录用户 | ✅ |
| POST | `/:id/analysis/:analysisId/retry` | 重试分析 | admin/safety_manager | ✅ |

---

### 2.4 notificationService.js 现状

**位置**：`server/services/notificationService.js`

**现有方法**：
- `createNotification({ userId, title, content, type, bizType, bizId, pushWs })` — 创建通知
- `createWorkflowTaskNotification(task, instance)` — 工作流任务通知

**支持的 type**：`system`（默认）、`workflow`

**本次是否使用**：
- ✅ 分析完成后可推送通知给触发人
- 新增 type: `document_ai_analysis`
- 新增 bizType: `document_analysis`

---

### 2.5 数据库迁移目录现状

**位置**：`server/sql/`

**现有迁移脚本**：

| 文件名 | 说明 |
|--------|------|
| `hse_core_v1_migration.sql` | HSE 数据基础层 v1 |
| `hse_chain_v42_migration.sql` | 供应链模块 |
| `hse_report_v52_migration.sql` | 报告模块 |
| `hse_statistics_v50_migration.sql` | 统计模块 |
| `hse_workflow_v43_migration.sql` | 工作流模块 |
| `regulations_v2_migration.sql` | 法规标准模块 |
| `ai_tables.sql` | AI 相关表 |
| `performance_indexes.sql` | 性能索引 |
| `sys_operation_log.sql` | 操作日志 |
| `visual_layout_migration.sql` | 可视化布局 |
| `seed_notifications_20260713.sql` | 通知种子数据 |
| `fix_missing_structures_20260713.sql` | 缺失结构修复 |

**⚠️ 重要发现**：
已存在 `ai_tables.sql` 文件，需要确认里面是否已经定义了 document_ai_analysis 表或其他 AI 表。

**本次需新增**：
- `document_ai_analysis.sql` — AI 分析任务表建表脚本
- 如果 document_files 缺少 ai_summary、ai_score、latest_ai_analysis_id 字段，则需 ALTER TABLE

---

### 2.6 前端 API 现状

**位置**：`安全看板vben/apps/web-antd/src/api/hse/documents.ts`

**现有类型定义**：
- `FileType` — 文件类型
- `ReviewStatus` — 审核状态
- `AnalysisStatus` — 分析状态（pending/analyzing/completed/failed）
- `ValidStatus` — 有效期状态
- `DocumentFile` — 文件记录类型
- `DocumentListParams` — 列表参数
- `DocumentListResult` — 列表响应
- `UploadExtra` — 上传附加字段
- `ReviewParams` — 审核参数
- `DocumentStats` — 统计数据
- `CategoryNode` — 分类节点
- `Tag` — 标签

**现有 API 函数**：
- `getDocumentList()` — 文件列表
- `getDocumentDetail()` — 文件详情
- `uploadDocument()` — 上传
- `updateDocument()` — 更新
- `deleteDocument()` — 删除
- `downloadDocument()` — 下载
- `reviewDocument()` — 审核
- `getDocumentStats()` — 统计
- `getCategoryTree()` — 分类树
- `createCategory()` — 创建分类
- `updateCategory()` — 更新分类
- `deleteCategory()` — 删除分类
- `getTagList()` — 标签列表
- `createTag()` — 创建标签

**本次需新增**：

类型：
- `AnalysisBasis` — 分析依据类型（full_text/metadata_only/filename_only）
- `AiRiskLevel` — 风险等级（low/medium/high/critical）
- `DocumentAiAnalysis` — AI 分析结果类型

API 函数：
- `analyzeDocument(id, params?)` — 触发分析
- `getDocumentAnalysis(id)` — 获取最新分析结果
- `getDocumentAnalysisHistory(id, params?)` — 历史列表
- `getDocumentAnalysisDetail(id, analysisId)` — 指定详情
- `retryDocumentAnalysis(id, analysisId)` — 重试

---

### 2.7 前端页面现状

**位置**：`安全看板vben/apps/web-antd/src/views/hse/documents/library/index.vue`

**现有结构**：
- 统计卡片（4 个）：文件总数、待审核、已通过、即将过期
- 左侧分类树
- 右侧文件列表（工具栏 + 表格）
- 上传弹窗（UploadModal 组件）
- 详情抽屉（a-drawer）

**表格现有列**：
- 文件名
- 审核状态
- 有效期状态
- 操作（下载 / 详情 / 删除）

**本次需新增**：

表格列：
- AI 评分（a-progress 环形）
- 风险等级（a-tag）
- 分析依据（a-tag）

操作列：
- AI 分析按钮

新增组件：
- `views/hse/documents/components/DocumentAiAnalysis.vue` — 分析结果抽屉

---

## 3. 本次编码新增字段确认

### 3.1 document_ai_analysis 表新增字段（相对最终设计）

根据最新指令，需额外增加：

| 字段 | 类型 | 说明 |
|------|------|------|
| `prompt_version` | VARCHAR | Prompt 模板版本号，用于追踪迭代 |
| `confirmed_status` | VARCHAR | 人工确认状态：unconfirmed / confirmed / rejected |
| `confirmed_by` | VARCHAR | 确认人 |
| `confirmed_at` | TIMESTAMP | 确认时间 |
| `failed_at` | TIMESTAMP | 失败时间（AI 失败时记录） |

### 3.2 document_files 表需确认字段

需要确认以下字段是否已存在：

| 字段 | 状态 | 处理方式 |
|------|------|----------|
| `analysis_status` | ✅ 确认存在 | 复用 |
| `ai_summary` | ❓ 待确认 | 不存在则新增 |
| `ai_score` | ❓ 待确认 | 不存在则新增 |
| `latest_ai_analysis_id` | ❌ 肯定不存在 | 新增 |
| `completeness_score` | ❓ 待确认 | camelRow 有引用但 INSERT 没有 |
| `risk_level` | ❓ 待确认 | camelRow 有引用但 INSERT 没有 |

---

## 4. 编码变更清单（最终确认版）

### 4.1 后端新增文件

| 文件 | 说明 |
|------|------|
| `server/sql/document_ai_analysis.sql` | AI 分析任务表建表脚本 + document_files ALTER |
| `server/services/documentAiService.js` | AI 分析业务逻辑服务层 |

### 4.2 后端修改文件

| 文件 | 改动内容 |
|------|----------|
| `server/services/aiService.js` | 新增 document_analysis Prompt 模板；修改系统提示为通用"环卫企业安全生产管理系统AI助手" |
| `server/services/documentService.js` | 新增 updateLatestAnalysis() 同步缓存方法 |
| `server/routes/hse-documents.js` | 新增 5 个 AI 分析相关路由 |

### 4.3 前端新增文件

| 文件 | 说明 |
|------|------|
| `安全看板vben/apps/web-antd/src/views/hse/documents/components/DocumentAiAnalysis.vue` | AI 分析结果抽屉组件（页面业务组件） |

### 4.4 前端修改文件

| 文件 | 改动内容 |
|------|----------|
| `安全看板vben/apps/web-antd/src/api/hse/documents.ts` | 新增 AI 分析类型和 API 函数 |
| `安全看板vben/apps/web-antd/src/views/hse/documents/library/index.vue` | 新增 AI 分析列、分析按钮、抽屉引用 |
| `安全看板vben/apps/web-antd/src/locales/langs/zh-CN/hse.json` | 新增 AI 分析相关翻译文案 |

### 4.5 总计

- 新增文件：**4 个**（1 SQL + 1 Service + 1 前端组件）
- 修改文件：**6 个**（3 后端 + 3 前端）

---

## 5. 待确认事项

### 5.1 数据库字段确认 ✅ 已确认

`document_files` 表 AI 相关字段实际情况（2026-07-19 实测）：

| 字段 | 状态 | 类型 |
|------|------|------|
| `analysis_status` | ✅ 已存在 | varchar |
| `completeness_score` | ✅ 已存在 | numeric |
| `risk_level` | ✅ 已存在 | varchar |
| `ai_summary` | ✅ 已存在 | text |
| `ai_score` | ✅ 已存在 | numeric |
| `content_text` | ✅ 已存在 | text（全文缓存） |
| `latest_ai_analysis_id` | ❌ 需新增 | bigint |

**本次只需新增 1 个字段**：`latest_ai_analysis_id`

### 5.2 ai_tables.sql 内容确认 ✅ 已确认

`server/sql/ai_tables.sql` 中仅有 `ai_generation_records` 表（通用 AI 生成记录表），与本次新增的 `document_ai_analysis` 表**无冲突**，各自独立。

### 5.3 Prompt 公司名称替换范围 ⚠️ 待确认

现有 5 个 Prompt 模板中均使用"宁津环卫 HSE 安全管理系统的 AI 助手"，是否需要全部替换为通用名称"环卫企业安全生产管理系统AI助手"？还是仅替换新增的 document_analysis 模板？

---

## 6. 编码约束检查清单

| 约束 | 状态 | 说明 |
|------|------|------|
| 不修改 packages/ | ✅ 符合 | 所有改动在业务层 |
| 不修改 auth/ | ✅ 符合 | 不改认证逻辑 |
| 不修改 JWT | ✅ 符合 | 不改 token 逻辑 |
| 不修改登录流程 | ✅ 符合 | 复用现有登录 |
| 不新增 npm 依赖 | ✅ 符合 | xlsx 已存在，无需新依赖 |
| 增量开发 | ✅ 符合 | 新表 + 新路由 + 新组件 |
| AI 只辅助不替代人工 | ✅ 符合 | 结果仅供参考 |
| 分析结果保存到 document_ai_analysis | ✅ 符合 | 详细数据独立表 |
| document_files 只存缓存 | ✅ 符合 | 最新结果冗余缓存 |
| 不做批量分析 | ✅ 符合 | Sprint2 仅单文件 |
| 不做模型管理 | ✅ 符合 | 数据库预留但不做界面 |
| 不做 Token 统计 | ✅ 符合 | 数据库预留但不做展示 |
