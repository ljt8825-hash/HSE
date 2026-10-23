/**
 * 领导视角统一看板（leaderDashboardService）单元测试
 * 覆盖：乡镇归因纯函数、centers / townsByCenter / rolesByTown / employeeDetail
 *      以及 P2 扩展：townTrend（逐月趋势）/ townManagers / managerOverview（双口径）/ managerMonthDetail。
 * 全部 mock 数据库（config/db.pool.query 按 SQL 表名分流），零真实连接、零文件读写。
 * 命名遵循 *.unit.test.js 白名单（jest.config.js testMatch）。
 */
jest.mock('../config/db', () => {
  const mockQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  return {
    pool: { query: mockQuery, connect: jest.fn() },
    isConnected: jest.fn(() => true),
    testConnection: jest.fn(),
  };
});

const { pool } = require('../config/db');
const svc = require('../services/leaderDashboardService');

// ===== 测试数据 =====
const ORG = {
  rows: [
    { id: 1, parent_id: null, org_name: '环卫作业中心', org_type: 'center', org_code: 'HW', level: 1, sort_order: 1 },
    { id: 2, parent_id: null, org_name: '市政园林作业中心', org_type: 'center', org_code: 'SZ', level: 1, sort_order: 2 },
    { id: 11, parent_id: 1, org_name: '长官镇作业中心', org_type: 'town_center', org_code: 'CG', level: 2, sort_order: 1 },
    { id: 12, parent_id: 1, org_name: '大曹镇作业中心', org_type: 'town_center', org_code: 'DC', level: 2, sort_order: 2 },
    { id: 21, parent_id: 1, org_name: '柴胡店镇作业中心', org_type: 'town_center', org_code: 'CH', level: 2, sort_order: 3 },
    { id: 31, parent_id: 2, org_name: '康宁湖公园', org_type: 'park', org_code: 'KN', level: 3, sort_order: 1 },
  ],
};

const EMP = {
  rows: [
    { employee_id: 1001, employee_code: 'E1001', name: '张三', position_name: '乡镇作业中心经理', org_unit_id: 11, org_name: '长官镇作业中心', org_type: 'town_center', supervisor_name: '黄殿兴' },
    { employee_id: 1002, employee_code: 'E1002', name: '李四', position_name: '管理员', org_unit_id: 11, org_name: '长官镇作业中心', org_type: 'town_center', supervisor_name: '张三' },
    { employee_id: 1003, employee_code: 'E1003', name: '王五', position_name: '驾驶员', org_unit_id: 12, org_name: '大曹镇作业中心', org_type: 'town_center', supervisor_name: '赵六' },
    { employee_id: 1004, employee_code: 'E1004', name: '钱七', position_name: '总经理', org_unit_id: 1, org_name: '环卫作业中心', org_type: 'center', supervisor_name: null },
    { employee_id: 2001, employee_code: 'E2001', name: '孙小霞', position_name: '管理员', org_unit_id: 31, org_name: '康宁湖公园', org_type: 'park', supervisor_name: null },
  ],
};

/** 行数据归一：兼容 {rows:[...]} 与裸数组两种写法 */
function rowsOf(v) {
  if (v && Array.isArray(v.rows)) return v.rows;
  if (Array.isArray(v)) return v;
  return [];
}

/** 按 SQL 表名分流 mock pool.query */
// 顺序约束：专属业务表必须在 v_employee_org_full 之前匹配——考核/培训/车辆/驾驶员检查查询现带
// LEFT JOIN v_employee_org_full（2026-09-28 下钻展示字段扩展），若视图表名先匹配会错误返回员工行。
function mockTables(tables) {
  pool.query.mockImplementation(sql => {
    if (!sql || typeof sql !== 'string') return Promise.resolve({ rows: [] });
    const defs = [
      ['hse_org_unit', rowsOf(tables.org)],
      ['FROM accidents', rowsOf(tables.accidents)],
      ['FROM violation_records', rowsOf(tables.violation)],
      ['FROM grid_inspection_records', rowsOf(tables.inspection)],
      ['hse_assessment_target', rowsOf(tables.assessment)],
      ['FROM training_records', rowsOf(tables.training)],
      ['FROM emergency_drills', rowsOf(tables.emergency)],
      ['FROM license_demerit_records', rowsOf(tables.demerit)],
      ['FROM vehicle_inspection_records', rowsOf(tables.vehicle)],
      ['FROM hse_driver_inspection_records', rowsOf(tables.dchk)],
      ['FROM driver_violation', rowsOf(tables.dviol)],
      ['FROM driver_three_violation', rowsOf(tables.dtviol)],
      ['FROM risk_sources', rowsOf(tables.risk)],
      ['FROM hazards', rowsOf(tables.hazard)],
      ['FROM transfer_station_check', rowsOf(tables.transfer)],
      ['FROM personnel_insurance', rowsOf(tables.insurance)],
      ['FROM over_age_personnel', rowsOf(tables.overage)],
      ['v_employee_org_full', rowsOf(tables.emp)],
    ];
    for (const [needle, rows] of defs) {
      if (sql.includes(needle)) return Promise.resolve({ rows: rows || [] });
    }
    return Promise.resolve({ rows: [] });
  });
}

const EMPTY = {};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('乡镇归因纯函数', () => {
  test('townshipShortName 去掉「作业中心」后缀', () => {
    expect(svc.townshipShortName('长官镇作业中心')).toBe('长官镇');
    expect(svc.townshipShortName('环卫作业中心')).toBe('环卫');
    expect(svc.townshipShortName(null)).toBe('');
    expect(svc.townshipShortName('')).toBe('');
  });

  test('cleanText 去除首尾空白', () => {
    expect(svc.cleanText('  长官镇  ')).toBe('长官镇');
    expect(svc.cleanText(null)).toBe('');
    expect(svc.cleanText(undefined)).toBe('');
  });

  test('cleanPersonName 去括号备注后 trim（对齐三违统计口径）', () => {
    expect(svc.cleanPersonName('  张三  ')).toBe('张三');
    expect(svc.cleanPersonName('张三（头盔忘记带）')).toBe('张三');
    expect(svc.cleanPersonName('李四(队长)')).toBe('李四');
    expect(svc.cleanPersonName('王五（甲）乙（丙）')).toBe('王五乙');
    expect(svc.cleanPersonName(null)).toBe('');
    expect(svc.cleanPersonName('--')).toBe('--');
  });

  test('matchTownship 最长前缀匹配乡镇短名/全名', () => {
    const towns = [
      { id: 11, orgName: '长官镇作业中心', short: '长官镇' },
      { id: 12, orgName: '大曹镇作业中心', short: '大曹镇' },
    ];
    expect(svc.matchTownship('长官镇三班三违', towns)).toEqual({ orgId: 11, orgName: '长官镇作业中心', matchLen: 3 });
    expect(svc.matchTownship('长官镇作业中心一班', towns).orgId).toBe(11);
    expect(svc.matchTownship('德州城区', towns)).toBeNull();
    expect(svc.matchTownship('', towns)).toBeNull();
    expect(svc.matchTownship(null, towns)).toBeNull();
  });

  test('getYearRange 解析年度，非法回退当前年', () => {
    expect(svc.getYearRange('2026')).toEqual({ year: 2026, start: '2026-01-01', end: '2026-12-31' });
    expect(svc.getYearRange('2099')).toEqual({ year: 2099, start: '2099-01-01', end: '2099-12-31' });
    const fallback = svc.getYearRange('abc');
    expect(fallback.year).toBe(new Date().getFullYear());
  });

  test('identifyRole 岗位分组', () => {
    expect(svc.identifyRole('乡镇作业中心经理')).toBe('manager');
    expect(svc.identifyRole('管理员')).toBe('admin');
    expect(svc.identifyRole('驾驶员')).toBe('driver');
    expect(svc.identifyRole('司机')).toBe('driver');
    expect(svc.identifyRole('保洁员')).toBe('other');
    expect(svc.identifyRole('')).toBe('other');
  });

  test('fmtDate 输出纯 YYYY-MM-DD（防 date 列时区回退）', () => {
    expect(svc.fmtDate('2026-03-01')).toBe('2026-03-01');
    expect(svc.fmtDate('2026-03-01T16:00:00.000Z')).toBe('2026-03-01');
    expect(svc.fmtDate(new Date(2026, 2, 1, 12, 0, 0))).toBe('2026-03-01');
    expect(svc.fmtDate(null)).toBeNull();
    expect(svc.fmtDate(undefined)).toBeNull();
  });

  test('attributeRecord：人员反推优先于文本匹配', () => {
    const employees = new Map([
      [1001, { orgId: 11, orgType: 'town_center', orgName: '长官镇作业中心' }],
      [1004, { orgId: 1, orgType: 'center', orgName: '环卫作业中心' }],
    ]);
    const townIndex = [
      { id: 11, orgName: '长官镇作业中心', short: '长官镇' },
      { id: 12, orgName: '大曹镇作业中心', short: '大曹镇' },
    ];
    expect(svc.attributeRecord({ employeeId: 1001, text: null }, townIndex, employees)).toEqual({ orgId: 11 });
    expect(svc.attributeRecord({ employeeId: 1004, text: null }, townIndex, employees)).toEqual({ direct: true, orgType: 'center', orgName: '环卫作业中心' });
    expect(svc.attributeRecord({ employeeId: 9999, text: '大曹镇一班' }, townIndex, employees)).toEqual({ orgId: 12 });
    expect(svc.attributeRecord({ employeeId: 9999, text: '德州城区' }, townIndex, employees)).toBeNull();
    expect(svc.attributeRecord({ employeeId: null, text: null }, townIndex, employees)).toBeNull();
  });
});

