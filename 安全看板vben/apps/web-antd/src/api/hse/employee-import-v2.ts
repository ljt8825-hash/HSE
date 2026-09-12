/**
 * HSE 员工花名册导入 V2 API - Sprint5.6.5
 *
 * 对应后端路由: server/routes/hse-employee-import-v2.js
 * 路由前缀: /hse/employee-import/v2
 * 复用: #/api/request 的 requestClient
 */

import { requestClient } from '#/api/request';

export namespace EmployeeImportV2Api {
  /** 批次状态 */
  export type BatchStatus =
    | 'uploaded'
    | 'parsing'
    | 'pending_review'
    | 'completed'
    | 'partial_completed'
    | 'failed';

  /** pending 状态 */
  export type PendingStatus = 'pending' | 'approved' | 'rejected' | 'imported';

  /** 异常类型 */
  export type PendingType =
    | 'missing_field'
    | 'unknown_dept'
    | 'unknown_position'
    | 'id_card_conflict'
    | 'phone_conflict'
    | 'auto_matched';

  /** 导入批次 */
  export interface ImportBatch {
    id: number;
    batch_no: string;
    file_name: string;
    rule_version: string;
    total_count: number;
    success_count: number;
    pending_count: number;
    skipped_count: number;
    status: BatchStatus;
    uploaded_by?: string;
    uploaded_at?: string;
    completed_at?: string;
    operator?: string;
    import_source?: string;
    client_ip?: string;
    created_at: string;
  }

  /** 待确认记录 */
  export interface ImportPending {
    id: number;
    batch_id: number;
    row_num: number;
    employee_no?: string;
    employee_name?: string;
    raw_dept?: string;
    raw_position?: string;
    raw_team?: string;
    hire_date?: string;
    is_driver?: boolean;
    license_type?: string;
    pending_type: PendingType;
    pending_desc?: string;
    resolution?: string;
    resolved_by?: string;
    resolved_at?: string;
    target_org_id?: number;
    target_unit_id?: number;
    target_pos_id?: number;
    id_card_hash?: string;
    phone_hash?: string;
    rule_version?: string;
    status: PendingStatus;
    created_at: string;
  }

  /** 上传响应 */
  export interface UploadResult {
    batchId: number;
    batchNo: string;
    fileName: string;
    totalRows: number;
    successCount: number;
    pendingCount: number;
    skippedCount: number;
    ruleVersion: string;
    preview: any[];
  }

  /** 预览响应 */
  export interface PreviewResult {
    batch: ImportBatch;
    pendingList: ImportPending[];
  }

  /** 入库响应 */
  export interface ImportResult {
    batchId: number;
    total: number;
    insertedCount: number;
    updatedCount: number;
    assignmentCount: number;
    failedCount: number;
    errors: string[];
  }

  /** 分页结果 */
  export interface PageResult<T> {
    list: T[];
    total: number;
    page: number;
    pageSize: number;
  }
}

const BASE = '/hse/employee-import/v2';

// ============================================================
// 批次管理
// ============================================================

/** 上传员工花名册 Excel */
export function uploadEmployeeRoster(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return requestClient.post<EmployeeImportV2Api.UploadResult>(
    `${BASE}/upload`,
    formData,
    { headers: { 'Content-Type': undefined as any } },
  );
}

/** 查询导入批次列表 */
export function getImportBatchList(params?: {
  page?: number;
  pageSize?: number;
  status?: string;
}) {
  return requestClient.get<EmployeeImportV2Api.PageResult<EmployeeImportV2Api.ImportBatch>>(
    `${BASE}/batches`,
    { params },
  );
}

/** 查询批次预览 */
export function getBatchPreview(batchId: number) {
  return requestClient.get<EmployeeImportV2Api.PreviewResult>(
    `${BASE}/batch/${batchId}/preview`,
  );
}

/** 查询批次的待确认记录 */
export function getBatchPendingList(
  batchId: number,
  params?: { status?: string; pending_type?: string },
) {
  return requestClient.get<EmployeeImportV2Api.ImportPending[]>(
    `${BASE}/batch/${batchId}/pending`,
    { params },
  );
}

// ============================================================
// 审核
// ============================================================

/** 审核单条待确认记录 */
export function resolvePending(
  id: number,
  data: {
    resolution: 'approved' | 'rejected';
    target_org_id?: number;
    target_unit_id?: number;
    target_pos_id?: number;
    remark?: string;
  },
) {
  return requestClient.post(`${BASE}/pending/${id}/resolve`, data);
}

// ============================================================
// 入库
// ============================================================

/** 正式入库 */
export function executeImport(batchId: number) {
  return requestClient.post<EmployeeImportV2Api.ImportResult>(
    `${BASE}/batch/${batchId}/import`,
  );
}

// ============================================================
// 删除 / 清空
// ============================================================

/** 删除导入批次 */
export function deleteImportBatch(batchId: number | string) {
  return requestClient.delete(`${BASE}/batch/${batchId}`);
}

/** 清空所有人员信息（危险操作） */
export function clearAllEmployees() {
  return requestClient.post(`${BASE}/clear-all`);
}

/** 级联清空预检查：返回将被清除的各层数据行数（只读） */
export function getClearAllPreview() {
  return requestClient.get(`${BASE}/clear-all-preview`);
}

/** 级联清空所有人员信息（含业务引用数据，危险操作，不可逆） */
export function clearAllCascade() {
  return requestClient.post(`${BASE}/clear-all-cascade`);
}
