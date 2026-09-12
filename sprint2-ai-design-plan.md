# HSE V2 Sprint2 AI 文件分析阶段设计方案

> 版本：v1.0  
> 日期：2026-07-18  
> 适用范围：安全资料中心 AI 辅助分析模块

---

## 1. AI 整体流程设计

### 1.1 核心原则

- **AI 辅助定位**：AI 仅提供分析建议和缺项提醒，**不自动替代人工审核**
- **人工最终确认**：所有 AI 生成的结论必须经过人工确认方可生效
- **可追溯性**：完整记录 AI 分析过程、输入输出、人工确认操作

### 1.2 完整流程

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   文件上传   │───▶│  触发AI分析  │───▶│  文本提取    │
│  (已有功能)  │    │ (手动触发)  │    │ (按格式解析) │
└─────────────┘    └─────────────┘    └──────┬──────┘
                                              │
                                              ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  人工确认    │◀───│  缺项提醒    │◀───│  AI总结分析  │
│ (审核流程)  │    │ (标准比对)  │    │ (内容归纳)   │
└──────┬──────┘    └─────────────┘    └─────────────┘
       │
       ▼
┌─────────────┐
│  审核结果归档 │
│ (已有功能)   │
└─────────────┘
```

### 1.3 状态机设计

分析任务状态流转：

| 状态 | 说明 | 触发动作 | 下一状态 |
|------|------|----------|----------|
| `pending` | 待分析 | 用户点击"AI分析" | `extracting` |
| `extracting` | 文本提取中 | 解析完成 | `analyzing` |
| `analyzing` | AI分析中 | AI返回结果 | `completed` / `failed` |
| `completed` | 分析完成 | 人工确认审核 | — (终态) |
| `failed` | 分析失败 | 用户重试 | `extracting` |

### 1.4 AI 分析内容维度

每次 AI 分析产出以下内容：

1. **文档摘要**：自动提炼文档核心内容（200-500字）
2. **完整性评分**：0-100分，评估资料完整度
3. **风险等级**：low / medium / high / critical
4. **标准建议**：对照相关安全标准给出合规建议
5. **缺项清单**：列出文档中缺失的关键要素
6. **关键词标签**：自动生成文档标签（供人工确认）

---

## 2. 数据库设计

### 2.1 设计决策：新增表 vs 扩展现有表

**结论：新增 `document_ai_analysis` 表，不修改 `document_files` 表结构**

理由：
- 一份文件可多次分析（版本迭代、重新分析），需要历史记录
- 分析过程是异步的，需要独立的任务状态追踪
- 分析结果数据量大（AI 返回的完整 Markdown），单独存储避免影响主表查询性能
- 符合 Sprint1 预留设计（`document_files.analysis_status` 仅作快速展示用）

### 2.2 document_ai_analysis 表结构

```sql
-- AI 分析任务表
CREATE TABLE document_ai_analysis (
    id                  BIGSERIAL PRIMARY KEY,
    
    -- 关联文件
    file_id             BIGINT NOT NULL REFERENCES document_files(id) ON DELETE CASCADE,
    
    -- 任务状态: pending / extracting / analyzing / completed / failed
    status              VARCHAR(20) NOT NULL DEFAULT 'pending',
    
    -- 文本提取信息
    extract_method      VARCHAR(50),          -- 提取方式: excel_meta / filename_only / full_text
    extract_text_length INTEGER DEFAULT 0,    -- 提取文本长度（字符数）
    extract_error       TEXT,                 -- 提取错误信息
    
    -- AI 分析结果
    ai_summary          TEXT,                 -- AI 生成的文档摘要（Markdown）
    ai_score            INTEGER,              -- 完整性评分 0-100
    ai_risk_level       VARCHAR(20),          -- 风险等级: low / medium / high / critical
    ai_suggestions      JSONB,                -- 标准建议列表 [{standard, suggestion, level}]
    ai_missing_items    JSONB,                -- 缺项清单 [{item, reason, priority}]
    ai_keywords         JSONB,                -- 关键词标签数组
    ai_full_response    TEXT,                 -- AI 完整响应（调试用）
    
    -- AI 调用元数据
    ai_provider         VARCHAR(20),          -- AI 提供商: grok / ollama
    ai_model            VARCHAR(50),          -- 模型名称
    ai_input_tokens     INTEGER DEFAULT 0,    -- 输入 token 数
    ai_output_tokens    INTEGER DEFAULT 0,    -- 输出 token 数
    ai_duration_ms      INTEGER,              -- 调用耗时（毫秒）
    
    -- 错误信息
    error_message       TEXT,                 -- 错误描述
    error_stack         TEXT,                 -- 错误堆栈（调试用）
    
    -- 审计字段
    triggered_by        VARCHAR(100),         -- 触发人用户名
    triggered_at        TIMESTAMP DEFAULT NOW(),  -- 触发时间
    started_at          TIMESTAMP,            -- 开始执行时间
    completed_at        TIMESTAMP,            -- 完成时间
    
    -- 公共字段
    is_deleted          BOOLEAN DEFAULT FALSE,
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_ai_analysis_file_id ON document_ai_analysis(file_id);
CREATE INDEX idx_ai_analysis_status ON document_ai_analysis(status);
CREATE INDEX idx_ai_analysis_triggered_at ON document_ai_analysis(triggered_at DESC);

-- 注释
COMMENT ON TABLE document_ai_analysis IS '安全资料AI分析任务表';
COMMENT ON COLUMN document_ai_analysis.ai_suggestions IS '标准建议列表，格式: [{standard: "标准名称", suggestion: "建议内容", level: "high/medium/low"}]';
COMMENT ON COLUMN document_ai_analysis.ai_missing_items IS '缺项清单，格式: [{item: "缺失项名称", reason: "缺失原因", priority: "high/medium/low"}]';
```

### 2.3 与现有表的关系

- `document_files` 表中已有的 `analysis_status`、`ai_summary`、`ai_score` 字段继续保留，用于列表页快速展示
- 每次分析完成后，同步更新 `document_files` 表中的冗余字段（最新一次分析结果）
- 详细分析历史通过 `document_ai_analysis` 表查询

---

## 3. 文件解析策略

### 3.1 现有依赖扫描

扫描 `server/package.json` 结果：

| 依赖 | 版本 | 用途 | 是否可用于文档解析 |
|------|------|------|-------------------|
| `xlsx` | ^0.18.5 | Excel 解析 | ✅ 是（支持 .xls/.xlsx） |
| `multer` | ^1.4.5-lts.1 | 文件上传 | ❌ 否 |
| `pg` | ^8.22.0 | 数据库 | ❌ 否 |
| `winston` | ^3.19.0 | 日志 | ❌ 否 |

**缺失的解析库**（本次不新增）：
- `pdf-parse` / `pdfjs-dist` — PDF 文本提取
- `mammoth` — DOCX 文本提取
- `tesseract.js` — 图片 OCR

### 3.2 分阶段解析策略

**Sprint2 约束：禁止新增 npm 依赖**

因此采用分层降级策略：

| 文件类型 | 解析方式 | 提取内容 | 分析质量 |
|----------|----------|----------|----------|
| Excel (.xls/.xlsx) | 使用已有 `xlsx` 库 | 全部 Sheet 文本内容 | ⭐⭐⭐ 高 |
| PDF (.pdf) | 文件名 + 文件大小 + 元数据 | 文件名关键词推断 | ⭐ 低 |
| Word (.doc/.docx) | 文件名 + 文件大小 + 元数据 | 文件名关键词推断 | ⭐ 低 |
| 图片 (.jpg/.png 等) | 文件名 + 文件大小 | 文件名关键词推断 | ⭐ 极低 |
| 其他 | 文件名 | 文件名 | ⭐ 极低 |

### 3.3 Excel 完整解析方案（xlsx 库）

解析流程：
1. 使用 `xlsx.readFile()` 读取工作簿
2. 遍历所有 Sheet，按行提取文本
3. 合并所有单元格文本，用换行符分隔
4. 限制最大提取长度（如 50000 字符），超长截断
5. 附加文件元信息（文件名、Sheet 列表、行列数）

### 3.4 元数据提取（通用降级方案）

对于无法提取正文的文件，提取以下信息供 AI 分析：
- 原始文件名（关键词推断文档类型）
- 文件大小
- 文件类型（扩展名）
- 用户填写的摘要（summary 字段）
- 所属分类
- 上传时间

### 3.5 未来扩展规划

后续 Sprint 如允许新增依赖，按优先级补充：
1. **DOCX 解析**：`mammoth`（纯 JS，无原生依赖）
2. **PDF 解析**：`pdf-parse`（纯 JS）
3. **图片 OCR**：`tesseract.js`（纯 JS，WebAssembly）

---

## 4. 后端接口设计

### 4.1 接口总览

所有接口挂载在现有 `hse-documents` 路由下，路径前缀：`/api/hse/documents`

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/:id/analyze` | 触发 AI 分析 | admin / safety_manager |
| GET | `/:id/analysis` | 获取最新分析结果 | 所有登录用户 |
| GET | `/:id/analysis/history` | 获取分析历史列表 | 所有登录用户 |
| GET | `/:id/analysis/:analysisId` | 获取指定分析详情 | 所有登录用户 |
| POST | `/:id/analysis/:analysisId/retry` | 重试失败的分析 | admin / safety_manager |

### 4.2 接口详情

#### 4.2.1 触发 AI 分析

```
POST /api/hse/documents/:id/analyze
```

**请求体**（可选）：
```json
{
  "customPrompt": "重点检查安全生产责任制相关内容"
}
```

**成功响应**：
```json
{
  "code": 0,
  "message": "分析任务已创建",
  "data": {
    "analysisId": 123,
    "status": "pending",
    "triggeredAt": "2026-07-18T10:00:00.000Z"
  }
}
```

**说明**：
- 接口立即返回，分析在后台异步执行
- 如已有进行中的分析任务，返回错误提示
- 前端可通过轮询或 WebSocket 获取进度

#### 4.2.2 获取最新分析结果

```
GET /api/hse/documents/:id/analysis
```

**成功响应**：
```json
{
  "code": 0,
  "message": "查询成功",
  "data": {
    "id": 123,
    "fileId": 456,
    "status": "completed",
    "extractMethod": "excel_full_text",
    "extractTextLength": 15234,
    "aiSummary": "## 文档摘要\n\n该文件为2026年第二季度安全生产检查表...",
    "aiScore": 85,
    "aiRiskLevel": "medium",
    "aiSuggestions": [
      {
        "standard": "安全生产法 第二十一条",
        "suggestion": "建议补充主要负责人安全职责清单",
        "level": "high"
      }
    ],
    "aiMissingItems": [
      {
        "item": "应急演练记录",
        "reason": "未发现本年度应急演练相关记录",
        "priority": "high"
      }
    ],
    "aiKeywords": ["安全检查", "季度报表", "隐患排查"],
    "aiProvider": "grok",
    "aiModel": "grok-2",
    "aiDurationMs": 4523,
    "triggeredBy": "admin",
    "triggeredAt": "2026-07-18T10:00:00.000Z",
    "completedAt": "2026-07-18T10:00:05.000Z"
  }
}
```

#### 4.2.3 获取分析历史列表

```
GET /api/hse/documents/:id/analysis/history?page=1&pageSize=10
```

**成功响应**：
```json
{
  "code": 0,
  "message": "查询成功",
  "data": {
    "list": [
      {
        "id": 123,
        "status": "completed",
        "aiScore": 85,
        "aiRiskLevel": "medium",
        "triggeredBy": "admin",
        "triggeredAt": "2026-07-18T10:00:00.000Z",
        "completedAt": "2026-07-18T10:00:05.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 10
  }
}
```

#### 4.2.4 重试分析

```
POST /api/hse/documents/:id/analysis/:analysisId/retry
```

**成功响应**：同触发分析

### 4.3 异步执行策略

**方案：基于 setTimeout 的轻量异步**

- 触发接口创建分析记录（status=pending）后立即返回
- 使用 `setImmediate` 或 `process.nextTick` 启动后台任务
- 后台任务顺序执行：文本提取 → AI 调用 → 结果保存
- 单文件并发控制：同一文件同时只允许一个分析任务
- 服务重启后，pending 状态的任务不自动恢复（用户手动重试）

**不引入队列库的理由**：
- Sprint2 初期并发量低，无需复杂队列
- 禁止新增 npm 依赖约束
- 后续如需要可替换为 Bull 等队列库

### 4.4 Prompt 设计

新增文档分析 Prompt 模板到 `aiService.js`：

```javascript
document_analysis: `你是宁津环卫 HSE 安全管理系统的专业 AI 助手，负责安全资料的辅助分析。

请根据以下文档内容进行专业分析，输出 JSON 格式结果。

文档信息：
- 文件名：{filename}
- 文件类型：{fileType}
- 文件分类：{category}
- 用户摘要：{summary}

文档内容：
{documentText}

分析要求：
1. 文档摘要：用 200-500 字概括文档核心内容
2. 完整性评分：0-100分，评估该安全资料的完整程度
3. 风险等级：low / medium / high / critical
4. 标准建议：对照安全生产相关法规标准，给出合规建议（最多10条）
5. 缺项清单：列出文档中缺失的关键安全要素（最多10条）
6. 关键词标签：提取 5-10 个关键词标签

请严格以 JSON 格式输出，不要包含 Markdown 代码块标记，格式如下：
{
  "summary": "文档摘要内容...",
  "score": 85,
  "riskLevel": "medium",
  "suggestions": [
    {"standard": "标准名称", "suggestion": "建议内容", "level": "high"}
  ],
  "missingItems": [
    {"item": "缺失项", "reason": "缺失原因", "priority": "high"}
  ],
  "keywords": ["关键词1", "关键词2"]
}`
```

---

## 5. 前端页面设计

### 5.1 设计原则

- 复用 Vben Admin + Ant Design Vue 现有组件
- 不新增独立页面，在现有文件库页面扩展
- AI 分析结果以 Drawer 抽屉形式展示
- 风格与现有 HSE 模块保持一致

### 5.2 文件库列表页改动

#### 5.2.1 新增列表列

在文件列表表格中新增以下列：
- **AI 评分**：显示最新分析分数（带颜色标识）
- **风险等级**：Tag 形式显示（low=绿色, medium=黄色, high=橙色, critical=红色）
- **分析状态**：分析中显示加载动画

#### 5.2.2 新增操作按钮

每行操作列新增：
- **AI 分析**按钮（图标：sparkles）
  - 未分析过：显示"AI分析"
  - 分析中：显示"分析中..." + 加载动画
  - 已分析：显示"查看分析" + 分数徽章

工具栏新增：
- **批量 AI 分析**按钮（仅 admin/safety_manager 可见）

### 5.3 分析结果 Drawer

点击"查看分析"按钮从右侧弹出 Drawer，内容分区：

```
┌─────────────────────────────────────────┐
│  AI 分析结果                        [x]  │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐    │
│  │  评分: 85分     风险等级: 中风险  │    │
│  │  分析人: admin   用时: 4.5秒     │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  📄 文档摘要                     │    │
│  │  ... (Markdown 渲染)            │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  ⚠️  缺项提醒 (3)               │    │
│  │  [高] 应急演练记录               │    │
│  │  [中] 安全培训签到表             │    │
│  │  [低] 设备维护记录               │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  💡 标准建议 (5)                │    │
│  │  1. 安全生产法 第二十一条 ...    │    │
│  │  2. ...                         │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  🏷️  关键词标签                  │    │
│  │  [安全检查] [季度报表] [隐患]    │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [重新分析]   [应用标签到文件]   [关闭]  │
└─────────────────────────────────────────┘
```

### 5.4 组件规划

#### 新增组件（src/components/hse/documents/）

| 组件名 | 用途 |
|--------|------|
| `DocumentAiAnalysis.vue` | 分析结果抽屉主组件 |
| `AiScoreBadge.vue` | AI 评分徽章组件（列表用） |
| `AiRiskTag.vue` | 风险等级标签组件 |

#### 修改页面

| 文件 | 改动 |
|------|------|
| `views/hse/documents/library/index.vue` | 新增分析按钮、分析结果列、Drawer |
| `api/hse/documents.ts` | 新增 AI 分析相关 API 函数 |
| `locales/langs/zh-CN/hse.json` | 新增翻译文案 |

### 5.5 交互流程

1. 用户在文件列表点击"AI分析"
2. 按钮变为加载状态，Toast 提示"分析任务已提交"
3. 前端开始轮询（每 2 秒）最新分析状态
4. 分析完成后自动刷新列表数据，弹出 Drawer
5. 用户查看分析结果，可选择：
   - **应用标签到文件**：将 AI 生成的关键词作为文件标签（需确认）
   - **重新分析**：重新触发一次分析
   - **关闭**：关闭 Drawer

---

## 6. Sprint2 修改文件清单

### 6.1 后端（server/）

| 文件 | 类型 | 改动说明 |
|------|------|----------|
| `sql/document_ai_analysis.sql` | 新增 | 建表 SQL 脚本 |
| `services/documentAiService.js` | 新增 | AI 分析业务逻辑（文本提取 + AI调用 + 结果保存） |
| `services/documentService.js` | 修改 | 新增同步分析结果到 document_files 的方法 |
| `routes/hse-documents.js` | 修改 | 新增 5 个 AI 分析相关路由 |
| `services/aiService.js` | 修改 | 新增 document_analysis Prompt 模板 |

### 6.2 前端（安全看板vben/apps/web-antd/src/）

| 文件 | 类型 | 改动说明 |
|------|------|----------|
| `views/hse/documents/library/index.vue` | 修改 | 新增 AI 分析按钮、结果列、分析 Drawer |
| `components/hse/documents/DocumentAiAnalysis.vue` | 新增 | AI 分析结果抽屉组件 |
| `components/hse/documents/AiScoreBadge.vue` | 新增 | 评分徽章组件 |
| `components/hse/documents/AiRiskTag.vue` | 新增 | 风险等级标签组件 |
| `api/hse/documents.ts` | 修改 | 新增 AI 分析 API 函数 |
| `locales/langs/zh-CN/hse.json` | 修改 | 新增文档分析相关翻译 |
| `locales/langs/en-US/hse.json` | 修改 | 新增文档分析相关翻译（如存在） |

### 6.3 文件总数统计

- 新增文件：**5 个**（1 SQL + 1 Service + 3 前端组件）
- 修改文件：**7 个**（2 后端 + 5 前端）

---

## 7. 风险分析

### 7.1 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| **非 Excel 文件解析能力弱** | 分析质量低，用户体验差 | 高 | 明确告知用户当前仅 Excel 支持全文分析；其他格式仅基于文件名推断，后续迭代补充 |
| **AI 响应格式不稳定** | JSON 解析失败，结果无法展示 | 中 | Prompt 中强调 JSON 格式；增加格式校验和容错解析；失败时展示原始 Markdown |
| **大文件 token 超限** | AI 调用失败或截断 | 中 | 提取文本时限制最大长度（如 50000 字符）；超长时按比例抽样或只取前 N 页 |
| **异步任务丢失** | 服务重启后 pending 任务卡死 | 低 | 启动时清理超过 30 分钟的 pending 任务；用户可手动重试 |
| **并发分析导致资源耗尽** | 服务不稳定 | 低 | 单用户并发限制（同时最多 3 个）；全局并发限制（同时最多 10 个） |

### 7.2 业务风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| **AI 分析结论误导用户** | 安全管理决策失误 | 中 | 页面显著位置标注"AI 分析仅供参考，不替代人工审核"；所有结论需人工确认 |
| **过度依赖 AI 降低审核质量** | 安全资料把关不严 | 低 | 保留完整的人工审核流程；AI 分析仅作为辅助工具 |
| **敏感数据外泄风险** | 合规问题 | 中 | 使用本地 Ollama 时数据不出域；使用 Grok 等云端 API 时，在隐私协议中说明；提供 AI 开关 |

### 7.3 约束风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| **不新增依赖导致解析能力受限** | 功能完整性不足 | 高 | 在设计文档和产品说明中明确 Sprint2 范围；规划后续迭代补充解析库 |
| **不修改 packages/ 和 auth/** | 某些能力无法复用 | 低 | 所有代码在业务层实现，不触碰核心包 |

### 7.4 上线建议

1. **灰度发布**：先对 admin 角色开放，收集反馈后全量开放
2. **功能开关**：提供系统级开关，可一键关闭 AI 分析功能
3. **使用引导**：首次使用时弹出功能介绍，说明 AI 辅助定位
4. **数据监控**：记录分析成功率、平均耗时、评分分布等指标

---

## 附录：与 Sprint1 的衔接

- 复用 Sprint1 已建的 `document_files` 表结构（`analysis_status`、`ai_summary`、`ai_score` 字段）
- 复用现有人工审核流程，AI 分析作为审核前的辅助步骤
- 复用现有通知系统，分析完成后可推送通知
- 复用现有权限体系（admin / safety_manager 角色）
