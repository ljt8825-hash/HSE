# HSE V2 Sprint4 编码前代码扫描报告

> 日期：2026-07-19  
> 目的：验证现有代码库状态，确认 Sprint4 设计方案与现有系统的兼容性，识别风险点  
> 扫描范围：数据库表结构、AI 服务层、路由、前端依赖与约束

---

## 一、数据库表实际结构

### 1.1 `document_standard_relation` — 资料标准关联表（Sprint1 预留）

**状态**：表存在，字段完整，零数据（预期，Sprint1 仅建表预留）

| 字段 | 实际类型 | 非空 | 默认值 | 设计预期 |
|------|---------|------|--------|---------|
| `id` | bigint | ✅ | nextval | ✅ 匹配 |
| `file_id` | bigint | ✅ | - | ✅ 匹配，外键关联 document_files |
| `clause_code` | varchar(64) | ✅ | - | ✅ 匹配 |
| `clause_name` | varchar(256) | ❌ 可空 | - | ✅ 匹配 |
| `match_type` | varchar(16) | ✅ | 'auto' | ✅ 匹配 |
| `match_confidence` | numeric | ❌ 可空 | - | ✅ 匹配 |
| `status` | varchar(16) | ✅ | 'valid' | ⚠ 注意：设计方案中 status 有 'pending'/'valid'/'invalid' 三态，需确认 varchar(16) 足够 |
| `verified_by` | varchar(64) | ❌ 可空 | - | ✅ 匹配 |
| `verified_at` | timestamp | ❌ 可空 | - | ✅ 匹配 |
| `remark` | varchar(512) | ❌ 可空 | - | ✅ 匹配 |
| `created_at` | timestamp | ✅ | CURRENT_TIMESTAMP | ✅ 匹配 |
| `is_deleted` | boolean | ✅ | false | ✅ 匹配 |

**索引**：
- `document_standard_relation_pkey` (id) — ✅
- `uk_doc_std_rel` (file_id, clause_code) 唯一索引 — ✅
- `idx_doc_std_rel_file` (file_id) — ✅
- `idx_doc_std_rel_code` (clause_code) — ✅

**约束**：
- 外键：`file_id → document_files(id)` — ✅
- **无 CHECK 约束**：`match_type` 和 `status` 没有 CHECK 约束，业务上需在应用层限制枚举值

**结论**：直接复用，无需修改表结构。

---

### 1.2 `document_ai_analysis` — AI 分析结果表（Sprint2）

**状态**：表存在，字段完整

| 关键字段 | 类型 | Sprint4 用途 |
|---------|------|-------------|
| `ai_summary` | text | 注入条款检查 Prompt 作为资料摘要 |
| `ai_suggestions` | jsonb | 格式 `[{standard, suggestion, level}]`，可直接用于辅助判定 |
| `ai_missing_items` | jsonb | 格式 `[{item, reason, priority}]`，可直接作为缺项分析补充 |
| `status` | varchar(20) | 过滤 completed 状态 |
| `file_id` | bigint | 与 document_files 关联 |

**索引**：
- `idx_ai_analysis_file_id` — ✅（用于 JOIN 查询）
- `idx_ai_analysis_status` — ✅

**结论**：只读引用，无需修改。AI 分析结果的数据结构与 Sprint4 设计预期完全兼容。

---

### 1.3 `hse_reports` — 报告表（Sprint3 扩展）

**状态**：表存在，Sprint3 新增字段全部就位

**关键字段（Sprint3 新增，Sprint4 复用）**：

| 字段 | 实际类型 | Sprint4 用途 |
|------|---------|-------------|
| `template_category` | varchar(30) | 新增 'self_assessment' 枚举值 |
| `generation_status` | varchar(20) | 复用：pending/collecting/ai_generating/completed/failed |
| `ai_status` | varchar(20) | 复用：none/pending/processing/completed/failed |
| `ai_summary` | text | 复用：自评报告 AI 摘要 |
| `ai_suggestions` | jsonb | 复用：整改建议列表 |
| `confirm_status` | varchar(20) | 复用：unconfirmed/confirmed/rejected |
| `source_data_ref` | jsonb | 存储 evaluation_task_id + 缺项分析快照 |
| `report_status` | varchar(20) | 复用：active/archived/deleted（软删除） |
| `report_scope` | jsonb | 可存评价范围 |
| `error_message` | text | 复用 |
| `version` | integer | 预留 |
| `parent_report_id` | bigint | 预留 |

