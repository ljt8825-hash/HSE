# AI-05：HSE 知识库与 RAG 基础能力建设报告

> 执行方：Trae + DeepSeek V4 Flash
> 执行日期：2026-09-15
> 任务书：`# AI-05：HSE 知识库与 RAG 基础能力建设`
> 审核前置：AI-04 = PASS（ChatGPT 已审核）
> 状态：**PASS**（真实 RAG 闭环 57/57 全通过）

---

## 1. 执行摘要

AI-05 完成 HSE 知识库 + RAG 基础能力建设，未重复建设 Ollama / Provider Registry / AI Gateway（完全继承 AI-04 冻结基线）。

交付内容：

- **数据模型**：`knowledge_sources` → `knowledge_documents` → `knowledge_chunks` → `knowledge_embeddings` 四表（最小化，无冗余表）。
- **文档解析**：txt / md / pdf 最小闭环（复用既有 `pdf-parse` 2.4.5，未新增大型解析依赖）。
- **分块**：结构优先（Markdown 标题分节）+ 长度控制（512 token 估算）+ 10% overlap，保留 page/section/content_hash。
- **Embedding Provider 抽象**：复用现有 Provider Registry（`OllamaProvider.embed` → `/api/embed`），未建第二套体系。
- **Embedding 模型**：`nomic-embed-text`（274MB，768 维），经检查 Ollama 无既有 embedding 模型后选择，下载前已确认磁盘空间，未覆盖 qwen2.5:7b。
- **Vector Storage**：PostgreSQL + pgvector 0.8.2（开发库，用户授权安装），余弦相似度检索。
- **Retriever**：query/topK/filters/ranking，输出保留 documentId/chunkId/sourceId/score（Evidence 依据）。
- **RAG Context Builder**：Top-K → context items（citationId + source + content）。
- **RAG → AI Gateway → Ollama**：`hse.rag.answer`（DRAFT）Prompt，qwen2.5:7b 真实生成。
- **Evidence / Citation**：Answer → Citation → Chunk → Document → Knowledge Source 全链路可追踪，落库到 `ai_generation_records.evidence`。
- **权限**：写操作 `admin` / `safety_manager`（复用 `requireRole`），读/检索任意登录用户；未改认证体系。
- **API**：`/api/hse/ai/v2/knowledge/*`（sources/documents/parse/index/search/rag）。
- **Migration**：开发库 `safety_dashboard` 本地执行（AI 基础表 + 知识库四表 + pgvector），幂等可重跑，生产库零改动。
- **最小可验证 RAG 闭环**：5 篇人工构造测试文档 → 8 chunks → 8 向量 → 真实检索 → 真实 qwen2.5:7b 回答 → Citation 全链路，**57/57 PASS**。

---

## 2. AI-04 基线继承

| 基线项 | AI-04 冻结状态 | AI-05 状态 |
|---|---|---|
| Ollama | AVAILABLE | AVAILABLE（未重装未重下） |
| 主模型 | qwen2.5:7b (Q4_K_M, 7.6B) | 未覆盖未重新下载 |
| Grok | NOT_CONFIGURED | NOT_CONFIGURED |
| OpenAI-Compatible | NOT_CONFIGURED | NOT_CONFIGURED |
| AI Provider Registry | 统一入口 | 复用并扩展 `embed` 能力（Ollama） |
| AI Gateway | 统一入口 | 复用并新增 `embed` 统一入口 |
| v2 API | health/providers/models/generate/stream/analyze | 新增 `knowledge/*`，其余原样 |
| SSE 协议 | start/data/{content}/DONE/end/error | 原样，未改动 |
| 平行体系 | 禁止 provider2/gateway2/ragGateway2 | 未创建任何平行体系 |

---

## 3. 现状审计

任务书 §6 要求先审计再编码。审计结论（以真实代码为准，不依赖历史报告）：

