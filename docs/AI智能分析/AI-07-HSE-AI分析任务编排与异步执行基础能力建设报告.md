# AI-07：HSE AI 分析任务编排与异步执行基础能力建设报告

> 执行方：Trae + DeepSeek V4 Flash
> 执行日期：2026-09-15
> 任务书：`# AI-07：HSE AI分析任务编排与异步执行基础能力建设`
> 审核前置：AI-06 = PASS（ChatGPT 已审核）
> 状态：**PASS**（真实链路 39/39 全通过）

---

## 1. 执行摘要

AI-07 解决 AI-06 同步调用接口在 CPU Ollama 下长时间阻塞的工程问题（qwen2.5:7b 单次完整分析 ≈74s），把「同步调用」升级为「可追踪的分析任务」。未重复建设 Ollama / Provider / Gateway / RAG / Statistics / Normalizer / Evidence（完全复用 AI-01～AI-06 冻结基线）。

交付内容：

- **任务模型**：`ai_analysis_tasks` 新表（23 列，开发库 `safety_dashboard`），只保存 请求参数 / 统计快照 / 分析结果 / Evidence / 状态 / 错误，不复制业务表（§9 数据边界）。
- **状态机**：PENDING / RUNNING / COMPLETED / FAILED / CANCELLED / RETRYING，显式转换表 + 非法转换拦截（§6）。
- **幂等创建**：`request_hash = sha256(规范化请求)`，同 hash 活跃任务（PENDING/RUNNING）直接复用，防连续点击瞬间启动多个相同 AI 任务（§12/§31）。
- **异步执行器**：`aiAnalysisWorker`（轮询 PENDING → 原子领取 → RUNNING → 调用 AI-06 analysisService → COMPLETED/FAILED），Node 原生 + PostgreSQL，无 BullMQ/Redis 等新基础设施（§10）。
- **并发控制**：PostgreSQL advisory lock 保证同一时间 `RUNNING DATA_ANALYSIS ≤ 1`（CPU Ollama 约束，§11）。
- **AI-06 复用**：worker 直接调用 `analysisService.analyzeData`，不复制统计/归一化/RAG/结构化解析/Evidence（§16）。
- **降级**：AI 不可用 → Statistics 照常落 statistics_snapshot，任务 COMPLETED + `degraded=true` + `ai.available=false`，不伪装成功、不 500（§17/§18）。
- **取消**：PENDING → CANCELLED（worker 天然不领取）；RUNNING 仅记录 `cancel_requested_at`，禁止假取消（§21）。
- **超时**：任务层 `AI_TASK_TIMEOUT`（默认 300000ms，与 AI-06 基线一致）区分 provider timeout / 结构化无效 / 数据读取失败（§22）。
- **API**：`/api/hse/ai/v2/analysis-tasks` 四端点（创建同步返回 PENDING，不等待 AI）。
- **数据库**：仅开发库新增 1 张任务表 + 2 索引；生产库零 migration、零写入、零 `.env` 修改（§35）。
- **测试**：**39/39 PASS**（Unit 17 + Integration 13 + Route 9），含 1 次真实 Ollama qwen2.5:7b 闭环（实测 42.3s），报告数字与脚本输出逐项对应（§38）。

核心链路（任务书 §44 目标架构）：

```text
用户/系统提交分析请求
    ↓ POST /analysis-tasks（同步返回 PENDING，不等待 AI）
Analysis Task（ai_analysis_tasks）
    ↓ worker 领取（advisory lock 并发 ≤1）→ RUNNING
AI-06 analysisService.analyzeData
    ↓ Analysis Adapter（db 只读 / records 注入）
Statistics（确定性统计，不经过 AI）
    ↓ AI Gateway → Ollama → qwen2.5:7b
Structured AI（fail-closed）
    ↓ Evidence（business_record + knowledge_base）
Generation Record（ai_generation_records，复用 recordId）
    ↓ Task COMPLETED（statistics/ai/evidence/recordId 可查询）
```

---

## 2. AI-01～AI-06 基线确认

执行前已读取 `AI智能分析实施进度.md` 及 AI-01～AI-06 报告/任务记录（主进度文件存在，无伪造历史）。