**CHECK 约束**：
- `template_category_check`：当前枚举值 = `['statistical', 'monthly_report', 'group_report']`
  - ⚠ **需扩展**：新增 `'self_assessment'`
  - 修改方式：`ALTER TABLE ... DROP CONSTRAINT ... , ADD CONSTRAINT ... CHECK (template_category = ANY (ARRAY[...]))`
  - 风险：低，仅扩展枚举值，不影响已有数据

- `report_type_check`：`['daily', 'weekly', 'monthly', 'yearly']`
  - ⚠ **唯一约束冲突风险**：`unique_report_type_period` (report_type, report_period)
  - Sprint3 已用 "report_period + 时间戳后缀" 方案绕过此约束
  - Sprint4 自评报告的 `report_type` 用 `'monthly'`（映射），继续使用时间戳后缀方案

**索引**：
- `idx_hse_reports_template_category` — ✅（筛选自评报告）
- `idx_hse_reports_generation_status` — ✅
- `idx_hse_reports_confirm_status` — ✅
- `idx_hse_reports_report_status` — ✅

**结论**：需扩展 `template_category` 的 CHECK 约束，新增 `'self_assessment'`。其余字段全部复用，无需新增字段。

---

### 1.4 `hse_report_templates` — 报告模板表（Sprint3 扩展）

**状态**：表存在，Sprint3 新增字段就位

| 字段 | 实际类型 | Sprint4 用途 |
|------|---------|-------------|
| `template_category` | varchar(30) DEFAULT 'statistical' | 新增 'self_assessment' 模板 |
| `ai_enabled` | boolean DEFAULT false | 自评报告 ai_enabled = true |
| `section_config` | jsonb DEFAULT '[]' | 自评报告章节配置 |
| `prompt_template` | text | 预留，可存自定义 Prompt |
| `data_sources` | jsonb DEFAULT '[]' | 数据来源配置 |

**CHECK 约束**：
- `template_category_check`：当前 = `['statistical', 'monthly_report', 'group_report']`
  - ⚠ **需同步扩展**：新增 `'self_assessment'`

**现有模板数据**（6 条）：
- 4 条 V1 统计模板（daily/weekly/monthly/yearly，template_category = 'statistical'）
- 2 条 Sprint3 新增模板（monthly_report / group_report）

**结论**：需扩展 `template_category` CHECK 约束 + 插入 1 条自评报告模板。

---

## 二、AI 服务层能力扫描

### 2.1 `aiService.js` — AI 统一服务

