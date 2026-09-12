# HSE AI分析模型设计

> 文档版本：v1.0
> 生成日期：2026 年 7 月
> 所属阶段：HSE Dashboard Sprint8-B
> 关联文档：《Sprint8-B AI辅助决策中心设计报告》、《AI报告生成设计》

---

## 一、设计概述

### 1.1 设计背景

Sprint8-B AI 辅助决策中心需要依托 AI 分析模型提供风险分析、事故分析、整改建议和预测解释能力。本设计文档详细说明 AI 分析模型的架构、Prompt 设计、数据处理和输出解析机制。

### 1.2 设计目标

1. **模型标准化**：统一 AI 模型接入方式，支持多提供商切换
2. **Prompt 规范化**：制定 Prompt 模板标准，确保输出质量稳定
3. **数据结构化**：统一输入输出数据结构，便于前后端对接
4. **性能可控**：设计合理的 Token 限制和超时控制

### 1.3 模型类型

| 模型编码 | 模型类型 | 说明 |
|----------|----------|------|
| HSE-AI-RISK | 风险分析模型 | 组织/人员/事故风险分析 |
| HSE-AI-ACCIDENT | 事故分析模型 | 事故原因分析、管理缺陷识别 |
| HSE-AI-RECTIFY | 整改建议模型 | 风险问题整改措施生成 |
| HSE-AI-REPORT | 报告生成模型 | 管理报告自动生成 |
| HSE-AI-PREDICT-EXPLAIN | 预测解释模型 | 预测结果原因解释 |

---

## 二、模型架构设计

### 2.1 架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AI 分析服务层                                │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                    统一模型调用接口                               │ │
│  │  invokeModel(modelType, prompt, options)                        │ │
│  └──────────────────────────────┬──────────────────────────────────┘ │
│                                 │                                    │
│  ┌──────────────────────────────▼──────────────────────────────────┐ │
│  │                    Prompt 构造引擎                               │ │
│  │  - constructRiskAnalysisPrompt()                                │ │
│  │  - constructAccidentAnalysisPrompt()                           │ │
│  │  - constructRectifySuggestionPrompt()                          │ │
│  │  - constructReportPrompt()                                      │ │
│  │  - constructPredictionExplainPrompt()                          │ │
│  └──────────────────────────────┬──────────────────────────────────┘ │
│                                 │                                    │
│  ┌──────────────────────────────▼──────────────────────────────────┐ │
│  │                    结果解析引擎                                   │ │
│  │  - parseStructuredOutput()                                      │ │
│  │  - extractJSON()                                               │ │
│  │  - validateOutput()                                            │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                       AI 提供商适配层                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐   │
│  │  OpenAI     │  │ Azure OpenAI│  │      自定义模型              │   │
│  │  Adapter    │  │  Adapter    │  │      Adapter                │   │
│  └─────────────┘  └─────────────┘  └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 核心组件

| 组件 | 说明 |
|------|------|
| 统一模型调用接口 | 对外提供统一的模型调用入口，屏蔽底层差异 |
| Prompt 构造引擎 | 根据分析类型构造结构化 Prompt |
| 结果解析引擎 | 解析 AI 输出为结构化数据 |
| AI 提供商适配层 | 适配不同 AI 提供商的 API 差异 |

---

## 三、Prompt 模板设计

### 3.1 Prompt 模板结构

```
[系统角色定义]
你是一个专业的HSE（健康、安全、环境）分析助手...

[上下文数据]
以下是分析对象的相关数据：
{context_data}

[分析要求]
请根据以上数据，进行以下分析：
1. ...
2. ...

[输出格式要求]
请按以下JSON格式输出分析结果：
{output_schema}
```

### 3.2 风险分析 Prompt 模板

**模板编码：TPL-RISK-ANALYSIS**

