# AI-10：HSE AI 分析结果与管理建议能力建设实施报告

- **阶段**：AI-10
- **日期**：2026-09-15
- **执行环境**：开发库 `safety_dashboard`、开发后端 5881、开发 worker（`AI_TIMEOUT_MS=300000` 进程级覆盖）、真实 Ollama `qwen2.5:7b`（CPU）
- **任务书要点**：先审计再最小实现；复用 AI-06～AI-09 全链路，不建第二套架构；管理建议结构化输出；人机边界 fail-closed；Evidence 可追溯；AI unavailable 正确降级；Provider 路由回归；测试数据全部清理；生产零触碰；AI-10 完成后立即停止。

---

## 1. 执行摘要

AI-10 已交付「AI 分析结果 → 管理建议」最小能力：以 AI-09 分析任务（`aiResult.analysis` + `statisticsSnapshot` + `evidence`）为唯一输入，复用现有 AI Gateway / Provider Registry / Prompt Registry / aiEvidenceService / ai_generation_records，新增一个 DRAFT Prompt（`hse.management.suggestion` v1.0）、一个 Prompt Builder、一个 Suggestion Service，加 2 个 API 端点与前端展示区。

- 管理建议为固定 JSON 协议（overall_assessment / priority_issues / management_actions / monitoring_points / follow_up_suggestions / limitations），数量与长度受限，fail-closed 校验。
- 人机边界：AI 仅输出建议性内容；`assertBoundary` 对责任认定、扣分/罚款、处罚/处分、整改指令、风险等级变更、考核结果变更六类表述命中即拒绝采用（`AI_BOUNDARY_VIOLATION`），不写任何业务最终字段。
- 零 migration、零新表、零新 npm 依赖；持久化复用 `ai_generation_records`（`type='analysis'`、`sub_type='management_suggestion'`、`title='管理建议:任务#${taskId}'` 作为与任务的关联键）。
- 真实验证全 PASS：**Unit 41/41 + Integration 15/15 + Route 5/5 + Frontend 5/5 = 25/25**（真实 Ollama qwen2.5:7b 闭环 1 次建议生成，耗时 142754ms；另含 1 次真实 AI-09 分析任务闭环）。
- 人工确认状态持久化：现有 AI 表均无 `review_status/reviewed_by/reviewed_at/human_remark` 字段，按任务书 §12 未自行建表，列为 **NEED USER CONFIRMATION**（见 §24）。
- 测试数据全部清理：创建 2 任务 + 4 生成记录 + 1 临时用户，删除 2 任务 + 4 记录 + 1 用户，残留 0（复查脚本确认）。

## 2. AI-09 基线审计（先审计后编码）

实际读取并审计（非源码猜测）：

```text
server/services/ai/analysis/              （analysisDataAdapter / analysisNormalizer /
                                           analysisStatistics / analysisPromptBuilder / analysisService）
server/services/ai/tasks/                 （aiAnalysisTaskService / aiAnalysisWorker）
server/services/ai/aiGateway.js           server/services/ai/aiEvidenceService.js
server/services/ai/aiGenerationRecordService.js  server/services/ai/aiPromptRegistry.js
server/services/aiService.js               server/controllers/aiAnalysisTaskController.js
server/routes/ai-v2.js
安全看板vben/apps/web-naive/src/views/hse/ai-analysis/index.vue
安全看板vben/apps/web-naive/src/api/hse/ai.ts
安全看板vben/apps/web-naive/src/router/routes/modules/hse.ts
```

审计结论（AI-10 复用基线）：

