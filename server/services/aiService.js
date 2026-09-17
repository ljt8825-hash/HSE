/**
 * AI 统一服务层
 * 封装 Grok API（xAI）和 Ollama（本地 LLM）双模式调用
 * 支持流式输出（SSE）和非流式输出，具备自动重试和超时控制
 *
 * 配置项（从 .env 读取）：
 *   AI_PROVIDER=grok|ollama          当前使用的 AI 提供商
 *   GROK_API_KEY=xai-xxx             xAI API 密钥
 *   GROK_MODEL=grok-2                Grok 模型名称
 *   GROK_BASE_URL=https://api.x.ai/v1  Grok API 基础地址
 *   OLLAMA_BASE_URL=http://localhost:11434  Ollama 服务地址
 *   OLLAMA_MODEL=qwen2.5:7b         Ollama 模型名称
 *   AI_TIMEOUT_MS=60000              请求超时时间（毫秒）
 *   AI_MAX_RETRIES=2                 最大重试次数
 */

const http = require('http');
const https = require('https');

// ============ 配置读取 ============
const config = {
  provider: process.env.AI_PROVIDER || 'grok',
  grok: {
    apiKey: process.env.GROK_API_KEY || '',
    model: process.env.GROK_MODEL || 'grok-2',
    baseUrl: process.env.GROK_BASE_URL || 'https://api.x.ai/v1'
  },
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'qwen2.5:7b'
  },
  timeoutMs: parseInt(process.env.AI_TIMEOUT_MS) || 60000,
  maxRetries: parseInt(process.env.AI_MAX_RETRIES) || 2
};

