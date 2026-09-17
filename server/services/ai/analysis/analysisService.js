/**
 * AI-06 Analysis Service —— 结构化数据分析编排
 *
 * 链路（AI-06 任务书 §31 PASS 要求）：
 *   数据源（records 注入 / db 只读）
 *     ↓ analysisDataAdapter
 *   原始记录
 *     ↓ analysisNormalizer
 *   标准记录
 *     ↓ analysisStatistics（确定性统计，不经过 AI）
 *   统计 JSON
 *     ↓ analysisPromptBuilder + AI Gateway → Ollama/qwen2.5:7b
 *   AI 结构化解释（JSON parse fail-closed）
 *     ↓ Evidence（business_record + knowledge_base）
 *   返回 { statistics, ai, evidence, recordId }
 *
 * 可靠性：AI 不可用时 statistics 照常返回（ai.available=false），不 500。
 * 禁止：AI 计算数字、伪造 JSON Schema 支持、写人工最终字段。
 */

const { fetchRawRecords, AiError } = require('./analysisDataAdapter');
const { normalizeRecords } = require('./analysisNormalizer');
const { computeStatistics } = require('./analysisStatistics');
const { buildPrompt } = require('./analysisPromptBuilder');
const gateway = require('../aiGateway');
const { createEvidence } = require('../aiEvidenceService');

const ERROR = {
  AI_STRUCTURED_OUTPUT_INVALID: 'AI_STRUCTURED_OUTPUT_INVALID',
};

const SUPPORTED_ANALYSIS_TYPES = ['trend', 'frequency', 'rectification', 'clustering'];

const DOMAIN_NAMES = { hazard: '隐患', inspection: '检查/巡检' };

/** 解析 AI 输出的 JSON（允许 ```json 围栏，fail-closed） */
function parseStructuredOutput(content) {
  if (!content || typeof content !== 'string') {
    throw new AiError(ERROR.AI_STRUCTURED_OUTPUT_INVALID, 'AI 输出为空，无法解析为结构化结果');
  }
  let text = content.trim();
  // 剥离 markdown 代码围栏
  if (text.startsWith('```')) {
    const lines = text.split('\n');
    lines.shift();
    if (lines.length && lines[lines.length - 1].trim().startsWith('```')) lines.pop();
    text = lines.join('\n').trim();
  }
  // 截取最外层 JSON 对象
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new AiError(ERROR.AI_STRUCTURED_OUTPUT_INVALID, 'AI 输出不含 JSON 对象');
  }
  text = text.slice(start, end + 1);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new AiError(ERROR.AI_STRUCTURED_OUTPUT_INVALID, `AI 输出 JSON 解析失败: ${e.message}`);
  }
}

/** 校验结构化输出必需字段 */
function validateStructured(parsed) {
  const required = ['summary', 'key_findings', 'trend_analysis', 'anomalies',
    'high_frequency_issues', 'possible_causes', 'management_suggestions', 'limitations'];
  const missing = required.filter((k) => parsed[k] == null);
  if (missing.length > 0) {
    throw new AiError(ERROR.AI_STRUCTURED_OUTPUT_INVALID, `AI 结构化输出缺少字段: ${missing.join(', ')}`);
  }
  for (const arrKey of ['key_findings', 'trend_analysis', 'anomalies',
    'high_frequency_issues', 'possible_causes', 'management_suggestions', 'limitations']) {
    if (parsed[arrKey] != null && !Array.isArray(parsed[arrKey])) {
      throw new AiError(ERROR.AI_STRUCTURED_OUTPUT_INVALID, `AI 结构化输出字段 ${arrKey} 必须是数组`);
    }
  }
  return parsed;
}

/** 校验 Analysis Input 基础字段 */
function validateInput(input) {
  if (!input || typeof input !== 'object') throw new AiError('AI_INVALID_REQUEST', '请求体必须是 JSON 对象');
  if (!String(input.domain || '').trim()) throw new AiError('AI_INVALID_REQUEST', '缺少 domain（如 hazard）');
  const types = input.analysisTypes || [];
  if (types.length > 0) {
    const bad = types.filter((t) => !SUPPORTED_ANALYSIS_TYPES.includes(t));
    if (bad.length > 0) throw new AiError('AI_INVALID_REQUEST', `不支持的 analysisTypes: ${bad.join(', ')}（支持: ${SUPPORTED_ANALYSIS_TYPES.join(', ')}）`);
  }
}

/** 从统计结果提取 RAG 检索主题词（按需） */
function ragQueriesFromStats(stats) {
  const queries = [];
  for (const c of stats.topCategories || []) if (c.name) queries.push(c.name);
  for (const s of stats.topSources || []) if (s.name) queries.push(s.name);
  for (const d of stats.duplicates || []) if (d.category) queries.push(d.category);
  return queries.slice(0, 3);
}

/**
 * 执行结构化数据分析
 * @param {Object} input
 * @param {string} input.domain
 * @param {Object} [input.timeRange]
 * @param {Object} [input.filters]
 * @param {Array} [input.records] - 注入标准记录（测试/自带数据）
 * @param {Array} [input.analysisTypes]
 * @param {boolean} [input.useRag]
 * @param {number|string} [input.userId]
 * @param {string} [input.provider]
 * @returns {Promise<Object>}
 */
