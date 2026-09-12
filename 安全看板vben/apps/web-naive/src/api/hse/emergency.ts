/**
 * 应急管理 API（web-naive · 06C-3 整改合并）
 *
 * 06C-3 将原 src/api/emergency/{plans,drills,materials,teams,events}.ts 五个独立文件
 * 合并为单一 src/api/hse/emergency.ts（与 api/hse/ 其余 HSE 模块一致）。
 * 对应后端路由: server/routes/emergency.js
 * requestClient baseURL = /api，完整请求路径为 /api/emergency/...
 *
 * 契约说明（06C-3）：
 * - 行为契约 = 基线视图 + 后端 formatXxx 双键返回（camel + snake 皆返回）；
 *   基线孤儿文件 web-antd/src/api/hse/emergency.ts 仅作文件位置/函数清单参考。
 * - 字段命名沿用 snake_case（与后端 formatXxx 的 snake 键及基线视图表单绑定
 *   responsible_dept/drill_type/expire_date/leader_name/member_ids/event_level/
 *   happen_time 等一致），不破坏既已工作的视图字段绑定。
 * - getEmergencyStats 指向 /emergency/plans/stats（与基线 plans 视图裸调用及后端一致），
 *   基线孤儿文件的 /emergency/stats 为陈旧端点，未采用。
 * - 06C-3 补全：getEmergencyPlanDetail / getPlanAttachments / uploadPlanAttachment /
 *   deletePlanAttachment / getPlanVersions（后端均存在对应端点）。
 * - 4 个 per-module 统计（getDrillStats/getMaterialStats/getTeamStats/getEventStats）
 *   为基线视图裸 request 调用的封装化，保留。
 */
import { requestClient } from '#/api/request';

// ==================== 应急预案（plans） ====================
export namespace EmergencyApi {
  /** 预案类型 */
  export type PlanType = 'comprehensive' | 'special' | 'site';
  /** 预案状态 */
  export type PlanStatus = 'active' | 'published' | 'pending' | 'review';
  /** 时效状态（后端计算） */
  export type ExpiryStatus =
    | 'valid'
    | 'expiring'
    | 'expired'
    | 'permanent'
    | 'unknown';

  /** 应急预案列表项（snake_case，对齐后端返回） */
  export interface EmergencyPlan {
    id: number;
    /** 预案名称 */
    name: string;
    /** 类型：comprehensive 综合 / special 专项 / site 现场处置 */
    type: PlanType;
    /** 级别：一级 / 二级 / 三级 */
    level?: string;
    /** 状态：active 生效中 / published 已发布 / pending 待审核 / review 复审中 */
    status: PlanStatus;
    /** 负责部门 */
    responsible_dept?: string;
    /** 负责人姓名 */
    responsible_person?: string;
    /** 负责人员工 ID */
    responsible_person_id?: number | null;
    /** 联系电话 */
    contact_phone?: string;
    /** 生效日期 YYYY-MM-DD */
    effective_date?: string;
    /** 到期日期 YYYY-MM-DD */
    expiry_date?: string;
    /** 时效状态（后端计算）：valid/expiring/expired/permanent/unknown */
    expiry_status?: ExpiryStatus;
    /** 预案描述 */
    description?: string;
    /** 预案内容 */
    plan_content?: string;
  }

  /** 预案列表查询参数 */
  export interface EmergencyListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    type?: PlanType;
    status?: PlanStatus;
    /** 排序字段（服务端三态排序透传，effective_date 支持排序） */
    sortField?: string;
    /** 排序方向（asc/desc，取消时 undefined） */
    sortOrder?: 'asc' | 'desc';
  }

  /** 预案统计（对齐后端 /emergency/plans/stats 返回） */
  export interface EmergencyStats {
    total: number;
    published: number;
    pendingReview: number;
    [key: string]: any;
  }

  /** 预案附件 */
  export interface PlanAttachment {
    id: number;
    planId?: number;
    filename?: string;
    originalName: string;
    fileType?: string;
    fileSize?: number;
    fileUrl?: string;
    version?: string;
    uploadedBy?: string;
    isLatest?: boolean;
    createdAt?: string;
  }

  /** 预案版本履历 */
  export interface PlanVersionRecord {
    id: number;
    planId?: number;
    version: string;
    changeType?: string;
    changeSummary?: string;
    changedBy?: string;
    createdAt?: string;
  }

  /** 预案表单（新增 / 编辑提交字段，snake_case 对齐后端） */
  export interface EmergencyFormData {
    name: string;
    type: PlanType;
    level?: string;
    responsible_dept?: string;
    responsible_person?: string;
    responsible_person_id?: number | null;
    contact_phone?: string;
    status?: PlanStatus;
    effective_date?: string;
    expiry_date?: string;
    description?: string;
    plan_content?: string;
  }
}

