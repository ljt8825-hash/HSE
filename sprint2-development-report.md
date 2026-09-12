# HSE V2 Sprint2 AI 文件分析 - 开发报告

> 版本：v1.0  
> 日期：2026-07-19  
> 模块：安全资料中心 - AI辅助分析

---

## 1. 修改文件列表

### 1.1 后端（server/）

| 类型 | 文件路径 | 改动说明 |
|------|---------|----------|
| ✅ 新增 | [server/sql/document_ai_analysis.sql](file:///f:/deploy/hse-dashboard/server/sql/document_ai_analysis.sql) | AI 分析任务表建表脚本 + document_files 新增字段 |
| ✅ 新增 | [server/services/documentAiService.js](file:///f:/deploy/hse-dashboard/server/services/documentAiService.js) | AI 分析业务服务层（文本提取 + 流程编排 + 结果解析） |
| ✏️ 修改 | [server/services/aiService.js](file:///f:/deploy/hse-dashboard/server/services/aiService.js) | 新增 `document_analysis` Prompt 模板 + `buildDocumentAnalysisPrompt()` 方法 |
| ✏️ 修改 | [server/services/documentService.js](file:///f:/deploy/hse-dashboard/server/services/documentService.js) | 新增 `syncLatestAnalysis()` 缓存同步方法 |
| ✏️ 修改 | [server/routes/hse-documents.js](file:///f:/deploy/hse-dashboard/server/routes/hse-documents.js) | 新增 5 个 AI 分析相关 API 路由 |

### 1.2 前端（安全看板vben/apps/web-antd/src/）

| 类型 | 文件路径 | 改动说明 |
|------|---------|----------|
| ✅ 新增 | [views/hse/documents/library/components/DocumentAiAnalysis.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/documents/library/components/DocumentAiAnalysis.vue) | AI 分析结果抽屉组件（页面业务组件） |
| ✏️ 修改 | [views/hse/documents/library/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/documents/library/index.vue) | 新增 AI 评分列、风险等级列、AI 分析按钮、抽屉引用 |
| ✏️ 修改 | [api/hse/documents.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/documents.ts) | 新增 AI 分析类型定义和 5 个 API 函数 |
| ✏️ 修改 | [locales/langs/zh-CN/hse.json](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/locales/langs/zh-CN/hse.json) | 新增 `documents.aiAnalysis` 翻译组（约 30 个 key） |

### 1.3 统计

- 新增文件：**4 个**
- 修改文件：**5 个**
- 总计：**9 个文件**

---

## 2. 数据库迁移说明

### 2.1 新增表：document_ai_analysis

```sql
CREATE TABLE document_ai_analysis (
    id                  BIGSERIAL PRIMARY KEY,
    file_id             BIGINT NOT NULL,           -- 逻辑关联，无外键
    status              VARCHAR(20) NOT NULL DEFAULT 'pending',
    analysis_basis      VARCHAR(20) NOT NULL DEFAULT 'filename_only',
    prompt_version      VARCHAR(20) DEFAULT 'v1.0',
    extract_method      VARCHAR(50),
    extract_text_length INTEGER DEFAULT 0,
    extract_error       TEXT,
    ai_summary          TEXT,
    ai_score            INTEGER,
    ai_risk_level       VARCHAR(20),
    ai_suggestions      JSONB,
    ai_missing_items    JSONB,
    ai_keywords         JSONB,
    ai_full_response    TEXT,
    ai_provider         VARCHAR(20),              -- 数据库预留
    ai_model            VARCHAR(50),              -- 数据库预留
    ai_input_tokens     INTEGER DEFAULT 0,        -- 数据库预留
    ai_output_tokens    INTEGER DEFAULT 0,        -- 数据库预留
    ai_duration_ms      INTEGER,                  -- 数据库预留
    confirmed_status    VARCHAR(20) DEFAULT 'unconfirmed',
    confirmed_by        VARCHAR(100),
    confirmed_at        TIMESTAMP,
    error_message       TEXT,
    error_stack         TEXT,
    failed_at           TIMESTAMP,
    triggered_by        VARCHAR(100),
    triggered_at        TIMESTAMP DEFAULT NOW(),
    started_at          TIMESTAMP,
    completed_at        TIMESTAMP,
    is_deleted          BOOLEAN DEFAULT FALSE,
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW()
);
```

**索引**：
- `idx_ai_analysis_file_id` — file_id 索引
- `idx_ai_analysis_status` — status 索引
- `idx_ai_analysis_triggered_at` — triggered_at DESC 索引

### 2.2 扩展表：document_files

新增字段：
- `latest_ai_analysis_id BIGINT` — 最新分析记录 ID（逻辑关联，无外键）

### 2.3 数据一致性策略

- **详细数据**：全部保存在 `document_ai_analysis` 表（支持多次分析历史）
- **缓存数据**：`document_files` 表仅保存最新一次分析的关键字段缓存
- **同步时机**：每次分析完成后自动调用 `syncLatestAnalysis()` 更新缓存
- **列表查询**：优先读 `document_files` 缓存字段，快速展示
- **详情/历史**：读 `document_ai_analysis` 表获取完整数据

---

## 3. API 接口说明

所有接口挂载路径：`/api/hse/documents`  
所有接口需登录认证（auth middleware 保护）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/:id/analyze` | admin / safety_manager | 触发 AI 分析 |
| GET | `/:id/analysis` | 所有登录用户 | 获取最新分析结果 |
| GET | `/:id/analysis/history` | 所有登录用户 | 获取分析历史列表 |
| GET | `/:id/analysis/:aid` | 所有登录用户 | 获取指定分析详情 |
| POST | `/:id/analysis/:aid/retry` | admin / safety_manager | 重试失败的分析 |

### 3.1 触发 AI 分析

```
POST /api/hse/documents/:id/analyze
```

请求体（可选）：
```json
{
  "customPrompt": "重点检查安全生产责任制相关内容"
}
```

响应：
```json
{
  "code": 0,
  "message": "分析任务已创建",
  "data": {
    "analysisId": 1,
    "status": "pending",
    "triggeredAt": "2026-07-19T06:00:00.000Z"
  }
}
```

**特点**：异步执行，接口立即返回；单文件并发控制（同时只允许一个分析任务）

### 3.2 获取最新分析结果

```
GET /api/hse/documents/:id/analysis
```

响应字段：
- `id` / `fileId` / `status` / `analysisBasis`
- `promptVersion` / `extractMethod` / `extractTextLength`
- `aiSummary` / `aiScore` / `aiRiskLevel`
- `aiSuggestions[]` / `aiMissingItems[]` / `aiKeywords[]`
- `confirmedStatus` / `confirmedBy` / `confirmedAt`
- `errorMessage` / `failedAt`
- `triggeredBy` / `triggeredAt` / `startedAt` / `completedAt`

### 3.3 分析历史列表

```
GET /api/hse/documents/:id/analysis/history?page=1&pageSize=10
```

响应：`{ list, total, page, pageSize }`

### 3.4 指定分析详情

```
GET /api/hse/documents/:id/analysis/:aid
```

### 3.5 重试分析

```
POST /api/hse/documents/:id/analysis/:aid/retry
```

---

## 4. 前端页面说明

### 4.1 文件库列表页改动

**新增列**：
- **AI 评分**：使用 `a-progress` 展示（不同分数段颜色不同）
  - 未分析：显示"未分析"灰字
  - 分析中：显示 loading 标签
  - 失败：显示红色"分析失败"
  - 完成：显示进度条 + 分数
- **风险等级**：使用 `a-tag` 展示
  - low → 绿色 / medium → 黄色 / high → 橙色 / critical → 红色

**操作列**：
- 新增"AI分析"按钮（sparkles 图标）
- 点击后弹出分析结果抽屉

### 4.2 AI 分析结果抽屉

组件位置：`views/hse/documents/library/components/DocumentAiAnalysis.vue`

**内容分区**：
1. **分析依据提示条**（a-alert）
   - full_text → 绿色（全文解析，可信度高）
   - metadata_only → 橙色（仅元数据，仅供参考）
   - filename_only → 红色（仅文件名，可信度极低）

2. **评分 + 风险卡片**（a-row 两列布局）
   - 左：a-progress 环形评分
   - 右：风险等级 a-tag + 触发人 + 用时

3. **文档摘要**：纯文本展示

4. **缺项提醒**：a-list 列表，带优先级标签

5. **标准建议**：a-list 列表，带标准名称 + 建议内容 + 级别

6. **关键词标签**：a-tag 云展示

7. **免责声明**：底部文字"AI 分析结果仅供参考，不替代人工审核"

**底部操作**：
- 重新分析
- 关闭

**自动轮询**：打开抽屉时如果分析正在进行，每 2 秒轮询一次状态，完成后自动刷新并提示

### 4.3 组件复用说明

- 不新增独立公共组件
- 使用 Ant Design Vue 原生组件：`a-tag`、`a-progress`、`a-alert`、`a-result`、`a-list`、`a-drawer`
- `DocumentAiAnalysis.vue` 为页面业务组件，存放于 `views/` 下

---

## 5. 核心实现说明

### 5.1 文本解析策略（不新增依赖）

| 文件类型 | 解析方式 | analysis_basis |
|----------|----------|----------------|
| Excel (.xls/.xlsx 等) | xlsx 库全文提取（已有依赖） | `full_text` |
| PDF / Word / PPT / TXT / 图片 | 文件名 + 分类 + 用户摘要 + 元数据 | `metadata_only` |
| 其他未知类型 | 仅文件名 | `filename_only` |

Excel 解析限制：
- 最大提取 50000 字符，超长截断
- 解析失败自动降级为 metadata_only

### 5.2 异步执行策略

- 使用 `setImmediate` 启动后台任务，接口立即返回
- 状态流转：pending → processing → completed / failed
- 单文件并发控制：同一文件同时只允许一个 pending/processing 任务
- 失败时保存 `error_message` 和 `failed_at`
- 完成后自动同步缓存到 `document_files`
- 完成后推送系统通知给上传人（type=system, bizType=document_analysis）

### 5.3 AI 响应解析容错

- 支持 JSON 代码块包裹（```json ... ```）自动剥离
- 支持文本中 JSON 部分正则提取
- 解析失败时降级：将全文作为摘要，其他字段默认值
- 风险等级自动归一化（支持中英文多种表述）
- 评分自动 clamp 到 0-100

### 5.4 Prompt 说明

- 新增 `document_analysis` 模板到 `PROMPT_TEMPLATES`
- 系统身份："环卫企业安全生产管理系统的专业 AI 助手"
- 要求输出严格 JSON 格式
- 现有 5 个 Prompt 模板**未做任何修改**

---

## 6. 测试结果

### 6.1 数据库层测试 ✅

测试项目：
- ✅ 分析任务创建（CRUD）
- ✅ 获取最新分析结果
- ✅ 分析历史列表分页
- ✅ 获取指定分析详情
- ✅ 并发任务拦截（409 冲突）
- ✅ 失败任务重试
- ✅ document_files 缓存同步（analysis_status / latest_ai_analysis_id / ai_score / risk_level / ai_summary）
- ✅ prompt_version 字段落库
- ✅ confirmed_status 默认值 unconfirmed
- ✅ error_message + failed_at 失败记录

### 6.2 AI 调用测试 ⚠️

- 代码逻辑已验证正常
- 实际 AI 调用因当前环境网络限制（Grok API 超时）无法完整端到端测试
- AI 响应解析逻辑（JSON 容错、字段归一化）已通过代码审查
- 在 AI 服务可用的环境中可直接运行

### 6.3 代码约束符合性

| 约束 | 状态 | 说明 |
|------|------|------|
| 不修改 packages/ | ✅ 符合 | 所有改动在业务层 |
| 不修改 auth/ | ✅ 符合 | 未触碰认证逻辑 |
| 不修改 JWT | ✅ 符合 | 未修改 |
| 不修改登录流程 | ✅ 符合 | 未修改 |
| 不新增 npm 依赖 | ✅ 符合 | xlsx 为已有依赖 |
| 单文件分析（不批量） | ✅ 符合 | 仅单文件触发 |
| 不做模型管理 | ✅ 符合 | 数据库预留字段，无管理界面 |
| 不做 Token 统计 | ✅ 符合 | 数据库预留字段，无统计界面 |
| AI 只辅助不替代 | ✅ 符合 | 页面显著提示 + 人工确认字段 |
| 详细数据存 document_ai_analysis | ✅ 符合 | 完整历史记录 |
| document_files 只存缓存 | ✅ 符合 | 最新结果冗余 |
| latest_ai_analysis_id 逻辑关联 | ✅ 符合 | 无外键约束 |

---

## 7. 已知问题

### 7.1 非 Excel 文件解析能力有限

- **现象**：PDF、Word、图片等文件只能基于文件名和元数据分析，质量有限
- **原因**：禁止新增 npm 依赖约束，缺少 pdf-parse、mammoth、tesseract.js 等库
- **缓解**：前端显著展示 analysis_basis 分析依据标识，提醒用户注意可信度
- **建议**：后续 Sprint 评估新增解析依赖

### 7.2 AI 响应格式不稳定风险

- **现象**：AI 可能不严格按 JSON 格式输出
- **缓解**：已实现多层容错解析（代码块剥离、正则提取、降级处理）
- **极端情况**：解析完全失败时将全文作为摘要展示，不阻断功能

### 7.3 异步任务无持久化队列

- **现象**：服务重启后 pending 状态的任务会"卡住"
- **缓解**：用户可手动点击"重试"重新触发
- **建议**：后续如并发量上升，引入 Bull 等队列库

### 7.4 前端未做端到端验证

- **现象**：前端代码编写完成，但未在浏览器中实际运行验证
- **原因**：需要启动 Vite 开发服务器并配合后端调试
- **建议**：部署到开发环境后进行 UI 联调测试

---

## 8. 部署说明

### 8.1 数据库迁移

```bash
cd server
node -e "
const { pool } = require('./config/db');
const fs = require('fs');
const sql = fs.readFileSync('./sql/document_ai_analysis.sql', 'utf8');
pool.query(sql).then(() => { console.log('迁移完成'); process.exit(0); });
"
```

### 8.2 验证迁移

```sql
-- 验证表存在
SELECT to_regclass('document_ai_analysis');

-- 验证字段存在
SELECT column_name FROM information_schema.columns
WHERE table_name = 'document_files' AND column_name = 'latest_ai_analysis_id';
```

### 8.3 AI 服务配置

确保 `aiService.js` 已正确配置：
- Grok：设置 `GROK_API_KEY` 环境变量
- Ollama：设置 `OLLAMA_BASE_URL` 和 `OLLAMA_MODEL` 环境变量
- 未配置时，触发分析会返回"AI 服务未配置或不可用"错误
