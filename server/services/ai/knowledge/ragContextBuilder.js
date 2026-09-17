/**
 * RAG Context 组装器（AI-05）
 *
 * 输入：query + retrieval results
 * 输出：{ systemPrompt, contextItems, citations }
 *  - contextItems：结构化资料条目（source/document/chunk/content/citationId）
 *  - citations：aiEvidenceService.createEvidence 产物（source_type='knowledge_base'，
 *    source_id=chunkId，source_domain='knowledge_base'，evidence_text=chunk content）
 *
 * Citation 追踪链：Answer → [来源:标题·章节] → Citation(id) → Chunk → Document → Source。
 */

const { createEvidence } = require('../aiEvidenceService');

/** 组装检索结果 → 上下文资料文本 */
function buildContextItems(results) {
  return results.map((r, i) => ({
    citationId: i + 1,
    chunkId: r.chunkId,
    documentId: r.documentId,
    sourceId: r.sourceId,
    documentTitle: r.documentTitle,
    sourceName: r.sourceName,
    sourceType: r.sourceType,
    section: r.section || null,
    page: r.page || null,
    score: r.score,
    content: r.content,
  }));
}

/** 资料条目 → 供模型阅读的文本块 */
function formatContextText(items) {
  return items
    .map((it) => {
      const loc = [it.documentTitle, it.section, it.page != null ? `第${it.page}页` : null].filter(Boolean).join('·');
      return `[引用#${it.citationId}] 来源:${loc}\n${it.content}`;
    })
    .join('\n\n');
}

/** 生成 evidence 数组（knowledge_base 类型） */
function buildCitations(items) {
  return items.map((it) =>
    createEvidence({
      sourceType: 'knowledge_base',
      sourceId: it.chunkId,
      sourceDomain: 'knowledge_base',
      sourceField: it.section || null,
      evidenceText: it.content.slice(0, 500),
      evidenceStrength: it.score >= 0.6 ? 'high' : it.score >= 0.4 ? 'medium' : 'low',
    })
  );
}

/**
 * 组装 RAG 上下文
 * @param {string} query
 * @param {Array} results - retriever.retrieve().results
 * @returns {{systemPrompt:string, contextItems:Array, citations:Array}}
 */
function buildContext(query, results = []) {
  const items = buildContextItems(results);
  const contextText = formatContextText(items);
  const systemPrompt =
    '以下是基于 HSE 知识库检索到的相关资料，供回答问题时使用：\n\n' +
    (contextText || '（无检索结果）');
  return {
    systemPrompt,
    contextItems: items,
    citations: buildCitations(items),
  };
}

module.exports = { buildContext, buildContextItems, formatContextText, buildCitations };
