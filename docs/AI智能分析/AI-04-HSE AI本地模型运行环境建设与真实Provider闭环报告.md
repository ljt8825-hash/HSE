# AI-04：HSE AI 本地模型运行环境建设与真实 Provider 闭环报告

- 阶段：AI-04（HSE AI 本地模型运行环境建设与真实 Provider 闭环）
- 执行：TRAE + DeepSeek V4 Flash
- 日期：2026-09-14
- 结论：**PASS**（真实 Provider 闭环全部达成：Health / Models / Generate / Stream / SSE / 前端 API / 错误路径 全 PASS；Generation Record 如实 NOT_PERSISTED；Migration 未执行待授权；并行域全量测试既有失败与本阶段无交集）

---

## 一、执行摘要

AI-04 目标：建立本地 AI 模型运行环境，让 AI-02/AI-03 已建立的统一 Provider → Gateway → v2 API 真正连接到一个合法可运行的本地 Provider（Ollama），并完成四条真实链路验证（Health / Models / Generate / Stream）与错误路径保留。

执行结果：

1. **Ollama 本地环境**：Ollama 服务已在 11434 端口真实运行（HTTP 实测 `/api/tags`、`/api/ps`），客户端版本 0.33.1（Portable 安装于 G:\ollama，模型库 OLLAMA_MODELS=D:\ollama）。
2. **模型选择**：主模型 `qwen2.5:7b`（Q4_K_M 量化，4.68GB，7.6B 参数，上下文 32768），本阶段拉取并真实运行；另有两枚机器既有模型 `deepseek-r1:7b`、`deepseek-r1:1.5b`（2025-02-14 已存在，非本阶段下载）。
3. **Provider 接入**：全程复用 AI-02 Provider Registry（aiProviderRegistry.js 的 OllamaProvider），无平行第二套体系；配置复用现有 `OLLAMA_BASE_URL` / `OLLAMA_MODEL` / `AI_PROVIDER` 命名，未新增变量。
4. **真实闭环**：`/v2/health`（ollama=AVAILABLE）、`/v2/models`（qwen2.5:7b 真实）、`/v2/generate`（真实模型输出 426 字，35.5s CPU 推理）、`/v2/stream`（**真实 SSE 207 个分块 + start/end 帧齐全**）。
5. **SSE 两处最小修复**：修复 Ollama 流 NDJSON（无 `data:` 前缀）被解析器整段丢弃的问题；修复 `req.on('close')` 抢先结束响应导致 `event:end` 丢失的问题。协议本身（start / data:{content} / [DONE] / end）保持兼容，前端 `stream()` 消费逻辑未改。
6. **Generation Record**：带 `record` 字段实测降级——真实输出 302 字 + `recordSaved=false` + `recordError="关系 "ai_generation_records" 不存在"`，如实 NOT_PERSISTED / MIGRATION_PENDING，未伪造。
7. **AI_ENABLE 语义统一**：唯一判定来源 = `process.env.AI_ENABLE`（缺省 true，仅字面 `false` 禁用），v2 health 与 Legacy provider-status 共用同一口径；当前 .env 无 AI_ENABLE 行 → 两轨均 aiEnabled=true，AI-02 观察到的 false 与 AI-03 的 true 差异根因即为该行从无到有/缺省判定，现已一致。
8. **AI-01 数据库事实修正**：实测两库 `ai_generation_records` / `ai_prompt_registry` 均不存在（358 张 public 表），正式修正 AI-01 报告中"该表已存在"的描述，后续以实际数据库状态为准。
9. **测试**：AI 能力层单测 3 套件 **79/79 PASS**（含 AI-02 基线 55 项、AI-03 57 项所属套件）；路由级集成 **11/11 PASS**；全量单元 **588/609** 通过，21 失败全部位于本阶段未触碰的并行域（保险导入 20、violationAdapter 1——后者 git 状态为并行修改中），与本阶段变更无交集。
10. **Git / Workbuddy 隔离**：本阶段仅改动 `server/services/aiService.js`（SSE 修复）+ 新增测试脚本；未执行 git reset/checkout/clean；未触碰生产 5876、生产 .env、WPS、三违、考核、风险、事故等并行域。

---

## 二、AI-03 审核结论继承