| 基线项 | AI-06 冻结状态 | AI-07 状态 |
|---|---|---|
| Ollama | AVAILABLE（未重装未重下） | AVAILABLE |
| 主模型 | qwen2.5:7b (Q4_K_M) | 未覆盖未重新下载 |
| Grok | NOT_CONFIGURED | NOT_CONFIGURED（用于降级用例验证） |
| AI Provider Registry | 统一入口 | 复用，未建 provider2 |
| AI Gateway | 统一入口 | 复用，未建 gateway2 |
| aiHealthService | AI-02 已建 | 复用 |
| aiEvidenceService / aiGenerationRecordService | AI-04/05 已建 | 复用（Evidence 沿用 business_record + knowledge_base 双类型） |
| aiPromptRegistry | 已注册 hse.rag.answer / hse.data.analysis | 未新增 Prompt（复用 AI-06 hse.data.analysis） |
| Analysis Adapter / Normalizer / Statistics / PromptBuilder / Service | AI-06 已建 | 全量复用，未建 analysisService2 |
| RAG / Retriever / Embedding / Knowledge Base | AI-05 已建 | 复用（useRag 按需透传），未建 ragGateway2 |
| v2 API | health/providers/models/generate/stream/analyze/analyze.data | 复用并新增 analysis-tasks*，其余原样 |
| ai_generation_records | 已建，record 落库 | 复用（未建 ai_hse_analysis_records / ai_data_analysis_records / ai_analysis_results2 / ai_task_records2） |
| SSE 协议 | 原样 | 未改动 |
| 平行体系 | 禁止 provider2/gateway2/ragGateway2/…2 | 未创建任何平行体系 |
| Route → Provider 直连 | 禁止 | 任务执行全部经 analysisService → AI Gateway |

---

## 3. 现有任务系统审计

任务书 §3 要求先审计再编码。已检索 `analysisTask / analysis_task / aiTask / ai_task / taskQueue / queue / job / scheduler / async analysis` 关键词，并检查 `server/services / routes / controllers / scripts / sql`：

- **不存在**任何已有的 AI 任务模型 / 任务表（无 ai_task*、analysis_task* 表）。
- **不存在** HSE 任务中心（hse-tasks 为业务台账域，与 AI 任务无关）。
- **不存在**通用任务队列 / node-cron / 定时任务 / 异步执行器 / 任务状态机 / 任务日志。
- 审计脚本 `server/scripts/ai07_audit_db.cjs` 只读确认：开发库 `safety_dashboard` 无 `ai_analysis_tasks` 等价表，也无需要复用等价能力。

结论：无可复用任务框架 → 按任务书 §5 建设最小任务模型 `ai_analysis_tasks`，不引入 BullMQ / Redis / RabbitMQ / Kafka / Celery / LangChain。

---

## 4. 任务模型设计

实现：`server/services/ai/tasks/aiAnalysisTaskService.js` + 建表脚本 `server/scripts/ai07_tasks_table.cjs`（幂等可重跑）。

表结构（23 列，开发库）：

```text
id BIGSERIAL PK
task_type VARCHAR(50) NOT NULL DEFAULT 'DATA_ANALYSIS'
domain VARCHAR(50) NOT NULL
status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
priority SMALLINT NOT NULL DEFAULT 5
request_hash VARCHAR(64) NOT NULL
request_payload JSONB NOT NULL
statistics_snapshot JSONB
ai_result JSONB
evidence JSONB
generation_record_id BIGINT
provider VARCHAR(50)
model VARCHAR(100)
degraded BOOLEAN NOT NULL DEFAULT FALSE
error_code VARCHAR(64)
error_message TEXT
error_retryable BOOLEAN NOT NULL DEFAULT FALSE
cancel_requested_at TIMESTAMPTZ
created_by BIGINT
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
started_at TIMESTAMPTZ
completed_at TIMESTAMPTZ
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

索引：

```text
idx_ai_analysis_tasks_status (status, priority, id)   -- worker 领取排序
idx_ai_analysis_tasks_hash   (request_hash, status)   -- 幂等复用查询
```

请求快照（§8）：任务创建后持久化本次分析范围，即使业务数据变化也能回溯「当时分析了什么」：

```json
{
  "domain": "hazard",
  "timeRange": { "start": "2026-02-01", "end": "2026-07-31" },
  "filters": {},
  "analysisTypes": ["trend", "frequency", "rectification"],
  "useRag": false,
  "provider": "ollama",
  "model": null,
  "limit": 1000
}
```

数据边界（§9）：任务表**只保存**请求参数/统计快照/分析结果/Evidence/状态/错误；API 层拒绝 `records` 注入（`AI_INVALID_REQUEST`，实测 Unit + Integration + Route 三层均验证），业务数据库仍是唯一事实来源。未创建任何 `ai_hse_analysis_records` 等重复表。

---

## 5. 状态机

实现（`aiAnalysisTaskService.js`）：

```text
TASK_STATUS: PENDING / RUNNING / COMPLETED / FAILED / CANCELLED / RETRYING

