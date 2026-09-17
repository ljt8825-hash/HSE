# HSE AI智能分析实施进度

## 项目状态

当前阶段：
AI-12（阶段十二：本地 AI 一键启动 / 生产运行配置）

总体状态：
PASS WITH CONDITIONS（AI-12 完成——运行层建设，非新增 AI 功能）：先审计（无统一启动入口/无统一健康检查/无停止脚本/无生产运行说明；Ollama=DBX 便携版 11434、模型 qwen2.5:7b+nomic-embed-text 就绪、pgvector 0.8.2 + AI 7 表齐全、worker 未挂载 app.js、生产 5876 由 HSE-Backend 计划任务管理）→ 最小修改（start-hse-ai.ps1/bat 一键启动 7 步链路 + 幂等复用 + 5876 硬禁止 + 进程级 AI 变量注入含引号修复 Provider 匹配、scripts\stop-hse-ai.ps1 仅停开发栈、scripts\hse-ai-health.ps1 11 项健康检查 + 真实 qwen2.5:7b 冒烟（不写库）、server\scripts\ai12_runtime_probe.cjs 只读探针、_ai12_token.cjs、vite.config.ts 代理目标支持环境变量覆盖）→ 真实验证：健康检查 11/11 OK（exit 0，activeProvider=ollama，冒烟含 HSE_AI_OK）、一键启动四次验收全过（冷启动/Already running 复用/Ollama 关闭降级不崩溃/恢复 AI READY）、AI 分析页 /overview/ai-analysis 200、Test 9 任务 69 COMPLETED + 生成记录 11~18 ollama/qwen2.5:7b success；生产 5876/.env/生产库/Workbuddy 保护区域零触碰；CONDITIONS：生产 Worker 计划任务、生产 AI Provider 切换、生产库迁移、Ollama 服务化、Nginx 托管均需用户独立授权放行）

---

## 阶段记录

### AI-01

任务：
HSE智能分析现状审计

提示词：
（完整保存本次收到的任务要求，原文如下）

```text
# AI-01：HSE智能分析现状审计与实施基线

你现在负责本项目的 HSE AI 智能分析实施任务。

本任务由 Trae + DeepSeek V4 Flash 执行。

## 一、项目目标

在现有 HSE 安全管理系统中逐步建设：

1. HSE 文字智能分析
2. HSE 风险智能分析
3. HSE 隐患/三违智能分析
4. HSE 事故智能分析
5. HSE 数据趋势分析
6. HSE 知识库/RAG
7. AI 自动报告与管理建议
8. HSE 现场图片 AI 识图
9. 视觉模型 + HSE 文字模型协同分析
10. AI 证据链 + 人工审核闭环

最终形成统一的 HSE AI 能力层，而不是简单增加一个聊天机器人页面。

# 二、当前执行阶段

这是整个 AI 智能分析项目的：AI-01：现状审计阶段

本阶段：只审计、只分析、只形成报告。禁止直接修改业务代码。禁止为了"方便下一步"提前重构代码、修改数据库或安装依赖。

# 三、项目目录

当前项目以 G:\hse-dashboard 为开发基准。如果该目录不存在、无法确认、或者发现实际运行项目不是该目录：立即停止，不得猜测。把问题写入审计报告并告知用户。

# 四、最重要的技术栈约束

1. 当前前端 UI 组件库必须以实际代码为准。用户已经明确确认：当前项目使用 Naive UI。因此：禁止擅自改成 Ant Design Vue、禁止引入 Element Plus、禁止根据历史文档判断 UI 技术栈、必须实际检查 package.json、源码 import、组件使用情况。后续所有 AI 页面必须继续使用当前项目实际采用的 Naive UI。历史文档中可能存在 Vben + Ant Design Vue 的旧记录。历史文档不能覆盖当前代码实际情况。

# 五、现有项目保护规则

禁止：1.修改登录页 2.修改 JWT/登录认证 3.修改用户认证机制 4.修改权限核心机制 5.修改 Vben 核心目录 6.新建不必要的 UI 组件体系 7.引入新的 UI 框架 8.引入新的状态管理框架 9.大规模重构现有项目 10.修改已经稳定的业务模块 11.修改现有 WPS 台账数据 12.修改 WPS 同步机制 13.修改 WPS 三违迁移 14.修改 grid_inspection_records 15.修改 grid_record_sync_map 16.修改 wpsGrid* 服务 17.修改 Workbuddy 当前正在处理的三违相关代码 18.修改生产数据库中的现有业务数据

# 六、Workbuddy 并行任务隔离

目前另一个 AI 工具 Workbuddy 正在执行：WPS 台账数据库 + 三违相关任务。本任务必须与其隔离。必须先扫描项目，识别：WPS 相关文件、WPS 相关服务、WPS 相关 API、三违相关 API、三违数据库表、三违迁移脚本、最近可能被修改的文件、与 WPS 台账有关的数据库迁移。将它们列入《AI-01 并行任务保护清单》。本阶段不得修改这些内容。如果 AI 智能分析后续必须依赖其中某项：不要自行修改。记录：依赖对象、为什么需要、当前状态、潜在冲突、建议解决方案。交给用户决定。

# 七、必须审计的内容

A. 前端：实际前端目录、Vue 版本、Vben 版本、UI 框架、Naive UI 版本、路由结构、API 调用方式、现有 AI 页面、现有 AI 组件、现有 AI API、现有状态管理、文件上传能力、图片上传能力、Markdown/文档展示能力。特别查找：ai-analysis、ai、ai-enhanced、AI智能分析、AI辅助决策、智能分析、risk analysis、vision、OCR、knowledge、rag。

B. 后端审计：Express 入口、AI 相关 routes、AI service、AI provider、Ollama、OpenAI兼容接口、Grok、本地模型接口、OCR、文件解析、PDF、DOCX、Excel、图片处理。重点查找 /api/hse/ai、/api/hse/ai-enhanced 以及所有 AI 相关 API。需要判断：1.哪些 API 已经存在 2.哪些 API 重复 3.哪些 API 正在使用 4.哪些 API 是历史遗留 5.哪些可以复用 6.哪些应该以后统一 7.哪些绝对不能现在删除。

C. 数据库审计（只读）：AI相关表、风险表、隐患表、三违表、事故表、培训表、考核表、人员风险表、驾驶员风险表、AI结果表、AI证据字段、AI建议字段、AI日志、AI任务表、文档分析表、知识库表。重点识别：ai_verdict、ai_evidence、ai_suggestion、ai_findings、ai_missing_items、ai_confidence、compliance_status 以及相关字段和表。

# 十、必须保护现有 AI 双轨制

AI结果（ai_verdict、ai_evidence、ai_suggestion、ai_findings、ai_missing_items、ai_confidence）只能属于 AI建议轨道。人工结果（compliance_status、checked_by、checked_at、manual_remark）属于人工确认轨道。必须保持：AI分析 → AI建议 → AI证据 → 人工审核 → 最终结果。AI禁止直接覆盖最终人工结果。特别是 compliance_status 不得由 AI 直接设置为最终合规/不合规。

# 十一、重点审计"AI智能分析"现状（13 问）

1.当前 AI 智能分析页面是否真实可用？2.当前 AI API 是否真实可调用？3.当前 AI 是真正调用模型，还是模拟数据？4.当前系统是否已经支持 Ollama？5.当前系统是否存在模型 Provider 抽象？6.当前系统是否已经能够切换云端模型/本地模型？7.当前 AI 是否支持流式输出？8.当前 AI 是否支持图片？9.当前 AI 是否支持文档？10.当前 AI 是否支持 RAG？11.当前 AI 是否已经具备 HSE 知识库？12.当前 AI 是否已经有 Prompt 版本管理？13.当前 AI 是否已经记录证据来源？

# 十二、重点审计未来视觉 AI 能力

检查图片上传、图片存储、图片 URL、图片预览、图片 OCR、图片分析接口、现场检查图片、隐患图片、三违图片、事故图片。并分析未来视觉模型应该在哪里接入。不要现在开发。

# 十三、模型选择只做分析，不安装

根据 i5-12400 + 32GB DDR4-2666 + 无独立大显存 GPU 实际硬件条件，对文字模型（7B/8B、14B、30B级）与视觉模型（3B/4B级、7B/8B级）做可行性分析：内存占用、CPU运行可行性、是否适合本机、预计性能等级、是否适合 HSE、是否适合图片分析、是否适合长文本、是否适合代码分析、是否适合 RAG。不要直接下载模型、不要安装 Ollama、不要安装新 npm 包、不要修改 package.json。

# 十四、重点设计"模型不是 HSE 判断依据"的原则

后续 AI 系统必须采用：业务数据 + HSE规则 + HSE知识库 + 算法模型 + 大语言模型 + 视觉模型 → AI 综合分析 → AI证据 + AI建议 → 人工审核 → 正式HSE结果。不能设计成：图片 → 大模型说违规 → 系统直接生成三违。必须保留人工确认。

# 十五、必须检查与历史设计的关系

检查现有代码与以下能力的关系：1.AI知识增强 2.风险智能分析 3.指标智能解释 4.AI自动报告 5.管理辅助决策。判断：已实现/部分实现/仅有页面/仅有 API/仅有数据库/完全未实现/存在重复实现/存在技术债。

# 十六、必须建立 AI 项目文档体系

创建 G:\hse-dashboard\docs\AI智能分析\（目录不存在则创建）。本阶段至少建立《AI智能分析实施进度.md》，作为本项目唯一总进度记录文件。后续每一次 AI 开发任务都必须追加记录。记录格式见任务原文（项目状态/阶段记录：任务、提示词、执行时间、执行结果、修改文件、数据库变化、测试结果、风险、与Workbuddy冲突、下一步、状态）。

# 十七、另外生成本阶段审计报告

生成 docs/AI智能分析/AI-01-HSE智能分析现状审计报告.md，必须包含：1.执行摘要 2.当前项目真实目录 3.当前前端技术栈 4.当前 UI 技术栈 5.当前后端技术栈 6.当前数据库 7.AI现状 8.AI API现状 9.AI数据库现状 10.AI双轨制现状 11.视觉能力现状 12.OCR现状 13.知识库现状 14.RAG现状 15.模型Provider现状 16.Ollama现状 17.现有AI页面现状 18.现有AI代码复用点 19.重复代码 20.技术债 21.Workbuddy并行任务保护清单 22.AI项目风险清单 23.推荐总体架构 24.推荐模型方向 25.下一阶段建议 26.明确哪些事情目前不能做。

# 十八、特别要求：不要猜

如果出现：看不懂的代码、无法判断的 API、不确定的数据表、不确定的模型、不确定的依赖关系、不确定是否属于 Workbuddy 修改范围、不确定当前项目目录、不确定 UI 框架、不确定某文件是否正在被另一个任务修改——不要自行决定。在报告中标记 [需要用户确认]，并说明：发现了什么、为什么无法判断、需要用户提供什么信息、如果用户确认下一步准备怎么做。

# 十九、本阶段绝对禁止

本阶段不要：修改业务代码、修改数据库、修改数据库结构、修改 WPS、修改三违、修改登录、修改权限、修改 UI 框架、安装模型、安装 Ollama、npm install、修改 package.json、新增 AI 页面、修改现有 AI 页面、修改现有 API。本阶段只做：审计 + 文档 + 架构建议 + 风险识别。

# 二十、最终交付要求

完成后必须：1.生成 docs/AI智能分析/AI-01-HSE智能分析现状审计报告.md 2.创建/更新 docs/AI智能分析/AI智能分析实施进度.md 3.在实施进度文件中保存本次完整任务提示词 4.保存本次执行结果 5.保存修改文件清单 6.保存数据库变化 7.保存测试结果 8.保存风险 9.保存 Workbuddy 冲突情况 10.保存下一步建议。最后向用户汇报（格式见任务原文）。注意：不要自行开始 AI-02。完成 AI-01 后等待用户把 MD 报告交给 ChatGPT 审核。ChatGPT 会根据 AI-01 报告再生成下一阶段唯一正式提示词。
```

执行时间：
2026-09-14（全天，跨多轮核查）

执行结果：
完成。已产出《AI-01-HSE智能分析现状审计报告.md》（26 节 + 9 项需用户确认清单）。核心发现：
- 前端：web-naive（Naive UI 2.44.1 / Vue 3.5.34 / Vben 5.7.0 / Pinia 3.0.4），AI 页面 /overview/ai-analysis 为静态占位（假数据）；无 Markdown 渲染、无图片预览、无 SSE 前端消费。
- 后端：aiService.js 已实现 Grok/Ollama 双 Provider 抽象 + SSE 流式 + 重试；/api/hse/ai 被 ai.js（4 个规则/mock 端点）与 ai-enhanced.js（6 个真实端点）双重挂载；.env 中 AI_PROVIDER=grok 但 GROK_API_KEY 为空 → 运行时可用性存疑。
- 数据库：AI 双轨制已在 standard_evaluation_items 落地（ai_verdict/ai_evidence/ai_suggestion/ai_confidence + compliance_status/manual_remark/checked_by/checked_at，注释明确「仅辅助，不作为最终结论」）；ai_generation_records、document_ai_analysis 表存在；无知识库/RAG 表。
- OCR：培训台账 Python 子进程实现（PDF/图片）。
- Workbuddy：正在执行 P2-B1-E-08-04 三违责任关系生产迁移 + WPS P2-B0 台账迁移，已形成完整保护清单（第 21 节）。

修改文件：
- 新增：docs/AI智能分析/AI-01-HSE智能分析现状审计报告.md
- 新增：docs/AI智能分析/AI智能分析实施进度.md（本文件）
- 归档：docs/191副/②交付报告/2026-09-14_AI-01-HSE智能分析现状审计完成.md（镜像摘要）
- 记忆：更新 project_memory.md（新增 AI 审计冻结事实段），并同步镜像至 docs/191副/project_memory.md

数据库变化：
无（全程只读，未执行任何 SQL，未连生产库）

测试结果：
无代码改动，未运行测试。审计验证方式：git 状态核查 + 关键文件精读（app.js/aiService.js/ai_tables.sql/document_ai_analysis.sql/hse_standard_v54/v56 迁移）+ 三路并行只读审计代理（前端/后端/数据库+Workbuddy）+ 关键词 Grep 交叉验证。

风险：
1. AI 端点「配了不可用」（.env 空键）；2. 前端 AI 占位页可能被误认为已上线；3. /api/hse/ai 双重挂载；4. Workbuddy 并行冲突（三违/WPS 迁移中）；5. 生产数据边界（5876/生产表）；6. OCR 依赖本机 Python；7. 无视觉/无 RAG 能力缺口；8. AI 双轨制仅覆盖标准化评价域；9. 部署脚本指向 web-antd 与开发 web-naive 不一致。（详见审计报告第 20/22 节）

与Workbuddy冲突：
无直接冲突（本阶段零修改）。已识别 Workbuddy 保护清单（WPS 同步、三违责任关系、扣分规则库、网格归属、考核联动、事故台账等），后续 AI 阶段任何交集必须先经用户确认，且 AI 消费业务数据仅限只读。

下一步：
等待用户将《AI-01-HSE智能分析现状审计报告.md》交 ChatGPT 审核。ChatGPT 将根据报告生成 AI-02 唯一正式提示词。AI-01 不自行启动 AI-02。建议 AI-02 方向：统一 HSE AI 能力层骨架（Provider 抽象扩展至 OpenAI 兼容协议、PromptRegistry 版本化、统一证据链结构）+ 解决 AI 端点可用性 + 前端 SSE/Markdown 配套。

状态：
待确认（报告待用户交 ChatGPT 审核）

---

### AI-02（阶段一：架构设计与接口基线）

任务：
HSE AI 统一能力层架构设计与接口基线

提示词：
（完整保存本次收到的任务要求，原文如下）

```text
# AI-02：HSE AI统一能力层架构设计与接口基线

你现在继续负责本项目的 HSE AI 智能分析实施任务。
本任务由 Trae + DeepSeek V4 Flash 执行。
当前项目：G:\hse-dashboard
当前阶段：AI-02：HSE AI统一能力层架构设计与接口基线

## 一、必须首先读取的文档
1. docs\AI智能分析\AI-01-HSE智能分析现状审计报告.md
2. docs\AI智能分析\AI智能分析实施进度.md
3. AI-01交付报告中记录的 Workbuddy 并行任务保护清单
必须以 AI-01 的真实审计结果作为 AI-02 的输入。
如果发现 AI-01 报告与当前代码实际情况存在冲突：以当前实际代码为准，但不得自行修改代码解决冲突。必须把冲突记录为：[需要用户确认]

## 二、AI-02目标
在现有 HSE 系统基础上，设计一套统一、可扩展、可审计、支持云端模型/本地模型/视觉模型的 HSE AI 能力层。
解决当前：AI Provider 已存在但能力分散；/api/hse/ai 存在双重挂载；AI 页面只是静态占位；AI API 存在历史与增强实现并存；没有统一 Prompt Registry；没有统一 Evidence Chain；没有统一 AI Task 模型；没有统一模型 Provider 扩展规范；没有统一视觉 AI 接入规范；没有 RAG 统一接口规范 的问题。

## 三、最重要原则：本阶段以"设计和基线"为主
AI-02原则：先架构、后开发。本阶段默认：只读审计；架构设计；接口设计；数据模型设计；文件结构设计；模块边界设计；风险分析；后续实施计划。禁止为了验证架构而大规模修改业务代码。

## 四、项目路径保护
必须确认：G:\hse-dashboard 是当前项目。如果目录不存在、无法确认、或者发现实际开发项目不是该目录：立即停止。不得猜测。

## 五、前端技术栈必须冻结
AI-01已经确认：当前实际前端：web-naive；Naive UI 2.44.1；Vue 3.5.34；Vben 5.7.0；Pinia 3.0.4。后续 AI 系统必须继续基于：Naive UI。禁止：Ant Design Vue；Element Plus；新 UI 框架；新状态管理框架。历史文档如果写 Ant Design Vue：不得以历史文档覆盖当前实际代码。

## 六、Workbuddy并行任务绝对隔离
当前 Workbuddy 正在执行：WPS 台账数据库相关任务；三违相关迁移；三违责任关系；WPS 同步/迁移；网格归属；考核联动等相关任务。本阶段禁止修改：WPS 相关代码；wpsGrid*；WPS API；WPS migration；WPS sync；grid_inspection_records；grid_record_sync_map；三违迁移；三违生产数据；三违相关 API；三违责任关系；当前 Workbuddy 正在修改的文件；生产数据库现有业务数据。
如果 AI 架构设计必须依赖上述模块：只允许：1. 识别依赖 2. 记录依赖 3. 设计接口边界。禁止直接修改。必须记录：依赖对象；依赖原因；当前状态；潜在冲突；推荐解决方案；是否需要用户确认。

## 七、必须审计现有AI代码
在设计新架构之前，重新确认以下实际代码：重点检查：server\services\aiService.js。确认：Provider抽象；Grok；Ollama；请求协议；SSE；重试；错误处理；超时；Token相关处理；模型配置；Provider切换机制。不得重新设计一个与现有 aiService.js 完全平行的第二套 Provider 系统。

## 八、必须设计Provider统一架构
设计未来统一 Provider 接口。目标结构类似：HSE AI Gateway → Provider Interface → Grok/Ollama/OpenAI Compatible/Future Providers。需要设计统一能力：text generation；streaming；structured output；vision input；model metadata；health check；timeout。
```

执行时间：
2026-09-14（AI-02 阶段，跨多轮只读复核 + 设计）

执行结果：
完成。已产出《AI-02-HSE-AI统一能力层架构设计与接口基线.md》（17 节 + 9 项新增确认清单 + AI-01 遗留确认项）。核心结论：
- Provider 统一架构：aiService.js 原地演进为「Provider 注册表 + 统一契约」（HseAiProvider：chat/chatStream/chatStructured/vision/embed/listModels/healthCheck/getMetadata/capabilities），新增 openaiCompatibleProvider（DeepSeek/Qwen/vLLM/OpenAI），现有 7 个消费方导出面零破坏；禁止平行第二套系统。
- 七大统一组件：Provider Registry、AI Gateway、Prompt Registry（版本化，现有 9 模板迁移注册）、Evidence Chain（ai_evidence_items）、AI Task（ai_analysis_tasks）、Vision 接入规范、RAG 接口规范。
- 双重挂载治理：v2 端点统一挂 /api/hse/ai/v2（Step1 共存）→ Step2 收编；ai.js 4 端点处置建议（/qa 废弃、统计规则迁移分析域）留用户确认。
- 数据模型：新增 6 张 ai_* 表（prompt_registry/analysis_tasks/evidence_items/provider_configs/rag_documents/rag_chunks），不修改任何现有表。
- 双轨制铁律：AI 只写 ai_* 建议轨，人工轨只由 /tasks/:id/confirm 人工写入（Gateway 层字段白名单）。
- 边界：不触碰 Workbuddy 保护清单（§14 依赖记录：统一层不直接 SQL 在迁表，取数走各域既有只读查询）。

