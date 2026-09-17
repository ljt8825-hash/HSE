# AI-02 HSE AI 统一能力层架构设计与接口基线

> 阶段：AI-02 统一能力层架构设计与接口基线（只设计、只基线化，**零业务代码修改**）
> 执行：Trae + DeepSeek V4 Flash
> 日期：2026-09-14
> 输入：AI-01 审计报告（`docs\AI智能分析\AI-01-HSE智能分析现状审计报告.md`）+ 本阶段只读复核
> 项目基准目录：`G:\hse-dashboard`（已确认存在，为实际开发基准）
> 原则：**先架构、后开发**。本阶段只做：只读审计 → 架构设计 → 接口设计 → 数据模型设计 → 文件结构设计 → 模块边界设计 → 风险分析 → 后续实施计划。

---

## 0. 执行摘要

AI-01 已确认：系统具备 AI 能力层的「地基」——Grok/Ollama 双 Provider 抽象（`aiService.js`）、SSE 流式、文档 AI、标准化评价双轨制字段——但能力分散、无统一层、存在双重挂载与历史/增强双实现并存。

AI-02 基于 AI-01 真实审计结果，完成**统一 HSE AI 能力层的完整架构设计与接口基线**，核心结论：

1. **Provider 统一架构**：在 `aiService.js` 原地演进为「Provider 注册表 + 统一契约」，**不建第二套平行 Provider 系统**。新增 `openaiCompatibleProvider`（覆盖 DeepSeek/Qwen/vLLM/OpenAI），保留现有 `chat/chatStream/isAvailable/getProvider` 等导出接口零破坏。
2. **七大统一组件**：Provider Registry、AI Gateway、Prompt Registry（版本化）、Evidence Chain（证据链）、AI Task（统一任务模型）、Vision 接入规范、RAG 接口规范。
3. **双重挂载治理**：新端点统一挂载 `/api/hse/ai/v2/*`（与现状共存不冲突），待迁移完成后合并为单一 ai 域；`ai.js` 4 个规则/mock 端点处置方案已给出，**删除决策留用户**。
4. **数据模型**：新增 6 张统一表（`ai_prompt_registry` / `ai_analysis_tasks` / `ai_evidence_items` / `ai_provider_configs` / `ai_rag_documents` / `ai_rag_chunks`），**不修改任何现有业务表**，不触碰 Workbuddy 保护清单。
5. **双轨制铁律**：AI 只写 `ai_*` 建议轨，人工结果（`compliance_status` 等）只由人工确认写入——统一能力层将其固化为平台级约束，任何域不得绕过。
6. **本阶段零修改**：未改任何业务代码、未建表、未安装依赖、未触碰 WPS/三违/生产边界。

---

## 1. AI-02 目标与边界

### 1.1 目标

> 在现有 HSE 系统基础上，设计一套**统一、可扩展、可审计、支持云端模型/本地模型/视觉模型**的 HSE AI 能力层。

解决 AI-01 确认的十大问题：

| # | 问题 | AI-02 设计位置 |
|---|---|---|
| 1 | AI Provider 已存在但能力分散 | §4 统一 Provider 接口规范 |
| 2 | `/api/hse/ai` 双重挂载 | §9 双重挂载治理方案 |
| 3 | AI 页面只是静态占位 | §13 前端基线 |
| 4 | AI API 历史与增强实现并存 | §8 API 接口基线 + §9 |
| 5 | 没有统一 Prompt Registry | §5 |
| 6 | 没有统一 Evidence Chain | §6 |
| 7 | 没有统一 AI Task 模型 | §7 |
| 8 | 没有统一模型 Provider 扩展规范 | §4 |
| 9 | 没有统一视觉 AI 接入规范 | §10 |
| 10 | 没有 RAG 统一接口规范 | §11 |

### 1.2 边界（本阶段不做）

- ❌ 不编写任何业务代码 / SQL / 前端代码（本文档中的代码均为**设计契约**，供 AI-03+ 实施）
- ❌ 不建表、不改数据库
- ❌ 不安装 Ollama / 模型 / npm 包
- ❌ 不触碰 WPS、三违、`grid_*`、生产 5876、生产 `.env`（§14 保护清单全量适用）
- ❌ 不删除任何现有端点（含 `ai.js` 遗留 mock——删除决策见 §9，留用户确认）

---

## 2. 现状基线复核（本阶段只读复核）

对 AI-01 关键结论逐项复核，**均与 AI-01 报告一致，未发现冲突**：

