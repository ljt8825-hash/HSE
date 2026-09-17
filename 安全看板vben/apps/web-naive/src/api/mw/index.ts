/**
 * MOBILE-WPS-V1 · 业务门面（页面唯一入口）
 *
 * 纪律：
 * 1. 页面**只能**调用本文件导出的方法，**禁止**直接 import transports/* 或直接打 WPS。
 *    ⇒ 保证「UI → 业务模型 → 适配层 → WPS」的分层不被打破。
 * 2. 所有业务规则（照片必须第一步 / 发现人≠整改人 / 状态流转 / 范围过滤）
 *    都在 core/* 里做断言，本文件只做编排。
 * 3. 本文件**不做任何扣分计算**。E-08-11 正式扣分属于正式 HSE 后端，本项目不复制。
 */

import {
  FlowError,
  assertBeforePhotosPresent,
  assertCanReview,
  assertCanSubmitRectify,
  assertCanTransfer,
  assertRecordHasBeforePhoto,
  assertRuleSelected,
  assertTransferTransition,
  assertViolatorSelected,
  bucketOf,
} from './core/flow';
import { buildViolationId, nowIso, randomId, yyyymmdd } from './core/id';
import {
  filterRosterByScope,
  isAssignable,
  pickByEmployeeId,
  searchRoster,
  toViolatorSnapshot,
} from './core/scope';
import { assertTransition } from './core/status';
import type {
  Area,
  MobileAccount,
  PhotoRecord,
  PhotoType,
  ReviewRecord,
  RosterEmployee,
  TransferRecord,
  ViolationBundle,
  ViolationRecord,
  ViolationRule,
  ViolationStatus,
} from './core/types';
import { VIOLATION_STATUS_LABEL } from './core/types';
import { compressImage } from './photo-store';
import { getSession, setSession, clearSession } from './session';
import {
  clearDraft,
  listStaged,
  readStagedData,
  stagePhoto,
} from './staging';
import { getTransport, setTokenReader } from './transports/index';
import type { MwTransport } from './transports/types';

export { FlowError };
export { VIOLATION_STATUS_LABEL };
export { beginDraft, currentDraftId, removeStaged } from './staging';

/* 会话令牌注入（仅 HTTP 中间层模式使用；本地模式为空串） */
setTokenReader(() => getSession()?.token || '');

/* ============================ 登录（V1 临时身份） ============================ */

export interface LoginOk {
  ok: true;
  account: MobileAccount;
}
export interface LoginFail {
  ok: false;
  reason: 'EMPTY' | 'NOT_FOUND' | 'DISABLED' | 'DUPLICATE';
  message: string;
}

/**
 * 手机号登录（V1 临时身份识别，非正式安全认证）。
 * 手机号不存在 / 停用 ⇒ 明确失败，绝不「猜测放行」。
 */
export async function loginByPhone(
  phone: string,
): Promise<LoginOk | LoginFail> {
  const p = String(phone || '').replace(/\s+/g, '');
  if (!p) {
    return { ok: false, reason: 'EMPTY', message: '请输入手机号' };
  }
  const accounts = await getTransport().listAccounts();
  const hit = accounts.filter(
    (a) => String(a.phone || '').replace(/\s+/g, '') === p,
  );
  if (hit.length > 1) {
    return {
      ok: false,
      reason: 'DUPLICATE',
      message: '该手机号对应多个账号，请联系管理员处理',
    };
  }
  if (hit.length === 0) {
    return { ok: false, reason: 'NOT_FOUND', message: '手机号未在手机端账号表中登记' };
  }
  const account = hit[0] as MobileAccount;
  if (account.status !== 'ENABLED') {
    return { ok: false, reason: 'DISABLED', message: '该账号已停用，请联系管理员' };
  }
  setSession(account);
  return { ok: true, account };
}

/** 当前登录账号（未登录返回 null） */
export async function currentAccount(): Promise<MobileAccount | null> {
  const s = getSession();
  if (!s) return null;
  const list = await getTransport().listAccounts();
  return list.find((a) => a.accountId === s.accountId) || null;
}

export function logout(): void {
  clearSession();
}

/* ============================ 主数据读取 ============================ */

/** 按登录人范围过滤后的花名册候选池（禁止全量加载） */
export async function getRosterCandidates(
  account: MobileAccount,
): Promise<RosterEmployee[]> {
  const roster = await getTransport().listRoster();
  return filterRosterByScope(account, roster);
}

