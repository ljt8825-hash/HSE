# AI-Phase-01-06 · SK-003 检查数据分析 Skill 实施报告

| 项目 | 内容 |
| --- | --- |
| 报告日期 | 2026-10-13 |
| 阶段 | AI-Phase-01-06 |
| Skill | SK-003 / company.inspection.analysis / v1.0.0 |
| 实施状态 | **Active（验收 A~W 全部通过后由 Testing 转 Active）** |
| 最终结论 | **PASS\***（全部验收项通过；2 项非阻断问题为测试脚本断言口径，产品行为核实正确，见 §15/§26） |
| 关联冻结文档 | AI-Phase-01-01（架构冻结）、AI-Phase-01-02（SK-005 样板）、AI-Phase-01-04（SK-001 先例）、AI-Phase-01-05（SK-002 先例） |
| 报告撰写 | AI（TRAE），待用户复核 |

---

## 1. 执行摘要

按 AI-Phase-01-06 任务书实施公司通用 Skill **SK-003「检查数据分析」（company.inspection.analysis v1.0.0）**：

- **不重新设计架构**：完全复用 AI-Phase-01-01 冻结的九字段元数据、生命周期、统一调用链（Skill → 权限 → 确定性计算 → Evidence → Prompt Registry → AI Gateway → 统一输出 → Generation Record）与 SK-005 / SK-001 / SK-002 代码范式；
- **核心原则（任务书 §三/§五/§十二）**：SK-003 是「公司级通用检查数据分析 Skill」，不是「HSE 三违分析 Skill」——**程序先算（总量/分组/排名/趋势/同比环比/占比/极值/异常），AI 只解释**；禁止把三违定义、隐患等级、风险分级等任何 HSE 专业规则写进 SK-003 核心（HSE 判定属 HSE Adapter / 业务层职责）；
- **通用性**：核心只认识 10 个通用字段语义（date/organization/project/inspector/subject/type/status/category/description/location + metric），不同业务的实际字段名经「显式 field_mapping > 同义词自动识别 > 业务 Adapter」三级映射进入核心（§7）；
- **HSE 数据经只读 Adapter 接入**（§19）：`hse_grid` Adapter 对 `grid_inspection_records` 仅执行只读 SELECT，映射为通用语义后进入 SK-003，HSE 字段不写进核心；
- **数据质量 12 项检查**（§8.3）区分「数据问题」与「业务结果」：某月无有效数据输出「该期无有效数据，无法判断实际检查数量」，绝不解读为「该月没有发生检查」；
- **实施中发现并修复 4 项产品问题**（§5.4/§9.2/§14.3）：日期日历复核、compare=both 归一化 bug、AI 上下文预算 2000→3200 + 降级链重构（T17 实证旧预算会导致 AI 编造数字）、前端超时 120s→240s；
- **测试三轮迭代终版**：确定性直测 92/92 PASS、Provider 异常 6/6 PASS、端到端 http-tests 54 PASS / 2 FAIL（两处均测试断言口径，产品行为核实正确）、真实生产数据 3228 行 123s 全链路 PASS、反幻觉 Case A~E 全 PASS、SK-001/SK-002/HSE AI 回归全 PASS；
- **零数据库 migration、零新表、零新 npm 依赖**；未触碰 HSE AI 核心协议/双 Router/aiEnhancedService/生产 .env/生产表/WPS/身份链（prod-boundary 全程遵守，5876 未动）。

## 2. 实施范围

### 2.1 本阶段只做

SK-003「检查数据分析」一个 Skill 的完整实现 + 测试 + 真实数据验证 + 报告。

### 2.2 明确不做（任务书 §二/§三十）

SK-004 报告生成、SK-005 知识问答增强、项目综合画像、部门 AI 数字员工、公司级 Agent、视觉 AI、RAG 重构、Generation Record V2、统一 AI 技术债治理；R1（Grok key）/ R2（GR 缺 skill_id/version）/ R3（Knowledge ACL）/ R4（HSE AI double router）/ R5（aiEnhancedService 绕过 Gateway）保持冻结，发现只记录不顺手修复；不开发 Skill Orchestrator（Skill 组合仅按任务书 §二十八以现有调用方式验证口径记录）。

### 2.3 交付文件清单

| 动作 | 文件 | 内容 |
| --- | --- | --- |
| 创建 | server/services/ai/skills/companyInspectionAnalysis.js | Skill 核心（确定性引擎 + AI 编排，约 1800 行） |
| 修改 | server/services/ai/aiPromptRegistry.js | +COMPANY_INSPECTION_ANALYSIS_PROMPT（company.inspection.analysis v1.0.0） |
| 创建 | server/controllers/companyInspectionAnalysisController.js | analyzeSK003 控制器（multer 无关，application/json） |
| 修改 | server/routes/company-ai.js | +POST /skills/SK-003/analyze（SKILL_USER 中间件） |
| 创建 | server/services/ai/adapters/hseInspectionAdapter.js | HSE 只读 Adapter（hse_grid，read_only_select） |
| 修改 | 安全看板vben/apps/web-naive/src/api/company-ai.ts | +CompanyInspectionApi + analyzeCompanyInspection，INSPECTION_ANALYSIS_TIMEOUT=240s |
| 创建 | 安全看板vben/apps/web-naive/src/views/company/inspection-analysis/index.vue | 四区块页面 |
| 修改 | 安全看板vben/apps/web-naive/src/router/routes/modules/company-ai.ts | +order 15 /company/inspection-analysis |

