/**
 * A-02d 状态编码统一 · 单元测试（纯单测，不连接数据库）
 *
 * 覆盖：
 *   1. 中文 → 存储编码 归一（含 待岗/借调/停薪留职/辞职/死亡/退休）
 *   2. 英文直写幂等 + retired 历史值归一
 *   3. 反向展示映射（inactive ≠ 辞职；retired/former 历史兼容）
 *   4. 未知状态显式失败（禁止静默落库）
 *   5. 终态 / 中间态判定
 *   6. changeAssignmentStatus 终态行为（is_current / end_date / history / 事件）
 *   7. 统一 SQL CASE 构造
 */

jest.mock('../config/db', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  isConnected: jest.fn(() => true),
}));

jest.mock('../services/employeeEventService', () => ({
  publishEmployeeEvent: jest.fn(),
}));

const { pool } = require('../config/db');
const employeeEventService = require('../services/employeeEventService');
const dict = require('../services/employeeStatusDict');
const assignmentService = require('../services/employeeAssignmentService');

// ------------------------------------------------------------
// 1. 写入归一
// ------------------------------------------------------------
describe('A-02d · 状态写入归一（中文 → 编码）', () => {
  const cases = [
    ['在职', 'active'],
    ['待岗', 'pending'],
    ['借调', 'secondment'],
    ['停薪留职', 'unpaid_leave'],
    ['离职', 'inactive'],
    ['辞职', 'inactive'],
    ['死亡', 'inactive'],
    ['退休', 'inactive'],
    ['返聘', 'reinstated'],
  ];

  test.each(cases)('%s → %s', (input, expected) => {
    expect(dict.normalizeStatus(input)).toBe(expected);
  });

  it('英文编码直写保持幂等', () => {
    ['active', 'pending', 'secondment', 'unpaid_leave', 'inactive', 'reinstated'].forEach((code) => {
      expect(dict.normalizeStatus(code)).toBe(code);
    });
  });

  it('retired 直写归一到 inactive（新业务不再写入 retired）', () => {
    expect(dict.normalizeStatus('retired')).toBe('inactive');
  });

  it('former 不可写入（历史兼容只读值）', () => {
    expect(dict.normalizeStatus('former')).toBeNull();
    expect(dict.isWritableStatus('former')).toBe(false);
    expect(dict.LEGACY_READ_ONLY_CODES).toContain('former');
  });

  it('空值/未知值返回 null（调用方必须显式处理）', () => {
    expect(dict.normalizeStatus(null)).toBeNull();
    expect(dict.normalizeStatus('')).toBeNull();
    expect(dict.normalizeStatus('已离职')).toBeNull();
  });

  it('normalizeStatusOrDefault：空值回落 active，未知值仍返回 null', () => {
    expect(dict.normalizeStatusOrDefault(null)).toBe('active');
    expect(dict.normalizeStatusOrDefault('')).toBe('active');
    expect(dict.normalizeStatusOrDefault('借调')).toBe('secondment');
    expect(dict.normalizeStatusOrDefault('乱码状态')).toBeNull();
  });
});

// ------------------------------------------------------------
// 2. 反向展示映射
// ------------------------------------------------------------
describe('A-02d · 反向展示映射', () => {
  it('新编码展示为中文', () => {
    expect(dict.toStatusLabel('active')).toBe('在职');
    expect(dict.toStatusLabel('pending')).toBe('待岗');
    expect(dict.toStatusLabel('secondment')).toBe('借调');
    expect(dict.toStatusLabel('unpaid_leave')).toBe('停薪留职');
    expect(dict.toStatusLabel('reinstated')).toBe('返聘');
  });

  it('inactive 显示为通用「离职」，不得一律显示成「辞职」', () => {
    expect(dict.toStatusLabel('inactive')).toBe('离职');
    expect(dict.toStatusLabel('inactive')).not.toBe('辞职');
  });

  it('retired / former 历史值保留可读展示', () => {
    expect(dict.toStatusLabel('retired')).toBe('退休');
    // former 语义未冻结（证据：B02-DEC-03.3 F-2 为月度切段产物）⇒ 中性展示，不推断为离职/辞职
    expect(dict.toStatusLabel('former')).toBe('历史段');
    expect(dict.toStatusLabel('former')).not.toBe('离职');
  });

  it('未知编码原样返回，不静默丢弃', () => {
    expect(dict.toStatusLabel('unknown_code')).toBe('unknown_code');
  });
});

