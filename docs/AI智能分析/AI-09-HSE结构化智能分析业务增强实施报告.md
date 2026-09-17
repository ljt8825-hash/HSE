# AI-09：HSE结构化智能分析业务增强实施报告

> 执行环境：`G:\hse-dashboard` ｜ 前端：`apps/web-naive`（Vue 3 / Vben 5.7.0 / Naive UI 2.44.1）｜ 后端：`server`
> 执行方式：Trae + DeepSeek V4 Flash ｜ 执行日期：2026-09-15
> 上一阶段：AI-08 PASS（35/35）｜ 本阶段：AI-09 真实验证 47/47 PASS
> 任务书：`# AI-09：HSE 结构化智能分析业务增强`（2026-09-15 上传附件）

---

## 1. 执行摘要

AI-09 在不重建 AI 架构、不破坏 AI-01～AI-08 冻结能力、不干扰 Workbuddy 并行任务的前提下完成四项业务增强，并真实闭环验证：

1. **`analysisTypes` 真正生效**：由「仅 UI 展示参数」改造为「统计重点标记（`deriveFocus`）+ Prompt 上下文（`ANALYSIS_TYPE_FOCUS` focusBlock）+ AI 输出侧重」三处真实生效；保持 AI-06 固定八段协议兼容（未选中方向返回空数组而非裁字段）。
2. **`MAX_RECORDS=2000` 截断可见**：`analysisDataAdapter` 以 `COUNT(*) + LIMIT` 计算 `dataScope = { totalAvailable, analyzedRecords, limit, truncated }` 随 `statisticsSnapshot` 持久化；前端仅在后端真实返回 `truncated=true` 时展示 NAlert 警告（不硬编码 2000、不按数组长度猜测）。
3. **菜单 authority 与实际角色权限对齐**：`hse.ts` 父级 `/overview` 与 `HseAiAnalysis` 子页 `authority` 由 `['admin']` 调整为 `['admin','safety_manager']`，与 AI-07 后端写权限一致；其余子页仍为 `admin`（未扩大）；框架级确认 vben `filterTree` 逐节点判定，safety_manager 仅可见 AI 分析子页。
4. **验证中发现并修复既有缺陷**：真实 Ollama 闭环时发现 `aiService.chat/chatStream` 以全局 `config.provider`（.env=grok）选端点，导致 `OllamaProvider` 调用打到远程 Grok 地址（ETIMEDOUT）——修复为 `aiService` 尊重 `options.provider`（缺省回退全局配置，既有调用方行为不变），`Grok/OllamaProvider` 显式传自身 `name`；验证 worker 以 `AI_TIMEOUT_MS=300000`（AI-06 基线）重启。
5. **后续扩展最小接口**：确认 `analysisDataAdapter.DOMAINS` 领域注册表（hazard + inspection）即扩展口；新增领域仅需注册表/字段映射，无新框架、无平行实现。
6. **测试**：Unit 15/15 + Integration 15/15 + Route 10/10 + Frontend 7/7 = **47/47 全 PASS**（含真实 Ollama qwen2.5:7b 闭环、截断三场景、权限四角色、AI unavailable、非法参数）；`vue-tsc --noEmit` 全量 60 处历史错误、**AI-09 新增 0 处**；测试数据与临时用户已按标记清理（残留 0）；零 migration、零业务写入、生产零触碰。

---

## 2. AI-08 基线审计

### 2.1 已冻结能力（本阶段不得破坏）

| 能力 | 载体 | AI-09 动作 |
|---|---|---|
| AI Gateway 统一入口 | `services/ai/aiGateway.js` | 复用，未改动 |
| Provider 注册表 | `services/ai/aiProviderRegistry.js` | 仅 chat/chatStream 传 provider 标识（缺陷修复） |
| Prompt Registry | `services/ai/aiPromptRegistry.js` + `hse.data.analysis` v1.0 **DRAFT** | 复用，未改 DRAFT/ACTIVE 状态 |
| 结构化数据链路 | adapter → normalizer → statistics → service | 复用，按任务书最小增强 |
| 异步任务 | `ai_analysis_tasks` + worker（advisory lock 并发≤1） | 复用；worker 以 300s 超时重启（环境，非代码） |
| RAG | `useRag` 可选 + knowledge/retriever | 保持可选，未强制 |
| Evidence | `aiEvidenceService` 单一链路 | 复用，未建第二套 |
| AI-08 PC 分析中心 | `views/hse/ai-analysis/index.vue` | 增强（截断警告 + 分析方向展示），未重建 |
| 权限核心 | JWT / auth store / login / auth middleware | 零改动 |

