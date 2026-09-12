import { requestClient } from '#/api/request';

export namespace EmergencyApi {
  export type ExpiryStatus = 'normal' | 'expiring' | 'expired' | 'permanent' | 'unknown';

  export interface EmergencyPlan {
    id: number;
    title: string;
    type: 'comprehensive' | 'special' | 'site';
    level: 'level1' | 'level2' | 'level3' | 'level4';
    status: 'active' | 'published' | 'pending' | 'review';
    department: string;
    responsiblePerson: string;
    responsiblePersonId?: number | null;
    contactPhone: string;
    description: string;
    procedures: string;
    resources: string;
    effectiveDate?: string;
    validityPeriod?: number;
    expiryStatus?: ExpiryStatus;
    updatedAt: string;
    createdAt: string;
    // 兼容冻结的 index.vue 范例文件(1452 行多 Tab, P2-1 待重构, 红线禁改): R4 已从活跃预案子页移除 version,
    // 此处保留为可选字段以避免破坏该范例文件的类型检查。
    version?: string;
  }

  export interface PlanAttachment {
    id: number;
    planId: number;
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

  export interface PlanVersionRecord {
    id: number;
    planId: number;
    version: string;
    changeType: string;
    changeSummary: string;
    changedBy: string;
    createdAt: string;
  }

  export interface DrillRecord {
    id: number;
    no: string;
    drillDate: string;
    township: string;
    name: string;
    drillLevel: string;
    drillType: string;
    participants: number;
    duration: number;
    location: string;
    organizer: string;
    result: '优秀' | '良好' | '合格' | '不合格';
    remark: string;
    status: '计划中' | '进行中' | '已完成' | '已取消';
    createdAt?: string;
    updatedAt?: string;
    // 兼容冻结的 index.vue 范例文件(1452 行多 Tab, P2-1 待重构, 红线禁改): 旧字段保留为可选, 不影响活跃子页
    planId?: number | null;
    planTitle?: string;
    evaluator?: string;
    summary?: string;
    improvements?: string;
  }

  export interface DrillListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    drillType?: string;
    result?: string;
    planId?: number;
  }

  export interface EmergencyListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    type?: string;
    level?: string;
    status?: string;
  }

  export interface EmergencyStats {
    totalPlans: number;
    activePlans: number;
    totalDrills: number;
    excellentDrills: number;
    participantsTotal: number;
    byType: Record<string, number>;
  }
}

export async function getEmergencyPlanList(params: EmergencyApi.EmergencyListParams) {
  return requestClient.get<{ list: EmergencyApi.EmergencyPlan[]; total: number }>(
    '/emergency/plans',
    { params },
  );
}

export async function getEmergencyStats() {
  return requestClient.get<EmergencyApi.EmergencyStats>('/emergency/stats');
}

export async function getEmergencyPlanDetail(id: number) {
  return requestClient.get<EmergencyApi.EmergencyPlan>(`/emergency/plans/${id}`);
}

export async function createEmergencyPlan(data: Partial<EmergencyApi.EmergencyPlan>) {
  return requestClient.post<EmergencyApi.EmergencyPlan>('/emergency/plans', data);
}

export async function updateEmergencyPlan(id: number, data: Partial<EmergencyApi.EmergencyPlan>) {
  return requestClient.put<EmergencyApi.EmergencyPlan>(`/emergency/plans/${id}`, data);
}

export async function deleteEmergencyPlan(id: number) {
  return requestClient.delete(`/emergency/plans/${id}`);
}

// ========== 附件管理 ==========
export async function getPlanAttachments(id: number, version?: string) {
  return requestClient.get<EmergencyApi.PlanAttachment[]>(
    `/emergency/plans/${id}/attachments`,
    { params: version ? { version } : {} },
  );
}

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

export async function deletePlanAttachment(id: number, aid: number) {
  return requestClient.delete(`/emergency/plans/${id}/attachments/${aid}`);
}

// ========== 版本管理 ==========
export async function getPlanVersions(id: number) {
  return requestClient.get<EmergencyApi.PlanVersionRecord[]>(
    `/emergency/plans/${id}/versions`,
  );
}

// ========== 报表导出 ==========
export async function exportEmergencyPlans() {
  return requestClient.get<Blob>('/emergency/plans/export', {
    responseType: 'blob',
  });
}

export async function exportEmergencyDrills() {
  return requestClient.get<Blob>('/emergency/drills/export', {
    responseType: 'blob',
  });
}

