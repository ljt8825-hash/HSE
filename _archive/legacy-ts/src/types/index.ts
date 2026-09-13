/**
 * HSE 安全管理系统 — 共享类型定义
 * 文件: src/types/index.ts
 */

import { Request } from 'express';
import { Pool, QueryResult, PoolClient } from 'pg';

// ============================================================
// API 统一响应
// ============================================================

export interface ApiResponse<T = any> {
  code: number;
  success: boolean;
  message: string;
  data: T | null;
}

export type SuccessResponse<T = any> = ApiResponse<T> & { success: true };
export type ErrorResponse = ApiResponse<null> & { success: false };

// ============================================================
// 数据库相关
// ============================================================

export interface DbConfig {
  host: string;
  port: number;
  user: string;
  database: string;
  password?: string;
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
}

export type { Pool, QueryResult, PoolClient };

// ============================================================
// 车辆管理
// ============================================================

export interface Vehicle {
  id: number;
  plate: string;
  vin: string | null;
  engine_no: string | null;
  reg_date: string | null;
  model: string | null;
  owner: string | null;
  insurance_type: string | null;
  insurance_start: string | null;
  insurance_end: string | null;
  premium: number;
  vehicle_type: string | null;
  status: string;
  remark: string | null;
  is_deleted?: boolean | number;
  created_at?: string;
  updated_at?: string;
  days_to_expire?: number;
  history?: InsuranceHistory[];
}

export interface InsuranceHistory {
  id: number;
  vehicle_id: number;
  plate: string;
  insurance_type: string | null;
  start_date: string | null;
  end_date: string | null;
  premium: number;
  is_current: boolean;
  policy_no?: string | null;
  insurer?: string | null;
  remark?: string | null;
  is_deleted?: boolean;
  created_at?: string;
}

export interface VehicleListQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  insuranceType?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: string;
  expiringDays?: string;
}

export interface VehicleListResult {
  list: Vehicle[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ExpiringResult {
  list: (Vehicle & { days_to_expire: number; alert_level: string })[];
  total: number;
  expiredCount: number;
  expiringCount: number;
  days: number;
}

export interface ImportResult {
  total: number;
  successCount: number;
  failCount: number;
  failList: { row: number; reason: string }[];
}

// ============================================================
// 文件记录
// ============================================================

export interface FileRecord {
  id: number;
  filename: string;
  original_name: string;
  file_type: string;
  size: number;
  mimetype: string;
  module: string;
  uploaded_by: string;
  user_id: string;
  record_id: string;
  extra_info: string;
  filepath: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  // 智能导入增强字段
  module_type?: string;
  data_period?: string;
  file_hash?: string;
  status?: string;
  import_job_id?: string;
}

export interface FileRecordListQuery {
  search?: string;
  type?: string;
  module?: string;
  sort?: string;
  page?: string;
  limit?: string;
}

// ============================================================
// 智能导入
// ============================================================

export interface ParseResult {
  success: boolean;
  module_type?: string;
  module_name?: string;
  data_period?: string;
  target_table?: string;
  file_hash?: string;
  total_rows?: number;
  matched_columns?: Record<string, string>;
  unmatched_excel_columns?: string[];
  conflict_keys?: string[];
  preview?: ConflictStats;
  sample_data?: Record<string, any>[];
  errors?: string[];
  error?: string;
}

export interface ConfirmResult {
  success: boolean;
  job_id?: string;
  log_id?: number;
  table_name?: string;
  total_rows?: number;
  inserted?: number;
  updated?: number;
  skipped?: number;
  errors?: { row: number; error: string }[];
  error?: string;
  traceback?: string;
}

export interface RollbackResult {
  success: boolean;
  job_id?: string;
  deleted_rows?: number;
  table_name?: string;
  error?: string;
}

export interface ConflictStats {
  inserted: number;
  updated: number;
  skipped: number;
}

export interface ImportLog {
  id: number;
  file_record_id: number;
  job_id: string;
  module_type: string;
  data_period: string;
  target_table: string;
  status: string;
  total_rows?: number;
  inserted_rows?: number;
  updated_rows?: number;
  skipped_rows?: number;
  error_count?: number;
  error_details?: string;
  started_at: string;
  finished_at?: string;
  operator: string;
  original_name?: string;
  file_type?: string;
  size?: number;
}

export interface FieldMappingConfig {
  id: number;
  module_type: string;
  table_name: string;
  file_pattern: string;
  column_mapping: Record<string, string>;
  conflict_keys: string[];
  data_cleaning_rules: Record<string, string>;
  header_row: number;
  is_active: boolean;
}

// ============================================================
// 风险管控
// ============================================================

export interface RiskRecord {
  id: string;
  level?: string;
  type?: string;
  area?: string;
  [key: string]: any;
  createdAt: string;
  updatedAt: string;
}

export interface RiskStats {
  total: number;
  byLevel: Record<string, number>;
  byType: Record<string, number>;
  byArea: Record<string, number>;
}

// ============================================================
// 上传配置
// ============================================================

export type UploadType = 'excel' | 'image' | 'document' | 'insurance' | 'all';

export interface UploadTypeConfig {
  mimes: string[] | null;
  exts: string[] | null;
}

export interface UploadConfig {
  baseDir: string;
  maxSize: number;
  types: Record<UploadType, UploadTypeConfig>;
}

export interface CreateUploaderOptions {
  type?: UploadType;
  subDir?: string;
  maxSize?: number;
  fieldName?: string;
  multiple?: boolean;
  maxCount?: number;
}

export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer?: Buffer;
}

export interface ValidateResult {
  valid: boolean;
  error?: string;
}

export interface UploaderInstance {
  single: (field?: string) => any;
  array: (field?: string, count?: number) => any;
  fields: (fields: any[]) => any;
  any: () => any;
  _multer: any;
}

// ============================================================
// Excel 工具
// ============================================================

export type FieldType = 'string' | 'number' | 'int' | 'date' | 'uppercase';

export interface FieldConfig {
  type: FieldType;
  required?: boolean;
}

export interface ExcelColumn {
  key: string;
  header?: string;
  label?: string;
  field?: string;
  type?: 'date' | 'money';
  width?: number;
  formatter?: (val: any, item?: any) => any;
}

export interface ReadExcelResult {
  headers: string[];
  rows: Record<string, any>[];
  sheetName: string;
  sheetCount?: number;
  totalRows: number;
}

export interface CleanRowResult {
  valid: boolean;
  data?: Record<string, any>;
  error?: string;
}

export interface ProcessImportOptions {
  filePath: string;
  aliasMap: Record<string, string[]>;
  fieldsConfig?: Record<string, FieldConfig>;
  uniqueKey?: string | null;
  onEachRow?: ((data: Record<string, any>, ctx: { rowNum: number; mapping: Record<string, string>; transaction?: PoolClient | null }) => Promise<void>) | null;
  onConflict?: ((data: Record<string, any>, existing: Record<string, any>) => Promise<void>) | null;
  transaction?: PoolClient | null;
}

// ============================================================
// Express 扩展 — multer 已提供 req.file / req.files 类型
// 这里仅补充 UploadedFile 接口供业务代码使用
// ============================================================

export interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer?: Buffer;
}

// ============================================================
// 工具函数类型
// ============================================================

export type AsyncRequestHandler = (req: Request, res: any, next: any) => Promise<void>;
export type RequestHandler = (req: Request, res: any, next: any) => void;
