/**
 * AI-10 Management Suggestion Prompt Builder
 *
 * 输入：AI-09 结构化分析结果（aiResult.analysis）+ 统计快照（statisticsSnapshot）+ 制度依据（RAG evidence）。
 * 输出：固定 JSON 协议（AI-10 任务书 §6），数量有上限，禁止越权表述。
 *
 * 人机边界（AI-10 任务书 §7/§8）：
 *  - AI 只输出「管理建议」供人工研判，不输出最终管理结论；
 *  - 禁止：认定员工/部门违规或负责任、自动扣分/处罚/责任认定、下达整改任务、
 *    改变风险等级、改变考核结果、形成具有执行效力的管理决定；
 *  - 所有数字必须引用给定的分析/统计结果，AI 禁止自行计算或编造。
 */

const SUGGESTION_OUTPUT_SCHEMA = {
  overall_assessment: '总体分析判断（1-2 句，不超过 100 字，必须基于给定分析结果）',
  priority_issues: '需要管理人员重点关注的问题数组（2~5 条，每条不超过 60 字）',
  management_actions: '管理层可以考虑采取的管理措施数组（2~5 条，每条不超过 60 字，仅建议性措辞）',
  monitoring_points: '后续需要持续观察的指标数组（1~4 条，每条不超过 40 字）',
  follow_up_suggestions: '建议进一步核查或分析的方向数组（1~4 条，每条不超过 40 字）',
  limitations: '数据不足、样本截断、AI 能力限制等数组（1~4 条，每条不超过 40 字）',
};

/** 序列化分析结果 + 统计快照（压缩，供 Prompt 使用） */
function serializeContext(analysis, statistics) {
  return JSON.stringify(
    {
      analysis: analysis || null,
      statistics: statistics || null,
    },
    null,
    0
  );
}

/**
 * 组装管理建议 Prompt
 * @param {Object} analysis - AI-09 aiResult.analysis（结构化分析结果）
 * @param {Object} [statistics] - 任务 statistics_snapshot（含 dataScope）
 * @param {Object} [opts]
 * @param {Array} [opts.ragEvidence] - 任务 evidence 中 knowledge_base 项（制度/标准依据）
 * @returns {string}
 */
function buildSuggestionPrompt(analysis, statistics, opts = {}) {
  const ragEvidence = (opts.ragEvidence || []).slice(0, 4);
  const ragBlock = ragEvidence.length > 0
    ? `\n制度依据（来自企业知识库，可直接引用，引用时标注 [来源:文档标题]）：\n${ragEvidence
        .map((e) => `- [${e.source_field || '知识库'}]: ${(e.evidence_text || '').slice(0, 200)}`)
        .join('\n')}`
    : '';

  return `以下是 HSE 安全管理的「结构化分析结果」（由 AI-09 基于确定性统计生成）与「统计快照」（数字全部来自数据库统计，真实可信）：

${serializeContext(analysis, statistics)}${ragBlock}

请基于以上内容生成一份「管理建议」，供 HSE 管理人员阅读、确认与引用。严格遵守以下规则：
1. 所有数字必须直接引用分析结果/统计中的数字，禁止自己计算、估算或编造任何数字。
2. 只能输出「建议性」内容（如“建议进一步核查”“建议重点关注”“可能与管理薄弱有关”），
   禁止任何最终结论表述：禁止认定某员工/某部门违规或负有责任；禁止自动扣分、处罚、追责、
   责任认定；禁止下达/责令整改任务；禁止改变风险等级；禁止改变考核结果；
   禁止形成具有执行效力的管理决定。
3. 不能给出“某员工应扣X分”“责任人是某部门”之类的表述；如统计显示某问题频发，
   应表述为“相关记录显示该问题出现频率较高，建议管理人员进一步核查相关作业环节”。
4. 输出必须是【合法 JSON 对象】，不要输出 markdown 代码块、不要输出 JSON 以外的任何文字。
5. JSON 必须包含以下字段（数量有上限，不得无限生成）：
${JSON.stringify(SUGGESTION_OUTPUT_SCHEMA, null, 2)}
6. 输出要精炼：总体判断不超过 100 字，每条建议不超过 60 字；宁缺毋滥，不要堆砌。

请直接输出 JSON。`;
}

module.exports = {
  SUGGESTION_OUTPUT_SCHEMA,
  buildSuggestionPrompt,
  serializeContext,
};