| 复核项 | AI-01 结论 | 本阶段复核 | 一致 |
|---|---|---|---|
| 前端栈 | web-naive / Naive UI 2.44.1 / Vue 3.5.34 / Vben 5.7.0 / Pinia 3.0.4 | `package.json` + AGENTS.md（禁 ant-design-vue） | ✅ |
| AI 页面 | `/overview/ai-analysis` 静态占位（硬编码 12/3580/92/86 + 「功能开发中」） | `views\hse\ai-analysis\index.vue` 精读确认，无任何 API 调用 | ✅ |
| 前端 AI API 层 | 无专用 AI API 文件 | `src\api\hse\` 无 ai*.ts（仅 risk-profile-detail/training 命中） | ✅ |
| Provider 抽象 | `aiService.js` 仅 grok/ollama if/else | 全量精读确认：`buildGrokRequest`/`buildOllamaRequest` 分支，`initialize()` 明示「仅支持 grok 或 ollama」 | ✅ |
| Prompt | `PROMPT_TEMPLATES` 9 模板无版本号 | 确认：仅 `documentAiService.js` 有 `PROMPT_VERSION='v1.0'` | ✅ |
| 双重挂载 | app.js L438-439 | 复核确认：L438 `aiRoutes` + L439 `aiEnhancedRoutes` 同挂 `/api/hse/ai` | ✅ |
| ai.js 端点 | 4 个规则/mock | 全量精读确认：risk-predict（统计）/ classify（关键词）/ anomaly-detect（统计）/ qa（mock） | ✅ |
| ai-enhanced 端点 | 6 个真实端点 | 复核确认：generate-report / root-cause / records / records/:id / DELETE records/:id / provider/status | ✅ |
| 双轨制 | `standard_evaluation_items` ai_* + compliance_status | AI-01 已确认 v54/v56 迁移脚本，本阶段未重复读库 | ✅ |
| aiService 消费方 | —（AI-01 未展开） | **本阶段补充**：7 个消费方 + 1 测试，见 §2.1 | 新增 |

### 2.1 aiService.js 消费方依赖图（接口边界设计关键输入）

| 消费方 | 使用点 | 使用的导出 | 变更敏感度 |
|---|---|---|---|
| `app.js` | L324-326 健康检查 | `getProvider()` / `isAvailable()` | 极高（启动即用） |
| `controllers/aiEnhancedController.js` | generate-report / root-cause | `chat()` / `chatStream()` / `buildReportPrompt()` / `buildRCAPrompt()` / `isAvailable()` | 极高（流式签名直接写 res） |
| `services/aiEnhancedService.js` | L241-242 可用性判断 | `isAvailable()` | 高 |
| `services/documentAiService.js` | 文档分析 | `chat()` / `isAvailable()` / `buildDocumentAnalysisPrompt()` | 高 |
| `services/reportService.js` | 月报/集团汇报 | `chat()` / `buildMonthlyReportPrompt()` / `buildGroupReportPrompt()` / `isAvailable()` | 高 |
| `services/standardEvaluationService.js` | 标准化评价 | `chat()` / `buildStandardEvaluationPrompt()` / `isAvailable()` | 高 |
| `routes/hse-documents.js` | 文档 AI 端点 | （经 documentAiService 间接） | 高 |
| `test/sprint3-report-test.js` | 测试 | `chat()` / `build*Prompt()` | 中 |

**接口边界结论**：`aiService.js` 的现有导出面是 7 个生产消费方的契约，**必须零破坏演进**。任何统一层重构不得改变：
`initialize / chat(prompt, options) / chatStream(prompt, res, options) / getProvider / isAvailable / buildReportPrompt / buildRCAPrompt / buildDocumentAnalysisPrompt / buildMonthlyReportPrompt / buildGroupReportPrompt / buildStandardEvaluationPrompt / TEMPLATES`。

---

## 3. 总体架构

### 3.1 架构图

```text
┌──────────────────── HSE 前端（web-naive / Naive UI / Vben 5.7.0）────────────────────┐
│  AI 分析页(重写) │ 风险/隐患/三违/事故分析 │ 文档/RAG │ 报告 │ 视觉识图 │             │
│  消费封装：@vben/request + SSE ReadableStream + Markdown 渲染 + NImage 预览            │
└───────────────────────────────┬──────────────────────────────────────────────────────┘
                                │ REST + SSE（/api/hse/ai/v2/*）
┌───────────────────────────────▼──────────────────────────────────────────────────────┐
│                        HSE AI 统一能力层（server/services/ai/）                        │
│                                                                                      │
│  ┌──────────────────────────── HSE AI Gateway（统一入口）──────────────────────────┐ │
│  │  generate / generateStream / structured / vision / embed / health / models      │ │
│  │  职责：鉴权透传 → Provider 路由 → 请求/响应规约 → 统一错误 → 任务落库 → 证据落库      │ │
│  └───────┬───────────────────────┬──────────────────────┬───────────────────────────┘ │
│          │                       │                      │                            │
│  ┌───────▼────────┐    ┌─────────▼────────┐    ┌────────▼────────┐                    │
│  │  PromptRegistry │    │   TaskService    │    │ EvidenceService │                    │
│  │ （版本化/审计）  │    │ （统一任务模型）  │    │  （统一证据链）   │                    │
│  └───────┬────────┘    └─────────┬────────┘    └────────┬────────┘                    │
│          │                       │                      │                            │
│  ┌───────▼───────────────────────────────────────────────────────────────────────────┐ │
│  │                      Provider Registry（Provider 注册表 + 路由）                     │ │
│  │        ┌──────────────────── 统一 Provider 接口契约（HseAiProvider）──────────┐     │ │
│  │        │ chat / chatStream / chatStructured / vision / embed / listModels /      │ │
│  │        │ healthCheck / getMetadata / capabilities                                │ │
│  │        └───────┬──────────────┬───────────────┬───────────────┬─────────────────┘ │
│  │     GrokProvider │ OllamaProvider │ OpenAICompatibleProvider │ Future(视觉等)      │ │
│  │      (xAI 云)     │ (本地 LLM)      │ (DeepSeek/Qwen/vLLM/OpenAI)                  │ │
│  └───────────────────────────────┬────────────────────────────────────────────────────┘
│                                  │ 统一调用规范：超时/重试/Token/错误分类/SSE 格式
└──────────────────────────────────┬───────────────────────────────────────────────────┘
                                   │ 只写 AI 建议轨（ai_*），绝不写最终结果
┌──────────────────────────────────▼───────────────────────────────────────────────────┐
│            HSE 业务域（风险/隐患/三违/事故/培训/考核/文档）—— 只读消费 AI 建议             │
│            人工审核 → 写入最终结果（compliance_status / checked_by / checked_at …）       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 架构原则（AI-01 冻结，本阶段固化为基线）

1. **数据流单向**：`业务数据 + HSE规则 + HSE知识库 + 算法模型 + LLM + 视觉模型 → AI综合分析 → AI证据+AI建议 → 人工审核 → 正式HSE结果`。AI 层只产出建议/证据，最终合规状态只由人工确认写入。
2. **双轨制铁律**：AI 轨（`ai_verdict/ai_evidence/ai_suggestion/ai_confidence/ai_findings/ai_missing_items`）与人工轨（`compliance_status/manual_remark/checked_by/checked_at`）分离。统一能力层在 **Gateway 层强制**：任何域通过统一层调用时，若请求声称写人工轨字段 → 拒绝（设计期约束，实施期由 `taskService` 落库白名单保证）。
3. **Provider 可插拔**：新增模型 = 新增一个 Provider 实现类 + 注册，不修改核心。
4. **审计可追溯**：每次调用落 `ai_analysis_tasks`（任务）+ `ai_evidence_items`（证据）+ Prompt 快照（`prompt_snapshot`），三方互链。
5. **只读消费业务数据**：统一层读取业务表（隐患/事故/培训等）仅 SELECT，经各域 service 的既有只读查询，不直接触碰 Workbuddy 在迁表（`grid_*`/三违）结构。
6. **渐进演进**：现有 `aiService.js`、`documentAiService.js`、`standardEvaluationService.js` 在迁移完成前**继续工作**，统一层与旧实现并存，逐域切换（§16 分阶段）。

### 3.3 分层与模块边界

| 层 | 职责 | 边界约束 |
|---|---|---|
| 路由层 `routes/ai/v2/*` | 端点绑定 + 鉴权 | 薄绑定，不含业务逻辑 |
| 控制器层 `controllers/aiV2Controller.js` | req 解析 + res 包装 | 不含 SQL |
| 能力层 `services/ai/*` | Provider/Registry/Evidence/Task/RAG/Vision 统一实现 | 核心资产，唯一模型调用点 |
| 兼容层 `services/aiService.js` | 保持现有导出面，内部委托能力层 | 7 个消费方零改动 |
| 域服务（既有） | 业务编排 + 只读取数 + 双轨落库 | 不直接调模型 HTTP |

---

## 4. 统一 Provider 接口规范（核心）

### 4.1 目标结构

```text
HSE AI Gateway
      ↓
Provider Interface（HseAiProvider 契约）
      ↓
├── GrokProvider            （xAI 云，现有逻辑迁入）
├── OllamaProvider          （本地 LLM，现有逻辑迁入）
├── OpenAICompatibleProvider（DeepSeek / Qwen / vLLM / OpenAI / 本地 OpenAI 兼容服务）
└── Future Providers        （视觉 VL、embedding 专用、私有化网关…）
```

**关键约束（来自任务书）**：不得重新设计一套与现有 `aiService.js` 完全平行的第二套 Provider 系统。因此：

- `aiService.js` **原地演进**为统一能力层核心（§4.8），现有 grok/ollama 分支代码**迁移**（不是重写）进 `providers/` 对应实现；
- 对外导出面保持 §2.1 契约不变，7 个消费方**零改动**；
- OpenAI 兼容协议作为第三种 Provider 加入，**不改变**现有两种的调用方式。

### 4.2 Provider 接口契约（HseAiProvider）

所有 Provider 实现必须满足以下接口（异步方法）。此契约是 AI-03 实施时的**唯一规范**：

```js
/**
 * HSE AI Provider 统一接口契约（设计基线 v1）
 * 所有 Provider 实现必须实现全部方法；不具备的能力返回 capability=false 并抛出 NOT_SUPPORTED 错误码。
 */
class HseAiProvider {
  /** @returns {string} 唯一标识：'grok' | 'ollama' | 'openai_compatible' | ... */
  get id() {}

  /** @returns {string} 展示名：'Grok (xAI)' / 'Ollama 本地' / 'DeepSeek' ... */
  get displayName() {}

  /** @returns {ProviderCapability} 能力声明（见 §4.3） */
  get capabilities() {}

  /**
   * 文本生成（非流式）
   * @param {ChatRequest} request
   * @returns {Promise<ChatResult>}
   */
  async chat(request) {}