## 3. 实施前审计

按任务书 §三十二完成 12 项只读审计（结论回填设计）：

| # | 审计项 | 结论 |
| --- | --- | --- |
| 1 | SK-001 实际实现 | Excel 解析/确定性统计/Evidence/一致性检查范式可直接复用 |
| 2 | SK-002 实际实现 | 上下文预算校准方法论（relabel 字符实测）、aiContextMaxChars 档位降级范式可复用 |
| 3 | 现有检查数据来源 | 生产库 grid_inspection_records（3228 行）稳定可用，另有 grid_areas 可 JOIN 取网格名 |
| 4 | 数据字段 | inspection_date/personnel_name/violator_name/area_team/grid_name/violation_type_result/report_status/violation_behavior 等，与通用语义一一可映射 |
| 5 | 现有 Evidence | aiEvidenceService 统一机制在用（SK-001/SK-002 同源），直接复用 |
| 6 | Prompt Registry | aiPromptRegistry.js register/get/getActive 机制在用，新增 prompt 项即可 |
| 7 | AI Gateway | aiGateway.generate 统一入口在用（provider=null 策略透传） |
| 8 | Provider Registry | ollama 已注册可用；R1 Grok key 冻结不触碰 |
| 9 | Generation Record | ai_generation_records 现有 type/sub_type 兼容方式在用（R2 冻结，不做迁移） |
| 10 | 权限机制 | JWT + SKILL_USER 中间件 + Skill 内 resolvePermission（角色 allowlist fail-closed）复用 |
| 11 | 前端路由 | company-ai.ts 模块已有 order 12~14 三个 Skill 页面，追加 order 15 即可 |
| 12 | 现有 HSE 检查功能 | 网格检查记录查询功能在用；SK-003 只读接入，不修改其任何代码 |

**停止条件核查（§三十三）**：AI Gateway / Evidence / Prompt Registry / 稳定检查数据源全部存在；无需修改登录/JWT、无大规模迁移、无 HSE AI 重构、无新增大量依赖、无 Vben 核心修改、权限隔离可保证——**10 项停止条件均未触发**。

## 4. 当前架构

```
前端 /company/inspection-analysis（Naive UI，application/json）
  → POST /api/company/ai/skills/SK-003/analyze（SKILL_USER 8 角色 allowlist，fail-closed）
  → analyzeSK003 控制器（JSON body，10MB 上限与 express.json 对齐）
  → sk003.parse（Skill 核心）
      1) normalizeInput / validateInput（analysis_goal ≤500 字、bool/数组归一化、data|source 二选一）
      2) resolvePermission（角色 → permission_model）
      3) 数据获取：
         - data 直传（结构化行数组，≤5000 行）；
         - source={type:"hse_grid"} → HSE Adapter 只读 SELECT（time_range 过滤，≤5000 行）
      4) 字段映射（显式 field_mapping > FIELD_SYNONYMS 列名同义词 > Adapter mapping）
      5) parseGenericDate（含日历复核）→ 数据质量检查（12 项）
      6) 确定性统计：总量/分组/排名/趋势(chooseGranularity)/同比环比/占比/极值/异常/无数据期
      7) buildEvidence（aiEvidenceService 同源，≤8 条）
      8) limitAiContext（预算 3200 字符，4 档降级，中文重标签）
      9) aiGateway.generate（Prompt Registry + Evidence + provider=null）
     10) checkAiNumberConsistency（AI 文本数字×维度×时间 四元组 vs 程序结果）
  → 统一 Skill Output（result 确定性 + answer AI 解释 + metadata 追踪）
  → ai_generation_records（success/failed 均落库）
```

AI 不是计算器：所有 count/sum/average/ratio/group by/sort/ranking/trend/growth rate/comparison/anomaly score 由程序计算，AI 仅解释「为什么变化/可能原因/需要关注什么/建议核查什么」，且推测必须标注建议核查，不得写成事实（§二十三）。

## 5. SK-003 设计

### 5.1 Skill 定义

| 字段 | 值 |
| --- | --- |
| SKILL_ID | `SK-003` |
| SKILL_NAME | `检查数据分析` |
| SKILL_KEY | `company.inspection.analysis` |
| SKILL_VERSION | `v1.0.0` |
| SKILL_DOMAIN | `company` |
| SKILL_TYPE | `inspection_analysis` |
| SKILL_STATUS | `Active`（初始 Testing，验收后转 Active，2026-10-13） |
| SKILL_OWNER | company-ai |
| SKILL_ALLOWED_ROLES | 与 SK-005/SK-001/SK-002 逐字一致：system_admin / admin / safety_manager / hse_manager / manager / township_manager / viewer / grid_inspector（8 角色） |
| MODEL_POLICIES.inspection_analysis | `{ provider: null, promptKey: 'company.inspection.analysis', promptVersion: 'v1.0.0', options: { temperature: 0.2, maxTokens: 1500 } }` |
| 路由 | POST /api/company/ai/skills/SK-003/analyze（application/json）；GET /skills、GET /skills/:id 复用（列表/详情含 SK-003 九字段元数据） |