// ============ Prompt 模板 ============
const PROMPT_TEMPLATES = {
  /** 隐患报告模板 */
  report_hazard: `你是宁津环卫 HSE 安全管理系统的 AI 助手。请根据以下隐患数据生成一份专业的安全隐患分析报告。

报告要求：
1. 概述隐患的基本情况（发现时间、地点、类型）
2. 分析隐患的严重程度和可能造成的后果
3. 提出整改建议和预防措施
4. 引用相关的安全管理规范

隐患数据：
{data}

{custom_instructions}

请使用 Markdown 格式输出报告，包含标题、分级标题和必要的表格。`,

  /** 事故报告模板 */
  report_accident: `你是宁津环卫 HSE 安全管理系统的 AI 助手。请根据以下事故数据生成一份详细的安全事故分析报告。

报告要求：
1. 事故基本情况（时间、地点、涉及人员、事故类型）
2. 事故经过描述
3. 原因分析（直接原因、间接原因、根本原因）
4. 事故损失评估
5. 整改措施和预防建议
6. 相关法规引用

事故数据：
{data}

{custom_instructions}

请使用 Markdown 格式输出报告，结构清晰，内容详实。`,

  /** 培训报告模板 */
  report_training: `你是宁津环卫 HSE 安全管理系统的 AI 助手。请根据以下培训数据生成一份培训效果分析报告。

报告要求：
1. 培训基本信息（主题、时间、参与人员、培训师）
2. 培训内容概述
3. 参与情况分析（出勤率、覆盖范围）
4. 培训效果评估
5. 改进建议

培训数据：
{data}

{custom_instructions}

请使用 Markdown 格式输出报告。`,

  /** 巡检报告模板 */
  report_patrol: `你是宁津环卫 HSE 安全管理系统的 AI 助手。请根据以下巡检数据生成一份巡检工作报告。

报告要求：
1. 巡检概况（时间、区域、巡检人）
2. 发现问题汇总
3. 问题分类统计
4. 整改落实情况
5. 建议与改进措施

巡检数据：
{data}

{custom_instructions}

请使用 Markdown 格式输出报告。`,

  /** 5W1H 根因分析模板 */
  rca_analysis: `你是宁津环卫 HSE 安全管理系统的 AI 助手。请对以下安全事件进行 5W1H 根因分析（Root Cause Analysis）。

分析框架：
1. What（什么发生了）：事件的基本情况和具体表现
2. When（何时发生）：事件发生的时间点和时间线
3. Where（何地发生）：事件发生的具体位置和环境
4. Who（涉及谁）：事件涉及的人员和责任方
5. Why（为何发生）：深入分析直接原因、间接原因和根本原因（至少分析三层）
6. How（如何发生）：事件发生的过程和因果链条

事件数据：
{data}

{custom_instructions}

请使用 Markdown 格式输出分析报告，并提供：
- 因果关系图（文字描述）
- 根本原因结论
- 纠正和预防措施（CAPA）建议
- 风险等级评估`,

  /** 文档分析模板 */
  document_analysis: `你是环卫企业安全生产管理系统的专业 AI 助手，负责安全资料的辅助分析。

请根据以下文档内容进行专业分析，输出 JSON 格式结果。

文档信息：
- 文件名：{filename}
- 文件类型：{fileType}
- 文件分类：{category}
- 用户摘要：{summary}
- 分析依据：{analysisBasis}

文档内容：
{documentText}

分析要求：
1. 文档摘要：用 200-500 字概括文档核心内容
2. 完整性评分：0-100分，评估该安全资料的完整程度
3. 风险等级：low / medium / high / critical
4. 标准建议：对照安全生产相关法规标准，给出合规建议（最多10条）
5. 缺项清单：列出文档中缺失的关键安全要素（最多10条）
6. 关键词标签：提取 5-10 个关键词标签

请严格以 JSON 格式输出，不要包含 Markdown 代码块标记，格式如下：
{
  "summary": "文档摘要内容...",
  "score": 85,
  "riskLevel": "medium",
  "suggestions": [
    {"standard": "标准名称", "suggestion": "建议内容", "level": "high"}
  ],
  "missingItems": [
    {"item": "缺失项", "reason": "缺失原因", "priority": "high"}
  ],
  "keywords": ["关键词1", "关键词2"]
}`,

  /** 标准化条款评价模板 */
  standard_evaluation: `【身份与定位】
你是环卫企业安全生产管理系统的专业 AI 助手，负责辅助安全生产标准化评价。你仅提供参考性的评价建议，不作为最终结论。最终评价结果必须由人工审核确认。

【强约束规则】
1. 严格基于提供的证据资料进行评价，不得编造或推断任何未提供的信息。
2. 如果证据不足或没有相关资料，必须将 verdict 设为 "unknown"，不得擅自判定为 compliant。
3. 禁止给出企业整体达标/不达标结论，仅针对单条条款给出辅助评价。
4. 禁止进行评分或等级评定，仅给出 verdict 和文字建议。
5. 所有结论必须有明确的证据支撑，evidence 字段不能为空（除非 verdict=unknown 或 verdict=missing）。

【评价对象信息】
- 条款编码：{clauseCode}
- 条款名称：{clauseTitle}
- 条款内容：{clauseContent}
- 检查方法：{checkMethod}
- 条款关键词：{keywords}

【关联资料列表】（已人工确认的有效关联，status=valid）
{relatedDocuments}

【评价要求】
请针对上述条款，基于关联资料进行辅助评价，输出 JSON 格式结果。

verdict 可选值说明：
- compliant：资料完整且满足条款要求，有明确证据支撑
- partial：部分满足，存在不足或不完整的情况，有部分证据
- non_compliant：存在明显不符合条款要求的情况，有证据支撑
- missing：明确缺少条款要求的关键资料
- unknown：资料不足，无法判断，或没有关联资料

输出字段说明：
- verdict：评价结论（compliant/partial/non_compliant/missing/unknown）
- findings：发现的问题点数组，每项为字符串
- missingItems：缺少的关键资料或要素数组，每项为字符串
- evidence：证据说明，引用具体的资料名称和内容摘要，说明判断依据
- suggestion：整改建议或改进建议（中文，100-300字）

请严格以 JSON 格式输出，不要包含 Markdown 代码块标记，格式如下：
{
  "verdict": "partial",
  "findings": ["问题点1描述", "问题点2描述"],
  "missingItems": ["缺少的资料1", "缺少的资料2"],
  "evidence": "证据说明，引用的具体资料...",
  "suggestion": "整改建议内容..."
}`,

  /** 安全生产月报模板 */
  report_monthly: `【强约束规则】
1. 你是环卫企业安全生产管理系统的AI助手，仅基于提供的数据进行分析。
2. 禁止编造任何数据。如果某项数据缺失或为零，必须明确说明"暂无数据"或"本月无相关记录"。
3. 所有数字必须与提供的原始数据完全一致，不得估算、推断或夸大。
4. 分析结论必须有数据支撑，无数据支撑的内容不得输出。
5. 建议内容必须基于实际问题，无问题时输出"本月未发现突出问题，建议持续保持"。
6. 语言风格：正式、客观、简洁，符合政府/企业公文规范。
7. 输出格式：严格按照指定 JSON 结构返回，不得增减字段。

【报告类型】安全生产月报

【统计周期】{period}

【业务统计数据】
{statisticsData}

【相关制度文件】（供参考引用）
{referencedDocuments}

请根据以上数据，生成安全生产月报的AI分析内容，严格以JSON格式输出，不要包含Markdown代码块标记：
{
  "summary": "本月安全工作总体概述，200-300字，基于数据客观描述",
  "keyIndicatorsText": "关键指标完成情况文字描述，包含具体数字",
  "problems": [
    "问题1描述（基于数据）",
    "问题2描述（基于数据）"
  ],
  "suggestions": [
    "改进建议1（针对具体问题）",
    "改进建议2（针对具体问题）"
  ],
  "nextPlan": "下月工作计划要点，100-200字"
}

注意：如果某项没有数据，对应字段输出"暂无数据"，数组输出空数组[]。`,

  /** 集团/区域汇报材料模板 */
  report_group: `【强约束规则】
1. 你是环卫企业安全生产管理系统的AI助手，仅基于提供的数据进行分析。
2. 禁止编造任何数据。如果某项数据缺失或为零，必须明确说明"暂无数据"或"本周期无相关记录"。
3. 所有数字必须与提供的原始数据完全一致，不得估算、推断或夸大。
4. 分析结论必须有数据支撑，无数据支撑的内容不得输出。
5. 建议内容必须基于实际问题，无问题时输出"整体安全形势稳定，建议持续保持"。
6. 语言风格：正式、精炼、高层视角，符合向集团/上级汇报的公文规范。
7. 输出格式：严格按照指定 JSON 结构返回，不得增减字段。

【报告类型】集团/区域安全工作汇报

【汇报周期】{period}

【汇报范围】{scope}

【业务统计数据】
{statisticsData}

【相关制度文件】（供参考引用）
{referencedDocuments}

请根据以上数据，从高层视角生成汇报材料的AI分析内容，严格以JSON格式输出，不要包含Markdown代码块标记：
{
  "executiveSummary": "工作总体情况摘要，300-500字，高层视角，突出关键指标和整体评价",
  "highlights": [
    "亮点工作1（基于数据提炼）",
    "亮点工作2（基于数据提炼）"
  ],
  "problems": [
    "核心问题1（基于数据）",
    "核心问题2（基于数据）"
  ],
  "actionPlan": [
    "下一步行动计划1",
    "下一步行动计划2",
    "下一步行动计划3"
  ]
}

注意：如果某项没有数据，对应字段输出"暂无数据"，数组输出空数组[]。亮点如不突出可输出空数组。`,

};

