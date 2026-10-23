# AI-Phase-01-01
# 公司通用 AI Skill 架构与能力边界设计报告

> **文档性质**：架构冻结基线（Architecture Freeze Baseline）
> **版本**：v1.0（首次正式形成）
> **日期**：2026-10-12
> **项目目录**：`G:\hse-dashboard`
> **任务编号**：AI-Phase-01-03（架构正式冻结 + SK-005 样板复核）
> **前置依据**：`AI-Phase-01-00-现有系统AI能力与技术基础审计报告.md`（实际审计结论）+ `AI-Phase-01-02-SK-005企业知识问答Skill实施报告.md`（实际实施结果）
> **本阶段性质**：审计 / 整理 / 对齐 / 冻结。**未修改任何业务代码、HSE AI、登录认证、JWT、生产配置、数据库结构，未新增依赖，未开发 SK-001~SK-004。**

---

## 关于本文档的形成方式（重要）

- 任务书 AI-Phase-01-02 曾要求读取 `AI-Phase-01-01-公司通用AI-Skill架构与能力边界设计报告.md`，经核查当时**该文件在仓库中不存在**（`docs\AI智能分析` 下仅有 01-00 报告）。
- 因此本文档**不是**对既有 01-01 报告的更新或覆盖（不存在可覆盖的同名正式报告），而是**首次正式形成**，并满足任务书 AI-Phase-01-03 §三 的要求。
- 本文档的形成依据是：**01-00 的实际审计结论 + 01-02 的 SK-005 实际实现 + 任务书自带的架构设计要求**，并以 **SK-005 作为第一份样板反向验证**（§二十一）后冻结。
- 凡涉及「当前是否已实现」的陈述，均以 01-00 / 01-02 的实测证据与本次代码复核为准，**不把未来能力写成已实现**。

---

## 1. 结论摘要

| 项 | 结论 |
|----|------|
| 公司 Skill 标准 | **冻结**（本文档 §4~§19 即标准） |
| SK-005 标准样板 | **通过**（§21 逐项复核，无致命问题） |
| SK-001 是否可以开始 | **可以**（前置条件：复用本文档标准，不重新设计） |
| 底座来源 | 复用现有 AI 能力层（Gateway / Provider Registry / Prompt Registry / Evidence / Record / RAG），**不重建底座** |
| 冻结方式 | 以 SK-005 的真实实现为「可执行参照」，把 01-02 的落地选择升格为标准 |

一句话：**公司通用 AI Skill 的架构标准以 SK-005 为参照冻结，后续 SK-001~SK-004 复制该标准（输入校验 → 权限 → Evidence → Prompt Registry → AI Gateway → 统一输出 → Generation Record → 前端），不得各自另起一套。**

---

## 2. 冻结范围与依据

### 2.1 冻结范围

本文档冻结以下**公司级（Company）通用 AI Skill 的架构标准**：

Skill 定义 / 生命周期 / 调用链 / 输入协议 / 输出协议 / 错误协议 / Evidence / Prompt / Model Policy / 权限 / AI 记录 / 人机边界 / 前端 / Skill 与 Agent 边界 / Company 与 HSE 边界。

### 2.2 依据与证据来源

| 来源 | 用途 |
|------|------|
| AI-Phase-01-00 审计报告 | 底座现状（Gateway/Provider/Prompt/Evidence/Record/RAG/权限/风险） |
| AI-Phase-01-02 实施报告 + SK-005 源码 | 样板实际实现（本次逐项复核） |
| 任务书 AI-Phase-01-03 §五~§二十二 | 冻结项清单 |
| `server/services/ai/*`、`server/middleware/auth.js` | 复核实测（本次读取） |

### 2.3 本次复核过的关键实现（只读，未修改）

