/**
 * A-02d.3 / B02-DEC-03.17 P6 — web-naive 员工状态映射与筛选契约测试
 *
 * 覆盖任务书 §四-P6 的自动化可测部分（纯映射逻辑）：
 *   1. 委员会页 借调 / 停薪留职 / 历史段 / 返聘 映射到正确后端编码
 *   2. 返聘统一为 reinstated（不再出现历史别名 rehire 作为查询值）
 *   3. 员工列表 借调 / 停薪留职 筛选项使用正确编码
 *   4. inactive / former / reinstated 等编码显示为预期中文，且 inactive ≠ retired
 *   5. 不存在「选中状态后参数变成 undefined」的路径
 *   6. 既有 在职 / 待岗 / 离职 / 退休 筛选不回归
 *
 * 边界声明：本文件验证的是**视图实际消费的映射模块**（`#/api/hse/employee-status`），
 * 不是渲染后的 UI 集成测试；模板层是否确实使用该模块由静态检索证据单独给出（见交付报告）。
 */
import { describe, expect, it } from 'vitest';

import {
  COMMITTEE_STATUS_FILTER_OPTIONS,
  EMPLOYEE_STATUS_FILTER_OPTIONS,
  ORG_STATUS_LABEL,
  orgStatusLabel,
  toOrgStatusParam,
} from '../employee-status';

const optionValue = (label: string) =>
  COMMITTEE_STATUS_FILTER_OPTIONS.find((o) => o.label === label)?.value;

describe('委员会页（安委会 Tab1）状态筛选契约', () => {
  it('借调 / 停薪留职 / 历史段 / 返聘 映射到后端认可编码', () => {
    expect(optionValue('借调')).toBe('secondment');
    expect(optionValue('停薪留职')).toBe('unpaid_leave');
    expect(optionValue('历史段')).toBe('former');
    expect(optionValue('返聘')).toBe('reinstated');
  });

  it('返聘不再使用历史别名 rehire', () => {
    expect(optionValue('返聘')).not.toBe('rehire');
    expect(COMMITTEE_STATUS_FILTER_OPTIONS.some((o) => o.value === 'rehire')).toBe(false);
  });

  it('所有筛选项 value 均为 ASCII 编码，不存在「value=中文标签」的旧实现（P1 根因）', () => {
    for (const opt of COMMITTEE_STATUS_FILTER_OPTIONS) {
      // 旧实现把中文标签当 value：这里用「非 ASCII 即标签」反向锁定回归
      expect(opt.value).toMatch(/^[a-z_]+$/);
      expect(opt.value).not.toBe(opt.label);
    }
  });

  it('筛选项 value 无重复、label 无重复', () => {
    const values = COMMITTEE_STATUS_FILTER_OPTIONS.map((o) => o.value);
    const labels = COMMITTEE_STATUS_FILTER_OPTIONS.map((o) => o.label);
    expect(new Set(values).size).toBe(values.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('任何选项选中后传给后端的 status 都不为 undefined（无静默丢弃筛选条件）', () => {
    for (const opt of COMMITTEE_STATUS_FILTER_OPTIONS) {
      const param = toOrgStatusParam(opt.value);
      expect(param).toBe(opt.value);
      expect(param).toBeTypeOf('string');
    }
  });
});

describe('员工列表页状态筛选契约（P3）', () => {
  it('补齐借调 / 停薪留职且使用正确编码', () => {
    const map = new Map(EMPLOYEE_STATUS_FILTER_OPTIONS.map((o) => [o.label, o.value]));
    expect(map.get('借调')).toBe('secondment');
    expect(map.get('停薪留职')).toBe('unpaid_leave');
  });

  it('既有 在职 / 待岗 / 离职 / 退休 / 返聘 筛选不回归', () => {
    const map = new Map(EMPLOYEE_STATUS_FILTER_OPTIONS.map((o) => [o.label, o.value]));
    expect(map.get('在职')).toBe('active');
    expect(map.get('待岗')).toBe('pending');
    expect(map.get('离职')).toBe('left');
    expect(map.get('退休')).toBe('retired');
    expect(map.get('返聘')).toBe('reinstated');
  });

  it('不提供 inactive 独立筛选项（与 left 同显示「离职」，避免同名双口径）', () => {
    expect(EMPLOYEE_STATUS_FILTER_OPTIONS.some((o) => o.value === 'inactive')).toBe(false);
  });
});

describe('状态展示标签（P5 配套）', () => {
  it('编码显示为预期中文', () => {
    expect(orgStatusLabel('active')).toBe('在职');
    expect(orgStatusLabel('pending')).toBe('待岗');
    expect(orgStatusLabel('secondment')).toBe('借调');
    expect(orgStatusLabel('unpaid_leave')).toBe('停薪留职');
    expect(orgStatusLabel('former')).toBe('历史段');
    expect(orgStatusLabel('reinstated')).toBe('返聘');
  });

  it('inactive 与 retired 是两个独立编码，不得合并为「退休」', () => {
    expect(orgStatusLabel('inactive')).toBe('离职');
    expect(orgStatusLabel('retired')).toBe('退休');
    expect(orgStatusLabel('inactive')).not.toBe(orgStatusLabel('retired'));
    // 类型契约补齐（P5）：inactive 必须是被登记过的编码，否则会被 toOrgStatusParam 判为未知
    expect(ORG_STATUS_LABEL.inactive).toBe('离职');
  });

  it('未登记值原样返回而不是空串；空值返回占位符', () => {
    expect(orgStatusLabel('unknown_code')).toBe('unknown_code');
    expect(orgStatusLabel(undefined)).toBe('-');
    expect(orgStatusLabel(null)).toBe('-');
    expect(orgStatusLabel('')).toBe('-');
  });
});

describe('toOrgStatusParam 白名单语义', () => {
  it('空值不下发筛选条件', () => {
    expect(toOrgStatusParam('')).toBeUndefined();
    expect(toOrgStatusParam(undefined)).toBeUndefined();
    expect(toOrgStatusParam(null)).toBeUndefined();
  });

  it('未登记值返回 undefined（由调用方显式提示，不做隐式下发）', () => {
    expect(toOrgStatusParam('在职')).toBeUndefined(); // 中文标签不再是合法入参
    expect(toOrgStatusParam('rehire')).toBeUndefined(); // 历史别名不再下发
  });
});
