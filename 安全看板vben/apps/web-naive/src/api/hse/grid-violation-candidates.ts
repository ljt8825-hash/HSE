/**
 * 三违候选管理 —— 前端 API 客户端（web-naive · P2-B1-E-06-IMPLEMENT）
 *
 * 对应后端路由：server/routes/hse-grid-violation-candidates.js
 * 路由前缀：/grid-violation-candidates（requestClient baseURL = /api）
 *
 * 权限：requireRole('admin','hse_manager','safety_manager')（后端强制；前端 authority 仅控制可见性）
 *
 * 响应约定（与 @vben/request 拦截器对齐，successCode:0）：
 *   - GET 成功：{ code:0, data } → 拦截器解包 data 字段；
 *   - POST 失败：以 HTTP 4xx/5xx 返回，业务码在【被抛出的响应体】上（err.code / err.message），
 *     requestClient 的 catch 抛出的就是响应体本身（禁按 err.response.status 判断）。
 *
 * 边界：本文件仅为前端粘合层。候选确认/驳回均为人工作业（无自动处罚端点）；
 *       confirmed_by/confirmed_at/source_type 等一律由服务端写入，客户端不得提交。
 */
import { requestClient } from '#/api/request';

const BASE = '/grid-violation-candidates';

/** 候选行（严格对齐后端 GET / 返回的 snake_case 字段） */
export interface GridViolationCandidate {
  id: number;
  /** 溯源：网格巡查记录 id */
  grid_record_id: number;
  behavior_id: number;
  /** 命中的原子行为文本 */
  behavior_text: string;
  /** gir 原文快照（组合/矛盾行保留） */
  raw_violation_behavior: string;
  /** 推荐三违类型（违反劳动纪律） */
  candidate_type: string;
  /** 命中说明（MATCH:SANWEI-SW-xxx / CONTRADICTION_WITH_NO_VIOLATION 等） */
  candidate_reason?: string | null;
  /** 检查来源：company/township/self/unknown（生成时推导，确认时可修正） */
  inspection_source: string;
  /** pending/confirmed/rejected/revoked */
  candidate_status: string;
  /** 推荐分值（仅展示：company→5，else→0；不作扣分依据） */
  suggested_score: string | number;
  suggested_rule_id?: number | null;
  evidence_snapshot?: Record<string, any> | null;
  confirmed_violation_id?: number | null;
  confirmed_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  // —— gir 联表展示字段 ——
  inspection_date?: string | null;
  violator_name?: string | null;
  personnel_name?: string | null;
  area_team?: string | null;
  grid_level?: string | null;
  position?: string | null;
  serial_no?: string | null;
  behavior_code?: string | null;
  dict_behavior_name?: string | null;
}

/** GET / 响应 data（服务端真分页） */
export interface CandidatePage {
  total: number;
  page: number;
  pageSize: number;
  list: GridViolationCandidate[];
}

/** 候选列表（服务端固定：status 缺省只返回 pending+confirmed） */
export async function listCandidates(params?: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
}) {
  return requestClient.get<CandidatePage>(`${BASE}`, {
    params: {
      page: params?.page ?? 1,
      pageSize: params?.pageSize ?? 20,
      ...(params?.keyword && params.keyword.trim() !== ''
        ? { keyword: params.keyword.trim() }
        : {}),
      ...(params?.status ? { status: params.status } : {}),
    },
  });
}

/** 候选识别 dry-run（只读统计，不写任何表） */
export async function dryRunCandidates() {
  return requestClient.get<Record<string, any>>(`${BASE}/dry-run`);
}

/** 批量候选生成（显式触发，幂等；仅可选 grid_record_ids，其余服务端决定） */
export async function generateCandidates(data?: { grid_record_ids?: number[] }) {
  return requestClient.post(`${BASE}/generate`, data ?? {});
}

/** 可修正标准行为（字典驱动，确认弹窗下拉；仅 enabled 且违反劳动纪律类） */
export interface CorrectableBehavior {
  id: number;
  behavior_code: string;
  behavior_name: string;
  behavior_type: string;
  aliases?: string[] | null;
}

/** GET /dict —— 标准行为字典（E-07：behavior_id 修正下拉数据源） */
export async function listCorrectableBehaviors() {
  return requestClient.get<CorrectableBehavior[]>(`${BASE}/dict`);
}

/** GET /:id —— 详情 + 完整证据链（candidate→gir→vr→audit） */
export async function getCandidateDetail(id: number) {
  return requestClient.get<Record<string, any>>(`${BASE}/${id}`);
}

/**
 * 人工确认候选（可修正检查来源 inspection_source；必要时可修正标准行为 behavior_id）。
 * confirmed_by/at、candidate_id、source_type 等由服务端写入（客户端不得提交）。
 * 失败业务码：CANDIDATE_NOT_PENDING / ALREADY_CONFIRMED / CONFIRM_CONFLICT /
 *            INVALID_INSPECTION_SOURCE / BEHAVIOR_NOT_IN_DICT / BEHAVIOR_NOT_VIOLATION
 */
export async function confirmCandidate(
  id: number,
  data?: { inspection_source?: string; behavior_id?: number },
) {
  return requestClient.post(`${BASE}/${id}/confirm`, data ?? {});
}

/** 驳回候选（pending → rejected，不生成正式记录） */
export async function rejectCandidate(id: number, data?: { rejection_reason?: string }) {
  return requestClient.post(`${BASE}/${id}/reject`, data ?? {});
}

/** 撤销确认（confirmed → revoked；正式记录软删） */
export async function revokeCandidate(id: number, data?: { reason?: string }) {
  return requestClient.post(`${BASE}/${id}/revoke`, data ?? {});
}
