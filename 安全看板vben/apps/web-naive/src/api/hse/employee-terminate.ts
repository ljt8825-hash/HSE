/**
 * 终态登记（terminate）前端契约模块 — web-naive
 *
 * 背景（B02-DEC-03.34 / A-02A）：
 *   A-02A 已在后端落地单事务终态登记出口 `POST /api/hse/employee/org/terminate`，
 *   但 web-naive 人员管理页此前没有任何入口，人事只能直接调接口。
 *   本模块把「谁能看到入口 / 终态类型怎么校验 / 业务日期怎么校验与转换 / 请求体长什么样 / 错误怎么取」
 *   收敛成纯函数，供 `TerminalModal.vue` 与 `index.vue` 共用，并可被 vitest 直接覆盖。
 *
 * 本模块的硬约束（对应任务书 §3 / §4 / §5）：
 *   1. 入口显示**只**依据服务端派生标记 `is_terminal_relation`。
 *      该标记由 `employeeService.listEmployees` 计算，与后端 `terminateEmployee` 的关系闸门同源
 *      （同一常量集合 `TERMINAL_RELATION_VALUES`）：关系为 辞职 / 死亡 / 退休 → true，其余 → false。
 *      因此：
 *        - 关系为 `正式员工` / NULL / 空串 / 未知值 → 标记为 false → 展示入口（后端会按规则拦截待核实者）；
 *        - **不得**用 `org_status` 反推：displayStatusSql 的 ELSE 分支会回落到 `ev.assignment_status`，
 *          关系为 NULL 但任职段状态恰为终态编码时同样返回一个终态标签，用它当条件会把后端必然拒绝的人
 *          显示成「可登记」。
 *   2. 前端判断仅为交互体验，**资格权威永远在后端事务内**（`FOR UPDATE` + 关系判定 + 任职段唯一性）。
 *   3. 业务事件日期初始为 `null`（空），必须由操作人显式选择；**禁止 `Date.now()` 预填今天**，
 *      也禁止把「系统登记时间」当业务事件日期。系统登记时间由后端写，前端不参与。
 *   4. 请求体只允许出现后端 `terminateEmployee` 解构过的字段（employee_id / terminal_type / event_date /
 *      remark），不夹带 `employment_relation` / `status` / `leave_date`，避免「前端本地赋值伪造终态成功」。
 *   5. 终态类型只接受「辞职 / 死亡 / 退休」，不得用笼统的「离职」代替具体关系（与后端一致）。
 */
import type { EmployeeApi } from './employee';

/** 终态登记的三种合法类型（与后端 TERMINATION_RELATION_MAP 的键一致） */
export const TERMINAL_TYPES: ReadonlyArray<{ label: string; value: EmployeeApi.OrgTerminateFormData['terminal_type'] }> = [
  { label: '辞职', value: '辞职' },
  { label: '死亡', value: '死亡' },
  { label: '退休', value: '退休' },
] as const;

/** 后端 `isIsoDateString` 接受的日期形态：必须 YYYY-MM-DD */
export const TERMINATE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 只读地描述一个列表行中与终态登记入口相关的字段（不引入视图类型耦合） */
export interface TerminateCandidateRow {
  id?: number;
  name?: string;
  /** 服务端派生布尔：当前用工关系是否处于终态集合（辞职/死亡/退休） */
  is_terminal_relation?: boolean | null;
  /** 仅用于测试反例（证明不能拿它反推资格） */
  org_status?: string | null;
  /** 仅用于测试反例（列表接口当前并不返回该列原值） */
  employment_relation?: string | null;
}

/** 终态登记弹窗的表单状态（`event_date` 用时间戳承载 NDatePicker 的值，初始为 null） */
export interface TerminateFormState {
  terminal_type: EmployeeApi.OrgTerminateFormData['terminal_type'] | null;
  /** NDatePicker 绑定值：时间戳（毫秒）；初始 null = 未选择 */
  event_date: number | null;
  remark: string;
}

/**
 * 该行是否「尚未处于终态」（可展示登记入口）。
 * 只认服务端派生标记严格不等于 `true`；`undefined` / `null` / 其他形态一律视为可展示。
 * 注意：这是交互层展示条件，真正的资格（含 正式员工 / 待核实 区分）由后端事务决定。
 */
export function isNotTerminalRow(row?: null | TerminateCandidateRow): boolean {
  return row?.is_terminal_relation !== true;
}

/**
 * 是否展示可用的终态登记入口。
 * 条件 = 当前用户有人员增改权限 **且** 该行尚未处于终态。
 * `org_status` / `employment_relation` 均**不参与**判断（见文件头第 1 条）。
 */
export function canShowTerminateEntry(
  row?: null | TerminateCandidateRow,
  canEdit: boolean = false,
): boolean {
  return canEdit === true && isNotTerminalRow(row);
}