  /**
   * 文本生成（流式）。onChunk 每收到一段增量文本调用一次；resolve 时返回完整结果。
   * @param {ChatRequest} request
   * @param {(delta: string) => void} onChunk
   * @returns {Promise<ChatResult>}
   */
  async chatStream(request, onChunk) {}

  /**
   * 结构化输出：强制 JSON 输出并按 schema 校验。
   * @param {ChatRequest} request
   * @param {object} jsonSchema - JSON Schema（outputContract='json' 时必填）
   * @returns {Promise<StructuredResult>} { data, content, model, inputTokens, outputTokens, durationMs, validation }
   */
  async chatStructured(request, jsonSchema) {}

  /**
   * 视觉输入：图片 + 文本 → 识别/描述。
   * @param {ChatRequest & { images: ImageInput[] }} request
   * @returns {Promise<VisionResult>} { content, structured, model, ... }
   */
  async vision(request) {}

  /**
   * 向量化（RAG 预留）。不支持时 capabilities.embeddings=false。
   * @param {string[]} texts
   * @returns {Promise<{ embeddings: number[][], model: string, durationMs: number }>}
   */
  async embed(texts) {}

  /**
   * 模型清单（含元数据）
   * @returns {Promise<ModelMetadata[]>}
   */
  async listModels() {}

  /**
   * 健康检查（含延迟）
   * @returns {Promise<HealthStatus>} { ok, latencyMs, provider, detail }
   */
  async healthCheck() {}

  /**
   * 获取指定模型元数据（本地缓存 listModels 结果）
   * @param {string} modelId
   * @returns {Promise<ModelMetadata|null>}
   */
  async getMetadata(modelId) {}
}
```

### 4.3 能力声明（ProviderCapability）

```js
/** @typedef {Object} ProviderCapability
 * @property {boolean} textGeneration    文本生成
 * @property {boolean} streaming         流式输出（SSE）
 * @property {boolean} structuredOutput  结构化输出（JSON Schema 强制）
 * @property {boolean} visionInput       视觉输入（图片理解）
 * @property {boolean} embeddings        向量化（RAG）
 * @property {boolean} toolCalling       工具/函数调用（预留）
 * @property {number}  maxContextTokens  最大上下文（tok）
 */
```

| Provider | textGeneration | streaming | structuredOutput | visionInput | embeddings | toolCalling | 备注 |
|---|---|---|---|---|---|---|---|
| Grok（grok-2 等） | ✅ | ✅ | ✅（JSON 模式） | ⚠️ 依模型 | ❌→未来 | ✅ | 云端 |
| Ollama（qwen2.5:7b 等） | ✅ | ✅ | ⚠️（模板约束） | ⚠️ 依模型（qwen3-vl） | ⚠️ 依模型 | ⚠️ | 本地 |
| OpenAI Compatible（DeepSeek/Qwen/vLLM） | ✅ | ✅ | ✅ | ⚠️ 依模型 | ✅（若端点支持） | ✅ | 云端/本地均可 |
| 未来视觉 Provider | ✅ | ✅ | ✅ | ✅ | — | — | VL 模型专用 |

> 说明：能力声明的用途是让 Gateway 做**能力路由**（§4.6）与前端健康页展示，避免「模型不支持视觉却在 UI 上开放视觉入口」的误导。

### 4.4 统一请求/响应模型

```js
/** ChatRequest（统一请求，Provider 内部负责映射到各家 API 格式） */
{
  messages: [
    { role: 'system' | 'user' | 'assistant', content: 'string',
      images?: [ { type: 'url' | 'base64', data: string } ] }  // 视觉请求携带
  ],
  model: 'string',                    // 缺省用 Provider 默认模型
  temperature: 0.7,                   // 缺省 0.7
  maxTokens: 4096,                    // 缺省 4096
  stream: false,
  responseFormat: { type: 'text' | 'json_object' | 'json_schema', schema?: object },
  timeoutMs: 60000,                   // 覆盖全局缺省
}

/** ChatResult（统一响应） */
{
  content: 'string',
  model: 'string',
  inputTokens: 0,                     // Grok usage.prompt_tokens / Ollama prompt_eval_count / 兼容协议 usage.prompt_tokens
  outputTokens: 0,                    // Grok usage.completion_tokens / Ollama eval_count / 兼容协议 usage.completion_tokens
  durationMs: 0,
  finishReason: 'stop' | 'length' | 'error' | 'content_filter',
  raw: {},                            // Provider 原始响应（审计用）
}

/** HealthStatus */
{ ok: boolean, provider: string, latencyMs: number, detail: string }

/** ModelMetadata */
{ id, provider, displayName, contextWindow, maxOutputTokens, modalities: ['text']|['text','image'],
  supportsStreaming, supportsStructuredOutput, supportsVision }
```

### 4.5 Provider 实现规范

**4.5.1 GrokProvider（现有 `buildGrokRequest` 迁入）**

| 项 | 基线 |
|---|---|
| 端点 | `POST {baseUrl}/chat/completions`（默认 `https://api.x.ai/v1`） |
| 认证 | `Authorization: Bearer {GROK_API_KEY}` |
| 非流式解析 | `choices[0].message.content` + `usage.prompt_tokens/completion_tokens` |
| 流式解析 | `data:` 行 → `choices[0].delta.content`；`[DONE]` 结束 |
| 配置项 | `GROK_API_KEY` / `GROK_MODEL`（缺省 grok-2）/ `GROK_BASE_URL` |

**4.5.2 OllamaProvider（现有 `buildOllamaRequest` 迁入）**

| 项 | 基线 |
|---|---|
| 端点 | `POST {baseUrl}/api/chat`（默认 `http://localhost:11434`） |
| 认证 | 无（本机服务） |
| 非流式解析 | `message.content` + `prompt_eval_count/eval_count` |
| 流式解析 | `data:` 行 → `message.content`；`done:true` 结束 |
| 健康检查 | `GET /api/tags`（200 即在线） |
| 配置项 | `OLLAMA_BASE_URL` / `OLLAMA_MODEL`（缺省 qwen2.5:7b） |

**4.5.3 OpenAICompatibleProvider（新增，AI-03 落地）**

| 项 | 基线 |
|---|---|
| 端点 | `POST {baseUrl}/chat/completions`（DeepSeek `https://api.deepseek.com/v1`、Qwen 百炼、vLLM 本地 `http://localhost:8000/v1`、OpenAI `https://api.openai.com/v1`） |
| 认证 | `Authorization: Bearer {API_KEY}`（本地 vLLM 可空） |
| 协议 | 完全兼容 OpenAI Chat Completions：`messages/model/stream/temperature/max_tokens/response_format/tools` |
| 非流式解析 | `choices[0].message.content` + `usage.prompt_tokens/completion_tokens` |
| 流式解析 | 同 Grok（同一协议族，`choices[0].delta.content` / `[DONE]`） |
| 结构化 | `response_format: {type:'json_object'}` 或 `{type:'json_schema', json_schema:{...}}` |
| 配置项 | `AI_OPENAI_BASE_URL` / `AI_OPENAI_API_KEY` / `AI_OPENAI_MODEL` / `AI_OPENAI_NAME`（如 `deepseek`/`qwen`/`vllm`，用于显示与记录） |

**4.5.4 Future Provider 接入流程（扩展规范）**

1. 新建 `server/services/ai/providers/xxxProvider.js`，实现 `HseAiProvider` 契约；
2. 在 `providerRegistry.register(provider)` 注册；
3. 若需 .env 配置：`AI_PROVIDER_XXX_*` 命名（`server/.env` 变更需用户授权，生产 `.env` 禁止动）；
4. 在 `providerRegistry.list()` 中声明能力 → 前端健康页/能力页自动展示，无需改前端逻辑；
5. 跑 `aiService.unit.test.js` 扩展用例（Provider 契约一致性测试，AI-03 补充）。

