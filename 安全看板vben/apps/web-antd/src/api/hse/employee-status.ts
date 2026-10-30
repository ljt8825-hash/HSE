/**
 * 员工组织状态（`org_status`）前端映射单一事实源 — web-antd
 *
 * 背景（B02-DEC-03.17 / A-02d.3）：
 *   A-02d 只同步了 web-naive，web-antd 的状态契约停留在 A-02d 之前的 5 个值
 *   （active / left / pending / retired / rehire），导致后端已开始返回的
 *   secondment / unpaid_leave / former / inactive / reinstated 会以英文原文直出，
 *   且「返聘」筛选值仍是后端不识别的历史别名 rehire（查询恒空）。
 *
 * 本模块约定：
 *   1. `ORG_STATUS_LABEL` 覆盖后端全部可能返回值，`inactive` 与 `retired` 保持两个独立编码
 *      （不得把 inactive 显示成「退休」）。
 *   2. 筛选项 `value` 直接使用后端编码，不做「中文 → 编码」反查。
 *   3. `rehire` 仅为历史兼容别名（正式编码 reinstated），只允许出现在展示映射里。
 *   4. 颜色映射对既有 5 个值保持原实现语义（active 绿 / left 红 / 其余橙），
 *      仅为新增编码补色，不改动既有视觉。
 */

/** 状态编码 → 中文标签（展示用） */
export const ORG_STATUS_LABEL: Record<string, string> = {
  active: '在职',
  left: '离职',
  // inactive 与 left 同为「离职」业务语义，但来源不同（关系终态 / 任职状态原值）
  inactive: '离职',
  pending: '待岗',
  secondment: '借调',
  unpaid_leave: '停薪留职',
  retired: '退休',
  former: '历史段',
  reinstated: '返聘',
  rehire: '返聘',
};

/** 历史兼容：部分旧代码/旧数据仍以中文标签作为入参，判色时先归一再匹配 */
const LEGACY_LABEL_TO_CODE: Record<string, string> = {
  在职: 'active',
  离职: 'left',
  待岗: 'pending',
  借调: 'secondment',
  停薪留职: 'unpaid_leave',
  退休: 'retired',
  历史段: 'former',
  返聘: 'reinstated',
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
 * 不提供 `inactive` 独立选项：它与 `left` 都显示为「离职」，
 * 同名选项对应不同查询口径会让使用者无法判断结果差异；inactive 仅参与展示映射。
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

/** 展示用标签：编码未命中时原样返回，避免出现空标签 */
export function orgStatusLabel(status?: null | string): string {
  if (!status) return '-';
  return ORG_STATUS_LABEL[status] ?? status;
}

/** 展示用颜色（Tag color）：既有 5 个值的取色与改动前一致 */
export function orgStatusColor(status?: null | string): string {
  if (!status) return 'default';
  const code = LEGACY_LABEL_TO_CODE[status] ?? status;
  if (code === 'active') return 'green';
  if (code === 'left' || code === 'inactive') return 'red';
  // 历史段为只读归档态，取中性色避免与「异常状态」混淆
  if (code === 'former') return 'default';
  return 'orange';
}

/**
 * 可作为查询参数下发的编码白名单。
 * `rehire` 不在此列：它是历史展示别名，后端从未存过该值，
 * 下发后 `ev.assignment_status = 'rehire'` 恒为空结果（本任务修复的 D5-c 即此问题）。
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
 *   - 空值 → undefined（不加筛选条件）
 *   - 命中白名单编码 → 原样返回
 *   - 未登记值（含中文标签、历史别名 rehire）→ undefined，由调用方给出显式提示
 */
export function toOrgStatusParam(status?: null | string): string | undefined {
  if (!status) return undefined;
  return QUERYABLE_STATUS_CODES.has(status) ? status : undefined;
}
