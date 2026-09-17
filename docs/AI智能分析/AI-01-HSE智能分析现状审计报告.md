# AI-01 HSE 智能分析现状审计报告

> 阶段：AI-01 现状审计（只审计、只分析、只形成报告，零代码修改）
> 执行：Trae + DeepSeek V4 Flash
> 审计日期：2026-09-14
> 项目基准目录：`G:\hse-dashboard`（已确认存在，为实际开发基准）
> 审计方式：本地只读扫描 + git 状态核查 + 关键文件精读 + 三路并行审计代理
> 约束遵守：本阶段未修改任何业务代码、未改数据库、未安装任何依赖/模型、未触碰 WPS/三违/登录/权限

---

## 1. 执行摘要

现有 HSE 系统已具备一套**真实的 AI 基础设施雏形**，但存在「能力分散、可用性存疑、无统一 AI 能力层」三大问题：

- ✅ **已实现**：Grok/Ollama 双 Provider 抽象（`server/services/aiService.js`）、SSE 流式输出、AI 报告生成/根因分析、文档 AI 分析（PDF/Excel）、培训台账 OCR（Python 子进程）、AI 生成历史记录、标准化评价 AI 辅助 + **AI/人工双轨字段已落地数据库**。
- ⚠️ **半可用**：当前 `server/.env` 中 `AI_PROVIDER=grok` 但 `GROK_API_KEY` 为空，运行时 `isAvailable()` 大概率返回不可用；Ollama 代码层支持但未确认本机是否安装运行。
- ❌ **未实现**：真实 AI 页面（前端 `/overview/ai-analysis` 为静态占位）、图片/视觉 AI、RAG/知识库、Prompt 版本统一管理、除 Grok/Ollama 外的模型 Provider（DeepSeek/Claude/OpenAI 均不支持）。
- 🔴 **关键风险**：`/api/hse/ai` 前缀被 `routes/ai.js`（4 个规则/模拟端点）与 `routes/ai-enhanced.js`（6 个真实端点）**双重挂载**；生产部署脚本仍指向 `web-antd` 而开发实际运行 `web-naive`（Naive UI）；Workbuddy 正在并行执行 WPS 台账 + 三违责任关系生产迁移（今日仍在产出 artifacts），本次审计已完整隔离其工作范围。

**结论：AI-01 完成。系统具备 AI 能力层的「地基」，但当前不可作为正式 AI 能力对外交付；下一阶段建议 AI-02 设计统一 AI 能力层架构（详见第 25 节），本报告将交 ChatGPT 审核后再生成 AI-02 唯一正式提示词。**

---

## 2. 当前项目真实目录