### 4.6 Provider 路由与降级

```js
/** ProviderRegistry（设计契约） */
{
  register(provider),                    // 注册实现
  get(id),                              // 按 id 取
  list(),                               // 全部（含能力声明）
  select({ capability }),               // 能力路由：选支持该能力的 Provider（vision → 视觉 Provider）
  getActive(),                          // 当前活动 Provider（沿用 AI_PROVIDER 环境变量）
  setActive(id),                        // 运行时切换（管理端点）
  getFallbackChain(),                   // 降级链（默认空，启用需配置）
}
```

| 路由类型 | 规则 | 现状 |
|---|---|---|
| 静态路由 | `AI_PROVIDER` 环境变量指定主 Provider（与现状一致） | ✅ 保持 |
| 能力路由 | 请求声明能力（如 vision）→ `select({capability})` 找具备该能力的 Provider | 设计完成，AI-03 落地 |
| 降级链 | 主 Provider 失败 → 按配置尝试备选（如 grok → deepseek 云兜底） | **默认关闭**，启用需用户确认（涉及成本与数据出境策略） |

### 4.7 健康检查 / 超时 / 重试 / Token（统一基线）

| 项 | 基线（设计） | 现状 | 差异 |
|---|---|---|---|
| 超时 | 全局缺省 `AI_TIMEOUT_MS=60000`，请求级 `timeoutMs` 可覆盖 | `config.timeoutMs` 已有 | ✅ 沿用 + 请求级覆盖 |
| 重试 | 最大 `AI_MAX_RETRIES=2`，指数退避（1s/2s/4s…封顶 10s），仅重试可安全重放请求 | 已有（chat 内 for 循环） | ✅ 沿用；**流式不自动重试**（已写 res 不可重放，仅报错） |
| 错误分类 | 统一错误码：`TIMEOUT` / `AUTH_FAILED` / `RATE_LIMITED` / `NOT_SUPPORTED` / `BAD_RESPONSE` / `PROVIDER_DOWN` / `EMPTY_RESPONSE` | 无分类（字符串散落） | 新增（Gateway 统一映射） |
| Token | 非流式从 usage 提取；**流式需 Provider 在 done 帧回传 usage**（Ollama 末帧含 eval_count，OpenAI 族末帧含 usage 可选）；无法获取时记 0 | 流式不记 token | 补全 |
| 健康检查 | `GET /api/hse/ai/v2/health` 聚合所有 Provider：ok/latencyMs/detail | 仅 `isAvailable()` 布尔 | 升级为结构化健康页 |

### 4.8 与现有 aiService.js 的演进关系（渐进改造，非平行系统）

```text
AI-02（现在）                      AI-03（M1）                        AI-04+（M2/M3）
─────────────                    ───────────────────                ─────────────────────
aiService.js（单文件）      →   aiService.js 保持导出面不变           aiService.js 仍保持导出面
 ├ buildGrokRequest   ──迁移──→  providers/grokProvider.js   ←──复用──→  AI Gateway
 ├ buildOllamaRequest ──迁移──→  providers/ollamaProvider.js           （统一入口）
 ├ PROMPT_TEMPLATES   ──迁移──→  promptRegistry.js                    generate/generateStream/
 ├ chat/chatStream    ──委托──→  providerRegistry + gateway            structured/vision/embed/health
 └ TEMPLATES          ──迁移──→  promptRegistry.keys
```

演进约束（基线）：

1. **M1 目标（AI-03）**：抽出 `providerRegistry` + 2 个 Provider 实现 + `openaiCompatibleProvider`；`aiService.js` 的 `chat/chatStream` 内部改为「查 registry → 调 Provider 实现」，导出签名不变；`PROMPT_TEMPLATES` 迁移到 `promptRegistry`，`build*Prompt` 保持导出。
2. **M2 目标（AI-04）**：新增 `aiGateway` 统一入口，`aiService.js` 的 `chat/chatStream` 委托 gateway；新增 `taskService`（落 `ai_analysis_tasks`）+ `evidenceService`（落 `ai_evidence_items`），**由 Gateway 统一调用**（对现有消费方透明）。
3. **M3（后续）**：逐域将 `documentAiService` / `reportService` / `standardEvaluationService` 的直接 `aiService.chat()` 调用替换为 gateway（带任务/证据落库），替换一个验证一个，**失败即回滚该域**。
4. 全程 `aiService.unit.test.js` 保持绿色（现有 15KB 测试即回归保障）。

---

## 5. 统一 Prompt Registry

### 5.1 目标

解决：`PROMPT_TEMPLATES`（9 模板，无版本）+ `documentAiService.PROMPT_VERSION='v1.0'`（独立实现）两套并存。

### 5.2 注册项元数据（设计基线）

```js
/** PromptRegistration（设计契约） */
{
  key: 'report_hazard',                 // 语义键（稳定，消费方引用）
  version: 'v1',                        // 版本号（语义化：v1 / v2）
  name: '隐患分析报告',                  // 中文名
  template: '...',                      // 模板正文（沿用现有 {data}/{custom_instructions} 占位符体系）
  inputSchema: { data: 'object|string', customInstructions: 'string?' },  // 入参契约
  outputContract: 'markdown' | 'json' | 'text',   // 输出契约
  outputSchema: null,                   // outputContract='json' 时的 JSON Schema（用于 chatStructured 校验）
  tags: ['report', 'hazard'],           // 检索标签
  isActive: true,                       // 仅一个活跃版本
  changeNote: '初始注册：自 aiService.PROMPT_TEMPLATES 迁移',   // 变更说明（审计）
  history: [ /* {version, isActive, updatedAt, changeNote} */ ] // 版本历史
}
```

### 5.3 现有模板注册清单（AI-03 一次性迁移）

| key | 名称 | outputContract | 现状位置 |
|---|---|---|---|
| `report_hazard` | 隐患分析报告 | markdown | aiService.js |
| `report_accident` | 事故分析报告 | markdown | aiService.js |
| `report_training` | 培训效果分析 | markdown | aiService.js |
| `report_patrol` | 巡检工作报告 | markdown | aiService.js |
| `rca_analysis` | 5W1H 根因分析 | markdown | aiService.js |
| `document_analysis` | 文档 AI 分析 | json | aiService.js（documentAiService 用） |
| `standard_evaluation` | 标准化条款评价 | json | aiService.js（standardEvaluationService 用） |
| `report_monthly` | 安全生产月报 | json | aiService.js（reportService 用） |
| `report_group` | 集团/区域汇报 | json | aiService.js（reportService 用） |
| `vision_scene_desc`（新增） | 现场图片场景识别 | json | AI-05 视觉阶段注册 |
| `rag_qa`（新增） | 知识库问答 | markdown | AI-06 RAG 阶段注册 |

### 5.4 版本管理规范（设计）

- **新增/修改模板必须走注册流程**：`promptRegistry.register()` 生成新版本号，旧版本保留 `isActive=false` 进 `history`，不改写历史。
- Prompt 快照进任务表：`ai_analysis_tasks.prompt_snapshot` 保存**实际发送文本**（含变量替换后），保证审计可还原「这条 AI 结果是用哪个 prompt 生成的」。
- DB 持久化：`ai_prompt_registry` 表（§12），AI-04 起启用；AI-03 先以内存 Registry + 现有常量文件承载（避免过早建表）。

---

## 6. 统一 Evidence Chain

### 6.1 目标

解决：仅标准化评价落 `ai_evidence`；报告/根因/文档分析未记录证据来源。

### 6.2 证据链模型（设计基线）