// ============ 服务状态 ============
let _initialized = false;
let _available = false;

// ============ 内部工具函数 ============

/**
 * 发送 HTTP/HTTPS 请求
 * @param {string} url - 请求 URL
 * @param {Object} body - 请求体对象
 * @param {Object} headers - 请求头
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<Object>} 解析后的 JSON 响应
 */
function sendRequest(url, body, headers, timeout) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const lib = isHttps ? https : http;

    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: headers,
      timeout: timeout
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          // 处理流式响应，非流式时 data 是完整的 JSON
          const lines = data.split('\n').filter(line => line.startsWith('data:'));
          if (lines.length > 1) {
            // 流式模式下组合所有 content
            let content = '';
            for (const line of lines) {
              const jsonStr = line.replace(/^data:\s*/, '');
              if (jsonStr.trim() === '[DONE]') continue;
              try {
                const parsed = JSON.parse(jsonStr);
                // Grok 格式
                if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta) {
                  content += parsed.choices[0].delta.content || '';
                }
                // Ollama 格式
                if (parsed.message && parsed.message.content) {
                  content += parsed.message.content || '';
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
            resolve({ content: content || data });
          } else {
            const parsed = JSON.parse(data);
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`响应解析失败: ${e.message}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`请求超时（${timeout}ms）`));
    });

    req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * 发送流式请求（SSE）
 * @param {string} url - 请求 URL
 * @param {Object} body - 请求体对象
 * @param {Object} headers - 请求头
 * @param {number} timeout - 超时时间（毫秒）
 * @param {Function} onChunk - 每收到一段内容时的回调 (text: string) => void
 * @param {Function} onDone - 完成回调 () => void
 * @param {Function} onError - 错误回调 (err: Error) => void
 * @returns {http.ClientRequest} 请求对象（可用于中断）
 */
function sendStreamRequest(url, body, headers, timeout, onChunk, onDone, onError) {
  const isHttps = url.startsWith('https');
  const lib = isHttps ? https : http;

  const urlObj = new URL(url);
  const options = {
    hostname: urlObj.hostname,
    port: urlObj.port || (isHttps ? 443 : 80),
    path: urlObj.pathname + urlObj.search,
    method: 'POST',
    headers: headers,
    timeout: timeout
  };

  const req = lib.request(options, (res) => {
    let buffer = '';

    res.on('data', (chunk) => {
      buffer += chunk.toString();
      // 按行分割处理 SSE 数据
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 保留最后一行（可能不完整）

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue; // 跳过空行和注释

        if (trimmed.startsWith('data:')) {
          const jsonStr = trimmed.replace(/^data:\s*/, '');
          if (jsonStr.trim() === '[DONE]') {
            onDone();
            return;
          }

          try {
            const parsed = JSON.parse(jsonStr);

            // Grok SSE 格式: {"choices":[{"delta":{"content":"xxx"}}]}
            if (parsed.choices && parsed.choices[0]) {
              const delta = parsed.choices[0].delta;
              if (delta && delta.content) {
                onChunk(delta.content);
              }
            }

            // Ollama SSE 格式: {"message":{"content":"xxx"},"done":false}
            if (parsed.message && parsed.message.content) {
              onChunk(parsed.message.content);
            }
            // Ollama 完成标记: {"done":true}
            if (parsed.done === true) {
              onDone();
              return;
            }
          } catch (e) {
            // 非 JSON 数据，作为普通文本处理
            onChunk(jsonStr);
          }
        } else if (trimmed.startsWith('{')) {
          // Ollama /api/chat 流：纯 NDJSON 行（无 data: 前缀）
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed.message && parsed.message.content) {
              onChunk(parsed.message.content);
            }
            if (parsed.done === true) {
              onDone();
              return;
            }
          } catch (e) {
            /* 忽略非 JSON 行 */
          }
        }
      }
    });

    res.on('end', () => {
      // 处理 buffer 中剩余的数据
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data:')) {
          const jsonStr = trimmed.replace(/^data:\s*/, '');
          if (jsonStr.trim() !== '[DONE]') {
            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                onChunk(parsed.choices[0].delta.content);
              }
              if (parsed.message && parsed.message.content) {
                onChunk(parsed.message.content);
              }
            } catch (e) { /* 忽略 */ }
          }
        } else if (trimmed.startsWith('{')) {
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed.message && parsed.message.content) {
              onChunk(parsed.message.content);
            }
          } catch (e) { /* 忽略 */ }
        }
      }
      onDone();
    });

    res.on('error', (err) => {
      onError(err);
    });
  });

  req.on('error', (err) => onError(err));
  req.on('timeout', () => {
    req.destroy();
    onError(new Error(`流式请求超时（${timeout}ms）`));
  });

  req.write(JSON.stringify(body));
  req.end();

  return req;
}

/**
 * 构建 Grok API 请求参数
 * @param {string} prompt - 用户 prompt
 * @param {Object} options - 可选参数
 * @returns {Object} { url, headers, body }
 */
function buildGrokRequest(prompt, options = {}) {
  const systemPrompt = options.systemPrompt || '你是宁津环卫 HSE 安全管理系统的专业 AI 助手，擅长安全分析和报告生成。请用中文回答。';
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt }
  ];

  // 如果有历史对话，插入到 system 和 user 之间
  if (options.history && options.history.length > 0) {
    messages.splice(1, 0, ...options.history);
  }

  return {
    url: `${config.grok.baseUrl}/chat/completions`,
    headers: {
      'Authorization': `Bearer ${config.grok.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: {
      model: options.model || config.grok.model,
      messages: messages,
      stream: options.stream || false,
      temperature: options.temperature !== undefined ? options.temperature : 0.7,
      max_tokens: options.maxTokens || 4096
    }
  };
}

/**
 * 构建 Ollama API 请求参数
 * @param {string} prompt - 用户 prompt
 * @param {Object} options - 可选参数
 * @returns {Object} { url, headers, body }
 */
function buildOllamaRequest(prompt, options = {}) {
  const systemPrompt = options.systemPrompt || '你是宁津环卫 HSE 安全管理系统的专业 AI 助手，擅长安全分析和报告生成。请用中文回答。';
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt }
  ];

  // 如果有历史对话
  if (options.history && options.history.length > 0) {
    messages.splice(1, 0, ...options.history);
  }

  return {
    url: `${config.ollama.baseUrl}/api/chat`,
    headers: {
      'Content-Type': 'application/json'
    },
    body: {
      model: options.model || config.ollama.model,
      messages: messages,
      stream: options.stream || false,
      options: {
        temperature: options.temperature !== undefined ? options.temperature : 0.7,
        num_predict: options.maxTokens || 4096
      }
    }
  };
}