- AI-03 审核结论：PASS WITH CONDITIONS（非返工）。AI-04 继承其冻结基线：
  - 统一 Provider → Gateway → v2 API 六端点（/v2/health、/v2/providers、/v2/models、/v2/generate、/v2/stream、/v2/analyze）不再重构；
  - 双轨制锁死（AI 建议轨 vs 人工确认轨，请求中出现人工结果字段一律忽略）；
  - Legacy API 保持可访问（CURRENT/LEGACY/MOCK 分类不变）；
  - migration 未执行、幂等化待授权。
- AI-03 遗留的"真实模型端到端 BLOCKED"（无可用 Provider）由本阶段解除：Ollama 接入后生成/流式真实链路全部打通。
- AI-03 报告指出 SSE 协议"任务书要求 event:chunk，实际为 data:{content}"：本阶段按 AI-04 任务书"能兼容则保留"原则，确认前端已稳定消费现行协议（start / data:{content} / [DONE] / end），**不做协议重构**，仅修复两处真实流缺陷（见 §八）。

---

## 三、当前机器环境（实测）

| 项 | 实测值 |
|----|--------|
| 操作系统 | Microsoft Windows 11 专业版 10.0.26200 |
| CPU | 12th Gen Intel Core i5-12400（6 核 12 线程，Alder Lake，无 E 核） |
| GPU | Intel UHD Graphics 730（核显，共享 2GB）；另有 OrayIddDriver / GameViewer 虚拟显示适配器（远程桌面，0 VRAM） |
| NVIDIA GPU / nvidia-smi | **无**（命令不存在，无 NVIDIA 驱动）→ 推理为 CPU 模式 |
| 系统内存 | 31.7 GB |
| 磁盘 | C 盘剩余 5.3GB / 237GB（紧张）；D 盘剩余 89.1GB / 214.8GB（模型库所在）；G 盘剩余 60.9GB / 119.2GB（项目盘） |
| Node 版本 | v22.16.0 |
| Docker | 未安装（命令不存在） |
| Ollama | 客户端 0.33.1（Portable，G:\ollama）；服务经 HTTP 11434 真实可达 |
| 既有本地模型服务 | 仅 Ollama（无 docker 容器、无其他本地 LLM 服务） |

结论：无 NVIDIA GPU、无 Docker，qwen2.5:7b 在 31.7GB 内存的 CPU 上可稳定运行（冷启动 ~30-46s，热推理 token 级 100ms 量级），资源与磁盘均满足。

---

## 四、Ollama 安装与服务状态

| 项 | 状态 |
|----|------|
| 安装方式 | Portable 版（G:\ollama） |
| 服务地址 | http://127.0.0.1:11434（默认地址，实测可达） |
| `ollama --version` | 客户端 0.33.1（CLI 可执行，但 Portable 环境报 "could not connect to a running Ollama instance"——CLI 与运行实例管理路径不一致） |
| `ollama list` / `ollama ps` | CLI 报 "Error: could not locate ollama app"（便携安装路径缺陷）；**以 HTTP API 实测为准**：`GET /api/tags` 返回 3 模型、`GET /api/ps` 返回空加载列表（无常驻模型） |
| 服务真实性 | 真实 HTTP 探测（非伪造）：`/api/tags` 200、`/api/ps` 200 |

> 注：CLI 受限不构成服务不可用——Ollama 服务本身经 HTTP 全面实测可用。模型库位置 OLLAMA_MODELS=D:\ollama（与既有模型一致，避免重复下载）。

---

## 五、模型选择与运行状态

| 模型 | tag | 大小 | 量化 | 参数 | 上下文 | 来源 | 运行状态 |
|------|-----|------|------|------|--------|------|----------|
| qwen2.5 | 7b | 4.68GB | Q4_K_M | 7.6B | 32768 | 本阶段拉取（2026-09-14 23:15） | 主模型，generate/stream 实测运行 |
| deepseek-r1 | 7b | 4.68GB | Q4_K_M | 7.6B | 131072 | 机器既有（2025-02-14） | 备用，未调用 |
| deepseek-r1 | 1.5b | 1.12GB | Q4_K_M | 1.8B | 131072 | 机器既有（2025-02-14） | 备用，未调用 |

