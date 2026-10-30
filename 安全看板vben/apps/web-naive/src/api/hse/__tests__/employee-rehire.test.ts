/**
 * A-02e.5-D1 / B02-DEC-03.28 — 返聘前端契约测试（web-naive）
 *
 * 覆盖范围（任务书 §6 的自动化可测部分）：
 *   A. 入口显示：只有「服务端标记关系=退休」且具备人员增改权限时才出现返聘入口；
 *      辞职 / 死亡 / 关系为空 / 未知关系 / 拿 org_status 反推 的四种误显示均被排除；
 *      调岗、历史两项的文案与顺序回归不变。
 *   B. 日期：初始为空（不预填今天）、未填阻止提交、时间戳 → YYYY-MM-DD 的转换口径。
 *   C. 提交：请求字段与后端 `rehireEmployee` 解构入参严格一致（不多不少）、
 *      不夹带 employment_relation / status，错误消息原样提取。
 *   D. 回归：菜单构造不改变既有两项。
 *
 * 边界声明（不夸大）：
 *   本文件验证的是 RehireModal / index.vue 实际消费的**纯函数契约模块**
 *   （`#/api/hse/employee-rehire`），不是挂载组件的 UI 集成测试：
 *     - 「弹窗打开时清空日期」由 `createRehireFormState()` 单一出口保证，
 *       RehireModal 的 `resetForm()` 直接调用它（见组件源码）；
 *     - 「提交期间不可重复点击」由 `submitting` 标志 + 按钮 disabled/loading 双重保证，
 *       属模板行为，本文件不做 DOM 断言（项目无组件级测试基建）。
 *   渲染层与真实接口联调仍需人工走查，见交付报告「未完成项」。
 */
import { describe, expect, it } from 'vitest';

import {
  buildRehirePayload,
  buildRowActions,
  canRehire,
  createRehireFormState,
  extractRehireError,
  isRetiredRelationRow,
  REHIRE_CHANGE_REASON,
  REHIRE_DATE_PATTERN,
  toRehireDateString,
  validateRehireForm,
} from '../employee-rehire';

/** 固定基准日：2026-11-05（避免用例结果随运行日期漂移） */
const FIXED_TS = new Date(2026, 10, 5, 9, 30, 0).getTime();

const retiredRow = {
  id: 1001,
  name: '张退休',
  is_retired_relation: true,
  org_status: 'retired',
};

const baseForm = () => ({
  ...createRehireFormState(),
  team_id: 12,
  position_id: 34,
  start_date: FIXED_TS,
});

// ============================================================
// A. 入口显示
// ============================================================
describe('A. 返聘入口显示条件', () => {
  it('关系明确为退休（is_retired_relation=true）且有权限 → 可返聘', () => {
    expect(isRetiredRelationRow(retiredRow)).toBe(true);
    expect(canRehire(retiredRow, true)).toBe(true);
  });

  it('辞职 / 死亡 → 不展示', () => {
    const resigned = { id: 1, name: '李辞职', is_retired_relation: false, employment_relation: '辞职' };
    const deceased = { id: 2, name: '王死亡', is_retired_relation: false, employment_relation: '死亡' };
    expect(canRehire(resigned, true)).toBe(false);
    expect(canRehire(deceased, true)).toBe(false);
  });

  it('关系为 NULL / 空串 → 不展示', () => {
    expect(canRehire({ id: 3, is_retired_relation: false, employment_relation: null }, true)).toBe(false);
    expect(canRehire({ id: 3, is_retired_relation: false, employment_relation: '' }, true)).toBe(false);
    // 标记整体缺失（旧接口/旧缓存返回体）同样按「不可返聘」处理，不做乐观推断
    expect(canRehire({ id: 3 }, true)).toBe(false);
    expect(canRehire(null, true)).toBe(false);
    expect(canRehire(undefined, true)).toBe(false);
  });

  it('未知关系值 → 不展示', () => {
    for (const relation of ['待岗', '借调', '停薪留职', '正式员工', '在册', '已退休']) {
      expect(canRehire({ id: 4, is_retired_relation: false, employment_relation: relation }, true)).toBe(false);
    }
  });

  it('⭐ 不得用 org_status 反推资格：org_status=retired 但标记缺失/为假 → 不展示', () => {
    // displayStatusSql 的 ELSE 分支会回落到 ev.assignment_status，
    // 关系为 NULL 但任职段状态恰为 retired 时同样返回 'retired'，
    // 后端必然以 -4 拒绝。此类行不得出现可点的返聘入口。
    expect(canRehire({ id: 5, org_status: 'retired' }, true)).toBe(false);
    expect(canRehire({ id: 5, org_status: 'retired', is_retired_relation: false }, true)).toBe(false);
    expect(canRehire({ id: 5, org_status: 'retired', is_retired_relation: null }, true)).toBe(false);
  });

  it('标记为真值但非严格 true（如 1 / "true"）不被误认', () => {
    expect(canRehire({ id: 6, is_retired_relation: 1 as unknown as boolean }, true)).toBe(false);
    expect(canRehire({ id: 6, is_retired_relation: 'true' as unknown as boolean }, true)).toBe(false);
  });

  it('无人员增改权限 → 即使关系为退休也不展示', () => {
    expect(canRehire(retiredRow, false)).toBe(false);
  });
});

