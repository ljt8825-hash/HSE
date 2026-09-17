/**
 * RAG 服务（AI-05）
 *
 * 链路（任务书 §24 强制）：
 *   Route → RAG Service → Retriever → Context Builder
 *        → AI Gateway → Provider Registry → Ollama → Answer + Citation
 * 禁止 Route → Ollama 直连。
 *
 * Prompt：hse.rag.answer（DRAFT，aiPromptRegistry 注册）。
 * Generation Record：复用 ai_generation_records（gateway record 参数）。
 */

const gateway = require('../aiGateway');
const retriever = require('./retriever');
const ragContextBuilder = require('./ragContextBuilder');
const vectorStore = require('./vectorStore');

/**
 * 知识库 RAG 问答
 * @param {Object} input { question, topK, filters, provider, record, skipHealthCheck }
 * @returns {Promise<Object>}
 */
async function rag(input = {}) {
  const question = input.question || input.query || '';
  if (!String(question).trim()) {
    const err = new Error('question 必填');
    err.name = 'AiError';
    err.code = 'AI_INVALID_REQUEST';
    throw err;
  }

  // 1) 检索
  const ret = await retriever.retrieve(question, { topK: input.topK || 5, filters: input.filters, provider: input.provider });
  if (!ret.available) {
    return {
      success: false,
      blocked: true,
      code: ret.code || null,
      reason: ret.reason || '检索能力不可用',
      answer: null,
      evidence: [],
      retrieval: { results: [] },
    };
  }

  // 2) 上下文组装
  const ctx = ragContextBuilder.buildContext(question, ret.results);

  // 3) AI Gateway 生成（RAG Prompt DRAFT + 知识上下文 + 证据）
  const result = await gateway.generate({
    promptKey: 'hse.rag.answer',
    data: { context: ctx.contextItems.map((it) => ({ citationId: it.citationId, source: `${it.documentTitle}${it.section ? '·' + it.section : ''}`, content: it.content })) },
    customInstructions: question,
    evidence: ctx.citations,
    provider: input.provider,
    userId: input.userId,
    sourceDomain: 'knowledge_base',
    record: input.record || { type: 'rag', subType: 'knowledge_base', title: String(question).slice(0, 200) },
    skipHealthCheck: input.skipHealthCheck,
  });

  return {
    success: true,
    question,
    answer: result.content,
    provider: result.provider,
    model: result.model,
    promptKey: result.promptKey,
    promptVersion: result.promptVersion,
    requestId: result.requestId,
    traceId: result.traceId,
    usage: { inputTokens: result.inputTokens || 0, outputTokens: result.outputTokens || 0, durationMs: result.durationMs || 0 },
    evidence: result.evidence || [],
    citations: ctx.citations.map((c, i) => ({
      citationId: i + 1,
      chunkId: c.source_id,
      documentId: ctx.contextItems[i] ? ctx.contextItems[i].documentId : null,
      sourceId: ctx.contextItems[i] ? ctx.contextItems[i].sourceId : null,
      documentTitle: ctx.contextItems[i] ? ctx.contextItems[i].documentTitle : null,
      section: ctx.contextItems[i] ? ctx.contextItems[i].section : null,
      page: ctx.contextItems[i] ? ctx.contextItems[i].page : null,
      score: ctx.contextItems[i] ? ctx.contextItems[i].score : null,
      evidenceText: c.evidence_text,
    })),
    retrieval: { results: ctx.contextItems, count: ctx.contextItems.length },
    recordId: result.recordId || null,
    recordSaved: !!result.recordSaved,
    ...(result.recordError ? { recordError: result.recordError } : {}),
  };
}

/** 纯检索（不生成回答）——/knowledge/search */
async function search(input = {}) {
  const question = input.question || input.query || '';
  if (!String(question).trim()) {
    const err = new Error('question 必填');
    err.name = 'AiError';
    err.code = 'AI_INVALID_REQUEST';
    throw err;
  }
  const ret = await retriever.retrieve(question, { topK: input.topK || 5, filters: input.filters, provider: input.provider });
  if (!ret.available) {
    return { success: false, blocked: true, reason: ret.reason, results: [] };
  }
  return {
    success: true,
    question: String(question).trim(),
    embeddingModel: ret.embeddingModel,
    embeddingDimension: ret.embeddingDimension,
    results: ret.results,
    vectorStore: { available: true, count: await vectorStore.count() },
  };
}

module.exports = { rag, search };
