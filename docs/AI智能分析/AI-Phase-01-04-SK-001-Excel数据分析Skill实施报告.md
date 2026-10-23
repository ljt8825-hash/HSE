# AI-Phase-01-04 SK-001「Excel 数据分析」Skill 实施报告

| 项 | 值 |
| --- | --- |
| 报告日期 | 2026-10-12 |
| 阶段 | AI-Phase-01-04 |
| Skill | SK-001 / company.excel.analysis / v1.0.0 |
| 实施状态 | **Active（验收 A~P 全部通过后由 Testing 转 Active）** |
| 关联冻结文档 | AI-Phase-01-01（架构冻结）、AI-Phase-01-02（SK-005 样板） |
| 报告撰写 | AI（TRAE），待用户复核 |

---

## 1. 任务摘要

按 AI-Phase-01-04 任务书实施公司通用 Skill **SK-001「Excel 数据分析」（company.excel.analysis v1.0.0）**：

- **不重新设计架构**：完全复用 AI-Phase-01-01 冻结的九字段元数据、生命周期、统一调用链（Skill → 权限 → 解析 → Evidence → Prompt Registry → AI Gateway → 统一输出 → Generation Record）与 SK-005 代码范式；
- **核心原则**：确定性计算优先于 AI——总数/空值/重复/均值/分组/排名/占比/趋势全部由程序计算，AI 只做解释（总结发现/趋势/异常/建议），禁止 AI 重算，不一致时信程序并出 warning；
- **初始状态 Testing**，测试 T01~T10 + 真实业务 Excel + HSE 回归全过后转 **Active**；
- 实施过程中**未新增 npm 依赖**（xlsx ^0.18.5、multer ^1.4.5 均为既有依赖）、**未做任何数据库 migration**、**未触碰 HSE AI 核心协议/双 Router/aiEnhancedService/生产 .env/生产库**。

## 2. 前置文档

| 文档 | 用途 |
| --- | --- |
| `docs/AI智能分析/AI-Phase-01-01-公司通用AI-Skill架构与能力边界设计报告.md` | 冻结标准：元数据九字段、生命周期、调用链、输入/输出/错误协议、Evidence、Prompt Registry、Model Policy（provider:null） |
| `docs/AI智能分析/AI-Phase-01-02-SK-005企业知识问答Skill实施报告.md` | SK-005 样板：常量元数据、allowlist、manifest、统一输出、_saveSkillRecord 范式 |
| `docs/AI智能分析/AI-Phase-01-00-现有系统AI能力与技术基础审计报告.md` | §12 结论：utils/excel.js 通用段为别名映射式、importExcelService 强 HSE 耦合 → SK-001 自建最小通用解析引擎的依据 |
| AI-Phase-01-04 任务书（40 节） | 本阶段全部要求与验收清单 |

## 3. 实施前审计

编码前逐文件审计（未先动代码）：

| 对象 | 审计结论 | 决策 |
| --- | --- | --- |
| `server/utils/excel.js` | readFile 通用段（raw:false 格式化字符串入口、parseDate）可参考；importExcelService 强 HSE 业务耦合 | SK-001 内自建最小通用解析引擎（loadWorkbook/selectSheet/extractMatrix/detectHeader），不 import 该服务，仅复用 `parseDate` 思路并本地扩展 |
| `server/middleware/upload.js` | `createUploader({type,subDir,maxSize,fieldName})` 通用；`validateUploadedFile` 魔术字节校验（xlsx=ZIP PK / xls=OLE2） | 路由层复用 createUploader；**CSV 无魔术字节**，xlsx/xls/xlsm 走 validateUploadedFile，csv 跳过由解析兜底 |
| `server/services/ai/aiGateway.js` | `generate({promptKey,promptVersion,data,customInstructions,evidence,provider,options,userId,sourceDomain,record})` 契约与 `validateEvidenceList` | 全量走 Gateway，禁止直连 Provider |
| `server/services/ai/errors.js` | AI_ERROR_CODES 协议 + toErrorResponse | **不修改**；文件类错误码 `AI_FILE_INVALID`/`AI_FILE_TOO_LARGE` 定义在 skill 本地（命名遵循 AI_* 规范，任务书 §十九允许的最小扩展） |
| `server/services/ai/aiGenerationRecordService.js` | 复用 ai_generation_records，扩展列（request_id/prompt_key/prompt_version/evidence）自动探测 | 不做 R2 migration，直接复用（扩展列在 01-02 已具备） |
| `server/app.js`、`package.json` | /api/company/ai 挂载点、json limit 10mb、xlsx/multer 版本 | 无需改动 app.js；无新增依赖 |
| 前端三件套（SK-005 页面/API/路由） | Naive UI + #/components/hse + #/api/request 范式 | SK-001 前端复用同一形态 |