// ============ 导出的公共方法 ============

/**
 * 初始化 AI 服务，验证配置是否完整
 * @returns {Promise<{success: boolean, provider: string, message: string}>}
 */
async function initialize() {
  console.log(`[AI Service] 初始化... 当前 Provider: ${config.provider}`);

  if (config.provider === 'grok') {
    if (!config.grok.apiKey) {
      const msg = 'Grok API Key 未配置（GROK_API_KEY），请在 .env 中设置';
      console.warn(`[AI Service] ${msg}`);
      _initialized = true;
      _available = false;
      return { success: false, provider: 'grok', message: msg };
    }
    console.log(`[AI Service] Grok 配置: model=${config.grok.model}, baseUrl=${config.grok.baseUrl}`);
  } else if (config.provider === 'ollama') {
    console.log(`[AI Service] Ollama 配置: model=${config.ollama.model}, baseUrl=${config.ollama.baseUrl}`);
  } else {
    const msg = `不支持的 AI Provider: ${config.provider}，仅支持 grok 或 ollama`;
    console.warn(`[AI Service] ${msg}`);
    _initialized = true;
    _available = false;
    return { success: false, provider: config.provider, message: msg };
  }

  _initialized = true;
  _available = true;
  console.log(`[AI Service] 初始化完成，Provider: ${config.provider}`);
  return { success: true, provider: config.provider, message: 'AI 服务初始化成功' };
}

