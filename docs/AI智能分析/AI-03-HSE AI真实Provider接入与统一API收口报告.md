# AI-03：HSE AI 真实 Provider 接入与统一 API 收口报告

> 阶段：AI-03（HSE AI 智能分析项目 · 阶段三）
> 执行：Trae + DeepSeek V4 Flash
> 日期：2026-09-14
> 项目：`G:\hse-dashboard`
> 前置：AI-01（现状审计，已审核）→ AI-02（统一能力层基础架构建设，已审核）
> 总进度：`docs\AI智能分析\AI智能分析实施进度.md`

---

## 1. 执行摘要

本阶段目标不是开发具体 HSE AI 业务能力，而是**让 AI-02 建立的统一能力层真正形成可调用、可验证、可兼容的统一 API**。目标链路：

```text
Frontend
   ↓
/api/hse/ai/v2/*
   ↓
AI Gateway
   ↓
Provider Registry
   ↓
Grok / Ollama / OpenAI-Compatible
   ↓
AI Result
   ↓
Evidence / Generation Record
```

**完成状态：PASS**

- 统一 v2 API 六端点（health/providers/models/generate/stream/analyze）全部落地，**全部经 AI Gateway**，无 Route→Provider 直连。
- 统一 SSE 信封（`event:start → chunk → end` / `event:error`）真实链路验证通过：Grok 不可用时客户端能收到完整生命周期（start → error），不伪造、不悬挂。
- Provider / Model 能力面（`getProvidersInfo` / `getModelsInfo`）如实返回状态：Grok `NOT_CONFIGURED`、Ollama `UNREACHABLE`、OpenAI-Compatible `NOT_CONFIGURED`，不伪造模型。
- Legacy API（ai.js 4 端点 + ai-enhanced 6 端点）全部保持可访问、未删除、未破坏；路由级兼容验证 4 项 PASS。
- AI 双轨制继续锁死：v2 请求中出现 `compliance_status/checked_by/checked_at/manual_remark` 一律忽略，绝不写入人工结果。
- 测试真实运行：单元测试 **57/57 PASS**（AI-02 的 55 项 + AI-03 新增 2 项 SSE 信封测试）；路由级集成验证 **13/13 PASS**（开发端口 5881，未触碰生产 5876）。
- Migration Preflight 完成：两库均**不存在** `ai_prompt_registry` 与 `ai_generation_records`（与 AI-01 报告声称"表存在"冲突，见 §18/§24），migration 已幂等化，**未执行**，待用户授权。

真实模型调用状态（如实，不伪造）：

```text
Grok：NOT_CONFIGURED（GROK_API_KEY 为空，未填测试密钥）
Ollama：UNREACHABLE（本机未安装/未运行）
OpenAI-Compatible：NOT_CONFIGURED（未配置 Base URL / Model）
真实端到端 SSE 分块：BLOCKED（无可用 Provider，如实标记）
```

---

## 2. AI-02 基线继承

AI-03 完整继承 AI-02 冻结成果，未推翻任何架构：

| AI-02 冻结成果 | AI-03 处理 |
|---|---|
| `server/services/ai/errors.js`（10 类统一错误码） | 继续使用；v2 错误统一 `{success:false,error:{code,message,provider,retryable,requestId}}` |
| `aiRequestContext.js`（requestId/traceId） | 继续使用；SSE start/end 帧携带 requestId/traceId |
| `aiEvidenceService.js`（8 类来源 + 强度） | 继续使用；v2 generate/analyze 响应透传 `evidence[]` |
| `aiPromptRegistry.js`（hse.general.analysis v1.0） | 继续使用；promptKey 链路解析经路由级测试验证 |
| `aiHealthService.js`（8 状态真实探测） | 继续使用；/v2/health 与 /v2/providers 均基于其真实探测 |
| `aiProviderRegistry.js`（Grok/Ollama/OpenAICompatible） | **原地演进**：复用 Provider 抽象，禁止建 provider2/modelService2/aiService2 平行体系（已遵守） |
| `aiGenerationRecordService.js`（复用 ai_generation_records + 扩展列自动探测） | 继续使用；migration 未执行时静默降级 |
| `aiGateway.js`（generate/stream/analyze/getHealthSummary） | **增强**：stream 重写为统一 SSE 信封；新增 getProvidersInfo/getModelsInfo |
| 55/55 单元测试 | 保持全绿，AI-03 新增 2 项 → **57/57** |