## 4. Excel 能力现状

实施前系统对 Excel 的能力边界：

- **HSE 专用导入**（importExcelService）：面向网格巡查台账等固定模板，含 HSE 身份链（employee_id/grid_id）推断，不可通用；
- **utils/excel.js 通用段**：readFile + sheet_to_json 基础解析 + 少量日期处理，无统计分析能力；
- **无通用「上传任意 Excel → 结构化统计 → AI 解读」能力**。AI 侧（AI-02/AI-03）仅有文本/图片（OCR）输入，从未有过表格数据入口；
- **任务书红线**：禁止把整个 Excel 发给 LLM（性能与幻觉双重风险）。

## 5. 数据分析能力现状

实施前：系统无任何「确定性数据统计 + AI 解释」双层结构；HSE AI（risk-predict/classify/anomaly-detect 等）均为独立领域算法，与通用 Excel 分析无关。本阶段建立的分层：

```text
Excel 文件
 ↓ 确定性解析（xlsx raw:false → 矩阵 → 表头检测 → 类型推断）
 ↓ 确定性数据质量检查（空值/整行重复/截断/高空值列）
 ↓ 确定性统计（总数/均值/分组/排名/趋势/z-score 异常）
 ↓ 结构化 Analysis Result（result 字段，用户可见的完整数字）
 ↓ Evidence（aiEvidenceService.createEvidence，与 Gateway 同源）
 ↓ Prompt Registry（company.excel.analysis v1.0.0，AI 只做解释）
 ↓ AI Gateway（provider:null → 环境解析）
 ↓ 统一 Skill Output（result 核心 + answer）
 ↓ Generation Record（ai_generation_records）
```

## 6. SK-001 定义

| 字段 | 值 |
| --- | --- |
| SKILL_ID | `SK-001` |
| SKILL_NAME | Excel 数据分析 |
| SKILL_KEY | `company.excel.analysis` |
| SKILL_VERSION | `v1.0.0` |
| SKILL_DOMAIN | `company` |
| SKILL_TYPE | `data_analysis` |
| SKILL_STATUS | `Active`（初始 Testing，验收后转 Active） |
| SKILL_OWNER | company-ai |
| SKILL_ALLOWED_ROLES | 与 SK-005 逐字一致：system_admin / admin / safety_manager / hse_manager / township_manager / manager / viewer / grid_inspector（8 角色） |
| MODEL_POLICIES.data_analysis | `{ provider: null, promptKey: 'company.excel.analysis', promptVersion: 'v1.0.0', options: { temperature: 0.2, maxTokens: 1500 } }` |
| INPUT_LIMITS | analysisGoalMaxLength 500；fileMaxBytes 20MB；allowedExtensions ['.xlsx','.xls','.xlsm','.csv']；maxRows 5000；maxCols 100；maxStatColumns 12；maxGroupCards/RankingCards 4；maxGroupItems 10；maxTrendPoints 60；maxAnomalyItems 20；typeSampleSize 200；**aiContextMaxChars 2400**（见 §22 校准）；evidenceMaxItems 8 |

## 7. 架构调用链

