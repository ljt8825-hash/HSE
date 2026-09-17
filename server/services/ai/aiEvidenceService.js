/**
 * AI Evidence 统一结构（AI-02 Capability Layer）
 *
 * 回答「AI 为什么得出这个建议」：每条证据说明 AI 结论所依据的业务来源。
 * 设计基线：AI-02 任务书 §13/§14。
 *
 * 铁律：Evidence 只解释 AI 建议的依据，绝不写入最终人工结果字段
 * （compliance_status / checked_by / checked_at / manual_remark 等）。
 * 链路必须保持：AI Evidence → AI Suggestion → Human Review → Final Result。
 *
 * AI-02 仅建立统一数据结构（内存/响应传递）；持久化依赖
 * ai_generation_records.evidence 字段（migration 待用户授权，见 ai_capability_layer_v1.sql）。
 */

/** 证据来源类型（允许未来扩展：knowledge_base / rule / model_output ...） */
const EVIDENCE_SOURCE_TYPES = [
  'business_record', // 业务记录
  'hse_standard', // 安全标准/条款
  'regulation', // 法规
  'document', // 文档
  'image', // 图片
  'knowledge_base', // 知识库（未来 RAG）
  'rule', // 规则
  'model_output', // 模型输出
];

/** 证据强度 */
const EVIDENCE_STRENGTHS = ['low', 'medium', 'high'];

/**
 * 创建统一证据项
 * @param {Object} input
 * @param {string} input.sourceType - EVIDENCE_SOURCE_TYPES 之一
 * @param {number|string} input.sourceId - 来源 ID
 * @param {string} input.sourceDomain - 来源业务域，如 'standard_evaluation' | 'document'
 * @param {string} [input.sourceField] - 来源字段（如 'description'）
 * @param {string} input.evidenceText - 证据内容
 * @param {string} [input.evidenceStrength] - 'low' | 'medium' | 'high'（缺省 medium）
 * @returns {{source_type:string, source_id:number|string, source_domain:string,
 *            source_field:string|null, evidence_text:string,
 *            evidence_strength:string, created_at:string}}
 */
function createEvidence({
  sourceType,
  sourceId,
  sourceDomain,
  sourceField,
  evidenceText,
  evidenceStrength = 'medium',
} = {}) {
  if (!EVIDENCE_SOURCE_TYPES.includes(sourceType)) {
    throw new Error(`不支持的证据来源类型: ${sourceType}，可选: ${EVIDENCE_SOURCE_TYPES.join(', ')}`);
  }
  if (sourceId == null) throw new Error('证据必须提供 sourceId');
  if (!sourceDomain) throw new Error('证据必须提供 sourceDomain');
  if (!evidenceText) throw new Error('证据必须提供 evidenceText');
  if (!EVIDENCE_STRENGTHS.includes(evidenceStrength)) {
    throw new Error(`证据强度必须是 ${EVIDENCE_STRENGTHS.join('/')} 之一`);
  }

  return {
    source_type: sourceType,
    source_id: sourceId,
    source_domain: sourceDomain,
    source_field: sourceField || null,
    evidence_text: evidenceText,
    evidence_strength: evidenceStrength,
    created_at: new Date().toISOString(),
  };
}

/**
 * 将证据数组附加到结果对象（返回新对象，不改原对象）
 * @param {Object} target - 结果对象（如 Gateway 输出）
 * @param {Array} evidenceList - createEvidence 产物数组
 * @returns {Object} 附带 evidence 字段的新对象
 */
function attachEvidence(target, evidenceList = []) {
  return { ...target, evidence: evidenceList.map((e) => ({ ...e })) };
}

/** 校验证据数组结构是否合法（用于保存前/测试） */
function validateEvidenceList(list) {
  if (!Array.isArray(list)) return false;
  return list.every((e) =>
    EVIDENCE_SOURCE_TYPES.includes(e.source_type) &&
    e.source_id != null &&
    !!e.source_domain &&
    !!e.evidence_text &&
    EVIDENCE_STRENGTHS.includes(e.evidence_strength)
  );
}

module.exports = {
  EVIDENCE_SOURCE_TYPES,
  EVIDENCE_STRENGTHS,
  createEvidence,
  attachEvidence,
  validateEvidenceList,
};
