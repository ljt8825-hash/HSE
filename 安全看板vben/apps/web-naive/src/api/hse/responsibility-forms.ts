/**
 * HSE 责任书管理 API 适配层（web-naive）
 * 契约来源：server/routes/hse-responsibility-forms.js（唯一契约来源）。
 * 端点：/hse/responsibility-forms（服务端挂载于 /api/hse/responsibility-forms）。
 * 全量使用 requestClient（JSON）。字段为后端 camelCase 风格。
 */
import { requestClient } from '#/api/request';

const BASE = '/hse/responsibility-forms';

export namespace ResponsibilityFormApi {
  export interface ResponsibilityForm {
    id: number;
    formCode: string;
    formType: string;
    year: number;
    employeeId: number;
    employeeCode: string;
    employeeName: string;
    position: string;
    township: string;
    department: string;
    signStatus: 'unsigned' | 'signed';
    signDate: string;
    remark: string;
    createdAt: string;
    updatedAt: string;
  }

  export interface Stats {
    total: number;
    signed: number;
    unsigned: number;
    unsignedEmployees: number;
  }

  export interface ListResult {
    list: ResponsibilityForm[];
    total: number;
    page: number;
    size: number;
  }

  export interface ListParams {
    page?: number;
    size?: number;
    year?: number;
    sign_status?: string;
    form_type?: string;
    township?: string;
    employee_id?: number;
    keyword?: string;
  }

  export interface CreateItem {
    employeeId: number;
    employeeName?: string;
    employeeCode?: string;
    formType?: string;
    year?: number;
    signStatus?: 'unsigned' | 'signed';
    township?: string;
    department?: string;
    position?: string;
    remark?: string;
  }
}

export function getResponsibilityFormList(params: ResponsibilityFormApi.ListParams) {
  return requestClient.get<ResponsibilityFormApi.ListResult>(`${BASE}`, { params });
}

export function getResponsibilityFormStats(params?: { year?: number }) {
  return requestClient.get<ResponsibilityFormApi.Stats>(`${BASE}/stats`, { params });
}

export function createResponsibilityForms(items: ResponsibilityFormApi.CreateItem | ResponsibilityFormApi.CreateItem[]) {
  return requestClient.post<ResponsibilityFormApi.ResponsibilityForm[]>(`${BASE}`, items);
}

export function signResponsibilityForm(id: number) {
  return requestClient.put<ResponsibilityFormApi.ResponsibilityForm>(`${BASE}/${id}/sign`);
}

export function updateResponsibilityForm(id: number, payload: Partial<ResponsibilityFormApi.ResponsibilityForm>) {
  return requestClient.put<ResponsibilityFormApi.ResponsibilityForm>(`${BASE}/${id}`, payload);
}

export function deleteResponsibilityForm(id: number) {
  return requestClient.delete<void>(`${BASE}/${id}`);
}