```text
POST /api/company/ai/skills/SK-001/analyze（multipart：file + analysis_goal + sheet_name?）
  ↓ SKILL_USER（JWT）
  ↓ sk001Upload（createUploader excel/excel/20MB；LIMIT_FILE_SIZE → AI_FILE_TOO_LARGE）
  ↓ 控制器：扩展名校验 → xlsx/xls/xlsm 魔术字节校验（csv 跳过）
  ↓ sk001.analyze({filePath, fileName, analysis_goal, sheet_name}, actor)
      ├─ normalizeInput / validateInput（analysis_goal ≤500 等）
      ├─ resolvePermission（角色 allowlist，与 SK-005 同口径）
      ├─ loadWorkbook → selectSheet（指定名或首个非空表）→ extractMatrix → detectHeader
      ├─ analyzeDeterministic（质量/统计/分组/排名/趋势/异常，全部程序计算）
      │    └─ 0 数据行 → 安全返回（success=true / ai_called=false / confidence=low，不调 AI）
      ├─ buildEvidence（business_record / sourceDomain=SKILL_KEY，8 条上限）
      ├─ limitAiContext（中文重标签 + 2400 字符预算逐级降载）
      ├─ gateway.generate（Prompt Registry + Evidence + Record 统一收敛，provider:null）
      ├─ checkAiNumberConsistency（AI 数字 ↔ 程序统计一致性，不一致 → warning 信程序）
      └─ 统一输出 { success, skill, request_id, result, answer, evidence, confidence, warnings, suggestions, metadata }
  ↓ finally：deleteFile(file.path) 清理临时上传文件
```

失败路径：解析失败/Provider 异常 → 结构化 AI 错误 + `_saveSkillRecord(status='failed')` 落库留痕。

## 8. 输入协议

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| file | multipart 文件 | 是 | 扩展名 .xlsx/.xls/.xlsm/.csv；≤20MB；xlsx/xls/xlsm 魔术字节校验 |
| analysis_goal | string | 是 | ≤500 字符；作为 AI customInstructions |
| sheet_name | string | 否 | 指定工作表名；不存在 → AI_INVALID_REQUEST（附可用表名）；缺省取首个非空表 |

超限行为：行 >5000 截断并 warning（统计基于截断后数据）；列 >100 截断并 warning；文件过大在 multer 层拒绝（AI_FILE_TOO_LARGE）。

## 9. 输出协议

统一 Skill Output（success=true）：

```jsonc
{
  "success": true,
  "skill": { "id": "SK-001", "name": "Excel 数据分析", "key": "company.excel.analysis", "version": "v1.0.0", "domain": "company", "type": "data_analysis", "status": "Active" },
  "request_id": "…",
  "result": {                    // ← 核心：全部数字由程序计算
    "dataset":  { file_name, sheet_name, sheet_count, row_count, column_count, total_rows_in_file, parsed_at, engine },
    "quality":  { total_rows, non_empty_rows, empty_cells, empty_rate, duplicate_rows, duplicate_samples, truncated_rows, truncated_cols },
    "columns":  [ { name, type: number|date|string|mixed, non_empty, empty, empty_rate, invalid } ],
    "statistics": [ { column, count, empty_or_invalid, sum, mean, min, max } ],
    "group_by": [ { column, distinct, truncated, items: [ { value, count, share } ] } ],
    "ranking":  [ { by, of, items: [ { value, sum, mean, count } ], note } ],
    "trend":    [ { column, granularity, span, invalid_dates, truncated, points: [ { period, count, sums } ] } ],
    "anomalies": { zscore: [ { column, row, value, z } ], high_empty_cols: [ { column, empty_rate } ], duplicates },
    "sample_rows": [ … ]         // 最多 5 行原始样例（仅出 result，不发给 AI）
  },
  "answer": "AI 结构化解读（一二三四）",
  "evidence": [ …8 条上限，与 Gateway 同源 ],
  "confidence": "high|medium|low",
  "warnings": [ … ],
  "suggestions": [ … ],
  "metadata": { skill_key, skill_id, skill_version, model_policy, prompt_key, prompt_version, provider, model, duration_ms, record_id, record_saved, gateway_request_id, trace_id, usage, file, permission_model, disclaimer, ai_called, ai_context_chars }
}
```

失败：AI 统一信封 `{ success:false, error:{ code, message, provider, retryable, requestId, details } }`。

## 10. 确定性分析机制

全部纯程序实现（无 AI 参与）：

