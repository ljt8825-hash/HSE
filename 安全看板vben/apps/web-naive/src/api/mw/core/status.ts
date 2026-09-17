/**
 * MOBILE-WPS-V1 · 整改状态机
 *
 * 六态：待补充 DRAFT / 待整改 PENDING_RECTIFY / 整改中 RECTIFYING /
 *       待复查 PENDING_REVIEW / 已完成 COMPLETED / 已转派 TRANSFERRED
 *
 * 硬约束：
 * 1. 「立即整改」与「以后整改」两条流程必须能共存（DRAFT → PENDING_REVIEW 直通，
 *    也可 DRAFT → PENDING_RECTIFY 挂起后再补整改）。
 * 2. 任何状态下记录都**不可删除**（只做状态流转）。
 * 3. 本模块只管状态合法性，**不管扣分**——V1 不做任何扣分计算。
 */

import type { ViolationStatus } from './types';

/** 合法流转图 */
const TRANSITIONS: Record<ViolationStatus, ViolationStatus[]> = {
  // 刚生成三违记录ID，尚未选齐人员/行为
  DRAFT: ['PENDING_RECTIFY', 'RECTIFYING', 'PENDING_REVIEW', 'TRANSFERRED'],
  // 暂不整改 → 挂起，之后从「我的整改」进入
  // 允许直达 PENDING_REVIEW：挂起后从「我的整改」补拍 AFTER 照片即可一次提交完成
  PENDING_RECTIFY: ['RECTIFYING', 'PENDING_REVIEW', 'TRANSFERRED'],
  // 整改中（已选人/选行为，正在拍整改后照片）
  RECTIFYING: ['PENDING_REVIEW', 'PENDING_RECTIFY', 'TRANSFERRED'],
  // 已提交整改，等复查
  PENDING_REVIEW: ['COMPLETED', 'RECTIFYING'],
  // 终态
  COMPLETED: [],
  // 已转派：等责任方接收 → 其整改提交后回到 PENDING_REVIEW（走发起人确认）
  TRANSFERRED: ['RECTIFYING', 'PENDING_REVIEW', 'COMPLETED'],
};

export function canTransition(
  from: ViolationStatus,
  to: ViolationStatus,
): boolean {
  return (TRANSITIONS[from] || []).includes(to);
}

/** 断言流转合法，不合法抛错（fail-closed） */
export function assertTransition(
  from: ViolationStatus,
  to: ViolationStatus,
): void {
  if (!canTransition(from, to)) {
    throw new Error(`非法的状态流转：${from} → ${to}`);
  }
}

/** 是否终态 */
export function isTerminal(s: ViolationStatus): boolean {
  return s === 'COMPLETED';
}

/** 是否需要整改动作（出现在「我的整改」） */
export function needsRectify(s: ViolationStatus): boolean {
  return s === 'PENDING_RECTIFY' || s === 'RECTIFYING';
}

/** 是否需要复查（出现在「我的复查」） */
export function needsReview(s: ViolationStatus): boolean {
  return s === 'PENDING_REVIEW';
}
