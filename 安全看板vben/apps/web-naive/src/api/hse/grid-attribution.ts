/**
 * 通道 B 待归属管理 —— 前端 API 客户端（web-naive）
 *
 * 对应后端路由：server/routes/hse-grid-attribution.js（阶段 P2-B1-D-IMPLEMENTATION-04-B）
 * 路由前缀：/grid-attribution（requestClient baseURL = /api，故完整路径 /api/grid-attribution/...）
 *
 * 本文件仅为「前端粘合层」，不新增任何后端逻辑 / 字段 / 端点。
 * 后端已实现：
 *   GET  /grid-attribution/pending    待归属列表（严格 pending + 双 NULL）
 *   POST /grid-attribution/attribute  人工归属（仅接受 record_id + candidate_employee_id）
 *   DELETE /grid-attribution/revoke   撤销归属（04-E-B 起前端在已归属页消费；请求体仅 { record_id }）
 *   GET  /grid-attribution/attributed 已归属记录查询（04-D-B，只读，真分页）
 *
 * 权限：requireRole('admin','hse_manager','safety_manager')（后端强制，前端 authority 仅控制可见性）
 *
 * 响应约定（与 @vben/request 拦截器对齐，见 api/request.ts successCode:0）：
 *   - GET 成功：{ code:0, data: rows[], total } → 拦截器解包 data 字段，返回 rows[]（本项目只消费数组）
 *   - POST 成功：{ success:true, code:0, data:{...} } → 正常 resolve（调用方直接 await 即可）
 *   - POST 失败：{ success:false, code:'GRID_NONE'|'GRID_MULTIPLE'|'RECORD_NOT_PENDING'|..., message }
 *     以 HTTP 4xx/5xx 返回 → 业务码在【被抛出的响应体】上（err.code / err.message）。
 *     ⚠️ requestClient 的 catch 抛出的就是响应体本身：
 *        packages/effects/request/src/request-client.ts → `throw error.response ? error.response.data : error;`
 *        因此读取 err.code / err.message 即可（禁按 err.response.status 判断）。
 *   - 兼容说明：若后端为「success 时 code=HTTP 状态码(200)」的旧版本（未重启加载 04-B 修复），
 *     该响应会被 defaultResponseInterceptor 判为错误并抛出，抛出物同样是响应体（success===true），
 *     页面层已保留该兼容判定。
 */
import { requestClient } from '#/api/request';

/** 待归属记录（严格对齐后端 GET /pending 返回的 snake_case 字段；05-E-B 起后端扩展展示列） */
export interface PendingAttributionRecord {
  id: number;
  /** 记录编号（WPS 业务序号） */
  serial_no?: string | null;
  /** 巡查日期 yyyy-MM-dd */
  inspection_date?: string | null;
  /** 作业区域 / 片区（乡镇） */
  area_team?: string | null;
  /** 巡查人员姓名（历史业务字段，仅供 admin 人工比对，禁自动绑定） */
  personnel_name?: string | null;
  /** 网格层级 */
  grid_level?: string | null;
  /** 岗位 */
  position?: string | null;
  /** 违规人员姓名（真正的被检查对象） */
  violator_name?: string | null;
  /** 违章行为描述 */
  violation_behavior?: string | null;
  /** 上传时间（WPS 提交时间） */
  upload_time?: string | null;
  /** 归属状态（待归属列表恒为 'pending'） */
  attribution_status?: string | null;
  /** 创建时间 */
  created_at?: string | null;
  /** 更新时间 */
  updated_at?: string | null;
}

const BASE = '/grid-attribution';

/**
 * 获取待归属记录列表（通道 B 回流后尚未完成正式人员归属的数据）。
 * 仅返回 attribution_status='pending' 且 inspector_employee_id / grid_id 均为 NULL 的行。
 * 后端硬编码 limit=500 / offset=0（一次性返回，无真实分页）；本阶段直接接受该上限。
 */
export async function getPendingAttributionRecords(params?: {
  limit?: number;
  offset?: number;
}) {
  // 拦截器解包 data 字段 → 返回 rows 数组
  return requestClient.get<PendingAttributionRecord[]>(`${BASE}/pending`, {
    params: {
      limit: params?.limit ?? 500,
      offset: params?.offset ?? 0,
    },
  });
}

