/**
 * HSE 人员主数据中心 API - Sprint5.1
 *
 * 对应后端路由: server/routes/hse-employee.js
 * 路由前缀: /hse/employee
 * 复用: #/api/request 的 requestClient
 */

import { requestClient } from '#/api/request';

export namespace EmployeeApi {
  /** 人员类型（v1.2: 不含驾驶员） */
  export type PersonType = '生产人员' | '管理人员' | '技术人员' | '辅助人员';

  /** 人员分类 */
  export type PersonCategory = '适龄人员' | '超龄人员';

  /** 组织状态（生命周期）。后端实际返回英文枚举：employeeService 将 employment_relation IN ('辞职','死亡') 映射为 'left'，否则取 employee_assignment.status（active/inactive 等）。 */
  export type OrgStatus = 'active' | 'left' | 'pending' | 'retired' | 'rehire';

  /** 员工列表项 */
  export interface EmployeeItem {
    id: number;
    employee_code?: string;
    id_card?: string;
    name: string;
    gender?: string;
    birth_date?: string;
    age?: number;
    phone?: string;
    id_address?: string;
    person_category?: PersonCategory;
    person_type?: PersonType;
    is_public_welfare?: boolean;
    org_id?: number;
    org_path?: string;
    /** 提示词-60：是否驾驶员（由 position_name 派生） */
    is_driver?: boolean;
    position_id?: number;
    position_name?: string;
    org_status?: OrgStatus;
    /** 提示词-92 任务3：直接上级员工ID */
    supervisor_id?: number;
    /** 提示词-92 任务3：直接上级姓名 */
    supervisor_name?: string;
    start_date?: string;
    dept_name?: string;
    created_at?: string;
    updated_at?: string;
  }

  /** 员工详情（含组织关系） */
  export interface EmployeeDetail extends EmployeeItem {
    org?: {
      id: number;
      org_path?: string;
      position_id?: number;
      position_name?: string;
      start_date?: string;
      status?: OrgStatus;
      supervisor_id?: number;
      group_id?: number;
      group_name?: string;
      region_id?: number;
      region_name?: string;
      enterprise_id?: number;
      enterprise_name?: string;
      project_id?: number;
      project_name?: string;
      team_id?: number;
      team_name?: string;
    } | null;
  }

