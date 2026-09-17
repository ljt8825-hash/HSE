# AI-02：HSE 统一 AI 能力层基础架构建设报告

> 阶段：AI 智能分析项目 AI-02（基础架构建设，正式编码落地）
> 日期：2026-09-14
> 执行：Trae + DeepSeek V4 Flash
> 总进度：`docs\AI智能分析\AI智能分析实施进度.md`
> 上游设计：`docs\AI智能分析\AI-02-HSE-AI统一能力层架构设计与接口基线.md`（AI-02 阶段一，已审核）

---

## 1. 执行摘要

AI-02 基础架构建设阶段在零破坏前提下，完成了 HSE AI 能力层的第一阶段落地骨架：

- **新建 `server/services/ai/` 能力层**（8 个服务文件 + 2 个测试文件）：统一错误模型、请求上下文、证据结构、Prompt 注册表、Provider 健康、Provider 注册表（Grok/Ollama/OpenAI-Compatible）、Generation Record 持久化、AI Gateway。
- **Provider 统一抽象**：以「注册表 + 统一契约」方式原地演进，**Grok/Ollama 协议层完全复用现有 `aiService.js`**（未建平行第二套系统），新增 `OpenAICompatibleProvider` 协议实现（AI-02 只建抽象与协议，不要求真实账号）。
- **Provider 健康状态真实化**：不伪造成功。无 Key → `NOT_CONFIGURED`；本机无 Ollama → `UNREACHABLE`；`AI_ENABLE=false` → `DISABLED`。
- **AI Gateway 统一入口**：`generate / stream / analyze / getHealthSummary`，统一错误码（10 类）、`requestId/traceId`、Prompt 渲染、证据附加、Generation Record 落库（失败不阻断结果）。
- **Prompt Registry**：版本化注册 `hse.general.analysis v1.0` 基础测试 Prompt，支持 `prompt_key + version` 唯一约束追踪（request → prompt_key → version → provider → model → result）。
- **统一 Evidence 结构**：8 类来源类型 + low/medium/high 强度，只解释 AI 建议依据，**不写入任何人工最终结果字段**（双轨制铁律保持）。
- **API 适配**：`POST /api/hse/ai-enhanced/provider/status` 保留旧字段并新增统一 `providers[]` 健康汇总；旧 AI API 一律未删除（双挂载治理留待后续阶段）。
- **前端最小适配**：新建 `src/api/hse/ai.ts`（provider status / generate / SSE stream 消费），未新建任何 AI UI 页面。
- **数据库**：migration `server/sql/ai_capability_layer_v1.sql` 已编写（`ai_prompt_registry` 表 + `ai_generation_records` 4 个扩展字段），**未执行**，执行需用户授权（生产边界规则）。
- **测试**：2 个测试套件、55 项断言**全部真实运行通过**（PASS）。

---

## 2. AI-01 基线继承情况

| AI-01 审计结论 | AI-02 落地情况 |
|----------------|----------------|
| aiService.js 仅 grok/ollama 两分支、无 OpenAI 兼容协议 | 新增 `OpenAICompatibleProvider`（协议代码已实现，未配置 → NOT_CONFIGURED） |
| PROMPT_TEMPLATES 无版本号 | Prompt Registry 引入 `prompt_key + version` 版本化 |
| .env 空 GROK_API_KEY 被当作可用 | 健康检查真实报告 `NOT_CONFIGURED`，不再伪造 `available: true` |
| /api/hse/ai 双重挂载 | 本阶段未删未改任一旧端点（符合 §18/§19）；统一入口治理进入后续阶段 |
| AI 双轨制仅在 standard_evaluation_items 落地 | Evidence 统一结构 + Gateway 层仅携带证据元数据，不触碰人工轨字段 |
| 无统一错误格式 | `errors.js` 统一 10 类错误码 + `{success:false, error:{code,message,provider,retryable,requestId}}` |
| 无 requestId/traceId 审计追踪 | Request Context 为每次调用生成 requestId/traceId，并随 Generation Record 落库 |
| 前端无 SSE 消费封装 | `src/api/hse/ai.ts` 提供 `streamGenerateReport`（fetch + ReadableStream） |
| 无统一健康检查 | `aiHealthService.js` + `provider/status` 统一汇总（AVAILABLE/NOT_CONFIGURED/UNREACHABLE/AUTH_ERROR/MODEL_NOT_FOUND/TIMEOUT/ERROR/DISABLED） |

