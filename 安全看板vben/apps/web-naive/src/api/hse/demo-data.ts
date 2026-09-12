/**
 * 演示数据管理 API（web-naive）
 *
 * 对应后端路由: /demo-data
 */
import { requestClient } from '#/api/request';

export namespace DemoDataApi {
  export interface DemoDataStatus {
    active: boolean;
    totalDemo: number;
    stats: Array<{ key: string; label: string; count: number }>;
  }

  export interface DemoDataResult {
    msg?: string;
    success?: boolean;
  }
}

export async function getDemoDataStatus() {
  return requestClient.get<DemoDataApi.DemoDataStatus>('/demo-data/status');
}

export async function generateDemoData(count = 50) {
  return requestClient.post<DemoDataApi.DemoDataResult>('/demo-data/generate', { count });
}

export async function clearDemoData() {
  return requestClient.post<DemoDataApi.DemoDataResult>('/demo-data/clear');
}