### 2.2 基线问题复现（审计结论）

- `analysisTypes`：AI-08 页面提交、AI-07 任务持久化，但 `analysisService` 未将其传入统计与 Prompt（仅 `validateInput` 校验枚举）→ **仅 UI 参数**，确认任务书问题一。
- `MAX_RECORDS=2000`：adapter L72 `MAX_RECORDS=2000`、默认 `limit=1000` 真实生效，但返回结构无任何截断标识 → 前端无从得知部分数据分析，确认任务书问题二。
- 菜单 authority：`hse.ts` AI 分析子页与父级 `/overview` 均为 `['admin']`；后端 AI-07 写权限 = `admin/safety_manager`、读 = `authenticated` → **不一致**，确认任务书问题三。
- 权限语义（vben 5 `generate-routes-frontend.ts` 实测源码）：`filterTree` 逐节点调 `hasAuthority(route, roles)`（无 authority 放行；有则 `roles ∩ authority` 非空才保留）→ 父级 authority 会整枝过滤，故父级与子页需同时放行 `safety_manager`，其余子页保持 `admin` 即可精确控制。

---

## 3. analysisTypes 现状

审计结论（以实际代码为准，不凭 AI-08 报告）：

- **请求结构**：`POST /analysis-tasks` body 含 `analysisTypes: ['trend' | 'frequency' | 'rectification']`（前端 `form.analysisTypes` 三选多选，AI-08 已提交）；后端 `analysisService.validateInput` 校验枚举（支持 `trend/frequency/rectification/clustering`），非法值返回 `AI_INVALID_REQUEST`（Route 测试实测）。
- **处理链路**：任务创建 → `request_payload.analysisTypes` 持久化 → worker 传给 `analyzeData` → **到此为止**：`computeStatistics` 不感知、`buildPrompt` 不感知、AI 输出八段固定 → 三个方向选择不改变任何统计/Prompt/AI 行为。
- **返回结构**：AI-08 八段固定 `summary / key_findings / trend_analysis / anomalies / high_frequency_issues / possible_causes / management_suggestions / limitations`。

---

## 4. analysisTypes 改造方案

采用「固定协议 + 非选中方向不渲染重点」的最小改造，不裁剪字段（避免破坏 AI-08 前端八段兼容）：

1. **统计层**：`analysisStatistics.deriveFocus(analysisTypes)` 生成确定性 `focus` 标记 `{ trend, frequency, rectification, clustering, primary, empty }`（只标注重点、不参与数字计算），随统计结果输出与持久化。
2. **Prompt 层**：`analysisPromptBuilder.ANALYSIS_TYPE_FOCUS` 方向语义表 + `buildPrompt` 生成「分析重点方向（本次用户选择，必须优先围绕以下方向展开；未选方向可简化或省略，不得为未选方向编造深入结论）」focusBlock；未选方向时输出「未指定分析重点方向，请对统计结果均衡分析」。
3. **输出协议**：保持八段结构；AI 经 Prompt 约束侧重选中方向、简化未选方向（如仅选 `rectification` 时 `trend_analysis` 通常返回空数组或极简），`validateStructured` 对字段存在性校验不变（空数组合法）。

方向语义（任务书 §4）：

| analysisType | 统计关注 | Prompt 指令 |
|---|---|---|
| `trend` | 趋势变化、时间分布、异常波动；仅当统计中确有可比的多个时间周期才谈同比/环比 | 见 focusBlock |
| `frequency` | 高频问题、高频类别、高频来源、重复问题、问题聚集 | 见 focusBlock |
| `rectification` | 整改数量、未整改数量、整改率、整改趋势、未整改重点 | 见 focusBlock |