/**
 * 人工归属：将一条待归属记录归属给指定候选员工。
 * 注意：仅提交 record_id + candidate_employee_id；grid_id / inspector_employee_id / 归属状态等
 * 一律由服务端派生与写入（fail-closed，禁止客户端推断）。
 *
 * 成功：后端返回 code=0 → 正常 resolve。
 * 失败：抛出错误；业务码位置见文件头「响应约定」（优先 err.data.code，其次 err.response.data.code）。
 */
export async function attributeRecord(data: {
  record_id: number;
  candidate_employee_id: number;
}) {
  return requestClient.post(`${BASE}/attribute`, data);
}

// ===================== 撤销归属（04-E-B，仅消费既有后端 API） =====================

/**
 * 撤销人工归属：manual_confirmed → pending（后端 04-B 已实现，04-E-A 已审计，前端只消费）。
 *
 * ⚠️ 请求体【只允许】 { record_id }：
 *   - reason 不进入 UI（04-E-A DECISION-01=A），后端对其仅打日志、不持久化；
 *   - 禁止提交 old_employee_id / old_grid_id / inspector_employee_id / grid_id /
 *     attribution_status / operator_id / operator_user_id 等任何身份/状态字段
 *     （后端一律忽略，旧值由服务端 SELECT ... FOR UPDATE 读取）。
 *
 * 成功：{ code:0 } → 正常 resolve。
 * 失败：抛出错误（错误体即响应体，读 err.code / err.message）：
 *   NOT_REVOCABLE（状态非 manual_confirmed）/ RECORD_NOT_FOUND / REVOKE_CONFLICT。
 * 并发安全由后端 FOR UPDATE + 条件 UPDATE 守卫保证，前端不得自行重试。
 */
export async function revokeRecord(params: { record_id: number }) {
  return requestClient.delete(`${BASE}/revoke`, {
    data: { record_id: params.record_id },
  });
}

// ===================== 已归属记录查询（04-D-B，只读） =====================

/** 已归属记录（严格对齐后端 GET /attributed 返回的 snake_case 字段） */
export interface AttributedRecord {
  id: number;
  serial_no?: string | null;
  /** 巡查日期 yyyy-MM-dd */
  inspection_date?: string | null;
  area_team?: string | null;
  personnel_name?: string | null;
  violator_name?: string | null;
  violation_behavior?: string | null;
  grid_id?: number | null;
  inspector_employee_id?: number | null;
  /** 'attributed' | 'manual_confirmed'（服务端冻结状态机，前端不得自造状态） */
  attribution_status?: string | null;
  created_at?: string | null;
  /** LEFT JOIN employee.name —— 巡查人姓名（服务端联表，前端不做 id→姓名二次请求） */
  inspector_name?: string | null;
  /** LEFT JOIN grid_areas.name —— 网格名称 */
  grid_name?: string | null;
  grid_township?: string | null;
}

/** GET /attributed 响应 data（真分页：服务端 LIMIT/OFFSET + 独立 count） */
export interface AttributedPage {
  total: number;
  page: number;
  pageSize: number;
  list: AttributedRecord[];
}

/**
 * 已归属记录查询（只读）。
 * 状态由服务端固定为 attribution_status IN ('attributed','manual_confirmed')；
 * 客户端仅可提交 page / pageSize / keyword（serial_no / personnel_name / violator_name 模糊、
 * 或纯数字时按记录 ID 精确匹配）。不接受亦不需要 grid_id / inspector_employee_id /
 * attribution_status 等身份/网格参数（服务端忽略）。
 */
export async function listAttributedRecords(params?: {
  page?: number;
  pageSize?: number;
  keyword?: string;
}) {
  // 拦截器解包 data 字段 → 返回 { total, page, pageSize, list }
  return requestClient.get<AttributedPage>(`${BASE}/attributed`, {
    params: {
      page: params?.page ?? 1,
      pageSize: params?.pageSize ?? 20,
      ...(params?.keyword && params.keyword.trim() !== ''
        ? { keyword: params.keyword.trim() }
        : {}),
    },
  });
}