| 能力 | 口径 |
| --- | --- |
| 数值解析 | 严格正则（去千分位逗号）；「3人」「12%」等**不算数值**，计入 invalid |
| 日期解析 | 复用 utils/excel parseDate 思路 + 本地扩展两位年 `m/d/yy`（假设 2000+yy，见 §24 口径登记） |
| 类型推断 | 采样 ≤200 值 → number/date/string/mixed + invalid 计数 |
| 质量检查 | 空单元格数/空值率、**整行重复**（全字段比对 + 重复样本行号）、截断计数、高空值列（≥30%） |
| 统计 | 每数值列 sum/mean/min/max/count/empty_or_invalid；**空值与非法值不当 0**（mean 按 有效值/有效数 计） |
| 分组 | 文本列 distinct 2~50 → top 条目 + 占比 |
| 排名 | 类别列 × 数值列 sum 降序 top N |
| 趋势 | 日期列：跨度 ≤62 天按日，否则按月；period/count/sums |
| 异常 | z-score \|z\|≥3（≤20 条）+ 高空值列清单 |

无法分析安全返回（T05）：0 数据行 → `success=true / ai_called=false / confidence=low / answer=「无法进行有效数据分析…」`；无有效表头 → `AI_FILE_INVALID`。**均不编造、不调 AI。**

## 11. AI 分析机制

- AI 职责**仅限解释**：基于确定性结果 JSON 总结主要发现、解释趋势与异常、给出中性建议；
- 上下文 = limitAiContext 产物（**2400 字符预算**、中文重标签、逐级降载：分组/排名 top3 → 趋势首尾各 6 期 → 仅概况），**禁止整 Excel 发 LLM**，sample_rows 永不发送；
- Prompt 六条铁律（§13）；输出固定结构「一、主要发现；二、趋势解读；三、异常与数据质量；四、建议」；
- **AI 数字一致性检查**（checkAiNumberConsistency，确定性实现）：answer 中出现、程序统计集合中不存在的数字 → warning「…相关表述不可作为事实依据，统计数字请以 result 确定性计算结果为准」；
- confidence 由确定性规则推导（数据量/质量/AI 调用状态）。

**实测发现的幻觉与修复**（真实业务文件首轮）：qwen2.5:7b 将趋势点位 `sums.序号=122` 误述为「2021年8月违章次数122次」（实际当月 count=5，且全表峰值在 2023-03 count=12）。三重修复后复核：① 上下文字段中文重标签（`记录条数`/`序号合计` 等歧义消除）；② Prompt 新增铁律 6（字段纪律：引用数字必须连同字段含义与所属期间/分组）；③ 一致性检查兜底。复核后 AI 解读全部数字与程序一致（31次/合计496/均值16 分字段正确引用），无幻觉。

## 12. Evidence

- `aiEvidenceService.createEvidence` 产物，sourceType=`business_record`，sourceDomain=`company.excel.analysis`，sourceField ∈ {dataset, quality, statistics, group_by, ranking, trend, anomalies, processing_notes}，evidenceText 为对应确定性结果摘要（脱敏不含原始单元格），上限 8 条；
- 同一份 evidence 数组**既传 Gateway 校验、又原样返回响应**（T08 验证 DB 落库与响应同源：db=8 resp=8，source_type/source_domain 全一致）；
- 字段缺失=null，不伪造。

## 13. Prompt

- `aiPromptRegistry.js` 注册 `COMPANY_EXCEL_ANALYSIS_PROMPT`（prompt_key=company.excel.analysis，version=v1.0.0，ACTIVE），启动时 `register()`；
- system_prompt 铁律：① 确定性结果数字是唯一事实基础，严禁重算/修改/估算；② 只做解释与提炼；③ 严禁编造，未覆盖如实说明；④ 空值不当 0；⑤ 禁 HSE 专业判定（风险等级/责任认定/违规定性/隐患分级/考核结论），建议只用中性措辞；⑥ **字段纪律**（01-04 实施中新增）：数字字段已中文命名，引用必须连同字段含义与所属期间/分组，严禁把「合计」当「次数」；
- user_prompt_template：`【确定性分析结果】\n{data}\n\n【用户分析目标】\n{custom_instructions}`。

## 14. Model Policy

`data_analysis: { provider: null, promptKey, promptVersion, options: { temperature: 0.2, maxTokens: 1500 } }`。