  /** 员工列表查询参数 */
  export interface EmployeeListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    personType?: PersonType;
    personCategory?: PersonCategory;
    status?: OrgStatus;
    gender?: string;
    deptName?: string;
    positionName?: string;
  }

  /** 员工表单数据 */
  export interface EmployeeFormData {
    employee_code?: string;
    id_card?: string;
    name: string;
    gender?: string;
    birth_date?: string;
    phone?: string;
    id_address?: string;
    person_category?: PersonCategory;
    person_type?: PersonType;
    is_public_welfare?: boolean;
  }

  /** 员工统计 */
  export interface EmployeeStats {
    total: number;
    byPersonType: Array<{ person_type: string; count: number }>;
    byPersonCategory: Array<{ person_category: string; count: number }>;
    byOrgStatus: Array<{ status: string; count: number }>;
  }

  /** 部门节点（树形） */
  export interface DeptNode {
    id: number;
    dept_code: string;
    name: string;
    short_name?: string;
    parent_id?: number | null;
    level?: number;
    path?: string;
    township?: string;
    manager_id?: number;
    safety_manager_id?: number;
    headcount?: number;
    sort_order?: number;
    status?: string;
    description?: string;
    /** 组织类型：company / department / center / town_center / team */
    org_type?: string;
    /** 实际人数 */
    employee_count?: number;
    /** 实际人数（兼容旧字段名） */
    actual_headcount?: number;
    /** 人数是否为近似值（班组均分） */
    employee_count_approximate?: boolean;
    /** 直接上级姓名（从 employee_assignment 查询） */
    supervisor_name?: string;
    /** hse_org_unit 原始 ID（用于 /departments/:id/employees 映射） */
    org_unit_id?: number | string;
    children?: DeptNode[];
  }

  /** 部门表单数据 */
  export interface DeptFormData {
    dept_code: string;
    name: string;
    short_name?: string;
    parent_id?: number | null;
    level?: number;
    township?: string;
    manager_id?: number;
    safety_manager_id?: number;
    headcount?: number;
    sort_order?: number;
    status?: string;
    description?: string;
  }

  /** 岗位项 */
  export interface PositionItem {
    id: number;
    position_code: string;
    name: string;
    dept_id?: number;
    dept_name?: string;
    job_category?: string;
    is_special_post?: boolean;
    is_safety_critical?: boolean;
    safety_duties?: string;
    sort_order?: number;
    status?: string;
  }

  /** 岗位表单数据 */
  export interface PositionFormData {
    position_code: string;
    name: string;
    dept_id?: number;
    job_category?: string;
    is_special_post?: boolean;
    is_safety_critical?: boolean;
    safety_duties?: string;
    sort_order?: number;
    status?: string;
  }

  /** 调岗表单数据 */
  export interface OrgAssignFormData {
    employee_id: number;
    group_id?: number;
    region_id?: number;
    enterprise_id?: number;
    project_id?: number;
    team_id?: number;
    position_id?: number;
    start_date: string;
    supervisor_id?: number;
    change_reason?: string;
    remark?: string;
  }

  /** 组织关系历史项 */
  export interface OrgHistoryItem {
    id: number;
    org_path?: string;
    position_id?: number;
    position_name?: string;
    start_date: string;
    end_date?: string;
    status?: OrgStatus;
    is_current?: boolean;
    change_reason?: string;
    event_type?: string;
    event_date?: string;
    before_status?: string;
    after_status?: string;
    approval_no?: string;
    remark?: string;
  }

  /** 人事变动历史项 */
  export interface HistoryItem {
    id: number;
    employee_id: number;
    event_type: string;
    event_date: string;
    before_dept_id?: number;
    after_dept_id?: number;
    before_dept_name?: string;
    after_dept_name?: string;
    before_position_id?: number;
    after_position_id?: number;
    before_position_name?: string;
    after_position_name?: string;
    before_status?: string;
    after_status?: string;
    approver_id?: number;
    approver_name?: string;
    approve_date?: string;
    approval_no?: string;
    remark?: string;
    created_at?: string;
  }

  /** 导入结果 */
  export interface ImportResult {
    total: number;
    success: number;
    failed: number;
    errors: Array<{ index: number; message: string }>;
  }

  /** Excel 预览结果（Sprint5.1.1） */
  export interface ExcelPreviewResult {
    fileName: string;
    sheetName: string;
    totalRows: number;
    validRows: number;
    invalidRows: number;
    errors: string[];
    preview: Array<EmployeeFormData & { __rowIndex?: number }>;
  }

  /** 员工主档案响应（R1-Phase1 收尾 · 提示词-40 任务 C） */
  export interface EmployeeProfileResponse {
    id: number;
    employeeCode: string;
    name: string;
    gender: string;
    age: number | null;
    idCard: string;
    phone: string;
    hireDate: string | null;
    status: string;
    orgUnitId: number | null;
    orgName: string | null;
    orgType: string | null;
    positionId: number | null;
    positionName: string | null;
    operationUnitId: number | null;
    unitName: string | null;
    isDriver: boolean;
    stats: {
      hazardCount: number;
      accidentCount: number;
      emergencyPlanCount: number;
      trainingCount: number;
      violationCount: number;
    };
  }

  /** 关联业务：隐患记录项 */
  export interface EmployeeHazardItem {
    id: number;
    no: number | null;
    hazardDate: string | null;
    category: string | null;
    level: string | null;
    status: string | null;
    checkerId: number | null;
    fixerId: number | null;
    description: string | null;
  }

  /** 关联业务：事故记录项 */
  export interface EmployeeAccidentItem {
    id: number;
    no: number | null;
    accidentDate: string | null;
    accidentType: string | null;
    level: string | null;
    status: string | null;
    handlerId: number | null;
    description: string | null;
  }

  /** 关联业务：应急预案项 */
  export interface EmployeeEmergencyPlanItem {
    id: number;
    name: string | null;
    type: string | null;
    level: string | null;
    status: string | null;
    responsiblePersonId: number | null;
  }

  /** 关联业务：培训记录项 */
  export interface EmployeeTrainingItem {
    id: number;
    name: string | null;
    trainingType: string | null;
    trainingDate: string | null;
    result: string | null;
    score: number | null;
    employeeId: number | null;
  }

  /** 关联业务：三违记录项 */
  export interface EmployeeViolationItem {
    id: number;
    no: string | null;
    violationDate: string | null;
    violationType: string | null;
    status: string | null;
    name: string | null;
    position: string | null;
    description: string | null;
  }
}