/** 应急预案列表（服务端分页 + 三态排序 + 真实 total） */
export async function getEmergencyPlanList(
  params: EmergencyApi.EmergencyListParams,
) {
  return requestClient.get<{
    list: EmergencyApi.EmergencyPlan[];
    total: number;
    page: number;
    pageSize: number;
  }>('/emergency/plans', { params });
}

/** 应急预案统计（对齐基线视图裸调用 + 后端 /plans/stats） */
export async function getEmergencyStats() {
  return requestClient.get<EmergencyApi.EmergencyStats>(
    '/emergency/plans/stats',
  );
}

/** 应急预案详情（06C-3 补全，后端 /plans/:id 存在） */
export async function getEmergencyPlanDetail(id: number) {
  return requestClient.get<EmergencyApi.EmergencyPlan>(`/emergency/plans/${id}`);
}

/** 新增预案 */
export async function createEmergencyPlan(
  data: EmergencyApi.EmergencyFormData,
) {
  return requestClient.post('/emergency/plans', data);
}

/** 更新预案 */
export async function updateEmergencyPlan(
  id: number,
  data: Partial<EmergencyApi.EmergencyFormData>,
) {
  return requestClient.put(`/emergency/plans/${id}`, data);
}

/** 删除预案 */
export async function deleteEmergencyPlan(id: number) {
  return requestClient.delete(`/emergency/plans/${id}`);
}

/** 预案附件列表（06C-3 补全） */
export async function getPlanAttachments(id: number, version?: string) {
  return requestClient.get<EmergencyApi.PlanAttachment[]>(
    `/emergency/plans/${id}/attachments`,
    { params: version ? { version } : {} },
  );
}

/** 预案附件上传（06C-3 补全，FormData 含 file/version/uploaded_by） */
export async function uploadPlanAttachment(
  id: number,
  file: File,
  options: { version?: string; uploadedBy?: string } = {},
) {
  const formData = new FormData();
  formData.append('file', file);
  if (options.version) formData.append('version', options.version);
  if (options.uploadedBy) formData.append('uploaded_by', options.uploadedBy);
  return requestClient.post<EmergencyApi.PlanAttachment>(
    `/emergency/plans/${id}/attachments`,
    formData,
    { headers: { 'Content-Type': undefined as any } },
  );
}

/** 预案附件删除（06C-3 补全） */
export async function deletePlanAttachment(id: number, aid: number) {
  return requestClient.delete(`/emergency/plans/${id}/attachments/${aid}`);
}

/** 预案版本履历（06C-3 补全） */
export async function getPlanVersions(id: number) {
  return requestClient.get<EmergencyApi.PlanVersionRecord[]>(
    `/emergency/plans/${id}/versions`,
  );
}

/**
 * 导出应急预案（CSV/Blob）。
 * 使用 RequestClient.download() 正确返回 Blob。
 */
export async function exportEmergencyPlans() {
  return requestClient.download('/emergency/plans/export');
}

// ==================== 应急演练（drills） ====================
export namespace EmergencyDrillApi {
  /** 演练结果 */
  export type DrillResult = '优秀' | '良好' | '合格' | '不合格';

  /** 演练状态 */
  export type DrillStatus = '计划中' | '进行中' | '已完成' | '已取消';

  /** 应急演练列表项（snake_case，对齐后端返回） */
  export interface DrillRecord {
    id: number;
    /** 演练编号 */
    no?: string;
    /** 演练名称 */
    name: string;
    /** 乡镇 */
    township?: string;
    /** 演练级别 */
    drill_level?: string;
    /** 演练类型：桌面演练/功能演练/实战演练 */
    drill_type?: string;
    /** 演练日期 YYYY-MM-DD */
    drill_date?: string;
    /** 演练地点 */
    location?: string;
    /** 组织单位 */
    organizer?: string;
    /** 参演人数 */
    participants?: number;
    /** 时长（分钟） */
    duration?: number;
    /** 演练结果 */
    result?: DrillResult;
    /** 演练状态 */
    status?: DrillStatus;
    /** 关联预案ID */
    plan_id?: number | null;
    /** 关联预案名称 */
    plan_title?: string;
    /** 评估人 */
    evaluator?: string;
    /** 演练总结 */
    summary?: string;
    /** 改进措施 */
    improvements?: string;
    /** 备注 */
    remark?: string;
    created_at?: string;
    updated_at?: string;
  }