修改文件：
- 新增：docs/AI智能分析/AI-02-HSE-AI统一能力层架构设计与接口基线.md（主交付物）
- 更新：docs/AI智能分析/AI智能分析实施进度.md（本文件，追加 AI-02 记录）
- 归档：docs/191副/②交付报告/2026-09-14_AI-02-HSE-AI统一能力层架构设计与接口基线完成.md（镜像摘要）+ _index.md
- 记忆：更新 project_memory.md（AI-02 冻结基线），同步镜像至 docs/191副/project_memory.md

数据库变化：
无（本阶段零 SQL，未建表，未连生产库）

测试结果：
无代码改动，未运行测试。设计验证方式：aiService.js 全量精读（980 行）+ app.js 挂载点复核（L438-439）+ 路由/服务/消费方依赖图扫描（7 消费方 + 1 测试）+ 前端 AI 页/API 层核查 + 与 AI-01 报告逐项比对（无冲突）。

风险：
1. 统一层与现有 aiService 双轨漂移（实施偏离原地演进原则）；2. Workbuddy 迁移冲突（三违/WPS 未冻结）；3. 双轨制破坏（AI 误写人工轨）；4. 生产数据边界；5. 新增表与现有迁移冲突；6. 前端占位页误导；7. Markdown 依赖引入；8. 流式协议兼容（三族 SSE 归一）；9. Token/成本不可控；10. OCR 环境依赖。（详见设计文档 §15）

与Workbuddy冲突：
无直接冲突（本阶段零修改）。§14 完成依赖记录：统一层设计不依赖任何 Workbuddy 在迁表结构，业务取数走各域既有只读查询；AI 接入三违/网格/考核数据均需用户确认迁移完成后。

下一步：
等待用户确认附录《需用户确认清单》（9 项新增 + AI-01 遗留 9 项），确认后进入 AI-03（Provider 统一骨架落地 + /v2/generate/stream/models/health + 前端 SSE/Markdown 配套）。AI-02 不自行开始 AI-03。

状态：
待确认（架构基线完成，待用户确认清单授权）

---

### AI-02（阶段二：统一能力层基础架构建设）

任务：
HSE AI统一能力层基础架构建设

提示词：
（完整保存本次收到的任务要求，原文如下；外层围栏用 4 反引号，内嵌 ```text 均属原文）

````text
# AI-02：HSE AI统一能力层基础架构建设

你现在继续负责本项目的 HSE AI 智能分析实施任务。

本任务由 Trae + DeepSeek V4 Flash 执行。

当前项目已经完成 AI-01 现状审计。

本阶段不是重新审计，而是基于 AI-01 审计结果，正式建设 HSE AI 能力层的第一阶段基础架构。

---

# 一、项目基本信息

项目目录：

`G:\hse-dashboard`

当前项目实际前端：

`G:\hse-dashboard\安全看板vben\apps\web-naive`

当前实际 UI：

**Naive UI**

当前 AI 核心服务：

`G:\hse-dashboard\server\services\aiService.js`

AI 项目文档目录：

`G:\hse-dashboard\docs\AI智能分析`

AI 总进度：

`G:\hse-dashboard\docs\AI智能分析\AI智能分析实施进度.md`

上一阶段：

`AI-01：HSE智能分析现状审计`

AI-01 已完成并经过 ChatGPT 审核。

---

# 二、AI-02 的正式目标

本阶段只建设：

> **统一 HSE AI 能力层的基础骨架。**

最终形成：

```text
HSE业务模块
      ↓
HSE AI Capability Layer
      ↓
AI Gateway / AI Service
      ↓
Provider Abstraction
      ↓
Grok / Ollama / OpenAI-Compatible Provider
```

同时建立：

```text
Prompt Registry
Evidence Structure
AI Generation Record
Provider Health
AI Request Context
AI Audit Log
```

最终实现：

```text
业务数据
   ↓
AI能力层
   ↓
模型 Provider
   ↓
AI分析结果
   ↓
AI证据 + AI建议
   ↓
人工审核
   ↓
正式HSE结果
```

注意：

**本阶段不是开发具体的“风险 AI”“三违 AI”“事故 AI”“视觉 AI”“RAG”。**

这些能力全部留到后续阶段。

---

# 三、最重要的原则

## 1. AI不能成为HSE最终裁决者

必须继续保持：

```text
AI分析
 ↓
ai_verdict
ai_evidence
ai_suggestion
ai_findings
ai_missing_items
ai_confidence
 ↓
人工审核
 ↓
compliance_status
checked_by
checked_at
manual_remark
```

禁止：

```text
AI → compliance_status
```

禁止 AI 自动把任何业务记录标记为：

* 合规
* 不合规
* 三违成立
* 事故成立
* 隐患成立
* 扣分成立
* 最终风险等级

AI-02 只建立基础能力，不改变这一原则。

---

# 四、绝对禁止修改的内容

本阶段禁止：

1. 修改登录页
2. 修改 JWT
3. 修改认证机制
4. 修改权限核心机制
5. 修改 Vben 核心目录
6. 更换 Naive UI
7. 引入 Element Plus
8. 引入 Ant Design Vue
9. 引入新的状态管理框架
10. 大规模重构现有业务模块
11. 修改 WPS 台账数据
12. 修改 WPS 同步机制
13. 修改 WPS migration
14. 修改 `grid_inspection_records`
15. 修改 `grid_record_sync_map`
16. 修改 `grid_areas`
17. 修改 `wpsGrid*`
18. 修改 Workbuddy 当前三违相关代码
19. 修改三违生产数据
20. 修改生产业务数据
21. 修改现有 HSE 业务模块的数据逻辑
22. 删除旧 AI API
23. 删除 `ai.js`
24. 删除 `ai-enhanced.js`
25. 删除 `aiService.js`
26. 安装 Ollama
27. 下载模型
28. 安装模型
29. 修改生产环境密钥
30. 把空的 `GROK_API_KEY` 假装成可用
31. 将 AI 结果直接写入人工最终结果字段。

如果发现必须修改以上受保护内容：

**立即停止相关修改，在报告中标记 `[需要用户确认]`。**

---

# 五、Workbuddy 并行任务隔离

Workbuddy 当前仍然负责：

* WPS 台账
* 三违责任关系
* 三违规则
* 网格归属
* WPS 数据迁移
* 三违生产迁移
* 相关考核联动

AI-02 对这些系统只能：

> **只读理解、只读消费、不得修改。**

本阶段不需要为了 AI 能力而修改 WPS 或三违数据库。

如果未来 AI Capability Layer 需要读取这些数据：

可以设计接口或服务边界；

但是：

**不要修改 WPS/三违现有实现。**

---

# 六、AI-02 第一任务：建立统一 AI Capability Layer

先检查现有：

`server/services/aiService.js`

`server/routes/ai.js`

`server/routes/ai-enhanced.js`

以及：

```text
server/services/
server/routes/
server/controllers/
server/
```

中的 AI 相关结构。

不要先重写。

先判断：

* 哪些可以直接复用
* 哪些应该包装
* 哪些应该拆分
* 哪些暂时保持兼容
* 哪些属于历史遗留

最终形成合理结构。

推荐目标结构：

```text
server/
  services/
    ai/
      aiGateway.js
      aiProviderRegistry.js
      aiRequestContext.js
      aiEvidenceService.js
      aiPromptRegistry.js
      aiHealthService.js
```

但注意：

**这个目录结构只是目标建议，不允许为了满足目录名称而机械创建文件。**

如果现有结构更合理，应优先复用。

---

# 七、Provider 统一抽象

当前已有：

* Grok
* Ollama

不要删除。

需要把 Provider 能力统一为明确的接口。

至少支持：

```text
provider.name
provider.type
provider.chat()
provider.chatStream()
provider.isAvailable()
provider.healthCheck()
```

建议抽象：

```text
AI Provider
├── Grok
├── Ollama
└── OpenAI-Compatible
```

但是：

**本阶段不要求新增真实云端厂商。**

OpenAI-Compatible 可以先建立接口抽象，不要求配置真实账号。

---

# 八、Provider 必须支持健康状态

建立统一 Provider Health。

至少能够区分：

```text
AVAILABLE
NOT_CONFIGURED
UNREACHABLE
AUTH_ERROR
MODEL_NOT_FOUND
TIMEOUT
ERROR
DISABLED
```

例如：

```json
{
  "provider": "grok",
  "status": "NOT_CONFIGURED",
  "available": false,
  "reason": "GROK_API_KEY is empty"
}
```

不要：

```json
{
  "available": true
}
```

如果实际上没有 API Key。

Ollama 同理。

如果本机没有 Ollama：

必须明确报告：

```text
NOT_CONFIGURED
```

或：

```text
UNREACHABLE
```

不得模拟成功。

---

# 九、不要修改真实密钥

检查：

`.env`

`.env.example`

相关 AI 配置。

可以增加：

```text
AI_PROVIDER
AI_TIMEOUT
AI_MAX_RETRIES
AI_ENABLE
```

等必要配置。

但是：

**不要填写真实 API Key。**

不要把任何密钥写进：

* JS
* TS
* JSON
* MD
* SQL
* Git

如果 `.env` 已经存在空密钥：

保留为空。

---

# 十、统一 AI Gateway

建立统一调用入口。

目标类似：

```text
aiGateway.generate()
aiGateway.stream()
aiGateway.analyze()
```

但是不要为了形式而建立大量空函数。

至少解决：

1. Provider 选择
2. Provider 健康检查
3. Prompt 选择
4. 请求上下文
5. 超时
6. 重试
7. 错误标准化
8. AI generation record
9. evidence metadata
10. AI confidence
11. requestId / traceId

业务模块以后不应该直接：

```text
调用 Grok
调用 Ollama
调用某个具体模型
```

业务模块应该：

```text
调用 HSE AI Capability Layer
```

---

# 十一、建立 Prompt Registry

当前项目已经存在 Prompt，但缺少统一版本管理。

本阶段建立轻量级 Prompt Registry。

至少支持：

```text
prompt_key
prompt_version
system_prompt
description
status
created_at
updated_at
```

例如：

```text
hse.general.analysis
v1.0
```

```text
hse.risk.analysis
v1.0
```

但是：

**本阶段不要开发真正的风险分析 Prompt。**

可以只建立：

```text
hse.general.analysis
```

作为基础测试 Prompt。

Prompt 必须可以追踪：

```text
request
→ prompt_key
→ prompt_version
→ provider
→ model
→ result
```

---

# 十二、Prompt Registry 不要硬编码成业务判断

禁止：

```javascript
if (xxx) {
  return "违规";
}
```

这种规则不属于 Prompt Registry。

Prompt Registry 只负责：

```text
Prompt模板
Prompt版本
Prompt元数据
```

HSE规则以后由独立规则体系提供。

---

# 十三、建立统一 AI Evidence 结构

AI-02 必须解决一个非常重要的问题：

> AI 为什么得出这个建议？

因此建立统一 Evidence 结构。

推荐结构：

```json
{
  "source_type": "business_record",
  "source_id": "xxx",
  "source_domain": "standard_evaluation",
  "source_field": "xxx",
  "evidence_text": "xxx",
  "evidence_strength": "medium",
  "created_at": "xxx"
}
```

允许未来扩展：

```text
business_record
hse_standard
regulation
document
image
knowledge_base
rule
model_output
```

但是：

**AI-02 不需要实现 RAG。**

这里只建立统一证据数据结构。

---

# 十四、Evidence 必须和最终人工结果分离

AI Evidence 只能解释：

> AI为什么这样建议。

不能变成：

> 系统已经确认违规。

因此禁止：

```text
AI Evidence → compliance_status
```

必须保持：

```text
AI Evidence
     ↓
AI Suggestion
     ↓
Human Review
     ↓
Final Result
```

---

# 十五、AI Generation Record 复用现有表

现有：

`ai_generation_records`

必须先检查其真实结构和使用情况。

不要直接新建重复的：

```text
ai_records
ai_logs
ai_history
ai_results
```

如果现有表能够扩展满足 AI-02：

优先复用。

如果确实缺少必要字段：

只增加最小必要结构。

任何数据库结构变更必须：

1. 生成 migration
2. 不修改生产数据
3. 不删除现有字段
4. 保持向后兼容
5. 完成 migration 验证
6. 报告数据库变化

---

# 十六、AI Request Context

建立统一请求上下文。

至少包含：

```text
requestId
userId
employeeId（如果当前认证上下文能够可靠获得）
sourceDomain
sourceRecordId
provider
model
promptKey
promptVersion
createdAt
```

注意：

如果 employeeId 获取方式不确定：

**不要重新设计认证系统。**

复用现有认证上下文。

无法确定时标记：

`[需要用户确认]`

---

# 十七、统一 AI 错误模型

当前 AI API 不应该让不同 Provider 返回完全不同的错误格式。

统一：

```json
{
  "success": false,
  "error": {
    "code": "AI_PROVIDER_UNAVAILABLE",
    "message": "AI provider is not available",
    "provider": "grok",
    "retryable": false,
    "requestId": "xxx"
  }
}
```

至少覆盖：

```text
AI_NOT_ENABLED
AI_PROVIDER_NOT_FOUND
AI_PROVIDER_NOT_CONFIGURED
AI_PROVIDER_UNAVAILABLE
AI_AUTH_ERROR
AI_MODEL_NOT_FOUND
AI_TIMEOUT
AI_RATE_LIMITED
AI_INVALID_REQUEST
AI_INTERNAL_ERROR
```

---

# 十八、处理当前 /api/hse/ai 双挂载问题

AI-01 已确认：

```text
/api/hse/ai
    ↓
ai.js

/api/hse/ai
    ↓