**文件路径**：[server/services/aiService.js](file:///f:/deploy/hse-dashboard/server/services/aiService.js)

**PROMPT_TEMPLATES 现有 Key（8 个）**：

| Key | 用途 | 输出格式 |
|-----|------|---------|
| `report_hazard` | 隐患分析报告 | Markdown |
| `report_accident` | 事故分析报告 | Markdown |
| `report_training` | 培训效果分析报告 | Markdown |
| `report_patrol` | 巡检工作报告 | Markdown |
| `rca_analysis` | 5W1H 根因分析 | Markdown |
| `document_analysis` | 文档分析 | JSON |
| `report_monthly` | 安全生产月报（Sprint3） | JSON |
| `report_group` | 集团汇报材料（Sprint3） | JSON |

**Sprint4 需新增**：
- `standard_evaluation` — 单条款 AI 检查
- （可选）`self_assessment_report` — 自评报告整体 AI 摘要（或复用 report_monthly 模式）

**现有构建函数（module.exports）**：
- `buildReportPrompt(templateName, data, customPrompt)` — 通用报告 Prompt 构建
- `buildRCAPrompt(incidentData, customPrompt)`
- `buildDocumentAnalysisPrompt(docInfo, customPrompt)`
- `buildMonthlyReportPrompt(params, customPrompt)` — Sprint3 月报
- `buildGroupReportPrompt(params, customPrompt)` — Sprint3 集团汇报

**Sprint4 需新增导出**：
- `buildStandardEvaluationPrompt(params, customPrompt)` — 单条款检查 Prompt
- `TEMPLATES.STANDARD_EVALUATION` — 常量

**强约束模式**（可复用）：
Sprint3 的 `report_monthly` / `report_group` Prompt 开头已包含 7 条强约束规则（禁止编造、数字一致、有据可查、严格 JSON 等）。Sprint4 可直接复用此模式。

**AI 响应解析**（可复用）：
Sprint3 `_parseAiJsonResponse()` 已实现：
1. 剥离 ```json 代码块
2. 截取首尾 {} 之间内容
3. JSON.parse + 失败降级

**结论**：aiService.js 架构完善，Sprint4 只需新增 Prompt 模板和构建函数，约增加 80-120 行代码。

---

### 2.2 `documentAiService.js` — 资料 AI 分析业务编排

**文件路径**：[server/services/documentAiService.js](file:///f:/deploy/hse-dashboard/server/services/documentAiService.js)

**现有方法**：
- `createAnalysisTask(fileId, triggeredBy)` — 创建分析任务
- `startAnalysisAsync(fileId, analysisId, customPrompt)` — 异步触发
- `runAnalysis(fileId, analysisId, customPrompt)` — 执行分析
- `extractText(fileRow)` — 文本提取
- `getLatestAnalysis(fileId)` — 获取最新分析
- `getAnalysisDetail(fileId, analysisId)`
- `getAnalysisHistory(fileId, page, pageSize)`
- `retryAnalysis(fileId, analysisId, triggeredBy)`

**Sprint4 使用方式**：
- 只读调用 `getLatestAnalysis(fileId)` 获取资料 AI 分析结果
- 不需要修改此文件

**结论**：只读引用，无需修改。

---

### 2.3 `reportService.js` — 报告服务

**文件路径**：[server/services/reportService.js](file:///f:/deploy/hse-dashboard/server/services/reportService.js)

**V2 流程方法**（Sprint3 实现，Sprint4 复用）：
- `generateReportV2(params)` — 入口，异步触发生成
- `getReportStatus(id)` — 状态轮询
- `getReportListV2(params)` — 列表 + 筛选 + 分页
- `getReportByIdV2(id)` — 详情
- `updateReport(id, updates)` — 编辑
- `confirmReport(id, action, confirmedBy, remark)` — 确认/驳回
- `regenerateReport(id, regenerateAiOnly)` — 重新生成
- `archiveReport(id)` — 归档
- `exportHtml(id)` — HTML 导出
- `exportWord(id)` — Word 导出（HTML + .doc 格式，零依赖）

**内部方法（Sprint4 需扩展分支）**：
- `_collectStatistics(period, templateCategory)` — 需新增 `self_assessment` 分支
- `_findReferencedDocuments(templateCategory)` — 可新增 `self_assessment` 关键词
- `_generateAiContent(templateCategory, period, scope, statisticsData, referencedDocs)` — 需新增 `self_assessment` 分支
- `_generateV2Html(templateCategory, period, reportData)` — 需新增自评报告 HTML 模板
- `_categoryToReportType(templateCategory)` — 需新增 `self_assessment → monthly` 映射
- `_categoryToKeywords(templateCategory)` — 需新增 `self_assessment` 关键词

**降级策略**（已实现，可复用）：
- AI 失败不影响报告主体生成
- `ai_status = 'failed'`，AI 区域显示"暂无数据"

**结论**：Sprint4 通过在现有方法中新增 `self_assessment` 分支实现自评报告，增量开发，不破坏现有逻辑。

---

## 三、现有路由扫描

### 3.1 后端路由挂载（app.js）

**文件路径**：[server/app.js](file:///f:/deploy/hse-dashboard/server/app.js)

**现有 HSE 路由前缀**：

| 前缀 | 路由文件 | 说明 |
|------|---------|------|
| `/api/hse/file-records` | fileRecordsRoutes | 档案记录 |
| `/api/hse/alerts` | alertsRoutes | 告警 |
| `/api/hse/audit` | auditRoutes | 审核 |
| `/api/hse/workflow` | workflowRoutes | 工作流 |
| `/api/hse/notifications` | notificationsRoutes | 通知 |
| `/api/hse/events` | hseEventsRoutes | 事件 |
| `/api/hse/chain` | hseChainRoutes | 闭环 |
| `/api/hse/tasks` | hseTasksRoutes | 任务 |
| `/api/hse/statistics` | hseStatisticsRoutes | 统计 |
| `/api/hse/dashboard` | hseDashboardRoutes | 驾驶舱 |
| `/api/hse/report` | hseReportRoutes | 报告中心（Sprint3） |
| `/api/hse/bi` | biRoutes | BI |
| `/api/hse/ai` | aiRoutes + aiEnhancedRoutes | AI |
| `/api/hse/iot` | iotRoutes | IoT |
| `/api/hse/documents` | hseDocumentsRoutes | 资料中心（Sprint1） |

**Sprint4 路由前缀建议**：
- `/api/hse/standard` — 与现有命名风格一致
- 无冲突

**挂载位置**：
在 `app.js` 第 348 行（`app.use('/api/hse/documents', ...)`）之后新增 1 行：
```js
app.use('/api/hse/standard', standardRoutes);
```

**权限中间件**：
现有路由普遍使用 `requireRole('admin', 'safety_manager')` 中间件做权限控制，Sprint4 应保持一致。

---

### 3.2 `hse-documents.js` 路由端点

**文件路径**：[server/routes/hse-documents.js](file:///f:/deploy/hse-dashboard/server/routes/hse-documents.js)

**现有端点**（19 个）：

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/upload` | 文件上传 |
| GET | `/` | 文件列表 |
| GET | `/stats` | 统计 |
| GET | `/categories` | 分类树 |
| POST | `/categories` | 新增分类 |
| PUT | `/categories/:id` | 编辑分类 |
| DELETE | `/categories/:id` | 删除分类 |
| GET | `/tags` | 标签列表 |
| POST | `/tags` | 新增标签 |
| GET | `/:id` | 文件详情 |
| GET | `/:id/download` | 文件下载 |
| PUT | `/:id` | 更新文件 |
| DELETE | `/:id` | 软删除 |
| POST | `/:id/review` | 审核 |
| POST | `/:id/analyze` | AI 分析 |
| GET | `/:id/analysis` | 最新分析结果 |
| GET | `/:id/analysis/history` | 分析历史 |
| GET | `/:id/analysis/:aid` | 分析详情 |
| POST | `/:id/analysis/:aid/retry` | 重试分析 |

**无 "standard" / "clause" / "evaluation" 相关端点**，与 Sprint4 设计无冲突。

**Sprint4 调用关系**：
- 手动关联资料时，前端可能需要从资料中心选择文件
- 可直接调用 `GET /api/hse/documents/`（文件列表）+ 关键词筛选
- 不需要修改 hse-documents.js

---

### 3.3 `hse-report.js` 路由端点

Sprint3 已实现 V1 + V2 双版本，V2 共 12 个端点。

**与 Sprint4 的关系**：
- 自评报告通过 `POST /api/hse/report/v2/generate` 生成
- 前端轮询 `GET /api/hse/report/v2/:id/status`
- 列表/详情/导出/确认/归档 全部复用现有 V2 接口
- **不需要修改 hse-report.js**

---

## 四、Vben 约束与依赖检查

### 4.1 packages/ 目录（禁止修改）

**目录结构**：`安全看板vben/packages/@core/` 下包含：
- `base/` — 基础工具（design, icons, shared, typings）
- `composables/` — 组合式函数
- `preferences/` — 偏好设置
- `ui-kit/` — UI 组件库（form-ui, layout-ui, menu-ui, popup-ui, shadcn-ui）

**结论**：Sprint4 所有前端代码均在 `apps/web-antd/src/views/hse/standard/` 下，不触碰 packages/。✅

---

### 4.2 auth/ 与 JWT（禁止修改）

**后端认证相关文件**：
- `server/middleware/auth.js` — 认证中间件（JWT 验证）
- `server/routes/auth.js` — 认证路由（登录、刷新等）
- `server/schemas/auth.js` — 认证数据校验

**前端认证相关**：
- Vben 核心包中处理（`@vben/access`, `@vben/stores` 等）

**结论**：Sprint4 仅使用现有 `requireRole` 中间件做权限控制，不修改认证逻辑。✅

---

### 4.3 前端依赖检查（禁止新增 npm 依赖）

**apps/web-antd/package.json 现有依赖**：

| 依赖 | 用途 | Sprint4 是否需要 |
|------|------|----------------|
| `ant-design-vue` | UI 组件库 | ✅ 已有（树、表格、抽屉、进度条等） |
| `@vueuse/core` | Vue 组合式工具 | ✅ 已有 |
| `dayjs` | 日期处理 | ✅ 已有 |
| `vue-router` | 路由 | ✅ 已有 |
| `pinia` | 状态管理 | ✅ 已有 |
| `@vben/request` | HTTP 请求 | ✅ 已有 |
| `@vben/locales` | 国际化 | ✅ 已有 |
| `@vben/icons` | 图标（lucide 系列） | ✅ 已有 |
| `@vben/plugins` | 插件（含 echarts） | ✅ 已有 |

**图表库确认（已验证）**：
项目通过 `@vben/plugins/echarts` 引入了 echarts。
- 使用方式：`import { EchartsUI, useEcharts } from '@vben/plugins/echarts'`
- 现有使用：dashboard/analytics 下 5 个页面
- Sprint4 的 `GapAnalysisChart.vue` 可直接使用，**无需新增依赖**。

**结论**：基础依赖齐全，echarts 已通过 @vben 插件引入。✅ 不新增依赖。

---

### 4.4 前端路由约束

**自动加载机制**：
- `apps/web-antd/src/router/routes/index.ts` 中使用 `import.meta.glob('./modules/**/*.ts', { eager: true })` 自动加载
- 放入 `modules/` 目录的 .ts 文件会自动注册为路由
- **无需修改 index.ts**

**现有 HSE 路由模块（17 个）**：
`hse-accidents.ts`, `hse-advanced.ts`, `hse-center.ts`, `hse-documents.ts`, `hse-emergency.ts`, `hse-hazards.ts`, `hse-inspection.ts`, `hse-insurance.ts`, `hse-objectives.ts`, `hse-regulations.ts`, `hse-risk-control.ts`, `hse-security.ts`, `hse-system.ts`, `hse-training.ts`...

**Sprint4 新增路由文件**：
- `router/routes/modules/hse-standard.ts`
- 无命名冲突

**结论**：新增路由模块自动加载，不修改现有路由文件。✅

---

## 五、新增文件列表

### 5.1 后端（4 个新增 + 3 个修改）

#### 新增文件（4）

| 文件 | 说明 | 预估行数 |
|------|------|---------|
| `server/sql/hse_standard_v54_migration.sql` | 数据库迁移脚本 | ~300 行 |
| `server/services/standardService.js` | 评价中心核心服务 | ~800-1000 行 |
| `server/routes/hse-standard.js` | 22 个 API 路由 | ~350 行 |
| `server/test/sprint4-standard-test.js` | 后端测试脚本 | ~400 行 |

#### 修改文件（3）

| 文件 | 修改内容 | 修改量 |
|------|---------|--------|
| `server/services/aiService.js` | 新增 standard_evaluation Prompt + buildStandardEvaluationPrompt + TEMPLATES 常量 | ~100 行 |
| `server/services/reportService.js` | 6 个方法新增 self_assessment 分支 | ~150 行 |
| `server/app.js` | 挂载新路由（+1 行） | 1 行 |

---

### 5.2 前端（13 个新增 + 1 个修改）

#### 新增文件（13）

| 文件 | 说明 | 预估行数 |
|------|------|---------|
| `api/hse/standard.ts` | API 客户端 + TypeScript 类型 | ~250 行 |
| `views/hse/standard/clauses/index.vue` | 标准条款库页面 | ~200 行 |
| `views/hse/standard/evaluation/index.vue` | 评价任务列表页面 | ~200 行 |
| `views/hse/standard/evaluation/detail.vue` | 评价任务详情页面 | ~250 行 |
| `views/hse/standard/components/ClauseTree.vue` | 条款树组件 | ~150 行 |
| `views/hse/standard/components/ClauseDetailPanel.vue` | 条款详情面板 | ~200 行 |
| `views/hse/standard/components/ClauseDocumentModal.vue` | 资料关联弹窗 | ~200 行 |
| `views/hse/standard/components/EvaluationProgress.vue` | 评价进度组件 | ~100 行 |
| `views/hse/standard/components/EvaluationItemCard.vue` | 评价明细卡片 | ~180 行 |
| `views/hse/standard/components/GapAnalysisChart.vue` | 缺项分析图表 | ~120 行 |
| `router/routes/modules/hse-standard.ts` | 路由模块 | ~50 行 |

> 注：设计方案中列了 6 个组件，此处也是 6 个组件（ClauseTree + ClauseDetailPanel + ClauseDocumentModal + EvaluationProgress + EvaluationItemCard + GapAnalysisChart）。

#### 修改文件（1）

| 文件 | 修改内容 | 修改量 |
|------|---------|--------|
| `locales/langs/zh-CN/hse.json` | 新增 standardCenter 翻译模块 | ~60 行 |

---

### 5.3 文件总数

| 类型 | 新增 | 修改 | 合计 |
|------|------|------|------|
| 后端 | 4 | 3 | 7 |
| 前端 | 12 | 1 | 13 |
| **总计** | **16** | **4** | **20** |

> 比设计方案中少 1 个（17 vs 16），因为重新核对后确认是 12 个前端新增 + 4 个后端新增 = 16 个新增。

---

## 六、数据库迁移方案

### 6.1 迁移脚本概览

**文件**：`server/sql/hse_standard_v54_migration.sql`

**执行顺序**：
1. 新建 3 张表（IF NOT EXISTS）
2. 扩展 2 张表的 CHECK 约束
3. 插入种子数据（条款 + 模板）
4. 新建索引（IF NOT EXISTS）

### 6.2 新建表（3 张）

| 表名 | 说明 | 字段数 |
|------|------|--------|
| `safety_standard_clauses` | 标准条款主表（三级树） | ~20 |
| `standard_evaluation_tasks` | 评价任务表 | ~25 |
| `standard_evaluation_items` | 评价明细表（每条条款的评价结果） | ~20 |

### 6.3 修改表（2 张，仅扩展 CHECK 约束）

| 表名 | 修改内容 | 风险 |
|------|---------|------|
| `hse_report_templates` | DROP CONSTRAINT template_category_check + ADD CONSTRAINT（新增 'self_assessment'） | 低（仅扩展枚举值） |
| `hse_reports` | DROP CONSTRAINT template_category_check + ADD CONSTRAINT（新增 'self_assessment'） | 低（仅扩展枚举值） |

### 6.4 种子数据

- **标准条款**：GB/T 33000-2016 八大要素（一级）+ ~20 个二级要素 + ~30 个示例条款
- **自评报告模板**：1 条 hse_report_templates 记录

### 6.5 幂等性保证

全部使用 `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`，可重复执行无副作用。

---

## 七、风险点

### 7.1 数据库风险

| 风险 | 等级 | 描述 | 缓解措施 |
|------|------|------|---------|
| CHECK 约束修改 | 低 | 扩展 template_category 枚举值需 DROP + ADD | 1) 事务包裹；2) 迁移前备份；3) 新增值不影响已有数据 |
| 唯一约束冲突 | 中 | hse_reports 的 unique_report_type_period (report_type, report_period) | 沿用 Sprint3 方案：report_period 加时间戳后缀，真实周期存 source_data_ref |
| 表字段命名不一致 | 低 | document_files 用 original_name 而非 file_name | Sprint3 已踩坑修复，Sprint4 直接使用正确字段名 |
| 大表性能 | 低 | 评价明细表数据量可能较大（任务数 × 条款数） | 1) task_id + clause_id 联合索引；2) 软删除过滤；3) 分页查询 |

