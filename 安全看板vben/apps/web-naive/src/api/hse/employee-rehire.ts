/**
 * 返聘（rehire）前端契约模块 — web-naive
 *
 * 背景（B02-DEC-03.28 / A-02e.5-D1）：
 *   B2.2 已在后端落地事务化返聘出口 `POST /api/hse/employee/org/rehire`，
 *   但 web-naive 人员管理页此前没有任何入口，人事只能直接调接口。
 *   本模块把「谁能看到返聘入口 / 日期怎么校验与转换 / 请求体长什么样 / 错误怎么取」
 *   收敛成纯函数，供 `RehireModal.vue` 与 `index.vue` 共用，并可被 vitest 直接覆盖。
 *
 * 本模块的硬约束（对应任务书 §2 / §3 / §4）：
 *   1. 入口显示**只**依据服务端派生标记 `is_retired_relation`。
 *      该标记由 `employeeService.listEmployees` 计算：
 *      `COALESCE(trim(e.employment_relation), '') = '退休'`，
 *      与后端返聘资格判定（`String(relation).trim() === '退休'`）同源。
 *      因此：
 *        - 关系为 `辞职` / `死亡` / NULL / 空串 / 未知值 → 标记为 false → 不展示入口；
 *        - **不得**用 `org_status === 'retired'` 反推：`displayStatusSql` 的 ELSE 分支会回落到
 *          `ev.assignment_status`，关系为 NULL 但任职段状态恰为 `retired` 时同样返回 'retired'，
 *          用它当条件会把一个后端必然拒绝（-4）的人显示成「可返聘」。
 *   2. 前端判断仅为交互体验，**资格权威永远在后端事务内**（`FOR UPDATE` + 关系判定）。
 *   3. 生效日期初始为 `null`（空），必须由操作人显式选择；**禁止 `Date.now()` 预填今天**，
 *      也禁止把「系统登记时间」当业务生效日期。系统登记时间由后端写，前端不参与。
 *   4. 请求体只允许出现后端 `rehireEmployee` 解构过的字段，不夹带 `employment_relation` / `status`，
 *      避免「前端本地赋值伪造返聘成功」。
 */
import type { EmployeeApi } from './employee';

/** 返聘的唯一合法来源关系（与后端 RELATION.RETIRED 一致） */
export const REHIRE_SOURCE_RELATION = '退休';

/** 返聘新任职段的固定变更原因（后端 `change_reason || '返聘'`，此处显式传，便于审计复现） */
export const REHIRE_CHANGE_REASON = '返聘';

/** 后端 `isIsoDateString` 接受的日期形态：必须 YYYY-MM-DD */
export const REHIRE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 只读地描述一个列表行中与返聘入口相关的字段（不引入视图类型耦合） */
export interface RehireCandidateRow {
  id?: number;
  name?: string;
  /** 服务端派生布尔：trim(employment_relation) === '退休' */
  is_retired_relation?: boolean | null;
  /** 仅用于测试反例（证明不能拿它反推资格） */
  org_status?: string | null;
  /** 仅用于测试反例（列表接口当前并不返回该列） */
  employment_relation?: string | null;
}

/** 返聘弹窗的表单状态（`start_date` 用时间戳承载 NDatePicker 的值，初始为 null） */
export interface RehireFormState {
  team_id?: number;
  position_id?: number;
  /** NDatePicker 绑定值：时间戳（毫秒）；初始 null = 未选择 */
  start_date: number | null;
  remark: string;
}

/**
 * 该行是否为「退休关系」。
 * 只认服务端派生标记严格等于 `true`；`undefined` / `null` / 其他真值形态一律不认。
 */
export function isRetiredRelationRow(row?: null | RehireCandidateRow): boolean {
  return row?.is_retired_relation === true;
}