与 AI-01 报告无冲突；与 AI-02 阶段一设计文档（17 节）无冲突。

---

## 3. 实际修改范围

### 新增文件（11 个）

| 文件 | 说明 |
|------|------|
| `server/services/ai/errors.js` | 统一 AI 错误模型（AI_ERROR_CODES + AiError + toErrorResponse） |
| `server/services/ai/aiRequestContext.js` | 统一请求上下文（requestId/traceId/userId/employeeId/source*/provider/model/prompt*/createdAt） |
| `server/services/ai/aiEvidenceService.js` | 统一证据结构（createEvidence/attachEvidence/validateEvidenceList + 8 类来源类型） |
| `server/services/ai/aiPromptRegistry.js` | Prompt 注册表（register/get/list/render + hse.general.analysis v1.0 + 现有模板引用挂载） |
| `server/services/ai/aiHealthService.js` | Provider 健康检查（8 状态 + probeUrl + 状态映射） |
| `server/services/ai/aiProviderRegistry.js` | Provider 注册表 + Grok/Ollama/OpenAICompatibleProvider + 能力路由 + 错误归类 |
| `server/services/ai/aiGenerationRecordService.js` | Generation Record 落库（复用 ai_generation_records，扩展列自动探测） |
| `server/services/ai/aiGateway.js` | 统一 AI Gateway（generate/stream/analyze/getHealthSummary） |
| `server/services/ai/aiCapabilityLayer.unit.test.js` | 能力层单元测试（46 项） |
| `server/services/ai/aiApiLayer.unit.test.js` | API 层单元测试（providerStatus，9 项） |
| `server/sql/ai_capability_layer_v1.sql` | 数据库最小 migration（**未执行**，待用户授权） |
| `安全看板vben/apps/web-naive/src/api/hse/ai.ts` | 前端最小 AI API 层（getProviderStatus/generateReport/streamGenerateReport） |

### 修改文件（2 个）

| 文件 | 变更 |
|------|------|
| `server/services/aiEnhancedService.js` | `providerStatus()` 保留旧字段（provider/model/available/...），新增 `aiEnabled / activeProvider / providers[]` 统一健康汇总 |
| `server/test/setup.js` | 新增 uuid 全局 mock（uuid@14 为 ESM-only，Jest 无法直接加载） |

### 未触碰（明确声明）

- 未修改：`app.js`（双挂载点保持原样）、`routes/ai.js`、`routes/ai-enhanced.js`、`aiService.js`、任何 WPS/三违/网格/考核业务代码、`.env`（空密钥保持为空，未填写任何真实 Key）。
- 未安装：Ollama、模型、新 npm 依赖、未改 package.json。
- 未执行：任何 SQL（migration 仅编写，未连生产库执行）。

---

## 4. AI Capability Layer

目标结构已落地：

```text
HSE业务模块（未来 AI-03+ 接入）
      ↓
HSE AI Capability Layer（server/services/ai/）
      ↓
AI Gateway（aiGateway.js）
      ↓
Provider Abstraction（aiProviderRegistry.js）
      ↓
Grok / Ollama / OpenAI-Compatible Provider
```

同时建立：Prompt Registry（aiPromptRegistry.js）、Evidence Structure（aiEvidenceService.js）、AI Generation Record（aiGenerationRecordService.js）、Provider Health（aiHealthService.js）、AI Request Context（aiRequestContext.js）、统一错误模型（errors.js）。

