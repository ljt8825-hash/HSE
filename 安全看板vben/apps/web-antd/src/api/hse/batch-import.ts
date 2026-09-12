/**
 * 批量导入中心 API 封装 - HSE V2.0 Sprint5
 *
 * 对应后端路由: server/routes/hse-batch-import.js
 * 复用: #/api/request 的 requestClient
 */

import { requestClient } from '#/api/request';

export namespace BatchImportApi {
  /** 导入类型 */
  export type ImportType = 'document' | 'standard_clause';
  // | 'safety_record';  // [提示词-129] 后端未实现，暂隐藏

  /** 业务模块 */
  export type ModuleType =
    | 'objectives' // 目标职责
    | 'standards' // 制度标准
    | 'risk' // 风险管控
    | 'hazards' // 隐患治理
    | 'site' // 现场管理
    | 'personnel' // 人员管理
    | 'training' // 培训考核
    | 'emergency' // 应急管理
    | 'insurance' // 保险管理
    | 'overview' // 安全总览
    | 'system'; // 系统管理

  /** 任务状态 */
  export type TaskStatus =
    | 'pending'
    | 'prechecking'
    | 'prechecked'
    | 'confirmed'
    | 'processing'
    | 'completed'
    | 'failed'
    | 'cancelled';

  /** 明细状态 */
  export type ItemStatus =
    | 'pending'
    | 'prechecking'
    | 'prechecked'
    | 'invalid'
    | 'duplicate'
    | 'processing'
    | 'success'
    | 'failed'
    | 'skipped'
    | 'retrying';

  /** 预检查状态 */
  export type PrecheckStatus = 'pending' | 'passed' | 'failed';

  /** 错误码 */
  export type ErrorCode =
    | 'DUP_FILE'
    | 'INVALID_TYPE'
    | 'INVALID_SIGNATURE'
    | 'OVERSIZE'
    | 'BIZ_ERROR'
    | 'PARSE_ERROR'
    | 'DB_ERROR'
    | 'UNKNOWN';

  /** 任务信息 */
  export interface BatchTask {
    id: number;
    taskNo: string;
    importType: ImportType;
    module?: ModuleType;
    importVersion: string;
    enterpriseId?: number;
    departmentId?: number;
    businessScope?: Record<string, any>;
    totalCount: number;
    successCount: number;
    failCount: number;
    pendingCount: number;
    status: TaskStatus;
    precheckResult?: PrecheckResult;
    progress: number;
    fileStorageDir?: string;
    resultSummary?: Record<string, any>;
    errorMessage?: string;
    createdBy: string;
    createdAt: string;
    precheckedAt?: string;
    confirmedAt?: string;
    startedAt?: string;
    completedAt?: string;
    updatedAt: string;
  }

  /** 预检查结果 */
  export interface PrecheckResult {
    validCount: number;
    invalidCount: number;
    dupCount: number;
    totalCount: number;
    items: PrecheckItem[];
  }

  /** 预检查明细项 */
  export interface PrecheckItem {
    itemId: number;
    seqNo: number;
    originalName: string;
    fileSize: number;
    precheckStatus: string;
    precheckMessage: string;
    errorCode?: string;
  }

  /** 任务明细 */
  export interface BatchItem {
    id: number;
    taskId: number;
    seqNo: number;
    originalName: string;
    storageName?: string;
    filePath?: string;
    fileSize: number;
    fileType?: string;
    mimeType?: string;
    fileHash?: string;
    status: ItemStatus;
    precheckStatus?: PrecheckStatus;
    precheckMessage?: string;
    targetTable?: string;
    targetId?: number;
    errorCode?: ErrorCode;
    errorMessage?: string;
    retryCount: number;
    maxRetry: number;
    metadata?: Record<string, any>;
    createdAt: string;
    precheckedAt?: string;
    startedAt?: string;
    completedAt?: string;
    updatedAt: string;
  }

  /** 任务进度 */
  export interface TaskProgress {
    taskId: number;
    status: TaskStatus;
    progress: number;
    totalCount: number;
    successCount: number;
    failCount: number;
    pendingCount: number;
    precheckResult?: PrecheckResult;
    resultSummary?: Record<string, any>;
    errorMessage?: string;
  }