- provider=null → 由 Gateway 按环境 `AI_PROVIDER` 解析（不硬编码）；
- temperature 0.2：解释任务低随机性；
- 实测 Provider：本地 ollama（qwen2.5:7b）；生产环境配置 grok（生产 .env 未触碰）。

## 15. 权限

- 路由 `SKILL_USER`（JWT 必需）+ skill 内 `resolvePermission` 角色 allowlist（8 角色，与 SK-005 逐字一致）；
- T07：无 token=401、坏 token=401；
- 禁止身份推断：不涉及 employee_id/grid_id/inspector_employee_id，不触碰身份链。

## 16. Generation Record

- 复用 `ai_generation_records`（AI-02 已建扩展列 request_id/prompt_key/prompt_version/evidence，**本阶段 0 migration**）；
- 成功路径：type=data_analysis、sub_type=SK-001、prompt_key/prompt_version/request_id/evidence 全落库（T09 追踪一致、T08 同源）；
- 失败路径：status=failed + error_message 落库（T10b）；T10a/T10b 在多轮测试中持续为真。

## 17. 前端

- 路由：`/company/excel-analysis`（order 13，icon lucide:file-spreadsheet，authority 与后端 allowlist 逐字一致，keepAlive）；
- 页面：`views/company/excel-analysis/index.vue`——NUpload（max 1、default-upload=false、accept 四扩展名）+ 分析目标/工作表名输入 → FormData → `analyzeCompanyExcel`（**显式 timeout 120s**，`Content-Type: undefined`，见 §20 缺陷 1）；展示：数据概况/列识别/数值统计/分组/排名/趋势/异常折叠面板/AI 解读+置信度 HseStatusTag/建议/警告/执行元信息（Skill/Prompt/Provider/耗时/记录/request_id）/Evidence 折叠/人机边界声明；「未调用 AI」场景（T05a）明确标注，不伪装成功；
- API 类型：`CompanyExcelApi` namespace 完整 TS 类型（AnalysisResult/ExcelEvidence/SkillAnalyzeResult）；
- 技术栈合规：Naive UI + 既有 #/components/hse + #/api/request，**未引入 AntD Vue、未新增组件体系**。

## 18. 修改文件清单

| 文件 | 变更 |
| --- | --- |
| `server/services/ai/skills/companyExcelAnalysis.js` | **新建**（~770 行）：元数据/常量、解析引擎、确定性分析、Evidence、AI 上下文、一致性检查、统一输出 |
| `server/services/ai/aiPromptRegistry.js` | 追加 COMPANY_EXCEL_ANALYSIS_PROMPT + 启动注册（铁律 6 为实施中新增） |
| `server/controllers/companyAiController.js` | SK-001 注册表、getSkill 改查注册表、analyzeSK001（扩展名/魔术字节校验 + 临时文件清理） |
| `server/routes/company-ai.js` | sk001Upload（createUploader）+ POST /skills/SK-001/analyze 路由 |
| `安全看板vben/apps/web-naive/src/api/company-ai.ts` | CompanyExcelApi 类型 + analyzeCompanyExcel（120s 超时 + Content-Type: undefined） |
| `安全看板vben/apps/web-naive/src/views/company/excel-analysis/index.vue` | **新建**：分析页 |
| `安全看板vben/apps/web-naive/src/router/routes/modules/company-ai.ts` | 追加 /company/excel-analysis 路由 |

未改动：errors.js、aiGateway.js、aiEnhancedService、双 Router、登录/JWT、生产 .env、app.js。

## 19. 数据库变化

**无 DDL、无 migration、无新表。** 复用既有 `ai_generation_records`（含 01-02 已执行的扩展列）；测试过程产生的记录均为业务数据写入（success/failed 留痕），不涉及任务书禁止的生产表。

## 20. 测试记录

测试脚本（仓库外 Temp，不入库）：`gen-tests.js`（合成 xlsx 生成 + 引擎冒烟）、`run-tests.js`（T01~T10 + REAL + META）、离线核对脚本、浏览器 E2E。

**最终代码状态全量回归：12/12 PASS**（dev 后端 5881 + ollama/qwen2.5:7b，2026-10-12 最终轮）：