**未触碰**：登录/JWT/认证/权限核心机制、Vben 核心目录、Naive UI、状态管理框架、WPS/三违/网格/考核业务代码、`grid_inspection_records`、`grid_record_sync_map`、`grid_areas`、`wpsGrid*`、生产 .env、生产 5876。

---

## 3. Provider Registry

- 检查 `server/services/ai/aiProviderRegistry.js` + `aiService.js`：AI-03 继续使用 AI-02 已建立的 Provider 抽象，**未重新创建任何平行体系**。
- Provider 统一接口已具备：`chat` / `chatStream` / `isAvailable` / `healthCheck` / `getMetadata` / `capabilities`（另兼容 `chatStructured/vision/embed/listModels` 扩展约定）。
- Grok/Ollama 协议层复用 `aiService.js`（chat/chatStream 委托）；OpenAI-Compatible 为自实现 Chat Completions 协议（未配置 → NOT_CONFIGURED）。
- 能力路由（`selectProviderByCapability`）与错误归类（`classifyProviderError` → 统一 AiError）保持。
- **AI-03 对 aiService.js 的唯一改动**：`chatStream` 增加 `skipHeaders` / `skipEnd` 两个可选项，由 AI Gateway 控制 SSE 头与响应生命周期（默认行为不变，旧调用方零影响）。

---

## 4. Provider 状态（真实，不伪造）

| Provider | 状态 | 原因 | 验证方式 |
|---|---|---|---|
| Grok | `NOT_CONFIGURED` | `GROK_API_KEY is empty`（.env 空密钥保留未填） | /v2/providers 实测 + 单元测试 |
| Ollama | `UNREACHABLE` | 本机未安装/未运行 Ollama 服务 | /v2/providers 实测 + 单元测试 |
| OpenAI-Compatible | `NOT_CONFIGURED` | `AI_OPENAI_BASE_URL/AI_OPENAI_MODEL` 未配置 | /v2/providers 实测 + 单元测试 |
| unknown provider | `AI_PROVIDER_NOT_FOUND` | 未注册 provider 请求 | 单元测试（Gateway 路径） |

未修改任何真实密钥、未写入测试密钥、未安装 Ollama、未下载模型、未伪造 `available:true`。

---

## 5. AI Gateway

`server/services/ai/aiGateway.js` 增强点：

1. **stream 重写为统一 SSE 信封**（AI-03 §9）：先写 SSE 头 + `event:start`（含 requestId/traceId/provider/model/promptKey/promptVersion），再执行 Provider 健康检查（失败 → `event:error` 并结束），成功后委托 Provider `chatStream`（透传 chunk），最后写 `event:end`（含 durationMs）。
2. 新增 `getProvidersInfo()`：Provider 能力明细（provider/type/status/model/baseUrl/configured/available/reason/capabilities），不暴露 Provider 私有格式。
3. 新增 `getModelsInfo()`：统一模型列表（provider/model/available/status/capabilities[]），无法取得模型列表时如实返回 NOT_CONFIGURED/UNREACHABLE，**不伪造模型**。
4. 保留 `generate` / `analyze` / `getHealthSummary` / `resolvePrompt` / `resolveProvider` / `toErrorResponse` / 统一错误模型。

**Gateway 是 v2 全部写端点的唯一入口**：Route → Gateway → Provider Registry → Provider，禁止 Route → Provider 直连（已满足）。

---

## 6. v2 API（/api/hse/ai/v2）

新建 `server/controllers/aiV2Controller.js` + `server/routes/ai-v2.js`，app.js L468 挂载：

```text
GET  /api/hse/ai/v2/health     → gateway.getHealthSummary()
GET  /api/hse/ai/v2/providers  → gateway.getProvidersInfo()
GET  /api/hse/ai/v2/models     → gateway.getModelsInfo()
POST /api/hse/ai/v2/generate   → gateway.generate()
POST /api/hse/ai/v2/stream     → gateway.stream()（SSE）
POST /api/hse/ai/v2/analyze    → gateway.analyze()
```