ALLOWED_TRANSITIONS:
  PENDING  → RUNNING / CANCELLED / FAILED
  RUNNING  → COMPLETED / FAILED
  COMPLETED → （终态）
  FAILED   → RETRYING
  CANCELLED → （终态）
  RETRYING → RUNNING / FAILED
```

- 重试走显式转换 `FAILED → RETRYING → RUNNING`，禁止直接改状态。
- 非法转换抛 `AI_TASK_INVALID_STATE`（Unit 实测：COMPLETED→RUNNING / FAILED→COMPLETED / CANCELLED→RUNNING 全部拦截）。
- 任务书 §6 要求的最小状态集（PENDING/RUNNING/COMPLETED/FAILED/CANCELLED）全部可用，RETRYING 按 §6「必要时」增加，已定义转换路径。

---

## 6. 异步执行器

实现：`server/services/ai/tasks/aiAnalysisWorker.js` + 独立启动脚本 `server/scripts/ai07_worker.cjs`（开发验证用，**不挂载 app.js，生产 5876 不受影响**）。

```text
runWorker（轮询，默认 2000ms）
  ↓ claimNextTask(maxConcurrent=1)
  原子领取：事务内 advisory lock → COUNT(RUNNING) ≥ 1 则放弃
    → UPDATE ... WHERE id=(SELECT ... PENDING AND cancel_requested_at IS NULL
                           ORDER BY priority,id LIMIT 1 FOR UPDATE SKIP LOCKED)
  ↓ executeTask
  withTimeout(analysisService.analyzeData(...), 300000ms)
  ↓ COMPLETED / FAILED（错误码 + retryable）