真实生效证据（测试 §12/§13 可核验）：`focus.primary` 随 `analysisTypes` 变化并持久化；Prompt 互斥断言（rectification 的 Prompt 不含 trend 重点）。

---

## 5. 截断统计改造

`analysisDataAdapter.fetchRawRecords`（db 模式）改造为「先 `COUNT(*)`（同过滤条件、不带 LIMIT）→ 再 `LIMIT` 拉取」：

- `totalAvailable`：同条件下数据库总量（不加载全部记录到内存，任务书 §9 要求满足）
- `analyzedRecords`：本次实际参与统计条数
- `limit`：本次读取上限（默认 1000、上限 2000 封顶，`MAX_RECORDS` 不突破）
- `truncated`：`analyzedRecords < totalAvailable`
- 注入模式（`records`）：`totalAvailable === analyzedRecords === 注入条数`、`truncated=false`

`analysisService` 将 `fetched.dataScope` 挂载到 `stats.dataScope` 随 `statisticsSnapshot` 落库；前端 `index.vue` L720-730 仅当 `stats?.dataScope?.truncated === true` 展示 NAlert：

> 本次分析仅使用部分数据。当前分析使用 {{ analyzedRecords }} 条记录，符合条件的实际数据共 {{ totalAvailable }} 条，结果可能无法完全代表全部数据。

不硬编码 2000；不按前端数组长度猜测。真实闭环实测 2100 条 → `{ totalAvailable:2100, analyzedRecords:2000, limit:2000, truncated:true }` 持久化（任务 52）。

---

## 6. 菜单/角色权限审计

### 6.1 实际现状（修改前）

- 后端 AI-07 路由（`routes/ai-v2.js`）：创建/取消 = `admin, safety_manager`；列表/详情 = `authenticated`。
- 前端 `hse.ts`：父级 `/overview` `authority: ['admin']`；`HseAiAnalysis` 子页 `authority: ['admin']`。
- 不一致点：`safety_manager` 可经 API 建任务（写权限）却看不到菜单/进不了页面。

### 6.2 最小修复（修改后）

- 父级 `/overview`：`authority: ['admin', 'safety_manager']`（`filterTree` 逐节点判定，父级不放行则整枝消失）
- `HseAiAnalysis` 子页：`authority: ['admin', 'safety_manager']`（与 AI-07 写权限对齐）
- 其余子页（cockpit / driver-risk-center 等）：保持 `['admin']`（未扩大，Frontend 测试断言）

框架级确认（`packages/effects/access/.../generate-routes-frontend.ts` 源码）：`hasAuthority` 逐路由判定，父级通过后子级独立过滤 → safety_manager 仅可见「总览 → AI 智能分析」，不暴露 cockpit 等 admin 专属子页。

### 6.3 实测矩阵（Route 套件 10/10）

| 角色 | 菜单可见 | 路由可进 | 创建任务 | 查看列表 | 取消任务 |
|---|---|---|---|---|---|
| admin | ✅ | ✅ | 200 ✅ | 200 ✅ | 200 ✅ |
| safety_manager | ✅（本次放行） | ✅ | 200 ✅ | 200 ✅ | 200 ✅ |
| grid_inspector（普通读者） | ❌ | ❌（403 页） | 403 ✅ | 200 ✅ | 403 ✅ |
| 未认证 | ❌ | ❌ | 401 ✅ | 401 ✅ | 401 ✅ |

未改 JWT / auth store / login / auth middleware；未新增菜单；未改一级菜单名称。开发库临时 `safety_manager` 用户（id=249）测试后已删除。

---

## 7. 实际修改文件

### 后端（服务层）

| 文件 | 修改内容 |
|---|---|
| `server/services/ai/analysis/analysisDataAdapter.js` | db 模式 `COUNT(*) + LIMIT` 计算 `dataScope`（totalAvailable/analyzedRecords/limit/truncated）；注入模式 dataScope |
| `server/services/ai/analysis/analysisStatistics.js` | 新增 `deriveFocus`；统计输出含 `analysisTypes` 与 `focus` |
| `server/services/ai/analysis/analysisPromptBuilder.js` | 新增 `ANALYSIS_TYPE_FOCUS`；`buildPrompt` 生成 focusBlock（选中方向优先、未选均衡、禁止编造） |
| `server/services/ai/analysis/analysisService.js` | `analysisTypes` 传入 `computeStatistics` 与 `buildPrompt`；`stats.dataScope = fetched.dataScope`；`stats.analysisTypes` 持久化 |
| `server/services/ai/aiProviderRegistry.js` | Grok/Ollama `chat/chatStream` 显式传 `provider: this.name`（缺陷修复） |
| `server/services/aiService.js` | `chat/chatStream` 选端点改为尊重 `options.provider`（缺省回退 `config.provider`，既有调用方行为不变）（缺陷修复） |