| # | 审计项 | 结论 |
|---|--------|------|
| 1 | `analysisTypes` 实际输出 | AI-09 已升级为三处真实生效：统计层 `deriveFocus`（focus 标记）、Prompt 层 focusBlock、AI 输出侧重；保持固定八段协议兼容。AI-10 不重复 |
| 2 | `statisticsSnapshot` 结构 | 含 `summary`（total 等）、按维度的趋势/高频/整改统计、`dataScope={totalAvailable,analyzedRecords,limit,truncated}`、`focus`；随任务落库 |
| 3 | `aiResult` 结构 | `{ available, structured, analysis(八段 JSON), provider, model, code, message, ... }` |
| 4 | `evidence` 结构 | `[{ source_type('business_record'|'knowledge_base'), source_id, source_domain, source_field, evidence_text, evidence_strength }]` |
| 5 | `generationRecordId` | 任务完成时指向 `ai_generation_records.id`（AI-09 真实闭环 = 18） |
| 6 | task 状态 | PENDING/RUNNING/COMPLETED/FAILED/CANCELLED/RETRYING 显式状态机；仅 COMPLETED 可生成建议 |
| 7 | RAG 是否可选 | 是：任务创建 `useRag` 可选；任务 evidence 中的 knowledge_base 项即制度依据 |
| 8 | AI unavailable/degraded | AI-06 起即：COMPLETED + degraded + ai.available=false + 统计照常，不 500、不伪造成功 |
| 9 | `dataScope` | 已暴露 totalAvailable/analyzedRecords/limit/truncated，前端按真实 truncated 警告 |
| 10 | 既有“管理建议/报告/结论”能力 | 无：现有能力止于「结构化数据分析」，无管理建议生成/展示/确认能力 → AI-10 补最小缺口 |

## 3. 实际代码审计结果（AI-10 相关点）

1. **Gateway 复用**：`aiGateway.generate({promptKey, promptVersion, data, customInstructions, evidence, provider, userId, sourceDomain, sourceRecordId, record})` 已具备落库 + Evidence 全链路，AI-10 直接调用，零改动。
2. **Provider 路由**：AI-09 已修复 `aiService.chat/chatStream` 尊重 `options.provider`；AI-10 服务把 `provider` 原样透传（显式指定尊重、未指定走默认），并做回归验证。
3. **Prompt Registry**：`aiPromptRegistry.register/get/render` 现成；AI-10 只新增一个 DRAFT Prompt 注册项，未改动机制。
4. **持久化**：`ai_generation_records` 已有 `type/sub_type/title/provider/model/prompt_key/prompt_version/evidence/result/duration_ms` 等字段，可通过 `title` 作为与任务的关联键，**无需 migration**。
5. **前端**：`index.vue` 已有详情抽屉（统计 → AI 八段 → Evidence 分类展示）；AI-10 在详情区追加「管理建议」卡片，保持 HsePageLayout / Naive UI / message / notificationService / @vben/request 不变。
6. **review 相关字段**：`information_schema` 全局检索 `%review%/%audit%/%confirm%`，AI 相关表（`ai_analysis_tasks`、`ai_generation_records`）与业务表均无可用于「管理建议人工确认」的现成字段（`standard_evaluation_items` 的 review 字段属于标准化条款域，语义不可复用）。

## 4. 设计方案

```
AI-09 分析任务（COMPLETED）
    │  aiResult.analysis（八段） + statisticsSnapshot + evidence
    ▼
managementSuggestionService.generateSuggestion(taskId)
    │ ① 状态校验（仅 COMPLETED；否则 AI_TASK_INVALID_STATE）
    │ ② AI 分析可用性校验（aiResult.available !== true → 降级，保留统计）
    │ ③ 缓存复用（title 关联键查 ai_generation_records；force=true 跳过；无效缓存如实报错）
    │ ④ 建议上下文 = buildSuggestionPrompt(analysis, statistics, ragEvidence=任务evidence知识库项)
    │ ⑤ AI Gateway（provider 透传）→ Ollama / qwen2.5:7b
    │ ⑥ parseStructuredOutput（复用 AI-06 解析器）→ validateSuggestion → assertBoundary（fail-closed）
    ▼
结构化六字段管理建议 + Evidence（任务 evidence + 管理建议链路证据）→ ai_generation_records 落库
```

原则落实：

- **不重复建设**：不新建第二套 Gateway/Provider/RAG/Evidence/Generation Record/analysis task/aiService2/大型框架；零新 npm 依赖。
- **AI-10 不是新的数据分析系统**：不重复 adapter/normalizer/statistics/dataScope/analysisTypes/task worker，全部复用 AI-09 结果。
- **AI-10 不是自动报告系统**：不做 Word/PDF/月报/邮件/定时/订阅/推送/自动整改/自动考核/自动扣分/自动责任认定。
- **人工确认状态**：审计确认无现成字段 → 本阶段不建表（见 §24，NEED USER CONFIRMATION）。

## 5. 修改文件

**后端（新增 2 服务文件 + 修改 2 个既有文件）**