// ============================================================
// 提示词-92 任务1：筛选器动态化
// ============================================================

/** 筛选器选项（部门/岗位，来自花名册实际数据） */
export interface FilterOptions {
  departments: string[];
  positions: string[];
}

const BASE = '/hse/employee';

// ============================================================
// 员工管理
// ============================================================

/** 员工列表 */
export async function getEmployeeList(params: EmployeeApi.EmployeeListParams) {
  return requestClient.get<{
    list: EmployeeApi.EmployeeItem[];
    total: number;
    page: number;
    pageSize: number;
  }>(`${BASE}/employees`, { params });
}

/** 员工统计 */
export async function getEmployeeStats() {
  return requestClient.get<EmployeeApi.EmployeeStats>(
    `${BASE}/employees/stats`,
  );
}

/** 筛选器选项：从花名册实际数据提取去重后的部门/岗位（提示词-92 任务1） */
export async function getFilterOptions() {
  return requestClient.get<FilterOptions>(`${BASE}/employees/filter-options`);
}

/**
 * 批量按 ID 查询员工完整信息（R1-Phase1 P0-1）
 * POST /hse/employee/employees/batch  { ids: number[] }
 * 返回完整 EmployeeItem[]（含 org_status/phone/id_card 等 SelectorItem 缺失字段），非分页。
 * 注意：EmployeeItem 字段为 snake_case（id_card/dept_name/org_status），消费层需做 camelCase 映射。
 */
export function getEmployeesByIds(ids: number[]) {
  return requestClient.post<EmployeeApi.EmployeeItem[]>(
    `${BASE}/employees/batch`,
    { ids },
  );
}

/**
 * @deprecated
 * 死代码：Q1 审计（P2-4）确认全仓零调用，统一取数已由 Q3 `useEmployeeData`（兜底 `getEmployeeSelectorBatch`）替代。
 * TODO(Phase 1): 确认无动态 import / 字符串引用后删除；当前保留以兼容可能的动态引用。
 * 员工批量/单条查询请改用 `employee-selector.ts` 的 `getEmployeeSelectorBatch` / `getEmployeeSelectorList`。
 */
export async function getEmployeeDetail(id: number) {
  return requestClient.get<EmployeeApi.EmployeeDetail>(
    `${BASE}/employees/${id}`,
  );
}

/** 新增员工 */
export async function createEmployee(data: EmployeeApi.EmployeeFormData) {
  return requestClient.post(`${BASE}/employees`, data);
}

/** 更新员工 */
export async function updateEmployee(
  id: number,
  data: Partial<EmployeeApi.EmployeeFormData>,
) {
  return requestClient.put(`${BASE}/employees/${id}`, data);
}

/** 删除员工 */
export async function deleteEmployee(id: number) {
  return requestClient.delete(`${BASE}/employees/${id}`);
}

/** 批量导入员工 */
export async function importEmployees(
  employees: EmployeeApi.EmployeeFormData[],
) {
  return requestClient.post<EmployeeApi.ImportResult>(
    `${BASE}/employees/import`,
    { employees },
  );
}

/** 下载 Excel 导入模板（Sprint5.1.1） */
export async function downloadEmployeeImportTemplate() {
  return requestClient.get(`${BASE}/employees/import/template`, {
    responseType: 'blob',
  });
}

/** 上传 Excel 并预览解析结果（不写入数据库，Sprint5.1.1） */
export async function previewEmployeeExcel(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return requestClient.post<EmployeeApi.ExcelPreviewResult>(
    `${BASE}/employees/import/excel/preview`,
    formData,
    { headers: { 'Content-Type': undefined as any } },
  );
}

/** 上传 Excel 并直接导入（Sprint5.1.1） */
export async function importEmployeeExcel(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return requestClient.post<EmployeeApi.ImportResult>(
    `${BASE}/employees/import/excel`,
    formData,
    { headers: { 'Content-Type': undefined as any } },
  );
}

// ============================================================
// 组织管理
// ============================================================

