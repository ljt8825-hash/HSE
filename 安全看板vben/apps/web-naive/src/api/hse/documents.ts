/**
 * 安全资料中心 API（web-naive）
 *
 * 对应后端路由: server/routes/hse-documents.js
 * 路由前缀: /hse/documents
 * 契约唯一来源: apps/web-antd/src/api/hse/documents.ts（本文件与之 1:1 对齐）
 */
import { requestClient } from '#/api/request';

export namespace DocumentsApi {
  /** 文件类型 */
  export type FileType = 'pdf' | 'word' | 'excel' | 'image' | 'video' | 'other';

  /** 审核状态 */
  export type ReviewStatus = 'pending' | 'approved' | 'rejected';

  /** 分析状态 */
  export type AnalysisStatus =
    | 'pending'
    | 'processing'
    | 'completed'
    | 'failed';

  /** 分析依据 */
  export type AnalysisBasis = 'full_text' | 'metadata_only' | 'filename_only';

  /** 风险等级 */
  export type AiRiskLevel = 'low' | 'medium' | 'high' | 'critical';

  /** 确认状态 */
  export type ConfirmStatus = 'unconfirmed' | 'confirmed' | 'rejected';

  /** 有效期状态 */
  export type ValidStatus = 'valid' | 'expiring' | 'expired' | 'none';

  /** 文件记录 */
  export interface DocumentFile {
    id: number;
    fileUuid: string;
    originalName: string;
    storageName: string;
    fileUrl: string;
    fileSize: number;
    fileSizeText: string;
    fileType: FileType;
    mimeType: string;
    categoryId?: number;
    categoryName?: string;
    summary?: string;
    analysisStatus: AnalysisStatus;
    completenessScore?: number;
    riskLevel?: string;
    // 审查意见字段
    sourceType: string;
    sourceId?: string;
    reviewStatus: ReviewStatus;
    reviewUser?: string;
    reviewTime?: string;
    reviewComment?: string;
    aiSummary?: string;
    aiScore?: number;
    // 有效期字段
    validStartDate?: string;
    validEndDate?: string;
    remindDays?: number;
    validStatus: ValidStatus;
    status: string;
    uploadedBy: string;
    uploadedAt: string;
    createdAt: string;
    updatedAt: string;
    tags?: Array<{ id: number; name: string; color: string }>;
  }

  /** 文件列表参数 */
  export interface DocumentListParams {
    page?: number;
    pageSize?: number;
    categoryId?: number;
    fileType?: FileType;
    reviewStatus?: ReviewStatus;
    keyword?: string;
    validStatus?: ValidStatus | 'all';
    uploadedBy?: string;
  }

  /** 文件列表响应 */
  export interface DocumentListResult {
    list: DocumentFile[];
    total: number;
    page: number;
    pageSize: number;
  }

  /** 上传参数（FormData 附加字段） */
  export interface UploadExtra {
    categoryId?: number;
    summary?: string;
    validStartDate?: string;
    validEndDate?: string;
    remindDays?: number;
  }

  /** 审核参数 */
  export interface ReviewParams {
    reviewStatus: 'approved' | 'rejected';
    reviewComment?: string;
  }

  /** 文件统计 */
  export interface DocumentStats {
    total: number;
    byReviewStatus: Record<string, number>;
    byFileType: Record<string, number>;
    byValidStatus: {
      valid: number;
      expiring: number;
      expired: number;
      none: number;
    };
  }

  /** 分类节点 */
  export interface CategoryNode {
    id: number;
    parentId?: number;
    code: string;
    name: string;
    description?: string;
    icon?: string;
    sortOrder: number;
    children: CategoryNode[];
  }

  /** 分类创建/更新参数 */
  export interface CategoryParams {
    parentId?: number;
    code: string;
    name: string;
    description?: string;
    icon?: string;
    sortOrder?: number;
  }

  /** 标签 */
  export interface Tag {
    id: number;
    name: string;
    color: string;
    type: 'manual' | 'auto';
    usageCount: number;
  }

  /** AI 分析建议 */
  export interface AiSuggestion {
    standard: string;
    suggestion: string;
    level: 'high' | 'medium' | 'low';
  }

  /** AI 缺项 */
  export interface AiMissingItem {
    item: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
  }

  /** AI 分析结果 */
  export interface DocumentAiAnalysis {
    id: number;
    fileId: number;
    status: AnalysisStatus;
    analysisBasis: AnalysisBasis;
    promptVersion: string;
    extractMethod?: string;
    extractTextLength: number;
    extractError?: string;
    aiSummary?: string;
    aiScore?: number;
    aiRiskLevel?: AiRiskLevel;
    aiSuggestions: AiSuggestion[];
    aiMissingItems: AiMissingItem[];
    aiKeywords: string[];
    confirmedStatus: ConfirmStatus;
    confirmedBy?: string;
    confirmedAt?: string;
    errorMessage?: string;
    failedAt?: string;
    triggeredBy?: string;
    triggeredAt: string;
    startedAt?: string;
    completedAt?: string;
  }