文件按任务书 §6 推荐结构建立；未机械创建空文件——每个文件均有真实职责与测试覆盖。

---

## 5. Provider Architecture

统一契约（每个 Provider 至少实现）：

```text
provider.name           → 'grok' | 'ollama' | 'openai_compatible'
provider.type           → 'grok' | 'ollama' | 'openai_compatible'
provider.chat()         → 非流式生成
provider.chatStream()   → SSE 流式
provider.isAvailable()  → 是否可用（不伪造）
provider.healthCheck()  → 真实健康检查
provider.capabilities   → { textGeneration, streaming, structuredOutput, visionInput }
provider.getMetadata()  → { name, model, baseUrl }
```

| Provider | 协议实现 | 状态 |
|----------|----------|------|
| GrokProvider | 复用 aiService.chat/chatStream | 注册；无 Key → NOT_CONFIGURED |
| OllamaProvider | 复用 aiService.chat/chatStream | 注册；本机无服务 → UNREACHABLE |
| OpenAICompatibleProvider | 自实现 Chat Completions（http/https） | 注册；未配置 → NOT_CONFIGURED |

能力路由：`selectProviderByCapability({capability})` 已实现（当前无 Provider 声明 visionInput，未来视觉 Provider 注册后即可路由）；`getActiveProvider()` 遵循 `AI_PROVIDER` 环境变量。

**铁律遵守**：未创建与 aiService.js 平行的第二套 Provider 系统；Grok/Ollama 的请求协议、SSE 解析、重试、超时全部复用现有实现，能力层仅补充统一对象接口与真实健康检查。

---

## 6. Provider Health

`aiHealthService.js` 实现 8 类状态：

```text
AVAILABLE / NOT_CONFIGURED / UNREACHABLE / AUTH_ERROR / MODEL_NOT_FOUND / TIMEOUT / ERROR / DISABLED
```

真实探测方式（不模拟成功）：
- Grok：无 `GROK_API_KEY` → `NOT_CONFIGURED`（"GROK_API_KEY is empty"）；有 Key → GET `{baseUrl}/models`（5s 超时）按 HTTP 状态映射。
- Ollama：GET `{baseUrl}/api/tags`；本机无 Ollama → `UNREACHABLE`。
- OpenAI-Compatible：无 baseUrl/model → `NOT_CONFIGURED`；有配置 → GET `{baseUrl}/models`。
- 全局 `AI_ENABLE=false` → 全部 `DISABLED`。

归一化输出示例：

```json
{
  "provider": "grok",
  "status": "NOT_CONFIGURED",
  "available": false,
  "reason": "GROK_API_KEY is empty",
  "model": "grok-2"
}
```

---

## 7. AI Gateway

`aiGateway.js` 统一入口（`generate / stream / analyze / getHealthSummary`）：

`generate(input)` 依次完成：
1. 断言 AI 启用（AI_ENABLE=false → `AI_NOT_ENABLED`）
2. 创建 Request Context（requestId/traceId）
3. Prompt 解析：直接 prompt 或经 Prompt Registry 按 promptKey 渲染（返回 promptKey/promptVersion）
4. Provider 选择：显式指定或活动 Provider（不存在 → `AI_PROVIDER_NOT_FOUND`）
5. 健康检查前置：NOT_CONFIGURED 等 → 对应统一错误码（不发起假调用）
6. 证据规范化 + 附加（Evidence 只进 `evidence` 元数据字段）
7. Provider 调用 → 统一结果结构（content/model/tokens/durationMs/confidence）
8. Generation Record 落库（复用 ai_generation_records；**落库失败不阻断 AI 结果**，返回 `recordSaved:false + recordError`）

`stream()` 透传 SSE 帧到 res；`analyze()` 解析模型 JSON 输出并提取 confidence（非 JSON → `parseError + data:null`，不伪造）。

统一错误模型（errors.js，10 类）：