### 前端

| 文件 | 修改内容 |
|---|---|
| `apps/web-naive/src/views/hse/ai-analysis/index.vue` | 截断 NAlert（仅 `dataScope.truncated` 时展示）；详情「分析方向」展示；分析方向提交注释同步 |
| `apps/web-naive/src/api/hse/ai.ts` | 新增 `AiDataScope` 接口（四字段，注明语义） |
| `apps/web-naive/src/router/routes/modules/hse.ts` | 父级 `/overview` + `HseAiAnalysis` `authority` 放行 `safety_manager`；其余子页保持 admin |

### 新增脚本（测试/环境，交付物）

| 文件 | 用途 |
|---|---|
| `server/scripts/ai09_test_e2e.cjs` | 47 用例综合验证套件（Unit/Integration/Route/Frontend） |
| `server/scripts/ai09_test_setup.cjs` | 开发库测试环境准备（2100 条标记数据 + 临时 safety_manager 用户，幂等） |
| `server/scripts/ai09_test_cleanup.cjs` | 测试环境清理（按标记删除，残留 0） |
| `server/scripts/ai09_probe.cjs` | 审计阶段开发库现状探测（只读） |

**未改动**：`aiAnalysisTaskController.js`、`routes/ai-v2.js`、`aiAnalysisTaskService.js`、`aiAnalysisWorker.js`（仅以环境变量重启）、`aiGateway.js`、`aiPromptRegistry.js`、`aiEvidenceService.js`、`aiGenerationRecordService.js`、知识库/RAG、业务表。

---

## 8. API 变化

无新增/删除端点，无请求协议变更：

- `POST /analysis-tasks`：`analysisTypes` 语义从「仅持久化」变为「影响统计重点 + Prompt + AI 输出」；`limit` 语义不变（默认 1000、上限 2000）。
- `GET /analysis-tasks/:id`：`task.statisticsSnapshot` 新增 `dataScope`（四字段）与 `focus`、`analysisTypes`（前端按新字段展示，旧字段兼容）。
- 非法 `analysisTypes`：返回统一 AI 错误信封 `AI_INVALID_REQUEST`（非 500，实测）。

---

## 9. 前端变化

1. 截断警告：`stats?.dataScope?.truncated` 为真时展示 NAlert（文案见 §5），字段均来自后端真实返回。
2. 任务详情新增「分析方向」展示：`requestPayload.analysisTypes.join('、')`，未指定显示「未指定（均衡分析）」。
3. `api/hse/ai.ts` 增补 `AiDataScope` 类型（前端不猜测）。
4. 菜单权限：见 §6。

---

## 10. 数据库变化

- **零 migration、零新表、零 DDL**（任务书 §22）。
- 开发库 `safety_dashboard`：临时测试数据（`hazards` 2100 条 `hazard_source='AI09_TEST'`）与临时 `safety_manager` 用户由 `ai09_test_setup.cjs` 建立、`ai09_test_cleanup.cjs` 清理——`SM_USER_DELETED: id=249`、`HAZ_DELETED: 2100 条`、`HAZ_REMAIN: 0`；测试任务按 id 自建自清。
- 生产库 `safety_dashboard_dev`：零改动；生产 `.env` 零改动；生产 worker（5876）零触碰（实测 5876 监听进程未动）。

---

## 11. 测试

### 11.1 脚本与命令（可复现）