```

- **无新基础设施**：Node 原生 + PostgreSQL，未引入 BullMQ/Redis/RabbitMQ/Kafka/Celery/LangChain。
- **超时保护**（§22）：任务层 `AI_TASK_TIMEOUT`（默认 300000ms，`withTimeout` 防泄漏），与 AI-06 测试基线 `AI_TIMEOUT_MS=300000` 一致；不改生产 `.env`。
- **错误区分**（§22）：`AI_TASK_TIMEOUT`（任务层超时，retryable=true）/ `AI_STRUCTURED_OUTPUT_INVALID` / `AI_DOMAIN_NOT_SUPPORTED`（retryable=false）/ `AI_TASK_INTERNAL`（兜底）——错误码全部沿用统一 AiError 模型。

---

## 7. 并发控制

任务书 §11：默认 AI 分析并发必须限制为 1（CPU Ollama qwen2.5:7b ≈74s/次）。

实现：`claimNextTask` 在事务内 `SELECT pg_advisory_xact_lock(78007)` 串行化领取判定，然后 `COUNT(RUNNING DATA_ANALYSIS) >= maxConcurrent` 则放弃（ROLLBACK 返回 null），再用 `FOR UPDATE SKIP LOCKED` 原子领取一个 PENDING 任务。多 worker 实例同时运行时同样安全。

实测（Integration 并发锁三段验证，A/B/C 独立请求避免幂等复用）：

```text
A = RUNNING 时  → B = PENDING, C = PENDING（同时 RUNNING ≤ 1）✓
A 完成后        → B = RUNNING, C = PENDING ✓
B 完成后        → C = RUNNING ✓
```

---

## 8. 幂等（重复提交保护）

任务书 §12/§31：`request_hash = sha256(规范化请求)`，规范化含 taskType / domain / timeRange / filters / analysisTypes（排序后，顺序无关）/ useRag / provider / model。

- 创建时先查同 hash 的 PENDING/RUNNING 任务，存在则复用（`reused=true` + 同 id），否则插入新任务。
- 实测（Unit）：相同请求 hash 稳定（64 位 hex）/ 不同 domain hash 不同 / analysisTypes 顺序无关。
- 实测（Integration）：连续 3 次相同请求 → 仅 1 新建 + 2 复用（同 id：`ids=[17,17,17], reused=[false,true,true]`）。
- 实测（Route）：HTTP 层重复提交 → `reused=true` 同 id。
- 未过度设计分布式幂等，仅覆盖「防用户连续点击瞬间启动多个相同 AI 任务」。

---

## 9. API

新增端点（路由 `server/routes/ai-v2.js` 复用 v2 前缀，控制器 `server/controllers/aiAnalysisTaskController.js`，未破坏 AI-03～AI-06 任何端点）：

```text
POST /api/hse/ai/v2/analysis-tasks            创建任务（同步返回 PENDING，不等待 AI 执行）
GET  /api/hse/ai/v2/analysis-tasks/:id        任务详情（statistics/ai/evidence/recordId/错误信息）
GET  /api/hse/ai/v2/analysis-tasks            任务列表（分页 + status/domain 过滤）
POST /api/hse/ai/v2/analysis-tasks/:id/cancel 取消任务（PENDING→CANCELLED；RUNNING 仅记录取消请求）
```

创建请求（§14）：

```json
{
  "taskType": "DATA_ANALYSIS",
  "domain": "hazard",
  "timeRange": { "start": "2026-08-01", "end": "2026-08-31" },
  "filters": {},
  "analysisTypes": ["trend", "frequency", "rectification"],
  "useRag": true,
  "provider": "ollama"
}
```

创建响应（同步返回，不等待 74s）：

```json
{
  "success": true,
  "task": { "id": 20, "status": "PENDING", "taskType": "DATA_ANALYSIS", "domain": "hazard" },
  "reused": false
}
```

详情响应（§15）：PENDING/RUNNING 返回状态与 startedAt；COMPLETED 返回 `statisticsSnapshot / aiResult / evidence / generationRecordId / provider / model / durationMs`；FAILED 返回 `errorCode / errorMessage / errorRetryable`。`toApiTask` 序列化 23 字段（含 requestHash/requestPayload/cancelRequestedAt 等），**不含业务 records**。

错误契约：HTTP 200 + 统一错误体（`toErrorResponse`），覆盖 `AI_INVALID_REQUEST` / `AI_TASK_NOT_FOUND` / `AI_TASK_INVALID_STATE` / `AI_DOMAIN_NOT_SUPPORTED` 等。

---

## 10. AI-06 复用关系

任务书 §16：任务层与 AI-06 职责分离，禁止复制分析逻辑。

| 层 | 职责 | 复用对象 |
|---|---|---|
| 任务层（AI-07 新增） | 调度 / 状态 / 生命周期 / 错误 / 结果保存 | aiAnalysisTaskService + aiAnalysisWorker |
| 分析本身（AI-06） | 数据读取 / 归一化 / 统计 / RAG / 结构化解析 / Evidence | analysisService.analyzeData 直接调用 |

未重新实现：statistics / normalizer / RAG / structured parser / Evidence。`analysisService.js` 零修改（Git 状态无 AI-06 文件变更）。

---

## 11. Evidence / Generation Record

任务书 §19/§20：继续使用 AI-06 `business_record + knowledge_base` 双类型 Evidence，禁止重新设计一套；任务完成后复用 AI-06 的 Generation Record，不产生四套重复记录。

- worker 执行 `analysisService.analyzeData` 返回的 `result.evidence` 原样落任务表 `evidence` 列。
- `result.recordId` 落任务表 `generation_record_id`，与 `ai_generation_records` 单表关联（实测真实 AI 任务 `generationRecordId=13`）。
- 关系：`Analysis Task → request snapshot / statistics snapshot / AI result / Evidence / generationRecordId`。

```text
Analysis Task
  ├── request snapshot（request_payload）
  ├── statistics snapshot（statistics_snapshot）
  ├── AI result（ai_result）
  ├── Evidence（evidence: business_record + knowledge_base）
  └── generationRecordId（→ ai_generation_records）
