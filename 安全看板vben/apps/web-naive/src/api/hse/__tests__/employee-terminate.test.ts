/**
 * A-02A / B02-DEC-03.34 — 终态登记前端契约测试（web-naive）
 *
 * 覆盖范围（任务书 §6 的自动化可测部分）：
 *   A. 入口显示：只有「服务端标记 is_terminal_relation !== true」且具备人员增改权限时才出现终态登记入口；
 *      已终态（辞职/死亡/退休）、关系为空 / 未知、拿 org_status 反推 的误显示均被排除；
 *      既有调岗 / 历史 / 返聘 三项文案与顺序回归不变（本文件只验证 terminate 项的追加）。
 *   B. 日期：初始为空（不预填今天）、未填阻止提交、时间戳 → YYYY-MM-DD 的转换口径。
 *   C. 提交：请求字段与后端 `terminateEmployee` 解构入参严格一致（employee_id / terminal_type /
 *      event_date / remark），不夹带 employment_relation / status / leave_date，错误消息原样提取。
 *   D. 终态类型：只允许 辞职 / 死亡 / 退休，不接受笼统「离职」。
 *
 * 边界声明（不夸大）：
 *   本文件验证的是 TerminalModal / index.vue 实际消费的**纯函数契约模块**
 *   （`#/api/hse/employee-terminate`），不是挂载组件的 UI 集成测试：
 *     - 「弹窗打开时清空日期」由 `createTerminateFormState()` 单一出口保证，
 *       TerminalModal 的 `resetForm()` 直接调用它（见组件源码）；
 *     - 「提交期间不可重复点击」由 `submitting` 标志 + 按钮 disabled/loading 双重保证，属模板行为，
 *       本文件不做 DOM 断言（项目无组件级测试基建）。
 *   渲染层与真实接口联调仍需人工走查，见交付报告「未完成项」。
 */
import { describe, expect, it } from 'vitest';

import {
  buildTerminateAction,
  buildTerminatePayload,
  canShowTerminateEntry,
  createTerminateFormState,
  extractTerminateError,
  isNotTerminalRow,
  TERMINAL_TYPES,
  toTerminateDateString,
  validateTerminateForm,
} from '../employee-terminate';

/** 固定基准日：2026-11-05（避免用例结果随运行日期漂移） */
const FIXED_TS = new Date(2026, 10, 5, 9, 30, 0).getTime();

const formalRow = {
  id: 1001,
  name: '赵在职',
  is_terminal_relation: false,
  org_status: 'active',
};

const retiredRow = {
  id: 1002,
  name: '钱退休',
  is_terminal_relation: true,
  is_retired_relation: true,
  org_status: 'retired',
};

const pendingRow = {
  id: 1003,
  name: '孙待岗',
  is_terminal_relation: false,
  org_status: 'pending',
};

const baseForm = () => ({
  ...createTerminateFormState(),
  terminal_type: '退休' as const,
  event_date: FIXED_TS,
});

// ============================================================
// A. 入口显示
// ============================================================
describe('A. 终态登记入口显示条件', () => {
  it('关系为非终态（is_terminal_relation=false）且有权限 → 可展示', () => {
    expect(isNotTerminalRow(formalRow)).toBe(true);
    expect(canShowTerminateEntry(formalRow, true)).toBe(true);
  });

  it('已处于终态（辞职/死亡/退休）→ 不展示', () => {
    expect(canShowTerminateEntry(retiredRow, true)).toBe(false);
    const resigned = { id: 1, name: '李辞职', is_terminal_relation: true, org_status: 'left' };
    const deceased = { id: 2, name: '王死亡', is_terminal_relation: true, org_status: 'left' };
    expect(canShowTerminateEntry(resigned, true)).toBe(false);
    expect(canShowTerminateEntry(deceased, true)).toBe(false);
  });

  it('关系为 NULL / 空串 / 标记缺失 → 仍展示（后端会拦截待核实者，前端不预判）', () => {
    expect(canShowTerminateEntry({ id: 3, is_terminal_relation: false, employment_relation: null }, true)).toBe(true);
    expect(canShowTerminateEntry({ id: 3, is_terminal_relation: false, employment_relation: '' }, true)).toBe(true);
    expect(canShowTerminateEntry({ id: 3 }, true)).toBe(true);
  });

  it('无人员增改权限 → 不展示（即使非终态）', () => {
    expect(canShowTerminateEntry(formalRow, false)).toBe(false);
    expect(canShowTerminateEntry(pendingRow, false)).toBe(false);
  });

  it('不得用 org_status 反推资格（反例：待岗但标记非终态 → 展示；已退休 → 不展示）', () => {
    // 待岗是中间态，is_terminal_relation=false，应展示（后端再按正式员工规则判定）
    expect(canShowTerminateEntry(pendingRow, true)).toBe(true);
    // 退休是终态，绝不可再登记
    expect(canShowTerminateEntry(retiredRow, true)).toBe(false);
  });
});

