/**
 * HSE 业务帮助中心 API - Step1
 *
 * 对应后端路由: server/routes/hse-business-help.js
 * 路由前缀: /hse/business-help
 * 复用: #/api/request 的 requestClient
 */

import { requestClient } from '#/api/request';

const BASE = '/hse/business-help';

export namespace HelpCenterApi {
  export interface HelpContent {
    id: number;
    menuCode: string;
    title: string;
    content: string;
    fieldDescription: string;
    calculateRule: string;
    generateRule: string;
    relationRule: string;
    permissionRule: string;
    version: string;
    status: number;
    sortOrder: number;
    createdAt: string;
    updatedAt: string;
  }

  export interface HelpListParams {
    menuCode?: string;
    keyword?: string;
    status?: number;
  }

  export interface HelpListData {
    list: HelpContent[];
    total: number;
  }
}

export function getHelpContent(menuCode: string) {
  return requestClient.get<HelpCenterApi.HelpContent>(`${BASE}/${menuCode}`);
}

export function getHelpList(params?: HelpCenterApi.HelpListParams) {
  return requestClient.get<HelpCenterApi.HelpListData>(`${BASE}/list`, { params });
}