  /** 演练列表查询参数 */
  export interface DrillListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    drill_type?: string;
    result?: string;
    plan_id?: number | string;
    /** 排序字段 */
    sortField?: string;
    /** 排序方向（asc/desc） */
    sortOrder?: 'asc' | 'desc';
  }

  /** 演练统计 */
  export interface DrillStats {
    /** 本年演练次数 */
    yearCount?: number;
    /** 完成率（百分比） */
    passRate?: number;
    /** 参与人次 */
    participantsTotal?: number;
    /** 不合格次数 */
    failed?: number;
    [key: string]: any;
  }

  /** 演练表单（新增 / 编辑提交字段） */
  export interface DrillFormData {
    name: string;
    drill_type?: string;
    drill_level?: string;
    drill_date?: string;
    location?: string;
    organizer?: string;
    participants?: number;
    duration?: number;
    result?: DrillResult;
    status?: DrillStatus;
    plan_id?: number | null;
    plan_title?: string;
    township?: string;
    evaluator?: string;
    summary?: string;
    improvements?: string;
    remark?: string;
  }
}

/** 应急演练列表（服务端分页） */
export async function getDrillList(params: EmergencyDrillApi.DrillListParams) {
  return requestClient.get<{
    list: EmergencyDrillApi.DrillRecord[];
    total: number;
    page: number;
    pageSize: number;
  }>('/emergency/drills', { params });
}

/** 演练详情 */
export async function getDrillDetail(id: number) {
  return requestClient.get<EmergencyDrillApi.DrillRecord>(`/emergency/drills/${id}`);
}

/** 演练统计（基线视图裸调用 /emergency/drills/stats 的封装化，保留） */
export async function getDrillStats() {
  return requestClient.get<EmergencyDrillApi.DrillStats>('/emergency/drills/stats');
}

/** 新增演练 */
export async function createDrill(data: Partial<EmergencyDrillApi.DrillFormData>) {
  return requestClient.post('/emergency/drills', data);
}

/** 更新演练 */
export async function updateDrill(id: number, data: Partial<EmergencyDrillApi.DrillFormData>) {
  return requestClient.put(`/emergency/drills/${id}`, data);
}

/** 删除演练 */
export async function deleteDrill(id: number) {
  return requestClient.delete(`/emergency/drills/${id}`);
}

/** 导出应急演练（CSV/Blob） */
export async function exportEmergencyDrills() {
  return requestClient.download('/emergency/drills/export');
}

// ==================== 应急物资（materials） ====================
export namespace EmergencyMaterialApi {
  /** 物资状态 */
  export type MaterialStatus = 'normal' | 'expiring' | 'expired';

  /** 应急物资列表项（snake_case，对齐后端返回） */
  export interface EmergencyMaterial {
    id: number;
    /** 物资名称 */
    name: string;
    /** 类别：救援装备/个人防护/医疗急救/消防器材/通讯设备/应急照明/其他物资 */
    category?: string;
    /** 规格型号 */
    spec?: string;
    /** 数量 */
    quantity?: number;
    /** 存放位置 */
    location?: string;
    /** 责任人 */
    responsible_person?: string;
    /** 责任人ID */
    responsible_person_id?: number | null;
    /** 到期日期 YYYY-MM-DD */
    expire_date?: string | null;
    /** 状态：normal/expiring/expired */
    status?: MaterialStatus;
    /** 备注 */
    remark?: string;
    created_at?: string;
    updated_at?: string;
  }

