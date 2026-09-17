/**
 * H5-GRID-UI-01：当前登录员工上下文封装（复用既有正式端点 GET /api/current-employee）
 *
 * 审计依据（只读既有实现，未改动任何后端）：
 *   - server/routes/current-employee.js → GET /api/current-employee（authMiddleware 鉴权）
 *   - server/services/currentEmployeeContext.js → resolveCurrentEmployee()：
 *       由 JWT req.user 解析 employeeId / employeeCode / employeeName /
 *       organization / operationUnit / position / assignmentStatus（fail-closed）。
 *
 * 用途（本次冻结范围）：
 *   - 工作台 / 开始巡查页展示「当前登录人员 + employee_code + 网格长身份」；
 *   - employee_code 是稳定业务身份（手机号只是登录凭据），提交时身份仍由服务端
 *     权威派生（req.user → employee），H5 不提交任何身份字段。
 */
import { requestClient } from '#/api/request';

export interface CurrentEmployeeContext {
  assignmentStatus: null | string;
  employeeCode: string;
  employeeId: number;
  employeeName: string;
  /** v_employee_current 无网格等级列，服务端固定返回 null（展示时以岗位/组织兜底） */
  gridLevel: null | string;
  operationUnit: null | string;
  organization: null | string;
  position: null | string;
  userId: number;
}

/** 当前员工身份解析结果（ok=false 时 reason 为服务端 fail-closed 原因码） */
export type CurrentEmployeeResult =
  | { ok: true; context: CurrentEmployeeContext }
  | { ok: false; message: string; reason: string };

/**
 * 拉取当前登录员工上下文。
 * 服务端身份解析失败时返回 HTTP 422 + { code:-1, data:{ resolved:false, reason } }，
 * 此处归一化为 { ok:false }，由调用方做 fail-closed 展示。
 */
export async function getCurrentEmployeeContext(): Promise<CurrentEmployeeResult> {
  try {
    const res = await requestClient.get<{
      context: CurrentEmployeeContext;
      resolved: boolean;
    }>('/current-employee');
    if (res?.resolved && res.context) {
      return { ok: true, context: res.context };
    }
    return { ok: false, message: '身份解析失败，请联系管理员', reason: 'unresolved' };
  } catch (err) {
    const e = err as any;
    const body = e?.response?.data ?? e ?? {};
    const inner = body?.data ?? {};
    return {
      ok: false,
      message: String(body?.message ?? '身份解析服务暂不可用，请稍后重试'),
      reason: String(inner?.reason ?? 'lookup_failed'),
    };
  }
}
