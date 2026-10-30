/**
 * 员工组织状态（`org_status`）前端映射单一事实源 — web-naive
 *
 * 背景（B02-DEC-03.17 / A-02d.3）：
 *   此前「状态中文标签」与「状态筛选值」分散在两个视图内各自维护，
 *   筛选下拉由 `Object.keys(STATUS_LABEL)` 生成并把**中文标签**当作 option value，
 *   再经一张只有 5 个中文键的 `STATUS_VALUE` 反查英文编码。
 *   A-02d 向标签表新增 secondment / unpaid_leave / former 三键后，反查表未同步，
 *   选中这三项时传给后端的 `status` 变成 `undefined` ⇒ 筛选条件被静默丢弃、返回全量。
 *
 * 本模块的约束：
 *   1. 筛选项的 `value` **直接就是后端状态编码**，不做「中文 → 编码」反查，杜绝上述静默失效。
 *   2. 后端 `employeeService.listEmployees` 的 status 分支除 active / left / retired 走关系口径外，
 *      其余编码一律落到 `ev.assignment_status = $n`，故 secondment / unpaid_leave / former /
 *      reinstated / inactive 均可直接作为查询参数传递。
 *   3. `inactive` 与 `retired` 是两个独立编码（离职语义 / 退休语义），任何映射都不得合并。
 *   4. `rehire` 是历史兼容值，正式编码为 `reinstated`；`rehire` 只在展示层作为别名保留，
 *      **不得**作为筛选项 value 发给后端（否则 `ev.assignment_status = 'rehire'` 恒空）。
 */

/** 状态编码 → 中文标签（展示用，覆盖后端全部可能返回值） */
export const ORG_STATUS_LABEL: Record<string, string> = {
  active: '在职',
  left: '离职',
  // inactive 与 left 同为「离职」业务语义，但来源不同（关系终态 / 任职状态原值），保留独立编码
  inactive: '离职',
  pending: '待岗',
  secondment: '借调',
  unpaid_leave: '停薪留职',
  retired: '退休',
  former: '历史段',
  reinstated: '返聘',
  rehire: '返聘',
};

/**
 * 筛选下拉选项：value 必须是后端认可的状态编码。
 * 用 type 而非 interface —— 组件库的 options 类型带索引签名（`[k: string]: unknown`），
 * 只有类型别名会获得隐式索引签名，interface 会因此类型不兼容（vue-tsc TS2322）。
 */
export type OrgStatusFilterOption = {
  label: string;
  value: string;
};

/**
 * 安全人员（安委会 Tab1 花名册）筛选项。
 * 注意：不提供 `inactive` 独立选项 —— 它与 `left` 都显示为「离职」，
 * 两个同名选项却对应不同查询口径，会让使用者无法判断结果差异；
 * `inactive` 只参与展示映射（见 ORG_STATUS_LABEL），不提供筛选入口。
 */
export const COMMITTEE_STATUS_FILTER_OPTIONS: OrgStatusFilterOption[] = [
  { label: '在职', value: 'active' },
  { label: '离职', value: 'left' },
  { label: '待岗', value: 'pending' },
  { label: '借调', value: 'secondment' },
  { label: '停薪留职', value: 'unpaid_leave' },
  { label: '退休', value: 'retired' },
  { label: '历史段', value: 'former' },
  { label: '返聘', value: 'reinstated' },
];

/** 员工列表页筛选项（在原有 5 项基础上补中间态，原有 5 项取值不变） */
export const EMPLOYEE_STATUS_FILTER_OPTIONS: OrgStatusFilterOption[] = [
  { label: '在职', value: 'active' },
  { label: '待岗', value: 'pending' },
  { label: '借调', value: 'secondment' },
  { label: '停薪留职', value: 'unpaid_leave' },
  { label: '离职', value: 'left' },
  { label: '退休', value: 'retired' },
  { label: '返聘', value: 'reinstated' },
];

/** 展示用标签：编码未命中时原样返回，避免出现空标签 */
export function orgStatusLabel(status?: null | string): string {
  if (!status) return '-';
  return ORG_STATUS_LABEL[status] ?? status;
}

/**
 * 可作为查询参数下发的编码白名单。
 * 说明：`ORG_STATUS_LABEL` 里的 `rehire` **不在此列** —— 它是历史展示别名，
 * 后端从未存过该值，下发后 `ev.assignment_status = 'rehire'` 恒为空结果。
 */
const QUERYABLE_STATUS_CODES = new Set([
  'active',
  'former',
  'inactive',
  'left',
  'pending',
  'reinstated',
  'retired',
  'secondment',
  'unpaid_leave',
]);

/**
 * 把下拉选中值转换为请求参数。
 *   - 空值 → undefined（不加筛选条件，行为不变）
 *   - 命中白名单编码 → 原样返回
 *   - 未登记值（含中文标签、历史别名 rehire）→ undefined，由调用方给出显式提示
 */
export function toOrgStatusParam(status?: null | string): string | undefined {
  if (!status) return undefined;
  return QUERYABLE_STATUS_CODES.has(status) ? status : undefined;
}