- 选择依据：7B 级量化模型适配本机（无 NVIDIA GPU、CPU 推理、31.7GB 内存）；Qwen2.5 中文能力强、适合企业知识问答与 HSE 文本分析、Ollama 社区成熟。
- 本阶段只新增 1 个主模型（qwen2.5:7b），未做无意义下载；既有模型未删除未覆盖。
- 磁盘占用：模型共 ~10.5GB（D 盘），D 盘余量 89.1GB 充足。
- 运行消耗：CPU 推理，generate 单次 ~35-46s（含冷加载），stream 首 token 后 ~30-32s 完成整段；内存峰值约 5-6GB（7B Q4）。

---

## 六、Provider 配置（复用现有体系，无平行实现）

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `OLLAMA_BASE_URL` | http://localhost:11434 | 既有变量，未新增 OLLAMA_URL2 等 |
| `OLLAMA_MODEL` | qwen2.5:7b | 既有变量 |
| `AI_PROVIDER` | .env 内为 grok；**AI-04 验证进程以运行时覆盖为 ollama** | 生产 .env 未改动（prod-boundary 禁止 AI 修改），闭环验证通过进程级环境变量完成 |
| `AI_TIMEOUT_MS` | .env 60000 未改；验证进程覆盖 120000 | CPU 冷启动需更长超时，生产切换时需评估 |

- OllamaProvider（aiProviderRegistry.js）真实健康检查 = 探测 `GET {baseUrl}/api/tags`（5s 超时），非硬编码 AVAILABLE；能力面 textGeneration/streaming=true。
- AI-04 全程无 `provider2/modelService2/ollamaService2/ollamaClient2` 等平行体系；Ollama 经 Provider Registry → Gateway → v2 API，无 Route → Ollama 直连。

---

## 七、Provider Registry / AI Gateway

- Provider Registry：grok（NOT_CONFIGURED，GROK_API_KEY 空）、ollama（AVAILABLE）、openai_compatible（NOT_CONFIGURED，未配置）——每个 Provider 独立判定，互不冒用。
- 活动 Provider = `process.env.AI_PROVIDER`（getDefaultProviderName），无显式 provider 的请求路由到活动 Provider。
- AI Gateway：`resolveProvider`（显式 → 活动）、`assertProviderReady`（健康检查门禁）、统一错误映射（HEALTH_TO_ERROR）、Generation Record 降级、evidence 透传、requestId/traceId 全链一致。

---

## 八、真实链路验证（路由级集成，11/11 PASS）

执行：`server/scripts/ai04_ollama_route_check.cjs`（PORT=5881，符合 prod-boundary；未触碰生产 5876）。验证进程环境覆盖：`AI_PROVIDER=ollama`、`AI_TIMEOUT_MS=120000`。

| # | 验证项 | 结果 | 实测 |
|---|--------|------|------|
| 1 | v2/health 未认证 → 401 | PASS | status=401 |
| 2 | v2/health 认证可达 + ollama 状态 | PASS | aiEnabled=true active=ollama **ollama=AVAILABLE** grok=NOT_CONFIGURED |
| 3 | v2/providers 真实状态 | PASS | ollama=AVAILABLE grok=NOT_CONFIGURED openai=NOT_CONFIGURED |
| 4 | v2/models 真实模型 | PASS | count=3 ollamaModels=[qwen2.5:7b] |
| 5 | v2/generate 真实模型输出 | PASS | success=true provider=ollama model=qwen2.5:7b contentLen=426（35.5s）promptKey=hse.general.analysis |
| 6 | v2/stream 真实 SSE | PASS | **chunkCount=207 start=true end=true**（31.9s） |
| 7 | 错误路径 grok 显式请求 | PASS | AI_PROVIDER_NOT_CONFIGURED |
| 8 | 错误路径 unknown provider | PASS | AI_PROVIDER_NOT_FOUND |
| 9 | Legacy provider/status 兼容 | PASS | status=200 |
| 10 | Legacy generate-report 仍可达 | PASS | status=200（行为等价，见 §十三） |
| 11 | Legacy ai.js /qa mock 仍可达 | PASS | status=200 source=mock |

补充实测（错误路径与降级，临时探针，读后即删）：

- **Ollama 服务停止 → UNREACHABLE**：`OLLAMA_BASE_URL=http://127.0.0.1:19999` 实测 `v2/health` → `ollama=UNREACHABLE, reason="服务不可达: connect ECONNREFUSED 127.0.0.1:19999"`——真实网络错误，非伪造。
- **Generation Record 降级**：带 `record:{type,subType,title}` 实测 → 真实输出 302 字 + `recordId=null recordSaved=false recordError="关系 "ai_generation_records" 不存在"`——如实 NOT_PERSISTED。