describe('GET /centers', () => {
  test('返回作业中心树与乡镇/公园清单', async () => {
    mockTables({ org: ORG, emp: EMP });
    const r = await svc.centers();
    expect(r.__t).toBe('json');
    expect(r.body.code).toBe(0);
    expect(r.body.data.townTotal).toBe(4);
    const centers = r.body.data.centers;
    expect(centers).toHaveLength(2);
    expect(centers[0].orgName).toBe('环卫作业中心');
    expect(centers[0].townCount).toBe(3);
    expect(centers[0].towns.map(t => t.id)).toEqual([11, 12, 21]);
    expect(centers[1].orgName).toBe('市政园林作业中心');
    expect(centers[1].townCount).toBe(1);
    expect(centers[1].towns[0].shortName).toBe('康宁湖公园');
  });
});

describe('GET /centers/:id/towns', () => {
  test('按乡镇聚合年度 10 维数据（人员反推 + 文本归因；保险/超龄已下线）', async () => {
    mockTables({
      org: ORG,
      emp: EMP,
      accidents: [
        { id: 1, township: '长官镇三班', level: '一般', accident_date: '2026-03-01', personnel_id: 1001 },
        { id: 2, township: '环卫中心直管', level: '重大', accident_date: '2026-03-02', personnel_id: 1004 },
      ],
      violation: [
        { id: 1, area_team: '长官镇一班', violation_level: '严重', violator_id: 1001, violator_name: '张三', violation_date: '2026-02-01' },
        { id: 2, area_team: '大曹镇三班', violation_level: '一般', violator_id: null, violator_name: '王五', violation_date: '2026-02-02' },
      ],
      inspection: [
        { id: 1, area_team: '长官镇', inspection_date: '2026-04-01', personnel_name: '张三', inspector_employee_id: 1001 },
      ],
      assessment: [
        { id: 1, employee_id: 1001, township: '长官镇', score_total: 88, grade: '优秀', assessment_year: 2026, assessment_month: 3 },
      ],
      training: [
        { id: 1, employee_id: 1002, personnel_id: 1002, training_date: '2026-05-01', training_type: '安全培训', result: 'pass' },
      ],
      emergency: [
        { id: 1, township: '', drill_date: '2026-06-01', name: '长官镇三班消防演练', drill_level: '镇级', result: 'pass' },
      ],
      demerit: [
        { id: 1, employee_id: 1001, employee_name: '张三', demerit_date: '2026-03-10' },
      ],
      vehicle: [
        { id: 1, employee_id: 1003, inspection_date: '2026-07-01' },
      ],
      dchk: [
        { id: 1, employee_id: 1002, inspection_date: '2026-08-01' },
      ],
      dviol: [
        { id: 1, name: '王五', violation_time: '2026-09-01' },
      ],
      dtviol: [
        { id: 1, name: '张三', violation_time: '2026-09-02' },
      ],
      risk: [
        { id: 1, area: '长官镇', responsible_person_id: 1001, responsible_person: '张三' },
      ],
      hazard: [
        { id: 1, description: '长官镇转运站护栏破损', finder_id: null, responsible_id: null, hazard_date: '2026-10-01' },
      ],
      transfer: [
        { id: 1, area_team: '大曹镇', patrol_person: '王五', check_date: '2026-11-15' },
      ],
    });

    const req = { params: { id: '1' }, query: { year: '2026' } };
    const r = await svc.townsByCenter(req);
    expect(r.body.code).toBe(0);
    expect(r.body.data.year).toBe(2026);
    expect(r.body.data.center.orgName).toBe('环卫作业中心');

    const towns = r.body.data.towns;
    expect(towns).toHaveLength(3);
    const changGuan = towns.find(t => t.id === 11);
    const daCao = towns.find(t => t.id === 12);
    const chaiHu = towns.find(t => t.id === 21);

    // 长官镇：事故(人员反推 1001) / 三违(人员反推) / 巡查 / 考核 / 培训 / 应急 / 记分 / 驾驶员检查 / 司机违章(姓名兜底) / 风险 / 隐患
    expect(changGuan.summary.accidents).toEqual({ count: 1, major: 0, weightedIndex: 3 });
    expect(changGuan.summary.violations).toEqual({ count: 1, serious: 1 });
    expect(changGuan.summary.inspections.count).toBe(1);
    expect(changGuan.summary.assessments).toEqual({ targetCount: 1, avgScore: 88, gradeGood: 1 });
    expect(changGuan.summary.trainings).toEqual({ recordCount: 1, personCount: 1 });
    expect(changGuan.summary.emergencies).toEqual({ count: 1, passed: 1 });
    expect(changGuan.summary.drivers).toEqual({ personCount: 0, demeritCount: 1, vehicleCheckCount: 0, driverCheckCount: 1, violationCount: 1 });
    expect(changGuan.summary.risks).toEqual({ count: 1 });
    expect(changGuan.summary.hazards).toEqual({ count: 1 });
    expect(changGuan.summary.transferStations).toEqual({ checkCount: 0 });

    // 大曹镇：三违文本归因 / 驾驶人员数(王五) / 车辆检查(1003) / 司机违章(姓名兜底) / 转运站(短名)
    expect(daCao.summary.violations).toEqual({ count: 1, serious: 0 });
    expect(daCao.summary.drivers).toEqual({ personCount: 1, demeritCount: 0, vehicleCheckCount: 1, driverCheckCount: 0, violationCount: 1 });
    expect(daCao.summary.transferStations).toEqual({ checkCount: 1 });
    expect(daCao.summary.accidents.count).toBe(0);
    expect(daCao.summary.trainings.recordCount).toBe(0);

    // 柴胡店：无任何归因数据，全部 0
    expect(chaiHu.summary.accidents.count).toBe(0);
    expect(chaiHu.summary.risks.count).toBe(0);
  });

  test('作业中心不存在返回业务码 1', async () => {
    mockTables({ org: ORG, emp: EMP });
    const r = await svc.townsByCenter({ params: { id: '999' }, query: { year: '2026' } });
    expect(r.body.code).toBe(1);
    expect(r.body.message).toContain('作业中心不存在');
  });
});