| 文件 | 变更 |
|------|------|
| `server/services/ai/analysis/managementSuggestionPromptBuilder.js` | 新增：建议 Prompt 构建（协议 Schema、上下文序列化、RAG 制度依据注入、人机边界指令、JSON-only） |
| `server/services/ai/analysis/managementSuggestionService.js` | 新增：生成/解析/校验/边界/缓存/Evidence 拆分/降级 |
| `server/services/ai/aiPromptRegistry.js` | 修改：注册 `hse.management.suggestion` v1.0（DRAFT） |
| `server/controllers/aiAnalysisTaskController.js` | 修改：+`generateManagementSuggestion` / `getManagementSuggestion` |
| `server/routes/ai-v2.js` | 修改：+POST / GET `/analysis-tasks/:id/management-suggestions` |

**前端（修改 2 个既有文件）**

| 文件 | 变更 |
|------|------|
| `安全看板vben/apps/web-naive/src/api/hse/ai.ts` | +`ManagementSuggestion`/`ManagementSuggestionResult` 类型、+`generateManagementSuggestion`/`getManagementSuggestion` |
| `安全看板vben/apps/web-naive/src/views/hse/ai-analysis/index.vue` | 详情区 +「管理建议」卡片（生成/加载/已生成/未生成/AI 不可用五态；总体判断/重点关注/管理措施/持续监测/后续建议/AI限制；依据分区：统计分析依据 vs 制度/知识依据） |

**测试/审计脚本（新增，均已留存）**：`server/scripts/ai10_test_unit.cjs`、`ai10_test_e2e.cjs`、`ai10_vuetsc_output.txt`、`_ai10_audit_db.cjs`、`_ai10_audit_users.cjs`、`_ai10_fk_check.cjs`、`_ai10_peek_task.cjs`、`_ai10_residue_check.cjs`、`_ai10_cleanup_residue.cjs`；输出 `server/ai10_unit_out.txt`、`server/ai10_e2e_out.txt`。

## 6. API 变化

挂载：`/api/hse/ai/v2`（沿用 AI-07 收口）。

| 端点 | 方法 | 权限 | 说明 |
|------|------|------|------|
| `/analysis-tasks/:id/management-suggestions` | POST | admin / safety_manager | 生成管理建议；body `{provider?, force?}` |
| `/analysis-tasks/:id/management-suggestions` | GET | 任意登录用户 | 查询已生成建议（未生成返回 `AI_SUGGESTION_NOT_GENERATED`） |

响应（POST/GET 统一）`ManagementSuggestionResult`：`taskId / available / structured / suggestion / code / message / provider / model / promptKey / promptVersion / durationMs / recordId / recordSaved / evidence / statistics / cached / degraded / createdAt`。

## 7. 数据结构变化

**数据库：零 migration、零新表、零 DDL、零业务字段写入。**

持久化复用 `ai_generation_records`：

```text
type        = 'analysis'
sub_type    = 'management_suggestion'
title       = '管理建议:任务#{taskId}'        ← 与 ai_analysis_tasks 的关联键（零 migration）
prompt_key  = 'hse.management.suggestion'
prompt_version = 'v1.0'
provider / model / evidence / result / duration_ms / created_at
```

追溯链：`管理建议记录 → title → ai_analysis_tasks#{id} → statisticsSnapshot / evidence → 业务记录`。

## 8. 管理建议结构（固定协议，AI-10 任务书 §6）

```json
{
  "overall_assessment": "总体分析判断（≤100字，必须基于给定分析结果）",
  "priority_issues": ["重点关注问题（2~5条，每条≤60字）"],
  "management_actions": ["管理层可考虑措施（2~5条，每条≤60字，仅建议性措辞）"],
  "monitoring_points": ["持续观察指标（1~4条，每条≤40字）"],
  "follow_up_suggestions": ["进一步核查方向（1~4条，每条≤40字）"],
  "limitations": ["数据不足/样本截断/AI限制（1~4条，每条≤40字）"]
}
```

- 服务端校验上限（fail-closed）：overall_assessment >200 字拒绝；数组元素 >120 字拒绝；字段缺失/类型错误拒绝（`AI_STRUCTURED_OUTPUT_INVALID`）。
- Prompt 内数量约束：priority_issues/management_actions 2~5 条、其余 1~4 条；总体判断 ≤100 字、每条建议 ≤60 字（服务端以更宽的 200/120 兜底，防止误杀）。

## 9. Evidence 链路