async function analyzeData(input = {}) {
  validateInput(input);

  // 1) 读取（records 注入 / db 只读）
  const fetched = await fetchRawRecords({
    domain: input.domain,
    timeRange: input.timeRange,
    records: input.records,
    limit: input.limit,
  });

  // 2) 归一化
  const { normalized, limitations } = normalizeRecords(fetched.records);

  // 3) 确定性统计（不经过 AI；analysisTypes 影响统计重点标记 focus，见 analysisStatistics.deriveFocus）
  const stats = computeStatistics(normalized, {
    domain: input.domain,
    timeRange: input.timeRange,
    filters: input.filters || {},
    sourceMode: fetched.sourceMode,
    limitations,
    analysisTypes: input.analysisTypes,
  });

  // AI-09 截断可见：数据范围随统计快照持久化（totalAvailable/analyzedRecords/limit/truncated）
  stats.dataScope = fetched.dataScope;
  stats.analysisTypes = (input.analysisTypes || []).slice();

  // 4) RAG 制度依据（按需，失败静默降级不阻断统计与 AI）
  let ragContext = null;
  let ragEvidence = [];
  if (input.useRag && stats.totalRecords > 0) {
    try {
      const retriever = require('../knowledge/retriever');
      const queries = ragQueriesFromStats(stats);
      const seen = new Set();
      for (const q of queries) {
        const ret = await retriever.retrieve(q, { topK: 2, provider: input.provider });
        if (ret.available) {
          for (const r of ret.results) {
            if (seen.has(r.chunkId)) continue;
            seen.add(r.chunkId);
            ragContext = ragContext || [];
            ragContext.push({ chunkId: r.chunkId, title: r.documentTitle, section: r.section, content: r.content, score: r.score });
            ragEvidence.push(createEvidence({
              sourceType: 'knowledge_base',
              sourceId: r.chunkId,
              sourceDomain: 'knowledge_base',
              sourceField: `${r.documentTitle}${r.section ? '·' + r.section : ''}`,
              evidenceText: r.content,
              evidenceStrength: 'medium',
            }));
          }
        }
      }
    } catch (e) {
      ragContext = null; // RAG 不可用静默降级
    }
  }

  // 5) 业务统计证据（数字来源可追溯）
  const businessEvidence = createEvidence({
    sourceType: 'business_record',
    sourceId: input.domain,
    sourceDomain: input.domain,
    sourceField: 'statistics',
    evidenceText: `统计数据（数据库/注入记录，共${stats.totalRecords}条）：整改率${stats.summary.rectificationRate}%，未整改${stats.summary.unrectifiedCount}条，逾期${stats.summary.overdueCount}条，重复问题${stats.summary.duplicateCount}条`,
    evidenceStrength: 'high',
  });
  const evidence = [businessEvidence, ...ragEvidence];

  // 6) AI 解释（AI 不可用 → 降级）
  const ai = { available: false };
  let parsed = null;
  let recordResult = { recordId: null, recordSaved: false };
  if (stats.totalRecords > 0) {
    try {
      const prompt = buildPrompt(stats, {
        domainName: DOMAIN_NAMES[input.domain] || input.domain,
        ragContext,
        analysisTypes: input.analysisTypes,
      });
      const result = await gateway.generate({
        promptKey: 'hse.data.analysis',
        promptVersion: 'v1.0',
        data: { statistics: stats.summary }, // 渲染兜底数据（Prompt 主指令经 customInstructions）
        customInstructions: prompt,
        evidence,
        provider: input.provider,
        userId: input.userId,
        sourceDomain: 'analysis',
        sourceRecordId: input.domain,
        record: {
          type: 'analysis',
          subType: 'data_analysis',
          title: `${DOMAIN_NAMES[input.domain] || input.domain}数据分析`,
        },
      });
      parsed = validateStructured(parseStructuredOutput(result.content));
      Object.assign(ai, {
        available: true,
        structured: true,
        provider: result.provider,
        model: result.model,
        promptKey: result.promptKey,
        promptVersion: result.promptVersion,
        durationMs: result.durationMs,
        analysis: parsed,
      });
      recordResult = { recordId: result.recordId, recordSaved: result.recordSaved };
      if (result.recordError) recordResult.recordError = result.recordError;
    } catch (e) {
      if (e && e.name === 'AiError') {
        Object.assign(ai, {
          available: false,
          code: e.code,
          message: e.message,
          structured: e.code === ERROR.AI_STRUCTURED_OUTPUT_INVALID ? false : null,
        });
      } else {
        Object.assign(ai, { available: false, code: 'AI_PROVIDER_UNREACHABLE', message: e.message });
      }
    }
  } else {
    ai.code = 'AI_EMPTY_DATA';
    ai.message = '统计结果为空（0 条记录），不触发 AI 解释';
  }

  return {
    success: true,
    statistics: stats,
    ai,
    evidence,
    recordId: recordResult.recordId,
    recordSaved: recordResult.recordSaved,
    ...(recordResult.recordError ? { recordError: recordResult.recordError } : {}),
  };
}

module.exports = {
  analyzeData,
  parseStructuredOutput,
  validateStructured,
  SUPPORTED_ANALYSIS_TYPES,
  DOMAIN_NAMES,
  ERROR,
};