### 7.2 AI 风险

| 风险 | 等级 | 描述 | 缓解措施 |
|------|------|------|---------|
| AI 评价准确性 | 中 | 条款合规判定可能不够精确 | 1) Prompt 强约束（必须引用证据）；2) 人工复核机制；3) 置信度展示 |
| 逐条调用耗时长 | 中 | 30 条款 × 3-5 秒 = 90-150 秒 | 1) 异步执行 + 进度轮询；2) 可优化为批量调用（多条款合并一次 Prompt）；3) 超时降级 |
| AI JSON 解析失败 | 低 | AI 返回非 JSON 格式 | 复用 Sprint3 的解析容错逻辑（剥离代码块 → 截取首尾大括号 → JSON.parse） |
| AI 全失败 | 低 | 所有条款 AI 调用失败 | 标记 ai_status = 'failed'，条款全部为 pending，不阻断评价流程 |

### 7.3 前端风险

| 风险 | 等级 | 描述 | 缓解措施 |
|------|------|------|---------|
| 图表库缺失 | 无风险 | 缺项分析柱状图需要 echarts | 已确认项目通过 `@vben/plugins/echarts` 引入了 echarts，可直接使用 |
| 树组件性能 | 低 | 条款树层级深数据大时卡顿 | 一次查询全量数据，内存构建树（参考 Sprint1 getCategoryTree 实现） |
| 状态过多展示复杂 | 低 | 5 种合规状态 + AI 状态 + 人工状态，UI 复杂度高 | 用统一的状态标签 + 颜色映射，保持与 Sprint3 风格一致 |