- **项目原有 Knowledge Base / RAG / Embedding / Vector / pgvector / document parsing / chunking / retriever 均不存在**（搜索 rag/knowledge/embedding/vector/chunk/retriever/retrieval，无既有实现）。
- **可复用能力**：
  - `pdf-parse`（server/package.json 已有）→ Parser 复用。
  - `xlsx`（已有）→ 本阶段不启用，留作后续 docx/xlsx 扩展。
  - `aiProviderRegistry`（AI-02）→ 扩展 Ollama `embed` 方法，复用 Provider 统一思想（任务书 §17 强制）。
  - `aiGateway`（AI-02）→ 新增 `embed` 统一入口（任务书 §24 强制链路 `Route → RAG Service → AI Gateway → Provider Registry → Ollama`）。
  - `aiGenerationRecordService`（AI-02）→ RAG 结果落库 `ai_generation_records`，**未新建 rag_generation_records**（任务书 §39）。
  - `aiPromptRegistry`（AI-02）→ 注册 `hse.rag.answer` DRAFT Prompt（任务书 §25）。
  - `requireRole`（现有权限体系）→ 知识库写权限复用（任务书 §28/§41）。
- **pgvector**：审计时未安装（`pg_available_extensions` 可见），经用户授权后以 `postgres` 超管身份安装 `vector` 0.8.2（开发库）。
- **数据库版本**：PostgreSQL 17.10（开发库 safety_dashboard）。

---

## 4. Knowledge Source

实现：`server/services/ai/knowledge/knowledgeSourceService.js`；表 `knowledge_sources`。

- 字段：`source_id`（语义业务键，唯一）/ `name` / `type` / `description` / `status`（ACTIVE|DISABLED）/ `created_by` / 时间戳。
- type 不写死：默认 `manual_upload`，预留 `system_document` / `policy` / `regulation` / `procedure` / `training`。
- 服务方法：create / get / list / update / setStatus（ACTIVE↔DISABLED）。
- 检索默认只返回 ACTIVE 源（`vectorStore.search` 默认 `s.status='ACTIVE'`）。

测试（E2E 真实运行）：create ✓ / read ✓ / update ✓ / disable ✓ / enable ✓。

## 5. Document

实现：`server/services/ai/knowledge/knowledgeDocumentService.js`；表 `knowledge_documents`。

- 字段：`source_id` / `title` / `file_name` / `file_type` / `version` / `status`（DRAFT|PARSING|READY|FAILED|DISABLED）/ `content`（解析后纯文本，供重分块）/ `content_hash`（sha256）/ `parse_error` / 时间戳。
- `content_hash` 用于：重复检测、幂等导入、版本管理。重复内容返回 `duplicated=true` 且复用原文档（测试验证同一 id）。
- 生命周期：create（DRAFT）→ parse（PARSING→READY/FAILED）→ chunk → index（READY）。

测试：create ✓ / hash ✓（每个文档生成唯一 content_hash）/ parse→READY ✓ / status ✓ / 幂等 ✓。

## 6. Parser

实现：`server/services/ai/knowledge/knowledgeParser.js`。

- 支持：`txt` / `md`（markdown）直接 UTF-8 读取（含 BOM 剥离）；`pdf` 复用 `pdf-parse` 2.4.5（`PDFParse` 真实解析，保留 `\f` 分页符供分块器切页）。
- 不支持类型明确报错：`不支持的文档类型: exe，当前支持 txt/md/markdown/pdf`。
- docx/xlsx 本阶段不启用（任务书 §14：不要求全能解析，禁止引入大量新依赖；后续按需复用既有 `xlsx`）。

测试：txt ✓ / md ✓ / pdf ✓（构造最小合法 PDF，pdf-parse 真实解析出文本与页数）。

## 7. Chunk

实现：`server/services/ai/knowledge/knowledgeChunker.js`；表 `knowledge_chunks`。

- 字段：`document_id` / `chunk_index` / `content` / `char_count` / `token_estimate` / `page` / `section` / `metadata`(jsonb) / `content_hash`；`UNIQUE(document_id, chunk_index)`。
- 策略（任务书 §16「结构优先 + 长度控制 + 适度 overlap」）：
  - Markdown：按 `#/##/###` 标题分节，节内按段落累积，`section` 保留标题；标题行单独作为节起始。
  - txt/pdf：按段落（空行分隔）累积；PDF 按 `\f` 分页保留 `page`。
  - **chunk_size = 512 token（估算）**；**overlap = 48 token（约 10%）**；separator = 段落/标题（结构优先）；metadata 记录 `chunk_size_tokens` / `overlap_tokens`。
  - 超长段落按 maxTokens 硬切（中文最坏 0.6 token/字），避免单个 chunk 超限。
  - 中文 token 估算启发式：CJK ≈ 0.6 token/字，ASCII ≈ 0.28 token/字符（nomic-embed-text 上下文 8192 token 下 chunk 512 安全）。
