/**
 * CF-WPS-06 · employee_code 巡查归因链 单测（不连真实库）
 *
 * 覆盖（对齐任务书 §九 / §十一 十项要求）：
 *   1  valid employee_code → attributed（employee.id + 唯一 grid）
 *   2  empty employee_code → pending
 *   3  unknown employee_code（0 行）→ pending
 *   4  deleted employee → pending（WHERE is_deleted=false）
 *   5  multiple match（>1 行）→ pending（绝不任选其一）
 *   6  no grid → pending
 *   7  multiple grid → pending
 *   8  already attributed（已有 inspector_employee_id / grid_id）→ 不覆盖
 *   9  protected column：inspector_employee_id 写的是 employee.id，**绝不是** employee_code；
 *      且 Pull Engine 投影永不产出受保护列
 *   10 sync_hash unchanged：追加 employee_code / WPS 新增「员工编码」字段后哈希逐字节不变，
 *      且冻结 hash 段（18 列）不可被改动（模块级 fail-fast 断言）
 *
 * mock 策略：config/db 与 gridScope 全部 mock，零真实数据库访问、零写入。
 */

jest.mock('../../config/db', () => ({
  pool: { query: jest.fn() },
  isConnected: jest.fn(() => true),
}));

jest.mock('../gridScope', () => ({
  deriveGridIdForEmployee: jest.fn(),
  SCOPE: { ALL: 'all_grid', OWN: 'own_grid', NONE: 'none' },
}));

const gridScope = require('../gridScope');
const resolver = require('../gridEmployeeCodeResolver');
const enrich = require('../wps/gridEnrichmentService');
const engine = require('../wpsGridPullEngine');
const fm = require('../wps/wpsFieldMap');

/** 构造一个受控 db client：按 SQL 特征返回 employee / gir 行 */
function makeDb({ employeeRows = [], girRow = null, onUpdate = null } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
      const s = String(sql);
      if (/FROM public\.employee/i.test(s)) return { rows: employeeRows, rowCount: employeeRows.length };
      if (/FROM grid_inspection_records WHERE id = \$1/i.test(s)) return { rows: girRow ? [girRow] : [], rowCount: girRow ? 1 : 0 };
      if (/^UPDATE grid_inspection_records/i.test(s.trim())) {
        const n = onUpdate ? onUpdate(params) : 1;
        return { rows: [], rowCount: n };
      }
      if (/FROM grid_inspection_records/i.test(s)) return { rows: girRow ? [girRow] : [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    },
  };
}

const EMP_ID = 4242;
const CODE = 'NJ0001';

beforeEach(() => {
  jest.clearAllMocks();
  gridScope.deriveGridIdForEmployee.mockResolvedValue({ status: 'ok', gridId: 77 });
});

// ---------------------------------------------------------------- 1 valid
test('T1 valid employee_code → attributed（employee.id + 唯一 grid）', async () => {
  const db = makeDb({ employeeRows: [{ id: String(EMP_ID) }] });
  const r = await resolver.resolveByEmployeeCode(CODE, { client: db });
  expect(r.status).toBe('attributed');
  expect(r.employeeId).toBe(EMP_ID);
  expect(r.gridId).toBe(77);
  expect(gridScope.deriveGridIdForEmployee).toHaveBeenCalledWith(EMP_ID, expect.anything());
  // 查询必须带 is_deleted=false（隔离停用员工）
  expect(db.calls[0].sql).toMatch(/is_deleted = false/);
});

test('T1b trim：前后空白不影响解析', async () => {
  const db = makeDb({ employeeRows: [{ id: String(EMP_ID) }] });
  const r = await resolver.resolveByEmployeeCode('  ' + CODE + ' \n', { client: db });
  expect(r.status).toBe('attributed');
  expect(db.calls[0].params[0]).toBe(CODE);
});