// ============================================================
// D. 行操作菜单回归
// ============================================================
describe('D. 行操作菜单（调岗 / 历史 不回归）', () => {
  it('普通在职/辞职/死亡行：仍只有 调岗、历史，且顺序与文案不变', () => {
    for (const row of [
      { id: 1, org_status: 'active', is_retired_relation: false },
      { id: 2, org_status: 'left', is_retired_relation: false, employment_relation: '辞职' },
      { id: 3, org_status: 'left', is_retired_relation: false, employment_relation: '死亡' },
      { id: 4, org_status: 'retired', is_retired_relation: false },
    ]) {
      expect(buildRowActions(row, true)).toEqual([
        { key: 'transfer', label: '调岗' },
        { key: 'history', label: '历史' },
      ]);
    }
  });

  it('退休行 + 有权限：在原两项之后追加 返聘', () => {
    expect(buildRowActions(retiredRow, true)).toEqual([
      { key: 'transfer', label: '调岗' },
      { key: 'history', label: '历史' },
      { key: 'rehire', label: '返聘' },
    ]);
  });

  it('退休行 + 无权限：不追加 返聘', () => {
    expect(buildRowActions(retiredRow, false).map((a) => a.key)).toEqual([
      'transfer',
      'history',
    ]);
  });
});

// ============================================================
// B. 生效日期
// ============================================================
describe('B. 返聘生效日期', () => {
  it('初始状态为空：start_date=null（不预填今天）', () => {
    const state = createRehireFormState();
    expect(state.start_date).toBeNull();
    expect(state.team_id).toBeUndefined();
    expect(state.position_id).toBeUndefined();
  });

  it('连续两次构造均为空，与运行当天无关（排除 Date.now() 预填）', () => {
    const todayStr = toRehireDateString(Date.now());
    expect(createRehireFormState().start_date).toBeNull();
    expect(createRehireFormState().start_date).toBeNull();
    // 初始值为 null ⇒ 不存在「隐式等于今天」的可能
    expect(toRehireDateString(createRehireFormState().start_date)).not.toBe(todayStr);
    expect(toRehireDateString(createRehireFormState().start_date)).toBe('');
  });

  it('未填写时阻止提交', () => {
    const state = { ...createRehireFormState(), team_id: 12, position_id: 34 };
    const error = validateRehireForm(1001, state);
    expect(error).toBeTruthy();
    expect(error).toContain('返聘生效日期');
  });

  it('时间戳 → YYYY-MM-DD（本地日历日，不跨时区偏移）', () => {
    expect(toRehireDateString(FIXED_TS)).toBe('2026-11-05');
    expect(toRehireDateString(FIXED_TS)).toMatch(REHIRE_DATE_PATTERN);
    // 当天 00:00 与 23:59 必须映射到同一天
    expect(toRehireDateString(new Date(2026, 10, 5, 0, 0, 1).getTime())).toBe('2026-11-05');
    expect(toRehireDateString(new Date(2026, 10, 5, 23, 59, 59).getTime())).toBe('2026-11-05');
  });

  it('空值/非法时间戳统一返回空串（交给校验拦截，不静默补默认值）', () => {
    expect(toRehireDateString(null)).toBe('');
    expect(toRehireDateString(undefined)).toBe('');
    expect(toRehireDateString(0)).toBe('');
    expect(toRehireDateString(Number.NaN)).toBe('');
  });

  it('日期格式契约与后端 isIsoDateString 一致：仅接受 YYYY-MM-DD', () => {
    expect(REHIRE_DATE_PATTERN.test('2026-11-05')).toBe(true);
    expect(REHIRE_DATE_PATTERN.test('2026-1-5')).toBe(false);
    expect(REHIRE_DATE_PATTERN.test('2026/11/05')).toBe(false);
    expect(REHIRE_DATE_PATTERN.test('2026-11-05T00:00:00Z')).toBe(false);
    expect(REHIRE_DATE_PATTERN.test('')).toBe(false);
  });

  it('校验顺序：员工 → 部门 → 岗位 → 日期', () => {
    const empty = createRehireFormState();
    expect(validateRehireForm(undefined, empty)).toBe('缺少员工信息');
    expect(validateRehireForm(1001, empty)).toBe('请选择目标部门');
    expect(validateRehireForm(1001, { ...empty, team_id: 12 })).toBe('请选择岗位');
    expect(
      validateRehireForm(1001, { ...empty, team_id: 12, position_id: 34 }),
    ).toContain('返聘生效日期');
    expect(validateRehireForm(1001, baseForm())).toBeNull();
  });
});