```
# 系统角色
你是一个专业的HSE风险分析专家，擅长分析组织、人员和事故的风险状况，并提供专业的风险评估和改进建议。

# 分析对象
目标类型：{target_type}
目标名称：{target_name}
分析周期：最近 {months} 个月

# 数据上下文
## 风险评分历史（最近12个月）
{risk_score_history}

## 考核记录
{assessment_records}

## 事故记录
{accident_records}

## 预警记录
{warning_records}

## 整改记录
{rectification_records}

# 分析要求
请对以上数据进行综合分析，包括：
1. 风险概况：总体风险评价和等级判定
2. 趋势分析：风险评分变化趋势及原因
3. 关键因子：识别导致风险变化的主要因素
4. 改进建议：针对性的风险降低措施

# 输出格式
请严格按照以下JSON格式输出，不要输出其他内容：
{
  "summary": "总体风险评价（一段话）",
  "riskOverview": {
    "currentScore": 当前风险评分,
    "riskLevel": "风险等级（critical/major/minor/info）",
    "trend": "趋势（up/down/stable）"
  },
  "trendAnalysis": "趋势分析详细说明",
  "keyFactors": [
    {
      "factor": "因子名称",
      "impact": 影响程度(0-1),
      "description": "因子说明"
    }
  ],
  "suggestions": [
    {
      "priority": "优先级（high/medium/low）",
      "category": "类别",
      "suggestion": "建议内容",
      "expectedEffect": "预期效果"
    }
  ],
  "confidence": 置信度(0-1)
}
```

### 3.3 事故分析 Prompt 模板

**模板编码：TPL-ACCIDENT-ANALYSIS**

```
# 系统角色
你是一个专业的HSE事故分析专家，擅长分析事故原因、识别管理缺陷并提供整改建议。

# 事故信息
事故编号：{accident_code}
事故类型：{accident_type}
事故等级：{accident_level}
发生时间：{accident_time}
发生地点：{accident_location}
事故描述：{accident_description}

# 当事人信息
{employee_info}

# 历史同类事故
{similar_accidents}

# 分析要求
请对以上信息进行分析，包括：
1. 事故概况：事故基本情况概述
2. 可能原因：分析事故的可能原因及概率
3. 管理缺陷：识别可能导致事故的管理缺陷
4. 整改建议：针对性的整改措施建议

# 输出格式
请严格按照以下JSON格式输出，不要输出其他内容：
{
  "summary": "事故概况摘要",
  "causes": [
    {
      "type": "原因类型（人为因素/管理因素/环境因素/设备因素）",
      "probability": 可能性(0-1),
      "description": "原因说明"
    }
  ],
  "defects": [
    {
      "area": "管理领域",
      "defect": "缺陷描述"
    }
  ],
  "suggestions": [
    {
      "priority": "优先级（high/medium/low）",
      "category": "类别",
      "suggestion": "建议内容",
      "responsible": "责任部门",
      "deadline": "建议完成时限"
    }
  ],
  "confidence": 置信度(0-1)
}
```

### 3.4 整改建议 Prompt 模板

**模板编码：TPL-RECTIFY-SUGGESTION**

```
# 系统角色
你是一个专业的HSE整改建议专家，擅长针对风险问题提出具体、可操作的整改措施。

# 问题背景
来源类型：{source_type}
问题描述：{risk_description}
风险等级：{risk_level}

# 上下文信息
{context_info}

# 分析要求
请针对以上问题，提出整改建议：
1. 建议应有明确的优先级和时限
2. 建议应具体、可操作、可衡量
3. 建议应明确责任部门和预期效果
4. 建议数量控制在3-5条

# 输出格式
请严格按照以下JSON格式输出，不要输出其他内容：
{
  "summary": "整改建议摘要",
  "suggestions": [
    {
      "sequence": 序号,
      "priority": "优先级（high/medium/low）",
      "category": "类别（培训教育/过程管控/设备管理/制度建设/考核激励）",
      "suggestion": "整改措施标题",
      "description": "整改措施详细说明",
      "expectedEffect": "预期效果",
      "responsible": "责任部门",
      "deadline": "建议完成时限"
    }
  ],
  "confidence": 置信度(0-1)
}
```

### 3.5 预测解释 Prompt 模板

**模板编码：TPL-PREDICT-EXPLAIN**

```
# 系统角色
你是一个专业的HSE风险预测解释专家，擅长解释风险预测结果，分析风险升高的原因。

# 预测信息
预测对象：{target_name}
预测评分：{predicted_score}
预测等级：{predicted_level}
预测趋势：{predicted_trend}
置信度：{confidence}

# 预测因子
{contributing_factors}

# 历史趋势
{historical_trend}

# 分析要求
请解释预测结果：
1. 风险升高的主要原因
2. 各因子的贡献程度
3. 趋势变化的背后逻辑
4. 应对建议及预期效果

# 输出格式
请严格按照以下JSON格式输出，不要输出其他内容：
{
  "summary": "预测结果解释摘要",
  "keyFactors": [
    {
      "factor": "因子名称",
      "contribution": 贡献度(0-1),
      "explanation": "因子解释"
    }
  ],
  "trendAnalysis": "趋势分析说明",
  "riskAreas": ["风险领域1", "风险领域2"],
  "recommendations": [
    {
      "priority": "优先级",
      "action": "建议行动",
      "expectedImpact": "预期影响"
    }
  ]
}
```