/**
 * 行操作项（与 NDropdown options 的 { key, label } 结构对齐）。
 * 用 type 而非 interface：naive-ui 的 `MenuOption` 带 `[key: string]: unknown` 索引签名，
 * 只有类型别名会获得隐式索引签名；interface 会因此不兼容（vue-tsc TS2322，
 * 与 `employee-rehire.ts` 的 `RowActionOption` 同一处理）。
 */
export type RowActionOption = {
  key: string;
  label: string;
};

/**
 * 构造终态登记菜单项（仅当可展示时出现）。
 * 集中到此处是为了让「不误显示 / 不回归」可被自动化断言，而不是散落在模板里。
 */
export function buildTerminateAction(
  row: TerminateCandidateRow | undefined,
  canEdit: boolean,
): RowActionOption[] {
  if (canShowTerminateEntry(row, canEdit)) {
    return [{ key: 'terminate', label: '终态登记' }];
  }
  return [];
}

/**
 * 弹窗初始状态。
 * `event_date` 必须是 `null` —— 任何「默认今天」的实现都会让 §3 的强制显式填写失效。
 */
export function createTerminateFormState(): TerminateFormState {
  return {
    terminal_type: null,
    event_date: null,
    remark: '',
  };
}

/**
 * NDatePicker 时间戳 → `YYYY-MM-DD`。
 * - `null` / `undefined` / `NaN` / 0 → 空串（代表未选择，交给校验拦截）；
 * - 使用**本地日历日**（与 `RehireModal` 既有约定一致），不做 UTC 偏移换算，
 *   避免东八区傍晚选择日期后落到前一天。
 */
export function toTerminateDateString(ts?: null | number): string {
  if (ts === null || ts === undefined) return '';
  if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 提交前校验：返回**第一条**错误文案，全部通过返回 null。
 * 校验顺序：员工 → 终态类型 → 业务事件日期（必填）→ 日期格式。
 * 说明：不校验「事件日期必须不早于当前任职段开始日期」——前端拿不到旧段边界，
 *   该规则由后端事务判定，前端原样展示后端 message（§3.5）。
 */
export function validateTerminateForm(
  employeeId: null | number | undefined,
  state: TerminateFormState,
): null | string {
  if (employeeId === null || employeeId === undefined) return '缺少员工信息';
  if (!state.terminal_type) return '请选择终态类型（辞职 / 死亡 / 退休）';
  if (!state.event_date) return '请选择业务事件日期（不可使用系统当天日期代替）';
  const dateStr = toTerminateDateString(state.event_date);
  if (!TERMINATE_DATE_PATTERN.test(dateStr)) return '业务事件日期格式非法，需为 YYYY-MM-DD';
  return null;
}

/**
 * 组装请求体。
 * 只包含后端 `terminateEmployee` 解构出的字段，且**不含** `employment_relation` / `status` /
 * `leave_date`（由后端事务统一写入）。
 *
 * 注意：本契约模块不承载运行时 HTTP 调用（与 `employee-rehire.ts` 一致，避免把 `#/api/request`
 * 拉入纯函数单测）；真实请求由 `TerminalModal.vue` 直接从 `#/api/hse/employee` 引入
 * `terminateEmployee` 发起。
 */
export function buildTerminatePayload(
  employeeId: number,
  state: TerminateFormState,
): EmployeeApi.OrgTerminateFormData {
  const payload: EmployeeApi.OrgTerminateFormData = {
    employee_id: employeeId,
    terminal_type: state.terminal_type as EmployeeApi.OrgTerminateFormData['terminal_type'],
    event_date: toTerminateDateString(state.event_date),
  };
  const remark = state.remark?.trim();
  if (remark) payload.remark = remark;
  return payload;
}

/**
 * 从请求失败对象中取出**后端真实 message**。
 * 后端统一返回 `{ code, success, message, data }`；响应拦截器在 `code !== 0` 时
 * 抛出形如 `{ ...response, response }` 的对象，故 `response.data.message` 与 `data.message` 都要试。
 * 兜底文案不得伪装成后端结论，仅说明失败。
 */
export function extractTerminateError(err: unknown): string {
  const asRecord = (v: unknown): Record<string, any> | null =>
    v && typeof v === 'object' ? (v as Record<string, any>) : null;

  /** 从对象上取第一个非空字符串字段（message 优先，其次 error） */
  const pickMessage = (v: unknown): string => {
    const obj = asRecord(v);
    if (!obj) return '';
    for (const field of ['message', 'error'] as const) {
      const value = obj[field];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  };

  const errObj = asRecord(err);
  // 优先取**响应体**里的后端文案：`{ code, success, message, data }`
  const bodyMessage = pickMessage(errObj?.response?.data) || pickMessage(errObj?.data);
  if (bodyMessage) return bodyMessage;

  // 再退回异常自身的 message，但过滤掉 axios 的通用句式（对用户无信息量）
  const rootMessage = pickMessage(errObj);
  if (rootMessage && !/status code/i.test(rootMessage)) return rootMessage;

  return '终态登记失败，请稍后重试或联系管理员';
}
