# AI-06：HSE 结构化数据智能分析基础能力建设报告

> 执行方：Trae + DeepSeek V4 Flash
> 执行日期：2026-09-15
> 任务书：`# AI-06：HSE 结构化数据智能分析基础能力建设`
> 审核前置：AI-05 = PASS（ChatGPT 已审核）
> 状态：**PASS**（真实链路 39/39 全通过）

---

## 1. 执行摘要

AI-06 完成 HSE 结构化数据智能分析基础能力层建设，未重复建设 Ollama / Provider Registry / AI Gateway / RAG（完全继承 AI-02～AI-05 冻结基线）。

交付内容：

- **数据适配层**：`analysisDataAdapter`（领域注册表 + records 注入 / db 只读两种模式，不绑定单一业务表，不建万能分析表）。
- **归一化层**：`analysisNormalizer`（状态/日期/逾期/整改时长统一标准结构，字段缺失标记 NOT_AVAILABLE 不猜测）。
- **确定性统计层**：`analysisStatistics`（纯 JS 聚合，不经 AI：基础统计/时间趋势/TOP/重复问题/聚集分析/整改分析）。
- **Prompt 构建**：`analysisPromptBuilder`（数字必须来自统计层、AI 禁止自算、固定 JSON 输出、可能原因措辞、精炼约束）。
- **编排服务**：`analysisService`（读取 → 归一化 → 统计 → RAG 按需 → AI Gateway → Ollama → 结构化解析 fail-closed → Evidence → Generation Record）。
- **AI 分析**：`hse.data.analysis`（v1.0，DRAFT，内存注册，沿用 AI-05 模式），qwen2.5:7b 真实生成结构化 JSON（实测 74.4s，CPU）。
- **API**：`POST /api/hse/ai/v2/analyze/data`，两层能力：纯统计（Deterministic）与 AI 解释（AI Analysis），AI 不可用降级不 500。
- **RAG 按需**：`useRag=true` 时按统计主题词检索知识库制度依据（≤3 查询 × topK 2），失败静默降级。
- **Evidence 链**：`business_record`（统计数字来源）+ `knowledge_base`（RAG chunk 来源），落库 `ai_generation_records.evidence`（实测 recordId=8）。
- **数据域**：hazard（110 条真实数据，AI-06 主域）+ inspection（0 行，仅注册结构，records 注入可测）。
- **数据库**：零 migration、零新表（复用 `ai_generation_records`），生产库零改动。
- **测试**：**39/39 PASS**（Unit 22 + Integration 11 + Route 6），报告数字与脚本输出逐项对应（§13）。

核心链路（任务书 §31 PASS 判定）：

```text
数据源（records 注入 / db 只读）
    ↓ analysisDataAdapter
原始记录
    ↓ analysisNormalizer
标准记录
    ↓ analysisStatistics（确定性统计，不经过 AI）
统计 JSON
    ↓ analysisPromptBuilder + AI Gateway → Ollama/qwen2.5:7b
AI 结构化解释（JSON parse fail-closed）
    ↓ Evidence（business_record + knowledge_base）
返回 { statistics, ai, evidence, recordId } → 人工确认
```

---

## 2. AI-05 基线继承