---

## 四、数据聚合设计

### 4.1 风险分析数据聚合

```javascript
async function aggregateRiskAnalysisData(targetType, targetId, months = 12) {
  const data = {
    riskScoreHistory: [],
    assessmentRecords: [],
    accidentRecords: [],
    warningRecords: [],
    rectificationRecords: []
  };

  // 1. 风险评分历史
  if (targetType === 'employee') {
    const riskHistory = await pool.query(`
      SELECT 
        snapshot_date,
        risk_score,
        risk_level
      FROM employee_risk_snapshot
      WHERE employee_id = $1
        AND snapshot_date >= NOW() - INTERVAL '${months} months'
      ORDER BY snapshot_date ASC
    `, [targetId]);
    data.riskScoreHistory = riskHistory.rows;
  }

  // 2. 考核记录
  const assessments = await pool.query(`
    SELECT 
      assessment_date,
      total_score,
      deduction,
      level
    FROM hse_assessment
    WHERE target_type = $1 AND target_id = $2
      AND assessment_date >= NOW() - INTERVAL '${months} months'
    ORDER BY assessment_date DESC
  `, [targetType, targetId]);
  data.assessmentRecords = assessments.rows;

  // 3. 事故记录
  const accidents = await pool.query(`
    SELECT
      accident_code,
      accident_type,
      accident_level,
      accident_time,
      description
    FROM hse_accident
    WHERE (target_type = $1 AND target_id = $2)
      AND accident_time >= NOW() - INTERVAL '${months} months'
    ORDER BY accident_time DESC
  `, [targetType, targetId]);
  data.accidentRecords = accidents.rows;

  // 4. 预警记录
  const warnings = await pool.query(`
    SELECT
      warning_code,
      warning_level,
      warning_type,
      status,
      created_at
    FROM hse_warning_record
    WHERE target_type = $1 AND target_id = $2
      AND created_at >= NOW() - INTERVAL '${months} months'
    ORDER BY created_at DESC
  `, [targetType, targetId]);
  data.warningRecords = warnings.rows;

  // 5. 整改记录
  const rectifications = await pool.query(`
    SELECT
      task_code,
      risk_reason,
      status,
      created_at,
      closed_at
    FROM hse_rectification_task
    WHERE target_type = $1 AND target_id = $2
      AND created_at >= NOW() - INTERVAL '${months} months'
    ORDER BY created_at DESC
  `, [targetType, targetId]);
  data.rectificationRecords = rectifications.rows;

  return data;
}
```

### 4.2 事故分析数据聚合

```javascript
async function aggregateAccidentAnalysisData(accidentId) {
  const accident = await pool.query(`
    SELECT * FROM hse_accident WHERE id = $1
  `, [accidentId]);

  if (accident.rows.length === 0) {
    throw new Error('事故不存在');
  }

  const acc = accident.rows[0];
  let employeeInfo = null;

  // 当事人信息
  if (acc.employee_id) {
    const employee = await pool.query(`
      SELECT
        e.id,
        e.name,
        e.department,
        e.position,
        ers.risk_score,
        ers.risk_level
      FROM employee e
      LEFT JOIN employee_risk_snapshot ers ON e.id = ers.employee_id
        AND ers.snapshot_date = (
          SELECT MAX(snapshot_date) FROM employee_risk_snapshot WHERE employee_id = e.id
        )
      WHERE e.id = $1
    `, [acc.employee_id]);
    employeeInfo = employee.rows[0];
  }

  // 同类事故
  const similarAccidents = await pool.query(`
    SELECT
      accident_code,
      accident_type,
      accident_level,
      accident_time,
      description
    FROM hse_accident
    WHERE accident_type = $1
      AND id != $2
      AND accident_time >= NOW() - INTERVAL '12 months'
    ORDER BY accident_time DESC
    LIMIT 10
  `, [acc.accident_type, accidentId]);

  return {
    accidentInfo: acc,
    employeeInfo,
    similarAccidents: similarAccidents.rows
  };
}
```