```bash
# 1) 环境准备（幂等）：2100 条标记数据（2025-01 共 2000、2025-02 共 100）+ 临时 safety_manager 用户
node server/scripts/ai09_test_setup.cjs

# 2) 开发后端（5881）+ AI-09 worker（AI_TIMEOUT_MS=300000，AI-06 基线）
PORT=5881 node server/app.js
AI_TIMEOUT_MS=300000 node server/scripts/ai07_worker.cjs

# 3) 综合验证套件
node server/scripts/ai09_test_e2e.cjs

# 4) 清理
node server/scripts/ai09_test_cleanup.cjs

# 5) 前端类型
npm run typecheck   # 在 apps/web-naive 下：vue-tsc --noEmit --skipLibCheck
```

### 11.2 实际输出（`server/scripts/_ai09_test_run3.log`）

```text
Unit: 15/15
Integration: 15/15
Route: 10/10
Frontend: 7/7
Total: 47/47  Passed: 47  Failed: 0
耗时: 58.1s
```

| 套件 | 数字 | 覆盖 |
|---|---|---|
| Unit | 15/15 | deriveFocus×4、buildPrompt focusBlock×5（含互斥）、dataScope×6（注入/<2000/=2000/>2000/默认limit/封顶） |
| Integration | 15/15 | 真实 Ollama 闭环×8（COMPLETED/dataScope 截断持久化/focus 持久化/AI 结果 available+structured/generationRecordId/Evidence/degraded=false）、AI unavailable×4、frequency 方向×2 |
| Route | 10/10 | 权限 4 角色×7（创建 200/403/401、查看 200/401、取消 403/401/200）、非法 analysisTypes 拒绝 |
| Frontend | 7/7 | hse.ts authority（子页+父级+其余子页未扩大）、index.vue 截断警告、analysisTypes 提交/展示、ai.ts AiDataScope、路由注册 |

---

## 12. 真实 Ollama 闭环

`Integration` 套件真实链路（任务 52，脚本第 1 用例，显式 `provider: 'ollama'`）：

```text
真实闭环创建任务(趋势)  → PENDING
真实闭环 → COMPLETED   （PENDING → RUNNING → COMPLETED）
dataScope 截断持久化    { limit:2000, truncated:true, totalAvailable:2100, analyzedRecords:2000 }
focus/analysisTypes 持久化 { focus:{trend:true, primary:'trend', empty:false}, types:['trend'] }
AI 结果 available+structured { provider:'ollama', model:'qwen2.5:7b', hasSummary:true }
generationRecordId "18"
Evidence 业务依据 { count:1 }（business_record，evidence_text 含「统计数据」）
degraded=false
```

AI 输出八段齐全（summary/key_findings/trend_analysis/anomalies/high_frequency_issues/possible_causes/management_suggestions/limitations），数字全部引用统计结果、原因均以「可能」措辞、无责任认定/扣分等越权内容（人工抽查任务 51 落库结果）。链路：`hazards(2100) → adapter(dataScope) → normalizer → statistics(focus) → prompt(focusBlock) → Gateway → Ollama qwen2.5:7b → 结构化解析 → Evidence → ai_generation_records(18) → COMPLETED`。

**验证中发现并修复的缺陷（Ollama 路由）**：初跑真实闭环 FAILED，定位为 `aiService.chat/chatStream` 按全局 `config.provider`（.env=`AI_PROVIDER=grok`）选端点，`OllamaProvider.chat` 因此请求远程 `GROK_BASE_URL`（`connect ETIMEDOUT ...:443`，健康检查却 AVAILABLE——探测 `/api/tags` 走本地、对话走全局配置）。修复后实测：`gateway.generate({provider:'ollama'})` 返回 `provider:'ollama', model:'qwen2.5:7b'`；worker 任务 51/52 真实闭环 COMPLETED。该修复不改变缺省行为（未传 `provider` 时与旧逻辑完全一致）。

---

## 13. 权限测试

见 §6.3 实测矩阵（Route 10/10）。另：前端源码断言确认菜单 authority 已放行 safety_manager 且未扩大其余子页；未认证/读者创建与取消返回 401/403 与后端路由一致。

---

## 14. 截断测试

Unit 套件（直连 adapter，真实开发库数据）：