// ---------------------------------------------------------------- 2 empty
test('T2 empty employee_code（null / "" / 空白）→ pending 且不查库', async () => {
  for (const v of [null, undefined, '', '   ']) {
    const db = makeDb({ employeeRows: [{ id: String(EMP_ID) }] });
    const r = await resolver.resolveByEmployeeCode(v, { client: db });
    expect(r.status).toBe('pending');
    expect(r.reason).toBe(resolver.CODE_ATTR_REASON.EMPTY_CODE);
    expect(r.employeeId).toBeNull();
    expect(db.calls.length).toBe(0);
  }
});

// ---------------------------------------------------------------- 3 unknown
test('T3 unknown employee_code（0 行）→ pending', async () => {
  const db = makeDb({ employeeRows: [] });
  const r = await resolver.resolveByEmployeeCode('NOT_EXIST', { client: db });
  expect(r.status).toBe('pending');
  expect(r.reason).toBe(resolver.CODE_ATTR_REASON.UNKNOWN_CODE);
  expect(gridScope.deriveGridIdForEmployee).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------- 4 deleted
test('T4 deleted employee（is_deleted=true ⇒ 查询 0 行）→ pending', async () => {
  // WHERE is_deleted=false 已把停用员工滤除，等价于 0 行
  const db = makeDb({ employeeRows: [] });
  const r = await resolver.resolveByEmployeeCode(CODE, { client: db });
  expect(r.status).toBe('pending');
  expect(r.reason).toBe(resolver.CODE_ATTR_REASON.UNKNOWN_CODE);
  expect(db.calls[0].sql).toMatch(/employee_code = \$1 AND is_deleted = false/);
});

// ---------------------------------------------------------------- 5 multiple employee
test('T5 multiple match（同码 >1 行）→ pending，绝不任选其一', async () => {
  const db = makeDb({ employeeRows: [{ id: '1' }, { id: '2' }] });
  const r = await resolver.resolveByEmployeeCode(CODE, { client: db });
  expect(r.status).toBe('pending');
  expect(r.reason).toBe(resolver.CODE_ATTR_REASON.MULTIPLE_EMPLOYEE);
  expect(r.employeeId).toBeNull();
  expect(gridScope.deriveGridIdForEmployee).not.toHaveBeenCalled();
});

test('T5b 非法 employee.id（非安全整数）→ pending', async () => {
  const db = makeDb({ employeeRows: [{ id: '99999999999999999999' }] });
  const r = await resolver.resolveByEmployeeCode(CODE, { client: db });
  expect(r.status).toBe('pending');
  expect(r.reason).toBe(resolver.CODE_ATTR_REASON.INVALID_EMPLOYEE_ID);
});

test('T5c 查询异常 → fail-closed pending（不抛错）', async () => {
  const db = { query: async () => { throw new Error('db down'); } };
  const r = await resolver.resolveByEmployeeCode(CODE, { client: db });
  expect(r.status).toBe('pending');
  expect(r.reason).toBe(resolver.CODE_ATTR_REASON.LOOKUP_ERROR);
});

// ---------------------------------------------------------------- 6 no grid
test('T6 no grid（0 个 live grid）→ pending', async () => {
  gridScope.deriveGridIdForEmployee.mockResolvedValue({ status: 'no_grid', gridId: null });
  const db = makeDb({ employeeRows: [{ id: String(EMP_ID) }] });
  const r = await resolver.resolveByEmployeeCode(CODE, { client: db });
  expect(r.status).toBe('pending');
  expect(r.reason).toBe(resolver.CODE_ATTR_REASON.NO_GRID);
  expect(r.gridId).toBeNull();
});

// ---------------------------------------------------------------- 7 multiple grid
test('T7 multiple grid（>1 个 live grid）→ pending，禁止猜测', async () => {
  gridScope.deriveGridIdForEmployee.mockResolvedValue({ status: 'multiple', gridId: null });
  const db = makeDb({ employeeRows: [{ id: String(EMP_ID) }] });
  const r = await resolver.resolveByEmployeeCode(CODE, { client: db });
  expect(r.status).toBe('pending');
  expect(r.reason).toBe(resolver.CODE_ATTR_REASON.MULTIPLE_GRID);
  expect(r.gridId).toBeNull();
});

// ---------------------------------------------------------------- 8 already attributed
test('T8 已有 inspector_employee_id → 不覆盖（写计划为空）', () => {
  const plan = resolver.buildEmployeeCodeWritePlan(
    { source_channel: 'mobile_h5', employee_code: CODE, inspector_employee_id: 999, grid_id: null },
    { status: 'attributed', employeeId: EMP_ID, gridId: 77 }
  );
  expect(plan.attributable).toBe(false);
  expect(plan.reason).toBe(resolver.CODE_ATTR_REASON.ALREADY_ATTRIBUTED);
  expect(plan.writes).toEqual({});
});

test('T8b 已有 grid_id → 不覆盖（写计划为空）', () => {
  const plan = resolver.buildEmployeeCodeWritePlan(
    { source_channel: 'mobile_h5', employee_code: CODE, inspector_employee_id: null, grid_id: 55 },
    { status: 'attributed', employeeId: EMP_ID, gridId: 77 }
  );
  expect(plan.attributable).toBe(false);
  expect(plan.reason).toBe(resolver.CODE_ATTR_REASON.ALREADY_GRID);
  expect(plan.writes).toEqual({});
});

test('T8c applyWritePlan 的 SQL 层再次断言两列同 NULL（双重护栏）', async () => {
  const db = makeDb({ onUpdate: () => 0 });
  const n = await resolver.applyWritePlan(db, 1, { writes: { inspector_employee_id: EMP_ID, grid_id: 77 } });
  expect(n).toBe(0);
  const upd = db.calls.find((c) => /^UPDATE grid_inspection_records/i.test(c.sql));
  expect(upd.sql).toMatch(/inspector_employee_id IS NULL/);
  expect(upd.sql).toMatch(/grid_id IS NULL/);
});

test('T8d 不允许部分写入（缺 grid_id 或 inspector_employee_id 时 rowCount=0，不执行 UPDATE）', async () => {
  const db = makeDb();
  expect(await resolver.applyWritePlan(db, 1, { writes: { inspector_employee_id: EMP_ID } })).toBe(0);
  expect(await resolver.applyWritePlan(db, 1, { writes: { grid_id: 77 } })).toBe(0);
  expect(db.calls.length).toBe(0);
});

test('T8e 非 mobile_h5 来源 → 不自动归因（禁止历史批量回填）', () => {
  const plan = resolver.buildEmployeeCodeWritePlan(
    { source_channel: null, employee_code: CODE, inspector_employee_id: null, grid_id: null },
    { status: 'attributed', employeeId: EMP_ID, gridId: 77 }
  );
  expect(plan.attributable).toBe(false);
  expect(plan.reason).toBe(resolver.CODE_ATTR_REASON.NOT_MOBILE_H5);
});

// ---------------------------------------------------------------- 9 protected column
test('T9 inspector_employee_id 写入的是 employee.id，绝不是 employee_code', () => {
  const plan = resolver.buildEmployeeCodeWritePlan(
    { source_channel: 'mobile_h5', employee_code: 'NJ0001', inspector_employee_id: null, grid_id: null },
    { status: 'attributed', employeeId: 4242, gridId: 77 }
  );
  expect(plan.attributable).toBe(true);
  expect(plan.writes.inspector_employee_id).toBe(4242);
  expect(typeof plan.writes.inspector_employee_id).toBe('number');
  expect(String(plan.writes.inspector_employee_id)).not.toBe('NJ0001');
  expect(plan.writes.grid_id).toBe(77);
});

test('T9b Pull Engine 投影与 DTO 永不产出受保护列（含 employee_code 新字段）', () => {
  const fields = { 员工编码: 'NJ0001', 姓名: '张三', 日期: '2026-09-15', 编号: 'L0001' };
  const { dto } = engine.toCanonicalDto(fields);
  expect('grid_id' in dto).toBe(false);
  expect('inspector_employee_id' in dto).toBe(false);
  expect(fm.PROTECTED_COLUMNS.join(',')).toBe('grid_id,inspector_employee_id');
  // 新增列必须是普通业务列，可被 Pull 写入
  expect(dto.employee_code).toBe('NJ0001');
});

test('T9c WPS「员工编码」映射到 PG employee_code（唯一命名，无 employeeCode 双轨）', () => {
  const def = fm.byWps('员工编码');
  expect(def).toBeTruthy();
  expect(def.pg).toBe('employee_code');
  expect(def.biz).toBe('employee_code');
  expect(fm.byPg('employee_code').pg).toBe('employee_code');
  // FIELD_MAP 中不得出现 employeeCode 之类第二套命名
  expect(fm.FIELD_MAP.some((f) => f.pg === 'employeeCode' || f.biz === 'employeeCode')).toBe(false);
});

// ---------------------------------------------------------------- 10 sync_hash unchanged
describe('T10 sync_hash 不变量', () => {
  test('T10a 冻结 hash 列数恒为 18，前 18 列与冻结字面量逐字节一致', () => {
    expect(fm.SYNC_HASH_COLUMN_COUNT).toBe(18);
    expect(fm.SYNC_HASH_COLUMNS.length).toBe(18);
    expect(fm.SYNC_PROJECTION_ORDER.slice(0, 18).join('|')).toBe(fm.FROZEN_HASH_SEGMENT.join('|'));
  });

  test('T10b employee_code 位于非 hash 段（hash 标志为 false）', () => {
    const p = fm.SYNC_PROJECTION.find((x) => x.pg === 'employee_code');
    expect(p).toBeTruthy();
    expect(p.hash).toBe(false);
    expect(fm.SYNC_HASH_COLUMNS.includes('employee_code')).toBe(false);
    expect(fm.SYNC_PROJECTION_ORDER.indexOf('employee_code')).toBeGreaterThanOrEqual(18);
  });

  test('T10c 追加 employee_code 后 canonicalHash 逐字节不变', () => {
    const fields = {
      姓名: '张三', 分组名称: '一组', 所属岗位: '经理', 网格等级: '二级网格长',
      昵称2: '吉祥', 三违行为: '未发现', 违章人姓名: '--', 违章人性别: '男', 违章人年龄: '35',
      当日是否报名: '是', 标记: '无', 是否补交: '否', 提交时间: '2026/09/15 08:00:00',
      编号: 'L0001', 日期: '2026/09/15', 三违照片链接: 'https://a/b.jpg',
      整改后照片链接: 'https://a/c.jpg', 示意图链接: 'https://a/d.jpg',
    };
    const base = engine.canonicalHash(engine.toLegacyHashDict(fields));
    // 真实 WPS 板上新增「员工编码」真实值
    const withCode = engine.canonicalHash(engine.toLegacyHashDict({ ...fields, 员工编码: 'NJ0001' }));
    expect(withCode).toBe(base);
  });

  test('T10d 同一 PG 行重算 hash 与该行 dto 中 employee_code 无关', () => {
    const row = { nickname: '吉祥', personnel_name: '张三', employee_code: 'NJ0001', inspector_employee_id: 4242 };
    const strip = { ...row };
    delete strip.employee_code;
    delete strip.inspector_employee_id;
    expect(engine.canonicalHash(row)).toBe(engine.canonicalHash(strip));
  });
});

// ---------------------------------------------------------------- 富化链接入
describe('接入既有富化链（gridEnrichmentService）', () => {
  const record = (over = {}) => ({
    id: 1, inspector_employee_id: null, grid_id: null, source_channel: 'mobile_h5',
    submission_fingerprint: null, client_token: null, employee_code: CODE,
    inspection_date: '2026-09-15', area_team: '一组', violation_behavior: '未发现', violator_name: '--',
    ...over,
  });

  test('E1 带 employee_code 的记录走新路径并归属', async () => {
    const db = makeDb({ employeeRows: [{ id: String(EMP_ID) }] });
    const r = await enrich.resolveAttribution(record(), { db });
    expect(r.status).toBe('attributed');
    expect(r.identityState).toBe('ATTRIBUTED');
    expect(r.employee_id).toBe(EMP_ID);
    expect(r.gridId).toBe(77);
    expect(r.writeGrid).toBe(true);
  });

  test('E2 无 employee_code 的历史记录行为不变（仍 PENDING_CREATOR）', async () => {
    const db = makeDb();
    const r = await enrich.resolveAttribution(record({ employee_code: null }), { db });
    expect(r.identityState).toBe('PENDING_CREATOR');
    expect(r.reason).toBe('no_creator_source');
  });

  test('E3 employee_code 存在但查无此人 → PENDING_EMPLOYEE_CODE，不回落 creator 路径', async () => {
    const db = makeDb({ employeeRows: [] });
    const r = await enrich.resolveAttribution(record(), { db, creatorWpsAccountId: 'acc-1' });
    expect(r.status).toBe('pending');
    expect(r.identityState).toBe('PENDING_EMPLOYEE_CODE');
    expect(r.employee_id).toBeNull();
  });

  test('E4 employee_code 解析到人但多网格 → PENDING_CODE_GRID', async () => {
    gridScope.deriveGridIdForEmployee.mockResolvedValue({ status: 'multiple', gridId: null });
    const db = makeDb({ employeeRows: [{ id: String(EMP_ID) }] });
    const r = await enrich.resolveAttribution(record(), { db });
    expect(r.identityState).toBe('PENDING_CODE_GRID');
    expect(r.writeGrid).toBe(false);
  });

  test('E5 共享账号 creator 的 UNTRUSTED 判定保持最高优先级', async () => {
    const db = makeDb({ employeeRows: [{ id: String(EMP_ID) }] });
    const r = await enrich.resolveAttribution(record(), { db, creatorTrust: 'shared_account' });
    expect(r.identityState).toBe('UNTRUSTED');
  });

  test('E6 已有 inspector_employee_id → 永不重算 / 永不覆盖', async () => {
    const db = makeDb({ employeeRows: [{ id: String(EMP_ID) }] });
    const r = await enrich.resolveAttribution(record({ inspector_employee_id: 999, grid_id: 5 }), { db });
    expect(r.reason).toBe('already_attributed');
    expect(r.employee_id).toBe(999);
    expect(r.writeGrid).toBe(false);
  });

  test('E7 buildWrites 仍只在两列同 NULL 时产出归属写入', () => {
    const attributed = { status: 'attributed', identityState: 'ATTRIBUTED', employee_id: EMP_ID, gridId: 77, writeGrid: true };
    const w1 = enrich.buildWrites({ attribution: attributed, attachment: {}, fingerprint: null, sourceChannel: null }, record());
    expect(w1.inspector_employee_id).toBe(EMP_ID);
    expect(w1.grid_id).toBe(77);
    const w2 = enrich.buildWrites({ attribution: attributed, attachment: {}, fingerprint: null, sourceChannel: null }, record({ grid_id: 5 }));
    expect(w2.inspector_employee_id).toBeUndefined();
    expect('grid_id' in w2).toBe(false);
  });

  test('E8 enrichAfterInsert 端到端（stub db）写出正确 writes', async () => {
    const db = makeDb({ employeeRows: [{ id: String(EMP_ID) }], girRow: null });
    const r = await enrich.enrichAfterInsert(record({ client_token: 'CF06-TOK-1' }), { db });
    expect(r.attribution.identityState).toBe('ATTRIBUTED');
    expect(r.writes.inspector_employee_id).toBe(EMP_ID);
    expect(r.writes.grid_id).toBe(77);
    expect(r.sourceChannel).toBe('mobile_h5');
  });

  test('E9 employee.id 不存在（bridge 指向已删员工）→ PENDING_EMPLOYEE，不归因', async () => {
    gridScope.deriveGridIdForEmployee.mockResolvedValue({ status: 'no_grid', gridId: null });
    const db = {
      async query(sql) {
        const s = String(sql);
        if (/FROM wps_account_employee_map/i.test(s)) return { rows: [{ employee_id: 88888, status: 'active' }], rowCount: 1 };
        if (/FROM public\.employee WHERE id=/i.test(s)) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 0 };
      },
    };
    const r = await enrich.resolveAttribution(record({ employee_code: null }), { db, creatorWpsAccountId: 'acc-1' });
    expect(r.identityState).toBe('PENDING_EMPLOYEE');
    expect(r.writeGrid).toBe(false);
  });
});
