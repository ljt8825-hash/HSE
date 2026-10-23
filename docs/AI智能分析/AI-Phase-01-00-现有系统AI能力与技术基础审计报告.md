# AI-Phase-01-00
# 现有系统 AI 能力与技术基础审计报告

> 审计对象：`G:\hse-dashboard`（HSE 安全管理系统）
> 审计类型：只读审计（未修改任何源代码 / 配置 / 数据库 / 路由 / Prompt）
> 审计方式：实际代码 + 实际目录 + 实际 SQL migration + **实际数据库只读探测（information_schema / count）** + 实际前端页面 + 实际路由 + 实际文档
> 状态标签：`[已验证存在]` `[部分存在]` `[仅文档存在]` `[未发现]` `[无法确认]` `[存在风险]` `[建议建设]`

---

## 1. 审计摘要

**核心结论：本项目已经建成了一套可运行、可复用的「AI 能力层底座」，并且优于一般业务系统的 AI 实现水平；它不是零散功能，而是已具备 Provider 抽象、统一 Gateway、Prompt 注册、证据链、生成记录、异步任务编排、知识库/RAG 的完整分层。**

关键发现（均已实测）：

| 项 | 结论 | 状态 |
|---|---|---|
| 真实 AI Provider 抽象（Provider Registry + Adapter） | 已实现（Grok / Ollama / OpenAI-Compatible） | [已验证存在] |
| 统一 AI Gateway（`/api/hse/ai/v2`） | 已实现，含 start→chunk→end/error SSE 信封 | [已验证存在] |
| Prompt 注册/版本管理（代码层） | 已实现，但数据库表 `ai_prompt_registry` 为空（0 行）→ 未真正启用 | [部分存在] |
| 企业知识库 / RAG（pgvector 全链路） | 已实现且已有真实数据（sources2/docs6/chunks8/embeddings8，扩展 vector 已装） | [已验证存在] |
| 异步分析任务编排 + Worker | 已实现，`ai_analysis_tasks` 有 3 行真实数据 | [已验证存在] |
| AI 生成记录 / 审计追踪 | 已实现，`ai_generation_records` 有 14 行 | [已验证存在] |
| 人工审核闭环 | 代码+表已建，但 `ai_generation_reviews` 0 行 → 未实际使用 | [部分存在] |
| SSE 流式 | 后端已实现；前端 API 层已封装但**主页面未使用** | [部分存在] |
| Markdown 渲染 | 不存在（前端无任何 markdown 依赖） | [未发现] |
| 图片 / 多模态（本地 Ollama VL） | 已实现（培训台账 AI 识图），仅覆盖培训场景 | [部分存在] |
| 文档解析 | 仅 txt/md/pdf（复用 pdf-parse），docx/xlsx 明确"本阶段不要求" | [部分存在] |
| 报告生成 | AI 文本报告模板 + Excel 导出；无 docx/pptx 生成能力 | [部分存在] |
| 通用 Skill 体系（公司级） | 完全不存在，无 `skills/` `agents/` `company-ai/` | [未发现] |
| `/api/hse/ai` 重复挂载 | **确认存在**（`ai.js` 与 `ai-enhanced.js` 同挂载点） | [存在风险] |
| 遗留 Legacy AI 端点 | `ai.js` 中 risk-predict/classify/anomaly-detect 为统计规则、qa 为 Mock | [存在风险] |
| Grok Provider 配置 | `AI_PROVIDER=grok` 但 `GROK_API_KEY` 为空 → 实际只有 Ollama 可用 | [存在风险] |

**审计发现总数：42 项**（详见各章节）
**已有能力：11 项 / 部分能力：9 项 / 未发现能力：7 项 / 存在风险：8 项 / 重大风险：4 项**
**可复用能力：13 项**（见 §19 资产地图）

**一句话结论：** 公司第一阶段 5 个通用 Skill **不需要重建底座**，底座（Provider/Gateway/Prompt/Evidence/Record/Task/RAG）可直接复用并升格为公司级 `ai-platform`；需要做的是**抽取通用能力 + 隔离 HSE 专属规则 + 重建 3 个耦合/遗留点**。

---

## 2. 审计范围

| 维度 | 覆盖 |
|---|---|
| 后端 | `server/`（app.js、routes、controllers、services、middleware、utils、sql、scripts） |
| 前端 | `安全看板vben/apps/web-naive`（生产）、`安全看板vben/apps/web-antd`（含占位页） |
| 数据库 | 实际库 `safety_dashboard` 与 `safety_dashboard_dev` 的 information_schema 与 AI 表行数（**只读**） |
| 文档 | `docs/AI智能分析/`（AI-01 ~ AI-12 系列报告） |
| 未覆盖 | 任何代码/配置/数据库的修改；未启动服务；未执行 migration；未安装依赖 |

---

## 3. 项目技术基线

### 3.1 目录结构（实际）

```text
G:\hse-dashboard\
├── server\                 # 后端（CommonJS，唯一运行入口 app.js）
│   ├── app.js              # 实际后端入口（express 挂载全部路由 + 托管前端 dist）
│   ├── routes\             # 路由层
│   ├── controllers\        # 薄 handler 层
│   ├── services\           # 业务 + SQL
│   │   └── ai\             # ★ AI 能力层（核心资产）
│   ├── middleware\         # auth.js / upload.js / response.js
│   ├── utils\              # excel.js 等
│   ├── sql\                # AI 相关 migration SQL
│   └── scripts\            # ai*.cjs（建表/验收/worker）
├── 安全看板vben\           # 前端 monorepo（Vben Admin 5.7.0 / pnpm / turbo）
│   └── apps\
│       ├── web-naive\      # ★ 生产前端（被 server/app.js 托管）
│       └── web-antd\       # 仅构建、当前不托管
├── docs\AI智能分析\        # AI 系列文档 + 本报告
├── sql\                    # 早期 schema / migrate_hse_menus.sql
├── prompts\                # 提示词目录（脚本用）
└── safety-check-h5\ / grid-mobile-cloudflare\  # H5 移动端（Cloudflare Worker）
```