```text
ai_analysis_tasks（任务，一次 AI 调用）
    │ 1:N
    ▼
ai_evidence_items（证据项）
  ├── 输入证据（source_type=业务记录/文件/图片 → 送入 AI 的原始材料）
  └── 输出证据（AI 引用的条款/资料 → 结论的依据）
```

```js
/** EvidenceItem（设计契约） */
{
  taskId: 1001,                 // 关联 ai_analysis_tasks.id
  sourceType: 'hazard' | 'accident' | 'document' | 'image' | 'regulation' | 'standard_clause' | 'sql_result',
  sourceTable: 'hazards',       // 来源表（只读引用，不建外键）
  sourceId: 42,                 // 来源记录 ID
  evidenceType: 'text' | 'file' | 'image' | 'sql_result',
  content: '...',               // 证据内容/摘要（从业务记录提取的关键字段）
  fileId: 88,                   // 关联文件（evidenceType=file/image 时）
  confidence: 0.85,             // 该证据对结论的支撑度（0-1，AI 或规则给出）
  direction: 'input' | 'output',// 输入证据 / 输出证据
  createdAt: '2026-09-14T...',
}
```

### 6.3 落库时机（设计基线）

| 时机 | 动作 |
|---|---|
| 调用前 | Gateway 收集输入证据（取数的 SQL 结果摘要、文件 ID、图片 URL）→ 写 `direction='input'` |
| 调用后 | 解析 AI 输出中的引用（条款编号/文件 ID/记录 ID）→ 写 `direction='output'` |
| 前端展示 | 任务详情页「证据链」面板：输入材料 → AI 结论 → 证据引用 → 置信度 → 人工确认入口 |

### 6.4 与现有 ai_evidence 字段的关系

- 现有 `standard_evaluation_items.ai_evidence`（文本摘要）**保留不动**——它是业务域的快照字段；
- 新增 `ai_evidence_items` 是**统一审计级明细**（任务级、可追溯）；
- 设计规范：域级快照字段（`ai_evidence`）写入由各域 service 负责，明细证据由统一层负责，两者并存不冲突。

---

## 7. 统一 AI Task 模型

### 7.1 目标

解决：`ai_generation_records`（生成历史）+ `document_ai_analysis`（文档分析任务）+ 各域零散调用，无统一任务模型。

### 7.2 任务模型（设计基线）

```js
/** AiTask（设计契约，表结构见 §12 ai_analysis_tasks） */
{
  id,                          // 任务 ID
  taskType: 'report' | 'rca' | 'document' | 'standard_eval' | 'vision' | 'rag_qa' | 'monthly' | 'group',
  businessType: 'hazard' | 'accident' | 'training' | 'patrol' | 'document' | 'standard' | 'image' | null,
  businessId,                  // 业务记录 ID（只读引用）
  title,
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled',
  priority: 5,
  promptKey,                   // Prompt Registry 键
  promptVersion,
  promptSnapshot,              // 实际发送文本（审计）
  provider, model,
  inputTokens, outputTokens, durationMs,
  result,                      // JSONB 结构化结果（按 outputContract）
  resultText,                  // 原始文本
  errorCode, errorMessage, retryCount,
  costCents,                   // 成本（预留，AI-04 起按 Token×单价估算）
  triggeredBy,                 // 触发人 user_id
  startedAt, completedAt, createdAt, updatedAt,
}
```

### 7.3 与现有任务表的关系（演进基线）

| 现有表 | 角色 | 统一层落地后 |
|---|---|---|
| `ai_generation_records` | 生成历史（在用） | 保留；新调用默认双写统一表，逐步只写统一表（切换需用户确认） |
| `document_ai_analysis` | 文档分析任务（在用，含人工确认轨） | 保留；`taskType='document'` 统一表记录其调用明细，状态仍以原表为准（避免破坏现有闭环） |
| `ai_analysis_tasks`（新） | **统一任务表（未来唯一）** | AI-04 建表启用；现有表按域逐个迁移，**迁移一个验证一个** |

> 设计决策：**并存期不迁移存量数据**（存量历史属审计记录，迁移收益低、风险高）。新调用先双写、后单写。

---

## 8. API 接口基线（v2 统一端点）

### 8.1 端点清单（设计基线，AI-03 起逐步落地）

统一挂载前缀：`/api/hse/ai/v2`（与现有 `/api/hse/ai/*` 共存，§9 治理）。

| 方法 | 路径 | 能力 | 鉴权 | 阶段 |
|---|---|---|---|---|
| POST | `/api/hse/ai/v2/generate` | 文本生成（非流式，等价扩展 generate-report） | admin/safety_manager | AI-03 |
| POST | `/api/hse/ai/v2/generate/stream` | SSE 流式生成 | admin/safety_manager | AI-03 |
| POST | `/api/hse/ai/v2/structured` | 结构化输出（JSON Schema 校验） | admin/safety_manager | AI-04 |
| POST | `/api/hse/ai/v2/vision` | 视觉分析（multipart：图片 + prompt） | admin/safety_manager | AI-05 |
| POST | `/api/hse/ai/v2/embed` | 向量化（预留） | admin/safety_manager | AI-06 |
| GET | `/api/hse/ai/v2/models` | 模型清单与元数据 | 登录 | AI-03 |
| GET | `/api/hse/ai/v2/health` | Provider 健康状态聚合 | 登录 | AI-03 |
| GET | `/api/hse/ai/v2/tasks` | 统一任务列表（行级过滤：非 admin 仅自己） | 登录 | AI-04 |
| GET | `/api/hse/ai/v2/tasks/:id` | 任务详情 + 证据链 | 登录（本人/admin） | AI-04 |
| DELETE | `/api/hse/ai/v2/tasks/:id` | 删除任务 | admin | AI-04 |
| POST | `/api/hse/ai/v2/tasks/:id/confirm` | 人工确认（写人工轨，仅允许人工轨字段） | 登录 | AI-04 |
| GET | `/api/hse/ai/v2/prompts` | Prompt 注册表列表（含版本历史） | admin | AI-04 |
| POST | `/api/hse/ai/v2/prompts` | 注册/更新 Prompt（生成新版本） | admin | AI-04 |
| GET | `/api/hse/ai/v2/prompts/:key` | Prompt 详情 | admin | AI-04 |
| POST | `/api/hse/ai/v2/rag/index` | 文档入向量库 | admin/safety_manager | AI-06 |
| POST | `/api/hse/ai/v2/rag/query` | RAG 检索问答 | admin/safety_manager | AI-06 |

### 8.2 请求/响应基线

- 响应包装：沿用现有 `middleware/response.js` 的 `success(payload, message)` / `error(code, message)`（与全项目一致）。
- SSE 流式基线（沿用 `aiService.chatStream` 现格式，客户端可复用）：
  - 每个数据块：`data: {"content":"增量文本"}\n\n`
  - 结束：`data: [DONE]\n\n`
  - 错误：`data: {"error":"错误信息"}\n\n`
  - 响应头：`Content-Type: text/event-stream` + `Cache-Control: no-cache` + `X-Accel-Buffering: no`
- 错误码基线：`TIMEOUT / AUTH_FAILED / RATE_LIMITED / NOT_SUPPORTED / BAD_RESPONSE / PROVIDER_DOWN / EMPTY_RESPONSE`（HTTP 200 + error code 语义与现有 error() 一致；Provider 层 5xx 由网关映射）。

### 8.3 鉴权基线

- 读端点（models/health/tasks GET/prompts GET）：全局 authMiddleware，行级过滤在 service 内（非 admin 仅自己的任务/记录）——**沿用 aiEnhancedService.listRecords 现有模式**。
- 写端点（generate*/structured/vision/embed/confirm）：`requireRole('admin','safety_manager')`——**沿用 ai-enhanced 现有 AI_WRITER 模式**。
- 管理端点（DELETE tasks、POST prompts）：`requireRole('admin')`。
- **身份链铁律**：不通过姓名/岗位/乡镇推断 user_id；触发人一律取 `req.user.id`（prod-boundary §6）。

