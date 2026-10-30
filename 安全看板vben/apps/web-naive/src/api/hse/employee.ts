/**
 * HSE 人员主数据中心 API（web-naive 试点）
 *
 * 对应后端路由: server/routes/hse-employee.js
 * 路由前缀: /hse/employee
 * requestClient baseURL = /api（VITE_GLOB_API_URL），故完整请求路径为 /api/hse/employee/...
 *
 * 字段命名严格对齐后端返回（snake_case：id_card / dept_name / org_status 等），
 * 与 web-antd 同源接口保持一致。
 */
import { requestClient } from '#/api/request';

export namespace EmployeeApi {
  /** 人员分类 */
  export type PersonCategory = '适龄人员' | '超龄人员';

  /**
   * 组织状态（生命周期，后端返回英文枚举）
   * A-02d：secondment=借调（≠ transfer 一般调动）、unpaid_leave=停薪留职、former=历史兼容值（只读）
   * A-02d.3（B02-DEC-03.17 P5）：补 inactive —— `displayStatusSql` 的 ELSE 分支在
   *   assignment.status='inactive' 且用工关系非终态时会原样返回该编码，此前类型缺失。
   *   inactive 与 retired 是**两个独立编码**（前者=离职语义，后者=退休语义），不得合并。
   * rehire 为历史兼容值（后端正式编码为 reinstated），保留在类型中仅为读取旧数据不报错。
   */
  export type OrgStatus =
    | 'active'
    | 'former'
    | 'inactive'
    | 'left'
    | 'pending'
    | 'rehire'
    | 'reinstated'
    | 'retired'
    | 'secondment'
    | 'unpaid_leave';