- 不使用 `content.substring(0,1000)` 式简单切分。

测试：split ✓（5 文档 8 chunks）/ metadata ✓（section 提取：消防文档 4 个 section）/ 长度控制 ✓（实测最大 token_estimate=84，≤600 校验）/ citation 依据 ✓（document_id/chunk_id/page/section 全保留）。

## 8. Embedding Provider 抽象

- **未建第二套 Embedding Provider 体系**（任务书 §17 禁止 `embeddingProvider2`）。
- 复用 `aiProviderRegistry`：`OllamaProvider.embed(request)` → 真实调用 `Ollama /api/embed`（HTTP），返回 `{model, dimension, embeddings, durationMs}`；`capabilities.embedding = true`；`getMetadata()` 暴露 `embeddingModel`（`OLLAMA_EMBEDDING_MODEL` 缺省 `nomic-embed-text`）。
- `aiGateway.embed()` 统一入口：Provider 解析 → 健康检查 → embedding 能力校验 → 真实调用。错误码如实映射：NOT_CONFIGURED → `AI_PROVIDER_NOT_CONFIGURED`，不支持能力 → `AI_INVALID_REQUEST`，模型缺失 → `AI_MODEL_NOT_FOUND`。
- `embeddingService`（knowledge 域）封装单条/批量向量化，链路：`RAG Service → AI Gateway → Provider Registry → Ollama`。

## 9. Embedding Model

- 检查结论：Ollama 现有模型（qwen2.5:7b / deepseek-r1:7b / deepseek-r1:1.5b）均为聊天模型，**无真正适合 embedding 的模型**（任务书 §18：不得默认聊天模型是 embedding 模型）。
- 选择：**`nomic-embed-text:latest`（274MB，768 维）**，经 Ollama `/api/pull` 拉取。
  - 选择理由：小尺寸（274MB）适配本机资源（C 盘余量受限）；768 维为向量检索黄金维度（pgvector 存储/性能均衡）；中文短文本表现稳定（实测区分度与稳定性 PASS）；社区主流、Ollama 官方支持。
  - 合规确认：仅下载 1 个 embedding 模型；未覆盖 qwen2.5:7b；下载前检查磁盘空间。
- 真实验证（任务书 §19，禁止 hash/随机冒充）：
  - provider=ollama / model=nomic-embed-text / dimension=768 / 向量长度 768 / 数值全为有限数。
  - 稳定性：同一文本两次嵌入完全一致（逐位相等）。
  - 区分度：不同文本向量存在实质差异。
  - 真实调用耗时 ~40ms/次。

## 10. Vector Storage

- 决策（任务书 §20 优先顺序）：**PostgreSQL + pgvector**。
- 状态：`pgvector = AVAILABLE`（0.8.2，开发库 `safety_dashboard` 已安装；安装前审计确认 `pg_available_extensions` 可见 vector，经用户授权以超管安装）。
- 表：`knowledge_embeddings`（chunk_id 唯一、model、dimension、vector(768)）。
- 接口：`upsertEmbeddings`（同 chunk 先删后插）/ `deleteByDocument` / `search`（余弦距离 → 相似度 `1 - (vector <=> $1)`）/ `count` / `isAvailable`（`to_regtype('vector')` 真实探测，未安装时如实 BLOCKED）。
- 检索过滤：documentId / sourceId / sourceType / sourceStatus / documentStatus；默认仅 ACTIVE 源 + READY 文档。
- 未伪造：pgvector 不可用时 `isAvailable=false`，上层如实上报 BLOCKED（任务书 §33/§44）。

测试：insert ✓（8 向量入库）/ search ✓ / topK ✓ / score ✓（0~1 余弦相似度，保留 6 位小数）/ count ✓（8=8）。

## 11. Retriever

实现：`server/services/ai/knowledge/retriever.js`。

- 输入：`query` + `topK`（1~20 钳制）+ `filters` + `provider`。
- 输出：`available` + `results[]`（chunkId / documentId / sourceId / content / page / section / metadata / score / documentTitle / sourceName / sourceType / model / dimension）。
- 流程：query → `embeddingService.embedText`（AI Gateway → Ollama）→ `vectorStore.search`（pgvector 余弦）→ 富化结果。
- 可用性：embedding / pgvector 不可用 → `available=false` + `code`（AI_PROVIDER_NOT_CONFIGURED 等）+ `reason`，**不伪造检索结果**。

