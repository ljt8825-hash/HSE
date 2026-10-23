/**
 * HSE 统一状态色规范（单一事实来源）—— 对应任务 §4.2「统一状态颜色」
 *
 * 设计原则：
 * 1. 只定义「业务枚举值 → 语义类型」的映射，绝不在此硬编码任何 hsl / hex 颜色。
 *    实际颜色由 HseStatusTag + theme.ts(hsePalette) 统一下发，换肤 / 暗模式自动适配。
 * 2. 必须先核对真实业务状态枚举（见下方各 map 注释中的后端枚举），
 *    不得仅按中文名称随意映射。
 * 3. 语义色板（与 theme.ts hsePalette 一一对应）：
 *    - success（安全绿）：正常 / 已完成 / 已关闭 / 已结案 / 有效
 *    - info（信息蓝）  ：进行中 / 处理中 / 调查中 / 待审核（非紧急在办）
 *    - warning（预警橙）：待处理 / 待整改 / 临期 / 需关注
 *    - danger（危险红） ：逾期 / 异常 / 重大风险 / 重大 / 特别重大 / 一级
 *    - neutral（中性灰）：已撤销 / 已驳回 / 草稿 / 未知 / 长期有效
 */

import type { HseStatusType } from './HseStatusTag.vue';

export type { HseStatusType };

/* ===================== 隐患模块 ===================== */
// 后端隐患生命周期枚举：discovered / processing / pending_review / closed
export const HAZARD_STATUS_TAG: Record<string, HseStatusType> = {
  discovered: 'info',
  processing: 'warning',
  pending_review: 'warning',
  closed: 'success',
};
export const HAZARD_STATUS_LABEL: Record<string, string> = {
  discovered: '发现',
  processing: '整改中',
  pending_review: '待复查',
  closed: '已关闭',
};

// 隐患风险等级枚举：重大 / 一级 / 二级 / 三级
export const HAZARD_RISK_TAG: Record<string, HseStatusType> = {
  重大: 'danger',
  一级: 'danger',
  二级: 'warning',
  三级: 'info',
};

// 隐患变更类型标签使用 NTag 原生类型（含 error/default），与语义色板不同域，保留原值不转换
export const HAZARD_CHANGE_TYPE_TAG: Record<
  string,
  'success' | 'info' | 'warning' | 'error' | 'default'
> = {
  create: 'success',
  update: 'info',
  import: 'warning',
  revise: 'warning',
  delete: 'error',
};

// 隐患到期状态枚举：normal / expiring / expired / resolved / unknown
export const HAZARD_EXPIRY_TAG: Record<string, HseStatusType> = {
  normal: 'success',
  expiring: 'warning',
  expired: 'danger',
  resolved: 'neutral',
  unknown: 'neutral',
};
export const HAZARD_EXPIRY_LABEL: Record<string, string> = {
  normal: '正常',
  expiring: '临期',
  expired: '过期',
  resolved: '已完成',
  unknown: '未知',
};

/* ===================== 事故模块 ===================== */
// 后端事故处理状态枚举：reported / investigating / processing / closed
export const ACCIDENT_STATUS_TAG: Record<string, HseStatusType> = {
  reported: 'warning',
  investigating: 'warning',
  processing: 'info',
  closed: 'success',
};
export const ACCIDENT_STATUS_LABEL: Record<string, string> = {
  reported: '已报告',
  investigating: '调查中',
  processing: '处理中',
  closed: '已结案',
};

// 事故等级（两套国标体系）：
// 生产安全事故等级：特别重大 / 重大 / 较大 / 一般
// 道路交通事故等级：一级 / 二级 / 三级 / 四级
export const ACCIDENT_LEVEL_TAG: Record<string, HseStatusType> = {
  特别重大: 'danger',
  重大: 'danger',
  一级: 'danger',
  较大: 'warning',
  二级: 'warning',
  一般: 'info',
  三级: 'info',
  四级: 'neutral',
};

// 事故变更类型标签（语义域）：create / update / import / revise
export const ACCIDENT_CHANGE_TYPE_TAG: Record<string, HseStatusType> = {
  create: 'success',
  update: 'info',
  import: 'warning',
  revise: 'warning',
};
// 当事人角色标签使用 NTag 原生类型（含 error/default），保留原值不转换
// （同一列在不同事故类型下的业务叫法：交通→肇事者，生产安全→伤者）
export const ACCIDENT_ROLE_TAG: Record<
  string,
  'success' | 'info' | 'warning' | 'error' | 'default'