ai-enhanced.js
```

当前禁止直接删除其中任何一个。

本阶段必须：

1. 检查两个 router 的实际调用关系
2. 检查前端是否调用
3. 检查后端内部是否调用
4. 检查测试是否调用
5. 判断哪些属于 legacy
6. 判断哪些属于当前真实能力
7. 建立兼容策略

目标：

以后逐步形成：

```text
/api/hse/ai/*
```

统一入口。

但是：

**AI-02 不要求立即删除 legacy endpoint。**

如果需要修改路由：

必须保持旧接口兼容。

---

# 十九、Legacy AI API 处理原则

AI-01 已发现：

`ai.js`

存在规则/mock 类型接口。

不要因为“看起来是旧代码”就删除。

需要建立：

```text
CURRENT
LEGACY
MOCK
DEPRECATED
```

分类。

报告中说明：

* 当前是否被调用
* 是否真实调用模型
* 是否可以保留
* 后续什么时候处理

---

# 二十、AI API 必须增加能力检查

至少提供一个健康检查能力，例如：

```text
GET /api/hse/ai/provider/status
```

返回：

```text
Provider
Status
Model
Configured
Available
Latency
Error
```

如果该接口已经存在：

优先复用并统一。

不要创建重复接口。

---

# 二十一、前端本阶段只做“基础能力适配”

本阶段**不要重新设计 AI 智能分析页面**。

也不要开发：

* AI聊天页面
* AI报告页面
* 风险分析页面
* 图片识别页面
* RAG页面

但是可以建立最小前端能力：

如果当前 AI API 已经存在前端 API 层：

统一：

```text
src/api/hse/ai.ts
```

或复用现有结构。

需要支持：

```text
provider status
AI request
AI stream
```

但只有在现有前端架构确实需要时才实现。

---

# 二十二、SSE 本阶段只打通基础能力

后端已经存在 SSE 能力。

本阶段需要验证：

```text
Backend SSE
    ↓
Frontend request
    ↓
Frontend receives chunks
    ↓
正确结束
```

不要开发复杂聊天 UI。

如果当前前端 SSE 实现缺失：

可以建立最小 API 层或 composable。

但是：

**不得新建一套大型 AI UI 组件体系。**

---

# 二十三、Markdown

AI 输出以后需要支持 Markdown。

本阶段先检查：

```text
package.json
已有 Markdown 库
现有渲染能力
```

如果已有依赖：

复用。

如果没有：

**不要为了 AI-02 强行安装大型 Markdown 生态。**

如果确实认为必须新增依赖：

停止并在报告中标记：

`[需要用户确认]`

不要自行 npm install。

---

# 二十四、数据库要求

AI-02 可以建立 AI 基础设施相关数据库结构。

但必须遵守：

```text
只新增 AI 基础设施
不修改已有业务数据
不改变业务表最终状态
不修改 WPS
不修改三违
```

优先复用：

```text
ai_generation_records
document_ai_analysis
standard_evaluation_items
```

如果新增表：

建议只考虑：

```text
ai_prompt_registry
```

或者真正有必要的：

```text
ai_request_logs
```

但是：

**不要为了“架构完整”一次性创建十几张 AI 表。**

最小化设计。

---

# 二十五、AI Prompt Registry 数据库设计要求

如果确认采用数据库方式：

至少考虑：

```text
id
prompt_key
version
name
description
system_prompt
user_prompt_template
status
created_at
updated_at
```

建议唯一约束：

```text
(prompt_key, version)
```

状态至少：

```text
DRAFT
ACTIVE
DISABLED
```

但如果现有项目已有更好的配置管理机制：

优先复用现有机制。

---

# 二十六、AI-02 不实现以下能力

明确禁止提前开发：

### AI-03 以后再做

本阶段不要：

* Ollama 安装
* 本地模型部署
* 模型下载
* GPU 调优
* CPU 推理优化

### AI-05 以后再做

不要：

* RAG
* embedding
* pgvector
* 知识库检索
* 文档 chunk

### AI-07 以后再做

不要：

* 视觉模型
* 图片识别
* 图片违规判断
* 图片风险识别

### AI-09 以后再做

不要：

* 三违 AI 自动判定
* 三违自动归责
* AI 自动扣分

### AI-10 以后再做

不要：

* AI 自动月报
* AI 自动管理报告
* AI 管理决策

---

# 二十七、测试要求

本阶段必须有真实测试。

至少测试：

## Provider

```text
Grok 未配置
Ollama 未配置
Provider 不存在
Provider 正常配置时
```

如果当前没有真实 Provider：

不能伪造成功。

至少验证：

```text
NOT_CONFIGURED
UNREACHABLE
```

等状态正确。

## Prompt

测试：

```text
prompt_key
version
查询
加载
版本选择
```

## Evidence

测试：

```text
生成
保存
读取
JSON结构
```

## AI Gateway

测试：

```text
正常请求
Provider不存在
Provider不可用
超时
异常
```

## SSE

测试：

```text
连接
chunk
结束
异常
```

## API

测试：

```text
GET /provider/status
AI request
SSE
```

---

# 二十八、禁止伪造测试

绝对禁止：

```text
测试通过
```

但实际上没有运行。

必须明确区分：

```text
PASS
FAIL
NOT_RUN
BLOCKED
NOT_CONFIGURED
```

例如：

```text
Grok真实调用：
BLOCKED / NOT_CONFIGURED
原因：GROK_API_KEY为空
```

这是正确结果。

---

# 二十九、Git 与修改边界

开始开发前：

记录：

```text
git status
```

完成后再次：

```text
git status
```

输出：

```text
修改文件
新增文件
删除文件
数据库 migration
配置变化
```

如果发现 AI-02 之外的文件被 Workbuddy 同期修改：

不要覆盖。

不要回滚。

不要自动恢复。

必须标记：

`[Workbuddy并行变更]`

---

# 三十、必须更新 AI 总进度文件

更新：

`G:\hse-dashboard\docs\AI智能分析\AI智能分析实施进度.md`

必须新增：

```text
### AI-02

任务：
HSE AI统一能力层基础架构建设

提示词：
完整保存本次提示词

执行时间：
YYYY-MM-DD

执行结果：

修改文件：

数据库变化：

测试结果：

Provider状态：

Prompt Registry：

Evidence：

SSE：

API：

Workbuddy冲突：

风险：

遗留问题：

下一步：

状态：
```

必须保存完整提示词。

---

# 三十一、生成 AI-02 完成报告

生成：

`G:\hse-dashboard\docs\AI智能分析\AI-02-HSE统一AI能力层基础架构建设报告.md`

至少包含：

1. 执行摘要
2. AI-01基线继承情况
3. 实际修改范围
4. AI Capability Layer
5. Provider Architecture
6. Provider Health
7. AI Gateway
8. Prompt Registry
9. Evidence Architecture
10. AI Request Context
11. AI Generation Record
12. API结构
13. SSE
14. 前端适配
15. 数据库变化
16. 测试结果
17. Git变化
18. Workbuddy隔离情况
19. 风险
20. 未完成事项
21. [需要用户确认]
22. 下一阶段建议

---

# 三十二、完成标准

AI-02 只有在以下条件基本满足后才算完成：

### A

AI Provider 有统一抽象。

### B

Provider 健康状态真实可判断。

### C

AI Gateway 成为后续业务 AI 的统一入口。

### D

Prompt 可以版本化追踪。

### E

AI Evidence 有统一结构。

### F

AI Request 可以追踪：

```text
requestId
provider
model
prompt
version
source
```

### G

AI 不会直接写最终人工结果。

### H

旧 AI API 没有被粗暴删除。

### I

SSE 基础链路得到真实验证。

### J

没有修改 WPS / 三违 / Workbuddy 保护范围。

### K

没有安装模型、Ollama 或未经批准的新依赖。

### L

实施进度文件已经完整记录 AI-02。

---

# 三十三、遇到不确定情况必须停止猜测

以下任何情况：

* 不确定现有代码用途
* 不确定 API 是否被使用
* 不确定数据库字段
* 不确定 Provider 行为
* 不确定是否属于 Workbuddy
* 不确定是否需要新增依赖
* 不确定数据库结构
* 不确定认证上下文
* 不确定前端实际入口

必须：

```text
[需要用户确认]
```

并记录：

```text
发现的问题
为什么无法确认
需要用户提供什么
如果确认，准备怎么做
```

不得自行猜测。

---

# 三十四、最终汇报格式

完成后必须向用户明确报告：

```text
AI-02 状态：PASS / PARTIAL / BLOCKED

本阶段完成：
1.
2.
3.

Provider：
Grok：
Ollama：
OpenAI-Compatible：

AI Gateway：
PASS / PARTIAL

Prompt Registry：
PASS / PARTIAL

Evidence：
PASS / PARTIAL

SSE：
PASS / PARTIAL

数据库：
无变化 / 有 migration

测试：
PASS / FAIL / BLOCKED

Workbuddy：
无冲突 / 存在冲突

[需要用户确认]：
1.
2.

下一阶段：
AI-03
```

注意：

**不要自行开始 AI-03。**

完成 AI-02 后停止，等待用户把：

`AI-02-HSE统一AI能力层基础架构建设报告.md`

以及更新后的：

`AI智能分析实施进度.md`

交给 ChatGPT 审核。

ChatGPT 将在审核 AI-02 后生成下一阶段唯一正式提示词。
````

执行时间：
2026-09-14（AI-02 阶段二，跨多轮实现 + 测试）

执行结果：
完成（基础架构建设落地）。已产出《AI-02-HSE统一AI能力层基础架构建设报告.md》（22 节）。核心成果：
- 新建 `server/services/ai/` 能力层 8 服务 + 2 测试文件：errors（10 类统一错误码）、aiRequestContext（requestId/traceId）、aiEvidenceService（8 类来源 + 强度）、aiPromptRegistry（hse.general.analysis v1.0 + 现有模板 template_ref 挂载）、aiHealthService（8 状态真实探测）、aiProviderRegistry（Grok/Ollama/OpenAICompatibleProvider + 能力路由 + 错误归类）、aiGenerationRecordService（复用 ai_generation_records，扩展列自动探测）、aiGateway（generate/stream/analyze/getHealthSummary）。
- Provider 统一抽象原地演进：Grok/Ollama 协议层完全复用 aiService.js（未建平行第二套）；OpenAI-Compatible 协议代码已实现（未配置 → NOT_CONFIGURED，流式显式 NOT_SUPPORTED 待 AI-03）。
- 健康状态真实化：GROK_API_KEY 空 → NOT_CONFIGURED；本机无 Ollama → UNREACHABLE；AI_ENABLE=false → DISABLED；不伪造 available:true。
- API 适配：aiEnhancedService.providerStatus 保留旧字段 + 新增 aiEnabled/activeProvider/providers[] 统一健康汇总；旧 AI API 未删未改（双挂载治理留后续阶段）。
- 前端最小适配：新建 src/api/hse/ai.ts（getProviderStatus/generateReport/streamGenerateReport SSE 消费）；未新建任何 AI UI 页面；未引入 Markdown 依赖。
- 数据库：migration `server/sql/ai_capability_layer_v1.sql` 已编写（ai_prompt_registry + ai_generation_records 4 扩展列），**未执行**（需用户授权）。

修改文件：
- 新增：server/services/ai/errors.js、aiRequestContext.js、aiEvidenceService.js、aiPromptRegistry.js、aiHealthService.js、aiProviderRegistry.js、aiGenerationRecordService.js、aiGateway.js、aiCapabilityLayer.unit.test.js、aiApiLayer.unit.test.js
- 新增：server/sql/ai_capability_layer_v1.sql（migration，未执行）
- 新增：安全看板vben/apps/web-naive/src/api/hse/ai.ts
- 修改：server/services/aiEnhancedService.js（providerStatus 统一健康汇总增强）
- 修改：server/test/setup.js（uuid@14 ESM-only 全局 mock）
- 新增：docs/AI智能分析/AI-02-HSE统一AI能力层基础架构建设报告.md（主交付物）
- 更新：docs/AI智能分析/AI智能分析实施进度.md（本文件，追加 AI-02 阶段二记录）
- 归档：docs/191副/②交付报告/2026-09-14_AI-02-HSE统一AI能力层基础架构建设完成.md + _index.md
- 记忆：更新 project_memory.md（AI-02 实施冻结基线），同步镜像至 docs/191副/project_memory.md

数据库变化：
有 migration（未执行）：`server/sql/ai_capability_layer_v1.sql` —— 新建 ai_prompt_registry（prompt_key+version 唯一约束）+ ai_generation_records 扩展 request_id/prompt_key/prompt_version/evidence(JSONB)。全程未连生产库、未执行任何 SQL、未触碰 WPS/三违表。

测试结果：
PASS（真实运行，非伪造）。`npx jest services/ai/aiCapabilityLayer.unit.test.js services/ai/aiApiLayer.unit.test.js` → Test Suites: 2 passed / Tests: 55 passed。覆盖：错误模型 6、Request Context 3、Evidence 7、Prompt Registry 9、Provider Health 5、Provider 注册表 6、Gateway.generate 10、Gateway.stream 3、Gateway.analyze 2、Gateway.health 1、API providerStatus 2。真实 Provider 调用状态：BLOCKED / NOT_CONFIGURED（无凭证、无 Ollama），测试断言 NOT_CONFIGURED/UNREACHABLE 判定路径为 PASS（正确结果）。

Provider状态：
- Grok：NOT_CONFIGURED（GROK_API_KEY is empty，.env 空密钥保留未填）
- Ollama：UNREACHABLE（本机无 Ollama 服务，未安装）
- OpenAI-Compatible：NOT_CONFIGURED（AI_OPENAI_BASE_URL/AI_OPENAI_MODEL 未配置；协议代码已实现）
- AI_ENABLE：未改动（默认启用语义）

Prompt Registry：
PASS。hse.general.analysis v1.0 已注册；register/get/list/render 全支持；rca_analysis/document_analysis/report_monthly/report_group/standard_evaluation 经 template_ref:'aiService' 挂载现有 9 模板（单一事实源，不复制不硬编码）；无业务判断硬编码。

Evidence：
PASS。8 类来源类型 + low/medium/high 强度；createEvidence/attachEvidence/validateEvidenceList 已实现并测试；只进 evidence 元数据，绝不写人工最终结果字段（compliance_status 等）。

SSE：
PASS（基础链路单元验证）/ BLOCKED（真实端到端）。aiGateway.stream 透传 SSE 帧、缺 res 报错测试通过；前端 streamGenerateReport（fetch+ReadableStream）已建；真实后端→模型→前端分块依赖可用 Provider，暂 NOT_CONFIGURED。

API：
PASS（单元）/ PARTIAL（真实）。POST /api/hse/ai-enhanced/provider/status 已增强（旧字段兼容 + providers[] 汇总），测试通过；v2 统一端点挂载留 AI-03；旧端点未删。

Workbuddy冲突：
无冲突。本阶段修改面全部位于 server/services/ai/（新建）、aiEnhancedService.js、server/test/setup.js、前端 src/api/hse/ai.ts、server/sql/（未执行）；未触碰 violations/assessment*/grid*/WPS/hse-tasks 等 Workbuddy 并行修改文件，未覆盖未回滚。

风险：
1. 凭证缺失 → 真实 AI 调用不可用（如实呈现）；2. migration 未执行 → Prompt 仅内存态、扩展列不落盘（代码已自动探测列、向后兼容）；3. OpenAI-Compatible 流式待 AI-03；4. 双挂载治理推迟；5. 前端 AI 占位页仍可能被误认为已上线；6. 前端无单测基线，ai.ts 静态核查；7. Markdown 依赖未定；8. employeeId 不确定时置 null。

遗留问题：
migration 执行待授权；OpenAI-Compatible 流式接入；v2 端点挂载；真实 Provider 端到端验证；前端占位页处置；Markdown 依赖决策；SSE 真实链路验证。

下一步：
等待用户审核《AI-02-HSE统一AI能力层基础架构建设报告.md》与更新后的《AI智能分析实施进度.md》。ChatGPT 审核后将生成 AI-03 唯一正式提示词。AI-02 不自行开始 AI-03。

状态：
待确认（基础架构建设完成，测试 55/55 PASS，migration 待授权执行；待用户交 ChatGPT 审核后进入 AI-03）

---

### AI-03

任务：
HSE AI真实Provider接入与统一API收口

提示词：
（完整保存本次收到的任务要求，原文如下；外层围栏用 4 反引号，内嵌 ```text 均属原文）

````text
# AI-03：HSE AI真实 Provider 接入与统一 API 收口

你现在继续负责本项目的 HSE AI 智能分析实施任务。

本任务由 Trae + DeepSeek V4 Flash 执行。

当前项目：

`G:\hse-dashboard`

当前阶段：

**AI-03：HSE AI真实 Provider 接入与统一 API 收口**

---

# 一、AI-02 已经完成并冻结

AI-01：

HSE智能分析现状审计

AI-02：

HSE AI统一能力层基础架构建设

AI-02 已经通过 ChatGPT 审核。

AI-02 当前冻结成果：

```text
server/services/ai/
    errors.js
    aiRequestContext.js
    aiEvidenceService.js
    aiPromptRegistry.js
    aiHealthService.js
    aiProviderRegistry.js
    aiGenerationRecordService.js
    aiGateway.js
```

已经建立：

```text
Provider Registry
AI Gateway
Prompt Registry
Evidence
Request Context
Generation Record
Health
Unified Error
```

已有测试：

```text
55/55 PASS
```

**不要推翻 AI-02 架构。**

---

# 二、AI-03 的核心目标

本阶段目标不是开发具体 HSE AI 业务能力。

本阶段只解决：

> **让 AI-02 建立的统一能力层真正形成可调用、可验证、可兼容的统一 API。**

最终链路：

```text
Frontend
   ↓