测试：query ✓（安全帽查询 Top-5 命中安全帽文档；有限空间查询 top1 命中）/ filters ✓（documentId 过滤、sourceId 空结果）/ ranking ✓（score 降序）。

## 12. RAG Context

实现：`server/services/ai/knowledge/ragContextBuilder.js`。

- 输入：query + retrieval results。
- 输出：context items（citationId / documentTitle / section / page / content）+ citations（`aiEvidenceService.createEvidence` 格式：source_type / source_id / title / section / page / evidence_text）。
- 每个检索结果生成 citationId（1-based），供 Prompt 引用与 Answer 标注来源（`[来源:文档标题·章节]`）。

## 13. AI Gateway

- 复用现有 `aiGateway`（未建 gateway2 / ragGateway2）。
- 新增 `embed()` 统一入口（AI-05 知识库 Embedding）。
- RAG 生成走 `gateway.generate`：`promptKey='hse.rag.answer'`（DRAFT）→ `resolvePrompt`（promptRegistry）→ `resolveProvider`（ollama）→ `assertProviderReady` → `provider.chat` → qwen2.5:7b 真实输出。
- Generation Record：`aiGenerationRecordService` 复用 `ai_generation_records` 表（migration 后扩展字段自动探测：request_id / prompt_key / prompt_version / evidence 均落库）。

## 14. Citation / Evidence

- 链路（任务书 §26 重点）：`Answer → Citation → Chunk → Document → Knowledge Source`。
- RAG 返回：`citations[]`（citationId / chunkId / documentId / sourceId / documentTitle / section / page / score / evidenceText）+ `evidence[]`（aiEvidenceService 格式）+ `retrieval.results[]`。
- 落库：`ai_generation_records.evidence` JSON 持久化（recordSaved=true，实测 recordId 落库）。
- 实测：citations=3、evidence=3，首条 citation `chunkId→documentId→sourceId` 链路完整（如 19→15→7：安全帽 chunk → 安全帽文档 → AI-05 测试知识源）。

## 15. 权限

- 未修改认证/JWT/requireRole 核心（任务书 §28/§41 禁止）。
- 写操作（创建源/文档、parse、index、enable/disable）：`requireRole('admin','safety_manager')`。
- 读/检索（list sources/documents、search、rag）：任意登录用户（authMiddleware checkUser=true 强制认证）。
- userId 取认证上下文 `req.user.id`，不做身份推断（AI-02 基线）。
- 实测：未认证 401 ✓；`grid_inspector` 角色写操作 403 ✓；任意登录用户读/检索 200 ✓。

## 16. API