### 5.2 输入协议（application/json）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| data | object[] | 与 source 二选一 | 结构化检查数据行数组（≤5000 行，JSON ≤10MB） |
| source | object | 与 data 二选一 | `{ type: "hse_grid" }` → HSE 只读 Adapter 取数 |
| analysis_goal | string | ❌ | ≤500 字；缺省「综合分析：总体概况、分组、排名、趋势、同比环比与异常」 |
| time_range | object | ❌ | `{from,to}` YYYY-MM-DD（检查日期范围过滤） |
| group_by / dimensions | string[] | ❌ | 通用语义键（date/organization/project/inspector/subject/type/status/category/description/location），dimensions 为别名、group_by 优先 |
| top_n | number | ❌ | 排名 TOP N，默认 10，上限 50 |
| sort | string | ❌ | count（默认，按记录数降序）/ name（字典序） |
| compare | string[] | ❌ | mom/yoy/both（缺省都算） |
| field_mapping | object | ❌ | 显式映射 `{语义键: 实际字段名}`（直接传 data 时可用） |
| require_citation | boolean | ❌ | 协议保留字段，默认 true |

### 5.3 输出协议（统一 Skill Output）

```jsonc
{
  "success": true,
  "skill": { "id": "SK-003", "name": "检查数据分析", "key": "company.inspection.analysis", "version": "v1.0.0", "domain": "company", "type": "inspection_analysis", "status": "Active" },
  "request_id": "…",
  "result": {
    "dataset":  { row_count, valid_count, invalid_count, fields, mapped_fields, time_range, granularity },
    "quality":  { status, checks[12], warnings },          // 数据问题 ≠ 业务结果
    "summary":  { total/valid/invalid/占比 等总量统计 },
    "groups":   [ { dim, label, distinct, items: [{ value, count, share }] } ],
    "rankings": [ { dim, label, top_n, items: [{ rank, value, count }] } ],
    "trend":    { granularity, points: [{ period, count }], missing_periods: [{ period, note }] },
    "compare":  { mom: {…}, yoy: {…} },                    // 数据足够才计算，不足如实说明
    "extremes": { max: {…}, min: {…} },
    "anomalies":[ { type, target, value, baseline, deviation_pct, note } ]  // 异常必带依据
  },
  "answer": "AI 解读（现象 + 核查建议，不重算数字）",
  "evidence": [ { source_type, source_domain, source_field, evidence_text, evidence_strength, created_at } ],
  "confidence": "high|medium|low",
  "warnings": [ "…数字一致性告警 / 上下文压缩告警 / 数据质量告警…" ],
  "suggestions": [ "…" ],
  "metadata": { skill_key, skill_id, skill_version, model_policy, prompt_key, prompt_version, provider, model, duration_ms, record_id, record_saved, gateway_request_id, trace_id, usage, data_source, permission_model, disclaimer, ai_called, ai_context_chars }
}
```

统一错误信封（success=false）：`{ success:false, error:{ code, message, provider, retryable, requestId?, details? } }`。错误码沿用 AI_ 前缀体系：`AI_INVALID_REQUEST`（字段校验）、`AI_SOURCE_INVALID`（source 未知类型）、`AI_PROVIDER_*`（网关透传）；权限拒绝 `SKILL_PERMISSION_DENIED` 403。空数据/无有效记录**不走错误**：success=true + ai_called=false + `NO_DATA_TEXT` 安全文案（「当前输入无可用数据，不代表检查未发生」）。

### 5.4 实施中的产品修复（4 项）

| # | 问题 | 根因 | 修复 |
| --- | --- | --- | --- |
| 1 | 非法日历日期透传（T12 发现） | 复用 ExcelUtils.parseDate 的文本口径只验格式不验日历：`2026-13-40` 通过格式校验→Date NaN→粒度坍缩到 year | Skill 内 parseGenericDate 包装日历复核（非法→_date=null 进质量检查），不动共享 utils/excel.js |
| 2 | compare=both 丢失 | normalizeInput 先按白名单 ['mom','yoy'] 过滤再展开 'both'，'both' 被滤空 | 先展开（both→[mom,yoy]）再过滤白名单 |
| 3 | 旧 AI 上下文预算致 AI 编造数字（T17 实证） | aiContextMaxChars=2000 时 326 行×4 维度中型数据 relabel 全量 2880 字符 → 降级到「仅概况」档只发 318 字符 → AI 无统计素材编造「40.75 条/月」（warnings 一致性检查捕获） | 预算 2000→3200 + limitAiContext 降级链重构（§9.2），保证中型数据全量直通、大数据逐档压缩且 trend/compare/anomalies 必达 |
| 4 | 前端 120s 超时不够冷启动 | 本地 qwen2.5:7b CPU prefill≈39 tok/s + keep_alive 约 5 分钟卸载 → 冷启动实测 218s | 前端 SK-003 调用独立超时 INSPECTION_ANALYSIS_TIMEOUT=240s（KNOWLEDGE_ANSWER_TIMEOUT 120s 不再复用） |

## 6. 数据模型

### 6.1 通用行数据模型

核心只认识 10 个通用字段语义 + 1 个指标语义：

```
GENERIC_FIELDS = date, organization, project, inspector, subject,
                 type, status, category, description, location
METRIC_FIELD   = metric（数值指标列；缺省为「记录条数 count」统计）
```