| 用例 | 结果 | 证据 |
| --- | --- | --- |
| T01/T02 正常分析+多列 | PASS | 61 行；分组 2/排名 1/趋势 1；provider=ollama；ev=8；record 落库；91.7s |
| T03 空值不当 0 | PASS | mean=20（非 15）、sum=60、empty_cells=3；空值未当 0 |
| T04 重复识别 | PASS | 整行重复 dup=3 |
| T05a 无数据行 | PASS | success=true / conf=low / ai_called=false，14ms |
| T05b 无表头 | PASS | 结构化错误 AI_FILE_INVALID，7ms |
| T06 Provider 异常 | PASS | 单元级：AI_PROVIDER=definitely_not_a_provider → `AI_PROVIDER_NOT_FOUND`，retryable=false |
| T07 权限 | PASS | 无 token=401 / 坏 token=401 |
| META skills 清单 | PASS | count=2（SK-005+SK-001） |
| REAL 真实业务 Excel | PASS | 191 行×7 列；类型识别正确；conf=high；116.3s |
| T08 Evidence 同源 | PASS | db=8 resp=8，source_type/source_domain 全一致 |
| T09 Prompt 追踪 | PASS | company.excel.analysis@v1.0.0 落库一致 |
| T10 Record 成功/失败 | PASS | success/failed 双路径均落库 |

补充：gen-tests 引擎冒烟全绿（类型/分组/排名/趋势/z-score/空值/重复/0 行/指定 sheet）；离线复核 t03 与真实文件确定性输出（§21）。

**实施过程中发现并修复的 2 个真实缺陷**：

1. **前端 multipart Content-Type 缺陷**（浏览器 E2E 发现）：requestClient 默认 JSON Content-Type 导致后端 multer 解析不到文件（AI_INVALID_REQUEST 缺少上传文件）→ 按仓库既有范式补 `headers:{'Content-Type':undefined}`。该缺陷若未验收将影响所有真实用户上传。
2. **本地推理超时缺陷**（API 测试发现）：24000 字符上下文在 CPU 推理下必然撞超时且超模型 num_ctx=4096 被静默截断 → 上下文预算校准 24000→4000→2400（§22），并对开发后端进程覆盖 `AI_TIMEOUT_MS=240000`（仅进程环境变量，未改 .env）。

## 21. 真实业务测试

- 文件：`server/uploads/excel/1788430463029_j6ykftl4t.xlsx`（司机违章台账，16KB，192 非空行 → 191 数据行×7 列：序号/违章日期/司机姓名/违章事由/罚款/计分/备注），符合任务书 §二十八优先类目（带日期/人员/类别/数值的真实台账）；
- 确定性结果（离线复核）：序号=number、违章日期=date（两位年 m/d/yy 扩展生效）、罚款/计分为文本类（含「100元」「记3分」）；trend 月粒度 60 期（2020-11~2026-02）；3 张分组卡（人员/罚款/计分）；备注列空值率 100% 进入高空值列；z-score 标出第 117~121 行序号 26~30（z=3.08~3.71，系台账每页序号 1~25 循环、个别页 26~30 的结构特征）；
- **AI 解读人工核对（数字逐项对程序结果）**：人员排名（第一名 31 次/合计 496/均值 16，第二名 15 次，第三名 14 次——姓名脱敏）、罚款分布（100 元 56 次 29.32%、200 元 54 次 28.27%、0 元 39 次 20.42%）、异常点 Z 分数（3.0804~3.713）、备注 191 空值 100%——**全部与程序一致，无编造、无专业越界判定、建议均为中性措辞**；
- **如实登记**（最终轮复核）：AI 解读中 2021 年 3 月记录数引用为「3 次」（程序 count=2），属 R7 已登记的「真实数字+错误归属」局限的实测实例（数字 3 落在宽松允许集未触发一致性告警）；主结论方向与其余全部数字仍与程序一致，前端已明确「统计数字以 result 为准」；
- 本节人名已脱敏（宋某/麻某/曹某→「第一名/第二名/第三名」表述），报告不含个人信息原文。

## 22. 性能