| 项目 | 结论 |
|---|---|
| 项目根目录 | `G:\hse-dashboard`（存在，`.git` 正常，确认是实际开发基准） |
| 后端目录 | `G:\hse-dashboard\server`（唯一入口 `app.js`，CommonJS） |
| 前端目录 | `G:\hse-dashboard\安全看板vben`（Vben 5.7.0 monorepo，活跃应用 `apps/web-naive`） |
| 数据库脚本 | `G:\hse-dashboard\sql\`（历史 schema）+ `G:\hse-dashboard\server\sql\`（现行迁移脚本主战场，200+ 个 SQL） |
| 文档目录 | `G:\hse-dashboard\docs\`（含 `Naive UI\`、`191副\` 等）；`docs\AI智能分析\` **已存在但为空**（本次审计创建文件） |
| 并行任务痕迹 | `G:\hse-dashboard\.workbuddy\`（Workbuddy 的 artifacts/memory，见第 21 节） |

---

## 3. 当前前端技术栈

依据 `安全看板vben\apps\web-naive\package.json` + `安全看板vben\pnpm-workspace.yaml`（catalog 解析后实际版本）：

| 依赖 | 版本 | 证据 |
|---|---|---|
| Vue | 3.5.34 | pnpm-workspace.yaml catalog |
| Vben（vue-vben-admin） | 5.7.0 | apps/web-naive/package.json |
| TypeScript | （Vben 内置，5.x） | monorepo 结构 |
| Pinia | 3.0.4 | catalog |
| vue-router | 5.0.7 | catalog |
| @vueuse/core | 14.3.0 | catalog |
| 构建工具 | Vite（Vben 内置） | 根 package.json `build:naive`/`dev:naive` |

- 路由：`src/router/routes/modules/*.ts`，含 `hse.ts`、`hse-site.ts`、`hse-accidents.ts`、`hse-training.ts` 等约 20 个模块。
- API 层：`src/api/hse/*.ts`（约 60 个文件），请求客户端为 `@vben/request`（基于 axios），`src/api/request.ts` 导出 `requestClient`，统一 `responseReturn: 'data'`。
- 状态管理：`src/store/auth.ts`（唯一 pinia store，认证相关）。
- 文件/图片上传：Naive `NUpload`/`NUploadDragger` 经 `src/adapter/component/index.ts` 统一注入；已用于 `HseImportDialog.vue`、`views/accidents/index.vue`（事故附件上传）、`views/risk-control/components/RiskDetailDrawer.vue`、`views/emergency/plans/index.vue`。
- 图片预览组件：**未发现**（仅有上传，无统一图片预览）。
- Markdown 渲染：**未发现**任何 markdown 渲染依赖（无 markdown-it / v-md-editor / md-editor-v3 / marked）。
- 登录/权限：`src/store/auth.ts`、`src/router/guard.ts`、`src/router/access.ts`、`src/api/core/auth.ts`（本阶段只定位，不触碰）。

---

## 4. 当前 UI 技术栈

**结论：当前实际 UI 技术栈 = Naive UI（版本 2.44.1），与用户确认一致。**

证据链：
1. `apps/web-naive/package.json` 依赖含 `"naive-ui": "catalog:"`，catalog 解析为 `^2.44.1`。
2. `apps/web-naive/AGENTS.md` 明示 "This application is the target of the HSE Naive UI migration"，且强制约束「Do not import `ant-design-vue` under `src`」。
3. 实际源码使用：`src/adapter/naive.ts`、`src/adapter/component/index.ts`（`defineAsyncComponent(() => import('naive-ui/es/upload'))` 等按需引入 Naive 组件）、各页面实际使用 `NUpload`/`NUploadDragger`。
4. monorepo 中另有 `apps/web-antd`、`apps/web-ele`、`apps/web-tdesign`、`apps/web-antdv-next` 为 Vben 官方多 UI 模板，**当前未用于 HSE 业务开发**。

**⚠️ 发现的不一致（需用户确认）**：
- 生产/部署脚本仍指向 `web-antd`：`安全看板vben\scripts\build-prod.ps1`（第 35 行 `$AppDir = ...\apps\web-antd`）、`build-prod.sh`（第 19 行）、`start-dev.sh`（第 11 行）。而开发与迁移工作在 `web-naive` 进行。→ `[需要用户确认]`：生产环境实际部署运行的是 `web-naive` 还是 `web-antd`？若是 web-naive，部署脚本属待修正技术债（本次不改）。

---

## 5. 当前后端技术栈

依据 `server\package.json`：

| 类别 | 内容 |
|---|---|
| 运行时 | Node.js（CommonJS，唯一入口 `server\app.js`） |
| Web 框架 | Express ^4.19.2 |
| 数据库驱动 | pg ^8.22.0（PostgreSQL） |
| 校验 | Zod ^4.4.3（devDependencies） |
| 日志 | Winston ^3.19.0 + morgan |
| 定时任务 | node-cron ^4.6.0（月度考核周期自动创建等） |
| WebSocket | ws ^8.21.1 |
| 文件上传 | multer ^1.4.5-lts.1（`middleware/upload.js` 带文件类型校验 + 中文文件名修复） |
| 文件解析 | pdf-parse ^2.4.5（保险 PDF 解析）、xlsx ^0.18.5（多处导入/导出）、**无 DOCX 文本解析库（mammoth 未引入）** |
| 安全 | helmet、cors、express-rate-limit、bcrypt/bcryptjs、jsonwebtoken |
| 测试 | Jest ^30 + supertest（`jest.config.js` / `jest.integration.config.js` 为活跃配置） |

中间件（`server\middleware\`）：auth.js（JWT + requireRole）、encryption.js、upload.js、requestLogger.js、queryLogger.js、cache.js、error.js、response.js（统一 `success()/error()`）、validate.js、tenant.js。

架构现状：核心域已普遍三层化（route=纯绑定 / controller=薄 handler / service=业务+SQL），大量大型路由文件已完成拆分（git log 可见 Phase B 系列交付，截至 2026-09-13 已拆 20+ 域）。

---

## 6. 当前数据库

| 项目 | 结论 |
|---|---|
| 数据库 | PostgreSQL（库名 `safety_dashboard`，版本号未在代码/脚本中确认）→ `[需要用户确认]` |
| Schema 来源 | 历史 `sql\unified_schema.sql`、`sql\auth_schema.sql` 等 + `server\sql\` 下 200+ 迁移脚本（现行主战场） |
| 身份链 | users → employee → employee_assignment（权威口径见项目记忆，本阶段未触碰） |
| 核心业务表（已确认存在于迁移脚本） | `grid_inspection_records`、`grid_record_sync_map`、`grid_areas`、`hse_assessment_rule`、事故（accidents + attachments/versions）、隐患（hazard 相关）、三违（violation 相关 + sanwei 系列）、培训（training 系列）、考核（assessment_* 系列）、人员风险（risk_profile 系列） |
| 生产边界 | 端口 5876 生产后端 + 生产 `.env`（`server\.env`）受项目生产边界规则保护，本审计只读未触碰 |

> 注：`grid_areas`、`grid_record_sync_map`、`users` 的建表 SQL 未出现在 `server\sql\` 检索结果中（可能建于更早 schema 或由 Workbuddy 迁移脚本维护）→ `[需要用户确认]` 完整 schema 来源。

---

## 7. AI 现状

**核心 AI 服务层：`server\services\aiService.js`（约 980 行，未三层化，属 AI 领域核心资产）**

| 能力 | 现状 | 证据 |
|---|---|---|
| 模型调用 | 真实 HTTP 调用外部模型 | `buildGrokRequest()` POST `{baseUrl}/chat/completions`（L489-515）；`buildOllamaRequest()` POST `{baseUrl}/api/chat`（L523-550） |
| Provider 抽象 | **存在但仅 2 种**：grok / ollama | `initialize()` 明确「仅支持 grok 或 ollama」（L572-577） |
| 流式输出 | ✅ SSE 支持 | `chatStream()` 设 `text/event-stream`（L721-724），`res.write()` 分块（L744），结束发 `[DONE]`（L750） |
| Prompt 管理 | 部分：`PROMPT_TEMPLATES` 对象含多模板，**无统一版本号**；仅文档 AI 有 `PROMPT_VERSION='v1.0'` | aiService.js；documentAiService.js L10 |
| 证据来源 | 仅标准化评价落 `ai_evidence`；报告/根因分析未落 | standardEvaluationService.js L653-666 |
| 可用性 | **当前存疑**：`.env` 中 `AI_PROVIDER=grok` 但 `GROK_API_KEY=` 为空 → `isAvailable()` 大概率 false | aiService.js L561-567；server/.env（只读） |

**关键判断（对应任务十一的 13 问）：**

| # | 问题 | 结论 |
|---|---|---|
| 1 | AI 智能分析页面是否真实可用 | ❌ 前端 `/overview/ai-analysis` 是静态占位（硬编码数字 + 「功能开发中，敬请期待」） |
| 2 | AI API 是否真实可调用 | ⚠️ 端点存在（/api/hse/ai/*），但默认 Provider 配置为空键，真实调用取决于运行时配置 |
| 3 | 真正调用模型还是模拟数据 | 混合：ai-enhanced 端点走真模型调用；`routes/ai.js` 的 `/qa` 是 mock、`/risk-predict` `/classify` `/anomaly-detect` 是统计/关键词规则（非 LLM） |
| 4 | 是否支持 Ollama | 代码层支持（默认 `http://localhost:11434`，模型 `qwen2.5:7b`）；**本机是否安装/运行未确认** |
| 5 | 是否存在模型 Provider 抽象 | 存在 `aiService.js`，仅 grok/ollama 两实现 |
| 6 | 能否切换云端/本地模型 | 能通过 `AI_PROVIDER` 环境变量切换 grok（云）⇄ ollama（本地）；不支持其他云端 |
| 7 | 是否支持流式输出 | ✅ 后端 SSE 已实现；前端消费链路未发现 |
| 8 | 是否支持图片 | ❌ AI 路由不支持图片输入；仅 OCR 管道接受图片 |
| 9 | 是否支持文档 | ✅ PDF/Excel 文本提取 → AI 分析（documentAiService）；DOCX 仅上传识别未解析 |
| 10 | 是否支持 RAG | ❌ 无向量库、无检索 |
| 11 | 是否具备 HSE 知识库 | ❌ 无知识库表；存在 `document_files` 文件库 + `hse_standard` 条款库可作为未来知识源 |
| 12 | 是否有 Prompt 版本管理 | ⚠️ 仅文档 AI 有 `prompt_version` 字段（v1.0）；报告/根因无版本 |
| 13 | 是否记录证据来源 | ⚠️ 仅标准化评价有 `ai_evidence`/`ai_evidence_files`；报告/根因分析未记录 |

---

## 8. AI API 现状

### 挂载事实（`server\app.js` 精读）
- L438：`app.use('/api/hse/ai', aiRoutes)` ← `routes/ai.js`（旧）
- L439：`app.use('/api/hse/ai', aiEnhancedRoutes)` ← `routes/ai-enhanced.js`（新）——**同一前缀双重挂载**
- L377：`app.use('/api/training-ocr', trainingOcrRoutes)`
- **不存在** `/api/hse/ai-enhanced` 挂载点（ai-enhanced 实际挂在 `/api/hse/ai` 下）

### 端点清单

**`routes/ai.js`（旧，`/api/hse/ai/*`）— 历史遗留/规则与模拟：**

| 方法 | 路径 | 性质 | 判断 |
|---|---|---|---|
| POST | /api/hse/ai/risk-predict | 统计规则 | 非模型，遗留 |
| POST | /api/hse/ai/classify | 关键词规则 | 非模型，遗留 |
| POST | /api/hse/ai/anomaly-detect | 统计方法 | 非模型，遗留 |
| POST | /api/hse/ai/qa | **Mock 数据**（L364-372） | 模拟，遗留 |

**`routes/ai-enhanced`（新，已三层化完成，`/api/hse/ai/*`）：**

| 方法 | 路径 | 性质 | 判断 |
|---|---|---|---|
| POST | /api/hse/ai/generate-report | 调 aiService.chat()/chatStream() | 在用候选（需 admin/safety_manager） |
| POST | /api/hse/ai/root-cause | 调 aiService.chat() | 在用候选 |
| GET | /api/hse/ai/records | AI 生成历史 | 在用候选 |
| GET | /api/hse/ai/records/:id | 单条详情 | 在用候选 |
| DELETE | /api/hse/ai/records/:id | 删除 | 在用候选 |
| POST | /api/hse/ai/provider/status | Provider 状态 | 在用候选 |

**`routes/training-ocr`（已三层化完成，`/api/training-ocr/*`，7 端点）：** recognize / export / confirm / confirm-signin / signin-sessions / signin-sessions/:id / export-signin。

### 判断（对应任务八）
1. 已存在：ai-enhanced 6 端点 + ai.js 4 端点 + training-ocr 7 端点。
2. 重复：`/api/hse/ai` 前缀双重挂载（ai.js 与 ai-enhanced.js 同前缀，路径未直接冲突但组织混乱）。
3. 正在使用：无前端真实页面调用 ai-enhanced（前端 AI 页为占位）；OCR 已被培训台账使用。
4. 历史遗留：ai.js 的 4 端点（规则/mock）。
5. 可复用：`aiService`（chat/chatStream/重试/provider 状态）、`ai_generation_records` 历史管理、`documentAiService` 管道、OCR 管道、multer 上传中间件。
6. 以后统一：建议后续统一为单一 `ai` 域（ai.js 并入或废弃，见第 23 节）。
7. 绝对不能现在删除：ai-enhanced 全部端点（真实模型链路 + 生成历史），training-ocr 全部端点（培训台账在用）。

---

## 9. AI 数据库现状

| 表/扩展 | 来源文件 | 关键字段 |
|---|---|---|
| `ai_generation_records` | `server\sql\ai_tables.sql` | user_id、type(report/rca/classify/predict)、sub_type、title、prompt、result、provider(grok/ollama)、model、input/output_tokens、duration_ms、status、error_message |
| `document_ai_analysis` | `server\sql\document_ai_analysis.sql` | status、analysis_basis、prompt_version(v1.0)、ai_summary、ai_score、ai_risk_level、**ai_suggestions、ai_missing_items**、ai_keywords、ai_provider/model、**confirmed_status/confirmed_by/confirmed_at（人工轨）** |
| `document_files.latest_ai_analysis_id` | 同上 | 最新 AI 分析缓存 |
| `standard_evaluation_tasks` 扩展 | `server\sql\hse_standard_evaluation_ai_v56_migration.sql` | ai_started_at/completed_at、ai_total/completed/failed_items、ai_summary（注释：**仅辅助，不作为最终结论**）、prompt_version |
| `standard_evaluation_items` 扩展 | `server\sql\hse_standard_v54_migration.sql` + v56 | **AI 轨**：ai_verdict、ai_check_result(JSONB)、ai_evidence、ai_suggestion、ai_confidence、ai_findings、ai_missing_items、ai_evidence_files、ai_processed_at、ai_error；**人工轨**：compliance_status、manual_remark、checked_by、checked_at |

**AI 相关表覆盖情况（对应任务九）：**
- ✅ 已存在：AI 结果表（standard_evaluation_items 扩展）、AI 建议字段（ai_suggestion/ai_suggestions）、AI 证据字段（ai_evidence/ai_evidence_files）、AI 发现项（ai_findings）、AI 缺项（ai_missing_items）、AI 置信度（ai_confidence）、AI 任务表（document_ai_analysis）、AI 日志/历史（ai_generation_records）、人工确认字段（compliance_status/checked_by/checked_at/manual_remark）。
- ❌ 不存在：知识库表、向量表、RAG 相关表、图片/视觉 AI 结果表、Prompt 版本表（版本仅字符串字段）。
- ⚠️ `ai_verdict`、`compliance_status` 等字段定义在迁移脚本 v54/v56 中，**仅存在于 standard_evaluation 域**；三违/隐患/事故等其他域没有 AI 结果字段。

---

## 10. AI 双轨制现状

**结论：数据库层已按双轨制落地（标准化评价域），与任务十的设计要求一致。**

`standard_evaluation_items` 表（`server\sql\hse_standard_v54_migration.sql`）：

```sql
-- AI 轨（仅辅助）
ai_verdict VARCHAR(20) DEFAULT 'unknown'     COMMENT 'AI建议状态（仅辅助，不作为最终结论）'
ai_evidence TEXT                             COMMENT 'AI证据链摘要'
ai_suggestion TEXT                           COMMENT 'AI整改建议'
ai_confidence DECIMAL(5,2)
-- 人工轨（最终结果）
compliance_status VARCHAR(20) DEFAULT 'pending' COMMENT '最终合规状态（人工确认后设置）'
manual_remark TEXT
checked_by BIGINT                            COMMENT '人工确认人'
checked_at TIMESTAMPTZ
```

- 代码层（`standardEvaluationService.js`）保存 `ai_evidence`/`ai_evidence_files`，`compliance_status` 由人工确认环节写入。
- 索引设计分离：`idx_eval_item_task_ai_verdict`、`idx_eval_item_ai_verdict`（AI 轨）与 `idx_eval_item_compliance_status`（人工轨）分开。

**待加强点：**
- 该双轨模式目前仅覆盖「标准化评价」域；隐患/三违/事故等域的 AI 建议（如 `hazardRectificationService` 的 AI 建议）未统一采用 ai_* 字段结构。
- AI 轨与人工轨的「状态机流转」（AI 建议 → 人工审核 → 最终结果）无统一服务封装，散落各域。
- `document_ai_analysis` 使用 `confirmed_status` 而非 `compliance_status` 命名，命名不统一（技术债）。

---

## 11. 视觉能力现状

| 能力 | 现状 | 证据/位置 |
|---|---|---|
| 图片上传 | ✅ 有 | 事故附件上传（`views/accidents/index.vue` → `uploadAccidentAttachment`）、风险详情抽屉 NUpload、`middleware/upload.js`（含类型校验） |
| 图片存储 | ✅ 有 | `uploads\` 目录 + document/附件存储 |
| 图片 URL | ⚠️ 部分 | 附件接口可返回 URL（事故附件等），无统一媒体服务 |
| 图片预览 | ❌ 未发现统一预览组件 | 前端无图片预览组件实现 |
| 图片 OCR | ⚠️ 培训台账专用 | `training-ocr` 管道接受 PNG/JPG/JPEG/BMP/WebP + PDF（非通用 OCR 服务） |
| 图片分析接口 | ❌ 无 | 无视觉模型调用 |
| 现场/隐患/三违/事故图片 | ⚠️ 部分存在上传（事故、风险），无 AI 分析 | — |

**未来视觉模型接入点建议（仅分析，不开发）：**
1. 在 `server\services\` 新增视觉服务（如 `visionService.js`），对接未来 VL 模型（本地 Qwen3-VL 或云端 API），保持与 `aiService` 同构的 Provider 抽象。
2. 复用现有 `middleware/upload.js` + `uploads\` 存储 + 附件表，为「现场检查/隐患/三违/事故图片」增加统一图片附件能力（当前事故域已有先例）。
3. 前端补统一图片预览组件（Naive NImage 经 adapter 注入），AI 页面展示「图片 → AI 识别 → 证据 → 人工确认」链路。
4. 视觉输出沿用双轨制：`ai_*` 字段只写 AI 建议轨道，正式三违/隐患结论必须人工确认（见第 23 节架构）。

---

## 12. OCR 现状

- **实现方式**：Python 子进程（`server\services\trainingOcrService.js` 调 `scripts\ocr_ledger.py`、`scripts\training_signin_ocr.py`，`spawn` + 超时保护）。
- **支持格式**：PDF、PNG、JPG、JPEG、BMP、WebP；上传上限 200MB。
- **用途**：培训台账识别（`/api/training-ocr/recognize`）、签到表识别（`/training/ledger/signin/recognize`）、确认入库、Excel 导出。
- **已三层化**：2026-09-13 完成 route/controller/service 拆分（git 与 `docs\191副\②交付报告` 有据）。
- **风险**：依赖本机 Python 环境与 OCR 依赖包（PaddleOCR/Tesseract 类）→ `[需要用户确认]` OCR 运行环境（Python 版本、依赖、是否随生产部署）。
- **定位**：OCR 是「文字提取」能力，不属于 LLM；未来视觉 AI 的「识图理解」与之互补而非替代。

---

## 13. 知识库现状

- ❌ **无知识库/RAG 表**（grep `knowledge`/`rag` 无业务表命中）。
- ⚠️ 可成为知识源的存量资产：
  - `document_files` + `document_ai_analysis`：安全资料文件库（PDF/Excel/Word 上传 + AI 分析任务，`server\sql\document_ai_analysis.sql`），已有「安全资料文件库 / AI 分析」文案。
  - `hse_standard` 系列：标准/条款库（`standard_evaluation` 评价域、`hse_standard_v54_migration.sql`），含 ai_enabled。
  - `规章制度` 域（regulations，已三层化）与 `standards` 域（条款库、匹配建议）。
- 判断：知识库「数据源」存在，「知识化（切分/向量化/检索）」完全未实现。

---

## 14. RAG 现状

- **完全未实现**：无向量数据库、无 embedding、无检索/召回、无上下文增强。
- 现有「文档 AI」是「整文提取 → 一次性送入 LLM」模式（`analysis_basis: full_text/metadata_only/filename_only`），适合小文档，长文档无切分。
- 未来 RAG 需新增：文档切分器、embedding 服务（本地小模型如 bge-m3 或云端 API）、向量存储（pgvector 可与现有 PostgreSQL 融合）、检索接口。

---

## 15. 模型 Provider 现状

| 项 | 现状 |
|---|---|
| 抽象位置 | `server\services\aiService.js`（provider 分支：grok / ollama） |
| 云端 | Grok（`{baseUrl}/chat/completions`），依赖 `GROK_API_KEY` |
| 本地 | Ollama（`{baseUrl}/api/chat`），默认 `http://localhost:11434` + `qwen2.5:7b` |
| 切换方式 | 环境变量 `AI_PROVIDER`（当前 `.env` = `grok`，key 为空） |
| 不支持 | DeepSeek、OpenAI、Anthropic Claude、OpenAI 兼容协议、Grok 兼容模式 |
| 能力缺口 | 无超时/重试统一策略（部分有）、无模型健康探针页面、无成本统计 |

**结论**：存在「最小 Provider 抽象」，但不可视为「统一 AI 能力层」——它只解决「两家 API 的封装」，不包含视觉、RAG、工具调用、Prompt 版本、证据链等 AI 工程能力。

---

## 16. Ollama 现状

- **代码层支持**：`aiService.js` 已实现 Ollama 客户端（`POST /api/chat`，兼容 OpenAI 风格 payload）。
- **本机状态**：未确认 Ollama 是否已安装/运行（本阶段不安装不探测）→ `[需要用户确认]`：开发机是否已有 `localhost:11434` 服务？后续 AI-02 是否允许安装 Ollama？
- **默认模型名**：`qwen2.5:7b`（代码默认值）。

---

## 17. 现有 AI 页面现状

| 页面 | 路径 | 现状 |
|---|---|---|
| AI 智能分析 | `/overview/ai-analysis`（路由 `views\hse\ai-analysis\index.vue`，菜单「AI智能分析」，图标 lucide:brain-circuit） | **静态占位**：标题 + 硬编码统计卡（模型数量 12 / 分析次数 3580 / 预警准确率 92 / 风险预测数 86）+「风险预测分析/智能预警列表/模型准确率/异常行为识别/安全趋势预测」卡片均显示「功能开发中，敬请期待」，**不调用任何 API** |
| 培训台账 OCR | 培训域页面 | 真实调用 `/training-ocr/*`，在用 |
| 标准化评价 AI | standards 域（standard_evaluation） | 后端 AI 辅助已实现（ai_* 字段），前端调用链路存在但本次审计未逐页核实交互细节 |

**结论：无任何真实可用的「AI 智能分析」页面。** 前端无 AI 组件库、无流式渲染、无 Markdown 渲染（AI 报告展示能力缺失）。

---

## 18. 现有 AI 代码复用点

1. `server\services\aiService.js` — chat / chatStream(SSE) / provider 状态 / 重试逻辑（AI 层核心，应作为统一能力层地基）。
2. `ai_generation_records` + ai-enhanced records 端点 — AI 调用历史/审计（可直接承载「AI 日志」）。
3. `server\services\documentAiService.js` + `document_ai_analysis` — 文档解析 → AI 分析 → 人工确认闭环（异步任务模式可推广）。
4. `server\services\standardEvaluationService.js` — ai_evidence/ai_suggestion 落库模式（双轨制范本）。
5. `server\routes\ai-enhanced\` 三层化结构 — 新 AI 域的可复制骨架。
6. `server\services\trainingOcrService.js` + Python 子进程模式 — 本地 OCR 管道。
7. `server\middleware\upload.js` + multer — 通用上传（含中文文件名修复、类型校验、魔术字节）。
8. `server\middleware\auth.js` requireRole — AI 写接口的角色保护（generate-report/root-cause 已用）。
9. `server\config\hseRules\` — 规则配置（未来「HSE 规则」参与 AI 判断的依据源）。

---

## 19. 重复代码

| 重复项 | 位置 | 说明 |
|---|---|---|
| `/api/hse/ai` 双重挂载 | `app.js` L438-439 | `ai.js`（4 规则/mock 端点）与 `ai-enhanced.js`（6 真实端点）同前缀并存 |
| Mock/规则 AI 与真实 AI 并存 | `routes/ai.js` vs `routes/ai-enhanced.js` | `/qa` 返回假数据，若前端误接会造成「AI 是假的」认知 |
| Prompt 版本管理不统一 | `documentAiService.js`（PROMPT_VERSION v1.0）vs `aiService.js`（PROMPT_TEMPLATES 无版本） | 同一 Prompt 体系两套实现 |
| 人工确认字段命名不一致 | `document_ai_analysis.confirmed_status` vs `standard_evaluation_items.compliance_status` | 双轨制字段命名未统一 |

---

## 20. 技术债

1. **Provider 可扩展性差**：`aiService.js` 的 provider 分支是 if/else 结构，新增 DeepSeek/Qwen/OpenAI 兼容需改核心文件。
2. **可用性悬空**：`.env` 中 `AI_PROVIDER=grok` + `GROK_API_KEY` 空 → 生产/开发 AI 端点「配了但不可用」。
3. **前端 AI 页为占位**：菜单已上、页面是假的，属「半成品入口」。
4. **无流式前端消费**：后端 SSE 已就绪，前端无 `fetch/ReadableStream` 消费封装。
5. **无 Markdown 渲染**：AI 报告只能以纯文本展示，无法渲染表格/证据链。
6. **无统一图片附件/预览**：仅事故域有附件上传先例，隐患/三违/现场检查图片未统一。
7. **OCR 依赖本机 Python**：生产部署需 Python 环境（未确认部署形态）。
8. **部署脚本指向 web-antd**：与开发使用的 web-naive 不一致（见第 4 节）。
9. **ai_verdict 等字段仅覆盖标准化评价域**：其他域的 AI 结果无双轨字段。
10. **`routes/ai.js` 遗留**：mock 端点 `/qa` 等易误导，需在统一层设计时决策（废弃/迁移），**本阶段不删**。

---

## 21. Workbuddy 并行任务保护清单

**Workbuddy 当前正在执行（今日 2026-09-14 仍有产物）：P2-B1-E-08-04 系列「三违责任关系落地 + 扣分规则库 + 生产迁移」以及 WPS 台账（P2-B0）迁移。**

### 21.1 保护范围（本阶段及后续 AI 阶段均不得触碰）

| 保护类别 | 具体对象 |
|---|---|
| WPS 同步/台账 | `grid_record_sync_map`、`grid_inspection_records`、`grid_areas`、`wps_account_employee_map`、`wps_account_employee_map` 相关；`routes\wps-grid-sync.js`、`routes\wps-dbsheet.js`、`services\wpsGridSyncService.js`、`wpsGridSyncScheduler.js`、`wpsGridPullEngine.js`、`wpsGridMigrationService.js`、`services\wps\*`（wpsFieldMap/wpsDbsheetAdapter/gridInspectionService/gridDataSource/gridEnrichmentService/wpsCreatorExtractor/wpsErrors） |
| WPS 迁移脚本 | `server\sql\20260912_arch03_p2b0_*.sql`（bridge/indexes/sync_map_ext/grid_inspection_ext）、`20260910_grid_inspection_identity_chain_phase0.sql`、`_p2b0_migrate.cjs`、`_p2b0_continue_migrate.cjs`、`_pgsource01b_migrate.cjs` |
| 三违/扣分规则库 | `violationService.js`、`violationCheckerScope.js`、`violationController.js`、`routes\violations\*`、`ruleEngine\adapters\violationAdapter.js`、`violationUnrectifiedAdapter.js`、`violationTargetResolver.js`、`deductionWriter.js`、`sanweiBehaviorDict.js`、`sanweiLedgerDerive.js`、`sanweiAnalysisImport.js`、`sanweiAdminRoster.js`、`routes\hse-sanwei-analysis.js`、`config\hseRules\violation-rule.json`、`gridViolationCandidateService.js`、`gridAttributionService.js`、`gridScope.js`、`gridCompletionService.js`、`services\ruleEngine\*` |
| 三违迁移/修复脚本 | `p2b1e0804*_dev_migration.cjs`、`p2b1e0804*_tests.cjs`、`_exec3_r4_migration.cjs`、`_exec5_scope_migration.cjs`、`_e0808_*`、`_e0809_*` 系列 |
| 三违前端 | `安全看板vben\apps\web-naive\src\views\site\violation\index.vue`、`views\site\violation\candidates\`、`views\site\grid\attribution\`、`views\site\grid\attributed\`、`api\hse\violations.ts`、`grid-attribution.ts`、`grid-violation-candidates.ts`、`router\routes\modules\hse-site.ts` |
| 考核/风险联动 | `assessmentEventService.js`、`assessmentScheduler.js`、`assessmentMonthly*Service.js`、`assessmentTargetEligibility.js`、`assessmentScoringEngine.js` |
| 事故台账 | `accidents` 系列（Workbuddy 事故管理 artifacts 仍在用） |
| Workbuddy 工作区 | `G:\hse-dashboard\.workbuddy\` 全部 |

### 21.2 AI 后续若依赖上述对象的处理规则
按任务要求：**不自行修改**，在报告中记录「依赖对象 / 为什么需要 / 当前状态 / 潜在冲突 / 建议解决方案」，交用户决策。当前未发现 AI-01→AI-02 必须依赖 WPS/三违数据的硬需求（AI 现状审计已可独立完成）；后续若 AI 要消费三违/网格数据做分析，仅做**只读**查询，并需用户确认 Workbuddy 迁移完成后再接入。

---

## 22. AI 项目风险清单

| 风险 | 等级 | 说明 | 缓解 |
|---|---|---|---|
| AI 端点「配了不可用」 | 高 | `.env` provider 空键 | AI-02 先解决可用的模型凭证或本地 Ollama，再谈页面 |
| 前端 AI 占位页可能被误认为已上线 | 高 | 硬编码假数据 | 页面标注「未接入」或隐藏入口，避免误导（需用户决策） |
| 双重挂载 `/api/hse/ai` | 中 | 组织混乱，未来统一层可能路径冲突 | AI-02 架构中规划合并/废弃 ai.js |
| Workbuddy 并行冲突 | 高 | 三违/WPS 迁移进行中 | 严格遵守第 21 节保护清单，任何交集先问用户 |
| 生产数据边界 | 高 | 生产 5876/生产 `.env`/生产业务表 | 遵守 prod-boundary 规则，AI 仅只读查询，写库需单次授权 |
| OCR 依赖本机 Python | 中 | 部署环境未确认 | AI-02 确认生产 OCR 环境 |
| 无视觉/无 RAG | 中 | 能力缺口大 | 分阶段建设，先文字后视觉 |
| AI 双轨制未全覆盖 | 中 | 仅标准化评价域 | 统一 ai_* 字段规范，逐步推广 |
| 部署脚本与开发应用不一致 | 中 | web-antd vs web-naive | 用户确认实际生产前端后修正 |

---

## 23. 推荐总体架构

**目标：形成统一 HSE AI 能力层（非聊天机器人），严格保留人工审核闭环。**

```
┌─────────────────────────── HSE 前端（Naive UI web-naive）───────────────────────────┐
│  AI智能分析页(重写) │ 风险分析 │ 三违/隐患分析 │ 事故分析 │ 趋势分析 │ 文档/RAG │ 报告 │
└──────────────┬───────────────────────────────────────────────────────────────────┘
               │  @vben/request + SSE 流式
┌──────────────▼───────────────────────────────────────────────────────────────────┐
│                  HSE AI 能力层（新增统一域，如 routes/ai + services/ai/）              │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────────┐        │
│  │ ChatService│ │ VisionService│ │ RagService │ │ ReportService│ │ EvidenceService │  │
│  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └───────┬───────┘        │
│        └──────────────┴────────────┴────────────┴───────────────┘                │
│        ▼ 统一 ModelProvider（扩展 aiService：grok/ollama/deepseek/qwen/…）           │
│        ▼ 统一 PromptRegistry（版本化、可审计） + Token/成本统计                        │
│        ▼ 统一证据链（ai_evidence/ai_findings/来源文件/置信度）                        │
└──────────────┬───────────────────────────────────────────────────────────────────┘
               │ 只写 AI 建议轨道（ai_*），绝不写 compliance_status 等最终结果
┌──────────────▼───────────────────────────────────────────────────────────────────┐
│         HSE 业务域（风险/隐患/三违/事故/培训/考核）—— 只读消费 AI 建议                 │
│         人工审核 → 写入最终结果（compliance_status/checked_by/checked_at…）           │
└───────────────────────────────────────────────────────────────────────────────────┘
```

**架构原则（对应任务十四「模型不是 HSE 判断依据」）：**

```
业务数据 + HSE规则 + HSE知识库 + 算法模型 + LLM + 视觉模型
        → AI 综合分析 → AI证据 + AI建议 → 人工审核 → 正式 HSE 结果
```

1. **数据流单向**：AI 层只产出「建议/证据」，最终合规状态只由人工确认写入。
2. **双轨字段规范**：以 `standard_evaluation_items` 的 ai_verdict/ai_evidence/ai_suggestion/ai_confidence + compliance_status/manual_remark/checked_by/checked_at 为统一范本，推广到隐患/三违/事故域。
3. **Provider 抽象扩展**：在 `aiService.js` 基础上抽象统一 Provider 接口（list/chat/chatStream/embed/image），支持 OpenAI 兼容协议（可复用 DeepSeek/Qwen/本地 vLLM/Ollama）。
4. **能力域独立**：VisionService（视觉）、RagService（知识库）、ReportService（自动报告）各自独立，共用 Provider 与证据链。
5. **前端配套**：SSE 流式消费封装、Markdown 渲染组件（经 Vben adapter 注入）、统一图片预览（NImage）、AI 分析页真实重写。

---

## 24. 推荐模型方向

**硬件约束**：Intel i5-12400（6C/12T，AVX2）+ 32GB DDR4-2666 + 无独立大显存 GPU。
内存预算：Windows 11 + PostgreSQL + Node 常驻约 8~12GB，模型可用内存约 **18~22GB**；CPU 推理受内存带宽（约 42GB/s）制约。

| 模型级别 | 量化后体积(Q4) | 内存可行性 | CPU 速度(估) | 结论 |
|---|---|---|---|---|
| 文字 7B/8B（Qwen3-8B 类） | ~4.5-5.5GB | ✅ 充裕 | ~3-6 tok/s | **推荐本地主力**：批量离线分析、敏感数据不出内网、RAG 检索后精读 |
| 文字 14B（Qwen3-14B 类） | ~8-9GB | ✅ 可行 | ~1.5-3 tok/s | 备选：离线长文本批处理（可接受慢） |
| 文字 30B 级 | ~17-19GB | ⚠️ 挤压系统内存 | ~0.5-1.5 tok/s | **不推荐**：内存吃紧 + 速度不可用 |
| MoE（Qwen3-30B-A3B / Qwen3.6-35B-A3B） | ~18-20GB | ⚠️ 同 30B | 有优化空间但内存超预算 | 不推荐（内存超标） |
| 视觉 3B/4B（Qwen3-VL-4B 类） | ~2.5-3.5GB | ✅ 可行 | 单图数秒~十几秒 | **推荐本地视觉主力**：单据 OCR、简单场景分类 |
| 视觉 7B/8B（Qwen3-VL-8B 类） | ~5.5-6.5GB | ✅ 可行 | 较慢 | 备选：复杂场景识图（现场隐患判断需谨慎，仍须人工确认） |

> 模型生态背景（2026 年）：Qwen3-VL 已发布 4B/8B 轻量版本，面向边缘部署，具备与更大模型竞争的基础视觉-语言能力 [$TRAE_REF](https://blog.csdn.net/gitblog_00622/article/details/154370976)[$TRAE_REF](https://blog.csdn.net/weixin_29155599/article/details/157045455)；7B/8B 级 Q4 量化模型在 CPU 上可运行；14B 级在消费级 GPU 上需 24GB 或 INT8 量化，32B 级基本是 24GB 显卡 INT4 的极限 [$TRAE_REF](http://m.toutiao.com/group/7680509656241898024/)；MoE 类模型（如 Qwen3.6-35B-A3B）配合 llama.cpp 推测解码/KV 量化在 CPU 上仍有优化空间，但 35B 总参数量化后内存已超本机预算 [$TRAE_REF](http://m.toutiao.com/group/7654407216228860462/)。

**推荐组合（AI-02+ 逐步落地，本阶段不安装）：**
1. **日常交互主力**：云端 API（DeepSeek / 通义千问等 OpenAI 兼容接口）——快、支持流式、质量高、免硬件负担。
2. **本地文字基线**：7B/8B 级 Q4（Qwen3-8B 类，llama.cpp/Ollama 运行），用于批量离线分析、敏感数据、断网兜底。
3. **本地视觉基线**：Qwen3-VL-4B（Q4）起步，实测不达标再升 8B；复杂识图走云端。
4. **RAG embedding**：本地 bge-m3 类小模型（<1GB）或云端 embedding API；向量库用 pgvector（与现有 PostgreSQL 融合，不引入新数据库）。
5. **明确不选**：30B 级及以上的任何本地模型（内存+速度双不达标）。

---

## 25. 下一阶段建议

**AI-02（建议方向，具体以 ChatGPT 审核后生成的正式提示词为准）：**
- 设计并落地「统一 HSE AI 能力层」骨架：扩展 ModelProvider 抽象（增加 OpenAI 兼容协议，覆盖 DeepSeek/Qwen）、统一 PromptRegistry（版本化）、统一证据链数据结构。
- 先解决「AI 端点可用性」：确认/配置可用模型凭证或本机 Ollama（需用户授权），验证 `aiService` 真实调用 + SSE。
- 前端：新增 SSE 流式消费封装 + Markdown 渲染组件（Vben adapter 注入），重写 `/overview/ai-analysis` 为真实页面（只读展示，可挂「未启用模型时显示配置提示」）。
- 数据库：设计 ai 域统一表（如 ai_analysis_tasks 通用任务表 + ai_evidence_items 证据表），**不修改现有业务表**，仅新增。
- 严守边界：不碰第 21 节保护清单；不写生产业务表；所有 AI 结果只进 AI 轨。
- 本阶段结束验收：AI-01 报告交 ChatGPT 审核，**由 ChatGPT 生成 AI-02 唯一正式提示词**，AI-01 不自行开始 AI-02。

---

## 26. 明确哪些事情目前不能做

**本阶段（AI-01）已遵守、且对 AI 后续阶段同样生效的禁令：**
1. 不修改登录页 / JWT / 认证 / 权限核心 / Vben 核心目录。
2. 不引入新 UI 框架 / 新状态管理框架 / 大规模重构 / 修改稳定业务模块。
3. 不触碰 WPS 台账数据、WPS 同步机制、三违迁移、`grid_inspection_records`、`grid_record_sync_map`、`wpsGrid*` 服务、Workbuddy 正在处理的三违代码（第 21 节全清单）。
4. 不修改生产数据库现有业务数据；不修改生产 `.env`；不启停生产 5876。
5. 不安装模型 / Ollama / 新 npm 包 / 不修改 package.json。
6. 不新增/修改 AI 页面、AI API（AI-02 之前）。
7. 不删除任何现有 AI 端点（含 ai.js 遗留 mock 端点——即使可疑，删除决策留给统一层设计）。
8. 不自行决定「看不懂/不确定」的事项（见下方确认清单）。

---

## 附录：需要用户确认清单

| # | 事项 | 发现 | 无法判断原因 | 需用户提供 | 确认后下一步 |
|---|---|---|---|---|---|
| 1 | 生产实际前端应用 | 部署脚本指向 web-antd，开发在 web-naive | 未运行生产构建/未查 nginx 配置 | 生产实际运行哪个 app | 若 web-naive：AI 前端统一按 Naive UI 推进，部署脚本列入技术债 |
| 2 | AI Provider 运行时配置 | `.env` `AI_PROVIDER=grok` 且 `GROK_API_KEY` 空 | 运行时状态取决于部署机 | 是否有可用模型凭证/是否允许用本地 Ollama | AI-02 按确认结果配置可用 Provider |
| 3 | 本机 Ollama | 代码支持、未确认安装 | 本阶段禁止探测/安装 | 是否已装/是否允许安装 | AI-02 决定本地模型落地方式 |
| 4 | PostgreSQL 版本/库名 | 库名 safety_dashboard、版本未知 | 只读审计未连库 | 版本号 | 影响 pgvector 等能力评估 |
| 5 | `/api/hse/ai` 双重挂载是否有意 | app.js L438-439 双挂载 | 两模块路径未冲突 | 是否有意保留 ai.js | 统一层设计时决定合并/废弃 |
| 6 | grid_areas / grid_record_sync_map / users 建表来源 | 不在 server\sql 检索结果 | schema 可能建于更早或由 Workbuddy 维护 | 建表 SQL 位置 | 确认后补全 AI 只读依赖分析 |
| 7 | OCR 运行环境 | Python 子进程模式 | 未确认生产环境 | Python 版本/依赖/部署形态 | 确认 OCR 可持续性 |
| 8 | ai-enhanced 拆分归属 | 已三层化但未提交（git 未提交状态） | 可能是 Workbuddy 或历史会话产物 | 归属确认 | AI-02 以现有拆分结构为准继续 |
| 9 | AI 占位页处置 | /overview/ai-analysis 假数据 | 属产品决策 | 隐藏/标注「未接入」/保留 | AI-02 按决策处理 |

---

*本报告基于 2026-09-14 只读审计完成；所有结论均有文件路径证据，未做任何代码/数据库/配置修改。*