- 鉴权：全局 `authMiddleware`（app.js /api 前缀）覆盖全部端点；写端点（generate/stream/analyze）追加 `requireRole('admin','safety_manager')`；读端点任意登录用户可访问（与 provider/status 惯例一致）。
- 统一请求解析 `parseUnifiedInput`：`promptKey/promptVersion | prompt` + `input` + `source{domain,recordId}` + `options` + `systemPrompt/customInstructions`；`userId` 取认证上下文 `req.user.id`，**不推断 employeeId**（AI-02 基线）。
- 统一响应：不暴露 Provider 私有返回格式。

**双轨制锁死（§24）**：`stripDualTrackFields` 在控制器入口剥离 `compliance_status/checked_by/checked_at/manual_remark` —— 请求中出现这些字段一律**忽略**（不写入人工结果），路由级测试已验证。

---

## 7. Generate（POST /v2/generate）

- 请求：`promptKey` 优先（经 Prompt Registry 解析），否则 `prompt` 直传；支持 `provider` 显式选择与默认 Provider。
- 链路：Route → Gateway.generate → resolvePrompt → resolveProvider → assertProviderReady → Provider.chat → 统一响应。
- 响应至少包含：`success / requestId / traceId / provider / model / promptKey / promptVersion / content / usage{inputTokens,outputTokens,durationMs} / evidence[] / recordId / recordSaved`。
- 真实状态：Grok 无 Key → 统一错误 `AI_PROVIDER_NOT_CONFIGURED`（路由级实测）；promptKey 链路同样走到 Provider 层才失败，证明 Prompt 解析→Provider 解析链路完整。

---

## 8. Stream（POST /v2/stream）

- SSE 统一协议（AI-03 §9，与现有 `data:{content}` 分块格式兼容，补齐生命周期事件）：

```text
event: start   → data: {requestId, traceId, provider, model, promptKey, promptVersion}
data: {content: ...}（Provider 原样透传，多帧）
data: [DONE]（Provider 结束标记）
event: end     → data: {requestId, provider, model, durationMs}
```

- 错误：

```text
event: error   → data: {code, message, provider, retryable, requestId}
```

- 关键设计：`event:start` **先于** Provider 健康检查写入 → Provider 不可用时客户端仍能收到完整生命周期（start → error），不会悬挂或只有半截流。
- `aiService.js` `chatStream` 增加 `skipHeaders`/`skipEnd`，由 Gateway 统一控制 SSE 生命周期（默认行为不变）。
- 错误路径兜底：controller 捕获 Gateway 抛出的异常 → `sendSseError` 补发 `event:error`（仅在响应头未写入时）。

---

## 9. Models（GET /v2/models）

- 统一模型信息：`provider / model / available / status / capabilities[]`（chat/stream/structured/vision）。
- 无法取得模型列表时**如实返回** `NOT_CONFIGURED` / `UNREACHABLE`，不伪造模型。
- 路由级实测：3 个 Provider 全部 `available=false`（Grok NOT_CONFIGURED / Ollama UNREACHABLE / OpenAI-Compatible NOT_CONFIGURED），`allNotAvailable=true` —— 符合任务书"不得伪造模型"要求。

---

## 10. Health（GET /v2/health）

- 响应：`success / requestId / aiEnabled / activeProvider / providers[]（含 status/model/available/reason） / timestamp`。
- 路由级实测：`aiEnabled=true, activeProvider=grok`，providers 明细与真实探测一致。
- 结构复用 AI-02 统一 Health（`getHealthSummary`），未另建平行结构。

---

## 11. SSE

- **单元测试（新增 2 项，AI-03）**：
  - 统一 SSE 信封：先写 `event:start`（含 requestId/traceId）→ 透传 chunk → 写 `event:end`；
  - Provider 流中错误：写 `event:error` 并结束响应（`retryable` 判定正确）。
- **路由级实测（真实链路）**：`POST /v2/stream`（Grok 不可用）→ 收到 `event:start`（含 requestId/traceId）+ `event:error`（`AI_PROVIDER_NOT_CONFIGURED`），HTTP 200，流正常结束。
- **真实模型端到端分块：BLOCKED**（无任何可用 Provider，如实标记，不伪造成功帧）。
- 前端 `stream()` 消费端支持 `onStart/onChunk/onEnd/onError` 四类回调，Provider 不可用时走 `onError`（显示 AI_PROVIDER_NOT_CONFIGURED），不会一直 loading 或假装成功。

---

## 12. Prompt Registry