  /** 分析历史列表项 */
  export interface AiAnalysisHistoryItem {
    id: number;
    status: AnalysisStatus;
    analysisBasis: AnalysisBasis;
    aiScore?: number;
    aiRiskLevel?: AiRiskLevel;
    triggeredBy?: string;
    triggeredAt: string;
    completedAt?: string;
    failedAt?: string;
  }

  /** 分析历史响应 */
  export interface AiAnalysisHistoryResult {
    list: AiAnalysisHistoryItem[];
    total: number;
    page: number;
    pageSize: number;
  }

  /** 触发分析响应 */
  export interface AnalyzeTaskResult {
    analysisId: number;
    status: AnalysisStatus;
    triggeredAt: string;
  }
}

const BASE = '/hse/documents';

// ============================================================
// 文件管理 API
// ============================================================

/** 文件列表 */
export async function getDocumentList(params: DocumentsApi.DocumentListParams) {
  return requestClient.get<DocumentsApi.DocumentListResult>(BASE, { params });
}

/** 文件详情 */
export async function getDocumentDetail(id: number) {
  return requestClient.get<DocumentsApi.DocumentFile>(`${BASE}/${id}`);
}

/** 文件上传 */
export async function uploadDocument(file: File, extra?: DocumentsApi.UploadExtra) {
  const formData = new FormData();
  formData.append('file', file);
  if (extra) {
    Object.entries(extra).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, String(value));
      }
    });
  }
  return requestClient.post<DocumentsApi.DocumentFile>(`${BASE}/upload`, formData, {
    headers: { 'Content-Type': undefined as any },
  });
}

/** 更新文件信息 */
export async function updateDocument(
  id: number,
  data: Partial<DocumentsApi.DocumentFile> & { tagIds?: number[] },
) {
  return requestClient.put<DocumentsApi.DocumentFile>(`${BASE}/${id}`, data);
}

/** 删除文件（软删除） */
export async function deleteDocument(id: number) {
  return requestClient.delete(`${BASE}/${id}`);
}

/**
 * 下载文件
 * 端点 GET /hse/documents/{id}/download 与旧版完全一致；
 * requestClient.download 触发浏览器下载等价旧版 get<Blob>({ responseType: 'blob' }) 的解包语义。
 */
export async function downloadDocument(id: number) {
  return requestClient.download(`${BASE}/${id}/download`);
}

/** 文件审核 */
export async function reviewDocument(id: number, params: DocumentsApi.ReviewParams) {
  return requestClient.post<DocumentsApi.DocumentFile>(`${BASE}/${id}/review`, params);
}

/** 文件统计 */
export async function getDocumentStats() {
  return requestClient.get<DocumentsApi.DocumentStats>(`${BASE}/stats`);
}

// ============================================================
// 分类管理 API
// ============================================================

/** 分类树 */
export async function getCategoryTree() {
  return requestClient.get<DocumentsApi.CategoryNode[]>(`${BASE}/categories`);
}

/** 创建分类 */
export async function createCategory(data: DocumentsApi.CategoryParams) {
  return requestClient.post(`${BASE}/categories`, data);
}

/** 更新分类 */
export async function updateCategory(
  id: number,
  data: Partial<DocumentsApi.CategoryParams>,
) {
  return requestClient.put(`${BASE}/categories/${id}`, data);
}

/** 删除分类 */
export async function deleteCategory(id: number) {
  return requestClient.delete(`${BASE}/categories/${id}`);
}

// ============================================================
// 标签管理 API
// ============================================================

/** 标签列表 */
export async function getTagList() {
  return requestClient.get<DocumentsApi.Tag[]>(`${BASE}/tags`);
}

/** 创建标签 */
export async function createTag(data: { name: string; color?: string; type?: string }) {
  return requestClient.post(`${BASE}/tags`, data);
}

// ============================================================
// AI 分析 API
// ============================================================

/** 触发 AI 分析 */
export async function analyzeDocument(id: number, data?: { customPrompt?: string }) {
  return requestClient.post<DocumentsApi.AnalyzeTaskResult>(
    `${BASE}/${id}/analyze`,
    data || {},
  );
}

/** 获取最新分析结果 */
export async function getDocumentAnalysis(id: number) {
  return requestClient.get<DocumentsApi.DocumentAiAnalysis | null>(`${BASE}/${id}/analysis`);
}

/** 获取分析历史列表 */
export async function getDocumentAnalysisHistory(
  id: number,
  params?: { page?: number; pageSize?: number },
) {
  return requestClient.get<DocumentsApi.AiAnalysisHistoryResult>(
    `${BASE}/${id}/analysis/history`,
    { params },
  );
}

/** 获取指定分析详情 */
export async function getDocumentAnalysisDetail(id: number, analysisId: number) {
  return requestClient.get<DocumentsApi.DocumentAiAnalysis>(
    `${BASE}/${id}/analysis/${analysisId}`,
  );
}

/** 重试分析 */
export async function retryDocumentAnalysis(id: number, analysisId: number) {
  return requestClient.post<DocumentsApi.AnalyzeTaskResult>(
    `${BASE}/${id}/analysis/${analysisId}/retry`,
  );
}
