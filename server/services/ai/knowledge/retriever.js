/**
 * 检索器（AI-05）
 *
 * 输入：query + topK + filters
 * 输出：chunk / score / document / source / metadata（Evidence 全链路保留）。
 *
 * 流程：query → embedding（AI Gateway → Ollama）→ pgvector 余弦检索 → 富化结果。
 * 可用性：embedding / pgvector 不可用时如实报 BLOCKED（不伪造检索结果）。
 */

const embeddingService = require('./embeddingService');
const vectorStore = require('./vectorStore');

/**
 * @param {string} query
 * @param {Object} opts { topK, filters, provider }
 * @returns {Promise<{available:boolean, results:Array<{chunkId, documentId, sourceId, content, page, section, metadata, score, documentTitle, sourceName, sourceType}>}>}
 */
async function retrieve(query, opts = {}) {
  if (!query || !String(query).trim()) throw new Error('query 必填');
  const vectorOk = await vectorStore.isAvailable();
  if (!vectorOk) {
    return { available: false, reason: 'vector store 不可用（pgvector 未安装）', results: [] };
  }
  const q = String(query).trim();
  let emb;
  try {
    emb = await embeddingService.embedText(q, { provider: opts.provider });
  } catch (err) {
    return {
      available: false,
      reason: `embedding 不可用: ${err.message || err}`,
      code: err.code || null,
      results: [],
    };
  }
  if (!emb.vector || emb.vector.length === 0) {
    return { available: false, reason: 'embedding 模型未返回向量', results: [] };
  }
  const results = await vectorStore.search(emb.vector, { topK: opts.topK || 5, filters: opts.filters });
  return {
    available: true,
    embeddingModel: emb.model,
    embeddingDimension: emb.dimension,
    results,
  };
}

module.exports = { retrieve };
