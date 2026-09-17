/**
 * MOBILE-WPS-V1 · 流程守卫（冻结业务规则的代码化）
 *
 * 冻结规则一：**拍现场照片必须是三违事件第一步**。
 *   顺序恒为：拍现场照片 → 生成三违记录ID → 选违章人员 → 选三违行为 → 整改/转派。
 *   绝不允许「选人 → 选三违 → 提交 → 再拍照片」。
 *
 * 冻结规则二：**发现人 ≠ 整改人**。
 *   公司管理人员发现问题 ≠ 公司管理人员负责整改。
 *
 * 冻结规则三：记录一旦生成**不可删除**，只能状态流转。
 *
 * 冻结规则四：整改完成必须存在 AFTER 照片。
 *
 * 全部断言 fail-closed：不满足即抛错，页面不得绕过。
 */

import type {
  Area,
  MobileAccount,
  PhotoRecord,
  PhotoType,
  TransferRecord,
  ViolationRecord,
} from './types';

export class FlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FlowError';
  }
}

/** 取某类型的照片 */
export function photosOfType(
  photos: PhotoRecord[],
  type: PhotoType,
): PhotoRecord[] {
  return photos.filter((p) => p.photoType === type);
}

/** 规则一：创建三违记录前，现场照片必须已存在 */
export function assertBeforePhotosPresent(beforeCount: number): void {
  if (!beforeCount || beforeCount <= 0) {
    throw new FlowError('必须先拍摄现场照片（BEFORE），才能生成三违记录ID');
  }
}

/** 规则一续：进入「选人/选行为」前，记录必须已绑定现场照片 */
export function assertRecordHasBeforePhoto(record: ViolationRecord, photos: PhotoRecord[]): void {
  if (photosOfType(photos, 'BEFORE').length === 0) {
    throw new FlowError(
      `三违记录 ${record.violationId} 缺少现场照片（BEFORE），请先补拍现场照片`,
    );
  }
}

/** 选人：必须明确选中一个有 employeeId 的员工 */
export function assertViolatorSelected(record: ViolationRecord): void {
  if (!record.violator || !record.violator.employeeId) {
    throw new FlowError('必须先选择违章人员（以员工ID为准），才能继续');
  }
}

/** 选行为：必须来自三违规则表（ruleId 必须存在） */
export function assertRuleSelected(record: ViolationRecord): void {
  if (!record.rule || !record.rule.ruleId) {
    throw new FlowError('必须选择三违行为（来自三违规则表），才能继续');
  }
}

/** 规则四：提交整改 —— 必须有整改措施 + 至少一张 AFTER 照片 */
export function assertCanSubmitRectify(
  record: ViolationRecord,
  photos: PhotoRecord[],
  measure: string,
): void {
  const before = photosOfType(photos, 'BEFORE');
  const after = photosOfType(photos, 'AFTER');
  if (before.length === 0) {
    throw new FlowError('缺少现场照片（BEFORE），无法提交整改');
  }
  if (after.length === 0) {
    throw new FlowError('提交整改必须拍摄整改后照片（AFTER）');
  }
  if (!String(measure || '').trim()) {
    throw new FlowError('必须填写整改措施');
  }
  if (!record.rectifyAccountId) {
    throw new FlowError('必须明确整改责任人');
  }
}

/**
 * 规则二 + 十七：转派 ——
 * ① 必须指定责任区域；② 必须指定责任管理员（账号ID，禁止自由文本）；
 * ③ 责任人 ≠ 发现人；④ 责任人账号必须启用。
 */
export function assertCanTransfer(
  record: ViolationRecord,
  photos: PhotoRecord[],
  input: {
    toAreaCode: string;
    toAccountId: string;
    /** 传入即校验存在性（不传则只做「非空」校验） */
    toArea?: Area | null;
    toAccount?: MobileAccount | null;
  },
): void {
  if (photosOfType(photos, 'BEFORE').length === 0) {
    throw new FlowError('缺少现场照片（BEFORE），无法转派');
  }
  if (!String(input.toAreaCode || '').trim()) {
    throw new FlowError('必须选择责任乡镇/区域');
  }
  if (!String(input.toAccountId || '').trim()) {
    throw new FlowError('必须选择责任管理员（不得自由文本填写）');
  }
  if (input.toArea !== undefined && !input.toArea) {
    throw new FlowError('责任区域不存在或已停用');
  }
  if (input.toAccount !== undefined && !input.toAccount) {
    throw new FlowError('责任管理员不存在');
  }
  if (input.toAccountId === record.discoverAccountId) {
    throw new FlowError('发现人 ≠ 整改人：不能把任务转派给发现人自己');
  }
  if (input.toAccount && input.toAccount.status !== 'ENABLED') {
    throw new FlowError('所选责任管理员账号已停用');
  }
}

/** 转派单状态流转断言 */
export function assertTransferTransition(
  t: TransferRecord,
  to: TransferRecord['status'],
): void {
  const allowed: Record<TransferRecord['status'], TransferRecord['status'][]> = {
    PENDING: ['ACCEPTED'],
    ACCEPTED: ['FEEDBACK'],
    FEEDBACK: ['CLOSED'],
    CLOSED: [],
  };
  if (!allowed[t.status].includes(to)) {
    throw new FlowError(`非法转派流转：${t.status} → ${to}`);
  }
}

/** 复查：只能在已提交整改（PENDING_REVIEW）后做 */
export function assertCanReview(record: ViolationRecord): void {
  if (record.status !== 'PENDING_REVIEW') {
    throw new FlowError('只有「待复查」状态的记录才能复查');
  }
}

/**
 * 判断当前记录对某账号展示在哪个清单：
 * - 我的整改：整改责任人是我，且状态需要整改
 * - 我的复查：复查人是我（或我发起且待复查），且状态待复查
 * - 我的任务：我发起的转派 / 转派给我的
 */
export type Bucket = 'RECTIFY' | 'REVIEW' | 'TASK' | 'NONE';

export function bucketOf(
  record: ViolationRecord,
  accountId: string,
  transfers: TransferRecord[],
): Bucket {
  const mine = transfers.filter(
    (t) => t.violationId === record.violationId,
  );
  if (
    record.status === 'PENDING_RECTIFY' ||
    record.status === 'RECTIFYING' ||
    record.status === 'TRANSFERRED'
  ) {
    if (record.rectifyAccountId === accountId) return 'RECTIFY';
    if (mine.some((t) => t.toAccountId === accountId)) return 'RECTIFY';
  }
  if (record.status === 'PENDING_REVIEW') {
    if (record.reviewAccountId === accountId) return 'REVIEW';
    if (record.discoverAccountId === accountId) return 'REVIEW';
  }
  if (mine.some((t) => t.fromAccountId === accountId || t.toAccountId === accountId)) {
    return 'TASK';
  }
  if (record.discoverAccountId === accountId) return 'TASK';
  return 'NONE';
}