> = {
  肇事者: 'warning',
  伤者: 'error',
  患者: 'info',
  当事人: 'default',
  其他: 'default',
};

// 事故时效状态枚举：normal / expiring / expired / closed / permanent / unknown
// 注：应急预案使用 valid 作为"有效"键，与 normal 同义，统一映射为 success
export const EXPIRY_TAG: Record<string, HseStatusType> = {
  normal: 'success',
  valid: 'success',
  expiring: 'warning',
  expired: 'danger',
  closed: 'neutral',
  permanent: 'neutral',
  unknown: 'neutral',
};

// 通用时效中文标签（被 regulations / risk-control / emergency / insurance 等模块复用）
export const EXPIRY_LABEL: Record<string, string> = {
  normal: '正常',
  valid: '正常',
  expiring: '临期',
  expired: '过期',
  closed: '已结案',
  permanent: '长期有效',
  unknown: '未知',
};

/* ===================== 系统用户 ===================== */
export const USER_STATUS_TAG: Record<string, HseStatusType> = {
  active: 'success',
  disabled: 'danger',
};
export const USER_STATUS_LABEL: Record<string, string> = {
  active: '启用',
  disabled: '禁用',
};

/* ===================== 风险管控 ===================== */
// 风险等级（与事故等级是不同业务域：此处四级=受控成功，事故四级=中性）
export const RISK_CONTROL_LEVEL_TAG: Record<string, HseStatusType> = {
  一级: 'danger',
  二级: 'warning',
  三级: 'info',
  四级: 'success',
};
export const RISK_CONTROL_STATUS_TAG: Record<string, HseStatusType> = {
  正常: 'success',
  已处置: 'info',
  监控中: 'warning',
};

/* ===================== 现场违章 ===================== */
export const VIOLATION_STATUS_TAG: Record<string, HseStatusType> = {
  待处理: 'danger',
  整改中: 'warning',
  待复查: 'info',
  已关闭: 'success',
};
export const VIOLATION_LEVEL_TAG: Record<string, HseStatusType> = {
  严重: 'danger',
  一般: 'warning',
  轻微: 'info',
};
export const VIOLATION_TYPE_TAG: Record<string, HseStatusType> = {
  违章指挥: 'danger',
  违章作业: 'warning',
  违反劳动纪律: 'info',
};
// 查处来源标签使用 NTag 原生类型（含 error/default），与语义色板 danger/neutral 不同域，保留原值不转换
export const VIOLATION_CHECK_SOURCE_TAG: Record<
  string,
  'success' | 'info' | 'warning' | 'error' | 'default'
> = {
  company: 'error',
  township: 'warning',
  self: 'info',
};
// 扣分状态标签使用 NTag 原生类型（服务端派生七态：deducted/pending_deduct/no_deduct/unresolved/pending_review/revoked/history）
export const VIOLATION_DEDUCTION_STATUS_TAG: Record<
  string,
  'success' | 'info' | 'warning' | 'error' | 'default'
> = {
  deducted: 'success',
  pending_deduct: 'warning',
  no_deduct: 'info',
  unresolved: 'warning',
  pending_review: 'warning',
  revoked: 'error',
  history: 'default',
};

/* ===================== 规章制度 ===================== */
export const REGULATION_STATUS_TAG: Record<string, HseStatusType> = {
  active: 'success',
  published: 'success',
  draft: 'neutral',
  revising: 'warning',
  obsolete: 'danger',
};
export const REGULATION_STATUS_LABEL: Record<string, string> = {
  active: '有效',
  published: '已发布',
  draft: '草案',
  revising: '修订中',
  obsolete: '已废止',
};
// 变更类型标签使用 NTag 原生类型（含 error/default），与语义色板 danger/neutral 不同域，保留原值不转换
export const REGULATION_CHANGE_TYPE_TAG: Record<
  string,
  'success' | 'info' | 'warning' | 'error' | 'default'