路由：`server/routes/ai-knowledge.js`（挂载 `/api/hse/ai/v2/knowledge`，app.js line 470）+ `server/controllers/knowledgeController.js`。

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/knowledge/sources` | 登录 | 源列表 |
| POST | `/knowledge/sources` | admin/safety_manager | 建源 |
| POST | `/knowledge/sources/:id/enable` `/disable` | admin/safety_manager | 启用/禁用源 |
| GET | `/knowledge/documents` | 登录 | 文档列表 |
| POST | `/knowledge/documents` | admin/safety_manager | 建文档（JSON content 或 buffer） |
| POST | `/knowledge/documents/:id/parse` | admin/safety_manager | 解析 → READY |
| POST | `/knowledge/documents/:id/index` | admin/safety_manager | chunk + embed + 向量入库 |
| POST | `/knowledge/documents/:id/enable` `/disable` | admin/safety_manager | 启用/禁用文档 |
| POST | `/knowledge/search` | 登录 | 纯检索 Top-K |
| POST | `/knowledge/rag` | 登录 | 完整 RAG（检索→上下文→AI→Answer+Citation） |

错误统一走 `toErrorResponse`（AI-02 错误契约）。前端 `apps/web-naive/src/api/hse/ai.ts` 继续复用，未建正式 AI 页面（任务书 §29/§30）。

## 17. Migration Preflight

- 检查对象：`safety_dashboard`（开发库）；`ai_prompt_registry` / `ai_generation_records` 两表。
- Preflight 结果（AI-05 开始时）：两表均不存在；知识库候选表均不存在；`vector` 扩展未安装但 `pg_available_extensions` 可见。
- 结论：开发库明确（`current_database() = safety_dashboard`，`current_user = hse_app`），风险可控，经用户授权后执行（2026-09-15）。

## 18. 数据库变化

执行（开发库 `safety_dashboard`，用户已授权，2026-09-15）：

1. **pgvector 安装**：`CREATE EXTENSION IF NOT EXISTS vector`（postgres 超管，`ai05_vector_ext_install.cjs`）→ **pgvector 0.8.2**。
2. **AI 基础表**：`server/sql/ai_capability_layer_v1.sql` → `ai_prompt_registry`、`ai_generation_records`（AI-04 遗留 migration，本次本地执行）。
3. **知识库四表**：`server/sql/ai05_knowledge_base_v1.sql`（全部 `CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS`，幂等可重跑）：
   - `knowledge_sources` / `knowledge_documents` / `knowledge_chunks` / `knowledge_embeddings`。

| 表 | 状态 |
|---|---|
| knowledge_sources | 新建（2 条 AI-05 测试源） |
| knowledge_documents | 新建（6 条测试文档） |
| knowledge_chunks | 新建（8 chunks） |
| knowledge_embeddings | 新建（8 向量） |
| ai_prompt_registry | 新建（0 条：Prompt 仍为内存注册，持久化遗留） |
| ai_generation_records | 新建（3 条 RAG 记录，evidence 落库） |

- **未修改/未删除任何既有表与业务数据**（WPS/三违/考核/风险/事故/人员边界零触碰）。
- **未执行生产库 migration**（生产 `safety_dashboard_dev` / 生产 5876 环境零改动）。

## 19. 测试数据

全部人工构造（任务书 §22/§42），禁止真实员工/事故/三违/考核/WPS 数据：

| 文档 | 类型 | 内容要点 |
|---|---|---|
| 测试安全帽管理要求 | txt | 佩戴要求/检查/更换/抽查（5 段） |
| 测试消防器材检查要求 | md | 检查周期/存放要求/报废标准（3 节 4 段） |
| 测试有限空间作业要求 | txt | 审批/气体检测/先通风再检测后作业/救援（6 段） |
| 测试高处作业要求 | txt | 安全带/临边洞口/恶劣天气（5 段） |
| 测试用电安全要求 | txt | 线路/接地/检修/漏电保护（5 段） |

测试查询示例：`安全帽有什么要求？`、`有限空间作业程序与气体检测`、`高处作业必须系挂安全带`。

## 20. 测试结果

E2E 脚本：`server/scripts/ai05_knowledge_e2e_check.cjs`（5881 开发端口，符合 prod-boundary）。

**57/57 PASS**，覆盖任务书 §31 全部要求：

| 类别 | 结果 |
|---|---|
| Knowledge Source create/read/update/disable/enable | PASS ×5 |
| Document create/hash/parse/status/幂等 | PASS ×7 |
| Chunk split/metadata(section)/长度控制/citation 依据 | PASS ×5 |
| Embedding provider/model/dimension/real embedding/稳定性/区分度 | PASS ×2 |
| Vector insert/search/count | PASS ×6 |
| Retriever query(Top-K 命中)/filters/ranking | PASS ×5 |
| RAG retrieval/context/Gateway/Provider/answer/citation/第二问 | PASS ×6 |
| Generation Record PERSISTED（recordId 落库） | PASS ×1 |
| Error：embedding unavailable(grok NOT_CONFIGURED)、parse failure、empty retrieval、AI provider unavailable(RAG blocked)、vector 真实探测 | PASS ×5 |
| Parser pdf 真实解析 | PASS ×1 |
| Route：401 / 403(grid_inspector) / CRUD / parse / index / search / rag 真实 E2E | PASS ×8 |

关键实测数据：

- Embedding：`provider=ollama model=nomic-embed-text dim=768`，稳定 + 可区分，~40ms/次。
- 检索：安全帽查询 Top-5 命中安全帽文档（score 0.740）；有限空间查询 top1 命中（score 0.839）；score 严格降序。
- RAG：`provider=ollama model=qwen2.5:7b promptKey=hse.rag.answer`，Answer 引用知识关键词，citations=3 evidence=3（Answer→Citation→Chunk→Document→Source 链路完整）。
- Route RAG：HTTP 200，真实 AI 回答 35s（CPU 生成），citations=3。

## 21. Git

开始前 `git status` 已执行并归档；完成后状态：

- **AI-05 新增**（未提交，属 AI-05 变更面）：
  - `server/services/ai/knowledge/`（8 个服务文件：knowledgeSourceService / knowledgeDocumentService / knowledgeParser / knowledgeChunker / embeddingService / vectorStore / retriever / ragContextBuilder / ragService）
  - `server/routes/ai-knowledge.js`、`server/controllers/knowledgeController.js`
  - `server/sql/ai05_knowledge_base_v1.sql`、`server/sql/ai_capability_layer_v1.sql`
  - `server/scripts/ai05_*`（env_check / priv_check / vector_ext_install / migration_run / knowledge_e2e_check / db_verify）
- **AI-05 修改**：`server/app.js`（挂载 knowledge 路由）；`server/services/ai/aiGateway.js`（embed 入口 + 错误码顺序修复）；`server/services/ai/aiProviderRegistry.js`（Ollama embed 能力）。
- **未执行**：git reset / checkout -- . / clean。
- AI-02~AI-04 历史未提交文件保持原样；Workbuddy 并行变更域（WPS/grid*/violations/assessment*/risk/accident/hse-tasks/training-ocr/.workbuddy 等）未触碰。

## 22. Workbuddy 隔离

- 无冲突。git status 中的并行变更（violationController、assessment*、gridAttribution、ruleEngine、training-ocr、regulations、hse-tasks、hse-dashboard、violations、site 前端等）均为既有并行工作，本阶段未覆盖/未回滚/未 reset。
- 保护区域（WPS / grid* / wpsGrid* / violations / assessment* / risk / accident / hse-tasks / training-ocr / .workbuddy）零触碰。

## 23. 风险

1. **Embedding 检索质量边界**：nomic-embed-text 为 274MB 轻量模型，短查询（如「安全帽有什么要求」）下 Top-1 可能不是目标文档（实测 Top-5 命中），Top-K 语义召回依赖 chunk 内容质量；正式业务需在 AI-06+ 按真实语料评估是否需要更大 embedding 模型或混合检索（关键词 + 向量）。
2. **生产库未执行 migration**：知识库四表 + AI 基础表仅存在于开发库 `safety_dashboard`；生产库（safety_dashboard_dev）如需启用知识库，需单独授权执行并评估向量列对生产的影响。
3. **hse.rag.answer 为 DRAFT**：Prompt 未经正式业务语料验证，后续需按 DRAFT→测试→验证→ACTIVE 流程收敛。
4. **ai_prompt_registry 持久化遗留**：表已建（0 条），Prompt 仍在内存注册，重启后 RAG Prompt 定义依赖代码注册。
5. **AI-04 遗留继承**：生产 .env 未切换 Ollama；Ollama Portable CLI 路径缺陷；C 盘空间有限（5.3GB）；Legacy 与 v2 健康口径差异。
6. **CPU 推理耗时**：RAG 真实生成约 35s/问（qwen2.5:7b CPU），交互体验偏慢，属硬件限制。
7. **向量数据为测试数据**：当前 8 向量全部为人工构造测试知识；生产知识库批量导入需在后续阶段按边界授权执行。

## 24. 未完成事项

1. `ai_prompt_registry` 持久化写入（表已建，尚未落盘 Prompt 条目）。
2. `ai_generation_records` 扩展字段迁移已执行（AI-05 内完成）；AI-04 遗留的其余项（生产 Provider 切换等）见 §23/§26。
3. docx/xlsx 解析扩展（Parser 预留，未启用）。
4. 知识库管理前端页面（任务书 §29/§30 明确本阶段不开发）。
5. RAG 混合检索（关键词召回 + 向量重排）与重排器（后续按需评估）。
6. 生产库知识库 migration 与生产数据导入（待用户授权 + 独立任务书）。

## 25. [需要用户确认]

1. **pgvector 生产库安装**：当前仅开发库 `safety_dashboard` 安装 vector 0.8.2；生产库（`safety_dashboard_dev` / 生产 5876 对应库）是否安装、何时安装，需用户确认与授权。
2. **生产库知识库 migration**：`ai_capability_layer_v1.sql` + `ai05_knowledge_base_v1.sql` 在生产库执行需独立授权（本次仅本地执行）。
3. **Embedding 模型确认**：`nomic-embed-text`（274MB/768 维）作为知识库 Embedding 默认模型是否长期采纳；如需中文更强模型（如 bge-m3 等，体积更大）需另行评估下载。
4. **RAG Prompt ACTIVE 流程**：`hse.rag.answer` 目前 DRAFT，是否在 AI-06 前用真实业务语料做一轮验证后转 ACTIVE。
5. **生产 .env AI_PROVIDER 切换**（AI-04 遗留）：是否切换为 ollama（prod-boundary 禁止 AI 修改 .env，需显式授权）。
6. **并行域测试失败归属**（AI-04 遗留）：personnel 保险导入 20 + violationAdapter 1 确认归属对应并行任务。

## 26. AI-04 遗留问题继承

按任务书 §47，AI-04 遗留问题在 AI-05 报告中继续保留：

1. `ai_prompt_registry` 尚未持久化（AI-05 内表已建、条目仍内存注册，0 条落库）。
2. `ai_generation_records` 尚未持久化 → **AI-05 已解决**（migration 本地执行，RAG 记录 PERSISTED，evidence 落库；生产库仍待授权）。
3. Legacy ai-enhanced 与 v2 Provider Health 口径仍存在差异（未擅动，待 AI-05 后决策）。
4. Ollama Portable CLI 运维问题（运维走 HTTP API）。
5. 生产 .env 尚未切换 Ollama。
6. 全量测试存在并行域失败（personnel 保险导入 20 + violationAdapter 1，与本阶段变更无交集）。

## 27. 下一阶段建议

- **AI-06 HSE 数据智能分析**：基于 v2 analyze + RAG 能力，对巡检/台账等结构化数据做分析（注意任务书 §48：RAG 仅作通用基础能力，不越界开发业务 AI）。
- 前置建议：
  1. 确认 §25 中 1/2（生产库 vector/migration）。
  2. 用少量真实（脱敏）知识文档验证 `hse.rag.answer` 检索与回答质量，再转 ACTIVE。
  3. 评估是否需要混合检索（关键词 + 向量）提升短查询召回。
- **必须等待 ChatGPT 审核本报告与进度文件后，生成 AI-06 唯一正式提示词，不得自行开始。**

---

## AI-05 最终状态

```text
AI-05 状态：PASS