  /** 员工列表项（snake_case，对齐后端返回） */
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
    person_type?: string;
    is_public_welfare?: boolean;
    org_id?: number;
    org_path?: string;
    /** 是否驾驶员（由 position_name 派生） */
    is_driver?: boolean;
    position_id?: number;
    position_name?: string;
    /** 组织状态英文枚举（见 OrgStatus）：active/left/inactive/pending/secondment/unpaid_leave/retired/former/reinstated；rehire 为历史别名 */
    org_status?: OrgStatus;
    /**
     * 用工关系状态（以花名册为准：正式员工/辞职/死亡/退休）
     * ⚠️ 现状（A-02e.5-D1 核实）：`GET /hse/employee/employees` 的 SELECT **未返回**该列
     *   （`employeeService.listEmployees` 只返回派生后的 `org_status`），故列表行的该字段恒为 undefined，
     *   编辑弹窗因此拿不到关系原值。该缺口属 A 节点（关系直接编辑闭环）与 DB-INT 范围，本节点不修，
     *   也**不得**据此反推关系。
     *   判断「是否可返聘」请使用 `is_retired_relation`（服务端派生），不要用本字段或 `org_status` 推断。
     */
    employment_relation?: string;
    /**
     * 服务端派生的只读标记（A-02e.5-D1）：`trim(employee.employment_relation) === '退休'`。
     * 关系为 NULL / 辞职 / 死亡 / 未知值时恒为 false（后端 COALESCE 保证不返回 NULL）。
     * 仅用于决定「是否展示返聘入口」；真正的资格校验在 `POST /org/rehire` 事务内完成。
     */
    is_retired_relation?: boolean;
    /**
     * 服务端派生的只读标记（B02-DEC-03.34 / A-02A）：员工当前用工关系是否处于终态集合
     * （辞职 / 死亡 / 退休）。由 `employeeService.listEmployees` 计算，与后端
     * `employeeAssignmentService.terminateEmployee` 的关系闸门同源（同一常量集合
     * `TERMINAL_RELATION_VALUES`）。
     *   - 关系为 NULL / 空串 / 未知值 / 正式员工 → false；
     *   - 关系为 辞职 / 死亡 / 退休 → true。
     * 仅用于决定「是否展示终态登记入口」；真正的资格与事务校验在 `POST /org/terminate` 内完成。
     */
    is_terminal_relation?: boolean;
    /** 直接上级姓名 */
    supervisor_name?: string;
    start_date?: string;
    /** 离职日期（花名册·用工关系状态=辞职/死亡时才有值） */
    leave_date?: string;
    dept_name?: string;
    created_at?: string;
    updated_at?: string;
  }

  /** 员工列表查询参数 */
  export interface EmployeeListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    personType?: string;
    personCategory?: PersonCategory;
    status?: OrgStatus;
    gender?: string;
    deptName?: string;
    positionName?: string;
    /** 统计卡点击联动：按用工关系状态过滤 total/active/left */
    employmentRelation?: 'total' | 'active' | 'left';
    /** 统计卡点击联动：是否仅在职(正式员工)中超龄 */
    overageOnly?: boolean;
    /** 排序字段（服务端三态排序透传） */
    sortField?: string;
    /** 排序方向（asc/desc，取消时 undefined） */
    sortOrder?: 'asc' | 'desc';
  }

  /** 员工表单数据（新增 / 编辑） */
  export interface EmployeeFormData {
    employee_code?: string;
    id_card?: string;
    name: string;
    gender?: string;
    birth_date?: string;
    phone?: string;
    id_address?: string;
    person_category?: PersonCategory;
    person_type?: string;
    is_public_welfare?: boolean;
    /** 用工关系状态（以花名册为准：正式员工/辞职/死亡等） */
    employment_relation?: string;
    /** 离职日期（花名册·用工关系状态=辞职/死亡时才有值） */
    leave_date?: string;
  }

  /** 花名册权威用工状态（roster-authority 接口返回） */
  export interface RosterAuthority {
    id: number;
    /** 是否在花名册中找到对应权威行 */
    found: boolean;
    /** 命中的匹配方式：id_card / employee_code / name */
    matchedBy?: string;
    /** 花名册权威用工关系状态 */
    employment_relation?: string | null;
    /** 花名册权威离职日期 */
    leave_date?: string | null;
  }

  /** 员工统计（统计卡展示） */
  export interface EmployeeStats {
    /** 档案总数（全部未删除员工） */
    total: number;
    /** 员工总数（花名册覆盖口径：正式员工+辞职+死亡） */
    listTotal?: number;
    /** 在职人员（花名册：正式员工） */
    activeCount?: number;
    /** 离职人员（花名册：辞职/死亡） */
    leftCount?: number;
    /** 超龄人员（在职内按生日实时判定） */
    overAgeCount?: number;
    byPersonType: Array<{ person_type: string; count: number }>;
    byPersonCategory: Array<{ person_category: string; count: number }>;
    byOrgStatus: Array<{ status: string; count: number }>;
  }

  /** 筛选器选项（部门 / 岗位，来自花名册实际数据） */
  export interface FilterOptions {
    departments: string[];
    positions: string[];
  }

  /** 导入结果 */
  export interface ImportResult {
    total: number;
    success: number;
    failed: number;
    errors: Array<{ index: number; message: string }>;
  }

  /** Excel 预览结果 */
  export interface ExcelPreviewResult {
    fileName: string;
    sheetName: string;
    totalRows: number;
    validRows: number;
    invalidRows: number;
    errors: string[];
    preview: Array<EmployeeFormData & { __rowIndex?: number }>;
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
    org_type?: string;
    employee_count?: number;
    actual_headcount?: number;
    employee_count_approximate?: boolean;
    supervisor_name?: string;
    /** 部门负责人（查询期按职位最高者推导）姓名/显示用 */
    manager_name?: string;
    org_unit_id?: number | string;
    children?: DeptNode[];
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

  /** 超龄人员列表项 */
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
    over_age_id?: number | null;
  }

  /** 超龄人员列表查询参数 */
  export interface OverAgeAutoListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    gender?: string;
    township?: string;
    secondaryDept?: string;
    positionName?: string;
  }

  /** 超龄人员统计 */
  export interface OverAgeAutoStats {
    total: number;
    byGender: Record<string, number>;
    byAgeGroup: Record<string, number>;
    topDepartments: Array<{ dept_name: string; count: number }>;
    thresholds: Record<string, number>;
  }

  /** 超龄人员详情 */
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

  /** 岗位列表分页响应 */
  export interface PositionListResult {
    list: PositionItem[];
    total: number;
    page: number;
    pageSize: number;
  }

  /** 部门表单数据（新增 / 编辑，对齐后端 department 表） */
  export interface DeptFormData {
    dept_code: string;
    name: string;
    short_name?: string;
    parent_id?: number | null;
    level?: number;
    township?: string;
    manager_id?: number | null;
    safety_manager_id?: number | null;
    headcount?: number;
    sort_order?: number;
    status?: string;
    description?: string;
  }

  /** 调岗 / 组织分配表单数据 */
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

  /**
   * 终态登记表单数据（B02-DEC-03.34 / A-02A）
   * 字段严格对齐后端 `employeeAssignmentService.terminateEmployee` 的解构入参：
   *   { employee_id, terminal_type, event_date, remark }
   * 说明：
   *   - `terminal_type` 只接受「辞职 / 死亡 / 退休」三者之一，不得用笼统的「离职」代替具体关系；
   *   - `event_date` 是**业务事件日期**，必须由操作人显式填写，禁止用系统登记时间/当天日期代替；
   *     系统登记时间（created_at / updated_at）由后端负责，前端不得覆盖。
   *   - 不发送 `employment_relation` / `status` / `leave_date`：终态后的关系与离职日期由后端事务决定，
   *     前端传值一律不接受，也不得用本地赋值伪造终态结果。
   */
  export interface OrgTerminateFormData {
    employee_id: number;
    /** 终态类型：辞职 / 死亡 / 退休（不得使用「离职」等笼统词） */
    terminal_type: '辞职' | '死亡' | '退休';
    /** YYYY-MM-DD，业务事件日期，必填且必须显式选择 */
    event_date: string;
    /** 登记依据、审批文号等（可选） */
    remark?: string;
  }

  /**
   * 返聘表单数据（A-02e.5-D1）
   * 字段严格对齐后端 `employeeAssignmentService.rehireEmployee` 的解构入参：
   *   { employee_id, org_unit_id, group_id, region_id, enterprise_id, project_id, team_id,
   *     position_id, supervisor_id, start_date, change_reason, remark }
   * 说明：
   *   - 前端走 `team_id`（与调岗一致，取部门树节点 id），由后端 resolveOrgUnitId 解析为 hse_org_unit；
   *     不直接传 `org_unit_id`（web-naive 无 hse_org_unit 树接口）。
   *   - `start_date` 是**业务生效日期**，必须由操作人显式填写，禁止用系统登记时间/当天日期代替；
   *     系统登记时间（created_at / updated_at）由后端负责，前端不得覆盖。
   *   - 不发送 `employment_relation` / `status`：返聘后的关系重置与新段状态由后端事务决定，
   *     前端传值一律不接受，也不得用本地赋值伪造返聘结果。
   */
  export interface OrgRehireFormData {
    employee_id: number;
    team_id: number;
    position_id: number;
    /** YYYY-MM-DD */
    start_date: string;
    change_reason?: string;
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
}

