/**
 * 安全生产标准化条款管理 API - HSE V2 Sprint4 Phase 3
 *
 * 对应后端路由: server/routes/hse-standard.js
 * 复用: #/api/request 的 requestClient
 */

import { requestClient } from '#/api/request';

export namespace StandardApi {
  /** 条款状态 */
  export type ClauseStatus = 'active' | 'inactive';

  /** 条款层级 */
  export type ClauseLevel = 1 | 2 | 3;

  /** 条款节点（树形结构） */
  export interface ClauseNode {
    id: number;
    code: string;
    parentId?: number | null;
    level: ClauseLevel;
    elementName?: string;
    clauseTitle?: string;
    clauseContent?: string;
    checkMethod?: string;
    scoreWeight?: number | string;
    requiredDocTypes?: string[];
    keywords?: string[];
    sortOrder: number;
    status: ClauseStatus;
    createdBy?: number;
    createdAt?: string;
    updatedAt?: string;
    children?: ClauseNode[];
  }

  /** 条款详情（与 ClauseNode 结构一致） */
  export type ClauseDetail = ClauseNode;

  /** 条款统计 */
  export interface ClauseStats {
    total: number;
    byLevel: Record<number, number>;
    active: number;
    inactive: number;
  }

  /** 新增/编辑条款表单数据 */
  export interface ClauseFormData {
    code: string;
    parentId?: number | null;
    level: ClauseLevel;
    elementName?: string;
    clauseTitle?: string;
    clauseContent?: string;
    checkMethod?: string;
    scoreWeight?: number;
    requiredDocTypes?: string[];
    keywords?: string[];
    sortOrder?: number;
    status?: ClauseStatus;
  }

  /** 批量导入结果 */
  export interface ImportResult {
    total: number;
    success: number;
    failed: number;
    errors: Array<{ code: string; message: string }>;
  }
}

const BASE = '/hse/standard';

/** 获取三级条款树 */
export async function getClauseTree(params?: {
  includeInactive?: boolean;
}) {
  return requestClient.get<StandardApi.ClauseNode[]>(`${BASE}/tree`, {
    params,
  });
}

/** 获取条款统计 */
export async function getClauseStats() {
  return requestClient.get<StandardApi.ClauseStats>(`${BASE}/stats`);
}

/** 获取条款详情 */
export async function getClauseDetail(id: number) {
  return requestClient.get<StandardApi.ClauseDetail>(`${BASE}/${id}`);
}

/** 新增条款 */
export async function createClause(data: StandardApi.ClauseFormData) {
  return requestClient.post<StandardApi.ClauseDetail>(BASE, data);
}

/** 修改条款 */
export async function updateClause(
  id: number,
  data: Partial<StandardApi.ClauseFormData>,
) {
  return requestClient.put<StandardApi.ClauseDetail>(`${BASE}/${id}`, data);
}

/** 启用/停用条款 */
export async function setClauseStatus(id: number, status: StandardApi.ClauseStatus) {
  return requestClient.put<StandardApi.ClauseDetail>(
    `${BASE}/${id}/status`,
    { status },
  );
}

/** 批量导入条款 */
export async function importClauses(clauses: StandardApi.ClauseFormData[]) {
  return requestClient.post<StandardApi.ImportResult>(`${BASE}/import`, {
    clauses,
  });
}

/** 导出全部条款（返回 JSON 数组，前端触发下载） */
export async function exportClauses() {
  return requestClient.get<StandardApi.ClauseDetail[]>(`${BASE}/export`);
}