- 复用 `aiEvidenceService`，不新建 Evidence 表。
- 生成时证据 = 任务既有 evidence（business_record 统计分析依据 + knowledge_base 制度依据）+ 新增 1 条「管理建议链路证据」（`source_type='business_record'`、`source_domain='analysis_task'`、`source_field='management_suggestion'`、文本注明可追溯至任务 statistics_snapshot 与 evidence）。
- 建议记录落库时由 Gateway 将 evidence 一并写入 `ai_generation_records.evidence`（JSONB）。
- 若启用 RAG：任务 evidence 中的 knowledge_base 项被注入 Prompt（标注 `[文档标题]`），前端「制度/知识依据」分区展示。
- 前端明确区分「统计分析依据」与「制度/知识依据」，不把 aggregate-level 业务证据描述成逐条业务记录证据。

## 10. 权限矩阵（实测）

| 角色 | 生成建议（POST） | 查看建议（GET） |
|------|------------------|------------------|
| admin | 200 成功 | 200 |
| safety_manager | 200 成功 | 200 |
| grid_inspector（普通认证用户） | 403 拒绝 | 200 |
| 未认证 | 401 | 401 |

- 未自行扩大权限：写权限沿用 AI-07/09（admin+safety_manager）；读为任意登录用户（建议内容仅为参考性建议，允许一线查看）。
- 人工确认权限（谁能确认）：本阶段未实现确认动作，无确认权限。

## 11. AI unavailable（实测）

- `provider='grok'`（GROK_API_KEY 为空）→ HTTP 200 + `available=false` + `code=AI_PROVIDER_NOT_CONFIGURED` + `message='GROK_API_KEY is empty'` + `statistics` 完整返回（统计保留），不 500、不伪造成功。
- 前端降级文案：`当前 AI 服务不可用，无法生成管理建议…请根据统计结果由管理人员人工研判`，并明示「原 AI-09 统计分析结果不受影响」。
- AI 分析本身不可用（aiResult 缺失/不可用）→ 返回 `available=false` + 原任务错误码/`AI_UNAVAILABLE` + 统计保留，不触发生成。

## 12. Provider 回归（AI-09 修复验证，实测）

| 场景 | 结果 |
|------|------|
| 显式 `provider='ollama'` | 尊重调用方 → Ollama 真实闭环 |
| 显式 `provider='grok'` | 尊重调用方 → NOT_CONFIGURED 降级（说明未回退到 ollama） |
| `provider` 未指定 | 保持原默认行为（默认 grok）→ NOT_CONFIGURED 降级，不 500 |
| `provider='no-such-provider'` | `AI_PROVIDER_NOT_FOUND` |
| `provider='openai_compatible'` | 可解析（注册表存在） |
| 不影响 AI-04～AI-09 调用链 | 分析任务/worker/知识库调用均未改，e2e 全 PASS |

## 13. Ollama 真实闭环

- 环境：开发后端 5881 + AI-10 worker（`AI_TIMEOUT_MS=300000`）+ Ollama `qwen2.5:7b`（CPU）。
- 链路（真实执行）：创建 AI-09 分析任务（hazard 域、analysisTypes=[trend,frequency,rectification]、2026-01-01~08-31、provider=ollama）→ PENDING → worker 领取 → 统计（`statisticsSnapshot.summary.total=110`，dev 库真实 hazard 数据只读）→ 真实 Ollama 生成八段分析（`generationRecordId=19`）→ COMPLETED → POST management-suggestions（provider=ollama）→ **真实 Ollama 建议生成，耗时 142754ms** → 结构化六字段齐全（示例 overall：「2026年整改率波动较大，尤其是6月最低仅为66.7%。」；priority 3 条、actions 2 条）→ `recordId=20` 落库 + Evidence 2 条（business_record）→ GET 缓存复用 `cached=true` → DB 校验（title/prompt_key/evidence/model=qwen2.5:7b 全对）→ 建议内容未越界。
- 验证了 CPU 模型单次建议生成 ≈ 143s：超过 `.env` 60000ms，依赖进程级 300000ms 覆盖（详见 §15 超时审计）。

## 14. Unit 测试（41/41）

套件：`server/scripts/ai10_test_unit.cjs`（输出 `server/ai10_unit_out.txt`）。

