/**
 * MOBILE-WPS-V1-NODE-02A · 复查规则决策闸门 — 只读审计用例
 *
 * 目的：用**可执行的代码事实**证明「PENDING_REVIEW 复查死结」的存在边界，
 * 为业务负责人选择 A/B/C/D 方案提供依据。
 *
 * 本文件**不修改任何业务代码**，也不实现任何复查规则：
 *   - 不新增 assertCanReview 的账号校验；
 *   - 不修改 bucketOf / 状态机 / flow.ts；
 *   - 只调用现有 API 并断言「当前实际行为」。
 *
 * 断言语义：这里断言的是**当前（有缺陷的）行为**，一旦业务负责人选定方案并完成改造，
 * 这些断言应当被推翻——那时本文件应同步更新为「新规则」的验收用例。
 */

// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';

import * as mw from '../index';
import { bucketOf } from '../core/flow';
import { resetStaging } from '../staging';
import { LocalTestTransport, resetLocalStore } from '../transports/local';
import { setTransport } from '../transports/index';
import type { MobileAccount } from '../core/types';

const PHONE_TOWN = '13800000001'; // TEST·张三(乡镇经理)  TEST-ACC-001
const PHONE_COMPANY = '13800000002'; // TEST·李四(公司管理)  TEST-ACC-002
const PHONE_B_MANAGER = '13800000004'; // TEST·赵六(乙镇管理员) TEST-ACC-004

function fakePhoto(): Blob {
  return new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'image/jpeg' });
}

async function login(phone: string): Promise<MobileAccount> {
  const r = await mw.loginByPhone(phone);
  if (!r.ok) throw new Error(`登录失败：${r.message}`);
  return r.account;
}

async function createWithBeforePhoto(account: MobileAccount, area = 'TEST-AREA-01') {
  const draftId = `draft-${Math.random().toString(36).slice(2)}`;
  await mw.stageBeforePhoto(draftId, fakePhoto(), 'before.jpg', account.accountId);
  return mw.createViolationFromDraft({
    draftId,
    account,
    location: 'TEST 现场',
    discoverAreaCode: area,
  });
}

/** 复刻详情页 src/views/mw/record.vue 的 canReview 计算（页面级，非服务端） */
function pageCanReview(record: { status: string; rectifyAccountId: string }, me: string) {
  return record.status === 'PENDING_REVIEW' && record.rectifyAccountId !== me;
}

beforeEach(() => {
  resetLocalStore();
  resetStaging();
  setTransport(new LocalTestTransport());
  mw.logout();
});

