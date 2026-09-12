/**
 * HSE 员工公共选择 API - Sprint5.8
 *
 * 用途: 培训/保险/三违/隐患/消防等模块的员工选择器
 * 路由前缀: /hse/employee/employees/selector
 * 返回: employee_id + name + org_name + unit_name + position_name
 */

import { requestClient } from '#/api/request';

export namespace EmployeeSelectorApi {
  /** 员工选择项 */
  export interface SelectorItem {
    employee_id: number;
    employee_code?: string;
    name: string;
    gender?: string;
    org_unit_id?: number;
    org_name?: string;
    operation_unit_id?: number;
    unit_name?: string;
    position_id?: number;
    position_name?: string;
  }

  /** 查询参数 */
  export interface SelectorParams {
    keyword?: string;
    org_unit_id?: number;
    position_id?: number;
    is_driver?: boolean;
    limit?: number;
  }
}

const BASE = '/hse/employee/employees/selector';

/**
 * 员工选择列表（关键词搜索 + 组织/岗位/驾驶员筛选）
 */
export function getEmployeeSelectorList(params?: EmployeeSelectorApi.SelectorParams) {
  return requestClient.get<EmployeeSelectorApi.SelectorItem[]>(BASE, { params });
}

/**
 * @deprecated
 * 死代码：Q1 审计（P2-4）确认全仓零调用，回显已由 `getEmployeeSelectorBatch(ids)` 批量接口覆盖。
 * TODO(Phase 1): 确认无动态 import / 字符串引用后删除；当前保留以兼容可能的动态引用。
 * 单条回显请改用 `getEmployeeSelectorBatch([id])`。
 */
export function getEmployeeSelectorById(id: number) {
  return requestClient.get<EmployeeSelectorApi.SelectorItem>(`${BASE}/${id}`);
}

/**
 * 员工选择批量查询（用于批量回显）
 */
export function getEmployeeSelectorBatch(ids: number[]) {
  return requestClient.post<EmployeeSelectorApi.SelectorItem[]>(`${BASE}/batch`, { ids });
}