export async function getDrillList(params: EmergencyApi.DrillListParams) {
  return requestClient.get<{ list: EmergencyApi.DrillRecord[]; total: number }>(
    '/emergency/drills',
    { params },
  );
}

export async function getDrillDetail(id: number) {
  return requestClient.get<EmergencyApi.DrillRecord>(`/emergency/drills/${id}`);
}

export async function createDrill(data: Partial<EmergencyApi.DrillRecord>) {
  return requestClient.post<EmergencyApi.DrillRecord>('/emergency/drills', data);
}

export async function updateDrill(id: number, data: Partial<EmergencyApi.DrillRecord>) {
  return requestClient.put<EmergencyApi.DrillRecord>(`/emergency/drills/${id}`, data);
}

export async function deleteDrill(id: number) {
  return requestClient.delete(`/emergency/drills/${id}`);
}

// ========== 应急物资（materials） ==========
// 字段名严格对齐后端 formatMaterialRow 返回的 camelCase
export interface EmergencyMaterial {
  id: number;
  name: string;
  category: string;
  spec: string;
  quantity: number;
  location: string;
  responsiblePerson: string;
  // 表单层字段（后端 emergency_materials 无此独立列，仅 UI 使用），可选
  responsiblePersonId?: number | null;
  expireDate?: string | null;
  status?: string;
  remark?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MaterialListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  category?: string;
  status?: string;
}

export async function getMaterialList(params: MaterialListParams) {
  return requestClient.get<{ list: EmergencyMaterial[]; total: number }>(
    '/emergency/materials/list',
    { params },
  );
}

export async function createMaterial(data: Partial<EmergencyMaterial>) {
  return requestClient.post<EmergencyMaterial>('/emergency/materials', data);
}

export async function updateMaterial(id: number, data: Partial<EmergencyMaterial>) {
  return requestClient.put<EmergencyMaterial>(`/emergency/materials/${id}`, data);
}

export async function deleteMaterial(id: number) {
  return requestClient.delete(`/emergency/materials/${id}`);
}

export async function exportMaterials() {
  return requestClient.get<Blob>('/emergency/materials/export', {
    responseType: 'blob',
  });
}

// ========== 应急队伍（teams） ==========
// 字段名严格对齐后端 formatTeamRow 返回的 camelCase
export interface EmergencyTeam {
  id: number;
  name: string;
  type: string;
  department: string;
  leaderId?: number | null;
  leaderName: string;
  contactPhone: string;
  description: string;
  memberIds?: number[];
  createdAt?: string;
  updatedAt?: string;
}

export interface TeamListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  type?: string;
  department?: string;
}

export async function getTeamList(params: TeamListParams) {
  return requestClient.get<{ list: EmergencyTeam[]; total: number }>(
    '/emergency/teams/list',
    { params },
  );
}

export async function createTeam(data: Partial<EmergencyTeam>) {
  return requestClient.post<EmergencyTeam>('/emergency/teams', data);
}

export async function updateTeam(id: number, data: Partial<EmergencyTeam>) {
  return requestClient.put<EmergencyTeam>(`/emergency/teams/${id}`, data);
}

export async function deleteTeam(id: number) {
  return requestClient.delete(`/emergency/teams/${id}`);
}

export async function exportTeams() {
  return requestClient.get<Blob>('/emergency/teams/export', {
    responseType: 'blob',
  });
}

// ========== 应急事件（events） ==========
// 字段名严格对齐后端 formatEventRow 返回的 camelCase
export interface EmergencyEvent {
  id: number;
  title: string;
  eventType: string;
  eventLevel: string;
  happenTime?: string | null;
  location: string;
  reporter: string;
  status: string;
  responseProcess?: string;
  handlingMeasures?: string;
  result?: string;
  relatedPlanId?: number | null;
  relatedDrillId?: number | null;
  personnelId?: number | null;
  remark?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface EventListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  event_level?: string;
  status?: string;
}

export async function getEventList(params: EventListParams) {
  return requestClient.get<{ list: EmergencyEvent[]; total: number }>(
    '/emergency/events/list',
    { params },
  );
}

export async function createEvent(data: Partial<EmergencyEvent>) {
  return requestClient.post<EmergencyEvent>('/emergency/events', data);
}

export async function updateEvent(id: number, data: Partial<EmergencyEvent>) {
  return requestClient.put<EmergencyEvent>(`/emergency/events/${id}`, data);
}

export async function deleteEvent(id: number) {
  return requestClient.delete(`/emergency/events/${id}`);
}

export async function exportEvents() {
  return requestClient.get<Blob>('/emergency/events/export', {
    responseType: 'blob',
  });
}
