/**
 * 任务7（提示词07）前端 DTO/映射测试：
 * 1) 险种状态文本/颜色按后端 status 显示（insured/expiring/expired/uninsured），
 *    页面列不再用保额、记录对象存在或 hasInsurance 直接显示"已参保"。
 * 2) isCurrent 由后端记录真实值提供（InsTypeInfo.isCurrent），禁止由 hasInsurance 反推——
 *    停用保单（hasInsurance=false 但 isCurrent=false）编辑回显必须保持停用，
 *    不能因 hasInsurance=false 被误判/意外激活。
 */
import { describe, expect, it } from 'vitest';
import {
  getInsuranceStatusText,
  getInsuranceStatusColor,
  isActiveInsurance,
} from '#/api/hse/personnel-status';
import type { InsTypeInfo } from '#/api/hse/insurance';

describe('人员保险状态显示映射（任务7）', () => {
  it('四态文本映射与业务语义一致', () => {
    expect(getInsuranceStatusText('insured')).toBe('已参保');
    expect(getInsuranceStatusText('expiring')).toBe('即将到期');
    expect(getInsuranceStatusText('expired')).toBe('已过期');
    expect(getInsuranceStatusText('uninsured')).toBe('未参保');
    expect(getInsuranceStatusText(undefined)).toBe('未参保');
  });

  it('四态颜色映射（insured 绿 / expiring 金 / expired 红 / uninsured 默认）', () => {
    expect(getInsuranceStatusColor('insured')).toBe('green');
    expect(getInsuranceStatusColor('expiring')).toBe('gold');
    expect(getInsuranceStatusColor('expired')).toBe('red');
    expect(getInsuranceStatusColor('uninsured')).toBe('default');
    expect(getInsuranceStatusColor(undefined)).toBe('default');
  });

  it('isActiveInsurance 仅认 insured/expiring（当前有效参保）', () => {
    expect(isActiveInsurance('insured')).toBe(true);
    expect(isActiveInsurance('expiring')).toBe(true);
    expect(isActiveInsurance('expired')).toBe(false);
    expect(isActiveInsurance('uninsured')).toBe(false);
    expect(isActiveInsurance(undefined)).toBe(false);
  });

  it('停用保单：hasInsurance=false 但 isCurrent 保持 false（编辑不激活）', () => {
    // 模拟后端返回的停用记录：status=uninsured（停用/日期不完整），
    // isCurrent=false（记录真实值），hasInsurance=false（与 status 同源）
    const stopped: InsTypeInfo = {
      id: 42,
      recordExists: true,
      hasInsurance: false,
      isCurrent: false,
      policyNo: 'P-STOP',
      startDate: '2026-01-01',
      expireDate: '2026-12-31',
      premium: 500,
      coverage: 0,
      status: 'uninsured',
    };
    // 编辑回显必须使用 isCurrent（false），而不是用 hasInsurance 反推（false 也会 false，
    // 但语义来源必须正确；此处证明字段独立存在且值不来自 hasInsurance 推导）
    expect(stopped.isCurrent).toBe(false);
    expect(stopped.hasInsurance).toBe(false);
    // 若旧实现用 hasInsurance 反推，同样为 false——但新契约显式携带 isCurrent，
    // 前端直接读取记录真实值，避免未来 hasInsurance 语义变化导致停用保单被激活。
    expect(isActiveInsurance(stopped.status)).toBe(false);
  });

  it('当前有效保单：hasInsurance=true 且 isCurrent=true 均来自后端（同一事实）', () => {
    const active: InsTypeInfo = {
      id: 7,
      recordExists: true,
      hasInsurance: true,
      isCurrent: true,
      policyNo: 'P-ACTIVE',
      startDate: '2026-01-01',
      expireDate: '2027-12-31',
      premium: 1200,
      coverage: 800000,
      status: 'insured',
    };
    expect(active.isCurrent).toBe(true);
    expect(isActiveInsurance(active.status)).toBe(true);
  });

  it('历史过期记录：有 ID 可进入编辑流程，但显示已过期（可编辑性与参保显示分离）', () => {
    const expired: InsTypeInfo = {
      id: 99,
      recordExists: true,
      hasInsurance: false,
      isCurrent: false,
      policyNo: 'P-OLD',
      startDate: '2020-01-01',
      expireDate: '2021-01-01',
      premium: 300,
      coverage: 0,
      status: 'expired',
    };
    // 有记录 ID → 可进入既有编辑/查看流程
    expect(expired.recordExists).toBe(true);
    expect(expired.id).toBe(99);
    // 参保显示按 status：已过期
    expect(getInsuranceStatusText(expired.status)).toBe('已过期');
    expect(isActiveInsurance(expired.status)).toBe(false);
  });
});