| 基线项 | AI-05 冻结状态 | AI-06 状态 |
|---|---|---|
| Ollama | AVAILABLE | AVAILABLE（未重装未重下） |
| 主模型 | qwen2.5:7b (Q4_K_M, 7.6B) | 未覆盖未重新下载 |
| Grok | NOT_CONFIGURED | NOT_CONFIGURED（用于降级用例验证） |
| AI Provider Registry | 统一入口 | 复用，未建 provider2 |
| AI Gateway | 统一入口 | 复用，未建 gateway2 |
| RAG / Retriever / Embedding / Vector | AI-05 已建 | 复用，未建 ragGateway2 / embeddingProvider2 |
| v2 API | health/providers/models/generate/stream/analyze + knowledge/* | 复用并新增 `analyze/data`，其余原样 |
| ai_generation_records | AI-04/05 已建，record 落库 | 复用，未建 ai_hse_analysis_records / ai_data_analysis_records / ai_analysis_results2 |
| SSE 协议 | 原样 | 未改动 |
| 平行体系 | 禁止 provider2/gateway2/ragGateway2 | 未创建任何平行体系 |
| Route → Provider 直连 | 禁止 | 全部经 AI Gateway（axios/fetch → Ollama 直连不存在） |

Prompt 注册：`aiPromptRegistry` 新增 `hse.data.analysis`（version v1.0 / status DRAFT，内存注册，与 `hse.rag.answer` 同模式，未强行解决 AI-05 持久化遗留）。

---

## 3. 现有数据审计

任务书 §4 要求先审计再编码。数据库身份识别（任务书 §26）：

```text
当前数据库：safety_dashboard（开发库）
当前用户：hse_app
数据库版本：PostgreSQL 17.10
是否开发库：是（dev 验证，5881 端口）
是否生产库：否（生产 5876 / 生产库零读写）
```

### 3.1 隐患（hazards 表）

只读审计（`server/scripts/ai06_tables.cjs`）：

| 维度 | 审计结果 |
|---|---|
| 总记录数 | 110 条 |
| 真实/演示 | 110 真实（is_demo=false 全部），0 演示 |
| 状态分布 | 已完成 60 / null 50（无"待整改"状态值） |
| 来源 | daily_check × 110 |
| 时间范围 | 2026-02-16 ~ 2026-07-09 |
| 组织/分类/类型字段 | township / category / hazard_type distinct = 0（字段为空或不存在，adapter 以 COALESCE 兜底） |

字段情况（真实可读列）：`id` / `hazard_date` / `status` / `risk_level` / `responsible_dept` / `area` / `hazard_source` / `fix_date` / `deadline_date` / `verify_date` 等。adapter 使用主列 + Alt 回退（`category`/`hazard_type`、`township`/`area`、`fix_date`/`actual_rectify_date`、`deadline_date`/`deadline`）的 COALESCE 模式，容忍字段名差异。

### 3.2 巡检/检查（hse_inspection_tasks 表）

- 0 行记录（空集）。仅注册结构（字段映射：scheduled_date/status/department_id/completed_date），records 注入模式可完整测试（Route empty data 用例验证 `AI_EMPTY_DATA`）。

### 3.3 三违 / 考核 / 风险 / 事故

- **只读分析边界**：仅概念审计，未注册任何 domain，未读取业务数据、未修改任何三违/考核/风险/事故代码（`violationService.js` / `violationCheckerScope.js` / `violationController.js` / `routes/violations/*` / `ruleEngine/*` / `deductionWriter.js` / `sanweiBehaviorDict.js` / `sanweiLedgerDerive.js` / `gridViolationCandidateService.js` / `gridAttributionService.js` 等 Workbuddy 保护文件零触碰）。

---

## 4. 数据域选择理由

任务书 §7 允许优先选择 1～2 个最稳定、最容易验证的域：

| 域 | 数据情况 | 选择 |
|---|---|---|
| hazard（隐患） | 110 条真实记录，字段最完整（日期/状态/分类/等级/组织/区域/来源/期限/整改/核验） | **AI-06 主域** |
| inspection（检查/巡检） | 0 行真实记录 | 注册结构（records 注入可测，真实库返回空集） |
| violation（三违） | 受 Workbuddy 保护边界 + 生产数据敏感 | 不注册（任务书 §4 仅允许只读分析，本阶段不扩展以免触碰保护域） |
| assessment / risk / accident | 任务书 §7 不要求一次全部做完 | 不注册（后续阶段按任务书评估） |

理由：hazard 数据量最大、字段最完整、验证最直接；inspection 结构清晰可注入测试；其余域涉及生产敏感数据与并行保护边界，留待用户确认后按独立任务书扩展。

---

## 5. Adapter 设计

实现：`server/services/ai/analysis/analysisDataAdapter.js`。

- **领域注册表** `DOMAINS`：每域描述 db 模式（表名 + 字段映射），主列 + Alt 回退（COALESCE），不硬编码单一业务表。
- **两种数据来源**（同一标准结构输出）：
  1. `records` 注入：显式传入标准记录（人工构造测试数据 / 调用方自带数据），跳过 db。
  2. `db` 只读：真实业务表最小范围查询（`timeRange` 日期过滤 + `is_deleted=false` + `LIMIT` 上限），**仅 SELECT，脱敏，不写**。
- **上限**：`MAX_RECORDS = 2000`（防超大读取）。
- **错误**：统一 `AiError`（`../errors`）→ `AI_DOMAIN_NOT_SUPPORTED` / `AI_INVALID_TIME_RANGE` / `AI_DATA_READ_FAILED`。
- **万能分析表**：未创建任何 `ai_hse_data` 之类复制表；业务原始数据为唯一事实来源（任务书 §6）。

测试（E2E 真实运行）：无效 domain → `AI_DOMAIN_NOT_SUPPORTED` ✓ / timeRange 倒置 → `AI_INVALID_TIME_RANGE` ✓ / records 注入模式 ✓ / 真实 hazards 表 limit=5 最小只读 ✓ / inspection 表 0 行空集 ✓。

## 6. Statistics 设计

实现：`server/services/ai/analysis/analysisStatistics.js`（纯 JS 聚合，不经过 AI，任务书 §8/§10）。

- **基础统计**：total / issueCount / rectifiedCount / unrectifiedCount / rectificationRate / duplicateCount / overdueCount / overdueRate / avgRectifyDays。
- **时间趋势**：日 / 周 / 月三粒度（`trend.daily/weekly/monthly`），粒度自适应：total>60 → monthly，>20 → weekly，否则 daily。
- **TOP 高频**：topCategories / topSources / topOrgs / topAreas / topLevels（TOP_N=10，含 count + rectifiedCount）。
- **重复问题**：同「分类+组织」未整改 ≥2 归组（count + ids）。
- **聚集分析**：topTimePeriods / topTypes / topAreas 集中度 + `note: '聚集分析仅为统计描述，不等同于 AI 自动判定高风险'`（任务书 §9-4）。
- **整改分析**：整改率 / 逾期率 / 平均整改时间 / 未整改清单（**脱敏：无人员姓名**，仅 id/日期/分类/组织/期限/逾期天数）/ 重复整改问题。
- **limitations**：字段不足明确 `NOT_AVAILABLE`（分类/组织/等级/期限/整改日期/状态缺失逐项标注），绝不猜测（任务书 §9-5）。

实测（63 条虚拟数据）：total=63 / rectified=36 / unrectified=24 / rate=57.1 / dupCount=21 / groups=9 / months=7；边界日期（1/31→2/1 整改 1 天）✓；空数据 total=0 ✓。

## 7. AI Analysis 设计

实现：`server/services/ai/analysis/analysisPromptBuilder.js` + `analysisService.js` 的解析校验段。

- **严格 Prompt**（§10）：所有数字必须直接引用统计层；AI 只能解释统计结果、禁止自算/估算/编造；统计中没有的数字不得出现。
- **结构化输出**（§11）：固定 8 字段 `summary / key_findings / trend_analysis / anomalies / high_frequency_issues / possible_causes / management_suggestions / limitations`；输出必须为合法 JSON（禁止 markdown 代码块）。
- **fail-closed**：`parseStructuredOutput`（剥离 ```json 围栏 + 截取最外层 JSON 对象）→ `validateStructured`（必需字段 + 数组类型校验）；解析/校验失败抛 `AI_STRUCTURED_OUTPUT_INVALID`，**不把错误文本当成功结果**。
- **可能原因措辞**（§12）：Prompt 强制「可能原因/分析假设」措辞，禁止「确定原因就是」「责任人就是」「该员工违规」「应该扣分」等事实认定与责任指向。
- **精炼约束**：summary ≤60 字，数组元素 ≤40 字，数组 3～6 条（降低 7B 模型生成时长与 token 量）。
- **Prompt 注册**：`hse.data.analysis` v1.0 DRAFT（`aiPromptRegistry`），主指令经 `{custom_instructions}` 注入。
- **降级**（§18）：AI 不可用 → `statistics` 照常 + `ai.available=false` + code（`AI_PROVIDER_NOT_CONFIGURED` / `AI_PROVIDER_UNREACHABLE` / `AI_EMPTY_DATA`），不 500。

实测：`provider=ollama model=qwen2.5:7b durationMs=74352`，结构化输出字段齐全（summary/findings=4/causes=3），可能原因均为「可能…」措辞（无事实认定）。

## 8. RAG 使用情况

任务书 §13：RAG 是通用基础能力，不代替结构化数据分析。AI-06 采用**按需**方式：

```text
结构化统计 → AI 发现问题 → 需要制度依据？ → RAG 检索制度 → 补充制度依据
```

- `useRag=true` 时：`ragQueriesFromStats` 从统计结果提取主题词（topCategories + topSources + duplicates 分类，最多 3 个查询），`retriever.retrieve(q, { topK: 2 })`（embedding 走 Ollama / nomic-embed-text，复用 AI-05）。
- 检索结果去重后组装 `ragContext`（chunkId/title/section/content/score）注入 Prompt（引用标注 `[来源:文档标题]`）。
- 检索失败/不可用 → **静默降级**（ragContext=null），不阻断统计与 AI（实测 grok embedding 不可用 → available=false 场景正常降级）。

实测（E2E useRag=true）：`kbEvidence=4 totalEvidence=5`（1 条业务统计证据 + 4 条知识库证据），Evidence 链（Chunk→Document→Source 字段）完整。

## 9. Evidence 设计

任务书 §14：分析结论必须可追溯「数据从哪来」。

- **业务统计证据**（`business_record`）：`sourceId=domain` / `sourceDomain=domain` / `sourceField='statistics'` / evidenceText=统计摘要（记录总数、整改率、未整改数、逾期数、重复问题数）/ `strength='high'`。
- **知识库证据**（`knowledge_base`，仅 useRag 时）：`sourceId=chunkId` / `sourceField=文档标题·章节` / evidenceText=chunk 内容 / `strength='medium'`。
- **落库**：Evidence 数组随 Generation Record 持久化到 `ai_generation_records.evidence`（实测 `recordId=8 recordSaved=true`），未新建任何分析记录表。
- **可追溯性**：RAG 证据可继续上溯 `Analysis → Evidence → Knowledge Chunk → Document → Knowledge Source`；业务证据可回答「结论的数据来源」（domain + timeRange + filters + statistics）。

## 10. API

新增端点（路由 `server/routes/ai-v2.js` 复用 v2 前缀，控制器 `server/controllers/aiV2Controller.js` 新增 `analyzeData`）：

```text
POST /api/hse/ai/v2/analyze/data
```

请求示例：

```json
{
  "domain": "hazard",
  "timeRange": { "start": "2026-08-01", "end": "2026-08-31" },
  "filters": {},
  "records": [],
  "limit": 1000,
  "analysisTypes": ["trend", "frequency", "rectification"],
  "useRag": true,
  "provider": "ollama"
}
```

响应结构：

```json
{
  "success": true,
  "statistics": { "totalRecords": 63, "summary": {}, "trend": {}, "topCategories": [], "...": "" },
  "ai": { "available": true, "structured": true, "provider": "ollama", "model": "qwen2.5:7b", "durationMs": 74352, "analysis": { "summary": "", "key_findings": [], "...": [] } },
  "evidence": [ { "source_type": "business_record", "...": "" } ],
  "recordId": 8,
  "recordSaved": true
}
```

**双层能力**（任务书 §17）：

- A. **Deterministic Analysis**：`statistics`（不经过 AI，Ollama 不可用时依然完整返回）。
- B. **AI Analysis**：`ai`（统计结果 → Prompt → AI Gateway → Ollama → 结构化分析）。

**降级**（任务书 §18）：Ollama 不可用 → `{ statistics: {...}, ai: { available: false, code: "AI_PROVIDER_UNREACHABLE" } }`，统计结果仍可用，不 500。

**双轨制剥离**（任务书 §15）：请求中出现 `compliance_status / checked_by / checked_at / manual_remark` 一律忽略（不写入人工结果字段），实测带双轨制字段的请求 200 正常。

## 11. 权限

- 写端点 `requireRole('admin', 'safety_manager')`（与 v2 写端点 generate/stream/analyze 惯例一致），未修改认证/JWT/requireRole 核心。
- 全局 `authMiddleware` 强制认证：未认证 401（实测）。
- `userId` 取认证上下文 `req.user.id`，**不推断 employee_id**（AI-02 身份边界）。
- 错误统一走 `toErrorResponse`（AI-02 错误契约）：`AI_INVALID_REQUEST` / `AI_DOMAIN_NOT_SUPPORTED` 等带 retryable 标志。

## 12. 测试

E2E 脚本：`server/scripts/ai06_analysis_e2e_check.cjs`（5881 开发端口，进程级 `AI_PROVIDER=ollama` + `AI_TIMEOUT_MS=300000`，不改 `.env`、不改冻结代码）。

测试数据（任务书 §19）：**全部人工构造**——63 条虚拟隐患记录（60 条基础 + 3 条重复制造，覆盖 6 分类 / 4 组织 / 3 区域 / 3 等级 / 7 个月，60% 已完成 / 25% 待整改 / 10% 整改中 / 5% 空状态）。真实表仅 limit=5 最小只读结构验证（脱敏），未制作真实员工/WPS/三违/事故测试数据。

**Unit（22 项）**：normalizer 状态归一化（已完成/待整改/null）✓ 逾期判定 ✓ 整改时长 ✓ 非法日期 ✓；statistics 总数 ✓ 整改率 ✓ TOP 分类 ✓ 时间趋势 ✓ 重复问题 ✓ 降序 ✓ 聚集 note ✓ 空数据 ✓ 边界日期 ✓；structured parser（正常 JSON / ```json 围栏 / 非法 → AI_STRUCTURED_OUTPUT_INVALID / 字段非法）✓；adapter（无效 domain / timeRange 倒置 / records 注入）✓。

**Integration（11 项）**：真实 `analyzeData`（注入 63 条）统计层 total ✓ AI Gateway→Ollama 真实生成（qwen2.5:7b，74.4s）✓ 结构化输出字段齐全 ✓ 可能原因措辞 ✓ Evidence 业务统计依据 ✓ Generation Record 落库（recordId=8）✓；RAG useRag=true → knowledge_base evidence（4 条）✓ RAG Evidence 链 ✓；AI unavailable（grok）→ statistics 照常 + `AI_PROVIDER_NOT_CONFIGURED` ✓；真实 hazards 表 limit=5 只读 ✓ inspection 表 0 行空集 ✓。

**Route（6 项）**：401 未认证 ✓ 缺 domain → `AI_INVALID_REQUEST` ✓ invalid domain → `AI_DOMAIN_NOT_SUPPORTED` ✓ AI unavailable → 200 + statistics + ai.available=false ✓ 200 正常分析（双轨制字段剥离）✓ empty data → total=0 + `AI_EMPTY_DATA` ✓。

## 13. 测试真实数字

任务书 §24：报告数字必须与测试脚本实际输出逐项对应。最终输出文件：`server/ai06_out4.txt`：

```text
Suite Unit: 22 tests, 22 passed, 0 failed
Suite Integration: 11 tests, 11 passed, 0 failed
Suite Route: 6 tests, 6 passed, 0 failed

Total: 39
Passed: 39
Failed: 0
```

| 测试层 | 测试数 | 通过 | 失败 | 覆盖点 |
|---|---|---|---|---|
| Unit | 22 | 22 | 0 | normalizer ×6 / statistics ×9 / structured ×4 / adapter ×3 |
| Integration | 11 | 11 | 0 | analyzeData 统计+AI+Evidence+落库 ×6 / RAG ×2 / 降级 ×1 / 真实库只读 ×2 |
| Route | 6 | 6 | 0 | 401 / 缺domain / invalid domain / AI unavailable / 200 双轨制剥离 / empty data |
| **合计** | **39** | **39** | **0** | |

**报告数字 = 实际测试脚本数字**（39/39，无混加、无分类遗漏）。

调试过程记录（保留历史事实）：`ai06_out.txt`（早期 adapter 错误码未统一，code=null，AI 未生成）→ `ai06_out2.txt`（32/39：adapter 本地 AiError 未并入统一模型导致 Route 返回 `AI_INTERNAL_ERROR`）→ `ai06_route_test2.txt`（统一 `AiError` 后错误码映射修复：`AI_DOMAIN_NOT_SUPPORTED` / `AI_INVALID_REQUEST`）→ `ai06_out4.txt`（**39/39 最终 PASS**）。修复要点：`config/db` 相对路径、unitAdapter await、inspection 域 `source:null`、统计断言修正、`provider:'ollama'` + `AI_TIMEOUT_MS=300000`、Prompt 精炼约束、统一 AiError。

## 14. Git 前后状态

开始前 `git status` 已执行；完成后状态（未提交，按变更面归类）：

- **AI-06 新增**：
  - `server/services/ai/analysis/`（5 文件：analysisDataAdapter / analysisNormalizer / analysisStatistics / analysisPromptBuilder / analysisService）
  - `server/scripts/ai06_analysis_e2e_check.cjs`（E2E 39 项）、`server/scripts/ai06_tables.cjs`（数据只读审计）
  - `server/ai06_route_test.cjs`（路由错误码直接验证）及调试输出 `ai06_*.txt`（测试留痕）
- **AI-06 修改**：
  - `server/services/ai/aiPromptRegistry.js`（注册 `hse.data.analysis` v1.0 DRAFT）
  - `server/controllers/aiV2Controller.js`（新增 `analyzeData` 方法；该文件本身为 AI-03 未提交新增，AI-06 在其上增量）
  - `server/routes/ai-v2.js`（新增 `POST /analyze/data` 路由；同理 AI-03 未提交文件增量）
- **未执行**：`git reset` / `git checkout -- .` / `git clean`。
- **非 AI-06 变更**：Workbuddy 并行域大量 M 文件（violationController / ruleEngine / assessment* / gridAttribution / hse-tasks / hse-dashboard / regulations / training-ocr / violations / 前端 site·mobile 等）+ `docs/191副` 归档 + AI-02～AI-05 未提交文件，均未触碰。

## 15. Workbuddy 隔离检查

- **无冲突**。保护区域（WPS / grid* / wpsGrid* / violations / assessment* / risk / accident / hse-tasks / training-ocr / .workbuddy）零触碰。
- AI-06 对三违/考核/风险/事故仅做概念审计，未注册 domain、未读取、未写任何代码（任务书 §20）。
- 未发现需要修改 Workbuddy 正在使用文件的情况，无 `[需要用户确认]` 的强制项。

## 16. 风险

1. **真实隐患数据维度受限**：110 条真实记录中 50 条状态为 null，township/category/hazard_type 为空 → 真实库分析的组织/分类维度将标记 NOT_AVAILABLE（adapter COALESCE 兜底 + limitations 如实标注）。
2. **CPU 推理耗时**：qwen2.5:7b 生成完整 JSON 分析实测 ~74s/次（硬限制），交互体验偏慢，前端需考虑异步/轮询。
3. **AI_PROVIDER 进程级覆盖**：E2E 脚本进程级 `AI_PROVIDER=ollama`（不改 `.env`）；正式环境路由依赖 `.env` 配置（AI-04 遗留：生产 .env 未切换 Ollama）。
4. **hse.data.analysis 为 DRAFT**：未经真实业务语料验证，正式启用需按 DRAFT→测试→验证→ACTIVE 流程收敛。
5. **结构化输出稳定性**：依赖严格 Prompt + fail-closed，qwen2.5:7b 偶发格式偏差将返回 `AI_STRUCTURED_OUTPUT_INVALID`（已实测通过，非 100% 保证）。
6. **真实库读取保持最小化**：真实 hazards 仅 limit=5 结构验证，未对全量 110 条做完整分析（保持数据边界最小化）。
7. **生产库未启用 AI-06 能力**：无 migration、无新表、生产库零改动；生产启用需独立授权。
8. **ai_prompt_registry 持久化遗留**（AI-05 继承）：Prompt 仍在内存注册，重启依赖代码注册。

## 17. 未完成事项

1. violation / assessment / risk / accident 数据域未注册（任务书 §7 允许；violation 受 Workbuddy 保护边界，需用户确认后按独立任务书扩展）。
2. `analysisTypes` 目前为校验性支持（trend/frequency/rectification/clustering 枚举校验），统计层为全量计算（未按类型裁剪输出）——类型参数保留扩展位。
3. 前端 AI 分析页面未开发（任务书 §25 禁止）。
4. 组织维度统计受真实数据组织字段为空限制（NOT_AVAILABLE 标记）。
5. 正式业务化能力未做：定时分析、报告导出、分析结果订阅/推送。
6. Prompt `hse.data.analysis` 转 ACTIVE 流程未做。

## 18. [需要用户确认]

1. **生产库启用 AI-06 能力**：`/api/hse/ai/v2/analyze/data` 已在开发环境验证；生产启用需独立授权（含 .env AI_PROVIDER 决策）。
2. **hse.data.analysis DRAFT→ACTIVE**：是否用真实（脱敏）业务数据做一轮验证后转 ACTIVE。
3. **生产 .env AI_PROVIDER 切换**（AI-04/05 遗留）：是否切换为 ollama（prod-boundary 禁止 AI 修改 .env，需显式授权）。
4. **扩展数据域（如三违只读分析）**：AI-07 是否注册三违只读域——需用户确认 Workbuddy 保护边界允许只读 Adapter。
5. **AI-05 测试统计口径差异**：AI-05 报告"57/57"与分类明细合计 51 项存在口径差异，本阶段未返工，待后续审计/查看原始测试脚本时核对（任务书 §30）。

## 19. AI-07 建议

- **AI-07 HSE 智能分析页面/服务化**：基于 v2 `analyze/data` + RAG 能力，建设正式 AI 分析页面与定时分析（注意任务书边界：RAG/分析为基础能力，业务 AI 判定需人工确认闭环）。
- 前置建议：
  1. 确认 §18 中 1/2/4（生产启用、Prompt ACTIVE、数据域扩展）。
  2. 用真实脱敏数据验证 `hse.data.analysis` 输出质量与耗时，评估是否需要异步分析任务。
  3. 评估真实隐患数据组织/分类字段补齐后组织维度统计的价值。
- **必须等待 ChatGPT 审核本报告与进度文件后，生成 AI-07 唯一正式提示词，不得自行开始。**

---

## AI-06 最终状态

```text
AI-06 状态：PASS

真实数据 Adapter：PASS（hazards 110 条可读，领域注册表 + records 注入 / db 只读双模式，无万能分析表）
确定性统计：PASS（纯 JS 聚合，基础/趋势/TOP/重复/聚集/整改，字段不足 NOT_AVAILABLE 不猜测）
AI Gateway：PASS（复用，未建 gateway2；全部生成经统一 Gateway）
Ollama：PASS（qwen2.5:7b 真实生成，未重装未重下）
AI 分析：PASS（结构化 JSON 8 字段，fail-closed，AI_STRUCTURED_OUTPUT_INVALID 明确）
可能原因措辞：PASS（仅可能原因/分析假设，无事实认定与责任指向）
RAG 按需：PASS（useRag=true 检索制度依据 ≤3×topK2，失败静默降级，不代替结构化分析）
Evidence：PASS（business_record + knowledge_base，Analysis→Evidence→Chunk→Document→Source 可追溯）
Generation Record：PERSISTED（复用 ai_generation_records，recordId=8 实测，未建重复表）
AI unavailable 降级：PASS（statistics 照常 + ai.available=false + code，不 500）
统计数字来源：PASS（数字全部来自统计层，AI 禁止自算）
AI 不写人工字段：PASS（双轨制字段剥离，compliance_status/manual_remark/checked_by/checked_at 忽略）
API：PASS（POST /api/hse/ai/v2/analyze/data，双层能力，401/400/200/AI unavailable/empty data/invalid domain 全覆盖）
数据库：零 migration、零新表（开发库 safety_dashboard，生产库零改动）
测试：PASS（39/39 真实运行：Unit 22 + Integration 11 + Route 6，报告数字与脚本逐项对应）
Workbuddy：无冲突（WPS/grid*/violations/assessment*/risk/accident 并行域零触碰）

[需要用户确认]：
1. 生产库启用 AI-06 能力（独立授权）
2. hse.data.analysis DRAFT→ACTIVE 验证流程
3. 生产 .env AI_PROVIDER 切换（AI-04/05 遗留）
4. 扩展数据域（三违只读等）需边界确认
5. AI-05 测试统计口径差异后续核对

遗留问题：
1. violation/assessment/risk/accident 域未注册（受保护边界/任务书范围）
2. analysisTypes 为校验性支持（统计层全量计算）
3. 前端分析页面未开发（任务书禁止）
4. 组织维度统计受真实数据字段为空限制
5. 正式业务化（定时分析/报告导出）未做
6. ai_prompt_registry 持久化遗留（AI-05 继承）
7. 生产 .env 未切换 Ollama（AI-04 遗留）

下一阶段：AI-07（等待 ChatGPT 审核后生成唯一正式提示词）
```