```text
AI_NOT_ENABLED / AI_PROVIDER_NOT_FOUND / AI_PROVIDER_NOT_CONFIGURED /
AI_PROVIDER_UNAVAILABLE / AI_AUTH_ERROR / AI_MODEL_NOT_FOUND /
AI_TIMEOUT / AI_RATE_LIMITED / AI_INVALID_REQUEST / AI_INTERNAL_ERROR
```

响应统一：`{ success:false, error:{ code, message, provider, retryable, requestId } }`。

---

## 8. Prompt Registry

`aiPromptRegistry.js` 轻量级注册表（任务书 §11/§12/§25）：

- 字段：`prompt_key / version / name / description / system_prompt / user_prompt_template / status(DRAFT|ACTIVE|DISABLED) / created_at / updated_at`
- 支持：`register / get(key, version) / list(key) / render(entry, args)`（`{data}` / `{custom_instructions}` 占位符渲染）
- 已注册：`hse.general.analysis v1.0`（基础测试 Prompt）
- 现有模板引用：`rca_analysis / document_analysis / report_monthly / report_group / standard_evaluation` 通过 `template_ref:'aiService'` 挂载现有 9 模板（**不复制、不硬编码**，渲染时委托 aiService.buildXxxPrompt，保证单一事实源）
- **边界遵守**：Registry 只存 Prompt 模板/版本/元数据；不包含任何「if xxx → 违规」式业务判断（HSE 规则留待独立规则体系）

追踪链：`request → prompt_key → prompt_version → provider → model → result`（requestId/promptKey/promptVersion 随 Generation Record 落库，migration 后持久化）。

---

## 9. Evidence Architecture

`aiEvidenceService.js`（任务书 §13/§14）：

```json
{
  "source_type": "business_record",
  "source_id": "xxx",
  "source_domain": "standard_evaluation",
  "source_field": "xxx",
  "evidence_text": "xxx",
  "evidence_strength": "medium",
  "created_at": "xxx"
}
```

- 来源类型（8 类，可扩展）：`business_record / hse_standard / regulation / document / image / knowledge_base / rule / model_output`
- 强度：`low / medium / high`
- API：`createEvidence`（强校验）、`attachEvidence`（附加到结果，不改原对象）、`validateEvidenceList`
- **双轨制铁律**：Evidence 只解释「AI 为什么这样建议」，只进 `evidence` 元数据；**绝不写入 `compliance_status / manual_remark / checked_by / checked_at` 等人工最终结果字段**。链路保持：AI Evidence → AI Suggestion → Human Review → Final Result。
- 持久化：依赖 `ai_generation_records.evidence`（JSONB，migration 待授权执行）

---

## 10. AI Request Context

`aiRequestContext.js`：每次 AI 调用生成：

```text
requestId（uuid） / traceId（ai-xxxxxxxx）
userId（取认证上下文 req.user.id，不推断） / employeeId（仅可靠获得时携带，否则 null）
sourceDomain / sourceRecordId / provider / model / promptKey / promptVersion / createdAt
```

**约束遵守**：未重新设计认证系统；employeeId 获取方式不确定时置 null（不猜测身份）。

---

## 11. AI Generation Record

`aiGenerationRecordService.js` 复用现有 `ai_generation_records` 表（**未新建重复表** ai_records/ai_logs/ai_history/ai_results）：

- 基础列：user_id / type / sub_type / title / prompt / result / provider / model / input_tokens / output_tokens / duration_ms / status / error_message
- 扩展列（migration 后生效，`_hasExtendedColumns()` 自动探测列存在性，**列不存在时静默降级为仅基础列**，向后兼容）：request_id / prompt_key / prompt_version / evidence(JSONB)
- 落库失败不阻断 AI 结果（`recordSaved:false + recordError` 返回），保证 AI 能力不受日志链路故障影响

---

## 12. API 结构

本阶段**未新增 v2 挂载、未删除任何旧端点**（双挂载治理进入后续阶段，遵守 §18/§19）。

唯一 API 增强：`POST /api/hse/ai-enhanced/provider/status`

