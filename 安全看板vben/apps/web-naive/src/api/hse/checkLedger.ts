/**
 * 补充台账 API 适配层（转运站管理 / 车辆三检）
 *
 * 契约来源：server/controllers/checkLedgerFactory.js（独立 controller 工厂），
 * 挂载于 transfer-stations 与 vehicle-checks。
 *
 * 约定（与后端工厂一致）：
 *  - 列表 / 详情返回 DB 行（snake_case，如 station_code）。
 *  - 提交（create/update）接受 camelCase payload（stationCode 等，经工厂 createCols 白名单映射）。
 *  - 导入为两段式：preview 上传解析得 jobId → confirm 按 jobId 落库。
 */
import { requestClient } from '#/api/request';

export namespace CheckLedgerApi {
  /** 转运站台账行（DB snake_case） */
  export interface TransferStationRow {
    id: number;
    station_code: string;
    station_name: string;
    area_team: string | null;
    check_date: string | null;
    ledger_management: number;
    sign_management: number;
    electricity_safety: number;
    fire_management: number;
    item_placement: number;
    remark: string | null;
    created_by: number | null;
    created_by_name: string | null;
    created_at: string;
    updated_at: string;
  }

  /** 转运站台账提交载荷（camelCase） */
  export interface TransferStationPayload {
    stationCode?: string;
    stationName?: string;
    areaTeam?: string;
    checkDate?: string | null;
    ledgerManagement?: number;
    signManagement?: number;
    electricitySafety?: number;
    fireManagement?: number;
    itemPlacement?: number;
    remark?: string;
  }

  /** 车辆三检台账行（DB snake_case） */
  export interface VehicleCheckRow {
    id: number;
    plate: string;
    vin: string | null;
    driver: string | null;
    department: string | null;
    check_date: string | null;
    inspection_type: string | null;
    status: string | null;
    record_quality: string | null;
    abnormal_plate: number;
    abnormal_turn_light: number;
    abnormal_gps: number;
    abnormal_parking: number;
    abnormal_camera: number;
    fire_check_status: string | null;
    fire_unchecked: number;
    fire_expired_not_reported: number;
    fire_lost: number;
    remark: string | null;
    created_by: number | null;
    created_by_name: string | null;
    created_at: string;
    updated_at: string;
  }

  /** 车辆三检台账提交载荷（camelCase） */
  export interface VehicleCheckPayload {
    plate?: string;
    vin?: string;
    driver?: string;
    department?: string;
    checkDate?: string | null;
    inspectionType?: string;
    status?: string;
    recordQuality?: string;
    abnormalPlate?: number;
    abnormalTurnLight?: number;
    abnormalGps?: number;
    abnormalParking?: number;
    abnormalCamera?: number;
    fireCheckStatus?: string;
    fireUnchecked?: number;
    fireExpiredNotReported?: number;
    fireLost?: number;
    remark?: string;
  }

  /** 转运站列表筛选 */
  export interface TransferStationListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    stationCode?: string;
    areaTeam?: string;
  }

  /** 车辆三检列表筛选 */
  export interface VehicleCheckListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    inspectionType?: string;
    status?: string;
    recordQuality?: string;
    fireCheckStatus?: string;
  }

  /** 分页响应 */
  export interface PageResult<T> {
    list: T[];
    total: number;
    page: number;
    pageSize: number;
  }

  /** 导入预览（两段式第一步） */
  export interface ImportPreviewResult {
    jobId?: string;
    totalRows: number;
    validRows: number;
    invalidRows: number;
    columns: Array<{ title: string; field: string }>;
    preview: Array<{ rowIndex: number; data: Record<string, any>; errors: string[] }>;
  }

  /** 导入确认（两段式第二步） */
  export interface ImportConfirmResult {
    inserted: number;
    skipped: number;
    outcome: 'imported' | 'failed';
  }
}

// ===================== 转运站管理 =====================

export async function getTransferStationList(params: CheckLedgerApi.TransferStationListParams) {
  return requestClient.get<CheckLedgerApi.PageResult<CheckLedgerApi.TransferStationRow>>(
    'transfer-stations',
    { params },
  );
}

export async function createTransferStation(data: CheckLedgerApi.TransferStationPayload) {
  return requestClient.post<CheckLedgerApi.TransferStationRow>('transfer-stations', data);
}

export async function updateTransferStation(id: number, data: CheckLedgerApi.TransferStationPayload) {
  return requestClient.put<CheckLedgerApi.TransferStationRow>(`transfer-stations/${id}`, data);
}

export async function deleteTransferStation(id: number) {
  return requestClient.delete(`transfer-stations/${id}`);
}

export async function deleteTransferStations(ids: number[]) {
  return requestClient.delete<{ deleted: number }>('transfer-stations/batch', { data: { ids } });
}

export async function getTransferStationTemplate() {
  return requestClient.download('transfer-stations/template');
}

export async function previewTransferStationImport(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return requestClient.post<CheckLedgerApi.ImportPreviewResult>('transfer-stations/import-preview', formData, {
    headers: { 'Content-Type': undefined as any },
  });
}

export async function confirmTransferStationImport(jobId: string) {
  return requestClient.post<CheckLedgerApi.ImportConfirmResult>('transfer-stations/import-confirm', { jobId });
}

export async function exportTransferStations(params: CheckLedgerApi.TransferStationListParams) {
  return requestClient.download('transfer-stations/export', { params });
}

/**
 * 空月份延续上月生成空页（幂等，仅 ≥2026-08 生效）：
 * 切到尚无台账的目标月时，把上月站点身份复制成本月空页（考核数值默认0），供人工在系统里录入*/
export async function continueTransferStations(payload: { month: string }) {
  return requestClient.post<{
    month: string;
    sourceMonth: string | null;
    generated: boolean;
    existing: number;
    inserted: number;
  }>('transfer-stations/continue', payload);
}

// ===================== 车辆三检 =====================

export async function getVehicleCheckList(params: CheckLedgerApi.VehicleCheckListParams) {
  return requestClient.get<CheckLedgerApi.PageResult<CheckLedgerApi.VehicleCheckRow>>(
    'vehicle-checks',
    { params },
  );
}

export async function createVehicleCheck(data: CheckLedgerApi.VehicleCheckPayload) {
  return requestClient.post<CheckLedgerApi.VehicleCheckRow>('vehicle-checks', data);
}

export async function updateVehicleCheck(id: number, data: CheckLedgerApi.VehicleCheckPayload) {
  return requestClient.put<CheckLedgerApi.VehicleCheckRow>(`vehicle-checks/${id}`, data);
}

export async function deleteVehicleCheck(id: number) {
  return requestClient.delete(`vehicle-checks/${id}`);
}

export async function deleteVehicleChecks(ids: number[]) {
  return requestClient.delete<{ deleted: number }>('vehicle-checks/batch', { data: { ids } });
}

export async function getVehicleCheckTemplate() {
  return requestClient.download('vehicle-checks/template');
}

export async function previewVehicleCheckImport(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return requestClient.post<CheckLedgerApi.ImportPreviewResult>('vehicle-checks/import-preview', formData, {
    headers: { 'Content-Type': undefined as any },
  });
}

export async function confirmVehicleCheckImport(jobId: string) {
  return requestClient.post<CheckLedgerApi.ImportConfirmResult>('vehicle-checks/import-confirm', { jobId });
}

export async function exportVehicleChecks(params: CheckLedgerApi.VehicleCheckListParams) {
  return requestClient.download('vehicle-checks/export', { params });
}