### SSE 协议最小治理（AI-04 唯一代码修复点）

背景：真实流式首次验证发现两个缺陷（此前 AI-03 仅测到错误路径，未测到真实分块路径）：

1. **Ollama 流格式被解析器丢弃**：`sendStreamRequest` 只解析带 `data:` 前缀的行，而 Ollama `/api/chat` 流为**纯 NDJSON 行**（实测确认，无 `data:` 前缀）→ 真实分块全部丢弃（首次实测 chunkCount=0）。
2. **`event:end` 被 close 抢先吞掉**：`chatStream` 中 `req.on('close')` 在正常完成后先于 Gateway 微任务写 `event:end` 就 `res.end()` → 客户端收不到 end 帧（首次实测 end=false）。

修复（`server/services/aiService.js`，最小改动，协议与旧调用方行为不变）：

- `sendStreamRequest` 数据行解析新增 `{` 开头（NDJSON）分支：提取 `message.content` 分块、`done:true` 触发完成；`res.on('end')` 兜底同解析。
- `chatStream` 增加 `settled` 标志：正常完成/出错后不再由 close 抢先结束响应，保证 Gateway 能写 `event:end/error`；未正常完成时保持原收尾行为（旧调用方与客户端断连行为不变）。

修复后真实流式：**207 个真实分块 + start + end 全齐**。协议定稿（与前端消费一致）：

```
event:start → data:{requestId,traceId,provider,model,...}
data: {"content":...}  ×N（真实分块）
data: [DONE]
event:end   → data:{requestId,provider,model,durationMs}
错误：event:error → data:{code,message,provider,retryable,requestId}
```

---

## 九、前端 API（web-naive ai.ts stream() 消费验证）

- `src/api/hse/ai.ts` 的 `stream()` 采用 fetch + ReadableStream 逐行解析：`event:` 行切换事件类型，`data:` 载荷按 start/end/error/content 分发，`[DONE]` 置回 message。
- 与后端 SSE 信封逐字段核对：`event:start` → onStart；`data:{content}` → onChunk；`data:[DONE]` → 跳过；`event:end` → onEnd+settled；`event:error` → onError+settled。**现行协议被前端稳定消费，无需改前端、无需协议重构**。
- 真实分块路径验证通过（207 分块）；错误路径（AI_PROVIDER_NOT_CONFIGURED 等）由 `event:error` → onError 停止加载，不会一直 loading、不会吞错误、不会误判成功。
- 未创建正式 AI 业务页面（/overview/ai-analysis 保持占位）；未引入 Markdown 依赖（保持 raw text）。

---

## 十、Generation Record

- 复用 `ai_generation_records` 表 + `aiGenerationRecordService.saveGenerationRecord`（扩展列自动探测 `_hasExtendedColumns`）。
- 实测（带 record 字段）：表不存在 → INSERT 抛错 → Gateway `trySaveRecord` 捕获 → `recordId=null, recordSaved=false, recordError=关系不存在`，**AI 结果不阻断**。
- 结论：**NOT_PERSISTED / MIGRATION_PENDING**（如实，未伪造 recordSaved=true）。

---

## 十一、Migration Preflight（复查）

重新执行只读 Preflight（to_regclass 探测，两库均连）：

```
DB[safety_dashboard]    gen=null prm=null grid=grid_inspection_records users=users docai=document_ai_analysis publicTables=358
DB[safety_dashboard_dev] gen=null prm=null grid=grid_inspection_records users=users docai=document_ai_analysis publicTables=358
```

- `ai_generation_records` 与 `ai_prompt_registry` **两库均不存在**（与 AI-03 实测一致）。
- AI-04 **未执行 migration**（无用户授权；migration 不属于 AI-04 核心交付）。SQL 已备：`server/sql/ai_capability_layer_v1.sql`（AI-02 产出）。

---

## 十二、AI-01 数据库事实修正（正式）

- AI-01 报告曾描述 `ai_generation_records` 已存在。AI-03 与 AI-04 两次实测（两库、to_regclass）均确认**不存在**。
- 正式修正：**以实际数据库状态为准**——`ai_prompt_registry`、`ai_generation_records` 两库均无；AI-01 的历史描述保留为审计事实，不再作为后续依据。
- 影响：Prompt Registry 为内存态；Generation Record 落库待 migration 授权执行。