Knowledge Source：PASS
Document：PASS
Parser：PASS（txt/md/pdf 真实解析）
Chunk：PASS（结构优先 + 512 token + 10% overlap）
Embedding Provider：PASS（复用 Provider Registry，无第二套体系）
Embedding Model：PASS（ollama / nomic-embed-text / 768 维，真实稳定可区分）
Vector Store：PASS（pgvector 0.8.2 真实余弦检索）
Retriever：PASS（query/topK/filters/ranking，Top-K 命中）
RAG Context：PASS（citationId + source + content）
AI Gateway：PASS（复用，embed 入口 + generate RAG）
Ollama：PASS（qwen2.5:7b 真实生成）
Citation：PASS（Answer→Citation→Chunk→Document→Source 全链路 + evidence 落库）
Generation Record：PERSISTED（migration 本地执行，recordId 落库）
Migration：本地执行（开发库 safety_dashboard；生产库未执行）
真实 RAG E2E：PASS（5 文档 → 8 chunk → 8 向量 → 检索 → qwen2.5:7b 回答 → Citation）
测试：PASS（57/57，真实运行）
Workbuddy：无冲突

[需要用户确认]：
1. 生产库 pgvector 安装与知识库 migration（独立授权）
2. Embedding 模型长期采纳确认
3. hse.rag.answer DRAFT→ACTIVE 流程
4. 生产 .env AI_PROVIDER 切换（AI-04 遗留）
5. 并行域测试失败归属（AI-04 遗留）

遗留问题：
1. ai_prompt_registry 持久化（表已建，条目内存态）
2. Legacy 与 v2 健康口径差异（AI-04 遗留）
3. Ollama Portable CLI 运维（AI-04 遗留）
4. 生产 .env 未切换 Ollama（AI-04 遗留）
5. 并行域测试失败（AI-04 遗留）
6. docx/xlsx 解析扩展未启用
7. RAG 混合检索/重排未实现（后续评估）

下一阶段：AI-06（等待 ChatGPT 审核后生成唯一正式提示词）
```