const BASE = '/hse/employee';

/** 员工列表（服务端分页 + 三态排序 + 真实 total） */
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

/** 筛选器选项：从花名册实际数据提取去重后的部门 / 岗位 */
export async function getFilterOptions() {
  return requestClient.get<EmployeeApi.FilterOptions>(
    `${BASE}/employees/filter-options`,
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

/** 查询员工的花名册权威用工状态（保存前用于一致性校验） */
export async function getRosterAuthority(id: number) {
  return requestClient.get<EmployeeApi.RosterAuthority>(
    `${BASE}/employees/${id}/roster-authority`,
  );
}

/** 批量导入员工（JSON 数组，直接写库） */
export async function importEmployees(
  employees: EmployeeApi.EmployeeFormData[],
) {
  return requestClient.post<EmployeeApi.ImportResult>(`${BASE}/employees/import`, {
    employees,
  });
}

/**
 * 下载 Excel 导入模板。
 * 使用 RequestClient.download()（responseReturn:'body' + responseType:'blob'），
 * 与全局 responseReturn:'data' 解耦，正确返回 Blob。
 */
export async function downloadEmployeeImportTemplate() {
  return requestClient.download(`${BASE}/employees/import/template`);
}

/** 上传 Excel 并预览解析结果（不写入数据库） */
export async function previewEmployeeExcel(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return requestClient.post<EmployeeApi.ExcelPreviewResult>(
    `${BASE}/employees/import/excel/preview`,
    formData,
    { headers: { 'Content-Type': undefined as any } },
  );
}

/** 上传 Excel 并直接导入 */
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
// 组织管理（调岗 / 部门树 / 岗位 / 人事变动历史）
// ============================================================

/** 部门树 */
export async function getDeptTree(params?: { includeInactive?: boolean }) {
  return requestClient.get<EmployeeApi.DeptNode[]>(`${BASE}/departments/tree`, {
    params,
  });
}

/** 岗位列表（支持服务端分页；不传分页参数时返回数组，兼容 OrgTransferModal） */
export async function getPositionList(params?: {
  deptId?: number;
  keyword?: string;
  jobCategory?: string;
  isSpecialPost?: boolean;
  page?: number;
  pageSize?: number;
}) {
  return requestClient.get<
    EmployeeApi.PositionItem[] | EmployeeApi.PositionListResult
  >(`${BASE}/positions`, {
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

/** 调岗 / 分配组织关系 */
export async function assignOrg(data: EmployeeApi.OrgAssignFormData) {
  return requestClient.post(`${BASE}/org/assign`, data);
}

/**
 * 返聘（A-02e.5-D1）
 *
 * 后端：`POST /api/hse/employee/org/rehire` → `controllers/hse-assignment.js#rehireEmployee`
 *      → `employeeAssignmentService.rehireEmployee`（单事务：锁行 → 资格 → 建段 → 重置关系 → 历史）
 *
 * 与 `assignOrg` 的边界（不得混用）：
 *   - 本接口只服务「退休 → 重新建立用工关系」这一**动作**，不是状态变更，也不是调岗；
 *   - 旧接口 `PUT /org/:id/status` 传「返聘」/`reinstated` 会被后端拒绝（-4），必须走本接口；
 *   - 前端不得自行把 `employment_relation` 改成「正式员工」或造 `reinstated` 段来模拟返聘。
 *
 * 失败语义：后端以 `{ code: -4 | -3 | -2 | -1, message }` 返回（HTTP 200），
 *   由响应拦截器抛出并提示；调用方应保留用户输入并如实展示后端 message。
 */
export async function rehireEmployee(data: EmployeeApi.OrgRehireFormData) {
  return requestClient.post(`${BASE}/org/rehire`, data);
}

/**
 * 终态登记（辞职 / 死亡 / 退休）— B02-DEC-03.34 / A-02A
 *
 * 后端：`POST /api/hse/employee/org/terminate`
 *      → `controllers/hse-assignment.js#terminateEmployee`
 *      → `employeeAssignmentService.terminateEmployee`（单事务：锁行 → 关系闸门 → 关段 → 历史 → 审计）
 *
 * 硬约束（对应任务书 §3 / §4 / §5）：
 *   - 后端在同一事务内写入 `employment_relation` + `leave_date` + 关闭当前任职段 + 写 `employee_history`
 *     + 写 `sys_operation_log`；任何关键步骤失败整体回滚；
 *   - 已处于终态（辞职/死亡/退休）的员工会被关系闸门拒绝（-4），不允许重复登记；
 *   - 关系为 NULL / 空串 / 未知值（待核实）会被拒绝（-4），不得由前端推断或补值；
 *   - `terminal_type` 只接受具体关系，不接受「离职」等笼统词；
 *   - `event_date` 必须由操作人显式填写，前端不得用 `Date.now()` 或系统当天日期代替。
 *
 * 失败语义：后端以 `{ code: -4 | -3 | -2 | -1, message }` 返回（HTTP 200），
 *   由响应拦截器抛出并提示；调用方应保留用户输入并如实展示后端 message。
 */
export async function terminateEmployee(data: EmployeeApi.OrgTerminateFormData) {
  return requestClient.post(`${BASE}/org/terminate`, data);
}

/** 员工人事变动历史 */
export async function getEmployeeHistory(employeeId: number) {
  return requestClient.get<EmployeeApi.HistoryItem[]>(
    `${BASE}/history/employee/${employeeId}`,
  );
}

// ============================================================
// 组织管理（部门树 / CRUD / 部门员工 / 负责人选择器）
// ============================================================

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

/** 删除部门（存在子部门时将拒绝） */
export async function deleteDept(id: number) {
  return requestClient.delete(`${BASE}/departments/${id}`);
}

/** 查询部门下的员工列表（服务端分页 + 真实 total；id 支持 ou_X 合成 ID 或数字）
 * 级联参数：ouIds（自节点起所有后代组织单元 id 的逗号串）用于显示子树全部人员；
 *           deptName（班组名，如「长官镇一班」）用于精确过滤单个班组。 */
export async function getDeptEmployees(
  deptId: number | string,
  params?: { page?: number; pageSize?: number; ouIds?: string; deptName?: string },
) {
  return requestClient.get<{
    list: EmployeeApi.EmployeeItem[];
    total: number;
    page: number;
    pageSize: number;
  }>(`${BASE}/departments/${deptId}/employees`, { params });
}

/** 员工选择器：关键词搜索（负责人选择用） */
export async function getEmployeeSelectorList(params?: {
  keyword?: string;
  limit?: number;
}) {
  return requestClient.get<EmployeeSelectorItem[]>(
    `${BASE}/employees/selector`,
    { params },
  );
}

/** 员工选择器：批量回显（负责人姓名回显） */
export async function getEmployeeSelectorBatch(ids: number[]) {
  return requestClient.post<EmployeeSelectorItem[]>(
    `${BASE}/employees/selector/batch`,
    { ids },
  );
}

/** 员工选择项 */
export interface EmployeeSelectorItem {
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

// ============================================================
// 超龄人员自动识别（Sprint11-2）
// ============================================================

/** 超龄人员自动识别列表 */
export async function getOverAgeAutoList(params: EmployeeApi.OverAgeAutoListParams) {
  return requestClient.get<{
    list: EmployeeApi.OverAgeAutoItem[];
    total: number;
    page: number;
    pageSize: number;
  }>(`${BASE}/over-age/auto-list`, { params });
}

/** 超龄人员自动识别统计 */
export async function getOverAgeAutoStats() {
  return requestClient.get<EmployeeApi.OverAgeAutoStats>(
    `${BASE}/over-age/auto-stats`,
  );
}

/** 超龄人员自动识别详情 */
export async function getOverAgeAutoDetail(id: number) {
  return requestClient.get<EmployeeApi.OverAgeAutoDetail>(
    `${BASE}/over-age/auto/${id}`,
  );
}

/** 超龄人员自动识别导出（CSV） */
export async function exportOverAgeAutoList() {
  return requestClient.download(`${BASE}/over-age/auto-export`);
}