/** 部门树 */
export async function getDeptTree(params?: { includeInactive?: boolean }) {
  return requestClient.get<EmployeeApi.DeptNode[]>(
    `${BASE}/departments/tree`,
    { params },
  );
}

/**
 * @deprecated
 * 死代码：提示词-117 P2-10 审计确认全仓零调用（仅定义，无消费方）。
 * GET /departments 返回 camelCase 与 tree 接口（snake_case）格式不一致，
 * 但因无调用方暂不改动后端以避免风险；如需使用请改用 getDeptTree。
 */
export async function getDeptList() {
  return requestClient.get<EmployeeApi.DeptNode[]>(`${BASE}/departments`);
}

/** 新增部门 */
export async function createDept(data: EmployeeApi.DeptFormData) {
  return requestClient.post(`${BASE}/departments`, data);
}

/** 更新部门 */
export async function updateDept(
  id: number,
  data: Partial<EmployeeApi.DeptFormData>,
) {
  return requestClient.put(`${BASE}/departments/${id}`, data);
}

/** 删除部门 */
export async function deleteDept(id: number) {
  return requestClient.delete(`${BASE}/departments/${id}`);
}

/** 查询部门下的员工列表 */
export async function getDeptEmployees(deptId: number, params?: { page?: number; pageSize?: number }) {
  return requestClient.get<{
    list: EmployeeApi.EmployeeItem[];
    total: number;
    page: number;
    pageSize: number;
  }>(`${BASE}/departments/${deptId}/employees`, { params });
}

// ============================================================
// 岗位管理
// ============================================================

/** 岗位列表 */
export async function getPositionList(params?: {
  deptId?: number;
  keyword?: string;
  /** 岗位类别筛选（提示词-122 P2，传则服务端筛选） */
  jobCategory?: string;
  /** 特种作业岗位筛选（提示词-122 P2，true/false） */
  isSpecialPost?: boolean;
  /** 页码（提示词-122 P2，传入则服务端分页返回 {list,total,page,pageSize}） */
  page?: number;
  /** 每页条数 */
  pageSize?: number;
}) {
  return requestClient.get<EmployeeApi.PositionItem[]>(`${BASE}/positions`, {
    params,
  });
}

/** 新增岗位 */
export async function createPosition(data: EmployeeApi.PositionFormData) {
  return requestClient.post(`${BASE}/positions`, data);
}

/** 更新岗位 */
export async function updatePosition(
  id: number,
  data: Partial<EmployeeApi.PositionFormData>,
) {
  return requestClient.put(`${BASE}/positions/${id}`, data);
}

/** 删除岗位 */
export async function deletePosition(id: number) {
  return requestClient.delete(`${BASE}/positions/${id}`);
}

// ============================================================
// 人员组织关系
// ============================================================

/** 员工当前组织关系 */
export async function getEmployeeOrg(employeeId: number) {
  return requestClient.get(`${BASE}/org/employee/${employeeId}`);
}

/** 员工组织关系历史 */
export async function getEmployeeOrgHistory(employeeId: number) {
  return requestClient.get<EmployeeApi.OrgHistoryItem[]>(
    `${BASE}/org/employee/${employeeId}/history`,
  );
}

/** 调岗/分配组织关系 */
export async function assignOrg(data: EmployeeApi.OrgAssignFormData) {
  return requestClient.post(`${BASE}/org/assign`, data);
}

/** 人员状态变更 */
export async function updateOrgStatus(
  orgId: number,
  data: { status: string; event_date: string; remark?: string },
) {
  return requestClient.put(`${BASE}/org/${orgId}/status`, data);
}

// ============================================================
// 人事变动记录
// ============================================================

/** 员工人事变动历史 */
export async function getEmployeeHistory(employeeId: number) {
  return requestClient.get<EmployeeApi.HistoryItem[]>(
    `${BASE}/history/employee/${employeeId}`,
  );
}

// ============================================================
// Sprint11-2: 超龄人员自动识别（基于employee表birth_date）
// ============================================================

/** 超龄人员自动识别列表查询参数 */
export interface OverAgeAutoListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  gender?: string;
  township?: string;
  secondaryDept?: string;
  positionName?: string;
}