/**
 * 获取当前 Provider 名称
 * @returns {string} 'grok' 或 'ollama'
 */
function getProvider() {
  return config.provider;
}

/**
 * 检查 AI 服务是否可用
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
  if (!_available) return false;

  if (config.provider === 'ollama') {
    // Ollama: 尝试访问 /api/tags 检查服务是否运行
    try {
      const isHttps = config.ollama.baseUrl.startsWith('https');
      const lib = isHttps ? https : http;
      const urlObj = new URL(config.ollama.baseUrl);

      return new Promise((resolve) => {
        const req = lib.request({
          hostname: urlObj.hostname,
          port: urlObj.port || (isHttps ? 443 : 80),
          path: '/api/tags',
          method: 'GET',
          timeout: 5000
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => { resolve(res.statusCode === 200); });
        });
        req.on('error', () => { resolve(false); });
        req.on('timeout', () => { req.destroy(); resolve(false); });
        req.end();
      });
    } catch (e) {
      return false;
    }
  }

  // Grok: 只要有 API Key 就认为可用
  return !!config.grok.apiKey;
}

/**
 * 非流式对话（带自动重试）
 * @param {string} prompt - 用户 prompt
 * @param {Object} options - 可选参数
 * @returns {Promise<{content: string, model: string, inputTokens: number, outputTokens: number, durationMs: number}>}
 */
