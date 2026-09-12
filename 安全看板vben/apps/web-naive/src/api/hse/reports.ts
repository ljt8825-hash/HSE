/**
 * 安全生产汇报中心 API（web-naive）
 *
 * 对应后端路由: server/routes/hse-report.js (V2 接口)
 * 路由前缀: /hse/report/v2
 * requestClient baseURL = /api → 完整路径 /api/hse/report/v2/...
 */
import { requestClient } from '#/api/request';

export namespace ReportsApi {
  /** 报告分类 */
  export type TemplateCategory = 'statistical' | 'monthly_report' | 'group_report';

  /** 生成状态 */
  export type GenerationStatus =
    | 'pending'
    | 'collecting'
    | 'ai_generating'
    | 'completed'
    | 'failed';

  /** AI 状态 */
  export type AiStatus = 'none' | 'pending' | 'processing' | 'completed' | 'failed';

  /** 确认状态 */
  export type ConfirmStatus = 'unconfirmed' | 'confirmed' | 'rejected';

  /** 报告状态（软删除） */
  export type ReportStatus = 'active' | 'archived' | 'deleted';

  /** 报告模板 */
  export interface ReportTemplate {
    id: number;
    templateName: string;
    reportType: string;
    templateCategory: TemplateCategory;
    aiEnabled: boolean;
    status: string;
    contentConfig?: any;
    sectionConfig?: any;
    dataSources?: string[];
  }

  /** 报告列表项 */
  export interface ReportItem {
    id: number;
    reportName: string;
    reportType: string;
    reportPeriod: string;
    reportDate: string;
    templateCategory: TemplateCategory;
    generationStatus: GenerationStatus;
    aiStatus: AiStatus;
    confirmStatus: ConfirmStatus;
    createdAt: string;
    generatedBy?: number;
  }

  /** 报告详情 */
  export interface ReportDetail {
    id: number;
    reportName: string;
    reportType: string;
    reportPeriod: string;
    reportDate: string;
    reportData: any;
    reportHtml: string;
    templateId?: number;
    templateCategory: TemplateCategory;
    reportScope?: any;
    generationStatus: GenerationStatus;
    aiStatus: AiStatus;
    aiSummary?: string;
    aiSuggestions?: string[];
    confirmStatus: ConfirmStatus;
    confirmedBy?: number;
    confirmedAt?: string;
    sourceDataRef?: any;
    errorMessage?: string;
    version: number;
    createdAt: string;
    reportStatus: ReportStatus;
  }

  /** 生成状态查询结果 */
  export interface ReportStatusResult {
    reportId: number;
    generationStatus: GenerationStatus;
    aiStatus: AiStatus;
    confirmStatus: ConfirmStatus;
    progress: number;
    currentStep: string;
    errorMessage?: string;
  }

  /** 生成参数 */
  export interface GenerateParams {
    templateId?: number;
    templateCategory: TemplateCategory;
    reportPeriod: string;
    reportScope?: any;
    aiEnabled?: boolean;
    customTitle?: string;
  }

  /** 生成结果 */
  export interface GenerateResult {
    reportId: number;
    generationStatus: GenerationStatus;
    estimatedSeconds: number;
  }

  /** 列表查询参数 */
  export interface ListParams {
    category?: TemplateCategory;
    page?: number;
    pageSize?: number;
    keyword?: string;
    status?: GenerationStatus;
    confirmStatus?: ConfirmStatus;
  }

  /** 列表结果 */
  export interface ListResult {
    list: ReportItem[];
    total: number;
    page: number;
    pageSize: number;
  }
}

/** 获取模板列表 */
export function getReportTemplates(category?: ReportsApi.TemplateCategory) {
  return requestClient.get<ReportsApi.ReportTemplate[]>(
    '/hse/report/v2/templates',
    { params: category ? { category } : undefined },
  );
}

/** 获取模板详情 */
export function getReportTemplate(id: number) {
  return requestClient.get<ReportsApi.ReportTemplate>(
    `/hse/report/v2/templates/${id}`,
  );
}

/** 触发生成报告（异步） */
export function generateReport(params: ReportsApi.GenerateParams) {
  return requestClient.post<ReportsApi.GenerateResult>(
    '/hse/report/v2/generate',
    params,
  );
}

/** 查询生成状态 */
export function getReportStatus(id: number) {
  return requestClient.get<ReportsApi.ReportStatusResult>(
    `/hse/report/v2/${id}/status`,
  );
}

/** 获取报告列表 */
export function getReportList(params: ReportsApi.ListParams) {
  return requestClient.get<ReportsApi.ListResult>(
    '/hse/report/v2/list',
    { params },
  );
}

/** 获取报告详情 */
export function getReportDetail(id: number) {
  return requestClient.get<ReportsApi.ReportDetail>(
    `/hse/report/v2/${id}`,
  );
}

/** 更新报告内容 */
export function updateReport(
  id: number,
  data: {
    reportName?: string;
    reportData?: any;
    reportHtml?: string;
    aiSummary?: string;
    aiSuggestions?: string[];
  },
) {
  return requestClient.put(`/hse/report/v2/${id}`, data);
}

/** 确认/驳回报告 */
export function confirmReport(
  id: number,
  action: 'confirmed' | 'rejected',
  remark?: string,
) {
  return requestClient.post(`/hse/report/v2/${id}/confirm`, { action, remark });
}

/** 重新生成报告 */
export function regenerateReport(id: number, aiOnly = false) {
  return requestClient.post(`/hse/report/v2/${id}/regenerate`, { aiOnly });
}

/** 归档报告 */
export function archiveReport(id: number) {
  return requestClient.post(`/hse/report/v2/${id}/archive`);
}

/** 删除报告（软删除） */
export function deleteReport(id: number) {
  return requestClient.delete(`/hse/report/${id}`);
}

/** 导出 HTML */
export function exportReportHtml(id: number): string {
  return `/api/hse/report/v2/${id}/export/html`;
}

/** 导出 Word */
export function exportReportWord(id: number): string {
  return `/api/hse/report/v2/${id}/export/word`;
}