> = {
  create: 'info',
  revise: 'warning',
  publish: 'success',
  revoke: 'error',
  other: 'default',
};

/* ===================== 应急预案 ===================== */
export const EMERGENCY_PLAN_STATUS_TAG: Record<string, HseStatusType> = {
  active: 'success',
  published: 'success',
  pending: 'warning',
  review: 'info',
};
export const EMERGENCY_PLAN_STATUS_LABEL: Record<string, string> = {
  active: '生效中',
  published: '已发布',
  pending: '待审核',
  review: '复审中',
};

/* ===================== 应急物资 ===================== */
export const EMERGENCY_MATERIAL_CATEGORY_TAG: Record<string, HseStatusType> = {
  救援装备: 'danger',
  个人防护: 'info',
  医疗急救: 'success',
  消防器材: 'warning',
  通讯设备: 'info',
  应急照明: 'warning',
  其他物资: 'neutral',
};

/* ===================== 应急事件 ===================== */
export const EMERGENCY_EVENT_LEVEL_TAG: Record<string, HseStatusType> = {
  一级: 'danger',
  二级: 'danger',
  三级: 'warning',
  四级: 'info',
};
export const EMERGENCY_EVENT_STATUS_TAG: Record<string, HseStatusType> = {
  已接报: 'info',
  响应中: 'warning',
  处置中: 'warning',
  已结案: 'success',
};

/* ===================== 应急演练 ===================== */
export const EMERGENCY_DRILL_STATUS_TAG: Record<string, HseStatusType> = {
  计划中: 'info',
  进行中: 'warning',
  已完成: 'success',
  已取消: 'neutral',
};
export const EMERGENCY_DRILL_TYPE_TAG: Record<string, HseStatusType> = {
  桌面演练: 'info',
  功能演练: 'warning',
  实战演练: 'success',
};
export const EMERGENCY_DRILL_RESULT_TAG: Record<string, HseStatusType> = {
  优秀: 'success',
  良好: 'success',
  合格: 'info',
  不合格: 'danger',
};

/* ===================== 目标职责-安委会 ===================== */
// 数据同时存在英文/中文状态键，需双键映射（保持原行为，勿删任一组）
export const COMMITTEE_STATUS_TAG: Record<string, HseStatusType> = {
  active: 'success',
  在职: 'success',
  left: 'danger',
  离职: 'danger',
  pending: 'warning',
  待岗: 'warning',
  retired: 'neutral',
  退休: 'neutral',
  rehire: 'neutral',
  返聘: 'neutral',
};

/* ===================== 目标职责-安全费用执行 ===================== */
export const BUDGET_EXPENDITURE_STATUS_TAG: Record<string, HseStatusType> = {
  planning: 'info',
  executing: 'warning',
  completed: 'success',
};
export const BUDGET_EXPENDITURE_USE_STATUS_TAG: Record<string, HseStatusType> = {
  已支出: 'success',
  申请中: 'warning',
  未支出: 'info',
};

/* ===================== 目标职责-考核评定 ===================== */
export const ASSESSMENT_LEVEL_TAG: Record<string, HseStatusType> = {
  优秀: 'success',
  良好: 'info',
  合格: 'warning',
  一般: 'neutral',
};
export const ASSESSMENT_STATUS_TAG: Record<string, HseStatusType> = {
  有效: 'success',
  失效: 'danger',
};

/* ===================== 保险-车辆 ===================== */
export const INSURANCE_VEHICLE_STATUS_TAG: Record<string, HseStatusType> = {
  在用: 'success',
  停用: 'warning',
  报废: 'danger',
};

/* ===================== 保险-其他 ===================== */
export const INSURANCE_OTHER_STATUS_TAG: Record<string, HseStatusType> = {
  有效: 'success',
  失效: 'danger',
};
export const INSURANCE_OTHER_TYPE_TAG_COLOR: Record<string, HseStatusType> = {
  公众责任险: 'info',
  财产一切险: 'warning',
};

/* ===================== 预警中心 ===================== */
export const ALERT_LEVEL_TAG: Record<string, HseStatusType> = {
  critical: 'danger',
  high: 'warning',
  medium: 'warning',
  low: 'info',
  info: 'neutral',
};
export const ALERT_STATUS_TAG: Record<string, HseStatusType> = {
  new: 'danger',
  processing: 'warning',
  resolved: 'success',
};