  /** 分页结果 */
  export interface PageResult<T> {
    list: T[];
    total: number;
    page: number;
    pageSize: number;
  }

  /** 并发信息 */
  export interface ConcurrentInfo {
    currentCount: number;
    maxAllowed: number;
    canCreate: boolean;
  }
}

// ============================================================
// 任务管理
// ============================================================

/**
 * 创建导入任务（上传文件）
 */
export function createBatchTask(formData: FormData) {
  return requestClient.post<any>('/hse/batch-import/tasks', formData, {
    headers: { 'Content-Type': undefined as any },
  });
}

/**
 * 触发预检查
 */
export function precheckTask(taskId: number) {
  return requestClient.post<any>(`/hse/batch-import/tasks/${taskId}/precheck`);
}

/**
 * 确认执行
 */
export function confirmTask(
  taskId: number,
  data: { skipInvalid?: boolean; skipDuplicate?: boolean } = {},
) {
  return requestClient.post<any>(
    `/hse/batch-import/tasks/${taskId}/confirm`,
    data,
  );
}

/**
 * 获取任务列表（分页）
 */
export function getTaskList(params: {
  page?: number;
  pageSize?: number;
  importType?: string;
  module?: string;
  status?: string;
  keyword?: string;
  createdBy?: string;
}) {
  return requestClient.get<BatchImportApi.PageResult<BatchImportApi.BatchTask>>(
    '/hse/batch-import/tasks',
    { params },
  );
}

/**
 * 获取任务详情
 */
export function getTaskDetail(taskId: number) {
  return requestClient.get<{
    task: BatchImportApi.BatchTask;
    items: BatchImportApi.BatchItem[];
  }>(`/hse/batch-import/tasks/${taskId}`);
}

/**
 * 获取任务进度
 */
export function getTaskProgress(taskId: number) {
  return requestClient.get<BatchImportApi.TaskProgress>(
    `/hse/batch-import/tasks/${taskId}/progress`,
  );
}

/**
 * 获取任务明细列表（分页）
 */
export function getItemList(
  taskId: number,
  params: {
    page?: number;
    pageSize?: number;
    status?: string;
    keyword?: string;
  } = {},
) {
  return requestClient.get<BatchImportApi.PageResult<BatchImportApi.BatchItem>>(
    `/hse/batch-import/tasks/${taskId}/items`,
    { params },
  );
}

// ============================================================
// 失败重试
// ============================================================

/**
 * 单个失败项重试
 */
export function retryItem(itemId: number) {
  return requestClient.post<any>(
    `/hse/batch-import/items/${itemId}/retry`,
  );
}

/**
 * 批量重试失败项
 */
export function retryTaskFailed(taskId: number) {
  return requestClient.post<any>(
    `/hse/batch-import/tasks/${taskId}/retry`,
  );
}

// ============================================================
// 模板下载
// ============================================================

/**
 * 下载导入模板
 * [提示词-129] 修复 blob 吞错误：后端返回 JSON 错误时（Content-Type 为 json）解析错误信息并抛出
 */
export async function downloadTemplate(type: string, version = 'v1.0') {
  try {
    // responseReturn:'data' → 直接拿到 Blob
    const blob = (await requestClient.get<any>(`/hse/batch-import/templates/${type}`, {
      params: { version },
      responseType: 'blob',
    })) as unknown as Blob;

    // 检查是否为错误响应（后端返回 JSON 而非 xlsx）
    if (blob && blob.type && blob.type.includes('json')) {
      const text = await blob.text();
      const err = JSON.parse(text);
      throw new Error(err.message || '模板下载失败');
    }

    // 正常的文件下载
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hse-import-template-${type}-${version}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
    return { success: true };
  } catch (err: any) {
    throw new Error(err.message || '模板下载失败');
  }
}

// ============================================================
// 并发信息
// ============================================================

/**
 * 获取并发限制信息
 */
export function getConcurrentInfo() {
  return requestClient.get<BatchImportApi.ConcurrentInfo>(
    '/hse/batch-import/concurrent-info',
  );
}