// ============================================================
// B. 菜单项构造（与既有调岗/历史/返聘互不干扰）
// ============================================================
describe('B. 行菜单项构造', () => {
  it('可展示时返回 terminate 项', () => {
    const actions = buildTerminateAction(formalRow, true);
    expect(actions).toEqual([{ key: 'terminate', label: '终态登记' }]);
  });

  it('不可展示时返回空数组', () => {
    expect(buildTerminateAction(retiredRow, true)).toEqual([]);
    expect(buildTerminateAction(formalRow, false)).toEqual([]);
  });
});

// ============================================================
// C. 业务事件日期
// ============================================================
describe('C. 业务事件日期', () => {
  it('初始状态日期为空（不预填今天）', () => {
    const s = createTerminateFormState();
    expect(s.event_date).toBeNull();
    expect(toTerminateDateString(s.event_date)).toBe('');
  });

  it('时间戳 → YYYY-MM-DD（本地日历日，非 UTC）', () => {
    // 东八区 2026-11-05 09:30 → 仍应为 2026-11-05（不落前一天）
    expect(toTerminateDateString(FIXED_TS)).toBe('2026-11-05');
  });

  it('非法时间戳 → 空串', () => {
    expect(toTerminateDateString(null)).toBe('');
    expect(toTerminateDateString(undefined)).toBe('');
    expect(toTerminateDateString(0)).toBe('');
    expect(toTerminateDateString(NaN)).toBe('');
  });
});

// ============================================================
// D. 提交校验
// ============================================================
describe('D. 提交前校验', () => {
  it('缺少员工信息 → 拦截', () => {
    expect(validateTerminateForm(null, baseForm())).toMatch(/员工/);
    expect(validateTerminateForm(undefined, baseForm())).toMatch(/员工/);
  });

  it('未选终态类型 → 拦截', () => {
    const f = { ...baseForm(), terminal_type: null };
    expect(validateTerminateForm(1, f)).toMatch(/终态类型/);
  });

  it('未选业务事件日期 → 拦截', () => {
    const f = { ...baseForm(), event_date: null };
    expect(validateTerminateForm(1, f)).toMatch(/业务事件日期/);
  });

  it('合法表单 → 通过', () => {
    expect(validateTerminateForm(1, baseForm())).toBeNull();
  });
});

// ============================================================
// E. 请求体组装（严格对齐后端解构入参）
// ============================================================
describe('E. 请求体组装', () => {
  it('只包含 employee_id / terminal_type / event_date / 可选 remark', () => {
    const payload = buildTerminatePayload(77, baseForm());
    expect(payload.employee_id).toBe(77);
    expect(payload.terminal_type).toBe('退休');
    expect(payload.event_date).toBe('2026-11-05');
    expect(payload).not.toHaveProperty('employment_relation');
    expect(payload).not.toHaveProperty('status');
    expect(payload).not.toHaveProperty('leave_date');
    expect(payload).not.toHaveProperty('org_unit_id');
  });

  it('备注为空时不夹带 remark', () => {
    const payload = buildTerminatePayload(77, { ...baseForm(), remark: '   ' });
    expect(payload).not.toHaveProperty('remark');
  });

  it('备注有值时带 remark', () => {
    const payload = buildTerminatePayload(77, { ...baseForm(), remark: '退休审批 2026-11' });
    expect(payload.remark).toBe('退休审批 2026-11');
  });

  it('终态类型集合只允许 辞职/死亡/退休', () => {
    expect(TERMINAL_TYPES.map((t) => t.value).sort()).toEqual(['死亡', '辞职', '退休']);
  });
});

// ============================================================
// F. 错误提取（原样返回后端 message）
// ============================================================
describe('F. 后端错误提取', () => {
  it('优先取响应体 message', () => {
    const err = { response: { data: { code: -4, message: '员工已处于终态' } } };
    expect(extractTerminateError(err)).toBe('员工已处于终态');
  });

  it('退回兜底文案（非 status code 句式）', () => {
    expect(extractTerminateError(new Error('boom'))).toBe('boom');
    expect(extractTerminateError({ message: 'Request failed with status code 500' })).toBe(
      '终态登记失败，请稍后重试或联系管理员',
    );
  });
});