---

## 9. 双重挂载治理方案

### 9.1 现状（复核确认）

```text
app.js L438: app.use('/api/hse/ai', aiRoutes)          ← routes/ai.js（4 端点：risk-predict/classify/anomaly-detect/qa）
app.js L439: app.use('/api/hse/ai', aiEnhancedRoutes)  ← routes/ai-enhanced（6 端点：generate-report/root-cause/records...）
```

两模块路径无直接冲突（`/risk-predict` vs `/generate-report` 等），但组织混乱且 `qa` 返回 mock 有误导风险。

### 9.2 治理方案（分两步）

**Step 1（AI-03，低风险）——新端点独立前缀**：统一层端点全部挂 `/api/hse/ai/v2/*`，与现状 `/api/hse/ai/*` **共存零冲突**。同时在前端健康页/API 文档中明确 `/qa` 为 legacy。

**Step 2（AI-04+，需用户确认后执行）——单一 ai 域收编**：

| ai.js 端点 | 性质 | 处置建议 | 需用户确认 |
|---|---|---|---|
| `/qa` | mock（L364-372 明确返回假数据） | **废弃**：无任何前端消费，返回假数据有「AI 是假的」认知风险 | ✅ |
| `/risk-predict` | 统计规则（非 LLM） | 迁移至独立分析域（如 `/api/hse/analysis/risk-predict`）或标注 `type:'rule-based'` 保留 | ✅ |
| `/anomaly-detect` | 统计方法（非 LLM） | 同上 | ✅ |
| `/classify` | 关键词规则（非 LLM） | 同上；若统一层 `structured` 上线，可升级为 LLM 分类（输出契约 json） | ✅ |

**9.3 本阶段（AI-02）明确：不删除、不移动、不修改上述任何端点。** 处置动作全部在用户确认后、由后续阶段执行。

---

## 10. 视觉 AI 接入规范

### 10.1 接入架构

```text
前端（NUpload 上传 → 预览 NImage）
   │ POST /api/hse/ai/v2/vision（multipart: image + prompt）
   ▼
VisionService（services/ai/visionService.js，AI-05 实现）
   │ 复用 middleware/upload.js（类型校验+魔术字节+中文名修复）
   │ 图片存 uploads/ + 附件记录（只读引用现有附件机制）
   ▼
ProviderRegistry.select({capability:'visionInput'})
   ├── 本地：Ollama + Qwen3-VL-4B（Q4，推荐起点，AI-01 §24）
   └── 云端：OpenAI Compatible Provider + 支持视觉的模型（后续）
   ▼
结构化结果（json）→ ai_analysis_tasks(taskType='vision') + ai_evidence_items(direction='input', sourceType='image')
   ▼
双轨制：只写 ai_* 建议轨；三违/隐患/事故正式结论必须人工确认
```

### 10.2 输入/输出基线

| 项 | 基线 |
|---|---|
| 输入 | multipart：`image`（PNG/JPG/JPEG/BMP/WebP，沿用 upload.js 限制）+ `prompt`（可选）+ `businessType/businessId`（可选关联） |
| 输出契约 | `json`：`{ scene, description, risks: [{type, desc, confidence}], suggestions: [string], evidence }` |
| 双轨 | 落 `ai_*` 建议字段；**绝不直接生成三违/隐患正式记录** |
| 本地模型起点 | Qwen3-VL-4B（Q4），实测不达标再升 8B（AI-01 §24 硬件可行性） |
| 前端配套 | 统一图片预览组件（NImage 经 Vben adapter 注入）+ 「图片 → AI 识别 → 证据 → 人工确认」链路 |

### 10.3 与 OCR 的分工

- OCR（training-ocr，Python 子进程）= **文字提取**，非 LLM，维持现状不动；
- 视觉 AI = **识图理解**（场景判断/隐患识别），互补而非替代；
- 视觉服务不触碰 training-ocr 端点与脚本（Workbuddy/既有资产保护）。

---

## 11. RAG 统一接口规范

### 11.1 组件与流程（设计基线，AI-06 落地）

```text
文档（document_files / hse_standard / 规章制度 / 上传文件）
   │
   ▼ Chunker（切分器：按标题/段落/固定窗口切分，带元数据）
   │
   ▼ Embedder（ProviderRegistry.select({capability:'embeddings'}).embed）
   │    本地 bge-m3（<1GB）或云端 embedding API
   ▼
VectorStore（pgvector 扩展，与现有 PostgreSQL 融合，不引入新数据库）
   │    ai_rag_documents / ai_rag_chunks（§12）
   ▼
Retriever（向量检索 + 关键词混合召回，Top-K）
   │
   ▼ 上下文增强（检索片段注入 prompt → rag_qa 模板）
   │
   ▼ LLM 生成（双轨制：AI 答案只进建议轨）
```

### 11.2 接口基线

| 端点 | 请求 | 响应 |
|---|---|---|
| `POST /api/hse/ai/v2/rag/index` | `{ sourceType: 'document'|'standard'|'regulation', sourceId, force?: bool }` | `{ indexed: true, chunksCount, documentId }` |
| `POST /api/hse/ai/v2/rag/query` | `{ question, topK?: 5, filters?: {sourceType, tags} }` | `{ answer, evidence: [chunkId, source, score, excerpt], taskId }` |

### 11.3 演进路径

- AI-06 起步：**文档级 RAG**（document_files 已具备分析能力，先切分入库）；
- AI-06 扩展：hse_standard 条款库、规章制度、历史事故/隐患报告入库；
- 约束：pgvector 扩展安装属数据库变更，需用户确认并避开 Workbuddy 迁移窗口；AI-02/AI-03 不安装。

---

## 12. 数据模型设计（新增表清单）

**铁律：全部为新增表，不修改任何现有表；表名 `ai_` 前缀与现有 `ai_` 字段体系一致。**

### 12.1 `ai_prompt_registry`（Prompt 注册表，AI-04 建表）

```sql
CREATE TABLE ai_prompt_registry (
  id             BIGSERIAL PRIMARY KEY,
  prompt_key     VARCHAR(100) NOT NULL,          -- 语义键（消费方引用）
  version        VARCHAR(20)  NOT NULL,          -- 版本（v1/v2...）
  name           VARCHAR(200),                   -- 中文名
  template       TEXT NOT NULL,                  -- 模板正文
  input_schema   JSONB,                          -- 入参契约
  output_contract VARCHAR(20) NOT NULL DEFAULT 'text',  -- markdown | json | text
  output_schema  JSONB,                          -- 输出 JSON Schema
  tags           TEXT[] DEFAULT '{}',
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  change_note    TEXT,
  created_by     BIGINT,                         -- users.id（只读引用）
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (prompt_key, version)
);
CREATE INDEX idx_ai_prompt_key_active ON ai_prompt_registry (prompt_key, is_active);
```

### 12.2 `ai_analysis_tasks`（统一 AI 任务表，AI-04 建表）