```

未在 `ai_generation_records` 增加任何关联字段（无新 migration）。

---

## 12. AI unavailable 降级

任务书 §17/§18/§29：继承 AI-06 降级规则，「统计先完成」语义。

- 实测（Integration，provider=grok 未配置）：任务创建成功 → worker 执行 → Statistics 正常生成（totalRecords=110）→ AI 不可用 → 任务 **COMPLETED + degraded=true + ai.available=false + code=AI_PROVIDER_NOT_CONFIGURED**，结果可查询。
- 未把「AI 没生成」伪装成「AI 分析成功」：`degraded=true` + `error_message` 明确标注「AI 分析降级（AI 不可用）：…」。
- 不 500：降级任务状态为 COMPLETED（含统计快照，业务价值保留），而非 FAILED。
- 超时/Provider 不可达/结构化无效等仍走 FAILED + 对应错误码（§22 区分）。

---

## 13. 权限

任务书 §23：继续使用现有 `authMiddleware / requireRole / req.user`，未修改 login / JWT / auth store / login page。

- 写端点（create / cancel）：`requireRole('admin', 'safety_manager')`（与 v2 写端点 generate/stream/analyze/analyze.data 惯例一致）。
- 读端点（get / list）：任意登录用户（全局 authMiddleware 覆盖）。
- `userId` 取认证上下文 `req.user.id`（不推断 employee_id，AI-02 身份边界），落 `created_by`。
- 未认证 → 401（Route 实测）。
- 未发明新的细粒度权限体系（当前项目无 AI 任务专属权限模型，沿用 HSE 角色即可）。

---

## 14. 日志与脱敏

任务书 §24/§25：

- 任务日志只输出：`taskId / taskType / domain / status / createdAt / startedAt / completedAt / durationMs / provider / model / errorCode`。
- 禁止输出：完整 Prompt、完整业务记录、员工姓名/手机号/身份证号/详细个人信息。
- worker `logTask` 仅输出脱敏元数据 JSON（`[AI07-TASK] {...}`），无 `console.log(request/records/aiPrompt)`。
- 任务结果 evidence/statistics 落库为结构化快照，不打印到日志。
- 测试期间未发现敏感信息输出；`toApiTask` 不含业务记录字段。

---

## 15. 数据库变更

任务书 §35：开发库新增任务表，生产库零 migration。

```text
目标库：safety_dashboard（开发库）/ 用户 hse_app / PostgreSQL 17.10
DDL 执行：server/scripts/ai07_tasks_table.cjs（幂等 CREATE TABLE IF NOT EXISTS + 2 索引）
执行结果：RESULT: OK（23 列验证通过）
生产库：safety_dashboard_dev 零 migration、零写入、零 .env 修改
```

---

## 16. 测试

E2E 脚本：`server/scripts/ai07_analysis_task_e2e_check.cjs`（5881 开发端口，进程级 `AI_PROVIDER=ollama` + `AI_TIMEOUT_MS=300000`，不改 `.env`）。测试数据边界：真实 hazards 表仅最小只读（timeRange 过滤，totalRecords=110 全部真实读取用于统计），无任何业务表写入；测试任务 `created_by=7777777` 标记，前后自动清理，Route 层任务按 id 清理。

**Unit（17 项）**：状态机合法转换（PENDING→RUNNING / RUNNING→COMPLETED / FAILED→RETRYING→RUNNING）✓ 非法转换 ×3（COMPLETED→RUNNING / FAILED→COMPLETED / CANCELLED→RUNNING → `AI_TASK_INVALID_STATE`）✓ request_hash 稳定/差异/顺序无关 ✓ 参数校验 ×5（缺 domain / 非法 taskType / timeRange 倒置 / 非法 analysisTypes / records 注入被拒）✓ 序列化 toApiTask 23 字段且不含 records ✓ 错误映射（AI_TIMEOUT→retryable=true / AI_DOMAIN_NOT_SUPPORTED→retryable=false）✓。

**Integration（13 项）**：createTask 真实插入 → PENDING + request_hash + 快照 ✓ claimNextTask → RUNNING + started_at ✓ executeTask 真实 AI → COMPLETED + 统计快照 + AI 结构化 + Evidence + GenerationRecord（qwen2.5:7b，42.3s，generationRecordId=13）✓ AI 不可用（grok）→ COMPLETED + degraded + ai.available=false + 统计正常 ✓ 并发锁三段（A RUNNING 时 B/C PENDING → A 完 B RUNNING → B 完 C RUNNING）✓ 幂等连续 3 次复用 ✓ 取消 PENDING→CANCELLED 不被 worker 领取 ✓ 取消 RUNNING 仅记录 cancel_requested_at ✓ 无效 domain → FAILED + AI_DOMAIN_NOT_SUPPORTED + retryable=false ✓ listTasks/getTask ✓。

**Route（9 项）**：401 未认证 ✓ 缺 domain → AI_INVALID_REQUEST ✓ 合法创建 → 200 + PENDING + reused=false ✓ 重复提交 → reused=true 同 id ✓ 详情字段齐全 ✓ 列表 total≥1 ✓ records 注入被拒 ✓ 取消 PENDING → CANCELLED ✓ cancel 不存在任务 → AI_TASK_NOT_FOUND ✓。

## 17. 真实 Ollama E2E

任务书 §28/§42 PASS 必备：至少一次真实 `AI Gateway → Ollama → qwen2.5:7b` 闭环。本次最终运行实测：

```text
[Integration] executeTask 真实 AI → COMPLETED + 统计快照 + AI 结构化 + Evidence + GenerationRecord
  durationMs: 42285（qwen2.5:7b CPU，42.3s）
  totalRecords: 110（真实 hazards 表最小只读）
  model: qwen2.5:7b
  evidence: 1（business_record）
  generationRecordId: 13（复用 ai_generation_records）