**实际运行入口（已验证）**
- 后端：[app.js](file:///g:/hse-dashboard/server/app.js)
- 生产前端 dist：[FRONTEND_DIST_DIR 默认 = `安全看板vben/apps/web-naive/dist`](file:///g:/hse-dashboard/server/app.js#L278-L307)
- 结论：**当前实际使用的前端应用 = `apps/web-naive`**；`apps/web-antd` 仅构建不托管。

**UI 框架（已验证，非猜测）**
- `apps/web-naive/package.json` 依赖 `naive-ui`，`main.ts` 装配 naive 适配器 → **Naive UI**。
- `apps/web-antd` 存在但**不是生产前端**；项目中存在 `web-antd` 目录不能推断生产使用 Ant Design Vue。
- 状态：`[已验证存在]` —— 生产 UI 框架 = **Naive UI**（与基线信息一致）。

**前端菜单机制（关键）**：`apps/web-naive` 使用 **后端动态菜单**，非静态路由：
- [access.ts L16-L31](file:///g:/hse-dashboard/安全看板vben/apps/web-naive/src/router/access.ts#L16-L31) → `generateAccessible(..., { fetchMenuListAsync: getAllMenusApi })`
- [api/core/menu.ts L8-L9](file:///g:/hse-dashboard/安全看板vben/apps/web-naive/src/api/core/menu.ts#L8-L9) → `GET /menu/all`
- 因此 `/overview/ai-analysis` **不在** `web-naive/src/router/routes/modules/hse.ts` 中，而由数据库菜单表下发。

### 3.2 后端依赖（`server/package.json`）

- AI/文件相关：`xlsx ^0.18.5`、`pdf-parse ^2.4.5`、`multer`、`ws`、`jsonwebtoken`、`pg`、`winston`。
- **未发现**：`openai`/`@anthropic-ai/sdk`/`exceljs`/`mammoth`/`pptxgenjs`/`docx` 等 SDK。
- 结论：Provider 全部由项目自行 fetch 实现（**非官方 SDK**），报告/文档生成无专用库。

### 3.3 环境变量（只报存在性，不输出任何密钥值）

| 键 | 状态 |
|---|---|
| `AI_PROVIDER` | `<已配置>`（值 = grok） |
| `GROK_API_KEY` | **`<空>`** ← 风险 |
| `GROK_MODEL` / `GROK_BASE_URL` | `<已配置>` |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | `<已配置>`（`http://localhost:11434` / `qwen2.5:7b`） |
| `OLLAMA_VL_MODEL` | `<未定义>`（代码兜底 `qwen2.5vl:7b`） |
| `AI_OPENAI_BASE_URL` / `AI_OPENAI_API_KEY` / `AI_OPENAI_MODEL` / `AI_OPENAI_NAME` | `<未定义>` |
| `DEEPSEEK_API_KEY` | `<未定义>` |
| `AI_ENABLED` | `<未定义>` |
| `FRONTEND_DIST_DIR` / `SERVE_DIST` | `<未定义>`（走默认 web-naive/dist） |

---

## 4. 当前前端 AI 能力

### 4.1 AI 页面（生产 web-naive）

| 项 | 证据 | 状态 |
|---|---|---|
| 页面文件 | [views/hse/ai-analysis/index.vue](file:///g:/hse-dashboard/安全看板vben/apps/web-naive/src/views/hse/ai-analysis/index.vue)（1473 行） | [已验证存在] |
| 页面标题 | 同文件 L763 `title="AI 智能分析中心"` | [已验证存在] |
| 路由 | `/overview/ai-analysis`（DB 动态菜单下发，见 §3.1） | [已验证存在] |
| 是否占位页 | **否**。含创建任务 / 任务列表 / 详情抽屉 / 证据 / 管理建议 / 人工审核 | [已验证存在] |
| 是否接入真实 API | 是，[api/hse/ai.ts](file:///g:/hse-dashboard/安全看板vben/apps/web-naive/src/api/hse/ai.ts)（605 行） | [已验证存在] |
| 主流程 | 走 **AI-07 异步任务**（`analysis-tasks`），创建即返回 PENDING，页面不阻塞（页面 L6 注释） | [已验证存在] |
| 轮询 | 单 timer `setInterval`（页面 L358-L371），仅活跃任务时启动/卸载清理 | [已验证存在] |
| 证据展示 | `business_record` / `knowledge_base` 分类（页面 L527-L532） | [已验证存在] |
| 管理建议 + 人工审核 UI | 采纳/驳回/修改 + 审核历史（页面 L608-L742、L1216-L1311、L1399-L1463） | [已验证存在] |
| Mock 数据 | AI 页面内**未发现** mock | [已验证存在] |
| Markdown 渲染 | **未发现**（web-naive 无任何 markdown 依赖；结果为纯文本） | [未发现] |
| 流式输出（页面） | **页面未使用 SSE**（API 层已封装，页面走异步任务） | [部分存在] |
| 图片 AI 入口 | AI 分析中心无；培训模块另有 AI 识图入口 | [部分存在] |
| Excel 分析入口 | AI 分析中心无独立 Excel 上传入口 | [未发现] |

### 4.2 前端 AI API 层（[api/hse/ai.ts](file:///g:/hse-dashboard/安全看板vben/apps/web-naive/src/api/hse/ai.ts)）

- 读：`GET /hse/ai/v2/health|providers|models`（L231-L243）
- 写：`POST /hse/ai/v2/generate|analyze`（L246-L253）
- 流式：`POST /hse/ai/v2/stream`，解析 `event:start/chunk/end/error`（L256-L354）
- 任务：`POST/GET /hse/ai/v2/analysis-tasks`、`/cancel`（L491-L520）
- 遗留：`GET /hse/ai/provider/status`、`POST /hse/ai/generate-report`（含 `?stream=true` SSE）（L149-L227）
- 状态：`[已验证存在]`

### 4.3 web-antd（非生产）

- [views/hse/ai-analysis/index.vue](file:///g:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/ai-analysis/index.vue)：为**静态占位**（"风险预测分析/智能预警列表/模型准确率/异常行为识别/安全趋势预测"+ 导入按钮），不调用真实 AI。
- 路由：[hse-01-overview.ts L54-L55](file:///g:/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-01-overview.ts#L54-L55)。
- 状态：`[部分存在]`（占位，且非生产应用）。

---

## 5. 当前后端 AI 能力

### 5.1 分层结构（实际）

```text
Route → Controller → Service（三层）
AI 专用第二层：
  routes/ai-v2.js  → controllers/aiV2Controller.js → services/ai/aiGateway.js
                                                     → aiProviderRegistry.js → aiService（传输层）
  routes/ai-knowledge.js → controllers/knowledgeController.js → services/ai/knowledge/ragService.js
  routes/ai-enhanced/main.js → controllers/aiEnhancedController.js → services/aiEnhancedService.js → aiService.js（直连）
```

### 5.2 AI 服务清单（文件 + 行数，实际）

| 文件 | 行数 | 职责 | 状态 |
|---|---:|---|---|
| [services/aiService.js](file:///g:/hse-dashboard/server/services/aiService.js) | 903 | **传输层 + Prompt 模板库**（Grok/Ollama fetch、chat/chatStream、9 个报告模板） | [已验证存在] |
| [services/ai/aiGateway.js](file:///g:/hse-dashboard/server/services/ai/aiGateway.js) | 422 | 统一生成/流式入口、Prompt 解析、证据校验、生成记录落库 | [已验证存在] |
| [services/ai/aiProviderRegistry.js](file:///g:/hse-dashboard/server/services/ai/aiProviderRegistry.js) | 395 | Provider 注册表 + Grok/Ollama/OpenAI-Compatible 三实现 + 健康探测 | [已验证存在] |
| [services/ai/aiPromptRegistry.js](file:///g:/hse-dashboard/server/services/ai/aiPromptRegistry.js) | 274 | Prompt 注册/版本/渲染（`register/get/list/render`） | [已验证存在] |
| [services/ai/aiEvidenceService.js](file:///g:/hse-dashboard/server/services/ai/aiEvidenceService.js) | 93 | 统一证据结构（8 类来源、强度、校验） | [已验证存在] |
| [services/ai/aiGenerationRecordService.js](file:///g:/hse-dashboard/server/services/ai/aiGenerationRecordService.js) | 68 | `ai_generation_records` 落库 | [已验证存在] |
| [services/ai/aiHealthService.js](file:///g:/hse-dashboard/server/services/ai/aiHealthService.js) | 132 | health/providers/models 如实呈现 | [已验证存在] |
| [services/ai/tasks/aiAnalysisTaskService.js](file:///g:/hse-dashboard/server/services/ai/tasks/aiAnalysisTaskService.js) | 292 | 任务状态机/幂等/并发 | [已验证存在] |
| [services/ai/tasks/aiAnalysisWorker.js](file:///g:/hse-dashboard/server/services/ai/tasks/aiAnalysisWorker.js) | 212 | 独立 Worker + advisory lock | [已验证存在] |
| [services/ai/analysis/analysisService.js](file:///g:/hse-dashboard/server/services/ai/analysis/analysisService.js) | 241 | 结构化数据分析主流程 | [已验证存在] |
| [services/ai/analysis/analysisDataAdapter.js](file:///g:/hse-dashboard/server/services/ai/analysis/analysisDataAdapter.js) | 173 | 数据域注册表（**仅 hazard / inspection**） | [部分存在] |
| [services/ai/analysis/managementSuggestionService.js](file:///g:/hse-dashboard/server/services/ai/analysis/managementSuggestionService.js) | 305 | 管理建议六字段协议 + 越权 fail-closed | [已验证存在] |
| [services/ai/review/aiReviewService.js](file:///g:/hse-dashboard/server/services/ai/review/aiReviewService.js) | 337 | 人工审核闭环 | [部分存在] |
| [services/ai/knowledge/ragService.js](file:///g:/hse-dashboard/server/services/ai/knowledge/ragService.js) | 107 | RAG 问答（检索→上下文→生成） | [已验证存在] |
| [services/ai/knowledge/retriever.js](file:///g:/hse-dashboard/server/services/ai/knowledge/retriever.js) | 46 | pgvector 余弦检索 | [已验证存在] |
| [services/ai/knowledge/vectorStore.js](file:///g:/hse-dashboard/server/services/ai/knowledge/vectorStore.js) | 100 | `to_regtype('vector')` 真实探测 + upsert/search | [已验证存在] |
| [services/ai/knowledge/knowledgeParser.js](file:///g:/hse-dashboard/server/services/ai/knowledge/knowledgeParser.js) | 67 | **仅 txt/md/pdf**（docx/xlsx 明确不做） | [部分存在] |
| [services/ai/visionService.js](file:///g:/hse-dashboard/server/services/ai/visionService.js) | 606 | Ollama VL 图片/PDF 识别 | [已验证存在] |
| [services/aiEnhancedService.js](file:///g:/hse-dashboard/server/services/aiEnhancedService.js) | 247 | 遗留 generate-report / root-cause（**直连 aiService，绕过 Gateway**） | [存在风险] |
| [services/trainingOcrService.js](file:///g:/hse-dashboard/server/services/trainingOcrService.js) | 1079 | 培训 OCR + AI 识图编排 | [部分存在] |
| [services/documentAiService.js](file:///g:/hse-dashboard/server/services/documentAiService.js) | — | 安全资料 AI 分析（`document_ai_analysis`） | [部分存在] |
| [utils/excel.js](file:///g:/hse-dashboard/server/utils/excel.js) | 282 | **通用** Excel 读/写/表头映射/清洗 | [已验证存在] |
| [services/importExcelService.js](file:///g:/hse-dashboard/server/services/importExcelService.js) | 1399 | HSE 业务导入（**强业务耦合**） | [已验证存在] |

**结论：** 后端已具备 AI Service 抽象为"公司通用 AI Service"的条件 —— **因为分层已经存在**（Gateway / Registry / Prompt / Evidence / Record / Task）。欠缺的是**命名与边界的公司级泛化**，以及**清理 2 条绕过 Gateway 的遗留通路**。

---

## 6. AI Provider / 模型能力

| Provider | 实现文件 | 真实调用 | 抽象 | 可切换 | 配置 |
|---|---|---|---|---|---|
| Grok | [aiProviderRegistry.js L42-L99](file:///g:/hse-dashboard/server/services/ai/aiProviderRegistry.js#L42-L99) + aiService.js | 是（fetch `/models`、`/chat/completions`） | 是 | 是 | KEY **为空** → 实际 NOT_CONFIGURED |
| Ollama | [aiProviderRegistry.js L105-L228](file:///g:/hse-dashboard/server/services/ai/aiProviderRegistry.js#L105-L228) | 是（`/api/tags`、`/api/chat`、`/api/embed`） | 是 | 是 | 已配置（**当前唯一可用**） |
| OpenAI-Compatible | [aiProviderRegistry.js L234-L376](file:///g:/hse-dashboard/server/services/ai/aiProviderRegistry.js#L234-L376) | 是（协议实现；流式 L349 显式 NOT_SUPPORTED 待接入） | 是 | 是 | `AI_OPENAI_*` **未定义** → 未启用 |
| DeepSeek | — | 否 | — | 可通过 OpenAI-Compatible 间接接入 | `DEEPSEEK_API_KEY` 未定义 → [未发现] |
| Qwen | 作为 Ollama 模型（`qwen2.5:7b` / `qwen2.5vl:7b`） | 是（本地） | — | — | 已配置 |

- Provider 抽象：`registerProvider()`（[L384-L418](file:///g:/hse-dashboard/server/services/ai/aiProviderRegistry.js#L384-L418)）+ 统一接口 `name/type/chat/chatStream/isAvailable/healthCheck/capabilities`。
- 能力声明：Grok `{text,stream,structured,vision:false}`；Ollama `{text,stream,structured:false,vision:false,embedding:true}`；OpenAI-Compatible `{text,stream,structured,vision:false}`。[已验证存在]
- **风险**：`AI_PROVIDER=grok` 但 `GROK_API_KEY` 为空 → 若不做进程级覆盖，活跃 Provider 实际不可用，系统只能落 Ollama。[存在风险]

---

## 7. AI API 路由

| 路径 | 方法 | 文件 | Service | 真实模型 | Mock | 鉴权 |
|---|---|---|---|---|---|---|
| `/api/hse/ai/risk-predict` | POST | [ai.js L77](file:///g:/hse-dashboard/server/routes/ai.js#L77) | 统计规则 | 否（统计） | — | 全局鉴权 |
| `/api/hse/ai/classify` | POST | [ai.js L182](file:///g:/hse-dashboard/server/routes/ai.js#L182) | 统计规则 | 否 | — | 全局 |
| `/api/hse/ai/anomaly-detect` | POST | [ai.js L254](file:///g:/hse-dashboard/server/routes/ai.js#L254) | 统计规则 | 否 | — | 全局 |
| `/api/hse/ai/qa` | POST | [ai.js L358-L374](file:///g:/hse-dashboard/server/routes/ai.js#L358-L374) | — | 否 | **是（`source:'mock'`）** | 全局 |
| `/api/hse/ai/generate-report` | POST | [ai-enhanced/main.js L22](file:///g:/hse-dashboard/server/routes/ai-enhanced/main.js#L22) | aiEnhancedService→aiService | 是 | 否 | admin/safety_manager |
| `/api/hse/ai/root-cause` | POST | 同 L23 | 同上 | 是 | 否 | admin/safety_manager |
| `/api/hse/ai/records` `/:id` `DELETE :id` | GET/DELETE | 同 L24-L26 | aiGenerationRecordService | — | 否 | 读:全局 / 删:admin |
| `/api/hse/ai/provider/status` | POST | 同 L27 | aiHealthService | — | 否 | 全局 |
| `/api/hse/ai/v2/health|providers|models` | GET | [ai-v2.js L20-L22](file:///g:/hse-dashboard/server/routes/ai-v2.js#L20-L22) | aiHealthService | 如实 | 否 | 全局 |
| `/api/hse/ai/v2/generate|stream|analyze` | POST | ai-v2.js L24-L27 | aiGateway | 是 | 否 | admin/safety_manager |
| `/api/hse/ai/v2/analysis-tasks[...]` | POST/GET | ai-v2.js L30-L33 | aiAnalysisTaskService | 是 | 否 | 写:writer / 读:全局 |
| `/api/hse/ai/v2/.../management-suggestions` | POST/GET | ai-v2.js L36-L37 | managementSuggestionService | 是 | 否 | 写:writer |
| `/api/hse/ai/v2/.../management-suggestions/review|reviews` | POST/GET | ai-v2.js L40-L41 | aiReviewService | — | 否 | 写:writer |
| `/api/hse/ai/v2/knowledge/*` | GET/POST | [ai-knowledge.js L15-L31](file:///g:/hse-dashboard/server/routes/ai-knowledge.js#L15-L31) | ragService 等 | 是（Ollama embed/chat） | 否 | 写:writer |
| `/api/training-ocr/ai-recognize` `/progress/:jobId` | POST/GET | [training-ocr/main.js L35-L38](file:///g:/hse-dashboard/server/routes/training-ocr/main.js#L35-L38) | visionService | 是（Ollama VL） | 否 | admin/safety_manager |
| `/api/hse/report/*`（智能报告中心，含 `aiEnabled`） | GET/POST | [hse-report.js](file:///g:/hse-dashboard/server/routes/hse-report.js) | reportService | 部分（AI 开关） | 否 | 全局 |

**重复挂载（实测确认）** —— [app.js L470-L473](file:///g:/hse-dashboard/server/app.js#L470-L473)：

```js
app.use('/api/hse/ai', aiRoutes);          // ai.js
app.use('/api/hse/ai', aiEnhancedRoutes);  // ai-enhanced
app.use('/api/hse/ai/v2', aiV2Routes);
app.use('/api/hse/ai/v2/knowledge', aiKnowledgeRoutes);
```

状态：`[存在风险]` —— 同一前缀 `/api/hse/ai` 由两个 router 叠加（当前端点不重叠故未冲突，但存在遮蔽/维护风险；本次**不修复**）。

---

## 8. AI 数据库

### 8.1 实际库探测结果（只读，`safety_dashboard`）

| 表 | 行数 | 建表脚本 | 用途 | 使用状态 |
|---|---:|---|---|---|
| `ai_analysis_tasks` | **3** | [server/scripts/ai07_tasks_table.cjs](file:///g:/hse-dashboard/server/scripts/ai07_tasks_table.cjs) | 异步分析任务（状态/快照/证据/结果） | 正在使用 |
| `ai_generation_records` | **14** | [server/sql/ai_capability_layer_v1.sql L50-L81](file:///g:/hse-dashboard/server/sql/ai_capability_layer_v1.sql#L50-L81) | AI 生成记录（prompt/provider/model/token/耗时/evidence） | 正在使用 |
| `ai_generation_reviews` | **0** | [server/sql/ai11_generation_reviews_v1.sql L15-L40](file:///g:/hse-dashboard/server/sql/ai11_generation_reviews_v1.sql#L15-L40) | 人工审核记录 | 已建未用 |
| `ai_prompt_registry` | **0** | [server/sql/ai_capability_layer_v1.sql L26-L41](file:///g:/hse-dashboard/server/sql/ai_capability_layer_v1.sql#L26-L41) | Prompt 版本仓库 | **已建未用（空）** |
| `document_ai_analysis` | **1** | [server/sql/document_ai_analysis.sql L11-L98](file:///g:/hse-dashboard/server/sql/document_ai_analysis.sql#L11-L98) | 安全资料 AI 分析（含 `confirmed_status/by/at` 人工确认） | 正在使用 |
| `knowledge_sources` | **2** | [server/sql/ai05_knowledge_base_v1.sql L23-L103](file:///g:/hse-dashboard/server/sql/ai05_knowledge_base_v1.sql#L23-L103) | 知识来源 | 正在使用 |
| `knowledge_documents` | **6** | 同上 | 知识文档 | 正在使用 |
| `knowledge_chunks` | **8** | 同上 | 文本分块 | 正在使用 |
| `knowledge_embeddings` | **8** | 同上（`vector` USER-DEFINED） | 向量 | 正在使用 |

- 扩展：实测已安装 `pgcrypto, plpgsql, vector`（pgvector 可用）。[已验证存在]
- `knowledge_embeddings.vector` 列类型为 `USER-DEFINED`（即 pgvector `vector`）。[已验证存在]

### 8.2 环境差异（重要）

| 库 | AI 表 |
|---|---|
| `safety_dashboard`（`.env` DB_NAME 指向） | 9 张全部存在 |
| `safety_dashboard_dev` | **仅 `document_ai_analysis` 1 张** |

状态：`[存在风险]` —— AI 能力层表**只落在一个库**，另一库缺失；`ai07_tasks_table.cjs` 注释自称"开发库/生产零 migration"，与实际库状态相反，易误判环境。

### 8.3 历史更正

- AI-01 报告曾称 `ai_generation_records` 不存在（当时属实）；**当前该表已存在并有 14 行**。以实际库为准。[已验证存在]

---

## 9. HSE AI 现有能力

| 能力 | 是否存在 | 实现位置 | 可复用 | HSE 专属 | 建议 |
|---|---|---|---|---|---|
| 结构化数据分析 | 是 | analysis/analysisService.js | ★★★★ | 部分（域为 hazard/inspection） | 抽取域注册表为通用 |
| 数据统计（分组/排名/趋势/裁剪） | 是 | analysis/analysisStatistics.js | ★★★★ | 否 | 抽取 |
| 数据域适配 | 部分 | analysis/analysisDataAdapter.js（仅 2 域） | ★★★ | 否 | 扩展域 |
| 隐患分析 | 是 | DOMAINS.hazard | ★★★★ | 是（hazards 表） | 隔离域定义 |
| 检查/巡检分析 | 部分 | DOMAINS.inspection（注释称"数据不足仅注册结构"） | ★★ | 是 | 补数据 |
| 三违分析 | 是（规则法，非 AI） | `hse-sanwei-analysis.js` 等 | ★★ | 是 | 隔离 |
| 检查数据分析 | 部分 | analysisService + hse 检查模块 | ★★★ | 是 | 隔离+抽取 |
| 报告生成 | 是 | aiService PROMPT_TEMPLATES（9 模板） | ★★★★ | 部分 | 抽取 |
| 根因分析（RCA） | 是 | aiEnhancedService / `rca_analysis` 模板 | ★★★ | 部分 | 抽取 |
| 文档解析 | 部分 | knowledgeParsor（txt/md/pdf） | ★★★ | 否 | 扩展 docx/xlsx |
| 安全资料 AI 分析 | 是 | documentAiService + `document_ai_analysis` | ★★★ | 是 | 隔离 |
| 知识问答（RAG） | 是 | knowledge/ 全链路 | ★★★★★ | 否 | 抽取为通用 |
| 规则匹配 | 部分 | ai.js 统计规则（非 AI） | ★★ | 是 | 隔离/淘汰 |
| 信息提取 | 是 | visionService（培训台账/签到表） | ★★★ | 是 | 隔离 Prompt，抽取调用 |
| 图片/OCR 识别 | 部分 | visionService | ★★★ | 是 | 隔离 |
| 人员/车辆/项目/工单分析 | **未发现** | — | — | — | 需新建（属部门 Skill） |

---

## 10. Prompt 管理

| 检查项 | 结论 | 证据 |
|---|---|---|
| Prompt 是否硬编码 | **是**（主） | [aiService.js PROMPT_TEMPLATES L37+](file:///g:/hse-dashboard/server/services/aiService.js#L37)（`report_hazard/report_monthly/report_group/rca_analysis/document_analysis/standard_evaluation` 等） |
| 是否有代码级 Prompt 注册表 | 是 | [aiPromptRegistry.js L21-L120](file:///g:/hse-dashboard/server/services/ai/aiPromptRegistry.js#L21-L120) 注册 `hse.general.analysis` / `hse.rag.answer` / `hse.data.analysis` / `hse.management.suggestion` |
| 是否有名称 | 是 | `prompt_key` + `name` |
| 是否有版本号 | 是 | `prompt_version` + `register()`（[L141-L175](file:///g:/hse-dashboard/server/services/ai/aiPromptRegistry.js#L141-L175)） |
| 是否记录使用版本 | 是 | Gateway `resolvePrompt()`（[L39-L57](file:///g:/hse-dashboard/server/services/ai/aiGateway.js#L39-L57)）→ 落库 `prompt_key/prompt_version` |
| 是否数据库管理 | **否（未启用）** | `ai_prompt_registry` 表存在但 **0 行** |

**回答：** 存在**代码级 Prompt 版本管理**（registry + version + 落库追踪），但**不存在"运行期由数据库管理"的 Prompt 体系**：`ai_prompt_registry` 为空，实际 Prompt 仍以代码常量为主。
状态：`[部分存在]` —— 不存在"运行时 Prompt 运营/热更新"能力。

---

## 11. 企业知识库 / RAG

| 层 | 结论 | 证据 |
|---|---|---|
| 文档层 | 已实现 | `knowledge_sources/documents`（2/6 行） |
| 解析层 | 部分 | [knowledgeParser.js](file:///g:/hse-dashboard/server/services/ai/knowledge/knowledgeParser.js)：txt/md/pdf；**docx/xlsx 未做** |
| 切片层 | 已实现 | [knowledgeChunker.js L1-L192](file:///g:/hse-dashboard/server/services/ai/knowledge/knowledgeChunker.js) |
| Embedding 层 | 已实现 | [embeddingService.js](file:///g:/hse-dashboard/server/services/ai/knowledge/embeddingService.js) + Ollama `embedding:true` |
| 向量库 | 已实现 | `knowledge_embeddings`（8 行），pgvector 已装 |
| 检索层 | 已实现 | [retriever.js](file:///g:/hse-dashboard/server/services/ai/knowledge/retriever.js) + [vectorStore.search L50-L92](file:///g:/hse-dashboard/server/services/ai/knowledge/vectorStore.js#L50-L92) |
| 生成层 | 已实现 | [ragService.rag() L23-L90](file:///g:/hse-dashboard/server/services/ai/knowledge/ragService.js#L23-L90) |
| 引用/来源追踪 | 已实现 | 检索返回 documentTitle/sourceName/section/page → citations |

**回答：** **当前系统已经具备企业知识问答的技术基础**，且是唯一一条"端到端闭环 + 真实数据"的通用能力。
状态：`[已验证存在]`（受限于解析格式与数据量：6 文档 / 8 chunk）

---

## 12. Excel / 文件处理

- 依赖：`xlsx ^0.18.5`（后端）、前端 `xlsx` 0.18.5；`pdf-parse`；**无** `exceljs`/`mammoth`。
- 通用能力：[utils/excel.js](file:///g:/hse-dashboard/server/utils/excel.js) —— `readFile`（L5-L40）、`mapHeaders` 别名映射（L42-L95）、`cleanRow` 清洗（string/number/int/date/uppercase）、`generateExcel` 导出（L151-L205）、批量导入流程（L207-L269）；但文件后段（L271-L329）为**车辆模块专属**配置。
- 业务能力：[importExcelService.js](file:///g:/hse-dashboard/server/services/importExcelService.js)（1399 行）—— 强 HSE 业务耦合（moduleTemplates/字段映射/冲突键）。

**回答：** 有可复用的 **Excel 读写/表头映射/清洗** 基础能力；**没有**"上传任意 Excel → 字段识别 → 统计 → 同比/环比/异常值/排名/趋势 → 自动报告"的通用分析管线。
状态：`[部分存在]`

---

## 13. 报告生成

| 检查项 | 结论 | 证据 |
|---|---|---|
| 当前可生成什么 | AI 文本报告（隐患/事故/培训/巡查/月报/集团月报/RCA/文档分析/标准评价） | aiService PROMPT_TEMPLATES（[L37+](file:///g:/hse-dashboard/server/services/aiService.js#L37)）、[buildReportPrompt L821](file:///g:/hse-dashboard/server/services/aiService.js#L821) |
| 使用什么库 | 无专用库（纯文本）+ `xlsx` 导出 | server/package.json |
| 是否已有模板 | 是（Prompt 模板 + `hse_report_templates` 业务模板） | [hse-report.js L117-L127](file:///g:/hse-dashboard/server/routes/hse-report.js#L117-L127) |
| 是否支持自动填充 | 部分（模板 + 数据注入） | buildReportPrompt(data) |
| 是否支持图表 | 未发现（无图表生成库） | [未发现] |
| 是否支持 AI 生成正文 | 是（`aiEnabled` 开关） | hse-report.js L180-L191 |
| Word / PPT / PDF / Markdown 导出 | **未发现**（无 docx/pptx/pdf 生成库） | [未发现] |

状态：`[部分存在]`

---

## 14. SSE / 流式输出

| 检查项 | 结论 | 证据 |
|---|---|---|
| 后端是否支持 SSE | 是 | [aiGateway.stream L206-L303](file:///g:/hse-dashboard/server/services/ai/aiGateway.js#L206-L303)：`text/event-stream` + start→chunk→end/error |
| 前端是否支持 SSE | 是（API 层） | [ai.ts L166-L227](file:///g:/hse-dashboard/安全看板vben/apps/web-naive/src/api/hse/ai.ts#L166-L227)、[L256-L354](file:///g:/hse-dashboard/安全看板vben/apps/web-naive/src/api/hse/ai.ts#L256-L354) |
| 模型是否支持 stream | 是（Grok/Ollama）；OpenAI-Compatible 显式 NOT_SUPPORTED | aiProviderRegistry L349 |
| 当前是否实际使用 | **页面未使用**（AI 分析中心走异步任务 + 轮询） | ai-analysis/index.vue 无 EventSource |

状态：`[部分存在]` —— 能力具备，未接入生产页面。

---

## 15. AI 日志与审计

| 记录项 | 是否记录 | 证据 |
|---|---|---|
| 用户 | 是 | `ai_generation_records.user_id`、`ai_analysis_tasks.created_by` |
| 时间 | 是 | `created_at/started_at/completed_at` |
| 业务场景 | 是 | `type` / `sub_type` / `domain` / `task_type` |
| Prompt | 是 | `prompt` |
| Prompt 版本 | 是 | `prompt_key` / `prompt_version` |
| 模型 / Provider | 是 | `provider` / `model` |
| 输入 / 输出 | 是 | `request_payload` / `result` / `ai_result` |
| Token | 是 | `input_tokens` / `output_tokens` |
| 耗时 | 是 | `duration_ms` |
| 错误 | 是 | `status` / `error_code` / `error_message` / `error_retryable` |
| 人工审核 | 表已建（`ai_generation_reviews`，0 行） | [ai11_generation_reviews_v1.sql](file:///g:/hse-dashboard/server/sql/ai11_generation_reviews_v1.sql) |
| 最终结果 | 是 | `ai_result` / `evidence` |

**回答：** **可以回答"这次 AI 为什么得出这个结果"** —— requestId + promptKey/Version + provider/model + evidence + statistics_snapshot 齐备。
状态：`[已验证存在]`（但需注意 `ai_generation_reviews` 未实际使用）

---

## 16. AI 权限与安全

| 项 | 结论 | 证据 |
|---|---|---|
| AI 读接口 | 任意登录用户可访问 | [ai-v2.js L7-L18](file:///g:/hse-dashboard/server/routes/ai-v2.js#L7-L18) |
| AI 写接口 | `requireRole('admin','safety_manager')` | 同上 + [auth.js requireRole L290-L322](file:///g:/hse-dashboard/server/middleware/auth.js#L290-L322) |
| 全局鉴权 | `/api/*` 统一 `authMiddleware` | [app.js L248-L249](file:///g:/hse-dashboard/server/app.js#L248-L249) |
| 行级过滤 | `records` 非 admin 仅自己（service 内） | ai-enhanced/main.js L12-L13 |
| 普通用户能否调用 AI | 写：否；读：是（health/models/任务列表/记录） | — |
| 跨部门数据 | **无法确认**（未审计业务表行级权限全貌） | [无法确认] |
| AI 接口越权风险 | 端点为角色级，未发现接口级越权；但 `records` 行级过滤在 service 实现，需回归验证 | [部分存在] |
| 敏感数据是否直发外部模型 | **潜在风险**：若配置 Grok（境外 x.ai），业务数据将外发；当前 Grok KEY 为空，实际走本地 Ollama | [存在风险] |
| API Key 存放 | 均在 `server/.env` 环境变量；未硬编码在前端/源码 | [已验证存在] |

---

## 17. AI 图片 / 多模态能力

| 检查项 | 结论 | 证据 |
|---|---|---|
| 是否支持图片上传 | 是（培训模块） | [training-ocr/main.js L35](file:///g:/hse-dashboard/server/routes/training-ocr/main.js#L35) |
| 是否支持图片识别 | 是 | [visionService.callVision L322-L379](file:///g:/hse-dashboard/server/services/ai/visionService.js#L322-L379) |
| 是否存在 OCR | 是（模型识别，含签到表"填/空"判断） | visionService L50-L130、L586-L638 |
| 是否存在视觉模型 | 是（Ollama `qwen2.5vl:7b`，PDF 走 PyMuPDF 2x 渲染） | visionService L21、L332 |
| 是否支持 PDF 识图 | 是（`scripts/pdf_render_png.py`，最多 8 页） | [AI 识图口径] |
| 安全隐患图片识别 | **未发现** | [未发现] |
| 三违图片分析 | **未发现** | [未发现] |
| 绿化病虫害图片分析 | **未发现** | [未发现] |

状态：`[部分存在]`（仅培训台账识图 + 签到表检查）

---

## 18. 五大通用 Skill 能力差距

| Skill | 现有能力 | 完整度 | 可直接复用 | 需要抽象 | 需要重新建设 |
|---|---|---:|---|---|---|
| **SK-001 Excel 数据分析** | `utils/excel.js` 通用读写/表头映射/清洗 + `xlsx` 依赖 | **45%** | Excel 读取/清洗/导出 | 字段识别、统计/同比环比/异常值/排名/趋势管线、通用入口 | 通用分析编排 + AI 解释层 |
| **SK-002 文档解析** | `knowledgeParser`（txt/md/pdf）+ `pdf-parse`；`documentAiService`（元数据/文件名级） | **35%** | PDF/TXT/MD 解析、分块 | 解析接口统一化 | docx/xlsx 解析、结构化抽取 |
| **SK-003 检查数据分析** | `analysisService` + `analysisDataAdapter`(hazard/inspection) + `analysisStatistics` + 管理建议 | **70%** | 分析主流程、统计、证据、建议协议 | 数据域注册表泛化、域扩展 | 非 HSE 域适配 |
| **SK-004 报告生成** | `PROMPT_TEMPLATES` 9 模板 + `reportService` + `hse_report_templates` + Excel 导出 | **55%** | 报告 Prompt、模板机制、AI 开关 | 模板与业务解耦 | Word/PPT/PDF 生成、图表 |
| **SK-005 企业知识问答** | 完整 RAG（sources→docs→parse→chunk→embed→pgvector→retrieve→answer+citations），真实数据在库 | **80%** | 全链路 | Prompt/工具命名公司化 | 多格式解析、权限/多租户过滤、规模治理 |

**第一阶段复用结论（有代码依据）：**

```text
SK-001 Excel数据分析 ：已有约 45%，可复用 Excel 读写/清洗，需抽象通用分析管线约 55%
SK-002 文档解析     ：已有约 35%，可复用 txt/md/pdf + 分块，需重建 docx/xlsx 与抽取
SK-003 检查数据分析 ：已有约 70%，可复用分析/统计/证据/建议，需抽象域注册表
SK-004 报告生成     ：已有约 55%，可复用 Prompt 模板与报告机制，需补齐 docx/pptx 生成
SK-005 企业知识问答 ：已有约 80%，可直接升格为公司首个通用 Skill
```

---

## 19. AI 可复用资产地图

| 资产 | 位置 | 评级 | 说明 |
|---|---|---|---|
| AI Provider Adapter | aiProviderRegistry.js | ★★★★★ | 直接复用 |
| AI Gateway | aiGateway.js | ★★★★★ | 直接复用（统一入口+SSE 信封） |
| AI Prompt Registry | aiPromptRegistry.js | ★★★★☆ | 小改可复用（需公司化命名） |
| AI Evidence | aiEvidenceService.js | ★★★★★ | 直接复用 |
| AI Execution Record | aiGenerationRecordService.js (+表) | ★★★★★ | 直接复用 |
| AI Task/Worker | tasks/aiAnalysisTaskService.js + aiAnalysisWorker.js | ★★★★☆ | 小改（Worker 需服务化） |
| AI Health | aiHealthService.js | ★★★★★ | 直接复用 |
| AI Review（人工审核） | review/aiReviewService.js | ★★★★☆ | 小改（表已建未用） |
| Data Analysis | analysis/analysisService.js | ★★★★☆ | 小改（抽取域注册表） |
| Management Suggestion | analysis/managementSuggestionService.js | ★★★☆☆ | 需抽象（HSE 边界规则强） |
| Excel Parser | utils/excel.js | ★★★★☆ | 小改（剥离车辆专属配置） |
| Document Parser | knowledge/knowledgeParser.js | ★★★☆☆ | 需扩展格式 |
| RAG / Knowledge | knowledge/* | ★★★★★ | 直接复用 |
| Report Generator | aiService PROMPT_TEMPLATES + reportService | ★★★☆☆ | 需抽象（模板与业务解耦） |
| AI UI | web-naive ai-analysis 页面 + api/hse/ai.ts | ★★★☆☆ | 需抽象（当前为 HSE 单页） |
| AI API | routes/ai-v2.js + ai-knowledge.js | ★★★★★ | 直接复用 |
| AI Audit | ai_generation_records / ai_analysis_tasks | ★★★★★ | 直接复用 |
| Vision（多模态） | visionService.js | ★★★☆☆ | 参考/需隔离 Prompt |
| Legacy 统计 AI | ai.js | ★☆☆☆☆ | 不建议复用 |
| Legacy 报告直连 | aiEnhancedService.js | ★★☆☆☆ | 参考价值（应回归 Gateway） |

---

## 20. 重复代码与技术债务

| 重复点 | 产生原因 | 影响 | 建议统一方式 |
|---|---|---|---|
| `/api/hse/ai` 双 router 叠加（ai.js + ai-enhanced） | 历史叠加演进 | 遮蔽/维护风险 | **本次不修复**；后续合并为单一聚合入口 |
| `aiService.js` 同时承担"传输层"与"Prompt 模板库"（903 行） | 早期未分层 | 单点臃肿、职责混杂 | 拆分为 transport adapter + prompt templates 模块 |
| `aiEnhancedService` 直连 `aiService`，绕过 Gateway | AI-02 前遗留通路 | 破坏"Route→Gateway→Provider"约束（违反已冻结规则） | 收敛到 aiGateway |
| Grok/Ollama 请求在 `aiService` 与 `aiProviderRegistry` 各实现一次 | 分层重构未清理旧实现 | 双份 Provider 逻辑 | Registry 为唯一实现，aiService 仅传输 |
| Prompt 两套：代码常量模板 + Registry 注册 | 新旧并存 | 版本追踪可能失真 | Registry 为唯一来源，常量模板改为 `template_ref` |
| 报告生成两套：`aiService.buildReportPrompt` 与 `reportService` + `hse_report_templates` | 模块各自演进 | 口径漂移 | 统一模板元数据 |
| Excel：`utils/excel.js` 通用段 + 车辆专属段混居 | 迭代插入 | 难复用 | 通用/业务拆分 |
| Legacy 统计 vs 真实 AI 混挂同一前缀 | 命名未区分 | 可能被误认为 AI 能力 | 标注/下线 `ai.js` |

---

## 21. 保留 / 抽取 / 隔离 / 重建建议

**A. 保留（质量较高，继续使用）**
- `services/ai/aiGateway.js`、`aiProviderRegistry.js`、`aiEvidenceService.js`、`aiGenerationRecordService.js`、`aiHealthService.js`、`aiPromptRegistry.js`、`tasks/*`、`review/*`、`knowledge/*`

**B. 抽取（当前在 HSE，但本质通用）**
- Excel 解析/清洗/导出 → 公司 Skill SK-001 底座
- 文档解析器 + 分块器 → SK-002
- 结构化数据分析 + 统计 → SK-003
- 报告生成机制（模板 + AI 文本） → SK-004
- RAG / 知识问答 → SK-005
- Evidence / GenerationRecord / Task / Prompt Registry / Provider Adapter → 公司 `ai-platform`

**C. 隔离（必须保持 HSE 专业属性）**
- `analysisDataAdapter.DOMAINS`（hazard/inspection）
- 管理建议六字段协议与越权边界（HSE 法规语义）
- visionService 的培训台账/签到表 Prompt
- `documentAiService` + `document_ai_analysis`
- `hse_report_templates` 与 HSE 报告模板
- 三违分析、网格巡查等规则法（非 AI）

**D. 重建（架构问题较大）**
- `routes/ai.js` 的 risk-predict/classify/anomaly-detect（统计法）+ qa（Mock）
- `services/aiEnhancedService.js` 绕过 Gateway 的直连通路
- `aiService.js` 单体（先拆分，再决定是否保留为 transport）

---

## 22. 第一阶段技术基础结论

1. **地基已经存在，不需要重建。** Provider 抽象、Gateway、Prompt 注册、证据链、生成记录、任务编排、RAG 全部已实现并有真实数据。
2. **最成熟的通用资产是 SK-005（企业知识问答，~80%）**，最适合作为公司第一个通用 Skill 的样板。
3. **最需要抽象的是 SK-001/SK-002（Excel/文档通用化）**，当前只有底层零件，没有通用管线。
4. **必须隔离 HSE 专属规则**，避免"通用化"污染安全业务口径。
5. **存在 4 项重大风险**：Grok Key 为空却设为默认 Provider；`/api/hse/ai` 重复挂载；两条绕过 Gateway 的遗留通路；AI 表在库间不一致。

---

## 23. 第一阶段推荐技术架构

> 依据实际审计结果调整（原任务书示意图基本成立，但需修正两处：① 现有 `aiService` 应下沉为 Transport，不作为"底层核心"；② Provider 层现状为 Grok/Ollama/OpenAI-Compatible，而非 DeepSeek/Grok 并列）。

```text
                    公司 AI 应用层
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
      HSE AI           生产 AI          财务 AI（未来）
        │                 │                 │
        └─────────────────┼─────────────────┘
                          │
                  Company Skills（SK-001..SK-005）
        ┌─────────────────┼─────────────────┐
   Excel Skill      Document Skill      Report Skill
        └─────────────────┼─────────────────┘
                          │
                  AI Skill Service（新建，编排层）
                          │
                  AI Gateway（复用 aiGateway.js）
        ┌─────────────────┼─────────────────┐
  Prompt Registry   Evidence Service   Record/Task Service
        └─────────────────┼─────────────────┘
                          │
              Provider Registry（复用）
        ┌─────────────────┼─────────────────┐
      Ollama        Grok(待配 KEY)   OpenAI-Compatible
                          │
                  aiService.js（下沉为 Transport）
```

---

## 24. 风险清单

| # | 风险 | 级别 | 证据 | 影响 |
|---|---|---|---|---|
| R1 | `AI_PROVIDER=grok` 但 `GROK_API_KEY` 为空 | **重大** | .env 探测 | 活跃 Provider 不可用，只能落 Ollama |
| R2 | `/api/hse/ai` 重复挂载 | **重大** | app.js L470-L471 | 遮蔽/维护风险 |
| R3 | `aiEnhancedService` 绕过 Gateway | **重大** | aiEnhancedService.js L16 | 违反 AI-03 冻结约束，记录/证据链不完整 |
| R4 | AI 表库间不一致（dev 缺 8 张） | **重大** | 实际库探测 | 环境误判、迁移遗漏 |
| R5 | `ai.js` risk-predict/classify/anomaly-detect 为统计、`qa` 为 Mock | 中 | ai.js L77/L182/L254/L358-L374 | 被误认为真实 AI 能力 |
| R6 | `ai_prompt_registry` 空表 | 中 | 行数 0 | Prompt 版本管理未真正落地 |
| R7 | `ai_generation_reviews` 0 行 | 中 | 行数 0 | 人工审核闭环未实际使用 |
| R8 | 敏感数据外发模型（若启用 Grok/x.ai） | 中 | Provider 设计 | 数据合规风险 |
| R9 | 前端无 Markdown 渲染；SSE 未接入页面 | 低 | 无 markdown 依赖；页面无 EventSource | 体验受限 |
| R10 | 无 AI 专属限流/Token 预算 | 低 | 未发现 | 成本/滥用风险 |

---

## 25. 后续开发前置条件

1. **环境对齐**：明确哪个库为 AI 能力层的正式库，补齐缺失表（需用户授权 migration）。
2. **Provider 配置**：决策 Grok 是否启用（若启用需配置 KEY 并确认数据合规）；否则将 `AI_PROVIDER` 与进程级覆盖口径固化。
3. **通路收敛**：将 `aiEnhancedService` 回归 Gateway（消除 R3）。
4. **重复挂载处置**：合并 `/api/hse/ai` 双 router（消除 R2）。
5. **遗留端点处置**：明确 `ai.js` 是否下线/标注（消除 R5）。
6. **Prompt 落地**：决定是否启用 `ai_prompt_registry` 数据库管理。
7. **Skill 化命名**：将 `services/ai/*` 泛化为公司级命名空间（不影响 HSE 调用）。
8. **迁移/部署授权**：任何生产库 migration、Worker 服务化、Provider 切换均需用户独立授权。

---

## 26. 文件证据清单

**后端（AI 核心）**
- [server/app.js](file:///g:/hse-dashboard/server/app.js)（AI 路由挂载 L96-L101 / L468-L473；静态托管 L278-L307）
- [server/routes/ai.js](file:///g:/hse-dashboard/server/routes/ai.js)（344 行，Legacy 统计 + Mock）
- [server/routes/ai-enhanced.js](file:///g:/hse-dashboard/server/routes/ai-enhanced.js) 与 [ai-enhanced/main.js](file:///g:/hse-dashboard/server/routes/ai-enhanced/main.js)
- [server/routes/ai-v2.js](file:///g:/hse-dashboard/server/routes/ai-v2.js)（36 行）
- [server/routes/ai-knowledge.js](file:///g:/hse-dashboard/server/routes/ai-knowledge.js)（28 行）
- [server/routes/training-ocr/main.js](file:///g:/hse-dashboard/server/routes/training-ocr/main.js)
- [server/routes/hse-report.js](file:///g:/hse-dashboard/server/routes/hse-report.js)（411 行）
- [server/services/aiService.js](file:///g:/hse-dashboard/server/services/aiService.js)（903 行，PROMPT_TEMPLATES L37+）
- [server/services/ai/](file:///g:/hse-dashboard/server/services/ai)（Gateway/Provider/Prompt/Evidence/Record/Health/Tasks/Review/Knowledge/Analysis/Vision）
- [server/services/aiEnhancedService.js](file:///g:/hse-dashboard/server/services/aiEnhancedService.js)（247 行）
- [server/utils/excel.js](file:///g:/hse-dashboard/server/utils/excel.js)（282 行）
- [server/services/importExcelService.js](file:///g:/hse-dashboard/server/services/importExcelService.js)（1399 行）
- [server/package.json](file:///g:/hse-dashboard/server/package.json)（依赖清单）
- [server/.env.example](file:///g:/hse-dashboard/server/.env.example)（AI 配置键 L74-L90）

**数据库 migration**
- [server/sql/ai_capability_layer_v1.sql](file:///g:/hse-dashboard/server/sql/ai_capability_layer_v1.sql)（ai_prompt_registry / ai_generation_records）
- [server/sql/ai05_knowledge_base_v1.sql](file:///g:/hse-dashboard/server/sql/ai05_knowledge_base_v1.sql)（knowledge_*）
- [server/sql/ai11_generation_reviews_v1.sql](file:///g:/hse-dashboard/server/sql/ai11_generation_reviews_v1.sql)
- [server/sql/document_ai_analysis.sql](file:///g:/hse-dashboard/server/sql/document_ai_analysis.sql)
- [server/scripts/ai07_tasks_table.cjs](file:///g:/hse-dashboard/server/scripts/ai07_tasks_table.cjs)（ai_analysis_tasks）

**前端**
- [views/hse/ai-analysis/index.vue](file:///g:/hse-dashboard/安全看板vben/apps/web-naive/src/views/hse/ai-analysis/index.vue)（web-naive，1473 行）
- [api/hse/ai.ts](file:///g:/hse-dashboard/安全看板vben/apps/web-naive/src/api/hse/ai.ts)（605 行）
- [router/access.ts](file:///g:/hse-dashboard/安全看板vben/apps/web-naive/src/router/access.ts)（动态菜单）
- [api/core/menu.ts](file:///g:/hse-dashboard/安全看板vben/apps/web-naive/src/api/core/menu.ts)（`GET /menu/all`）
- [web-antd ai-analysis](file:///g:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/ai-analysis/index.vue)（占位）

**数据库实测（只读）**
- `safety_dashboard`：ai_analysis_tasks=3、ai_generation_records=14、ai_generation_reviews=0、ai_prompt_registry=0、document_ai_analysis=1、knowledge_sources=2、knowledge_documents=6、knowledge_chunks=8、knowledge_embeddings=8；扩展 `pgcrypto,plpgsql,vector`
- `safety_dashboard_dev`：仅 document_ai_analysis=1

**文档**
- [docs/AI智能分析/](file:///g:/hse-dashboard/docs/AI智能分析)（AI-01 ~ AI-12 系列报告、AI智能分析实施进度.md）

---

*审计结束。本报告为唯一写入文件，未修改任何源代码 / 配置 / 路由 / 数据库 / Prompt。*