  /** 物资列表查询参数 */
  export interface MaterialListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    category?: string;
    status?: string;
    /** 排序字段 */
    sortField?: string;
    /** 排序方向（asc/desc） */
    sortOrder?: 'asc' | 'desc';
  }

  /** 物资统计 */
  export interface MaterialStats {
    /** 物资总数 */
    total?: number;
    /** 临期（30天内） */
    expiring?: number;
    /** 已过期 */
    expired?: number;
    [key: string]: any;
  }

  /** 物资表单（新增 / 编辑提交字段） */
  export interface MaterialFormData {
    name: string;
    category?: string;
    spec?: string;
    quantity?: number;
    location?: string;
    responsible_person?: string;
    responsible_person_id?: number | null;
    expire_date?: string | null;
    status?: MaterialStatus;
    remark?: string;
  }
}

/** 应急物资列表（服务端分页） */
export async function getMaterialList(params: EmergencyMaterialApi.MaterialListParams) {
  return requestClient.get<{
    list: EmergencyMaterialApi.EmergencyMaterial[];
    total: number;
    page: number;
    pageSize: number;
  }>('/emergency/materials/list', { params });
}

/** 物资统计（基线视图裸调用 /emergency/materials/stats 的封装化，保留） */
export async function getMaterialStats() {
  return requestClient.get<EmergencyMaterialApi.MaterialStats>('/emergency/materials/stats');
}

/** 新增物资 */
export async function createMaterial(data: Partial<EmergencyMaterialApi.MaterialFormData>) {
  return requestClient.post('/emergency/materials', data);
}

/** 更新物资 */
export async function updateMaterial(id: number, data: Partial<EmergencyMaterialApi.MaterialFormData>) {
  return requestClient.put(`/emergency/materials/${id}`, data);
}

/** 删除物资 */
export async function deleteMaterial(id: number) {
  return requestClient.delete(`/emergency/materials/${id}`);
}

/** 导出应急物资（CSV/Blob） */
export async function exportMaterials() {
  return requestClient.download('/emergency/materials/export');
}

// ==================== 应急队伍（teams） ====================
export namespace EmergencyTeamApi {
  /** 应急队伍列表项（snake_case，对齐后端返回） */
  export interface EmergencyTeam {
    id: number;
    /** 队伍名称 */
    name: string;
    /** 队伍类型：专职应急队/兼职应急队/志愿消防队/专家顾问组 */
    type?: string;
    /** 所属部门 */
    department?: string;
    /** 队长 */
    leader_name?: string;
    /** 队长ID */
    leader_id?: number | null;
    /** 联系电话 */
    contact_phone?: string;
    /** 队伍描述 */
    description?: string;
    /** 队员ID数组 */
    member_ids?: number[];
    created_at?: string;
    updated_at?: string;
  }

  /** 队伍列表查询参数 */
  export interface TeamListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    type?: string;
    department?: string;
    /** 排序字段 */
    sortField?: string;
    /** 排序方向（asc/desc） */
    sortOrder?: 'asc' | 'desc';
  }

  /** 队伍统计 */
  export interface TeamStats {
    /** 队伍总数 */
    total?: number;
    /** 队伍人员数 */
    memberCount?: number;
    /** 专职队数 */
    fullTime?: number;
    /** 兼职队数 */
    partTime?: number;
    [key: string]: any;
  }

  /** 队伍表单（新增 / 编辑提交字段） */
  export interface TeamFormData {
    name: string;
    type?: string;
    department?: string;
    leader_name?: string;
    leader_id?: number | null;
    contact_phone?: string;
    description?: string;
    member_ids?: number[];
  }

  /** 队伍队员（snake_case，对齐后端 /teams/:id/members 返回） */
  export interface TeamMember {
    id: number;
    /** 队伍ID */
    team_id?: number;
    /** 员工ID */
    employee_id?: number | null;
    /** 员工姓名 */
    employee_name?: string;
    /** 员工姓名（后端双键返回 camel 键） */
    employeeName?: string;
    /** 队员角色 */
    role?: string;
    /** 联系电话 */
    phone?: string;
    created_at?: string;
    updated_at?: string;
  }
}

/** 应急队伍列表（服务端分页） */
export async function getTeamList(params: EmergencyTeamApi.TeamListParams) {
  return requestClient.get<{
    list: EmergencyTeamApi.EmergencyTeam[];
    total: number;
    page: number;
    pageSize: number;
  }>('/emergency/teams/list', { params });
}

/** 队伍统计（基线视图裸调用 /emergency/teams/stats 的封装化，保留） */
export async function getTeamStats() {
  return requestClient.get<EmergencyTeamApi.TeamStats>('/emergency/teams/stats');
}