- 继续使用 `hse.general.analysis v1.0`；未创建 `hse.risk.analysis` / `hse.violation.analysis` / `hse.accident.analysis` 等业务 Prompt（留后续阶段）。
- AI-03 验证了完整追踪链：`requestId → promptKey → promptVersion → provider → model → result`：
  - 路由级测试：`POST /v2/generate` 带 `promptKey=hse.general.analysis&promptVersion=v1.0` → 链路解析执行到 Provider 层 → `AI_PROVIDER_NOT_CONFIGURED`（证明 Prompt 解析成功、Provider 选择执行）。
  - SSE start 帧携带 promptKey/promptVersion。
- 无业务判断硬编码（Prompt Registry 只负责模板/版本/元数据）。

---

## 13. Evidence

- 复用 `aiEvidenceService`（8 类来源 + low/medium/high 强度 + create/attach/validate 已测）。
- v2 generate/analyze 统一响应透传 `evidence[]`（Gateway 内由证据服务构建）。
- **证据只进 AI 建议轨**，绝不写入人工最终结果字段（compliance_status 等）——控制器入口 `stripDualTrackFields` 二次兜底。

---

## 14. Generation Record

- 继续复用 `ai_generation_records`（未新建 ai_records/ai_logs 等重复表）。
- `aiGenerationRecordService` 保留扩展列（request_id/prompt_key/prompt_version/evidence）自动探测：migration 未执行时静默降级，只写现有字段（向后兼容）。
- Gateway 落库失败不阻断 AI 结果：`recordSaved=false + recordError`（单元测试覆盖）。
- **注意**：Preflight 发现两库实际**不存在** `ai_generation_records` 表（与 AI-01 报告冲突，见 §18/§24），migration 执行后该服务才可真正落库。

---

## 15. Legacy API 治理

### 15.1 旧 API 全清单与分类（未删任何端点）

`server/routes/ai.js`（挂载 /api/hse/ai，L466）：

| 端点 | 实现 | 分类 | 调用方 | 当前状态 | 推荐未来去向 |
|---|---|---|---|---|---|
| POST /ai/risk-predict | 统计规则（hazards/accidents 均值±标准差预测） | LEGACY（规则） | 未发现前端活跃调用 | 可达（路由级实测 PASS） | 迁移至 HSE 数据智能分析域，或标注 rule-based |
| POST /ai/classify | 关键词规则分类（hazard/accident） | LEGACY（规则） | 未发现前端活跃调用 | 可达 | 迁移分析域，或标注 rule-based |
| POST /ai/anomaly-detect | 统计异常检测（stddev 阈值） | LEGACY（规则） | 未发现前端活跃调用 | 可达 | 迁移分析域，或标注 rule-based |
| POST /ai/qa | Mock（预留接口，source=mock） | MOCK | 未发现前端活跃调用 | 可达（路由级实测 PASS） | 建议废弃或接入 v2/generate 统一 |

`server/routes/ai-enhanced.js`（挂载 /api/hse/ai，L467；并行任务已三层化收口为纯聚合入口 `routes/ai-enhanced/main.js`）：

| 端点 | 实现 | 分类 | 调用方 | 当前状态 | 推荐未来去向 |
|---|---|---|---|---|---|
| POST /ai/generate-report | AI 真实（aiService 委托）+ stream 支持 | CURRENT | 前端 ai.ts generateReport/streamGenerateReport | 可达（路由级实测 PASS） | 逐步收口至 Gateway 统一（保留兼容） |
| POST /ai/root-cause | AI 真实（rca 模板） | CURRENT | 前端 | 可达 | 逐步收口至 Gateway |
| GET /ai/records、/records/:id、DELETE /records/:id | DB CRUD（行级过滤） | CURRENT | 前端 | 可达 | 保留（Generation Record 查询面） |
| POST /ai/provider/status | 统一健康汇总（旧字段 + providers[]） | CURRENT | 前端 ai.ts getProviderStatus | 可达（路由级实测 PASS） | 与 /v2/health 共存，逐步收口 |

### 15.2 迁移映射

```text
旧 API                          → v2 API
POST /ai/generate-report        → POST /api/hse/ai/v2/generate（promptKey: hse.general.analysis）
POST /ai/generate-report?stream → POST /api/hse/ai/v2/stream（统一 SSE 信封）
POST /ai/root-cause             → POST /api/hse/ai/v2/analyze（结构化输出）
POST /ai/provider/status        → GET  /api/hse/ai/v2/health（+ /v2/providers）
GET  /ai/records*               → 保留（记录查询面暂不迁移）
/ai/qa、/ai/risk-predict、/ai/classify、/ai/anomaly-detect → 待用户确认处置（本阶段不改不删）
```