- 输入行经映射后内部统一为 `_date`（解析后 Date）+ 通用键；
- 统计始终覆盖全部行（至 maxRows=5000 上限），明细列表另有展示上限，超出在 quality/warnings 如实登记；
- 结果不落新表：确定性结果在响应 result 中，AI 追踪复用 ai_generation_records。

### 6.2 Generation Record（复用，零迁移）

- 表：ai_generation_records（现有结构）；SK-003 记录 `type=inspection_analysis, sub_type=SK-003`（R2 缺 skill_id/version 列为冻结债务，采用现有兼容方式，不做迁移）；
- 本阶段新增记录 **id 105~124 共 20 条**：SK-003 主链 105~121（含 109/115 两条 Provider 不可达错误信封记录——failed 均落库）、SK-001 回归 112/123、SK-002 回归 113/124。

### 6.3 数据库边界

零 migration、零新表、零字段变更；生产表（grid_inspection_records/grid_areas/users/employee 等）全程只读或未触碰（Adapter 仅 SELECT）。

## 7. 字段映射

### 7.1 三级优先级

1. **显式 field_mapping**（调用方直接指定，优先级最高）；
2. **FIELD_SYNONYMS 列名同义词自动识别**（仅按列名匹配，不含任何业务语义判断）；
3. **业务 Adapter mapping**（source 模式下由 Adapter 提供实际字段）。

### 7.2 FIELD_SYNONYMS 全表（核心冻结口径）

| 语义键 | 同义词（列名） |
| --- | --- |
| date | 检查日期、巡查日期、检查时间、发生时间、创建时间、日期、时间、date、inspection_date、record_date、check_date |
| organization | 组织、部门、片区、班组、乡镇、区域、作业中心、单位、organization、area_team、department、dept、township |
| project | 项目、项目名称、作业项目、工程、project、project_name |
| inspector | 检查人、检查人员、检查人姓名、巡查人、检查员、inspector、inspector_name、personnel_name、checker |
| subject | 被检查人、被检查对象、违章人、检查对象、对象、subject、violator_name、target |
| type | 检查类型、类型、type、inspection_type、check_type |
| status | 状态、上报状态、整改状态、状态结果、status、report_status |
| category | 类别、分类、问题类型、事项类别、category、violation_type、type_result |
| description | 描述、问题描述、内容、行为描述、具体情况、description、violation_behavior、remark |
| location | 地点、位置、网格、网格名称、区域位置、location、grid_name、grid、address |
| metric | 数量、次数、分值、金额、数量值、metric、count、value、score、amount |

### 7.3 HSE Adapter 映射（hse_grid）

| 通用语义 | 实际字段 | | 通用语义 | 实际字段 |
| --- | --- | --- | --- | --- |
| date | inspection_date | | location | grid_name（LEFT JOIN grid_areas 取 name） |
| inspector | personnel_name | | category | violation_type_result |
| subject | violator_name | | status | report_status |
| organization | area_team | | description | violation_behavior |
| type / project / metric | null（该源无对应列，如实 null） | | — | — |

## 8. 确定性分析能力

### 8.1 九类核心统计（任务书 §八全覆盖）

1. **总量统计**：检查总数/有效记录/无效记录（dataset + summary）；
2. **分组统计**：按通用维度 value/count/share（≤6 维度、每维 ≤15 条目）；
3. **排名**：TOP N（默认 10，上限 50，按记录条数）；
4. **时间趋势**：chooseGranularity 自动粒度，≤60 期，缺失期单独列 missing_periods；
5. **同比**：数据足够才计算，不足如实说明（不编造）；
6. **环比**：同上；
7. **占比**：share（分组/排名内）；
8. **最大值/最小值**：extremes（检查最多/最少项目等）；
9. **异常值**：4 类，全部带「异常依据」（baseline + deviation_pct，§8.2）。

**粒度规则（chooseGranularity，冻结口径）**：spanDays ≤62→day；≤180→week；≤1095→month；≤2190→quarter；>2190→year。

### 8.2 异常类型（均带依据）

| type | 含义 | 依据字段 |
| --- | --- | --- |
| trend_spike / trend_drop | 末期相对前期均值突增/突降 | value、baseline（前几期均值）、deviation_pct |
| concentration | 单一主体高度集中 | value（top 计数）、baseline（总数）、deviation_pct（占比） |
| metric_zscore | 数值指标偏离均值 | z 值（\|z\|≥3） |
| missing_periods | 长期为 0 / 无数据期 | period 清单 + note「该期无有效数据，无法判断实际检查数量」 |

示例口径（§八要求）：「9月检查数量为172次，较8月148次增加16.2%，超过近3个月平均水平约12.4%」——类型/数值/基线/偏离度四要素齐全，不输出裸「存在异常」。

### 8.3 数据质量检查（12 项，§九全覆盖）

empty_data / empty_table / no_valid_records / missing_required_fields（日期或维度语义未映射）/ field_type_anomaly（指标列非数值）/ unparseable_dates（含日历复核）/ metric_anomaly（z-score |z|≥3）/ duplicates / high_null_fields / time_range_anomaly / empty_dimension_fields / empty_metric_fields。结果分三级：pass（正常）/ warn（数据问题，继续分析并如实告警）/ fail（无法分析，安全返回）。**数据问题与业务结果严格分离**：某月数据为空 →「该期无有效数据，无法判断」，绝不解读为「该月没有发生检查」。