async function chat(prompt, options = {}) {
  const startTime = Date.now();
  // AI-09：允许调用方显式指定 provider（OllamaProvider/GrokProvider 经 Gateway 路由时传自身 name），
  // 缺省回退全局 config.provider（既有调用方行为不变）
  const provider = options.provider || config.provider;
  const buildFn = provider === 'grok' ? buildGrokRequest : buildOllamaRequest;
  const requestParams = buildFn(prompt, options);

  let lastError = null;

  // 重试逻辑
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    if (attempt > 0) {
      console.log(`[AI Service] 第 ${attempt + 1} 次重试...`);
      // 重试前等待（指数退避）
      await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt), 10000)));
    }

    try {
      const response = await sendRequest(
        requestParams.url,
        requestParams.body,
        requestParams.headers,
        config.timeoutMs
      );

      const durationMs = Date.now() - startTime;

      // 提取内容
      let content = '';
      let inputTokens = 0;
      let outputTokens = 0;

      if (provider === 'grok') {
        // Grok 响应格式: { choices: [{ message: { content } }], usage: { prompt_tokens, completion_tokens } }
        if (response.choices && response.choices[0]) {
          content = response.choices[0].message?.content || '';
        } else if (typeof response.content === 'string') {
          content = response.content;
        }
        if (response.usage) {
          inputTokens = response.usage.prompt_tokens || 0;
          outputTokens = response.usage.completion_tokens || 0;
        }
      } else {
        // Ollama 响应格式: { message: { content }, prompt_eval_count, eval_count }
        if (response.message) {
          content = response.message.content || '';
        } else if (typeof response.content === 'string') {
          content = response.content;
        }
        inputTokens = response.prompt_eval_count || 0;
        outputTokens = response.eval_count || 0;
      }

      if (!content) {
        throw new Error('AI 返回内容为空');
      }

      return {
        content,
        model: requestParams.body.model,
        inputTokens,
        outputTokens,
        durationMs
      };
    } catch (err) {
      lastError = err;
      console.error(`[AI Service] 第 ${attempt + 1} 次请求失败: ${err.message}`);
    }
  }

  throw lastError || new Error('AI 请求失败，已达最大重试次数');
}

/**
 * 流式对话（SSE）— 直接写入 Express 响应对象
 * @param {string} prompt - 用户 prompt
 * @param {Object} res - Express 响应对象
 * @param {Object} options - 可选参数
 *   - skipHeaders（AI-03 v2）：由调用方（AI Gateway /v2/stream）先行设置 SSE 头，此处跳过重复 setHeader/flushHeaders
 *   - skipEnd（AI-03 v2）：由调用方在写完整 event:end 后自行 res.end()，此处不结束响应
 * @returns {Promise<{totalContent: string, model: string, durationMs: number}>}
 */
async function chatStream(prompt, res, options = {}) {
  const startTime = Date.now();

  // AI-03：v2 统一 SSE 信封由 Gateway 先行写头与 event:start，故此处支持跳过（默认行为不变）
  if (!options.skipHeaders) {
    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 禁用 Nginx 缓冲
    res.flushHeaders();
  }

  const provider = options.provider || config.provider;
  const buildFn = provider === 'grok' ? buildGrokRequest : buildOllamaRequest;
  const streamOptions = { ...options, stream: true };
  const requestParams = buildFn(prompt, streamOptions);

  let totalContent = '';
  let settled = false; // 流已正常完成/出错后，不再由 close 抢先结束响应（保证 Gateway 能写入 event:end/error）

  return new Promise((resolve, reject) => {
    const req = sendStreamRequest(
      requestParams.url,
      requestParams.body,
      requestParams.headers,
      config.timeoutMs,
      // onChunk: 每收到一段内容
      (chunk) => {
        totalContent += chunk;
        // 以 SSE 格式发送给客户端
        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
      },
      // onDone: 完成
      () => {
        settled = true;
        const durationMs = Date.now() - startTime;
        // 发送结束标记
        res.write(`data: [DONE]\n\n`);
        if (!options.skipEnd) {
          res.end();
        }
        resolve({
          totalContent,
          model: requestParams.body.model,
          durationMs
        });
      },
      // onError: 错误
      (err) => {
        settled = true;
        const durationMs = Date.now() - startTime;
        // 发送错误信息
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        if (!options.skipEnd) {
          res.end();
        }
        reject(err);
      }
    );

    // 上游连接关闭（未正常完成时）结束响应；正常完成后由 Gateway 写 event:end 再收尾
    req.on('close', () => {
      if (!settled && !res.writableEnded) {
        res.end();
      }
    });
  });
}

/**
 * 构建报告生成 Prompt
 * @param {string} templateName - 模板名称（report_hazard, report_accident, report_training, report_patrol）
 * @param {Object|string} data - 报告数据（对象会转为 JSON 字符串）
 * @param {string} customPrompt - 用户自定义补充说明
 * @returns {string} 完整的 prompt
 */
function buildReportPrompt(templateName, data, customPrompt) {
  const template = PROMPT_TEMPLATES[templateName];
  if (!template) {
    throw new Error(`未知的报告模板: ${templateName}，可用模板: ${Object.keys(PROMPT_TEMPLATES).join(', ')}`);
  }

  const dataStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const customInstructions = customPrompt
    ? `用户自定义要求：\n${customPrompt}`
    : '无额外要求，按标准格式输出。';

  return template
    .replace('{data}', dataStr)
    .replace('{custom_instructions}', customInstructions);
}