/** 在候选池内搜索（结果仍是候选池子集） */
export async function searchCandidates(
  account: MobileAccount,
  keyword: string,
): Promise<RosterEmployee[]> {
  const pool = await getRosterCandidates(account);
  return searchRoster(pool, keyword);
}

/** 启用的三违行为（唯一来源，前端零硬编码） */
export async function getEnabledRules(): Promise<ViolationRule[]> {
  const rules = await getTransport().listRules();
  return rules
    .filter((r) => r.enabled)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

/** 责任区域目录 */
export async function getAreas(): Promise<Area[]> {
  const areas = await getTransport().listAreas();
  return areas.filter((a) => a.status === 'ENABLED');
}

/** 某区域下可被转派的启用账号（排除发起人自己） */
export async function getAreaManagers(
  areaCode: string,
  fromAccountId: string,
): Promise<MobileAccount[]> {
  const [areas, accounts] = await Promise.all([
    getAreas(),
    getTransport().listAccounts(),
  ]);
  const area = areas.find((a) => a.areaCode === areaCode);
  const inArea = accounts.filter((a) => {
    if (!isAssignable(a, fromAccountId)) return false;
    // 责任区域：账号所属部门/作业单元命中区域名，或账号被显式登记为该区域管理员
    return (
      a.dept === (area?.areaName || '') ||
      a.workUnit === (area?.areaName || '') ||
      a.accountId === (area?.managerAccountId || '')
    );
  });
  return inArea;
}

/* ============================ 照片：第一步 ============================ */

/**
 * 暂存现场照片（BEFORE）。此时还没有三违记录ID，
 * 照片落到持久化暂存区，**不是**组件内存。
 */
export async function stageBeforePhoto(
  draftId: string,
  file: File | Blob,
  fileName: string,
  accountId: string,
): Promise<{ id: string; bytes: number }> {
  const c = await compressImage(file);
  const item = await stagePhoto(draftId, fileName, c.dataUrl, accountId, c.bytes);
  return { id: item.id, bytes: item.bytes };
}

export async function listStagedPhotos(draftId: string) {
  return listStaged(draftId);
}

export async function stagedPhotoDataUrl(id: string): Promise<string> {
  return readStagedData(id);
}

/* ============================ 生成三违记录ID ============================ */

export interface CreateViolationInput {
  draftId: string;
  account: MobileAccount;
  location: string;
  /** 发现时的检查区域分类（历史检查区域维度；可为「公司管理」） */
  discoverAreaCode: string;
  discoveredAt?: string;
}

/**
 * 由已暂存的现场照片生成三违记录ID 并落库。
 * 冻结规则：没有 BEFORE 照片 ⇒ 直接抛错，不允许先建记录后补照片。
 */
export async function createViolationFromDraft(
  input: CreateViolationInput,
): Promise<ViolationRecord> {
  const t = getTransport();
  const staged = listStaged(input.draftId);
  assertBeforePhotosPresent(staged.length);

  const dateStr = yyyymmdd(new Date(input.discoveredAt || Date.now()));
  const seq = await t.nextViolationSeq(dateStr);
  const violationId = buildViolationId(dateStr, seq);
  const at = input.discoveredAt || nowIso();

  const record: ViolationRecord = {
    violationId,
    rowId: randomId('row'),
    status: 'DRAFT',
    discoverAccountId: input.account.accountId,
    discoverName: input.account.name,
    discoveredAt: at,
    location: String(input.location || '').trim(),
    discoverAreaCode: input.discoverAreaCode || '',
    violator: null,
    rule: null,
    rectifyAccountId: '',
    rectifyName: '',
    measure: '',
    rectifiedAt: '',
    reviewAccountId: '',
    reviewName: '',
    reviewedAt: '',
    reviewResult: '',
    reviewNote: '',
    responsibleAreaCode: '',
    transferId: '',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  const saved = await t.createRecord(record);

  // 暂存照片绑定到真实三违记录ID（此后才算「证据」）
  for (const p of staged) {
    const dataUrl = await readStagedData(p.id);
    if (!dataUrl) continue;
    await t.putPhoto({
      violationId,
      photoType: 'BEFORE',
      fileName: p.fileName,
      dataUrl,
      uploadedByAccountId: p.uploadedByAccountId || input.account.accountId,
    });
  }
  await clearDraft(input.draftId);
  return saved;
}

/** 追加整改后照片（AFTER） */
export async function addAfterPhoto(
  violationId: string,
  file: File | Blob,
  fileName: string,
  accountId: string,
): Promise<PhotoRecord> {
  const c = await compressImage(file);
  return getTransport().putPhoto({
    violationId,
    photoType: 'AFTER',
    fileName,
    dataUrl: c.dataUrl,
    uploadedByAccountId: accountId,
  });
}

/* ============================ 选人 / 选行为 ============================ */

export async function getBundle(
  violationId: string,
): Promise<ViolationBundle | null> {
  return getTransport().getRecord(violationId);
}

/**
 * 选择违章人员。
 * ① 记录必须有 BEFORE 照片（顺序守卫）；
 * ② 员工必须在登录人**范围内**的候选池里（禁止范围外选人、禁止姓名猜 ID）。
 */
export async function selectViolator(
  violationId: string,
  employeeId: string,
  account: MobileAccount,
): Promise<ViolationRecord> {
  const t = getTransport();
  const bundle = await t.getRecord(violationId);
  if (!bundle) throw new FlowError(`三违记录不存在：${violationId}`);
  assertRecordHasBeforePhoto(bundle.record, bundle.photos);

  const pool = await getRosterCandidates(account);
  const emp = pickByEmployeeId(pool, employeeId);
  if (!emp) {
    throw new FlowError(
      '所选人员不在你的检查范围内（或已停用），请重新选择',
    );
  }
  const next: ViolationRecord = {
    ...bundle.record,
    violator: toViolatorSnapshot(emp),
    updatedAt: nowIso(),
  };
  return t.updateRecord(next);
}

/** 选择三违行为（必须来自三违规则表） */
export async function selectRule(
  violationId: string,
  ruleId: string,
): Promise<ViolationRecord> {
  const t = getTransport();
  const bundle = await t.getRecord(violationId);
  if (!bundle) throw new FlowError(`三违记录不存在：${violationId}`);
  assertRecordHasBeforePhoto(bundle.record, bundle.photos);

  const rules = await getEnabledRules();
  const rule = rules.find((r) => r.ruleId === ruleId);
  if (!rule) throw new FlowError('所选三违行为不存在或已停用，请重新选择');

  const next: ViolationRecord = {
    ...bundle.record,
    rule: { ruleId: rule.ruleId, name: rule.name, category: rule.category },
    updatedAt: nowIso(),
  };
  return t.updateRecord(next);
}

/* ============================ 处置三选一 ============================ */

/**
 * 暂不整改：人员与行为已定，记录挂起为「待整改」，**不可删除**。
 * 默认整改责任人 = 发现人自己（之后可从「我的整改」进入补整改）。
 */
export async function decideLater(
  violationId: string,
): Promise<ViolationRecord> {
  const t = getTransport();
  const bundle = await t.getRecord(violationId);
  if (!bundle) throw new FlowError(`三违记录不存在：${violationId}`);
  assertViolatorSelected(bundle.record);
  assertRuleSelected(bundle.record);
  assertTransition(bundle.record.status, 'PENDING_RECTIFY');

  const next: ViolationRecord = {
    ...bundle.record,
    status: 'PENDING_RECTIFY',
    rectifyAccountId: bundle.record.discoverAccountId,
    rectifyName: bundle.record.discoverName,
    updatedAt: nowIso(),
  };
  return t.updateRecord(next);
}

/** 立即整改：进入整改中，去拍整改后照片 */
export async function decideRectifyNow(
  violationId: string,
  account: MobileAccount,
): Promise<ViolationRecord> {
  const t = getTransport();
  const bundle = await t.getRecord(violationId);
  if (!bundle) throw new FlowError(`三违记录不存在：${violationId}`);
  assertViolatorSelected(bundle.record);
  assertRuleSelected(bundle.record);
  assertTransition(bundle.record.status, 'RECTIFYING');

  const next: ViolationRecord = {
    ...bundle.record,
    status: 'RECTIFYING',
    rectifyAccountId: account.accountId,
    rectifyName: account.name,
    updatedAt: nowIso(),
  };
  return t.updateRecord(next);
}

/* ============================ 整改提交 ============================ */

/**
 * 提交整改。
 * 硬约束：BEFORE 必须存在 + AFTER 必须存在 + 整改措施必填 + 整改责任人明确。
 * 若存在未关闭的转派单，整改提交即向发起人「反馈」。
 */
export async function submitRectify(
  violationId: string,
  measure: string,
  account: MobileAccount,
): Promise<ViolationRecord> {
  const t = getTransport();
  const bundle = await t.getRecord(violationId);
  if (!bundle) throw new FlowError(`三违记录不存在：${violationId}`);

  const rectifier =
    bundle.record.rectifyAccountId || account.accountId;
  const withRectifier: ViolationRecord = {
    ...bundle.record,
    rectifyAccountId: rectifier,
    rectifyName:
      bundle.record.rectifyName || account.name,
  };
  assertCanSubmitRectify(withRectifier, bundle.photos, measure);
  assertTransition(withRectifier.status, 'PENDING_REVIEW');

  const next: ViolationRecord = {
    ...withRectifier,
    status: 'PENDING_REVIEW',
    measure: String(measure).trim(),
    rectifiedAt: nowIso(),
    updatedAt: nowIso(),
  };
  const saved = await t.updateRecord(next);

  // 转派来的任务：整改提交 = 向发起人反馈
  const transfers = await t.listTransfers();
  const open = transfers
    .filter(
      (x) =>
        x.violationId === violationId &&
        (x.status === 'PENDING' || x.status === 'ACCEPTED'),
    )
    .sort((a, b) => String(b.transferredAt).localeCompare(String(a.transferredAt)));
  if (open[0]) {
    const cur = open[0] as TransferRecord;
    assertTransferTransition(cur, cur.status === 'PENDING' ? 'ACCEPTED' : 'FEEDBACK');
    const accepted: TransferRecord =
      cur.status === 'PENDING' ? { ...cur, status: 'ACCEPTED' } : cur;
    if (accepted.status === 'ACCEPTED') {
      assertTransferTransition(accepted, 'FEEDBACK');
      await t.updateTransfer({
        ...accepted,
        status: 'FEEDBACK',
        feedbackAt: nowIso(),
        feedbackNote: `整改已提交：${String(measure).trim().slice(0, 60)}`,
      });
    }
  }
  return saved;
}

/* ============================ 转派 ============================ */

export interface TransferInput {
  toAreaCode: string;
  toAccountId: string;
  remark?: string;
}

/**
 * 公司管理人员转派给责任乡镇/管理员。
 * 硬约束：发现人 ≠ 整改人；责任人必须「选区域 → 选管理员」，禁止自由文本。
 */
export async function transferOut(
  violationId: string,
  input: TransferInput,
  account: MobileAccount,
): Promise<{ record: ViolationRecord; transfer: TransferRecord }> {
  const t = getTransport();
  const bundle = await t.getRecord(violationId);
  if (!bundle) throw new FlowError(`三违记录不存在：${violationId}`);
  assertViolatorSelected(bundle.record);
  assertRuleSelected(bundle.record);

  const [areas, accounts] = await Promise.all([getAreas(), t.listAccounts()]);
  const area = areas.find((a) => a.areaCode === input.toAreaCode) || null;
  const target = accounts.find((a) => a.accountId === input.toAccountId) || null;

  // 断言顺序：现场照片 → 必选区域 → 必选管理员 → 存在性 → 发现人≠整改人 → 账号启用
  assertCanTransfer(bundle.record, bundle.photos, {
    toAreaCode: input.toAreaCode,
    toAccountId: input.toAccountId,
    toArea: area,
    toAccount: target,
  });
  assertTransition(bundle.record.status, 'TRANSFERRED');

  // 断言已保证二者非空（断言是 fail-closed，非空即继续）
  const areaObj = area as Area;
  const targetObj = target as MobileAccount;

  const transfer = await t.createTransfer({
    transferId: '',
    violationId,
    fromAccountId: account.accountId,
    fromName: account.name,
    toAreaCode: areaObj.areaCode,
    toAreaName: areaObj.areaName,
    toAccountId: targetObj.accountId,
    toName: targetObj.name,
    status: 'PENDING',
    remark: String(input.remark || '').trim(),
    transferredAt: nowIso(),
    feedbackAt: '',
    feedbackNote: '',
  });

  const next: ViolationRecord = {
    ...bundle.record,
    status: 'TRANSFERRED',
    responsibleAreaCode: areaObj.areaCode,
    transferId: transfer.transferId,
    rectifyAccountId: targetObj.accountId,
    rectifyName: targetObj.name,
    updatedAt: nowIso(),
  };
  const record = await t.updateRecord(next);
  return { record, transfer };
}

/** 责任人接收任务 */
export async function acceptTransfer(transferId: string): Promise<TransferRecord> {
  const t = getTransport();
  const cur = (await t.listTransfers()).find((x) => x.transferId === transferId);
  if (!cur) throw new FlowError(`转派单不存在：${transferId}`);
  assertTransferTransition(cur, 'ACCEPTED');
  return t.updateTransfer({ ...cur, status: 'ACCEPTED' });
}

/** 发起人确认完成（关闭转派单） */
export async function closeTransfer(transferId: string): Promise<TransferRecord> {
  const t = getTransport();
  const cur = (await t.listTransfers()).find((x) => x.transferId === transferId);
  if (!cur) throw new FlowError(`转派单不存在：${transferId}`);
  assertTransferTransition(cur, 'CLOSED');
  return t.updateTransfer({ ...cur, status: 'CLOSED', feedbackAt: cur.feedbackAt || nowIso() });
}

/* ============================ 复查 ============================ */

/**
 * 复查。通过 ⇒ 完成；不通过 ⇒ 打回整改中（可多轮）。
 */
export async function reviewViolation(
  violationId: string,
  result: 'PASS' | 'REJECT',
  note: string,
  account: MobileAccount,
): Promise<ViolationRecord> {
  const t = getTransport();
  const bundle = await t.getRecord(violationId);
  if (!bundle) throw new FlowError(`三违记录不存在：${violationId}`);
  assertCanReview(bundle.record);

  const to: ViolationRecord['status'] = result === 'PASS' ? 'COMPLETED' : 'RECTIFYING';
  assertTransition(bundle.record.status, to);

  const next: ViolationRecord = {
    ...bundle.record,
    status: to,
    reviewAccountId: account.accountId,
    reviewName: account.name,
    reviewedAt: nowIso(),
    reviewResult: result,
    reviewNote: String(note || '').trim(),
    updatedAt: nowIso(),
  };
  const saved = await t.updateRecord(next);

  await t.createReview({
    reviewId: '',
    violationId,
    reviewerAccountId: account.accountId,
    reviewerName: account.name,
    result,
    note: String(note || '').trim(),
    reviewedAt: nowIso(),
  });

  if (result === 'PASS' && bundle.record.transferId) {
    const tr = (await t.listTransfers()).find(
      (x) => x.transferId === bundle.record.transferId,
    );
    if (tr && (tr.status === 'FEEDBACK' || tr.status === 'ACCEPTED')) {
      await t.updateTransfer({
        ...tr,
        status: tr.status === 'FEEDBACK' ? 'CLOSED' : tr.status,
      });
    }
  }
  return saved;
}

/* ============================ 清单 ============================ */

export interface Lists {
  rectify: ViolationRecord[];
  review: ViolationRecord[];
  task: ViolationRecord[];
  all: ViolationRecord[];
}

/** 按登录身份分桶：我的整改 / 我的复查 / 我的任务 */
export async function listMyBuckets(accountId: string): Promise<Lists> {
  const t = getTransport();
  const [records, transfers] = await Promise.all([
    t.listRecords(),
    t.listTransfers(),
  ]);
  const rectify: ViolationRecord[] = [];
  const review: ViolationRecord[] = [];
  const task: ViolationRecord[] = [];
  for (const r of records) {
    const b = bucketOf(r, accountId, transfers);
    if (b === 'RECTIFY') rectify.push(r);
    else if (b === 'REVIEW') review.push(r);
    else if (b === 'TASK') task.push(r);
  }
  const byTime = (a: ViolationRecord, b: ViolationRecord) =>
    String(b.updatedAt).localeCompare(String(a.updatedAt));
  return {
    rectify: rectify.sort(byTime),
    review: review.sort(byTime),
    task: task.sort(byTime),
    all: [...records].sort(byTime),
  };
}

/** 按 transferId 取转派单（页面展示用） */
export async function getTransferById(
  transferId: string,
): Promise<TransferRecord | null> {
  if (!transferId) return null;
  const list = await getTransport().listTransfers();
  return list.find((x) => x.transferId === transferId) || null;
}

/** 我发起的转派单（发起人视角：看反馈结果） */
export async function listMyOutgoingTransfers(
  accountId: string,
): Promise<TransferRecord[]> {
  const list = await getTransport().listTransfers();
  return list
    .filter((x) => x.fromAccountId === accountId)
    .sort((a, b) => String(b.transferredAt).localeCompare(String(a.transferredAt)));
}

/* ============================ 适配层信息 ============================ */

export function transportInfo(): {
  kind: MwTransport['kind'];
  label: string;
  description: string;
  isTestData: boolean;
} {
  const t = getTransport();
  return {
    kind: t.kind,
    label: t.label,
    description: t.description,
    isTestData: t.isTestData,
  };
}

export type {
  Area,
  MobileAccount,
  PhotoRecord,
  PhotoType,
  ReviewRecord,
  RosterEmployee,
  TransferRecord,
  ViolationBundle,
  ViolationRecord,
  ViolationRule,
  ViolationStatus,
};