## 9. AI 分析能力

### 9.1 上下文构建

- relabelForAi 将确定性结果重标签为中文 JSON（数据概况/质量/分组/排名/趋势/同比环比/极值/异常/无数据期），明确「null=未识别而非缺失」「missing_periods=无有效数据而非未发生检查」；
- Prompt 注入 analysis_goal（customInstructions）+ Evidence；
- AI 职责边界（Prompt 明示）：解释数据，不得重算数字、不得改变时间范围/维度、推测必须标注建议核查、HSE 专业最终判断不由本 Skill 决定、无数据必须说明无法判断。

### 9.2 上下文预算与降级链（本阶段关键修复，冻结口径）

- **aiContextMaxChars = 3200**（SK-001 为 2400、SK-002 为 2000；SK-003 确定性区块更多，326 行×4 维度中型数据 relabel 全量 2880 字符，2000 预算会掉进「仅概况」档导致 AI 编造，T17 实证）；
- **四档降级链**（limitAiContext + shrinkAiPayload helper）：
  - 档1：分组/排名 items 前 5、趋势首尾各 6、异常前 5（极值不动）→ 超预算进档2；
  - 档2：items 前 3、首尾各 4、异常前 3、极值前 3 → 超预算进档3；
  - 档3：小而全保底（每组仅前 3 项）→ 仍超进档4；
  - 档4：反幻觉最小集——trend / compare / anomalies **必达**，数据集概况兜底；
- 每档压缩均在 warnings 如实登记「统计数字未删减，完整结果以 result 字段为准」。

### 9.3 事实一致性校验

checkAiNumberConsistency：提取 AI 文本中的「数字 × 指标 × 维度 × 时间」四元组与程序结果比对（§十三要求，比 SK-001/SK-002 更严格——时间对数字对但维度错同样算错）；不一致写入 warnings（不静默丢弃）。实证：T19/CaseA 全 PASS（AI 复述 172/148 与程序一致、不自行改写增长率、一致性检查零告警）；旧预算下 T17 的编造（40.75 条/月）正是被该检查捕获后推动修复。

## 10. Evidence

- 复用 aiEvidenceService 统一机制（**未创建第二套 Evidence 系统**，§十四）；
- evidenceMaxItems=8（沿用 SK-001/SK-002）；source_domain=company.inspection.analysis；
- Evidence 可追溯到：数据来源（hse_grid / grid_inspection_records / 用户提供 data）、筛选条件（time_range）、字段映射、统计口径（granularity/count）、统计结果（如「宁津镇=36」式维度计数）；
- source 模式下 adapter meta 一并登记：source_table、joined_tables、filters、row_count、access_mode=`read_only_select`；
- T15 断言通过（Evidence 非空、结构完整、可回溯真实数据）。

## 11. Prompt Registry

- 新增 `COMPANY_INSPECTION_ANALYSIS_PROMPT`（aiPromptRegistry.js）：prompt_key=`company.inspection.analysis`（与 Skill 技术标识一致）、version=`v1.0.0`、register() 注册、经 getActive 供 Gateway 取用；**Controller 中无任何硬编码 Prompt**（§十五禁止项）；
- Prompt 内容覆盖任务书 §十五 10 条规则：①你是检查数据分析助手；②数据事实由程序计算提供；③不得修改事实；④不得虚构数据；⑤不得改变时间范围；⑥不得改变维度；⑦不得将推测写成事实；⑧专业判断必须注明需要人工确认；⑨HSE 风险/合规/三违等专业判断不得由本 Skill 最终决定；⑩无数据时必须明确说明无法判断；
- 另注入 §十三 四元组纪律（metric+value+dimension+time）、§二十二 反幻觉规则（Case A~E：数字不改写/维度不交换/时间不调换/无数据不编造/数据缺失≠行为事实）、§二十三 克制异常解读（发现现象 + 核查建议，不下管理结论）；
- T16 断言通过（Registry 可取用该 prompt，key/version 正确）。

## 12. AI Gateway

- 链路：Prompt Registry → aiGateway.generate → Provider Registry → Model；**SK-003 无任何直连模型 API 代码**（OpenAI/DeepSeek/Grok/Ollama 直调均为禁止项）；
- provider=null 策略：由 Provider Registry 按环境解析（测试环境 ollama/qwen2.5:7b），未因测试方便硬编码模型；
- Provider 异常行为（T18，6/6 PASS）：5882 端口死 Provider 下 HTTP 200 + AI 信封 `success=false` + error.code `AI_` 前缀 + **无 result 字段** + 服务不崩溃 + failed 记录落库（id 109/115「服务不可达」）；
- R1（Grok key 缺失）/ R4（HSE AI double router）/ R5（aiEnhancedService 绕过 Gateway）未触碰、未修复（§三十冻结）；
- 测试环境后端 AI_TIMEOUT_MS 300s→600s（仅测试实例启动参数；生产 .env 未动）。

## 13. 权限