describe('GET /towns/:id/roles', () => {
  test('按角色分组返回乡镇人员统计', async () => {
    mockTables({
      org: ORG,
      emp: EMP,
      violation: [
        { id: 1, violator_id: 1001, violation_date: '2026-02-01', violation_type: '三违', violation_level: '严重' },
      ],
      accidents: [
        { id: 1, personnel_id: 1002, handler_id: null, reporter_id: null, accident_date: '2026-03-01', level: '一般', title: '道路作业事故' },
      ],
      inspection: [
        { id: 1, inspector_employee_id: 1001, personnel_name: '张三', inspection_date: '2026-04-01', area_team: '长官镇', grid_level: '三级' },
      ],
      training: [
        { id: 1, employee_id: 1002, training_date: '2026-05-01', training_type: '安全培训', result: 'pass' },
      ],
      assessment: [
        { id: 1, employee_id: 1001, score_total: 88, grade: '优秀', assessment_month: '2026-01' },
        { id: 2, employee_id: 1002, score_total: 90, grade: '良好', assessment_month: '2026-01' },
      ],
    });

    const r = await svc.rolesByTown({ params: { id: '11' }, query: { year: '2026' } });
    expect(r.body.code).toBe(0);
    expect(r.body.data.town.orgName).toBe('长官镇作业中心');
    expect(r.body.data.employeeCount).toBe(2);

    const manager = r.body.data.roles.find(x => x.role === 'manager');
    const admin = r.body.data.roles.find(x => x.role === 'admin');
    const driver = r.body.data.roles.find(x => x.role === 'driver');

    expect(manager.count).toBe(1);
    expect(manager.employees[0].name).toBe('张三');
    expect(manager.employees[0].summary).toEqual({
      violations: 1, accidents: 0, inspections: 1, trainings: 0,
      assessmentCount: 1, assessmentAvgScore: 88,
    });

    expect(admin.count).toBe(1);
    expect(admin.employees[0].name).toBe('李四');
    expect(admin.employees[0].summary).toEqual({
      violations: 0, accidents: 1, inspections: 0, trainings: 1,
      assessmentCount: 1, assessmentAvgScore: 90,
    });

    expect(driver.count).toBe(0);
    // 其他乡镇人员不计入（1003 属大曹镇）
    expect(r.body.data.roles.find(x => x.role === 'other').count).toBe(0);
  });

  test('角色层姓名兜底：无 ID 记录按清洗后姓名归属', async () => {
    mockTables({
      org: ORG,
      emp: EMP,
      violation: [
        { id: 1, violator_id: null, violation_date: '2026-02-01', violation_type: '三违', violation_level: '严重', violator_name: '张三（未戴安全帽）' },
        { id: 2, violator_id: null, violation_date: '2026-02-02', violation_type: '三违', violation_level: '一般', violator_name: '李四' },
        { id: 3, violator_id: 1001, violation_date: '2026-02-03', violation_type: '三违', violation_level: '一般', violator_name: '张三' },
      ],
      inspection: [
        { id: 1, inspector_employee_id: null, personnel_name: '张三', inspection_date: '2026-04-01', area_team: '长官镇', grid_level: '三级' },
        { id: 2, inspector_employee_id: 1002, personnel_name: '李四', inspection_date: '2026-04-02', area_team: '长官镇', grid_level: '三级' },
      ],
    });

    const r = await svc.rolesByTown({ params: { id: '11' }, query: { year: '2026' } });
    const manager = r.body.data.roles.find(x => x.role === 'manager').employees[0];
    const admin = r.body.data.roles.find(x => x.role === 'admin').employees[0];
    // 张三：ID 命中 1 条 + 姓名去括号兜底 1 条；巡查：姓名兜底 1 条
    expect(manager.summary.violations).toBe(2);
    expect(manager.summary.inspections).toBe(1);
    // 李四：姓名兜底 1 条；巡查：ID 命中 1 条
    expect(admin.summary.violations).toBe(1);
    expect(admin.summary.inspections).toBe(1);
  });

  test('角色层重名员工不参与姓名兜底，避免错配', async () => {
    mockTables({
      org: ORG,
      emp: [
        ...EMP.rows,
        { employee_id: 1005, employee_code: 'E1005', name: '张三', position_name: '保洁员', org_unit_id: 11, org_name: '长官镇作业中心', org_type: 'town_center', supervisor_name: '张三' },
      ],
      violation: [
        { id: 1, violator_id: null, violation_date: '2026-02-01', violation_type: '三违', violation_level: '严重', violator_name: '张三（未戴安全帽）' },
        { id: 2, violator_id: null, violation_date: '2026-02-02', violation_type: '三违', violation_level: '一般', violator_name: '李四' },
      ],
    });

    const r = await svc.rolesByTown({ params: { id: '11' }, query: { year: '2026' } });
    const manager = r.body.data.roles.find(x => x.role === 'manager').employees[0];
    const admin = r.body.data.roles.find(x => x.role === 'admin').employees[0];
    // 张三重名 → 姓名兜底跳过，仅计李四
    expect(manager.summary.violations).toBe(0);
    expect(admin.summary.violations).toBe(1);
  });

  test('乡镇不存在返回业务码 1', async () => {
    mockTables({ org: ORG, emp: EMP });
    const r = await svc.rolesByTown({ params: { id: '999' }, query: { year: '2026' } });
    expect(r.body.code).toBe(1);
    expect(r.body.message).toContain('乡镇作业中心不存在');
  });
});

describe('GET /employees/:id', () => {
  test('返回员工个人各模块明细', async () => {
    mockTables({
      org: ORG,
      emp: EMP,
      assessment: [
        { id: 1, score_total: 88, grade: '优秀', rank_township: '第一名', assessment_year: 2026, assessment_month: 1, cycle_name: '2026年1月考核' },
        { id: 2, score_total: 92, grade: '优秀', rank_township: '第二名', assessment_year: 2026, assessment_month: 2, cycle_name: '2026年2月考核' },
      ],
      accidents: [
        { id: 1, no: 'SG-2026-001', description: '道路作业事故', level: '一般', accident_date: '2026-03-01', township: '长官镇' },
      ],
      violation: [
        { id: 1, violation_date: '2026-02-01', violation_type: '三违', violation_level: '严重', violator_name: '张三' },
      ],
      inspection: [
        { id: 1, inspection_date: '2026-04-01', area_team: '长官镇', grid_level: '三级' },
      ],
      training: [
        { id: 1, training_date: '2026-05-01', training_type: '安全培训', result: 'pass', trainer: '安全科' },
      ],
      insurance: [
        { id: 1, person_name: '张三', insurance_type: '意外险', start_date: '2026-01-01', expire_date: '2027-01-01', premium: 500, is_current: true },
      ],
    });

    const r = await svc.employeeDetail({ params: { id: '1001' }, query: { year: '2026' } });
    expect(r.body.code).toBe(0);
    const d = r.body.data;
    expect(d.employee.name).toBe('张三');
    expect(d.employee.positionName).toBe('乡镇作业中心经理');
    expect(d.employee.orgName).toBe('长官镇作业中心');
    expect(d.employee.supervisorName).toBe('黄殿兴');

    expect(d.assessment).toHaveLength(2);
    expect(d.assessment[0]).toMatchObject({ month: '2026-01', scoreTotal: 88, grade: '优秀', rankTownship: '第一名', cycleName: '2026年1月考核' });

    expect(d.accidents).toHaveLength(1);
    expect(d.accidents[0]).toMatchObject({ accidentNo: 'SG-2026-001', level: '一般', township: '长官镇' });

    expect(d.violations).toHaveLength(1);
    expect(d.violations[0]).toMatchObject({ violationType: '三违', violationLevel: '严重', violatorName: '张三' });

    expect(d.inspections).toHaveLength(1);
    expect(d.inspections[0]).toMatchObject({ areaTeam: '长官镇', gridLevel: '三级' });

    expect(d.trainings).toHaveLength(1);
    expect(d.trainings[0]).toMatchObject({ trainingType: '安全培训', trainer: '安全科' });

    expect(d.insurance).toHaveLength(1);
    expect(d.insurance[0]).toMatchObject({ personName: '张三', premium: 500, isCurrent: true });
  });

  test('详情层三违/巡查支持 ID 与姓名兜底匹配', async () => {
    mockTables({
      org: ORG,
      emp: EMP,
      violation: [
        { id: 1, violation_date: '2026-02-01', violation_type: '三违', violation_level: '严重', violator_name: '张三（未戴安全帽）' },
      ],
      inspection: [
        { id: 1, inspection_date: '2026-04-01', area_team: '长官镇', grid_level: '三级' },
        { id: 2, inspection_date: '2026-04-02', area_team: '长官镇', grid_level: '三级' },
      ],
      accidents: [],
      assessment: [],
      training: [],
      insurance: [],
    });

    const r = await svc.employeeDetail({ params: { id: '1001' }, query: { year: '2026' } });
    const d = r.body.data;
    expect(d.violations).toHaveLength(1);
    expect(d.violations[0]).toMatchObject({ violationType: '三违', violatorName: '张三（未戴安全帽）' });
    expect(d.inspections).toHaveLength(2);
  });

  test('员工不存在或未在岗返回业务码 1', async () => {
    mockTables({ org: ORG, emp: EMP });
    const r = await svc.employeeDetail({ params: { id: '9999' }, query: { year: '2026' } });
    expect(r.body.code).toBe(1);
    expect(r.body.message).toContain('员工不存在');
  });
});