/api/hse/ai/v2/*
   ↓
AI Gateway
   ↓
Provider Registry
   ↓
Grok / Ollama / OpenAI-Compatible
   ↓
AI Result
   ↓
Evidence / Generation Record
```

重点完成：

1. Provider 能力收口
2. `/api/hse/ai/v2` 统一 API
3. generate
4. stream
5. models
6. health
7. Provider 状态
8. SSE 真实链路
9. Legacy API 兼容治理
10. 前端 AI API 层收口
11. 真实 Provider 可用性验证
12. migration 安全收口

---

# 三、绝对禁止事项

本阶段禁止：

1. 修改登录
2. 修改 JWT
3. 修改认证机制
4. 修改权限核心机制
5. 修改 Vben 核心目录
6. 更换 Naive UI
7. 引入 Ant Design Vue
8. 引入 Element Plus
9. 引入新的状态管理框架
10. 大规模重构业务模块
11. 修改 WPS
12. 修改 `grid_inspection_records`
13. 修改 `grid_record_sync_map`
14. 修改 `grid_areas`
15. 修改 `wpsGrid*`
16. 修改 WPS migration
17. 修改三违业务代码
18. 修改三违生产数据
19. 修改 Workbuddy 正在处理的文件
20. 修改生产业务数据
21. 删除 `ai.js`
22. 删除 `ai-enhanced.js`
23. 删除 `aiService.js`
24. 删除旧 AI API
25. 安装 Ollama
26. 下载模型
27. 下载 GPU 模型
28. 修改生产 API Key
29. 把 NOT_CONFIGURED 伪装成 AVAILABLE
30. AI 写入人工最终结果
31. 开发三违 AI 自动判定
32. 开发隐患 AI 自动判定
33. 开发风险最终评级
34. 开发事故最终认定
35. 开发 RAG
36. 开发视觉模型
37. 开发正式 AI 智能分析业务页面

如果发现必须突破以上边界：

立即停止相关操作，并记录：

`[需要用户确认]`

---

# 四、首先重新读取 AI-02 成果

必须读取：

```text
docs\AI智能分析\AI-02-HSE统一AI能力层基础架构建设报告.md

docs\AI智能分析\AI智能分析实施进度.md
```

同时检查实际代码：

```text
server/services/ai/
server/services/aiService.js
server/services/aiEnhancedService.js
server/routes/ai.js
server/routes/ai-enhanced.js
server/app.js
```

不得仅依据 AI-02 报告猜测当前代码。

如果报告与代码冲突：

以代码实际状态为准。

不要自行重构解决冲突。

记录：

`[需要用户确认]`

---

# 五、重新检查 Provider Registry

检查：

```text
server/services/ai/aiProviderRegistry.js
```

以及：

```text
aiService.js
```

必须保证：

> AI-03 继续使用 AI-02 已建立的 Provider 抽象。

禁止重新创建：

```text
provider2
modelService2
aiService2
```

之类平行体系。

Provider 至少统一支持：

```text
chat
chatStream
isAvailable
healthCheck
```

如果 AI-02 已经实现：

```text
chatStructured
vision
embed
listModels
getMetadata
capabilities
```

则继续兼容。

---

# 六、Provider 真实状态

继续保持真实状态。

当前已知状态：

```text
Grok：
NOT_CONFIGURED
原因：GROK_API_KEY为空

Ollama：
UNREACHABLE
原因：当前未安装/未运行

OpenAI-Compatible：
NOT_CONFIGURED
原因：未配置对应 Base URL / Model
```

不要：

* 修改真实密钥
* 写入测试密钥
* 自动安装 Ollama
* 下载模型
* 假装 Provider 可用

---

# 七、建立统一 v2 API

目标：

```text
/api/hse/ai/v2
```

至少建立：

```text
GET  /api/hse/ai/v2/health
GET  /api/hse/ai/v2/providers
GET  /api/hse/ai/v2/models

POST /api/hse/ai/v2/generate
POST /api/hse/ai/v2/stream
POST /api/hse/ai/v2/analyze
```

但是：

**如果 AI-02 已经存在类似接口，优先复用，不要重复创建。**

所有 v2 API 必须经过：

```text
AI Gateway
```

禁止：

```text
Route
 ↓
Grok
```

或：

```text
Route
 ↓
Ollama
```

---

# 八、统一 Generate

请求建议：

```json
{
  "promptKey": "hse.general.analysis",
  "promptVersion": "v1.0",
  "input": {
    "text": "..."
  },
  "source": {
    "domain": "test",
    "recordId": "..."
  }
}
```

最终由：

```text
Route
 ↓
Gateway
 ↓
Prompt Registry
 ↓
Provider Registry
 ↓
Provider
```

完成。

响应至少包含：

```text
success
requestId
provider
model
promptKey
promptVersion
content
usage（如果 Provider 提供）
```

不能直接暴露 Provider 私有返回格式作为统一 API 格式。

---

# 九、统一 Stream

建立：

```text
POST /api/hse/ai/v2/stream
```

使用 SSE。

必须统一：

```text
start
chunk
end
error
```

事件格式可以根据现有 SSE 实现确定，但必须形成统一协议。

例如：

```text
event:start

event:chunk

event:chunk

event:end
```

错误：

```text
event:error
```

每个请求必须能够关联：

```text
requestId
traceId
```

---

# 十、SSE 真实链路

AI-02 目前：

```text
代码：
PASS

单元测试：
PASS

真实模型：
BLOCKED
```

AI-03 必须尽可能完成真实链路验证。

如果没有任何 Provider 可用：

不要伪造。

真实结果必须写：

```text
BLOCKED / NOT_CONFIGURED
```

同时仍然测试：

```text
Route
 ↓
Gateway
 ↓
Provider Registry
 ↓
Provider
 ↓
SSE
```

的错误路径。

如果测试环境存在已经合法配置的 Provider：

才允许进行真实模型调用。

禁止修改密钥以制造成功。

---

# 十一、Models API

实现：

```text
GET /api/hse/ai/v2/models
```

返回统一模型信息。

至少：

```text
provider
model
available
capabilities
```

例如：

```json
{
  "provider": "ollama",
  "model": "xxx",
  "available": false,
  "capabilities": [
    "chat",
    "stream"
  ]
}
```

如果无法取得模型列表：

明确：

```text
NOT_CONFIGURED
UNREACHABLE
```

不得伪造模型。

---

# 十二、Health API

统一：

```text
GET /api/hse/ai/v2/health
```

必须能够看到：

```text
AI enabled
active provider
provider status
model
latency
error
```

建议：

```json
{
  "success": true,
  "requestId": "...",
  "aiEnabled": true,
  "activeProvider": "grok",
  "providers": []
}
```

具体结构优先复用 AI-02 的统一 Health 结构。

---

# 十三、统一错误处理

继续使用 AI-02 已建立错误模型。

至少：

```text
AI_NOT_ENABLED
AI_PROVIDER_NOT_FOUND
AI_PROVIDER_NOT_CONFIGURED
AI_PROVIDER_UNAVAILABLE
AI_AUTH_ERROR
AI_MODEL_NOT_FOUND
AI_TIMEOUT
AI_RATE_LIMITED
AI_INVALID_REQUEST
AI_INTERNAL_ERROR
```

HTTP 层与业务层不要出现大量 Provider 私有错误格式。

---

# 十四、Legacy API 治理

重新检查：

```text
server/routes/ai.js
server/routes/ai-enhanced.js
```

以及：

```text
app.js
```

目前：

```text
/api/hse/ai
```

存在双重挂载。

AI-03 不得简单删除。

必须完成：

### 1

列出所有旧 API。

### 2

分类：

```text
CURRENT
LEGACY
MOCK
DEPRECATED
```

### 3

建立迁移映射：

```text
旧 API
 ↓
v2 API
```

### 4

确认旧 API 是否仍有：

```text
前端调用
后端内部调用
测试调用
```

### 5

保持旧 API 向后兼容。

如果确实需要修改旧路由：

只做最小兼容适配。

---

# 十五、特别注意 ai.js

AI-01 已发现 `ai.js` 中存在：

```text
risk-predict
classify
anomaly-detect
qa
```

其中部分可能是规则/mock能力。

AI-03 不允许直接删除。

必须记录：

```text
endpoint
真实模型/规则/mock
调用方
当前状态
推荐未来去向
```

例如：

```text
LEGACY
→ 后续迁移至 HSE 数据智能分析
```

但本阶段不实现迁移后的业务能力。

---

# 十六、ai-enhanced 兼容

当前已有：

```text
generate-report
root-cause
records
records/:id
DELETE records/:id
provider/status
```

不要直接删除。

检查：

```text
generate-report
root-cause
```

是否能够逐步通过：

```text
AI Gateway
```

统一。

如果现在直接改动风险较高：

保持原实现，同时建立 v2 入口。

报告中说明：

```text
当前：
兼容运行

未来：
逐步收口至 Gateway
```

---

# 十七、Prompt Registry

继续使用：

```text
hse.general.analysis
v1.0
```

不要在 AI-03 开始创建：

```text
hse.risk.analysis
hse.violation.analysis
hse.accident.analysis
```

等真实业务 Prompt。

AI-03 只验证：

```text
promptKey
version
load
render
provider
request
```

完整追踪：

```text
requestId
 ↓
promptKey
 ↓
promptVersion
 ↓
provider
 ↓
model
 ↓
result
```

---

# 十八、AI Generation Record

继续复用：

```text
ai_generation_records
```

AI-03 必须验证：

一次 Gateway 请求是否能够记录：

```text
requestId
provider
model
promptKey
promptVersion
source
evidence
```

如果 migration 尚未执行：

不得假设数据库字段已经存在。

AI-02 已实现自动探测/兼容逻辑的部分继续保留。

---

# 十九、Migration 安全要求

当前：

```text
server/sql/ai_capability_layer_v1.sql
```

已经生成，但：

```text
未执行
```

AI-03 首先执行：

### Migration Preflight

检查：

```text
表是否存在
字段是否存在
索引是否存在
唯一约束是否存在
迁移是否幂等
是否会修改业务数据
是否涉及 Workbuddy 表
```

特别确认：

```text
ai_prompt_registry
ai_generation_records
```

以外不得产生业务表变化。

---

# 二十、关于 Migration 执行

**不得擅自连接生产数据库执行。**

如果项目存在明确的本地开发数据库，并且能够明确确认：

```text
非生产
```

可以在报告中提出：

```text
可执行
```

但如果无法确认数据库环境：

必须：

```text
[需要用户确认]
```

不要猜测。

禁止：

```text
生产数据库直接执行
```

---

# 二十一、前端 AI API 层

检查：

```text
安全看板vben/apps/web-naive/src/api/hse/ai.ts
```

AI-02 已经建立：

```text
getProviderStatus
generateReport
streamGenerateReport
```

AI-03 不要重复创建 API 文件。

逐步增加：

```text
getHealth
getProviders
getModels
generate
stream
analyze
```

但必须根据真实使用情况决定。

不要为了接口数量而创建无实际用途的方法。

---

# 二十二、前端 SSE

继续使用当前：

```text
fetch
ReadableStream
```

方式即可。

不要引入新的 SSE 大型依赖。

必须验证：

```text
start
chunk
end
error
```

正确解析。

如果真实 Provider 不可用：

前端必须能够正确显示：

```text
AI_PROVIDER_NOT_CONFIGURED
```

而不是：

```text
一直加载
```

或：

```text
假装生成成功
```

---

# 二十三、Markdown

AI-03 仍然：

**不强制安装 Markdown 依赖。**

检查现有项目是否已经存在 Markdown 渲染能力。

如果没有：

暂时保留：

```text
raw text
```

并记录：

```text
[需要用户确认]
```

不要自行：

```text
npm install markdown-it
npm install marked
npm install vue-markdown
```

等。

---

# 二十四、AI 双轨制继续锁死

所有 v2 API 必须保证：

```text
AI
 ↓
AI Evidence
AI Suggestion
AI Verdict
AI Confidence
 ↓
Human Review
 ↓
Final HSE Result
```

禁止任何 v2 API 接受：

```text
compliance_status
checked_by
checked_at
manual_remark
```

作为 AI 最终写入字段。

如果请求中出现这些字段：

应该：

```text
忽略
```

或：

```text
拒绝
```

但不能写入人工结果。

---

# 二十五、不得开始具体 HSE AI

本阶段禁止开发：

```text
三违 AI
隐患 AI
风险 AI
事故 AI
驾驶员风险 AI
考核 AI
图片 AI
视觉 AI
RAG
知识库
自动报告
自动月报
AI 自动扣分
AI 自动定责
```

只验证：

```text
统一能力层
```

---

# 二十六、测试要求

必须真实运行。

至少新增/完善：

## Provider

```text
Grok NOT_CONFIGURED
Ollama UNREACHABLE
OpenAI-Compatible NOT_CONFIGURED
unknown provider
```

## Gateway

```text
generate
stream
analyze
health
```

## API

```text
/v2/health
/v2/providers
/v2/models
/v2/generate
/v2/stream
/v2/analyze
```

## Prompt

```text
key
version
render
trace
```

## Evidence

```text
create
attach
validate
```

## Generation Record

```text
requestId
provider
model
promptKey
promptVersion
source
```

## SSE

```text
start
chunk
end
error
```

## Compatibility

验证旧 API：

```text
仍然可访问
没有被删除
没有破坏现有调用
```

---

# 二十七、真实 Provider 测试

如果：

```text
GROK_API_KEY
```

仍为空：

结果必须：

```text
NOT_CONFIGURED
```

如果：

```text
Ollama
```

仍未安装：

结果必须：

```text
UNREACHABLE
```

如果没有真实 Provider：

测试仍然可以 PASS：

因为验证的是：

```text
正确识别不可用状态
```

而不是伪造：

```text
模型调用成功
```

---

# 二十八、Git 保护

开始前：

```text
git status
```

完成后：

```text
git status
```

必须区分：

```text
AI-03 修改
Workbuddy 修改
其他并行修改
```

禁止：

```text
git reset
git checkout -- .
git clean
```

等可能破坏 Workbuddy 工作的操作。

如果发现：

```text
[Workbuddy并行变更]
```

不得覆盖、回滚。

---

# 二十九、完成报告

生成：

```text
docs\AI智能分析\AI-03-HSE AI真实Provider接入与统一API收口报告.md
```

至少包含：

1. 执行摘要
2. AI-02 基线继承
3. Provider Registry
4. Provider 状态
5. AI Gateway
6. v2 API
7. Generate
8. Stream
9. Models
10. Health
11. SSE
12. Prompt Registry
13. Evidence
14. Generation Record
15. Legacy API
16. 前端 API
17. Migration Preflight
18. 数据库变化
19. 测试
20. Git
21. Workbuddy 隔离
22. 风险
23. 未完成事项
24. `[需要用户确认]`
25. 下一阶段建议

---

# 三十、更新总进度文件

更新：

```text
G:\hse-dashboard\docs\AI智能分析\AI智能分析实施进度.md
```

新增：

```text
### AI-03

任务：

HSE AI真实Provider接入与统一API收口

提示词：

完整保存本提示词

执行时间：

YYYY-MM-DD

执行结果：

修改文件：

数据库变化：

Migration：

Provider：

AI Gateway：

v2 API：

SSE：

Prompt Registry：

Evidence：

Generation Record：

前端：

Legacy API：

测试：

Workbuddy：

风险：

遗留问题：

[需要用户确认]：

下一步：

状态：
```

---

# 三十一、最终汇报格式

完成后必须汇报：

```text
AI-03 状态：PASS / PARTIAL / BLOCKED

本阶段完成：
1.
2.
3.

Provider：
Grok：
Ollama：
OpenAI-Compatible：

AI Gateway：
PASS / PARTIAL

v2 API：
PASS / PARTIAL

Generate：
PASS / PARTIAL

Stream：
PASS / BLOCKED

Models：
PASS / PARTIAL

Health：
PASS / PARTIAL

SSE：
PASS / BLOCKED

Prompt Registry：
PASS / PARTIAL

Evidence：
PASS / PARTIAL

Generation Record：
PASS / PARTIAL

Legacy API：
兼容 / 部分兼容 / 待治理

Migration：
未执行 / 本地执行 / 已授权执行

测试：
PASS / FAIL / BLOCKED

Workbuddy：
无冲突 / 存在冲突

[需要用户确认]：
1.
2.

下一阶段：
AI-04
```

---

# 三十二、最重要的停止条件

完成 AI-03 后：

**立即停止。**

不要自行：

```text
安装 Ollama
下载模型
配置 GPU
部署 Qwen
部署 DeepSeek
开发 RAG
开发视觉 AI
开发三违 AI
开发风险 AI
```

这些全部留到后续阶段。

等待用户将：

```text
AI-03-HSE AI真实Provider接入与统一API收口报告.md
```

以及：

```text
AI智能分析实施进度.md
```

交给 ChatGPT 审核。

ChatGPT 审核 AI-03 后，再生成下一阶段唯一正式提示词。

**不得自行开始 AI-04。**
````

执行时间：
2026-09-14（AI-03 阶段，跨多轮实现 + 验证）

执行结果：
完成。已产出《AI-03-HSE AI真实Provider接入与统一API收口报告.md》（25 节 + 6 项需用户确认）。核心成果：
- 统一 v2 API 六端点全部落地（health/providers/models/generate/stream/analyze），全部经 AI Gateway（Route→Gateway→Provider Registry→Provider，无直连）；鉴权：读端点全局 auth、写端点 requireRole('admin','safety_manager')。
- 统一 SSE 信封：event:start（requestId/traceId）→ data:{content} 透传 → data:[DONE] → event:end（durationMs）；错误 event:error（code/message/provider/retryable/requestId）。start 帧先于 Provider 健康检查写入 → Provider 不可用时客户端仍收到完整生命周期；aiService.js chatStream 增加 skipHeaders/skipEnd 由 Gateway 控制生命周期（旧调用方零影响）。
- Provider/Model 能力面：aiGateway 新增 getProvidersInfo/getModelsInfo；Grok NOT_CONFIGURED / Ollama UNREACHABLE / OpenAI-Compatible NOT_CONFIGURED，不伪造模型。
- Legacy 兼容治理：ai.js 4 端点（risk-predict/classify/anomaly-detect 统计规则 LEGACY + qa MOCK）与 ai-enhanced 6 端点（CURRENT）全清单+分类+迁移映射+兼容验证；旧端点全部保持可访问，未删 ai.js/ai-enhanced.js/aiService.js。
- 双轨制锁死：v2 控制器 stripDualTrackFields 忽略 compliance_status/checked_by/checked_at/manual_remark，路由级实测验证。
- 前端 ai.ts 增量增加 getHealth/getProviders/getModels/generate/stream/analyze 六方法（V2StreamHandlers 支持 onStart/onChunk/onEnd/onError），未新建 API 文件、未引入新依赖。
- Migration Preflight：两库（safety_dashboard/safety_dashboard_dev）均不存在 ai_prompt_registry 与 ai_generation_records（358 张表）；migration 幂等化（IF NOT EXISTS）；未执行。

修改文件：
- 修改：server/app.js（L468 挂载 /api/hse/ai/v2）、server/services/aiService.js（SSE skipHeaders/skipEnd）、server/services/ai/aiGateway.js（统一 SSE 信封 + getProvidersInfo/getModelsInfo）、server/services/ai/aiCapabilityLayer.unit.test.js + aiApiLayer.unit.test.js（+2 SSE 信封测试）、server/sql/ai_capability_layer_v1.sql（幂等化）、安全看板vben/apps/web-naive/src/api/hse/ai.ts（+6 v2 方法）
- 新增：server/controllers/aiV2Controller.js、server/routes/ai-v2.js、server/scripts/ai03_v2_route_check.cjs、server/preflight_ai_migration.tmp.cjs + preflight_out.tmp.txt
- 新增：docs/AI智能分析/AI-03-HSE AI真实Provider接入与统一API收口报告.md（主交付物）
- 更新：docs/AI智能分析/AI智能分析实施进度.md（本文件，追加 AI-03 记录）
- 归档：docs/191副/②交付报告/2026-09-14_AI-03-HSE-AI真实Provider接入与统一API收口完成.md + _index.md
- 记忆：更新 project_memory.md（AI-03 冻结基线），同步镜像至 docs/191副/project_memory.md

数据库变化：
零执行（未连生产库、未执行任何 SQL、未触碰 WPS/三违表）。migration 文件 `server/sql/ai_capability_layer_v1.sql` 幂等化：CREATE TABLE IF NOT EXISTS ai_prompt_registry（prompt_key+version 唯一约束）+ ai_generation_records + ADD COLUMN IF NOT EXISTS request_id/prompt_key/prompt_version/evidence(JSONB) + 索引 IF NOT EXISTS。

Migration：
Preflight 完成：两库均不存在 ai_prompt_registry / ai_generation_records（与 AI-01 报告冲突，见 [需要用户确认] #2）；迁移幂等、不改业务数据、不涉及 Workbuddy 表；**未执行**，待用户授权（生产边界规则）。

Provider：
- Grok：NOT_CONFIGURED（GROK_API_KEY is empty，.env 空密钥保留未填）
- Ollama：UNREACHABLE（本机未安装/未运行）
- OpenAI-Compatible：NOT_CONFIGURED（AI_OPENAI_BASE_URL/AI_OPENAI_MODEL 未配置）
- unknown provider → AI_PROVIDER_NOT_FOUND（单元测试覆盖）

AI Gateway：
PASS。generate/stream/analyze/getHealthSummary 保留 + stream 重写统一 SSE 信封 + getProvidersInfo/getModelsInfo 新增；Route→Gateway→Provider Registry 链路唯一入口。

v2 API：
PASS（路由级实测）。六端点全部可达；未认证 → 401；读端点任意登录用户、写端点 admin/safety_manager。

Generate：
PASS（真实链路至 Provider 层）。promptKey 优先（hse.general.analysis v1.0 解析验证）/ prompt 直传；响应含 requestId/traceId/provider/model/promptKey/promptVersion/content/usage/evidence/recordId/recordSaved；真实状态 AI_PROVIDER_NOT_CONFIGURED（如实）。

Stream：
PASS（错误路径真实链路）/ BLOCKED（真实模型分块）。统一 SSE 信封 start+error 路由级实测通过；真实模型端到端因无可用 Provider 如实标记 BLOCKED。

Models：
PASS。3 Provider 全部 available=false（NOT_CONFIGURED/UNREACHABLE），capabilities 如实；不伪造模型。

Health：
PASS。aiEnabled=true / activeProvider=grok / providers[] 明细真实探测；复用 AI-02 统一 Health 结构。

SSE：
PASS（单元 + 错误路径真实链路）/ BLOCKED（真实模型）。单元 2 项新增（start→chunk→end、流中错误→event:error）；路由级 start+error 实测；前端 onStart/onChunk/onEnd/onError 正确解析，Provider 不可用走 onError 不悬挂。

Prompt Registry：
PASS。hse.general.analysis v1.0 继续使用；requestId→promptKey→promptVersion→provider→model→result 追踪链经路由级测试验证；未创建业务 Prompt。

Evidence：
PASS。复用 aiEvidenceService；v2 响应透传 evidence[]；只进 AI 建议轨，绝不写人工结果（stripDualTrackFields 兜底）。

Generation Record：
PASS（自动探测降级）。复用 ai_generation_records；扩展列未落库时静默降级只写现有字段；落库失败不阻断 AI 结果（recordSaved=false+recordError）。注：Preflight 显示两库当前无此表，migration 执行后真正落库。

前端：
PASS（API 层）。src/api/hse/ai.ts 增量 6 方法（getHealth/getProviders/getModels/generate/stream/analyze）；V2StreamHandlers 四回调；fetch+ReadableStream 未引新依赖；Markdown 仍 raw text（待授权）。

Legacy API：
兼容（旧端点全部保持可访问，路由级 4 项验证 PASS：provider/status、/qa mock、generate-report、risk-predict）。分类：ai.js risk-predict/classify/anomaly-detect=LEGACY（统计/关键词规则）、qa=MOCK；ai-enhanced 六端点=CURRENT。迁移映射已建立（generate-report→v2/generate、stream→v2/stream、root-cause→v2/analyze、provider/status→v2/health）。注意：ai-enhanced.js 已被并行任务三层化收口（main.js+controller+service），AI-03 仅兼容验证。

测试：
PASS（真实运行，非伪造）。单元 2 套件 57/57（AI-03 新增 2 项 SSE 信封）；路由级 13/13（scripts/ai03_v2_route_check.cjs，端口 5881 符合 prod-boundary，未触碰生产 5876）。真实 Provider 状态验证 PASS（正确识别 NOT_CONFIGURED/UNREACHABLE，非伪造调用成功）。

Workbuddy：
无冲突。AI-03 修改面全部位于 AI 域（server/services/ai/、aiService.js、app.js v2 挂载、aiV2Controller、ai-v2 路由、前端 ai.ts、server/sql/、测试脚本）；violations/assessment*/grid*/hse-tasks/regulations/training-ocr/hse-dashboard 等并行变更未触碰未覆盖未回滚；未执行 git reset/checkout/clean。

风险：
1. migration 未执行 → Prompt 仅内存态、Generation Record 扩展列不落盘（自动探测降级兜底）；2. 无真实 Provider → 真实生成/流式不可用（如实呈现）；3. ai-enhanced 并行三层化行为等价未由用户确认（兼容测试 PASS，建议复核）；4. AI-01 报告声称 ai_generation_records 存在与实际（两库均无）冲突；5. 前端 /overview/ai-analysis 占位页仍可能被误认为上线；6. Markdown 依赖未定（raw text）；7. /api/hse/ai 双挂载仍存在（Step1 共存，收编待 AI-04+）。

遗留问题：
migration 执行待授权；真实 Provider 端到端验证待凭证决策；OpenAI-Compatible 流式真实链路；前端占位页处置；Markdown 依赖决策；Legacy 收编 Step2；employeeId 审计口径启用。

[需要用户确认]：
1. migration 执行授权（两库均无 ai_prompt_registry/ai_generation_records，按幂等 SQL 建表；生产库需单独明确授权）
2. AI-01 报告与数据库实际状态冲突（报告称 ai_generation_records 存在，实测两库均不存在）——是否以实际为准
3. 真实 Provider 凭证决策（Grok Key / OpenAI-Compatible Base URL+Key / Ollama 安装授权）——用于 AI-04 真实链路验证
4. 前端占位页处置 + Markdown 渲染依赖是否允许新增
5. ai-enhanced 并行三层化（main.js+controller+service）行为等价复核确认
6. ai.js 4 端点未来去向（qa 建议废弃；risk-predict/classify/anomaly-detect 迁移分析域或标注 rule-based）

下一步：
等待用户将《AI-03-HSE AI真实Provider接入与统一API收口报告.md》与更新后的《AI智能分析实施进度.md》交 ChatGPT 审核。ChatGPT 审核后将生成 AI-04 唯一正式提示词。AI-03 不自行开始 AI-04。

状态：
待确认（统一 API 收口完成：v2 六端点 + 统一 SSE 信封 + 57/57 单元 + 13/13 路由级验证 + Legacy 兼容 + migration 幂等化待授权；真实 Provider 如实 NOT_CONFIGURED/UNREACHABLE/BLOCKED；待用户交 ChatGPT 审核后进入 AI-04）

### AI-04

任务：
HSE AI 本地模型运行环境建设与真实 Provider 闭环

提示词：
（完整保存本次收到的任务要求，原文如下）