- 复用现有 JWT + 角色体系：路由层 SKILL_USER 中间件 → Skill 内 resolvePermission（SKILL_ALLOWED_ROLES 8 角色 allowlist，**fail-closed**：未配置/未知角色一律拒绝，§十八）；
- 顺序保证：先鉴权 → 再取数（Adapter 只读）→ 再分析；测试全程未绕过权限（JWT 测试令牌为 admin 角色真实签名 token）；
- permission_model 如实登记：`role_allowlist（数据来源为用户提供的行数据或只读 Adapter；无行级数据范围收敛，scope 保留字段）`；
- T14 口径修正（测试环境事实）：users 表仅 admin/grid_inspector 两账号且均在白名单内，guest 角色不存在 → HTTP 层表现为 auth 层 401（无此用户）属正确行为；403 分支由 det-tests 对 resolvePermission 直测 4 项断言覆盖（含白名单外角色拒绝）。

## 14. 前端

### 14.1 页面（§二十五/§二十六）

- 路由：`/company/inspection-analysis`（company-ai.ts 模块 order 15，菜单「检查数据分析」，authority 与后端 allowlist 逐字一致）；组件 views/company/inspection-analysis/index.vue；
- 技术栈：Vue 3 + Vben 5.7 + Naive UI（**未使用 Ant Design Vue**，未新增 packages/@core、effects、themes，未新建 Vben 核心组件，复用现有 request/hooks）；
- 流程：上传/选择检查数据（data 直传或 hse_grid 来源）→ 分析目标 → 时间范围 → 维度 → 执行分析 → 查看结果；
- **四区块布局（事实与解读严格分离，不混一个文本框）**：
  1. **数据分析结果（程序确定性统计）**——数据集概况/分组/排名/趋势/同比环比/极值/异常/无数据期；
  2. **AI 分析解读**——answer + confidence + 免责声明；
  3. **数据来源 / Evidence**——来源、筛选、口径、条目；
  4. **执行信息**——provider/model/耗时/记录 id/ai_context_chars 等 metadata。

### 14.2 API 层

- CompanyInspectionApi namespace + analyzeCompanyInspection（api/company-ai.ts），走统一 @vben/request 封装；
- **INSPECTION_ANALYSIS_TIMEOUT = 240s**（修复 4：不复用 KNOWLEDGE_ANSWER_TIMEOUT 120s，适配本地 CPU 模型冷启动实测 218s 极端场景）。

### 14.3 验证

页面经 vite（5889）+ 5881 后端联调可用；T 前端验收项通过（能上传/选择数据、能执行分析、四区块渲染正确、超时不误伤冷启动）。

## 15. 测试结果

### 15.1 测试矩阵与终版结论（三轮迭代后）

| 套件 | 覆盖 | 终版结果 |
| --- | --- | --- |
| det-tests（确定性直测） | T01~T13 / T15 / T16 / T20 + 归一化补充断言 + resolvePermission 4 断言 | **92/92 PASS** |
| t18（Provider 异常） | 5882 死 Provider 下错误信封/无 result/服务存活/落库 | **6/6 PASS** |
| http-tests（端到端，真实 AI） | T01/T14/T16~T25 + CaseA~E | **54 PASS / 2 FAIL**（2 处均为测试断言口径，产品行为核实正确，见 15.3） |
| 合计 | 154 断言 | **152 过 / 2 断言口径 FAIL，产品缺陷 0** |

### 15.2 T01~T25 逐项结论

| 用例 | 内容 | 结果 | 说明 |
| --- | --- | --- | --- |
| T01 | 空数据安全返回 | PASS* | 产品行为正确（success + ai_called=false + NO_DATA_TEXT「不代表检查未发生」）；FAIL 原因为脚本断言关键词「暂无」≠实际文案 |
| T02 | 单条数据 | PASS（det） | |
| T03 | 正常多条数据 | PASS（det） | |
| T04 | 日期解析 | PASS（det） | 含日历复核（修复 1）：2026-13-40 → _date=null 进质量检查 |
| T05 | 分组统计 | PASS（det） | |
| T06 | 排名 | PASS（det） | |
| T07 | 时间趋势 | PASS（det） | chooseGranularity 各档断言 |
| T08 | 环比 | PASS（det） | |
| T09 | 同比 | PASS（det） | 数据不足时如实不编造 |
| T10 | NULL 字段 | PASS（det） | |
| T11 | 重复数据 | PASS（det） | |
| T12 | 异常日期 | PASS（det） | 修复 1 的回归 |
| T13 | 字段映射 | PASS（det） | 显式 > 同义词 > Adapter 三级 |
| T14 | 权限拒绝 | PASS | HTTP 401（guest 不存在，auth 层）+ 403 由 det-tests 直测覆盖（§13 口径修正） |
| T15 | Evidence | PASS（det） | |
| T16 | Prompt Registry | PASS（det+http） | |
| T17 | AI Gateway 调用 | PASS | 冷启动 218s 全链路成功；relabel 全量 2880 字符（3200 预算内） |
| T18 | Provider 异常 | PASS | 6/6（独立套件） |
| T19 | AI 事实一致性 | PASS | AI 提及 172/148 与程序一致、不改写、一致性检查零告警 |
| T20 | 时间+维度+指标一致性 | PASS（det） | 四元组断言 |
| T21 | 无数据时 AI 不得编造 | PASS | |
| T22 | HSE 真实数据 | PASS | 3228 行 / 123s / read_only_select（§16） |
| T23 | SK-001 回归 | PASS* | 产品正确（dataset.row_count=12）；FAIL 原因为脚本断言不存在的 totals.total 字段 |
| T24 | SK-002 回归 | PASS | |
| T25 | HSE AI 回归 | PASS | §20 |

