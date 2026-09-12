/**
 * 事故管理 API（web-naive）
 *
 * 对应后端路由前缀: /accidents
 * requestClient baseURL = /api，完整请求路径为 /api/accidents/...
 *
 * 字段命名对齐后端返回（camelCase，与 web-antd 保持一致）。
 */
import { requestClient } from '#/api/request';

export namespace AccidentApi {
  /** 时效状态 */
  export type ExpiryStatus =
    | 'normal'
    | 'expiring'
    | 'expired'
    | 'permanent'
    | 'unknown'
    | 'closed';

  /** 事故级别（后端 schema/server 存取均为中文，覆盖生产安全+道路交通事故两套国标等级） */
  export type AccidentLevel =
    | '特别重大'
    | '重大'
    | '较大'
    | '一般'
    | '一级'
    | '二级'
    | '三级'
    | '四级';

  /** 事故类型 */
  export type AccidentType =
    | 'traffic'
    | 'occupational'
    | 'equipment'
    | 'fire'
    | 'environmental'
    | 'other';

  /** 事故状态 */
  export type AccidentStatus =
    | 'reported'
    | 'investigating'
    | 'processing'
    | 'closed';

  /** 当事人角色（未标注时后端按事故类型推断：交通→肇事者，生产安全/意外伤害→伤者，突发疾病→患者） */
  export type PersonRole = '肇事者' | '伤者' | '患者' | '当事人' | '其他';

  export interface AccidentItem {
    id: number;
    title: string;
    description: string;
    level: AccidentLevel;
    type: AccidentType;
    status: AccidentStatus;
    location: string;
    occurredAt: string;
    reportedAt: string;
    reporter: string;
    casualties: number;
    injuries: number;
    economicLoss: number;
    /** 事故编号（台账号，SG-YYYY-NNN），与行号区分 */
    accidentNo?: string;
    /** 当事人姓名（交通事故为肇事者，生产安全事故为伤者；可能非公司内部人员） */
    involvedPerson?: string;
    /** 当事人角色 */
    involvedPersonRole?: PersonRole;
    /** 当事人关联员工 ID（花名册；外部人员为 null） */
    personnelId?: number | null;
    /** 责任认定依据（事故认定书 / 调查报告 / 其它）—— 非责任班组 */
    responsibility?: string;
    responsibilityLevel?: string;
    /** 责任班组：ID 关联 hse_operation_unit */
    responsibilityTeamId?: number | null;
    /** 责任班组名称快照 */
    responsibilityTeam?: string;
    /** 车牌号（关联车辆号牌；外部/无车则为空） */
    involvedVehicle?: string;
    /** 事故类别（报表一级分类：交通/生产安全/意外/公众/突发疾病/职业病/其它） */
    accidentCategory?: string;
    /** 事故性质（按 accidentCategory 级联） */
    accidentNature?: string;
    /** 事故性质三级（按 accidentCategory + accidentNature 级联，报表三级细化） */
    accidentNatureLevel3?: string;
    /** 当事人所属部门（花名册/员工档案自动关联） */
    partyDept?: string;
    partyDeptId?: number | null;
    /** 当事人上级（supervisor_id 链追溯 1-2 级，"张三（管理员） / 李四（部门经理）"） */
    partySupervisor?: string;
    partySupervisorId?: number | null;
    /** 报送集团开关（true=已报送集团 / false=未报送；读取响应用 camelCase） */
    reportGroup?: boolean;
    handler?: string;
    handlerId?: number | null;
    reporterId?: number | null;
    handlerSupervisorId?: number | null;
    handlerSupervisorName?: string | null;
    closedAt?: string;
    remark?: string;
    rectificationDeadlineDays?: number;
    expiryStatus?: ExpiryStatus;
    relatedHazardId?: number | null;
    relatedEmergencyId?: number | null;
    /** 以下为后端写入用的 snake_case 字段（仅提交 payload 使用；读取响应仍是 camelCase） */
    /** 后端 zod schema 必填字段，YYYY-MM-DD 字符串；同时也保留 occurredAt 给前端显示 */
    accident_date?: string;
    accident_no?: string;
    involved_person?: string;
    involved_person_role?: PersonRole;
    responsibility_team_id?: number | null;
    responsibility_team?: string;
    /** 当事人关联员工 ID（花名册；提交 payload 用，snake_case） */
    personnel_id?: number | null;
    /** 车牌号（提交 payload 用，snake_case） */
    involved_vehicle?: string;
    /** 事故类别 / 性质（提交 payload） */
    accident_category?: string;
    accident_nature?: string;
    accident_nature_level3?: string;
    /** 当事人所属部门 + 上级（提交 payload） */
    party_dept?: string;
    party_dept_id?: number | null;
    party_supervisor?: string;
    party_supervisor_id?: number | null;
    /** 报送集团开关（提交 payload，snake_case；读取用 reportGroup） */
    report_group?: boolean;
    /** 经济损失（提交 payload，snake_case；读取响应用 economicLoss） */
    loss_amount?: number;
    /** 整改期限天数（提交 payload；读取用 rectificationDeadlineDays） */
    rectification_deadline_days?: number;
    /** 关联隐患 ID（提交 payload；读取用 relatedHazardId） */
    related_hazard_id?: number | null;
    /** 关联应急事件 ID（提交 payload；读取用 relatedEmergencyId） */
    related_emergency_id?: number | null;
    createdAt: string;
    updatedAt: string;
  }

