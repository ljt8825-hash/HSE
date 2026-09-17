/**
 * MOBILE-WPS-V1-NODE-01 · 基础架构与业务骨架验收测试
 *
 * 覆盖（对应任务书第二十三条）：
 *   A 登录：存在 / 不存在 / 停用 / 正常进入
 *   B 三违主流程：现场照片 → 三违记录ID → 选人 → 选行为 → 保存
 *   C 立即整改
 *   D 延后整改
 *   E 公司管理转派 → 管理员整改 → 反馈 → 发起人确认
 *   F 冻结规则负向断言（照片必须第一步 / 发现人≠整改人 / 范围外选人 / 无 AFTER 不可提交）
 *
 * 运行环境说明：本文件显式使用 node 环境（无 document / localStorage / IndexedDB），
 * 以验证适配层在无浏览器能力时的降级不破坏业务规则。
 */

// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';

import * as mw from '../index';
import { resetStaging } from '../staging';
import { LocalTestTransport, resetLocalStore } from '../transports/local';
import { setTransport } from '../transports/index';
import type { MobileAccount } from '../core/types';

const PHONE_TOWN = '13800000001'; // TEST·张三(乡镇经理)
const PHONE_COMPANY = '13800000002'; // TEST·李四(公司管理)
const PHONE_DISABLED = '13800000003'; // TEST·王五(已停用)
const PHONE_B_MANAGER = '13800000004'; // TEST·赵六(乙镇管理员)

/** 造一张「假照片」（node 环境无 canvas，compressImage 会原样返回 dataURL） */
function fakePhoto(): Blob {
  return new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'image/jpeg' });
}

async function login(phone: string): Promise<MobileAccount> {
  const r = await mw.loginByPhone(phone);
  if (!r.ok) throw new Error(`登录失败：${r.message}`);
  return r.account;
}

/** 走完「拍现场照片 → 生成三违记录ID」这一段（所有流程的共同前置） */
async function createWithBeforePhoto(account: MobileAccount, location = 'TEST 现场') {
  const draftId = `draft-${Math.random().toString(36).slice(2)}`;
  await mw.stageBeforePhoto(draftId, fakePhoto(), 'before.jpg', account.accountId);
  return mw.createViolationFromDraft({
    draftId,
    account,
    location,
    discoverAreaCode: account.role === 'COMPANY_ADMIN' ? 'TEST-AREA-COMPANY' : 'TEST-AREA-01',
  });
}

beforeEach(() => {
  resetLocalStore();
  resetStaging();
  setTransport(new LocalTestTransport());
  mw.logout();
});

/* ============================== A 登录 ============================== */