describe('GET /centers/:centerId/towns/:townId/trend', () => {
  test('按年模式：逐月趋势表按有记录月份并集升序输出（风险静态台账不入月度）', async () => {
    mockTables({
      org: ORG,
      emp: EMP,
      accidents: [
        { id: 1, township: '长官镇三班', level: '一般', personnel_id: 1001, accident_date: '2026-03-15', _d: '2026-03-15' },
        { id: 2, township: '大曹镇三班', level: '一般', personnel_id: null, accident_date: '2026-03-16', _d: '2026-03-16' },
      ],
      violation: [
        { id: 1, area_team: '长官镇一班', violation_level: '严重', violator_id: 1001, violator_name: '张三', violation_date: '2026-02-05', _d: '2026-02-05' },
      ],
      inspection: [
        { id: 1, area_team: '长官镇', personnel_name: '张三', inspector_employee_id: 1001, inspection_date: '2026-04-10', _d: '2026-04-10' },
      ],
      assessment: [
        { id: 1, employee_id: 1001, township: '长官镇', score_total: 88, grade: '优秀', assessment_year: 2026, assessment_month: 3, _ay: 2026, _am: 3 },
      ],
      training: [
        { id: 1, employee_id: 1002, personnel_id: 1002, training_date: '2026-05-01', _d: '2026-05-01' },
      ],
      emergency: [
        { id: 1, township: '', name: '长官镇三班消防演练', result: 'pass', drill_date: '2026-06-01', _d: '2026-06-01' },
      ],
      demerit: [
        { id: 1, employee_id: 1001, employee_name: '张三', demerit_date: '2026-03-20', _d: '2026-03-20' },
      ],
      vehicle: [
        { id: 1, employee_id: 1002, inspection_date: '2026-07-01', _d: '2026-07-01' },
      ],
      dchk: [
        { id: 1, employee_id: 1001, inspection_date: '2026-08-01', _d: '2026-08-01' },
      ],
      dviol: [
        { id: 1, name: '张三', violation_time: '2026-09-10', _d: '2026-09-10' },
      ],
      dtviol: [
        { id: 1, name: '李四', violation_time: '2026-09-11', _d: '2026-09-11' },
      ],
      risk: [
        { id: 1, area: '长官镇', responsible_person_id: 1001, responsible_person: '张三' },
      ],
      hazard: [
        { id: 1, description: '长官镇转运站护栏破损', finder_id: null, responsible_id: null, hazard_date: '2026-10-05', _d: '2026-10-05' },
      ],
      transfer: [
        { id: 1, area_team: '长官镇', patrol_person: '张三', check_date: '2026-11-15', _d: '2026-11-15' },
      ],
    });

    const req = { params: { centerId: '1', townId: '11' }, query: { year: '2026' } };
    const r = await svc.townTrend(req);
    expect(r.body.code).toBe(0);
    const d = r.body.data;
    expect(d.scope).toEqual({ cumulative: false, year: 2026 });
    expect(d.org).toMatchObject({ id: 11, orgName: '长官镇作业中心', shortName: '长官镇' });
    expect(d.months).toEqual(['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    const rows = d.rows;
    expect(rows.accidents.count).toEqual([0, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(rows.accidents.weightedIndex).toEqual([0, 3, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(rows.violations).toEqual({ count: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0], serious: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    expect(rows.inspections.count).toEqual([0, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
    expect(rows.assessments).toEqual({ targetCount: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0], gradeGood: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0], avgScore: [0, 88, 0, 0, 0, 0, 0, 0, 0, 0] });
    expect(rows.trainings.recordCount).toEqual([0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
    expect(rows.emergencies.count).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0, 0]);
    expect(rows.drivers).toEqual({
      demeritCount: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
      vehicleCheckCount: [0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
      driverCheckCount: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      violationCount: [0, 0, 0, 0, 0, 0, 0, 2, 0, 0],
    });
    expect(rows.hazards.count).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1, 0]);
    expect(rows.transferStations.checkCount).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(rows.risks).toBeNull();

    // summary 与趋势同源（10 维累计；驾驶人员数为时点台账）
    const s = d.summary;
    expect(s.accidents).toEqual({ count: 1, major: 0, weightedIndex: 3 });
    expect(s.violations).toEqual({ count: 1, serious: 1 });
    expect(s.inspections.count).toBe(1);
    expect(s.assessments).toEqual({ targetCount: 1, avgScore: 88, gradeGood: 1 });
    expect(s.trainings).toEqual({ recordCount: 1, personCount: 1 });
    expect(s.emergencies).toEqual({ count: 1, passed: 1 });
    expect(s.drivers).toEqual({ personCount: 0, demeritCount: 1, vehicleCheckCount: 1, driverCheckCount: 1, violationCount: 2 });
    expect(s.risks).toEqual({ count: 1 });
    expect(s.hazards).toEqual({ count: 1 });
    expect(s.transferStations).toEqual({ checkCount: 1 });
  });

  test('累计模式：月份截断到当前月，未来脏数据不入趋势（summary 仍按全历史口径）', async () => {
    const cap = svc.currentMonthKey();
    mockTables({
      org: ORG,
      emp: EMP,
      accidents: [
        { id: 1, township: '长官镇三班', level: '一般', personnel_id: 1001, accident_date: '2026-01-15', _d: '2026-01-15' },
        { id: 2, township: '长官镇二班', level: '一般', personnel_id: 1001, accident_date: '2999-01-15', _d: '2999-01-15' },
      ],
      transfer: [
        { id: 1, area_team: '长官镇', patrol_person: '张三', check_date: '2026-02-10', _d: '2026-02-10' },
      ],
    });
    const r = await svc.townTrend({ params: { centerId: '1', townId: '11' }, query: {} });
    expect(r.body.code).toBe(0);
    const d = r.body.data;
    expect(d.scope).toEqual({ cumulative: true, year: null });
    expect(d.months).toEqual(['2026-01', '2026-02']);
    expect(d.months.every(m => m <= cap)).toBe(true);
    expect(d.rows.accidents.count).toEqual([1, 0]);
    expect(d.rows.transferStations.checkCount).toEqual([0, 1]);
    expect(d.summary.accidents.count).toBe(2);
    expect(d.summary.transferStations.checkCount).toBe(1);
  });

  test('校验：中心不存在 / 乡镇不存在 / 乡镇不属于该中心', async () => {
    mockTables({ org: ORG, emp: EMP });
    const r1 = await svc.townTrend({ params: { centerId: '999', townId: '11' }, query: { year: '2026' } });
    expect(r1.body.code).toBe(1);
    expect(r1.body.message).toContain('作业中心不存在');
    const r2 = await svc.townTrend({ params: { centerId: '1', townId: '999' }, query: { year: '2026' } });
    expect(r2.body.code).toBe(1);
    expect(r2.body.message).toContain('乡镇/公园不存在');
    const r3 = await svc.townTrend({ params: { centerId: '2', townId: '11' }, query: { year: '2026' } });
    expect(r3.body.code).toBe(1);
    expect(r3.body.message).toContain('乡镇不属于该作业中心');
  });
});

describe('GET /towns/:id/managers', () => {
  test('乡镇返回经理（岗位=乡镇作业中心经理；管理员不含）', async () => {
    mockTables({ org: ORG, emp: EMP });
    const r = await svc.townManagers({ params: { id: '11' } });
    expect(r.body.code).toBe(0);
    expect(r.body.data.roleLabel).toBe('乡镇作业中心经理');
    expect(r.body.data.managers).toEqual([
      { employeeId: 1001, employeeCode: 'E1001', name: '张三', positionName: '乡镇作业中心经理' },
    ]);
  });

  test('公园返回管理员', async () => {
    mockTables({ org: ORG, emp: EMP });
    const r = await svc.townManagers({ params: { id: '31' } });
    expect(r.body.code).toBe(0);
    expect(r.body.data.roleLabel).toBe('管理员');
    expect(r.body.data.managers).toEqual([
      { employeeId: 2001, employeeCode: 'E2001', name: '孙小霞', positionName: '管理员' },
    ]);
  });

  test('乡镇不存在返回业务码 1', async () => {
    mockTables({ org: ORG, emp: EMP });
    const r = await svc.townManagers({ params: { id: '999' } });
    expect(r.body.code).toBe(1);
    expect(r.body.message).toContain('乡镇/公园不存在');
  });
});

describe('GET /managers/:employeeId/overview', () => {
  test('经理双口径：辖区=组织全量，个人=本人归因（ID + 全局唯一姓名兜底）', async () => {
    mockTables({
      org: ORG,
      emp: EMP,
      accidents: [
        { id: 1, township: '长官镇三班', level: '一般', personnel_id: 1001, accident_date: '2026-03-01', _d: '2026-03-01' },
        { id: 2, township: '长官镇二班', level: '一般', personnel_id: 1002, accident_date: '2026-03-02', _d: '2026-03-02' },
      ],
      violation: [
        { id: 1, area_team: '长官镇一班', violation_level: '严重', violator_id: 1001, violator_name: '张三', violation_date: '2026-02-01', _d: '2026-02-01' },
        { id: 2, area_team: '长官镇二班', violation_level: '一般', violator_id: null, violator_name: '张三（未戴安全帽）', violation_date: '2026-02-02', _d: '2026-02-02' },
        { id: 3, area_team: '长官镇三班', violation_level: '一般', violator_id: 1002, violator_name: '李四', violation_date: '2026-02-03', _d: '2026-02-03' },
      ],
      inspection: [
        { id: 1, area_team: '长官镇', personnel_name: '张三', inspector_employee_id: 1001, inspection_date: '2026-04-01', _d: '2026-04-01' },
        { id: 2, area_team: '长官镇', personnel_name: '李四', inspector_employee_id: 1002, inspection_date: '2026-04-02', _d: '2026-04-02' },
      ],
      assessment: [
        { id: 1, employee_id: 1001, township: '长官镇', score_total: 88, grade: '优秀', assessment_year: 2026, assessment_month: 3, _ay: 2026, _am: 3 },
        { id: 2, employee_id: 1002, township: '长官镇', score_total: 90, grade: '良好', assessment_year: 2026, assessment_month: 3, _ay: 2026, _am: 3 },
      ],
      training: [
        { id: 1, employee_id: 1001, personnel_id: 1001, training_date: '2026-05-01', _d: '2026-05-01' },
        { id: 2, employee_id: 1002, personnel_id: 1002, training_date: '2026-05-02', _d: '2026-05-02' },
      ],
      emergency: [
        { id: 1, township: '', name: '长官镇三班消防演练', result: 'pass', drill_date: '2026-06-01', _d: '2026-06-01' },
      ],
      demerit: [
        { id: 1, employee_id: 1001, employee_name: '张三', demerit_date: '2026-03-10', _d: '2026-03-10' },
      ],
      vehicle: [
        { id: 1, employee_id: 1001, inspection_date: '2026-07-01', _d: '2026-07-01' },
      ],
      dchk: [
        { id: 1, employee_id: 1002, inspection_date: '2026-08-01', _d: '2026-08-01' },
      ],
      dviol: [
        { id: 1, name: '张三', violation_time: '2026-09-01', _d: '2026-09-01' },
      ],
      dtviol: [
        { id: 1, name: '李四', violation_time: '2026-09-02', _d: '2026-09-02' },
      ],
      risk: [
        { id: 1, area: '长官镇', responsible_person_id: 1001, responsible_person: '张三' },
      ],
      hazard: [
        { id: 1, description: '长官镇转运站护栏破损', finder_id: 1001, responsible_id: null, hazard_date: '2026-10-01', _d: '2026-10-01' },
        { id: 2, description: '长官镇广场地砖破损', finder_id: 1002, responsible_id: null, hazard_date: '2026-10-02', _d: '2026-10-02' },
      ],
      transfer: [
        { id: 1, area_team: '长官镇', patrol_person: '张三', check_date: '2026-11-15', _d: '2026-11-15' },
      ],
    });

    const r = await svc.managerOverview({ params: { employeeId: '1001' }, query: {} });
    expect(r.body.code).toBe(0);
    const d = r.body.data;
    expect(d.employee).toMatchObject({ employeeId: 1001, name: '张三', positionName: '乡镇作业中心经理', orgType: 'town_center' });
    expect(d.scope).toEqual({ cumulative: true, year: null });

    // 辖区 = 组织全量（与 fillSummaries 同源）
    expect(d.jurisdiction.accidents).toEqual({ count: 2, major: 0, weightedIndex: 6 });
    expect(d.jurisdiction.violations).toEqual({ count: 3, serious: 1 });
    expect(d.jurisdiction.inspections.count).toBe(2);
    expect(d.jurisdiction.assessments).toEqual({ targetCount: 2, avgScore: 89, gradeGood: 2 });
    expect(d.jurisdiction.trainings).toEqual({ recordCount: 2, personCount: 2 });
    expect(d.jurisdiction.emergencies).toEqual({ count: 1, passed: 1 });
    expect(d.jurisdiction.drivers).toEqual({ personCount: 0, demeritCount: 1, vehicleCheckCount: 1, driverCheckCount: 1, violationCount: 2 });
    expect(d.jurisdiction.risks).toEqual({ count: 1 });
    expect(d.jurisdiction.hazards).toEqual({ count: 2 });
    expect(d.jurisdiction.transferStations).toEqual({ checkCount: 1 });

    // 个人 = 本人归因（演练表无人员字段恒 0）
    expect(d.personal.accidents).toEqual({ count: 1, major: 0, weightedIndex: 3 });
    expect(d.personal.violations).toEqual({ count: 2, serious: 1 });
    expect(d.personal.inspections.count).toBe(1);
    expect(d.personal.assessments).toEqual({ targetCount: 1, avgScore: 88, gradeGood: 1 });
    expect(d.personal.trainings).toEqual({ recordCount: 1, personCount: 1 });
    expect(d.personal.emergencies).toEqual({ count: 0, passed: 0 });
    expect(d.personal.drivers).toEqual({ personCount: 0, demeritCount: 1, vehicleCheckCount: 1, driverCheckCount: 0, violationCount: 1 });
    expect(d.personal.risks).toEqual({ count: 1 });
    expect(d.personal.hazards).toEqual({ count: 1 });
    expect(d.personal.transferStations).toEqual({ checkCount: 1 });
  });

  test('校验：员工不存在 / 非经理岗位 / 辖区不匹配', async () => {
    mockTables({ org: ORG, emp: EMP });
    const r1 = await svc.managerOverview({ params: { employeeId: '9999' }, query: {} });
    expect(r1.body.code).toBe(1);
    expect(r1.body.message).toContain('员工不存在');
    const r2 = await svc.managerOverview({ params: { employeeId: '1004' }, query: {} });
    expect(r2.body.code).toBe(1);
    expect(r2.body.message).toContain('非乡镇经理/公园管理员');
    const r3 = await svc.managerOverview({ params: { employeeId: '1001' }, query: { townId: '12' } });
    expect(r3.body.code).toBe(1);
    expect(r3.body.message).toContain('员工与辖区不匹配');
  });
});

describe('GET /managers/:employeeId/month-detail', () => {
  test('单月明细：辖区与个人按 YYYY-MM 收窄（超月记录排除）', async () => {
    mockTables({
      org: ORG,
      emp: EMP,
      accidents: [
        { id: 1, township: '长官镇三班', level: '一般', personnel_id: 1001, accident_date: '2026-03-15', _d: '2026-03-15' },
        { id: 2, township: '长官镇二班', level: '一般', personnel_id: 1002, accident_date: '2026-03-16', _d: '2026-03-16' },
        { id: 3, township: '长官镇一班', level: '一般', personnel_id: 1001, accident_date: '2026-04-15', _d: '2026-04-15' },
      ],
      violation: [
        { id: 1, area_team: '长官镇一班', violation_level: '严重', violator_id: 1001, violator_name: '张三', violation_date: '2026-03-02', _d: '2026-03-02' },
      ],
      assessment: [
        { id: 1, employee_id: 1001, township: '长官镇', score_total: 88, grade: '优秀', assessment_year: 2026, assessment_month: 3, _ay: 2026, _am: 3 },
      ],
      training: [
        { id: 1, employee_id: 1001, personnel_id: 1001, training_date: '2026-03-10', _d: '2026-03-10' },
      ],
    });

    const r = await svc.managerMonthDetail({ params: { employeeId: '1001' }, query: { month: '2026-03' } });
    expect(r.body.code).toBe(0);
    const d = r.body.data;
    expect(d.month).toBe('2026-03');
    expect(d.jurisdiction.accidents).toEqual({ count: 2, major: 0, weightedIndex: 6 });
    expect(d.jurisdiction.violations).toEqual({ count: 1, serious: 1 });
    expect(d.jurisdiction.assessments).toEqual({ targetCount: 1, gradeGood: 1, avgScore: 88 });
    expect(d.jurisdiction.trainings).toEqual({ recordCount: 1, personCount: 1 });
    expect(d.jurisdiction.inspections.count).toBe(0);
    expect(d.personal.accidents).toEqual({ count: 1, major: 0, weightedIndex: 3 });
    expect(d.personal.violations).toEqual({ count: 1, serious: 1 });
    expect(d.personal.assessments).toEqual({ targetCount: 1, gradeGood: 1, avgScore: 88 });
    expect(d.personal.trainings).toEqual({ recordCount: 1, personCount: 1 });
  });

  test('校验：月份格式 / 超出当前月 / 员工不存在 / 非经理岗位', async () => {
    mockTables({ org: ORG, emp: EMP });
    const r1 = await svc.managerMonthDetail({ params: { employeeId: '1001' }, query: { month: '2026-3' } });
    expect(r1.body.code).toBe(1);
    expect(r1.body.message).toContain('月份格式');
    const r2 = await svc.managerMonthDetail({ params: { employeeId: '1001' }, query: { month: '2099-01' } });
    expect(r2.body.code).toBe(1);
    expect(r2.body.message).toContain('月份超出当前时间');
    const r3 = await svc.managerMonthDetail({ params: { employeeId: '9999' }, query: { month: '2026-03' } });
    expect(r3.body.code).toBe(1);
    expect(r3.body.message).toContain('员工不存在');
    const r4 = await svc.managerMonthDetail({ params: { employeeId: '1004' }, query: { month: '2026-03' } });
    expect(r4.body.code).toBe(1);
    expect(r4.body.message).toContain('非乡镇经理/公园管理员');
  });
});

describe('GET /dim-records（维度明细下钻）', () => {
  test('org 口径：按维度返回乡镇明细记录，带列定义与口径标签', async () => {
    mockTables({
      org: ORG,
      emp: EMP,
      violation: [
        { id: 1, area_team: '长官镇一班', violation_level: '严重', violation_type: '三违', violator_id: 1001, violator_name: '张三', violation_date: '2026-02-05', _d: '2026-02-05' },
        { id: 2, area_team: '长官镇二班', violation_level: '一般', violation_type: '其他', violator_id: null, violator_name: '李四', violation_date: '2026-03-08', _d: '2026-03-08' },
        { id: 3, area_team: '大曹镇三班', violation_level: '一般', violation_type: '三违', violator_id: null, violator_name: '王五', violation_date: '2026-03-09', _d: '2026-03-09' },
      ],
    });

    const r = await svc.dimRecords({ query: { scope: 'org', orgId: '11', dim: 'violations', year: '2026' } });
    expect(r.body.code).toBe(0);
    const d = r.body.data;
    expect(d.title).toBe('三违');
    expect(d.scope).toBe('org');
    expect(d.scopeLabel).toBe('长官镇作业中心');
    expect(d.year).toBe(2026);
    expect(d.month).toBeNull();
    expect(d.count).toBe(2);
    expect(d.fields.map(f => f.k)).toEqual(['violation_date', 'violation_type', 'violation_level', 'violator_name']);
    // 日期倒序
    expect(d.records.map(x => x.violation_date)).toEqual(['2026-03-08', '2026-02-05']);
    expect(d.records[1]).toMatchObject({ violation_type: '三违', violation_level: '严重', violator_name: '张三' });
  });

  test('org 口径 + month：按 YYYY-MM 收窄且日期格式化', async () => {
    mockTables({
      org: ORG,
      emp: EMP,
      accidents: [
        { id: 1, no: 'SG-2026-001', description: '道路作业事故', township: '长官镇三班', level: '一般', personnel_id: 1001, accident_date: '2026-03-15', _d: '2026-03-15' },
        { id: 2, no: 'SG-2026-002', description: '转运站事故', township: '长官镇二班', level: '重大', personnel_id: 1002, accident_date: '2026-04-10', _d: '2026-04-10' },
      ],
    });

    const r = await svc.dimRecords({ query: { scope: 'org', orgId: '11', dim: 'accidents', month: '2026-03' } });
    expect(r.body.code).toBe(0);
    const d = r.body.data;
    expect(d.month).toBe('2026-03');
    expect(d.count).toBe(1);
    expect(d.records[0]).toMatchObject({ no: 'SG-2026-001', description: '道路作业事故', level: '一般', accident_date: '2026-03-15' });
    expect(d.fields.map(f => f.k)).toContain('accident_date');
  });

  test('personal 口径：经理本人归因（ID 反推 + 全局唯一姓名兜底）', async () => {
    mockTables({
      org: ORG,
      emp: EMP,
      violation: [
        { id: 1, area_team: '长官镇一班', violation_level: '严重', violation_type: '三违', violator_id: 1001, violator_name: '张三', violation_date: '2026-02-05', _d: '2026-02-05' },
        { id: 2, area_team: '长官镇二班', violation_level: '一般', violation_type: '三违', violator_id: null, violator_name: '张三（未戴安全帽）', violation_date: '2026-02-06', _d: '2026-02-06' },
        { id: 3, area_team: '长官镇三班', violation_level: '一般', violation_type: '三违', violator_id: 1002, violator_name: '李四', violation_date: '2026-02-07', _d: '2026-02-07' },
      ],
    });

    const r = await svc.dimRecords({ query: { scope: 'personal', employeeId: '1001', dim: 'violations', year: '2026' } });
    expect(r.body.code).toBe(0);
    const d = r.body.data;
    expect(d.scope).toBe('personal');
    expect(d.scopeLabel).toBe('张三');
    expect(d.count).toBe(2);
    expect(d.records.map(x => x.violator_name)).toEqual(['张三（未戴安全帽）', '张三']);
  });

  test('drivers 组合口径：多源合并带类型列与人员列，按日期倒序', async () => {
    mockTables({
      org: ORG,
      emp: EMP,
      demerit: [
        { id: 1, employee_id: 1001, employee_name: '张三', demerit_date: '2026-03-10', _d: '2026-03-10' },
      ],
      vehicle: [
        { id: 1, employee_id: 1001, employee_name: '张三', inspection_date: '2026-07-01', _d: '2026-07-01' },
      ],
      dviol: [
        { id: 1, name: '张三', violation_type: '违反标志标线', violation_desc: '违反禁止标线指示', violation_time: '2026-09-01', _d: '2026-09-01' },
      ],
      dchk: [
        { id: 1, employee_id: 1002, inspection_date: '2026-08-01', _d: '2026-08-01' },
      ],
    });

    const r = await svc.dimRecords({ query: { scope: 'personal', employeeId: '1001', dim: 'drivers', year: '2026' } });
    expect(r.body.code).toBe(0);
    const d = r.body.data;
    expect(d.title).toBe('驾驶员');
    expect(d.count).toBe(3);
    // 日期倒序：违章(09-01) → 车辆检查(07-01) → 记分(03-10)
    expect(d.records.map(x => x._type)).toEqual(['驾驶员违章', '车辆检查', '驾驶证记分']);
    expect(d.records[0]).toMatchObject({ _person: '张三', _d: '2026-09-01', _reason: '违反禁止标线指示' });
    expect(d.records[1]).toMatchObject({ _person: '张三', _d: '2026-07-01' });
    expect(d.records[2]).toMatchObject({ _person: '张三', _d: '2026-03-10' });
    // 违章事由列位于类型与日期之间
    expect(d.fields.map(f => f.k)).toEqual(['_type', '_reason', '_d', '_person']);
  });

  test('drivers 违章事由兜底：violation_desc 为空时回退 violation_type', async () => {
    mockTables({
      org: ORG,
      emp: EMP,
      dviol: [{ id: 1, name: '张三', violation_type: '违规停车', violation_time: '2026-09-03', _d: '2026-09-03' }],
    });
    const r = await svc.dimRecords({ query: { scope: 'personal', employeeId: '1001', dim: 'drivers', year: '2026' } });
    expect(r.body.code).toBe(0);
    const d = r.body.data;
    expect(d.count).toBe(1);
    expect(d.records[0]).toMatchObject({ _type: '驾驶员违章', _reason: '违规停车' });
  });

  test('考核维度：月份键与周期/姓名/得分字段', async () => {
    mockTables({
      org: ORG,
      emp: EMP,
      assessment: [
        { id: 1, employee_id: 1001, township: '长官镇', score_total: 88, grade: '优秀', rank_township: '第一名', cycle_name: '2026年3月考核', assessment_year: 2026, assessment_month: 3, _ay: 2026, _am: 3, employee_name: '张三' },
        { id: 2, employee_id: 1002, township: '长官镇', score_total: 90, grade: '良好', rank_township: '第二名', cycle_name: '2026年4月考核', assessment_year: 2026, assessment_month: 4, _ay: 2026, _am: 4, employee_name: '李四' },
      ],
    });

    const r = await svc.dimRecords({ query: { scope: 'org', orgId: '11', dim: 'assessments', year: '2026' } });
    expect(r.body.code).toBe(0);
    const d = r.body.data;
    expect(d.count).toBe(2);
    expect(d.records.map(x => x._month)).toEqual(['2026-04', '2026-03']);
    expect(d.records[1]).toMatchObject({ employee_name: '张三', score_total: 88, grade: '优秀', rank_township: '第一名', cycle_name: '2026年3月考核' });
  });

  test('日期字段还原：聚合查询仅返回 _d 别名时还原为原字段并格式化', async () => {
    // 模拟真实 SQL（2026-09-28 展示字段扩展）仅返回 _d（violation_date AS _d），无原字段名
    mockTables({
      org: ORG,
      emp: EMP,
      violation: [
        { id: 1, area_team: '长官镇一班', violation_level: '严重', violation_type: '三违', violator_id: 1001, violator_name: '张三', _d: '2026-02-05T16:00:00.000Z', _m: '2026-02' },
        { id: 2, area_team: '长官镇二班', violation_level: '一般', violation_type: '其他', violator_id: null, violator_name: '李四', _d: '2026-03-08T16:00:00.000Z', _m: '2026-03' },
      ],
    });

    const r = await svc.dimRecords({ query: { scope: 'org', orgId: '11', dim: 'violations', year: '2026' } });
    expect(r.body.code).toBe(0);
    const d = r.body.data;
    expect(d.count).toBe(2);
    // 日期由 _d 还原为 violation_date 且格式化为 YYYY-MM-DD（ISO 前 10 位），按日期倒序
    expect(d.records.map(x => x.violation_date)).toEqual(['2026-03-08', '2026-02-05']);
    expect(d.records[0]).toMatchObject({ violation_date: '2026-03-08', violation_type: '其他', violator_name: '李四' });
  });

  test('sub 子指标过滤：serious 只返回严重三违并带 subLabel', async () => {
    mockTables({
      org: ORG,
      emp: EMP,
      violation: [
        { id: 1, area_team: '长官镇一班', violation_level: '严重', violation_type: '三违', violator_id: 1001, violator_name: '张三', violation_date: '2026-02-05', _d: '2026-02-05' },
        { id: 2, area_team: '长官镇二班', violation_level: '一般', violation_type: '其他', violator_id: null, violator_name: '李四', violation_date: '2026-03-08', _d: '2026-03-08' },
        { id: 3, area_team: '长官镇三班', violation_level: '严重', violation_type: '三违', violator_id: 1002, violator_name: '王五', violation_date: '2026-04-01', _d: '2026-04-01' },
      ],
    });

    const r = await svc.dimRecords({ query: { scope: 'org', orgId: '11', dim: 'violations', sub: 'serious', year: '2026' } });
    expect(r.body.code).toBe(0);
    const d = r.body.data;
    expect(d.sub).toBe('serious');
    expect(d.subLabel).toBe('严重三违');
    expect(d.count).toBe(2);
    expect(d.records.map(x => x.violation_level)).toEqual(['严重', '严重']);
    expect(d.records.map(x => x.violator_name)).toEqual(['王五', '张三']);
  });

  test('sub 子指标过滤：accidents major 按等级谓词过滤（对齐汇总口径）', async () => {
    mockTables({
      org: ORG,
      emp: EMP,
      accidents: [
        { id: 1, no: 'SG-2026-001', description: '道路作业事故', township: '长官镇三班', level: '一般', personnel_id: 1001, accident_date: '2026-03-15', _d: '2026-03-15' },
        { id: 2, no: 'SG-2026-002', description: '转运站事故', township: '长官镇二班', level: '重大', personnel_id: 1002, accident_date: '2026-04-10', _d: '2026-04-10' },
        { id: 3, no: 'SG-2026-003', description: '车辆事故', township: '长官镇一班', level: '特别重大', personnel_id: 1001, accident_date: '2026-05-01', _d: '2026-05-01' },
      ],
    });

    const r = await svc.dimRecords({ query: { scope: 'org', orgId: '11', dim: 'accidents', sub: 'major', year: '2026' } });
    expect(r.body.code).toBe(0);
    const d = r.body.data;
    expect(d.subLabel).toBe('重大事故');
    expect(d.count).toBe(2);
    expect(d.records.map(x => x.level)).toEqual(['特别重大', '重大']);
  });

  test('sub 子指标过滤：drivers violationCount 按 sources 限定（违章+三违，不含记分/检查）', async () => {
    mockTables({
      org: ORG,
      emp: EMP,
      demerit: [
        { id: 1, employee_id: 1001, employee_name: '张三', demerit_date: '2026-03-10', _d: '2026-03-10' },
      ],
      vehicle: [
        { id: 1, employee_id: 1001, employee_name: '张三', inspection_date: '2026-07-01', _d: '2026-07-01' },
      ],
      dviol: [
        { id: 1, name: '张三', violation_time: '2026-09-01', _d: '2026-09-01' },
      ],
      dtviol: [
        { id: 1, name: '张三', violation_time: '2026-08-15', _d: '2026-08-15' },
      ],
    });

    const r = await svc.dimRecords({ query: { scope: 'personal', employeeId: '1001', dim: 'drivers', sub: 'violationCount', year: '2026' } });
    expect(r.body.code).toBe(0);
    const d = r.body.data;
    expect(d.subLabel).toBe('驾驶员违章');
    expect(d.count).toBe(2);
    // 日期倒序：违章(09-01) → 三违(08-15)
    expect(d.records.map(x => x._type)).toEqual(['驾驶员违章', '驾驶员三违']);
    expect(d.records.map(x => x._d)).toEqual(['2026-09-01', '2026-08-15']);
  });

  test('sub 子指标过滤：assessments gradeGood 按等级谓词过滤', async () => {
    mockTables({
      org: ORG,
      emp: EMP,
      assessment: [
        { id: 1, employee_id: 1001, township: '长官镇', score_total: 88, grade: '优秀', rank_township: '第一名', cycle_name: '2026年3月考核', assessment_year: 2026, assessment_month: 3, _ay: 2026, _am: 3, employee_name: '张三' },
        { id: 2, employee_id: 1002, township: '长官镇', score_total: 90, grade: '良好', rank_township: '第二名', cycle_name: '2026年4月考核', assessment_year: 2026, assessment_month: 4, _ay: 2026, _am: 4, employee_name: '李四' },
        { id: 3, employee_id: 1003, township: '长官镇', score_total: 70, grade: '合格', rank_township: '第三名', cycle_name: '2026年5月考核', assessment_year: 2026, assessment_month: 5, _ay: 2026, _am: 5, employee_name: '王五' },
      ],
    });

    const r = await svc.dimRecords({ query: { scope: 'org', orgId: '11', dim: 'assessments', sub: 'gradeGood', year: '2026' } });
    expect(r.body.code).toBe(0);
    const d = r.body.data;
    expect(d.subLabel).toBe('考核优良');
    expect(d.count).toBe(2);
    expect(d.records.map(x => x.grade)).toEqual(['良好', '优秀']);
  });

  test('校验：非法 scope / 维度 / 缺失参数 / 月份格式', async () => {
    mockTables({ org: ORG, emp: EMP });
    const r1 = await svc.dimRecords({ query: { scope: 'x', orgId: '11', dim: 'violations' } });
    expect(r1.body.code).toBe(1);
    expect(r1.body.message).toContain('scope');
    const r2 = await svc.dimRecords({ query: { scope: 'org', orgId: '11', dim: 'unknown' } });
    expect(r2.body.code).toBe(1);
    expect(r2.body.message).toContain('不支持的维度');
    const r3 = await svc.dimRecords({ query: { scope: 'org', dim: 'violations' } });
    expect(r3.body.code).toBe(1);
    expect(r3.body.message).toContain('orgId');
    const r4 = await svc.dimRecords({ query: { scope: 'personal', dim: 'violations' } });
    expect(r4.body.code).toBe(1);
    expect(r4.body.message).toContain('employeeId');
    const r5 = await svc.dimRecords({ query: { scope: 'org', orgId: '999', dim: 'violations' } });
    expect(r5.body.code).toBe(1);
    expect(r5.body.message).toContain('组织不存在');
    const r6 = await svc.dimRecords({ query: { scope: 'personal', employeeId: '9999', dim: 'violations' } });
    expect(r6.body.code).toBe(1);
    expect(r6.body.message).toContain('员工不存在');
    const r7 = await svc.dimRecords({ query: { scope: 'org', orgId: '11', dim: 'violations', month: '2026-3' } });
    expect(r7.body.code).toBe(1);
    expect(r7.body.message).toContain('月份格式');
    const r8 = await svc.dimRecords({ query: { scope: 'org', orgId: '11', dim: 'violations', sub: 'nope' } });
    expect(r8.body.code).toBe(1);
    expect(r8.body.message).toContain('不支持的子指标');
    const r9 = await svc.dimRecords({ query: { scope: 'org', orgId: '11', dim: 'risks', sub: 'count' } });
    expect(r9.body.code).toBe(1);
    expect(r9.body.message).toContain('不支持的子指标');
  });

  test('dateSpan：累计口径返回明细数据时间跨度（from~to）', async () => {
    mockTables({
      org: ORG,
      emp: EMP,
      dviol: [
        { id: 1, name: '张三', violation_time: '2021-12-11 09:55:00', _d: '2021-12-11 09:55:00' },
        { id: 2, name: '张三', violation_time: '2023-09-19 10:36:00', _d: '2023-09-19 10:36:00' },
        { id: 3, name: '张三', violation_time: '2022-06-04 14:20:00', _d: '2022-06-04 14:20:00' },
      ],
    });

    // 累计（无 year）→ 全历史 + dateSpan 覆盖最早~最晚
    const r = await svc.dimRecords({ query: { scope: 'org', orgId: '11', dim: 'drivers' } });
    expect(r.body.code).toBe(0);
    const d = r.body.data;
    expect(d.year).toBeNull();
    expect(d.dateSpan).toEqual({ from: '2021-12-11', to: '2023-09-19' });
    expect(d.count).toBe(3);
    expect(d.records.map(x => x._d)).toEqual(['2023-09-19', '2022-06-04', '2021-12-11']);

    // 指定年份 → dateSpan 收窄到该年（mock 无 WHERE 过滤，重新 mock 模拟当年数据）
    mockTables({
      org: ORG,
      emp: EMP,
      dviol: [
        { id: 2, name: '张三', violation_time: '2022-06-04 14:20:00', _d: '2022-06-04 14:20:00' },
      ],
    });
    const r2 = await svc.dimRecords({ query: { scope: 'org', orgId: '11', dim: 'drivers', year: '2022' } });
    expect(r2.body.code).toBe(0);
    expect(r2.body.data.year).toBe(2022);
    expect(r2.body.data.dateSpan).toEqual({ from: '2022-06-04', to: '2022-06-04' });
  });

  test('dateSpan：无日期维度（风险台账）返回 null', async () => {
    mockTables({ org: ORG, emp: EMP });
    const r = await svc.dimRecords({ query: { scope: 'org', orgId: '11', dim: 'risks' } });
    expect(r.body.code).toBe(0);
    expect(r.body.data.dateSpan).toBeNull();
  });

  test('三违/违章弹窗列宽对齐：violations 类型列 w=110 与 drivers 类型列一致', async () => {
    mockTables({ org: ORG, emp: EMP });
    const rv = await svc.dimRecords({ query: { scope: 'org', orgId: '11', dim: 'violations' } });
    expect(rv.body.code).toBe(0);
    const typeField = rv.body.data.fields.find(f => f.k === 'violation_type');
    const dateField = rv.body.data.fields.find(f => f.k === 'violation_date');
    expect(typeField.w).toBe(110);
    expect(dateField.w).toBe(110);

    const rd = await svc.dimRecords({ query: { scope: 'org', orgId: '11', dim: 'drivers' } });
    expect(rd.body.code).toBe(0);
    const dType = rd.body.data.fields.find(f => f.k === '_type');
    const dDate = rd.body.data.fields.find(f => f.k === '_d');
    expect(dType.w).toBe(110);
    expect(dDate.w).toBe(110);
  });
});