  /** 附件 */
  export interface Attachment {
    id: number;
    accidentId: number;
    filename: string;
    originalName: string;
    fileType: string;
    fileSize: number;
    fileUrl: string;
    version: string;
    uploadedBy: string;
    isLatest: boolean;
    createdAt: string;
  }

  /** 责任班组下拉项（数据源 hse_operation_unit） */
  export interface ResponsibilityTeam {
    id: number;
    unitName: string;
    unitType: string;
    unitTypeLabel: string;
    unitCode: string;
    orgUnitId: number | null;
  }

  /** 花名册搜索结果项（当事人选择用） */
  export interface PersonnelSuggestion {
    employeeId: number;
    name: string;
    operationUnitId: number | null;
    unitName: string;
    positionName: string;
    isDriver: boolean;
    town: string | null;
  }

  /** 版本履历 */
  export interface VersionRecord {
    id: number;
    accidentId: number;
    version: string;
    changeType: string;
    changeSummary: string;
    changedBy: string;
    createdAt: string;
  }

  /** 责任班组建议结果 */
  export interface TeamSuggestion {
    responsibilityTeamId: number | null;
    responsibilityTeam: string;
  }

  /** 当事人所属部门 + 上级 建议结果（花名册自动关联） */
  export interface PartySuggestion {
    partyDept: string;
    partyDeptId: number | null;
    partySupervisor: string;
    partySupervisorId: number | null;
  }

  /** 事故类别 ↔ 事故性质 ↔ 性质三级 级联元数据 */
  export interface CategoryNatureMeta {
    categories: string[];
    naturesByCategory: Record<string, string[]>;
    /** 三级性质：键为 `${category}${nature}` 复合串（如 "突发疾病岗位发病"），值为三级选项数组 */
    level3ByCategoryNature: Record<string, string[]>;
  }

  export interface AccidentListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    level?: string;
    type?: string;
    status?: string;
    year?: number;
    month?: number;
    startDate?: string;
    endDate?: string;
    expiryStatus?: ExpiryStatus | '';
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
  }

  export interface AccidentStats {
    total: number;
    major: number;
    serious: number;
    general: number;
    minor: number;
    openCount: number;
    closedCount: number;
    totalCasualties: number;
    totalInjuries: number;
    totalEconomicLoss: number;
    expiring?: number;
    expired?: number;
    byType?: Record<string, number>;
    byLevel?: Record<string, number>;
    byStatus?: Record<string, number>;
  }

  /** 事故表单数据 */
  export interface AccidentFormData {
    title: string;
    description?: string;
    level: AccidentLevel;
    type: AccidentType;
    status: AccidentStatus;
    location: string;
    occurredAt: string;
    reporter?: string;
    reporterId?: number | null;
    handler?: string;
    handlerId?: number | null;
    casualties: number;
    injuries: number;
    economicLoss: number;
    rectificationDeadlineDays?: number;
    relatedHazardId?: number | null;
    relatedEmergencyId?: number | null;
    remark?: string;
  }
}