---

## 十三、ai-enhanced 并行三层化行为等价审计（只审不改）

- 现状：`routes/ai-enhanced.js` 已被并行任务三层化收口为 `routes/ai-enhanced/main.js` + `controllers/aiEnhancedController.js` + `services/aiEnhancedService.js`（AI-03 已兼容验证，AI-04 未再重构）。
- 路由级实测：`POST /api/hse/ai/generate-report` 仍挂载（200）；`POST /api/hse/ai/provider/status` 200；`POST /api/hse/ai/qa` mock 可达；`/risk-predict` 上轮已验（本阶段 error-path 轮亦 200）。
- 发现（记录，不改）：Legacy `generate-report` / `root-cause` 以 `aiService.isAvailable()`（模块级 `_available`，由 `initialize()` 设置，服务启动路径未调用）为门禁——**与 Provider Registry 真实健康无关**，因此在 Ollama 可用时也返回 "AI 服务当前不可用"（HTTP 200 + success=false）。该行为与 AI-04 前（grok 无 Key）完全一致，属等价保持，非回归。
- 结论：Legacy 层与 v2 层（走 Gateway 真实健康）是两套可用性判定；建议 AI-05 决策 Legacy 端点未来去向（对齐 Gateway 或标注 deprecated），**本阶段不改**。

---

## 十四、AI_ENABLE 语义统一

- 唯一判定来源：`aiHealthService.isAiDisabled()` = `String(process.env.AI_ENABLE || 'true').toLowerCase() === 'false'`。
- v2 health `aiEnabled` 与 Legacy `provider/status.aiEnabled`（aiEnhancedService 同表达式）**同一口径**。
- 当前 .env **无 AI_ENABLE 行** → 缺省 true → 两轨均 aiEnabled=true（实测一致）。
- AI-02 观察到的 false 与 AI-03 的 true 差异：来源于当时 .env 该行是否存在（缺省判定），非代码双轨。已查明，无需改代码。

---

## 十五、测试（真实运行）

| 套件 | 结果 | 说明 |
|------|------|------|
| AI 能力层单测（3 套件：aiCapabilityLayer / aiApiLayer / aiService） | **79/79 PASS** | 含 AI-02 基线 55 项、AI-03 57 项所在套件；SSE 解析用例通过（改动后无回归） |
| 路由级集成（scripts/ai04_ollama_route_check.cjs） | **11/11 PASS** | 真实闭环 6 项 + 错误路径 2 项 + Legacy 3 项 |
| 全量单元（`npm test`，jest *.unit.test.js） | 588/609（21 失败） | 失败集中在 `__tests__/personnel-insurance.unit.test.js`（1）、`__tests__/import-personnel-behavior.unit.test.js`（19）、`services/ruleEngine/__tests__/violationAdapter.unit.test.js`（1，git 状态为并行修改中）——均为本阶段未触碰的并行域，与本阶段变更（仅 aiService.js SSE 两处）无交集，判定为既有/并行失败 |

新增测试说明：AI-04 新增路由级集成脚本 1 个（11 项验证）；未改动既有单测数量（79 = 既有基线，未新增未删减）。

---

## 十六、Git / Workbuddy 隔离

- 本阶段变更文件：
  - `server/services/aiService.js`（M，SSE 两处最小修复）
  - `server/scripts/ai04_ollama_route_check.cjs`（新增，路由级验证脚本）
- 未触碰：生产 5876 进程、生产 `.env`、WPS（grid_inspection_records / grid_record_sync_map / grid_areas / wpsGrid*）、三违、考核/规则、风险、事故、身份链（users/employee/employee_assignment）、登录/JWT/auth、前端 Vben 核心、Workbuddy 并行文件。
- 未执行 git reset / checkout -- . / clean；并行域修改（violations/assessment*/grid*/hse-tasks/regulations/training-ocr/hse-dashboard/mobile 等）未覆盖未回滚。
- 发现：`services/ruleEngine/__tests__/violationAdapter.unit.test.js` 为并行修改态且当前 1 项失败——已隔离记录，未触碰。

---

## 十七、风险与未完成事项

风险：