/* ===================== 月度考核-周期/冻结 ===================== */
export const ASSESSMENT_CYCLE_STATUS_TAG: Record<string, HseStatusType> = {
  not_started: 'neutral',
  in_progress: 'info',
  pending_review: 'warning',
  reviewed: 'success',
  frozen: 'danger',
};

/* ===================== 月度考核-指标 ===================== */
export const ASSESSMENT_TARGET_STATUS_TAG: Record<string, HseStatusType> = {
  pending: 'neutral',
  scored: 'info',
  reviewed: 'success',
  frozen: 'danger',
};
export const ASSESSMENT_TARGET_GRADE_TAG: Record<string, HseStatusType> = {
  A: 'success',
  B: 'info',
  C: 'warning',
  D: 'danger',
};

/* ===================== 人员-花名册 ===================== */
export const EMPLOYEE_STATUS_TAG: Record<string, HseStatusType> = {
  active: 'success',
  left: 'neutral',
  inactive: 'neutral',
  pending: 'warning',
  retired: 'info',
  rehire: 'info',
  reinstated: 'info',
};
export const EMPLOYEE_PROFILE_STATUS_TAG: Record<string, HseStatusType> = {
  active: 'success',
  inactive: 'neutral',
  left: 'warning',
  pending: 'warning',
};

/* ===================== 现场-消防设施 ===================== */
export const FIRE_FACILITY_STATUS_TAG: Record<string, HseStatusType> = {
  正常: 'success',
  过期: 'danger',
  损坏: 'danger',
  维修中: 'warning',
  缺失: 'warning',
};

/* ===================== 现场-网格 ===================== */
export const SITE_GRID_STATUS_TAG: Record<string, HseStatusType> = {
  在岗: 'success',
  离岗: 'info',
  休假: 'warning',
  调整: 'neutral',
};
export const SITE_GRID_RECTIFY_TAG: Record<string, HseStatusType> = {
  已整改: 'success',
  整改中: 'warning',
  待整改: 'danger',
};

/* ===================== 通用兜底解析 ===================== */
/** 业务状态值 → 语义类型（按已登记枚举兜底为 neutral），供零散状态标签复用 */
export function resolveStatusType(value: string | undefined | null): HseStatusType {
  if (!value) return 'neutral';
  return (
    HAZARD_STATUS_TAG[value] ||
    ACCIDENT_STATUS_TAG[value] ||
    ACCIDENT_CHANGE_TYPE_TAG[value] ||
    HAZARD_RISK_TAG[value] ||
    ACCIDENT_LEVEL_TAG[value] ||
    HAZARD_EXPIRY_TAG[value] ||
    EXPIRY_TAG[value] ||
    USER_STATUS_TAG[value] ||
    RISK_CONTROL_STATUS_TAG[value] ||
    VIOLATION_STATUS_TAG[value] ||
    REGULATION_STATUS_TAG[value] ||
    EMERGENCY_PLAN_STATUS_TAG[value] ||
    EMERGENCY_EVENT_STATUS_TAG[value] ||
    EMERGENCY_DRILL_STATUS_TAG[value] ||
    EMERGENCY_DRILL_RESULT_TAG[value] ||
    BUDGET_EXPENDITURE_STATUS_TAG[value] ||
    BUDGET_EXPENDITURE_USE_STATUS_TAG[value] ||
    SITE_GRID_STATUS_TAG[value] ||
    SITE_GRID_RECTIFY_TAG[value] ||
    ASSESSMENT_STATUS_TAG[value] ||
    ASSESSMENT_CYCLE_STATUS_TAG[value] ||
    ASSESSMENT_TARGET_STATUS_TAG[value] ||
    INSURANCE_VEHICLE_STATUS_TAG[value] ||
    INSURANCE_OTHER_STATUS_TAG[value] ||
    ALERT_STATUS_TAG[value] ||
    COMMITTEE_STATUS_TAG[value] ||
    EMPLOYEE_STATUS_TAG[value] ||
    EMPLOYEE_PROFILE_STATUS_TAG[value] ||
    FIRE_FACILITY_STATUS_TAG[value] ||
    'neutral'
  );
}