| 场景 | 输入 | 实际返回 | 断言 |
|---|---|---|---|
| <2000 | 2025-01-01~01-10，limit=2000 | `{ totalAvailable:1000, analyzedRecords:1000, limit:2000, truncated:false }` | ✅ |
| =2000 | 2025-01-01~01-20，limit=2000 | `{ totalAvailable:2000, analyzedRecords:2000, limit:2000, truncated:false }` | ✅ |
| >2000 | 2025-01-01~02-05，limit=2000 | `{ totalAvailable:2100, analyzedRecords:2000, limit:2000, truncated:true }` | ✅ |
| 默认 limit | 2025-01-01~01-20（无 limit） | `{ totalAvailable:2000, analyzedRecords:1000, limit:1000, truncated:true }` | ✅ |
| limit 封顶 | 全量 + limit=999999 | `limit:2000`（MAX_RECORDS 不突破） | ✅ |
| 注入模式 | 3 条注入 | `{ totalAvailable:3, analyzedRecords:3, limit:3, truncated:false }` | ✅ |

Integration 真实闭环再次验证 `truncated:true` 随 `statisticsSnapshot` 持久化（任务 52）。

---

## 15. AI unavailable 测试

`Integration` 套件（任务 53，`provider:'grok'`，GROK_API_KEY 未配置 → NOT_CONFIGURED）：

```text
AI unavailable → COMPLETED（不 500）  status: COMPLETED
AI unavailable degraded=true           true
AI unavailable 统计照常                { dataScope:{totalAvailable:1000,analyzedRecords:1000,limit:2000,truncated:false}, focus:{rectification:true,primary:'rectification'} }
AI unavailable aiResult.available=false + 明确错误码  { available:false, code:'AI_PROVIDER_NOT_CONFIGURED' }
```

结论：统计正常生成并落库、AI 降级标记真实、任务不 500、不伪装 AI 成功（任务书 §5）。

---

## 16. 浏览器级 E2E 情况

**未执行**。项目无现成 Playwright/浏览器测试基础设施；任务书 §21 允许以「真实 API + 源码断言 + vue-tsc」组合验证，且禁止为本任务引入大型新框架/新依赖。前端行为以源码断言（Frontend 7/7）+ 真实 API 数据（Integration/Route）验证。

---

## 17. vue-tsc 情况

`npm run typecheck`（`vue-tsc --noEmit --skipLibCheck`）真实执行：

```text
全量类型错误总数：60（均为既有历史错误，集中于 assessment-*/training-*/risk 等模块）
AI-09 新增类型错误：0
AI-09 相关文件（views/hse/ai-analysis/index.vue、api/hse/ai.ts、router/routes/modules/hse.ts）：0 错误
```

未修复历史错误（不属于 AI-09 范围，维持治理遗留）；未将全项目类型治理混入本阶段。

---

## 18. Workbuddy 隔离检查

- 零触碰：`grid_record_sync_map / grid_inspection_records / grid_areas / wps_account_employee_map`、`routes/wps-grid-sync.js / wps-dbsheet.js`、`services/wps/*`、`violationService.js / violationCheckerScope.js / violationController.js / routes/violations/* / ruleEngine/* / violationTargetResolver.js / deductionWriter.js / sanwei*`、`gridViolationCandidateService.js / gridAttributionService.js / gridScope.js / gridCompletionService.js`、`views/site/violation/*`。
- AI-09 改动全部位于 AI 专属区域（`server/services/ai/*`、`server/services/aiService.js`、`apps/web-naive/src/views/hse/ai-analysis/`、`apps/web-naive/src/api/hse/ai.ts`、`apps/web-naive/src/router/routes/modules/hse.ts`、`server/scripts/ai09_*`）。
- git 工作树中的 assessment/violation/grid 等 M 条目均为 Workbuddy 并行任务既有变更，AI-09 未触碰。
- 三违/WPS 保持只读，未接入三违业务数据（任务书 §14）。

---

## 19. Git 前后状态