### 4.3 预测解释数据聚合

```javascript
async function aggregatePredictionExplainData(predictionId) {
  const prediction = await pool.query(`
    SELECT
      p.*,
      e.name as target_name
    FROM hse_risk_prediction p
    LEFT JOIN employee e ON p.target_type = 'employee' AND p.target_id = e.id
    WHERE p.id = $1 AND p.is_deleted = false
  `, [predictionId]);

  if (prediction.rows.length === 0) {
    throw new Error('预测记录不存在');
  }

  const pred = prediction.rows[0];

  // 历史趋势
  const history = await pool.query(`
    SELECT
      snapshot_date,
      risk_score,
      risk_level
    FROM employee_risk_snapshot
    WHERE employee_id = $1
      AND snapshot_date >= NOW() - INTERVAL '12 months'
    ORDER BY snapshot_date ASC
  `, [pred.target_id]);

  return {
    prediction: pred,
    historicalTrend: history.rows,
    contributingFactors: pred.contributing_factors || []
  };
}
```

---

## 五、结果解析设计

### 5.1 解析流程

```
AI 输出文本 → JSON 提取 → 格式校验 → 字段映射 → 结构化输出
```

### 5.2 JSON 提取函数

```javascript
function extractJSON(text) {
  // 尝试直接解析
  try {
    return JSON.parse(text);
  } catch (e) {
    // 继续尝试提取
  }

  // 提取花括号内容
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      // 继续尝试修复
    }
  }

  // 尝试修复常见问题
  let fixed = text
    .replace(/'/g, '"')           // 单引号转双引号
    .replace(/,\s*}/g, '}')       // 移除末尾多余逗号
    .replace(/,\s*]/g, ']');      // 移除数组末尾多余逗号

  try {
    return JSON.parse(fixed);
  } catch (e) {
    throw new Error('无法解析AI输出为JSON格式');
  }
}
```

### 5.3 输出校验函数

```javascript
function validateRiskAnalysisOutput(output) {
  const required = ['summary', 'riskOverview', 'keyFactors', 'suggestions', 'confidence'];

  for (const field of required) {
    if (!(field in output)) {
      throw new Error(`缺少必填字段: ${field}`);
    }
  }

  // 校验 riskOverview
  if (!['critical', 'major', 'minor', 'info'].includes(output.riskOverview.riskLevel)) {
    output.riskOverview.riskLevel = 'minor'; // 默认值
  }

  // 校验 confidence
  output.confidence = Math.max(0, Math.min(1, output.confidence || 0.5));

  return output;
}
```

---

## 六、模型版本管理

### 6.1 数据表结构

**hse_ai_model_version**（AI模型版本表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 主键 |
| model_code | VARCHAR(64) | 模型编码（HSE-AI-RISK/ACCIDENT/RECTIFY/REPORT/PREDICT-EXPLAIN） |
| model_type | VARCHAR(32) | 模型类型 |
| version | VARCHAR(32) | 版本号 |
| provider | VARCHAR(32) | AI 提供商 |
| model_name | VARCHAR(128) | 模型名称 |
| parameters | JSONB | 模型参数 |
| prompt_template | TEXT | Prompt 模板 |
| max_tokens | INTEGER | 最大输出长度 |
| temperature | NUMERIC(3,2) | 温度参数 |
| status | VARCHAR(20) | 状态 |
| is_frozen | BOOLEAN | 是否冻结 |
| performance_metrics | JSONB | 性能指标 |
| change_log | TEXT | 变更说明 |
| created_by | BIGINT | 创建人 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |
| is_deleted | BOOLEAN | 软删除 |

### 6.2 模型配置示例

```json
{
  "model_code": "HSE-AI-RISK",
  "model_type": "risk_analysis",
  "version": "v1.0",
  "provider": "openai",
  "model_name": "gpt-4-turbo",
  "parameters": {
    "max_tokens": 2000,
    "temperature": 0.3,
    "top_p": 0.9,
    "frequency_penalty": 0.1,
    "presence_penalty": 0.1
  },
  "prompt_template": "...",
  "status": "active",
  "is_frozen": true,
  "performance_metrics": {
    "avg_response_time_ms": 3500,
    "success_rate": 0.98,
    "avg_confidence": 0.85
  }
}
```