### 15.3 兼容验证结论

- 旧端点**全部保持可访问**（路由级实测 4 项：provider/status、/qa mock、generate-report 挂载、risk-predict 规则接口）。
- 未删除 `ai.js` / `ai-enhanced.js` / `aiService.js`，未破坏现有调用。
- **并行变更提示**：`server/routes/ai-enhanced.js` 已被并行任务（三层化拆分，与 hse-dashboard/hse-tasks/training-ocr/regulations 同系列）收口为聚合入口（`routes/ai-enhanced/main.js` + `controllers/aiEnhancedController.js` + `services/aiEnhancedService.js`，原文件备份 `routes/__orig_ai-enhanced.js`）。AI-03 未参与该拆分，仅做兼容验证（端点注册顺序与鉴权绑定经 main.js 复核一致，路由级测试全 PASS）。见 §24-5。

---

## 16. 前端 API（src/api/hse/ai.ts）

- 未重复创建 API 文件；在 AI-02 已建文件上**增量增加** 6 个 v2 方法（按真实用途，非凑数）：
  - `getHealth()` → GET /hse/ai/v2/health
  - `getProviders()` → GET /hse/ai/v2/providers
  - `getModels()` → GET /hse/ai/v2/models
  - `generate(data)` → POST /hse/ai/v2/generate
  - `stream(data, handlers)` → POST /hse/ai/v2/stream（统一 SSE 解析 start/chunk/end/error）
  - `analyze(data)` → POST /hse/ai/v2/analyze
- 类型定义：`V2ProviderInfo / V2HealthResult / V2ModelInfo / V2RequestParams / V2GenerateResult / V2StreamHandlers`。
- SSE 消费继续使用 `fetch + ReadableStream`（未引入新 SSE 依赖）；真实 Provider 不可用时走 `onError`（code=AI_PROVIDER_NOT_CONFIGURED），不会一直 loading 或假装成功。
- **Markdown**：项目仍无 Markdown 渲染依赖，AI 输出保留 raw text（见 §24-4）。

---

## 17. Migration Preflight

只读脚本 `server/preflight_ai_migration.tmp.cjs`（结果 `server/preflight_out.tmp.txt`）对两库检查：

```text
DB[safety_dashboard]     gen=null prm=null grid=grid_inspection_records users=users docai=document_ai_analysis publicTables=358
DB[safety_dashboard_dev] gen=null prm=null grid=grid_inspection_records users=users docai=document_ai_analysis publicTables=358
```

| 检查项 | 结果 |
|---|---|
| ai_prompt_registry 是否存在 | **不存在**（两库均为 NULL） |
| ai_generation_records 是否存在 | **不存在**（两库均为 NULL） |
| 索引/唯一约束 | 表不存在，无索引/约束可查 |
| 迁移幂等性 | 已改为 `CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS`，全量建表/增量补齐两场景幂等 |
| 是否修改业务数据 | 否（只新增 AI 基础设施表/扩展列） |
| 是否涉及 Workbuddy 表 | 否（grid_inspection_records/users/document_ai_analysis 仅只读探测，未触碰） |
| ai_prompt_registry / ai_generation_records 以外业务表变化 | 无 |

**冲突记录**：AI-01/AI-02 报告声称 `ai_generation_records` 表存在（源自 ai_tables.sql 迁移文件），Preflight 实测两库均不存在 → 以代码实际状态为准，migration 按"表不存在 → 全量创建"路径执行，见 §24-1。

---

## 18. 数据库变化

- **零执行**：未连接生产数据库、未执行任何 SQL、未创建/修改/删除任何表。
- migration 文件更新：`server/sql/ai_capability_layer_v1.sql` 幂等化（CREATE TABLE IF NOT EXISTS ai_prompt_registry / ai_generation_records + ADD COLUMN IF NOT EXISTS request_id/prompt_key/prompt_version/evidence(JSONB) + 索引 IF NOT EXISTS）。
- 执行方式：由用户/受权环境 `psql -f` 执行（生产边界规则），AI 不自动执行。