// ------------------------------------------------------------
// 3. 终态 / 中间态
// ------------------------------------------------------------
describe('A-02d · 终态与中间态判定', () => {
  it('inactive / retired 为终态', () => {
    expect(dict.isTerminalStatus('inactive')).toBe(true);
    expect(dict.isTerminalStatus('retired')).toBe(true);
  });

  it('待岗 / 借调 / 停薪留职 为中间态，不得自动关闭任职段', () => {
    ['pending', 'secondment', 'unpaid_leave'].forEach((code) => {
      expect(dict.isIntermediateStatus(code)).toBe(true);
      expect(dict.isTerminalStatus(code)).toBe(false);
    });
  });

  it('active / reinstated 既非终态也非中间态', () => {
    ['active', 'reinstated'].forEach((code) => {
      expect(dict.isTerminalStatus(code)).toBe(false);
      expect(dict.isIntermediateStatus(code)).toBe(false);
    });
  });
});

// ------------------------------------------------------------
// 4. 统一 SQL CASE
// ------------------------------------------------------------
describe('A-02d · 统一状态展示 SQL', () => {
  it('CASE 覆盖全部编码（含新增 secondment / unpaid_leave / former）', () => {
    const sql = dict.statusLabelSql('ea.status');
    ['active', 'pending', 'secondment', 'unpaid_leave', 'inactive', 'retired', 'reinstated', 'former'].forEach((code) => {
      expect(sql).toContain(`WHEN ea.status = '${code}'`);
    });
    expect(sql).toContain('THEN \'借调\'');
    expect(sql).toContain('THEN \'停薪留职\'');
    expect(sql).toContain('ELSE ea.status');
  });

  it('拒绝非法列引用（防注入）', () => {
    expect(() => dict.statusLabelSql("ea.status; DROP TABLE x")).toThrow(/非法列引用/);
  });
});

// ------------------------------------------------------------
// 5. 业务入口行为（mock 数据库）
// ------------------------------------------------------------
function makeClient(orgRow) {
  const calls = [];
  const client = {
    calls,
    query: jest.fn(async (sql, params) => {
      calls.push([sql, params]);
      if (sql.includes('FROM employee_assignment ea')) {
        return { rows: orgRow ? [orgRow] : [] };
      }
      return { rows: [], rowCount: 1 };
    }),
    release: jest.fn(),
  };
  pool.connect.mockResolvedValue(client);
  return client;
}

const ORG_ROW = {
  id: 11, employee_id: 7, status: 'active', position_id: 3, org_unit_id: 4, org_path: '/A/B',
};

function findCall(client, keyword) {
  return client.calls.find(([sql]) => sql.includes(keyword));
}

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockReset();
  pool.connect.mockReset();
});