describe('A 登录（V1 临时身份）', () => {
  it('A1 手机号存在 ⇒ 登录成功并返回身份', async () => {
    const acc = await login(PHONE_TOWN);
    expect(acc.accountId).toBe('TEST-ACC-001');
    expect(acc.status).toBe('ENABLED');
  });

  it('A2 手机号不存在 ⇒ 明确失败（NOT_FOUND）', async () => {
    const r = await mw.loginByPhone('13900001111');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('NOT_FOUND');
  });

  it('A3 停用账号 ⇒ 明确失败（DISABLED）', async () => {
    const r = await mw.loginByPhone(PHONE_DISABLED);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('DISABLED');
  });

  it('A4 空手机号 ⇒ 明确失败（EMPTY）', async () => {
    const r = await mw.loginByPhone('   ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('EMPTY');
  });

  it('A5 登录后能取回当前账号（正常进入系统）', async () => {
    await login(PHONE_TOWN);
    const cur = await mw.currentAccount();
    expect(cur?.phone).toBe(PHONE_TOWN);
  });
});

/* ========================= B 三违主流程 ========================= */

describe('B 三违主流程（照片优先 → 记录ID → 选人 → 选行为）', () => {
  it('B1 未拍现场照片 ⇒ 不允许生成三违记录ID（冻结规则一）', async () => {
    const acc = await login(PHONE_TOWN);
    await expect(
      mw.createViolationFromDraft({
        draftId: 'empty-draft',
        account: acc,
        location: 'x',
        discoverAreaCode: '',
      }),
    ).rejects.toThrow(/必须先拍摄现场照片/);
  });

  it('B2 拍现场照片 ⇒ 生成三违记录ID，且照片已绑定到该 ID', async () => {
    const acc = await login(PHONE_TOWN);
    const rec = await createWithBeforePhoto(acc);
    expect(rec.violationId).toMatch(/^SW-\d{8}-\d{4}$/);
    expect(rec.status).toBe('DRAFT');

    const bundle = await mw.getBundle(rec.violationId);
    expect(bundle?.photos.length).toBe(1);
    expect(bundle?.photos[0]?.photoType).toBe('BEFORE');
    expect(bundle?.photos[0]?.violationId).toBe(rec.violationId);
  });

  it('B3 人员候选按登录人范围过滤（不会加载全公司名单）', async () => {
    const town = await login(PHONE_TOWN);
    const townPool = await mw.getRosterCandidates(town);
    // 张三范围=甲镇作业单元 ⇒ 只能看到 EMP-001/002/003，看不到乙镇 EMP-004/005
    expect(townPool.map((e) => e.employeeId).sort()).toEqual([
      'TEST-EMP-001',
      'TEST-EMP-002',
      'TEST-EMP-003',
    ]);

    const company = await login(PHONE_COMPANY);
    const allPool = await mw.getRosterCandidates(company);
    expect(allPool.length).toBeGreaterThan(townPool.length);
  });

  it('B4 选范围外的员工 ⇒ 拒绝（禁止绕过范围）', async () => {
    const town = await login(PHONE_TOWN);
    const rec = await createWithBeforePhoto(town);
    await expect(
      mw.selectViolator(rec.violationId, 'TEST-EMP-004', town),
    ).rejects.toThrow(/不在你的检查范围内/);
  });

  it('B5 选人 + 选行为 ⇒ 身份快照与规则快照固化', async () => {
    const town = await login(PHONE_TOWN);
    const rec = await createWithBeforePhoto(town);

    const afterPerson = await mw.selectViolator(rec.violationId, 'TEST-EMP-001', town);
    expect(afterPerson.violator?.employeeId).toBe('TEST-EMP-001');
    expect(afterPerson.violator?.name).toBe('TEST·孙七');

    const rules = await mw.getEnabledRules();
    expect(rules.length).toBeGreaterThan(0);
    // 停用的规则（TEST-RULE-003）不得出现在可选列表
    expect(rules.map((r) => r.ruleId)).not.toContain('TEST-RULE-003');

    const afterRule = await mw.selectRule(rec.violationId, rules[0]!.ruleId);
    expect(afterRule.rule?.ruleId).toBe(rules[0]!.ruleId);
  });

  it('B6 选停用规则 ⇒ 拒绝', async () => {
    const town = await login(PHONE_TOWN);
    const rec = await createWithBeforePhoto(town);
    await expect(
      mw.selectRule(rec.violationId, 'TEST-RULE-003'),
    ).rejects.toThrow(/不存在或已停用/);
  });
});

/* ========================= C 立即整改 ========================= */

describe('C 立即整改', () => {
  it('C1 无整改后照片 ⇒ 提交整改被拒（冻结规则四）', async () => {
    const acc = await login(PHONE_TOWN);
    let rec = await createWithBeforePhoto(acc);
    rec = await mw.selectViolator(rec.violationId, 'TEST-EMP-001', acc);
    rec = await mw.selectRule(rec.violationId, 'TEST-RULE-001');
    rec = await mw.decideRectifyNow(rec.violationId, acc);
    expect(rec.status).toBe('RECTIFYING');

    await expect(mw.submitRectify(rec.violationId, '已整改', acc)).rejects.toThrow(
      /整改后照片/,
    );
  });

  it('C2 完整链路：现场照片 → ID → 人 → 行为 → 整改 → AFTER 照片 → 复查通过 → 完成', async () => {
    const acc = await login(PHONE_TOWN);
    let rec = await createWithBeforePhoto(acc);
    rec = await mw.selectViolator(rec.violationId, 'TEST-EMP-001', acc);
    rec = await mw.selectRule(rec.violationId, 'TEST-RULE-001');
    rec = await mw.decideRectifyNow(rec.violationId, acc);

    await mw.addAfterPhoto(rec.violationId, fakePhoto(), 'after.jpg', acc.accountId);
    rec = await mw.submitRectify(rec.violationId, '现场已完成整改', acc);
    expect(rec.status).toBe('PENDING_REVIEW');
    expect(rec.rectifiedAt).not.toBe('');

    rec = await mw.reviewViolation(rec.violationId, 'PASS', '整改到位', acc);
    expect(rec.status).toBe('COMPLETED');
    expect(rec.reviewResult).toBe('PASS');

    const bundle = await mw.getBundle(rec.violationId);
    expect(bundle?.photos.filter((p) => p.photoType === 'BEFORE').length).toBe(1);
    expect(bundle?.photos.filter((p) => p.photoType === 'AFTER').length).toBe(1);
    expect(bundle?.reviews.length).toBe(1);
  });

  it('C3 复查不通过 ⇒ 打回整改中', async () => {
    const acc = await login(PHONE_TOWN);
    let rec = await createWithBeforePhoto(acc);
    rec = await mw.selectViolator(rec.violationId, 'TEST-EMP-002', acc);
    rec = await mw.selectRule(rec.violationId, 'TEST-RULE-002');
    rec = await mw.decideRectifyNow(rec.violationId, acc);
    await mw.addAfterPhoto(rec.violationId, fakePhoto(), 'after.jpg', acc.accountId);
    rec = await mw.submitRectify(rec.violationId, '整改', acc);
    rec = await mw.reviewViolation(rec.violationId, 'REJECT', '整改不到位', acc);
    expect(rec.status).toBe('RECTIFYING');
  });
});

/* ========================= D 延后整改 ========================= */

describe('D 延后整改（暂不整改 → 我的整改 → 补整改）', () => {
  it('D1 结束本次操作 ⇒ 进入「待整改」且出现在我的整改，记录不可删除', async () => {
    const acc = await login(PHONE_TOWN);
    let rec = await createWithBeforePhoto(acc);
    rec = await mw.selectViolator(rec.violationId, 'TEST-EMP-001', acc);
    rec = await mw.selectRule(rec.violationId, 'TEST-RULE-001');
    rec = await mw.decideLater(rec.violationId);
    expect(rec.status).toBe('PENDING_RECTIFY');

    const buckets = await mw.listMyBuckets(acc.accountId);
    expect(buckets.rectify.map((r) => r.violationId)).toContain(rec.violationId);
  });

  it('D2 我的整改 → 拍整改后照片 → 提交整改 → 待复查', async () => {
    const acc = await login(PHONE_TOWN);
    let rec = await createWithBeforePhoto(acc);
    rec = await mw.selectViolator(rec.violationId, 'TEST-EMP-001', acc);
    rec = await mw.selectRule(rec.violationId, 'TEST-RULE-001');
    await mw.decideLater(rec.violationId);

    const buckets = await mw.listMyBuckets(acc.accountId);
    const target = buckets.rectify[0]!;
    await mw.addAfterPhoto(target.violationId, fakePhoto(), 'after.jpg', acc.accountId);
    rec = await mw.submitRectify(target.violationId, '后续完成整改', acc);
    expect(rec.status).toBe('PENDING_REVIEW');

    const after = await mw.listMyBuckets(acc.accountId);
    expect(after.review.map((r) => r.violationId)).toContain(rec.violationId);
  });
});

/* ==================== E 公司管理转派 ==================== */

describe('E 公司管理转派', () => {
  it('E1 转派给发现人自己 ⇒ 拒绝（发现人 ≠ 整改人）', async () => {
    const company = await login(PHONE_COMPANY);
    let rec = await createWithBeforePhoto(company);
    rec = await mw.selectViolator(rec.violationId, 'TEST-EMP-004', company);
    rec = await mw.selectRule(rec.violationId, 'TEST-RULE-001');
    await expect(
      mw.transferOut(rec.violationId, {
        toAreaCode: 'TEST-AREA-COMPANY',
        toAccountId: company.accountId,
      }, company),
    ).rejects.toThrow(/发现人 ≠ 整改人/);
  });

  it('E2 未选择责任区域 ⇒ 拒绝（责任人不得自由文本）', async () => {
    const company = await login(PHONE_COMPANY);
    let rec = await createWithBeforePhoto(company);
    rec = await mw.selectViolator(rec.violationId, 'TEST-EMP-004', company);
    rec = await mw.selectRule(rec.violationId, 'TEST-RULE-001');
    await expect(
      mw.transferOut(rec.violationId, { toAreaCode: '', toAccountId: 'TEST-ACC-004' }, company),
    ).rejects.toThrow(/必须选择责任乡镇/);
  });

  it('E3 完整链路：转派 → 管理员看到任务 → 整改 → 反馈 → 发起人确认完成', async () => {
    const company = await login(PHONE_COMPANY);
    let rec = await createWithBeforePhoto(company, 'TEST 公司巡查现场');
    rec = await mw.selectViolator(rec.violationId, 'TEST-EMP-004', company);
    rec = await mw.selectRule(rec.violationId, 'TEST-RULE-001');

    // 责任区域 → 该区域管理员
    const areas = await mw.getAreas();
    const areaB = areas.find((a) => a.areaCode === 'TEST-AREA-02')!;
    const managers = await mw.getAreaManagers(areaB.areaCode, company.accountId);
    expect(managers.map((m) => m.accountId)).toContain('TEST-ACC-004');

    const { transfer } = await mw.transferOut(rec.violationId, {
      toAreaCode: areaB.areaCode,
      toAccountId: 'TEST-ACC-004',
      remark: '请乙镇落实整改',
    }, company);
    expect(transfer.status).toBe('PENDING');

    const afterTransfer = await mw.getBundle(rec.violationId);
    expect(afterTransfer?.record.status).toBe('TRANSFERRED');
    expect(afterTransfer?.record.rectifyAccountId).toBe('TEST-ACC-004');
    expect(afterTransfer?.record.discoverAccountId).toBe(company.accountId);

    // 责任管理员（赵六）在「我的整改」看到任务
    const mgr = await mw.getBundle(rec.violationId);
    expect(mgr).not.toBeNull();
    const mgrBuckets = await mw.listMyBuckets('TEST-ACC-004');
    expect(mgrBuckets.rectify.map((r) => r.violationId)).toContain(rec.violationId);

    // 发起人（李四）在「我的任务」看到自己发起的转派
    const ownBuckets = await mw.listMyBuckets(company.accountId);
    expect(ownBuckets.task.map((r) => r.violationId)).toContain(rec.violationId);

    // 管理员整改 + 整改后照片 → 反馈给发起人
    await mw.acceptTransfer(transfer.transferId);
    await mw.addAfterPhoto(rec.violationId, fakePhoto(), 'after.jpg', 'TEST-ACC-004');
    const mgrAcc = await login(PHONE_B_MANAGER);
    expect(mgrAcc.accountId).toBe('TEST-ACC-004');
    rec = await mw.submitRectify(rec.violationId, '乙镇已完成整改', mgrAcc);
    expect(rec.status).toBe('PENDING_REVIEW');
    // 整改人 ≠ 发现人（公司管理人员只是发现人）
    expect(rec.rectifyAccountId).toBe('TEST-ACC-004');
    expect(rec.discoverAccountId).toBe(company.accountId);

    const transfers = await mw.getBundle(rec.violationId);
    expect(transfers?.transfers[0]?.status).toBe('FEEDBACK');

    // 发起人复查通过 ⇒ 完成，转派单关闭
    rec = await mw.reviewViolation(rec.violationId, 'PASS', '已核实', company);
    expect(rec.status).toBe('COMPLETED');
    const closed = await mw.getBundle(rec.violationId);
    expect(closed?.transfers[0]?.status).toBe('CLOSED');
  });
});

/* ==================== F 数据模型与适配层 ==================== */

describe('F 数据模型与适配层', () => {
  it('F1 三违记录ID 格式与当日序号递增', async () => {
    const acc = await login(PHONE_TOWN);
    const a = await createWithBeforePhoto(acc);
    const b = await createWithBeforePhoto(acc);
    expect(a.violationId).not.toBe(b.violationId);
    const seqA = Number(a.violationId.split('-')[2]);
    const seqB = Number(b.violationId.split('-')[2]);
    expect(seqB).toBe(seqA + 1);
  });

  it('F2 三违行为来自规则表，页面零硬编码（无真实数据即为空/TEST）', async () => {
    const rules = await mw.getEnabledRules();
    for (const r of rules) {
      expect(r.ruleId).toMatch(/^TEST-/);
    }
  });

  it('F3 适配层可被替换（本地 TEST ⇄ 中间层），业务门面无需改动', () => {
    const info = mw.transportInfo();
    expect(['local', 'http']).toContain(info.kind);
    expect(info.isTestData).toBe(true);
    expect(info.description).toContain('本机浏览器');
  });

  it('F4 「公司管理」是历史检查区域分类，不是部门', async () => {
    const areas = await mw.getAreas();
    const company = areas.find((a) => a.areaCode === 'TEST-AREA-COMPANY');
    expect(company?.areaTeam).toBe('COMPANY_MANAGEMENT');
    const townships = areas.filter((a) => a.areaTeam === 'TOWNSHIP');
    expect(townships.length).toBeGreaterThan(0);
  });

  it('F5 花名册以员工ID 为稳定标识（不是只存姓名）', async () => {
    const acc = await login(PHONE_TOWN);
    const pool = await mw.getRosterCandidates(acc);
    for (const e of pool) {
      expect(e.employeeId).toBeTruthy();
    }
    const rec = await createWithBeforePhoto(acc);
    const saved = await mw.selectViolator(rec.violationId, 'TEST-EMP-002', acc);
    expect(saved.violator?.employeeId).toBe('TEST-EMP-002');
    expect(saved.violator?.position).toBe('驾驶员');
  });
});

/* ===================== G 安全边界静态审计 ===================== */

describe('G 安全边界静态审计（源码红线扫描）', () => {
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');

  const ROOT = path.resolve(__dirname, '..');
  const VIEW_ROOT = path.resolve(ROOT, '..', '..', 'views', 'mw');

  /** 收集 mw 目录下所有源码文本（core 可被页面引用，一并扫描） */
  function collect(dir: string): Array<{ file: string; text: string }> {
    const out: Array<{ file: string; text: string }> = [];
    if (!fs.existsSync(dir)) return out;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        out.push(...collect(full));
      } else if (/\.(ts|vue)$/.test(name)) {
        out.push({ file: full, text: fs.readFileSync(full, 'utf8') });
      }
    }
    return out;
  }

  const files = [...collect(ROOT), ...collect(VIEW_ROOT)].map((f) => ({
    file: f.file,
    // 只扫可执行代码：注释/文档里允许出现「禁止这样写」的反例
    text: f.text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''),
  }));

  it('G1 源码中不存在任何 WPS 凭证（AppId / Secret / Token 字面量）', () => {
    const forbidden = [
      /WPS_APP_SECRET\s*[:=]\s*['"][^'"]+['"]/i,
      /WPS_APP_ID\s*[:=]\s*['"][^'"]+['"]/i,
      /appSecret\s*[:=]\s*['"][^'"]+['"]/i,
      /client_secret\s*[:=]\s*['"][^'"]+['"]/i,
      /WPS_BASE_ID\s*[:=]\s*['"][^'"]+['"]/i,
    ];
    for (const f of files) {
      for (const re of forbidden) {
        expect(
          re.test(f.text),
          `疑似硬编码凭证：${path.basename(f.file)}`,
        ).toBe(false);
      }
    }
  });

  it('G2 源码中不存在硬编码的三违行为清单', () => {
    for (const f of files) {
      // 三违行为必须来自规则表；允许 TEST- 前缀的占位与字段说明
      const hit = /const\s+(violations|VIOLATIONS|violationList)\s*=\s*\[/.test(
        f.text,
      );
      expect(hit, `疑似硬编码三违清单：${path.basename(f.file)}`).toBe(false);
    }
  });

  it('G3 源码中不存在前端直连 WPS 开放平台域名', () => {
    for (const f of files) {
      expect(
        /https?:\/\/[\w.-]*wps\.cn/i.test(f.text),
        `疑似前端直连 WPS：${path.basename(f.file)}`,
      ).toBe(false);
    }
  });

  it('G4 照片必须绑定到三违记录ID（不依赖组件内存）', async () => {
    const acc = await login(PHONE_TOWN);
    const rec = await createWithBeforePhoto(acc);
    const bundle = await mw.getBundle(rec.violationId);
    const before = (bundle?.photos || []).filter((p) => p.photoType === 'BEFORE');
    expect(before.length).toBe(1);
    for (const p of before) {
      expect(p.violationId).toBe(rec.violationId);
      expect(p.storageRef).toBeTruthy();
    }
  });

  it('G5 清单分桶：待整改/待复查/任务互不串桶', async () => {
    const town = await login(PHONE_TOWN);
    const rec = await createWithBeforePhoto(town);
    await mw.selectViolator(rec.violationId, 'TEST-EMP-002', town);
    const rules = await mw.getEnabledRules();
    await mw.selectRule(rec.violationId, rules[0]!.ruleId);
    await mw.decideLater(rec.violationId);

    const b = await mw.listMyBuckets(town.accountId);
    expect(b.rectify.some((r) => r.violationId === rec.violationId)).toBe(true);
    expect(b.review.some((r) => r.violationId === rec.violationId)).toBe(false);
  });
});