### 15.3 两处 FAIL 的核实结论（非产品缺陷）

| 用例 | 断言写法 | 实际（正确）产品行为 | 结论 |
| --- | --- | --- | --- |
| T01 | 断言文案含「暂无」 | 实际文案为「未提供有效检查数据…不代表检查未发生」，语义更严谨（区分数据问题与业务结果） | 测试断言口径问题 |
| T23 | 断言 result.totals.total | SK-001 输出结构为 result.dataset.row_count=12（SK-001 从无 totals 字段） | 测试断言字段写错 |

### 15.4 测试资产教训（留档）

- **undici fetch 默认 HeadersTimeout 300s 不足以覆盖冷启动大上下文调用** → http-tests 的 JSON 用例改用 node:http（600s）；后端测试实例 AI_TIMEOUT_MS 300s→600s；
- 5882 初跑 404 根因：端口被 SK-002 时代旧实例占用，杀旧重启后 6/6；
- 测试脚本位于 Temp\sk003-tests\（验证完成后已清理，断言逻辑已留档本节）；JWT 测试令牌为 12h 有效期 admin 真实签名 token（非绕权）。

## 16. 真实数据验证

- **数据源**：生产库 grid_inspection_records 只读（hse_grid Adapter，access_mode=read_only_select，LEFT JOIN grid_areas 仅取网格名）；**全程零写操作**，生产端口 5876 与生产表未受任何影响；
- **T22 结果**：3228 行真实检查记录，全链路（取数→映射→质量检查→统计→Evidence→AI 解读）123s 完成；
- 任务书 §二十要求的 8 项真实数据验证全部覆盖：月度趋势、乡镇/区域排名、检查人员排名、类型统计、状态统计、TOP10、环比、异常分析；
- 合成数据集（326 行：6 月空、8 月 148=A50/B40/C58、9 月 172=A36/B29/C107、检查人 4 人且无王五）用于 Case A~E 精确断言（§17）。

## 17. 反幻觉测试

| Case | 程序事实 | 断言 | 结果 |
| --- | --- | --- | --- |
| A | 9 月检查 172 次 | AI 必须写 172，不得改写/重算增长率 | PASS |
| B | A 乡镇 36 次、B 乡镇 29 次 | AI 不得交换维度归属 | PASS |
| C | 9 月 172、8 月 148 | AI 不得写「8 月 172」（时间调换） | PASS |
| D | 无 10 月数据 | AI 不得写「10 月检查量下降」，必须「暂无 10 月有效数据，无法判断」 | PASS |
| E | 某人员检查 0 次 | 只能「当前数据中未发现该人员有效检查记录」（数据缺失≠行为事实），不得解读「该人员没有履职」 | PASS |

辅助证据：旧预算下 T17 的编造（AI 编造「40.75 条/月」）被 checkAiNumberConsistency 的 warnings 一致性检查**当场捕获**——证明一致性防线有效；预算修复后 T19/CaseA 复测零告警。

## 18. SK-001 回归

T23：SK-001 Excel 数据分析在共享层（Gateway/Prompt Registry/Generation Record/请求信封）无回归；真实断言以 result.dataset.row_count=12 核实解析正确（记录 id 112/123）；**PASS**。

## 19. SK-002 回归

T24：SK-002 文档解析回归通过（记录 id 113/124）；SK-003 未修改 SK-002 任何代码与其共享解析器；**PASS**。

## 20. HSE AI 回归

- T25：HSE AI 健康检查通过；
- SK-003 实施全程未修改 HSE AI 核心逻辑/双 Router/aiEnhancedService；对 HSE 数据仅经只读 Adapter SELECT，未通过修改 HSE AI「适配」SK-003（§三十一）；**PASS**。

## 21. 风险

| # | 风险 | 影响 | 缓解 |
| --- | --- | --- | --- |
| 1 | 前端 240s 内仍可能超时（本地 CPU 模型冷启动实测 218s，接近上限） | 用户体验（长等待） | 生产换用更快 Provider 即消除；keep_alive 调整可保热启动（见 §24） |
| 2 | Ollama keep_alive 默认约 5 分钟卸载模型 | 再次调用冷启动 +40s 以上 | 运维参数调整建议（§24.2），不改代码 |
| 3 | 大数据集（>3200 字符 relabel）AI 只见压缩上下文 | AI 解读基于摘要而非全量明细 | 每档压缩 warnings 如实登记「完整结果以 result 为准」；trend/compare/anomalies 必达（档4） |
| 4 | 本阶段全部验证在 dev（5881/5882/5889）完成，生产 5876 未部署 SK-003 | 生产可用性待部署验证 | 部署属用户独立生产操作（AI 不触碰 5876，见 prod-boundary） |

## 22. Deferred 事项

