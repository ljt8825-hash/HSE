# AI-Phase-01-02 · SK-005 企业知识问答标准 Skill 实施报告

- 任务编号：AI-Phase-01-02
- 交付物：公司第一个标准公司级 AI Skill —— **SK-005 企业知识问答**
- 项目目录：`G:\hse-dashboard`
- 报告日期：2026-10-12
- 前置任务：AI-Phase-01-00（现有系统 AI 能力与技术基础审计）；AI-Phase-01-01（公司通用 AI Skill 架构与能力边界设计）

> **前置依赖说明（重要）**
> 任务书要求读取 `docs\AI智能分析\AI-Phase-01-01-公司通用AI-Skill架构与能力边界设计报告.md`，经核查**该文件在当前仓库中不存在**（`docs\AI智能分析` 下仅有 `AI-Phase-01-00-现有系统AI能力与技术基础审计报告.md`）。
> 因此本阶段以 **01-00 的实际审计结论 + 任务书自带的 SK-005 标准定义** 为实施依据；协议命名（Skill ID / key / version / 输入输出字段）按任务书 §六~§十六 落地，并在 Skill manifest 中显式暴露，便于 01-01 报告补齐后对齐。

---

## 1. 实施摘要

本阶段**未重建任何 RAG 能力**，而是把现有企业知识库/RAG 能力按公司级 Skill 标准**封装为标准适配层**：

```
用户问题 → SK-005 → 权限 → Retriever（现有 RAG）→ Evidence → Prompt Registry
        → AI Gateway → Provider Registry → Model → 结构化结果 + 引用 + Generation Record → 前端
```

核心结论：

| 项 | 结论 |
|----|------|
| Skill 定义 | SK-005 / 企业知识问答 / `company.knowledge.answer` / v1.0.0 / domain=company / type=knowledge_qa |
| RAG | **完全复用**现有 `retriever` / `ragContextBuilder` / `vectorStore` / `knowledge_*` 表，未新建第二套 |
| Gateway | **唯一模型出口**为 `aiGateway.generate()`，Skill 内**零直连** Provider SDK/HTTP |
| Prompt | 纳入 `aiPromptRegistry`，key=`company.knowledge.answer`，version=`v1.0.0`，status=ACTIVE |
| 模型 | **不写死**；`MODEL_POLICIES.knowledge_qa.provider = null`，交由 Gateway 的活动 Provider 决定 |
| Evidence | 复用 `ragContextBuilder` 的 contextItems/citations，字段缺失保留 `null`（不伪造） |
| 记录 | 复用 `ai_generation_records`（type=`knowledge_qa`、sub_type=`SK-005`），**未新增表** |
| 权限 | 角色级 allowlist（fail-closed）+ 范围只能收窄 + 源 ACTIVE / 文档 READY 强过滤；**知识源级 ACL 缺口如实标注** |
| 防幻觉 | 双防线：①检索阈值 `MIN_RELEVANCE_SCORE=0.3` 以下直接拒答；②模型判定资料不足 → 降级 `low` |
| 前端 | 新增 Naive UI 最小页面；仅调 `/api/company/ai/*`；**未引入 Ant Design Vue，未新建 UI 组件体系** |
| HSE AI | **零改动**；`/api/hse/ai/*` 全部既有路由与业务规则保持原状（已回归验证） |

---

## 2. 修改文件

> 原则：只改完成 SK-005 所必需处，无顺手重构、无顺手清理、无顺手升级。

