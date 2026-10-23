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

// 事故时效状态枚举：normal / expiring / expired / closed / permanent / unknown
export const EXPIRY_TAG: Record<string, HseStatusType> = {
  normal: 'success',
  expiring: 'warning',
  expired: 'danger',
  closed: 'neutral',
  permanent: 'neutral',
  unknown: 'neutral',
};

/* ===================== 通用兜底解析 ===================== */
/** 业务状态值 → 语义类型（按已登记枚举兜底为 neutral），供零散状态标签复用 */
export function resolveStatusType(value: string | undefined | null): HseStatusType {
  if (!value) return 'neutral';
  return (
    HAZARD_STATUS_TAG[value] ||
    ACCIDENT_STATUS_TAG[value] ||
    HAZARD_RISK_TAG[value] ||
    ACCIDENT_LEVEL_TAG[value] ||
    HAZARD_EXPIRY_TAG[value] ||
    EXPIRY_TAG[value] ||
    'neutral'
  );
}