- PromptBuilder 6 项：协议六字段、数量/长度上限、人机边界指令、JSON-only、上下文（分析结果+统计快照）、RAG 制度依据注入。
- 解析 4 项：合法 JSON、```json 围栏剥离、非 JSON 拒绝、空内容拒绝。
- 校验 7 项：正常通过、缺 overall_assessment 拒绝、缺 management_actions 拒绝、数组类型错误拒绝、空数组合法、总体判断超长拒绝、数组元素超长拒绝。
- 边界 9 项：正常建议通过；责任认定/扣分/责任人/处罚/整改指令/风险等级/考核结果 7 类越权表述全部拒绝（`AI_BOUNDARY_VIOLATION`，fail-closed）；正常措辞（整改/未整改/可能原因）不误伤。
- 降级 3 项：非 COMPLETED → `AI_TASK_INVALID_STATE`；aiResult=null → `AI_UNAVAILABLE` + 统计保留；aiResult.available=false → 保留错误码 + 统计保留。
- Gateway 4 项：成功（available+结构化+recordId+协议字段）、Provider 不可达（不 500 + 统计保留）、非法 JSON（structured=false）、越权内容（`AI_BOUNDARY_VIOLATION`）。
- 缓存 2 项：有效记录 → cached+available+suggestion；无效记录 → cached + available=false，不伪装成功。
- Evidence 1 项：统计/知识两分。
- Provider 5 项：显式 ollama、显式 grok、未指定（默认 grok）、不存在（`AI_PROVIDER_NOT_FOUND`）、openai_compatible 可解析。

## 15. Integration 测试（15/15，含真实闭环）

套件：`server/scripts/ai10_test_e2e.cjs`（输出 `server/ai10_e2e_out.txt`）。

1. 创建分析任务 → PENDING（真实 hazard 域）✓
2. 任务 COMPLETED（真实 Ollama 分析闭环，aiAvailable=true，genRecId=19）✓
3. statisticsSnapshot 存在（total=110）✓
4. 任务 evidence 存在（统计分析依据）✓
5. 管理建议生成 → available + 结构化（真实 Ollama 闭环，143s，recordId=20）✓
6. 建议协议六字段完整 ✓
7. 建议记录已落库（generationRecordId）✓
8. 建议证据可追溯（含 management_suggestion 链路证据）✓
9. 建议未越过人机边界 ✓
10. GET 缓存复用（cached=true）✓
11. DB 落库校验（type/sub_type/title/prompt_key/evidence）✓
12. AI unavailable（grok 未配置）→ HTTP 200 + available=false + 统计保留 ✓
13. Provider 不存在 → AI_PROVIDER_NOT_FOUND ✓
14. Provider 未指定 → 默认 grok 降级（不 500）✓
15. 非 COMPLETED 任务生成建议 → AI_TASK_INVALID_STATE ✓

## 16. Route 测试（5/5，权限）

1. safety_manager 可生成建议 ✓
2. grid_inspector 生成建议 → 403 ✓
3. 未认证生成建议 → 401 ✓
4. 读取：admin / safety_manager / grid_inspector 均可查看 ✓
5. 读取：未认证 → 401 ✓

## 17. Frontend 测试（5/5，源码断言）

1. index.vue 含「管理建议」卡片（总体判断/依据）✓
2. 含协议字段展示（priority_issues/management_actions/monitoring_points/follow_up_suggestions/limitations）✓
3. 区分「统计分析依据」/「制度/知识依据」✓
4. AI 不可用降级提示（「当前 AI 服务不可用…人工研判」）✓
5. ai.ts 导出建议接口与类型（generate/get ManagementSuggestion、ManagementSuggestionResult、overall_assessment）✓

## 18. vue-tsc 结果

- 命令：`npm run typecheck`（`vue-tsc --noEmit --skipLibCheck`），输出 `server/scripts/ai10_vuetsc_output.txt`。
- **AI-10 新增错误 = 0**（`views/hse/ai-analysis/index.vue`、`api/hse/ai.ts` 均无错误）。
- **历史错误 = 60**（全部位于 AI-10 未触碰文件：assessment-monthly/*、assessment-rule/index.vue、employee/departments.vue、meeting-records/*、responsibility-forms/*、site/grid-ledger/*、site/grid/*、training/certificates/*、training/ledger/*），按任务书要求不越界修复，单独记录。

## 19. 测试数据清理

| 对象 | 创建 | 删除 | 残留 |
|------|------|------|------|
| ai_analysis_tasks（任务 58/59） | 2 | 2 | 0 |
| ai_generation_records（记录 19/20/21/22） | 4 | 4 | 0 |
| 临时用户 ai10_test_sm（id=250，AI10_TEST 标记） | 1 | 1 | 0 |

- 复查脚本 `_ai10_residue_check.cjs` 实测：tasks=0、records=0、sm_users=0；全表 analysis tasks 仅剩既有任务 20（AI-07 阶段遗留，非本阶段数据）。
- 本阶段未新建业务测试数据（直接复用 AI-09 已验证的 dev 库 hazard 数据只读）。

## 20. Workbuddy 隔离检查

- 保护区域零触碰：`grid_record_sync_map / grid_inspection_records / grid_areas / wps_account_employee_map`、`routes/wps-grid-sync.js / routes/wps-dbsheet.js / services/wps/* / wpsGridSyncScheduler.js / wpsGridPullEngine.js / wpsGridMigrationService.js`、`violationService.js / violationCheckerScope.js / violationController.js / routes/violations/* / ruleEngine/* / violationTargetResolver.js / deductionWriter.js`、`sanwei* / gridViolationCandidateService.js / gridAttributionService.js / gridScope.js / gridCompletionService.js`、`views/site/violation/*` 全部未触碰。
- AI-10 分析来源继续使用 hazard（只读），未接入三违自动判断/处罚。
- git 状态中这些文件的 M 记录全部为 Workbuddy 既有修改，非本阶段产生。

## 21. Git 前后状态

- 全程未执行 `reset / checkout / clean / restore`，未删除任何 Workbuddy 未提交修改。
- 本阶段修改文件（见 §5）：后端 5（含 2 新增服务文件）、前端 2、测试/审计脚本 9（新增）。
- Workbuddy 既有修改（violation*/ruleEngine*/assessment*/grid*/WPS 相关等）与 AI-01～AI-09 未提交文件均原样保留。