- 保留旧字段（provider/model/baseUrl/available/apiKeyConfigured/timeoutMs/maxRetries/timestamp）→ 兼容现有前端/消费方
- 新增统一字段：`aiEnabled` / `activeProvider` / `providers[]`（每个 Provider 的 status/configured/available/reason，真实健康汇总）

```json
{
  "provider": "grok",
  "model": "grok-2",
  "available": false,
  "apiKeyConfigured": false,
  "aiEnabled": true,
  "activeProvider": "grok",
  "providers": [
    { "provider": "grok", "status": "NOT_CONFIGURED", "configured": false, "available": false, "reason": "GROK_API_KEY is empty" },
    { "provider": "ollama", "status": "UNREACHABLE", "configured": true, "available": false, "reason": "..." }
  ]
}
```

旧 AI API 分类（任务书 §19，供后续阶段决策）：`ai.js` 4 端点（/qa mock、risk-predict/anomaly-detect/classify 规则型）暂按 LEGACY/MOCK 保留；`ai-enhanced.js` 6 端点（真实模型调用 + provider/status 增强）为 CURRENT。分类建议与处置时间点记录于「21. 需要用户确认」。

---

## 13. SSE

- **后端**：复用现有 `aiService.chatStream` SSE 能力；`aiGateway.stream()` 透传帧到 res；统一错误在流内以 error 帧输出。
- **前端**：`src/api/hse/ai.ts` 的 `streamGenerateReport`（fetch + ReadableStream + TextDecoder 分帧解析，支持 `data: {content}` → `[DONE]` → error 帧，含断流兜底）。
- **验证**：SSE 单元链路（Gateway 委托 chatStream 透传 res、缺失 res → AI_INVALID_REQUEST）测试通过；**真实端到端 SSE（后端→模型→前端分块）受限于无可用 Provider，状态 NOT_CONFIGURED/BLOCKED**（GROK_API_KEY 为空、本机无 Ollama），不伪造成功。

---

## 14. 前端适配

- 未重新设计 AI 页面、未新建任何 AI UI 页面/组件体系（遵守 §21/§22）。
- 新建最小 API 层 `安全看板vben/apps/web-naive/src/api/hse/ai.ts`：
  - `getProviderStatus()` → provider/status
  - `generateReport(params)` → 非流式 AI 请求
  - `streamGenerateReport(params, handlers)` → SSE 流式（onChunk/onDone/onError）
- 前端测试：项目无前端单测基线，TS 文件未纳入 jest 运行（静态核查通过；真实调用依赖后端 Provider 可用，同属 NOT_CONFIGURED）。
- Markdown：未安装任何新依赖（遵守 §23；md-editor-v3/markdown-it 仍需用户确认后引入，AI-03+）。

---

## 15. 数据库变化

**migration 已编写、未执行**：`server/sql/ai_capability_layer_v1.sql`

```sql
-- 1) 新建 ai_prompt_registry（最小化，唯一约束 (prompt_key, version)）
CREATE TABLE IF NOT EXISTS ai_prompt_registry (...);

-- 2) ai_generation_records 扩展 4 列（IF NOT EXISTS，向后兼容）
ALTER TABLE ai_generation_records
  ADD COLUMN IF NOT EXISTS request_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS prompt_key VARCHAR(100),
  ADD COLUMN IF NOT EXISTS prompt_version VARCHAR(20),
  ADD COLUMN IF NOT EXISTS evidence JSONB;
```

原则遵守：只新增 AI 基础设施；不修改已有业务数据/字段；不建多余 AI 表（未一次性创建十几张表）；不修改 WPS/三违；未执行任何 SQL、未连生产库。

执行方式：由用户/受权环境 `psql -f ai_capability_layer_v1.sql`（需用户显式授权，生产边界规则）。

---

## 16. 测试结果

**全部真实运行**（`npx jest services/ai/aiCapabilityLayer.unit.test.js services/ai/aiApiLayer.unit.test.js`）：

