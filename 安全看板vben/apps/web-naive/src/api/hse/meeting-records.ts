/**
 * HSE 安全会议出席记录 API 适配层（web-naive）
 * 契约来源：server/routes/hse-meeting-records.js（唯一契约来源）。
 * 端点：/hse/meeting-records（服务端挂载于 /api/hse/meeting-records）。
 * 全量使用 requestClient（JSON）。字段为后端 camelCase 风格。
 */
import { requestClient } from '#/api/request';

const BASE = '/hse/meeting-records';

export namespace MeetingRecordApi {
  export interface MeetingRecord {
    id: number;
    meetingCode: string;
    meetingName: string;
    meetingDate: string;
    meetingType: string;
    organizer: string;
    employeeId: number;
    employeeCode: string;
    employeeName: string;
    position: string;
    attendanceStatus: 'attend' | 'absent' | 'not_required';
    signTime: string;
    remark: string;
    createdAt: string;
    updatedAt: string;
  }

  export interface MeetingGroup {
    meetingCode: string;
    meetingName: string;
    meetingDate: string;
    createdDate: string;
    total: number;
    attend: number;
    absent: number;
    notRequired: number;
  }

  export interface Stats {
    total: number;
    attend: number;
    absent: number;
    meetings: number;
  }

  export interface ListResult {
    list: MeetingRecord[];
    total: number;
    page: number;
    size: number;
  }

  export interface MeetingGroupResult {
    list: MeetingGroup[];
    total: number;
    page: number;
    size: number;
  }

  export interface Attendee {
    employeeId: number;
    employeeName?: string;
    employeeCode?: string;
    position?: string;
    attendanceStatus?: 'attend' | 'absent' | 'not_required';
    remark?: string;
  }

  export interface CreateMeetingPayload {
    meetingName: string;
    meetingDate: string;
    meetingType?: string;
    organizer?: string;
    attendees: Attendee[];
  }
}

export function getMeetingRecordList(params: {
  page?: number;
  size?: number;
  meeting_code?: string;
  meeting_name?: string;
  meeting_date?: string;
  attendance_status?: string;
  employee_id?: number;
  keyword?: string;
}) {
  return requestClient.get<MeetingRecordApi.ListResult>(`${BASE}`, { params });
}

export function getMeetingStats(params?: { meeting_date?: string; meeting_code?: string }) {
  return requestClient.get<MeetingRecordApi.Stats>(`${BASE}/stats`, { params });
}

export function getMeetingGroups(params: { page?: number; size?: number; meeting_code?: string; keyword?: string }) {
  return requestClient.get<MeetingRecordApi.MeetingGroupResult>(`${BASE}/meetings`, { params });
}

export function getMeetingDetail(meetingCode: string) {
  return requestClient.get<MeetingRecordApi.MeetingRecord[]>(`${BASE}/meetings/${meetingCode}`);
}

export function createMeeting(payload: MeetingRecordApi.CreateMeetingPayload) {
  return requestClient.post<{ meetingCode: string; meetingName: string; meetingDate: string; list: MeetingRecordApi.MeetingRecord[] }>(
    `${BASE}`,
    payload,
  );
}

export function updateMeetingRecord(id: number, payload: { attendanceStatus?: string; remark?: string }) {
  return requestClient.put<MeetingRecordApi.MeetingRecord>(`${BASE}/${id}`, payload);
}

export function deleteMeetingRecord(id: number) {
  return requestClient.delete<void>(`${BASE}/${id}`);
}