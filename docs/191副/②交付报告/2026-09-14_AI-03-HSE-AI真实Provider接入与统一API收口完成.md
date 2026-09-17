# AI-03：HSE AI 真实 Provider 接入与统一 API 收口完成

> 类别：②交付报告
> 日期：2026-09-14
> 阶段：AI 智能分析项目 AI-03（阶段三：真实 Provider 接入与统一 API 收口）
> 完整报告：`docs\AI智能分析\AI-03-HSE AI真实Provider接入与统一API收口报告.md`
> 总进度：`docs\AI智能分析\AI智能分析实施进度.md`

## 交付/变更概要

- **统一 v2 API 六端点落地**（`/api/hse/ai/v2`，全部经 AI Gateway，无 Route→Provider 直连）：GET health / providers / models + POST generate / stream / analyze。鉴权：读端点全局 auth、写端点 requireRole('admin','safety_manager')。
- **统一 SSE 信封**：`event:start`（requestId/traceId/provider/model/promptKey/promptVersion）→ `data:{content}` 透传 → `data:[DONE]` → `event:end`（durationMs）；错误 `event:error`（code/message/provider/retryable/requestId）。start 帧先于 Provider 健康检查写入 → Provider 不可用时客户端仍收到完整生命周期；`aiService.js` chatStream 增加 skipHeaders/skipEnd 由 Gateway 控制生命周期（旧调用方零影响）。
- **Provider/Model 能力面**：aiGateway 新增 `getProvidersInfo` / `getModelsInfo`；Grok `NOT_CONFIGURED` / Ollama `UNREACHABLE` / OpenAI-Compatible `NOT_CONFIGURED`，不伪造模型、不伪造 available。
- **Legacy 兼容治理**：ai.js 4 端点（risk-predict/classify/anomaly-detect 统计规则 LEGACY + qa MOCK）与 ai-enhanced 6 端点（CURRENT）全清单 + 分类 + 迁移映射（generate-report→v2/generate、stream→v2/stream、root-cause→v2/analyze、provider/status→v2/health）；旧端点全部保持可访问，未删 ai.js/ai-enhanced.js/aiService.js。
- **双轨制锁死**：v2 控制器 `stripDualTrackFields` 忽略 compliance_status/checked_by/checked_at/manual_remark（路由级实测验证），AI 绝不写入人工结果。
- **前端 AI API 层收口**：`src/api/hse/ai.ts` 增量增加 getHealth/getProviders/getModels/generate/stream/analyze 六方法（V2StreamHandlers 支持 onStart/onChunk/onEnd/onError），未新建 API 文件、未引入新依赖、SSE 继续 fetch+ReadableStream。
- **Migration Preflight**：两库（safety_dashboard / safety_dashboard_dev）均**不存在** `ai_prompt_registry` 与 `ai_generation_records`（358 张表）；migration 幂等化（CREATE/ADD ... IF NOT EXISTS）；**未执行**，待用户授权。

## 关键文件 / SQL

- 修改：`server/app.js`（L468 挂载 v2）、`server/services/aiService.js`（SSE skipHeaders/skipEnd）、`server/services/ai/aiGateway.js`（统一 SSE 信封 + getProvidersInfo/getModelsInfo）、`server/services/ai/aiCapabilityLayer.unit.test.js` + `aiApiLayer.unit.test.js`（+2 SSE 信封测试）、`server/sql/ai_capability_layer_v1.sql`（幂等化）、`安全看板vben/apps/web-naive/src/api/hse/ai.ts`（+6 v2 方法）
- 新增：`server/controllers/aiV2Controller.js`、`server/routes/ai-v2.js`、`server/scripts/ai03_v2_route_check.cjs`、`server/preflight_ai_migration.tmp.cjs` + `preflight_out.tmp.txt`
- 数据库变化：零执行（未连生产库、未执行任何 SQL、未触碰 WPS/三违表）；migration 文件幂等化待授权

## 验收 / 放行状态

- 状态：已完成（AI-03 交付），待用户审核报告后放行至 AI-04
- 依据：
  - 单元测试：`npx jest services/ai/aiCapabilityLayer.unit.test.js services/ai/aiApiLayer.unit.test.js` → Test Suites 2 passed / **Tests 57 passed**（AI-02 的 55 项 + AI-03 新增 2 项 SSE 信封）
  - 路由级集成：`node scripts/ai03_v2_route_check.cjs`（端口 5881，符合 prod-boundary，未触碰生产 5876）→ **13/13 PASS**（v2 六端点 + 未认证 401 + 双轨制忽略 + SSE start+error + Legacy 4 项兼容）
  - 真实 Provider 状态如实：Grok NOT_CONFIGURED / Ollama UNREACHABLE / OpenAI-Compatible NOT_CONFIGURED / 真实模型端到端 BLOCKED（未伪造）
  - git status 已核查：AI-03 修改与 Workbuddy 并行修改可区分，未覆盖未回滚

## 遗留事项

- migration 执行待用户授权（生产边界规则；两库均无 ai_prompt_registry/ai_generation_records）
- 真实 Provider 端到端验证待凭证决策（Grok Key / OpenAI-Compatible / Ollama 安装）
- 前端占位页处置、Markdown 渲染依赖决策
- Legacy 收编 Step2（ai.js 4 端点处置、ai-enhanced 逐步收口至 Gateway）
- ai-enhanced 并行三层化（main.js+controller+service）行为等价复核确认

## 是否已同步索引

- [x] 已更新 `_index.md`
