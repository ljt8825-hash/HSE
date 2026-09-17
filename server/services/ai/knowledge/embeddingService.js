/**
 * Embedding 服务（AI-05）
 *
 * 不建立第二套 Embedding Provider 体系：
 * 全部经 AI Gateway.embed → Provider Registry（OllamaProvider.embed）→ Ollama /api/embed。
 * 模型：OLLAMA_EMBEDDING_MODEL（缺省 nomic-embed-text，768 维）。
 */

const gateway = require('../aiGateway');

/** 单条文本向量化 */
async function embedText(text, opts = {}) {
  const result = await gateway.embed({ texts: [String(text)], provider: opts.provider, model: opts.model, skipHealthCheck: opts.skipHealthCheck });
  return {
    provider: result.provider,
    model: result.model,
    dimension: result.dimension,
    vector: result.embeddings[0],
    durationMs: result.durationMs,
  };
}

/** 批量文本向量化（推荐，减少 HTTP 往返） */
async function embedTexts(texts, opts = {}) {
  const list = (Array.isArray(texts) ? texts : [texts]).map((t) => String(t));
  if (list.length === 0) throw new Error('至少需要 1 条文本');
  const result = await gateway.embed({ texts: list, provider: opts.provider, model: opts.model, skipHealthCheck: opts.skipHealthCheck });
  return {
    provider: result.provider,
    model: result.model,
    dimension: result.dimension,
    embeddings: result.embeddings,
    durationMs: result.durationMs,
  };
}

module.exports = { embedText, embedTexts };