```

任务链路真实走通：PENDING → worker 领取 RUNNING → analysisService（Adapter → Statistics → AI Gateway → Ollama）→ 结构化输出 → Evidence → Generation Record 落库 → COMPLETED。

## 18. 并发测试

任务书 §30：A/B/C 三任务提交，验证同时 RUNNING ≤ 1。实测：

```text
并发前置：A/B/C 为独立任务（幂等不误伤）  {"A":"14","B":"15","C":"16"}
A=RUNNING 时 B/C 保持 PENDING（同时 RUNNING≤1）  {"A":"14","B":"PENDING","C":"PENDING"}
A 完成后 B=RUNNING，C 仍 PENDING  {"B":"15","C":"PENDING"}
B 完成后 C=RUNNING  "16"
```

未出现 A/B/C 同时 RUNNING；并发控制基于 PostgreSQL advisory lock（多实例安全）。

## 19. 重复任务测试

任务书 §31：连续提交相同请求验证幂等行为。实测（明确行为 = 复用已有任务）：

```text
幂等：连续 3 次相同请求 → 仅 1 新建 + 2 复用（同 id）  {"ids":["17","17","17"],"reused":[false,true,true]}
```

## 20. 取消测试

任务书 §32：PENDING → CANCELLED 且不被 worker 执行。实测：

```text
取消：PENDING→CANCELLED 且不被 worker 领取  {"status":"CANCELLED","claimGot":null}
取消：RUNNING 仅记录 cancel_requested_at（禁止假取消）  {"status":"RUNNING","cancelRequestedAt":"2026-09-15T00:23:01.790Z"}
```

RUNNING 任务未假装强制取消（AI Gateway/Ollama 调用不可可靠中断，§21 明确记录取消请求，AI 执行完成后仍落结果）。

## 21. 测试真实数字

任务书 §38：报告数字必须与测试脚本实际输出逐项对应。最终输出文件：`server/ai07_e2e_final.txt`（最终 PASS 运行）：

```text
Suite Unit: 17 tests, 17 passed, 0 failed
Suite Integration: 13 tests, 13 passed, 0 failed
Suite Route: 9 tests, 9 passed, 0 failed