## 22. 风险

1. **[治理遗留] `.env AI_TIMEOUT_MS=60000`** 与 CPU qwen2.5:7b 实际耗时不匹配：本阶段实测管理建议单次生成 142754ms（>60000）。开发验证以进程级 `AI_TIMEOUT_MS=300000` 覆盖；生产 `.env` 未修改（详见 §23）。
2. **[治理遗留] vue-tsc 全量 60 处历史类型错误**，AI-10 新增 0，不越界修复。
3. **人工确认状态未持久化**：现有 AI 表无 review 字段，本阶段零 migration 未建表（见 §24）。
4. **缓存键为 title 文本关联**：`ai_generation_records.title` 作为任务关联键是零 migration 方案，属文本约定，后续若引入正式外键/确认表需迁移。
5. **CPU 模型长耗时**：建议生成 1~3 分钟量级，前端有 loading 态，无并发控制新增（沿用 worker 并发 1）。

## 23. AI_TIMEOUT_MS 多级超时审计（先审计，不修改生产 .env）

| 层 | 来源 | 现状 |
|----|------|------|
| 环境变量 | `server/.env AI_TIMEOUT_MS` | 60000（未改） |
| aiService 默认 | `aiService.js` `parseInt(process.env.AI_TIMEOUT_MS) || 60000` | 60s 兜底 |
| HTTP 请求超时 | `aiService.sendRequest/sendStreamRequest` `timeout` | 同 AI_TIMEOUT_MS |
| 健康探测超时 | `aiHealthService.probeUrl` / Provider 注册表探测 | 5000ms |
| Worker 执行超时 | `aiAnalysisWorker.js` `parseInt(env) || DEFAULT_TIMEOUT_MS(300000)` | 读同一 env（.env=60000 会覆盖默认），dev 以进程级 300000 启动 |
| 重试退避 | aiService 重试 `min(1000×2^n, 10000)` | 与超时叠加 |
| Gateway 错误映射 | aiGateway → `AI_TIMEOUT` | 仅映射，无独立超时值 |

结论：存在多级超时但源头单一（AI_TIMEOUT_MS）；差异在「默认兜底」——worker 默认 300000、aiService 默认 60000。CPU qwen2.5:7b 分析 60~125s、建议 143s 均已超过 60000。

