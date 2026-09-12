/**
 * HSE 员工档案中心 API - Sprint5.7
 *
 * 对应后端路由: server/routes/hse-employee.js (Sprint5.7 新增部分)
 * 路由前缀: /hse/employee/employees/profile
 * 复用: #/api/request 的 requestClient
 */

import { requestClient } from '#/api/request';

export namespace EmployeeProfileApi {
  /** 员工档案列表项 */
  export interface ProfileListItem {
    id: number;
    employee_code?: string;
    name: string;
    gender?: string;
    age?: number;
    org_unit_id?: number;
    org_name?: string;
    org_type?: string;
    org_code?: string;
    operation_unit_id?: number;
    unit_name?: string;
    unit_type?: string;
    position_id?: number;
    position_name?: string;
    position_code?: string;
    status?: string;
    hire_date?: string;
    phone?: string;
    id_card?: string;
    is_driver?: boolean;
  }

  /** 员工基础信息 */
  export interface BasicInfo {
    id: number;
    employee_code?: string;
    name: string;
    gender?: string;
    birth_date?: string;
    phone?: string;
    id_card?: string;
    person_type?: string;
    person_category?: string;
    is_public_welfare?: boolean;
    status?: string;
    age?: number;
    created_at?: string;
    updated_at?: string;
  }

  /** 当前组织信息 */
  export interface CurrentOrg {
    org_unit_id?: number;
    org_name?: string;
    org_type?: string;
    org_code?: string;
    org_path?: string;
    operation_unit_id?: number;
    unit_name?: string;
    unit_type?: string;
    unit_code?: string;
    position_id?: number;
    position_name?: string;
    position_code?: string;
    risk_level?: string;
    supervisor_id?: number;
    supervisor_name?: string;
    assignment_status?: string;
    start_date?: string;
    end_date?: string;
  }

  /** 员工档案详情 */
  export interface ProfileDetail {
    basic: BasicInfo;
    currentOrg: CurrentOrg | null;
  }

  /** 任职历史项 */
  export interface AssignmentItem {
    id: number;
    org_unit_id?: number;
    operation_unit_id?: number;
    position_id?: number;
    is_primary?: boolean;
    is_current?: boolean;
    status?: string;
    start_date?: string;
    end_date?: string;
    remark?: string;
    org_name?: string;
    org_code?: string;
    unit_name?: string;
    unit_type?: string;
    position_name?: string;
    position_code?: string;
    supervisor_name?: string;
  }

  /** 驾驶员信息 */
  export interface DriverInfo {
    is_driver: boolean;
    license_type?: string;
  }

  /** 列表查询参数 */
  export interface ListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    org_unit_id?: number;
    position_id?: number;
    is_driver?: boolean;
    status?: string;
  }

  /** 分页结果 */
  export interface PageResult<T> {
    list: T[];
    total: number;
    page: number;
    pageSize: number;
  }
}

const BASE = '/hse/employee/employees/profile';

// ============================================================
// 档案列表
// ============================================================

/** 查询员工档案列表 */
export function getProfileList(params?: EmployeeProfileApi.ListParams) {
  return requestClient.get<EmployeeProfileApi.PageResult<EmployeeProfileApi.ProfileListItem>>(
    `${BASE}/list`,
    { params },
  );
}

/** 查询员工档案详情 */
export function getProfileDetail(id: number) {
  return requestClient.get<EmployeeProfileApi.ProfileDetail>(
    `${BASE}/${id}`,
  );
}

// ============================================================
// 任职历史
// ============================================================

/** 查询员工任职历史 */
export function getProfileAssignments(id: number) {
  return requestClient.get<EmployeeProfileApi.AssignmentItem[]>(
    `${BASE}/${id}/assignments`,
  );
}

// ============================================================
// 驾驶员信息
// ============================================================

/** 查询员工驾驶员信息 */
export function getProfileDriverInfo(id: number) {
  return requestClient.get<EmployeeProfileApi.DriverInfo>(
    `${BASE}/${id}/driver-info`,
  );
}
