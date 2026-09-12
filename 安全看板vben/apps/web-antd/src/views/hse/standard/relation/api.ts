/**
 * 标准条款-资料关联管理 API - HSE V2 Sprint4 Phase4
 *
 * 对应后端路由: server/routes/hse-standard-relation.js
 * 挂载路径: /api/hse/standard/relation
 */

import { requestClient } from '#/api/request';

export namespace RelationApi {
  /** 关联状态 */
  export type RelationStatus = 'pending' | 'valid' | 'invalid';

  /** 匹配类型 */
  export type MatchType = 'auto' | 'manual';

  /** 关联记录 */
  export interface Relation {
    id: number;
    fileId: number;
    clauseId: number;
    clauseCode?: string;
    clauseName?: string;
    matchType: MatchType;
    matchConfidence: number;
    status: RelationStatus;
    matchReason?: string;
    confirmedBy?: number;
    confirmedAt?: string;
    createdAt?: string;
    updatedAt?: string;
    remark?: string;
    // 关联查询时附带的文件信息
    fileName?: string;
    fileSummary?: string;
    fileType?: string;
    fileReviewStatus?: string;
    fileSize?: number;
    // 关联查询时附带的条款信息
    clauseTitle?: string;
    elementName?: string;
    level?: number;
    keywords?: string[];
    requiredDocTypes?: string[];
  }

  /** 匹配建议 */
  export interface MatchSuggestion {
    fileId: number;
    fileName: string;
    fileSummary?: string;
    fileType?: string;
    confidence: number;
    hits: string[];
  }

  /** 批量生成结果 */
  export interface GenerateResult {
    totalClauses: number;
    totalMatches: number;
    created: number;
    skipped: number;
  }

  /** 批量确认结果 */
  export interface BatchConfirmResult {
    total: number;
    success: number;
    failed: number;
    errors: Array<{ id: number; message: string }>;
  }

  /** 统计数据 */
  export interface RelationStats {
    total: number;
    byStatus: { pending: number; valid: number; invalid: number };
    byMatchType: { auto: number; manual: number };
    linkedFiles: number;
    linkedClauses: number;
  }
}

const BASE = '/hse/standard/relation';

/** 查询条款关联资料 */
export async function getRelationsByClause(
  clauseId: number,
  params?: { status?: RelationApi.RelationStatus },
) {
  return requestClient.get<RelationApi.Relation[]>(
    `${BASE}/clause/${clauseId}`,
    { params },
  );
}

/** 查询资料关联条款 */
export async function getRelationsByFile(
  fileId: number,
  params?: { status?: RelationApi.RelationStatus },
) {
  return requestClient.get<RelationApi.Relation[]>(
    `${BASE}/file/${fileId}`,
    { params },
  );
}

/** 查询资料的有效关联（AI 评价专用，只返回 valid） */
export async function getValidRelationsByFile(fileId: number) {
  return requestClient.get<RelationApi.Relation[]>(
    `${BASE}/file/${fileId}/valid`,
  );
}

/** 创建人工关联 */
export async function createRelation(data: {
  fileId: number;
  clauseId: number;
  remark?: string;
}) {
  return requestClient.post<RelationApi.Relation>(BASE, data);
}

/** 取消关联（软删除，不删除文件） */
export async function deleteRelation(relationId: number) {
  return requestClient.delete(`${BASE}/${relationId}`);
}

/** 确认关联（pending → valid） */
export async function confirmRelation(relationId: number) {
  return requestClient.put<RelationApi.Relation>(
    `${BASE}/${relationId}/confirm`,
  );
}

/** 批量确认关联 */
export async function batchConfirmRelations(relationIds: number[]) {
  return requestClient.post<RelationApi.BatchConfirmResult>(
    `${BASE}/batch-confirm`,
    { relationIds },
  );
}

/** 为单条款生成匹配建议（不写库） */
export async function autoMatchForClause(
  clauseId: number,
  params?: { minConfidence?: number; limit?: number },
) {
  return requestClient.post<RelationApi.MatchSuggestion[]>(
    `${BASE}/auto-match/clause/${clauseId}`,
    params || {},
  );
}

/** 为所有条款生成匹配建议（写库 pending） */
export async function generateAutoMatches(params?: {
  minConfidence?: number;
  limitPerClause?: number;
}) {
  return requestClient.post<RelationApi.GenerateResult>(
    `${BASE}/auto-match/generate`,
    params || {},
  );
}

/** 获取待确认的自动匹配建议 */
export async function getPendingSuggestions(params?: {
  minConfidence?: number;
  limit?: number;
  clauseId?: number;
}) {
  return requestClient.get<RelationApi.Relation[]>(
    `${BASE}/suggestions`,
    { params },
  );
}

/** 关联统计 */
export async function getRelationStats() {
  return requestClient.get<RelationApi.RelationStats>(`${BASE}/stats`);
}