```sql
CREATE TABLE ai_analysis_tasks (
  id             BIGSERIAL PRIMARY KEY,
  task_type      VARCHAR(50) NOT NULL,           -- report|rca|document|standard_eval|vision|rag_qa|monthly|group
  business_type  VARCHAR(50),                    -- hazard|accident|training|patrol|document|standard|image|null
  business_id    BIGINT,                         -- 业务记录 ID（只读引用，不建外键）
  title          VARCHAR(200),
  status         VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending|processing|completed|failed|cancelled
  priority       SMALLINT NOT NULL DEFAULT 5,
  prompt_key     VARCHAR(100),
  prompt_version VARCHAR(20),
  prompt_snapshot TEXT,                          -- 实际发送 prompt（审计）
  provider       VARCHAR(50),
  model          VARCHAR(100),
  input_tokens   INTEGER DEFAULT 0,
  output_tokens  INTEGER DEFAULT 0,
  duration_ms    INTEGER,
  result         JSONB,                          -- 结构化结果
  result_text    TEXT,                           -- 原始文本
  error_code     VARCHAR(50),
  error_message  TEXT,
  retry_count    SMALLINT DEFAULT 0,
  cost_cents     INTEGER,                        -- 成本（预留）
  triggered_by   BIGINT,                         -- users.id（触发人，取 req.user.id）
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ai_tasks_status   ON ai_analysis_tasks (status);
CREATE INDEX idx_ai_tasks_type     ON ai_analysis_tasks (task_type);
CREATE INDEX idx_ai_tasks_user     ON ai_analysis_tasks (triggered_by);
CREATE INDEX idx_ai_tasks_business ON ai_analysis_tasks (business_type, business_id);
CREATE INDEX idx_ai_tasks_created  ON ai_analysis_tasks (created_at DESC);
```

### 12.3 `ai_evidence_items`（统一证据链，AI-04 建表）

```sql
CREATE TABLE ai_evidence_items (
  id           BIGSERIAL PRIMARY KEY,
  task_id      BIGINT NOT NULL,                  -- 关联 ai_analysis_tasks.id
  source_type  VARCHAR(50) NOT NULL,             -- hazard|accident|document|image|regulation|standard_clause|sql_result
  source_table VARCHAR(100),                     -- 来源表名（只读引用）
  source_id    BIGINT,
  evidence_type VARCHAR(50) NOT NULL DEFAULT 'text',  -- text|file|image|sql_result
  content      TEXT,                             -- 证据内容/摘要
  file_id      BIGINT,                           -- 关联文件（只读引用）
  confidence   DECIMAL(5,2),                     -- 支撑度 0-1
  direction    VARCHAR(10) NOT NULL DEFAULT 'input',   -- input|output
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ai_evidence_task   ON ai_evidence_items (task_id);
CREATE INDEX idx_ai_evidence_source ON ai_evidence_items (source_type, source_id);
```

### 12.4 `ai_provider_configs`（Provider 配置，AI-04 评估启用）