/**
 * 构建 RCA（根因分析）Prompt
 * @param {Object|string} incidentData - 事故/隐患数据
 * @param {string} customPrompt - 用户自定义补充说明
 * @returns {string} 完整的 RCA prompt
 */
function buildRCAPrompt(incidentData, customPrompt) {
  return buildReportPrompt('rca_analysis', incidentData, customPrompt);
}

/**
 * 构建文档分析 Prompt
 * @param {Object} docInfo - 文档信息对象
 * @param {string} docInfo.filename - 文件名
 * @param {string} docInfo.fileType - 文件类型
 * @param {string} docInfo.category - 文件分类
 * @param {string} docInfo.summary - 用户摘要
 * @param {string} docInfo.analysisBasis - 分析依据
 * @param {string} docInfo.documentText - 文档内容
 * @param {string} customPrompt - 用户自定义补充说明
 * @returns {string} 完整的文档分析 prompt
 */
function buildDocumentAnalysisPrompt(docInfo, customPrompt) {
  const template = PROMPT_TEMPLATES.document_analysis;
  if (!template) {
    throw new Error('document_analysis 模板不存在');
  }

  const basisMap = {
    full_text: '全文解析（已提取完整文本内容）',
    metadata_only: '仅元数据（文件名、分类、摘要等）',
    filename_only: '仅文件名',
  };

  let prompt = template
    .replace(/\{filename\}/g, docInfo.filename || '未知')
    .replace(/\{fileType\}/g, docInfo.fileType || '未知')
    .replace(/\{category\}/g, docInfo.category || '未分类')
    .replace(/\{summary\}/g, docInfo.summary || '无')
    .replace(/\{analysisBasis\}/g, basisMap[docInfo.analysisBasis] || '未知')
    .replace(/\{documentText\}/g, docInfo.documentText || '无');

  if (customPrompt && customPrompt.trim()) {
    prompt += `\n\n附加分析要求：\n${customPrompt.trim()}`;
  }

  return prompt;
}

/**
 * 构建安全生产月报 Prompt
 * @param {Object} params - 参数对象
 * @param {string} params.period - 统计周期
 * @param {Object} params.statisticsData - 业务统计数据
 * @param {Array} params.referencedDocuments - 引用的制度文件
 * @param {string} customPrompt - 用户自定义补充
 * @returns {string} 完整的 prompt
 */
function buildMonthlyReportPrompt(params, customPrompt) {
  const template = PROMPT_TEMPLATES.report_monthly;
  if (!template) {
    throw new Error('report_monthly 模板不存在');
  }

  const statsStr = typeof params.statisticsData === 'string'
    ? params.statisticsData
    : JSON.stringify(params.statisticsData, null, 2);

  let docsStr = '（无相关制度文件）';
  if (params.referencedDocuments && params.referencedDocuments.length > 0) {
    docsStr = params.referencedDocuments.map((doc, idx) => {
      const excerpt = doc.aiSummaryExcerpt || doc.ai_summary_excerpt || '暂无摘要';
      return `${idx + 1}. 《${doc.fileName || doc.file_name}》（文档ID: ${doc.fileId || doc.file_id}）\n   AI分析摘要：${excerpt}`;
    }).join('\n');
  }

  let prompt = template
    .replace(/\{period\}/g, params.period || '未知')
    .replace(/\{statisticsData\}/g, statsStr)
    .replace(/\{referencedDocuments\}/g, docsStr);

  if (customPrompt && customPrompt.trim()) {
    prompt += `\n\n【用户附加要求】\n${customPrompt.trim()}`;
  }

  return prompt;
}

/**
 * 构建集团/区域汇报材料 Prompt
 * @param {Object} params - 参数对象
 * @param {string} params.period - 汇报周期
 * @param {string} params.scope - 汇报范围
 * @param {Object} params.statisticsData - 业务统计数据
 * @param {Array} params.referencedDocuments - 引用的制度文件
 * @param {string} customPrompt - 用户自定义补充
 * @returns {string} 完整的 prompt
 */