/**
 * 是否展示可用的返聘入口。
 * 条件 = 当前用户有人员增改权限 **且** 该行关系明确为退休。
 * `org_status` / `employment_relation` 均**不参与**判断（见文件头第 1 条）。
 */
export function canRehire(
  row?: null | RehireCandidateRow,
  canEdit: boolean = false,
): boolean {
  return canEdit === true && isRetiredRelationRow(row);
}

/**
 * 行操作项（与 NDropdown options 的 { key, label } 结构对齐）。
 * 用 type 而非 interface：naive-ui 的 `MenuOption` 带 `[key: string]: unknown` 索引签名，
 * 只有类型别名会获得隐式索引签名；interface 会因此不兼容（vue-tsc TS2322，
 * 与 `employee-status.ts` 的 `OrgStatusFilterOption` 同一处理）。
 */
export type RowActionOption = {
  key: string;
  label: string;
};

/**
 * 构造人员行「更多」菜单项。
 * 既有两项（调岗 / 历史）的顺序与文案保持不变；仅在可返聘时追加第三项。
 * 集中到此处是为了让「不误显示 / 不回归」可被自动化断言，而不是散落在模板里。
 */
export function buildRowActions(
  row: RehireCandidateRow | undefined,
  canEdit: boolean,
): RowActionOption[] {
  const actions: RowActionOption[] = [
    { key: 'transfer', label: '调岗' },
    { key: 'history', label: '历史' },
  ];
  if (canRehire(row, canEdit)) {
    actions.push({ key: 'rehire', label: '返聘' });
  }
  return actions;
}

/**
 * 弹窗初始状态。
 * `start_date` 必须是 `null` —— 任何「默认今天」的实现都会让 §3 的强制显式填写失效。
 */
export function createRehireFormState(): RehireFormState {
  return {
    team_id: undefined,
    position_id: undefined,
    start_date: null,
    remark: '',
  };
}

/**
 * NDatePicker 时间戳 → `YYYY-MM-DD`。
 * - `null` / `undefined` / `NaN` / 0 → 空串（代表未选择，交给校验拦截）；
 * - 使用**本地日历日**（与 `OrgTransferModal` 既有约定一致），不做 UTC 偏移换算，
 *   避免东八区傍晚选择日期后落到前一天。
 */
export function toRehireDateString(ts?: null | number): string {
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
 * 校验顺序：员工 → 目标部门 → 岗位 → 生效日期（必填）→ 日期格式。
 * 说明：不校验「生效日期必须晚于原任职段」——前端拿不到旧段边界，
 *   该规则由后端事务判定，前端原样展示后端 message（§3.5）。
 */
export function validateRehireForm(
  employeeId: null | number | undefined,
  state: RehireFormState,
): null | string {
  if (employeeId === null || employeeId === undefined) return '缺少员工信息';
  if (!state.team_id) return '请选择目标部门';
  if (!state.position_id) return '请选择岗位';
  if (!state.start_date) return '请选择返聘生效日期（不可使用系统当天日期代替）';
  const dateStr = toRehireDateString(state.start_date);
  if (!REHIRE_DATE_PATTERN.test(dateStr)) return '返聘生效日期格式非法，需为 YYYY-MM-DD';
  return null;
}

/**
 * 组装请求体。
 * 只包含后端 `rehireEmployee` 解构出的字段，且**不含** `employment_relation` / `status` /
 * `org_unit_id`（走 team_id，由后端 resolveOrgUnitId 解析）。
 */
export function buildRehirePayload(
  employeeId: number,
  state: RehireFormState,
): EmployeeApi.OrgRehireFormData {
  const payload: EmployeeApi.OrgRehireFormData = {
    employee_id: employeeId,
    team_id: state.team_id as number,
    position_id: state.position_id as number,
    start_date: toRehireDateString(state.start_date),
    change_reason: REHIRE_CHANGE_REASON,
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
export function extractRehireError(err: unknown): string {
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

  return '返聘失败，请稍后重试或联系管理员';
}
