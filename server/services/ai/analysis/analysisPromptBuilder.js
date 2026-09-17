/**
 * AI-06 Analysis Prompt Builder
 *
 * 将「确定性统计结果」组装为 AI 解释任务 Prompt（AI-06 任务书 §10/§11/§12）：
 *  - 数字必须全部来自统计层，AI 禁止自行计算/估算任何数字；
 *  - 输出必须是合法 JSON（无 markdown 代码块），结构固定；
 *  - 原因只能是「可能原因/分析假设」，禁止事实认定与责任指向；
 *  - RAG 制度依据（如有）以 [来源:xxx] 引用。
 */

const ANALYSIS_OUTPUT_SCHEMA = {
  summary: '总体结论（1-2 句）',
  key_findings: '关键发现数组（每条为字符串）',
  trend_analysis: '趋势分析数组（每条为字符串，可引用统计中的时间区间）',
  anomalies: '异常发现数组（每条为字符串，只能基于统计数字指出异常，如某月激增/整改率下滑）',
  high_frequency_issues: '高频问题数组（每条为字符串，基于统计 TOP 数据）',
  possible_causes: '可能原因数组（每条为字符串，必须使用“可能原因：”前缀或“可能”措辞，禁止事实认定）',
  management_suggestions: '管理建议数组（每条为字符串）',
  limitations: '数据局限数组（基于统计 limitations 字段）',
};

/**
 * 序列化统计结果（压缩，供 Prompt 使用）
 */
function serializeStatistics(stats) {
  return JSON.stringify({
    totalRecords: stats.totalRecords,
    focus: stats.focus,
    summary: stats.summary,
    trendMonthly: stats.trend.monthly,
    topCategories: stats.topCategories.slice(0, 5),
    topSources: stats.topSources.slice(0, 5),
    topOrgs: stats.topOrgs.slice(0, 5),
    topAreas: stats.topAreas.slice(0, 5),
    duplicates: stats.duplicates.slice(0, 5),
    unrectifiedList: stats.unrectifiedList.slice(0, 5),
    clustering: stats.clustering,
    limitations: stats.limitations,
  }, null, 0);
}

/** AI-09：analysisTypes → 分析重点方向说明（影响 Prompt 上下文与 AI 输出侧重） */
const ANALYSIS_TYPE_FOCUS = {
  trend: '趋势变化、时间分布、异常波动；仅当统计中确有可比的多个时间周期时才讨论同比/环比，数据不足时如实说明',
  frequency: '高频问题、高频类别、高频来源、重复问题、问题聚集',
  rectification: '整改数量、未整改数量、整改率、整改趋势、未整改重点',
  clustering: '时间/类型/区域的集中度（仅统计描述，不做风险判定）',
};

/**
 * 组装 Prompt
 * @param {Object} stats - analysisStatistics 输出
 * @param {Object} opts - { domainName, ragContext, analysisTypes }
 * @returns {string}
 */
function buildPrompt(stats, opts = {}) {
  const domainName = opts.domainName || stats.domain || 'HSE';
  const ragBlock = opts.ragContext && opts.ragContext.length > 0
    ? `\n制度依据（来自企业知识库，可直接引用，引用时标注 [来源:文档标题]）：\n${opts.ragContext.map((c) => `- [${c.title}]${c.section ? `·${c.section}` : ''}: ${c.content}`).join('\n')}`
    : '';
  const analysisTypes = (opts.analysisTypes || []).filter((t) => ANALYSIS_TYPE_FOCUS[t]);
  const focusBlock = analysisTypes.length > 0
    ? `\n分析重点方向（本次用户选择，必须优先围绕以下方向展开；未选方向可简化或省略，不得为未选方向编造深入结论）：\n${analysisTypes.map((t) => `- ${t}: ${ANALYSIS_TYPE_FOCUS[t]}`).join('\n')}`
    : '\n未指定分析重点方向，请对统计结果均衡分析。';

  return `你是 HSE 安全管理数据分析助手。以下是一份「确定性统计结果」（数字全部来自数据库统计，真实可信）。

数据域：${domainName}
${focusBlock}

${serializeStatistics(stats)}${ragBlock}

请基于以上统计结果完成 HSE 数据分析，严格遵守以下规则：
1. 所有数字必须直接引用统计结果中的数字，禁止自己计算、估算或编造任何数字；统计中没有的数字不得出现。
2. 你只能解释统计结果，不能生成统计结果；如果某项数据不足，在 limitations 中如实说明。
3. 原因分析只能使用「可能原因/分析假设」措辞（如“可能是检查频次不足”“可能与管理薄弱有关”），禁止使用“确定原因就是”“责任人就是”“该员工违规”“应该扣分”等事实认定或责任指向表述。
4. 输出必须是【合法 JSON 对象】，不要输出 markdown 代码块、不要输出 JSON 以外的任何文字。
5. JSON 必须包含以下字段：
${JSON.stringify(ANALYSIS_OUTPUT_SCHEMA, null, 2)}
6. 输出要精炼：summary 不超过 60 字，每个数组元素不超过 40 字；数组 3～6 条即可，不要堆砌。

请直接输出 JSON。`;
}

module.exports = {
  ANALYSIS_OUTPUT_SCHEMA,
  ANALYSIS_TYPE_FOCUS,
  buildPrompt,
  serializeStatistics,
};
