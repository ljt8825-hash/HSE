# AI-04：HSE AI 本地模型运行环境建设与真实 Provider 闭环完成

> 类别：②交付报告
> 日期：2026-09-14
> 阶段：AI 智能分析项目 AI-04（阶段四：本地模型运行环境建设与真实 Provider 闭环）
> 完整报告：`docs\AI智能分析\AI-04-HSE AI本地模型运行环境建设与真实Provider闭环报告.md`
> 总进度：`docs\AI智能分析\AI智能分析实施进度.md`

## 交付/变更概要

- **Ollama 本地环境建成**：Portable 0.33.1（G:\ollama），服务 127.0.0.1:11434 HTTP 实测可达（/api/tags、/api/ps 200）；模型库 OLLAMA_MODELS=D:\ollama。CLI（list/ps）因便携路径缺陷不可用，以 HTTP API 为准。
- **模型选择与运行**：主模型 `qwen2.5:7b`（Q4_K_M、4.68GB、7.6B、ctx 32768，本阶段拉取）；机器既有备用 `deepseek-r1:7b` / `deepseek-r1:1.5b`（2025-02-14，未调用）。无 NVIDIA GPU → CPU 推理（i5-12400 / 31.7GB RAM），generate ~35-46s、stream ~31.9s。
- **真实 Provider 闭环（最大验收点达成）**：复用 AI-02 Provider Registry（OllamaProvider），无平行体系、无 Route→Ollama 直连；Grok NOT_CONFIGURED / **Ollama AVAILABLE** / OpenAI-Compatible NOT_CONFIGURED（各 Provider 独立判定）。
- **四条真实链路全 PASS**：v2/health（ollama=AVAILABLE aiEnabled=true）、v2/models（真实 qwen2.5:7b）、v2/generate（真实输出 426 字）、v2/stream（真实 SSE 207 分块 + start/end 齐全）。生产 .env 未改动，验证以进程级环境覆盖（AI_PROVIDER=ollama、AI_TIMEOUT_MS=120000），端口 5881（未触碰 5876）。
- **SSE 两处最小修复（唯一代码修复点）**：① `sendStreamRequest` 不解析 Ollama 纯 NDJSON 行（无 data: 前缀）→ 真实分块全丢（首测 chunkCount=0）；② `req.on('close')` 抢先 `res.end()` 吞 `event:end`（首测 end=false）。修复后协议保持兼容（start / data:{content} / [DONE] / end），前端 stream() 消费逻辑未改，旧调用方行为不变。
- **Generation Record 如实降级**：带 record 实测 `recordSaved=false` + `recordError="关系 "ai_generation_records" 不存在"` → **NOT_PERSISTED / MIGRATION_PENDING**，未伪造。
- **AI_ENABLE 语义统一**：唯一判定来源 = `process.env.AI_ENABLE`（缺省 true，仅字面 false 禁用）；v2 health 与 Legacy provider-status 同口径；当前 .env 无该行 → 两轨均 aiEnabled=true。AI-02（false）与 AI-03（true）差异根因 = 该行是否存在，非代码双轨。
- **AI-01 数据库事实正式修正**：两库实测 `ai_prompt_registry` / `ai_generation_records` 均不存在（358 张 public 表），以实际数据库状态为准，历史描述保留为审计事实。
- **错误路径保留**：grok 显式请求 AI_PROVIDER_NOT_CONFIGURED、unknown AI_PROVIDER_NOT_FOUND、Ollama 服务停止（改端口 19999）UNREACHABLE 实测 ECONNREFUSED——均真实验证，未因 Ollama 成功而删除。

## 关键文件 / SQL

- 修改：`server/services/aiService.js`（SSE NDJSON 解析 + settled 标志防 close 竞态）
- 新增：`server/scripts/ai04_ollama_route_check.cjs`（路由级 11 项集成验证）
- 未改动：生产 .env、前端、Provider Registry、AI Gateway、v2 控制器/路由（本轮无需改）；migration（`server/sql/ai_capability_layer_v1.sql`）未执行
- 数据库变化：零执行（两库均无 AI 两表；未连生产写操作）

## 验收 / 放行状态

- 状态：**PASS**（真实 Provider 闭环达成），待用户交 ChatGPT 审核后放行至 AI-05
- 依据：
  - AI 能力层单测 3 套件 **79/79 PASS**（含 AI-02 55 项、AI-03 57 项基线；SSE 解析用例改动后无回归）
  - 路由级集成 `node scripts/ai04_ollama_route_check.cjs`（端口 5881）→ **11/11 PASS**（真实闭环 6 + 错误路径 2 + Legacy 3）
  - 全量单元 588/609（21 失败全部位于本阶段未触碰的并行域：personnel 保险导入 20 + violationAdapter 1，git 状态为并行修改中），与本阶段变更无交集
  - 新增测试说明：新增路由级集成脚本 1 个（11 项验证）；未改动既有单测数量（79 = 既有基线）
  - git status 完成前后均核查：本阶段变更面仅 aiService.js + 新增脚本；Workbuddy 并行域未覆盖未回滚

## 遗留事项

- migration 执行待用户授权（两库建 ai_prompt_registry / ai_generation_records）
- 生产 .env Provider 切换决策（grok → ollama + AI_TIMEOUT_MS 评估）
- deepseek-r1 备用模型未调用未验证
- Ollama Portable CLI 路径缺陷（运维走 HTTP API）
- Legacy 可用性门禁（aiService.isAvailable）与 v2 真实健康不一致，待 AI-05 决策
- 前端正式 AI 页面与 Markdown 渲染依赖（后续阶段）

## 是否已同步索引

- [x] 已更新 `_index.md`
