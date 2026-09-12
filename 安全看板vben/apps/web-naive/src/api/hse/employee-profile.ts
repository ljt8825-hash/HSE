/**
 * 员工档案中心 API（web-naive）
 *
 * 对应后端路由: server/routes/hse-employee.js (Sprint5.7 新增部分)
 * 路由前缀: /hse/employee/employees/profile
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
    dept_name?: string;
    position_id?: number;
    position_name?: string;
    position_code?: string;
    status?: string;
    hire_date?: string;
    /** 离职日期（花名册） */
    leave_date?: string;
    /** 所属部门（花名册所属部门列） */
    roster_department?: string;
    /** 职位（花名册职位列） */
    roster_position?: string;
    /** 在职区域（花名册「负责区域(在职)」列） */
    roster_work_area?: string;
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
    dept_name?: string;
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
    dept_name?: string;
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
}

const BASE = '/hse/employee/employees/profile';

/** 查询员工档案列表 */
export function getProfileList(params?: EmployeeProfileApi.ListParams) {
  return requestClient.get<{
    list: EmployeeProfileApi.ProfileListItem[];
    total: number;
    page: number;
    pageSize: number;
  }>(`${BASE}/list`, { params });
}

/** 查询员工档案详情 */
export function getProfileDetail(id: number) {
  return requestClient.get<EmployeeProfileApi.ProfileDetail>(`${BASE}/${id}`);
}

/** 查询员工任职历史 */
export function getProfileAssignments(id: number) {
  return requestClient.get<EmployeeProfileApi.AssignmentItem[]>(
    `${BASE}/${id}/assignments`,
  );
}

/** 查询员工驾驶证信息 */
export function getProfileDriverInfo(id: number) {
  return requestClient.get<EmployeeProfileApi.DriverInfo>(
    `${BASE}/${id}/driver-info`,
  );
}

/** 花名册名单版本号（前端本地缓存比对：仅花名册导入后版本变化才重新加载名单）
 * scope=driver：驾驶员工种名单；scope=all：全部在职员工名单 */
export function getRosterVersion(scope: 'driver' | 'all' = 'driver') {
  return requestClient.get<{ version: string; count: number; updatedAt: string | null }>(
    `${BASE}/roster-version?scope=${scope}`,
  );
}

/* ============ 花名册名单本地缓存通用工具（drivers?scope 版本比对） ============ */
const ROSTER_CACHE_PREFIX = 'dw_roster_cache_';
function readRosterCache<T>(key: string): { version: string; data: T } | null {
  try {
    const raw = localStorage.getItem(ROSTER_CACHE_PREFIX + key);
    if (!raw) return null;
    const val = JSON.parse(raw) as { version: string; data: T };
    return val && val.version ? val : null;
  } catch {
    return null;
  }
}
function writeRosterCache<T>(key: string, version: string, data: T) {
  try {
    localStorage.setItem(ROSTER_CACHE_PREFIX + key, JSON.stringify({ version, data }));
  } catch {
    /* 隐私模式/容量不足时静默忽略，退化为每次拉取 */
  }
}
/**
 * 按花名册名单版本比对加载缓存：版本未变 → 返回本地缓存；版本变化（即新导入花名册）→
 * 调用 fetcher 重新拉取并回写缓存。版本接口或取数失败时回退本地缓存。
 */
export async function withRosterCache<T>(
  key: string,
  scope: 'driver' | 'all',
  fetcher: () => Promise<T>,
): Promise<T> {
  try {
    const ver = await getRosterVersion(scope);
    const cached = readRosterCache<T>(key);
    if (cached && cached.version === ver.version) return cached.data;
    const data = await fetcher();
    writeRosterCache(key, ver.version, data);
    return data;
  } catch {
    const cached = readRosterCache<T>(key);
    if (cached) return cached.data;
    return fetcher();
  }
}