/** 队伍队员列表（后端 /teams/:id/members，用于展示队员人数） */
export async function getTeamMembers(id: number) {
  return requestClient.get<EmergencyTeamApi.TeamMember[]>(
    `/emergency/teams/${id}/members`,
  );
}

/** 新增队伍 */
export async function createTeam(data: Partial<EmergencyTeamApi.TeamFormData>) {
  return requestClient.post('/emergency/teams', data);
}

/** 更新队伍 */
export async function updateTeam(id: number, data: Partial<EmergencyTeamApi.TeamFormData>) {
  return requestClient.put(`/emergency/teams/${id}`, data);
}

/** 删除队伍 */
export async function deleteTeam(id: number) {
  return requestClient.delete(`/emergency/teams/${id}`);
}

/** 一键生成队伍：依据组织管理（环卫/市政绿化作业中心 → 乡镇/公园）自动生成应急救援小队 */
export async function generateTeams() {
  return requestClient.post<{ created: number; hwCount: number; greenCount: number }>(
    '/emergency/teams/generate',
  );
}

/** 导出应急队伍（CSV/Blob） */
export async function exportTeams() {
  return requestClient.download('/emergency/teams/export');
}

// ==================== 应急事件（events） ====================
export namespace EmergencyEventApi {
  /** 应急事件列表项（snake_case，对齐后端返回） */
  export interface EmergencyEvent {
    id: number;
    /** 事件标题 */
    title: string;
    /** 事件类型 */
    event_type?: string;
    /** 事件等级：一级/二级/三级/四级 */
    event_level?: string;
    /** 发生时间 YYYY-MM-DD HH:mm:ss */
    happen_time?: string | null;
    /** 发生地点 */
    location?: string;
    /** 报告人 */
    reporter?: string;
    /** 状态：已接报/响应中/处置中/已结案 */
    status?: string;
    /** 响应过程 */
    response_process?: string;
    /** 处置措施 */
    handling_measures?: string;
    /** 处置结果 */
    result?: string;
    /** 关联预案ID */
    related_plan_id?: number | null;
    /** 关联演练ID */
    related_drill_id?: number | null;
    /** 关联人员ID */
    personnel_id?: number | null;
    /** 备注 */
    remark?: string;
    created_at?: string;
    updated_at?: string;
  }

  /** 事件列表查询参数 */
  export interface EventListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    event_level?: string;
    status?: string;
    /** 排序字段 */
    sortField?: string;
    /** 排序方向（asc/desc） */
    sortOrder?: 'asc' | 'desc';
  }

  /** 事件统计 */
  export interface EventStats {
    /** 本年事件数 */
    total?: number;
    /** 处置中 */
    handling?: number;
    /** 已结案 */
    closed?: number;
    /** 平均处置时长（小时） */
    avgDuration?: number;
    [key: string]: any;
  }

  /** 事件表单（新增 / 编辑提交字段） */
  export interface EventFormData {
    title: string;
    event_type?: string;
    event_level?: string;
    happen_time?: string | null;
    location?: string;
    reporter?: string;
    status?: string;
    response_process?: string;
    handling_measures?: string;
    result?: string;
    related_plan_id?: number | null;
    related_drill_id?: number | null;
    personnel_id?: number | null;
    remark?: string;
  }
}

/** 应急事件列表（服务端分页） */
export async function getEventList(params: EmergencyEventApi.EventListParams) {
  return requestClient.get<{
    list: EmergencyEventApi.EmergencyEvent[];
    total: number;
    page: number;
    pageSize: number;
  }>('/emergency/events/list', { params });
}

/** 事件统计（基线视图裸调用 /emergency/events/stats 的封装化，保留） */
export async function getEventStats() {
  return requestClient.get<EmergencyEventApi.EventStats>('/emergency/events/stats');
}

/** 新增事件 */
export async function createEvent(data: Partial<EmergencyEventApi.EventFormData>) {
  return requestClient.post('/emergency/events', data);
}

/** 更新事件 */
export async function updateEvent(id: number, data: Partial<EmergencyEventApi.EventFormData>) {
  return requestClient.put(`/emergency/events/${id}`, data);
}

/** 删除事件 */
export async function deleteEvent(id: number) {
  return requestClient.delete(`/emergency/events/${id}`);
}

/** 导出应急事件（CSV/Blob） */
export async function exportEvents() {
  return requestClient.download('/emergency/events/export');
}