| 指标 | 实测值 |
| --- | --- |
| 确定性引擎（离线，191 行） | <1s |
| 全链路（本地 ollama qwen2.5:7b，纯 CPU） | T03 63.9s / T04 38.9s / T01 107.7s / REAL 112.5s（4000 字符预算轮） |
| 前端 E2E（2400 字符预算 + 模型热态） | **60.3s**（< 前端 120s 超时） |
| T05 安全返回 | 7~14ms |
| ollama 实测基线 | prefill ≈39 tokens/s（1838 tokens/46.9s）；短请求 2.4s；模型加载后 num_ctx=4096；空闲卸载后冷启动重载 +~40s |
| 上下文预算校准 | 24000（初版）→ 4000 → **2400 字符**（≈1300 tokens）：保证「冷启动重载 + prefill + 生成」叠加后仍在 120s 内，且不触 num_ctx 截断 |

说明：本地 CPU 推理是开发环境约束；生产 provider（grok 远端 API）prefill 在服务端完成，60s 默认超时足够，2400 字符预算仅为保守下限、不影响解释质量（解释职责只消费摘要级统计）。

## 23. 量化效率

| 项 | 值 |
| --- | --- |
| 人工 Excel 分析预计耗时 | **基线待采集**（任务书 §三十五：无真实历史基线时必须如实标注） |
| AI Skill 分析耗时（用户侧） | 上传 + 填目标 + 提交 3 步；等待 60~120s（本地 CPU）/ 生产 provider 下预计 5~15s |
| 节省时间 / 节省比例 | 基线待采集后计算 |
| 人工操作步骤减少 | 人工路径约 10+ 步（打开文件→识别表头→清洗→透视/公式→排名→图表→撰写解读）→ 3 步（选文件→填目标→提交），后续以真实使用记录补充正式基线 |

## 24. 遗留问题

1. **两位年日期口径假设**（登记，不擅自扩改）：`5/9/25 7:42` 类两位年按 `m/d/yy → 20yy` 解析（美式月/日 + 2000 年代假设）。若真实台账存在 `d/m/yy` 或跨世纪数据需单独确认口径后调整；
2. 一致性检查的已知局限（§11）：无法识别「真实数字 + 错误归属」类幻觉，依赖中文重标签 + Prompt 纪律 + 前端「以 result 为准」三重防线，已在代码注释与本文档声明；
3. AI_GENERATION_RECORDS 的 sub_type 存 SKILL_ID（SK-001）而非 skill_key，跨 Skill 统计口径待 AI-03 收编时统一（延续 R2）；
4. 本地 CPU 推理速度受硬件限制（R6），生产 grok 不受影响但尚未实测（无 API KEY）。

## 25. 与 HSE AI 兼容性

- 未修改 errors.js / aiGateway.js / 双 Router / aiEnhancedService / 登录 JWT：HSE AI 链路零代码触碰；
- 回归证据：`GET /api/hse/ai/v2/health` → 200（activeProvider=ollama，providers 正常上报）；`POST /api/company/ai/skills/SK-005/answer` → 200 success（conf=low / evidence=3 / 29.9s，「资料不足」诚实路径正常）；
- SK-001 与 SK-005 共用 Gateway/Registry/Record/Evidence 链路，12 项测试本身即共用链回归。

## 26. 验收 A~P

