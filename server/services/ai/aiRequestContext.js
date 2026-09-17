/**
 * AI Request Context（AI-02 Capability Layer）
 *
 * 统一请求上下文：每次 AI 调用生成 requestId/traceId，并携带
 * userId / employeeId（仅当认证上下文可靠获得）/ sourceDomain /
 * sourceRecordId / provider / model / promptKey / promptVersion / createdAt。
 *
 * 设计基线：AI-02 任务书 §16。
 * 约束：不重新设计认证系统；employeeId 仅在调用方可靠提供时携带，否则置 null。
 */

const { v4: uuidv4 } = require('uuid');

/**
 * 创建统一请求上下文
 * @param {Object} input
 * @param {number} [input.userId] - 触发人 users.id（取 req.user.id，不推断）
 * @param {number} [input.employeeId] - 员工 id（仅当认证上下文可靠获得；不确定传 null）
 * @param {string} [input.sourceDomain] - 业务域，如 'standard_evaluation' | 'document' | 'report'
 * @param {number|string} [input.sourceRecordId] - 业务记录 ID
 * @param {string} [input.provider] - 目标 Provider 名（缺省由 Gateway 决定）
 * @param {string} [input.model] - 目标模型（缺省由 Provider 决定）
 * @param {string} [input.promptKey] - Prompt Registry 键
 * @param {string} [input.promptVersion] - Prompt 版本
 * @returns {{
 *   requestId: string,
 *   traceId: string,
 *   userId: number|null,
 *   employeeId: number|null,
 *   sourceDomain: string|null,
 *   sourceRecordId: number|string|null,
 *   provider: string|null,
 *   model: string|null,
 *   promptKey: string|null,
 *   promptVersion: string|null,
 *   createdAt: string
 * }}
 */
function createRequestContext({
  userId,
  employeeId,
  sourceDomain,
  sourceRecordId,
  provider,
  model,
  promptKey,
  promptVersion,
} = {}) {
  const requestId = uuidv4();
  return {
    requestId,
    traceId: `ai-${requestId.slice(0, 8)}`, // 简短 traceId，便于日志/响应头关联
    userId: Number.isInteger(userId) ? userId : null,
    employeeId: Number.isInteger(employeeId) ? employeeId : null,
    sourceDomain: sourceDomain || null,
    sourceRecordId: sourceRecordId != null ? sourceRecordId : null,
    provider: provider || null,
    model: model || null,
    promptKey: promptKey || null,
    promptVersion: promptVersion || null,
    createdAt: new Date().toISOString(),
  };
}

module.exports = { createRequestContext };