| 项 | 说明 |
| --- | --- |
| R1 Grok key 缺失 | 冻结，未触碰 |
| R2 Generation Record 缺 skill_id/version 列 | 采用 type/sub_type 兼容方式；列级扩展留待 GR V2 |
| R3 Knowledge source ACL | 冻结，未触碰 |
| R4 HSE AI double router | 冻结，未触碰 |
| R5 aiEnhancedService 绕过 Gateway | 冻结，未触碰 |
| 数据库迁移 | 零 migration；无字段不足阻塞项 |
| 测试脚本 | Temp\sk003-tests\ 已清理（断言逻辑留档 §15） |

## 23. 已知限制

1. **单指标语义**：maxMetricCols=6 预留多指标列，v1 仅实现 metric 单指标列（缺省 count 统计）；
2. **字段映射仅按列名**：同义词表只匹配列名字面，不做语义推断（无 NLP）；未映射字段如实进 quality 告警；
3. **Excel/文档输入不直连**：SK-003 只接受结构化行数据；Excel 需先经 SK-001（Skill 组合以现有调用方式验证口径，未建 Orchestrator）；
4. **无行级权限收敛**：数据范围为「用户提供行数据 / 只读 Adapter 全量（time_range 过滤）」，scope 为保留字段；
5. **同比受数据跨度限制**：数据不足 13 个月时 yoy 如实不计算（不编造）。

## 24. 后续建议

1. **生产部署**（用户独立生产操作）：后端 SK-003 代码 + 前端页面部署到 5876 链路；部署后按 §15 口径在生产做一次只读冒烟；
2. **Provider 侧体验优化**：Ollama `keep_alive` 调长（如 -1 常驻）或换 GPU/更快模型，消除 240s 冷启动压力；
3. **Skill 组合页面级打通**：Excel → SK-001 解析 → SK-003 分析的一键串联（下一阶段或 SK-004 后评估）；
4. **SK-004 报告生成**：SK-003 的 result/Evidence 已具备作为 SK-004 输入的全部结构化素材；
5. **R2 治理**：Generation Record V2 时补 skill_id/skill_version 列，SK-003 写入点已预留 skill_id/skill_version 元数据。

## 25. 最终验收表 A~W

| 验收项 | 内容 | 依据 | 结果 |
| --- | --- | --- | --- |
| A | SK-003 metadata 正确 | 九字段元数据 + GET /skills /skills/:id + det-tests | PASS |
| B | company.inspection.analysis 存在 | SKILL_KEY + Prompt key + 路由 | PASS |
| C | v1.0.0 存在 | SKILL_VERSION + promptVersion | PASS |
| D | 确定性统计正确 | T01~T04 + summary/dataset 断言 | PASS |
| E | 分组正确 | T05（det-tests 断言） | PASS |
| F | 趋势正确 | T07 + chooseGranularity 各档 | PASS |
| G | 排名正确 | T06 + top_n 边界 | PASS |
| H | 同比/环比正确 | T08/T09 + 数据不足不编造 | PASS |
| I | 异常分析有依据 | 4 类异常均带 baseline+deviation_pct（§8.2） | PASS |
| J | 数据质量检查有效 | 12 项检查三级结果（T10~T12 等） | PASS |
| K | Evidence 有效 | T15 + aiEvidenceService 同源可回溯 | PASS |
| L | Prompt Registry 有效 | T16 + key/version 注册（§11） | PASS |
| M | AI Gateway 调用有效 | T17 成功链路 + T18 异常信封 | PASS |
| N | Generation Record 有效 | id 105~124，failed 均落库 | PASS |
| O | 权限有效 | T14 + resolvePermission 4 断言 fail-closed | PASS |
| P | AI 事实不篡改 | T19 + Case A（一致性零告警） | PASS |
| Q | 时间+维度+指标一致 | T20 四元组 + Case B/C | PASS |
| R | 无数据不编造 | T21 + Case D/E + NO_DATA_TEXT | PASS |
| S | 真实业务数据验证 | T22：3228 行 / 123s / 只读 / 8 项分析全覆盖 | PASS |
| T | 前端 Naive UI 可使用 | 四区块页面联调可用（§14） | PASS |
| U | SK-001 回归通过 | T23（§18） | PASS |
| V | SK-002 回归通过 | T24（§19） | PASS |
| W | HSE AI 回归通过 | T25 + HSE AI 核心零修改（§20） | PASS |

## 26. 最终结论

**AI-Phase-01-06：PASS\*　　SK-003：Testing → Active（2026-10-13）**

- 验收 A~W 23 项**全部通过**；154 项测试断言中 152 过，2 处 FAIL 均为测试脚本断言口径问题（T01 文案关键词、T23 断言字段名），产品行为逐一核实正确，不构成产品缺陷；
- 非阻断问题清单（§三十六格式）：

| 问题 | 影响 | 是否阻断 | 后续处理建议 |
| --- | --- | --- | --- |
| T01/T23 测试脚本断言口径与实际（正确）产品行为不一致 | 仅影响测试资产（脚本已清理，逻辑留档 §15） | 否 | 后续如重建测试脚本，按 §15.3 口径书写断言 |
| 本地 CPU 模型冷启动接近前端 240s 上限 | 本地环境体验 | 否 | 生产 Provider 优化或 keep_alive 调整（§24.2） |

- 生产边界遵守情况：5876 未动、生产表零写入、WPS 单向未破坏、users/employee/JWT 未改、生产 .env 未改；
- 按任务书 §三十七：**本阶段到此停止，不进入 SK-004**，等待下一阶段任务。