| 项 | 标准 | 结果 | 证据 |
| --- | --- | --- | --- |
| A | Skill 元数据正确 | ✅ | T01/META：SK-001/company.excel.analysis/v1.0.0/domain=company/type=data_analysis |
| B | 输入协议正确 | ✅ | §8 + T05a/b + 前端校验（NO_FILE/超长） |
| C | 输出协议正确 | ✅ | §9 + T01 全字段断言 |
| D | 文件解析正确 | ✅ | T01~T04/REAL；两位年扩展；指定 sheet；csv 兜底策略 |
| E | 数据质量检查正确 | ✅ | T03（空值）/T04（整行重复）/高空值列 |
| F | 确定性统计正确 | ✅ | T01/T02/T03/REAL + 离线复核逐值核对 |
| G | AI Gateway 调用正确 | ✅ | 统一走 Gateway（无直连）；T08/T09 |
| H | Provider 不硬编码 | ✅ | provider:null → 环境解析；T06 异常路径 |
| I | Prompt Registry 正确 | ✅ | T09：prompt_key@v1.0.0 一致 |
| J | Evidence 正确 | ✅ | T08：db=8 resp=8 同源；business_record/SKILL_KEY |
| K | Generation Record 正确 | ✅ | T10a/T10b 成功+失败双路径；扩展列落库 |
| L | 权限正确 | ✅ | T07 401×2；allowlist 与 SK-005 同口径 |
| M | 错误协议正确 | ✅ | AI_FILE_INVALID/AI_FILE_TOO_LARGE（skill 本地，未改 HSE 协议）/AI_PROVIDER_NOT_FOUND/AI_INVALID_REQUEST |
| N | 前端 Naive UI 正常 | ✅ | 浏览器 E2E 三轮：渲染/校验/上传/提交/结果区块/AI 解读/置信度/元信息/Evidence 全通过（并修复 §20 缺陷 1）；无 JS 运行时错误 |
| O | 真实业务 Excel 测试通过 | ✅ | REAL PASS + AI 解读人工核对无幻觉（§21） |
| P | HSE AI 回归测试通过 | ✅ | §25：ai-v2/health 200 + SK-005 200 |

**A~P 全部通过 → 满足 Testing → Active 条件。**

## 27. 最终状态

- SKILL_STATUS：**Testing → Active**（2026-10-12，A~P 全过后翻转，`companyExcelAnalysis.js` 常量更新）；
- 最终代码状态全量回归 12/12 PASS 后执行翻转；
- 数据库：无变化；生产环境：未触碰（生产 .env / 5876 / 生产表均零操作）；
- 部署提示：生产启用需在生产 .env 配置有效 AI Provider（当前 grok 无 KEY 时 Provider 解析将按既有协议报 AI_PROVIDER_NOT_FOUND，属预期保护）。

## 28. 下一步建议

1. **本阶段到此为止**：不进入 SK-002~SK-004 / Agent / AI 大屏（任务书 §三十八）；
2. 采集人工分析耗时基线（真实使用 3~5 次后回填 §23）；
3. 生产 grok KEY 就绪后做一次生产 Provider 实测（60s 超时足够）；
4. SK-002 立项前建议先完成：R2（record 增补 skill_id/version 列）与 R4（HSE AI 双 Router 收编）——均为 01-03 遗留，非本阶段范围。

---

## 风险清单（延续 + 新增）

| 编号 | 风险 | 状态 |
| --- | --- | --- |
| R1 | Provider 配置问题（KEY 缺失/失效导致 AI 功能不可用） | 延续，未解决（生产 grok 无 KEY；结构化错误可感知） |
| R2 | Generation Record 缺 skill_id/version 独立列（现以 sub_type 存 SKILL_ID） | 延续，待 AI-03 收编 |
| R3 | Knowledge Source ACL 粒度不足 | 延续（SK-005 侧） |
| R4 | HSE AI 双 Router 并存 | 延续，待收编 |
| R5 | 历史代码绕过 Gateway 直连 Provider | 延续 |
| R6 | **新增**：本地 CPU 推理慢（prefill ≈39 tokens/s）+ 模型空闲卸载冷启动（+~40s），前端 120s 超时在冷启动+长上下文叠加时可能触发；已用 2400 字符上下文预算缓解；生产远端 Provider 无此约束 | 已缓解，开发环境固有 |
| R7 | **新增**：AI「真实数字+错误归属」类幻觉无法被程序一致性检查捕获（如把 A 月合计说成 B 月次数）；已用上下文中文重标签 + Prompt 字段纪律 + result 为准三重防线，残余风险低但存在 | 已缓解，持续观察 |
| R8 | **新增**：两位年日期解析口径假设（m/d/yy → 20yy），若真实数据为 d/m/yy 或跨世纪将误判（invalid_dates/趋势失真）；已在 §24 登记，待用户确认口径 | 待口径确认 |

---

## 最终结论（四问）

```text
SK-001 是否完成：        YES
SK-001 当前状态：        Active（2026-10-12 由 Testing 转入）
是否通过 AI-Phase-01-04：YES（验收 A~P 全过，无未解决 P0/P1）
是否可以进入 SK-002：    YES（但按任务书 §三十八 本阶段到此停止，等待下一阶段任务书）
```