- **AI-01～AI-08 未提交**：`server/services/ai/`（含 AI-09 修改的 6 个服务文件）、`server/controllers/aiAnalysisTaskController.js`、`server/routes/ai-v2.js`、`apps/web-naive/src/api/hse/ai.ts` 均为 untracked；`server/services/aiService.js`、`index.vue`、`hse.ts` 为 tracked 修改（其中包含 AI-02/AI-03/AI-08 的未提交变更）。
- **AI-09 变更**：修改 9 个文件（§7 表格），新增 4 个脚本（`ai09_test_e2e/setup/cleanup/probe`）。
- 未执行 reset / checkout / clean；未删除任何其他未提交变更；未提交 commit（任务书未要求）。
- 生产链路（`server/.env`、5876 计划任务、生产库）零改动。

---

## 20. 未完成事项

1. **浏览器级 E2E**（Playwright/Tabbit 打开页面真实点击）未执行——无现成基础设施，按任务书 §21 以 API+源码断言替代。
2. **`clustering` 方向**：后端已支持（枚举/统计/焦点），前端暂未提供勾选（保持 AI-08 三选项），后续可按需开放。
3. **分析任务「重试」按钮**：后端无重试端点，未新增。
4. **`AI_TIMEOUT_MS=60000`（.env）与真实 Ollama 耗时不匹配**：验证环境已用 300000 覆盖；是否将 `.env` 默认值调大属于配置治理，交后续阶段/用户决定（生产 `.env` 禁止本阶段修改）。
5. 三违/风险/事故/评估等新领域接入：仅预留接口（§15 说明），未实施。

---

## 21. 风险

1. **[治理遗留] worker 超时配置**：`.env AI_TIMEOUT_MS=60000` 对 CPU qwen2.5:7b（约 60~125s/次）偏短；本阶段以进程级 `AI_TIMEOUT_MS=300000` 覆盖，配置项默认值待治理。
2. **aiService 双路由语义**：修复后 `options.provider` 优先于全局配置；缺省调用方行为不变，但后续新增调用方需注意不误传 provider。
3. **Ollama 冷启动/首token 延迟**：真实闭环含模型加载（首调约 125s）；worker 并发≤1 时排队叠加（AI-07 既有约束）。
4. **vue-tsc 60 处历史错误**：维持治理遗留，不随 AI-09 扩散。
5. **git 未提交面大**：AI-01～AI-08 与 Workbuddy 并行变更均未提交，后续提交时需按区域拆分，避免混入。

---

## 22. [需要用户确认]

**无**。权限修复依据明确（后端 AI-07 写权限 = admin/safety_manager → 菜单/路由放行同一角色，vben `filterTree` 语义已源码确认），未触及「无法从现有规则判断正确值」的情形。

---

## 23. 下一阶段建议

1. 将本报告与更新后的《AI智能分析实施进度.md》交 ChatGPT 审核。
2. 治理 `AI_TIMEOUT_MS` 配置默认值（对齐 AI-06 基线 300000）。
3. 若需开放：`clustering` 方向前端勾选、任务重试端点、浏览器级 E2E 基建。
4. 三违/风险/检查等领域接入：复用 `DOMAINS` 注册表逐域接入（先 inspection——表结构已注册，数据充足后启用）。
5. 不要自行开始 AI-10（自动报告/视觉识别/三违AI/风险预测）。

---

## 24. 最终状态

**完成（PASS——47/47 真实验证）**：`analysisTypes` 三方向真实生效（统计 focus + Prompt focusBlock + AI 输出侧重，八段协议兼容）→ `dataScope` 截断可见（COUNT+LIMIT，四字段随快照持久化，前端按真实 truncated 警告）→ 菜单 authority 与后端权限对齐（父级+子页放行 safety_manager，其余子页未扩大，vben 语义源码确认）→ 发现并修复 Ollama 路由既有缺陷（aiService 尊重 options.provider，缺省行为不变）→ 领域注册表即后续扩展最小接口 → 真实链路 47/47（Unit 15 + Integration 15 + Route 10 + Frontend 7，真实 Ollama qwen2.5:7b 闭环 COMPLETED、截断 2100→2000、AI unavailable 降级、权限四角色、非法参数）→ vue-tsc AI-09 新增 0 错误（历史 60 记遗留）→ 测试数据/临时用户已清理（残留 0）→ 零 migration 零业务写入、生产零触碰、Workbuddy 零冲突。AI 人机边界保持：AI 只分析/解释/建议，统计与溯源由系统完成，最终决策由 HSE 管理人员完成。