---

## 19. 测试

### 19.1 单元测试（真实运行）

```text
npx jest services/ai/aiCapabilityLayer.unit.test.js services/ai/aiApiLayer.unit.test.js
→ Test Suites: 2 passed, 2 total
→ Tests: 57 passed, 57 total（AI-02 55 项 + AI-03 新增 2 项 SSE 信封测试）
```

覆盖：错误模型 / Request Context / Evidence / Prompt Registry / Provider Health / Provider 注册表（Grok NOT_CONFIGURED、Ollama UNREACHABLE、OpenAI-Compatible NOT_CONFIGURED、unknown provider）/ Gateway.generate / Gateway.stream（含统一 SSE 信封 start/end/error）/ Gateway.analyze / Gateway.getHealthSummary / API providerStatus / Generation Record 落库失败不阻断。

### 19.2 路由级集成验证（真实运行，13/13 PASS）

`node scripts/ai03_v2_route_check.cjs`（开发端口 5881，符合 prod-boundary）：

```text
PASS v2/health 未认证 → 401            status=401
PASS v2/health 认证可达                status=200 aiEnabled=true active=grok
PASS v2/providers 含 Grok NOT_CONFIGURED   grok=NOT_CONFIGURED ollama=UNREACHABLE count=3
PASS v2/models 如实返回状态            count=3 allNotAvailable=true
PASS v2/generate 真实状态 NOT_CONFIGURED   code=AI_PROVIDER_NOT_CONFIGURED
PASS v2/generate promptKey 链路解析    code=AI_PROVIDER_NOT_CONFIGURED
PASS v2 双轨制字段被忽略               code=AI_PROVIDER_NOT_CONFIGURED
PASS v2/stream 统一 SSE 信封 start+error  start=true error=true
PASS v2/analyze 真实状态 NOT_CONFIGURED    code=AI_PROVIDER_NOT_CONFIGURED
PASS Legacy provider/status 兼容      status=200 providers=3
PASS Legacy ai.js /qa mock 仍可达     status=200 source=mock
PASS Legacy generate-report 仍挂载    status=200
PASS Legacy ai.js /risk-predict 仍可达 status=200 hasData=true
=== 汇总: 13/13 PASS ===
```

### 19.3 真实 Provider 测试

- GROK_API_KEY 仍为空 → 结果如实 `NOT_CONFIGURED`（PASS，判定正确）。
- Ollama 仍未安装 → 结果如实 `UNREACHABLE`（PASS，判定正确）。
- 无真实 Provider 情况下测试仍 PASS，因为验证的是**正确识别不可用状态**而非伪造模型调用成功（符合任务书 §27）。

---

## 20. Git

- **开始前** git status 已核查（记录 AI-02/Workbuddy 基线）。
- **完成后** git status 再次核查，AI-03 修改与并行修改可区分，未覆盖/未回滚任何并行变更。
- AI-03 修改/新增文件：

```text
修改：server/app.js（挂载 v2 路由）
修改：server/services/aiService.js（chatStream 增加 skipHeaders/skipEnd）
修改：server/services/ai/aiGateway.js（统一 SSE 信封 + getProvidersInfo/getModelsInfo）
修改：server/services/ai/aiCapabilityLayer.unit.test.js、aiApiLayer.unit.test.js（SSE 信封测试）
修改：server/sql/ai_capability_layer_v1.sql（幂等化）
修改：安全看板vben/apps/web-naive/src/api/hse/ai.ts（+6 个 v2 方法）
新增：server/controllers/aiV2Controller.js
新增：server/routes/ai-v2.js
新增：server/scripts/ai03_v2_route_check.cjs（路由级验证脚本）
新增：server/preflight_ai_migration.tmp.cjs + server/preflight_out.tmp.txt（Preflight 只读脚本/结果）
```

- 未执行 git reset / checkout -- . / clean 等破坏性操作。

---

## 21. Workbuddy 隔离

- AI-03 修改面全部位于 AI 域（server/services/ai/、aiService.js、app.js v2 挂载、aiV2Controller、ai-v2 路由、前端 ai.ts、server/sql/）、测试脚本与文档。
- **Workbuddy 并行变更（未触碰、未覆盖、未回滚）**：violations / assessment* / grid-attribution / hse-tasks / regulations / training-ocr / hse-dashboard 三层化拆分、ruleEngine、sanwei*、gridViolationCandidateService 等（见 git status）。
- **提示**：`server/routes/ai-enhanced.js` 三层化收口属并行变更（非 AI-03 所为），AI-03 仅做兼容验证（§15.3）。若用户需确认该拆分行为等价，见 §24-5。
- 无冲突：AI-03 未消费/未修改任何 Workbuddy 在迁表结构。