| 文件 | 复核内容 |
|------|----------|
| [companyKnowledgeAnswer.js](file:///g:/hse-dashboard/server/services/ai/skills/companyKnowledgeAnswer.js) | SK-005 本体（元数据/校验/权限/检索/Evidence/Gateway/记录） |
| [companyAiController.js](file:///g:/hse-dashboard/server/controllers/companyAiController.js) | 错误映射与最小 actor 派生 |
| [company-ai.js](file:///g:/hse-dashboard/server/routes/company-ai.js) | 路由与角色准入 |
| [aiGateway.js](file:///g:/hse-dashboard/server/services/ai/aiGateway.js#L128-L203) | `generate()` 契约（promptKey/promptVersion/evidence/record） |
| [aiEvidenceService.js](file:///g:/hse-dashboard/server/services/ai/aiEvidenceService.js) | 统一证据结构与来源类型 |
| [aiGenerationRecordService.js](file:///g:/hse-dashboard/server/services/ai/aiGenerationRecordService.js) | `ai_generation_records` 落库字段与扩展列探测 |
| [errors.js](file:///g:/hse-dashboard/server/services/ai/errors.js) | 统一错误码与 `toErrorResponse` |
| [aiPromptRegistry.js](file:///g:/hse-dashboard/server/services/ai/aiPromptRegistry.js) | Prompt 注册/版本/渲染 |
| [auth.js](file:///g:/hse-dashboard/server/middleware/auth.js#L376-L452) | 权威角色集（8 个） |
| [knowledgeSourceService.js](file:///g:/hse-dashboard/server/services/ai/knowledge/knowledgeSourceService.js) | 知识源类型（6 类）与 ACTIVE/DISABLED |

---

## 3. 术语与分层模型

```text
公司 AI 应用层（业务/Agent）
        │
        ├── HSE AI（既有，HSE 专业）
        └── 部门/岗位 AI 数字员工（未来 Agent）
        │
Company Skills（SK-001..SK-005，通用能力，本文档冻结对象）
        │
Skill Service（Skill 编排/准入/统一协议层；当前由各 Skill 模块 + 控制器承担）
        │
AI 能力底座（复用，不重建）
   Permission ─ Evidence/Retrieval ─ Prompt Registry ─ AI Gateway
   ─ Provider Registry ─ Model ─ Generation Record ─ Human Review
```

术语：

| 术语 | 含义 |
|------|------|
| **Skill** | 一个可复用、标准化、可审计的 AI 能力（本文档核心对象） |
| **Skill Service** | 承载 Skill 统一协议、准入、编排与错误收敛的服务层 |
| **Agent** | 面向业务角色/岗位的综合工作任务（可调用多个 Skill） |
| **AI Gateway** | 唯一模型出口，负责 Prompt 解析、Provider 选择、证据校验、记录落库 |
| **Provider Registry** | Provider 注册与健康探测（grok / ollama / openai_compatible） |

---

## 4. Skill 标准定义（冻结）

任一公司级 Skill **必须**具备以下字段（`skill_key` 为全局唯一技术标识）：

| 字段 | 必填 | 说明 |
|------|:---:|------|
| `skill_id` | ✅ | 稳定编号，如 `SK-005` |
| `skill_key` | ✅ | 技术标识（命名空间.能力），如 `company.knowledge.answer` |
| `name` | ✅ | 中文名，如 `企业知识问答` |
| `version` | ✅ | 语义化版本，如 `v1.0.0` |
| `description` | ✅ | 能力说明与边界 |
| `domain` | ✅ | 归属域，公司通用为 `company` |
| `type` | ✅ | 能力类型，如 `knowledge_qa` |
| `owner` | ✅ | 责任归属（业务责任人/模块负责人） |
| `status` | ✅ | 生命周期状态（见 §5） |

**命名规范（冻结）**

```text
skill_key = <domain>.<capability>.<verb>
company 域示例：company.excel.analysis / company.document.parse /
                company.inspection.analysis / company.report.generate /
                company.knowledge.answer
```

**SK-005 现行取值（模板参照）**

```text
skill_id = SK-005 | skill_key = company.knowledge.answer | name = 企业知识问答
version  = v1.0.0 | domain = company | type = knowledge_qa | status = Active
```

> 说明：SK-005 当前在代码常量中维护上述元数据（[companyKnowledgeAnswer.js L35-L40](file:///g:/hse-dashboard/server/services/ai/skills/companyKnowledgeAnswer.js#L35-L40)）并通过 `manifest()` 对外暴露；`owner` 字段当前由书面责任归属承担（不强制代码常量）。后续 Skill 应显式补 `owner`。

---

## 5. Skill 生命周期（冻结）

统一定义五态：

| 状态 | 含义 | 准入要求 |
|------|------|----------|
| `Draft` | 设计/开发中，未对外 | 仅开发验证 |
| `Testing` | 已可调用，验收测试中 | 限测试环境/白名单 |
| `Active` | 正式可用 | 通过验收 A~M 同类标准 |
| `Deprecated` | 停止推荐，保留兼容 | 不新接入，给出替代 Skill |
| `Archived` | 归档只读 | 不再调用 |

- 状态迁移**只允许** `Draft → Testing → Active → Deprecated → Archived`，不得回跳跨越（回退需书面说明）。
- 状态需在 Skill 元数据与（未来）注册表中一致；当前 SK-005 处于 `Active`（§20）。

---

## 6. Skill 标准调用链（冻结）

```text
Business / Agent
        ↓
      Skill
        ↓
 Skill Service
        ↓
 Permission
        ↓
 Evidence / Retrieval
        ↓
 Prompt Registry
        ↓
 AI Gateway
        ↓
 Provider Registry
        ↓
 Model
        ↓
 Structured Output
        ↓
 Generation Record
        ↓
 Human Review（需要时）
```

### 6.1 设计 vs SK-005 实际实现（不得偷偷改定义）

| 环节 | 设计要求 | SK-005 实际 | 差异判定 |
|------|----------|-------------|----------|
| Business/Agent → Skill | 由上层业务或 Agent 发起 | 由 `/api/company/ai` 路由发起（暂无 Agent） | 一致（当前入口=API） |
| Skill → Skill Service | 统一编排/协议层 | 由 Skill 模块 + 控制器承担，尚无独立 `skillService` 模块 | **命名/形态差异**（见下） |
| Permission | 调用前鉴权 | `requireRole` 路由前置 + `resolvePermission()` 双保险 | 一致 |
| Evidence/Retrieval | 检索产证据 | `retriever.retrieve` → `ragContextBuilder` → Evidence | 一致 |
| Prompt Registry | 禁止硬编码完整 Prompt | `promptKey/promptVersion` 传入 Gateway | 一致 |
| AI Gateway | 唯一模型出口 | `gateway.generate()`，Skill 内零直连 | 一致 |
| Provider Registry → Model | 模型不写死 | `provider:null` 交 Gateway 活动 Provider | 一致 |
| Structured Output | 统一输出协议 | `{success,skill,request_id,answer,evidence,confidence,warnings,suggestions,metadata}` | 一致 |
| Generation Record | 每次执行留痕 | `ai_generation_records`（含失败路径） | 部分符合（缺 skill_id 列，§14） |
| Human Review | 需要时 | 人机边界声明 + `disclaimer`，不强制每次审核 | 一致（本类 Skill 不强制） |

**唯一结构性差异（如实登记，不修改 SK-005）**：

> **设计中的「Skill Service」层在 SK-005 中未独立成模块**，而是由 `skills/companyKnowledgeAnswer.js`（能力本体）+ `controllers/companyAiController.js`（协议/错误收敛）共同承担。
> **架构裁定**：v1 阶段允许「Skill Service 由 Skill 模块 + 控制器共同承担」；当出现第 3 个及以上 Skill 时（约 SK-003 阶段）再评估是否抽取独立 `aiSkillService`。**不因此改动 SK-005**。

---

## 7. 统一 Skill 输入协议（冻结）

### 7.1 分层原则

输入必须区分 **Skill 公共字段**（所有 Skill 共享）与 **Skill 业务字段**（按 Skill 类型定义）。

```text
请求体
├── 公共字段（Skill Service 层统一处理）
│   ├── request_id（可选；缺省由系统生成）
│   ├── user context（不由请求体传入，来自认证上下文 req.user）
│   ├── scope（可选：数据范围/知识范围，语义按 Skill 定义）
│   └── options（可选：top_k / require_citation 等运行参数）
└── 业务字段（由各 Skill 自行定义与校验）
    └── 例：SK-005 的 question
```

### 7.2 公共字段（冻结）

| 字段 | 必填 | 说明 |
|------|:---:|------|
| `request_id` | ✕ | 客户端可携带用于幂等/追踪；缺省系统生成 |
| `user context` | — | **不从请求体读取**；由认证中间件派生（`req.user`） |
| `scope` | ✕ | 数据/知识范围令牌，语义由 Skill 定义，只可**收窄**不可放大 |
| `options` | ✕ | Skill 运行参数（如分页、检索条数、强制引用） |

### 7.3 业务字段（按 Skill 定义，不得强制所有 Skill 存在）

> **铁律**：不得因为 SK-005 需要 `question/knowledge_scope/top_k/require_citation`，就要求所有 Skill 都必须有这些字段。

**SK-005 业务字段示例**

```json
{ "question": "", "knowledge_scope": [], "conversation_id": null, "top_k": 5, "require_citation": true }
```

### 7.4 校验规则（冻结）

- 任何 Skill **必须**校验：必填、长度/范围、枚举合法、权限合法。
- 校验失败**必须**返回结构化错误（§9），**禁止**用 500 或裸异常表达参数错误。
- 兼容别名（如 `query→question`）可在 `normalizeInput` 内处理，但**标准字段名以文档为准**。

---

## 8. 统一 Skill 输出协议（冻结）

### 8.1 公共响应结构

```json
{
  "success": true,
  "skill": { "id": "SK-xxx", "key": "…", "name": "…", "version": "v…", "domain": "…", "type": "…" },
  "request_id": "…",
  "answer": "…",
  "evidence": [],
  "confidence": "high|medium|low",
  "warnings": [],
  "suggestions": [],
  "metadata": {}
}
```

### 8.2 字段强制性（冻结）

| 字段 | 所有 Skill 必须存在 | 说明 |
|------|:---:|------|
| `success` | ✅（必填） | 恒为布尔 |
| `skill` | ✅（必填） | Skill 标识块 |
| `request_id` | ✅（必填） | 追踪标识 |
| `answer` / `result` | ✅（二选一必填） | 文本型 Skill 用 `answer`；结构型用 `result` |
| `evidence` | ✅（必填，可为 `[]`） | 无依据时为空数组 |
| `confidence` | ✅（必填） | `high/medium/low`；结构化型可扩展但不得省略 |
| `warnings` | ⭕（选填，缺省 `[]`） | 风险/降级提示 |
| `suggestions` | ⭕（选填，缺省 `[]`） | 下一步建议 |
| `metadata` | ✅（必填） | Skill 运行元数据（见 §8.3） |
| `error` | ❌（失败时才有） | 仅在 `success:false` 时出现（§9） |

### 8.3 metadata 必备子项（冻结）

| 子项 | 必备 | 说明 |
|------|:---:|------|
| `skill_key` / `skill_id` / `skill_version` | ✅ | 便于记录与审计 |
| `prompt_key` / `prompt_version` | ✅ | Prompt 可追溯（§10） |
| `model_policy` | ✅ | 使用的策略名 |
| `provider` / `model` | ✅ | 实际调用的 Provider/模型（失败可为 null） |
| `duration_ms` | ✅ | 耗时 |
| `record_id` / `record_saved` | ✅ | 记录落库情况 |
| 其余（retrieval / usage / trace_id / disclaimer 等） | ⭕ | 按 Skill 类型扩展 |

---

## 9. 错误协议标准（冻结）

- 统一复用 `AI_ERROR_CODES` 与 `toErrorResponse`（[errors.js](file:///g:/hse-dashboard/server/services/ai/errors.js)）。
- 结构：`{ success:false, error:{ code, message, provider, retryable, requestId } }`；参数级错误**必须**附 `error.details[]`（字段级明细）。
- **访问控制层**（角色/身份）可使用独立错误码 `SKILL_PERMISSION_DENIED`（HTTP 403），与 AI 能力错误码区分。

| 场景 | code | HTTP |
|------|------|:---:|
| 参数不合法 | `AI_INVALID_REQUEST`（+ details） | 200 |
| 权限不足 | `SKILL_PERMISSION_DENIED` | 403 |
| Provider 未配置 | `AI_PROVIDER_NOT_CONFIGURED` | 200 |
| Provider 不存在 | `AI_PROVIDER_NOT_FOUND` | 200 |
| Provider 不可用 | `AI_PROVIDER_UNAVAILABLE` | 200 |
| 超时 | `AI_TIMEOUT` | 200 |
| 限流 | `AI_RATE_LIMITED` | 200 |
| Skill 不存在 | `SKILL_NOT_FOUND` | 404 |

**禁止**：暴露内部堆栈、API Key、Token、密码。

---

## 10. Evidence 标准（冻结）

### 10.1 统一证据模型

| 字段 | 必备 | 说明 |
|------|:---:|------|
| `evidence_id` | ✅ | 证据标识（**容许别名 `citation_id`**，语义等价） |
| `source_id` / `source_name` / `source_type` | ✅ | 知识/数据来源 |
| `document_id` / `document_name` | ⭕ | 文档型来源必填，其余可为 null |
| `chunk_id` | ⭕ | 分块型来源 |
| `page` / `section` | ⭕ | 位置信息 |
| `content` | ✅ | 证据正文片段 |
| `score` | ⭕ | 相关性/相似度 |
| `evidence_strength` | ✅ | `low/medium/high`（来源类型须属 `aiEvidenceService.EVIDENCE_SOURCE_TYPES`） |

### 10.2 null 规则（冻结）

- **字段不存在时允许为 `null`；禁止伪造**（与 SK-005 现行原则一致）。
- 前端对 `null` 一律显示占位（如「—」），不得用推测值填充。
- 传入 Gateway 的 `evidence` 与响应 `evidence` **必须同源**，避免「回答引用了不存在的来源」。

> SK-005 现行 Evidence 字段集即本标准的最小落地参照（[buildTraceableEvidence](file:///g:/hse-dashboard/server/services/ai/skills/companyKnowledgeAnswer.js#L272-L287)）。

---

## 11. Prompt 标准（冻结）

| 项 | 标准 |
|----|------|
| 归属 | Prompt **必须**登记在 AI Prompt Registry，禁止在 Skill 中长期硬编码完整 Prompt |
| key | `prompt_key`，命名与 `skill_key` 对齐（如 `company.knowledge.answer`） |
| 版本 | `prompt_version`，如 `v1.0.0` |
| 状态 | `status ∈ {DRAFT, ACTIVE, DISABLED}` |
| 调用 | `Skill → Prompt Registry → Prompt（版本） → Gateway 渲染` |
| 追踪 | 每次响应与记录**必须**含 `prompt_key/prompt_version` |

> 现状说明：Registry 为**代码级内存实现**（`ai_prompt_registry` 表存在但为 0 行，见 01-00 §10）。数据库化运营为**未来能力**，不在 v1 强制。

---

## 12. Model Policy 标准（冻结）

- Skill **禁止**写死 Provider/模型（禁 `grok/qwen/deepseek/ollama` 字面量）。
- 必须通过 `model_policy`（按 `type` 定义）交给 **AI Gateway + Provider Registry** 决定。
- `provider:null` = 交给「当前活动 Provider」。

```js
MODEL_POLICIES = {
  knowledge_qa: { provider: null, promptKey: 'company.knowledge.answer',
                  promptVersion: 'v1.0.0', options: { temperature: 0.2, maxTokens: 1024 } }
}
```

> SK-005 现行实现即本标准参照（[MODEL_POLICIES](file:///g:/hse-dashboard/server/services/ai/skills/companyKnowledgeAnswer.js#L59-L66)）。

---

## 13. 权限标准（冻结）

统一权限维度（**区分已实现 / 未来**）：

| 维度 | 含义 | 当前状态 |
|------|------|----------|
| 身份认证 | `req.user.id`（JWT），**禁止**由姓名/昵称/岗位推断 | ✅ 已实现 |
| 角色权限 | 角色 ∈ 权威角色集（8 个）的 allowlist，fail-closed | ✅ 已实现（SK-005） |
| 数据范围 | 业务数据行级过滤（如本人/本部门） | ⭕ 视 Skill 而定，部分存在 |
| 资源权限 | 对具体资源（任务/文档）的访问权 | ⭕ 未来 |
| 知识源权限 | 「用户 ↔ 知识源」级 ACL | ❌ **尚未实现（缺口，R3）** |

**权威角色集（8 个，与 [auth.js ROLE_PERMISSIONS_MAP](file:///g:/hse-dashboard/server/middleware/auth.js#L376-L452) 逐字一致）**

```text
system_admin, admin, safety_manager, hse_manager, township_manager, manager, viewer, grid_inspector
```

**v1 强制要求（Skill 必须做到）**

1. 身份缺失 → 拒绝；2. 角色不在 allowlist → 拒绝（403）；3. `scope` 只能收窄；4. 强制「源 ACTIVE + 文档 READY」；5. 不提供任何绕过权限的参数。

**未来能力（明确不写成已实现）**

- 知识源级 ACL 需为 `knowledge_sources` 增加 `owner_role / owner_department / visibility`（或新增 `knowledge_source_acl` 关联表），并在 `retriever` 注入过滤条件。**本阶段不做 migration**（§14.3）。

---

## 14. AI 记录与审计标准（冻结）

### 14.1 目标记录字段（标准）

```text
request_id, skill_id, skill_version, prompt_key, prompt_version,
provider, model, duration_ms, status, error, evidence, usage
```

### 14.2 现状与缺口（如实登记）

- 复用 `ai_generation_records`，**不新增表**。
- 该表**已含**扩展列 `request_id / prompt_key / prompt_version / evidence`（由 `_hasExtendedColumns` 探测），可承载 Skill 标准元数据。
- **缺口**：`ai_generation_records` **无 `skill_id` / `skill_version` 列**（**R2**）。当前以 `type='knowledge_qa'` + `sub_type='SK-005'` + `prompt_key/prompt_version` 近似。
- 失败路径（检索不可用 / Gateway 异常）由 Skill 直写 `status='failed'`，保证可审计。
- **禁止**记录 API Key / Token / 密码；无模型调用时不落完整 Prompt。

### 14.3 后续统一 migration 方案（建议，本阶段不执行）

> 本阶段**只提出方案**，不执行任何 DDL。

| 项 | 建议 |
|----|------|
| 目标 | `ai_generation_records` 增列 `skill_id VARCHAR(32)`、`skill_version VARCHAR(16)`；可选 `skill_key VARCHAR(64)` |
| 索引 | 新增 `idx_ai_gen_skill (skill_id, skill_version, created_at DESC)`，支持按 Skill 维度审计 |
| 兼容 | 全部可空；既有行保留 `NULL`；历史数据由 `sub_type` 回填（可分批） |
| 迁移 | 独立 migration 文件（含 `IF NOT EXISTS`），在非生产库先行验证 |
| 回滚 | `DROP COLUMN` + `DROP INDEX`（可空列，回滚无数据损失） |
| 授权 | 涉及生产表结构，**必须单独授权**后执行；建议与知识源 ACL 一次统一设计（避免逐个 Skill 打补丁） |

### 14.4 人机边界标准

- AI 输出**仅为辅助信息/建议**，不构成正式制度解释、法律意见、管理决定或最终业务判断。
- 高风险场景**必须**在响应中提示「以正式制度文件和人工审核为准」（`metadata.disclaimer`）。
- Human Review 为**按需**环节（证据链须保持：`AI Evidence → AI Suggestion → Human Review → Final Result`），不属所有 Skill 的强制步骤。

---

## 15. 前端标准（冻结）

| 项 | 标准 |
|----|------|
| 技术栈 | Vue 3 + Vben 5.7.0 + **Naive UI**；**禁止**引入 Ant Design Vue（除非审计证明目标页本就是 antd） |
| 组件 | 复用现有页面/组件/布局/`#/components/hse`；**禁止**新建 UI 组件体系/组件库/请求库 |
| 请求 | 复用 `@vben/request`（`requestClient`）；AI 接口须显式设置足够超时（默认 10s 不足模型调用） |
| 最小功能 | 输入 → 提交 → 回答 → 引用来源 → 置信度 → 资料不足提示 → 加载态 → 错误态 |
| 流式 | 优先复用现有 SSE；**不得**为单个 Skill 强改 SSE 架构；不能复用则先做非流式标准链路 |

---

## 16. Skill 与 Agent 边界（冻结）

### Skill

> 完成**一个可复用、标准化、可审计的 AI 能力**。

```text
SK-001 Excel 数据分析 / SK-002 文档解析 / SK-003 检查数据分析 /
SK-004 报告生成 / SK-005 企业知识问答
```

### Agent

> 完成**一个面向业务角色/岗位的综合工作任务**。

```text
安环 AI 数字员工 / 生产 AI 数字员工 / 财务 AI 数字员工 /
人综 AI 数字员工 / 环卫 AI 数字员工 / 市政园林 AI 数字员工
```

**边界铁律（冻结）**

```text
Agent 可以调用多个 Skill
Skill 不能反向绑定某一个 Agent
```

---

## 17. 公司级 Skill 与 HSE Skill 边界（冻结）

| 归属 | 负责 | 示例 |
|------|------|------|
| **Company Skills** | 通用能力 | 知识问答、Excel 分析、文档解析、报告生成 |
| **HSE 专属能力** | HSE 专业判断 | 三违分析、隐患分析、风险判断、HSE 检查分析规则、管理建议越权边界 |

**边界铁律（冻结）**

- 不得把 HSE 专属规则**全部**塞进公司通用 Skill。
- 演进方向：**HSE AI → 调用 Company Skill**（而非把 HSE 规则写入公司 Skill）。
- Company Skill 可包含「HSE 数据的**通用处理管线**」（如检索、统计、报告渲染），但**HSE 专业语义与判定规则留在 HSE 层**。

---

## 18. 第一阶段五个 Skill 冻结清单

> 状态：SK-005 = `Active`；SK-001~SK-004 = `Draft`（**尚未开发**，本清单为其标准定义，非实现声明）。

| 项 | SK-001 | SK-002 | SK-003 | SK-004 | SK-005 |
|----|--------|--------|--------|--------|--------|
| 名称 | Excel 数据分析 | 文档解析 | 检查数据分析 | 报告生成 | 企业知识问答 |
| `skill_key` | `company.excel.analysis` | `company.document.parse` | `company.inspection.analysis` | `company.report.generate` | `company.knowledge.answer` |
| `domain` | company | company | company | company | company |
| `type` | `data_analysis` | `document_parse` | `inspection_analysis` | `report_generation` | `knowledge_qa` |
| 输入（业务字段） | `file`/`dataset_ref`, `analysis_goal`, `scope`, `options` | `document_ref`/`file`, `parse_mode`, `options` | `dataset_ref`, `period`, `scope`, `options` | `source_result`/`data_ref`, `template`, `options` | `question`, `knowledge_scope`, `top_k`, `require_citation` |
| 输出 | `result`（结构化统计）+ `answer`（解释） | `result`（结构化抽取）+ `evidence` | `result`（统计/排名/趋势）+ `evidence` | `result`（报告正文/文件引用）+ `evidence` | `answer` + `evidence` |
| Evidence | 数据行级（business_record） | 文档/分块（document） | 业务记录/规则 | 业务记录/知识库 | 知识库（knowledge_base） |
| 权限 | 角色 allowlist + 数据范围 | 角色 + 文档可见性 | 角色 + 数据范围 | 角色 + 数据范围 | 角色 + 知识范围（ACL 未来） |
| Prompt | `company.excel.analysis` | `company.document.parse` | `company.inspection.analysis` | `company.report.generate` | `company.knowledge.answer` |
| Model Policy | `data_analysis` | `document_parse` | `inspection_analysis` | `report_generation` | `knowledge_qa` |
| Model | 不写死（provider:null） | 同左 | 同左 | 同左 | 同左 |

**边界补充（重要）**：

- **SK-003 检查数据分析**：对外提供「检查数据的**通用**分析管线（校验 → 统计 → 排序/趋势 → 证据 → AI 解释）」；HSE 检查的**专业判定规则**（隐患/三违/风险等级、法规语义、管理建议越权边界）作为 **HSE 适配层**，不并入公司通用 Skill（§17）。
- 现有可复用底层（01-00 §18）：SK-001 ≈ 45%、SK-002 ≈ 35%、SK-003 ≈ 70%、SK-004 ≈ 55%、SK-005 ≈ 80%。

---

## 19. SK-005 正式状态确认

| 项 | 结论 |
|----|------|
| `skill_id` | SK-005 |
| `skill_key` | `company.knowledge.answer` |
| `version` | **v1.0.0** |
| `status` | **Active** |
| 依据 | 01-02 实施报告 §19 验收 A~M 全绿 + 完成条件 13 项全勾；本次复核未发现致命问题（§21） |

---

## 20. 当前架构风险（冻结登记）

> 本节**只发现、记录、分类**，**不顺手修复**（任务书 §十九）。

| # | 风险 | 级别 | 证据 | 后续阶段 |
|---|------|------|------|----------|
| **R1** | 默认 Provider = `grok`，但 `GROK_API_KEY` 未配置 → 活跃 Provider 实际不可用 | 重大 | 01-00 §3.3/§6；01-02 U1 | 运维/业务授权后配置或切换（**AI 不得擅改生产 `.env`**） |
| **R2** | `ai_generation_records` 缺 `skill_id` / `skill_version` 列 | 中 | 01-02 §4/U2；本次复核 `aiGenerationRecordService` | 统一 migration（§14.3），建议与 ACL 一次设计 |
| **R3** | 知识源级 ACL 尚未建立 | 中 | 01-02 §10.2/U3 | 独立授权后最小 migration（§13） |
| **R4** | `/api/hse/ai` 历史双 Router 挂载 | 重大 | 01-00 §7 R2 | 后续统一为一个聚合入口 |
| **R5** | 部分历史 AI 代码绕过 Gateway（`aiEnhancedService` 等） | 重大 | 01-00 §20 R3 | 后续收敛到 `aiGateway` |

**处置分类（冻结）**

| 风险 | 分类 | 处置阶段 |
|------|------|----------|
| R1 | 环境/配置 | 运维授权后（独立生产操作） |
| R2 / R3 | 结构/安全增强 | 统一 migration 计划（建议 SK-003 前） |
| R4 / R5 | 历史技术债 | 独立重构任务（与 Skill 开发解耦） |

---

## 21. SK-005 反向验证（01-01 设计要求 → 实际实现 → 符合度）

### 21.1 逐项复核

| 复核项 | 01-01 设计要求 | SK-005 实际实现 | 符合度 |
|--------|----------------|-----------------|:---:|
| **输入** | 公共字段 + 业务字段分离；必填/范围/枚举校验；结构化错误 | `normalizeInput/validateInput`；question≤1000、top_k 1~10、scope 令牌校验；`AI_INVALID_REQUEST`+details | **符合** |
| **输出** | 公共响应结构（success/skill/request_id/answer/evidence/confidence/warnings/suggestions/metadata） | 完全一致，metadata 含 retrieval/record/usage/disclaimer 等（超最小集） | **符合** |
| **权限** | 身份 + 角色 + 范围收敛 + 资源/知识源权限 | 身份（req.user.id）+ 角色 allowlist（8，逐字一致）+ scope 只收窄 + 源 ACTIVE/文档 READY；**知识源 ACL 缺口** | **部分符合**（ACL 为未来能力，缺口已登记 R3） |
| **Evidence** | 统一证据模型；缺失为 null；不伪造；与 Gateway 同源 | 逐字段映射，缺失 `null`；与 Gateway 同源；**标识字段名为 `citation_id`** | **符合**（命名差异：容许 `citation_id` 为 `evidence_id` 别名） |
| **Prompt** | 入 Registry；记录 key/version | `company.knowledge.answer` v1.0.0 ACTIVE；响应与记录均含 key/version | **符合** |
| **Model Policy** | 不写死；交 Gateway | `MODEL_POLICIES.knowledge_qa.provider=null` | **符合** |
| **Gateway** | 唯一模型出口 | `gateway.generate()`；Skill 内零直连 Provider | **符合** |
| **Provider** | 经 Provider Registry 选择 | 由 Gateway → Provider Registry 解析（T07 验证异常结构化） | **符合** |
| **Record** | request_id/skill_id/skill_version/prompt/provider/model/duration/status/error/evidence/usage | 全量记录；`skill_id/skill_version` 以 `sub_type`+`type` 近似（**无规范列**） | **部分符合**（R2） |
| **Error** | 统一错误模型 + 访问控制错误码分离 | `AI_ERROR_CODES/toErrorResponse` + `SKILL_PERMISSION_DENIED`(403) | **符合** |
| **Audit** | 可回答「这次 AI 为什么得出该结果」 | request_id + prompt_key/version + provider/model + evidence 齐备（失败路径亦落库） | **部分符合**（同上记录列缺口，审计可达但缺规范列） |
| **Human Review** | 按需；人机边界声明 | `disclaimer` + 提示以正式制度/人工审核为准；不强制每次审核 | **符合** |
| **Frontend** | Naive UI；最小功能；复用请求封装 | Naive UI 页面 + `@vben/request`；含输入/提交/回答/引用/置信度/资料不足/加载/错误 | **符合** |

### 21.2 需要调整的架构定义（不修改 SK-005 代码）

| 调整项 | 处理 |
|--------|------|
| Evidence 标识字段命名 | 标准字段定为 `evidence_id`，**正式容许 `citation_id` 别名**（SK-005 无需改动） |
| 「Skill Service」独立层 | v1 允许由 Skill 模块 + 控制器共同承担；≥3 个 Skill 时再评估抽取 |
| Record 的 `skill_id/skill_version` | 列为**目标 schema**；当前允许 `type/sub_type` 近似，缺口 R2 记入统一 migration |
| 知识源级 ACL | 明确为**未来能力**，不计入 v1 强制项；缺口 R3 已登记 |

### 21.3 结论

> **SK-005 可以作为后续 SK-001~SK-004 的标准模板** —— 输入/输出/错误/Prompt/Model Policy/Gateway/Provider/Frontend 已达到标准；权限与记录仅为「未来能力缺口」（R2/R3，已登记且不阻塞）。

---

## 22. 冻结结论

```text
公司 Skill 标准          = 冻结
SK-005 标准样板          = 通过
SK-001 是否可以开始      = 可以
```

**前置条件（进入 SK-001 时必须遵守）**

1. 直接复用本文档标准（§4~§15），**不得重新设计**。
2. 不得以「未实现的知识源 ACL / 记录列」为由阻塞 SK-001，但**不得把它们写成已实现**。
3. R1~R5 均**不在 Skill 开发中顺手修复**，按 §20 分类进入各自阶段。

---

## 23. 本阶段边界与后续

- 本阶段为**架构冻结任务**，**未**开发 SK-001、**未**修改 SK-005、**未**修改数据库、**未**修改生产环境、**未**新增依赖。
- 后续建议：**进入 AI-Phase-01-04 / SK-001（Excel 数据分析）**，按本文档标准实施，并在 ≥3 个 Skill 时复核「Skill Service 抽取」与「统一 migration（R2/R3）」。

---

## 附 A：本报告引用关系

```text
AI-Phase-01-00（审计）──┐
                        ├──► AI-Phase-01-01（本文档，架构冻结）
AI-Phase-01-02（SK-005）┘         │
                                  ├──► SK-001（Excel 数据分析）     Draft
                                  ├──► SK-002（文档解析）           Draft
                                  ├──► SK-003（检查数据分析）        Draft
                                  ├──► SK-004（报告生成）           Draft
                                  └──► SK-005（企业知识问答）       Active ✅ 样板
```

## 附 B：本报告未做的事（明确边界）

- 未修改任何源代码 / 配置 / 路由 / Prompt / 数据库 / 生产环境。
- 未执行任何 migration（R2/R3 仅提出方案）。
- 未修复历史技术债（R4/R5）。
- 未开发 SK-001~SK-004。