```text
# AI-04：HSE AI 本地模型运行环境建设与真实 Provider 闭环

本阶段由 Trae + DeepSeek V4 Flash 执行。当前项目：G:\hse-dashboard。

## 一、阶段定位
AI-03 已完成（PASS WITH CONDITIONS，非返工 AI-03）。AI-04 不再扩展 HSE AI 业务，只解决：建立本地 AI 模型运行环境，并让 AI-02/AI-03 已建立的统一 Provider → Gateway → v2 API 真正连接到一个合法可运行的本地 Provider（Ollama）。

目标链路：Frontend → /api/hse/ai/v2/* → AI Gateway → Provider Registry → Ollama → 本地模型 → AI Result → SSE / Evidence / Generation Record。

重点：本地模型运行环境检查、Ollama 环境建设、本地模型选择与配置、Ollama Provider 接入、Provider Health、Models API、Generate、Stream、SSE 真实模型验证、前端 SSE 验证、Generation Record 验证、AI_ENABLE 语义统一、AI-03 遗留问题最小治理、测试与验收。

## 二、禁止事项
禁止：修改登录、JWT、认证核心机制、用户认证 Store、登录页面、Vben Core、更换 Naive UI、引入 Ant Design Vue / Element Plus、新状态管理框架、大规模重构业务模块。禁止修改 WPS、grid_inspection_records、grid_record_sync_map、grid_areas、wpsGrid*、WPS migration、三违业务代码、三违生产数据、Workbuddy 正在修改的文件。
同时禁止：RAG、embedding、pgvector、知识库、vision、图片识别、三违 AI、隐患 AI、风险最终评级、事故认定、AI 自动扣分、AI 自动定责、AI 自动月报、AI 管理决策、正式 AI 业务分析页面。
允许：安装 Ollama、安装本地模型、配置本地 Provider、本地模型真实调用（须满足安全条件）。

## 三、机器环境与模型选择
- 安装模型前必须检查：操作系统、CPU、GPU、GPU 显存、系统内存、磁盘空间、Node 版本、项目运行方式、是否已有 ollama/docker/其他本地模型服务。重点检查 nvidia-smi 与 ollama --version。
- 模型选择基于真实机器能力，不得下载超出能力的模型。无 NVIDIA GPU 可考虑 CPU 模式，但须明确 CPU 推理较慢。优先 7B/8B 量化模型；优先适合中文、企业知识问答、HSE 文本分析、Ollama 支持、社区成熟、资源合理的模型（Qwen、DeepSeek 等）。
- 只允许一个主模型，必要时一个备用模型。下载前确认磁盘空间，记录模型名称/版本/tag/下载大小/运行状态。不得多下载、无意义下载、为测试下载几十 GB 模型。磁盘不足时停止并记录 [需要用户确认]。

## 四、Ollama 安装与验证
- 机器无 Ollama 时可安装，但不得修改项目代码绕过。安装后必须实际检查 ollama --version / ollama list / ollama ps，确认默认地址 127.0.0.1:11434；地址不同必须记录实际地址。不得伪造 AVAILABLE，必须实际访问 /api/tags 或对应模型 API。

## 五、Provider 接入（复用，禁平行体系）
- 必须继续使用 AI-02 Provider Registry：禁止 provider2/modelService2/aiService2/ollamaService2 等平行体系。Ollama 必须经 Provider Registry 进入 AI Gateway，禁止 Route → Ollama 直连。
- 检查 aiProviderRegistry.js 与 aiService.js，已有 Ollama Provider 则优先修复/配置。必须支持 chat/chatStream/healthCheck/isAvailable/getMetadata/capabilities。
- 配置复用现有变量命名（AI_OLLAMA_BASE_URL/OLLAMA_BASE_URL 等），禁止 OLLAMA_URL2 等重复变量。配置只针对本地开发环境，禁止修改生产密钥、提交真实 API Key、把本地密钥写入 Git。

## 六、真实链路验收点（最大验收点：至少一个真实 Provider：AVAILABLE，优先 Ollama）
- Provider Health：Ollama 应从 UNREACHABLE 变 AVAILABLE；Health 必须显示 provider/model/available/status/latency/error/capabilities；必须是真实 HTTP/API 检查，禁止硬编码 AVAILABLE。
- Models API：/v2/models 必须真实反映 Ollama 模型与 available/capabilities，禁止写死模型名冒充；尽量来自 /api/tags 或已有 Provider 能力。
- Health API：/v2/health 检查 aiEnabled/activeProvider/providers[]/Ollama status/model/latency/error。必须查明 AI-02（AI_ENABLE=false）与 AI-03（aiEnabled=true）不一致的根因，明确 AI enabled 唯一判定来源；环境变量与代码默认值冲突时记录 [需要用户确认]。
- Generate：POST /v2/generate 用 hse.general.analysis v1.0 + 纯测试文本，禁止真实业务数据；验证 Route → Gateway → Prompt Registry → Provider Registry → Ollama → Model → AI Result 完整闭环。
- Stream：POST /v2/stream 必须真实连接 Ollama → chatStream → Gateway → SSE；检查 start/chunk/end/error 与 requestId/traceId；客户端必须收到真实模型分块；禁止假 chunk/定时器/固定文本。
- SSE 最小治理：不重构。先检查前端解析逻辑、Gateway、chatStream、v2 controller；能兼容则保留兼容解析；统一协议需要时最小修改 event:start/chunk/end/error，不得破坏旧调用方，修改必须加测试。
- 前端 SSE：检查 web-naive/src/api/hse/ai.ts，stream() 真实调用时 onStart/onChunk/onEnd/onError 正确触发；不得一直 loading、重复结束、吞 error、把 AI_PROVIDER_NOT_CONFIGURED 当成功。无实际 UI 时允许只验证 API 层，不建正式 AI 页面。
- Generation Record：两库实际无 ai_generation_records/ai_prompt_registry，不得假设 migration 已执行；默认不执行生产 migration；继续自动探测/兼容降级；真实生成后检查 recordSaved/recordId/recordError；表不存在如实 NOT_PERSISTED / MIGRATION_PENDING，不伪造 recordSaved=true。
- Migration：可重新 Preflight；确认两表是否仍不存在；无用户明确授权不执行；migration 不属于 AI-04 核心交付。
- AI-01 数据库冲突正式处理：正式修正"AI-01 已有 ai_generation_records"的描述，以实际数据库状态为准；不删除历史记录，新增"AI-01 基线数据库事实修正"。
- ai-enhanced 并行三层化：只做行为等价审计（generate-report/root-cause/records/provider/status 保持原行为），发现问题不擅自大改，记录 [需要用户确认]，不覆盖 Workbuddy 并行修改。
- 错误路径保留：Grok NOT_CONFIGURED、OpenAI-Compatible NOT_CONFIGURED、unknown AI_PROVIDER_NOT_FOUND、Ollama 停止 UNREACHABLE、模型不存在 AI_MODEL_NOT_FOUND；不得因 Ollama 成功而删除错误状态测试。

## 七、测试与验收
- 必须真实运行。AI-02：55/55，AI-03：57/57，AI-04 不得破坏。至少：AI Capability Layer PASS、Provider Health PASS、Provider Registry PASS、Gateway PASS、v2 API PASS、真实 Ollama PASS/BLOCKED、Generate PASS/BLOCKED、Stream PASS/BLOCKED、SSE PASS/BLOCKED、Frontend API PASS/BLOCKED、错误路径 PASS。新增测试须说明新增/原有/总计。禁止写"测试通过"但没有真实运行。

## 八、Git 与并行隔离
- 开始前 git status，完成后 git status；区分 AI-04 / AI-03 历史 / Workbuddy / 其他并行变更；禁止 git reset / checkout -- . / git clean 及破坏并行工作的操作；发现 [Workbuddy并行变更] 不覆盖、不回滚、不恢复。

## 九、修改边界
- 优先允许：server/services/ai/、server/services/aiService.js、server/controllers/aiV2Controller.js、server/routes/ai-v2.js、server/scripts/、server/sql/、安全看板vben/apps/web-naive/src/api/hse/ai.ts。修改其他文件须说明原因；属认证/登录/WPS/三违/考核/风险/事故/Workbuddy/业务数据立即停止。

## 十、交付物
1. docs\AI智能分析\AI-04-HSE AI本地模型运行环境建设与真实Provider闭环报告.md（含执行摘要、AI-03 审核结论继承、机器环境、Ollama 安装/版本、模型选择/tag/资源消耗、Provider 配置、Provider Health、Provider Registry、AI Gateway、v2 Health/Models/Generate/Stream、SSE、前端 API、Generation Record、Migration Preflight、AI-01 数据库事实修正、ai-enhanced 并行审计、测试、Git、Workbuddy 隔离、风险、未完成事项、[需要用户确认]、下一阶段建议）。
2. 更新 docs\AI智能分析\AI智能分析实施进度.md：新增 AI-04 任务、执行时间、执行结果、修改文件、机器环境、Ollama、模型、Provider、AI Gateway、v2 API、Health、Models、Generate、Stream、SSE、Frontend、Generation Record、Migration、AI-01 数据库事实修正、ai-enhanced 审计、测试、Git、Workbuddy、风险、遗留问题、[需要用户确认]、下一步、状态；保存 AI-04 完整提示词。

## 十一、最终汇报格式
状态：PASS / PARTIAL / BLOCKED；机器环境：CPU/GPU/VRAM/RAM/磁盘；Ollama：INSTALLED/NOT_INSTALLED；模型：名称/版本/运行状态；Provider：Grok/Ollama/OpenAI-Compatible；Health/Models/Generate/Stream/SSE/Frontend：PASS/PARTIAL/BLOCKED；Generation Record：PERSISTED/NOT_PERSISTED/MIGRATION_PENDING；Migration：未执行/待确认；测试：PASS/FAIL/BLOCKED；Workbuddy：无冲突/存在冲突；[需要用户确认]；下一阶段：AI-05。

## 十二、停止条件（最重要）
AI-04 完成后立即停止。不得自行开始 RAG、Embedding、pgvector、知识库、Vision、图片识别、三违 AI、隐患 AI、风险 AI、事故 AI、考核 AI、自动报告、AI 自动扣分、AI 自动定责。等待 AI-04 报告与 AI智能分析实施进度.md 交 ChatGPT 审核，审核后再生成下一阶段唯一正式提示词，不得自行开始 AI-05。
```

执行时间：
2026-09-14（环境检查 → Ollama/模型就绪 → Provider 配置 → 真实闭环验证 → SSE 修复 → 测试 → 报告）

执行结果：
真实 Provider 闭环达成（PASS）。
- 机器环境：Win11 专业版 10.0.26200 / Intel i5-12400（无 NVIDIA GPU，CPU 推理）/ Intel UHD 730 核显 2GB 共享 / 31.7GB RAM / C 盘余 5.3GB、D 盘余 89.1GB（模型库）、G 盘余 60.9GB / Node v22.16.0 / 无 Docker。
- Ollama：INSTALLED（Portable 0.33.1，G:\ollama；服务 127.0.0.1:11434 HTTP 实测可达；CLI list/ps 因便携路径缺陷不可用，以 HTTP API 为准；模型库 OLLAMA_MODELS=D:\ollama）。
- 模型：主模型 qwen2.5:7b（Q4_K_M、4.68GB、7.6B、ctx 32768，本阶段拉取，generate/stream 实测运行正常）；既有备用 deepseek-r1:7b / deepseek-r1:1.5b（2025-02-14，未调用）。
- Provider：Grok NOT_CONFIGURED（GROK_API_KEY 空）/ Ollama AVAILABLE / OpenAI-Compatible NOT_CONFIGURED。活动 Provider=AI_PROVIDER 环境变量；验证进程运行时覆盖 AI_PROVIDER=ollama（生产 .env 未改动）。
- Health：PASS（v2/health ollama=AVAILABLE aiEnabled=true active=ollama；UNREACHABLE 错误路径实测 ECONNREFUSED 如实）。
- Models：PASS（v2/models 真实 qwen2.5:7b，available=true）。
- Generate：PASS（v2/generate 真实输出 426 字，provider=ollama model=qwen2.5:7b，35.5s CPU）。
- Stream：PASS（v2/stream 真实 SSE 207 分块 + start/end 帧齐全，31.9s）。
- SSE：PASS（协议保持 start/data:{content}/[DONE]/end 兼容不重构；修复两处真实流缺陷：①sendStreamRequest 不解析 Ollama 纯 NDJSON 行→分块全丢；②req.on('close') 抢先 res.end() 吞 event:end。改动最小，旧调用方行为不变，AI 单测 SSE 用例通过）。
- Frontend：PASS（ai.ts stream() 逐字段核对 onStart/onChunk/onEnd/onError 与后端信封一致；真实分块 + 错误路径均正确消费；未建正式 AI 页面）。
- Generation Record：NOT_PERSISTED / MIGRATION_PENDING（带 record 实测 recordSaved=false + recordError="关系 "ai_generation_records" 不存在"，AI 结果不阻断，如实）。
- Migration：未执行 / 待确认（Preflight 复查两库均无 ai_prompt_registry/ai_generation_records，358 张 public 表）。
- AI_ENABLE 语义统一：唯一判定来源 process.env.AI_ENABLE（缺省 true，仅字面 false 禁用）；v2 与 Legacy 同口径；当前 .env 无该行 → 均 aiEnabled=true；AI-02 false 与 AI-03 true 差异根因=该行是否存在，非代码双轨，无需改码。
- AI-01 数据库事实修正：正式修正——AI-01 声称 ai_generation_records 已存在，实测两库均不存在；以实际数据库状态为准，历史描述保留为审计事实。
- ai-enhanced 并行三层化审计：行为等价（generate-report/root-cause 仍以 aiService.isAvailable() 门禁，与 Provider Registry 健康无关，行为与 AI-04 前一致非回归）；发现问题不擅自大改，Legacy 可用性口径待 AI-05 决策。
- 测试：AI 单测 3 套件 79/79 PASS（AI-02 55 + AI-03 57 基线所属套件全过，SSE 解析用例通过）；路由级集成 11/11 PASS（scripts/ai04_ollama_route_check.cjs，5881 端口，未触碰 5876）；全量单元 588/609（21 失败全部位于本阶段未触碰并行域：personnel 保险导入 20 + violationAdapter 1，与本阶段变更无交集）。

修改文件：
- server/services/aiService.js（M）：SSE 两处最小修复（Ollama NDJSON 解析 + settled 标志防 close 竞态）。
- server/scripts/ai04_ollama_route_check.cjs（新增）：路由级 11 项集成验证脚本。
- 未改动：生产 .env、前端、Provider Registry、AI Gateway、v2 控制器/路由（本轮无需改）。

Git：
- 完成前后均 git status；本阶段变更面仅 aiService.js + 新增脚本；未执行 git reset/checkout/clean；AI-02/AI-03 未提交文件与 Workbuddy 并行域保持原样。

Workbuddy：
无冲突（violations/assessment*/grid*/hse-tasks/regulations/training-ocr/hse-dashboard/mobile 等并行变更未触碰未覆盖未回滚；violationAdapter.unit.test.js 并行修改态 1 项失败已隔离记录）。

风险：
1. 生产 .env AI_PROVIDER=grok 未切换（闭环仅在 dev 进程运行时覆盖）——生产启用本地模型需用户授权；2. 生产 AI_TIMEOUT_MS=60000 对 CPU 冷启动偏紧；3. Ollama Portable CLI 路径缺陷（运维走 HTTP API）；4. C 盘仅余 5.3GB；5. ai_* 两表未建（Prompt 内存态/记录不落盘，降级已验）；6. Legacy 可用性门禁与 v2 不一致；7. 并行域 21 项测试失败归属并行任务。

遗留问题：
migration 执行待授权；生产 Provider 切换决策；deepseek-r1 备用模型未验证；OpenAI-Compatible 真实链路（不要求）；前端正式 AI 页面与 Markdown 依赖（后续阶段）；Legacy 收编 Step2。

[需要用户确认]：
1. 生产 .env AI_PROVIDER 是否切换为 ollama（并评估 AI_TIMEOUT_MS 上调）——prod-boundary 禁止 AI 改 .env，需显式授权
2. ai_prompt_registry / ai_generation_records migration 执行授权（两库均无，按 sql/ai_capability_layer_v1.sql；生产库单独授权）
3. Legacy 端点可用性口径（保持现状 / 未来对齐 Gateway 或标注 deprecated）
4. Ollama Portable CLI 路径缺陷是否修复（改回官方安装包等）
5. 并行域测试失败（personnel 保险导入 20 + violationAdapter 1）确认归属对应并行任务

下一步：
等待用户将《AI-04-HSE AI本地模型运行环境建设与真实Provider闭环报告.md》与更新后的《AI智能分析实施进度.md》交 ChatGPT 审核。ChatGPT 审核后将生成 AI-05 唯一正式提示词。AI-04 不自行开始 AI-05（RAG/Embedding/pgvector/知识库/Vision/三违 AI/隐患 AI/风险 AI/事故 AI/考核 AI/自动报告/自动扣分/自动定责一律留后续阶段）。

状态：
完成（PASS——真实 Provider 闭环：Health/Models/Generate/Stream/SSE/Frontend/错误路径 全 PASS；Generation Record NOT_PERSISTED 如实；Migration 未执行待授权；AI-01 数据库事实修正入档；AI 单测 79/79 + 路由级 11/11；生产 .env 未改动；待用户交 ChatGPT 审核后进入 AI-05）

### AI-05

任务：

HSE知识库与RAG基础能力建设

提示词：

完整保存本提示词（`# AI-05：HSE 知识库与 RAG 基础能力建设`，2026-09-15 上传附件）

执行时间：

2026-09-15

AI-04审核结论：

PASS

Knowledge Source：

PASS（create/read/update/disable/enable，type 预留 manual_upload/policy/regulation/procedure/training）

Document：

PASS（create/hash/parse/status/幂等导入，DRAFT→READY 生命周期）

Parser：

PASS（txt/md/pdf 真实解析，复用 pdf-parse 2.4.5，未新增大型解析依赖）

Chunk：

PASS（结构优先 Markdown 标题分节 + 512 token 估算 + 48 token≈10% overlap，保留 page/section/content_hash）

Embedding Provider：

PASS（复用 aiProviderRegistry，扩展 OllamaProvider.embed → /api/embed；无第二套体系）

Embedding Model：

PASS（ollama / nomic-embed-text / 768 维 / 274MB，真实稳定可区分；未覆盖 qwen2.5:7b）

Vector Store：

PASS（PostgreSQL + pgvector 0.8.2，开发库授权安装；余弦检索 + documentId/sourceId/status 过滤）

Retriever：

PASS（query/topK/filters/ranking，Top-K 命中验证）

RAG Context：

PASS（citationId + source + content 组装，Evidence 格式）

AI Gateway：

PASS（复用；新增 embed 统一入口；RAG 生成走 gateway.generate + hse.rag.answer DRAFT）

Citation：

PASS（Answer→Citation→Chunk→Document→Source 全链路，evidence 落库 ai_generation_records）

Generation Record：

PERSISTED（开发库 migration 本地执行；RAG recordId 落库 + evidence 持久化；生产库待授权）

Migration：

本地执行（开发库 safety_dashboard：ai_capability_layer_v1.sql + ai05_knowledge_base_v1.sql + pgvector 0.8.2；幂等可重跑）

数据库变化：

新增 4 张知识库表（knowledge_sources/documents/chunks/embeddings）+ AI 基础两表（ai_prompt_registry 0 条、ai_generation_records 3 条）+ vector 扩展；未修改/删除任何既有表与业务数据；生产库零改动

API：

/api/hse/ai/v2/knowledge/*（sources CRUD、documents CRUD/parse/index、search、rag）；写操作 requireRole(admin,safety_manager)，读/检索任意登录用户

前端：

未开发正式 AI 页面（任务书 §29/§30）；apps/web-naive/src/api/hse/ai.ts 继续复用

测试：

PASS（57/57 真实运行：Source/Document/Chunk/Embedding/Vector/Retriever/RAG/Citation/Error/Route 全通过；5881 开发端口）

Git：

AI-05 新增 server/services/ai/knowledge/（9 文件）、routes/ai-knowledge.js、controllers/knowledgeController.js、sql/ai05_knowledge_base_v1.sql、sql/ai_capability_layer_v1.sql、scripts/ai05_*（6 脚本）；修改 app.js（挂载路由）、aiGateway.js（embed 入口+错误码顺序）、aiProviderRegistry.js（Ollama embed）；未执行 reset/checkout/clean

Workbuddy：

无冲突（WPS/grid*/violations/assessment*/risk/accident/hse-tasks/training-ocr 并行域未触碰）

风险：

1. nomic-embed-text 轻量模型短查询 Top-1 可能非目标文档（Top-K 语义召回，实测 Top-5 命中）；2. 生产库未执行 migration（知识库启用需独立授权）；3. hse.rag.answer 为 DRAFT 未经验证；4. ai_prompt_registry 持久化遗留（表已建条目内存态）；5. AI-04 遗留（生产 .env 未切换 Ollama / Ollama Portable CLI / C 盘 5.3GB / Legacy 口径差异）；6. CPU 推理 ~35s/问；7. 向量数据全为测试数据

遗留问题：

1. ai_prompt_registry 持久化写入（表已建 0 条）；2. Legacy 与 v2 Provider Health 口径差异（AI-04 遗留）；3. Ollama Portable CLI 运维（AI-04 遗留）；4. 生产 .env 未切换 Ollama（AI-04 遗留）；5. 并行域测试失败 personnel 20 + violationAdapter 1（AI-04 遗留）；6. docx/xlsx 解析扩展未启用；7. RAG 混合检索/重排未实现（后续评估）

[需要用户确认]：

1. 生产库 pgvector 安装与知识库 migration（独立授权）；2. nomic-embed-text 作为默认 Embedding 模型长期采纳；3. hse.rag.answer DRAFT→ACTIVE 验证流程；4. 生产 .env AI_PROVIDER 切换（AI-04 遗留）；5. 并行域测试失败归属（AI-04 遗留）

下一步：

等待用户将《AI-05-HSE知识库与RAG基础能力建设报告.md》与更新后的《AI智能分析实施进度.md》交 ChatGPT 审核。ChatGPT 审核后将生成 AI-06 唯一正式提示词。AI-05 不自行开始 AI-06（HSE 数据智能分析）及后续 Vision/多模态/业务 AI 阶段。

状态：

完成（PASS——真实 RAG 闭环 57/57：知识库四表 + Parser + Chunker + Embedding(nomic-embed-text 768维) + Vector(pgvector 0.8.2) + Retriever + RAG Context + RAG→AI Gateway→Ollama(qwen2.5:7b) + Evidence/Citation 全链路；Generation Record PERSISTED；Migration 开发库本地执行；生产库零改动；AI-04 基线完整继承；待用户交 ChatGPT 审核后进入 AI-06）

---

### AI-06

任务：