---

## 22. 风险

1. **migration 未执行**：Prompt Registry 仅内存态、Generation Record 扩展列不落盘（代码已自动探测降级）；且 Preflight 显示两库均无 `ai_generation_records` 表，执行前需用户确认建表范围。
2. **无真实 Provider**：真实模型生成/流式端到端不可用（如实呈现 NOT_CONFIGURED/UNREACHABLE/BLOCKED）。
3. **ai-enhanced 并行三层化**：行为等价未由用户确认（兼容测试 PASS，但建议复核）。
4. **AI-01 报告与数据库实际状态冲突**：报告称 `ai_generation_records` 存在，实测不存在 → 后续任何依赖该表的逻辑需以 migration 执行为前提。
5. **前端占位页** `/overview/ai-analysis` 仍为静态假数据，可能被误认为已上线。
6. **Markdown 依赖未定**：AI 输出暂为 raw text。
7. **双挂载仍存在**：/api/hse/ai 下 ai.js 与 ai-enhanced.js 并存（Step1 共存符合设计），收编需用户确认。

---

## 23. 未完成事项

- [ ] migration 执行（ai_prompt_registry + ai_generation_records 建表）——待授权
- [ ] 真实 Provider 端到端 SSE 分块验证——待凭证决策
- [ ] OpenAI-Compatible 流式真实链路（协议已支持，待配置）
- [ ] 前端占位页处置 / Markdown 渲染依赖决策
- [ ] Legacy 收编 Step2（ai.js 4 端点处置、ai-enhanced 逐步收口至 Gateway）
- [ ] employeeId 审计口径启用（req.user.id → users.employee_id → employee.id，需确认）

---

## 24. [需要用户确认]

1. **migration 执行授权**：Preflight 确认两库（safety_dashboard / safety_dashboard_dev）均**不存在** `ai_prompt_registry` 与 `ai_generation_records`。是否授权按幂等 SQL（CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS）在指定库执行？（生产库需单独明确授权）
2. **AI-01 报告冲突**：AI-01 报告声称 `ai_generation_records` 表存在（源自 ai_tables.sql），实测两库均不存在。是否以代码/数据库实际状态为准？（本报告已按实际处理）
3. **真实 Provider 凭证决策**：Grok API Key 是否提供？或配置 OpenAI-Compatible（DeepSeek/Qwen Base URL+Key）？或授权安装 Ollama？——用于 AI-04 真实链路验证。
4. **前端占位页处置 + Markdown 依赖**：/overview/ai-analysis 静态占位页如何处置（重写/标注/隐藏）？是否允许新增 Markdown 渲染依赖？
5. **ai-enhanced 并行三层化确认**：`server/routes/ai-enhanced.js` 已被并行任务三层化收口（main.js + controller + service），AI-03 兼容测试全 PASS；是否需用户复核行为等价？
6. **ai.js 4 端点未来去向**：/qa（mock，建议废弃）、/risk-predict、/classify、/anomaly-detect（统计规则，建议迁移分析域或标注 rule-based）——本阶段未改未删，处置留用户决策。

---

## 25. 下一阶段建议（AI-04）

1. 用户确认后执行 migration 并验证（两库建表 + 扩展列落库）。
2. 凭证决策后完成真实 Provider 端到端验证（generate + SSE 分块 + analyze 结构化输出）。
3. Legacy 收编 Step2：ai.js 4 端点处置落地；ai-enhanced 写端点逐步切换至 v2（generate/stream/analyze）并保兼容。
4. 前端：模型健康页/Provider 状态页（消费 /v2/health + /v2/providers）、AI 输出 Markdown 渲染（授权后）。
5. employeeId 审计口径启用评估。
6. 等待 ChatGPT 审核本报告与《AI智能分析实施进度.md》后，再生成 AI-04 唯一正式提示词。

---

*本报告由 Trae + DeepSeek V4 Flash 生成。AI-03 完成后立即停止，未自行开始 AI-04。*