/** 事故列表 */
export async function getAccidentList(
  params: AccidentApi.AccidentListParams,
) {
  return requestClient.get<{ list: AccidentApi.AccidentItem[]; total: number }>(
    '/accidents',
    { params },
  );
}

/** 事故统计 */
export async function getAccidentStats() {
  return requestClient.get<AccidentApi.AccidentStats>('/accidents/stats');
}

/** 事故详情 */
export async function getAccidentDetail(id: number) {
  return requestClient.get<AccidentApi.AccidentItem>(`/accidents/${id}`);
}

/** 新增事故 */
export async function createAccident(data: Partial<AccidentApi.AccidentItem>) {
  return requestClient.post<AccidentApi.AccidentItem>('/accidents', data);
}

/** 更新事故 */
export async function updateAccident(
  id: number,
  data: Partial<AccidentApi.AccidentItem>,
) {
  return requestClient.put<AccidentApi.AccidentItem>(`/accidents/${id}`, data);
}

/** 删除事故 */
export async function deleteAccident(id: number) {
  return requestClient.delete(`/accidents/${id}`);
}

// ========== 责任班组下拉 ==========
export async function getAccidentTeams(params?: {
  keyword?: string;
  unit_type?: string;
}) {
  return requestClient.get<{
    list: AccidentApi.ResponsibilityTeam[];
    total: number;
  }>('/accidents/teams', { params });
}

// ========== 花名册搜索（当事人选择） ==========
export async function getPersonnelSearch(keyword: string) {
  return requestClient.get<{
    list: AccidentApi.PersonnelSuggestion[];
    total: number;
  }>('/accidents/personnel-search', { params: { keyword } });
}

// ========== 责任班组建议（当事人 + 地点 → 责任班组） ==========
export async function suggestTeam(params: {
  personnelId?: number;
  name?: string;
  location?: string;
}) {
  return requestClient.get<AccidentApi.TeamSuggestion>('/accidents/suggest-team', { params });
}

// ========== 附件管理 ==========
export async function getAccidentAttachments(id: number, version?: string) {
  return requestClient.get<AccidentApi.Attachment[]>(
    `/accidents/${id}/attachments`,
    { params: version ? { version } : {} },
  );
}

export async function uploadAccidentAttachment(
  id: number,
  file: File,
  options: { version?: string; uploadedBy?: string } = {},
) {
  const formData = new FormData();
  formData.append('file', file);
  if (options.version) formData.append('version', options.version);
  if (options.uploadedBy) formData.append('uploaded_by', options.uploadedBy);
  return requestClient.post<AccidentApi.Attachment>(
    `/accidents/${id}/attachments`,
    formData,
    { headers: { 'Content-Type': undefined as any } },
  );
}

export async function deleteAccidentAttachment(id: number, aid: number) {
  return requestClient.delete(`/accidents/${id}/attachments/${aid}`);
}

// ========== 版本管理 ==========
export async function getAccidentVersions(id: number) {
  return requestClient.get<AccidentApi.VersionRecord[]>(
    `/accidents/${id}/versions`,
  );
}

// ========== 报表导出 ==========
/**
 * 导出事故列表（CSV）。
 * 使用 requestClient.download() 正确返回 Blob，调用方需使用 async/await。
 */
export async function exportAccidents() {
  return requestClient.download('/accidents/export');
}

// ========== 事故类别 ↔ 性质 级联元数据 ==========
export async function getCategoryNature() {
  return requestClient.get<AccidentApi.CategoryNatureMeta>('/accidents/category-nature');
}

// ========== 当事人所属部门 + 上级 建议 ==========
// 花名册人员：保洁员→所属作业中心 + 管理员链；驾驶员→所属作业中心 + 乡镇作业中心经理链
// 非花名册人员：返回空字段，由用户填责任班组
export async function suggestParty(params: {
  personnelId?: number;
  name?: string;
  location?: string;
}) {
  return requestClient.get<AccidentApi.PartySuggestion>('/accidents/suggest-party', { params });
}