function buildGroupReportPrompt(params, customPrompt) {
  const template = PROMPT_TEMPLATES.report_group;
  if (!template) {
    throw new Error('report_group 模板不存在');
  }

  const statsStr = typeof params.statisticsData === 'string'
    ? params.statisticsData
    : JSON.stringify(params.statisticsData, null, 2);

  let docsStr = '（无相关制度文件）';
  if (params.referencedDocuments && params.referencedDocuments.length > 0) {
    docsStr = params.referencedDocuments.map((doc, idx) => {
      const excerpt = doc.aiSummaryExcerpt || doc.ai_summary_excerpt || '暂无摘要';
      return `${idx + 1}. 《${doc.fileName || doc.file_name}》（文档ID: ${doc.fileId || doc.file_id}）\n   AI分析摘要：${excerpt}`;
    }).join('\n');
  }

  let prompt = template
    .replace(/\{period\}/g, params.period || '未知')
    .replace(/\{scope\}/g, params.scope || '全部')
    .replace(/\{statisticsData\}/g, statsStr)
    .replace(/\{referencedDocuments\}/g, docsStr);

  if (customPrompt && customPrompt.trim()) {
    prompt += `\n\n【用户附加要求】\n${customPrompt.trim()}`;
  }

  return prompt;
}

/**
 * 构建标准化条款评价 Prompt
 * @param {Object} clause - 条款信息
 * @param {string} clause.code - 条款编码
 * @param {string} clause.title - 条款名称
 * @param {string} clause.content - 条款内容
 * @param {string} clause.checkMethod - 检查方法
 * @param {Array} clause.keywords - 关键词数组
 * @param {Array} relatedDocuments - 关联的有效资料列表（status=valid）
 * @param {string} customPrompt - 用户自定义补充
 * @returns {string} 完整的 prompt
 */
function buildStandardEvaluationPrompt(clause, relatedDocuments, customPrompt) {
  const template = PROMPT_TEMPLATES.standard_evaluation;
  if (!template) {
    throw new Error('standard_evaluation 模板不存在');
  }

  let docsStr = '（无关联资料）';
  if (relatedDocuments && relatedDocuments.length > 0) {
    docsStr = relatedDocuments.map((doc, idx) => {
      const aiSummary = doc.aiSummary || doc.ai_summary || doc.summary || '暂无摘要';
      const aiKeywords = doc.aiKeywords || doc.ai_keywords || [];
      const kwStr = Array.isArray(aiKeywords) && aiKeywords.length > 0
        ? `\n   AI关键词：${aiKeywords.join('、')}`
        : '';
      return `${idx + 1}. 《${doc.fileName || doc.file_name || doc.originalName || '未命名'}》（文件ID: ${doc.fileId || doc.file_id || doc.id}）\n   摘要：${aiSummary}${kwStr}`;
    }).join('\n\n');
  }

  const keywordsStr = Array.isArray(clause.keywords) && clause.keywords.length > 0
    ? clause.keywords.join('、')
    : '无';

  let prompt = template
    .replace(/\{clauseCode\}/g, clause.code || '未知')
    .replace(/\{clauseTitle\}/g, clause.title || clause.clauseTitle || '未知')
    .replace(/\{clauseContent\}/g, clause.content || clause.clauseContent || '无')
    .replace(/\{checkMethod\}/g, clause.checkMethod || clause.check_method || '无')
    .replace(/\{keywords\}/g, keywordsStr)
    .replace(/\{relatedDocuments\}/g, docsStr);

  if (customPrompt && customPrompt.trim()) {
    prompt += `\n\n【用户附加评价要求】\n${customPrompt.trim()}`;
  }

  return prompt;
}

// ============ 模块导出 ============
module.exports = {
  initialize,
  chat,
  chatStream,
  getProvider,
  isAvailable,
  buildReportPrompt,
  buildRCAPrompt,
  buildDocumentAnalysisPrompt,
  buildMonthlyReportPrompt,
  buildGroupReportPrompt,
  buildStandardEvaluationPrompt,
  // 导出模板名称常量（方便外部引用）
  TEMPLATES: {
    REPORT_HAZARD: 'report_hazard',
    REPORT_ACCIDENT: 'report_accident',
    REPORT_TRAINING: 'report_training',
    REPORT_PATROL: 'report_patrol',
    RCA_ANALYSIS: 'rca_analysis',
    DOCUMENT_ANALYSIS: 'document_analysis',
    REPORT_MONTHLY: 'report_monthly',
    REPORT_GROUP: 'report_group',
    STANDARD_EVALUATION: 'standard_evaluation',
  },
};