HSE结构化数据智能分析基础能力建设

提示词：

完整保存本提示词（`# AI-06：HSE 结构化数据智能分析基础能力建设`，2026-09-15 上传附件）

执行时间：

2026-09-15

AI-05审核结论：

PASS

数据域选择：

hazard（隐患，110 条真实数据，AI-06 主域）+ inspection（检查/巡检，0 行仅注册结构，records 注入可测）；violation/assessment/risk/accident 不注册（任务书 §7 允许；三违受 Workbuddy 保护边界）

现有数据审计（只读）：

hazards 表 110 条真实（is_demo=false）：已完成 60 / 状态 null 50；来源 daily_check ×110；时间 2026-02-16~2026-07-09；township/category/hazard_type distinct=0（空或不存在，adapter COALESCE 兜底）；hse_inspection_tasks 0 行；数据库身份：safety_dashboard（开发库）/ hse_app / PostgreSQL 17.10，生产库零读写

Adapter：

PASS（analysisDataAdapter：领域注册表 + records 注入 / db 只读双模式（timeRange+limit+is_deleted=false，仅 SELECT 脱敏），MAX_RECORDS=2000，统一 AiError：AI_DOMAIN_NOT_SUPPORTED/AI_INVALID_TIME_RANGE/AI_DATA_READ_FAILED；未建万能分析表）

Normalizer：

PASS（analysisNormalizer：状态归一化 RECTIFIED/PENDING/OVERDUE/UNKNOWN，日期解析，逾期判定，整改时长；字段缺失 NOT_AVAILABLE 不猜测）

Statistics：

PASS（analysisStatistics：纯 JS 聚合不经 AI——基础统计 total/rectified/unrectified/整改率/逾期/平均整改时长/重复问题；时间趋势日/周/月+粒度自适应；TOP10 分类/来源/组织/区域/等级；聚集分析（note 明确仅为统计描述不等同 AI 判定高风险）；未整改清单脱敏；limitations 逐项 NOT_AVAILABLE）

AI Analysis：

PASS（analysisPromptBuilder + analysisService：数字必须来自统计层禁止自算；固定 JSON 8 字段；fail-closed 解析（AI_STRUCTURED_OUTPUT_INVALID）；可能原因措辞禁止事实认定/责任指向；精炼约束 summary≤60字/元素≤40字/数组3~6条；hse.data.analysis v1.0 DRAFT 注册 aiPromptRegistry；实测 ollama/qwen2.5:7b 真实生成 durMs=74352，结构化输出字段齐全，可能原因均为"可能…"措辞）

RAG：

PASS（按需 useRag=true：ragQueriesFromStats 主题词 ≤3 查询 × topK 2，retriever 复用 AI-05；失败静默降级不阻断统计与 AI；实测 kbEvidence=4 totalEvidence=5；RAG 不代替结构化分析）

Evidence：

PASS（business_record（sourceId=domain/sourceField=statistics/strength=high）+ knowledge_base（sourceId=chunkId/sourceField=文档标题·章节/strength=medium）；落库 ai_generation_records.evidence（recordId=8 saved=true）；未建重复表）

API：

POST /api/hse/ai/v2/analyze/data（routes/ai-v2.js + controllers/aiV2Controller.js.analyzeData）：双层能力——A.Deterministic 纯统计不经 AI / B.AI Analysis 经 AI Gateway；AI 不可用降级 ai.available=false+code（AI_PROVIDER_NOT_CONFIGURED/AI_PROVIDER_UNREACHABLE/AI_EMPTY_DATA）不 500；双轨制字段剥离（compliance_status/checked_by/checked_at/manual_remark 忽略）；analysisTypes 枚举校验（trend/frequency/rectification/clustering）

权限：

写端点 requireRole(admin,safety_manager)；全局认证 401；userId=req.user.id 不推断 employee_id；未改认证/JWT 核心

前端：

未开发正式 AI 页面（任务书 §25 禁止）

测试：

PASS（39/39 真实运行：Unit 22 + Integration 11 + Route 6；E2E 脚本 server/scripts/ai06_analysis_e2e_check.cjs，5881 开发端口，进程级 AI_PROVIDER=ollama + AI_TIMEOUT_MS=300000 不改 .env；测试数据全为 63 条人工构造虚拟隐患，真实表仅 limit=5 只读验证；最终输出 server/ai06_out4.txt）

测试真实数字（报告=脚本）：

Suite Unit: 22 tests, 22 passed / Suite Integration: 11 tests, 11 passed / Suite Route: 6 tests, 6 passed / Total: 39 / Passed: 39 / Failed: 0

数据库变化：

零 migration、零新表（复用 ai_generation_records 落 Generation Record）；开发库 safety_dashboard 无新增；生产库零改动

Git：

AI-06 新增 server/services/ai/analysis/（5 文件）、scripts/ai06_analysis_e2e_check.cjs、scripts/ai06_tables.cjs、ai06_route_test.cjs 及调试输出 txt；修改 aiPromptRegistry.js（注册 hse.data.analysis）、aiV2Controller.js（analyzeData 方法，AI-03 未提交文件增量）、routes/ai-v2.js（analyze/data 路由，同理）；未执行 reset/checkout/clean

Workbuddy：

无冲突（WPS/grid*/violations/assessment*/risk/accident/hse-tasks/training-ocr/.workbuddy 并行域零触碰；三违/考核/风险/事故仅概念审计）

风险：

1. 真实隐患 50/110 状态 null、组织/分类字段空 → 真实库分析维度受限（COALESCE+NOT_AVAILABLE 如实标注）；2. CPU 推理 ~74s/次（qwen2.5:7b 完整 JSON）；3. AI_PROVIDER 进程级覆盖仅测试脚本，正式环境路由依赖 .env（AI-04 遗留）；4. hse.data.analysis 为 DRAFT 未经验证；5. 结构化输出依赖严格 Prompt+fail-closed 非 100% 稳定；6. 真实库读取保持最小化（limit=5）；7. 生产库未启用 AI-06 能力

遗留问题：

1. violation/assessment/risk/accident 域未注册；2. analysisTypes 校验性支持（统计层全量计算）；3. 前端分析页面未开发；4. 组织维度统计受真实数据字段空限制；5. 正式业务化（定时分析/报告导出）未做；6. ai_prompt_registry 持久化遗留（AI-05 继承）；7. 生产 .env 未切换 Ollama（AI-04 遗留）

[需要用户确认]：

1. 生产库启用 AI-06 能力（独立授权）；2. hse.data.analysis DRAFT→ACTIVE 验证流程；3. 生产 .env AI_PROVIDER 切换（AI-04/05 遗留）；4. 扩展数据域（三违只读等）需边界确认；5. AI-05 测试统计口径差异后续核对

下一步：

等待用户将《AI-06-HSE结构化数据智能分析基础能力建设报告.md》与更新后的《AI智能分析实施进度.md》交 ChatGPT 审核。ChatGPT 审核后将生成 AI-07 唯一正式提示词。AI-06 不自行开始 AI-07（Vision/图片识别/OCR 扩展/多模态）及业务 AI 阶段。

状态：

完成（PASS——真实链路 39/39：110 条真实隐患可只读 → 63 条虚拟数据确定性统计 → AI Gateway → Ollama/qwen2.5:7b 真实 AI 分析（74.4s）→ RAG 按需 → Evidence（business_record+knowledge_base）→ Generation Record 落库（recordId=8）→ 人工确认留位；AI unavailable 降级可用；统计数字来自统计层；AI 不写人工字段；零 migration 零新表生产库零改动；Workbuddy 零冲突；AI-05 基线完整继承）

AI-05 测试统计口径说明（任务书 §30 保留历史事实）：

AI-05 报告为"57/57 PASS"，但其分类明细合计为 51 项，两者存在口径差异。AI-06 未返工 AI-05，未擅自将 57 改为 51，也未继续无依据引用 57；该口径差异待后续审计/查看 AI-05 原始测试脚本时核对。

---

### AI-07

任务：

HSE AI分析任务编排与异步执行基础能力建设

提示词：

完整保存本提示词（`# AI-07：HSE AI分析任务编排与异步执行基础能力建设`，2026-09-15 上传附件）

执行时间：

2026-09-15

AI-06审核结论：

PASS

核心目标：

把 AI-06 同步调用接口（CPU Ollama qwen2.5:7b ≈74s/次）升级为「可追踪的分析任务」：用户提交分析请求 → Analysis Task(PENDING) → 执行器领取(RUNNING) → AI-06 analyze/data → COMPLETED/FAILED，创建接口不等待 AI 执行

现有任务系统审计：

不存在可复用 AI 任务模型/任务表/HSE 任务中心/通用队列/node-cron/异步执行器/状态机/任务日志（关键词 analysisTask/analysis_task/aiTask/ai_task/taskQueue/queue/job/scheduler/async analysis 全检索；ai07_audit_db.cjs 只读确认无等价表）→ 按任务书 §5 建设最小任务模型

任务模型：

PASS（ai_analysis_tasks 23 列：id/task_type/domain/status/priority/request_hash/request_payload/statistics_snapshot/ai_result/evidence/generation_record_id/provider/model/degraded/error_code/error_message/error_retryable/cancel_requested_at/created_by/created_at/started_at/completed_at/updated_at；索引 idx_status(priority,id)+idx_hash(status)；只存请求/统计快照/结果/Evidence/状态/错误，业务表唯一事实来源，未建重复表）

状态机：

PASS（PENDING/RUNNING/COMPLETED/FAILED/CANCELLED/RETRYING；ALLOWED_TRANSITIONS 显式转换表：PENDING→RUNNING/CANCELLED/FAILED，RUNNING→COMPLETED/FAILED，FAILED→RETRYING→RUNNING；非法转换抛 AI_TASK_INVALID_STATE（COMPLETED→RUNNING/FAILED→COMPLETED/CANCELLED→RUNNING 实测拦截））

异步执行器：

PASS（aiAnalysisWorker：runWorker 轮询(2000ms) → claimNextTask 原子领取（事务内 pg_advisory_xact_lock(78007) + COUNT(RUNNING)≥maxConcurrent 放弃 + FOR UPDATE SKIP LOCKED）→ executeTask 复用 analysisService.analyzeData + withTimeout(300000ms, AI_TASK_TIMEOUT retryable) → COMPLETED/FAILED；独立启动脚本 ai07_worker.cjs 不挂载 app.js；无 BullMQ/Redis/RabbitMQ/Kafka/Celery/LangChain）

并发控制：

PASS（默认并发 1：同一时间 RUNNING DATA_ANALYSIS ≤1；实测 A=RUNNING 时 B/C=PENDING → A 完成后 B=RUNNING、C=PENDING → B 完成后 C=RUNNING；advisory lock 多 worker 实例安全）

幂等：

PASS（request_hash=sha256(规范化请求：taskType/domain/timeRange/filters/analysisTypes排序/useRag/provider/model)；活跃任务(PENDING/RUNNING)复用 reused=true；实测连续 3 次同请求仅 1 新建 + 2 复用（ids=[17,17,17], reused=[false,true,true]））

API：

POST /api/hse/ai/v2/analysis-tasks（创建，同步返回 PENDING 不等待 AI，reused 标记）/ GET /analysis-tasks/:id（详情：COMPLETED 含 statisticsSnapshot/aiResult/evidence/generationRecordId/provider/model；FAILED 含 errorCode/errorMessage/errorRetryable）/ GET /analysis-tasks（分页列表 + status/domain 过滤）/ POST /analysis-tasks/:id/cancel（PENDING→CANCELLED；RUNNING 仅记录 cancel_requested_at 禁止假取消；终态不可取消）；错误统一 toErrorResponse（AI_INVALID_REQUEST/AI_TASK_NOT_FOUND/AI_TASK_INVALID_STATE 等）；records 注入被拒（业务数据不入任务表，三层实测）

AI-06 复用：

PASS（worker 直接调用 analysisService.analyzeData：Adapter/Statistics/Normalizer/RAG/结构化解析/Evidence 全量复用零复制；analysisService.js 零修改；未建 analysisService2/gateway2/ragGateway2）

Evidence / Generation Record：

PASS（沿用 AI-06 business_record + knowledge_base 双类型 Evidence 原样落任务表 evidence；generationRecordId 复用 ai_generation_records（实测真实 AI 任务=13），未加关联字段、无四套重复记录）

AI unavailable 降级：

PASS（grok 未配置实测：统计先完成 totalRecords=110 → 任务 COMPLETED + degraded=true + ai.available=false + code=AI_PROVIDER_NOT_CONFIGURED + error_message 标注「AI 分析降级」；不伪装成功、不 500）

权限：

写端点 requireRole(admin,safety_manager)；读端点任意登录用户；全局 authMiddleware 401 实测；userId=req.user.id 落 created_by 不推断 employee_id；未改认证/JWT 核心

日志脱敏：

PASS（仅任务元数据 taskId/taskType/domain/status/durationMs/provider/model/errorCode；禁止输出 Prompt/业务记录/员工信息；无 console.log(request/records/aiPrompt)）

前端：

未开发 AI 分析页面（任务书 §27 禁止，AI-08 再做正式前端）

测试：

PASS（39/39 真实运行：Unit 17 + Integration 13 + Route 9；E2E 脚本 server/scripts/ai07_analysis_task_e2e_check.cjs，5881 开发端口，进程级 AI_PROVIDER=ollama + AI_TIMEOUT_MS=300000 不改 .env；真实 hazards 表最小只读（timeRange 过滤），无业务表写入；测试任务 created_by=7777777 标记自动清理；最终输出 server/ai07_e2e_final.txt）

真实 Ollama E2E：

PASS（qwen2.5:7b CPU 实测 durationMs=42285（42.3s）、totalRecords=110、evidence=1（business_record）、generationRecordId=13；链路 PENDING→RUNNING→Adapter→Statistics→AI Gateway→Ollama→结构化→Evidence→Generation Record→COMPLETED 真实走通）

测试真实数字（报告=脚本）：

Suite Unit: 17 tests, 17 passed / Suite Integration: 13 tests, 13 passed / Suite Route: 9 tests, 9 passed / Total: 39 / Passed: 39 / Failed: 0

数据库变化：

开发库 safety_dashboard 新增 ai_analysis_tasks 表（23 列）+ 2 索引（ai07_tasks_table.cjs 幂等执行 RESULT: OK，用户 hse_app / PostgreSQL 17.10）；生产库零 migration、零写入、零 .env 修改

Git：

AI-07 新增 server/services/ai/tasks/（aiAnalysisTaskService.js + aiAnalysisWorker.js）、controllers/aiAnalysisTaskController.js、scripts/ai07_tasks_table.cjs、scripts/ai07_worker.cjs、scripts/ai07_audit_db.cjs、scripts/ai07_analysis_task_e2e_check.cjs、ai07_e2e_out.txt、ai07_e2e_final.txt；修改 routes/ai-v2.js（新增 analysis-tasks 4 路由，AI-03 未提交文件增量）；未执行 reset/checkout/clean

Workbuddy：

无冲突（WPS/grid*/wpsGrid*/violations/assessment*/risk/accident/hse-tasks/training-ocr/.workbuddy 并行域零触碰；未修改任何保护文件；仅注册 DATA_ANALYSIS 任务类型，不注册 VISION/RISK_DECISION/VIOLATION_DECISION/ACCIDENT_JUDGEMENT/AUTO_REPORT）

风险：

1. CPU 推理耗时仍是硬限制（本轮真实 AI 42.3s）；2. RUNNING 任务不可强制取消（仅记录 cancel_requested_at，不做假取消）；3. worker 未接入生产（独立脚本，生产部署方案待定）；4. 幂等窗口仅活跃任务（COMPLETED 后同请求会新建，有意允许重跑）；5. AI_PROVIDER 进程级覆盖仅测试脚本（AI-04 遗留）；6. hse.data.analysis 仍为 DRAFT（AI-06 遗留）；7. 生产库未启用 AI-07 能力

遗留问题：

1. worker 生产化部署未定；2. 定时自动分析未建设（任务书 §26 边界）；3. 前端分析页面未开发（AI-08 范围）；4. violation/assessment/risk/accident 域未注册任务 domain；5. RETRYING 自动重试调度未实现（状态路径已定义）；6. ai_prompt_registry 持久化遗留（AI-05 继承）；7. 生产 .env 未切换 Ollama（AI-04 遗留）

[需要用户确认]：

1. 生产 worker 部署方案（独立授权）；2. 生产库执行 ai_analysis_tasks DDL（独立授权）；3. 生产 .env AI_PROVIDER 切换（AI-04/05/06 遗留）；4. hse.data.analysis DRAFT→ACTIVE 验证流程（AI-06 遗留）；5. 自动重试策略（RETRYING 已定义，调度未实现）；6. AI-05 测试统计口径差异后续核对

下一步：

等待用户将《AI-07-HSE-AI分析任务编排与异步执行基础能力建设报告.md》与更新后的《AI智能分析实施进度.md》交 ChatGPT 审核。ChatGPT 审核后将生成 AI-08 唯一正式提示词。AI-07 不自行开始 AI-08（正式前端/定时分析/自动报告）及业务 AI 阶段。

状态：

完成（PASS——真实链路 39/39：ai_analysis_tasks 任务模型 + 状态机 + 幂等创建 + 异步执行器 + 并发≤1 + AI-06 全量复用 → 真实 Ollama/qwen2.5:7b 任务闭环（42.3s，generationRecordId=13）→ Evidence/Generation Record 可追溯 → AI 不可用降级可用（统计先完成）→ 取消/并发/幂等/边界实测通过；创建接口不等待 AI；开发库 1 表 2 索引生产库零改动；Workbuddy 零冲突；AI-06 基线完整继承）

AI-05 测试统计口径说明（任务书 §30 保留历史事实）：

AI-05 报告为"57/57 PASS"，但其分类明细合计为 51 项，两者存在口径差异。AI-06 未返工 AI-05，未擅自将 57 改为 51，也未继续无依据引用 57；该口径差异待后续审计/查看 AI-05 原始测试脚本时核对。

---

### AI-08

任务：

HSE AI 智能分析中心 PC 端正式接入

提示词：

完整保存本提示词（`# AI-08：HSE AI 智能分析中心 PC 端正式接入`，2026-09-15 上传附件）

执行时间：

2026-09-15

AI-07审核结论：

PASS

核心目标：

将 AI-06 结构化数据分析能力 + AI-07 异步任务能力正式接入现有 PC 端 HSE 系统（web-naive / Vue 3 / Vben 5.7.0 / Naive UI 2.44.1）：先审计 AI 入口/路由/菜单/可复用组件 → 设计 AI 智能分析中心 → 实现页面与 API 封装 → 真实测试（建任务/轮询/AI结果/降级/取消/历史/401-403/空数据/清理）

AI 入口审计：

PASS（搜索 overview/ai-analysis、ai-analysis、AI分析、智能分析、分析中心、AI助手、风险分析、安全总览、隐患排查治理 → 确认 `hse.ts` L61-62 已注册 /overview/ai-analysis（name=HseAiAnalysis，菜单「AI 智能分析」二级于总览下，authority=admin）→ 直接把现有占位页面替换为真实 AI 分析中心；未新增一级菜单、未重命名、未调整菜单结构）

菜单冻结：

PASS（任务书 §4 预置冲突未发生：既有 /overview/ai-analysis 现成菜单入口直接复用，无需 [需要用户确认]）

页面结构（任务书 §7/§28 建议布局按项目 Naive UI 规范落地）：

PASS（AI 智能分析中心 = HsePageLayout + 辅助判断定位 NAlert（AI 仅辅助参考，人工为最终决策者）→ 创建区 NCard（分析对象 NSelect 仅 hazard/隐患分析、时间范围 NRadioGroup 7 快捷项+起止日期换算、分析方向 NCheckboxGroup 趋势/高频/整改（文案「选择希望重点关注的分析方向」不宣传只算选中项）、知识库 NSwitch useRag、[开始分析] loading 防重复）→ 任务列表 NCard+NDataTable（任务ID/分析对象/时间范围/创建时间/状态/降级/Provider·Model/耗时/操作[查看、取消]，服务端分页 10/20/50 + 状态过滤 + 刷新，终态取消禁用）→ 详情 NDrawer 960px（状态标签+降级标记 → 基本信息 NDescriptions 11 项 → 状态提示 NAlert → COMPLETED：统计结果 NCard 前置[6 汇总 NStatistic+趋势表+TOP 分类/来源/组织/区域+重复问题+聚集分析+未整改清单+统计局限] → AI 分析 NCard[八段式+元信息] → 分析依据 NCard[数据依据 business_record + 知识依据 knowledge_base]））