/** 超龄人员自动识别列表项 */
export interface OverAgeAutoItem {
  id: number;
  employee_code?: string;
  id_card?: string;
  name: string;
  gender?: string;
  birth_date?: string;
  age: number;
  over_age_years: number;
  phone?: string;
  person_category?: string;
  person_type?: string;
  is_public_welfare?: boolean;
  org_path?: string;
  position_id?: number;
  position_name?: string;
  org_status?: string;
  start_date?: string;
  dept_name?: string;
  over_age_id?: number | null; // 对应 over_age_personnel.id，用于附件/版本/编辑查询
}

/** 超龄人员自动识别详情 */
export interface OverAgeAutoDetail extends OverAgeAutoItem {
  age_threshold: number;
  id_address?: string;
  org?: {
    org_path?: string;
    position_id?: number;
    position_name?: string;
    start_date?: string;
    status?: string;
  } | null;
}

/** 超龄人员统计 */
export interface OverAgeAutoStats {
  total: number;
  byGender: Record<string, number>;
  byAgeGroup: Record<string, number>;
  topDepartments: Array<{ dept_name: string; count: number }>;
  thresholds: Record<string, number>;
}

/** 超龄人员自动识别列表 */
export async function getOverAgeAutoList(params: OverAgeAutoListParams) {
  return requestClient.get<{
    list: OverAgeAutoItem[];
    total: number;
    page: number;
    pageSize: number;
  }>(`${BASE}/over-age/auto-list`, { params });
}

/** 超龄人员自动识别统计 */
export async function getOverAgeAutoStats() {
  return requestClient.get<OverAgeAutoStats>(`${BASE}/over-age/auto-stats`);
}

/** 超龄人员自动识别详情 */
export async function getOverAgeAutoDetail(id: number) {
  return requestClient.get<OverAgeAutoDetail>(`${BASE}/over-age/auto/${id}`);
}

/** 超龄人员自动识别导出（CSV，基于employee实时计算，id_card/phone 脱敏） */
export async function exportOverAgeAutoList() {
  return requestClient.get<Blob>(`${BASE}/over-age/auto-export`, {
    responseType: 'blob',
  });
}

// ============================================================
// R1-Phase1 收尾 · 提示词-40 任务 C：员工主档案页
// ============================================================

/** 员工主档案（基本信息 + 组织岗位 + 关联业务统计） */
export function getEmployeeProfile(id: number) {
  return requestClient.get<EmployeeApi.EmployeeProfileResponse>(
    `${BASE}/employees/${id}/profile`,
  );
}

/** 关联业务：隐患记录（checker/fixer） */
export function getEmployeeHazards(
  id: number,
  params: { page?: number; pageSize?: number },
) {
  return requestClient.get<{
    list: EmployeeApi.EmployeeHazardItem[];
    total: number;
    page: number;
    pageSize: number;
  }>(`${BASE}/employees/${id}/hazards`, { params });
}

/** 关联业务：事故记录（handler） */
export function getEmployeeAccidents(
  id: number,
  params: { page?: number; pageSize?: number },
) {
  return requestClient.get<{
    list: EmployeeApi.EmployeeAccidentItem[];
    total: number;
    page: number;
    pageSize: number;
  }>(`${BASE}/employees/${id}/accidents`, { params });
}

/** 关联业务：应急预案（responsiblePerson） */
export function getEmployeeEmergencyPlans(
  id: number,
  params: { page?: number; pageSize?: number },
) {
  return requestClient.get<{
    list: EmployeeApi.EmployeeEmergencyPlanItem[];
    total: number;
    page: number;
    pageSize: number;
  }>(`${BASE}/employees/${id}/emergency-plans`, { params });
}

/** 关联业务：培训记录（employee） */
export function getEmployeeTraining(
  id: number,
  params: { page?: number; pageSize?: number },
) {
  return requestClient.get<{
    list: EmployeeApi.EmployeeTrainingItem[];
    total: number;
    page: number;
    pageSize: number;
  }>(`${BASE}/employees/${id}/training`, { params });
}

/** 关联业务：三违记录（按姓名匹配） */
export function getEmployeeViolations(
  id: number,
  params: { page?: number; pageSize?: number },
) {
  return requestClient.get<{
    list: EmployeeApi.EmployeeViolationItem[];
    total: number;
    page: number;
    pageSize: number;
  }>(`${BASE}/employees/${id}/violations`, { params });
}