```sql
CREATE TABLE ai_provider_configs (
  id           BIGSERIAL PRIMARY KEY,
  provider     VARCHAR(50) NOT NULL UNIQUE,      -- grok|ollama|openai_compatible
  display_name VARCHAR(100),
  base_url     TEXT,
  api_key_ref  VARCHAR(200),                     -- 引用 .env 变量名（不存明文密钥）
  model        VARCHAR(100),
  capabilities JSONB,                            -- 能力声明覆盖
  is_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

> 设计决策：**密钥不入库**（`api_key_ref` 指向 `.env` 变量名）；此表仅做元数据/开关，避免密钥管理复杂度。AI-04 前以 `.env` 为准，此表可选。

### 12.5 RAG 表（AI-06 建表）

```sql
CREATE TABLE ai_rag_documents (
  id           BIGSERIAL PRIMARY KEY,
  source_type  VARCHAR(50) NOT NULL,             -- document|standard|regulation|report
  source_id    BIGINT,                           -- 只读引用
  title        VARCHAR(300),
  chunk_count  INTEGER DEFAULT 0,
  embed_model  VARCHAR(100),
  status       VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending|indexed|failed
  indexed_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ai_rag_chunks (
  id           BIGSERIAL PRIMARY KEY,
  document_id  BIGINT NOT NULL,                  -- 关联 ai_rag_documents.id
  chunk_index  INTEGER NOT NULL,
  content      TEXT NOT NULL,
  metadata     JSONB,
  embedding    VECTOR(1024),                     -- 依赖 pgvector 扩展（需用户确认安装）
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, chunk_index)
);
```

### 12.6 双轨制字段规范（设计期固化，不改现有表）

统一能力层强制约束：**任何域通过统一层产出 AI 建议时，落库字段必须是 `ai_verdict/ai_evidence/ai_suggestion/ai_confidence/ai_findings/ai_missing_items`（或域内既有 `ai_*` 字段）；人工轨 `compliance_status/manual_remark/checked_by/checked_at` 只允许 `POST /tasks/:id/confirm` 由人工写入。** 各域现有 ai_* 字段不强制改名（避免破坏），新增域一律按此规范。

---

## 13. 前端基线（Naive UI 冻结 + 配套设计）

### 13.1 冻结项（AI-01 确认，本阶段再次固化）

- UI 框架：**Naive UI 2.44.1**（web-naive）；禁止 ant-design-vue / element-plus / 新 UI 框架 / 新状态管理框架。
- 依赖注入路径：Vben adapter（`src/adapter/component/index.ts`）按需引入 Naive 组件。
- 现有 AI 页 `/overview/ai-analysis`（`views\hse\ai-analysis\index.vue`）为静态占位——**AI-02 不改**；处置方案（重写/标注/隐藏）需用户确认（AI-01 附录 #9）。

### 13.2 配套组件清单（AI-03+ 分批落地，本阶段仅设计）

| 组件 | 选型（冻结） | 用途 | 阶段 |
|---|---|---|---|
| SSE 流式消费 | `fetch` + `ReadableStream` 封装（`src/api/hse/ai-stream.ts`，设计稿） | 消费 `/v2/generate/stream` | AI-03 |
| Markdown 渲染 | Naive 生态外需引入 **md-editor-v3 或 markdown-it**（需用户确认新增依赖；AI-01 已确认当前无任何 markdown 渲染） | AI 报告/证据链展示 | AI-03 |
| 图片预览 | Naive `NImage`（经 adapter 注入） | 视觉分析页 | AI-05 |
| 模型健康页 | Naive `NDataTable` + `NTag` | `/v2/health` + `/v2/models` 展示 | AI-03 |
| 任务/证据链页 | Naive `NDescriptions` + `NSteps` | `/v2/tasks/:id` 证据链 | AI-04 |

### 13.3 前端 API 层基线

- 新建 `src/api/hse/ai-v2.ts`（设计稿）：封装 §8 全部端点，统一 `responseReturn:'data'`（沿用 `src/api/request.ts`）。
- 禁止在页面内直接拼 fetch；统一经 api 层 + SSE 封装。

---

## 14. Workbuddy 并行任务依赖记录

AI-01 §21 保护清单全量适用。本阶段 AI-02 **未修改任何保护对象**。统一架构对 Workbuddy 在迁对象的依赖，按「识别 / 记录 / 设计接口边界」处理如下：

| 依赖对象 | 依赖原因 | 当前状态 | 潜在冲突 | 推荐解决方案 | 需用户确认 |
|---|---|---|---|---|---|
| `grid_inspection_records` / `grid_record_sync_map` / `grid_areas` | AI 若做「网格巡检趋势/责任分析」需只读查询 | Workbuddy P2-B0 迁移中 | 结构可能随迁移变化 | 统一层**不直接 SQL**；由 Workbuddy 迁移完成后提供稳定只读视图，AI 阶段再接入 | ✅（AI-03 前确认） |
| 三违（violation/sanwei 系列） | AI 三违分析/责任关系判断（未来） | P2-B1-E-08-04 迁移中 | 表结构/关系未冻结 | AI-03/04 **不接入三违**；待迁移验收后再评估只读接入 | ✅ |
| `wps*` 服务/脚本 | 无直接依赖（AI 不触碰 WPS） | — | — | 不接入 | 否 |
| 考核联动（assessment*） | 月报/趋势分析可能引用考核结果 | 迁移中 | 联动规则未冻结 | 引用只读统计接口，不写库 | ✅（AI-04 前确认） |
| 事故台账（accidents） | 报告/根因分析取数（**已在用**：aiEnhancedService.fetchDataByType） | 在用 | Workbuddy 事故 artifacts 仍在使用 | 维持现状只读；不新增事故表结构依赖 | 否 |

**边界结论**：AI-02 设计的统一层**不依赖任何 Workbuddy 在迁表结构**——所有业务取数走各域既有 service 的只读查询（如 `aiEnhancedService.fetchDataByType`），统一层只定义「从业务域拿什么 + 拿完干什么」，不定义「业务域内部结构」。

---

## 15. 风险分析

| 风险 | 等级 | 说明 | 缓解（设计内置） |
|---|---|---|---|
| 统一层与现有 aiService 双轨漂移 | 高 | 若实施偏离「原地演进」原则，出现两套 Provider | §4.8 强制演进路径 + 现有 7 消费方零改动验收 + `aiService.unit.test.js` 回归 |
| Workbuddy 迁移冲突 | 高 | 三违/WPS 未冻结，AI 误读表结构 | §14 边界：统一层不直接 SQL 在迁表；任何交集先问用户 |
| 双轨制破坏 | 高 | AI 误写人工轨字段 | Gateway 层字段白名单（§12.6）+ confirm 端点唯一人工写入口 |
| 生产数据边界 | 高 | 5876/生产 `.env`/生产表 | prod-boundary 全量适用；统一层只读消费，写库走单次授权 |
| 新增表与现有迁移冲突 | 中 | 200+ 迁移脚本 + Workbuddy 主战场 | 表名 `ai_` 前缀隔离；建表 SQL 独立文件（`ai_platform_v1.sql`）；AI-04 建表前再确认无同名 |
| 前端占位页误导 | 中 | 硬编码假数据（12/3580/92/86） | AI-03 前由用户决定：隐藏/标注「未接入」/重写 |
| Markdown 依赖引入 | 中 | 项目当前零 markdown 渲染，需新增依赖 | 需用户确认后引入；选型固定（md-editor-v3 或 markdown-it） |
| 流式协议兼容 | 中 | Grok/Ollama/兼容协议三种 SSE 格式 | Provider 内部归一（§4.5 解析表），Gateway 输出统一格式（§8.2） |
| Token/成本不可控 | 中 | 无成本统计 | `ai_analysis_tasks.cost_cents` + `/v2/tasks` 统计视图（AI-04+） |
| OCR 环境依赖 | 中 | Python 子进程，部署形态未确认 | 维持现状；视觉 AI 与 OCR 解耦（§10.3） |

---

## 16. 后续实施计划（AI-03 起）

> 每个阶段独立验收、独立归档；统一层落地以「一个能力、一个域、一个验证」推进。

| 阶段 | 内容 | 主要交付 | 依赖确认 |
|---|---|---|---|
| **AI-03** | Provider 统一骨架落地 | `providerRegistry` + `grokProvider`/`ollamaProvider`（现有逻辑迁移）+ `openaiCompatibleProvider` + `providerRegistry` 路由 + `/v2/generate`、`/v2/generate/stream`、`/v2/models`、`/v2/health`；`aiService.js` 内部委托（导出面不变）；前端 SSE 消费封装 + Markdown 依赖引入 | 模型凭证（DeepSeek key 或 Ollama 安装授权）；ai.js 端点处置 |
| **AI-04** | Prompt Registry + 统一任务/证据链 | `ai_prompt_registry` / `ai_analysis_tasks` / `ai_evidence_items` 建表；`promptRegistry` 迁移现有 9 模板（版本化）；`taskService`/`evidenceService`；`/v2/structured`、`/v2/tasks*`、`/v2/prompts*`、`/v2/tasks/:id/confirm`；前端任务/证据链页 | 建表授权；统一表演进方式确认 |
| **AI-05** | 视觉 AI | `visionService` + `/v2/vision` + 本地 VL 模型（Qwen3-VL-4B Q4 起步）+ 前端图片预览/识图页（双轨） | 本地 VL 模型安装授权；视觉模型凭证 |
| **AI-06** | RAG | pgvector 安装授权 → chunker/embedder/retriever + `/v2/rag/index`、`/v2/rag/query` + `ai_rag_*` 建表 | pgvector 授权（避开 Workbuddy 迁移窗口） |
| **AI-07** | 域接入 + 收编 | 逐域切换统一层（document/report/standard_eval）；`ai.js` 4 端点按 §9.2 处置；`/overview/ai-analysis` 重写为真实页 | 用户对各域切换的逐项确认 |

**每阶段硬性检查**：不触碰 §14 保护清单 / 双轨制字段白名单 / 生产边界 / 前端冻结项 / 测试保持绿色。

---

## 17. 本阶段明确不做的事

1. 不编写/修改任何业务代码、SQL、前端代码（本文档代码均为设计契约）。
2. 不建表、不改数据库、不装依赖、不装模型、不改 `package.json`。
3. 不修改 `server/.env` 与生产 `.env`；不启停 5876。
4. 不删除/移动/修改 `ai.js`、`ai-enhanced`、`training-ocr` 任何端点。
5. 不触碰 WPS / 三违 / `grid_*` / Workbuddy 工作区（§14 全清单）。
6. 不引入新 UI 框架、不改登录/权限/Vben 核心。
7. 不自行决定「需用户确认」事项（附录清单）。

---

## 附录：需用户确认清单（AI-02 新增）

| # | 事项 | 发现/建议 | 影响 | 确认后下一步 |
|---|---|---|---|---|
| 1 | `ai.js` 4 端点处置 | `/qa` 废弃；risk-predict/anomaly-detect/classify 迁移分析域或标注 rule-based | §9.2 双挂载治理 | AI-03 按决策执行（本阶段不动） |
| 2 | 默认模型凭证 | `.env` `AI_PROVIDER=grok` 但 key 空；DeepSeek 或 Ollama 本地哪个作默认 | Provider 可用性 | AI-03 前配置可用凭证 |
| 3 | Ollama 安装授权 | 代码已支持，本机是否装/可否装 | 本地模型基线 | AI-03 决定落地方式 |
| 4 | Markdown 渲染依赖 | 需新增 md-editor-v3 或 markdown-it（当前零 markdown） | AI 报告展示 | AI-03 引入授权 |
| 5 | 统一任务表演进 | 新表与 document_ai_analysis/ai_generation_records 并存期「先双写后单写」是否认可 | §7.3 | AI-04 建表时执行 |
| 6 | 新增 6 张 ai_* 表授权 | 均独立新表，不改现有 | §12 | AI-04 起分批建表 |
| 7 | 前端 AI 占位页处置 | 重写/标注「未接入」/隐藏 | 误导风险 | AI-03 前处置 |
| 8 | v2 端点挂载方式 | 建议先 `/api/hse/ai/v2` 独立前缀，后收编 | §9 | AI-03 按此执行 |
| 9 | pgvector 安装 | RAG 前置依赖，属数据库变更 | §11/§12.5 | AI-06 前授权 |

**AI-01 遗留确认项继续有效**（生产前端应用 / Provider 运行时配置 / 本机 Ollama / PostgreSQL 版本 / grid_* 建表来源 / OCR 运行环境 / ai-enhanced 拆分归属 / AI 占位页处置），未在本阶段重复列出的不再赘述。

---

*本报告基于 2026-09-14 只读复核完成；所有结论均有文件路径证据；本阶段零代码、零数据库、零配置修改。设计契约供 AI-03+ 实施，任何实施均需用户对附录确认清单逐项授权。*