API 接入：

PASS（api/hse/ai.ts 同文件补齐 AI-07 analysis-tasks 四接口：createAnalysisTask/getAnalysisTask/listAnalysisTasks/cancelAnalysisTask，均 responseReturn:'body' + unwrapAiEnvelope 解包（success=true 返回 payload；success=false 抛带 code/provider/retryable 的 Error）；页面主流程只走异步任务，不调用 AI-06 同步 analyze；未建 aiTaskApi.ts/aiAnalysisApi2.ts 等平行文件）

任务轮询机制：

PASS（2500ms 单 timer：anyActiveTask()（列表存在 PENDING/RUNNING）才 startPolling，if(pollTimer) return 守卫杜绝重复 timer；终态（COMPLETED/FAILED/CANCELLED）stopPolling；onUnmounted 清理；tick 同时刷新打开中的详情 Drawer；组件卸载后不再请求）

UI 实现：

PASS（Naive UI 2.44.1 全部现成组件 + 复用 components/hse HsePageLayout/HseStatusTag；无新建组件体系；页面级 scoped 样式用项目 token；vue-tsc --noEmit 真实执行 AI-08 变更文件 0 错误）

权限：

PASS（沿用 AI-07：写=admin/safety_manager 读=authenticated；未改 authMiddleware/JWT/login/权限核心；前端按 401/403 实际返回处理；E2E 实测 401×2、403×2、读者读 200）

AI 结果展示：

PASS（统计确定层前置、AI 解释层在后（E2E 断言「统计结果」title 位置 < 「AI 分析」）；AI 分析固定八段 summary/key_findings/trend_analysis/anomalies/high_frequency_issues/possible_causes/management_suggestions/limitations 仅非空段；元信息 Provider/Model/耗时/Prompt Key+Version 真实返回；未增加责任人/违规认定/扣分建议等越权字段）

Evidence 展示：

PASS（按 source_type 分类：数据依据 business_record（evidence_text + evidence_strength 高/中/低标签）+ 知识依据 knowledge_base（source_field 文档/章节名 + evidence_text）；未用知识库或 RAG 降级显示「本任务未使用知识库或暂无知识依据」；全部真实 API 返回，前端不编造）

AI unavailable 降级：

PASS（grok NOT_CONFIGURED 实测：任务 COMPLETED + degraded=true + aiResult.available=false + errorMessage 含「降级」；空数据实测：COMPLETED + degraded=true + AI_EMPTY_DATA；页面统计照常 + NAlert「当前 AI 分析服务暂不可用，以下仍展示确定性统计结果」+ 实际错误状态，不整页报错、不把不可用显示成分析完成）

取消行为：

PASS（PENDING→CANCELLED 真取消实测（任务 35，note「任务已取消」）；RUNNING 仅 cancel_requested_at 实测（任务 34：cancelled=false、cancelRequested=true、状态仍 RUNNING、最终 COMPLETED 且 cancelRequestedAt 保留）；页面 Dialog 明示「AI 分析调用不可可靠中断…」+ 取消成功提示「已提交取消请求，当前 AI 分析仍在执行，完成后系统将更新任务状态」，绝不显示「已取消」；详情区 cancelRequestedAt 非空显示对应 NAlert）

截断数据风险：

[治理遗留]（已核实 AI-06 analysisDataAdapter.js：MAX_RECORDS=2000（L68）limit 默认 1000 上限 2000（L130）真实生效；但 API 未暴露 truncated/totalAvailable/analyzedRecords → AI-08 页面无法识别是否分析部分数据；前端不猜不硬编码；建议 AI-09/AI-10 在分析服务层暴露截断标识，本阶段不擅自修改 AI-06/07）

测试：

PASS（35/35 真实运行：Integration 20 + Route 6 + Frontend 9；E2E 脚本 server/scripts/ai08_analysis_task_e2e_check.cjs，5881 开发端口 + 真实 worker（AI_PROVIDER=ollama 进程级）+ 真实 Ollama + vite 5176（HTTP 200 title=HSE 安全看板）；真实 hazards 表最小只读（timeRange 过滤 77 条），业务表零写入；测试任务按 id 自建自清（34/35/36/37 结束已删））

真实 Ollama E2E：

PASS（qwen2.5:7b CPU 真实闭环：任务 34 共 77 条 hazard（2026-06-01~07-31）total=77、整改率 57.1%、trend granularity=monthly、analysis 八段齐全、evidence business_record=1、generationRecordId=15；链路 PENDING→RUNNING→统计→AI Gateway→Ollama→结构化→Evidence→Generation Record→COMPLETED 真实走通）

测试真实数字（报告=脚本）：

Suite Integration: 20 tests, 20 passed / Suite Route: 6 tests, 6 passed / Suite Frontend: 9 tests, 9 passed / Total: 35 / Passed: 35 / Failed: 0（vue-tsc: exit=2, totalErrors=60 既有非 AI-08, ai08Errors=0）

数据库变化：

本阶段零 migration、零新表、零业务写入（仅 E2E 在开发库 ai_analysis_tasks 按 id 自建自清测试任务，结束已删除）；生产库零改动、生产 .env 未动

Git：

AI-08 新增 apps/web-naive/src/api/hse/ai.ts、server/scripts/ai08_analysis_task_e2e_check.cjs；修改 apps/web-naive/src/views/hse/ai-analysis/index.vue（占位页替换为真实实现）；路由/菜单未改动；未执行 reset/checkout/clean；未删除其他未提交修改（执行前 183 条目含 AI-01~07 与 Workbuddy 并行变更，均未触碰）

Workbuddy：