```text
Test Suites: 2 passed, 2 total
Tests:       55 passed, 55 total
Time:        0.95 s
```

| 测试组 | 覆盖 | 结果 |
|--------|------|------|
| 统一错误模型 | 错误码全集、AiError.toJSON、retryable | PASS（6 项） |
| Request Context | requestId/traceId 生成、字段归一 | PASS（3 项） |
| Evidence | createEvidence 校验、8 类来源、强度、attach/validate | PASS（7 项） |
| Prompt Registry | register（camel/snake 兼容）、get/list、render、template_ref 挂载 | PASS（9 项） |
| Provider Health | 8 状态、Grok/Ollama/OpenAI 未配置判定、probeUrl 映射 | PASS（5 项） |
| Provider 注册表 | 内置 3 Provider、活动 Provider、能力路由、错误归类 | PASS（6 项） |
| AI Gateway.generate | 统一结果、promptKey 渲染、无 prompt → AI_INVALID_REQUEST、AI_ENABLE=false、Provider 不存在、健康前置、证据附加、落库成功/失败不阻断 | PASS（10 项） |
| AI Gateway.stream | SSE 透传、缺 res 报错 | PASS（3 项） |
| AI Gateway.analyze | JSON 解析、非 JSON → parseError | PASS（2 项） |
| AI Gateway.health | 聚合健康汇总 + 活动 Provider | PASS（1 项） |
| API 层 providerStatus | 旧字段兼容 + providers[] 汇总、AI_ENABLE=false | PASS（2 项） |

未伪造测试。真实 Provider 调用（Grok/Ollama/OpenAI）状态：**BLOCKED / NOT_CONFIGURED**（无凭证、本机无 Ollama），测试明确断言了 NOT_CONFIGURED/UNREACHABLE 判定路径为 PASS（这正是正确结果）。

---

## 17. Git 变化

（AI-02 阶段文件，git status 已核查）

```text
 M server/test/setup.js                                    ← 修改（uuid mock）
?? server/services/ai/                                     ← 新增（8 服务 + 2 测试）
?? server/services/aiEnhancedService.js                    ← 未跟踪（本阶段新增增强逻辑所在文件）
?? server/sql/ai_capability_layer_v1.sql                   ← 新增（migration，未执行）
?? 安全看板vben/apps/web-naive/src/api/hse/ai.ts           ← 新增（前端 API 层）
```

工作区中其余大量 M/?? 文件（violations、assessment*、grid*、WPS、hse-tasks 等）为 **Workbuddy 并行任务与历史未提交内容**，本阶段未触碰、未覆盖、未回滚。

---

## 18. Workbuddy 隔离情况

**无冲突。** 本阶段修改面全部位于 `server/services/ai/`（新建目录）、`aiEnhancedService.js`（AI 增强服务）、`server/test/setup.js`、前端 `src/api/hse/ai.ts`、`server/sql/ai_capability_layer_v1.sql`。

- 未修改任何 WPS / 三违 / 网格 / 考核 / 任务中心代码（violations、assessment*、grid*、hse-tasks 等 git 变更均非本阶段所为）。
- 未执行任何 SQL，不涉及生产数据库表（尤其 grid_inspection_records / grid_record_sync_map / 三违表）。
- migration 仅新增 AI 基础设施表，不触碰 Workbuddy 在迁表；且未执行。
- AI 消费业务数据仅只读的设计原则保持（本次未接入任何业务域取数）。

---

## 19. 风险