### 7.4 约束遵守风险

| 约束项 | 风险等级 | 验证结论 |
|--------|---------|---------|
| 禁止修改 packages/ | 无风险 | 全部前端代码在 apps/web-antd/src/views/hse/standard/ 下 |
| 禁止修改 auth/JWT | 无风险 | 仅使用现有 requireRole 中间件 |
| 禁止新增 npm 依赖 | 低风险 | 基础依赖齐全，图表用纯 CSS/SVG 降级方案 |
| 增量开发 | 无风险 | 新增表 + CHECK 约束扩展，不修改已有字段/索引/数据 |
| 不重构已有体系 | 无风险 | reportService 通过新增分支实现，不修改 V1 和 V2 现有逻辑 |

### 7.5 集成风险

| 风险 | 等级 | 描述 | 缓解措施 |
|------|------|------|---------|
| 自评报告与 Sprint3 集成 | 低 | reportService 的 self_assessment 分支可能影响其他类型 | 每个 template_category 走独立分支，互不干扰；充分测试 |
| document_standard_relation 数据一致性 | 低 | 条款删除后关联记录如何处理 | 条款软删除，关联记录保留；查询时通过 is_deleted 过滤 |
| 评价任务大事务 | 低 | 批量插入评价明细可能耗时较长 | 分批插入 + 异步执行，不阻塞 API 响应 |