describe('A-02d · changeAssignmentStatus 终态行为', () => {
  it('借调 → secondment：不关闭任职段（无 is_current=false / end_date）', async () => {
    const client = makeClient(ORG_ROW);
    const res = await assignmentService.changeAssignmentStatus({
      id: 11, status: '借调', event_date: '2026-10-01', remark: '借调至县局',
    });
    expect(res.error).toBeUndefined();
    const upd = findCall(client, 'UPDATE employee_assignment');
    expect(upd[1][1]).toBe('secondment');
    expect(upd[0]).not.toContain('is_current = false');
    expect(upd[0]).not.toContain('end_date');
    expect(res.audit.statusCode).toBe('secondment');
  });

  it('停薪留职 → unpaid_leave：不关闭任职段', async () => {
    const client = makeClient(ORG_ROW);
    await assignmentService.changeAssignmentStatus({
      id: 11, status: '停薪留职', event_date: '2026-10-01',
    });
    const upd = findCall(client, 'UPDATE employee_assignment');
    expect(upd[1][1]).toBe('unpaid_leave');
    expect(upd[0]).not.toContain('is_current = false');
  });

  it('辞职 → inactive：关闭任职段 + 历史事件保留原因', async () => {
    const client = makeClient(ORG_ROW);
    const res = await assignmentService.changeAssignmentStatus({
      id: 11, status: '辞职', event_date: '2026-10-15',
    });
    expect(res.error).toBeUndefined();
    const upd = findCall(client, 'UPDATE employee_assignment');
    expect(upd[1][1]).toBe('inactive');
    expect(upd[0]).toContain('is_current = false');
    expect(upd[1][2]).toBe('2026-10-15');

    const hist = findCall(client, 'INSERT INTO employee_history');
    // D2（B02-DEC-03.15）：event_type 与 after_status 都必须保留终态原因，不得统一成「离职」
    expect(hist[1][1]).toBe('辞职');
    expect(hist[1][6]).toBe('辞职');
    expect(employeeEventService.publishEmployeeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'EMPLOYEE_RESIGNED' })
    );
  });

  it('死亡 → inactive：关闭任职段', async () => {
    const client = makeClient(ORG_ROW);
    await assignmentService.changeAssignmentStatus({
      id: 11, status: '死亡', event_date: '2026-10-15',
    });
    const upd = findCall(client, 'UPDATE employee_assignment');
    expect(upd[1][1]).toBe('inactive');
    expect(upd[0]).toContain('is_current = false');
  });

  it('退休 → inactive（不再写 retired），事件仍保留「退休」标签', async () => {
    const client = makeClient(ORG_ROW);
    await assignmentService.changeAssignmentStatus({
      id: 11, status: '退休', event_date: '2026-10-20',
    });
    const upd = findCall(client, 'UPDATE employee_assignment');
    expect(upd[1][1]).toBe('inactive');
    expect(upd[0]).toContain('is_current = false');
    const hist = findCall(client, 'INSERT INTO employee_history');
    expect(hist[1][1]).toBe('退休');
    // D2（B02-DEC-03.15）：after_status 保留原因「退休」，不再统一写「离职」
    expect(hist[1][6]).toBe('退休');
  });

  it('历史 retired 行可正常读取为「退休」（兼容消费者）', async () => {
    const client = makeClient({ ...ORG_ROW, status: 'retired' });
    const res = await assignmentService.changeAssignmentStatus({
      id: 11, status: '在职', event_date: '2026-10-21',
    });
    expect(res.audit.beforeStatus).toBe('退休');
    const hist = findCall(client, 'INSERT INTO employee_history');
    expect(hist[1][5]).toBe('退休'); // before_status
  });

  it('former 不可通过状态变更接口写入', async () => {
    makeClient(ORG_ROW);
    const res = await assignmentService.changeAssignmentStatus({
      id: 11, status: 'former', event_date: '2026-10-01',
    });
    expect(res.error).toBe(-3);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('未知状态返回明确错误，不静默落库', async () => {
    makeClient(ORG_ROW);
    const res = await assignmentService.changeAssignmentStatus({
      id: 11, status: '已离职', event_date: '2026-10-01',
    });
    expect(res.error).toBe(-3);
    expect(res.message).toContain('无效状态');
  });

  it('待岗 → 复岗：事件类型为「复岗」，状态回 active', async () => {
    const client = makeClient({ ...ORG_ROW, status: 'pending' });
    await assignmentService.changeAssignmentStatus({
      id: 11, status: '在职', event_date: '2026-11-01',
    });
    const hist = findCall(client, 'INSERT INTO employee_history');
    expect(hist[1][1]).toBe('复岗');
    const upd = findCall(client, 'UPDATE employee_assignment');
    expect(upd[1][1]).toBe('active');
    expect(upd[0]).not.toContain('is_current = false');
  });
});

describe('A-02d · 统计与详情 SQL 使用统一映射', () => {
  it('getEmployeeCountByStatus 使用统一 CASE（含新增编码）', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    await assignmentService.getEmployeeCountByStatus();
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain("WHEN status = 'secondment'");
    expect(sql).toContain("WHEN status = 'unpaid_leave'");
    expect(sql).toContain("WHEN status = 'former'");
  });

  it('getCurrentAssignmentDetail 使用统一 CASE（与字典构造结果完全一致）', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    await assignmentService.getCurrentAssignmentDetail(7);
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain(dict.statusLabelSql('ea.status'));
  });
});