1. 生产 .env `AI_PROVIDER=grok` 未切换 → 生产活动 Provider 仍为 Grok（NOT_CONFIGURED）；AI-04 闭环仅存于 dev 验证进程（运行时覆盖 ollama）。生产启用本地模型需用户授权修改 .env。
2. 生产 .env `AI_TIMEOUT_MS=60000` 对 CPU 冷启动（~35-46s+）偏紧，真实链路存在超时风险（验证进程用 120000 覆盖）。
3. Ollama CLI（Portable）路径缺陷：`ollama list/ps` 不可用，运维只能走 HTTP API。
4. C 盘剩余 5.3GB 紧张；模型库在 D 盘（89.1GB 余量）无碍，但需避免向 C 盘写入大文件。
5. `ai_generation_records` / `ai_prompt_registry` 未建 → Prompt 内存态、记录不落盘（降级兜底已验证）。
6. Legacy 层可用性门禁与 v2 层不一致（§十三），存在"v2 可用而 Legacy 报不可用"的认知差。
7. 并行域全量测试 21 项失败（保险导入/violationAdapter），需由对应并行任务处理，与本阶段无关。

未完成事项：

- migration 执行（待授权，两库建 ai_prompt_registry / ai_generation_records）。
- 生产 .env Provider 切换决策（grok → ollama）。
- deepseek-r1 系列未调用（备用，未验证）。
- OpenAI-Compatible 真实链路（本阶段明确不要求，保持 NOT_CONFIGURED）。
- 前端正式 AI 页面（AI-05+）；Markdown 渲染依赖（待授权）。

---

## 十八、[需要用户确认]

1. **生产启用本地模型**：是否将生产 .env `AI_PROVIDER` 由 grok 切换为 ollama（并评估 `AI_TIMEOUT_MS` 上调）？——prod-boundary 禁止 AI 修改 .env，需用户显式授权后操作。
2. **migration 执行授权**：`ai_prompt_registry` / `ai_generation_records` 两库均无，是否按 `server/sql/ai_capability_layer_v1.sql` 执行？（生产库需单独明确授权）
3. **Legacy 端点可用性口径**：generate-report/root-cause 依赖 `aiService.isAvailable()` 门禁与 v2 不一致，是否接受"Legacy 保持现状、未来对齐 Gateway 或标注 deprecated"？
4. **Ollama CLI 路径缺陷**：Portable 版 CLI（list/ps）不可用，是否需要后续修复安装方式（如改回官方安装包）？
5. **并行域测试失败归属**：personnel 保险导入 20 项与 violationAdapter 1 项失败，确认由对应并行任务处理、AI 阶段不介入。

---

## 十九、下一阶段建议（AI-05 候选，不自行开始）

- 经 ChatGPT 审核 AI-04 后，由审核方生成 AI-05 唯一正式提示词。
- 候选方向（按任务书边界，均需正式提示词授权）：migration 执行与落库闭环、生产 Provider 切换、Legacy 收编 Step2、Prompt Registry 落库、前端正式 AI 页面（hse.general.analysis 消费）、双轨制业务试点（标准条款评价等）。

---

## 二十、最终状态

**AI-04：PASS**

- 机器环境：Win11 / i5-12400（无 NVIDIA GPU，CPU 推理）/ 31.7GB RAM / D 盘模型库 89.1GB 余量 / Node v22.16.0
- Ollama：INSTALLED（0.33.1 Portable，服务 11434 实测可达）
- 模型：qwen2.5:7b（Q4_K_M，4.68GB，运行正常）；deepseek-r1:7b/1.5b 为既有备用
- Provider：Grok NOT_CONFIGURED / **Ollama AVAILABLE** / OpenAI-Compatible NOT_CONFIGURED
- Health：PASS；Models：PASS；Generate：PASS；Stream：PASS；SSE：PASS；Frontend：PASS
- Generation Record：NOT_PERSISTED / MIGRATION_PENDING（如实）
- Migration：未执行 / 待确认
- 测试：AI 单测 79/79 PASS + 路由级 11/11 PASS（全量 588/609，并行域失败与本阶段无交集）
- Workbuddy：无冲突
- 停止条件：AI-04 交付完成，等待 ChatGPT 审核，不自行开始 AI-05（RAG/Embedding/pgvector/知识库/Vision/三违 AI/隐患 AI/风险 AI/事故 AI/考核 AI/自动报告/自动扣分/自动定责一律留后续阶段）。