---

## 八、关键确认点

### 需设计方案调整的事项

1. **CHECK 约束修改方式**：PostgreSQL 不支持 ALTER CONSTRAINT，必须 DROP + ADD。
   - 这是安全的扩展操作，不影响已有数据
   - 迁移脚本需在事务中执行

2. **`hse_reports.unique_report_type_period` 唯一约束**：
   - Sprint3 已用 "report_period + 时间戳后缀" 方案绕过
   - Sprint4 自评报告沿用此方案
   - 建议设计文档中明确说明此兼容处理

3. **`document_standard_relation.status` 字段长度**：
   - 实际：varchar(16)
   - 设计中使用的值：`valid` / `pending` / `invalid`（均 ≤ 16）
   - ✅ 无问题

4. **图表库确认**：
   - 需确认项目是否有 echarts / chart.js
   - 若无，缺项分析图表用纯 CSS + SVG 实现

---

## 九、扫描结论

**总体评估：Sprint4 设计方案与现有代码库高度兼容，可安全实施。**

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 数据库表结构兼容 | ✅ 通过 | 4 张表现有结构全部符合预期，仅需扩展 2 个 CHECK 约束 |
| AI 服务层可复用 | ✅ 通过 | aiService.js Prompt 体系完善，新增模板即可 |
| 报告服务可扩展 | ✅ 通过 | reportService V2 架构支持新增 template_category 分支 |
| 路由无冲突 | ✅ 通过 | /api/hse/standard 前缀可用 |
| Vben 约束可遵守 | ✅ 通过 | packages/auth/JWT 均不触碰，依赖零新增 |
| 前端路由自动加载 | ✅ 通过 | modules 目录自动注册机制 |

**建议**：
1. 确认前端图表库是否可用，决定缺项分析图表的实现方案
2. 迁移脚本在测试环境先行验证
3. 开发顺序按照 Phase 1-11 逐步推进，每个 Phase 完成后做单元测试

---

**报告生成时间**：2026-07-19  
**扫描工具**：Node.js + information_schema + 代码静态分析  
**下一步**：设计方案确认后，进入编码实施阶段