**建议（仅建议，未执行）**：① 将 `.env AI_TIMEOUT_MS` 调至 300000 或按操作分档（分析/建议各设，如 `AI_ANALYSIS_TIMEOUT_MS`/`AI_SUGGESTION_TIMEOUT_MS`）；② worker 与 aiService 默认值统一；③ 超时失败按 retryable 处理并保留统计降级。生产 `.env` 修改需用户显式授权后单独执行。

## 24. 是否需要用户确认（NEED USER CONFIRMATION）

**人工确认状态持久化（任务书 §12/§20）**：

- 已审计 `ai_analysis_tasks`（23 列）、`ai_generation_records`、`standard_evaluation_items` 及全库 `%review%/%audit%/%confirm%` 字段，**确认不存在可复用的** `review_status / reviewed_by / reviewed_at / human_remark`。
- 按任务书「如果需要新增 DB 结构，先停止编码并在报告中明确提出，等待用户确认」：**本阶段未新增任何确认表/字段**，暂停该部分实现。

请用户确认以下方案之一：
1. **零 migration 方案（推荐）**：人工确认动作落地为「前端状态标记 + 写入 `ai_generation_records.evidence` 或 `result` 扩展字段」这类 JSONB 内记录（不改表结构，语义为参考性确认，不进入任何业务最终字段）；
2. **新增确认字段**：`ai_generation_records` 增加 `review_status/reviewed_by/reviewed_at/human_remark`（最小 migration，仅 dev 库执行，需授权）；
3. 暂不做人工确认持久化，确认动作仅停留在页面会话态。

其余确认点：`hse.management.suggestion` v1.0 维持 **DRAFT**（不 ACTIVE）；`hse.data.analysis` v1.0 维持 DRAFT（未改动）；生产 `.env` / 生产 worker / 生产库均未触碰，若需调整超时或启用生产 AI，需另行授权。

## 25. 最终 PASS/FAIL 结论

**AI-10 PASS**（含 1 项 NEED USER CONFIRMATION：人工确认持久化，见 §24）。

完成判定清单：

- [x] 已审计 AI-06～AI-09 实际代码（§2/§3）
- [x] 管理建议复用现有 AI Gateway / Provider Registry / Prompt Registry / Evidence / generation records（§4/§5）
- [x] 没有建设第二套 AI 架构（零新 Gateway/Provider/RAG/Evidence/任务体系，零新 npm 依赖）
- [x] 管理建议结构化输出（六字段固定协议，数量/长度受限，fail-closed 校验）
- [x] AI 建议与事实统计分离（数字必须引用统计快照；建议不进业务最终字段）
- [x] AI 不能自动定责/扣分/处罚/整改（六类越权表述实测拒绝）
- [x] Evidence 可追溯（建议 → 任务 → statisticsSnapshot → business_record；knowledge_base 制度依据区分展示）
- [x] AI unavailable 正确降级（HTTP 200 + available=false + 统计保留，不 500 不伪造）
- [x] Provider 路由回归测试通过（ollama/grok/openai_compatible/未指定/不存在，AI-09 修复无回归）
- [x] 至少一次真实 Ollama qwen2.5:7b 闭环（分析任务 + 管理建议双闭环）
- [x] 权限矩阵验证通过（admin/safety_manager/grid_inspector/未认证，未扩大权限）
- [x] 测试全部通过（精确数字见下）
- [x] AI-10 新增 TypeScript 错误 = 0；历史 60 处单独记录
- [x] Workbuddy 保护区域零触碰
- [x] 生产 DB 零修改、生产 .env 零修改、生产 worker 零修改
- [x] 测试数据全部清理（创建 2+4+1 / 删除 2+4+1 / 残留 0）
- [x] Git 未执行 reset/checkout/clean/restore
- [x] AI-05 57/57 vs 51 历史矛盾继续保留，未修改
- [x] `hse.data.analysis` v1.0 保持 DRAFT；`hse.management.suggestion` v1.0 为 DRAFT

**测试精确数字（报告 = 脚本输出）：**

```text
Unit: 41/41
Integration: 15/15
Route: 5/5
Frontend: 5/5
Total: 25/25  Failed: 0
```

（vue-tsc --noEmit：全量 60 处既有错误；AI-10 文件 0 新增。）

---

*AI-10 实施完毕，立即停止，不自行进入 AI-11。等待用户将本报告与更新后的《AI智能分析实施进度.md》交 ChatGPT 审计。*