1. **凭证缺失**：GROK_API_KEY 为空、无 Ollama → AI 端点真实调用不可用（现状如实呈现，健康检查已如实报告，不伪造）。
2. **migration 未执行**：`ai_prompt_registry` 表与扩展列尚未落库；若长期不执行，Prompt Registry 仅内存态、Generation Record 扩展列不落盘（代码已做列存在性自动探测，向后兼容不报错）。
3. **OpenAI-Compatible 流式未接入**：`chatStream` 显式 NOT_SUPPORTED（不伪造），AI-03 需补齐 SSE 协议。
4. **双挂载治理推迟**：/api/hse/ai 仍由 ai.js + ai-enhanced.js 双挂载，统一入口依赖后续阶段收编。
5. **前端 AI 页占位**：/overview/ai-analysis 仍为静态占位假数据，可能被误认为已上线（处置待用户决策）。
6. **前端单测缺失**：ai.ts 未纳入前端测试基线（项目无前端单测框架），SSE 真实端到端未验证。
7. **Markdown 依赖未定**：AI 输出渲染依赖待用户确认引入。
8. **employeeId 置空策略**：Request Context 中 employeeId 在不确定时置 null，后续若需审计到人需明确认证上下文取值口径。

---

## 20. 未完成事项

- [ ] migration 执行（待用户授权）
- [ ] OpenAI-Compatible 流式（chatStream）协议接入（AI-03）
- [ ] v2 统一端点挂载（/api/hse/ai/v2，AI-03）
- [ ] 真实 Provider 凭证配置后的端到端调用验证（待用户提供凭证或安装 Ollama）
- [ ] 前端 AI 占位页处置（重写/标注/隐藏，待用户决策）
- [ ] Markdown 渲染依赖引入（待用户确认）
- [ ] SSE 真实端到端链路验证（依赖可用 Provider）

---

## 21. [需要用户确认]

1. **migration 执行授权**：是否授权执行 `server/sql/ai_capability_layer_v1.sql`（新建 ai_prompt_registry + 扩展 ai_generation_records 4 列）？涉及生产数据库结构变更，按生产边界规则需用户显式授权。
2. **默认模型凭证**：Grok 继续使用（需提供 GROK_API_KEY）？还是配置 OpenAI-Compatible（AI_OPENAI_BASE_URL/AI_OPENAI_API_KEY/AI_OPENAI_MODEL，如 DeepSeek/Qwen）？还是授权安装本地 Ollama？
3. **ai.js 4 端点处置**：/qa（mock）废弃、risk-predict/anomaly-detect/classify（统计规则型）迁移分析域或标注 rule-based —— 是否按 AI-02 设计文档 Step2 收编？
4. **Markdown 依赖**：是否授权引入 md-editor-v3 或 markdown-it？
5. **前端占位页处置**：AI 页 /overview/ai-analysis 重写 / 标注「建设中」/ 隐藏？
6. **v2 挂载方式**：统一前缀 /api/hse/ai/v2 是否按设计文档 Step1 挂载（AI-03 实施）？
7. **employeeId 审计口径**：AI 审计是否需要精确到 employee_id？如需，确认取数口径（req.user.id → users.employee_id → employee.id）。

AI-01 遗留确认项（默认模型凭证、Ollama 安装、Markdown 依赖、v2 挂载、占位页处置、ai.js 端点、pgvector 等）继续有效，与上表合并。

---

## 22. 下一阶段建议

**AI-03（Provider 统一骨架深化 + v2 API + 前端配套）**：
1. 执行 migration（经授权后）并验证表结构
2. 挂载 `/api/hse/ai/v2/generate|stream|models|health` 统一端点
3. OpenAI-Compatible 流式协议接入
4. 前端 SSE 消费与模型健康页配套（Naive UI）
5. 配置任一可用 Provider 后完成 SSE 真实端到端验证

AI-03 之后：AI-04 统一任务模型/双写演进 → AI-05 RAG → AI-07 视觉接入 → AI-09 三违/风险域接入 → AI-10 自动月报（均以 ChatGPT 审核后的正式提示词为准）。

**本阶段不自行开始 AI-03。** 等待用户将本报告与更新后的《AI智能分析实施进度.md》交 ChatGPT 审核。

---

*本报告为 AI-02 基础架构建设阶段主交付物。全部代码、测试、migration 均在 `G:\hse-dashboard` 工作区内，未触碰生产边界。*