Total: 39
Passed: 39
Failed: 0
```

| 测试层 | 测试数 | 通过 | 失败 | 覆盖点 |
|---|---|---|---|---|
| Unit | 17 | 17 | 0 | 状态机 ×6 / request_hash ×3 / 参数校验 ×5 / 序列化 ×1 / 错误映射 ×2 |
| Integration | 13 | 13 | 0 | 创建+领取+真实 AI 闭环 ×3 / AI 不可用降级 ×1 / 并发锁 ×4 / 幂等 ×1 / 取消 ×2 / 无效 domain ×1 / 查询 ×1 |
| Route | 9 | 9 | 0 | 401 / 缺 domain / 创建 / 重复提交 / 详情 / 列表 / records 注入 / 取消 / cancel 不存在 |
| **合计** | **39** | **39** | **0** | |

**报告数字 = 实际测试脚本数字**（39/39，无混加、无分类遗漏）。调试过程留痕：`server/ai07_e2e_out.txt`（早期 Route 套件因 5881 dev 服务器未就绪跳过，Unit 17/17 + Integration 13/13）→ `server/ai07_e2e_final.txt`（dev 服务器就绪后 **39/39 最终 PASS**）。

## 22. Git 前后状态

任务书 §37：执行前/后均已执行 `git status`；未执行 `git reset` / `git checkout -- .` / `git clean`。

- **AI-07 新增**：
  - `server/services/ai/tasks/aiAnalysisTaskService.js`（任务模型/状态机/幂等/CRUD）
  - `server/services/ai/tasks/aiAnalysisWorker.js`（异步执行器/并发控制/超时/日志脱敏）
  - `server/controllers/aiAnalysisTaskController.js`（任务 API 控制器）
  - `server/scripts/ai07_tasks_table.cjs`（开发库建表 DDL，幂等）
  - `server/scripts/ai07_worker.cjs`（worker 独立启动脚本，开发验证用，不挂载 app.js）
  - `server/scripts/ai07_audit_db.cjs`（数据库审计脚本）
  - `server/scripts/ai07_analysis_task_e2e_check.cjs`（E2E 39 项）
  - `server/ai07_e2e_out.txt` / `server/ai07_e2e_final.txt`（测试输出留痕）
- **AI-07 修改**：
  - `server/routes/ai-v2.js`（新增 4 条 analysis-tasks 路由；该文件本身为 AI-03 未提交新增，AI-07 在其上增量）
- **已有未提交 / 并行修改**：`docs/191副` 归档、AI-01～AI-06 未提交文件、Workbuddy 并行域大量 M 文件（violationController / ruleEngine / assessment* / gridAttribution / hse-tasks / hse-dashboard / regulations / training-ocr / violations / 前端 site·mobile 等），均未触碰。

## 23. Workbuddy 隔离检查

任务书 §34：无冲突。

- 保护区域（WPS / grid* / wpsGrid* / violations / assessment* / risk / accident / hse-tasks / training-ocr / .workbuddy）零触碰。
- 未修改任何保护文件（violationService.js / violationCheckerScope.js / violationController.js / routes/violations/* / ruleEngine/* / deductionWriter.js / sanweiBehaviorDict.js / sanweiLedgerDerive.js / gridViolationCandidateService.js / gridAttributionService.js）。
- AI-07 仅注册 DATA_ANALYSIS 任务类型，不注册 VISION / RISK_DECISION / VIOLATION_DECISION / ACCIDENT_JUDGEMENT / AUTO_REPORT（§7 边界），三违/风险/事故域零读取。
- 未发现需要修改 Workbuddy 正在使用文件的情况，无强制 `[需要用户确认]` 冲突项。

## 24. 风险

1. **CPU 推理耗时仍是硬限制**：真实 AI 实测 42.3s（本轮数据量 110 条）；任务系统解决了阻塞问题，但单任务执行时长由模型+硬件决定。
2. **RUNNING 任务不可强制取消**：AI Gateway/Ollama 调用不可可靠中断，运行中取消仅记录 `cancel_requested_at`（已按 §21 明确，不做假取消）。
3. **worker 常驻未接入生产**：`ai07_worker.cjs` 为独立脚本，未挂载 app.js；生产环境是否需要计划任务常驻 worker 属独立授权项。
4. **幂等窗口**：request_hash 仅对 PENDING/RUNNING 任务复用；COMPLETED 后同请求会新建任务（有意为之：允许历史分析重跑），无超时窗口设计（不过度设计）。
5. **AI_PROVIDER 进程级覆盖**：E2E 脚本进程级 `AI_PROVIDER=ollama`（不改 `.env`）；正式环境路由依赖 `.env` 配置（AI-04 遗留）。
6. **hse.data.analysis 仍为 DRAFT**（AI-06 遗留）：任务系统不改变 Prompt 状态，正式启用需 DRAFT→ACTIVE 流程。
7. **生产库未启用 AI-07 能力**：无 migration、生产库零改动；生产启用需独立授权（含 worker 部署方案）。

## 25. 未完成事项

1. worker 生产化部署方案未定（常驻进程/计划任务/PM2 等，属独立授权项）。
2. 定时自动分析未建设（任务书 §26 明确本阶段不做日/周/月自动分析）。
3. 前端 AI 分析页面未开发（任务书 §27 明确 AI-08 再做正式前端；本阶段仅 API/类型/封装允许）。
4. violation / assessment / risk / accident 域未注册任务 domain（任务书 §7 边界）。
5. RETRYING 状态已定义转换路径，但未实现自动重试调度（本阶段为手工/调用方触发语义）。
6. ai_prompt_registry 持久化遗留（AI-05 继承）。

## 26. [需要用户确认]

1. **生产环境 worker 部署方案**：开发验证用独立脚本（`ai07_worker.cjs`）不挂载 app.js；生产启用任务执行器需确认部署形态（独立常驻进程 / Windows 计划任务 / 随后端进程启动），属独立生产操作，需显式授权。
2. **生产库启用 AI-07 能力**：`ai_analysis_tasks` 建表已在开发库执行；生产库执行同一 DDL 需独立授权。
3. **生产 .env AI_PROVIDER 切换**（AI-04/05/06 遗留）：是否切换为 ollama（prod-boundary 禁止 AI 修改 .env，需显式授权）。
4. **hse.data.analysis DRAFT→ACTIVE**（AI-06 遗留）：是否用真实（脱敏）业务数据做一轮验证后转 ACTIVE。
5. **自动重试策略**：RETRYING 语义已定义，是否需要自动重试（次数/间隔）需产品决策。
6. **AI-05 测试统计口径差异**（任务书 §30 历史遗留）：AI-05 报告「57/57」与分类明细合计 51 项存在口径差异，本阶段未返工，待后续审计/查看原始测试脚本时核对。

## 27. AI-08 建议

- **AI-08 正式前端**：基于 analysis-tasks API 建设 AI 分析中心页面（任务列表/状态轮询/结果查看/取消/重试），异步轮询避免长阻塞。
- 前置建议：
  1. 确认 §26 中 1/2（生产 worker 部署、生产建表授权）。
  2. 评估任务结果缓存与历史任务复用策略（COMPLETED 任务是否直接返回结果而非重跑）。
  3. 评估自动重试与定时分析（任务书 §26 留待后续阶段）。
- **必须等待 ChatGPT 审核本报告与进度文件后，生成 AI-08 唯一正式提示词，不得自行开始。**

---

## AI-07 最终状态

```text
AI-07 状态：PASS