// ============================================================
// C. 提交契约
// ============================================================
describe('C. 请求体与后端契约一致', () => {
  it('字段集合严格等于后端 rehireEmployee 解构的入参子集（不多不少）', () => {
    const payload = buildRehirePayload(1001, baseForm());
    expect(Object.keys(payload).sort()).toEqual([
      'change_reason',
      'employee_id',
      'position_id',
      'start_date',
      'team_id',
    ]);
  });

  it('start_date 为 YYYY-MM-DD 字符串，且取自用户选择而非系统时间', () => {
    const payload = buildRehirePayload(1001, baseForm());
    expect(payload.start_date).toBe('2026-11-05');
    expect(payload.start_date).toMatch(REHIRE_DATE_PATTERN);
    expect(payload.start_date).not.toBe(toRehireDateString(Date.now()));
  });

  it('change_reason 显式传「返聘」，与后端默认值一致', () => {
    expect(buildRehirePayload(1001, baseForm()).change_reason).toBe(REHIRE_CHANGE_REASON);
    expect(REHIRE_CHANGE_REASON).toBe('返聘');
  });

  it('⭐ 不夹带 employment_relation / status / owner 等前端无权决定的字段', () => {
    const payload = buildRehirePayload(1001, baseForm()) as unknown as Record<string, unknown>;
    for (const forbidden of [
      'employment_relation',
      'employment_relationship_status',
      'status',
      'status_code',
      'is_current',
      'is_primary',
      'org_unit_id',
      'userId',
      'user_id',
      'operator',
    ]) {
      expect(payload).not.toHaveProperty(forbidden);
    }
  });

  it('备注：非空才发送，且去除首尾空白', () => {
    expect(buildRehirePayload(1001, { ...baseForm(), remark: '   ' })).not.toHaveProperty('remark');
    expect(buildRehirePayload(1001, { ...baseForm(), remark: '' })).not.toHaveProperty('remark');
    expect(buildRehirePayload(1001, { ...baseForm(), remark: '  返聘依据  ' }).remark).toBe('返聘依据');
  });
});

// ============================================================
// C. 错误反馈
// ============================================================
describe('C. 后端错误消息原样提取', () => {
  it('拦截器抛出的 { response: { data: { message } } } 形态', () => {
    const err = { response: { data: { code: -4, message: '员工不是退休状态，不能返聘' } } };
    expect(extractRehireError(err)).toBe('员工不是退休状态，不能返聘');
  });

  it('直接携带 data 的形态', () => {
    expect(extractRehireError({ data: { code: -4, message: '生效日期必须晚于原任职段结束日期' } }))
      .toBe('生效日期必须晚于原任职段结束日期');
  });

  it('后端真实返回样本（B2.2 事务分支 message）逐条可提取', () => {
    const samples = [
      '返聘生效日期不能为空（业务日期必须显式传入，禁止用系统日期代替）',
      '返聘生效日期格式非法「2026/11/05」，必须为 YYYY-MM-DD',
      '员工仍有 1 条 is_current=true 的任职段（ID=9），与「退休」关系矛盾，属数据异常；返聘不自动关闭、不覆盖既有任职段，请先人工核实。',
      '返聘生效日期（2026-01-01）必须晚于原任职段结束日期（2026-03-01），否则新旧任职段在时间轴上重叠。',
      '返聘必须指定目标组织（org_unit_id 或 team_id/project_id 等组织参数），否则新任职段无法归属部门，会破坏列表与统计口径。',
      '「返聘」不是状态变更动作，本接口不再支持；请使用返聘流程 POST /api/hse/employee/org/rehire（该流程在同一事务内创建新任职段、重置用工关系并写入返聘历史）。',
    ];
    for (const message of samples) {
      expect(extractRehireError({ response: { data: { message } } })).toBe(message);
    }
  });

  it('error 字段回退（后端部分端点用 error 承载文案）', () => {
    expect(extractRehireError({ response: { data: { error: '数据库未连接' } } })).toBe('数据库未连接');
  });

  it('普通 Error 提取 message；axios 的 status code 泛化不回显', () => {
    expect(extractRehireError(new Error('网络异常'))).toBe('网络异常');
    expect(extractRehireError({ message: 'Request failed with status code 200' }))
      .toBe('返聘失败，请稍后重试或联系管理员');
  });

  it('未知形态 → 明确兜底文案（不伪装成后端结论）', () => {
    expect(extractRehireError(null)).toBe('返聘失败，请稍后重试或联系管理员');
    expect(extractRehireError(undefined)).toBe('返聘失败，请稍后重试或联系管理员');
    expect(extractRehireError({ response: { data: { code: -4 } } }))
      .toBe('返聘失败，请稍后重试或联系管理员');
    expect(extractRehireError({ response: { data: { message: '   ' } } }))
      .toBe('返聘失败，请稍后重试或联系管理员');
  });
});