### 6.3 模型调用接口

```javascript
async function invokeModel(modelType, prompt, options = {}) {
  // 获取当前生效的模型配置
  const modelConfig = await getActiveAIModel(modelType);

  // 构造请求
  const request = {
    model: modelConfig.model_name,
    messages: [
      { role: 'system', content: modelConfig.system_prompt },
      { role: 'user', content: prompt }
    ],
    max_tokens: modelConfig.max_tokens,
    temperature: modelConfig.temperature
  };

  // 调用 AI 提供商
  const startTime = Date.now();
  let response;

  switch (modelConfig.provider) {
    case 'openai':
      response = await invokeOpenAI(request, modelConfig.api_key);
      break;
    case 'azure':
      response = await invokeAzureOpenAI(request, modelConfig);
      break;
    default:
      response = await invokeCustomModel(request, modelConfig);
  }

  const processingTime = Date.now() - startTime;

  // 记录调用日志
  await logModelInvocation({
    modelId: modelConfig.id,
    inputTokens: response.usage.prompt_tokens,
    outputTokens: response.usage.completion_tokens,
    processingTimeMs: processingTime,
    status: 'success'
  });

  return {
    content: response.choices[0].message.content,
    usage: response.usage,
    processingTimeMs: processingTime
  };
}
```

---

## 七、错误处理与重试

### 7.1 错误类型

| 错误类型 | 错误码 | 说明 | 处理方式 |
|----------|--------|------|----------|
| 输入无效 | -1 | 输入参数校验失败 | 直接返回错误 |
| 模型不可用 | -2 | 当前无可用模型 | 直接返回错误 |
| AI 请求超时 | -3 | AI 请求超时 | 重试（最多3次） |
| AI 返回错误 | -4 | AI 返回非成功状态 | 重试（最多3次） |
| 输出解析失败 | -5 | AI 输出无法解析 | 重试（最多3次） |
| Token 超限 | -6 | 输入 Token 超限 | 截断后重试 |

### 7.2 重试策略

```javascript
async function invokeWithRetry(modelType, prompt, options = {}) {
  const maxRetries = options.maxRetries || 3;
  const retryDelay = options.retryDelay || 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await invokeModel(modelType, prompt, options);
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      // 可重试错误
      if (['-3', '-4', '-5'].includes(error.code)) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        continue;
      }

      // 不可重试错误
      throw error;
    }
  }
}
```

---

## 八、性能监控

### 8.1 监控指标

| 指标 | 说明 | 采集频率 |
|------|------|----------|
| 调用量 | 各模型调用次数 | 实时 |
| 成功率 | 调用成功比例 | 实时 |
| 响应时间 | 平均响应时间 | 实时 |
| Token 消耗 | 输入/输出 Token 数 | 实时 |
| 置信度分布 | 输出置信度分布 | 每小时 |

### 8.2 监控数据表

**hse_ai_model_invocation_log**（模型调用日志表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 主键 |
| model_id | BIGINT | 模型版本ID |
| analysis_id | BIGINT | 关联分析记录ID |
| input_tokens | INTEGER | 输入Token数 |
| output_tokens | INTEGER | 输出Token数 |
| total_tokens | INTEGER | 总Token数 |
| processing_time_ms | INTEGER | 处理耗时（毫秒） |
| status | VARCHAR(20) | 状态（success/failed） |
| error_message | TEXT | 错误信息 |
| created_at | TIMESTAMP | 创建时间 |

---

## 九、安全措施

### 9.1 输入安全

| 措施 | 说明 |
|------|------|
| 敏感数据脱敏 | 员工姓名、身份证号等脱敏处理 |
| Prompt 注入防护 | 过滤可能导致 Prompt 注入的特殊字符 |
| 输入长度限制 | 限制输入数据量，避免超 Token |

### 9.2 输出安全

| 措施 | 说明 |
|------|------|
| 内容审核 | 审核 AI 输出是否符合规范 |
| 敏感词过滤 | 过滤输出中的敏感词汇 |
| 格式校验 | 强制要求输出符合指定格式 |

---

## 十、版本历史

| 版本 | 日期 | 修订人 | 修订说明 |
|------|------|--------|----------|
| v1.0 | 2026-07 | HSE 团队 | HSE AI分析模型设计初始版本 |