| 文件 | 修改原因 | 修改内容 | 影响范围 |
|------|----------|----------|----------|
| [aiPromptRegistry.js](file:///g:/hse-dashboard/server/services/ai/aiPromptRegistry.js#L106-L132) | §十五 要求 Prompt 纳入 Prompt Registry，禁止在 Skill 中硬编码完整 Prompt | 新增 `COMPANY_KNOWLEDGE_ANSWER_PROMPT`（key `company.knowledge.answer` / v1.0.0 / ACTIVE） | 仅新增一个 Prompt 条目，既有 HSE Prompt 定义未改 |
| [aiPromptRegistry.js](file:///g:/hse-dashboard/server/services/ai/aiPromptRegistry.js#L316) | 启动预注册 | 启动注册段追加 `register(COMPANY_KNOWLEDGE_ANSWER_PROMPT)` | 同上 |
| [app.js](file:///g:/hse-dashboard/server/app.js#L102) | 挂载新的公司级 Skill 路由 | 追加 `require('./routes/company-ai')` | 仅一行 require |
| [app.js](file:///g:/hse-dashboard/server/app.js#L475) | 同上 | 追加 `app.use('/api/company/ai', companyAiRoutes)` | **未改动任何 HSE 既有挂载**，`/api/hse/ai` 原样保留 |

**前端（新增 3 个文件，未修改任何既有文件）**

| 文件 | 说明 |
|------|------|
| `apps/web-naive/src/api/company-ai.ts` | SK-005 API 封装（信封解包 + 超时） |
| `apps/web-naive/src/views/company/knowledge-qa/index.vue` | 知识问答页（Naive UI） |
| `apps/web-naive/src/router/routes/modules/company-ai.ts` | 路由模块（`import.meta.glob` 自动发现） |

---

## 3. 新增文件

### 3.1 后端

| 文件 | 职责 |
|------|------|
| [companyKnowledgeAnswer.js](file:///g:/hse-dashboard/server/services/ai/skills/companyKnowledgeAnswer.js) | **SK-005 Skill 本体**：输入归一化/校验、权限与范围解析、检索、Evidence 组装、置信度推导、防幻觉、调用 Gateway、写执行记录 |
| [companyAiController.js](file:///g:/hse-dashboard/server/controllers/companyAiController.js) | Skill 路由控制器（Skill 清单 / 元数据 / SK-005 问答）+ 统一错误映射 |
| [company-ai.js](file:///g:/hse-dashboard/server/routes/company-ai.js) | 路由：`GET /skills`、`GET /skills/:id`、`POST /skills/SK-005/answer`，统一 `requireRole(...SKILL_ALLOWED_ROLES)` 准入 |

### 3.2 前端（web-naive）

| 文件 | 职责 |
|------|------|
| [company-ai.ts](file:///g:/hse-dashboard/安全看板vben/apps/web-naive/src/api/company-ai.ts) | 类型定义 + AI 信封解包（`success!==true` 抛带 `code` 的 Error）+ **120s 超时**（覆盖默认 10s，见 §13 问题 P1） |
| [index.vue](file:///g:/hse-dashboard/安全看板vben/apps/web-naive/src/views/company/knowledge-qa/index.vue) | 问题输入 / 知识范围 / 检索条数 / 强制引用 / 提交 / 回答 / 引用来源 / 置信度 / 资料不足 / 加载 / 错误 / 元信息 / 免责声明 |
| [company-ai.ts](file:///g:/hse-dashboard/安全看板vben/apps/web-naive/src/router/routes/modules/company-ai.ts) | 路由 `/company/knowledge-qa`（`order:12`，authority 与后端 allowlist 一致） |

---

## 4. 数据库变化

**结论：本阶段 0 次 migration、0 张新表、0 次 DDL。**

- 复用表：`knowledge_sources` / `knowledge_documents` / `knowledge_chunks` / `knowledge_embeddings`（读）；`ai_generation_records`（写执行记录）。
- `ai_generation_records` **已存在扩展列** `request_id / prompt_key / prompt_version / evidence`（由既有 `aiGenerationRecordService._hasExtendedColumns` 探测），因此 Skill 标准元数据可承载，**无需新增列**。
- **已知映射缺口**：该表**无 `skill_id` / `skill_version` 列**。最小映射方案：`type='knowledge_qa'` + `sub_type='SK-005'` + `prompt_key/prompt_version`（已写入）。若后续需要按 Skill 维度强约束查询，建议在 SK-001 阶段统一评审后再做 migration（见 §17-U2）。
- 生产库边界：全过程**未对生产端口 5876 生产库做任何写操作**；验证均在临时开发实例（5881）上进行。

---

## 5. Skill 结构

### 5.1 标准定义（代码常量，见 [companyKnowledgeAnswer.js](file:///g:/hse-dashboard/server/services/ai/skills/companyKnowledgeAnswer.js#L35-L86)）

```js
SKILL_ID = 'SK-005';  SKILL_NAME = '企业知识问答';
SKILL_KEY = 'company.knowledge.answer';
SKILL_VERSION = 'v1.0.0';  SKILL_DOMAIN = 'company';  SKILL_TYPE = 'knowledge_qa';

MODEL_POLICIES = { knowledge_qa: { provider: null, promptKey: SKILL_KEY,
  promptVersion: SKILL_VERSION, options: { temperature: 0.2, maxTokens: 1024 } } };

INPUT_LIMITS = { questionMaxLength: 1000, topKMin: 1, topKMax: 10, conversationIdMaxLength: 128 };
MIN_RELEVANCE_SCORE = 0.3;
```

### 5.2 输入协议与校验（§七 / §八）

```json
{ "question": "", "knowledge_scope": [], "conversation_id": null, "top_k": 5, "require_citation": true }
```

校验规则（不通过一律抛结构化 `AI_INVALID_REQUEST`，并在 `error.details` 返回字段级明细）：

| 字段 | 规则 |
|------|------|
| `question` | 不能为空；≤1000 字 |
| `top_k` | 1~10 的整数 |
| `require_citation` | 必须为布尔 |
| `conversation_id` | 可为 null；≤128 字符 |
| `knowledge_scope` | 数组；令牌 `all` \| `sourceType:<类型>` \| `sourceId:<数字ID>`；`all` 不可与其它并用；**当前检索层仅支持单一 sourceType、且不支持 sourceId+sourceType 组合**（如实返回 `NOT_SUPPORTED`，不假装支持） |

> 兼容别名：`query→question`、`knowledgeScope→knowledge_scope`、`topK→top_k`、`requireCitation→require_citation`（`normalizeInput`）。

### 5.3 输出协议（§十三，实际返回）

```json
{
  "success": true,
  "skill": { "id": "SK-005", "name": "企业知识问答", "key": "company.knowledge.answer",
             "version": "v1.0.0", "domain": "company", "type": "knowledge_qa" },
  "request_id": "…",
  "answer": "…",
  "evidence": [ { "citation_id": 1, "chunk_id": 19, "document_id": 15, "document_name": "…",
                  "source_id": 7, "source_name": "…", "source_type": "manual_upload",
                  "page": null, "section": "…", "content": "…", "score": 0.781,
                  "evidence_strength": "high" } ],
  "confidence": "high|medium|low",
  "warnings": [], "suggestions": [],
  "metadata": { "skill_key","skill_id","skill_version","model_policy","prompt_key","prompt_version",
                "provider","model","duration_ms","retrieval":{...},"record_id","record_saved",
                "gateway_request_id","trace_id","usage","citation_required","conversation_id",
                "permission_model","disclaimer" }
}
```

### 5.4 错误协议

| 场景 | HTTP | 结构 |
|------|------|------|
| 输入非法 | 200 | `{success:false,error:{code:'AI_INVALID_REQUEST',details:[{field,code,message}]}}` |
| 权限不足（角色/身份） | 403 | `{success:false,error:{code:'SKILL_PERMISSION_DENIED',…}}` |
| 范围不可用（sourceId 不存在/停用） | 200 | `{success:false,error:{code:'AI_INVALID_REQUEST',details:[{field:'knowledge_scope',code:'SOURCE_UNAVAILABLE'}]}}` |
| 检索能力不可用 | 200 | `{success:false,error:{code:'AI_PROVIDER_UNAVAILABLE',…}}` |
| Provider 未配置/不存在 | 200 | `{success:false,error:{code:'AI_PROVIDER_NOT_CONFIGURED' / 'AI_PROVIDER_NOT_FOUND',…}}` |
| Skill 不存在 | 404 | `{success:false,error:{code:'SKILL_NOT_FOUND',…}}` |

---

## 6. 调用链

```text
                 SK-005
            企业知识问答
                   │
                   ↓
             Permission                     ← resolvePermission()
        （角色 allowlist fail-closed +        角色 ∈ SKILL_ALLOWED_ROLES
          knowledge_scope 只能收窄 +          且 userId 必须存在
          源 ACTIVE / 文档 READY 强过滤）
                   │
                   ↓
              Retriever                     ← 复用现有 RAG（retriever.retrieve）
        （vector · pgvector 余弦相似度）        filters: sourceType / sourceId
                   │
                   ↓
               Evidence                     ← 复用 ragContextBuilder
        （contextItems + citations             buildContext/formatContextText
          → 可追溯引用，字段缺失为 null）
                   │
                   ↓
            Prompt Registry                 ← aiPromptRegistry
        （company.knowledge.answer v1.0.0）    promptKey/promptVersion 显式传入
                   │
                   ↓
              AI Gateway                    ← aiGateway.generate()（唯一出口）
                   │
                   ↓
          Provider / Model                  ← aiProviderRegistry（活动 Provider）
        （不写死；provider=null 交由 Gateway）  ollama / grok / openai_compatible …
                   │
                   ↓
              AI Answer
                   │
        ┌──────────┴──────────┐
        ↓                     ↓
    Evidence              Record              ← ai_generation_records
（随响应返回用户）      （type=knowledge_qa,
                        sub_type=SK-005,
                        prompt_key/version,
                        provider/model/duration/
                        status/error/evidence）
        │                     │
        └──────────┬──────────┘
                   ↓
                Frontend                    ← /company/knowledge-qa（Naive UI）
```

**关联代码位置**

| 环节 | 位置 |
|------|------|
| 权限 | [resolvePermission](file:///g:/hse-dashboard/server/services/ai/skills/companyKnowledgeAnswer.js#L229-L266) |
| 检索 | [answer() step3](file:///g:/hse-dashboard/server/services/ai/skills/companyKnowledgeAnswer.js#L369-L399) |
| Evidence | [buildTraceableEvidence](file:///g:/hse-dashboard/server/services/ai/skills/companyKnowledgeAnswer.js#L272-L287) |
| Prompt/Gateway | [answer() step6](file:///g:/hse-dashboard/server/services/ai/skills/companyKnowledgeAnswer.js#L478-L507) |
| 记录 | [_saveSkillRecord](file:///g:/hse-dashboard/server/services/ai/skills/companyKnowledgeAnswer.js#L543-L569) |
| 路由 | [company-ai.js](file:///g:/hse-dashboard/server/routes/company-ai.js) |
| 控制器 | [companyAiController.js](file:///g:/hse-dashboard/server/controllers/companyAiController.js) |

---

## 7. Prompt

- Prompt Key：`company.knowledge.answer`；Version：`v1.0.0`；状态：ACTIVE。
- 位置：[aiPromptRegistry.js](file:///g:/hse-dashboard/server/services/ai/aiPromptRegistry.js#L106-L132)。
- 内容覆盖任务书 §十五 全部要素：**角色 / 回答规则（5 条）/ 知识上下文 / 引用规则（`[引用#编号]`）/ 禁止编造 / 资料不足处理 / 输出格式 / 人机边界**。
- `user_prompt_template`：`【企业知识资料】\n{data}\n\n【用户问题】\n{custom_instructions}`（`data` = RAG 上下文文本，`custom_instructions` = 用户问题）。
- Skill **不再硬编码完整 Prompt**：仅引用 `promptKey/promptVersion`，实际取用由 Gateway 完成。
- **可追溯**：每次响应 `metadata.prompt_key / prompt_version`，执行记录写 `prompt_key/prompt_version`。

---

## 8. RAG

| 项 | 实测结论 |
|----|----------|
| 检索方式 | **向量检索**（pgvector 余弦相似度 `1-(a<=>$1)`），由现有 `retriever` 实现 |
| Embedding | `nomic-embed-text`，768 维（经 AI Gateway 的 embed 通路，Skill 不直连） |
| 复用组件 | `retriever.retrieve()` / `ragContextBuilder.buildContext()/formatContextText()` / `vectorStore` |
| 过滤能力 | 支持 `sourceType` 单一过滤、`sourceId` 单一过滤；**不支持多类型 OR、不支持 sourceId+sourceType 组合**（已在输入校验如实拒绝） |
| 强制过滤 | 仅返回「启用知识源 + READY 文档」 |
| 新建 | **无**（未新建知识库/Embedding/向量库/Retriever/RAG Service） |

---

## 9. Evidence

- 来源：`ragContextBuilder.buildContext()` 的 `contextItems` + `citations`。
- 字段：`citation_id / chunk_id / document_id / document_name / source_id / source_name / source_type / page / section / content / score / evidence_strength`。
- **不伪造**：现有表无 `page` 等字段时保留 `null`，前端显示「—」。
- 一致性：传给 Gateway 的 `evidence` 与响应 `evidence` 同源，避免「回答引用了不存在的来源」。
- 前端：折叠卡片展示文档名、相似度、知识源、source_id/document_id/chunk_id、章节、页码、证据强度与正文片段。

---

## 10. 权限

### 10.1 落地的最小权限模型（已实现）

1. **身份**：`userId = req.user.id`（**不通过姓名/昵称/岗位推断**），缺失即拒绝。
2. **角色准入（fail-closed）**：角色必须 ∈ `SKILL_ALLOWED_ROLES`
   （`system_admin, admin, safety_manager, hse_manager, township_manager, manager, viewer, grid_inspector` —— 与后端 [auth.js ROLE_PERMISSIONS_MAP](file:///g:/hse-dashboard/server/middleware/auth.js#L376-L452) 的权威角色集**逐字一致**）。
   同时路由层用 `requireRole(...SKILL_ALLOWED_ROLES)` 做前置拦截，控制器再取最小 actor。
3. **范围收敛**：`knowledge_scope` **只能收窄**检索范围，不能越权扩大；`sourceId` 必须存在且 `status='ACTIVE'`，否则拒绝。
4. **状态强过滤**：始终只检索「启用知识源 + READY 文档」。
5. **不可绕过**：Skill 不提供任何绕过权限的参数。

### 10.2 权限缺口（如实标注，不假装已支持）

- **`knowledge_sources` 表无 owner / role / 部门字段 → 当前不具备「用户 ↔ 知识源」级 ACL。**
- 即：**同一角色内不同用户，可见知识范围相同**；跨角色隔离存在，同角色内数据权限不存在。
- `metadata.permission_model` 明确回传：`role_allowlist + scope_narrowing（无知识源级 ACL）`。
- **最小修改方案（未实施，需授权）**：为 `knowledge_sources` 增加 `owner_role / owner_department / visibility` 字段（或新增 `knowledge_source_acl` 关联表），在 `retriever` 过滤条件中按 `req.user` 注入；涉及生产表 DDL，**必须单独授权**，本阶段按任务书 §九/§二十四 只做缺口说明，不执行 migration。

---

## 11. AI 执行记录

- 复用 `ai_generation_records`，**未新增表**。
- 每次正式执行尽量记录：`request_id / user_id / skill_id / skill_version / prompt_key / prompt_version / provider / model / 起止与耗时 / status(success|failed) / error / evidence`。
  - 有模型调用 → 由 Gateway 统一落库（含 prompt/usage/provider/model）。
  - 无模型调用（无检索结果的安全拒答）与**失败路径**（检索不可用、Gateway 异常）→ 由 Skill 的 `_saveSkillRecord` 直写 `status='success'/'failed'`，保证 §十七 可审计。
- **无敏感信息**：不写 API Key / Token / 密码；`prompt` 为空时不落完整 Prompt。
- 映射缺口：`ai_generation_records` 无 `skill_id/skill_version` 列 → 以 `type='knowledge_qa'` + `sub_type='SK-005'` 承载（见 §17-U2）。

---

## 12. API 测试

环境：临时开发后端 `PORT=5881`（**未使用生产 5876**），`admin` 账号 JWT。

| # | 用例 | 结果 |
|---|------|------|
| A1 | 无 token `GET /api/company/ai/skills` | ✅ 401 |
| A2 | 带 token `GET /skills` | ✅ 200，返回 SK-005 清单 |
| A3 | `GET /skills/SK-005` | ✅ 200，manifest（输入/输出协议、prompt_key/version、model_policy、allowed_roles） |
| A4 | `GET /skills/SK-999` | ✅ 404 `SKILL_NOT_FOUND` |
| A5 | `POST /skills/SK-005/answer`（真实问题） | ✅ 200，`success:true`，含 answer/evidence/confidence/metadata |
| A6 | 输入校验（空 question 等 3 项） | ✅ `AI_INVALID_REQUEST` + 逐字段 `details` |
| A7 | `knowledge_scope:['sourceId:999999']` | ✅ 结构化 `SOURCE_UNAVAILABLE`（未泄露内容） |
| A8 | `knowledge_scope:['sourceType:policy']`（该类型无数据） | ✅ 安全拒答（`success:true` / `evidence:[]` / `confidence:low`） |
| A9 | HSE 既有接口 `POST /api/hse/ai/v2/knowledge/search` | ✅ 200，行为与改造前一致 |

---

## 13. 前端测试

环境：web-naive dev server（本次落于 **5889**，因 5173/5888 被其它进程占用；代理 `VITE_PROXY_TARGET=http://127.0.0.1:5881`），真实浏览器 + 真实登录（admin）。

| # | 用例 | 结果 |
|---|------|------|
| F1 | 页面渲染（标题/问题输入/知识范围/检索条数/强制引用/提问按钮） | ✅ PASS |
| F2 | 真实提问（消防设施检查周期）→ 回答正文 + 引用来源折叠卡片（文档名/相似度）+ 高置信度 + Skill/Prompt/Provider/request_id 元信息 | ✅ PASS |
| F3 | 无答案提问 → 「未检索到足够的企业知识依据」警示 + 低置信度 + 「资料不足」标签，**未编造内容** | ✅ PASS |
| F4 | 浏览器控制台红色报错 | ✅ 无 |

其他工程校验：

- SFC 编译：`GET /src/views/company/knowledge-qa/index.vue` → 200（Vite 编译通过）。
- `pnpm -F @vben/web-naive run typecheck`：**新增文件 0 报错**；仓库既有其它文件存在**历史遗留 TS 报错**（与本次改动无关，未顺手修复，见 §17-U4）。
- 技术栈合规：仅使用 `naive-ui` + 既有 `#/components/hse`（HsePageLayout / HseStatusTag）+ `@vben/request`；**未引入 Ant Design Vue，未新建 UI 组件/组件库/请求库**。

---

## 14. 真实业务测试

知识库真实数据（本阶段实测）：2 个知识源（id 7 `manual_upload`、id 8 `policy`）、6 个文档（15~20，其中 19 未索引无 chunk）、8 个 chunk、8 条 768 维 embedding。

| # | 用例 | 输入 | 期望 | 实测 |
|---|------|------|------|------|
| T01 | 正常问题 | 安全帽相关制度要求 | 正常作答 | ✅ best=0.781，confidence=high，5 条 Evidence，provider=ollama / model=qwen2.5:7b，prompt_key/version 正确，记录已落库（#28） |
| T02 | 精确引用 | 消防设施检查周期 | 可追溯引用 | ✅ best=0.706，答案与知识库一致（「每月至少检查一次」），Evidence 含 document_name/section/score（记录 #34） |
| T03 | 无答案 | 知识库不存在的问题 | 不编造 | ✅ 明确拒答 + `confidence:low` + warning/suggestion（记录 #36） |
| T04 | 权限 | 见下方分项 | 不可越权 | ✅ 见 §15 |
| T05 | Prompt 追踪 | 任意 | 可追溯 | ✅ `metadata.prompt_key=company.knowledge.answer`、`prompt_version=v1.0.0` |
| T06 | AI 记录 | 任意 | 有记录 | ✅ `request_id/skill/type/sub_type/provider/model/duration/status` 均可查 |
| T07 | Provider 异常 | 见 §15 | 结构化 | ✅ 见 §15 |

**业务边界提示**：当前知识库仅含 AI-05 建设期的测试知识源，尚**未导入公司正式制度全文**。因此 T01/T02 是「真实链路 + 真实模型 + 真实向量库」验证，但**不代表已具备正式制度问答的业务覆盖面**；正式放量前需导入实际制度文件（见 §20）。

---

## 15. 异常测试

### T04 权限测试

| 分项 | 场景 | 实测 |
|------|------|------|
| T04a | 无 token | ✅ 401（路由层拦截） |
| T04b | 未知/越权角色 | ✅ `SkillPermissionError` → 403 `SKILL_PERMISSION_DENIED` |
| T04c | `sourceId:999999`（不存在） | ✅ 结构化拒绝 `SOURCE_UNAVAILABLE` |
| T04d | `sourceId:7`（合法） | ✅ 收敛成功，仅在该源内检索 |
| T04e | `sourceType:policy`（无数据） | ✅ 安全拒答，不编造 |
| T04f | `sourceId` 组合 `sourceType` / 多个 sourceType | ✅ 明确 `NOT_SUPPORTED`（不假装支持） |

### T07 Provider 异常

| 分项 | 场景 | 实测 |
|------|------|------|
| T07a | `provider='grok'` 但 `GROK_API_KEY` 为空 | ✅ `AI_PROVIDER_NOT_CONFIGURED`，**系统未崩溃**，失败记录已落库（#37） |
| T07b | `provider='no_such_provider'` | ✅ `AI_PROVIDER_NOT_FOUND`，失败记录已落库（#38） |
| T07c | 检索能力不可用 | ✅ `AI_PROVIDER_UNAVAILABLE` + 失败记录（覆盖 `ret.available=false` 分支） |

> 注：T07a 暴露的根因是**默认活动 Provider（grok）密钥未配置**（01-00 报告 R1）。本阶段**未修改生产 `.env`**（遵守 `prod-boundary`），测试通过进程级环境变量 `AI_PROVIDER=ollama` 运行临时实例完成，风险记录见 §17-U1。

---

## 16. 发现问题

| # | 问题 | 处理 |
|---|------|------|
| P1 | 前端首次联调报 `ECONNABORTED`：`requestClient` 默认超时 10s，而同步模型调用需 12~25s | ✅ 已修复：SK-005 回答接口显式 `timeout: 120s`（沿用既有 `OCR_TIME_OUT` 范式） |
| P2 | 无答案场景曾被误算为 `high`（模型正确拒答，但检索最高分 0.665 > 0.6 阈值） | ✅ 已修复：新增 `isInsufficientAnswer()` 识别模型「资料不足」表述 → 强制降级 `confidence=low` + warning/suggestion；复测 T03 返回 `low` |
| P3 | 现有开发环境存在**遗留 dev server 占 5173/5888**，且 5173 的代理目标 5882 已下线，导致接口必然失败 | ⚠️ **非本次代码问题**，未处理（属既有环境状态）；报告内记录端口实况 |
| P4 | 仓库 `typecheck` 存在**大量既有历史 TS 报错**（其它页面文件） | ⚠️ 未顺手修复；仅确认**新增文件 0 报错** |

---

## 17. 未解决问题

| # | 事项 | 影响 | 建议 |
|---|------|------|------|
| U1 | 默认活动 Provider = `grok`，但 `GROK_API_KEY` 未配置（01-00 R1） | 生产环境下 SK-005 会报 `AI_PROVIDER_NOT_CONFIGURED` | **需业务/运维授权**后配置密钥或切换活动 Provider；不得由 AI 擅改生产 `.env` |
| U2 | `ai_generation_records` 无 `skill_id/skill_version` 列 | Skill 维度审计只能靠 `sub_type`/`prompt_key` 近似 | 建议在 SK-001 阶段统一评审后一次性 migration（含索引/回滚） |
| U3 | 知识源级 ACL 缺失（`knowledge_sources` 无 owner/role/部门） | 同角色内用户可见范围相同 | 见 §10.2 最小修改方案，需独立授权 |
| U4 | 前端 `typecheck` 历史报错 | 无法以 typecheck 作为全量门禁 | 建议单独立项分批收敛，不在本任务范围内 |
| U5 | 知识库仅含 AI-05 测试数据 | 业务覆盖面不足 | 导入公司正式制度文件并重建索引 |

### Deferred（明确不做，避免顺手重构）

| 项 | 说明 |
|----|------|
| `/api/hse/ai` 双 Router 挂载 | 与 SK-005 无关，不动 |
| `aiEnhancedService` 绕过 Gateway | 与 SK-005 无关，不动 |
| AI 表/库间环境不一致 | 与 SK-005 无关，不动 |
| 遗留 dev server 端口占用（5173/5888） | 环境状态，非代码问题 |

---

## 18. 与 HSE AI 兼容性

- 本次**未删除、未修改**任何 HSE AI 资产：HSE AI 分析中心、AI 分析任务、HSE Prompt（`hse.*`）、HSE Evidence、HSE Review 闭环、`/api/hse/ai/*` 全部路由与业务规则**原状保留**。
- 新增能力位于**独立命名空间** `/api/company/ai`（公司通用 Skill），HSE 与公司级 Skill 互不侵入。
- 演进方向符合任务书 §二十三：未来应为 **HSE AI → 调用 SK-005**，而**不是**把 HSE 规则写进 SK-005。
- **回归实测**：`POST /api/hse/ai/v2/knowledge/search` 200 正常；`POST /api/hse/ai/v2/knowledge/rag` 200 正常（`hse.rag.answer`、promptVersion v1.0、evidence 2 条、答案来自知识库）→ **HSE AI 未受影响**。

---

## 19. 验收结果

| 项 | 验收点 | 结果 |
|----|--------|------|
| A | 正常接收问题 | ✅ |
| B | 检索企业知识 | ✅（向量检索，复用现有 RAG） |
| C | 回答基于检索结果 | ✅（Prompt 强制仅依据上下文） |
| D | 无依据时不编造 | ✅（双防线 + T03/F3 实测） |
| E | 返回 Evidence | ✅ |
| F | Evidence 可追溯来源 | ✅（文档名/源/章节/片段/相似度） |
| G | 使用统一 Prompt Registry | ✅（`company.knowledge.answer`） |
| H | 记录 Prompt 版本 | ✅（`prompt_version=v1.0.0`） |
| I | 通过 AI Gateway 调用模型 | ✅（Skill 内零直连） |
| J | 生成 AI 执行记录 | ✅（含失败路径） |
| K | 遵守用户权限 | ✅（角色 fail-closed + 范围收敛；ACL 缺口已如实标注） |
| L | 现有 HSE AI 不受影响 | ✅（search / rag 回归通过） |
| M | 前端使用 Naive UI | ✅（无 Ant Design Vue，无新组件体系） |

**完成条件核对**

- [x] SK-005 正式 Skill 接口完成
- [x] RAG 复用成功
- [x] Gateway 调用成功
- [x] Prompt Registry 接入
- [x] Evidence 接入
- [x] Generation Record 接入
- [x] 权限验证
- [x] 无答案防幻觉验证
- [x] Provider 异常验证
- [x] 真实知识库验证
- [x] 前端验证
- [x] HSE AI 回归验证
- [x] 实施报告完成

---

## 20. 下一步建议

1. **导入公司正式制度文件**并重建向量索引（补足 U5），再做一轮业务覆盖度验收。
2. **处置 U1**：由业务/运维授权后配置 Grok 密钥或切换活动 Provider，使默认链路可用。
3. **评审 U2/U3**：把 `ai_generation_records.skill_id/skill_version` 与知识源 ACL 纳入 **SK-001 阶段统一 migration 计划**（字段/索引/兼容/迁移/回滚一次design），避免逐个 Skill 打补丁。
4. **复制本标准**：SK-001 Excel / SK-002 文档 / SK-003 检查 / SK-004 报告 应**直接复用**本 Skill 的结构化范式（输入校验 → 权限 → Evidence → Prompt Registry → Gateway → 统一输出 → 记录 → 前端），不重新设计。
5. **可选增强**：若需流式体验，评估复用现有 SSE 通路（本阶段按任务书 §二十二 未改造 SSE，先完成非流式标准链路）。
6. **前端可发现性**：本阶段已将页面以 `order:12` 挂入菜单；若需收紧菜单，可仅加 `hideInMenu: true` 一行（页面仍可通过 `/company/knowledge-qa` 直达）。

---

## 附：本阶段运行环境（仅开发，不涉及生产）

| 用途 | 端口 | 说明 |
|------|------|------|
| 生产 HSE 后端 | 5876 | **本阶段未启动、未重启、未终止、未修改**（遵守 `prod-boundary`） |
| SK-005 验证后端（临时） | 5881 | 独立进程实例；测试用 `AI_PROVIDER=ollama` |
| 前端 dev server（本次） | 5889 | 因 5173/5888 被占用而回落；代理指向 5881 |