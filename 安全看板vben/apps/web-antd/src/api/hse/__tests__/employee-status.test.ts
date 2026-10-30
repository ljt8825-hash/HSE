/**
 * A-02d.3 / B02-DEC-03.17 P4 + P6 — web-antd 员工状态契约测试
 *
 * 覆盖：
 *   1. 状态标签覆盖后端真实返回值（inactive / secondment / unpaid_leave / former / reinstated）
 *   2. inactive 显示「离职」而不是「退休」，判色为红而非退休蓝
 *   3. 委员会筛选项 value 为后端编码；「返聘」= reinstated，不再出现 rehire
 *   4. 任何选项都不产生 undefined 参数（无静默丢弃筛选条件）
 *   5. 既有 5 个值（active / left / pending / retired / 返聘）展示与取色不回归
 *
 * 边界声明：验证对象是视图实际消费的纯映射模块（`#/api/hse/employee-status`），
 * 不是渲染后的 UI 集成测试。
 */
import { describe, expect, it } from 'vitest';

import {
  COMMITTEE_STATUS_FILTER_OPTIONS,
  ORG_STATUS_LABEL,
  orgStatusColor,
  orgStatusLabel,
  toOrgStatusParam,
} from '../employee-status';

const optionValue = (label: string) =>
  COMMITTEE_STATUS_FILTER_OPTIONS.find((o) => o.label === label)?.value;

describe('web-antd 状态标签（D4-a 修复）', () => {
  it('A-02d 新增编码不再以英文原文直出', () => {
    expect(orgStatusLabel('secondment')).toBe('借调');
    expect(orgStatusLabel('unpaid_leave')).toBe('停薪留职');
    expect(orgStatusLabel('former')).toBe('历史段');
  });

  it('inactive 显示「离职」，不得误显示为「退休」', () => {
    expect(orgStatusLabel('inactive')).toBe('离职');
    expect(orgStatusLabel('retired')).toBe('退休');
    expect(orgStatusLabel('inactive')).not.toBe(orgStatusLabel('retired'));
    expect(ORG_STATUS_LABEL.inactive).toBe('离职');
  });

  it('返聘 = 返聘（正式编码与历史别名都显示中文）', () => {
    expect(orgStatusLabel('reinstated')).toBe('返聘');
    expect(orgStatusLabel('rehire')).toBe('返聘');
  });

  it('未登记值原样返回；空值返回占位符', () => {
    expect(orgStatusLabel('wtf_code')).toBe('wtf_code');
    expect(orgStatusLabel(undefined)).toBe('-');
    expect(orgStatusLabel('')).toBe('-');
  });
});

describe('web-antd 状态判色', () => {
  it('既有 5 个值取色不回归（原实现 active 绿 / left 红 / 其余橙）', () => {
    expect(orgStatusColor('active')).toBe('green');
    expect(orgStatusColor('left')).toBe('red');
    expect(orgStatusColor('pending')).toBe('orange');
    expect(orgStatusColor('retired')).toBe('orange');
    expect(orgStatusColor('reinstated')).toBe('orange');
  });

  it('inactive 取红（离职语义），与 retired 不共用颜色', () => {
    expect(orgStatusColor('inactive')).toBe('red');
    expect(orgStatusColor('inactive')).not.toBe(orgStatusColor('retired'));
  });

  it('借调 / 停薪留职有明确取色，历史段取中性，未知为空色', () => {
    expect(orgStatusColor('secondment')).toBe('orange');
    expect(orgStatusColor('unpaid_leave')).toBe('orange');
    expect(orgStatusColor('former')).toBe('default');
    expect(orgStatusColor('wtf_code')).toBe('orange'); // 与改动前一致：未知非空值仍为橙
    expect(orgStatusColor(undefined)).toBe('default');
  });
});

describe('web-antd 委员会页筛选契约（P2 / D5-c / D5-d）', () => {
  it('「返聘」查询编码为 reinstated，不再是 rehire', () => {
    expect(optionValue('返聘')).toBe('reinstated');
    expect(COMMITTEE_STATUS_FILTER_OPTIONS.some((o) => o.value === 'rehire')).toBe(false);
  });

  it('补齐借调 / 停薪留职入口', () => {
    expect(optionValue('借调')).toBe('secondment');
    expect(optionValue('停薪留职')).toBe('unpaid_leave');
  });

  it('筛选项 value 均为 ASCII 编码（不再是中文标签）', () => {
    for (const opt of COMMITTEE_STATUS_FILTER_OPTIONS) {
      expect(opt.value).toMatch(/^[a-z_]+$/);
      expect(opt.value).not.toBe(opt.label);
    }
  });

  it('value / label 均无重复', () => {
    const values = COMMITTEE_STATUS_FILTER_OPTIONS.map((o) => o.value);
    const labels = COMMITTEE_STATUS_FILTER_OPTIONS.map((o) => o.label);
    expect(new Set(values).size).toBe(values.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('任何选项选中后 status 参数都不为 undefined', () => {
    for (const opt of COMMITTEE_STATUS_FILTER_OPTIONS) {
      expect(toOrgStatusParam(opt.value)).toBe(opt.value);
    }
  });

  it('既有 在职 / 离职 / 待岗 / 退休 选项不回归', () => {
    expect(optionValue('在职')).toBe('active');
    expect(optionValue('离职')).toBe('left');
    expect(optionValue('待岗')).toBe('pending');
    expect(optionValue('退休')).toBe('retired');
  });
});

describe('web-antd toOrgStatusParam 白名单语义', () => {
  it('空值不下发筛选条件', () => {
    expect(toOrgStatusParam('')).toBeUndefined();
    expect(toOrgStatusParam(undefined)).toBeUndefined();
    expect(toOrgStatusParam(null)).toBeUndefined();
  });

  it('中文标签与历史别名 rehire 不再作为查询值下发', () => {
    expect(toOrgStatusParam('在职')).toBeUndefined();
    expect(toOrgStatusParam('rehire')).toBeUndefined();
  });
});