describe('H 复查死结 · 自查自纠场景（发现人 = 整改人）', () => {
  it('H1 发现人自己整改后 ⇒ 记录进入 PENDING_REVIEW 且 reviewAccountId 仍为空', async () => {
    const zhang = await login(PHONE_TOWN);
    const rec = await createWithBeforePhoto(zhang);
    await mw.selectViolator(rec.violationId, 'TEST-EMP-002', zhang);
    await mw.selectRule(rec.violationId, 'TEST-RULE-001');
    await mw.addAfterPhoto(rec.violationId, fakePhoto(), 'after.jpg', zhang.accountId);
    const done = await mw.submitRectify(rec.violationId, '自查自纠已整改', zhang);
    expect(done.status).toBe('PENDING_REVIEW');
    expect(done.rectifyAccountId).toBe(zhang.accountId);
    // 关键：复查人字段只在「复查动作发生后」才被写入，分桶时永远为空
    expect(done.reviewAccountId).toBe('');
  });

  it('H2 死结：发现人看得见（分桶 REVIEW）却做不了（页面禁用），其他所有人看不见（NONE）', async () => {
    const zhang = await login(PHONE_TOWN);
    const rec = await createWithBeforePhoto(zhang);
    await mw.selectViolator(rec.violationId, 'TEST-EMP-002', zhang);
    await mw.selectRule(rec.violationId, 'TEST-RULE-001');
    await mw.addAfterPhoto(rec.violationId, fakePhoto(), 'after.jpg', zhang.accountId);
    await mw.submitRectify(rec.violationId, '自查自纠已整改', zhang);

    const bundle = (await mw.getBundle(rec.violationId))!;
    const target = bundle.record;
    const transfers = bundle.transfers;

    const ids = ['TEST-ACC-001', 'TEST-ACC-002', 'TEST-ACC-003', 'TEST-ACC-004'];
    const rows = ids.map((id) => ({
      id,
      bucket: bucketOf(target, id, transfers),
      canReview: pageCanReview(target, id),
    }));

    // 发现人（=整改人）：出现在「我的复查」，但页面禁用复查按钮
    const me = rows.find((r) => r.id === 'TEST-ACC-001')!;
    expect(me.bucket).toBe('REVIEW');
    expect(me.canReview).toBe(false);

    // 其他所有账号：根本不在任何清单里
    for (const r of rows.filter((x) => x.id !== 'TEST-ACC-001')) {
      expect(r.bucket).not.toBe('REVIEW');
    }

    // ⇒ 结论：清单维度上，没有任何账号能对它执行复查（业务死结）
    expect(rows.filter((r) => r.bucket === 'REVIEW' && r.canReview).length).toBe(0);
  });

  it('H3 越权漏洞：任意非整改人账号绕过清单、直接打开详情页即可复查（服务端无账号校验）', async () => {
    const zhang = await login(PHONE_TOWN);
    const rec = await createWithBeforePhoto(zhang);
    await mw.selectViolator(rec.violationId, 'TEST-EMP-002', zhang);
    await mw.selectRule(rec.violationId, 'TEST-RULE-001');
    await mw.addAfterPhoto(rec.violationId, fakePhoto(), 'after.jpg', zhang.accountId);
    await mw.submitRectify(rec.violationId, '自查自纠已整改', zhang);

    // 换一个「与该记录毫无关系」的公司管理账号
    const li = await login(PHONE_COMPANY);
    const before = (await mw.getBundle(rec.violationId))!.record;
    expect(before.discoverAccountId).not.toBe(li.accountId);
    expect(before.rectifyAccountId).not.toBe(li.accountId);

    // assertCanReview 只校验状态、不校验账号 ⇒ 竟然可以复查通过
    const after = await mw.reviewViolation(rec.violationId, 'PASS', '越权复查', li);
    expect(after.status).toBe('COMPLETED');
    expect(after.reviewAccountId).toBe(li.accountId);
  });
});

describe('I 转派场景（发现人 ≠ 整改人）· 对照', () => {
  it('I1 转派场景有解：发现人可复查，且不是整改人', async () => {
    const li = await login(PHONE_COMPANY);
    const rec = await createWithBeforePhoto(li, 'TEST-AREA-COMPANY');
    await mw.selectViolator(rec.violationId, 'TEST-EMP-003', li);
    await mw.selectRule(rec.violationId, 'TEST-RULE-001');
    await mw.transferOut(
      rec.violationId,
      { toAreaCode: 'TEST-AREA-02', toAccountId: 'TEST-ACC-004', remark: '' },
      li,
    );

    const zhao = await login(PHONE_B_MANAGER);
    const beforeAccept = (await mw.getBundle(rec.violationId))!;
    await mw.acceptTransfer(
      beforeAccept.transfers.find((t) => t.violationId === rec.violationId)!.transferId,
    );
    await mw.addAfterPhoto(rec.violationId, fakePhoto(), 'after.jpg', zhao.accountId);
    const done = await mw.submitRectify(rec.violationId, '乙镇已整改', zhao);
    expect(done.status).toBe('PENDING_REVIEW');

    const after = (await mw.getBundle(rec.violationId))!;
    const target = after.record;
    const transfers = after.transfers;

    // 发现人（李四）：分到 REVIEW 且页面允许复查 ⇒ 有解
    expect(bucketOf(target, 'TEST-ACC-002', transfers)).toBe('REVIEW');
    expect(pageCanReview(target, 'TEST-ACC-002')).toBe(true);

    // 整改人（赵六）：不是 REVIEW（落到 TASK），且页面禁止自复查
    expect(bucketOf(target, 'TEST-ACC-004', transfers)).not.toBe('REVIEW');
    expect(pageCanReview(target, 'TEST-ACC-004')).toBe(false);
  });
});