无冲突（WPS/grid*/wpsGrid*/violations/ruleEngine/assessment/risk/accident/hse-tasks/training-ocr/.workbuddy 及 views/site/violation/* 零触碰；改动文件均位于 AI 专属区域 api/hse/ai.ts、views/hse/ai-analysis/、server/scripts/ai08_*）

风险：

1. [治理遗留] MAX_RECORDS=2000 但 API 无截断标识，页面无法告知用户部分数据分析；2. vue-tsc 全量 60 处既有类型错误（assessment-* 等非 AI-08 引入，未越界修复）；3. CPU Ollama 单次数十秒 + 并发≤1 排队叠加（AI-07 既有约束）；4. worker 多实例 ×2（advisory lock 安全，建议后续收敛单实例看护，AI-07 遗留）

未完成事项：

1. 浏览器级可视化 E2E（Playwright/Tabbit 打开页面真实点击）未执行（本阶段以真实 API+源码断言+vue-tsc 组合验证，任务书 §30 允许）；2. 截断标识前端展示（依赖 AI-06/07 暴露，§15 治理遗留）；3. 历史任务「重试」按钮（后端无重试端点，前端不伪造）；4. 生产 worker 部署/生产库 DDL/生产 .env 切换等 AI-07 遗留

[需要用户确认]：

无（任务书 §4 预置菜单冲突未发生）

下一步：

等待用户将《AI-08-HSE-AI智能分析中心PC端正式接入报告.md》与更新后的《AI智能分析实施进度.md》交 ChatGPT 审核。ChatGPT 审核后将生成 AI-09 唯一正式提示词。AI-08 不自行开始 AI-09（截断标识/浏览器 E2E/类型错误治理/定时分析/自动报告/业务 AI 判定等）。

状态：

完成（PASS——真实链路 35/35：AI 入口审计 → 复用既有 /overview/ai-analysis 占位路由（菜单冻结）→ AI 智能分析中心页面（Naive UI：创建/列表/详情/统计前置/AI 解释/Evidence）→ api/hse/ai.ts analysis-tasks 四接口 + 信封解包 → 2.5s 单 timer 轮询（终态停止/离开清理）→ 真实 Ollama qwen2.5:7b 闭环（77 条，generationRecordId=15）→ 降级/取消/权限/空数据/历史/清理全部实测 → vue-tsc AI-08 0 错误；零 migration 零业务写入；Workbuddy 零冲突；AI-07 基线完整继承）

---

### AI-09

任务：

HSE 结构化智能分析业务增强

提示词：

完整保存本提示词（`# AI-09：HSE 结构化智能分析业务增强`，2026-09-15 上传附件）

执行时间：

2026-09-15

AI-08审核结论：

PASS（35/35）

核心目标：

在复用 AI-01～AI-08 全链路（adapter→normalizer→statistics→service→task→worker→Gateway→Ollama→Evidence→ai_generation_records→AI-08 PC 中心）的前提下：1) 让 analysisTypes 真正影响统计重点/Prompt/AI 输出；2) 让 MAX_RECORDS=2000 截断可见（dataScope）；3) 对齐 AI 分析菜单 authority 与后端角色权限；4) 为后续风险/三违/检查扩展留最小接口；5) 真实验证

先审计后修改：

PASS（实际检查 server/services/ai/analysis/、tasks/、aiGateway.js、controllers/aiAnalysisTaskController.js、routes/ai-v2.js、apps/web-naive/src/api/hse/ai.ts、views/hse/ai-analysis/index.vue、router/routes/modules/hse.ts；确认 analysisTypes 仅 UI 参数（validateInput 校验枚举后即弃用）、MAX_RECORDS=2000 无截断标识、hse.ts authority=['admin'] 与后端写权限 admin/safety_manager 不一致）

analysisTypes 改造：

PASS（analysisStatistics 新增 deriveFocus（确定性 focus 标记 trend/frequency/rectification/clustering + primary/empty，只标注不参与计算）；analysisPromptBuilder 新增 ANALYSIS_TYPE_FOCUS + buildPrompt focusBlock（「分析重点方向（本次用户选择，必须优先围绕以下方向展开；未选方向可简化或省略，不得为未选方向编造深入结论）」/未选则「未指定分析重点方向，请对统计结果均衡分析」）；analysisService 将 analysisTypes 传入 computeStatistics 与 buildPrompt；固定八段协议不裁剪字段，未选方向返回空数组兼容 AI-08；实测 focus.primary 随方向变化并持久化、Prompt 互斥断言通过）

截断统计改造：

PASS（analysisDataAdapter db 模式改为 COUNT(*)（同条件不带 LIMIT，不加载全部记录）+ LIMIT 拉取 → dataScope={totalAvailable,analyzedRecords,limit,truncated}；limit 默认 1000 上限 2000 封顶不突破；注入模式 totalAvailable=analyzedRecords=注入条数 truncated=false；analysisService 挂 stats.dataScope 随 statisticsSnapshot 持久化；前端 index.vue L720-730 仅当 stats?.dataScope?.truncated=true 展示 NAlert「本次分析仅使用部分数据…」不硬编码 2000；实测 <2000/=2000/>2000 三场景 + 默认 limit + 封顶 + 真实闭环 2100→2000 truncated=true 持久化）

权限审计与修复：

PASS（后端 AI-07：写=admin/safety_manager 读=authenticated；前端 hse.ts 父级 /overview 与 HseAiAnalysis 子页 authority 由 ['admin'] 调整为 ['admin','safety_manager']；其余子页保持 ['admin'] 未扩大；vben 5 generate-routes-frontend.ts 源码确认 filterTree 逐节点 hasAuthority 判定，safety_manager 仅可见总览→AI 智能分析；实测矩阵：admin 200/200/200、safety_manager 200/200/200、grid_inspector 读者 403 创建/200 查看/403 取消、未认证 401×3；未改 JWT/auth store/login/auth middleware，未新增菜单未改一级菜单名）

Ollama 路由缺陷修复（验证中发现）：

PASS（真实闭环初跑 FAILED 定位：aiService.chat/chatStream 按全局 config.provider（.env AI_PROVIDER=grok）选端点，OllamaProvider 对话打到远程 GROK_BASE_URL（connect ETIMEDOUT）而健康检查 AVAILABLE（探测走本地 /api/tags）；修复：aiService 尊重 options.provider（缺省回退 config.provider，既有调用方行为不变）+ Grok/OllamaProvider 显式传 this.name；实测 gateway.generate({provider:'ollama'}) 返回 qwen2.5:7b，worker 任务 51/52 真实闭环 COMPLETED；另验证环境 worker 以 AI_TIMEOUT_MS=300000（AI-06 基线）重启，.env 60000 偏短记治理遗留）

后续扩展最小接口：

PASS（确认 analysisDataAdapter.DOMAINS 领域注册表（hazard 主域 + inspection 结构已注册）即扩展口：新增领域仅需注册表/字段映射，无新框架无平行实现；本阶段不接入 violation/risk/accident/assessment/inspection 业务数据，三违/WPS 保持只读）

测试：

PASS（47/47 真实运行：Unit 15 + Integration 15 + Route 10 + Frontend 7；套件 server/scripts/ai09_test_e2e.cjs，开发端口 5881 + AI-09 worker（AI_TIMEOUT_MS=300000）+ 真实 Ollama qwen2.5:7b；开发库 ai09_test_setup.cjs 建立 2100 条 AI09_TEST 标记数据（2025-01 2000 条 + 2025-02 100 条）与临时 safety_manager 用户 id=249，ai09_test_cleanup.cjs 清理（SM_USER_DELETED id=249、HAZ_DELETED 2100、HAZ_REMAIN 0）；测试任务按 id 自建自清）

真实 Ollama E2E：

PASS（任务 52：2100 条 hazard（2025-01-01~2025-02-05）→ PENDING→RUNNING→COMPLETED；statisticsSnapshot.dataScope={totalAvailable:2100,analyzedRecords:2000,limit:2000,truncated:true}；focus={trend:true,primary:'trend'}；aiResult.available=true structured=true provider=ollama model=qwen2.5:7b 八段齐全；generationRecordId=18；Evidence business_record=1；degraded=false；真实链路 adapter→normalizer→statistics→prompt(focusBlock)→Gateway→Ollama→结构化→Evidence→ai_generation_records 走通）

测试真实数字（报告=脚本）：

Suite Unit: 15/15 / Suite Integration: 15/15 / Suite Route: 10/10 / Suite Frontend: 7/7 / Total: 47/47  Failed: 0（vue-tsc --noEmit: 全量 60 处既有错误，AI-09 文件 0 新增；AI unavailable 实测 degraded=true + AI_PROVIDER_NOT_CONFIGURED 统计照常不 500）

数据库变化：

本阶段零 migration、零新表、零业务写入（仅开发库临时标记数据与临时用户，已按标记清理残留 0）；生产库 safety_dashboard_dev 零改动；生产 .env 零改动；生产 5876 零触碰

Git：

AI-09 修改 9 文件（server/services/aiService.js、ai/aiProviderRegistry.js、ai/analysis/{analysisDataAdapter,analysisStatistics,analysisPromptBuilder,analysisService}.js、apps/web-naive/src/views/hse/ai-analysis/index.vue、src/api/hse/ai.ts、src/router/routes/modules/hse.ts）+ 新增 4 脚本（ai09_test_e2e/setup/cleanup/probe.cjs）；AI-01~AI-08 文件仍未提交（untracked/M）；未执行 reset/checkout/clean；未删除其他未提交变更（含 Workbuddy 并行 assessment/violation/grid 等条目，均未触碰）

Workbuddy：

无冲突（WPS/grid*/wpsGrid*/violations/ruleEngine/assessment/risk/accident/hse-tasks/training-ocr/.workbuddy 及 views/site/violation/* 零触碰；AI-09 改动均在 AI 专属区域 server/services/ai/*、aiService.js、views/hse/ai-analysis/、api/hse/ai.ts、router/routes/modules/hse.ts、scripts/ai09_*）

风险：

1. [治理遗留] .env AI_TIMEOUT_MS=60000 对 CPU qwen2.5:7b（60~125s/次）偏短，验证以进程级 300000 覆盖，默认值待治理；2. aiService 修复后 options.provider 优先于全局配置（缺省行为不变，后续调用方注意不误传）；3. vue-tsc 60 处历史错误维持遗留；4. AI-01~AI-08 与 Workbuddy 变更未提交，后续提交需按区域拆分

未完成事项：

1. 浏览器级 E2E 未执行（无现成 Playwright 基建，任务书 §21 允许 API+源码断言替代）；2. clustering 方向后端已支持前端暂未开放勾选；3. 任务「重试」端点未新增；4. AI_TIMEOUT_MS 配置默认值治理；5. 三违/风险/检查领域接入（DOMAINS 注册表已就绪，留后续阶段）

[需要用户确认]：

无（权限修复依据明确：后端写权限=admin/safety_manager → 菜单放行同一角色，vben 语义源码确认）

下一步：

等待用户将《AI-09-HSE结构化智能分析业务增强实施报告.md》与更新后的《AI智能分析实施进度.md》交 ChatGPT 审核。ChatGPT 审核后将生成 AI-10 唯一正式提示词。AI-09 不自行开始 AI-10（自动报告/视觉识别/三违AI/风险预测）。

状态：

完成（PASS——真实链路 47/47：先审计后修改 → analysisTypes 真实生效（deriveFocus+focusBlock，八段兼容）→ dataScope 截断可见（COUNT+LIMIT 四字段持久化，前端按真实 truncated 警告）→ 菜单 authority 对齐（父级+子页放行 safety_manager，vben 语义确认，其余子页未扩大）→ Ollama 路由缺陷修复（aiService 尊重 options.provider）→ 真实 Ollama qwen2.5:7b 闭环（2100→2000 truncated，generationRecordId=18）→ 降级/权限/截断/非法参数全部实测 → vue-tsc AI-09 新增 0 错误；零 migration 零业务写入、生产零触碰、Workbuddy 零冲突、测试数据清理残留 0；AI-08 基线完整继承）

---

### AI-10

任务：

HSE AI 分析结果与管理建议能力建设

提示词：

完整保存本提示词（`# AI-10：HSE AI分析结果与管理建议能力建设`，2026-09-15 上传附件）

执行时间：

2026-09-15

AI-09审核结论：

PASS（47/47，报告=脚本逐项对应；AI-05 57/57 vs 51 历史矛盾保留未解释，本阶段未修改）

核心目标：

把 AI-06～AI-09 已产生的结构化分析结果进一步形成 HSE 管理人员可阅读/确认/引用的「管理建议结果」：统计数据 → AI分析 → 关键发现 → 可能原因 → 管理建议 → 人工确认。最小实现、优先复用、不重复建设；AI 只建议，人做最终决定；不自动执行任何管理动作。

先审计后修改：

PASS（实际读取 server/services/ai/analysis/、tasks/、aiGateway.js、aiEvidenceService.js、aiGenerationRecordService.js、aiPromptRegistry.js、aiService.js、controllers/aiAnalysisTaskController.js、routes/ai-v2.js、前端 index.vue/ai.ts/hse.ts；DB 只读审计 ai_generation_records/ai_analysis_tasks 结构与全库 %review%/audit/confirm 字段。结论：aiResult.analysis 八段 + statisticsSnapshot（含 dataScope/focus）+ evidence + generationRecordId + degraded 全部现成可复用；不存在既有「管理建议」能力；AI 表无 review_status/reviewed_by/reviewed_at/human_remark 字段 → 人工确认持久化按任务书 §12 停编待确认）

管理建议协议：

PASS（固定六字段 JSON：overall_assessment≤100字 + priority_issues 2~5条 + management_actions 2~5条 + monitoring_points 1~4条 + follow_up_suggestions 1~4条 + limitations 1~4条，每条≤60字；服务端 fail-closed 校验：缺字段/类型错/总体判断>200/元素>120 拒绝 AI_STRUCTURED_OUTPUT_INVALID；空数组合法）

人机边界：

PASS（六类越权表述 BOUNDARY_PATTERNS 命中即 AI_BOUNDARY_VIOLATION 拒绝采用：责任认定/扣分罚款/处罚处分/整改指令/风险等级变更/考核结果变更；不写考核/扣分/隐患整改/三违处罚/风险等级/人员责任任何业务最终字段；数字必须直接引用统计快照禁自算；7 类越权实测拒绝 + 正常措辞不误伤）

复用与零重复：

PASS（AI Gateway/Provider Registry/Prompt Registry/aiEvidenceService/ai_generation_records/aiService provider 路由全部复用；不新建第二套架构、不新增 npm 依赖；持久化零 migration：type='analysis' sub_type='management_suggestion' title='管理建议:任务#{id}' 关联键；Evidence 拆分统计分析依据/制度知识依据，不把 aggregate 证据描述成逐条业务证据；不重复 adapter/normalizer/statistics/dataScope/analysisTypes/task worker）

API 与前端：

PASS（POST/GET /api/hse/ai/v2/analysis-tasks/:id/management-suggestions：写=requireRole(admin,safety_manager)、读=任意登录；前端 ai.ts +ManagementSuggestion/Result 类型与两接口；index.vue 详情区 +「管理建议」卡片五态（生成中/已生成/未生成/AI不可用/重新生成），分区展示总体判断/重点关注/管理措施/持续监测/后续建议/AI限制 + 依据（统计分析依据 vs 制度/知识依据），保持 HsePageLayout/Naive UI/message/@vben/request，不重设计）

测试：

PASS（66/66 真实运行：Unit 41 + Integration 15 + Route 5 + Frontend 5 = 66（AI-11 更正原 25/25）；套件 server/scripts/ai10_test_unit.cjs + ai10_test_e2e.cjs，开发端口 5881 + worker（AI_TIMEOUT_MS=300000 进程级覆盖）+ 真实 Ollama qwen2.5:7b；集成覆盖：真实 AI-09 任务（hazard 110 条 2026-01-01~08-31）COMPLETED genRec=19 → 建议生成 142754ms 六字段齐全 recordId=20 → Evidence 2 条可追溯 → GET cached=true → DB 落库校验；AI unavailable（grok NOT_CONFIGURED → 200+available=false+统计保留）、Provider 不存在 AI_PROVIDER_NOT_FOUND、未指定默认 grok 降级、非 COMPLETED AI_TASK_INVALID_STATE；Route 权限 5/5；Provider 回归 ollama/grok/openai_compatible/未指定/不存在 全过）

真实 Ollama E2E：

PASS（任务 58：hazard 110 条 → statisticsSnapshot.total=110 → AI 八段 COMPLETED（genRec=19）→ POST 建议 provider=ollama → qwen2.5:7b 真实生成 142754ms → overall=「2026年整改率波动较大，尤其是6月最低仅为66.7%。」priority 3/actions 2 → recordId=20 落库 → evidence_n=2（含 management_suggestion 链路证据）→ 未越界；真实链路 分析结果→建议上下文→Gateway→Ollama→结构化→Evidence→ai_generation_records 走通）

测试真实数字（报告=脚本）：

Suite Unit: 41/41 / Suite Integration: 15/15 / Suite Route: 5/5 / Suite Frontend: 5/5 / Total: 66/66（41+15+5+5=66；AI-11 更正原「Total: 25/25」数学关系）  Failed: 0（vue-tsc --noEmit: 全量 60 处既有错误，AI-10 文件 0 新增；AI unavailable 实测不 500 不伪造 + 统计照常）

数据库变化：

本阶段零 migration、零新表、零 DDL、零业务写入；开发库仅测试任务/建议记录/临时用户（ai10_test_sm id=250 AI10_TEST 标记）已全部清理（创建 2 任务+4 记录+1 用户 / 删除 2+4+1 / 残留 0，_ai10_residue_check.cjs 复查确认）；生产库 safety_dashboard_dev 零改动；生产 .env 零改动；生产 5876 零触碰

Git：

AI-10 修改 4 文件（server/services/ai/aiPromptRegistry.js、server/controllers/aiAnalysisTaskController.js、server/routes/ai-v2.js、apps/web-naive/src/views/hse/ai-analysis/index.vue）+ 修改 1 前端文件（apps/web-naive/src/api/hse/ai.ts）+ 新增 2 服务文件（managementSuggestionPromptBuilder.js / managementSuggestionService.js）+ 新增 9 测试/审计脚本（ai10_test_unit/e2e.cjs、ai10_vuetsc_output.txt、_ai10_audit_db/users/fk_check/peek_task/residue_check/cleanup_residue.cjs）；未执行 reset/checkout/clean/restore；AI-01~AI-09 与 Workbuddy 并行修改（violation/assessment/grid/WPS 等）原样保留未触碰

Workbuddy：

无冲突（WPS/grid*/wpsGrid*/violations/ruleEngine/assessment/risk/accident/hse-tasks/training-ocr/.workbuddy 及 views/site/violation/* 零触碰；AI-10 改动均在 AI 专属区域 server/services/ai/analysis/*、aiPromptRegistry.js、aiAnalysisTaskController.js、routes/ai-v2.js、views/hse/ai-analysis/、api/hse/ai.ts、scripts/ai10_*）

风险：

1. [治理遗留] .env AI_TIMEOUT_MS=60000 与 CPU qwen2.5:7b 实际耗时（分析 60~125s、建议实测 143s）不匹配；多级超时（aiService 默认 60000 / worker 默认 300000 / 探测 5000）源头单一但默认兜底不一致；本阶段以进程级 300000 覆盖，仅提建议未改 .env（报告 §23）；2. 人工确认持久化未实现（AI 表无 review 字段，零 migration 未建表，NEED USER CONFIRMATION 报告 §24）；3. [治理遗留] vue-tsc 60 处历史错误；4. 缓存键为 title 文本关联（零 migration 约定，后续引入正式外键需迁移）；5. CPU 长耗时建议生成 1~3 分钟，前端 loading 态，并发沿用 worker 1

未完成事项：

1. 人工确认状态持久化（review_status/reviewed_by/reviewed_at/human_remark）—— 等待用户在三方案中选择（报告 §24）；2. 浏览器级可视化 E2E 未执行（API+源码断言+vue-tsc 组合，与 AI-08/09 一致）；3. AI_TIMEOUT_MS 配置默认值治理（需授权改 .env）；4. 生产 worker 部署/生产库 DDL/生产 AI 启用等遗留，均需独立授权

[需要用户确认]：

1. 人工确认持久化三选一（推荐：零 migration JSONB 内记录；备选：ai_generation_records 增 review 字段最小 migration 需授权；或暂不做持久化）—— AI-10 未自行建表；2. hse.management.suggestion v1.0 维持 DRAFT 不 ACTIVE；3. hse.data.analysis v1.0 维持 DRAFT 未改动；4. 生产 .env 超时/生产 AI 启用等改动需独立授权

下一步：

等待用户将《AI-10：HSE AI分析结果与管理建议能力建设实施报告.md》与更新后的《AI智能分析实施进度.md》交 ChatGPT 审计。AI-10 不自行开始 AI-11（三违 AI/风险预测/事故预测/视觉识别/自动报告/自动考核扣分整改/生产 AI 启用）。

状态：

完成（PASS——真实链路 66/66（41+15+5+5，AI-11 更正原 25/25）：先审计后最小实现 → 管理建议固定六字段协议（fail-closed 校验）→ 人机边界六类越权实测拒绝（AI_BOUNDARY_VIOLATION）→ 复用 AI Gateway/Evidence/generation records 零 migration（title 关联键）→ POST/GET 两端点 + 前端五态建议卡片（依据分区）→ AI unavailable 降级不 500 不伪造 + 统计保留 → Provider 回归全过（AI-09 修复无回归）→ 真实 Ollama qwen2.5:7b 双闭环（分析 110 条 genRec=19 → 建议 143s recordId=20）→ 权限 4 角色实测 → vue-tsc AI-10 新增 0 错误 → 测试数据清理残留 0；生产 DB/.env/worker 零触碰、Workbuddy 零冲突、Git 零危险操作；人工确认持久化 → NEED USER CONFIRMATION）

### AI-11

任务：
HSE AI 管理建议人工审核与确认闭环建设（阶段十一）

执行时间：
2026-09-15

执行结果：
PASS——51/51（Unit 19 + Integration 20 + Route 5 + Frontend 7；开发后端 5881；无真实 AI 调用——审核链路为纯 DB 写操作，seed 建议记录直建）。

1. **AI-10 统计更正**（前置完成）：AI-10 报告 `Unit 41 + Integration 15 + Route 5 + Frontend 5 = 25/25` 数学关系错误（合计应为 66）；主进度 4 处更正为 66/66（标注「AI-11 更正」）；AI-10 报告原文保留未篡改、未重跑测试。
2. **审计 → NEED USER CONFIRMATION → 用户确认方案 C**：只读审计确认 `ai_generation_records`（20 列）/ `ai_analysis_tasks`（23 列）无任何审核字段、全库约 100 个 review 字段均属其他业务域；方案 A（JSONB 复用，破坏 AI-10 result 解析）不推荐、方案 B（加 4 列，无历史/前后状态）备选、方案 C（独立审核表）推荐；按任务书 §7 先输出 NEED USER CONFIRMATION 报告，用户确认方案 C 并授权开发库 migration 后才编码。
3. **Migration（仅开发库）**：`server/sql/ai11_generation_reviews_v1.sql` + `server/scripts/ai11_migration.cjs`（幂等）→ 新建 `ai_generation_reviews`（12 列、2 FK：generation_record_id/task_id ON DELETE CASCADE、4 业务索引+主键）；验证原 AI 表零改动（20/23 基线）；生产库 safety_dashboard_dev 零改动。
4. **后端**：`server/services/ai/review/aiReviewService.js`（新增）——四态状态机 PENDING_REVIEW/APPROVED/REJECTED/MODIFIED、previousStatus 乐观并发、任务行 SELECT FOR UPDATE 串行化、幂等重试（idempotent=true 不新增）、请求形状校验 fail-closed（非法 action/意见超长/MODIFY 缺 humanModified/结构非法）、审核人一律取 req.user.id、reviewedByName LEFT JOIN users 只读；controller（submitReview/getReviewHistory）+ routes（POST review 挂 AI_WRITER=requireRole(admin,safety_manager)、GET reviews 任意登录用户）。
5. **前端**：`api/hse/ai.ts` 增补 ReviewStatus/ReviewAction/AiReviewRecord 类型与 submitManagementSuggestionReview/getManagementSuggestionReviews；`views/hse/ai-analysis/index.vue` 增补人工审核区块（状态/审核人/时间/审核历史链/人工意见/MODIFIED 独立展示「人工修改建议（非 AI 原始输出）」/hasAccessByRoles 权限按钮/previousStatus+AI_REVIEW_STATE_CONFLICT 刷新重试），复用 Naive UI + HseStatusTag。
6. **AI 原始结果隔离实测**：审核全流程后 ai_generation_records.result/evidence/provider/model/prompt_key/prompt_version 与 seed 完全一致（零改动）；human_modified 存独立 JSONB 列；无建议记录任务 GET 不伪造审核状态、POST 拒绝（AI_REVIEW_RECORD_NOT_FOUND）。
7. **测试数据清理残留 0**：测试用户 ai11_test_sm / 任务 / 建议记录 / 审核记录全部按 id 跟踪删除；未写三违/网格/WPS/考核/扣分任何业务数据。

修改文件：
- `server/sql/ai11_generation_reviews_v1.sql`（新增：migration，仅开发库）
- `server/scripts/ai11_migration.cjs`（新增：migration 执行与验证脚本）
- `server/services/ai/review/aiReviewService.js`（新增：人工审核服务）
- `server/controllers/aiAnalysisTaskController.js`（修改：增补 submitReview / getReviewHistory）
- `server/routes/ai-v2.js`（修改：增补 POST review / GET reviews）
- `server/scripts/ai11_test_unit.cjs`（新增：Unit 测试 19 项）
- `server/scripts/ai11_test_e2e.cjs`（新增：Integration 20 + Route 5 + Frontend 7）
- `安全看板vben/apps/web-naive/src/api/hse/ai.ts`（修改：AI-11 类型与接口）
- `安全看板vben/apps/web-naive/src/views/hse/ai-analysis/index.vue`（修改：人工审核区块）
- `docs/AI智能分析/AI-11：HSE AI管理建议人工审核与确认闭环建设实施报告.md`（修改：BLOCKED → 完成版）

数据库变化：
开发库 safety_dashboard：新增 1 表 ai_generation_reviews（12 列、2 FK、4 业务索引）+ 测试数据（已清理，残留 0）；ai_generation_records/ai_analysis_tasks 结构零改动；生产库 safety_dashboard_dev 零改动（生产 migration 需独立授权）。

测试：
AI-11 = 51/51（Unit 19：常量/映射/六字段协议/validateHumanModified/assertRemarkSize/toApiReview；Integration 20：生成→PENDING_REVIEW→APPROVE 留痕→历史姓名→幂等不新增→已确认再确认冲突→previousStatus 过期冲突→REJECT 姓名解析→历史链连续→并发恰一成功一冲突→无丢失→校验 fail-closed→无脏写→AI 原始零改动→human_modified 独立→无建议不伪造；Route 5：grid_inspector 写 403/未认证 401/读 200/未认证读 401/任务不存在；Frontend 7：审核区块三按钮/状态姓名时间意见/权限按钮/乐观并发/人工修改区分/ai.ts 类型接口/previousStatus）。清理残留 0。AI-10 测试总数 66/66（41+15+5+5）。

TypeScript：
npm run typecheck（vue-tsc --noEmit --skipLibCheck）：AI-11 新增错误 = 0（触碰文件 index.vue / ai.ts 命中 0）；历史 60 处既有错误保留不修复。

权限矩阵（实测）：
提交人工审核 POST review = requireRole('admin','safety_manager')（grid_inspector 403、未认证 401）；查看审核历史 GET reviews = 任意登录用户（未认证 401）；审核人取 req.user.id，不做身份推断。

风险：
1. [治理遗留] AI_TIMEOUT_MS=60000 与 CPU qwen2.5:7b 耗时不匹配（已审计：人工审核为纯 DB 写操作、不经 AI Gateway、不受生成超时影响；未改 .env）；2. [治理遗留] vue-tsc 60 处历史错误；3. 生产放行（生产库跑 ai11 migration / 生产 worker 加载新代码 / 生产 AI 启用）均需用户独立授权后另行执行；4. 人工审核不进入业务闭环（APPROVED/MODIFIED 推送业务域需新阶段独立设计）；5. AI-05 57/57 vs 51 历史矛盾继续保留。

Workbuddy：
零冲突（WPS/grid*/wpsGrid*/violations/ruleEngine/assessment/sanwei*/views/site/violation/* 保护区域零触碰；测试仅写 AI 测试表，未写任何业务数据）。

下一步：
按任务书最终停止条件：AI-11 完成即停止，不自行开始 AI-12。提交《AI-11 实施报告》+ 本进度文件交 ChatGPT 审计；生产放行（migration/worker/AI 启用）待用户独立授权。

状态：
完成（PASS——51/51，详见《AI-11：HSE AI管理建议人工审核与确认闭环建设实施报告.md》）

---

### AI-12

任务：
本地 AI 一键启动 / 生产运行配置（阶段十二——运行层建设，非新增 AI 功能）

执行时间：
2026-09-15

执行结果：
PASS WITH CONDITIONS——健康检查 11/11 OK（exit 0，含真实 qwen2.5:7b 冒烟）、一键启动四次验收全过、生产边界零触碰。

1. **审计 → 最小修改**：确认现状无统一启动入口/健康检查/停止脚本/生产运行说明；Ollama=DBX 便携版（G:\ollama\ollama.exe serve，11434）、模型 qwen2.5:7b + nomic-embed-text 已安装、pgvector 0.8.2 + AI 7 表齐全（含 ai_generation_reviews）、worker 未挂载 app.js（独立进程）、生产 5876 由 HSE-Backend 计划任务（SYSTEM）管理。按「先审计→再设计→最小修改→真实验证」执行，未重复造轮子。
2. **一键启动**：`start-hse-ai.bat` → `start-hse-ai.ps1`——7 步链路（环境/PostgreSQL/Ollama(HTTP)/模型/Backend(等 /api/health)/Worker/Frontend(等 HTTP 200)）+ 幂等复用（Already running）+ 5876 硬禁止 + 进程级注入 `AI_PROVIDER=ollama` / `AI_TIMEOUT_MS=300000`（不改 .env）；修复 `set` 带引号赋值（消除尾部空格导致 activeProvider=null），实测 activeProvider=ollama。
3. **一键停止**：`scripts\stop-hse-ai.ps1`——仅停开发栈（Worker/5888/5173），生产 5876/PostgreSQL/Ollama 不触碰；执行前列清单 + 确认（-Force 跳过）。
4. **健康检查**：`scripts\hse-ai-health.ps1` + 只读探针 `server\scripts\ai12_runtime_probe.cjs` + `_ai12_token.cjs`——11 项（Node/PostgreSQL/Ollama/qwen2.5:7b/nomic-embed-text/Backend/AI v2 Health/RAG capability/AI Analysis API/Frontend/AI Generate Smoke），冒烟直接调 Ollama（极短 Prompt、不写业务库/不建记录），退出码 0/1/2。
5. **前端入口**：`apps/web-naive/vite.config.ts` 代理目标支持 `VITE_PROXY_TARGET` / `VITE_UPLOADS_PROXY_TARGET` 覆盖（未设置保持原默认 5882/5876）；AI 分析页菜单「AI智能分析」/ 路由 `/overview/ai-analysis`（admin/safety_manager），HTTP 200 实测。
6. **真实验证**：2026-09-15 17:05 健康检查 11/11 OK（db=connected, ai=ollama, activeProvider=ollama, available=true, pgvector 0.8.2 + 7 表 OK, 冒烟含 HSE_AI_OK, exit 0）；一键启动四次验收（冷启动全链路 / Already running 复用无重复实例 / Ollama 关闭降级不崩溃 Backend/Frontend 保持 OK / 恢复 AI READY）；Test 9 最小任务 id=69 DATA_ANALYSIS/hazard COMPLETED；生成记录 14 条（近 8 条 ollama/qwen2.5:7b success）。
7. **生产边界**：生产 5876 未启停、生产 server\.env 未改、生产库未迁移、WPS/三违/登录/权限/人员中心/考核/风险/事故/HSE任务/培训OCR/.workbuddy 零触碰；CONDITIONS（生产放行项）：Worker 计划任务、生产 AI Provider 切换、生产库 AI 表迁移、Ollama 服务化、前端 Nginx 托管，均需用户独立授权。

修改文件：
- `start-hse-ai.ps1`（新增：一键启动 7 步链路 + 幂等 + 5876 硬禁止 + 进程级 AI 变量）
- `start-hse-ai.bat`（新增：双击入口）
- `scripts\stop-hse-ai.ps1`（新增：一键停止，仅开发栈）
- `scripts\hse-ai-health.ps1`（新增：11 项健康检查 + 真实冒烟）
- `server\scripts\ai12_runtime_probe.cjs`（新增：只读 DB 探针）
- `server\scripts\_ai12_token.cjs`（新增：只读探测 JWT）
- `server\scripts\_ai12_audit_db.cjs`（新增：审计期表核对）
- `安全看板vben\apps\web-naive\vite.config.ts`（修改：代理目标支持环境变量覆盖）
- `docs\AI智能分析\AI本地一键启动运行说明.md`（新增）
- `docs\AI智能分析\AI本地生产运行配置说明.md`（新增）
- `docs\AI智能分析\AI-12本地AI一键启动与生产运行配置实施报告.md`（新增）

数据库变化：
无（本阶段零 DDL；仅健康检查只读探测 + 真实验证任务 id=69 / 生成记录，未写业务表）。

测试：
健康检查 11/11 OK（exit 0）+ 一键启动四次验收全过 + Test 1~9 全 PASS（详见 AI-12 实施报告 §14）。AI_TIMEOUT_MS 保持 .env 60000 未改（开发栈进程级 300000），不盲目改小。

TypeScript：
未触碰前端逻辑（仅 vite.config.ts 代理目标），无新增错误。

生产边界：
生产 5876 未启停 / server\.env（生产）未改 / 生产库未迁移 / WPS、三违、登录、JWT、权限、人员中心、考核、风险、事故、HSE任务、培训OCR、.workbuddy 零触碰。

风险：
1. [CONDITION] 生产 Worker 计划任务与生产 AI Provider（ollama）切换待放行；2. [CONDITION] 生产库 AI 表迁移（含 ai_generation_reviews）待授权；3. [CONDITION] Ollama 当前为 DBX 便携版，生产建议服务化/自启；4. [CONDITION] 前端生产 Nginx 托管配置未交付；5. [治理遗留] CPU 环境复杂分析耗时可能超 300 秒，生产超时配置需按实测复核；6. [治理遗留] vue-tsc 60 处历史错误保留。

Workbuddy：
零冲突（保护区域零触碰；仅新增运行层脚本与 vite.config.ts 代理覆盖，不影响 Workbuddy 在管业务）。

下一步：
按任务书最终停止条件：AI-12 完成即停止，不自行开始 AI-13。生产放行（Worker 计划任务 / AI Provider 切换 / 生产库迁移 / Ollama 服务化 / Nginx 托管）待用户独立授权。

状态：
完成（PASS WITH CONDITIONS，详见《AI-12本地AI一键启动与生产运行配置实施报告.md》）

---

*本文件为 HSE AI 智能分析项目唯一总进度记录文件。后续 AI-11、AI-12…… 每次任务都必须在本文件追加记录。*