任务模型：PASS（ai_analysis_tasks 23 列，只存请求/统计快照/结果/Evidence/状态/错误，业务表唯一事实来源，未建重复表）
状态机：PASS（PENDING/RUNNING/COMPLETED/FAILED/CANCELLED/RETRYING，显式转换表，非法转换拦截 AI_TASK_INVALID_STATE）
幂等：PASS（request_hash sha256，活跃任务复用，连续 3 次同请求仅 1 新建 + 2 复用）
异步执行器：PASS（aiAnalysisWorker 轮询+原子领取+超时 300000ms，无新基础设施）
不阻塞创建接口：PASS（POST /analysis-tasks 同步返回 PENDING，不等待 AI）
并发 ≤1：PASS（PostgreSQL advisory lock，A=RUNNING 时 B/C 保持 PENDING 实测）
AI-06 analysisService 复用：PASS（直接调用 analyzeData，统计/归一化/RAG/解析/Evidence 零复制）
AI Gateway 复用：PASS（未建 gateway2）
Ollama 真实 E2E：PASS（qwen2.5:7b，42.3s，totalRecords=110，evidence=1，generationRecordId=13）
Generation Record 可追溯：PASS（复用 ai_generation_records，未加字段，无四套重复记录）
Evidence 可追溯：PASS（business_record + knowledge_base 沿用 AI-06）
AI unavailable 降级：PASS（COMPLETED + degraded=true + ai.available=false + 统计先完成，不伪装成功）
Statistics 不依赖 AI：PASS（grok 场景 totalRecords=110 统计正常落快照）
取消：PASS（PENDING→CANCELLED 不被执行；RUNNING 仅记录取消请求，禁止假取消）
权限：PASS（写 requireRole(admin,safety_manager)，读任意登录，401 实测，userId=req.user.id）
日志脱敏：PASS（仅任务元数据，无 Prompt/业务记录/员工信息）
数据库边界：PASS（开发库 safety_dashboard 1 表 2 索引；生产库零 migration 零写入）
Workbuddy 隔离：无冲突（保护域零触碰，未注册三违/风险/事故 domain）
测试：PASS（39/39 真实运行：Unit 17 + Integration 13 + Route 9，报告数字与脚本逐项对应）

[需要用户确认]：
1. 生产 worker 部署方案（独立授权）
2. 生产库执行 ai_analysis_tasks DDL（独立授权）
3. 生产 .env AI_PROVIDER 切换（AI-04/05/06 遗留）
4. hse.data.analysis DRAFT→ACTIVE 验证流程（AI-06 遗留）
5. 自动重试策略（RETRYING 已定义，调度未实现）
6. AI-05 测试统计口径差异后续核对

遗留问题：
1. worker 生产化部署未定
2. 定时自动分析未建设（任务书 §26 边界）
3. 前端分析页面未开发（AI-08 范围）
4. violation/assessment/risk/accident 域未注册任务 domain
5. RETRYING 自动重试调度未实现
6. ai_prompt_registry 持久化遗留（AI-05 继承）
7. 生产 .env 未切换 Ollama（AI-04 遗留）

下一阶段：AI-08（等待 ChatGPT 审核后生成唯一正式提示词）
```
